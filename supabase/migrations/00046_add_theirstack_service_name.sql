-- Migration: Add theirStack to api_configs service_name constraint
-- Story: 15.1 - Integracao theirStack: Configuracao, Teste e Credits
--
-- Adds 'theirstack' to the CHECK constraint on service_name column.

-- 1. Drop existing service_name constraint
ALTER TABLE public.api_configs
DROP CONSTRAINT IF EXISTS api_configs_service_name_check;

-- 2. Add new constraint with theirstack
ALTER TABLE public.api_configs
ADD CONSTRAINT api_configs_service_name_check
CHECK (service_name IN ('apollo', 'signalhire', 'snovio', 'instantly', 'openai', 'apify', 'zapi', 'theirstack'));

-- 3. Update comment
COMMENT ON COLUMN public.api_configs.service_name IS 'Integration service: apollo, signalhire, snovio, instantly, openai, apify, zapi, theirstack';
