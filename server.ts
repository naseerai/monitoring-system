import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { NodeSSH } from 'node-ssh';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { encryptCredential, decryptCredential, isEncrypted } from './src/utils/crypto.ts';

// --------------------------------------------------
// Input Sanitization Helpers
// --------------------------------------------------

/** Allowed characters for node display names: alphanumeric, spaces, hyphens, dots, underscores */
const SAFE_NAME_RE = /^[a-zA-Z0-9 ._\-]{1,64}$/;

/** IPv4, IPv6, or hostname — no shell metacharacters */
const SAFE_IP_RE = /^[a-zA-Z0-9.:\-]{1,253}$/;

/** Shell injection characters that must never appear in any free-text field used in SSH commands */
const SHELL_INJECTION_RE = /[;&|`$(){}<!>\\]/;

function assertSafeName(value: string, fieldName = 'displayName'): void {
  if (!SAFE_NAME_RE.test(value)) {
    throw new Error(`Invalid ${fieldName}: only alphanumeric characters, spaces, hyphens, dots, and underscores are allowed (max 64 chars).`);
  }
}

function assertSafeIp(value: string): void {
  if (!SAFE_IP_RE.test(value)) {
    throw new Error('Invalid ipAddress: contains disallowed characters.');
  }
}

function assertNoShellChars(value: string, fieldName: string): void {
  if (SHELL_INJECTION_RE.test(value)) {
    throw new Error(`Invalid ${fieldName}: shell metacharacters are not permitted.`);
  }
}

// --------------------------------------------------
// Supabase admin client (service role — backend only)
// --------------------------------------------------
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --------------------------------------------------
// Paths
// --------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// nodes.json removed — Supabase is the single source of truth

// --------------------------------------------------
// Types
// --------------------------------------------------

/**
 * Parse `iostat -d 1 2` output.
 * Takes the LAST sample block (the 1-second interval, not the since-boot summary).
 * Sums kB_read/s + kB_wrtn/s across all devices and converts to MB/s.
 * Returns {0,0} on any parse/missing-tool failure.
 */
function parseIostat(raw: string): { diskRead: number; diskWrite: number } {
  try {
    if (!raw || !raw.trim()) return { diskRead: 0, diskWrite: 0 };

    // Split by blank lines to get report blocks
    const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

    // Use the LAST block (the 1-second sample, not since-boot)
    const lastBlock = blocks[blocks.length - 1] ?? '';
    const lines = lastBlock.split('\n').map(l => l.trim()).filter(Boolean);

    let readKB  = 0;
    let writeKB = 0;

    // Header line: Device  tps  kB_read/s  kB_wrtn/s ...
    const headerIdx = lines.findIndex(l => /kB_read/i.test(l));
    if (headerIdx === -1) return { diskRead: 0, diskWrite: 0 };

    const headers  = lines[headerIdx].split(/\s+/);
    const readIdx  = headers.findIndex(h => /kB_read\/s/i.test(h));
    const writeIdx = headers.findIndex(h => /kB_wrtn\/s/i.test(h));
    if (readIdx === -1 || writeIdx === -1) return { diskRead: 0, diskWrite: 0 };

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = lines[i].split(/\s+/);
      if (cols.length <= Math.max(readIdx, writeIdx)) continue;
      readKB  += parseFloat(cols[readIdx]  || '0') || 0;
      writeKB += parseFloat(cols[writeIdx] || '0') || 0;
    }

    return { diskRead: readKB / 1024, diskWrite: writeKB / 1024 };
  } catch {
    return { diskRead: 0, diskWrite: 0 };
  }
}

/**
 * Parse a single snapshot of /proc/net/dev.
 * Returns a map of iface → { rx: bytes, tx: bytes }.
 */
function parseNetDev(raw: string): Map<string, { rx: number; tx: number }> {
  const map = new Map<string, { rx: number; tx: number }>();
  for (const line of raw.split('\n').map(l => l.trim())) {
    const m = line.match(/^(\S+):\s+(\d+)(?:\s+\d+){7}\s+(\d+)/);
    if (!m) continue;
    const iface = m[1].replace(/:$/, '');
    if (iface === 'lo') continue;  // skip loopback
    map.set(iface, { rx: Number(m[2]), tx: Number(m[3]) });
  }
  return map;
}

/** Calculate net throughput (kB/s) between two /proc/net/dev snapshots 1 second apart. */
function calcNetThroughput(
  before: Map<string, { rx: number; tx: number }>,
  after:  Map<string, { rx: number; tx: number }>,
  elapsedMs: number
): { netIn: number; netOut: number } {
  let rxBytes = 0;
  let txBytes = 0;
  for (const [iface, afterVal] of after) {
    const beforeVal = before.get(iface);
    if (!beforeVal) continue;
    rxBytes += Math.max(0, afterVal.rx - beforeVal.rx);
    txBytes += Math.max(0, afterVal.tx - beforeVal.tx);
  }
  const elapsed = elapsedMs / 1000 || 1;
  return {
    netIn:  (rxBytes / elapsed) / 1024,   // kB/s
    netOut: (txBytes / elapsed) / 1024,
  };
}

export interface DockerContainer {
  id:     string;
  name:   string;
  image:  string;
  status: string;
  ports:  string;
  cpu:    string;
  mem:    string;
}

/**
 * Parse `docker ps --all --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"`
 * Returns a map keyed by short container ID (12 chars).
 */
function parseDockerPsPipe(raw: string): Map<string, DockerContainer> {
  const map = new Map<string, DockerContainer>();
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    const parts = line.split('|');
    if (parts.length < 4) continue;
    const id     = (parts[0] ?? '').trim().slice(0, 12);
    const name   = (parts[1] ?? '').trim() || '-';
    const image  = (parts[2] ?? '').trim() || '-';
    const status = (parts[3] ?? '').trim() || '-';
    const ports  = (parts[4] ?? '').trim() || '-';
    if (!id) continue;
    map.set(id, { id, name, image, status, ports, cpu: '-', mem: '-' });
  }
  return map;
}

