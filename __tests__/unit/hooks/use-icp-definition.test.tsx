import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock server actions
vi.mock("@/actions/knowledge-base", () => ({
  getICPDefinition: vi.fn(),
  saveICPDefinition: vi.fn(),
}));

import { getICPDefinition, saveICPDefinition } from "@/actions/knowledge-base";
import { useICPDefinition } from "@/hooks/use-icp-definition";

// Create a wrapper with QueryClientProvider
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

describe("useICPDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(getICPDefinition).mockResolvedValue({
      success: true,
      data: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should call getICPDefinition on mount", async () => {
      renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(getICPDefinition).toHaveBeenCalledTimes(1);
      });
    });

    it("should set isLoading false after fetch completes", async () => {
      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should return null data when no ICP settings exist", async () => {
      vi.mocked(getICPDefinition).mockResolvedValue({
        success: true,
        data: null,
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });

    it("should return ICP data when it exists", async () => {
      const mockICP = {
        company_sizes: ["11-50", "51-200"] as const,
        industries: ["Tecnologia", "SaaS"],
        job_titles: ["CEO", "CTO"],
        geographic_focus: ["São Paulo", "Brasil"],
        pain_points: "Dores do cliente",
        common_objections: "Objeções comuns",
      };

      vi.mocked(getICPDefinition).mockResolvedValue({
        success: true,
        data: mockICP,
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockICP);
    });
  });

  describe("Error Handling", () => {
    it("should set error when fetch fails", async () => {
      vi.mocked(getICPDefinition).mockResolvedValue({
        success: false,
        error: "Erro ao buscar dados",
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro ao buscar dados");
        },
        { timeout: 2000 }
      );
    });

    it("should return null data when fetch fails", async () => {
      vi.mocked(getICPDefinition).mockResolvedValue({
        success: false,
        error: "Erro",
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro");
        },
        { timeout: 2000 }
      );

      expect(result.current.data).toBeNull();
    });
  });

  describe("saveICP", () => {
    it("should call saveICPDefinition with correct data", async () => {
      vi.mocked(saveICPDefinition).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const icpData = {
        company_sizes: ["11-50", "51-200"] as const,
        industries: ["Tecnologia"],
        job_titles: ["CEO"],
        geographic_focus: ["São Paulo"],
        pain_points: "Dores",
        common_objections: "Objeções",
      };

      await act(async () => {
        await result.current.saveICP(icpData);
      });

      expect(saveICPDefinition).toHaveBeenCalledWith(icpData);
    });

    it("should return success result on successful save", async () => {
      vi.mocked(saveICPDefinition).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveICP({
          company_sizes: ["11-50"],
          industries: [],
          job_titles: [],
          geographic_focus: [],
          pain_points: "",
          common_objections: "",
        });
      });

      expect(saveResult).toEqual({ success: true });
    });

    it("should return error result on failed save", async () => {
      vi.mocked(saveICPDefinition).mockResolvedValue({
        success: false,
        error: "Erro ao salvar",
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveICP({
          company_sizes: ["11-50"],
          industries: [],
          job_titles: [],
          geographic_focus: [],
          pain_points: "",
          common_objections: "",
        });
      });

      expect(saveResult).toEqual({ success: false, error: "Erro ao salvar" });
    });

    it("should handle isSaving state during mutation", async () => {
      vi.mocked(saveICPDefinition).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initially not saving
      expect(result.current.isSaving).toBe(false);

      // After save completes, isSaving should be false
      await act(async () => {
        await result.current.saveICP({
          company_sizes: ["11-50"],
          industries: [],
          job_titles: [],
          geographic_focus: [],
          pain_points: "",
          common_objections: "",
        });
      });

      expect(result.current.isSaving).toBe(false);
    });
  });

  describe("Return Values", () => {
    it("should return saveICP function", async () => {
      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.saveICP).toBe("function");
    });

    it("should return isSaving state", async () => {
      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.isSaving).toBe("boolean");
    });

    it("should return error state", async () => {
      const { result } = renderHook(() => useICPDefinition(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
