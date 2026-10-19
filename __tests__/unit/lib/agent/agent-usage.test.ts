/**
 * Unit Tests for agent-usage (log de uso do agente + proxy do provider)
 * Story 24.10 - Custo real e estimativa honesta
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogApiUsage = vi.fn();
vi.mock("@/lib/services/usage-logger", () => ({
  logApiUsage: (...args: unknown[]) => mockLogApiUsage(...args),
}));

import { logAgentUsage, trackProviderUsage } from "@/lib/agent/agent-usage";
import type { AIProvider } from "@/lib/ai/providers/base-provider";

describe("agent-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogApiUsage.mockResolvedValue(undefined);
  });

  describe("logAgentUsage", () => {
    it("leva tenantId e metadata.executionId/stepType/calls/source", async () => {
      await logAgentUsage({
        tenantId: "tenant-1",
        executionId: "exec-1",
        stepType: "search_companies",
        serviceName: "theirstack",
        requestType: "company_search",
        status: "success",
        calls: 1,
        durationMs: 10,
        metadata: { companies: 2 },
      });

      expect(mockLogApiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          serviceName: "theirstack",
          requestType: "company_search",
          status: "success",
          durationMs: 10,
          metadata: {
            companies: 2,
            calls: 1,
            source: "agent",
            executionId: "exec-1",
            stepType: "search_companies",
          },
        })
      );
    });

    it("sem executionId nao grava a chave", async () => {
      await logAgentUsage({
        tenantId: "tenant-1",
        serviceName: "openai",
        requestType: "briefing_parse",
        status: "success",
        calls: 1,
      });
      const metadata = mockLogApiUsage.mock.calls[0][0].metadata;
      expect(metadata).not.toHaveProperty("executionId");
    });

    it("nunca lanca", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockLogApiUsage.mockRejectedValue(new Error("boom"));

      await expect(
        logAgentUsage({
          tenantId: "t",
          serviceName: "apollo",
          requestType: "people_search",
          status: "success",
          calls: 1,
        })
      ).resolves.toBeUndefined();
      errorSpy.mockRestore();
    });
  });

  describe("trackProviderUsage", () => {
    function fakeProvider(impl: (prompt: string) => Promise<unknown>) {
      return {
        providerName: "fake",
        generateText: vi.fn(impl),
        getModelConfig: vi.fn(() => ({ provider: "openai" })),
      } as unknown as AIProvider;
    }

    it("conta chamadas, tokens e modelos sem mudar o retorno", async () => {
      const base = fakeProvider(async (prompt) => ({
        text: `ok:${prompt}`,
        model: prompt === "a" ? "gpt-4o" : "gpt-4o-mini",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }));
      const { provider, getUsage } = trackProviderUsage(base);

      const r1 = await provider.generateText("a");
      await provider.generateText("b", { maxTokens: 10 });

      expect(r1.text).toBe("ok:a");
      expect(base.generateText).toHaveBeenCalledWith("b", { maxTokens: 10 });
      expect(getUsage()).toEqual({
        calls: 2,
        failedCalls: 0,
        promptTokens: 20,
        completionTokens: 10,
        models: ["gpt-4o", "gpt-4o-mini"],
      });
    });

    it("conta a chamada que falhou e repassa o erro", async () => {
      const base = fakeProvider(async () => {
        throw new Error("timeout");
      });
      const { provider, getUsage } = trackProviderUsage(base);

      await expect(provider.generateText("x")).rejects.toThrow("timeout");
      expect(getUsage()).toMatchObject({ calls: 1, failedCalls: 1, promptTokens: 0 });
    });

    it("demais membros passam direto", () => {
      const base = fakeProvider(async () => ({ text: "", model: "m" }));
      const { provider } = trackProviderUsage(base);
      expect(provider.providerName).toBe("fake");
      provider.getModelConfig();
      expect(base.getModelConfig).toHaveBeenCalled();
    });
  });
});
