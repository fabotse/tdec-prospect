-- Migration: Create opportunity_configs table
-- Story: 10.1 - Schema de Tracking e Tipos
-- AC: #2 - opportunity_configs table with defaults and UNIQUE constraint
-- AC: #3 - RLS policies filtering by tenant_id

-- ============================================
-- OPPORTUNITY_CONFIGS TABLE
-- ============================================

CREATE TABLE public.opportunity_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  min_opens INTEGER NOT NULL DEFAULT 3,
  period_days INTEGER NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE constraint: one config per campaign
ALTER TABLE public.opportunity_configs
  ADD CONSTRAINT uq_opportunity_configs_campaign
  UNIQUE (campaign_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.opportunity_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant opportunity configs"
  ON public.opportunity_configs FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert opportunity configs to their tenant"
  ON public.opportunity_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant opportunity configs"
  ON public.opportunity_configs FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant opportunity configs"
  ON public.opportunity_configs FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());
