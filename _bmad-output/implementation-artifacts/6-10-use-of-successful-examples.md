# Story 6.10: Use of Successful Examples

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want AI to learn from my successful email examples,
So that generated texts match my proven style.

## Acceptance Criteria

### AC #1: Examples Included in AI Prompts
**Given** I have added email examples to my knowledge base (via Settings > Base de Conhecimento > Exemplos)
**When** AI generates text (subject, body, or icebreaker)
**Then** the prompt includes these examples as reference
**And** examples are formatted with subject, body, and context (if available)
**And** maximum of 3 most recent examples are included to keep prompts concise

### AC #2: Generated Text Adopts Similar Structure
**Given** my examples have a specific structure (e.g., short paragraphs, bullet points, specific opening style)
**When** AI generates text
**Then** the output adopts similar structural patterns
**And** paragraph length and formatting are similar to examples
**And** the flow (intro → value prop → CTA) mirrors examples when applicable

### AC #3: Personalization Techniques Learned
**Given** my examples use specific personalization techniques (e.g., company name in first sentence, industry-specific references)
**When** AI generates text
**Then** similar personalization techniques are applied
**And** the lead's company name and industry are woven naturally into the text
**And** the personalization feels authentic, not forced

### AC #4: Output Feels User-Written
**Given** examples reflect my unique communication style
**When** AI generates text
**Then** the output feels like something I could have written
**And** vocabulary choices align with my examples
**And** the overall voice is consistent with my brand

### AC #5: Examples Combined with Product Context
**Given** a campaign has both examples AND a product selected (Story 6.5)
**When** AI generates text
**Then** product-specific content follows the same style patterns as examples
**And** the product is presented using vocabulary similar to examples
**And** both contexts are harmoniously integrated

### AC #6: Graceful Degradation (No Examples Configured)
**Given** no examples are configured in the knowledge base
**When** AI generates text
**Then** it uses general best practices for cold email
**And** generation proceeds normally without errors
**And** output quality is acceptable (baseline quality)

### AC #7: User Guidance When Examples Missing
**Given** no examples are configured in the knowledge base
**When** user is in Campaign Builder and hovers/clicks on AI generate button
**Then** a subtle hint suggests adding examples for better results
**And** hint includes link to Knowledge Base > Exemplos
**And** hint is non-blocking (user can still generate without examples)

## Tasks / Subtasks

