import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Crown, Plus, Users, Server, Activity, FileText,
  CheckCircle, AlertCircle, Loader2, Eye, EyeOff,
  RefreshCw, Trash2, Shield,
} from 'lucide-react';

interface PlatformStats {
  totalNodes: number;
  totalUsers: number;
  totalRequests: number;
  onlineNodes: number;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export default function SystemManagementPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingAdmins, setLoadingAdmins] = useState(true);

  // Create Admin form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete admin
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setLoadingStats(true);
    try {
      const r = await fetch('/api/super-admin/stats', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setStats(await r.json());
    } catch {}
    setLoadingStats(false);
  }, [token]);

  const fetchAdmins = useCallback(async () => {
    if (!token) return;
    setLoadingAdmins(true);
    try {
      const r = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const all: AdminUser[] = await r.json();
        // Only admins (not super_admin themselves, not employees/interns)
        setAdmins(all.filter(u => u.role === 'admin'));
      }
    } catch {}
    setLoadingAdmins(false);
  }, [token]);

  useEffect(() => {
    fetchStats();
    fetchAdmins();
  }, [fetchStats, fetchAdmins]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg(null);
    try {
      const r = await fetch('/api/super-admin/create-admin', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (r.ok) {
        setCreateMsg({ type: 'success', text: `Admin account created for ${email}` });
        setEmail('');
        setPassword('');
        await fetchAdmins();
        await fetchStats();
      } else {
        setCreateMsg({ type: 'error', text: data.message || 'Failed to create admin' });
      }
    } catch {
      setCreateMsg({ type: 'error', text: 'Network error. Please try again.' });
    }
    setCreating(false);
  };

  const handleDeleteAdmin = async (id: string, adminEmail: string) => {
    if (!confirm(`Are you sure you want to delete admin "${adminEmail}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE', headers });
      setAdmins(prev => prev.filter(a => a.id !== id));
      await fetchStats();
    } catch {}
    setDeletingId(null);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#070707' }}>
      <style>{`
        .sm-card { background: #0c0c0c; border: 1px solid #1a1a1a; border-radius: 16px; overflow: hidden; }
        .sm-input { width: 100%; background: #111; border: 1px solid #222; color: #fff; border-radius: 10px;
          padding: 11px 14px; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box; }
        .sm-input:focus { border-color: rgba(223,255,0,0.4); box-shadow: 0 0 0 3px rgba(223,255,0,0.06); }
        .sm-label { font-size: 11px; color: #555; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; display: block; }
        .btn-create { background: #DFFF00; color: #000; font-weight: 700; font-family: inherit; border: none;
          border-radius: 10px; padding: 11px 0; width: 100%; font-size: 14px; cursor: pointer; letter-spacing: 0.04em;
          transition: background 0.2s, box-shadow 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-create:hover:not(:disabled) { background: #c8e600; box-shadow: 0 0 20px rgba(223,255,0,0.3); }
        .btn-create:disabled { opacity: 0.5; cursor: not-allowed; }
        .admin-row { display: flex; align-items: center; gap: 14px; padding: 14px 20px; border-bottom: 1px solid #111; }
        .admin-row:last-child { border-bottom: none; }
        .admin-row:hover { background: rgba(255,255,255,0.02); }
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.2em', fontWeight: 700, marginBottom: 4 }}>SUPER ADMIN</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em', marginBottom: 8 }}>System Management</h1>
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>Platform-wide controls, audit overview, and admin account management.</p>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        {loadingStats ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 24, color: '#555' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline' }} /> Loading stats…
          </div>
        ) : [
          { label: 'Total Nodes Monitored', value: stats?.totalNodes ?? 0, icon: Server, color: '#DFFF00', bg: 'rgba(223,255,0,0.08)' },
          { label: 'Nodes Online',          value: stats?.onlineNodes  ?? 0, icon: Activity, color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
          { label: 'Total Users',           value: stats?.totalUsers   ?? 0, icon: Users,   color: '#00c8ff', bg: 'rgba(0,200,255,0.08)' },
          { label: 'Access Requests',       value: stats?.totalRequests ?? 0, icon: FileText, color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <s.icon size={18} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#555', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, alignItems: 'start' }}>

        {/* Create Admin form */}
        <div className="sm-card">
          <div style={{ padding: '22px 24px', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(223,255,0,0.1)', border: '1px solid rgba(223,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Crown size={14} color="#DFFF00" />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Create Admin Account</h2>
          </div>
          <form onSubmit={handleCreateAdmin} style={{ padding: '24px' }}>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
              Create a new Admin user who can then manage their own team and nodes independently.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label className="sm-label">Admin Email</label>
              <input
                id="sa-admin-email"
                className="sm-input"
                type="email"
                required
                placeholder="admin@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="sm-label">Temporary Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="sa-admin-password"
                  className="sm-input"
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0 }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {createMsg && (
              <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: createMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${createMsg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                {createMsg.type === 'success'
                  ? <CheckCircle size={14} color="#22c55e" />
                  : <AlertCircle size={14} color="#ef4444" />}
                <span style={{ fontSize: 12, color: createMsg.type === 'success' ? '#22c55e' : '#ef4444' }}>{createMsg.text}</span>
              </div>
            )}

            <button type="submit" className="btn-create" disabled={creating}>
              {creating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              {creating ? 'Creating…' : 'Create Admin'}
            </button>
          </form>
        </div>

        {/* Admin list */}
        <div className="sm-card">
          <div style={{ padding: '22px 24px', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={14} color="#00c8ff" />
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Admin Accounts</h2>
              <span style={{ fontSize: 11, color: '#555', background: '#1a1a1a', borderRadius: 20, padding: '2px 10px' }}>{admins.length}</span>
            </div>
            <button
              onClick={() => { fetchAdmins(); fetchStats(); }}
              style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '6px 12px', color: '#555', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} />Refresh
            </button>
          </div>

          {loadingAdmins ? (
            <div style={{ textAlign: 'center', padding: 36, color: '#555' }}>Loading admins…</div>
          ) : admins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>
              <Users size={28} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
              No admin accounts yet. Create one using the form.
            </div>
          ) : (
            admins.map(admin => (
              <div key={admin.id} className="admin-row">
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#00c8ff', flexShrink: 0 }}>
                  {admin.email[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin.email}</div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                    Admin · Joined {new Date(admin.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(0,200,255,0.1)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.25)', letterSpacing: '0.1em' }}>
                  ADMIN
                </span>
                <button
                  onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                  disabled={deletingId === admin.id}
                  style={{ background: 'none', border: '1px solid #222', borderRadius: 8, padding: '6px 10px', color: '#555', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#555'; }}
                >
                  {deletingId === admin.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
