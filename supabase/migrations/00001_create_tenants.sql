-- Migration: Create tenants table for multi-tenant architecture
-- Story: 1.5 - Multi-tenant Database Structure & RLS
-- AC: #2 - tenants table with id, name, created_at

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add comment for documentation
COMMENT ON TABLE public.tenants IS 'Multi-tenant organizations';
COMMENT ON COLUMN public.tenants.id IS 'Unique tenant identifier';
COMMENT ON COLUMN public.tenants.name IS 'Organization/company name';
COMMENT ON COLUMN public.tenants.created_at IS 'Tenant creation timestamp';
COMMENT ON COLUMN public.tenants.updated_at IS 'Last update timestamp';

-- 3. Create updated_at trigger function (reusable for all tables)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to auto-update updated_at
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
