# Story 3.1: Leads Page & Data Model

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a dedicated leads page,
So that I can view and manage all my leads in one place.

## Acceptance Criteria

1. **Given** I am authenticated
   **When** I navigate to Leads
   **Then** I see a page with search area at top and leads list below
   **And** the layout follows the sidebar navigation pattern from Epic 1

2. **Given** I am on the Leads page
   **When** the page loads
   **Then** I see a search/filter area at the top
   **And** below it, the main content area for the leads list
   **And** the search area has placeholder UI for future AISearchInput and filters

3. **Given** the leads table exists
   **When** I query leads
   **Then** the table contains columns: id, tenant_id, apollo_id, first_name, last_name, email, phone, company_name, company_size, industry, location, title, linkedin_url, status, created_at, updated_at
   **And** all columns use snake_case naming convention
   **And** tenant_id is a required foreign key to tenants table

4. **Given** I am authenticated as a user from tenant A
   **When** I query the leads table
   **Then** RLS policies ensure I only see leads from tenant A
   **And** I cannot access, view, or modify leads from other tenants

5. **Given** no leads exist for my tenant
   **When** I view the Leads page
   **Then** I see an empty state with helpful message
   **And** the empty state suggests "Buscar leads" as next action
   **And** the empty state follows the UX design specification (icon + message + CTA)

6. **Given** leads exist for my tenant
   **When** I view the Leads page
   **Then** I see a placeholder table/list component ready for future LeadTable implementation
   **And** the data structure is ready to display lead information

## Tasks / Subtasks

