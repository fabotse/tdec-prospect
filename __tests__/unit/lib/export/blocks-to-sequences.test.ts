/**
 * Blocks to Instantly Sequences Converter Tests
 * Story 7.5: Export to Instantly - Fluxo Completo
 * AC: #1 - Convert BuilderBlocks to Instantly email sequences
 */

import { describe, it, expect } from "vitest";
import {
  blocksToInstantlySequences,
  DEFAULT_MIN_DELAY_DAYS,
} from "@/lib/export/blocks-to-sequences";
import type { BuilderBlock } from "@/stores/use-builder-store";

function makeEmailBlock(position: number, subject: string, body: string): BuilderBlock {
  return {
    id: `email-${position}`,
    type: "email",
    position,
    data: { subject, body },
  };
}

function makeDelayBlock(position: number, delayValue: number, delayUnit = "days"): BuilderBlock {
  return {
    id: `delay-${position}`,
    type: "delay",
    position,
    data: { delayValue, delayUnit },
  };
}

describe("blocksToInstantlySequences", () => {
  it("should convert a single email block with delayDays=0", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Olá {{first_name}}", "Texto do email"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      subject: "Olá {{first_name}}",
      body: "Texto do email",
      delayDays: 0,
    });
  });

  it("should convert multiple emails with delays between them", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeDelayBlock(1, 3),
      makeEmailBlock(2, "Email 2", "Body 2"),
      makeDelayBlock(3, 2),
      makeEmailBlock(4, "Email 3", "Body 3"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ subject: "Email 1", body: "Body 1", delayDays: 0 });
    expect(result[1]).toEqual({ subject: "Email 2", body: "Body 2", delayDays: 3 });
    expect(result[2]).toEqual({ subject: "Email 3", body: "Body 3", delayDays: 2 });
  });

  it("should return first email with delayDays=0 even if preceded by delay", () => {
    const blocks: BuilderBlock[] = [
      makeDelayBlock(0, 5),
      makeEmailBlock(1, "Primeiro email", "Body"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(1);
    expect(result[0].delayDays).toBe(0);
  });

  it("should accumulate multiple delays between emails", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeDelayBlock(1, 2),
      makeDelayBlock(2, 3),
      makeEmailBlock(3, "Email 2", "Body 2"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(2);
    expect(result[1].delayDays).toBe(5);
  });

  it("should return empty array for no blocks", () => {
    const result = blocksToInstantlySequences([]);
    expect(result).toEqual([]);
  });

  it("should return empty array when only delay blocks exist", () => {
    const blocks: BuilderBlock[] = [
      makeDelayBlock(0, 3),
      makeDelayBlock(1, 2),
    ];

    const result = blocksToInstantlySequences(blocks);
    expect(result).toEqual([]);
  });

  it("should skip email blocks with empty subject AND body", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Valid", "Body"),
      makeDelayBlock(1, 2),
      makeEmailBlock(2, "", ""),
      makeEmailBlock(3, "Also valid", "Body 2"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(2);
    expect(result[0].subject).toBe("Valid");
    expect(result[1].subject).toBe("Also valid");
  });

  it("should preserve variables in subject and body", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Olá {{first_name}} da {{company_name}}", "{{ice_breaker}} Texto."),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result[0].subject).toContain("{{first_name}}");
    expect(result[0].subject).toContain("{{company_name}}");
    expect(result[0].body).toContain("{{ice_breaker}}");
  });

  it("should use DEFAULT_MIN_DELAY_DAYS for follow-ups without delay blocks", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeEmailBlock(1, "Email 2", "Body 2"),
      makeEmailBlock(2, "Email 3", "Body 3"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(3);
    expect(result[0].delayDays).toBe(0); // First email always 0
    expect(result[1].delayDays).toBe(DEFAULT_MIN_DELAY_DAYS); // Default delay
    expect(result[2].delayDays).toBe(DEFAULT_MIN_DELAY_DAYS); // Default delay
  });

  it("should use explicit delay when delay block exists, not default", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeDelayBlock(1, 5),
      makeEmailBlock(2, "Email 2", "Body 2"),
      makeEmailBlock(3, "Email 3", "Body 3"), // No delay block before this
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(3);
    expect(result[0].delayDays).toBe(0);
    expect(result[1].delayDays).toBe(5); // Explicit delay
    expect(result[2].delayDays).toBe(DEFAULT_MIN_DELAY_DAYS); // Default (no delay block)
  });

  it("should export DEFAULT_MIN_DELAY_DAYS as 1", () => {
    expect(DEFAULT_MIN_DELAY_DAYS).toBe(1);
  });

  it("should sort blocks by position regardless of array order", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(2, "Segundo", "B2"),
      makeDelayBlock(1, 3),
      makeEmailBlock(0, "Primeiro", "B1"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(2);
    expect(result[0].subject).toBe("Primeiro");
    expect(result[1].subject).toBe("Segundo");
    expect(result[1].delayDays).toBe(3);
  });

  it("should convert hours to days (ceil to minimum 1 day)", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeDelayBlock(1, 12, "hours"),
      makeEmailBlock(2, "Email 2", "Body 2"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result).toHaveLength(2);
    // 12 hours → ceil(12/24) = 1 day
    expect(result[1].delayDays).toBe(1);
  });

  it("should convert 48 hours to 2 days", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeDelayBlock(1, 48, "hours"),
      makeEmailBlock(2, "Email 2", "Body 2"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result[1].delayDays).toBe(2);
  });

  it("should convert 25 hours to 2 days (rounds up)", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeDelayBlock(1, 25, "hours"),
      makeEmailBlock(2, "Email 2", "Body 2"),
    ];

    const result = blocksToInstantlySequences(blocks);

    // ceil(25/24) = 2
    expect(result[1].delayDays).toBe(2);
  });

  it("should treat unit=days as-is (no conversion)", () => {
    const blocks: BuilderBlock[] = [
      makeEmailBlock(0, "Email 1", "Body 1"),
      makeDelayBlock(1, 5, "days"),
      makeEmailBlock(2, "Email 2", "Body 2"),
    ];

    const result = blocksToInstantlySequences(blocks);

    expect(result[1].delayDays).toBe(5);
  });
});
