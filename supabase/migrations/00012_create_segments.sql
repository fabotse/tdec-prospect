-- Story 4.1: Lead Segments/Lists
-- Migration: 00012_create_segments.sql
-- Creates segments and lead_segments tables with RLS policies

-- 1. Create segments table
CREATE TABLE IF NOT EXISTS public.segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: unique name per tenant
    CONSTRAINT unique_segment_name_per_tenant UNIQUE (tenant_id, name)
);

-- 2. Create lead_segments junction table
CREATE TABLE IF NOT EXISTS public.lead_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: lead can only be in a segment once
    CONSTRAINT unique_lead_per_segment UNIQUE (segment_id, lead_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_segments_tenant_id ON public.segments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_segments_name ON public.segments(name);
CREATE INDEX IF NOT EXISTS idx_lead_segments_segment_id ON public.lead_segments(segment_id);
CREATE INDEX IF NOT EXISTS idx_lead_segments_lead_id ON public.lead_segments(lead_id);

-- 4. Trigger for updated_at
DROP TRIGGER IF EXISTS update_segments_updated_at ON public.segments;
CREATE TRIGGER update_segments_updated_at
    BEFORE UPDATE ON public.segments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Enable RLS
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_segments ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for segments
CREATE POLICY "Users can view their tenant segments"
    ON public.segments FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert segments to their tenant"
    ON public.segments FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant segments"
    ON public.segments FOR UPDATE
    USING (tenant_id = public.get_current_tenant_id())
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant segments"
    ON public.segments FOR DELETE
    USING (tenant_id = public.get_current_tenant_id());

-- 7. RLS Policies for lead_segments (via segment's tenant)
CREATE POLICY "Users can view lead_segments for their tenant"
    ON public.lead_segments FOR SELECT
    USING (
        segment_id IN (
            SELECT id FROM public.segments
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can insert lead_segments for their tenant"
    ON public.lead_segments FOR INSERT
    WITH CHECK (
        segment_id IN (
            SELECT id FROM public.segments
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can delete lead_segments for their tenant"
    ON public.lead_segments FOR DELETE
    USING (
        segment_id IN (
            SELECT id FROM public.segments
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- 8. Comments
COMMENT ON TABLE public.segments IS 'User-defined segments for organizing leads';
COMMENT ON TABLE public.lead_segments IS 'Junction table linking leads to segments';
COMMENT ON COLUMN public.segments.name IS 'Segment name, unique per tenant';
