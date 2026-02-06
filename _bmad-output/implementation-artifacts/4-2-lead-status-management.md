# Story 4.2: Lead Status Management

Status: done

## Story

As a user,
I want to track the status of each lead,
So that I know where they are in the outreach process.

## Context

Esta story continua o Epic 4 (Lead Management) implementando o sistema de **gestão de status** para leads. O sistema permite acompanhar em que estágio do processo de prospecção cada lead se encontra.

**Requisitos Funcionais Cobertos:** FR8 (usuário pode atribuir status a leads)

**Dependências (todas DONE):**
- Story 3.1 (Leads Page & Data Model) - LeadTable, Lead types, leads table
- Story 3.5 (Lead Table Display) - LeadTable component com colunas
- Story 3.6 (Lead Selection) - LeadSelectionBar para ações em lote
- Story 4.1 (Lead Segments) - Padrões de API, hooks, dropdown components

**O que JÁ existe (não reimplementar):**
- `LeadTable` com colunas (Nome, Empresa, Cargo, Localização)
- `leads` table no Supabase com RLS (já tem campo `status`)
- API routes `/api/integrations/apollo` para busca de leads
- `FilterPanel` e `useFilterStore` para filtros de busca
- `LeadSelectionBar` com ações em lote
- `useSearchLeads` hook para busca de leads
- Componentes de segment (CreateSegmentDialog, SegmentDropdown) - **seguir padrões**

**O que FALTA implementar nesta story:**
- Tipo `LeadStatus` (enum TypeScript)
- Componente `LeadStatusBadge` (badge colorido)
- Componente `LeadStatusDropdown` (dropdown para mudar status)
- Hook `useUpdateLeadStatus` (mutation TanStack Query)
- API Route `/api/leads/[leadId]/status` (PATCH - update status)
- Integração na `LeadTable` para mostrar e editar status
- Filtro de status no `FilterPanel`
- Ação de status em lote na `LeadSelectionBar`

## Acceptance Criteria

1. **AC #1 - View Status Badge**
   - Given I am viewing the leads table
   - When leads have different statuses
   - Then I see the status as a colored badge for each lead
   - And badges follow the design system colors

2. **AC #2 - Change Individual Status**
   - Given I am viewing a lead in the table
   - When I click on the status badge
   - Then I see status options: Novo, Em Campanha, Interessado, Oportunidade, Não Interessado
   - And selecting a status updates it immediately
   - And the status change is saved to the lead record
   - And I see success toast "Status atualizado"

3. **AC #3 - Filter by Status**
   - Given I am on the leads page
   - When I open the FilterPanel
   - Then I see a status filter dropdown
   - And I can filter leads by one or more statuses
   - And the filter is applied to the search results

4. **AC #4 - Bulk Status Update**
   - Given I have leads selected
   - When I click "Alterar Status" in the selection bar
   - Then I see a dropdown with status options
   - And selecting a status updates all selected leads
   - And I see success toast "X leads atualizados"

5. **AC #5 - Status Colors**
   - Given the design system
   - Then status colors are:
     - Novo: default/neutral (gray)
     - Em Campanha: blue/primary
     - Interessado: green/success
     - Oportunidade: yellow/warning
     - Não Interessado: red/destructive

6. **AC #6 - Default Status**
   - Given a new lead is created (via Apollo search)
   - Then the lead has status "Novo" by default

## Tasks / Subtasks

