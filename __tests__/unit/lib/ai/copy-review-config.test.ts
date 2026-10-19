/**
 * Copy Review Config Tests — Story 24.9
 */

import { describe, it, expect } from "vitest";
import {
  REVIEWER_MODEL,
  MAX_REWRITES,
  buildReviewerRequest,
  calculateReviewCost,
} from "@/lib/ai/copy-review-config";

describe("copy-review-config", () => {
  it("usa gpt-5.4-mini e no maximo 2 reescritas", () => {
    expect(REVIEWER_MODEL).toBe("gpt-5.4-mini");
    expect(MAX_REWRITES).toBe(2);
  });

  it("buildReviewerRequest usa json_object e omite temperature no gpt-5", () => {
    const req = buildReviewerRequest([{ role: "user", content: "oi" }]);
    expect(req.model).toBe("gpt-5.4-mini");
    expect(req.response_format).toEqual({ type: "json_object" });
    expect(req).not.toHaveProperty("temperature");
    expect(req.messages).toEqual([{ role: "user", content: "oi" }]);
  });

  it("calculateReviewCost usa $0,75 de entrada e $4,50 de saida por 1M", () => {
    expect(calculateReviewCost(1_000_000, 0)).toBeCloseTo(0.75);
    expect(calculateReviewCost(0, 1_000_000)).toBeCloseTo(4.5);
    expect(calculateReviewCost(1000, 500)).toBeCloseTo(0.00075 + 0.00225);
    expect(calculateReviewCost(0, 0)).toBe(0);
  });
});
