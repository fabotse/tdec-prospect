-- Migration: Briefing de preparação de reunião na oportunidade
-- Epic: 24 - Agente TDec 3.0 — Analista de Contas
-- Story: 24.23 - Preparação de reunião (FR40)
--
-- O botão "Preparar reunião" da Central de Oportunidades gera um briefing de uma página
-- (resumo da conta, engajamento, pontos de conversa e objeções) e o guarda aqui, para que
-- reabrir o card não chame a LLM de novo. O formato é o contrato `MeetingPrep` versão 1
-- (src/types/meeting-prep.ts); a leitura no app é defensiva (jsonb fora do formato = null).
--
-- SOMENTE ADITIVA: uma coluna nullable, sem default. Nenhuma linha existente é tocada.
-- Idempotente (ADD COLUMN IF NOT EXISTS): banco do cliente é gerido à mão, sem migration
-- tracking.
--
-- NÃO APLICAR sem o OK do Fabossi.
--
-- PRE-CHECK (rodar antes, no SQL Editor):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'opportunities'
--      AND column_name = 'meeting_prep';                          -- esperado: 0 linhas
--
-- IMPACTO: nenhum para o cliente. O INSERT de oportunidades (ingestão de respostas e de
-- engajamento) não envia a coluna. Sem esta migration, o briefing é gerado e exibido, mas
-- não fica salvo (a rota responde `saved: false`). Webhook, reply-sweep, busca de leads,
-- export e ativação no Instantly não leem nem escrevem esta coluna.
--
-- ROLLBACK (apaga os briefings salvos):
--   ALTER TABLE public.opportunities DROP COLUMN IF EXISTS meeting_prep;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS meeting_prep JSONB;

COMMENT ON COLUMN public.opportunities.meeting_prep IS 'Story 24.23: briefing de preparação de reunião (MeetingPrep v1: conta, engajamento, pontos de conversa e objeções com origem). NULL = ainda não gerado';
