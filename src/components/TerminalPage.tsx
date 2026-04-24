import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronRight,
  Search,
  Bell,
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  Shield,
  Activity,
  Clock,
  Cpu,
  Terminal as TerminalIcon,
  Lock,
} from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useAuth } from '../context/AuthContext';

interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  username: string;
  port: number;
  region?: string;
  status: 'connecting' | 'online' | 'offline' | 'warning';
}

interface NodeMetrics {
  nodeId: string;
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  ramPercent: number;
  uptime: string;
}

interface TerminalPageProps {
  nodeId: string;
  onBack: () => void;
  /** Optional: all nodes list, for breadcrumb tab navigation */
  allNodes?: NodeRecord[];
  onNavigateNode?: (id: string) => void;
  role?: 'admin' | 'employee' | 'intern';
}

// ─── WebSocket URL helper ────────────────────────────────────────────────────

function getTerminalWsUrl(nodeId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/terminal?nodeId=${encodeURIComponent(nodeId)}`;
}

function getMetricsWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  if (window.location.port === '5173') return `${protocol}//${host}/ws`;
  return `${protocol}//${host}`;
}

// ─── Static demo data (sidebar) ─────────────────────────────────────────────

const DEMO_PROCESSES = [
  { name: 'sys_monitor',    cpu: 2.4 },
  { name: 'crypto_bridge',  cpu: 1.1 },
  { name: 'net_daemon',     cpu: 0.8 },
  { name: 'pulse_sync',     cpu: 4.2 },
];

