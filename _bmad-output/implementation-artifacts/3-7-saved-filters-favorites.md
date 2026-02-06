# Story 3.7: Saved Filters / Favorites

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to save my filter configurations,
So that I can quickly reuse searches I do frequently.

## Context

Esta story implementa o sistema de filtros salvos/favoritos para a página de leads. A Story 3.3 (Traditional Filter Search) já implementou o FilterPanel completo com todos os campos de filtro e o Zustand store `useFilterStore`. Esta story adiciona a capacidade de **salvar, listar, aplicar e deletar** configurações de filtros para reutilização rápida.

**Requisitos Funcionais Cobertos:** FR3 (usuário pode salvar filtros de busca como favoritos para reutilização)

**Dependências:**
- Story 3.1 (Leads Page & Data Model) - DONE
- Story 3.3 (Traditional Filter Search) - DONE - FilterPanel e useFilterStore criados
- Story 3.5.1 (Contact Availability) - DONE - contactEmailStatuses adicionado aos filtros

**O que JÁ existe (não reimplementar):**
- `FilterPanel` com todos os campos de filtro funcionais
- `useFilterStore` com `filters`, `setFilters`, `clearFilters`
- Estrutura de `FilterValues` com industries, companySizes, locations, titles, keywords, contactEmailStatuses
- Constantes: `INDUSTRIES`, `COMPANY_SIZES`, `EMAIL_STATUSES`
- Supabase Cloud configurado com RLS multi-tenant

**O que FALTA implementar nesta story:**
- Tabela `saved_filters` no Supabase (migração SQL)
- Tipo TypeScript `SavedFilter`
- API Route `/api/filters/saved` (GET, POST, DELETE)
- Hook `useSavedFilters` (TanStack Query)
- Componente `SavedFiltersDropdown` (botão "Filtros Salvos" + dropdown)
- Modal `SaveFilterDialog` para nomear e salvar filtro
- Integração no FilterPanel

## Acceptance Criteria

1. **Given** I have configured filters
   **When** I click "Salvar Filtro"
   **Then** I can give the filter a name
   **And** a dialog/modal opens with input for filter name
   **And** "Salvar" button creates the saved filter

2. **Given** I have saved filters
   **When** I click on "Filtros Salvos"
   **Then** I see a dropdown list of my saved filters
   **And** each item shows the filter name
   **And** saved filters are ordered by created_at (newest first)

3. **Given** I click on a saved filter
   **When** the filter is applied
   **Then** those filters are populated in the FilterPanel immediately
   **And** the filter panel expands if collapsed
   **And** the filters are applied without auto-executing search

4. **Given** I want to delete a saved filter
   **When** I click the delete icon next to a filter
   **Then** a confirmation is shown (or immediate delete with toast undo)
   **And** the filter is removed from my list
   **And** I see success toast "Filtro removido"

5. **Given** I try to save a filter with no name
   **When** I click "Salvar"
   **Then** validation prevents save
   **And** I see error message "Nome do filtro é obrigatório"

6. **Given** the saved_filters table has RLS
   **When** I access saved filters
   **Then** I only see filters belonging to my tenant and user
   **And** I cannot access other users' filters

## Tasks / Subtasks

