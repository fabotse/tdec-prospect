-- Migration: Create leads table for lead management
-- Story: 3.1 - Leads Page & Data Model
-- AC: #3 - Leads table with specified columns
-- AC: #4 - RLS policies for tenant isolation

-- 1. Create lead_status enum
DO $$ BEGIN
    CREATE TYPE lead_status AS ENUM ('novo', 'em_campanha', 'interessado', 'oportunidade', 'nao_interessado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    apollo_id TEXT,  -- External ID from Apollo API
    first_name TEXT NOT NULL,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    company_name TEXT,
    company_size TEXT,  -- e.g., "11-50", "51-200"
    industry TEXT,
    location TEXT,
    title TEXT,  -- Job title
    linkedin_url TEXT,
    status lead_status NOT NULL DEFAULT 'novo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON public.leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_apollo_id ON public.leads(apollo_id);

-- 4. Create unique constraint for apollo_id per tenant (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_apollo_unique
    ON public.leads(tenant_id, apollo_id)
    WHERE apollo_id IS NOT NULL;

-- 5. Create trigger for updated_at (uses existing function from migration 00001)
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- SELECT: Users can only view leads from their tenant
CREATE POLICY "Users can view their tenant leads"
    ON public.leads FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

-- INSERT: Users can only insert leads for their tenant
CREATE POLICY "Users can insert leads to their tenant"
    ON public.leads FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

-- UPDATE: Users can only update leads from their tenant
CREATE POLICY "Users can update their tenant leads"
    ON public.leads FOR UPDATE
    USING (tenant_id = public.get_current_tenant_id())
    WITH CHECK (tenant_id = public.get_current_tenant_id());

-- DELETE: Users can only delete leads from their tenant
CREATE POLICY "Users can delete their tenant leads"
    ON public.leads FOR DELETE
    USING (tenant_id = public.get_current_tenant_id());

-- 8. Comments
COMMENT ON TABLE public.leads IS 'Leads imported from Apollo or manually created';
COMMENT ON COLUMN public.leads.apollo_id IS 'External ID from Apollo API for deduplication';
COMMENT ON COLUMN public.leads.status IS 'Lead status in the outreach process';
COMMENT ON COLUMN public.leads.company_size IS 'Company size range e.g. 11-50, 51-200';
COMMENT ON COLUMN public.leads.title IS 'Job title of the lead';
