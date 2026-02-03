# Story 6.7: Inline Text Editing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to edit AI-generated text inline,
So that I can make adjustments without leaving the builder.

## Acceptance Criteria

### AC #1: Inline Subject Editing
**Given** text has been generated for an email block
**When** I click on the subject field
**Then** I can edit the subject inline directly in the input field
**And** the input accepts focus immediately
**And** standard text editing (select, copy, paste) works correctly

### AC #2: Inline Body Editing
**Given** text has been generated for an email block
**When** I click on the body textarea
**Then** I can edit the body inline directly
**And** standard text editing (select, copy, paste) works correctly
**And** line breaks are preserved

### AC #3: Debounced Auto-Save
**Given** I am editing subject or body text
**When** I make changes
**Then** changes are saved automatically after a debounce delay (500ms)
**And** the store is NOT updated on every keystroke (performance optimization)
**And** if I navigate away before debounce completes, changes are still saved (flush on blur)

### AC #4: Auto-Expanding Textarea
**Given** I am editing the email body
**When** I type more content than fits in the visible area
**Then** the textarea automatically expands to fit the content
**And** minimum height is maintained (100px)
**And** maximum height is reasonable to prevent page overflow (400px)
**And** scrollbar appears only when content exceeds max height

### AC #5: Subject Character Count
**Given** I am viewing or editing the subject field
**When** the field has content
**Then** I see a character count indicator below the input
**And** format shows "X/60 caracteres"
**And** count updates in real-time as I type
**And** visual warning when exceeding 60 characters (text turns amber/warning color)
**And** hard limit at 200 characters (already enforced via maxLength)

## Tasks / Subtasks

