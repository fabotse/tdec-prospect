# Story 6.5.6: Icebreaker UI - Lead Table Integration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see and generate icebreakers from the lead table,
So that I can easily enrich my leads with personalized openers.

## Acceptance Criteria

### AC #1: Icebreaker Column in Lead Table
**Given** I am on "Meus Leads" page
**When** I view the leads table
**Then** I see a new column "Icebreaker" (after Status column)
**And** leads with icebreakers show the text (truncated with tooltip for full text)
**And** leads without icebreakers show "—" or empty state
**And** the column header has tooltip: "Gerado automaticamente a partir dos posts do LinkedIn"

### AC #2: Bulk Icebreaker Generation via Selection Bar
**Given** I have leads selected (checkboxes)
**When** I click "Gerar Icebreaker" in the selection bar
**Then** I see a confirmation: "Gerar icebreaker para X leads? Custo estimado: ~$Y"
**And** clicking "Gerar" starts the enrichment process
**And** I see progress: "Gerando icebreakers... X de Y"
**And** leads are updated in real-time as each completes
**And** completion shows summary toast: "Z icebreakers gerados, W erros"

### AC #3: Icebreaker Section in Detail Panel
**Given** I click on a lead row to open detail panel
**When** the panel opens
**Then** I see an "Icebreaker" section (after Enrich button, before Lead Info)
**And** if icebreaker exists: I see the full text with "Regenerar" button
**And** if no icebreaker: I see "Gerar Icebreaker" button
**And** clicking either button triggers generation for that single lead

### AC #4: Loading States
**Given** generation is in progress for a lead
**When** I view the lead
**Then** I see loading spinner in the icebreaker column/section
**And** the button is disabled during generation

### AC #5: No LinkedIn URL Error Handling
**Given** a lead has no LinkedIn URL
**When** I try to generate icebreaker
**Then** I see error: "Este lead nao possui LinkedIn cadastrado"
**And** suggestion: "Atualize os dados do lead para incluir o LinkedIn"

### AC #6: Generation Timestamp Display
**Given** a lead has an icebreaker
**When** I view the icebreaker section in detail panel
**Then** I see when it was generated: "Gerado em DD/MM/YYYY HH:MM"

## Tasks / Subtasks

