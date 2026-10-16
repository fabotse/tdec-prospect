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
  | "awaiting_product_name"     // Story 24.4: cadastro sem nome -> pergunta o nome uma vez
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

// Story 22.13 (review): exportado para o ajuste pos-rejeicao montar um matcher MAIS
// ESTRITO sobre a MESMA lista (palavra inteira + sem negacao/pergunta/verbo de ajuste).
// A lista continua sendo a unica fonte — o que muda e o rigor de quem consome.
export const CONFIRMATION_KEYWORDS = [
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
  // Story 22.15: destino dos leads em "Meus Leads". Exibido SEMPRE, espelhando o resumo
  // de ajuste (buildAdjustmentSummary): esta e a PRIMEIRA confirmacao — a que autoriza o
  // gasto — e era justamente ela que omitia para onde os leads iam no caso default.
  lines.push(`- Segmento: ${briefing.segmentName ?? "nome da campanha"}`);

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
  return `Cadastrei o ${product.name} com os seguintes dados:\n- Descricao: ${product.description}\n- Features: ${product.features || "nao informado"}\n- Diferenciais: ${product.differentials || "nao informado"}\n- Publico-alvo: ${product.targetAudience || "nao informado"}\n\nEsta correto? ${PRODUCT_EXIT_HINT}`;
}

/**
 * SSOT deterministico da confirmacao textual.
 *
 * Story 22.13: exportado (era privado) para que o ajuste pos-rejeicao decida a
 * RE-EXECUCAO — que gasta credito — pela MESMA regra do fluxo de briefing, sem
 * duplicar keywords nem delegar a decisao ao LLM. Funcao PURA.
 */
export function isConfirmation(message: string): boolean {
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
    (prev.emailCount ?? null) !== (next.emailCount ?? null) ||
    // Story 22.15: idem para o segmento — "sim, mas coloca no segmento Teste Atibaia"
    // e uma CORRECAO, nao uma confirmacao: tem que reapresentar o resumo.
    (prev.segmentName ?? null) !== (next.segmentName ?? null) ||
    // Story 22.11 (patch review): skipSteps entra no diff. Sem isto, um turno que injeta o
    // shape de import (search_companies+search_leads) SEM mudar outro campo passa como
    // "briefing inalterado" e um "sim" o confirma direto (keywordConfirmed), pulando o guard
    // deterministico do ramo de leads. Comparado como conjunto ordenado (semantica de set).
    [...(prev.skipSteps ?? [])].sort().join("|") !==
      [...(next.skipSteps ?? [])].sort().join("|")
  );
}

function isProductRejection(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return PRODUCT_REJECTION_KEYWORDS.some((kw) => normalized.includes(kw));
}

// ==============================================
// STORY 24.4 — SAIDAS EXPLICITAS DOS RAMOS
// ==============================================

// Toda resposta do ramo de produto cita a saida; toda resposta do ramo de leads tambem.
const PRODUCT_EXIT_HINT = 'Se preferir, responda "seguir sem produto".';
const LEADS_EXIT_HINT = 'Se preferir que eu busque os leads, responda "buscar leads".';

const PRODUCT_DESCRIBE_REQUEST =
  "Otimo! Me descreva o produto em linguagem natural. Pode incluir o que ele faz, funcionalidades, diferenciais e para quem e voltado. " +
  PRODUCT_EXIT_HINT;

const PRODUCT_NAME_REQUEST =
  "Qual e o nome do produto que voce quer cadastrar? " + PRODUCT_EXIT_HINT;

const LEADS_PASTE_INSTRUCTIONS =
  "**Formato aceito** (um lead por linha):\n" +
  "- `email@empresa.com` (minimo)\n" +
  "- `Nome, email@empresa.com`\n" +
  "- `Nome, Cargo, email@empresa.com`\n" +
  "- `Nome, Cargo, Empresa, email@empresa.com`\n\n" +
  "Tambem aceito CSV com header (nome, cargo, empresa, email).";

// Expressoes EXPLICITAS de "seguir sem produto", ja normalizadas (sem acento). Valem em
// qualquer ponto da mensagem.
const PRODUCT_SKIP_EXPLICIT: readonly string[] = [
  "sem produto",
  "seguir sem",
  "segue sem",
  "continuar sem",
];

// Palavras de skip ambiguas ("o cliente nao precisa instalar", "depois de integrado..."):
// so valem quando a mensagem inteira e curta. Casadas como palavra inteira para nao pegar
// substrings ("pula" em "populacao").
const PRODUCT_SKIP_SHORT_ONLY: readonly string[] = [
  "pular",
  "pula",
  "skip",
  "depois",
  "nao precisa",
  "nao quero",
];

