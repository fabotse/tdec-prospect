/**
 * useAIFullCampaignGeneration Hook
 * Story 6.12.1: AI Full Campaign Generation
 *
 * AC #2 - Full generation with progress indicator
 * AC #3 - Sequential generation with context passing
 * AC #6 - Partial generation handling
 */

"use client";

import { useState, useCallback, useRef } from "react";
import type { BuilderBlock } from "@/stores/use-builder-store";
import type { CampaignObjective } from "@/components/campaigns/AICampaignWizard";
import { sanitizeGeneratedSubject, sanitizeGeneratedBody } from "@/lib/ai/sanitize-ai-output";

// ==============================================
// TYPES
// ==============================================

/**
 * Parameters for full campaign generation
 * Story 7.1: AI always generates with personalization variables ({{first_name}}, etc.)
 * Preview resolution is handled by PreviewEmailStep via resolveEmailVariables()
 */
export interface FullGenerationParams {
  /** Generated structure blocks */
  blocks: BuilderBlock[];
  /** Campaign ID (for saving) */
  campaignId: string;
  /** Product ID for context */
  productId: string | null;
  /** Product name for display */
  productName: string | null;
  /** Campaign objective */
  objective: CampaignObjective;
  /** Tone of voice */
  tone: string;
  /** KB context variables for AI prompts (company, ICP, tone, examples) */
  kbVariables?: Record<string, string>;
}

/**
 * Generated email content
 */
export interface GeneratedEmail {
  id: string;
  subject: string;
  body: string;
  context?: string;
}

/**
 * Progress update during generation
 */
export interface GenerationProgress {
  currentEmail: number;
  totalEmails: number;
  currentContext: string;
  completedEmails: GeneratedEmail[];
}

/**
 * Hook return type
 */
export interface UseAIFullCampaignGenerationReturn {
  /** Start full generation */
  generate: (params: FullGenerationParams) => Promise<BuilderBlock[]>;
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Current progress state */
  progress: GenerationProgress | null;
  /** Error message if any */
  error: string | null;
  /** Cancel ongoing generation */
  cancel: () => void;
  /** Reset hook state */
  reset: () => void;
}

// ==============================================
// CONSTANTS
// ==============================================

/**
 * Generation timeout for AI API call (30 seconds)
 * Allows enough time for OpenAI to generate subject/body
 */
const AI_API_TIMEOUT_MS = 30000;

/**
 * Total timeout per email generation (subject + body = 60s max)
 */
const GENERATION_TIMEOUT_PER_EMAIL_MS = 60000;

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Generate content for a single email via AI
 */
async function generateEmailContent(
  promptKey: string,
  variables: Record<string, string>,
  productId: string | null,
  signal: AbortSignal
): Promise<string> {
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      promptKey,
      variables,
      productId,
      options: { stream: false, timeoutMs: AI_API_TIMEOUT_MS },
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || "Erro ao gerar conteudo. Tente novamente."
    );
  }

  const data = await response.json();

  if (!data.success || !data.data?.text) {
    throw new Error(data.error?.message || "Resposta invalida do servidor");
  }

  return data.data.text;
}

/**
 * Determine email mode and prompt keys based on emailMode from block
 *
 * The emailMode is the authoritative source - it comes from:
 * - Templates: explicitly defined per email in structure_json
 * - AI-generated structures: determined by campaign_structure_generation prompt
 *
 * This ensures follow-up emails use follow-up prompts regardless of objective.
 */
function getPromptKeys(
  _objective: CampaignObjective,
  _emailIndex: number,
  emailMode: "initial" | "follow-up"
): { subjectKey: string; bodyKey: string } {
  // Follow-up emails use follow-up prompts (reference previous email)
  if (emailMode === "follow-up") {
    return {
      subjectKey: "follow_up_subject_generation",
      bodyKey: "follow_up_email_generation",
    };
  }

  // Initial emails use standard email prompts
  return {
    subjectKey: "email_subject_generation",
    bodyKey: "email_body_generation",
  };
}

// ==============================================
// HOOK
// ==============================================

