# Story 17.2: Step de Busca de Leads

Status: review

## Story

As a usuario do Agente TDEC,
I want que o agente encontre leads (contatos) nas empresas descobertas,
So that eu tenha pessoas reais para contatar na minha campanha.

## Acceptance Criteria

1. **Given** o step de busca de empresas foi concluido com sucesso
   **When** o frontend dispara a execucao do SearchLeadsStep
   **Then** o step chama o ApolloService existente com os cargos do briefing e os dominios das empresas encontradas no step anterior
   **And** o AgentStepProgress atualiza para "Etapa 2/5: Buscando leads ([cargos]) nas [N] empresas..."

2. **Given** o SearchLeadsStep concluiu com sucesso
   **When** o resultado e retornado (lista de leads com nome, cargo, empresa, email)
   **Then** o output e salvo com checkpoint no agent_steps
   **And** o custo do step (baseado no numero de leads encontrados) e registrado

3. **Given** o ApolloService retorna leads
   **When** o output e formatado
   **Then** inclui para cada lead: nome, cargo, empresa, email, LinkedIn URL (quando disponivel)
   **And** o total de leads encontrados e registrado no output

## Tasks / Subtasks

- [x] Task 1: Expandir tipos em `src/types/agent.ts` (AC: #2, #3)
  - [x] 1.1 Adicionar novo AGENT_ERROR_CODE: `STEP_SEARCH_LEADS_ERROR: 'Erro ao buscar leads'`
  - [x] 1.2 Criar interface `SearchLeadsOutput` tipando output do step (leads: SearchLeadResult[], totalFound: number, jobTitles: string[], domainsSearched: string[])
  - [x] 1.3 Criar interface `SearchLeadResult` com campos simplificados do pipeline (name, title, companyName, email, linkedinUrl)

- [x] Task 2: Criar `SearchLeadsStep` em `src/lib/agent/steps/search-leads-step.ts` (AC: #1, #2, #3)
  - [x] 2.1 Extends BaseStep, constructor recebe (stepNumber, supabase, tenantId: string) — ApolloService precisa de tenantId (nao apiKey direta)
  - [x] 2.2 Implementa executeInternal(input: StepInput): Promise<StepOutput>
  - [x] 2.3 Extrair dominios das empresas do previousStepOutput: `input.previousStepOutput?.companies` -> extrair campo `domain` de cada empresa (filtrar nulls)
  - [x] 2.4 Extrair cargos do briefing: `input.briefing.jobTitles` (ja e string[])
  - [x] 2.5 Validar input: throw Error se jobTitles vazio OU dominios vazio
  - [x] 2.6 Construir ApolloSearchFilters: `{ domains: string[], titles: string[], perPage: 25, page: 1 }`
  - [x] 2.7 Chamar ApolloService.searchPeople(filters) — ApolloService instanciado com tenantId (ele busca a API key internamente via getApiKey())
  - [x] 2.8 Transformar resultado: mapear cada LeadRow para SearchLeadResult simplificado (nome completo = first_name + last_name, title, company_name, email, linkedin_url)
  - [x] 2.9 Retornar StepOutput com success:true, data: { leads, totalFound, jobTitles, domainsSearched }
  - [x] 2.10 Registrar custo: `{ apollo_search: leads.length * creditosPorLead }` — verificar custo no CostModel (1 credit/lead estimado)

- [x] Task 3: Atualizar `DeterministicOrchestrator` em `src/lib/agent/orchestrator.ts` (AC: #1)
  - [x] 3.1 Importar SearchLeadsStep
  - [x] 3.2 No step registry (getStepInstance), adicionar case 'search_leads' retornando `new SearchLeadsStep(stepNumber, this.supabase, tenantId)`
  - [x] 3.3 CRITICO: Atualizar executeStep() para buscar output do step anterior e passar como `previousStepOutput` no StepInput — buscar agent_steps WHERE execution_id AND step_number = stepNumber - 1 AND status = 'completed', extrair `output`
  - [x] 3.4 Obter tenantId: ja disponivel no execution.tenant_id (buscado do agent_executions)

- [x] Task 4: Testes unitarios (AC: todos)
  - [x] 4.1 SearchLeadsStep: happy path — briefing com jobTitles + previousStepOutput com companies com domains -> ApolloService.searchPeople chamado com filtros corretos -> output formatado
  - [x] 4.2 SearchLeadsStep: validacao input — sem jobTitles -> throw Error
  - [x] 4.3 SearchLeadsStep: validacao input — sem previousStepOutput ou sem companies -> throw Error
  - [x] 4.4 SearchLeadsStep: validacao input — companies sem domains validos -> throw Error
  - [x] 4.5 SearchLeadsStep: erro retryable do Apollo (429) -> toPipelineError com isRetryable=true, externalService='apollo'
  - [x] 4.6 SearchLeadsStep: erro terminal do Apollo (401) -> toPipelineError com isRetryable=false
  - [x] 4.7 SearchLeadsStep: custo calculado corretamente (leads.length * creditos)
  - [x] 4.8 SearchLeadsStep: transformacao LeadRow -> SearchLeadResult (campos mapeados corretamente, nulls tratados)
  - [x] 4.9 DeterministicOrchestrator: dispatch para search_leads funciona
  - [x] 4.10 DeterministicOrchestrator: previousStepOutput passado corretamente no StepInput
  - [x] 4.11 DeterministicOrchestrator: previousStepOutput ausente quando step anterior nao completou -> erro

## Dev Notes

### Convencao de Error Handling (OBRIGATORIA)

Documento completo: `_bmad-output/implementation-artifacts/epic-17-error-handling-convention.md`

Seguir EXATAMENTE o mesmo padrao da Story 17.1. Resumo:

- **Camada 1 (BaseStep):** JA EXISTE. SearchLeadsStep herda run() com try/catch, saveCheckpoint, toPipelineError automaticos.
- **Camada 2 (Orchestrator):** JA EXISTE. Erro -> 'paused' + sendErrorMessage. So precisa registrar SearchLeadsStep no registry.
- **Padroes PROIBIDOS:** fetch sem response.ok, catch vazio, non-null assertions (!), erro generico sem contexto.

### ApolloService - Contrato (CRITICO)

**Arquivo:** `src/lib/services/apollo.ts`

**Instanciacao:** `new ApolloService(tenantId)` — NAO recebe apiKey no construtor. A API key e buscada internamente via `getApiKey()` que consulta `api_configs` WHERE service_name='apollo' AND tenant_id.

**Metodo principal:** `searchPeople(filters: ApolloSearchFilters): Promise<ApolloSearchResult>`

**ApolloSearchFilters (src/types/apollo.ts):**
```typescript
interface ApolloSearchFilters {
  industries?: string[];
  companySizes?: string[];    // e.g., ["11-50", "51-200"]
  locations?: string[];       // e.g., ["Sao Paulo, Brazil"]
  titles?: string[];          // e.g., ["CEO", "CTO"]
  keywords?: string;
  domains?: string[];         // Company domains - USAR ESTE para filtrar por empresas
  contactEmailStatuses?: string[];
  page?: number;
  perPage?: number;           // default 25
}
```

**ApolloSearchResult:**
```typescript
interface ApolloSearchResult {
  leads: LeadRow[];           // Leads transformados para formato interno
  pagination: PaginationMeta; // { totalEntries, page, perPage, totalPages }
}
```

**IMPORTANTE - LeadRow do api_search tem limitacoes:**
- `email: null` — api_search NAO retorna email real, so flag de disponibilidade
- `phone: null` — idem
- `last_name: obfuscated` — ex: "Hu***n"
- Para obter dados reais, precisaria de People Enrichment (Story futura)
- Para o MVP do pipeline, ACEITAR os dados parciais. O SearchLeadResult deve refletir isso.

**Custo Apollo:** Verificar CostModel, mas estimar ~1 credit/lead no search.

### Dados do Step Anterior (previousStepOutput)

O SearchCompaniesStep (story 17.1) retorna:
```typescript
{
  success: true,
  data: {
    companies: TheirStackCompany[],   // Array de empresas
    totalFound: number,
    technologySlug: string,
    filtersApplied: TheirStackSearchFilters
  },
  cost: { theirstack_search: number }
}
```

**TheirStackCompany tem:** `{ name, domain, url, country, country_code, city, industry, employee_count_range, apollo_id, ... }`

O campo `domain` e a chave para filtrar no Apollo: usar `companies.map(c => c.domain).filter(Boolean)` para extrair dominios validos.

### MUDANCA NO ORCHESTRATOR - previousStepOutput (CRITICO)

Atualmente `executeStep()` NAO passa `previousStepOutput` no StepInput:
```typescript
// ATUAL (story 17.1)
const input: StepInput = {
  executionId,
  briefing: execution.briefing as ParsedBriefing,
};
```

**PRECISA adicionar:**
```typescript
// NOVO (story 17.2)
let previousStepOutput: Record<string, unknown> | undefined;
if (stepNumber > 1) {
  const { data: prevStep } = await this.supabase
    .from("agent_steps")
    .select("output")
    .eq("execution_id", executionId)
    .eq("step_number", stepNumber - 1)
    .eq("status", "completed")
    .single();

  if (!prevStep?.output) {
    throw this.createPipelineError(
      "ORCHESTRATOR_STEP_NOT_READY",
      "Step anterior nao concluido",
      stepNumber,
      stepType
    );
  }
  previousStepOutput = prevStep.output as Record<string, unknown>;
}

const input: StepInput = {
  executionId,
  briefing: execution.briefing as ParsedBriefing,
  previousStepOutput,
};
```

### Servicos Existentes (REUTILIZAR, NAO RECRIAR)

| Servico | Arquivo | Uso nesta story |
|---------|---------|----------------|
| ApolloService | `src/lib/services/apollo.ts` | `new ApolloService(tenantId).searchPeople(filters)` |
| BaseStep | `src/lib/agent/steps/base-step.ts` | Extends — herda run(), saveCheckpoint, toPipelineError |
| DeterministicOrchestrator | `src/lib/agent/orchestrator.ts` | Atualizar registry + previousStepOutput |
| ExternalServiceError | `src/lib/services/base-service.ts` | Ja tratado pelo toPipelineError() do BaseStep |

### Tipos Existentes (src/types/agent.ts)

Todos os tipos do pipeline JA EXISTEM — ver story 17.1 Dev Notes. Apenas adicionar:
- `STEP_SEARCH_LEADS_ERROR` ao AGENT_ERROR_CODES
- `SearchLeadsOutput` e `SearchLeadResult` interfaces novas

### Padrao SearchLeadsStep (seguir SearchCompaniesStep como referencia)

```typescript
// Estrutura do arquivo:
export class SearchLeadsStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "search_leads" as StepType, supabase);
    this.tenantId = tenantId;
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    // 1. Validar input (jobTitles, previousStepOutput)
    // 2. Extrair domains do previousStepOutput
    // 3. Construir ApolloSearchFilters
    // 4. Chamar ApolloService.searchPeople()
    // 5. Transformar LeadRow[] -> SearchLeadResult[]
    // 6. Calcular custo
    // 7. Retornar StepOutput
  }
}
```

### Project Structure Notes

**Novos arquivos a criar:**
```
src/lib/agent/steps/search-leads-step.ts         <- SearchLeadsStep
__tests__/unit/lib/agent/steps/search-leads-step.test.ts
```

**Arquivos a modificar:**
```
src/types/agent.ts                                <- Adicionar STEP_SEARCH_LEADS_ERROR, SearchLeadsOutput, SearchLeadResult
src/lib/agent/orchestrator.ts                     <- Registrar search_leads no registry + previousStepOutput
__tests__/unit/lib/agent/orchestrator.test.ts     <- Novos testes dispatch search_leads + previousStepOutput
```

**Convencoes de naming (seguir story 17.1):**
- Step class: `SearchLeadsStep` (PascalCase + sufixo Step)
- Step type: `search_leads` (snake_case)
- Arquivo: `search-leads-step.ts` (kebab-case)
- Error code: `STEP_SEARCH_LEADS_ERROR` (UPPER_SNAKE_CASE)

### Padroes de Codigo (Story 17.1 learnings)

**Service/Step classes:**
- Metodos estaticos para operacoes stateless (BriefingParserService pattern)
- OU instancias com contexto (BaseStep pattern — stepNumber, stepType, supabase)
- Throw errors, nao retornar objetos de erro

**Testes (Vitest):**
- Mock factories centralizadas em test utils
- createChainBuilder() para mock de Supabase query chains
- ApolloService mock: precisa ser class mock (como TheirStackService na 17.1)
- Cobrir: happy path + erro retryable + erro terminal + input invalido

**Debug learnings da story 17.1:**
- TheirStackService mock: precisa ser class (nao vi.fn().mockImplementation) para funcionar como construtor no Vitest — APLICAR MESMO PADRAO para ApolloService mock
- toPipelineError: `code` field usa string key ("STEP_SEARCH_LEADS_ERROR"), nao o valor do AGENT_ERROR_CODES

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

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Story 17.2]
- [Source: _bmad-output/implementation-artifacts/17-1-pipeline-orchestrator-step-de-busca-de-empresas.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-error-handling-convention.md]
- [Source: src/types/agent.ts — tipos do pipeline]
- [Source: src/lib/services/apollo.ts — ApolloService]
- [Source: src/types/apollo.ts — ApolloSearchFilters, ApolloSearchResult, transformApolloToLeadRow]
- [Source: src/types/lead.ts — LeadRow]
- [Source: src/lib/agent/steps/base-step.ts — BaseStep]
- [Source: src/lib/agent/steps/search-companies-step.ts — SearchCompaniesStep (padrao de referencia)]
- [Source: src/lib/agent/orchestrator.ts — DeterministicOrchestrator]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Corrigido teste existente `agent.test.ts` que validava contagem de AGENT_ERROR_CODES (11 -> 12)

### Completion Notes List

- Task 1: Adicionado `STEP_SEARCH_LEADS_ERROR` ao AGENT_ERROR_CODES, criadas interfaces `SearchLeadResult` e `SearchLeadsOutput`
- Task 2: Criado `SearchLeadsStep` extends BaseStep — valida input (jobTitles, previousStepOutput, domains), extrai domains, chama ApolloService.searchPeople(), transforma LeadRow->SearchLeadResult, calcula custo (1 credit/lead)
- Task 3: Orchestrator atualizado — importa SearchLeadsStep, registra no step registry, busca previousStepOutput do agent_steps (step anterior completed), extrai tenantId do execution
- Task 4: 10 testes SearchLeadsStep (happy path, 4 validacoes input, erro retryable 429, erro terminal 401, custo, transformacao) + 3 testes orchestrator (dispatch search_leads, previousStepOutput passado, previousStepOutput ausente -> erro)
- Suite completa: 335 test files, 5764 testes passando, 0 falhas

### File List

**Novos:**
- `src/lib/agent/steps/search-leads-step.ts`
- `__tests__/unit/lib/agent/steps/search-leads-step.test.ts`

**Modificados:**
- `src/types/agent.ts`
- `src/lib/agent/orchestrator.ts`
- `__tests__/unit/lib/agent/orchestrator.test.ts`
- `__tests__/unit/types/agent.test.ts`

### Change Log

- 2026-03-26: Story 17.2 implementada — SearchLeadsStep + orchestrator previousStepOutput + 13 novos testes
