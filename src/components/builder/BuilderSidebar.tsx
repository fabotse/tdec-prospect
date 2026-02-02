/**
 * BuilderSidebar Component
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #3 - Sidebar de Blocos
 *
 * Left sidebar showing available blocks that can be dragged to the canvas.
 */

"use client";

import { useDraggable } from "@dnd-kit/core";
import { Mail, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockType } from "@/stores/use-builder-store";

/**
 * Available block definitions
 */
export const AVAILABLE_BLOCKS = [
  {
    type: "email" as const,
    icon: Mail,
    label: "Email",
    description: "Adicione um email a sequencia",
  },
  {
    type: "delay" as const,
    icon: Clock,
    label: "Aguardar",
    description: "Adicione um intervalo entre emails",
  },
] as const;

interface DraggableBlockProps {
  type: BlockType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}

/**
 * Single draggable block in the sidebar
 */
function DraggableBlock({ type, icon: Icon, label, description }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-${type}`,
    data: {
      fromSidebar: true,
      blockType: type,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`Arrastar bloco ${label} para o canvas`}
      aria-describedby={`block-desc-${type}`}
      data-testid={`sidebar-block-${type}`}
      className={cn(
        // Base styles
        "flex items-center gap-3 p-3 rounded-lg cursor-grab",
        "border border-border bg-card",
        "hover:bg-accent hover:border-accent-foreground/20",
        "transition-colors duration-150",
        // Active/dragging state
        isDragging && "opacity-50 cursor-grabbing",
        // Focus styles
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      )}
    >
      <div
        className={cn(
          "rounded-md p-2",
          type === "email" && "bg-blue-500/10",
          type === "delay" && "bg-amber-500/10"
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5",
            type === "email" && "text-blue-500",
            type === "delay" && "text-amber-500"
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p id={`block-desc-${type}`} className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
    </div>
  );
}

/**
 * Sidebar component showing available blocks
 */
export function BuilderSidebar() {
  return (
    <div
      data-testid="builder-sidebar"
      className="w-64 border-r border-border bg-background-secondary p-4 flex flex-col"
    >
      <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">
        Blocos
      </h2>
      <div className="flex flex-col gap-2">
        {AVAILABLE_BLOCKS.map((block) => (
          <DraggableBlock
            key={block.type}
            type={block.type}
            icon={block.icon}
            label={block.label}
            description={block.description}
          />
        ))}
      </div>
    </div>
  );
}
