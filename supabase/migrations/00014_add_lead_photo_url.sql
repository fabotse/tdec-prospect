-- Migration: Add photo_url to leads table
-- Story: 4.4.1 - Lead Data Enrichment
-- AC: #7 - Nova coluna photo_url para armazenar foto do lead obtida via Apollo

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN public.leads.photo_url IS 'URL da foto do lead obtida via Apollo People Enrichment';
