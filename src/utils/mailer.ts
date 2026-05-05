/**
 * mailer.ts — Nodemailer utility for Neon Sentry.
 * Loads SMTP config from system_settings, with Hostinger defaults.
 * Hostinger requires:
 *  - host: smtp.hostinger.com, port: 465, secure: true
 *  - auth.user must exactly match the "from" email address
 */

import nodemailer from 'nodemailer';
import pg from 'pg';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface EmailTemplate {
  subject: string;
  html: string;
}

// ── Defaults (Hostinger) ───────────────────────────────────────────────────

export const HOSTINGER_DEFAULTS: Partial<SmtpConfig> = {
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
};

const FALLBACK_SMTP: SmtpConfig = {
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  username: '',
  password: '',
  fromEmail: '',
  fromName: 'Neon Sentry',
  enabled: false,
};

const FALLBACK_TEMPLATE: EmailTemplate = {
  subject: 'Welcome to Neon Sentry',
  html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:#111;padding:28px 32px;border-bottom:1px solid #1a1a1a">
    <h1 style="margin:0;font-size:20px;color:#DFFF00;letter-spacing:-0.5px">Neon Sentry</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#666">Server Fleet Management</p>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px;font-size:18px;color:#fff">Welcome, {{fullName}}!</h2>
    <p style="color:#999;line-height:1.7;margin:0 0 24px">Your account has been created. Here are your login credentials:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:6px 6px 0 0;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Email</td></tr>
      <tr><td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1f1f1f;border-top:none;border-radius:0 0 6px 6px;font-family:monospace;color:#DFFF00">{{email}}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:6px 6px 0 0;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Temporary Password</td></tr>
      <tr><td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1f1f1f;border-top:none;border-radius:0 0 6px 6px;font-family:monospace;color:#DFFF00">{{password}}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr><td style="padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:6px 6px 0 0;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Role</td></tr>
      <tr><td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1f1f1f;border-top:none;border-radius:0 0 6px 6px;font-family:monospace;color:#a78bfa;text-transform:capitalize">{{role}}</td></tr>
    </table>
    <a href="{{loginUrl}}" style="display:inline-block;background:#DFFF00;color:#000;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:.04em">Login to Neon Sentry →</a>
    <p style="margin:24px 0 0;font-size:11px;color:#555;line-height:1.7">Please change your password after your first login. If you did not request this account, contact your system administrator immediately.</p>
  </div>
</div>`,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [key, val]) => out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val),
    template,
  );
}

/**
 * Build a Nodemailer transporter using Hostinger-compatible settings.
 * Key: for Hostinger, `auth.user` MUST equal `from` email, and secure MUST be true on port 465.
 */
function buildTransporter(smtp: SmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host || HOSTINGER_DEFAULTS.host,
    port: smtp.port || HOSTINGER_DEFAULTS.port,
    secure: smtp.secure !== false, // always true for Hostinger (port 465 / SSL)
    auth: {
      user: smtp.username,  // must match the "from" address on Hostinger
      pass: smtp.password,
    },
    tls: {
      // Hostinger certs are valid — never bypass verification in production
      rejectUnauthorized: true,
    },
  });
}

// ── Load SMTP config from DB ───────────────────────────────────────────────

async function loadSmtp(pool: pg.Pool): Promise<SmtpConfig> {
  const { rows } = await pool.query(
    "SELECT value FROM system_settings WHERE setting_key = 'smtp'"
  );
  if (!rows[0]) return FALLBACK_SMTP;
  return { ...FALLBACK_SMTP, ...rows[0].value };
}

async function loadTemplate(pool: pg.Pool): Promise<EmailTemplate> {
  const { rows } = await pool.query(
    "SELECT value FROM system_settings WHERE setting_key = 'welcome_email_template'"
  );
  if (!rows[0]) return FALLBACK_TEMPLATE;
  return rows[0].value as EmailTemplate;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Send the welcome email to a newly created user.
 * Replaces: {{fullName}}, {{email}}, {{password}}, {{role}}, {{loginUrl}}
 */
export async function sendWelcomeEmail(
  pool: pg.Pool,
  to: string,
  plainPassword: string,
  loginUrl = 'http://localhost:3000',
  userMeta: { fullName?: string; role?: string } = {},
): Promise<{ sent: boolean; error?: string }> {
  try {
    const smtp = await loadSmtp(pool);

    if (!smtp.enabled) {
      console.log('[MAILER] SMTP disabled — skipping welcome email.');
      return { sent: false, error: 'SMTP disabled' };
    }
    if (!smtp.host || !smtp.username || !smtp.password || !smtp.fromEmail) {
      console.warn('[MAILER] Incomplete SMTP config — missing host/credentials/fromEmail.');
      return { sent: false, error: 'Incomplete SMTP configuration' };
    }

    // Hostinger rule: auth.user must equal fromEmail exactly
    if (smtp.username !== smtp.fromEmail) {
      console.warn(`[MAILER] Hostinger warning: username (${smtp.username}) ≠ fromEmail (${smtp.fromEmail}). Using username as from address.`);
    }

    const tmpl = await loadTemplate(pool);

    const vars: Record<string, string> = {
      fullName: userMeta.fullName || to.split('@')[0],
      email:    to,
      password: plainPassword,
      role:     userMeta.role || 'user',
      loginUrl,
    };

    const html    = renderTemplate(tmpl.html,    vars);
    const subject = renderTemplate(tmpl.subject, vars);

    const transporter = buildTransporter(smtp);

    // Hostinger requires "from" to exactly match the authenticated account
    const fromField = `"${smtp.fromName}" <${smtp.username}>`;

    await transporter.sendMail({ from: fromField, to, subject, html });

    console.log(`[MAILER] ✓ Welcome email sent → ${to}`);
    return { sent: true };
  } catch (err: any) {
    console.error(`[MAILER] ✗ Failed to send to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Test SMTP connection using provided config (does not save to DB).
 * Used by the /smtp/test route.
 */
export async function testSmtpConnection(smtp: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!smtp.host || !smtp.username || !smtp.password) {
      return { ok: false, error: 'Missing host, username, or password' };
    }
    const transporter = buildTransporter(smtp);
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Send a test email to a target address using the current DB SMTP config + template.
 * Saves the provided smtp config first if passed, then sends.
 */
export async function sendTestEmail(
  pool: pg.Pool,
  toEmail: string,
  smtpOverride?: SmtpConfig,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const smtp = smtpOverride ?? await loadSmtp(pool);

    if (!smtp.host || !smtp.username || !smtp.password || !smtp.fromEmail) {
      return { sent: false, error: 'Incomplete SMTP config — fill all fields first' };
    }

    const tmpl = await loadTemplate(pool);

    const vars: Record<string, string> = {
      fullName: toEmail.split('@')[0],
      email:    toEmail,
      password: '(this is a test — no real password)',
      role:     'super_admin',
      loginUrl: 'http://localhost:3000',
    };

    const html    = renderTemplate(tmpl.html,    vars);
    const subject = `[TEST] ${renderTemplate(tmpl.subject, vars)}`;

    const transporter = buildTransporter(smtp);
    const fromField   = `"${smtp.fromName}" <${smtp.username}>`;

    await transporter.sendMail({ from: fromField, to: toEmail, subject, html });
    console.log(`[MAILER] ✓ Test email sent → ${toEmail}`);
    return { sent: true };
  } catch (err: any) {
    console.error('[MAILER] ✗ Test email failed:', err.message);
    return { sent: false, error: err.message };
  }
}
