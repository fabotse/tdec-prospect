-- Migration: Create whatsapp_messages table for WhatsApp message tracking
-- Story: 11.2 - Schema WhatsApp Messages + Tipos
-- AC: #1 - whatsapp_messages table with all required columns
-- AC: #2 - PostgreSQL ENUM whatsapp_message_status with 5 values
-- AC: #3 - RLS policies (SELECT, INSERT, UPDATE, DELETE)
-- AC: #4 - Indexes for common access patterns
-- AC: #7 - Trigger update_updated_at_column for updated_at
-- AC: #8 - UNIQUE constraint for idempotency

-- ============================================
-- ENUM: whatsapp_message_status
-- ============================================

DO $$ BEGIN
  CREATE TYPE public.whatsapp_message_status AS ENUM (
    'pending',
    'sent',
    'delivered',
    'read',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE public.whatsapp_message_status IS 'Status de entrega de mensagem WhatsApp: pending → sent → delivered → read | pending → failed';

-- ============================================
-- TABLE: whatsapp_messages
-- ============================================

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  status public.whatsapp_message_status NOT NULL DEFAULT 'pending',
  external_message_id VARCHAR(255),
  external_zaap_id VARCHAR(255),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_messages IS 'Mensagens WhatsApp enviadas via Z-API com tracking de status';
COMMENT ON COLUMN public.whatsapp_messages.phone IS 'Número do destinatário no formato E.164 (ex: 551199999999)';
COMMENT ON COLUMN public.whatsapp_messages.status IS 'Estado atual da mensagem: pending, sent, delivered, read, failed';
COMMENT ON COLUMN public.whatsapp_messages.external_message_id IS 'messageId retornado pela Z-API no send-text';
COMMENT ON COLUMN public.whatsapp_messages.external_zaap_id IS 'zaapId retornado pela Z-API no send-text';
COMMENT ON COLUMN public.whatsapp_messages.error_message IS 'Mensagem de erro quando status = failed';
COMMENT ON COLUMN public.whatsapp_messages.sent_at IS 'Timestamp de envio efetivo (quando Z-API confirma)';

-- ============================================
-- TRIGGER: updated_at automático
-- ============================================

CREATE TRIGGER update_whatsapp_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- INDEXES
-- ============================================

-- Index para isolamento de tenant (RLS performance)
CREATE INDEX idx_whatsapp_messages_tenant_id
  ON public.whatsapp_messages(tenant_id);

-- Index composto para queries de status agregado por campanha
CREATE INDEX idx_whatsapp_messages_campaign_status
  ON public.whatsapp_messages(campaign_id, status);

-- Index parcial para lookup por external_message_id (apenas quando preenchido)
CREATE INDEX idx_whatsapp_messages_external_message_id
  ON public.whatsapp_messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ============================================
-- UNIQUE CONSTRAINT: Idempotência
-- ============================================

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT uq_whatsapp_messages_idempotency
  UNIQUE (campaign_id, lead_id, external_message_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant whatsapp messages"
  ON public.whatsapp_messages FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert whatsapp messages to their tenant"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant whatsapp messages"
  ON public.whatsapp_messages FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant whatsapp messages"
  ON public.whatsapp_messages FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());
