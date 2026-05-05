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