/**
 * Parse `docker stats --no-stream --format "{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}"`
 * Merges cpu/mem into the ps map by short ID.
 */
function mergeDockerStats(raw: string, psMap: Map<string, DockerContainer>): DockerContainer[] {
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const id  = (parts[0] ?? '').trim().slice(0, 12);
    const cpu = (parts[1] ?? '').trim() || '-';
    const mem = (parts[2] ?? '').trim() || '-';
    if (!id) continue;
    const entry = psMap.get(id);
    if (entry) { entry.cpu = cpu; entry.mem = mem; }
  }
  return Array.from(psMap.values());
}

function runSSHCommand(node: any, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    let output = '';
    let errorOutput = '';
    let settled = false;
    const isRebootCommand =
      command.includes('reboot') || command.includes('shutdown -r');

    const doneResolve = (msg: string) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch {}
      resolve(msg);
    };

    const doneReject = (err: any) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          return doneReject(err);
        }

        stream.on('close', (code: number | null) => {
          if (isRebootCommand) {
            return doneResolve('Reboot command sent');
          }

          if (code === 0) {
            return doneResolve(output || 'Command executed');
          }

          return doneReject(
            new Error(errorOutput || `Command failed with code ${code}`)
          );
        });

        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });
      });
    });

    conn.on('error', (err: any) => {
      if (isRebootCommand && (err?.code === 'ECONNRESET' || err?.level === 'client-socket')) {
        return doneResolve('Reboot command sent');
      }
      return doneReject(err);
    });

    conn.on('end', () => {
      if (isRebootCommand) {
        return doneResolve('Reboot command sent');
      }
    });

    conn.on('close', () => {
      if (isRebootCommand) {
        return doneResolve('Reboot command sent');
      }
    });

    conn.connect({
      host: node.ipAddress,
      port: node.port || 22,
      username: node.username,
      ...(node.authType === 'privateKey'
        ? { privateKey: sanitizePrivateKey(node.credential) }
        : { password: node.credential }),
    });
  });
}

type NodeStatus = 'connecting' | 'online' | 'offline' | 'warning';

interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  username: string;
  port: number;
  authType: 'password' | 'privateKey';
  credential: string;
  region: string;
  status: NodeStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  uptimeOutput?: string;
}

interface LogLine {
  time: string;
  level: 'INFO' | 'WARN' | 'DEBUG' | 'ERROR' | 'LIVE';
  message: string;
}

interface NodeMetrics {
  type: 'nodeMetrics';
  nodeId: string;
  status: 'online' | 'offline' | 'warning';
  timestamp: string;
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  ramPercent: number;
  swap: number;
  cache: number;
  uptime: string;
  ping: number;
  diskRead: number;
  diskWrite: number;
  netIn: number;
  netOut: number;
  logs: LogLine[];
  os: string;
  kernel: string;
  cpuModel: string;
  cpuCores: number;
  publicIp: string;
  docker:   DockerContainer[];
  dockerStatus: string;
}


// --------------------------------------------------
// Utils
// --------------------------------------------------


function nowIso() {
  return new Date().toISOString();
}

function safeStr(v: unknown) {
  return String(v ?? '').trim();
}

function safePort(v: unknown, fallback = 22) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Fetch all nodes from Supabase (includes credential for SSH use). */
async function readNodesFromSupabase(): Promise<NodeRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('nodes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[DB] Failed to read nodes:', error.message);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id:           row.id,
    displayName:  row.display_name,
    ipAddress:    row.ip_address,
    username:     row.username,
    port:         row.port ?? 22,
    authType:     row.auth_type as 'password' | 'privateKey',
    // Decrypt credential in backend memory — never sent to frontend
    credential:   (() => { try { return decryptCredential(row.credential); } catch { return row.credential; } })(),
    region:       row.region ?? 'US-East-1',
    status:       row.status ?? 'connecting',
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    uptimeOutput: row.uptime_output ?? undefined,
    error:        row.error ?? undefined,
  }));
}

function sanitizePrivateKey(input: string) {
  const trimmed = input.trim();

  if (
    !trimmed.includes('BEGIN OPENSSH PRIVATE KEY') &&
    !trimmed.includes('BEGIN RSA PRIVATE KEY') &&
    !trimmed.includes('BEGIN PRIVATE KEY') &&
    fs.existsSync(trimmed)
  ) {
    return fs.readFileSync(trimmed, 'utf8');
  }

  return trimmed.replace(/\\n/g, '\n');
}

function classifySSHError(err: any) {
  const msg = String(err?.message || err || 'Unknown SSH error');

  if (/All configured authentication methods failed/i.test(msg)) {
    return 'Authentication failed. Check username/password or private key.';
  }
  if (/connection refused|ECONNREFUSED/i.test(msg)) {
    return 'Connection refused. SSH service may be down or port may be incorrect.';
  }
  if (/timed out|timeout/i.test(msg)) {
    return 'SSH connection timed out. Check IP, port, firewall, or server reachability.';
  }
  if (/host unreachable|EHOSTUNREACH/i.test(msg)) {
    return 'Host unreachable. Check routing or server IP.';
  }
  if (/network is unreachable|ENETUNREACH/i.test(msg)) {
    return 'Network unreachable from backend machine.';
  }
  if (/private key/i.test(msg)) {
    return 'Private key error. Check key format or key contents.';
  }

  return msg;
}

function parseCpu(text: string): number {
  const idle = text.match(/(\d+(?:\.\d+)?)\s*id\b/i);
  if (idle) {
    return Math.max(0, Math.min(100, 100 - parseFloat(idle[1])));
  }
  return 0;
}

function parseMemory(text: string) {
  const memLine = text
    .split('\n')
    .map(s => s.trim())
    .find(line => /^Mem:/i.test(line));

  const swapLine = text
    .split('\n')
    .map(s => s.trim())
    .find(line => /^Swap:/i.test(line));

  let total = 0;
  let used = 0;
  let cache = 0;
  let swap = 0;

  if (memLine) {
    const p = memLine.split(/\s+/);
    total = Number(p[1] || 0);
    used = Number(p[2] || 0);
    cache = Number(p[5] || 0);
  }

  if (swapLine) {
    const p = swapLine.split(/\s+/);
    swap = Number(p[2] || 0);
  }

  return { total, used, cache, swap };
}

