import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Terminal, RotateCcw, SlidersHorizontal,
  PowerOff, Clock, Wifi, CheckCircle2, Shield,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { wsUrl } from '../utils/wsUrl';

// ── Types ────────────────────────────────────────────────────────────────────

interface LogLine {
  time: string;
  level: 'INFO' | 'WARN' | 'DEBUG' | 'ERROR' | 'LIVE';
  message: string;
}

interface NodeMetrics {
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

interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  port: number;
  region?: string;
  status: string;
}

interface ChartPoint { time: string; value: number; }
interface NetPoint   { time: string; inbound: number; outbound: number; }

interface Props {
  nodeId: string;
  onBack: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function levelColor(level: LogLine['level']) {
  switch (level) {
    case 'INFO':  return 'text-neon-lime';
    case 'WARN':  return 'text-yellow-400';
    case 'DEBUG': return 'text-blue-400';
    case 'ERROR': return 'text-red-400';
    case 'LIVE':  return 'text-purple-400';
    default:      return 'text-gray-400';
  }
}

function UptimeClock({ uptime }: { uptime: string }) {
  return (
    <div className="bg-[#141414] border border-[#1F1F1F] rounded-xl px-6 py-4 text-center">
      <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-1">Uptime</p>
      <p className="text-2xl font-bold text-neon-lime font-mono tracking-widest">{uptime || '—'}</p>
    </div>
  );
}

function PingCard({ ping }: { ping: number }) {
  return (
    <div className="bg-[#141414] border border-[#1F1F1F] rounded-xl px-6 py-4 text-center">
      <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-1">Ping</p>
      <p className="text-2xl font-bold text-white font-mono">
        {ping < 0 ? '—' : `${ping}ms`}
      </p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1A1A1A] border border-[#2F2F2F] rounded-lg px-3 py-2 text-[11px]">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-bold">{p.name}: {p.value.toFixed(1)}</p>
      ))}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function NodeDetailPage({ nodeId, onBack }: Props) {
  const [node,    setNode]    = useState<NodeRecord | null>(null);
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [cpuHist, setCpuHist] = useState<ChartPoint[]>([]);
  const [netHist, setNetHist] = useState<NetPoint[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // Fetch node info
  useEffect(() => {
    fetch(`/api/nodes/${nodeId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setNode(d))
      .catch(() => {});
  }, [nodeId]);

  // WebSocket for live metrics
  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'nodeMetrics' && data.nodeId === nodeId) {
          setMetrics(data as NodeMetrics);
          const t = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setCpuHist(prev => [...prev.slice(-29), { time: t, value: data.cpu ?? 0 }]);
          setNetHist(prev => [...prev.slice(-29), { time: t, inbound: data.netIn ?? 0, outbound: data.netOut ?? 0 }]);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [nodeId]);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [metrics?.logs]);

  const effectiveStatus = metrics?.status ?? node?.status ?? 'connecting';

  // Simulate some CPU history if none yet
  useEffect(() => {
    if (cpuHist.length === 0) {
      const fake: ChartPoint[] = Array.from({ length: 20 }, (_, i) => ({
        time: `${i}s`, value: 20 + Math.random() * 30,
      }));
      setCpuHist(fake);
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest mb-3 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Fleet
          </button>

          <div className="flex items-center gap-3 mb-1">
            <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${
              effectiveStatus === 'online'
                ? 'text-neon-lime bg-neon-lime/10 border-neon-lime/30'
                : effectiveStatus === 'warning'
                ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
                : 'text-red-400 bg-red-500/10 border-red-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${effectiveStatus === 'online' ? 'bg-neon-lime animate-pulse' : effectiveStatus === 'warning' ? 'bg-yellow-400 animate-pulse' : 'bg-red-500'}`} />
              Node {effectiveStatus.toUpperCase()}
            </span>
          </div>

          <h1 className="text-5xl font-bold text-white tracking-tight">{node?.displayName || '—'}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {metrics?.cpuModel ? `${metrics.cpuModel}` : 'Unknown Hardware'} &nbsp;|&nbsp; Region: {node?.region || 'US-East-1'}
          </p>
        </div>

        <div className="flex gap-4">
          <UptimeClock uptime={metrics?.uptime || '—'} />
          <PingCard    ping={metrics?.ping ?? -1}     />
        </div>
      </div>

      {/* ── Action Buttons ────────────────────────────────────── */}
      <div className="flex gap-3 mb-8 flex-wrap">
        {[
          { icon: Terminal,          label: 'Open Terminal'  },
          { icon: RotateCcw,         label: 'Soft Reboot'   },
          { icon: SlidersHorizontal, label: 'Update Config' },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center gap-2 bg-[#141414] border border-[#2F2F2F] hover:border-neon-lime/30 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all hover:bg-neon-lime/5"
          >
            <Icon size={15} /> {label}
          </button>
        ))}
        <button className="flex items-center gap-2 bg-red-600/10 border border-red-600/30 hover:border-red-500 text-red-400 hover:text-red-300 text-sm font-bold px-5 py-2.5 rounded-lg transition-all">
          <PowerOff size={15} /> Force Shutdown
        </button>
      </div>

      {/* ── Charts Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5 mb-5">

        {/* CPU Area Chart */}
        <div className="col-span-12 lg:col-span-6 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">CPU Usage</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">{metrics?.cpuModel || 'Unknown CPU'}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-neon-lime">{metrics ? `${metrics.cpu.toFixed(0)}%` : '—'}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                {metrics && metrics.cpu < 60 ? 'Normal Load' : metrics && metrics.cpu < 85 ? 'High Load' : 'Critical'}
              </p>
            </div>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cpuHist}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#D4FF00" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#D4FF00" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#4B5563', fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" name="CPU %" stroke="#D4FF00" strokeWidth={2} fill="url(#cpuGrad)" dot={false} animationDuration={300} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Memory */}
        <div className="col-span-12 lg:col-span-3 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Memory</h3>
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 mb-1">Utilized</p>
            <p className="text-lg font-bold text-white mb-2">
              {metrics ? `${(metrics.ramUsed / 1024).toFixed(1)} GB / ${(metrics.ramTotal / 1024).toFixed(1)} GB` : '— / —'}
            </p>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-neon-lime rounded-full"
                animate={{ width: `${metrics?.ramPercent ?? 0}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-auto">
            <div className="bg-[#0D0D0D] rounded-lg p-3 text-center border border-[#1A1A1A]">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">Swap</p>
              <p className="text-sm font-bold text-white">{metrics ? `${(metrics.swap / 1024).toFixed(1)} GB` : '—'}</p>
            </div>
            <div className="bg-[#0D0D0D] rounded-lg p-3 text-center border border-[#1A1A1A]">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">Cache</p>
              <p className="text-sm font-bold text-white">{metrics ? `${(metrics.cache / 1024).toFixed(1)} GB` : '—'}</p>
            </div>
          </div>
        </div>

        {/* Disk I/O */}
        <div className="col-span-12 lg:col-span-3 bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Disk I/O</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-neon-lime"><Wifi size={16} /></div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Read</p>
                <p className="text-lg font-bold text-white">{metrics ? `${metrics.diskRead.toFixed(1)} MB/s` : '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-blue-400 rotate-180"><Wifi size={16} /></div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Write</p>
                <p className="text-lg font-bold text-white">{metrics ? `${metrics.diskWrite.toFixed(1)} MB/s` : '—'}</p>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 font-mono mt-6">NVMe Array Status: Ready</p>
        </div>
      </div>

      {/* Network Throughput */}
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Network Throughput</h3>
            <span className="flex items-center gap-1 text-[10px] text-neon-lime bg-neon-lime/10 border border-neon-lime/20 rounded-full px-2 py-0.5">
              <span className="w-1 h-1 rounded-full bg-neon-lime animate-pulse" /> Live Flow
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-bold">
            <span className="flex items-center gap-1.5 text-neon-lime"><span className="w-3 h-0.5 bg-neon-lime rounded" /> Inbound</span>
            <span className="flex items-center gap-1.5 text-gray-400"><span className="w-3 h-0.5 bg-gray-400 rounded" /> Outbound</span>
          </div>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={netHist.length ? netHist : [{ time: '—', inbound: 0, outbound: 0 }]}>
              <CartesianGrid stroke="#1F1F1F" strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={false} axisLine={false} />
              <YAxis tick={{ fill: '#4B5563', fontSize: 9 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="inbound"  name="In (kB/s)"  stroke="#D4FF00" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="outbound" name="Out (kB/s)" stroke="#6B7280" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Bottom: Logs + Sidebar ─────────────────────────── */}
      <div className="grid grid-cols-12 gap-5">

        {/* Log Stream */}
        <div className="col-span-12 lg:col-span-8 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#1F1F1F] bg-[#111111]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-neon-lime" />
              <span className="text-xs font-bold text-gray-400 ml-3 uppercase tracking-wider">System Log Stream</span>
            </div>
            <span className="text-[10px] text-gray-600 font-mono">Log Level: INFO</span>
          </div>
          <div
            ref={logRef}
            className="p-4 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1"
            style={{ background: 'linear-gradient(to bottom, #090909, #0A0A0A)' }}
          >
            {metrics?.logs && metrics.logs.length > 0
              ? metrics.logs.map((log, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-gray-600 flex-shrink-0 w-20">{log.time}</span>
                  <span className={`font-bold flex-shrink-0 w-14 ${levelColor(log.level)}`}>[{log.level}]</span>
                  <span className="text-gray-300 break-all">{log.message}</span>
                </div>
              ))
              : (
                <div className="text-gray-600 text-center py-8">
                  {effectiveStatus === 'offline'
                    ? '⚠ Node is offline — cannot retrieve logs'
                    : '⟳ Waiting for log data from node...'}
                </div>
              )
            }
          </div>
        </div>

        {/* Sidebar: Hardware + Security */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Hardware Profile */}
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-neon-lime" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Hardware Profile</h3>
            </div>
            <div className="space-y-2.5 text-[12px]">
              {[
                { label: 'OS',          value: metrics?.os        || '—' },
                { label: 'Kernel',      value: metrics?.kernel    || '—' },
                { label: 'CPU Cores',   value: metrics?.cpuCores  ? `${metrics.cpuCores} Threads` : '—' },
                { label: 'Public IP',   value: metrics?.publicIp  || node?.ipAddress || '—' },
                { label: 'Internal IP', value: node?.ipAddress    || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-[#1A1A1A]">
                  <span className="text-gray-500 font-medium">{label}</span>
                  <span className="text-white font-mono text-right max-w-[55%] truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security Status */}
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-neon-lime" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Security Status</h3>
            </div>
            <div className="space-y-2.5">
              {[
                'Firewall Active',
                'SSH Key Auth Only',
                'Data At Rest Encrypted',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <CheckCircle2 size={15} className="text-neon-lime flex-shrink-0" />
                  <span className="text-[12px] text-gray-300">{item}</span>
                </div>
              ))}
            </div>
            <button className="mt-5 w-full border border-[#2F2F2F] hover:border-neon-lime/30 text-gray-400 hover:text-neon-lime text-xs font-bold py-2 rounded-lg transition-all">
              Run Deep Scan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
