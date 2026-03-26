# Story 17.4: Steps de Export & Ativacao

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario do Agente TDEC,
I want que o agente exporte a campanha para o Instantly e ative o envio,
So that minha campanha esteja no ar e enviando emails automaticamente.

## Acceptance Criteria

1. **Given** a campanha foi criada no step anterior
   **When** o ExportStep e executado
   **Then** chama o InstantlyService existente para exportar a campanha com os leads
   **And** o AgentStepProgress exibe "Etapa 4/5: Exportando campanha para o Instantly..."

2. **Given** o export para o Instantly
   **When** a campanha e criada no Instantly
   **Then** as sending accounts sao configuradas na campanha exportada (FR31)
   **And** o ID da campanha no Instantly e salvo no output do step

3. **Given** o export concluiu com sucesso
   **When** o ActivateStep e executado
   **Then** chama o InstantlyService para ativar a campanha pelo ID retornado no step anterior
   **And** o AgentStepProgress exibe "Etapa 5/5: Ativando campanha no Instantly..."

4. **Given** a ativacao concluiu com sucesso
   **When** o pipeline completa todas as etapas
   **Then** o status da execucao (agent_executions) muda para 'completed'
   **And** o agente envia mensagem confirmando: "Campanha '[nome]' ativa no Instantly com [N] leads"

## Tasks / Subtasks

