-- Migration: timeout maior na chamada HTTP do monitor-leads-cron
-- Story: 23.3 - Saude dos jobs e registro de erros com a infraestrutura atual
-- Decisao do Fabossi (2026-10-20): opcao (c) do cabecalho da 00068.
--
-- O job da 00045 chama a Edge Function monitor-leads sem `timeout_milliseconds`, entao o
-- pg_net desiste em 5000 ms (padrao). Em 2026-10-20 foram 29 timeouts em 6 h, e com o
-- monitoramento semanal voltando a rodar (fix do `next_run_at` nulo na rota process-batch)
-- uma rodada com Apify + OpenAI passa facil de 5 s. O timeout so afeta quanto o pg_net
-- espera a resposta (a Edge Function segue rodando), mas cada um vira HTTP_FALHOU no
-- job-health-check da 00068.
--
-- O QUE MUDA: SO o `monitor-leads-cron` e re-agendado com o MESMO nome, a MESMA frequencia
-- (*/5) e o MESMO comando da 00045, mais `timeout_milliseconds := 150000` (150 s = limite de
-- parede da Edge Function). Nenhum outro job e tocado. Sem tabela, coluna ou dado alterado.
--
-- APLICACAO: acao do operador (Fabossi, via SQL Editor), depois da 00068.
-- PRE-CHECK (somente leitura):
--   SELECT jobid, jobname, schedule, active, command FROM cron.job WHERE jobname = 'monitor-leads-cron';
-- CONFERIR DEPOIS:
--   SELECT jobname, schedule, active, command LIKE '%timeout_milliseconds := 150000%' AS com_timeout
--     FROM cron.job WHERE jobname = 'monitor-leads-cron';
-- ROLLBACK: reaplicar o bloco de agendamento da 00045 (mesmo comando, sem timeout_milliseconds).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('monitor-leads-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-leads-cron');

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
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  ) AS request_id;
  $$
);

-- Para desabilitar: SELECT cron.unschedule('monitor-leads-cron');
