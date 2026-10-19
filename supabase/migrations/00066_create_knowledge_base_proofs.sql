-- Migration: Create knowledge_base_proofs table (authorized proofs the AI may cite)
-- Story: 24.7 - Seção de Provas na Knowledge Base
-- Aditiva: só CREATE TABLE/INDEX/TRIGGER/POLICY e COMMENT. Nenhum objeto existente é alterado.

-- ============================================
-- 1. CREATE KNOWLEDGE_BASE_PROOFS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.knowledge_base_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  proof_type TEXT NOT NULL CHECK (
    proof_type IN ('case', 'numero', 'cliente_referencia', 'certificacao', 'tempo_mercado')
  ),
  text TEXT NOT NULL,
  sector TEXT NULL,
  is_authorized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CREATE INDEX FOR RLS PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_knowledge_base_proofs_tenant ON public.knowledge_base_proofs(tenant_id);

-- ============================================
-- 3. ADD UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER update_knowledge_base_proofs_updated_at
  BEFORE UPDATE ON public.knowledge_base_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. ENABLE RLS (somente a tabela nova)
-- ============================================
ALTER TABLE public.knowledge_base_proofs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. RLS POLICIES
-- Leitura: qualquer membro do tenant (agente e editor rodam com a sessão do usuário, inclusive SDR).
-- Escrita: só admin.
-- ============================================

CREATE POLICY "Tenant members can view own tenant proofs"
  ON public.knowledge_base_proofs
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
  );

CREATE POLICY "Admins can insert proofs"
  ON public.knowledge_base_proofs
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

CREATE POLICY "Admins can update own tenant proofs"
  ON public.knowledge_base_proofs
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

CREATE POLICY "Admins can delete own tenant proofs"
  ON public.knowledge_base_proofs
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE public.knowledge_base_proofs IS 'Provas (cases, números, clientes de referência, certificações, tempo de mercado) que a IA pode citar quando autorizadas (Story 24.7)';
COMMENT ON COLUMN public.knowledge_base_proofs.id IS 'Unique proof identifier';
COMMENT ON COLUMN public.knowledge_base_proofs.tenant_id IS 'References tenants.id for multi-tenancy';
COMMENT ON COLUMN public.knowledge_base_proofs.proof_type IS 'Tipo: case, numero, cliente_referencia, certificacao, tempo_mercado';
COMMENT ON COLUMN public.knowledge_base_proofs.text IS 'Texto da prova (max 500 chars)';
COMMENT ON COLUMN public.knowledge_base_proofs.sector IS 'Setor opcional ao qual a prova se refere (max 100 chars)';
COMMENT ON COLUMN public.knowledge_base_proofs.is_authorized IS 'Só provas autorizadas entram em authorized_proofs nos prompts (default false)';
COMMENT ON COLUMN public.knowledge_base_proofs.created_at IS 'Proof creation timestamp';
COMMENT ON COLUMN public.knowledge_base_proofs.updated_at IS 'Last update timestamp';
