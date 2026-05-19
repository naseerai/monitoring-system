import React, { useState, useEffect, useCallback } from 'react';
import { Boxes, Play, Square, RotateCcw, Trash2, RefreshCw, Loader2,
  AlertTriangle, ChevronDown, ChevronUp, Server, Layers, ExternalLink, PackageX,
  HardDrive, Network, ScrollText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ContainerDrawer from './ContainerDrawer';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DC {
  ID: string; Names: string; Image: string; Status: string; Ports: string;
  Label?: string;
  projectName?: string;   // com.docker.compose.project (from backend)
  serviceName?: string;   // com.docker.compose.service (from backend)
  stats?: { CPUPerc: string; MemUsage: string } | null;
}
interface DImg { ID: string; Repository: string; Tag: string; Size: string; CreatedSince: string; }
interface DVol { Name: string; Driver: string; Mountpoint?: string; }
interface DNet { ID: string; Name: string; Driver: string; Scope: string; }
interface DockerData { dockerNotFound?: boolean; containers: DC[]; images: DImg[]; volumes: DVol[]; networks: DNet[]; }
interface NR { id: string; displayName: string; ipAddress: string; status: string; }
type Tab = 'containers' | 'images' | 'volumes' | 'networks';

// ── Helpers ───────────────────────────────────────────────────────────────────
function Dot({ status }: { status: string }) {
  const up = status.toLowerCase().startsWith('up');
  return (
    <span className="relative flex items-center justify-center w-3 h-3 flex-shrink-0">
      {up && <span className="absolute w-3 h-3 rounded-full bg-emerald-400/30 animate-ping" />}
      <span className={`relative w-2 h-2 rounded-full ${up ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-500/60'}`} />
    </span>
  );
}

function Badge({ status }: { status: string }) {
  const up = status.toLowerCase().startsWith('up');
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${up ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
      {status.length > 20 ? status.slice(0, 18) + '…' : status}
    </span>
  );
}

function ActBtn({ icon: I, title: t, color, busy, onClick }: { icon: React.ElementType; title: string; color: string; busy: boolean; onClick: () => void }) {
  const c: Record<string, string> = {
    green: 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10',
    yellow: 'text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10',
    cyan: 'text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/10',
    purple: 'text-purple-400 border-purple-500/20 hover:bg-purple-500/10',
    red: 'text-red-400 border-red-500/20 hover:bg-red-500/10',
  };
  return (
    <button onClick={onClick} disabled={busy} title={t} className={`p-1.5 rounded-lg border transition-colors disabled:opacity-40 ${c[color]}`}>
      {busy ? <Loader2 size={11} className="animate-spin" /> : <I size={11} />}
    </button>
  );
}

// ── Service Row (inside a Stack Card) ────────────────────────────────────────
function ServiceRow({ c, nodeId, tok, onOpen, onRefresh }: { c: DC; nodeId: string; tok: string; onOpen: () => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const up = c.Status.toLowerCase().startsWith('up');

  const act = async (action: string) => {
    setBusy(action);
    try {
      const r = await fetch(`/api/nodes/${nodeId}/docker/container-action`, {
        method: 'POST', headers: H, body: JSON.stringify({ action, containerId: c.ID }),
      });
      const d = await r.json();
      if (!r.ok) alert(d.message || 'Failed');
      else onRefresh();
    } catch (e: any) { alert(e.message); }
    setBusy(null);
  };

  // Prefer serviceName from compose label; fall back to container name
  const displayName = (c.serviceName && c.serviceName !== c.Names)
    ? c.serviceName
    : c.Names.replace(/^\//, '');

  // Ports: trim long port strings to 2 entries
  const portStr = c.Ports && c.Ports !== '-' && c.Ports !== ''
    ? c.Ports.split(',').slice(0, 2).map(p => p.trim()).join('  ·  ')
    : null;

  return (
    <div
      className="flex items-center gap-3 pl-8 pr-4 py-3 border-b border-[#0f0f0f] last:border-0 hover:bg-[#DFFF00]/[0.02] transition-colors cursor-pointer group"
      onClick={onOpen}
    >
      {/* Green service indicator */}
      <span className="relative flex items-center justify-center w-3 h-3 flex-shrink-0">
        {up && <span className="absolute w-3 h-3 rounded-full bg-emerald-400/25 animate-ping" />}
        <span className={`relative w-2 h-2 rounded-full ${up ? 'bg-emerald-400 shadow-[0_0_5px_#34d399]' : 'bg-red-500/60'}`} />
      </span>

      {/* Service name + image */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white truncate group-hover:text-[#DFFF00] transition-colors">
          {displayName}
        </p>
        <p className="text-[10px] font-mono text-gray-600 truncate">{c.Image}</p>
      </div>

      {/* Port badge (muted) */}
      {portStr && (
        <span className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-gray-600 bg-[#111] border border-[#1f1f1f] rounded px-1.5 py-0.5 max-w-[140px] truncate">
          <Network size={8} className="flex-shrink-0" />
          {portStr}
        </span>
      )}

      {/* Status badge */}
      <Badge status={c.Status} />

      {/* Action buttons */}
      <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
        {up
          ? <>
              <ActBtn icon={Square}    title="Stop"    color="yellow" busy={busy === 'stop'}    onClick={() => act('stop')} />
              <ActBtn icon={RotateCcw} title="Restart" color="cyan"   busy={busy === 'restart'} onClick={() => act('restart')} />
            </>
          : <ActBtn icon={Play} title="Start" color="green" busy={busy === 'start'} onClick={() => act('start')} />
        }
        <ActBtn icon={ScrollText} title="Logs"   color="purple" busy={false}              onClick={() => onOpen()} />
        <ActBtn icon={Trash2}     title="Remove" color="red"    busy={busy === 'remove'} onClick={() => { if (window.confirm('Remove container?')) act('remove'); }} />
      </div>
    </div>
  );
}

// ── Stack Container Card ──────────────────────────────────────────────────────
function StackContainer({ name, containers, nodeId, tok, onOpen, onRefresh }: {
  name: string; containers: DC[]; nodeId: string; tok: string;
  onOpen: (c: DC) => void; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const total    = containers.length;
  const running  = containers.filter(c => c.Status.toLowerCase().startsWith('up')).length;
  const allUp    = running === total;
  const hasDown  = running < total;
  const isCompose = name !== 'Standalone';

  const borderColor = allUp ? '#DFFF00' : running > 0 ? '#FACC15' : '#EF4444';
  const countColor  = allUp ? 'text-[#DFFF00]' : running > 0 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div
      className="mb-4 rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg,#0d0d0d,#080808)',
        border: '1px solid #1c1c1c',
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: `0 4px 24px ${borderColor}0d`,
      }}
    >
      {/* ── Stack Header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Stack icon: yellow for compose, gray for standalone */}
        {isCompose
          ? <Layers size={16} className="text-[#DFFF00] flex-shrink-0 drop-shadow-[0_0_4px_#DFFF00]" />
          : <Server  size={16} className="text-gray-500 flex-shrink-0" />
        }

        {/* Name block */}
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-600 mb-0.5">STACK</p>
          <p className="text-sm font-black uppercase tracking-wider text-white truncate">{name}</p>
        </div>

        {/* Status badges */}
        {allUp && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Healthy
          </span>
        )}
        {hasDown && !allUp && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2.5 py-0.5">
            <AlertTriangle size={9} /> Degraded
          </span>
        )}
        {running === 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-0.5">
            Down
          </span>
        )}

        <span className={`text-xs font-bold font-mono ${countColor} ml-2`}>{running}/{total}</span>
        {open
          ? <ChevronUp   size={13} className="text-gray-600 flex-shrink-0 ml-1" />
          : <ChevronDown size={13} className="text-gray-600 flex-shrink-0 ml-1" />
        }
      </button>

      {/* ── Services List ── */}
      {open && (
        <div className="border-t border-[#111]">
          {containers.map(c => (
            <ServiceRow key={c.ID} c={c} nodeId={nodeId} tok={tok} onOpen={() => onOpen(c)} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── No Docker ─────────────────────────────────────────────────────────────────
function NoDocker() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <PackageX size={28} className="text-red-400" />
      </div>
      <div className="text-center">
        <p className="text-white font-bold text-lg mb-1">Docker Engine Not Found</p>
        <p className="text-gray-500 text-sm">This node doesn't appear to have Docker installed.</p>
      </div>
      <a href="https://docs.docker.com/engine/install/" target="_blank" rel="noreferrer"
        className="flex items-center gap-2 bg-[#DFFF00]/10 border border-[#DFFF00]/20 text-[#DFFF00] font-bold rounded-xl px-5 py-2.5 text-sm hover:bg-[#DFFF00]/20 transition-colors">
        <ExternalLink size={13} /> How to Install Docker
      </a>
    </div>
  );
}

// ── TH / TD ───────────────────────────────────────────────────────────────────
const TH = ({ v }: { v: string }) => <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-gray-600 px-4 py-3">{v}</th>;

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DockerManagementPage() {
  const { session } = useAuth();
  const tok = session?.access_token ?? '';
  const H   = { Authorization: `Bearer ${tok}` };

  const [nodes,    setNodes]    = useState<NR[]>([]);
  const [selNode,  setSelNode]  = useState('');
  const [data,     setData]     = useState<DockerData | null>(null);
  // rawContainers = direct copy from API, never filtered — used for counters & debugging
  const [rawContainers, setRawContainers] = useState<DC[]>([]);
  const [tab,      setTab]      = useState<Tab>('containers');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [noDocker, setNoDocker] = useState(false);
  const [nodeOpen, setNodeOpen] = useState(false);
  const [drawer,   setDrawer]   = useState<DC | null>(null);

  useEffect(() => {
    fetch('/api/nodes', { headers: H }).then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const mapped = rows.map(n => ({ id: n.id, displayName: n.displayName ?? n.display_name, ipAddress: n.ipAddress ?? n.ip_address, status: n.status }));
        setNodes(mapped);
        if (mapped.length) setSelNode(mapped[0].id);
      }).catch(() => {});
  }, [tok]);

  const fetchDocker = useCallback(async () => {
    if (!selNode) return;
    setLoading(true); setError(null); setNoDocker(false);
    try {
      const r = await fetch(`/api/nodes/${selNode}/docker-full`, { headers: H });
      // Guard: if server returned HTML (proxy error), show a clear message
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Server returned non-JSON (status ${r.status}) — is the backend running?`);
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
      if (d.dockerNotFound) {
        setNoDocker(true); setData(null); setRawContainers([]);
      } else {
        // Set raw containers FIRST before any processing
        const cs: DC[] = Array.isArray(d.containers) ? d.containers : [];
        setRawContainers(cs);
        console.log('[DOCKER UI] Received', cs.length, 'containers from API');
        setData(d);
      }
    } catch (e: any) {
      if (/not found|docker/i.test(e.message)) setNoDocker(true);
      else setError(e.message);
    } finally { setLoading(false); }
  }, [selNode, tok]);

  useEffect(() => { fetchDocker(); }, [fetchDocker]);

  const groups = React.useMemo((): Record<string, DC[]> => {
    if (!data) return { Standalone: [] };
    const g: Record<string, DC[]> = { Standalone: [] };
    for (const c of data.containers) {
      // Priority: use the explicit projectName field from backend (from compose label)
      // Fall back to the legacy Label field, then 'Standalone'
      const key =
        (c.projectName && c.projectName !== 'Standalone')
          ? c.projectName
          : (c.Label && c.Label !== 'Standalone' && c.Label.trim())
            ? c.Label.trim()
            : 'Standalone';
      if (!g[key]) g[key] = [];
      g[key].push(c);
    }
    return g;
  }, [data]);

  // Derived counters — always reflect raw API data, never grouped/filtered view
  const totalContainers   = rawContainers.length;
  const runningContainers = rawContainers.filter(c => c.Status?.toLowerCase().startsWith('up')).length;

  const selName = nodes.find(n => n.id === selNode)?.displayName ?? 'Select node';

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'containers', label: 'Containers', icon: Boxes },
    { id: 'images',     label: 'Images',     icon: Boxes },
    { id: 'volumes',    label: 'Volumes',    icon: HardDrive },
    { id: 'networks',   label: 'Networks',   icon: Network },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505]">
      <div className="p-6 md:p-8 space-y-5 max-w-6xl">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DFFF00]/10 border border-[#DFFF00]/20 flex items-center justify-center">
              <Boxes size={18} className="text-[#DFFF00]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Docker Management</h1>
              <p className="text-xs text-gray-500 mt-0.5">Inspect and control containers via SSH</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setNodeOpen(v => !v)}
                className="flex items-center gap-2 bg-[#111] border border-[#2a2a2a] hover:border-[#DFFF00]/30 text-white rounded-xl px-4 py-2.5 text-sm font-medium min-w-[190px] justify-between transition-colors">
                <span className="flex items-center gap-2"><Server size={13} className="text-[#DFFF00]" />{selName}</span>
                <ChevronDown size={13} className="text-gray-500" />
              </button>
              {nodeOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl z-20 overflow-hidden">
                  {nodes.map(n => (
                    <button key={n.id} onClick={() => { setSelNode(n.id); setNodeOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors ${selNode === n.id ? 'text-[#DFFF00]' : 'text-gray-300'}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${n.status === 'online' ? 'bg-emerald-400' : 'bg-red-500'}`} />
                      {n.displayName}
                      <span className="text-[10px] text-gray-600 font-mono ml-auto">{n.ipAddress}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={fetchDocker} disabled={loading}
              className="p-2.5 bg-[#111] border border-[#2a2a2a] hover:border-[#DFFF00]/30 text-gray-400 hover:text-[#DFFF00] rounded-xl transition-colors disabled:opacity-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"><AlertTriangle size={15} />{error}</div>}

        {loading && <div className="flex items-center justify-center py-20 gap-3 text-gray-600"><Loader2 size={18} className="animate-spin" /><span className="text-sm">Fetching Docker data…</span></div>}

        {!loading && noDocker && <NoDocker />}

        {!loading && !noDocker && data && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { l: 'Containers', v: totalContainers, sub: `${runningContainers} running`, c: 'text-[#DFFF00]' },
                { l: 'Images',     v: data.images.length,   sub: '',                      c: 'text-purple-400' },
                { l: 'Volumes',    v: data.volumes.length,  sub: '',                      c: 'text-cyan-400' },
                { l: 'Networks',   v: data.networks.length, sub: '',                      c: 'text-orange-400' },
              ].map(({ l, v, sub, c }) => (
                <div key={l} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl p-4">
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-1.5">{l}</p>
                  <p className={`text-3xl font-bold ${c}`}>{v}</p>
                  {sub && <p className="text-[10px] text-gray-500 mt-1">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-[#1a1a1a]">
              {TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all capitalize ${tab === id ? 'border-[#DFFF00] text-[#DFFF00]' : 'border-transparent text-gray-500 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Containers Accordion */}
            {tab === 'containers' && (
              <div>
                {totalContainers === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gray-800/50 border border-gray-700/30 flex items-center justify-center">
                      <Boxes size={24} className="text-gray-600" />
                    </div>
                    <p className="text-gray-500 text-sm font-medium">No containers found on this node</p>
                    <p className="text-gray-700 text-xs">The node is reachable but <code className="font-mono text-gray-500">docker ps -a</code> returned 0 results.</p>
                  </div>
                ) : (
                  <>
                    {/* Compose stacks first (all groups except Standalone) */}
                    {(Object.entries(groups) as [string, DC[]][])
                      .filter(([k, cs]) => k !== 'Standalone' && cs.length > 0)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([name, cs]) => (
                        <StackContainer key={name} name={name} containers={cs} nodeId={selNode} tok={tok} onOpen={setDrawer} onRefresh={fetchDocker} />
                      ))}
                    {/* Standalone — only shown if there are containers in it */}
                    {groups['Standalone'] && groups['Standalone'].length > 0 && (
                      <StackContainer name="Standalone" containers={groups['Standalone']} nodeId={selNode} tok={tok} onOpen={setDrawer} onRefresh={fetchDocker} />
                    )}
                  </>
                )}
              </div>
            )}


            {/* Images */}
            {tab === 'images' && (
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl overflow-hidden">
                <table className="w-full"><thead className="bg-[#080808] border-b border-[#111]"><tr><TH v="Repository"/><TH v="Tag"/><TH v="ID"/><TH v="Size"/><TH v="Created"/></tr></thead>
                  <tbody className="divide-y divide-[#0f0f0f]">
                    {data.images.length === 0 ? <tr><td colSpan={5} className="text-center py-10 text-gray-600 text-sm">No images</td></tr>
                      : data.images.map((img, i) => (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-xs font-mono text-purple-300">{img.Repository}</td>
                          <td className="px-4 py-3"><span className="text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-mono">{img.Tag}</span></td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{img.ID?.slice(0, 12)}</td>
                          <td className="px-4 py-3 text-xs font-mono text-cyan-400">{img.Size}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{img.CreatedSince}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Volumes */}
            {tab === 'volumes' && (
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl overflow-hidden">
                <table className="w-full"><thead className="bg-[#080808] border-b border-[#111]"><tr><TH v="Name"/><TH v="Driver"/><TH v="Mount"/></tr></thead>
                  <tbody className="divide-y divide-[#0f0f0f]">
                    {data.volumes.length === 0 ? <tr><td colSpan={3} className="text-center py-10 text-gray-600 text-sm">No volumes</td></tr>
                      : data.volumes.map((v, i) => (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-xs font-mono text-cyan-300">{v.Name}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{v.Driver}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-600">{v.Mountpoint || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Networks */}
            {tab === 'networks' && (
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl overflow-hidden">
                <table className="w-full"><thead className="bg-[#080808] border-b border-[#111]"><tr><TH v="Name"/><TH v="ID"/><TH v="Driver"/><TH v="Scope"/></tr></thead>
                  <tbody className="divide-y divide-[#0f0f0f]">
                    {data.networks.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-gray-600 text-sm">No networks</td></tr>
                      : data.networks.map((n, i) => (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-xs font-semibold text-orange-300">{n.Name}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{n.ID?.slice(0, 12)}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{n.Driver}</td>
                          <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold uppercase">{n.Scope}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Container Detail Drawer */}
      {drawer && <ContainerDrawer container={drawer} nodeId={selNode} tok={tok} onClose={() => setDrawer(null)} />}
    </div>
  );
}
