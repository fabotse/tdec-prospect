---
baseline_commit: 1c35f8dbfeb3f8e646c937fc9a8cd5ecb2a83a3d
---

# Story 22.8: Reattach de Execução no Refresh (Persistir & Reidratar)

Status: done
<!-- Code-review 2026-07-20: 7 patches aplicados e verificados (suíte 395/6828 pass, tsc/eslint limpos) + SMOKE pela interface real FEITO (Playwright, banco real, 6/6 passaram incl. guardrail user_id contra execução real de outro usuário). Código APROVADO e provado na tela. Único resíduo: caminho totalmente pago ao vivo (Iniciar Execução) não disparado por guardrail de custo — mecânica provada contra execuções reais existentes. -->


<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want que, se eu atualizar a página (ou fechar e reabrir) no meio de uma execução, o agente volte para onde eu estava em vez de começar do zero,
so that eu não perca a conversa e — principalmente — não fique com uma execução rodando e gastando (Apify/OpenAI) fora da minha vista.

## Contexto do Épico (por que esta story existe)

Story **pós-planejamento** do Epic 22, levantada pelo Fabossi durante o **code-review da 22.2** (2026-07-20). Não estava no planejamento original; entra por ser uma lacuna de robustez que a 22.2 tornou mais cara.

Hoje **todo o estado do fluxo do agente é em memória**, sem persistência:

