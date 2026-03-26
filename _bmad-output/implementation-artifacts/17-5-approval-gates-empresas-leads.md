# Story 17.5: Approval Gates - Empresas & Leads

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario do Agente TDEC em modo Guiado,
I want revisar as empresas encontradas e os leads antes de prosseguir,
So that eu tenha controle sobre quais empresas e contatos entram na minha campanha.

## Acceptance Criteria

1. **Given** o modo e Guiado e o SearchCompaniesStep concluiu
   **When** o status do step muda para 'awaiting_approval'
   **Then** o AgentApprovalGate renderiza um card interativo com a lista de empresas encontradas
   **And** exibe total de empresas e amostra das maiores
   **And** botoes "Aprovar" e "Rejeitar" estao visiveis

2. **Given** o usuario clica em "Aprovar" no gate de empresas
   **When** a API POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve e chamada
   **Then** o status do step muda para 'approved'
   **And** o pipeline avanca para o proximo step automaticamente

3. **Given** o SearchLeadsStep concluiu em modo Guiado
   **When** o gate de leads e exibido
   **Then** o AgentLeadReview renderiza uma tabela com todos os leads encontrados (nome, cargo, empresa, email)
   **And** cada lead tem checkbox para selecao/desselecao individual
   **And** exibe o total de leads e permite filtrar por empresa ou cargo

4. **Given** o usuario desmarca leads individuais na tabela de revisao
   **When** clica em "Aprovar" com leads filtrados
   **Then** apenas os leads aprovados sao passados para o proximo step
   **And** a contagem de leads aprovados e registrada no output do gate

5. **Given** o usuario clica em "Rejeitar" em qualquer gate
   **When** a API POST /api/agent/executions/[executionId]/steps/[stepNumber]/reject e chamada
   **Then** o agente pergunta o que o usuario gostaria de ajustar
   **And** o pipeline NAO avanca ate nova aprovacao

## Tasks / Subtasks

