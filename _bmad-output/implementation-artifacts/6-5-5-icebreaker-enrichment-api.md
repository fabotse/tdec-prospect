# Story 6.5.5: Icebreaker Enrichment API

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an API endpoint to enrich leads with premium icebreakers,
So that the frontend can trigger icebreaker generation for single or multiple leads.

## Acceptance Criteria

### AC #1: API Endpoint Structure
**Given** I call POST /api/leads/enrich-icebreaker
**When** the request includes `{ leadIds: string[] }`
**Then** the endpoint is authenticated
**And** the endpoint validates request body with Zod
**And** the endpoint respects tenant isolation via RLS/profile check

### AC #2: Icebreaker Generation Flow
**Given** a valid request with leadIds
**When** the endpoint processes each lead
**Then** for each lead:
  1. Fetch lead data from database (including linkedin_url)
  2. If linkedin_url is missing, skip with error "Lead sem LinkedIn URL"
  3. Call ApifyService.fetchLinkedInPosts() to get 3 recent posts
  4. Call AI with `icebreaker_premium_generation` prompt
  5. Save icebreaker, linkedin_posts_cache, and icebreaker_generated_at to lead record

### AC #3: Response Structure
**Given** the endpoint completes processing
**When** the response is returned
**Then** response includes: `{ success: boolean, results: Array<{ leadId, icebreaker?, error? }> }`
**And** each lead is processed independently (one failure doesn't stop others)

### AC #4: Parallel Processing with Rate Limiting
**Given** the endpoint is called for multiple leads
**When** processing
**Then** leads are processed in parallel (max 5 concurrent to avoid rate limits)
**And** results are aggregated after all complete

### AC #5: Missing LinkedIn Posts Handling
**Given** a lead has no public LinkedIn posts
**When** the API processes that lead
**Then** the lead's icebreaker field remains null
**And** result shows: `{ leadId, error: "Nenhum post encontrado" }`

### AC #6: Regeneration Support
**Given** a lead already has an icebreaker
**When** the API is called with `regenerate: true`
**Then** a new icebreaker is generated and replaces the old one
**And** without regenerate flag, existing icebreakers are skipped (returned as success with existing data)

### AC #7: Error Messages in Portuguese
**Given** any error occurs
**When** the error is returned
**Then** the message is in Portuguese (matching project patterns)

## Tasks / Subtasks

- [x] Task 1: Create API Route File (AC: #1)
  - [x] 1.1 Create `src/app/api/leads/enrich-icebreaker/route.ts`
  - [x] 1.2 Add Zod validation schema for request body
  - [x] 1.3 Add authentication check via getCurrentUserProfile()
  - [x] 1.4 Add tenant isolation via profile.tenant_id

- [x] Task 2: Implement Icebreaker Generation Logic (AC: #2, #5)
  - [x] 2.1 Create helper function `processLeadIcebreaker(lead, tenantId, apifyKey, openaiKey)`
  - [x] 2.2 Validate lead has linkedin_url
  - [x] 2.3 Call ApifyService.fetchLinkedInPosts()
  - [x] 2.4 Handle empty posts result (not an error, return specific message)
  - [x] 2.5 Build variables for icebreaker_premium_generation prompt
  - [x] 2.6 Call AI generate via promptManager.renderPrompt() + provider.generateText()
  - [x] 2.7 Save results to lead record

- [x] Task 3: Implement Parallel Processing (AC: #4)
  - [x] 3.1 Create helper for processing leads in batches of 5
  - [x] 3.2 Use Promise.allSettled for parallel execution
  - [x] 3.3 Aggregate results from all batches

- [x] Task 4: Implement Regeneration Logic (AC: #6)
  - [x] 4.1 Check if lead already has icebreaker
  - [x] 4.2 Skip if regenerate !== true (return existing data)
  - [x] 4.3 Regenerate if regenerate === true

- [x] Task 5: Response Handling (AC: #3, #7)
  - [x] 5.1 Build response structure with success/error per lead
  - [x] 5.2 Ensure all error messages are in Portuguese
  - [x] 5.3 Return aggregated results

- [x] Task 6: Unit Tests
  - [x] 6.1 Test validation schema accepts valid inputs
  - [x] 6.2 Test validation schema rejects invalid inputs
  - [x] 6.3 Test authentication required
  - [x] 6.4 Test tenant isolation
  - [x] 6.5 Test lead without LinkedIn URL returns error
  - [x] 6.6 Test lead with no posts returns specific error
  - [x] 6.7 Test successful icebreaker generation
  - [x] 6.8 Test regenerate=false skips existing icebreakers
  - [x] 6.9 Test regenerate=true overwrites existing icebreakers
  - [x] 6.10 Test parallel processing respects batch limit

## Dev Notes

### Story Context - Why This Feature

**Problem:** Stories 6.5.1-6.5.4 created the foundation for Icebreaker Premium (Apify integration, posts fetching, prompt configuration, database schema). Now we need an API endpoint that orchestrates all these pieces to actually generate icebreakers.

**Solution:** Create POST /api/leads/enrich-icebreaker that:
1. Fetches lead data from database
2. Calls Apify to get LinkedIn posts
3. Calls OpenAI with the icebreaker_premium_generation prompt
4. Saves the result to the lead record

**User Value:** This endpoint enables Story 6.5.6 (UI integration) to trigger icebreaker generation from the leads table, completing the Icebreaker Premium feature.

### Integration with Epic 6.5 Architecture

| Story | Status | Dependency |
|-------|--------|------------|
| 6.5.1 | **DONE** | Apify credentials storage and testConnection |
| 6.5.2 | **DONE** | LinkedIn posts fetching service (fetchLinkedInPosts) |
| 6.5.3 | **DONE** | Prompt for icebreaker generation (icebreaker_premium_generation) |
| 6.5.4 | **DONE** | Database schema (icebreaker, icebreaker_generated_at, linkedin_posts_cache) |
| **6.5.5** (this story) | **IN PROGRESS** | API endpoint that orchestrates all above |
| 6.5.6 | Backlog | UI - LeadTable column + generation buttons |
| 6.5.7 | Backlog | Email generation integration |

### Services and Types to Use

**ApifyService (from Story 6.5.2):**
```typescript
// src/lib/services/apify.ts
class ApifyService {
  async fetchLinkedInPosts(
    apiKey: string,
    linkedinUrl: string,
    limit?: number
  ): Promise<FetchLinkedInPostsResult>
}

interface FetchLinkedInPostsResult {
  success: boolean;
  posts: LinkedInPost[];
  error?: string;
  profileUrl: string;
  fetchedAt: string;
}
```

**Prompt Key (from Story 6.5.3):**
```typescript
// Use prompt key: "icebreaker_premium_generation"
// Variables (camelCase as per 6-5-3 story dev notes):
// - firstName, lastName, title, companyName, industry
// - linkedinPosts (formatted posts text)
// - companyContext, toneDescription, toneStyle
// - productName, productDescription (optional)
```

**Lead Types (from Story 6.5.4):**
```typescript
// src/types/lead.ts
interface Lead {
  // ... existing fields ...
  icebreaker: string | null;
  icebreakerGeneratedAt: string | null;
  linkedinPostsCache: LinkedInPostsCache | null;
}

interface LinkedInPostsCache {
  posts: LinkedInPost[];
  fetchedAt: string;
  profileUrl: string;
}
```

### API Route Pattern (Follow bulk-enrich)

Reference: `src/app/api/leads/enrich/bulk/route.ts`

```typescript
// Request body schema
const enrichIcebreakerSchema = z.object({
  leadIds: z
    .array(z.string().uuid("ID de lead invalido"))
    .min(1, "Pelo menos um lead e necessario")
    .max(50, "Maximo de 50 leads por requisicao"),
  regenerate: z.boolean().optional().default(false),
});

// Response structure
interface EnrichIcebreakerResult {
  leadId: string;
  success: boolean;
  icebreaker?: string;
  error?: string;
}

interface EnrichIcebreakerResponse {
  success: boolean;
  results: EnrichIcebreakerResult[];
  summary: {
    total: number;
    generated: number;
    skipped: number;
    failed: number;
  };
}
```

### Prompt Variables Mapping

The `icebreaker_premium_generation` prompt (Story 6.5.3) uses **camelCase** variables. Map lead data to these variables:

```typescript
function buildIcebreakerVariables(
  lead: Lead,
  posts: LinkedInPost[],
  kbContext: KnowledgeBaseContext | null,
  product?: Product | null
): Record<string, string> {
  return {
    // Lead context (camelCase as per prompt)
    firstName: lead.firstName,
    lastName: lead.lastName || "",
    title: lead.title || "",
    companyName: lead.companyName || "",
    industry: lead.industry || "",

    // LinkedIn posts (formatted for prompt)
    linkedinPosts: formatLinkedInPostsForPrompt(posts),

    // Company context (from KB service)
    companyContext: kbContext?.company_context || "Empresa de tecnologia B2B",
    toneDescription: kbContext?.tone_description || "Profissional e amigavel",
    toneStyle: kbContext?.tone_style || "casual",

    // Product context (optional)
    productName: product?.name || "",
    productDescription: product?.description || "",
  };
}

function formatLinkedInPostsForPrompt(posts: LinkedInPost[]): string {
  if (posts.length === 0) {
    return "Nenhum post disponivel";
  }

  return posts.map((post, idx) => {
    const date = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("pt-BR") : "Data desconhecida";
    return `Post ${idx + 1} (${date}):\n${post.text}\nEngajamento: ${post.likesCount} curtidas, ${post.commentsCount} comentarios`;
  }).join("\n\n");
}
```

### Error Messages (Portuguese)

```typescript
const ERROR_MESSAGES = {
  UNAUTHORIZED: "Nao autenticado",
  TENANT_NOT_FOUND: "Tenant nao encontrado",
  VALIDATION_ERROR: "Dados invalidos",
  LEAD_NOT_FOUND: "Lead nao encontrado",
  NO_LINKEDIN_URL: "Lead sem LinkedIn URL",
  NO_POSTS_FOUND: "Nenhum post encontrado",
  APIFY_ERROR: "Erro ao buscar posts do LinkedIn",
  AI_ERROR: "Erro ao gerar icebreaker",
  APIFY_NOT_CONFIGURED: "API key do Apify nao configurada. Configure em Configuracoes > Integracoes.",
  OPENAI_NOT_CONFIGURED: "API key do OpenAI nao configurada. Configure em Configuracoes > Integracoes.",
};
```

### Parallel Processing Implementation

```typescript
const BATCH_SIZE = 5; // Max concurrent requests

async function processLeadsInBatches(
  leads: Lead[],
  processLead: (lead: Lead) => Promise<EnrichIcebreakerResult>
): Promise<EnrichIcebreakerResult[]> {
  const results: EnrichIcebreakerResult[] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(lead => processLead(lead))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          leadId: batch[j].id,
          success: false,
          error: ERROR_MESSAGES.AI_ERROR,
        });
      }
    }
  }

  return results;
}
```

### AI Generation Flow

```typescript
async function generateIcebreaker(
  tenantId: string,
  variables: Record<string, string>,
  openaiKey: string
): Promise<{ icebreaker: string } | { error: string }> {
  try {
    // 1. Get rendered prompt
    const renderedPrompt = await promptManager.renderPrompt(
      "icebreaker_premium_generation",
      variables,
      { tenantId }
    );

    if (!renderedPrompt) {
      return { error: "Prompt nao encontrado" };
    }

    // 2. Create AI provider and generate
    const provider = createAIProvider("openai", openaiKey);
    const result = await provider.generateText(renderedPrompt.content, {
      temperature: renderedPrompt.metadata.temperature,
      maxTokens: renderedPrompt.metadata.maxTokens,
      model: renderedPrompt.modelPreference,
    });

    return { icebreaker: result.text.trim() };
  } catch (error) {
    console.error("[generateIcebreaker] Error:", error);
    return { error: ERROR_MESSAGES.AI_ERROR };
  }
}
```

### Database Update Pattern

```typescript
async function saveIcebreakerToLead(
  supabase: SupabaseClient,
  leadId: string,
  icebreaker: string,
  postsResult: FetchLinkedInPostsResult
): Promise<boolean> {
  const linkedinPostsCache: LinkedInPostsCache = {
    posts: postsResult.posts,
    fetchedAt: postsResult.fetchedAt,
    profileUrl: postsResult.profileUrl,
  };

  const { error } = await supabase
    .from("leads")
    .update({
      icebreaker,
      icebreaker_generated_at: new Date().toISOString(),
      linkedin_posts_cache: linkedinPostsCache,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  return !error;
}
```

### Testing Strategy

**Unit Tests (`__tests__/unit/api/leads-enrich-icebreaker.test.ts`):**

1. **Validation Tests:**
   - Valid request passes validation
   - Empty leadIds array rejected
   - Invalid UUID format rejected
   - Too many leads (>50) rejected

2. **Authentication Tests:**
   - Missing auth returns 401
   - Missing tenant returns 403

3. **Processing Tests:**
   - Lead without linkedin_url returns specific error
   - Lead with no posts returns specific error
   - Successful generation saves all fields
   - Regenerate=false skips existing
   - Regenerate=true overwrites existing

4. **Parallel Processing Tests:**
   - Multiple leads processed concurrently
   - One failure doesn't stop others
   - Results aggregated correctly

**Mocks Required:**
- ApifyService.fetchLinkedInPosts
- createAIProvider / provider.generateText
- Supabase client (leads table operations)
- getCurrentUserProfile

### Previous Story Learnings

From Story 6.5.4 code review:
1. **Portuguese error messages** - All user-facing errors in Portuguese
2. **Idempotent operations** - Handle regeneration gracefully
3. **Type safety** - Use proper TypeScript interfaces
4. **Test coverage** - Comprehensive tests for all scenarios

From bulk-enrich route (Story 4.4.1):
1. **Batch processing** - Process in batches to avoid rate limits
2. **Promise.allSettled** - Don't let one failure stop others
3. **Aggregated results** - Return summary with counts

### Architecture Compliance

**From architecture.md:**
- API Routes in `src/app/api/leads/` - ✅
- Zod validation for request bodies - ✅
- Portuguese error messages - ✅
- TanStack Query pattern for frontend (Story 6.5.6) - N/A for this story
- External service pattern (ApifyService, AI Provider) - ✅

### Cost Estimation

Per lead enrichment:
- Apify: ~$0.001 (1 actor run, ~3 posts)
- OpenAI (gpt-4o-mini): ~$0.003 (input tokens ~1000, output ~100)
- **Total: ~$0.004 per lead**

For 50 leads: ~$0.20

### Project Structure Notes

**Files to create:**
```
src/app/api/leads/enrich-icebreaker/route.ts
__tests__/unit/api/leads-enrich-icebreaker.test.ts
```

**Files to reference (read-only):**
```
src/lib/services/apify.ts  # ApifyService.fetchLinkedInPosts
src/lib/ai/index.ts  # promptManager, createAIProvider
src/lib/services/knowledge-base-context.ts  # buildAIVariables
src/types/lead.ts  # Lead, LinkedInPostsCache
src/types/apify.ts  # LinkedInPost, FetchLinkedInPostsResult
```

### Anti-Pattern Prevention

**DO NOT:**
- Create a separate service file (route handles orchestration)
- Use sequential processing (use batches with Promise.allSettled)
- Fail entire request if one lead fails
- Forget to save linkedin_posts_cache (needed for debugging)
- Use snake_case for prompt variables (prompt uses camelCase)
- Skip authentication/tenant checks

**DO:**
- Follow bulk-enrich route pattern
- Use Portuguese error messages
- Process in batches of 5
- Save all three icebreaker fields together
- Handle missing posts gracefully (not an error)
- Support regenerate flag

### References

- [Source: epics.md - Story 6.5.5 acceptance criteria](../planning-artifacts/epics.md)
- [Source: architecture.md - API route patterns, error handling](../planning-artifacts/architecture.md)
- [Source: 6-5-2-apify-linkedin-posts-service.md - ApifyService usage](./6-5-2-apify-linkedin-posts-service.md)
- [Source: 6-5-3-icebreaker-prompt-configuration.md - Prompt variables (camelCase)](./6-5-3-icebreaker-prompt-configuration.md)
- [Source: 6-5-4-lead-icebreaker-database-schema.md - Lead schema with icebreaker fields](./6-5-4-lead-icebreaker-database-schema.md)
- [Source: src/app/api/leads/enrich/bulk/route.ts - Bulk enrichment pattern](../../src/app/api/leads/enrich/bulk/route.ts)
- [Source: src/lib/ai/prompts/defaults.ts - icebreaker_premium_generation prompt](../../src/lib/ai/prompts/defaults.ts)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- **AC #1**: Created `POST /api/leads/enrich-icebreaker` route with Zod validation, authentication via `getCurrentUserProfile()`, and tenant isolation
- **AC #2**: Implemented full icebreaker generation flow: fetch leads → validate linkedin_url → ApifyService.fetchLinkedInPosts() → promptManager.renderPrompt() → provider.generateText() → save to DB
- **AC #3**: Response structure includes `{ success, results: Array<{leadId, success, icebreaker?, error?}>, summary: {total, generated, skipped, failed} }`
- **AC #4**: Parallel processing with BATCH_SIZE=5 using Promise.allSettled to avoid rate limits
- **AC #5**: Missing LinkedIn posts handled gracefully - returns `{ success: false, error: "Nenhum post encontrado" }`
- **AC #6**: Regeneration support - skip existing icebreakers when `regenerate=false`, overwrite when `regenerate=true`
- **AC #7**: All error messages in Portuguese (Nao autenticado, Lead sem LinkedIn URL, etc.)
- **Tests**: 23 unit tests covering all ACs - validation, authentication, tenant isolation, generation flow, regeneration, parallel processing

### File List

**Created:**
- `src/app/api/leads/enrich-icebreaker/route.ts` - API route implementation (537 lines)
- `__tests__/unit/api/leads-enrich-icebreaker.test.ts` - Unit tests (26 tests)

**Modified:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Status updated to done

### Change Log

- 2026-02-04: Story 6.5.5 implementation complete - API endpoint for icebreaker enrichment with full test coverage
- 2026-02-04: Code review fixes applied (see Senior Developer Review below)

## Senior Developer Review (AI)

### Review Date
2026-02-04

### Reviewer
Claude Opus 4.5 (claude-opus-4-5-20251101)

### Review Outcome
✅ **APPROVED** - All issues fixed

### Issues Found and Fixed

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| H1 | HIGH | Summary `skipped` count logic was convoluted and potentially incorrect | Added `skipped` flag to result interface, simplified summary calculation |
| H2 | HIGH | Knowledge Base context not integrated - hardcoded values instead of tenant KB | Added `fetchKBContext()` helper, integrated company/tone from KB with graceful degradation |
| H3 | HIGH | No test for batch processing with >5 leads | Added test with 7 leads to verify BATCH_SIZE=5 chunking |
| M1 | MEDIUM | Database update error returned wrong message (AI_ERROR) | Added DB_UPDATE_ERROR message, used in update error handling |
| M2 | MEDIUM | No test for OpenAI API key missing | Added test verifying OpenAI key error is returned with correct message |
| M3 | MEDIUM | Line count mismatch (story said 450, was 461) | Updated file list with accurate counts |

### Code Quality Assessment
- ✅ All 7 ACs validated and implemented
- ✅ All tasks marked [x] verified complete
- ✅ 26 unit tests passing (up from 23)
- ✅ KB context integration improves personalization
- ✅ Error messages consistent (Portuguese)
- ✅ Batch processing verified with >5 leads
