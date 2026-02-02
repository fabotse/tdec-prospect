# Story 4.3: Lead Detail View & Interaction History

Status: done

## Story

As a user,
I want to see detailed information about a lead and track interactions,
So that I can understand their context and maintain a history of touchpoints.

## Context

Esta story opera sobre leads **persistidos** na pagina "Meus Leads" (/leads/my-leads). Leads da busca Apollo sao transientes e nao possuem historico de interacoes ate serem importados.

**Requisitos Funcionais Cobertos:**
- FR9: Usuario pode visualizar historico de interacoes com um lead

**Dependencias (todas DONE):**
- Story 3.1 (Leads Page & Data Model) - leads table
- Story 4.2.1 (Lead Import Mechanism) - leads persistidos no banco
- Story 4.2.2 (My Leads Page) - pagina /leads/my-leads

**O que JA existe (reutilizar, nao reimplementar):**
- `LeadTable.tsx` - tabela com leads, precisa adicionar onClick handler
- `MyLeadsPageContent.tsx` - conteudo da pagina My Leads
- Lead type com todos os campos necessarios
- LeadStatusDropdown para mudanca de status
- Padroes de acessibilidade estabelecidos
- Dark mode theme tokens
- shadcn/ui components (dialog, button, input, textarea)
- TanStack Query hooks pattern (`useLeads`, `useImportLeads`)
- API routes pattern em `/api/leads/`

**O que FALTA implementar nesta story:**
1. Migration para tabela `lead_interactions`
2. Instalar shadcn/ui Sheet component
3. `LeadDetailPanel.tsx` - sidepanel com Sheet
4. Hook `useLeadInteractions` para buscar/criar interacoes
5. Hook `useCreateInteraction` para adicionar notas
6. API route `/api/leads/[leadId]/interactions`
7. Integracao com `MyLeadsPageContent` para abrir sidepanel
8. Preview simplificado para leads Apollo (sem interacoes)
9. Testes unitarios

## Acceptance Criteria

1. **AC #1 - Detail Sidepanel Opens (Meus Leads)**
   - Given I am on the "Meus Leads" page (/leads/my-leads)
   - When I click on a lead row (lead already persisted in database)
   - Then a detail sidepanel opens (Sheet component from shadcn/ui)
   - And I see all lead information: name, company, title, email, phone, LinkedIn
   - And the sidepanel slides in from the right with smooth animation

2. **AC #2 - Lead Information Display**
   - Given the lead detail sidepanel is open
   - When I view the lead information section
   - Then I see lead's full name prominently displayed
   - And I see company name and title
   - And I see email with "Copiar" action (clickable)
   - And I see phone with "Copiar" action (if available)
   - And I see LinkedIn URL as clickable link (opens new tab)
   - And I see status badge with current status
   - And I see "Importado em" date (created_at formatted as dd/MM/yyyy)

3. **AC #3 - Interaction History Section**
   - Given the lead detail sidepanel is open
   - When I view the interaction history section
   - Then I see a list of all interactions for this lead
   - And each interaction shows: type icon, content, timestamp, author
   - And interactions are ordered by most recent first
   - And empty state shows "Nenhuma interacao registrada" if no interactions

4. **AC #4 - Add Interaction Note**
   - Given I want to add an interaction
   - When I click "Adicionar Nota"
   - Then I see a textarea to type my note
   - And I see "Salvar" and "Cancelar" buttons
   - When I type a note and click "Salvar"
   - Then the note is saved to lead_interactions table
   - And the new interaction appears in the history list immediately
   - And the textarea clears and closes

5. **AC #5 - Interaction Data Model**
   - Given a new interaction is created
   - Then it is saved with: id, lead_id, tenant_id, type, content, created_at, created_by
   - And type defaults to "note" for manual notes
   - And created_by references the current user's ID
   - And RLS policies ensure tenant isolation

6. **AC #6 - Simplified Preview (Apollo Search)**
   - Given I am on the Apollo search results page (/leads)
   - When I click on a lead row (not yet imported)
   - Then I see a simplified preview (no interaction history)
   - And I see lead information from Apollo data
   - And I see option "Importar Lead" button to enable full management
   - And clicking "Importar Lead" imports the lead and keeps sidepanel open