- [x] Task 1: Expandir BaseStep para suportar approval gates (AC: #1, #3)
  - [x] 1.1 Adicionar metodo `sendApprovalGateMessage(executionId, previewData)` ao BaseStep — insere mensagem com `messageType: 'approval_gate'` e `approvalData: { stepType, previewData }` em `agent_messages`
  - [x] 1.2 Adicionar metodo `saveAwaitingApproval(executionId, result)` ao BaseStep — salva output no step (para nao perder dados) e seta status `awaiting_approval` (similar ao saveCheckpoint mas sem marcar completed)
  - [x] 1.3 Modificar `run()` para aceitar `mode: ExecutionMode` no input — apos executeInternal() com sucesso, se mode === 'guided', chamar saveAwaitingApproval + sendApprovalGateMessage ao inves de saveCheckpoint. Se mode === 'autopilot', manter comportamento atual (saveCheckpoint com status completed)

- [x] Task 2: Expandir StepInput com mode (AC: #1, #3)
  - [x] 2.1 Adicionar campo `mode: ExecutionMode` ao `StepInput` em `src/types/agent.ts`
  - [x] 2.2 Atualizar orchestrator.executeStep para passar `execution.mode` no StepInput

- [x] Task 3: Criar API route de Approve (AC: #2, #4)
  - [x] 3.1 Criar `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts`
  - [x] 3.2 Auth + validacao de params (mesmo padrao da route execute)
  - [x] 3.3 Verificar que o step existe e status === 'awaiting_approval'
  - [x] 3.4 Aceitar body opcional: `{ approvedData?: Record<string, unknown> }` — para leads filtrados (AC #4)
  - [x] 3.5 Se `approvedData` presente, fazer merge com output existente do step: `output.approvedLeads = approvedData.leads`
  - [x] 3.6 Atualizar step status para 'approved', setar completed_at
  - [x] 3.7 Inserir mensagem de confirmacao no agent_messages: "Etapa '[label]' aprovada pelo usuario"
  - [x] 3.8 Retornar `{ data: { stepNumber, status: 'approved', nextStep: stepNumber + 1 } }`

- [x] Task 4: Criar API route de Reject (AC: #5)
  - [x] 4.1 Criar `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts`
  - [x] 4.2 Auth + validacao de params (mesmo padrao)
  - [x] 4.3 Verificar que o step existe e status === 'awaiting_approval'
  - [x] 4.4 Aceitar body opcional: `{ reason?: string }`
  - [x] 4.5 Manter step status como 'awaiting_approval' (NAO avanca)
  - [x] 4.6 Inserir mensagem do agente: "Entendido. O que voce gostaria de ajustar na etapa '[label]'?"
  - [x] 4.7 Retornar `{ data: { stepNumber, status: 'awaiting_approval', message: 'Aguardando ajustes' } }`

- [x] Task 5: Atualizar orchestrator — previousStepOutput com approval (AC: #2, #4)
  - [x] 5.1 No orchestrator.executeStep, alterar a query de previousStepOutput para aceitar step com status `completed` OU `approved` (atualmente so aceita `completed`)
  - [x] 5.2 Quando step anterior tem status `approved` e `output.approvedLeads` existe, usar approvedLeads como o set de leads no previousStepOutput (para AC #4 — leads filtrados pelo usuario)

- [x] Task 6: Componente AgentApprovalGate para empresas (AC: #1)
  - [x] 6.1 Criar `src/components/agent/AgentApprovalGate.tsx`
  - [x] 6.2 Renderizar card com: icone ShieldCheck, titulo "Revisao: Busca de Empresas", total de empresas encontradas
  - [x] 6.3 Exibir lista resumida das empresas (top 5-10): nome, pais, industria, employee_count_range
  - [x] 6.4 Se mais de 10 empresas, mostrar "+N mais empresas"
  - [x] 6.5 Botoes "Aprovar" (primary) e "Rejeitar" (outline destructive)
  - [x] 6.6 Ao clicar Aprovar: POST /api/agent/executions/{executionId}/steps/{stepNumber}/approve
  - [x] 6.7 Ao clicar Rejeitar: POST /api/agent/executions/{executionId}/steps/{stepNumber}/reject
  - [x] 6.8 Loading state nos botoes durante a chamada API
  - [x] 6.9 Desabilitar botoes apos acao (impedir double-click)

- [x] Task 7: Componente AgentLeadReview para leads (AC: #3, #4)
  - [x] 7.1 Criar `src/components/agent/AgentLeadReview.tsx`
  - [x] 7.2 Renderizar tabela com colunas: checkbox, nome, cargo, empresa, email
  - [x] 7.3 Todos os leads iniciam selecionados (checked)
  - [x] 7.4 Header da tabela com checkbox "Selecionar todos" / "Desselecionar todos"
  - [x] 7.5 Exibir contador: "X de Y leads selecionados"
  - [x] 7.6 Input de filtro (texto livre) que filtra por nome, empresa ou cargo
  - [x] 7.7 Botoes "Aprovar (X leads)" (primary) e "Rejeitar" (outline destructive)
  - [x] 7.8 Ao clicar Aprovar: POST approve com `approvedData: { leads: selectedLeads }`
  - [x] 7.9 Ao clicar Rejeitar: POST reject
  - [x] 7.10 Loading + disable apos acao

- [x] Task 8: Integrar componentes no AgentMessageBubble (AC: #1, #3)
  - [x] 8.1 No AgentMessageBubble, quando `messageType === 'approval_gate'` e `approvalData` presente, renderizar o componente correto baseado no `approvalData.stepType`
  - [x] 8.2 Se `stepType === 'search_companies'` → renderizar `<AgentApprovalGate>`
  - [x] 8.3 Se `stepType === 'search_leads'` → renderizar `<AgentLeadReview>`
  - [x] 8.4 Passar `executionId` e `stepNumber` do metadata para os componentes
  - [x] 8.5 Apos aprovacao/rejeicao, desabilitar os botoes (estado visual de "ja aprovado" ou "rejeitado")

- [x] Task 9: Testes unitarios (AC: todos)
  - [x] 9.1 BaseStep: modo guided → status awaiting_approval + mensagem approval_gate inserida
  - [x] 9.2 BaseStep: modo autopilot → status completed (comportamento inalterado)
  - [x] 9.3 BaseStep: sendApprovalGateMessage insere com metadata correta (stepType, previewData)
  - [x] 9.4 API approve: happy path → step approved + mensagem inserida + retorna nextStep
  - [x] 9.5 API approve: step nao esta awaiting_approval → 409 Conflict
  - [x] 9.6 API approve: step nao encontrado → 404
  - [x] 9.7 API approve: com approvedData (leads filtrados) → merge no output
  - [x] 9.8 API reject: happy path → mensagem inserida + status permanece awaiting_approval
  - [x] 9.9 API reject: step nao esta awaiting_approval → 409 Conflict
  - [x] 9.10 Orchestrator: previousStepOutput aceita step com status 'approved'
  - [x] 9.11 Orchestrator: previousStepOutput com approvedLeads usa leads filtrados
  - [x] 9.12 Orchestrator: passa mode no StepInput
  - [x] 9.13 AgentApprovalGate: renderiza empresas, total, botoes
  - [x] 9.14 AgentApprovalGate: clique Aprovar chama API
  - [x] 9.15 AgentApprovalGate: clique Rejeitar chama API
  - [x] 9.16 AgentLeadReview: renderiza tabela com leads, checkboxes
  - [x] 9.17 AgentLeadReview: filtro funciona por nome/empresa/cargo
  - [x] 9.18 AgentLeadReview: desmarcar leads atualiza contador
  - [x] 9.19 AgentLeadReview: aprovar com leads filtrados envia approvedData

## Dev Notes

### Convencao de Error Handling (OBRIGATORIA)

Documento completo: `_bmad-output/implementation-artifacts/epic-17-error-handling-convention.md`

Seguir EXATAMENTE o mesmo padrao das Stories 17.1-17.4. Resumo:

- **Camada 1 (BaseStep):** JA EXISTE. Modificar run() para suportar modo guided.
- **Camada 2 (Orchestrator):** JA EXISTE. Atualizar previousStepOutput para aceitar status 'approved'.
- **Camada 3 (API Routes):** NOVAS routes approve/reject — seguir padrao exato da route execute.
- **Padroes PROIBIDOS:** fetch sem response.ok, catch vazio, non-null assertions (!), erro generico sem contexto.

### Decisao Arquitetural: Approval Gate no BaseStep (NAO no Orchestrator)

A logica de approval gate fica no BaseStep.run() porque:
1. O step ja tem acesso ao resultado (output) para incluir como previewData
2. O saveCheckpoint/saveAwaitingApproval e responsabilidade do step
3. O orchestrator nao precisa saber dos detalhes internos do step — so recebe o resultado
4. Manter single responsibility: step gerencia seu lifecycle, orchestrator gerencia o pipeline

**Fluxo modo Guiado:**
```
run() → executeInternal() → saveAwaitingApproval(output) → sendApprovalGateMessage(previewData)
                                    ↓
              step status: awaiting_approval (output salvo, mas nao completed)
                                    ↓
              Frontend exibe card com previewData
                                    ↓
              Usuario clica Aprovar → API approve → status: approved
                                    ↓
              Frontend dispara proximo step (executeStep(nextStep))
```

**Fluxo modo Autopilot (inalterado):**
```
run() → executeInternal() → saveCheckpoint(output) → logStep()
                                    ↓
              step status: completed (normal)
```

### Decisao Arquitetural: previewData Minimo (NAO enviar dados completos)

O previewData enviado na mensagem de approval_gate deve ser um RESUMO, nao os dados completos:

**Para empresas (search_companies):**
```typescript
previewData: {
  totalFound: number;
  companies: Array<{  // Top 10 apenas
    name: string;
    country: string;
    industry: string;
    employeeRange: string;
  }>;
  filtersApplied: Record<string, unknown>;
}
```

**Para leads (search_leads):**
```typescript
previewData: {
  totalFound: number;
  leads: Array<{  // TODOS os leads (necessario para selecao individual)
    name: string;
    title: string | null;
    companyName: string | null;
    email: string | null;
  }>;
  jobTitles: string[];
}
```

**Motivo:** A mensagem `agent_messages` e persistida no banco. Enviar TODOS os dados de empresas (que podem ter muitos campos) inflaria o banco desnecessariamente. Para empresas, o resumo basta para o gate. Para leads, precisamos de todos porque o usuario pode desmarcar individualmente.

### Decisao Arquitetural: Leads Filtrados via approvedData

Quando o usuario desmarca leads no AgentLeadReview, os leads APROVADOS sao enviados no body do POST approve:

```typescript
// POST /api/agent/executions/{executionId}/steps/{stepNumber}/approve
{
  approvedData: {
    leads: SearchLeadResult[]  // Somente os leads que o usuario manteve selecionados
  }
}
```

A route de approve faz merge com o output existente do step:
```typescript
const existingOutput = stepRecord.output;
const updatedOutput = {
  ...existingOutput,
  approvedLeads: body.approvedData.leads,  // Override dos leads originais
};
await supabase.from('agent_steps').update({ output: updatedOutput, status: 'approved', completed_at: ... });
```

O orchestrator, ao buscar previousStepOutput do search_leads para o create_campaign:
```typescript
// Se approvedLeads existe no output, usar esses ao inves dos leads originais
const leads = previousStepOutput.approvedLeads ?? previousStepOutput.leads;
```

**CRITICO:** O CreateCampaignStep (story 17.3) ja implementado le `previousStepOutput.leads` e `previousStepOutput.totalFound`. O campo `approvedLeads` e um override — se presente, o orchestrator deve substituir `leads` por `approvedLeads` e ajustar `totalFound` antes de passar para o step seguinte.

### Decisao Arquitetural: Reject NAO Muda Status

Rejeitar um gate NAO altera o status do step (`awaiting_approval`). O pipeline fica parado ate nova aprovacao. O usuario pode:
1. Conversar no chat sobre o que deseja ajustar
2. Re-executar o step com parametros diferentes (futuro — story 17.7)
3. Aprovar eventualmente

Na pratica, rejeicao nesta story e informativa — o usuario comunica insatisfacao e o agente responde. A re-execucao com parametros diferentes sera implementada na story 17.7 (Logica Guiado vs Autopilot).

### Decisao Arquitetural: Disparar Proximo Step apos Aprovacao

Apos o usuario aprovar, o FRONTEND e responsavel por disparar o proximo step via POST execute. O fluxo:

1. Frontend chama POST approve → recebe `{ nextStep: N+1 }`
2. Frontend chama POST execute com stepNumber = N+1
3. Ciclo se repete: step executa → awaiting_approval → usuario aprova → proximo step

**NAO** implementar auto-advance no backend. Manter o frontend no controle para:
- Evitar long-running requests (cada step pode demorar 30s+)
- Permitir o usuario tomar seu tempo entre aprovacoes
- Manter o padrao ja estabelecido (frontend dispara cada step)

### Mudanca no BaseStep.run() — Estrategia de Implementacao

A mudanca no `run()` e MINIMA. Nao quebrar o fluxo existente:

```typescript
async run(input: StepInput): Promise<StepOutput> {
  await this.updateStepStatus(db, input.executionId, "running");

  try {
    const result = await this.executeInternal(input);

    // NOVO: Modo guiado → awaiting_approval ao inves de completed
    if (input.mode === 'guided') {
      await this.saveAwaitingApproval(db, input.executionId, result);
      await this.sendApprovalGateMessage(db, input.executionId, result);
    } else {
      await this.saveCheckpoint(db, input.executionId, result);
    }

    await this.logStep(db, input.executionId, input, result);
    return result;
  } catch (error) {
    const pipelineError = this.toPipelineError(error);
    await this.saveFailure(db, input.executionId, pipelineError);
    throw pipelineError;
  }
}
```

**saveAwaitingApproval:** Identico ao saveCheckpoint, mas com `status: 'awaiting_approval'` ao inves de `completed`:
```typescript
private async saveAwaitingApproval(db, executionId, result): Promise<void> {
  await db.from("agent_steps").update({
    output: result.data,
    status: "awaiting_approval" as StepStatus,
    cost: result.cost ?? null,
    // NAO setar completed_at — step ainda nao foi aprovado
  }).eq("execution_id", executionId).eq("step_number", this.stepNumber);
}
```

**sendApprovalGateMessage:** Extrai previewData do result e insere mensagem:
```typescript
private async sendApprovalGateMessage(db, executionId, result): Promise<void> {
  const previewData = this.buildPreviewData(result);
  const stepLabel = STEP_LABELS[this.stepType];

  await db.from("agent_messages").insert({
    execution_id: executionId,
    role: "agent",
    content: `Etapa "${stepLabel}" concluida. Revise os resultados e aprove para continuar.`,
    metadata: {
      stepNumber: this.stepNumber,
      messageType: "approval_gate",
      approvalData: {
        stepType: this.stepType,
        previewData,
      },
    },
  });
}
```

**buildPreviewData:** Metodo protegido que cada step pode sobrescrever para customizar o preview. Default retorna `result.data` completo. Steps podem sobrescrever para enviar apenas o resumo:

```typescript
protected buildPreviewData(result: StepOutput): unknown {
  return result.data;  // Default: dados completos
}
```

### Padrao API Routes Approve/Reject

Seguir EXATAMENTE o padrao da route execute (`src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts`):

```typescript
// POST /api/agent/executions/[executionId]/steps/[stepNumber]/approve
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string; stepNumber: string }> }
) {
  // 1. Auth (getCurrentUserProfile)
  // 2. Validate params (UUID regex + stepNumber positivo)
  // 3. Verify execution exists + tenant match
  // 4. Fetch step record
  // 5. Verify step.status === 'awaiting_approval' (senao 409 Conflict)
  // 6. Parse body (approvedData opcional)
  // 7. Update step: status='approved', completed_at, merge approvedData no output
  // 8. Insert mensagem de aprovacao
  // 9. Return { data: { stepNumber, status: 'approved', nextStep } }
}
```

**CRITICO:** NAO buscar API key do TheirStack (a route execute faz isso, approve/reject nao executam steps).

### Componentes UI — Padrao Visual

Ambos componentes seguem o design system existente (shadcn/ui + Tailwind CSS v4):

**CRITICO Tailwind v4:** Usar `flex flex-col gap-*` ao inves de `space-y-*` para wrappers. Referencia: MEMORY.md do projeto.

**AgentApprovalGate (empresas):**
```tsx
<Card className="border-primary/20">
  <CardHeader>
    <div className="flex items-center gap-2">
      <ShieldCheck className="h-5 w-5 text-primary" />
      <CardTitle className="text-base">Revisao: Busca de Empresas</CardTitle>
    </div>
    <CardDescription>{totalFound} empresas encontradas</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Lista resumida de empresas */}
    {/* Botoes Aprovar/Rejeitar */}
  </CardContent>
</Card>
```

**AgentLeadReview (leads):**
```tsx
<Card className="border-primary/20">
  <CardHeader>
    <CardTitle>Revisao: Leads Encontrados</CardTitle>
    <CardDescription>{selectedCount} de {totalCount} leads selecionados</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Input de filtro */}
    {/* Tabela com checkboxes */}
    {/* Botoes Aprovar/Rejeitar */}
  </CardContent>
</Card>
```

**Componentes shadcn/ui a usar:**
- Card, CardHeader, CardTitle, CardDescription, CardContent (ja existem)
- Button (ja existe)
- Checkbox (ja existe)
- Input (ja existe)
- Table, TableHeader, TableRow, TableHead, TableBody, TableCell (ja existem)

### Integracao no AgentMessageBubble

Atualmente o AgentMessageBubble renderiza `approval_gate` apenas como texto com icone. A mudanca:

```tsx
// Em AgentMessageBubble.tsx
{messageType === "approval_gate" && message.metadata?.approvalData && (
  <ApprovalGateRenderer
    approvalData={message.metadata.approvalData}
    executionId={message.execution_id}
    stepNumber={message.metadata.stepNumber!}
  />
)}
```

**ApprovalGateRenderer** e um switch interno que despacha para o componente correto:
```tsx
function ApprovalGateRenderer({ approvalData, executionId, stepNumber }) {
  switch (approvalData.stepType) {
    case 'search_companies':
      return <AgentApprovalGate data={approvalData.previewData} executionId={executionId} stepNumber={stepNumber} />;
    case 'search_leads':
      return <AgentLeadReview data={approvalData.previewData} executionId={executionId} stepNumber={stepNumber} />;
    default:
      return null;  // Gates de campanha/ativacao serao story 17.6
  }
}
```

### Servicos/Funcoes a REUTILIZAR (NAO RECRIAR)

| Servico/Funcao | Arquivo | Uso nesta story |
|----------------|---------|----------------|
| BaseStep | `src/lib/agent/steps/base-step.ts` | MODIFICAR — adicionar approval gate lifecycle |
| DeterministicOrchestrator | `src/lib/agent/orchestrator.ts` | MODIFICAR — previousStepOutput aceita 'approved', passar mode |
| AgentMessageBubble | `src/components/agent/AgentMessageBubble.tsx` | MODIFICAR — renderizar componentes de approval gate |
| getCurrentUserProfile | `src/lib/supabase/tenant.ts` | REUTILIZAR — auth nas novas routes |
| createClient | `src/lib/supabase/server.ts` | REUTILIZAR — supabase nas novas routes |
| STEP_LABELS | `src/types/agent.ts` | REUTILIZAR — labels em portugues |
| Card, Button, Checkbox, Table, Input | `src/components/ui/*` | REUTILIZAR — UI components |

### Dados de Preview (de onde vem)

**SearchCompaniesStep output** (story 17.1):
```typescript
{
  companies: Array<{
    name: string;
    domain: string;
    country: string;
    industry: string;
    employee_count_range: string;
    // ... mais campos do TheirStack
  }>;
  totalFound: number;
  technologySlug: string;
  filtersApplied: Record<string, unknown>;
}
```

**SearchLeadsStep output** (story 17.2):
```typescript
{
  leads: Array<{
    name: string;
    title: string | null;
    companyName: string | null;
    email: string | null;
    linkedinUrl: string | null;
  }>;
  totalFound: number;
  jobTitles: string[];
  domainsSearched: string[];
}
```

### Orchestrator previousStepOutput — Mudanca Necessaria

Atualmente (linha 118 do orchestrator.ts):
```typescript
.eq("status", "completed")
```

Mudar para aceitar `completed` OU `approved`:
```typescript
.in("status", ["completed", "approved"])
```

E apos buscar, se `approvedLeads` existe no output, substituir `leads`:
```typescript
if (previousStepOutput?.approvedLeads) {
  previousStepOutput.leads = previousStepOutput.approvedLeads;
  previousStepOutput.totalFound = (previousStepOutput.approvedLeads as unknown[]).length;
}
```

### Padroes de Codigo (Stories 17.1-17.4 learnings)

**API Routes:**
- Auth via `getCurrentUserProfile()` — retornar 401 se null
- Validacao UUID via regex `/^[0-9a-f]{8}-...$/i`
- Validacao stepNumber: parseInt + isNaN check
- Verificar tenant match: `execution.tenant_id !== profile.tenant_id`
- Erro padronizado: `{ error: { code, message } }`

**Componentes React:**
- "use client" no topo
- Props tipadas com interface
- Loading state via useState
- Chamadas API via fetch com check de response.ok
- Desabilitar botoes apos acao
- Todos textos em Portugues (BR)

**Testes (Vitest):**
- Mock factories centralizadas
- createChainBuilder() para Supabase query chains
- Testes de componente com @testing-library/react
- Cobrir: happy path + estados de erro + edge cases
- ESLint: sem console.log

### Checklist de Code Review (Epic 17)

Toda story da Epic 17 deve passar:
- [ ] Todo `fetch` tem check de `response.ok`
- [ ] Todo handler/callback tem `try/catch`
- [ ] Todo `catch` propaga ou exibe o erro (nunca engole)
- [ ] Erros de service convertidos em PipelineError via toPipelineError()
- [ ] saveCheckpoint() chamado tanto no sucesso quanto na falha
- [ ] Mensagem de erro enviada ao chat via sendErrorMessage()
- [ ] isRetryable corretamente classificado
- [ ] externalService preenchido quando aplicavel
- [ ] Nenhum console.log de erro (usar logStep())
- [ ] Nenhuma non-null assertion (!)
- [ ] Testes cobrem: happy path + erro retryable + erro terminal + input invalido

### Project Structure Notes

**Novos arquivos a criar:**
```
src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts
src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts
src/components/agent/AgentApprovalGate.tsx
src/components/agent/AgentLeadReview.tsx
__tests__/unit/lib/agent/steps/base-step-approval.test.ts
__tests__/unit/app/api/agent/executions/steps/approve.test.ts
__tests__/unit/app/api/agent/executions/steps/reject.test.ts
__tests__/unit/components/agent/AgentApprovalGate.test.tsx
__tests__/unit/components/agent/AgentLeadReview.test.tsx
```

**Arquivos a modificar:**
```
src/types/agent.ts                             <- Adicionar mode ao StepInput
src/lib/agent/steps/base-step.ts               <- Approval gate lifecycle
src/lib/agent/orchestrator.ts                  <- previousStepOutput aceita 'approved', passar mode
src/components/agent/AgentMessageBubble.tsx     <- Renderizar approval gate components
__tests__/unit/lib/agent/orchestrator.test.ts  <- Novos testes approval flow
__tests__/unit/lib/agent/steps/base-step.test.ts <- Testes do novo comportamento guided
```

**Convencoes de naming (seguir stories 17.1-17.4):**
- Componente: `AgentApprovalGate`, `AgentLeadReview` (PascalCase + prefixo Agent)
- Arquivo componente: `AgentApprovalGate.tsx`, `AgentLeadReview.tsx` (PascalCase)
- API route: `approve/route.ts`, `reject/route.ts` (kebab-case folder + route.ts)
- Teste: `base-step-approval.test.ts`, `approve.test.ts` (kebab-case)

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Story 17.5]
- [Source: _bmad-output/implementation-artifacts/17-4-steps-de-export-ativacao.md]
- [Source: _bmad-output/implementation-artifacts/17-3-step-de-criacao-de-campanha.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-error-handling-convention.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-api-validation-spike-2026-03-26.md]
- [Source: src/types/agent.ts — StepInput, StepOutput, StepStatus, MessageType, AgentMessageMetadata, ExecutionMode]
- [Source: src/lib/agent/steps/base-step.ts — BaseStep.run(), saveCheckpoint, toPipelineError]
- [Source: src/lib/agent/orchestrator.ts — DeterministicOrchestrator.executeStep, previousStepOutput query]
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts — padrao API route]
- [Source: src/components/agent/AgentMessageBubble.tsx — renderizacao de messageType approval_gate]
- [Source: src/hooks/use-agent-execution.ts — Realtime subscriptions para step updates]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: BaseStep.run() modificado — modo guided chama saveAwaitingApproval + sendApprovalGateMessage; modo autopilot mantém saveCheckpoint. Método buildPreviewData protegido permite override por subclasses.
- Task 2: StepInput.mode adicionado como opcional (ExecutionMode). Orchestrator passa execution.mode no input.
- Task 3: API approve route — auth, validação, status check (409 se não awaiting_approval), merge approvedData.leads no output, status→approved.
- Task 4: API reject route — auth, validação, status check, insere mensagem do agente, status permanece awaiting_approval.
- Task 5: Orchestrator previousStepOutput aceita status 'completed' OU 'approved' via .in(). Quando approvedLeads existe, substitui leads e ajusta totalFound.
- Task 6: AgentApprovalGate — Card com ShieldCheck, lista resumida de empresas, "+N mais empresas", botões Aprovar/Rejeitar com loading + disable.
- Task 7: AgentLeadReview — Tabela com checkboxes, filtro texto livre, select all/deselect all, contador "X de Y", envia approvedData com leads selecionados.
- Task 8: AgentMessageBubble — ApprovalGateRenderer despacha para AgentApprovalGate ou AgentLeadReview baseado em stepType.
- Task 9: 62 testes (6 arquivos) — BaseStep approval (8), API approve (8), API reject (7), Orchestrator (20 total, 3 novos), AgentApprovalGate (8), AgentLeadReview (11). Suite completa: 5871 passed, 0 regressions.

### Change Log

- 2026-03-26: Story 17.5 implementação completa — approval gates para empresas e leads

### File List

**Novos:**
- src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts
- src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts
- src/components/agent/AgentApprovalGate.tsx
- src/components/agent/AgentLeadReview.tsx
- __tests__/unit/lib/agent/steps/base-step-approval.test.ts
- __tests__/unit/app/api/agent/executions/steps/approve.test.ts
- __tests__/unit/app/api/agent/executions/steps/reject.test.ts
- __tests__/unit/components/agent/AgentApprovalGate.test.tsx
- __tests__/unit/components/agent/AgentLeadReview.test.tsx

**Modificados:**
- src/types/agent.ts (mode adicionado ao StepInput)
- src/lib/agent/steps/base-step.ts (approval gate lifecycle)
- src/lib/agent/orchestrator.ts (previousStepOutput aceita approved, passa mode, approvedLeads override)
- src/components/agent/AgentMessageBubble.tsx (renderiza approval gate components)
- __tests__/unit/lib/agent/orchestrator.test.ts (3 novos testes: 9.10, 9.11, 9.12)
