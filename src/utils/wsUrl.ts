/**
 * wsUrl() — Returns the correct WebSocket URL.
 *
 * When running through Vite's dev proxy (port 5173), the proxy config
 * forwards the '/ws' path to ws://localhost:3000. When running in
 * production (or when the backend serves the frontend directly on port 3000),
 * we connect directly to window.location.host with no path.
 */
export function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host     = window.location.host;

  // Vite proxy: frontend runs on 5173, backend on 3000 → use /ws path
  if (window.location.port === '5173') {
    return `${protocol}//${host}/ws`;
  }

  // Backend serving frontend directly (port 3000) → connect to root
  return `${protocol}//${host}`;
}
