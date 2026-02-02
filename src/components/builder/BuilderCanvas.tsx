/**
 * BuilderCanvas Component
 * Story 5.2: Campaign Builder Canvas
 * Story 5.3: Email Block Component
 * Story 5.4: Delay Block Component
 * Story 5.5: Sequence Connector Lines
 * Story 5.6: Block Drag & Reorder
 *
 * AC: #2 - Canvas Visual (Estilo Attio)
 * AC: #5 - Estado Vazio do Canvas
 * AC 5.3 #1 - Arrastar Email Block para Canvas
 * AC 5.3 #3 - Selecionar Email Block (click outside to deselect)
 * AC 5.4 #1 - Arrastar Delay Block para Canvas
 * AC 5.4 #3 - Selecionar Delay Block
 * AC 5.6 #1 - Arrastar Bloco pelo Handle
 * AC 5.6 #2 - Soltar Bloco para Reordenar
 * AC 5.6 #3 - Feedback Visual Durante Arrasto
 * AC 5.6 #4 - Navegacao por Teclado
 * AC 5.6 #5 - Acessibilidade (WCAG 2.1 AA)
 * AC 5.6 #6 - Cancelar Arrasto
 *
 * Central canvas for building campaign sequences.
 * Features clean Attio-style design with drag-and-drop reordering.
 */

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
import { useBuilderStore } from "@/stores/use-builder-store";
import { SortableBlock } from "./SortableBlock";
import { EmailBlock } from "./EmailBlock";
import { DelayBlock } from "./DelayBlock";
import { SequenceConnector } from "./SequenceConnector";

/**
 * Empty state displayed when no blocks exist on canvas
 */
function CanvasEmptyState() {
  return (
    <div
      data-testid="canvas-empty-state"
      className="flex flex-col items-center justify-center h-full text-center text-muted-foreground"
    >
      <div className="rounded-full bg-muted p-4 mb-4">
        <Layers className="h-8 w-8" />
      </div>
      <p className="text-lg font-medium">Arraste blocos aqui para comecar</p>
      <p className="text-sm mt-1 max-w-xs">
        Use a sidebar para adicionar emails e intervalos a sua sequencia
      </p>
    </div>
  );
}

/**
 * Main canvas component for the campaign builder
 */
export function BuilderCanvas() {
  const blocks = useBuilderStore((state) => state.blocks);
  const isDragging = useBuilderStore((state) => state.isDragging);
  const selectBlock = useBuilderStore((state) => state.selectBlock);
  const setDragging = useBuilderStore((state) => state.setDragging);
  const reorderBlocks = useBuilderStore((state) => state.reorderBlocks);

  // Track active drag for DragOverlay
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-drop-zone",
  });

  // Configure sensors for pointer and keyboard interaction
  // AC #4: Navegacao por Teclado
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

  // AC #1, #3: Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setDragging(true);
  };

  // AC #2: Handle drag end - reorder blocks
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      reorderBlocks(active.id as string, over.id as string);
    }

    setActiveDragId(null);
    setDragging(false);
  };

  // AC #6: Handle drag cancel (Escape key)
  const handleDragCancel = () => {
    setActiveDragId(null);
    setDragging(false);
  };

  // Find active block for DragOverlay
  const activeBlock = activeDragId
    ? blocks.find((b) => b.id === activeDragId)
    : null;

  const isEmpty = blocks.length === 0;

  // Click on canvas background to deselect any selected block
  const handleCanvasClick = () => {
    selectBlock(null);
  };

  // AC #4: Screen reader announcements for accessibility
  const announcements = {
    onDragStart({ active }: { active: { id: string | number } }) {
      const block = blocks.find((b) => b.id === active.id);
      const blockType = block?.type === "email" ? "Email" : "Delay";
      const position = block ? blocks.indexOf(block) + 1 : 0;
      return `Iniciou arrasto do bloco ${blockType}, passo ${position}`;
    },
    onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      if (over) {
        const overBlock = blocks.find((b) => b.id === over.id);
        const overPosition = overBlock ? blocks.indexOf(overBlock) + 1 : 0;
        return `Bloco sobre posicao ${overPosition}`;
      }
      return "";
    },
    onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
      const block = blocks.find((b) => b.id === active.id);
      const blockType = block?.type === "email" ? "Email" : "Delay";
      if (over && active.id !== over.id) {
        const overBlock = blocks.find((b) => b.id === over.id);
        const newPosition = overBlock ? blocks.indexOf(overBlock) + 1 : 0;
        return `Bloco ${blockType} movido para posicao ${newPosition}`;
      }
      return `Bloco ${blockType} solto na posicao original`;
    },
    onDragCancel({ active }: { active: { id: string | number } }) {
      const block = blocks.find((b) => b.id === active.id);
      const blockType = block?.type === "email" ? "Email" : "Delay";
      return `Arrasto do bloco ${blockType} cancelado`;
    },
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{ announcements }}
    >
      <div
        ref={setNodeRef}
        data-testid="builder-canvas"
        onClick={handleCanvasClick}
        className={cn(
          // Base styles - clean Attio-inspired design
          "flex-1 bg-background overflow-auto",
          // Subtle drop zone highlight during drag
          isDragging && "ring-2 ring-primary/30 ring-inset",
          isOver && "ring-primary/50",
          // Transition for smooth visual feedback
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
              {/* AC #5: Accessibility - role="list" */}
              <div
                className="flex flex-col items-center pt-8"
                role="list"
                aria-label="Sequencia de blocos da campanha"
              >
                {blocks.map((block, index) => (
                  <Fragment key={block.id}>
                    {/* Render connector BEFORE each block (except first) */}
                    {/* Disable animation during drag for performance */}
                    {index > 0 && <SequenceConnector height={24} animate={!isDragging} />}
                    <SortableBlock block={block} stepNumber={index + 1} />
                  </Fragment>
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      </div>

      {/* AC #3: Drag Overlay - ghost that follows cursor */}
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