7. **AC #7 - Close and Keyboard Accessibility**
   - Given the sidepanel is open
   - When I click outside the sidepanel
   - Then the sidepanel closes
   - When I press Escape key
   - Then the sidepanel closes
   - And focus returns to the clicked row

## Tasks / Subtasks

- [x] Task 1: Database migration for lead_interactions (AC: #5)
  - [x] 1.1 Create migration file `00013_create_lead_interactions.sql`
  - [x] 1.2 Create lead_interactions table with columns: id, lead_id, tenant_id, type, content, created_at, created_by
  - [x] 1.3 Add foreign keys to leads and auth.users
  - [x] 1.4 Create indexes on lead_id and tenant_id
  - [x] 1.5 Setup RLS policies for tenant isolation
  - [x] 1.6 Run migration locally to verify

- [x] Task 2: Install Sheet component (AC: #1)
  - [x] 2.1 Run `npx shadcn add sheet`
  - [x] 2.2 Verify sheet component in `src/components/ui/sheet.tsx`

- [x] Task 3: Create TypeScript types for interactions (AC: #5)
  - [x] 3.1 Create `src/types/interaction.ts` with LeadInteraction interface
  - [x] 3.2 Add transform functions (row to interface)
  - [x] 3.3 Add Zod schemas for validation
  - [x] 3.4 Export from `src/types/index.ts`

- [x] Task 4: Create API route for interactions (AC: #4, #5)
  - [x] 4.1 Create `/api/leads/[leadId]/interactions/route.ts`
  - [x] 4.2 Implement GET to fetch interactions for a lead
  - [x] 4.3 Implement POST to create new interaction
  - [x] 4.4 Validate leadId belongs to tenant
  - [x] 4.5 Add error handling with Portuguese messages

- [x] Task 5: Create hooks for interactions (AC: #3, #4)
  - [x] 5.1 Create `src/hooks/use-lead-interactions.ts`
  - [x] 5.2 Implement useLeadInteractions query hook
  - [x] 5.3 Implement useCreateInteraction mutation hook
  - [x] 5.4 Configure query invalidation on mutation success

- [x] Task 6: Create LeadDetailPanel component (AC: #1, #2, #3, #4, #7)
  - [x] 6.1 Create `src/components/leads/LeadDetailPanel.tsx`
  - [x] 6.2 Use Sheet component for sidepanel
  - [x] 6.3 Create lead info section with all fields
  - [x] 6.4 Add "Copiar" action for email and phone
  - [x] 6.5 Add LinkedIn link (opens new tab)
  - [x] 6.6 Create interaction history section
  - [x] 6.7 Add "Adicionar Nota" button and form
  - [x] 6.8 Handle empty state for interactions
  - [x] 6.9 Implement keyboard accessibility (Escape to close)

- [x] Task 7: Integrate with MyLeadsPageContent (AC: #1)
  - [x] 7.1 Add onClick handler to LeadTable rows
  - [x] 7.2 Add state for selected lead in MyLeadsPageContent
  - [x] 7.3 Render LeadDetailPanel when lead is selected
  - [x] 7.4 Handle close to clear selected lead

- [x] Task 8: Create simplified preview for Apollo leads (AC: #6)
  - [x] 8.1 Create `src/components/leads/LeadPreviewPanel.tsx`
  - [x] 8.2 Show lead info without interaction history
  - [x] 8.3 Add "Importar Lead" button
  - [x] 8.4 Integrate with LeadsPageContent for Apollo search page

- [x] Task 9: Write tests (AC: all)
  - [x] 9.1 Test LeadDetailPanel renders correctly
  - [x] 9.2 Test interaction history displays properly
  - [x] 9.3 Test add note form works
  - [x] 9.4 Test sidepanel opens on row click
  - [x] 9.5 Test Escape key closes sidepanel
  - [x] 9.6 Test copy actions for email/phone
  - [x] 9.7 Test LeadPreviewPanel for Apollo leads
  - [x] 9.8 Test API route for interactions

- [x] Task 10: Update exports and barrel files (AC: N/A)
  - [x] 10.1 Export LeadDetailPanel from `src/components/leads/index.ts`
  - [x] 10.2 Export LeadPreviewPanel from `src/components/leads/index.ts`
  - [x] 10.3 Export hooks from appropriate barrel files

## Dev Notes

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Database naming | snake_case: `lead_interactions`, `lead_id`, `tenant_id` |
| Component naming | PascalCase: `LeadDetailPanel.tsx`, `LeadPreviewPanel.tsx` |
| Hook naming | useLeadInteractions, useCreateInteraction |
| State management | TanStack Query for server state |
| Error messages | Portuguese: "Erro ao salvar nota" |
| API response format | `{ data: T }` or `{ error: { code, message } }` |
| Folder structure | Components in `src/components/leads/` |

### Database Schema

```sql
-- Migration: 00013_create_lead_interactions.sql

-- Interaction types enum
DO $$ BEGIN
    CREATE TYPE interaction_type AS ENUM ('note', 'status_change', 'import', 'campaign_sent', 'campaign_reply');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Lead interactions table
CREATE TABLE IF NOT EXISTS public.lead_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type interaction_type NOT NULL DEFAULT 'note',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON public.lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_tenant_id ON public.lead_interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON public.lead_interactions(created_at DESC);

-- Enable RLS
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant interactions"
    ON public.lead_interactions FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert interactions to their tenant"
    ON public.lead_interactions FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());
```

### TypeScript Types

```typescript
// src/types/interaction.ts

export const interactionTypeValues = [
  "note",
  "status_change",
  "import",
  "campaign_sent",
  "campaign_reply",
] as const;

export type InteractionType = (typeof interactionTypeValues)[number];

export interface LeadInteraction {
  id: string;
  leadId: string;
  tenantId: string;
  type: InteractionType;
  content: string;
  createdAt: string;
  createdBy: string | null;
}

export interface LeadInteractionRow {
  id: string;
  lead_id: string;
  tenant_id: string;
  type: InteractionType;
  content: string;
  created_at: string;
  created_by: string | null;
}

export function transformInteractionRow(row: LeadInteractionRow): LeadInteraction {
  return {
    id: row.id,
    leadId: row.lead_id,
    tenantId: row.tenant_id,
    type: row.type,
    content: row.content,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

// Zod schemas
export const createInteractionSchema = z.object({
  content: z.string().min(1, "Nota nao pode estar vazia"),
  type: z.enum(interactionTypeValues).optional().default("note"),
});
```

### API Route Structure

```typescript
// src/app/api/leads/[leadId]/interactions/route.ts

// GET - Fetch all interactions for a lead
// Returns: { data: LeadInteraction[] }

// POST - Create new interaction
// Body: { content: string, type?: InteractionType }
// Returns: { data: LeadInteraction }
```

### LeadDetailPanel Component Structure

```typescript
// src/components/leads/LeadDetailPanel.tsx

interface LeadDetailPanelProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
}

// Sections:
// 1. Header with lead name and close button
// 2. Lead Info section (name, company, title, contacts)
// 3. Status badge (read-only display, not dropdown)
// 4. Interaction History section
// 5. Add Note form
```

### Copy to Clipboard Pattern

```typescript
// Use navigator.clipboard with fallback
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ description: "Copiado!" });
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    toast({ description: "Copiado!" });
  }
}
```

### LeadTable Row Click

```typescript
// Add to LeadTable props
interface LeadTableProps {
  // ... existing props
  onRowClick?: (lead: Lead) => void;
}

// In TableRow, add onClick handler
<TableRow
  onClick={() => onRowClick?.(lead)}
  className={cn(
    "cursor-pointer",
    // ... existing classes
  )}
>
```

### Project Structure

```
src/
├── app/
│   └── api/
│       └── leads/
│           └── [leadId]/
│               └── interactions/
│                   └── route.ts        # NEW - GET/POST interactions
├── components/
│   ├── ui/
│   │   └── sheet.tsx                   # NEW - shadcn/ui Sheet
│   └── leads/
│       ├── LeadDetailPanel.tsx         # NEW - Full detail sidepanel
│       ├── LeadPreviewPanel.tsx        # NEW - Simplified preview
│       ├── LeadTable.tsx               # UPDATE - Add onRowClick
│       ├── MyLeadsPageContent.tsx      # UPDATE - Integrate sidepanel
│       ├── LeadsPageContent.tsx        # UPDATE - Integrate preview
│       └── index.ts                    # UPDATE - New exports
├── hooks/
│   └── use-lead-interactions.ts        # NEW - TanStack Query hooks
├── types/
│   ├── interaction.ts                  # NEW - Interaction types
│   └── index.ts                        # UPDATE - Export interaction types
└── __tests__/
    └── unit/
        └── components/
            └── leads/
                ├── LeadDetailPanel.test.tsx    # NEW
                └── LeadPreviewPanel.test.tsx   # NEW
supabase/
└── migrations/
    └── 00013_create_lead_interactions.sql      # NEW
```

### Previous Story Intelligence

**From Story 4.2.3 (Sidebar Navigation Enhancement):**
- Sheet-like sidepanel pattern: use right-side slide
- Animation: 200ms duration (TRANSITION_DURATION constant)
- Keyboard handling: Escape to close
- Focus management on close

**From Story 4.2.2 (My Leads Page):**
- MyLeadsPageContent structure and data fetching
- `showCreatedAt` prop on LeadTable
- "Meus Leads" terminology

**From Story 4.2.1 (Lead Import Mechanism):**
- Import flow: useImportLeads hook
- Lead._isImported flag to detect DB vs Apollo leads
- Optimistic updates with TanStack Query

### Git Intelligence

**Commit pattern:**
```
feat(story-X.X): feature description with code review fixes
```

**Commit for this story should be:**
```
feat(story-4.3): lead detail view and interaction history with code review fixes
```

**Current branch:** `epic/3-lead-discovery`

### What NOT to Do

- Do NOT add interaction history to Apollo search preview (Apollo leads are transient)
- Do NOT make status editable in detail panel (use existing LeadStatusDropdown in table)
- Do NOT create separate detail page route (use sidepanel only)
- Do NOT fetch interactions for leads that aren't imported
- Do NOT use local state for interactions (use TanStack Query)
- Do NOT break existing LeadTable selection behavior

### Imports Required

```typescript
// LeadDetailPanel.tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ExternalLink, X, StickyNote, Clock } from "lucide-react";
import { useLeadInteractions, useCreateInteraction } from "@/hooks/use-lead-interactions";
import { Lead } from "@/types/lead";
import { formatBrazilianDate } from "@/lib/utils/date"; // or inline
```

### UI Design Guidelines

**Sidepanel:**
- Width: 400px (mobile: full width)
- Background: same as card background
- Border-left: subtle border
- Header: lead name + close button

**Lead Info Section:**
- Card-like container with padding
- Label + value pairs (vertical on mobile)
- Icons for email, phone, LinkedIn
- Status badge (colored per status)

**Interaction History:**
- Scrollable list if many items
- Each item: icon + content + timestamp
- Timestamp format: "dd/MM/yyyy HH:mm"
- Most recent first

**Add Note Form:**
- Collapsible section
- Textarea with placeholder "Digite uma nota..."
- Buttons: "Salvar" (primary), "Cancelar" (secondary)

### Interaction Type Icons

| Type | Icon | Description |
|------|------|-------------|
| note | StickyNote | Manual notes |
| status_change | RefreshCw | Status changes (future) |
| import | Download | When lead was imported |
| campaign_sent | Send | Campaign email sent (future) |
| campaign_reply | Reply | Lead replied (future) |

### Testing Strategy

**Unit Tests to Add:**

```typescript
describe('LeadDetailPanel', () => {
  it('should render lead information correctly', () => {});
  it('should display interaction history', () => {});
  it('should show empty state when no interactions', () => {});
  it('should add new note on form submit', () => {});
  it('should copy email to clipboard', () => {});
  it('should copy phone to clipboard', () => {});
  it('should open LinkedIn in new tab', () => {});
  it('should close on Escape key', () => {});
  it('should close when clicking outside', () => {});
});

describe('LeadPreviewPanel', () => {
  it('should show lead info without interactions', () => {});
  it('should show Import button for Apollo leads', () => {});
  it('should call import on button click', () => {});
});

describe('API /api/leads/[leadId]/interactions', () => {
  it('GET should return interactions for lead', () => {});
  it('POST should create new interaction', () => {});
  it('should reject if lead belongs to different tenant', () => {});
});
```

### NFR Compliance

- **Performance:** Lazy load interactions only when panel opens
- **Security:** RLS ensures tenant isolation, validate lead ownership in API
- **Accessibility:** WCAG 2.1 AA, keyboard navigation, screen reader support
- **Responsiveness:** Sidepanel full-width on mobile (< 640px)

### References

- [Source: src/types/lead.ts] - Lead type definition
- [Source: src/components/leads/LeadTable.tsx] - Table structure
- [Source: src/components/leads/MyLeadsPageContent.tsx] - My Leads page
- [Source: supabase/migrations/00010_create_leads.sql] - Leads table schema
- [Source: architecture.md#API-Response-Format] - API response format
- [Source: architecture.md#TanStack-Query-Pattern] - Query/Mutation patterns
- [Source: 4-2-3-sidebar-navigation-enhancement.md] - Sidepanel patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Implementacao sem erros criticos

### Completion Notes List

- **Task 1**: Migration `00013_create_lead_interactions.sql` criada com tabela, enum, indexes e RLS policies
- **Task 2**: Sheet component instalado via `npx shadcn add sheet`
- **Task 3**: Tipos em `src/types/interaction.ts` com interface, transform e Zod schema
- **Task 4**: API route `/api/leads/[leadId]/interactions` com GET e POST endpoints
- **Task 5**: Hooks `useLeadInteractions` e `useCreateInteraction` com TanStack Query
- **Task 6**: `LeadDetailPanel.tsx` com info do lead, historico de interacoes e formulario de nota
- **Task 7**: `MyLeadsPageContent` integrado com onRowClick e LeadDetailPanel
- **Task 8**: `LeadPreviewPanel.tsx` para leads Apollo com botao "Importar Lead"
- **Task 9**: 36 testes unitarios criados e passando (LeadDetailPanel, LeadPreviewPanel, hooks, API)
- **Task 10**: Exports atualizados em `src/components/leads/index.ts`

### Change Log

- 2026-02-01: Story 4.3 implementada com todas as ACs atendidas
- 2026-02-01: Code review fixes aplicados:
  - Corrigido bug na API: `validation.error.errors` alterado para `validation.error.issues` (Zod v3+)
  - Extraido `InfoRow` para componente compartilhado em `src/components/leads/InfoRow.tsx`
  - Extraido `copyToClipboard` para utilitario compartilhado em `src/lib/utils/clipboard.ts`
  - Corrigidos mocks nos testes da API (interactions.test.ts)
  - Adicionado teste de sucesso do POST (201)
  - Adicionado teste de chamada createInteraction com dados corretos
  - Adicionado teste de copy to clipboard
  - Adicionado teste de Escape key para fechar sidepanel
  - Total de 49 testes passando

### File List

**Novos arquivos:**
- supabase/migrations/00013_create_lead_interactions.sql
- src/types/interaction.ts
- src/app/api/leads/[leadId]/interactions/route.ts
- src/hooks/use-lead-interactions.ts
- src/components/leads/LeadDetailPanel.tsx
- src/components/leads/LeadPreviewPanel.tsx
- src/components/leads/InfoRow.tsx (extraido do code review)
- src/lib/utils/clipboard.ts (extraido do code review)
- src/components/ui/sheet.tsx
- __tests__/unit/components/leads/LeadDetailPanel.test.tsx
- __tests__/unit/components/leads/LeadPreviewPanel.test.tsx
- __tests__/unit/hooks/use-lead-interactions.test.tsx
- __tests__/unit/api/interactions.test.ts

**Arquivos modificados:**
- src/types/index.ts (export interaction types)
- src/components/leads/LeadTable.tsx (onRowClick prop)
- src/components/leads/MyLeadsPageContent.tsx (LeadDetailPanel integration)
- src/components/leads/LeadsPageContent.tsx (LeadPreviewPanel integration)
- src/components/leads/index.ts (new exports, InfoRow)

