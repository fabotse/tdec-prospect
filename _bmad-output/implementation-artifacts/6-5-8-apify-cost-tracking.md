# Story 6.5.8: Apify Cost Tracking

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to track Apify API usage and costs,
So that I can monitor enrichment spending and manage tenant budgets effectively.

## Acceptance Criteria

### AC #1: Usage Logging on Each Apify Call
**Given** the system uses Apify for icebreaker generation
**When** each call is made to the Apify API
**Then** the usage is logged to `api_usage_logs` table
**And** the log includes: tenant_id, lead_id, posts_fetched, estimated_cost, timestamp
**And** the cost is calculated as: `posts_fetched * $0.001` ($1 per 1000 posts)
**And** failed calls are also logged with status='failed' and error_message

### AC #2: API Endpoint for Usage Statistics
**Given** I am authenticated as an admin
**When** I call GET /api/usage/statistics
**Then** I receive tenant-scoped usage data:
  - Total calls this month
  - Total posts fetched this month
  - Estimated cost this month
  - Average posts per lead
  - Usage by service (apify, apollo, signalhire, etc.)
**And** the data respects RLS (only my tenant's data)

### AC #3: Admin Settings Page - Usage Section
**Given** I am authenticated as Admin
**When** I navigate to Configuracoes > Uso da API (new section)
**Then** I see Apify usage statistics:
  - Card showing "Apify - Icebreakers Premium"
  - Total calls this month
  - Estimated cost ($X.XX)
  - Average posts per lead
  - Last usage timestamp
**And** I can filter by date range (this month, last month, custom)

### AC #4: Multi-Service Support in Tracking Table
**Given** the usage tracking table is created
**When** designing the schema
**Then** it supports tracking for all external services:
  - apify (this story's primary focus)
  - apollo (future: search/enrichment tracking)
  - signalhire (future: phone lookup tracking)
  - snovio (future: export tracking)
  - instantly (future: export tracking)
**And** each service can have its own cost calculation logic

### AC #5: Cost Calculation Accuracy
**Given** Apify charges $1 per 1000 posts
**When** an icebreaker generation fetches 3 posts
**Then** the estimated_cost is calculated as: 3 * 0.001 = $0.003
**And** the total monthly cost aggregates all individual costs
**And** costs are stored as DECIMAL(10,4) for precision

### AC #6: Batch Operation Tracking
**Given** I generate icebreakers for multiple leads in batch
**When** the batch operation completes
**Then** each lead's Apify call is logged individually
**And** I can query total cost for the batch operation
**And** metadata includes batch context (if applicable)

## Tasks / Subtasks

- [x] Task 1: Create Database Migration (AC: #1, #4, #5)
  - [x] 1.1 Create migration file `00035_create_api_usage_logs.sql` (note: sequence adjusted from 00027 to 00035)
  - [x] 1.2 Define `api_usage_logs` table with columns: id, tenant_id, service_name, request_type, lead_id, posts_fetched, estimated_cost, status, error_message, raw_response, metadata, created_at, duration_ms
  - [x] 1.3 Add CHECK constraint for service_name enum
  - [x] 1.4 Add CHECK constraint for status enum (success, failed, partial)
  - [x] 1.5 Create indexes for: tenant_id, tenant+service, created_at, lead_id
  - [x] 1.6 Create composite index for aggregation queries (tenant_id, created_at DESC)
  - [x] 1.7 Enable RLS with tenant isolation policies
  - [x] 1.8 Add table and column comments

- [x] Task 2: Create ApiUsageLog TypeScript Type (AC: #1, #4)
  - [x] 2.1 Create `src/types/api-usage.ts` with ApiUsageLog interface
  - [x] 2.2 Define UsageStatistics type for aggregated data
  - [x] 2.3 Define ServiceName union type
  - [x] 2.4 Export types from `src/types/index.ts`

- [x] Task 3: Create Usage Logging Service (AC: #1, #5, #6)
  - [x] 3.1 Create `src/lib/services/usage-logger.ts`
  - [x] 3.2 Implement `logApiUsage()` function with parameters: tenantId, serviceName, requestType, leadId?, postsFetched?, estimatedCost?, status, errorMessage?, metadata?
  - [x] 3.3 Implement cost calculation for Apify: `(postsFetched / 1000) * 1`
  - [x] 3.4 Handle errors gracefully (logging should never break main flow)
  - [x] 3.5 Add TypeScript types for function parameters

- [x] Task 4: Integrate Logging into Icebreaker Enrichment (AC: #1, #6)
  - [x] 4.1 Import usage logger in `src/app/api/leads/enrich-icebreaker/route.ts`
  - [x] 4.2 Add logging call after successful Apify response
  - [x] 4.3 Add logging call for failed Apify calls (in catch block)
  - [x] 4.4 Include metadata: linkedinProfileUrl, deepScrape, postLimit
  - [x] 4.5 Calculate duration_ms using startTime

- [x] Task 5: Create Usage Statistics API Endpoint (AC: #2)
  - [x] 5.1 Create `src/app/api/usage/statistics/route.ts`
  - [x] 5.2 Implement GET handler with tenant isolation
  - [x] 5.3 Calculate aggregates: total_calls, total_posts, total_cost, avg_posts_per_lead
  - [x] 5.4 Support query params: startDate, endDate, serviceName
  - [x] 5.5 Return breakdown by service if serviceName not specified

- [x] Task 6: Create Usage Hook (AC: #2, #3)
  - [x] 6.1 Create `src/hooks/use-usage-statistics.ts`
  - [x] 6.2 Implement TanStack Query hook for GET /api/usage/statistics
  - [x] 6.3 Support date range filtering
  - [x] 6.4 Add staleTime for caching (5 minutes)

- [x] Task 7: Create Admin Usage UI (AC: #3)
  - [x] 7.1 Create `src/components/settings/UsageCard.tsx`
  - [x] 7.2 Display: service name, total calls, estimated cost, avg posts per lead, last usage
  - [x] 7.3 Add date range selector (this month, last month, custom) - implemented in usage page
  - [x] 7.4 Show loading skeleton during fetch
  - [x] 7.5 Handle empty state: "Nenhum uso registrado"

- [x] Task 8: Add Usage Section to Settings Page (AC: #3)
  - [x] 8.1 Create `src/app/(dashboard)/settings/usage/page.tsx`
  - [x] 8.2 Add navigation link in settings sidebar/tabs
  - [x] 8.3 Display UsageCard for Apify
  - [x] 8.4 Add section header with explanation

- [x] Task 9: Unit Tests
  - [x] 9.1 Test usage logger function (success, failure, cost calculation)
  - [x] 9.2 Test statistics API endpoint (tenant isolation, date filtering) - via hook tests
  - [x] 9.3 Test useUsageStatistics hook
  - [x] 9.4 Test UsageCard component rendering
  - [x] 9.5 Test cost calculation precision (DECIMAL handling)

## Dev Notes

### Story Context - Why This Feature

**Problem:** Epic 6.5 (Icebreaker Premium) uses Apify to fetch LinkedIn posts, which has a cost of ~$1 per 1000 posts. Without tracking, admins have no visibility into:
1. How much the Apify integration is being used
2. What the estimated costs are
3. Which leads/operations are consuming API credits

**Solution:** Create a comprehensive usage tracking system that:
1. Logs every Apify API call with cost estimation
2. Provides aggregated statistics via API and UI
3. Is extensible to track other external services (Apollo, SignalHire, etc.)

**User Value:** Admins can monitor spending, identify heavy usage patterns, and make informed decisions about feature usage limits.

### Integration with Epic 6.5 Architecture

| Story | Status | Integration Point |
|-------|--------|-------------------|
| 6.5.1 | **DONE** | Apify credentials in api_configs table |
| 6.5.2 | **DONE** | ApifyService.fetchLinkedInPosts() - where tracking should be inserted |
| 6.5.3 | **DONE** | icebreaker_premium_generation prompt |
| 6.5.4 | **DONE** | Lead.icebreaker, icebreakerGeneratedAt, linkedinPostsCache fields |
| 6.5.5 | **DONE** | POST /api/leads/enrich-icebreaker - main integration point |
| 6.5.6 | **DONE** | UI components to trigger icebreaker generation |
| 6.5.7 | **DONE** | Email generation integration with premium icebreakers |
| **6.5.8** (this story) | **IN PROGRESS** | Usage tracking and cost monitoring |

### Cost Structure

From Apify documentation and Story 6.5.2 research:
- **Actor Used:** `Wpp1BZ6yGWjySadk3` (supreme_coder/linkedin-post)
- **Cost:** ~$1 per 1,000 posts fetched
- **Default Posts Per Lead:** 3 posts
- **Estimated Cost Per Lead:** $0.003 (3 * $0.001)

**Cost Calculation:**
```typescript
const estimatedCost = (postsFetched / 1000) * 1;
// Example: 3 posts = 3/1000 * 1 = $0.003
```

### Database Schema Pattern (Based on signalhire_lookups)

The `signalhire_lookups` table in migration 00015 provides the best reference for tracking tables. Key patterns:

```sql
-- Multi-tenancy with tenant_id
tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

-- Status tracking with CHECK constraint
status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),

-- Raw response for debugging
raw_response JSONB,

-- RLS policies for tenant isolation
CREATE POLICY "Users can view own tenant records" ON table_name FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
```

### Recommended Table Schema

```sql
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant Isolation (multi-tenancy)
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Service & Request Tracking
  service_name TEXT NOT NULL CHECK (service_name IN ('apify', 'apollo', 'signalhire', 'snovio', 'instantly')),
  request_type TEXT NOT NULL,  -- e.g., 'icebreaker_generation', 'linkedin_posts_fetch'
  external_request_id TEXT,    -- For correlation with external APIs (optional)

  -- Lead Association (optional)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Usage Metrics (service-specific)
  posts_fetched INTEGER,                   -- Apify: Number of LinkedIn posts returned
  estimated_cost DECIMAL(10, 4),           -- Calculated cost (e.g., $0.0030)

  -- Result Tracking
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,                      -- If failed

  -- Debug Data
  raw_response JSONB,                      -- Full API response (optional)
  metadata JSONB DEFAULT '{}',             -- Extra context (LinkedIn URL, settings, etc.)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER                      -- API call duration
);
```

### Integration Point in enrich-icebreaker/route.ts

The tracking should be inserted after the Apify call in `processLeadIcebreaker()`:

```typescript
// Around line 298, after successful Apify response
if (postsResult.success) {
  // Log usage (fire and forget - don't block main flow)
  logApiUsage({
    tenantId,
    serviceName: 'apify',
    requestType: 'icebreaker_generation',
    leadId: lead.id,
    postsFetched: postsResult.posts.length,
    estimatedCost: (postsResult.posts.length / 1000) * 1,
    status: 'success',
    metadata: {
      linkedinProfileUrl: lead.linkedin_url,
      deepScrape: true,
      postLimit: 3
    },
    durationMs: Date.now() - startTime
  }).catch(console.error); // Non-blocking
}
```

### UI Component Pattern

```typescript
// src/components/settings/UsageCard.tsx
interface UsageCardProps {
  serviceName: string;
  serviceLabel: string;
  statistics: UsageStatistics | null;
  isLoading: boolean;
}

export function UsageCard({ serviceName, serviceLabel, statistics, isLoading }: UsageCardProps) {
  if (isLoading) return <UsageCardSkeleton />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          {serviceLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Chamadas" value={statistics?.totalCalls ?? 0} />
          <Stat label="Custo Estimado" value={`$${(statistics?.totalCost ?? 0).toFixed(2)}`} />
          <Stat label="Posts Buscados" value={statistics?.totalPosts ?? 0} />
          <Stat label="Media/Lead" value={statistics?.avgPostsPerLead?.toFixed(1) ?? '-'} />
        </div>
      </CardContent>
    </Card>
  );
}
```

### Statistics Query Example

```sql
-- Monthly aggregation query
SELECT
  service_name,
  COUNT(*) as total_calls,
  SUM(posts_fetched) as total_posts,
  SUM(estimated_cost) as total_cost,
  AVG(posts_fetched) as avg_posts_per_lead,
  MAX(created_at) as last_usage
FROM api_usage_logs
WHERE tenant_id = $1
  AND created_at >= $2  -- start of month
  AND created_at < $3   -- end of month
  AND status = 'success'
GROUP BY service_name;
```

### Project Structure Notes

**New Files:**
```
supabase/migrations/00027_create_api_usage_logs.sql
src/types/api-usage.ts
src/lib/services/usage-logger.ts
src/app/api/usage/statistics/route.ts
src/hooks/use-usage-statistics.ts
src/components/settings/UsageCard.tsx
src/app/(dashboard)/settings/usage/page.tsx
__tests__/unit/lib/services/usage-logger.test.ts
__tests__/unit/hooks/use-usage-statistics.test.tsx
__tests__/unit/components/settings/UsageCard.test.tsx
```

**Modified Files:**
```
src/app/api/leads/enrich-icebreaker/route.ts  # Add logging calls
src/types/index.ts                             # Export new types
src/app/(dashboard)/settings/layout.tsx        # Add usage tab (if tabs exist)
```

### Architecture Compliance

| Requirement | Implementation |
|-------------|----------------|
| Table naming | snake_case: `api_usage_logs` |
| Column naming | snake_case: `tenant_id`, `posts_fetched`, `estimated_cost` |
| Component naming | PascalCase: `UsageCard`, `UsageStatistics` |
| File naming | kebab-case: `usage-logger.ts`, `use-usage-statistics.ts` |
| Error messages | Portuguese: "Nenhum uso registrado", "Erro ao carregar dados" |
| State management | TanStack Query for server state |
| Multi-tenancy | RLS policies on api_usage_logs table |

### Testing Strategy

**Unit Tests:**

1. **usage-logger.test.ts**
   - Successful logging creates DB record
   - Failed logging doesn't throw (graceful degradation)
   - Cost calculation is accurate
   - All required fields are populated

2. **use-usage-statistics.test.tsx**
   - Hook fetches data correctly
   - Date range filtering works
   - Caching with staleTime works
   - Error states handled

3. **UsageCard.test.tsx**
   - Renders statistics correctly
   - Shows loading skeleton
   - Handles empty state
   - Formats currency correctly

**Mock Data:**
```typescript
const mockUsageLog = {
  id: 'log-1',
  tenantId: 'tenant-1',
  serviceName: 'apify',
  requestType: 'icebreaker_generation',
  leadId: 'lead-1',
  postsFetched: 3,
  estimatedCost: 0.003,
  status: 'success',
  createdAt: '2026-02-04T10:00:00Z',
  durationMs: 15000,
  metadata: {
    linkedinProfileUrl: 'https://linkedin.com/in/johndoe',
    deepScrape: true,
    postLimit: 3
  }
};

const mockStatistics = {
  totalCalls: 150,
  totalPosts: 450,
  totalCost: 0.45,
  avgPostsPerLead: 3.0,
  lastUsage: '2026-02-04T14:30:00Z'
};
```

### Previous Story Learnings (from 6.5.7)

1. **Non-blocking operations:** Logging should not block the main enrichment flow
2. **Error handling:** Catch logging errors and log to console, don't fail the request
3. **RLS policies:** Always add tenant isolation policies
4. **Indexes:** Create indexes for common query patterns (tenant_id, created_at)
5. **Portuguese messages:** All user-facing text in Portuguese

### Anti-Pattern Prevention

**DO NOT:**
- Block the main flow if logging fails
- Expose raw API responses to regular users (only admins)
- Forget tenant isolation in queries
- Use floating point for cost calculations (use DECIMAL)
- Create alerts/limits in this story (future enhancement)

**DO:**
- Log asynchronously (fire and forget)
- Handle edge cases (zero posts, null lead_id)
- Create proper indexes for aggregation queries
- Use TanStack Query for UI data fetching
- Follow existing patterns from signalhire_lookups

### Future Enhancements (Out of Scope)

These are mentioned in epics.md but NOT part of this story:
- Usage alerts/notifications
- Usage limits per tenant
- Admin UI to set limits
- Billing integration
- Real-time usage dashboard

### References

- [Source: epics.md - Story 6.5.8 acceptance criteria](_bmad-output/planning-artifacts/epics.md#story-658-apify-cost-tracking-future-enhancement)
- [Source: architecture.md - Database patterns](_bmad-output/planning-artifacts/architecture.md#data-architecture)
- [Source: 6-5-2-apify-linkedin-posts-service.md - Cost structure](_bmad-output/implementation-artifacts/6-5-2-apify-linkedin-posts-service.md)
- [Source: 6-5-5-icebreaker-enrichment-api.md - Integration point](_bmad-output/implementation-artifacts/6-5-5-icebreaker-enrichment-api.md)
- [Source: supabase/migrations/00015_create_signalhire_lookups.sql - Tracking table pattern](supabase/migrations/00015_create_signalhire_lookups.sql)
- [Source: src/app/api/leads/enrich-icebreaker/route.ts - Where to insert logging](src/app/api/leads/enrich-icebreaker/route.ts)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - implementação direta sem bloqueios

### Completion Notes List

- Task 1: Created migration 00035_create_api_usage_logs.sql with multi-service support, RLS policies, indexes for aggregation queries
- Task 2: Created api-usage.ts types: ApiUsageLog, UsageStatistics, ServiceName, LogApiUsageParams, calculateApifyCost
- Task 3: Created usage-logger.ts service with logApiUsage, logApifySuccess, logApifyFailure, getUsageStatistics functions - all non-blocking (fire and forget)
- Task 4: Integrated logging into enrich-icebreaker/route.ts with timing tracking and metadata
- Task 5: Created GET /api/usage/statistics endpoint with date range filtering and tenant isolation
- Task 6: Created useUsageStatistics hook with TanStack Query, 5-minute staleTime cache
- Task 7: Created UsageCard component with loading skeleton, empty state, statistics display
- Task 8: Added "Uso da API" tab to SettingsTabs, created /settings/usage page with date range selector
- Task 9: Created 44 unit tests across 4 test files, all passing

### Code Review Fixes (2026-02-04)

**Issues Fixed:**
- H1: Fixed nullish coalescing bug in usage-logger.ts (|| → ??) to handle cost=0 correctly
- H2: Added custom date range filter to usage page (AC #3 complete)
- H3: Added admin role verification in /api/usage/statistics endpoint (AC #2 complete)
- M1: Added try/catch error handling in statistics API endpoint
- M3: Created comprehensive test file for UsagePage (11 tests)
- M4: Added retry button in error state for better UX

### File List

**New Files:**
- supabase/migrations/00035_create_api_usage_logs.sql
- src/types/api-usage.ts
- src/lib/services/usage-logger.ts
- src/app/api/usage/statistics/route.ts
- src/hooks/use-usage-statistics.ts
- src/components/settings/UsageCard.tsx
- src/app/(dashboard)/settings/usage/page.tsx
- __tests__/unit/lib/services/usage-logger.test.ts
- __tests__/unit/hooks/use-usage-statistics.test.tsx
- __tests__/unit/components/settings/UsageCard.test.tsx
- __tests__/unit/app/settings/usage/page.test.tsx

**Modified Files:**
- src/types/index.ts (added api-usage export)
- src/app/api/leads/enrich-icebreaker/route.ts (added logging integration)
- src/components/settings/SettingsTabs.tsx (added "Uso da API" tab)
- __tests__/unit/components/settings/SettingsTabs.test.tsx (updated for new tab)
