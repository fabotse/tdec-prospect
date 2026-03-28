# Story 17.10: Pipeline Flexivel — Entrada Direta em Busca de Leads (Skip Empresas)

Status: done

## Story

As a usuario do Agente TDEC,
I want poder iniciar o pipeline diretamente na busca de leads sem precisar buscar empresas por tecnologia,
So that eu possa prospectar leads por cargo/industria/localizacao sem depender de uma tecnologia especifica como filtro inicial.

## Acceptance Criteria

1. **Given** o usuario inicia o briefing e NAO menciona tecnologia nem deseja buscar empresas
   **When** o agente consolida o briefing e apresenta o resumo
   **Then** o resumo indica claramente: "Etapa de busca de empresas sera pulada — leads serao buscados diretamente por [cargo/industria/localizacao]"
   **And** o usuario confirma ou ajusta antes de prosseguir

2. **Given** o briefing confirmado tem skip de busca de empresas
   **When** o DeterministicOrchestrator monta o pipeline
   **Then** o step `search_companies` recebe status 'skipped'
   **And** o pipeline inicia diretamente no step `search_leads`
   **And** o SearchLeadsStep recebe os parametros de busca (cargos, industria, localizacao) diretamente do briefing em vez de depender do output do step anterior

3. **Given** o step de busca de empresas foi pulado
   **When** o SearchLeadsStep executa
   **Then** a busca no Apollo usa os filtros do briefing (jobTitles obrigatorio + industry e/ou location)
   **And** NAO depende de uma lista de empresas previa — busca leads no mercado aberto
   **And** o resultado segue o mesmo formato de output (leads com empresa associada)

4. **Given** o pipeline pulou o step de empresas
   **When** o AgentStepProgress renderiza
   **Then** o step de empresas aparece como 'skipped' com visual distinto
   **And** a numeracao reflete "Etapa 1 de 4" (em vez de 5)
   **And** os demais steps (leads, campanha, export, ativacao) seguem normalmente

## Tasks / Subtasks

