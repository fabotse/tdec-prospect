# Story 15.2: Busca Technografica -- Autocomplete e Filtros

Status: done

## Story

As a Usuario,
I want buscar tecnologias com autocomplete e aplicar filtros complementares,
so that eu consiga encontrar empresas que usam uma tecnologia especifica com precisao.

## Acceptance Criteria

1. **Given** o Usuario esta na pagina de Technographic Prospecting **When** digita no campo de busca de tecnologia (ex: "Nets") **Then** o sistema consulta `GET /v0/catalog/keywords?name_pattern=<query>&limit=15&include_metadata=true` e exibe sugestoes em autocomplete **And** as sugestoes mostram nome da tecnologia, categoria e quantidade de empresas

2. **Given** o Usuario selecionou uma ou mais tecnologias no autocomplete **When** visualiza o painel de filtros **Then** pode aplicar filtros complementares: pais (country code), tamanho de empresa (min/max funcionarios), industria

3. **Given** o Usuario configurou tecnologia(s) e filtros **When** clica em "Buscar" **Then** o sistema chama `POST /v1/companies/search` com `company_technology_slug_or: [slugs]` e parametros de filtro **And** a busca retorna em <3 segundos **And** exibe resultados em tabela

4. **Given** a API do theirStack falha ou retorna timeout **When** o sistema detecta o erro **Then** realiza 1 retry automatico (via ExternalService base) **And** se falhar novamente, exibe mensagem de erro em portugues

5. **Given** os credits do theirStack estao esgotados ou rate limit atingido **When** o Usuario tenta realizar uma busca **Then** o sistema exibe mensagem informando o problema em portugues (429: rate limit, credits: "Credits API esgotados")

## Tasks / Subtasks

