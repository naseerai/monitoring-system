-- ============================================================
-- Migration v4: Docker Management Feature
-- Run ONCE against your PostgreSQL database.
-- ============================================================

-- 1. Add docker_enabled flag to users (controls Docker Management access)
ALTER TABLE users ADD COLUMN IF NOT EXISTS docker_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Ensure system_settings uses (setting_key, value) shape (already v3 compliant)
--    No change needed — table already exists with setting_key TEXT PRIMARY KEY, value JSONB

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_users_docker_enabled ON users (docker_enabled);