function parseLogs(text: string): LogLine[] {
  const lines = text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(-20);

  if (!lines.length) {
    return [{ time: new Date().toLocaleTimeString(), level: 'INFO', message: 'No recent logs available.' }];
  }

  return lines.map((line) => {
    const l = line.toLowerCase();
    let level: LogLine['level'] = 'INFO';
    if (l.includes('error') || l.includes('failed') || l.includes('fatal')) level = 'ERROR';
    else if (l.includes('warn')) level = 'WARN';
    else if (l.includes('debug')) level = 'DEBUG';
    else if (l.includes('live')) level = 'LIVE';

    return {
      time: new Date().toLocaleTimeString(),
      level,
      message: line,
    };
  });
}

// --------------------------------------------------
// SSH helpers
// --------------------------------------------------

async function connectSSH(node: Pick<NodeRecord, 'ipAddress' | 'port' | 'username' | 'authType' | 'credential'>) {
  const ssh = new NodeSSH();

  const baseConfig: any = {
    host: node.ipAddress,
    port: node.port || 22,
    username: node.username,
    readyTimeout: 30000,
    tryKeyboard: true,
    keepaliveInterval: 10000,
    keepaliveCountMax: 5,
    hostVerifier: () => true,
  };

  if (node.authType === 'privateKey') {
    baseConfig.privateKey = sanitizePrivateKey(node.credential);
  } else {
    baseConfig.password = node.credential;
  }

  await ssh.connect(baseConfig);
  return ssh;
}

async function sshExec(ssh: NodeSSH, command: string) {
  const r = await ssh.execCommand(command, { execOptions: { pty: true } });
  return String(r.stdout || r.stderr || '').trim();
}

async function testSSH(node: Pick<NodeRecord, 'ipAddress' | 'port' | 'username' | 'authType' | 'credential'>) {
  let ssh: NodeSSH | null = null;

  try {
    ssh = await connectSSH(node);
    const who = await sshExec(ssh, 'whoami');
    const uptime = await sshExec(ssh, 'uptime -p || uptime');

    return {
      success: true,
      message: `SSH connection successful as ${who || node.username}.`,
      uptimeOutput: uptime || 'Connected',
    };
  } catch (err: any) {
    return {
      success: false,
      message: classifySSHError(err),
    };
  } finally {
    try {
      if (ssh?.isConnected()) ssh.dispose();
    } catch {}
  }
}

// Track per-node fail counts for the 3-attempt offline promotion
const pollFailCount = new Map<string, number>();

async function collectMetrics(node: NodeRecord): Promise<NodeMetrics> {
  let ssh: NodeSSH | null = null;

  // Always initialized before try so catch block can always reference them.
  let diskRead:  number = 0;
  let diskWrite: number = 0;
  let netIn:     number = 0;
  let netOut:    number = 0;

  try {
    ssh = await connectSSH(node);

    // ── Phase 1: collect static + disk I/O ───────────────────────────────
    const [
      cpuOut,
      memOut,
      uptimeOut,
      osOut,
      kernelOut,
      cpuModelOut,
      cpuCoresOut,
      logsOut,
      iostatOut,
      netBefore,       // first /proc/net/dev snapshot
    ] = await Promise.all([
      sshExec(ssh, `LC_ALL=C top -bn1 | grep 'Cpu(s)' || top -bn1 | grep '%Cpu(s)' || echo 'Cpu(s): 0.0 us, 0.0 sy, 100.0 id'`),
      sshExec(ssh, `free -m`),
      sshExec(ssh, `uptime -p || uptime`),
      sshExec(ssh, `cat /etc/os-release 2>/dev/null | grep '^PRETTY_NAME=' | cut -d= -f2 | tr -d '"' || uname -o`),
      sshExec(ssh, `uname -r`),
      sshExec(ssh, `lscpu 2>/dev/null | grep 'Model name:' | sed 's/Model name:[[:space:]]*//' || cat /proc/cpuinfo | grep 'model name' | head -n1 | cut -d: -f2 | sed 's/^ *//' || echo 'unknown'`),
      sshExec(ssh, `nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 0`),
      sshExec(ssh, `tail -n 20 /var/log/syslog 2>/dev/null || tail -n 20 /var/log/messages 2>/dev/null || journalctl -n 20 --no-pager 2>/dev/null || echo 'No logs available'`),
      // iostat -d 1 2: 2 samples with 1s interval; we parse the LAST block (real delta)
      sshExec(ssh, `iostat -d 1 2 2>/dev/null || echo ''`),
      sshExec(ssh, `cat /proc/net/dev 2>/dev/null || echo ''`),
    ]);

    // ── Phase 2: wait 1 second, then take second /proc/net/dev snapshot ──
    const t0 = Date.now();
    await new Promise(r => setTimeout(r, 1000));
    const netAfterRaw = await sshExec(ssh, `cat /proc/net/dev 2>/dev/null || echo ''`);
    const elapsedMs   = Date.now() - t0;

    // ── Phase 3: docker ps + docker stats (pipe-delimited) ───────────────
    let dockerContainers: DockerContainer[] = [];
    let dockerStatus = 'Not Available';
    try {
      const dockerPsRaw = await sshExec(
        ssh,
        `docker ps --all --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null || echo 'DOCKER_NOT_FOUND'`
      ).catch(() => 'DOCKER_NOT_FOUND');

      if (!dockerPsRaw.includes('DOCKER_NOT_FOUND') && !dockerPsRaw.includes('command not found') && !dockerPsRaw.includes('not found')) {
        const psMap = parseDockerPsPipe(dockerPsRaw);
        dockerStatus = 'Running';

        if (psMap.size > 0) {
          const statsRaw = await sshExec(
            ssh,
            `docker stats --no-stream --format '{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null || echo ''`
          ).catch(() => '');
          dockerContainers = mergeDockerStats(statsRaw, psMap);
        } else {
          dockerContainers = Array.from(psMap.values());
        }
      } else {
        dockerStatus = 'Docker Not Found';
      }
    } catch {
      dockerStatus = 'Docker Not Found';
    }

    // ── Parse ─────────────────────────────────────────────────────────────
    const cpu = parseCpu(cpuOut);
    const mem = parseMemory(memOut);
    const ramPercent = mem.total > 0 ? Math.round((mem.used / mem.total) * 100) : 0;

    const diskIO = parseIostat(iostatOut);
    diskRead  = diskIO.diskRead;
    diskWrite = diskIO.diskWrite;

    const netBeforeMap = parseNetDev(netBefore);
    const netAfterMap  = parseNetDev(netAfterRaw);
    const net = calcNetThroughput(netBeforeMap, netAfterMap, elapsedMs);
    netIn  = net.netIn;
    netOut = net.netOut;

    const status: 'online' | 'warning' = (cpu > 85 || ramPercent > 90) ? 'warning' : 'online';

    pollFailCount.set(node.id, 0);

    return {
      type: 'nodeMetrics',
      nodeId: node.id,
      status,
      timestamp: nowIso(),
      cpu,
      ramUsed: mem.used,
      ramTotal: mem.total,
      ramPercent,
      swap: mem.swap,
      cache: mem.cache,
      uptime: uptimeOut || 'unknown',
      ping: 0,
      diskRead,
      diskWrite,
      netIn,
      netOut,
      logs: parseLogs(logsOut),
      os: osOut || 'unknown',
      kernel: kernelOut || 'unknown',
      cpuModel: cpuModelOut || 'unknown',
      cpuCores: Number(cpuCoresOut || 0),
      publicIp: node.ipAddress,
      docker: dockerContainers,
      dockerStatus,
    };
  } catch (err: any) {
    const message = classifySSHError(err);

    return {
      type: 'nodeMetrics',
      nodeId: node.id,
      status: 'offline',
      timestamp: nowIso(),
      cpu: 0,
      ramUsed: 0,
      ramTotal: 0,
      ramPercent: 0,
      swap: 0,
      cache: 0,
      uptime: 'offline',
      ping: 0,
      diskRead,
      diskWrite,
      netIn,
      netOut,
      logs: [{ time: new Date().toLocaleTimeString(), level: 'ERROR', message }],
      os: 'unknown',
      kernel: 'unknown',
      cpuModel: 'unknown',
      cpuCores: 0,
      publicIp: node.ipAddress,
      docker: [],
      dockerStatus: 'Offline',
    };
  } finally {
    try {
      if (ssh?.isConnected()) ssh.dispose();
    } catch {}
  }
}


