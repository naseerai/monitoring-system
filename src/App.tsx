import { useState, useEffect, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { useNodes } from './context/NodesContext';
import LoginPage from './components/LoginPage';
import LandingPage from './components/LandingPage';
import ForcePasswordResetPage from './components/ForcePasswordResetPage';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import NodesPage from './components/NodesPage';
import NodeDetailPage from './components/NodeDetailPage';
import TerminalPage from './components/TerminalPage';
import UserManagementPage from './components/UserManagementPage';
import UserProfilePage from './components/UserProfilePage';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import SystemManagementPage from './components/SystemManagementPage';
import SmtpSettingsPanel from './components/SmtpSettingsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

type Page = 'dashboard' | 'nodes' | 'node-detail' | 'terminal' | 'users' | 'profile' | 'settings' | 'super-admin' | 'system-management' | 'system-settings';

interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  username: string;
  port: number;
  region?: string;
  status: 'connecting' | 'online' | 'offline' | 'warning';
}

export default function App() {
  const { session, profile, loading, mustChangePassword } = useAuth() as any;

  const [page, setPage] = useState<Page>('dashboard');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [terminalNodeId, setTerminalNodeId] = useState<string | null>(null);
  // ── Nodes from shared context (no local fetch loop) ─────────────────────
  const { nodes: allNodes } = useNodes();

  // showLogin controls whether we render LoginPage vs LandingPage (when not authed)
  const [showLogin, setShowLogin] = useState(false);

  // ── On mount: if URL hash is #login, show login immediately ──────────────
  useEffect(() => {
    if (window.location.hash === '#login') setShowLogin(true);
  }, []);

  // ── Auto-redirect to login on sign-out ───────────────────────────────────
  const prevSessionRef = useRef(session);
  useEffect(() => {
    const wasSignedIn = prevSessionRef.current !== null;
    const isNowSignedOut = session === null;
    if (!loading && wasSignedIn && isNowSignedOut) {
      setShowLogin(true);
    }
    prevSessionRef.current = session;
  }, [session, loading]);

  // ── Hash-based routing ────────────────────────────────────────────────────
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('terminal/')) { setTerminalNodeId(hash.replace('terminal/', '')); setPage('terminal'); }
      else if (hash.startsWith('nodes/')) { setSelectedNodeId(hash.replace('nodes/', '')); setPage('node-detail'); setTerminalNodeId(null); }
      else if (hash === 'nodes')              { setPage('nodes');              setSelectedNodeId(null); setTerminalNodeId(null); }
      else if (hash === 'users')              { setPage('users');              setSelectedNodeId(null); setTerminalNodeId(null); }
      else if (hash === 'profile')            { setPage('profile');            setSelectedNodeId(null); setTerminalNodeId(null); }
      else if (hash === 'settings')           { setPage('settings');           setSelectedNodeId(null); setTerminalNodeId(null); }
      else if (hash === 'super-admin')        { setPage('super-admin');        setSelectedNodeId(null); setTerminalNodeId(null); }
      else if (hash === 'system-management')  { setPage('system-management');  setSelectedNodeId(null); setTerminalNodeId(null); }
      else if (hash === 'system-settings')    { setPage('system-settings');    setSelectedNodeId(null); setTerminalNodeId(null); }
      // #login → show login overlay (clears hash so the URL stays clean as /)
      else if (hash === 'login') {
        // If already logged in, redirect straight to dashboard
        if (session) {
          window.location.hash = '';
          setPage('dashboard');
        } else {
          setShowLogin(true);
        }
      }
      else { setPage('dashboard'); setSelectedNodeId(null); setTerminalNodeId(null); }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [session]);

  const navigate = (to: string) => { window.location.hash = to; };

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-neon-dark flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-neon-lime/30 border-t-neon-lime rounded-full animate-spin" />
      </div>
    );
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!session) {
    if (showLogin) return <LoginPage onBackToLanding={() => { setShowLogin(false); window.location.hash = ''; }} />;
    return <LandingPage onNavigateToLogin={() => { window.location.hash = 'login'; setShowLogin(true); }} />;
  }

  // ── First-login forced password reset ────────────────────────────────────
  if (mustChangePassword) {
    return <ForcePasswordResetPage />;
  }

  const role = (profile?.role ?? 'intern') as 'super_admin' | 'admin' | 'employee' | 'intern';

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden font-display">
        {page !== 'terminal' && (
          <ErrorBoundary>
            <Sidebar activePage={page} onNavigate={navigate} role={role} />
          </ErrorBoundary>
        )}

        <main className="flex-1 flex flex-col bg-neon-dark relative overflow-hidden">
          {page !== 'terminal' && (
            <>
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#DFFF00]/10 blur-[150px] -z-10 rounded-full" />
              <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#DFFF00]/5 blur-[100px] -z-10 rounded-full" />
            </>
          )}

          <ErrorBoundary>
            {page === 'dashboard' && <Dashboard />}

            {page === 'nodes' && (
              <NodesPage
                onViewDetails={(id) => navigate(`nodes/${id}`)}
                onOpenTerminalPage={(id) => navigate(`terminal/${id}`)}
                role={role}
              />
            )}

            {page === 'settings' && (
              <div className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-2xl">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold mb-1">CONFIGURATION</p>
                  <h1 className="text-2xl font-bold text-white tracking-tight mb-6">Settings</h1>
                  <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-8 text-center">
                    <div className="w-14 h-14 rounded-xl bg-neon-lime/10 border border-neon-lime/20 flex items-center justify-center mx-auto mb-4">
                      <span style={{ fontSize: 24 }}>⚙️</span>
                    </div>
                    <p className="text-white font-bold mb-2">Settings Coming Soon</p>
                    <p className="text-gray-500 text-sm">Advanced configuration options will be available in the next release.</p>
                  </div>
                </div>
              </div>
            )}

            {page === 'node-detail' && selectedNodeId && (
              <NodeDetailPage
                nodeId={selectedNodeId}
                onBack={() => navigate('nodes')}
                onOpenTerminalPage={(id) => navigate(`terminal/${id}`)}
                role={role}
              />
            )}

            {page === 'terminal' && terminalNodeId && (
              <TerminalPage
                nodeId={terminalNodeId}
                onBack={() => navigate('nodes')}
                allNodes={allNodes.slice(0, 3)}
                onNavigateNode={(id) => navigate(`terminal/${id}`)}
              />
            )}

            {page === 'users' && (role === 'super_admin' || role === 'admin' || role === 'employee') && (
              <UserManagementPage />
            )}

            {page === 'super-admin' && role === 'super_admin' && (
              <SuperAdminDashboard />
            )}

            {page === 'system-management' && role === 'super_admin' && (
              <SystemManagementPage />
            )}

            {page === 'system-settings' && role === 'super_admin' && (
              <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#070707]">
                <div className="mb-6">
                  <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-bold mb-1">SUPER ADMIN</p>
                  <h1 className="text-2xl font-extrabold text-white tracking-tight">System Settings</h1>
                  <p className="text-sm text-gray-600 mt-1">SMTP configuration and email template editor.</p>
                </div>
                <SmtpSettingsPanel />
              </div>
            )}

            {page === 'profile' && (
              <UserProfilePage onNavigate={navigate} />
            )}
          </ErrorBoundary>
        </main>
      </div>
    </ErrorBoundary>
  );
}