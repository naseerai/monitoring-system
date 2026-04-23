import React, { useEffect, useRef, useState } from 'react';
import { X, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalModalProps {
  isOpen: boolean;
  nodeId: string | null;
  nodeName: string;
  onClose: () => void;
}

function getTerminalWsUrl(nodeId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/terminal?nodeId=${encodeURIComponent(nodeId)}`;
}

export default function TerminalModal({
  isOpen,
  nodeId,
  nodeName,
  onClose,
}: TerminalModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef  = useRef<Terminal | null>(null);
  const fitAddonRef  = useRef<FitAddon | null>(null);
  const socketRef    = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    if (!isOpen || !nodeId || !containerRef.current) return;

    // Cyberpunk theme
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
      convertEol: true,
      theme: {
        background:   '#0A0A0A',
        foreground:   '#D4FF00',
        cursor:       '#D4FF00',
        cursorAccent: '#0A0A0A',
        black:        '#0A0A0A',
        brightBlack:  '#333300',
        red:          '#FF3333',
        brightRed:    '#FF6666',
        green:        '#D4FF00',
        brightGreen:  '#E8FF66',
        yellow:       '#FFD700',
        brightYellow: '#FFE566',
        blue:         '#00CCFF',
        brightBlue:   '#66DDFF',
        magenta:      '#FF00FF',
        brightMagenta:'#FF66FF',
        cyan:         '#00FFCC',
        brightCyan:   '#66FFE0',
        white:        '#CCCCCC',
        brightWhite:  '#FFFFFF',
      },
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln(`\x1b[38;2;212;255;0m▶ Connecting to ${nodeName}...\x1b[0m`);
    setStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(getTerminalWsUrl(nodeId));
    } catch (err) {
      term.writeln(`\x1b[31m[terminal] Failed to open WebSocket: ${String(err)}\x1b[0m`);
      setStatus('disconnected');
      return;
    }

    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
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
    };

    ws.onclose = () => {
      setStatus('disconnected');
      term.writeln('\r\n\x1b[33m[terminal] Session disconnected\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
      if (!fitAddonRef.current || !socketRef.current) return;
      fitAddonRef.current.fit();
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    window.addEventListener('resize', handleResize);
    const resizeTimer = setTimeout(handleResize, 100);

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      try { ws.close(); } catch {}
      try { term.dispose(); } catch {}
      terminalRef.current  = null;
      fitAddonRef.current  = null;
      socketRef.current    = null;
      setStatus('disconnected');
    };
  }, [isOpen, nodeId, nodeName]);

  if (!isOpen || !nodeId) return null;

  const statusColor =
    status === 'connected'   ? 'text-neon-lime' :
    status === 'connecting'  ? 'text-yellow-400' :
                               'text-red-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex h-[85vh] w-[92vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#D4FF00]/20 bg-[#0A0A0A] shadow-[0_0_60px_rgba(212,255,0,0.1)]">

        {/* Mac-style header */}
        <div className="flex items-center justify-between border-b border-[#1A1A00] bg-[#0D0D00] px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Traffic light dots */}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
              <span className="h-3 w-3 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.8)]" />
              <span className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
            </div>
            <span className="text-xs font-mono text-[#D4FF00]/60">
              root@{nodeName.toLowerCase().replace(/\s+/g, '-')}: /var/log
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Status pill */}
            <div className={`flex items-center gap-1.5 ${statusColor}`}>
              {status === 'connecting' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : status === 'connected' ? (
                <Wifi size={12} />
              ) : (
                <WifiOff size={12} />
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {status === 'connected' ? 'SYSTEM LIVE' : status.toUpperCase()}
              </span>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-[#D4FF00]/10 hover:text-[#D4FF00] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Terminal body */}
        <div className="flex-1 bg-[#0A0A0A] p-2 overflow-hidden">
          <div
            ref={containerRef}
            className="h-full w-full rounded-xl"
            style={{ filter: 'drop-shadow(0 0 8px rgba(212,255,0,0.15))' }}
          />
        </div>

        {/* Footer status bar */}
        <div className="flex items-center justify-between border-t border-[#1A1A00] bg-[#0D0D00] px-4 py-2">
          <div className="flex items-center gap-4 text-[10px] font-mono text-[#D4FF00]/50">
            <span>● SSH • {nodeName}</span>
            <span>Uptime: live</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-[#D4FF00]/50">
            <span>UTF-8</span>
            <span className="uppercase tracking-widest">xterm-color</span>
          </div>
        </div>
      </div>
    </div>
  );
}