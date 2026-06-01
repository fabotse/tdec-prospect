-- Migration: Fix "TDEC" -> "TDec" branding no prompt global de quebra-gelo
-- Story: 19.2 - Padronizacao do nome "TDEC" -> "TDec" em toda a UI (FR2)
--
-- CONTEXTO: A migration 00033 inseriu o prompt global 'icebreaker_premium_generation'
-- (tenant_id IS NULL) com o exemplo "Na TDEC, ajudamos empresas...". O mesmo texto
-- existe no code default (src/lib/ai/prompts/defaults.ts), ja corrigido para "TDec"
-- nesta story.
--
-- NOTA: A migration 00038 desativou TODOS os prompts globais (is_active = false),
-- entao hoje o PromptManager usa o code default (Level 3). Logo esta correcao NAO
-- altera a saida renderizada no estado atual — ela garante PARIDADE: se o prompt
-- global for reativado no futuro, o texto ja estara com a grafia correta "TDec".
--
-- Migrations sao historico imutavel — por isso esta correcao vem como nova migration
-- (UPDATE), sem editar a 00033.
--
-- Idempotente: o filtro LIKE garante no-op se o texto ja estiver corrigido.

UPDATE public.ai_prompts
SET prompt_template = REPLACE(prompt_template, 'Na TDEC', 'Na TDec'),
    updated_at = NOW()
WHERE tenant_id IS NULL
  AND prompt_key = 'icebreaker_premium_generation'
  AND prompt_template LIKE '%Na TDEC%';
