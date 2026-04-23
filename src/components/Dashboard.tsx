import React from 'react';
import { Cpu, HardDrive, Clock, Search, Bell, Sliders, Rocket, Activity, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { useMetrics } from '../hooks/useMetrics';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';

function StatCard({ title, value, unit, icon: Icon, chartData, footer }: any) {
  return (
    <div className="bg-card-bg border border-border p-6 rounded-xl relative overflow-hidden group">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1 font-bold">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-white">{value}</span>
            <span className="text-xl font-bold text-neon-lime">{unit}</span>
          </div>
        </div>
        <div className="bg-neon-lime/10 p-2 rounded-lg text-neon-lime border border-neon-lime/20 group-hover:neon-glow transition-all">
          <Icon size={24} />
        </div>
      </div>

      {chartData && (
        <div className="h-16 -mx-6 -mb-6 mt-4 opacity-50 group-hover:opacity-100 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <Area type="monotone" dataKey="value" stroke="#D4FF00" fill="url(#colorNeon)" strokeWidth={2} />
              <defs>
                <linearGradient id="colorNeon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4FF00" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#D4FF00" stopOpacity={0}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {footer && (
        <div className="mt-4 pt-4 border-t border-border flex justify-between items-center text-[10px] text-gray-500 uppercase tracking-wider font-bold">
          {footer}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { metrics, history, connected } = useMetrics();

  const cpuData = history.map((h, i) => ({ name: i, value: h.cpu }));
  const bandwidthData = history.map((h, i) => ({ name: i, value: h.bandwidth }));

  const radarData = [
    { subject: 'CPU', A: metrics?.cpu || 40, fullMark: 100 },
    { subject: 'RAM', A: metrics?.ram ? (metrics.ram / 16) * 100 : 30, fullMark: 100 },
    { subject: 'I/O', A: 65, fullMark: 100 },
    { subject: 'LATENCY', A: 85, fullMark: 100 },
    { subject: 'CORE', A: 90, fullMark: 100 },
  ];

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl italic font-bold tracking-tight text-white">
            <span className="text-neon-lime">Wellcome</span> to MYACCESS DASHBOARD
          </h2>
          <div className="h-6 w-[1px] bg-border" />
          <p className="text-sm text-gray-400 font-mono">Node: Alpha-7</p>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search parameters..." 
              className="bg-card-bg border border-border pl-10 pr-4 py-2 rounded-lg text-sm text-white focus:outline-none focus:border-neon-lime transition-colors w-64"
            />
          </div>
          <div className="flex gap-4">
            <button className="text-gray-400 hover:text-white transition-colors"><Bell size={20} /></button>
            <button className="text-gray-400 hover:text-white transition-colors"><Sliders size={20} /></button>
          </div>
          <button className="bg-neon-lime text-black px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-[#BDE600] transition-colors neon-glow">
            <Rocket size={16} />
            Deploy
          </button>
          <div className="w-10 h-10 rounded-full border border-border bg-gray-800 overflow-hidden">
            <img src="https://picsum.photos/seed/user/40/40" alt="Profile" referrerPolicy="no-referrer" />
          </div>
        </div>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard 
          title="CPU LOAD" 
          value={metrics?.cpu.toFixed(1) || '0.0'} 
          unit="%" 
          icon={Cpu} 
          chartData={cpuData}
        />
        <StatCard 
          title="RAM USAGE" 
          value={metrics?.ram.toFixed(1) || '0.0'} 
          unit="GB" 
          icon={HardDrive}
          footer={
            <>
              <span>Used: 64%</span>
              <span>Total: 32GB</span>
            </>
          }
        />
        <StatCard 
          title="TOTAL UPTIME" 
          value="142d" 
          unit="18h" 
          icon={Clock}
          footer={
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-neon-lime animate-pulse" />
              <span>System Status: Optimal</span>
            </div>
          }
        />
      </div>

      {/* Timeline Section */}
      <div className="bg-card-bg border border-border rounded-xl p-8 mb-8">
        <div className="flex justify-between items-center mb-12">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">Server Status Timeline</h3>
          <div className="flex gap-4 text-[10px] font-bold tracking-widest uppercase">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-neon-lime" /> <span className="text-gray-500">Operational</span></div>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /> <span className="text-gray-500">Failure</span></div>
          </div>
        </div>

        <div className="relative h-24 flex items-center justify-between px-10">
          <div className="absolute left-10 right-10 h-[2px] bg-border" />
          {metrics?.events.map((event, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center">
              <span className="absolute -top-10 text-[10px] font-bold text-white tracking-wider whitespace-nowrap">{event.label}</span>
              <span className="absolute -top-6 text-[8px] font-medium text-gray-500 whitespace-nowrap uppercase">{event.time}</span>
              <div className={`w-4 h-4 rounded-full border-4 border-card-bg ${event.type === 'FAILURE' ? 'bg-red-500' : 'bg-neon-lime'} ${event.type === 'FAILURE' ? 'shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'shadow-[0_0_10px_rgba(212,255,0,0.5)]'}`} />
            </div>
          ))}
          <div className="relative z-10 flex flex-col items-center opacity-30">
            <span className="absolute -top-10 text-[10px] font-bold text-white tracking-wider">PENDING</span>
            <div className="w-4 h-4 rounded-full border-2 border-neon-lime" />
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 bg-card-bg border border-border rounded-xl p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white mb-2">Bandwidth Traffic</h3>
              <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Real-time I/O Monitoring</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-neon-lime">{metrics?.bandwidth.toFixed(1) || '0.0'} MB/s</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Peak: 1.2 GB/s</p>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bandwidthData}>
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#D4FF00" 
                  strokeWidth={4}
                  fill="url(#colorBandwidth)" 
                  animationDuration={500}
                />
                <defs>
                   <linearGradient id="colorBandwidth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4FF00" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#D4FF00" stopOpacity={0}/>
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-card-bg border border-border rounded-xl p-8 flex flex-col items-center">
           <div className="w-full flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">Server Health</h3>
            <div className="bg-neon-lime/10 text-neon-lime px-3 py-1 rounded text-[10px] font-bold border border-neon-lime/20 uppercase tracking-widest">
              98.4 SCORE
            </div>
          </div>
          
          <div className="flex-1 w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="#1F1F1F" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 'bold' }} />
                <Radar
                   name="Health"
                   dataKey="A"
                   stroke="#D4FF00"
                   fill="#D4FF00"
                   fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="w-full mt-4 p-4 border border-border rounded-lg flex items-center justify-between bg-black/20 group relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-neon-lime/10 text-neon-lime">
                <Shield size={16} />
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Network Secure</span>
            </div>
            <div className="w-3 h-3 rounded-full bg-neon-lime shadow-[0_0_10px_#D4FF00]" />
            <div className="absolute inset-0 bg-neon-lime/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </div>
  );
}
