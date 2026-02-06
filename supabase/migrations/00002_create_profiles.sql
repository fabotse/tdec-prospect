-- Migration: Create profiles table with tenant_id and auto-create trigger
-- Story: 1.5 - Multi-tenant Database Structure & RLS
-- AC: #3 - users table links to tenants via tenant_id
-- AC: #4 - profiles table stores user metadata (name, role) with 'admin' or 'user'
-- AC: #7 - profile record auto-created via trigger with default role 'user'

-- 1. Create profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for faster tenant queries
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);

-- 3. Add comments for documentation
COMMENT ON TABLE public.profiles IS 'User profiles linked to tenants';
COMMENT ON COLUMN public.profiles.id IS 'References auth.users.id';
COMMENT ON COLUMN public.profiles.tenant_id IS 'References tenants.id for multi-tenancy';
COMMENT ON COLUMN public.profiles.full_name IS 'User display name';
COMMENT ON COLUMN public.profiles.role IS 'User role: admin or user';
COMMENT ON COLUMN public.profiles.created_at IS 'Profile creation timestamp';
COMMENT ON COLUMN public.profiles.updated_at IS 'Last update timestamp';

-- 4. Create trigger to auto-update updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_tenant_id UUID;
BEGIN
  -- For MVP, get or create a default tenant
  -- In production, this would come from invite/signup flow
  SELECT id INTO default_tenant_id FROM public.tenants LIMIT 1;

  IF default_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name) VALUES ('Default Tenant')
    RETURNING id INTO default_tenant_id;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, full_name, role)
  VALUES (
    NEW.id,
    default_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger on auth.users to auto-create profile
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Function to get current user's tenant_id from authenticated session
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 8. Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
