/**
 * AIGenerateButton Component
 * Story 6.2: AI Text Generation in Builder
 *
 * AC: #1 - Generate Button in Email Block
 * AC: #2 - Error handling with retry
 *
 * Button component for triggering AI text generation with
 * loading, error, and retry states.
 */

"use client";

import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GenerationPhase } from "@/hooks/use-ai-generate";

// ==============================================
// TYPES
// ==============================================

interface AIGenerateButtonProps {
  /** Current generation phase */
  phase: GenerationPhase;
  /** Error message to display */
  error?: string | null;
  /** Click handler to trigger generation or retry */
  onClick: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ==============================================
// COMPONENT
// ==============================================

/**
 * AI Generate Button with state-aware text and icons
 *
 * States:
 * - idle: "✨ Gerar com IA"
 * - generating/streaming: "Gerando..." with spinner
 * - error: "🔄 Tentar novamente"
 * - done: "✨ Gerar com IA" (returns to idle state)
 */
export function AIGenerateButton({
  phase,
  error,
  onClick,
  disabled = false,
  className,
}: AIGenerateButtonProps) {
  const isLoading = phase === "generating" || phase === "streaming";
  const isError = phase === "error" || !!error;

  // Determine button text based on state
  const getButtonText = () => {
    if (isLoading) {
      return "Gerando...";
    }
    if (isError) {
      return "Tentar novamente";
    }
    return "Gerar com IA";
  };

  // Determine icon based on state
  const getIcon = () => {
    if (isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (isError) {
      return <RefreshCw className="h-4 w-4" />;
    }
    return <Sparkles className="h-4 w-4" />;
  };

  return (
    <Button
      type="button"
      variant={isError ? "destructive" : "outline"}
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled || isLoading}
      className={cn(
        "gap-2 transition-all duration-200",
        isLoading && "cursor-wait",
        className
      )}
      aria-label={isError ? "Tentar gerar novamente" : "Gerar texto com IA"}
      aria-busy={isLoading}
    >
      {getIcon()}
      {getButtonText()}
    </Button>
  );
}
