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
import type { ChatTurn, ParsedBriefing, ExtractedProduct } from "@/types/agent";
import type { CreateProductInput } from "@/types/product";
import type { BriefingParseResponse } from "@/app/api/agent/briefing/parse/route";
import { BriefingSuggestionService } from "@/lib/agent/briefing-suggestion-service";
import { parseLeadInput, type LeadImportResult } from "@/lib/agent/lead-import-parser";
import {
  QUALITY_MIN_COMPANY_SIZE_LABEL,
  resolveDirectSearchCompanySizes,
} from "@/lib/agent/search-defaults";

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
  | "confirming_product"
  | "awaiting_leads_input"    // Story 17.11: esperando usuario colar leads
  | "confirming_leads";       // Story 17.11: preview dos leads para confirmacao

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

  if (field === "location") {
    return "Em qual localizacao voce quer focar a prospeccao? Ex: Sao Paulo, Brasil, LATAM.";
  }

  if (field === "technology") {
    if (suggestions.length > 0) {
      const sectorContext = briefing.industry
        ? `no setor de ${briefing.industry}`
        : "no setor";
      return `Algumas tecnologias comuns ${sectorContext} seriam: ${suggestions.join(", ")}. Quer filtrar por alguma ou prefere buscar sem filtro de tecnologia?`;
    }

    return "Tecnologia e um filtro opcional. Posso sugerir opcoes se voce informar um setor; se preferir, seguimos sem filtro de tecnologia.";
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

// Story 22.1: Fields that the agent actively asks about (jobTitles + location).
// location is now obligatory to advance; technology/industry/companySize are optional
// context — tracked in missingFields for isComplete accuracy but NOT asked about in guided
// questions (technology only resurfaces via isHelpRequest as a suggestion, never as a demand).
const QUESTIONABLE_FIELDS = ["jobTitles", "location"];

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

function isTechnologyHelpRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return normalized.includes("tecnolog") || normalized.includes(" tech");
}

// Story 22.5: rotulos PT amigaveis para os enums de campanha (nunca exibe o enum cru).
const OBJECTIVE_LABELS: Record<string, string> = {
  COLD_OUTREACH: "Primeiro contato (prospeccao fria)",
  REENGAGEMENT: "Reengajamento",
  FOLLOW_UP: "Follow-up",
  NURTURE: "Nutricao",
};

const URGENCY_LABELS: Record<string, string> = {
  LOW: "Baixa (sem pressa)",
  MEDIUM: "Media",
  HIGH: "Alta (urgente)",
};

