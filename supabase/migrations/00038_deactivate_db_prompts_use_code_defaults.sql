-- Migration: Deactivate all global DB prompts — use code defaults (defaults.ts)
--
-- PROBLEMA: Os prompts no DB estavam desatualizados em relação ao defaults.ts,
-- especialmente os de follow-up (00030) que recomendavam "Dando continuidade..."
-- e não tinham as variáveis novas (follow_up_strategy, sequence_position, etc.).
--
-- SOLUÇÃO: Desativar todos os prompts globais do DB. O PromptManager vai usar
-- o fallback Level 3 (code defaults em src/lib/ai/prompts/defaults.ts).
--
-- FUTURO: Quando houver UI de admin para edição de prompts, criar nova migration
-- que re-insere os prompts atualizados no DB (Level 2).
--
-- Nota: Prompts tenant-specific (se existirem) NÃO são afetados.

-- Deactivate ALL global prompts (tenant_id IS NULL)
UPDATE public.ai_prompts
SET is_active = false,
    updated_at = NOW()
WHERE tenant_id IS NULL
  AND is_active = true;

-- Comment for documentation
COMMENT ON TABLE public.ai_prompts IS 'AI prompt templates. Migration 00038: Global prompts deactivated — code defaults in src/lib/ai/prompts/defaults.ts are the source of truth.';
