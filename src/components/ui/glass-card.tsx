/**
 * GlassCard Component
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #3: Glassmorphism (backdrop-blur + gradiente), hover interactions
 *
 * Source: ui.tripled.work/components/glass-wallet-card
 * Adapted: Generalized from crypto wallet to generic metrics card.
 * Uses CSS variables only - no hardcoded colors.
 */

"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";

export interface GlassCardProps {
  /** Card content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Keyboard handler */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
  /** ARIA role */
  role?: string;
  /** data-testid */
  "data-testid"?: string;
}

export function GlassCard({
  children,
  className,
  onClick,
  onKeyDown,
  tabIndex,
  role,
  "data-testid": testId,
}: GlassCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("w-full", className)}
      data-testid={testId}
    >
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl",
          "border border-border/50",
          "bg-gradient-to-br from-card/80 via-card/40 to-card/20",
          "backdrop-blur-md",
          "transition-all duration-300",
          "hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5",
          onClick && "cursor-pointer"
        )}
        data-slot="card"
        onClick={onClick}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        role={role}
      >
        {/* Abstract background shapes for depth */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl transition-all duration-500 group-hover:bg-primary/10" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-secondary/5 blur-3xl transition-all duration-500 group-hover:bg-secondary/10" />

        {/* Content — matches shadcn Card layout: flex flex-col gap-6 py-6 */}
        <div className="relative flex flex-col gap-6 py-6">
          {children}
        </div>
      </div>
    </motion.div>
  );
}
