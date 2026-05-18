/**
 * mailer.ts — Centralized email dispatcher for Neon Sentry.
 *
 * Usage (server.ts):
 *   await dispatchEmail('welcome_mail', userEmail, { password, name });
 *   await dispatchEmail('reset_mail',   userEmail, { password });
 *   await dispatchEmail('node_notify_mail', adminEmail, { nodeName });
 *
 * Hostinger requirements:
 *  - host: smtp.hostinger.com, port: 465, secure: true
 *  - auth.user MUST exactly match the "from" email address
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

// Recognized template IDs
export type TemplateId = 'welcome_mail' | 'reset_mail' | 'node_notify_mail';

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

// ── Built-in fallback templates ────────────────────────────────────────────

const BUILT_IN_TEMPLATES: Record<TemplateId, EmailTemplate> = {

  welcome_mail: {
    subject: 'Welcome to Neon Sentry — Your Account is Ready',
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:#111;padding:28px 32px;border-bottom:1px solid #1a1a1a">
    <h1 style="margin:0;font-size:20px;color:#DFFF00;letter-spacing:-0.5px">Neon Sentry</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#666">Server Fleet Management</p>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px;font-size:18px;color:#fff">Welcome, {{name}}!</h2>
    <p style="color:#999;line-height:1.7;margin:0 0 24px">Your account has been created. Here are your login credentials:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:6px 6px 0 0;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Email</td></tr>
      <tr><td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1f1f1f;border-top:none;border-radius:0 0 6px 6px;font-family:monospace;color:#DFFF00">{{email}}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr><td style="padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:6px 6px 0 0;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Temporary Password</td></tr>
      <tr><td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1f1f1f;border-top:none;border-radius:0 0 6px 6px;font-family:monospace;color:#DFFF00">{{password}}</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:11px;color:#555;line-height:1.7">Please change your password after your first login. If you did not request this account, contact your system administrator immediately.</p>
  </div>
</div>`,
  },

  reset_mail: {
    subject: 'Neon Sentry — Your Password Has Been Reset',
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:#111;padding:28px 32px;border-bottom:1px solid #1a1a1a">
    <h1 style="margin:0;font-size:20px;color:#DFFF00;letter-spacing:-0.5px">Neon Sentry</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#666">Server Fleet Management</p>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px;font-size:18px;color:#fff">Password Reset</h2>
    <p style="color:#999;line-height:1.7;margin:0 0 24px">Your password has been reset by an administrator. Use the temporary password below to log in, then change it immediately.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr><td style="padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:6px 6px 0 0;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.1em">New Temporary Password</td></tr>
      <tr><td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1f1f1f;border-top:none;border-radius:0 0 6px 6px;font-family:monospace;color:#DFFF00">{{password}}</td></tr>
    </table>
    <p style="margin:0;font-size:11px;color:#555;line-height:1.7">If you did not request a password reset, contact your Super Admin immediately.</p>
  </div>
</div>`,
  },

  node_notify_mail: {
    subject: 'Neon Sentry — New Node Added: {{nodeName}}',
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e5e5e5;border-radius:12px;overflow:hidden;border:1px solid #1a1a1a">
  <div style="background:#111;padding:28px 32px;border-bottom:1px solid #1a1a1a">
    <h1 style="margin:0;font-size:20px;color:#DFFF00;letter-spacing:-0.5px">Neon Sentry</h1>
    <p style="margin:6px 0 0;font-size:12px;color:#666">Server Fleet Management</p>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px;font-size:18px;color:#fff">New Node Registered</h2>
    <p style="color:#999;line-height:1.7;margin:0 0 24px">A new server node has been added to your fleet and is being tested.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr><td style="padding:10px 14px;background:#111;border:1px solid #1f1f1f;border-radius:6px 6px 0 0;font-size:12px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Node Name</td></tr>
      <tr><td style="padding:10px 14px;background:#0d0d0d;border:1px solid #1f1f1f;border-top:none;border-radius:0 0 6px 6px;font-family:monospace;color:#DFFF00">{{nodeName}}</td></tr>
    </table>
    <p style="margin:0;font-size:11px;color:#555;line-height:1.7">Log in to the Neon Sentry dashboard to monitor its status.</p>
  </div>
</div>`,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Replace {{key}} placeholders in a string with values from the data map. */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [key, val]) => out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val ?? ''),
    template,
  );
}

/** Build a Nodemailer transporter (Hostinger-compatible). */
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

// ── DB loaders ─────────────────────────────────────────────────────────────

/** Fetch SMTP config from system_settings. Falls back to FALLBACK_SMTP. */
async function loadSmtpFromDb(pool: pg.Pool): Promise<SmtpConfig> {
  const { rows } = await pool.query(
    "SELECT value FROM system_settings WHERE setting_key = 'smtp'"
  );
  if (!rows[0]) return FALLBACK_SMTP;
  return { ...FALLBACK_SMTP, ...rows[0].value };
}

