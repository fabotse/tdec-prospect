# Story 15.5: Criacao de Leads e Integracao com Pipeline

Status: done

## Story

As a User,
I want to create leads from Apollo-found contacts and add them to existing segments,
so that I can start technography-segmented prospecting campaigns using the standard TDEC Prospect flow.

## Acceptance Criteria

1. User views Apollo-found contacts in ContactResultsTable and selects them (individual checkbox or batch header checkbox); a "Criar Leads" button appears when contacts are selected, showing selection count
2. On "Criar Leads" click, system creates leads in database with user's tenant_id via batch API endpoint
3. Lead data includes: name, email, title, company, source ("theirStack + Apollo"); target technology metadata preserved (ex: origin technology name from the search context) via `lead_interactions` record with type='import'
4. Successful creation displays toast confirmation showing quantity created, with option to add to existing segment/list via a dialog
5. User selects segment from dropdown in dialog; leads are added with success confirmation toast
6. Duplicate detection: if contact already exists as lead (same email within tenant), system shows duplicate count in dialog and skips duplicates by default (does not create duplicate leads)
7. Created and segmented leads appear normally in existing leads/campaigns pipeline; can be used in campaigns, enrichment, and export (standard Lead schema, status="novo")

## Tasks / Subtasks

- [x] Task 1: Selecao de contatos no ContactResultsTable (AC: #1)
  - [x] 1.1 Add `selectedIds` prop (string[]) and `onSelectionChange` callback prop to ContactResultsTable
  - [x] 1.2 Add Checkbox in header row for batch select/deselect all visible contacts
  - [x] 1.3 Add Checkbox per contact row, toggling individual selection by contact.id
  - [x] 1.4 Display selection counter text (ex: "3 contatos selecionados") above table when selection > 0
  - [x] 1.5 Follow exact checkbox selection pattern from CompanyResultsTable (Checkbox component from shadcn/ui, `checked`/`onCheckedChange` props)
  - [x] 1.6 Write unit tests for ContactResultsTable selection behavior (individual, batch, counter display)

- [x] Task 2: API POST /api/leads/create-batch (AC: #2, #3, #6)
  - [x] 2.1 Create route file `src/app/api/leads/create-batch/route.ts`
  - [x] 2.2 Define Zod schema: array of lead data objects (apolloId, firstName, lastName, email, phone, companyName, companySize, industry, location, title, linkedinUrl, hasEmail, hasDirectPhone) + `source` string + `sourceTechnology` string
  - [x] 2.3 Auth check via `getCurrentUserProfile()` (existing pattern from `/api/leads/create/route.ts`)
  - [x] 2.4 Duplicate detection: query existing leads by email (not null) within tenant_id using `supabase.from("leads").select("id, email").eq("tenant_id", tenantId).in("email", emails)`
  - [x] 2.5 Also check by apollo_id (existing pattern from segment leads route) to cover leads without email
  - [x] 2.6 Insert only non-duplicate leads (skip those with matching email OR apollo_id), status="novo"
  - [x] 2.7 After insert, create `lead_interactions` records with type='import' and content=JSON string with source and technology metadata (ex: `{"source":"theirStack + Apollo","technology":"Netskope","createdVia":"technographic-prospecting"}`)
  - [x] 2.8 Return response: `{ data: { created: number, skipped: number, duplicateEmails: string[] }, message: string }`
  - [x] 2.9 Write unit tests for create-batch route (success, duplicates, validation errors, auth)

- [x] Task 3: Hook useCreateTechLeads (AC: #2, #3)
  - [x] 3.1 Create `src/hooks/use-create-tech-leads.ts`
  - [x] 3.2 TanStack Query mutation calling POST `/api/leads/create-batch`
  - [x] 3.3 Accept params: `{ leads: LeadDataForImport[], source: string, sourceTechnology: string }`
  - [x] 3.4 On success: invalidate leads query cache (`["leads"]` query key)
  - [x] 3.5 Return: `{ createLeads, isLoading, error, data }` (data contains created/skipped counts)
  - [x] 3.6 Write unit tests for hook

- [x] Task 4: CreateLeadsDialog component (AC: #1, #4, #5, #6)
  - [x] 4.1 Create `src/components/technographic/CreateLeadsDialog.tsx`
  - [x] 4.2 Dialog (shadcn/ui) opens via "Criar Leads" button; shows selected contacts count and summary
  - [x] 4.3 Step 1 - Create leads: call useCreateTechLeads; show loading state; on success show created/skipped counts
  - [x] 4.4 If duplicates found (skipped > 0), display info message: "X contatos ja existem como leads e foram ignorados"
  - [x] 4.5 Step 2 - Optional segment: show "Adicionar a um segmento?" section with segment dropdown (useSegments hook) and optional "Criar novo segmento" inline
  - [x] 4.6 On segment confirm: call useAddLeadsToSegment with the newly created lead data
  - [x] 4.7 Success state: show total created + segment info; "Fechar" button dismisses dialog
  - [x] 4.8 Use toast (sonner) for final success notification: "X leads criados com sucesso"
  - [x] 4.9 Use `flex flex-col gap-2` for all label+input wrappers (Tailwind CSS v4 pattern)
  - [x] 4.10 Write unit tests for CreateLeadsDialog (open, create flow, duplicate display, segment selection, success state)

- [x] Task 5: Integracao no TechnographicPageContent (AC: #1, #7)
  - [x] 5.1 Add `selectedContactIds` state (string[]) to TechnographicPageContent
  - [x] 5.2 Pass selectedContactIds and onSelectionChange to ContactResultsTable
  - [x] 5.3 Add "Criar Leads" Button below ContactResultsTable when selectedContactIds.length > 0
  - [x] 5.4 Wire "Criar Leads" button to open CreateLeadsDialog with selected contacts and selectedTechnologies context
  - [x] 5.5 Reset selectedContactIds after successful lead creation
  - [x] 5.6 Pass `selectedTechnologies` to CreateLeadsDialog for source metadata (technology names)
  - [x] 5.7 Write unit tests for TechnographicPageContent integration (button visibility, dialog open, state reset)

## Dev Notes

### Architecture & Patterns

- **API Routes (not Server Actions)**: All external integration and data mutation uses API routes. Follow existing pattern in `src/app/api/leads/create/route.ts` and `src/app/api/segments/[segmentId]/leads/route.ts`
- **Auth pattern**: Use `getCurrentUserProfile()` from `@/lib/supabase/tenant` to get tenant_id. RLS enforces tenant isolation at DB level
- **Supabase partial unique index caveat**: The leads table has a partial unique index `(tenant_id, apollo_id) WHERE apollo_id IS NOT NULL`. Supabase's `onConflict` doesn't work with partial indexes — use manual check + insert pattern (same as segment leads route)
- **TanStack Query cache invalidation**: Invalidate `["leads"]` on successful creation so leads page reflects new data
- **Toast notifications**: Project uses sonner via `@/components/ui/sonner`. Import `toast` from `sonner`

### Source Metadata Strategy

The Lead table schema does NOT have source/metadata columns. Instead of adding a migration, use the existing `lead_interactions` table:
- Type: `'import'` (already in the interaction_type enum)
- Content: JSON string with source details
- Created after lead insertion, linking to the new lead's ID
- This preserves technology origin while keeping the lead schema clean and backward-compatible

Example interaction content:
```json
{"source": "theirStack + Apollo", "technology": "Netskope", "createdVia": "technographic-prospecting"}
```

### Duplicate Detection Strategy

AC #6 requires duplicate detection by **email** (not just apollo_id). The flow:
1. Collect all non-null emails from selected contacts
2. Query `leads` table: `SELECT id, email FROM leads WHERE tenant_id = ? AND email IN (?)`
3. Also query by apollo_id (existing pattern): `SELECT id, apollo_id FROM leads WHERE tenant_id = ? AND apollo_id IN (?)`
4. Union of duplicates = contacts with matching email OR matching apollo_id
5. Skip duplicates (don't insert), return skipped count and duplicate emails for UI display
6. No "update existing" option needed — AC says "offers option to skip or update" but simplest MVP: skip by default with count displayed

### Contacts Are Already Lead Objects

The contacts from `useContactSearch()` hook are already transformed into `Lead[]` objects (via `transformApolloToLeadRow` in the Apollo API route). They have:
- `id` (random UUID, not persisted)
- `apolloId` (from Apollo)
- `firstName`, `lastName`, `email`, `title`, `companyName`, `linkedinUrl`
- `hasEmail`, `hasDirectPhone` (availability flags)
- `_isImported = false` (not yet in DB)

To convert for batch creation, extract `LeadDataForImport` fields from the `Lead` objects.

### Checkbox Selection Pattern (from CompanyResultsTable)

CompanyResultsTable uses this exact pattern for checkboxes — replicate in ContactResultsTable:
```tsx
// Header checkbox
<Checkbox
  checked={allSelected}
  onCheckedChange={(checked) => {
    if (checked) {
      onSelectionChange(contacts.map(c => c.id));
    } else {
      onSelectionChange([]);
    }
  }}
  data-testid="select-all-contacts"
/>

// Row checkbox
<Checkbox
  checked={selectedIds.includes(contact.id)}
  onCheckedChange={(checked) => {
    if (checked) {
      onSelectionChange([...selectedIds, contact.id]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== contact.id));
    }
  }}
  data-testid={`select-contact-${contact.id}`}
/>
```

### Segment Addition Flow

After leads are created (Task 2), the optional segment step should:
1. Fetch segments via `useSegments()` (already cached, 5min staleTime)
2. User picks a segment from a `Select` dropdown
3. Transform created leads to `LeadDataForSegment[]` format
4. Call `useAddLeadsToSegment({ segmentId, leads })` — this handles the upsert+association

**Important**: The segment route's upsert uses `apollo_id` for dedup. Since our leads were just created with apollo_id, this works seamlessly. The leads won't be re-inserted; only the associations will be created.

### File Structure

New files to create:
```
src/app/api/leads/create-batch/route.ts          # Task 2
src/hooks/use-create-tech-leads.ts                # Task 3
src/components/technographic/CreateLeadsDialog.tsx # Task 4
```

Files to modify:
```
src/components/technographic/ContactResultsTable.tsx     # Task 1 (add selection)
src/components/technographic/TechnographicPageContent.tsx # Task 5 (wire up)
```

### Testing Standards

- Vitest with React Testing Library
- Mock fetch calls with `vi.fn()` / `vi.spyOn(global, 'fetch')`
- Mock TanStack Query hooks in component tests
- Mock `getCurrentUserProfile` and `createClient` in API route tests
- Test files: colocated as `__tests__/ComponentName.test.tsx` or `route.test.ts`
- Run with: `npx vitest run`
- ESLint enforces no-console — use console.error only in catch blocks (existing pattern)

### Tailwind CSS v4 Reminder

Use `flex flex-col gap-*` instead of `space-y-*` for all label+input wrappers. The `space-y-*` utility does NOT work with Radix UI components in Tailwind CSS v4.

### Previous Story Intelligence (15.4)

Story 15.4 implemented:
- `useContactSearch` hook calling POST `/api/integrations/apollo` with domains+titles
- `ContactSearchDialog` for entering title filters
- `ContactResultsTable` displaying contacts with availability badges
- Integration in TechnographicPageContent orchestrating the flow
- 49 tests, all passing. Total regression: 5330 tests

Key learnings from 15.4:
- Apollo `api_search` returns limited fields (obfuscated last_name, no full email/phone) — this is expected and handled via availability badges
- The `apollo_id` field is critical — it comes from both theirStack company results AND Apollo person results
- Contact data from Apollo may have `hasEmail=true` but `email=null` (email revealed only after enrichment)

### Git Intelligence

Recent commits (all on branch `epic/15-technographic-prospecting`):
```
49c5ff2 fix: corrigir erros TypeScript que quebravam build de producao
34488ab feat(story-15.4): apollo bridge busca contatos empresas + code review fixes
8bd9415 feat(story-15.3): resultados empresas tabela selecao + code review fixes
3b68585 feat(story-15.2): busca technografica autocomplete filtros + code review fixes
426e5ce feat(story-15.1): integracao theirStack config, teste conexao e credits + code review fixes
```

All epic 15 stories follow the pattern: single commit with `feat(story-15.X): description + code review fixes`

### Project Structure Notes

- All technographic components are in `src/components/technographic/`
- Hooks are in `src/hooks/`
- API routes follow Next.js App Router convention: `src/app/api/[resource]/route.ts`
- Types are in `src/types/`
- Services are in `src/lib/services/`
- UI language: Brazilian Portuguese for all user-facing text

### References

- [Source: _bmad-output/planning-artifacts/epic-15-technographic-prospecting.md#Story 15.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Models]
- [Source: _bmad-output/planning-artifacts/prd.md#FR7-FR12 Lead Management]
- [Source: src/components/technographic/ContactResultsTable.tsx - current component to extend]
- [Source: src/components/technographic/TechnographicPageContent.tsx - orchestrator to update]
- [Source: src/components/technographic/CompanyResultsTable.tsx - checkbox selection pattern reference]
- [Source: src/app/api/segments/[segmentId]/leads/route.ts - upsert and association pattern]
- [Source: src/app/api/leads/create/route.ts - manual lead creation pattern]
- [Source: src/hooks/use-segments.ts - segment hooks to reuse]
- [Source: src/types/lead.ts - Lead, LeadRow, LeadDataForImport interfaces]
- [Source: src/types/segment.ts - LeadDataForSegment, AddLeadsToSegmentRequest]
- [Source: supabase/migrations/00013_create_lead_interactions.sql - interaction_type enum includes 'import']

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

Nenhum issue encontrado durante implementação.

### Completion Notes List

- Task 1: Adicionados props opcionais `selectedIds`/`onSelectionChange` ao ContactResultsTable com checkboxes header/row, counter de seleção e padrão idêntico ao CompanyResultsTable. 7 novos testes.
- Task 2: Criada API route POST /api/leads/create-batch com Zod validation, auth via getCurrentUserProfile, dedup por email E apollo_id, insert com status="novo", criação de lead_interactions com metadata de source/technology. 8 testes.
- Task 3: Criado hook useCreateTechLeads com TanStack Query mutation, invalidação de cache ["leads"] no success. 3 testes.
- Task 4: Criado CreateLeadsDialog com fluxo de 3 steps (confirm → creating → result), exibição de duplicatas, seleção opcional de segmento via useSegments/useAddLeadsToSegment, toasts sonner. 4 testes.
- Task 5: Integrado no TechnographicPageContent com estado selectedContactIds, botão "Criar Leads" condicional, CreateLeadsDialog wired com selectedContacts e sourceTechnologies. Reset de seleção após sucesso. 3 novos testes.
- Total: 25 novos testes. Regressão completa: 5357 testes passando, 0 falhas.

### File List

**Novos:**
- src/app/api/leads/create-batch/route.ts
- src/hooks/use-create-tech-leads.ts
- src/components/technographic/CreateLeadsDialog.tsx
- __tests__/unit/api/leads/create-batch.test.ts
- __tests__/unit/hooks/use-create-tech-leads.test.tsx
- __tests__/unit/components/technographic/CreateLeadsDialog.test.tsx

**Modificados:**
- src/components/technographic/ContactResultsTable.tsx
- src/components/technographic/TechnographicPageContent.tsx
- __tests__/unit/components/technographic/ContactResultsTable.test.tsx
- __tests__/unit/components/technographic/TechnographicPageContent.test.tsx

### Change Log

- 2026-03-25: Implementação completa da Story 15.5 — criação de leads a partir de contatos Apollo com detecção de duplicatas, metadata de source via lead_interactions, e integração opcional com segmentos.
- 2026-03-25: Code Review — 6 issues corrigidos:
  - [H1] +5 testes CreateLeadsDialog: result step, duplicate display (AC#6), segment dropdown (AC#5), error handling, fechar button
  - [M1] CreateLeadsDialog render condicional (evita hooks desnecessários quando dialog fechado)
  - [M2] Filter contatos sem apolloId antes de enviar à API (previne falha de validação Zod)
  - [M3] Zod max(100) no batch para prevenir falha PostgREST com arrays grandes
  - [L1] Merge contactToImportData + contactToSegmentData → contactToLeadData (elimina duplicação)
  - [L2] +1 teste API route 500 (insert error path)
