-- Migration: Create knowledge_base table for company profile and AI context
-- Story: 2.4 - Knowledge Base Editor - Company Profile
-- AC: #4 - knowledge_base table created with id, tenant_id, section, content (jsonb), updated_at

-- ============================================
-- 1. CREATE KNOWLEDGE_BASE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('company', 'tone', 'examples', 'icp')),
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_tenant_section UNIQUE (tenant_id, section)
);

-- ============================================
-- 2. CREATE INDEX FOR RLS PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant_section ON public.knowledge_base(tenant_id, section);

-- ============================================
-- 3. ADD UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. ENABLE RLS
-- ============================================
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS POLICIES - ADMIN ONLY ACCESS
-- ============================================

-- Admins can view own tenant knowledge base
CREATE POLICY "Admins can view own tenant knowledge base"
  ON public.knowledge_base
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can insert knowledge base entries
CREATE POLICY "Admins can insert knowledge base"
  ON public.knowledge_base
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can update own tenant knowledge base
CREATE POLICY "Admins can update own tenant knowledge base"
  ON public.knowledge_base
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- Admins can delete own tenant knowledge base
CREATE POLICY "Admins can delete own tenant knowledge base"
  ON public.knowledge_base
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE public.knowledge_base IS 'Knowledge base content for AI text generation context';
COMMENT ON COLUMN public.knowledge_base.id IS 'Unique knowledge base entry identifier';
COMMENT ON COLUMN public.knowledge_base.tenant_id IS 'References tenants.id for multi-tenancy';
COMMENT ON COLUMN public.knowledge_base.section IS 'Section type: company, tone, examples, icp';
COMMENT ON COLUMN public.knowledge_base.content IS 'JSONB content for the section';
COMMENT ON COLUMN public.knowledge_base.created_at IS 'Entry creation timestamp';
COMMENT ON COLUMN public.knowledge_base.updated_at IS 'Last update timestamp';

COMMENT ON POLICY "Admins can view own tenant knowledge base" ON public.knowledge_base
  IS 'FR41: Admin pode criar e editar base de conhecimento do tenant';

COMMENT ON POLICY "Admins can insert knowledge base" ON public.knowledge_base
  IS 'FR41: Only admins can add knowledge base content';

COMMENT ON POLICY "Admins can update own tenant knowledge base" ON public.knowledge_base
  IS 'FR42: Admin pode adicionar descricao da empresa e produtos';

COMMENT ON POLICY "Admins can delete own tenant knowledge base" ON public.knowledge_base
  IS 'Only admins can remove knowledge base content';
