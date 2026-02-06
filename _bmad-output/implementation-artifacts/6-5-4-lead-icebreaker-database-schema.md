# Story 6.5.4: Lead Icebreaker Database Schema

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to store icebreakers and related data for leads,
So that generated icebreakers can be reused and displayed.

## Acceptance Criteria

### AC #1: New Columns in Leads Table
**Given** the database needs to store icebreakers
**When** the migration runs
**Then** the leads table is altered to add:
  - `icebreaker` TEXT (nullable) - the generated icebreaker text
  - `icebreaker_generated_at` TIMESTAMPTZ (nullable) - when it was generated
  - `linkedin_posts_cache` JSONB (nullable) - cached posts data for reference/debugging

### AC #2: Icebreaker Save Functionality
**Given** an icebreaker is generated for a lead
**When** the result is saved
**Then** all three fields are updated
**And** existing RLS policies continue to work (tenant isolation)

### AC #3: Icebreaker Overwrite Behavior
**Given** a lead already has an icebreaker
**When** a new icebreaker is generated
**Then** the previous icebreaker is overwritten
**And** `icebreaker_generated_at` is updated to current timestamp

### AC #4: TypeScript Types Updated
**Given** all database changes are made
**When** TypeScript compiles
**Then** `Lead` and `LeadRow` interfaces include new fields
**And** `transformLeadRow` function handles new fields
**And** no type errors occur

### AC #5: Migration Idempotent
**Given** the migration might run multiple times
**When** the migration runs
**Then** it should be idempotent (safe to run again)
**And** no errors if columns already exist

## Tasks / Subtasks

