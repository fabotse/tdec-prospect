# Story 6.5.2: Apify LinkedIn Posts Service

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a service layer for Apify LinkedIn Post scraping,
So that we can reliably fetch recent posts from a lead's LinkedIn profile for icebreaker generation.

## Acceptance Criteria

### AC #1: ApifyLinkedInService Implementation
**Given** the Apify API token is configured (Story 6.5.1)
**When** the ApifyLinkedInService is called with a LinkedIn URL
**Then** it uses the tenant's encrypted API token
**And** requests are made through API routes (never from frontend)
**And** the service extends ExternalService base class pattern
**And** the service is registered in the services factory (index.ts)

### AC #2: Actor Call Parameters
**Given** the service needs to fetch LinkedIn posts
**When** calling the Apify actor "Wpp1BZ6yGWjySadk3"
**Then** it uses parameters:
  - urls: [linkedinUrl]
  - limitPerSource: 3 (configurable, default 3)
  - deepScrape: true
  - rawData: false
**And** the service waits for actor completion and fetches results
**And** timeout is set to 60 seconds (actor runs can take longer than regular API calls)

### AC #3: Response Parsing
**Given** the actor returns posts
**When** results are parsed
**Then** each post contains: text, publishedAt, likesCount, commentsCount, postUrl
**And** results are typed with LinkedInPost interface
**And** empty results return an empty array (not an error)

### AC #4: Error Handling
**Given** the LinkedIn URL is invalid or has no posts
**When** the service is called
**Then** appropriate error message is returned:
  - "Perfil nao encontrado" for invalid profile
  - "Nenhum post publico encontrado" for profile with no posts
**And** errors are caught and translated to Portuguese via base-service pattern

### AC #5: Type Safety
**Given** the types are created
**When** TypeScript compiles
**Then** ApifyLinkedInPostInput interface exists
**And** LinkedInPost interface exists
**And** ApifyLinkedInService class is exported
**And** Types are in src/types/apify.ts

## Tasks / Subtasks

