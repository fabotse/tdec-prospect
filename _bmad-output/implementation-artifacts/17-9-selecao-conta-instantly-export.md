# Story 17.9: Selecao de Conta Instantly no Export

Status: done

## Story

As a usuario do Agente TDEC,
I want escolher qual conta de email (sending account) usar ao exportar a campanha para o Instantly,
So that eu tenha controle sobre qual remetente sera usado na campanha, evitando enviar de contas erradas ou saturadas.

## Acceptance Criteria

1. **Given** o pipeline atinge o step de Export e o modo e Guiado
   **When** o approval gate do export e apresentado ao usuario
   **Then** o gate exibe a lista de sending accounts disponiveis na conta Instantly do usuario
   **And** o usuario pode selecionar uma ou mais contas para usar como remetente
   **And** a selecao padrao e nenhuma conta pre-selecionada (usuario deve escolher explicitamente)

2. **Given** o usuario selecionou as contas de envio no approval gate
   **When** o usuario aprova o step de export
   **Then** o ExportStep usa APENAS as contas selecionadas pelo usuario no parametro `email_list` da criacao da campanha no Instantly
   **And** as contas nao selecionadas NAO sao incluidas

3. **Given** o modo e Autopilot
   **When** o step de export executa sem intervencao do usuario
   **Then** o sistema usa TODAS as sending accounts disponiveis (comportamento atual mantido)
   **And** o resumo final informa quais contas foram usadas

4. **Given** nenhuma sending account esta disponivel no Instantly
   **When** o step de export tenta listar as contas
   **Then** o step falha com mensagem clara: "Nenhuma conta de envio encontrada no Instantly. Configure ao menos uma conta antes de exportar."

## Tasks / Subtasks

