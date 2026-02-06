-- Migration: Create ai_prompts table for centralized prompt management
-- Story: 6.1 - AI Provider Service Layer & Prompt Management System
-- AC: #3 - ai_prompts table schema per ADR-001

-- 1. Create ai_prompts table
CREATE TABLE IF NOT EXISTS public.ai_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL for global prompts
    prompt_key VARCHAR(100) NOT NULL,
    prompt_template TEXT NOT NULL,
    model_preference VARCHAR(50),
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    CONSTRAINT ai_prompts_tenant_key_version_unique UNIQUE(tenant_id, prompt_key, version)
);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_prompts_tenant_key_active
    ON public.ai_prompts(tenant_id, prompt_key, is_active);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_prompt_key
    ON public.ai_prompts(prompt_key);

-- 3. Create trigger for updated_at
DROP TRIGGER IF EXISTS update_ai_prompts_updated_at ON public.ai_prompts;
CREATE TRIGGER update_ai_prompts_updated_at
    BEFORE UPDATE ON public.ai_prompts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- SELECT: Users can view their tenant prompts AND global prompts (tenant_id IS NULL)
CREATE POLICY "Users can view their tenant and global prompts"
    ON public.ai_prompts FOR SELECT
    USING (
        tenant_id IS NULL
        OR tenant_id = public.get_current_tenant_id()
    );

-- INSERT: Only admins can insert prompts for their tenant
CREATE POLICY "Admins can insert prompts"
    ON public.ai_prompts FOR INSERT
    WITH CHECK (
        tenant_id = public.get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND tenant_id = public.get_current_tenant_id()
            AND role = 'admin'
        )
    );

-- UPDATE: Only admins can update their tenant prompts
CREATE POLICY "Admins can update their tenant prompts"
    ON public.ai_prompts FOR UPDATE
    USING (
        tenant_id = public.get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND tenant_id = public.get_current_tenant_id()
            AND role = 'admin'
        )
    )
    WITH CHECK (
        tenant_id = public.get_current_tenant_id()
    );

-- DELETE: Only admins can delete their tenant prompts
CREATE POLICY "Admins can delete their tenant prompts"
    ON public.ai_prompts FOR DELETE
    USING (
        tenant_id = public.get_current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND tenant_id = public.get_current_tenant_id()
            AND role = 'admin'
        )
    );

-- 6. Comments
COMMENT ON TABLE public.ai_prompts IS 'Centralized prompt management for AI text generation (ADR-001)';
COMMENT ON COLUMN public.ai_prompts.tenant_id IS 'NULL for global prompts, set for tenant-specific overrides';
COMMENT ON COLUMN public.ai_prompts.prompt_key IS 'Unique identifier for the prompt type (e.g., email_subject_generation)';
COMMENT ON COLUMN public.ai_prompts.prompt_template IS 'Prompt template text with {{variable}} placeholders';
COMMENT ON COLUMN public.ai_prompts.model_preference IS 'Preferred AI model for this prompt (e.g., gpt-4o-mini, claude-3-haiku)';
COMMENT ON COLUMN public.ai_prompts.version IS 'Version number for A/B testing and rollback';
COMMENT ON COLUMN public.ai_prompts.is_active IS 'Whether this prompt version is currently active';
COMMENT ON COLUMN public.ai_prompts.metadata IS 'Additional configuration (temperature, max_tokens, etc.)';
