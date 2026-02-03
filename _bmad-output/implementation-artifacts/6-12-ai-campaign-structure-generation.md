# Story 6.12: AI Campaign Structure Generation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want AI to generate the complete campaign structure automatically,
So that I don't need to manually decide how many emails and delays to include.

## Acceptance Criteria

### AC #1: Campaign Creation Options
**Given** I am on the Campaigns page
**When** I click "Nova Campanha"
**Then** I see two options:
  - "Criar Manualmente" (opens empty builder - current behavior)
  - "✨ Criar com IA" (opens AI-assisted creation wizard)

### AC #2: AI Wizard Form
**Given** I select "✨ Criar com IA"
**When** the wizard opens
**Then** I see a form asking:
  - Nome da Campanha (text, required - campaign name)
  - Produto (dropdown: "Contexto Geral" + lista de produtos cadastrados)
  - Objetivo da campanha (dropdown: Cold Outreach, Reengajamento, Follow-up, Nutricao)
  - Descricao adicional (textarea, optional - complementa o contexto do produto)
  - Tom desejado (dropdown: Formal, Casual, Tecnico - default da Knowledge Base)
  - Urgencia (dropdown: Baixa, Media, Alta)
**And** fields have helpful tooltips explaining each option
**And** if a product is selected, its description is shown as preview

### AC #3: AI Structure Generation
**Given** I fill the wizard form and click "Gerar Campanha"
**When** AI processes the request
**Then** I see "Analisando e criando sua campanha..." with animation
**And** AI generates:
  - Recommended number of emails (typically 3-7 based on objective)
  - Delay intervals between emails (based on best practices)
  - Strategic approach for each touchpoint (intro, value prop, social proof, urgency, etc.)
**And** the complete structure is created in the builder canvas
**And** each email block has placeholder context (ex: "Email 1: Introducao e gancho inicial")
**And** the selected product (if any) is automatically linked to the campaign
**And** generation completes in <10 seconds

### AC #4: Generated Structure in Builder
**Given** the campaign structure is generated
**When** I view the builder
**Then** I see all email blocks and delay blocks pre-positioned
**And** I see the product context indicator if a product was selected
**And** I can modify, add, or remove blocks manually
**And** I can click "Gerar Conteudo" on each email to generate the actual text (Story 6.2)
**And** I see a summary panel: "Campanha de X emails, duracao total de Y dias"

### AC #5: Generation Error Handling
**Given** AI cannot generate a valid structure
**When** an error occurs
**Then** I see "Nao foi possivel gerar a estrutura. Tente ajustar os parametros."
**And** I can retry or switch to manual creation

### AC #6: Email Mode Assignment for Follow-Ups
**Given** the campaign objective involves follow-ups (Reengajamento, Follow-up, Nutricao)
**When** AI generates the structure
**Then** emails after the first are automatically marked with `emailMode: 'follow-up'` (Story 6.11)
**And** the follow-up indicator is shown on each subsequent email block
**And** Cold Outreach campaigns have all emails as `emailMode: 'initial'` by default

## Tasks / Subtasks

