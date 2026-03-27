/**
 * Unit Tests for client-utils
 * Story 17.7 - AC #6
 *
 * Tests: triggerNextStep guard logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerNextStep } from "@/lib/agent/client-utils";

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("triggerNextStep (Story 17.7 - AC #6)", () => {
  it("triggers next step when not at last step", async () => {
    await triggerNextStep("exec-001", 2, 5);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/executions/exec-001/steps/3/execute",
      { method: "POST" }
    );
  });

  it("does NOT trigger when at last step", async () => {
    const result = await triggerNextStep("exec-001", 5, 5);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("does NOT trigger when currentStep > totalSteps", async () => {
    const result = await triggerNextStep("exec-001", 6, 5);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("triggers step 2 after step 1 of 3", async () => {
    await triggerNextStep("exec-001", 1, 3);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/agent/executions/exec-001/steps/2/execute",
      { method: "POST" }
    );
  });
});
