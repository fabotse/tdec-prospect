# Story 6.9: Tone of Voice Application

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want AI to maintain my configured tone of voice,
So that all emails sound consistent with my brand.

## Acceptance Criteria

### AC #1: Casual Tone Application
**Given** I have configured tone of voice as "Casual" in the Knowledge Base
**When** AI generates email content (subject, body, icebreaker)
**Then** the language is conversational and friendly
**And** formal constructs are avoided (você → você casual, não usar "prezado", etc.)
**And** the text feels human, not robotic
**And** product-specific content (if any) also follows this tone

### AC #2: Formal Tone Application
**Given** I have configured tone of voice as "Formal"
**When** AI generates email content
**Then** the language uses corporate vocabulary
**And** the text is respectful and professional
**And** formal greetings and closings are used ("Prezado(a)", "Atenciosamente")
**And** contractions and colloquialisms are avoided

### AC #3: Technical Tone Application
**Given** I have configured tone as "Técnico"
**When** AI generates text
**Then** appropriate technical terminology is used
**And** the text is precise and professional
**And** industry-specific language is included
**And** product features are described with technical accuracy

### AC #4: Custom Guidelines Application
**Given** I have configured custom tone guidelines (writing_guidelines field)
**When** AI generates text
**Then** it follows those specific guidelines
**And** the guidelines complement the selected preset
**And** if guidelines conflict with preset, guidelines take precedence

### AC #5: Tone Consistency Across Generation Phases
**Given** a campaign is configured with a specific tone
**When** AI generates icebreaker → subject → body in sequence
**Then** ALL three outputs maintain the same tone style
**And** the tone is consistent even when regenerating (Story 6.8)

### AC #6: Tone with Product Context
**Given** a campaign has both a product selected (Story 6.5) AND tone configured
**When** AI generates text
**Then** product-specific content is adapted to the configured tone
**And** the product is presented using vocabulary appropriate to the tone
**Example**: Casual: "Nosso [Produto] pode te ajudar..." vs Formal: "Nossa solução [Produto] visa auxiliar..."

### AC #7: Graceful Degradation (No Tone Configured)
**Given** no tone of voice is configured (or defaults)
**When** AI generates text
**Then** it uses "casual" as the default preset
**And** the text maintains a professional yet friendly baseline
**And** no error occurs - generation proceeds normally

## Tasks / Subtasks

