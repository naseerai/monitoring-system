-- ============================================================
-- Migration: Add super_admin role + access_requests table
-- Run ONCE against your PostgreSQL database.
-- ============================================================

-- 1. Allow super_admin as a valid role in users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'employee', 'intern'));

-- 2. Create access_requests table
CREATE TABLE IF NOT EXISTS access_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  company_name    TEXT        NOT NULL,
  server_count    INTEGER     NOT NULL DEFAULT 0,
  message         TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Index on access_requests for email lookups
CREATE INDEX IF NOT EXISTS idx_access_requests_email  ON access_requests (email);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests (status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON access_requests (created_at DESC);

-- ============================================================
-- Migration: Quota limits + System Settings
-- ============================================================

-- 4. Add quota columns to users (safe — ADD COLUMN IF NOT EXISTS)
ALTER TABLE users ADD COLUMN IF NOT EXISTS node_limit INTEGER NOT NULL DEFAULT 10;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_limit INTEGER NOT NULL DEFAULT 20;

-- 5. System settings table (key-value JSON store for SMTP, templates, etc.)
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   TEXT        PRIMARY KEY,
  value         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Seed default SMTP config row (will not overwrite if already set)
INSERT INTO system_settings (setting_key, value)
VALUES (
  'smtp',
  '{"host":"smtp.hostinger.com","port":465,"secure":true,"username":"","password":"","fromEmail":"","fromName":"Neon Sentry","enabled":false}'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

-- 7. Seed default welcome email template
INSERT INTO system_settings (setting_key, value)
VALUES (
  'welcome_email_template',
  '{"subject":"Welcome to Neon Sentry","html":"<h2>Welcome!</h2><p>Your account has been created.</p><p><b>Email:</b> {{email}}</p><p><b>Password:</b> {{password}}</p><p><a href=\"{{loginUrl}}\">Login here</a></p>"}'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