- [x] Task 1: Create Apify Types (AC: #3, #5)
  - [x] 1.1 Create `src/types/apify.ts` with ApifyLinkedInPostInput interface
  - [x] 1.2 Add LinkedInPost interface with all post fields
  - [x] 1.3 Add ApifyRunResult interface for actor run response
  - [x] 1.4 Export types from `src/types/index.ts`
  - [x] 1.5 Verify TypeScript compilation

- [x] Task 2: Extend ApifyService with LinkedIn Posts Method (AC: #1, #2)
  - [x] 2.1 Add `fetchLinkedInPosts` method to `src/lib/services/apify.ts`
  - [x] 2.2 Implement ApifyClient actor call with correct parameters
  - [x] 2.3 Wait for actor run completion (polling or sync call)
  - [x] 2.4 Fetch results from dataset
  - [x] 2.5 Set timeout to 60 seconds for actor runs

- [x] Task 3: Implement Response Parsing (AC: #3)
  - [x] 3.1 Parse actor dataset results to LinkedInPost array
  - [x] 3.2 Handle empty results gracefully (return empty array)
  - [x] 3.3 Extract relevant fields: text, publishedAt, likesCount, commentsCount, postUrl
  - [x] 3.4 Handle missing optional fields with defaults

- [x] Task 4: Implement Error Handling (AC: #4)
  - [x] 4.1 Add Portuguese error messages for Apify-specific errors
  - [x] 4.2 Handle "profile not found" scenario
  - [x] 4.3 Handle "no public posts" scenario
  - [x] 4.4 Handle actor timeout (60s exceeded)
  - [x] 4.5 Handle actor run failures

- [x] Task 5: Unit Tests (AC: #1-#5)
  - [x] 5.1 Test ApifyLinkedInPostInput type validation
  - [x] 5.2 Test LinkedInPost interface structure
  - [x] 5.3 Test fetchLinkedInPosts success case
  - [x] 5.4 Test fetchLinkedInPosts empty results case
  - [x] 5.5 Test error handling: invalid profile
  - [x] 5.6 Test error handling: no posts
  - [x] 5.7 Test error handling: timeout
  - [x] 5.8 Test error handling: actor failure
  - [x] 5.9 Mock ApifyClient properly

- [x] Task 6: Manual Verification
  - [x] 6.1 TypeScript compilation verified (no errors)
  - [x] 6.2 All unit tests passing
  - [x] 6.3 Service exports correctly from index.ts

## Dev Notes

### Story Context - Why This Feature

**Problem:** Epic 6.5 (Icebreaker Premium) requires fetching real LinkedIn posts from leads to generate highly personalized icebreakers that reference actual content the person posted.

**Solution:** Extend the ApifyService (created in Story 6.5.1) with a `fetchLinkedInPosts` method that calls the Apify LinkedIn Post Scraper actor and returns parsed post data.

**User Value:** This service enables the system to fetch real content from leads' LinkedIn profiles, which will be used by subsequent stories (6.5.3-6.5.7) to generate premium icebreakers.

### Integration with Epic 6.5 Architecture

| Story | Dependency |
|-------|------------|
| 6.5.1 | **DONE** - Apify credentials storage and testConnection |
| **6.5.2** (this story) | LinkedIn posts fetching service |
| 6.5.3 | Uses this service + OpenAI to generate icebreaker |
| 6.5.4 | Database schema for storing icebreakers |
| 6.5.5 | API endpoint that orchestrates 6.5.2 + 6.5.3 |
| 6.5.6-6.5.7 | UI and email integration |

### Research Reference

See: [technical-lead-enrichment-icebreakers-research-2026-02-03.md](../planning-artifacts/research/technical-lead-enrichment-icebreakers-research-2026-02-03.md)

**Key Findings:**
- Actor ID: `Wpp1BZ6yGWjySadk3` (supreme_coder/linkedin-post)
- Cost: ~$1 per 1,000 posts
- Rating: 4.8/5 (30 reviews)
- Advantage: Does not require cookies - lower legal risk
- Average response time: 10-30 seconds per profile

### Existing Patterns to Follow

**1. ApifyService Base (from Story 6.5.1):**

The ApifyService already exists in `src/lib/services/apify.ts` with:
- testConnection method
- APIFY_API_BASE constant
- APIFY_LINKEDIN_ACTOR_ID constant
- ApifyActorResponse interface

**2. ExternalService Pattern (`src/lib/services/base-service.ts`):**

```typescript
// All services follow this pattern
export abstract class ExternalService {
  abstract readonly name: string;
  protected async request<T>(url: string, options: RequestInit): Promise<T>;
  protected handleError(error: unknown): ExternalServiceError;
  protected createSuccessResult(latencyMs: number): TestConnectionResult;
  protected createErrorResult(error: Error): TestConnectionResult;
}
```

**3. Other Service Examples:**

Reference `src/lib/services/apollo.ts` and `src/lib/services/signalhire.ts` for patterns on:
- Method naming conventions
- Error handling with Portuguese messages
- Type definitions
- JSDoc comments

### Apify API Reference

**Actor: supreme_coder/linkedin-post**
- ID: `Wpp1BZ6yGWjySadk3`
- URL: https://apify.com/supreme_coder/linkedin-post
- Docs: https://docs.apify.com/api/v2

**Input Schema:**

```typescript
interface ApifyLinkedInPostInput {
  urls: string[];           // LinkedIn profile URLs
  limitPerSource: number;   // Number of posts per profile (default: 3)
  deepScrape: boolean;      // Deep scrape (default: true)
  rawData: boolean;         // Raw vs processed data (default: false)
}
```

**Running an Actor:**

```typescript
// Using ApifyClient (recommended)
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({
  token: apiKey  // From encrypted api_configs
});

const input = {
  urls: ["https://www.linkedin.com/in/example-profile/"],
  limitPerSource: 3,
  deepScrape: true,
  rawData: false
};

// Run actor and wait for completion
const run = await client.actor("Wpp1BZ6yGWjySadk3").call(input, {
  waitSecs: 60  // Wait up to 60 seconds
});

// Fetch results from dataset
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

**Expected Post Response:**

```json
{
  "postUrl": "https://www.linkedin.com/feed/update/urn:li:activity:...",
  "text": "Post content here...",
  "publishedAt": "2026-01-15T10:30:00.000Z",
  "likesCount": 42,
  "commentsCount": 5,
  "repostsCount": 3,
  "authorName": "John Doe",
  "authorHeadline": "CEO at Example Corp"
}
```

### Types to Create

**src/types/apify.ts:**

```typescript
/**
 * Apify Types
 * Story: 6.5.2 - Apify LinkedIn Posts Service
 */

/**
 * Input for Apify LinkedIn Post actor
 */
export interface ApifyLinkedInPostInput {
  urls: string[];
  limitPerSource: number;
  deepScrape: boolean;
  rawData: boolean;
}

/**
 * Single LinkedIn post from Apify actor
 */
export interface LinkedInPost {
  postUrl: string;
  text: string;
  publishedAt: string;
  likesCount: number;
  commentsCount: number;
  repostsCount?: number;
  authorName?: string;
  authorHeadline?: string;
}

/**
 * Result of fetching LinkedIn posts
 */
export interface FetchLinkedInPostsResult {
  success: boolean;
  posts: LinkedInPost[];
  error?: string;
  profileUrl: string;
  fetchedAt: string;
}
```

### Service Method to Implement

**Add to `src/lib/services/apify.ts`:**

```typescript
/**
 * Fetch recent LinkedIn posts from a profile
 * Story 6.5.2: AC #1-#4
 *
 * @param apiKey - Apify API token
 * @param linkedinUrl - LinkedIn profile URL
 * @param limit - Number of posts to fetch (default: 3)
 * @returns FetchLinkedInPostsResult with posts array or error
 */
async fetchLinkedInPosts(
  apiKey: string,
  linkedinUrl: string,
  limit: number = 3
): Promise<FetchLinkedInPostsResult> {
  // Implementation here
}
```

### Error Messages (Portuguese)

| Scenario | Message |
|----------|---------|
| Profile not found | "Perfil do LinkedIn nao encontrado" |
| No public posts | "Nenhum post publico encontrado neste perfil" |
| Invalid URL | "URL do LinkedIn invalida" |
| Actor timeout | "Tempo limite excedido ao buscar posts. Tente novamente." |
| Actor failure | "Erro ao executar busca de posts no Apify" |
| Generic error | "Erro ao buscar posts do LinkedIn" |

### Dependencies

**NPM Package Required:**
```bash
npm install apify-client
```

Check if already installed in package.json. If not, add to Task 1.

### Testing Strategy

**Unit Tests (`__tests__/unit/lib/services/apify-linkedin.test.ts`):**

1. **Type Tests:**
   - ApifyLinkedInPostInput has required fields
   - LinkedInPost has required fields
   - FetchLinkedInPostsResult structure

2. **Service Tests:**
   - Success case: returns posts array
   - Empty results: returns empty array without error
   - Invalid profile: returns error message
   - No posts: returns error message
   - Timeout: returns timeout error
   - Actor failure: returns failure error

3. **Mock Strategy:**
   - Mock ApifyClient class
   - Mock actor.call() method
   - Mock dataset.listItems() method

### Edge Cases

1. **Empty posts array:** Return success with empty array, not error
2. **Partial post data:** Use defaults for missing optional fields
3. **Invalid LinkedIn URL format:** Validate URL before calling actor
4. **Profile with private posts:** Return "no public posts" message
5. **Rate limiting:** Handle 429 errors from Apify
6. **Concurrent requests:** Each request is independent (no shared state)

### Previous Story Learnings (6.5.1)

From Story 6.5.1:
1. Use existing ExternalService base class pattern
2. Add Portuguese error messages to ERROR_MESSAGES in base-service.ts
3. Test all error scenarios
4. Export types from apify.ts for reuse
5. Verify TypeScript compilation before marking complete

### Project Structure Notes

**Files to modify:**
```
src/lib/services/apify.ts          # Add fetchLinkedInPosts method
src/lib/services/base-service.ts   # Add any new error messages if needed
```

**Files to create:**
```
src/types/apify.ts                             # LinkedIn post types
__tests__/unit/lib/services/apify-linkedin.test.ts  # Unit tests
```

**Files to update:**
```
src/types/index.ts                 # Export new types
package.json                       # Add apify-client if not present
```

### Architecture Compliance

**From architecture.md:**
- Service follows ExternalService base class pattern
- Uses snake_case for database, camelCase for TypeScript
- Error messages in Portuguese
- Timeout with retry for network errors
- Types in src/types/ directory

### References

- [Source: epics.md - Story 6.5.2 acceptance criteria]
- [Source: architecture.md - External Service Pattern]
- [Source: research/technical-lead-enrichment-icebreakers-research-2026-02-03.md - Apify research]
- [Source: src/lib/services/apify.ts - Existing ApifyService (Story 6.5.1)]
- [Source: src/lib/services/base-service.ts - ExternalService base class]
- [Source: Apify API Docs - https://docs.apify.com/api/v2]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- **Task 1**: Created `src/types/apify.ts` with ApifyLinkedInPostInput, LinkedInPost, ApifyRunResult, and FetchLinkedInPostsResult interfaces. Exported from `src/types/index.ts`.
- **Task 2**: Extended ApifyService with `fetchLinkedInPosts(apiKey, linkedinUrl, limit)` method. Uses ApifyClient library with actor "Wpp1BZ6yGWjySadk3", 60s timeout, configurable limit (default 3).
- **Task 3**: Implemented `parseLinkedInPosts()` private method with type-safe parsing. Handles missing fields with defaults, filters empty posts, returns empty array for no results (not error).
- **Task 4**: Added APIFY_ERROR_MESSAGES with Portuguese messages. Implemented `getLinkedInPostsErrorMessage()` for error classification (profile not found, timeout, rate limit, auth errors). Added LinkedIn URL validation.
- **Task 5**: 39 unit tests (7 added in code review) covering: success cases, parameter validation, URL validation, error handling (actor failure, timeout, profile not found, no public posts, rate limiting, auth errors, empty apiKey), NaN handling, response structure. Mock uses class-based ApifyClient pattern.
- **Task 6**: TypeScript compiles without errors. All 39 story tests pass. Service exports correctly from index.ts.
- **Dependency**: Installed `apify-client` npm package.
- **Code Review Fixes (2026-02-04)**:
  - H1: Error messages now match AC #4 exactly ("Perfil nao encontrado", "Nenhum post publico encontrado")
  - H2: Added "no public posts" and "private profile" detection in error handler
  - M1: Stricter URL validation regex (requires at least one char after /in/ or /company/)
  - M2: Added empty/whitespace apiKey validation
  - M3: Added safeParseInt() to handle NaN in numeric fields

### File List

**Created:**
- `src/types/apify.ts` - Apify type definitions (ApifyLinkedInPostInput, LinkedInPost, ApifyRunResult, FetchLinkedInPostsResult)

**Modified:**
- `src/lib/services/apify.ts` - Added fetchLinkedInPosts method, APIFY_ERROR_MESSAGES, parsing and validation logic
- `src/types/index.ts` - Added export for apify types
- `__tests__/unit/lib/services/apify.test.ts` - Added 27 new tests for fetchLinkedInPosts (39 total after code review)
- `package.json` - Added apify-client dependency
- `package-lock.json` - Updated with apify-client

### Change Log

- 2026-02-04: Story 6.5.2 implementation complete - ApifyService extended with LinkedIn posts fetching capability
- 2026-02-04: Code review complete - Fixed 5 issues (2 HIGH, 3 MEDIUM): AC #4 error messages, no public posts detection, stricter URL validation, apiKey validation, NaN handling. 7 new tests added (39 total).