// --------------------------------------------------
// App
// --------------------------------------------------

const app = express();

app.disable('etag');

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '10mb' }));

// --------------------------------------------------
// RBAC Middleware
// --------------------------------------------------

interface AuthedRequest extends express.Request {
  userId?: string;
  userRole?: string;
}

async function verifyToken(
  req: AuthedRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing auth token' });
  }

  try {
    // Verify JWT with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ message: 'Invalid or expired token' });

    // Fetch role from profiles table
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    req.userId   = user.id;
    req.userRole = profile?.role ?? 'intern';
    next();
  } catch {
    return res.status(401).json({ message: 'Auth error' });
  }
}

function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    if (!roles.includes(req.userRole ?? '')) {
      return res.status(403).json({ message: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}  ct:${req.headers['content-type'] ?? 'none'}`);
  }
  next();
});

// --------------------------------------------------
// API — Node Actions (reboot only)
// --------------------------------------------------
app.post('/api/nodes/:id/reboot', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { data: nodeRow, error: nodeErr } = await supabaseAdmin
      .from('nodes').select('*').eq('id', id).single();
    if (nodeErr || !nodeRow) return res.status(404).json({ message: 'Node not found' });
    const node: NodeRecord = {
      id: nodeRow.id, displayName: nodeRow.display_name, ipAddress: nodeRow.ip_address,
      username: nodeRow.username, port: nodeRow.port, authType: nodeRow.auth_type,
      credential: nodeRow.credential, region: nodeRow.region, status: nodeRow.status,
      createdAt: nodeRow.created_at, updatedAt: nodeRow.updated_at,
    };

    await runSSHCommand(node, 'nohup sudo reboot >/dev/null 2>&1 &');
    return res.json({ success: true, message: 'Reboot command sent' });
  } catch (err: any) {
    console.error('Reboot failed:', err);
    return res.status(500).json({ message: err?.message || 'Failed to reboot node' });
  }
});


app.get('/api/status', (_req, res) => {
  res.json({ status: 'operational', version: '5.0.0' });
});

// --------------------------------------------------
// Profile endpoint — always uses service role, bypasses RLS
// --------------------------------------------------
app.get('/api/profile', verifyToken, async (req: AuthedRequest, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.userId!)
      .single();

    if (error || !profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    return res.json(profile);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Admin-only: fetch ALL profiles (service role — bypasses RLS)
// --------------------------------------------------
app.get('/api/admin/users', verifyToken, requireRole('admin'), async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// BULK sync node assignments for a user (admin/employee)
// Body: { userId: string, nodeIds: string[] }
// Algorithm: delete-all then insert-valid-new
// Uses supabaseAdmin (service role key) — bypasses RLS.
// --------------------------------------------------
app.post('/api/admin/assign-node', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { userId, nodeIds } = req.body as { userId: string; nodeIds: string[] };

    // ── Input validation ──────────────────────────────────────────────────
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: 'userId is required and must be a string' });
    }
    if (!Array.isArray(nodeIds)) {
      return res.status(400).json({ message: 'nodeIds must be an array' });
    }

    // ── Validate nodeIds against Supabase nodes table ────────────────────
    const { data: knownNodesData } = await supabaseAdmin.from('nodes').select('id');
    const knownIds    = new Set((knownNodesData ?? []).map((n: any) => n.id));
    const validIds    = nodeIds.filter(id => knownIds.has(id));
    const rejectedIds = nodeIds.filter(id => !knownIds.has(id));

    console.log('[ASSIGN] userId :', userId);
    console.log('[ASSIGN] requested nodeIds :', nodeIds);
    console.log('[ASSIGN] valid nodeIds     :', validIds);
    if (rejectedIds.length > 0) {
      console.warn('[ASSIGN] ⚠ rejected unknown node IDs:', rejectedIds);
    }

    // ── Step 1: Delete all existing assignments for this user ─────────────
    const { error: delError } = await supabaseAdmin
      .from('node_assignments')
      .delete()
      .eq('user_id', userId);

    if (delError) {
      console.error('[ASSIGN] Delete failed:', delError.message);
      return res.status(500).json({ message: `Delete failed: ${delError.message}` });
    }
    console.log('[ASSIGN] Cleared existing assignments for user', userId);

    // ── Step 2: Insert each valid nodeId individually ─────────────────────
    const insertErrors: string[] = [];
    for (const node_id of validIds) {
      const { error: insError } = await supabaseAdmin
        .from('node_assignments')
        .insert({ user_id: userId, node_id, created_by: req.userId });

      if (insError) {
        console.error(`[ASSIGN] Insert failed for node ${node_id}:`, insError.message);
        insertErrors.push(`${node_id}: ${insError.message}`);
      } else {
        console.log(`[ASSIGN] ✓ Assigned node ${node_id} → user ${userId}`);
      }
    }

    if (insertErrors.length > 0) {
      return res.status(207).json({
        success: false,
        assigned: validIds.length - insertErrors.length,
        errors: insertErrors,
        message: `${insertErrors.length} insert(s) failed. See errors array.`,
      });
    }

    return res.json({
      success:  true,
      assigned: validIds.length,
      rejected: rejectedIds,
    });
  } catch (err: any) {
    console.error('[ASSIGN] Unexpected error:', err);
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Remove a single node assignment
// --------------------------------------------------
app.delete('/api/admin/assign-node', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { user_id, node_id } = req.body as { user_id: string; node_id: string };

    if (!user_id || !node_id) {
      return res.status(400).json({ message: 'user_id and node_id are required' });
    }

    const { error } = await supabaseAdmin
      .from('node_assignments')
      .delete()
      .match({ user_id, node_id });

    if (error) return res.status(500).json({ message: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});



app.get('/api/nodes', verifyToken, async (req: AuthedRequest, res) => {
  try {
    if (req.userRole === 'admin') {
      // Admins see all nodes
      const { data, error } = await supabaseAdmin
        .from('nodes')
        .select('id, display_name, ip_address, username, port, auth_type, region, status, uptime_output, error, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      return res.json((data ?? []).map((row: any) => ({
        id: row.id, displayName: row.display_name, ipAddress: row.ip_address,
        username: row.username, port: row.port, authType: row.auth_type,
        region: row.region, status: row.status, uptimeOutput: row.uptime_output,
        error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
      })));
    }

    // Employees/Interns: only nodes assigned to them
    const { data: assignments } = await supabaseAdmin
      .from('node_assignments')
      .select('node_id')
      .eq('user_id', req.userId!);
    const assignedIds = (assignments ?? []).map((a: any) => a.node_id);

    if (assignedIds.length === 0) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('nodes')
      .select('id, display_name, ip_address, username, port, auth_type, region, status, uptime_output, error, created_at, updated_at')
      .in('id', assignedIds)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ message: error.message });
    return res.json((data ?? []).map((row: any) => ({
      id: row.id, displayName: row.display_name, ipAddress: row.ip_address,
      username: row.username, port: row.port, authType: row.auth_type,
      region: row.region, status: row.status, uptimeOutput: row.uptime_output,
      error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
    })));
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

app.get('/api/nodes/:id', verifyToken, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('nodes')
      .select('id, display_name, ip_address, username, port, auth_type, region, status, uptime_output, error, created_at, updated_at')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ message: 'Node not found' });
    const row = data as any;
    return res.json({
      id: row.id, displayName: row.display_name, ipAddress: row.ip_address,
      username: row.username, port: row.port, authType: row.auth_type,
      region: row.region, status: row.status, uptimeOutput: row.uptime_output,
      error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

app.post('/api/nodes/test', async (req, res) => {
  try {
    const ipAddress = safeStr(req.body?.ipAddress);
    const username = safeStr(req.body?.username);
    const credential = String(req.body?.credential ?? '');
    const authType = (safeStr(req.body?.authType) || 'password') as 'password' | 'privateKey';
    const port = safePort(req.body?.port, 22);

    if (!ipAddress || !username || !credential) {
      return res.status(400).json({
        success: false,
        message: 'Missing ipAddress, username, or credential.',
      });
    }

    const result = await testSSH({
      ipAddress,
      username,
      credential,
      authType,
      port,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err?.message || 'Server error',
    });
  }
});

app.post('/api/nodes', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const displayName = safeStr(req.body?.displayName);
    const ipAddress   = safeStr(req.body?.ipAddress);
    const username    = safeStr(req.body?.username);
    const credential  = String(req.body?.credential ?? '');
    const port        = safePort(req.body?.port, 22);
    const authType    = (safeStr(req.body?.authType) || 'password') as 'password' | 'privateKey';
    const region      = safeStr(req.body?.region) || 'US-East-1';

    if (!displayName || !ipAddress || !username || !credential) {
      return res.status(400).json({ success: false, message: 'Missing displayName, ipAddress, username, or credential.' });
    }
    // ── Input sanitization ────────────────────────────────────────────────
    try {
      assertSafeName(displayName, 'displayName');
      assertSafeIp(ipAddress);
      assertNoShellChars(username, 'username');
      assertNoShellChars(region, 'region');
    } catch (ve: any) {
      return res.status(400).json({ success: false, message: ve.message });
    }

    // Encrypt credential before persisting
    const encryptedCredential = isEncrypted(credential) ? credential : encryptCredential(credential);

    // INSERT into Supabase
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('nodes')
      .insert({
        display_name: displayName,
        ip_address:   ipAddress,
        username,
        port,
        auth_type:    authType,
        credential:   encryptedCredential,
        region,
        status:       'connecting',
        created_by:   req.userId,
      })
      .select('id, display_name, ip_address, username, port, auth_type, region, status, created_at, updated_at')
      .single();

    if (insertErr || !inserted) {
      return res.status(500).json({ success: false, message: insertErr?.message || 'Failed to create node' });
    }

    const row = inserted as any;
    const nodeId = row.id as string;

    // Auto-assign to the creator
    void (async () => {
      try {
        await supabaseAdmin
          .from('node_assignments')
          .upsert({ user_id: req.userId!, node_id: nodeId, created_by: req.userId }, { onConflict: 'user_id,node_id' });
        console.log(`[NODE] Auto-assigned node ${nodeId} → creator ${req.userId}`);
      } catch (e: any) {
        console.warn('[NODE] Auto-assign failed:', e?.message);
      }
    })();

    const safe = {
      id: nodeId, displayName: row.display_name, ipAddress: row.ip_address,
      username: row.username, port: row.port, authType: row.auth_type,
      region: row.region, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
    res.status(201).json(safe);

    // Background SSH test → update Supabase
    const nodeForSSH: NodeRecord = { ...safe, credential, status: 'connecting', updatedAt: nowIso(), createdAt: nowIso() };
    void testSSH(nodeForSSH).then(async (result) => {
      try {
        await supabaseAdmin.from('nodes').update({
          status:        result.success ? 'online' : 'offline',
          uptime_output: result.uptimeOutput ?? null,
          error:         result.success ? null : result.message,
          updated_at:    nowIso(),
        }).eq('id', nodeId);
        console.log(`[BG-SSH] '${displayName}' → ${result.success ? 'online' : 'offline'}${result.success ? '' : ` | ${result.message}`}`);
      } catch {}
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

app.put('/api/nodes/:id', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const nodeId = req.params.id;

    // Fetch existing to get current credential if not replaced
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('nodes').select('*').eq('id', nodeId).single();
    if (fetchErr || !existing) return res.status(404).json({ message: 'Node not found' });

    const old = existing as any;
    const newDisplayName = safeStr(req.body?.displayName ?? old.display_name);
    const newIp          = safeStr(req.body?.ipAddress   ?? old.ip_address);
    const newUsername    = safeStr(req.body?.username    ?? old.username);
    const newRegion      = safeStr(req.body?.region      ?? old.region);
    // Input sanitization on PUT
    try {
      assertSafeName(newDisplayName, 'displayName');
      assertSafeIp(newIp);
      assertNoShellChars(newUsername, 'username');
      assertNoShellChars(newRegion, 'region');
    } catch (ve: any) {
      return res.status(400).json({ success: false, message: ve.message });
    }
    const updates: any = {
      display_name: newDisplayName,
      ip_address:   newIp,
      username:     newUsername,
      port:         safePort(req.body?.port ?? old.port, 22),
      auth_type:    safeStr(req.body?.authType ?? old.auth_type) || 'password',
      region:       newRegion,
      status:       'connecting',
      updated_at:   nowIso(),
    };
    if (req.body?.credential) {
      const raw = String(req.body.credential);
      updates.credential = isEncrypted(raw) ? raw : encryptCredential(raw);
    }

    const { error: updErr } = await supabaseAdmin.from('nodes').update(updates).eq('id', nodeId);
    if (updErr) return res.status(500).json({ message: updErr.message });

    res.json({ id: nodeId, ...updates, displayName: updates.display_name, ipAddress: updates.ip_address, authType: updates.auth_type });

    // Background SSH re-test
    const nodeForSSH: NodeRecord = {
      id: nodeId, displayName: updates.display_name, ipAddress: updates.ip_address,
      username: updates.username, port: updates.port, authType: updates.auth_type,
      credential: updates.credential ?? old.credential, region: updates.region,
      status: 'connecting', createdAt: old.created_at, updatedAt: nowIso(),
    };
    void testSSH(nodeForSSH).then(async result => {
      try {
        await supabaseAdmin.from('nodes').update({
          status:        result.success ? 'online' : 'offline',
          uptime_output: result.uptimeOutput ?? null,
          error:         result.success ? null : result.message,
          updated_at:    nowIso(),
        }).eq('id', nodeId);
        console.log(`[BG-SSH] Updated '${updates.display_name}' → ${result.success ? 'online' : 'offline'}`);
      } catch {}
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

app.delete('/api/nodes/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('nodes').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// User Management API (admin / employee controlled)
// --------------------------------------------------

app.post('/api/users/create', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { email, password, role, created_by } = req.body as {
      email: string; password: string; role: string; created_by: string;
    };

    // Employees can only create interns
    if (req.userRole === 'employee' && role !== 'intern') {
      return res.status(403).json({ message: 'Employees can only create intern accounts' });
    }

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'email, password, and role are required' });
    }

    // Create auth user
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });

    if (createErr || !newUser?.user) {
      return res.status(500).json({ message: createErr?.message || 'Failed to create user' });
    }

    // Upsert profile with role + created_by.
    // IMPORTANT: treat a profile-write failure as fatal.
    // If this step fails the auth user becomes an orphan (email "taken" but
    // invisible in the UI), so we delete the auth user before returning an error.
    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id,
      email,
      role,
      created_by: created_by || req.userId,
    });

    if (profileErr) {
      console.error('[CREATE-USER] Profile upsert failed — rolling back auth user:', profileErr.message);
      // Roll back: remove the orphaned auth.users row so the email is freed
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return res.status(500).json({
        message: `User created in Auth but profile write failed (rolled back): ${profileErr.message}`,
      });
    }

    console.log(`[CREATE-USER] ✓ Auth + profile created for ${email} (role: ${role})`);
    return res.status(201).json({ id: newUser.user.id, email, role });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

app.delete('/api/users/:id', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const targetId = req.params.id;

    // Employees can only delete their own interns
    if (req.userRole === 'employee') {
      const { data: target } = await supabaseAdmin
        .from('profiles')
        .select('created_by, role')
        .eq('id', targetId)
        .single();
      if (!target || target.created_by !== req.userId || target.role !== 'intern') {
        return res.status(403).json({ message: 'You can only delete interns you created' });
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (error) return res.status(500).json({ message: error.message });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Users list (admin sees all their employees; employee sees their interns)
// --------------------------------------------------
app.get('/api/users', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('created_by', req.userId!);

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Node assignment endpoints
// --------------------------------------------------

// GET /api/users/:id/assignments — list node_ids assigned to a user
app.get('/api/users/:id/assignments', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const targetId = req.params.id;

    // Employees can only view assignments for their own interns
    if (req.userRole === 'employee') {
      const { data: target } = await supabaseAdmin
        .from('profiles')
        .select('created_by')
        .eq('id', targetId)
        .single();
      if (!target || target.created_by !== req.userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('node_assignments')
      .select('node_id')
      .eq('user_id', targetId);

    if (error) return res.status(500).json({ message: error.message });
    return res.json(data ?? []);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// POST /api/users/:id/assign-node — assign a node to a user
app.post('/api/users/:id/assign-node', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const targetId = req.params.id;
    const { node_id } = req.body as { node_id: string };

    if (!node_id) return res.status(400).json({ message: 'node_id is required' });

    // Employees can only assign nodes that are also assigned to themselves
    if (req.userRole === 'employee') {
      const { data: myAssignment } = await supabaseAdmin
        .from('node_assignments')
        .select('node_id')
        .eq('user_id', req.userId!)
        .eq('node_id', node_id)
        .single();
      if (!myAssignment) {
        return res.status(403).json({ message: 'You can only assign nodes that are assigned to you' });
      }

      // Also verify the intern was created by this employee
      const { data: target } = await supabaseAdmin
        .from('profiles')
        .select('created_by')
        .eq('id', targetId)
        .single();
      if (!target || target.created_by !== req.userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const { error } = await supabaseAdmin
      .from('node_assignments')
      .upsert({ user_id: targetId, node_id, created_by: req.userId }, { onConflict: 'user_id,node_id' });

    if (error) return res.status(500).json({ message: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// DELETE /api/users/:id/assign-node/:nodeId — remove a node assignment
app.delete('/api/users/:id/assign-node/:nodeId', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const targetId = req.params.id;
    const nodeId   = req.params.nodeId;

    // Employees can only unassign from their own interns
    if (req.userRole === 'employee') {
      const { data: target } = await supabaseAdmin
        .from('profiles')
        .select('created_by')
        .eq('id', targetId)
        .single();
      if (!target || target.created_by !== req.userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const { error } = await supabaseAdmin
      .from('node_assignments')
      .delete()
      .match({ user_id: targetId, node_id: nodeId });

    if (error) return res.status(500).json({ message: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// HTTP + WebSocket
// --------------------------------------------------

const server = http.createServer(app);

// metrics / dashboard socket
const metricsWss = new WebSocketServer({ noServer: true });

// terminal socket
const terminalWss = new WebSocketServer({ noServer: true });

const metricClients = new Set<WebSocket>();

metricsWss.on('connection', (ws) => {
  metricClients.add(ws);
  console.log(`[WS] Metrics client connected. Total: ${metricClients.size}`);

  ws.on('close', () => {
    metricClients.delete(ws);
    console.log(`[WS] Metrics client disconnected. Total: ${metricClients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Metrics client error:', err.message);
  });
});