- [x] Task 1: Verify and Enhance Prompts for Example Learning (AC: #1, #2, #3, #4)
  - [x] 1.1 Review current prompts in `src/lib/ai/prompts/defaults.ts` - confirm examples section is clear
  - [x] 1.2 Enhance prompt instructions to explicitly emphasize learning patterns from examples
  - [x] 1.3 Add specific guidance: "Match the structure, vocabulary, and personalization style of the examples"
  - [x] 1.4 Create migration `00029_enhance_prompts_example_learning.sql` with updated prompts

- [x] Task 2: Unit Tests - Examples in AI Variables (AC: #1, #5, #6)
  - [x] 2.1 Test `formatEmailExamples` formats examples correctly (subject, body, context)
  - [x] 2.2 Test `formatEmailExamples` limits to MAX_EXAMPLES_IN_PROMPT (3)
  - [x] 2.3 Test `formatEmailExamples` returns empty string when no examples
  - [x] 2.4 Test `buildAIVariables` includes `successful_examples` correctly
  - [x] 2.5 Test `buildAIVariables` with examples + product context combined
  - [x] 2.6 Test `buildAIVariables` returns empty successful_examples when KB has no examples

- [x] Task 3: Integration Tests - Prompts Include Examples (AC: #1, #2)
  - [x] 3.1 Test prompt interpolation includes examples section when available
  - [x] 3.2 Test prompt interpolation omits examples section when empty
  - [x] 3.3 Test all three prompts (subject, body, icebreaker) handle examples correctly

- [x] Task 4: UI Guidance for Missing Examples (AC: #7)
  - [x] 4.1 Add `hasExamples` flag to `useKnowledgeBaseContext` hook return
  - [x] 4.2 Create `ExamplesHint` component with tooltip and KB link
  - [x] 4.3 Integrate hint near AI generate buttons in `EmailBlock.tsx`
  - [x] 4.4 Style hint as subtle, non-intrusive (small icon with tooltip)
  - [x] 4.5 Add unit test for `ExamplesHint` component visibility logic

- [x] Task 5: Manual Test - Verify Example Impact on Generation (AC: #1-#5)
  - [x] 5.1 Document manual test: Add 2-3 examples with distinct style to KB
  - [x] 5.2 Document manual test: Generate email and verify similar patterns
  - [x] 5.3 Document manual test: Compare output with vs without examples
  - [x] 5.4 Document manual test: Test with product context + examples
  - [x] 5.5 Document manual test: Verify graceful degradation (no examples)

## Dev Notes

### Story Dependencies - ALREADY IMPLEMENTED

**CRITICAL:** The core infrastructure for examples is ALREADY DONE in previous stories:

- **Story 2.5** (done): Knowledge Base Editor - Tone & Examples - Created `knowledge_base_examples` table, CRUD operations, `useEmailExamples` hook
- **Story 6.1** (done): AI Provider Service Layer - PromptManager, prompt interpolation with variables
- **Story 6.3** (done): Knowledge Base Integration - `buildAIVariables` includes `successful_examples`, `formatEmailExamples` function
- **Story 6.5** (done): Campaign Product Context - Product context works alongside KB context
- **Story 6.9** (done): Tone of Voice Application - Tone guides in prompts work with examples

### Current Implementation Analysis

**EmailExample Type (`src/types/knowledge-base.ts:170-178`):**
```typescript
export interface EmailExample {
  id: string;
  tenant_id: string;
  subject: string;
  body: string;
  context: string | null;
  created_at: string;
  updated_at: string;
}
```

**formatEmailExamples Function (`src/lib/services/knowledge-base-context.ts:199-216`):**
```typescript
function formatEmailExamples(examples: EmailExample[]): string {
  if (examples.length === 0) {
    return "";
  }
  const recentExamples = examples.slice(0, MAX_EXAMPLES_IN_PROMPT); // 3
  return recentExamples.map((ex, idx) => {
    const lines = [`Exemplo ${idx + 1}:`, `Assunto: ${ex.subject}`, `Corpo: ${ex.body}`];
    if (ex.context) {
      lines.push(`Contexto: ${ex.context}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}
```

**Current Prompt Usage (`src/lib/ai/prompts/defaults.ts`):**
All three prompts already include:
```
{{#if successful_examples}}
EXEMPLOS DE [ASSUNTOS/EMAILS/ABORDAGENS] QUE FUNCIONARAM:
{{successful_examples}}
{{/if}}
```

**Gap Identified:** The prompts include examples but don't strongly emphasize LEARNING from them. Need to add explicit instructions like "Match the structure and style of these examples."

### Implementation Pattern

**Enhanced Prompt Example Instructions:**
```
{{#if successful_examples}}
EXEMPLOS DE EMAILS QUE FUNCIONARAM (APRENDA COM ELES):
{{successful_examples}}

IMPORTANTE - USE OS EXEMPLOS COMO REFERÊNCIA:
- Adote estrutura similar (comprimento de parágrafos, formatação)
- Use vocabulário parecido ao dos exemplos
- Aplique as mesmas técnicas de personalização
- O resultado deve parecer escrito pela mesma pessoa
{{/if}}
```

### UI Hint Component Design

```tsx
// components/builder/ExamplesHint.tsx
interface ExamplesHintProps {
  hasExamples: boolean;
}

export function ExamplesHint({ hasExamples }: ExamplesHintProps) {
  if (hasExamples) return null;

  return (
    <Tooltip content="Adicione exemplos de emails bem-sucedidos para melhorar a qualidade da geração">
      <Link href="/settings/knowledge-base" className="text-muted-foreground hover:text-foreground">
        <Lightbulb className="h-3.5 w-3.5" />
      </Link>
    </Tooltip>
  );
}
```

### Project Structure Notes

**Files to Modify:**
```
src/lib/ai/prompts/defaults.ts                    - Enhance example learning instructions
supabase/migrations/00029_enhance_prompts_example_learning.sql  - NEW migration
src/hooks/use-knowledge-base-context.ts           - Add hasExamples flag (if not exists)
src/components/builder/ExamplesHint.tsx           - NEW component
src/components/builder/EmailBlock.tsx             - Integrate ExamplesHint
__tests__/unit/lib/services/knowledge-base-context.test.ts     - Add example tests
__tests__/unit/lib/ai/prompt-manager.test.ts      - Add example interpolation tests
__tests__/unit/components/builder/ExamplesHint.test.tsx        - NEW tests
```

**No Database Schema Changes** - Examples infrastructure exists from Story 2.5.

### Testing Strategy

**Unit Tests - formatEmailExamples:**
1. Empty array returns empty string
2. Single example formats correctly
3. Multiple examples limited to MAX_EXAMPLES_IN_PROMPT (3)
4. Context included when present, omitted when null
5. Format matches expected "Exemplo N:\nAssunto: ...\nCorpo: ..."

**Unit Tests - buildAIVariables with examples:**
1. `successful_examples` contains formatted examples
2. Empty when KB has no examples
3. Works correctly with product context simultaneously
4. Order preserved (most recent first)

**Integration Tests - Prompt Rendering:**
1. `{{#if successful_examples}}` block included when examples exist
2. Block omitted when no examples
3. Examples interpolated correctly into all three prompts

**Manual Verification (E2E):**
Since AI output is non-deterministic, manual verification confirms:
1. Generated text shows stylistic similarities to examples
2. Structure (paragraph length, CTA placement) reflects examples
3. Personalization techniques are similar
4. Product context + examples work harmoniously

### Edge Cases to Handle

1. **No Examples:** Graceful degradation, use best practices (ALREADY HANDLED)
2. **Many Examples:** Limited to 3 most recent (ALREADY HANDLED)
3. **Example with No Context:** Format without context line (ALREADY HANDLED)
4. **Very Long Examples:** Examples are limited by maxTokens in prompt (acceptable)
5. **Examples + Product + Tone:** All three contexts must work together

### Technical Constraints

1. **Prompt Size:** Adding learning instructions increases prompt length slightly - stay within token limits
2. **Non-Deterministic Output:** AI may not perfectly replicate example style 100% - acceptable variance
3. **MAX_EXAMPLES_IN_PROMPT:** Constant set to 3 to balance quality vs prompt size
4. **Handlebars Conditionals:** `{{#if successful_examples}}` already works

### Migration Content Preview

```sql
-- Migration: 00029_enhance_prompts_example_learning.sql
-- Story 6.10: Use of Successful Examples
--
-- Enhances prompts with explicit instructions to learn from examples.
-- Adds guidance for structure, vocabulary, and personalization matching.

UPDATE public.ai_prompts
SET
  prompt_template = '... enhanced prompt with example learning instructions ...',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'email_subject_generation' AND tenant_id IS NULL;

-- Similar updates for email_body_generation and icebreaker_generation
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.10]
- [Source: src/types/knowledge-base.ts:170-178 - EmailExample interface]
- [Source: src/lib/services/knowledge-base-context.ts:199-216 - formatEmailExamples]
- [Source: src/lib/services/knowledge-base-context.ts:322 - successful_examples in buildAIVariables]
- [Source: src/lib/ai/prompts/defaults.ts - Current prompts with examples conditionals]
- [Source: _bmad-output/implementation-artifacts/6-9-tone-of-voice-application.md - Previous story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None

### Completion Notes List

1. **Task 1 - Enhanced Prompts**: Updated all three prompts (email_subject_generation, email_body_generation, icebreaker_generation) with explicit instructions to LEARN from examples, not just reference them. Added guidance for matching structure, vocabulary, and personalization patterns. Created migration 00029.

2. **Task 2 - Unit Tests**: Added 7 new tests to knowledge-base-context.test.ts covering formatEmailExamples formatting, MAX_EXAMPLES_IN_PROMPT limit, empty handling, and examples + product context combined scenarios. All 40 tests passing.

3. **Task 3 - Integration Tests**: Added 6 new tests to prompt-manager.test.ts for examples interpolation including availability, empty handling, and combined contexts. All 37 tests passing.

4. **Task 4 - UI Guidance**: Created ExamplesHint component with Lightbulb icon, tooltip, and link to KB settings. Integrated into EmailBlock.tsx near AI generate button. Added hasExamples flag to useKnowledgeBaseContext hook. 6 new tests for component visibility logic.

5. **Task 5 - Manual Tests**: Documented in Dev Notes section. Tests cover adding examples with distinct style, generating and comparing output, product context integration, and graceful degradation without examples.

### Manual Test Documentation (Task 5)

#### Test 5.1: Add Examples with Distinct Style
1. Navigate to Settings > Base de Conhecimento > Exemplos
2. Add 2-3 email examples with distinct characteristics:
   - Example 1: Formal tone, structured paragraphs, professional CTA
   - Example 2: Casual tone, short sentences, friendly CTA
   - Example 3: Technical tone, bullet points, data-driven CTA

#### Test 5.2: Generate and Verify Patterns
1. Create new campaign in Campaign Builder
2. Select a lead with company/industry data
3. Click "Gerar com IA" button
4. Verify generated text shows structural similarities to examples
5. Check vocabulary and personalization patterns match examples

#### Test 5.3: Compare Output With/Without Examples
1. First, generate email WITHOUT examples configured
2. Note the generic style and structure
3. Add examples to Knowledge Base
4. Generate new email for same lead
5. Compare: With examples should show distinct style matching

#### Test 5.4: Test Product Context + Examples
1. Create product in Settings > Produtos
2. Select product in campaign
3. Have examples configured
4. Generate email
5. Verify: Product content follows example style patterns

#### Test 5.5: Verify Graceful Degradation
1. Remove all examples from Knowledge Base
2. Generate email in Campaign Builder
3. Verify: Generation completes without errors
4. Output uses general best practices (baseline quality)
5. ExamplesHint icon appears near generate button

### File List

**New Files:**
- supabase/migrations/00029_enhance_prompts_example_learning.sql
- src/components/builder/ExamplesHint.tsx
- __tests__/unit/components/builder/ExamplesHint.test.tsx

**Modified Files:**
- src/lib/ai/prompts/defaults.ts (enhanced example learning instructions)
- src/hooks/use-knowledge-base-context.ts (added hasExamples flag)
- src/components/builder/EmailBlock.tsx (integrated ExamplesHint)
- src/lib/services/knowledge-base-context.ts (no functional changes - CR cleanup)
- src/app/api/ai/generate/route.ts (no functional changes - CR cleanup)
- __tests__/unit/lib/services/knowledge-base-context.test.ts (added Story 6.10 tests)
- __tests__/unit/lib/ai/prompt-manager.test.ts (added examples interpolation tests)

### Change Log

- 2026-02-03: Code Review - Removed debug console.log statements, updated File List
- 2026-02-03: Story 6.10 implementation complete - Enhanced prompts with explicit example learning instructions, added ExamplesHint UI guidance component, comprehensive unit and integration tests added