- [x] Task 1: Add Icebreaker Column to LeadTable (AC: #1, #4)
  - [x] 1.1 Add icebreaker to COLUMNS array with defaultWidth: 200, minWidth: 150
  - [x] 1.2 Create IcebreakerCell sub-component with truncation and tooltip
  - [x] 1.3 Handle null/empty state with "—" display
  - [x] 1.4 Add column header tooltip explaining LinkedIn posts source
  - [x] 1.5 Add loading state with Loader2 spinner when generating

- [x] Task 2: Create useIcebreakerEnrichment Hook (AC: #2, #3, #4)
  - [x] 2.1 Create hook file `src/hooks/use-icebreaker-enrichment.ts`
  - [x] 2.2 Implement single lead generation mutation
  - [x] 2.3 Implement bulk generation with progress callback
  - [x] 2.4 Add toast feedback for success/error
  - [x] 2.5 Integrate with TanStack Query cache invalidation

- [x] Task 3: Add Button to LeadSelectionBar (AC: #2, #4)
  - [x] 3.1 Add showIcebreaker prop to LeadSelectionBarProps
  - [x] 3.2 Add icebreaker progress state (current/total/isRunning)
  - [x] 3.3 Create "Gerar Icebreaker" button with Sparkles icon
  - [x] 3.4 Implement handleGenerateIcebreakers with batch loop
  - [x] 3.5 Show progress during bulk generation
  - [x] 3.6 Show confirmation dialog with cost estimate before generation

- [x] Task 4: Add Icebreaker Section to LeadDetailPanel (AC: #3, #4, #5, #6)
  - [x] 4.1 Add Icebreaker section component between Enrich and Info sections
  - [x] 4.2 Display full icebreaker text with proper formatting
  - [x] 4.3 Add "Regenerar" button for existing icebreakers
  - [x] 4.4 Add "Gerar Icebreaker" button for leads without icebreaker
  - [x] 4.5 Show loading state during generation
  - [x] 4.6 Handle no LinkedIn URL error with user-friendly message
  - [x] 4.7 Display generation timestamp when available

- [x] Task 5: Update MyLeadsPage Integration (AC: #1, #2)
  - [x] 5.1 Pass showIcebreaker={true} to LeadTable
  - [x] 5.2 Pass showIcebreaker={true} to LeadSelectionBar
  - [x] 5.3 Ensure proper data refresh after generation

- [x] Task 6: Unit Tests
  - [x] 6.1 Test icebreaker column renders correctly with/without data
  - [x] 6.2 Test truncation and tooltip behavior
  - [x] 6.3 Test selection bar button visibility and click behavior
  - [x] 6.4 Test detail panel icebreaker section states
  - [x] 6.5 Test loading states during generation
  - [x] 6.6 Test error handling for missing LinkedIn URL
  - [x] 6.7 Test hook mutation and progress tracking

## Dev Notes

### Story Context - Why This Feature

**Problem:** Stories 6.5.1-6.5.5 created the complete backend infrastructure for Icebreaker Premium (Apify integration, LinkedIn posts fetching, AI prompt, database schema, API endpoint). Now users need a UI to actually see and generate these icebreakers.

**Solution:** Add UI integration in three places:
1. **LeadTable column** - Show icebreaker text inline with truncation
2. **LeadSelectionBar button** - Bulk generation for selected leads
3. **LeadDetailPanel section** - Single lead generation and regeneration

**User Value:** Users can now generate highly personalized icebreakers based on real LinkedIn posts, increasing email response rates.

### Integration with Epic 6.5 Architecture

| Story | Status | Integration Point |
|-------|--------|-------------------|
| 6.5.1 | **DONE** | Apify credentials in api_configs table |
| 6.5.2 | **DONE** | ApifyService.fetchLinkedInPosts() |
| 6.5.3 | **DONE** | icebreaker_premium_generation prompt |
| 6.5.4 | **DONE** | Lead.icebreaker, icebreakerGeneratedAt, linkedinPostsCache fields |
| 6.5.5 | **DONE** | POST /api/leads/enrich-icebreaker endpoint |
| **6.5.6** (this story) | **IN PROGRESS** | UI components to trigger and display icebreakers |
| 6.5.7 | Backlog | Email generation integration |

### API Endpoint Reference (from Story 6.5.5)

**Endpoint:** `POST /api/leads/enrich-icebreaker`

**Request:**
```typescript
{
  leadIds: string[];      // Array of lead UUIDs (max 50)
  regenerate?: boolean;   // Default: false - skip existing icebreakers
}
```

**Response:**
```typescript
{
  success: boolean;
  results: Array<{
    leadId: string;
    success: boolean;
    icebreaker?: string;
    error?: string;
  }>;
  summary: {
    total: number;
    generated: number;
    skipped: number;
    failed: number;
  };
}
```

**Error Messages (Portuguese):**
- "Lead sem LinkedIn URL"
- "Nenhum post encontrado"
- "Erro ao buscar posts do LinkedIn"
- "Erro ao gerar icebreaker"

### Component Patterns to Follow

#### LeadTable Column Pattern
**File:** `src/components/leads/LeadTable.tsx`

```typescript
// Add to COLUMNS array (around line 165)
{
  key: "icebreaker",
  label: "Icebreaker",
  defaultWidth: 200,
  minWidth: 150,
  sortable: false,
  truncate: true,
}

// Cell rendering - use TruncatedCell pattern (lines 798-835)
// For loading state, check if leadId is in generatingIds Set
```

#### LeadSelectionBar Button Pattern
**File:** `src/components/leads/LeadSelectionBar.tsx`

```typescript
// Add to LeadSelectionBarProps
showIcebreaker?: boolean;

// Progress state pattern (reference lines 78-82)
const [icebreakerProgress, setIcebreakerProgress] = useState<{
  current: number;
  total: number;
  isRunning: boolean;
}>({ current: 0, total: 0, isRunning: false });

// Button placement: after "Enriquecer" button, before "Buscar Telefone"
```

#### LeadDetailPanel Section Pattern
**File:** `src/components/leads/LeadDetailPanel.tsx`

```typescript
// Section structure (reference Info section lines 489-531)
<section className="space-y-2">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
      Icebreaker
    </h3>
    {/* Regenerar button if exists */}
  </div>
  <div className="rounded-lg border bg-card p-4">
    {/* Content: loading / empty / icebreaker text */}
  </div>
  {/* Generation timestamp */}
</section>
```

### Hook Implementation Pattern

**File:** `src/hooks/use-icebreaker-enrichment.ts`

```typescript
// Follow useEnrichPersistedLead pattern (src/hooks/use-enrich-persisted-lead.ts)

interface UseIcebreakerEnrichmentOptions {
  onProgress?: (current: number, total: number) => void;
  onComplete?: (results: EnrichIcebreakerResult[]) => void;
}

export function useIcebreakerEnrichment(options?: UseIcebreakerEnrichmentOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ leadIds, regenerate }: { leadIds: string[]; regenerate?: boolean }) => {
      const response = await fetch("/api/leads/enrich-icebreaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, regenerate }),
      });

      if (!response.ok) {
        throw new Error("Erro ao gerar icebreakers");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
    },
  });

  // Single lead generation helper
  const generateForLead = async (leadId: string, regenerate = false) => {
    return mutation.mutateAsync({ leadIds: [leadId], regenerate });
  };

  // Bulk generation with progress
  const generateForLeads = async (leadIds: string[], regenerate = false) => {
    // Process one by one for progress tracking
    const results: EnrichIcebreakerResult[] = [];
    for (let i = 0; i < leadIds.length; i++) {
      options?.onProgress?.(i + 1, leadIds.length);
      const result = await mutation.mutateAsync({ leadIds: [leadIds[i]], regenerate });
      results.push(...result.results);
    }
    options?.onComplete?.(results);
    return results;
  };

  return {
    mutation,
    generateForLead,
    generateForLeads,
    isGenerating: mutation.isPending,
  };
}
```

### UI Components & Icons to Use

```typescript
// From lucide-react
import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";

// From shadcn/ui
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

### Cost Estimation Logic

```typescript
// Per lead: ~$0.004 (Apify + OpenAI)
const COST_PER_LEAD = 0.004;

const estimatedCost = (leadCount: number) => {
  const cost = leadCount * COST_PER_LEAD;
  return cost < 0.01 ? "<$0.01" : `~$${cost.toFixed(2)}`;
};

// Confirmation message example:
// "Gerar icebreaker para 10 leads? Custo estimado: ~$0.04"
```

### Testing Strategy

**Unit Tests** (`__tests__/unit/components/leads/`):

1. **LeadTable.test.tsx** - Add tests:
   - Icebreaker column renders when data exists
   - Icebreaker column shows "—" for null
   - Tooltip shows full text on hover

2. **LeadSelectionBar.test.tsx** - Add tests:
   - Button visible when showIcebreaker={true}
   - Button hidden when showIcebreaker={false}
   - Button disabled during generation
   - Progress display during generation

3. **LeadDetailPanel.test.tsx** - Add tests:
   - Section displays icebreaker text
   - "Gerar" button for leads without icebreaker
   - "Regenerar" button for leads with icebreaker
   - Loading state during generation
   - Error message for missing LinkedIn URL
   - Timestamp display

4. **use-icebreaker-enrichment.test.tsx** - New file:
   - Single lead generation
   - Bulk generation with progress
   - Error handling
   - Cache invalidation

**Mock Data:**
```typescript
const mockLeadWithIcebreaker = {
  id: "lead-1",
  firstName: "John",
  // ... other fields
  icebreaker: "Vi que voce postou sobre IA recentemente. Muito interessante!",
  icebreakerGeneratedAt: "2026-02-04T10:00:00Z",
  linkedinPostsCache: { posts: [], fetchedAt: "", profileUrl: "" },
};

const mockLeadWithoutIcebreaker = {
  id: "lead-2",
  firstName: "Jane",
  // ... other fields
  icebreaker: null,
  icebreakerGeneratedAt: null,
  linkedinPostsCache: null,
};

const mockLeadNoLinkedIn = {
  id: "lead-3",
  firstName: "Bob",
  linkedinUrl: null,
  // ... other fields
};
```

### Previous Story Learnings (from 6.5.5)

1. **Portuguese error messages** - All user-facing errors must be in Portuguese
2. **Batch processing** - API processes in batches of 5 to avoid rate limits
3. **Graceful degradation** - Missing posts is not an error, just returns empty
4. **Summary statistics** - Include total/generated/skipped/failed in response
5. **KB context integration** - Icebreakers use tenant's knowledge base for context

### Architecture Compliance

| Requirement | Implementation |
|-------------|----------------|
| Component naming | PascalCase: IcebreakerCell, IcebreakerSection |
| Hook naming | camelCase: useIcebreakerEnrichment |
| File naming | kebab-case: use-icebreaker-enrichment.ts |
| Error messages | Portuguese (project standard) |
| State management | TanStack Query for server state |
| UI components | shadcn/ui (Button, Tooltip, AlertDialog) |
| Icons | lucide-react (Sparkles, Loader2, RefreshCw) |

### Project Structure Notes

**Files to create:**
```
src/hooks/use-icebreaker-enrichment.ts
__tests__/unit/hooks/use-icebreaker-enrichment.test.tsx
```

**Files to modify:**
```
src/components/leads/LeadTable.tsx          # Add icebreaker column
src/components/leads/LeadSelectionBar.tsx   # Add generation button
src/components/leads/LeadDetailPanel.tsx    # Add icebreaker section
src/app/(dashboard)/leads/my-leads/page.tsx # Pass showIcebreaker props
__tests__/unit/components/leads/LeadTable.test.tsx
__tests__/unit/components/leads/LeadSelectionBar.test.tsx
__tests__/unit/components/leads/LeadDetailPanel.test.tsx
```

**Files to reference (read-only):**
```
src/app/api/leads/enrich-icebreaker/route.ts  # API endpoint
src/types/lead.ts                              # Lead type with icebreaker fields
src/hooks/use-enrich-persisted-lead.ts         # Hook pattern reference
src/hooks/use-phone-lookup.ts                  # Progress tracking pattern
```

### Anti-Pattern Prevention

**DO NOT:**
- Call API directly from components (use the hook)
- Process all leads in parallel (will hit rate limits)
- Show technical error messages (translate to Portuguese)
- Forget to invalidate queries after generation
- Skip loading states (causes confusion)
- Forget confirmation dialog for bulk generation

**DO:**
- Create reusable hook for icebreaker operations
- Process leads one-by-one with progress tracking
- Show clear feedback at each step
- Use TanStack Query for cache management
- Follow existing component patterns exactly
- Add comprehensive tests for all states

### References

- [Source: epics.md - Story 6.5.6 acceptance criteria](../planning-artifacts/epics.md#story-656-icebreaker-ui---lead-table-integration)
- [Source: architecture.md - Component patterns, hook patterns](../planning-artifacts/architecture.md)
- [Source: 6-5-5-icebreaker-enrichment-api.md - API endpoint implementation](./6-5-5-icebreaker-enrichment-api.md)
- [Source: src/components/leads/LeadTable.tsx - Column and cell patterns](../../src/components/leads/LeadTable.tsx)
- [Source: src/components/leads/LeadSelectionBar.tsx - Button and progress patterns](../../src/components/leads/LeadSelectionBar.tsx)
- [Source: src/components/leads/LeadDetailPanel.tsx - Section patterns](../../src/components/leads/LeadDetailPanel.tsx)
- [Source: src/hooks/use-enrich-persisted-lead.ts - Hook pattern](../../src/hooks/use-enrich-persisted-lead.ts)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation completed without blocking issues.

### Completion Notes List

1. **Task 1 (LeadTable column)**: Added icebreaker column to COLUMNS array with truncation, tooltip, and loading states. Used Loader2 spinner for generation progress.

2. **Task 2 (useIcebreakerEnrichment hook)**: Created new hook following useEnrichPersistedLead pattern. Implements single lead and bulk generation with progress tracking. Added estimateIcebreakerCost utility function.

3. **Task 3 (LeadSelectionBar button)**: Added "Gerar Icebreaker" button with Sparkles icon, progress display during bulk generation, and confirmation dialog showing cost estimate.

4. **Task 4 (LeadDetailPanel section)**: Added IcebreakerSection component with full icebreaker text display, "Regenerar" button, "Gerar Icebreaker" button, loading states, no-LinkedIn error handling, and timestamp display.

5. **Task 5 (MyLeadsPage integration)**: Passed showIcebreaker prop to both LeadTable and LeadSelectionBar. Added generatingIcebreakerIds state for loading feedback.

6. **Task 6 (Unit tests)**: Added 45 new tests across 4 test files:
   - 18 tests in use-icebreaker-enrichment.test.tsx (new file)
   - 10 tests in LeadTable.test.tsx
   - 9 tests in LeadSelectionBar.test.tsx
   - 8 tests in LeadDetailPanel.test.tsx

All 139 tests passing (including existing tests).

### Code Review Fixes (2026-02-04)

Code review realizado e issues corrigidos:

1. **M1: Double Toast em Bulk Generation** - FIXED
   - Problema: `generateForLeads` chamava `mutation.mutateAsync` no loop, disparando toast para cada lead, mais toast final.
   - Solução: Alterado para chamar `generateIcebreakers` diretamente (API function) em vez da mutation, evitando toasts duplicados.
   - Arquivo: `src/hooks/use-icebreaker-enrichment.ts:165-213`

2. **L1: Error não capturado no catch** - FIXED
   - Problema: Catch block descartava o error sem usar.
   - Solução: Capturado error e incluído na mensagem do result.
   - Arquivo: `src/hooks/use-icebreaker-enrichment.ts:191`

3. **L2: Teste de tooltip para texto completo** - ADDED
   - Adicionados 2 testes para verificar truncation e tooltip structure no icebreaker column.
   - Arquivo: `__tests__/unit/components/leads/LeadTable.test.tsx`

4. **M3: Mock do useIcebreakerEnrichment** - ADDED
   - Adicionado mock do hook nos testes do LeadDetailPanel para evitar chamadas reais.
   - Arquivo: `__tests__/unit/components/leads/LeadDetailPanel.test.tsx`

Total de testes: **141 passando** (adicionados 2 novos testes).

### File List

**Created:**
- `src/hooks/use-icebreaker-enrichment.ts` - Hook for icebreaker generation with progress tracking
- `__tests__/unit/hooks/use-icebreaker-enrichment.test.tsx` - Unit tests for hook (18 tests)

**Modified:**
- `src/components/leads/LeadTable.tsx` - Added icebreaker column with IcebreakerCell component
- `src/components/leads/LeadSelectionBar.tsx` - Added "Gerar Icebreaker" button with confirmation dialog
- `src/components/leads/LeadDetailPanel.tsx` - Added IcebreakerSection component
- `src/components/leads/MyLeadsPageContent.tsx` - Integration with showIcebreaker props and generation callbacks
- `__tests__/unit/components/leads/LeadTable.test.tsx` - Added 10 icebreaker column tests
- `__tests__/unit/components/leads/LeadSelectionBar.test.tsx` - Added 9 icebreaker generation tests
- `__tests__/unit/components/leads/LeadDetailPanel.test.tsx` - Added 8 icebreaker section tests + hook mock (code review)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated story status

**Code Review Fixes (2026-02-04):**
- `src/hooks/use-icebreaker-enrichment.ts` - Fixed double toast, error capture
- `__tests__/unit/components/leads/LeadTable.test.tsx` - Added 2 tooltip tests (12 total now)
