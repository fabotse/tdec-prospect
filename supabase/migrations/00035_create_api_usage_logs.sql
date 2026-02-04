-- Migration: Create api_usage_logs table
-- Story: 6.5.8 - Apify Cost Tracking
-- AC: #1 - Usage Logging, #4 - Multi-Service Support, #5 - Cost Calculation
--
-- Esta tabela registra o uso de APIs externas (Apify, Apollo, SignalHire, etc.)
-- para monitoramento de custos e análise de uso por tenant.

-- ==============================================
-- TABLE: api_usage_logs
-- ==============================================

CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation (multi-tenancy)
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Service & Request Tracking
  service_name TEXT NOT NULL
    CHECK (service_name IN ('apify', 'apollo', 'signalhire', 'snovio', 'instantly')),
  request_type TEXT NOT NULL,  -- e.g., 'icebreaker_generation', 'linkedin_posts_fetch', 'people_search'
  external_request_id TEXT,    -- For correlation with external APIs (optional)

  -- Lead Association (optional - some operations may not be lead-specific)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Usage Metrics (service-specific)
  posts_fetched INTEGER,                   -- Apify: Number of LinkedIn posts returned
  estimated_cost DECIMAL(10, 4),           -- Calculated cost (e.g., $0.0030)

  -- Result Tracking
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,                      -- Error message if failed

  -- Debug Data
  raw_response JSONB,                      -- Full API response (optional, for debugging)
  metadata JSONB DEFAULT '{}',             -- Extra context (LinkedIn URL, settings, etc.)

  -- Performance Metrics
  duration_ms INTEGER,                     -- API call duration in milliseconds

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================
-- INDEXES
-- ==============================================

-- Primary tenant isolation index (RLS and queries)
CREATE INDEX idx_api_usage_logs_tenant_id
  ON public.api_usage_logs(tenant_id);

-- Composite index for tenant + service queries
CREATE INDEX idx_api_usage_logs_tenant_service
  ON public.api_usage_logs(tenant_id, service_name);

-- Index for time-based queries (monthly aggregations)
CREATE INDEX idx_api_usage_logs_created_at
  ON public.api_usage_logs(created_at DESC);

-- Composite index for aggregation queries (tenant + time range)
CREATE INDEX idx_api_usage_logs_tenant_created
  ON public.api_usage_logs(tenant_id, created_at DESC);

-- Index for lead association queries
CREATE INDEX idx_api_usage_logs_lead_id
  ON public.api_usage_logs(lead_id)
  WHERE lead_id IS NOT NULL;

-- Partial index for successful operations only (cost aggregations)
CREATE INDEX idx_api_usage_logs_success
  ON public.api_usage_logs(tenant_id, service_name, created_at)
  WHERE status = 'success';

-- ==============================================
-- ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own tenant's usage logs
CREATE POLICY "Users can view own tenant usage logs"
  ON public.api_usage_logs
  FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Users can insert usage logs for their own tenant
CREATE POLICY "Users can insert own tenant usage logs"
  ON public.api_usage_logs
  FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Service role has full access (needed for server-side operations)
CREATE POLICY "Service role has full access to usage logs"
  ON public.api_usage_logs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ==============================================
-- COMMENTS
-- ==============================================

COMMENT ON TABLE public.api_usage_logs IS
  'Registra o uso de APIs externas para monitoramento de custos e análise por tenant. Suporta: apify, apollo, signalhire, snovio, instantly.';

COMMENT ON COLUMN public.api_usage_logs.service_name IS
  'Nome do serviço externo: apify (icebreakers), apollo (search/enrichment), signalhire (phone lookup), snovio (export), instantly (export).';

COMMENT ON COLUMN public.api_usage_logs.request_type IS
  'Tipo da requisição. Ex: icebreaker_generation, linkedin_posts_fetch, people_search, phone_lookup, campaign_export.';

COMMENT ON COLUMN public.api_usage_logs.external_request_id IS
  'ID retornado pela API externa para correlação e debugging.';

COMMENT ON COLUMN public.api_usage_logs.posts_fetched IS
  'Número de posts do LinkedIn retornados (específico para Apify).';

COMMENT ON COLUMN public.api_usage_logs.estimated_cost IS
  'Custo estimado da operação. Para Apify: posts_fetched * $0.001 ($1 por 1000 posts).';

COMMENT ON COLUMN public.api_usage_logs.status IS
  'Status da operação: success (sucesso), failed (erro), partial (sucesso parcial).';

COMMENT ON COLUMN public.api_usage_logs.raw_response IS
  'Resposta completa da API em JSON. Útil para debugging e auditoria.';

COMMENT ON COLUMN public.api_usage_logs.metadata IS
  'Metadados extras: linkedinProfileUrl, deepScrape, postLimit, batchId, etc.';

COMMENT ON COLUMN public.api_usage_logs.duration_ms IS
  'Duração da chamada da API em milissegundos.';
