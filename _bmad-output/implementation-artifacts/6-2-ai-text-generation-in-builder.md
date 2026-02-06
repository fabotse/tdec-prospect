# Story 6.2: AI Text Generation in Builder

Status: done

## Story

As a user,
I want to generate email text using AI,
So that I get personalized content quickly.

## Acceptance Criteria

### AC #1: Generate Button in Email Block
**Given** I have selected an email block in the builder
**When** I click "✨ Gerar com IA"
**Then** the system starts generating text
**And** I see "Gerando texto personalizado..." with animation
**And** text appears progressively (streaming)
**And** generation completes in <5 seconds
**And** the generated text includes subject and body
**And** the text is saved to the email block

### AC #2: Error Handling
**Given** the AI generation fails
**When** an error occurs
**Then** I see "Não foi possível gerar. Tente novamente."
**And** I can retry with one click
**And** the error state is cleared when I retry

### AC #3: Streaming UI Experience
**Given** generation is in progress
**When** streaming text arrives
**Then** text appears character by character with typing effect
**And** a pulsing animation indicates active generation
**And** generation can be cancelled if taking too long

## Tasks / Subtasks

- [x] Task 1: Create useAIGenerate hook (AC: #1, #2, #3)
  - [x] 1.1 Create `src/hooks/use-ai-generate.ts` with TanStack Query mutation
  - [x] 1.2 Implement streaming text handling with EventSource/fetch API
  - [x] 1.3 Add generation phases: 'idle' | 'generating' | 'streaming' | 'done' | 'error'
  - [x] 1.4 Handle SSE parsing for progressive text updates
  - [x] 1.5 Implement abort/cancel functionality

- [x] Task 2: Create AIGenerateButton component (AC: #1)
  - [x] 2.1 Create `src/components/builder/AIGenerateButton.tsx`
  - [x] 2.2 Add sparkle icon (Sparkles from lucide-react)
  - [x] 2.3 Implement loading state with animation
  - [x] 2.4 Add disabled state during generation

- [x] Task 3: Update EmailBlock component (AC: #1, #3)
  - [x] 3.1 Add AIGenerateButton below email fields
  - [x] 3.2 Integrate useAIGenerate hook
  - [x] 3.3 Update subject/body fields progressively during streaming
  - [x] 3.4 Add pulse animation to block during generation
  - [x] 3.5 Ensure text updates sync to builder store

- [x] Task 4: Create generation loading/streaming UI (AC: #3)
  - [x] 4.1 Streaming status indicator with "Gerando texto personalizado..."
  - [x] 4.2 Pulse animation on EmailBlock during generation
  - [x] 4.3 Progressive text update during streaming (typing effect via SSE chunks)

- [x] Task 5: Error handling and retry (AC: #2)
  - [x] 5.1 Display error message inline in EmailBlock
  - [x] 5.2 Add "Tentar novamente" button on error (destructive variant)
  - [x] 5.3 Clear error state on retry or new generation
  - [x] 5.4 Error handling in hook with phase transition to 'error'

- [x] Task 6: Unit tests
  - [x] 6.1 Test useAIGenerate hook streaming logic (13 tests - includes timeout)
  - [x] 6.2 Test AIGenerateButton states (idle, loading, error) (20 tests)
  - [x] 6.3 Test EmailBlock integration with AI generation (9 tests)
  - [x] 6.4 Test error handling and retry functionality

## Dev Notes

### Story 6.1 Foundation - ALREADY IMPLEMENTED

**CRITICAL:** Story 6.1 created the complete AI infrastructure. DO NOT recreate:
- `src/lib/ai/providers/openai.ts` - OpenAI provider with streaming ✅
- `src/lib/ai/prompt-manager.ts` - PromptManager with 3-level fallback ✅
- `src/app/api/ai/generate/route.ts` - API endpoint with SSE streaming ✅
- `src/types/ai-provider.ts` - Types and Zod schemas ✅
- `supabase/migrations/00020_create_ai_prompts.sql` - Prompt table ✅
- `supabase/migrations/00021_seed_ai_prompts.sql` - Seeded prompts ✅

**Available Prompt Keys (seeded in DB):**
- `email_subject_generation` - Gera assunto do email
- `email_body_generation` - Gera corpo do email
- `icebreaker_generation` - Gera quebra-gelo (Story 6.4)
- `tone_application` - Aplica tom de voz (Story 6.7)

### API Contract - POST /api/ai/generate

```typescript
// Request
interface AIGenerateRequest {
  promptKey: "email_subject_generation" | "email_body_generation" | ...;
  variables: Record<string, string>;
  options?: {
    stream?: boolean;  // Enable SSE streaming
    temperature?: number;
    maxTokens?: number;
    model?: string;
  };
}

// Streaming Response (when options.stream = true)
// Content-Type: text/event-stream
// Format: data: {"text": "chunk..."}\n\n
// Final: data: [DONE]\n\n
// Error: data: {"error": "message"}\n\n

// Non-streaming Response
interface AIGenerateResponse {
  success: boolean;
  data?: {
    text: string;
    model: string;
    usage?: { promptTokens, completionTokens, totalTokens };
  };
}
```

### Prompt Variables Required

**email_subject_generation:**
```typescript
{
  company_context: string;    // From knowledge_base
  lead_name: string;          // From selected lead or placeholder
  lead_title: string;
  lead_company: string;
  lead_industry: string;
  email_objective: string;    // User-provided or default "prospecção inicial"
}
```

**email_body_generation:**
```typescript
{
  company_context: string;
  lead_name: string;
  lead_title: string;
  lead_company: string;
  lead_industry: string;
  lead_location: string;
  tone_description: string;   // From knowledge_base
  email_objective: string;
  icebreaker: string;         // Optional, can be empty
}
```

### Existing Patterns to Follow

**Hook Pattern (from use-ai-search.ts):**
```typescript
export function useAIGenerate() {
  const [phase, setPhase] = useState<GenerationPhase>("idle");

  const mutation = useMutation({
    mutationFn: async (params: GenerateParams) => {
      setPhase("generating");
      // ... streaming logic
      setPhase("streaming");
      // ... receive chunks
      setPhase("done");
    },
    onError: () => setPhase("error"),
  });

  return { generate, phase, text, error, reset };
}
```

**EmailBlock Update Pattern (from EmailBlock.tsx:53-66):**
```typescript
const handleSubjectChange = (value: string) => {
  setSubject(value);
  updateBlock(block.id, {
    data: { ...blockData, subject: value },
  });
};
```

**Builder Store (from use-builder-store.ts):**
```typescript
const updateBlock = useBuilderStore((state) => state.updateBlock);
// updateBlock(blockId, { data: { subject, body } }) marks hasChanges = true
```

### Streaming Implementation

**CRITICAL:** Use fetch with ReadableStream, NOT EventSource (EventSource doesn't support POST).

```typescript
async function* streamGenerate(params: GenerateParams) {
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, options: { stream: true } }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // Parse SSE: "data: {...}\n\n"
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        yield JSON.parse(data).text;
      }
    }
  }
}
```

### UI/UX Requirements

**Generate Button:**
- Position: Below email body field, aligned right
- Text: "✨ Gerar com IA" (idle) → "Gerando..." (loading)
- Variant: outline or ghost, with Sparkles icon
- Disabled when: already generating, no campaign context

**Streaming Animation:**
- Text appears progressively (no full replace)
- Cursor blink at end of text during streaming
- Subtle pulse on EmailBlock border during generation

**Error State:**
- Red text below button: "Não foi possível gerar. Tente novamente."
- Button changes to "🔄 Tentar novamente"
- Error clears on click

### Project Structure Notes

**New Files:**
```
src/hooks/
├── use-ai-generate.ts        # NEW: AI generation hook

src/components/builder/
├── AIGenerateButton.tsx      # NEW: Generate button component
├── EmailBlock.tsx            # MODIFY: Add AI generation integration
```

**Modified Files:**
- `src/components/builder/EmailBlock.tsx` - Add generate button and streaming

### Testing Strategy

**Unit Tests:**
- Mock fetch for streaming response
- Test phase transitions: idle → generating → streaming → done
- Test error handling and retry
- Test abort/cancel functionality

**Integration Tests:**
- Test EmailBlock with mocked useAIGenerate
- Verify store updates during streaming

### Technical Constraints

1. **Timeout:** 5 seconds max for generation (NFR-P2 from PRD)
2. **Streaming:** Use fetch + ReadableStream (NOT EventSource for POST)
3. **Store Sync:** Update builder store on each meaningful text update (debounced)
4. **Error Messages:** Portuguese only
5. **Accessibility:** Button has proper aria-labels, loading state announced

### Context Placeholders (MVP)

For MVP, use placeholder values when lead context is not available:

```typescript
const defaultVariables = {
  company_context: "Empresa de tecnologia focada em soluções B2B",
  lead_name: "Nome",
  lead_title: "Cargo",
  lead_company: "Empresa",
  lead_industry: "Tecnologia",
  lead_location: "Brasil",
  tone_description: "Profissional e amigável",
  email_objective: "Prospecção inicial para apresentar soluções",
  icebreaker: "",
};
```

Story 6.3 (Knowledge Base Integration) will provide real context.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.2]
- [Source: _bmad-output/implementation-artifacts/6-1-ai-provider-service-layer.md]
- [Source: src/app/api/ai/generate/route.ts - API with streaming]
- [Source: src/hooks/use-ai-search.ts - Pattern reference for phases]
- [Source: src/components/builder/EmailBlock.tsx - Integration target]
- [Source: src/stores/use-builder-store.ts - Store update pattern]
- [Source: src/lib/ai/prompts/defaults.ts - Prompt variables]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- **Task 1:** Created `useAIGenerate` hook with full streaming support via fetch + ReadableStream. Implements SSE parsing, phase tracking (idle/generating/streaming/done/error), abort/cancel functionality, and TanStack Query mutation for state management.
- **Task 2:** Created `AIGenerateButton` component with state-aware UI: idle shows "Gerar com IA" with sparkle icon, loading shows "Gerando..." with spinner, error shows "Tentar novamente" with refresh icon and destructive variant.
- **Task 3:** Updated `EmailBlock` to integrate AI generation. Added generate button below body field, streaming text updates for subject/body fields, pulse animation during generation, and proper store sync.
- **Task 4:** Implemented streaming UI with status indicator "Gerando texto personalizado...", pulse animation on block container, and progressive text updates via SSE chunks.
- **Task 5:** Error handling shows inline error message with retry button. Error state clears on retry. Hook handles API errors and streaming errors.
- **Task 6:** Added 63 unit tests covering hook streaming logic, button states, EmailBlock integration, and error handling. Also updated existing SortableBlock and BuilderCanvas tests to mock useAIGenerate.
- **Code Review (2026-02-02):** Fixed H1 (missing 5s timeout), M2 (missing body generation test), M3 (stale closure in handleGenerate). Total tests now: 66.

### File List

**New Files:**
- `src/hooks/use-ai-generate.ts` - AI generation hook with streaming support
- `src/components/builder/AIGenerateButton.tsx` - Generate button component
- `__tests__/unit/hooks/use-ai-generate.test.tsx` - Hook unit tests (11 tests)
- `__tests__/unit/components/builder/AIGenerateButton.test.tsx` - Button component tests (20 tests)

**Modified Files:**
- `src/components/builder/EmailBlock.tsx` - Added AI generation integration
- `__tests__/unit/components/builder/EmailBlock.test.tsx` - Added AI generation tests (10 tests)
- `__tests__/unit/components/builder/SortableBlock.test.tsx` - Added useAIGenerate mock
- `__tests__/unit/components/builder/BuilderCanvas.test.tsx` - Added useAIGenerate mock

## Change Log

- 2026-02-02: Code Review fixes - Added 5s timeout (H1), body generation test (M2), fixed stale closure (M3)
- 2026-02-02: Story 6.2 implementation complete - AI text generation in builder with streaming support

