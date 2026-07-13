-- Migration: Create opportunities + notification schema (Loop de Resposta)
-- Epic: 21 - Loop de Resposta ("Pop-up do Lead")
-- Story: 21.1 - Schema de Oportunidades, Tipos e Validação Real do Spike
-- AC: #1 - opportunities (todas as colunas, CHECKs de source/intent/status, FKs, UNIQUE(reply_event_id))
-- AC: #2 - notification_settings (1 por tenant) + app_notifications (in-app persistida)
-- AC: #3 - RLS por tenant_id, trigger update_updated_at_column, índices
-- AC: #6 - Idempotente/defensiva (banco gerido à mão, sem migration tracking — ver 00053)
--
-- Decisões (Dev Notes da story 21.1):
--   - "enum" conceitual = TEXT + CHECK (NÃO CREATE TYPE ... AS ENUM) — precedente 00053/AD-1
--     (evita a dor de ALTER TYPE em banco gerenciado à mão; intent/status tendem a evoluir).
--   - FKs: tenant_id CASCADE; lead_id nullable SET NULL (21.2 AC5: oportunidade existe mesmo
--     sem lead na base); campaign_id SEM FK (espelha campaign_events 00039 e o tratamento de
--     "campanha desconhecida"); reply_event_id nullable SET NULL (FK campaign_events, exigido AC1).
--   - UNIQUE(reply_event_id): no Postgres múltiplos NULL são DISTINTOS no índice UNIQUE
--     => idempotência p/ source='reply' (1 oportunidade por resposta) E N source='engagement'
--        (reply_event_id NULL) sem colidir. NFR2.
--   - Reusa public.get_current_tenant_id() (00003) e public.update_updated_at_column()
--     (trigger fn existente). NÃO redefinir essas funções — apenas referenciar.

-- ============================================
-- TABLE: opportunities
-- ============================================

CREATE TABLE IF NOT EXISTS public.opportunities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id            UUID REFERENCES public.leads(id) ON DELETE SET NULL,       -- nullable (21.2 AC5)
  campaign_id        UUID NOT NULL,                                             -- sem FK (espelha campaign_events 00039)
  source             TEXT NOT NULL CHECK (source IN ('reply', 'engagement')),
  reply_event_id     UUID REFERENCES public.campaign_events(id) ON DELETE SET NULL,
  reply_text         TEXT,
  reply_subject      TEXT,
  unibox_url         TEXT,
  intent             TEXT CHECK (intent IS NULL OR intent IN
                       ('interessado', 'pediu_info', 'objecao', 'nao_agora', 'opt_out')),
  lt_interest_status INTEGER,
  suggestion         TEXT,
  status             TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new', 'viewed', 'contacted', 'meeting_booked', 'discarded')),
  meeting_booked_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- UNIQUE em coluna nullable: no Postgres múltiplos NULL são permitidos no índice UNIQUE.
  -- => idempotência p/ replies (1 oportunidade por reply_event_id) E N engagements
  --    (reply_event_id NULL) sem colisão. NFR2.
  CONSTRAINT uq_opportunities_reply_event_id UNIQUE (reply_event_id)
);

COMMENT ON TABLE public.opportunities IS 'Oportunidades do Loop de Resposta (Epic 21): respostas de leads e sinais de engajamento, classificados por IA e exibidos na Central de Oportunidades';
COMMENT ON COLUMN public.opportunities.source IS 'Origem: reply (resposta de e-mail) ou engagement (abertura/clique)';
COMMENT ON COLUMN public.opportunities.campaign_id IS 'ID da campanha (espelha campaign_events; sem FK — banco gerido à mão + tratamento de "campanha desconhecida")';
COMMENT ON COLUMN public.opportunities.reply_event_id IS 'FK campaign_events (nullable). UNIQUE p/ idempotência de replies; NULL p/ engagements (N por oportunidade)';
COMMENT ON COLUMN public.opportunities.intent IS 'Intenção classificada por IA (21.3); nullable até a classificação';
COMMENT ON COLUMN public.opportunities.lt_interest_status IS 'Instantly lead interest status normalizado string->int na ingestão (21.3). Ex: Interested=1, Meeting Booked=2, Not Interested=-1';
COMMENT ON COLUMN public.opportunities.status IS 'Ciclo de vida do card: new -> viewed -> contacted -> meeting_booked | discarded';

CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_status
  ON public.opportunities(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead_id
  ON public.opportunities(lead_id);

DROP TRIGGER IF EXISTS update_opportunities_updated_at ON public.opportunities;
CREATE TRIGGER update_opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: policies de tenant para leitura client-side + defesa em profundidade.
-- O processador (21.2) e as notificações (21.7) inserem via SERVICE_ROLE (bypassa RLS),
-- igual ao webhook do Epic 10 — mesmo assim mantemos as 4 policies (padrão do projeto).
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant opportunities" ON public.opportunities;
CREATE POLICY "Users can view their tenant opportunities"
  ON public.opportunities FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can insert opportunities to their tenant" ON public.opportunities;
CREATE POLICY "Users can insert opportunities to their tenant"
  ON public.opportunities FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can update their tenant opportunities" ON public.opportunities;
CREATE POLICY "Users can update their tenant opportunities"
  ON public.opportunities FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can delete their tenant opportunities" ON public.opportunities;
CREATE POLICY "Users can delete their tenant opportunities"
  ON public.opportunities FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());

-- ============================================
-- TABLE: notification_settings (1 por tenant)
-- ============================================

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,                            -- ["5511999999999", ...]
  channels         JSONB NOT NULL DEFAULT '{"whatsapp": true, "in_app": true}'::jsonb,
  notify_intents   JSONB NOT NULL DEFAULT '["interessado", "pediu_info"]'::jsonb, -- forward-compat 21.7 AC3
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_settings_tenant UNIQUE (tenant_id)
);

COMMENT ON TABLE public.notification_settings IS 'Configuração de notificações do Loop de Resposta por tenant (21.7): números WhatsApp destino, canais habilitados, intents que disparam alerta';
COMMENT ON COLUMN public.notification_settings.whatsapp_numbers IS 'Array de números destino no formato E.164 (ex: ["5511999999999"])';
COMMENT ON COLUMN public.notification_settings.channels IS 'Canais habilitados: { "whatsapp": bool, "in_app": bool }';
COMMENT ON COLUMN public.notification_settings.notify_intents IS 'Intents que disparam notificação (forward-compat 21.7 AC3)';

DROP TRIGGER IF EXISTS update_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant notification settings" ON public.notification_settings;
CREATE POLICY "Users can view their tenant notification settings"
  ON public.notification_settings FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can insert notification settings to their tenant" ON public.notification_settings;
CREATE POLICY "Users can insert notification settings to their tenant"
  ON public.notification_settings FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can update their tenant notification settings" ON public.notification_settings;
CREATE POLICY "Users can update their tenant notification settings"
  ON public.notification_settings FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can delete their tenant notification settings" ON public.notification_settings;
CREATE POLICY "Users can delete their tenant notification settings"
  ON public.notification_settings FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());

-- ============================================
-- TABLE: app_notifications (in-app persistida)
-- ============================================

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_notifications IS 'Notificações in-app persistidas do Loop de Resposta (21.7). Imutável exceto read_at (sem updated_at/trigger)';
COMMENT ON COLUMN public.app_notifications.type IS 'Tipo da notificação (ex: nova_oportunidade)';
COMMENT ON COLUMN public.app_notifications.payload IS 'Dados da notificação (JSONB)';
COMMENT ON COLUMN public.app_notifications.read_at IS 'Timestamp de leitura; NULL = não lida';

-- Índice parcial: lista de não-lidas por tenant, mais recentes primeiro
CREATE INDEX IF NOT EXISTS idx_app_notifications_tenant_unread
  ON public.app_notifications(tenant_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant app notifications" ON public.app_notifications;
CREATE POLICY "Users can view their tenant app notifications"
  ON public.app_notifications FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can insert app notifications to their tenant" ON public.app_notifications;
CREATE POLICY "Users can insert app notifications to their tenant"
  ON public.app_notifications FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can update their tenant app notifications" ON public.app_notifications;
CREATE POLICY "Users can update their tenant app notifications"
  ON public.app_notifications FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

DROP POLICY IF EXISTS "Users can delete their tenant app notifications" ON public.app_notifications;
CREATE POLICY "Users can delete their tenant app notifications"
  ON public.app_notifications FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());
