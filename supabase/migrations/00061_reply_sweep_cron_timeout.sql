-- Migration: Reply-sweep cron — timeout_milliseconds explícito no pg_net
-- Story: 21.7 (pós-deploy do Epic 21) — hardening do cron do loop de resposta
--
-- Idempotente/defensiva (banco gerido à mão, sem migration tracking — ver 00053/00056).
-- Reagenda o job `reply-sweep-cron` (criado na 00056) adicionando `timeout_milliseconds`.
--
-- PORQUÊ: a 00056 chamava `net.http_post(...)` SEM `timeout_milliseconds` → pg_net usa o
-- default de 5s. A rota `/api/replies/process-batch` leva ~10s (sweep Instantly + classify
-- OpenAI + notify), então o pg_net desconectava aos 5s: (1) gravava `status_code NULL` em
-- `net._http_response` (o 200 real nunca aparecia — atrapalha o monitoramento), e (2) havia
-- risco da desconexão precoce cortar o pipeline no meio num ciclo com atividade real.
-- Fix: `timeout_milliseconds := 60000` (60s) — o pg_net espera a resposta inteira, captura o
-- 200 e garante que a Edge Function/rota não é desconectada no meio. Cada ciclo segue
-- idempotente (dedupe 23505 + UNIQUE reply_event_id + `notified_at`/`intent` NULL como gates).
--
-- Segredos via Vault (supabase_url, service_role_key), NUNCA hardcoded — igual à 00056.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Reagendamento idempotente: remove o job anterior se existir.
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
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);
