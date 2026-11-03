-- Migration: Dossiê da conta (account_dossiers, account_dossier_facts, account_dossier_leads)
--            + serviço 'treg' nos CHECKs de service_name
-- Epic: 24 - Agente TDec 3.0 — Analista de Contas
-- Story: 24.19 - Dossiê da conta
--
-- O step `research_accounts` do agente monta, para cada conta aprovada, um dossiê de fatos
-- {fato, fonte_url, data, confianca} (site, notícias, vagas, tecnologias e posts do próprio
-- lead). Os fatos ficam reaproveitáveis por 30 dias (`expires_at`). A chave do Treg é por
-- tenant em `api_configs` (service_name = 'treg') e cada chamada vira uma linha em
-- `api_usage_logs` (service_name = 'treg').
--
-- SOMENTE ADITIVA:
--   - 3 tabelas novas, seus índices, policies e comments;
--   - DROP + ADD dos CHECKs `api_configs_service_name_check` e
--     `api_usage_logs_service_name_check` (mesmo modelo da 00046/00065), cada um com um
--     SUPERCONJUNTO da lista em produção. Nenhuma linha existente é tocada e todos os valores
--     já aceitos continuam válidos.
-- Idempotente (IF NOT EXISTS / DROP ... IF EXISTS antes de CREATE): banco do cliente é
-- gerido à mão, sem migration tracking.
--
-- NÃO APLICAR sem o OK do Fabossi.
--
-- PRE-CHECK (rodar antes, no SQL Editor):
--   SELECT to_regclass('public.account_dossiers');                -- esperado: NULL
--   SELECT to_regclass('public.account_dossier_facts');           -- esperado: NULL
--   SELECT to_regclass('public.account_dossier_leads');           -- esperado: NULL
--   SELECT proname FROM pg_proc WHERE proname = 'get_current_tenant_id';  -- esperado: 1 linha
--   -- Nenhum service_name fora da lista nova (esperado: 0 linhas nas duas):
--   SELECT DISTINCT service_name FROM public.api_configs
--    WHERE service_name NOT IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack','treg');
--   SELECT DISTINCT service_name FROM public.api_usage_logs
--    WHERE service_name NOT IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack','treg');
--
-- IMPACTO: nenhum para o cliente. Sem esta migration, o step "Pesquisa das Contas" segue
-- fail-open: a chave do Treg não pode ser salva (o CHECK recusa) e o step termina
-- `completed` com "pesquisa pulada"; se a chave existir mas as tabelas não, ele termina
-- `completed` com `flags.persistFailed`. Em nenhum caso a campanha, o export ou a ativação
-- no Instantly mudam. Webhook, reply-sweep, busca de leads e campanhas em andamento não
-- leem estas tabelas.
--
-- ROLLBACK (apaga os dossiês gravados; só se nada depender deles ainda):
--   DROP TABLE IF EXISTS public.account_dossier_leads;
--   DROP TABLE IF EXISTS public.account_dossier_facts;
--   DROP TABLE IF EXISTS public.account_dossiers;
--   -- Os CHECKs só voltam à lista anterior se não houver linha 'treg' (apagar antes as
--   -- linhas 'treg' de api_configs/api_usage_logs, com o OK do Fabossi):
--   ALTER TABLE public.api_configs DROP CONSTRAINT IF EXISTS api_configs_service_name_check;
--   ALTER TABLE public.api_configs ADD CONSTRAINT api_configs_service_name_check
--     CHECK (service_name IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack'));
--   ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_service_name_check;
--   ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_service_name_check
--     CHECK (service_name IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack'));

-- ============================================
-- 1. account_dossiers (um por conta pesquisada)
-- ============================================
CREATE TABLE IF NOT EXISTS public.account_dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_domain TEXT NOT NULL,
  company_name TEXT NULL,
  status TEXT NOT NULL
    CONSTRAINT account_dossiers_status_check CHECK (status IN ('complete', 'partial', 'empty')),
  failed_sources TEXT[] NOT NULL DEFAULT '{}',
  execution_id UUID NULL REFERENCES public.agent_executions(id) ON DELETE SET NULL,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reuso: dossiê mais recente do tenant para o domínio.
CREATE INDEX IF NOT EXISTS idx_account_dossiers_tenant_domain_expires
  ON public.account_dossiers (tenant_id, company_domain, expires_at DESC);

-- ============================================
-- 2. account_dossier_facts (fatos com fonte)
-- ============================================
CREATE TABLE IF NOT EXISTS public.account_dossier_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.account_dossiers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CONSTRAINT account_dossier_facts_kind_check CHECK (kind IN ('site', 'news', 'job', 'technology', 'post')),
  fato TEXT NOT NULL
    CONSTRAINT account_dossier_facts_fato_check CHECK (length(btrim(fato)) > 0),
  fonte_url TEXT NOT NULL
    CONSTRAINT account_dossier_facts_fonte_url_check CHECK (fonte_url ~ '^https?://'),
  data DATE NOT NULL,
  confianca TEXT NOT NULL
    CONSTRAINT account_dossier_facts_confianca_check CHECK (confianca IN ('baixa', 'media', 'alta')),
  lead_apollo_id TEXT NULL,
  lead_email TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_dossier_facts_dossier
  ON public.account_dossier_facts (dossier_id);

-- ============================================
-- 3. account_dossier_leads (leads da execução ligados ao dossiê)
-- ============================================
CREATE TABLE IF NOT EXISTS public.account_dossier_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES public.account_dossiers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  execution_id UUID NULL REFERENCES public.agent_executions(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_apollo_id TEXT NULL,
  lead_email TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_dossier_leads_identifier_check CHECK (
    lead_id IS NOT NULL OR lead_apollo_id IS NOT NULL OR lead_email IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_account_dossier_leads_dossier
  ON public.account_dossier_leads (dossier_id);
CREATE INDEX IF NOT EXISTS idx_account_dossier_leads_execution
  ON public.account_dossier_leads (execution_id);

-- ============================================
-- 4. RLS (somente as tabelas novas)
-- Leitura e escrita por qualquer membro do tenant: os steps do agente rodam com o client
-- de sessão, inclusive de SDR. Sem UPDATE nem DELETE: fato gravado não se edita, e o
-- dossiê expira pelo `expires_at`.
-- ============================================
ALTER TABLE public.account_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_dossier_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_dossier_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view own account dossiers" ON public.account_dossiers;
CREATE POLICY "Tenant members can view own account dossiers"
  ON public.account_dossiers
  FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant members can insert own account dossiers" ON public.account_dossiers;
CREATE POLICY "Tenant members can insert own account dossiers"
  ON public.account_dossiers
  FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant members can view own account dossier facts" ON public.account_dossier_facts;
CREATE POLICY "Tenant members can view own account dossier facts"
  ON public.account_dossier_facts
  FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant members can insert own account dossier facts" ON public.account_dossier_facts;
CREATE POLICY "Tenant members can insert own account dossier facts"
  ON public.account_dossier_facts
  FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant members can view own account dossier leads" ON public.account_dossier_leads;
CREATE POLICY "Tenant members can view own account dossier leads"
  ON public.account_dossier_leads
  FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Tenant members can insert own account dossier leads" ON public.account_dossier_leads;
CREATE POLICY "Tenant members can insert own account dossier leads"
  ON public.account_dossier_leads
  FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- ============================================
-- 5. Serviço 'treg' nos CHECKs de service_name (modelo 00046/00065)
-- ============================================
ALTER TABLE public.api_configs
DROP CONSTRAINT IF EXISTS api_configs_service_name_check;

ALTER TABLE public.api_configs
ADD CONSTRAINT api_configs_service_name_check
CHECK (service_name IN ('apollo', 'signalhire', 'snovio', 'instantly', 'openai', 'apify', 'zapi', 'theirstack', 'treg'));

ALTER TABLE public.api_usage_logs
DROP CONSTRAINT IF EXISTS api_usage_logs_service_name_check;

ALTER TABLE public.api_usage_logs
ADD CONSTRAINT api_usage_logs_service_name_check
CHECK (service_name IN ('apollo', 'signalhire', 'snovio', 'instantly', 'openai', 'apify', 'zapi', 'theirstack', 'treg'));

-- ============================================
-- 6. COMMENTS
-- ============================================
COMMENT ON TABLE public.account_dossiers IS 'Story 24.19: dossiê da conta (por tenant e domínio), reaproveitável até expires_at';
COMMENT ON COLUMN public.account_dossiers.status IS 'complete (fatos e nenhuma fonte falhou), partial (fatos e alguma fonte falhou), empty (sem fatos). Só complete é reaproveitado';
COMMENT ON COLUMN public.account_dossiers.failed_sources IS 'Fontes que falharam na pesquisa (site, news, jobs, posts)';
COMMENT ON COLUMN public.account_dossiers.cost_usd IS 'Custo Treg (US$) da pesquisa desta conta';
COMMENT ON TABLE public.account_dossier_facts IS 'Story 24.19: fatos do dossiê. Todo fato tem fonte http(s) e data; nada é inferido';
COMMENT ON COLUMN public.account_dossier_facts.kind IS 'site, news, job, technology ou post (post só da própria pessoa do lead)';
COMMENT ON COLUMN public.account_dossier_facts.data IS 'Data do fato (publicação) ou da coleta (site)';
COMMENT ON TABLE public.account_dossier_leads IS 'Story 24.19: leads de cada execução ligados ao dossiê da conta';
