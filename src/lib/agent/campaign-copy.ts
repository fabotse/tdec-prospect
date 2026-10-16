/**
 * Regra de copy da campanha gerada pelo agente.
 * Story 24.6: e-mails sem dados ficticios e follow-ups com valor.
 *
 * Modulo PURO (sem I/O). Reune tres coisas:
 * 1. `TEMPLATE_LEAD_VARIABLES`: variaveis de lead vazias. Com elas os prompts caem no
 *    MODO TEMPLATE (`{{#if lead_name}}` vazio vai para o `{{else}}`) e nada de "Nome",
 *    "Empresa" ou setor "Tecnologia" inventado chega ao modelo.
 * 2. `buildFollowUpPlan`: angulo, numeracao e estrategias explicitas por posicao.
 * 3. `cleanAgentEmailCopy`: limpeza deterministica da saida do LLM antes de ela virar o
 *    template exportado ao Instantly.
 *
 * As unicas variaveis validas no texto final sao as que o export ja envia ao Instantly
 * (`variable-registry.ts` -> `PLATFORM_MAPPINGS.instantly`).
 */

import {
  normalizeTemplateVariables,
  sanitizeGeneratedBody,
  sanitizeGeneratedSubject,
} from "@/lib/ai/sanitize-ai-output";

// ==============================================
// VARIAVEIS
// ==============================================

/** Variaveis de lead vazias: forcam o MODO TEMPLATE nos prompts de estrutura e e-mail. */
export const TEMPLATE_LEAD_VARIABLES = {
  lead_name: "",
  lead_title: "",
  lead_company: "",
  lead_industry: "",
  lead_location: "",
  icebreaker: "",
} as const;

/** Variaveis que o export envia ao Instantly. Qualquer outra `{{x}}` e removida. */
export const SUPPORTED_EMAIL_VARIABLES = [
  "first_name",
  "company_name",
  "title",
  "ice_breaker",
] as const;

const SUPPORTED_SET = new Set<string>(SUPPORTED_EMAIL_VARIABLES);

/**
 * Aliases que `normalizeTemplateVariables` nao conhece (chaves em minusculas e sem
 * espacos). O resto (nome, empresa, firstname, companyname, cargo, icebreaker...) ja e
 * mapeado por ele.
 */
const AGENT_VARIABLE_ALIASES: Record<string, string> = {
  lead_name: "first_name",
  lead_first_name: "first_name",
  leadname: "first_name",
  first: "first_name",
  nome_do_lead: "first_name",
  lead_company: "company_name",
  lead_company_name: "company_name",
  leadcompany: "company_name",
  company_name_lead: "company_name",
  empresa_do_lead: "company_name",
  lead_title: "title",
  leadtitle: "title",
  cargo_do_lead: "title",
  lead_icebreaker: "ice_breaker",
  "ice-breaker": "ice_breaker",
};

// ==============================================
// PLANO DE FOLLOW-UP
// ==============================================

export type FollowUpAngle =
  | "INSIGHT DO SETOR"
  | "PERGUNTA"
  | "RECURSO ÚTIL"
  | "CUSTO DE NÃO AGIR"
  | "OUTRA PERSPECTIVA"
  | "ENCERRAMENTO";

interface AngleSpec {
  angle: FollowUpAngle;
  body: string;
  subject: string;
}

/** Angulos do meio, em ordem. Sequencias longas voltam ao primeiro. */
const MIDDLE_ANGLES: AngleSpec[] = [
  {
    angle: "INSIGHT DO SETOR",
    body:
      "INSIGHT DO SETOR: traga UMA observação concreta sobre um desafio comum do mercado de {{company_name}} e conecte com a dor que o produto resolve. Fale do problema do lead, não do produto.",
    subject:
      "Assunto curto sobre um tema ou desafio do setor, sem RE:, até 50 caracteres. Pode usar {{company_name}}.",
  },
  {
    angle: "PERGUNTA",
    body:
      "PERGUNTA: faça UMA pergunta curta e específica sobre como {{company_name}} lida hoje com a dor principal. O e-mail inteiro gira em torno dessa pergunta, em 2 a 4 frases.",
    subject: "Pergunta curta, sem RE:, até 50 caracteres.",
  },
  {
    angle: "RECURSO ÚTIL",
    body:
      "RECURSO ÚTIL: ofereça algo de valor sem pedir nada em troca (um checklist, um passo prático ou uma ideia aplicável) ligado à dor do lead. Descreva o recurso em 1 frase e pergunte se faz sentido enviar.",
    subject:
      "Assunto que ofereça algo útil, sem RE:, até 50 caracteres (ex.: 'Um checklist para {{company_name}}').",
  },
  {
    angle: "CUSTO DE NÃO AGIR",
    body:
      "CUSTO DE NÃO AGIR: mostre, em termos qualitativos, o que se perde mantendo o processo atual (tempo, retrabalho, oportunidade). Sem alarmismo e sem números inventados.",
    subject: "Assunto sobre o custo do status quo, sem RE:, até 50 caracteres.",
  },
  {
    angle: "OUTRA PERSPECTIVA",
    body:
      "OUTRA PERSPECTIVA: aborde a mesma dor por um ângulo diferente dos e-mails anteriores (outro impacto, outra área ou outro momento da operação) e termine com uma pergunta leve.",
    subject: "Assunto com um ângulo novo, sem RE:, até 50 caracteres.",
  },
];

