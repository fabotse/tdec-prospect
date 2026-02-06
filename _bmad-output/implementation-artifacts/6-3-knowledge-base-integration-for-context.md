# Story 6.3: Knowledge Base Integration for Context

Status: done

## Story

As a user,
I want AI to use my company's knowledge base,
So that generated texts reflect my business accurately.

## Acceptance Criteria

### AC #1: Knowledge Base Context in AI Prompts
**Given** I am generating text in the campaign builder
**When** the AI is called
**Then** the prompt includes:
  - Company description and products
  - Tone of voice settings
  - ICP information
  - Successful email examples (if available)

### AC #2: Company Context Alignment
**Given** the AI generates text
**When** the response is returned
**Then** the generated text aligns with company context
**And** mentions products/services if relevant
**And** reflects the company's value proposition

### AC #3: Tone of Voice Matching
**Given** I have configured tone of voice (formal/casual/technical)
**When** AI generates text
**Then** the tone matches the configured style
**And** follows custom writing guidelines if defined

### AC #4: Email Examples Reference
**Given** I have added email examples to my knowledge base
**When** AI generates text
**Then** the prompt includes these examples as reference
**And** generated text adopts similar structure and patterns

### AC #5: Graceful Degradation
**Given** knowledge base is not configured (empty)
**When** AI generates text
**Then** the system uses sensible defaults (current behavior)
**And** generation still works without errors

## Tasks / Subtasks