- [x] Task 1: Create Supabase migration for saved_filters table (AC: #6)
  - [x] Create `supabase/migrations/00011_create_saved_filters.sql`
  - [x] Table: saved_filters (id UUID, tenant_id UUID, user_id UUID, name VARCHAR, filters_json JSONB, created_at TIMESTAMPTZ)
  - [x] RLS policy for tenant + user isolation
  - [x] Index on tenant_id, user_id

- [x] Task 2: Create TypeScript types (AC: #1, #2)
  - [x] Create `src/types/saved-filter.ts`
  - [x] Interface SavedFilter matching DB schema
  - [x] Interface SavedFilterInsert for create operations
  - [x] Export from `src/types/index.ts`

- [x] Task 3: Create API Routes (AC: #1, #2, #4)
  - [x] Create `src/app/api/filters/saved/route.ts` (GET, POST)
  - [x] Create `src/app/api/filters/saved/[filterId]/route.ts` (DELETE)
  - [x] Use Supabase server client with RLS
  - [x] Validate input with Zod
  - [x] Return Portuguese error messages

- [x] Task 4: Create useSavedFilters hook (AC: #2, #1, #4)
  - [x] Create `src/hooks/use-saved-filters.ts`
  - [x] useQuery for listing saved filters
  - [x] useMutation for creating saved filter
  - [x] useMutation for deleting saved filter
  - [x] Invalidate queries on mutation success

- [x] Task 5: Create SaveFilterDialog component (AC: #1, #5)
  - [x] Create `src/components/search/SaveFilterDialog.tsx`
  - [x] Dialog with input for filter name
  - [x] Form validation (name required)
  - [x] Loading state on save
  - [x] Success toast on save

- [x] Task 6: Create SavedFiltersDropdown component (AC: #2, #3, #4)
  - [x] Create `src/components/search/SavedFiltersDropdown.tsx`
  - [x] "Filtros Salvos" button with dropdown
  - [x] List saved filters with names
  - [x] Delete icon per filter
  - [x] Empty state when no saved filters
  - [x] Loading state while fetching

- [x] Task 7: Integrate components into FilterPanel (AC: #1, #2, #3)
  - [x] Add SaveFilterDialog trigger (button "Salvar Filtro")
  - [x] Add SavedFiltersDropdown to FilterPanel header
  - [x] Connect SavedFiltersDropdown to setFilters and setExpanded
  - [x] Ensure saved filter applies values without auto-search

- [x] Task 8: Write tests
  - [x] Unit tests for SaveFilterDialog validation
  - [x] Unit tests for SavedFiltersDropdown rendering
  - [x] Unit tests for useSavedFilters hook
  - [x] Integration tests for filter application

## Dev Notes

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Database naming | snake_case: `saved_filters`, `tenant_id`, `filters_json` |
| API naming | kebab-case: `/api/filters/saved` |
| Component naming | PascalCase: `SavedFiltersDropdown.tsx`, `SaveFilterDialog.tsx` |
| UI Components | shadcn/ui: Dialog, Button, DropdownMenu, Input |
| State management | TanStack Query for server state, Zustand for UI state |
| Error messages | All in Portuguese |
| Folder structure | Components in `src/components/search/`, API in `src/app/api/filters/` |

### Database Schema

```sql
-- supabase/migrations/00011_create_saved_filters.sql

CREATE TABLE saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint: unique name per user
  CONSTRAINT unique_filter_name_per_user UNIQUE (tenant_id, user_id, name)
);

-- Indexes for query performance
CREATE INDEX idx_saved_filters_tenant_user ON saved_filters(tenant_id, user_id);
CREATE INDEX idx_saved_filters_created_at ON saved_filters(created_at DESC);

-- Enable RLS
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own filters within their tenant
CREATE POLICY "Users can view own saved filters"
  ON saved_filters
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can insert own saved filters"
  ON saved_filters
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can delete own saved filters"
  ON saved_filters
  FOR DELETE
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );
```

### TypeScript Types

```typescript
// src/types/saved-filter.ts
import type { FilterValues } from "@/stores/use-filter-store";

/**
 * Saved filter entity from database
 * Story 3.7: Saved Filters / Favorites
 */
export interface SavedFilter {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  filtersJson: FilterValues;
  createdAt: string;
}

/**
 * Insert type for creating saved filter
 */
export interface SavedFilterInsert {
  name: string;
  filtersJson: FilterValues;
}

/**
 * API response for saved filters list
 */
export interface SavedFiltersResponse {
  data: SavedFilter[];
}
```

### API Route Design

```typescript
// src/app/api/filters/saved/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

// Zod schema for filter values (must match FilterValues)
const filterValuesSchema = z.object({
  industries: z.array(z.string()),
  companySizes: z.array(z.string()),
  locations: z.array(z.string()),
  titles: z.array(z.string()),
  keywords: z.string(),
  contactEmailStatuses: z.array(z.string()),
});

const createSavedFilterSchema = z.object({
  name: z.string().min(1, "Nome do filtro é obrigatório").max(100),
  filtersJson: filterValuesSchema,
});

// GET /api/filters/saved - List user's saved filters
export async function GET() {
  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("saved_filters")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar filtros salvos" } },
      { status: 500 }
    );
  }

  // Transform snake_case to camelCase
  const filters = data.map((f) => ({
    id: f.id,
    tenantId: f.tenant_id,
    userId: f.user_id,
    name: f.name,
    filtersJson: f.filters_json,
    createdAt: f.created_at,
  }));

  return NextResponse.json({ data: filters });
}

// POST /api/filters/saved - Create saved filter
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

  // Parse and validate body
  const body = await request.json();
  const validation = createSavedFilterSchema.safeParse(body);

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

  const { name, filtersJson } = validation.data;

  const { data, error } = await supabase
    .from("saved_filters")
    .insert({
      tenant_id: profile.tenant_id,
      user_id: user.user.id,
      name,
      filters_json: filtersJson,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation
    if (error.code === "23505") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Já existe um filtro com esse nome" } },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao salvar filtro" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      id: data.id,
      tenantId: data.tenant_id,
      userId: data.user_id,
      name: data.name,
      filtersJson: data.filters_json,
      createdAt: data.created_at,
    },
  }, { status: 201 });
}
```

```typescript
// src/app/api/filters/saved/[filterId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ filterId: string }>;
}

// DELETE /api/filters/saved/[filterId]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { filterId } = await params;
  const supabase = await createServerClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  // RLS handles authorization - user can only delete their own filters
  const { error } = await supabase
    .from("saved_filters")
    .delete()
    .eq("id", filterId);

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao remover filtro" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
```

### Hook Design

```typescript
// src/hooks/use-saved-filters.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SavedFilter, SavedFilterInsert } from "@/types/saved-filter";

const QUERY_KEY = ["saved-filters"];

async function fetchSavedFilters(): Promise<SavedFilter[]> {
  const response = await fetch("/api/filters/saved");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao buscar filtros salvos");
  }
  const result = await response.json();
  return result.data;
}

async function createSavedFilter(data: SavedFilterInsert): Promise<SavedFilter> {
  const response = await fetch("/api/filters/saved", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao salvar filtro");
  }
  const result = await response.json();
  return result.data;
}

async function deleteSavedFilter(filterId: string): Promise<void> {
  const response = await fetch(`/api/filters/saved/${filterId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Erro ao remover filtro");
  }
}

export function useSavedFilters() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchSavedFilters,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCreateSavedFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSavedFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteSavedFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSavedFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
```

### Component Designs

```typescript
// src/components/search/SaveFilterDialog.tsx
"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCreateSavedFilter } from "@/hooks/use-saved-filters";
import { useFilterStore } from "@/stores/use-filter-store";

const schema = z.object({
  name: z.string().min(1, "Nome do filtro é obrigatório").max(100),
});

type FormData = z.infer<typeof schema>;

interface SaveFilterDialogProps {
  disabled?: boolean;
}

export function SaveFilterDialog({ disabled }: SaveFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { filters } = useFilterStore();
  const createFilter = useCreateSavedFilter();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  const onSubmit = useCallback(
    async (data: FormData) => {
      try {
        await createFilter.mutateAsync({
          name: data.name,
          filtersJson: filters,
        });
        toast({
          title: "Filtro salvo",
          description: `"${data.name}" foi salvo com sucesso.`,
        });
        form.reset();
        setOpen(false);
      } catch (error) {
        toast({
          title: "Erro ao salvar",
          description: error instanceof Error ? error.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [createFilter, filters, form, toast]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
          <Save className="h-4 w-4" />
          Salvar Filtro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Salvar Filtro</DialogTitle>
            <DialogDescription>
              Dê um nome para esta configuração de filtros para reutilizar depois.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="filter-name">Nome do filtro</Label>
              <Input
                id="filter-name"
                placeholder="Ex: Leads de tecnologia em SP"
                {...form.register("name")}
                data-testid="filter-name-input"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createFilter.isPending}>
              {createFilter.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

```typescript
// src/components/search/SavedFiltersDropdown.tsx
"use client";

import { BookmarkIcon, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSavedFilters, useDeleteSavedFilter } from "@/hooks/use-saved-filters";
import { useFilterStore } from "@/stores/use-filter-store";
import type { SavedFilter } from "@/types/saved-filter";

export function SavedFiltersDropdown() {
  const { toast } = useToast();
  const { setFilters, setExpanded } = useFilterStore();
  const { data: savedFilters, isLoading } = useSavedFilters();
  const deleteFilter = useDeleteSavedFilter();

  const handleApplyFilter = (filter: SavedFilter) => {
    setFilters(filter.filtersJson);
    setExpanded(true);
    toast({
      title: "Filtro aplicado",
      description: `"${filter.name}" foi aplicado.`,
    });
  };

  const handleDeleteFilter = async (
    e: React.MouseEvent,
    filter: SavedFilter
  ) => {
    e.stopPropagation();
    try {
      await deleteFilter.mutateAsync(filter.id);
      toast({
        title: "Filtro removido",
        description: `"${filter.name}" foi removido.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BookmarkIcon className="h-4 w-4" />
          Filtros Salvos
          {savedFilters && savedFilters.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
              {savedFilters.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !savedFilters || savedFilters.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            Nenhum filtro salvo ainda.
            <br />
            Use "Salvar Filtro" para criar um.
          </div>
        ) : (
          savedFilters.map((filter, index) => (
            <div key={filter.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="flex items-center justify-between cursor-pointer"
                onClick={() => handleApplyFilter(filter)}
              >
                <span className="truncate">{filter.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDeleteFilter(e, filter)}
                  disabled={deleteFilter.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="sr-only">Remover filtro</span>
                </Button>
              </DropdownMenuItem>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### FilterPanel Integration

```typescript
// Update src/components/search/FilterPanel.tsx
// Add these components to the Filter Panel header area

import { SaveFilterDialog } from "@/components/search/SaveFilterDialog";
import { SavedFiltersDropdown } from "@/components/search/SavedFiltersDropdown";
import { getActiveFilterCount } from "@/stores/use-filter-store";

// In FilterPanel component, update the toggle button section:

const activeFilterCount = getActiveFilterCount(filters);
const hasActiveFilters = activeFilterCount > 0;

return (
  <div className="space-y-4">
    {/* Toggle Button and Saved Filters Row */}
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={togglePanel}
          className="gap-2"
          data-testid="filter-toggle-button"
        >
          <Filter className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeFilterCount}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>

        {/* Story 3.7: Saved Filters Dropdown */}
        <SavedFiltersDropdown />
      </div>

      {/* Story 3.7: Save Filter Button */}
      <SaveFilterDialog disabled={!hasActiveFilters} />
    </div>

    {/* Filter Panel Content - unchanged */}
    {isExpanded && (
      // ... existing CardContent ...
    )}
  </div>
);
```

### Project Structure Updates

```
src/
├── app/
│   └── api/
│       └── filters/
│           └── saved/
│               ├── route.ts           # NEW - GET, POST
│               └── [filterId]/
│                   └── route.ts       # NEW - DELETE
├── components/
│   └── search/
│       ├── FilterPanel.tsx            # UPDATE - Add integration
│       ├── SaveFilterDialog.tsx       # NEW
│       ├── SavedFiltersDropdown.tsx   # NEW
│       └── index.ts                   # UPDATE - Add exports
├── hooks/
│   └── use-saved-filters.ts           # NEW
├── types/
│   ├── saved-filter.ts                # NEW
│   └── index.ts                       # UPDATE - Add export
└── __tests__/
    └── unit/
        ├── components/
        │   └── search/
        │       ├── SaveFilterDialog.test.tsx      # NEW
        │       └── SavedFiltersDropdown.test.tsx  # NEW
        └── hooks/
            └── use-saved-filters.test.ts          # NEW
supabase/
└── migrations/
    └── 00011_create_saved_filters.sql             # NEW
```

### UX/UI Guidelines (from UX Spec)

**Saved Filters Button:**
- Button variant: outline
- Size: sm (matches filter toggle)
- Icon: BookmarkIcon from lucide-react
- Badge with count when filters exist

**Save Filter Dialog:**
- Standard shadcn Dialog component
- Input for name with validation
- Clear call-to-action buttons
- Loading state during save

**Dropdown Design:**
- Width: 256px (w-64)
- Max height with scroll for many items
- Delete icon per item
- Empty state message
- Loading spinner while fetching

**Portuguese Labels:**
- "Filtros Salvos"
- "Salvar Filtro"
- "Nome do filtro é obrigatório"
- "Filtro salvo"
- "Filtro removido"
- "Nenhum filtro salvo ainda"

### Testing Strategy

```typescript
// __tests__/unit/components/search/SaveFilterDialog.test.tsx
describe("SaveFilterDialog", () => {
  // Rendering
  it("renders trigger button");
  it("opens dialog when trigger clicked");

  // Validation
  it("shows error when name is empty");
  it("enables save button when name provided");

  // Submission
  it("calls createFilter with current filters");
  it("shows loading state during save");
  it("closes dialog on success");
  it("shows success toast on save");
  it("shows error toast on failure");

  // Disabled state
  it("disables trigger when no active filters");
});

// __tests__/unit/components/search/SavedFiltersDropdown.test.tsx
describe("SavedFiltersDropdown", () => {
  // Rendering
  it("renders trigger button");
  it("shows count badge when filters exist");
  it("shows loading state while fetching");
  it("shows empty state when no filters");
  it("lists saved filters");

  // Interactions
  it("applies filter when clicked");
  it("expands filter panel when filter applied");
  it("shows toast when filter applied");
  it("deletes filter when delete clicked");
  it("shows toast when filter deleted");
});

// __tests__/unit/hooks/use-saved-filters.test.ts
describe("useSavedFilters", () => {
  it("fetches saved filters");
  it("handles fetch error");
  it("creates saved filter");
  it("invalidates query after create");
  it("deletes saved filter");
  it("invalidates query after delete");
});
```

### Previous Story Intelligence (Story 3.6)

**Padrões estabelecidos:**
- Zustand store pattern for UI state (useFilterStore já existe)
- TanStack Query for server state (padrão usado em todo o projeto)
- shadcn/ui Dialog, Button, DropdownMenu components
- Portuguese labels throughout
- Toast notifications for feedback
- Fixed/sticky positioning for persistent UI elements

**Arquivos relevantes:**
- `src/stores/use-filter-store.ts` - Filter state (DO NOT MODIFY store structure)
- `src/components/search/FilterPanel.tsx` - Integration point
- `src/components/search/index.ts` - Barrel exports

**Learnings from 3.6:**
- Selection store pattern works well - follow same for saved filters
- TanStack Query mutations with invalidation work smoothly
- Toast notifications provide good feedback

### Git Intelligence

**Recent commits show pattern:**
```
feat(story-3.X): feature description with code review fixes
```

**Branch:** `epic/3-lead-discovery`

**Files frequently modified:**
- src/components/search/FilterPanel.tsx
- src/components/search/index.ts

### What NOT to Do

- Do NOT modify FilterValues interface in useFilterStore - just use it as-is
- Do NOT auto-execute search when applying saved filter - just populate fields
- Do NOT implement sharing filters between users - user-scoped only
- Do NOT implement filter categories or folders - simple flat list
- Do NOT implement filter editing - delete and recreate instead
- Do NOT add keyboard shortcuts for saved filters - future enhancement
- Do NOT implement import/export of filters - future enhancement

### Imports Required

```typescript
// shadcn/ui components needed (verify installed)
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Icons
import { Save, BookmarkIcon, Trash2, Loader2 } from "lucide-react";

// Form handling
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
```

Verify Dialog is installed:
```bash
npx shadcn add dialog
```

### NFR Compliance

- **NFR-S3:** RLS policies ensure tenant_id isolation
- **NFR-I3:** All error messages in Portuguese
- **Performance:** TanStack Query cache with 5min staleTime

### References

- [Source: epics.md#Story-3.7] - Story requirements and acceptance criteria
- [Source: architecture.md#API-Response-Format] - API response patterns
- [Source: architecture.md#TanStack-Query-Pattern] - Query hook patterns
- [Source: architecture.md#Zustand-Store-Pattern] - Store patterns
- [Source: 3-6-lead-selection-individual-batch.md] - Previous story patterns
- [Source: 3-3-traditional-filter-search.md] - FilterPanel implementation

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- ✅ Task 1: Migration `00011_create_saved_filters.sql` created with RLS policies for tenant+user isolation
- ✅ Task 2: TypeScript types `SavedFilter`, `SavedFilterInsert`, `SavedFiltersResponse` created
- ✅ Task 3: API routes implemented with Zod validation, Portuguese error messages
- ✅ Task 4: TanStack Query hooks with 5-minute staleTime and query invalidation
- ✅ Task 5: SaveFilterDialog with react-hook-form, Zod validation, sonner toasts
- ✅ Task 6: SavedFiltersDropdown with loading/empty states, delete per filter
- ✅ Task 7: FilterPanel integration - SavedFiltersDropdown and SaveFilterDialog added
- ✅ Task 8: 37 new tests passing (8 hook + 16 dialog + 13 dropdown), 33 existing FilterPanel tests updated
- ✅ All 98 search component tests passing

### File List

**New Files:**
- supabase/migrations/00011_create_saved_filters.sql
- src/types/saved-filter.ts
- src/app/api/filters/saved/route.ts
- src/app/api/filters/saved/[filterId]/route.ts
- src/hooks/use-saved-filters.ts
- src/components/search/SaveFilterDialog.tsx
- src/components/search/SavedFiltersDropdown.tsx
- __tests__/unit/hooks/use-saved-filters.test.tsx
- __tests__/unit/components/search/SaveFilterDialog.test.tsx
- __tests__/unit/components/search/SavedFiltersDropdown.test.tsx

**Modified Files:**
- src/types/index.ts (added saved-filter export)
- src/components/search/FilterPanel.tsx (integrated SavedFiltersDropdown, SaveFilterDialog)
- src/components/search/index.ts (added exports)
- __tests__/unit/components/search/FilterPanel.test.tsx (added QueryClientProvider wrapper)

### Senior Developer Review (AI)

**Review Date:** 2026-01-31
**Reviewer:** Amelia (Dev Agent - Code Review Mode)

**Issues Found & Fixed:**

| Severity | Issue | Resolution |
|----------|-------|------------|
| HIGH | AC #4 violation: Delete had no confirmation/undo | Added toast with "Desfazer" action that restores deleted filter |
| MEDIUM | React act() warning in SavedFiltersDropdown tests | Removed unnecessary setTimeout, fixed waitFor usage |
| MEDIUM | Unused `request` parameter in DELETE route | Renamed to `_request` to indicate intentional non-use |

**Fixes Applied:**
- [SavedFiltersDropdown.tsx](src/components/search/SavedFiltersDropdown.tsx): Added undo functionality via sonner toast action
- [route.ts](src/app/api/filters/saved/[filterId]/route.ts): Fixed unused parameter lint warning
- [SavedFiltersDropdown.test.tsx](__tests__/unit/components/search/SavedFiltersDropdown.test.tsx): Fixed act() warning and updated test for undo action

**Test Results:** 90/90 search component tests passing

**Outcome:** ✅ APPROVED - All HIGH/MEDIUM issues fixed, story ready for merge
