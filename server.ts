import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { NodeSSH } from 'node-ssh';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { encryptCredential, decryptCredential, isEncrypted } from './src/utils/crypto.ts';
import { dispatchEmail, sendTestEmail, testSmtpConnection, SmtpConfig } from './src/utils/mailer.ts';

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
// PostgreSQL pool
// --------------------------------------------------
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('[PG] Unexpected pool error', err));

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

function signToken(payload: { id: string; email: string; role: string }): string {
  return (jwt as any).sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyJwt(token: string): { id: string; email: string; role: string } {
  return (jwt as any).verify(token, JWT_SECRET) as any;
}

/**
 * Generate a cryptographically secure temporary password.
 * Avoids ambiguous chars (0/O, 1/l/I) so the password is readable in emails.
 * Example output: "kPm3!vQn9"
 */
function generateTempPassword(): string {
  const alpha   = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits  = '23456789';
  const special = '!@#$%&*';
  const rand = (chars: string) => chars[crypto.randomInt(chars.length)];
  return (
    rand(alpha) + rand(alpha) + rand(alpha) +
    rand(digits) +
    rand(special) +
    rand(alpha) + rand(alpha) + rand(alpha) +
    rand(digits)
  ); // 9 chars — always meets the 8-char minimum
}

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

/** Fetch all nodes from PostgreSQL (includes credential for SSH use). */
async function readNodesFromDB(): Promise<NodeRecord[]> {
  try {
    const { rows } = await pool.query('SELECT * FROM nodes ORDER BY created_at DESC');
    return rows.map((row: any) => ({
      id:           row.id,
      displayName:  row.display_name,
      ipAddress:    row.ip_address,
      username:     row.username,
      port:         row.port ?? 22,
      authType:     row.auth_type as 'password' | 'privateKey',
      credential:   (() => { try { return decryptCredential(row.credential); } catch { return row.credential; } })(),
      region:       row.region ?? 'US-East-1',
      status:       row.status ?? 'connecting',
      createdAt:    row.created_at,
      updatedAt:    row.updated_at,
      uptimeOutput: row.uptime_output ?? undefined,
      error:        row.error ?? undefined,
    }));
  } catch (err: any) {
    console.error('[DB] Failed to read nodes:', err.message);
    return [];
  }
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
    // ── Per-node SSH connect: isolated so one node failure doesn't crash others ──
    try {
      ssh = await connectSSH(node);
    } catch (connectErr: any) {
      const message = classifySSHError(connectErr);
      console.warn(`[POLL] SSH connect failed for ${node.displayName} (${node.ipAddress}): ${message}`);
      return {
        type: 'nodeMetrics',
        nodeId: node.id,
        status: 'offline',
        timestamp: nowIso(),
        cpu: 0, ramUsed: 0, ramTotal: 0, ramPercent: 0,
        swap: 0, cache: 0, uptime: 'offline', ping: 0,
        diskRead, diskWrite, netIn, netOut,
        logs: [{ time: new Date().toLocaleTimeString(), level: 'ERROR', message }],
        os: 'unknown', kernel: 'unknown', cpuModel: 'unknown', cpuCores: 0,
        publicIp: node.ipAddress, docker: [], dockerStatus: 'Offline',
      };
    }
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
// Auto-migration: ensure tables/columns exist
// Runs once at startup — safe to run repeatedly (idempotent).
// --------------------------------------------------
void (async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key TEXT PRIMARY KEY,
        value       JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS docker_enabled BOOLEAN NOT NULL DEFAULT false`);
    console.log('[DB] Auto-migration complete.');
  } catch (e: any) {
    console.warn('[DB] Auto-migration warning:', e.message);
  }
})();


// --------------------------------------------------
// Rate Limiter: max 5 req/s per user (or IP) per endpoint
// --------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;       // requests allowed per window
const RATE_LIMIT_WINDOW = 1000; // 1-second sliding window

// Clean up stale entries every 30 s to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(key);
  }
}, 30_000);

app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Use the JWT user-id if present, otherwise fall back to IP
  const auth = req.headers.authorization ?? '';
  let identity = req.ip ?? 'unknown';
  if (auth.startsWith('Bearer ')) {
    try {
      const payload = verifyJwt(auth.slice(7));
      identity = payload.id;
    } catch { /* unverified — use IP */ }
  }

  const key = `${identity}::${req.method}::${req.path}`;
  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(key, entry);
  } else {
    entry.count++;
  }

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfterMs = Math.max(0, entry.resetAt - now);
    res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    return res.status(429).json({ message: 'Too many requests — please slow down' });
  }

  next();
});

// --------------------------------------------------
// RBAC Middleware
// --------------------------------------------------

interface AuthedRequest extends express.Request {
  userId?: string;
  userRole?: string;
}

function verifyToken(
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
    const payload = verifyJwt(token);
    req.userId   = payload.id;
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
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

function isSuperAdmin(req: AuthedRequest) {
  return req.userRole === 'super_admin';
}

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}  ct:${req.headers['content-type'] ?? 'none'}`);
  }
  next();
});

// --------------------------------------------------
// AUTH routes (public — no verifyToken)
// --------------------------------------------------

