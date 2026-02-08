/**
 * Blocks to Instantly Sequences Converter
 * Story 7.5: Export to Instantly - Fluxo Completo
 * AC: #1 - Convert BuilderBlocks to Instantly email sequences
 *
 * Traverses blocks in position order, extracts email subject+body,
 * accumulates delay days from delay blocks between emails.
 * First email always has delayDays=0.
 */

import type { BuilderBlock } from "@/stores/use-builder-store";

export interface InstantlySequenceEmail {
  subject: string;
  body: string;
  delayDays: number;
}

/**
 * Minimum delay (in days) between follow-up emails when no delay block exists.
 * Prevents all follow-ups from being sent on the same day.
 */
export const DEFAULT_MIN_DELAY_DAYS = 1;

/**
 * Convert BuilderBlocks into Instantly-compatible email sequences.
 *
 * Rules:
 * - Blocks are sorted by position
 * - Each email block becomes one sequence entry
 * - Delay blocks between emails accumulate into the NEXT email's delayDays
 * - First email always has delayDays=0
 * - Follow-up emails default to DEFAULT_MIN_DELAY_DAYS if no delay blocks exist
 * - Email blocks without subject AND body are skipped
 *
 * @param blocks - BuilderBlocks from the campaign builder
 * @returns Array of email sequences for Instantly, empty if no valid emails
 */
export function blocksToInstantlySequences(
  blocks: BuilderBlock[]
): InstantlySequenceEmail[] {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);
  const sequences: InstantlySequenceEmail[] = [];
  let accumulatedDelay = 0;
  let hasDelayBlock = false;

  for (const block of sorted) {
    if (block.type === "delay") {
      const delayData = block.data as { delayValue?: number; delayUnit?: string };
      const value = delayData.delayValue ?? 0;
      const unit = delayData.delayUnit ?? "days";
      // Convert to days — Instantly API expects delay in days
      const valueInDays = unit === "hours" ? Math.max(1, Math.ceil(value / 24)) : value;
      accumulatedDelay += valueInDays;
      hasDelayBlock = true;
    } else if (block.type === "email") {
      const emailData = block.data as { subject?: string; body?: string };
      const subject = emailData.subject ?? "";
      const body = emailData.body ?? "";

      // Skip email blocks without subject AND body
      if (!subject && !body) continue;

      const isFirstEmail = sequences.length === 0;
      // Use accumulated delay, or default minimum for follow-ups without delay blocks
      const delayDays = isFirstEmail
        ? 0
        : hasDelayBlock
          ? accumulatedDelay
          : DEFAULT_MIN_DELAY_DAYS;

      sequences.push({ subject, body, delayDays });
      accumulatedDelay = 0;
      hasDelayBlock = false;
    }
  }

  return sequences;
}
