/**
 * useAIGenerate Hook Tests
 * Story: 6.2 - AI Text Generation in Builder
 *
 * AC: #1 - Generate email text using AI
 * AC: #2 - Error handling with retry
 * AC: #3 - Streaming UI experience
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAIGenerate, DEFAULT_GENERATION_VARIABLES, GENERATION_TIMEOUT_MS } from "@/hooks/use-ai-generate";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Helper to create a mock streaming response
 */
function createStreamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        const sseData = `data: ${JSON.stringify({ text: chunks[chunkIndex] })}\n\n`;
        controller.enqueue(encoder.encode(sseData));
        chunkIndex++;
      } else {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return {
    ok: true,
    body: stream,
    headers: new Headers({ "Content-Type": "text/event-stream" }),
  };
}

describe("useAIGenerate", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("provides generate function and initial state (AC #1)", () => {
      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      expect(typeof result.current.generate).toBe("function");
      expect(typeof result.current.reset).toBe("function");
      expect(typeof result.current.cancel).toBe("function");
      expect(result.current.phase).toBe("idle");
      expect(result.current.text).toBe("");
      expect(result.current.error).toBeNull();
      expect(result.current.isGenerating).toBe(false);
    });
  });

  describe("Streaming Generation (AC #3)", () => {
    it("streams text progressively", async () => {
      const chunks = ["Olá ", "João", ", como vai?"];
      mockFetch.mockResolvedValueOnce(createStreamingResponse(chunks));

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generate({
          promptKey: "email_subject_generation",
          variables: DEFAULT_GENERATION_VARIABLES,
        });
      });

      await waitFor(() => {
        expect(result.current.phase).toBe("done");
      });

      expect(result.current.text).toBe("Olá João, como vai?");
    });

    it("tracks phases correctly: idle → generating → streaming → done", async () => {
      const chunks = ["Hello"];
      const response = createStreamingResponse(chunks);

      // Delay the response to capture phases
      let resolveResponse: (value: unknown) => void;
      const responsePromise = new Promise((resolve) => {
        resolveResponse = resolve;
      });

      mockFetch.mockImplementationOnce(() => responsePromise);

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      expect(result.current.phase).toBe("idle");

      // Start generation
      let generatePromise: Promise<string>;
      act(() => {
        generatePromise = result.current.generate({
          promptKey: "email_body_generation",
          variables: {},
        });
      });

      // Should transition to generating
      await waitFor(() => {
        expect(result.current.phase).toBe("generating");
      });

      // Resolve with streaming response
      await act(async () => {
        resolveResponse!(response);
        await generatePromise;
      });

      await waitFor(() => {
        expect(result.current.phase).toBe("done");
      });
    });

    it("sets isGenerating true during generation and streaming", async () => {
      let resolveResponse: (value: unknown) => void;
      const responsePromise = new Promise((resolve) => {
        resolveResponse = resolve;
      });

      mockFetch.mockImplementationOnce(() => responsePromise);

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isGenerating).toBe(false);

      act(() => {
        result.current.generate({
          promptKey: "email_subject_generation",
          variables: {},
        });
      });

      await waitFor(() => {
        expect(result.current.isGenerating).toBe(true);
      });

      // Resolve
      await act(async () => {
        resolveResponse!(createStreamingResponse(["test"]));
      });

      await waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
      });
    });
  });

  describe("Error Handling (AC #2)", () => {
    it("handles API error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Não foi possível gerar. Tente novamente." },
          }),
      });

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.generate({
            promptKey: "email_subject_generation",
            variables: {},
          });
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.phase).toBe("error");
      });

      expect(result.current.error).toBe("Não foi possível gerar. Tente novamente.");
    });

    it("handles streaming error in SSE data", async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"error": "Erro no streaming"}\n\n')
          );
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.generate({
            promptKey: "email_body_generation",
            variables: {},
          });
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.phase).toBe("error");
      });

      expect(result.current.error).toBe("Erro no streaming");
    });

    it("clears error on reset()", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: "Error" } }),
      });

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        try {
          await result.current.generate({
            promptKey: "email_subject_generation",
            variables: {},
          });
        } catch {
          // Expected
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Error");
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.phase).toBe("idle");
      expect(result.current.text).toBe("");
    });
  });

  describe("Cancel Functionality (AC #3)", () => {
    it("cancels ongoing generation", async () => {
      // Create a promise that resolves when abort is triggered
      let abortTriggered = false;
      const responsePromise = new Promise(() => {
        // This promise intentionally never resolves - simulates long-running request
      });

      mockFetch.mockImplementationOnce((_url, options) => {
        const signal = options?.signal as AbortSignal;
        signal?.addEventListener("abort", () => {
          abortTriggered = true;
        });
        return responsePromise;
      });

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      // Start generation (don't await - it will never complete)
      act(() => {
        result.current.generate({
          promptKey: "email_subject_generation",
          variables: {},
        });
      });

      await waitFor(() => {
        expect(result.current.phase).toBe("generating");
      });

      // Cancel the generation
      act(() => {
        result.current.cancel();
      });

      // Verify cancel worked
      expect(result.current.phase).toBe("idle");
      expect(abortTriggered).toBe(true);
    });
  });

  describe("Non-Streaming Mode", () => {
    it("supports non-streaming response when stream=false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { text: "Generated text without streaming" },
          }),
      });

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generate({
          promptKey: "email_subject_generation",
          variables: {},
          stream: false,
        });
      });

      await waitFor(() => {
        expect(result.current.phase).toBe("done");
      });

      expect(result.current.text).toBe("Generated text without streaming");
    });
  });

  describe("API Request Format", () => {
    it("sends correct request format to API", async () => {
      mockFetch.mockResolvedValueOnce(createStreamingResponse(["ok"]));

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      const variables = { lead_name: "João", lead_company: "Acme" };

      await act(async () => {
        await result.current.generate({
          promptKey: "email_body_generation",
          variables,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/ai/generate",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            promptKey: "email_body_generation",
            variables,
            options: { stream: true },
          }),
        })
      );
    });
  });

  describe("Default Variables", () => {
    it("exports default generation variables for MVP", () => {
      expect(DEFAULT_GENERATION_VARIABLES).toBeDefined();
      expect(DEFAULT_GENERATION_VARIABLES.company_context).toBeDefined();
      expect(DEFAULT_GENERATION_VARIABLES.lead_name).toBeDefined();
      expect(DEFAULT_GENERATION_VARIABLES.lead_company).toBeDefined();
    });
  });

  describe("Timeout", () => {
    it("exports GENERATION_TIMEOUT_MS constant set to 15 seconds", () => {
      expect(GENERATION_TIMEOUT_MS).toBe(15000);
    });

    it("uses AbortController with timeout for generation requests", async () => {
      // Verify abort signal is passed to fetch
      let capturedSignal: AbortSignal | undefined;

      mockFetch.mockImplementationOnce((_url, options) => {
        capturedSignal = options?.signal as AbortSignal;
        return Promise.resolve(createStreamingResponse(["test"]));
      });

      const { result } = renderHook(() => useAIGenerate(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.generate({
          promptKey: "email_subject_generation",
          variables: {},
        });
      });

      // Verify abort signal was provided to fetch
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal instanceof AbortSignal).toBe(true);
    });
  });
});
