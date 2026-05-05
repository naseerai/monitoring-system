-- ============================================================
-- Monitoring System — PostgreSQL Schema
-- Run once against your standalone Postgres database.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ──────────────────────────────────────────────────────────────
-- 1. USERS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('admin', 'employee', 'intern')),
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 2. NODES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nodes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT        NOT NULL,
  ip_address   TEXT        NOT NULL,
  username     TEXT        NOT NULL,
  port         INTEGER     NOT NULL DEFAULT 22,
  auth_type    TEXT        NOT NULL DEFAULT 'password' CHECK (auth_type IN ('password', 'privateKey')),
  credential   TEXT        NOT NULL,
  region       TEXT        NOT NULL DEFAULT 'US-East-1',
  status       TEXT        NOT NULL DEFAULT 'connecting' CHECK (status IN ('connecting', 'online', 'offline', 'warning')),
  uptime_output TEXT,
  error        TEXT,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 3. NODE ASSIGNMENTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS node_assignments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  node_id    UUID        NOT NULL REFERENCES nodes(id)  ON DELETE CASCADE,
  created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, node_id)
);

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_node_assignments_user_id ON node_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_node_assignments_node_id ON node_assignments (node_id);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at        ON nodes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email             ON users (email);
