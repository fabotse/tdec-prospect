# Story 6.13: Smart Campaign Templates

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to choose from pre-built campaign templates,
So that I can quickly start with proven structures based on common scenarios.

## Acceptance Criteria

### AC #1: Templates Section in Wizard
**Given** I select "Criar com IA" from the campaigns page
**When** the wizard opens
**Then** I see a "Produto" dropdown at the top (same as Story 6.12)
**And** I see a "Templates Prontos" section with 4-6 template cards
**And** each card shows:
  - Template name
  - Brief description
  - Number of emails and total duration
  - Recommended use case

### AC #2: Available Templates
**Given** I view the templates section
**When** the templates are displayed
**Then** I see at least these options:
| Template | Emails | Duracao | Uso |
|----------|--------|---------|-----|
| Cold Outreach Classico | 5 | 14 dias | Primeiro contato com leads frios |
| Reengajamento Rapido | 3 | 7 dias | Leads que nao responderam antes |
| Nutricao Longa | 7 | 30 dias | Relacionamento de longo prazo |
| Follow-up Urgente | 3 | 5 dias | Leads quentes, decisao proxima |
| Apresentacao de Produto | 4 | 10 dias | Lancamento ou demo de produto |

### AC #3: Template Preview
**Given** I click on a template card
**When** the template is selected
**Then** I see a preview of the structure (emails + delays)
**And** I see the strategic rationale for each touchpoint
**And** I can click "Usar Este Template" or go back to browse

### AC #4: Template Application
**Given** I click "Usar Este Template"
**When** the template is applied
**Then** the campaign builder opens with the structure pre-populated
**And** all email blocks and delay blocks are positioned
**And** each email has strategic context placeholder (ex: "Email 3: Prova social e case de sucesso")
**And** the selected product (if any) is linked to the campaign
**And** I see product context indicator if product was selected
**And** I can modify the structure freely
**And** I see "Template: [Nome]" indicator in the campaign header

### AC #5: Custom Structure Alternative
**Given** I want a custom structure instead of templates
**When** I scroll past templates in the wizard
**Then** I see "Ou crie uma campanha personalizada:" section
**And** I can fill the custom form (Story 6.12) to generate a unique structure
**And** the product selection carries over to the custom form

### AC #6: Template Data Model
**Given** templates need to be updated
**When** an admin updates template definitions
**Then** templates are stored in campaign_templates table (id, name, description, structure_json, use_case, is_active, created_at)
**And** structure_json contains: emails array with position and context, delays array with duration
**And** RLS allows read access to all authenticated users
**And** templates are global (not per tenant) initially

### AC #7: Full Generation with Templates
**Given** I select a template and apply it
**When** I view the strategy summary (from 6.12.1)
**Then** I can choose "Gerar Campanha Completa" (generates all content)
**And** the flow is identical to Story 6.12.1 after template application
**And** follow-up patterns from templates are respected during generation

## Tasks / Subtasks

