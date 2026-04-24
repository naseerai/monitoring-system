-- ============================================================
-- NEON SENTRY — Migration 002: Fix RLS Recursive Deadlock
-- Run this in your Supabase SQL Editor (Dashboard › SQL Editor)
-- ============================================================

-- ----------------------------------------------------------------
-- Fix profiles RLS — remove recursive policies, replace with
-- simple non-recursive ones. The service-role backend bypasses
-- RLS entirely, so the anon-key frontend only needs to read its
-- own row.
-- ----------------------------------------------------------------

-- 1. Drop old recursive policies on profiles
DROP POLICY IF EXISTS "Users can view own profile"         ON public.profiles;
DROP POLICY IF EXISTS "Managers can view their subordinates" ON public.profiles;
DROP POLICY IF EXISTS "Admins see all profiles"            ON public.profiles;
DROP POLICY IF EXISTS "Admins manage all profiles"         ON public.profiles;

-- 2. Simple self-read policy (no sub-select, never recursive)
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- 3. Admins see all profiles — use the security-definer helper
--    to avoid recursion (get_my_role() reads profiles as SECURITY DEFINER)
CREATE POLICY "Admins see all profiles"
  ON public.profiles FOR SELECT
  USING (public.get_my_role() = 'admin');

-- 4. Employees see profiles they created (their interns)
CREATE POLICY "Employees see their subordinates"
  ON public.profiles FOR SELECT
  USING (created_by = auth.uid() AND public.get_my_role() = 'employee');

-- 5. Backend service role handles all writes — no client-side INSERT/UPDATE/DELETE policies needed.
--    But keep a safety net so admins can still update from dashboard if needed.
CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ----------------------------------------------------------------
-- Fix node_assignments RLS — ensure employees can manage
-- assignments they created (for their interns), using the
-- security-definer get_my_role() to avoid recursion.
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS "Admins manage all assignments"           ON public.node_assignments;
DROP POLICY IF EXISTS "Employees manage their intern assignments" ON public.node_assignments;
DROP POLICY IF EXISTS "Users see own assignments"               ON public.node_assignments;

-- Admins: full access
CREATE POLICY "Admins manage all assignments"
  ON public.node_assignments FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Employees: manage assignments they created
CREATE POLICY "Employees manage their intern assignments"
  ON public.node_assignments FOR ALL
  USING (public.get_my_role() = 'employee' AND created_by = auth.uid())
  WITH CHECK (public.get_my_role() = 'employee' AND created_by = auth.uid());

-- Everyone: read their own assignments
CREATE POLICY "Users see own assignments"
  ON public.node_assignments FOR SELECT
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Ensure get_my_role() exists (idempotent)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
