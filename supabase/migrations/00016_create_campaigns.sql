-- supabase/migrations/00016_create_campaigns.sql
-- Story 5.1: Campaigns Page & Data Model
-- Creates campaigns and campaign_leads tables with RLS

-- 1. Create campaign_status enum
DO $$ BEGIN
    CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    status campaign_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create campaign_leads junction table
CREATE TABLE IF NOT EXISTS public.campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: lead can only be in a campaign once
    CONSTRAINT unique_lead_per_campaign UNIQUE (campaign_id, lead_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON public.campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_id ON public.campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead_id ON public.campaign_leads(lead_id);

-- 5. Trigger for updated_at
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON public.campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for campaigns
CREATE POLICY "Users can view their tenant campaigns"
    ON public.campaigns FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert campaigns to their tenant"
    ON public.campaigns FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant campaigns"
    ON public.campaigns FOR UPDATE
    USING (tenant_id = public.get_current_tenant_id())
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant campaigns"
    ON public.campaigns FOR DELETE
    USING (tenant_id = public.get_current_tenant_id());

-- 8. RLS Policies for campaign_leads (via campaign's tenant)
CREATE POLICY "Users can view campaign_leads for their tenant"
    ON public.campaign_leads FOR SELECT
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can insert campaign_leads for their tenant"
    ON public.campaign_leads FOR INSERT
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can delete campaign_leads for their tenant"
    ON public.campaign_leads FOR DELETE
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- 9. Comments
COMMENT ON TABLE public.campaigns IS 'Email campaign sequences for outreach';
COMMENT ON TABLE public.campaign_leads IS 'Junction table linking campaigns to leads';
COMMENT ON COLUMN public.campaigns.status IS 'Campaign status: draft, active, paused, completed';
