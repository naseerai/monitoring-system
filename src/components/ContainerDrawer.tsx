import React, { useState, useEffect, useRef } from 'react';
import { X, ScrollText, Code2, Terminal, FolderOpen, Copy, ChevronRight, Loader2, FileText, Folder } from 'lucide-react';

interface DC { ID: string; Names: string; Image: string; Status: string; }
type DrawerTab = 'logs' | 'inspect' | 'terminal' | 'files';
interface Props { container: DC; nodeId: string; tok: string; onClose: () => void; }

// ── Logs Tab ──────────────────────────────────────────────────────────────────
function LogsTab({ cid, nodeId, tok }: { cid: string; nodeId: string; tok: string }) {
  const [output, setOutput] = useState('Fetching logs…');
  useEffect(() => {
    fetch(`/api/nodes/${nodeId}/docker/containers/${cid}/logs`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json())
      .then(d => setOutput(d.output || 'No logs found.'))
      .catch(e => setOutput(`Failed to fetch logs: ${e.message}`));
  }, [cid, nodeId, tok]);
  return (
    <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-emerald-400 leading-relaxed whitespace-pre-wrap bg-[#030303]">
      {output}
    </pre>
  );
}

// ── Inspect Tab ────────────────────────────────────────────────────────────────
function InspectTab({ cid, nodeId, tok }: { cid: string; nodeId: string; tok: string }) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  useEffect(() => {
    fetch(`/api/nodes/${nodeId}/docker/containers/${cid}/inspect`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.output); else setErr(d.error || 'Inspect failed'); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [cid, nodeId, tok]);
  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-gray-500" /></div>;
  if (err)     return <div className="flex-1 flex items-center justify-center text-red-400 text-xs font-mono p-4">{err}</div>;
  return (
    <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-[#DFFF00]/80 leading-relaxed whitespace-pre-wrap bg-[#030303]">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ── Terminal Tab ──────────────────────────────────────────────────────────────
function TerminalTab({ cid, nodeId, tok }: { cid: string; nodeId: string; tok: string }) {
  const divRef  = useRef<HTMLDivElement>(null);
  const cleanUp = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        if (!tok) {
          if (divRef.current) divRef.current.innerHTML = `<p style="color:#f87171;padding:1rem;font-size:12px;font-family:monospace">Error: No auth token — please log in again.</p>`;
          return;
        }

        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('xterm'),
          import('xterm-addon-fit'),
        ]);
        if (disposed) return;

        const term = new Terminal({
          theme: { background: '#030303', foreground: '#DFFF00', cursor: '#DFFF00', cursorAccent: '#000' },
          fontFamily: '"Fira Code", "Cascadia Code", monospace',
          fontSize: 12,
          cursorBlink: true,
          allowProposedApi: true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        if (divRef.current) { term.open(divRef.current); fit.fit(); }

        term.write('\r\n\x1b[90m[exec] Connecting to container shell…\x1b[0m\r\n');

        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${proto}://${window.location.host}/ws/docker-exec?nodeId=${nodeId}&containerId=${cid}&token=${encodeURIComponent(tok)}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen    = () => term.write('\r\n\x1b[32m[exec] WebSocket open — waiting for SSH…\x1b[0m\r\n');
        ws.onmessage = (e) => {
          if (!disposed) term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer));
        };
        ws.onclose = (ev) => {
          if (!disposed) term.write(`\r\n\x1b[33m[exec] Session closed (code ${ev.code})\x1b[0m\r\n`);
        };
        ws.onerror = () => {
          if (!disposed) term.write('\r\n\x1b[31m[exec] Connection error\x1b[0m\r\n\x1b[90mCheck: is the backend running? Is the container up?\x1b[0m\r\n');
        };

        term.onData((d) => ws.readyState === WebSocket.OPEN && ws.send(d));
        term.onResize(({ cols, rows }) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'resize', cols, rows })));

        const obs = new ResizeObserver(() => { try { fit.fit(); } catch {} });
        if (divRef.current) obs.observe(divRef.current);

        cleanUp.current = () => {
          disposed = true;
          obs.disconnect();
          try { ws.close(); } catch {}
          try { term.dispose(); } catch {}
        };
      } catch (e: any) {
        if (divRef.current) divRef.current.innerHTML = `<p style="color:#f87171;padding:1rem;font-size:12px;font-family:monospace">Terminal error: ${e.message}</p>`;
      }
    })();
    return () => { cleanUp.current(); };
  }, [cid, nodeId, tok]);


  return <div ref={divRef} className="flex-1 bg-[#030303]" style={{ minHeight: 0 }} />;
}