const SEARCH_PREFERENCE_KEYWORDS: readonly string[] = [
  "buscar",
  "busca",
  "procurar",
  "pesquisar",
  "nao tenho",
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholePhrase(normalized: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase)}($|[^a-z0-9])`).test(normalized);
}

function normalizeAnswer(text: string): string {
  return normalizeForSignal(text).trim();
}

const SHORT_SKIP_MAX_WORDS = 3;

/**
 * Story 24.4: o usuario quer sair do ramo de produto. Expressao explicita ("seguir sem
 * produto") vale em qualquer mensagem; palavra ambigua ("pular", "depois", "nao precisa")
 * so numa mensagem curta (ate 3 palavras) — numa descricao ou confirmacao ela e conteudo.
 * Com `allowBareNo` (pergunta "qual o nome?"), resposta que COMECA com "nao" ("nao",
 * "nao sei", "nao tem nome ainda") tambem e saida.
 */
export function isProductSkip(message: string, allowBareNo = false): boolean {
  const normalized = normalizeAnswer(message);
  if (!normalized) return false;
  if (allowBareNo && /^nao\b/.test(normalized)) return true;
  if (PRODUCT_SKIP_EXPLICIT.some((kw) => containsWholePhrase(normalized, kw))) return true;
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length > SHORT_SKIP_MAX_WORDS) return false;
  return PRODUCT_SKIP_SHORT_ONLY.some((kw) => containsWholePhrase(normalized, kw));
}

/** Story 24.4: extrai o nome do produto da resposta ("O nome e Radar Pro" -> "Radar Pro"). */
export function extractProductName(message: string): string {
  let name = message.trim();
  name = name.replace(
    /^(?:o\s+)?(?:nome(?:\s+do\s+produto)?\s+(?:eh|é|e)|nome(?:\s+do\s+produto)?(?=\s*:)|produto\s+(?:eh|é|e|se\s+chama)|se\s+chama|chama-se|chama)(?:\s*:\s*|\s+)/i,
    ""
  );
  name = name.replace(/^["'`]+|["'`.!]+$/g, "").trim();
  return name.slice(0, 100).trim();
}

/** Story 24.4: fallback por palavra-chave quando o /parse falha no ramo de leads. */
export function isSearchPreference(message: string): boolean {
  const normalized = normalizeAnswer(message);
  return SEARCH_PREFERENCE_KEYWORDS.some((kw) => containsWholePhrase(normalized, kw));
}

const MEMORY_CONTENT_LIMIT = 2000;

/** Story 24.4: turno de colagem grande entra truncado na memoria do LLM. */
export function toMemoryContent(content: string): string {
  if (content.length <= MEMORY_CONTENT_LIMIT) return content;
  return `${content.slice(0, MEMORY_CONTENT_LIMIT)}\n[...lista truncada]`;
}

/** Story 24.4: e-mail ou 2+ linhas nao vazias = tentativa de colar leads (nao conversa). */
export function looksLikeLeadPaste(content: string): boolean {
  if (EMAIL_SIGNAL_REGEX.test(content)) return true;
  return content.split(/\r?\n/).filter((line) => line.trim() !== "").length >= 2;
}

/**
 * Story 24.4: o /parse so resolve `productSlug` quando o LLM devolve `productMentioned`
 * NAQUELE turno. Numa correcao ("troca pra CFO") o produto ja cadastrado se perdia. Se o
 * parse nao citou outro produto, preserva o slug atual.
 */
function carryProductSlug(
  result: BriefingParseResponse,
  current: ParsedBriefing | null
): BriefingParseResponse {
  if (
    result.briefing.productSlug == null &&
    result.productMentioned == null &&
    current?.productSlug
  ) {
    return { ...result, briefing: { ...result.briefing, productSlug: current.productSlug } };
  }
  return result;
}

/** Story 24.4: garante cargo/localizacao em missingFields quando ausentes no briefing. */
function withRequiredMissing(briefing: ParsedBriefing, missingFields: string[]): string[] {
  const missing = new Set(missingFields);
  if (!briefing.jobTitles?.length) missing.add("jobTitles");
  if (!briefing.location) missing.add("location");
  return Array.from(missing);
}

// ==============================================
// IMPORTED LEADS HELPERS (Story 17.11)
// ==============================================

function isImportedLeadsFlow(briefing: ParsedBriefing): boolean {
  return briefing.skipSteps?.includes("search_companies") === true &&
         briefing.skipSteps?.includes("search_leads") === true;
}

