import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Crown, Plus, Users, Server, Activity, FileText,
  CheckCircle, AlertCircle, Loader2, Eye, EyeOff, Shield, Mail,
} from 'lucide-react';
import AdminManagementPanel from './AdminManagementPanel';
import SmtpSettingsPanel from './SmtpSettingsPanel';

interface PlatformStats {
  totalNodes: number; totalUsers: number;
  totalRequests: number; onlineNodes: number; activeAdmins: number;
}

type Tab = 'admins' | 'create' | 'smtp';

export default function SystemManagementPage() {
  const { session } = useAuth();
  const tok = session?.access_token ?? '';
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  const [tab, setTab] = useState<Tab>('admins');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStats = useCallback(async () => {
    if (!tok) return;
    setLoadingStats(true);
    try {
      const r = await fetch('/api/super-admin/stats', { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) setStats(await r.json());
    } catch { }
    setLoadingStats(false);
  }, [tok]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setCreateMsg(null);
    try {
      const r = await fetch('/api/super-admin/create-admin', {
        method: 'POST', headers: H,
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (r.ok) {
        setCreateMsg({ type: 'success', text: `Admin created for ${email}` });
        setEmail(''); setPassword('');
        fetchStats();
      } else {
        setCreateMsg({ type: 'error', text: d.message || 'Failed to create admin' });
      }
    } catch { setCreateMsg({ type: 'error', text: 'Network error' }); }
    setCreating(false);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'admins', label: 'Admin Management', icon: <Shield size={14} /> },
    { id: 'create', label: 'Create Admin', icon: <Plus size={14} /> },
    { id: 'smtp',   label: 'Email Settings', icon: <Mail size={14} /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#070707]">

      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-bold mb-1">SUPER ADMIN</p>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">System Management</h1>
        <p className="text-sm text-gray-600 mt-1">Platform-wide controls, quota management, and email configuration.</p>
      </div>

      {/* Stats row */}
      {!loadingStats && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'Total Nodes', value: stats.totalNodes, color: '#DFFF00', icon: <Server size={14} /> },
            { label: 'Online',      value: stats.onlineNodes,  color: '#22c55e', icon: <Activity size={14} /> },
            { label: 'Active Admins', value: stats.activeAdmins, color: '#00c8ff', icon: <Shield size={14} /> },
            { label: 'Total Users', value: stats.totalUsers,   color: '#a78bfa', icon: <Users size={14} /> },
            { label: 'Requests',    value: stats.totalRequests, color: '#f59e0b', icon: <FileText size={14} /> },
          ].map(s => (
            <div key={s.label} className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-xl p-4">
              <div style={{ color: s.color }} className="mb-2">{s.icon}</div>
              <div style={{ color: s.color }} className="text-2xl font-extrabold">{s.value}</div>
              <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 border-b border-[#1a1a1a] pb-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t.id
                ? 'bg-neon-lime/10 text-neon-lime border border-neon-lime/25'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'admins' && <AdminManagementPanel />}

      {tab === 'create' && (
        <div className="max-w-md">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[#111] flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neon-lime/10 border border-neon-lime/20 flex items-center justify-center">
                <Crown size={14} className="text-neon-lime" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Create Admin Account</h2>
                <p className="text-xs text-gray-600">Admins manage their own team and nodes</p>
              </div>
            </div>
            <form onSubmit={handleCreateAdmin} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-600 mb-1.5">Email</label>
                <input
                  type="email" required placeholder="admin@company.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#111] border border-[#222] text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-neon-lime/40"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-600 mb-1.5">Temporary Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'} required minLength={8}
                    placeholder="Min 8 characters" value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-[#111] border border-[#222] text-white rounded-lg px-3 py-2.5 pr-10 text-sm outline-none focus:border-neon-lime/40"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {createMsg && (
                <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2.5 border ${
                  createMsg.type === 'success'
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  {createMsg.type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                  {createMsg.text}
                </div>
              )}

              <button type="submit" disabled={creating}
                className="w-full bg-neon-lime text-black font-bold rounded-lg py-2.5 text-sm flex items-center justify-center gap-2 hover:bg-[#c8e600] disabled:opacity-50 transition-colors">
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {creating ? 'Creating…' : 'Create Admin'}
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === 'smtp' && <SmtpSettingsPanel />}
    </div>
  );
}
