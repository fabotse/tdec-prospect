# Story 3.8: Lead Table Pagination

Status: done

## Story

As a user,
I want to navigate through paginated search results,
So that I can browse large datasets efficiently without overwhelming the interface.

## Acceptance Criteria

1. **AC #1 - Pagination Controls Display**
   - Given leads have been fetched
   - When results are displayed
   - Then I see pagination controls below the table
   - And I see "Mostrando X-Y de Z resultados" indicator
   - And controls include Previous/Next buttons
   - And controls include page number indicator (current/total)

2. **AC #2 - Page Navigation**
   - Given I am viewing page 1 of results
   - When I click "Próximo"
   - Then the table shows page 2 results
   - And the pagination indicator updates to reflect current page
   - And the Previous button becomes enabled

3. **AC #3 - Items Per Page Selector**
   - Given I am on the leads page
   - When I click on the items per page selector
   - Then I see options: 10, 25, 50, 100
   - And selecting a different value refreshes results with new page size
   - And current page resets to 1 when changing page size

4. **AC #4 - Apollo API Limits Respected**
   - Given Apollo limits results to 100 per page and 500 pages max
   - When pagination parameters are sent
   - Then page never exceeds 500
   - And perPage never exceeds 100
   - And total_entries from Apollo is used for pagination calculations

5. **AC #5 - Pagination State Persistence**
   - Given I navigate to page 5
   - When I apply new filters
   - Then page resets to 1
   - But perPage preference is preserved

6. **AC #6 - Loading State During Page Changes**
   - Given I click on a pagination control
   - When the new page is being fetched
   - Then table shows loading skeleton or overlay
   - And pagination controls are disabled during loading

7. **AC #7 - Edge Cases Handling**
   - Given there are 0 results
   - When displaying pagination
   - Then pagination controls are hidden
   - And empty state is shown

   - Given there is only 1 page of results
   - When displaying pagination
   - Then Previous/Next are disabled appropriately
   - And page selector is optional to display

8. **AC #8 - Keyboard Accessibility**
   - Given pagination controls are focused
   - When I use keyboard navigation
   - Then I can navigate between controls with Tab
   - And I can activate buttons with Enter/Space

## Tasks / Subtasks

