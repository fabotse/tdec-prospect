/**
 * useAIGenerate Hook
 * Story 6.2: AI Text Generation in Builder
 *
 * AC: #1 - Generate email text using AI
 * AC: #2 - Error handling with retry
 * AC: #3 - Streaming UI experience
 *
 * Handles AI text generation with streaming support, phase tracking,
 * and abort/cancel functionality.
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";

// ==============================================
// TYPES
// ==============================================

/**
 * Generation phases for UI state management
 * AC: #3 - Streaming UI experience
 */
export type GenerationPhase =
  | "idle"
  | "generating"
  | "streaming"
  | "done"
  | "error";

/**
 * Prompt keys available for generation
 */
export type AIPromptKey =
  | "email_subject_generation"
  | "email_body_generation"
  | "icebreaker_generation"
  | "tone_application"
  | "follow_up_email_generation"
  | "follow_up_subject_generation";

/**
 * Parameters for text generation
 */
export interface GenerateParams {
  /** Prompt key to use */
  promptKey: AIPromptKey;
  /** Variables to interpolate into prompt */
  variables: Record<string, string>;
  /** Enable streaming (default: true) */
  stream?: boolean;
  /** Product ID for campaign-specific context (Story 6.5) */
  productId?: string | null;
}

/**
 * Hook return type
 */
export interface UseAIGenerateReturn {
  /** Trigger generation */
  generate: (params: GenerateParams) => Promise<string>;
  /** Current generation phase */
  phase: GenerationPhase;
  /** Current streamed text */
  text: string;
  /** Error message if generation failed */
  error: string | null;
  /** Reset hook to idle state */
  reset: () => void;
  /** Cancel ongoing generation */
  cancel: () => void;
  /** Whether generation is in progress */
  isGenerating: boolean;
}

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Generation timeout in milliseconds
 * Increased to 15s to accommodate longer prompts with KB context
 * Original NFR-P2 target was 5s, but real-world usage requires more time
 */
export const GENERATION_TIMEOUT_MS = 15000;

// ==============================================
// DEFAULT VARIABLES (MVP Placeholders)
// ==============================================

/**
 * Default variables when context is not available
 * Story 6.3 will provide real context from knowledge base
 */
export const DEFAULT_GENERATION_VARIABLES: Record<string, string> = {
  company_context: "Empresa de tecnologia focada em soluções B2B",
  lead_name: "Nome",
  lead_title: "Cargo",
  lead_company: "Empresa",
  lead_industry: "Tecnologia",
  lead_location: "Brasil",
  tone_description: "Profissional e amigável",
  email_objective: "Prospecção inicial para apresentar soluções",
  icebreaker: "",
};

// ==============================================
// SSE PARSER
// ==============================================

/**
 * Parse SSE chunk and extract text data
 * Format: "data: {...}\n\n" or "data: [DONE]\n\n"
 */
function parseSSEChunk(chunk: string): { text?: string; done?: boolean; error?: string } {
  const lines = chunk.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6).trim();

      if (data === "[DONE]") {
        return { done: true };
      }

      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          return { error: parsed.error };
        }
        if (parsed.text !== undefined) {
          return { text: parsed.text };
        }
      } catch {
        // Ignore parse errors for incomplete chunks
      }
    }
  }

  return {};
}

// ==============================================
// HOOK
// ==============================================

/**
 * Hook for AI text generation with streaming support
 *
 * @example
 * ```tsx
 * const { generate, phase, text, error, reset } = useAIGenerate();
 *
 * const handleGenerate = async () => {
 *   const result = await generate({
 *     promptKey: "email_subject_generation",
 *     variables: { lead_name: "João", ... }
 *   });
 * };
 * ```
 */
export function useAIGenerate(): UseAIGenerateReturn {
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Abort controller for cancellation (AC: #3)
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track if abort was due to timeout (AC: #1)
  const isTimeoutAbortRef = useRef(false);

  /**
   * Reset hook to idle state
   */
  const reset = useCallback(() => {
    setPhase("idle");
    setText("");
    setError(null);
    abortControllerRef.current = null;
  }, []);

  /**
   * Cancel ongoing generation (AC: #3)
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPhase("idle");
  }, []);

  /**
   * Streaming generation function
   */
  const streamGenerate = useCallback(
    async (params: GenerateParams): Promise<string> => {
      // Reset state
      setText("");
      setError(null);

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      // Phase: generating (initial API call)
      setPhase("generating");

      // Set up timeout (AC #1: generation completes in <5 seconds)
      isTimeoutAbortRef.current = false;
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          isTimeoutAbortRef.current = true;
          abortControllerRef.current.abort();
        }
      }, GENERATION_TIMEOUT_MS);

      try {
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promptKey: params.promptKey,
            variables: params.variables,
            options: { stream: params.stream !== false },
            productId: params.productId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || "Não foi possível gerar. Tente novamente."
          );
        }

        // Non-streaming response (only when explicitly disabled)
        if (params.stream === false) {
          const data = await response.json();
          if (data.success && data.data?.text) {
            setText(data.data.text);
            setPhase("done");
            return data.data.text;
          }
          throw new Error(data.error || "Não foi possível gerar. Tente novamente.");
        }

        // Streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Streaming não suportado pelo navegador.");
        }

        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        // Phase: streaming (receiving chunks)
        setPhase("streaming");

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (end with \n\n)
          const messages = buffer.split("\n\n");
          buffer = messages.pop() || ""; // Keep incomplete message in buffer

          for (const message of messages) {
            if (!message.trim()) continue;

            const parsed = parseSSEChunk(message);

            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.done) {
              setPhase("done");
              return fullText;
            }

            if (parsed.text !== undefined) {
              fullText += parsed.text;
              setText(fullText);
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          const parsed = parseSSEChunk(buffer);
          if (parsed.text !== undefined) {
            fullText += parsed.text;
            setText(fullText);
          }
        }

        setPhase("done");
        return fullText;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    []
  );

  /**
   * TanStack Query mutation for generation
   */
  const mutation = useMutation({
    mutationFn: streamGenerate,
    onError: (err) => {
      // Handle abort errors
      if (err instanceof Error && err.name === "AbortError") {
        // Check if abort was due to timeout (AC #1)
        if (isTimeoutAbortRef.current) {
          setError("Tempo limite excedido. Tente novamente.");
          setPhase("error");
          isTimeoutAbortRef.current = false;
          return;
        }
        // User-initiated cancel - return to idle silently
        setPhase("idle");
        return;
      }

      setError(err instanceof Error ? err.message : "Não foi possível gerar. Tente novamente.");
      setPhase("error");
    },
  });

  /**
   * Generate text with the given parameters
   */
  const generate = useCallback(
    async (params: GenerateParams): Promise<string> => {
      return mutation.mutateAsync(params);
    },
    [mutation]
  );

  return {
    generate,
    phase,
    text,
    error,
    reset,
    cancel,
    isGenerating: phase === "generating" || phase === "streaming",
  };
}