- [x] Task 1: Create Database Migration (AC: #1, #5)
  - [x] 1.1 Create `supabase/migrations/00034_add_icebreaker_columns.sql`
  - [x] 1.2 Add `icebreaker TEXT` column (nullable)
  - [x] 1.3 Add `icebreaker_generated_at TIMESTAMPTZ` column (nullable)
  - [x] 1.4 Add `linkedin_posts_cache JSONB` column (nullable)
  - [x] 1.5 Add index on `icebreaker_generated_at` for filtering
  - [x] 1.6 Make migration idempotent with `IF NOT EXISTS` checks
  - [x] 1.7 Add column comments for documentation

- [x] Task 2: Update TypeScript Types (AC: #4)
  - [x] 2.1 Update `Lead` interface in `src/types/lead.ts` (camelCase)
  - [x] 2.2 Update `LeadRow` interface in `src/types/lead.ts` (snake_case)
  - [x] 2.3 Update `transformLeadRow` function to map new fields

- [x] Task 3: Unit Tests (AC: #1-#5)
  - [x] 3.1 Test `transformLeadRow` handles new fields correctly
  - [x] 3.2 Test `transformLeadRow` handles null values for new fields
  - [x] 3.3 Test Lead interface has correct TypeScript types

- [x] Task 4: Manual Verification
  - [x] 4.1 TypeScript compilation verified (no errors)
  - [x] 4.2 Migration applies cleanly to local Supabase
  - [x] 4.3 All tests passing

## Dev Notes

### Story Context - Why This Feature

**Problem:** Epic 6.5 (Icebreaker Premium) generates highly personalized icebreakers based on LinkedIn posts. Stories 6.5.1-6.5.3 created the Apify integration and prompt configuration. This story adds the database columns to persist the generated icebreakers on lead records.

**Solution:** Add three columns to the existing `leads` table:
1. `icebreaker` - The generated text to display/use
2. `icebreaker_generated_at` - Timestamp for freshness/caching decisions
3. `linkedin_posts_cache` - Raw posts data for debugging/reference

**User Value:** Persisted icebreakers allow reuse across campaigns without regeneration costs, and provide visibility into what data was used to generate them.

### Integration with Epic 6.5 Architecture

| Story | Status | Dependency |
|-------|--------|------------|
| 6.5.1 | **DONE** | Apify credentials storage and testConnection |
| 6.5.2 | **DONE** | LinkedIn posts fetching service (fetchLinkedInPosts) |
| 6.5.3 | **DONE** | Prompt for icebreaker generation |
| **6.5.4** (this story) | **IN PROGRESS** | Database schema for storing icebreakers |
| 6.5.5 | Backlog | API endpoint that orchestrates 6.5.2 + 6.5.3 + saves to DB |
| 6.5.6-6.5.7 | Backlog | UI and email integration |

### Current Leads Table Schema

The `leads` table was created in migration `00010_create_leads.sql` with columns:
- `id`, `tenant_id`, `apollo_id`, `first_name`, `last_name`, `email`, `phone`
- `company_name`, `company_size`, `industry`, `location`, `title`, `linkedin_url`
- `status` (enum: novo, em_campanha, interessado, oportunidade, nao_interessado)
- `created_at`, `updated_at`

Additional columns added by subsequent migrations:
- `has_email`, `has_direct_phone` (Story 3.5.1)
- `photo_url` (Story 4.4.1 via migration 00014)

**This story adds:** `icebreaker`, `icebreaker_generated_at`, `linkedin_posts_cache`

### Migration Pattern (Follow 00014 as Reference)

File: `supabase/migrations/00014_add_lead_photo_url.sql` shows the pattern:

```sql
-- Migration: Add photo_url column to leads table
-- Story: 4.4.1 - Lead Data Enrichment

-- Add column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'leads'
        AND column_name = 'photo_url'
    ) THEN
        ALTER TABLE public.leads ADD COLUMN photo_url TEXT;
    END IF;
END $$;

-- Comment
COMMENT ON COLUMN public.leads.photo_url IS 'Lead photo URL from Apollo People Enrichment';
```

### LinkedInPost Interface (from Story 6.5.2)

The `linkedin_posts_cache` column will store the raw posts data. Format from `src/types/apify.ts`:

```typescript
interface LinkedInPost {
  postUrl: string;
  text: string;
  publishedAt: string;
  likesCount: number;
  commentsCount: number;
  repostsCount?: number;
}
```

**JSONB storage format:**
```json
{
  "posts": [
    { "postUrl": "...", "text": "...", "publishedAt": "...", ... },
    { "postUrl": "...", "text": "...", "publishedAt": "...", ... }
  ],
  "fetchedAt": "2026-02-04T12:00:00Z",
  "profileUrl": "https://linkedin.com/in/..."
}
```

### TypeScript Types to Update

**File:** `src/types/lead.ts`

**Lead interface (camelCase for TypeScript):**
```typescript
export interface Lead {
  // ... existing fields ...

  /** Story 6.5.4: Generated icebreaker text from LinkedIn posts */
  icebreaker: string | null;
  /** Story 6.5.4: Timestamp when icebreaker was generated */
  icebreakerGeneratedAt: string | null;
  /** Story 6.5.4: Cached LinkedIn posts used for generation */
  linkedinPostsCache: LinkedInPostsCache | null;
}
```

**LeadRow interface (snake_case for DB):**
```typescript
export interface LeadRow {
  // ... existing fields ...

  /** Story 6.5.4: Generated icebreaker text from LinkedIn posts */
  icebreaker: string | null;
  /** Story 6.5.4: Timestamp when icebreaker was generated */
  icebreaker_generated_at: string | null;
  /** Story 6.5.4: Cached LinkedIn posts used for generation */
  linkedin_posts_cache: LinkedInPostsCache | null;
}
```

**LinkedInPostsCache type:**
```typescript
export interface LinkedInPostsCache {
  posts: Array<{
    postUrl: string;
    text: string;
    publishedAt: string;
    likesCount: number;
    commentsCount: number;
    repostsCount?: number;
  }>;
  fetchedAt: string;
  profileUrl: string;
}
```

**transformLeadRow update:**
```typescript
export function transformLeadRow(row: LeadRow): Lead {
  return {
    // ... existing mappings ...
    icebreaker: row.icebreaker,
    icebreakerGeneratedAt: row.icebreaker_generated_at,
    linkedinPostsCache: row.linkedin_posts_cache,
  };
}
```

### Testing Strategy

**Unit Tests (`__tests__/unit/types/lead.test.ts` or in existing lead tests):**

1. **Transform Tests:**
   - `transformLeadRow` maps `icebreaker` correctly
   - `transformLeadRow` maps `icebreaker_generated_at` to `icebreakerGeneratedAt`
   - `transformLeadRow` maps `linkedin_posts_cache` to `linkedinPostsCache`

2. **Null Handling Tests:**
   - All three new fields handle null values correctly
   - Existing leads without icebreakers still work

3. **Type Tests:**
   - Lead interface includes new fields
   - LeadRow interface includes new fields

### Previous Story Learnings (6.5.3)

From Story 6.5.3 code review:
1. **Idempotent migrations** - Use `IF NOT EXISTS` or `WHERE NOT EXISTS` patterns
2. **Document all changes** in File List section
3. **Type safety** - Ensure TypeScript compilation passes with no errors
4. **Consistent naming** - snake_case for DB, camelCase for TypeScript

### Project Structure Notes

**Files to create:**
```
supabase/migrations/00034_add_icebreaker_columns.sql
```

**Files to modify:**
```
src/types/lead.ts  # Add icebreaker, icebreakerGeneratedAt, linkedinPostsCache to Lead and LeadRow
```

**Optional test file:**
```
__tests__/unit/types/lead.test.ts  # Add transform tests for new fields (or add to existing)
```

### Architecture Compliance

**From architecture.md:**
- snake_case for database columns
- camelCase for TypeScript variables
- Nullable fields use `| null` in TypeScript
- JSONB for complex nested data
- RLS policies already cover the leads table (no changes needed)
- Comments on columns for documentation

### Anti-Pattern Prevention

**DO NOT:**
- Create a separate table for icebreakers (violates Epic 6.5 design - columns on leads)
- Add non-nullable columns (breaks existing leads)
- Skip the `IF NOT EXISTS` checks (breaks idempotency)
- Forget to update both `Lead` and `LeadRow` interfaces
- Forget to update `transformLeadRow` function

**DO:**
- Follow the pattern from migration 00014 (photo_url)
- Add comments to columns for documentation
- Keep LinkedInPostsCache type flexible for future changes
- Test null handling explicitly

### References

- [Source: epics.md - Story 6.5.4 acceptance criteria]
- [Source: architecture.md - Naming conventions, data patterns]
- [Source: src/types/lead.ts - Current Lead and LeadRow interfaces]
- [Source: src/types/apify.ts - LinkedInPost interface from Story 6.5.2]
- [Source: supabase/migrations/00010_create_leads.sql - Original leads table]
- [Source: supabase/migrations/00014_add_lead_photo_url.sql - Migration pattern reference]
- [Source: 6-5-3-icebreaker-prompt-configuration.md - Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- ✅ Created migration `00034_add_icebreaker_columns.sql` with idempotent `IF NOT EXISTS` checks
- ✅ Added 3 columns: `icebreaker` (TEXT), `icebreaker_generated_at` (TIMESTAMPTZ), `linkedin_posts_cache` (JSONB)
- ✅ Added partial index on `icebreaker_generated_at` for efficient filtering
- ✅ Added column comments for documentation
- ✅ Updated `Lead` interface with camelCase fields
- ✅ Updated `LeadRow` interface with snake_case fields
- ✅ Updated `transformLeadRow` to map new fields
- ✅ Added `LinkedInPostsCache` interface reusing `LinkedInPost` from apify.ts
- ✅ Updated `transformApolloToLeadRow` to include new fields (defaulting to null)
- ✅ Added 5 new unit tests for icebreaker field transformations
- ✅ Updated 11 test files with mock data for new required fields
- ✅ TypeScript compilation passes with no errors
- ✅ All 43 tests in lead.test.ts passing (including 5 new icebreaker tests)
- ✅ All lead component tests passing (mock data updated in 11 test files)

### Code Review Fixes Applied

- ✅ M1: Fixed File List documentation - `__tests__/helpers/mock-data.ts` moved to "Created" (was incorrectly listed as "Modified")
- ✅ M3: Skipped - Supabase auto-wraps migrations in transactions (project pattern)
- ✅ L1: Added explanatory comments to partial index in migration
- ✅ L2: Clarified test count in Completion Notes

### Change Log

- 2026-02-04: Code review fixes applied (M1, L1, L2)
- 2026-02-04: Story 6.5.4 implementation complete - Database schema and TypeScript types for icebreaker storage

### File List

**Created:**
- `supabase/migrations/00034_add_icebreaker_columns.sql`
- `__tests__/helpers/mock-data.ts` - New shared mock helper with icebreaker fields

**Modified:**
- `src/types/lead.ts` - Added LinkedInPostsCache interface, updated Lead/LeadRow interfaces, updated transformLeadRow
- `src/types/apollo.ts` - Updated transformApolloToLeadRow with new fields
- `__tests__/unit/types/lead.test.ts` - Added 5 icebreaker field tests
- `__tests__/unit/components/leads/LeadDetailPanel.test.tsx` - Updated createMockLead
- `__tests__/unit/components/leads/LeadImportIndicator.test.tsx` - Updated createMockLead
- `__tests__/unit/components/leads/LeadPreviewPanel.test.tsx` - Updated createMockLead
- `__tests__/unit/components/leads/LeadSelectionBar.test.tsx` - Updated inline mock data
- `__tests__/unit/components/leads/LeadStatusDropdown.test.tsx` - Updated createMockLead
- `__tests__/unit/components/leads/LeadTable.test.tsx` - Updated inline mock data
- `__tests__/unit/components/leads/PhoneLookupProgress.test.tsx` - Updated createMockLead
- `__tests__/unit/components/leads/SegmentDropdown.test.tsx` - Updated inline mock data
- `__tests__/unit/hooks/use-phone-lookup.test.tsx` - Updated createMockLead