function broadcastMetrics(data: object) {
  const msg = JSON.stringify(data);
  for (const client of metricClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// --------------------------------------------------
// Terminal WebSocket
// --------------------------------------------------

terminalWss.on('connection', async (ws, req) => {
  const url    = new URL(req.url || '', 'http://localhost');
  const nodeId = url.searchParams.get('nodeId');
  const token  = url.searchParams.get('token');

  // ── 1. Require nodeId ──────────────────────────────────────────────────
  if (!nodeId) {
    ws.send('\r\n[terminal] Missing nodeId\r\n');
    ws.close();
    return;
  }

  // ── 2. Authenticate the user via Supabase JWT ──────────────────────
  if (!token) {
    ws.send('\r\n[terminal] Unauthorized: missing token\r\n');
    ws.close();
    return;
  }

  let wsUserId: string;
  let wsUserRole: string;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) throw new Error('invalid token');
    wsUserId = user.id;
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', user.id).single();
    wsUserRole = profile?.role ?? 'intern';
  } catch {
    ws.send('\r\n[terminal] Unauthorized: invalid or expired token\r\n');
    ws.close();
    return;
  }

  // ── 3. Verify node assignment (non-admin must be explicitly assigned) ──
  if (wsUserRole !== 'admin') {
    const { data: assignment } = await supabaseAdmin
      .from('node_assignments')
      .select('node_id')
      .eq('user_id', wsUserId)
      .eq('node_id', nodeId)
      .single();
    if (!assignment) {
      ws.send('\r\n[terminal] Forbidden: you are not assigned to this node\r\n');
      ws.close();
      return;
    }
  }

  // ── 4. Fetch node (credential decrypted by readNodesFromSupabase) ─────
  const { data: nodeRow } = await supabaseAdmin
    .from('nodes').select('*').eq('id', nodeId).single();
  if (!nodeRow) {
    ws.send('\r\n[terminal] Node not found\r\n');
    ws.close();
    return;
  }
  const node: NodeRecord = {
    id: nodeRow.id, displayName: nodeRow.display_name, ipAddress: nodeRow.ip_address,
    username: nodeRow.username, port: nodeRow.port, authType: nodeRow.auth_type,
    // Decrypt credential in-memory for SSH — never forwarded to the client
    credential: (() => { try { return decryptCredential(nodeRow.credential); } catch { return nodeRow.credential; } })(),
    region: nodeRow.region, status: nodeRow.status,
    createdAt: nodeRow.created_at, updatedAt: nodeRow.updated_at,
  };

  const conn = new Client();
  let streamRef: any = null;

  const commonConfig: any = {
    host: node.ipAddress,
    port: node.port || 22,
    username: node.username,
    readyTimeout: 30000,
    tryKeyboard: true,
    keepaliveInterval: 10000,
    keepaliveCountMax: 5,
    hostVerifier: () => true,
  };

  if (node.authType === 'privateKey') {
    commonConfig.privateKey = sanitizePrivateKey(node.credential);
  } else {
    commonConfig.password = node.credential;
  }

  conn.on('ready', () => {
    ws.send('\r\n[terminal] Connected\r\n');

    conn.shell(
      {
        term: 'xterm-color',
        cols: 120,
        rows: 30,
      },
      (err, stream) => {
        if (err) {
          ws.send(`\r\n[terminal] Shell error: ${err.message}\r\n`);
          ws.close();
          conn.end();
          return;
        }

        streamRef = stream;

        stream.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data.toString('utf8'));
          }
        });

        stream.on('close', () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('\r\n[terminal] Session closed\r\n');
            ws.close();
          }
          conn.end();
        });

        ws.on('message', (msg) => {
          if (!streamRef) return;

          try {
            const raw = msg.toString();

            // resize message format:
            // {"type":"resize","cols":120,"rows":30}
            if (raw.startsWith('{')) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed.type === 'resize' && Number(parsed.cols) && Number(parsed.rows)) {
                  streamRef.setWindow(parsed.rows, parsed.cols, 0, 0);
                  return;
                }
              } catch {}
            }

            streamRef.write(raw);
          } catch {}
        });

        ws.on('close', () => {
          try { stream.end('exit\n'); } catch {}
          conn.end();
        });
      }
    );
  });

  conn.on('error', (err) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`\r\n[terminal] SSH error: ${classifySSHError(err)}\r\n`);
      ws.close();
    }
  });

  conn.connect(commonConfig);
});

