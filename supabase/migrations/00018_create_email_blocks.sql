-- supabase/migrations/00018_create_email_blocks.sql
-- Story 5.3: Email Block Component
-- Creates email_blocks table for storing email content in campaign sequences

-- 1. Create email_blocks table
CREATE TABLE IF NOT EXISTS public.email_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    subject TEXT,
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_email_blocks_campaign_id ON public.email_blocks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_blocks_position ON public.email_blocks(campaign_id, position);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS update_email_blocks_updated_at ON public.email_blocks;
CREATE TRIGGER update_email_blocks_updated_at
    BEFORE UPDATE ON public.email_blocks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.email_blocks ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (via campaign's tenant)
CREATE POLICY "Users can view email_blocks for their tenant"
    ON public.email_blocks FOR SELECT
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can insert email_blocks for their tenant"
    ON public.email_blocks FOR INSERT
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can update email_blocks for their tenant"
    ON public.email_blocks FOR UPDATE
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

CREATE POLICY "Users can delete email_blocks for their tenant"
    ON public.email_blocks FOR DELETE
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- 6. Comments
COMMENT ON TABLE public.email_blocks IS 'Email content blocks within campaign sequences';
COMMENT ON COLUMN public.email_blocks.position IS 'Order position within the campaign sequence';
COMMENT ON COLUMN public.email_blocks.subject IS 'Email subject line';
COMMENT ON COLUMN public.email_blocks.body IS 'Email body content';
