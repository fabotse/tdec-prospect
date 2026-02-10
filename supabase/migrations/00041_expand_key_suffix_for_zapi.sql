-- Migration: Add Z-API to api_configs + expand key_suffix for multi-field credentials
-- Story: 11.1 - Z-API Integration Service + Config
--
-- Two changes:
-- 1. Add 'zapi' to service_name CHECK constraint
-- 2. Expand key_suffix from VARCHAR(4) to VARCHAR(200) for JSON-encoded multi-field suffixes
--
-- Z-API stores 3 credentials (instanceId, instanceToken, securityToken).
-- The key_suffix for Z-API is a JSON string with last 4 chars of each field,
-- e.g. {"instanceId":"abcd","instanceToken":"efgh","securityToken":"ijkl"}
-- which exceeds the original VARCHAR(4) limit.

-- 1. Drop existing service_name constraint
ALTER TABLE public.api_configs
DROP CONSTRAINT IF EXISTS api_configs_service_name_check;

-- 2. Add new constraint with zapi
ALTER TABLE public.api_configs
ADD CONSTRAINT api_configs_service_name_check
CHECK (service_name IN ('apollo', 'signalhire', 'snovio', 'instantly', 'openai', 'apify', 'zapi'));

-- 3. Expand key_suffix for JSON multi-field suffixes
ALTER TABLE public.api_configs
ALTER COLUMN key_suffix TYPE VARCHAR(200);

-- 4. Update comments
COMMENT ON COLUMN public.api_configs.service_name IS 'Integration service: apollo, signalhire, snovio, instantly, openai, apify, zapi';
COMMENT ON COLUMN public.api_configs.key_suffix IS 'Last 4 characters of API key for verification. For multi-field services (Z-API), stores JSON with per-field suffixes.';
