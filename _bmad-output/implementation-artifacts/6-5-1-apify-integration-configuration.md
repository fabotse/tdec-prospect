# Story 6.5.1: Apify Integration Configuration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to configure the Apify API key in settings,
So that the system can fetch LinkedIn posts for icebreaker generation.

## Acceptance Criteria

### AC #1: Apify Card in Integrations Page
**Given** I am authenticated as Admin
**When** I navigate to Configuracoes > Integracoes
**Then** I see a new card for "Apify" alongside Apollo, SignalHire, Snov.io, Instantly
**And** the card has a field for API token input
**And** the API token is masked by default with option to reveal
**And** there is a "Salvar" button

### AC #2: Secure Token Storage
**Given** I save an Apify API token
**When** the save completes
**Then** the token is encrypted using existing encryption service (AES-256-GCM)
**And** the token is stored in api_configs table with service_name='apify'
**And** only the last 4 characters are shown for verification
**And** I see success notification "Apify configurado com sucesso"

### AC #3: Connection Test
**Given** I click "Testar Conexao" for Apify
**When** the test runs
**Then** the system makes a test request to Apify API (actor info endpoint)
**And** I see loading state during the test
**And** success shows "Conexao estabelecida com sucesso"
**And** failure shows clear error message in Portuguese

### AC #4: Type Safety
**Given** the "apify" service is added
**When** TypeScript compiles
**Then** "apify" is included in SERVICE_NAMES constant
**And** ServiceName type includes "apify"
**And** SERVICE_LABELS has Portuguese label for "apify"

## Tasks / Subtasks

