---
title: '24.3 — Avanço confiável e "Tentar novamente"'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: '255f941d385e7ac38780bb1b725ab1854965dec6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      O AgentActivationGate trata o 409 superseded (STEP_ALREADY_RUNNING/STEP_NOT_EXECUTABLE) como erro e rearma o card.
    evidence: |-
      AgentActivationGate.tsx:201 faz `if (!outcome.alreadyReported) setError(outcome.message)` sem olhar `superseded`. Num clique duplo ou numa 2a aba, a ativacao em andamento aparece como erro e o card volta clicavel. O 2o clique toma 409 de novo (o CAS da 24.2 impede a ativacao dupla), entao nao ha cobranca, so um aviso enganoso. Codigo da 22.18, intocado de proposito por esta story.
    location: >-
      src/components/agent/AgentActivationGate.tsx:201
    severity: low
  - summary: >-
      Um step preso em running (function morta por timeout ou crash) continua sem saida pela UI.
    evidence: |-
      O maxDuration=300 so empurra o limite. Um 504 sem corpo JSON vira aviso retryable, mas o retry toma 409 STEP_NOT_EXECUTABLE (superseded) e o aviso some, com o step girando para sempre no painel. A deteccao de running velho e escopo da 24.1 (sweeper pg_cron, FR11/FR12).
    location: >-
      src/lib/agent/client-utils.ts executeStepChecked / src/lib/agent/steps/base-step.ts
    severity: medium
  - summary: >-
      No modo guiado, uma falha pre-orchestrator no disparo apos aprovar um gate perde a unica saida depois de um F5.
    evidence: |-
      O aviso com "Tentar novamente" e efemero (store). Depois do F5 o step N+1 fica pending, o card ja mostra aprovado e o painel nao tem botao para step pending. Antes desta story nao havia saida nem na mesma sessao (o problema ja existia). No autopilot o auto-trigger redispara.
    location: >-
      src/stores/use-agent-store.ts stepTriggerFailure / src/components/agent/AgentStepProgress.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A rota `POST .../steps/[n]/execute` não declara `maxDuration`, então um step longo morre no meio. Três dos quatro gates (`AgentApprovalGate`, `AgentLeadReview`, `AgentCampaignPreview`) e o `useAutoTrigger` disparam o próximo step com `.catch(() => {})`: um 4xx/5xx some em silêncio e a execução fica parada sem aviso. Um step `failed` não tem como ser refeito pela UI (só "Nova conversa"), e quando é refeito a execução continua `paused`.

**Approach:** Declarar `maxDuration = 300` na rota. Todo disparo de step passa por uma função que verifica a resposta. Quando a falha não virou bolha no chat (pré-orchestrator), um aviso de erro com botão "Tentar novamente" aparece no chat. A linha do step `failed` no painel de progresso ganha o botão "Tentar novamente" quando o erro é retryable. O orchestrator tira a execução de `paused` ao reexecutar. As mensagens de erro passam por um único formatador coerente com `isRetryable`.

## Boundaries & Constraints

**Always:**
- O retry chama a mesma rota `POST .../execute`, então valem os guards da 24.2 (409 fora de `pending`/`failed`/rejeitado, CAS do base-step, export idempotente).
- Erro é retryable quando `step.output.error.isRetryable !== false`. Se o campo faltar (ex.: falha legada), o erro conta como retryable. Erro não retryable não mostra o botão nem diz "tente novamente" (a mensagem manda falar com o suporte).
- O aviso de falha de disparo fica preso ao `executionId` e só aparece para a execução atual. É efêmero (fora do `partialize`).
- 409 `STEP_ALREADY_RUNNING` / `STEP_NOT_EXECUTABLE` no disparo significa que outro executor cuidou do step. Não é falha e não gera aviso.
- O `paused → running` usa CAS (`.eq("status","paused")`), e um erro de escrita só é logado (não bloqueia o retry).
- Prod-safe (CLAUDE.md): sem migration, cron, Edge Function ou secret. Nenhuma trava nova no caminho até o Instantly.

