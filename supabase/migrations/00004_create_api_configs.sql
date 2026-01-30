-- Migration: Create api_configs table for encrypted API key storage
-- Story: 2.2 - API Keys Storage & Encryption
-- AC: #5 - api_configs table created with id, tenant_id, service_name, encrypted_key, created_at, updated_at

-- 1. Create api_configs table
CREATE TABLE IF NOT EXISTS public.api_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL CHECK (service_name IN ('apollo', 'signalhire', 'snovio', 'instantly')),
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_tenant_service UNIQUE (tenant_id, service_name)
);

-- 2. Create index for RLS performance
CREATE INDEX IF NOT EXISTS idx_api_configs_tenant_id ON public.api_configs(tenant_id);

-- 3. Add updated_at trigger (reuses existing function from 00001_create_tenants.sql)
CREATE TRIGGER update_api_configs_updated_at
  BEFORE UPDATE ON public.api_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Add comments for documentation
COMMENT ON TABLE public.api_configs IS 'Encrypted API keys for third-party integrations';
COMMENT ON COLUMN public.api_configs.id IS 'Unique config identifier';
COMMENT ON COLUMN public.api_configs.tenant_id IS 'References tenants.id for multi-tenancy';
COMMENT ON COLUMN public.api_configs.service_name IS 'Integration service: apollo, signalhire, snovio, instantly';
COMMENT ON COLUMN public.api_configs.encrypted_key IS 'AES-256-GCM encrypted API key (iv:authTag:ciphertext)';
COMMENT ON COLUMN public.api_configs.created_at IS 'Config creation timestamp';
COMMENT ON COLUMN public.api_configs.updated_at IS 'Last update timestamp';