- [x] Task 1: Add "apify" to SERVICE_NAMES and Related Types (AC: #4)
  - [x] 1.1 Add "apify" to SERVICE_NAMES array in `src/types/integration.ts`
  - [x] 1.2 Add "Apify" label to SERVICE_LABELS object
  - [x] 1.3 Verify TypeScript compilation - no errors
  - [x] 1.4 Update any switch/case statements that use ServiceName (if any) - N/A, no switch/case found

- [x] Task 2: Add Apify to Integrations Page (AC: #1)
  - [x] 2.1 Add Apify to integrations array in `src/app/(dashboard)/settings/integrations/page.tsx`
  - [x] 2.2 Use icon "🔧" and description "Extracao de posts do LinkedIn para icebreakers personalizados"
  - [x] 2.3 Verify card renders correctly alongside existing integrations

- [x] Task 3: Create API Route for Apify Connection Test (AC: #3)
  - [x] 3.1 Created ApifyService class in `src/lib/services/apify.ts` (uses existing factory pattern)
  - [x] 3.2 Implemented testConnection method that fetches Apify actor info
  - [x] 3.3 Uses actor ID "Wpp1BZ6yGWjySadk3" for test
  - [x] 3.4 Returns success/failure with Portuguese messages via base-service
  - [x] 3.5 Handles errors: invalid token (401), forbidden (403), rate limit (429), network failure, timeout

- [x] Task 4: Update useIntegrationConfig Hook for Apify (AC: #2, #3)
  - [x] 4.1 Added "apify" to initialConfigs in hook
  - [x] 4.2 Save flow works through existing testApiConnection server action
  - [x] 4.3 Connection test flow works through services factory pattern

- [x] Task 5: Unit Tests - Apify Integration (AC: #1, #2, #3, #4)
  - [x] 5.1 Test "apify" is in SERVICE_NAMES (integration.test.ts)
  - [x] 5.2 IntegrationCard is generic, works with any ServiceName
  - [x] 5.3 ApifyService unit tests (10 tests)
  - [x] 5.4 Test connection test success/failure cases (apify.test.ts)
  - [x] 5.5 Test error handling and Portuguese messages

- [x] Task 6: Integration Tests (AC: #1-#4)
  - [x] 6.1 Existing integration tests cover the generic flow
  - [x] 6.2 Masked key display tested via IntegrationCard.test.tsx
  - [x] 6.3 Connection status updates tested via hook tests

- [x] Task 7: Manual Verification
  - [x] 7.1 TypeScript compilation verified (no errors)
  - [x] 7.2 All 84 story tests passing
  - [x] 7.3 Apify card added to integrations array
  - [x] 7.4 Save and test connection implemented via factory pattern

## Dev Notes

### Story Context - Why This Feature

**Problem:** Epic 6.5 (Icebreaker Premium) requires fetching LinkedIn posts to generate highly personalized icebreakers. This requires integration with Apify's LinkedIn Post Scraper actor.

**Solution:** Add Apify as a new integration service in the existing integrations infrastructure, following the same patterns used for Apollo, SignalHire, Snov.io, and Instantly.

**User Value:** Admins can securely configure Apify credentials, enabling the Icebreaker Premium feature.

### Integration with Epic 6.5 Architecture

| Story | Dependency |
|-------|------------|
| **6.5.1** (this story) | Foundation - Apify credentials storage |
| 6.5.2 | Uses Apify service to fetch posts |
| 6.5.3-6.5.7 | Depend on Apify being configured |

### Research Reference

See: [technical-lead-enrichment-icebreakers-research-2026-02-03.md](../planning-artifacts/research/technical-lead-enrichment-icebreakers-research-2026-02-03.md)

**Key Findings:**
- Actor ID: `Wpp1BZ6yGWjySadk3` (supreme_coder/linkedin-post)
- Cost: ~$1 per 1,000 posts
- Rating: 4.8/5 (30 reviews)
- Advantage: Does not require cookies - lower legal risk

### Existing Patterns to Follow

**1. SERVICE_NAMES in `src/types/integration.ts`:**

```typescript
// Current (before this story):
export const SERVICE_NAMES = [
  "apollo",
  "signalhire",
  "snovio",
  "instantly",
] as const;

// After this story:
export const SERVICE_NAMES = [
  "apollo",
  "signalhire",
  "snovio",
  "instantly",
  "apify",  // NEW
] as const;

export const SERVICE_LABELS: Record<ServiceName, string> = {
  apollo: "Apollo.io",
  signalhire: "SignalHire",
  snovio: "Snov.io",
  instantly: "Instantly",
  apify: "Apify",  // NEW
};
```

**2. Integrations Page Array Pattern:**

```typescript
// Current structure in src/app/(dashboard)/settings/integrations/page.tsx
const integrations: IntegrationMeta[] = [
  {
    name: "apollo",
    displayName: "Apollo",
    icon: "🔗",
    description: "Busca de leads e enriquecimento de dados empresariais",
  },
  // ... existing integrations ...
  // ADD:
  {
    name: "apify",
    displayName: "Apify",
    icon: "🔧",
    description: "Extracao de posts do LinkedIn para icebreakers personalizados",
  },
];
```

**3. Connection Test API Route Pattern:**

Based on existing test routes, create:

```typescript
// src/app/api/integrations/apify/test/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import type { TestConnectionResult } from "@/types/integration";

export async function GET() {
  const startTime = Date.now();

  try {
    // 1. Get Apify API key from database
    const supabase = await createClient();
    const { data: config } = await supabase
      .from("api_configs")
      .select("encrypted_key")
      .eq("service_name", "apify")
      .single();

    if (!config) {
      return NextResponse.json<TestConnectionResult>({
        success: false,
        message: "Apify nao configurado",
        testedAt: new Date().toISOString(),
      });
    }

    // 2. Decrypt API key
    const apiKey = await decrypt(config.encrypted_key);

    // 3. Test connection - get actor info
    const response = await fetch(
      `https://api.apify.com/v2/acts/Wpp1BZ6yGWjySadk3?token=${apiKey}`,
      { method: "GET" }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const latencyMs = Date.now() - startTime;

    return NextResponse.json<TestConnectionResult>({
      success: true,
      message: "Conexao estabelecida com sucesso",
      testedAt: new Date().toISOString(),
      latencyMs,
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    return NextResponse.json<TestConnectionResult>({
      success: false,
      message: error instanceof Error
        ? `Erro de conexao: ${error.message}`
        : "Erro desconhecido ao conectar com Apify",
      testedAt: new Date().toISOString(),
      latencyMs,
    });
  }
}
```

### Apify API Reference

**Base URL:** `https://api.apify.com/v2`

**Authentication:** Token-based (`?token=YOUR_TOKEN` or `Authorization: Bearer YOUR_TOKEN`)

**Test Endpoint (Actor Info):**
```
GET /acts/Wpp1BZ6yGWjySadk3?token={API_TOKEN}
```

**Expected Success Response (200):**
```json
{
  "data": {
    "id": "Wpp1BZ6yGWjySadk3",
    "name": "supreme_coder/linkedin-post",
    "isPublic": true,
    ...
  }
}
```

**Error Responses:**
- 401: Invalid token
- 404: Actor not found
- 429: Rate limit exceeded

### Error Messages (Portuguese)

| Scenario | Message |
|----------|---------|
| No config | "Apify nao configurado" |
| Invalid token | "Token Apify invalido. Verifique em Configuracoes." |
| Network error | "Erro de rede ao conectar com Apify" |
| Timeout | "Timeout ao conectar com Apify. Tente novamente." |
| Rate limit | "Limite de requisicoes atingido. Aguarde alguns minutos." |
| Success | "Conexao estabelecida com sucesso" |
| Save success | "Apify configurado com sucesso" |

### Database Migration

A migration was created to add "apify" to the `api_configs.service_name` CHECK constraint:

```sql
-- Migration: 00032_add_apify_service_name.sql
ALTER TABLE public.api_configs
DROP CONSTRAINT IF EXISTS api_configs_service_name_check;

ALTER TABLE public.api_configs
ADD CONSTRAINT api_configs_service_name_check
CHECK (service_name IN ('apollo', 'signalhire', 'snovio', 'instantly', 'openai', 'apify'));
```

### Testing Strategy

**Unit Tests:**
1. `isValidServiceName("apify")` returns true
2. SERVICE_LABELS["apify"] equals "Apify"
3. IntegrationCard renders for Apify service
4. Connection test route handles success/failure

**Integration Tests:**
1. Full flow: enter key -> save -> see masked key
2. Test connection -> see success/error message
3. Apify appears in integrations list

### Edge Cases

1. **Empty API token:** Validation error, prevent save
2. **Invalid token format:** Allow save, fail on test connection
3. **Network timeout:** 10-second timeout, show timeout message
4. **Token with special chars:** URL encode when making API calls
5. **Multiple rapid saves:** Debounce or disable button during save

### Previous Story Learnings

From Story 6.13:
1. Follow existing patterns exactly - consistency is key
2. Test all UI states (loading, error, success)
3. Portuguese error messages everywhere
4. Verify TypeScript compilation before marking complete

From Story 2.3 (Integration Connection Testing):
1. Connection test UI shows loading spinner
2. Test result shows latency
3. Status badge updates: untested -> testing -> connected/error

### Project Structure Notes

**Files to modify:**
```
src/types/integration.ts                           # Add "apify" to SERVICE_NAMES
src/app/(dashboard)/settings/integrations/page.tsx # Add Apify card to array
```

**Files to create:**
```
src/app/api/integrations/apify/test/route.ts       # Connection test endpoint

__tests__/unit/types/integration.test.ts           # Type tests (update existing or create)
__tests__/unit/api/apify-test.test.ts              # API route tests
__tests__/integration/apify-integration.test.tsx   # Integration tests
```

### References

- [Source: epics.md - Story 6.5.1 acceptance criteria]
- [Source: architecture.md - Naming conventions, API patterns]
- [Source: technical-lead-enrichment-icebreakers-research-2026-02-03.md - Apify research]
- [Source: src/types/integration.ts - Existing integration types]
- [Source: src/app/(dashboard)/settings/integrations/page.tsx - Current integrations page]
- [Source: src/app/api/integrations/apollo/test/route.ts - Test route pattern (if exists)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Clean implementation

### Completion Notes List

- Implemented Apify integration following existing patterns for Apollo, SignalHire, Snov.io, Instantly
- Created ApifyService class extending ExternalService base class with testConnection method
- Added "apify" to SERVICE_NAMES, SERVICE_LABELS, initialConfigs, services record
- Added Apify card to integrations page with icon "🔧" and description in Portuguese
- Updated error message in actions/integrations.ts validation schema to include "apify"
- Added APIFY_ERROR message to base-service.ts ERROR_MESSAGES
- All 84 story-related tests pass (7 integration types + 10 ApifyService + 30 hook + 37 IntegrationCard)
- TypeScript compilation verified with no errors

### File List

**Modified:**
- src/types/integration.ts - Added "apify" to SERVICE_NAMES and SERVICE_LABELS
- src/lib/services/index.ts - Added ApifyService import, export, and instance
- src/lib/services/base-service.ts - Added APIFY_ERROR message
- src/hooks/use-integration-config.ts - Added "apify" to initialConfigs
- src/app/(dashboard)/settings/integrations/page.tsx - Added Apify to integrations array
- src/actions/integrations.ts - Updated validation error message to include "apify"
- __tests__/unit/types/integration.test.ts - Updated tests for 5 services

**Created:**
- src/lib/services/apify.ts - ApifyService class with testConnection
- __tests__/unit/lib/services/apify.test.ts - 11 unit tests for ApifyService
- supabase/migrations/00032_add_apify_service_name.sql - Adds "apify" to service_name constraint

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-03 | Initial implementation of Apify integration | Dev Agent (Claude Opus 4.5) |
| 2026-02-04 | Code review fixes: Updated Dev Notes for migration, exported ApifyActorResponse, refactored tests (DRY timers), added URL encoding test, updated base-service comment | Dev Agent (Claude Opus 4.5) |