- [x] Task 1: Create Database Migration for campaign_templates (AC: #6)
  - [x] 1.1 Create migration file `00031_create_campaign_templates.sql`
  - [x] 1.2 Define schema: id, name, description, structure_json, use_case, is_active, created_at
  - [x] 1.3 Add RLS policy for read access to authenticated users
  - [x] 1.4 Seed initial templates with predefined structures

- [x] Task 2: Create Template Types and Interfaces (AC: #2, #6)
  - [x] 2.1 Create `types/campaign-template.ts` with CampaignTemplate interface
  - [x] 2.2 Define TemplateStructure type for structure_json parsing
  - [x] 2.3 Define TemplateEmailBlock and TemplateDelay types
  - [x] 2.4 Add Zod schemas for validation

- [x] Task 3: Create useCampaignTemplates Hook (AC: #1, #2)
  - [x] 3.1 Create `use-campaign-templates.ts` hook
  - [x] 3.2 Fetch templates from API with caching (5-min stale time)
  - [x] 3.3 Parse and validate structure_json
  - [x] 3.4 Return templates array with proper types

- [x] Task 4: Create TemplateCard Component (AC: #1, #2)
  - [x] 4.1 Create `TemplateCard.tsx` component
  - [x] 4.2 Display name, description, email count, duration
  - [x] 4.3 Show use case badge/text
  - [x] 4.4 Add selection state and click handler
  - [x] 4.5 Style consistent with existing wizard cards

- [x] Task 5: Create TemplatePreview Component (AC: #3)
  - [x] 5.1 Create `TemplatePreview.tsx` component
  - [x] 5.2 Display visual sequence of emails and delays
  - [x] 5.3 Show strategic context for each email
  - [x] 5.4 Add "Usar Este Template" and "Voltar" buttons
  - [x] 5.5 Include product selection summary if selected

- [x] Task 6: Create TemplateSelector Component (AC: #1, #5)
  - [x] 6.1 Create `TemplateSelector.tsx` as parent component
  - [x] 6.2 Include product dropdown at top
  - [x] 6.3 Display grid of TemplateCard components
  - [x] 6.4 Add "Ou crie uma campanha personalizada" section at bottom
  - [x] 6.5 Handle template selection state

- [x] Task 7: Update AICampaignWizard for Templates (AC: #1, #4, #5, #7)
  - [x] 7.1 Add "template-selection" step to wizard flow
  - [x] 7.2 Add "template-preview" step for selected template
  - [x] 7.3 Convert template structure to BuilderBlocks on apply
  - [x] 7.4 Route to strategy summary after template application
  - [x] 7.5 Pass selected product to campaign creation

- [x] Task 8: Update BuilderHeader for Template Indicator (AC: #4)
  - [x] 8.1 Add templateName state to useBuilderStore
  - [x] 8.2 Display "Template: [Nome]" badge next to AI badge
  - [x] 8.3 Store template name in builder store via setTemplateName

- [x] Task 9: Create Template Seed Data (AC: #2)
  - [x] 9.1 Define 5 template structures with emails and delays
  - [x] 9.2 Write strategic context for each email in sequence
  - [x] 9.3 Set appropriate emailMode (initial vs follow-up)
  - [x] 9.4 Include in migration seed

- [x] Task 10: Unit Tests - Template Components (AC: #1, #2, #3)
  - [x] 10.1 Test TemplateCard rendering and selection (18 tests)
  - [x] 10.2 Test TemplatePreview structure display (19 tests)
  - [x] 10.3 Test TemplateSelector grid and custom section (17 tests)
  - [x] 10.4 Test product dropdown integration

- [x] Task 11: Unit Tests - useCampaignTemplates Hook (AC: #2, #6)
  - [x] 11.1 Test template fetching and caching (11 tests)
  - [x] 11.2 Test structure_json parsing
  - [x] 11.3 Test error handling
  - [x] 11.4 Test empty state handling

- [x] Task 12: Integration Tests (AC: #1-#7)
  - [x] 12.1 Test template selection -> preview -> builder flow (15 tests)
  - [x] 12.2 Test template application with product context
  - [x] 12.3 Test full generation with template (integrates 6.12.1)
  - [x] 12.4 Test custom structure fallback path
  - [x] 12.5 Test structure conversion to BuilderBlocks

- [x] Task 13: Manual Verification
  - [x] 13.1 TypeScript compilation verified (no errors in new code)
  - [x] 13.2 All 80 story tests passing
  - [x] 13.3 Code follows existing patterns and architecture
  - [x] 13.4 Template indicator in builder header implemented

## Dev Notes

### Story Context - Why This Feature

**Problem Identified:** Story 6.12 allows AI to generate campaign structure dynamically, but users still need to configure parameters (objective, tone, urgency). For common scenarios, users want to "just pick a proven template" without thinking about configuration.

**Solution:**
1. Pre-built templates based on cold email best practices research
2. Quick selection UI with visual preview
3. Direct path to builder (or full generation via 6.12.1)
4. Templates are static but optimized - no AI generation for structure

**User Value:** Campaign creation with zero configuration - pick template, select product, generate content.

### Architecture Decision: Static Templates vs AI-Generated

**Decision:** Templates are static (pre-defined in database), not AI-generated

**Rationale:**
- Instant creation (no AI latency for structure)
- Consistent, tested structures based on research
- Admin control over template quality
- Users can still choose "custom" for AI-generated structure (6.12)

### Integration with Existing Stories

| Story | Integration Point |
|-------|-------------------|
| 6.12 | Shares wizard UI, custom form fallback |
| 6.12.1 | Uses strategy summary and full generation flow |
| 6.11 | Templates include follow-up email modes |
| 6.5 | Product selection at wizard top level |
| 5.x | Uses existing BuilderBlock structure |

### Wizard Flow Modification

```
CURRENT (6.12/6.12.1):
[Nova Campanha]
    |
    v
["Criar com IA" selected]
    |
    v
[Custom Form] --> [Generating...] --> [Strategy Summary] --> ...

NEW (with 6.13):
[Nova Campanha]
    |
    v
["Criar com IA" selected]
    |
    v
[Template Selection Page]
    |
    +--- [Select Template] --> [Template Preview] --> [Apply Template] --> [Strategy Summary] --> ...
    |
    +--- [Custom Campaign Section] --> [Custom Form] --> [Generating...] --> [Strategy Summary] --> ...
```

### Database Schema

```sql
-- Migration: 00031_create_campaign_templates.sql
CREATE TABLE campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  name_key VARCHAR(50) NOT NULL UNIQUE, -- for i18n future support
  description TEXT NOT NULL,
  structure_json JSONB NOT NULL,
  use_case VARCHAR(100) NOT NULL,
  email_count INTEGER NOT NULL,
  total_days INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Read access for all authenticated users
ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_read_access" ON campaign_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- Index for active templates
CREATE INDEX idx_campaign_templates_active ON campaign_templates(is_active, display_order);
```

### Template Structure JSON Format

```typescript
interface TemplateStructure {
  emails: TemplateEmail[];
  delays: TemplateDelay[];
}

interface TemplateEmail {
  position: number;           // 1, 2, 3...
  context: string;            // "Introducao e gancho inicial"
  emailMode: 'initial' | 'follow-up';
}

interface TemplateDelay {
  afterEmail: number;         // After email 1, add delay
  days: number;               // 3 days delay
}

// Example: Cold Outreach Classico (5 emails, 14 days)
{
  "emails": [
    { "position": 1, "context": "Introducao e proposta de valor", "emailMode": "initial" },
    { "position": 2, "context": "Aprofundamento em beneficios", "emailMode": "follow-up" },
    { "position": 3, "context": "Prova social e case de sucesso", "emailMode": "follow-up" },
    { "position": 4, "context": "Superacao de objecoes", "emailMode": "follow-up" },
    { "position": 5, "context": "Urgencia e call-to-action final", "emailMode": "follow-up" }
  ],
  "delays": [
    { "afterEmail": 1, "days": 3 },
    { "afterEmail": 2, "days": 3 },
    { "afterEmail": 3, "days": 4 },
    { "afterEmail": 4, "days": 4 }
  ]
}
```

### Template Seed Data

| Template | Emails | Days | Structure |
|----------|--------|------|-----------|
| Cold Outreach Classico | 5 | 14 | Intro (initial) -> Beneficios (FU) -> Prova social (FU) -> Objecoes (FU) -> CTA (FU) |
| Reengajamento Rapido | 3 | 7 | Retomada (initial) -> Novo valor (FU) -> Ultima chance (FU) |
| Nutricao Longa | 7 | 30 | Intro (initial) -> Conteudo 1-5 (FU) -> CTA final (FU) |
| Follow-up Urgente | 3 | 5 | Reforco (initial) -> Urgencia (FU) -> Decisao (FU) |
| Apresentacao de Produto | 4 | 10 | Apresentacao (initial) -> Features (FU) -> Demo (FU) -> Proximos passos (FU) |

### Component Structure

**New Components:**
```
src/components/campaigns/
  TemplateCard.tsx         # Individual template card
  TemplatePreview.tsx      # Detailed template preview
  TemplateSelector.tsx     # Template grid + custom section
  index.ts                 # Updated exports
```

**Component Props:**

```typescript
// TemplateCard.tsx
interface TemplateCardProps {
  template: CampaignTemplate;
  isSelected: boolean;
  onSelect: (template: CampaignTemplate) => void;
}

// TemplatePreview.tsx
interface TemplatePreviewProps {
  template: CampaignTemplate;
  selectedProduct: Product | null;
  onApply: () => void;
  onBack: () => void;
}

// TemplateSelector.tsx
interface TemplateSelectorProps {
  products: Product[];
  selectedProduct: Product | null;
  onProductChange: (product: Product | null) => void;
  onTemplateSelect: (template: CampaignTemplate) => void;
  onCustomClick: () => void;
}
```

### Hook Design: useCampaignTemplates

```typescript
interface UseCampaignTemplatesReturn {
  templates: CampaignTemplate[];
  isLoading: boolean;
  error: string | null;
}

// Usage:
const { templates, isLoading, error } = useCampaignTemplates();

// Implementation uses TanStack Query with 5-min cache
export function useCampaignTemplates() {
  return useQuery({
    queryKey: ['campaign-templates'],
    queryFn: fetchCampaignTemplates,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### Template to BuilderBlocks Conversion

```typescript
function convertTemplateToBlocks(
  template: CampaignTemplate
): BuilderBlock[] {
  const blocks: BuilderBlock[] = [];
  const structure = template.structure_json as TemplateStructure;

  structure.emails.forEach((email, idx) => {
    // Add email block
    blocks.push({
      id: generateId(),
      type: 'email',
      data: {
        subject: '',  // Empty - to be generated
        body: '',     // Empty - to be generated
        strategicContext: email.context,
        emailMode: email.emailMode,
      },
    });

    // Add delay block if exists
    const delay = structure.delays.find(d => d.afterEmail === email.position);
    if (delay) {
      blocks.push({
        id: generateId(),
        type: 'delay',
        data: {
          days: delay.days,
        },
      });
    }
  });

  return blocks;
}
```

### Previous Story Learnings (from 6.12.1)

1. **Wizard Step Management:** Use explicit step enum/union type for clarity
2. **Component Separation:** StrategySummary and GenerationProgress are separate components
3. **Product Context:** Pass through entire wizard flow
4. **Testing:** Cover all flow paths (template, custom, error states)
5. **Loading States:** Show distinct states for each async operation

### Relevant Code Patterns (from recent commits)

```typescript
// From AICampaignWizard.tsx - Step management
type WizardStep =
  | 'form'
  | 'generating-structure'
  | 'strategy-summary'
  | 'generating-content';

// NEW for this story:
type WizardStep =
  | 'template-selection'   // NEW
  | 'template-preview'     // NEW
  | 'form'                 // Custom form (existing)
  | 'generating-structure'
  | 'strategy-summary'
  | 'generating-content';
```

### Error Handling

1. **Template fetch fails:** Show error state with retry button
2. **No templates available:** Show only custom form section
3. **Invalid structure_json:** Filter out invalid templates, log error
4. **Template conversion fails:** Show error, offer manual builder

### Testing Strategy

**Unit Tests:**
1. TemplateCard renders correctly with all template data
2. TemplatePreview shows emails and delays visually
3. TemplateSelector handles product selection and template click
4. useCampaignTemplates hook fetches and caches data

**Integration Tests:**
1. Full flow: template selection -> preview -> apply -> strategy summary
2. Product context preserved through template flow
3. Full generation with template (end-to-end with 6.12.1)
4. Fallback to custom form works correctly

### Edge Cases

1. **No templates in DB:** Show only custom form
2. **All templates inactive:** Show only custom form
3. **Template with invalid structure_json:** Filter out, don't crash
4. **Single-email template:** Skip to builder (no strategy summary)
5. **Product deleted after selection:** Handle gracefully, clear selection

### Performance Considerations

1. **Template caching:** 5-minute stale time in TanStack Query
2. **Lazy loading:** Load templates only when wizard opens
3. **Structure conversion:** Synchronous, no API call needed

### Project Structure Notes

**Files to create:**
```
src/components/campaigns/
  TemplateCard.tsx                            # NEW
  TemplatePreview.tsx                         # NEW
  TemplateSelector.tsx                        # NEW

src/hooks/
  use-campaign-templates.ts                   # NEW

src/types/
  campaign-template.ts                        # NEW

supabase/migrations/
  00027_create_campaign_templates.sql         # NEW

__tests__/unit/components/campaigns/
  TemplateCard.test.tsx                       # NEW
  TemplatePreview.test.tsx                    # NEW
  TemplateSelector.test.tsx                   # NEW

__tests__/unit/hooks/
  use-campaign-templates.test.tsx             # NEW

__tests__/integration/
  campaign-templates.test.tsx                 # NEW
```

**Files to modify:**
```
src/components/campaigns/AICampaignWizard.tsx # Add template steps
src/components/campaigns/index.ts             # Export new components
src/components/builder/BuilderHeader.tsx      # Add template indicator
src/stores/use-builder-store.ts               # Add templateName field
src/types/index.ts                            # Export campaign-template types
```

### References

- [Source: epics.md - Story 6.13 acceptance criteria]
- [Source: 6-12-1-ai-full-campaign-generation.md - Strategy summary integration]
- [Source: 6-12-ai-campaign-structure-generation.md - Wizard patterns]
- [Source: architecture.md - Naming conventions, test structure]
- [Source: src/components/campaigns/AICampaignWizard.tsx - Current wizard]
- [Source: src/stores/use-builder-store.ts - Builder state management]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

1. **Migration:** Created `00031_create_campaign_templates.sql` (not 00027 as originally planned - 4 more migrations were added since story creation)
2. **API Route:** Created `/api/campaign-templates` for fetching templates from server
3. **Template Flow:** Wizard now starts at template-selection instead of form
4. **Template Conversion:** Function `convertTemplateToBlocks` converts template structure to BuilderBlocks with strategic context and emailMode
5. **Builder Store:** Added `templateName` state and `setTemplateName` action for tracking template origin
6. **Tests:** 80 tests total - TemplateCard (18), TemplatePreview (19), TemplateSelector (17), useCampaignTemplates (11), Integration (15)

### File List

**New Files:**
- `supabase/migrations/00031_create_campaign_templates.sql` - Database schema, RLS, seed data
- `src/types/campaign-template.ts` - TypeScript types and Zod schemas
- `src/hooks/use-campaign-templates.ts` - TanStack Query hook for fetching templates
- `src/app/api/campaign-templates/route.ts` - API route for templates
- `src/components/campaigns/TemplateCard.tsx` - Template card component
- `src/components/campaigns/TemplatePreview.tsx` - Template preview component
- `src/components/campaigns/TemplateSelector.tsx` - Template selector component
- `__tests__/unit/components/campaigns/TemplateCard.test.tsx` - Unit tests (18)
- `__tests__/unit/components/campaigns/TemplatePreview.test.tsx` - Unit tests (19)
- `__tests__/unit/components/campaigns/TemplateSelector.test.tsx` - Unit tests (17)
- `__tests__/unit/hooks/use-campaign-templates.test.tsx` - Hook tests (11)
- `__tests__/integration/campaign-templates.test.tsx` - Integration tests (15)

**Modified Files:**
- `src/components/campaigns/AICampaignWizard.tsx` - Added template steps and flow
- `src/components/campaigns/index.ts` - Added exports for new components
- `src/components/builder/BuilderHeader.tsx` - Added template indicator badge
- `src/stores/use-builder-store.ts` - Added templateName state and setTemplateName action
- `src/types/index.ts` - Added export for campaign-template types

### Change Log

- 2026-02-03: Story 6.13 implementation complete - Smart Campaign Templates with 80 tests passing
- 2026-02-03: Code Review - Fixed 3 MEDIUM issues (TypeScript mock types), 1 LOW issue (accent in "Sequência")

### Senior Developer Review (AI)

**Review Date:** 2026-02-03
**Reviewer:** Claude Opus 4.5 (Code Review Workflow)
**Outcome:** ✅ APPROVED (with fixes applied)

**Issues Found:** 0 CRITICAL, 3 MEDIUM, 2 LOW

**MEDIUM Issues (FIXED):**
1. `TemplateSelector.test.tsx:105` - Mock incompleto do `useCampaignTemplates` → Criado helper `createMockQueryResult()` com todas propriedades do UseQueryResult
2. `TemplateSelector.test.tsx:191,206,221` - Mesmos mocks incompletos → Atualizados para usar o helper
3. `6-13-smart-campaign-templates.md:225` - Migration number incorreto no exemplo (00027 → 00031) → Corrigido

**LOW Issues (FIXED):**
1. `TemplatePreview.tsx:105` - "Sequencia" → "Sequência" → Corrigido

**LOW Issues (NOT FIXED - by design):**
2. Hardcoded UI strings - Aceito como está; i18n será implementado em story futura

**Verification:**
- ✅ 80/80 testes passando
- ✅ ESLint sem erros
- ✅ TypeScript sem erros nos arquivos da story
- ✅ Todas as ACs implementadas
- ✅ Todas as tasks completadas
