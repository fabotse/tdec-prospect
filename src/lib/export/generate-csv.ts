/**
 * CSV Content Generation
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #1 - CSV com variáveis resolvidas (dados reais por lead)
 * AC: #2 - CSV com variáveis mantidas (templates {{...}})
 *
 * Generates CSV content string from campaign blocks and leads.
 * Supports two modes:
 * - resolveVariables: true → replaces {{variables}} with real lead data
 * - resolveVariables: false → keeps {{variables}} intact in email templates
 */

import type { BuilderBlock } from "@/stores/use-builder-store";
import { blocksToInstantlySequences } from "./blocks-to-sequences";
import { resolveEmailVariables } from "./resolve-variables";

// ==============================================
// TYPES
// ==============================================

export interface ExportLeadData {
  email: string | null;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  title?: string;
  icebreaker?: string;
}

export interface GenerateCsvParams {
  blocks: BuilderBlock[];
  leads: ExportLeadData[];
  campaignName: string;
  resolveVariables: boolean;
}

// ==============================================
// CSV ESCAPING (RFC 4180)
// ==============================================

/**
 * Escape a field value for CSV output per RFC 4180.
 * Wraps in double quotes if field contains comma, double quote, or newline.
 * Internal double quotes are escaped by doubling them.
 */
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ==============================================
// LEAD DATA TO CSV MAPPING
// ==============================================

/**
 * Map lead data to the lead-specific CSV columns.
 * Order: email, first_name, company_name, title, ice_breaker
 */
function leadToCsvFields(lead: ExportLeadData): string[] {
  return [
    lead.email ?? "",
    lead.firstName ?? "",
    lead.companyName ?? "",
    lead.title ?? "",
    lead.icebreaker ?? "",
  ];
}

/**
 * Map lead to a record for variable resolution.
 * Uses the same field names as the variable registry (leadField).
 */
function leadToResolveRecord(lead: ExportLeadData): Record<string, string | null | undefined> {
  return {
    firstName: lead.firstName,
    companyName: lead.companyName,
    title: lead.title,
    icebreaker: lead.icebreaker,
  };
}

// ==============================================
// MAIN FUNCTION
// ==============================================

/**
 * Generate CSV content from campaign blocks and leads.
 *
 * Header format (dynamic based on email count):
 * email,first_name,company_name,title,ice_breaker,subject_1,body_1,delay_days_1,...
 *
 * @returns CSV string with BOM UTF-8 prefix, CRLF line endings
 */
export function generateCsvContent(params: GenerateCsvParams): string {
  const { blocks, leads, resolveVariables } = params;

  // Extract email sequences from blocks
  const sequences = blocksToInstantlySequences(blocks);

  // Build header
  const leadColumns = ["email", "first_name", "company_name", "title", "ice_breaker"];
  const emailColumns: string[] = [];
  for (let i = 0; i < sequences.length; i++) {
    const n = i + 1;
    emailColumns.push(`subject_${n}`, `body_${n}`, `delay_days_${n}`);
  }
  const header = [...leadColumns, ...emailColumns].join(",");

  // Filter leads without email
  const validLeads = leads.filter((l) => l.email && l.email.trim() !== "");

  // Build data rows
  const rows: string[] = [];
  for (const lead of validLeads) {
    const leadFields = leadToCsvFields(lead).map(escapeCsvField);
    const emailFields: string[] = [];

    for (const seq of sequences) {
      if (resolveVariables) {
        // Resolve variables with real lead data
        const resolved = resolveEmailVariables(
          { subject: seq.subject, body: seq.body },
          leadToResolveRecord(lead) as Record<string, unknown>
        );
        emailFields.push(
          escapeCsvField(resolved.subject),
          escapeCsvField(resolved.body),
          String(seq.delayDays)
        );
      } else {
        // Keep variables intact
        emailFields.push(
          escapeCsvField(seq.subject),
          escapeCsvField(seq.body),
          String(seq.delayDays)
        );
      }
    }

    rows.push([...leadFields, ...emailFields].join(","));
  }

  // Assemble CSV with BOM + CRLF
  const BOM = "\uFEFF";
  const lines = [header, ...rows];
  return BOM + lines.join("\r\n") + "\r\n";
}
