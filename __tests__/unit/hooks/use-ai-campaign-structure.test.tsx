/**
 * useAICampaignStructure Hook Tests
 * Story 6.12: AI Campaign Structure Generation
 *
 * AC #3 - Structure generation
 * AC #5 - Error handling
 * AC #6 - emailMode assignment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useAICampaignStructure,
  convertStructureToBlocks,
  parseAIResponse,
  type AIStructureItem,
  type AIStructureResponse,
  GENERATION_TIMEOUT_MS,
} from "@/hooks/use-ai-campaign-structure";

// Mock crypto.randomUUID
const mockUUID = vi.fn();
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => {
    mockUUID();
    return `test-uuid-${++uuidCounter}`;
  },
});

// Create wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useAICampaignStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==============================================
  // convertStructureToBlocks tests (AC #3, #6)
  // ==============================================
  describe("convertStructureToBlocks", () => {
    it("converts email items to BuilderBlock format", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email", context: "Initial outreach", emailMode: "initial" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "email",
        position: 0,
        data: {
          subject: "",
          body: "",
          emailMode: "initial",
          strategicContext: "Initial outreach",
        },
      });
      expect(blocks[0].id).toBe("test-uuid-1");
    });

    it("converts delay items to BuilderBlock format", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "delay", days: 3 },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: "delay",
        position: 0,
        data: {
          delayValue: 3,
          delayUnit: "days",
        },
      });
    });

    it("handles mixed email and delay items", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email", context: "Email 1", emailMode: "initial" },
        { position: 1, type: "delay", days: 2 },
        { position: 2, type: "email", context: "Email 2", emailMode: "follow-up" },
        { position: 3, type: "delay", days: 3 },
        { position: 4, type: "email", context: "Email 3", emailMode: "follow-up" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks).toHaveLength(5);
      expect(blocks[0].type).toBe("email");
      expect(blocks[1].type).toBe("delay");
      expect(blocks[2].type).toBe("email");
      expect(blocks[3].type).toBe("delay");
      expect(blocks[4].type).toBe("email");
    });

    it("defaults emailMode to 'initial' when not provided", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email", context: "Test" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks[0].data.emailMode).toBe("initial");
    });

    it("defaults delayValue to 3 when days not provided", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "delay" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks[0].data.delayValue).toBe(3);
    });

    it("defaults strategicContext to empty string when context not provided", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks[0].data.strategicContext).toBe("");
    });

    it("preserves follow-up emailMode (AC #6)", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email", emailMode: "initial" },
        { position: 1, type: "delay", days: 2 },
        { position: 2, type: "email", emailMode: "follow-up" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks[0].data.emailMode).toBe("initial");
      expect(blocks[2].data.emailMode).toBe("follow-up");
    });
  });

  // ==============================================
  // parseAIResponse tests (AC #3)
  // ==============================================
  describe("parseAIResponse", () => {
    it("parses valid JSON response", () => {
      const response = JSON.stringify({
        structure: {
          totalEmails: 4,
          totalDays: 9,
          items: [
            { position: 0, type: "email", context: "First", emailMode: "initial" },
            { position: 1, type: "delay", days: 3 },
            { position: 2, type: "email", context: "Second", emailMode: "follow-up" },
            { position: 3, type: "delay", days: 3 },
            { position: 4, type: "email", context: "Third", emailMode: "follow-up" },
            { position: 5, type: "delay", days: 3 },
            { position: 6, type: "email", context: "Fourth", emailMode: "follow-up" },
          ],
        },
        rationale: "Test rationale",
      });

      const result = parseAIResponse(response);

      expect(result.structure.totalEmails).toBe(4);
      expect(result.structure.totalDays).toBe(9);
      expect(result.structure.items).toHaveLength(7);
      expect(result.rationale).toBe("Test rationale");
    });

    it("removes markdown code blocks from response", () => {
      const response = `\`\`\`json
{
  "structure": {
    "totalEmails": 3,
    "totalDays": 6,
    "items": [
      { "position": 0, "type": "email", "context": "First", "emailMode": "initial" },
      { "position": 1, "type": "delay", "days": 3 },
      { "position": 2, "type": "email", "context": "Second", "emailMode": "follow-up" },
      { "position": 3, "type": "delay", "days": 3 },
      { "position": 4, "type": "email", "context": "Third", "emailMode": "follow-up" }
    ]
  },
  "rationale": "Test"
}
\`\`\``;

      const result = parseAIResponse(response);

      expect(result.structure.totalEmails).toBe(3);
    });

    it("removes plain code blocks without json tag", () => {
      const response = `\`\`\`
{
  "structure": {
    "totalEmails": 3,
    "totalDays": 6,
    "items": [
      { "position": 0, "type": "email" },
      { "position": 1, "type": "delay", "days": 3 },
      { "position": 2, "type": "email" },
      { "position": 3, "type": "delay", "days": 3 },
      { "position": 4, "type": "email" }
    ]
  },
  "rationale": "Test"
}
\`\`\``;

      const result = parseAIResponse(response);

      expect(result.structure.totalEmails).toBe(3);
    });

    it("throws error for invalid JSON", () => {
      expect(() => parseAIResponse("not valid json")).toThrow();
    });

    it("throws error when structure is missing", () => {
      const response = JSON.stringify({ rationale: "Test" });

      expect(() => parseAIResponse(response)).toThrow("Estrutura invalida na resposta da IA");
    });

    it("throws error when items array is missing", () => {
      const response = JSON.stringify({
        structure: { totalEmails: 3, totalDays: 6 },
        rationale: "Test",
      });

      expect(() => parseAIResponse(response)).toThrow("Estrutura invalida na resposta da IA");
    });

    it("throws error when fewer than 3 emails", () => {
      const response = JSON.stringify({
        structure: {
          totalEmails: 2,
          totalDays: 3,
          items: [
            { position: 0, type: "email" },
            { position: 1, type: "delay", days: 3 },
            { position: 2, type: "email" },
          ],
        },
        rationale: "Test",
      });

      expect(() => parseAIResponse(response)).toThrow("A IA gerou menos de 3 emails");
    });

    it("throws error when more than 7 emails", () => {
      const items: AIStructureItem[] = [];
      for (let i = 0; i < 8; i++) {
        items.push({ position: i * 2, type: "email" });
        if (i < 7) {
          items.push({ position: i * 2 + 1, type: "delay", days: 2 });
        }
      }

      const response = JSON.stringify({
        structure: {
          totalEmails: 8,
          totalDays: 14,
          items,
        },
        rationale: "Test",
      });

      expect(() => parseAIResponse(response)).toThrow("A IA gerou mais de 7 emails");
    });
  });

  // ==============================================
  // Hook tests (AC #3, #5)
  // ==============================================
  describe("Hook", () => {
    it("starts with initial state", () => {
      const { result } = renderHook(() => useAICampaignStructure(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("generates structure successfully (AC #3)", async () => {
      const mockResponse: AIStructureResponse = {
        structure: {
          totalEmails: 4,
          totalDays: 9,
          items: [
            { position: 0, type: "email", context: "First", emailMode: "initial" },
            { position: 1, type: "delay", days: 3 },
            { position: 2, type: "email", context: "Second", emailMode: "follow-up" },
            { position: 3, type: "delay", days: 3 },
            { position: 4, type: "email", context: "Third", emailMode: "follow-up" },
            { position: 5, type: "delay", days: 3 },
            { position: 6, type: "email", context: "Fourth", emailMode: "follow-up" },
          ],
        },
        rationale: "Test rationale",
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { text: JSON.stringify(mockResponse) },
          }),
      });

      const { result } = renderHook(() => useAICampaignStructure(), {
        wrapper: createWrapper(),
      });

      let generated: Awaited<ReturnType<typeof result.current.generate>>;

      await act(async () => {
        generated = await result.current.generate({
          productId: "product-1",
          objective: "cold_outreach",
          description: "Test description",
          tone: "formal",
          urgency: "medium",
        });
      });

      expect(generated!.blocks).toHaveLength(7);
      expect(generated!.totalEmails).toBe(4);
      expect(generated!.totalDays).toBe(9);
      expect(generated!.rationale).toBe("Test rationale");
    });

    it("handles API error response (AC #5)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "API Error" },
          }),
      });

      const { result } = renderHook(() => useAICampaignStructure(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.generate({
            productId: null,
            objective: "cold_outreach",
            description: "",
            tone: "casual",
            urgency: "medium",
          });
        })
      ).rejects.toThrow("API Error");

      await waitFor(() => {
        expect(result.current.error).toBe("API Error");
      });
    });

    it("handles invalid server response (AC #5)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: { message: "Server error" },
          }),
      });

      const { result } = renderHook(() => useAICampaignStructure(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.generate({
            productId: null,
            objective: "cold_outreach",
            description: "",
            tone: "casual",
            urgency: "medium",
          });
        })
      ).rejects.toThrow("Server error");

      await waitFor(() => {
        expect(result.current.error).toBe("Server error");
      });
    });

    it("handles JSON parse error (AC #5)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { text: "not valid json" },
          }),
      });

      const { result } = renderHook(() => useAICampaignStructure(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.generate({
            productId: null,
            objective: "cold_outreach",
            description: "",
            tone: "casual",
            urgency: "medium",
          });
        })
      ).rejects.toThrow("A IA retornou um formato invalido");

      await waitFor(() => {
        expect(result.current.error).toBe("A IA retornou um formato invalido. Tente novamente.");
      });
    });

    it("resets error state", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Test error" } }),
      });

      const { result } = renderHook(() => useAICampaignStructure(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.generate({
            productId: null,
            objective: "cold_outreach",
            description: "",
            tone: "casual",
            urgency: "medium",
          });
        })
      ).rejects.toThrow();

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });

    it("sends correct parameters to API", async () => {
      const mockResponse: AIStructureResponse = {
        structure: {
          totalEmails: 3,
          totalDays: 6,
          items: [
            { position: 0, type: "email", emailMode: "initial" },
            { position: 1, type: "delay", days: 3 },
            { position: 2, type: "email", emailMode: "follow-up" },
            { position: 3, type: "delay", days: 3 },
            { position: 4, type: "email", emailMode: "follow-up" },
          ],
        },
        rationale: "Test",
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { text: JSON.stringify(mockResponse) },
          }),
      });

      const { result } = renderHook(() => useAICampaignStructure(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generate({
          productId: "product-123",
          objective: "reengagement",
          description: "Win back customers",
          tone: "casual",
          urgency: "high",
        });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/ai/campaign-structure",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: "product-123",
            objective: "reengagement",
            description: "Win back customers",
            tone: "casual",
            urgency: "high",
          }),
        })
      );
    });
  });

  // ==============================================
  // emailMode assignment tests (AC #6)
  // ==============================================
  describe("emailMode Assignment (AC #6)", () => {
    it("preserves initial emailMode for first email", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email", emailMode: "initial" },
        { position: 1, type: "delay", days: 2 },
        { position: 2, type: "email", emailMode: "follow-up" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks[0].data.emailMode).toBe("initial");
    });

    it("preserves follow-up emailMode for subsequent emails", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email", emailMode: "initial" },
        { position: 1, type: "delay", days: 2 },
        { position: 2, type: "email", emailMode: "follow-up" },
        { position: 3, type: "delay", days: 3 },
        { position: 4, type: "email", emailMode: "follow-up" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks[2].data.emailMode).toBe("follow-up");
      expect(blocks[4].data.emailMode).toBe("follow-up");
    });

    it("handles all emails as initial (cold_outreach objective)", () => {
      const items: AIStructureItem[] = [
        { position: 0, type: "email", emailMode: "initial" },
        { position: 1, type: "delay", days: 2 },
        { position: 2, type: "email", emailMode: "initial" },
        { position: 3, type: "delay", days: 3 },
        { position: 4, type: "email", emailMode: "initial" },
      ];

      const blocks = convertStructureToBlocks(items);

      expect(blocks[0].data.emailMode).toBe("initial");
      expect(blocks[2].data.emailMode).toBe("initial");
      expect(blocks[4].data.emailMode).toBe("initial");
    });
  });
});
