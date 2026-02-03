/**
 * AIGenerateButton Component
 * Story 6.2: AI Text Generation in Builder
 * Story 6.8: Text Regeneration
 *
 * AC 6.2: #1 - Generate Button in Email Block
 * AC 6.2: #2 - Error handling with retry
 *
 * AC 6.8: #1 - Regenerate Button Visibility
 * AC 6.8: #3 - Streaming Animation on Regeneration
 * AC 6.8: #4 - Multiple Regenerations
 *
 * Button component for triggering AI text generation with
 * loading, error, regenerate, and retry states.
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
  /** Story 6.8 AC #1: Whether content has been generated (shows "Regenerar" instead of "Gerar com IA") */
  hasContent?: boolean;
}

// ==============================================
// COMPONENT
// ==============================================

/**
 * AI Generate Button with state-aware text and icons
 *
 * States:
 * - idle (no content): "✨ Gerar com IA"
 * - idle (has content): "🔄 Regenerar" (Story 6.8 AC #1)
 * - generating/streaming: "Gerando..." with spinner
 * - error: "🔄 Tentar novamente"
 */
export function AIGenerateButton({
  phase,
  error,
  onClick,
  disabled = false,
  className,
  hasContent = false,
}: AIGenerateButtonProps) {
  const isLoading = phase === "generating" || phase === "streaming";
  const isError = phase === "error" || !!error;

  // Determine button text based on state (Story 6.8 AC #1)
  // Priority: Loading > Error > HasContent > Default
  const getButtonText = () => {
    if (isLoading) {
      return "Gerando...";
    }
    if (isError) {
      return "Tentar novamente";
    }
    if (hasContent) {
      return "Regenerar";
    }
    return "Gerar com IA";
  };

  // Determine icon based on state (Story 6.8 AC #1)
  // Priority: Loading > Error > HasContent > Default
  const getIcon = () => {
    if (isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (isError) {
      return <RefreshCw className="h-4 w-4" />;
    }
    if (hasContent) {
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
      aria-label={
        isError
          ? "Tentar gerar novamente"
          : hasContent
            ? "Regenerar texto com IA"
            : "Gerar texto com IA"
      }
      aria-busy={isLoading}
    >
      {getIcon()}
      {getButtonText()}
    </Button>
  );
}
