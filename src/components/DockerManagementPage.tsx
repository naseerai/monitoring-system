import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Image, HardDrive, Network, Layers, Play, Square,
  RotateCcw, Trash2, ScrollText, RefreshCw, Loader2, AlertTriangle,
  ChevronDown, X, Scissors, Server,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────

interface DockerContainer { ID: string; Names: string; Image: string; Status: string; Ports: string; stats?: { CPUPerc: string; MemUsage: string } | null; }
interface DockerImage     { ID: string; Repository: string; Tag: string; Size: string; CreatedSince: string; }
interface DockerVolume    { Name: string; Driver: string; Mountpoint?: string; }
interface DockerNetwork   { ID: string; Name: string; Driver: string; Scope: string; }
interface DockerStack     { Name: string; Status: string; ConfigFiles?: string; }
interface DockerFullData  { nodeId: string; nodeName: string; containers: DockerContainer[]; images: DockerImage[]; volumes: DockerVolume[]; networks: DockerNetwork[]; stacks: DockerStack[]; }
interface NodeRecord      { id: string; displayName: string; ipAddress: string; status: string; }

type Tab = 'containers' | 'images' | 'volumes' | 'networks' | 'stacks';
type ActionType = 'start' | 'stop' | 'restart' | 'remove' | 'logs';

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase();
  const running = s.startsWith('up');
  const exited  = s.startsWith('exit') || s === 'exited';
  const created = s === 'created';
  let cls = 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  if (running) cls = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  else if (exited) cls = 'bg-red-500/20 text-red-400 border-red-500/30';
  else if (created) cls = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  const dot = running ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : exited ? 'bg-red-400' : 'bg-gray-400';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status.length > 20 ? status.slice(0, 18) + '…' : status}
    </span>
  );
}

function TabBtn({ icon: Icon, label, active, onClick }: { icon: React.ElementType; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
        active ? 'border-[#DFFF00] text-[#DFFF00]' : 'border-transparent text-gray-500 hover:text-white hover:border-gray-600'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left text-[10px] font-bold uppercase tracking-[0.15em] text-gray-600 px-4 py-3">{children}</th>
);
const TD = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`px-4 py-3 text-sm text-gray-300 ${mono ? 'font-mono text-xs' : ''}`}>{children}</td>
);

// ── Log Viewer Modal ───────────────────────────────────────────────────────

