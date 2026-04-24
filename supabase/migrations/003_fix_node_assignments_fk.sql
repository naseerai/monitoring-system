-- ============================================================
-- NEON SENTRY — Migration 003: Fix node_assignments FK
-- ============================================================
-- Problem: node_assignments.node_id has a FOREIGN KEY to
--   public.nodes(id), but nodes are stored in a local JSON
--   file managed by the Express backend — NOT in Supabase.
--   This causes a FK violation every time an assignment is saved.
--
-- Fix: Drop the FK constraint so node_id is a free UUID that
--   the backend validates against the local nodes.json file.
--   The UNIQUE(user_id, node_id) constraint is preserved.
-- ============================================================

-- 1. Drop the foreign-key constraint on node_id
--    (constraint name from initial schema: node_assignments_node_id_fkey)
ALTER TABLE public.node_assignments
  DROP CONSTRAINT IF EXISTS node_assignments_node_id_fkey;

-- 2. node_id column keeps its type (UUID NOT NULL) and the
--    UNIQUE(user_id, node_id) constraint — only the FK is removed.
--    No data loss occurs.

-- 3. Optionally: also drop the public.nodes table if it is empty
--    and you want to keep Supabase clean.
--    Only run this line if you are SURE the table is unused:
-- DROP TABLE IF EXISTS public.nodes;
