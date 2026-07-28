---
baseline_commit: 0a16578
---

# Story 22.10: Conversa Limpa — Reattach só de Execução Confirmada + "Nova Conversa"

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want que, ao abrir o agente, conversas abandonadas no meio do briefing NÃO voltem — e ter um botão "Nova conversa" para recomeçar do zero quando eu quiser,
so that o chat sempre abra limpo e previsível, sem histórico morto de sessões anteriores, mantendo visível apenas execução confirmada que ainda está rodando/gastando.

## Contexto do Épico (por que esta story existe)

Story **pós-planejamento** do Epic 22 (padrão 21.9/22.8), levantada pelo Fabossi em teste real 2026-07-23: logando como admin e abrindo o agente, a conversa anterior reaparece — visualmente ruim e confusa. Diagnóstico: **não é bug, é a Story 22.8 funcionando como especificada**, com um critério largo demais.

A 22.8 persiste `currentExecutionId` em localStorage e reataca no mount se a execução está `pending | running | paused` ([AgentChat.tsx:98-104](../../src/components/agent/AgentChat.tsx#L98-L104)). O furo: **toda conversa abandonada no meio do briefing fica `pending` para sempre** ([executions/route.ts:67](../../src/app/api/agent/executions/route.ts#L67) cria como `pending`; nada a encerra) e volta em todo login/refresh. E volta **quebrada**: o histórico reidrata, mas a máquina de estados do `useBriefingFlow` volta a `idle` — o agente repergunta tudo dentro do mesmo histórico.

### ⚠️ Descoberta de análise que reformula o design (leia antes de codar)

O ciclo de vida REAL de `agent_executions.status` hoje **não é** o que o tipo `ExecutionStatus` sugere:

- **`running` NUNCA é escrito.** Nenhum código em `src/` faz `status = "running"`. O confirm ([confirm/route.ts:107-116](../../src/app/api/agent/executions/[executionId]/confirm/route.ts#L107-L116)) atualiza `briefing`/`cost_estimate`/`total_steps` mas **não muda o status** — uma execução confirmada com steps rodando continua `pending`.
- **`paused` só é escrito em ERRO** ([orchestrator.ts:209,297,338](../../src/lib/agent/orchestrator.ts#L209)). Gate de aprovação normal NÃO pausa a execução (o step vira `awaiting_approval`; a execução segue `pending`).
- **`failed` NUNCA é escrito** (comentário no orchestrator: "NEVER 'failed' directly, always 'paused'").
- `completed` é escrito no último step (autopilot: [orchestrator.ts:313-320](../../src/lib/agent/orchestrator.ts#L313-L320); guided: [approve/route.ts:179-186](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L179-L186); ativação adiada: orchestrator.ts:257-265).

**Consequência:** "reatacar só `running`/`paused`" com o ciclo atual NÃO funcionaria — desligaria o reattach de execução confirmada em andamento (que está `pending`), recriando a "execução fantasma" que a 22.8 fechou. Por isso o AC1 desta story **primeiro dá semântica real ao status** (confirm → `running`) e só então estreita o critério de reattach. O discriminador "confirmada" passa a existir de verdade no dado.

### Decisão de design (evoluída na análise — validada com Fabossi na criação da story)

Decisões do Fabossi (AskUserQuestion 2026-07-23): (1) reattach só de execução **confirmada**; (2) botão "Nova conversa" que **encerra no servidor** (sem lixo `pending` acumulando). A restrição original "cancelar só de `pending`/`paused`" foi definida antes da descoberta acima; com o ciclo real, `running` passa a ser exatamente "confirmada em andamento" — e **precisa** ter saída manual (guided em gate fica `running`, não `paused`; sem saída o usuário fica preso a ela para sempre). Resolução que preserva o espírito ("nunca cancelar execução paga silenciosamente"): **servidor aceita cancelar qualquer status não-terminal (`pending`/`running`/`paused`); a UI exige confirmação explícita via dialog quando a execução é pós-confirm (`running`/`paused`)**. `pending` (briefing) cancela sem fricção — é o caso comum da dor.

## Acceptance Criteria

1. **[Semântica de status]** **Given** uma execução `pending` em briefing **When** `POST /confirm` conclui com sucesso **Then** o update final do confirm ([confirm/route.ts:107-116](../../src/app/api/agent/executions/[executionId]/confirm/route.ts#L107-L116)) passa a gravar também `status: "running"` e `started_at` **And** a guarda `execution.status !== "pending"` → `ALREADY_CONFIRMED` (linha 44) permanece correta **And** a varredura de leitores de `agent_executions.status` em `src/` confirma que nenhum outro leitor depende de execução pós-confirm estar `pending`. Varredura FEITA na criação da story — leitores completos: confirm (guarda `!== "pending"`, correta), execute (seleciona, não confere — alvo AC4), approve (seleciona, usa só `total_steps` — alvo AC4), plan ([plan/route.ts:35](../../src/app/api/agent/executions/[executionId]/plan/route.ts#L35) — seleciona `status` e NUNCA o usa; chamado pré-confirm; não afetado), reject (não lê nem escreve status de execução — step fica `awaiting_approval`, sem write que sobrescreva `cancelled`; sem guarda necessária), AgentChat (alvo AC2), `use-agent-onboarding` (só `length === 0`). Re-rodar o grep na implementação para pegar código novo entre a criação e o dev.

2. **[Reattach estreitado]** **Given** um id persistido em localStorage **When** o `AgentChat` valida no mount ([AgentChat.tsx:98-104](../../src/components/agent/AgentChat.tsx#L98-L104)) **Then** `isActive` passa a exigir `status ∈ {running, paused}` (e `user_id === profile.id`, como hoje) **And** execução `pending` cai no ramo de descarte existente (`setCurrentExecutionId(null)`) — abre limpo, sem histórico morto **And** todo o mecanismo da 22.8 (portão `attachGateOpen`, fetch defensivo, rearme do ref no cleanup, restauração do `executionMode`) permanece intacto.

3. **[Status cancelled + endpoint]** **Given** o tipo `ExecutionStatus` ([agent.ts:10](../../src/types/agent.ts#L10)) **Then** ganha `'cancelled'` (terminal) **And** `PATCH /api/agent/executions/[executionId]` ([route.ts](../../src/app/api/agent/executions/[executionId]/route.ts)) passa a aceitar **ou** `{ mode }` (comportamento atual byte-a-byte) **ou** `{ status: "cancelled" }` (único valor de status aceito) **And** o cancel exige: execução existe (404 se não), `user_id === profile.id` (403 `FORBIDDEN` se de outro usuário do tenant — primeira checagem de titularidade server-side, mais forte que o padrão tenant-only atual), status não-terminal (`pending`/`running`/`paused`; se `completed`/`failed`/`cancelled` → 409 `INVALID_TRANSITION`) **And** o cancel grava `status: "cancelled"` + `completed_at` **And** "descancelar" é impossível (nenhum caminho escreve por cima de `cancelled`).

4. **[Guardas anti-race no pipeline]** **Given** uma execução `cancelled` **When** chega `POST .../steps/[n]/execute` (fire-and-forget do confirm, `useAutoTrigger` de outra aba, retry manual) **Then** a rota ([execute/route.ts:62-78](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L62-L78) — já seleciona `status` e hoje não o confere) recusa status terminal (`cancelled`/`completed`/`failed`) com 409 `EXECUTION_NOT_ACTIVE` — nenhum step novo roda/gasta em execução cancelada **And** `POST .../steps/[n]/approve` idem (recusa terminal), fechando o caso "approve do último step sobrescreveria `cancelled` → `completed`" ([approve/route.ts:179-186](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L179-L186)) **And** o retry legítimo de execução `paused` (erro) continua funcionando.

5. **[Botão "Nova conversa"]** **Given** o `AgentChat` com `currentExecutionId` não-nulo **Then** exibe botão "Nova conversa" (sub-header do próprio `AgentChat` — a page continua server component) **And** clique com execução `pending` (briefing) cancela direto; com execução `running`/`paused` abre `AlertDialog` ([ui/alert-dialog.tsx](../../src/components/ui/alert-dialog.tsx)) confirmando o abandono (aviso: progresso/créditos já gastos não são revertidos) **And** o fluxo é: `PATCH { status: "cancelled" }` → **só em caso de sucesso** limpa TUDO no cliente (ver AC6) → chat limpo pronto para nova conversa **And** falha do PATCH → toast de erro e **nenhum** estado limpo (nunca meio-termo: ou reseta tudo, ou nada) **And** sem execução (`currentExecutionId === null`) o botão não aparece — first-time byte-a-byte (NFR4).

6. **[Reset integral do cliente]** **Given** o cancel bem-sucedido **Then** o reset limpa: `setCurrentExecutionId(null)` (o `persist`/`partialize` propaga ao localStorage sozinho), `setShowModeSelector(false)`, `setShowExecutionPlan(false)`, `setExecutionMode(null)`, `setAgentProcessing(false)`, `setTotalSteps(0)` **And** chama `reset()` do `useBriefingFlow` ([use-briefing-flow.ts:972-982](../../src/hooks/use-briefing-flow.ts#L972-L982) — **JÁ EXISTE**, limpa state + `conversationRef`; hoje o `AgentChat` não o consome — só ligar) **And** o `useAutoTrigger` zera `lastTriggeredRef` quando `executionId` muda ([use-auto-trigger.ts:22](../../src/hooks/use-auto-trigger.ts#L22) — **bug latente**: o ref sobrevive à troca de execução e bloquearia o auto-trigger da execução nova com `nextStepNumber <= lastTriggered` da anterior; "Nova conversa" torna a troca de execução na mesma montagem um caminho comum).

7. **[Backfill de dados]** **Given** execuções antigas confirmadas antes desta story (status `pending` com `cost_estimate` preenchido — só o confirm grava `cost_estimate`) **Then** migration `00063` faz `UPDATE agent_executions SET status = 'running' WHERE status = 'pending' AND cost_estimate IS NOT NULL AND completed_at IS NULL` — para que não sumam do reattach após o deploy **And** a migration é defensiva/idempotente (re-rodável; padrão `to_regclass`/WHERE não-destrutivo do projeto) **And** execuções `pending` de briefing abandonado NÃO são tocadas (ficam `pending`, deixam de reatachar — exatamente o objetivo).

8. **[Zero regressão + testes]** **Given** a suíte **Then** baseline 399 files / 6950 pass / 2 skip / 0 fail se mantém sem regressão **And** testes novos cobrem: critério de reattach (`pending` descarta, `running`/`paused` reatacam, outro usuário descarta), PATCH cancel (dono/não-dono, cada transição válida e inválida, `mode` intacto), guardas execute/approve (terminal recusa, `paused` retry passa), confirm grava `running`+`started_at`, botão (pending direto, running com dialog, falha não limpa, sucesso limpa tudo incl. `reset()` do briefing), `useAutoTrigger` re-armado por troca de `executionId` **And** RED provado: reverter o critério do AC2 derruba os testes de reattach **And** fora de escopo documentado: dessincronia `showModeSelector`/`showExecutionPlan` em refresh de execução paused pós-confirm — anotar em [deferred-work.md](deferred-work.md).

## Tasks / Subtasks

- [x] **Task 1 — Semântica: confirm grava `running` + backfill** (AC: #1, #7)
  - [x] Em [confirm/route.ts:107-116](../../src/app/api/agent/executions/[executionId]/confirm/route.ts#L107-L116): adicionar `status: "running"` e `started_at: new Date().toISOString()` ao update final (mesmo write — sem request extra).
  - [x] Varredura de leitores (provar AC1): grep `agent_executions` + `status` em `src/` e confirmar um a um. Mapeados na análise: confirm (guarda `!== "pending"` — continua correta), execute route (seleciona e não confere — vira AC4), AgentChat (vira AC2), `use-agent-onboarding` (só `length === 0` — não lê status). `usage-logger` e demais usam status próprios (steps/campanhas), não de execução.
  - [x] Migration `supabase/migrations/00063_backfill_confirmed_executions_running.sql` com o UPDATE do AC7 + comentário explicando o porquê. Banco do cliente é gerenciado à mão ([[project_db_schema_versioning]]) — deixar o SQL pronto para o Fabossi aplicar e anotar a aplicação no smoke.
  - [x] Sem CHECK constraint em `status` ([00047:8](../../supabase/migrations/00047_create_agent_executions.sql#L8) é `VARCHAR(20)` livre) — `running`/`cancelled` não exigem ALTER. Zero migration de schema (NFR5); 00063 é só dado.

- [x] **Task 2 — Estreitar o critério de reattach** (AC: #2)
  - [x] Em [AgentChat.tsx:98-104](../../src/components/agent/AgentChat.tsx#L98-L104): remover `match.status === "pending"` do `isActive` (fica `running || paused`). NÃO tocar em portão, fetch defensivo, rearme de ref, restauração de mode.
  - [x] Atualizar o comentário do bloco (linhas 52-64) e o comentário do store ([use-agent-store.ts:59-63](../../src/stores/use-agent-store.ts#L59-L63)) para o critério novo.
  - [x] Atualizar testes de mount-validation existentes ([AgentChat.test.tsx](../../__tests__/unit/components/agent/AgentChat.test.tsx)): o caso "id `pending` válido → mantém" INVERTE para "→ descarta". RED: rodar o teste novo contra o código velho antes do fix.

- [x] **Task 3 — `cancelled` no tipo + PATCH cancel** (AC: #3)
  - [x] [agent.ts:10](../../src/types/agent.ts#L10): `ExecutionStatus` += `'cancelled'`.
  - [x] [executions/[executionId]/route.ts](../../src/app/api/agent/executions/[executionId]/route.ts): aceitar corpo `{ mode }` OU `{ status: "cancelled" }`. Corpo com ambos ou com status ≠ "cancelled" → 400. Guardas do cancel na ordem: 404 (não existe no tenant — RLS), 403 `FORBIDDEN` (`user_id !== profile.id` — o select atual só pega `id`; incluir `user_id, status`), 409 `INVALID_TRANSITION` (status terminal). Sucesso: `update({ status: "cancelled", completed_at })`, retorna a linha.
  - [x] Caminho `mode` permanece byte-a-byte (testes existentes de mode não mudam).

- [x] **Task 4 — Guardas anti-race no execute e approve** (AC: #4)
  - [x] [execute/route.ts:68-78](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L68-L78): após o check de existência, `if (["cancelled","completed","failed"].includes(execution.status)) → 409 EXECUTION_NOT_ACTIVE`. O select já traz `status` — zero query extra. `paused` (retry de erro) e `running` passam.
  - [x] Approve route: o select da execução **já traz** `status` ([approve/route.ts:61](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L61)) — aplicar a mesma guarda ANTES de aprovar o step (impede `cancelled` → `completed` pelo último approve). Reject NÃO precisa de guarda (auditado: não escreve status nenhum).
  - [x] NÃO tocar no orchestrator (client de SESSÃO — Trap #1 da 22.9, travado por teste de contrato) nem em `service-keys` (Trap #2). A guarda mora nas rotas.

- [x] **Task 5 — Botão "Nova conversa" + reset integral** (AC: #5, #6)
  - [x] Sub-header no `AgentChat` (acima de `AgentMessageList`): renderizado só com `currentExecutionId !== null`; botão `variant="ghost"` `size="sm"` com ícone (ex.: `RotateCcw`/`Plus` do lucide) + texto "Nova conversa". Layout `flex` com `gap-*` (NUNCA `space-y-*` — Tailwind v4, Project Memory). Texto PT-BR.
  - [x] Handler `handleNewConversation`: se execução pós-confirm (**`steps.length > 0` OU status validado `running`/`paused`** — ver Completion Notes: `executionMode` foi descartado como sinal por ser setado ANTES do confirm) → abre `AlertDialog`; senão cancela direto. No confirm do dialog (ou direto): `PATCH { status: "cancelled" }` → sucesso: reset integral (AC6) na ordem store → briefing `reset()`; falha: `toast.error`, estado intacto.
  - [x] Ligar o `reset` existente: `const { state: briefingState, processMessage: processBriefing, reset: resetBriefing } = useBriefingFlow();` — hoje o destructuring ([AgentChat.tsx:138](../../src/components/agent/AgentChat.tsx#L138)) ignora `reset`.
  - [x] [use-auto-trigger.ts](../../src/hooks/use-auto-trigger.ts): zerar `lastTriggeredRef.current = 0` quando `executionId` mudar (ref `prevExecutionIdRef` ou efeito dedicado). Cobre também execução nova criada após o reset.
  - [x] `isInputDisabled`/`disabled` do input: após reset, input habilitado (`showModeSelector`/`showExecutionPlan` false já garantem).

- [x] **Task 6 — Testes + validação final** (AC: #8)
  - [x] Rotas: `__tests__/unit/api/agent/` — PATCH cancel (6+ casos: dono cancela pending/running/paused; não-dono 403; terminal 409; mode intacto; body inválido 400), execute guard (cancelled/completed 409; paused passa), approve guard (cancelled 409), confirm grava `running`+`started_at`.
  - [x] Componente: `AgentChat.test.tsx` — inversão do caso pending (Task 2); botão aparece/some por `currentExecutionId`; cancel pending direto; cancel running exige dialog; falha de PATCH não limpa; sucesso limpa store + chama `resetBriefing` (mock do hook expõe `reset`).
  - [x] Hook: teste novo do `useAutoTrigger` re-armado por troca de `executionId` (RED contra o código atual: ref antigo bloqueia step da execução nova).
  - [x] `npx vitest run` (399 files / 7000 pass / 2 skip / 0 fail — baseline 6950, +50, zero regressão), `npx tsc --noEmit` (182 erros = baseline exato, **0 em `src/`**), `npx eslint --max-warnings=0` nos 14 arquivos tocados (limpo).
  - [x] **Smoke pela interface real** (skill `verify`, Playwright, banco real): (a) ✅ (b) ✅ (c) ✅ (e) ✅ — ver Completion Notes. **(d) 00063 NÃO aplicada** (Task 1 reserva a aplicação ao Fabossi; impacto medido: **12 linhas** elegíveis). NÃO cliquei "Iniciar Execução" (guardrail de custo).
  - [x] Anotar em [deferred-work.md](deferred-work.md): dessincronia `showModeSelector`/`showExecutionPlan` em refresh de execução `running`/`paused` pós-confirm (fora de escopo desta story).

## Dev Notes

### DEV AGENT GUARDRAILS — o que NÃO quebrar

- **NFR1 — determinismo intocado:** nada aqui muda ordem de steps, gasto ou envio. Orchestrator NÃO é tocado (guardas moram nas rotas). O orchestrator continua com client de **SESSÃO** (Trap #1 da 22.9 — teste de contrato trava isso); NÃO importar `service-keys`/`createAdminClient` em nada desta story.
- **NFR4 — first-time byte-a-byte:** sem id persistido e sem execução, nada muda (botão nem renderiza). O caminho "criar execução na 1ª mensagem" ([AgentChat.tsx:203-217](../../src/components/agent/AgentChat.tsx#L203-L217)) não muda.
- **NFR5 — zero migration de schema:** `running`/`cancelled` entram sem ALTER (VARCHAR(20) sem CHECK). 00063 é backfill de DADO, aplicado à mão no banco do cliente ([[project_db_schema_versioning]]).
- **NÃO desmontar a 22.8:** portão `attachGateOpen`, fetch defensivo (falha de rede MANTÉM o id), rearme do ref no cleanup (StrictMode), restauração de `executionMode`, `clearPersistedAgentExecution` no logout — tudo fica. Esta story só estreita UM predicado e adiciona o botão.
- **Lição sistêmica ([[project_schema_constraint_blind_spot]]):** mock de Supabase não prova semântica do banco. Ao introduzir valor novo de status, a varredura de LEITORES (Task 1) é obrigatória e o smoke real é definição-de-pronto. Não declarar pronto com suíte verde apenas.
- **Reset é tudo-ou-nada:** nunca limpar o cliente se o PATCH falhou (execução ficaria ativa no servidor e invisível na UI — a fantasma de novo, agora por caminho novo).
- **PT-BR em todo texto de UI**; ESLint `no-console`; Tailwind v4 `flex flex-col gap-*` (nunca `space-y-*`).

### A mudança em uma frase

O confirm passa a marcar a execução como `running` (semântica que o tipo sempre prometeu), o reattach passa a aceitar só `running`/`paused` (briefing abandonado fica `pending` e nunca mais volta), e "Nova conversa" cancela no servidor (`cancelled`, terminal, com guardas anti-race nas rotas de step) e reseta o cliente inteiro — store, briefing flow e auto-trigger.

### Estado atual dos arquivos-chave (verificado no código em 0a16578)

- **[AgentChat.tsx](../../src/components/agent/AgentChat.tsx):** validação-no-mount nas linhas 75-134; `isActive` nas 98-104 (o alvo); `useBriefingFlow` destructuring na 138 (ignora `reset`); criação de execução nas 203-217; render nas 366-401 (sub-header entra antes de `AgentMessageList`).
- **[use-briefing-flow.ts](../../src/hooks/use-briefing-flow.ts):** `reset()` PRONTO nas linhas 972-982 (zera state + `conversationRef`) e já exportado no return (linha 984). Só consumir.
- **[use-auto-trigger.ts](../../src/hooks/use-auto-trigger.ts):** `lastTriggeredRef` (linha 22) nunca é zerado — bug latente que o botão expõe (troca de execução na mesma montagem).
- **[executions/[executionId]/route.ts](../../src/app/api/agent/executions/[executionId]/route.ts):** PATCH só de `mode`, select só de `id`, sem checagem de `user_id` (padrão tenant-only — o cancel introduz a checagem de dono).
- **[execute/route.ts](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts):** já seleciona `status` (linha 64) e não o confere — a guarda é 3 linhas.
- **Titularidade server-side** era deferred da 22.8 ("user_id só no cliente") — o cancel fecha esse deferred PARA O CANCEL; as demais rotas continuam tenant-only (fora de escopo).

### Decisão registrada: por que mexer no significado de `pending`

Alternativa considerada e rejeitada: manter o ciclo atual e discriminar "confirmada" por `cost_estimate != null` na validação-no-mount. Rejeitada porque perpetua um modelo de dados mentiroso (`running` declarado e nunca usado), espalha conhecimento implícito ("cost_estimate é o marcador de confirm") e a correção real custa uma linha no confirm + backfill de uma query. Risco auditado: leitores de `pending` mapeados e cobertos (AC1/Task 1).

### Testing standards

- Vitest, `npx vitest run`. Mocks existentes: `AgentChat.test.tsx` já mocka `useUser`, store (com `getState`), `useAgentExecution`, `AgentStepProgress` — seguir o setup. Para o botão: mockar `useBriefingFlow` expondo `reset` (spy) e assertar a chamada.
- AlertDialog em teste: interações via `@testing-library` (render do dialog no DOM — sem portal issues no happy-dom com o setup atual do projeto).
- Provar RED nos três eixos: (1) critério de reattach revertido derruba o teste do pending-descarta; (2) guarda do execute removida derruba o teste do 409; (3) `useAutoTrigger` sem o re-arme derruba o teste da execução nova.
- A suíte NÃO prova localStorage real, RLS nem o UPDATE do 00063 — por isso o smoke real da Task 6 é obrigatório (action item do Epic 21: smoke visual como definição-de-pronto).

### Project Structure Notes

- Nenhum arquivo novo em `src/` além de nada — a story é toda em arquivos existentes + 1 migration de dados + testes. Sem componente novo: o sub-header é JSX dentro do `AgentChat` (se crescer, extrair `AgentChatHeader.tsx` em `src/components/agent/` com export no `index.ts` — padrão da pasta).
- Error shape das rotas: `{ error: { code, message } }` com codes UPPER_SNAKE (padrão de todas as rotas do agente) — usar `FORBIDDEN`, `INVALID_TRANSITION`, `EXECUTION_NOT_ACTIVE`.

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.10] — seção adicionada por esta story (pós-planejamento, padrão 21.9/22.8)
- [Source: _bmad-output/implementation-artifacts/22-8-reattach-execucao-no-refresh.md] — mecanismo que esta story ajusta; guardrails e deferred herdados
- [Source: src/components/agent/AgentChat.tsx#L52-L134] — validação-no-mount (alvo AC2)
- [Source: src/app/api/agent/executions/[executionId]/confirm/route.ts#L44,#L107-L116] — guarda pending + update sem status (alvo AC1)
- [Source: src/app/api/agent/executions/[executionId]/route.ts] — PATCH mode (alvo AC3)
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L62-L78] — select de status sem guarda (alvo AC4)
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L167-L199] — completion no último approve (alvo AC4)
- [Source: src/hooks/use-briefing-flow.ts#L972-L984] — reset() pronto (alvo AC6)
- [Source: src/hooks/use-auto-trigger.ts#L22] — lastTriggeredRef sem re-arme (alvo AC6)
- [Source: src/types/agent.ts#L10] — ExecutionStatus (alvo AC3)
- [Source: supabase/migrations/00047_create_agent_executions.sql#L8] — VARCHAR(20) sem CHECK (viabiliza NFR5)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow, 2026-07-23)

### Debug Log References

**RED provado nos 4 eixos** (cada fix rodou contra o código sem ele):

1. **AC1 — confirm grava `running`:** `expected undefined to be 'running'` (o update final não tinha `status`).
2. **AC2 — reattach estreitado:** `expected "vi.fn()" to be called with [ null ] / Number of calls: 0` — com o critério antigo, a execução `pending` era MANTIDA.
3. **AC4 — guarda do execute:** 3/3 casos falharam com `Expected 409 / Received 200` — sem a guarda, execução `cancelled` **roda o step e gasta**.
4. **AC6 — `useAutoTrigger` re-armado:** `Number of calls: 0` na execução nova — o bug latente é real: o ref herdado bloqueia o auto-trigger da conversa seguinte.

**Validações finais:** `npx vitest run` → 399 files / 7000 pass / 2 skip / 0 fail. `npx tsc --noEmit` → 182 erros (**baseline exato**), 0 em `src/`. `npx eslint --max-warnings=0` nos 14 arquivos tocados → exit 0.

### Completion Notes List

**A mudança:** o `POST /confirm` passou a gravar `status: "running"` + `started_at` — dando ao dado a semântica que o tipo `ExecutionStatus` sempre prometeu — e só então o reattach-no-mount estreitou para `{running, paused}`. Briefing abandonado fica `pending` e nunca mais volta. Para sair de uma execução confirmada existe o botão "Nova conversa", que cancela no servidor (`cancelled`, terminal, dono-only) e reseta o cliente inteiro.

**3 desvios/decisões tomadas na implementação:**

1. **Sinal de "pós-confirm" no botão (AC5).** A Task 5 sugeria `executionMode` setado **OU** `steps.length > 0` **OU** status `running`/`paused`. Descartei o termo `executionMode`: ele é setado pelo **mode selector**, que roda **antes** do confirm — usá-lo abriria o dialog de "créditos já consumidos" para uma execução `pending` onde nada foi gasto, contrariando o próprio AC5 ("pending cancela direto"). Ficaram os dois sinais que só existem pós-confirm: `steps.length > 0` (só o confirm cria `agent_steps`) e o status validado no mount (novo state `reattachedStatus`, que cobre a janela em que a execução reatachada ainda não carregou os steps). **Validado no smoke:** execução `running` reatachada com zero steps carregados abriu o dialog corretamente.

2. **`TERMINAL_EXECUTION_STATUSES` centralizado em `src/types/agent.ts`** (+ helper `isTerminalExecutionStatus`) em vez de literal repetido nas 3 rotas — a lista é consumida por PATCH/execute/approve e drift entre elas seria silencioso (lição de SSOT da 22.6).

3. **Re-arme do `useAutoTrigger` mora no efeito, não no render.** A primeira versão mexia no ref durante o render e o ESLint (`react-hooks/refs`) barrou com 3 erros. Movido para a primeira linha do `useEffect` — **antes** dos guards, para valer inclusive quando a execução nova ainda não tem steps.

**Smoke pela interface real** (Playwright, banco real, dev server em :3001 — a :3000 estava ocupada por outra instância). Cenários (a)(b)(c) como `ccase` (SDR) e (e) como Fabossi (admin):

- **(a) Briefing abandonado + F5 → abre limpo.** ✅ Chat voltou ao onboarding e o `localStorage` foi zerado (`currentExecutionId: null`) — o descarte real aconteceu. É exatamente o bug reportado.
- **(b) "Nova conversa" em briefing → o agente NÃO repergunta com estado morto.** ✅ Prova decisiva: com o briefing carregado de "CTOs" (agente pedindo localização), cliquei "Nova conversa" e mandei **"em São Paulo"**. O agente respondeu **"Qual cargo você gostaria de prospectar?"** — não lembra dos CTOs. Sem o `reset()` ligado ele teria montado o resumo "CTOs em São Paulo". A suíte mockada não cobre isso.
- **(c) Reattach de confirmada + cancelamento via dialog.** ✅ Não havia execução `running`/`paused` no banco (a `d59d7ced…` da 22.8 não existe mais), então marquei como `running` **uma execução de teste criada por mim minutos antes** (`8b93b33e`, script temporário restrito por id + `eq("status","pending")`) — em vez de rodar a migration inteira. F5 → **reatachou** (histórico voltou, id mantido), contraste direto com (a) na mesma UI. "Nova conversa" → **abriu o AlertDialog** (não cancelou direto) com o aviso de créditos → confirmei → chat limpo, e o F5 seguinte **não trouxe de volta**. No banco: `status=cancelled | started=SIM | completed=SIM`.
- **(e) Admin (cenário original do Fabossi).** ✅ Login como Fabossi → agente abre limpo; briefing real criado (`9e30eab7`) → F5 → chat limpo, id descartado.
- **Persistência provada no banco real** (o mock não prova): as duas execuções canceladas pela UI gravaram `status=cancelled` + `completed_at`.
- **Único erro de console:** hydration mismatch **pré-existente** do submenu Leads da Sidebar (gotcha documentado desde a 22.3).

**🔴 OPERACIONAL Fabossi — aplicar a migration 00063.** Não apliquei: a Task 1 reserva a aplicação a você ("deixar o SQL pronto para o Fabossi aplicar"), e é escrita no banco real do cliente. **Impacto medido ao vivo: 12 execuções** batem no critério (`pending` + `cost_estimate NOT NULL` + `completed_at IS NULL`), ou seja, 12 execuções confirmadas de verdade que **sumiriam do reattach** sem o backfill. Contexto extra colhido no banco: **24 das 25 execuções mais recentes estão `pending`** — a dimensão exata do histórico morto que voltava a cada login.

**Nota de escopo:** o dev server ficou em `:3001` porque a `:3000` está ocupada por outra instância (que serve 404 em `/agent`) — vale conferir/derrubar antes do próximo smoke.

### File List

**Código (`src/`)**
- `src/app/api/agent/executions/[executionId]/confirm/route.ts` — MODIFICADO (AC1: `status: "running"` + `started_at` no update final)
- `src/app/api/agent/executions/[executionId]/route.ts` — MODIFICADO (AC3: PATCH aceita `{status:"cancelled"}` além de `{mode}`; 403 `FORBIDDEN` dono-only, 409 `INVALID_TRANSITION`, 400 `INVALID_BODY`/`INVALID_STATUS`; select passou a trazer `user_id, status`)
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` — MODIFICADO (AC4: 409 `EXECUTION_NOT_ACTIVE` em status terminal)
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts` — MODIFICADO (AC4: mesma guarda antes de aprovar o step)
- `src/types/agent.ts` — MODIFICADO (AC3: `ExecutionStatus += 'cancelled'`; novo `TERMINAL_EXECUTION_STATUSES` + `isTerminalExecutionStatus`)
- `src/components/agent/AgentChat.tsx` — MODIFICADO (AC2 critério estreitado + `reattachedStatus`; AC5/AC6 botão "Nova conversa", `AlertDialog`, `cancelCurrentExecution`, reset integral, consumo do `resetBriefing`)
- `src/hooks/use-auto-trigger.ts` — MODIFICADO (AC6: re-arme do `lastTriggeredRef` na troca de `executionId`)
- `src/stores/use-agent-store.ts` — MODIFICADO (comentário do `partialize` alinhado ao critério novo)

**Migration**
- `supabase/migrations/00063_backfill_confirmed_executions_running.sql` — NOVO (AC7: backfill idempotente/defensivo `to_regclass` + `COMMENT` documentando o ciclo de vida real)

**Testes**
- `__tests__/unit/api/agent/execution-confirm.test.ts` — MODIFICADO (+1: `running` + `started_at`)
- `__tests__/unit/api/agent/executions-detail.test.ts` — MODIFICADO (+13: cancel dono pending/running/paused, 403, 409 ×3 terminais, 404, 401, 400 ×2, 500, `mode` byte-a-byte)
- `__tests__/unit/api/agent/executions-steps-execute.test.ts` — MODIFICADO (+5: 409 ×3 terminais, `paused`/`running` passam)
- `__tests__/unit/app/api/agent/executions/steps/approve.test.ts` — MODIFICADO (+5: 409 ×3 terminais, `running`/`paused` aprovam; helper `stubExecution` tipado)
- `__tests__/unit/components/agent/AgentChat.test.tsx` — MODIFICADO (+8, 1 invertido: `pending` descarta, `cancelled` descarta, botão aparece/some, cancel direto, reset integral, falha HTTP e falha de rede não limpam, dialog por steps e por status reatachado)
- `__tests__/unit/hooks/use-auto-trigger.test.ts` — MODIFICADO (+2: re-arme na troca de `executionId`; guard preservado na mesma execução)

**Documentação**
- `_bmad-output/implementation-artifacts/deferred-work.md` — MODIFICADO (dessincronia de fase da UI no reattach pós-confirm)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFICADO (status da story)

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-23 | Story 22.10 implementada (dev-story). Confirm passa a gravar `running`+`started_at` (AC1) + migration 00063 de backfill (AC7); reattach estreitado para `running`/`paused` (AC2); `cancelled` terminal com PATCH dono-only (AC3) e guardas anti-race em execute/approve (AC4); botão "Nova conversa" com dialog para execução confirmada (AC5) e reset integral incluindo o `reset()` do briefing e o re-arme do `useAutoTrigger` (AC6). Suíte 399/7000 pass/2 skip/0 fail (+50, zero regressão); tsc 0 em `src/`; eslint limpo. Smoke real 4/4 cenários (a/b/c/e). Status → review. |

## Review Findings

> Code review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo full, 2026-07-23. **Acceptance Auditor: AC1-AC8 + NFR1/4/5 + PT-BR/Tailwind VERIFICADOS EM CÓDIGO** — nenhuma violação dura de spec (único gap: janela pós-confirm da AC5, abaixo). Convergência das 3 camadas no tema central: as escritas de transição de status são _check-then-act_ sem compare-and-swap. 1 decision-needed + 5 patches + 2 defers + 7 descartados.

### Decisão necessária — RESOLVIDA (Fabossi, 2026-07-23): Opção A (CAS em tudo)

- [x] [Review][Patch] (APLICADO) **[ex-Decision — Opção A] CAS em todas as escritas de transição de status** — Todas as escritas terminais usavam só `.eq("id", ...)`, sem precondição de status: cancel ([route.ts:121](../../src/app/api/agent/executions/[executionId]/route.ts#L121)), conclusão do approve ([approve/route.ts:202](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L202)) e conclusão/pausa do orchestrator ([orchestrator.ts:320,338](../../src/lib/agent/orchestrator.ts#L320)). As guardas 409 (AC4) são _check-then-act_: entre o SELECT e a escrita há janela. Cenário decisivo: usuário cancela execução `running` de autopilot → cliente reseta; um step disparado ANTES do cancel ainda roda no servidor e, ao terminar, escreve `completed`/`paused` por cima do `cancelled`. Se escrever `paused`, a execução **reataca de novo** ({running,paused}) → fantasma recriada por corrida. **Fix (Opção A):** CAS em cancel (`.in("status",["pending","running","paused"])`, 0 rows → 409) + approve completion (`.neq("status","cancelled")`) + orchestrator completion/paused (`.neq("status","cancelled")`). O toque no orchestrator é guarda, não muda determinismo/session-client (NFR1 preservado no espírito). Decisão do Fabossi: fechar a corrida por completo.

### Patches

- [x] [Review][Patch] (APLICADO) **Cliente trava em 409 ao clicar "Nova conversa" numa execução já terminal** [AgentChat.tsx:428](../../src/components/agent/AgentChat.tsx#L428) — `if (!response.ok) { toast.error(...); return; }` não distingue 409 (execução já terminal no servidor) de falha transitória (500/rede). Uma execução de autopilot que **completa dentro da sessão** deixa `currentExecutionId` setado → botão aparece → PATCH cancel numa linha `completed` → 409 → toast, nada reseta. Toda retentativa 409 de novo; só o F5 escapa. Fix: em `response.status === 409` (terminal), tratar como efetivamente-encerrada e rodar o reset integral; manter o toast+preservar-id só para 500/rede.
- [x] [Review][Patch] (APLICADO) **Janela pós-confirm na mesma sessão pula o dialog de aviso de créditos (gap da AC5)** [AgentChat.tsx:413](../../src/components/agent/AgentChat.tsx#L413) — logo após `/confirm` retornar (dinheiro já gasto, step 1 disparando), `reattachedStatus` é `null` (só setado no reattach) e `steps.length === 0` (ainda não hidratados) → `isPostConfirmExecution === false` → "Nova conversa" cancela **direto, sem o AlertDialog** de "créditos já consumidos". O dev documentou o descarte do `executionMode` como sinal; o furo é a janela de lag. Fix: sinalizar "confirmado nesta sessão" no sucesso do `handleConfirmPlan` (flag/ref dedicado) e incluí-lo em `isPostConfirmExecution`. Servidor cancela certo (sem fantasma); só falta o prompt.
- [x] [Review][Patch] (APLICADO) **Corpo PATCH `null` literal derruba a rota com 500 em vez de 400** [route.ts:60](../../src/app/api/agent/executions/[executionId]/route.ts#L60) — `await request.json()` com body `null` retorna `null` (não lança), então `body.mode !== undefined` faz `null.mode` → TypeError → 500. Alcançável por chamada de API direta. Fix: `if (!body || typeof body !== "object") return 400 INVALID_BODY;` antes de tocar `body.mode`.
- [x] [Review][Patch] (APLICADO) **`COMMENT ON COLUMN` fora do bloco guardado por `to_regclass` anula a defensividade da migration** [00063:49](../../supabase/migrations/00063_backfill_confirmed_executions_running.sql#L49) — o `DO $$` retorna gracioso se a tabela não existe, mas o `COMMENT ON COLUMN` na linha 49 roda incondicionalmente → num banco com drift (tabela/coluna ausente) o COMMENT lança e a migration aborta, anulando o `to_regclass`. Fix: mover o COMMENT para dentro do bloco guardado (ou próprio `to_regclass`). Timing ideal — 00063 ainda NÃO foi aplicada.
- [x] [Review][Patch] (APLICADO) **Backfill grava `running` sem `started_at`** [00063:39](../../supabase/migrations/00063_backfill_confirmed_executions_running.sql#L39) — o UPDATE seta `status='running'` mas não toca `started_at`, ao contrário do caminho do confirm (grava ambos). Linhas backfilladas ficam `running` com `started_at IS NULL` — anomalia para qualquer leitor que assuma `running ⇒ started_at`. Fix: `SET status='running', started_at = COALESCE(started_at, created_at)`.

### Deferred (pré-existentes / fora de escopo)

- [x] [Review][Defer] **Authz assimétrica: execute/approve continuam tenant-only enquanto cancel é dono-only** [execute/route.ts:69](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L69), [approve/route.ts:65](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L65) — deferred, pré-existente (a própria story documenta "as demais rotas continuam tenant-only, fora de escopo"). Um colega do mesmo tenant não cancela a execução do outro (403), mas pode dirigi-la (execute/approve). Fechar exige decisão de superfície de acesso (Epic 20).
- [x] [Review][Defer] **`isTerminalExecutionStatus(status: string)` falha-aberto para status NULL/desconhecido** [types/agent.ts](../../src/types/agent.ts) — deferred, hardening só-drift. Um `status` NULL (drift do banco gerido à mão) ou fora da união é classificado não-terminal → step roda/gasta. `status` é gravado `pending` no insert, nunca NULL; só alcançável por drift. Fail-open em vez de fail-closed para o exato cenário de drift que o projeto teme.
