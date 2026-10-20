---
title: 'Story 24.1: Etapa travada é destravada sozinha'
type: 'bugfix'
created: '2026-10-20'
status: 'awaiting-operator'
baseline_revision: 'b874d5470defcd2f7bab2b711708adf1f41d50e0'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      O sweeper SQL só tem teste estrutural (texto do .sql); nenhum teste automatizado executa a função.
    evidence: |-
      O repo não tem harness que execute SQL (sem pg/pglite/pg-mem no package.json); a convenção de __tests__/unit/migrations é textual. Mitigado nesta story por execução manual em PGlite (scratchpad) cobrindo todas as linhas SQL da matriz. Resolve-se adicionando um harness PGlite como devDependency numa story própria.
    location: >-
      __tests__/unit/migrations/00067-sweep-stuck-agent-steps.test.ts
    severity: medium
  - summary: >-
      Execução pode ficar em running sem nenhum step running (morte entre steps no autopilot) e o sweeper não a vê.
    evidence: |-
      Pré-existente e fora dos ACs da 24.1, que tratam de step preso. O sweeper parte de agent_steps.status='running'; uma execução running com step N completed e N+1 pending não é detectada. A 24.3 já reporta falha do triggerNextStep (report-trigger-failure.ts), mas uma morte do processo entre steps não é coberta.
    location: >-
      supabase/migrations/00067_sweep_stuck_agent_steps.sql
    severity: medium
operator_actions:
  - "Na janela de deploy combinada, rode no SQL Editor de produção a query de pré-checagem (somente leitura) do cabeçalho de supabase/migrations/00067_sweep_stuck_agent_steps.sql e revise quais steps/execuções antigas serão liberados (e quais conversas ganharão a bolha de erro)."
  - "Aplique supabase/migrations/00067_sweep_stuck_agent_steps.sql no SQL Editor de produção (cria a função public.sweep_stuck_agent_steps e o job pg_cron agent-stuck-steps-sweep a cada 2 min)."
  - "Confirme o agendamento com SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'agent-stuck-steps-sweep'; e, após ~2 min, veja em cron.job_run_details que a execução terminou com status succeeded."
  - "Faça deploy do código (base-step.ts) para a main/Vercel e rode um smoke: abra no agente uma execução que tenha sido liberada (ou provoque um step parado há mais de 10 min) e confira step failed, execução paused, bolha de erro e o botão Tentar novamente — sem ativar campanha de teste no Instantly."
---

<intent-contract>

## Intent

**Problem:** Um step do agente que morre no meio (timeout de 300s da rota, deploy, erro de gravação) fica em `running` para sempre. Desde a 24.2 o CAS de entrada só aceita `pending`/`failed`/`awaiting_approval`, então nem o "Tentar novamente" o destrava, e a execução fica presa. Além disso, `saveCheckpoint`, `saveAwaitingApproval` e `saveFailure` (`base-step.ts`) ignoram o `{ error }` que o supabase-js devolve em vez de lançar, e isso é a principal fonte de steps presos em silêncio.

**Approach:** (1) Uma função SQL `public.sweep_stuck_agent_steps()` agendada via pg_cron faz CAS `running → failed` nos steps com `started_at` acima do limite (10 min), pausa a execução (CAS em `running`) e escreve a bolha de erro. (2) As três gravações do `base-step.ts` passam a checar `{ error }` com retry curto. Se a falha persistir: checkpoint/aprovação viram falha explícita do step, e o `saveFailure` loga em alto e bom som (o sweeper é a rede de segurança).

## Boundaries & Constraints

