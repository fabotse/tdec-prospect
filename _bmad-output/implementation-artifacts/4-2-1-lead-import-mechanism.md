# Story 4.2.1: Lead Import Mechanism

Status: done

## Story

As a user,
I want to import leads from Apollo search results to my database,
So that I can manage their status, look up phone numbers, and track them over time.

## Context

Esta story foi identificada durante a implementação da Story 4.2 (Lead Status Management). Descobriu-se um gap crítico na arquitetura: **leads retornados do Apollo não são persistidos**, então funcionalidades como status, segmentos e busca de telefone não funcionam corretamente.

**Problema Raiz:**
1. Usuário busca leads via Apollo API → leads retornados (apenas em memória)
2. Leads exibidos na tabela com dropdown de status
3. Usuário tenta mudar status → **ERRO** (lead não existe no DB)

**Solução:**
Criar mecanismo explícito de importação que persiste leads antes de permitir operações de gerenciamento.

**Requisitos Funcionais Cobertos:**
- Enabler para FR8 (gestão de status de leads)
- Enabler para FR10 (busca de telefone)
- Enabler para FR7 (segmentos - já implementado mas pode usar esta lógica)

**Dependências (todas DONE):**
- Story 3.1 (Leads Page & Data Model) - LeadTable, Lead types, leads table
- Story 3.6 (Lead Selection) - LeadSelectionBar, useSelectionStore
- Story 4.1 (Lead Segments) - Upsert pattern em `/api/segments/[segmentId]/leads`
- Story 4.2 (Lead Status Management) - Status dropdown que precisa de leads persistidos

**O que JÁ existe (não reimplementar):**
- `LeadTable` com colunas e seleção
- `leads` table no Supabase com RLS e todos os campos necessários
- `LeadSelectionBar` com ações em lote
- `useSelectionStore` para gerenciar seleção
- Lógica de upsert em `/api/segments/[segmentId]/leads/route.ts` - **REUTILIZAR**
- `LeadStatusDropdown` (da Story 4.2)
- Toast notifications (sonner)

**O que FALTA implementar nesta story:**
1. Botão "Importar Leads" na LeadSelectionBar
2. API Route `/api/leads/import` para importação em lote
3. Indicador visual de lead salvo vs não salvo na tabela
4. Auto-upsert no `LeadStatusDropdown` quando lead não existe no DB
5. Hook `useImportLeads` com mutation TanStack Query
6. Testes unitários e de integração

## Acceptance Criteria

1. **AC #1 - Import Button in Selection Bar**
   - Given I have leads selected from Apollo search
   - When I see the selection bar
   - Then I see an "Importar Leads" button (secondary variant, before "Criar Campanha")
   - And clicking it saves selected leads to the database
   - And I see success toast "X leads importados"
   - And selected leads are updated with DB IDs

2. **AC #2 - Auto-Import on Status Change**
   - Given I click on a status dropdown for an unsaved lead (no DB id)
   - When I select a new status
   - Then the lead is automatically created in the database
   - And the status is set to the selected value
   - And I see success toast "Lead importado e status atualizado"

3. **AC #3 - Visual Indicator for Saved vs Unsaved**
   - Given leads are displayed in the table
   - When some leads are saved (have DB id) and some are not
   - Then saved leads show a small checkmark icon (✓) or subtle indicator
   - And unsaved leads show no indicator or a subtle "Apollo" badge
   - And the indicator appears in the first column (before checkbox or after name)

4. **AC #4 - Bulk Import**
   - Given I have multiple leads selected (some saved, some not)
   - When I click "Importar Leads"
   - Then only unsaved leads are imported (upsert behavior)
   - And already saved leads are not duplicated
   - And I see toast "X novos leads importados (Y já existiam)"

5. **AC #5 - Prevent Duplicates**
   - Given a lead already exists in the database (by apollo_id)
   - When I try to import it again
   - Then it is not duplicated (upsert using apollo_id)
   - And existing data is preserved
   - And the import count reflects only truly new leads

