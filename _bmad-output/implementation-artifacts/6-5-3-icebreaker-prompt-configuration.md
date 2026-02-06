# Story 6.5.3: Icebreaker Prompt Configuration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want a dedicated prompt for icebreaker generation that I can customize,
So that generated icebreakers match my desired style and approach using LinkedIn posts data.

## Acceptance Criteria

### AC #1: New Prompt Key Registration
**Given** the system needs to generate premium icebreakers
**When** the PromptManager is called with key 'icebreaker_premium_generation'
**Then** it retrieves the prompt from ai_prompts table
**And** falls back to global prompt if no tenant-specific exists
**And** falls back to code default if no DB prompt exists
**And** the key is added to PromptKey type and PROMPT_KEYS array

### AC #2: Default Prompt Template Seeding
**Given** the migration runs
**When** the default prompt is seeded
**Then** the prompt includes instructions for:
  - Analyzing LinkedIn posts content
  - Identifying themes of interest, opinions, achievements
  - Creating short icebreakers (1-2 sentences, max 50 words)
  - Referencing specific content from posts
  - Avoiding generic phrases like "Vi que voce..."
  - Maintaining professional but casual tone
  - Connecting lead's interests with sender's value proposition (if product context available)

### AC #3: Variable Support
**Given** variables are passed to the prompt
**When** the prompt is rendered
**Then** it supports variables:
  - {{firstName}}, {{lastName}}, {{title}}, {{companyName}}, {{industry}}
  - {{linkedinPosts}} - formatted posts content
  - {{productName}}, {{productDescription}} (optional, from campaign context)
  - {{companyContext}} - from knowledge base
  - {{toneStyle}}, {{toneDescription}} - tone of voice settings
