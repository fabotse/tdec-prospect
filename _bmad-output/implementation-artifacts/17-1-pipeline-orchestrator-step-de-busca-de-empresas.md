# Story 17.1: Pipeline Orchestrator & Step de Busca de Empresas

Status: done

## Story

As a usuario do Agente TDEC,
I want que o agente busque empresas por tecnologia apos eu confirmar o plano,
So that eu veja as empresas encontradas como primeiro resultado concreto do pipeline.

## Acceptance Criteria

1. **Given** uma execucao confirmada pelo usuario (status='pending')
   **When** o frontend dispara a execucao do primeiro step via POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute
   **Then** o DeterministicOrchestrator despacha para o SearchCompaniesStep
   **And** o step chama o TheirStackService existente com os parametros do briefing (tecnologia, localizacao, industria)

2. **Given** o SearchCompaniesStep esta executando
   **When** o status do step muda para 'running' no agent_steps
   **Then** o frontend recebe a atualizacao via Supabase Realtime
   **And** o AgentStepProgress exibe "Etapa 1/5: Buscando empresas com [tecnologia]..." com indicador de loading

3. **Given** o SearchCompaniesStep concluiu com sucesso
   **When** o resultado e retornado (lista de empresas)
   **Then** o output e salvo no campo `output` do agent_steps
   **And** um checkpoint e salvo (status='completed', completed_at preenchido) antes de qualquer acao seguinte (NFR8)
   **And** o custo do step e registrado no campo `cost` do agent_steps

4. **Given** a classe BaseStep
   **When** qualquer step herda dela
   **Then** tem acesso a saveCheckpoint() e logStep() como metodos herdados
   **And** saveCheckpoint() persiste output + status no banco antes de retornar
   **And** logStep() registra input, output e decisao na execucao

5. **Given** o DeterministicOrchestrator
   **When** implementa IPipelineOrchestrator
   **Then** expoe planExecution(), executeStep() e getExecution()
   **And** o step registry contem os 5 tipos de step: search_companies, search_leads, create_campaign, export, activate

## Tasks / Subtasks

