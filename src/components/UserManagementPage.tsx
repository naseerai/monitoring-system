import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Server, UserCheck, Shield, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, type Profile, type UserRole } from '../lib/supabase';

interface NodeRecord { id: string; display_name: string; ip_address: string; status: string; }
interface AssignedNode { node_id: string; }

// ── Role badge ────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: UserRole }) {
  const map = {
    admin:    'bg-purple-500/20 text-purple-400 border-purple-500/30',
    employee: 'bg-neon-lime/20 text-neon-lime border-neon-lime/30',
    intern:   'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${map[role]}`}>
      {role}
    </span>
  );
}

// ── Sub-user row ───────────────────────────────────────────────────────────
function UserRow({
  profile,
  myNodes,
  onDelete,
}: {
  profile: Profile;
  myNodes: NodeRecord[];
  onDelete: (id: string) => void;
}) {
  const [assigned, setAssigned] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from('node_assignments')
      .select('node_id')
      .eq('user_id', profile.id)
      .then(({ data }) => setAssigned((data ?? []).map((r: AssignedNode) => r.node_id)));
  }, [profile.id]);

  const toggleNode = async (nodeId: string) => {
    const has = assigned.includes(nodeId);
    if (has) {
      await supabase.from('node_assignments').delete().match({ user_id: profile.id, node_id: nodeId });
      setAssigned(prev => prev.filter(id => id !== nodeId));
    } else {
      await supabase.from('node_assignments').insert({ user_id: profile.id, node_id: nodeId });
      setAssigned(prev => [...prev, nodeId]);
    }
  };

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-xs font-bold text-gray-400">
            {profile.email[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-white">{profile.email}</p>
            <RoleBadge role={profile.role} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-neon-lime transition-colors border border-[#333] rounded-lg px-3 py-1.5"
          >
            <Server size={12} /> {assigned.length} nodes <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
          </button>
          <button
            onClick={() => onDelete(profile.id)}
            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors border border-[#333] hover:border-red-400/30 rounded-lg"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="pt-2 border-t border-[#1e1e1e] grid grid-cols-1 gap-1">
          {myNodes.length === 0 && <p className="text-xs text-gray-600">No nodes available to assign.</p>}
          {myNodes.map(n => {
            const isAssigned = assigned.includes(n.id);
            return (
              <button
                key={n.id}
                onClick={() => toggleNode(n.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                  isAssigned
                    ? 'bg-neon-lime/10 border border-neon-lime/30 text-neon-lime'
                    : 'bg-[#0d0d0d] border border-[#222] text-gray-400 hover:border-[#333]'
                }`}
              >
                <Server size={12} className="flex-shrink-0" />
                <span className="flex-1">{n.display_name}</span>
                <span className="text-[10px] opacity-60">{n.ip_address}</span>
                {isAssigned && <UserCheck size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const { profile: me } = useAuth();
  const isAdmin = me?.role === 'admin';

  // The role this manager is allowed to create
  const creatableRole: UserRole = isAdmin ? 'employee' : 'intern';

  const [subordinates, setSubordinates] = useState<Profile[]>([]);
  const [myNodes,      setMyNodes]      = useState<NodeRecord[]>([]);
  const [newEmail,     setNewEmail]     = useState('');
  const [newPassword,  setNewPassword]  = useState('');
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    // Sub-users created by me
    const { data: subs } = await supabase
      .from('profiles')
      .select('*')
      .eq('created_by', me.id);
    setSubordinates(subs ?? []);

    // Nodes I can access (admin = all, employee = assigned)
    if (isAdmin) {
      const { data: nodes } = await supabase.from('nodes').select('id,display_name,ip_address,status');
      setMyNodes(nodes ?? []);
    } else {
      const { data: asgn } = await supabase
        .from('node_assignments')
        .select('node_id, nodes(id,display_name,ip_address,status)')
        .eq('user_id', me.id);
      setMyNodes((asgn ?? []).map((a: any) => a.nodes).filter(Boolean));
    }
  }, [me, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: creatableRole, created_by: me?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create user');
      setNewEmail('');
      setNewPassword('');
      await load();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string) => {
    await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    setSubordinates(prev => prev.filter(p => p.id !== userId));
  };

  const RoleIcon = isAdmin ? Shield : Users;

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <RoleIcon size={24} className="text-neon-lime" />
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isAdmin ? 'Global Fleet Management' : 'Team Management'}
          </h1>
          <p className="text-xs text-gray-500">
            {isAdmin ? 'Create & manage Employee accounts and their node access' : 'Create & manage Intern accounts with a subset of your nodes'}
          </p>
        </div>
      </div>

      {/* Create form */}
      <div className="bg-[#111] border border-[#222] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Plus size={16} className="text-neon-lime" /> Create {creatableRole.charAt(0).toUpperCase() + creatableRole.slice(1)} Account
        </h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
          <input
            type="email"
            required
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="user@domain.com"
            className="flex-1 min-w-[200px] bg-[#0A0A0A] border border-[#2a2a2a] focus:border-neon-lime/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all placeholder-gray-600"
          />
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Temp password (min 8 chars)"
            className="flex-1 min-w-[220px] bg-[#0A0A0A] border border-[#2a2a2a] focus:border-neon-lime/50 rounded-lg px-4 py-2.5 text-white text-sm outline-none transition-all placeholder-gray-600"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-neon-lime text-black font-bold px-6 py-2.5 rounded-lg text-sm hover:bg-[#BDE600] transition-colors disabled:opacity-50 neon-glow"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
        {createError && <p className="mt-3 text-sm text-red-400">{createError}</p>}
      </div>

      {/* Subordinate list */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
          {creatableRole === 'employee' ? 'Employees' : 'Interns'} ({subordinates.length})
        </h2>
        {subordinates.length === 0 ? (
          <p className="text-sm text-gray-600">No {creatableRole}s yet. Create one above.</p>
        ) : (
          <div className="space-y-3">
            {subordinates.map(p => (
              <UserRow key={p.id} profile={p} myNodes={myNodes} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
