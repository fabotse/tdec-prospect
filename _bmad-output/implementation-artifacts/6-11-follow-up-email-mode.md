# Story 6.11: Follow-Up Email Mode

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to create follow-up emails that reference the previous email in the sequence,
So that my campaign feels like a natural conversation, not repeated first contacts.

## Acceptance Criteria

### AC #1: Mode Selector Visibility
**Given** I am in the campaign builder with 2+ email blocks
**When** I select an email block that is NOT the first in sequence (position > 0)
**Then** I see a mode selector: "Email Inicial" | "Follow-Up"
**And** the default is "Email Inicial" (backward compatible)

### AC #2: Mode Persistence
**Given** I select "Follow-Up" mode for an email
**When** the mode is saved
**Then** the block shows visual indicator "Follow-up do Email X" (where X is position)
**And** the `email_blocks` record is updated with `email_mode = 'follow-up'`

### AC #3: Follow-Up AI Generation
**Given** I click "Gerar com IA" on a follow-up email
**When** AI generates content
**Then** the prompt includes the subject and body of the IMMEDIATELY PREVIOUS email
**And** the generated text:
  - References the previous contact naturally
  - Does NOT repeat product information already covered
  - Creates continuity in the conversation
  - Maintains the same tone of voice

### AC #4: Chain Follow-Up Context
**Given** Email 3 is marked as follow-up
**When** AI generates content for Email 3
**Then** it reads context from Email 2 (not Email 1)
**And** Email 4 (if follow-up) would read from Email 3, and so on

### AC #5: First Email Restriction
**Given** the first email in sequence (position = 0)
**When** I view the mode selector
**Then** it shows "Email Inicial" and is disabled (cannot be follow-up)
**And** tooltip explains: "O primeiro email da sequencia e sempre inicial"

### AC #6: Mode Change Back to Initial
**Given** I change a follow-up email back to "Email Inicial"
**When** the mode changes
**Then** subsequent generations will NOT include previous email context
**And** existing generated text is NOT automatically regenerated

## Tasks / Subtasks

