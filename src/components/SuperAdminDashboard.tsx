import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, Server, FileText, TrendingUp,
  CheckCircle, Clock, Mail, Building2, RefreshCw, Eye,
  Crown, Activity, Globe, Layers,
} from 'lucide-react';

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  server_count: number;
  message: string | null;
  status: 'pending' | 'contacted';
  created_at: string;
}

interface PlatformStats {
  totalNodes: number;
  totalUsers: number;
  totalRequests: number;
  onlineNodes: number;
  activeAdmins: number;
}

interface PlatformNode {
  id: string;
  displayName: string;
  ipAddress: string;
  region: string;
  status: 'connecting' | 'online' | 'offline' | 'warning';
  createdByEmail: string;
  createdAt: string;
}

type Tab = 'overview' | 'leads' | 'nodes';

const STATUS_COLOR: Record<string, string> = {
  online:     '#22c55e',
  offline:    '#ef4444',
  warning:    '#f59e0b',
  connecting: '#a78bfa',
};

const STATUS_BG: Record<string, string> = {
  online:     'rgba(34,197,94,0.12)',
  offline:    'rgba(239,68,68,0.12)',
  warning:    'rgba(245,158,11,0.12)',
  connecting: 'rgba(167,139,250,0.12)',
};

export default function SuperAdminDashboard() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [nodes, setNodes] = useState<PlatformNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Fetch stats ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/super-admin/stats', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, [token]);

  // ── Fetch leads ────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/access-requests', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setRequests(await r.json());
    } catch {}
    setLoading(false);
  }, [token]);

  // ── Fetch all nodes ────────────────────────────────────────────────────────
  const fetchNodes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/all-nodes', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setNodes(await r.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (tab === 'leads') fetchRequests();
    if (tab === 'nodes') fetchNodes();
  }, [tab, fetchRequests, fetchNodes]);

  // ── Update lead status ─────────────────────────────────────────────────────
  const updateStatus = async (id: string, status: 'pending' | 'contacted') => {
    setUpdatingId(id);
    try {
      const r = await fetch(`/api/super-admin/access-requests/${id}/status`, {
        method: 'PATCH', headers, body: JSON.stringify({ status }),
      });
      if (r.ok) {
        setRequests(prev => prev.map(req => req.id === id ? { ...req, status } : req));
        await fetchStats();
      }
    } catch {}
    setUpdatingId(null);
  };

  const pendingCount   = requests.filter(r => r.status === 'pending').length;
  const contactedCount = requests.filter(r => r.status === 'contacted').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#070707' }}>
      <style>{`
        .sa-tab { background: none; border: none; cursor: pointer; font-family: inherit;
          padding: 10px 20px; font-size: 13px; font-weight: 600; letter-spacing: 0.05em;
          border-radius: 10px; transition: all 0.2s; color: #555; }
        .sa-tab.active { background: rgba(223,255,0,0.1); color: #DFFF00; border: 1px solid rgba(223,255,0,0.25); }
        .sa-tab:hover:not(.active) { color: #aaa; background: rgba(255,255,255,0.04); }
        .lead-card { background: #0c0c0c; border: 1px solid #1a1a1a; border-radius: 14px;
          padding: 20px 24px; transition: border-color 0.2s; }
        .lead-card:hover { border-color: rgba(223,255,0,0.2); }
        .lead-card.expanded { border-color: rgba(223,255,0,0.35); box-shadow: 0 0 24px rgba(223,255,0,0.06); }
        .stat-tile { background: #0c0c0c; border: 1px solid #1a1a1a; border-radius: 16px; padding: 24px 28px; transition: border-color 0.25s, box-shadow 0.25s; }
        .stat-tile:hover { border-color: rgba(223,255,0,0.25); box-shadow: 0 0 20px rgba(223,255,0,0.06); }
        .node-row { display: grid; grid-template-columns: 1fr 1fr 100px 120px 160px; gap: 16px; align-items: center; padding: 14px 20px; border-bottom: 1px solid #111; }
        .node-row:last-child { border-bottom: none; }
        .node-row:hover { background: rgba(255,255,255,0.02); }
        @media(max-width: 768px) {
          .node-row { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 32px 0', background: '#070707', borderBottom: '1px solid #111' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(223,255,0,0.1)', border: '1px solid rgba(223,255,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={18} color="#DFFF00" />
          </div>
          <div>
            <p style={{ fontSize: 10, color: '#666', letterSpacing: '0.2em', fontWeight: 700, marginBottom: 2 }}>SUPER ADMIN CONTROL</p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Command Center</h1>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'leads',    label: `Leads / Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: FileText },
            { id: 'nodes',    label: 'All Platform Nodes', icon: Server },
          ] as { id: Tab; label: string; icon: any }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`sa-tab${tab === t.id ? ' active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '28px 32px', flex: 1 }}>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div>
            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Nodes', value: stats?.totalNodes ?? '—', icon: Server, color: '#DFFF00', bg: 'rgba(223,255,0,0.08)' },
                { label: 'Online Nodes', value: stats?.onlineNodes ?? '—', icon: Activity, color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
                { label: 'Total Users', value: stats?.totalUsers ?? '—', icon: Users, color: '#00c8ff', bg: 'rgba(0,200,255,0.08)' },
                { label: 'Access Requests', value: stats?.totalRequests ?? '—', icon: FileText, color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
              ].map(s => (
                <div key={s.label} className="stat-tile">
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <s.icon size={18} color={s.color} />
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, letterSpacing: '-0.02em', marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#555', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* ── Global Health row ── */}
            <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: '20px 24px', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Globe size={16} color="#DFFF00" />
                <span style={{ fontSize: 12, color: '#666', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Global Health</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                <span style={{ fontSize: 13, color: '#aaa' }}>Active Admins:</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#00c8ff' }}>{stats?.activeAdmins ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DFFF00', boxShadow: '0 0 8px #DFFF00' }} />
                <span style={{ fontSize: 13, color: '#aaa' }}>System Load:</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#DFFF00' }}>
                  {stats ? `${stats.onlineNodes}/${stats.totalNodes} online` : '—'}
                </span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ height: 6, width: 120, background: '#1a1a1a', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stats && stats.totalNodes > 0 ? Math.round((stats.onlineNodes / stats.totalNodes) * 100) : 0}%`, background: '#22c55e', borderRadius: 999, transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: 11, color: '#555' }}>
                  {stats && stats.totalNodes > 0 ? Math.round((stats.onlineNodes / stats.totalNodes) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* Quick access tiles */}
            <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.14em', fontWeight: 700, marginBottom: 14 }}>QUICK ACTIONS</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                { label: 'Review Leads', desc: 'View and process all access requests from the landing page.', tab: 'leads' as Tab, icon: FileText, color: '#a78bfa' },
                { label: 'All Nodes',    desc: 'See every node monitored across all admin tenants.', tab: 'nodes' as Tab, icon: Globe, color: '#DFFF00' },
                { label: 'System Mgmt', desc: 'Create new admin accounts and manage the platform.', tab: 'overview' as Tab, icon: Layers, color: '#00c8ff', href: '#system-management' },
              ].map(q => (
                <div key={q.label}
                  onClick={() => q.href ? (window.location.hash = q.href.replace('#', '')) : setTab(q.tab)}
                  style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 14, padding: '20px 22px', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = q.color + '55'; (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${q.color}11`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1a1a1a'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                >
                  <q.icon size={20} color={q.color} style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{q.label}</div>
                  <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>{q.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADS TAB */}
        {tab === 'leads' && (
          <div>
            {/* Summary row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={14} color="#f59e0b" />
                <span style={{ fontSize: 13, color: '#aaa' }}>Pending: </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>{pendingCount}</span>
              </div>
              <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={14} color="#22c55e" />
                <span style={{ fontSize: 13, color: '#aaa' }}>Contacted: </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{contactedCount}</span>
              </div>
              <button
                onClick={fetchRequests}
                style={{ marginLeft: 'auto', background: 'rgba(223,255,0,0.08)', border: '1px solid rgba(223,255,0,0.2)', borderRadius: 10, padding: '10px 16px', color: '#DFFF00', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(223,255,0,0.15)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(223,255,0,0.08)')}
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
                <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite', display: 'block' }} />
                Loading requests…
              </div>
            ) : requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
                <FileText size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                No access requests yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {requests.map(req => (
                  <div key={req.id} className={`lead-card${expandedId === req.id ? ' expanded' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      {/* Avatar */}
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: req.status === 'contacted' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${req.status === 'contacted' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: req.status === 'contacted' ? '#22c55e' : '#f59e0b', flexShrink: 0 }}>
                        {req.full_name[0]?.toUpperCase()}
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{req.full_name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: req.status === 'contacted' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', color: req.status === 'contacted' ? '#22c55e' : '#f59e0b', border: `1px solid ${req.status === 'contacted' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`, letterSpacing: '0.1em' }}>
                            {req.status.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                          <span style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Mail size={11} color="#DFFF00" />{req.email}
                          </span>
                          <span style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Building2 size={11} color="#00c8ff" />{req.company_name}
                          </span>
                          <span style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Server size={11} color="#a78bfa" />{req.server_count} servers
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #222', borderRadius: 8, padding: '7px 12px', color: '#aaa', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <Eye size={13} />{expandedId === req.id ? 'Less' : 'More'}
                        </button>
                        {req.status === 'pending' && (
                          <button
                            onClick={() => updateStatus(req.id, 'contacted')}
                            disabled={updatingId === req.id}
                            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '7px 14px', color: '#22c55e', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: updatingId === req.id ? 0.5 : 1 }}
                          >
                            <CheckCircle size={13} />Mark Contacted
                          </button>
                        )}
                        {req.status === 'contacted' && (
                          <button
                            onClick={() => updateStatus(req.id, 'pending')}
                            disabled={updatingId === req.id}
                            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '7px 14px', color: '#f59e0b', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: updatingId === req.id ? 0.5 : 1 }}
                          >
                            <Clock size={13} />Reopen
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded message */}
                    {expandedId === req.id && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1a1a1a' }}>
                        <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 8 }}>MESSAGE</p>
                        <p style={{ fontSize: 13, color: '#888', lineHeight: 1.7 }}>
                          {req.message || <span style={{ color: '#444', fontStyle: 'italic' }}>No message provided.</span>}
                        </p>
                        <p style={{ fontSize: 11, color: '#444', marginTop: 12 }}>
                          Submitted: {new Date(req.created_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ALL NODES TAB */}
        {tab === 'nodes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#666' }}>
                <span style={{ color: '#DFFF00', fontWeight: 700 }}>{nodes.length}</span> nodes across all tenants
              </p>
              <button
                onClick={fetchNodes}
                style={{ background: 'rgba(223,255,0,0.08)', border: '1px solid rgba(223,255,0,0.2)', borderRadius: 10, padding: '8px 14px', color: '#DFFF00', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}
              >
                <RefreshCw size={12} />Refresh
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>Loading nodes…</div>
            ) : (
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 14, overflow: 'hidden' }}>
                {/* Header */}
                <div className="node-row" style={{ background: '#0d0d0d', borderBottom: '1px solid #1a1a1a' }}>
                  {['Node Name', 'IP / Region', 'Status', 'Created By', 'Date'].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</span>
                  ))}
                </div>
                {nodes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>No nodes found.</div>
                ) : (
                  nodes.map(node => (
                    <div key={node.id} className="node-row">
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{node.displayName}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>{node.ipAddress}</div>
                        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{node.region}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: STATUS_BG[node.status] ?? 'rgba(255,255,255,0.05)', color: STATUS_COLOR[node.status] ?? '#aaa', border: `1px solid ${STATUS_COLOR[node.status] ?? '#333'}44`, letterSpacing: '0.08em' }}>
                          {node.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.createdByEmail ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#444' }}>
                        {new Date(node.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