## Tasks / Subtasks

- [x] Task 1: Create `/api/leads/import` endpoint (AC: #1, #4, #5)
  - [x] 1.1 Create `src/app/api/leads/import/route.ts`
  - [x] 1.2 POST handler with Zod validation (reuse leadDataSchema from segment route)
  - [x] 1.3 Extract tenant_id from user's profile
  - [x] 1.4 Implement upsert logic (check existing by apollo_id, insert only new)
  - [x] 1.5 Return `{ imported: number, existing: number, leads: Lead[] }`
  - [x] 1.6 Add error logging with `console.error`

- [x] Task 2: Create `useImportLeads` hook (AC: #1, #4)
  - [x] 2.1 Create `src/hooks/use-import-leads.ts`
  - [x] 2.2 useMutation calling `/api/leads/import`
  - [x] 2.3 Invalidate leads queries on success
  - [x] 2.4 Toast feedback with import count
  - [x] 2.5 Handle case where all leads already exist

- [x] Task 3: Add Import button to LeadSelectionBar (AC: #1, #4)
  - [x] 3.1 Update `src/components/leads/LeadSelectionBar.tsx`
  - [x] 3.2 Add "Importar Leads" button (secondary variant, with Download icon)
  - [x] 3.3 Position before "Criar Campanha" button
  - [x] 3.4 Show loading state during import
  - [x] 3.5 On success, do NOT clear selection (user may want to continue actions)

- [x] Task 4: Create lead import indicator component (AC: #3)
  - [x] 4.1 Create `src/components/leads/LeadImportIndicator.tsx`
  - [x] 4.2 Show checkmark icon for saved leads (has `id` that is UUID)
  - [x] 4.3 Show nothing or subtle badge for unsaved leads
  - [x] 4.4 Use tooltip to explain indicator
  - [x] 4.5 Make indicator accessible

- [x] Task 5: Update LeadTable to show import indicator (AC: #3)
  - [x] 5.1 Add import indicator to LeadTable row
  - [x] 5.2 Position after checkbox column or before name
  - [x] 5.3 Update Lead type if needed to track import status

- [x] Task 6: Update LeadStatusDropdown for auto-upsert (AC: #2)
  - [x] 6.1 Modify `src/components/leads/LeadStatusDropdown.tsx`
  - [x] 6.2 Add logic to detect unsaved lead (no UUID id or apollo_id only)
  - [x] 6.3 On status change for unsaved lead, call import + status update
  - [x] 6.4 Show appropriate toast message for auto-import
  - [x] 6.5 Pass full lead data to component (not just id and status)

- [x] Task 7: Update Lead type for import tracking (AC: #3)
  - [x] 7.1 Review `src/types/lead.ts` for `isImported` computed property
  - [x] 7.2 Add helper function `isLeadImported(lead: Lead): boolean`
  - [x] 7.3 Logic: has valid UUID `id` AND `apollo_id` matches

- [x] Task 8: Write tests (AC: all)
  - [x] 8.1 Unit tests for `useImportLeads` hook
  - [x] 8.2 Unit tests for `LeadImportIndicator` component
  - [x] 8.3 Update `LeadSelectionBar.test.tsx` for import button
  - [x] 8.4 Update `LeadStatusDropdown.test.tsx` for auto-upsert
  - [x] 8.5 Update `LeadTable.test.tsx` for import indicator column

- [x] Task 9: Update component exports (AC: all)
  - [x] 9.1 Update `src/components/leads/index.ts`

## Dev Notes

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Database naming | snake_case: `tenant_id`, `apollo_id`, `first_name` |
| API naming | kebab-case: `/api/leads/import` |
| Component naming | PascalCase: `LeadImportIndicator.tsx` |
| UI Components | shadcn/ui: Button, Badge, Tooltip |
| State management | TanStack Query for mutations, Zustand for selection |
| Error messages | All in Portuguese |
| Folder structure | Components in `src/components/leads/` |

### API Route Design (Reuse from Segments)

```typescript
// src/app/api/leads/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * Schema for lead data to import
 * REUSE from /api/segments/[segmentId]/leads/route.ts
 */
const leadDataSchema = z.object({
  apolloId: z.string().min(1, "Apollo ID é obrigatório"),
  firstName: z.string().min(1, "Nome é obrigatório"),
  lastName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  hasEmail: z.boolean().optional(),
  hasDirectPhone: z.string().nullable().optional(),
});

const importLeadsSchema = z.object({
  leads: z.array(leadDataSchema).min(1, "Selecione pelo menos um lead"),
});

/**
 * POST /api/leads/import
 * Import leads from Apollo search results to database
 *
 * Flow:
 * 1. Get tenant_id from user's profile
 * 2. Check which leads already exist by apollo_id
 * 3. Insert only new leads
 * 4. Return all leads (existing + new) with their DB IDs
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // Get tenant_id from user's profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    console.error("[POST /api/leads/import] Profile error:", profileError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao obter perfil do usuário" } },
      { status: 500 }
    );
  }

  const body = await request.json();
  const validation = importLeadsSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: validation.error.issues[0]?.message || "Dados inválidos",
        },
      },
      { status: 400 }
    );
  }

  const { leads } = validation.data;
  const apolloIds = leads.map((l) => l.apolloId);

  // Check which leads already exist
  const { data: existingLeads, error: fetchError } = await supabase
    .from("leads")
    .select("id, apollo_id")
    .eq("tenant_id", profile.tenant_id)
    .in("apollo_id", apolloIds);

  if (fetchError) {
    console.error("[POST /api/leads/import] Fetch error:", fetchError);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao verificar leads existentes" } },
      { status: 500 }
    );
  }

  const existingApolloIds = new Set(existingLeads?.map((l) => l.apollo_id) ?? []);
  const existingCount = existingApolloIds.size;

  // Prepare new leads for insertion
  const newLeads = leads
    .filter((lead) => !existingApolloIds.has(lead.apolloId))
    .map((lead) => ({
      tenant_id: profile.tenant_id,
      apollo_id: lead.apolloId,
      first_name: lead.firstName,
      last_name: lead.lastName ?? null,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      company_name: lead.companyName ?? null,
      company_size: lead.companySize ?? null,
      industry: lead.industry ?? null,
      location: lead.location ?? null,
      title: lead.title ?? null,
      linkedin_url: lead.linkedinUrl ?? null,
      status: "novo" as const,
    }));

  let importedCount = 0;

  if (newLeads.length > 0) {
    const { error: insertError } = await supabase
      .from("leads")
      .insert(newLeads);

    if (insertError) {
      console.error("[POST /api/leads/import] Insert error:", insertError);
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao importar leads" } },
        { status: 500 }
      );
    }
    importedCount = newLeads.length;
  }

  // Fetch all leads with their DB IDs
  const { data: allLeads, error: fetchAllError } = await supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .in("apollo_id", apolloIds);

  if (fetchAllError) {
    console.error("[POST /api/leads/import] Fetch all error:", fetchAllError);
    // Still return success for import, just without lead data
    return NextResponse.json({
      data: { imported: importedCount, existing: existingCount },
      message: `${importedCount} leads importados`,
    });
  }

  return NextResponse.json({
    data: {
      imported: importedCount,
      existing: existingCount,
      leads: allLeads,
    },
    message: importedCount > 0
      ? `${importedCount} leads importados${existingCount > 0 ? ` (${existingCount} já existiam)` : ""}`
      : `Todos os ${existingCount} leads já estavam importados`,
  });
}
```

### Hook Design

```typescript
// src/hooks/use-import-leads.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Lead, LeadDataForImport } from "@/types/lead";

interface ImportLeadsResponse {
  data: {
    imported: number;
    existing: number;
    leads?: Lead[];
  };
  message: string;
}

async function importLeads(leads: LeadDataForImport[]): Promise<ImportLeadsResponse> {
  const response = await fetch("/api/leads/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao importar leads");
  }

  return response.json();
}

export function useImportLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importLeads,
    onSuccess: (result) => {
      toast.success(result.message);
      // Invalidate queries to refresh lead data with DB IDs
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["searchLeads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
```

### LeadImportIndicator Component

```typescript
// src/components/leads/LeadImportIndicator.tsx
"use client";

import { Check, Cloud } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/lead";

interface LeadImportIndicatorProps {
  lead: Lead;
  className?: string;
}

/**
 * Check if a lead has been imported (exists in database)
 * Imported leads have a valid UUID id (not just apollo_id)
 */
function isLeadImported(lead: Lead): boolean {
  // If lead has an id that looks like a UUID (36 chars with dashes), it's imported
  // Apollo IDs are different format (typically numbers or different string format)
  return Boolean(lead.id && /^[0-9a-f-]{36}$/i.test(lead.id));
}

export function LeadImportIndicator({ lead, className }: LeadImportIndicatorProps) {
  const imported = isLeadImported(lead);

  if (imported) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center justify-center", className)}>
              <Check className="h-3.5 w-3.5 text-green-500" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Lead salvo no banco de dados</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center justify-center", className)}>
            <Cloud className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Lead do Apollo (não salvo)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Export helper for use in other components
export { isLeadImported };
```

### LeadSelectionBar Update

```typescript
// Additions to LeadSelectionBar.tsx

import { Download } from "lucide-react";
import { useImportLeads } from "@/hooks/use-import-leads";

// Inside component:
const importMutation = useImportLeads();

// Prepare leads data for import
const leadsForImport = useMemo(() => {
  return selectedLeads.map((lead) => ({
    apolloId: lead.apolloId || lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.companyName,
    companySize: lead.companySize,
    industry: lead.industry,
    location: lead.location,
    title: lead.title,
    linkedinUrl: lead.linkedinUrl,
    hasEmail: lead.hasEmail,
    hasDirectPhone: lead.hasDirectPhone,
  }));
}, [selectedLeads]);

const handleImportLeads = () => {
  importMutation.mutate(leadsForImport);
};

// In JSX, add button before "Criar Campanha":
<Button
  variant="secondary"
  onClick={handleImportLeads}
  disabled={importMutation.isPending}
  className="gap-2"
>
  {importMutation.isPending ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Download className="h-4 w-4" />
  )}
  Importar Leads
</Button>
```

### LeadStatusDropdown Auto-Upsert Update

```typescript
// Modifications to LeadStatusDropdown.tsx

interface LeadStatusDropdownProps {
  lead: Lead;  // Now needs full lead object, not just id and status
  currentStatus: LeadStatus | undefined | null;
}

export function LeadStatusDropdown({ lead, currentStatus }: LeadStatusDropdownProps) {
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateLeadStatus();
  const { mutate: importLeads, isPending: isImporting } = useImportLeads();

  const isPending = isUpdating || isImporting;

  const handleStatusChange = (newStatus: LeadStatus) => {
    if (newStatus === currentStatus) return;

    // Check if lead needs to be imported first
    const isImported = lead.id && /^[0-9a-f-]{36}$/i.test(lead.id);

    if (!isImported) {
      // Auto-import lead then update status
      importLeads(
        [{
          apolloId: lead.apolloId || lead.id,
          firstName: lead.firstName,
          // ... other fields
        }],
        {
          onSuccess: (result) => {
            // Find the imported lead's new ID
            const importedLead = result.data.leads?.find(
              (l) => l.apollo_id === (lead.apolloId || lead.id)
            );
            if (importedLead) {
              updateStatus({ leadId: importedLead.id, status: newStatus });
            }
          },
        }
      );
      toast.info("Importando lead...");
    } else {
      updateStatus({ leadId: lead.id, status: newStatus });
    }
  };

  // ... rest of component
}
```

### Project Structure Updates

```
src/
├── app/
│   └── api/
│       └── leads/
│           └── import/
│               └── route.ts               # NEW - POST import
├── components/
│   └── leads/
│       ├── LeadImportIndicator.tsx        # NEW
│       ├── LeadSelectionBar.tsx           # UPDATE - Add import button
│       ├── LeadStatusDropdown.tsx         # UPDATE - Auto-upsert logic
│       ├── LeadTable.tsx                  # UPDATE - Add indicator column
│       └── index.ts                       # UPDATE - Add exports
├── hooks/
│   └── use-import-leads.ts                # NEW
├── types/
│   └── lead.ts                            # UPDATE - Add LeadDataForImport type
└── __tests__/
    └── unit/
        ├── components/
        │   └── leads/
        │       ├── LeadImportIndicator.test.tsx   # NEW
        │       ├── LeadSelectionBar.test.tsx      # UPDATE
        │       └── LeadStatusDropdown.test.tsx    # UPDATE
        └── hooks/
            └── use-import-leads.test.tsx          # NEW
```

### Previous Story Intelligence

**From Story 4.1 (Lead Segments):**
- **CRITICAL**: The upsert logic in `/api/segments/[segmentId]/leads/route.ts` is the exact pattern to follow
- Manual check + insert instead of Supabase upsert (partial unique index issue)
- Error logging pattern: `console.error("[API Route] Description:", error)`
- Response format: `{ data: { ... }, message: "..." }`
- Zod schema for lead data already defined - **REUSE IT**

**From Story 4.2 (Lead Status Management):**
- LeadStatusDropdown component structure
- useUpdateLeadStatus hook pattern
- Toast feedback pattern
- The problem this story solves: status changes fail for non-persisted leads

**From Story 3.6 (Lead Selection):**
- LeadSelectionBar action button pattern
- `selectedLeads` computed from `leads` and `selectedIds`
- Button placement and styling patterns

### Git Intelligence

**Recent commit pattern:**
```
feat(story-X.X): feature description with code review fixes
```

**Commit for this story should be:**
```
feat(story-4.2.1): lead import mechanism with code review fixes
```

**Current branch:** `epic/3-lead-discovery`
- Epic 4 work continues on this branch (per existing pattern)

### What NOT to Do

- Do NOT create a new segments route - reuse existing upsert logic pattern
- Do NOT modify the leads table schema - it already has all needed fields
- Do NOT duplicate the leadDataSchema - import from or copy exact same schema
- Do NOT implement import history/audit log - future enhancement
- Do NOT implement import progress bar - simple loading state is enough
- Do NOT clear selection after import - user may want to add to segment next
- Do NOT make imported leads visually different in table rows (background) - only indicator
- Do NOT implement "undo import" - not in scope

### Imports Required

```typescript
// New components
import { Check, Cloud, Download, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Existing
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
```

### Database Notes

**No schema changes required.** The `leads` table already has:
- `id` (UUID, primary key)
- `tenant_id` (UUID, foreign key)
- `apollo_id` (string, unique per tenant)
- `status` (varchar, default 'novo')
- All lead fields (name, email, company, etc.)
- RLS policies for tenant isolation

### NFR Compliance

- **NFR-I3:** All error messages in Portuguese
- **NFR-P1:** Import operation should complete in <3 seconds for up to 100 leads
- **Security:** Tenant isolation via RLS and explicit tenant_id check

### Testing Strategy

**Unit Tests:**
- `LeadImportIndicator`: renders checkmark for imported, cloud for not imported
- `useImportLeads`: calls correct endpoint, handles success/error
- `LeadSelectionBar`: shows import button, calls mutation on click
- `LeadStatusDropdown`: auto-imports unsaved lead before status change

**Integration Tests:**
- Import persists leads to database with correct tenant_id
- Duplicate import uses upsert (no duplicates created)
- Status change on imported lead works

### UX/UI Guidelines

**Import Button:**
- Position: Before "Criar Campanha", after selection count
- Variant: `secondary` (outline style)
- Icon: `Download` from lucide-react
- Label: "Importar Leads"
- Loading: Show `Loader2` spinner during import

**Import Indicator:**
- Checkmark: `Check` icon, green color (`text-green-500`), 14px
- Not imported: `Cloud` icon, muted color (`text-muted-foreground/50`), 14px
- Position: After checkbox column, before name
- Tooltip: Explain what indicator means

**Toast Messages:**
- Success: "X leads importados" or "X leads importados (Y já existiam)"
- All imported: "Todos os X leads já estavam importados"
- Error: "Erro ao importar leads"
- Auto-import: "Lead importado e status atualizado"

### References

- [Source: epic-4-lead-persistence-planning.md] - Full planning document
- [Source: architecture.md#API-Response-Format] - API response patterns
- [Source: architecture.md#TanStack-Query-Pattern] - Query hook patterns
- [Source: 4-1-lead-segments-lists.md] - Upsert pattern to follow
- [Source: 4-2-lead-status-management.md] - Status dropdown and problem context
- [Source: src/app/api/segments/[segmentId]/leads/route.ts] - Upsert logic to reuse
- [Source: src/components/leads/LeadSelectionBar.tsx] - Selection bar to update

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- ✅ Implemented `/api/leads/import` POST endpoint with upsert logic (check existing by apollo_id, insert only new)
- ✅ Created `useImportLeads` hook with TanStack Query mutation, toast feedback, and query invalidation
- ✅ Added "Importar Leads" button to LeadSelectionBar with loading state and Download icon
- ✅ Created `LeadImportIndicator` component with checkmark (imported) and cloud (unsaved) icons
- ✅ Updated LeadTable with new import indicator column between checkbox and name
- ✅ Updated LeadStatusDropdown to accept full lead object and auto-import unsaved leads before status change
- ✅ Added `isLeadImported` helper and `LeadDataForImport` type to `src/types/lead.ts`
- ✅ Wrote comprehensive unit tests for all new components and hooks
- ✅ All 1179 tests passing (3 pre-existing axe/Radix UI accessibility failures not related to this story)

**Code Review Fixes Applied:**
- ✅ H1: Removed toast spam in LeadStatusDropdown auto-import (eliminated redundant info/success toasts)
- ✅ H2: Fixed singular/plural grammar in API response messages ("1 lead importado" vs "2 leads importados")
- ✅ H3: Consolidated `isLeadImported` imports - canonical source is `@/types/lead`, removed re-exports from component
- ✅ M4: Added test for import indicator column position in LeadTable

### File List

**New Files:**
- src/app/api/leads/import/route.ts
- src/hooks/use-import-leads.ts
- src/components/leads/LeadImportIndicator.tsx
- __tests__/unit/hooks/use-import-leads.test.tsx
- __tests__/unit/components/leads/LeadImportIndicator.test.tsx

**Modified Files:**
- src/components/leads/LeadSelectionBar.tsx
- src/components/leads/LeadStatusDropdown.tsx
- src/components/leads/LeadTable.tsx
- src/components/leads/index.ts
- src/types/lead.ts
- __tests__/unit/components/leads/LeadSelectionBar.test.tsx
- __tests__/unit/components/leads/LeadStatusDropdown.test.tsx
- __tests__/unit/components/leads/LeadTable.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

| Date | Change Description |
|------|-------------------|
| 2026-01-31 | Story 4.2.1: Lead Import Mechanism implemented - All tasks complete |
| 2026-01-31 | Code review: Fixed H1 (toast spam), H2 (grammar), H3 (import consolidation), M4 (test added) |
