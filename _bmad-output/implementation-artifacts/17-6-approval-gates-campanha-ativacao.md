# Story 17.6: Approval Gates — Campanha & Ativacao

Status: done

## Story

As a usuario do Agente TDEC em modo Guiado,
I want revisar e editar a campanha criada antes de exportar, e confirmar a ativacao,
So that eu tenha controle total sobre o conteudo que sera enviado e quando sera ativado.

## Acceptance Criteria

1. **Given** o modo e Guiado e o CreateCampaignStep concluiu
   **When** o gate de campanha e exibido
   **Then** o AgentCampaignPreview renderiza o preview completo da campanha
   **And** exibe: nome da campanha, sequencia de emails (assunto + corpo de cada um), icebreakers por lead

2. **Given** o preview da campanha esta visivel
   **When** o usuario clica em um texto de email para editar
   **Then** o campo torna-se editavel inline (FR20)
   **And** as alteracoes sao salvas no output do step ao aprovar

3. **Given** o usuario editou textos e esta satisfeito
   **When** clica em "Aprovar" no gate de campanha
   **Then** a campanha atualizada (com edicoes) e passada para o ExportStep
   **And** o status do step muda para 'approved'

4. **Given** o ExportStep concluiu em modo Guiado
   **When** o gate de ativacao e exibido
   **Then** o agente apresenta resumo final: "[N] leads, [M] emails na sequencia, [K] sending accounts"
   **And** pergunta: "Quer ativar a campanha agora?"

5. **Given** o usuario confirma a ativacao
   **When** clica em "Ativar" no gate final
   **Then** o ActivateStep e executado
   **And** a campanha e ativada no Instantly

6. **Given** o usuario nao quer ativar agora
   **When** recusa no gate de ativacao
   **Then** a campanha permanece exportada mas nao ativa no Instantly
   **And** a execucao e marcada como 'completed' com nota de que a ativacao foi adiada

## Tasks / Subtasks

