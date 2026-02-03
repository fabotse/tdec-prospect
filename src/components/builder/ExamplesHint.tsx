/**
 * ExamplesHint Component
 * Story 6.10: Use of Successful Examples
 *
 * AC #7: User Guidance When Examples Missing
 * - Subtle hint suggests adding examples for better results
 * - Includes link to Knowledge Base > Exemplos
 * - Non-blocking (user can still generate without examples)
 */

"use client";

import Link from "next/link";
import { Lightbulb } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ExamplesHintProps {
  /** Whether the knowledge base has email examples configured */
  hasExamples: boolean;
}

/**
 * Subtle hint component that appears when no email examples are configured.
 * Links to Knowledge Base > Exemplos settings for better AI generation results.
 *
 * @example
 * ```tsx
 * const { hasExamples } = useKnowledgeBaseContext();
 * <ExamplesHint hasExamples={hasExamples} />
 * ```
 */
export function ExamplesHint({ hasExamples }: ExamplesHintProps) {
  // Don't render anything if examples exist (AC #7: non-blocking)
  if (hasExamples) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/settings/knowledge-base"
            data-testid="examples-hint-link"
            className="text-muted-foreground hover:text-amber-500 transition-colors"
            aria-label="Adicione exemplos de emails para melhorar a qualidade da geracao"
          >
            <Lightbulb className="h-3.5 w-3.5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[250px] text-center"
        >
          <p className="text-xs">
            Adicione exemplos de emails bem-sucedidos em{" "}
            <span className="font-medium">Base de Conhecimento</span> para
            melhorar a qualidade da geracao.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
