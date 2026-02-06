-- Migration: Add export tracking columns to campaigns table
-- Story: 7.3.1 - Persistência de Campanhas Exportadas no Banco
-- AC: #1 - Export tracking fields on campaigns table

-- ============================================
-- 1. ADD EXTERNAL_CAMPAIGN_ID COLUMN
-- ============================================
-- Nullable text: ID da campanha na plataforma remota
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS external_campaign_id TEXT NULL;

-- ============================================
-- 2. ADD EXPORT_PLATFORM COLUMN
-- ============================================
-- Nullable text with CHECK constraint: only 'instantly' or 'snovio' (remote platforms)
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS export_platform TEXT NULL
CONSTRAINT chk_campaigns_export_platform CHECK (export_platform IN ('instantly', 'snovio'));

-- ============================================
-- 3. ADD EXPORTED_AT COLUMN
-- ============================================
-- Nullable timestamptz: data/hora do último export
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ NULL;

-- ============================================
-- 4. ADD EXPORT_STATUS COLUMN
-- ============================================
-- Nullable text with CHECK constraint: valid export statuses
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS export_status TEXT NULL
CONSTRAINT chk_campaigns_export_status CHECK (export_status IN ('pending', 'success', 'partial_failure', 'failed'));

-- ============================================
-- 5. CREATE PARTIAL INDEX FOR LOOKUP
-- ============================================
-- Partial index: only indexes non-null external_campaign_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_campaigns_external_campaign_id
ON public.campaigns(external_campaign_id)
WHERE external_campaign_id IS NOT NULL;

-- ============================================
-- 6. DOCUMENTATION
-- ============================================
COMMENT ON COLUMN public.campaigns.external_campaign_id IS
  'ID of the campaign on the remote platform (Instantly or Snov.io). NULL for non-exported campaigns.';
COMMENT ON COLUMN public.campaigns.export_platform IS
  'Remote platform where campaign was exported: instantly or snovio. NULL for non-exported.';
COMMENT ON COLUMN public.campaigns.exported_at IS
  'Timestamp of the last export operation. NULL for non-exported campaigns.';
COMMENT ON COLUMN public.campaigns.export_status IS
  'Status of the last export: pending, success, partial_failure, or failed. NULL for non-exported.';

-- ============================================
-- 7. RLS VERIFICATION NOTE
-- ============================================
-- Existing RLS policies on campaigns are based on tenant_id.
-- New nullable columns do NOT affect RLS policies — no policy changes needed.
