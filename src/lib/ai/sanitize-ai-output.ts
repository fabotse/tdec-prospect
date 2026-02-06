/**
 * AI Output Sanitization
 *
 * Removes common prefixes that LLMs sometimes include in their output
 * (e.g., "Assunto: ...", "Corpo: ...") even when explicitly told not to.
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
