-- Migration: Setup RLS policies for tenant isolation
-- Story: 1.5 - Multi-tenant Database Structure & RLS
-- AC: #1 - queries automatically filtered by tenant_id, cannot access other tenants
-- AC: #5 - RLS policies automatically filter by tenant_id

-- ============================================
-- TENANTS TABLE RLS
-- ============================================

-- 1. Enable RLS on tenants table
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. Users can only view their own tenant
CREATE POLICY "Users can view own tenant"
  ON public.tenants
  FOR SELECT
  USING (id = public.get_current_tenant_id());

-- ============================================
-- PROFILES TABLE RLS
-- ============================================

-- 3. Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Users can view their own profile (required for auth checks)
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- 5. Users can view profiles from their own tenant
CREATE POLICY "Users can view own tenant profiles"
  ON public.profiles
  FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

-- 5. Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 6. Profile INSERT policy
-- SECURITY DEFINER functions (handle_new_user) bypass RLS entirely.
-- This policy restricts direct inserts: user can only insert their own profile.
-- In practice, profiles are created by the trigger, not direct inserts.

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- 7. Profile DELETE policy
-- Users CANNOT delete profiles directly - this is intentional.
-- Profile deletion happens only via CASCADE when auth.users is deleted.
-- No DELETE policy = no direct deletions allowed.
-- Documented here for security audit clarity.

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON POLICY "Users can view own tenant" ON public.tenants
  IS 'NFR-S3: Tenant isolation - users can only see their own tenant';

COMMENT ON POLICY "Users can view own tenant profiles" ON public.profiles
  IS 'NFR-S3: Tenant isolation - users can only see profiles within their tenant';

COMMENT ON POLICY "Users can update own profile" ON public.profiles
  IS 'Users can only modify their own profile data';

COMMENT ON POLICY "Users can insert own profile" ON public.profiles
  IS 'Users can only insert their own profile (backup for trigger). Direct inserts restricted to own user ID';