- [x] Task 1: Update ApolloService to return pagination metadata (AC: #4)
  - [x] 1.1 Modify `searchPeople()` to return `{ leads, pagination }` object
  - [x] 1.2 Include `totalEntries`, `page`, `perPage`, `totalPages` in response
  - [x] 1.3 Cap `totalPages` at 500 per Apollo limits
  - [x] 1.4 Update return type in service

- [x] Task 2: Update API Route to pass pagination metadata (AC: #4)
  - [x] 2.1 Modify `/api/integrations/apollo/route.ts` response
  - [x] 2.2 Update `meta` to include `total` (from Apollo), `page`, `limit`, `totalPages`
  - [x] 2.3 Validate pagination params (page 1-500, perPage 1-100)

- [x] Task 3: Update Types (AC: #1, #4)
  - [x] 3.1 Create `PaginationMeta` type
  - [x] 3.2 Update `APISuccessResponse` to ensure pagination meta compatibility
  - [x] 3.3 Add `ApolloSearchResult` type with pagination

- [x] Task 4: Update use-leads hook (AC: #2, #5, #6)
  - [x] 4.1 Modify `useLeads` to return pagination metadata
  - [x] 4.2 Modify `useSearchLeads` to handle pagination state
  - [x] 4.3 Add `setPage` and `setPerPage` actions
  - [x] 4.4 Reset page to 1 when filters change

- [x] Task 5: Create Pagination component (AC: #1, #2, #3, #7, #8)
  - [x] 5.1 Create `LeadTablePagination.tsx` component
  - [x] 5.2 Implement Previous/Next buttons
  - [x] 5.3 Implement page indicator "Página X de Y"
  - [x] 5.4 Implement items per page selector (10, 25, 50, 100)
  - [x] 5.5 Add "Mostrando X-Y de Z resultados" text
  - [x] 5.6 Handle edge cases (0 results, 1 page)
  - [x] 5.7 Ensure keyboard accessibility

- [x] Task 6: Integrate pagination into LeadsPageContent (AC: #1, #6)
  - [x] 6.1 Add pagination state management
  - [x] 6.2 Pass pagination props to LeadTable area
  - [x] 6.3 Show loading state during page changes
  - [x] 6.4 Position pagination controls below table

- [x] Task 7: Write tests (AC: all)
  - [x] 7.1 Unit tests for pagination component (23 tests passing)
  - [x] 7.2 Test edge cases (0 results, 1 page, max page)
  - [x] 7.3 Test loading states and accessibility

## Dev Notes

### Apollo API Pagination Limits (Critical)

From Apollo documentation:
- **Maximum 100 records per page** (`per_page` parameter)
- **Maximum 500 pages** (50,000 records total)
- Parameters: `page` (1-based), `per_page`
- Response includes: `total_entries` (total matching records)

```typescript
// Example Apollo response
{
  "total_entries": 232764882,
  "people": [...]
}
```

### Architecture Patterns to Follow

**API Response Format** (from architecture.md):
```typescript
interface APISuccessResponse<T> {
  data: T;
  meta?: {
    total?: number;    // total_entries from Apollo
    page?: number;
    limit?: number;    // perPage
    totalPages?: number;
  };
}
```

**TanStack Query Pattern** (from architecture.md):
```typescript
export function useLeads(filters?: ApolloSearchFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => fetchLeads(filters),
    staleTime: 5 * 60 * 1000,
  });
}
```

### Existing Code Context

**ApolloService.searchPeople()** - [Source: src/lib/services/apollo.ts:241-268]
- Already accepts `page` and `perPage` in filters
- Uses `buildQueryString()` to add pagination params
- Currently returns only `LeadRow[]`, needs to also return `total_entries`

**API Route** - [Source: src/app/api/integrations/apollo/route.ts:89-96]
- Currently returns `meta.total: leads.length` (wrong - should be Apollo's total_entries)
- Needs to pass through the real total from Apollo response

**LeadTable** - [Source: src/components/leads/LeadTable.tsx]
- No pagination props or controls
- Receives `leads: Lead[]` without pagination metadata
- Add pagination controls below the table component

**use-leads hook** - [Source: src/hooks/use-leads.ts]
- Returns `data: Lead[]` without pagination info
- Needs to return pagination metadata from API response

### UI Design Guidelines

From UX specification:
- Use shadcn/ui components for consistency
- Spacing: base 4px, multiples of 8
- Border radius: 6px (default)
- Dark mode compatible
- Portuguese labels: "Anterior", "Próximo", "Página", "de", "Mostrando", "resultados"

### File Locations

| File | Purpose |
|------|---------|
| `src/lib/services/apollo.ts` | Add pagination return type |
| `src/app/api/integrations/apollo/route.ts` | Return pagination meta |
| `src/types/apollo.ts` | Add SearchResult type with pagination |
| `src/types/api.ts` | Ensure PaginationMeta compatibility |
| `src/hooks/use-leads.ts` | Handle pagination state |
| `src/components/leads/LeadTablePagination.tsx` | NEW: Pagination controls |
| `src/components/leads/LeadsPageContent.tsx` | Integrate pagination |

### Project Structure Notes

- Pagination component goes in `src/components/leads/`
- Follow naming convention: `LeadTablePagination.tsx`
- Export from `src/components/leads/index.ts`
- Tests in `__tests__/unit/components/leads/`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#API-Response-Format]
- [Source: _bmad-output/planning-artifacts/architecture.md#TanStack-Query-Pattern]
- [Source: src/lib/services/apollo.ts#buildQueryString]
- [Source: src/types/apollo.ts#ApolloSearchFilters]
- [Apollo API Docs: People API Search - Pagination Parameters]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Tests executed: 23 tests passing in LeadTablePagination.test.tsx
- Lint: No new errors introduced in modified files

### Completion Notes List

- **Task 1**: ApolloService.searchPeople() now returns `ApolloSearchResult` with `{ leads, pagination }`. Added `APOLLO_MAX_PAGES = 500` constant and caps `totalPages` at 500.

- **Task 2**: API Route updated to extract pagination from service response. Validation added for `page` (1-500) and `perPage` (1-100). Response meta now includes `total` from Apollo's `total_entries`, `page`, `limit`, and `totalPages`.

- **Task 3**: Created `PaginationMeta` and `ApolloSearchResult` types in `src/types/apollo.ts`. Updated `APISuccessResponse` in `src/types/api.ts` to include `totalPages` in meta.

- **Task 4**: Rewrote `use-leads.ts` hook to return pagination metadata. Added `page`, `perPage`, `setPage`, `setPerPage`, `resetPage` to `useSearchLeads`. Page resets to 1 when filters change or perPage changes.

- **Task 5**: Created `LeadTablePagination.tsx` component with:
  - Previous/Next buttons with proper disabled states
  - Page indicator "Página X de Y"
  - Items per page selector (10, 25, 50, 100)
  - Results counter "Mostrando X-Y de Z resultados"
  - Edge case handling (hidden when 0 results, no nav buttons when 1 page)
  - Full keyboard accessibility with aria labels

- **Task 6**: Integrated pagination into `LeadsPageContent.tsx`:
  - Pagination controls appear below the table for manual search mode
  - Loading state disables all pagination controls
  - Page resets to 1 when new search is executed
  - Current filters stored for pagination re-fetch

- **Task 7**: Comprehensive unit tests with 23 tests covering all ACs:
  - Edge cases (null pagination, 0 results, 1 page)
  - Display tests (results counter, page indicator, buttons)
  - Navigation tests (prev/next, disabled states)
  - Loading state tests
  - Accessibility tests (ARIA labels, keyboard navigation)
  - Number formatting (Brazilian locale)

### File List

| Action | File |
|--------|------|
| Modified | src/lib/services/apollo.ts |
| Modified | src/app/api/integrations/apollo/route.ts |
| Modified | src/types/apollo.ts |
| Modified | src/types/api.ts |
| Modified | src/hooks/use-leads.ts |
| Created | src/components/leads/LeadTablePagination.tsx |
| Modified | src/components/leads/LeadsPageContent.tsx |
| Modified | src/components/leads/index.ts |
| Created | __tests__/unit/components/leads/LeadTablePagination.test.tsx |
| Modified | __tests__/unit/hooks/use-leads.test.tsx |

### Senior Developer Review (AI)

**Review Date:** 2026-01-31
**Reviewer:** Claude Opus 4.5
**Outcome:** Changes Requested → Fixed

**Issues Found and Fixed:**

1. **[HIGH] Race Condition na Paginação** - `handlePageChange` e `handlePerPageChange` chamavam `search()` imediatamente após `setState`, usando valores antigos do closure. **Fix:** Hook `search()` agora aceita page/perPage explícitos nos filters que sobrescrevem o estado interno; handlers passam valores explícitos.

2. **[MEDIUM] useEffect vazio/código morto** - useEffect nas linhas 156-162 não executava nenhuma ação. **Fix:** Removido completamente.

3. **[MEDIUM] Testes faltando para paginação** - Novas funções `setPage`, `setPerPage`, `resetPage` não tinham cobertura de testes. **Fix:** Adicionados 11 testes para funções de paginação em `use-leads.test.tsx`.

4. **[LOW] File List incompleta** - `__tests__/unit/hooks/use-leads.test.tsx` não estava documentado. **Fix:** Adicionado à File List.

**Test Results After Fix:**
- LeadTablePagination.test.tsx: 23 tests passing ✓
- use-leads.test.tsx: 25 tests passing (14 original + 11 new pagination tests) ✓
