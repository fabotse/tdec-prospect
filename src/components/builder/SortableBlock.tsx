/**
 * SortableBlock Component
 * Story 5.6: Block Drag & Reorder
 *
 * AC: #1 - Arrastar Bloco pelo Handle
 * AC: #3 - Feedback Visual Durante Arrasto
 * AC: #5 - Acessibilidade (WCAG 2.1 AA)
 *
 * Wrapper component that makes blocks sortable via drag and drop.
 * Uses @dnd-kit/sortable for accessible reordering.
 */

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

  // Destructure role from attributes to apply custom role="listitem"
  const { role: _, ...restAttributes } = attributes;
  void _; // Suppress unused variable warning

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "w-full flex justify-center",
        isDragging && "opacity-50"
      )}
      {...restAttributes}
      role="listitem"
      aria-label={`Bloco ${block.type === "email" ? "Email" : "Delay"}, passo ${stepNumber}`}
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
