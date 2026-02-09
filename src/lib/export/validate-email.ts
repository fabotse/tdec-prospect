/**
 * Email Validation for Export
 * Story 7.8: Validacao Pre-Export e Error Handling
 * AC: #1 - Validates email format (RFC basic) and detects duplicates
 */

import type { ExportLeadInfo } from "@/lib/export/validate-pre-deploy";

// ==============================================
// TYPES
// ==============================================

export interface EmailValidationResult {
  valid: ExportLeadInfo[];
  invalid: Array<{ lead: ExportLeadInfo; reason: string }>;
  duplicates: ExportLeadInfo[];
}

// ==============================================
// VALIDATION FUNCTIONS
// ==============================================

/**
 * Validate email format using simplified RFC 5322 regex.
 * Sufficient for detecting obviously invalid emails.
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.trim() === "") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate all lead emails: format check + duplicate detection (case-insensitive, trim).
 *
 * - No email / empty: added to `invalid`
 * - Invalid format: added to `invalid` with PT-BR reason
 * - Duplicates: first occurrence kept in `valid`, subsequent in `duplicates`
 */
export function validateLeadEmails(
  leads: ExportLeadInfo[]
): EmailValidationResult {
  const valid: ExportLeadInfo[] = [];
  const invalid: Array<{ lead: ExportLeadInfo; reason: string }> = [];
  const duplicates: ExportLeadInfo[] = [];

  const seenEmails = new Map<string, number>();

  for (const lead of leads) {
    if (!lead.email || lead.email.trim() === "") {
      invalid.push({ lead, reason: "Email não informado" });
      continue;
    }

    const trimmed = lead.email.trim();

    if (!isValidEmail(trimmed)) {
      invalid.push({ lead, reason: `Email inválido: ${trimmed}` });
      continue;
    }

    const normalized = trimmed.toLowerCase();
    const count = seenEmails.get(normalized) || 0;
    seenEmails.set(normalized, count + 1);

    if (count > 0) {
      duplicates.push(lead);
    } else {
      valid.push(lead);
    }
  }

  return { valid, invalid, duplicates };
}
