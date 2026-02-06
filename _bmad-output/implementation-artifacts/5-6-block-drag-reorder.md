# Story 5.6: Block Drag & Reorder

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to drag and reorder blocks,
so that I can reorganize my sequence easily.

## Context

Esta story implementa a funcionalidade de **arrastar e reordenar blocos** no builder de campanhas usando `@dnd-kit/sortable`. Os blocos ja possuem drag handles visuais (GripVertical icon), e o store ja tem a funcao `reorderBlocks` implementada. Esta story conecta tudo com a biblioteca @dnd-kit para uma experiencia de reordenacao acessivel e fluida.

**Requisitos Funcionais Cobertos:**
- FR13: Builder visual drag-and-drop (funcionalidade core)
- FR14: Multiplos touchpoints em uma sequencia (reordenacao)

**Relacao com outras Stories do Epic 5:**
- **Story 5.1 (DONE):** Campaigns page, data model
- **Story 5.2 (DONE):** Builder Canvas, Sidebar, Header, useBuilderStore
- **Story 5.3 (DONE):** Email Block Component (tem drag handle visual)
- **Story 5.4 (DONE):** Delay Block Component (tem drag handle visual)
- **Story 5.5 (DONE):** Sequence Connector Lines (atualizam automaticamente)
- **Story 5.7:** Campaign Lead Association
- **Story 5.8:** Campaign Preview

**O que JA existe (reutilizar, NAO reimplementar):**
- `BuilderCanvas` - Canvas que renderiza blocos em flex column
- `useBuilderStore` - Store Zustand com `reorderBlocks(activeId, overId)` ja implementado
- `EmailBlock` e `DelayBlock` - Componentes com drag handle visual (GripVertical)
- `SequenceConnector` - Conectores entre blocos (atualizam via re-render)
- `@dnd-kit/core` - Ja usado para drop zone do canvas
- `@dnd-kit/sortable` - Instalado, mas ainda nao utilizado
- framer-motion - Para animacoes suaves

**O que FALTA implementar nesta story:**
1. Wrap dos blocos com `useSortable` do @dnd-kit/sortable
2. Wrap do canvas com `SortableContext`
3. Handler `onDragEnd` para chamar `reorderBlocks`
4. Feedback visual durante o arrasto (opacidade, placeholder)
5. Navegacao por teclado para reordenar com setas
6. Testes unitarios para reordenacao

## Acceptance Criteria

### AC #1 - Arrastar Bloco pelo Handle

**Given** tenho blocos no canvas
**When** arrasto um bloco pelo seu drag handle
**Then** o bloco segue o cursor com leve opacidade (0.5)
**And** vejo onde o bloco sera posicionado
**And** outros blocos se ajustam para mostrar a posicao potencial

### AC #2 - Soltar Bloco para Reordenar

**Given** estou arrastando um bloco
**When** solto o bloco em uma nova posicao
**Then** a sequencia e reordenada
**And** os conectores atualizam automaticamente
**And** as posicoes dos blocos sao atualizadas no store
**And** `hasChanges` e marcado como true

### AC #3 - Feedback Visual Durante Arrasto

**Given** estou arrastando um bloco
**When** o bloco esta sendo arrastado
**Then** o bloco original fica com opacidade reduzida (placeholder)
**And** vejo um "ghost" do bloco seguindo o cursor
**And** ha uma transicao suave quando outros blocos se movem

### AC #4 - Navegacao por Teclado

**Given** tenho um bloco focado
**When** pressiono Alt+ArrowUp ou Alt+ArrowDown
**Then** o bloco move uma posicao na direcao indicada
**And** anuncio de screen reader confirma a nova posicao
**And** foco permanece no bloco movido

### AC #5 - Acessibilidade (WCAG 2.1 AA)

**Given** um usuario navega com screen reader
**When** interage com os blocos
**Then** cada bloco tem role="listitem" e aria-label descritivo
**And** a lista de blocos tem role="list"
**And** instrucoes de reordenacao sao anunciadas
**And** a interacao usa @dnd-kit para acessibilidade nativa

### AC #6 - Cancelar Arrasto