- [x] Task 1: Create database migration for leads table (AC: #3, #4)
  - [x] Create `public.leads` table with all specified columns
  - [x] Add primary key on `id` (UUID)
  - [x] Add foreign key `tenant_id` referencing `tenants(id)` with ON DELETE CASCADE
  - [x] Add indexes: `idx_leads_tenant_id`, `idx_leads_status`, `idx_leads_email`
  - [x] Add `status` enum or check constraint with values: 'novo', 'em_campanha', 'interessado', 'oportunidade', 'nao_interessado'
  - [x] Add timestamps with default values (created_at = NOW(), updated_at = NOW())
  - [x] Create trigger for auto-updating `updated_at` on row change

- [x] Task 2: Create RLS policies for leads table (AC: #4)
  - [x] Enable RLS on leads table
  - [x] Create SELECT policy: users can only view leads from their tenant
  - [x] Create INSERT policy: users can only insert leads for their tenant
  - [x] Create UPDATE policy: users can only update leads from their tenant
  - [x] Create DELETE policy: users can only delete leads from their tenant
  - [x] Use `get_current_tenant_id()` function (from Epic 1)

- [x] Task 3: Create TypeScript types for leads (AC: #3, #6)
  - [x] Create `src/types/lead.ts`
  - [x] Define `Lead` interface matching database schema (camelCase for TS)
  - [x] Define `LeadStatus` type with allowed values
  - [x] Define `CreateLeadInput` and `UpdateLeadInput` with Zod schemas
  - [x] Add unit tests for schema validation

- [x] Task 4: Create leads page structure (AC: #1, #2)
  - [x] Create `src/app/(dashboard)/leads/page.tsx`
  - [x] Create page layout with search area at top
  - [x] Add placeholder for AISearchInput (future Story 3.4)
  - [x] Add placeholder for filters panel (future Story 3.3)
  - [x] Add placeholder for lead list area
  - [x] Ensure proper integration with dashboard layout (sidebar)

- [x] Task 5: Create empty state component (AC: #5)
  - [x] Create or update `src/components/common/EmptyState.tsx` if needed
  - [x] Create leads-specific empty state with icon and message
  - [x] Add CTA button "Buscar Leads" (placeholder for now)
  - [x] Follow UX specs: icon + message + CTA pattern

- [x] Task 6: Create basic leads hook placeholder (AC: #6)
  - [x] Create `src/hooks/use-leads.ts`
  - [x] Set up TanStack Query structure for fetching leads
  - [x] Return empty array for now (data will come from Apollo API in Story 3.2)
  - [x] Add loading and error states

- [x] Task 7: Run tests and verify build
  - [x] All new tests pass
  - [x] Build succeeds
  - [x] Lint passes for all Story 3.1 files
  - [x] Database migration applies successfully

## Dev Notes

### Epic 3 Context

Epic 3 is **Lead Discovery**. This story establishes the foundation for lead management:

**FRs cobertos:**
- FR4: Usuário pode visualizar resultados de busca em formato de tabela
- FR27: Sistema integra com Apollo API para busca de leads (data model foundation)

**NFRs relevantes:**
- NFR-S3: Dados isolados por tenant_id em todas as queries
- NFR-P1: Busca de leads (Apollo) retorna em <3 segundos

### Database Schema

**New Migration: 00010_create_leads.sql**

```sql
-- Migration: Create leads table for lead management
-- Story: 3.1 - Leads Page & Data Model
-- AC: #3 - Leads table with specified columns
-- AC: #4 - RLS policies for tenant isolation

-- 1. Create lead_status enum
DO $$ BEGIN
    CREATE TYPE lead_status AS ENUM ('novo', 'em_campanha', 'interessado', 'oportunidade', 'nao_interessado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    apollo_id TEXT,  -- External ID from Apollo API
    first_name TEXT NOT NULL,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    company_name TEXT,
    company_size TEXT,  -- e.g., "11-50", "51-200"
    industry TEXT,
    location TEXT,
    title TEXT,  -- Job title
    linkedin_url TEXT,
    status lead_status NOT NULL DEFAULT 'novo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON public.leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_apollo_id ON public.leads(apollo_id);

-- 4. Create unique constraint for apollo_id per tenant (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tenant_apollo_unique
    ON public.leads(tenant_id, apollo_id)
    WHERE apollo_id IS NOT NULL;

-- 5. Create trigger for updated_at (uses existing function from migration 00001)
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- SELECT: Users can only view leads from their tenant
CREATE POLICY "Users can view their tenant leads"
    ON public.leads FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

-- INSERT: Users can only insert leads for their tenant
CREATE POLICY "Users can insert leads to their tenant"
    ON public.leads FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

-- UPDATE: Users can only update leads from their tenant
CREATE POLICY "Users can update their tenant leads"
    ON public.leads FOR UPDATE
    USING (tenant_id = public.get_current_tenant_id())
    WITH CHECK (tenant_id = public.get_current_tenant_id());

-- DELETE: Users can only delete leads from their tenant
CREATE POLICY "Users can delete their tenant leads"
    ON public.leads FOR DELETE
    USING (tenant_id = public.get_current_tenant_id());

-- 8. Comments
COMMENT ON TABLE public.leads IS 'Leads imported from Apollo or manually created';
COMMENT ON COLUMN public.leads.apollo_id IS 'External ID from Apollo API for deduplication';
COMMENT ON COLUMN public.leads.status IS 'Lead status in the outreach process';
```

### TypeScript Types

```typescript
// src/types/lead.ts
import { z } from "zod";

// Lead status matches database enum
export const leadStatusValues = [
    "novo",
    "em_campanha",
    "interessado",
    "oportunidade",
    "nao_interessado",
] as const;

export type LeadStatus = typeof leadStatusValues[number];

// UI-friendly status labels (Portuguese)
export const leadStatusLabels: Record<LeadStatus, string> = {
    novo: "Novo",
    em_campanha: "Em Campanha",
    interessado: "Interessado",
    oportunidade: "Oportunidade",
    nao_interessado: "Não Interessado",
};

// Status badge variants for UI
export const leadStatusVariants: Record<LeadStatus, "default" | "secondary" | "success" | "warning" | "destructive"> = {
    novo: "secondary",
    em_campanha: "default",
    interessado: "success",
    oportunidade: "success",
    nao_interessado: "destructive",
};

// Main Lead interface (camelCase for TypeScript)
export interface Lead {
    id: string;
    tenantId: string;
    apolloId: string | null;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    companySize: string | null;
    industry: string | null;
    location: string | null;
    title: string | null;
    linkedinUrl: string | null;
    status: LeadStatus;
    createdAt: string;
    updatedAt: string;
}

// Database row type (snake_case, for internal use)
export interface LeadRow {
    id: string;
    tenant_id: string;
    apollo_id: string | null;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    company_size: string | null;
    industry: string | null;
    location: string | null;
    title: string | null;
    linkedin_url: string | null;
    status: LeadStatus;
    created_at: string;
    updated_at: string;
}

// Transform database row to Lead interface
export function transformLeadRow(row: LeadRow): Lead {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        apolloId: row.apollo_id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        companyName: row.company_name,
        companySize: row.company_size,
        industry: row.industry,
        location: row.location,
        title: row.title,
        linkedinUrl: row.linkedin_url,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// Zod schemas for validation
export const createLeadSchema = z.object({
    firstName: z.string().min(1, "Nome é obrigatório"),
    lastName: z.string().optional(),
    email: z.string().email("Email inválido").optional().or(z.literal("")),
    phone: z.string().optional(),
    companyName: z.string().optional(),
    companySize: z.string().optional(),
    industry: z.string().optional(),
    location: z.string().optional(),
    title: z.string().optional(),
    linkedinUrl: z.string().url("URL inválida").optional().or(z.literal("")),
    apolloId: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema.partial().extend({
    status: z.enum(leadStatusValues).optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
```

### Hook Structure

```typescript
// src/hooks/use-leads.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/types/lead";

const LEADS_QUERY_KEY = ["leads"];

export interface LeadsFilters {
    status?: string;
    industry?: string;
    location?: string;
    search?: string;
}

export function useLeads(filters?: LeadsFilters) {
    return useQuery({
        queryKey: [...LEADS_QUERY_KEY, filters],
        queryFn: async (): Promise<Lead[]> => {
            // TODO: Implement server action in Story 3.2
            // For now, return empty array
            return [];
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

export function useLeadCount() {
    return useQuery({
        queryKey: [...LEADS_QUERY_KEY, "count"],
        queryFn: async (): Promise<number> => {
            // TODO: Implement server action
            return 0;
        },
        staleTime: 5 * 60 * 1000,
    });
}
```

### Page Structure

```tsx
// src/app/(dashboard)/leads/page.tsx
import { Suspense } from "react";
import { LeadsPageContent } from "@/components/leads/LeadsPageContent";
import { LeadsPageSkeleton } from "@/components/leads/LeadsPageSkeleton";

export const metadata = {
    title: "Leads - tdec-prospect",
    description: "Gerencie seus leads de prospecção",
};

export default function LeadsPage() {
    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-display font-semibold">Leads</h1>
                    <p className="text-body-small text-foreground-muted">
                        Busque e gerencie leads para suas campanhas de prospecção.
                    </p>
                </div>
            </div>

            {/* Search & Filter Area (placeholder for Stories 3.3 and 3.4) */}
            <div className="flex flex-col gap-4">
                {/* AISearchInput placeholder */}
                <div className="w-full max-w-2xl">
                    <div className="h-12 bg-background-secondary border border-border rounded-lg flex items-center px-4 text-foreground-muted">
                        <span>🔍 Busca conversacional em breve...</span>
                    </div>
                </div>
            </div>

            {/* Leads List Area */}
            <Suspense fallback={<LeadsPageSkeleton />}>
                <LeadsPageContent />
            </Suspense>
        </div>
    );
}
```

```tsx
// src/components/leads/LeadsPageContent.tsx
"use client";

import { useLeads } from "@/hooks/use-leads";
import { LeadsEmptyState } from "@/components/leads/LeadsEmptyState";
import { Card } from "@/components/ui/card";

export function LeadsPageContent() {
    const { data: leads, isLoading, error } = useLeads();

    if (isLoading) {
        return <LeadsPageSkeleton />;
    }

    if (error) {
        return (
            <Card className="p-6 text-destructive">
                Erro ao carregar leads: {error.message}
            </Card>
        );
    }

    if (!leads || leads.length === 0) {
        return <LeadsEmptyState />;
    }

    // Future: LeadTable component (Story 3.5)
    return (
        <Card className="p-6">
            <p className="text-foreground-muted">
                {leads.length} leads encontrados.
                Tabela de leads em implementação (Story 3.5).
            </p>
        </Card>
    );
}

export function LeadsPageSkeleton() {
    return (
        <Card className="p-6">
            <div className="space-y-4">
                <div className="h-10 bg-background-secondary rounded animate-pulse" />
                <div className="h-10 bg-background-secondary rounded animate-pulse" />
                <div className="h-10 bg-background-secondary rounded animate-pulse" />
            </div>
        </Card>
    );
}
```

```tsx
// src/components/leads/LeadsEmptyState.tsx
"use client";

import { Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LeadsEmptyState() {
    return (
        <Card className="flex flex-col items-center justify-center py-16 px-6 bg-background-secondary border-border">
            <div className="rounded-full bg-background-tertiary p-4 mb-4">
                <Users className="h-8 w-8 text-foreground-muted" />
            </div>
            <h3 className="text-h3 font-medium mb-2">Nenhum lead encontrado</h3>
            <p className="text-body-small text-foreground-muted text-center max-w-md mb-6">
                Comece buscando leads usando a busca conversacional ou filtros tradicionais.
                Os leads encontrados aparecerão aqui.
            </p>
            <Button>
                <Search className="h-4 w-4 mr-2" />
                Buscar Leads
            </Button>
        </Card>
    );
}
```

### Project Structure Notes

**New files to create:**

```
supabase/migrations/
└── 00010_create_leads.sql           # Leads table migration

src/
├── types/
│   └── lead.ts                      # Lead types and schemas
├── hooks/
│   └── use-leads.ts                 # TanStack Query hook
├── app/(dashboard)/leads/
│   ├── page.tsx                     # Leads page
│   └── loading.tsx                  # Loading skeleton (optional)
└── components/leads/
    ├── LeadsPageContent.tsx         # Main content component
    ├── LeadsEmptyState.tsx          # Empty state
    └── index.ts                     # Barrel export

__tests__/unit/
├── types/
│   └── lead.test.ts                 # Schema validation tests
└── components/leads/
    └── LeadsEmptyState.test.tsx     # Component tests
```

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Naming | snake_case for DB (leads, tenant_id), camelCase for TS (firstName, tenantId) |
| Security | RLS policies for tenant isolation on all CRUD operations |
| State | TanStack Query for server state (useLeads hook) |
| Types | Zod schemas for validation, separate Row and Interface types |
| Transform | transformLeadRow() function to convert DB → TS |
| Components | shadcn/ui (Card, Button, Skeleton) |
| Icons | Lucide React only (Users, Search, etc.) |
| Empty State | Icon + message + CTA pattern per UX spec |

### UX Notes (from ux-design-specification.md)

**Page Layout:**
- Page header: title (text-display) + description (text-body-small text-foreground-muted)
- Gap between sections: 24px (gap-6)
- Content area with Card component

**Empty State Pattern:**
- Icon: 32px in circular background (bg-background-tertiary, rounded-full, p-4)
- Title: text-h3 font-medium
- Description: text-body-small text-foreground-muted, max-w-md, text-center
- CTA: Primary button with icon

**Colors:**
- Background: bg-background (#070C1B)
- Cards: bg-background-secondary (#0D1425)
- Hover: bg-background-tertiary (#141D2F)
- Text primary: text-foreground (#F8FAFC)
- Text muted: text-foreground-muted (#94A3B8)
- Border: border-border (#1E293B)

### Previous Story Intelligence (Story 2.7)

**Key patterns from Epic 2:**

1. **TanStack Query Pattern:**
```typescript
const QUERY_KEY = ["leads"];

export function useLeads(filters?: LeadsFilters) {
    return useQuery({
        queryKey: [...QUERY_KEY, filters],
        queryFn: async () => {
            // Server action call
        },
        staleTime: 5 * 60 * 1000, // 5 min
    });
}
```

2. **Database Convention:** Use snake_case in database, camelCase in TypeScript. Always provide transform functions.

3. **RLS Pattern:** Use `get_current_tenant_id()` function for tenant isolation.

4. **Test Count:** Epic 2 ended with 618 tests. Maintain or increase coverage.

### Git Intelligence

**Recent commits pattern:**
- `feat(story-X.Y): description` for new features
- `fix(scope): description` for bug fixes
- `chore(scope): description` for maintenance

**Branch:** Currently on `epic/3-lead-discovery`

### What NOT to Do

- Do NOT expose tenant_id in API responses (it's internal)
- Do NOT skip RLS policies - security is critical
- Do NOT use Material UI or other icon libraries (Lucide React only)
- Do NOT create LeadTable yet - that's Story 3.5
- Do NOT implement Apollo API integration - that's Story 3.2
- Do NOT implement filters UI - that's Story 3.3
- Do NOT implement AI search - that's Story 3.4
- Do NOT skip the empty state - it's required for good UX

### Testing Strategy

```typescript
// __tests__/unit/types/lead.test.ts
describe('Lead types', () => {
    describe('createLeadSchema', () => {
        it('requires firstName');
        it('accepts valid email');
        it('rejects invalid email');
        it('accepts valid linkedinUrl');
        it('rejects invalid linkedinUrl');
        it('accepts empty optional fields');
    });

    describe('updateLeadSchema', () => {
        it('allows partial updates');
        it('validates status enum');
    });

    describe('transformLeadRow', () => {
        it('transforms snake_case to camelCase');
        it('preserves null values');
        it('handles all fields correctly');
    });
});

// __tests__/unit/components/leads/LeadsEmptyState.test.tsx
describe('LeadsEmptyState', () => {
    it('renders icon');
    it('renders title text');
    it('renders description');
    it('renders CTA button');
    it('button is clickable');
});

// __tests__/unit/hooks/use-leads.test.tsx
describe('useLeads', () => {
    it('returns empty array initially');
    it('handles loading state');
    it('accepts filters parameter');
});
```

### Dependencies

**Already installed:**
- `@tanstack/react-query` - Server state
- `zod` - Validation
- `lucide-react` - Icons

**shadcn components needed (may already exist from Epic 2):**
- `Card` - For content containers
- `Button` - For CTAs
- `Skeleton` - For loading states

### This Story's Scope

**IN SCOPE:**
- Database migration for leads table
- RLS policies for tenant isolation
- TypeScript types and Zod schemas
- Basic leads page structure
- Empty state component
- TanStack Query hook (returning empty array for now)

**OUT OF SCOPE (future stories):**
- Story 3.2: Apollo API Integration Service
- Story 3.3: Traditional Filter Search
- Story 3.4: AI Conversational Search
- Story 3.5: Lead Table Display
- Story 3.6: Lead Selection
- Story 3.7: Saved Filters

### References

- [Source: architecture.md#Data-Architecture] - Database naming conventions
- [Source: architecture.md#Authentication-Security] - RLS patterns
- [Source: architecture.md#Project-Structure] - File organization
- [Source: architecture.md#Implementation-Patterns] - Transform functions
- [Source: epics.md#Story-3.1] - Acceptance criteria
- [Source: ux-design-specification.md#Empty-States] - Empty state pattern
- [Source: ux-design-specification.md#Color-System] - Dark mode colors
- [Source: Story 2.7] - TanStack Query patterns, test patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - No issues encountered during implementation.

### Completion Notes List

- **Task 1 & 2 (Database)**: Created migration `00010_create_leads.sql` with full leads table schema, indexes, `lead_status` enum, `updated_at` trigger, and all 4 RLS policies using existing `get_current_tenant_id()` function.
- **Task 3 (Types)**: Implemented `src/types/lead.ts` with `Lead` interface (camelCase), `LeadRow` interface (snake_case), `transformLeadRow()` function, and Zod schemas (`createLeadSchema`, `updateLeadSchema`). Added 31 unit tests covering all schemas and transformations.
- **Task 4 (Page)**: Updated `src/app/(dashboard)/leads/page.tsx` with search area placeholder and Suspense wrapper for content. Created `LeadsPageContent.tsx` and `LeadsPageSkeleton.tsx` components.
- **Task 5 (Empty State)**: Created `LeadsEmptyState.tsx` following UX spec (icon + message + CTA pattern) with "Buscar Leads" button. Added 8 unit tests.
- **Task 6 (Hook)**: Created `src/hooks/use-leads.ts` with TanStack Query structure (`useLeads`, `useLeadCount`), returning empty arrays for now. Added 9 unit tests.
- **Task 7 (Verification)**: All 666 tests passing. Build succeeds. Lint passes for all Story 3.1 files.

### File List

**New Files:**
- supabase/migrations/00010_create_leads.sql
- src/types/lead.ts
- src/hooks/use-leads.ts
- src/components/leads/LeadsPageContent.tsx
- src/components/leads/LeadsPageSkeleton.tsx
- src/components/leads/LeadsEmptyState.tsx
- src/components/leads/index.ts
- __tests__/unit/types/lead.test.ts
- __tests__/unit/hooks/use-leads.test.tsx
- __tests__/unit/components/leads/LeadsEmptyState.test.tsx

**Modified Files:**
- src/app/(dashboard)/leads/page.tsx
- src/types/index.ts
