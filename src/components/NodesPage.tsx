import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Search,
  Bell,
  Settings,
  RefreshCw,
  SlidersHorizontal,
  Loader2,
  Lock,
} from 'lucide-react';
import { motion } from 'motion/react';
import EditNodeModal, { EditNodeFormData } from './EditNodeModal';
import TerminalModal from './TerminalModal';
import { wsUrl } from '../utils/wsUrl';
import { useAuth } from '../context/AuthContext';

interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  username: string;
  port: number;
  region?: string;
  authType?: 'password' | 'privateKey';
  status: 'connecting' | 'online' | 'offline' | 'warning';
  uptimeOutput?: string;
  error?: string;
}

interface NodeMetrics {
  nodeId: string;
  cpu: number;
  ramPercent: number;
  ping: number;
  status: 'online' | 'offline' | 'warning';
}

interface Props {
  onViewDetails: (id: string) => void;
  onOpenTerminalPage?: (nodeId: string, nodeName: string) => void;
  role?: 'admin' | 'employee' | 'intern';
}

type Filter = 'ALL' | 'ONLINE' | 'OFFLINE' | 'WARNING';
// ── Sub-components ──────────────────────────────────────────────────────────


function StatusBadge({ status }: { status: NodeRecord['status'] }) {
  if (status === 'online')
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-neon-lime/30 bg-neon-lime/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-neon-lime">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-lime" />
        Online
      </span>
    );

  if (status === 'warning')
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
        Warning
      </span>
    );

  if (status === 'connecting')
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-blue-400" />
        Connecting
      </span>
    );

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Offline
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const barColor =
    value > 85 ? 'bg-red-500' : value > 65 ? 'bg-yellow-400' : 'bg-neon-lime';

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <motion.div
        className={`h-full rounded-full ${barColor}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

interface NodeCardProps {
  node: NodeRecord;
  metrics?: NodeMetrics;
  onViewDetails: (id: string) => void;
  onEditClick: (node: NodeRecord) => void;
  onOpenTerminal: (nodeId: string, nodeName: string) => void;
  isIntern?: boolean;
}

const NodeCard: React.FC<NodeCardProps> = ({
  node,
  metrics,
  onViewDetails,
  onEditClick,
  onOpenTerminal,
  isIntern,
}) => {
  const isOffline = node.status === 'offline';
  const cpu = metrics?.cpu ?? 0;
  const ram = metrics?.ramPercent ?? 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl border border-[#1F1F1F] bg-[#0B0B0B] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-neon-lime/20 hover:shadow-[0_0_30px_rgba(212,255,0,0.05)]"
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold tracking-tight text-white">
            {node.displayName}
          </h3>
          <p className="mt-1 text-xs font-medium text-gray-500">
            IP: {node.ipAddress}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={node.status} />
          {isIntern ? (
            <span className="flex items-center gap-1 text-[9px] text-gray-600 border border-[#2a2a2a] rounded px-1.5 py-0.5">
              <Lock size={9} /> Read-Only
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onEditClick(node); }}
              title="Node Settings"
              className="rounded p-1 text-gray-600 transition-colors hover:bg-neon-lime/5 hover:text-neon-lime"
            >
              <SlidersHorizontal size={13} />
            </button>
          )}
        </div>
      </div>

      {/* CPU */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
            CPU Load
          </span>
          <span
            className={`text-[11px] font-bold ${
              cpu > 85
                ? 'text-red-400'
                : cpu > 65
                  ? 'text-yellow-400'
                  : 'text-neon-lime'
            }`}
          >
            {isOffline ? '0%' : `${cpu.toFixed(0)}%`}
          </span>
        </div>
        <ProgressBar value={isOffline ? 0 : cpu} />
      </div>

      {/* RAM */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
            RAM Load
          </span>
          <span
            className={`text-[11px] font-bold ${
              ram > 85
                ? 'text-red-400'
                : ram > 65
                  ? 'text-yellow-400'
                  : 'text-neon-lime'
            }`}
          >
            {isOffline ? '0%' : `${ram.toFixed(0)}%`}
          </span>
        </div>
        <ProgressBar value={isOffline ? 0 : ram} />
      </div>

      {/* Error hint */}
      {isOffline && node.error && (
        <p
          className="mb-3 truncate text-[10px] font-mono text-red-400/70"
          title={node.error}
        >
          ⚠ {node.error.replace(/^✗\s*/, '').slice(0, 80)}
        </p>
      )}

      {/* Actions */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => onOpenTerminal(node.id, node.displayName)}
          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
        >
          Open Terminal
        </button>

        <button
          onClick={() => onViewDetails(node.id)}
          className="rounded-lg border border-neon-lime/20 bg-neon-lime/5 px-3 py-2 text-xs font-semibold text-neon-lime transition-colors hover:bg-neon-lime/10 hover:text-white"
        >
          View Details
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[#1F1F1F] pt-1">
        <div className="flex items-center gap-1.5 text-gray-500">
          <Globe size={12} />
          <span className="text-[11px] font-medium">
            {node.region || 'US-East-1'}
          </span>
        </div>

        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          {node.status}
        </span>
      </div>
    </motion.div>
  );
};

// ── Loading spinner ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-2 border-neon-lime/20" />
        <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-neon-lime" />
      </div>
      <p className="text-sm font-medium text-gray-400">Loading Systems...</p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function NodesPage({ onViewDetails, onOpenTerminalPage, role }: Props) {
  const { session } = useAuth();
  const isIntern = role === 'intern';
  // null = loading, [] = loaded but empty
  const [nodes, setNodes] = useState<NodeRecord[] | null>(null);
  const [metrics, setMetrics] = useState<Map<string, NodeMetrics>>(new Map());
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<NodeRecord | null>(null);

  // Terminal modal state (modal fallback if no TerminalPage handler)
  const [terminalNodeId, setTerminalNodeId] = useState<string | null>(null);
  const [terminalNodeName, setTerminalNodeName] = useState('');

  // ── Fetch nodes ──────────────────────────────────────────────────────────

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes', {
  cache: 'no-store',
  headers: {
    'Cache-Control': 'no-cache',
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  },
});
      if (res.ok) {
        const data = await res.json();
        setNodes(Array.isArray(data) ? data : []);
      } else {
        setNodes((prev) => prev ?? []);
      }
    } catch {
      setNodes((prev) => prev ?? []);
    }
  }, [session]);

  useEffect(() => {
    fetchNodes();
    const iv = setInterval(fetchNodes, 10000);
    return () => clearInterval(iv);
  }, [fetchNodes]);

  // ── WebSocket live metrics ───────────────────────────────────────────────

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl());

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.type === 'nodeMetrics') {
            setMetrics((prev) => {
              const next = new Map(prev);
              next.set(data.nodeId, data as NodeMetrics);
              return next;
            });
            setLastUpdate(new Date());
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        // silently ignore — will retry on reconnect
      };
    } catch {
      // WebSocket creation failed — not fatal
    }

    return () => {
      try { ws?.close(); } catch {}
    };
  }, []);

  // ── Edit / Delete handlers ───────────────────────────────────────────────

  const handleEditSave = async (id: string, data: EditNodeFormData) => {
    const res = await fetch(`/api/nodes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(data),
    });

    const text = await res.text();

    if (!res.ok) {
      let msg = `Server error (HTTP ${res.status})`;
      try {
        msg = JSON.parse(text)?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    await fetchNodes();
  };

  const handleEditTest = async (
    data: EditNodeFormData
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/nodes/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipAddress: data.ipAddress,
          port: data.port,
          username: data.username,
          authType: data.authType,
          credential: data.credential,
        }),
      });

      const text = await res.text();

      try {
        return JSON.parse(text);
      } catch {
        return { success: false, message: text.slice(0, 200) };
      }
    } catch (err: any) {
  return {
    success: false,
    message: err?.message || 'Unable to reach backend server',
  };
}
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE', headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });

    if (!res.ok) {
      const text = await res.text();
      let msg = `Delete failed (HTTP ${res.status})`;
      try {
        msg = JSON.parse(text)?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    setMetrics((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    await fetchNodes();
  };

  // ── Terminal handlers ────────────────────────────────────────────────────

  const handleOpenTerminal = (nodeId: string, nodeName: string) => {
    if (onOpenTerminalPage) {
      // Navigate to the full TerminalPage
      onOpenTerminalPage(nodeId, nodeName);
    } else {
      // Fall back to modal
      setTerminalNodeId(nodeId);
      setTerminalNodeName(nodeName);
    }
  };

  const handleCloseTerminal = () => {
    setTerminalNodeId(null);
    setTerminalNodeName('');
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const safeNodes = nodes ?? [];

const onlineCount  = safeNodes.filter((n) => n.status === 'online').length;
const offlineCount = safeNodes.filter((n) => n.status === 'offline').length;
const warningCount = safeNodes.filter((n) => n.status === 'warning').length;

const filteredNodes = safeNodes.filter((node) => {
  const matchesSearch =
    !search ||
    node.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    node.ipAddress?.toLowerCase().includes(search.toLowerCase());

  const matchesFilter =
    filter === 'ALL' ||
    (filter === 'ONLINE' && node.status === 'online') ||
    (filter === 'OFFLINE' && node.status === 'offline') ||
    (filter === 'WARNING' && node.status === 'warning');

  return matchesSearch && matchesFilter;
});

  // ── UI ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="min-h-screen bg-[#050505] text-white">
        {/* Top Bar */}
        <div className="sticky top-0 z-20 border-b border-white/5 bg-black/60 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Nodes Fleet</h1>
              <p className="text-sm text-gray-500">Fleet Overview</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchNodes}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>

              <button
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Notifications"
              >
                <Bell size={16} />
              </button>

              <button
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Settings"
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Online</p>
              <h3 className="mt-2 text-3xl font-bold text-neon-lime">{onlineCount}</h3>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Offline</p>
              <h3 className="mt-2 text-3xl font-bold text-red-400">{offlineCount}</h3>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Warning</p>
              <h3 className="mt-2 text-3xl font-bold text-yellow-400">{warningCount}</h3>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search systems..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-neon-lime/40"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['ALL', 'ONLINE', 'OFFLINE', 'WARNING'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                    filter === f
                      ? 'bg-neon-lime text-black'
                      : 'border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Last update */}
          <div className="mb-4 text-xs text-gray-500">
            Last update:{' '}
            <span className="text-gray-300">
              {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Waiting for live data...'}
            </span>
          </div>

          {/* Loading / Nodes Grid */}
          {nodes === null ? (
            <LoadingState />
          ) : filteredNodes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <p className="text-lg font-semibold text-white">No nodes found</p>
              <p className="mt-2 text-sm text-gray-500">
                Try changing the filter or search query.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {filteredNodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  metrics={metrics.get(node.id)}
                  onViewDetails={onViewDetails}
                  onEditClick={isIntern ? () => {} : setEditTarget}
                  onOpenTerminal={handleOpenTerminal}
                  isIntern={isIntern}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <EditNodeModal
          isOpen={!!editTarget}
          nodeId={editTarget.id}
          initial={{
            displayName: editTarget.displayName,
            ipAddress:   editTarget.ipAddress,
            username:    editTarget.username,
            port:        String(editTarget.port),
            region:      editTarget.region ?? 'US-East-1',
            authType:    editTarget.authType ?? 'password',
          }}
          onClose={() => setEditTarget(null)}
          onSave={handleEditSave}
          onTest={handleEditTest}
          onDelete={handleDelete}
        />
      )}

      {/* Terminal modal (fallback if no TerminalPage) */}
      <TerminalModal
        isOpen={!!terminalNodeId}
        nodeId={terminalNodeId}
        nodeName={terminalNodeName}
        onClose={handleCloseTerminal}
      />
    </>
  );
}