- [x] Task 1: Expandir tipos em `src/types/agent.ts` (AC: #1, #2, #3, #4)
  - [x] 1.1 Adicionar novos AGENT_ERROR_CODES: `STEP_EXPORT_ERROR: 'Erro na exportacao da campanha'` e `STEP_ACTIVATE_ERROR: 'Erro na ativacao da campanha'`
  - [x] 1.2 Criar interface `ExportStepOutput` tipando output do ExportStep (externalCampaignId, campaignName, leadsUploaded, duplicatedLeads, invalidEmails, accountsAdded, platform)
  - [x] 1.3 Criar interface `ActivateStepOutput` tipando output do ActivateStep (externalCampaignId, campaignName, activated, activatedAt)

- [x] Task 2: Criar `ExportStep` em `src/lib/agent/steps/export-step.ts` (AC: #1, #2)
  - [x] 2.1 Extends BaseStep, constructor recebe `(stepNumber, supabase, tenantId: string)` — precisa de tenantId para buscar API key do Instantly
  - [x] 2.2 Implementa `executeInternal(input: StepInput): Promise<StepOutput>`
  - [x] 2.3 Extrair dados do `previousStepOutput`: `campaignName`, `emailBlocks`, `delayBlocks`, `leadsWithIcebreakers`, `totalLeads` — validar que existem e nao estao vazios
  - [x] 2.4 Enviar mensagem de progresso: `"Etapa ${stepNumber}/5: Exportando campanha para o Instantly..."`
  - [x] 2.5 **Sub-step A — Buscar API key do Instantly:** Query `api_configs` WHERE `tenant_id` AND `service_name = 'instantly'`. Decrypt via `decryptApiKey()`. Se nao encontrar, throw Error terminal (isRetryable=false)
  - [x] 2.6 **Sub-step B — Converter emailBlocks + delayBlocks para sequences Instantly:** Criar funcao helper `convertToInstantlySequences(emailBlocks, delayBlocks)` que retorna `InstantlySequenceEmail[]`. Primeiro email: delayDays=0. Follow-ups: usar delayDays do delay block na posicao anterior ao email. Aplicar `textToEmailHtml()` no body de cada email
  - [x] 2.7 **Sub-step C — Criar campanha no Instantly:** Chamar `InstantlyService.createCampaign({ apiKey, name: campaignName, sequences })`. Salvar `externalCampaignId` do resultado
  - [x] 2.8 **Sub-step D — Buscar e associar sending accounts:** Chamar `InstantlyService.listAccounts({ apiKey })`. Se nao houver accounts, throw Error terminal. Chamar `InstantlyService.addAccountsToCampaign({ apiKey, campaignId: externalCampaignId, accountEmails: accounts.map(a => a.email) })`
  - [x] 2.9 **Sub-step E — Adicionar leads com icebreakers:** Mapear `leadsWithIcebreakers` para formato Instantly: `name` -> split em `firstName`/`lastName`, `icebreaker` -> campo `iceBreaker`. Filtrar leads sem email. Chamar `InstantlyService.addLeadsToCampaign({ apiKey, campaignId: externalCampaignId, leads })`
  - [x] 2.10 **Sub-step F — Montar output:** Compor `ExportStepOutput` com: externalCampaignId, campaignName, leadsUploaded, duplicatedLeads, invalidEmails, accountsAdded, platform: 'instantly'
  - [x] 2.11 Calcular custo: `{ instantly_create: 1, instantly_leads: leadsUploaded }` — cada operacao Instantly = 1 unidade
  - [x] 2.12 Retornar StepOutput com `success: true`, `data: ExportStepOutput`, `cost`

- [x] Task 3: Criar `ActivateStep` em `src/lib/agent/steps/activate-step.ts` (AC: #3, #4)
  - [x] 3.1 Extends BaseStep, constructor recebe `(stepNumber, supabase, tenantId: string)`
  - [x] 3.2 Implementa `executeInternal(input: StepInput): Promise<StepOutput>`
  - [x] 3.3 Extrair dados do `previousStepOutput`: `externalCampaignId`, `campaignName` — validar que existem
  - [x] 3.4 Enviar mensagem de progresso: `"Etapa ${stepNumber}/5: Ativando campanha no Instantly..."`
  - [x] 3.5 **Sub-step A — Buscar API key do Instantly:** Mesma logica do ExportStep (query api_configs + decrypt)
  - [x] 3.6 **Sub-step B — Ativar campanha:** Chamar `InstantlyService.activateCampaign({ apiKey, campaignId: externalCampaignId })`. Se falhar, classificar como retryable (API pode estar temporariamente indisponivel)
  - [x] 3.7 **Sub-step C — Enviar mensagem de confirmacao:** Enviar mensagem ao chat: `"Campanha '${campaignName}' ativa no Instantly com ${totalLeads} leads"`
  - [x] 3.8 **Sub-step D — Montar output:** Compor `ActivateStepOutput` com: externalCampaignId, campaignName, activated: true, activatedAt: ISO timestamp
  - [x] 3.9 Calcular custo: `{ instantly_activate: 1 }`
  - [x] 3.10 Retornar StepOutput com `success: true`, `data: ActivateStepOutput`, `cost`

- [x] Task 4: Atualizar `DeterministicOrchestrator` em `src/lib/agent/orchestrator.ts` (AC: #1, #3)
  - [x] 4.1 Importar ExportStep e ActivateStep
  - [x] 4.2 No step registry (`getStepInstance`), substituir os throws de `export` e `activate` por `return new ExportStep(stepNumber, this.supabase, tenantId)` e `return new ActivateStep(stepNumber, this.supabase, tenantId)`
  - [x] 4.3 Atualizar orchestrator.executeStep para marcar execucao como 'completed' quando o ultimo step (activate) concluir com sucesso

- [x] Task 5: Testes unitarios (AC: todos)
  - [x] 5.1 ExportStep: happy path — previousStepOutput com campaignName/emailBlocks/delayBlocks/leadsWithIcebreakers, API key encontrada, campanha criada, accounts adicionados, leads adicionados -> output completo
  - [x] 5.2 ExportStep: validacao input — sem previousStepOutput -> throw Error
  - [x] 5.3 ExportStep: validacao input — previousStepOutput sem emailBlocks -> throw Error
  - [x] 5.4 ExportStep: validacao input — leadsWithIcebreakers vazio -> throw Error
  - [x] 5.5 ExportStep: API key Instantly nao configurada -> throw Error terminal (isRetryable=false)
  - [x] 5.6 ExportStep: nenhuma sending account disponivel -> throw Error terminal
  - [x] 5.7 ExportStep: Instantly API 429 rate limit -> toPipelineError com isRetryable=true, externalService='instantly'
  - [x] 5.8 ExportStep: Instantly API 401 key invalida -> toPipelineError com isRetryable=false
  - [x] 5.9 ExportStep: leads sem email sao filtrados (nao enviados ao Instantly)
  - [x] 5.10 ExportStep: convertToInstantlySequences — primeiro email delayDays=0, follow-ups usam delay blocks
  - [x] 5.11 ExportStep: convertToInstantlySequences — emails com textToEmailHtml aplicado no body
  - [x] 5.12 ExportStep: custo calculado corretamente
  - [x] 5.13 ExportStep: mensagem de progresso enviada ao agent_messages
  - [x] 5.14 ActivateStep: happy path — previousStepOutput com externalCampaignId, ativacao bem-sucedida -> output com activated: true
  - [x] 5.15 ActivateStep: validacao input — sem externalCampaignId -> throw Error
  - [x] 5.16 ActivateStep: Instantly API erro -> toPipelineError com isRetryable=true, externalService='instantly'
  - [x] 5.17 ActivateStep: API key nao configurada -> throw Error terminal
  - [x] 5.18 ActivateStep: mensagem de confirmacao enviada ao agent_messages
  - [x] 5.19 ActivateStep: custo calculado corretamente
  - [x] 5.20 DeterministicOrchestrator: dispatch para export funciona (nao mais throw)
  - [x] 5.21 DeterministicOrchestrator: dispatch para activate funciona (nao mais throw)
  - [x] 5.22 DeterministicOrchestrator: execucao marcada como 'completed' apos activate concluir

## Dev Notes

### Convencao de Error Handling (OBRIGATORIA)

Documento completo: `_bmad-output/implementation-artifacts/epic-17-error-handling-convention.md`

Seguir EXATAMENTE o mesmo padrao das Stories 17.1, 17.2 e 17.3. Resumo:

- **Camada 1 (BaseStep):** JA EXISTE. ExportStep e ActivateStep herdam run() com try/catch, saveCheckpoint, toPipelineError automaticos.
- **Camada 2 (Orchestrator):** JA EXISTE. Erro -> 'paused' + sendErrorMessage. So precisa registrar ExportStep e ActivateStep no registry.
- **Padroes PROIBIDOS:** fetch sem response.ok, catch vazio, non-null assertions (!), erro generico sem contexto.

### Decisao Arquitetural: Services Direto (NAO API Routes)

Conforme spike `_bmad-output/implementation-artifacts/epic-17-api-validation-spike-2026-03-26.md` (GAP 6):

**ExportStep e ActivateStep chamam InstantlyService direto, NAO API routes.** Motivos:
1. Steps ja rodam no server-side (API route do step)
2. Tem acesso direto ao tenantId (auth ja resolvida na route do step)
3. Evita fetch para si mesmo (anti-pattern)
4. InstantlyService ja encapsula toda logica de comunicacao com a API Instantly

### Decisao Arquitetural: Sending Accounts — Usar Todas em Autopilot

Conforme spike (GAP 9):
- **Autopilot mode:** Usar TODAS as accounts ativas automaticamente via `listAccounts()`
- **Guided mode:** Approval gate (story 17.6) permitira usuario confirmar quais accounts usar
- **Para esta story (17.4):** Implementar o path basico — listar todas e adicionar todas
- Se nao houver nenhuma account, e ERRO TERMINAL (campanha nao pode ser enviada sem remetente)

### Decisao Arquitetural: Converter emailBlocks/delayBlocks para Instantly Sequences

O output do CreateCampaignStep (story 17.3) tem formato diferente do que o `blocksToInstantlySequences()` espera (que recebe `BuilderBlock[]` do campaign builder UI). Portanto:

**NAO reutilizar `blocksToInstantlySequences()`.** Criar converter simples no ExportStep:

```typescript
function convertToInstantlySequences(
  emailBlocks: Array<{ position: number; subject: string; body: string; emailMode: string }>,
  delayBlocks: Array<{ position: number; delayDays: number }>
): InstantlySequenceEmail[] {
  // Ordenar emailBlocks por position
  const sortedEmails = [...emailBlocks].sort((a, b) => a.position - b.position);
  const delayMap = new Map(delayBlocks.map(d => [d.position, d.delayDays]));

  return sortedEmails.map((email, index) => ({
    subject: email.subject,
    body: textToEmailHtml(email.body),  // Converter para HTML
    delayDays: index === 0 ? 0 : (delayMap.get(email.position - 1) ?? 1),
  }));
}
```

**Logica:**
- Primeiro email: `delayDays = 0` (enviar imediatamente)
- Follow-ups: buscar delay block na posicao imediatamente anterior ao email. Default: 1 dia
- Body: converter texto para HTML via `textToEmailHtml()` (preserva `{{variables}}`)

### Decisao Arquitetural: Mapear Leads para Formato Instantly

O InstantlyService.addLeadsToCampaign espera leads com campos especificos:

```typescript
// De LeadWithIcebreaker (CreateCampaignStep output)
{ name: "Joao Silva", title: "CTO", companyName: "Acme", email: "joao@acme.com", linkedinUrl: "...", icebreaker: "..." }

// Para formato Instantly (AddLeadsParams.leads)
{ email: "joao@acme.com", firstName: "Joao", lastName: "Silva", companyName: "Acme", title: "CTO", iceBreaker: "..." }
```

**Mapeamento:**
- `name` -> split por primeiro espaco: `firstName` = primeira palavra, `lastName` = resto
- `icebreaker` -> `iceBreaker` (camelCase do Instantly)
- Filtrar leads onde `email` e null ou vazio (InstantlyService ja faz isso, mas validar antes)
- `linkedinUrl` nao e enviado ao Instantly (nao suportado na API de leads)

### Decisao Arquitetural: Marcar Execucao como 'completed'

Quando o ActivateStep (step 5 — ultimo do pipeline) concluir com sucesso, o Orchestrator deve:
1. Atualizar `agent_executions.status` para `'completed'`
2. Atualizar `agent_executions.completed_at` com timestamp atual

**Onde implementar:** No `executeStep()` do DeterministicOrchestrator, apos o step.run() retornar com sucesso, verificar se e o ultimo step. Se sim, atualizar status da execucao.

Verificar logica existente: o orchestrator ja tem `execution.total_steps` e `step.step_number`. Se `step_number === total_steps`, marcar como completed.

### Fluxo do ExportStep (5 sub-operacoes)

```
1. Buscar API key do Instantly (api_configs + decrypt)
2. Converter emailBlocks + delayBlocks -> InstantlySequenceEmail[] (com textToEmailHtml)
3. Criar campanha no Instantly (InstantlyService.createCampaign)
4. Buscar e associar sending accounts (listAccounts + addAccountsToCampaign)
5. Adicionar leads com icebreakers (mapear formato + addLeadsToCampaign)
```

### Fluxo do ActivateStep (3 sub-operacoes)

```
1. Buscar API key do Instantly (api_configs + decrypt)
2. Ativar campanha (InstantlyService.activateCampaign)
3. Enviar mensagem de confirmacao ao chat
```

### Servicos/Funcoes a REUTILIZAR (NAO RECRIAR)

| Servico/Funcao | Arquivo | Uso nesta story |
|----------------|---------|----------------|
| BaseStep | `src/lib/agent/steps/base-step.ts` | Extends — herda run(), saveCheckpoint, toPipelineError |
| InstantlyService | `src/lib/services/instantly.ts` | createCampaign, addAccountsToCampaign, addLeadsToCampaign, activateCampaign, listAccounts |
| textToEmailHtml | `src/lib/services/instantly.ts` | Converter body texto para HTML (preserva {{variables}}) |
| decryptApiKey | `src/lib/crypto/encryption.ts` | Descriptografar API key do Instantly |
| DeterministicOrchestrator | `src/lib/agent/orchestrator.ts` | Registrar export e activate no step registry |
| ExternalServiceError | `src/lib/agent/steps/base-step.ts` | Erros do InstantlyService sao convertidos via toPipelineError |

### Contratos dos Services (CRITICO)

#### InstantlyService (src/lib/services/instantly.ts)

```typescript
import { InstantlyService, textToEmailHtml } from "@/lib/services/instantly";
import type {
  CreateCampaignParams, CreateCampaignResult,
  AddAccountsParams, AddAccountsResult,
  AddLeadsParams, AddLeadsResult,
  ActivateCampaignParams, ActivateResult,
  ListAccountsParams, ListAccountsResult,
  InstantlySequenceEmail,
} from "@/types/instantly";

// --- ExportStep ---

// 1. Buscar API key
const { data: apiConfig } = await this.supabase
  .from("api_configs").select("encrypted_key")
  .eq("tenant_id", this.tenantId).eq("service_name", "instantly").single();
if (!apiConfig) throw new Error("API key do Instantly nao configurada");
const apiKey = decryptApiKey(apiConfig.encrypted_key);

// 2. Criar campanha
const service = new InstantlyService();
const createResult = await service.createCampaign({
  apiKey,
  name: campaignName,
  sequences,  // InstantlySequenceEmail[]
});
// createResult: { campaignId: string, name: string, status: string }

// 3. Listar e adicionar accounts
const accountsResult = await service.listAccounts({ apiKey });
// accountsResult: { accounts: Array<{ email: string, first_name?, last_name? }>, totalCount: number }
if (accountsResult.accounts.length === 0) {
  throw new Error("Nenhuma sending account configurada no Instantly");
}
const addAccountsResult = await service.addAccountsToCampaign({
  apiKey,
  campaignId: createResult.campaignId,
  accountEmails: accountsResult.accounts.map(a => a.email),
});
// addAccountsResult: { success: boolean, accountsAdded: number }

// 4. Adicionar leads
const addLeadsResult = await service.addLeadsToCampaign({
  apiKey,
  campaignId: createResult.campaignId,
  leads: mappedLeads,  // Array com firstName, lastName, email, companyName, title, iceBreaker
});
// addLeadsResult: { leadsUploaded: number, duplicatedLeads: number, invalidEmails: number, remainingInPlan: number }

// --- ActivateStep ---

// 1. Ativar campanha
const activateResult = await service.activateCampaign({
  apiKey,
  campaignId: externalCampaignId,
});
// activateResult: { success: boolean }
```

### Dados do Step Anterior (previousStepOutput)

O CreateCampaignStep (story 17.3) retorna:
```typescript
{
  success: true,
  data: {
    campaignName: string,
    structure: {
      totalEmails: number,
      totalDays: number,
      items: CampaignStructureItem[]
    },
    emailBlocks: Array<{
      position: number,
      subject: string,
      body: string,
      emailMode: "initial" | "follow-up"
    }>,
    delayBlocks: Array<{
      position: number,
      delayDays: number
    }>,
    leadsWithIcebreakers: LeadWithIcebreaker[],
    icebreakerStats: { generated: number, failed: number, skipped: number },
    totalLeads: number
  },
  cost: { openai_structure: 1, openai_emails: number, openai_icebreakers: number }
}
```

O ExportStep consome: `campaignName`, `emailBlocks`, `delayBlocks`, `leadsWithIcebreakers`, `totalLeads`.
O ActivateStep consome do ExportStep: `externalCampaignId`, `campaignName`.

### Output Esperado do ExportStep (input para ActivateStep)

```typescript
{
  success: true,
  data: {
    externalCampaignId: string,     // ID da campanha no Instantly
    campaignName: string,            // Nome da campanha
    leadsUploaded: number,           // Leads adicionados com sucesso
    duplicatedLeads: number,         // Leads duplicados (ja existiam)
    invalidEmails: number,           // Leads com email invalido
    accountsAdded: number,           // Sending accounts associados
    platform: "instantly"            // Plataforma de export
  },
  cost: {
    instantly_create: 1,
    instantly_leads: number           // Leads uploaded
  }
}
```

### Output Esperado do ActivateStep (output final do pipeline)

```typescript
{
  success: true,
  data: {
    externalCampaignId: string,     // ID da campanha no Instantly
    campaignName: string,            // Nome da campanha
    activated: true,                 // Flag de ativacao
    activatedAt: string              // ISO timestamp da ativacao
  },
  cost: {
    instantly_activate: 1
  }
}
```

### Error Handling Especifico destes Steps

| Erro | Step | isRetryable | externalService | Tratamento |
|------|------|-------------|-----------------|------------|
| API key Instantly nao configurada | Export/Activate | false | undefined | `throw new Error("API key do Instantly nao configurada")` |
| Instantly 429 rate limit | Export/Activate | true | 'instantly' | toPipelineError do BaseStep trata via ExternalServiceError |
| Instantly 401 key invalida | Export/Activate | false | 'instantly' | toPipelineError |
| Instantly 500 server error | Export/Activate | true | 'instantly' | toPipelineError (retry pode resolver) |
| Nenhuma sending account | Export | false | undefined | `throw new Error("Nenhuma sending account configurada no Instantly")` — terminal, usuario precisa configurar |
| Todos leads sem email | Export | false | undefined | `throw new Error("Nenhum lead com email valido para exportar")` |
| createCampaign falhou | Export | true | 'instantly' | ExternalServiceError retryable |
| addLeadsToCampaign falhou | Export | true | 'instantly' | ExternalServiceError retryable |
| activateCampaign falhou | Activate | true | 'instantly' | ExternalServiceError retryable (API temporariamente indisponivel) |

### Estimativa de Tempo dos Steps (60 leads)

| Sub-operacao | Chamadas API | Tempo estimado |
|--------------|-------------|----------------|
| **ExportStep** | | |
| Buscar API key | 1 DB query | ~0.1s |
| Converter sequences | 0 (local) | ~0ms |
| Criar campanha | 1 Instantly API | ~1-2s |
| Listar accounts | 1 Instantly API | ~0.5-1s |
| Associar accounts | N Instantly API (150ms delay/account) | ~0.5-2s (3-10 accounts) |
| Adicionar leads (batch 1000) | 1 Instantly API | ~1-2s |
| **ExportStep Total** | ~5 chamadas | **~3-7s** |
| **ActivateStep** | | |
| Buscar API key | 1 DB query | ~0.1s |
| Ativar campanha | 1 Instantly API | ~0.5-1s |
| **ActivateStep Total** | ~2 chamadas | **~0.5-1.5s** |

NFR2 (< 15 min total pipeline): Atendido com folga. Steps 4+5 adicionam ~4-9 segundos ao pipeline.

### Padrao ExportStep (seguir CreateCampaignStep como referencia)

```typescript
export class ExportStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "export" as StepType, supabase);
    this.tenantId = tenantId;
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { previousStepOutput } = input;

    // 1. Validar input (campaignName, emailBlocks, delayBlocks, leadsWithIcebreakers)
    // 2. Enviar mensagem de progresso
    // 3. Buscar API key do Instantly
    // 4. Converter emailBlocks + delayBlocks -> sequences (com textToEmailHtml)
    // 5. Criar campanha no Instantly
    // 6. Listar e associar sending accounts
    // 7. Mapear e adicionar leads
    // 8. Montar ExportStepOutput
    // 9. Calcular custo
    // 10. Retornar StepOutput
  }
}
```

### Padrao ActivateStep

```typescript
export class ActivateStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "activate" as StepType, supabase);
    this.tenantId = tenantId;
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { previousStepOutput } = input;

    // 1. Validar input (externalCampaignId, campaignName)
    // 2. Enviar mensagem de progresso
    // 3. Buscar API key do Instantly
    // 4. Ativar campanha no Instantly
    // 5. Enviar mensagem de confirmacao
    // 6. Montar ActivateStepOutput
    // 7. Calcular custo
    // 8. Retornar StepOutput
  }
}
```

### Padroes de Codigo (Stories 17.1-17.3 learnings)

**Service/Step classes:**
- Metodos estaticos para operacoes stateless
- OU instancias com contexto (BaseStep pattern — stepNumber, stepType, supabase)
- Throw errors, nao retornar objetos de erro
- InstantlyService e instanciado com `new InstantlyService()` (stateless, API key passada por metodo)

**Testes (Vitest):**
- Mock factories centralizadas em test utils
- createChainBuilder() para mock de Supabase query chains
- Mock de InstantlyService: `vi.mock("@/lib/services/instantly", () => ({ InstantlyService: vi.fn().mockImplementation(() => ({ createCampaign: vi.fn(), ... })), textToEmailHtml: vi.fn(text => text) }))`
- Mock de decryptApiKey: `vi.mock("@/lib/crypto/encryption", () => ({ decryptApiKey: vi.fn().mockReturnValue("decrypted-key") }))`
- Cobrir: happy path + erro retryable + erro terminal + input invalido + edge cases (leads sem email, sem accounts)
- toPipelineError: `code` field usa string key ("STEP_EXPORT_ERROR"), nao o valor do AGENT_ERROR_CODES

**Debug learnings das stories anteriores:**
- toPipelineError: `code` field usa string key, nao o valor do AGENT_ERROR_CODES
- Teste de contagem de AGENT_ERROR_CODES: atualizar contagem apos adicionar novos codigos (13 -> 15)
- InstantlyService e class — mockar como class mock no Vitest
- `textToEmailHtml` e funcao exportada separadamente de `instantly.ts` — mockar separadamente

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
src/lib/agent/steps/export-step.ts                    <- ExportStep
src/lib/agent/steps/activate-step.ts                   <- ActivateStep
__tests__/unit/lib/agent/steps/export-step.test.ts
__tests__/unit/lib/agent/steps/activate-step.test.ts
```

**Arquivos a modificar:**
```
src/types/agent.ts                                     <- Adicionar STEP_EXPORT_ERROR, STEP_ACTIVATE_ERROR, ExportStepOutput, ActivateStepOutput
src/lib/agent/orchestrator.ts                          <- Registrar export e activate no registry + marcar execucao completed
__tests__/unit/lib/agent/orchestrator.test.ts          <- Novos testes dispatch export/activate + execucao completed
__tests__/unit/types/agent.test.ts                     <- Atualizar contagem AGENT_ERROR_CODES (13 -> 15)
```

**Convencoes de naming (seguir stories 17.1-17.3):**
- Step class: `ExportStep`, `ActivateStep` (PascalCase + sufixo Step)
- Step type: `export`, `activate` (snake_case — ja definidos em StepType)
- Arquivo: `export-step.ts`, `activate-step.ts` (kebab-case)
- Error code: `STEP_EXPORT_ERROR`, `STEP_ACTIVATE_ERROR` (UPPER_SNAKE_CASE)

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Story 17.4]
- [Source: _bmad-output/implementation-artifacts/17-3-step-de-criacao-de-campanha.md]
- [Source: _bmad-output/implementation-artifacts/17-2-step-de-busca-de-leads.md]
- [Source: _bmad-output/implementation-artifacts/17-1-pipeline-orchestrator-step-de-busca-de-empresas.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-error-handling-convention.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-api-validation-spike-2026-03-26.md — GAPs 6, 9]
- [Source: _bmad-output/planning-artifacts/prd.md — FR30-FR32, NFR1-NFR12]
- [Source: _bmad-output/planning-artifacts/architecture.md — Agente TDEC pipeline, DB schema]
- [Source: src/types/agent.ts — tipos do pipeline, StepType, StepInput, StepOutput, CreateCampaignOutput]
- [Source: src/types/instantly.ts — InstantlySequenceEmail, CreateCampaignParams, AddLeadsParams, etc.]
- [Source: src/lib/agent/steps/base-step.ts — BaseStep, ExternalServiceError]
- [Source: src/lib/agent/steps/create-campaign-step.ts — CreateCampaignStep (padrao de referencia)]
- [Source: src/lib/agent/orchestrator.ts — DeterministicOrchestrator, step registry]
- [Source: src/lib/services/instantly.ts — InstantlyService, textToEmailHtml]
- [Source: src/lib/crypto/encryption.ts — decryptApiKey]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Mock InstantlyService deve ser class (nao arrow function) para `new InstantlyService()` funcionar nos testes
- toPipelineError retorna `STEP_EXECUTION_ERROR` para `Error` generico, `STEP_EXPORT_ERROR`/`STEP_ACTIVATE_ERROR` somente para `ExternalServiceError`
- BaseStep.isRetryableStatus: 500 NAO e retryable (somente 0, 408, 429, 502, 503, 504)

### Completion Notes List

- ✅ Task 1: Adicionados STEP_EXPORT_ERROR e STEP_ACTIVATE_ERROR ao AGENT_ERROR_CODES (13 -> 15 codes). Criadas interfaces ExportStepOutput e ActivateStepOutput.
- ✅ Task 2: ExportStep implementado com 5 sub-operacoes: busca API key, converte sequences (com convertToInstantlySequences helper exportado), cria campanha, associa accounts, adiciona leads com mapeamento name->firstName/lastName.
- ✅ Task 3: ActivateStep implementado com 3 sub-operacoes: busca API key, ativa campanha, envia mensagem de confirmacao ao chat.
- ✅ Task 4: Orchestrator atualizado — export e activate registrados no step registry. Logica de completion adicionada: quando stepNumber === total_steps, marca execution como 'completed' com completed_at.
- ✅ Task 5: 74 testes novos — 18 ExportStep, 9 ActivateStep, 30 agent types (atualizado), 17 orchestrator (atualizado). Todos passam. Full suite: 5825 tests, 0 failures.

### Change Log

- 2026-03-26: Story 17.4 implementada — ExportStep + ActivateStep + orchestrator completion logic + 74 testes
- 2026-03-26: Code Review fixes — M1: ActivateStep test asserting isRetryable; L1: extracted shared getServiceApiKey to step-utils.ts; L3: added single email edge case test; L4: typed convertToInstantlySequences return with CreateCampaignParams contract. Suite: 5826 tests, 0 failures.

### File List

**Novos:**
- src/lib/agent/steps/export-step.ts
- src/lib/agent/steps/activate-step.ts
- src/lib/agent/steps/step-utils.ts
- __tests__/unit/lib/agent/steps/export-step.test.ts
- __tests__/unit/lib/agent/steps/activate-step.test.ts

**Modificados:**
- src/types/agent.ts
- src/lib/agent/orchestrator.ts
- __tests__/unit/lib/agent/orchestrator.test.ts
- __tests__/unit/types/agent.test.ts
