-- Migration: Notifications hardening (Loop de Resposta)
-- Epic: 21 - Loop de Resposta ("Pop-up do Lead")
-- Story: 21.7 - Notificações Proativas + Configurações
-- AC: #1/#2/#4 - marcador de idempotência do passe de notificação + imutabilidade de app_notifications
--
-- Idempotente/defensiva: banco do cliente é gerido à mão, sem migration tracking
-- (ver 00053/00055/00057). Reaplicar NÃO pode falhar → ADD COLUMN IF NOT EXISTS +
-- CREATE INDEX IF NOT EXISTS + CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
--
-- NÃO cria tabela nova: notification_settings e app_notifications já existem (00055).
-- NÃO redefine update_updated_at_column()/get_current_tenant_id() (apenas referencia).
--
-- Decisões (Dev Notes 21.7):
--   - notified_at NULLABLE: NULL = oportunidade ainda não avaliada pelo passe de
--     notificação (espelha o gate `intent IS NULL` da 21.3). Reset para NULL no upgrade
--     engagement→reply (reply-processor.ts) re-arma a opp para o passe reavaliar.
--   - Índice parcial (tenant_id, created_at) WHERE notified_at IS NULL: seleção barata
--     das pendentes pelo passe (espelha idx_app_notifications_tenant_unread da 00055).
--   - Trigger de imutabilidade: fecha o defer 21.1 ("app_notifications imutável exceto
--     read_at documentado mas não enforçado", deferred-work.md). A policy de UPDATE
--     (00055) só valida tenant_id — um usuário do tenant poderia reescrever type/payload
--     das próprias notificações. O trigger rejeita alteração de qualquer coluna != read_at.

-- ============================================
-- opportunities.notified_at (marcador de idempotência do passe de notificação)
-- ============================================

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.opportunities.notified_at IS 'Story 21.7: marca a oportunidade como já avaliada pelo passe de notificação (WhatsApp/in-app decididos 1×). NULL = ainda não notificada (espelha gate intent IS NULL da 21.3). Reset para NULL no upgrade engagement→reply (re-arma o WhatsApp do reply quente).';

-- Índice parcial para o passe: pendentes por tenant, mais antigas primeiro.
CREATE INDEX IF NOT EXISTS idx_opportunities_pending_notification
  ON public.opportunities(tenant_id, created_at) WHERE notified_at IS NULL;

-- ============================================
-- app_notifications imutável exceto read_at (fecha defer 21.1)
-- ============================================

-- Rejeita UPDATE que altere qualquer coluna != read_at. tenant_id/type/payload/created_at/id
-- são imutáveis; só read_at (marcar-como-lida) pode mudar. Complementa a policy de UPDATE
-- (00055), que só valida tenant_id — sem isto, um usuário do tenant poderia reescrever
-- type/payload das próprias notificações (LOW, sem brecha cross-tenant, mas o comentário do
-- schema promete imutabilidade). IS DISTINCT FROM trata NULL corretamente.
CREATE OR REPLACE FUNCTION public.enforce_app_notifications_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'app_notifications é imutável exceto read_at (id/tenant_id/type/payload/created_at não podem ser alterados)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_app_notifications_immutable ON public.app_notifications;
CREATE TRIGGER enforce_app_notifications_immutable
  BEFORE UPDATE ON public.app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_app_notifications_immutable();
