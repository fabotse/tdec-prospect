/**
 * AgentTypingIndicator
 * Story 16.2: Sistema de Mensagens do Chat
 *
 * AC: #5 - Indicador de "agente digitando" com animacao
 */

"use client";

import { motion } from "framer-motion";
import { Bot } from "lucide-react";

const dotVariants = {
  animate: (i: number) => ({
    y: [0, -6, 0],
    transition: { repeat: Infinity, duration: 0.6, delay: i * 0.15 },
  }),
};

interface AgentTypingIndicatorProps {
  isVisible: boolean;
}

export function AgentTypingIndicator({ isVisible }: AgentTypingIndicatorProps) {
  if (!isVisible) return null;

  return (
    <div
      className="flex gap-3 mr-auto max-w-[80%]"
      data-testid="agent-typing-indicator"
    >
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
              custom={i}
              variants={dotVariants}
              animate="animate"
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-1">Agente digitando...</span>
      </div>
    </div>
  );
}