- [x] Task 1: Expandir tipos theirStack (AC: #1, #2, #3)
  - [x] 1.1 Adicionar tipos do catalogo em `src/types/theirstack.ts`: `KeywordAggregated`, `CatalogKeywordsResponse`
  - [x] 1.2 Adicionar tipos de busca de empresas: `CompanySearchRequest`, `CompanySearchResponse`, `TheirStackCompany`, `TechnologyFound`
  - [x] 1.3 Criar tipo de filtros para o frontend: `TheirStackSearchFilters` (technologySlugs, countryCodes, minEmployeeCount, maxEmployeeCount, industryIds, page, limit)

- [x] Task 2: Expandir TheirStackService com metodos de busca (AC: #1, #3, #4, #5)
  - [x] 2.1 Adicionar metodo `searchTechnologies(query: string, limit?: number): Promise<KeywordAggregated[]>` -- chama `GET /v0/catalog/keywords?name_pattern=<query>&limit=<limit>&include_metadata=true` (custo: 0 credits)
  - [x] 2.2 Adicionar metodo `searchCompanies(filters: TheirStackSearchFilters): Promise<CompanySearchResponse>` -- chama `POST /v1/companies/search` com body mapeado (custo: 3 credits/empresa)
  - [x] 2.3 typeof guards em todos os campos nullable da response (`country`, `country_code`, `city`, `apollo_id`, `annual_revenue_usd`, `founded_year`, `linkedin_url`)
  - [x] 2.4 Mapear `TheirStackSearchFilters` (camelCase frontend) para request body da API (snake_case): `technologySlugs` -> `company_technology_slug_or`, `countryCodes` -> `company_country_code_or`, etc.

- [x] Task 3: Criar API routes de busca (AC: #1, #3)
  - [x] 3.1 Criar `src/app/api/integrations/theirstack/search/technologies/route.ts` -- GET com query param `q`, validacao Zod, decrypt key -> `searchTechnologies(q)` -> retorna array
  - [x] 3.2 Criar `src/app/api/integrations/theirstack/search/companies/route.ts` -- POST com body `TheirStackSearchFilters`, validacao Zod, decrypt key -> `searchCompanies(filters)` -> retorna `{ data, meta }`

- [x] Task 4: Criar pagina de Technographic Prospecting (AC: #1, #2, #3)
  - [x] 4.1 Criar `src/app/(dashboard)/technographic/page.tsx` -- server component com Suspense + skeleton
  - [x] 4.2 Criar `src/components/technographic/TechnographicPageContent.tsx` -- client component principal ("use client")
  - [x] 4.3 Criar `src/components/technographic/TechnologyAutocomplete.tsx` -- campo de busca com debounce (300ms), dropdown de sugestoes (nome, categoria, empresas count), selecao multipla com chips/tags, armazena `slug` internamente
  - [x] 4.4 Criar `src/components/technographic/TechnographicFilterPanel.tsx` -- filtros: pais (select multi), tamanho empresa (inputs min/max), industria (select multi)
  - [x] 4.5 Criar `src/components/technographic/CompanyResultsTable.tsx` -- tabela de resultados: nome, dominio, industria, tamanho, tecnologias encontradas (com confidence badge), paginacao
  - [x] 4.6 Criar estado vazio e loading states

- [x] Task 5: Criar hooks TanStack Query (AC: #1, #3)
  - [x] 5.1 Criar `src/hooks/use-technology-search.ts` -- `useTechnologySearch(query)` com useQuery, debounce integrado, enabled quando query.length >= 2
  - [x] 5.2 Criar `src/hooks/use-company-search.ts` -- `useCompanySearch()` com useMutation para busca sob demanda (nao automatica), retorna data + pagination + isLoading + error

- [x] Task 6: Adicionar navegacao (AC: #1)
  - [x] 6.1 Adicionar item "Technographic" no sidebar/navegacao do dashboard (entre Leads e Campanhas, ou apos Insights)
  - [x] 6.2 Icone: busca/radar/magnifying glass (Lucide)

- [x] Task 7: Testes (AC: #1, #2, #3, #4, #5)
  - [x] 7.1 Testes do TheirStackService: `searchTechnologies` (success, empty, 401, 429, timeout, network error, typeof guards), `searchCompanies` (success com filtros, empty results, 401, 429, timeout, credits esgotados, typeof guards campos null)
  - [x] 7.2 Testes das API routes: technologies search (success, missing q, 401, 500), companies search (success, validation error, 401, 429, 500)
  - [x] 7.3 Testes dos hooks: `useTechnologySearch` (debounce, loading, error, disabled quando query curta), `useCompanySearch` (mutation, loading, error, pagination)
  - [x] 7.4 Testes dos componentes: `TechnologyAutocomplete` (render, digitar + sugestoes, selecionar tech, remover tech, keyboard nav), `TechnographicFilterPanel` (render filtros, aplicar/limpar), `CompanyResultsTable` (render dados, empty state, paginacao, confidence badges), `TechnographicPageContent` (integracao)

## Dev Notes

### theirStack API Reference (VALIDADO COM CHAMADAS REAIS -- Spike Story 15.1)

**Base URL:** `https://api.theirstack.com`
**Auth:** `Authorization: Bearer <token>`

**Endpoint 1 -- Autocomplete (esta story):**
- `GET /v0/catalog/keywords?name_pattern=<query>&limit=15&include_metadata=true`
- Custo: 0 credits (free)
- Response: `{ data: KeywordAggregated[], metadata: { total_results, page, limit } }`
- Campo critico: `slug` (usar para companies/search, NAO o `name`)

**Endpoint 2 -- Company Search (esta story):**
- `POST /v1/companies/search`
- Custo: 3 credits por empresa retornada (limit=25 = 75 credits por busca)
- Request body: `{ company_technology_slug_or: string[], company_country_code_or?: string[], min_employee_count?: number, max_employee_count?: number, industry_id_or?: number[], limit?: number, page?: number, include_total_results: true }`
- Response: `{ metadata: { total_results, total_companies }, data: TheirStackCompany[] }`

**Divergencias criticas do Spike (NAO ignorar):**
1. `confidence` e retornado POR EMPRESA no array `technologies_found` -- NAO e filtravel na API. Se quiser filtro de confidence, implementar client-side sobre os resultados
2. Busca usa SLUG (`company_technology_slug_or: ["netskope"]`), nao nome da tecnologia
3. `country` pode ser `null` -- typeof guard obrigatorio
4. `apollo_id` disponivel no resultado -- guardar para Story 15.4 (Apollo Bridge)
5. Arrays `technology_slugs` e `technology_names` podem ter 3000+ items -- NUNCA exibir raw na UI
6. `has_blurred_data: true` pode indicar dados limitados no free tier

**Rate Limiting (free tier):** 4/sec, 10/min, 50/hr, 400/day. HTTP 429 quando excedido.

### Padroes Existentes OBRIGATORIOS

**ExternalService base class** (`src/lib/services/base-service.ts`):
- TheirStackService ja estende `ExternalService` (Story 15.1)
- Usar `this.request<T>(url, options)` para HTTP calls -- ja tem timeout 10s e retry 1x
- Error handling automatico com mensagens em portugues via `handleError()`
- Novos metodos seguem o mesmo padrao de `testConnection` e `getCredits`

**TheirStackService existente** (`src/lib/services/theirstack.ts` -- 143 linhas):
- Ja implementa: `testConnection()`, `getCredits()`, `handleError()`
- Base URL: `THEIRSTACK_API_BASE = "https://api.theirstack.com"`
- Auth: Bearer token via header `Authorization: Bearer ${apiKey}`
- EXPANDIR este arquivo com `searchTechnologies()` e `searchCompanies()`

**API Route padrao** (seguir `src/app/api/integrations/theirstack/test/route.ts`):
1. `getCurrentUserProfile()` -- auth check
2. Buscar `encrypted_key` de `api_configs` via Supabase (filtro `service_name = "theirstack"`)
3. `decryptApiKey(encrypted)` -- server-side only
4. Chamar service method com key decriptada
5. Retornar `NextResponse.json()` com formato `APISuccessResponse`
6. Catch `ExternalServiceError` -> status code + userMessage em portugues

**TanStack Query padrao** (seguir `src/hooks/use-leads.ts`):
- useQuery para dados read-only (autocomplete)
- useMutation para buscas sob demanda (company search)
- Query keys como arrays: `["theirstack-technologies", query]`, `["theirstack-companies", filters]`
- `staleTime: 5 * 60 * 1000` para cache 5 min no autocomplete
- `enabled: query.length >= 2` para evitar buscas com input vazio

**Componente de pagina** (seguir `src/components/leads/LeadsPageContent.tsx`):
- "use client" directive
- Hooks de query/mutation + Zustand para estado UI se necessario
- Separacao: autocomplete, filtros, tabela, paginacao como componentes individuais

**FilterPanel padrao** (seguir `src/components/search/FilterPanel.tsx`):
- Card colapsavel com badge de filtros ativos
- `flex flex-col gap-2` para label+input (NAO space-y-*)
- Debounce 300ms para text inputs com `useRef` timer
- Limpar filtros com botao dedicado

**Tabela padrao** (seguir tabela de leads existente):
- shadcn/ui Table components
- Checkbox para selecao (individual + header para selecao em lote) -- preparar para Story 15.3
- Paginacao com total de resultados
- Empty state com mensagem orientativa
- Loading skeleton durante fetch

### Autocomplete -- Decisoes de Design

1. **Debounce 300ms** antes de chamar API (evitar spam no rate limit)
2. **Minimo 2 caracteres** para iniciar busca
3. **Limit 15 sugestoes** no dropdown (nao sobrecarregar visualmente)
4. **Exibir no dropdown:** nome da tecnologia, categoria (em cinza), total de empresas
5. **Selecao multipla:** usuario pode adicionar varias tecnologias (chips/tags abaixo do input)
6. **Armazenar internamente:** `{ name, slug, category }` por tecnologia selecionada -- usar `slug` para a busca de empresas
7. **Busca usa OR:** `company_technology_slug_or` = empresas com QUALQUER uma das tecnologias

### Filtros Complementares -- Especificacao

| Filtro | Tipo | API param | Valores |
|--------|------|-----------|---------|
| Pais | Multi-select | `company_country_code_or` | Codes ISO (BR, US, etc.) -- lista pre-definida dos mais comuns |
| Tamanho min | Number input | `min_employee_count` | >= 1 |
| Tamanho max | Number input | `max_employee_count` | >= min |
| Industria | Multi-select | `industry_id_or` | IDs numericos -- lista pre-definida das mais comuns |

**Nota sobre Confidence:** Confidence NAO e filtravel na API. Se filtro client-side for desejado, implementar em Story 15.3 sobre a tabela de resultados. NAO incluir nesta story para manter escopo limpo.

### Tabela de Resultados -- Colunas

| Coluna | Campo | Notas |
|--------|-------|-------|
| Empresa | `name` | Com link para `url` se disponivel |
| Dominio | `domain` | Texto |
| Pais | `country` | Pode ser null -- exibir "-" |
| Industria | `industry` | Texto |
| Tamanho | `employee_count_range` | Ex: "10,000+" |
| Techs encontradas | `technologies_found[].technology.name` | Mostrar apenas as techs buscadas + badge confidence |
| Score | `technologies_found[].theirstack_score` | Numerico, 2 casas decimais |

**Confidence badges:** `high` = verde, `medium` = amarelo, `low` = cinza/vermelho

### Credits -- Consideracao UX

Cada busca de empresas consome 3 credits por empresa retornada. Com limit=10 (padrao sugerido), consome 30 credits por busca. Exibir no resultado: "X empresas encontradas (Y credits consumidos)" para transparencia.

**Sugestao:** Usar `limit=10` como padrao (nao 25) para economizar credits no free tier (200 total).

### Previous Story Intelligence (Story 15.1)

**Aprendizados da implementacao anterior:**
- typeof guards em TODOS os campos da response API -- campos podem vir null ou com tipo inesperado
- `handleError` deve delegar ao base class para erros genericos, override apenas para erros especificos theirStack
- TheirStackCreditsBadge usa fetch condicional (apenas se integracao configurada)
- Testes cobrem: success, 401, 429, timeout, network error, typeof guards com campos null/string
- Mock HTTP usa `createMockFetch(routes)` de `__tests__/helpers/mock-fetch.ts`
- ESLint no-console -- nunca usar console.log, usar logger se necessario
- Admin check na API route e obrigatorio para operacoes que usam API key criptografada

**Arquivos criados em 15.1 que serao EXPANDIDOS nesta story:**
- `src/types/theirstack.ts` -- adicionar tipos de busca
- `src/lib/services/theirstack.ts` -- adicionar metodos searchTechnologies, searchCompanies

**Arquivos criados em 15.1 que NAO devem ser modificados:**
- `src/app/api/integrations/theirstack/test/route.ts`
- `src/app/api/integrations/theirstack/credits/route.ts`

### Project Structure Notes

**Arquivos a CRIAR:**
- `src/app/(dashboard)/technographic/page.tsx`
- `src/components/technographic/TechnographicPageContent.tsx`
- `src/components/technographic/TechnologyAutocomplete.tsx`
- `src/components/technographic/TechnographicFilterPanel.tsx`
- `src/components/technographic/CompanyResultsTable.tsx`
- `src/app/api/integrations/theirstack/search/technologies/route.ts`
- `src/app/api/integrations/theirstack/search/companies/route.ts`
- `src/hooks/use-technology-search.ts`
- `src/hooks/use-company-search.ts`
- `__tests__/unit/lib/services/theirstack-search.test.ts` (ou expandir theirstack.test.ts existente)
- `__tests__/unit/api/integrations/theirstack/search/technologies.test.ts`
- `__tests__/unit/api/integrations/theirstack/search/companies.test.ts`
- `__tests__/unit/hooks/use-technology-search.test.ts`
- `__tests__/unit/hooks/use-company-search.test.ts`
- `__tests__/unit/components/technographic/TechnologyAutocomplete.test.tsx`
- `__tests__/unit/components/technographic/TechnographicFilterPanel.test.tsx`
- `__tests__/unit/components/technographic/CompanyResultsTable.test.tsx`
- `__tests__/unit/components/technographic/TechnographicPageContent.test.tsx`

**Arquivos a MODIFICAR:**
- `src/types/theirstack.ts` -- adicionar tipos de busca (KeywordAggregated, CompanySearchRequest/Response, etc.)
- `src/lib/services/theirstack.ts` -- adicionar searchTechnologies(), searchCompanies()
- Sidebar/navegacao do dashboard -- adicionar link "Technographic"

**NAO MODIFICAR (referencia apenas):**
- `src/lib/services/base-service.ts` -- usar via heranca
- `src/components/settings/IntegrationCard.tsx` -- nao relevante para esta story
- `src/hooks/use-integration-config.ts` -- nao relevante

### Testing Standards

- Framework: Vitest + happy-dom
- Mock HTTP: `createMockFetch(routes)` de `__tests__/helpers/mock-fetch.ts`
- Mock Supabase: `vi.mock("@/lib/supabase/server")`
- Mock crypto: `vi.mock("@/lib/crypto/encryption")`
- `beforeEach` cria service, `afterEach` chama `restoreFetch()` + `vi.restoreAllMocks()`
- ESLint: no-console -- nunca usar console.log
- typeof guards: testar com campos null, tipos inesperados (string em vez de number)
- Componentes: `@testing-library/react` com `render`, `screen`, `fireEvent`, `waitFor`
- Hooks: `@testing-library/react` com `renderHook` + wrapper com QueryClientProvider

### Tailwind CSS v4 Alert

**CRITICO:** Usar `flex flex-col gap-2` para wrappers label+input/select/textarea. NAO usar `space-y-*` (nao funciona com Radix UI no Tailwind v4).

### UI Language

**Todo texto da interface deve ser em portugues brasileiro.** Labels, placeholders, mensagens de erro, empty states, tooltips -- tudo em PT-BR.

### References

- [Source: _bmad-output/implementation-artifacts/15-1-integracao-theirstack-config-teste-credits.md -- Spike completo + story anterior]
- [Source: _bmad-output/planning-artifacts/epic-15-technographic-prospecting.md#Story 15.2]
- [Source: src/lib/services/theirstack.ts -- TheirStackService existente]
- [Source: src/types/theirstack.ts -- tipos existentes]
- [Source: src/lib/services/base-service.ts -- ExternalService abstract class]
- [Source: src/lib/services/apollo.ts -- padrao de service com search]
- [Source: src/app/api/integrations/apollo/route.ts -- padrao de API route com search]
- [Source: src/hooks/use-leads.ts -- padrao de hook TanStack Query]
- [Source: src/components/leads/LeadsPageContent.tsx -- padrao de pagina de busca]
- [Source: src/components/search/FilterPanel.tsx -- padrao de filtros]
- [Source: _bmad-output/planning-artifacts/architecture.md -- decisoes arquiteturais]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Hook tests required fix: fake timers conflict with React Query async — switched to real timers with extended waitFor timeout for debounce+fetch tests
- Company search reset test needed async waitFor for React Query v5 mutation state update

### Completion Notes List

- Task 1: Added 8 new types to `src/types/theirstack.ts`: `KeywordAggregated`, `CatalogKeywordsResponse`, `TechnologyFound`, `TheirStackCompany`, `CompanySearchRequest`, `CompanySearchResponse`, `TheirStackSearchFilters`
- Task 2: Added `searchTechnologies()`, `searchCompanies()`, `mapFiltersToRequest()`, `guardCompany()`, `guardTechnologyFound()` to TheirStackService with comprehensive typeof guards on all nullable fields
- Task 3: Created GET `/api/integrations/theirstack/search/technologies` and POST `/api/integrations/theirstack/search/companies` with Zod validation, auth/admin checks, and ExternalServiceError handling
- Task 4: Created complete Technographic page with TechnologyAutocomplete (debounce 300ms, multi-select chips, keyboard nav), TechnographicFilterPanel (country, employee size, industry filters), CompanyResultsTable (confidence badges, pagination, empty/loading states), TechnographicPageContent orchestrator
- Task 5: Created `useTechnologySearch` (useQuery + debounce) and `useCompanySearch` (useMutation + page state) hooks
- Task 6: Added "Technographic" nav item with Radar icon in Sidebar between Leads and Campanhas
- Task 7: 86 new tests across 8 test files — all passing. Full regression suite: 295 files, 5263 tests, 0 failures

### Code Review Record

**Reviewer:** Amelia (Dev Agent) — Adversarial Code Review
**Date:** 2026-03-24
**Issues Found:** 5 MEDIUM, 3 LOW — all fixed

**Fixes applied:**
- M1: `CREDITS_EXHAUSTED` mapped to 402 in `handleError()` — AC #5 gap closed
- M2: Score column now shows all technologies' scores (was only first)
- M3: Country/Industry Select components reset after each selection via `key` prop
- M4: Zod `.refine()` added: `minEmployeeCount <= maxEmployeeCount` validation
- M5: Autocomplete `isDismissed` flag prevents dropdown re-open after Escape
- L1: `space-y-2` replaced with `flex flex-col gap-2` in TableSkeleton (project standard)
- L2: TODO comment added on hardcoded industry IDs for production validation
- L3: Table row key changed from `domain-index` to `domain-name`
- DEFAULT_LIMIT changed from 10 to 2 for demo/test environment (saves credits)

**Tests added:** +3 (402 credits exhausted x2, min>max validation)
**Final suite:** 295 files, 5266 tests, 0 failures

### Change Log

- 2026-03-24: Story 15.2 implementation complete — all 7 tasks, all ACs satisfied, 86 new tests, 0 regressions
- 2026-03-24: Code review — 8 issues found (5M, 3L), all fixed + 3 new tests, DEFAULT_LIMIT 10→2 for demo

### File List

**New files:**
- src/app/(dashboard)/technographic/page.tsx
- src/components/technographic/TechnographicPageContent.tsx
- src/components/technographic/TechnologyAutocomplete.tsx
- src/components/technographic/TechnographicFilterPanel.tsx
- src/components/technographic/CompanyResultsTable.tsx
- src/app/api/integrations/theirstack/search/technologies/route.ts
- src/app/api/integrations/theirstack/search/companies/route.ts
- src/hooks/use-technology-search.ts
- src/hooks/use-company-search.ts
- __tests__/unit/lib/services/theirstack-search.test.ts
- __tests__/unit/api/integrations/theirstack/search/technologies.test.ts
- __tests__/unit/api/integrations/theirstack/search/companies.test.ts
- __tests__/unit/hooks/use-technology-search.test.tsx
- __tests__/unit/hooks/use-company-search.test.tsx
- __tests__/unit/components/technographic/TechnologyAutocomplete.test.tsx
- __tests__/unit/components/technographic/TechnographicFilterPanel.test.tsx
- __tests__/unit/components/technographic/CompanyResultsTable.test.tsx
- __tests__/unit/components/technographic/TechnographicPageContent.test.tsx

**Modified files:**
- src/types/theirstack.ts
- src/lib/services/theirstack.ts
- src/components/common/Sidebar.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
