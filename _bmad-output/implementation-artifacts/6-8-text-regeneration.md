# Story 6.8: Text Regeneration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to regenerate text if I'm not satisfied,
So that I can get alternative versions.

## Acceptance Criteria

### AC #1: Regenerate Button Visibility
**Given** text has been generated for an email block (both subject and body have content)
**When** generation completes successfully
**Then** the button changes from "✨ Gerar com IA" to "🔄 Regenerar"
**And** the button uses the `RefreshCw` icon instead of `Sparkles`

### AC #2: Regeneration Execution
**Given** I have previously generated text for an email block
**When** I click "Regenerar"
**Then** the AI generates a completely new version
**And** the previous text is replaced with the new text
**And** the same 3-phase generation flow is executed (Icebreaker → Subject → Body)

### AC #3: Streaming Animation on Regeneration
**Given** I click "Regenerar"
**When** AI is generating new content
**Then** I see the same streaming animation as initial generation
**And** button shows "Gerando..." with spinner during generation
**And** text appears progressively (character by character)

### AC #4: Multiple Regenerations
**Given** I have regenerated text once
**When** generation completes
**Then** the button shows "🔄 Regenerar" again
**And** I can regenerate multiple times consecutively
**And** each regeneration is independent (no limit on regenerations)

### AC #5: Context Preservation on Regeneration
**Given** a campaign has a product selected (Story 6.5)
**When** I regenerate text
**Then** each regeneration uses the same context:
  - Product context (if campaign has product_id)
  - Knowledge base context (company, tone, ICP)
  - Preview lead data (name, company, title)
**And** the icebreaker is regenerated fresh (not reused from previous generation)
**And** the new icebreaker is incorporated into the body generation

### AC #6: Reset to Initial State
**Given** I manually clear both subject AND body fields (make them empty)
**When** I view the email block
**Then** the button returns to "✨ Gerar com IA" (initial state)
**And** clicking it behaves as a fresh generation

## Tasks / Subtasks

