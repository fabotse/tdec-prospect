/**
 * AnimatedList Component
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #4: Itens entram com animação stagger (um por um)
 *
 * Source: ui.tripled.work/components/animated-list
 * Adapted: Refactored from hardcoded checklist to accept generic children.
 * Uses CSS variables only - no hardcoded colors.
 */

"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export interface AnimatedListProps {
  /** Children elements to animate with stagger effect */
  children: ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
  /** Stagger delay between children. Default: 0.08 */
  staggerChildren?: number;
  /** Initial delay before animation starts. Default: 0.1 */
  delayChildren?: number;
}

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

export function AnimatedList({
  children,
  className,
  staggerChildren = 0.08,
  delayChildren = 0.1,
}: AnimatedListProps) {
  const shouldReduceMotion = useReducedMotion();

  const variants: Variants = shouldReduceMotion
    ? {
        hidden: { opacity: 1 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren,
            delayChildren,
          },
        },
      };

  return (
    <motion.div
      className={cn(className)}
      variants={variants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

export interface AnimatedListItemProps {
  /** Item content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export function AnimatedListItem({ children, className }: AnimatedListItemProps) {
  const shouldReduceMotion = useReducedMotion();

  const variants: Variants = shouldReduceMotion
    ? {
        hidden: { opacity: 1, x: 0 },
        visible: { opacity: 1, x: 0 },
      }
    : itemVariants;

  return (
    <motion.div className={cn(className)} variants={variants}>
      {children}
    </motion.div>
  );
}
