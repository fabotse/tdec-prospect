# Story 17.7: Lógica Guiado vs Autopilot & Adaptação de Pipeline

Status: done

## Story

Como usuário do Agente TDEC,
Quero poder executar o pipeline sem interrupções no modo Autopilot e ter etapas puladas quando não aplicáveis,
Para que eu tenha flexibilidade entre controle total e execução rápida conforme minha confiança no agente.

## Acceptance Criteria

1. **Execução Autopilot sem interrupções**
   - **Given** o modo selecionado é Autopilot
   - **When** cada step do pipeline conclui (status 'completed' via Realtime)
   - **Then** o frontend dispara automaticamente o próximo step via POST `/api/agent/executions/[executionId]/steps/[stepNumber]/execute`
   - **And** o usuário vê o progresso em tempo real mas não precisa intervir
   - **And** nenhum approval gate é exibido

2. **Conclusão Autopilot com resumo final**
   - **Given** o modo é Autopilot e o pipeline completa todas as etapas
   - **When** o último step conclui
   - **Then** o agente envia mensagem com resumo final completo (empresas, leads, campanha, export, ativação)
   - **And** a execução é marcada como 'completed'

3. **Lógica de skip de etapas (shouldSkip)**
   - **Given** o briefing indica via `skipSteps[]` que uma etapa não é aplicável
   - **When** o DeterministicOrchestrator avalia `shouldSkip()` de cada step antes de executar
   - **Then** etapas não aplicáveis recebem status 'skipped' no DB e são puladas (FR11)
   - **And** o agente insere mensagem informando quais etapas foram puladas e por quê

4. **Representação visual de etapas puladas e awaiting_approval**
   - **Given** o pipeline tem etapas puladas ou aguardando aprovação
   - **When** o AgentStepProgress renderiza
   - **Then** etapas puladas aparecem com visual distinto (riscadas + cinza com ícone SkipForward)
   - **And** etapas awaiting_approval aparecem com visual distinto (amarelo com ícone Clock)
   - **And** a contagem "Etapa X de Y" reflete apenas etapas ativas (não-skipped)

5. **Auto-trigger do primeiro step após confirmação do plano**
   - **Given** o usuário confirma o plano de execução (handleConfirmPlan)
   - **When** o modo é Autopilot
   - **Then** o frontend dispara automaticamente o step 1 sem intervenção
   - **And** no modo Guided, o frontend também dispara o step 1 (a pausa ocorre APÓS execução via awaiting_approval)

6. **Auto-advance após aprovação em Guided mode**
   - **Given** o modo é Guided e o usuário aprova um step
   - **When** a aprovação é bem-sucedida (step status → 'approved')
   - **Then** o frontend dispara automaticamente o próximo step
   - **And** nenhuma ação manual é necessária entre aprovação e próximo step

## Tasks / Subtasks

### Task 1: Lógica shouldSkip no Orchestrator (AC: #3)

- [x] 1.1 Adicionar método `shouldSkip(stepType, briefing)` no `DeterministicOrchestrator` (`src/lib/agent/orchestrator.ts`)
  - Verifica se `briefing.skipSteps` contém o `stepType`
  - Retorna `boolean`
- [x] 1.2 No `executeStep()`, antes de despachar para o step, chamar `shouldSkip()`
  - Se skip: atualizar `agent_steps` com `status: 'skipped'`, `output: { skipped: true, reason: 'briefing_skip' }`, `completed_at`
  - Inserir `agent_messages` com `messageType: 'skip'` informando qual etapa e por quê
  - Retornar `{ success: true, data: { skipped: true, reason: 'briefing_skip' } }` sem executar o step
- [x] 1.3 Manter a lógica existente de skip do `activate` quando `activationDeferred === true` (Story 17.6) — não alterar esse bloco
- [x] 1.4 Testes unitários para `shouldSkip()`:
  - Step no `skipSteps[]` → skip com mensagem
  - Step fora do `skipSteps[]` → executa normalmente
  - `skipSteps` vazio ou undefined → executa normalmente
  - Integração com lógica existente de `activationDeferred`

