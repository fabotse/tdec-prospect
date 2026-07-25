/**
 * Briefing Adjustment Helpers
 * Story 22.13 — Ajuste pos-rejeicao de etapa
 *
 * AC3: a re-execucao (paga) so dispara com confirmacao DETERMINISTICA e inequivoca.
 * AC4: o ajuste muda FILTROS, nunca a FORMA do pipeline.
 *
 * Helpers PUROS (sem React, sem fetch) para o ramo de ajuste do AgentChat.
 */

import { CONFIRMATION_KEYWORDS } from "@/hooks/use-briefing-flow";
import { STEP_LABELS } from "@/types/agent";
import type { ParsedBriefing, StepType } from "@/types/agent";

// ==============================================
// CONFIRMACAO DA RE-EXECUCAO (AC3)
// ==============================================

/**
 * Sinais de que a mensagem NAO e uma confirmacao limpa, por mais que contenha uma
 * keyword de confirmacao. Todos ja normalizados (minusculas, sem acento).
 *
 * Story 22.13 (review): `isConfirmation` sozinho e substring match sobre uma lista que
 * inclui "sim", "pode", "vai", "isso", "manda", "vamos" — entao "pode tirar o filtro?",
 * "isso nao esta certo" e ate "assim nao da" ("as-SIM") disparavam uma re-execucao PAGA
 * com os parametros ANTIGOS, descartando a correcao do usuario. No fluxo de briefing o
 * mesmo helper nunca decide sozinho: la ele e pareado com `briefingChanged`. Aqui, como
 * a decisao e tomada ANTES de qualquer parse (NFR1: o LLM nunca decide gastar), o
 * desempate e lexical e assimetrico de proposito — um falso NEGATIVO custa uma chamada
 * de parse; um falso POSITIVO custa creditos e joga fora o que o usuario pediu.
 */
