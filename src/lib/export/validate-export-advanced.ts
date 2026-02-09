/**
 * Advanced Unified Export Validation
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1, #2 - Orchestrates email + template + existing validation
 *
 * This is an ADDITIONAL layer on top of existing hook validations
 * (validateInstantlyPreDeploy, validateCsvExport) — not a replacement.
 */

import type { BuilderBlock } from "@/stores/use-builder-store";
import type { ExportPlatform } from "@/types/export";
import type { ExportLeadInfo } from "@/lib/export/validate-pre-deploy";
import { validateLeadEmails } from "@/lib/export/validate-email";
import { validateTemplateVariables } from "@/lib/export/validate-template-variables";

// ==============================================
// TYPES
// ==============================================

export type ValidationIssueType =
  | "no_leads_with_email"
  | "invalid_email"
  | "duplicate_email"
  | "no_email_blocks"
  | "incomplete_block"
  | "no_sending_accounts"
  | "unknown_variable"
  | "malformed_syntax"
  | "no_icebreaker";

export interface ValidationIssue {
  type: ValidationIssueType;
  message: string;
  suggestedAction?: string;
  count?: number;
  details?: string[];
}

export interface ValidationSummary {
  totalLeads: number;
  validLeads: number;
  invalidLeads: number;
  duplicateLeads: number;
  leadsWithoutIcebreaker: number;
  emailBlocks: number;
  completeEmailBlocks: number;
  unknownVariables: number;
}

export interface AdvancedValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: ValidationSummary;
}

interface ValidateExportAdvancedParams {
  blocks: BuilderBlock[];
  leads: ExportLeadInfo[];
  platform: ExportPlatform;
  sendingAccounts?: string[];
}

// ==============================================
// SUGGESTED ACTIONS (PT-BR)
// ==============================================

const SUGGESTED_ACTIONS: Record<ValidationIssueType, string> = {
  no_leads_with_email: "Adicione leads com email à campanha",
  invalid_email: "Corrija os emails inválidos nos leads",
  duplicate_email: "Remova leads duplicados ou verifique os dados",
  no_email_blocks: "Adicione pelo menos 1 email completo à campanha",
  incomplete_block: "Complete o assunto e corpo do email",
  no_sending_accounts: "Selecione uma conta de envio nas opções acima",
  unknown_variable:
    "Verifique o nome da variável. Disponíveis: {{first_name}}, {{company_name}}, {{title}}, {{ice_breaker}}",
  malformed_syntax: "Corrija a sintaxe das variáveis no email",
  no_icebreaker: "Gere icebreakers para esses leads em Meus Leads",
};

// ==============================================
// MAIN FUNCTION
// ==============================================

/**
 * Orchestrate advanced validation combining email, template, and platform checks.
 *
 * Blocking errors (prevent export):
 * - No leads with valid email (except clipboard)
 * - All emails invalid
 * - No complete email blocks
 * - No sending accounts (Instantly only)
 *
 * Non-blocking warnings (allow export):
 * - Invalid emails in list (some valid remain)
 * - Duplicate emails
 * - Unknown template variables
 * - Malformed variable syntax
 * - Leads without icebreaker
 * - Incomplete email blocks
 */