/**
 * Fetch a named email template from system_settings.
 * Falls back to the built-in template for that templateId.
 */
async function loadTemplateFromDb(pool: pg.Pool, templateId: TemplateId): Promise<EmailTemplate> {
  const { rows } = await pool.query(
    'SELECT value FROM system_settings WHERE setting_key = $1',
    [templateId]
  );
  if (rows[0]?.value?.subject && rows[0]?.value?.html) {
    return rows[0].value as EmailTemplate;
  }
  // Fall back to built-in (also covers the legacy 'welcome_email_template' key)
  if (templateId === 'welcome_mail') {
    const { rows: legacy } = await pool.query(
      "SELECT value FROM system_settings WHERE setting_key = 'welcome_email_template'"
    );
    if (legacy[0]?.value?.subject && legacy[0]?.value?.html) {
      return legacy[0].value as EmailTemplate;
    }
  }
  return BUILT_IN_TEMPLATES[templateId];
}

// ── Centralized Dispatcher ─────────────────────────────────────────────────

/**
 * dispatchEmail — the single function used everywhere in server.ts to send email.
 *
 * @param pool       pg.Pool instance
 * @param templateId One of: 'welcome_mail' | 'reset_mail' | 'node_notify_mail'
 * @param recipient  Destination email address
 * @param data       Template variables: { name, password, email, nodeName, ... }
 *
 * Steps:
 *  1. Fetch SMTP config from system_settings
 *  2. Validate SMTP is enabled and complete
 *  3. Fetch the named email template from system_settings (falls back to built-in)
 *  4. Render template variables
 *  5. Send via Nodemailer
 */
export async function dispatchEmail(
  pool: pg.Pool,
  templateId: TemplateId,
  recipient: string,
  data: Record<string, string>,
): Promise<{ sent: boolean; error?: string }> {
  console.log(`[MAILER] Attempting to send ${templateId} to ${recipient}`);

  try {
    // Step 1: Fetch SMTP config from system_settings
    const smtp = await loadSmtpFromDb(pool);

    // Step 2: Guard — SMTP must be enabled and fully configured
    if (!smtp.enabled) {
      console.log(`[MAILER] SMTP disabled — skipping ${templateId} to ${recipient}.`);
      return { sent: false, error: 'SMTP disabled' };
    }
    if (!smtp.host || !smtp.username || !smtp.password || !smtp.fromEmail) {
      console.warn(`[MAILER] Incomplete SMTP config — skipping ${templateId} to ${recipient}.`);
      return { sent: false, error: 'Incomplete SMTP configuration' };
    }

    // Hostinger rule: auth.user must equal fromEmail
    if (smtp.username !== smtp.fromEmail) {
      console.warn(`[MAILER] Hostinger warning: username (${smtp.username}) ≠ fromEmail (${smtp.fromEmail}). Using username as from address.`);
    }

    // Step 3: Fetch the named template from system_settings
    const tmpl = await loadTemplateFromDb(pool, templateId);

    // Step 4: Render — inject all data vars + the recipient email itself
    const vars: Record<string, string> = { email: recipient, ...data };
    const html    = renderTemplate(tmpl.html,    vars);
    const subject = renderTemplate(tmpl.subject, vars);

    // Step 5: Send
    const transporter = buildTransporter(smtp);
    const fromField   = `"${smtp.fromName}" <${smtp.username}>`;

    await transporter.sendMail({ from: fromField, to: recipient, subject, html });

    console.log(`[MAILER] ✓ ${templateId} sent → ${recipient}`);
    return { sent: true };

  } catch (err: any) {
    console.error(`[MAILER] ✗ Failed to send ${templateId} to ${recipient}:`, err.message);
    return { sent: false, error: err.message };
  }
}

// ── Test helpers (used by the /smtp/test route) ────────────────────────────

/**
 * Verify SMTP connectivity without sending any email.
 * Used by the "Test Connection" button in the Settings UI.
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
 * Send a real test email to the provided address using the current DB SMTP config.
 * Optionally accepts an smtp override (for the Settings form "send test" flow).
 */
export async function sendTestEmail(
  pool: pg.Pool,
  toEmail: string,
  smtpOverride?: SmtpConfig,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const smtp = smtpOverride ?? await loadSmtpFromDb(pool);

    if (!smtp.host || !smtp.username || !smtp.password || !smtp.fromEmail) {
      return { sent: false, error: 'Incomplete SMTP config — fill all fields first' };
    }

    // Use the welcome_mail template for the test email preview
    const tmpl = await loadTemplateFromDb(pool, 'welcome_mail');

    const vars: Record<string, string> = {
      name:     toEmail.split('@')[0],
      email:    toEmail,
      password: '(this is a test — no real password)',
      role:     'super_admin',
      loginUrl: 'http://localhost:3000',
      nodeName: 'test-node',
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
