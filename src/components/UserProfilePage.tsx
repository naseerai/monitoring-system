import { useState, useEffect } from 'react';
import {
  Key, Server, Activity, CheckCircle, Clock, ShieldCheck,
  Eye, EyeOff, AlertCircle, X, ChevronRight, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

interface ManagedNode {
  id: string;
  displayName: string;
  ipAddress: string;
  status: string;
  region?: string;
}

interface ActivityLog {
  id: string;
  event_type: string;
  system: string;
  timestamp: string;
  auth_status: 'SUCCESS' | 'PENDING' | 'FAILED';
  verification: string;
}

// ── Static demo logs (replace with real table if you add one) ─────────────
const DEMO_LOGS: ActivityLog[] = [
  { id: '1', event_type: 'Authenticated Login', system: 'auth.central_gateway', timestamp: new Date(Date.now() - 60000).toISOString(), auth_status: 'SUCCESS', verification: 'MFA-TOTP' },
  { id: '2', event_type: 'Profile Data Fetch', system: 'srv.primary_cluster_01', timestamp: new Date(Date.now() - 120000).toISOString(), auth_status: 'SUCCESS', verification: 'JWT-RS256' },
  { id: '3', event_type: 'Node Assignment Sync', system: 'node_assignments.tbl', timestamp: new Date(Date.now() - 300000).toISOString(), auth_status: 'SUCCESS', verification: 'SERVICE-ROLE' },
  { id: '4', event_type: 'Password Policy Check', system: 'auth.password_validator', timestamp: new Date(Date.now() - 600000).toISOString(), auth_status: 'PENDING', verification: 'AWAITING' },
  { id: '5', event_type: 'Session Token Refresh', system: 'ext.gateway_01', timestamp: new Date(Date.now() - 900000).toISOString(), auth_status: 'SUCCESS', verification: 'OAUTH2' },
];

// ── Password Modal ─────────────────────────────────────────────────────────

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setMsg({ type: 'error', text: 'New passwords do not match.' }); return; }
    if (next.length < 8) { setMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setMsg({ type: 'success', text: 'Password updated successfully.' });
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-md rounded-2xl border border-[#DFFF00]/20 bg-[#0F0F0F] shadow-[0_0_40px_rgba(223,255,0,0.08)] p-8"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#DFFF00]/10 border border-[#DFFF00]/20 flex items-center justify-center">
            <Key size={18} className="text-[#DFFF00]" />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">Security Protocol</p>
            <h3 className="text-white font-bold text-sm tracking-wide">CHANGE PASSWORD</h3>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] focus:border-[#DFFF00]/40 rounded-lg px-4 py-2.5 pr-10 text-white text-sm outline-none transition-all font-mono"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNext ? 'text' : 'password'}
                value={next}
                onChange={e => setNext(e.target.value)}
                required
                className="w-full bg-[#0A0A0A] border border-[#2A2A2A] focus:border-[#DFFF00]/40 rounded-lg px-4 py-2.5 pr-10 text-white text-sm outline-none transition-all font-mono"
                placeholder="min 8 characters"
              />
              <button type="button" onClick={() => setShowNext(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showNext ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full bg-[#0A0A0A] border border-[#2A2A2A] focus:border-[#DFFF00]/40 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all font-mono"
              placeholder="••••••••"
            />
          </div>

          {msg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-mono ${msg.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-[#DFFF00]/10 border border-[#DFFF00]/20 text-[#DFFF00]'}`}>
              {msg.type === 'error' ? <AlertCircle size={13} /> : <CheckCircle size={13} />}
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#DFFF00] text-black font-bold py-2.5 rounded-lg text-sm tracking-widest hover:bg-[#c8e600] transition-all disabled:opacity-50 shadow-[0_0_16px_rgba(223,255,0,0.25)] flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? 'UPDATING...' : 'UPDATE CREDENTIALS'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function UserProfilePage({ onNavigate }: { onNavigate: (to: string) => void }) {
  const { profile, session } = useAuth();
  const [nodes, setNodes] = useState<ManagedNode[]>([]);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [logs] = useState<ActivityLog[]>(DEMO_LOGS);
  const [liveTime, setLiveTime] = useState(new Date());

  // Live clock for the "precise timestamp" feel
  useEffect(() => {
    const iv = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch first 3 assigned nodes
  useEffect(() => {
    if (!session?.access_token) { setNodesLoading(false); return; }
    fetch('/api/nodes', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => r.json())
      .then((data: ManagedNode[]) => setNodes(Array.isArray(data) ? data.slice(0, 3) : []))
      .catch(() => setNodes([]))
      .finally(() => setNodesLoading(false));
  }, [session]);

  const role = profile?.role ?? 'intern';
  const email = profile?.email ?? '—';
  // Derive display name from email prefix
  const displayName = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const secId = `SEC-ID: ${profile?.id?.slice(0, 8).toUpperCase() ?? 'UNKNOWN'}`;
  const nodeLocation = nodes[0]?.region ?? 'UNASSIGNED';
  const canChangePassword = role === 'admin' || role === 'employee';

  const roleLabel: Record<string, string> = {
    admin: 'SYSTEM ADMINISTRATOR',
    employee: 'SECURITY OPERATOR',
    intern: 'INTERN ACCESS',
  };

  const statusColor = (s: string) => {
    if (s === 'online') return 'text-[#DFFF00]';
    if (s === 'warning') return 'text-yellow-400';
    return 'text-gray-500';
  };

  const statusDot = (s: string) => {
    if (s === 'online') return 'bg-[#DFFF00] shadow-[0_0_6px_#DFFF00]';
    if (s === 'warning') return 'bg-yellow-400';
    return 'bg-gray-600';
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      {/* Ambient glows */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-[#DFFF00]/5 blur-[180px] -z-10 rounded-full pointer-events-none" />
      <div className="fixed bottom-0 left-64 w-[400px] h-[400px] bg-[#DFFF00]/3 blur-[120px] -z-10 rounded-full pointer-events-none" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.25em] mb-1 font-bold">MYACCESS // USER PROFILE</p>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-1">{displayName}</h1>
            <p className="text-[#DFFF00] text-xs font-bold uppercase tracking-[0.2em]">{roleLabel[role]}</p>

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#DFFF00]/20 bg-[#DFFF00]/5 text-[10px] font-bold text-[#DFFF00] font-mono tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#DFFF00] animate-pulse" />
                {secId}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-700 bg-white/3 text-[10px] font-bold text-gray-400 font-mono tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                NODE: {nodeLocation}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-700 bg-white/3 text-[10px] font-bold text-gray-400 font-mono tracking-wider uppercase">
                {role}
              </span>
            </div>
          </div>

          {canChangePassword && (
            <button
              onClick={() => setShowPwdModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#DFFF00] text-black font-bold text-xs rounded-lg tracking-widest hover:bg-[#c8e600] transition-all shadow-[0_0_20px_rgba(223,255,0,0.2)] self-start"
            >
              <Key size={14} />
              MODIFY CREDENTIALS
            </button>
          )}
        </div>
      </div>

      {/* ── Middle Two Columns ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Security Credentials Card */}
        <div className="rounded-2xl border border-[#DFFF00]/10 bg-white/3 backdrop-blur-md shadow-[0_0_30px_rgba(223,255,0,0.04)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/10 border border-[#DFFF00]/20 flex items-center justify-center">
                <Key size={15} className="text-[#DFFF00]" />
              </div>
              <h2 className="text-xs font-bold text-white uppercase tracking-widest">Security Credentials</h2>
            </div>
            <span className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">ENCRYPTION: AES-256-GCM</span>
          </div>

          {/* Password Management Block */}
          <div className="rounded-xl border border-[#1F1F1F] bg-[#0D0D0D] p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center">
                  <ShieldCheck size={16} className="text-[#DFFF00]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white uppercase tracking-wider">Password Management</p>
                  <p className="text-[10px] text-gray-600 font-mono mt-0.5">Policy: 90-day rotation</p>
                </div>
              </div>
              {canChangePassword ? (
                <button
                  onClick={() => setShowPwdModal(true)}
                  className="px-3 py-1.5 bg-[#DFFF00] text-black text-[10px] font-bold rounded-lg tracking-widest hover:bg-[#c8e600] transition-all shadow-[0_0_10px_rgba(223,255,0,0.2)]"
                >
                  CHANGE PASSWORD
                </button>
              ) : (
                <span className="px-3 py-1.5 border border-gray-700 text-gray-600 text-[10px] font-bold rounded-lg tracking-widest">
                  RESTRICTED
                </span>
              )}
            </div>
          </div>

          {/* Account Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-[#1A1A1A]">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Email</span>
              <span className="text-xs text-white font-mono">{email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#1A1A1A]">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Role</span>
              <span className="text-[10px] text-[#DFFF00] font-bold uppercase tracking-widest">{role}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Account Created</span>
              <span className="text-[10px] text-gray-400 font-mono">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Managed Nodes Card */}
        <div className="rounded-2xl border border-[#DFFF00]/10 bg-white/3 backdrop-blur-md shadow-[0_0_30px_rgba(223,255,0,0.04)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#DFFF00]/10 border border-[#DFFF00]/20 flex items-center justify-center">
                <Server size={15} className="text-[#DFFF00]" />
              </div>
              <h2 className="text-xs font-bold text-white uppercase tracking-widest">Managed Nodes</h2>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {nodesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-[#DFFF00]/50" />
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Server size={24} className="text-gray-700 mb-2" />
                <p className="text-gray-600 text-xs font-mono">No nodes assigned</p>
              </div>
            ) : (
              nodes.map(n => (
                <div
                  key={n.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#1F1F1F] bg-[#0D0D0D] hover:border-[#DFFF00]/20 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(n.status)} ${n.status === 'online' ? 'animate-pulse' : ''}`} />
                    <div>
                      <p className="text-xs font-bold text-white font-mono">{n.displayName}</p>
                      <p className="text-[10px] text-gray-600 font-mono">{n.ipAddress}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${statusColor(n.status)}`}>
                    {n.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => onNavigate('nodes')}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#DFFF00]/20 text-[#DFFF00] text-[10px] font-bold tracking-widest hover:bg-[#DFFF00]/5 transition-all"
          >
            VIEW ALL NODES <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* ── Account Activity Log ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#DFFF00]/10 bg-white/3 backdrop-blur-md shadow-[0_0_30px_rgba(223,255,0,0.04)] p-6">
        {/* Log Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-[#DFFF00]" />
              <h2 className="text-xs font-bold text-white uppercase tracking-widest">Account Activity Log</h2>
            </div>
            <p className="text-[9px] text-gray-600 uppercase tracking-widest font-mono">MONITORING REAL-TIME SECURITY EVENTS</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-bold text-green-400 tracking-wider">LIVE FEED ACTIVE</span>
            </span>
            <span className="text-[10px] font-mono text-gray-600">{liveTime.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="border-b border-[#1F1F1F]">
                {['Event Type', 'System / Node', 'Precise Timestamp', 'Auth Status', 'Verification'].map(col => (
                  <th key={col} className="pb-3 pr-4 text-[9px] font-bold text-gray-600 uppercase tracking-[0.18em]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id}
                  className={`border-b border-[#111] hover:bg-white/2 transition-colors ${i === 0 ? 'bg-[#DFFF00]/2' : ''}`}
                >
                  <td className="py-3 pr-4">
                    <p className="text-xs font-bold text-white">{log.event_type}</p>
                    {i === 0 && <p className="text-[9px] text-[#DFFF00] font-mono mt-0.5">● LATEST</p>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[10px] font-mono text-gray-400">{log.system}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-[10px] font-mono text-gray-400">
                      {new Date(log.timestamp).toISOString().replace('T', ' ').slice(0, 23)}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {log.auth_status === 'SUCCESS' ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-400">
                        <CheckCircle size={12} /> SUCCESS
                      </span>
                    ) : log.auth_status === 'PENDING' ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-400">
                        <Clock size={12} /> PENDING
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400">
                        <AlertCircle size={12} /> FAILED
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className="text-[10px] font-mono text-gray-600">{log.verification}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Modal */}
      {showPwdModal && <PasswordModal onClose={() => setShowPwdModal(false)} />}
    </div>
  );
}