### Task 2: Auto-trigger Autopilot no Frontend (AC: #1, #5)

- [x] 2.1 Criar hook `useAutoTrigger(executionId, steps, mode)` em `src/hooks/use-auto-trigger.ts`
  - Monitora mudanças em `steps` via Realtime (já recebidos pelo `useAgentExecution`)
  - Quando um step muda para `'completed'` e `mode === 'autopilot'`:
    - Calcula `nextStepNumber = completedStep.step_number + 1`
    - Verifica se existe step com esse número na lista
    - Se sim: POST `/api/agent/executions/${executionId}/steps/${nextStepNumber}/execute`
  - Guard: não dispara se já existe step `'running'` (evita duplicação)
  - Guard: não dispara se execução já está `'completed'`
  - Guard: `useRef` para tracking do último step disparado (previne race conditions)
- [x] 2.2 Integrar `useAutoTrigger` no `AgentChat.tsx`
  - Passar `executionId`, `steps` e `mode` (do execution ou store)
  - O hook opera autonomamente via efeito reativo
- [x] 2.3 Em `handleConfirmPlan` (`AgentChat.tsx`), após confirmação bem-sucedida:
  - Disparar automaticamente o step 1: POST `.../steps/1/execute`
  - Aplicável a AMBOS os modos (guided e autopilot)
  - O auto-trigger do hook cuida dos steps subsequentes apenas no Autopilot
- [x] 2.4 Testes unitários para `useAutoTrigger`:
  - Step completa em autopilot → dispara próximo
  - Step completa em guided → NÃO dispara próximo (approval gate trata)
  - Último step completa → NÃO dispara (execução finalizada)
  - Step já running → NÃO dispara (guard de duplicação)
  - Race condition: dois updates rápidos → apenas um dispatch

### Task 3: Auto-advance após aprovação em Guided Mode (AC: #6)

- [x] 3.1 Nos componentes de approval gate existentes, após aprovação bem-sucedida, disparar o próximo step:
  - `AgentApprovalGate.tsx` (empresas/leads) — após `onAction('approved')`
  - `AgentLeadReview.tsx` — após `onAction('approved')`
  - `AgentCampaignPreview.tsx` — após `onAction('approved')`
  - `AgentActivationGate.tsx` — este é o último gate, NÃO disparar próximo step se `activate: false` (deferred)
- [x] 3.2 Criar função utilitária `triggerNextStep(executionId, currentStepNumber, totalSteps)` em `src/lib/agent/client-utils.ts`
  - POST para `/api/agent/executions/${executionId}/steps/${currentStepNumber + 1}/execute`
  - Guard: se `currentStepNumber >= totalSteps`, não dispara
  - Retorna resultado do fetch
- [x] 3.3 Cada gate chama `triggerNextStep` após approve bem-sucedido
  - Usar os props `executionId` e `stepNumber` já disponíveis
  - Obter `totalSteps` via prop adicional ou do contexto
- [x] 3.4 Testes: aprovação em guided → próximo step é disparado; último step → não dispara

### Task 4: Visual de etapas skipped e awaiting_approval no AgentStepProgress (AC: #4)

- [x] 4.1 Atualizar `AgentStepProgress.tsx` (`src/components/agent/AgentStepProgress.tsx`):
  - Importar ícones: `SkipForward` e `Clock` do `lucide-react`
  - Adicionar no `StatusIcon`:
    - `"skipped"` → `<SkipForward className="h-4 w-4" />`
    - `"awaiting_approval"` → `<Clock className="h-4 w-4" />`
  - Adicionar classes no `StepRow`:
    - `"skipped"` → `text-muted-foreground line-through opacity-60`
    - `"awaiting_approval"` → `text-yellow-600 font-medium`
    - `"approved"` → `text-green-600` (mesmo visual que completed)
- [x] 4.2 Ajustar contagem "Etapa X de Y":
  - `activeSteps = steps.filter(s => s.status !== 'skipped')`
  - `activeIndex = activeSteps.findIndex(s => s.step_number === currentStep) + 1`
  - Exibir: `Etapa ${activeIndex}/${activeSteps.length}: ${label}...`
