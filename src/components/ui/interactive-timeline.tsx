/**
 * InteractiveTimeline Component
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #6: Linha conectora cresce com scroll-trigger, dots e cards com animação spring
 *
 * Source: ui.tripled.work/components/interactive-timeline
 * Adapted: Support for step type icons (email, delay) for campaign builder use.
 * Uses CSS variables only (--primary, --border, --card, --muted-foreground).
 */

"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  title: string;
  description: string;
  date?: string;
  icon?: ReactNode;
}

export interface InteractiveTimelineProps {
  items: TimelineItem[];
  className?: string;
}

function TimelineItemComponent({
  item,
  index,
}: {
  item: TimelineItem;
  index: number;
}) {
  const itemRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();
  const itemInView = useInView(itemRef, {
    once: true,
    margin: "-50px",
  });

  const isVisible = itemInView || shouldReduceMotion;

  return (
    <div ref={itemRef} className="relative flex gap-4 pl-6">
      {/* Timeline dot */}
      <motion.div
        initial={shouldReduceMotion ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        animate={isVisible ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: index * 0.2, duration: 0.3 }}
        className="absolute left-0 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-primary"
      >
        {item.icon && (
          <span className="text-primary-foreground [&>svg]:h-3 [&>svg]:w-3">
            {item.icon}
          </span>
        )}
      </motion.div>

      {/* Content card */}
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : {
                delay: index * 0.2 + 0.3,
                type: "spring",
                stiffness: 300,
                damping: 25,
              }
        }
        className="flex-1 rounded-lg border border-border bg-card p-3"
      >
        {item.date && (
          <span className="text-xs text-muted-foreground">{item.date}</span>
        )}
        <h4 className="text-sm font-medium">{item.title}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
      </motion.div>
    </div>
  );
}

export function InteractiveTimeline({ items, className }: InteractiveTimelineProps) {
  const ref = useRef(null);
  const shouldReduceMotion = useReducedMotion();
  const isInView = useInView(ref, { once: true, margin: "-30px" });

  const lineVisible = isInView || shouldReduceMotion;

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      {/* Timeline line */}
      <motion.div
        initial={shouldReduceMotion ? { scaleY: 1 } : { scaleY: 0 }}
        animate={lineVisible ? { scaleY: 1 } : { scaleY: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        className="absolute left-[9px] top-0 h-full w-0.5 origin-top bg-border"
      />

      <div className="space-y-4">
        {items.map((item, index) => (
          <TimelineItemComponent key={item.id} item={item} index={index} />
        ))}
      </div>
    </div>
  );
}
