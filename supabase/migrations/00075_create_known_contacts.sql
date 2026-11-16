-- Migration: Create known_contacts (contatos conhecidos por tenant)
-- Epic: 25 - Radar de Oportunidades
-- Story: 25.1 - Contatos conhecidos
--
-- Pessoas com quem a TDec já tem relacionamento (cliente atual, ex-cliente, parceiro, ou
-- lead com reunião marcada vindo de uma oportunidade). Esta story só cadastra: nenhum job
-- lê a tabela ainda (o acompanhamento de mudança de empresa é a 25.2).
--
-- SOMENTE ADITIVA: uma tabela nova, seus índices, seu trigger de updated_at, suas policies
-- e comments. Nenhum objeto existente é alterado e nenhuma linha existente é tocada.
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS antes de
-- criar): banco do cliente é gerido à mão, sem migration tracking (ver 00053/00055).
--
-- NÃO APLICAR sem o OK do Fabossi.
--
-- PRE-CHECK (rodar antes, no SQL Editor):
--   SELECT to_regclass('public.known_contacts');                -- esperado: NULL
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('get_current_tenant_id', 'is_admin',
--                      'update_updated_at_column');            -- esperado: as 3 funções
--   SELECT to_regclass('public.leads'), to_regclass('public.profiles'),
--          to_regclass('public.tenants');                       -- esperado: as 3 tabelas
--
-- IMPACTO: nenhum para o cliente. Sem a tabela, a página Radar → Contatos conhecidos
-- mostra erro com "Tentar novamente" e o botão "Contato conhecido" do card de oportunidade
-- mostra toast de erro; o resto do app segue igual. Busca, import de leads, campanhas,
-- export/ativação no Instantly, webhook e reply-sweep não leem a tabela. As FKs para
-- `leads` e `profiles` são ON DELETE SET NULL: apagar um lead ou perfil não falha por
-- causa desta tabela.
--
-- ROLLBACK (apaga os contatos cadastrados):
--   DROP TABLE IF EXISTS public.known_contacts;

-- ============================================
-- 1. TABELA
-- ============================================
CREATE TABLE IF NOT EXISTS public.known_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL
    CONSTRAINT known_contacts_full_name_check CHECK (btrim(full_name) <> ''),
  title TEXT NULL,
  company_name TEXT NULL,
  company_domain TEXT NULL,
  linkedin_url TEXT NULL,
  relation_type TEXT NOT NULL
    CONSTRAINT known_contacts_relation_type_check CHECK (
      relation_type IN ('cliente_atual', 'ex_cliente', 'parceiro', 'reuniao_marcada')
    ),
  source TEXT NOT NULL DEFAULT 'manual'
    CONSTRAINT known_contacts_source_check CHECK (
      source IN ('manual', 'import_csv', 'oportunidade')
    ),
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT known_contacts_company_check CHECK (
    company_name IS NOT NULL OR company_domain IS NOT NULL
  )
);

-- ============================================
-- 2. ÍNDICES
-- ============================================
-- Um LinkedIn por tenant (contatos sem LinkedIn não colidem).
CREATE UNIQUE INDEX IF NOT EXISTS known_contacts_tenant_linkedin_key
  ON public.known_contacts (tenant_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL;

-- Um contato por lead (o 1-clique da oportunidade é idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS known_contacts_tenant_lead_key
  ON public.known_contacts (tenant_id, lead_id)
  WHERE lead_id IS NOT NULL;

-- Listagem por tenant, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS idx_known_contacts_tenant_created
  ON public.known_contacts (tenant_id, created_at DESC);

-- ============================================
-- 3. TRIGGER updated_at (função já existente, só é usada)
-- ============================================
DROP TRIGGER IF EXISTS update_known_contacts_updated_at ON public.known_contacts;
CREATE TRIGGER update_known_contacts_updated_at
  BEFORE UPDATE ON public.known_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 4. RLS (somente a tabela nova)
-- Leitura: qualquer membro do tenant (SDR consulta).
-- Escrita: só admin (gestor/diretor).
-- ============================================
ALTER TABLE public.known_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view own known contacts" ON public.known_contacts;
CREATE POLICY "Tenant members can view own known contacts"
  ON public.known_contacts
  FOR SELECT
  USING (
    tenant_id = public.get_current_tenant_id()
  );

DROP POLICY IF EXISTS "Admins can insert known contacts" ON public.known_contacts;
CREATE POLICY "Admins can insert known contacts"
  ON public.known_contacts
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update own known contacts" ON public.known_contacts;
CREATE POLICY "Admins can update own known contacts"
  ON public.known_contacts
  FOR UPDATE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  )
  WITH CHECK (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete own known contacts" ON public.known_contacts;
CREATE POLICY "Admins can delete own known contacts"
  ON public.known_contacts
  FOR DELETE
  USING (
    tenant_id = public.get_current_tenant_id()
    AND public.is_admin()
  );

-- ============================================
-- 5. COMMENTS
-- ============================================
COMMENT ON TABLE public.known_contacts IS 'Story 25.1: contatos conhecidos (pessoas com relacionamento com a TDec), por tenant';
COMMENT ON COLUMN public.known_contacts.full_name IS 'Nome completo (aparado no servidor)';
COMMENT ON COLUMN public.known_contacts.company_domain IS 'Domínio normalizado (minúsculo, sem protocolo/www/caminho)';
COMMENT ON COLUMN public.known_contacts.linkedin_url IS 'https://www.linkedin.com/in/<slug> normalizado (slug minúsculo); NULL se desconhecido';
COMMENT ON COLUMN public.known_contacts.relation_type IS 'Relação: cliente_atual, ex_cliente, parceiro, reuniao_marcada';
COMMENT ON COLUMN public.known_contacts.source IS 'Origem: manual, import_csv, oportunidade';
COMMENT ON COLUMN public.known_contacts.lead_id IS 'Lead de origem (1-clique da oportunidade); NULL se removido ou cadastro manual';
COMMENT ON COLUMN public.known_contacts.created_by IS 'Perfil que cadastrou (NULL se removido)';
