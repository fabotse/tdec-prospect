-- Migration: Backfill de execucoes CONFIRMADAS que ficaram com status 'pending'
-- Story: 22.10 - Conversa Limpa (AC7)
--
-- CONTEXTO
-- Ate a Story 22.10, o `POST /api/agent/executions/[id]/confirm` gravava
-- briefing/cost_estimate/total_steps mas NAO mudava o status: uma execucao confirmada,
-- com steps rodando e gastando dinheiro, continuava 'pending' — exatamente o mesmo
-- status de uma conversa abandonada no meio do briefing. O valor 'running' era declarado
-- no tipo `ExecutionStatus` mas NUNCA escrito por nenhum codigo.
--
-- A 22.10 corrige a semantica (confirm -> 'running' + started_at) e, com o discriminador
-- passando a existir de verdade, estreita o reattach-no-mount do AgentChat para
-- status IN ('running','paused'). Sem este backfill, execucoes confirmadas ANTES do
-- deploy (que ficaram 'pending') sumiriam do reattach e virariam "execucao fantasma":
-- steps rodando server-side, invisiveis na UI.
--
-- CRITERIO
-- `cost_estimate IS NOT NULL` e o marcador confiavel de "passou pelo confirm" — e o UNICO
-- ponto do codigo que grava essa coluna (confirm/route.ts). `completed_at IS NULL` protege
-- execucoes ja encerradas. Briefings abandonados (pending SEM cost_estimate) NAO sao
-- tocados de proposito: continuam 'pending', deixam de reatachar — o objetivo da story.
--
-- SEGURANCA
-- Idempotente e re-rodavel: o WHERE exige status = 'pending', entao uma segunda execucao
-- nao encontra mais linhas. Nao-destrutiva (nao apaga nem sobrescreve dado de negocio).
-- Defensiva com to_regclass: o banco do cliente e gerido a mao e pode ter drift de schema.
-- `agent_executions.status` e VARCHAR(20) sem CHECK (00047:8) — 'running'/'cancelled' NAO
-- exigem ALTER de schema (zero migration de schema, NFR5 da story).

DO $$
DECLARE
  affected INTEGER := 0;
BEGIN
  IF to_regclass('public.agent_executions') IS NULL THEN
    RAISE NOTICE '[00063] Tabela public.agent_executions nao existe — nada a fazer.';
    RETURN;
  END IF;

  -- `started_at` acompanha o status: o POST /confirm passa a gravar ambos desde a 22.10.
  -- No backfill o instante real do confirm nao existe -> COALESCE com created_at (o mais
  -- proximo disponivel) evita linhas 'running' com started_at NULL (anomalia para qualquer
  -- leitor que assuma running => started_at). COALESCE nao mexe em quem ja tem started_at.
  UPDATE public.agent_executions
  SET status = 'running',
      started_at = COALESCE(started_at, created_at)
  WHERE status = 'pending'
    AND cost_estimate IS NOT NULL
    AND completed_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[00063] Execucoes confirmadas migradas de pending -> running: %', affected;

  -- COMMENT DENTRO do bloco guardado: num banco com drift (tabela/coluna ausente) o
  -- to_regclass acima ja retornou; rodar o COMMENT fora do DO abortaria a migration
  -- justamente no cenario que a defensividade existe para proteger.
  EXECUTE $comment$
    COMMENT ON COLUMN public.agent_executions.status IS
      'Ciclo de vida da execucao do agente: pending (briefing em andamento, ainda nao confirmado) -> running (confirmada, steps rodando; escrito pelo POST /confirm desde a Story 22.10) -> completed | paused (erro, retry possivel) | cancelled (abandonada pelo usuario via "Nova conversa", terminal).'
  $comment$;
END $$;
