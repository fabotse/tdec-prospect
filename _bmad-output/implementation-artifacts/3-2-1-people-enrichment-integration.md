# Story 3.2.1: People Enrichment Integration

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to integrate with Apollo's People Enrichment API,
So that leads have complete data (email, phone, full last_name) instead of the limited data from api_search.

## Context

Esta story é uma **extensão da Story 3.2** identificada durante a implementação. A API `api_search` retorna dados ofuscados/limitados para prospecção. Para obter dados completos dos leads selecionados, precisamos do endpoint **People Enrichment**.

**Problema identificado:**
- `api_search` retorna `last_name_obfuscated` (ex: `Si***a` em vez de `Silva`)
- `api_search` não retorna `email` nem `phone` (apenas flags `has_email`, `has_direct_phone`)
- Para uso real, precisamos enriquecer leads individualmente ou em lote

## Acceptance Criteria

1. **Given** a lead was returned from api_search with `apollo_id`
   **When** the user wants to get complete lead data
   **Then** the system calls People Enrichment API with the apollo_id
   **And** updates the lead record with complete data (email, phone, last_name, location, industry)

2. **Given** the People Enrichment API is called
   **When** requesting email data
   **Then** the `reveal_personal_emails` flag is set to true
   **And** if the person is in GDPR region, personal email is NOT returned (Apollo policy)

3. **Given** the People Enrichment API is called
   **When** requesting phone data
   **Then** the `reveal_phone_number` flag is set to true
   **And** a webhook_url is configured for async phone delivery (required by Apollo)

4. **Given** multiple leads need enrichment
   **When** calling the bulk endpoint
   **Then** up to 10 leads can be enriched per API call
   **And** rate limits are respected (50% of per-minute limit)

5. **Given** enrichment is performed
   **When** credits are consumed
   **Then** the system tracks credit usage
   **And** warns when credits are low (optional - future enhancement)

6. **Given** the ApolloService is extended
   **When** implementing enrichment methods
   **Then** it follows the existing ExternalService patterns from Story 3.2
   **And** error handling uses Portuguese messages

## Tasks / Subtasks

