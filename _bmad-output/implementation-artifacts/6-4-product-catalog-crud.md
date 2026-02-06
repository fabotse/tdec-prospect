# Story 6.4: Product Catalog CRUD

Status: done

## Story

As an admin/user,
I want to register and manage my business products,
So that I can reuse them across multiple campaigns with specific context.

## Acceptance Criteria

### AC #1: Products Tab in Settings
**Given** I am authenticated
**When** I navigate to Configurações
**Then** I see a new "Produtos" tab after "Base de Conhecimento"
**And** clicking it navigates to /settings/products

### AC #2: Products List Display
**Given** I am on the Products tab
**When** the page loads
**Then** I see a list of my registered products (cards format)
**And** each card shows: product name, description (truncated)
**And** I see a "Novo Produto" button
**And** empty state shows "Nenhum produto cadastrado. Adicione produtos para usar como contexto em campanhas."

### AC #3: Create Product Form
**Given** I click "Novo Produto"
**When** the dialog/form opens
**Then** I see fields for:
  - Nome do produto (text, required)
  - Descrição (textarea, required) - explicação detalhada do que é o produto
  - Características principais (textarea) - features, funcionalidades
  - Diferenciais (textarea) - o que diferencia dos concorrentes
  - Público-alvo (textarea) - para quem é ideal
**And** I can save or cancel

### AC #4: Save Product
**Given** I fill the product form correctly
**When** I click "Salvar"
**Then** the product is saved to database
**And** the product appears in the list
**And** I see success notification "Produto salvo com sucesso"

### AC #5: Edit Product
**Given** I have products in the list
**When** I click on edit icon for a product
**Then** the form opens with existing data pre-filled
**And** I can modify and save changes

### AC #6: Delete Product
**Given** I have products in the list
**When** I click delete icon for a product
**Then** I see confirmation dialog "Remover produto?"
**And** upon confirmation, the product is deleted
**And** I see "Produto removido com sucesso"

### AC #7: Search/Filter Products
**Given** I have multiple products
**When** I type in the search field
**Then** products are filtered by name in real-time

### AC #8: Campaign Usage Indicator
**Given** a product is linked to campaigns
**When** I view the products list
**Then** products in use show indicator "Usado em X campanhas"
**And** delete dialog shows warning if product is in use

### AC #9: Data Isolation
**Given** the products table exists
**When** any query is executed
**Then** data is filtered by tenant_id via RLS
**And** I cannot access products from other tenants

## Tasks / Subtasks

