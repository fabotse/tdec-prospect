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
import {
  formatCompanySizesLabel,
  resolveDirectSearchCompanySizes,
  resolveSearchLocations,
} from "@/lib/agent/search-defaults";
import { formatTargetAccounts, isAccountListMode } from "@/lib/agent/target-accounts";
import {
  activeReferenceProfile,
  formatReferenceAccounts,
  isLookalikeMode,
  profileMatchesReferences,
} from "@/lib/agent/reference-accounts";
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
  // Story 24.17: as contas so vem do parse quando a execucao JA esta no modo lista (o ajuste
  // nao muda a forma do pipeline). Lista vazia no parse preserva a persistida.
  const persistedListMode = isAccountListMode(persisted);
  const parsedHasAccounts = (parsed.targetAccounts?.length ?? 0) > 0;
  const accountFields: Partial<ParsedBriefing> = {};
  if (persistedListMode && parsedHasAccounts) {
    accountFields.targetAccounts = parsed.targetAccounts;
    accountFields.suppressedAccounts = parsed.suppressedAccounts ?? null;
  }
  // `jobTitlesFromIcp`: o parse vence; ausencia preserva enquanto os cargos forem os mesmos.
  const sameTitles =
    parsed.jobTitles.length === persisted.jobTitles.length &&
    parsed.jobTitles.every((t, i) => t === persisted.jobTitles[i]);
  const jobTitlesFromIcp =
    parsed.jobTitlesFromIcp ?? (sameTitles ? persisted.jobTitlesFromIcp : undefined);
  if (jobTitlesFromIcp !== undefined) accountFields.jobTitlesFromIcp = jobTitlesFromIcp;
  else if ("jobTitlesFromIcp" in persisted) accountFields.jobTitlesFromIcp = false;
  // Story 24.18: referencias e perfil. Ausencia PRESERVA os persistidos; o parse so vence
  // quando a execucao ja esta no modo contas parecidas e traz referencias com o perfil delas.
  const persistedLookalike = isLookalikeMode(persisted);
  const parsedLookalike = isLookalikeMode(parsed);
  if (
    persistedLookalike &&
    parsedLookalike &&
    profileMatchesReferences(parsed.referenceProfile, parsed.referenceAccounts)
  ) {
    accountFields.referenceAccounts = parsed.referenceAccounts;
    accountFields.referenceAccountsSource =
      parsed.referenceAccountsSource ?? persisted.referenceAccountsSource ?? null;
    accountFields.referenceProfile = parsed.referenceProfile;
  }
  // O parse zera a tecnologia quando ve contas; fora do modo lista as contas sao ignoradas,
  // e a tecnologia persistida tambem fica. Story 24.18: idem para referencias.
  const technology =
    (!persistedListMode && parsedHasAccounts) || (!persistedLookalike && parsedLookalike)
      ? persisted.technology
      : parsed.technology;

  const merged: ParsedBriefing = {
    // FORMA: preservada da execucao em andamento (skipSteps, importedLeads, mode,
    // productSlug, premiumIcebreakers e qualquer outro campo ja persistido).
    ...persisted,
    // FILTROS DE BUSCA: vem do parse, inclusive quando viram null (remocao explicita).
    technology,
    jobTitles: parsed.jobTitles,
    location: parsed.location,
    companySize: parsed.companySize,
    industry: parsed.industry,
    // METADADOS DE CAMPANHA: o parse vence quando traz valor; ausencia PRESERVA.
    objective: parsed.objective ?? persisted.objective ?? null,
    urgency: parsed.urgency ?? persisted.urgency ?? null,
    campaignDescription: parsed.campaignDescription ?? persisted.campaignDescription ?? null,
    emailCount: parsed.emailCount ?? persisted.emailCount ?? null,
    // Story 22.15: o segmento de destino segue a MESMA politica dos metadados de campanha
    // — ausencia PRESERVA. Um ajuste de busca ("tira o filtro de tamanho") nao pode zerar
    // em silencio o "coloca no segmento Teste Atibaia" pedido antes.
    segmentName: parsed.segmentName ?? persisted.segmentName ?? null,
    // Story 24.13: quantos leads (N) — metadado, mesma regra: ausencia PRESERVA.
    leadCount: parsed.leadCount ?? persisted.leadCount ?? null,
    // Story 24.14: defaults do ICP — o valor do parse vence; ausencia PRESERVA o snapshot.
    icpDefaults: parsed.icpDefaults ?? persisted.icpDefaults ?? null,
    // Story 24.17: contas e origem dos cargos (regras acima).
    ...accountFields,
    // Story 24.15: escopo do local — o valor do parse vence; ausencia PRESERVA o persistido.
    ...(parsed.locationScope ? { locationScope: parsed.locationScope } : {}),
  };
  // Story 24.17: no modo lista a tecnologia nao roda (search_companies pulado) — um parse
  // sem contas nao pode trazer uma tecnologia para dentro de uma execucao no modo lista.
  if (isAccountListMode(merged) || isLookalikeMode(merged)) merged.technology = null;
  return merged;
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
    // Story 22.15: esta e a ULTIMA tela antes de uma re-execucao PAGA. Sem a linha do
    // segmento o usuario confirma um gasto sem saber para onde os leads vao — o defeito
    // exato que a story existe para matar.
    lines.push(`- Segmento: ${merged.segmentName ?? "nome da campanha"}`);
    lines.push("");
    lines.push("Os leads ja aprovados continuam os mesmos — vou reescrever a campanha.");
  } else {
    // Story 24.17: no modo lista, as contas (e nada de porte do ICP).
    const accountListMode = isAccountListMode(merged);
    if (accountListMode) {
      lines.push(`- Contas: ${formatTargetAccounts(merged.targetAccounts) || "nenhuma"}`);
    }
    // Story 24.18: no modo contas parecidas, os clientes de referencia.
    if (isLookalikeMode(merged)) {
      lines.push(
        `- Clientes de referencia: ${formatReferenceAccounts(merged.referenceAccounts) || "nenhum"}`
      );
    }
    lines.push(`- Tecnologia: ${merged.technology ?? "sem filtro"}`);
    lines.push(
      `- Cargos: ${merged.jobTitles.length > 0 ? merged.jobTitles.join(", ") : "sem filtro"}`
    );
    // Story 24.14: sem valor do usuario, os defaults do ICP (quando houver) sao o filtro
    // efetivo — o resumo diz de onde vieram. Sem ICP, identico ao de antes.
    const effectiveLocations = resolveSearchLocations(merged);
    lines.push(
      `- Localizacao: ${
        merged.location ??
        (effectiveLocations.fromIcp
          ? `${effectiveLocations.locations.join(", ")} (do seu ICP)`
          : effectiveLocations.fromReference
            ? `${effectiveLocations.locations.join(", ")} (dos seus clientes)`
            : "sem filtro")
      }${
        // Story 24.15: mesmo sufixo do resumo do briefing (use-briefing-flow).
        merged.locationScope === "person" && effectiveLocations.locations.length > 0
          ? " (onde a pessoa esta)"
          : ""
      }`
    );
    const isDirectSearch =
      !accountListMode &&
      merged.skipSteps.includes("search_companies") &&
      !merged.skipSteps.includes("search_leads");
    const effectiveSizes = resolveDirectSearchCompanySizes(merged);
    lines.push(
      `- Tamanho: ${
        merged.companySize ??
        (isDirectSearch && effectiveSizes.source === "icp"
          ? `${formatCompanySizesLabel(effectiveSizes.companySizes)} (do seu ICP)`
          : isDirectSearch && effectiveSizes.source === "reference"
            ? `${formatCompanySizesLabel(effectiveSizes.companySizes)} (dos seus clientes)`
            : "sem filtro")
      }`
    );
    const referenceIndustries = activeReferenceProfile(merged)?.industries ?? [];
    lines.push(
      `- Industria: ${
        merged.industry ??
        (referenceIndustries.length > 0
          ? `${referenceIndustries.join(", ")} (dos seus clientes)`
          : "sem filtro")
      }`
    );
    // Story 24.13: so quando N existe — sem N o resumo segue identico ao de antes.
    if (merged.leadCount) {
      lines.push(`- Leads: até ${merged.leadCount}`);
    }

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
