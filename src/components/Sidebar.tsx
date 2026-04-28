import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Database, Shield, LifeBuoy, Power,
  Plus, Loader2, Users, UserCircle, Menu, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AddNodeModal, { NodeFormData } from './AddNodeModal';
import { useAuth } from '../context/AuthContext';

export interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  username: string;
  port: number;
  authType: 'password' | 'privateKey';
  status: 'connecting' | 'online' | 'offline' | 'warning';
  region?: string;
  uptimeOutput?: string;
  error?: string;
  createdAt: string;
}

interface SidebarProps {
  activePage: string;
  onNavigate: (to: string) => void;
  role: 'admin' | 'employee' | 'intern';
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

function NavItem({ icon: Icon, label, active, onClick, collapsed }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full relative flex items-center gap-3 px-4 py-3 cursor-pointer group transition-all text-left ${
        collapsed ? 'justify-center px-0' : 'px-6'
      } ${active ? 'text-[#DFFF00] bg-[#DFFF00]/5 border-r-2 border-[#DFFF00]' : 'text-gray-500 hover:text-white'}`}
    >
      <Icon size={20} className={active ? 'text-[#DFFF00]' : 'group-hover:text-white'} />
      {!collapsed && <span className="font-medium text-sm tracking-wide">{label}</span>}
      {active && !collapsed && (
        <motion.div layoutId="activeNav" className="absolute left-0 w-1 h-8 bg-[#DFFF00] rounded-r" />
      )}
    </button>
  );
}

function NodeStatusDot({ status }: { status: NodeRecord['status'] }) {
  if (status === 'connecting') return <Loader2 size={10} className="animate-spin text-yellow-400" />;
  if (status === 'online')     return <span className="w-2 h-2 rounded-full bg-[#DFFF00] shadow-[0_0_6px_#DFFF00] flex-shrink-0" />;
  if (status === 'warning')    return <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.8)] flex-shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />;
}

export default function Sidebar({ activePage, onNavigate, role }: SidebarProps) {
  const { signOut, session, profile } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [nodes, setNodes] = useState<NodeRecord[] | null>(null);

  // Mobile: drawer open/closed; Desktop: collapsed/expanded
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  // Close mobile drawer on navigate
  const navigate = (to: string) => {
    onNavigate(to);
    setMobileOpen(false);
  };

  const fetchNodes = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/nodes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNodes(Array.isArray(data) ? data : []);
      } else {
        setNodes(prev => prev ?? []);
      }
    } catch {
      setNodes(prev => prev ?? []);
    }
  }, [session]);

  useEffect(() => {
    fetchNodes();
    const iv = setInterval(fetchNodes, 5000);
    return () => clearInterval(iv);
  }, [fetchNodes]);

  const handleTest = async (data: NodeFormData): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('/api/nodes/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    if (!text.trim()) return { success: false, message: `Empty response (HTTP ${res.status})` };
    try { return JSON.parse(text); } catch { return { success: false, message: text.slice(0, 200) }; }
  };

  const handleSave = async (data: NodeFormData) => {
    const tempId = `temp-${Date.now()}`;
    setNodes(prev => [{
      id: tempId, displayName: data.displayName, ipAddress: data.ipAddress,
      username: data.username, port: parseInt(data.port) || 22,
      authType: data.authType, status: 'connecting', createdAt: new Date().toISOString(),
    }, ...(prev ?? [])]);

    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    setNodes(prev => (prev ?? []).filter(n => n.id !== tempId));
    if (!res.ok) {
      await fetchNodes();
      let msg = `Server error (HTTP ${res.status})`;
      try { msg = JSON.parse(text)?.message || msg; } catch { }
      throw new Error(msg);
    }
    await fetchNodes();
  };

  const safeNodes = nodes ?? [];
  const onlineCount  = safeNodes.filter(n => n.status === 'online').length;
  const warningCount = safeNodes.filter(n => n.status === 'warning').length;
  const offlineCount = safeNodes.filter(n => n.status === 'offline').length;

  // ── Shared sidebar content ────────────────────────────────────────────────
  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className={`flex flex-col h-full ${collapsed ? 'w-16' : 'w-64'} transition-all duration-300`}>
      {/* Brand */}
      <div className={`${collapsed ? 'px-3 py-6 flex justify-center' : 'px-8 py-8'} mb-2`}>
        {collapsed ? (
          <Shield size={22} className="text-[#DFFF00]" />
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tighter text-white font-display">MYACCESS</h1>
            <p className="text-[10px] text-gray-500 font-medium tracking-[0.2em] uppercase">Server Monitoring</p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        <NavItem icon={LayoutDashboard} label="Dashboard"  active={activePage === 'dashboard'}  onClick={() => navigate('')}       collapsed={collapsed} />
        <NavItem icon={Database}        label="Nodes"       active={activePage === 'nodes' || activePage === 'node-detail'} onClick={() => navigate('nodes')} collapsed={collapsed} />

        {role === 'admin' && (
          <NavItem icon={Shield} label="User Management" active={activePage === 'users'}   onClick={() => navigate('users')}   collapsed={collapsed} />
        )}
        {role === 'employee' && (
          <NavItem icon={Users}  label="Team"            active={activePage === 'users'}   onClick={() => navigate('users')}   collapsed={collapsed} />
        )}

        <NavItem icon={UserCircle} label="User Profile" active={activePage === 'profile'} onClick={() => navigate('profile')} collapsed={collapsed} />
      </nav>

      {/* Fleet status */}
      {!collapsed && safeNodes.length > 0 && (
        <div className="mx-4 mb-4 p-3 rounded-lg bg-[#141414] border border-[#1F1F1F]">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-600 mb-2">Fleet Status</p>
          <div className="flex gap-3 text-[10px] font-bold">
            <span className="text-[#DFFF00]">{onlineCount} Online</span>
            {warningCount > 0 && <span className="text-yellow-400">{warningCount} Warn</span>}
            {offlineCount > 0 && <span className="text-red-400">{offlineCount} Offline</span>}
          </div>
        </div>
      )}

      {/* User info pill */}
      {!collapsed && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-[#141414] border border-[#1F1F1F] flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#DFFF00]/20 flex items-center justify-center text-[10px] font-bold text-[#DFFF00] flex-shrink-0">
            {profile?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-white font-medium truncate">{profile?.email}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest">{role}</p>
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className={`${collapsed ? 'px-2' : 'px-4'} space-y-1 mt-2 pb-4`}>
        {role !== 'intern' && (
          <button
            id="btn-new-node"
            onClick={() => setModalOpen(true)}
            className={`w-full bg-[#DFFF00] text-black flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm cursor-pointer hover:bg-[#c8e600] transition-colors shadow-[0_0_15px_rgba(223,255,0,0.3)] ${collapsed ? 'px-2' : ''}`}
          >
            <Plus size={16} />
            {!collapsed && 'Deploy New Node'}
          </button>
        )}

        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-500 hover:text-white cursor-pointer rounded-lg hover:bg-white/5 transition-all">
            <LifeBuoy size={18} /><span className="text-sm font-medium">Support</span>
          </div>
        )}

        <button
          onClick={signOut}
          className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-gray-500 hover:text-red-400 cursor-pointer rounded-lg hover:bg-white/5 transition-all`}
        >
          <Power size={18} />
          {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Mobile hamburger button ─────────────────────────────────────── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-40 md:hidden bg-[#141414] border border-[#2A2A2A] rounded-lg p-2 text-gray-400 hover:text-white transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* ── Mobile overlay drawer ───────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 z-50 h-screen bg-[#0A0A0A] border-r border-[#1F1F1F] overflow-y-auto md:hidden"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
              <SidebarContent collapsed={false} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col h-screen bg-neon-dark border-r border-border flex-shrink-0 overflow-y-auto transition-all duration-300 ${desktopCollapsed ? 'w-16' : 'w-64'}`}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setDesktopCollapsed(v => !v)}
          className="absolute mt-4 ml-auto right-[-12px] top-16 hidden md:flex w-6 h-6 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] items-center justify-center text-gray-500 hover:text-white transition-colors z-10"
          style={{ position: 'relative', alignSelf: 'flex-end', margin: '8px 8px 0 0' }}
        >
          {desktopCollapsed ? <Menu size={12} /> : <X size={12} />}
        </button>

        <SidebarContent collapsed={desktopCollapsed} />
      </aside>

      {/* Add Node Modal */}
      {role !== 'intern' && (
        <AddNodeModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onTest={handleTest}
        />
      )}
    </>
  );
}