- [x] 4.3 Testes unitários para `AgentStepProgress`:
  - Renderiza step skipped com line-through e ícone SkipForward
  - Renderiza step awaiting_approval com amarelo e ícone Clock
  - Renderiza step approved com verde
  - Contagem exclui steps skipped
  - Mix de statuses renderiza corretamente

### Task 5: Mensagem de resumo final no Autopilot (AC: #2)

- [x] 5.1 No `DeterministicOrchestrator.executeStep()`, quando `stepNumber === totalSteps` e `mode !== 'guided'`:
  - Após completar execução, inserir `agent_messages` com:
    - `role: 'agent'`
    - `content`: resumo em português com dados consolidados de todos os steps
    - `metadata: { messageType: 'summary', stepNumber }`
  - Montar resumo a partir dos outputs de todos os steps:
    - Empresas encontradas (step 1 output)
    - Leads encontrados (step 2 output)
    - Campanha criada (step 3 output)
    - Campanha exportada (step 4 output)
    - Campanha ativada (step 5 output)
  - Se algum step foi skipped, mencionar no resumo
- [x] 5.2 Formato da mensagem:
  ```
  Pipeline concluído com sucesso!

  Resumo:
  • Empresas: X encontradas via TheirStack
  • Leads: Y contatos encontrados via Apollo
  • Campanha: "Nome" criada com Z emails na sequência
  • Export: Campanha exportada para Instantly com W leads
  • Ativação: Campanha ativada (ou "Etapa pulada — não aplicável")
  ```
- [x] 5.3 Testes: resumo gerado no autopilot; resumo inclui steps skipped; não gera em guided mode

## Dev Notes

### Arquitetura e Padrões Obrigatórios

- **Orchestrator Pattern:** `DeterministicOrchestrator` em `src/lib/agent/orchestrator.ts` é o ponto central. Toda lógica de skip e mode-aware deve ficar aqui, NÃO nos steps individuais.
- **BaseStep (Template Method):** `src/lib/agent/steps/base-step.ts` — `run()` já trata mode: guided → `saveAwaitingApproval()` / autopilot → `saveCheckpoint()`. Não alterar essa lógica.
- **Realtime:** Canal único em `useAgentExecution` (`src/hooks/use-agent-execution.ts`) — o hook `useAutoTrigger` deve consumir os steps já disponíveis, NÃO criar novo canal Realtime.
- **Error Handling:** 4 camadas: Service → Step → Orchestrator → API Route. Orquestrador usa `status: 'paused'` (nunca 'failed' direto) + `sendErrorMessage()`.
- **State Management:** TanStack Query v5 para server state, Zustand para UI state (`useAgentStore`).

### Implementação Atual — O que já existe

| Componente | Estado | Localização |
|---|---|---|
| `ExecutionMode` type | ✅ Existe | `src/types/agent.ts:11` |
| `StepStatus` com 'skipped' | ✅ Existe | `src/types/agent.ts:13` |
| `ParsedBriefing.skipSteps` | ✅ Existe | `src/types/agent.ts:81` |
| `PlannedStep.skipped` | ✅ Existe | `src/types/agent.ts:108` |
| Mode selection UI | ✅ Existe | `AgentModeSelector.tsx` |
| Plan skip filtering | ✅ Existe | Confirm route filtra steps com `skipped=false` |
| Guided flow (awaiting_approval) | ✅ Existe | `BaseStep.run()` lines 53-58 |
| Autopilot flow (direct complete) | ✅ Existe | `BaseStep.run()` lines 56-58 |
| Activation deferred skip | ✅ Existe | `orchestrator.ts` lines 146-198 |
| Approval gates (4 componentes) | ✅ Existe | `AgentApprovalGate`, `AgentLeadReview`, `AgentCampaignPreview`, `AgentActivationGate` |
| **Auto-trigger autopilot** | ❌ NÃO existe | Precisa criar |
| **shouldSkip() genérico** | ❌ NÃO existe | Apenas hardcoded activate skip |
| **Visual skipped/awaiting UI** | ❌ NÃO existe | `AgentStepProgress` só trata 4 statuses |
| **Auto-advance após approval** | ❌ NÃO existe | Approval gates não disparam próximo step |
| **Auto-trigger step 1 após confirm** | ❌ NÃO existe | `handleConfirmPlan` só envia mensagem |