const ADJUSTMENT_INTENT_SIGNALS: readonly string[] = [
  // negacao / ressalva
  "nao",
  "nunca",
  "jamais",
  "mas ",
  "porem",
  "exceto",
  "so que",
  "na verdade",
  // verbos de ajuste
  "troca",
  "trocar",
  "muda",
  "mudar",
  "altera",
  "alterar",
  "remove",
  "remover",
  "tira",
  "tirar",
  "retira",
  "retirar",
  "aumenta",
  "aumentar",
  "diminui",
  "diminuir",
  "adiciona",
  "adicionar",
  "acrescenta",
  "inclui",
  "incluir",
  "exclui",
  "excluir",
  "sem o ",
  "sem a ",
  "sem filtro",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Confirmacao INEQUIVOCA para disparar a re-execucao de uma etapa (AC3).
 *
 * Tres condicoes, todas deterministicas:
 * 1. casa uma keyword de `CONFIRMATION_KEYWORDS` como PALAVRA INTEIRA (mata "assim" -> "sim");
 * 2. nao e pergunta (`?` = o usuario esta perguntando, nao mandando executar);
 * 3. nao carrega sinal de ajuste — negacao, ressalva ou verbo de mudanca.
 *
 * Na duvida devolve `false`: a mensagem vira um novo ajuste e NADA e executado
 * (fail-safe da 22.11). Funcao PURA.
 */
export function isAdjustmentConfirmation(message: string): boolean {
  if (!message) return false;
  const normalized = normalize(message);
  if (normalized === "") return false;

  if (normalized.includes("?")) return false;
  if (ADJUSTMENT_INTENT_SIGNALS.some((signal) => normalized.includes(signal))) return false;

  return CONFIRMATION_KEYWORDS.some((keyword) => {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalize(keyword))}([^a-z0-9]|$)`);
    return pattern.test(normalized);
  });
}

// ==============================================
// MERGE (AC4)
// ==============================================

/**
 * Aplica sobre o briefing PERSISTIDO somente os campos de filtro devolvidos pelo
 * /parse, preservando a FORMA da execucao em andamento.
 *
 * Campos ajustaveis: `technology`, `jobTitles`, `location`, `companySize`, `industry`
 * (filtros de busca, aplicados do parse mesmo quando viram `null` — e assim que
 * "remove o filtro de tamanho" funciona) e `objective`, `urgency`,
 * `campaignDescription`, `emailCount` (metadados de campanha).
 *
 * O /parse re-deriva o briefing INTEIRO a partir da conversa. Tres campos nunca
 * podem vir de la depois que a execucao ja foi confirmada:
 *
 * - `premiumIcebreakers` — escrito pelo SERVIDOR no POST /confirm. Se o parse cru
 *   fosse aplicado, sumiria: o usuario pagou premium e receberia standard, em
 *   silencio (create-campaign-step + agent-cost-estimator leem `false`).
 * - `importedLeads` — estado client-only do fluxo de import. Sumiria e o
 *   create_campaign quebraria com "Lista de leads importados esta vazia".
 * - `skipSteps` (+ `mode`, `productSlug`) — definem a FORMA do pipeline, que ja
 *   virou linhas em `agent_steps` no confirm. Muda-la no meio da execucao produz
 *   comportamento incoerente com o plano aprovado.
 *
 * Story 22.13 (review, decisao Fabossi): os 4 metadados de CAMPANHA sao PRESERVADOS
 * quando o parse devolve `null`/ausente. Eles nao aparecem numa frase de ajuste de
 * busca ("tira o filtro de tamanho"), e com a memoria vazia (ex.: rejeitar apos F5)
 * o parse os zeraria — rebaixando em silencio uma sequencia de 5 e-mails de
 * reengajamento para o default de primeiro contato. Trade-off aceito: remover um
 * metadado de campanha passa a exigir um valor novo, nao basta omiti-lo.
 */
export function mergeAdjustedBriefing(
  persisted: ParsedBriefing,
  parsed: ParsedBriefing
): ParsedBriefing {
  return {
    // FORMA: preservada da execucao em andamento (skipSteps, importedLeads, mode,
    // productSlug, premiumIcebreakers e qualquer outro campo ja persistido).
    ...persisted,
    // FILTROS DE BUSCA: vem do parse, inclusive quando viram null (remocao explicita).
    technology: parsed.technology,
    jobTitles: parsed.jobTitles,
    location: parsed.location,
    companySize: parsed.companySize,
    industry: parsed.industry,
    // METADADOS DE CAMPANHA: o parse vence quando traz valor; ausencia PRESERVA.
    objective: parsed.objective ?? persisted.objective ?? null,
    urgency: parsed.urgency ?? persisted.urgency ?? null,
    campaignDescription: parsed.campaignDescription ?? persisted.campaignDescription ?? null,
    emailCount: parsed.emailCount ?? persisted.emailCount ?? null,
  };
}

// ==============================================
// RESUMO (AC2)
// ==============================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

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

const SEARCH_FILTER_LABELS: Array<{ key: keyof ParsedBriefing; label: string }> = [
  { key: "technology", label: "Tecnologia" },
  { key: "location", label: "Localizacao" },
  { key: "companySize", label: "Tamanho" },
  { key: "industry", label: "Industria" },
];

/**
 * Story 22.13 (review): filtros que EXISTIAM no briefing persistido e sumiram no
 * ajuste. Um apagamento silencioso e o modo de falha caro aqui — o resumo tem que
 * dizer o que vai ser REMOVIDO antes de o usuario confirmar.
 */
export function listRemovedFilters(
  persisted: ParsedBriefing,
  merged: ParsedBriefing
): string[] {
  const removed = SEARCH_FILTER_LABELS.filter(
    ({ key }) => Boolean(persisted[key]) && !merged[key]
  ).map(({ label }) => label);

  if (persisted.jobTitles.length > 0 && merged.jobTitles.length === 0) {
    removed.push("Cargos");
  }

  return removed;
}

/**
 * Resumo deterministico do ajuste + custo da re-execucao + pergunta de confirmacao,
 * em UMA mensagem (AC2).
 *
 * Trap #4: a promessa e "executar esta etapa de novo com esses parametros" — nunca
 * "buscar em todo o mercado". Re-executar `search_leads` com o step de empresas ja
 * aprovado continua buscando pelos MESMOS dominios; ampliar o universo e outra story.
 *
 * Story 22.13 (review): o corpo do resumo depende do TIPO do step. Ao ajustar a
 * campanha, listar filtros de busca era enganoso — a re-execucao de `create_campaign`
 * nao re-filtra o conjunto de leads ja aprovado.
 */
export function buildAdjustmentSummary(
  persisted: ParsedBriefing,
  merged: ParsedBriefing,
  stepType: StepType,
  estimatedCost: number | null
): string {
  const label = STEP_LABELS[stepType] ?? stepType;
  const lines: string[] = [`Ajustei os parametros da etapa "${label}":`];

  if (stepType === "create_campaign") {
    lines.push(
      `- Objetivo: ${
        merged.objective
          ? (OBJECTIVE_LABELS[merged.objective] ?? merged.objective)
          : "padrao (primeiro contato)"
      }`
    );
    lines.push(
      `- Urgencia: ${
        merged.urgency ? (URGENCY_LABELS[merged.urgency] ?? merged.urgency) : "padrao (media)"
      }`
    );
    lines.push(`- Descricao: ${merged.campaignDescription ?? "sem descricao"}`);
    lines.push(`- Nº de e-mails: ${merged.emailCount ?? "padrao do objetivo"}`);
    lines.push("");
    lines.push("Os leads ja aprovados continuam os mesmos — vou reescrever a campanha.");
  } else {
    lines.push(`- Tecnologia: ${merged.technology ?? "sem filtro"}`);
    lines.push(
      `- Cargos: ${merged.jobTitles.length > 0 ? merged.jobTitles.join(", ") : "sem filtro"}`
    );
    lines.push(`- Localizacao: ${merged.location ?? "sem filtro"}`);
    lines.push(`- Tamanho: ${merged.companySize ?? "sem filtro"}`);
    lines.push(`- Industria: ${merged.industry ?? "sem filtro"}`);

    const removed = listRemovedFilters(persisted, merged);
    if (removed.length > 0) {
      lines.push("");
      lines.push(`Atencao: vou REMOVER ${removed.join(", ")} do que estava valendo.`);
    }
  }

  lines.push("");
  if (estimatedCost !== null) {
    lines.push(
      `Executar esta etapa de novo custa aproximadamente ${formatCurrency(estimatedCost)}.`
    );
  }
  lines.push(
    'Confirma? Responda "sim" para eu executar a etapa de novo com esses parametros, ou me diga outro ajuste.'
  );

  return lines.join("\n");
}
