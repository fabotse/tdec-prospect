-- Migration: Add key_suffix column for last 4 chars display
-- Story: 2.2 - API Keys Storage & Encryption (Code Review Fix)
-- AC: #4 - Only last 4 characters are shown for verification
--
-- This column stores the last 4 characters of the API key for display purposes.
-- Security: Only 4 chars exposed, not enough to compromise the key.

-- 1. Add key_suffix column (nullable for existing rows)
ALTER TABLE public.api_configs
ADD COLUMN IF NOT EXISTS key_suffix VARCHAR(4);

-- 2. Add comment for documentation
COMMENT ON COLUMN public.api_configs.key_suffix IS 'Last 4 characters of API key for user verification (AC #4)';
