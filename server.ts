import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { NodeSSH } from 'node-ssh';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

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
const NODES_FILE = path.join(__dirname, 'nodes.json');

// --------------------------------------------------
// Types
// --------------------------------------------------
/**
 * Parse `iostat -d 1 2` output.
 * We grab the LAST device block (second sample) and sum kB_read/s + kB_wrtn/s.
 * Returns MB/s values. Returns {0,0} on any parse failure.
 */
function parseIostat(raw: string): { diskRead: number; diskWrite: number } {
  try {
    // Split into two samples separated by blank lines; take the last one
    const blocks = raw.split(/\n\s*\n/).filter(b => b.trim());
    const sample = blocks[blocks.length - 1] || '';
    const lines = sample.split('\n').map(l => l.trim()).filter(Boolean);

    let readKB = 0;
    let writeKB = 0;

    // Header line looks like: Device  tps  kB_read/s  kB_wrtn/s  kB_read  kB_wrtn
    const headerLine = lines.find(l => /kB_read/i.test(l));
    if (!headerLine) return { diskRead: 0, diskWrite: 0 };

    const headers = headerLine.split(/\s+/);
    const readIdx  = headers.findIndex(h => /kB_read\/s/i.test(h));
    const writeIdx = headers.findIndex(h => /kB_wrtn\/s/i.test(h));
    if (readIdx === -1 || writeIdx === -1) return { diskRead: 0, diskWrite: 0 };

    for (const line of lines) {
      if (/^Device|^Linux|^\s*$/.test(line)) continue;
      const cols = line.split(/\s+/);
      if (cols.length <= Math.max(readIdx, writeIdx)) continue;
      readKB  += parseFloat(cols[readIdx]  || '0') || 0;
      writeKB += parseFloat(cols[writeIdx] || '0') || 0;
    }

    return {
      diskRead:  readKB  / 1024,   // convert KB/s → MB/s
      diskWrite: writeKB / 1024,
    };
  } catch {
    return { diskRead: 0, diskWrite: 0 };
  }
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

function readNodes(): NodeRecord[] {
  try {
    if (!fs.existsSync(NODES_FILE)) return [];
    const raw = fs.readFileSync(NODES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeNodes(nodes: NodeRecord[]) {
  fs.writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2), 'utf8');
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

  // Always initialise so the catch block can safely reference them
  let diskRead  = 0;
  let diskWrite = 0;
  let netIn     = 0;
  let netOut    = 0;

  try {
    ssh = await connectSSH(node);

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
    ] = await Promise.all([
      sshExec(ssh, `LC_ALL=C top -bn1 | grep 'Cpu(s)' || top -bn1 | grep '%Cpu(s)' || echo 'Cpu(s): 0.0 us, 0.0 sy, 100.0 id'`),
      sshExec(ssh, `free -m`),
      sshExec(ssh, `uptime -p || uptime`),
      sshExec(ssh, `cat /etc/os-release 2>/dev/null | grep '^PRETTY_NAME=' | cut -d= -f2 | tr -d '"' || uname -o`),
      sshExec(ssh, `uname -r`),
      sshExec(ssh, `lscpu 2>/dev/null | grep 'Model name:' | sed 's/Model name:[[:space:]]*//' || cat /proc/cpuinfo | grep 'model name' | head -n1 | cut -d: -f2 | sed 's/^ *//' || echo 'unknown'`),
      sshExec(ssh, `nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 0`),
      sshExec(ssh, `tail -n 20 /var/log/syslog 2>/dev/null || tail -n 20 /var/log/messages 2>/dev/null || journalctl -n 20 --no-pager 2>/dev/null || echo 'No logs available'`),
      // iostat: 1-second sample, 2 readings; fall back gracefully if not installed
      sshExec(ssh, `iostat -d 1 2 2>/dev/null || echo ''`),
    ]);

    const cpu = parseCpu(cpuOut);
    const mem = parseMemory(memOut);
    const ramPercent = mem.total > 0 ? Math.round((mem.used / mem.total) * 100) : 0;

    // Disk I/O via iostat (graceful zero if missing)
    const diskIO = parseIostat(iostatOut);
    diskRead  = diskIO.diskRead;
    diskWrite = diskIO.diskWrite;

    const status: 'online' | 'warning' = (cpu > 85 || ramPercent > 90) ? 'warning' : 'online';

    // Reset fail counter on success
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
// API
// --------------------------------------------------
app.post('/api/nodes/:id/reboot', async (req, res) => {
  try {
    const { id } = req.params;

    const node = readNodes().find(n => n.id === id);
    if (!node) {
      return res.status(404).json({ message: 'Node not found' });
    }

    await runSSHCommand(
      node,
      'nohup sudo systemctl reboot >/dev/null 2>&1 &'
    );

    return res.json({
      success: true,
      message: 'Reboot command sent',
    });
  } catch (err: any) {
    console.error('Reboot failed:', err);
    return res.status(500).json({
      message: err?.message || 'Failed to reboot node',
    });
  }
});

app.get('/api/status', (_req, res) => {
  res.json({ status: 'operational', version: '5.0.0' });
});

app.get('/api/nodes', verifyToken, async (req: AuthedRequest, res) => {
  const allNodes = readNodes().map(({ credential, ...rest }) => rest);

  // Admins see everything
  if (req.userRole === 'admin') return res.json(allNodes);

  // Employees / Interns: only nodes assigned to them
  const { data: assignments } = await supabaseAdmin
    .from('node_assignments')
    .select('node_id')
    .eq('user_id', req.userId!);

  const assignedIds = new Set((assignments ?? []).map((a: any) => a.node_id));
  return res.json(allNodes.filter(n => assignedIds.has(n.id)));
});

app.get('/api/nodes/:id', (req, res) => {
  const node = readNodes().find(n => n.id === req.params.id);
  if (!node) return res.status(404).json({ message: 'Node not found' });

  const { credential, ...safe } = node;
  res.json(safe);
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

app.post('/api/nodes', verifyToken, requireRole('admin'), async (req: AuthedRequest, res) => {
  try {
    const node: NodeRecord = {
      id: randomUUID(),
      displayName: safeStr(req.body?.displayName),
      ipAddress: safeStr(req.body?.ipAddress),
      username: safeStr(req.body?.username),
      port: safePort(req.body?.port, 22),
      authType: (safeStr(req.body?.authType) || 'password') as 'password' | 'privateKey',
      credential: String(req.body?.credential ?? ''),
      region: safeStr(req.body?.region) || 'US-East-1',
      status: 'connecting',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    if (!node.displayName || !node.ipAddress || !node.username || !node.credential) {
      return res.status(400).json({
        success: false,
        message: 'Missing displayName, ipAddress, username, or credential.',
      });
    }

    const nodes = readNodes();
    nodes.unshift(node);
    writeNodes(nodes);

    const { credential, ...safe } = node;
    res.status(201).json(safe);

    void testSSH(node).then((result) => {
      const all = readNodes();
      const idx = all.findIndex(n => n.id === node.id);
      if (idx !== -1) {
        all[idx].status = result.success ? 'online' : 'offline';
        all[idx].updatedAt = nowIso();
        all[idx].uptimeOutput = result.uptimeOutput;
        all[idx].error = result.success ? undefined : result.message;
        writeNodes(all);
        console.log(`[BG-SSH] '${all[idx].displayName}' → ${all[idx].status}${result.success ? '' : ` | ${result.message}`}`);
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

app.put('/api/nodes/:id', async (req, res) => {
  try {
    const nodes = readNodes();
    const idx = nodes.findIndex(n => n.id === req.params.id);

    if (idx === -1) return res.status(404).json({ message: 'Node not found' });

    const old = nodes[idx];
    const updated: NodeRecord = {
      ...old,
      displayName: safeStr(req.body?.displayName ?? old.displayName),
      ipAddress: safeStr(req.body?.ipAddress ?? old.ipAddress),
      username: safeStr(req.body?.username ?? old.username),
      port: safePort(req.body?.port ?? old.port, 22),
      authType: (safeStr(req.body?.authType ?? old.authType) || 'password') as 'password' | 'privateKey',
      credential: req.body?.credential ? String(req.body.credential) : old.credential,
      region: safeStr(req.body?.region ?? old.region),
      status: 'connecting',
      updatedAt: nowIso(),
    };

    nodes[idx] = updated;
    writeNodes(nodes);

    const { credential, ...safe } = updated;
    res.json(safe);

    void testSSH(updated).then((result) => {
      const all = readNodes();
      const i = all.findIndex(n => n.id === updated.id);
      if (i !== -1) {
        all[i].status = result.success ? 'online' : 'offline';
        all[i].updatedAt = nowIso();
        all[i].uptimeOutput = result.uptimeOutput;
        all[i].error = result.success ? undefined : result.message;
        writeNodes(all);
        console.log(`[BG-SSH] Updated '${all[i].displayName}' → ${all[i].status}${result.success ? '' : ` | ${result.message}`}`);
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Server error' });
  }
});

app.delete('/api/nodes/:id', verifyToken, requireRole('admin'), (req, res) => {
  const nodes = readNodes();
  const filtered = nodes.filter(n => n.id !== req.params.id);

  if (filtered.length === nodes.length) {
    return res.status(404).json({ message: 'Node not found' });
  }

  writeNodes(filtered);
  res.json({ success: true });
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

    // Upsert profile with role + created_by
    await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id,
      email,
      role,
      created_by: created_by || req.userId,
    });

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

terminalWss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', 'http://localhost');
  const nodeId = url.searchParams.get('nodeId');

  if (!nodeId) {
    ws.send('\r\n[terminal] Missing nodeId\r\n');
    ws.close();
    return;
  }

  const node = readNodes().find(n => n.id === nodeId);
  if (!node) {
    ws.send('\r\n[terminal] Node not found\r\n');
    ws.close();
    return;
  }

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

    // --- Update local JSON store ---
    const all = readNodes();
    const idx = all.findIndex(n => n.id === node.id);
    if (idx !== -1) {
      all[idx].status     = metrics.status;
      all[idx].updatedAt  = metrics.timestamp;
      all[idx].uptimeOutput = metrics.uptime;
      all[idx].error      = metrics.status === 'offline' ? metrics.logs[0]?.message : undefined;
      writeNodes(all);
    }

    // --- Update Supabase (non-blocking) ---
    if (metrics.status === 'offline') {
      const fails = (pollFailCount.get(node.id) ?? 0) + 1;
      pollFailCount.set(node.id, fails);

      if (fails >= 3) {
        supabaseAdmin
          .from('nodes')
          .update({ status: 'offline', updated_at: metrics.timestamp, error: metrics.logs[0]?.message })
          .eq('id', node.id)
          .then(() => {})
          .catch(() => {});
      }
    } else {
      pollFailCount.set(node.id, 0);
      supabaseAdmin
        .from('nodes')
        .update({ status: metrics.status, updated_at: metrics.timestamp, error: null })
        .eq('id', node.id)
        .then(() => {})
        .catch(() => {});
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

function pollAllNodes() {
  const nodes = readNodes();
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