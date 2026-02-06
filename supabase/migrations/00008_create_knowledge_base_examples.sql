-- Migration: Create knowledge_base_examples table for successful email examples
-- Story: 2.5 - Knowledge Base Editor - Tone & Examples
-- AC: #6 - knowledge_base_examples table created with id, tenant_id, subject, body, context, created_at, updated_at

-- ============================================
-- 1. CREATE KNOWLEDGE_BASE_EXAMPLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.knowledge_base_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEX FOR RLS PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_kb_examples_tenant ON public.knowledge_base_examples(tenant_id);

-- ============================================
-- 3. ADD UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER update_knowledge_base_examples_updated_at
  BEFORE UPDATE ON public.knowledge_base_examples
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. ENABLE RLS
-- ============================================
ALTER TABLE public.knowledge_base_examples ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS POLICIES - ADMIN ONLY ACCESS
-- ============================================

-- Admins can view own tenant examples
CREATE POLICY "Admins can view own tenant examples"
  ON public.knowledge_base_examples
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can insert examples
CREATE POLICY "Admins can insert examples"
  ON public.knowledge_base_examples
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can update own tenant examples
CREATE POLICY "Admins can update own tenant examples"
  ON public.knowledge_base_examples
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can delete own tenant examples
CREATE POLICY "Admins can delete own tenant examples"
  ON public.knowledge_base_examples
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE public.knowledge_base_examples IS 'Email examples for AI to learn communication style';
COMMENT ON COLUMN public.knowledge_base_examples.id IS 'Unique example identifier';
COMMENT ON COLUMN public.knowledge_base_examples.tenant_id IS 'References tenants.id for multi-tenancy';
COMMENT ON COLUMN public.knowledge_base_examples.subject IS 'Email subject line';
COMMENT ON COLUMN public.knowledge_base_examples.body IS 'Email body content';
COMMENT ON COLUMN public.knowledge_base_examples.context IS 'Context explaining when/why this email worked';
COMMENT ON COLUMN public.knowledge_base_examples.created_at IS 'Example creation timestamp';
COMMENT ON COLUMN public.knowledge_base_examples.updated_at IS 'Last update timestamp';

COMMENT ON POLICY "Admins can view own tenant examples" ON public.knowledge_base_examples
  IS 'FR44: Admin pode adicionar exemplos de emails bem-sucedidos';

COMMENT ON POLICY "Admins can insert examples" ON public.knowledge_base_examples
  IS 'FR44: Only admins can add email examples';

COMMENT ON POLICY "Admins can update own tenant examples" ON public.knowledge_base_examples
  IS 'FR44: Admins can edit email examples';

COMMENT ON POLICY "Admins can delete own tenant examples" ON public.knowledge_base_examples
  IS 'FR44: Admins can remove email examples';
