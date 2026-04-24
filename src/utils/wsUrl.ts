/**
 * wsUrl() — Returns the correct WebSocket URL for both
 * development (Vite) and production (Docker / Express).
 *
 * Always connects to '/ws' because backend upgrades happen on /ws.
 */

export function wsUrl(path: string = '/ws'): string {
  // Detect protocol (http → ws, https → wss)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  // Current host (includes port automatically)
  const host = window.location.host;

  return `${protocol}//${host}${path}`;
}