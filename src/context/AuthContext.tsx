import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  getToken, setToken, removeToken, decodeToken, isTokenExpired,
  type UserRole, type Profile,
} from '../lib/api';

interface AuthState {
  token:    string | null;
  profile:  Profile | null;
  loading:  boolean;
  mustChangePassword: boolean;
  signIn:   (email: string, password: string) => Promise<{ error: string | null }>;
  signOut:  () => void;
  clearMustChange: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token,   setTok]    = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const hydrateProfile = useCallback((tok: string) => {
    const payload = decodeToken(tok);
    if (!payload) return;
    setProfile({ id: payload.id, email: payload.email, role: payload.role as UserRole, created_by: null, created_at: '' });
    // fetch full profile from server for created_at / created_by
    fetch('/api/profile', { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setProfile(data as Profile); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const stored = getToken();
    if (stored && !isTokenExpired(stored)) {
      setTok(stored);
      hydrateProfile(stored);
    }
    setLoading(false);
  }, [hydrateProfile]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.message || 'Login failed' };
      const tok: string = data.token;
      setToken(tok);
      setTok(tok);
      hydrateProfile(tok);
      // Store must_change_password from login response
      setMustChangePassword(data.must_change_password === true);
      return { error: null };
    } catch (e: any) {
      return { error: e.message || 'Network error' };
    }
  };

  const signOut = () => {
    // Explicitly clear ALL auth data from localStorage first
    localStorage.removeItem('auth_token');
    removeToken();
    setTok(null);
    setProfile(null);
    setMustChangePassword(false);
    // Hard redirect to root — forces full re-render back to landing page
    window.location.href = '/';
  };

  /** Called after a successful first-login password reset */
  const clearMustChange = () => setMustChangePassword(false);

  // Expose session-like shape so existing components still work
  const session = token ? { access_token: token } : null;

  return (
    <AuthContext.Provider value={{ token, profile, loading, mustChangePassword, signIn, signOut, clearMustChange } as any}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  // Add session alias so components using session?.access_token still work
  return {
    ...ctx,
    session: ctx.token ? { access_token: ctx.token } : null,
    user: ctx.profile,
  };
}