- [x] Task 1: Database Migration - Add email_mode column (AC: #2)
  - [x] 1.1 Create migration `00030_add_email_mode_column.sql`
  - [x] 1.2 Add `email_mode` column to `email_blocks` table: `VARCHAR(20) DEFAULT 'initial'`
  - [x] 1.3 Add CHECK constraint: `email_mode IN ('initial', 'follow-up')`

- [x] Task 2: Add follow_up_email_generation Prompt (AC: #3, #4)
  - [x] 2.1 Add `"follow_up_email_generation"` to `PromptKey` type in `src/types/ai-prompt.ts`
  - [x] 2.2 Add to `PROMPT_KEYS` array and `promptKeySchema` Zod enum
  - [x] 2.3 Add to `AIPromptKey` type in `src/hooks/use-ai-generate.ts`
  - [x] 2.4 Create prompt template in `CODE_DEFAULT_PROMPTS` in `defaults.ts`
  - [x] 2.5 Add prompt to migration (seed in ai_prompts table)
  - [x] 2.6 Add `"follow_up_subject_generation"` prompt for RE: prefix subjects (CR-H2 fix)

- [x] Task 3: Update useBuilderStore - Get Previous Email (AC: #3, #4)
  - [x] 3.1 Add `getPreviousEmailBlock` selector to `use-builder-store.ts`
  - [x] 3.2 Function returns previous email block's subject/body for given position
  - [x] 3.3 Handle edge cases: first position returns null, delay blocks skipped

- [x] Task 4: Update EmailBlock Data Type (AC: #2)
  - [x] 4.1 Add `emailMode?: 'initial' | 'follow-up'` to `EmailBlockData` type
  - [x] 4.2 Default to `'initial'` when undefined (backward compatibility)

- [x] Task 5: UI - Mode Selector Component (AC: #1, #5)
  - [x] 5.1 Create mode selector UI in EmailBlock header (Toggle or Dropdown)
  - [x] 5.2 Show only when `stepNumber > 1` (position > 0)
  - [x] 5.3 Disable with tooltip for first email
  - [x] 5.4 Style consistently with existing EmailBlock design

- [x] Task 6: UI - Follow-Up Visual Indicator (AC: #2)
  - [x] 6.1 Show "Follow-up do Email X" indicator when mode is 'follow-up'
  - [x] 6.2 Use subtle styling (badge or icon indicator)
  - [x] 6.3 X = stepNumber - 1 (references previous email number)

- [x] Task 7: Update handleGenerate for Follow-Up (AC: #3, #4)
  - [x] 7.1 Check email_mode before generation
  - [x] 7.2 If follow-up: get previous email content via getPreviousEmailBlock
  - [x] 7.3 Use `follow_up_email_generation` prompt with previous email context
  - [x] 7.4 Pass `previous_email_subject`, `previous_email_body` as variables

- [x] Task 8: Unit Tests - Store and Types (AC: #3, #4)
  - [x] 8.1 Test `getPreviousEmailBlock` returns correct block
  - [x] 8.2 Test `getPreviousEmailBlock` returns null for first position
  - [x] 8.3 Test `getPreviousEmailBlock` skips delay blocks
  - [x] 8.4 Test emailMode persistence in block data

- [x] Task 9: Unit Tests - UI Components (AC: #1, #2, #5)
  - [x] 9.1 Test mode selector visibility based on position
  - [x] 9.2 Test mode selector disabled for first email
  - [x] 9.3 Test follow-up indicator visibility
  - [x] 9.4 Test mode change updates block data

- [x] Task 10: Integration Tests - Generation Flow (AC: #3, #4)
  - [x] 10.1 Test follow-up generation includes previous context
  - [x] 10.2 Test initial mode does not include previous context
  - [x] 10.3 Test chain follow-up (Email 3 reads Email 2)

- [ ] Task 11: Manual Verification (AC: #3)
  - [ ] 11.1 Create campaign with 3+ emails
  - [ ] 11.2 Set Email 2 and 3 as follow-up
  - [ ] 11.3 Generate content and verify:
    - Follow-up email references previous email naturally
    - Does not repeat product info from first email
    - Maintains conversation continuity
    - Tone of voice is consistent

## Dev Notes

### Story Context - Why This Feature

**Problem Identified:** During Story 6.8 (Text Regeneration) completion, user feedback revealed that emails in multi-step campaigns are generated independently, causing:
1. Repetition of product information in every email
2. No reference to previous contact attempts
3. Follow-ups feel like "first contact" again

**Solution:** Add mode selector to emails (position > 0) allowing "Follow-Up" mode that includes previous email context in AI prompts.

**Discovery:** Course Correction proposal 2026-02-03 ([sprint-change-proposal-2026-02-03.md](../../_bmad-output/planning-artifacts/sprint-change-proposal-2026-02-03.md))

### Implementation Patterns from Previous Stories

**Pattern 1: Type Extension (from Story 6.5, 6.6)**
```typescript
// src/types/ai-prompt.ts - Add to PromptKey type
export type PromptKey =
  | "search_translation"
  | "email_subject_generation"
  | "email_body_generation"
  | "icebreaker_generation"
  | "tone_application"
  | "follow_up_email_generation";  // NEW

// Also update PROMPT_KEYS array and promptKeySchema
```

**Pattern 2: Hook Type Extension (from Story 6.2)**
```typescript
// src/hooks/use-ai-generate.ts - Add to AIPromptKey
export type AIPromptKey =
  | "email_subject_generation"
  | "email_body_generation"
  | "icebreaker_generation"
  | "tone_application"
  | "follow_up_email_generation";  // NEW
```

**Pattern 3: Store Selector (from Story 6.6 - previewLead)**
```typescript
// src/stores/use-builder-store.ts - Add getPreviousEmailBlock
// Similar to how previewLead was added:

interface BuilderState {
  // ... existing fields
}

// Add selector function outside the store for reuse:
export function getPreviousEmailBlock(
  blocks: BuilderBlock[],
  currentPosition: number
): { subject: string; body: string } | null {
  // Find previous email block (skip delays)
  const emailBlocks = blocks
    .filter((b) => b.type === "email")
    .sort((a, b) => a.position - b.position);

  const currentIndex = emailBlocks.findIndex(
    (b) => b.position === currentPosition
  );

  if (currentIndex <= 0) return null;

  const prevBlock = emailBlocks[currentIndex - 1];
  const data = prevBlock.data as EmailBlockData;

  return {
    subject: data.subject || "",
    body: data.body || "",
  };
}
```

**Pattern 4: Email Block Data Extension (from Story 5.3)**
```typescript
// src/types/email-block.ts
export interface EmailBlockData {
  subject: string;
  body: string;
  emailMode?: "initial" | "follow-up";  // NEW - defaults to "initial"
}
```

### New Prompt Template Design

```typescript
// src/lib/ai/prompts/defaults.ts - Add new prompt

follow_up_email_generation: {
  template: `Voce e um especialista em copywriting para emails de prospeccao B2B.

Gere o corpo de um EMAIL DE FOLLOW-UP que da continuidade a uma conversa iniciada.

EMAIL ANTERIOR NA SEQUENCIA (VOCE JA ENVIOU ESTE):
Assunto: {{previous_email_subject}}
Corpo: {{previous_email_body}}

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}

{{#if product_name}}
PRODUTO EM FOCO (JA APRESENTADO NO EMAIL ANTERIOR - NAO REPITA INFORMACOES):
- Nome: {{product_name}}
{{/if}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}

OBJETIVO DO FOLLOW-UP:
{{email_objective}}

{{#if successful_examples}}
EXEMPLOS DE FOLLOW-UPS QUE FUNCIONARAM:
{{successful_examples}}
{{/if}}

REGRAS CRITICAS PARA FOLLOW-UP:
1. Maximo 100 palavras (follow-ups sao mais curtos)
2. REFERENCIE o email anterior naturalmente ("Conforme mencionei...", "Dando continuidade...", "Voltando ao assunto...")
3. NAO repita informacoes do produto ja apresentadas
4. Adicione NOVO valor: um caso de sucesso, uma estatistica, um insight
5. CTA diferente do email anterior (mais direto, oferecer reuniao, pedir feedback)
6. Mantenha o mesmo tom de voz do email anterior
7. NAO use "Espero que tenha recebido meu email anterior" - assuma que recebeu
8. Seja breve e direto - o lead ja conhece o contexto

ESTRUTURA RECOMENDADA:
- Referencia sutil ao contato anterior
- Novo ponto de valor (case, dado, insight)
- CTA direto
- Despedida curta

Responda APENAS com o corpo do email de follow-up, sem explicacoes.`,
  modelPreference: "gpt-4o-mini",
  metadata: {
    temperature: 0.7,
    maxTokens: 300,
  },
},
```

### UI Implementation Reference

**Mode Selector Position in EmailBlock:**
```tsx
// Inside EmailBlock header, after the title div

{/* Mode Selector - Only for non-first emails (AC #1, #5) */}
{stepNumber > 1 && (
  <div className="ml-auto">
    <EmailModeSelector
      mode={emailMode}
      onChange={handleModeChange}
      previousStepNumber={stepNumber - 1}
    />
  </div>
)}

{/* First email - disabled indicator */}
{stepNumber === 1 && (
  <Tooltip content="O primeiro email da sequencia e sempre inicial">
    <Badge variant="secondary" className="ml-auto text-xs">
      Email Inicial
    </Badge>
  </Tooltip>
)}
```

**EmailModeSelector Component:**
```tsx
interface EmailModeSelectorProps {
  mode: "initial" | "follow-up";
  onChange: (mode: "initial" | "follow-up") => void;
  previousStepNumber: number;
}

function EmailModeSelector({ mode, onChange, previousStepNumber }: EmailModeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Select value={mode} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="initial">Email Inicial</SelectItem>
          <SelectItem value="follow-up">
            Follow-up do Email {previousStepNumber}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

### Project Structure - Files to Modify

```
supabase/migrations/
  00030_add_email_mode_and_prompt.sql           # NEW: email_mode column + prompt seed

src/types/
  ai-prompt.ts                                   # Add follow_up_email_generation to PromptKey
  email-block.ts                                 # Add emailMode to EmailBlockData

src/stores/
  use-builder-store.ts                           # Add getPreviousEmailBlock selector

src/hooks/
  use-ai-generate.ts                             # Add follow_up_email_generation to AIPromptKey

src/lib/ai/prompts/
  defaults.ts                                    # Add follow_up_email_generation prompt

src/components/builder/
  EmailBlock.tsx                                 # Add mode selector UI, update handleGenerate
  EmailModeSelector.tsx                          # NEW: Mode selector component

__tests__/unit/stores/
  use-builder-store.test.ts                      # Add getPreviousEmailBlock tests

__tests__/unit/components/builder/
  EmailBlock.test.tsx                            # Add mode selector tests
  EmailModeSelector.test.tsx                     # NEW: Mode selector tests
```

### Migration Content

```sql
-- Migration: 00030_add_email_mode_and_prompt.sql
-- Story 6.11: Follow-Up Email Mode
--
-- Adds email_mode column for distinguishing initial vs follow-up emails
-- Seeds follow_up_email_generation prompt

-- 1. Add email_mode column to email_blocks
ALTER TABLE public.email_blocks
ADD COLUMN IF NOT EXISTS email_mode VARCHAR(20) DEFAULT 'initial';

ALTER TABLE public.email_blocks
ADD CONSTRAINT email_blocks_email_mode_check
CHECK (email_mode IN ('initial', 'follow-up'));

-- 2. Seed follow-up email generation prompt
INSERT INTO public.ai_prompts (
  tenant_id,
  prompt_key,
  prompt_template,
  model_preference,
  version,
  is_active,
  metadata,
  created_at,
  updated_at
) VALUES (
  NULL, -- Global prompt
  'follow_up_email_generation',
  E'Voce e um especialista em copywriting para emails de prospeccao B2B.\n\nGere o corpo de um EMAIL DE FOLLOW-UP que da continuidade a uma conversa iniciada.\n\nEMAIL ANTERIOR NA SEQUENCIA (VOCE JA ENVIOU ESTE):\nAssunto: {{previous_email_subject}}\nCorpo: {{previous_email_body}}\n\n... (full prompt template)',
  'gpt-4o-mini',
  1,
  true,
  '{"temperature": 0.7, "maxTokens": 300}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (tenant_id, prompt_key, version) DO NOTHING;
```

### handleGenerate Update Pattern

```typescript
// In EmailBlock.tsx - Update handleGenerate

const handleGenerate = useCallback(async () => {
  resetAI();

  try {
    // Get previous email context if in follow-up mode (AC #3)
    const isFollowUp = emailMode === "follow-up" && stepNumber > 1;
    let previousContext: { subject: string; body: string } | null = null;

    if (isFollowUp) {
      previousContext = getPreviousEmailBlock(blocks, block.position);
    }

    // Story 6.6: Generate icebreaker FIRST (only for initial emails)
    if (!isFollowUp) {
      setGeneratingField("icebreaker");
      const generatedIcebreaker = await generate({
        promptKey: "icebreaker_generation",
        variables: mergedVariables,
        stream: true,
        productId,
      });
      // ... rest of icebreaker flow
    }

    // Generate subject (same for both modes)
    setGeneratingField("subject");
    const subjectPromptKey = isFollowUp ? "follow_up_email_generation" : "email_subject_generation";
    // Note: For follow-up, we may want a simpler subject or skip generation
    const generatedSubject = await generate({
      promptKey: "email_subject_generation", // Keep same for subject
      variables: mergedVariables,
      stream: true,
      productId,
    });
    setSubject(generatedSubject);

    await new Promise((resolve) => setTimeout(resolve, 300));
    resetAI();

    // Generate body - use follow-up prompt if in follow-up mode (AC #3, #4)
    setGeneratingField("body");
    const bodyVariables = isFollowUp && previousContext
      ? {
          ...mergedVariables,
          previous_email_subject: previousContext.subject,
          previous_email_body: previousContext.body,
        }
      : { ...mergedVariables, icebreaker: generatedIcebreaker };

    const bodyPromptKey = isFollowUp
      ? "follow_up_email_generation"
      : "email_body_generation";

    const generatedBody = await generate({
      promptKey: bodyPromptKey,
      variables: bodyVariables,
      stream: true,
      productId,
    });

    // ... rest of generation flow
  } catch {
    setGeneratingField(null);
  }
}, [/* dependencies */]);
```

### Testing Strategy

**Unit Tests - getPreviousEmailBlock:**
1. Returns null for position 0 (first email)
2. Returns previous email for position 1
3. Skips delay blocks in calculation
4. Handles mixed block sequence (email, delay, email, delay, email)
5. Returns correct email in chain (Email 3 gets Email 2)

**Unit Tests - Mode Selector:**
1. Not visible for stepNumber === 1
2. Visible for stepNumber > 1
3. Default value is "initial"
4. onChange updates block data
5. Disabled state with tooltip for first email

**Integration Tests:**
1. Follow-up generation request includes previous email vars
2. Initial mode does NOT include previous email vars
3. Mode persists after page reload (database roundtrip)

### Edge Cases

1. **First email in sequence:** Mode selector disabled, always "initial"
2. **Sequence with only delays before:** Return null for previous, use initial mode
3. **Mode changed after content generated:** Content not auto-regenerated (AC #6)
4. **Previous email empty:** Still include empty strings in context (AI handles gracefully)
5. **Rapid mode switching:** Debounce updates to prevent race conditions

### Technical Constraints

1. **Prompt size:** Follow-up prompt includes previous email content - stay within token limits
2. **Subject generation:** May want to generate shorter/related subjects for follow-ups
3. **Backward compatibility:** Existing campaigns without email_mode default to "initial"
4. **Performance:** getPreviousEmailBlock is O(n) filter/sort - acceptable for typical campaign sizes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.11]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-03.md]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-001 - follow_up_email_generation prompt]
- [Source: src/stores/use-builder-store.ts - BuilderBlock, previewLead patterns]
- [Source: src/hooks/use-ai-generate.ts - AIPromptKey, GenerateParams]
- [Source: src/components/builder/EmailBlock.tsx - handleGenerate pattern]
- [Source: src/lib/ai/prompts/defaults.ts - Prompt template patterns]
- [Source: _bmad-output/implementation-artifacts/6-10-use-of-successful-examples.md - Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - All tests passed without issues.

### Completion Notes List

1. **Task 1: Database Migration** - Created `00030_add_email_mode_column.sql` with email_mode column (VARCHAR(20) DEFAULT 'initial') and CHECK constraint for 'initial' or 'follow-up' values. Includes seed for follow_up_email_generation prompt.

2. **Task 2: Prompt Types** - Extended `PromptKey`, `PROMPT_KEYS`, `promptKeySchema`, and `AIPromptKey` to include `follow_up_email_generation`. Created comprehensive prompt template in `defaults.ts` with previous email context variables.

3. **Task 3: Store Selector** - Added `getPreviousEmailBlock` function to `use-builder-store.ts`. Returns `{ subject, body }` of previous email or null. Correctly skips delay blocks.

4. **Task 4: Data Types** - Added `EmailMode` type (`"initial" | "follow-up"`) and `emailMode` field to `EmailBlockData`, `EmailBlock`, `EmailBlockRow`, and related schemas. All default to 'initial' for backward compatibility.

5. **Task 5-6: UI Components** - Integrated mode selector using shadcn Select component in EmailBlock header. Shows only for stepNumber > 1. Displays "Follow-up do Email X" when follow-up mode selected. First email shows disabled badge with tooltip.

6. **Task 7: handleGenerate** - Updated generation flow: follow-up emails skip icebreaker phase and use `follow_up_email_generation` prompt with `previous_email_subject` and `previous_email_body` variables.

7. **Task 8-10: Tests** - Added 8 tests to `use-builder-store.test.ts` (41 total), 9 tests to `EmailBlock.test.tsx` (89 total), 10 tests to `prompt-manager.test.ts` (45 total), and 7 tests to `email-block.test.ts` (28 total). All 2429 tests pass.

### File List

**New Files:**
- `supabase/migrations/00030_add_email_mode_column.sql` - Database migration for email_mode column and prompt seed

**Modified Files:**
- `src/types/ai-prompt.ts` - Added follow_up_email_generation to PromptKey
- `src/types/email-block.ts` - Added EmailMode type and emailMode field to interfaces/schemas
- `src/hooks/use-ai-generate.ts` - Added follow_up_email_generation to AIPromptKey
- `src/lib/ai/prompts/defaults.ts` - Added follow_up_email_generation prompt template
- `src/stores/use-builder-store.ts` - Added PreviousEmailContext interface and getPreviousEmailBlock selector
- `src/components/builder/EmailBlock.tsx` - Added mode selector UI, follow-up indicator, updated handleGenerate
- `__tests__/unit/stores/use-builder-store.test.ts` - Added 8 tests for getPreviousEmailBlock
- `__tests__/unit/components/builder/EmailBlock.test.tsx` - Added 9 tests for mode selector and follow-up flow
- `__tests__/unit/lib/ai/prompt-manager.test.ts` - Added 10 tests for follow_up_email_generation interpolation
- `__tests__/unit/types/email-block.test.ts` - Added 7 tests for emailMode schema and transform
- `_bmad-output/planning-artifacts/architecture.md` - Updated ADR-001 with follow_up_subject_generation prompt key (CR-H3)

### Senior Developer Review (AI)

**Review Date:** 2026-02-03
**Reviewer:** Claude Opus 4.5 (Code Review Agent)
**Outcome:** Approved with fixes applied

**Issues Found:** 4 High, 3 Medium, 3 Low
**Issues Fixed:** 4 High, 2 Medium (6 total)

**Fixes Applied:**

1. **CR-H1** - Added test for AC #6 (mode change back to initial uses email_body_generation, not follow-up)
2. **CR-H2** - Documented follow_up_subject_generation in Task 2.6
3. **CR-H3** - Updated architecture.md ADR-001 with follow_up_subject_generation prompt key
4. **CR-H4** - Added test verifying follow_up_subject_generation is called for follow-up email subjects
5. **CR-M1** - Changed migration ON CONFLICT from DO UPDATE to DO NOTHING to preserve customized prompts
6. **CR-M3** - Added console.warn for fallthrough behavior when follow-up mode set but no previous email found

**Deferred (Low severity):**
- L1: Task count in Dev Notes (cosmetic, actual code is correct)
- L2: Minor template differences (functionally equivalent)
- L3: epics.md in git but not file list (documentation artifact, not code)

### Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-03 | Dev Agent | Initial implementation |
| 2026-02-03 | Code Review Agent | Applied 6 fixes (H1-H4, M1, M3)

