# Story 3.6: Lead Selection (Individual & Batch)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to select leads individually or in batch,
So that I can perform actions on multiple leads.

## Context

Esta story implementa o sistema completo de seleção de leads com barra de ações flutuante. A Story 3.5 (Lead Table Display) já implementou os checkboxes de seleção individual e em lote (header), além do Zustand store `useSelectionStore`. Esta story adiciona a **barra de seleção flutuante** na parte inferior da tela que aparece quando leads são selecionados, exibindo o contador e botões de ação.

**Requisitos Funcionais Cobertos:** FR5 (seleção individual e em lote)

**Dependências:**
- Story 3.1 (Leads Page & Data Model) - DONE
- Story 3.5 (Lead Table Display) - DONE - Checkboxes já implementados, useSelectionStore criado
- Story 3.5.1 (Contact Availability) - DONE

**O que JÁ existe (não reimplementar):**
- `LeadTable` com checkboxes funcionais (seleção individual e "selecionar todos")
- `useSelectionStore` com `selectedIds`, `setSelectedIds`, `clearSelection`, `toggleSelection`, `addToSelection`, `removeFromSelection`
- Integração no `LeadsPageContent` usando o store

**O que FALTA implementar nesta story:**
- Componente `LeadSelectionBar` (barra flutuante inferior)
- Contador de leads selecionados ("X leads selecionados")
- Botões de ação: "Criar Campanha", menu dropdown "..."
- Persistência da seleção ao navegar entre filtros (verificar comportamento atual)

## Acceptance Criteria

1. **Given** I am viewing leads in the table
   **When** I click the checkbox on a row
   **Then** that lead is selected (checkbox filled)
   **And** a selection bar appears at bottom: "X leads selecionados"
   **And** the bar is fixed/sticky at the bottom of the viewport

2. **Given** I want to select all leads
   **When** I click the header checkbox
   **Then** all visible leads are selected
   **And** clicking again deselects all
   **And** selection count updates accordingly

3. **Given** leads are selected
   **When** I view the selection bar
   **Then** the selection bar shows action buttons: "Criar Campanha", "..."
   **And** "Criar Campanha" is the primary action button
   **And** "..." opens a dropdown menu with additional options

4. **Given** leads are selected and I modify filters
   **When** filters change and new search is performed
   **Then** selection state persists (IDs remain in store)
   **And** selected leads still show as selected if in new results
   **And** selection count reflects only leads currently visible and selected

5. **Given** I have leads selected
   **When** I click "Limpar Seleção" or the close button on the bar
   **Then** all selections are cleared
   **And** the selection bar disappears

6. **Given** no leads are selected
   **When** I view the leads page
   **Then** the selection bar is not visible

## Tasks / Subtasks