// ── Files Tab ─────────────────────────────────────────────────────────────────
function FilesTab({ cid, nodeId, tok }: { cid: string; nodeId: string; tok: string }) {
  const [path,    setPath]    = useState('/');
  const [entries, setEntries] = useState<string[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  const browse = async (p: string) => {
    setContent(null); setErr(''); setLoading(true);
    try {
      const r = await fetch(`/api/nodes/${nodeId}/docker/containers/${cid}/files?path=${encodeURIComponent(p)}`, { headers: { Authorization: `Bearer ${tok}` } });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || 'Browse failed'); setEntries([]); }
      else { setEntries(d.entries || []); setPath(p); }
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  const readFile = async (filePath: string) => {
    setErr(''); setLoading(true);
    try {
      const r = await fetch(`/api/nodes/${nodeId}/docker/containers/${cid}/cat?path=${encodeURIComponent(filePath)}`, { headers: { Authorization: `Bearer ${tok}` } });
      const d = await r.json();
      setContent(d.content ?? '(empty)');
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  useEffect(() => { browse('/'); }, [cid]);

  // -F appends '/' to dirs, '*' to executables, '@' to symlinks
  const isDir  = (e: string) => e.endsWith('/');
  const name   = (e: string) => e.replace(/[/*@|=%]$/, '');

  return (
    <div className="flex-1 overflow-auto bg-[#030303] p-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs font-mono text-gray-500 mb-3 flex-wrap">
        <button onClick={() => browse('/')} className="hover:text-[#DFFF00] transition-colors">root</button>
        {path.split('/').filter(Boolean).map((seg, i, arr) => {
          const p = '/' + arr.slice(0, i + 1).join('/') + '/';
          return (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={10} />
              <button onClick={() => browse(p)} className="hover:text-[#DFFF00] transition-colors">{seg}</button>
            </span>
          );
        })}
      </div>

      {err && <p className="text-red-400 text-xs font-mono mb-2">{err}</p>}

      {content !== null ? (
        <div>
          <button onClick={() => setContent(null)} className="text-xs text-[#DFFF00] mb-3 hover:underline flex items-center gap-1">
            ← Back to {path}
          </button>
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">{content}</pre>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-gray-600 text-xs py-4">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-0.5">
          {/* Up one level */}
          {path !== '/' && (
            <button onClick={() => { const p = path.replace(/\/[^/]+\/$/, '/') || '/'; browse(p); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-left transition-colors">
              <Folder size={12} className="text-gray-600 flex-shrink-0" />
              <span className="text-xs font-mono text-gray-600">..</span>
            </button>
          )}
          {entries.length === 0 && <p className="text-gray-600 text-xs px-2 py-4">Empty directory</p>}
          {entries.map((entry, i) => {
            const dir  = isDir(entry);
            const n    = name(entry);
            if (!n || n === '.' || n === '..') return null;
            return (
              <button key={i}
                onClick={() => dir ? browse(path.replace(/\/$/, '') + '/' + n + '/') : readFile(path.replace(/\/$/, '') + '/' + n)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-left transition-colors group">
                {dir
                  ? <Folder size={12} className="text-cyan-400 flex-shrink-0" />
                  : <FileText size={12} className="text-gray-500 flex-shrink-0" />
                }
                <span className={`text-xs font-mono truncate ${dir ? 'text-cyan-300 group-hover:text-cyan-200' : 'text-gray-400 group-hover:text-gray-200'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Drawer Shell ──────────────────────────────────────────────────────────────
export default function ContainerDrawer({ container: c, nodeId, tok, onClose }: Props) {
  const [tab, setTab] = useState<DrawerTab>('logs');
  const up = c.Status.toLowerCase().startsWith('up');

  const TABS: { id: DrawerTab; icon: React.ElementType; label: string }[] = [
    { id: 'logs',     icon: ScrollText, label: 'Logs'     },
    { id: 'inspect',  icon: Code2,      label: 'Inspect'  },
    { id: 'terminal', icon: Terminal,   label: 'Terminal' },
    { id: 'files',    icon: FolderOpen, label: 'Files'    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="w-full max-w-2xl bg-[#0a0a0a] border-l border-[#1a1a1a] flex flex-col shadow-2xl" style={{ height: '100vh' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1a1a1a] flex-shrink-0 bg-[#0d0d0d]">
          <div className="relative flex-shrink-0">
            <span className={`w-2.5 h-2.5 rounded-full block ${up ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-500/60'}`} />
            {up && <span className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400/40 animate-ping" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{c.Names.replace(/^\//, '')}</p>
            <p className="text-[10px] text-gray-500 font-mono">{c.ID.slice(0, 12)} · {c.Image}</p>
          </div>
          <button onClick={() => navigator.clipboard.writeText(c.ID)} title="Copy full ID"
            className="p-1.5 text-gray-600 hover:text-[#DFFF00] transition-colors rounded-lg hover:bg-[#DFFF00]/10">
            <Copy size={13} />
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-600 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1a1a1a] flex-shrink-0 bg-[#0a0a0a]">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                tab === id
                  ? 'border-[#DFFF00] text-[#DFFF00] bg-[#DFFF00]/5'
                  : 'border-transparent text-gray-500 hover:text-white hover:bg-white/[0.02]'
              }`}>
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Content — takes remaining height */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {tab === 'logs'     && <LogsTab     cid={c.ID} nodeId={nodeId} tok={tok} />}
          {tab === 'inspect'  && <InspectTab  cid={c.ID} nodeId={nodeId} tok={tok} />}
          {tab === 'terminal' && <TerminalTab cid={c.ID} nodeId={nodeId} tok={tok} />}
          {tab === 'files'    && <FilesTab    cid={c.ID} nodeId={nodeId} tok={tok} />}
        </div>
      </div>
    </div>
  );
}
