-- Migration: Add Apify to api_configs service_name constraint
-- Story: 6.5.1 - Apify Integration Configuration
--
-- This migration extends the service_name check constraint to include 'apify'
-- for LinkedIn post extraction (icebreaker generation) features.

-- 1. Drop existing constraint
ALTER TABLE public.api_configs
DROP CONSTRAINT IF EXISTS api_configs_service_name_check;

-- 2. Add new constraint with apify
ALTER TABLE public.api_configs
ADD CONSTRAINT api_configs_service_name_check
CHECK (service_name IN ('apollo', 'signalhire', 'snovio', 'instantly', 'openai', 'apify'));

-- 3. Update column comment
COMMENT ON COLUMN public.api_configs.service_name IS 'Integration service: apollo, signalhire, snovio, instantly, openai, apify';
