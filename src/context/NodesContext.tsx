/**
 * NodesContext — single source of truth for the node list.
 *
 * Fetches GET /api/nodes once on mount, then polls every 15 s.
 * All components (Dashboard, NodesPage, Sidebar) read from this
 * context instead of each launching their own fetch loop.
 *
 * Key design choices that prevent infinite-loop re-renders:
 *   - The auth token is read via a ref (tokenRef) so the
 *     useEffect / setInterval callbacks are never re-created
 *     when the token object reference changes.
 *   - The setInterval is set up once with [] deps and cleared
 *     on unmount.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NodeRecord {
  id: string;
  displayName: string;
  ipAddress: string;
  username?: string;
  port?: number;
  authType?: 'password' | 'privateKey';
  region?: string;
  status: 'connecting' | 'online' | 'offline' | 'warning';
  uptimeOutput?: string;
  error?: string;
  createdAt?: string;
}

interface NodesState {
  nodes: NodeRecord[];
  loading: boolean;
  refresh: () => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const NodesContext = createContext<NodesState>({
  nodes: [],
  loading: true,
  refresh: () => {},
});

const POLL_INTERVAL_MS = 15_000; // 15 seconds

export function NodesProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

  // Keep the token in a ref so our interval callback always sees the latest
  // value without needing to re-register the interval on every token change.
  const tokenRef = useRef<string | null>(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const [nodes,   setNodes]   = useState<NodeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNodes = useCallback(async () => {
    const tok = tokenRef.current;
    if (!tok) return; // not logged in yet
    try {
      const res = await fetch('/api/nodes', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data: NodeRecord[] = await res.json();
        setNodes(Array.isArray(data) ? data : []);
      }
    } catch {
      // network error — keep stale data, don't crash
    } finally {
      setLoading(false);
    }
  }, []); // ← stable: no deps that change

  // Mount once, poll every 15 s, clean up on unmount.
  useEffect(() => {
    fetchNodes();
    const iv = setInterval(fetchNodes, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchNodes]); // fetchNodes is stable (no-dep useCallback)

  return (
    <NodesContext.Provider value={{ nodes, loading, refresh: fetchNodes }}>
      {children}
    </NodesContext.Provider>
  );
}

export function useNodes(): NodesState {
  return useContext(NodesContext);
}