const CLOSING_ANGLE: AngleSpec = {
  angle: "ENCERRAMENTO",
  body:
    "ENCERRAMENTO: este é o último e-mail. Diga com leveza que vai parar de escrever, deixe a porta aberta para quando fizer sentido e faça uma pergunta de sim/não de baixo atrito. Tom amigável, sem pressão e sem culpa.",
  subject:
    "Assunto curto e pessoal de encerramento, sem RE:, até 40 caracteres (ex.: '{{first_name}}, encerro por aqui?').",
};

const COMMON_RULES =
  "Regras obrigatórias: NÃO mencione nem pergunte sobre e-mails anteriores (nada de 'viu meu e-mail?', 'conseguiu ver?', 'retomando', 'como falei'). NÃO invente números, porcentagens, cases, clientes ou resultados. NÃO use colchetes nem placeholders como [Seu nome] ou [Empresa]. As únicas variáveis permitidas são {{first_name}}, {{company_name}} e {{title}}; não use {{ice_breaker}} (ele é só do primeiro e-mail) nem nenhuma outra. Não assine com nome inventado.";

const COMMON_SUBJECT_RULES =
  "Não use 'RE:' nem 'FW:'. Não pergunte se o lead viu o e-mail anterior. Sem colchetes e sem variáveis além de {{first_name}}, {{company_name}} e {{title}}.";

export interface FollowUpPlan {
  angle: FollowUpAngle;
  sequencePosition: string;
  followUpStrategy: string;
  subjectStrategy: string;
}

/**
 * Plano do follow-up na posicao `n` (1-based, entre e-mails) de `total` e-mails.
 * O e-mail 1 e sempre o inicial e nao tem plano (n precisa ser >= 2).
 * O ultimo e-mail e sempre ENCERRAMENTO. Os do meio percorrem os 5 angulos em ordem.
 */
export function buildFollowUpPlan(
  n: number,
  total: number,
  anglesUsed: readonly string[] = []
): FollowUpPlan {
  if (!Number.isInteger(n) || !Number.isInteger(total) || n < 2 || n > total) {
    throw new RangeError(
      `buildFollowUpPlan: posição inválida (n=${n}, total=${total}); follow-up exige 2 <= n <= total`
    );
  }

  const isLast = n === total;
  const spec = isLast ? CLOSING_ANGLE : MIDDLE_ANGLES[(n - 2) % MIDDLE_ANGLES.length];

  // O angulo atual sai da lista (sequencias longas o repetem no ciclo): sem isso o texto
  // mandaria usar e nao repetir o mesmo angulo.
  const used = anglesUsed.filter((a) => a.trim() !== "" && a !== spec.angle);
  const usedText =
    used.length > 0
      ? ` Ângulos já usados nesta sequência: ${used.join(", ")}. Não repita a abordagem, os argumentos nem as frases deles.`
      : "";

  return {
    angle: spec.angle,
    sequencePosition: `Email ${n} de ${total}${isLast ? " (ÚLTIMO e-mail da sequência)" : ""}`,
    followUpStrategy: `${spec.body}${usedText} ${COMMON_RULES}`,
    subjectStrategy: `${spec.subject} ${COMMON_SUBJECT_RULES}`,
  };
}

// ==============================================
// LIMPEZA DA SAIDA
// ==============================================