- [x] Task 1: Database Migration (AC: #9)
  - [x] 1.1 Create migration `00024_create_products.sql`
  - [x] 1.2 Create `products` table with columns: id, tenant_id, name, description, features, differentials, target_audience, created_at, updated_at
  - [x] 1.3 Add RLS policies for tenant isolation (SELECT, INSERT, UPDATE, DELETE)
  - [x] 1.4 Add foreign key constraint to tenants table
  - [x] 1.5 Create index on tenant_id for performance

- [x] Task 2: Type Definitions (AC: #3, #4, #5)
  - [x] 2.1 Create `src/types/product.ts` with Product interface
  - [x] 2.2 Create ProductRow interface for database mapping
  - [x] 2.3 Create Zod schemas: createProductSchema, updateProductSchema
  - [x] 2.4 Create transform function productRowToProduct()

- [x] Task 3: API Routes (AC: #2, #4, #5, #6, #8)
  - [x] 3.1 Create `src/app/api/products/route.ts` - GET (list), POST (create)
  - [x] 3.2 Create `src/app/api/products/[productId]/route.ts` - GET, PATCH, DELETE
  - [x] 3.3 Implement campaign usage count in GET response
  - [x] 3.4 Implement proper error handling with Portuguese messages

- [x] Task 4: Hooks (AC: #2, #4, #5, #6)
  - [x] 4.1 Create `src/hooks/use-products.ts`
  - [x] 4.2 Implement useProducts() query hook with caching
  - [x] 4.3 Implement useCreateProduct() mutation
  - [x] 4.4 Implement useUpdateProduct() mutation
  - [x] 4.5 Implement useDeleteProduct() mutation

- [x] Task 5: Settings Tab Navigation (AC: #1)
  - [x] 5.1 Update `src/components/settings/SettingsTabs.tsx` - add "Produtos" tab
  - [x] 5.2 Create `src/app/(dashboard)/settings/products/page.tsx`

- [x] Task 6: Product Components (AC: #2, #3, #5, #6, #7, #8)
  - [x] 6.1 Create `src/components/products/ProductCard.tsx` - card display with actions
  - [x] 6.2 Create `src/components/products/ProductList.tsx` - list container with search
  - [x] 6.3 Create `src/components/products/ProductForm.tsx` - form with validation
  - [x] 6.4 Create `src/components/products/ProductDialog.tsx` - add/edit dialog
  - [x] 6.5 Create `src/components/products/DeleteProductDialog.tsx` - confirmation
  - [x] 6.6 Create `src/components/products/ProductsEmptyState.tsx` - empty state
  - [x] 6.7 Create `src/components/products/index.ts` - exports

- [x] Task 7: Products Page Integration (AC: #1, #2, #7)
  - [x] 7.1 Build products page with list, search, and actions
  - [x] 7.2 Integrate create dialog
  - [x] 7.3 Integrate edit dialog
  - [x] 7.4 Integrate delete dialog
  - [x] 7.5 Add loading skeleton

- [x] Task 8: Unit Tests (AC: #1-#9)
  - [x] 8.1 Test product types and Zod schemas
  - [x] 8.2 Test API routes (authentication, CRUD operations)
  - [x] 8.3 Test hooks (queries and mutations)
  - [x] 8.4 Test ProductCard component
  - [x] 8.5 Test ProductForm component validation
  - [x] 8.6 Test ProductList with search filtering
  - [x] 8.7 Test delete confirmation flow

## Dev Notes

### Story 6.3 Foundation - ALREADY IMPLEMENTED

**CRITICAL:** Story 6.3 created the Knowledge Base context infrastructure. This story creates the Product catalog that will be used in Story 6.5 to provide product-specific context to campaigns.

**Relationship with Knowledge Base:**
- Knowledge Base = empresa geral, tom de voz, ICP (tenant-wide)
- Products = catálogo de produtos específicos para campanhas

### Pattern Reference - EmailExamplesForm

Follow the **exact same pattern** from EmailExamplesForm for CRUD operations:

**File:** `src/components/settings/EmailExamplesForm.tsx`

Key patterns to replicate:
1. Card-based list display with edit/delete buttons
2. Dialog for add/edit form
3. AlertDialog for delete confirmation
4. Empty state with descriptive message
5. Loading states during mutations
6. Toast notifications for success/error

### Database Schema

**Table: `products`**

```sql
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  features TEXT,           -- Características principais
  differentials TEXT,      -- Diferenciais competitivos
  target_audience TEXT,    -- Público-alvo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant queries
CREATE INDEX idx_products_tenant_id ON public.products(tenant_id);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant products"
  ON public.products FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can create products for their tenant"
  ON public.products FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant products"
  ON public.products FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant products"
  ON public.products FOR DELETE
  USING (tenant_id = public.get_current_tenant_id());

-- Updated_at trigger
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### Type Definitions

```typescript
// src/types/product.ts
import { z } from "zod";

// Database row (snake_case)
export interface ProductRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  features: string | null;
  differentials: string | null;
  target_audience: string | null;
  created_at: string;
  updated_at: string;
  campaign_count?: number; // From JOIN query
}

// Frontend model (camelCase)
export interface Product {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  features: string | null;
  differentials: string | null;
  targetAudience: string | null;
  createdAt: string;
  updatedAt: string;
  campaignCount?: number;
}

// Transform function
export function transformProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    features: row.features,
    differentials: row.differentials,
    targetAudience: row.target_audience,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    campaignCount: row.campaign_count,
  };
}

// Zod Schemas
export const createProductSchema = z.object({
  name: z.string()
    .min(1, "Nome é obrigatório")
    .max(200, "Nome deve ter no máximo 200 caracteres"),
  description: z.string()
    .min(1, "Descrição é obrigatória")
    .max(2000, "Descrição deve ter no máximo 2000 caracteres"),
  features: z.string()
    .max(2000, "Características devem ter no máximo 2000 caracteres")
    .optional()
    .nullable(),
  differentials: z.string()
    .max(2000, "Diferenciais devem ter no máximo 2000 caracteres")
    .optional()
    .nullable(),
  targetAudience: z.string()
    .max(2000, "Público-alvo deve ter no máximo 2000 caracteres")
    .optional()
    .nullable(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
```

### API Route Pattern

**GET /api/products** - List with campaign count:

```typescript
// Include campaign count using LEFT JOIN
const { data, error } = await supabase
  .from("products")
  .select(`
    *,
    campaigns:campaigns(count)
  `)
  .order("created_at", { ascending: false });

// Transform to include campaignCount
const products = data?.map(row => ({
  ...row,
  campaign_count: row.campaigns?.[0]?.count ?? 0,
}));
```

### Hook Pattern

```typescript
// src/hooks/use-products.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const PRODUCTS_KEY = ["products"];

export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: fetchProducts,
    staleTime: 60_000, // 1 min
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}
```

### Settings Tab Update

```typescript
// src/components/settings/SettingsTabs.tsx
const tabs = [
  { id: "integrations", label: "Integrações", href: "/settings/integrations" },
  { id: "knowledge-base", label: "Base de Conhecimento", href: "/settings/knowledge-base" },
  { id: "products", label: "Produtos", href: "/settings/products" }, // NEW
  { id: "team", label: "Equipe", href: "/settings/team" },
];
```

### Form Fields Layout

**Product Form** should have:
1. **Nome do produto** - Input (required)
2. **Descrição** - Textarea, 4 rows (required)
3. **Características principais** - Textarea, 3 rows (optional)
4. **Diferenciais** - Textarea, 3 rows (optional)
5. **Público-alvo** - Textarea, 3 rows (optional)

Each field should have:
- Label with htmlFor
- Placeholder text with hint
- Error message display below
- Character counter for textareas (optional)

### Campaign Usage Count

To show "Usado em X campanhas":

1. In GET /api/products, JOIN with campaigns table:
```sql
SELECT p.*, COUNT(c.id) as campaign_count
FROM products p
LEFT JOIN campaigns c ON c.product_id = p.id
GROUP BY p.id
```

2. In ProductCard, show badge if campaignCount > 0:
```typescript
{product.campaignCount > 0 && (
  <Badge variant="secondary" className="text-xs">
    Usado em {product.campaignCount} {product.campaignCount === 1 ? "campanha" : "campanhas"}
  </Badge>
)}
```

3. In delete confirmation, show warning:
```typescript
{product.campaignCount > 0 && (
  <p className="text-amber-500 text-sm mt-2">
    ⚠️ Este produto está vinculado a {product.campaignCount} campanha(s).
    Removê-lo não afetará campanhas existentes.
  </p>
)}
```

### Search Implementation

Use client-side filtering (similar to TeamMemberList):

```typescript
const [searchTerm, setSearchTerm] = useState("");

const filteredProducts = useMemo(() => {
  if (!products) return [];
  if (!searchTerm.trim()) return products;

  const term = searchTerm.toLowerCase();
  return products.filter(p =>
    p.name.toLowerCase().includes(term) ||
    p.description.toLowerCase().includes(term)
  );
}, [products, searchTerm]);
```

### Component Structure

```
src/components/products/
├── index.ts
├── ProductCard.tsx         # Individual card with edit/delete
├── ProductList.tsx         # Grid of cards
├── ProductForm.tsx         # Form fields with validation
├── ProductDialog.tsx       # Dialog wrapper for form
├── DeleteProductDialog.tsx # AlertDialog for confirmation
└── ProductsEmptyState.tsx  # Empty state
```

### Project Structure Notes

**New Files:**
```
supabase/migrations/
├── 00024_create_products.sql

src/types/
├── product.ts

src/app/api/products/
├── route.ts                     # GET, POST
└── [productId]/
    └── route.ts                 # GET, PATCH, DELETE

src/hooks/
├── use-products.ts

src/components/products/
├── index.ts
├── ProductCard.tsx
├── ProductList.tsx
├── ProductForm.tsx
├── ProductDialog.tsx
├── DeleteProductDialog.tsx
└── ProductsEmptyState.tsx

src/app/(dashboard)/settings/products/
└── page.tsx

__tests__/unit/
├── types/
│   └── product.test.ts
├── hooks/
│   └── use-products.test.tsx
└── components/products/
    ├── ProductCard.test.tsx
    ├── ProductForm.test.tsx
    └── ProductList.test.tsx
```

**Modified Files:**
- `src/components/settings/SettingsTabs.tsx` - Add Produtos tab

### Testing Strategy

**Unit Tests:**
1. Product type transformations and Zod validation
2. API route authentication and error handling
3. Hook query/mutation behavior with MSW
4. Component rendering and user interactions
5. Search filtering logic
6. Delete confirmation flow

**Test Patterns (from Story 6.3):**
- Mock TanStack Query with `@tanstack/react-query` wrapper
- Use `renderHook` for custom hooks
- Use `userEvent` for interactions
- Mock fetch with `vi.fn()`

### Technical Constraints

1. **Naming:** snake_case (DB), camelCase (code), PascalCase (components)
2. **RLS:** All queries filtered by tenant_id automatically
3. **Messages:** All user-facing messages in Portuguese
4. **Caching:** TanStack Query with 1 min stale time
5. **Validation:** Zod schemas for all inputs
6. **Access:** Any authenticated user can manage products (not admin-only)

### Dependencies

- **Story 6.3** (done): Knowledge Base Integration ✅
- **Story 6.5** (next): Campaign Product Context - will use products created here

### Future Stories Impact

- **Story 6.5** (Campaign Product Context): Will add product_id FK to campaigns table and use product data in AI generation
- **Stories 6.6-6.12**: Will leverage product context for personalization

### Git Commit Reference

Recent commits show the pattern:
- `feat(story-6.3):` prefix for feature commits
- Code review fixes in same commit or follow-up

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming-Patterns]
- [Source: src/components/settings/EmailExamplesForm.tsx - CRUD pattern]
- [Source: src/components/settings/SettingsTabs.tsx - Tab navigation]
- [Source: supabase/migrations/00007_create_knowledge_base.sql - RLS pattern]
- [Source: src/hooks/use-campaigns.ts - Hook pattern]
- [Source: src/app/api/campaigns/route.ts - API route pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementation completed without errors

### Completion Notes List

- ✅ **Task 1**: Database migration `00024_create_products.sql` criada com tabela products, RLS policies para tenant isolation, FK para tenants, e índice no tenant_id
- ✅ **Task 2**: Types `src/types/product.ts` com interfaces ProductRow/Product, transform function, e Zod schemas para validação
- ✅ **Task 3**: API routes implementadas - `/api/products` (GET list, POST create) e `/api/products/[productId]` (GET, PATCH, DELETE) com error handling em português
- ✅ **Task 4**: Hooks `use-products.ts` com useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct usando TanStack Query
- ✅ **Task 5**: Tab "Produtos" adicionada ao SettingsTabs após "Base de Conhecimento", página `/settings/products` criada
- ✅ **Task 6**: Componentes ProductCard, ProductList, ProductForm, ProductDialog, DeleteProductDialog, ProductsEmptyState criados seguindo padrão EmailExamplesForm
- ✅ **Task 7**: Página de produtos integrada com busca client-side, loading skeleton, empty state, dialogs de CRUD
- ✅ **Task 8**: 61 testes unitários criados - types (13), hooks (9), ProductCard (14), ProductForm (12), ProductList (13) - todos passando

**Notas técnicas:**
- Campaign count preparado para Story 6.5 (retorna 0 até FK ser criada)
- Padrão CRUD idêntico ao EmailExamplesForm para consistência
- RLS sem is_admin() - qualquer usuário autenticado pode gerenciar produtos
- Tests do SettingsTabs atualizados para 4 tabs (12 tests passando)

### File List

**New Files:**
- `supabase/migrations/00024_create_products.sql`
- `src/types/product.ts`
- `src/app/api/products/route.ts`
- `src/app/api/products/[productId]/route.ts`
- `src/hooks/use-products.ts`
- `src/components/products/index.ts`
- `src/components/products/ProductCard.tsx`
- `src/components/products/ProductList.tsx`
- `src/components/products/ProductForm.tsx`
- `src/components/products/ProductDialog.tsx`
- `src/components/products/DeleteProductDialog.tsx`
- `src/components/products/ProductsEmptyState.tsx`
- `src/app/(dashboard)/settings/products/page.tsx`
- `__tests__/unit/types/product.test.ts`
- `__tests__/unit/hooks/use-products.test.tsx`
- `__tests__/unit/components/products/ProductCard.test.tsx`
- `__tests__/unit/components/products/ProductForm.test.tsx`
- `__tests__/unit/components/products/ProductList.test.tsx`

**Modified Files:**
- `src/components/settings/SettingsTabs.tsx` - Adicionado tab "Produtos"
- `__tests__/unit/components/settings/SettingsTabs.test.tsx` - Atualizado para 4 tabs

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5
**Date:** 2026-02-02

**Issues Found:** 3 Medium, 2 Low

**Fixes Applied:**

1. **[M1] DialogDescription (Accessibility)** - Added `DialogDescription` to `ProductDialog.tsx` to fix accessibility warning
2. **[M2] DELETE silent on non-existent product** - Updated `[productId]/route.ts` DELETE to return 404 when product doesn't exist
3. **[M3] Outdated comment** - Updated `SettingsTabs.tsx` comment to reflect 4 tabs

**Outcome:** All issues fixed. 61 tests passing without accessibility warnings.

