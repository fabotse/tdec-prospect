-- Migration: Create campaign_events table for tracking
-- Story: 10.1 - Schema de Tracking e Tipos
-- AC: #1 - campaign_events table with all columns, UNIQUE constraint, indexes
-- AC: #3 - RLS policies filtering by tenant_id

-- ============================================
-- CAMPAIGN_EVENTS TABLE
-- ============================================

CREATE TABLE public.campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  lead_email VARCHAR(255) NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  source VARCHAR(20) NOT NULL DEFAULT 'webhook',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE constraint for idempotency (ADR-003)
ALTER TABLE public.campaign_events
  ADD CONSTRAINT uq_campaign_events_idempotency
  UNIQUE (campaign_id, event_type, lead_email, event_timestamp);

-- Performance indexes
CREATE INDEX idx_campaign_events_campaign_id
  ON public.campaign_events(campaign_id);

CREATE INDEX idx_campaign_events_campaign_lead
  ON public.campaign_events(campaign_id, lead_email);

CREATE INDEX idx_campaign_events_campaign_type
  ON public.campaign_events(campaign_id, event_type);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant campaign events"
  ON public.campaign_events FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert campaign events to their tenant"
  ON public.campaign_events FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant campaign events"
  ON public.campaign_events FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant campaign events"
  ON public.campaign_events FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());
