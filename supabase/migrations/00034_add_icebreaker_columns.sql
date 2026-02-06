-- Migration: Add icebreaker columns to leads table
-- Story: 6.5.4 - Lead Icebreaker Database Schema
-- AC #1: New Columns in Leads Table
-- AC #5: Migration Idempotent

-- Add icebreaker column (the generated icebreaker text)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS icebreaker TEXT;

-- Add icebreaker_generated_at column (when icebreaker was generated)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS icebreaker_generated_at TIMESTAMPTZ;

-- Add linkedin_posts_cache column (cached posts data for reference/debugging)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS linkedin_posts_cache JSONB;

-- Create partial index on icebreaker_generated_at for filtering leads with icebreakers
-- Partial index (WHERE IS NOT NULL) optimizes queries like "leads with icebreakers" or "freshness checks"
-- and saves space by not indexing leads without icebreakers
CREATE INDEX IF NOT EXISTS idx_leads_icebreaker_generated_at
ON public.leads (icebreaker_generated_at)
WHERE icebreaker_generated_at IS NOT NULL;

-- Column comments for documentation
COMMENT ON COLUMN public.leads.icebreaker IS 'Story 6.5.4: Generated icebreaker text from LinkedIn posts analysis';
COMMENT ON COLUMN public.leads.icebreaker_generated_at IS 'Story 6.5.4: Timestamp when icebreaker was generated (for freshness/caching)';
COMMENT ON COLUMN public.leads.linkedin_posts_cache IS 'Story 6.5.4: Cached LinkedIn posts JSON used for icebreaker generation (for reference/debugging)';
