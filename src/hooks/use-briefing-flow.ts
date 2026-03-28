/**
 * useBriefingFlow Hook
 * Story: 16.3 - Briefing Parser & Linguagem Natural
 * Story: 16.6 - Cadastro de Produto Inline
 *
 * AC: #3 - Perguntas guiadas para campos faltantes
 * AC: #4 - Consolidacao e confirmacao do briefing
 * AC 16.6 #1-#5 - Fluxo de cadastro de produto inline
 */

"use client";

import { useCallback, useRef, useState } from "react";
import type { ParsedBriefing, ExtractedProduct } from "@/types/agent";
import type { CreateProductInput } from "@/types/product";
import type { BriefingParseResponse } from "@/app/api/agent/briefing/parse/route";
import { BriefingSuggestionService } from "@/lib/agent/briefing-suggestion-service";

// ==============================================
// TYPES
// ==============================================

export type BriefingFlowStatus =
  | "idle"
  | "parsing"
  | "awaiting_fields"
  | "confirming"
  | "confirmed"
  | "awaiting_product_decision"
  | "awaiting_product_details"
  | "confirming_product";

export interface BriefingFlowState {
  status: BriefingFlowStatus;
  briefing: ParsedBriefing | null;
  missingFields: string[];
  isComplete: boolean;
  productMentioned: string | null;
  pendingProduct: ExtractedProduct | null;
}

// ==============================================
// CONFIRMATION KEYWORDS
// ==============================================

const CONFIRMATION_KEYWORDS = [
  "sim",
  "confirmo",
  "ok",
  "pode ir",
  "isso",
  "correto",
  "exato",
  "perfeito",
  "isso mesmo",
  "confirma",
  "confirmar",
  "pode",
  "vai",
  "bora",
  "manda",
  "vamos",
];

const PRODUCT_REJECTION_KEYWORDS = [
  "nao",
  "depois",
  "sem produto",
  "pular",
  "outro",
  "skip",
];

// ==============================================
// HELP KEYWORDS (Story 17.8 AC: #2)
// ==============================================

export const HELP_KEYWORDS: string[] = [
  "sugere",
  "sugestao",
  "me ajuda",
  "nao sei",
  "qual deveria",
  "recomenda",
  "indica",
  "quais cargos",
  "quais tecnologias",
  "quais opcoes",
];

// ==============================================
// SMART QUESTIONS (Story 17.8 — replaces FIELD_QUESTIONS)
// ==============================================

export function generateSmartQuestion(
  field: string,
  suggestions: string[],
  briefing: ParsedBriefing
): string {
  if (field === "jobTitles" && suggestions.length > 0) {
    const context = briefing.technology
      ? `Para empresas que usam ${briefing.technology}`
      : briefing.industry
        ? `No setor de ${briefing.industry}`
        : "Para prospeccao B2B";
    return `${context}, cargos comuns seriam: ${suggestions.join(", ")}. Quer usar algum desses ou tem outra preferencia?`;
  }

  if (field === "technology" && suggestions.length > 0) {
    const sectorContext = briefing.industry
      ? `no setor de ${briefing.industry}`
      : "no setor";
    return `Algumas tecnologias comuns ${sectorContext} seriam: ${suggestions.join(", ")}. Quer filtrar por alguma ou prefere buscar sem filtro de tecnologia?`;
  }

  // Fallback generico
  const fieldLabels: Record<string, string> = {
    technology: "tecnologia ou ferramenta",
    jobTitles: "cargos-alvo",
    location: "localizacao",
    industry: "industria ou setor",
    companySize: "tamanho de empresa",
  };
  return `Qual ${fieldLabels[field] ?? field} voce tem em mente? Se nao souber, posso sugerir opcoes.`;
}

// Fields that the agent actively asks about (technology + jobTitles)
// Other fields (location, industry, companySize) are optional context — tracked in missingFields
// for isComplete accuracy but NOT asked about in guided questions
const QUESTIONABLE_FIELDS = ["technology", "jobTitles"];

function generateSmartQuestions(
  missingFields: string[],
  suggestions: Record<string, string[]>,
  briefing: ParsedBriefing
): string {
  const questionableFields = missingFields.filter((f) => QUESTIONABLE_FIELDS.includes(f));
  const questions = questionableFields
    .map((field) => generateSmartQuestion(field, suggestions[field] ?? [], briefing));

  if (questions.length === 0) return "";

  return `Para montar a prospeccao, preciso de mais alguns detalhes:\n${questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n")}`;
}

function isHelpRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return HELP_KEYWORDS.some((kw) => normalized.includes(kw));
}

function generateBriefingSummary(briefing: ParsedBriefing, missingFields?: string[]): string {
  const lines: string[] = ["Entendi! Vou prospectar com os seguintes parametros:"];

  if (briefing.technology) lines.push(`- Tecnologia: ${briefing.technology}`);
  if (briefing.jobTitles.length > 0) lines.push(`- Cargos: ${briefing.jobTitles.join(", ")}`);
  if (briefing.location) lines.push(`- Localizacao: ${briefing.location}`);
  if (briefing.companySize) lines.push(`- Tamanho: ${briefing.companySize}`);
  if (briefing.industry) lines.push(`- Industria: ${briefing.industry}`);

  // Notas sobre campos nao informados (Story 17.8 AC: #3)
  if (missingFields && missingFields.length > 0) {
    const fieldNotes: Record<string, string> = {
      technology: "Sem tecnologia especifica — busca mais ampla por industria/localizacao.",
      industry: "Sem industria especifica — busca em todos os setores.",
      location: "Sem localizacao especifica — busca em todas as regioes.",
      companySize: "Sem filtro de tamanho de empresa.",
    };
    const notes = missingFields
      .map((f) => fieldNotes[f])
      .filter(Boolean);
    if (notes.length > 0) {
      lines.push("");
      for (const note of notes) {
        lines.push(note);
      }
    }
  }

  // Nota de skip de busca de empresas (Story 17.10 AC: #1)
  if (briefing.skipSteps?.includes("search_companies")) {
    const params = [
      briefing.jobTitles.length > 0 ? briefing.jobTitles.join(", ") : null,
      briefing.industry,
      briefing.location,
    ].filter(Boolean).join(" + ");
    lines.push(`Etapa de busca de empresas sera pulada — leads serao buscados diretamente por ${params || "cargos"}.`);
  }

  lines.push("\nConfirma esses parametros?");

  return lines.join("\n");
}

function generateProductSummary(product: ExtractedProduct): string {
  return `Cadastrei o ${product.name} com os seguintes dados:\n- Descricao: ${product.description}\n- Features: ${product.features || "nao informado"}\n- Diferenciais: ${product.differentials || "nao informado"}\n- Publico-alvo: ${product.targetAudience || "nao informado"}\n\nEsta correto?`;
}

function isConfirmation(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return CONFIRMATION_KEYWORDS.some((kw) => normalized.includes(kw));
}

function isProductRejection(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return PRODUCT_REJECTION_KEYWORDS.some((kw) => normalized.includes(kw));
}

// ==============================================
// HOOK
// ==============================================

export interface UseBriefingFlowReturn {
  state: BriefingFlowState;
  processMessage: (
    content: string,
    executionId: string,
    sendAgentMessage: (executionId: string, content: string) => Promise<void>,
    createProduct?: (product: CreateProductInput) => Promise<string | null>
  ) => Promise<{ handled: boolean; confirmed?: boolean }>;
  reset: () => void;
}