/** POST /api/auth/login */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) return res.status(400).json({ message: 'email and password are required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email.toLowerCase().trim()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    // ── Suspension gate ───────────────────────────────────────────────────
    if (user.is_suspended) {
      return res.status(403).json({
        message: 'Your account is suspended. Please contact the Super Admin.',
      });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return res.json({
      token,
      role: user.role,
      id: user.id,
      email: user.email,
      must_change_password: user.must_change_password ?? false,
    });
  } catch (err: any) {
    console.error('[AUTH] login error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

/** POST /api/auth/signup  (admin / super_admin — protected) */
app.post('/api/auth/signup', verifyToken, requireRole('admin', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { email, password, role } = req.body as { email: string; password: string; role: string };
    if (!email || !password || !role) return res.status(400).json({ message: 'email, password, and role are required' });
    const allowed = isSuperAdmin(req) ? ['super_admin', 'admin', 'employee', 'intern'] : ['admin', 'employee', 'intern'];
    if (!allowed.includes(role)) return res.status(400).json({ message: 'Invalid role' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, role, created_by) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at',
      [email.toLowerCase().trim(), hash, role, req.userId]
    );
    return res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists' });
    console.error('[AUTH] signup error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --------------------------------------------------
// PUBLIC: Request Access (no auth required)
// --------------------------------------------------

/** POST /api/public/request-access */
app.post('/api/public/request-access', async (req, res) => {
  try {
    const { fullName, email, companyName, serverCount, message } = req.body as {
      fullName: string; email: string; companyName: string;
      serverCount: number | string; message?: string;
    };

    if (!fullName || !email || !companyName) {
      return res.status(400).json({ message: 'fullName, email, and companyName are required' });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const count = Number(serverCount) || 0;

    await pool.query(
      `INSERT INTO access_requests (full_name, email, company_name, server_count, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [fullName.trim(), email.toLowerCase().trim(), companyName.trim(), count, message?.trim() ?? null]
    );

    console.log(`[REQUEST-ACCESS] New request from ${email} (${companyName})`);
    return res.status(201).json({ success: true, message: 'Your request has been submitted! We will be in touch shortly.' });
  } catch (err: any) {
    console.error('[REQUEST-ACCESS] error:', err.message);
    return res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

/** POST /api/auth/change-password */
app.post('/api/auth/change-password', verifyToken, async (req: AuthedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });

    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    console.error('[AUTH] change-password error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/auth/first-login-reset
 * Called when must_change_password is true.
 * Does NOT require the old password — just the new one.
 * On success, clears must_change_password = false.
 */
app.post('/api/auth/first-login-reset', verifyToken, async (req: AuthedRequest, res) => {
  try {
    const { newPassword } = req.body as { newPassword: string };
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'newPassword must be at least 8 characters' });
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [newHash, req.userId]
    );
    console.log(`[AUTH] First-login password reset for user ${req.userId}`);
    return res.json({ success: true, message: 'Password updated. You can now access the dashboard.' });
  } catch (err: any) {
    console.error('[AUTH] first-login-reset error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --------------------------------------------------
app.post('/api/nodes/:id/reboot', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { rows: _rebootRows } = await pool.query('SELECT * FROM nodes WHERE id = $1', [id]);
    const nodeRow = _rebootRows[0];
    if (!nodeRow) return res.status(404).json({ message: 'Node not found' });
    const node: NodeRecord = {
      id: nodeRow.id, displayName: nodeRow.display_name, ipAddress: nodeRow.ip_address,
      username: nodeRow.username, port: nodeRow.port, authType: nodeRow.auth_type,
      credential: (() => { try { return decryptCredential(nodeRow.credential); } catch { return nodeRow.credential; } })(),
      region: nodeRow.region, status: nodeRow.status,
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
// Profile endpoint
// --------------------------------------------------
app.get('/api/profile', verifyToken, async (req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, role, created_by, created_at, docker_enabled FROM users WHERE id = $1',
      [req.userId]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Profile not found' });
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Admin-only: fetch ALL users (scoped by role)
// --------------------------------------------------
app.get('/api/admin/users', verifyToken, requireRole('admin', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    if (isSuperAdmin(req)) {
      // Super admin sees everyone (including other admins)
      const { rows } = await pool.query(
        'SELECT id, email, role, created_by, created_at FROM users ORDER BY created_at ASC'
      );
      return res.json(rows);
    }
    // Regular admin sees only users they created
    const { rows } = await pool.query(
      'SELECT id, email, role, created_by, created_at FROM users WHERE created_by = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Super Admin: Access Requests (Leads)
// --------------------------------------------------

/** GET /api/super-admin/access-requests — list all access requests */
app.get('/api/super-admin/access-requests', verifyToken, requireRole('super_admin'), async (_req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM access_requests ORDER BY created_at DESC'
    );
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/** PATCH /api/super-admin/access-requests/:id/status — update status to contacted */
app.patch('/api/super-admin/access-requests/:id/status', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };
    if (!['pending', 'contacted'].includes(status)) {
      return res.status(400).json({ message: 'Status must be pending or contacted' });
    }
    const { rows } = await pool.query(
      'UPDATE access_requests SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Request not found' });
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/** GET /api/super-admin/stats — platform-wide stats */
app.get('/api/super-admin/stats', verifyToken, requireRole('super_admin'), async (_req: AuthedRequest, res) => {
  try {
    const [nodesR, usersR, requestsR, onlineR, adminR] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM nodes'),
      pool.query('SELECT COUNT(*) as total FROM users'),
      pool.query('SELECT COUNT(*) as total FROM access_requests'),
      pool.query(`SELECT COUNT(*) as total FROM nodes WHERE status = 'online'`),
      pool.query(`SELECT COUNT(*) as total FROM users WHERE role = 'admin'`),
    ]);
    // Global load average across all online nodes (placeholder — real value comes from poller)
    return res.json({
      totalNodes:    Number(nodesR.rows[0]?.total ?? 0),
      totalUsers:    Number(usersR.rows[0]?.total ?? 0),
      totalRequests: Number(requestsR.rows[0]?.total ?? 0),
      onlineNodes:   Number(onlineR.rows[0]?.total ?? 0),
      activeAdmins:  Number(adminR.rows[0]?.total ?? 0),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Super Admin: Admin Management (quotas, password reset)
// --------------------------------------------------

/** GET /api/super-admin/admins — list all admins with stats */
app.get('/api/super-admin/admins', verifyToken, requireRole('super_admin'), async (_req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.email, u.role, u.created_at, u.node_limit, u.user_limit,
        COALESCE(u.is_suspended, false)        AS is_suspended,
        COALESCE(u.must_change_password, false) AS must_change_password,
        (SELECT COUNT(*)::int FROM users u2 WHERE u2.created_by = u.id) AS user_count,
        (SELECT COUNT(*)::int FROM nodes n  WHERE n.created_by  = u.id) AS node_count
      FROM users u
      WHERE u.role = 'admin'
      ORDER BY u.created_at ASC
    `);
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/** PATCH /api/super-admin/admins/:id/quota — update node_limit and user_limit */
app.patch('/api/super-admin/admins/:id/quota', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { nodeLimit, userLimit } = req.body as { nodeLimit?: number; userLimit?: number };
    if (nodeLimit === undefined && userLimit === undefined) {
      return res.status(400).json({ message: 'nodeLimit or userLimit required' });
    }
    const updates: string[] = [];
    const values: any[] = [];
    if (nodeLimit !== undefined) { values.push(Number(nodeLimit)); updates.push(`node_limit = $${values.length}`); }
    if (userLimit !== undefined) { values.push(Number(userLimit)); updates.push(`user_limit = $${values.length}`); }
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length} AND role = 'admin' RETURNING id, email, node_limit, user_limit`,
      values
    );
    if (!rows[0]) return res.status(404).json({ message: 'Admin not found' });
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/** PATCH /api/super-admin/admins/:id/password — reset an admin's password */
app.patch('/api/super-admin/admins/:id/password', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body as { newPassword: string };
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'newPassword must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 AND role = 'admin' RETURNING id, email`,
      [hash, id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Admin not found' });
    console.log(`[SUPER-ADMIN] Reset password for admin: ${rows[0].email}`);
    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// System Settings (SMTP + Email Template)
// --------------------------------------------------

/** GET /api/super-admin/settings/:key */
app.get('/api/super-admin/settings/:key', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT value FROM system_settings WHERE setting_key = $1',
      [req.params.key]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Setting not found' });
    // Never return the smtp password in plaintext
    const val = { ...rows[0].value };
    if (req.params.key === 'smtp' && val.password) val.password = '••••••••';
    return res.json(val);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/** PUT /api/super-admin/settings/:key */
app.put('/api/super-admin/settings/:key', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { key } = req.params;
    const newValue = req.body;
    if (!newValue || typeof newValue !== 'object') {
      return res.status(400).json({ message: 'Body must be a JSON object' });
    }
    // If password field is the placeholder, fetch and preserve the old one
    if (key === 'smtp' && newValue.password === '••••••••') {
      const { rows: old } = await pool.query('SELECT value FROM system_settings WHERE setting_key = $1', [key]);
      if (old[0]) newValue.password = old[0].value.password ?? '';
    }
    const { rows } = await pool.query(
      `INSERT INTO system_settings (setting_key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING value`,
      [key, newValue]
    );
    return res.json(rows[0].value);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/**
 * POST /api/super-admin/settings/smtp/test
 * Accepts an optional smtp body with current form values.
 * Saves them to DB first (if provided), then sends a real test email
 * to the authenticated superadmin's email address.
 */
app.post('/api/super-admin/settings/smtp/test', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    // 1. Use the body payload if the frontend sends current form values
    let smtpFromBody: SmtpConfig | undefined;
    if (req.body && req.body.host) {
      smtpFromBody = req.body as SmtpConfig;
      // Persist the config so the test uses exactly what the admin typed
      const existing = await pool.query("SELECT value FROM system_settings WHERE setting_key = 'smtp'");
      const existing_pw = existing.rows[0]?.value?.password ?? '';
      // If password is masked placeholder, preserve the stored one
      if (smtpFromBody.password === '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
        smtpFromBody.password = existing_pw;
      }
      await pool.query(
        `INSERT INTO system_settings (setting_key, value, updated_at)
         VALUES ('smtp', $1, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [smtpFromBody]
      );
      console.log('[SMTP-TEST] Saved current form values to DB before testing.');
    }

    // 2. Get the superadmin's email to send the test email to
    const { rows: adminRows } = await pool.query(
      'SELECT email FROM users WHERE id = $1', [req.userId]
    );
    const adminEmail = adminRows[0]?.email;
    if (!adminEmail) return res.status(400).json({ ok: false, error: 'Could not determine your email address' });

    // 3. Send test email
    const result = await sendTestEmail(pool, adminEmail, smtpFromBody);
    if (result.sent) {
      return res.json({ ok: true, message: `Test email sent to ${adminEmail}` });
    } else {
      return res.json({ ok: false, error: result.error || 'Send failed' });
    }
  } catch (err: any) {
    return res.status(200).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/super-admin/settings/smtp/verify
 * Calls transporter.verify() ONLY — no email sent.
 * Used by the "Test Connection" button in the Settings UI.
 */
app.post('/api/super-admin/settings/smtp/verify', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    let smtpConfig: SmtpConfig | undefined = req.body?.host ? req.body as SmtpConfig : undefined;

    // If password is masked, load the real one from DB
    if (smtpConfig && smtpConfig.password === '••••••••') {
      const { rows } = await pool.query("SELECT value FROM system_settings WHERE setting_key = 'smtp'");
      smtpConfig.password = rows[0]?.value?.password ?? '';
    }

    if (!smtpConfig) {
      // Load from DB if no body provided
      const { rows } = await pool.query("SELECT value FROM system_settings WHERE setting_key = 'smtp'");
      if (!rows[0]) return res.json({ ok: false, error: 'No SMTP config saved yet' });
      smtpConfig = rows[0].value as SmtpConfig;
    }

    const result = await testSmtpConnection(smtpConfig);
    console.log(`[SMTP-VERIFY] Connection test result: ${result.ok ? 'OK' : result.error}`);
    return res.json(result);
  } catch (err: any) {
    return res.status(200).json({ ok: false, error: err.message });
  }
});

/** POST /api/super-admin/create-admin — Super Admin creates a new Admin */
app.post('/api/super-admin/create-admin', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) return res.status(400).json({ message: 'email and password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const hash = await bcrypt.hash(password, 12);
    // must_change_password = true so the new admin is forced to reset on first login
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, role, created_by, must_change_password) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, email, role, created_at',
      [email.toLowerCase().trim(), hash, 'admin', req.userId]
    );
    console.log(`[SUPER-ADMIN] Created new admin: ${email} (must_change_password=true)`);

    // Dispatch welcome email (non-blocking — never fails the HTTP response)
    const cleanEmail = email.toLowerCase().trim();
    void dispatchEmail(pool, 'welcome_mail', cleanEmail, {
      name:     cleanEmail.split('@')[0],
      password: password,
    }).catch((e: any) => console.warn('[MAILER] Non-fatal:', e?.message));

    return res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists' });
    console.error('[SUPER-ADMIN] create-admin error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

/** PATCH /api/super-admin/admins/:id/suspend — toggle suspension */
app.patch('/api/super-admin/admins/:id/suspend', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { suspended } = req.body as { suspended: boolean };
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ message: 'suspended (boolean) is required' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET is_suspended = $1 WHERE id = $2 AND role = 'admin' RETURNING id, email, is_suspended`,
      [suspended, id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Admin not found' });
    console.log(`[SUPER-ADMIN] Admin ${rows[0].email} suspension set to ${suspended}`);
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/** DELETE /api/super-admin/admins/:id — permanently delete an admin */
app.delete('/api/super-admin/admins/:id', verifyToken, requireRole('super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    // Prevent super admin from deleting themselves
    if (id === req.userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    const { rows } = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role = 'admin' RETURNING id, email`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Admin not found' });
    console.log(`[SUPER-ADMIN] Deleted admin: ${rows[0].email}`);
    return res.json({ success: true, message: `Admin ${rows[0].email} deleted` });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

/** GET /api/super-admin/all-nodes — Super Admin sees ALL nodes across the platform */
app.get('/api/super-admin/all-nodes', verifyToken, requireRole('super_admin'), async (_req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.display_name, n.ip_address, n.username, n.port, n.auth_type, n.region, n.status,
              n.uptime_output, n.error, n.created_at, n.updated_at, n.created_by,
              u.email AS created_by_email
       FROM nodes n
       LEFT JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC`
    );
    return res.json(rows.map((row: any) => ({
      id: row.id, displayName: row.display_name, ipAddress: row.ip_address,
      username: row.username, port: row.port, authType: row.auth_type,
      region: row.region, status: row.status, uptimeOutput: row.uptime_output,
      error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
      createdBy: row.created_by, createdByEmail: row.created_by_email,
    })));
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// BULK sync node assignments for a user (admin/employee)
// Body: { userId: string, nodeIds: string[] }
// --------------------------------------------------
app.post('/api/admin/assign-node', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { userId, nodeIds } = req.body as { userId: string; nodeIds: string[] };

    if (!userId || typeof userId !== 'string') return res.status(400).json({ message: 'userId is required' });
    if (!Array.isArray(nodeIds)) return res.status(400).json({ message: 'nodeIds must be an array' });

    const { rows: knownRows } = await pool.query('SELECT id FROM nodes');
    const knownIds    = new Set(knownRows.map((n: any) => n.id));
    const validIds    = nodeIds.filter(id => knownIds.has(id));
    const rejectedIds = nodeIds.filter(id => !knownIds.has(id));

    if (rejectedIds.length > 0) console.warn('[ASSIGN] rejected unknown node IDs:', rejectedIds);

    await pool.query('DELETE FROM node_assignments WHERE user_id = $1', [userId]);
    console.log('[ASSIGN] Cleared existing assignments for user', userId);

    const insertErrors: string[] = [];
    for (const node_id of validIds) {
      try {
        await pool.query(
          'INSERT INTO node_assignments (user_id, node_id, created_by) VALUES ($1, $2, $3) ON CONFLICT (user_id, node_id) DO NOTHING',
          [userId, node_id, req.userId]
        );
        console.log(`[ASSIGN] ✓ Assigned node ${node_id} → user ${userId}`);
      } catch (e: any) {
        insertErrors.push(`${node_id}: ${e.message}`);
      }
    }

    if (insertErrors.length > 0) return res.status(207).json({ success: false, assigned: validIds.length - insertErrors.length, errors: insertErrors });
    return res.json({ success: true, assigned: validIds.length, rejected: rejectedIds });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Remove a single node assignment
// --------------------------------------------------
app.delete('/api/admin/assign-node', verifyToken, requireRole('admin', 'employee'), async (req: AuthedRequest, res) => {
  try {
    const { user_id, node_id } = req.body as { user_id: string; node_id: string };
    if (!user_id || !node_id) return res.status(400).json({ message: 'user_id and node_id are required' });
    await pool.query('DELETE FROM node_assignments WHERE user_id = $1 AND node_id = $2', [user_id, node_id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});



app.get('/api/nodes', verifyToken, async (req: AuthedRequest, res) => {
  try {
    const mapRow = (row: any) => ({
      id: row.id, displayName: row.display_name, ipAddress: row.ip_address,
      username: row.username, port: row.port, authType: row.auth_type,
      region: row.region, status: row.status, uptimeOutput: row.uptime_output,
      error: row.error, createdAt: row.created_at, updatedAt: row.updated_at,
    });

    // Super admin: sees only THEIR OWN nodes (created_by = their ID)
    if (isSuperAdmin(req)) {
      const { rows } = await pool.query(
        'SELECT id,display_name,ip_address,username,port,auth_type,region,status,uptime_output,error,created_at,updated_at FROM nodes WHERE created_by = $1 ORDER BY created_at DESC',
        [req.userId]
      );
      return res.json(rows.map(mapRow));
    }

    // Admin: sees only nodes THEY created
    if (req.userRole === 'admin') {
      const { rows } = await pool.query(
        'SELECT id,display_name,ip_address,username,port,auth_type,region,status,uptime_output,error,created_at,updated_at FROM nodes WHERE created_by = $1 ORDER BY created_at DESC',
        [req.userId]
      );
      return res.json(rows.map(mapRow));
    }

    // Employee / Intern: sees only explicitly assigned nodes
    const { rows } = await pool.query(
      'SELECT n.id,n.display_name,n.ip_address,n.username,n.port,n.auth_type,n.region,n.status,n.uptime_output,n.error,n.created_at,n.updated_at FROM nodes n WHERE n.id IN (SELECT node_id FROM node_assignments WHERE user_id = $1) ORDER BY n.created_at DESC',
      [req.userId]
    );
    return res.json(rows.map(mapRow));
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

app.get('/api/nodes/:id', verifyToken, async (req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,display_name,ip_address,username,port,auth_type,region,status,uptime_output,error,created_at,updated_at FROM nodes WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Node not found' });
    const row = rows[0];
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

app.post('/api/nodes', verifyToken, requireRole('admin', 'employee', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    // ── Quota check for admin/super_admin ───────────────────────────────
    if (req.userRole === 'admin' || req.userRole === 'super_admin') {
      const { rows: qRows } = await pool.query(
        'SELECT node_limit, (SELECT COUNT(*) FROM nodes WHERE created_by = $1) AS current_count FROM users WHERE id = $1',
        [req.userId]
      );
      const q = qRows[0];
      if (q && Number(q.current_count) >= Number(q.node_limit)) {
        return res.status(403).json({ success: false, message: `Node quota exceeded. Limit: ${q.node_limit}. Contact your Super Admin to increase the limit.` });
      }
    }

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

    // INSERT into PostgreSQL
    const { rows: insertedRows } = await pool.query(
      `INSERT INTO nodes (display_name,ip_address,username,port,auth_type,credential,region,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'connecting',$8)
       RETURNING id,display_name,ip_address,username,port,auth_type,region,status,created_at,updated_at`,
      [displayName, ipAddress, username, port, authType, encryptedCredential, region, req.userId]
    );
    if (!insertedRows[0]) {
      return res.status(500).json({ success: false, message: 'Failed to create node' });
    }
    const row = insertedRows[0];
    const nodeId = row.id as string;

    // Auto-assign to the creator
    void (async () => {
      try {
        await pool.query(
          'INSERT INTO node_assignments (user_id,node_id,created_by) VALUES ($1,$2,$3) ON CONFLICT (user_id,node_id) DO NOTHING',
          [req.userId, nodeId, req.userId]
        );
        console.log(`[NODE] Auto-assigned node ${nodeId} → creator ${req.userId}`);
      } catch (e: any) {
        console.warn('[NODE] Auto-assign failed:', e?.message);
      }
    })();

    // Notify the admin who added the node
    void (async () => {
      try {
        const { rows: adminRows } = await pool.query(
          'SELECT email FROM users WHERE id = $1', [req.userId]
        );
        const adminEmail = adminRows[0]?.email;
        if (adminEmail) {
          await dispatchEmail(pool, 'node_notify_mail', adminEmail, { nodeName: displayName });
        }
      } catch (e: any) {
        console.warn('[MAILER] node_notify_mail non-fatal:', e?.message);
      }
    })();

    const safe = {
      id: nodeId, displayName: row.display_name, ipAddress: row.ip_address,
      username: row.username, port: row.port, authType: row.auth_type,
      region: row.region, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
    res.status(201).json(safe);

    // Background SSH test → update PostgreSQL
    const nodeForSSH: NodeRecord = { ...safe, credential, status: 'connecting', updatedAt: nowIso(), createdAt: nowIso() };
    void testSSH(nodeForSSH).then(async (result) => {
      try {
        await pool.query(
          'UPDATE nodes SET status=$1,uptime_output=$2,error=$3,updated_at=$4 WHERE id=$5',
          [result.success ? 'online' : 'offline', result.uptimeOutput ?? null, result.success ? null : result.message, nowIso(), nodeId]
        );
        console.log(`[BG-SSH] '${displayName}' → ${result.success ? 'online' : 'offline'}${result.success ? '' : ` | ${result.message}`}`);
      } catch {}
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

app.put('/api/nodes/:id', verifyToken, requireRole('admin', 'employee', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    const nodeId = req.params.id;

    // Fetch existing to get current credential if not replaced
    const { rows: existingRows } = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId]);
    if (!existingRows[0]) return res.status(404).json({ message: 'Node not found' });
    const old = existingRows[0];
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

    await pool.query(
      `UPDATE nodes SET display_name=$1,ip_address=$2,username=$3,port=$4,auth_type=$5,region=$6,status=$7,updated_at=$8${updates.credential ? ',credential=$9' : ''} WHERE id=${updates.credential ? '$10' : '$9'}`,
      updates.credential
        ? [updates.display_name,updates.ip_address,updates.username,updates.port,updates.auth_type,updates.region,updates.status,updates.updated_at,updates.credential,nodeId]
        : [updates.display_name,updates.ip_address,updates.username,updates.port,updates.auth_type,updates.region,updates.status,updates.updated_at,nodeId]
    );

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
        await pool.query(
          'UPDATE nodes SET status=$1,uptime_output=$2,error=$3,updated_at=$4 WHERE id=$5',
          [result.success ? 'online' : 'offline', result.uptimeOutput ?? null, result.success ? null : result.message, nowIso(), nodeId]
        );
        console.log(`[BG-SSH] Updated '${updates.display_name}' → ${result.success ? 'online' : 'offline'}`);
      } catch {}
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

app.delete('/api/nodes/:id', verifyToken, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM nodes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// User Management API (admin / employee controlled)
// --------------------------------------------------

app.post('/api/users/create', verifyToken, requireRole('admin', 'employee', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { email, role, created_by, skipEmail } = req.body as {
      email: string; password?: string; role: string; created_by?: string; skipEmail?: string;
    };

    // Role-based restriction
    if (req.userRole === 'employee' && role !== 'intern') {
      return res.status(403).json({ message: 'Employees can only create intern accounts' });
    }
    if (!email || !role) {
      return res.status(400).json({ message: 'email and role are required' });
    }

    // ── Quota check ───────────────────────────────────────────────────────────
    if (req.userRole === 'admin' || req.userRole === 'super_admin') {
      const { rows: qRows } = await pool.query(
        'SELECT user_limit, (SELECT COUNT(*) FROM users WHERE created_by = $1) AS current_count FROM users WHERE id = $1',
        [req.userId]
      );
      const q = qRows[0];
      if (q && Number(q.current_count) >= Number(q.user_limit)) {
        return res.status(403).json({
          message: `User quota exceeded (limit: ${q.user_limit}). Contact your Super Admin to raise the limit.`,
        });
      }
    }

    // Auto-generate a secure temp password if caller did not supply one
    const plainPassword: string =
      (req.body.password && String(req.body.password).trim().length >= 8)
        ? String(req.body.password).trim()
        : generateTempPassword();

    // Hash and persist
    const hash = await bcrypt.hash(plainPassword, 12);
    const { rows: newUserRows } = await pool.query(
      'INSERT INTO users (email, password_hash, role, created_by) VALUES ($1, $2, $3, $4) RETURNING id, email, role, created_at',
      [email.toLowerCase().trim(), hash, role, created_by || req.userId]
    );
    if (!newUserRows[0]) return res.status(500).json({ message: 'Failed to create user' });
    console.log(`[CREATE-USER] ✓ ${email} (${role}) — temp password generated server-side`);

    // ── Dispatch welcome email — only when admin did NOT set a manual password ──
    const cleanEmail = email.toLowerCase().trim();
    if (skipEmail !== 'true') {
      void dispatchEmail(pool, 'welcome_mail', cleanEmail, {
        name:     cleanEmail.split('@')[0],
        password: plainPassword,
      }).then(r => {
        if (r.sent) console.log(`[MAILER] ✓ welcome_mail → ${cleanEmail}`);
        else        console.warn(`[MAILER] ✗ Could not send welcome_mail to ${cleanEmail}: ${r.error}`);
      }).catch((e: any) => console.warn('[MAILER] Non-fatal:', e?.message));
    } else {
      console.log(`[CREATE-USER] skipEmail=true — no welcome mail sent for ${cleanEmail}`);
    }

    return res.status(201).json(newUserRows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ message: 'An account with this email has already been registered.' });
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});


app.delete('/api/users/:id', verifyToken, requireRole('admin', 'employee', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    const targetId = req.params.id;

    // Employees can only delete their own interns
    if (req.userRole === 'employee') {
      const { rows: tgt } = await pool.query('SELECT created_by, role FROM users WHERE id = $1', [targetId]);
      if (!tgt[0] || tgt[0].created_by !== req.userId || tgt[0].role !== 'intern') {
        return res.status(403).json({ message: 'You can only delete interns you created' });
      }
    }
    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Users list (scoped by role hierarchy)
// --------------------------------------------------
app.get('/api/users', verifyToken, requireRole('admin', 'employee', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    // Super admin sees ALL users
    if (isSuperAdmin(req)) {
      const { rows } = await pool.query(
        'SELECT id, email, role, created_by, created_at FROM users ORDER BY created_at ASC'
      );
      return res.json(rows);
    }
    // Admin / employee: sees only users they directly created
    const { rows } = await pool.query(
      'SELECT id, email, role, created_by, created_at FROM users WHERE created_by = $1',
      [req.userId]
    );
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Node assignment endpoints
// --------------------------------------------------

// GET /api/users/:id/assignments — list node_ids assigned to a user
app.get('/api/users/:id/assignments', verifyToken, requireRole('admin', 'employee', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    const targetId = req.params.id;

    // Super admin can view anyone's assignments
    if (isSuperAdmin(req)) {
      const { rows } = await pool.query('SELECT node_id FROM node_assignments WHERE user_id = $1', [targetId]);
      return res.json(rows);
    }

    // Employees can only view assignments for their own interns
    if (req.userRole === 'employee') {
      const { rows: tgt } = await pool.query('SELECT created_by FROM users WHERE id = $1', [targetId]);
      if (!tgt[0] || tgt[0].created_by !== req.userId) return res.status(403).json({ message: 'Access denied' });
    }
    const { rows } = await pool.query('SELECT node_id FROM node_assignments WHERE user_id = $1', [targetId]);
    return res.json(rows);
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
      const { rows: myA } = await pool.query('SELECT node_id FROM node_assignments WHERE user_id=$1 AND node_id=$2', [req.userId, node_id]);
      if (!myA[0]) return res.status(403).json({ message: 'You can only assign nodes that are assigned to you' });
      const { rows: tgt } = await pool.query('SELECT created_by FROM users WHERE id = $1', [targetId]);
      if (!tgt[0] || tgt[0].created_by !== req.userId) return res.status(403).json({ message: 'Access denied' });
    }
    await pool.query(
      'INSERT INTO node_assignments (user_id,node_id,created_by) VALUES ($1,$2,$3) ON CONFLICT (user_id,node_id) DO NOTHING',
      [targetId, node_id, req.userId]
    );
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
      const { rows: tgt } = await pool.query('SELECT created_by FROM users WHERE id = $1', [targetId]);
      if (!tgt[0] || tgt[0].created_by !== req.userId) return res.status(403).json({ message: 'Access denied' });
    }
    await pool.query('DELETE FROM node_assignments WHERE user_id=$1 AND node_id=$2', [targetId, nodeId]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Docker-enabled toggle for a user (admin / super_admin)
// --------------------------------------------------

/** PATCH /api/users/:id/docker-toggle */
app.patch('/api/users/:id/docker-toggle', verifyToken, requireRole('admin', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { docker_enabled } = req.body as { docker_enabled: boolean };
    if (typeof docker_enabled !== 'boolean') {
      return res.status(400).json({ message: 'docker_enabled (boolean) is required' });
    }
    const { rows } = await pool.query(
      'UPDATE users SET docker_enabled = $1 WHERE id = $2 RETURNING id, email, docker_enabled',
      [docker_enabled, id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    console.log(`[DOCKER] docker_enabled=${docker_enabled} set for user ${rows[0].email}`);
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Server error' });
  }
});

// --------------------------------------------------
// Docker Full Data — GET /api/nodes/:id/docker-full
// Permission: user must have docker_enabled = true
// --------------------------------------------------

/** Safe container ID: hex 64 chars max (short or full SHA) */
const DOCKER_ID_RE = /^[a-f0-9A-F_][a-zA-Z0-9_\-\.]{0,127}$/;
function assertDockerSafeId(value: string, field = 'containerId') {
  if (!DOCKER_ID_RE.test(value)) {
    throw new Error(`Invalid ${field}: only alphanumeric, hyphen, dot, and underscore allowed.`);
  }
}

/** Load a node row and decrypt its credential — shared by docker routes */
async function loadNodeForDocker(nodeId: string): Promise<NodeRecord> {
  const { rows } = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId]);
  if (!rows[0]) throw new Error('Node not found');
  const r = rows[0];
  return {
    id: r.id, displayName: r.display_name, ipAddress: r.ip_address,
    username: r.username, port: r.port ?? 22, authType: r.auth_type,
    credential: (() => { try { return decryptCredential(r.credential); } catch { return r.credential; } })(),
    region: r.region, status: r.status,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** Check docker access: admin/super_admin bypass; others need docker_enabled = true */
async function requireDockerEnabled(req: AuthedRequest, res: express.Response): Promise<boolean> {
  // Admins and super admins always have full Docker access
  if (req.userRole === 'admin' || req.userRole === 'super_admin') return true;
  // For employee/intern: check the docker_enabled flag
  const { rows } = await pool.query('SELECT docker_enabled FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]?.docker_enabled) {
    res.status(403).json({ message: 'Docker Management is not enabled for your account. Ask your Admin.' });
    return false;
  }
  return true;
}

app.get('/api/nodes/:id/docker-full', verifyToken, async (req: AuthedRequest, res) => {
  try {
    if (!await requireDockerEnabled(req, res)) return;

    const node = await loadNodeForDocker(req.params.id);
    const ssh  = await connectSSH(node);

    type JsonLine = Record<string, any>;
    const parseJsonLines = (raw: string): JsonLine[] => {
      if (!raw || raw.includes('DOCKER_NOT_FOUND')) return [];
      return raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean) as JsonLine[];
    };

    try {
      const [
        psRaw, imagesRaw, volumesRaw, networksRaw, composeRaw, statsRaw,
      ] = await Promise.all([
        sshExec(ssh, `docker ps -a --format '{{json .}}' 2>/dev/null || echo 'DOCKER_NOT_FOUND'`),
        sshExec(ssh, `docker images --format '{{json .}}' 2>/dev/null || echo 'DOCKER_NOT_FOUND'`),
        sshExec(ssh, `docker volume ls --format '{{json .}}' 2>/dev/null || echo 'DOCKER_NOT_FOUND'`),
        sshExec(ssh, `docker network ls --format '{{json .}}' 2>/dev/null || echo 'DOCKER_NOT_FOUND'`),
        sshExec(ssh, `docker compose ls --format json 2>/dev/null || docker-compose ls --format json 2>/dev/null || echo '[]'`),
        sshExec(ssh, `docker stats --no-stream --format '{{json .}}' 2>/dev/null || echo 'DOCKER_NOT_FOUND'`),
      ]);

      // Parse stats into a lookup map by container ID
      const statsMap: Record<string, JsonLine> = {};
      parseJsonLines(statsRaw).forEach(s => {
        if (s.ID || s.BlockIO) statsMap[String(s.ID ?? '').slice(0, 12)] = s;
      });

      // Merge stats into containers
      const containers = parseJsonLines(psRaw).map(c => ({
        ...c,
        stats: statsMap[String(c.ID ?? '').slice(0, 12)] ?? null,
      }));

      let stacks: JsonLine[] = [];
      try {
        const raw = composeRaw.trim();
        if (raw.startsWith('[') || raw.startsWith('{')) {
          stacks = JSON.parse(raw.startsWith('[') ? raw : `[${raw}]`);
        }
      } catch { stacks = []; }

      return res.json({
        nodeId: node.id,
        nodeName: node.displayName,
        containers,
        images: parseJsonLines(imagesRaw),
        volumes: parseJsonLines(volumesRaw),
        networks: parseJsonLines(networksRaw),
        stacks,
      });
    } finally {
      try { if (ssh.isConnected()) ssh.dispose(); } catch {}
    }
  } catch (err: any) {
    console.error('[DOCKER-FULL]', err.message);
    return res.status(500).json({ message: err.message || 'Docker data fetch failed' });
  }
});

// --------------------------------------------------
// Docker Container Actions  POST /api/nodes/:id/docker/container-action
// Body: { action: 'start'|'stop'|'restart'|'remove'|'logs', containerId: string }
// --------------------------------------------------

app.post('/api/nodes/:id/docker/container-action', verifyToken, async (req: AuthedRequest, res) => {
  try {
    if (!await requireDockerEnabled(req, res)) return;

    const { action, containerId } = req.body as { action: string; containerId: string };

    const ALLOWED_ACTIONS = ['start', 'stop', 'restart', 'remove', 'logs'] as const;
    if (!ALLOWED_ACTIONS.includes(action as any)) {
      return res.status(400).json({ message: `action must be one of: ${ALLOWED_ACTIONS.join(', ')}` });
    }
    if (!containerId) return res.status(400).json({ message: 'containerId is required' });
    assertDockerSafeId(containerId, 'containerId');

    const node = await loadNodeForDocker(req.params.id);
    const ssh  = await connectSSH(node);

    try {
      let cmd: string;
      if (action === 'remove') {
        cmd = `docker rm -f ${containerId}`;
      } else if (action === 'logs') {
        cmd = `docker logs --tail=200 ${containerId} 2>&1`;
      } else {
        cmd = `docker ${action} ${containerId}`;
      }

      const output = await sshExec(ssh, cmd);
      console.log(`[DOCKER-ACTION] ${action} ${containerId} on ${node.displayName}`);
      return res.json({ success: true, action, containerId, output });
    } finally {
      try { if (ssh.isConnected()) ssh.dispose(); } catch {}
    }
  } catch (err: any) {
    console.error('[DOCKER-ACTION]', err.message);
    return res.status(500).json({ message: err.message || 'Docker action failed' });
  }
});

// --------------------------------------------------
// Docker Prune  POST /api/nodes/:id/docker/prune
// Body: { target: 'images'|'volumes'|'system' }
// --------------------------------------------------

app.post('/api/nodes/:id/docker/prune', verifyToken, requireRole('admin', 'super_admin'), async (req: AuthedRequest, res) => {
  try {
    if (!await requireDockerEnabled(req, res)) return;

    const { target } = req.body as { target: string };
    const ALLOWED = ['images', 'volumes', 'system'] as const;
    if (!ALLOWED.includes(target as any)) {
      return res.status(400).json({ message: `target must be one of: ${ALLOWED.join(', ')}` });
    }

    const node = await loadNodeForDocker(req.params.id);
    const ssh  = await connectSSH(node);
    try {
      const cmd = target === 'system'
        ? 'docker system prune -af --volumes'
        : `docker ${target} prune -f`;
      const output = await sshExec(ssh, cmd);
      console.log(`[DOCKER-PRUNE] ${target} on ${node.displayName}`);
      return res.json({ success: true, target, output });
    } finally {
      try { if (ssh.isConnected()) ssh.dispose(); } catch {}
    }
  } catch (err: any) {
    console.error('[DOCKER-PRUNE]', err.message);
    return res.status(500).json({ message: err.message || 'Docker prune failed' });
  }
});

// --------------------------------------------------
// Docker Deep Inspection endpoints
// --------------------------------------------------


/** GET /api/nodes/:id/docker/containers/:cid/logs  — last 200 lines */
app.get('/api/nodes/:id/docker/containers/:cid/logs', verifyToken, async (req: AuthedRequest, res) => {
  try {
    if (!await requireDockerEnabled(req, res)) return;
    assertDockerSafeId(req.params.cid, 'containerId');
    const node = await loadNodeForDocker(req.params.id);
    const ssh  = await connectSSH(node);
    try {
      const out = await sshExec(ssh, `docker logs --tail=200 --timestamps ${req.params.cid} 2>&1`);
      return res.json({ ok: true, output: out });
    } finally { try { if (ssh.isConnected()) ssh.dispose(); } catch {} }
  } catch (err: any) { return res.status(500).json({ message: err.message }); }
});

/** GET /api/nodes/:id/docker/containers/:cid/inspect */
app.get('/api/nodes/:id/docker/containers/:cid/inspect', verifyToken, async (req: AuthedRequest, res) => {
  try {
    if (!await requireDockerEnabled(req, res)) return;
    assertDockerSafeId(req.params.cid, 'containerId');
    const node = await loadNodeForDocker(req.params.id);
    const ssh  = await connectSSH(node);
    try {
      const out = await sshExec(ssh, `docker inspect ${req.params.cid} 2>&1`);
      let parsed: any = out;
      try { parsed = JSON.parse(out); } catch {}
      return res.json({ ok: true, output: parsed });
    } finally { try { if (ssh.isConnected()) ssh.dispose(); } catch {} }
  } catch (err: any) { return res.status(500).json({ message: err.message }); }
});

/** GET /api/nodes/:id/docker/containers/:cid/files?path=/ */
app.get('/api/nodes/:id/docker/containers/:cid/files', verifyToken, async (req: AuthedRequest, res) => {
  try {
    if (!await requireDockerEnabled(req, res)) return;
    assertDockerSafeId(req.params.cid, 'containerId');
    const browsePath = (req.query.path as string) || '/';
    // Strictly allow only safe path characters
    if (!/^[a-zA-Z0-9/_.\-]+$/.test(browsePath)) {
      return res.status(400).json({ message: 'Invalid path' });
    }
    const node = await loadNodeForDocker(req.params.id);
    const ssh  = await connectSSH(node);
    try {
      const out = await sshExec(ssh, `docker exec ${req.params.cid} ls -pla "${browsePath}" 2>&1`);
      return res.json({ ok: true, path: browsePath, output: out });
    } finally { try { if (ssh.isConnected()) ssh.dispose(); } catch {} }
  } catch (err: any) { return res.status(500).json({ message: err.message }); }
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

  // ── 2. Authenticate via JWT ──────────────────────────────────────────
  if (!token) {
    ws.send('\r\n[terminal] Unauthorized: missing token\r\n');
    ws.close();
    return;
  }

  let wsUserId: string;
  let wsUserRole: string;
  try {
    const payload = verifyJwt(token);
    wsUserId   = payload.id;
    wsUserRole = payload.role;
  } catch {
    ws.send('\r\n[terminal] Unauthorized: invalid or expired token\r\n');
    ws.close();
    return;
  }

  // ── 3. Verify node assignment (super_admin & admin have full access; others need assignment) ──
  if (wsUserRole !== 'admin' && wsUserRole !== 'super_admin') {
    const { rows: asgn } = await pool.query(
      'SELECT node_id FROM node_assignments WHERE user_id=$1 AND node_id=$2',
      [wsUserId, nodeId]
    );
    if (!asgn[0]) {
      ws.send('\r\n[terminal] Forbidden: you are not assigned to this node\r\n');
      ws.close();
      return;
    }
  }

  // ── 4. Fetch node from PostgreSQL ─────────────────────────────────────
  const { rows: nodeRows } = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId]);
  if (!nodeRows[0]) {
    ws.send('\r\n[terminal] Node not found\r\n');
    ws.close();
    return;
  }
  const nodeRow = nodeRows[0];
  const node: NodeRecord = {
    id: nodeRow.id, displayName: nodeRow.display_name, ipAddress: nodeRow.ip_address,
    username: nodeRow.username, port: nodeRow.port, authType: nodeRow.auth_type,
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
        void pool.query(
        'UPDATE nodes SET status=$1,updated_at=$2,error=$3 WHERE id=$4',
        ['offline', metrics.timestamp, metrics.logs[0]?.message ?? null, node.id]
      );
      }
    } else {
      pollFailCount.set(node.id, 0);
      void pool.query(
        'UPDATE nodes SET status=$1,updated_at=$2,error=NULL WHERE id=$3',
        [metrics.status, metrics.timestamp, node.id]
      );
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
  const nodes = await readNodesFromDB();
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