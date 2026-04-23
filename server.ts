import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { NodeSSH } from 'node-ssh';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

// --------------------------------------------------
// Paths
// --------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NODES_FILE = path.join(__dirname, 'nodes.json');

// --------------------------------------------------
// Types
// --------------------------------------------------

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

async function collectMetrics(node: NodeRecord): Promise<NodeMetrics> {
  let ssh: NodeSSH | null = null;

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
    ] = await Promise.all([
      sshExec(ssh, `LC_ALL=C top -bn1 | grep "Cpu(s)" || top -bn1 | grep "%Cpu(s)" || echo "Cpu(s): 0.0 us, 0.0 sy, 100.0 id"`),
      sshExec(ssh, `free -m`),
      sshExec(ssh, `uptime -p || uptime`),
      sshExec(ssh, `cat /etc/os-release 2>/dev/null | grep "^PRETTY_NAME=" | cut -d= -f2 | tr -d '"' || uname -o`),
      sshExec(ssh, `uname -r`),
      sshExec(ssh, `lscpu 2>/dev/null | grep "Model name:" | sed 's/Model name:[[:space:]]*//' || cat /proc/cpuinfo | grep "model name" | head -n1 | cut -d: -f2 | sed 's/^ *//' || echo "unknown"`),
      sshExec(ssh, `nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 0`),
      sshExec(ssh, `tail -n 20 /var/log/syslog 2>/dev/null || tail -n 20 /var/log/messages 2>/dev/null || journalctl -n 20 --no-pager 2>/dev/null || echo "No logs available"`),
    ]);

    const cpu = parseCpu(cpuOut);
    const mem = parseMemory(memOut);
    const ramPercent = mem.total > 0 ? Math.round((mem.used / mem.total) * 100) : 0;
    const status: 'online' | 'warning' = (cpu > 85 || ramPercent > 90) ? 'warning' : 'online';

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
      diskRead: 0,
      diskWrite: 0,
      netIn: 0,
      netOut: 0,
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
      diskRead: 0,
      diskWrite: 0,
      netIn: 0,
      netOut: 0,
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}  ct:${req.headers['content-type'] ?? 'none'}`);
  }
  next();
});

// --------------------------------------------------
// API
// --------------------------------------------------

app.get('/api/status', (_req, res) => {
  res.json({ status: 'operational', version: '5.0.0' });
});

app.get('/api/nodes', (_req, res) => {
  const safe = readNodes().map(({ credential, ...rest }) => rest);
  res.json(safe);
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

app.post('/api/nodes', async (req, res) => {
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

app.delete('/api/nodes/:id', (req, res) => {
  const nodes = readNodes();
  const filtered = nodes.filter(n => n.id !== req.params.id);

  if (filtered.length === nodes.length) {
    return res.status(404).json({ message: 'Node not found' });
  }

  writeNodes(filtered);
  res.json({ success: true });
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
  if (pollingMap.get(node.id)) return;
  pollingMap.set(node.id, true);

  try {
    const metrics = await collectMetrics(node);
    broadcastMetrics(metrics);

    const all = readNodes();
    const idx = all.findIndex(n => n.id === node.id);

    if (idx !== -1) {
      all[idx].status = metrics.status;
      all[idx].updatedAt = metrics.timestamp;
      all[idx].uptimeOutput = metrics.uptime;
      all[idx].error = metrics.status === 'offline' ? metrics.logs[0]?.message : undefined;
      writeNodes(all);
    }

    console.log(
      `[POLL] ${node.displayName} (${node.ipAddress}) → cpu=${metrics.cpu.toFixed(1)}% ram=${metrics.ramPercent}% status=${metrics.status}` +
      (metrics.status === 'offline' ? ` | ${metrics.logs[0]?.message ?? 'offline'}` : '')
    );
  } catch (err: any) {
    console.error(`[POLL] Error polling ${node.displayName}:`, err?.message || err);
  } finally {
    pollingMap.set(node.id, false);
  }
}

function pollAllNodes() {
  const nodes = readNodes();
  if (!nodes.length) return;

  console.log(`[POLL] Starting poll cycle — ${nodes.length} node(s)`);
  for (const node of nodes) {
    void pollNode(node);
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