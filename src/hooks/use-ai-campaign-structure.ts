/**
 * useAICampaignStructure Hook
 * Story 6.12: AI Campaign Structure Generation
 *
 * AC #3 - Call AI API with campaign_structure_generation prompt
 * AC #3 - Parse AI response JSON into BuilderBlock[] format
 * AC #5 - Error handling
 * AC #6 - emailMode assignment based on objective
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import type { BuilderBlock } from "@/stores/use-builder-store";
import type { CampaignObjective, UrgencyLevel } from "@/components/campaigns/AICampaignWizard";

// ==============================================
// TYPES
// ==============================================

/**
 * Input parameters for structure generation
 */
export interface GenerateStructureParams {
  productId: string | null;
  objective: CampaignObjective;
  description: string;
  tone: string;
  urgency: UrgencyLevel;
}

/**
 * AI-generated structure item (from API response)
 */
export interface AIStructureItem {
  position: number;
  type: "email" | "delay";
  context?: string;
  days?: number;
  emailMode?: "initial" | "follow-up";
}

/**
 * AI structure generation response
 */
export interface AIStructureResponse {
  structure: {
    totalEmails: number;
    totalDays: number;
    items: AIStructureItem[];
  };
  rationale: string;
}

/**
 * Generated structure result
 */
export interface GeneratedStructure {
  blocks: BuilderBlock[];
  totalEmails: number;
  totalDays: number;
  rationale: string;
}

/**
 * Hook return type
 */
export interface UseAICampaignStructureReturn {
  generate: (params: GenerateStructureParams) => Promise<GeneratedStructure>;
  isGenerating: boolean;
  error: string | null;
  reset: () => void;
}

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Generation timeout - must be > server timeout (30s) to avoid client abort before server completes
 */
export const GENERATION_TIMEOUT_MS = 35000;

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Convert AI structure items to BuilderBlock format
 * AC #4 - Parse AI response JSON into BuilderBlock[] format
 * AC #8 - Include emailMode in generated block data
 */
export function convertStructureToBlocks(items: AIStructureItem[]): BuilderBlock[] {
  return items.map((item, index) => {
    if (item.type === "email") {
      return {
        id: crypto.randomUUID(),
        type: "email" as const,
        position: index,
        data: {
          subject: "",
          body: "",
          emailMode: item.emailMode || "initial",
          strategicContext: item.context || "",
        },
      };
    } else {
      return {
        id: crypto.randomUUID(),
        type: "delay" as const,
        position: index,
        data: {
          delayValue: item.days || 3,
          delayUnit: "days" as const,
        },
      };
    }
  });
}

/**
 * Parse and validate AI JSON response
 * AC #3 - Parse AI response JSON
 * AC #5 - Handle invalid responses
 */
export function parseAIResponse(responseText: string): AIStructureResponse {
  // Remove markdown code blocks if present
  let cleanText = responseText.trim();
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.slice(7);
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.slice(3);
  }
  if (cleanText.endsWith("```")) {
    cleanText = cleanText.slice(0, -3);
  }
  cleanText = cleanText.trim();

  const parsed = JSON.parse(cleanText);

  // Validate structure
  if (!parsed.structure || !Array.isArray(parsed.structure.items)) {
    throw new Error("Estrutura invalida na resposta da IA");
  }

  // Validate minimum requirements
  const emailCount = parsed.structure.items.filter(
    (item: AIStructureItem) => item.type === "email"
  ).length;

  if (emailCount < 3) {
    throw new Error("A IA gerou menos de 3 emails. Tente novamente.");
  }

  if (emailCount > 7) {
    throw new Error("A IA gerou mais de 7 emails. Tente novamente.");
  }

  return parsed as AIStructureResponse;
}

// ==============================================
// HOOK
// ==============================================

/**
 * Hook for AI campaign structure generation
 *
 * @example
 * ```tsx
 * const { generate, isGenerating, error, reset } = useAICampaignStructure();
 *
 * const handleGenerate = async () => {
 *   const result = await generate({
 *     productId: "123",
 *     objective: "cold_outreach",
 *     description: "",
 *     tone: "formal",
 *     urgency: "medium",
 *   });
 *   // result.blocks contains BuilderBlock[]
 * };
 * ```
 */
export function useAICampaignStructure(): UseAICampaignStructureReturn {
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isTimeoutAbortRef = useRef(false);

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    setError(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Generate campaign structure via AI
   */
  const generateStructure = useCallback(
    async (params: GenerateStructureParams): Promise<GeneratedStructure> => {
      setError(null);
      abortControllerRef.current = new AbortController();
      isTimeoutAbortRef.current = false;

      // Set up timeout (AC #3: <10 seconds)
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          isTimeoutAbortRef.current = true;
          abortControllerRef.current.abort();
        }
      }, GENERATION_TIMEOUT_MS);

      try {
        const response = await fetch("/api/ai/campaign-structure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: params.productId,
            objective: params.objective,
            description: params.description,
            tone: params.tone,
            urgency: params.urgency,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || "Nao foi possivel gerar a estrutura. Tente novamente."
          );
        }

        const data = await response.json();

        if (!data.success || !data.data) {
          throw new Error(data.error?.message || "Resposta invalida do servidor");
        }

        // Parse the AI response
        const aiResponse = parseAIResponse(data.data.text);

        // Convert to BuilderBlock format
        const blocks = convertStructureToBlocks(aiResponse.structure.items);

        if (blocks.length === 0) {
          throw new Error("A IA nao gerou nenhum bloco. Tente novamente.");
        }

        return {
          blocks,
          totalEmails: aiResponse.structure.totalEmails,
          totalDays: aiResponse.structure.totalDays,
          rationale: aiResponse.rationale,
        };
      } catch (err) {
        // Handle abort errors
        if (err instanceof Error && err.name === "AbortError") {
          if (isTimeoutAbortRef.current) {
            const timeoutError = "Tempo limite excedido. Tente novamente.";
            setError(timeoutError);
            throw new Error(timeoutError);
          }
          throw err; // User-initiated abort
        }

        // Handle JSON parse errors
        if (err instanceof SyntaxError) {
          const parseError = "A IA retornou um formato invalido. Tente novamente.";
          setError(parseError);
          throw new Error(parseError);
        }

        // Handle other errors
        const errorMessage =
          err instanceof Error ? err.message : "Erro ao gerar estrutura. Tente novamente.";
        setError(errorMessage);
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    []
  );

  /**
   * TanStack Query mutation
   */
  const mutation = useMutation({
    mutationFn: generateStructure,
    onError: (err) => {
      if (!(err instanceof Error && err.name === "AbortError")) {
        const errorMessage =
          err instanceof Error ? err.message : "Erro ao gerar estrutura. Tente novamente.";
        setError(errorMessage);
      }
    },
  });

  /**
   * Generate function wrapper
   */
  const generate = useCallback(
    async (params: GenerateStructureParams): Promise<GeneratedStructure> => {
      return mutation.mutateAsync(params);
    },
    [mutation]
  );

  return {
    generate,
    isGenerating: mutation.isPending,
    error,
    reset,
  };
}
