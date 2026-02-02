/**
 * BuilderCanvas Component
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #2 - Canvas Visual (Estilo Attio)
 * AC: #5 - Estado Vazio do Canvas
 *
 * Central canvas for building campaign sequences.
 * Features clean Attio-style design with subtle or no grid.
 */

"use client";

import { useDroppable } from "@dnd-kit/core";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBuilderStore } from "@/stores/use-builder-store";
import { BlockPlaceholder } from "./BlockPlaceholder";

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

  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-drop-zone",
  });

  const isEmpty = blocks.length === 0;

  return (
    <div
      ref={setNodeRef}
      data-testid="builder-canvas"
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
          <div className="flex flex-col items-center gap-6 pt-8">
            {blocks.map((block) => (
              <BlockPlaceholder key={block.id} block={block} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
