/**
 * AIUnlockAnimation Component
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #5: Animação de progresso premium (partículas, ripple, loading bar)
 *
 * Source: ui.tripled.work/components/ai-unlock-animation
 * Adapted: Added onComplete callback, configurable duration.
 * Uses CSS variables only (--foreground, --border, --card, --muted-foreground).
 */

"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

type AnimationState = "idle" | "unlocking" | "complete";

export interface AIUnlockAnimationProps {
  /** Auto-start animation on mount. Default: true */
  autoPlay?: boolean;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Duration of the unlock animation in ms. Default: 3000 */
  duration?: number;
  /** Additional CSS classes */
  className?: string;
}

export function AIUnlockAnimation({
  autoPlay = true,
  onComplete,
  duration = 3000,
  className,
}: AIUnlockAnimationProps) {
  const [state, setState] = useState<AnimationState>("idle");
  const shouldReduceMotion = useReducedMotion();
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  /* eslint-disable react-hooks/set-state-in-effect -- animation state machine driven by autoPlay prop */
  useEffect(() => {
    if (!autoPlay) return;
    setState("unlocking");
    const timer = setTimeout(() => {
      setState("complete");
      onCompleteRef.current?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [autoPlay, duration]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Stable particle config — useMemo avoids Math.random() on every render (react-hooks/purity)
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        angle: (Math.PI * 2 * i) / 24,
        delay: (i % 8) * 0.04,
        duration: 1.2 + (i % 5) * 0.1,
      })),
    []
  );

  const durationSeconds = duration / 1000;

  // Reduced motion: show simple loading bar without particles/ripple
  if (shouldReduceMotion) {
    return (
      <div className={className} data-testid="ai-unlock-animation" data-state={state}>
        <div className="relative rounded-2xl border border-border bg-card p-8">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 rounded-full border-2 border-foreground bg-card flex items-center justify-center">
              <svg className="w-6 h-6 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">
              {state === "unlocking" ? "Processando..." : state === "complete" ? "Concluído" : ""}
            </p>
            {state === "unlocking" && (
              <div className="w-48 h-1 bg-border overflow-hidden rounded-full">
                <div
                  className="h-full bg-foreground transition-all ease-linear"
                  style={{
                    width: "100%",
                    transitionDuration: `${duration}ms`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className} data-testid="ai-unlock-animation" data-state={state}>
      <motion.div
        className={cn(
          "relative rounded-2xl border border-border bg-card p-8 shadow-sm transition-shadow duration-1000",
          state === "unlocking" && "shadow-lg ring-2 ring-foreground/5"
        )}
      >
        {/* Ripple effects */}
        <AnimatePresence>
          {state === "unlocking" &&
            [0, 0.2, 0.4].map((delay, i) => (
              <motion.div
                key={`ripple-${i}`}
                className="absolute inset-0 rounded-2xl border border-foreground/20"
                style={{ zIndex: -1 }}
                initial={{ scale: 1, opacity: 0.3 }}
                animate={{ scale: 2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, delay, ease: "easeOut" }}
              />
            ))}
        </AnimatePresence>

        {/* Particles */}
        <AnimatePresence>
          {state === "unlocking" &&
            particles.map((particle) => (
              <motion.div
                key={`particle-${particle.id}`}
                className="absolute w-0.5 h-0.5 rounded-full bg-foreground"
                style={{ left: "50%", top: "50%" }}
                initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
                animate={{
                  scale: [0, 1, 0],
                  x: Math.cos(particle.angle) * 150,
                  y: Math.sin(particle.angle) * 150,
                  opacity: [0, 0.6, 0],
                }}
                transition={{
                  duration: particle.duration,
                  delay: particle.delay,
                  ease: "easeOut",
                }}
              />
            ))}
        </AnimatePresence>

        <div className="relative z-10 flex flex-col items-center space-y-6">
          {/* Icon with pulsing rings */}
          <motion.div
            className="relative"
            animate={state === "unlocking" ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          >
            <AnimatePresence>
              {state === "unlocking" && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full border border-foreground/30"
                    initial={{ scale: 1, opacity: 0.4 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border border-border"
                    initial={{ scale: 1, opacity: 0.3 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 1.2, delay: 0.4, repeat: Infinity }}
                  />
                </>
              )}
            </AnimatePresence>

            <motion.div
              className="relative w-16 h-16 rounded-full border-2 border-foreground bg-card flex items-center justify-center"
              animate={
                state === "unlocking"
                  ? {
                      borderColor: [
                        "hsl(var(--foreground))",
                        "hsl(var(--muted-foreground))",
                        "hsl(var(--foreground))",
                      ],
                    }
                  : {}
              }
              transition={{ duration: 1.5, repeat: state === "unlocking" ? Infinity : 0 }}
            >
              <svg className="w-7 h-7 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </motion.div>
          </motion.div>

          {/* State text */}
          <AnimatePresence mode="wait">
            {state === "unlocking" && (
              <motion.p
                key="unlocking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium text-foreground"
              >
                Processando...
              </motion.p>
            )}
            {state === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1 text-center"
              >
                <motion.p
                  className="text-sm font-medium text-foreground"
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 0.4 }}
                >
                  Concluído
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xs text-muted-foreground"
                >
                  Geração finalizada
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading bar */}
          {state === "unlocking" && (
            <motion.div
              className="w-48 h-px bg-border overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                className="h-full bg-foreground"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: durationSeconds * 0.93, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </div>

        {/* Corner accents */}
        <AnimatePresence>
          {state === "unlocking" &&
            (["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
              (corner, i) => (
                <motion.div
                  key={corner}
                  className={`absolute w-6 h-6 border-foreground/30 ${
                    corner === "top-left"
                      ? "top-0 left-0 border-t border-l"
                      : corner === "top-right"
                        ? "top-0 right-0 border-t border-r"
                        : corner === "bottom-left"
                          ? "bottom-0 left-0 border-b border-l"
                          : "bottom-0 right-0 border-b border-r"
                  }`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: [0, 0.4, 0], scale: [0.8, 1, 1] }}
                  transition={{ duration: 0.8, delay: i * 0.05 }}
                />
              )
            )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
