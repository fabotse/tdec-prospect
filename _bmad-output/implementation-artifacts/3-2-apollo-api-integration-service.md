# Story 3.2: Apollo API Integration Service

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a service layer for Apollo API,
So that lead searches are executed reliably.

## Acceptance Criteria

1. **Given** the Apollo API key is configured for a tenant
   **When** the ApolloService is called
   **Then** it retrieves and uses the tenant's encrypted API key from api_configs table
   **And** the API key is decrypted server-side only (never exposed to frontend)

2. **Given** a lead search request is made
   **When** the request is executed
   **Then** requests are proxied through API Routes at `/api/integrations/apollo`
   **And** the frontend never makes direct calls to Apollo API

3. **Given** an API request is made
   **When** the request fails with timeout
   **Then** the system automatically retries once (1x retry)
   **And** timeout is set to 10 seconds per request
   **And** total time with retry does not exceed 20 seconds

4. **Given** any error occurs (timeout, API error, network error)
   **When** the error is caught
   **Then** the error message is translated to Portuguese
   **And** the error follows the standard APIErrorResponse format
   **And** technical details are only included in development mode

5. **Given** the ApolloService needs to be implemented
   **When** creating the service
   **Then** it follows the ExternalService base class pattern from architecture
   **And** implements `testConnection()` method for connection testing
   **And** implements `handleError()` method for error translation

6. **Given** a valid search request with filters
   **When** calling `searchPeople()` on ApolloService
   **Then** it transforms frontend filters to Apollo API format
   **And** returns leads in the `LeadRow` format (snake_case)
   **And** the response can be transformed to `Lead` interface using existing `transformLeadRow()`

## Tasks / Subtasks