**And** conditional blocks work: {{#if productName}}...{{/if}}

### AC #4: Code Default Implementation
**Given** no database prompt exists
**When** PromptManager.getPrompt('icebreaker_premium_generation') is called
**Then** CODE_DEFAULT_PROMPTS includes the icebreaker_premium_generation prompt
**And** it has appropriate modelPreference (gpt-4o-mini)
**And** it has appropriate metadata (temperature: 0.8, maxTokens: 200)

### AC #5: Database Migration
**Given** the migration 00033 runs
**When** Supabase applies it
**Then** a new row is inserted into ai_prompts with:
  - tenant_id: NULL (global)
  - prompt_key: 'icebreaker_premium_generation'
  - version: 1
  - is_active: true
  - Complete prompt template

### AC #6: TypeScript Compilation
**Given** all changes are made
**When** TypeScript compiles
**Then** no type errors occur
**And** PromptKey includes 'icebreaker_premium_generation'
**And** PROMPT_KEYS array includes the new key

## Tasks / Subtasks

- [x] Task 1: Add Prompt Key Type (AC: #1, #6)
  - [x] 1.1 Update `src/types/ai-prompt.ts` PromptKey type to include 'icebreaker_premium_generation'
  - [x] 1.2 Update PROMPT_KEYS array
  - [x] 1.3 Verify TypeScript compilation

- [x] Task 2: Add Code Default Prompt (AC: #2, #3, #4)
  - [x] 2.1 Add `icebreaker_premium_generation` to CODE_DEFAULT_PROMPTS in `src/lib/ai/prompts/defaults.ts`
  - [x] 2.2 Include all required variables with proper interpolation
  - [x] 2.3 Include conditional blocks for optional product context
  - [x] 2.4 Set modelPreference to 'gpt-4o-mini'
  - [x] 2.5 Set metadata: temperature 0.8, maxTokens 200

- [x] Task 3: Create Database Migration (AC: #5)
  - [x] 3.1 Create `supabase/migrations/00033_add_icebreaker_premium_prompt.sql`
  - [x] 3.2 Insert global prompt (tenant_id = NULL)
  - [x] 3.3 Include complete template matching code default
  - [x] 3.4 Set version 1, is_active true

- [x] Task 4: Unit Tests (AC: #1-#6)
  - [x] 4.1 Test PromptManager returns icebreaker_premium_generation from code default
  - [x] 4.2 Test prompt interpolation with {{linkedinPosts}} variable
  - [x] 4.3 Test conditional {{#if productName}} blocks
  - [x] 4.4 Test PROMPT_KEYS includes new key
  - [x] 4.5 Verify Zod schema validates new key

- [x] Task 5: Manual Verification
  - [x] 5.1 TypeScript compilation verified (no errors)
  - [x] 5.2 All unit tests passing
  - [x] 5.3 Migration applies cleanly to local Supabase

## Dev Notes

### Story Context - Why This Feature

**Problem:** Epic 6.5 (Icebreaker Premium) generates highly personalized icebreakers based on real LinkedIn posts. Story 6.5.2 fetches the posts via Apify. This story creates the dedicated prompt that will analyze those posts and generate contextual icebreakers.

**Solution:** Create a new `icebreaker_premium_generation` prompt key with a specialized template that:
1. Analyzes LinkedIn posts content
2. Identifies what the lead cares about
3. Creates icebreakers that reference specific post content
4. Connects with sender's product value proposition

**User Value:** Icebreakers that reference real LinkedIn content have significantly higher response rates compared to generic personalization based only on job title/company.

### Integration with Epic 6.5 Architecture

| Story | Status | Dependency |
|-------|--------|------------|
| 6.5.1 | **DONE** | Apify credentials storage and testConnection |
| 6.5.2 | **DONE** | LinkedIn posts fetching service (fetchLinkedInPosts) |
| **6.5.3** (this story) | **IN PROGRESS** | Prompt for icebreaker generation |
| 6.5.4 | Backlog | Database schema for storing icebreakers |
| 6.5.5 | Backlog | API endpoint that orchestrates 6.5.2 + 6.5.3 |
| 6.5.6-6.5.7 | Backlog | UI and email integration |

### Existing Patterns to Follow

**1. PromptManager (src/lib/ai/prompt-manager.ts):**

The PromptManager already implements:
- 3-level fallback: tenant-specific -> global -> code default
- 5-minute caching with TTL
- Template interpolation with conditionals

```typescript
// Usage pattern (from Story 6.5.5)
const promptManager = PromptManager.getInstance();
const rendered = await promptManager.renderPrompt(
  'icebreaker_premium_generation',
  {
    firstName: lead.first_name,
    lastName: lead.last_name,
    linkedinPosts: formattedPosts,
    // ... other variables
  },
  { tenantId }
);
```

**2. Existing Icebreaker Prompt (icebreaker_generation):**

Current prompt structure in defaults.ts (lines 244-332):
- Company context section
- Product context with conditional
- Lead profile section
- Tone of voice guidance
- Examples section with conditional
- Quality rules

**3. Template Variable Pattern:**

```typescript
// Simple interpolation
{{variableName}}

// Conditional blocks
{{#if variableName}}
Content when variable exists
{{else}}
Fallback content
{{/if}}
```

### Prompt Template Design

The `icebreaker_premium_generation` prompt should:

**Input Variables:**
- `{{firstName}}`, `{{lastName}}` - Lead's name
- `{{title}}` - Lead's job title
- `{{companyName}}` - Lead's company
- `{{industry}}` - Lead's industry
- `{{linkedinPosts}}` - Formatted LinkedIn posts from Apify (Story 6.5.2)
- `{{productName}}`, `{{productDescription}}` - Optional product context
- `{{companyContext}}` - Sender's company info from KB
- `{{toneStyle}}`, `{{toneDescription}}` - Tone of voice settings

**Output:**
- 1-2 sentences icebreaker
- Max 50 words
- References specific post content
- Connects with sender's value proposition (if product context available)

### LinkedInPost Format (from Story 6.5.2)

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

**Formatting for prompt:**
Posts should be formatted as a readable string for the AI:

```
POST 1 (12 Jan 2026, 42 curtidas):
"Texto do post aqui..."

POST 2 (5 Jan 2026, 18 curtidas):
"Outro texto aqui..."
```

### Migration Notes

**File:** `supabase/migrations/00033_add_icebreaker_premium_prompt.sql`

Previous migrations:
- 00032_add_apify_service_name.sql (last)
- 00031_create_campaign_templates.sql
- 00030_add_email_mode_column.sql

**Migration Pattern (from 00021_seed_ai_prompts.sql):**

```sql
INSERT INTO ai_prompts (
  tenant_id,
  prompt_key,
  prompt_template,
  model_preference,
  version,
  is_active,
  metadata
) VALUES (
  NULL,  -- global prompt
  'icebreaker_premium_generation',
  E'Prompt template here...',
  'gpt-4o-mini',
  1,
  true,
  '{"temperature": 0.8, "maxTokens": 200}'::jsonb
);
```

### Testing Strategy

**Unit Tests (`__tests__/unit/lib/ai/prompt-manager.test.ts`):**

1. **Type Tests:**
   - PromptKey type includes 'icebreaker_premium_generation'
   - PROMPT_KEYS array includes new key
   - Zod schema validates new key

2. **Code Default Tests:**
   - CODE_DEFAULT_PROMPTS includes icebreaker_premium_generation
   - Has expected modelPreference
   - Has expected metadata

3. **Interpolation Tests:**
   - {{linkedinPosts}} variable is replaced
   - {{#if productName}} conditional works
   - All required variables are substitutable

**Mock Pattern (existing in tests):**

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

// Mock returns no DB prompt, forcing code default
mockSupabase.from.mockReturnValue({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
});
```

### Prompt Quality Guidelines

**Good Icebreakers:**
- "Li seu post sobre [tema específico]. A forma como você abordou [insight] me fez pensar em como nosso [produto] poderia..."
- "Curti muito sua perspectiva sobre [tema do post]. Na [empresa], temos visto resultados similares com..."
- "Seu post sobre [tema] gerou bastante engajamento. Empresas como a [lead_company] que pensam assim costumam se beneficiar de..."

**Avoid:**
- "Vi que você posta muito no LinkedIn..."
- "Parabéns pelos seus posts..."
- Generic compliments without specific reference

### Previous Story Learnings (6.5.2)

From Story 6.5.2 code review:
1. Error messages must match AC exactly (use Portuguese)
2. Validate all inputs before processing
3. Handle edge cases gracefully
4. Include comprehensive unit tests
5. Document all changes in File List

### Project Structure Notes

**Files to modify:**
```
src/types/ai-prompt.ts              # Add PromptKey
src/lib/ai/prompts/defaults.ts      # Add CODE_DEFAULT_PROMPTS entry
```

**Files to create:**
```
supabase/migrations/00033_add_icebreaker_premium_prompt.sql
```

**Files to update for tests:**
```
__tests__/unit/lib/ai/prompt-manager.test.ts  # Add tests for new prompt
```

### Architecture Compliance

**From architecture.md:**
- PromptManager pattern with 3-level fallback (ADR-001)
- Prompts editable via Supabase Studio
- Cache with 5-minute TTL
- Error messages in Portuguese
- Types in src/types/ directory

### References

- [Source: epics.md - Story 6.5.3 acceptance criteria]
- [Source: architecture.md - ADR-001: AI Prompt Management System]
- [Source: src/lib/ai/prompt-manager.ts - PromptManager implementation]
- [Source: src/lib/ai/prompts/defaults.ts - Existing prompts]
- [Source: src/types/ai-prompt.ts - PromptKey type]
- [Source: supabase/migrations/00021_seed_ai_prompts.sql - Migration pattern]
- [Source: 6-5-2-apify-linkedin-posts-service.md - Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- ✅ Task 1: Added `icebreaker_premium_generation` to PromptKey type, PROMPT_KEYS array, and promptKeySchema in `src/types/ai-prompt.ts`
- ✅ Task 2: Added code default prompt in `src/lib/ai/prompts/defaults.ts` with full template including LinkedIn posts analysis, conditional product context, and quality guidelines
- ✅ Task 3: Created migration `supabase/migrations/00033_add_icebreaker_premium_prompt.sql` with global prompt seed
- ✅ Task 4: Added 10 new tests for icebreaker_premium_generation in `__tests__/unit/lib/ai/prompt-manager.test.ts` and created new test file `__tests__/unit/types/ai-prompt.test.ts` with 10 tests for PROMPT_KEYS and Zod schema validation
- ✅ Task 5: TypeScript compilation verified (no errors), 99 related tests passing

### Code Review Fixes (2026-02-04)

- ✅ CR-M3: Migration now idempotent with `WHERE NOT EXISTS` clause
- ✅ CR-M2: Added 3 edge case tests for empty/undefined/whitespace linkedinPosts
- ✅ CR-M1: Documented camelCase variable naming convention in defaults.ts (intentional difference from snake_case prompts, per Story 6.5.5 design)
- ✅ CR-L1: Updated test mock to include all template variables (title, industry, companyContext, toneDescription)

### Change Log

- 2026-02-04: Code review fixes applied - idempotent migration, edge case tests, documentation
- 2026-02-04: Story implementation complete - prompt key, code default, migration, and tests added

### File List

**Modified:**
- `src/types/ai-prompt.ts` - Added icebreaker_premium_generation to PromptKey, PROMPT_KEYS, promptKeySchema
- `src/lib/ai/prompts/defaults.ts` - Added icebreaker_premium_generation code default prompt
- `__tests__/unit/lib/ai/prompt-manager.test.ts` - Added tests for icebreaker_premium_generation
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Status updated to review

**Created:**
- `supabase/migrations/00033_add_icebreaker_premium_prompt.sql` - Global prompt seed migration
- `__tests__/unit/types/ai-prompt.test.ts` - Type and Zod schema validation tests