**Always:**
- Migration nova `00067`, **aditiva e idempotente**: `CREATE OR REPLACE FUNCTION`, `REVOKE`, `COMMENT` e o agendamento do cron no padrão `unschedule-if-exists` + `schedule` da 00056. Não aplicar em produção: aplicar e registrar o cron são ações do operador (Fabossi, via SQL Editor, na janela de deploy combinada).
- O sweeper preserva o output parcial da 24.2: `output = output(objeto) || {error: {...}}`. Nunca apagar `externalCampaignId`.
- Erro gravado pelo sweeper: `code: 'STEP_INTERRUPTED'`, `message: 'Etapa interrompida — tente novamente'`, `isRetryable: true`, mais `stepNumber`/`stepType` (assim a UI da 24.3 mostra o botão "Tentar novamente" e a rota execute da 24.2 aceita o `failed`).
- A execução só vai para `paused` se ainda estiver `running` (CAS; nunca toca `cancelled`/`completed`/`paused`). A bolha só é inserida quando o sweeper de fato pausou a execução, para não duplicar a bolha que o orchestrator já escreveu.
- A bolha segue o formato de `Orchestrator.sendErrorMessage`: `role 'system'`, `metadata.messageType 'error'`, `metadata.stepNumber`, `metadata.error {code, isRetryable}`. O mesmo texto vai para `agent_executions.error_message`.
- A função não é chamável pela API: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`. Sem `SECURITY DEFINER` (o pg_cron roda como `postgres`).
- Retry curto de gravação: 3 tentativas com atraso `[0, 300, 1000]` ms, cobrindo tanto o `{ error }` retornado quanto exceção lançada.

**Never:**
- Não criar Edge Function nem rota HTTP para o sweeper, não mexer em secrets/Vault e não executar a migration contra o banco do `.env.local` (produção).
- Não tocar export/ativação/Instantly, webhook, `reply-sweep`, busca de leads, nem os jobs cron existentes.
- Não mudar o CAS de entrada em `running` (`updateStepStatus`) nem o contrato de `recordPartialOutput`.
- Não registrar custo (`recordExecutionCost`) no sweeper: o custo da execução pausada fica como está (limitação aceita).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Step morto | step `running`, `started_at` = now−15min, execução `running` | step `failed` + `error_message`/`output.error` STEP_INTERRUPTED (parcial preservado); execução `paused` + `error_message`; 1 bolha de erro | — |
| Step recente | `running`, `started_at` = now−2min | nada muda | — |
| Corrida | step terminou (`completed`) entre o SELECT e o UPDATE | CAS `WHERE status='running'` não atualiza | — |
| Execução já pausada/cancelada | step preso, execução `paused` ou `cancelled` | step vira `failed`; execução intacta; sem bolha nova | — |
| `started_at` nulo | step `running` com `started_at NULL` | usa `created_at` como referência | — |
| Gravação de checkpoint/aprovação falha 1x | 1º update retorna `{error}`, 2º ok | step gravado normalmente | retry silencioso + log |
| Gravação de checkpoint/aprovação falha 3x | todas retornam `{error}` | `run()` lança `STEP_PERSISTENCE_ERROR` (retryable), `saveFailure` grava `failed` | falha explícita |
| `saveFailure` falha 3x | todas retornam `{error}`/lançam | `console.error` explícito; `run()` ainda lança o erro ORIGINAL do step | sweeper libera o step depois |

</intent-contract>

## Code Map

- `src/lib/agent/steps/base-step.ts` -- `run()` (template), `saveAwaitingApproval`, `saveCheckpoint`, `saveFailure` hoje sem checagem de `{ error }`. `recordPartialOutput` já mostra o padrão de checar `{ error }` + `try/catch`. `toPipelineError` hoje converte objeto não-Error em "Erro desconhecido", então precisa deixar passar um `PipelineError` já pronto.
- `src/lib/agent/orchestrator.ts:56` -- `isPipelineError` (não importar no base-step, porque o orchestrator importa os steps e criaria ciclo; replicar uma guarda local). `:637` `pauseWithError`/`buildErrorContent`/`sendErrorMessage` (formato da bolha que o SQL espelha). `:515` um `STEP_ALREADY_RUNNING` não pausa.
- `src/lib/agent/step-error-display.ts` -- `isStepErrorRetryable` lê `output.error.isRetryable`; `getStepErrorMessage` lê `error_message`.
- `src/types/agent.ts:389` -- `STEP_LABELS` (Busca de Empresas, Busca de Leads, Criacao de Campanha, Exportacao, Ativacao); o SQL usa o mesmo mapeamento.
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts:23` -- `maxDuration = 300`: o limite de 10 min fica acima de qualquer execução viva.
- `supabase/migrations/00048_create_agent_steps.sql`, `00047_...executions.sql`, `00049_...messages.sql` -- schemas (status VARCHAR sem CHECK; `error_message TEXT` nas duas tabelas).
- `supabase/migrations/00056_schedule_reply_sweep_cron.sql` -- padrão de agendamento idempotente; `00063` -- padrão de bloco defensivo/comentado.
- `__tests__/unit/lib/agent/steps/base-step.test.ts` (+ `base-step-approval.test.ts`) -- mocks via `createChainBuilder` de `__tests__/helpers/mock-supabase`, com fake timers ligados.
- `__tests__/unit/migrations/00042-whatsapp-messages.test.ts` -- padrão de teste estrutural de migration (lê o .sql como texto).

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/00067_sweep_stuck_agent_steps.sql` -- criar `public.sweep_stuck_agent_steps(p_timeout INTERVAL DEFAULT INTERVAL '10 minutes') RETURNS INTEGER` (plpgsql): `FOR r IN UPDATE agent_steps ... WHERE status='running' AND COALESCE(started_at, created_at) < now() - p_timeout RETURNING ...`; para cada linha, fazer CAS na execução para `paused` e, se pausou, inserir a bolha. Texto da bolha: `Erro na etapa "<label>": Etapa interrompida — tente novamente. A etapa ficou mais de <N> minutos sem terminar e foi liberada automaticamente. Clique em "Tentar novamente" na etapa para refazer.` Retornar a quantidade de steps liberados. Incluir `REVOKE`, `COMMENT` e o cron `agent-stuck-steps-sweep` a cada 2 min (`*/2 * * * *`), com `CREATE EXTENSION IF NOT EXISTS pg_cron` e instruções de rollback em comentário -- AC1.
- `src/lib/agent/steps/base-step.ts` -- adicionar o helper privado de gravação com retry curto. `saveCheckpoint`/`saveAwaitingApproval` lançam `PipelineError` `STEP_PERSISTENCE_ERROR` ("Nao foi possivel salvar o resultado da etapa", `isRetryable: true`) quando a falha persiste. `saveFailure` loga e nunca lança, e o `catch` do `run()` relança o erro original. `toPipelineError` devolve `PipelineError` recebido sem alterar -- AC2.
- `__tests__/unit/lib/agent/steps/base-step.test.ts` -- testes dos 3 caminhos: erro transitório recupera; erro persistente em checkpoint e em awaiting_approval → `saveFailure` gravando `failed` + rejeição `STEP_PERSISTENCE_ERROR`; erro persistente em `saveFailure` → loga e rejeita com o erro original; exceção lançada (não só `{error}`) também é tratada.
- `__tests__/unit/migrations/00067-sweep-stuck-agent-steps.test.ts` -- teste estrutural: CAS `status = 'running'`, limite de 10 min, `STEP_INTERRUPTED`/`isRetryable` true, preservação do output (`||`), CAS da execução em `running`, `messageType` `error`, `REVOKE`, unschedule idempotente + `cron.schedule`, ausência de `DROP TABLE`/`DELETE FROM`/`ALTER TABLE`.

**Acceptance Criteria:**
- Given um step `running` com `started_at` mais antigo que 10 min, when `SELECT public.sweep_stuck_agent_steps()` roda, then o step fica `failed` com "Etapa interrompida — tente novamente", a execução vai para `paused` e há uma bolha de erro explicando, e a UI mostra "Tentar novamente".
- Given o sweeper e uma conclusão concorrente, when o step já saiu de `running`, then o sweeper não o altera (CAS).
- Given `{ error }` persistente em qualquer das três gravações do `base-step.ts`, when o step roda, then nada fica em `running` silenciosamente: há retry curto e depois falha explícita (status `failed` gravado ou log de erro com o step identificado).

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 21 findings — high 0, medium 3, low 8, false 10, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Sweeper reverte o trade-off da 24.2 e o comentário "TRADE-OFF ACEITO" em updateStepStatus ficou desatualizado — retry é seguro (activate faz pre-flight no Instantly, 22.18; export reaproveita externalCampaignId e pula leads presentes, 24.2); patch: comentário reescrito citando o sweeper e a idempotência.
  - `[low]` `[reject]` (blind) Gravações sem `.eq('status','running')` permitem processo "vivo" após 10 min sobrescrever o sweep — inalcançável em produção (maxDuration=300s na rota execute); fix adiciona guarda de estado não demonstrado.
  - `[medium]` `[patch]` (blind) Primeiro run do cron libera steps históricos em produção (pausa + bolha em conversas antigas) sem pré-checagem — patch: query de pré-checagem somente leitura no cabeçalho da migration + aviso de que cria job pg_cron; vira operator_action.
  - `[false]` `[reject]` (blind) Falta Completion Notes / checagem dos 3 pontos — registrado na finalização (Auto Run Result/Completion Notes); fix seria editar a spec. Check PGlite foi executado (ver Verificação).
  - `[false]` `[reject]` (blind) Checkpoint falho após ativação vira failed retryable e o retry reenviaria — activate-step.ts faz pre-flight do estado no Instantly e não dispara activate se já Active/Paused/Completed; export reaproveita a campanha e deduplica leads.
  - `[medium]` `[defer]` (blind) Execução presa em running sem step running não é vista pelo sweeper — pré-existente e fora dos ACs (step preso); registrado em deferred.
  - `[low]` `[patch]` (blind) Função sem search_path fixo (linter Supabase) — patch: `SET search_path = ''` + asserção no teste; PGlite reexecutado ok.
  - `[low]` `[reject]` (blind) Testes não verificam que o retry espera 300 ms / update com 0 linhas conta como salvo — regressão improvável; 0 linhas é semântica pré-existente; fix adiciona testes/guardas.
  - `[low]` `[patch]` (blind) Asserção do cron dependente de LF/indentação — patch: regex tolerante a whitespace.
  - `[false]` `[reject]` (blind) isPipelineErrorLike repassa PipelineError de outro step — nenhum caminho alcança: só STEP_PERSISTENCE_ERROR chega ao catch como PipelineError (STEP_ALREADY_RUNNING é lançado fora do try).
  - `[false]` `[reject]` (edge) Checkpoint falha 3x após efeito no Instantly → retry refaz export/ativação — mesmo refutado acima: retry idempotente por pre-flight (activate) e reaproveitamento/dedupe (export).
  - `[low]` `[reject]` (edge) Update comitado no servidor mas erro no cliente 3x → saveFailure sobrescreve completed — exige 3 falhas pós-commit seguidas; resultado é step failed retryable com retry idempotente; fix adiciona guarda.
  - `[low]` `[reject]` (edge) saveFailure sem guarda de status pode sobrescrever completed de gravação ambígua — mesma raiz/probabilidade do item anterior.
  - `[false]` `[reject]` (edge) p_timeout zero/negativo força falha de steps vivos — função revogada de PUBLIC/anon/authenticated; o cron usa o default de 10 min; só superusuário manual chegaria lá.
  - `[low]` `[reject]` (edge) "1 minutos" com p_timeout ≤ 1 min — só com parâmetro custom; fix adiciona ramo.
  - `[medium]` `[defer]` (verification-gap) Sweeper SQL só tem teste textual — gap real pré-verificado; repo sem harness SQL; mitigado por execução PGlite manual de toda a matriz; registrado em deferred.
  - `[false]` `[reject]` (intent) Status awaiting-operator/operator_actions ausentes — estado intermediário do run; aplicado na finalização.
  - `[false]` `[reject]` (intent) SQL testado só como texto — duplicata do item verification-gap (mesma rota defer).
  - `[false]` `[reject]` (intent) Leitura estrita: saveFailure persistente deixa step running até o sweeper — se o banco recusa a gravação não há onde registrar na requisição; falha explícita = log + bolha/pausa do orchestrator + sweeper (escolha do spec).
  - `[false]` `[reject]` (intent) Teste 24.2 "erro ao gravar o parcial" ficou mais estreito — a premissa antiga (todas as gravações falham e o step termina com sucesso) contradiz o AC2; o comportamento do parcial continua coberto.
  - `[false]` `[reject]` (intent) Completion Notes ausentes — tratado na finalização.

## Design Notes

PL/pgSQL aceita `FOR rec IN UPDATE ... RETURNING ... LOOP`. Em READ COMMITTED, o UPDATE reavalia o `WHERE status='running'` sobre a versão mais nova da linha, e é isso que garante o compare-and-swap. A saída `output` precisa de guarda de tipo: `CASE WHEN jsonb_typeof(output) = 'object' THEN output ELSE '{}'::jsonb END || jsonb_build_object('error', ...)`.

## Verification

**Commands:**
- `npm run lint` -- expected: sem erros
- `npm run typecheck` -- expected: sem erros
- `npm run test:run` -- expected: tudo verde

**Manual checks (if no CLI):**
- Aplicar a função (sem o bloco `cron.*`) num Postgres local descartável (`initdb` no scratchpad) com as 3 tabelas mínimas e rodar os cenários da matriz. Nunca no banco do `.env.local`.

## Auto Run Result

Status: awaiting-operator

**Resumo:** etapa do agente presa em `running` agora é liberada sozinha. A função SQL `public.sweep_stuck_agent_steps()` (pg_cron `agent-stuck-steps-sweep`, a cada 2 min) faz CAS `running → failed` nos steps com mais de 10 min, grava `STEP_INTERRUPTED` retryable ("Etapa interrompida — tente novamente") preservando o output parcial da 24.2, pausa a execução (CAS em `running`) e escreve a bolha de erro. No `base-step.ts`, checkpoint, aprovação e falha checam `{ error }`/exceção com retry curto (0/300/1000 ms). Se checkpoint ou aprovação falham de vez, o step vira `failed` com `STEP_PERSISTENCE_ERROR` retryable. Se o `saveFailure` falha de vez, o erro é logado, o erro original é relançado e o sweeper libera o step depois.

**Arquivos:**
- `supabase/migrations/00067_sweep_stuck_agent_steps.sql`: função do sweeper, REVOKE, COMMENT, cron idempotente, pré-checagem e rollback em comentário.
- `src/lib/agent/steps/base-step.ts`: `persistStepUpdate` com retry curto, `STEP_PERSISTENCE_ERROR`, passthrough de PipelineError em `toPipelineError`, comentário do trade-off atualizado.
- `__tests__/unit/lib/agent/steps/base-step.test.ts`: 6 casos novos (transitório, persistente em checkpoint/aprovação/falha, exceção lançada, passthrough); 1 teste da 24.2 ajustado.
- `__tests__/unit/migrations/00067-sweep-stuck-agent-steps.test.ts`: teste estrutural da migration.

**Review:** 21 achados. 4 patches (1 medium: pré-checagem do primeiro run; 3 low: comentário do trade-off, search_path, regex do teste). 2 deferidos (teste SQL executável; execução presa entre steps). 15 rejeitados, com os motivos no Review Triage Log. Follow-up review: `false` (só 1 medium aplicado, nenhum high).

**Verificação:**
- `npm run lint`: 0 erros (134 warnings pré-existentes).
- `npm run typecheck`: limpo.
- `npm run test:run`: 429 arquivos, 8103 testes passando (2 skipped).
- Execução real da função em PGlite (Postgres WASM no scratchpad, sem o bloco cron), cobrindo todas as linhas SQL da matriz:
  - step de 15 min liberado com `externalCampaignId` preservado, execução `paused` e 1 bolha;
  - step de 2 min e step completed intactos;
  - execução paused/cancelled intacta e sem bolha;
  - `started_at` nulo usa `created_at`;
  - segunda rodada libera 0 steps;
  - anon/authenticated não conseguem executar a função.
- Linhas TS da matriz cobertas pelos testes unitários. Nada foi executado contra o banco do `.env.local`.

**Completion Notes (regra nº 1 do CLAUDE.md):** o que pode mudar para o cliente:
- `agent_steps`, `agent_executions` e `agent_messages`: só quando o cron rodar, e só para steps parados há mais de 10 min.
- O comportamento do `BaseStep` quando a gravação de estado falha.
- Um job pg_cron novo (ainda não aplicado).

Os 3 pontos foram confirmados **por análise do diff**, sem smoke real, porque a migration não foi aplicada:
1. Campanhas rodando e o recebimento de respostas e aberturas não são tocados (webhook, `reply-sweep` e os crons existentes ficam iguais).
2. A busca de leads não muda.
3. Criação, export e ativação no Instantly não ganham trava nova. Um step parado agora pode ser refeito, e o retry é idempotente (pre-flight do activate e reaproveitamento/dedupe do export).

**Riscos residuais:**
- O primeiro run libera steps históricos presos e posta bolha em conversas antigas (a pré-checagem mostra quais).
- O custo da execução pausada pelo sweeper não é recalculado.
- Os 2 itens deferidos.

**Pendente do operador:** ver `operator_actions` no frontmatter.
