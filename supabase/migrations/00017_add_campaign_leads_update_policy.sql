-- supabase/migrations/00017_add_campaign_leads_update_policy.sql
-- Story 5.1 Code Review Fix: Add missing UPDATE policy for campaign_leads
-- Allows updating campaign_lead records for tenant's campaigns

-- Add UPDATE RLS Policy for campaign_leads (via campaign's tenant)
CREATE POLICY "Users can update campaign_leads for their tenant"
    ON public.campaign_leads FOR UPDATE
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    )
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- Comment
COMMENT ON POLICY "Users can update campaign_leads for their tenant" ON public.campaign_leads
    IS 'Allows updating campaign_lead records for campaigns belonging to users tenant';
