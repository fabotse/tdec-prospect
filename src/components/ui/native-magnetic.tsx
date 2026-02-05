/**
 * NativeMagnetic Component
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente, animações com framer-motion
 * AC #2: Efeito magnético nos botões primários (CTAs)
 *
 * Source: ui.tripled.work/components/native-magnetic
 * Adapted for B&W theme - uses CSS variables only, no hardcoded colors.
 */

"use client";

import { cn } from "@/lib/utils";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { useRef } from "react";

export interface NativeMagneticProps {
  /** Content to apply the magnetic effect to */
  children: React.ReactNode;
  /** Strength of the magnetic pull (0-1 range). Default: 0.3 */
  strength?: number;
  /** Spring stiffness for the animation. Default: 300 */
  stiffness?: number;
  /** Spring damping for the animation. Default: 30 */
  damping?: number;
  /** Whether to scale up on hover. Default: true */
  scaleOnHover?: boolean;
  /** Wrapper element type. Default: 'div' */
  as?: "div" | "button" | "a";
  /** Link href (only applies when as="a") */
  href?: string;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Additional CSS classes */
  className?: string;
}

const springTransition: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
};

export function NativeMagnetic({
  children,
  strength = 0.3,
  stiffness = 300,
  damping = 30,
  scaleOnHover = true,
  as = "div",
  href,
  onClick,
  className,
}: NativeMagneticProps) {
  const ref = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { stiffness, damping };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const translateX = useTransform(springX, (v) => v * strength);
  const translateY = useTransform(springY, (v) => v * strength);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || shouldReduceMotion) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const commonProps = {
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
    style: shouldReduceMotion
      ? undefined
      : {
          x: translateX,
          y: translateY,
        },
    whileHover: scaleOnHover && !shouldReduceMotion ? { scale: 1.05 } : undefined,
    whileTap: shouldReduceMotion ? undefined : { scale: 0.95 },
    transition: springTransition,
    className: cn("inline-block", className),
    onClick,
  };

  if (as === "a" && href) {
    return (
      <motion.a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        {...commonProps}
      >
        {children}
      </motion.a>
    );
  }

  if (as === "button") {
    return (
      <motion.button
        ref={ref as React.RefObject<HTMLButtonElement>}
        type="button"
        {...commonProps}
      >
        {children}
      </motion.button>
    );
  }

  return (
    <motion.div ref={ref as React.RefObject<HTMLDivElement>} {...commonProps}>
      {children}
    </motion.div>
  );
}
