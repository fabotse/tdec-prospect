/**
 * Clipboard Formatting for Campaign Export
 * Story 7.7: Exportação Manual - CSV e Clipboard
 * AC: #3 - Texto estruturado legível para clipboard
 *
 * Formats campaign blocks into a human-readable text template
 * with email subjects, bodies, and delay indicators.
 * Variables like {{first_name}} are kept intact (template mode).
 */

import type { BuilderBlock } from "@/stores/use-builder-store";
import { blocksToInstantlySequences } from "./blocks-to-sequences";

// ==============================================
// TYPES
// ==============================================

export interface FormatClipboardParams {
  blocks: BuilderBlock[];
  campaignName: string;
}

// ==============================================
// MAIN FUNCTION
// ==============================================

/**
 * Format campaign blocks into clipboard-friendly text.
 *
 * Output format:
 * === Campanha: {name} ===
 *
 * --- Email 1 (inicial) ---
 * Assunto: {subject}
 *
 * {body}
 *
 * --- Aguardar N dia(s) ---
 *
 * --- Email 2 (follow-up) ---
 * ...
 */
export function formatCampaignForClipboard(params: FormatClipboardParams): string {
  const { blocks, campaignName } = params;
  const sequences = blocksToInstantlySequences(blocks);

  const parts: string[] = [];

  parts.push(`=== Campanha: ${campaignName} ===`);
  parts.push("");

  for (let i = 0; i < sequences.length; i++) {
    const seq = sequences[i];
    const emailNum = i + 1;
    const label = i === 0 ? "inicial" : "follow-up";

    // Delay separator (before follow-up emails)
    if (i > 0 && seq.delayDays > 0) {
      parts.push(`--- Aguardar ${seq.delayDays} dia(s) ---`);
      parts.push("");
    }

    parts.push(`--- Email ${emailNum} (${label}) ---`);
    parts.push(`Assunto: ${seq.subject}`);
    parts.push("");
    parts.push(seq.body);
    parts.push("");
  }

  return parts.join("\n");
}