const DEMO_COMMANDS = [
  'ssh -keygen -t ec25519',
  'tail -f /var/log/syslog',
  'netstat -tulpn',
  'docker-compose up -d',
  "grep -r 'error' .",
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function TerminalPage({ nodeId, onBack, allNodes, onNavigateNode, role }: TerminalPageProps) {
  const { session } = useAuth();
  const isIntern = role === 'intern';
  const containerRef  = useRef<HTMLDivElement | null>(null);
  const terminalRef   = useRef<Terminal | null>(null);
  const fitAddonRef   = useRef<FitAddon | null>(null);
  const socketRef     = useRef<WebSocket | null>(null);
  const metricsWsRef  = useRef<WebSocket | null>(null);

  const [node, setNode] = useState<NodeRecord | null>(null);
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [connStatus, setConnStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [commandHistory, setCommandHistory] = useState<string[]>(DEMO_COMMANDS);
  const [processes, setProcesses] = useState(DEMO_PROCESSES);
  const [uptime, setUptime] = useState('--');
  const [memDisplay, setMemDisplay] = useState('--');
  const [entropy, setEntropy] = useState(82);
  const [clock, setClock] = useState(new Date());

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch node info
  useEffect(() => {
    fetch(`/api/nodes/${nodeId}`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setNode(data); })
      .catch(() => {});
  }, [nodeId, session]);

  // Connect metrics WebSocket for live data
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getMetricsWsUrl());
      metricsWsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'nodeMetrics' && data.nodeId === nodeId) {
            setMetrics(data);
            setUptime(data.uptime || '--');
            setMemDisplay(`${data.ramUsed ?? '--'}/${data.ramTotal ?? '--'} MB`);
            // Wiggle entropy slightly for realism
            setEntropy(prev => Math.min(100, Math.max(70, prev + (Math.random() - 0.5) * 2)));
            // Update CPU for the first process
            setProcesses(prev => prev.map((p, i) =>
              i === 0 ? { ...p, cpu: parseFloat((data.cpu / 10).toFixed(1)) } : p
            ));
          }
        } catch {}
      };
    } catch {}

    return () => {
      try { ws?.close(); } catch {}
      metricsWsRef.current = null;
    };
  }, [nodeId]);

  // Connect terminal WebSocket + xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Courier New", monospace',
      convertEol: true,
      scrollback: 5000,
      theme: {
        background:    '#0A0A0A',
        foreground:    '#D4FF00',
        cursor:        '#D4FF00',
        cursorAccent:  '#0A0A0A',
        black:         '#0A0A0A',
        brightBlack:   '#333300',
        red:           '#FF3333',
        brightRed:     '#FF6666',
        green:         '#D4FF00',
        brightGreen:   '#E8FF66',
        yellow:        '#FFD700',
        brightYellow:  '#FFE566',
        blue:          '#00CCFF',
        brightBlue:    '#66DDFF',
        magenta:       '#FF00FF',
        brightMagenta: '#FF66FF',
        cyan:          '#00FFCC',
        brightCyan:    '#66FFE0',
        white:         '#CCCCCC',
        brightWhite:   '#FFFFFF',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    setConnStatus('connecting');
    term.writeln('\x1b[38;2;212;255;0m[ 0.000000] Initialising Sentinel-OS v4.2.0...\x1b[0m');
    term.writeln('\x1b[38;2;212;255;0mChecking secure enclave status... \x1b[32m[ OK ]\x1b[0m');
    term.writeln('\x1b[38;2;212;255;0mMounting encrypted data volumes... \x1b[32m[ OK ]\x1b[0m');
    term.writeln('\x1b[38;2;212;255;0mEstablishing encrypted bridge to Central Pulse... \x1b[32m[ OK ]\x1b[0m');
    term.writeln('');

    let ws: WebSocket;
    try {
      ws = new WebSocket(getTerminalWsUrl(nodeId));
    } catch (err) {
      term.writeln(`\x1b[31m[terminal] Failed to connect: ${String(err)}\x1b[0m`);
      setConnStatus('disconnected');
      return;
    }

    socketRef.current = ws;

    ws.onopen = () => {
      setConnStatus('connected');
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m[terminal] Connection error\x1b[0m\r\n');
      setConnStatus('disconnected');
    };

    ws.onclose = () => {
      setConnStatus('disconnected');
      term.writeln('\r\n\x1b[33m[terminal] Session disconnected\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (isIntern) {
        // Block all keyboard input for read-only mode
        return;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
      fitAddonRef.current?.fit();
      const dims = fitAddonRef.current?.proposeDimensions();
      if (dims && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    window.addEventListener('resize', handleResize);
    const t = setTimeout(handleResize, 100);

    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', handleResize);
      try { ws.close(); } catch {}
      try { term.dispose(); } catch {}
      terminalRef.current = null;
      fitAddonRef.current = null;
      socketRef.current   = null;
    };
  }, [nodeId]);

  const nodeName = node?.displayName ?? 'Alpha-7';
  const nodeSlug = nodeName.toLowerCase().replace(/\s+/g, '-');

  const statusColor =
    connStatus === 'connected'  ? '#D4FF00' :
    connStatus === 'connecting' ? '#FFD700' :
                                  '#FF4444';

  const colNum  = 16;
  const lineNum = 124;

  return (
    <div className="flex h-screen flex-col bg-[#050505] text-white overflow-hidden">

      {/* ── Top Navigation ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-[#1A1A00] bg-[#080800] px-6 py-3 flex-shrink-0">
        {/* Left: brand + breadcrumb */}
        <div className="flex items-center gap-4">
          <div className="mr-2">
            <p className="text-xs font-bold tracking-[0.25em] text-[#D4FF00] uppercase">Neon Sentry</p>
            <p className="text-[9px] text-[#D4FF00]/40 uppercase tracking-[0.15em]">Terminal › {nodeName}</p>
          </div>

          <ChevronRight size={14} className="text-[#D4FF00]/30" />

          {/* Back button */}
          <button
            onClick={onBack}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#D4FF00]/60 hover:text-[#D4FF00] hover:bg-[#D4FF00]/5 transition-colors"
          >
            ← Fleet
          </button>

          {/* Current node tab — always active */}
          <div className="rounded-md px-3 py-1.5 text-xs font-semibold bg-[#D4FF00]/10 text-[#D4FF00] border border-[#D4FF00]/30">
            {nodeName}
          </div>
        </div>

        {/* Right: search + icons */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#D4FF00]/40" />
            <input
              placeholder="Query system..."
              className="rounded-lg border border-[#D4FF00]/10 bg-[#0D0D00] pl-8 pr-3 py-1.5 text-xs text-[#D4FF00]/70 placeholder:text-[#D4FF00]/30 outline-none focus:border-[#D4FF00]/30 w-40"
            />
          </div>
          <button className="rounded-lg p-1.5 text-[#D4FF00]/40 hover:text-[#D4FF00] hover:bg-[#D4FF00]/5 transition-colors">
            <Bell size={16} />
          </button>
          <button className="rounded-lg p-1.5 text-[#D4FF00]/40 hover:text-[#D4FF00] hover:bg-[#D4FF00]/5 transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Terminal panel */}
        <div className="flex flex-1 flex-col overflow-hidden p-4 gap-3">

          {/* Mac-style window chrome */}
          <div className="flex flex-col flex-1 overflow-hidden rounded-xl border border-[#D4FF00]/15 bg-[#0A0A0A] shadow-[0_0_40px_rgba(212,255,0,0.06)]">

            {/* Window title bar */}
            <div className="flex items-center justify-between border-b border-[#1A1A00] bg-[#0C0C00] px-4 py-2.5 flex-shrink-0">
              <div className="flex items-center gap-3">
                {/* Traffic light dots */}
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)] cursor-pointer hover:brightness-125" title="Close" />
                  <span className="h-3 w-3 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.9)] cursor-pointer hover:brightness-125" title="Minimise" />
                  <span className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.9)] cursor-pointer hover:brightness-125" title="Maximise" />
                </div>
                <span className="text-[11px] font-mono text-[#D4FF00]/50 ml-2">
                  root@{nodeSlug}: /var/log
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Live indicator */}
                <div
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: statusColor,
                    borderColor: `${statusColor}40`,
                    backgroundColor: `${statusColor}10`,
                  }}
                >
                  {connStatus === 'connecting' ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : connStatus === 'connected' ? (
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: statusColor }} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
                  )}
                  {connStatus === 'connected' ? 'System Live' : connStatus === 'connecting' ? 'Connecting' : 'Offline'}
                </div>
                <span className="text-[10px] font-mono text-[#D4FF00]/30">
                  SSH : {node?.port ?? 22}
                </span>
              </div>
            </div>

            {/* xterm.js container */}
            <div
              className="flex-1 overflow-hidden p-2 relative"
              style={{ background: '#0A0A0A' }}
            >
              {isIntern && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
                  <Lock size={10} /> Read-Only Mode — Input Disabled
                </div>
              )}
              <div
                ref={containerRef}
                className="h-full w-full"
                style={{ filter: 'drop-shadow(0 0 10px rgba(212,255,0,0.12))' }}
              />
            </div>

            {/* Footer status bar */}
            <div className="flex items-center justify-between border-t border-[#1A1A00] bg-[#0C0C00] px-4 py-1.5 flex-shrink-0">
              <div className="flex items-center gap-4 text-[10px] font-mono text-[#D4FF00]/40">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4FF00] animate-pulse" />
                  Uptime: {uptime}
                </span>
                <span>● Mem: {memDisplay}</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono text-[#D4FF00]/40">
                <span>UTF-8</span>
                <span>Line: {lineNum}  Col: {colNum}</span>
                <span>INS</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ────────────────────────────────────────────── */}
        <aside className="w-52 flex-shrink-0 border-l border-[#1A1A00] bg-[#080800] flex flex-col overflow-hidden">

          {/* Active Processes */}
          <div className="border-b border-[#1A1A00] p-4">
            <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[#D4FF00]/50">
              Active Processes
            </p>
            <div className="space-y-2">
              {processes.map((proc) => {
                const cpuColor =
                  proc.cpu > 5 ? '#FF4444' :
                  proc.cpu > 3 ? '#FFD700' : '#D4FF00';
                return (
                  <div key={proc.name} className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-[#D4FF00]/70 truncate max-w-[100px]">
                      {proc.name}
                    </span>
                    <span
                      className="text-[11px] font-bold font-mono"
                      style={{ color: cpuColor }}
                    >
                      {proc.cpu.toFixed(1)}% CPU
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Command History */}
          <div className="border-b border-[#1A1A00] p-4 flex-1 overflow-hidden">
            <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[#D4FF00]/50">
              Command History
            </p>
            <div className="space-y-1.5 overflow-auto max-h-48">
              {commandHistory.map((cmd, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (socketRef.current?.readyState === WebSocket.OPEN) {
                      socketRef.current.send(cmd + '\r');
                    }
                  }}
                  className="block w-full text-left text-[10px] font-mono text-[#D4FF00]/50 hover:text-[#D4FF00] truncate transition-colors"
                  title={cmd}
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>

          {/* Node Entropy */}
          <div className="p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#D4FF00]/50">
                Node Entropy
              </p>
              <span className="text-[9px] font-bold text-[#D4FF00] uppercase">
                {entropy > 75 ? 'Optimal' : entropy > 50 ? 'Nominal' : 'Critical'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1A1A00]">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${entropy}%`,
                  background: entropy > 75
                    ? 'linear-gradient(90deg, #8FCC00, #D4FF00)'
                    : entropy > 50
                    ? '#FFD700'
                    : '#FF4444',
                  boxShadow: `0 0 8px ${entropy > 75 ? '#D4FF0060' : entropy > 50 ? '#FFD70060' : '#FF444460'}`,
                }}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* ── SECURE SESSION ACTIVE badge ─────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="flex items-center gap-2 rounded-xl border border-[#D4FF00]/25 bg-[#0A0A0A]/95 px-4 py-2.5 shadow-[0_0_30px_rgba(212,255,0,0.15)] backdrop-blur-sm">
          <Shield size={14} className="text-[#D4FF00]" style={{ filter: 'drop-shadow(0 0 4px #D4FF00)' }} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#D4FF00]">
              Secure Session Active
            </p>
            <p className="text-[8px] text-[#D4FF00]/50 uppercase tracking-widest">
              End-to-end Encrypted Tunnel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
