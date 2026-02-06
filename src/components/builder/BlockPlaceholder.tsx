/**
 * BlockPlaceholder Component
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #5 - Block representation on canvas
 *
 * Placeholder component for representing blocks in the canvas.
 * Full block implementations will come in Stories 5.3 (Email) and 5.4 (Delay).
 */

"use client";

import { Mail, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuilderBlock } from "@/stores/use-builder-store";

interface BlockPlaceholderProps {
  block: BuilderBlock;
}

/**
 * Block icon configuration
 */
const BLOCK_CONFIG = {
  email: {
    icon: Mail,
    label: "Email",
    description: "Bloco de email",
    bgClass: "bg-muted",
    iconClass: "text-muted-foreground",
  },
  delay: {
    icon: Clock,
    label: "Aguardar",
    description: "Intervalo de tempo",
    bgClass: "bg-accent",
    iconClass: "text-accent-foreground",
  },
} as const;

/**
 * Placeholder block displayed on the canvas
 * Shows block type and basic info until full implementation
 */
export function BlockPlaceholder({ block }: BlockPlaceholderProps) {
  const config = BLOCK_CONFIG[block.type];
  const Icon = config.icon;

  return (
    <div
      data-testid={`block-${block.id}`}
      className={cn(
        // Card styling - Attio-inspired clean design
        "w-full max-w-md",
        "rounded-xl border border-border bg-card",
        "shadow-sm hover:shadow-md transition-shadow duration-200",
        // Padding
        "p-4"
      )}
    >
      {/* Block header */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "rounded-lg p-2",
            config.bgClass
          )}
        >
          <Icon className={cn("h-5 w-5", config.iconClass)} />
        </div>
        <div>
          <p className="font-medium text-sm">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </div>
    </div>
  );
}
