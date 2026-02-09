/**
 * AI Output Sanitization
 *
 * Removes common prefixes that LLMs sometimes include in their output
 * (e.g., "Assunto: ...", "Corpo: ...") even when explicitly told not to.
 *
 * Also normalizes template variable names (Story 7.5):
 * - AI may output {{Nome}} instead of {{first_name}}, {{Empresa}} instead of {{company_name}}, etc.
 * - normalizeTemplateVariables() maps known variants to the correct Instantly variable format
 * - ensureIceBreakerVariable() guarantees {{ice_breaker}} is in the email body
 *
 * Applied as a safety net after AI generation before storing in fields.
 */

/** Prefixes to strip from subject fields (case-insensitive) */
const SUBJECT_PREFIXES = [
  /^assunto\s*:\s*/i,
  /^subject\s*:\s*/i,
];

/** Prefixes to strip from body fields (case-insensitive) */
const BODY_PREFIXES = [
  /^corpo\s*:\s*/i,
  /^corpo do email\s*:\s*/i,
  /^body\s*:\s*/i,
  /^assunto\s*:[^\n]*\n*/i,
  /^subject\s*:[^\n]*\n*/i,
];

/**
 * Strips known LLM prefixes from a generated subject line.
 * Also trims surrounding whitespace and quotes.
 */
export function sanitizeGeneratedSubject(text: string): string {
  let result = text.trim();

  for (const prefix of SUBJECT_PREFIXES) {
    result = result.replace(prefix, "");
  }

  // Remove wrapping quotes if present (e.g., "Subject here" → Subject here)
  if (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1);
  }

  // Remove duplicated RE: prefix (e.g., "RE: RE: Proposta" → "RE: Proposta")
  result = result.replace(/^(RE:\s*)+/i, "RE: ");

  return result.trim();
}

/**
 * Strips known LLM prefixes from a generated body.
 * Also trims surrounding whitespace.
 */
export function sanitizeGeneratedBody(text: string): string {
  let result = text.trim();

  for (const prefix of BODY_PREFIXES) {
    result = result.replace(prefix, "");
  }

  return result.trim();
}

// ==============================================
// TEMPLATE VARIABLE NORMALIZATION (Story 7.5)
// ==============================================

/**
 * Maps common AI-generated variable names (case-insensitive) to the correct
 * Instantly custom_variable format.
 *
 * AI models often output Portuguese names ({{Nome}}, {{Empresa}}) or
 * other variants instead of the exact {{first_name}}, {{company_name}} etc.
 */
const VARIABLE_NORMALIZATION_MAP: Record<string, string> = {
  // first_name
  first_name: "first_name",
  nome: "first_name",
  primeiro_nome: "first_name",
  name: "first_name",
  firstname: "first_name",
  // company_name
  company_name: "company_name",
  empresa: "company_name",
  nome_empresa: "company_name",
  nome_da_empresa: "company_name",
  company: "company_name",
  companyname: "company_name",
  // title
  title: "title",
  cargo: "title",
  job_title: "title",
  jobtitle: "title",
  // ice_breaker
  ice_breaker: "ice_breaker",
  icebreaker: "ice_breaker",
  quebra_gelo: "ice_breaker",
  quebragelo: "ice_breaker",
};

/**
 * Normalizes template variable names in AI-generated text.
 * Replaces known Portuguese/English variants with the correct Instantly format.
 *
 * Example: "Oi {{Nome}}, tudo bem?" → "Oi {{first_name}}, tudo bem?"
 */
export function normalizeTemplateVariables(text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, varName: string) => {
    const key = varName.trim().toLowerCase();
    const normalized = VARIABLE_NORMALIZATION_MAP[key];
    return normalized ? `{{${normalized}}}` : match;
  });
}

/**
 * Ensures {{ice_breaker}} is present in the email body.
 * If the AI didn't include it, injects it after the first paragraph (greeting).
 *
 * Only for initial emails — follow-ups should NOT have ice_breaker.
 */
export function ensureIceBreakerVariable(body: string): string {
  if (body.includes("{{ice_breaker}}")) return body;

  // Find the first paragraph break (double newline)
  const doubleNewline = body.indexOf("\n\n");
  if (doubleNewline !== -1) {
    return (
      body.slice(0, doubleNewline) +
      "\n\n{{ice_breaker}}" +
      body.slice(doubleNewline)
    );
  }

  // Single newline — inject after first line
  const singleNewline = body.indexOf("\n");
  if (singleNewline !== -1) {
    return (
      body.slice(0, singleNewline) +
      "\n\n{{ice_breaker}}" +
      body.slice(singleNewline)
    );
  }

  // No newlines — prepend
  return "{{ice_breaker}}\n\n" + body;
}
