-- Migration: Setup RLS policies for api_configs table
-- Story: 2.2 - API Keys Storage & Encryption
-- AC: #2 - Key stored with tenant_id isolation
-- AC: #3 - Admin-only access to API configurations

-- ============================================
-- API_CONFIGS TABLE RLS
-- ============================================

-- 1. Enable RLS on api_configs table
ALTER TABLE public.api_configs ENABLE ROW LEVEL SECURITY;

-- 2. Admins can view own tenant api configs
CREATE POLICY "Admins can view own tenant api configs"
  ON public.api_configs
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- 3. Admins can insert api configs for own tenant
CREATE POLICY "Admins can insert api configs"
  ON public.api_configs
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- 4. Admins can update own tenant api configs
CREATE POLICY "Admins can update own tenant api configs"
  ON public.api_configs
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- 5. Admins can delete own tenant api configs
CREATE POLICY "Admins can delete own tenant api configs"
  ON public.api_configs
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON POLICY "Admins can view own tenant api configs" ON public.api_configs
  IS 'NFR-S2: Admin-only access. Only admins can view integration configs within their tenant';

COMMENT ON POLICY "Admins can insert api configs" ON public.api_configs
  IS 'FR39: Only admins can configure API keys for integrations';

COMMENT ON POLICY "Admins can update own tenant api configs" ON public.api_configs
  IS 'FR39: Only admins can update integration API keys';

COMMENT ON POLICY "Admins can delete own tenant api configs" ON public.api_configs
  IS 'Only admins can remove integration configurations';