- [x] Task 1: Incluir lista de accounts no previewData do ExportStep (AC: #1)
  - [x] 1.1 Em `src/lib/agent/steps/export-step.ts`, modificar `buildPreviewData()` para incluir `accounts: InstantlyAccountItem[]` (email, first_name, last_name) alem dos dados existentes
  - [x] 1.2 O ExportStep ja faz `service.listAccounts()` em `executeInternal()` — mover ou duplicar a chamada para que os accounts estejam disponiveis no output ANTES do approval gate (o `buildPreviewData` recebe o `StepOutput` que contem `result.data`)
  - [x] 1.3 Adicionar `accounts: InstantlyAccountItem[]` ao `ExportStepOutput` em `src/types/agent.ts`
  - [x] 1.4 Atualizar `ExportPreviewData` interface no `AgentActivationGate.tsx` para incluir `accounts: Array<{ email: string; first_name: string; last_name: string }>`

- [x] Task 2: UI de selecao de contas no AgentActivationGate (AC: #1, #2)
  - [x] 2.1 Em `src/components/agent/AgentActivationGate.tsx`, adicionar state `selectedAccounts: Set<string>` (emails selecionados), inicializado vazio (nenhuma pre-selecionada, AC #1)
  - [x] 2.2 Renderizar lista de checkboxes com cada account: `[checkbox] nome (email)` — usar `first_name last_name` como label, email como sublabel
  - [x] 2.3 Adicionar botao "Selecionar Todas" / "Limpar Selecao" como toggle acima da lista
  - [x] 2.4 Desabilitar botao "Ativar Campanha" enquanto `selectedAccounts.size === 0` — usuario DEVE selecionar ao menos 1 conta
  - [x] 2.5 Ao clicar "Ativar Campanha", enviar `approvedData: { activate: true, selectedAccounts: Array.from(selectedAccounts) }` no POST do approve
  - [x] 2.6 Ao clicar "Ativar Depois", enviar `approvedData: { activate: false, deferred: true, selectedAccounts: Array.from(selectedAccounts) }` — manter selecao para quando ativar manualmente

- [x] Task 3: API route approve — merge selectedAccounts (AC: #2)
  - [x] 3.1 Em `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts`, adicionar handler para `approvedData.selectedAccounts`:
    ```
    if (approvedData.selectedAccounts) {
      updatedOutput = { ...updatedOutput, selectedAccounts: approvedData.selectedAccounts };
    }
    ```
  - [x] 3.2 Segue o mesmo padrao de `approvedData.leads` (story 17.5) e `approvedData.emailBlocks` (story 17.6)

- [x] Task 4: ExportStep usa selectedAccounts do previousStepOutput (AC: #2, #3)
  - [x] 4.1 No `ExportStep.executeInternal()`, APOS buscar accounts via `listAccounts()`, verificar se `input.previousStepOutput?.selectedAccounts` existe (vem do merge do approve)
  - [x] 4.2 **ATENCAO**: O ExportStep e o PROPRIO step que gera o approval gate. O `selectedAccounts` vem do approve do PROPRIO step, nao do step anterior. Verificar como o BaseStep/orchestrator passa o approvedData de volta ao step apos aprovacao
  - [x] 4.3 **Investigar o fluxo**: Quando o step salva `awaiting_approval` e o usuario aprova, o orchestrator RE-EXECUTA o step? Ou o approve apenas marca como `approved` e o orchestrator segue para o proximo step? Se o approve apenas marca como approved e segue, entao o `selectedAccounts` precisa ser passado como `previousStepOutput` para o ActivateStep, nao para o ExportStep
  - [x] 4.4 **FLUXO CORRETO (baseado na analise do codigo)**: O ExportStep executa, cria a campanha com TODOS os accounts, salva `awaiting_approval`, e o approval gate aparece. O usuario aprova e o ActivateStep roda em seguida. Ou seja: o ExportStep JA EXECUTOU quando o approval gate aparece. A selecao de contas precisa ser aplicada DURANTE a execucao do ExportStep, ANTES de criar a campanha
  - [x] 4.5 **SOLUCAO IMPLEMENTADA**: Em vez de reestruturar em 2 fases, usou-se a ALTERNATIVA MAIS SIMPLES dos Dev Notes: ExportStep cria campanha SEM accounts em guided mode, e o ActivateStep chama `addAccountsToCampaign()` com os selectedAccounts antes de ativar
  - [x] 4.6 ActivateStep verifica `previousStepOutput.selectedAccounts` — se existir e nao vazio, chama `addAccountsToCampaign()` antes de `activateCampaign()`
  - [x] 4.7 Em modo Autopilot (`input.mode === 'autopilot'`): executar tudo de uma vez com TODOS os accounts (comportamento atual, AC #3)

- [x] Task 5: Testes unitarios (AC: #1, #2, #3, #4)
  - [x] 5.1 Atualizar `__tests__/unit/lib/agent/steps/export-step.test.ts`:
    - Teste: guided mode cria campanha sem sendingAccounts (AC #1)
    - Teste: guided mode accountsAdded = 0
    - Teste: autopilot mode usa todas as contas (AC #3)
    - Teste: accounts incluidos no output para previewData
    - Teste: nenhuma conta disponivel → erro (AC #4)
  - [x] 5.2 Atualizar `__tests__/unit/components/agent/AgentActivationGate.test.tsx`:
    - Teste: renderiza lista de accounts com checkboxes
    - Teste: nenhuma conta selecionada → botao Ativar desabilitado
    - Teste: selecionar conta → habilita botao
    - Teste: "Selecionar Todas" / "Limpar" toggle
    - Teste: approve envia selectedAccounts no body
    - Teste: mostra contagem de contas selecionadas
  - [x] 5.3 Atualizar `__tests__/unit/app/api/agent/executions/steps/approve.test.ts`:
    - Teste: approvedData.selectedAccounts merge no output
  - [x] 5.4 Atualizar `__tests__/unit/lib/agent/steps/activate-step.test.ts`:
    - Teste: addAccountsToCampaign chamado com selectedAccounts antes de activateCampaign (AC #2)
    - Teste: addAccountsToCampaign NAO chamado quando selectedAccounts ausente (autopilot, AC #3)
    - Teste: addAccountsToCampaign NAO chamado quando selectedAccounts vazio

## Dev Notes

### Arquitetura Critica — Fluxo de Approval Gate no ExportStep

O fluxo atual do BaseStep e:

1. `run()` chama `executeInternal()` que faz TODO o trabalho (criar campanha, adicionar leads, etc.)
2. Em guided mode, `run()` chama `saveAwaitingApproval()` + `sendApprovalGateMessage()` APOS executeInternal retornar
3. O usuario aprova via POST `/approve` → status muda para `approved`
4. O orchestrator dispara o proximo step (ActivateStep)

**Problema**: Quando o approval gate aparece, a campanha JA FOI CRIADA no Instantly com TODOS os accounts. A selecao de contas precisa acontecer ANTES da criacao.

**Solucao proposta**: Dividir a execucao do ExportStep em 2 fases:

1. **Fase 1 (pre-approval)**: Buscar API key + accounts + converter sequences. Salvar tudo no output SEM criar a campanha. Retornar `success: true` com `phase: 'awaiting_account_selection'`.
2. O BaseStep salva `awaiting_approval` e envia o approval gate com os accounts.
3. O usuario seleciona as contas e aprova → approve route merge `selectedAccounts` no output.
4. **Fase 2**: O orchestrator precisa RE-CHAMAR o ExportStep (ou ter um mecanismo pos-approval). Alternativa: mover a criacao da campanha para o ActivateStep (mais invasivo).

**ALTERNATIVA MAIS SIMPLES**: Criar a campanha no Instantly SEM sending accounts, depois usar `addAccountsToCampaign()` APOS o approval. Verificar se a API do Instantly suporta criar campanha sem `email_list` e adicionar accounts depois. O metodo `addAccountsToCampaign()` ja existe no InstantlyService (linhas 238-268) mas estava marcado como deprecated. Se a API V2 suporta, esta e a solucao mais limpa:
- ExportStep cria campanha sem accounts + adiciona leads (fluxo atual sem accounts)
- Approval gate mostra accounts para selecao
- Apos approve, ActivateStep (ou novo sub-step) chama `addAccountsToCampaign()` com os selecionados

**DECISAO DO DEV**: Investigar qual abordagem funciona com a API V2 do Instantly antes de implementar.

### Padrao de Approval Data (Referencia)

O approve route ja trata 3 tipos de approvedData:
- `approvedData.leads` → salva como `approvedLeads` (story 17.5)
- `approvedData.emailBlocks` → merge direto (story 17.6)
- `approvedData.activate` + `approvedData.deferred` → `activationDeferred` (story 17.6)

Adicionar: `approvedData.selectedAccounts` → merge direto (story 17.9)

### Componentes Existentes a Reusar

| Componente | Local | Uso |
|---|---|---|
| `AgentActivationGate` | `src/components/agent/AgentActivationGate.tsx` | Estender com selecao de accounts |
| `ExportStep` | `src/lib/agent/steps/export-step.ts` | Modificar fluxo de accounts |
| `InstantlyService.listAccounts()` | `src/lib/services/instantly.ts:403-416` | Ja usado, nenhuma mudanca |
| `InstantlyService.addAccountsToCampaign()` | `src/lib/services/instantly.ts:238-268` | Potencialmente reusar (marcado deprecated) |
| `InstantlyService.createCampaign()` | `src/lib/services/instantly.ts:189-226` | Parametro `sendingAccounts` pode ser opcional |
| `InstantlyAccountItem` | `src/types/instantly.ts:163-167` | Interface: email, first_name, last_name |
| `Checkbox` | `src/components/ui/checkbox.tsx` | shadcn/ui — usar na lista de accounts |
| `triggerNextStep()` | `src/lib/agent/client-utils.ts` | Ja usado no AgentActivationGate |
| Approve API route | `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts` | Estender merge |

### Tailwind CSS v4

Projeto usa Tailwind v4 — usar `flex flex-col gap-*` em vez de `space-y-*` para wrappers.

### Linguagem

Toda UI em Portugues (BR). Sem acentos em nomes de variaveis/componentes.

### Project Structure Notes

- Testes em `__tests__/unit/` espelhando `src/`
- Mock factories em `__tests__/helpers/`
- Vitest com ESLint no-console rule
- Patterns de mock: `createChainBuilder` para Supabase, `vi.mock` para services

### References

- [Source: epics-agente-tdec.md#Story 17.9] — ACs e user story
- [Source: src/lib/agent/steps/export-step.ts] — ExportStep completo
- [Source: src/components/agent/AgentActivationGate.tsx] — Gate UI atual
- [Source: src/lib/agent/steps/base-step.ts:112-153] — saveAwaitingApproval + sendApprovalGateMessage
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts:110-138] — approve merge logic
- [Source: src/lib/services/instantly.ts:189-226] — createCampaign
- [Source: src/lib/services/instantly.ts:238-268] — addAccountsToCampaign (deprecated)
- [Source: src/lib/services/instantly.ts:403-416] — listAccounts
- [Source: src/types/instantly.ts:163-167] — InstantlyAccountItem
- [Source: src/types/agent.ts:246-255] — ExportStepOutput

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Investigacao do fluxo de approval: step NAO e re-executado apos approve. Approve marca como "approved" e dispara proximo step.
- Decisao: usar ALTERNATIVA MAIS SIMPLES dos Dev Notes — ExportStep cria campanha SEM accounts em guided mode, ActivateStep adiciona accounts selecionados via `addAccountsToCampaign()`.

### Completion Notes List
- Task 1: Adicionado campo `accounts` ao `ExportStepOutput` e `buildPreviewData()`. Em guided mode, campanha criada sem accounts (accountsAdded=0). Em autopilot, comportamento mantido.
- Task 2: UI completa com checkboxes, toggle "Selecionar Todas/Limpar", botoes desabilitados sem selecao, contagem de contas. Usa shadcn/ui Checkbox.
- Task 3: Merge de `selectedAccounts` no approve route seguindo padrao existente (17.5 leads, 17.6 emailBlocks).
- Task 4: ActivateStep chama `addAccountsToCampaign()` com selectedAccounts ANTES de `activateCampaign()`. Sem selectedAccounts (autopilot), comportamento inalterado.
- Task 5: 65 testes nos 4 arquivos relevantes. 5983 testes total passando, 0 regressoes.

### Code Review Fixes (Adversarial Review)
- **H1**: Adicionado `totalSteps: 5` ao `defaultProps` do AgentActivationGate.test.tsx (prop required ausente)
- **M1**: Corrigido mensagem de erro AC #4 para PT-BR conforme AC: "Nenhuma conta de envio encontrada no Instantly. Configure ao menos uma conta antes de exportar."
- **M2**: Happy path do export-step.test.ts agora usa `mode: "autopilot"` explicitamente
- **M3**: Removido mock `mockTextToEmailHtml` nao utilizado do export-step.test.ts
- **M4**: Adicionado teste para `accounts` vazio no AgentActivationGate (cenario nao coberto)
- **L1**: Unificado JSDoc duplicado no `buildPreviewData` do export-step.ts
- **L2**: Trocado assertion `last_name: undefined` por `expect.objectContaining` no export-step.test.ts
- **L3**: Atualizado assertions de erro AC #4 nos testes para refletir mensagem corrigida

### File List
- src/types/agent.ts (modified — adicionado `accounts` ao ExportStepOutput)
- src/lib/agent/steps/export-step.ts (modified — buildPreviewData inclui accounts, guided mode cria campanha sem accounts, mensagem erro AC#4 corrigida, JSDoc unificado)
- src/components/agent/AgentActivationGate.tsx (modified — UI selecao de contas com checkboxes)
- src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts (modified — merge selectedAccounts)
- src/lib/agent/steps/activate-step.ts (modified — addAccountsToCampaign com selectedAccounts)
- __tests__/unit/lib/agent/steps/export-step.test.ts (modified — 5 novos testes Story 17.9 + fixes CR: mock cleanup, mode explicito, assertions)
- __tests__/unit/components/agent/AgentActivationGate.test.tsx (modified — 6 novos testes + atualizacao dos existentes + fix totalSteps + teste accounts vazio)
- __tests__/unit/app/api/agent/executions/steps/approve.test.ts (modified — 1 novo teste selectedAccounts)
- __tests__/unit/lib/agent/steps/activate-step.test.ts (modified — 3 novos testes selectedAccounts)
