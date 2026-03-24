# Story 15.1: Integracao theirStack -- Configuracao, Teste e Credits

Status: done

## Story

As a Admin,
I want configurar a API key do theirStack, testar a conexao e visualizar o consumo de credits,
so that o sistema esteja pronto para realizar buscas technograficas com visibilidade do uso.

## Acceptance Criteria

1. **Given** o Admin esta na pagina de integracoes **When** adiciona a API key do theirStack no campo dedicado **Then** a key e armazenada criptografada via Supabase Vault **And** a key nunca e exposta no frontend

2. **Given** a API key do theirStack esta configurada **When** o Admin clica em "Testar Conexao" **Then** o sistema chama a API do theirStack para validar a key **And** exibe status de sucesso ou erro com mensagem em portugues

3. **Given** a integracao theirStack esta ativa **When** o Admin visualiza o card da integracao **Then** o sistema exibe credits utilizados vs. disponiveis no mes (ex: "6/200 API credits") **And** os dados sao obtidos via endpoint `GET /v0/billing/credit-balance`

4. **Given** a API key e invalida ou expirada **When** o sistema tenta conectar **Then** exibe mensagem de erro clara em portugues orientando o usuario

## Spike de Validacao theirStack API (2026-03-24)

### Contexto

Action item da Retro Epic 14: "Documentacao de API externa != realidade. Sempre validar com chamada real antes de definir tipos TypeScript."

Spike executado com chamadas reais aos 3 endpoints. Credits consumidos: 6 de 200 API credits.

### Divergencias Criticas Encontradas

#### 1. Endpoint de credits -- URL ERRADA na documentacao/story original

- **Story original dizia:** `GET /v1/account/credits`
- **Realidade:** `GET /v1/account/credits` retorna **404 Not Found**
- **Endpoint correto:** `GET /v0/billing/credit-balance`

#### 2. Formato de response de credits -- Campos diferentes do esperado

- **Story original assumia:** `{ used, total, resetDate }`
- **Response real:**
```json
{
  "ui_credits": 50,
  "used_ui_credits": 0,
  "api_credits": 200,
  "used_api_credits": 6
}
```
- **Impacto:** Nao existe campo `resetDate`. Ha dois tipos de credits: `ui_credits` (para dashboard web) e `api_credits` (para API). Para nosso uso, o relevante e `api_credits` / `used_api_credits`.
- **Display sugerido:** "6/200 API credits" (usado/total)

#### 3. Filtro de nivel de confianca -- NAO existe como parametro de busca

- **Story 15.2 assume:** filtro de `nivel de confianca (low/medium/high)` como parametro de busca
- **Realidade:** `confidence` e retornado POR EMPRESA no resultado, nao e filtravel na API
- **Solucao:** Filtro client-side apos receber resultados, ou remover do escopo de filtros

#### 4. Busca por tecnologia usa SLUG, nao nome

- **Autocomplete retorna:** `{ name: "Netskope", slug: "netskope", ... }`
- **Companies search espera:** `company_technology_slug_or: ["netskope"]` (array de slugs)
- **Impacto:** Autocomplete precisa armazenar o `slug` para usar na busca

### Endpoint 1: GET /v0/billing/credit-balance

**Custo:** 0 credits (free)
**Auth:** Bearer token
**Response real (HTTP 200):**

```typescript
interface TheirStackCreditsResponse {
  ui_credits: number;      // total UI credits no plano
  used_ui_credits: number;  // UI credits consumidos
  api_credits: number;      // total API credits no plano
  used_api_credits: number; // API credits consumidos
}
```

**Exemplo:**
```json
{ "ui_credits": 50, "used_ui_credits": 0, "api_credits": 200, "used_api_credits": 6 }
```

**Nota:** Este endpoint tambem serve como `testConnection` -- se a key e valida, retorna 200 com credits. Se invalida, retorna erro.

### Endpoint 2: GET /v0/catalog/keywords