### Gaps Críticos a Implementar

1. **shouldSkip() no Orchestrator** — Generalizar o padrão de skip. Atualmente só existe skip hardcoded para `activate` + `activationDeferred`. Precisa de shouldSkip genérico baseado em `briefing.skipSteps[]`.

2. **Auto-trigger Frontend (Autopilot)** — Nenhum mecanismo dispara o próximo step automaticamente. O Realtime já entrega updates de steps, mas ninguém reage a eles para avançar. Hook `useAutoTrigger` resolve isso.

3. **Auto-trigger Step 1 após Confirm** — `handleConfirmPlan` em `AgentChat.tsx` (line 216) confirma o plano mas NÃO inicia execução. O step 1 precisa ser disparado automaticamente.

4. **Auto-advance após Approval (Guided)** — Os gates de aprovação (`AgentApprovalGate`, etc.) fazem POST no approve mas não disparam o próximo step. O usuário ficaria preso sem ação.

5. **Visual no AgentStepProgress** — Componente (line 76-87) só renderiza 4 statuses: running, completed, failed, pending. Faltam: `skipped` (ícone SkipForward, line-through), `awaiting_approval` (ícone Clock, amarelo), `approved` (verde).

### Padrões de Código — Seguir Rigorosamente

**API Routes:**
- `getCurrentUserProfile` para auth
- UUID regex validation
- stepNumber parseInt + isNaN check
- Tenant match check
- Resposta: `Response.json({ success: true, data: ... })` ou `Response.json({ error: { message } }, { status })`

**React Components:**
- `"use client"` no topo
- Props interface tipada
- Loading/actionTaken state via `useState`
- Fetch com `response.ok` check
- Disable buttons após ação
- Texto em Português (BR)
- shadcn/ui: Card, Button, etc.

**Hooks:**
- `useCallback` para handlers
- `useRef` para guards de race condition
- Cleanup no `useEffect` return

**Testes (Vitest):**
- Centralized mock factories
- `@testing-library/react` para componentes
- Happy path + error states + edge cases
- NENHUM `console.log`
- ESLint no-console rule enforced

### Project Structure Notes

**Novos arquivos a criar:**
- `src/hooks/use-auto-trigger.ts` — Hook de auto-trigger para autopilot
- `src/lib/agent/client-utils.ts` — Utilitário `triggerNextStep()` para cliente
- `__tests__/unit/hooks/use-auto-trigger.test.ts` — Testes do hook
- `__tests__/unit/components/agent/AgentStepProgress.test.tsx` — Testes do componente atualizado

**Arquivos a modificar:**
- `src/lib/agent/orchestrator.ts` — shouldSkip() + mensagem de resumo final
- `src/components/agent/AgentStepProgress.tsx` — Visual de skipped/awaiting_approval
- `src/components/agent/AgentChat.tsx` — Integrar useAutoTrigger + auto-trigger step 1
- `src/components/agent/AgentApprovalGate.tsx` — Auto-advance após approve
- `src/components/agent/AgentLeadReview.tsx` — Auto-advance após approve
- `src/components/agent/AgentCampaignPreview.tsx` — Auto-advance após approve
- `src/components/agent/AgentActivationGate.tsx` — Auto-advance após approve (com guard para deferred)
- `__tests__/unit/lib/agent/orchestrator.test.ts` — Novos testes de shouldSkip + resumo

### Riscos e Cuidados

- **Race condition no auto-trigger:** Dois updates Realtime rápidos podem causar double-dispatch. Usar `useRef` como lock. Verificar se já existe step `'running'` antes de disparar.
- **Skip + previousStepOutput:** Quando um step é pulado, o próximo step precisa receber o output do último step NÃO-pulado. O orchestrator já busca `prevStep` por `stepNumber - 1`, mas se esse step foi skipped, não terá output. Solução: buscar o último step com status `completed` ou `approved` ao invés de `stepNumber - 1`.
- **Contagem de steps:** O confirm route já filtra steps skipped do plano (não insere no DB). Mas shouldSkip no orchestrator pode skipar steps DURANTE execução. Ambos cenários devem funcionar.
- **Não duplicar resumo:** Story 17.6 já envia resumo no approve route quando é o último step em guided mode. O resumo da Task 5 deve ser APENAS para autopilot (`mode !== 'guided'`).

