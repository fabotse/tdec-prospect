-- Migration: Create icebreaker_examples table for AI-reference ice breaker examples
-- Story: 9.2 - Exemplos de Referencia para Ice Breakers no Knowledge Base
-- AC: #1, #2 - Dedicated section for icebreaker examples with category support

-- ============================================
-- 1. CREATE ICEBREAKER_EXAMPLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.icebreaker_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category TEXT CHECK (category IN ('lead', 'empresa', 'cargo', 'post')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEX FOR RLS PERFORMANCE
-- ============================================
-- Partial index: most queries filter by tenant_id
CREATE INDEX IF NOT EXISTS idx_icebreaker_examples_tenant ON public.icebreaker_examples(tenant_id);

-- ============================================
-- 3. ADD UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER update_icebreaker_examples_updated_at
  BEFORE UPDATE ON public.icebreaker_examples
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. ENABLE RLS
-- ============================================
ALTER TABLE public.icebreaker_examples ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS POLICIES - ADMIN ONLY ACCESS
-- ============================================

-- Admins can view own tenant icebreaker examples
CREATE POLICY "Admins can view own tenant icebreaker examples"
  ON public.icebreaker_examples
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can insert icebreaker examples
CREATE POLICY "Admins can insert icebreaker examples"
  ON public.icebreaker_examples
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can update own tenant icebreaker examples
CREATE POLICY "Admins can update own tenant icebreaker examples"
  ON public.icebreaker_examples
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can delete own tenant icebreaker examples
CREATE POLICY "Admins can delete own tenant icebreaker examples"
  ON public.icebreaker_examples
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE public.icebreaker_examples IS 'Ice breaker examples for AI to learn personalization style (Story 9.2)';
COMMENT ON COLUMN public.icebreaker_examples.id IS 'Unique example identifier';
COMMENT ON COLUMN public.icebreaker_examples.tenant_id IS 'References tenants.id for multi-tenancy';
COMMENT ON COLUMN public.icebreaker_examples.text IS 'Ice breaker text content (max 500 chars)';
COMMENT ON COLUMN public.icebreaker_examples.category IS 'Optional category: lead, empresa, cargo, post';
COMMENT ON COLUMN public.icebreaker_examples.created_at IS 'Example creation timestamp';
COMMENT ON COLUMN public.icebreaker_examples.updated_at IS 'Last update timestamp';