/**
 * Hook for full AI campaign generation
 *
 * @example
 * ```tsx
 * const { generate, isGenerating, progress, cancel } = useAIFullCampaignGeneration();
 *
 * const handleGenerate = async () => {
 *   const blocks = await generate({
 *     blocks: structureBlocks,
 *     campaignId: campaign.id,
 *     productId: "123",
 *     productName: "Product",
 *     objective: "cold_outreach",
 *     tone: "formal",
 *   });
 *   // blocks now have subject and body populated
 * };
 * ```
 */
export function useAIFullCampaignGeneration(): UseAIFullCampaignGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    setIsGenerating(false);
    setProgress(null);
    setError(null);
    cancelledRef.current = false;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Cancel ongoing generation
   */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
  }, []);

  /**
   * Generate all email content sequentially
   * AC #2 - Sequential generation with progress
   * AC #3 - Context passing between emails
   * AC #6 - Partial generation handling
   */
  const generate = useCallback(
    async (params: FullGenerationParams): Promise<BuilderBlock[]> => {
      const { blocks, productId, objective, tone, kbVariables } = params;

      // Reset state
      setError(null);
      setIsGenerating(true);
      cancelledRef.current = false;
      abortControllerRef.current = new AbortController();

      // Filter email blocks
      const emailBlocks = blocks.filter((b) => b.type === "email");
      const totalEmails = emailBlocks.length;

      // Initialize progress
      const completedEmails: GeneratedEmail[] = [];
      setProgress({
        currentEmail: 1,
        totalEmails,
        currentContext: "",
        completedEmails: [],
      });

      // Copy blocks for modification
      const resultBlocks = [...blocks];

      try {
        // Generate each email sequentially (AC #3)
        for (let i = 0; i < emailBlocks.length; i++) {
          // Check for cancellation
          if (cancelledRef.current) {
            break;
          }

          const emailBlock = emailBlocks[i];
          const blockData = emailBlock.data as {
            emailMode?: "initial" | "follow-up";
            strategicContext?: string;
          };
          const emailMode = blockData.emailMode || "initial";
          const context = blockData.strategicContext || `Email ${i + 1}`;

          // Update progress
          setProgress((prev) => ({
            ...prev!,
            currentEmail: i + 1,
            currentContext: context,
          }));

          // Get previous email for context (AC #3)
          const previousEmail = i > 0 ? completedEmails[i - 1] : null;

          // Determine prompts based on objective and mode
          const { subjectKey, bodyKey } = getPromptKeys(objective, i, emailMode);

          // Build variables for generation
          // Include KB context (company, ICP, tone, examples) + lead vars empty for template mode
          // Story 7.1: Lead variables are never passed to Wizard generation
          // → prompts' {{#if lead_name}} triggers MODO TEMPLATE (personalization variables)
          // Preview resolution is handled by PreviewEmailStep via resolveEmailVariables()
          const baseVariables: Record<string, string> = {
            ...kbVariables,
            // Override lead variables to force template mode (same pattern as EmailBlock.tsx)
            lead_name: "",
            lead_title: "",
            lead_company: "",
            lead_industry: "",
            lead_location: "",
            icebreaker: "",
            tone_style: tone,
            email_objective: context,
          };

          // Add follow-up specific variables: context + position + strategy
          if (previousEmail && emailMode === "follow-up") {
            baseVariables.previous_email_subject = previousEmail.subject;
            baseVariables.previous_email_body = previousEmail.body;

            // Accumulated history of all previous emails for anti-repetition
            if (completedEmails.length > 1) {
              baseVariables.previous_emails_history = completedEmails
                .map((e, idx) => `Email ${idx + 1}: Assunto: "${e.subject}" | Abordagem: ${e.context || "N/A"}`)
                .join("\n");
            }

            // Sequence position for strategy selection
            const emailPosition = i + 1; // 1-indexed
            const isLastEmail = emailPosition === totalEmails || emailPosition >= 5;
            baseVariables.sequence_position = `Este é o ${emailPosition}º email de ${totalEmails} na sequência.${isLastEmail ? " Este é o ÚLTIMO email da sequência." : ""}`;

            // Body strategy based on position (same logic as EmailBlock.tsx)
            baseVariables.follow_up_strategy = isLastEmail
              ? "DESPEDIDA: Ser direto, dar 'última chance' sem pressão. Diga que vai parar de escrever, deixe a porta aberta. Tom amigável de encerramento. NÃO referencie emails anteriores."
              : emailPosition === 2
              ? "CONFIRMAR VISUALIZAÇÃO: Pergunte gentilmente se o lead conseguiu ver o email anterior. Ofereça uma conversa rápida. NÃO repita o conteúdo do email anterior."
              : emailPosition === 3
              ? "AGENDA CORRIDA: Assuma que o lead está ocupado. Mostre empatia. Ofereça flexibilidade total de horário. NÃO mencione o email anterior diretamente."
              : "NOVO ÂNGULO/VALOR: Traga um dado novo, case de sucesso ou insight do setor. NÃO referencie os emails anteriores. Foque 100% em valor novo.";

            // Subject strategy based on position
            baseVariables.subject_strategy = isLastEmail
              ? "CURTO E DIRETO: Assunto pessoal sem RE:. Exemplo: '{{first_name}}, última mensagem' ou 'Encerramento'"
              : emailPosition === 2
              ? "RE: SIMPLES: Use 'RE: ' + assunto anterior. Exemplo: 'RE: {{previous_email_subject}}'"
              : emailPosition === 3
              ? "RE: COM VARIAÇÃO: Use 'RE: ' + algo novo. Exemplo: 'RE: Bate-papo rápido?' ou 'RE: Sobre a {{company_name}}'"
              : "CURTO E DIRETO: Assunto pessoal sem RE:. Exemplo: '{{first_name}}, conseguiu ver?' ou 'Rápida pergunta'";
          }

          // Set up timeout
          const timeoutMs = GENERATION_TIMEOUT_PER_EMAIL_MS;
          const timeoutId = setTimeout(() => {
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
            }
          }, timeoutMs);

          try {
            // Generate subject
            const rawSubject = await generateEmailContent(
              subjectKey,
              baseVariables,
              productId,
              abortControllerRef.current!.signal
            );
            const subject = sanitizeGeneratedSubject(rawSubject);

            // Check cancellation between subject and body
            if (cancelledRef.current) {
              clearTimeout(timeoutId);
              break;
            }

            // Generate body
            const rawBody = await generateEmailContent(
              bodyKey,
              { ...baseVariables, subject },
              productId,
              abortControllerRef.current!.signal
            );
            const body = sanitizeGeneratedBody(rawBody);

            clearTimeout(timeoutId);

            // Store completed email
            const generatedEmail: GeneratedEmail = {
              id: emailBlock.id,
              subject,
              body,
              context,
            };
            completedEmails.push(generatedEmail);

            // Update progress
            setProgress((prev) => ({
              ...prev!,
              completedEmails: [...completedEmails],
            }));

            // Update block in result (AC #6 - progressive save)
            const blockIndex = resultBlocks.findIndex((b) => b.id === emailBlock.id);
            if (blockIndex !== -1) {
              resultBlocks[blockIndex] = {
                ...resultBlocks[blockIndex],
                data: {
                  ...resultBlocks[blockIndex].data,
                  subject,
                  body,
                },
              };
            }

            // Create new abort controller for next iteration
            if (i < emailBlocks.length - 1) {
              abortControllerRef.current = new AbortController();
            }
          } catch (err) {
            clearTimeout(timeoutId);

            // Handle abort (cancellation or timeout)
            if (err instanceof Error && err.name === "AbortError") {
              if (cancelledRef.current) {
                // User cancelled - return partial results
                break;
              }
              // Timeout - throw error
              throw new Error(
                `Tempo limite excedido no email ${i + 1}. ${completedEmails.length} emails foram gerados.`
              );
            }
            throw err;
          }
        }

        setIsGenerating(false);
        return resultBlocks;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Erro ao gerar campanha. Tente novamente.";
        setError(errorMessage);
        setIsGenerating(false);

        // Return partial results even on error (AC #6)
        return resultBlocks;
      }
    },
    []
  );

  return {
    generate,
    isGenerating,
    progress,
    error,
    cancel,
    reset,
  };
}
