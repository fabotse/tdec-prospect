-- Migration: Lead Monitoring Schema
-- Story: 13.1 - Schema de Monitoramento e Tipos
-- AC: #1-#5

-- ============================================
-- ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.insight_status AS ENUM ('new', 'used', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.monitoring_frequency AS ENUM ('weekly', 'biweekly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- ALTER TABLE: leads — adicionar is_monitored
-- ============================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_monitored BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- TABLE: lead_insights
-- ============================================

CREATE TABLE public.lead_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  post_url TEXT NOT NULL,
  post_text TEXT NOT NULL,
  post_published_at TIMESTAMPTZ,
  relevance_reasoning TEXT,
  suggestion TEXT,
  status public.insight_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TABLE: monitoring_configs
-- ============================================

CREATE TABLE public.monitoring_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  frequency public.monitoring_frequency NOT NULL DEFAULT 'weekly',
  max_monitored_leads INTEGER NOT NULL DEFAULT 100,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_monitoring_config_per_tenant UNIQUE (tenant_id)
);

-- ============================================
-- TRIGGERS: updated_at
-- ============================================

CREATE TRIGGER update_lead_insights_updated_at
  BEFORE UPDATE ON public.lead_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_monitoring_configs_updated_at
  BEFORE UPDATE ON public.monitoring_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_leads_is_monitored
  ON public.leads(is_monitored)
  WHERE is_monitored = true;

CREATE INDEX idx_lead_insights_tenant_status
  ON public.lead_insights(tenant_id, status);

CREATE INDEX idx_lead_insights_lead_id
  ON public.lead_insights(lead_id);

-- ============================================
-- RLS POLICIES: lead_insights
-- ============================================

ALTER TABLE public.lead_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant lead_insights"
  ON public.lead_insights FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert lead_insights to their tenant"
  ON public.lead_insights FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant lead_insights"
  ON public.lead_insights FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant lead_insights"
  ON public.lead_insights FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());

-- ============================================
-- RLS POLICIES: monitoring_configs
-- ============================================

ALTER TABLE public.monitoring_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant monitoring_configs"
  ON public.monitoring_configs FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert monitoring_configs to their tenant"
  ON public.monitoring_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant monitoring_configs"
  ON public.monitoring_configs FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant monitoring_configs"
  ON public.monitoring_configs FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());