export function useBriefingFlow(): UseBriefingFlowReturn {
  const [state, setState] = useState<BriefingFlowState>({
    status: "idle",
    briefing: null,
    missingFields: [],
    isComplete: false,
    productMentioned: null,
    pendingProduct: null,
  });

  const messageHistoryRef = useRef<string[]>([]);

  const callParseAPI = useCallback(
    async (message: string, executionId: string): Promise<BriefingParseResponse> => {
      const response = await fetch("/api/agent/briefing/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId, message }),
      });

      if (!response.ok) {
        let errorMessage = "Erro ao parsear briefing";
        try {
          const error = await response.json();
          errorMessage = error.error?.message || errorMessage;
        } catch {
          // Non-JSON error response (e.g. 502 HTML) — use default message
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    []
  );

  const callParseProductAPI = useCallback(
    async (
      message: string,
      executionId: string,
      productName: string
    ): Promise<{ product: ExtractedProduct }> => {
      const response = await fetch("/api/agent/briefing/parse-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId, message, productName }),
      });

      if (!response.ok) {
        let errorMessage = "Erro ao parsear produto";
        try {
          const error = await response.json();
          errorMessage = error.error?.message || errorMessage;
        } catch {
          // Non-JSON error response (e.g. 502 HTML) — use default message
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    []
  );

  const handleParseResult = useCallback(
    async (
      result: BriefingParseResponse,
      executionId: string,
      sendAgentMessage: (executionId: string, content: string) => Promise<void>
    ): Promise<{ handled: boolean }> => {
      // Story 17.8: Use canProceed instead of isComplete for flow decisions
      if (result.canProceed) {
        // Check if product was mentioned but not found
        if (result.productMentioned && result.briefing.productSlug === null) {
          setState((prev) => ({
            ...prev,
            status: "awaiting_product_decision",
            briefing: result.briefing,
            missingFields: result.missingFields,
            isComplete: result.isComplete,
            productMentioned: result.productMentioned,
          }));
          await sendAgentMessage(
            executionId,
            `Nao encontrei o produto '${result.productMentioned}' na base de conhecimento. Quer cadastrar agora? Vou precisar de: nome, descricao, features, diferenciais e publico-alvo.`
          );
          return { handled: true };
        }

        // canProceed but may have missing optional fields — show summary with notes
        setState((prev) => ({
          ...prev,
          status: "confirming",
          briefing: result.briefing,
          missingFields: result.missingFields,
          isComplete: result.isComplete,
        }));
        await sendAgentMessage(
          executionId,
          generateBriefingSummary(result.briefing, result.missingFields)
        );
      } else {
        // Cannot proceed — ask smart questions with suggestions
        setState((prev) => ({
          ...prev,
          status: "awaiting_fields",
          briefing: result.briefing,
          missingFields: result.missingFields,
          isComplete: result.isComplete,
        }));
        await sendAgentMessage(
          executionId,
          generateSmartQuestions(result.missingFields, result.suggestions, result.briefing)
        );
      }

      return { handled: true };
    },
    []
  );

  const processMessage = useCallback(
    async (
      content: string,
      executionId: string,
      sendAgentMessage: (executionId: string, content: string) => Promise<void>,
      createProduct?: (product: CreateProductInput) => Promise<string | null>
    ): Promise<{ handled: boolean; confirmed?: boolean }> => {
      const currentStatus = state.status;

      // === PRODUCT FLOW HANDLERS ===

      // Handler: awaiting_product_decision (AC: #1, #5)
      if (currentStatus === "awaiting_product_decision") {
        const rejected = isProductRejection(content);
        const confirmed = isConfirmation(content);

        if (rejected && !confirmed) {
          setState((prev) => ({
            ...prev,
            status: "confirming",
            productMentioned: null,
          }));
          if (state.briefing) {
            await sendAgentMessage(
              executionId,
              generateBriefingSummary(state.briefing)
            );
          }
          return { handled: true };
        }

        if (confirmed && !rejected) {
          setState((prev) => ({ ...prev, status: "awaiting_product_details" }));
          await sendAgentMessage(
            executionId,
            "Otimo! Me descreva o produto em linguagem natural. Pode incluir o que ele faz, funcionalidades, diferenciais e para quem e voltado."
          );
          return { handled: true };
        }

        // Ambiguous (both or neither matched)
        await sendAgentMessage(
          executionId,
          `Quer cadastrar o produto '${state.productMentioned ?? ""}' agora? Responda 'sim' para cadastrar ou 'nao' para continuar sem produto.`
        );
        return { handled: true };
      }

      // Handler: awaiting_product_details (AC: #2)
      if (currentStatus === "awaiting_product_details") {
        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseProductAPI(
            content,
            executionId,
            state.productMentioned ?? ""
          );
          setState((prev) => ({
            ...prev,
            status: "confirming_product",
            pendingProduct: result.product,
          }));
          await sendAgentMessage(
            executionId,
            generateProductSummary(result.product)
          );
          return { handled: true };
        } catch {
          setState((prev) => ({ ...prev, status: "awaiting_product_details" }));
          await sendAgentMessage(
            executionId,
            "Nao consegui extrair os dados. Tente descrever novamente o produto, incluindo nome, o que faz e para quem."
          );
          return { handled: true };
        }
      }

      // Handler: confirming_product (AC: #2, #3)
      if (currentStatus === "confirming_product") {
        const confirmed = isConfirmation(content);
        const rejected = isProductRejection(content);

        if (confirmed && !rejected) {
          if (createProduct && state.pendingProduct) {
            const productId = await createProduct(state.pendingProduct);
            if (productId && state.briefing) {
              const updatedBriefing: ParsedBriefing = {
                ...state.briefing,
                productSlug: productId,
              };
              setState((prev) => ({
                ...prev,
                status: "confirming",
                briefing: updatedBriefing,
                pendingProduct: null,
                productMentioned: null,
              }));
              await sendAgentMessage(
                executionId,
                `Produto cadastrado! ${generateBriefingSummary(updatedBriefing)}`
              );
              return { handled: true };
            }

            // Creation failed
            await sendAgentMessage(
              executionId,
              "Erro ao cadastrar produto. Quer tentar novamente?"
            );
            setState((prev) => ({
              ...prev,
              status: "awaiting_product_decision",
            }));
            return { handled: true };
          }

          // No createProduct callback — skip product
          setState((prev) => ({
            ...prev,
            status: "confirming",
            pendingProduct: null,
            productMentioned: null,
          }));
          if (state.briefing) {
            await sendAgentMessage(
              executionId,
              generateBriefingSummary(state.briefing)
            );
          }
          return { handled: true };
        }

        if (rejected && !confirmed) {
          // Rejection — re-describe product
          setState((prev) => ({
            ...prev,
            status: "awaiting_product_details",
            pendingProduct: null,
          }));
          await sendAgentMessage(
            executionId,
            "OK, me descreva o produto novamente."
          );
          return { handled: true };
        }

        // Ambiguous — ask for clarification
        await sendAgentMessage(
          executionId,
          "Os dados estao corretos? Responda 'sim' para confirmar ou 'nao' para descrever novamente."
        );
        return { handled: true };
      }

      // === ORIGINAL FLOW HANDLERS ===

      // Confirming state — check for confirmation or correction
      if (currentStatus === "confirming") {
        if (isConfirmation(content)) {
          setState((prev) => ({ ...prev, status: "confirmed" }));
          return { handled: true, confirmed: true };
        }

        // User is correcting — re-parse with full context
        messageHistoryRef.current.push(content);
        const fullMessage = messageHistoryRef.current.join("\n");

        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(fullMessage, executionId);
          return handleParseResult(result, executionId, sendAgentMessage);
        } catch {
          setState((prev) => ({ ...prev, status: "confirming" }));
          return { handled: false };
        }
      }

      // Awaiting fields — check for help request or re-parse with accumulated context
      if (currentStatus === "awaiting_fields") {
        // Story 17.8 AC: #2 — detect help keywords and respond with suggestions
        if (isHelpRequest(content) && state.briefing) {
          const suggestions = BriefingSuggestionService.generateSuggestions(state.briefing);
          const missingFields = state.missingFields;
          const helpResponse = generateSmartQuestions(missingFields, suggestions, state.briefing);
          if (helpResponse) {
            await sendAgentMessage(executionId, helpResponse);
            return { handled: true };
          }
        }

        messageHistoryRef.current.push(content);
        const fullMessage = messageHistoryRef.current.join("\n");

        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(fullMessage, executionId);
          return handleParseResult(result, executionId, sendAgentMessage);
        } catch {
          setState((prev) => ({ ...prev, status: "awaiting_fields" }));
          return { handled: false };
        }
      }

      // Idle or first message — initial parse
      if (currentStatus === "idle") {
        messageHistoryRef.current = [content];

        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(content, executionId);
          return handleParseResult(result, executionId, sendAgentMessage);
        } catch {
          setState({
            status: "idle",
            briefing: null,
            missingFields: [],
            isComplete: false,
            productMentioned: null,
            pendingProduct: null,
          });
          return { handled: false };
        }
      }

      // Confirmed or parsing — don't handle
      return { handled: false };
    },
    [state.status, state.briefing, state.missingFields, state.productMentioned, state.pendingProduct, callParseAPI, callParseProductAPI, handleParseResult]
  );

  const reset = useCallback(() => {
    setState({
      status: "idle",
      briefing: null,
      missingFields: [],
      isComplete: false,
      productMentioned: null,
      pendingProduct: null,
    });
    messageHistoryRef.current = [];
  }, []);

  return { state, processMessage, reset };
}
