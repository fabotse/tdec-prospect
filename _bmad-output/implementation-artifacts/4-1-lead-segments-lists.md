# Story 4.1: Lead Segments/Lists

Status: done

## Story

As a user,
I want to organize leads into segments,
So that I can group leads by criteria and work with them efficiently.

## Context

Esta story inicia o Epic 4 (Lead Management) implementando o sistema de segmentos/listas para organização de leads. O Epic 3 já implementou toda a infraestrutura de leads (LeadTable, seleção, filtros, paginação). Esta story adiciona a capacidade de **criar segmentos**, **adicionar leads a segmentos** e **filtrar leads por segmento**.

**Requisitos Funcionais Cobertos:** FR7 (usuário pode organizar leads em segmentos/listas)

**Dependências (todas DONE):**
- Story 3.1 (Leads Page & Data Model) - LeadTable, Lead types
- Story 3.5 (Lead Table Display) - LeadTable component com seleção
- Story 3.6 (Lead Selection) - LeadSelectionBar, useLeadSelectionStore
- Story 3.8 (Pagination) - PaginationMeta, useSearchLeads

**O que JÁ existe (não reimplementar):**
- `LeadTable` com checkbox de seleção
- `LeadSelectionBar` com "X leads selecionados" e ações
- `useLeadSelectionStore` (Zustand) para estado de seleção
- `leads` table no Supabase com RLS
- API routes `/api/integrations/apollo` para busca de leads
- `FilterPanel` e `useFilterStore` para filtros de busca

**O que FALTA implementar nesta story:**
- Tabela `segments` no Supabase (migração SQL)
- Tabela `lead_segments` junction table (migração SQL)
- Tipos TypeScript `Segment`, `SegmentInsert`
- API Routes `/api/segments` (GET, POST, DELETE)
- API Route `/api/segments/[segmentId]/leads` (POST - add leads, DELETE - remove leads)
- Hook `useSegments` (TanStack Query)
- Componente `CreateSegmentDialog` (modal para criar segmento)
- Componente `SegmentDropdown` (botão na LeadSelectionBar + filtro na página)
- Integração no `LeadSelectionBar` para "Adicionar ao Segmento"
- Integração no `LeadsPageContent` para filtrar por segmento

## Acceptance Criteria

1. **AC #1 - Create Segment**
   - Given I am on the Leads page
   - When I click "Criar Segmento"
   - Then I can create a new segment with a name and optional description
   - And the segment is saved to the database with my tenant_id
   - And I see a success toast "Segmento criado"

2. **AC #2 - Add Leads to Segment**
   - Given I have leads selected
   - When I click "Adicionar ao Segmento" in the selection bar
   - Then I see a dropdown with existing segments and option to create new
   - And selecting a segment associates the selected leads with it
   - And leads are associated via lead_segments junction table
   - And I see success toast "X leads adicionados ao segmento"

3. **AC #3 - Filter by Segment**
   - Given I have segments with leads
   - When I view the Leads page
   - Then I see a segment filter/dropdown
   - And selecting a segment filters the leads list to only show leads in that segment
   - And selecting "Todos os Leads" removes the segment filter

4. **AC #4 - View Segment List**
   - Given I have created segments
   - When I open the segment filter dropdown
   - Then I see a list of my segments with name and lead count
   - And segments are ordered alphabetically

5. **AC #5 - Delete Segment**
   - Given I have a segment
   - When I click the delete icon next to it
   - Then a confirmation dialog appears
   - And upon confirmation, the segment is deleted
   - And leads are NOT deleted (only the association)
   - And I see success toast "Segmento removido"

6. **AC #6 - RLS Isolation**
   - Given segments table has RLS
   - When I access segments
   - Then I only see segments belonging to my tenant
   - And I cannot access other tenants' segments

7. **AC #7 - Segment Badge on Leads**
   - Given a lead is in one or more segments
   - When viewing the LeadTable
   - Then the lead shows segment indicator/badge (optional - can be deferred)

## Tasks / Subtasks