function generateBriefingSummary(briefing: ParsedBriefing, missingFields?: string[]): string {
  const lines: string[] = ["Entendi! Vou prospectar com os seguintes parametros:"];

  if (briefing.technology) lines.push(`- Tecnologia: ${briefing.technology}`);
  if (briefing.jobTitles.length > 0) lines.push(`- Cargos: ${briefing.jobTitles.join(", ")}`);
  if (briefing.location) lines.push(`- Localizacao: ${briefing.location}`);
  if (briefing.companySize) lines.push(`- Tamanho: ${briefing.companySize}`);
  if (briefing.industry) lines.push(`- Industria: ${briefing.industry}`);

  // Story 22.5: metadados de campanha, exibidos so quando presentes (rotulo PT, nao o enum).
  if (briefing.objective) lines.push(`- Objetivo: ${OBJECTIVE_LABELS[briefing.objective] ?? briefing.objective}`);
  if (briefing.urgency) lines.push(`- Urgencia: ${URGENCY_LABELS[briefing.urgency] ?? briefing.urgency}`);
  if (briefing.campaignDescription) lines.push(`- Descricao: ${briefing.campaignDescription}`);
  if (briefing.emailCount) lines.push(`- Nº de e-mails: ${briefing.emailCount}`);

  // Story 22.6: busca direta = search_companies pulado SEM leads importados (search_leads roda).
  const isDirectSearch =
    Boolean(briefing.skipSteps?.includes("search_companies")) &&
    !briefing.skipSteps?.includes("search_leads");

  // Notas sobre campos nao informados (Story 17.8 AC: #3)
  if (missingFields && missingFields.length > 0) {
    const fieldNotes: Record<string, string> = {
      technology: "Sem tecnologia especifica — busca por cargo + localizacao.",
      location: "Sem localizacao especifica — busca em todas as regioes.",
      companySize: "Sem filtro de tamanho de empresa.",
    };
    const notes = missingFields
      // Story 22.6: na busca direta, o tamanho recebe uma nota DEDICADA (piso de qualidade)
      // no ramo abaixo — suprime a nota generica "Sem filtro de tamanho de empresa.", que
      // seria contraditoria (na busca direta SEMPRE ha um filtro de tamanho aplicado).
      .filter((f) => !(f === "companySize" && isDirectSearch))
      .map((f) => fieldNotes[f])
      .filter(Boolean);
    if (notes.length > 0) {
      lines.push("");
      for (const note of notes) {
        lines.push(note);
      }
    }
  }

  // Story 17.11: imported leads summary
  if (briefing.skipSteps?.includes("search_companies") &&
      briefing.skipSteps?.includes("search_leads")) {
    const leadCount = briefing.importedLeads?.length ?? 0;
    lines.push(`Etapas de busca de empresas e leads serao puladas — ${leadCount} leads importados serao usados diretamente.`);
  } else if (briefing.skipSteps?.includes("search_companies")) {
    const params = [
      briefing.jobTitles.length > 0 ? briefing.jobTitles.join(", ") : null,
      briefing.industry,
      briefing.location,
    ].filter(Boolean).join(" + ");
    lines.push(`Etapa de busca de empresas sera pulada — leads serao buscados diretamente por ${params || "cargos"}.`);
    // Story 22.6 (AC4): quando o usuario nao informou tamanho, aplica-se um piso de qualidade
    // (exclui micro-empresas). Convite NAO-bloqueante — o usuario pode so confirmar; canProceed intocado.
    // Gate derivado do SSOT (mesma fonte do step e do plano) para nunca divergir do que o Apollo recebe.
    if (resolveDirectSearchCompanySizes(briefing).defaultsApplied) {
      lines.push(`- Tamanho de empresa: ${QUALITY_MIN_COMPANY_SIZE_LABEL} — padrao de qualidade, me diga se quiser mudar.`);
    }
  }

  // Story 22.5 (AC3/D2): pergunta leve NAO-bloqueante sobre objetivo/quantidade. So aparece
  // quando o usuario ainda nao informou objetivo — e um convite opcional no proprio resumo
  // (nao cria estado awaiting_*; o usuario pode simplesmente confirmar e seguimos com os defaults).
  if (!briefing.objective) {
    // So convida a informar a quantidade se o usuario ainda nao informou emailCount
    // (evita pedir "e quantos e-mails" logo abaixo de uma linha "- Nº de e-mails: 3").
    const emailPart = briefing.emailCount ? "" : " e quantos e-mails";
    lines.push(
      `\nSe quiser, me diga o objetivo (primeiro contato, reengajamento, follow-up ou nutricao)${emailPart} — senao sigo com uma sequencia padrao de primeiro contato.`
    );
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

// Review 22.3: compara os campos corrigiveis pelo usuario entre o briefing apresentado
// e o retornado pelo parse. Usado pelo guard hibrido do confirming — se o LLM aplicou
// qualquer correcao, a mensagem NAO e tratada como confirmacao por keyword.
function briefingChanged(prev: ParsedBriefing | null, next: ParsedBriefing): boolean {
  if (!prev) return true;
  return (
    prev.technology !== next.technology ||
    prev.location !== next.location ||
    prev.companySize !== next.companySize ||
    prev.industry !== next.industry ||
    prev.jobTitles.join("|") !== next.jobTitles.join("|") ||
    // Story 22.5 (D5): campos de campanha entram no diff — uma correcao que so os toca
    // ("sim, mas reengajamento com 3 e-mails") deve reapresentar o resumo, nunca ser
    // engolida como confirmacao pelo guard hibrido do estado confirming.
    (prev.objective ?? null) !== (next.objective ?? null) ||
    (prev.urgency ?? null) !== (next.urgency ?? null) ||
    (prev.campaignDescription ?? null) !== (next.campaignDescription ?? null) ||
    (prev.emailCount ?? null) !== (next.emailCount ?? null)
  );
}

function isProductRejection(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return PRODUCT_REJECTION_KEYWORDS.some((kw) => normalized.includes(kw));
}

// ==============================================
// IMPORTED LEADS HELPERS (Story 17.11)
// ==============================================

function isImportedLeadsFlow(briefing: ParsedBriefing): boolean {
  return briefing.skipSteps?.includes("search_companies") === true &&
         briefing.skipSteps?.includes("search_leads") === true;
}

function formatLeadPreview(result: LeadImportResult): string {
  const lines: string[] = [];
  lines.push(`**${result.accepted.length} leads aceitos**${result.rejected.length > 0 ? ` | ${result.rejected.length} rejeitados` : ""}:\n`);

  lines.push("| # | Nome | Cargo | Empresa | Email |");
  lines.push("|---|------|-------|---------|-------|");

  for (let i = 0; i < Math.min(result.accepted.length, 10); i++) {
    const lead = result.accepted[i];
    lines.push(`| ${i + 1} | ${lead.name} | ${lead.title ?? "-"} | ${lead.companyName ?? "-"} | ${lead.email} |`);
  }

  if (result.accepted.length > 10) {
    lines.push(`\n...e mais ${result.accepted.length - 10} leads.`);
  }

  if (result.rejected.length > 0) {
    lines.push(`\n**Rejeitados:**`);
    for (const r of result.rejected.slice(0, 5)) {
      lines.push(`- "${r.line}" — ${r.reason}`);
    }
    if (result.rejected.length > 5) {
      lines.push(`- ...e mais ${result.rejected.length - 5}.`);
    }
  }

  lines.push("\nConfirma esses leads para a campanha?");
  return lines.join("\n");
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

  // Story 22.3: historico ESTRUTURADO da conversa (usuario E agente), substituindo o
  // antigo messageHistoryRef: string[] + join("\n"). Fornece memoria real ao LLM.
  const conversationRef = useRef<ChatTurn[]>([]);

  // Story 22.3: envia uma mensagem do agente E a registra no historico (fecha o loop
  // de memoria — o proximo /parse vera a pergunta/resumo que o agente enviou).
  const sendAndRecord = useCallback(
    async (
      executionId: string,
      content: string,
      sendAgentMessage: (executionId: string, content: string) => Promise<void>
    ): Promise<void> => {
      conversationRef.current.push({ role: "agent", content });
      await sendAgentMessage(executionId, content);
    },
    []
  );

  const callParseAPI = useCallback(
    async (executionId: string): Promise<BriefingParseResponse> => {
      // Story 22.3: envia o historico estruturado; o array ja termina na mensagem
      // atual do usuario (empilhada pelo handler antes de chamar).
      const response = await fetch("/api/agent/briefing/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId, messages: conversationRef.current }),
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
      // Story 17.11 + 22.4: imported leads flow — disparado pela INTENCAO do LLM
      // (nextAction="import_leads") OU pelo sinal deterministico skipSteps
      // (isImportedLeadsFlow, fallback OR — D1). Continua como PRIMEIRO ramo (antes de
      // !canProceed): leads proprios dispensam cargo/localizacao (D2). Independente de
      // canProceed.
      // Review 22.4: quando o gatilho e o nextAction, RECONCILIA skipSteps no cliente
      // (garante ["search_companies","search_leads"] no briefing). A canonicalizacao no route
      // (NFR1) segue intacta; mas o usuario ESTA entrando no fluxo de colar leads, entao a
      // realidade deterministica de "leads importados" passa a valer — e o downstream
      // (create-campaign-step, orchestrator, cost/plan) decide o fluxo por skipSteps, nao por
      // importedLeads. Sem isto, um import_leads sem skipSteps (inconsistencia do LLM)
      // descartaria os leads colados e rodaria busca paga. Idempotente para o fallback
      // deterministico (que ja traz os 2 skipSteps).
      if (result.nextAction === "import_leads" || isImportedLeadsFlow(result.briefing)) {
        const leadsBriefing: ParsedBriefing = {
          ...result.briefing,
          skipSteps: Array.from(
            new Set([
              ...(result.briefing.skipSteps ?? []),
              "search_companies",
              "search_leads",
            ])
          ),
        };
        setState((prev) => ({
          ...prev,
          status: "awaiting_leads_input",
          briefing: leadsBriefing,
          missingFields: result.missingFields,
          isComplete: false,
        }));
        await sendAndRecord(
          executionId,
          "Entendi! Voce ja tem seus proprios leads. Cole a lista abaixo no formato:\n\n" +
          "**Formato aceito** (um lead por linha):\n" +
          "- `email@empresa.com` (minimo)\n" +
          "- `Nome, email@empresa.com`\n" +
          "- `Nome, Cargo, email@empresa.com`\n" +
          "- `Nome, Cargo, Empresa, email@empresa.com`\n\n" +
          "Tambem aceito CSV com header (nome, cargo, empresa, email).\n\n" +
          "Cole seus leads:",
          sendAgentMessage
        );
        return { handled: true };
      }

      // Story 22.3 / D3: o gating deterministico prevalece. canProceed=false ->
      // SEMPRE pergunta (o LLM nao pode "prosseguir" sem cargo + localizacao — NFR1).
      if (!result.canProceed) {
        setState((prev) => ({
          ...prev,
          status: "awaiting_fields",
          briefing: result.briefing,
          missingFields: result.missingFields,
          isComplete: result.isComplete,
        }));
        // AC2/D1: no ramo "ask", usa o questionText natural do LLM quando presente;
        // senao, cai no smart-question deterministico (fail-open). Review 22.3: o
        // questionText so e confiado quando nextAction === "ask" E nao-vazio — um
        // texto de confirmacao fora de hora (tom errado com gating aberto) ou uma
        // string vazia (que poluiria o historico e invalidaria o proximo /parse,
        // content min(1)) caem no deterministico.
        const llmQuestion =
          result.nextAction === "ask" ? (result.questionText ?? "").trim() : "";
        const question =
          llmQuestion !== ""
            ? llmQuestion
            : generateSmartQuestions(result.missingFields, result.suggestions, result.briefing);
        await sendAndRecord(executionId, question, sendAgentMessage);
        return { handled: true };
      }

      // canProceed=true — Story 22.4: pedido EXPLICITO de cadastro via nextAction.
      // Quando o LLM classifica a intencao como "register_product" e o produto NAO existe
      // na base (productSlug===null), vai DIRETO para awaiting_product_details (pula a
      // oferta sim/nao). D4 (reconciliacao KB prevalece, NFR1): se productSlug!==null o
      // produto ja existe — IGNORA register_product para nao cadastrar duplicado, seguindo
      // o fluxo normal (resumo). D2: so alcancavel com canProceed=true (gate acima).
      if (result.nextAction === "register_product" && result.briefing.productSlug === null) {
        setState((prev) => ({
          ...prev,
          status: "awaiting_product_details",
          briefing: result.briefing,
          missingFields: result.missingFields,
          isComplete: result.isComplete,
          // Guarda o nome do produto (usado por callParseProductAPI). Usa o do parse
          // quando presente; senao preserva o atual (pedido explicito pode nao repetir o nome).
          productMentioned: result.productMentioned ?? prev.productMentioned,
        }));
        await sendAndRecord(
          executionId,
          "Otimo! Me descreva o produto em linguagem natural. Pode incluir o que ele faz, funcionalidades, diferenciais e para quem e voltado.",
          sendAgentMessage
        );
        return { handled: true };
      }

      // canProceed=true — Story 16.6: produto mencionado mas nao encontrado.
      // Trigger inalterado (productMentioned/productSlug), so acessivel com canProceed.
      // 22.4/D1: a OFERTA continua entrando pelo sinal productMentioned (fallback deste
      // ramo); a DECISAO subsequente (awaiting_product_decision) passa a consultar o LLM.
      if (result.productMentioned && result.briefing.productSlug === null) {
        setState((prev) => ({
          ...prev,
          status: "awaiting_product_decision",
          briefing: result.briefing,
          missingFields: result.missingFields,
          isComplete: result.isComplete,
          productMentioned: result.productMentioned,
        }));
        await sendAndRecord(
          executionId,
          `Nao encontrei o produto '${result.productMentioned}' na base de conhecimento. Quer cadastrar agora? Vou precisar de: nome, descricao, features, diferenciais e publico-alvo.`,
          sendAgentMessage
        );
        return { handled: true };
      }

      // canProceed=true — apresenta/reapresenta o resumo. D1: no ramo "confirm" usamos
      // SEMPRE o generateBriefingSummary deterministico (transparencia: o usuario ve os
      // parametros exatos antes de executar), nao o questionText do LLM.
      setState((prev) => ({
        ...prev,
        status: "confirming",
        briefing: result.briefing,
        missingFields: result.missingFields,
        isComplete: result.isComplete,
      }));
      await sendAndRecord(
        executionId,
        generateBriefingSummary(result.briefing, result.missingFields),
        sendAgentMessage
      );

      return { handled: true };
    },
    [sendAndRecord]
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
      // Story 22.4: a DECISAO "quer cadastrar? sim/nao" passa a ser interpretada pelo LLM
      // (nextAction) em vez de casar keywords locais — o usuario aceita/recusa em linguagem
      // livre ("pode cadastrar sim", "nao precisa, segue"). As keywords
      // (isConfirmation/isProductRejection) permanecem SO como rede de seguranca no catch
      // (fail-open, AC5). Aposenta PRODUCT_REJECTION_KEYWORDS do caminho principal.
      if (currentStatus === "awaiting_product_decision") {
        conversationRef.current.push({ role: "user", content });
        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(executionId);

          // register_product = usuario afirma o cadastro -> vai para os detalhes.
          if (result.nextAction === "register_product") {
            setState((prev) => ({ ...prev, status: "awaiting_product_details" }));
            await sendAndRecord(
              executionId,
              "Otimo! Me descreva o produto em linguagem natural. Pode incluir o que ele faz, funcionalidades, diferenciais e para quem e voltado.",
              sendAgentMessage
            );
            return { handled: true };
          }

          // Qualquer outro nextAction = seguir SEM produto: limpa productMentioned e
          // reapresenta o resumo. NAO chamamos handleParseResult aqui: ele re-detectaria
          // productMentioned e voltaria a oferecer o cadastro (loop). Limpar productMentioned
          // e o mesmo comportamento que a 16.6 fazia na rejeicao.
          // Review 22.4: persiste result.briefing/missingFields (nao o state.briefing antigo)
          // e resume a partir dele — assim uma correcao embutida na recusa ("nao precisa do
          // produto, mas troca pra CFO") e aplicada em vez de silenciosamente perdida.
          setState((prev) => ({
            ...prev,
            status: "confirming",
            productMentioned: null,
            briefing: result.briefing,
            missingFields: result.missingFields,
            isComplete: result.isComplete,
          }));
          await sendAndRecord(
            executionId,
            generateBriefingSummary(result.briefing, result.missingFields),
            sendAgentMessage
          );
          return { handled: true };
        } catch {
          // Fail-open (AC5): LLM falhou/timeout -> keyword como rede de seguranca sobre a
          // mensagem crua (mesmo desempate do fluxo original: ambos ou nenhum = ambiguo).
          const confirmed = isConfirmation(content);
          const rejected = isProductRejection(content);

          if (confirmed && !rejected) {
            setState((prev) => ({ ...prev, status: "awaiting_product_details" }));
            await sendAndRecord(
              executionId,
              "Otimo! Me descreva o produto em linguagem natural. Pode incluir o que ele faz, funcionalidades, diferenciais e para quem e voltado.",
              sendAgentMessage
            );
            return { handled: true };
          }

          if (rejected && !confirmed) {
            setState((prev) => ({ ...prev, status: "confirming", productMentioned: null }));
            if (state.briefing) {
              // Review 22.4: passa missingFields para as notas de campos opcionais
              // aparecerem, consistente com os demais resumos reapresentados.
              await sendAndRecord(
                executionId,
                generateBriefingSummary(state.briefing, state.missingFields),
                sendAgentMessage
              );
            }
            return { handled: true };
          }

          // Ambiguo (ambos ou nenhum) — reapresenta a oferta.
          setState((prev) => ({ ...prev, status: "awaiting_product_decision" }));
          await sendAndRecord(
            executionId,
            `Quer cadastrar o produto '${state.productMentioned ?? ""}' agora? Responda 'sim' para cadastrar ou 'nao' para continuar sem produto.`,
            sendAgentMessage
          );
          return { handled: true };
        }
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

      // === IMPORTED LEADS FLOW HANDLERS (Story 17.11) ===

      // Handler: awaiting_leads_input (AC: #1, #2)
      if (currentStatus === "awaiting_leads_input") {
        const result = parseLeadInput(content);

        if (result.accepted.length === 0) {
          await sendAgentMessage(
            executionId,
            `Nenhum lead valido encontrado. ${result.rejected.length > 0
              ? `${result.rejected.length} rejeitados:\n${result.rejected.map(r => `- "${r.line}" — ${r.reason}`).join("\n")}`
              : "Cole ao menos um email valido."}`
          );
          return { handled: true };
        }

        if (!state.briefing) return { handled: true };
        const updatedBriefing = { ...state.briefing, importedLeads: result.accepted };
        setState((prev) => ({
          ...prev,
          status: "confirming_leads",
          briefing: updatedBriefing,
        }));

        const preview = formatLeadPreview(result);
        await sendAgentMessage(executionId, preview);
        return { handled: true };
      }

      // Handler: confirming_leads (AC: #2)
      if (currentStatus === "confirming_leads") {
        if (isConfirmation(content)) {
          setState((prev) => ({
            ...prev,
            status: "confirming",
          }));
          if (state.briefing) {
            await sendAgentMessage(
              executionId,
              generateBriefingSummary(state.briefing, state.missingFields)
            );
          }
          return { handled: true };
        }

        // User wants to redo leads
        setState((prev) => ({ ...prev, status: "awaiting_leads_input" }));
        await sendAgentMessage(
          executionId,
          "Ok, cole a lista de leads novamente:"
        );
        return { handled: true };
      }

      // === ORIGINAL FLOW HANDLERS ===

      // Confirming state — Story 22.3: a DECISAO de confirmar vs. corrigir move para o
      // LLM (via nextAction), com keyword como rede de seguranca (fail-open, AC4).
      if (currentStatus === "confirming") {
        conversationRef.current.push({ role: "user", content });
        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(executionId);

          // D2: "proceed" (diante de um resumo ja apresentado) = confirmacao final.
          // canProceed prevalece (NFR1): so confirma se os campos obrigatorios existem.
          // Guard hibrido (review 22.3): keyword de confirmacao tambem confirma no
          // caminho de SUCESSO quando o LLM nao aplicou correcao alguma (briefing
          // identico ao apresentado) — evita que um "sim" classificado como
          // confirm/ask pelo LLM entre em loop reapresentando o resumo. Se houve
          // correcao ("sim, mas troca pra CFO"), briefingChanged=true e o fluxo
          // segue para a reapresentacao (AC3 preservado).
          const keywordConfirmed =
            isConfirmation(content) && !briefingChanged(state.briefing, result.briefing);
          if ((result.nextAction === "proceed" || keywordConfirmed) && result.canProceed) {
            setState((prev) => ({
              ...prev,
              status: "confirmed",
              briefing: result.briefing,
              missingFields: result.missingFields,
              isComplete: result.isComplete,
            }));
            return { handled: true, confirmed: true };
          }

          // "confirm"/"ask" (correcao ou ajuste) = ainda conversando: aplica o briefing
          // corrigido e reapresenta o resumo (handleParseResult decide o estado).
          return handleParseResult(result, executionId, sendAgentMessage);
        } catch {
          // Fail-open (AC4): LLM falhou/timeout -> keyword deterministica sobre a
          // mensagem crua. "sim"/"ok"/"bora" ainda confirmam; senao, mantem confirming.
          if (isConfirmation(content)) {
            setState((prev) => ({ ...prev, status: "confirmed" }));
            return { handled: true, confirmed: true };
          }
          setState((prev) => ({ ...prev, status: "confirming" }));
          return { handled: false };
        }
      }

      // Awaiting fields — check for help request or re-parse with accumulated context
      if (currentStatus === "awaiting_fields") {
        // Story 17.8 AC: #2 — detect help keywords and respond with suggestions
        // Story 22.7 (D5): este fast-path de ajuda e CLIENT-SIDE sincrono e NAO tem
        // acesso a Supabase/tenant, entao permanece ESTATICO de proposito. A melhoria
        // KB-first (sugestoes derivadas do ICP) vale para o caminho principal server
        // (parse/route.ts -> resolveContextualSuggestions); tornar o service async
        // aqui quebraria o import client e o generateSmartQuestion(s) sincrono (Trap #3).
        if (isHelpRequest(content) && state.briefing) {
          const suggestions = BriefingSuggestionService.generateSuggestions(state.briefing);

          if (
            isTechnologyHelpRequest(content) &&
            state.missingFields.includes("technology")
          ) {
            const technologyHelp = generateSmartQuestion(
              "technology",
              suggestions.technology ?? [],
              state.briefing
            );
            // Review 22.3: o fast-path de ajuda tambem entra na memoria — o proximo
            // /parse precisa ver a lista sugerida para resolver "a primeira" etc.
            conversationRef.current.push({ role: "user", content });
            await sendAndRecord(executionId, technologyHelp, sendAgentMessage);
            return { handled: true };
          }

          const helpResponse = generateSmartQuestions(
            state.missingFields,
            suggestions,
            state.briefing
          );
          if (helpResponse) {
            // Review 22.3: idem — ajuda generica registrada no historico.
            conversationRef.current.push({ role: "user", content });
            await sendAndRecord(executionId, helpResponse, sendAgentMessage);
            return { handled: true };
          }
        }

        // Story 22.3: re-parse com historico estruturado (nao mais join("\n")).
        conversationRef.current.push({ role: "user", content });

        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(executionId);
          return handleParseResult(result, executionId, sendAgentMessage);
        } catch {
          setState((prev) => ({ ...prev, status: "awaiting_fields" }));
          return { handled: false };
        }
      }

      // Idle or first message — initial parse
      if (currentStatus === "idle") {
        // Story 22.3: primeira mensagem inicia o historico estruturado.
        conversationRef.current = [{ role: "user", content }];

        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseAPI(executionId);
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
          conversationRef.current = [];
          return { handled: false };
        }
      }

      // Confirmed or parsing — don't handle
      return { handled: false };
    },
    [state.status, state.briefing, state.missingFields, state.productMentioned, state.pendingProduct, callParseAPI, callParseProductAPI, handleParseResult, sendAndRecord]
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
    conversationRef.current = [];
  }, []);

  return { state, processMessage, reset };
}
