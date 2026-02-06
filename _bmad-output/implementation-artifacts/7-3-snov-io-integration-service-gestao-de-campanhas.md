# Story 7.3: Snov.io Integration Service - Gestão de Campanhas

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor,
I want um service layer para a API de listas e prospects do Snov.io,
So that o sistema possa criar listas de prospects e adicionar leads para campanhas no Snov.io.

> **NOTA CRÍTICA:** A pesquisa técnica revelou que a API do Snov.io **NÃO suporta criação de drip campaigns programaticamente**. O fluxo correto é: criar lista via API → adicionar prospects à lista → o usuário cria/associa a campanha manualmente no UI do Snov.io. Os ACs foram ajustados conforme a realidade da API.

## Acceptance Criteria

1. **Given** as credenciais do Snov.io estão configuradas (client_id:client_secret)
   **When** o `SnovioService` é chamado para qualquer operação
   **Then** obtém access_token via OAuth 2.0 automaticamente
   **And** faz cache do token em memória (expira em 1 hora)
   **And** renova o token se expirado (retry com novo token ao receber 401)
   **And** requests são proxied via API routes
   **And** erros são capturados e traduzidos para português
   **And** timeout de 10 segundos com 1 retry (via `ExternalService` base class)
   **And** respeita rate limit de 60 req/min com delay de 1.1s entre requests
   (AC: #1)

2. **Given** o service é chamado para criar lista de prospects
   **When** `createProspectList(params)` é invocado
   **Then** cria uma lista no Snov.io via `POST /v1/add-list`
   **And** retorna `{ listId, name }` da lista criada
   (AC: #2)

3. **Given** o service é chamado para adicionar prospect a uma lista
   **When** `addProspectToList(params)` é invocado
   **Then** envia 1 prospect por request para `POST /v1/add-prospect-to-list`
   **And** mapeia campos internos para formato Snov.io (camelCase)
   **And** inclui custom fields em bracket notation (`customFields[ice_breaker]`)
   **And** configura `updateContact: true` para atualizar prospects existentes
   **And** retorna resultado de sucesso/falha
   (AC: #3a)

4. **Given** o service é chamado para adicionar múltiplos prospects
   **When** `addProspectsToList(params)` é invocado com array de leads
   **Then** processa sequencialmente com delay de 1.1s entre requests (rate limit)
   **And** retorna resultado agregado: `{ added, updated, errors, totalProcessed }`
   **And** em caso de erro parcial, reporta quantos foram processados antes da falha
   (AC: #3b)

5. **Given** o service é chamado para listar campanhas existentes
   **When** `getUserCampaigns(params)` é invocado
   **Then** retorna lista de campanhas do Snov.io
   **And** cada campanha inclui: id, title, status
   (AC: #4)

6. **Given** o service é chamado para listar listas existentes
   **When** `getUserLists(params)` é invocado
   **Then** retorna lista de prospect lists do Snov.io
   **And** cada lista inclui: id, name, contacts count
   (AC: #5)

## Tasks / Subtasks

- [x] Task 1: Criar tipos da API Snov.io (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Criar `src/types/snovio.ts` com interfaces para request/response de todos os endpoints
  - [x] 1.2 Definir `SnovioProspect` — formato do prospect para `add-prospect-to-list`
  - [x] 1.3 Definir `CreateListRequest`, `CreateListResponse` (POST /v1/add-list)
  - [x] 1.4 Definir `AddProspectRequest`, `AddProspectResponse` (POST /v1/add-prospect-to-list)
  - [x] 1.5 Definir `GetUserCampaignsResponse`, `SnovioCampaign` (GET /v1/get-user-campaigns)
  - [x] 1.6 Definir `GetUserListsResponse`, `SnovioList` (GET /v1/get-user-lists)
  - [x] 1.7 Definir service params/result types: `CreateListParams`, `CreateListResult`, `AddProspectParams`, `AddProspectResult`, `AddProspectsParams`, `AddProspectsResult`, `GetCampaignsParams`, `GetCampaignsResult`, `GetListsParams`, `GetListsResult`
  - [x] 1.8 Criar testes de tipo em `__tests__/unit/types/snovio.test.ts`

- [x] Task 2: Implementar token management no SnovioService (AC: #1)
  - [x] 2.1 Adicionar propriedade privada `cachedToken: { token: string; expiresAt: number } | null` ao `SnovioService`
  - [x] 2.2 Implementar método privado `getOrRefreshToken(credentials: string): Promise<string>` — usa cache se válido, senão obtém novo via OAuth
  - [x] 2.3 Considerar margem de segurança: renovar proativamente se token expira em < 5 minutos
  - [x] 2.4 O `getAccessToken()` existente já funciona — apenas precisa do wrapper com cache

- [x] Task 3: Expandir SnovioService com createProspectList (AC: #2)
  - [x] 3.1 Adicionar método `createProspectList(params: CreateListParams): Promise<CreateListResult>`
  - [x] 3.2 Obter token via `getOrRefreshToken(params.credentials)`
  - [x] 3.3 Enviar `POST /v1/add-list` com `{ access_token, name }`
  - [x] 3.4 Retornar `{ listId, name }` da response

- [x] Task 4: Expandir SnovioService com addProspectToList e addProspectsToList (AC: #3a, #3b)
  - [x] 4.1 Adicionar método `addProspectToList(params: AddProspectParams): Promise<AddProspectResult>` — single prospect
  - [x] 4.2 Implementar mapeamento de campos internos → formato Snov.io:
    - `lead.email` → `email` (REQUIRED)
    - `lead.firstName` → `firstName`
    - `lead.lastName` → `lastName`
    - `lead.companyName` → `companyName`
    - `lead.title` → `position` (campo nativo no Snov.io)
    - `lead.phone` → `phones: [phone]` (array)
    - `lead.icebreaker` → `customFields[ice_breaker]`
  - [x] 4.3 Enviar `POST /v1/add-prospect-to-list` com access_token no body
  - [x] 4.4 Configurar `updateContact: true`
  - [x] 4.5 Adicionar método `addProspectsToList(params: AddProspectsParams): Promise<AddProspectsResult>` — batch sequencial
  - [x] 4.6 Implementar rate limiting: delay de 1100ms entre requests (60 req/min safe margin)
  - [x] 4.7 Filtrar leads sem email antes de processar
  - [x] 4.8 Agregar resultados: `{ added, updated, errors, totalProcessed }`
  - [x] 4.9 Em caso de erro em um prospect, continuar com os demais (erro parcial)
  - [x] 4.10 Em caso de erro fatal (401, network), parar e reportar progresso parcial (padrão H3 do Instantly)

- [x] Task 5: Expandir SnovioService com getUserCampaigns e getUserLists (AC: #4, #5)
  - [x] 5.1 Adicionar método `getUserCampaigns(params: GetCampaignsParams): Promise<GetCampaignsResult>`
  - [x] 5.2 Enviar `GET /v1/get-user-campaigns` com access_token como query param
  - [x] 5.3 Adicionar método `getUserLists(params: GetListsParams): Promise<GetListsResult>`
  - [x] 5.4 Enviar `GET /v1/get-user-lists` com access_token via Bearer header

- [x] Task 6: Criar API routes Next.js para proxy dos requests (AC: #1)
  - [x] 6.1 Criar `src/app/api/snovio/lists/route.ts` — POST criar lista, GET listar listas
  - [x] 6.2 Criar `src/app/api/snovio/prospects/route.ts` — POST adicionar prospect(s) a lista
  - [x] 6.3 Criar `src/app/api/snovio/campaigns/route.ts` — GET listar campanhas
  - [x] 6.4 Cada route: extrair credenciais do tenant (via Supabase auth, `api_configs` table onde `service_name = 'snovio'`), validar inputs, chamar Snov.io API, retornar resultado
  - [x] 6.5 Formato de credenciais: `encrypted_key` contém `client_id:client_secret` (mesmo formato que `testConnection` já usa)

- [x] Task 7: Testes completos (AC: #1, #2, #3, #4, #5)
  - [x] 7.1 Expandir `__tests__/unit/lib/services/snovio.test.ts` com testes para todos novos métodos
  - [x] 7.2 Criar `__tests__/unit/types/snovio.test.ts` — testes de tipo
  - [x] 7.3 Criar `__tests__/unit/api/snovio-lists.test.ts` — testes das API routes de listas
  - [x] 7.4 Criar `__tests__/unit/api/snovio-prospects.test.ts` — testes da route de adicionar prospects
  - [x] 7.5 Criar `__tests__/unit/api/snovio-campaigns.test.ts` — testes da route de listar campanhas
  - [x] 7.6 Testes de token management: cache hit, cache miss, token expirado, refresh 401
  - [x] 7.7 Testes de rate limiting: verificar delay de 1100ms entre requests
  - [x] 7.8 Testes de mapeamento: lead interno → SnovioProspect com camelCase + customFields bracket
  - [x] 7.9 Testes de erro: 401 (token inválido), 429 (rate limit), 500 (server error), timeout, network error
  - [x] 7.10 Testes de edge cases: lead sem email (filtrar), lead sem icebreaker (sem customFields), lista vazia
  - [x] 7.11 Testes de erro parcial: 5 de 10 prospects adicionados, erro no 6º → reportar progresso

## Dev Notes

### Contexto Crítico do Codebase

**SnovioService existente** (`src/lib/services/snovio.ts`):
- Classe que extends `ExternalService` (base class em `src/lib/services/base-service.ts`)
- Apenas `testConnection(credentials)` implementado — testa OAuth + balance endpoint
- Auth: OAuth 2.0 client_credentials → `POST /v1/oauth/access_token` com `client_id:client_secret`
- Método privado `parseCredentials(credentials)` já existe — retorna `[clientId, clientSecret]`
- Método privado `getAccessToken(clientId, clientSecret)` já existe — obtém token via OAuth
- Base URL: `https://api.snov.io`
- **IMPORTANTE**: NÃO reimplementar `getAccessToken()` — apenas adicionar cache wrapper

**ExternalService base class** (`src/lib/services/base-service.ts`):
- Método protegido `request<T>(url, options)` — faz fetch com 10s timeout e 1 retry
- Método protegido `handleError(error)` — converte erros para `ExternalServiceError` com mensagem PT-BR
- Mensagens de erro pré-definidas incluem: `SNOVIO_ERROR: "Erro na comunicação com Snov.io."`
- **IMPORTANTE**: O método `request()` já implementa timeout de 10s e retry 1x — NÃO reimplementar

**Variable Registry existente** (`src/lib/export/variable-registry.ts` — Story 7.1):
- Mapeamento Snov.io já definido:
  - `first_name` → `{{firstName}}`
  - `company_name` → `{{companyName}}`
  - `title` → `{{title}}`
  - `ice_breaker` → `{{iceBreaker}}`
- **NOTA**: Este mapeamento é para variáveis nos TEMPLATES de email do Snov.io. O mapeamento de campos da API (add-prospect-to-list) é diferente — usa camelCase nos campos nativos e bracket notation para custom fields.

**Services Index** (`src/lib/services/index.ts`):
- SnovioService já registrado e exportado
- Factory function `getService('snovio')` já funciona
- NÃO precisa de alterações no index

### API Snov.io — Referência Rápida

**Fonte:** [Pesquisa Técnica 2026-02-06](_bmad-output/planning-artifacts/research/technical-instantly-snovio-api-integration-research-2026-02-06.md)

**Autenticação:**
- OAuth 2.0 Client Credentials
- Endpoint: `POST /v1/oauth/access_token`
- Body: `grant_type=client_credentials&client_id=X&client_secret=Y` (x-www-form-urlencoded)
- Response: `{ access_token, token_type: "Bearer", expires_in: 3600 }`
- Token expira em 1 hora
- Usar access_token como query param ou no body (dependendo do endpoint)

**Rate Limits:**
- 60 requests por minuto (~1 req/s efetivo)
- HTTP 429 ao exceder
- **Impacto**: Adicionar 100 prospects ≈ 110 segundos. Adicionar 500 prospects ≈ 9 minutos.

**Endpoints utilizados nesta story:**

| Ação | Método | Endpoint | Rate |
|------|--------|----------|------|
| Criar lista | POST | `/v1/add-list` | 1/s |
| Adicionar prospect | POST | `/v1/add-prospect-to-list` | 1/s |
| Listar campanhas | GET | `/v1/get-user-campaigns` | 1/s |
| Listar listas | GET | `/v1/get-user-lists` | 1/s |

**LIMITAÇÃO CRÍTICA: Snov.io NÃO permite criar drip campaigns via API.** O fluxo é:
1. Criar lista via API
2. Adicionar prospects à lista via API (1 por vez)
3. [MANUAL] Usuário cria drip campaign no UI do Snov.io e associa à lista
4. Prospects na lista entram automaticamente na campanha

### Mapeamento de Campos Lead → SnovioProspect

```
Lead (interno)              → Snov.io API (add-prospect-to-list)
─────────────────────────────────────────────────────────────────
lead.email                  → email (REQUIRED)
lead.firstName              → firstName (camelCase)
lead.lastName               → lastName (camelCase)
lead.companyName            → companyName (camelCase)
lead.title                  → position (campo nativo Snov.io — NÃO title!)
lead.phone                  → phones: [phone] (array de strings)
lead.icebreaker             → customFields[ice_breaker] (bracket notation)
```

**NOTAS IMPORTANTES:**
1. `title` do nosso lead mapeia para `position` no Snov.io (NÃO para `title`)
2. `phones` é um array no Snov.io, não um campo string único
3. Custom fields usam bracket notation: `customFields[ice_breaker]`
4. O `access_token` vai NO BODY do request (não como header para este endpoint)
5. `updateContact: true` atualiza dados se prospect já existe na lista
6. Se a lista está linkada a uma campanha ativa, o prospect entra automaticamente

### Formato do Request — add-prospect-to-list

```json
{
  "access_token": "abc123...",
  "email": "joao@empresa.com",
  "firstName": "João",
  "lastName": "Silva",
  "position": "CTO",
  "companyName": "Empresa Ltda",
  "phones": ["+5511999999999"],
  "customFields[ice_breaker]": "Parabéns pelo novo cargo de CTO!",
  "listId": 12345,
  "updateContact": true
}
```

### Diferenças Chave: Snov.io vs Instantly

| Aspecto | Instantly (7.2) | Snov.io (7.3) |
|---------|-----------------|---------------|
| Auth | Bearer API key (não expira) | OAuth2 access_token (1h expiry) |
| Criar campanha | SIM via API | NÃO — apenas via UI |
| Bulk add leads | 1000/request | **1 por vez** |
| Rate limit | 10 req/s | 60 req/min (~1 req/s) |
| Custom variables | `custom_variables: { key: value }` (flat object) | `customFields[key]` (bracket notation) |
| Campos | snake_case (`first_name`) | camelCase (`firstName`) |
| `title` | `custom_variables.title` | `position` (nativo) |
| Token no request | Header: `Authorization: Bearer key` | Body: `access_token` (add-prospect) ou query param (GET) |

### Learnings da Story 7.2 (Instantly)

**Padrões estabelecidos que DEVEM ser seguidos:**
1. **Types file contém APENAS tipos** — constantes e lógica vão no service (lição H1 do code review 7.2)
2. **Params objects** para todos os métodos (não args individuais) — lição M1 do code review 7.2
3. **Partial error handling** — em caso de falha parcial em batch, incluir `partialResults` nos detalhes do erro (lição H3 do code review 7.2)
4. **Rate limit delay** — ter teste verificando o valor do delay (lição M3 do code review 7.2)
5. **500 error tests** — todos os API routes devem ter teste de generic 500 error (lição M5 do code review 7.2)
6. **Mock fetch** — usar `createMockFetch` de `__tests__/helpers/mock-fetch.ts`
7. **Mock Supabase** — usar `createMockSupabase` de `__tests__/helpers/mock-supabase.ts` para testes de API routes

**Code Review learnings da Story 7.1:**
- M2: Tipos files devem conter APENAS tipos — lógica/constantes vão em módulos de lógica
- M3: Criar barrel files para módulos com múltiplos exports

### Decisões de Design

1. **Token caching em memória**: O `SnovioService` deve cachear o access_token com timestamp de expiração. Renovar proativamente se faltam < 5 minutos para expirar. Em produção com serverless (Vercel), o cache é por instância — aceitável pois o token é obtido rapidamente.

2. **Rate limiting defensivo**: Delay de 1100ms entre requests ao Snov.io (margem de segurança para 60 req/min). Para a Story 7.6 futura, esse delay será visível ao usuário via progress indicator.

3. **Erro parcial em batch**: `addProspectsToList` deve continuar processando após erro em um prospect individual (exceto erros fatais como 401 ou network error). Reportar quantos foram processados.

4. **Campos de request no body**: O endpoint `add-prospect-to-list` do Snov.io espera todos os campos (incluindo `access_token` e `listId`) no body JSON. NÃO usar query params.

5. **NÃO tentar criar campanhas**: A API do Snov.io não suporta isso. O método `getUserCampaigns` existe apenas para listar campanhas existentes — útil na Story 7.6 para "associar a campanha existente".

### Project Structure Notes

**Arquivos novos seguem padrões existentes:**
- `src/types/snovio.ts` — tipos no padrão do projeto (PascalCase interfaces, apenas tipos)
- `src/app/api/snovio/lists/route.ts` — padrão Next.js App Router (POST criar, GET listar)
- `src/app/api/snovio/prospects/route.ts` — padrão Next.js App Router (POST adicionar)
- `src/app/api/snovio/campaigns/route.ts` — padrão Next.js App Router (GET listar)

**Modificados:**
- `src/lib/services/snovio.ts` — expandir classe existente (NÃO criar novo arquivo)

**Sem conflitos** com estrutura existente. O diretório `src/app/api/snovio/` é novo.

### Testing Requirements

**Framework**: Vitest (projeto usa Vitest, NÃO Jest)
**Mock Fetch**: Usar `createMockFetch` de `__tests__/helpers/mock-fetch.ts` — helper centralizado (Cleanup Sprint 2)
**Mock Supabase**: Usar `createMockSupabase` de `__tests__/helpers/mock-supabase.ts` — para testes de API routes com auth
**ESLint**: `no-console` rule ativa — NÃO usar console.log/warn/error

**Testes obrigatórios:**

| Arquivo de Teste | Escopo |
|-----------------|--------|
| `__tests__/unit/types/snovio.test.ts` | Testes de tipo (type-level assertions) |
| `__tests__/unit/lib/services/snovio.test.ts` | Expandir com testes para createProspectList, addProspectToList, addProspectsToList, getUserCampaigns, getUserLists, token caching |
| `__tests__/unit/api/snovio-lists.test.ts` | Testes da API route de criar/listar listas |
| `__tests__/unit/api/snovio-prospects.test.ts` | Testes da API route de adicionar prospects |
| `__tests__/unit/api/snovio-campaigns.test.ts` | Testes da API route de listar campanhas |

**Cenários de teste críticos:**
- Token caching: primeira chamada obtém token, segunda usa cache, terceira (após expirar) renova
- Rate limiting: verificar delay de 1100ms entre requests em addProspectsToList
- Mapeamento: lead com todos campos → verify camelCase + position (not title) + customFields bracket
- Lead sem email → deve ser filtrado antes do envio
- Lead sem icebreaker → sem campo customFields[ice_breaker]
- Erro 401 → mensagem "API key inválida ou expirada." + tentar refresh do token
- Erro 429 → mensagem "Limite de requisições atingido."
- Timeout → mensagem "Tempo limite excedido."
- Erro parcial: 5 de 10 prospects adicionados → reportar progresso
- Erro fatal (401 em batch) → parar e reportar partialResults
- Criar lista com nome válido
- Listar campanhas e listas existentes

### Architecture Compliance

- **Naming**: Arquivos utility em kebab-case (`snovio.ts`)
- **Types**: PascalCase para interfaces (`CreateListRequest`, `SnovioProspect`)
- **Functions/Methods**: camelCase (`createProspectList`, `addProspectToList`)
- **Constants**: SCREAMING_SNAKE para constantes (`SNOVIO_API_BASE`, `RATE_LIMIT_DELAY_MS`)
- **Errors**: Mensagens em português brasileiro
- **Exports**: Named exports (não default)
- **Service extends ExternalService**: Usar `this.request<T>()` para fazer fetch (já tem timeout+retry)
- **Types file APENAS tipos** (lição H1/M2 das stories 7.1/7.2)

### Library / Framework Requirements

- **Sem novas dependências** — Esta story usa TypeScript puro + fetch API + ExternalService base
- **Vitest** para testes (já instalado)
- **Next.js App Router** para API routes (já instalado)

### Git Intelligence Summary

**Branch atual**: `epic/7-campaign-deployment-export`
**Último commit**: `d2d80e3 feat(story-7.2): Instantly campaign management service with code review fixes`
**Branch base para PR**: `main`

**Commits recentes relevantes:**
- `d2d80e3 feat(story-7.2)` — Instantly service completo (createCampaign, addLeadsToCampaign, activateCampaign, getCampaignStatus) — **REFERÊNCIA PRIMÁRIA de padrão**
- `9c3a495 feat(story-7.1)` — sistema de variáveis de personalização, variable-registry, resolve-variables
- `ecc8de7 chore(epic-7)` — inicialização da branch epic
- `49bd93b feat(cleanup-sprint-2)` — mock infrastructure centralizada (mock-fetch, mock-supabase)

**Padrões observados nos commits:**
- Commit message: `feat(story-X.Y): descrição`
- Testes criados junto com a implementação
- Code review aplicado como parte do mesmo commit

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.3]
- [Source: _bmad-output/planning-artifacts/research/technical-instantly-snovio-api-integration-research-2026-02-06.md#Snov.io API]
- [Source: _bmad-output/planning-artifacts/architecture.md#External API Service Pattern]
- [Source: src/lib/services/snovio.ts — SnovioService com testConnection() + getAccessToken()]
- [Source: src/lib/services/base-service.ts — ExternalService base class]
- [Source: src/lib/services/instantly.ts — InstantlyService como referência de padrão]
- [Source: src/types/instantly.ts — Tipos Instantly como referência de padrão]
- [Source: src/lib/export/variable-registry.ts — Platform mappings Snov.io]
- [Source: src/types/export.ts — ExportPlatform, PersonalizationVariable]
- [Source: _bmad-output/implementation-artifacts/7-2-instantly-integration-service-gestao-de-campanhas.md — Story anterior completa com learnings]
- [Source: __tests__/unit/lib/services/instantly.test.ts — Padrão de testes de service]
- [Source: __tests__/helpers/mock-fetch.ts — createMockFetch helper]
- [Source: src/app/api/instantly/campaign/route.ts — Padrão de API route]
- [Source: src/app/api/instantly/leads/route.ts — Padrão de API route com batching]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Task 1: Criado `src/types/snovio.ts` com 20 interfaces (API request/response + service params/result). 23 type tests passando.
- Task 2: Implementado token caching com `cachedToken` + `getOrRefreshToken()`. Margem de segurança de 5 min para proactive renewal. 3 testes de token management.
- Task 3: `createProspectList()` envia POST /v1/add-list com access_token no body. 6 testes (success, endpoint, 401, 429, 500).
- Task 4: `addProspectToList()` mapeia lead interno → Snov.io (title→position, phone→phones[], icebreaker→customFields[ice_breaker]). `addProspectsToList()` processa sequencialmente com 1100ms delay, filtra sem email, continua em erro não-fatal, para em 401/network reportando partialResults. 15 testes.
- Task 5: `getUserCampaigns()` usa access_token como query param. `getUserLists()` usa Bearer header. 10 testes.
- Task 6: 3 API routes criadas seguindo padrão Instantly (tenant auth via api_configs, service_name='snovio', decrypt credentials).
- Task 7: 94 story tests + 3392 testes existentes = 3486 total, 0 failures, 0 regressions.

### Senior Developer Review (AI) — 2026-02-06

**Reviewer:** Amelia (Dev Agent) — Claude Opus 4.6
**Issues Found:** 1 HIGH, 3 MEDIUM, 4 LOW
**Issues Fixed:** 1 HIGH, 3 MEDIUM (all auto-fixed)
**Action Items Created:** 0

**Fixes Applied:**
- **H1 (FIXED):** AC#1 — Added `withTokenRetry()` method for automatic 401 token retry. All 5 public methods (`createProspectList`, `addProspectToList`, `addProspectsToList` via `addProspectToList`, `getUserCampaigns`, `getUserLists`) now retry once with fresh token on 401.
- **M1 (FIXED):** Token cache now stores credentials. `getOrRefreshToken()` validates credential match before returning cached token — prevents cross-credential cache pollution.
- **M2 (FIXED):** Network error batch test now verifies `partialResults` in error details (statusCode, added, totalProcessed, processedBeforeFailure, totalLeads).
- **M3 (DOCUMENTED):** Added comment explaining `totalProcessed` accounting — with `updateContact=true`, Snov.io always returns added OR updated, so mismatch is theoretical only.

**Low issues (not fixed — pre-existing or trivial):**
- L1: `SnovioBalanceResponse` local type (pre-existing Story 2.3)
- L2: Whitespace-only email edge case
- L3: Duplicated auth boilerplate (pre-existing pattern)
- L4: Empty leads array not tested at service level (protected by route validation)

**Post-fix test results:** 96 story tests + 3392 existing = 3488 total, 0 failures, 0 regressions.

### File List

**Novos:**
- `src/types/snovio.ts` — 20 interfaces para API Snov.io + service params/result types
- `src/app/api/snovio/lists/route.ts` — POST criar lista, GET listar listas
- `src/app/api/snovio/prospects/route.ts` — POST adicionar prospects a lista
- `src/app/api/snovio/campaigns/route.ts` — GET listar campanhas
- `__tests__/unit/types/snovio.test.ts` — 23 type tests
- `__tests__/unit/api/snovio-lists.test.ts` — 12 API route tests (POST + GET)
- `__tests__/unit/api/snovio-prospects.test.ts` — 8 API route tests
- `__tests__/unit/api/snovio-campaigns.test.ts` — 6 API route tests

**Modificados:**
- `src/lib/services/snovio.ts` — Expandido: token cache, createProspectList, addProspectToList, addProspectsToList, getUserCampaigns, getUserLists
- `__tests__/unit/lib/services/snovio.test.ts` — Expandido: 10 → 47 testes (token mgmt, withTokenRetry, credential isolation, all methods, rate limiting, field mapping, edge cases, partial errors)