- [x] Task 1: Componente AgentCampaignPreview (AC: #1, #2, #3)
  - [x] 1.1 Criar `src/components/agent/AgentCampaignPreview.tsx`
  - [x] 1.2 Props: `data` (CreateCampaignOutput), `executionId`, `stepNumber`, `onAction?`
  - [x] 1.3 Renderizar nome da campanha no CardHeader com icone Megaphone
  - [x] 1.4 Renderizar sequencia de emails — para cada emailBlock: assunto + corpo em cards aninhados
  - [x] 1.5 Implementar edicao inline: click no texto do subject ou body torna campo editavel (textarea/input)
  - [x] 1.6 Manter estado local das edicoes via `useState` com spread do array original de emailBlocks
  - [x] 1.7 Renderizar secao de icebreakers por lead: tabela com nome, empresa, icebreaker (colapsavel se >10 leads)
  - [x] 1.8 Botoes "Aprovar" e "Rejeitar" com loading state (mesmo padrao AgentApprovalGate)
  - [x] 1.9 Ao aprovar: POST `/api/agent/executions/{executionId}/steps/{stepNumber}/approve` com `approvedData: { emailBlocks: editedEmailBlocks }` no body
  - [x] 1.10 Ao rejeitar: POST `/api/agent/executions/{executionId}/steps/{stepNumber}/reject`
  - [x] 1.11 Estado `actionTaken` desabilita botoes apos acao (mesmo padrao AgentApprovalGate)

- [x] Task 2: Componente AgentActivationGate (AC: #4, #5, #6)
  - [x] 2.1 Criar `src/components/agent/AgentActivationGate.tsx`
  - [x] 2.2 Props: `data` (ExportStepOutput), `executionId`, `stepNumber`, `onAction?`
  - [x] 2.3 Renderizar resumo final: Card com icone Rocket, "[N] leads, [M] emails na sequencia, [K] sending accounts"
  - [x] 2.4 Botao primario "Ativar Campanha" e botao outline "Ativar Depois"
  - [x] 2.5 Ao ativar: POST approve com `approvedData: { activate: true }`
  - [x] 2.6 Ao adiar: POST approve com `approvedData: { activate: false, deferred: true }`
  - [x] 2.7 Loading state e disable apos acao

- [x] Task 3: Atualizar API approve route para merge de approvedData (AC: #2, #3)
  - [x] 3.1 Na route `/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts`, ao receber `approvedData.emailBlocks`, fazer merge no output existente: `output.emailBlocks = approvedData.emailBlocks`
  - [x] 3.2 Ao receber `approvedData.activate === false`, marcar step como 'approved' mas salvar nota `{ activationDeferred: true }` no output
  - [x] 3.3 Manter retrocompatibilidade: se approvedData nao presente, comportamento identico ao 17-5

- [x] Task 4: Atualizar API approve route para completar execucao no ultimo step (AC: #6)
  - [x] 4.1 Apos aprovar o ultimo step (stepNumber === execution.total_steps): atualizar `agent_executions.status = 'completed'` e `completed_at`
  - [x] 4.2 Se `activationDeferred: true`, incluir nota no `result_summary` da execucao
  - [x] 4.3 Inserir mensagem final do agente com resumo (messageType: 'summary')

- [x] Task 5: Integrar no AgentMessageBubble (AC: #1, #4)
  - [x] 5.1 No `ApprovalGateRenderer`, adicionar case `"create_campaign"` → renderizar `AgentCampaignPreview`
  - [x] 5.2 Adicionar case `"export"` → renderizar `AgentActivationGate`

- [x] Task 6: CreateCampaignStep — override buildPreviewData (AC: #1)
  - [x] 6.1 No `CreateCampaignStep`, override `buildPreviewData()` para enviar dados completos (nome, emailBlocks, delayBlocks, leadsWithIcebreakers, icebreakerStats, structure)
  - [x] 6.2 Dados completos necessarios porque usuario precisa editar textos dos emails

- [x] Task 7: ExportStep — override buildPreviewData (AC: #4)
  - [x] 7.1 No `ExportStep`, override `buildPreviewData()` para enviar resumo: `{ externalCampaignId, campaignName, leadsUploaded, accountsAdded, platform }`

- [x] Task 8: Orchestrator — aplicar edicoes do approvedData de campanha (AC: #3)
  - [x] 8.1 No `previousStepOutput` do orchestrator, se `approvedData.emailBlocks` existir, substituir `previousStepOutput.emailBlocks`
  - [x] 8.2 Isso garante que o ExportStep receba os emails editados pelo usuario

- [x] Task 9: Orchestrator — logica de activation deferred (AC: #5, #6)
  - [x] 9.1 Se o step `export` foi aprovado com `activationDeferred: true`, o orchestrator deve verificar antes de executar o `activate` step
  - [x] 9.2 Se ativacao adiada, skip o ActivateStep: marcar como 'skipped' e completar execucao
  - [x] 9.3 Se ativacao confirmada, executar normalmente

- [x] Task 10: Testes unitarios
  - [x] 10.1 `__tests__/unit/components/agent/AgentCampaignPreview.test.tsx` — 16 testes: renderiza nome, emails, icebreakers; edicao inline; approve envia emailBlocks editados; reject; disable apos acao; erro; colapsavel
  - [x] 10.2 `__tests__/unit/components/agent/AgentActivationGate.test.tsx` — 9 testes: renderiza resumo; ativar envia activate:true; adiar envia activate:false; disable apos acao; erro
  - [x] 10.3 `__tests__/unit/app/api/agent/executions/steps/approve.test.ts` — 6 testes novos: merge emailBlocks, activation deferred, retrocompatibilidade, completion no ultimo step, result_summary
  - [x] 10.4 `__tests__/unit/lib/agent/orchestrator.test.ts` — 4 testes novos: activation deferred skip, step skipped + execution completed, summary message, normal execution
  - [x] 10.5 `__tests__/unit/lib/agent/steps/create-campaign-preview.test.ts` — 2 testes: buildPreviewData retorna dados completos + structure
  - [x] 10.6 `__tests__/unit/lib/agent/steps/export-preview.test.ts` — 2 testes: buildPreviewData retorna resumo, exclui duplicatedLeads/invalidEmails

## Dev Notes

### Error Handling Convention

Segue `_bmad-output/implementation-artifacts/epic-17-error-handling-convention.md` — 4 camadas (Service → Step → Orchestrator → API Route). Todo erro deve ser visivel, classificado e acionavel.

### Architectural Decision: Edicao Inline no Gate de Campanha

A edicao inline acontece **no frontend** (AgentCampaignPreview). O componente mantem estado local das edicoes e ao aprovar, envia os `emailBlocks` editados no body do POST approve. A API route faz merge no `output` do step. O ExportStep subsequente recebe os emails editados via `previousStepOutput`.

Fluxo:
```
CreateCampaignStep conclui → awaiting_approval (output salvo com emailBlocks originais)
                                    ↓
Frontend: AgentCampaignPreview exibe emails editaveis
                                    ↓
Usuario edita subjects/bodies → estado local atualizado
                                    ↓
POST approve { approvedData: { emailBlocks: [...editados] } }
                                    ↓
API route: output.emailBlocks = approvedData.emailBlocks → status: approved
                                    ↓
Orchestrator previousStepOutput: usa emailBlocks atualizados → ExportStep
```

### Architectural Decision: Activation Deferred

O gate de ativacao NÃO usa reject para adiar. Usa approve com `{ activate: false, deferred: true }`. Motivo:
- Reject implica que algo esta errado e precisa ser corrigido
- Adiar ativacao e uma decisao valida — campanha ja esta exportada no Instantly
- O backend precisa distinguir "usuario quer corrigir algo" (reject) de "esta tudo certo mas ativa depois" (approve deferred)

Quando `activationDeferred: true`:
- Step export marcado como 'approved'
- ActivateStep marcado como 'skipped' (nao executado)
- Execucao marcada como 'completed' com `result_summary.activationDeferred = true`
- Mensagem final: "Campanha '[nome]' exportada no Instantly. Ativacao adiada — ative manualmente quando desejar."

### Frontend Pattern: Edicao Inline

```typescript
// Estado local para edicoes
const [editedBlocks, setEditedBlocks] = useState(data.emailBlocks);
const [editingIndex, setEditingIndex] = useState<number | null>(null);

// Click no texto → abre textarea
// Blur ou Enter → fecha textarea e salva no estado local
// Approve → envia editedBlocks no approvedData
```

Usar `<textarea>` para body (multi-line) e `<input>` para subject (single-line). Estilo: borda dashed quando editavel, solid quando editando.

### Guided Mode Flow (Campanha)

```
CreateCampaignStep.run() → executeInternal() → saveAwaitingApproval(output) → sendApprovalGateMessage(previewData)
                                    ↓
              step status: awaiting_approval (output com campanha completa)
                                    ↓
              Frontend: AgentCampaignPreview com emails editaveis + icebreakers
                                    ↓
              Usuario edita textos → Aprovar com emailBlocks editados
                                    ↓
              API approve → merge emailBlocks no output → status: approved
                                    ↓
              Frontend triggers ExportStep (executeStep(nextStep))
```

### Guided Mode Flow (Ativacao)

```
ExportStep.run() → executeInternal() → saveAwaitingApproval(output) → sendApprovalGateMessage(previewData)
                                    ↓
              step status: awaiting_approval (output com dados de export)
                                    ↓
              Frontend: AgentActivationGate com resumo + botoes Ativar/Adiar
                                    ↓
              Opcao A: Ativar → approve { activate: true } → ActivateStep executa
              Opcao B: Adiar → approve { activate: false, deferred: true } → ActivateStep skipped
```

### Preview Data Structure

Para campanha (create_campaign) — dados **completos** (usuario precisa editar):
```typescript
{
  campaignName: string;
  structure: { totalEmails: number; totalDays: number; items: CampaignStructureItem[] };
  emailBlocks: Array<{ position: number; subject: string; body: string; emailMode: string }>;
  delayBlocks: Array<{ position: number; delayDays: number }>;
  leadsWithIcebreakers: LeadWithIcebreaker[];
  icebreakerStats: { generated: number; failed: number; skipped: number };
  totalLeads: number;
}
```

Para export — dados de **resumo** (somente confirmacao):
```typescript
{
  externalCampaignId: string;
  campaignName: string;
  leadsUploaded: number;
  accountsAdded: number;
  platform: 'instantly';
}
```

### API Routes — Atualizacoes no approve/route.ts

A rota approve ja existe (story 17-5). Atualizacoes necessarias:

1. **Merge de emailBlocks**: Se `approvedData.emailBlocks` presente, atualizar `output.emailBlocks` antes de salvar
2. **Activation deferred**: Se `approvedData.activate === false && approvedData.deferred`, salvar `output.activationDeferred = true`
3. **Completion no ultimo step**: Ao aprovar step com `step_number === execution.total_steps`, marcar `agent_executions.status = 'completed'` e `completed_at`. Isso resolve o cenario de guided mode onde o orchestrator nao marca completion (story 17.4 comment no orchestrator)
4. **Mensagem de resumo**: Ao completar execucao, inserir mensagem com `messageType: 'summary'`

### Orchestrator — Atualizacoes

1. **emailBlocks merge no previousStepOutput**: Se `previousStepOutput.emailBlocks` e `previousStepOutput.approvedEmailBlocks` existirem, substituir. NOTA: nao usar `approvedEmailBlocks` — os emailBlocks ja foram atualizados na rota approve (merge direto no output). O orchestrator nao precisa de logica extra aqui.
2. **activationDeferred**: Antes de executar step activate, verificar se output do step anterior tem `activationDeferred: true`. Se sim, skip.

### Code Patterns (herdados da Story 17-5)

- **API Routes:** `getCurrentUserProfile` auth, UUID regex validation, stepNumber parseInt + isNaN, tenant match check, standardized error format
- **React Components:** `"use client"`, typed Props interface, loading state via useState, fetch com response.ok check, disable botoes apos acao, todo texto em Portugues (BR)
- **Tests (Vitest):** centralized mock factories, `createChainBuilder` para Supabase chains, `@testing-library/react` para component tests, cover happy path + error states + edge cases, no `console.log`
- **shadcn/ui:** Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Textarea (todos de `@/components/ui/*`)

### Code Review Checklist (Epic 17)

- [ ] Todos os fetch calls checam `response.ok`
- [ ] Todos os handlers/callbacks tem try/catch
- [ ] Todos os catch blocks propagam ou exibem erro (nunca engolir)
- [ ] Edicao inline tem fallback visual claro (borda dashed/solid)
- [ ] Approve com emailBlocks preserva campos nao-editados (merge, nao replace total)
- [ ] ActivateStep skip quando deferred funciona corretamente
- [ ] Completion da execucao funciona no approve do ultimo step
- [ ] Nao usa `console.log` (usa logStep)
- [ ] Nao usa non-null assertions (`!`)
- [ ] Testes cobrem: happy path + error states + edge cases + inline editing

### Project Structure Notes

**Novos arquivos a criar:**
- `src/components/agent/AgentCampaignPreview.tsx`
- `src/components/agent/AgentActivationGate.tsx`
- `__tests__/unit/components/agent/AgentCampaignPreview.test.tsx`
- `__tests__/unit/components/agent/AgentActivationGate.test.tsx`
- `__tests__/unit/lib/agent/steps/create-campaign-preview.test.ts`
- `__tests__/unit/lib/agent/steps/export-preview.test.ts`

**Arquivos a modificar:**
- `src/components/agent/AgentMessageBubble.tsx` — adicionar cases no ApprovalGateRenderer
- `src/lib/agent/steps/create-campaign-step.ts` — override buildPreviewData()
- `src/lib/agent/steps/export-step.ts` — override buildPreviewData()
- `src/lib/agent/orchestrator.ts` — logica activationDeferred + completion em guided
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts` — merge emailBlocks, activation deferred, completion
- `__tests__/unit/app/api/agent/executions/steps/approve.test.ts` — novos testes
- `__tests__/unit/lib/agent/orchestrator.test.ts` — novos testes

**Naming conventions (seguir stories 17.1-17.5):**
- Componente: AgentCampaignPreview, AgentActivationGate (PascalCase + Agent prefix)
- Arquivo: AgentCampaignPreview.tsx, AgentActivationGate.tsx (PascalCase)
- Test: AgentCampaignPreview.test.tsx, AgentActivationGate.test.tsx (PascalCase para componentes)

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md — Epic 17, Story 17.6]
- [Source: _bmad-output/implementation-artifacts/17-5-approval-gates-empresas-leads.md — Padrao de approval gate]
- [Source: _bmad-output/implementation-artifacts/epic-17-error-handling-convention.md — Error handling]
- [Source: _bmad-output/planning-artifacts/architecture.md — Agent pipeline architecture]
- [Source: src/types/agent.ts — CreateCampaignOutput, ExportStepOutput, StepType, AgentMessageMetadata]
- [Source: src/lib/agent/steps/base-step.ts — buildPreviewData(), saveAwaitingApproval(), sendApprovalGateMessage()]
- [Source: src/lib/agent/orchestrator.ts — executeStep(), previousStepOutput logic, completion logic]
- [Source: src/components/agent/AgentApprovalGate.tsx — Padrao visual de approval gate]
- [Source: src/components/agent/AgentLeadReview.tsx — Padrao visual com tabela e selecao]
- [Source: src/components/agent/AgentMessageBubble.tsx — ApprovalGateRenderer switch]
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts — API approve route existente]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — implementacao limpa sem erros de debug.

### Completion Notes List

- **Task 1-2:** Criados componentes AgentCampaignPreview e AgentActivationGate seguindo padrao visual do AgentApprovalGate. Preview de campanha com edicao inline (click-to-edit subject/body), icebreakers colapsiveis (>10 leads). Gate de ativacao com opcao ativar/adiar.
- **Task 3-4:** Rota approve atualizada: merge de emailBlocks editados, flag activationDeferred, completion automatica no ultimo step com result_summary e mensagem de resumo.
- **Task 5:** ApprovalGateRenderer no AgentMessageBubble agora despacha `create_campaign` → AgentCampaignPreview e `export` → AgentActivationGate.
- **Task 6-7:** buildPreviewData() overrides no CreateCampaignStep (dados completos para edicao) e ExportStep (resumo para confirmacao).
- **Task 8:** emailBlocks merge tratado na rota approve (merge direto no output), orchestrator nao precisa logica extra — emailBlocks ja atualizados quando ExportStep le previousStepOutput.
- **Task 9:** Orchestrator verifica activationDeferred antes de executar ActivateStep — skip com status 'skipped', completa execucao, envia mensagem de resumo.
- **Task 10:** 39 novos testes (16 + 9 + 6 + 4 + 2 + 2). Suite completa: 347 files, 5910 tests, 0 failures.

### Change Log

- 2026-03-26: Story 17.6 implementada — approval gates para campanha (edicao inline) e ativacao (ativar/adiar). 39 novos testes, 0 regressoes.
- 2026-03-26: Code Review (Amelia) — 6 issues corrigidos (3M + 3L): M1 AC#4 faltava totalEmails no gate de ativacao; M2 error handling no completion da execucao (approve route); M3 error handling no skip do activate (orchestrator); L1 removido delayBlocks morto do buildPreviewData; L2 resultSummary enriquecido com campaignName; L3 prevenida mensagem de summary duplicada no approve de activate step. 347 files, 5910 tests, 0 failures.

### File List

**Novos arquivos:**
- src/components/agent/AgentCampaignPreview.tsx
- src/components/agent/AgentActivationGate.tsx
- __tests__/unit/components/agent/AgentCampaignPreview.test.tsx
- __tests__/unit/components/agent/AgentActivationGate.test.tsx
- __tests__/unit/lib/agent/steps/create-campaign-preview.test.ts
- __tests__/unit/lib/agent/steps/export-preview.test.ts

**Arquivos modificados:**
- src/components/agent/AgentMessageBubble.tsx
- src/lib/agent/steps/create-campaign-step.ts
- src/lib/agent/steps/export-step.ts
- src/lib/agent/orchestrator.ts
- src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts
- src/types/agent.ts (adicionado totalEmails no ExportStepOutput)
- __tests__/unit/app/api/agent/executions/steps/approve.test.ts
- __tests__/unit/lib/agent/orchestrator.test.ts
- __tests__/unit/components/agent/AgentActivationGate.test.tsx
- __tests__/unit/lib/agent/steps/export-preview.test.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
