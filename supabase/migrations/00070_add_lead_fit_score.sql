-- Migration: Add Fit Score columns to leads
-- Epic: 24 - Agente TDec 3.0 — Analista de Contas
-- Story: 24.16 - Fit Score A/B/C com justificativa
--
-- O step `search_leads` do agente da a cada lead uma nota A/B/C com justificativa de
-- 1 linha. O lead aprovado leva o score até `persistApprovedLeads`, que o grava nestas
-- colunas num UPDATE à parte e best-effort (antes desta migration o UPDATE falha, só
-- loga, e a criação de campanha segue normalmente).
--
-- SOMENTE ADITIVA: três colunas nullable + CHECK na coluna nova. Não toca nenhuma
-- linha existente (todas ficam NULL). Idempotente (ADD COLUMN IF NOT EXISTS): banco do
-- cliente é gerido à mão, sem migration tracking (ver 00053/00055).
--
-- NÃO APLICAR sem o OK do Fabossi.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fit_score TEXT NULL
    CONSTRAINT leads_fit_score_check CHECK (fit_score IN ('A', 'B', 'C'));

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fit_reason TEXT NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fit_scored_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.leads.fit_score IS 'Story 24.16: Fit Score do agente (A/B/C). NULL = não pontuado';
COMMENT ON COLUMN public.leads.fit_reason IS 'Story 24.16: justificativa de 1 linha do Fit Score';
COMMENT ON COLUMN public.leads.fit_scored_at IS 'Story 24.16: quando o Fit Score foi gravado';
