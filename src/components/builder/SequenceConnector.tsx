/**
 * SequenceConnector Component
 * Story 5.5: Sequence Connector Lines
 *
 * AC #1: Conectores entre Blocos Consecutivos
 * AC #2: Visual do Conector (Estilo Attio)
 * AC #3: Animacao de Entrada (Draw Line)
 * AC #5: Acessibilidade
 *
 * Visual connector between blocks in the campaign builder.
 * Displays a vertical bezier curve with an arrow indicating flow direction.
 */

"use client";

import { motion, useReducedMotion } from "framer-motion";

interface SequenceConnectorProps {
  /** Height of the connector in pixels */
  height?: number;
  /** Whether this is a new connector that should animate */
  animate?: boolean;
}

/**
 * Visual connector between blocks in the campaign builder.
 * Displays a vertical bezier curve with an arrow indicating flow direction.
 *
 * UX Spec Reference: SequenceConnector
 * - SVG path with bezier curve
 * - Color: --border (subtle)
 * - Stroke width: 2px
 * - Arrow marker at end
 * - Draw line animation on appear (300ms)
 */
export function SequenceConnector({
  height = 24,
  animate = true,
}: SequenceConnectorProps) {
  const shouldReduceMotion = useReducedMotion();

  // Calculate path dimensions
  const width = 20;
  const halfWidth = width / 2;
  const curveOffset = height * 0.3; // Control point offset for bezier

  // Create bezier curve path from top center to bottom center
  // M = move to start, C = cubic bezier curve
  const pathD = `M ${halfWidth} 0 C ${halfWidth} ${curveOffset}, ${halfWidth} ${height - curveOffset}, ${halfWidth} ${height - 6}`;

  // Arrow marker path (triangle pointing down)
  const arrowSize = 6;
  const arrowD = `M ${halfWidth - arrowSize / 2} ${height - arrowSize} L ${halfWidth} ${height} L ${halfWidth + arrowSize / 2} ${height - arrowSize}`;

  // Animation variants for draw line effect
  // Using Bezier curve [0, 0, 0.2, 1] for easeOut equivalent
  const pathVariants = {
    hidden: {
      pathLength: 0,
      opacity: 0,
    },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { duration: 0.3, ease: [0, 0, 0.2, 1] as const },
        opacity: { duration: 0.1 },
      },
    },
  };

  const arrowVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { delay: 0.2, duration: 0.15 },
    },
  };

  // If reduced motion is preferred, skip animations
  const shouldAnimate = animate && !shouldReduceMotion;

  return (
    <svg
      data-testid="sequence-connector"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="mx-auto"
      tabIndex={-1}
    >
      {/* Main connector line */}
      <motion.path
        d={pathD}
        stroke="hsl(var(--border))"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={shouldAnimate ? "hidden" : "visible"}
        animate="visible"
        variants={pathVariants}
      />

      {/* Arrow marker at the end */}
      <motion.path
        d={arrowD}
        stroke="hsl(var(--border))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={shouldAnimate ? "hidden" : "visible"}
        animate="visible"
        variants={arrowVariants}
      />
    </svg>
  );
}