export function validateExportAdvanced(
  params: ValidateExportAdvancedParams
): AdvancedValidationResult {
  const { blocks, leads, platform, sendingAccounts = [] } = params;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const isClipboard = platform === "clipboard";

  // --- Email validation (skip for clipboard) ---
  const emailResult = validateLeadEmails(leads);
  const totalLeads = leads.length;
  const validLeads = emailResult.valid.length;
  const invalidLeads = emailResult.invalid.length;
  const duplicateLeads = emailResult.duplicates.length;

  if (!isClipboard) {
    if (validLeads === 0 && totalLeads > 0) {
      errors.push({
        type: "invalid_email",
        message: "Todos os emails são inválidos. Nenhum lead pode ser exportado.",
        suggestedAction: SUGGESTED_ACTIONS.invalid_email,
        count: invalidLeads,
        details: emailResult.invalid.map((i) => i.reason),
      });
    } else if (validLeads === 0 && totalLeads === 0) {
      errors.push({
        type: "no_leads_with_email",
        message: "Nenhum lead na campanha. Adicione leads antes de exportar.",
        suggestedAction: SUGGESTED_ACTIONS.no_leads_with_email,
      });
    } else if (invalidLeads > 0) {
      warnings.push({
        type: "invalid_email",
        message: `${invalidLeads} lead(s) com email inválido. Serão ignorados no export.`,
        suggestedAction: SUGGESTED_ACTIONS.invalid_email,
        count: invalidLeads,
        details: emailResult.invalid.map((i) => i.reason),
      });
    }

    if (duplicateLeads > 0) {
      warnings.push({
        type: "duplicate_email",
        message: `${duplicateLeads} email(s) duplicado(s) encontrado(s). Apenas a primeira ocorrência será exportada.`,
        suggestedAction: SUGGESTED_ACTIONS.duplicate_email,
        count: duplicateLeads,
      });
    }
  }

  // --- Email blocks validation ---
  const emailBlocks = blocks.filter((b) => b.type === "email");
  const completeEmailBlocks = emailBlocks.filter((b) => {
    const data = b.data as { subject?: string; body?: string };
    return (
      data.subject &&
      data.subject.trim() !== "" &&
      data.body &&
      data.body.trim() !== ""
    );
  });

  if (completeEmailBlocks.length === 0) {
    errors.push({
      type: "no_email_blocks",
      message:
        "Nenhum email completo na campanha. Pelo menos 1 email deve ter assunto e corpo preenchidos.",
      suggestedAction: SUGGESTED_ACTIONS.no_email_blocks,
    });
  }

  const incompleteBlocks = emailBlocks.filter((b) => {
    const data = b.data as { subject?: string; body?: string };
    const hasSubject = data.subject && data.subject.trim() !== "";
    const hasBody = data.body && data.body.trim() !== "";
    return (hasSubject && !hasBody) || (!hasSubject && hasBody);
  });

  if (incompleteBlocks.length > 0) {
    warnings.push({
      type: "incomplete_block",
      message: `${incompleteBlocks.length} email(s) com assunto ou corpo incompleto.`,
      suggestedAction: SUGGESTED_ACTIONS.incomplete_block,
      count: incompleteBlocks.length,
    });
  }

  // --- Sending accounts (Instantly only) ---
  if (platform === "instantly" && sendingAccounts.length === 0) {
    errors.push({
      type: "no_sending_accounts",
      message: "Nenhuma conta de envio selecionada.",
      suggestedAction: SUGGESTED_ACTIONS.no_sending_accounts,
    });
  }

  // --- Template variable validation ---
  const templateResult = validateTemplateVariables(blocks);

  if (templateResult.unknownVariables.length > 0) {
    warnings.push({
      type: "unknown_variable",
      message: `Variável(is) desconhecida(s): ${templateResult.unknownVariables.map((v) => `{{${v}}}`).join(", ")}`,
      suggestedAction: SUGGESTED_ACTIONS.unknown_variable,
      count: templateResult.unknownVariables.length,
      details: templateResult.unknownVariables,
    });
  }

  if (templateResult.malformedSyntax.length > 0) {
    warnings.push({
      type: "malformed_syntax",
      message: templateResult.malformedSyntax[0].text,
      suggestedAction: SUGGESTED_ACTIONS.malformed_syntax,
      count: templateResult.malformedSyntax.length,
    });
  }

  // --- Icebreaker check (skip for clipboard) ---
  const leadsWithoutIcebreakerCount = isClipboard
    ? 0
    : emailResult.valid.filter(
        (l) => !l.icebreaker || l.icebreaker.trim() === ""
      ).length;

  if (!isClipboard && leadsWithoutIcebreakerCount > 0) {
    warnings.push({
      type: "no_icebreaker",
      message: `${leadsWithoutIcebreakerCount} lead(s) sem icebreaker. A variável {{ice_breaker}} ficará vazia.`,
      suggestedAction: SUGGESTED_ACTIONS.no_icebreaker,
      count: leadsWithoutIcebreakerCount,
    });
  }

  const summary: ValidationSummary = {
    totalLeads,
    validLeads,
    invalidLeads,
    duplicateLeads,
    leadsWithoutIcebreaker: leadsWithoutIcebreakerCount,
    emailBlocks: emailBlocks.length,
    completeEmailBlocks: completeEmailBlocks.length,
    unknownVariables: templateResult.unknownVariables.length,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary,
  };
}