- [x] Task 1: Create Knowledge Base Context Service (AC: #1, #5)
  - [x] 1.1 Create `src/lib/services/knowledge-base-context.ts` service
  - [x] 1.2 Create `getKnowledgeBaseContext()` function to fetch all KB sections
  - [x] 1.3 Implement fallback to defaults when KB is empty
  - [x] 1.4 Implement caching with TanStack Query (5 min stale time)

- [x] Task 2: Create Knowledge Base Context API Route (AC: #1)
  - [x] 2.1 Create `src/app/api/knowledge-base/context/route.ts`
  - [x] 2.2 Allow any authenticated user to fetch KB context (not admin-only)
  - [x] 2.3 Return compiled context object with all sections
  - [x] 2.4 Handle missing sections gracefully

- [x] Task 3: Create useKnowledgeBaseContext Hook (AC: #1, #5)
  - [x] 3.1 Create `src/hooks/use-knowledge-base-context.ts`
  - [x] 3.2 Use TanStack Query to fetch and cache KB context
  - [x] 3.3 Export `buildAIVariables()` helper to compile KB into prompt variables
  - [x] 3.4 Handle loading and error states

- [x] Task 4: Update EmailBlock with Knowledge Base Context (AC: #1, #2, #3, #4)
  - [x] 4.1 Import useKnowledgeBaseContext in EmailBlock
  - [x] 4.2 Replace DEFAULT_GENERATION_VARIABLES with real KB context
  - [x] 4.3 Merge KB context with lead context (future Story 6.4)
  - [x] 4.4 Show loading indicator while KB context loads

- [x] Task 5: Update Prompt Variables Structure (AC: #2, #3, #4)
  - [x] 5.1 Update prompts to use expanded context variables
  - [x] 5.2 Add `successful_examples` variable interpolation
  - [x] 5.3 Add `tone_style` and `writing_guidelines` variables
  - [x] 5.4 Update seeded prompts in DB migration if needed

- [x] Task 6: Unit Tests (AC: #1-#5)
  - [x] 6.1 Test knowledge-base-context service
  - [x] 6.2 Test API route authentication and response
  - [x] 6.3 Test useKnowledgeBaseContext hook
  - [x] 6.4 Test EmailBlock integration with KB context
  - [x] 6.5 Test fallback behavior when KB is empty

## Dev Notes

### Story 6.2 Foundation - ALREADY IMPLEMENTED

**CRITICAL:** Story 6.2 created the AI generation infrastructure. DO NOT recreate:
- `src/hooks/use-ai-generate.ts` - AI generation hook with streaming ✅
- `src/components/builder/EmailBlock.tsx` - Uses `DEFAULT_GENERATION_VARIABLES` ✅
- `src/app/api/ai/generate/route.ts` - API endpoint with SSE streaming ✅
- `src/lib/ai/prompt-manager.ts` - PromptManager with 3-level fallback ✅

**Current Problem (line 28 in EmailBlock.tsx):**
```typescript
import { useAIGenerate, DEFAULT_GENERATION_VARIABLES } from "@/hooks/use-ai-generate";
```

The `DEFAULT_GENERATION_VARIABLES` contains placeholders that need to be replaced with real KB data.

### Existing Knowledge Base Infrastructure (Epic 2)

**Types:** `src/types/knowledge-base.ts`
```typescript
interface CompanyProfile {
  company_name: string;
  business_description: string;
  products_services: string;
  competitive_advantages: string;
}

interface ToneOfVoice {
  preset: "formal" | "casual" | "technical";
  custom_description: string;
  writing_guidelines: string;
}

interface ICPDefinition {
  company_sizes: CompanySize[];
  industries: string[];
  job_titles: string[];
  geographic_focus: string[];
  pain_points: string;
  common_objections: string;
}

interface EmailExample {
  id: string;
  subject: string;
  body: string;
  context: string | null;
}
```

**Server Actions:** `src/actions/knowledge-base.ts`
- `getCompanyProfile()` - Requires admin role ⚠️
- `getToneOfVoice()` - Requires admin role ⚠️
- `getEmailExamples()` - Requires admin role ⚠️
- `getICPDefinition()` - Requires admin role ⚠️

**IMPORTANT:** Current actions require admin role. For AI generation, any authenticated user needs read access to KB context. Create a new API route that allows this.

### Knowledge Base Context API Design

Create new route that aggregates all KB sections for AI context:

```typescript
// GET /api/knowledge-base/context
// Returns compiled context for AI generation (any authenticated user)

interface KnowledgeBaseContextResponse {
  success: boolean;
  data: {
    company: CompanyProfile | null;
    tone: ToneOfVoice | null;
    icp: ICPDefinition | null;
    examples: EmailExample[];
  };
}
```

### AI Variables Compilation

Transform KB data into prompt variables:

```typescript
interface AIContextVariables {
  // Company context
  company_context: string;      // Compiled from company profile
  products_services: string;    // Direct from KB
  competitive_advantages: string;

  // Tone context
  tone_description: string;     // Compiled from tone settings
  tone_style: string;           // "formal" | "casual" | "technical"
  writing_guidelines: string;   // Custom guidelines

  // ICP context
  icp_summary: string;          // Compiled from ICP definition
  target_industries: string;
  target_titles: string;
  pain_points: string;

  // Examples context
  successful_examples: string;  // Formatted email examples

  // Lead context (from Story 6.4, use placeholder for now)
  lead_name: string;
  lead_title: string;
  lead_company: string;
  lead_industry: string;
  lead_location: string;

  // Email context
  email_objective: string;
  icebreaker: string;
}
```

### Compilation Logic

```typescript
function buildAIVariables(kb: KnowledgeBaseContext): AIContextVariables {
  const { company, tone, icp, examples } = kb;

  // Company context compilation
  const company_context = company
    ? `${company.company_name} - ${company.business_description}`
    : "Empresa de tecnologia focada em soluções B2B";

  // Tone description compilation
  const tone_description = tone
    ? `Tom ${TONE_PRESET_LABELS[tone.preset]}. ${tone.custom_description}`
    : "Profissional e amigável";

  // ICP summary compilation
  const icp_summary = icp
    ? `Foco em ${icp.industries.join(", ")} | Cargos: ${icp.job_titles.join(", ")}`
    : "";

  // Examples formatting (last 3 examples)
  const successful_examples = examples.length > 0
    ? examples.slice(0, 3).map(ex =>
        `Exemplo:\nAssunto: ${ex.subject}\nCorpo: ${ex.body}`
      ).join("\n\n")
    : "";

  return {
    company_context,
    products_services: company?.products_services || "",
    competitive_advantages: company?.competitive_advantages || "",
    tone_description,
    tone_style: tone?.preset || "casual",
    writing_guidelines: tone?.writing_guidelines || "",
    icp_summary,
    target_industries: icp?.industries.join(", ") || "",
    target_titles: icp?.job_titles.join(", ") || "",
    pain_points: icp?.pain_points || "",
    successful_examples,
    // Lead placeholders (Story 6.4 will provide real values)
    lead_name: "Nome",
    lead_title: "Cargo",
    lead_company: "Empresa",
    lead_industry: "Tecnologia",
    lead_location: "Brasil",
    email_objective: "Prospecção inicial para apresentar soluções",
    icebreaker: "",
  };
}
```

### Hook Pattern

```typescript
// src/hooks/use-knowledge-base-context.ts
export function useKnowledgeBaseContext() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["knowledge-base", "context"],
    queryFn: fetchKnowledgeBaseContext,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const variables = useMemo(() =>
    data ? buildAIVariables(data) : DEFAULT_GENERATION_VARIABLES,
    [data]
  );

  return {
    context: data,
    variables,
    isLoading,
    error,
  };
}
```

### EmailBlock Integration

Update EmailBlock to use KB context:

```typescript
// In EmailBlock.tsx
const { variables: kbVariables, isLoading: kbLoading } = useKnowledgeBaseContext();

const handleGenerate = useCallback(async () => {
  resetAI();

  // Merge KB variables with any lead-specific overrides (Story 6.4)
  const variables = {
    ...kbVariables,
    // Lead overrides will come from campaign context
  };

  try {
    setGeneratingField("subject");
    const generatedSubject = await generate({
      promptKey: "email_subject_generation",
      variables, // Real KB context!
      stream: true,
    });
    // ... rest of generation logic
  } catch {
    setGeneratingField(null);
  }
}, [generate, resetAI, kbVariables, block.id, updateBlock, body]);
```

### Prompt Template Updates

Current seeded prompts may need variable placeholders updated. Check:
- `email_subject_generation` - Needs `{{successful_examples}}`, `{{tone_style}}`
- `email_body_generation` - Needs `{{icp_summary}}`, `{{writing_guidelines}}`

If prompts don't have these placeholders, create a migration to update them.

### Project Structure Notes

**New Files:**
```
src/lib/services/
├── knowledge-base-context.ts    # NEW: KB context service

src/app/api/knowledge-base/
├── context/
│   └── route.ts                  # NEW: GET KB context for AI

src/hooks/
├── use-knowledge-base-context.ts # NEW: Hook for KB context

__tests__/unit/
├── lib/services/
│   └── knowledge-base-context.test.ts
├── hooks/
│   └── use-knowledge-base-context.test.tsx
```

**Modified Files:**
- `src/components/builder/EmailBlock.tsx` - Use KB context instead of defaults
- `src/hooks/use-ai-generate.ts` - Remove DEFAULT_GENERATION_VARIABLES export (move to KB context)
- `supabase/migrations/00022_update_ai_prompts_kb_variables.sql` - Update prompt templates (if needed)

### Testing Strategy

**Unit Tests:**
1. Test `buildAIVariables()` with complete KB data
2. Test `buildAIVariables()` with partial KB data (fallbacks)
3. Test `buildAIVariables()` with empty KB data
4. Test API route returns correct structure
5. Test API route requires authentication (not admin)
6. Test hook caching behavior

**Integration Tests:**
- Test EmailBlock generation with mocked KB context
- Verify correct variables are passed to generate()

### Technical Constraints

1. **Performance:** KB context should be cached (5 min stale time)
2. **Security:** Any authenticated user can read KB context (read-only)
3. **Graceful Degradation:** Generation must work even if KB is empty
4. **Portuguese Messages:** All error messages in Portuguese
5. **Type Safety:** Strict TypeScript types for all KB structures

### Dependencies

- **Story 6.1** (done): AI Provider Service Layer ✅
- **Story 6.2** (done): AI Text Generation in Builder ✅
- **Epic 2** (done): Knowledge Base Editor ✅

### Future Stories Impact

- **Story 6.4** (Personalized Icebreakers): Will add lead context to variables
- **Story 6.7** (Tone Application): Will use tone_style and writing_guidelines

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.3]
- [Source: _bmad-output/implementation-artifacts/6-2-ai-text-generation-in-builder.md]
- [Source: src/actions/knowledge-base.ts - Existing KB actions]
- [Source: src/types/knowledge-base.ts - KB type definitions]
- [Source: src/hooks/use-ai-generate.ts - Current default variables]
- [Source: src/components/builder/EmailBlock.tsx - Integration target]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-001]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without issues.

### Completion Notes List

- ✅ Created KB context service with buildAIVariables() function for compiling KB data into AI prompt variables
- ✅ Implemented graceful degradation with sensible defaults when KB is empty (AC #5)
- ✅ Created API route GET /api/knowledge-base/context allowing any authenticated user (not admin-only)
- ✅ Created useKnowledgeBaseContext hook with TanStack Query caching (5 min stale time)
- ✅ Updated EmailBlock to use KB context instead of DEFAULT_GENERATION_VARIABLES
- ✅ Added loading indicator in EmailBlock while KB context loads
- ✅ Updated AI prompts (both code defaults and DB migration) with new KB variables: products_services, competitive_advantages, icp_summary, pain_points, tone_style, writing_guidelines, successful_examples
- ✅ Created comprehensive unit tests: 19 tests for service, 14 tests for hook, 4 new tests for EmailBlock KB integration
- ✅ Updated existing tests (BuilderCanvas, SortableBlock) with useKnowledgeBaseContext mock
- ✅ All 72 Story 6.3 related tests passing

**Code Review Fixes (2026-02-02):**
- ✅ [H1] Added conditional block support (`{{#if var}}...{{/if}}`) to prompt-manager.ts interpolateTemplate()
- ✅ [M1] Updated File List to include all modified files (use-ai-generate.ts, prompt-manager.ts)
- ✅ [M2] Fixed act() warning in use-ai-generate cancel test
- ✅ Added 4 new tests for conditional block support in prompt-manager
- ✅ All 101 tests passing after fixes

### File List

**New Files:**
- src/lib/services/knowledge-base-context.ts
- src/app/api/knowledge-base/context/route.ts
- src/hooks/use-knowledge-base-context.ts
- supabase/migrations/00023_update_ai_prompts_kb_variables.sql
- __tests__/unit/lib/services/knowledge-base-context.test.ts
- __tests__/unit/hooks/use-knowledge-base-context.test.tsx

**Modified Files:**
- src/components/builder/EmailBlock.tsx
- src/lib/ai/prompts/defaults.ts
- src/lib/ai/prompt-manager.ts (Code Review Fix: added conditional block support)
- src/hooks/use-ai-generate.ts (timeout increased to 15s for longer KB prompts)
- __tests__/unit/components/builder/EmailBlock.test.tsx
- __tests__/unit/components/builder/SortableBlock.test.tsx
- __tests__/unit/components/builder/BuilderCanvas.test.tsx
- __tests__/unit/hooks/use-ai-generate.test.tsx (added timeout constant test)

## Change Log

- 2026-02-02: Story 6.3 implementation complete - KB context integration for AI prompts
- 2026-02-02: Code Review Fix H1 - Added conditional block support ({{#if}}...{{/if}}) to prompt-manager.ts