- [x] Task 1: Create Supabase migrations (AC: #1, #2, #6)
  - [x] 1.1 Create `supabase/migrations/00012_create_segments.sql`
  - [x] 1.2 Table: segments (id UUID, tenant_id UUID, name VARCHAR, description TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
  - [x] 1.3 Table: lead_segments (id UUID, segment_id UUID, lead_id UUID, added_at TIMESTAMPTZ)
  - [x] 1.4 RLS policies for tenant isolation on both tables
  - [x] 1.5 Indexes on foreign keys

- [x] Task 2: Create TypeScript types (AC: #1, #2, #4)
  - [x] 2.1 Create `src/types/segment.ts`
  - [x] 2.2 Interface Segment matching DB schema
  - [x] 2.3 Interface SegmentInsert for create operations
  - [x] 2.4 Interface SegmentWithCount for listing with lead count
  - [x] 2.5 Export from `src/types/index.ts`

- [x] Task 3: Create API Routes for Segments (AC: #1, #4, #5)
  - [x] 3.1 Create `src/app/api/segments/route.ts` (GET, POST)
  - [x] 3.2 Create `src/app/api/segments/[segmentId]/route.ts` (GET, DELETE)
  - [x] 3.3 GET returns segments with lead count (subquery)
  - [x] 3.4 Validate input with Zod
  - [x] 3.5 Return Portuguese error messages

- [x] Task 4: Create API Routes for Lead-Segment Association (AC: #2, #3)
  - [x] 4.1 Create `src/app/api/segments/[segmentId]/leads/route.ts` (POST, DELETE, GET)
  - [x] 4.2 POST adds multiple leads to segment (bulk insert)
  - [x] 4.3 DELETE removes leads from segment
  - [x] 4.4 Handle duplicates gracefully (ON CONFLICT DO NOTHING via upsert)

- [x] Task 5: Create useSegments hook (AC: #1, #2, #4, #5)
  - [x] 5.1 Create `src/hooks/use-segments.ts`
  - [x] 5.2 useQuery for listing segments with lead count
  - [x] 5.3 useMutation for creating segment
  - [x] 5.4 useMutation for deleting segment
  - [x] 5.5 useMutation for adding leads to segment
  - [x] 5.6 useMutation for removing leads from segment
  - [x] 5.7 Invalidate queries on mutation success

- [x] Task 6: Create CreateSegmentDialog component (AC: #1)
  - [x] 6.1 Create `src/components/leads/CreateSegmentDialog.tsx`
  - [x] 6.2 Dialog with input for segment name (required)
  - [x] 6.3 Optional textarea for description
  - [x] 6.4 Form validation with react-hook-form + Zod
  - [x] 6.5 Loading state on save
  - [x] 6.6 Success toast on creation

- [x] Task 7: Create SegmentDropdown component (AC: #2, #3, #4)
  - [x] 7.1 Create `src/components/leads/SegmentDropdown.tsx`
  - [x] 7.2 Dropdown showing segment list with lead counts
  - [x] 7.3 "Criar Segmento" option that opens CreateSegmentDialog
  - [x] 7.4 Delete icon per segment with confirmation
  - [x] 7.5 Empty state when no segments
  - [x] 7.6 Loading state while fetching

- [x] Task 8: Create SegmentFilter component (AC: #3)
  - [x] 8.1 Create `src/components/leads/SegmentFilter.tsx`
  - [x] 8.2 Dropdown for filtering leads page by segment
  - [x] 8.3 "Todos os Leads" option to clear filter
  - [x] 8.4 Show segment names with lead counts

- [x] Task 9: Update useSearchLeads hook (AC: #3)
  - [x] 9.1 Add `segmentId` parameter to filters (via filterLeadsBySegment utility)
  - [x] 9.2 When segmentId provided, filter leads by segment membership
  - [x] 9.3 Client-side filtering with useSegmentLeadIds hook

- [x] Task 10: Integrate with LeadSelectionBar (AC: #2)
  - [x] 10.1 Add "Adicionar ao Segmento" button to LeadSelectionBar
  - [x] 10.2 Button opens SegmentDropdown for selection
  - [x] 10.3 On segment select, add all selected leads to segment
  - [x] 10.4 Show success toast with count

- [x] Task 11: Integrate SegmentFilter into LeadsPageContent (AC: #3)
  - [x] 11.1 Add SegmentFilter in results card header
  - [x] 11.2 Pass selectedSegmentId to search/filter
  - [x] 11.3 Client-side filtering with filterLeadsBySegment

- [x] Task 12: Write tests (AC: all)
  - [x] 12.1 Unit tests for CreateSegmentDialog (16 tests)
  - [x] 12.2 Unit tests for SegmentDropdown (16 tests)
  - [x] 12.3 Unit tests for SegmentFilter (11 tests)
  - [x] 12.4 Unit tests for useSegments hook (14 tests)
  - [x] 12.5 Updated LeadSelectionBar tests for SegmentDropdown integration

## Dev Notes

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Database naming | snake_case: `segments`, `lead_segments`, `tenant_id` |
| API naming | kebab-case: `/api/segments`, `/api/segments/[segmentId]/leads` |
| Component naming | PascalCase: `SegmentDropdown.tsx`, `CreateSegmentDialog.tsx` |
| UI Components | shadcn/ui: Dialog, Button, DropdownMenu, Input |
| State management | TanStack Query for server state |
| Error messages | All in Portuguese |
| Folder structure | Components in `src/components/leads/`, API in `src/app/api/segments/` |

### Database Schema

```sql
-- supabase/migrations/00012_create_segments.sql

-- 1. Create segments table
CREATE TABLE IF NOT EXISTS public.segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: unique name per tenant
    CONSTRAINT unique_segment_name_per_tenant UNIQUE (tenant_id, name)
);

-- 2. Create lead_segments junction table
CREATE TABLE IF NOT EXISTS public.lead_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: lead can only be in a segment once
    CONSTRAINT unique_lead_per_segment UNIQUE (segment_id, lead_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_segments_tenant_id ON public.segments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_segments_name ON public.segments(name);
CREATE INDEX IF NOT EXISTS idx_lead_segments_segment_id ON public.lead_segments(segment_id);
CREATE INDEX IF NOT EXISTS idx_lead_segments_lead_id ON public.lead_segments(lead_id);

-- 4. Trigger for updated_at
DROP TRIGGER IF EXISTS update_segments_updated_at ON public.segments;
CREATE TRIGGER update_segments_updated_at
    BEFORE UPDATE ON public.segments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Enable RLS
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_segments ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for segments
CREATE POLICY "Users can view their tenant segments"
    ON public.segments FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert segments to their tenant"
    ON public.segments FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant segments"
    ON public.segments FOR UPDATE
    USING (tenant_id = public.get_current_tenant_id())
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant segments"
    ON public.segments FOR DELETE
    USING (tenant_id = public.get_current_tenant_id());

-- 7. RLS Policies for lead_segments (via segment's tenant)
CREATE POLICY "Users can view lead_segments for their tenant"
    ON public.lead_segments FOR SELECT
    USING (
        segment_id IN (
            SELECT id FROM public.segments
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can insert lead_segments for their tenant"
    ON public.lead_segments FOR INSERT
    WITH CHECK (
        segment_id IN (
            SELECT id FROM public.segments
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can delete lead_segments for their tenant"
    ON public.lead_segments FOR DELETE
    USING (
        segment_id IN (
            SELECT id FROM public.segments
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- 8. Comments
COMMENT ON TABLE public.segments IS 'User-defined segments for organizing leads';
COMMENT ON TABLE public.lead_segments IS 'Junction table linking leads to segments';
COMMENT ON COLUMN public.segments.name IS 'Segment name, unique per tenant';
```

### TypeScript Types

```typescript
// src/types/segment.ts
/**
 * Segment Types
 * Story: 4.1 - Lead Segments/Lists
 */

/**
 * Segment entity from database
 */
export interface Segment {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Segment with lead count for listing
 */
export interface SegmentWithCount extends Segment {
  leadCount: number;
}

/**
 * Insert type for creating segment
 */
export interface SegmentInsert {
  name: string;
  description?: string;
}

/**
 * Database row type (snake_case)
 */
export interface SegmentRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Transform database row to Segment interface
 */
export function transformSegmentRow(row: SegmentRow): Segment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lead-Segment association
 */
export interface LeadSegment {
  id: string;
  segmentId: string;
  leadId: string;
  addedAt: string;
}

/**
 * Request body for adding leads to segment
 */
export interface AddLeadsToSegmentRequest {
  leadIds: string[];
}
```

### API Route Designs

```typescript
// src/app/api/segments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const createSegmentSchema = z.object({
  name: z.string().min(1, "Nome do segmento é obrigatório").max(100),
  description: z.string().max(500).optional(),
});

// GET /api/segments - List segments with lead count
export async function GET() {
  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Query segments with lead count via subquery
  const { data, error } = await supabase
    .from("segments")
    .select(`
      *,
      lead_count:lead_segments(count)
    `)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar segmentos" } },
      { status: 500 }
    );
  }

  // Transform to camelCase with count
  const segments = data.map((s) => ({
    id: s.id,
    tenantId: s.tenant_id,
    name: s.name,
    description: s.description,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    leadCount: s.lead_count?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ data: segments });
}

// POST /api/segments - Create segment
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Get user's tenant_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Perfil não encontrado" } },
      { status: 404 }
    );
  }

  const body = await request.json();
  const validation = createSegmentSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.errors[0]?.message || "Dados inválidos"
        }
      },
      { status: 400 }
    );
  }

  const { name, description } = validation.data;

  const { data, error } = await supabase
    .from("segments")
    .insert({
      tenant_id: profile.tenant_id,
      name,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Já existe um segmento com esse nome" } },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar segmento" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      id: data.id,
      tenantId: data.tenant_id,
      name: data.name,
      description: data.description,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      leadCount: 0,
    },
  }, { status: 201 });
}
```

```typescript
// src/app/api/segments/[segmentId]/leads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ segmentId: string }>;
}

const addLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos um lead"),
});

// POST /api/segments/[segmentId]/leads - Add leads to segment
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { segmentId } = await params;
  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Verify segment exists and belongs to user's tenant
  const { data: segment, error: segmentError } = await supabase
    .from("segments")
    .select("id")
    .eq("id", segmentId)
    .single();

  if (segmentError || !segment) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Segmento não encontrado" } },
      { status: 404 }
    );
  }

  const body = await request.json();
  const validation = addLeadsSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.errors[0]?.message || "Dados inválidos"
        }
      },
      { status: 400 }
    );
  }

  const { leadIds } = validation.data;

  // Bulk insert with ON CONFLICT DO NOTHING
  const insertData = leadIds.map((leadId) => ({
    segment_id: segmentId,
    lead_id: leadId,
  }));

  const { error } = await supabase
    .from("lead_segments")
    .upsert(insertData, { onConflict: "segment_id,lead_id", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao adicionar leads ao segmento" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: { added: leadIds.length },
    message: `${leadIds.length} leads adicionados ao segmento`,
  });
}

// DELETE /api/segments/[segmentId]/leads - Remove leads from segment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { segmentId } = await params;
  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const validation = addLeadsSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.errors[0]?.message || "Dados inválidos"
        }
      },
      { status: 400 }
    );
  }

  const { leadIds } = validation.data;

  const { error } = await supabase
    .from("lead_segments")
    .delete()
    .eq("segment_id", segmentId)
    .in("lead_id", leadIds);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao remover leads do segmento" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: { removed: leadIds.length },
    message: `${leadIds.length} leads removidos do segmento`,
  });
}
```

### Hook Design

```typescript
// src/hooks/use-segments.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SegmentWithCount, SegmentInsert } from "@/types/segment";

const QUERY_KEY = ["segments"];

async function fetchSegments(): Promise<SegmentWithCount[]> {
  const response = await fetch("/api/segments");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao buscar segmentos");
  }
  const result = await response.json();
  return result.data;
}

async function createSegment(data: SegmentInsert): Promise<SegmentWithCount> {
  const response = await fetch("/api/segments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao criar segmento");
  }
  const result = await response.json();
  return result.data;
}

async function deleteSegment(segmentId: string): Promise<void> {
  const response = await fetch(`/api/segments/${segmentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao remover segmento");
  }
}

async function addLeadsToSegment(segmentId: string, leadIds: string[]): Promise<{ added: number }> {
  const response = await fetch(`/api/segments/${segmentId}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao adicionar leads ao segmento");
  }
  const result = await response.json();
  return result.data;
}

export function useSegments() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSegments,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSegment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSegment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useAddLeadsToSegment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ segmentId, leadIds }: { segmentId: string; leadIds: string[] }) =>
      addLeadsToSegment(segmentId, leadIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
```

### Component Design Guidelines

**CreateSegmentDialog:**
- Use shadcn Dialog component
- Form with react-hook-form + Zod validation
- Name input (required, max 100 chars)
- Description textarea (optional, max 500 chars)
- Loading state during save
- Success toast on creation

**SegmentDropdown (for LeadSelectionBar):**
- Trigger: Button with folder/tag icon
- Content: List of segments with lead count badges
- "Criar Novo Segmento" option at bottom (opens CreateSegmentDialog)
- On select: Add all selected leads to that segment
- Show toast with count

**SegmentFilter (for LeadsPageContent):**
- Dropdown/Select component
- "Todos os Leads" as default option
- List segments with lead counts
- On select: Filter leads page by segment

### Project Structure Updates

```
src/
├── app/
│   └── api/
│       └── segments/
│           ├── route.ts                    # NEW - GET, POST
│           └── [segmentId]/
│               ├── route.ts                # NEW - GET, DELETE
│               └── leads/
│                   └── route.ts            # NEW - POST, DELETE
├── components/
│   └── leads/
│       ├── CreateSegmentDialog.tsx         # NEW
│       ├── SegmentDropdown.tsx             # NEW
│       ├── SegmentFilter.tsx               # NEW
│       ├── LeadSelectionBar.tsx            # UPDATE - Add segment action
│       ├── LeadsPageContent.tsx            # UPDATE - Add segment filter
│       └── index.ts                        # UPDATE - Add exports
├── hooks/
│   ├── use-segments.ts                     # NEW
│   └── use-leads.ts                        # UPDATE - Add segmentId filter
├── types/
│   ├── segment.ts                          # NEW
│   └── index.ts                            # UPDATE - Add export
└── __tests__/
    └── unit/
        ├── components/
        │   └── leads/
        │       ├── CreateSegmentDialog.test.tsx    # NEW
        │       ├── SegmentDropdown.test.tsx        # NEW
        │       └── SegmentFilter.test.tsx          # NEW
        └── hooks/
            └── use-segments.test.ts                # NEW
supabase/
└── migrations/
    └── 00012_create_segments.sql                   # NEW
```

### UX/UI Guidelines

**Segment Filter Button (LeadsPageContent):**
- Position: Above or beside FilterPanel
- Button variant: outline
- Size: sm (matches other filters)
- Icon: Folder or Tag icon from lucide-react
- Label: "Segmentos" or selected segment name

**Add to Segment Button (LeadSelectionBar):**
- Position: Next to existing actions in selection bar
- Button variant: secondary
- Icon: FolderPlus from lucide-react
- Label: "Adicionar ao Segmento"

**Segment List Items:**
- Show segment name
- Badge with lead count
- Delete icon on hover

**Portuguese Labels:**
- "Criar Segmento"
- "Adicionar ao Segmento"
- "Todos os Leads"
- "Nome do segmento"
- "Descrição (opcional)"
- "Segmento criado"
- "X leads adicionados ao segmento"
- "Segmento removido"
- "Nenhum segmento ainda"

### Previous Story Intelligence

**From Story 3.7 (Saved Filters):**
- Pattern for dropdown with list + create action
- TanStack Query mutations with toast feedback
- Form validation with react-hook-form + Zod
- API route structure with Zod validation

**From Story 3.6 (Lead Selection):**
- LeadSelectionBar action button pattern
- useLeadSelectionStore for selected lead IDs
- Toast notifications for bulk actions
- `selectedIds`, `clearSelection` actions

**From Story 3.8 (Pagination):**
- API response with pagination metadata
- useSearchLeads hook structure with filters

### Git Intelligence

**Recent commit pattern:**
```
feat(story-X.X): feature description with code review fixes
```

**Branch:** `epic/3-lead-discovery` → Need to create `epic/4-lead-management` branch

**Branch strategy from sprint-status.yaml:**
1. Create epic branch: `epic/4-lead-management` from `epic/3-lead-discovery`
2. Feature branches from epic branch
3. Merge to epic on completion
4. PR to main when epic done

### What NOT to Do

- Do NOT implement segment editing (name/description update) - future enhancement
- Do NOT implement drag-and-drop reordering of segments - just alphabetical
- Do NOT implement nested segments or segment hierarchy - flat list only
- Do NOT implement segment sharing between users - tenant-scoped only
- Do NOT implement automatic segment assignment rules - manual only
- Do NOT implement segment colors or icons - simple name + count
- Do NOT show segments column in LeadTable yet - can be AC #7 in later story

### Imports Required

```typescript
// shadcn/ui components
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// Icons
import { FolderPlus, Folder, Trash2, Loader2, Plus } from "lucide-react";

// Form handling
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
```

### NFR Compliance

- **NFR-S3:** RLS policies ensure tenant_id isolation for segments
- **NFR-I3:** All error messages in Portuguese
- **Performance:** TanStack Query cache with 5min staleTime

### API for Filtering by Segment

When filtering leads by segment, the API route `/api/integrations/apollo` needs to be extended OR a new endpoint `/api/leads` created that:
1. Accepts `segmentId` in query params
2. Joins with `lead_segments` to filter leads
3. Returns only leads in that segment

Alternatively, implement client-side filtering for MVP (fetch lead IDs in segment, then filter).

**Recommended approach:** Add `/api/leads` route that queries the local `leads` table (not Apollo) with segment filtering.

### References

- [Source: epics.md#Story-4.1] - Story requirements and acceptance criteria
- [Source: architecture.md#API-Response-Format] - API response patterns
- [Source: architecture.md#TanStack-Query-Pattern] - Query hook patterns
- [Source: 3-7-saved-filters-favorites.md] - Similar dropdown/dialog patterns
- [Source: 3-6-lead-selection-individual-batch.md] - LeadSelectionBar patterns
- [Source: src/components/leads/LeadSelectionBar.tsx] - Existing selection bar
- [Source: src/hooks/use-leads.ts] - Existing leads hook

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- ✅ Created segments and lead_segments tables with RLS policies
- ✅ Implemented Segment TypeScript types with transform functions
- ✅ Created API routes for segments CRUD operations
- ✅ Created API routes for lead-segment associations
- ✅ Implemented useSegments hook with TanStack Query
- ✅ Created CreateSegmentDialog with form validation
- ✅ Created SegmentDropdown for adding leads to segments
- ✅ Created SegmentFilter for filtering leads by segment
- ✅ Added filterLeadsBySegment utility for client-side filtering
- ✅ Integrated SegmentDropdown into LeadSelectionBar
- ✅ Integrated SegmentFilter into LeadsPageContent
- ✅ All 1129 tests passing (57 new tests for segments)
- ✅ Updated LeadSelectionBar tests for SegmentDropdown integration

### File List

**New Files:**
- supabase/migrations/00012_create_segments.sql
- src/types/segment.ts
- src/app/api/segments/route.ts
- src/app/api/segments/[segmentId]/route.ts
- src/app/api/segments/[segmentId]/leads/route.ts
- src/hooks/use-segments.ts
- src/components/leads/CreateSegmentDialog.tsx
- src/components/leads/SegmentDropdown.tsx
- src/components/leads/SegmentFilter.tsx
- __tests__/unit/components/leads/CreateSegmentDialog.test.tsx
- __tests__/unit/components/leads/SegmentDropdown.test.tsx
- __tests__/unit/components/leads/SegmentFilter.test.tsx
- __tests__/unit/hooks/use-segments.test.tsx

**Modified Files:**
- src/types/index.ts
- src/hooks/use-leads.ts
- src/components/leads/LeadSelectionBar.tsx
- src/components/leads/LeadsPageContent.tsx
- src/components/leads/index.ts
- __tests__/unit/components/leads/LeadSelectionBar.test.tsx

### Senior Developer Review (AI)

**Review Date:** 2026-01-31
**Reviewer:** Claude Opus 4.5 (Dev Agent - Amelia)
**Outcome:** APPROVED with fixes applied

**Issues Found and Fixed:**

| Severity | Issue | File | Fix Applied |
|----------|-------|------|-------------|
| HIGH | API DELETE response inconsistency | [segmentId]/route.ts | Changed `{ success: true }` to `{ data: { deleted: true } }` |
| HIGH | Missing error logging | API routes | Added `console.error` to all error handlers |
| HIGH | Missing UUID validation | [segmentId]/route.ts, leads/route.ts | Added `z.string().uuid()` validation |
| HIGH | Missing edge case tests | SegmentDropdown.test.tsx | Added 4 new tests for fallback logic and error handling |
| MEDIUM | Undocumented apolloId fallback | SegmentDropdown.tsx | Added JSDoc @note explaining fallback behavior |
| MEDIUM | Performance concern undocumented | LeadsPageContent.tsx | Added @perf comment for client-side filtering |
| MEDIUM | Stale data after segment ops | use-segments.ts | Added segment-specific query invalidation |

**Test Results:** 1133 tests passing (66 test files)

### Change Log

- 2026-01-31: Code review fixes applied - 4 HIGH, 3 MEDIUM issues resolved
- 2026-01-31: Story 4.1 implementation complete - Lead Segments/Lists feature