**Never:**
- Não mexer no `AgentActivationGate` (a 22.18 já verifica o disparo e não mostra "ativada" sem ativação), no `instantly.ts`, nem no export/base-step da 24.2.
- Não tratar `{ error }` de `saveCheckpoint`/`saveAwaitingApproval`/`saveFailure` nem criar sweeper/TTL (isso é da 24.1). Não mexer nas respostas do chat pós-briefing (24.4).
- Não persistir o aviso no banco (nada de `agent_messages` novo para isso).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Disparo ok | gate aprova, execute 2xx | Nenhum aviso | — |
| Disparo falha pré-orchestrator | execute 422 `API_KEY_NOT_FOUND` / 500 / rede | Aviso no chat com a mensagem do servidor (ou o fallback) e o botão "Tentar novamente", que redispara o mesmo step | Retry que falha de novo substitui o aviso |
| Disparo falha pós-orchestrator | 503/500 com `reportedInChat: true` | Sem aviso (a bolha já existe). O step fica `failed` e o botão aparece na linha dele | — |
| Disparo concorrente | 409 `STEP_ALREADY_RUNNING`/`STEP_NOT_EXECUTABLE` | Sem aviso | — |
| Disparo não retryable | `isRetryable:false` (ex.: `ORCHESTRATOR_STEP_NOT_READY`) ou 409 `EXECUTION_NOT_ACTIVE` | Aviso com a mensagem, sem botão | — |
| Step failed retryable | `status:failed`, `output.error.isRetryable:true` | A linha mostra o erro e o botão. O clique faz POST execute daquele step. O botão fica desabilitado enquanto roda | Falha pré-orchestrator → aviso no chat |
| Step failed não retryable | `output.error.isRetryable:false` | Linha com a mensagem sem "tente novamente" e sem botão | — |
| Retry com execução pausada | execução `paused`, step `failed` | O orchestrator grava `running` (CAS) antes de rodar o step. Uma nova falha volta a `paused` | Erro do update → log, segue |
| Mensagem do orchestrator | erro retryable | "...: <msg>. Clique em \"Tentar novamente\" na etapa para refazer." | Não retryable: tira "tente novamente" da msg e termina com "Entre em contato com o suporte." |

</intent-contract>

## Code Map

- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` -- sem `maxDuration`. O padrão já existe em `src/app/api/opportunities/[opportunityId]/suggestion/route.ts:37`. O `vercel.json` só limita `src/app/api/ai/**` (não afeta esta rota).
- `src/lib/agent/client-utils.ts` -- `triggerNextStep` (cru, 3 gates usam) e `triggerNextStepChecked` (classifica `ok/skipped/failed` + `alreadyReported`). O outcome `failed` não carrega `code` nem `isRetryable`.
- `src/components/agent/AgentApprovalGate.tsx:80`, `AgentLeadReview.tsx:177`, `AgentCampaignPreview.tsx:134` -- `triggerNextStep(...).catch(() => {})` depois do approve.
- `src/hooks/use-auto-trigger.ts:24-33` -- `triggerStep` com fetch cru e `.catch(() => {})` (:97).
- `src/components/agent/AgentActivationGate.tsx:201` -- já usa `triggerNextStepChecked`. É só referência, não mexer.
- `src/lib/agent/orchestrator.ts` -- `executeStep` (:98). `const executionData` em :182 é o ponto para o `paused→running`. `sendErrorMessage` (:532-574) tem a sanitização "tente novamente" (22.12) que vai virar o formatador compartilhado. `updateExecutionStatus` (:514) é o CAS de referência.
- `src/components/agent/AgentStepProgress.tsx` -- `StepRow` mostra `— {step.error_message}` cru (:86). Não tem botão.
- `src/components/agent/AgentChat.tsx:1065-1070` -- renderiza `AgentStepProgress`. `useAutoTrigger` em :233. `currentExecutionId`/`attachedExecutionId` em :140.
- `src/stores/use-agent-store.ts` -- padrão de estado efêmero ligado ao `executionId` (`adjustingStep`, `pendingChipAdjustment`). `partialize` em :146 persiste só o id.
- Testes: `__tests__/unit/lib/agent/client-utils.test.ts`, `__tests__/unit/hooks/use-auto-trigger.test.ts`, `__tests__/unit/components/agent/AgentStepProgress.test.tsx`, `__tests__/unit/lib/agent/orchestrator.test.ts` (:313-381 `sendErrorMessage`), `__tests__/unit/stores/use-agent-store.test.ts`, testes dos 3 gates em `__tests__/unit/components/agent/`, `__tests__/unit/api/agent/executions-steps-execute.test.ts`.

## Tasks & Acceptance

**Execution:**
- `src/lib/agent/step-error-display.ts` (novo) -- `formatStepErrorMessage(message, isRetryable)` (a sanitização movida do orchestrator) e `isStepErrorRetryable(step)` (`output.error.isRetryable !== false`). -- fonte única da coerência.
- `src/lib/agent/orchestrator.ts` -- `sendErrorMessage` usa o formatador, e o `retryPart` retryable vira ` Clique em "Tentar novamente" na etapa para refazer.`. Em `executeStep`, se `execution.status === "paused"`, gravar `running` com `.eq("status","paused")`, checando `{ error }` → `console.error`. -- AC3 (sai de paused).
- `.../execute/route.ts` -- `export const maxDuration = 300;` com comentário. -- AC1.
- `src/lib/agent/client-utils.ts` -- `executeStepChecked(executionId, stepNumber)`: a classificação sai de `triggerNextStepChecked`, que passa a delegar para ela. O outcome `failed` ganha `code?`, `retryable` (`false` quando `isRetryable === false` ou `EXECUTION_NOT_ACTIVE`, `true` na rede/ausente) e `superseded` (409 `STEP_ALREADY_RUNNING`/`STEP_NOT_EXECUTABLE`). `triggerNextStep` fica (compat). Os campos novos são aditivos, o `AgentActivationGate` continua compilando.
- `src/stores/use-agent-store.ts` -- `stepTriggerFailure: { executionId, stepNumber, message, retryable } | null` + `setStepTriggerFailure`/`clearStepTriggerFailure`, fora do `partialize`.
- `src/lib/agent/report-trigger-failure.ts` (novo) -- `reportTriggerFailure(outcome, executionId, stepNumber)`: grava no store só se `failed && !alreadyReported && !superseded`. -- regra única para gates, auto-trigger e botões.
- `AgentApprovalGate.tsx`, `AgentLeadReview.tsx`, `AgentCampaignPreview.tsx` -- trocar pelo `triggerNextStepChecked` (não aguardado, o card continua "aprovado") + `reportTriggerFailure` com `stepNumber + 1`. -- AC2.
- `src/hooks/use-auto-trigger.ts` -- `triggerStep` usa `executeStepChecked` + `reportTriggerFailure`. -- AC2.
- `src/components/agent/AgentStepProgress.tsx` -- prop opcional `onRetryStep?(stepNumber): Promise<void>`. Na linha `failed`: mensagem via formatador. Se retryable e houver `onRetryStep`, mostrar o botão "Tentar novamente" (`data-testid="step-retry-<n>"`), desabilitado durante a chamada.
- `src/components/agent/AgentStepTriggerError.tsx` (novo) -- aviso no chat (estilo da bolha de erro) com a mensagem e, se `retryable`, o botão "Tentar novamente" (`data-testid="step-trigger-retry"`), que limpa o aviso, chama `executeStepChecked` e reporta de novo.
- `src/components/agent/AgentChat.tsx` -- passar `onRetryStep` (`executeStepChecked` + `reportTriggerFailure` sobre `attachedExecutionId`, limpando um aviso anterior). Renderizar `AgentStepTriggerError` quando `stepTriggerFailure.executionId === attachedExecutionId`. Limpar o aviso em "Nova conversa".
- Testes -- cada linha da I/O Matrix: client-utils (code/retryable/superseded), use-auto-trigger (falha → store, 409 → nada), os 3 gates (falha não aguardada → store), AgentStepProgress (botão sim/não, clique, disabled), AgentStepTriggerError, orchestrator (`paused→running` CAS + texto novo), store, rota (`maxDuration === 300`). RED provado nos casos de gate e auto-trigger.

**Acceptance Criteria:**
- Given a rota de execução de step, when o módulo é carregado, then exporta `maxDuration = 300`.
- Given o disparo do próximo step (gate ou auto-trigger), when a resposta não é 2xx e o erro não foi reportado no chat, then o usuário vê o erro no chat com um botão para tentar de novo, e o `AgentActivationGate` continua sem mostrar "ativada" antes da ativação ter rodado.
- Given um step `failed` retryable com a execução `paused`, when o usuário clica "Tentar novamente" na linha do step, then o step é reexecutado pela rota execute (guards da 24.2) e a execução volta a `running`.
- Given um erro não retryable, when ele aparece no chat ou na linha do step, then o texto não diz "tente novamente" e não há botão de retry.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 30 findings — high 0, medium 4, low 18, false 8, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) O "Tentar novamente" do aviso limpa o store antes do await, entao o aviso desmonta na hora (sem spinner, setState em componente desmontado) — agora aguarda o resultado e so entao limpa e reporta. Teste novo (botao desabilitado durante a chamada, aviso ainda no store).
  - `[low]` `[defer]` (blind) O AgentActivationGate ignora `superseded` e mostra o 409 de concorrencia como erro — codigo da 22.18, intocado por decisao da spec. Sem cobranca (CAS da 24.2). Foi para `deferred`.
  - `[low]` `[patch]` (blind) O comentario do client-utils dizia "os 4 gates" usam a regra nova — corrigido para 3 gates + auto-trigger + botoes + step 1 apos confirm, com o gate de ativacao mantendo o tratamento da 22.18.
  - `[medium]` `[defer]` (blind) Step preso em `running` continua sem saida — ja existia antes, e a deteccao e escopo da 24.1 (sweeper). Foi para `deferred`, agrupado com o 504 da edge.
  - `[medium]` `[defer]` (blind) O aviso some no F5 e o modo guiado fica sem saida — a parada ja existia (antes nem na sessao havia aviso). O residuo esta aceito na Design Note. Foi para `deferred`.
  - `[low]` `[reject]` (blind) O aviso nao some quando o step avanca por outro caminho (outra aba, realtime) — exige concorrencia entre abas ou timeout, e a correcao exige um efeito novo no AgentChat.
  - `[low]` `[reject]` (blind) O sanitizador corta "Tente novamente em alguns minutos" e deixa fragmento — so atua em erro nao retryable. As mensagens citadas (rate limit da Apollo, servico indisponivel) sao 429/503, que sao retryable e nao sao sanitizadas. As nao retryable reais ("Erro interno. Tente novamente.") ficam integras.
  - `[low]` `[patch]` (blind) A mensagem de rede dizia "etapa seguinte" mesmo no retry do mesmo step — rede e fallback agora dizem "a etapa".
  - `[low]` `[reject]` (blind) A bolha aponta para um botao que pode nao existir (falha de escrita do step, historico apos sucesso) — a falha de escrita e da 24.1. A bolha antiga no historico e cosmetica.
  - `[false]` `[reject]` (blind) O retry pela linha limpa o aviso de outro step — um aviso do step N+1 implica o step N aprovado ou concluido. Nao ha um step `failed` e um aviso de outro step ao mesmo tempo na fronteira do pipeline.
  - `[false]` `[reject]` (blind) O botao aparece em execucao cancelada ou concluida — o chat so reatacha `running`/`paused` (AgentChat.tsx:176), o cancel limpa o `currentExecutionId`, e `completed` so ocorre com o ultimo step bem-sucedido.
  - `[low]` `[reject]` (blind) Faltam as Completion Notes do CLAUDE.md e prova de que o retry do export reaproveita a campanha — as notas estao no Auto Run Result abaixo, e o reuso e coberto pelos testes da 24.2 (export-step.test.ts).
  - `[false]` `[reject]` (blind) `maxDuration = 300` depende do plano Vercel — o limite padrao de function ja e 300s em todos os planos (Fluid Compute), entao o valor e aceito.
  - `[low]` `[patch]` (blind) Lacunas de teste (falha do retry no AgentChat, etc.) — o caso do AgentChat entrou junto com o 2o gap da verification-gap. Os demais (retry que volta a `paused`, setTimeout no teste do hook) ja sao cobertos pelos testes de falha existentes do orchestrator ou nao causam dano.
  - `[medium]` `[defer]` (edge) Timeout 504 sem JSON gera aviso retryable, e o retry toma 409 e some — mesma raiz do step preso em `running` (24.1). Agrupado no defer acima.
  - `[low]` `[reject]` (edge) Aviso velho para step que ja avancou — mesmo motivo da 6a linha.
  - `[low]` `[reject]` (edge) 401/404/400 sem `isRetryable` mostram botao — 401 (sessao expirada) pode passar apos relogin, e 404/400 nao sao alcancaveis com ids validos da propria UI. A correcao exige ramo novo.
  - `[low]` `[reject]` (edge) O CAS `paused -> running` com cancel concorrente nao impede o step de rodar — e a mesma janela TOCTOU que ja existia entre o guard terminal da rota e o run (22.10). Raro, e a correcao exige ramo novo.
  - `[low]` `[patch]` (edge) O catch do skip por briefing escreve a bolha mas relanca sem `reportedInChat` (aviso duplicado) — agora relanca com `reportedInChat: true`. Teste novo no orchestrator.
  - `[low]` `[patch]` (edge) Aviso desmonta antes do await — mesmo patch da 1a linha.
  - `[low]` `[patch]` (edge) Mensagem de rede com "etapa seguinte" — mesmo patch da 8a linha.
  - `[medium]` `[patch]` (verification-gap) O step 1 apos confirmar o plano ainda era fire-and-forget (AgentChat `handleConfirmPlan`): falha pre-orchestrator parava em silencio — agora passa por `executeStepChecked` + `reportTriggerFailure`. Teste novo (422 no step 1 vira aviso com `stepNumber: 1`).
  - `[low]` `[patch]` (verification-gap) O ramo de falha do `handleRetryStep` nao tinha teste — teste novo (422 no step 3 vira aviso com `stepNumber: 3`).
  - `[false]` `[reject]` (intent) Falha ja reportada pelo orchestrator mostra a bolha sem botao no chat — o botao fica na linha do step no mesmo painel do chat, e a bolha aponta para ele. Erro e botao ficam visiveis na mesma tela.
  - `[false]` `[reject]` (intent) A clausula "nenhum gate mostra ativada" nao tem teste no diff — ja e garantida e testada pela 22.18 (AgentActivationGate intocado, testes verdes na suite).
  - `[false]` `[reject]` (intent) Nao ha botao nos cards do chat nem na bolha — leitura R3a escolhida na spec. Os gates so existem para steps concluidos, e a linha do painel existe para os 5 steps.
  - `[false]` `[reject]` (intent) A retomada `paused -> running` vale para qualquer execute em execucao pausada, nao so para o retry — so ha execute em execucao `paused` quando alguem retoma um step falho ou rejeitado, que e exatamente "sair de paused".
  - `[low]` `[reject]` (intent) O erro inline do gate de ativacao nao passa pelo formatador — as mensagens ali sao pre-orchestrator, e o card rearma (o retry e possivel), entao nao ha incoerencia pratica. Fora do escopo intocado da spec.
  - `[false]` `[reject]` (intent) O teste so confere a constante, nao o deploy — o limite efetivo no Vercel e 300s por padrao, entao nao ha divergencia de comportamento.
  - `[low]` `[reject]` (intent) So testes unitarios, sem smoke real — um smoke real de retry exigiria provocar falha num step contra producao (CLAUDE.md). A analise dos 3 pontos foi feita pelo diff, registrada abaixo.

## Design Notes

- **Por que aviso no store e não `agent_messages`:** a falha pré-orchestrator não escreve nada no banco, e inserir uma mensagem pelo cliente exigiria metadata nova na rota de mensagens. O aviso efêmero segue o padrão `pendingChipAdjustment` (os gates falam com o store, sem prop drilling). Depois de um F5 o aviso some. No autopilot o auto-trigger redispara, e no guiado isso é um resíduo aceito.
- **Botão na linha do painel de progresso:** é o único "card de step" que existe para todos os 5 steps (os gates só existem para steps que concluíram). A bolha de erro do orchestrator aponta para ele ("na etapa").

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/hooks/use-auto-trigger.test.ts __tests__/unit/components/agent __tests__/unit/stores/use-agent-store.test.ts __tests__/unit/api/agent` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: 0 erros de lint, typecheck limpo, suíte verde

## Auto Run Result

Status: done

**Resumo:** A rota `POST .../steps/[n]/execute` declara `maxDuration = 300`. Todo disparo de step pelo cliente (3 gates de aprovacao, auto-trigger, step 1 apos confirmar e botoes de retry) verifica a resposta via `executeStepChecked`. Uma falha que nao virou bolha no chat aparece como aviso com "Tentar novamente". Um 409 de concorrencia nao gera aviso. A linha do step `failed` no painel de progresso ganhou o botao "Tentar novamente" quando o erro e retryable. O orchestrator tira a execucao de `paused` (CAS) ao reexecutar. A coerencia mensagem/`isRetryable` mora num formatador unico.

**Arquivos alterados:**
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` -- `maxDuration = 300`.
- `src/lib/agent/step-error-display.ts` (novo) -- formatador de erro e `isStepErrorRetryable`.
- `src/lib/agent/client-utils.ts` -- `executeStepChecked` com `code`/`retryable`/`superseded`, e `triggerNextStepChecked` delega a ele.
- `src/lib/agent/report-trigger-failure.ts` (novo) -- regra unica de quando gravar o aviso.
- `src/lib/agent/orchestrator.ts` -- `paused -> running` com CAS, texto do retry e uso do formatador. O skip relanca com `reportedInChat`.
- `src/stores/use-agent-store.ts` -- `stepTriggerFailure` efemero.
- `src/components/agent/AgentStepTriggerError.tsx` (novo) -- aviso no chat com retry.
- `src/components/agent/AgentStepProgress.tsx` -- botao "Tentar novamente" na linha `failed` e mensagem formatada.
- `src/components/agent/AgentChat.tsx` -- `onRetryStep`, render do aviso, limpeza em "Nova conversa" e step 1 verificado.
- `src/components/agent/AgentApprovalGate.tsx`, `AgentLeadReview.tsx`, `AgentCampaignPreview.tsx` -- disparo verificado e reportado.
- `src/hooks/use-auto-trigger.ts` -- disparo verificado e reportado.
- Testes: client-utils, use-auto-trigger, 3 gates, AgentStepProgress, AgentStepTriggerError (novo), step-error-display (novo), report-trigger-failure (novo), orchestrator, store, rota execute, AgentChat.

**Review:** 30 findings. 6 entradas corrigidas por patch (medium 1, low 5): o aviso desmontava antes do await, o comentario dos gates, o texto "etapa seguinte", o skip sem `reportedInChat`, o step 1 apos confirm em fire-and-forget e o teste do ramo de falha do retry. 3 deferidos (step preso em `running` -> 24.1, aviso perdido no F5 no modo guiado, `superseded` ignorado no gate de ativacao). 21 rejeitados, cada um com o motivo no Review Triage Log (8 false, 13 low).

**Follow-up review recomendado:** false. 1a passada com patched high 0, medium 1, low 5.

**Verificacao:** `npm run lint` com 0 erros (134 warnings pre-existentes). `npm run typecheck` limpo. `npm run test:run`: 413 arquivos, 7684 testes passando, 2 skipped. Os testes novos de gate e auto-trigger falharam contra o codigo antigo (5 falhas) e passam no novo. Toda linha da I/O Matrix tem teste cobrindo.

**Completion Notes (CLAUDE.md, regra no 1) -- por analise do diff, sem smoke real:**
- O que pode mudar para o cliente: so o agente TDec. A rota `POST .../execute` ganhou limite de 300s. O orchestrator grava `running` ao retomar execucao `paused` e mudou o texto da bolha de erro. Os componentes do chat do agente ganharam o aviso e os botoes de retry. Sem prompt de IA, tabela, migration, job `pg_cron`, Edge Function ou secret.
- (1) Campanhas rodando + webhook + `reply-sweep`: intocados, nenhum arquivo desses caminhos foi alterado.
- (2) Busca de leads (Apollo e demais): o fluxo manual esta intocado. No agente, os steps de busca rodam igual, e o retry so os reexecuta por clique explicito do usuario num step que falhou.
- (3) Criacao de campanha e envio ao Instantly: o export manual, o `instantly.ts`, o export-step e o gate de ativacao estao intocados. O retry passa pela mesma rota execute e pelos guards da 24.2 (export idempotente reaproveita a campanha). Nenhuma trava ou filtro novo no caminho ate o Instantly. Nenhum dos 3 pontos e afetado.

**Riscos residuais:**
- Step preso em `running` (timeout/crash) segue sem saida pela UI ate a 24.1 (deferred).
- No modo guiado, apos F5, uma falha pre-orchestrator no disparo pos-aprovacao fica sem botao (deferred).
- O gate de ativacao mostra o 409 de concorrencia como erro (deferred, sem cobranca).
- `sprint-status.yaml` ficou como o orquestrador deixou.
