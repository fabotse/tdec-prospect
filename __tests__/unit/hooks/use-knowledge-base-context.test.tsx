/**
 * useKnowledgeBaseContext Hook Tests
 * Story 6.3: Knowledge Base Integration for Context
 *
 * Tests for the hook that fetches and caches KB context.
 * AC: #1 - Knowledge Base Context in AI Prompts
 * AC: #5 - Graceful Degradation
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useKnowledgeBaseContext } from "@/hooks/use-knowledge-base-context";
import {
  DEFAULT_COMPANY_CONTEXT,
  DEFAULT_TONE_DESCRIPTION,
  DEFAULT_TONE_STYLE,
} from "@/lib/services/knowledge-base-context";

// ==============================================
// MOCK DATA
// ==============================================

const mockKBContext = {
  company: {
    company_name: "Test Company",
    business_description: "Test description",
    products_services: "Product A, Product B",
    competitive_advantages: "Fast, reliable",
  },
  tone: {
    preset: "formal" as const,
    custom_description: "Professional tone",
    writing_guidelines: "Use formal language",
  },
  icp: {
    company_sizes: ["51-200" as const],
    industries: ["Technology"],
    job_titles: ["CEO", "CTO"],
    geographic_focus: ["Brazil"],
    pain_points: "Integration issues",
    common_objections: "Price",
  },
  examples: [
    {
      id: "1",
      tenant_id: "t1",
      subject: "Test Subject",
      body: "Test Body",
      context: "Cold outreach",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    },
  ],
};

// ==============================================
// MOCK FETCH
// ==============================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ==============================================
// TEST WRAPPER
// ==============================================

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

// ==============================================
// TESTS
// ==============================================

describe("useKnowledgeBaseContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockKBContext }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should fetch from /api/knowledge-base/context", async () => {
      renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/knowledge-base/context");
      });
    });

    it("should set isLoading false after fetch completes", async () => {
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("Successful Fetch", () => {
    it("should return KB context data", async () => {
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.context).toEqual(mockKBContext);
    });

    it("should compile variables from KB context (AC #1)", async () => {
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Check compiled variables
      expect(result.current.variables.company_context).toContain("Test Company");
      expect(result.current.variables.tone_style).toBe("formal");
      expect(result.current.variables.target_industries).toBe("Technology");
      expect(result.current.variables.successful_examples).toContain("Test Subject");
    });

    it("should return null error on success", async () => {
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should set error when fetch fails with HTTP error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Não autenticado" },
          }),
      });

      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe("Não autenticado");
        },
        { timeout: 2000 }
      );
    });

    it("should set error when API returns success: false", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: { message: "Erro ao buscar contexto" },
          }),
      });

      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro ao buscar contexto");
        },
        { timeout: 2000 }
      );
    });

    it("should use default error message when error response has no message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro ao buscar contexto");
        },
        { timeout: 2000 }
      );
    });
  });

  describe("Graceful Degradation (AC #5)", () => {
    it("should return default variables when context is null", async () => {
      // Before fetch completes, should use defaults
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      // Initially, before data loads, should use defaults
      expect(result.current.variables.company_context).toBe(DEFAULT_COMPANY_CONTEXT);
      expect(result.current.variables.tone_description).toBe(DEFAULT_TONE_DESCRIPTION);
      expect(result.current.variables.tone_style).toBe(DEFAULT_TONE_STYLE);
    });

    it("should return default variables when fetch fails", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBeTruthy();
        },
        { timeout: 2000 }
      );

      // Should still have usable default variables
      expect(result.current.variables.company_context).toBe(DEFAULT_COMPANY_CONTEXT);
      expect(result.current.variables.tone_description).toBe(DEFAULT_TONE_DESCRIPTION);
    });

    it("should return default variables when KB is empty", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              company: null,
              tone: null,
              icp: null,
              examples: [],
            },
          }),
      });

      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should use defaults when KB is empty
      expect(result.current.variables.company_context).toBe(DEFAULT_COMPANY_CONTEXT);
      expect(result.current.variables.tone_description).toBe(DEFAULT_TONE_DESCRIPTION);
      expect(result.current.variables.icp_summary).toBe("");
      expect(result.current.variables.successful_examples).toBe("");
    });
  });

  describe("Return Values", () => {
    it("should return refetch function", async () => {
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe("function");
    });

    it("should always return variables object (never undefined)", async () => {
      const { result } = renderHook(() => useKnowledgeBaseContext(), {
        wrapper: createWrapper(),
      });

      // Even before loading completes
      expect(result.current.variables).toBeDefined();
      expect(result.current.variables.company_context).toBeDefined();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // After loading
      expect(result.current.variables).toBeDefined();
      expect(result.current.variables.company_context).toBeDefined();
    });
  });
});