// Route upgrade requests
server.on('upgrade', (req, socket, head) => {
  const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : '';

  if (pathname === '/ws') {
    metricsWss.handleUpgrade(req, socket, head, (ws) => {
      metricsWss.emit('connection', ws, req);
    });
    return;
  }

  if (pathname === '/ws/terminal') {
  terminalWss.handleUpgrade(req, socket, head, (ws) => {
    terminalWss.emit('connection', ws, req);
  });
  return;
}

  socket.destroy();
});

// --------------------------------------------------
// Polling
// --------------------------------------------------

const pollingMap = new Map<string, boolean>();

async function pollNode(node: NodeRecord) {
  // Per-node guard: skip if already polling this node
  if (pollingMap.get(node.id)) return;
  pollingMap.set(node.id, true);

  try {
    const metrics = await collectMetrics(node);
    broadcastMetrics(metrics);

    // --- Update Supabase (primary store) ---
    if (metrics.status === 'offline') {
      const fails = (pollFailCount.get(node.id) ?? 0) + 1;
      pollFailCount.set(node.id, fails);

      if (fails >= 3) {
        void supabaseAdmin
          .from('nodes')
          .update({ status: 'offline', updated_at: metrics.timestamp, error: metrics.logs[0]?.message })
          .eq('id', node.id);
      }
    } else {
      pollFailCount.set(node.id, 0);
      void supabaseAdmin
        .from('nodes')
        .update({ status: metrics.status, updated_at: metrics.timestamp, error: null })
        .eq('id', node.id);
    }

    console.log(
      `[POLL] ${node.displayName} (${node.ipAddress}) → cpu=${metrics.cpu.toFixed(1)}% ram=${metrics.ramPercent}% disk_r=${metrics.diskRead.toFixed(2)}MB/s status=${metrics.status}` +
      (metrics.status === 'offline' ? ` | ${metrics.logs[0]?.message ?? 'offline'}` : '')
    );
  } catch (err: any) {
    // Per-node isolation: log but don't rethrow so other nodes keep polling
    console.error(`[POLL] Unexpected error for ${node.displayName}:`, err?.message || err);
  } finally {
    pollingMap.set(node.id, false);
  }
}