- [x] Task 1: Create ExternalService base class (AC: #5)
  - [x] Create `src/lib/services/base-service.ts`
  - [x] Implement abstract `name` property
  - [x] Implement abstract `testConnection()` method signature
  - [x] Implement abstract `handleError()` method signature
  - [x] Implement protected `request<T>()` method with:
    - [x] AbortController with 10 second timeout
    - [x] 1x automatic retry on timeout/network error
    - [x] JSON response parsing
    - [x] Error wrapping with ExternalServiceError
  - [x] Create `ExternalServiceError` class extending Error

- [x] Task 2: Create Apollo API types (AC: #6)
  - [x] Create `src/types/apollo.ts`
  - [x] Define `ApolloSearchFilters` interface (frontend format, camelCase)
  - [x] Define `ApolloAPIFilters` interface (Apollo API format)
  - [x] Define `ApolloPersonResponse` interface (API response shape)
  - [x] Define `ApolloSearchResponse` interface (pagination included)
  - [x] Create `transformFiltersToApollo()` function
  - [x] Create `transformApolloToLeadRow()` function

- [x] Task 3: Implement ApolloService (AC: #1, #3, #5)
  - [x] Create `src/lib/services/apollo.ts`
  - [x] Extend ExternalService base class
  - [x] Implement `name = "Apollo"` property
  - [x] Implement `testConnection()` for settings page
  - [x] Implement `handleError()` with Portuguese messages
  - [x] Implement `searchPeople(filters: ApolloSearchFilters)` method
  - [x] Add method to fetch API key from api_configs table (encrypted)
  - [x] Use Supabase service role client for key retrieval

- [x] Task 4: Create API Route for Apollo proxy (AC: #2)
  - [x] Create `src/app/api/integrations/apollo/route.ts`
  - [x] Implement POST handler for search requests
  - [x] Validate request body with Zod
  - [x] Get current user's tenant_id from session
  - [x] Instantiate ApolloService and call searchPeople()
  - [x] Return standardized APISuccessResponse or APIErrorResponse

- [x] Task 5: Create API Route for connection test (AC: #5)
  - [x] Create `src/app/api/integrations/apollo/test/route.ts`
  - [x] Implement POST handler for connection testing
  - [x] Call ApolloService.testConnection()
  - [x] Return success/failure with appropriate message in Portuguese

- [x] Task 6: Create error codes and messages (AC: #4)
  - [x] Update `src/lib/constants/error-codes.ts` with Apollo-specific codes
  - [x] Add `APOLLO_ERROR`, `APOLLO_RATE_LIMIT`, `APOLLO_INVALID_KEY`, `APOLLO_TIMEOUT`
  - [x] Create Portuguese messages for each error code

- [x] Task 7: Update use-leads hook to use Apollo API (AC: #6)
  - [x] Update `src/hooks/use-leads.ts`
  - [x] Implement actual fetch call to `/api/integrations/apollo`
  - [x] Use transformLeadRow() to convert response to Lead interface
  - [x] Handle loading and error states

- [x] Task 8: Write tests
  - [x] Unit tests for ExternalService base class
  - [x] Unit tests for ApolloService (mocked API)
  - [x] Unit tests for filter transformation functions
  - [x] Unit tests for error handling and translation
  - [x] Integration test for API route (mocked Apollo)

- [x] Task 9: Run tests and verify build
  - [x] All new tests pass
  - [x] Existing 666 tests still pass (706 passed, 1 pre-existing failure in LoginPage)
  - [x] Build succeeds
  - [x] Lint passes for all new files
  - [x] Type checking passes

## Dev Notes

### Epic 3 Context

Epic 3 is **Lead Discovery**. This story implements the core integration with Apollo API:

**FRs cobertos:**
- FR6: Sistema traduz busca conversacional em parâmetros de API do Apollo
- FR27: Sistema integra com Apollo API para busca de leads

**NFRs relevantes:**
- NFR-P1: Busca de leads (Apollo) retorna em <3 segundos
- NFR-I1: Sistema trata graciosamente falhas de APIs externas
- NFR-I2: Retry automático 1x para timeouts de API
- NFR-I3: Mensagens de erro traduzidas para português

### Apollo API Reference

**Base URL:** `https://api.apollo.io/api/v1`

**Authentication:** API key in header
```
x-api-key: {api_key}
```

**People API Search Endpoint:** `POST /mixed_people/api_search`

> ⚠️ **IMPORTANTE**: Este endpoint requer **Master API Key**. Retorna dados limitados para prospecção.

**Request:** Query parameters (não body JSON)
```
POST /mixed_people/api_search?person_titles[]=CEO&person_locations[]=Brazil&page=1&per_page=25
```

**Query Parameters:**
- `person_titles[]` - Job titles (array)
- `person_locations[]` - Person locations (array)
- `organization_locations[]` - Company HQ locations (array)
- `organization_num_employees_ranges[]` - Employee ranges como "11,50" (array)
- `q_organization_domains_list[]` - Company domains (array)
- `q_keywords` - Keywords string
- `page` - Page number
- `per_page` - Results per page (max 100)

**Response Shape (api_search - dados limitados):**
```json
{
  "total_entries": 232764882,
  "people": [
    {
      "id": "67bdafd0c3a4c50001bbd7c2",
      "first_name": "Andrew",
      "last_name_obfuscated": "Hu***n",
      "title": "CEO",
      "last_refreshed_at": "2025-11-04T23:20:32.690+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Scicomm Media",
        "has_industry": true,
        "has_phone": false,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": false,
        "has_revenue": false,
        "has_employee_count": true
      }
    }
  ]
}
```

> **Nota:** Para obter dados completos (email, phone, last_name), usar endpoint **People Enrichment** (story futura).

### Architecture Patterns

**ExternalService Base Class Pattern (from architecture.md):**

```typescript
// src/lib/services/base-service.ts
export class ExternalServiceError extends Error {
  constructor(
    public service: string,
    public statusCode: number,
    public userMessage: string,
    public details?: unknown
  ) {
    super(userMessage);
    this.name = 'ExternalServiceError';
  }
}

export abstract class ExternalService {
  abstract name: string;
  abstract testConnection(): Promise<boolean>;
  abstract handleError(error: unknown): ExternalServiceError;

  protected async request<T>(
    url: string,
    options: RequestInit,
    retryCount = 0
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 seconds

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw this.handleError(new Error(`HTTP ${response.status}`));
      }

      return response.json();
    } catch (error) {
      // Retry once on timeout/network error
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('fetch')) &&
        retryCount < 1
      ) {
        return this.request<T>(url, options, retryCount + 1);
      }
      throw this.handleError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

**ApolloService Implementation:**

```typescript
// src/lib/services/apollo.ts
import { ExternalService, ExternalServiceError } from './base-service';
import { createServerClient } from '@/lib/supabase/server';
import type { ApolloSearchFilters, ApolloSearchResponse } from '@/types/apollo';

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

export class ApolloService extends ExternalService {
  name = 'Apollo';
  private apiKey: string | null = null;
  private tenantId: string;

  constructor(tenantId: string) {
    super();
    this.tenantId = tenantId;
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('api_configs')
      .select('encrypted_key')
      .eq('tenant_id', this.tenantId)
      .eq('service_name', 'apollo')
      .single();

    if (error || !data) {
      throw new ExternalServiceError(
        this.name,
        401,
        'API key do Apollo não configurada. Configure em Configurações > Integrações.'
      );
    }

    // Note: encrypted_key is already decrypted by Supabase Vault
    this.apiKey = data.encrypted_key;
    return this.apiKey;
  }

  async testConnection(): Promise<boolean> {
    try {
      const apiKey = await this.getApiKey();
      // Use a minimal search to test connection
      const response = await this.request<ApolloSearchResponse>(
        `${APOLLO_BASE_URL}/mixed_people/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
          },
          body: JSON.stringify({ per_page: 1 }),
        }
      );
      return !!response.people;
    } catch {
      return false;
    }
  }

  handleError(error: unknown): ExternalServiceError {
    if (error instanceof ExternalServiceError) return error;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Map common errors to Portuguese messages
    if (errorMessage.includes('401')) {
      return new ExternalServiceError(
        this.name,
        401,
        'API key do Apollo inválida ou expirada.',
        error
      );
    }
    if (errorMessage.includes('429')) {
      return new ExternalServiceError(
        this.name,
        429,
        'Limite de requisições do Apollo atingido. Tente novamente em alguns minutos.',
        error
      );
    }
    if (errorMessage.includes('AbortError') || errorMessage.includes('timeout')) {
      return new ExternalServiceError(
        this.name,
        408,
        'Tempo limite excedido ao conectar com Apollo. Tente novamente.',
        error
      );
    }

    return new ExternalServiceError(
      this.name,
      500,
      'Erro ao comunicar com Apollo. Tente novamente.',
      error
    );
  }

  async searchPeople(filters: ApolloSearchFilters): Promise<LeadRow[]> {
    const apiKey = await this.getApiKey();
    const apolloFilters = transformFiltersToApollo(filters);

    const response = await this.request<ApolloSearchResponse>(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify(apolloFilters),
      }
    );

    return response.people.map(person => transformApolloToLeadRow(person, this.tenantId));
  }
}
```

### Types

```typescript
// src/types/apollo.ts

// Frontend filter format (camelCase)
export interface ApolloSearchFilters {
  industries?: string[];
  companySizes?: string[];      // e.g., ["11-50", "51-200"]
  locations?: string[];         // e.g., ["Sao Paulo, Brazil"]
  titles?: string[];            // e.g., ["CEO", "CTO"]
  keywords?: string;
  domains?: string[];           // Company domains
  page?: number;
  perPage?: number;
}

// Apollo API format
export interface ApolloAPIFilters {
  q_organization_domains?: string[];
  person_titles?: string[];
  person_locations?: string[];
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  q_keywords?: string;
  page?: number;
  per_page?: number;
}

// Apollo person in API response
export interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_numbers?: Array<{ raw_number: string }>;
  organization?: {
    name: string;
    estimated_num_employees?: number;
    industry?: string;
  };
  city?: string;
  state?: string;
  country?: string;
  title?: string;
  linkedin_url?: string;
}

// Apollo search response
export interface ApolloSearchResponse {
  people: ApolloPerson[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

// Transform functions
export function transformFiltersToApollo(filters: ApolloSearchFilters): ApolloAPIFilters {
  const apolloFilters: ApolloAPIFilters = {
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 25,
  };

  if (filters.domains?.length) {
    apolloFilters.q_organization_domains = filters.domains;
  }
  if (filters.titles?.length) {
    apolloFilters.person_titles = filters.titles;
  }
  if (filters.locations?.length) {
    apolloFilters.person_locations = filters.locations;
    apolloFilters.organization_locations = filters.locations;
  }
  if (filters.companySizes?.length) {
    // Transform "11-50" to "11,50" format
    apolloFilters.organization_num_employees_ranges = filters.companySizes.map(
      size => size.replace('-', ',')
    );
  }
  if (filters.keywords) {
    apolloFilters.q_keywords = filters.keywords;
  }

  return apolloFilters;
}

export function transformApolloToLeadRow(
  person: ApolloPerson,
  tenantId: string
): LeadRow {
  const location = [person.city, person.state, person.country]
    .filter(Boolean)
    .join(', ');

  const companySize = person.organization?.estimated_num_employees
    ? getCompanySizeRange(person.organization.estimated_num_employees)
    : null;

  return {
    id: crypto.randomUUID(), // New lead gets new UUID
    tenant_id: tenantId,
    apollo_id: person.id,
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    phone: person.phone_numbers?.[0]?.raw_number ?? null,
    company_name: person.organization?.name ?? null,
    company_size: companySize,
    industry: person.organization?.industry ?? null,
    location: location || null,
    title: person.title ?? null,
    linkedin_url: person.linkedin_url ?? null,
    status: 'novo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function getCompanySizeRange(employees: number): string {
  if (employees <= 10) return '1-10';
  if (employees <= 50) return '11-50';
  if (employees <= 200) return '51-200';
  if (employees <= 500) return '201-500';
  if (employees <= 1000) return '501-1000';
  return '1000+';
}
```

### API Route Structure

```typescript
// src/app/api/integrations/apollo/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { ApolloService } from '@/lib/services/apollo';
import type { APISuccessResponse, APIErrorResponse } from '@/types/api';

const searchSchema = z.object({
  industries: z.array(z.string()).optional(),
  companySizes: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  titles: z.array(z.string()).optional(),
  keywords: z.string().optional(),
  domains: z.array(z.string()).optional(),
  page: z.number().optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    // Get current user and tenant
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json<APIErrorResponse>(
        { error: { code: 'UNAUTHORIZED', message: 'Não autenticado' } },
        { status: 401 }
      );
    }

    // Get tenant_id from user metadata
    const tenantId = user.user_metadata?.tenant_id;
    if (!tenantId) {
      return NextResponse.json<APIErrorResponse>(
        { error: { code: 'FORBIDDEN', message: 'Tenant não encontrado' } },
        { status: 403 }
      );
    }

    // Validate request body
    const body = await request.json();
    const parseResult = searchSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Filtros de busca inválidos',
            details: process.env.NODE_ENV === 'development' ? parseResult.error.issues : undefined,
          },
        },
        { status: 400 }
      );
    }

    // Execute search
    const apolloService = new ApolloService(tenantId);
    const leads = await apolloService.searchPeople(parseResult.data);

    return NextResponse.json<APISuccessResponse<typeof leads>>({
      data: leads,
      meta: {
        total: leads.length,
        page: parseResult.data.page ?? 1,
        limit: parseResult.data.perPage ?? 25,
      },
    });
  } catch (error) {
    console.error('[Apollo API Route] Error:', error);

    if (error instanceof ExternalServiceError) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: 'APOLLO_ERROR',
            message: error.userMessage,
            details: process.env.NODE_ENV === 'development' ? error.details : undefined,
          },
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json<APIErrorResponse>(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno ao buscar leads',
        },
      },
      { status: 500 }
    );
  }
}
```

### Project Structure Notes

**New files to create:**

```
src/
├── lib/
│   ├── services/
│   │   ├── base-service.ts        # ExternalService abstract class
│   │   ├── apollo.ts              # ApolloService implementation
│   │   └── index.ts               # Barrel export
│   └── constants/
│       └── error-codes.ts         # Update with Apollo codes
├── types/
│   └── apollo.ts                  # Apollo-specific types
└── app/api/integrations/apollo/
    ├── route.ts                   # POST - search leads
    └── test/
        └── route.ts               # POST - test connection

__tests__/
├── unit/
│   ├── lib/services/
│   │   ├── base-service.test.ts
│   │   └── apollo.test.ts
│   └── types/
│       └── apollo.test.ts
└── integration/
    └── apollo-api.test.ts
```

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| ExternalService Pattern | Extend base class, implement abstract methods |
| Timeout | 10 seconds via AbortController |
| Retry | 1x automatic on timeout/network error |
| Error Messages | All in Portuguese |
| API Response | APISuccessResponse/APIErrorResponse format |
| Naming | snake_case for LeadRow, camelCase for filters |
| Security | API key never exposed to frontend |
| Proxy | All Apollo calls through API Routes |

### Previous Story Intelligence (Story 3.1)

**Key patterns established:**
- `LeadRow` interface with snake_case fields
- `transformLeadRow()` function to convert to `Lead` interface
- `useLeads` hook structure with TanStack Query
- 666 tests passing
- `lead_status` enum: 'novo', 'em_campanha', 'interessado', 'oportunidade', 'nao_interessado'

**Files to update:**
- `src/hooks/use-leads.ts` - Add actual API call

### Git Intelligence

**Commit pattern:**
```
feat(story-3.2): apollo api integration service
```

**Branch:** `epic/3-lead-discovery`

### What NOT to Do

- Do NOT expose Apollo API key to frontend
- Do NOT make direct Apollo API calls from React components
- Do NOT skip retry logic - it's required by NFR-I2
- Do NOT return errors in English - translate to Portuguese
- Do NOT change LeadRow interface - it's already established in Story 3.1
- Do NOT implement AI search translation - that's Story 3.4
- Do NOT implement filter UI - that's Story 3.3
- Do NOT create UI components - this is a service layer story

### Testing Strategy

```typescript
// __tests__/unit/lib/services/base-service.test.ts
describe('ExternalService', () => {
  describe('request()', () => {
    it('makes successful request');
    it('times out after 10 seconds');
    it('retries once on timeout');
    it('does not retry on 4xx errors');
    it('passes through service error');
  });

  describe('ExternalServiceError', () => {
    it('contains service name');
    it('contains status code');
    it('contains user message');
    it('contains details in dev mode');
  });
});

// __tests__/unit/lib/services/apollo.test.ts
describe('ApolloService', () => {
  describe('testConnection()', () => {
    it('returns true on successful connection');
    it('returns false on failed connection');
    it('throws when API key not configured');
  });

  describe('handleError()', () => {
    it('translates 401 to Portuguese');
    it('translates 429 to Portuguese');
    it('translates timeout to Portuguese');
    it('handles unknown errors gracefully');
  });

  describe('searchPeople()', () => {
    it('transforms filters correctly');
    it('returns LeadRow array');
    it('sets default status to novo');
    it('handles empty response');
  });
});

// __tests__/unit/types/apollo.test.ts
describe('Apollo types', () => {
  describe('transformFiltersToApollo()', () => {
    it('transforms companySizes format');
    it('handles empty filters');
    it('sets default pagination');
  });

  describe('transformApolloToLeadRow()', () => {
    it('maps all fields correctly');
    it('handles missing optional fields');
    it('generates new UUID for id');
    it('sets tenant_id');
    it('calculates company size range');
    it('formats location string');
  });
});
```

### Dependencies

**Already installed:**
- `zod` - Validation
- `@supabase/ssr` - Server-side Supabase client
- `@tanstack/react-query` - Data fetching

**No new dependencies required** - This story uses native fetch and existing libraries.

### This Story's Scope

**IN SCOPE:**
- ExternalService base class
- ApolloService implementation
- API Route for search proxy
- API Route for connection test
- Error codes and Portuguese messages
- Update use-leads hook with actual API call
- Unit and integration tests

**OUT OF SCOPE (future stories):**
- Story 3.3: Traditional Filter Search UI
- Story 3.4: AI Conversational Search
- Story 3.5: Lead Table Display
- Story 3.6: Lead Selection
- Story 3.7: Saved Filters

### References

- [Source: architecture.md#API-Communication-Patterns] - ExternalService pattern
- [Source: architecture.md#Implementation-Patterns] - Error handling, retry logic
- [Source: architecture.md#Project-Structure] - File organization
- [Source: epics.md#Story-3.2] - Acceptance criteria
- [Source: Story-3.1] - LeadRow interface, transformLeadRow()
- [Source: Apollo API Docs] - https://apolloio.github.io/apollo-api-docs/

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

**2026-01-30: Correção do endpoint Apollo API (erro 403)**

Durante testes de integração, identificamos erro 403 "Acesso negado ao Apollo". Após análise da documentação oficial da API, descobrimos que:

1. **Endpoint incorreto**: Estava usando `/v1/mixed_people/search` (deprecated), correto é `/v1/mixed_people/api_search`
2. **Formato de parâmetros incorreto**: Estava enviando filtros no body JSON, correto é via query parameters
3. **Resposta da API diferente**: `api_search` retorna dados limitados para prospecção

**Correções aplicadas:**

| Arquivo | Mudança |
|---------|---------|
| `apollo.ts:39` | Endpoint: `/v1/mixed_people/search` → `/v1/mixed_people/api_search` |
| `apollo.ts:228-300` | Novo método `buildQueryString()` para construir query params |
| `types/apollo.ts` | Tipos atualizados: `ApolloPerson` com `last_name_obfuscated`, flags `has_email`, `has_direct_phone` |
| Testes | Mocks atualizados para nova estrutura de resposta |

**⚠️ IMPORTANTE - Limitações da API `api_search`:**

A API `api_search` é otimizada para prospecção e **NÃO retorna dados completos**:
- `last_name` vem ofuscado (ex: `Si***a` em vez de `Silva`)
- `email` e `phone` não são retornados (apenas flags `has_email: boolean`, `has_direct_phone: string`)
- Dados de localização não são retornados (apenas flags `has_city`, `has_state`, `has_country`)
- `industry` e `employee_count` não são retornados (apenas flags)

**Para obter dados completos**, será necessário usar o endpoint **People Enrichment** em story futura. Por enquanto, leads retornados terão campos `email`, `phone`, `location`, `industry`, `company_size` como `null`.

**Testes atualizados:** 30/30 passando (12 apollo.test.ts + 18 types/apollo.test.ts)

### Completion Notes List

- **Task 1**: ExternalService base class already existed from Story 2.3. Extended with `handleError()` method and updated `ExternalServiceError` with `userMessage` and `details` properties.
- **Task 2**: Created comprehensive Apollo types including `ApolloSearchFilters`, `ApolloAPIFilters`, `ApolloPerson`, `ApolloSearchResponse`, `transformFiltersToApollo()`, and `transformApolloToLeadRow()`.
- **Task 3**: Extended ApolloService with `searchPeople()` method, private `getApiKey()` for tenant-based API key retrieval, and `handleError()` override with Apollo-specific Portuguese messages.
- **Task 4**: Created API route at `/api/integrations/apollo` with POST handler, Zod validation, tenant authentication, and standardized response format.
- **Task 5**: Created API route at `/api/integrations/apollo/test` for connection testing with Portuguese messages.
- **Task 6**: Created `src/lib/constants/error-codes.ts` with Apollo-specific error codes and Portuguese messages.
- **Task 7**: Updated `use-leads.ts` hook to make actual API calls to `/api/integrations/apollo`, added `useSearchLeads()` mutation hook.
- **Task 8**: Created/updated comprehensive unit tests for base-service, apollo service, apollo types, and use-leads hook. All new tests pass.
- **Task 9**: Verified build succeeds, lint passes, 706 tests pass (1 pre-existing failure in LoginPage unrelated to this story).

### File List

**New Files:**
- `src/types/apollo.ts` - Apollo API types and transform functions
- `src/types/api.ts` - Centralized API response types (Code Review fix)
- `src/app/api/integrations/apollo/route.ts` - Apollo search API route
- `src/app/api/integrations/apollo/test/route.ts` - Apollo connection test API route
- `src/lib/constants/error-codes.ts` - Error codes and Portuguese messages
- `__tests__/unit/types/apollo.test.ts` - Apollo types unit tests
- `__tests__/integration/apollo-api.test.ts` - Integration tests for Apollo API route (Code Review fix)

**Modified Files:**
- `src/lib/services/base-service.ts` - Added `handleError()` method, updated `ExternalServiceError`, network error retry fix
- `src/lib/services/apollo.ts` - Extended with `searchPeople()`, `handleError()`, `getApiKey()`, `buildQueryString()`
- `src/hooks/use-leads.ts` - Added Apollo API integration, fixed `useLeadCount`
- `src/types/index.ts` - Added apollo and api types export
- `src/app/(dashboard)/leads/page.tsx` - Updated for new leads API
- `__tests__/unit/lib/services/base-service.test.ts` - Added tests for new properties and network retry
- `__tests__/unit/lib/services/apollo.test.ts` - Added Story 3.2 tests, updated mocks for api_search
- `__tests__/unit/hooks/use-leads.test.tsx` - Updated for new API implementation
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated status

**2026-01-30 Hotfix (Debug erro 403):**
- `src/lib/services/apollo.ts` - Endpoint corrigido para `api_search`, parâmetros via query string
- `src/types/apollo.ts` - Tipos atualizados para resposta limitada da api_search
- `__tests__/unit/types/apollo.test.ts` - Testes reescritos para novos tipos
- `__tests__/unit/lib/services/apollo.test.ts` - Mocks atualizados para nova estrutura

**2026-01-31 Code Review Fixes:**
- `src/lib/services/base-service.ts:187-211` - Corrigido retry para incluir network errors (AC#3)
- `src/lib/services/apollo.ts:8,197` - Corrigido comentário (api_search) e adicionado Cache-Control header
- `src/types/apollo.ts:106-115` - Documentada função transformFiltersToApollo
- `src/types/api.ts` - Criados tipos centralizados APISuccessResponse/APIErrorResponse
- `src/app/api/integrations/apollo/route.ts` - Removidos tipos duplicados, usa types/api
- `src/hooks/use-leads.ts` - Removidos tipos duplicados, corrigido useLeadCount
- `__tests__/unit/lib/services/base-service.test.ts` - Adicionado teste para network error retry
- `__tests__/integration/apollo-api.test.ts` - Criado integration test faltante
