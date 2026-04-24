import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Server, Shield, Search,
  ChevronDown, CheckCircle2, X, Loader2, AlertTriangle, UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Profile, UserRole } from '../lib/supabase';

interface NodeRecord { id: string; display_name: string; ip_address: string; status: string; }

// ── Helpers ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    admin:    'bg-purple-500/20 text-purple-400 border-purple-500/40',
    employee: 'bg-neon-lime/15 text-neon-lime border-neon-lime/40',
    intern:   'bg-blue-500/20 text-blue-400 border-blue-500/40',
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded border ${styles[role]}`}>
      {role}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const online = status === 'online';
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${online ? 'bg-neon-lime shadow-[0_0_6px_#D4FF00]' : 'bg-red-500'}`} />
  );
}

// ── Assign Node Modal ─────────────────────────────────────────────────────

function AssignModal({
  user,
  allNodes,
  token,
  isAdmin,
  onClose,
}: {
  user: Profile;
  allNodes: NodeRecord[];
  token: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [result,   setResult]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Load current assignments so checkboxes are pre-checked
  useEffect(() => {
    fetch(`/api/users/${user.id}/assignments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: { node_id: string }[]) => {
        setSelected(new Set(Array.isArray(data) ? data.map(r => r.node_id) : []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id, token]);

  const toggle = (nodeId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/assign-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user.id, nodeIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ type: 'success', msg: `Saved — ${data.assigned ?? selected.size} node(s) assigned.` });
      } else {
        setResult({ type: 'error', msg: data.message || `HTTP ${res.status}` });
      }
    } catch (err: any) {
      setResult({ type: 'error', msg: err.message || 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-[#0D0D0D] border border-neon-lime/20 rounded-2xl shadow-[0_0_60px_rgba(212,255,0,0.08)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-neon-lime/10 border border-neon-lime/30 flex items-center justify-center text-sm font-bold text-neon-lime">
              {user.email[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{user.email}</p>
              <p className="text-[10px] text-gray-500">Select nodes to grant access — then click Save</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Node checklist */}
        <div className="p-6 max-h-80 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Fetching assignments…
            </div>
          ) : allNodes.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-8">No nodes available.</p>
          ) : allNodes.map(node => {
            const checked = selected.has(node.id);
            return (
              <label
                key={node.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                  checked
                    ? 'bg-neon-lime/10 border-neon-lime/40'
                    : 'bg-[#111] border-[#222] hover:border-neon-lime/20 hover:bg-neon-lime/5'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked ? 'bg-neon-lime border-neon-lime' : 'border-[#444]'
                }`}>
                  {checked && (
                    <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2">
                      <path d="M1 4l2.5 2.5L9 1" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox" className="sr-only"
                  checked={checked} onChange={() => toggle(node.id)}
                />
                <StatusDot status={node.status} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${checked ? 'text-neon-lime' : 'text-gray-200'}`}>
                    {node.display_name}
                  </p>
                  <p className="text-[10px] text-gray-500 font-mono">{node.ip_address}</p>
                </div>
                {checked && <UserCheck size={14} className="text-neon-lime flex-shrink-0" />}
              </label>
            );
          })}
        </div>

        {/* Result toast */}
        {result && (
          <div className={`mx-6 mb-2 flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold border ${
            result.type === 'success'
              ? 'bg-neon-lime/10 border-neon-lime/30 text-neon-lime'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {result.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {result.msg}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1A1A1A] flex items-center justify-between">
          <p className="text-xs text-gray-600">{selected.size} of {allNodes.length} selected</p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="border border-[#2a2a2a] text-gray-400 hover:text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            >
              Close
            </button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="flex items-center gap-2 bg-neon-lime text-black font-bold px-5 py-2 rounded-lg text-sm hover:bg-[#BDE600] transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Create User Modal ─────────────────────────────────────────────────────

function CreateUserModal({
  creatableRole,
  token,
  createdById,
  onClose,
  onCreated,
}: {
  creatableRole: UserRole;
  token: string;
  createdById: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, password, role: creatableRole, created_by: createdById }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create user');
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-[#0D0D0D] border border-neon-lime/20 rounded-2xl shadow-[0_0_60px_rgba(212,255,0,0.08)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-neon-lime" />
            <h2 className="text-sm font-bold text-white">Create {creatableRole.charAt(0).toUpperCase() + creatableRole.slice(1)} Account</h2>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Email</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="operator@domain.com"
              className="w-full bg-[#0A0A0A] border border-[#2a2a2a] focus:border-neon-lime/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all placeholder-gray-600"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Temporary Password</label>
            <input
              type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full bg-[#0A0A0A] border border-[#2a2a2a] focus:border-neon-lime/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all placeholder-gray-600"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
              <AlertTriangle size={12} /> {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-[#2a2a2a] text-gray-400 hover:text-white py-2.5 rounded-lg text-sm font-bold transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={creating} className="flex-1 bg-neon-lime text-black font-bold py-2.5 rounded-lg text-sm hover:bg-[#BDE600] transition-colors disabled:opacity-50">
              {creating ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const { profile: me, session } = useAuth();
  const isAdmin = me?.role === 'admin';
  const token = session?.access_token ?? '';
  const creatableRole: UserRole = isAdmin ? 'employee' : 'intern';

  const [users,     setUsers]     = useState<Profile[]>([]);
  const [allNodes,  setAllNodes]  = useState<NodeRecord[]>([]);
  const [search,    setSearch]    = useState('');
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<Profile | null>(null);
  const [createOpen,   setCreateOpen]   = useState(false);

  const load = useCallback(async () => {
    if (!me || !token) return;
    setLoadError(null);
    try {
      // Users
      const endpoint = isAdmin ? '/api/admin/users' : '/api/users';
      const usersRes = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers((Array.isArray(data) ? data : []).filter((u: any) => u.id !== me.id));
      } else {
        const err = await usersRes.json().catch(() => ({}));
        setLoadError(err?.message || `HTTP ${usersRes.status}`);
      }
      // Nodes
      const nodesRes = await fetch('/api/nodes', { headers: { Authorization: `Bearer ${token}` } });
      if (nodesRes.ok) {
        const data = await nodesRes.json();
        setAllNodes((Array.isArray(data) ? data : []).map((n: any) => ({
          id: n.id,
          display_name: n.displayName ?? n.display_name,
          ip_address:   n.ipAddress   ?? n.ip_address,
          status:       n.status,
        })));
      }
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [me, token, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    await fetch(`/api/users/${userId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setUsers(prev => prev.filter(u => u.id !== userId));
  };

  const filtered = users.filter(u =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const totalCount    = users.length;
  const employeeCount = users.filter(u => u.role === 'employee').length;
  const internCount   = users.filter(u => u.role === 'intern').length;
  const adminCount    = users.filter(u => u.role === 'admin').length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505]">
      <div className="p-8 space-y-6 max-w-6xl">

        {/* ── Page Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isAdmin ? <Shield size={22} className="text-neon-lime" /> : <Users size={22} className="text-neon-lime" />}
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {isAdmin ? 'User Management' : 'Team Management'}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAdmin ? 'Manage all system operators and their node access' : 'Manage your intern accounts and server access'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-neon-lime text-black font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-[#BDE600] transition-colors shadow-[0_0_20px_rgba(212,255,0,0.2)]"
          >
            <Plus size={16} />
            Add {creatableRole.charAt(0).toUpperCase() + creatableRole.slice(1)}
          </button>
        </div>

        {/* ── Stats Row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Users',  value: totalCount,    color: 'text-white' },
            { label: 'Employees',    value: isAdmin ? employeeCount : internCount, color: 'text-neon-lime' },
            { label: isAdmin ? 'Interns' : 'Admins', value: isAdmin ? internCount : adminCount, color: 'text-blue-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-5 hover:border-neon-lime/20 transition-colors">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600 mb-2">{label}</p>
              <p className={`text-4xl font-bold ${color}`}>{String(value).padStart(2, '0')}</p>
            </div>
          ))}
        </div>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {loadError && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            <AlertTriangle size={16} /> {loadError}
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl overflow-hidden">
          {/* Table toolbar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              {isAdmin ? 'All Operators' : 'Team Members'} ({filtered.length})
            </p>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search users…"
                className="bg-[#111] border border-[#222] focus:border-neon-lime/30 rounded-lg pl-9 pr-4 py-2 text-sm text-white outline-none transition-colors placeholder-gray-700 w-56"
              />
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_120px_80px_120px] gap-4 px-6 py-3 border-b border-[#111] bg-[#080808]">
            {['Identity', 'Email', 'Role', 'Nodes', 'Actions'].map(col => (
              <p key={col} className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">{col}</p>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-600">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading operators…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-700">
              <Users size={28} />
              <p className="text-sm">{search ? 'No results found' : `No ${creatableRole}s yet`}</p>
              {!search && (
                <button onClick={() => setCreateOpen(true)} className="mt-2 text-neon-lime text-xs font-bold hover:underline">
                  + Create first {creatableRole}
                </button>
              )}
            </div>
          ) : filtered.map((user, i) => (
            <div
              key={user.id}
              className={`grid grid-cols-[1fr_1fr_120px_80px_120px] gap-4 px-6 py-4 items-center border-b border-[#111] last:border-0 transition-colors hover:bg-neon-lime/[0.02] ${
                i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]'
              }`}
            >
              {/* Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-neon-lime/10 border border-neon-lime/20 flex items-center justify-center text-xs font-bold text-neon-lime flex-shrink-0">
                  {user.email[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user.email.split('@')[0]}</p>
                  <p className="text-[10px] text-gray-600 truncate">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</p>
                </div>
              </div>

              {/* Email */}
              <p className="text-xs text-gray-400 font-mono truncate">{user.email}</p>

              {/* Role */}
              <div><RoleBadge role={user.role} /></div>

              {/* Nodes */}
              <p className="text-xs text-gray-500 font-mono">
                {allNodes.length > 0 ? `— / ${allNodes.length}` : '—'}
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAssignTarget(user)}
                  title="Manage server access"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-lime/10 border border-neon-lime/20 text-neon-lime text-[11px] font-bold hover:bg-neon-lime/20 transition-colors"
                >
                  <Server size={11} /> Access
                </button>
                <button
                  onClick={() => handleDelete(user.id)}
                  title="Delete user"
                  className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {assignTarget && (
        <AssignModal
          user={assignTarget}
          allNodes={allNodes}
          token={token}
          isAdmin={isAdmin}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {createOpen && me && (
        <CreateUserModal
          creatableRole={creatableRole}
          token={token}
          createdById={me.id}
          onClose={() => setCreateOpen(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