### References

- [Source: `_bmad-output/planning-artifacts/epics-agente-tdec.md` — Epic 17, Story 17.7]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — Pipeline Orchestrator, Approval Gates, Realtime]
- [Source: `src/lib/agent/orchestrator.ts` — DeterministicOrchestrator implementation]
- [Source: `src/lib/agent/steps/base-step.ts` — BaseStep template method]
- [Source: `src/components/agent/AgentStepProgress.tsx` — Current 4-status rendering]
- [Source: `src/hooks/use-agent-execution.ts` — Realtime channel pattern]
- [Source: `src/components/agent/AgentChat.tsx:216` — handleConfirmPlan (needs auto-trigger)]
- [Source: `17-6-approval-gates-campanha-ativacao.md` — Previous story patterns and learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: `shouldSkip(stepType, briefing)` adicionado ao orchestrator. Busca de previousStepOutput alterada para usar `lt + order + limit` ao inves de `eq(stepNumber-1)` para lidar com steps pulados. 6 novos testes.
- Task 2: Hook `useAutoTrigger` criado. Integrado no AgentChat. `handleConfirmPlan` agora auto-dispara step 1 em ambos os modos. Store expandido com `executionMode` e `totalSteps`. 7 novos testes.
- Task 3: `triggerNextStep()` utilitario criado em `client-utils.ts`. Todos os 4 approval gates agora chamam `triggerNextStep` apos aprovacao. `AgentMessageBubble` passa `totalSteps` via Zustand store. 4 novos testes.
- Task 4: `AgentStepProgress` atualizado com icones `SkipForward` e `Clock`, classes visuais para skipped/awaiting_approval/approved, e contagem de steps ativas (excluindo skipped). 5 novos testes.
- Task 5: `sendSummaryMessage()` privado no orchestrator. Consolida outputs de todos os steps em mensagem de resumo PT-BR. Gera apenas em autopilot. Menciona steps pulados. 3 novos testes.
- Full regression: 349 test files, 5936 tests passing, 0 failures.

### Code Review Fixes (2026-03-27)

- **M1**: triggerNextStep nos 4 approval gates agora e fire-and-forget com `.catch(() => {})` — erro de auto-advance nao polui UI de aprovacao
- **M2**: Auto-trigger step 1 em handleConfirmPlan agora e fire-and-forget — falha nao mostra "Erro ao confirmar"
- **M3**: triggerStep no useAutoTrigger agora tem `.catch(() => {})` — previne unhandled promise rejection
- **M4**: Blocos shouldSkip e activationDeferred no orchestrator agora wrapped em try/catch com paused+sendErrorMessage — segue padrao de error handling consistente
- **L1**: MessageTypeIcon e label agora tratam messageType "skip" com icone SkipForward e label "Etapa Pulada"
- **L2**: AgentStepProgress mostra contagem "Etapa X/Y" para awaiting_approval alem de running
- Full regression post-review: 349 test files, 5936 tests passing, 0 failures.

### Pipeline Bugfixes — Testes E2E (2026-03-27)

Bugs encontrados e corrigidos durante testes manuais E2E do pipeline completo:

- **BF1 (Story 17.1)**: `SearchCompaniesStep` — location "São Paulo" passada como country code → TheirStack 400. Fix: COUNTRY_MAP expandido com cidades/estados brasileiros + validacao ISO 2-letter. Valores invalidos ignorados ao inves de enviados. `search-companies-step.ts`
- **BF2 (Story 17.1)**: `SearchCompaniesStep` — `MVP_LIMIT` reduzido de 50 para 2 empresas (economia de creditos TheirStack em ambiente de teste). `search-companies-step.ts`
- **BF3 (Story 17.3)**: `CreateCampaignStep.parseStructureJSON()` — AI retorna JSON em markdown fences (` ```json ``` `) ou formato `{ structure: { items } }` ao inves de `{ items }`. Fix: strip fences + aceita ambos os formatos. `create-campaign-step.ts`
- **BF4 (Story 17.4)**: `ExportStep` — endpoint `POST /api/v2/account-campaign-mappings` do Instantly deprecado (404). Fix: sending accounts passadas via `email_list` no `createCampaign`. `export-step.ts`
- **BF5 (Story 17.2)**: `SearchLeadsStep` — leads da Apollo sem email (nao enriquecidos). Fix: enriquecimento movido para `CreateCampaignStep` — so enriquece leads APROVADOS pelo usuario (email + nome completo sem asteriscos). `search-leads-step.ts`, `create-campaign-step.ts`, `agent.ts` (apolloId em SearchLeadResult)
- **BF6 (Infra)**: `useSendMessage.onMutate` setava `isAgentProcessing(true)` em toda mensagem — "Agente digitando..." ficava travado apos briefing confirmado. Fix: removido, gerenciamento explicito pelo briefing flow. `use-agent-execution.ts`
- **BF7 (Infra)**: `useAgentExecution` — steps query usava `Promise.resolve([])` (so Realtime). Realtime reporta SUBSCRIBED mas nao entrega eventos. Fix: GET `/api/agent/executions/[id]/steps` route criada + polling 3s para messages e steps. `use-agent-execution.ts`, `steps/route.ts`
- **BF8 (Story 17.6)**: `AgentActivationGate.handleDefer` nao disparava `triggerNextStep` — execucao ficava pendurada apos "Ativar Depois". Fix: triggerNextStep adicionado para que orchestrator processe `activationDeferred` skip. `AgentActivationGate.tsx`
- **BF9 (Infra)**: Error logging adicionado na execute route e `ExternalService.executeRequest` — HTTP status + body do servico externo visivel no terminal. `execute/route.ts`, `base-service.ts`
- Full regression post-bugfixes: 349 test files, 5939 tests passing, 0 failures.

### Change Log

- 2026-03-27: Story 17.7 implementada — logica guiado vs autopilot completa
- 2026-03-27: Code review adversarial — 4 MEDIUM + 2 LOW issues found and fixed
- 2026-03-27: 9 pipeline bugfixes via testes E2E manuais

### File List

**Novos:**
- src/hooks/use-auto-trigger.ts
- src/lib/agent/client-utils.ts
- src/app/api/agent/executions/[executionId]/steps/route.ts
- __tests__/unit/hooks/use-auto-trigger.test.ts
- __tests__/unit/lib/agent/client-utils.test.ts

**Modificados:**
- src/lib/agent/orchestrator.ts
- src/lib/agent/steps/search-companies-step.ts
- src/lib/agent/steps/search-leads-step.ts
- src/lib/agent/steps/create-campaign-step.ts
- src/lib/agent/steps/export-step.ts
- src/lib/services/base-service.ts
- src/stores/use-agent-store.ts
- src/types/agent.ts
- src/hooks/use-agent-execution.ts
- src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts
- src/components/agent/AgentChat.tsx
- src/components/agent/AgentStepProgress.tsx
- src/components/agent/AgentApprovalGate.tsx
- src/components/agent/AgentLeadReview.tsx
- src/components/agent/AgentCampaignPreview.tsx
- src/components/agent/AgentActivationGate.tsx
- src/components/agent/AgentMessageBubble.tsx
- __tests__/unit/lib/agent/orchestrator.test.ts
- __tests__/unit/lib/agent/steps/search-companies-step.test.ts
- __tests__/unit/lib/agent/steps/search-leads-step.test.ts
- __tests__/unit/lib/agent/steps/create-campaign-preview.test.ts
- __tests__/unit/lib/agent/steps/export-step.test.ts
- __tests__/unit/hooks/use-agent-execution.test.tsx
- __tests__/unit/hooks/use-agent-messages.test.tsx
- __tests__/unit/components/agent/AgentStepProgress.test.tsx
- __tests__/unit/components/agent/AgentChat.test.tsx
