/**
 * useBriefingFlow Hook
 * Story: 16.3 - Briefing Parser & Linguagem Natural
 *
 * AC: #3 - Perguntas guiadas para campos faltantes
 * AC: #4 - Consolidacao e confirmacao do briefing
 */

"use client";

import { useCallback, useRef, useState } from "react";
import type { ParsedBriefing } from "@/types/agent";
import type { BriefingParseResponse } from "@/app/api/agent/briefing/parse/route";

// ==============================================
// TYPES
// ==============================================

export type BriefingFlowStatus =
  | "idle"
  | "parsing"
  | "awaiting_fields"
  | "confirming"
  | "confirmed";

export interface BriefingFlowState {
  status: BriefingFlowStatus;
  briefing: ParsedBriefing | null;
  missingFields: string[];
  isComplete: boolean;
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

// ==============================================
// GUIDED QUESTIONS
// ==============================================

const FIELD_QUESTIONS: Record<string, string> = {
  technology:
    "Qual tecnologia ou ferramenta essas empresas devem usar? (ex: Netskope, AWS, Salesforce)",
  jobTitles:
    "Quais cargos voce quer atingir? (ex: CTOs, Heads de TI, CISOs)",
};

function generateGuidedQuestions(missingFields: string[]): string {
  const questions = missingFields
    .map((field) => FIELD_QUESTIONS[field])
    .filter(Boolean);

  if (questions.length === 0) return "";

  return `Para montar a prospeccao, preciso de mais alguns detalhes:\n${questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n")}`;
}

function generateBriefingSummary(briefing: ParsedBriefing): string {
  const lines: string[] = ["Entendi! Vou prospectar com os seguintes parametros:"];

  if (briefing.technology) lines.push(`- Tecnologia: ${briefing.technology}`);
  if (briefing.jobTitles.length > 0) lines.push(`- Cargos: ${briefing.jobTitles.join(", ")}`);
  if (briefing.location) lines.push(`- Localizacao: ${briefing.location}`);
  if (briefing.companySize) lines.push(`- Tamanho: ${briefing.companySize}`);
  if (briefing.industry) lines.push(`- Industria: ${briefing.industry}`);

  lines.push("\nConfirma esses parametros?");

  return lines.join("\n");
}

function isConfirmation(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return CONFIRMATION_KEYWORDS.some((kw) => normalized.includes(kw));
}

// ==============================================
// HOOK
// ==============================================

export interface UseBriefingFlowReturn {
  state: BriefingFlowState;
  processMessage: (
    content: string,
    executionId: string,
    sendAgentMessage: (executionId: string, content: string) => Promise<void>
  ) => Promise<{ handled: boolean; confirmed?: boolean }>;
  reset: () => void;
}

export function useBriefingFlow(): UseBriefingFlowReturn {
  const [state, setState] = useState<BriefingFlowState>({
    status: "idle",
    briefing: null,
    missingFields: [],
    isComplete: false,
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
        const error = await response.json();
        throw new Error(error.error?.message || "Erro ao parsear briefing");
      }

      return response.json();
    },
    []
  );

  const processMessage = useCallback(
    async (
      content: string,
      executionId: string,
      sendAgentMessage: (executionId: string, content: string) => Promise<void>
    ): Promise<{ handled: boolean; confirmed?: boolean }> => {
      const currentStatus = state.status;

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

          setState({
            status: result.isComplete ? "confirming" : "awaiting_fields",
            briefing: result.briefing,
            missingFields: result.missingFields,
            isComplete: result.isComplete,
          });

          if (result.isComplete) {
            await sendAgentMessage(executionId, generateBriefingSummary(result.briefing));
          } else {
            await sendAgentMessage(
              executionId,
              generateGuidedQuestions(result.missingFields)
            );
          }

          return { handled: true };
        } catch {
          setState((prev) => ({ ...prev, status: "confirming" }));
          return { handled: false };
        }
      }

      // Awaiting fields — re-parse with accumulated context
      if (currentStatus === "awaiting_fields") {
        messageHistoryRef.current.push(content);
        const fullMessage = messageHistoryRef.current.join("\n");

        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(fullMessage, executionId);

          setState({
            status: result.isComplete ? "confirming" : "awaiting_fields",
            briefing: result.briefing,
            missingFields: result.missingFields,
            isComplete: result.isComplete,
          });

          if (result.isComplete) {
            await sendAgentMessage(executionId, generateBriefingSummary(result.briefing));
          } else {
            await sendAgentMessage(
              executionId,
              generateGuidedQuestions(result.missingFields)
            );
          }

          return { handled: true };
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

          setState({
            status: result.isComplete ? "confirming" : "awaiting_fields",
            briefing: result.briefing,
            missingFields: result.missingFields,
            isComplete: result.isComplete,
          });

          if (result.isComplete) {
            await sendAgentMessage(executionId, generateBriefingSummary(result.briefing));
          } else {
            await sendAgentMessage(
              executionId,
              generateGuidedQuestions(result.missingFields)
            );
          }

          return { handled: true };
        } catch {
          setState({
            status: "idle",
            briefing: null,
            missingFields: [],
            isComplete: false,
          });
          return { handled: false };
        }
      }

      // Confirmed or parsing — don't handle
      return { handled: false };
    },
    [state.status, callParseAPI]
  );

  const reset = useCallback(() => {
    setState({
      status: "idle",
      briefing: null,
      missingFields: [],
      isComplete: false,
    });
    messageHistoryRef.current = [];
  }, []);

  return { state, processMessage, reset };
}
