/**
 * Pre-Deploy Validation for Instantly Export
 * Story 7.5: Export to Instantly - Fluxo Completo
 * AC: #4 - Validate before starting export
 *
 * Checks blocking errors (must fix before export) and
 * non-blocking warnings (can continue but user should know).
 */

import type { BuilderBlock } from "@/stores/use-builder-store";
import type { PreDeployValidationResult } from "@/types/export";

export interface ExportLeadInfo {
  email: string | null;
  icebreaker?: string | null;
}

interface ValidatePreDeployParams {
  blocks: BuilderBlock[];
  leads: ExportLeadInfo[];
  sendingAccounts: string[];
}

/**
 * Validate pre-deploy conditions for Instantly export.
 *
 * Blocking errors (prevent export):
 * - No leads with valid email
 * - No email blocks with subject AND body
 * - No sending account selected
 *
 * Non-blocking warnings (allow export with notice):
 * - Leads without icebreaker
 * - Email blocks with subject but no body or vice-versa
 *
 * @returns PreDeployValidationResult with errors and warnings in PT-BR
 */
export function validateInstantlyPreDeploy(
  params: ValidatePreDeployParams
): PreDeployValidationResult {
  const { blocks, leads, sendingAccounts } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check leads with email
  const leadsWithEmail = leads.filter((l) => l.email && l.email.trim() !== "");
  if (leadsWithEmail.length === 0) {
    errors.push("Nenhum lead com email válido. Adicione leads com email à campanha.");
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

  // Check sending accounts
  if (sendingAccounts.length === 0) {
    errors.push("Nenhuma sending account selecionada. Selecione pelo menos 1 conta de envio.");
  }

  // Warnings: leads without icebreaker
  const leadsWithoutIcebreaker = leadsWithEmail.filter(
    (l) => !l.icebreaker || l.icebreaker.trim() === ""
  );
  if (leadsWithoutIcebreaker.length > 0) {
    warnings.push(
      `${leadsWithoutIcebreaker.length} lead(s) sem icebreaker. A variável {{ice_breaker}} ficará vazia para esses leads.`
    );
  }

  // Warnings: partial email blocks (subject but no body, or body but no subject)
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