**Custo:** 0 credits (free)
**Auth:** Bearer token
**Query params uteis:**
- `name_pattern` -- substring match case-insensitive (para autocomplete)
- `q` -- busca geral em multiplos campos
- `limit` -- resultados por pagina (default: 25)
- `page` -- numero da pagina (default: 0, zero-based)
- `include_metadata` -- retorna `{ data, metadata }` em vez de array flat

**Response SEM `include_metadata`:** Array flat `KeywordAggregated[]`
**Response COM `include_metadata=true`:**

```typescript
interface CatalogKeywordsResponse {
  data: KeywordAggregated[];
  metadata: {
    total_results: number;
    page: number;
    limit: number;
  };
}

interface KeywordAggregated {
  name: string;                    // "Netskope"
  category: string;                // "Cloud Access Security Broker"
  slug: string;                    // "netskope" -- USAR ESTE para companies/search
  category_slug: string;           // "cloud-access-security-broker"
  parent_category: string;         // "IT Security"
  parent_category_slug: string;    // "it-security"
  logo: string;                    // URL ou "" (vazio)
  logo_thumbnail: string;          // URL ou "" (vazio)
  one_liner: string;               // "Netskope is a cloud based security solution." ou ""
  url: string;                     // URL do site ou ""
  description: string;             // descricao longa ou ""
  type: string;                    // "technology" | "software_product" | "technology_concept" | "operational_activity" | "regulation" | "strategic_initiative"
  jobs: number;                    // total de vagas mencionando essa tech (ex: 7415)
  companies: number;               // total de empresas usando (ex: 2822)
  companies_found_last_week: number; // empresas encontradas na ultima semana (ex: 72)
}
```

**Exemplo busca "netskope":**
```json
[{
  "name": "Netskope",
  "category": "Cloud Access Security Broker",
  "slug": "netskope",
  "parent_category": "IT Security",
  "logo": "https://media.theirstack.com/technology/logo/netskope/logo.octet-stream",
  "type": "technology",
  "jobs": 7415,
  "companies": 2822,
  "companies_found_last_week": 72
}]
```

### Endpoint 3: POST /v1/companies/search

**Custo:** 3 credits por empresa retornada
**Auth:** Bearer token
**Content-Type:** application/json

**Request body (campos relevantes):**

```typescript
interface CompanySearchRequest {
  company_technology_slug_or?: string[];  // ["netskope"] -- USA SLUG
  company_technology_slug_and?: string[]; // empresas com TODAS as techs
  company_country_code_or?: string[];     // ["BR", "US"]
  min_employee_count?: number;            // filtro tamanho minimo
  max_employee_count?: number;            // filtro tamanho maximo
  industry_id_or?: number[];              // filtro por industria (ID numerico)
  limit?: number;                         // resultados por pagina
  page?: number;                          // pagina (0-based)
  include_total_results?: boolean;        // incluir total no metadata
}
```

**Response real (HTTP 200):**

