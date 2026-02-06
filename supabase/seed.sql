-- Seed data for development environment
-- Story: 1.5 - Multi-tenant Database Structure & RLS
--
-- Note: This creates test tenants only.
-- Users are created via Supabase Auth, and profiles are auto-created by trigger.
-- To set a user as admin after signup, run:
--   UPDATE profiles SET role = 'admin' WHERE id = 'user-uuid-here';

-- Create test tenant for TDEC
INSERT INTO public.tenants (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'TDEC Test Tenant')
ON CONFLICT (id) DO NOTHING;

-- Create a second tenant to test isolation
INSERT INTO public.tenants (id, name) VALUES
  ('00000000-0000-0000-0000-000000000002', 'Other Company Tenant')
ON CONFLICT (id) DO NOTHING;

-- Development Notes:
-- ==================
-- After running seed, create test users via Supabase Auth:
--
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Create user: admin@tdec.test / password123
-- 3. Create user: user@tdec.test / password123
-- 4. Create user: other@company.test / password123 (for isolation testing)
--
-- Then assign roles:
-- UPDATE profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@tdec.test');
--
-- The handle_new_user trigger will automatically:
-- - Create a profile for each new user
-- - Assign them to the FIRST tenant (TDEC Test Tenant)
-- - Set their role to 'user' by default
--
-- ==================
-- TESTING TENANT ISOLATION:
-- ==================
-- To test RLS isolation, assign one user to the second tenant:
--
-- UPDATE profiles
-- SET tenant_id = '00000000-0000-0000-0000-000000000002'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'other@company.test');
--
-- After this, login as other@company.test should NOT see data from:
-- - admin@tdec.test
-- - user@tdec.test
--
-- This validates AC#1: "I cannot access data from other tenants"
