-- Migration: Add product_id column to campaigns table
-- Story: 6.5 - Campaign Product Context
-- AC: #6 - Database Migration

-- ============================================
-- 1. ADD PRODUCT_ID COLUMN
-- ============================================
-- Nullable FK to products table
-- ON DELETE SET NULL: if product is deleted, campaigns keep working with general context
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- ============================================
-- 2. CREATE INDEX FOR JOIN PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_campaigns_product_id ON public.campaigns(product_id);

-- ============================================
-- 3. ADD DOCUMENTATION
-- ============================================
COMMENT ON COLUMN public.campaigns.product_id IS
  'Optional product context for AI-generated content. NULL means use general company context.';