- **Zustand store** ([use-agent-store.ts:38](../../src/stores/use-agent-store.ts#L38)): `create(...)` **sem** o middleware `persist`. `currentExecutionId`, `showModeSelector`, `showExecutionPlan`, `executionMode` vivem só na memória do tab.
- **Briefing flow** ([use-briefing-flow.ts:285](../../src/hooks/use-briefing-flow.ts#L285)): máquina de estados em `useState` + histórico em `useRef`.
- **Nenhum rehydrate no mount** ([AgentChat.tsx](../../src/components/agent/AgentChat.tsx)): não há `useEffect` que releia a execução do banco, da URL ou de storage.

Consequência do refresh no meio do fluxo:

1. **Tela em branco + execução nova do zero:** `currentExecutionId` volta a `null`; `useAgentExecution(null)` não busca nada → lista de mensagens vazia. A próxima mensagem cai em [`handleSendMessage`](../../src/components/agent/AgentChat.tsx#L119) com `execId = null` → cria uma **execução nova** (`POST /api/agent/executions`). A execução antiga fica **órfã** no banco (as mensagens continuam lá, mas a UI nunca mais volta pra ela).
2. **Execução fantasma (o caso perigoso):** se o refresh acontece **depois** do confirm do plano, o step 1 já foi disparado como **fire-and-forget** ([`/steps/1/execute`](../../src/components/agent/AgentChat.tsx#L257)) e os steps seguem rodando **server-side**. A UI se desconecta e o usuário **não vê** a execução que continua consumindo — e, com o toggle premium da 22.2 ligado, isso significa **chamadas Apify pagas invisíveis**.

**A boa notícia (o que já funciona a nosso favor):** a camada de dados já reidrata a partir de um `executionId`. `useAgentExecution(executionId)` ([use-agent-execution.ts:69](../../src/hooks/use-agent-execution.ts#L69)) busca **mensagens + steps** e assina o canal realtime; e o `AgentChat` já renderiza `AgentStepProgress` **quando `steps.length > 0`** ([AgentChat.tsx:304](../../src/components/agent/AgentChat.tsx#L304)). Ou seja: **basta restaurar o `currentExecutionId` no mount que mensagens e progresso dos steps reaparecem sozinhos.** O núcleo desta story é pequeno; o cuidado está em validar o id restaurado para não reatachar lixo (execução terminada) nem execução de outro usuário.

**Escopo decidido (reattach mínimo, NÃO resume conversacional):** persistir `currentExecutionId` + reidratar a execução em andamento no mount. **NÃO** reconstruímos a máquina de estados do briefing (status/missingFields/perguntas antes do confirm) — isso fica para uma evolução futura (relacionado à [[22-3-conversa-com-memoria-real-intencao-via-llm]]). Comportamento herdado do Epic 16, não introduzido pela 22.2.

## Acceptance Criteria

1. **Given** uma execução em andamento na aba do usuário **When** ele atualiza a página (F5 / reabre a aba) **Then** o `currentExecutionId` é restaurado (persistência client-side — ex.: `zustand/middleware` `persist` em localStorage) **And** as mensagens e os steps daquela execução reidratam via os hooks existentes (`useAgentExecution`) — **sem** criar execução nova nem tela em branco.
2. **Given** um id de execução persistido **When** o `AgentChat` monta **Then** o app **valida o id contra o servidor** (reusando `GET /api/agent/executions`, que já retorna `status`/`user_id` por tenant via RLS) **And** só reataca se a execução existe, pertence ao usuário atual e está em estado **ativo** (`pending` | `running` | `paused`); **And** se estiver **terminal** (`completed` | `failed`) ou não for encontrada, o id persistido é **descartado** e o app inicia limpo (sem fantasma, sem estado obsoleto).
3. **Given** uma execução com steps em andamento (pós-confirm) **When** o usuário atualiza a página **Then** o `AgentStepProgress` **reataca** e volta a exibir o progresso (e o custo/etapas) daquela execução — fechando o buraco da "execução fantasma": o que está gastando volta a ficar visível.
4. **Given** uma execução ainda **em briefing** (pré-confirm) **When** o usuário atualiza **Then** a **thread de mensagens reidrata** (o usuário não encara tela em branco e pode continuar digitando) **And** fica documentado/aceito que a **máquina de estados conversacional não é restaurada** (o próximo turno reprocessa a mensagem; sem resume do meio das perguntas guiadas).
5. **Given** o ciclo de vida da execução **Then** o id persistido é **atualizado** quando uma execução nova é criada **And** é **limpo** quando a execução atinge estado terminal (`completed`/`failed`) — para que a próxima visita comece limpa e não reataque algo já encerrado. (Sugestão: derivar do `status` observado pelos hooks; não inventar novo polling.)
6. **Given** um usuário **first-time** ou sem id persistido **Then** o comportamento é **idêntico ao de hoje** (zero regressão — cria execução na primeira mensagem). **And** nenhuma migration nova (persistência é client-side; leitura via endpoint existente).
7. Testes unitários: (a) persist/restore do `currentExecutionId`; (b) validação-no-mount que **descarta** id terminal/inexistente/de-outro-usuário; (c) reattach de execução `running` reidrata steps; (d) fix da tela em branco (mensagens reidratam em execução ativa); (e) first-time/sem-id não regride.

## Tasks / Subtasks

- [x] **Task 1 — Persistir `currentExecutionId` (client-side)** (AC: #1, #5, #6)
  - [x] Em [`use-agent-store.ts`](../../src/stores/use-agent-store.ts): `create(...)` envolvido com o middleware `persist` de `zustand/middleware` (forma curried `create<T>()(persist(...))` exigida pelo TS), **persistindo apenas `currentExecutionId`** via `partialize`. Storage key `"tdec-agent-ui"`. Flags efêmeras (`isAgentProcessing`/`showModeSelector`/`showExecutionPlan`/`executionMode`/`totalSteps`) ficam fora.
  - [x] SSR-safe: `persist` do zustand v5 usa `localStorage` (default `createJSONStorage`), que no server retorna storage indefinido e faz no-op — sem quebrar o "use client". Sem hydration mismatch: o `currentExecutionId` não altera o DOM síncrono do primeiro render (só dispara fetch de dados; `steps`/`messages` chegam vazios no 1º paint, idênticos ao render sem id). Por isso **não** foi necessário `skipHydration`.
  - [x] Regra de limpeza (AC5): resolvida pela validação-no-mount (Task 2) — id terminal é **descartado no próximo mount**, garantindo que a próxima visita começa limpa sem apagar os resultados visíveis da sessão corrente (ver Dev Notes → decisão AC5).

- [x] **Task 2 — Validar o id persistido no mount do `AgentChat`** (AC: #1, #2, #6)
  - [x] Em [`AgentChat.tsx`](../../src/components/agent/AgentChat.tsx): `useEffect` de mount que, se houver `currentExecutionId` persistido, faz `GET /api/agent/executions`, acha a linha do id e verifica: existe? `user_id === profile.id` (via `useUser`)? `status ∈ {pending, running, paused}`?
  - [x] Inválida (não achou / terminal / de outro usuário) → `setCurrentExecutionId(null)` e segue first-time. Válida → mantém o id (hooks reidratam mensagens/steps sozinhos).
  - [x] Fetch **defensivo**: try/catch; `!response.ok` ou exceção de rede → **não** apaga o id (revalida no próximo mount). Roda **uma vez** (guard `useRef` `didValidateExecutionRef`), só após o `profile` carregar (necessário p/ conferir `user_id`); execuções criadas na sessão não passam pela validação. O `set-state-in-effect` **não** acusou (setState acontece dentro de IIFE async, não no corpo síncrono do efeito) — nenhum `eslint-disable` necessário.
  - [x] **Decisão de UI de fase** (AC3/AC4): **opcional não implementado** por escolha de escopo mínimo — o `AgentStepProgress` reaparece sozinho com `steps.length > 0` e as mensagens reidratam via `useAgentExecution`. Re-exibir `AgentExecutionPlan` na fase de plano fica como evolução futura (não é o mínimo obrigatório).

- [x] **Task 3 — Limpar o id ao terminar + evitar fantasma** (AC: #3, #5)
  - [x] Limpeza de id terminal feita pela validação-no-mount (não em-sessão, para **não** apagar os resultados/progresso visíveis logo após terminar). É mais robusto: mesmo que o tab que rodou feche antes de observar o terminal, o próximo mount descarta o id. **Zero novo polling.**
  - [x] Reattach `running` → `AgentStepProgress` volta a mostrar o progresso corrente (AC3, coberto por teste): a execução que gasta volta a ficar visível.

- [x] **Task 4 — Testes** (AC: #7) — atualizado no code-review 2026-07-20 (+16 total, era +12)
  - [x] Store (+5): `persist` grava/lê só `currentExecutionId` sob `tdec-agent-ui`; `partialize` não vaza flags efêmeras; set null limpa o persistido; **`persist.rehydrate()` restaura o id de um localStorage semeado** (o restore que o refresh exercita — antes só a escrita era testada); `clearPersistedAgentExecution` limpa memória + storage (logout).
  - [x] Mount validation (+8): id `running`/`paused`/`pending` válido → mantém (e **consulta o servidor**); `completed`/`failed` → limpa; id ausente na lista → limpa; `user_id` diferente → limpa; **payload 200 não-array → mantém (defensivo)**; falha de rede → **não** limpa mas **tenta** validar (defensivo).
  - [x] Reattach (+1): id `running` autopilot restaurado → `AgentChat` renderiza `AgentStepProgress` (steps>0) + mensagens (fix da tela em branco), mantém o id **e restaura o `executionMode`** (autopilot volta a avançar).
  - [x] Regressão (+1): sem id persistido → não valida nem descarta; fluxo cria execução na 1ª mensagem como hoje (NFR4).

- [x] **Task 5 — Validação final**
  - [x] `npx vitest run`: **395 files / 6825 pass / 2 skip / 0 fail** (zero regressão; +12 testes). `npx tsc --noEmit`: 0 diagnostics em `src/` e nos arquivos tocados. `npx eslint --max-warnings=0`: limpo nos 4 arquivos tocados (corrigido de passagem 1 warning pré-existente `fetchCallCount` no teste do AgentChat).
  - [x] **Smoke pela interface real** em `http://localhost:3000/agent` (Playwright, banco real do cliente, logado como Fabossi — skill `verify`, 2026-07-20 pós-code-review). Resultado: **6/6 verificações PASSARAM.**
    - **(a) F5 no meio do briefing:** enviado "Quero prospectar CTOs" → execução `ce6a0736…` criada e **persistida** em `tdec-agent-ui` com shape exato (`{state:{currentExecutionId},version:0}`, sem flags efêmeras); após F5, o **id foi mantido** e a **conversa reidratou** (as 2 mensagens reapareceram, sem tela em branco, sem execução nova). ✅ AC1/AC2/AC4.
    - **(b) reattach de execução ativa com steps** (via id real `d59d7ced…` paused, 5 steps + 21 msgs — mecânica do cenário b sem gastar): após F5 o **id foi mantido**, o **`AgentStepProgress` reatachou** ("Etapa de busca de empresas" visível) e as 43 linhas de mensagem reidrataram. ✅ AC3. Evidência: `22-8-reattach-paused-steps.png`.
    - **(c) descarte de terminal** (id real `a6914d1c…` completed): após F5, **descartado → `currentExecutionId: null`** e tela limpa. ✅ AC2/AC5.
    - **guardrail user_id** (id real `c80637a5…` **pending/ativa mas do Samuel**): após F5, **descartado** mesmo estando ativa (não é do Fabossi) → prova o núcleo de segurança da story (nunca reatachar execução paga de outro usuário do tenant). ✅ AC2.
    - **(d) id inexistente** (UUID fake): **descartado**, tela limpa. **localStorage malformado** (JSON inválido): app iniciou limpo, input presente, **sem crash** (zustand persist tolera parse-fail). ✅ AC2/robustez.
    - **Observação (não é falha da story):** persiste 1 hydration mismatch pré-existente no submenu "Leads" da Sidebar (`aria-expanded`/ChevronDown) — o único erro de console em todos os reloads; documentado pela própria skill `verify` como ruído pré-existente.
    - **Não executado (por guardrail de custo):** o caminho **totalmente ao vivo** de (b)/(c) — clicar "Iniciar Execução" e rodar steps pagos (Apify/OpenAI) até completar — **não** foi disparado (a skill proíbe sem autorização explícita). A mecânica de reattach/descarte desse caminho está provada acima contra execuções reais já existentes (paused com steps + completed).

### Review Findings

Code review adversarial 2026-07-20 (Blind Hunter + Edge Case Hunter + Acceptance Auditor; 15 achados brutos → 7 patch, 4 defer, 4 dismissed). **Os 7 patches foram aplicados e verificados (suíte + tsc + eslint) no mesmo dia** — ver Change Log v1.1.

- [x] [Review][Patch] **[ALTA] Autopilot reatachado não avança: `executionMode` não é restaurado** — quem dispara o próximo step é o cliente (`useAutoTrigger` exige `mode`; [use-auto-trigger.ts:40](../../src/hooks/use-auto-trigger.ts#L40)), e o `partialize` só persiste o id. Reattach de execução autopilot `running` mostra o progresso mas **estanca silenciosamente** quando o step corrente termina. **→ CORRIGIDO:** no ramo `isActive`, `if (match.mode) setExecutionMode(match.mode)` restaura o modo; teste "reataca RUNNING autopilot" agora assere `setExecutionMode("autopilot")`. [src/components/agent/AgentChat.tsx]
- [x] [Review][Patch] **[MÉDIA] Janela pré-validação: id persistido é consumido antes de ser validado** — `useAgentExecution(currentExecutionId)` ligava no mount com o id do localStorage antes da validação resolver (mensagens/steps de execução terminal — ou de outro usuário do tenant em browser compartilhado — apareciam transitoriamente; polling seguia mesmo sem profile). **→ CORRIGIDO:** portão `attachGateOpen` (nasce fechado só quando há id persistido no mount) — `useAgentExecution` recebe `null` até a validação abrir o portão; execuções criadas em sessão e first-time anexam na hora (NFR4 intacto). Complementado por `clearPersistedAgentExecution()` no logout ([Header.tsx](../../src/components/common/Header.tsx)). O sub-caso "enviar mensagem na janela" é sub-segundo e se autocorrige no próximo mount; a UI real é coberta pelo smoke. [src/components/agent/AgentChat.tsx]
- [x] [Review][Patch] **[MÉDIA] Guard `useRef` × StrictMode/troca de usuário anula a validação** — no double-invoke do StrictMode (dev), run 1 trava o ref e é cancelada, run 2 sai pelo ref → o descarte nunca aplicava. **→ CORRIGIDO:** o cleanup rearma `didValidateExecutionRef.current = false`, então a run sobrevivente revalida; também cobre troca de `profile.id` sem unmount (cleanup → re-valida para o novo dono). [src/components/agent/AgentChat.tsx]
- [x] [Review][Patch] **[MÉDIA] AC7(a) parcial: falta teste de _restore_ (reidratação do storage) e do status `pending`** — **→ CORRIGIDO:** +teste `persist.rehydrate()` (semeia `tdec-agent-ui` e prova que o store nasce com o id restaurado); +teste que mantém id `pending`; +teste `clearPersistedAgentExecution` (limpa memória+storage). [__tests__/unit/stores/use-agent-store.test.ts, __tests__/unit/components/agent/AgentChat.test.tsx]
- [x] [Review][Patch] **[BAIXA] HTTP 200 com payload não-array descarta id ativo** — **→ CORRIGIDO:** `if (!Array.isArray(result?.data)) return;` trata shape inesperado como transitório (mantém o id), alinhado ao ramo `!response.ok`; +teste dedicado. [src/components/agent/AgentChat.tsx]
- [x] [Review][Patch] **[BAIXA] Asserções fracas nos testes novos** — **→ CORRIGIDO:** (a) teste de falha de rede agora assere `fetch` tentado; (b) asserção vazia de POST substituída por "id mantido" + `setExecutionMode`; (c) PAUSED e PENDING agora asseram a consulta ao servidor. [__tests__/unit/components/agent/AgentChat.test.tsx]
- [x] [Review][Patch] **[BAIXA] Doc: Task 4 declara "+6" testes, mas são 7** — **→ CORRIGIDO:** Task 4 reescrita para o total real pós-review (+16: Store +5, Mount +8, Reattach +1, Regressão +1). [22-8-reattach-execucao-no-refresh.md — Task 4]
- [x] [Review][Defer] **Validação via lista sem `limit`** — o GET baixa todas as execuções do tenant; cap de ~1000 linhas do PostgREST pode fazer execução ativa antiga sumir da lista → descartada como "inexistente". GET-by-id pontual já é sancionado como opcional pela spec (NFR5). Irrelevante no volume atual do cliente. [src/app/api/agent/executions/route.ts:30] — deferred, pre-existing
- [x] [Review][Defer] **Titularidade `user_id` só no cliente** — as rotas por execução (messages/steps/confirm) checam apenas tenant; qualquer usuário do tenant lê/escreve execução alheia via API. Pré-existente (Epic 16/17); a spec pediu exatamente o filtro client-side implementado. [src/app/api/agent/executions/] — deferred, pre-existing
- [x] [Review][Defer] **Multi-tab: slot único no localStorage** — aba B que cria execução nova sobrescreve `tdec-agent-ui` e órfã a execução da aba A (que segue rodando sem aba anexada após refresh); duas abas na mesma execução autopilot podem duplo-disparar `execute`. Spec declarou concorrência de tabs fora de escopo. [src/stores/use-agent-store.ts] — deferred, out-of-scope por spec
- [x] [Review][Defer] **localStorage cheio/bloqueado faz setters lançarem** — `persist` grava via `setItem` sem try/catch no caminho síncrono; `QuotaExceededError` propagaria para call sites que hoje não tocavam storage. Improvável no perfil de uso atual; wrapper de storage tolerante a falha é barato se precisar. [src/stores/use-agent-store.ts:59-66] — deferred

Dismissed (4): persist sem `version`/`migrate` (1 chave só; decisão SSR documentada na story); cache residual do react-query pós-descarte (id terminal nunca é re-setado); hunk `premiumIcebreakers` no `handleConfirmPlan` (escopo da 22.2, misturado na working tree — não auditado aqui); limbo de execução `pending` sem restaurar estágio do briefing/plano (aceito explicitamente pela spec — AC4 + decisão Task 2).

## Dev Notes

### DEV AGENT GUARDRAILS — o que NÃO quebrar

- **NFR4 — zero regressão:** usuário sem id persistido (first-time, ou storage limpo) tem que ter o comportamento **byte-a-byte** de hoje. O reattach é um ramo `if (idPersistidoVálido)` por cima; o caminho de criar execução na 1ª mensagem ([AgentChat.tsx:119-134](../../src/components/agent/AgentChat.tsx#L119)) não muda.
- **NFR5 — zero migration:** persistência é **client-side** (localStorage via zustand persist). A leitura de validação usa o `GET /api/agent/executions` **que já existe**. Não criar coluna, tabela nem endpoint novo obrigatório (um GET de execução única é **opcional** — a lista já basta).
- **NÃO reintroduzir o bug que a 22.2 revelou:** o objetivo é o oposto de esconder execução paga. Reatachar **só** execução ativa e do próprio usuário; **descartar** terminal. Nunca reatachar um id de outro tenant/usuário (o `GET` é RLS-por-tenant, mas ainda assim filtre por `user_id` do profile atual).
- **NÃO persistir flags efêmeras:** `showModeSelector`/`showExecutionPlan`/`isAgentProcessing`/`executionMode` **não** vão pro storage — reidratar essas do estado obsoleto quebra a UI. Só o `currentExecutionId` persiste; o resto deriva de dados.
- **NÃO tentar resume conversacional aqui:** a máquina do `use-briefing-flow` (status/missingFields) fica fora de escopo. Restaurar a thread de mensagens é suficiente para o AC4. (Resume completo = evolução futura, casa melhor com a 22.3.)
- **Determinismo (NFR1) intocado:** nada aqui toca o pipeline de execução nem os approval gates. É só reconexão de UI a uma execução que já existe.

### A mudança em uma frase

Hoje o refresh perde o `currentExecutionId` (tudo em memória) e a UI começa do zero, deixando execuções pagas rodando invisíveis. Depois desta story: o `currentExecutionId` persiste em localStorage, é **validado contra o servidor no mount** (reataca só o que está ativo e é seu; descarta o resto), e os hooks existentes reidratam mensagens + `AgentStepProgress` — a execução em andamento volta a ficar visível.

### Estado atual dos arquivos-chave (leia antes de editar)

- **`useAgentStore`** ([use-agent-store.ts](../../src/stores/use-agent-store.ts)): `create<AgentUIState & AgentUIActions>(...)` puro, sem middleware. 7 campos de estado, 7 setters. Alvo: envolver com `persist` + `partialize` só `currentExecutionId`.
- **`AgentChat`** ([AgentChat.tsx](../../src/components/agent/AgentChat.tsx)): lê `currentExecutionId` do store; `useAgentExecution(currentExecutionId)` traz `messages`/`steps`; renderiza `AgentStepProgress` quando `steps.length > 0` (linha 304) — **reattach de steps é automático**. `handleSendMessage` cria execução quando `execId` é `null` (linha 119). Não há `useEffect` de mount hoje — é onde entra a Task 2.
- **`useAgentExecution`** ([use-agent-execution.ts:69](../../src/hooks/use-agent-execution.ts#L69)): dado um `executionId`, faz `GET .../messages` e `.../steps` (poll 3s + realtime). `enabled: !!executionId`. Com id `null` não busca nada (por isso a tela fica branca). **Reidrata sozinho** assim que o id volta.
- **`GET /api/agent/executions`** ([route.ts:19](../../src/app/api/agent/executions/route.ts#L19)): retorna `select("*")` de `agent_executions` do tenant (RLS), ordenado por `created_at desc`. Cada linha tem `id`, `user_id`, `status`, `mode`, `cost_estimate`, `current_step`, `total_steps`. É a fonte da validação-no-mount (achar o id, checar `status` e `user_id`). Já é usado pelo onboarding para detectar first-time.
- **`ExecutionStatus`** ([agent.ts:10](../../src/types/agent.ts#L10)): `'pending' | 'running' | 'paused' | 'completed' | 'failed'`. Ativos (reattach): `pending`/`running`/`paused`. Terminais (descartar): `completed`/`failed`.

### Decisão de design a registrar (localStorage vs server-derived)

O escopo aprovado usa **localStorage (zustand persist) + validação-no-mount contra o servidor**. Alternativa considerada e **não** escolhida agora: **server-derived** (no mount, `GET /executions` e pegar a execução ativa mais recente do usuário, sem localStorage) — mais robusto entre dispositivos, mas troca "retomar a MINHA sessão neste tab" por "retomar a última ativa em qualquer lugar", e mistura melhor com multi-tab. Como o `GET` já é chamado na validação, migrar para server-derived depois é barato. Manter localStorage como fonte primária + servidor como validador é o meio-termo que fecha o buraco da fantasma sem sobre-engenharia.
- **Multi-tab:** localStorage é compartilhado entre tabs do mesmo browser — duas abas na mesma execução é aceitável (ambas reidratam a mesma coisa). Não é objetivo desta story resolver concorrência de tabs.

### Padrões estabelecidos a seguir

- **Zustand persist:** `import { persist } from "zustand/middleware"` + `partialize: (s) => ({ currentExecutionId: s.currentExecutionId })`. Storage key namespaced.
- **Fetch defensivo no mount** (espelha o padrão da 22.1/22.2): try/catch, uma vez por id (guard em `useRef`), sem travar a UI em falha de rede. `eslint-disable-next-line react-hooks/set-state-in-effect` **justificado** se o lint acusar o set-state do fetch-on-mount intencional (ver Debug Log da 22.2 — mesmo lint estrito, lint-staged linta o arquivo inteiro).
- **ESLint:** `no-console` enforced; `no-non-null-assertion` (leitura guardada). **Português (BR)** em qualquer texto de UI novo (não deve haver muito).
- **Tailwind v4:** se tocar layout, `flex flex-col gap-*` (nunca `space-y-*`) — Project Memory.

### Testing standards

- Vitest (`npx vitest run`). Mock de `fetch`/`GET /api/agent/executions` para a validação-no-mount. Mock do storage para o `persist` (o zustand persist aceita um storage customizado nos testes). Componente `AgentChat` já tem teste ([__tests__/unit/components/agent/](../../__tests__/unit/components/agent/)) — seguir o setup existente (mocks de `useAgentExecution`, store).
- **Prove o fix da tela em branco:** teste que, com id `running` restaurado e steps mockados, o `AgentChat` mostra `AgentStepProgress` + mensagens (RED contra o código atual, que não restaura id).
- **Lição sistêmica (Epic 21):** a suíte **não prova** o localStorage real nem o refresh de verdade. O mock do storage não é o localStorage do browser, e o realtime não roda no teste. Por isso a Task 5 pede smoke manual dos 4 cenários. Não declarar "pronto" só com a suíte verde.

### Project Structure Notes

- Sem novos arquivos de rota, sem migration. Mudança concentrada em `use-agent-store.ts` (persist) + `AgentChat.tsx` (validação-no-mount). `useAgentExecution` provavelmente **não** muda (já reidrata). Um GET de execução única é opcional e só se a lista se mostrar cara — não é requisito.
- A separação "dados vêm dos hooks / UI reata a partir do id" é preservada; a story só devolve o id ao store no momento certo.

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.8] — seção adicionada por esta story (pós-planejamento, padrão 21.9)
- [Source: src/stores/use-agent-store.ts] — store sem persist (alvo Task 1)
- [Source: src/components/agent/AgentChat.tsx#L119-L134,#L296-L309] — criação de execução quando id null; render condicional de plano/steps (alvo Task 2/3)
- [Source: src/hooks/use-agent-execution.ts#L69-L110] — reidratação de mensagens/steps por executionId (já pronta)
- [Source: src/app/api/agent/executions/route.ts#L19-L44] — `GET /executions` para validação-no-mount
- [Source: src/types/agent.ts#L10] — `ExecutionStatus` (ativos vs terminais)
- [Source: 22-2-icebreaker-premium-com-linkedin-toggle-opcional.md] — origem da story (execução fantasma + toggle premium pago); padrão de fetch defensivo e nota do lint `set-state-in-effect`

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- **`set-state-in-effect`:** não acusou. O `setCurrentExecutionId(null)` da validação roda dentro de uma IIFE `async` (após `await fetch`), não no corpo síncrono do `useEffect` — que é o que a regra flagra. Nenhum `eslint-disable` foi necessário (diferente do temido pela nota da 22.2).
- **Mock do store nos testes do AgentChat:** a validação-no-mount lê `useAgentStore.getState().currentExecutionId`. O mock legado só suportava chamada por selector; adicionei `getState()` via `Object.assign` para não quebrar.
- **`useUser` nos testes legados:** o novo `useUser()` no componente exigiu mock. Default `profile: null` → a validação aguarda o profile e **não dispara** nos 34 testes legados (intactos). Os 9 testes novos setam `profile` explicitamente.
- **1 warning pré-existente corrigido de passagem:** `fetchCallCount` (unused) no teste M1 do AgentChat — removido para o `eslint --max-warnings=0` passar no arquivo tocado (lint-staged linta o arquivo inteiro; padrão da 22.2).

### Completion Notes List

- **A mudança:** `currentExecutionId` agora persiste em `localStorage` (zustand `persist` + `partialize` só o id, key `tdec-agent-ui`). No mount do `AgentChat`, um `useEffect` (once, guard `useRef`, após `profile` carregar) valida o id contra `GET /api/agent/executions`: reataca **só** se existe, é do usuário (`user_id === profile.id`) e está ativo (`pending`/`running`/`paused`); terminal/inexistente/de-outro-usuário → descarta e inicia limpo. Mensagens e `AgentStepProgress` reidratam sozinhos pelos hooks existentes (`useAgentExecution`) — a execução que gasta volta a ficar visível, fechando o buraco da "execução fantasma".
- **Decisão AC5 (limpar id no terminal):** implementado via **descarte na validação-no-mount** (não em-sessão). Limpar o id em-sessão ao observar terminal apagaria imediatamente os steps/resultados visíveis (o `AgentStepProgress` depende de `currentExecutionId` para trazer os steps), ferindo o AC3. E limpar só o storage (mantendo o id em memória) é frágil: qualquer mudança de estado do store re-persistiria o id (partialize reescreve na storage a cada write). Descartar no próximo mount satisfaz plenamente a *razão* do AC5 ("próxima visita começa limpa e não reataca algo já encerrado") e é mais robusto (funciona mesmo se o tab fechar antes de observar o terminal). Registrado como decisão de design.
- **Escopo mínimo respeitado:** NÃO há resume conversacional (máquina do `use-briefing-flow` fica em memória, fora de escopo — AC4 aceito: thread reidrata, próximo turno reprocessa). Re-exibir o `AgentExecutionPlan` na fase de plano é opcional e **não** foi implementado.
- **Guardrails honrados:** NFR4 (sem id → byte-a-byte de hoje, provado por teste), NFR5 (zero migration — client-side + endpoint existente), NFR1 (pipeline/gates intocados). Filtro por `user_id` além do RLS-por-tenant (nunca reataca execução de outro usuário do mesmo tenant).
- **✅ Smoke pela interface real FEITO (2026-07-20, code-review):** 6/6 verificações passaram em `/agent` (Playwright, banco real, logado como Fabossi) — persist+reidratação, reattach de ativa com steps, descarte de terminal, **guardrail user_id contra execução real do Samuel**, id inexistente e localStorage malformado. Detalhe na Task 5. Único resíduo: o caminho totalmente pago ao vivo (Iniciar Execução) não foi disparado por guardrail de custo — mecânica provada contra execuções reais existentes.

### File List

**Modified:**
- `src/stores/use-agent-store.ts` — `persist` + `partialize` (só `currentExecutionId`), key `tdec-agent-ui`. **Code-review:** +`clearPersistedAgentExecution()` (limpa memória + storage, usado no logout).
- `src/components/agent/AgentChat.tsx` — `useUser` + `useEffect` de validação-no-mount (reattach/descarte); import de `useRef` e do tipo `AgentExecution`. **Code-review:** portão `attachGateOpen` (só anexa `useAgentExecution` a id validado); restaura `executionMode` no reattach ativo; guard de payload não-array; rearme do ref no cleanup (StrictMode/troca-de-usuário).
- `src/components/common/Header.tsx` — **Code-review:** chama `clearPersistedAgentExecution()` no logout (o próximo usuário do browser não reidrata a execução do anterior).
- `__tests__/unit/stores/use-agent-store.test.ts` — +5 testes de persistência (persist/partialize/clear + **rehydrate/restore** + **clearPersistedAgentExecution**).
- `__tests__/unit/components/agent/AgentChat.test.tsx` — mock de `useUser`; `getState` no mock do store; mock de `AgentStepProgress`; `mockExecutionData` mutável; +11 testes de reattach (inclui **pending**, **payload não-array**, **restaura mode**, asserções fortalecidas); removido `fetchCallCount` unused pré-existente.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-20 | 1.0 | Implementação da story 22.8: persistência de `currentExecutionId` (zustand `persist`/`partialize`) + validação-no-mount contra `GET /api/agent/executions` (reataca só execução ativa e do usuário; descarta terminal/inexistente/de-outro-usuário). Zero migration. +12 testes; suíte 395/6825/2 skip/0 fail; tsc/eslint limpos. Status → review. | Amelia (dev-story) |
| 2026-07-20 | 1.1 | **Code-review adversarial (3 camadas) + 7 patches aplicados.** ALTA: autopilot reatachado parava de avançar → restaura `executionMode` no reattach. MÉDIA: janela pré-validação exibia/pollava id não-validado → portão `attachGateOpen` + limpeza no logout; StrictMode anulava o descarte → rearme do ref no cleanup; faltava teste de restore/pending → adicionados. BAIXA: payload 200 não-array descartava id ativo → tratado como transitório; asserções fracas fortalecidas; doc Task 4 corrigida. +16 testes (era +12); suíte **395/6828 pass/2 skip** (1 flaky EmailBlock, verde isolado, não relacionado); `tsc` 0 em `src/` e nos arquivos tocados; `eslint --max-warnings=0` limpo. 4 achados deferidos (lista sem limit, user_id server-side, multi-tab, quota localStorage), 4 dismissed. | Claude (code-review) |