// Story 22.11 (Frente A): normaliza texto para casar keywords case/acento-insensitive.
// Espelha o padrao dos helpers de keyword do hook (toLowerCase) e vai alem: remove
// diacriticos (NFD) e hifens ("e-mails" -> "emails"), tornando o match robusto a como
// o usuario digita.
function normalizeForSignal(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacriticos combinantes (acentos)
    .replace(/-/g, ""); // "e-mails" -> "emails"
}

// Story 22.11 (Frente A): ancoras de "leads proprios" na MENSAGEM CRUA do usuario.
// Espelham os exemplos do SYSTEM_PROMPT do parser (briefing-parser-service.ts) que
// mandam emitir import_leads. Ja NORMALIZADAS (sem acento, sem hifen) para casar com
// normalizeForSignal. includes() de substring: uma ancora curta ("minha lista") cobre
// variantes ("tenho minha lista", "minha lista de e-mails").
const OWN_LEADS_KEYWORDS: readonly string[] = [
  "minha lista",
  "minha planilha",
  "planilha de leads",
  "planilha de contatos",
  "importar meus leads",
  "importar meus contatos",
  "meus proprios leads",
  "leads proprios",
  "meus leads",
  "meus contatos",
  "minha base de emails",
  "minha base de leads",
  "minha base de contatos",
  "ja tenho os contatos",
  "ja tenho os leads",
  "ja tenho meus contatos",
  "ja tenho meus leads",
  "csv com contatos",
  "csv com leads",
];

// Story 22.11 (Frente A, AC1/AC3): SSOT do sinal deterministico de "o usuario tem leads
// proprios". O sub-fluxo caro de import_leads (abandona a busca) so entra quando a
// MENSAGEM CRUA do usuario traz (a) conteudo de e-mail OU (b) uma keyword-ancora — nunca
// so na palavra (alucinavel) do LLM. Fail-safe (AC5): na duvida retorna false (segue a
// conversa em vez de sequestra-la). Helper PURO e exportado para teste.
const EMAIL_SIGNAL_REGEX = /\S+@\S+\.\S+/;

export function messageSignalsOwnLeads(content: string): boolean {
  if (!content) return false;
  if (EMAIL_SIGNAL_REGEX.test(content)) return true;
  const normalized = normalizeForSignal(content);
  return OWN_LEADS_KEYWORDS.some((kw) => normalized.includes(kw));
}

