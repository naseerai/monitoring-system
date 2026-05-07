-- ============================================================
-- Migration v3: Suspension + Forced Password Reset
-- Run ONCE against your PostgreSQL database.
-- ============================================================

-- 1. Add is_suspended flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

-- 2. Add must_change_password flag (forces reset on first login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Index for quick lookup on suspended users
CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users (is_suspended);
