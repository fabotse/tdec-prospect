-- Migration: Tornar whatsapp_messages.campaign_id NULLABLE
-- Story: 13.11 - Fix — Envio de WhatsApp a partir do Insight (campaign_id NOT NULL)
-- AC: #1 - campaign_id nullable, FK preservada, migration idempotente/defensiva
--
-- 🔴 BUG DE PRODUÇÃO CONFIRMADO (2026-07-14, banco real do cliente: is_nullable = NO).
--
-- O schema foi modelado para um caso de uso e reusado por outro sem ajuste:
--   1. Epic 11 (11.2 / 00042:35) criou a tabela para envios DE CAMPANHA:
--        campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE
--   2. Epic 13 (13.7) reusou a MESMA tabela para o envio A PARTIR DE UM INSIGHT —
--      um fluxo que, por natureza, NÃO tem campanha (o insight vem do monitoramento
--      de posts do LinkedIn, não de uma sequência de e-mail). `sendWhatsAppFromInsight`
--      insere `campaign_id: null` [src/actions/whatsapp.ts] → viola NOT NULL → 23502.
--   3. O erro caía num early-return genérico ("Erro ao registrar mensagem.") e nunca
--      era logado → a feature 13.7 foi entregue, passou por code-review adversarial
--      e NUNCA funcionou em produção (100% das tentativas falhavam).
--
-- O `null` da 13.7 está SEMANTICAMENTE CORRETO — não existe campanha para vincular.
-- Quem está errado é o NOT NULL, que codifica uma premissa do Epic 11 ("toda mensagem
-- WhatsApp nasce de uma campanha") que deixou de valer no Epic 13. Fix = afrouxar a
-- coluna, não inventar uma campanha (dado falso poluiria as métricas por campanha —
-- idx_whatsapp_messages_campaign_status [00042:74-75], stats agregadas da 11.7).
--
-- ESCOPO CIRÚRGICO — o que esta migration NÃO faz:
--   • NÃO toca a FK: `REFERENCES campaigns(id) ON DELETE CASCADE` permanece. NULL é
--     permitido por FK; um valor PREENCHIDO continua tendo que existir em `campaigns`.
--   • NÃO toca a UNIQUE `uq_whatsapp_messages_idempotency (campaign_id, lead_id,
--     external_message_id)` [00042:86-88]. Em Postgres, NULL não conflita com NULL —
--     mas isso não é perda: a constraint já era inefetiva no insert, pois
--     `external_message_id` só existe DEPOIS do envio (a linha nasce `pending` com
--     external_message_id NULL). A tupla no momento do insert já continha NULL.
--   • NÃO afrouxa `lead_id`/`tenant_id` — o afrouxamento é SÓ de `campaign_id`.
--
-- IDEMPOTÊNCIA: `DROP NOT NULL` é no-op numa coluna já nullable. A guarda
-- `to_regclass` (padrão 00053) protege bancos cujo histórico não criou a tabela —
-- o banco do cliente é gerido à mão e pode ter drift de schema.

DO $$
BEGIN
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_messages
      ALTER COLUMN campaign_id DROP NOT NULL;

    COMMENT ON COLUMN public.whatsapp_messages.campaign_id IS
      'Campanha de origem. NULL quando a mensagem não nasce de uma campanha (ex.: envio a partir de um insight do LinkedIn — Story 13.7).';
  END IF;
END $$;
