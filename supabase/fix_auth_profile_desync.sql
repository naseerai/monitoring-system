-- =============================================================================
-- Fix: Auth ↔ Profile Desync
-- Run this in the Supabase Dashboard → SQL Editor
-- =============================================================================

-- ── 1. Trigger Function ───────────────────────────────────────────────────────
-- This function runs automatically after every INSERT into auth.users.
-- It guarantees a matching row exists in public.profiles.
-- "ON CONFLICT DO NOTHING" means it is safe to re-run / will not overwrite
-- existing profiles.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, created_by, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'intern'),  -- honour role set by backend
    NULL,                                                  -- created_by filled in by API
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;   -- profile already exists → no-op (safe for re-runs)

  RETURN NEW;
END;
$$;

-- ── 2. Attach the trigger to auth.users ───────────────────────────────────────
-- Drop first so re-running this script is idempotent.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 3. One-time back-fill ─────────────────────────────────────────────────────
-- Repair any users that already exist in auth.users but are missing from
-- public.profiles (i.e., the "ghost" users that caused the original bug).

INSERT INTO public.profiles (id, email, role, created_by, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'role', 'intern') AS role,
  NULL AS created_by,
  au.created_at
FROM auth.users AS au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
);

-- Report how many orphans were repaired
DO $$
DECLARE
  repaired INT;
BEGIN
  GET DIAGNOSTICS repaired = ROW_COUNT;
  RAISE NOTICE 'Back-fill complete: % orphaned auth user(s) repaired.', repaired;
END;
$$;
