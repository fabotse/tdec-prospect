-- Migration: Schedule reply-sweep Edge Function via pg_cron
-- Story: 21.2 - Ingestão de Respostas por Polling + Processador + Backfill
-- AC: #1, #2 (cron ≤5 min → NFR3)
--
-- Espelha 00045 (monitor-leads). Idempotente/defensiva (banco gerido à mão,
-- sem migration tracking — ver 00053). Segredos via Vault, NUNCA hardcoded
-- (foi fix CRITICAL na review da 13.3).

-- ============================================
-- ENABLE EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- VAULT SECRETS (configure MANUALMENTE via Supabase SQL Editor)
-- ============================================
-- IMPORTANTE: NÃO hardcodar segredos em arquivos de migration.
-- Reutiliza os segredos já criados pela 00045 (supabase_url, service_role_key).
-- Se ainda não existirem, rode UMA vez no SQL Editor:
--
--   SELECT vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--
-- Segredos da rota Node (Bearer) NÃO ficam aqui: a Edge Function reply-sweep lê
-- REPLIES_CRON_SECRET dos próprios secrets (Dashboard) e o repassa ao /api/replies.

-- ============================================
-- CRON SCHEDULE: a cada 5 minutos
-- ============================================
-- O cron chama a Edge Function reply-sweep, que faz fetch para
-- /api/replies/process-batch (sweep de polling + processador). O dedupe
-- (23505 em campaign_events + UNIQUE reply_event_id em opportunities) torna
-- cada ciclo idempotente.

-- Rollback/re-agendamento idempotente: remove o job anterior se existir.
SELECT cron.unschedule('reply-sweep-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reply-sweep-cron');

SELECT cron.schedule(
  'reply-sweep-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
           || '/functions/v1/reply-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Para desabilitar: SELECT cron.unschedule('reply-sweep-cron');
