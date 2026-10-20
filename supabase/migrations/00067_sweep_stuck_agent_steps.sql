-- Migration: Sweeper de steps do agente presos em `running`
-- Story: 24.1 - Etapa travada e destravada sozinha
-- AC: #1 (step morto vira `failed` retryable + execucao `paused` + bolha), #2 (CAS)
--
-- Um step que morre no meio (timeout de 300s da rota execute, deploy, erro de gravacao)
-- ficava em `running` para sempre. Desde a 24.2 o CAS de entrada so aceita
-- `pending`/`failed`/`awaiting_approval`, entao nem o "Tentar novamente" o destravava.
--
-- ADITIVA e IDEMPOTENTE: so `CREATE OR REPLACE FUNCTION`, `REVOKE`, `COMMENT` e o
-- agendamento do cron (unschedule-if-exists + schedule, padrao da 00056). Nenhuma
-- tabela/coluna e criada, alterada ou removida.
--
-- APLICACAO: acao do operador (Fabossi, via SQL Editor, na janela de deploy combinada).
-- ATENCAO: aplicar esta migration CRIA um job pg_cron novo (`agent-stuck-steps-sweep`,
-- a cada 2 min). A 1a execucao do cron libera TAMBEM os steps historicos presos: cada
-- execucao ainda `running` vai para `paused` e ganha uma bolha de erro no chat.
--
-- PRE-CHECK (somente leitura) — rodar ANTES de aplicar para ver o impacto:
--   SELECT s.execution_id, s.step_number, s.step_type, s.status AS step_status,
--          COALESCE(s.started_at, s.created_at) AS desde,
--          e.status AS execution_status,
--          (e.status = 'running') AS vai_pausar_e_ganhar_bolha
--     FROM public.agent_steps s
--     JOIN public.agent_executions e ON e.id = s.execution_id
--    WHERE s.status = 'running'
--      AND COALESCE(s.started_at, s.created_at) < now() - interval '10 minutes'
--    ORDER BY desde;
--   -- (contagem: troque a lista por SELECT count(*), count(*) FILTER (WHERE e.status = 'running'))
--
-- ROLLBACK:
--   SELECT cron.unschedule('agent-stuck-steps-sweep')
--     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-stuck-steps-sweep');
--   DROP FUNCTION IF EXISTS public.sweep_stuck_agent_steps(INTERVAL);

-- ============================================
-- FUNCAO: sweep_stuck_agent_steps
-- ============================================
-- Limite padrao de 10 min: bem acima do `maxDuration = 300` da rota execute, entao
-- nenhum step vivo e liberado.
--
-- CAS: `FOR ... IN UPDATE ... WHERE status = 'running'`. Em READ COMMITTED o UPDATE
-- reavalia o WHERE sobre a versao mais nova da linha — um step que terminou entre o
-- inicio da varredura e o UPDATE nao e tocado.
--
-- O output parcial da 24.2 (ex.: `externalCampaignId`) e preservado:
-- `output(objeto) || {error: {...}}`.
--
-- A execucao so vai para `paused` se ainda estiver `running` (nunca toca
-- `cancelled`/`completed`/`paused`), e a bolha so e inserida quando ESTA chamada
-- pausou a execucao — assim nao duplica a bolha que o orchestrator ja escreveu.
-- O custo (`recordExecutionCost`) nao e registrado aqui (limitacao aceita).

CREATE OR REPLACE FUNCTION public.sweep_stuck_agent_steps(
  p_timeout INTERVAL DEFAULT INTERVAL '10 minutes'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
  v_label TEXT;
  v_minutes INTEGER;
  v_message CONSTANT TEXT := 'Etapa interrompida — tente novamente';
  v_content TEXT;
  v_paused INTEGER;
BEGIN
  v_minutes := GREATEST(1, CEIL(EXTRACT(EPOCH FROM p_timeout) / 60.0)::INTEGER);

  FOR r IN
    UPDATE public.agent_steps s
       SET status = 'failed',
           error_message = v_message,
           output = CASE WHEN jsonb_typeof(s.output) = 'object' THEN s.output ELSE '{}'::jsonb END
                    || jsonb_build_object(
                         'error', jsonb_build_object(
                           'code', 'STEP_INTERRUPTED',
                           'message', v_message,
                           'stepNumber', s.step_number,
                           'stepType', s.step_type,
                           'isRetryable', true
                         )
                       )
     WHERE s.status = 'running'
       AND COALESCE(s.started_at, s.created_at) < now() - p_timeout
    RETURNING s.execution_id, s.step_number, s.step_type
  LOOP
    v_count := v_count + 1;

    -- Mesmo mapeamento de STEP_LABELS (src/types/agent.ts).
    v_label := CASE r.step_type
      WHEN 'search_companies' THEN 'Busca de Empresas'
      WHEN 'search_leads' THEN 'Busca de Leads'
      WHEN 'create_campaign' THEN 'Criacao de Campanha'
      WHEN 'export' THEN 'Exportacao'
      WHEN 'activate' THEN 'Ativacao'
      ELSE r.step_type
    END;

    v_content := 'Erro na etapa "' || v_label || '": ' || v_message
      || '. A etapa ficou mais de ' || v_minutes
      || ' minutos sem terminar e foi liberada automaticamente.'
      || ' Clique em "Tentar novamente" na etapa para refazer.';

    -- CAS da execucao: so pausa se ainda estiver `running`.
    UPDATE public.agent_executions e
       SET status = 'paused',
           error_message = v_content,
           updated_at = now()
     WHERE e.id = r.execution_id
       AND e.status = 'running';
    GET DIAGNOSTICS v_paused = ROW_COUNT;

    IF v_paused > 0 THEN
      -- Mesmo formato de Orchestrator.sendErrorMessage.
      INSERT INTO public.agent_messages (execution_id, role, content, metadata)
      VALUES (
        r.execution_id,
        'system',
        v_content,
        jsonb_build_object(
          'stepNumber', r.step_number,
          'messageType', 'error',
          'error', jsonb_build_object(
            'code', 'STEP_INTERRUPTED',
            'isRetryable', true
          )
        )
      );
    END IF;
  END LOOP;

  RETURN v_count;
END;
$fn$;

-- Nao chamavel pela API (PostgREST). O pg_cron roda como `postgres`.
REVOKE EXECUTE ON FUNCTION public.sweep_stuck_agent_steps(INTERVAL) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sweep_stuck_agent_steps(INTERVAL) IS
  'Story 24.1: libera steps do agente presos em running ha mais de p_timeout (padrao 10 min): '
  'step -> failed (STEP_INTERRUPTED, retryable, output parcial preservado), execucao running -> paused '
  'e bolha de erro. Retorna a quantidade de steps liberados. Agendado pelo cron agent-stuck-steps-sweep.';

-- ============================================
-- CRON SCHEDULE: a cada 2 minutos
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-agendamento idempotente: remove o job anterior se existir.
SELECT cron.unschedule('agent-stuck-steps-sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-stuck-steps-sweep');

SELECT cron.schedule(
  'agent-stuck-steps-sweep',
  '*/2 * * * *',
  $$ SELECT public.sweep_stuck_agent_steps(); $$
);

-- Para desabilitar: SELECT cron.unschedule('agent-stuck-steps-sweep');
