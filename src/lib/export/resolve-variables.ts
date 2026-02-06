/**
 * Variable Resolution Engine
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 * AC: #4 - Motor de substituição resolveEmailVariables(template, lead)
 */

import type { ResolveEmailInput, ResolveEmailOutput } from "@/types/export";
import { getVariables } from "./variable-registry";

/**
 * Regex to match {{variable_name}} patterns
 * Matches double-curly-brace wrapped alphanumeric+underscore names
 */
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Resolve a single template string by replacing {{variables}} with lead values
 * AC: #4 - Variables without values in lead are kept as-is (graceful degradation)
 *
 * @param template - Template string with {{variables}}
 * @param leadData - Record mapping leadField names to values
 * @returns Resolved string
 */
function resolveTemplate(
  template: string,
  leadData: Record<string, string | null | undefined>
): string {
  const variables = getVariables();

  return template.replace(VARIABLE_REGEX, (match, varName: string) => {
    const variable = variables.find((v) => v.name === varName);
    if (!variable) {
      return match;
    }

    const value = leadData[variable.leadField];
    if (value === null || value === undefined || value === "") {
      return match;
    }

    if (typeof value !== "string") {
      return match;
    }

    return value;
  });
}

/**
 * Resolve email variables in both subject and body
 * Story 7.1: AC #4 - Motor de substituição principal
 *
 * @param input - Email subject and body templates with {{variables}}
 * @param lead - Lead-like object with fields matching variable registry leadField mappings
 * @returns Resolved email with variables replaced by lead data
 *
 * Behavior:
 * - Variables with matching lead data → replaced with real values
 * - Variables without lead data → kept as-is (graceful degradation)
 * - Templates without variables → returned unchanged
 * - Unknown variables (not in registry) → kept as-is
 */
export function resolveEmailVariables(
  input: ResolveEmailInput,
  lead: Record<string, unknown>
): ResolveEmailOutput {
  const leadData = lead as Record<string, string | null | undefined>;

  return {
    subject: resolveTemplate(input.subject, leadData),
    body: resolveTemplate(input.body, leadData),
  };
}
