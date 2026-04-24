-- ============================================================
-- NEON SENTRY — Supabase Initial Schema Migration
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. PROFILES  (extends auth.users)
-- ----------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'employee', 'intern');

CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         user_role NOT NULL DEFAULT 'intern',
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow admins and employees to view profiles they created
CREATE POLICY "Managers can view their subordinates"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS me
      WHERE me.id = auth.uid()
        AND me.role IN ('admin', 'employee')
    )
    AND (created_by = auth.uid() OR auth.uid() = id)
  );

-- Admins can see ALL profiles
CREATE POLICY "Admins see all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can insert/update/delete any profile (service role bypasses this)
CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ----------------------------------------------------------------
-- 2. NODES  (server entries)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  TEXT NOT NULL,
  ip_address    TEXT NOT NULL,
  username      TEXT NOT NULL,
  port          INTEGER NOT NULL DEFAULT 22,
  auth_type     TEXT NOT NULL DEFAULT 'password' CHECK (auth_type IN ('password','privateKey')),
  credential    TEXT NOT NULL,          -- encrypted at rest by Supabase; never returned to client
  region        TEXT NOT NULL DEFAULT 'US-East-1',
  status        TEXT NOT NULL DEFAULT 'connecting',
  uptime_output TEXT,
  error         TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to nodes"
  ON public.nodes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Employees & Interns can only see nodes assigned to them (via node_assignments)
CREATE POLICY "Assigned users can view their nodes"
  ON public.nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.node_assignments
      WHERE node_id = nodes.id AND user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 3. NODE_ASSIGNMENTS  (who can see which node)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.node_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  node_id    UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, node_id)
);

ALTER TABLE public.node_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins manage all assignments"
  ON public.node_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Employees can view/create assignments they made (for their interns)
CREATE POLICY "Employees manage their intern assignments"
  ON public.node_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'employee'
    )
    AND created_by = auth.uid()
  );

-- Users can see their own assignments
CREATE POLICY "Users see own assignments"
  ON public.node_assignments FOR SELECT
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------
-- 4. TRIGGER: auto-create profile on signup
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'intern')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------
-- 5. HELPER FUNCTION: get calling user's role (used in server-side checks)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------
-- 6. Seed first admin (update the email below!)
--    Run manually after your first sign-up:
--
-- UPDATE public.profiles SET role = 'admin'
--   WHERE email = 'your-admin@example.com';
--
-- ----------------------------------------------------------------
