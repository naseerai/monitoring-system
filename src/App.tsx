import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import NodesPage from './components/NodesPage';
import NodeDetailPage from './components/NodeDetailPage';
import TerminalPage from './components/TerminalPage';
import { ErrorBoundary } from './components/ErrorBoundary';

type Page = 'dashboard' | 'nodes' | 'node-detail' | 'terminal';

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
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [terminalNodeId, setTerminalNodeId] = useState<string | null>(null);
  const [allNodes, setAllNodes] = useState<NodeRecord[]>([]);

  // Fetch all nodes for tab navigation in TerminalPage
  useEffect(() => {
    fetch('/api/nodes')
      .then(r => r.ok ? r.json() : [])
      .then(data => setAllNodes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Hash-based routing: #nodes, #nodes/ID, #terminal/ID, default = dashboard
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('terminal/')) {
        const id = hash.replace('terminal/', '');
        setTerminalNodeId(id);
        setPage('terminal');
      } else if (hash.startsWith('nodes/')) {
        setSelectedNodeId(hash.replace('nodes/', ''));
        setPage('node-detail');
        setTerminalNodeId(null);
      } else if (hash === 'nodes') {
        setPage('nodes');
        setSelectedNodeId(null);
        setTerminalNodeId(null);
      } else {
        setPage('dashboard');
        setSelectedNodeId(null);
        setTerminalNodeId(null);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const navigate = (to: string) => { window.location.hash = to; };

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden font-display">
        {/* Sidebar is hidden on the terminal full-page view */}
        {page !== 'terminal' && (
          <ErrorBoundary>
            <Sidebar activePage={page} onNavigate={navigate} />
          </ErrorBoundary>
        )}

        <main className="flex-1 flex flex-col bg-neon-dark relative overflow-hidden">
          {/* Ambient glow — only on non-terminal pages */}
          {page !== 'terminal' && (
            <>
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-neon-lime/10 blur-[150px] -z-10 rounded-full" />
              <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-neon-lime/5 blur-[100px] -z-10 rounded-full" />
            </>
          )}

          <ErrorBoundary>
            {page === 'dashboard' && <Dashboard />}

            {page === 'nodes' && (
              <NodesPage
                onViewDetails={(id) => navigate(`nodes/${id}`)}
                onOpenTerminalPage={(id) => navigate(`terminal/${id}`)}
              />
            )}

            {page === 'node-detail' && selectedNodeId && (
              <NodeDetailPage
                nodeId={selectedNodeId}
                onBack={() => navigate('nodes')}
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
          </ErrorBoundary>
        </main>
      </div>
    </ErrorBoundary>
  );
}
