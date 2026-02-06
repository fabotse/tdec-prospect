-- supabase/migrations/00019_create_delay_blocks.sql
-- Story 5.4: Delay Block Component
-- Creates delay_blocks table for storing delay intervals in campaign sequences

-- 1. Create delay_blocks table
CREATE TABLE IF NOT EXISTS public.delay_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    delay_value INTEGER NOT NULL DEFAULT 2,
    delay_unit VARCHAR(10) NOT NULL DEFAULT 'days' CHECK (delay_unit IN ('days', 'hours')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_delay_blocks_campaign_id ON public.delay_blocks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_delay_blocks_position ON public.delay_blocks(campaign_id, position);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS update_delay_blocks_updated_at ON public.delay_blocks;
CREATE TRIGGER update_delay_blocks_updated_at
    BEFORE UPDATE ON public.delay_blocks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.delay_blocks ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (via campaign's tenant)
CREATE POLICY "Users can view delay_blocks for their tenant"
    ON public.delay_blocks FOR SELECT
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can insert delay_blocks for their tenant"
    ON public.delay_blocks FOR INSERT
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can update delay_blocks for their tenant"
    ON public.delay_blocks FOR UPDATE
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

CREATE POLICY "Users can delete delay_blocks for their tenant"
    ON public.delay_blocks FOR DELETE
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- 6. Comments
COMMENT ON TABLE public.delay_blocks IS 'Delay interval blocks within campaign sequences';
COMMENT ON COLUMN public.delay_blocks.position IS 'Order position within the campaign sequence';
COMMENT ON COLUMN public.delay_blocks.delay_value IS 'Numeric value of the delay';
COMMENT ON COLUMN public.delay_blocks.delay_unit IS 'Unit of delay: days or hours';