```typescript
interface CompanySearchResponse {
  metadata: {
    total_results: number;       // 2768
    truncated_results: number;   // 0
    truncated_companies: number; // 0
    total_companies: number;     // 2768
  };
  data: TheirStackCompany[];
}

interface TheirStackCompany {
  // Identificacao
  id: string;                          // "zscMff/ViJUt4UJ7eNYsuA=="
  name: string;                        // "EY"
  domain: string;                      // "ey.com"
  url: string;                         // "https://ey.com"
  logo: string;                        // URL da logo

  // Localizacao
  country: string | null;              // "United Kingdom" -- PODE SER NULL
  country_code: string | null;         // "GB"
  city: string | null;                 // "London"

  // Tamanho e industria
  industry: string;                    // "Professional Services"
  industry_id: number;                 // 1810
  employee_count: number;              // 399559
  employee_count_range: string;        // "10,000+"

  // Financeiro
  annual_revenue_usd: number | null;   // 45420000000
  annual_revenue_usd_readable: string | null; // "45.4B"
  total_funding_usd: number | null;    // null
  founded_year: number | null;         // 1989

  // LinkedIn
  linkedin_url: string | null;         // "https://www.linkedin.com/company/ernstandyoung/"
  linkedin_id: string | null;          // "1073"
  apollo_id: string | null;            // "61b08f747970ba00010fcfa6" -- UTIL para Apollo Bridge

  // Descricao
  long_description: string;            // texto longo
  seo_description: string;             // texto curto

  // Tecnologias encontradas (CAMPO CHAVE)
  technologies_found: TechnologyFound[];

  // Contadores
  num_technologies: number;            // 3040
  num_jobs: number;                    // 224224
  num_jobs_last_30_days: number;       // 7382

  // Arrays grandes (evitar exibir na UI)
  technology_slugs: string[];          // pode ter 3000+ items
  technology_names: string[];          // pode ter 3000+ items
  keyword_slugs: string[];             // pode ter 7000+ items
  company_keywords: string[];          // tags resumidas
  company_tags: string[];              // igual a company_keywords

  // Outros
  is_recruiting_agency: boolean;       // false
  has_blurred_data: boolean;           // false (free tier pode ter true)
  possible_domains: string[];          // ["ey.com"]
  alexa_ranking: number | null;        // 6940
}

interface TechnologyFound {
  technology: {
    name: string;            // "Netskope"
    category: string;        // "Cloud Access Security Broker"
    slug: string;            // "netskope"
    category_slug: string;
    parent_category: string; // "IT Security"
    parent_category_slug: string;
    logo: string;            // URL
    logo_thumbnail: string;  // URL
  };
  confidence: string;        // "high" | "medium" | "low" -- STRING, nao enum
  jobs: number;               // 284 (vagas mencionando essa tech nesta empresa)
  jobs_last_7_days: number;   // 3
  jobs_last_30_days: number;  // 5
  jobs_last_180_days: number; // 14
  first_date_found: string;   // "2022-03-04" (ISO date)
  last_date_found: string;    // "2026-03-23" (ISO date)
  rank_within_category: number;                // 2
  relative_occurrence_within_category: number; // 0.23297785
  theirstack_score: number;                    // 2.154207
  company_name: string;                        // "EY"
}
```

**Exemplo resumido (EY + Netskope):**
```json
{
  "metadata": { "total_results": 2768, "total_companies": 2768 },
  "data": [{
    "name": "EY",
    "domain": "ey.com",
    "industry": "Professional Services",
    "country": "United Kingdom",
    "employee_count": 399559,
    "apollo_id": "61b08f747970ba00010fcfa6",
    "technologies_found": [{
      "technology": { "name": "Netskope", "category": "Cloud Access Security Broker" },
      "confidence": "high",
      "theirstack_score": 2.154207,
      "first_date_found": "2022-03-04",
      "last_date_found": "2026-03-23"
    }]
  }]
}
```

### Rate Limiting

- **Free tier:** 4/sec, 10/min, 50/hr, 400/day
- **Headers IETF:** `RateLimit`, `RateLimit-Policy`, `RateLimit-Remaining`, `RateLimit-Reset`
- **HTTP 429** quando excedido

### Implicacoes para Implementacao

1. **testConnection** deve usar `GET /v0/billing/credit-balance` (valida key + retorna credits, custo 0)
2. **getCredits** usa mesmo endpoint -- display: `{used_api_credits}/{api_credits} API credits`
3. **Autocomplete** deve usar `name_pattern` param e guardar `slug` para a busca
4. **Companies search** usa `company_technology_slug_or` com slugs, nao nomes
5. **`confidence`** e string por empresa, nao filtravel na API -- filtrar client-side se necessario
6. **`country` pode ser null** -- typeof guard obrigatorio
7. **`apollo_id` disponivel** -- facilita Apollo Bridge (Story 15.4) sem busca extra
8. **`has_blurred_data`** -- pode indicar dados limitados no free tier
9. **Arrays enormes** (`technology_slugs` pode ter 3000+ items) -- nao exibir raw na UI
10. **Credits: 3 por empresa** -- com limit=25 (default), cada busca consome 75 credits

## Tasks / Subtasks

