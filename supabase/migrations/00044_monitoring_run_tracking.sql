-- Migration: Monitoring Run Tracking Columns
-- Story: 13.3 - Edge Function de Verificação Semanal
-- AC: #9, #11

-- ============================================
-- ALTER TABLE: monitoring_configs — run tracking
-- ============================================

-- run_status: estado da máquina de estados (idle/running)
ALTER TABLE public.monitoring_configs
  ADD COLUMN IF NOT EXISTS run_status TEXT NOT NULL DEFAULT 'idle';

ALTER TABLE public.monitoring_configs
  ADD CONSTRAINT monitoring_configs_run_status_check
  CHECK (run_status IN ('idle', 'running'));

-- run_cursor: último lead.id processado para paginação cursor-based entre invocações
ALTER TABLE public.monitoring_configs
  ADD COLUMN IF NOT EXISTS run_cursor UUID DEFAULT NULL;

COMMENT ON COLUMN public.monitoring_configs.run_cursor IS
  'References lead.id for cursor-based pagination between cron invocations';
