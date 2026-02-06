# Story 6.5: Campaign Product Context

Status: done

## Story

As a user,
I want to link a specific product to each campaign,
So that AI generates texts contextualized for that product.

## Acceptance Criteria

### AC #1: Product Dropdown in Campaign Builder
**Given** I am in the campaign builder (edit page)
**When** I view the campaign header/settings area
**Then** I see a "Produto" dropdown field
**And** the dropdown shows:
  - "Contexto Geral" (default - uses company knowledge base)
  - List of products from Product Catalog (Story 6.4)
**And** the field has tooltip: "Selecione um produto para contextualizar os textos desta campanha"

### AC #2: Save Product Selection
**Given** I select a product for the campaign
**When** the selection is saved
**Then** the builder shows indicator: "Contexto: [Product Name]"
**And** the campaign record is updated with product_id
**And** subsequent AI generations will use this product's context

### AC #3: AI Uses Product Context
**Given** a campaign has a product selected
**When** AI generates text (subject, body, icebreaker)
**Then** the prompt includes:
  - Product name and description
  - Product features and differentials
  - Product target audience
**And** these REPLACE the generic company product description
**And** company name, tone of voice, and ICP still apply
**And** generated text is specific to that product

### AC #4: General Context Fallback
**Given** a campaign has "Contexto Geral" selected (or no product)
**When** AI generates text
**Then** behavior is unchanged from current implementation
**And** uses knowledge base company description

### AC #5: Product Change Warning
**Given** I want to change the product mid-campaign
**When** I select a different product
**Then** existing generated texts are NOT automatically regenerated
**And** I see warning: "Textos existentes nao serao alterados. Regenere manualmente se necessario."
**And** new generations use the new product context

### AC #6: Database Migration
**Given** the campaigns table exists
**When** migration runs
**Then** product_id column is added as nullable FK to products table
**And** ON DELETE SET NULL ensures campaigns remain if product deleted
**And** existing campaigns have product_id = NULL

## Tasks / Subtasks