- [x] Task 1: Create useDebounce Hook (AC: #3)
  - [x] 1.1 Create `src/hooks/use-debounce.ts` if not exists
  - [x] 1.2 Implement debounce logic with configurable delay
  - [x] 1.3 Support flush on unmount/cleanup
  - [x] 1.4 Return both debounced value and flush function

- [x] Task 2: Implement Debounced Save in EmailBlock (AC: #3)
  - [x] 2.1 Add local state for editing (already exists)
  - [x] 2.2 Debounce store updates with 500ms delay
  - [x] 2.3 Implement flush on blur for both subject and body
  - [x] 2.4 Keep hasChanges flag working correctly

- [x] Task 3: Implement Auto-Expanding Textarea (AC: #4)
  - [x] 3.1 Create `src/components/ui/auto-resize-textarea.tsx` component
  - [x] 3.2 Use textarea scrollHeight to calculate appropriate height
  - [x] 3.3 Set minHeight: 100px, maxHeight: 400px
  - [x] 3.4 Handle resize on content change (controlled input)
  - [x] 3.5 Replace Textarea in EmailBlock with AutoResizeTextarea

- [x] Task 4: Implement Subject Character Count (AC: #5)
  - [x] 4.1 Add character count display below subject input
  - [x] 4.2 Show format "X/60 caracteres"
  - [x] 4.3 Add warning styling when > 60 characters (text-amber-500)
  - [x] 4.4 Use existing maxLength={200} as hard limit
  - [x] 4.5 Add aria-describedby for accessibility

- [x] Task 5: Unit Tests (AC: #1-#5)
  - [x] 5.1 Test debounced save doesn't update store immediately
  - [x] 5.2 Test debounced save updates store after delay
  - [x] 5.3 Test flush on blur saves immediately
  - [x] 5.4 Test AutoResizeTextarea expands with content
  - [x] 5.5 Test AutoResizeTextarea respects min/max height
  - [x] 5.6 Test character count displays correctly
  - [x] 5.7 Test character count warning at > 60 chars
  - [x] 5.8 Test inline editing preserves line breaks

## Dev Notes

### Story Dependencies - ALREADY IMPLEMENTED

**CRITICAL:** These stories are DONE and provide the foundation:

- **Story 5.3** (done): Email Block Component - EmailBlock base implementation
- **Story 6.2** (done): AI Text Generation in Builder - generate button and streaming
- **Story 6.6** (done): Personalized Icebreakers - 3-phase generation with real lead data

### Current EmailBlock Implementation Analysis

**File:** `src/components/builder/EmailBlock.tsx`

**Current State (Lines 59-126):**
```typescript
// Local state for editing
const [subject, setSubject] = useState(blockData.subject);
const [body, setBody] = useState(blockData.body);

// Currently saves IMMEDIATELY on every keystroke (Lines 113-126)
const handleSubjectChange = (value: string) => {
  setSubject(value);
  updateBlock(block.id, {  // <- This fires on EVERY keystroke
    data: { ...blockData, subject: value },
  });
};

const handleBodyChange = (value: string) => {
  setBody(value);
  updateBlock(block.id, {  // <- This fires on EVERY keystroke
    data: { ...blockData, body: value },
  });
};
```

**Current Textarea (Lines 276-288):**
```typescript
<Textarea
  id={`body-${block.id}`}
  data-testid="email-body-input"
  value={body}
  onChange={(e) => handleBodyChange(e.target.value)}
  placeholder="Conteudo do email..."
  className={cn(
    "bg-background/50 min-h-[100px] resize-none",  // <- Fixed height, no auto-expand
    generatingField === "body" && aiPhase === "streaming" && "caret-primary"
  )}
  onClick={(e) => e.stopPropagation()}
/>
```

**Current Subject Input (Lines 256-265):**
```typescript
<Input
  id={`subject-${block.id}`}
  data-testid="email-subject-input"
  value={subject}
  onChange={(e) => handleSubjectChange(e.target.value)}
  placeholder="Assunto do email"
  className="bg-background/50"
  maxLength={200}  // <- Hard limit exists, but no character count UI
  onClick={(e) => e.stopPropagation()}
/>
```

### useDebounce Hook Pattern

**File:** `src/hooks/use-debounce.ts`

```typescript
import { useState, useEffect, useRef, useCallback } from "react";

interface UseDebouncedCallbackOptions {
  delay?: number;
}

/**
 * Returns a debounced version of the callback that delays execution
 * and a flush function to immediately execute pending callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  options: UseDebouncedCallbackOptions = {}
): [T, () => void] {
  const { delay = 500 } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Flush pending callback on unmount
        if (pendingArgsRef.current) {
          callbackRef.current(...pendingArgsRef.current);
        }
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      pendingArgsRef.current = args;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        pendingArgsRef.current = null;
      }, delay);
    },
    [delay]
  ) as T;

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pendingArgsRef.current) {
      callbackRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
    }
  }, []);

  return [debouncedCallback, flush];
}
```

### AutoResizeTextarea Component

**File:** `src/components/ui/auto-resize-textarea.tsx`

```typescript
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AutoResizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeight?: number;
  maxHeight?: number;
}

const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ className, minHeight = 100, maxHeight = 400, onChange, value, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const combinedRef = useCombinedRef(ref, textareaRef);

  const adjustHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = "auto";

    // Calculate new height within bounds
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight
    );

    textarea.style.height = `${newHeight}px`;

    // Show scrollbar only when content exceeds max height
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minHeight, maxHeight]);

  // Adjust on value change
  React.useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Adjust on mount
  React.useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight();
    onChange?.(e);
  };

  return (
    <textarea
      className={cn(
        "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={combinedRef}
      value={value}
      onChange={handleChange}
      style={{
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
        resize: "none",
      }}
      {...props}
    />
  );
});
AutoResizeTextarea.displayName = "AutoResizeTextarea";

// Helper to combine refs
function useCombinedRef<T>(
  ...refs: (React.Ref<T> | null | undefined)[]
): React.RefCallback<T> {
  return React.useCallback(
    (element: T) => {
      refs.forEach((ref) => {
        if (!ref) return;
        if (typeof ref === "function") {
          ref(element);
        } else {
          (ref as React.MutableRefObject<T>).current = element;
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs
  );
}

export { AutoResizeTextarea };
```

### Updated EmailBlock with Debounce and Character Count

**Key Changes to `src/components/builder/EmailBlock.tsx`:**

```typescript
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";

// Inside component:

// Debounced store update (AC #3)
const [debouncedUpdateSubject, flushSubject] = useDebouncedCallback(
  (value: string) => {
    updateBlock(block.id, {
      data: { ...blockData, subject: value },
    });
  },
  { delay: 500 }
);

const [debouncedUpdateBody, flushBody] = useDebouncedCallback(
  (value: string) => {
    updateBlock(block.id, {
      data: { ...blockData, body: value },
    });
  },
  { delay: 500 }
);

// Update local state immediately, debounce store update
const handleSubjectChange = (value: string) => {
  setSubject(value);
  debouncedUpdateSubject(value);
};

const handleBodyChange = (value: string) => {
  setBody(value);
  debouncedUpdateBody(value);
};

// Flush on blur (AC #3)
const handleSubjectBlur = () => {
  flushSubject();
};

const handleBodyBlur = () => {
  flushBody();
};

// Character count logic (AC #5)
const subjectLength = subject.length;
const isSubjectOverRecommended = subjectLength > 60;

// In JSX:

{/* Subject Field with Character Count (AC #5) */}
<div className="space-y-1">
  <Label
    htmlFor={`subject-${block.id}`}
    className="mb-2 block text-muted-foreground"
  >
    Assunto
  </Label>
  <Input
    id={`subject-${block.id}`}
    data-testid="email-subject-input"
    value={subject}
    onChange={(e) => handleSubjectChange(e.target.value)}
    onBlur={handleSubjectBlur}
    placeholder="Assunto do email"
    className="bg-background/50"
    maxLength={200}
    aria-describedby={`subject-count-${block.id}`}
    onClick={(e) => e.stopPropagation()}
  />
  {/* Character count (AC #5) */}
  <p
    id={`subject-count-${block.id}`}
    data-testid="subject-char-count"
    className={cn(
      "text-xs text-right",
      isSubjectOverRecommended
        ? "text-amber-500"
        : "text-muted-foreground"
    )}
  >
    {subjectLength}/60 caracteres
  </p>
</div>

{/* Body Field with AutoResize (AC #4) */}
<div className="space-y-1">
  <Label
    htmlFor={`body-${block.id}`}
    className="mb-2 block text-muted-foreground"
  >
    Conteudo
  </Label>
  <AutoResizeTextarea
    id={`body-${block.id}`}
    data-testid="email-body-input"
    value={body}
    onChange={(e) => handleBodyChange(e.target.value)}
    onBlur={handleBodyBlur}
    placeholder="Conteudo do email..."
    className={cn(
      "bg-background/50",
      generatingField === "body" && aiPhase === "streaming" && "caret-primary"
    )}
    minHeight={100}
    maxHeight={400}
    onClick={(e) => e.stopPropagation()}
  />
</div>
```

### Project Structure Notes

**New Files:**
```
src/hooks/use-debounce.ts                         - Debounce hook with flush support
src/components/ui/auto-resize-textarea.tsx        - Auto-expanding textarea component
__tests__/unit/hooks/use-debounce.test.tsx        - Debounce hook tests
__tests__/unit/components/ui/auto-resize-textarea.test.tsx - AutoResizeTextarea tests
```

**Modified Files:**
```
src/components/builder/EmailBlock.tsx             - Add debounce, char count, auto-resize
__tests__/unit/components/builder/EmailBlock.test.tsx - Add Story 6.7 tests
```

### Testing Strategy

**Unit Tests - use-debounce.ts:**
1. Debounced callback delays execution by specified time
2. Multiple calls within delay only execute once (last value)
3. Flush immediately executes pending callback
4. Cleanup on unmount flushes pending callback
5. Callback ref stays updated

**Unit Tests - AutoResizeTextarea:**
1. Renders with minHeight applied
2. Expands when content grows
3. Respects maxHeight limit
4. Shows scrollbar when exceeding maxHeight
5. Shrinks when content is removed
6. Handles controlled value changes

**Unit Tests - EmailBlock (Story 6.7):**
1. Subject edit doesn't update store immediately (debounce)
2. Subject edit updates store after 500ms delay
3. Subject blur flushes pending update
4. Body edit doesn't update store immediately (debounce)
5. Body blur flushes pending update
6. Character count displays correctly
7. Character count shows warning at > 60 chars
8. AutoResizeTextarea used for body field

**Test Mocking:**
```typescript
// Mock timers for debounce testing
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("debounces store updates", async () => {
  const { getByTestId } = render(<EmailBlock block={mockBlock} stepNumber={1} />);

  const subjectInput = getByTestId("email-subject-input");
  await userEvent.type(subjectInput, "New subject");

  // Store should NOT be updated yet
  expect(mockUpdateBlock).not.toHaveBeenCalled();

  // Fast-forward debounce delay
  vi.advanceTimersByTime(500);

  // Now store should be updated
  expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
    data: expect.objectContaining({ subject: "New subject" }),
  });
});

it("flushes on blur", async () => {
  const { getByTestId } = render(<EmailBlock block={mockBlock} stepNumber={1} />);

  const subjectInput = getByTestId("email-subject-input");
  await userEvent.type(subjectInput, "New subject");
  fireEvent.blur(subjectInput);

  // Store should be updated immediately on blur
  expect(mockUpdateBlock).toHaveBeenCalled();
});
```

### Technical Constraints

1. **Performance:** Debounce MUST prevent store updates on every keystroke
2. **Data Integrity:** Blur MUST flush pending changes to prevent data loss
3. **UX Continuity:** Local state updates immediately for responsive feel
4. **Auto-Resize Bounds:** 100px min, 400px max to prevent layout issues
5. **Character Count:** Warning at 60 chars (email best practice), hard limit 200
6. **Accessibility:** aria-describedby links count to input for screen readers
7. **Streaming Compatibility:** Auto-resize must work during AI streaming

### Edge Cases to Handle

1. **Rapid Typing:** Only last value saved after debounce
2. **Navigation During Edit:** Flush on blur + cleanup on unmount
3. **Paste Large Text:** Auto-resize handles large content gracefully
4. **Empty Content:** Auto-resize returns to minHeight
5. **AI Generation:** Streaming updates should trigger auto-resize
6. **Concurrent Edits:** Subject and body have separate debounce timers

### Future Stories Impact

- **Story 6.8** (Text Regeneration): Can regenerate after manual edits
- **Story 6.9** (Tone of Voice): Editing preserves tone adjustments
- **Epic 7** (Export): Final content exported includes all manual edits

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.7]
- [Source: src/components/builder/EmailBlock.tsx:59-126 - Current editing implementation]
- [Source: src/components/builder/EmailBlock.tsx:256-288 - Current input/textarea]
- [Source: src/stores/use-builder-store.ts:151-155 - updateBlock action]
- [Source: _bmad-output/planning-artifacts/architecture.md - Zustand patterns]
- [Source: _bmad-output/implementation-artifacts/6-6-personalized-icebreakers.md - Previous story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation smooth without blockers

### Completion Notes List

- **Task 1**: Added `useDebouncedCallback` hook to existing `use-debounce.ts`. Hook returns tuple `[debouncedFn, flushFn]` with configurable delay (default 500ms), cleanup on unmount flushes pending calls. 12 tests written and passing.

- **Task 2**: Integrated debounced save in EmailBlock. Local state updates immediately for responsive UX, store updates debounced to prevent performance issues. Added `onBlur` handlers for both subject and body that flush pending changes. Updated 3 existing tests to use blur for assertions.

- **Task 3**: Created `AutoResizeTextarea` component with auto-height adjustment based on scrollHeight. Bounds: minHeight=100px, maxHeight=400px. Scrollbar only appears when exceeding maxHeight. 16 tests written and passing.

- **Task 4**: Added character count below subject input with format "X/60 caracteres". Warning color (text-amber-500) when exceeding 60 characters. Hard limit remains 200 via maxLength. Added aria-describedby for accessibility.

- **Task 5**: Added 19 Story 6.7 specific tests to EmailBlock.test.tsx covering debounce behavior, character count, auto-resize textarea, and inline editing. Story 6.7 tests: 12 (use-debounce) + 16 (auto-resize-textarea) + 19 (EmailBlock) = 47 tests. Full test suite: 94 tests passing.

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) | **Date:** 2026-02-03 | **Result:** ✅ APPROVED

**Review Summary:**
- All 5 ACs verified implemented and tested
- All tasks marked [x] confirmed complete
- Git File List matches story documentation
- 94 tests passing

**Issues Found & Fixed (Code Review):**
1. **M1 (Performance):** useCombinedRef recreating callback every render → Fixed: explicit ref1, ref2 params
2. **M2 (Performance):** adjustHeight called twice on mount → Fixed: single useEffect
3. **M3 (Accessibility):** Body textarea missing aria description → Fixed: added aria-label
4. **L1 (Docs):** Incorrect test count in story → Fixed: accurate breakdown
5. **L2 (Tests):** Added comment explaining fireEvent usage for debounce test

**Files Modified in Review:**
- `src/components/ui/auto-resize-textarea.tsx` - M1, M2 fixes
- `src/components/builder/EmailBlock.tsx` - M3 fix
- `__tests__/unit/components/builder/EmailBlock.test.tsx` - L2 comment
- `_bmad-output/implementation-artifacts/6-7-inline-text-editing.md` - L1 fix

### Change Log

- 2026-02-03: Code Review complete - 5 issues fixed (3 MEDIUM, 2 LOW)
- 2026-02-03: Story 6.7 implemented - Inline Text Editing with debounced auto-save, auto-expanding textarea, and character count

### File List

**New Files:**
- `src/components/ui/auto-resize-textarea.tsx` - Auto-expanding textarea component
- `__tests__/unit/hooks/use-debounce.test.tsx` - useDebouncedCallback tests
- `__tests__/unit/components/ui/auto-resize-textarea.test.tsx` - AutoResizeTextarea tests

**Modified Files:**
- `src/hooks/use-debounce.ts` - Added useDebouncedCallback with flush support
- `src/components/builder/EmailBlock.tsx` - Debounced save, auto-resize body, character count
- `__tests__/unit/components/builder/EmailBlock.test.tsx` - Story 6.7 tests + updated existing tests for debounce
