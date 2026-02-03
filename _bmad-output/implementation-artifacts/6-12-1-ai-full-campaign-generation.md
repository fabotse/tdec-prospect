# Story 6.12.1: AI Full Campaign Generation

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want AI to generate the complete campaign with structure explanation and email content,
So that I have a ready-to-review campaign without manually generating each email.

## Acceptance Criteria

### AC #1: Structure Rationale Display
**Given** AI generates the campaign structure (from 6.12)
**When** the structure is ready
**Then** I see a "Resumo da Estrategia" panel showing:
  - Brief explanation of WHY this structure was chosen
  - Number of emails and total campaign duration
  - The strategic approach for the objective selected
**And** the explanation is personalized (not a static template)
**And** I can continue to full generation or go back to adjust parameters

### AC #2: Full Generation Option
**Given** I see the strategy summary panel
**When** I click "Gerar Campanha Completa"
**Then** the system generates content for ALL emails in sequence
**And** I see a progress indicator showing which email is being generated (1/5, 2/5, etc.)
**And** each email is generated with subject + body
**And** follow-up emails use the follow_up prompts (Story 6.11) with previous email context

### AC #3: Sequential Generation with Context
**Given** the campaign has multiple emails (e.g., 5)
**When** AI generates email 2, 3, 4, 5
**Then** each generation receives the previous email's subject and body as context
**And** follow-up emails reference the conversation naturally
**And** the sequence maintains coherent narrative flow
**And** no email repeats information already presented

### AC #4: Generation Progress UI
**Given** full generation is in progress
**When** generating multiple emails
**Then** I see:
  - "Gerando email 1 de 5: Introducao..."
  - Progress bar showing overall completion
  - Each completed email gets a checkmark
**And** I can cancel at any point (partial campaign saved)
**And** total generation time is reasonable (<30s for 5 emails)

### AC #5: Generated Campaign in Builder
**Given** all emails are generated
**When** I view the builder
**Then** all email blocks have subject and body populated
**And** I can edit any email manually
**And** I can regenerate individual emails if needed
**And** the campaign is saved automatically
**And** I see "Campanha criada com IA" indicator

### AC #6: Partial Generation Handling
**Given** generation fails mid-sequence (e.g., at email 3)
**When** an error occurs
**Then** emails 1 and 2 remain populated (not lost)
**And** I see "Geracao pausada. 2 de 5 emails gerados."
**And** I can retry from where it stopped OR continue manually
**And** the partial campaign is saved

### AC #7: Alternative Quick Mode
**Given** I see the strategy summary panel
**When** I click "Criar Apenas Estrutura" (alternative to full generation)
**Then** the behavior is identical to Story 6.12 (structure only, no content)
**And** I can generate content manually later using existing flows

## Tasks / Subtasks