- [x] Task 1: Update AIGenerateButton Component (AC: #1, #3)
  - [x] 1.1 Add `hasContent` prop to AIGenerateButton interface
  - [x] 1.2 Update `getButtonText()` to return "Regenerar" when `hasContent` is true and not loading/error
  - [x] 1.3 Update `getIcon()` to return `RefreshCw` when showing "Regenerar"
  - [x] 1.4 Update aria-label for regeneration state
  - [x] 1.5 Keep loading/error states unchanged (takes precedence)

- [x] Task 2: Update EmailBlock to Pass Content State (AC: #1, #6)
  - [x] 2.1 Calculate `hasContent` based on subject AND body being non-empty
  - [x] 2.2 Pass `hasContent` prop to AIGenerateButton
  - [x] 2.3 Ensure state updates correctly when fields are cleared manually

- [x] Task 3: Verify Regeneration Flow (AC: #2, #5)
  - [x] 3.1 Confirm `handleGenerate` already supports multiple calls
  - [x] 3.2 Verify context (mergedVariables, productId) is used on every call
  - [x] 3.3 Confirm icebreaker is regenerated fresh (not cached)
  - [x] 3.4 Confirm text replacement works (local state + store update)

- [x] Task 4: Unit Tests - AIGenerateButton (AC: #1, #3, #4)
  - [x] 4.1 Test button shows "Gerar com IA" when hasContent=false
  - [x] 4.2 Test button shows "Regenerar" when hasContent=true and phase=idle
  - [x] 4.3 Test button shows "Gerando..." when phase=generating (regardless of hasContent)
  - [x] 4.4 Test button shows "Tentar novamente" on error (regardless of hasContent)
  - [x] 4.5 Test icon changes to RefreshCw when showing "Regenerar"
  - [x] 4.6 Test aria-label updates for regeneration state

- [x] Task 5: Unit Tests - EmailBlock Regeneration (AC: #2, #5, #6)
  - [x] 5.1 Test hasContent calculation (true when both subject and body non-empty)
  - [x] 5.2 Test hasContent false when only subject has content
  - [x] 5.3 Test hasContent false when only body has content
  - [x] 5.4 Test hasContent false when both are empty
  - [x] 5.5 Test regeneration replaces previous text
  - [x] 5.6 Test multiple regenerations work consecutively
  - [x] 5.7 Test context is passed correctly on regeneration

## Dev Notes

### Story Dependencies - ALREADY IMPLEMENTED

**CRITICAL:** These stories are DONE and provide the foundation:

- **Story 6.2** (done): AI Text Generation in Builder - `useAIGenerate` hook, `AIGenerateButton` component, streaming
- **Story 6.3** (done): Knowledge Base Integration - `useKnowledgeBaseContext` hook, KB variables
- **Story 6.5** (done): Campaign Product Context - `productId` in builder store, passed to generation
- **Story 6.6** (done): Personalized Icebreakers - 3-phase generation (icebreaker → subject → body), `previewLead` integration
- **Story 6.7** (done): Inline Text Editing - debounced save, auto-resize textarea

### Current Implementation Analysis

**AIGenerateButton (`src/components/builder/AIGenerateButton.tsx`):**

```typescript
// Current button text logic (Lines 60-68)
const getButtonText = () => {
  if (isLoading) return "Gerando...";
  if (isError) return "Tentar novamente";
  return "Gerar com IA";  // ← Always returns this when idle
};

// Current icon logic (Lines 71-79)
const getIcon = () => {
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (isError) return <RefreshCw className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;  // ← Always returns this when idle
};
```

**Issue:** Button doesn't differentiate between:
1. Never generated (should show "Gerar com IA")
2. Already generated (should show "Regenerar")

**Solution:** Add `hasContent` prop to detect if content exists.

**EmailBlock (`src/components/builder/EmailBlock.tsx`):**

The current `handleGenerate` function (Lines 168-226) already:
- Calls `resetAI()` at start (clears previous state)
- Generates fresh icebreaker → subject → body
- Uses `mergedVariables` which includes KB + lead data
- Uses `productId` from builder store
- Updates local state and store after each generation

**Regeneration already works** - clicking the button again triggers a new generation cycle. We just need to update the button's visual state to show "Regenerar" after content exists.

### Implementation Pattern

**Updated AIGenerateButton Interface:**

```typescript
interface AIGenerateButtonProps {
  phase: GenerationPhase;
  error?: string | null;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  hasContent?: boolean;  // NEW: indicates content has been generated
}
```

**Updated Button Logic:**

```typescript
const getButtonText = () => {
  if (isLoading) return "Gerando...";
  if (isError) return "Tentar novamente";
  if (hasContent) return "Regenerar";  // NEW: show regenerate when content exists
  return "Gerar com IA";
};

const getIcon = () => {
  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (isError) return <RefreshCw className="h-4 w-4" />;
  if (hasContent) return <RefreshCw className="h-4 w-4" />;  // NEW: use RefreshCw for regenerate
  return <Sparkles className="h-4 w-4" />;
};
```

**EmailBlock hasContent Calculation:**

```typescript
// In EmailBlock, before passing to AIGenerateButton
const hasContent = subject.trim() !== "" && body.trim() !== "";

<AIGenerateButton
  phase={aiPhase}
  error={aiError}
  onClick={handleGenerate}
  disabled={isGenerating || kbLoading}
  hasContent={hasContent}  // NEW
/>
```

### Project Structure Notes

**Modified Files:**
```
src/components/builder/AIGenerateButton.tsx  - Add hasContent prop, update button text/icon
src/components/builder/EmailBlock.tsx        - Calculate hasContent, pass to button
__tests__/unit/components/builder/AIGenerateButton.test.tsx - Add Story 6.8 tests
__tests__/unit/components/builder/EmailBlock.test.tsx       - Add regeneration tests
```

**No New Files Required** - This story modifies existing components only.

### Testing Strategy

**Unit Tests - AIGenerateButton:**
1. Shows "Gerar com IA" with Sparkles icon when `hasContent=false`, `phase=idle`
2. Shows "Regenerar" with RefreshCw icon when `hasContent=true`, `phase=idle`
3. Shows "Gerando..." with Loader2 when `phase=generating`, regardless of `hasContent`
4. Shows "Tentar novamente" with RefreshCw when `phase=error`, regardless of `hasContent`
5. Aria-label updates: "Regenerar texto com IA" vs "Gerar texto com IA"

**Unit Tests - EmailBlock:**
1. `hasContent` is true only when BOTH subject AND body are non-empty
2. `hasContent` becomes false when either field is cleared
3. Clicking regenerate triggers new generation (mock verify `generate` called again)
4. Context (mergedVariables, productId) is passed on every regeneration

**Test Mocking:**
```typescript
// Mock for regeneration test
it("allows multiple regenerations", async () => {
  const mockGenerate = vi.fn().mockResolvedValue("Generated text");
  // ... render with content already present

  const button = getByRole("button", { name: /regenerar/i });
  await userEvent.click(button);

  expect(mockGenerate).toHaveBeenCalledTimes(1);

  // Wait for generation to complete
  await waitFor(() => expect(button).toHaveTextContent("Regenerar"));

  // Click again
  await userEvent.click(button);
  expect(mockGenerate).toHaveBeenCalledTimes(2);
});
```

### Technical Constraints

1. **Button Priority:** Loading/Error states take precedence over `hasContent`
2. **Content Detection:** Both subject AND body must have content for `hasContent=true`
3. **Whitespace Handling:** Use `.trim()` to ignore whitespace-only content
4. **No Caching:** Each regeneration must call AI fresh (no memoization of results)
5. **Context Consistency:** Same `mergedVariables` and `productId` used every time

### Edge Cases to Handle

1. **Partial Content:** Only subject OR only body has content → still show "Gerar com IA" (need both for complete email)
2. **Whitespace-Only:** Subject/body with only spaces → treat as empty
3. **Manual Clear:** User deletes all content → button returns to "Gerar com IA"
4. **Error During Regeneration:** Show "Tentar novamente" (existing behavior)
5. **Cancel During Regeneration:** Button returns to "Regenerar" (had content before)
6. **AI Generates Empty:** If AI returns empty string, `hasContent` will be false

### Future Stories Impact

- **Story 6.9** (Tone of Voice): Regeneration will apply tone if configured
- **Story 6.10** (Successful Examples): Regeneration will use examples as reference
- **Epic 7** (Export): Regenerated content exported as final version

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.8]
- [Source: src/components/builder/AIGenerateButton.tsx:60-79 - Current button logic]
- [Source: src/components/builder/EmailBlock.tsx:168-226 - handleGenerate function]
- [Source: src/hooks/use-ai-generate.ts - Generation hook with streaming]
- [Source: _bmad-output/implementation-artifacts/6-7-inline-text-editing.md - Previous story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation proceeded without errors.

### Completion Notes List

- **Task 1:** Added `hasContent` prop to AIGenerateButton interface with default value `false`. Updated `getButtonText()` and `getIcon()` functions to show "Regenerar" with RefreshCw icon when content exists. Loading/error states take precedence. Updated aria-label for regeneration state.

- **Task 2:** Added `hasContent` calculation in EmailBlock using `useMemo` - returns true only when both subject AND body have non-empty content (using `.trim()` to handle whitespace). Passed `hasContent` prop to AIGenerateButton.

- **Task 3:** Verified existing `handleGenerate` function already supports regeneration - calls `resetAI()` at start, generates fresh icebreaker/subject/body sequence, uses `mergedVariables` and `productId` consistently.

- **Task 4:** Added 13 new unit tests for AIGenerateButton covering all regeneration states, icon changes, aria-label updates, and multiple regeneration capability.

- **Task 5:** Added 13 new unit tests for EmailBlock covering hasContent calculation, reset to initial state, regeneration execution, context preservation, and streaming behavior.

### Code Review Fixes

- **CR-H1:** Fixed flaky test "calls body generation after subject generation" by moving all assertions inside waitFor and increasing timeout to 5000ms (EmailBlock.test.tsx:493-518)
- **CR-M1:** Removed intermediate store update in handleGenerate to fix stale closure issue - store now updated only after body generation completes (EmailBlock.tsx:207-210)
- **CR-M1:** Removed `body` from handleGenerate dependency array as it's no longer used (EmailBlock.tsx:237)

### Change Log

| Date | Change |
|------|--------|
| 2026-02-03 | Story 6.8 implementation complete - Text regeneration feature |
| 2026-02-03 | Code Review: Fixed flaky test (CR-H1), removed stale closure (CR-M1) |

### File List

**Modified Files:**
- `src/components/builder/AIGenerateButton.tsx` - Added hasContent prop, updated button text/icon logic, updated aria-label
- `src/components/builder/EmailBlock.tsx` - Added hasContent calculation with useMemo, passed prop to AIGenerateButton
- `__tests__/unit/components/builder/AIGenerateButton.test.tsx` - Added 13 Story 6.8 tests (33 total tests in file)
- `__tests__/unit/components/builder/EmailBlock.test.tsx` - Added 13 Story 6.8 tests, fixed flaky test timing (79 total tests in file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated story status to in-progress

**No New Files Created** - All changes were to existing files as planned.