// Story 22.11 (Frente A, AC1 — patch review): quando o guard barra um import_leads SEM ancora
// deterministica e SEM leads reais, o import ALUCINADO do LLM precisa ser realmente IGNORADO
// (nao so o ramo). Este helper reconcilia o briefing para um fluxo NAO-import: remove o
// marcador de import (search_leads) e re-deriva search_companies pela MESMA regra
// deterministica do route (parse/route.ts): sem tecnologia => busca direta (search_companies
// pulado); com tecnologia => search_companies roda. Sem isto, o skipSteps envenenado
// sobreviveria no briefing re-apresentado ("0 leads importados serao usados diretamente") e o
// "sim" seguinte confirmaria uma execucao que quebra (create-campaign-step: leads vazios).
function reconcileNonImportBriefing(briefing: ParsedBriefing): ParsedBriefing {
  const withoutImportSteps = (briefing.skipSteps ?? []).filter(
    (step) => step !== "search_leads" && step !== "search_companies"
  );
  const skipSteps = briefing.technology
    ? withoutImportSteps
    : [...withoutImportSteps, "search_companies"];
  return { ...briefing, skipSteps };
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
  /**
   * Story 24.4: reabre o briefing apos "Cancelar" no plano (`confirming` com briefing,
   * `idle` sem). Nao toca a memoria conversacional.
   */
  reopenBriefing: () => void;
  /**
   * Story 22.13 (seam): parseia uma mensagem de AJUSTE pos-rejeicao reusando a
   * memoria conversacional da 22.3 — empilha o turno do usuario em conversationRef
   * e chama o MESMO callParseAPI do fluxo de briefing. NAO toca o estado do hook
   * (o briefing pos-confirmacao vive no servidor; quem aplica o resultado e o
   * chamador, sob a regra de merge da 22.13).
   */
  parseAdjustment: (content: string, executionId: string) => Promise<BriefingParseResponse>;
  /**
   * Story 22.13 (seam): registra um turno do AGENTE na memoria conversacional.
   * Sem isto o turno seguinte ("na verdade troca o cargo pra CFO") seria parseado
   * sem contexto e o parser esqueceria os campos ja preenchidos (Trap da 22.3).
   */
  recordAgentTurn: (content: string) => void;
  /**
   * Story 22.13 (review): registra um turno do USUARIO na memoria sem parsear.
   * Usado no ramo de confirmacao, que decide sem LLM mas ainda precisa manter o
   * transcript coerente para o proximo `/parse`.
   */
  recordUserTurn: (content: string) => void;
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

  // Story 24.4: contadores do ramo de produto (client-only, nunca persistidos). O nome e
  // pedido no maximo uma vez e a extracao falha no maximo uma vez antes de sair sem produto.
  const productFlowRef = useRef<{ nameAsked: boolean; detailFailures: number }>({
    nameAsked: false,
    detailFailures: 0,
  });

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
      sendAgentMessage: (executionId: string, content: string) => Promise<void>,
      // Story 22.11 (AC2): mensagem CRUA do turno atual. Necessaria para o guard
      // deterministico do ramo de leads (messageSignalsOwnLeads). Todos os call sites
      // passam o `content` do turno.
      userMessage: string,
      // Story 22.11 (D1 — patch review): briefing ATUAL do estado. Usado para preservar
      // `importedLeads` (client-only, o parser nunca os devolve) numa correcao dentro de um
      // import ja em andamento. Todos os call sites passam `state.briefing`.
      currentBriefing: ParsedBriefing | null,
      // Story 24.4: nome de produto ja conhecido (pedido explicito de cadastro pode nao
      // repetir o nome). Sem nome, o cadastro pergunta o nome em vez de chamar o
      // /parse-product com productName "" (400 -> loop).
      currentProductMentioned: string | null = null
    ): Promise<{ handled: boolean }> => {
      // Story 24.4: correcao apos cadastro nao perde o produto (o /parse so resolve o
      // slug quando o LLM cita o produto naquele turno).
      result = carryProductSlug(result, currentBriefing);

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
      //
      // Story 22.11 (Frente A, AC1/AC5): o gatilho do LLM (nextAction/skipSteps) vira sinal
      // CONTRIBUINTE, nao suficiente sozinho. O ramo caro so entra se a MENSAGEM CRUA tiver
      // um sinal deterministico de leads proprios (e-mail ou keyword-ancora). Sem esse sinal,
      // ignoramos o import_leads (alucinavel) e seguimos para os ramos seguintes — a conversa
      // normal (re-apresenta o resumo / pergunta o que falta). Fail-safe: na duvida NAO
      // sequestra a conversa. Um ajuste de filtro ("aumentar o tamanho da empresa") nunca tem
      // e-mail nem keyword -> nunca dispara import_leads, independente do que o modelo emita.
      if (
        (result.nextAction === "import_leads" || isImportedLeadsFlow(result.briefing)) &&
        messageSignalsOwnLeads(userMessage)
      ) {
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
          LEADS_PASTE_INSTRUCTIONS +
          "\n\nCole seus leads. " +
          LEADS_EXIT_HINT,
          sendAgentMessage
        );
        return { handled: true };
      }

      // Story 22.11 (Frente A, AC1/D1 — patch review): o LLM sinalizou import_leads (ou o
      // briefing chegou com o skipSteps de import), mas a MENSAGEM CRUA nao tem ancora
      // deterministica -> o ramo de colar leads foi barrado acima. Dois desfechos:
      if (result.nextAction === "import_leads" || isImportedLeadsFlow(result.briefing)) {
        // D1 (decisao Fabossi 2026-07-24 na review): ja ha leads colados num turno anterior
        // (importedLeads no briefing atual) -> isto e uma CORRECAO dentro de um import em
        // andamento, nao uma entrada nova. Preserva os leads + o fluxo de import (o parser
        // nunca devolve importedLeads — e estado client-only) e aplica a correcao de campo.
        if (currentBriefing?.importedLeads && currentBriefing.importedLeads.length > 0) {
          const preservedBriefing: ParsedBriefing = {
            ...result.briefing,
            importedLeads: currentBriefing.importedLeads,
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
            status: "confirming",
            briefing: preservedBriefing,
            missingFields: result.missingFields,
            isComplete: result.isComplete,
          }));
          await sendAndRecord(
            executionId,
            generateBriefingSummary(preservedBriefing, result.missingFields),
            sendAgentMessage
          );
          return { handled: true };
        }

        // AC1: sem leads reais, o import_leads/skipSteps ALUCINADO e realmente IGNORADO.
        // Reconcilia o briefing para nao-import e RECOMPUTA o gate (o import ja nao vale como
        // criterio de canProceed). Sem isto, o skipSteps envenenado sobreviveria no resumo
        // ("0 leads importados...") e o "sim" seguinte quebraria a execucao. Segue para os
        // ramos normais abaixo com o briefing ja saneado.
        const reconciledBriefing = reconcileNonImportBriefing(result.briefing);
        result = {
          ...result,
          briefing: reconciledBriefing,
          canProceed: Boolean(
            reconciledBriefing.jobTitles?.length && reconciledBriefing.location
          ),
        };
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
        // Guarda o nome do produto (usado por callParseProductAPI). Usa o do parse
        // quando presente; senao preserva o atual (pedido explicito pode nao repetir o nome).
        const productName = result.productMentioned ?? currentProductMentioned;
        // Story 24.4: entrada no ramo de produto zera o contador de pedidos/falhas.
        productFlowRef.current = { nameAsked: !productName, detailFailures: 0 };
        setState((prev) => ({
          ...prev,
          status: productName ? "awaiting_product_details" : "awaiting_product_name",
          briefing: result.briefing,
          missingFields: result.missingFields,
          isComplete: result.isComplete,
          productMentioned: productName,
          pendingProduct: null,
        }));
        await sendAndRecord(
          executionId,
          productName ? PRODUCT_DESCRIBE_REQUEST : PRODUCT_NAME_REQUEST,
          sendAgentMessage
        );
        return { handled: true };
      }

      // canProceed=true — Story 16.6: produto mencionado mas nao encontrado.
      // Trigger inalterado (productMentioned/productSlug), so acessivel com canProceed.
      // 22.4/D1: a OFERTA continua entrando pelo sinal productMentioned (fallback deste
      // ramo); a DECISAO subsequente (awaiting_product_decision) passa a consultar o LLM.
      if (result.productMentioned && result.briefing.productSlug === null) {
        productFlowRef.current = { nameAsked: false, detailFailures: 0 };
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
          `Nao encontrei o produto '${result.productMentioned}' na base de conhecimento. Quer cadastrar agora? Vou precisar de: nome, descricao, features, diferenciais e publico-alvo. ${PRODUCT_EXIT_HINT}`,
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

      // Story 24.4: saida UNICA do ramo de produto — volta a `confirming` com o resumo.
      // Zera os contadores do ramo, `productMentioned` e `pendingProduct`.
      const exitProductFlow = async (
        prefix: string,
        briefingOverride?: ParsedBriefing
      ): Promise<{ handled: boolean }> => {
        productFlowRef.current = { nameAsked: false, detailFailures: 0 };
        const briefing = briefingOverride ?? state.briefing;
        if (!briefing) {
          // Sem briefing nao ha resumo a mostrar: volta a coleta dos campos (a memoria
          // conversacional segue intacta para o proximo /parse).
          setState((prev) => ({
            ...prev,
            status: "awaiting_fields",
            productMentioned: null,
            pendingProduct: null,
          }));
          await sendAndRecord(
            executionId,
            `${prefix} Me diga quais cargos e qual localizacao voce quer prospectar.`.trim(),
            sendAgentMessage
          );
          return { handled: true };
        }
        setState((prev) => ({
          ...prev,
          status: "confirming",
          briefing,
          productMentioned: null,
          pendingProduct: null,
        }));
        const summary = generateBriefingSummary(briefing, state.missingFields);
        await sendAndRecord(
          executionId,
          prefix ? `${prefix} ${summary}` : summary,
          sendAgentMessage
        );
        return { handled: true };
      };

      const askProductName = async (prefix: string): Promise<{ handled: boolean }> => {
        productFlowRef.current = { ...productFlowRef.current, nameAsked: true };
        setState((prev) => ({
          ...prev,
          status: "awaiting_product_name",
          productMentioned: null,
          pendingProduct: null,
        }));
        await sendAndRecord(
          executionId,
          prefix ? `${prefix} ${PRODUCT_NAME_REQUEST}` : PRODUCT_NAME_REQUEST,
          sendAgentMessage
        );
        return { handled: true };
      };

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

        // Story 24.4: aceitar o cadastro sem nome conhecido pergunta o nome (nunca chama
        // o /parse-product com productName "").
        const enterProductDetails = async (): Promise<{ handled: boolean }> => {
          productFlowRef.current = { nameAsked: false, detailFailures: 0 };
          if (!state.productMentioned) return askProductName("");
          setState((prev) => ({ ...prev, status: "awaiting_product_details" }));
          await sendAndRecord(executionId, PRODUCT_DESCRIBE_REQUEST, sendAgentMessage);
          return { handled: true };
        };

        try {
          const result = carryProductSlug(await callParseAPI(executionId), state.briefing);

          // register_product = usuario afirma o cadastro -> vai para os detalhes.
          if (result.nextAction === "register_product") {
            return enterProductDetails();
          }

          // Qualquer outro nextAction = seguir SEM produto: limpa productMentioned e
          // reapresenta o resumo. NAO chamamos handleParseResult aqui: ele re-detectaria
          // productMentioned e voltaria a oferecer o cadastro (loop). Limpar productMentioned
          // e o mesmo comportamento que a 16.6 fazia na rejeicao.
          // Review 22.4: persiste result.briefing/missingFields (nao o state.briefing antigo)
          // e resume a partir dele — assim uma correcao embutida na recusa ("nao precisa do
          // produto, mas troca pra CFO") e aplicada em vez de silenciosamente perdida.
          productFlowRef.current = { nameAsked: false, detailFailures: 0 };
          setState((prev) => ({
            ...prev,
            status: "confirming",
            productMentioned: null,
            pendingProduct: null,
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
            return enterProductDetails();
          }

          if (rejected && !confirmed) {
            return exitProductFlow("");
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

      // Handler: awaiting_product_name (Story 24.4) — o nome e pedido UMA vez.
      if (currentStatus === "awaiting_product_name") {
        conversationRef.current.push({ role: "user", content });

        // Aqui "nao" responde "qual o nome?" -> tambem e saida.
        if (isProductSkip(content, true)) {
          return exitProductFlow("Sem problema, seguimos sem produto.");
        }

        const productName = extractProductName(content);
        if (!productName) {
          return exitProductFlow("Nao entendi o nome do produto, entao seguimos sem produto por enquanto.");
        }

        setState((prev) => ({
          ...prev,
          status: "awaiting_product_details",
          productMentioned: productName,
          pendingProduct: null,
        }));
        await sendAndRecord(
          executionId,
          `Anotado: "${productName}". ${PRODUCT_DESCRIBE_REQUEST}`,
          sendAgentMessage
        );
        return { handled: true };
      }

      // Handler: awaiting_product_details (AC: #2)
      if (currentStatus === "awaiting_product_details") {
        conversationRef.current.push({ role: "user", content });

        // Story 24.4: numa descricao "nao" pode ser conteudo ("nao e SaaS") — so as
        // expressoes explicitas de skip saem do ramo.
        if (isProductSkip(content)) {
          return exitProductFlow("Sem problema, seguimos sem produto.");
        }

        // Story 24.4: sem nome o /parse-product responde 400 (productName min(1)) e o
        // agente repetia "Nao consegui extrair os dados" para sempre.
        const productName = state.productMentioned?.trim() ?? "";
        if (!productName) {
          if (!productFlowRef.current.nameAsked) return askProductName("");
          return exitProductFlow("Sem o nome do produto nao consigo cadastra-lo, entao seguimos sem produto.");
        }

        setState((prev) => ({ ...prev, status: "parsing" }));

        try {
          const result = await callParseProductAPI(content, executionId, productName);
          setState((prev) => ({
            ...prev,
            status: "confirming_product",
            pendingProduct: result.product,
          }));
          await sendAndRecord(
            executionId,
            generateProductSummary(result.product),
            sendAgentMessage
          );
          return { handled: true };
        } catch {
          // Story 24.4: no maximo um ciclo de repeticao — a 2a falha sai sem produto.
          productFlowRef.current = {
            ...productFlowRef.current,
            detailFailures: productFlowRef.current.detailFailures + 1,
          };
          if (productFlowRef.current.detailFailures >= 2) {
            return exitProductFlow(
              "Nao consegui extrair os dados do produto de novo, entao seguimos sem produto por enquanto (voce pode cadastra-lo depois na base de conhecimento)."
            );
          }
          setState((prev) => ({ ...prev, status: "awaiting_product_details" }));
          await sendAndRecord(
            executionId,
            `Nao consegui extrair os dados. Tente descrever novamente o produto, incluindo o que faz e para quem. ${PRODUCT_EXIT_HINT}`,
            sendAgentMessage
          );
          return { handled: true };
        }
      }

      // Handler: confirming_product (AC: #2, #3)
      if (currentStatus === "confirming_product") {
        conversationRef.current.push({ role: "user", content });

        // Story 24.4: skip explicito ("seguir sem produto", "pular") sai do ramo. O "nao"
        // exato aqui significa "os dados estao errados" e e tratado abaixo. Mensagem que
        // tambem confirma ("ok, nao precisa") e confirmacao, nao skip.
        if (isProductSkip(content) && !isConfirmation(content)) {
          return exitProductFlow("Sem problema, seguimos sem produto.");
        }

        const confirmed = isConfirmation(content);
        // Story 24.4: "sim, nao precisa mudar nada" confirma — "nao precisa"/"nao tem
        // problema" negam a mudanca, nao os dados.
        const rejected = isProductRejection(
          normalizeAnswer(content).replace(/\bnao (precisa|tem problema|ha problema)\b/g, "")
        );

        if (confirmed && !rejected) {
          if (createProduct && state.pendingProduct) {
            const productId = await createProduct(state.pendingProduct);
            if (productId && state.briefing) {
              return exitProductFlow("Produto cadastrado!", {
                ...state.briefing,
                productSlug: productId,
              });
            }

            // Creation failed
            setState((prev) => ({
              ...prev,
              status: "awaiting_product_decision",
            }));
            await sendAndRecord(
              executionId,
              `Erro ao cadastrar produto. Quer tentar novamente? ${PRODUCT_EXIT_HINT}`,
              sendAgentMessage
            );
            return { handled: true };
          }

          // No createProduct callback — skip product
          return exitProductFlow("");
        }

        if (rejected && !confirmed) {
          // Story 24.4: em vez de "descreva de novo" em loop, descarta os dados e pede o
          // nome UMA vez. Se o nome ja foi pedido, sai sem produto com o resumo.
          if (!productFlowRef.current.nameAsked) {
            productFlowRef.current = { nameAsked: false, detailFailures: 0 };
            return askProductName("Ok, vamos refazer o cadastro.");
          }
          return exitProductFlow("Ok, seguimos sem produto.");
        }

        // Ambiguous — ask for clarification
        await sendAndRecord(
          executionId,
          `Os dados estao corretos? Responda 'sim' para confirmar ou 'nao' para refazer. ${PRODUCT_EXIT_HINT}`,
          sendAgentMessage
        );
        return { handled: true };
      }

      // === IMPORTED LEADS FLOW HANDLERS (Story 17.11) ===

      // Story 24.4: processa uma colagem (e-mail ou 2+ linhas). Toda resposta oferece a busca.
      const processLeadPaste = async (): Promise<{ handled: boolean }> => {
        const parsed = parseLeadInput(content);

        if (parsed.accepted.length === 0 || !state.briefing) {
          setState((prev) => ({ ...prev, status: "awaiting_leads_input" }));
          await sendAndRecord(
            executionId,
            `Nenhum lead valido encontrado. ${parsed.rejected.length > 0
              ? `${parsed.rejected.length} rejeitados:\n${parsed.rejected.map(r => `- "${r.line}" — ${r.reason}`).join("\n")}`
              : "Cole ao menos um email valido."}\n\n${LEADS_EXIT_HINT}`,
            sendAgentMessage
          );
          return { handled: true };
        }

        const updatedBriefing = { ...state.briefing, importedLeads: parsed.accepted };
        setState((prev) => ({
          ...prev,
          status: "confirming_leads",
          briefing: updatedBriefing,
        }));
        await sendAndRecord(executionId, formatLeadPreview(parsed), sendAgentMessage);
        return { handled: true };
      };

      const repeatLeadsInstructions = async (): Promise<{ handled: boolean }> => {
        setState((prev) => ({ ...prev, status: "awaiting_leads_input" }));
        await sendAndRecord(
          executionId,
          "Para importar, cole a lista de leads no formato:\n\n" +
            LEADS_PASTE_INSTRUCTIONS +
            "\n\n" +
            LEADS_EXIT_HINT,
          sendAgentMessage
        );
        return { handled: true };
      };

      // Handler: awaiting_leads_input (AC: #1, #2)
      if (currentStatus === "awaiting_leads_input") {
        conversationRef.current.push({ role: "user", content: toMemoryContent(content) });

        if (looksLikeLeadPaste(content)) return processLeadPaste();

        // Story 24.4: uma linha sem e-mail e CONVERSA ("prefiro que voce busque") -> LLM.
        setState((prev) => ({ ...prev, status: "parsing" }));
        let parsed: BriefingParseResponse;
        try {
          parsed = carryProductSlug(await callParseAPI(executionId), state.briefing);
        } catch {
          // Fallback por palavra-chave: pedido de busca sai do ramo; senao repete.
          if (!isSearchPreference(content)) return repeatLeadsInstructions();
          if (!state.briefing) {
            setState((prev) => ({ ...prev, status: "awaiting_fields" }));
            await sendAndRecord(
              executionId,
              "Combinado, eu busco os leads. Quais cargos e qual localizacao voce quer prospectar?",
              sendAgentMessage
            );
            return { handled: true };
          }
          const searchBriefing = reconcileNonImportBriefing({
            ...state.briefing,
            importedLeads: undefined,
          });
          return handleParseResult(
            {
              briefing: searchBriefing,
              missingFields: withRequiredMissing(searchBriefing, state.missingFields),
              isComplete: false,
              canProceed: Boolean(searchBriefing.jobTitles?.length && searchBriefing.location),
              suggestions: {},
              productMentioned: null,
              nextAction: "confirm",
              questionText: null,
            },
            executionId,
            sendAgentMessage,
            content,
            state.briefing,
            state.productMentioned
          );
        }

        // O LLM ainda indica import ("espera, vou pegar a lista") -> continua no ramo. A
        // ancora da 22.11 so vale para ENTRAR no ramo.
        if (parsed.nextAction === "import_leads") return repeatLeadsInstructions();

        const searchBriefing = reconcileNonImportBriefing(parsed.briefing);
        return handleParseResult(
          {
            ...parsed,
            briefing: searchBriefing,
            missingFields: withRequiredMissing(searchBriefing, parsed.missingFields),
            canProceed: Boolean(searchBriefing.jobTitles?.length && searchBriefing.location),
          },
          executionId,
          sendAgentMessage,
          content,
          state.briefing,
          state.productMentioned
        );
      }

      // Handler: confirming_leads (AC: #2)
      if (currentStatus === "confirming_leads") {
        conversationRef.current.push({ role: "user", content: toMemoryContent(content) });

        // Story 24.4: parece colagem -> processa como nova lista. Vem ANTES da confirmacao:
        // o isConfirmation casa substring, e um e-mail como "simone@..." ou "@okta.com"
        // confirmaria a lista ANTIGA.
        if (looksLikeLeadPaste(content)) return processLeadPaste();

        if (isConfirmation(content)) {
          setState((prev) => ({
            ...prev,
            status: "confirming",
          }));
          if (state.briefing) {
            await sendAndRecord(
              executionId,
              generateBriefingSummary(state.briefing, state.missingFields),
              sendAgentMessage
            );
          }
          return { handled: true };
        }

        // User wants to redo leads
        setState((prev) => ({ ...prev, status: "awaiting_leads_input" }));
        await sendAndRecord(
          executionId,
          `Ok, cole a lista de leads novamente. ${LEADS_EXIT_HINT}`,
          sendAgentMessage
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
          // Story 24.4: correcao apos cadastro mantem o produto ja resolvido.
          const result = carryProductSlug(await callParseAPI(executionId), state.briefing);

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
          return handleParseResult(result, executionId, sendAgentMessage, content, state.briefing, state.productMentioned);
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
          return handleParseResult(result, executionId, sendAgentMessage, content, state.briefing, state.productMentioned);
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
          return handleParseResult(result, executionId, sendAgentMessage, content, state.briefing, state.productMentioned);
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
    productFlowRef.current = { nameAsked: false, detailFailures: 0 };
  }, []);

  // Story 24.4: "Cancelar" no plano reabre o briefing — a proxima mensagem volta a ser
  // tratada como ajuste (ou "sim" reconfirma). Sem briefing, volta ao inicio.
  const reopenBriefing = useCallback(() => {
    setState((prev) =>
      prev.briefing ? { ...prev, status: "confirming" } : { ...prev, status: "idle" }
    );
  }, []);

  // === Story 22.13: seams do ajuste pos-rejeicao ===

  const parseAdjustment = useCallback(
    async (content: string, executionId: string): Promise<BriefingParseResponse> => {
      conversationRef.current.push({ role: "user", content });
      return callParseAPI(executionId);
    },
    [callParseAPI]
  );

  const recordAgentTurn = useCallback((content: string) => {
    if (!content) return; // content min(1) no schema do /parse — turno vazio invalidaria o proximo parse
    conversationRef.current.push({ role: "agent", content });
  }, []);

  // Story 22.13 (review): o ramo de CONFIRMACAO nao chama parseAdjustment (a decisao e
  // deterministica, sem LLM), mas a resposta do agente entra na memoria — sem registrar
  // tambem o turno do usuario, o historico enviado ao /parse teria um turno de agente
  // sem antecedente.
  const recordUserTurn = useCallback((content: string) => {
    if (!content) return;
    conversationRef.current.push({ role: "user", content });
  }, []);

  return {
    state,
    processMessage,
    reset,
    reopenBriefing,
    parseAdjustment,
    recordAgentTurn,
    recordUserTurn,
  };
}
