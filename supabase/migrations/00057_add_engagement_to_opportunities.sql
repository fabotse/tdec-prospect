-- Migration: Add engagement metrics + dedup key to opportunities (Loop de Resposta)
-- Epic: 21 - Loop de Resposta ("Pop-up do Lead")
-- Story: 21.6 - Janela de Oportunidade Cross-Campanha
-- AC: #1/#2 - source='engagement' precisa de métricas (open/click/último engajamento)
--             + chave de dedup própria (reply_event_id é NULL para engagement).
--
-- Idempotente/defensiva: banco do cliente é gerido à mão, sem migration tracking
-- (ver 00053/00055). Reaplicar não pode falhar → ADD COLUMN IF NOT EXISTS +
-- CREATE UNIQUE INDEX IF NOT EXISTS.
--
-- Decisões (Dev Notes 21.6):
--   - As 3 colunas são NULLABLE: irrelevantes para source='reply' (ficam NULL).
--   - uq_opportunities_engagement fecha o dedup de engagement DEFERIDO na review 21.1
--     (deferred-work.md — "Engajamentos sem chave de dedup"). O UNIQUE(reply_event_id)
--     de 00055 NÃO deduplica engagements (múltiplos NULL são distintos no Postgres).
--     Este índice parcial cobre reprocesso do mesmo (tenant, campaign, lead) em ciclos
--     consecutivos do cron (23505 benigno no app). O dedup "ativo do mesmo lead" (AC1)
--     é app-level (engagement-processor). Trade-off: um lead cujo engagement foi
--     `discarded` e que re-engaja na MESMA campanha não gera card novo — aceitável
--     (evita re-nag), documentado abaixo.

-- ============================================
-- Engagement metrics (nullable — só usadas por source='engagement')
-- ============================================

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS open_count          INTEGER,
  ADD COLUMN IF NOT EXISTS click_count         INTEGER,
  ADD COLUMN IF NOT EXISTS last_engagement_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.opportunities.open_count IS 'Story 21.6: aberturas do lead na janela (source=engagement; NULL p/ reply)';
COMMENT ON COLUMN public.opportunities.click_count IS 'Story 21.6: cliques do lead na janela (source=engagement; NULL p/ reply)';
COMMENT ON COLUMN public.opportunities.last_engagement_at IS 'Story 21.6: max(último open, último clique) — o "último em Z" do card (source=engagement)';

-- ============================================
-- Dedup key de engagement (índice parcial UNIQUE)
-- ============================================

-- Backstop de idempotência p/ reprocesso do mesmo (campaign, lead) em source='engagement'.
-- reply_event_id é NULL para engagement → o uq_opportunities_reply_event_id (00055) não cobre.
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_engagement
  ON public.opportunities (tenant_id, campaign_id, lead_id)
  WHERE source = 'engagement';

COMMENT ON INDEX public.uq_opportunities_engagement IS 'Story 21.6: dedup de engagement (reply_event_id NULL não deduplica). Trade-off: lead descartado que re-engaja na MESMA campanha não gera card novo (23505 benigno no app) — evita re-nag.';
