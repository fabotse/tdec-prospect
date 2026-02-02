-- Migration: 00013_create_lead_interactions.sql
-- Story: 4.3 - Lead Detail View & Interaction History
-- Purpose: Create lead_interactions table for tracking user interactions with leads

-- Interaction types enum
DO $$ BEGIN
    CREATE TYPE interaction_type AS ENUM ('note', 'status_change', 'import', 'campaign_sent', 'campaign_reply');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Lead interactions table
CREATE TABLE IF NOT EXISTS public.lead_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type interaction_type NOT NULL DEFAULT 'note',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON public.lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_tenant_id ON public.lead_interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON public.lead_interactions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant isolation
CREATE POLICY "Users can view their tenant interactions"
    ON public.lead_interactions FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert interactions to their tenant"
    ON public.lead_interactions FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

-- Grant permissions to authenticated users
GRANT SELECT, INSERT ON public.lead_interactions TO authenticated;