- [ ] Task 1: Add Rationale Display to Wizard (AC: #1)
  - [ ] 1.1 Create `StrategySummary` component showing rationale
  - [ ] 1.2 Display email count, total days, and AI explanation
  - [ ] 1.3 Add "Gerar Campanha Completa" and "Criar Apenas Estrutura" buttons
  - [ ] 1.4 Style as an intermediate step between form and builder

- [ ] Task 2: Create useAIFullCampaignGeneration Hook (AC: #2, #3)
  - [ ] 2.1 Create `use-ai-full-campaign-generation.ts` hook
  - [ ] 2.2 Accept structure (blocks array) + wizard params as input
  - [ ] 2.3 Generate emails sequentially using existing AI generation APIs
  - [ ] 2.4 For follow-ups: pass previous email subject/body as context
  - [ ] 2.5 Return progress updates via callback

- [ ] Task 3: Implement Sequential Generation Logic (AC: #3)
  - [ ] 3.1 Create `generateEmailSequence` function
  - [ ] 3.2 For email 1: use `email_subject_generation` + `email_body_generation`
  - [ ] 3.3 For email 2+: check emailMode - if follow-up, use `follow_up_subject_generation` + `follow_up_email_generation`
  - [ ] 3.4 Pass previous email content as context to follow-up prompts
  - [ ] 3.5 Build context accumulator for multi-email sequences

- [ ] Task 4: Create Generation Progress UI (AC: #4)
  - [ ] 4.1 Create `GenerationProgress` component with stepper UI
  - [ ] 4.2 Show current email being generated with strategic context
  - [ ] 4.3 Add progress bar and checkmarks for completed emails
  - [ ] 4.4 Add cancel button that saves partial progress

- [ ] Task 5: Update AICampaignWizard Flow (AC: #1, #2, #7)
  - [ ] 5.1 Add intermediate "strategy summary" step after structure generation
  - [ ] 5.2 Route to full generation or structure-only based on user choice
  - [ ] 5.3 Handle wizard state transitions correctly

- [ ] Task 6: Handle Partial Generation (AC: #6)
  - [ ] 6.1 Save campaign after each email is generated (not batch)
  - [ ] 6.2 Track generation progress in state
  - [ ] 6.3 On error: preserve generated content, show retry option
  - [ ] 6.4 Allow "continue from email X" functionality

- [ ] Task 7: Update Builder for AI-Generated Campaigns (AC: #5)
  - [ ] 7.1 Add "Campanha criada com IA" badge/indicator
  - [ ] 7.2 Ensure regenerate button works for AI-populated emails
  - [ ] 7.3 Auto-save after generation completes

- [ ] Task 8: Unit Tests - Strategy Summary (AC: #1)
  - [ ] 8.1 Test rationale display with various objectives
  - [ ] 8.2 Test button navigation (full vs structure-only)
  - [ ] 8.3 Test back button returns to form

- [ ] Task 9: Unit Tests - Full Generation Hook (AC: #2, #3)
  - [ ] 9.1 Test sequential generation for cold_outreach (all initial)
  - [ ] 9.2 Test sequential generation for follow_up objective (first initial, rest follow-up)
  - [ ] 9.3 Test context passing between emails
  - [ ] 9.4 Test error handling and partial completion

- [ ] Task 10: Unit Tests - Progress UI (AC: #4)
  - [ ] 10.1 Test progress indicator updates
  - [ ] 10.2 Test cancel functionality
  - [ ] 10.3 Test completion state

- [ ] Task 11: Integration Tests (AC: #1-#7)
  - [ ] 11.1 Test full wizard -> summary -> full generation -> builder flow
  - [ ] 11.2 Test structure-only path still works
  - [ ] 11.3 Test partial generation recovery
  - [ ] 11.4 Test all email content is persisted

- [ ] Task 12: Manual Verification
  - [ ] 12.1 Create campaign with full AI generation
  - [ ] 12.2 Verify rationale makes sense for objective
  - [ ] 12.3 Verify follow-ups reference previous emails naturally
  - [ ] 12.4 Verify generation completes in reasonable time
  - [ ] 12.5 Test error recovery scenario

## Dev Notes

### Story Context - Why This Feature

**Problem Identified:** Story 6.12 generates the campaign STRUCTURE (blocks), but users still need to manually click "Gerar Conteudo" on each email. For a 5-email campaign, this means 10 manual generations (5 subjects + 5 bodies).

**Solution:** After generating structure:
1. Show the AI's reasoning (rationale) so users understand WHY this structure
2. Offer "full generation" that creates ALL email content automatically
3. Generate sequentially so follow-ups reference previous emails correctly

**User Value:** Campaign creation goes from ~10 minutes of manual work to ~30 seconds of waiting.

### Architecture Decision: Sequential vs Parallel Generation

**Decision:** Sequential generation (not parallel)

**Rationale:**
- Follow-up emails NEED previous email content as context
- Parallel generation would produce disconnected emails
- 5 emails × ~3s each = ~15s total (acceptable)
- Allows for early abort if user cancels

### Integration with Existing Stories

| Story | Integration Point |
|-------|-------------------|
| 6.12 | Uses generated structure and rationale |
| 6.11 | Uses follow_up_email_generation and follow_up_subject_generation prompts |
| 6.2 | Reuses AI generation infrastructure (hooks, API routes) |
| 6.9 | Tone settings applied to all generated content |
| 6.10 | Successful examples included if available |
| 6.5 | Product context passed to all emails |

### Wizard Flow Modification

```
BEFORE (6.12):
[Form] --> [Generating...] --> [Builder with empty emails]

AFTER (6.12.1):
[Form] --> [Generating structure...] --> [Strategy Summary]
                                              |
                    +-------------------------+------------------------+
                    |                                                  |
                    v                                                  v
          [Full Generation]                              [Structure Only]
          [Generating 1/5...]                            [Builder with empty emails]
          [Generating 2/5...]                            (same as 6.12)
          ...
                    |
                    v
          [Builder with ALL emails populated]
```

### New Components

**1. StrategySummary.tsx**
```tsx
interface StrategySummaryProps {
  rationale: string;
  totalEmails: number;
  totalDays: number;
  objective: CampaignObjective;
  onGenerateFull: () => void;
  onStructureOnly: () => void;
  onBack: () => void;
}

// Shows:
// - Card with rationale text (AI explanation)
// - Summary stats (X emails, Y dias total)
// - Two buttons: "Gerar Campanha Completa" (primary) / "Criar Apenas Estrutura" (secondary)
```

**2. GenerationProgress.tsx**
```tsx
interface GenerationProgressProps {
  currentStep: number;
  totalSteps: number;
  currentEmailContext: string; // e.g., "Introducao e gancho inicial"
  completedEmails: string[];
  onCancel: () => void;
}

// Shows:
// - Vertical stepper with email contexts
// - Current step highlighted with spinner
// - Completed steps with checkmark
// - Progress bar at bottom
```

### Hook Design: useAIFullCampaignGeneration

```typescript
interface UseAIFullCampaignGenerationParams {
  blocks: BuilderBlock[];
  campaignId: string;
  productId: string | null;
  productName: string | null;
  objective: CampaignObjective;
  tone: string;
}

interface GenerationProgress {
  currentEmail: number;
  totalEmails: number;
  currentContext: string;
  completedEmails: Array<{
    id: string;
    subject: string;
    body: string;
  }>;
}

interface UseAIFullCampaignGenerationReturn {
  generate: () => Promise<BuilderBlock[]>;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  error: string | null;
  cancel: () => void;
}

// Usage:
const { generate, isGenerating, progress, cancel } = useAIFullCampaignGeneration({
  blocks: structureBlocks,
  campaignId: campaign.id,
  productId: data.productId,
  objective: data.objective,
  tone: data.tone,
});

// Progress updates via state:
// progress.currentEmail: 2
// progress.totalEmails: 5
// progress.currentContext: "Proposta de valor"
// progress.completedEmails: [{id, subject, body}, ...]
```

### Generation Logic Pseudocode

```typescript
async function generateEmailSequence(blocks, params) {
  const emailBlocks = blocks.filter(b => b.type === 'email');
  const results: GeneratedEmail[] = [];

  for (let i = 0; i < emailBlocks.length; i++) {
    const block = emailBlocks[i];
    const isFollowUp = block.data.emailMode === 'follow-up';
    const previousEmail = i > 0 ? results[i - 1] : null;

    // Generate subject
    const subject = await generateSubject({
      promptKey: isFollowUp ? 'follow_up_subject_generation' : 'email_subject_generation',
      previousSubject: previousEmail?.subject,
      ...params,
    });

    // Generate body
    const body = await generateBody({
      promptKey: isFollowUp ? 'follow_up_email_generation' : 'email_body_generation',
      previousSubject: previousEmail?.subject,
      previousBody: previousEmail?.body,
      ...params,
    });

    results.push({ id: block.id, subject, body });

    // Update block in store (progressive save)
    updateBlockContent(block.id, { subject, body });

    // Report progress
    onProgress({ currentEmail: i + 1, totalEmails: emailBlocks.length });
  }

  return results;
}
```

### API Considerations

**Existing APIs to reuse:**
- `POST /api/ai/text` - Already used for subject/body generation
- Uses PromptManager with proper variable substitution

**New variables needed for follow-up context:**
- `previous_email_subject`: Subject of the previous email in sequence
- `previous_email_body`: Body of the previous email in sequence

These are already supported by the follow_up prompts from Story 6.11.

### Performance Targets

| Metric | Target |
|--------|--------|
| 3-email campaign | <15 seconds |
| 5-email campaign | <25 seconds |
| 7-email campaign | <40 seconds |
| Single email generation | ~3-5 seconds |

### Error Handling Strategy

1. **Network error on email 3 of 5:**
   - Emails 1, 2 already saved to store
   - Show: "Geracao pausada no email 3. 2 emails gerados com sucesso."
   - Options: "Tentar novamente" / "Continuar manualmente"

2. **User cancels during generation:**
   - Save all completed emails
   - Navigate to builder with partial content
   - User can regenerate remaining emails manually

3. **AI returns invalid content:**
   - Retry once automatically
   - If still fails, mark that email as needing manual generation
   - Continue with next email

### Edge Cases

1. **Campaign with only 1 email:** Skip full generation option, go directly to structure (no sequence benefit)
2. **All emails are initial mode (cold_outreach):** Each email generated independently (no previous context needed)
3. **Mixed modes:** Respect emailMode per block - some initial, some follow-up
4. **Product context changes:** Product context locked at generation time

### Testing Strategy

**Unit Tests - Hook:**
1. Cold outreach campaign (all initial) generates correctly
2. Nurture campaign (first initial, rest follow-up) passes context correctly
3. Cancellation saves partial progress
4. Error recovery preserves completed emails

**Unit Tests - UI:**
1. StrategySummary shows rationale correctly
2. Progress indicator updates in real-time
3. Completion navigates to builder

**Integration Tests:**
1. Full wizard flow with full generation
2. Partial failure recovery
3. Structure-only path still works

### File List (to be created/modified)

```
src/components/campaigns/
  AICampaignWizard.tsx                       # MODIFY: Add strategy summary step
  StrategySummary.tsx                        # NEW: Rationale display component
  GenerationProgress.tsx                     # NEW: Progress stepper component
  index.ts                                   # MODIFY: Export new components

src/hooks/
  use-ai-full-campaign-generation.ts         # NEW: Sequential generation hook

src/components/builder/
  BuilderHeader.tsx                          # MODIFY: Add "AI-generated" indicator

__tests__/unit/components/campaigns/
  StrategySummary.test.tsx                   # NEW
  GenerationProgress.test.tsx                # NEW

__tests__/unit/hooks/
  use-ai-full-campaign-generation.test.tsx   # NEW

__tests__/integration/
  ai-full-campaign-generation.test.tsx       # NEW
```

### References

- [Source: 6-12-ai-campaign-structure-generation.md - Structure generation]
- [Source: 6-11-follow-up-email-mode.md - Follow-up prompts]
- [Source: src/hooks/use-ai-campaign-structure.ts - Structure hook pattern]
- [Source: src/lib/ai/prompts/defaults.ts - Prompt templates]
- [Source: src/components/campaigns/AICampaignWizard.tsx - Current wizard]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

