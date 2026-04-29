import { useState, useEffect, useRef, useCallback } from 'react';

import {
  Cpu, HardDrive, Clock, Search, Bell, Sliders, Rocket,
  Shield, Activity, Wifi, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { wsUrl } from '../utils/wsUrl';
import { useAuth } from '../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  status: string;
  region?: string;
}

interface NodeMetrics {
  type: string;
  nodeId: string;
  status: 'online' | 'offline' | 'warning';
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  ramPercent: number;
  uptime: string;
  netIn: number;
  netOut: number;
  diskRead: number;
  diskWrite: number;
  os: string;
  cpuModel: string;
  cpuCores: number;
}

interface ChartPoint { time: string; value: number; }
interface NetPoint   { time: string; inbound: number; outbound: number; }

const ROTATION_SECS = 60;

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ title, value, unit, icon: Icon, sub }: any) {
  return (
    <div className="bg-[#111111] border border-[#1F1F1F] p-6 rounded-xl relative overflow-hidden group">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1 font-bold">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-white">{value}</span>
            <span className="text-xl font-bold text-neon-lime">{unit}</span>
          </div>
          {sub && <p className="text-[10px] text-gray-600 mt-1 font-mono">{sub}</p>}
        </div>
        <div className="bg-neon-lime/10 p-2 rounded-lg text-neon-lime border border-neon-lime/20 group-hover:shadow-[0_0_12px_rgba(212,255,0,0.3)] transition-all">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1A1A1A] border border-[#2F2F2F] rounded-lg px-3 py-2 text-[11px]">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-bold">{p.name}: {Number(p.value).toFixed(1)}</p>
      ))}
    </div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { session } = useAuth();

  // ── Node list & rotation ─────────────────────────────────────────────────
  const [nodes, setNodes]               = useState<NodeRecord[]>([]);
  const [activeIndex, setActiveIndex]   = useState(0);
  const [countdown, setCountdown]       = useState(ROTATION_SECS);
  const rotationRef                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef                    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Live metrics for the active node ────────────────────────────────────
  const [metrics,  setMetrics]  = useState<NodeMetrics | null>(null);
  const [cpuHist,  setCpuHist]  = useState<ChartPoint[]>([]);
  const [ramHist,  setRamHist]  = useState<ChartPoint[]>([]);
  const [netHist,  setNetHist]  = useState<NetPoint[]>([]);

  const onlineNodes  = nodes.filter(n => n.status === 'online' || n.status === 'warning');
  const currentNode  = onlineNodes[activeIndex] ?? null;

  // ── Fetch node list ──────────────────────────────────────────────────────
  const fetchNodes = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/nodes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data: NodeRecord[] = await res.json();
        setNodes(data);
      }
    } catch {}
  }, [session]);

  useEffect(() => {
    fetchNodes();
    const iv = setInterval(fetchNodes, 15000);
    return () => clearInterval(iv);
  }, [fetchNodes]);

  // ── Rotation timer ───────────────────────────────────────────────────────
  const advanceNode = useCallback(() => {
    setActiveIndex(prev => (onlineNodes.length > 1 ? (prev + 1) % onlineNodes.length : prev));
    setCountdown(ROTATION_SECS);
    // Clear metrics for fresh slate on new node
    setMetrics(null);
    setCpuHist([]);
    setRamHist([]);
    setNetHist([]);
  }, [onlineNodes.length]);

  useEffect(() => {
    if (onlineNodes.length <= 1) return;
    rotationRef.current  = setInterval(advanceNode, ROTATION_SECS * 1000);
    countdownRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (rotationRef.current)  clearInterval(rotationRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [advanceNode, onlineNodes.length]);

  // Reset countdown when active node changes manually
  const manualNav = (dir: 'prev' | 'next') => {
    if (onlineNodes.length === 0) return;
    setActiveIndex(prev => dir === 'next'
      ? (prev + 1) % onlineNodes.length
      : (prev - 1 + onlineNodes.length) % onlineNodes.length
    );
    setCountdown(ROTATION_SECS);
    setMetrics(null); setCpuHist([]); setRamHist([]); setNetHist([]);
    // Reset rotation interval
    if (rotationRef.current)  clearInterval(rotationRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    rotationRef.current  = setInterval(advanceNode, ROTATION_SECS * 1000);
    countdownRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
  };

  // ── WebSocket — filter by active node ───────────────────────────────────
  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type !== 'nodeMetrics') return;
        if (!currentNode || data.nodeId !== currentNode.id) return;
        setMetrics(data as NodeMetrics);
        const t = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setCpuHist(prev => [...prev.slice(-29), { time: t, value: data.cpu ?? 0 }]);
        setRamHist(prev => [...prev.slice(-29), { time: t, value: data.ramPercent ?? 0 }]);
        setNetHist(prev => [...prev.slice(-29), { time: t, inbound: data.netIn ?? 0, outbound: data.netOut ?? 0 }]);
      } catch {}
    };
    return () => ws.close();
  }, [currentNode?.id]);

  // ── Progress bar width ───────────────────────────────────────────────────
  const progressPct = Math.round((countdown / ROTATION_SECS) * 100);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-8 overflow-y-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-1">
            MYACCESS MONITORING
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            LIVE MONITORING:&nbsp;
            <AnimatePresence mode="wait">
              <motion.span
                key={currentNode?.id ?? 'none'}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.3 }}
                className="text-neon-lime"
              >
                {currentNode?.displayName ?? 'No Nodes Connected'}
              </motion.span>
            </AnimatePresence>
          </h2>
          {currentNode && (
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
              {currentNode.ipAddress} &nbsp;·&nbsp; {currentNode.region ?? 'US-East-1'} &nbsp;·&nbsp;
              <span className={`font-bold ${currentNode.status === 'online' ? 'text-neon-lime' : 'text-yellow-400'}`}>
                {currentNode.status.toUpperCase()}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Node navigator */}
          {onlineNodes.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => manualNav('prev')}
                className="w-8 h-8 rounded-lg border border-[#2F2F2F] text-gray-400 hover:text-neon-lime hover:border-neon-lime/40 flex items-center justify-center transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-mono text-gray-500">
                {activeIndex + 1} / {onlineNodes.length}
              </span>
              <button
                onClick={() => manualNav('next')}
                className="w-8 h-8 rounded-lg border border-[#2F2F2F] text-gray-400 hover:text-neon-lime hover:border-neon-lime/40 flex items-center justify-center transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              className="bg-[#111111] border border-[#1F1F1F] pl-9 pr-4 py-2 rounded-lg text-sm text-white focus:outline-none focus:border-neon-lime/40 transition-colors w-48"
            />
          </div> */}
          {/* <button className="text-gray-400 hover:text-white transition-colors"><Bell size={18} /></button> */}
          <button
  onClick={() => { window.location.hash = "profile"; }}
  className="text-gray-400 hover:text-white transition-colors"
>
  <Sliders size={18} />
</button>
          <button className="bg-neon-lime text-black px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-[#BDE600] transition-colors shadow-[0_0_16px_rgba(212,255,0,0.2)]">
            <Rocket size={14} /> Deploy
          </button>
        </div>
      </header>

      {/* ── Rotation progress bar ──────────────────────────────────────── */}
      {onlineNodes.length > 1 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-gray-600 font-mono uppercase tracking-wider">
              Next rotation in
            </span>
            <span className="text-[10px] text-neon-lime font-mono font-bold">{countdown}s</span>
          </div>
          <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-neon-lime rounded-full"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: 'linear' }}
            />
          </div>
        </div>
      )}

      {/* ── No nodes state ──────────────────────────────────────────────── */}
      {onlineNodes.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-full bg-[#1A1A1A] border border-[#2F2F2F] flex items-center justify-center mb-4">
            <Activity size={28} className="text-gray-600" />
          </div>
          <p className="text-gray-400 font-bold mb-1">No nodes connected</p>
          <p className="text-gray-600 text-sm">Add a node and wait for it to come online.</p>
          <p className="text-gray-700 text-xs mt-2 font-mono">
            {nodes.length > 0 ? `${nodes.length} node(s) found but offline` : 'No nodes registered'}
          </p>
        </div>
      )}

      {currentNode && (
        <>
          {/* ── Stat cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-5 mb-6">
            <StatCard
              title="CPU Load"
              value={metrics ? metrics.cpu.toFixed(1) : '—'}
              unit="%"
              icon={Cpu}
              sub={metrics?.cpuModel ? `${metrics.cpuCores} cores` : undefined}
            />
            <StatCard
              title="RAM Usage"
              value={metrics ? metrics.ramPercent.toString() : '—'}
              unit="%"
              icon={HardDrive}
              sub={metrics ? `${(metrics.ramUsed / 1024).toFixed(1)} / ${(metrics.ramTotal / 1024).toFixed(1)} GB` : undefined}
            />
            <StatCard
              title="Uptime"
              value={metrics?.uptime ?? '—'}
              unit=""
              icon={Clock}
              sub={metrics?.os ?? undefined}
            />
            <StatCard
              title="Network In"
              value={metrics ? metrics.netIn.toFixed(1) : '—'}
              unit=" kB/s"
              icon={Wifi}
              sub={metrics ? `Out: ${metrics.netOut.toFixed(1)} kB/s` : undefined}
            />
          </div>

          {/* ── Charts row ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-5 mb-6">

            {/* CPU chart */}
            <div className="col-span-12 lg:col-span-4 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">CPU Usage</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">{metrics?.cpuModel ?? 'Unknown CPU'}</p>
                </div>
                <span className="text-2xl font-bold text-neon-lime">{metrics ? `${metrics.cpu.toFixed(0)}%` : '—'}</span>
              </div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cpuHist.length ? cpuHist : [{ time: '', value: 0 }]}>
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#D4FF00" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#D4FF00" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#4B5563', fontSize: 9 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="value" name="CPU %" stroke="#D4FF00" strokeWidth={2} fill="url(#cpuGrad)" dot={false} animationDuration={300} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* RAM chart */}
            <div className="col-span-12 lg:col-span-4 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">RAM Usage</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {metrics ? `${(metrics.ramUsed / 1024).toFixed(1)} / ${(metrics.ramTotal / 1024).toFixed(1)} GB` : '— / —'}
                  </p>
                </div>
                <span className="text-2xl font-bold text-blue-400">{metrics ? `${metrics.ramPercent}%` : '—'}</span>
              </div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ramHist.length ? ramHist : [{ time: '', value: 0 }]}>
                    <defs>
                      <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#60A5FA" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#60A5FA" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#4B5563', fontSize: 9 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="value" name="RAM %" stroke="#60A5FA" strokeWidth={2} fill="url(#ramGrad)" dot={false} animationDuration={300} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Network chart */}
            <div className="col-span-12 lg:col-span-4 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Network Throughput</p>
                <div className="flex gap-3 text-[9px] font-bold">
                  <span className="flex items-center gap-1 text-neon-lime"><span className="w-2 h-0.5 bg-neon-lime rounded inline-block" />In</span>
                  <span className="flex items-center gap-1 text-gray-500"><span className="w-2 h-0.5 bg-gray-500 rounded inline-block" />Out</span>
                </div>
              </div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netHist.length ? netHist : [{ time: '', inbound: 0, outbound: 0 }]}>
                    <CartesianGrid stroke="#1A1A1A" strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={false} axisLine={false} />
                    <YAxis tick={{ fill: '#4B5563', fontSize: 9 }} axisLine={false} tickLine={false} width={28} tickFormatter={v => `${v.toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="inbound"  name="In (kB/s)"  stroke="#D4FF00" strokeWidth={2} dot={false} animationDuration={300} />
                    <Line type="monotone" dataKey="outbound" name="Out (kB/s)" stroke="#6B7280" strokeWidth={2} dot={false} strokeDasharray="5 3" animationDuration={300} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Disk I/O + All nodes list ────────────────────────────────── */}
          <div className="grid grid-cols-12 gap-5">

            {/* Disk I/O */}
            <div className="col-span-12 lg:col-span-4 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-4">Disk I/O</p>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neon-lime/10 border border-neon-lime/20 flex items-center justify-center text-neon-lime">
                      <Activity size={14} />
                    </div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">READ</span>
                  </div>
                  <span className="text-lg font-bold text-white font-mono">
                    {metrics ? `${metrics.diskRead.toFixed(2)} MB/s` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-400/10 border border-blue-400/20 flex items-center justify-center text-blue-400">
                      <Activity size={14} className="rotate-180" />
                    </div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">WRITE</span>
                  </div>
                  <span className="text-lg font-bold text-white font-mono">
                    {metrics ? `${metrics.diskWrite.toFixed(2)} MB/s` : '—'}
                  </span>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t border-[#1A1A1A] flex items-center gap-2">
                <Shield size={13} className="text-neon-lime" />
                <span className="text-[10px] text-gray-600 font-mono">Storage Healthy</span>
              </div>
            </div>

            {/* All nodes overview */}
            <div className="col-span-12 lg:col-span-8 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Fleet Overview</p>
                <span className="text-[10px] font-mono text-gray-600">{nodes.length} node(s) total</span>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {nodes.length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-6">No nodes registered</p>
                )}
                {nodes.map((n) => {
                  const isActive = n.id === currentNode?.id;
                  const statusColor =
                    n.status === 'online'  ? 'bg-neon-lime'   :
                    n.status === 'warning' ? 'bg-yellow-400'  : 'bg-gray-600';
                  const textColor =
                    n.status === 'online'  ? 'text-neon-lime'  :
                    n.status === 'warning' ? 'text-yellow-400' : 'text-gray-500';
                  return (
                    <div
                      key={n.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                        isActive
                          ? 'bg-neon-lime/5 border-neon-lime/20'
                          : 'bg-[#0D0D0D] border-[#1A1A1A] hover:border-[#2F2F2F]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${statusColor} ${n.status !== 'offline' ? 'animate-pulse' : ''}`} />
                        <div>
                          <p className={`text-xs font-bold ${isActive ? 'text-neon-lime' : 'text-white'}`}>{n.displayName}</p>
                          <p className="text-[10px] text-gray-600 font-mono">{n.ipAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isActive && (
                          <span className="text-[9px] font-bold text-neon-lime bg-neon-lime/10 border border-neon-lime/20 rounded px-2 py-0.5 uppercase tracking-wider">
                            LIVE
                          </span>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${textColor}`}>
                          {n.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