- [x] Task 1: Expandir tipos em `src/types/agent.ts` (AC: #4, #5)
  - [x] 1.1 Adicionar novos AGENT_ERROR_CODES do pipeline (STEP_SEARCH_COMPANIES_ERROR, ORCHESTRATOR_INVALID_STEP, ORCHESTRATOR_STEP_NOT_READY, CHECKPOINT_SAVE_ERROR)
  - [x] 1.2 Criar interface `IPipelineOrchestrator` com planExecution(), executeStep(), getExecution()
  - [x] 1.3 Criar interface `SearchCompaniesOutput` tipando output do step (companies, totalFound, technologySlug, filtersApplied)
  - [x] 1.4 Exportar `STEP_LABELS` mapa de stepType -> label PT-BR ("search_companies" -> "Busca de Empresas")

- [x] Task 2: Criar `BaseStep` abstrata em `src/lib/agent/steps/base-step.ts` (AC: #4)
  - [x] 2.1 Classe abstrata com executeInternal() abstrato e run() como template method
  - [x] 2.2 run(): updateStepStatus('running') -> try executeInternal() -> saveCheckpoint() -> logStep() -> catch toPipelineError() -> saveFailure() -> throw
  - [x] 2.3 toPipelineError(): converter ExternalServiceError, Apify errors e errors genericos
  - [x] 2.4 saveCheckpoint(): UPDATE agent_steps SET output, status='completed', completed_at
  - [x] 2.5 saveFailure(): UPDATE agent_steps SET status='failed', error_message, output={error}, cost (parcial)
  - [x] 2.6 updateStepStatus(): UPDATE agent_steps SET status, started_at
  - [x] 2.7 logStep(): INSERT agent_messages com metadata {stepNumber, messageType}
  - [x] 2.8 retryStep(): backoff exponencial [0, 2000, 5000]ms, max 3 tentativas
  - [x] 2.9 isRetryableStatus(): [0, 408, 429, 502, 503, 504] -> true

- [x] Task 3: Criar `SearchCompaniesStep` em `src/lib/agent/steps/search-companies-step.ts` (AC: #1, #3)
  - [x] 3.1 Extends BaseStep, implementa executeInternal(input: StepInput): Promise<StepOutput>
  - [x] 3.2 Camada de resolucao briefing -> TheirStackSearchFilters:
    - technology -> searchTechnologies(apiKey, briefing.technology) -> primeiro slug
    - location -> mapa estatico paises comuns (Brasil->BR, EUA->US, etc.)
    - companySize -> regex para extrair min/max de "50-200"
    - industry -> mapa estatico industryIds TheirStack (ou ignorar se nao mapeavel)
  - [x] 3.3 Chamar TheirStackService.searchCompanies(apiKey, resolvedFilters)
  - [x] 3.4 Retornar StepOutput com success:true, data: { companies, totalFound, technologySlug, filtersApplied }
  - [x] 3.5 Registrar custo: { theirstack_search: companies.length * unitPrice }
  - [x] 3.6 Validar input: throw Error se technology ausente

- [x] Task 4: Criar `DeterministicOrchestrator` em `src/lib/agent/orchestrator.ts` (AC: #5)
  - [x] 4.1 Implementa IPipelineOrchestrator
  - [x] 4.2 Step registry: Map<StepType, BaseStep> com os 5 tipos (search_companies implementado, demais como stubs que jogam 'not implemented')
  - [x] 4.3 executeStep(executionId, stepNumber): buscar step no registry, chamar step.run(input), catch PipelineError -> updateExecutionStatus('paused') + sendErrorMessage() + throw
  - [x] 4.4 planExecution(briefing): gerar PlannedStep[] (reutilizar PlanGeneratorService)
  - [x] 4.5 getExecution(executionId): query agent_executions + agent_steps
  - [x] 4.6 sendErrorMessage(): INSERT agent_messages com mensagem de erro em PT-BR incluindo nome do service externo
  - [x] 4.7 Regra: Execucao NUNCA vai direto para 'failed', sempre 'paused' primeiro

- [x] Task 5: Criar API route POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute (AC: #1)
  - [x] 5.1 Auth via getCurrentUserProfile() (401)
  - [x] 5.2 Validacao params: executionId e stepNumber (400)
  - [x] 5.3 Verificar execucao existe e pertence ao tenant (404)
  - [x] 5.4 Buscar API key do TheirStack via api_configs + decryptApiKey() (422 se nao encontrada)
  - [x] 5.5 Chamar orchestrator.executeStep()
  - [x] 5.6 Retornar { data: StepOutput } em sucesso
  - [x] 5.7 Catch PipelineError -> { error: { code, message, stepNumber, stepType, isRetryable, externalService } } com status 503 (retryable) ou 500 (terminal)
  - [x] 5.8 Catch generico -> { error: { code: 'INTERNAL_ERROR', message, isRetryable: false } } status 500

- [x] Task 6: Criar componente AgentStepProgress em `src/components/agent/AgentStepProgress.tsx` (AC: #2)
  - [x] 6.1 Props: steps: AgentStep[], currentStep: number
  - [x] 6.2 Renderizar lista de steps com status visual (pending/running/completed/failed)
  - [x] 6.3 Step running: "Etapa {n}/5: {STEP_LABELS[stepType]}..." com spinner
  - [x] 6.4 Step completed: check verde + resultado resumido
  - [x] 6.5 Step failed: icone vermelho + mensagem de erro
  - [x] 6.6 Integrar no AgentChat.tsx quando execucao esta ativa

- [x] Task 7: Hook useStepExecution em `src/hooks/use-step-execution.ts` (AC: #1, #2)
  - [x] 7.1 executeStep(executionId, stepNumber): fetch POST para API route
  - [x] 7.2 Check response.ok (erro ja persistido pelo orchestrator, Realtime ja notifica chat)
  - [x] 7.3 Catch network error: toast.error('Erro de conexao')
  - [x] 7.4 Integrar com useAgentExecution existente (steps ja vem via Realtime)

- [x] Task 8: Testes unitarios (AC: todos)
  - [x] 8.1 BaseStep: happy path, erro retryable, erro terminal, erro de rede, saveCheckpoint, saveFailure
  - [x] 8.2 SearchCompaniesStep: resolucao de parametros (technology slug, country code, company size range, industry), chamada ao service, output correto, custo calculado, input invalido
  - [x] 8.3 DeterministicOrchestrator: dispatch correto, sendErrorMessage, status 'paused' em falha, step registry
  - [x] 8.4 API route: auth, validacao params, sucesso, PipelineError, erro generico
  - [x] 8.5 AgentStepProgress: renderizacao por status, labels corretos
  - [x] 8.6 useStepExecution: happy path, erro HTTP, erro de rede

## Dev Notes

### Convencao de Error Handling (OBRIGATORIA)

Documento completo: `_bmad-output/implementation-artifacts/epic-17-error-handling-convention.md`

**Principio:** Todo erro deve ser visivel, classificado e acionavel.

**4 Camadas:**
- Camada 0 (Services): JA EXISTEM, NAO MODIFICAR. ExternalServiceError com serviceName, statusCode, userMessage.
- Camada 1 (BaseStep): CRIAR nesta story. Template method run() com try/catch obrigatorio, saveCheckpoint() sempre, toPipelineError() para converter qualquer erro.
- Camada 2 (Orchestrator): CRIAR nesta story. Coordena steps, status 'paused' (NUNCA 'failed' direto), sendErrorMessage() obrigatorio.
- Camada 3 (API Route): CRIAR nesta story. isPipelineError() type guard, 503 (retryable) ou 500 (terminal).
- Camada 4 (Frontend): response.ok check obrigatorio. Erro ja chega via Realtime, frontend so atualiza estado local.

**Padroes PROIBIDOS:**
- fetch sem response.ok check
- catch vazio ou so com console
- catch que retorna silenciosamente
- non-null assertions (!)
- erro generico sem contexto ("Something went wrong")

### Spike de APIs (Referencia)

Documento completo: `_bmad-output/implementation-artifacts/epic-17-api-validation-spike-2026-03-26.md`

**GAP 1 (CRITICO) - Mapeamento briefing -> TheirStack:**
- `technology` (texto livre) -> `searchTechnologies()` -> slug
- `location` (texto livre) -> mapa estatico paises -> countryCodes
- `companySize` ("50-200") -> regex -> min/maxEmployeeCount
- `industry` (texto livre) -> mapa estatico industryIds -> ou ignorar

**Decisao arquitetural:** Steps chamam services DIRETO (nao API routes). Motivo: performance + evita fetch para si mesmo.

**Paginacao:** Limit 50 empresas (1 pagina) no MVP. Suficiente para primeiro ciclo.

### Servicos Existentes (REUTILIZAR, NAO RECRIAR)

| Servico | Arquivo | Metodos relevantes |
|---------|---------|-------------------|
| TheirStackService | `src/lib/services/theirstack.ts` | searchCompanies(), searchTechnologies(), getCredits() |
| ExternalServiceError | `src/lib/services/base-service.ts` | serviceName, statusCode, userMessage, details |
| CostEstimatorService | `src/lib/services/agent-cost-estimator.ts` | getCostModels(), estimateCosts() |
| PlanGeneratorService | `src/lib/services/agent-plan-generator.ts` | generatePlan() |
| getCurrentUserProfile | `src/lib/auth.ts` | Autenticacao padrao |
| decryptApiKey | `src/lib/services/encryption.ts` | Descriptografar API keys |
| createSupabaseServerClient | `src/lib/supabase/server.ts` | Cliente Supabase server-side |

### Tipos Existentes (src/types/agent.ts)

Todos os tipos do pipeline JA EXISTEM:
- `StepInput { executionId, briefing: ParsedBriefing, previousStepOutput? }`
- `StepOutput { success, data: Record<string, unknown>, cost? }`
- `PipelineError { code, message, stepNumber, stepType, isRetryable, externalService? }`
- `StepType = 'search_companies' | 'search_leads' | 'create_campaign' | 'export' | 'activate'`
- `StepStatus = 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'completed' | 'failed' | 'skipped'`
- `ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'`
- `ParsedBriefing { technology, jobTitles, location, companySize, industry, productSlug, mode, skipSteps }`
- `PlannedStep { stepNumber, stepType, title, description, skipped, estimatedCost, costDescription }`
- `AGENT_ERROR_CODES` (expandir, nao substituir)

### TheirStack Service - Contrato

**Input:** `TheirStackSearchFilters { technologySlugs: string[], countryCodes?, minEmployeeCount?, maxEmployeeCount?, industryIds?, page?, limit? }`

**Output:** `CompanySearchResponse { metadata: { total_results, total_companies }, data: TheirStackCompany[] }`

**TheirStackCompany:** `{ name, domain, url, country, country_code, city, industry, employee_count_range, apollo_id, annual_revenue_usd, founded_year, linkedin_url, technologies_found, has_blurred_data }`

**searchTechnologies(apiKey, query):** Retorna `KeywordAggregated[]` com slugs. Usar para resolver texto livre -> slug.

**Custo:** 3 credits/empresa. Limite: 50 empresas por pagina.

### Database Schema (Tabelas existentes)

```
agent_executions: id, tenant_id, user_id, status, mode, briefing (JSONB), current_step, total_steps, cost_estimate, cost_actual, result_summary, error_message, started_at, completed_at
agent_steps: id, execution_id, step_number, step_type, status, input (JSONB), output (JSONB), cost (JSONB), error_message, started_at, completed_at, UNIQUE(execution_id, step_number)
agent_messages: id, execution_id, role, content, metadata (JSONB), created_at
```

**Realtime:** useAgentExecution ja subscreve INSERT em agent_messages e INSERT/UPDATE em agent_steps. Novas rows/updates aparecem automaticamente no frontend.

### Project Structure Notes

**Novos arquivos a criar:**
```
src/lib/agent/steps/base-step.ts           <- BaseStep abstrata
src/lib/agent/steps/search-companies-step.ts <- SearchCompaniesStep
src/lib/agent/orchestrator.ts              <- DeterministicOrchestrator
src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts
src/components/agent/AgentStepProgress.tsx
src/hooks/use-step-execution.ts
```

**Testes:**
```
__tests__/unit/lib/agent/steps/base-step.test.ts
__tests__/unit/lib/agent/steps/search-companies-step.test.ts
__tests__/unit/lib/agent/orchestrator.test.ts
__tests__/unit/api/agent/executions-steps-execute.test.ts
__tests__/unit/components/agent/AgentStepProgress.test.tsx
__tests__/unit/hooks/use-step-execution.test.tsx
```

**Convencoes de naming:**
- DB: snake_case com prefixo `agent_`
- Step types: snake_case (`search_companies`)
- Classes: PascalCase + sufixo (`SearchCompaniesStep`, `DeterministicOrchestrator`)
- Hooks: use + PascalCase (`useStepExecution`)
- API routes: `/api/agent/executions/[executionId]/steps/[stepNumber]/execute`

### Padroes de Codigo (Epic 16 learnings)

**API Routes:**
- Auth: `const profile = await getCurrentUserProfile(); if (!profile) return NextResponse.json({...}, { status: 401 });`
- RouteParams: `params: Promise<{ executionId: string; stepNumber: string }>` -> `const { executionId, stepNumber } = await params;`
- API key: buscar em `api_configs` WHERE service_name='theirstack', descriptografar com `decryptApiKey()`
- NUNCA retornar 200 quando houve erro

**Service/Step classes:**
- Metodos estaticos para operacoes stateless (BriefingParserService pattern)
- OU instancias com contexto (BaseStep pattern - stepNumber, stepType, supabase)
- Throw errors, nao retornar objetos de erro
- Zod para validacao quando aplicavel

**Hooks:**
- useCallback para funcoes de fetch
- useState para estado local
- Callbacks do parent (nao chamadas diretas de API no componente)
- NUNCA console.log (ESLint enforces no-console)

**Componentes:**
- Props-driven
- Callbacks para writes
- toast.error() de sonner para feedback de erro
- Linguagem PT-BR para todo texto visivel

**Testes (Vitest):**
- Mock factories centralizadas em test utils
- createMockFetch() com regex URL matching para API routes
- createChainBuilder() para mock de Supabase query chains
- Cobrir: happy path + erro retryable + erro terminal + erro de rede

### Mapa de Resolucao Briefing -> TheirStack

```typescript
// 1. Technology: texto livre -> slug
const techs = await TheirStackService.searchTechnologies(apiKey, briefing.technology);
const technologySlugs = techs.length > 0 ? [techs[0].slug] : [];

// 2. Location: texto -> country code (mapa estatico)
const COUNTRY_MAP: Record<string, string> = {
  'brasil': 'BR', 'brazil': 'BR',
  'eua': 'US', 'usa': 'US', 'estados unidos': 'US', 'united states': 'US',
  'portugal': 'PT', 'reino unido': 'GB', 'uk': 'GB',
  'alemanha': 'DE', 'germany': 'DE', 'franca': 'FR', 'france': 'FR',
  'canada': 'CA', 'mexico': 'MX', 'argentina': 'AR', 'chile': 'CL',
  'colombia': 'CO', 'india': 'IN', 'australia': 'AU', 'japao': 'JP',
};
const countryCodes = location ? [COUNTRY_MAP[location.toLowerCase()] ?? location] : undefined;

// 3. Company Size: "50-200" -> min/max
const sizeMatch = briefing.companySize?.match(/(\d+)\s*[-–a]\s*(\d+)/);
const minEmployeeCount = sizeMatch ? parseInt(sizeMatch[1]) : undefined;
const maxEmployeeCount = sizeMatch ? parseInt(sizeMatch[2]) : undefined;

// 4. Industry: mapa estatico ou ignorar
const INDUSTRY_MAP: Record<string, number> = {
  'saas': 5, 'fintech': 14, 'ecommerce': 6, 'healthtech': 11,
  'edtech': 9, 'martech': 15, 'logistica': 18,
};
const industryIds = briefing.industry
  ? [INDUSTRY_MAP[briefing.industry.toLowerCase()]].filter(Boolean)
  : undefined;
```

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
- [ ] Testes cobrem: happy path + erro retryable + erro terminal + erro de rede

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Story 17.1]
- [Source: _bmad-output/implementation-artifacts/epic-17-error-handling-convention.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-api-validation-spike-2026-03-26.md]
- [Source: _bmad-output/planning-artifacts/architecture.md#Pipeline Execution]
- [Source: src/types/agent.ts — tipos do pipeline]
- [Source: src/lib/services/theirstack.ts — TheirStackService]
- [Source: src/lib/services/agent-cost-estimator.ts — CostEstimatorService]
- [Source: src/lib/services/agent-plan-generator.ts — PlanGeneratorService]
- [Source: src/hooks/use-agent-execution.ts — Realtime subscriptions]
- [Source: _bmad-output/implementation-artifacts/16-6-cadastro-de-produto-inline.md — Dev learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- BaseStep toPipelineError: `code` field usa string key ("STEP_EXECUTION_ERROR"), nao o valor do AGENT_ERROR_CODES (que eh a mensagem PT-BR)
- TheirStackService mock: precisa ser class (nao vi.fn().mockImplementation) para funcionar como construtor no Vitest

### Completion Notes List

- Task 1: Expandidos 4 novos AGENT_ERROR_CODES, criada IPipelineOrchestrator, SearchCompaniesOutput, STEP_LABELS
- Task 2: BaseStep abstrata com template method run(), saveCheckpoint/saveFailure, toPipelineError (ExternalServiceError -> retryable), retryStep com backoff exponencial, isRetryableStatus
- Task 3: SearchCompaniesStep resolve briefing->TheirStackFilters (technology slug, country code, company size regex, industry map), chama TheirStackService, calcula custo por company count
- Task 4: DeterministicOrchestrator com step registry (switch pattern), executeStep despacha para step correto, erro -> 'paused' (nunca 'failed' direto), sendErrorMessage em PT-BR com nome do service externo
- Task 5: API route POST /api/agent/executions/[executionId]/steps/[stepNumber]/execute com auth, validacao params, tenant check, API key decrypt, orchestrator.executeStep, PipelineError (503/500) e erro generico (500)
- Task 6: AgentStepProgress componente com status visual (pending/running/completed/failed), labels PT-BR, Loader2 spinner, CheckCircle2, XCircle. Integrado no AgentChat.tsx (renderiza quando steps.length > 0 via Realtime)
- Task 7: useStepExecution hook com executeStep fetch, response.ok check, TypeError -> toast.error, isExecuting state
- Task 8: 83 testes novos — todos passando. Suite completa: 5745 testes, 0 falhas, 0 regressoes

### File List

**Novos arquivos:**
- src/lib/agent/steps/base-step.ts
- src/lib/agent/steps/search-companies-step.ts
- src/lib/agent/orchestrator.ts
- src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts
- src/components/agent/AgentStepProgress.tsx
- src/hooks/use-step-execution.ts
- __tests__/unit/lib/agent/steps/base-step.test.ts
- __tests__/unit/lib/agent/steps/search-companies-step.test.ts
- __tests__/unit/lib/agent/orchestrator.test.ts
- __tests__/unit/api/agent/executions-steps-execute.test.ts
- __tests__/unit/components/agent/AgentStepProgress.test.tsx
- __tests__/unit/hooks/use-step-execution.test.tsx

**Modificados:**
- src/types/agent.ts
- src/components/agent/AgentChat.tsx
- __tests__/unit/types/agent.test.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-03-26: Story 17.1 implementada — Pipeline Orchestrator, BaseStep, SearchCompaniesStep, API route, AgentStepProgress, useStepExecution. 83 testes novos, 5745 total, 0 regressoes.
- 2026-03-26: Code Review — 8 issues corrigidos (2H, 4M, 2L): H2 supabase redundante em run()/retryStep() removido, H1 retryStep() testes adicionados (4 testes novos), M1 toPipelineError() code dinamico via stepType, M2 step registry com 5 cases explicitos, M3 custo corrigido para companiesCount*3 credits, M4 UUID validation no executionId, L1 toPipelineErrorPublic() removido, L2 TOTAL_STEPS hardcoded removido. 89 testes da story (+6), 5751 total, 0 regressoes.
