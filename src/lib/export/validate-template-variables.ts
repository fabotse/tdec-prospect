/**
 * Template Variable Validation for Export
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1 - Validates {{variables}} in email blocks against variable registry
 */

import type { BuilderBlock } from "@/stores/use-builder-store";
import { getVariables } from "@/lib/export/variable-registry";

// ==============================================
// TYPES
// ==============================================

export interface TemplateVariableValidation {
  validVariables: string[];
  unknownVariables: string[];
  malformedSyntax: Array<{ block: number; text: string }>;
}

// ==============================================
// REGEX
// ==============================================

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;
const OPEN_BRACE_REGEX = /\{\{(?![^{}]*\}\})/;
const CLOSE_BRACE_REGEX = /(?<!\{\{[^{}]*)\}\}/;

// ==============================================
// MAIN FUNCTION
// ==============================================

/**
 * Validate template variables in email blocks.
 *
 * - Extracts all {{variable}} patterns from subject and body
 * - Checks each against the variable registry
 * - Detects malformed syntax (unmatched {{ or }})
 */
export function validateTemplateVariables(
  blocks: BuilderBlock[]
): TemplateVariableValidation {
  const registeredNames = new Set(getVariables().map((v) => v.name));
  const validSet = new Set<string>();
  const unknownSet = new Set<string>();
  const malformedSyntax: Array<{ block: number; text: string }> = [];

  const emailBlocks = blocks.filter((b) => b.type === "email");

  emailBlocks.forEach((block, index) => {
    const data = block.data as { subject?: string; body?: string };
    const blockNumber = index + 1;
    const textsToCheck = [data.subject, data.body].filter(Boolean) as string[];

    for (const text of textsToCheck) {
      // Extract valid {{variable}} patterns
      let match: RegExpExecArray | null;
      const regex = new RegExp(VARIABLE_REGEX.source, "g");
      while ((match = regex.exec(text)) !== null) {
        const varName = match[1];
        if (registeredNames.has(varName)) {
          validSet.add(varName);
        } else {
          unknownSet.add(varName);
        }
      }

      // Check for malformed syntax: {{ without matching }}
      const withoutValid = text.replace(VARIABLE_REGEX, "");
      if (OPEN_BRACE_REGEX.test(withoutValid)) {
        malformedSyntax.push({
          block: blockNumber,
          text: `Sintaxe malformada no Email ${blockNumber}: chaves não fechadas`,
        });
      }

      if (CLOSE_BRACE_REGEX.test(withoutValid)) {
        malformedSyntax.push({
          block: blockNumber,
          text: `Sintaxe malformada no Email ${blockNumber}: chaves não fechadas`,
        });
      }
    }
  });

  return {
    validVariables: [...validSet],
    unknownVariables: [...unknownSet],
    malformedSyntax,
  };
}
