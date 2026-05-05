// Shared types & token helpers (replaces @supabase/supabase-js on the frontend)

export type UserRole = 'super_admin' | 'admin' | 'employee' | 'intern';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  created_by: string | null;
  created_at: string;
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function removeToken(): void {
  localStorage.removeItem('auth_token');
}

/** Decode the payload of a JWT without verifying (verification happens server-side). */
export function decodeToken(token: string): { id: string; email: string; role: UserRole; iat: number; exp: number } | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return true;
  return Date.now() / 1000 > payload.exp;
}

/** Fetch wrapper that always attaches the Bearer token. */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