- [x] Task 1: Enhance Prompts with Specific Tone Instructions (AC: #1, #2, #3)
  - [x] 1.1 Update `email_subject_generation` prompt with detailed tone-specific rules
  - [x] 1.2 Update `email_body_generation` prompt with tone vocabulary examples
  - [x] 1.3 Update `icebreaker_generation` prompt with tone-appropriate opening styles
  - [x] 1.4 Create migration file `00028_update_prompts_tone_specificity.sql`
  - [x] 1.5 Update CODE_DEFAULT_PROMPTS in `src/lib/ai/prompts/defaults.ts`

- [x] Task 2: Strengthen Tone Variable Compilation (AC: #4, #7)
  - [x] 2.1 Review `compileToneDescription` in `knowledge-base-context.ts`
  - [x] 2.2 Add preset-specific vocabulary hints to `tone_description` output
  - [x] 2.3 Ensure `writing_guidelines` are prominently included in compilation
  - [x] 2.4 Add unit tests for tone variable compilation

- [x] Task 3: Unit Tests - Tone Variables (AC: #4, #7)
  - [x] 3.1 Test `buildAIVariables` outputs correct `tone_style` for each preset
  - [x] 3.2 Test `tone_description` includes preset label + custom description
  - [x] 3.3 Test `writing_guidelines` passed correctly
  - [x] 3.4 Test default tone when KB not configured (should be "casual")
  - [x] 3.5 Test tone variables with and without product context

- [x] Task 4: Integration Tests - Prompt Rendering with Tone (AC: #1, #2, #3)
  - [x] 4.1 Test prompt interpolation includes tone variables correctly
  - [x] 4.2 Test `{{tone_style}}` renders as "formal", "casual", or "technical"
  - [x] 4.3 Test `{{tone_description}}` renders human-readable description
  - [x] 4.4 Test `{{writing_guidelines}}` renders when present, empty when not

- [x] Task 5: E2E/Manual Test - Verify Different Outputs (AC: #1, #2, #3, #5, #6)
  - [x] 5.1 Document manual test: Generate email with "casual" tone, verify friendly language
  - [x] 5.2 Document manual test: Generate email with "formal" tone, verify corporate language
  - [x] 5.3 Document manual test: Generate email with "technical" tone, verify technical terms
  - [x] 5.4 Document manual test: Regenerate and verify tone consistency
  - [x] 5.5 Document manual test: Generate with product + tone, verify both applied

### Review Follow-ups (AI)
- [x] [AI-Review][MEDIUM] Execute manual tests 5.1-5.5 and document results ✅ Validated by user 2026-02-03
- [ ] [AI-Review][LOW] Consider adding unit tests for KB context cache invalidation in hooks

## Dev Notes

### Story Dependencies - ALREADY IMPLEMENTED

**CRITICAL:** These stories are DONE and provide the foundation:

- **Story 2.5** (done): Knowledge Base Editor - Tone & Examples - ToneOfVoice model with preset/custom_description/writing_guidelines
- **Story 6.1** (done): AI Provider Service Layer - PromptManager, ai_prompts table, prompt rendering
- **Story 6.2** (done): AI Text Generation in Builder - useAIGenerate hook, streaming
- **Story 6.3** (done): Knowledge Base Integration - useKnowledgeBaseContext hook, KB variables in prompts
- **Story 6.5** (done): Campaign Product Context - Product variables in prompts
- **Story 6.6** (done): Personalized Icebreakers - 3-phase generation flow
- **Story 6.8** (done): Text Regeneration - Regeneration preserves context

### Current Implementation Analysis

**ToneOfVoice Type (`src/types/knowledge-base.ts:145-149`):**
```typescript
export interface ToneOfVoice {
  preset: TonePreset;  // "formal" | "casual" | "technical"
  custom_description: string;  // User's custom tone description
  writing_guidelines: string;  // Specific writing rules
}
```

**Tone Variables Compiled (`src/lib/services/knowledge-base-context.ts:281-284`):**
```typescript
// Currently compiled as:
tone_description: compileToneDescription(tone),  // "Tom Casual. [custom_description]"
tone_style: tone?.preset || DEFAULT_TONE_STYLE,  // "casual"
writing_guidelines: tone?.writing_guidelines || "",
```

**Current Prompt Usage (`src/lib/ai/prompts/defaults.ts`):**
- `email_subject_generation`: Has `TOM DE VOZ:\n{{tone_description}}\nEstilo: {{tone_style}}`
- `email_body_generation`: Has `TOM DE VOZ:\n{{tone_description}}\nEstilo: {{tone_style}}\nDiretrizes de escrita: {{writing_guidelines}}`
- `icebreaker_generation`: Has `TOM DE VOZ:\n{{tone_description}}\nEstilo: {{tone_style}}`

**Issue Identified:** The prompts mention tone but don't provide SPECIFIC examples of what each tone looks like. The AI needs clearer instructions on HOW to adapt language for each preset.

### Implementation Pattern

**Enhanced Prompt Structure (Example for email_body_generation):**
```
TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}
Diretrizes de escrita: {{writing_guidelines}}

GUIA DE TOM POR PRESET:
{{#if tone_style == "casual"}}
ESTILO CASUAL:
- Use "você" (não "senhor/senhora")
- Evite "Prezado" - use "Olá" ou "Oi"
- Pode usar expressões informais: "super", "bem legal", "dá uma olhada"
- Tom amigável como conversa entre colegas
- Feche com "Abraço" ou "Até mais" (não "Atenciosamente")
{{/if}}
{{#if tone_style == "formal"}}
ESTILO FORMAL:
- Use linguagem corporativa
- "Prezado(a)" na saudação
- Evite gírias e expressões coloquiais
- Estrutura mais rígida e respeitosa
- Feche com "Atenciosamente" ou "Cordialmente"
{{/if}}
{{#if tone_style == "technical"}}
ESTILO TÉCNICO:
- Use terminologia técnica do setor
- Seja preciso e objetivo
- Mencione métricas, KPIs, ROI quando relevante
- Tom especialista falando com especialista
- Evite simplificações excessivas
{{/if}}
```

**NOTE:** Handlebars `{{#if}}` with equality checks may not work directly. Alternative: Include all three guides and tell AI to follow the one matching `{{tone_style}}`.

### Project Structure Notes

**Files to Modify:**
```
src/lib/ai/prompts/defaults.ts                    - Update CODE_DEFAULT_PROMPTS with tone-specific rules
src/lib/services/knowledge-base-context.ts        - Enhance tone compilation (optional, may not be needed)
supabase/migrations/00028_update_prompts_tone_specificity.sql  - NEW migration
__tests__/unit/lib/services/knowledge-base-context.test.ts     - Add tone compilation tests
__tests__/integration/ai-generate-tone.test.ts    - NEW integration tests for tone in prompts
```

**No UI Changes Required** - All tone configuration already exists in Knowledge Base Editor (Story 2.5).

### Prompt Enhancement Strategy

Since `{{#if tone_style == "formal"}}` syntax is not supported (Handlebars-like but simpler), use this approach:

1. **Include ALL tone guides** in the prompt (all three presets)
2. **Tell AI to follow** the one matching `{{tone_style}}`
3. Keep the template maintainable

**Example:**
```
IMPORTANTE: Siga o guia de tom correspondente ao estilo "{{tone_style}}":

GUIA - CASUAL:
[casual rules]

GUIA - FORMAL:
[formal rules]

GUIA - TÉCNICO:
[technical rules]

Use APENAS o guia correspondente a "{{tone_style}}".
```

### Testing Strategy

**Unit Tests - Tone Variable Compilation:**
1. Test `tone_style` is "formal" when preset is "formal"
2. Test `tone_style` is "casual" when preset is "casual"
3. Test `tone_style` is "technical" when preset is "technical"
4. Test `tone_description` includes "Tom Formal" when formal preset
5. Test `tone_description` concatenates custom_description
6. Test default to "casual" when no tone configured
7. Test writing_guidelines included when present

**Integration Tests - Prompt Rendering:**
1. Render `email_body_generation` with formal tone, verify `{{tone_style}}` = "formal"
2. Render `email_body_generation` with casual tone, verify `{{tone_style}}` = "casual"
3. Verify `{{writing_guidelines}}` renders correctly

**Manual Verification (E2E):**
Since AI output is non-deterministic, manual verification is needed:
1. Configure "casual" tone in KB
2. Generate email and verify language is friendly
3. Configure "formal" tone
4. Generate email and verify language is corporate
5. Document observations in story completion notes

### Edge Cases to Handle

1. **No Tone Configured:** Default to "casual" (graceful degradation)
2. **Empty Custom Description:** Use preset label only
3. **Empty Writing Guidelines:** Omit from prompt (don't show "Diretrizes de escrita: ")
4. **Conflicting Guidelines:** If writing_guidelines contradicts preset, guidelines win
5. **Product + Tone:** Both must be applied - product content in tone style
6. **Regeneration:** Same tone context used on every regeneration

### Migration Content Preview

```sql
-- Migration: 00028_update_prompts_tone_specificity.sql
-- Story 6.9: Tone of Voice Application
--
-- Enhances prompts with specific tone adaptation rules for each preset.
-- AI will now have clear examples of how to adapt language.

UPDATE public.ai_prompts
SET
  prompt_template = '... enhanced prompt with tone guides ...',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'email_subject_generation' AND tenant_id IS NULL;

-- Similar updates for email_body_generation and icebreaker_generation
```

### Technical Constraints

1. **Prompt Size:** Adding tone guides increases prompt length - stay within token limits
2. **Handlebars Limitations:** No equality checks (`==`) - use alternative approach
3. **AI Interpretation:** AI may not perfectly follow tone 100% of time - acceptable variance
4. **Default Tone:** Must be "casual" for graceful degradation (not "formal" or "technical")
5. **Backwards Compatibility:** Existing prompts work, this is an enhancement

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.9]
- [Source: src/types/knowledge-base.ts:145-149 - ToneOfVoice interface]
- [Source: src/lib/services/knowledge-base-context.ts:130-143 - compileToneDescription]
- [Source: src/lib/ai/prompts/defaults.ts:233-265 - tone_application prompt (unused)]
- [Source: _bmad-output/implementation-artifacts/6-8-text-regeneration.md - Previous story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - No debug issues encountered during implementation.

### Completion Notes List

1. **Task 1 - Enhanced Prompts with Tone Guides:**
   - Created migration `00028_update_prompts_tone_specificity.sql` updating all 3 prompts
   - Added detailed tone guides for [CASUAL], [FORMAL], and [TÉCNICO] with vocabulary examples
   - All prompts now include `writing_guidelines` variable and explicit tone instructions
   - Updated `CODE_DEFAULT_PROMPTS` in defaults.ts to match DB prompts

2. **Task 2 - Tone Variable Compilation:**
   - Enhanced `compileToneDescription()` to include vocabulary hints per preset
   - Added `TONE_PRESET_HINTS` constant with brief descriptions for each preset
   - Format now: "Tom [Label]. [Vocabulary Hint]. [Custom Description if any]"
   - Default tone correctly set to "casual" (AC #7)

3. **Task 3 - Unit Tests (14 new tests):**
   - Tests for `tone_style` output for each preset (formal, casual, technical)
   - Tests for `tone_description` including vocabulary hints
   - Tests for `writing_guidelines` pass-through
   - Tests for default tone fallback
   - Tests for tone + product context interaction

4. **Task 4 - Integration Tests (9 new tests in prompt-manager):**
   - Tests for `{{tone_style}}` interpolation as "formal", "casual", "technical"
   - Tests for `{{tone_description}}` rendering with preset labels
   - Tests for `{{writing_guidelines}}` rendering
   - All tests pass (2373 total, +23 new for Story 6.9)

5. **Task 5 - Manual Test Documentation:** See below.

6. **Cache Invalidation Fix (Code Review Addition):**
   - Added KB context cache invalidation to all KB section hooks
   - When user saves Tone, Company, ICP, or Examples in Knowledge Base Editor
   - The `["knowledge-base", "context"]` query is invalidated
   - This ensures Campaign Builder fetches fresh KB settings for AI generation
   - Without this fix, tone changes wouldn't reflect until page refresh

### Manual Test Procedures (E2E Verification)

**Test 5.1: Casual Tone Verification**
1. Configurar Knowledge Base > Tom de Voz > Preset: "Casual"
2. Abrir Campaign Builder, selecionar um lead
3. Clicar em "Gerar Assunto" e "Gerar Corpo"
4. **Verificar:**
   - Saudação usa "Olá" ou "Oi" (não "Prezado")
   - Linguagem amigável e próxima
   - Fechamento usa "Abraço" ou "Até mais" (não "Atenciosamente")
   - Pode ter expressões informais

**Test 5.2: Formal Tone Verification**
1. Configurar Knowledge Base > Tom de Voz > Preset: "Formal"
2. Gerar email no Campaign Builder
3. **Verificar:**
   - Saudação usa "Prezado(a)" ou "Caro(a)"
   - Linguagem corporativa e respeitosa
   - Sem gírias ou expressões coloquiais
   - Fechamento usa "Atenciosamente" ou "Cordialmente"

**Test 5.3: Technical Tone Verification**
1. Configurar Knowledge Base > Tom de Voz > Preset: "Técnico"
2. Gerar email no Campaign Builder
3. **Verificar:**
   - Uso de terminologia técnica do setor
   - Linguagem precisa e objetiva
   - Menção de métricas/KPIs quando relevante
   - Tom especialista

**Test 5.4: Regeneration Consistency**
1. Configurar qualquer tom (ex: Formal)
2. Gerar icebreaker → assunto → corpo
3. Clicar em "Regenerar" em qualquer campo
4. **Verificar:** O tom permanece consistente após regeneração

**Test 5.5: Tone + Product Context**
1. Configurar Tom: Casual, Criar Produto no catálogo
2. Selecionar produto na campanha
3. Gerar email
4. **Verificar:**
   - Produto mencionado no texto
   - Produto descrito com tom casual (ex: "Nosso [Produto] pode te ajudar...")

### File List

**New Files:**
- `supabase/migrations/00028_update_prompts_tone_specificity.sql`

**Modified Files:**
- `src/lib/ai/prompts/defaults.ts` - Added tone guides to all 3 prompts
- `src/lib/services/knowledge-base-context.ts` - Enhanced compileToneDescription with vocabulary hints
- `__tests__/unit/lib/services/knowledge-base-context.test.ts` - Added 14 tone variable tests
- `__tests__/unit/lib/ai/prompt-manager.test.ts` - Added 9 tone interpolation tests
- `src/hooks/use-tone-of-voice.ts` - Added KB context cache invalidation on save
- `src/hooks/use-knowledge-base.ts` - Added KB context cache invalidation on save
- `src/hooks/use-icp-definition.ts` - Added KB context cache invalidation on save
- `src/hooks/use-email-examples.ts` - Added KB context cache invalidation on CRUD operations

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-03 | Story 6.9 implemented: Tone of Voice Application with specific tone guides for casual/formal/technical presets, vocabulary hints in tone compilation, comprehensive test coverage | Dev Agent |
| 2026-02-03 | Code Review: Fixed File List (added 4 missing hooks), documented cache invalidation fix, added 2 follow-up action items | Code Review Agent |
| 2026-02-03 | Manual tests 5.1-5.5 validated by user - tone application working correctly | User |