**Given** estou arrastando um bloco
**When** pressiono Escape
**Then** o arrasto e cancelado
**And** o bloco volta a posicao original
**And** nenhuma mudanca e feita no store

## Tasks / Subtasks

- [x] Task 1: Configurar SortableContext no BuilderCanvas (AC: #1, #2, #5)
  - [x] 1.1 Importar `SortableContext`, `verticalListSortingStrategy` do @dnd-kit/sortable
  - [x] 1.2 Wrap da lista de blocos com `SortableContext`
  - [x] 1.3 Passar array de IDs como `items` para SortableContext
  - [x] 1.4 Adicionar role="list" ao container de blocos

- [x] Task 2: Criar componente SortableBlock wrapper (AC: #1, #3, #5)
  - [x] 2.1 Criar `src/components/builder/SortableBlock.tsx`
  - [x] 2.2 Usar `useSortable` hook com `id` do bloco
  - [x] 2.3 Aplicar `transform` e `transition` do useSortable
  - [x] 2.4 Passar `listeners` para o drag handle (nao o bloco inteiro)
  - [x] 2.5 Aplicar opacidade 0.5 quando `isDragging`
  - [x] 2.6 Adicionar role="listitem" e aria-label

- [x] Task 3: Implementar handler onDragEnd (AC: #2)
  - [x] 3.1 Criar handler `handleDragEnd` no BuilderCanvas
  - [x] 3.2 Extrair `active.id` e `over.id` do evento
  - [x] 3.3 Chamar `reorderBlocks(activeId, overId)` do store
  - [x] 3.4 Verificar que `hasChanges` e atualizado

- [x] Task 4: Configurar DragOverlay para ghost (AC: #3)
  - [x] 4.1 Importar `DragOverlay` do @dnd-kit/core
  - [x] 4.2 Renderizar bloco ativo dentro do DragOverlay
  - [x] 4.3 Aplicar cursor-grabbing no ghost
  - [x] 4.4 Manter estado `activeDragId` para renderizar overlay

- [x] Task 5: Implementar navegacao por teclado (AC: #4)
  - [x] 5.1 Configurar `KeyboardSensor` no DndContext
  - [x] 5.2 Definir `coordinateGetter` para sortable vertical
  - [x] 5.3 Testar Alt+Arrow para mover blocos
  - [x] 5.4 Adicionar announcements para screen readers

- [x] Task 6: Cancelar arrasto com Escape (AC: #6)
  - [x] 6.1 Implementar handler `onDragCancel`
  - [x] 6.2 Garantir que Escape cancela o arrasto
  - [x] 6.3 Verificar que store nao e modificado ao cancelar

- [x] Task 7: Testes unitarios (AC: todos)
  - [x] 7.1 Teste: SortableBlock aplica transform e listeners
  - [x] 7.2 Teste: reordenar blocos atualiza store
  - [x] 7.3 Teste: cancelar arrasto nao modifica store
  - [x] 7.4 Teste: acessibilidade (role, aria-label)
  - [x] 7.5 Atualizar testes existentes do BuilderCanvas

- [x] Task 8: Exportar e verificar build (AC: N/A)
  - [x] 8.1 Adicionar SortableBlock ao `src/components/builder/index.ts`
  - [x] 8.2 Executar todos os testes
  - [x] 8.3 Verificar build sem erros

## Dev Notes

### Arquitetura e Padroes

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Component naming | PascalCase para componentes React |
| State management | Zustand (useBuilderStore) para UI state |
| Drag and drop | @dnd-kit/core + @dnd-kit/sortable para acessibilidade |
| Animations | framer-motion para transicoes (opcional) |
| Accessibility | role="list", role="listitem", aria-label, announcements |
| Error messages | Sempre em portugues |

### Implementacao @dnd-kit/sortable

**Estrutura Recomendada:**

```tsx
// src/components/builder/BuilderCanvas.tsx (MODIFICAR)

"use client";

import { Fragment, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBuilderStore, type BuilderBlock } from "@/stores/use-builder-store";
import { SortableBlock } from "./SortableBlock";
import { EmailBlock } from "./EmailBlock";
import { DelayBlock } from "./DelayBlock";
import { SequenceConnector } from "./SequenceConnector";

export function BuilderCanvas() {
  const blocks = useBuilderStore((state) => state.blocks);
  const isDragging = useBuilderStore((state) => state.isDragging);
  const selectBlock = useBuilderStore((state) => state.selectBlock);
  const setDragging = useBuilderStore((state) => state.setDragging);
  const reorderBlocks = useBuilderStore((state) => state.reorderBlocks);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-drop-zone",
  });

  // Configure sensors for pointer and keyboard interaction
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      reorderBlocks(active.id as string, over.id as string);
    }

    setActiveDragId(null);
    setDragging(false);
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    setDragging(false);
  };

  const activeBlock = activeDragId
    ? blocks.find((b) => b.id === activeDragId)
    : null;

  const isEmpty = blocks.length === 0;

  const handleCanvasClick = () => {
    selectBlock(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={setNodeRef}
        data-testid="builder-canvas"
        onClick={handleCanvasClick}
        className={cn(
          "flex-1 bg-background overflow-auto",
          isDragging && "ring-2 ring-primary/30 ring-inset",
          isOver && "ring-primary/50",
          "transition-all duration-200"
        )}
      >
        <div className="min-h-full p-8">
          {isEmpty ? (
            <CanvasEmptyState />
          ) : (
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div
                className="flex flex-col items-center pt-8"
                role="list"
                aria-label="Sequencia de blocos da campanha"
              >
                {blocks.map((block, index) => (
                  <Fragment key={block.id}>
                    {index > 0 && <SequenceConnector height={24} animate={!isDragging} />}
                    <SortableBlock block={block} stepNumber={index + 1} />
                  </Fragment>
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      </div>

      {/* Drag Overlay - ghost that follows cursor */}
      <DragOverlay>
        {activeBlock ? (
          <div className="opacity-90 cursor-grabbing">
            {activeBlock.type === "email" ? (
              <EmailBlock block={activeBlock} stepNumber={0} />
            ) : (
              <DelayBlock block={activeBlock} stepNumber={0} />
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

### SortableBlock Component

```tsx
// src/components/builder/SortableBlock.tsx (NOVO)

"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { type BuilderBlock } from "@/stores/use-builder-store";
import { EmailBlock } from "./EmailBlock";
import { DelayBlock } from "./DelayBlock";

interface SortableBlockProps {
  block: BuilderBlock;
  stepNumber: number;
}

/**
 * Wrapper component that makes blocks sortable via drag and drop.
 * Uses @dnd-kit/sortable for accessible reordering.
 */
export function SortableBlock({ block, stepNumber }: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full",
        isDragging && "opacity-50"
      )}
      role="listitem"
      aria-label={`${block.type === "email" ? "Email" : "Delay"} block, step ${stepNumber}`}
      {...attributes}
    >
      {block.type === "email" ? (
        <EmailBlock
          block={block}
          stepNumber={stepNumber}
          dragHandleProps={listeners}
        />
      ) : (
        <DelayBlock
          block={block}
          stepNumber={stepNumber}
          dragHandleProps={listeners}
        />
      )}
    </div>
  );
}
```

### Modificacoes nos Blocos (EmailBlock/DelayBlock)

Os blocos precisam aceitar `dragHandleProps` para passar os listeners ao drag handle:

```tsx
// Adicionar ao EmailBlock e DelayBlock

interface EmailBlockProps {
  block: BuilderBlock;
  stepNumber: number;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>; // NOVO
}

// No drag handle div:
<div
  data-testid="drag-handle"
  className="cursor-grab hover:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
  aria-label="Arrastar para reordenar"
  {...dragHandleProps} // NOVO - spread dos listeners
>
  <GripVertical className="h-5 w-5" />
</div>
```

### Project Structure Notes

```
src/
├── components/
│   └── builder/
│       ├── BuilderCanvas.tsx                    # MODIFY - Add DndContext, SortableContext
│       ├── SortableBlock.tsx                    # NEW - Wrapper para blocos sortable
│       ├── EmailBlock.tsx                       # MODIFY - Aceitar dragHandleProps
│       ├── DelayBlock.tsx                       # MODIFY - Aceitar dragHandleProps
│       ├── SequenceConnector.tsx                # EXISTING - Nao modificar
│       └── index.ts                             # MODIFY - Exportar SortableBlock
```

### Previous Story Intelligence

**From Story 5.5 (Sequence Connector Lines):**
- Conectores atualizam automaticamente via re-render quando blocks[] muda
- Pattern de Fragment key={block.id} para manter keys estaveis
- Animacao desabilitada durante drag (animate={!isDragging})

**From Story 5.4 (Delay Block Component):**
- Drag handle com GripVertical icon
- Pattern de data-testid para testes
- Pattern de e.stopPropagation() para eventos internos

**From Story 5.3 (Email Block Component):**
- Drag handle identico ao DelayBlock
- Pattern de handleClick com stopPropagation

**From Story 5.2 (Campaign Builder Canvas):**
- BuilderCanvas ja usa `useDroppable` do @dnd-kit/core
- Store ja tem `setDragging` e `isDragging`
- Store ja tem `reorderBlocks(activeId, overId)` implementado

**From Architecture:**
- @dnd-kit/core + @dnd-kit/sortable para drag-and-drop acessivel
- Zustand para state management
- WCAG 2.1 AA para acessibilidade

### Git Intelligence

**Commit pattern esperado:**
```
feat(story-5.6): block drag reorder
```

**Padroes recentes observados:**
- 9b0eb7d fix(story-5.5): revert connector color - --border invisible in dark mode
- a5d5fe7 feat(story-5.5): sequence connector lines with code review fixes
- 860ed61 feat(story-5.4): delay block component with code review fixes
- Code review fixes aplicados no mesmo commit

### UX Design Notes

**Referencia Visual: Drag & Reorder**

```
Estado Normal:
┌─────────────────────────┐
│ ≡  Email Block 1        │  ← Drag handle (≡)
└─────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│ ≡  Delay Block          │
└─────────────────────────┘
          │
          ▼
┌─────────────────────────┐
│ ≡  Email Block 2        │
└─────────────────────────┘

Durante Arrasto (movendo Email 2 para cima):
┌─────────────────────────┐
│ ≡  Email Block 1        │
└─────────────────────────┘
          │
          ▼
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   ← Placeholder (drop indicator)
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
          │
          ▼
┌─────────────────────────┐
│ ≡  Delay Block          │  ← Movido para baixo
└─────────────────────────┘

       ╔═════════════════════════╗
       ║ ≡  Email Block 2        ║ ← Ghost (cursor-grabbing, opacity-90)
       ╚═════════════════════════╝
```

**Especificacoes da UX Spec:**
- Drag handle: GripVertical icon com cursor-grab
- Durante arrasto: bloco original com opacity-50
- Ghost: seguindo cursor com opacity-90 e cursor-grabbing
- Transicao suave quando blocos se movem (via @dnd-kit transition)

### O Que NAO Fazer

- NAO reimplementar drag-drop do zero - usar @dnd-kit/sortable
- NAO modificar a estrutura do store - `reorderBlocks` ja existe
- NAO remover SequenceConnector - apenas nao animar durante drag
- NAO fazer drag no bloco inteiro - apenas no handle (listeners)
- NAO usar CSS transform manual - usar CSS.Transform do @dnd-kit/utilities
- NAO esquecer de propagar dragHandleProps para o drag handle element

### Testing Strategy

**Unit Tests:**

```typescript
// Test SortableBlock
describe("SortableBlock", () => {
  it("renders email block with sortable wrapper", () => {
    // Mock useSortable
    render(<SortableBlock block={emailBlock} stepNumber={1} />);
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });

  it("applies opacity when dragging", () => {
    // Mock useSortable with isDragging: true
    render(<SortableBlock block={emailBlock} stepNumber={1} />);
    // Check opacity-50 class
  });

  it("has correct aria-label for accessibility", () => {
    render(<SortableBlock block={emailBlock} stepNumber={1} />);
    expect(screen.getByRole("listitem")).toHaveAttribute(
      "aria-label",
      "Email block, step 1"
    );
  });
});

// Test BuilderCanvas reorder
describe("BuilderCanvas Reorder", () => {
  it("renders blocks within SortableContext", () => {
    // Setup store with multiple blocks
    render(<BuilderCanvas />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("calls reorderBlocks when drag ends at different position", () => {
    // Mock DndContext events
    // Verify reorderBlocks was called
  });

  it("does not call reorderBlocks when drag ends at same position", () => {
    // Verify reorderBlocks was NOT called
  });

  it("sets isDragging true during drag", () => {
    // Mock DndContext events
    // Verify setDragging(true) called on start
    // Verify setDragging(false) called on end
  });
});
```

### NFR Compliance

- **Performance:** @dnd-kit usa CSS transforms (GPU accelerated)
- **UX:** Feedback visual claro durante arrasto
- **Accessibility:** WCAG 2.1 AA, keyboard navigation, screen reader announcements
- **Reduced Motion:** @dnd-kit respeita prefers-reduced-motion

### References

- [Source: epics.md#Epic-5-Story-5.6] - Requisitos da story
- [Source: architecture.md#Frontend-Architecture] - @dnd-kit para drag-and-drop
- [Source: src/stores/use-builder-store.ts:125-139] - reorderBlocks ja implementado
- [Source: src/components/builder/BuilderCanvas.tsx] - Canvas atual
- [Source: src/components/builder/EmailBlock.tsx:97-103] - Drag handle existente
- [Source: src/components/builder/DelayBlock.tsx:149-157] - Drag handle existente
- [@dnd-kit/sortable docs](https://docs.dndkit.com/presets/sortable) - Documentacao oficial

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

- Build error fixed: `role` attribute duplicate in SortableBlock - resolved by destructuring attributes to remove default role before applying custom role="listitem"

### Completion Notes List

- ✅ Task 1: Configurado SortableContext com verticalListSortingStrategy no BuilderCanvas
- ✅ Task 2: Criado SortableBlock wrapper com useSortable hook, transform/transition styles, opacity feedback
- ✅ Task 3: Implementado handleDragEnd que chama reorderBlocks do store
- ✅ Task 4: Configurado DragOverlay com ghost element (opacity-90, cursor-grabbing)
- ✅ Task 5: Configurado KeyboardSensor com sortableKeyboardCoordinates para navegacao por teclado
- ✅ Task 6: Implementado handleDragCancel para cancelar arrasto com Escape
- ✅ Task 7: 46 testes unitarios passando (30 BuilderCanvas + 16 SortableBlock) - updated after code review
- ✅ Task 8: Build de producao verificado sem erros, SortableBlock exportado

### Code Review Fixes Applied

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| AC #4 - Screen reader announcements missing | HIGH | Added `accessibility.announcements` prop to DndContext with Portuguese messages |
| AC #5 - aria-label in English | HIGH | Changed to Portuguese: "Bloco Email, passo X" |
| Test gap - reorderBlocks verification | MEDIUM | Added 3 new tests for drag handlers |
| Duplicate JSDoc comment | LOW | Removed duplicate comment block |
| ESLint suppression pattern | LOW | Cleaned up with `void _` pattern |

### File List

**NEW:**
- src/components/builder/SortableBlock.tsx
- __tests__/unit/components/builder/SortableBlock.test.tsx

**MODIFIED:**
- src/components/builder/index.ts (add SortableBlock export)
- src/components/builder/BuilderCanvas.tsx (DndContext, SortableContext, handlers, DragOverlay, announcements)
- src/components/builder/EmailBlock.tsx (accept dragHandleProps)
- src/components/builder/DelayBlock.tsx (accept dragHandleProps)
- __tests__/unit/components/builder/BuilderCanvas.test.tsx (updated mocks, added sortable/accessibility/drag handler tests)
- __tests__/unit/components/builder/SortableBlock.test.tsx (updated aria-label assertions for Portuguese)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Story 5.6 context created with comprehensive implementation guide | Bob (SM) |
| 2026-02-02 | Story 5.6 implementation complete - block drag & reorder with @dnd-kit/sortable | Dev Agent (Claude Opus 4.5) |
| 2026-02-02 | Code review fixes: screen reader announcements, Portuguese aria-labels, additional tests | Code Review (Claude Opus 4.5) |
