-- Migration: Saude dos jobs agendados + registro de erros de servidor
-- Story: 23.3 - Saude dos jobs e registro de erros com a infraestrutura atual
--
-- Falha de job agendado ficava invisivel (o `monitor-leads` responde `no_config` ha meses
-- e ninguem percebeu) e excecoes de servidor so existiam no log da Vercel.
--
-- O QUE ESTA MIGRATION FAZ (ADITIVA e IDEMPOTENTE):
--   1. Tabela nova `error_logs` (leitura so para gestor/diretor; escrita so service role / funcao).
--   2. Coluna nova NULLABLE `app_notifications.audience` ('admin' ou NULL) + policy RESTRICTIVE
--      de SELECT: notificacao com audience='admin' some para SDR. Linhas existentes ficam NULL
--      (nenhum UPDATE), entao nada muda para as notificacoes de hoje.
--   3. Funcao `job_health_max_silence(schedule)` (IMMUTABLE): janela maxima sem sucesso.
--   4. Funcao `check_scheduled_jobs_health()` (SECURITY DEFINER): le `cron.job`,
--      `cron.job_run_details` e `net._http_response` e grava `error_logs` + notificacao in-app
--      `job_com_falha` (audience 'admin', cooldown de 24h por chave).
--   5. Job pg_cron NOVO `job-health-check` a cada 15 min.
-- Os jobs existentes (`monitor-leads-cron`, `reply-sweep-cron`, `agent-stuck-steps-sweep`)
-- NAO sao alterados, reagendados nem removidos. Nenhum DROP de tabela/coluna, nenhum
-- UPDATE/DELETE em dados existentes.
--
-- APLICACAO: acao do operador (Fabossi, via SQL Editor).
-- ATENCAO: aplicar esta migration CRIA um job pg_cron novo (`job-health-check`, */15).
--
-- IMPACTO ESPERADO DA 1a EXECUCAO: hoje (2026-10-20) toda chamada do `monitor-leads-cron`
-- estoura o timeout padrao de 5000 ms do pg_net (o job nao passa `timeout_milliseconds`), e o
-- `reply-sweep-cron` tem timeouts ocasionais de 60000 ms. A 1a execucao do check vai acusar
-- HTTP_FALHOU: 1 linha em `error_logs` a cada 15 min (contagem + 1o erro) e 1 notificacao
-- "Job com problema: Chamadas HTTP (pg_net)" por tenant com gestor, no maximo 1 a cada 24h.
--
-- DIAGNOSTICO DO monitor-leads (`last_run_at` nulo / `no_config`):
--   A unica linha de `monitoring_configs` (tenant ...0001) tem `next_run_at` NULL. Em
--   `src/app/api/monitoring/process-batch/route.ts` o filtro
--   `.or(run_status.eq.running, and(run_status.eq.idle, next_run_at.lte.<agora>))` nao casa com
--   `next_run_at` nulo; o fallback tenta inserir uma config nova, esbarra em
--   `unique_monitoring_config_per_tenant` (erro ignorado) e devolve `no_config`. Por isso o
--   monitoramento nunca rodou (e nunca gastou Apify/OpenAI).
--   OPCOES (decisao do Fabossi, NAO aplicadas aqui):
--     a) Deixar como esta (monitoramento parado, custo zero).
--     b) Preencher `next_run_at` da config (UPDATE pontual) ou tratar `next_run_at IS NULL`
--        como vencido no filtro: o monitoramento passa a rodar de verdade (Apify + OpenAI para
--        os leads monitorados) — o cliente sente o custo.
--     c) Independente de a/b: re-agendar o `monitor-leads-cron` com `timeout_milliseconds`
--        maior para parar os timeouts de 5000 ms (altera job existente — so com OK explicito).
--
-- PRE-CHECK (somente leitura) — consultas aproximadas da deteccao da funcao (a funcao usa a
-- marca d'agua da ultima verificacao, job_health_max_silence e redacao de segredos):
--   -- JOB_FALHOU (ultimos 15 min)
--   SELECT j.jobname, count(*) AS falhas, min(d.start_time) AS primeira
--     FROM cron.job j JOIN cron.job_run_details d ON d.jobid = j.jobid
--    WHERE j.active AND d.status = 'failed' AND d.start_time >= now() - interval '15 minutes'
--    GROUP BY j.jobname;
--   -- JOB_PARADO (janela de job_health_max_silence; aqui com a regra */N inline)
--   SELECT j.jobname, j.schedule,
--          (SELECT max(d.start_time) FROM cron.job_run_details d
--            WHERE d.jobid = j.jobid AND d.status = 'succeeded') AS ultimo_sucesso
--     FROM cron.job j WHERE j.active ORDER BY j.jobname;
--   -- HTTP_FALHOU (ultimos 15 min)
--   SELECT count(*) AS falhas, min(created) AS primeira, left(min(error_msg), 200) AS exemplo
--     FROM net._http_response
--    WHERE created >= now() - interval '15 minutes'
--      AND (status_code IS NULL OR status_code >= 400);
--
-- ROLLBACK:
--   SELECT cron.unschedule('job-health-check')
--     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-health-check');
--   DROP FUNCTION IF EXISTS public.check_scheduled_jobs_health();
--   DROP FUNCTION IF EXISTS public.job_health_max_silence(TEXT);
--   DROP FUNCTION IF EXISTS public.job_health_redact(TEXT);
--   -- recriar a versao da 00060 de public.enforce_app_notifications_immutable() (sem audience)
--   DROP POLICY IF EXISTS "Admin-only notifications are hidden from non-admins" ON public.app_notifications;
--   ALTER TABLE public.app_notifications DROP COLUMN IF EXISTS audience;
--   DROP TABLE IF EXISTS public.error_logs;

-- ============================================
-- 1. TABLE: error_logs
-- ============================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source     TEXT NOT NULL CHECK (source IN ('api', 'server', 'agent_step', 'cron')),
  route      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.error_logs IS
  'Story 23.3: erros de servidor e de jobs agendados (mensagem sanitizada). tenant_id NULL = erro de plataforma (cron), visivel aos gestores de qualquer tenant.';

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_tenant_created_at
  ON public.error_logs(tenant_id, created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- So leitura, so gestor/diretor. Sem policy de INSERT/UPDATE/DELETE: quem escreve e o
-- service role (logServerError) ou a funcao SECURITY DEFINER abaixo.
DROP POLICY IF EXISTS "Admins can view their tenant and platform error logs" ON public.error_logs;
CREATE POLICY "Admins can view their tenant and platform error logs"
  ON public.error_logs FOR SELECT
  USING (
    public.is_admin()
    AND (tenant_id IS NULL OR tenant_id = public.get_current_tenant_id())
  );

-- ============================================
-- 2. app_notifications.audience + policy RESTRICTIVE
-- ============================================

ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS audience TEXT NULL CHECK (audience IN ('admin'));

COMMENT ON COLUMN public.app_notifications.audience IS
  'Story 23.3: NULL = todos do tenant; ''admin'' = so gestor/diretor (policy RESTRICTIVE).';

DROP POLICY IF EXISTS "Admin-only notifications are hidden from non-admins" ON public.app_notifications;
CREATE POLICY "Admin-only notifications are hidden from non-admins"
  ON public.app_notifications
  AS RESTRICTIVE
  FOR SELECT
  USING (audience IS NULL OR public.is_admin());

-- audience tambem e imutavel: mesma funcao da 00060 + audience (trigger ja existe e aponta
-- para ela). Sem isto um usuario do tenant poderia trocar audience via PostgREST.
CREATE OR REPLACE FUNCTION public.enforce_app_notifications_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.audience IS DISTINCT FROM OLD.audience THEN
    RAISE EXCEPTION 'app_notifications é imutável exceto read_at (id/tenant_id/type/payload/created_at não podem ser alterados)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3a. FUNCAO: job_health_redact
-- ============================================
-- Remove segredos de return_message/error_msg antes de gravar (query string, Bearer/Basic, JWT).

CREATE OR REPLACE FUNCTION public.job_health_redact(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(p_text, '(https?://[^\s?]*)\?\S*', '\1?[redacted]', 'gi'),
             '(Bearer|Basic)\s+\S+', '\1 [redacted]', 'gi'),
           'eyJ[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*', '[redacted]', 'g');
$fn$;

-- ============================================
-- 3. FUNCAO: job_health_max_silence
-- ============================================
-- `*/N * * * *` -> 3xN min (min. 15); `* * * * *` ou `N seconds` -> 15 min;
-- `M * * * *` -> 3h; resto -> 25h (job semanal novo precisa de regra propria).

CREATE OR REPLACE FUNCTION public.job_health_max_silence(p_schedule TEXT)
RETURNS INTERVAL
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $fn$
DECLARE
  v_schedule TEXT := btrim(regexp_replace(COALESCE(p_schedule, ''), '\s+', ' ', 'g'));
  v_match TEXT[];
BEGIN
  IF v_schedule = '* * * * *' OR v_schedule ~* '^[0-9]+ seconds?$' THEN
    RETURN INTERVAL '15 minutes';
  END IF;

  v_match := regexp_match(v_schedule, '^\*/([0-9]+) \* \* \* \*$');
  IF v_match IS NOT NULL THEN
    RETURN make_interval(mins => GREATEST(3 * v_match[1]::INTEGER, 15));
  END IF;

  IF v_schedule ~ '^[0-9]+ \* \* \* \*$' THEN
    RETURN INTERVAL '3 hours';
  END IF;

  RETURN INTERVAL '25 hours';
END;
$fn$;

COMMENT ON FUNCTION public.job_health_max_silence(TEXT) IS
  'Story 23.3: tempo maximo sem execucao bem-sucedida antes de o job ser considerado parado.';

-- ============================================
-- 4. FUNCAO: check_scheduled_jobs_health
-- ============================================
-- Retorna a quantidade de linhas gravadas em error_logs (0 = tudo ok).
-- Notificacao `job_com_falha`: uma por tenant com gestor/diretor, audience 'admin',
-- payload {key, job, detail}; cooldown de 24h por (tenant, key).
--   JOB_FALHOU  -> chave `job:<jobname>`;   error_logs sempre.
--   JOB_PARADO  -> chave `parado:<jobname>`; error_logs com cooldown de 24h.
--   HTTP_FALHOU -> chave `http`;            error_logs sempre (contagem + 1o erro).
-- `net._http_response` nao guarda URL nem jobid: as falhas HTTP sao agregadas.
-- Janela (JOB_FALHOU/HTTP_FALHOU): marca d'agua = inicio da execucao anterior do
-- job-health-check (fallback now()-15 min, no maximo 1h atras). Todos os jobs disparam no
-- mesmo segundo; janela fixa perderia ou contaria duas vezes falhas na borda.

CREATE OR REPLACE FUNCTION public.check_scheduled_jobs_health()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_window CONSTANT INTERVAL := INTERVAL '15 minutes';
  v_cooldown CONSTANT INTERVAL := INTERVAL '24 hours';
  v_count INTEGER := 0;
  r RECORD;
  v_detail TEXT;
  v_key TEXT;
  v_http_count INTEGER;
  v_http_first TEXT;
  v_since TIMESTAMPTZ;
BEGIN
  v_since := GREATEST(
    COALESCE(
      (SELECT max(d.start_time)
         FROM cron.job_run_details d
         JOIN cron.job j ON j.jobid = d.jobid
        WHERE j.jobname = 'job-health-check'
          AND d.start_time < now() - INTERVAL '1 minute'),
      now() - v_window
    ),
    now() - INTERVAL '1 hour'
  );

  -- ---------- JOB_FALHOU ----------
  FOR r IN
    SELECT COALESCE(j.jobname, 'jobid:' || j.jobid) AS jobname,
           count(*)::INTEGER AS failures,
           (array_agg(d.return_message ORDER BY d.end_time))[1] AS first_msg
      FROM cron.job j
      JOIN cron.job_run_details d ON d.jobid = j.jobid
     WHERE j.active
       AND d.status = 'failed'
       AND d.end_time > v_since
       AND d.end_time <= now()
     GROUP BY 1
     ORDER BY 1
  LOOP
    v_detail := left(
      'Falhou ' || r.failures || ' vez(es) desde a ultima verificacao: '
        || COALESCE(NULLIF(btrim(public.job_health_redact(r.first_msg)), ''), 'sem mensagem'),
      500
    );
    v_key := 'job:' || r.jobname;

    INSERT INTO public.error_logs (tenant_id, source, route, message)
    VALUES (NULL, 'cron', 'pg_cron/' || r.jobname, v_detail);
    v_count := v_count + 1;

    INSERT INTO public.app_notifications (tenant_id, type, payload, audience)
    SELECT t.id, 'job_com_falha',
           jsonb_build_object('key', v_key, 'job', r.jobname, 'detail', v_detail),
           'admin'
      FROM public.tenants t
     WHERE EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.tenant_id = t.id AND p.role IN ('gestor', 'diretor'))
       AND NOT EXISTS (SELECT 1 FROM public.app_notifications n
                        WHERE n.tenant_id = t.id
                          AND n.type = 'job_com_falha'
                          AND n.payload->>'key' = v_key
                          AND n.created_at > now() - v_cooldown);
  END LOOP;

  -- ---------- JOB_PARADO ----------
  -- So conta jobs com historico anterior a janela (job recem-criado nao e "parado").
  FOR r IN
    SELECT j.jobid, COALESCE(j.jobname, 'jobid:' || j.jobid) AS jobname,
           public.job_health_max_silence(j.schedule) AS max_silence
      FROM cron.job j
     WHERE j.active
     ORDER BY 2
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job_run_details d
                WHERE d.jobid = r.jobid
                  AND d.start_time <= now() - r.max_silence)
       AND NOT EXISTS (SELECT 1 FROM cron.job_run_details d
                        WHERE d.jobid = r.jobid
                          AND d.status = 'succeeded'
                          AND d.start_time > now() - r.max_silence)
    THEN
      v_detail := 'Sem execucao bem-sucedida ha mais de '
        || (EXTRACT(EPOCH FROM r.max_silence) / 60)::INTEGER || ' min';
      v_key := 'parado:' || r.jobname;

      IF NOT EXISTS (SELECT 1 FROM public.error_logs e
                      WHERE e.route = 'pg_cron/' || r.jobname
                        AND e.message LIKE 'Sem execucao bem-sucedida%'
                        AND e.created_at > now() - v_cooldown)
      THEN
        INSERT INTO public.error_logs (tenant_id, source, route, message)
        VALUES (NULL, 'cron', 'pg_cron/' || r.jobname, v_detail);
        v_count := v_count + 1;
      END IF;

      INSERT INTO public.app_notifications (tenant_id, type, payload, audience)
      SELECT t.id, 'job_com_falha',
             jsonb_build_object('key', v_key, 'job', r.jobname, 'detail', v_detail),
             'admin'
        FROM public.tenants t
       WHERE EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.tenant_id = t.id AND p.role IN ('gestor', 'diretor'))
         AND NOT EXISTS (SELECT 1 FROM public.app_notifications n
                          WHERE n.tenant_id = t.id
                            AND n.type = 'job_com_falha'
                            AND n.payload->>'key' = v_key
                            AND n.created_at > now() - v_cooldown);
    END IF;
  END LOOP;

  -- ---------- HTTP_FALHOU ----------
  IF to_regclass('net._http_response') IS NOT NULL THEN
    SELECT count(*)::INTEGER,
           (array_agg(
              COALESCE(NULLIF(btrim(h.error_msg), ''), 'HTTP ' || h.status_code::TEXT)
              ORDER BY h.created, h.id
            ))[1]
      INTO v_http_count, v_http_first
      FROM net._http_response h
     WHERE h.created > v_since
       AND h.created <= now()
       AND (h.status_code IS NULL OR h.status_code >= 400);

    IF v_http_count > 0 THEN
      v_detail := left(
        v_http_count || ' chamada(s) HTTP do pg_net falharam desde a ultima verificacao. 1o erro: '
          || COALESCE(public.job_health_redact(v_http_first), 'sem mensagem'),
        500
      );
      v_key := 'http';

      INSERT INTO public.error_logs (tenant_id, source, route, message)
      VALUES (NULL, 'cron', 'pg_net/http', v_detail);
      v_count := v_count + 1;

      INSERT INTO public.app_notifications (tenant_id, type, payload, audience)
      SELECT t.id, 'job_com_falha',
             jsonb_build_object('key', v_key, 'job', 'Chamadas HTTP (pg_net)', 'detail', v_detail),
             'admin'
        FROM public.tenants t
       WHERE EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.tenant_id = t.id AND p.role IN ('gestor', 'diretor'))
         AND NOT EXISTS (SELECT 1 FROM public.app_notifications n
                          WHERE n.tenant_id = t.id
                            AND n.type = 'job_com_falha'
                            AND n.payload->>'key' = v_key
                            AND n.created_at > now() - v_cooldown);
    END IF;
  END IF;

  RETURN v_count;
END;
$fn$;

-- Nao chamavel pela API (PostgREST). O pg_cron roda como `postgres`.
REVOKE EXECUTE ON FUNCTION public.check_scheduled_jobs_health() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_scheduled_jobs_health() IS
  'Story 23.3: verifica jobs pg_cron (falha, parado) e respostas HTTP do pg_net; grava error_logs e '
  'notificacao job_com_falha (audience admin, cooldown 24h por chave). Retorna linhas gravadas em error_logs. '
  'Agendado pelo cron job-health-check.';

-- ============================================
-- 5. CRON SCHEDULE: a cada 15 minutos
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-agendamento idempotente: remove so o job desta migration, se existir.
SELECT cron.unschedule('job-health-check')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-health-check');

SELECT cron.schedule(
  'job-health-check',
  '*/15 * * * *',
  $$ SELECT public.check_scheduled_jobs_health(); $$
);

-- Para desabilitar: SELECT cron.unschedule('job-health-check');
