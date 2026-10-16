-- Migration: Create lead_security_gateways (ESG persistido)
-- Epic: 23 - Plataforma: Higiene & Proteção de Envio
-- Story: 23.8 - Oportunidades sem falso positivo de security gateway (fix)
--
-- O cron de engajamento (engagement-processor, dentro do reply-sweep) já lê o
-- `esg_code` de todos os leads das campanhas exportadas a cada ciclo. Esta tabela
-- guarda os e-mails que passam por security gateway para a Central de
-- Oportunidades ler do banco, sem consultar o Instantly na hora.
--
-- SOMENTE ADITIVA: tabela nova + índice + RLS. Não toca nenhuma linha existente.
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS): banco do cliente é gerido
-- à mão, sem migration tracking (ver 00053/00055).
--
-- Escrita: só o cron, via SERVICE_ROLE (bypassa RLS). Usuários só leem o próprio
-- tenant — não há policy de INSERT/UPDATE/DELETE para usuários.

CREATE TABLE IF NOT EXISTS public.lead_security_gateways (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,           -- normalizado: trim + minúsculas
  gateway       TEXT NOT NULL,           -- label resolvido: Proofpoint, Mimecast, Barracuda, Cisco, Unknown(n)
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lead_security_gateways_tenant_email UNIQUE (tenant_id, email)
);

COMMENT ON TABLE public.lead_security_gateways IS 'Story 23.8: e-mails com security gateway (ESG) vistos pelo cron de engajamento. Lido pela Central para a marcação "possível abertura automática".';
COMMENT ON COLUMN public.lead_security_gateways.email IS 'E-mail do lead normalizado (trim + lower)';
COMMENT ON COLUMN public.lead_security_gateways.gateway IS 'Gateway resolvido do esg_code do Instantly';
COMMENT ON COLUMN public.lead_security_gateways.last_seen_at IS 'Última vez que o cron viu o gateway neste e-mail';

ALTER TABLE public.lead_security_gateways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant lead security gateways" ON public.lead_security_gateways;
CREATE POLICY "Users can view their tenant lead security gateways"
  ON public.lead_security_gateways FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());