- [x] Task 1: Adicionar "theirstack" aos tipos de integracao (AC: #1)
  - [x] 1.1 Adicionar `"theirstack"` ao array `SERVICE_NAMES` em `src/types/integration.ts`
  - [x] 1.2 Adicionar label e metadados para theirstack
  - [x] 1.3 Criar tipos em `src/types/theirstack.ts` (TheirStackCreditsResponse) -- USAR TIPOS VALIDADOS DO SPIKE

- [x] Task 2: Criar TheirStackService (AC: #2, #4)
  - [x] 2.1 Criar `src/lib/services/theirstack.ts` estendendo `ExternalService`
  - [x] 2.2 Implementar `testConnection(apiKey)` usando `GET /v0/billing/credit-balance` (valida key + retorna credits)
  - [x] 2.3 Implementar `getCredits(apiKey)` retornando `{ apiCredits, usedApiCredits }` do mesmo endpoint
  - [x] 2.4 Implementar error handling com mensagens em portugues (rate limit 429, unauthorized 401, timeout)
  - [x] 2.5 typeof guards em todos os campos da response (aprendizado Epic 14)
  - [x] 2.6 Registrar no service factory em `src/lib/services/index.ts`

- [x] Task 3: Criar API route de teste (AC: #2, #4)
  - [x] 3.1 Criar `src/app/api/integrations/theirstack/test/route.ts`
  - [x] 3.2 Seguir padrao Apollo: fetch encrypted key -> decrypt -> testConnection -> return result

- [x] Task 4: Criar API route de credits (AC: #3)
  - [x] 4.1 Criar `src/app/api/integrations/theirstack/credits/route.ts`
  - [x] 4.2 Retornar credits no formato `{ apiCredits, usedApiCredits, uiCredits, usedUiCredits }`

- [x] Task 5: Adicionar card na pagina de integracoes (AC: #1, #2, #3)
  - [x] 5.1 Adicionar metadata do theirStack no array `integrations[]` em `src/app/(dashboard)/settings/integrations/page.tsx`
  - [x] 5.2 Exibir badge de credits no card (fetch via API route de credits)
  - [x] 5.3 Formato de exibicao: "{usedApiCredits}/{apiCredits} API credits"

- [x] Task 6: Testes (AC: #1, #2, #3, #4)
  - [x] 6.1 Criar `__tests__/unit/lib/services/theirstack.test.ts`
  - [x] 6.2 Criar `__tests__/unit/api/integrations/theirstack/test.test.ts`
  - [x] 6.3 Criar `__tests__/unit/api/integrations/theirstack/credits.test.ts`
  - [x] 6.4 Testar cenarios: success, 401 (invalid key), 429 (rate limit), timeout, network error
  - [x] 6.5 typeof guards: testar com campos null, tipos inesperados (string em vez de number, etc.)

## Dev Notes

### theirStack API Reference (VALIDADO COM CHAMADAS REAIS 2026-03-24)

**Base URL:** `https://api.theirstack.com`

**Authentication:** Bearer token via header `Authorization: Bearer <token>`

**Endpoints relevantes para esta story:**

1. **Credit Balance** (para testConnection + getCredits):
   - `GET /v0/billing/credit-balance`
   - Retorna: `{ ui_credits, used_ui_credits, api_credits, used_api_credits }` (todos number)
   - Custo: 0 credits
   - **ATENCAO:** endpoint `/v1/account/credits` NAO EXISTE (retorna 404)

2. **Rate Limiting (free tier):**
   - 4 requests/segundo
   - 10 requests/minuto
   - 50 requests/hora
   - 400 requests/dia
   - Headers IETF: `RateLimit`, `RateLimit-Policy`
   - Retorna HTTP 429 quando excedido

### Padroes Existentes a Seguir (CRITICO)

**ExternalService base class** (`src/lib/services/base-service.ts`):
- Todas as integracoes estendem `ExternalService`
- Implementar `testConnection(apiKey): Promise<TestConnectionResult>`
- Usar `this.request<T>(url, options)` do base para HTTP calls
- Error handling automatico: retry 1x em timeout, 10s timeout default
- Mensagens de erro em portugues via `ERROR_MESSAGES`

**IntegrationCard** (`src/components/settings/IntegrationCard.tsx`):
- Props: `name`, `displayName`, `icon`, `description`, `maskedKey`, `status`, `onSave`, `onTest`
- Suporta single-field (API key unica) -- usar este modo para theirStack
- Badge de status automatico (configured/not_configured/error)
- Botao "Testar Conexao" aparece quando configurado

**API Key Storage** (`src/lib/crypto/encryption.ts`):
- AES-256-GCM: `encryptApiKey(plainKey)` retorna `"iv:authTag:encryptedData"`
- `maskApiKey(key, 4)` retorna `"••••••••xyz"`
- Tabela `api_configs`: `tenant_id`, `service_name`, `encrypted_key`, `key_suffix`

**API Route padrao** (ex: `src/app/api/integrations/apollo/test/route.ts`):
1. Verificar auth + role admin
2. Fetch `encrypted_key` de `api_configs` via Supabase
3. `decryptApiKey(encrypted)` server-side only
4. `service.testConnection(decryptedKey)`
5. Retornar `TestConnectionResult`

**Hook de integracoes** (`src/hooks/use-integration-config.ts`):
- `useIntegrationConfig()` -- gerencia estado de todas as integracoes
- `saveConfig()`, `testConnection()`, `refreshConfigs()`
- Ja funciona automaticamente para qualquer `ServiceName` registrado

### Project Structure Notes

**Arquivos a CRIAR:**
- `src/types/theirstack.ts` -- tipos da API theirStack (VALIDADOS NO SPIKE)
- `src/lib/services/theirstack.ts` -- TheirStackService
- `src/app/api/integrations/theirstack/test/route.ts` -- rota de teste
- `src/app/api/integrations/theirstack/credits/route.ts` -- rota de credits
- `__tests__/unit/lib/services/theirstack.test.ts`
- `__tests__/unit/api/integrations/theirstack/test.test.ts`
- `__tests__/unit/api/integrations/theirstack/credits.test.ts`

**Arquivos a MODIFICAR:**
- `src/types/integration.ts` -- adicionar "theirstack" ao SERVICE_NAMES
- `src/lib/services/index.ts` -- registrar TheirStackService no factory
- `src/app/(dashboard)/settings/integrations/page.tsx` -- adicionar card metadata

**NAO MODIFICAR (ja funcionam automaticamente):**
- `src/components/settings/IntegrationCard.tsx` -- generico, funciona com qualquer ServiceName
- `src/hooks/use-integration-config.ts` -- generico
- `src/app/api/settings/integrations/route.ts` -- generico (GET/POST/DELETE)
- `src/lib/crypto/encryption.ts` -- generico
- `src/actions/integrations.ts` -- generico (server actions)

### Testing Standards

- Framework: Vitest
- Mock HTTP: `createMockFetch(routes)` de `__tests__/helpers/mock-fetch.ts`
- Mock Supabase: `vi.mock("@/lib/supabase/server")`
- Mock crypto: `vi.mock("@/lib/crypto/encryption")`
- Padrao: `beforeEach` cria service, `afterEach` chama `restoreFetch()` + `vi.restoreAllMocks()`
- ESLint: no-console rule ativa -- usar logger se necessario, nunca console.log
- Cobertura: testar success, 401, 403, 429, timeout, network error
- typeof guards: testar com campos null, tipos inesperados

### Tailwind CSS v4 Alert

**CRITICO:** Usar `flex flex-col gap-2` para wrappers label+input. NAO usar `space-y-*` (nao funciona com Radix UI no Tailwind v4).

### Credits Display -- Design Decision

O card do theirStack deve mostrar o consumo de credits de forma visivel:
- Formato: "{usedApiCredits}/{apiCredits} API credits" (ex: "6/200 API credits")
- Se credits restantes < 20% do total, mostrar em cor de alerta
- Fazer fetch dos credits apenas quando o card esta visivel e a integracao esta configurada
- Dois tipos de credits existem (UI e API) -- mostrar apenas API credits (relevante para nosso uso)

### References

- [Spike de validacao: 2026-03-24 -- chamadas reais confirmadas]
- [Source: _bmad-output/planning-artifacts/product-brief-tdec-prospect-2026-03-24.md#MVP Scope]
- [Source: _bmad-output/planning-artifacts/epic-15-technographic-prospecting.md#Story 15.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#External API Service Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security]
- [Source: src/lib/services/base-service.ts -- ExternalService abstract class]
- [Source: src/types/integration.ts -- SERVICE_NAMES, IntegrationStatus, TestConnectionResult]
- [Source: src/components/settings/IntegrationCard.tsx -- IntegrationCardProps]
- [Source: src/app/api/integrations/apollo/test/route.ts -- test route pattern]
- [Source: __tests__/unit/lib/services/apollo.test.ts -- test pattern]
- [theirStack API: https://api.theirstack.com/openapi.json]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Teste integration.test.ts atualizado: SERVICE_NAMES length 6→7, adicionado theirstack aos expects

### Completion Notes List
- Task 1: Adicionado "theirstack" ao SERVICE_NAMES e SERVICE_LABELS em integration.ts. Criado src/types/theirstack.ts com TheirStackCreditsResponse e TheirStackCredits (tipos validados no spike).
- Task 2: Criado TheirStackService estendendo ExternalService. testConnection usa GET /v0/billing/credit-balance (custo 0). getCredits retorna credits parseados com typeof guards em todos os campos. Error handling com mensagens em portugues (401, 403, 429, timeout). Registrado no service factory.
- Task 3: Criado API route POST /api/integrations/theirstack/test seguindo padrao Apollo: auth check → admin check → fetch encrypted key → decrypt → testConnection → return result.
- Task 4: Criado API route GET /api/integrations/theirstack/credits. Retorna { apiCredits, usedApiCredits, uiCredits, usedUiCredits }.
- Task 5: Adicionado theirStack ao array integrations na page. Criado componente TheirStackCreditsBadge que faz fetch dos credits e exibe badge "{used}/{total} API credits" com alerta visual quando < 20% restante.
- Task 6: 23 testes novos (12 service, 6 test route, 5 credits route). Cobertura: success, 401, 429, timeout, network error, typeof guards com campos null/string. Atualizado integration.test.ts existente (length 7, theirstack assertions). Suite completa: 285 files, 5170 passed, 0 failed.

### Change Log
- 2026-03-24: Story 15.1 implementada — integracao theirStack com config, teste conexao e monitoramento credits
- 2026-03-24: Code review fixes — H1: admin check na credits route, H2: handleError delegando ao base class, M1: handleError no fallback testConnection, M2: Math.max no calculo isLow, M3: testes TheirStackCreditsBadge (6 testes), L1: JSDoc getService, L2: Content-Type removido de GET requests

### File List
**Criados:**
- supabase/migrations/00046_add_theirstack_service_name.sql
- src/types/theirstack.ts
- src/lib/services/theirstack.ts
- src/app/api/integrations/theirstack/test/route.ts
- src/app/api/integrations/theirstack/credits/route.ts
- __tests__/unit/lib/services/theirstack.test.ts
- __tests__/unit/api/integrations/theirstack/test.test.ts
- __tests__/unit/api/integrations/theirstack/credits.test.ts
- __tests__/unit/components/settings/TheirStackCreditsBadge.test.tsx

**Modificados:**
- src/types/integration.ts (adicionado "theirstack" ao SERVICE_NAMES e SERVICE_LABELS)
- src/lib/services/base-service.ts (adicionado THEIRSTACK_ERROR ao ERROR_MESSAGES)
- src/lib/services/index.ts (import + registro TheirStackService no factory)
- src/app/(dashboard)/settings/integrations/page.tsx (metadata theirStack + TheirStackCreditsBadge)
- __tests__/unit/types/integration.test.ts (atualizado para 7 services + theirstack assertions)