function LogModal({ logs, containerId, onClose }: { logs: string; containerId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <ScrollText size={15} className="text-[#DFFF00]" />
            <p className="text-sm font-bold text-white">Container Logs</p>
            <span className="font-mono text-xs text-gray-500">{containerId.slice(0, 12)}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <pre className="flex-1 overflow-auto p-5 text-xs font-mono text-green-400 bg-[#050505] leading-relaxed whitespace-pre-wrap">
          {logs || 'No logs available.'}
        </pre>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DockerManagementPage() {
  const { session } = useAuth();
  const tok = session?.access_token ?? '';
  const H   = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  const [nodes,        setNodes]        = useState<NodeRecord[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [data,         setData]         = useState<DockerFullData | null>(null);
  const [tab,          setTab]          = useState<Tab>('containers');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // containerId being acted on
  const [logModal,     setLogModal]     = useState<{ id: string; text: string } | null>(null);
  const [nodeOpen,     setNodeOpen]     = useState(false);

  // Load assigned nodes for selector
  useEffect(() => {
    fetch('/api/nodes', { headers: H })
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const mapped = rows.map(n => ({ id: n.id, displayName: n.displayName ?? n.display_name, ipAddress: n.ipAddress ?? n.ip_address, status: n.status }));
        setNodes(mapped);
        if (mapped.length > 0) setSelectedNode(mapped[0].id);
      })
      .catch(() => {});
  }, [tok]);

  const fetchDocker = useCallback(async () => {
    if (!selectedNode) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/nodes/${selectedNode}/docker-full`, { headers: H });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedNode, tok]);

  useEffect(() => { fetchDocker(); }, [fetchDocker]);

  // Container action
  const containerAction = async (action: ActionType, containerId: string) => {
    setActionLoading(containerId + action);
    try {
      const r = await fetch(`/api/nodes/${selectedNode}/docker/container-action`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ action, containerId }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.message || 'Action failed'); return; }
      if (action === 'logs') {
        setLogModal({ id: containerId, text: d.output ?? '' });
      } else {
        await fetchDocker();
      }
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  // Prune
  const prune = async (target: 'images' | 'volumes' | 'system') => {
    if (!window.confirm(`Prune ${target}? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/nodes/${selectedNode}/docker/prune`, {
        method: 'POST', headers: H, body: JSON.stringify({ target }),
      });
      const d = await r.json();
      alert(d.success ? `Pruned ${target}:\n${d.output?.slice(0, 400)}` : d.message);
      fetchDocker();
    } catch (e: any) { alert(e.message); }
  };

  const selectedNodeName = nodes.find(n => n.id === selectedNode)?.displayName ?? 'Select a node';

  const btn = (action: ActionType, id: string, label: string, Icon: React.ElementType, cls: string) => {
    const busy = actionLoading === id + action;
    return (
      <button
        key={action}
        onClick={() => containerAction(action, id)}
        disabled={!!actionLoading}
        title={label}
        className={`p-1.5 rounded-lg border transition-colors disabled:opacity-40 ${cls}`}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505]">
      <div className="p-6 md:p-8 space-y-6 max-w-7xl">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DFFF00]/10 border border-[#DFFF00]/20 flex items-center justify-center">
              <Container size={18} className="text-[#DFFF00]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Docker Management</h1>
              <p className="text-xs text-gray-500 mt-0.5">Manage containers, images, volumes and stacks via SSH</p>
            </div>
          </div>

          {/* Node selector */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setNodeOpen(v => !v)}
                className="flex items-center gap-2 bg-[#111] border border-[#2a2a2a] hover:border-[#DFFF00]/30 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors min-w-[200px] justify-between"
              >
                <span className="flex items-center gap-2">
                  <Server size={13} className="text-[#DFFF00]" />
                  {selectedNodeName}
                </span>
                <ChevronDown size={13} className="text-gray-500" />
              </button>
              {nodeOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl z-20 overflow-hidden">
                  {nodes.length === 0
                    ? <p className="px-4 py-3 text-sm text-gray-500">No nodes available</p>
                    : nodes.map(n => (
                      <button
                        key={n.id}
                        onClick={() => { setSelectedNode(n.id); setNodeOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-white/5 transition-colors ${selectedNode === n.id ? 'text-[#DFFF00]' : 'text-gray-300'}`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${n.status === 'online' ? 'bg-emerald-400' : 'bg-red-500'}`} />
                        {n.displayName}
                        <span className="text-[10px] text-gray-600 font-mono ml-auto">{n.ipAddress}</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            <button
              onClick={fetchDocker}
              disabled={loading}
              className="p-2.5 bg-[#111] border border-[#2a2a2a] hover:border-[#DFFF00]/30 text-gray-400 hover:text-white rounded-xl transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {/* Stats strip */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Containers', value: data.containers.length, icon: Container, color: 'text-[#DFFF00]' },
              { label: 'Images',     value: data.images.length,     icon: Image,     color: 'text-purple-400' },
              { label: 'Volumes',    value: data.volumes.length,     icon: HardDrive, color: 'text-cyan-400' },
              { label: 'Networks',   value: data.networks.length,    icon: Network,   color: 'text-orange-400' },
              { label: 'Stacks',     value: data.stacks.length,      icon: Layers,    color: 'text-pink-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#2a2a2a] transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={13} className={color} />
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{label}</p>
                </div>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl overflow-hidden">
          <div className="flex items-center gap-0 border-b border-[#1a1a1a] overflow-x-auto px-4">
            <TabBtn icon={Container} label="Containers" active={tab === 'containers'} onClick={() => setTab('containers')} />
            <TabBtn icon={Image}     label="Images"     active={tab === 'images'}     onClick={() => setTab('images')} />
            <TabBtn icon={HardDrive} label="Volumes"    active={tab === 'volumes'}    onClick={() => setTab('volumes')} />
            <TabBtn icon={Network}   label="Networks"   active={tab === 'networks'}   onClick={() => setTab('networks')} />
            <TabBtn icon={Layers}    label="Stacks"     active={tab === 'stacks'}     onClick={() => setTab('stacks')} />

            {/* Prune actions — right side */}
            {data && (tab === 'images' || tab === 'volumes') && (
              <button
                onClick={() => prune(tab === 'images' ? 'images' : 'volumes')}
                className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-red-400 border border-transparent hover:border-red-500/20 hover:bg-red-500/5 rounded-lg px-3 py-1.5 transition-colors"
              >
                <Scissors size={11} /> Prune {tab === 'images' ? 'Images' : 'Volumes'}
              </button>
            )}
          </div>

          {/* Table content */}
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-gray-600">
              <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Fetching Docker data…</span>
            </div>
          ) : !data ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-700">
              <Container size={28} />
              <p className="text-sm">Select a node to load Docker data</p>
            </div>
          ) : (

            /* ── CONTAINERS ── */
            tab === 'containers' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#080808] border-b border-[#111]">
                    <tr><TH>Container</TH><TH>Image</TH><TH>Status</TH><TH>Ports</TH><TH>CPU</TH><TH>Memory</TH><TH>Actions</TH></tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {data.containers.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-600 text-sm">No containers found</td></tr>
                    ) : data.containers.map(c => (
                      <tr key={c.ID} className="hover:bg-white/[0.02] transition-colors">
                        <TD>
                          <div>
                            <p className="text-white font-semibold text-xs">{c.Names}</p>
                            <p className="text-gray-600 font-mono text-[10px]">{c.ID?.slice(0, 12)}</p>
                          </div>
                        </TD>
                        <TD mono>{c.Image}</TD>
                        <TD><StatusBadge status={c.Status ?? ''} /></TD>
                        <TD mono>{c.Ports || '—'}</TD>
                        <TD mono>{c.stats?.CPUPerc ?? '—'}</TD>
                        <TD mono>{c.stats?.MemUsage ?? '—'}</TD>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {btn('start',   c.ID, 'Start',   Play,       'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10')}
                            {btn('stop',    c.ID, 'Stop',    Square,     'text-yellow-400  border-yellow-500/20  hover:bg-yellow-500/10')}
                            {btn('restart', c.ID, 'Restart', RotateCcw,  'text-cyan-400    border-cyan-500/20    hover:bg-cyan-500/10')}
                            {btn('logs',    c.ID, 'Logs',    ScrollText, 'text-purple-400  border-purple-500/20  hover:bg-purple-500/10')}
                            {btn('remove',  c.ID, 'Remove',  Trash2,     'text-red-400     border-red-500/20     hover:bg-red-500/10')}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            /* ── IMAGES ── */
            ) : tab === 'images' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#080808] border-b border-[#111]">
                    <tr><TH>Repository</TH><TH>Tag</TH><TH>Image ID</TH><TH>Size</TH><TH>Created</TH></tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {data.images.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-12 text-gray-600 text-sm">No images found</td></tr>
                    ) : data.images.map((img, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <TD><span className="text-purple-300 font-mono text-xs">{img.Repository}</span></TD>
                        <TD><span className="text-xs bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-mono">{img.Tag}</span></TD>
                        <TD mono>{img.ID?.slice(0, 12)}</TD>
                        <TD><span className="text-cyan-400 font-mono text-xs">{img.Size}</span></TD>
                        <TD><span className="text-gray-500 text-xs">{img.CreatedSince}</span></TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            /* ── VOLUMES ── */
            ) : tab === 'volumes' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#080808] border-b border-[#111]">
                    <tr><TH>Name</TH><TH>Driver</TH><TH>Mount Point</TH></tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {data.volumes.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-12 text-gray-600 text-sm">No volumes found</td></tr>
                    ) : data.volumes.map((v, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <TD><span className="text-cyan-300 font-mono text-xs">{v.Name}</span></TD>
                        <TD><span className="text-xs text-gray-400">{v.Driver}</span></TD>
                        <TD mono>{v.Mountpoint || '—'}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            /* ── NETWORKS ── */
            ) : tab === 'networks' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#080808] border-b border-[#111]">
                    <tr><TH>Name</TH><TH>Network ID</TH><TH>Driver</TH><TH>Scope</TH></tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {data.networks.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-12 text-gray-600 text-sm">No networks found</td></tr>
                    ) : data.networks.map((n, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <TD><span className="text-orange-300 font-semibold text-xs">{n.Name}</span></TD>
                        <TD mono>{n.ID?.slice(0, 12)}</TD>
                        <TD><span className="text-xs text-gray-400">{n.Driver}</span></TD>
                        <TD>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold uppercase tracking-widest">{n.Scope}</span>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            /* ── STACKS ── */
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#080808] border-b border-[#111]">
                    <tr><TH>Stack Name</TH><TH>Status</TH><TH>Compose File</TH></tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {data.stacks.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-12 text-gray-600 text-sm">No active Compose stacks found</td></tr>
                    ) : data.stacks.map((s, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <TD><span className="text-pink-300 font-semibold text-xs">{s.Name}</span></TD>
                        <TD><StatusBadge status={s.Status ?? 'unknown'} /></TD>
                        <TD mono>{s.ConfigFiles || '—'}</TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* Log Modal */}
      {logModal && <LogModal logs={logModal.text} containerId={logModal.id} onClose={() => setLogModal(null)} />}
    </div>
  );
}
