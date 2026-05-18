import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Save, Loader2, Check, AlertCircle, Send, Mail, Zap, Wifi } from 'lucide-react';

interface SmtpState {
  host: string; port: number; secure: boolean;
  username: string; password: string;
  fromEmail: string; fromName: string; enabled: boolean;
}
interface TmplState { subject: string; html: string; }

const HOSTINGER_DEFAULTS: Partial<SmtpState> = {
  host: 'smtp.hostinger.com', port: 465, secure: true,
};

export default function SmtpSettingsPanel() {
  const { session } = useAuth();
  const tok = session?.access_token ?? '';
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  const [smtp, setSmtp] = useState<SmtpState>({
    host: 'smtp.hostinger.com', port: 465, secure: true,
    username: '', password: '', fromEmail: '', fromName: 'Neon Sentry', enabled: false,
  });
  const [tmpl, setTmpl] = useState<TmplState>({
    subject: 'Welcome to Neon Sentry — {{role}} Account',
    html: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const load = useCallback(async () => {
    if (!tok) return;
    setLoading(true);
    try {
      const [sr, tr] = await Promise.all([
        fetch('/api/super-admin/settings/smtp', { headers: H }),
        fetch('/api/super-admin/settings/welcome_email_template', { headers: H }),
      ]);
      if (sr.ok) {
        const data = await sr.json();
        setSmtp(prev => ({ ...prev, ...data }));
      }
      if (tr.ok) setTmpl(await tr.json());
    } catch { }
    setLoading(false);
  }, [tok]);

  useEffect(() => { load(); }, [load]);

  // ── Save SMTP ─────────────────────────────────────────────────────────────
  const saveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/super-admin/settings/smtp', {
        method: 'PUT', headers: H, body: JSON.stringify(smtp),
      });
      r.ok ? flash(true, 'SMTP settings saved.') : flash(false, (await r.json()).message || 'Save failed');
    } catch (err: any) { flash(false, err.message); }
    setSaving(false);
  };

  // ── Save Template ─────────────────────────────────────────────────────────
  const saveTmpl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/super-admin/settings/welcome_email_template', {
        method: 'PUT', headers: H, body: JSON.stringify(tmpl),
      });
      r.ok ? flash(true, 'Template saved.') : flash(false, (await r.json()).message || 'Save failed');
    } catch (err: any) { flash(false, err.message); }
    setSaving(false);
  };

  // ── Send Test Email (passes current form values to backend) ───────────────
  const testSmtp = async () => {
    setTesting(true);
    try {
      // Send the current in-form values so the test uses exactly what's on screen
      const r = await fetch('/api/super-admin/settings/smtp/test', {
        method: 'POST', headers: H,
        body: JSON.stringify(smtp), // backend saves these then sends to superadmin email
      });
      const d = await r.json();
      d.ok
        ? flash(true, d.message || 'Test email sent — check your inbox!')
        : flash(false, `Failed: ${d.error}`);
    } catch (err: any) { flash(false, err.message); }
    setTesting(false);
  };

  // ── Test Connection (verify() only — no email sent) ────────────────────────
  const testConnection = async () => {
    setVerifying(true);
    try {
      const r = await fetch('/api/super-admin/settings/smtp/verify', {
        method: 'POST', headers: H,
        body: JSON.stringify(smtp),
      });
      const d = await r.json();
      d.ok
        ? flash(true, '✓ SMTP connection verified — credentials are correct!')
        : flash(false, `Connection failed: ${d.error}`);
    } catch (err: any) { flash(false, err.message); }
    setVerifying(false);
  };

  // ── Load Hostinger Defaults ───────────────────────────────────────────────
  const loadHostingerDefaults = () => {
    setSmtp(prev => ({
      ...prev,
      host: HOSTINGER_DEFAULTS.host!,
      port: HOSTINGER_DEFAULTS.port!,
      secure: HOSTINGER_DEFAULTS.secure!,
    }));
    flash(true, 'Hostinger defaults applied — fill in your credentials and save.');
  };

  const inp = "w-full bg-[#111] border border-[#222] text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-[#DFFF00]/40 focus:ring-1 focus:ring-[#DFFF00]/10 transition-colors";
  const lbl = "block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5";

  if (loading) return (
    <div className="flex items-center gap-3 p-8 text-gray-500">
      <Loader2 size={16} className="animate-spin" /> Loading settings…
    </div>
  );

  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── SMTP Form ──────────────────────────────────────────────────────── */}
      <form onSubmit={saveSmtp} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#111]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#DFFF00]/10 border border-[#DFFF00]/20 flex items-center justify-center">
              <Mail size={14} color="#DFFF00" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">SMTP Configuration</h3>
              <p className="text-xs text-gray-600">Outbound email server (Hostinger recommended)</p>
            </div>
          </div>
          {/* Enabled toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <span className="text-xs text-gray-500 font-medium">
              {smtp.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <div
              role="switch"
              aria-checked={smtp.enabled}
              onClick={() => setSmtp(p => ({ ...p, enabled: !p.enabled }))}
              className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${smtp.enabled ? 'bg-[#DFFF00]' : 'bg-[#222]'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${smtp.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>
        </div>

        <div className="p-6 space-y-5">
          {/* Hostinger Preset Button */}
          <div className="flex items-center gap-3 p-3.5 bg-[#111] border border-[#222] rounded-xl">
            <Zap size={14} color="#DFFF00" className="flex-shrink-0" />
            <span className="text-xs text-gray-400 flex-1">
              Using Hostinger? Auto-fill the server settings.
            </span>
            <button
              type="button"
              onClick={loadHostingerDefaults}
              className="flex items-center gap-1.5 bg-[#DFFF00]/10 border border-[#DFFF00]/25 text-[#DFFF00] text-xs font-bold rounded-lg px-3 py-1.5 hover:bg-[#DFFF00]/20 transition-colors"
            >
              <Zap size={11} /> Load Hostinger Defaults
            </button>
          </div>

          {/* Grid: Host + Port */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={lbl}>SMTP Host</label>
              <input
                className={inp} value={smtp.host}
                placeholder="smtp.hostinger.com"
                onChange={e => setSmtp(p => ({ ...p, host: e.target.value }))}
              />
            </div>
            <div>
              <label className={lbl}>Port</label>
              <input
                className={inp} type="number" value={smtp.port}
                onChange={e => setSmtp(p => ({ ...p, port: Number(e.target.value) }))}
              />
            </div>
          </div>

          {/* Secure toggle */}
          <div className="flex items-center gap-3">
            <input
              id="smtp-secure"
              type="checkbox"
              checked={smtp.secure}
              onChange={e => setSmtp(p => ({ ...p, secure: e.target.checked }))}
              className="accent-[#DFFF00] w-4 h-4 rounded"
            />
            <label htmlFor="smtp-secure" className="text-xs text-gray-400 cursor-pointer">
              Use SSL/TLS (Secure) — required for Hostinger port 465
            </label>
          </div>

          {/* Username + Password */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Username (Email Account)</label>
              <input
                className={inp} value={smtp.username}
                placeholder="noreply@yourdomain.com"
                onChange={e => setSmtp(p => ({ ...p, username: e.target.value }))}
              />
              <p className="text-[10px] text-gray-600 mt-1">
                ⚠️ On Hostinger, username must match the "From" email exactly
              </p>
            </div>
            <div>
              <label className={lbl}>Password</label>
              <input
                className={inp} type="password" value={smtp.password}
                placeholder="Email account password"
                onChange={e => setSmtp(p => ({ ...p, password: e.target.value }))}
              />
            </div>
          </div>

          {/* From Email + From Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>From Email</label>
              <input
                className={inp} type="email" value={smtp.fromEmail}
                placeholder="noreply@yourdomain.com"
                onChange={e => setSmtp(p => ({ ...p, fromEmail: e.target.value }))}
              />
              <p className="text-[10px] text-gray-600 mt-1">
                Must match the Username on Hostinger
              </p>
            </div>
            <div>
              <label className={lbl}>From Name</label>
              <input
                className={inp} value={smtp.fromName}
                placeholder="Neon Sentry"
                onChange={e => setSmtp(p => ({ ...p, fromName: e.target.value }))}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit" disabled={saving}
              className="flex items-center gap-2 bg-[#DFFF00] text-black font-bold rounded-lg px-5 py-2 text-sm hover:bg-[#c8e600] disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save SMTP
            </button>
            <button
              type="button" onClick={testConnection} disabled={verifying || saving}
              className="flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold rounded-lg px-5 py-2 text-sm hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              title="Checks SMTP credentials without sending any email"
            >
              {verifying ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
              {verifying ? 'Connecting…' : 'Test Connection'}
            </button>
            <button
              type="button" onClick={testSmtp} disabled={testing || saving}
              className="flex items-center gap-2 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-bold rounded-lg px-5 py-2 text-sm hover:bg-cyan-500/20 disabled:opacity-50 transition-colors"
              title="Saves current values and sends a real test email to your account"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {testing ? 'Sending…' : 'Send Test Email'}
            </button>
          </div>
          <div className="text-[10px] text-gray-600 space-y-0.5">
            <p><span className="text-emerald-500/70 font-semibold">Test Connection</span> — verifies credentials (no email sent).</p>
            <p><span className="text-cyan-500/70 font-semibold">Send Test Email</span> — saves the form and delivers a sample email to your Super Admin address.</p>
          </div>
        </div>
      </form>

      {/* ── Email Template Form ─────────────────────────────────────────────── */}
      <form onSubmit={saveTmpl} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#111]">
          <h3 className="text-sm font-bold text-white mb-1">Welcome Email Template</h3>
          <p className="text-xs text-gray-600">
            Sent automatically when any new user is created. Supports:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {['{{fullName}}', '{{email}}', '{{password}}', '{{role}}', '{{loginUrl}}'].map(v => (
              <code key={v} className="text-[11px] font-mono bg-[#111] border border-[#222] text-[#DFFF00] px-2 py-0.5 rounded">
                {v}
              </code>
            ))}
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={lbl}>Subject</label>
            <input
              className={inp} value={tmpl.subject}
              placeholder="Welcome to Neon Sentry — {{role}} Account"
              onChange={e => setTmpl(p => ({ ...p, subject: e.target.value }))}
            />
          </div>
          <div>
            <label className={lbl}>HTML Body</label>
            <textarea
              className={`${inp} font-mono text-xs resize-y leading-relaxed`}
              rows={14}
              value={tmpl.html}
              placeholder="<h2>Welcome, {{fullName}}!</h2>&#10;<p>Email: {{email}}</p>&#10;<p>Password: {{password}}</p>"
              onChange={e => setTmpl(p => ({ ...p, html: e.target.value }))}
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Leave blank to use the built-in Neon Sentry branded template.
            </p>
          </div>
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-2 bg-[#DFFF00] text-black font-bold rounded-lg px-5 py-2 text-sm hover:bg-[#c8e600] disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Template
          </button>
        </div>
      </form>

      {/* ── Feedback toast ──────────────────────────────────────────────────── */}
      {msg && (
        <div className={`flex items-center gap-2.5 text-xs rounded-xl px-4 py-3 border ${
          msg.ok
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {msg.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