- [x] Task 1: Create LeadSelectionBar component (AC: #1, #3, #5, #6)
  - [x] Create `src/components/leads/LeadSelectionBar.tsx`
  - [x] Use fixed positioning at bottom of viewport
  - [x] Show selection count in Portuguese: "X lead(s) selecionado(s)"
  - [x] Add "Criar Campanha" primary button
  - [x] Add dropdown menu ("...") for additional actions
  - [x] Add clear selection button ("Limpar" or X icon)
  - [x] Animate in/out with Framer Motion (slide up/down)

- [x] Task 2: Integrate LeadSelectionBar with LeadsPageContent (AC: #1, #6)
  - [x] Import and add LeadSelectionBar to LeadsPageContent
  - [x] Connect to useSelectionStore
  - [x] Only render when selectedIds.length > 0
  - [x] Ensure bar has proper z-index above content

- [x] Task 3: Verify filter navigation persistence (AC: #4)
  - [x] Test that changing filters preserves selection in store
  - [x] Verify selected leads in new results show as selected
  - [x] Count should reflect intersection (selected AND visible)
  - [x] Write tests for persistence behavior

- [x] Task 4: Implement action button handlers (AC: #3)
  - [x] "Criar Campanha" → navigate to campaigns/new with selected lead IDs
  - [x] Pass selected IDs via query param or store
  - [x] Dropdown menu placeholder options (future stories)

- [x] Task 5: Update barrel exports and types
  - [x] Export LeadSelectionBar from `src/components/leads/index.ts`

- [x] Task 6: Write tests
  - [x] Unit tests for LeadSelectionBar rendering
  - [x] Unit tests for selection count display (singular/plural)
  - [x] Unit tests for visibility toggle based on selection
  - [x] Unit tests for clear selection functionality
  - [x] Integration tests for filter persistence

## Dev Notes

### Architecture Compliance

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Component naming | PascalCase: `LeadSelectionBar.tsx` |
| UI Components | shadcn/ui Button, DropdownMenu |
| State management | Zustand: `useSelectionStore` (already exists) |
| Animations | Framer Motion: AnimatePresence, motion.div |
| Error messages | All in Portuguese |
| Folder structure | Components in `src/components/leads/` |

### LeadSelectionBar Component Design

```typescript
// src/components/leads/LeadSelectionBar.tsx
"use client";

import { useSelectionStore } from "@/stores/use-selection-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";

interface LeadSelectionBarProps {
  /** Optional: limit count display to visible leads only */
  visibleSelectedCount?: number;
}

export function LeadSelectionBar({ visibleSelectedCount }: LeadSelectionBarProps) {
  const { selectedIds, clearSelection } = useSelectionStore();
  const router = useRouter();

  // Use visible count if provided, otherwise total selected
  const count = visibleSelectedCount ?? selectedIds.length;

  // Handle "Criar Campanha" action - pass selected IDs via query param
  const handleCreateCampaign = () => {
    const params = new URLSearchParams();
    params.set("leadIds", selectedIds.join(","));
    router.push(`/campaigns/new?${params.toString()}`);
  };

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        >
          <div className="container flex h-16 items-center justify-between px-4 md:px-8">
            {/* Selection count */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">
                {count} lead{count !== 1 ? "s" : ""} selecionado{count !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="text-muted-foreground hover:text-foreground"
              >
                Limpar
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button onClick={handleCreateCampaign}>
                Criar Campanha
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Mais opções</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled>
                    Adicionar ao Segmento (em breve)
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    Exportar CSV (em breve)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={clearSelection}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar barra de seleção</span>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### Integration in LeadsPageContent

```typescript
// LeadsPageContent.tsx updates
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { useMemo } from "react";

export function LeadsPageContent() {
  const { selectedIds } = useSelectionStore();
  // ... existing code ...

  // Count visible selected leads (intersection of selectedIds and current leads)
  const visibleSelectedCount = useMemo(() => {
    const visibleIds = new Set(leads.map(l => l.id));
    return selectedIds.filter(id => visibleIds.has(id)).length;
  }, [selectedIds, leads]);

  return (
    <div className="space-y-6">
      {/* ... existing content ... */}

      {/* Selection Bar - Fixed at bottom */}
      <LeadSelectionBar visibleSelectedCount={visibleSelectedCount} />
    </div>
  );
}
```

### Existing Selection Store Reference

```typescript
// src/stores/use-selection-store.ts (ALREADY EXISTS - DO NOT RECREATE)
interface SelectionState {
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
  toggleSelection: (id: string) => void;
  addToSelection: (ids: string[]) => void;
  removeFromSelection: (ids: string[]) => void;
}
```

### Project Structure

```
src/
├── components/
│   └── leads/
│       ├── LeadSelectionBar.tsx    # NEW - Selection action bar
│       ├── LeadTable.tsx           # EXISTS - Has checkboxes
│       ├── LeadsPageContent.tsx    # UPDATE - Add LeadSelectionBar
│       └── index.ts                # UPDATE - Add export
└── __tests__/
    └── unit/
        └── components/
            └── leads/
                └── LeadSelectionBar.test.tsx  # NEW
```

### UX/UI Guidelines (from UX Spec)

**Selection Bar Design:**
- Fixed at bottom of viewport
- Height: 64px (h-16)
- Background: semi-transparent with blur (matches header style)
- Border-top to separate from content
- Container padding consistent with page
- Z-index: 50 (above content, below modals)

**Animations (Framer Motion):**
- Slide up from bottom when appearing
- Slide down when disappearing
- Spring animation for natural feel
- Duration: ~300ms

**Portuguese Labels:**
- "X lead selecionado" (singular)
- "X leads selecionados" (plural)
- "Limpar" for clear selection
- "Criar Campanha" for primary action
- "Mais opções" for dropdown trigger (sr-only)

**Responsive:**
- Full width on mobile
- Container constrained on desktop
- Buttons stack if needed on small screens

### Testing Strategy

```typescript
// __tests__/unit/components/leads/LeadSelectionBar.test.tsx
describe("LeadSelectionBar", () => {
  // Visibility
  it("renders when visibleSelectedCount > 0");
  it("does not render when visibleSelectedCount is 0");
  it("does not render when no leads selected in store");

  // Content
  it("displays correct singular text for 1 lead");
  it("displays correct plural text for multiple leads");
  it("shows 'Criar Campanha' button");
  it("shows dropdown menu with options");

  // Interactions
  it("calls clearSelection when 'Limpar' clicked");
  it("calls clearSelection when X button clicked");
  it("navigates to campaigns/new when 'Criar Campanha' clicked");

  // Animation (optional)
  it("animates in when appearing");
  it("animates out when disappearing");
});
```

### Previous Story Intelligence (Story 3.5/3.5.1)

**Padrões estabelecidos:**
- Zustand store pattern for UI state
- Framer Motion for animations (used in search input)
- Portuguese labels throughout
- shadcn/ui components for UI elements
- Fixed/sticky positioning for persistent UI elements

**Arquivos relevantes:**
- `src/stores/use-selection-store.ts` - Selection state (DO NOT MODIFY)
- `src/components/leads/LeadTable.tsx` - Checkbox implementation
- `src/components/leads/LeadsPageContent.tsx` - Integration point

**Learnings from 3.5:**
- Selection store already has all needed methods
- LeadTable passes `onSelectionChange` to parent
- visibleSelectedCount calculation needed for filter changes

### Git Intelligence

**Recent commits show pattern:**
```
feat(story-3.X): feature description with code review fixes
```

**Branch:** `epic/3-lead-discovery`

**Files frequently modified:**
- src/components/leads/LeadsPageContent.tsx
- src/components/leads/index.ts

### Lead Type Reference

```typescript
// From src/types/lead.ts
export interface Lead {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  // ... other fields
}
```

### What NOT to Do

- Do NOT recreate `useSelectionStore` - it already exists
- Do NOT modify `LeadTable` checkbox behavior - it's working
- Do NOT implement campaign creation page/logic - just navigate with selected IDs via query params
- Do NOT implement segment/export features - they're for Epic 4+
- Do NOT add selection to localStorage - session-only is fine
- Do NOT add keyboard shortcuts for selection bar - future enhancement

### Imports Required

```typescript
// shadcn/ui components needed
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Icons
import { MoreHorizontal, X } from "lucide-react";

// Animation
import { AnimatePresence, motion } from "framer-motion";

// Navigation
import { useRouter } from "next/navigation";
```

Verify DropdownMenu is installed:
```bash
npx shadcn add dropdown-menu
```

### References

- [Source: epics.md#Story-3.6] - Story requirements and acceptance criteria
- [Source: architecture.md#Frontend-Architecture] - Component patterns
- [Source: architecture.md#Zustand-Store-Pattern] - Store patterns
- [Source: 3-5-lead-table-display.md] - Previous story with selection implementation
- [Source: ux-design-specification.md] - Design guidelines

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - No issues encountered during implementation.

### Code Review Fixes Applied

- ✅ [CR-001] Fixed: handleCreateCampaign now passes selectedIds via query param (`?leadIds=id1,id2`)
- ✅ [CR-002] Fixed: React act() warning resolved in "updates display when selection changes" test
- ✅ [CR-003] Fixed: Clarified Dev Notes to remove contradiction about campaign navigation

### Completion Notes List

- ✅ Created LeadSelectionBar component with all specified features:
  - Fixed positioning at bottom of viewport (z-50)
  - Selection count display with singular/plural Portuguese text
  - "Criar Campanha" primary action button navigates to /campaigns/new
  - Dropdown menu with disabled placeholder options for future features
  - "Limpar" button and X icon both clear selection
  - Framer Motion spring animation for slide up/down
- ✅ Integrated LeadSelectionBar with LeadsPageContent:
  - Added visibleSelectedCount calculation using useMemo
  - Bar only visible when visibleSelectedCount > 0
  - Correctly shows intersection of selected IDs and visible leads
- ✅ Filter persistence verified:
  - Selection state persists in Zustand store across filter changes
  - visibleSelectedCount updates correctly when leads change
  - Store maintains all selections even when leads are filtered out
- ✅ All 24 unit tests passing:
  - Visibility tests (4 tests)
  - Content tests (6 tests)
  - Interaction tests (5 tests)
  - Accessibility tests (3 tests)
  - Filter persistence tests (4 tests)
  - Edge case tests (2 tests)
- ✅ All 96 leads-related tests passing
- ✅ Build successful (Next.js 16.1.6)

### Change Log

- 2026-01-31: Code review fixes applied - selectedIds via query params, act() warning fixed
- 2026-01-31: Story 3.6 implementation complete - LeadSelectionBar with tests

### File List

**New Files:**
- src/components/leads/LeadSelectionBar.tsx
- __tests__/unit/components/leads/LeadSelectionBar.test.tsx

**Modified Files:**
- src/components/leads/LeadsPageContent.tsx
- src/components/leads/index.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