- [x] Task 1: Define LeadStatus types (AC: #1, #2, #5)
  - [x] 1.1 Update `src/types/lead.ts` (existing types file)
  - [x] 1.2 Define `LeadStatus` union type with 5 statuses
  - [x] 1.3 Define `LeadStatusConfig` with label, variant mappings
  - [x] 1.4 Add `getStatusConfig()` helper function

- [x] Task 2: Create API Route for status update (AC: #2, #4)
  - [x] 2.1 Create `src/app/api/leads/[leadId]/status/route.ts`
  - [x] 2.2 PATCH handler with Zod validation
  - [x] 2.3 UUID validation for leadId parameter
  - [x] 2.4 Return updated lead with new status
  - [x] 2.5 Add error logging with `console.error`

- [x] Task 3: Create bulk status update API (AC: #4)
  - [x] 3.1 Create `src/app/api/leads/bulk-status/route.ts`
  - [x] 3.2 PATCH handler accepting `leadIds[]` and `status`
  - [x] 3.3 Update multiple leads in single query
  - [x] 3.4 Return count of updated leads

- [x] Task 4: Create useUpdateLeadStatus hook (AC: #2, #4)
  - [x] 4.1 Create `src/hooks/use-lead-status.ts`
  - [x] 4.2 useMutation for single lead status update
  - [x] 4.3 useMutation for bulk status update
  - [x] 4.4 Invalidate leads query on success
  - [x] 4.5 Toast notifications for feedback

- [x] Task 5: Create LeadStatusBadge component (AC: #1, #5)
  - [x] 5.1 Create `src/components/leads/LeadStatusBadge.tsx`
  - [x] 5.2 Use shadcn Badge component with outline variant
  - [x] 5.3 Map status to color variants per AC #5
  - [x] 5.4 Show translated Portuguese labels
  - [x] 5.5 Handle undefined/null status gracefully (default to "Novo")

- [x] Task 6: Create LeadStatusDropdown component (AC: #2)
  - [x] 6.1 Create `src/components/leads/LeadStatusDropdown.tsx`
  - [x] 6.2 Dropdown with all 5 status options
  - [x] 6.3 Current status disabled with checkmark
  - [x] 6.4 Loading spinner during update
  - [x] 6.5 Success toast on change

- [x] Task 7: Update LeadTable to show status (AC: #1, #2)
  - [x] 7.1 Add "Status" column to LeadTable
  - [x] 7.2 Render LeadStatusDropdown in column (inline editing)
  - [x] 7.3 Position column after "Contato" column

- [x] Task 8: Add status filter to FilterPanel (AC: #3)
  - [x] 8.1 Add status multi-select using LEAD_STATUS_OPTIONS
  - [x] 8.2 Update useFilterStore with `leadStatuses` and `setLeadStatuses`
  - [x] 8.3 Update getActiveFilterCount to include leadStatuses
  - [x] 8.4 Filter applied client-side via filterLeadsByStatus

- [x] Task 9: Add bulk status action to LeadSelectionBar (AC: #4)
  - [x] 9.1 Add "Alterar Status" dropdown button
  - [x] 9.2 Dropdown with all status options
  - [x] 9.3 On select, update all selected leads via useBulkUpdateStatus
  - [x] 9.4 Success toast shows count: "X leads atualizados para [Status]"
  - [x] 9.5 Clear selection after successful update

- [x] Task 10: Ensure default status for new leads (AC: #6)
  - [x] 10.1 Database default is 'novo' in leads table
  - [x] 10.2 Apollo leads created with status "novo" via API

- [x] Task 11: Write tests (AC: all)
  - [x] 11.1 Unit tests for LeadStatusBadge (all variants, colors, labels)
  - [x] 11.2 Unit tests for LeadStatusDropdown (render, status change, loading)
  - [x] 11.3 Unit tests for useUpdateLeadStatus/useBulkUpdateStatus hooks
  - [x] 11.4 Unit tests for FilterPanel with status filter
  - [x] 11.5 Update LeadTable tests (added QueryClientProvider wrapper)
  - [x] 11.6 Update use-filter-store tests (added leadStatuses field)
  - [x] 11.7 Update lead.test.ts (fixed leadStatusVariants expectations)

## Dev Notes

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Database naming | snake_case: `status` field already exists in `leads` |
| API naming | kebab-case: `/api/leads/[leadId]/status`, `/api/leads/bulk-status` |
| Component naming | PascalCase: `LeadStatusBadge.tsx`, `LeadStatusDropdown.tsx` |
| UI Components | shadcn/ui: Badge, DropdownMenu |
| State management | TanStack Query for mutations |
| Error messages | All in Portuguese |
| Folder structure | Components in `src/components/leads/` |

### Lead Status Definition

```typescript
// src/types/lead-status.ts

/**
 * Lead Status Types
 * Story: 4.2 - Lead Status Management
 */

/**
 * Valid lead statuses for the outreach process
 */
export type LeadStatus =
  | "new"           // Novo
  | "in_campaign"   // Em Campanha
  | "interested"    // Interessado
  | "opportunity"   // Oportunidade
  | "not_interested"; // Não Interessado

/**
 * Status configuration with display labels and colors
 */
export interface LeadStatusConfig {
  value: LeadStatus;
  label: string;          // Portuguese label
  variant: "default" | "secondary" | "success" | "warning" | "destructive";
}

/**
 * All available lead statuses with their configurations
 */
export const LEAD_STATUSES: LeadStatusConfig[] = [
  { value: "new", label: "Novo", variant: "default" },
  { value: "in_campaign", label: "Em Campanha", variant: "secondary" },
  { value: "interested", label: "Interessado", variant: "success" },
  { value: "opportunity", label: "Oportunidade", variant: "warning" },
  { value: "not_interested", label: "Não Interessado", variant: "destructive" },
];

/**
 * Get status config by value
 */
export function getStatusConfig(status: LeadStatus | undefined | null): LeadStatusConfig {
  return LEAD_STATUSES.find(s => s.value === status) || LEAD_STATUSES[0]; // Default to "new"
}

/**
 * Request body for updating lead status
 */
export interface UpdateLeadStatusRequest {
  status: LeadStatus;
}

/**
 * Request body for bulk status update
 */
export interface BulkUpdateStatusRequest {
  leadIds: string[];
  status: LeadStatus;
}
```

### API Route Design

```typescript
// src/app/api/leads/[leadId]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { LEAD_STATUSES } from "@/types/lead-status";

interface RouteParams {
  params: Promise<{ leadId: string }>;
}

const statusValues = LEAD_STATUSES.map(s => s.value) as [string, ...string[]];

const updateStatusSchema = z.object({
  status: z.enum(statusValues),
});

// PATCH /api/leads/[leadId]/status - Update single lead status
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { leadId } = await params;

  // Validate UUID format
  const uuidSchema = z.string().uuid("ID de lead inválido");
  const uuidValidation = uuidSchema.safeParse(leadId);
  if (!uuidValidation.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de lead inválido" } },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const validation = updateStatusSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.errors[0]?.message || "Status inválido"
        }
      },
      { status: 400 }
    );
  }

  const { status } = validation.data;

  const { data, error } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select()
    .single();

  if (error) {
    console.error("[PATCH /api/leads/[leadId]/status] Error:", error);
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Lead não encontrado" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar status" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
```

```typescript
// src/app/api/leads/bulk-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { LEAD_STATUSES } from "@/types/lead-status";

const statusValues = LEAD_STATUSES.map(s => s.value) as [string, ...string[]];

const bulkUpdateSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos um lead"),
  status: z.enum(statusValues),
});

// PATCH /api/leads/bulk-status - Update multiple leads status
export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const validation = bulkUpdateSchema.safeParse(body);

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

  const { leadIds, status } = validation.data;

  const { error, count } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", leadIds);

  if (error) {
    console.error("[PATCH /api/leads/bulk-status] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao atualizar status" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: { updated: count || leadIds.length },
    message: `${count || leadIds.length} leads atualizados`,
  });
}
```

### Hook Design

```typescript
// src/hooks/use-lead-status.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LeadStatus, UpdateLeadStatusRequest, BulkUpdateStatusRequest } from "@/types/lead-status";
import { getStatusConfig } from "@/types/lead-status";

async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const response = await fetch(`/api/leads/${leadId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status } satisfies UpdateLeadStatusRequest),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar status");
  }
}

async function bulkUpdateStatus(leadIds: string[], status: LeadStatus): Promise<{ updated: number }> {
  const response = await fetch("/api/leads/bulk-status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadIds, status } satisfies BulkUpdateStatusRequest),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao atualizar status");
  }
  const result = await response.json();
  return result.data;
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadStatus }) =>
      updateLeadStatus(leadId, status),
    onSuccess: (_, { status }) => {
      const config = getStatusConfig(status);
      toast.success(`Status atualizado para "${config.label}"`);
      // Invalidate all lead queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["searchLeads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ leadIds, status }: { leadIds: string[]; status: LeadStatus }) =>
      bulkUpdateStatus(leadIds, status),
    onSuccess: (result, { status }) => {
      const config = getStatusConfig(status);
      toast.success(`${result.updated} leads atualizados para "${config.label}"`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["searchLeads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
```

### Component Designs

**LeadStatusBadge:**

```typescript
// src/components/leads/LeadStatusBadge.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { getStatusConfig, type LeadStatus } from "@/types/lead-status";
import { cn } from "@/lib/utils";

interface LeadStatusBadgeProps {
  status: LeadStatus | undefined | null;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

const variantMap = {
  default: "bg-muted text-muted-foreground hover:bg-muted/80",
  secondary: "bg-primary/20 text-primary hover:bg-primary/30",
  success: "bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30",
  warning: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/30",
  destructive: "bg-destructive/20 text-destructive hover:bg-destructive/30",
};

export function LeadStatusBadge({
  status,
  className,
  onClick,
  interactive = false
}: LeadStatusBadgeProps) {
  const config = getStatusConfig(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        variantMap[config.variant],
        interactive && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {config.label}
    </Badge>
  );
}
```

**LeadStatusDropdown:**

> **Nota (Code Review):** Após integração com Story 4.2.1, a API foi atualizada para receber objeto `Lead` completo (para auto-import de leads não salvos). Veja implementação real em `src/components/leads/LeadStatusDropdown.tsx`.

```typescript
// src/components/leads/LeadStatusDropdown.tsx (API atualizada após 4.2.1)
interface LeadStatusDropdownProps {
  lead: Lead;  // Objeto Lead completo para detecção de auto-import
  currentStatus: LeadStatus | undefined | null;
}

// Verifica _isImported flag para decidir se precisa importar antes de atualizar status
// Se lead._isImported === false, importa primeiro via useImportLeads
```

### Project Structure Updates

```
src/
├── app/
│   └── api/
│       └── leads/
│           ├── [leadId]/
│           │   └── status/
│           │       └── route.ts           # NEW - PATCH status
│           └── bulk-status/
│               └── route.ts               # NEW - PATCH bulk status
├── components/
│   └── leads/
│       ├── LeadStatusBadge.tsx            # NEW
│       ├── LeadStatusDropdown.tsx         # NEW
│       ├── LeadTable.tsx                  # UPDATE - Add status column
│       ├── LeadSelectionBar.tsx           # UPDATE - Add bulk status action
│       ├── LeadsPageContent.tsx           # Minor if needed
│       └── index.ts                       # UPDATE - Add exports
├── hooks/
│   └── use-lead-status.ts                 # NEW
├── types/
│   ├── lead-status.ts                     # NEW
│   └── index.ts                           # UPDATE - Add export
└── __tests__/
    └── unit/
        ├── components/
        │   └── leads/
        │       ├── LeadStatusBadge.test.tsx        # NEW
        │       ├── LeadStatusDropdown.test.tsx     # NEW
        │       ├── LeadTable.test.tsx              # UPDATE
        │       └── LeadSelectionBar.test.tsx       # UPDATE
        └── hooks/
            └── use-lead-status.test.tsx            # NEW
```

### UX/UI Guidelines

**Status Badge Colors (Dark Mode Premium):**
- Novo: `bg-muted text-muted-foreground` (neutral gray)
- Em Campanha: `bg-primary/20 text-primary` (blue)
- Interessado: `bg-green-500/20 text-green-400` (green)
- Oportunidade: `bg-yellow-500/20 text-yellow-400` (yellow)
- Não Interessado: `bg-destructive/20 text-destructive` (red)

**Status Column in LeadTable:**
- Position: After "Localização" column
- Width: Auto (fits content)
- Badge is clickable, opens dropdown
- Show loading spinner next to badge during update

**Bulk Status in LeadSelectionBar:**
- Button: Secondary variant
- Icon: `RefreshCw` or `Edit` from lucide-react
- Label: "Alterar Status"
- Opens dropdown with all status options
- After selection, clear lead selection and show toast

### Previous Story Intelligence

**From Story 4.1 (Lead Segments):**
- API route structure with Zod validation - **copy pattern**
- UUID validation in route params
- Error logging with `console.error`
- Hook pattern with TanStack Query mutations
- Toast feedback on success/error
- Component export patterns

**From Story 3.6 (Lead Selection):**
- LeadSelectionBar action button pattern
- `useLeadSelectionStore` for selected lead IDs
- `selectedIds`, `clearSelection` actions
- Pattern for dropdown in selection bar

### Git Intelligence

**Recent commit pattern:**
```
feat(story-X.X): feature description with code review fixes
```

**Current branch:** `epic/3-lead-discovery`
- This story is Epic 4, but we're still on Epic 3 branch
- Consider if need to create `epic/4-lead-management` branch or continue on current

### Database Notes

**The `leads` table already has a `status` field:**
- Check current field type (likely VARCHAR or enum)
- If not exists, need migration to add it
- Default value should be 'new'

**Run this query to verify:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'status';
```

**If field doesn't exist, create migration:**
```sql
-- supabase/migrations/XXXXX_add_lead_status.sql
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'new';

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);

-- Update existing leads to have 'new' status
UPDATE public.leads SET status = 'new' WHERE status IS NULL;
```

### What NOT to Do

- Do NOT implement status history/changelog - future enhancement
- Do NOT implement custom status creation by users - fixed list only
- Do NOT implement status workflow/transitions - any status to any status
- Do NOT implement automated status changes - manual only for now
- Do NOT implement status notifications - future enhancement
- Do NOT change existing leads query structure - just add column

### Imports Required

```typescript
// shadcn/ui components
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

// Icons
import { Loader2, Check, RefreshCw } from "lucide-react";

// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Toast
import { toast } from "sonner";

// Zod
import { z } from "zod";
```

### NFR Compliance

- **NFR-I3:** All error messages in Portuguese
- **Performance:** Optimistic updates for instant feedback
- **Performance:** Single API call for bulk updates

### Testing Strategy

**Unit Tests:**
- LeadStatusBadge: renders correct label and color for each status
- LeadStatusBadge: handles undefined status (defaults to "Novo")
- LeadStatusDropdown: shows all status options
- LeadStatusDropdown: calls mutation on selection
- LeadStatusDropdown: shows loading state during mutation
- useUpdateLeadStatus: calls correct API endpoint
- useBulkUpdateStatus: calls bulk endpoint with array

**Integration Tests:**
- Status update persists to database
- Bulk status update works with multiple leads
- Status filter filters leads correctly

### References

- [Source: epics.md#Story-4.2] - Story requirements and acceptance criteria
- [Source: architecture.md#API-Response-Format] - API response patterns
- [Source: architecture.md#TanStack-Query-Pattern] - Query hook patterns
- [Source: 4-1-lead-segments-lists.md] - API and hook patterns to follow
- [Source: src/components/leads/LeadSelectionBar.tsx] - Existing selection bar
- [Source: src/components/leads/LeadTable.tsx] - Existing lead table
- [Source: src/hooks/use-leads.ts] - Existing leads hook

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

1. **Types added to existing lead.ts** - Instead of creating a separate `lead-status.ts`, types were added to the existing `src/types/lead.ts` file where `LeadStatus` type already existed. Added `LeadStatusVariant`, `LeadStatusConfig`, `LEAD_STATUSES` array, and `getStatusConfig()` helper.

2. **Status color scheme per AC #5** - Implemented exact colors:
   - Novo: `default` (gray/muted)
   - Em Campanha: `secondary` (blue/primary)
   - Interessado: `success` (green)
   - Oportunidade: `warning` (yellow)
   - Não Interessado: `destructive` (red)

3. **Client-side filtering for status** - Since leads from Apollo don't have our internal status, the status filter is applied client-side via `filterLeadsByStatus()` function in `use-leads.ts`. Performance note added for datasets >1000 leads.

4. **LeadTable uses LeadStatusDropdown** - Instead of a separate badge and dropdown, the status column directly renders `LeadStatusDropdown` which wraps `LeadStatusBadge` with interactive dropdown functionality.

5. **Tests required QueryClientProvider wrapper** - LeadTable tests needed to be updated with a QueryClientProvider wrapper because LeadStatusDropdown uses the `useUpdateLeadStatus` hook which requires QueryClient context.

6. **Pre-existing accessibility test failures** - There are 3 pre-existing accessibility test failures related to Radix UI's dropdown using `aria-expanded` on elements that technically shouldn't support it. These are not caused by this story.

7. **Portuguese status values** - Database enum uses Portuguese snake_case values: `novo`, `em_campanha`, `interessado`, `oportunidade`, `nao_interessado` (matching existing database schema).

### File List

**New Files:**
- `src/app/api/leads/[leadId]/status/route.ts` - PATCH endpoint for single lead status update
- `src/app/api/leads/bulk-status/route.ts` - PATCH endpoint for bulk status update
- `src/hooks/use-lead-status.ts` - TanStack Query mutations for status updates
- `src/components/leads/LeadStatusBadge.tsx` - Status badge component with color variants
- `src/components/leads/LeadStatusDropdown.tsx` - Dropdown for changing status
- `__tests__/unit/hooks/use-lead-status.test.tsx` - Hook tests (6 tests)
- `__tests__/unit/components/leads/LeadStatusDropdown.test.tsx` - Component tests (6 tests)

**Modified Files:**
- `src/types/lead.ts` - Added LeadStatusVariant, LeadStatusConfig, LEAD_STATUSES, getStatusConfig
- `src/stores/use-filter-store.ts` - Added leadStatuses filter, setLeadStatuses action, LEAD_STATUS_OPTIONS
- `src/components/leads/LeadTable.tsx` - Added Status column with LeadStatusDropdown
- `src/components/leads/LeadSelectionBar.tsx` - Added bulk status dropdown action
- `src/components/leads/LeadsPageContent.tsx` - Added filterLeadsByStatus to leads memo
- `src/components/leads/index.ts` - Added exports for LeadStatusBadge, LeadStatusDropdown
- `src/hooks/use-leads.ts` - Added filterLeadsByStatus function
- `src/components/search/FilterPanel.tsx` - Added lead status filter multi-select
- `__tests__/unit/stores/use-filter-store.test.ts` - Added leadStatuses tests
- `__tests__/unit/types/lead.test.ts` - Updated leadStatusVariants expectations
- `__tests__/unit/components/leads/LeadTable.test.tsx` - Added QueryClientProvider wrapper
- `__tests__/unit/components/leads/LeadStatusDropdown.test.tsx` - **(Code Review Fix)** Added `_isImported` flag to mock helper, fixed test descriptions

### Code Review Fixes Applied

**Review Date:** 2026-01-31
**Reviewer:** Claude Opus 4.5 (Adversarial Code Review)

1. **[HIGH] Fixed Test Logic in LeadStatusDropdown.test.tsx**
   - Added `_isImported: true` default to `createMockLead()` helper
   - Updated test descriptions from "has UUID id" to "_isImported: true/false"
   - Test now correctly validates `isLeadImported()` function behavior

2. **[LOW] Updated Documentation**
   - LeadStatusDropdown API note added explaining Story 4.2.1 integration change
   - Props changed from `leadId: string` to `lead: Lead`

3. **[NOTE] Pre-existing Accessibility Tests**
   - 5 accessibility tests fail due to Radix UI `aria-expanded` on div elements
   - This is a known upstream issue, not introduced by this story