async function pollAllNodes() {
  const nodes = await readNodesFromSupabase();
  if (!nodes.length) return;

  console.log(`[POLL] Starting poll cycle — ${nodes.length} node(s)`);
  for (const node of nodes) {
    // Each node runs in its own promise chain — failures are isolated
    void pollNode(node).catch(err =>
      console.error(`[POLL] Unhandled in pollNode(${node.displayName}):`, err?.message)
    );
  }
}

// --------------------------------------------------
// Demo dashboard broadcaster
// --------------------------------------------------

setInterval(() => {
  broadcastMetrics({
    type: 'dashboard',
    timestamp: nowIso(),
    cpu: 30 + Math.random() * 20,
    ram: 10 + Math.random() * 5,
    uptime: '142d 18h',
    bandwidth: 800 + Math.random() * 100,
    latency: 15 + Math.random() * 10,
    events: [
      { time: '04:00 AM', type: 'SUCCESS', label: 'T_SUCCESS' },
      { time: '06:22 AM', type: 'DB_CONNECT', label: 'DB_CONNECT' },
      { time: '09:15 AM', type: 'SSL_RENEW', label: 'SSL_RENEW' },
      { time: '11:04 AM', type: 'FAILURE', label: 'AUTH_FAIL' },
      { time: '01:45 PM', type: 'PATCH', label: 'PATCH_0.4' },
    ],
  });
}, 2000);

// --------------------------------------------------
// Start
// --------------------------------------------------

const PORT = Number(process.env.PORT || 3000);

setTimeout(pollAllNodes, 3000);
setInterval(pollAllNodes, 10000);
// --------------------------------------------------
// Serve Frontend (Vite build)
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  🟢  Neon Sentry Backend — http://localhost:${PORT}  ║`);
  console.log('║  📡  WebSocket broadcaster active                 ║');
  console.log('║  🖥️   Terminal WebSocket active                   ║');
  console.log('║  🔄  SSH poller starts in 3 s (every 10 s)       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});