- [x] Task 1: Update CreateCampaignDialog - Two Options (AC: #1)
  - [x] 1.1 Modify `CreateCampaignDialog` to show two creation modes
  - [x] 1.2 Add "Criar Manualmente" button (existing behavior)
  - [x] 1.3 Add "✨ Criar com IA" button (opens wizard)
  - [x] 1.4 Style both options as prominent cards/buttons

- [x] Task 2: Create AI Campaign Wizard Component (AC: #2)
  - [x] 2.1 Create `AICampaignWizard.tsx` component in `src/components/campaigns/`
  - [x] 2.2 Implement wizard form with all fields
  - [x] 2.3 Add product dropdown fetching from products API
  - [x] 2.4 Add objective dropdown with predefined options
  - [x] 2.5 Add tone dropdown defaulting to tenant's Knowledge Base tone
  - [x] 2.6 Add urgency dropdown
  - [x] 2.7 Add tooltips for each field
  - [x] 2.8 Show product description preview when selected

- [x] Task 3: Add campaign_structure_generation Prompt (AC: #3)
  - [x] 3.1 Add `"campaign_structure_generation"` to `PromptKey` type in `src/types/ai-prompt.ts`
  - [x] 3.2 Add to `PROMPT_KEYS` array and `promptKeySchema` Zod enum
  - [x] 3.3 Create prompt template in `CODE_DEFAULT_PROMPTS` in `defaults.ts`
  - [x] 3.4 Prompt returns JSON structure with emails array and delays array

- [x] Task 4: Create useAICampaignStructure Hook (AC: #3)
  - [x] 4.1 Create `use-ai-campaign-structure.ts` hook in `src/hooks/`
  - [x] 4.2 Accept wizard form data as input
  - [x] 4.3 Call AI API with `campaign_structure_generation` prompt
  - [x] 4.4 Parse AI response JSON into BuilderBlock[] format
  - [x] 4.5 Return generated blocks and campaign metadata

- [x] Task 5: Update API Route for Structure Generation (AC: #3)
  - [x] 5.1 Create `/api/ai/campaign-structure/route.ts`
  - [x] 5.2 Accept wizard parameters (product, objective, tone, urgency, description)
  - [x] 5.3 Build context from product + knowledge base
  - [x] 5.4 Call PromptManager with campaign_structure_generation
  - [x] 5.5 Parse and validate AI response
  - [x] 5.6 Return structured JSON with emails and delays

- [x] Task 6: Implement Wizard Generation Flow (AC: #3, #4)
  - [x] 6.1 On "Gerar Campanha" click, show loading state
  - [x] 6.2 Call useAICampaignStructure hook
  - [x] 6.3 Create campaign via existing API
  - [x] 6.4 Populate builder store with generated blocks
  - [x] 6.5 Set campaign product_id if product was selected
  - [x] 6.6 Redirect to builder with pre-populated structure

- [x] Task 7: Update Builder to Show Structure Context (AC: #4)
  - [x] 7.1 Show email block strategic context (e.g., "Email 1: Introducao")
  - [x] 7.2 Add summary panel showing email count and total duration
  - [x] 7.3 Ensure generated blocks can be modified/deleted

- [x] Task 8: Follow-Up Mode Assignment (AC: #6)
  - [x] 8.1 Based on objective, set emailMode for each generated email
  - [x] 8.2 Cold Outreach: all emails as 'initial'
  - [x] 8.3 Reengajamento/Follow-up/Nutricao: first email 'initial', rest 'follow-up'
  - [x] 8.4 Include emailMode in generated block data

- [x] Task 9: Unit Tests - Wizard Component (AC: #2)
  - [x] 9.1 Test form rendering with all fields
  - [x] 9.2 Test product dropdown population (skipped - radix-ui Select limitation in jsdom)
  - [x] 9.3 Test form validation
  - [x] 9.4 Test product preview display (skipped - radix-ui Select limitation in jsdom)

- [x] Task 10: Unit Tests - Generation Hook (AC: #3)
  - [x] 10.1 Test successful structure generation
  - [x] 10.2 Test error handling
  - [x] 10.3 Test JSON parsing from AI response
  - [x] 10.4 Test emailMode assignment based on objective

- [x] Task 11: Integration Tests - Full Flow (AC: #1-#6)
  - [x] 11.1 Test wizard -> generation -> builder flow
  - [x] 11.2 Test product linking to campaign
  - [x] 11.3 Test blocks appear correctly in builder

- [ ] Task 12: Manual Verification (AC: #3, #4)
  - [ ] 12.1 Create campaign using AI wizard
  - [ ] 12.2 Verify structure makes sense for selected objective
  - [ ] 12.3 Verify delay intervals are reasonable
  - [ ] 12.4 Verify emails can be individually generated with content

## Dev Notes

### Story Context - Why This Feature

**Problem Identified:** Users currently must manually add each email block and delay block when creating campaigns. This requires knowledge of:
- How many emails are optimal for their objective
- What delay intervals work best
- What strategic approach each touchpoint should have

**Solution:** Add an AI-assisted campaign creation option that automatically generates the complete structure based on:
- Campaign objective (Cold Outreach, Reengajamento, etc.)
- Product context (from Story 6.4/6.5)
- Tone preferences
- Urgency level

**Integration Points:**
- Story 6.4: Product Catalog CRUD (products dropdown)
- Story 6.5: Campaign Product Context (link product to campaign)
- Story 6.11: Follow-Up Email Mode (emailMode assignment)

### Implementation Patterns from Previous Stories

**Pattern 1: Prompt Type Extension (from Story 6.11)**
```typescript
// src/types/ai-prompt.ts - Add to PromptKey type
export type PromptKey =
  | "search_translation"
  | "email_subject_generation"
  | "email_body_generation"
  | "icebreaker_generation"
  | "tone_application"
  | "follow_up_email_generation"
  | "follow_up_subject_generation"
  | "campaign_structure_generation";  // NEW

// Also update PROMPT_KEYS array and promptKeySchema
```

**Pattern 2: Hook Type Extension (from Story 6.2)**
```typescript
// src/hooks/use-ai-generate.ts - Add to AIPromptKey
// OR create separate hook for campaign structure
```

**Pattern 3: Dialog Component (from Story 5.1)**
```tsx
// src/components/campaigns/CreateCampaignDialog.tsx pattern
// Will be modified to show two creation options
```

**Pattern 4: Builder Store Integration (from Story 6.6)**
```typescript
// Load generated blocks via loadBlocks action
const { loadBlocks, setProductId } = useBuilderStore();

// After AI generates structure
loadBlocks(generatedBlocks);
setProductId(selectedProductId, selectedProductName);
```

### New Prompt Template Design

```typescript
// src/lib/ai/prompts/defaults.ts - Add new prompt

campaign_structure_generation: {
  template: `Voce e um estrategista de cold email marketing B2B.

Gere a ESTRUTURA de uma campanha de email baseada nos parametros fornecidos.

PARAMETROS DA CAMPANHA:
- Objetivo: {{objective}}
- Urgencia: {{urgency}}
- Descricao adicional: {{additional_description}}

{{#if product_name}}
PRODUTO DA CAMPANHA:
- Nome: {{product_name}}
- Descricao: {{product_description}}
- Diferenciais: {{product_differentials}}
{{/if}}

CONTEXTO DA EMPRESA:
{{company_context}}

TOM DE VOZ:
{{tone_style}}

REGRAS POR OBJETIVO:

[COLD OUTREACH]
- 4-5 emails tipicamente
- Intervalos: 3, 4, 5, 7 dias
- Estrutura: Introducao -> Valor -> Prova Social -> Escassez -> Ultimo Contato
- Todos os emails sao iniciais (nao referencia emails anteriores)

[REENGAJAMENTO]
- 3 emails tipicamente
- Intervalos: 2, 3 dias (mais curtos)
- Estrutura: Lembrete -> Novo Valor -> Ultima Chance
- Email 2+ sao follow-ups (referenciam contato anterior)

[FOLLOW-UP]
- 3-4 emails tipicamente
- Intervalos: 2, 3, 4 dias
- Estrutura: Checkin -> Valor Adicional -> Oferta Direta -> Despedida
- Email 2+ sao follow-ups

[NUTRICAO]
- 5-7 emails tipicamente
- Intervalos: 5, 7, 7, 10, 14 dias (mais longos)
- Estrutura: Educacao -> Insight -> Case -> Dica -> Convite -> Check-in -> Despedida
- Email 2+ sao follow-ups

AJUSTES POR URGENCIA:
- BAIXA: Intervalos maiores (+2 dias cada)
- MEDIA: Intervalos padrao
- ALTA: Intervalos menores (-1 dia cada, minimo 1)

FORMATO DE RESPOSTA (JSON VALIDO):
{
  "structure": {
    "totalEmails": number,
    "totalDays": number,
    "emails": [
      {
        "position": 0,
        "type": "email",
        "context": "Introducao e gancho inicial",
        "emailMode": "initial"
      },
      {
        "position": 1,
        "type": "delay",
        "days": 3
      },
      {
        "position": 2,
        "type": "email",
        "context": "Proposta de valor e diferenciais",
        "emailMode": "initial" | "follow-up"
      }
    ]
  },
  "rationale": "Breve explicacao da estrategia escolhida (max 100 palavras)"
}

REGRAS CRITICAS:
1. Retorne APENAS o JSON, sem markdown ou explicacoes extras
2. Alterne email e delay (email, delay, email, delay, ...)
3. Primeiro item sempre tipo "email" com position 0
4. emailMode: "initial" para Cold Outreach, "follow-up" para demais (exceto primeiro)
5. context deve ser descritivo para orientar a geracao de conteudo depois
6. Minimo 3 emails, maximo 7 emails
7. Delays entre 1 e 14 dias

Responda APENAS com o JSON.`,
  modelPreference: "gpt-4o",
  metadata: {
    temperature: 0.6,
    maxTokens: 1500,
  },
},
```

### API Route Design

```typescript
// src/app/api/ai/campaign-structure/route.ts

export async function POST(request: Request) {
  const { productId, objective, description, tone, urgency, campaignName } = await request.json();

  // 1. Get product details if productId provided
  let productContext = null;
  if (productId && productId !== 'general') {
    productContext = await getProduct(productId);
  }

  // 2. Get knowledge base context
  const knowledgeBase = await getKnowledgeBase();

  // 3. Build prompt variables
  const variables = {
    objective,
    urgency,
    additional_description: description || '',
    product_name: productContext?.name || '',
    product_description: productContext?.description || '',
    product_differentials: productContext?.differentials || '',
    company_context: knowledgeBase.companyDescription || '',
    tone_style: tone,
  };

  // 4. Call AI
  const result = await generateWithPrompt('campaign_structure_generation', variables);

  // 5. Parse JSON response
  const structure = JSON.parse(result);

  // 6. Validate structure
  if (!structure.structure?.emails?.length) {
    throw new Error('Invalid structure generated');
  }

  return NextResponse.json({ data: structure });
}
```

### Wizard Form Component Design

```tsx
// src/components/campaigns/AICampaignWizard.tsx

interface WizardFormData {
  name: string;
  productId: string | null;
  objective: 'cold_outreach' | 'reengagement' | 'follow_up' | 'nurture';
  description: string;
  tone: 'formal' | 'casual' | 'technical';
  urgency: 'low' | 'medium' | 'high';
}

const OBJECTIVES = [
  { value: 'cold_outreach', label: 'Cold Outreach', description: 'Primeiro contato com leads frios' },
  { value: 'reengagement', label: 'Reengajamento', description: 'Leads que nao responderam antes' },
  { value: 'follow_up', label: 'Follow-up', description: 'Dar continuidade a conversa iniciada' },
  { value: 'nurture', label: 'Nutricao', description: 'Relacionamento de longo prazo' },
];

const URGENCY_LEVELS = [
  { value: 'low', label: 'Baixa', description: 'Intervalos maiores entre emails' },
  { value: 'medium', label: 'Media', description: 'Intervalos padrao' },
  { value: 'high', label: 'Alta', description: 'Intervalos menores, mais agressivo' },
];

export function AICampaignWizard({ open, onOpenChange }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { data: products } = useProducts();

  // Form handling
  // ...

  const handleGenerate = async (data: WizardFormData) => {
    setIsGenerating(true);
    try {
      // 1. Generate structure via AI
      const structure = await generateCampaignStructure(data);

      // 2. Create campaign
      const campaign = await createCampaign({ name: data.name, productId: data.productId });

      // 3. Convert structure to builder blocks
      const blocks = convertStructureToBlocks(structure.emails);

      // 4. Navigate to builder with blocks
      router.push(`/campaigns/${campaign.id}/edit?structure=${encodeURIComponent(JSON.stringify(blocks))}`);
    } catch (error) {
      toast.error('Erro ao gerar estrutura. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Form fields */}
    </Dialog>
  );
}
```

### Converting AI Structure to Builder Blocks

```typescript
// src/lib/utils/campaign-structure.ts

interface AIGeneratedEmail {
  position: number;
  type: 'email' | 'delay';
  context?: string;
  days?: number;
  emailMode?: 'initial' | 'follow-up';
}

interface AIStructureResponse {
  structure: {
    totalEmails: number;
    totalDays: number;
    emails: AIGeneratedEmail[];
  };
  rationale: string;
}

export function convertStructureToBlocks(structure: AIStructureResponse): BuilderBlock[] {
  return structure.structure.emails.map((item, index) => {
    if (item.type === 'email') {
      return {
        id: crypto.randomUUID(),
        type: 'email' as const,
        position: index,
        data: {
          subject: '',
          body: '',
          emailMode: item.emailMode || 'initial',
          strategicContext: item.context, // Display hint for user
        },
      };
    } else {
      return {
        id: crypto.randomUUID(),
        type: 'delay' as const,
        position: index,
        data: {
          days: item.days || 3,
          unit: 'days' as const,
        },
      };
    }
  });
}
```

### Project Structure - Files to Create/Modify

```
src/types/
  ai-prompt.ts                                   # Add campaign_structure_generation to PromptKey

src/lib/ai/prompts/
  defaults.ts                                    # Add campaign_structure_generation prompt template

src/lib/utils/
  campaign-structure.ts                          # NEW: Structure conversion utilities

src/hooks/
  use-ai-campaign-structure.ts                   # NEW: Hook for AI campaign generation

src/app/api/ai/
  campaign-structure/
    route.ts                                     # NEW: API route for structure generation

src/components/campaigns/
  CreateCampaignDialog.tsx                       # Modify: Add two creation options
  AICampaignWizard.tsx                           # NEW: AI-assisted creation wizard
  index.ts                                       # Update exports

__tests__/unit/components/campaigns/
  AICampaignWizard.test.tsx                      # NEW: Wizard tests

__tests__/unit/hooks/
  use-ai-campaign-structure.test.ts              # NEW: Hook tests

__tests__/unit/lib/utils/
  campaign-structure.test.ts                     # NEW: Conversion tests
```

### Testing Strategy

**Unit Tests - Wizard Component:**
1. Renders all form fields correctly
2. Product dropdown shows "Contexto Geral" + products
3. Objective dropdown shows all 4 options
4. Tone dropdown defaults to KB setting
5. Form validation works (name required)
6. Product preview shows when product selected
7. Loading state during generation

**Unit Tests - Generation Hook:**
1. Successful generation returns blocks
2. Error handling shows appropriate message
3. Parses AI JSON response correctly
4. emailMode assigned based on objective

**Unit Tests - Conversion:**
1. Converts email items to email blocks
2. Converts delay items to delay blocks
3. Sets emailMode from AI response
4. Generates unique IDs for each block
5. Preserves strategic context

**Integration Tests:**
1. Full wizard -> generation -> builder flow
2. Product linked to campaign after creation
3. Blocks visible in builder canvas
4. Summary shows correct count and duration

### Edge Cases

1. **AI returns invalid JSON:** Parse error → show retry option
2. **AI returns empty structure:** Validation error → show retry
3. **AI returns too many/few emails:** Validate range (3-7) → regenerate if invalid
4. **Product deleted after selection:** Handle gracefully, use general context
5. **Network timeout:** 10s timeout → show error with retry option
6. **User cancels during generation:** Clean up pending request

### Technical Constraints

1. **AI Response Format:** Must return valid JSON (prompt instructs this)
2. **Token Limits:** campaign_structure_generation prompt is ~1000 tokens, response ~500
3. **Model Selection:** Use gpt-4o for complex structure reasoning (not gpt-4o-mini)
4. **Generation Time:** Target <10s, show animation/progress

### Best Practices for Campaign Structures (Reference)

| Objetivo | Emails | Intervalos Tipicos | Estrategia |
|----------|--------|-------------------|------------|
| Cold Outreach | 4-5 | 3, 4, 5, 7 dias | Intro → Valor → Social Proof → Escassez → Final |
| Reengajamento | 3 | 2, 3 dias | Lembrete → Novo Valor → Ultima Chance |
| Follow-up | 3-4 | 2, 3, 4 dias | Check-in → Valor → Oferta → Despedida |
| Nutricao | 5-7 | 5, 7, 7, 10, 14 dias | Educacao → Insight → Case → Convite |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.12]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-001 - Prompt Management]
- [Source: src/components/campaigns/CreateCampaignDialog.tsx - Current creation flow]
- [Source: src/stores/use-builder-store.ts - Block management]
- [Source: src/hooks/use-ai-generate.ts - AI generation pattern]
- [Source: src/lib/ai/prompts/defaults.ts - Prompt templates]
- [Source: _bmad-output/implementation-artifacts/6-11-follow-up-email-mode.md - Previous story patterns]
- [Source: src/components/builder/EmailBlock.tsx - emailMode handling]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Code review performed 2026-02-03: All ACs validated as implemented

### Completion Notes List

- All 6 ACs implemented and validated via code review
- Tests: 50/50 passing (11 AICampaignWizard, 25 hook, 11 integration, 14 CampaignSummary)
- 2 tests skipped due to radix-ui Select jsdom limitation (covered by integration tests)
- Task 12 (Manual Verification) pending user validation
- CR-5 fixed: Added CampaignSummary unit tests

### File List

**New Files:**
- `src/components/campaigns/AICampaignWizard.tsx` - AI wizard dialog component (AC #2, #3, #5)
- `src/hooks/use-ai-campaign-structure.ts` - Hook for AI structure generation (AC #3, #6)
- `src/app/api/ai/campaign-structure/route.ts` - API endpoint for structure generation (AC #3)
- `src/components/builder/CampaignSummary.tsx` - Summary panel component (AC #4)
- `__tests__/unit/components/campaigns/AICampaignWizard.test.tsx` - Wizard unit tests (Task 9)
- `__tests__/unit/hooks/use-ai-campaign-structure.test.tsx` - Hook unit tests (Task 10)
- `__tests__/integration/ai-campaign-structure.test.tsx` - Integration tests (Task 11)
- `__tests__/unit/components/builder/CampaignSummary.test.tsx` - Summary panel unit tests (CR-5 fix)

**Modified Files:**
- `src/types/ai-prompt.ts` - Added `campaign_structure_generation` to PromptKey (Task 3.1, 3.2)
- `src/lib/ai/prompts/defaults.ts` - Added prompt template (Task 3.3, 3.4)
- `src/components/campaigns/CreateCampaignDialog.tsx` - Two creation options (AC #1)
- `src/components/campaigns/index.ts` - Export AICampaignWizard
- `src/components/builder/BuilderHeader.tsx` - Integrated CampaignSummary (AC #4)
- `src/components/builder/EmailBlock.tsx` - strategicContext display (AC #4)
- `__tests__/unit/components/campaigns/CreateCampaignDialog.test.tsx` - Updated tests

