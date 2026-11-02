-- Migration: Add email_status column to leads
-- Epic: 24 - Agente TDec 3.0 — Analista de Contas
-- Story: 24.12 - Status do e-mail visível na revisão (sem custo e sem trava)
--
-- O enrichment do Apollo (`/v1/people/match`, já pago) devolve `email_status`. O código
-- normaliza em verified / invalid / unknown e grava nesta coluna num UPDATE à parte e
-- best-effort (antes desta migration o UPDATE falha, só loga, e o enrichment / a
-- persistência do agente seguem normalmente). NULL = status nunca consultado.
-- O status é só informativo: não filtra nem bloqueia o export.
--
-- SOMENTE ADITIVA: uma coluna nullable + CHECK na coluna nova. Não toca nenhuma linha
-- existente (todas ficam NULL, e NULL passa no CHECK). Idempotente (ADD COLUMN IF NOT
-- EXISTS): banco do cliente é gerido à mão, sem migration tracking (ver 00053/00055).
--
-- NÃO APLICAR sem o OK do Fabossi.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_status TEXT NULL
    CONSTRAINT leads_email_status_check CHECK (email_status IN ('verified', 'invalid', 'unknown'));

COMMENT ON COLUMN public.leads.email_status IS 'Story 24.12: status do e-mail no Apollo (verified/invalid/unknown). NULL = nunca consultado';
