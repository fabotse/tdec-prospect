-- Migration: Schedule monitor-leads Edge Function via pg_cron
-- Story: 13.3 - Edge Function de Verificação Semanal
-- AC: #2

-- ============================================
-- ENABLE EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- VAULT SECRETS (configure MANUALLY via Supabase SQL Editor)
-- ============================================
-- IMPORTANT: Do NOT hardcode secrets in migration files.
-- Run these commands manually in the Supabase SQL Editor:
--
--   SELECT vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--

-- ============================================
-- CRON SCHEDULE: a cada 5 minutos
-- ============================================
-- O cron roda a cada 5 min, mas a API Route só processa quando:
-- - monitoring_configs.next_run_at <= now() (novo run)
-- - monitoring_configs.run_status = 'running' (retomar run)
-- Nos demais casos retorna 200 { status: 'no_run_due' } imediatamente.

SELECT cron.schedule(
  'monitor-leads-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
           || '/functions/v1/monitor-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Para desabilitar: SELECT cron.unschedule('monitor-leads-cron');
