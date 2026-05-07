import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Shield, Edit2, Key, Check, X, Loader2, RefreshCw,
  Users, Server, AlertCircle, ChevronDown, ChevronUp,
  PauseCircle, PlayCircle, Trash2,
} from 'lucide-react';

interface AdminRecord {
  id: string;
  email: string;
  role: string;
  created_at: string;
  node_limit: number;
  user_limit: number;
  user_count: number;
  node_count: number;
  is_suspended: boolean;
  must_change_password: boolean;
}

export default function AdminManagementPanel() {
  const { session } = useAuth();
  const tok = session?.access_token ?? '';
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Per-row edit state
  const [quotaEdit, setQuotaEdit] = useState<Record<string, { nodeLimit: string; userLimit: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  // Password reset state
  const [pwEdit, setPwEdit] = useState<Record<string, string>>({});
  const [pwSaving, setPwSaving] = useState<string | null>(null);

  // Suspend state
  const [suspendLoading, setSuspendLoading] = useState<string | null>(null);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<AdminRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tok) return;
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/admins', { headers: H });
      if (r.ok) {
        const data: AdminRecord[] = await r.json();
        setAdmins(data);
        const qe: Record<string, { nodeLimit: string; userLimit: string }> = {};
        data.forEach(a => { qe[a.id] = { nodeLimit: String(a.node_limit), userLimit: String(a.user_limit) }; });
        setQuotaEdit(qe);
      }
    } catch { }
    setLoading(false);
  }, [tok]);

  useEffect(() => { load(); }, [load]);

  const saveQuota = async (id: string) => {
    setSaving(id);
    try {
      const { nodeLimit, userLimit } = quotaEdit[id] ?? {};
      const r = await fetch(`/api/super-admin/admins/${id}/quota`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ nodeLimit: Number(nodeLimit), userLimit: Number(userLimit) }),
      });
      const d = await r.json();
      if (r.ok) {
        setMsg(p => ({ ...p, [id]: { ok: true, text: 'Quota saved.' } }));
        setAdmins(prev => prev.map(a => a.id === id ? { ...a, node_limit: Number(nodeLimit), user_limit: Number(userLimit) } : a));
      } else {
        setMsg(p => ({ ...p, [id]: { ok: false, text: d.message || 'Error' } }));
      }
    } catch (e: any) {
      setMsg(p => ({ ...p, [id]: { ok: false, text: e.message } }));
    }
    setSaving(null);
    setTimeout(() => setMsg(p => { const n = { ...p }; delete n[id]; return n; }), 3000);
  };

  const savePw = async (id: string) => {
    const np = pwEdit[id] ?? '';
    if (np.length < 8) { setMsg(p => ({ ...p, [id]: { ok: false, text: 'Min 8 characters' } })); return; }
    setPwSaving(id);
    try {
      const r = await fetch(`/api/super-admin/admins/${id}/password`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ newPassword: np }),
      });
      const d = await r.json();
      setMsg(p => ({ ...p, [id]: { ok: r.ok, text: r.ok ? 'Password reset.' : d.message } }));
      if (r.ok) setPwEdit(p => { const n = { ...p }; delete n[id]; return n; });
    } catch (e: any) {
      setMsg(p => ({ ...p, [id]: { ok: false, text: e.message } }));
    }
    setPwSaving(null);
    setTimeout(() => setMsg(p => { const n = { ...p }; delete n[id]; return n; }), 3000);
  };

  const toggleSuspend = async (admin: AdminRecord) => {
    setSuspendLoading(admin.id);
    try {
      const newState = !admin.is_suspended;
      const r = await fetch(`/api/super-admin/admins/${admin.id}/suspend`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ suspended: newState }),
      });
      const d = await r.json();
      if (r.ok) {
        setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, is_suspended: newState } : a));
        setMsg(p => ({ ...p, [admin.id]: { ok: true, text: newState ? 'Admin suspended.' : 'Admin reinstated.' } }));
      } else {
        setMsg(p => ({ ...p, [admin.id]: { ok: false, text: d.message || 'Error' } }));
      }
    } catch (e: any) {
      setMsg(p => ({ ...p, [admin.id]: { ok: false, text: e.message } }));
    }
    setSuspendLoading(null);
    setTimeout(() => setMsg(p => { const n = { ...p }; delete n[admin.id]; return n; }), 3000);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const r = await fetch(`/api/super-admin/admins/${deleteTarget.id}`, {
        method: 'DELETE', headers: H,
      });
      const d = await r.json();
      if (r.ok) {
        setAdmins(prev => prev.filter(a => a.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setMsg(p => ({ ...p, [deleteTarget.id]: { ok: false, text: d.message || 'Delete failed' } }));
        setDeleteTarget(null);
      }
    } catch (e: any) {
      setMsg(p => ({ ...p, [deleteTarget!.id]: { ok: false, text: e.message } }));
      setDeleteTarget(null);
    }
    setDeleteLoading(false);
  };

  if (loading) return (
    <div className="flex items-center gap-3 p-8 text-gray-500">
      <Loader2 size={16} className="animate-spin" /> Loading admins…
    </div>
  );

  if (admins.length === 0) return (
    <div className="text-center py-16 text-gray-600">
      <Users size={32} className="mx-auto mb-3 opacity-30" />
      No admin accounts yet.
    </div>
  );

  return (
    <>
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !deleteLoading && setDeleteTarget(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 20, padding: '32px', maxWidth: 420, width: '100%', boxShadow: '0 0 60px rgba(239,68,68,0.12)' }}
          >
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Trash2 size={22} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Delete Admin?</h3>
            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.65, marginBottom: 24 }}>
              This will permanently delete <strong style={{ color: '#fff' }}>{deleteTarget.email}</strong> and all their data. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', color: '#aaa', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: deleteLoading ? 'not-allowed' : 'pointer', opacity: deleteLoading ? 0.7 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {deleteLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete Admin
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">
            {admins.length} Admin{admins.length !== 1 ? 's' : ''}
          </p>
          <button onClick={load} className="flex items-center gap-2 text-xs text-gray-500 hover:text-white border border-[#222] rounded-lg px-3 py-1.5 transition-colors">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {admins.map(admin => {
          const isOpen = expandedId === admin.id;
          const q = quotaEdit[admin.id] ?? { nodeLimit: String(admin.node_limit), userLimit: String(admin.user_limit) };
          const feedback = msg[admin.id];

          return (
            <div key={admin.id} className={`border rounded-2xl overflow-hidden transition-all ${admin.is_suspended ? 'border-orange-500/30 bg-[#120a04]' : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#2a2a2a]'}`}>
              {/* Row header */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                onClick={() => setExpandedId(isOpen ? null : admin.id)}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${admin.is_suspended ? 'bg-orange-500/10 border border-orange-500/20 text-orange-400' : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400'}`}>
                  {admin.email[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{admin.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-600">Joined {new Date(admin.created_at).toLocaleDateString()}</p>
                    {admin.is_suspended && (
                      <span className="text-[10px] bg-orange-500/10 border border-orange-500/25 text-orange-400 rounded-full px-2 py-0.5 font-bold uppercase tracking-wide">Suspended</span>
                    )}
                    {admin.must_change_password && (
                      <span className="text-[10px] bg-yellow-500/10 border border-yellow-500/25 text-yellow-400 rounded-full px-2 py-0.5 font-bold uppercase tracking-wide">Pending Reset</span>
                    )}
                  </div>
                </div>

                {/* Stats chips */}
                <div className="hidden sm:flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-[#111] border border-[#1f1f1f] rounded-lg px-2.5 py-1">
                    <Users size={11} className="text-cyan-400" /> {admin.user_count} / {admin.user_limit}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-[#111] border border-[#1f1f1f] rounded-lg px-2.5 py-1">
                    <Server size={11} className="text-neon-lime" /> {admin.node_count} / {admin.node_limit}
                  </span>
                </div>

                <span className="text-gray-600">
                  {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </span>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div className="border-t border-[#1a1a1a] px-5 py-5 space-y-5">
                  {/* Quota + Password row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Quota editing */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-2">
                        <Edit2 size={11} /> Edit Quotas
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Node Limit</label>
                          <input
                            type="number" min={1} max={1000}
                            value={q.nodeLimit}
                            onChange={e => setQuotaEdit(p => ({ ...p, [admin.id]: { ...q, nodeLimit: e.target.value } }))}
                            className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-neon-lime/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">User Limit</label>
                          <input
                            type="number" min={1} max={1000}
                            value={q.userLimit}
                            onChange={e => setQuotaEdit(p => ({ ...p, [admin.id]: { ...q, userLimit: e.target.value } }))}
                            className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-neon-lime/40"
                          />
                        </div>
                        <button
                          onClick={() => saveQuota(admin.id)}
                          disabled={saving === admin.id}
                          className="w-full bg-neon-lime text-black font-bold rounded-lg py-2 text-sm flex items-center justify-center gap-2 hover:bg-[#c8e600] disabled:opacity-50 transition-colors"
                        >
                          {saving === admin.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          Save Quotas
                        </button>
                      </div>
                    </div>

                    {/* Password reset */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-2">
                        <Key size={11} /> Reset Password
                      </p>
                      <div className="space-y-3">
                        <input
                          type="password"
                          placeholder="New password (min 8 chars)"
                          value={pwEdit[admin.id] ?? ''}
                          onChange={e => setPwEdit(p => ({ ...p, [admin.id]: e.target.value }))}
                          className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-red-400/40"
                        />
                        <button
                          onClick={() => savePw(admin.id)}
                          disabled={pwSaving === admin.id}
                          className="w-full bg-red-500/10 border border-red-500/30 text-red-400 font-bold rounded-lg py-2 text-sm flex items-center justify-center gap-2 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                        >
                          {pwSaving === admin.id ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
                          Reset Password
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Suspend + Delete row */}
                  <div className="border-t border-[#1a1a1a] pt-5 flex flex-wrap gap-3">
                    {/* Suspend toggle */}
                    <button
                      onClick={() => toggleSuspend(admin)}
                      disabled={suspendLoading === admin.id}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all disabled:opacity-50 ${
                        admin.is_suspended
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20'
                      }`}
                    >
                      {suspendLoading === admin.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : admin.is_suspended ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                      {admin.is_suspended ? 'Reinstate Admin' : 'Suspend Admin'}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteTarget(admin)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all ml-auto"
                    >
                      <Trash2 size={13} />
                      Delete Admin
                    </button>
                  </div>

                  {/* Feedback */}
                  {feedback && (
                    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${feedback.ok ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                      {feedback.ok ? <Check size={12} /> : <AlertCircle size={12} />}
                      {feedback.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