- [x] Task 1: Atualizar BriefingParserService para detectar skip de empresas (AC: #1)
  - [x] 1.1 Em `src/lib/agent/briefing-parser-service.ts`, atualizar `SYSTEM_PROMPT` para incluir regra explicita:
    ```
    - Se o usuario NAO mencionar tecnologia e nao quiser buscar empresas por tech, adicione "search_companies" no skipSteps.
    - Se o usuario pedir busca direta por cargos/industria/localizacao sem tecnologia, adicione "search_companies" no skipSteps.
    ```
  - [x] 1.2 NAO alterar o schema Zod nem a interface `ParsedBriefing` — skipSteps ja aceita `string[]` e o parser ja retorna o campo
  - [x] 1.3 Testes: `__tests__/unit/lib/agent/briefing-parser-service.test.ts` — adicionar testes mock com cenarios onde a resposta do OpenAI inclui `skipSteps: ["search_companies"]` (nao testar OpenAI real, testar o fluxo com resultado mockado)

- [x] Task 2: Atualizar resumo do briefing para indicar skip (AC: #1)
  - [x] 2.1 Em `src/hooks/use-briefing-flow.ts`, na funcao `generateBriefingSummary()`, detectar se `briefing.skipSteps` inclui `"search_companies"`:
    - Se sim, adicionar ao resumo: `"Etapa de busca de empresas sera pulada — leads serao buscados diretamente por [parametros do briefing]."`
    - Montar a descricao dos parametros dinamicamente a partir de `briefing.jobTitles`, `briefing.industry`, `briefing.location`
  - [x] 2.2 A nota existente "Sem tecnologia especifica — busca mais ampla por industria/localizacao" (line 165) ja aparece quando technology=null. Adicionar a nota de skip ALEM da nota de tecnologia ausente, nao em substituicao
  - [x] 2.3 Testes: `__tests__/unit/hooks/use-briefing-flow.test.ts` — testar `generateBriefingSummary` com briefing contendo `skipSteps: ["search_companies"]`

- [x] Task 3: Corrigir orchestrator para permitir step sem previousStepOutput (AC: #2)
  - [x] 3.1 Em `src/lib/agent/orchestrator.ts`, no bloco `if (stepNumber > 1)` (lines 123-149):
    - **PROBLEMA ATUAL**: Query busca prevStep com `in("status", ["completed", "approved"])`. Quando step 1 esta `"skipped"`, nenhum prevStep e encontrado e o orchestrator lanca `ORCHESTRATOR_STEP_NOT_READY`
    - **SOLUCAO**: Quando a query nao encontra prevStep com status completed/approved, verificar se TODOS os steps anteriores estao skipped. Se sim, permitir `previousStepOutput = undefined` em vez de lancar erro
    - **IMPLEMENTACAO**:
      ```typescript
      if (!prevStep?.output) {
        // Check if all previous steps are skipped
        const { data: prevSteps } = await this.supabase
          .from("agent_steps")
          .select("status")
          .eq("execution_id", executionId)
          .lt("step_number", stepNumber);

        const allSkipped = prevSteps?.every((s) => s.status === "skipped") ?? false;
        if (!allSkipped) {
          throw this.createPipelineError(
            "ORCHESTRATOR_STEP_NOT_READY",
            "Step anterior nao concluido",
            stepNumber,
            stepType
          );
        }
        // All previous skipped — previousStepOutput stays undefined
      }
      ```
  - [x] 3.2 Testes: `__tests__/unit/lib/agent/orchestrator.test.ts` — adicionar cenario: step 1 skipped, step 2 executa com previousStepOutput=undefined

- [x] Task 4: Refatorar SearchLeadsStep para aceitar busca direta do briefing (AC: #3)
  - [x] 4.1 Em `src/lib/agent/steps/search-leads-step.ts`, refatorar `executeInternal()`:
    - **FLUXO 1 (Normal)**: `previousStepOutput` existe e tem `companies[]` → extrair domains, buscar leads por domains + jobTitles (comportamento atual, MANTER INTACTO)
    - **FLUXO 2 (Direct Entry)**: `previousStepOutput` e undefined (step anterior skipped) → buscar leads direto no Apollo usando filtros do briefing:
      - `titles: briefing.jobTitles` (OBRIGATORIO — ja validado acima)
      - `locations: briefing.location ? [briefing.location] : undefined`
      - `industries: briefing.industry ? [briefing.industry] : undefined` (Apollo usa como keywords, ver `buildQueryString` em apollo.ts lines 335-345)
      - `companySizes: briefing.companySize ? [briefing.companySize] : undefined`
      - `domains`: NAO incluir — busca no mercado aberto
  - [x] 4.2 Atualizar mensagem de progresso:
    - Fluxo normal: `"Etapa X/Y: Buscando leads (cargos) nas Z empresas..."` (existente)
    - Fluxo direct entry: `"Etapa X/Y: Buscando leads (cargos) no mercado aberto..."` — sem mencionar empresas
    - Usar `activeSteps` count no total em vez de hardcoded `/5` (atual line 59 hardcoda `/5`)
  - [x] 4.3 O output do SearchLeadsStep DEVE manter o mesmo formato `SearchLeadsOutput`:
    - `leads: SearchLeadResult[]` — Apollo retorna `companyName` mesmo sem filtro de dominio
    - `totalFound: number`
    - `jobTitles: string[]`
    - `domainsSearched: string[]` — no fluxo direct entry, sera `[]` (array vazio)
  - [x] 4.4 NAO alterar `SearchLeadResult`, `SearchLeadsOutput` ou `StepOutput` em `types/agent.ts` — o formato ja suporta ambos os fluxos
  - [x] 4.5 Testes: `__tests__/unit/lib/agent/steps/search-leads-step.test.ts`:
    - Teste: direct entry com previousStepOutput undefined — busca Apollo sem domains
    - Teste: direct entry com jobTitles + location + industry — filters corretos
    - Teste: direct entry sem jobTitles → erro (jobTitles e obrigatorio)
    - Teste: direct entry output tem domainsSearched = []
    - Teste: fluxo normal com previousStepOutput com companies — comportamento identico ao existente (regressao)

- [x] Task 5: Atualizar PlanGeneratorService para descricao adaptada (AC: #2)
  - [x] 5.1 Em `src/lib/services/agent-plan-generator.ts`, atualizar `descriptionFn` do step `search_leads` (line 35-37):
    ```typescript
    descriptionFn: (b) => {
      if (b.skipSteps?.includes("search_companies")) {
        const filters = [
          b.jobTitles.length > 0 ? b.jobTitles.join(", ") : null,
          b.industry,
          b.location,
        ].filter(Boolean).join(" + ");
        return `Buscar leads diretamente por ${filters || "cargos"} (sem filtro de empresa)`;
      }
      return b.jobTitles.length > 0
        ? `Encontrar ${b.jobTitles.join(", ")} nas empresas via Apollo`
        : "Encontrar contatos nas empresas via Apollo";
    }
    ```
  - [x] 5.2 Testes: `__tests__/unit/lib/services/agent-plan-generator.test.ts` — cenario com `skipSteps: ["search_companies"]` verifica descricao adaptada

- [x] Task 6: Testes de integracao do fluxo completo (AC: #1-#4)
  - [x] 6.1 Teste E2E-style unitario: briefing sem tecnologia → skipSteps inclui search_companies → plano gerado com step 1 skipped → orchestrator executa step 2 com previousStepOutput=undefined → SearchLeadsStep busca leads no mercado aberto → output correto
  - [x] 6.2 Verificar que o `AgentStepProgress` ja renderiza corretamente (Story 17.7 ja implementou: skipped steps com line-through, activeSteps exclui skipped, numeracao dinamica) — NAO precisa de alteracao no componente, apenas validar

## Dev Notes

### Padrao de Codigo Estabelecido
- **CSS**: Usar `flex flex-col gap-*` em vez de `space-y-*` (Tailwind v4 + Radix)
- **Idioma UI**: Portugues (BR) para todas as mensagens e labels
- **Testes**: Vitest, mocks centralizados em test utils, mirror de `src/` em `__tests__/unit/`
- **ESLint**: `no-console` enforced — usar logger ou remover console.log

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/lib/agent/briefing-parser-service.ts` | Atualizar SYSTEM_PROMPT para skipSteps auto |
| `src/hooks/use-briefing-flow.ts` | Nota de skip no resumo do briefing |
| `src/lib/agent/orchestrator.ts` | Permitir previousStepOutput undefined quando all prev skipped |
| `src/lib/agent/steps/search-leads-step.ts` | Dual flow: normal (domains) vs direct entry (briefing filters) |
| `src/lib/services/agent-plan-generator.ts` | Descricao adaptada para search_leads quando skip empresas |

### Arquivos de Teste a Criar/Atualizar

| Arquivo | Tipo |
|---------|------|
| `__tests__/unit/lib/agent/briefing-parser-service.test.ts` | Atualizar (cenarios de skipSteps) |
| `__tests__/unit/hooks/use-briefing-flow.test.ts` | Atualizar (resumo com skip) |
| `__tests__/unit/lib/agent/orchestrator.test.ts` | Atualizar (prev all-skipped) |
| `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` | Atualizar (dual flow) |
| `__tests__/unit/lib/services/agent-plan-generator.test.ts` | Atualizar (descricao adaptada) |

### Arquivos que NAO Precisam Mudar
- `src/types/agent.ts` — `ParsedBriefing.skipSteps` ja e `string[]`, `SearchLeadsOutput.domainsSearched` aceita `[]`
- `src/components/agent/AgentStepProgress.tsx` — Story 17.7 ja implementou visual de skipped (line-through, SkipForward icon, numeracao dinamica)
- `src/components/agent/AgentApprovalGate.tsx` — Gate de leads funciona igual independente da origem
- `src/lib/services/apollo.ts` — `ApolloSearchFilters.domains` ja e opcional; `industries` vira keywords; `locations` ja suportado

### Bug Critico a Resolver (Task 3)
O orchestrator.ts lines 123-149 busca previousStepOutput com `in("status", ["completed", "approved"])`. Quando step 1 (search_companies) e skipped, a query nao encontra nenhum resultado e lanca `ORCHESTRATOR_STEP_NOT_READY`. Isso BLOQUEIA completamente o fluxo de direct entry. A Task 3 corrige isso verificando se todos os steps anteriores estao skipped.

### Apollo API — Open-Market Search
`ApolloSearchFilters` em `src/types/apollo.ts`:
- `domains?: string[]` — OPCIONAL. Sem domains = busca no mercado aberto (todos os dominios)
- `titles?: string[]` — mapeia para `person_titles[]` na API
- `locations?: string[]` — mapeia para `person_locations[]`
- `industries?: string[]` — combinada com `keywords` em `buildQueryString()` (lines 335-345 de apollo.ts), enviada como `q_keywords`
- `companySizes?: string[]` — mapeia para `organization_num_employees_ranges[]` (converte "50-200" para "50,200")

### Learnings da Story 17.9
- Fluxo do approve: ExportStep executa → salva awaiting_approval → usuario aprova → approve route faz merge de approvedData no output → orchestrator passa output como previousStepOutput pro proximo step
- Padrao de selectedAccounts funciona via merge no approve — relevante para entender que approvedLeads (Story 17.5) tb passa por esse caminho
- Story 17.9 criou 65 testes, 9 code review issues fixados

### Git Intelligence (Ultimos commits relevantes)
- `4c45941` fix(story-17.9): add accounts to campaign when activation is deferred
- `06962bd` feat(story-17.9): selecao de conta Instantly no export + code review fixes
- `5917f32` feat(story-17.8): briefing flow updates + suggestion service test fixes
- `045ec7c` feat(story-17.8): briefing conversacional inteligente + code review fixes

### Project Structure Notes
- Alinhamento com estrutura unificada: steps em `src/lib/agent/steps/`, services em `src/lib/services/`, hooks em `src/hooks/`, tipos em `src/types/`
- Nao criar novos arquivos — todas as mudancas sao em arquivos existentes

### References
- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Epic 17 Story 10]
- [Source: _bmad-output/planning-artifacts/architecture.md#Pipeline Execution]
- [Source: src/lib/agent/orchestrator.ts#shouldSkip, executeStep]
- [Source: src/lib/agent/steps/search-leads-step.ts#executeInternal]
- [Source: src/lib/agent/briefing-parser-service.ts#SYSTEM_PROMPT]
- [Source: src/hooks/use-briefing-flow.ts#generateBriefingSummary]
- [Source: src/lib/services/agent-plan-generator.ts#PIPELINE_STEPS]
- [Source: src/types/apollo.ts#ApolloSearchFilters]
- [Source: src/lib/services/apollo.ts#buildQueryString]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Full test suite: 351 files, 6009 tests passed, 0 failures, 2 skipped

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-03-27
**Outcome:** Approved with fixes applied

**Issues Found:** 3 CRITICAL, 2 MEDIUM, 4 LOW
**Issues Fixed:** 8 (3 CRITICAL + 2 MEDIUM + 3 LOW)
**Issues Noted:** 1 LOW (test helper `createInput` JS default param semantics — not fixable without overcomplicating)

**Fixes Applied:**
1. **MEDIUM** `search-leads-step.ts`: Extracted `buildSearchOutput` private method — eliminates ~30 lines of duplicated lead mapping, cost calc, and return structure between normal and direct entry flows
2. **MEDIUM** `search-leads-step.ts`: Replaced `Record<string, unknown>` with spread syntax `...(condition ? {key: val} : {})` — restores compile-time type safety for Apollo filters
3. **LOW** `search-leads-step.ts`: Extracted `LEADS_PER_PAGE = 25` constant — removes magic number duplication
4. **LOW** `orchestrator.ts`: Added defensive `prevSteps.length > 0` check — `[].every()` returns `true` which could incorrectly allow execution on empty arrays
5. **LOW** `use-briefing-flow.test.tsx`: Added test for skip summary fallback "cargos" when all params (jobTitles, industry, location) are empty/null
6. **CRITICAL** `plan/route.ts`: Validacao `!briefing.technology` bloqueava direct entry (technology=null). Corrigido para permitir plan quando briefing tem jobTitles (direct entry) OU technology (normal flow). Teste adicionado + teste existente atualizado.
7. **CRITICAL** `confirm/route.ts`: Mesma validacao `!briefing.technology` bloqueava confirmacao. 3 bugs corrigidos: (a) validacao, (b) so inseria activeSteps — steps skipped nao existiam no DB, (c) `total_steps=activeSteps.length` em vez de `steps.length` quebrava deteccao do ultimo step pelo orchestrator.
8. **CRITICAL** `use-auto-trigger.ts`: Hook so funcionava em autopilot mode. Em guided mode, step skipped nao triggava o proximo step. Corrigido para auto-trigger apos skipped steps em ambos os modos.

**Test Suite Post-Review:** 351 files, 6012 tests, 0 failures, 2 skipped

### Completion Notes List
- Task 1: SYSTEM_PROMPT atualizado com regras de skipSteps para search_companies. 3 testes adicionados (15 total no arquivo).
- Task 2: generateBriefingSummary agora inclui nota de skip alem da nota de tecnologia ausente. 1 teste adicionado (34 total no arquivo).
- Task 3: Orchestrator corrigido — quando todos os steps anteriores estao skipped, permite previousStepOutput=undefined. Bug do ORCHESTRATOR_STEP_NOT_READY resolvido. 2 testes adicionados, 1 teste existente atualizado (39 total).
- Task 4: SearchLeadsStep refatorado com dual flow (normal + direct entry). Progress message usa contagem dinamica de activeSteps. 7 testes adicionados, 1 teste atualizado (18 total).
- Task 5: descriptionFn do search_leads adaptada para mostrar filtros do briefing quando skip. 4 testes adicionados (13 total).
- Task 6: Teste de integracao criado validando fluxo completo. AgentStepProgress confirmado ja suportar visual de skipped (Story 17.7). 4 testes criados.

### File List
**Arquivos modificados:**
- `src/lib/agent/briefing-parser-service.ts` — SYSTEM_PROMPT com regras de skipSteps
- `src/hooks/use-briefing-flow.ts` — nota de skip no resumo do briefing
- `src/lib/agent/orchestrator.ts` — permite previousStepOutput=undefined quando all prev skipped + defensive empty array check
- `src/lib/agent/steps/search-leads-step.ts` — dual flow (normal + direct entry) + buildSearchOutput extraido + LEADS_PER_PAGE const + spread filters
- `src/lib/services/agent-plan-generator.ts` — descricao adaptada para search_leads com skip
- `src/app/api/agent/executions/[executionId]/plan/route.ts` — validacao de briefing permite direct entry sem technology
- `src/app/api/agent/executions/[executionId]/confirm/route.ts` — validacao + insere ALL steps + total_steps correto
- `src/hooks/use-auto-trigger.ts` — auto-trigger apos skipped steps em guided mode

**Testes modificados:**
- `__tests__/unit/lib/agent/briefing-parser-service.test.ts` — +3 testes skipSteps
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — +2 testes skip summary (inc. fallback "cargos")
- `__tests__/unit/api/agent/execution-plan.test.ts` — teste atualizado (400 sem tech NEM jobTitles) + teste direct entry 200
- `__tests__/unit/api/agent/execution-confirm.test.ts` — teste atualizado (400 sem tech NEM jobTitles) + teste direct entry 200 + teste ALL steps inserted
- `__tests__/unit/hooks/use-auto-trigger.test.ts` — teste guided+skipped auto-trigger + teste existente atualizado
- `__tests__/unit/lib/agent/orchestrator.test.ts` — +2 testes all-prev-skipped, 1 atualizado
- `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` — +7 testes direct entry, 1 atualizado
- `__tests__/unit/lib/services/agent-plan-generator.test.ts` — +4 testes descricao adaptada

**Testes criados:**
- `__tests__/unit/lib/agent/direct-entry-integration.test.ts` — 4 testes integracao
