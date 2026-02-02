-- Migration: Create products table for product catalog management
-- Story: 6.4 - Product Catalog CRUD
-- AC: #9 - Data isolation via RLS

-- ============================================
-- 1. CREATE PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  features TEXT,           -- Características principais
  differentials TEXT,      -- Diferenciais competitivos
  target_audience TEXT,    -- Público-alvo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEX FOR TENANT QUERIES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);

-- ============================================
-- 3. ADD UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. ENABLE RLS
-- ============================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS POLICIES - ANY AUTHENTICATED USER
-- ============================================

-- Users can view their tenant products
CREATE POLICY "Users can view their tenant products"
  ON public.products
  FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

-- Users can create products for their tenant
CREATE POLICY "Users can create products for their tenant"
  ON public.products
  FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- Users can update their tenant products
CREATE POLICY "Users can update their tenant products"
  ON public.products
  FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- Users can delete their tenant products
CREATE POLICY "Users can delete their tenant products"
  ON public.products
  FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE public.products IS 'Product catalog for campaign context and personalization';
COMMENT ON COLUMN public.products.id IS 'Unique product identifier';
COMMENT ON COLUMN public.products.tenant_id IS 'References tenants.id for multi-tenancy';
COMMENT ON COLUMN public.products.name IS 'Product name (max 200 chars)';
COMMENT ON COLUMN public.products.description IS 'Detailed product description';
COMMENT ON COLUMN public.products.features IS 'Main features and functionalities';
COMMENT ON COLUMN public.products.differentials IS 'Competitive differentials';
COMMENT ON COLUMN public.products.target_audience IS 'Target audience description';
COMMENT ON COLUMN public.products.created_at IS 'Product creation timestamp';
COMMENT ON COLUMN public.products.updated_at IS 'Last update timestamp';

COMMENT ON POLICY "Users can view their tenant products" ON public.products
  IS 'AC #9: Data filtered by tenant_id via RLS';

COMMENT ON POLICY "Users can create products for their tenant" ON public.products
  IS 'AC #4: Any authenticated user can create products';

COMMENT ON POLICY "Users can update their tenant products" ON public.products
  IS 'AC #5: Any authenticated user can edit products';

COMMENT ON POLICY "Users can delete their tenant products" ON public.products
  IS 'AC #6: Any authenticated user can delete products';