const VARIABLE_TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;
const BRACKET_TOKEN = /\[[^\]\n]*\]/g;
const STRAY_BRACKET = /[[\]]/g;
/** "Nome"/"Empresa" usados como placeholder (seguidos de pontuacao ou fim de linha). */
const BARE_PLACEHOLDER = /(?<![\p{L}\p{N}_{])(Nome|Empresa)(?=\s*(?:[,.!?;:]|$))/gmu;

function applyAliases(text: string): string {
  return text.replace(VARIABLE_TOKEN, (match, raw: string) => {
    const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
    const alias = AGENT_VARIABLE_ALIASES[key];
    // Sem alias do agente: reescreve com a chave normalizada ("{{Primeiro Nome}}" ->
    // "{{primeiro_nome}}") para normalizeTemplateVariables mapear em vez de apagar.
    return alias ? `{{${alias}}}` : key ? `{{${key}}}` : match;
  });
}

function removeUnsupportedVariables(text: string): string {
  return text.replace(VARIABLE_TOKEN, (_match, raw: string) =>
    SUPPORTED_SET.has(raw.trim()) ? `{{${raw.trim()}}}` : ""
  );
}

function tidyLine(line: string): string {
  return line
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Limpa a saida do LLM antes de ela virar o template do Instantly.
 * Ordem: prefixo -> aliases -> normalizeTemplateVariables -> remove `{{x}}` nao suportada
 * -> remove `[...]` (linha so com placeholder sai inteira; inline sai o token) -> espacos.
 * Nunca chama o LLM de novo: limpa e segue.
 */
export function cleanAgentEmailCopy(text: string, kind: "subject" | "body"): string {
  let result = kind === "subject" ? sanitizeGeneratedSubject(text) : sanitizeGeneratedBody(text);
  result = applyAliases(result);
  result = normalizeTemplateVariables(result);
  // "Nome"/"Empresa" sozinhos na linha sao assinatura ficticia: saem. No meio do texto
  // ("Oi Nome,") viram a variavel que o Instantly preenche por lead.
  result = result.replace(/^[ \t]*(?:Nome|Empresa)[ \t]*[.,;:!]?[ \t]*$/gm, "");
  result = result.replace(BARE_PLACEHOLDER, (word: string) =>
    word === "Nome" ? "{{first_name}}" : "{{company_name}}"
  );

  if (kind === "subject") {
    // Assunto e uma linha so, e {{ice_breaker}} nunca vai no assunto.
    result = result.replace(/\s*\n+\s*/g, " ").replace(/\{\{ice_breaker\}\}/g, "");
  }

  const lines = result.split("\n").flatMap((original) => {
    const cleaned = tidyLine(
      removeUnsupportedVariables(original).replace(BRACKET_TOKEN, "").replace(STRAY_BRACKET, "")
    );
    // Linha que so tinha placeholder sai inteira; linha vazia original (paragrafo) fica.
    if (cleaned === "" && original.trim() !== "") return [];
    return [cleaned];
  });

  result = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (kind === "subject") {
    const edges = /^[\s"'“”‘’«»,;:.\-–—]+/u;
    result = result
      .replace(edges, "")
      // A estrategia proibe RE:/FW: (sanitizeGeneratedSubject mantem um RE:).
      .replace(/^(?:(?:RE|FWD?|ENC)\s*:\s*)+/i, "")
      .replace(edges, "")
      .replace(/[\s"'“”‘’«»,;:\-–—]+$/u, "")
      .trim();
  }

  return result;
}

/**
 * Lista o que sobrou de invalido no texto: `{{x}}` fora das quatro validas, `[...]`
 * (ou colchete solto) e "Nome"/"Empresa" como palavra isolada. Vazio = texto limpo.
 */
export function findUnsupportedCopyTokens(text: string): string[] {
  const found: string[] = [];

  for (const match of text.matchAll(VARIABLE_TOKEN)) {
    if (!SUPPORTED_SET.has(match[1]) || match[0] !== `{{${match[1]}}}`) found.push(match[0]);
  }
  for (const match of text.matchAll(BRACKET_TOKEN)) found.push(match[0]);
  const withoutTokens = text.replace(BRACKET_TOKEN, "");
  for (const match of withoutTokens.matchAll(STRAY_BRACKET)) found.push(match[0]);
  for (const match of text.matchAll(/(?<![\p{L}\p{N}_{])(Nome|Empresa)(?![\p{L}\p{N}_}])/gu)) {
    found.push(match[0]);
  }

  return found;
}

/**
 * Limpa o icebreaker, que vai ao Instantly como o VALOR de `{{ice_breaker}}`: variavel
 * dentro de custom variable nao e resolvida, entao TODA `{{x}}` sai, junto com `[...]`.
 * Vazio depois da limpeza = falha de icebreaker (null).
 */
export function cleanIcebreakerText(text: string): string | null {
  const cleaned = text
    .split("\n")
    .map((line) =>
      tidyLine(line.replace(VARIABLE_TOKEN, "").replace(BRACKET_TOKEN, "").replace(STRAY_BRACKET, ""))
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}