- [ ] Task 1: Extend Apollo types for Enrichment API (AC: #1, #2, #3)
  - [ ] Add `ApolloEnrichmentRequest` interface
  - [ ] Add `ApolloEnrichmentResponse` interface
  - [ ] Add `ApolloBulkEnrichmentRequest` interface
  - [ ] Add `ApolloBulkEnrichmentResponse` interface
  - [ ] Add `transformEnrichmentToLead()` function

- [ ] Task 2: Extend ApolloService with enrichment methods (AC: #1, #6)
  - [ ] Add `enrichPerson(apolloId: string, options: EnrichmentOptions)` method
  - [ ] Add `enrichPeople(apolloIds: string[], options: EnrichmentOptions)` bulk method
  - [ ] Add Portuguese error messages for enrichment-specific errors
  - [ ] Handle GDPR compliance response (no personal email returned)

- [ ] Task 3: Create API Routes for enrichment (AC: #1, #4)
  - [ ] Create `src/app/api/integrations/apollo/enrich/route.ts` - Single person
  - [ ] Create `src/app/api/integrations/apollo/enrich/bulk/route.ts` - Up to 10 people
  - [ ] Implement rate limiting awareness

- [ ] Task 4: Update Lead service to use enrichment (AC: #1)
  - [ ] Create function to update lead record after enrichment
  - [ ] Handle partial data updates (only update fields that were enriched)
  - [ ] Log enrichment activity

- [ ] Task 5: Create useEnrichLead hook (AC: #1)
  - [ ] TanStack Query mutation for single lead enrichment
  - [ ] TanStack Query mutation for bulk enrichment
  - [ ] Optimistic updates for UX

- [ ] Task 6: Write tests
  - [ ] Unit tests for enrichment types and transforms
  - [ ] Unit tests for ApolloService enrichment methods (mocked)
  - [ ] Integration tests for API routes

- [ ] Task 7: Run tests and verify build
  - [ ] All new tests pass
  - [ ] Existing tests still pass
  - [ ] Build succeeds
  - [ ] TypeScript passes

## Dev Notes

### Apollo People Enrichment API Reference

**Base URL:** `https://api.apollo.io/api/v1`

**Single Person Endpoint:** `POST /people/match`

**Bulk Endpoint:** `POST /people/bulk_match`

**Authentication:**
```
x-api-key: {api_key}
```
or
```
Authorization: Bearer {api_key}
```

**Request Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Apollo's unique person ID (from api_search) |
| `first_name` | string | Person's first name |
| `last_name` | string | Person's last name |
| `email` | string | Person's email (for lookup) |
| `linkedin_url` | string | LinkedIn profile URL |
| `domain` | string | Company domain |
| `organization_name` | string | Company name |
| `reveal_personal_emails` | boolean | Return personal emails (default: false) |
| `reveal_phone_number` | boolean | Return phone numbers (default: false) |
| `webhook_url` | string | **Required** if reveal_phone_number=true |

**Response Shape:**

```json
{
  "person": {
    "id": "67bdafd0c3a4c50001bbd7c2",
    "first_name": "Andrew",
    "last_name": "Hudson",
    "email": "andrew@company.com",
    "email_status": "verified",
    "title": "CEO",
    "city": "São Paulo",
    "state": "SP",
    "country": "Brazil",
    "linkedin_url": "https://linkedin.com/in/andrew-hudson",
    "photo_url": "https://...",
    "employment_history": [...]
  },
  "organization": {
    "id": "org123",
    "name": "Scicomm Media",
    "domain": "scicomm.com",
    "industry": "Technology",
    "estimated_num_employees": 150
  },
  "waterfall": {
    "status": "accepted",
    "message": "Phone number will be delivered via webhook"
  }
}
```

**Rate Limits:**
- **Standard:** 600 calls/hour per endpoint
- **Bulk endpoint:** 50% of per-minute limit

**Credits:**
- 1 credit per enrichment
- Additional credits for waterfall (phone/email lookup from external sources)

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| ExternalService Pattern | Extend existing ApolloService |
| Timeout | 10 seconds via AbortController (inherited) |
| Retry | 1x automatic on timeout/network error (inherited) |
| Error Messages | All in Portuguese |
| API Response | APISuccessResponse/APIErrorResponse format |
| Security | API key never exposed to frontend |
| Proxy | All Apollo calls through API Routes |

### Types to Add

```typescript
// src/types/apollo.ts (extend)

export interface EnrichmentOptions {
  revealPersonalEmails?: boolean;
  revealPhoneNumber?: boolean;
  webhookUrl?: string; // Required if revealPhoneNumber=true
}

export interface ApolloEnrichmentRequest {
  id?: string;              // Apollo person ID (preferred)
  first_name?: string;
  last_name?: string;
  email?: string;
  linkedin_url?: string;
  domain?: string;
  organization_name?: string;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  webhook_url?: string;
}

export interface ApolloEnrichedPerson {
  id: string;
  first_name: string;
  last_name: string;           // FULL last name (not obfuscated)
  email: string | null;
  email_status: 'verified' | 'invalid' | null;
  title: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  employment_history: ApolloEmployment[];
}

export interface ApolloEnrichmentResponse {
  person: ApolloEnrichedPerson | null;
  organization: ApolloOrganization | null;
  waterfall?: {
    status: 'accepted' | 'pending' | 'completed';
    message: string;
  };
}

export interface ApolloBulkEnrichmentRequest {
  details: ApolloEnrichmentRequest[];
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
  webhook_url?: string;
}

export interface ApolloBulkEnrichmentResponse {
  matches: ApolloEnrichmentResponse[];
  missing: number;
}
```

### Service Methods to Add

```typescript
// src/lib/services/apollo.ts (extend)

/**
 * Enrich a single person with complete data
 * @param apolloId - Apollo person ID from api_search
 * @param options - Enrichment options (emails, phone)
 */
async enrichPerson(
  apolloId: string,
  options?: EnrichmentOptions
): Promise<ApolloEnrichedPerson | null> {
  const apiKey = await this.getApiKey();

  const body: ApolloEnrichmentRequest = {
    id: apolloId,
    reveal_personal_emails: options?.revealPersonalEmails ?? false,
    reveal_phone_number: options?.revealPhoneNumber ?? false,
  };

  if (options?.revealPhoneNumber && options?.webhookUrl) {
    body.webhook_url = options.webhookUrl;
  }

  const response = await this.request<ApolloEnrichmentResponse>(
    `${APOLLO_API_BASE}/api/v1/people/match`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  return response.person;
}

/**
 * Bulk enrich up to 10 people
 * @param apolloIds - Array of Apollo person IDs (max 10)
 * @param options - Enrichment options
 */
async enrichPeople(
  apolloIds: string[],
  options?: EnrichmentOptions
): Promise<ApolloEnrichedPerson[]> {
  if (apolloIds.length > 10) {
    throw new ExternalServiceError(
      this.name,
      400,
      'Máximo de 10 leads por requisição de enriquecimento em lote.'
    );
  }

  const apiKey = await this.getApiKey();

  const body: ApolloBulkEnrichmentRequest = {
    details: apolloIds.map(id => ({ id })),
    reveal_personal_emails: options?.revealPersonalEmails ?? false,
    reveal_phone_number: options?.revealPhoneNumber ?? false,
    webhook_url: options?.webhookUrl,
  };

  const response = await this.request<ApolloBulkEnrichmentResponse>(
    `${APOLLO_API_BASE}/api/v1/people/bulk_match`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  return response.matches
    .filter(m => m.person !== null)
    .map(m => m.person!);
}
```

### API Route Structure

```
src/app/api/integrations/apollo/
├── route.ts                    # Existing - POST search
├── test/route.ts               # Existing - POST test connection
└── enrich/
    ├── route.ts                # NEW - POST single enrichment
    └── bulk/
        └── route.ts            # NEW - POST bulk enrichment (max 10)
```

### Error Messages to Add

```typescript
// src/lib/constants/error-codes.ts (extend)

APOLLO_ENRICHMENT_NOT_FOUND: 'Pessoa não encontrada no Apollo para enriquecimento.',
APOLLO_ENRICHMENT_GDPR: 'Email pessoal não disponível devido a regulamentações GDPR.',
APOLLO_BULK_LIMIT_EXCEEDED: 'Máximo de 10 leads por requisição de enriquecimento em lote.',
APOLLO_CREDITS_INSUFFICIENT: 'Créditos insuficientes no Apollo para enriquecimento.',
APOLLO_WEBHOOK_REQUIRED: 'Webhook URL obrigatória para obter telefone.',
```

### Previous Story Intelligence (Story 3.2)

**Established patterns:**
- `ApolloService` extends `ExternalService` base class
- `handleError()` translates to Portuguese messages
- `getApiKey()` retrieves encrypted key from `api_configs`
- API Routes validate with Zod and return standard response format
- `transformApolloToLeadRow()` for data transformation

**Files to update:**
- `src/types/apollo.ts` - Add enrichment types
- `src/lib/services/apollo.ts` - Add enrichment methods
- `src/lib/constants/error-codes.ts` - Add enrichment error codes

### Git Intelligence

**Commit pattern:**
```
feat(story-3.2.1): apollo people enrichment integration
```

**Branch:** `epic/3-lead-discovery`

### What NOT to Do

- Do NOT expose API key to frontend
- Do NOT call enrichment directly from React components
- Do NOT enrich all leads automatically (credits are consumed)
- Do NOT skip webhook_url when requesting phone numbers
- Do NOT ignore GDPR response (person.email may be null for EU persons)
- Do NOT implement UI for enrichment - this is service layer only

### Testing Strategy

```typescript
// __tests__/unit/lib/services/apollo-enrichment.test.ts
describe('ApolloService - Enrichment', () => {
  describe('enrichPerson()', () => {
    it('enriches person by apollo_id');
    it('returns full last_name (not obfuscated)');
    it('returns email when reveal_personal_emails=true');
    it('returns null email for GDPR region');
    it('handles person not found');
    it('throws when webhook_url missing for phone');
  });

  describe('enrichPeople()', () => {
    it('enriches up to 10 people');
    it('throws error for more than 10 people');
    it('filters out null results');
  });
});

// __tests__/unit/types/apollo-enrichment.test.ts
describe('Apollo Enrichment Types', () => {
  describe('transformEnrichmentToLead()', () => {
    it('maps all enriched fields to LeadRow');
    it('handles null optional fields');
    it('preserves apollo_id');
    it('updates existing lead fields');
  });
});
```

### This Story's Scope

**IN SCOPE:**
- ApolloService enrichment methods
- API Routes for enrichment (single + bulk)
- Enrichment types and transforms
- Error handling with Portuguese messages
- Unit tests

**OUT OF SCOPE (future stories):**
- UI for "Enrich Lead" button (Story 3.5 or 3.6)
- Automatic enrichment on lead selection
- Credit tracking dashboard
- Webhook receiver for async phone delivery

### References

- [Source: architecture.md#API-Communication-Patterns] - ExternalService pattern
- [Source: architecture.md#Implementation-Patterns] - Error handling
- [Source: Story-3.2] - ApolloService base implementation
- [Source: Apollo API Docs] - https://docs.apollo.io/reference/people-enrichment
- [Source: Apollo Bulk Enrichment] - https://docs.apollo.io/reference/bulk-people-enrichment

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

