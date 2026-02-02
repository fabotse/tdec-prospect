-- Migration: Create signalhire_lookups table
-- Story: 4.4.2 - SignalHire Callback Architecture
-- AC: #1 - Tabela de Lookups
--
-- Esta tabela armazena requisições de phone lookup do SignalHire e seus resultados.
-- O SignalHire usa um modelo async com callbacks, então precisamos persistir o estado.

-- ==============================================
-- TABLE: signalhire_lookups
-- ==============================================

CREATE TABLE IF NOT EXISTS public.signalhire_lookups (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Lead association (optional - pode ser lookup sem lead associado)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Request data
  identifier TEXT NOT NULL, -- LinkedIn URL ou email usado na busca
  request_id TEXT, -- ID retornado pelo SignalHire para tracking

  -- Status tracking
  -- pending: aguardando envio para SignalHire
  -- processing: SignalHire está processando
  -- success: telefone encontrado
  -- failed: erro no processamento
  -- not_found: lead não encontrado no SignalHire
  -- credits_exhausted: créditos esgotados
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'not_found', 'credits_exhausted')),

  -- Result data
  phone TEXT, -- Telefone encontrado (se sucesso)
  raw_response JSONB, -- Resposta completa do callback para debug
  error_message TEXT, -- Mensagem de erro (se falha)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================
-- INDEXES
-- ==============================================

-- Lookup by tenant (RLS and queries)
CREATE INDEX idx_signalhire_lookups_tenant_id
  ON public.signalhire_lookups(tenant_id);

-- Lookup by request_id (callback processing)
CREATE INDEX idx_signalhire_lookups_request_id
  ON public.signalhire_lookups(request_id)
  WHERE request_id IS NOT NULL;

-- Lookup by status (polling and monitoring)
CREATE INDEX idx_signalhire_lookups_status
  ON public.signalhire_lookups(status);

-- Lookup by lead_id (finding lookups for a lead)
CREATE INDEX idx_signalhire_lookups_lead_id
  ON public.signalhire_lookups(lead_id)
  WHERE lead_id IS NOT NULL;

-- Composite index for finding pending lookups by tenant
CREATE INDEX idx_signalhire_lookups_tenant_status
  ON public.signalhire_lookups(tenant_id, status);

-- ==============================================
-- TRIGGER: Auto-update updated_at
-- ==============================================

CREATE OR REPLACE FUNCTION update_signalhire_lookups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_signalhire_lookups_updated_at
  BEFORE UPDATE ON public.signalhire_lookups
  FOR EACH ROW
  EXECUTE FUNCTION update_signalhire_lookups_updated_at();

-- ==============================================
-- ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE public.signalhire_lookups ENABLE ROW LEVEL SECURITY;

-- Users can view their own tenant's lookups
CREATE POLICY "Users can view own tenant lookups"
  ON public.signalhire_lookups
  FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Users can insert lookups for their own tenant
CREATE POLICY "Users can insert own tenant lookups"
  ON public.signalhire_lookups
  FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Users can update their own tenant's lookups
CREATE POLICY "Users can update own tenant lookups"
  ON public.signalhire_lookups
  FOR UPDATE
  USING (tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Service role can do everything (needed for Edge Function callback)
CREATE POLICY "Service role has full access"
  ON public.signalhire_lookups
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ==============================================
-- COMMENTS
-- ==============================================

COMMENT ON TABLE public.signalhire_lookups IS
  'Armazena requisições de phone lookup do SignalHire e seus resultados. Usado para o fluxo async com callbacks.';

COMMENT ON COLUMN public.signalhire_lookups.identifier IS
  'LinkedIn URL ou email usado na busca. Enviado para SignalHire no campo items[].';

COMMENT ON COLUMN public.signalhire_lookups.request_id IS
  'ID retornado pelo SignalHire no header Request-Id. Usado para correlacionar callbacks.';

COMMENT ON COLUMN public.signalhire_lookups.status IS
  'Status do lookup: pending (aguardando), processing (SignalHire processando), success (encontrado), failed (erro), not_found (não encontrado), credits_exhausted (sem créditos).';

COMMENT ON COLUMN public.signalhire_lookups.raw_response IS
  'Resposta completa do callback do SignalHire em formato JSON. Útil para debug e auditoria.';
