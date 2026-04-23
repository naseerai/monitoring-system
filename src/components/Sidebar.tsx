import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Database, Shield, ScrollText, Settings,
  LifeBuoy, Power, Plus, Server, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AddNodeModal, { NodeFormData } from './AddNodeModal';

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
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavItem({ icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full relative flex items-center gap-3 px-6 py-3 cursor-pointer group transition-all text-left ${
        active ? 'text-neon-lime bg-neon-lime/5 border-r-2 border-neon-lime' : 'text-gray-500 hover:text-white'
      }`}
    >
      <Icon size={20} className={active ? 'text-neon-lime' : 'group-hover:text-white'} />
      <span className="font-medium text-sm tracking-wide">{label}</span>
      {active && <motion.div layoutId="activeNav" className="absolute left-0 w-1 h-8 bg-neon-lime rounded-r" />}
    </button>
  );
}

function NodeStatusDot({ status }: { status: NodeRecord['status'] }) {
  if (status === 'connecting') return <Loader2 size={10} className="animate-spin text-yellow-400" />;
  if (status === 'online')     return <span className="w-2 h-2 rounded-full bg-neon-lime shadow-[0_0_6px_#D4FF00] flex-shrink-0" />;
  if (status === 'warning')    return <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.8)] flex-shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] flex-shrink-0" />;
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  // null = still loading; [] = loaded but empty
  const [nodes, setNodes] = useState<NodeRecord[] | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      if (res.ok) {
        const data = await res.json();
        setNodes(Array.isArray(data) ? data : []);
      } else {
        setNodes(prev => prev ?? []);
      }
    } catch {
      setNodes(prev => prev ?? []);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
    const iv = setInterval(fetchNodes, 5000);
    return () => clearInterval(iv);
  }, [fetchNodes]);

  const handleTest = async (data: NodeFormData): Promise<{ success: boolean; message: string }> => {
    const res = await fetch('/api/nodes/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    }, ...prev]);

    const res = await fetch('/api/nodes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    setNodes(prev => prev.filter(n => n.id !== tempId));
    if (!res.ok) {
      await fetchNodes();
      let msg = `Server error (HTTP ${res.status})`;
      try { msg = JSON.parse(text)?.message || msg; } catch {}
      throw new Error(msg);
    }
    await fetchNodes();
  };

  const safeNodes    = nodes ?? [];
  const onlineCount  = safeNodes.filter(n => n.status === 'online').length;
  const warningCount = safeNodes.filter(n => n.status === 'warning').length;
  const offlineCount = safeNodes.filter(n => n.status === 'offline').length;

  return (
    <>
      <aside className="w-64 h-screen bg-neon-dark border-r border-border flex flex-col py-8 overflow-y-auto flex-shrink-0">
        {/* Brand */}
        <div className="px-8 mb-10">
          <h1 className="text-xl font-bold tracking-tighter text-white font-display">MYACCESS</h1>
          <p className="text-[10px] text-gray-500 font-medium tracking-[0.2em] uppercase">Server Monitoring</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          <NavItem icon={LayoutDashboard} label="Dashboard" active={activePage === 'dashboard'} onClick={() => onNavigate('')} />
          <NavItem icon={Database}        label="Nodes"     active={activePage === 'nodes' || activePage === 'node-detail'} onClick={() => onNavigate('nodes')} />
          <NavItem icon={Shield}          label="Security"  active={false} onClick={() => {}} />
          <NavItem icon={ScrollText}      label="Logs"      active={false} onClick={() => {}} />
          <NavItem icon={Settings}        label="Settings"  active={false} onClick={() => {}} />
        </nav>

        {/* Mini node status summary */}
        {safeNodes.length > 0 && (
          <div className="mx-4 mb-4 p-3 rounded-lg bg-[#141414] border border-[#1F1F1F]">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-600 mb-2">Fleet Status</p>
            <div className="flex gap-3 text-[10px] font-bold">
              <span className="text-neon-lime">{onlineCount} Online</span>
              {warningCount > 0 && <span className="text-yellow-400">{warningCount} Warn</span>}
              {offlineCount > 0 && <span className="text-red-400">{offlineCount} Offline</span>}
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="px-4 space-y-1 mt-2">
          <button
            id="btn-new-node"
            onClick={() => setModalOpen(true)}
            className="w-full bg-neon-lime text-black flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm cursor-pointer hover:bg-[#BDE600] transition-colors neon-glow"
          >
            <Plus size={16} /> Deploy New Node
          </button>
          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-500 hover:text-white cursor-pointer rounded-lg hover:bg-white/5 transition-all">
            <LifeBuoy size={18} /><span className="text-sm font-medium">Support</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-500 hover:text-white cursor-pointer rounded-lg hover:bg-white/5 transition-all">
            <Power size={18} /><span className="text-sm font-medium">Sign Out</span>
          </div>
        </div>
      </aside>

      <AddNodeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onTest={handleTest}
      />
    </>
  );
}