- [x] Task 1: Database Migration (AC: #6)
  - [x] 1.1 Create migration `00025_add_product_id_to_campaigns.sql`
  - [x] 1.2 Add `product_id UUID` column to campaigns (nullable)
  - [x] 1.3 Add FK constraint: `REFERENCES products(id) ON DELETE SET NULL`
  - [x] 1.4 Create index on product_id for JOIN performance

- [x] Task 2: Type Definitions (AC: #1, #2)
  - [x] 2.1 Update `src/types/campaign.ts` - add productId to Campaign/CampaignWithCount
  - [x] 2.2 Update transform function to map product_id -> productId
  - [x] 2.3 Update Zod schemas - add optional productId to updateCampaignSchema
  - [x] 2.4 Add ProductContext type to campaign types (or import from product.ts)

- [x] Task 3: API Routes Update (AC: #2, #4)
  - [x] 3.1 Update `GET /api/campaigns` - include product_id in response
  - [x] 3.2 Update `GET /api/campaigns/[campaignId]` - include product_id
  - [x] 3.3 Update `PATCH /api/campaigns/[campaignId]` - accept productId in body
  - [x] 3.4 Optional: Add product name to GET response (JOIN with products)

- [x] Task 4: Products for Campaign Hook (AC: #1)
  - [x] 4.1 Create or extend hook to fetch products for dropdown
  - [x] 4.2 Can reuse `useProducts()` from use-products.ts (Story 6.4)

- [x] Task 5: Campaign Hooks Update (AC: #2)
  - [x] 5.1 Update `useSaveCampaign` to include productId in PATCH payload
  - [x] 5.2 Update `useCampaign` to return productId in data

- [x] Task 6: Builder Store Update (AC: #2)
  - [x] 6.1 Add `productId: string | null` to BuilderState
  - [x] 6.2 Add `setProductId(id: string | null)` action
  - [x] 6.3 Add `productName: string | null` for display (optional cache)
  - [x] 6.4 Update hasChanges when productId changes

- [x] Task 7: Product Selector Component (AC: #1, #5)
  - [x] 7.1 Create `src/components/builder/ProductSelector.tsx`
  - [x] 7.2 Implement dropdown with "Contexto Geral" + products list
  - [x] 7.3 Add tooltip with explanation
  - [x] 7.4 Show current selection as "Contexto: [Name]" indicator
  - [x] 7.5 Add warning toast when changing product with existing content

- [x] Task 8: BuilderHeader Integration (AC: #1, #2)
  - [x] 8.1 Add ProductSelector to BuilderHeader.tsx
  - [x] 8.2 Position before lead count or in settings section
  - [x] 8.3 Wire to store and save mechanism

- [x] Task 9: PromptManager Product Context (AC: #3, #4)
  - [x] 9.1 Update `src/lib/ai/prompt-manager.ts` - add method to get product context
  - [x] 9.2 Create `buildProductContext(productId)` that fetches product data
  - [x] 9.3 Modify `buildKnowledgeBaseContext` to accept optional product override
  - [x] 9.4 Update prompt variable replacement to include product fields

- [x] Task 10: AI Generation Integration (AC: #3, #4)
  - [x] 10.1 Update `use-ai-generate.ts` to pass productId to generation endpoint
  - [x] 10.2 Update `/api/ai/generate/route.ts` to fetch product if productId provided
  - [x] 10.3 Pass product context to PromptManager in generation flow
  - [x] 10.4 Ensure email_subject_generation uses product context
  - [x] 10.5 Ensure email_body_generation uses product context

- [x] Task 11: Edit Page Integration (AC: #2)
  - [x] 11.1 Update `campaigns/[campaignId]/edit/page.tsx` to load productId
  - [x] 11.2 Initialize store with productId from campaign data
  - [x] 11.3 Include productId in save payload

- [x] Task 12: Unit Tests (AC: #1-#6)
  - [x] 12.1 Test campaign types with productId
  - [x] 12.2 Test API routes with productId CRUD
  - [x] 12.3 Test builder store productId state management
  - [x] 12.4 Test ProductSelector component
  - [x] 12.5 Test PromptManager product context building
  - [x] 12.6 Test AI generation with/without product context
  - [x] 12.7 Test product change warning behavior

## Dev Notes

### Story 6.4 Foundation - ALREADY IMPLEMENTED

**CRITICAL:** Story 6.4 created the Product Catalog with full CRUD. This story links products to campaigns and integrates with AI generation.

**Products Table:** `supabase/migrations/00024_create_products.sql`
```sql
products (id, tenant_id, name, description, features, differentials, target_audience, ...)
```

**Products Hook:** `src/hooks/use-products.ts`
- `useProducts()` - fetches all tenant products (reuse for dropdown)

### Current Campaign Builder Structure

**BuilderHeader.tsx** location and patterns:
- File: `src/components/builder/BuilderHeader.tsx`
- Contains: campaign name, status badge, lead count, preview, save buttons
- Uses: `useBuilderStore()` for state, `useSaveCampaign()` for persistence

**Product Selector should be added:**
- Position: After campaign name, before lead count (or in a "settings row")
- Width: ~200px dropdown
- Default: "Contexto Geral"

### Database Migration

**File:** `supabase/migrations/00025_add_product_id_to_campaigns.sql`

```sql
-- Add product_id column to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- Create index for JOIN performance
CREATE INDEX idx_campaigns_product_id ON public.campaigns(product_id);

-- Add comment
COMMENT ON COLUMN public.campaigns.product_id IS
  'Optional product context for AI-generated content. NULL means use general company context.';
```

### Type Updates

**File:** `src/types/campaign.ts`

```typescript
// Add to CampaignRow
export interface CampaignRow {
  // ... existing fields
  product_id: string | null;
}

// Add to Campaign
export interface Campaign {
  // ... existing fields
  productId: string | null;
}

// Add to CampaignWithCount
export interface CampaignWithCount extends Campaign {
  leadCount: number;
  productName?: string | null;  // Optional: from JOIN
}

// Update transform
export function transformCampaignRow(row: CampaignRow): Campaign {
  return {
    // ... existing transforms
    productId: row.product_id,
  };
}

// Update Zod schema
export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  productId: z.string().uuid().nullable().optional(),  // NEW
});
```

### Builder Store Update

**File:** `src/stores/use-builder-store.ts`

```typescript
interface BuilderState {
  // ... existing fields
  productId: string | null;
  productName: string | null;  // For display without refetch
}

interface BuilderActions {
  // ... existing actions
  setProductId: (id: string | null, name?: string | null) => void;
}

// In store implementation
setProductId: (id, name = null) => set((state) => ({
  productId: id,
  productName: name,
  hasChanges: true,  // Mark as changed
})),
```

### ProductSelector Component

**File:** `src/components/builder/ProductSelector.tsx`

```typescript
import { useProducts } from "@/hooks/use-products";
import { useBuilderStore } from "@/stores/use-builder-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";

const GENERAL_CONTEXT_VALUE = "__general__";

export function ProductSelector() {
  const { productId, setProductId, blocks } = useBuilderStore();
  const { data: products, isLoading } = useProducts();

  const hasContent = blocks.some(
    b => b.type === "email" && (b.data.subject || b.data.body)
  );

  const handleChange = (value: string) => {
    const newProductId = value === GENERAL_CONTEXT_VALUE ? null : value;
    const product = products?.find(p => p.id === value);

    if (hasContent && productId !== newProductId) {
      toast.warning(
        "Textos existentes nao serao alterados. Regenere manualmente se necessario."
      );
    }

    setProductId(newProductId, product?.name ?? null);
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={productId ?? GENERAL_CONTEXT_VALUE}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Contexto Geral" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GENERAL_CONTEXT_VALUE}>
            Contexto Geral
          </SelectItem>
          {products?.map((product) => (
            <SelectItem key={product.id} value={product.id}>
              {product.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">
          Selecione um produto para contextualizar os textos desta campanha.
          A IA usara as informacoes do produto selecionado.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
```

### PromptManager Product Context

**File:** `src/lib/ai/prompt-manager.ts`

Current method: `buildKnowledgeBaseContext(tenantId)` returns company info.

**New approach:**
```typescript
interface ProductContext {
  name: string;
  description: string;
  features: string | null;
  differentials: string | null;
  targetAudience: string | null;
}

async buildKnowledgeBaseContext(
  tenantId: string,
  productId?: string | null
): Promise<string> {
  // 1. Always get tenant knowledge base (company, tone, ICP)
  const kbContext = await this.getKnowledgeBase(tenantId);

  // 2. If productId provided, replace product section
  if (productId) {
    const product = await this.getProduct(productId);
    if (product) {
      // Replace generic company products with specific product
      return this.mergeProductIntoContext(kbContext, product);
    }
  }

  // 3. Return standard knowledge base context
  return kbContext;
}

private mergeProductIntoContext(
  baseContext: string,
  product: ProductContext
): string {
  // Build product section
  const productSection = `
## Produto em Foco: ${product.name}

${product.description}

${product.features ? `### Caracteristicas\n${product.features}` : ''}

${product.differentials ? `### Diferenciais\n${product.differentials}` : ''}

${product.targetAudience ? `### Publico-Alvo\n${product.targetAudience}` : ''}
`;

  // Insert product section, replacing generic products mention
  return baseContext.replace(
    /## Produtos.*?(?=##|$)/s,
    productSection
  );
}
```

### AI Generation Flow Update

**File:** `src/hooks/use-ai-generate.ts`

```typescript
export function useAIGenerate() {
  const { productId } = useBuilderStore();

  return useMutation({
    mutationFn: async ({ promptKey, variables }) => {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptKey,
          variables,
          productId,  // NEW: pass product context
        }),
      });
      // ...
    },
  });
}
```

**File:** `src/app/api/ai/generate/route.ts`

```typescript
export async function POST(request: Request) {
  const { promptKey, variables, productId } = await request.json();

  // Get knowledge base context (with optional product override)
  const kbContext = await promptManager.buildKnowledgeBaseContext(
    tenantId,
    productId  // NEW: pass product ID
  );

  // Continue with generation...
}
```

### Edit Page Update

**File:** `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx`

```typescript
// In useEffect that loads campaign data
useEffect(() => {
  if (campaign) {
    setLocalName(campaign.name);
    builderStore.setProductId(campaign.productId, campaign.productName);
  }
}, [campaign]);

// In handleSave
const handleSave = async () => {
  await saveCampaign({
    ...(localName !== campaign?.name && { name: localName }),
    ...(builderStore.productId !== campaign?.productId && {
      productId: builderStore.productId
    }),
    blocks: builderStore.blocks,
  });
};
```

### Project Structure Notes

**New Files:**
```
supabase/migrations/
  00025_add_product_id_to_campaigns.sql

src/components/builder/
  ProductSelector.tsx

__tests__/unit/
  components/builder/
    ProductSelector.test.tsx
  lib/ai/
    prompt-manager-product.test.ts  (or extend existing)
```

**Modified Files:**
```
src/types/campaign.ts                              - Add productId
src/stores/use-builder-store.ts                    - Add productId state
src/hooks/use-ai-generate.ts                       - Pass productId
src/lib/ai/prompt-manager.ts                       - Product context method
src/app/api/ai/generate/route.ts                   - Accept productId
src/app/api/campaigns/route.ts                     - Include product_id
src/app/api/campaigns/[campaignId]/route.ts        - Accept/return productId
src/components/builder/BuilderHeader.tsx           - Add ProductSelector
src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx - Handle productId
```

### Testing Strategy

**Unit Tests:**
1. Campaign types with productId transform
2. ProductSelector - renders options, handles change, shows warning
3. Builder store - setProductId, hasChanges tracking
4. PromptManager - buildKnowledgeBaseContext with/without product
5. API routes - PATCH with productId, GET returns productId

**Test Patterns (from Story 6.4):**
- Mock TanStack Query with wrapper
- Use `userEvent` for interactions
- Mock fetch with `vi.fn()`
- Test toast notifications with mock

### Technical Constraints

1. **Naming:** snake_case (product_id in DB), camelCase (productId in code)
2. **RLS:** Product_id FK doesn't need separate RLS - campaigns already have tenant RLS
3. **Messages:** All user-facing messages in Portuguese
4. **Null handling:** product_id = NULL means "Contexto Geral"
5. **ON DELETE SET NULL:** If product is deleted, campaigns keep working with general context

### Dependencies

- **Story 6.4** (done): Product Catalog CRUD - products table and hooks
- **Story 6.3** (done): Knowledge Base Integration - PromptManager foundation
- **Story 6.2** (done): AI Text Generation - use-ai-generate hook

### Future Stories Impact

- **Story 6.6** (Personalized Icebreakers): Will use product context for icebreaker generation
- **Stories 6.8-6.10** (Regeneration, Tone, Examples): Will inherit product context automatically
- **Story 6.11** (AI Campaign Structure): Will include product selector in wizard

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming-Patterns]
- [Source: _bmad-output/implementation-artifacts/6-4-product-catalog-crud.md - Product types]
- [Source: src/components/builder/BuilderHeader.tsx - Header pattern]
- [Source: src/stores/use-builder-store.ts - Store pattern]
- [Source: src/lib/ai/prompt-manager.ts - Context building]
- [Source: src/hooks/use-ai-generate.ts - Generation hook]
- [Source: supabase/migrations/00024_create_products.sql - Products schema]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

N/A

### Completion Notes List

1. **Database Migration (Task 1):** Created `00025_add_product_id_to_campaigns.sql` with nullable FK column, ON DELETE SET NULL constraint, and performance index.

2. **Type Definitions (Task 2):** Updated Campaign/CampaignWithCount interfaces with productId/productName. Added productId to updateCampaignSchema with nullable UUID validation.

3. **API Routes (Task 3):** Updated PATCH endpoint to accept productId. Added products JOIN to GET endpoints for product name display.

4. **Product Context Service (Task 9):** Extended `knowledge-base-context.ts` with `buildProductVariables()` and updated `buildAIVariables()` to accept optional Product parameter.

5. **AI Generation (Task 10):** Updated `/api/ai/generate/route.ts` to fetch product by ID and merge product variables into prompt context. Updated `use-ai-generate.ts` to pass productId from builder store.

6. **ProductSelector Component (Task 7):** Created dropdown with "Contexto Geral" default, product list from useProducts hook, tooltip, context indicator, and AC #5 warning toast.

7. **Test Fixes:** Updated BuilderHeader.test.tsx mock to handle ProductSelector's store requirements. Fixed pre-existing test expectation in campaigns-id.test.ts (error message mismatch).

8. **Tests Created:** 51 new tests across ProductSelector.test.tsx (12 tests), knowledge-base-context-product.test.ts (10 tests), and updated BuilderHeader.test.tsx (29 tests).

9. **Pre-existing Issues:** LoginPage.test.tsx has a flaky test that fails intermittently in full suite but passes in isolation (race condition unrelated to Story 6.5).

10. **Bug Fix - {{else}} Support (Post-Implementation):** Fixed critical bug in `PromptManager.interpolateTemplate()` where `{{else}}` clauses in Handlebars-style templates were not supported. The AI prompts in `ai_prompts` table use `{{#if product_name}}...{{else}}...{{/if}}` syntax for product context fallback, but the original regex only handled `{{#if}}...{{/if}}` without the else branch. Updated regex from `/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g` to `/\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g` to capture optional else content. Added 6 new tests covering all {{else}} scenarios.

11. **Code Review Fixes (CR-6.5):** Removed debug `console.log` from `/api/ai/generate/route.ts` that was left after testing. Added missing `00026_update_prompts_product_context.sql` migration to File List documentation.

### File List

**New Files:**
- `supabase/migrations/00025_add_product_id_to_campaigns.sql` - Database migration (product_id column)
- `supabase/migrations/00026_update_prompts_product_context.sql` - Update AI prompts with product context variables
- `src/components/builder/ProductSelector.tsx` - Product dropdown component
- `__tests__/unit/components/builder/ProductSelector.test.tsx` - ProductSelector tests
- `__tests__/unit/lib/services/knowledge-base-context-product.test.ts` - Product context tests

**Modified Files:**
- `src/types/campaign.ts` - Added productId to interfaces and schemas
- `src/stores/use-builder-store.ts` - Added productId/productName state and setProductId action
- `src/lib/services/knowledge-base-context.ts` - Added product context building
- `src/hooks/use-ai-generate.ts` - Pass productId to API
- `src/app/api/ai/generate/route.ts` - Fetch product and merge context
- `src/app/api/campaigns/route.ts` - Include product_id in GET
- `src/app/api/campaigns/[campaignId]/route.ts` - Accept/return productId in PATCH/GET
- `src/components/builder/BuilderHeader.tsx` - Added ProductSelector component
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` - Load/save productId
- `__tests__/unit/components/builder/BuilderHeader.test.tsx` - Updated mocks for ProductSelector
- `__tests__/unit/components/campaigns/CampaignCard.test.tsx` - Added productId to mocks
- `__tests__/unit/components/campaigns/CampaignList.test.tsx` - Added productId to mocks
- `__tests__/unit/api/campaigns-id.test.ts` - Fixed error message expectation
- `src/lib/ai/prompt-manager.ts` - Added {{else}} support in interpolateTemplate (bug fix)
- `__tests__/unit/lib/ai/prompt-manager.test.ts` - Added 6 tests for {{else}} fallback scenarios

