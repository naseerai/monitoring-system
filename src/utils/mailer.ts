/**
 * mailer.ts — Nodemailer utility that loads SMTP config from system_settings table.
 * Used by the server to send welcome emails when new users are created.
 */

import nodemailer from 'nodemailer';
import pg from 'pg';

// Reuse pool injected from server (passed as parameter to avoid circular deps)
// We accept the pool as a parameter so this module stays pure.

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface WelcomeTemplate {
  subject: string;
  html: string;
}

export async function sendWelcomeEmail(
  pool: pg.Pool,
  to: string,
  plainPassword: string,
  loginUrl = 'http://localhost:3000'
): Promise<{ sent: boolean; error?: string }> {
  try {
    // Load SMTP config from DB
    const smtpRow = await pool.query(
      "SELECT value FROM system_settings WHERE setting_key = 'smtp'"
    );
    if (!smtpRow.rows[0]) return { sent: false, error: 'SMTP not configured' };

    const smtp: SmtpConfig = smtpRow.rows[0].value;
    if (!smtp.enabled || !smtp.host || !smtp.fromEmail) {
      return { sent: false, error: 'SMTP disabled or incomplete config' };
    }

    // Load email template from DB
    const tmplRow = await pool.query(
      "SELECT value FROM system_settings WHERE setting_key = 'welcome_email_template'"
    );
    const tmpl: WelcomeTemplate = tmplRow.rows[0]?.value ?? {
      subject: 'Welcome to Neon Sentry',
      html: '<p>Email: {{email}}</p><p>Password: {{password}}</p>',
    };

    // Replace template variables
    const renderedHtml = tmpl.html
      .replace(/\{\{email\}\}/g, to)
      .replace(/\{\{password\}\}/g, plainPassword)
      .replace(/\{\{loginUrl\}\}/g, loginUrl);

    const renderedSubject = tmpl.subject
      .replace(/\{\{email\}\}/g, to);

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: smtp.username
        ? { user: smtp.username, pass: smtp.password }
        : undefined,
    } as any);

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      subject: renderedSubject,
      html: renderedHtml,
    });

    console.log(`[MAILER] Welcome email sent → ${to}`);
    return { sent: true };
  } catch (err: any) {
    console.error(`[MAILER] Failed to send to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

export async function testSmtpConfig(config: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.username
        ? { user: config.username, pass: config.password }
        : undefined,
    } as any);
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
