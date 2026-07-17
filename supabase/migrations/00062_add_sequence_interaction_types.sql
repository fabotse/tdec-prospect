-- Migration: interaction_type — valores novos para o controle manual de sequência
-- Story: 21.9 - Controle Manual de Sequência por Lead (FR18)
--
-- Idempotente/defensiva (banco gerido à mão, sem migration tracking — ver 00053/00056):
-- `ADD VALUE IF NOT EXISTS` torna a reaplicação segura.
--
-- PORQUÊ: a 21.9 registra em `lead_interactions` as ações MANUAIS do usuário sobre a
-- sequência do Instantly (o `stop_on_reply` só cobre resposta por e-mail — quem responde
-- por outro canal, ex. WhatsApp, seguia recebendo follow-up):
--   - 'sequence_stopped' → usuário parou a sequência (POST /api/v2/leads/update-interest-status;
--     motivo "respondeu por outro canal" ou "não contactar mais");
--   - 'lead_removed'     → admin removeu o lead do Instantly (DELETE /api/v2/leads/{id};
--     dados locais preservados — só o Instantly é afetado).
--
-- Enum atual (00013): 'note','status_change','import','campaign_sent','campaign_reply'.
-- Postgres 15 (Supabase) aceita ALTER TYPE ... ADD VALUE dentro de transação.

ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'sequence_stopped';
ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'lead_removed';

COMMENT ON TYPE interaction_type IS
  'Tipos de interação com lead. sequence_stopped/lead_removed (21.9) = ações manuais do usuário sobre a sequência do Instantly.';
