/**
 * CSV/Clipboard Export Validation
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1, #2, #3 - Validação pré-export
 *
 * Validates blocks and leads before CSV or clipboard export.
 * Simpler than Instantly validation — no sending accounts check.
 *
 * Blocking errors:
 * - No leads with valid email (CSV only — clipboard doesn't need leads)
 * - No email blocks with subject AND body
 *
 * Non-blocking warnings:
 * - Leads without icebreaker
 * - Email blocks with subject but no body (or vice-versa)
 */

import type { BuilderBlock } from "@/stores/use-builder-store";
import type { PreDeployValidationResult } from "@/types/export";

// ==============================================
// TYPES
// ==============================================

export interface ExportLeadInfo {
  email: string | null;
  icebreaker?: string | null;
}

interface ValidateCsvExportParams {
  blocks: BuilderBlock[];
  leads: ExportLeadInfo[];
  /** When true, skips lead validation (clipboard only needs blocks) */
  isClipboard?: boolean;
}

// ==============================================
// MAIN FUNCTION
// ==============================================

/**
 * Validate pre-export conditions for CSV/clipboard.
 *
 * @returns PreDeployValidationResult with errors and warnings in PT-BR
 */
export function validateCsvExport(
  params: ValidateCsvExportParams
): PreDeployValidationResult {
  const { blocks, leads, isClipboard = false } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  // M3 fix: compute once, reuse below
  const leadsWithEmail = leads.filter((l) => l.email && l.email.trim() !== "");

  // Check leads with email (skip for clipboard)
  if (!isClipboard) {
    if (leadsWithEmail.length === 0) {
      errors.push("Nenhum lead com email válido. Adicione leads com email à campanha.");
    }
  }

  // Check email blocks with subject AND body
  const emailBlocks = blocks.filter((b) => b.type === "email");
  const completeEmailBlocks = emailBlocks.filter((b) => {
    const data = b.data as { subject?: string; body?: string };
    return data.subject && data.subject.trim() !== "" && data.body && data.body.trim() !== "";
  });

  if (completeEmailBlocks.length === 0) {
    errors.push(
      "Nenhum email completo na campanha. Pelo menos 1 email deve ter assunto e corpo preenchidos."
    );
  }

  // Warnings: leads without icebreaker (only when we have leads)
  if (!isClipboard) {
    const leadsWithoutIcebreaker = leadsWithEmail.filter(
      (l) => !l.icebreaker || l.icebreaker.trim() === ""
    );
    if (leadsWithoutIcebreaker.length > 0) {
      warnings.push(
        `${leadsWithoutIcebreaker.length} lead(s) sem icebreaker. A variável {{ice_breaker}} ficará vazia para esses leads.`
      );
    }
  }

  // Warnings: partial email blocks
  const partialEmailBlocks = emailBlocks.filter((b) => {
    const data = b.data as { subject?: string; body?: string };
    const hasSubject = data.subject && data.subject.trim() !== "";
    const hasBody = data.body && data.body.trim() !== "";
    return (hasSubject && !hasBody) || (!hasSubject && hasBody);
  });
  if (partialEmailBlocks.length > 0) {
    warnings.push(
      `${partialEmailBlocks.length} email(s) com assunto ou corpo incompleto. Serão exportados mesmo assim.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
