import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock server actions
vi.mock("@/actions/knowledge-base", () => ({
  getToneOfVoice: vi.fn(),
  saveToneOfVoice: vi.fn(),
}));

import { getToneOfVoice, saveToneOfVoice } from "@/actions/knowledge-base";
import { useToneOfVoice } from "@/hooks/use-tone-of-voice";

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

describe("useToneOfVoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(getToneOfVoice).mockResolvedValue({
      success: true,
      data: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should call getToneOfVoice on mount", async () => {
      renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(getToneOfVoice).toHaveBeenCalledTimes(1);
      });
    });

    it("should set isLoading false after fetch completes", async () => {
      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should return null data when no tone settings exist", async () => {
      vi.mocked(getToneOfVoice).mockResolvedValue({
        success: true,
        data: null,
      });

      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });

    it("should return tone data when it exists", async () => {
      const mockTone = {
        preset: "casual" as const,
        custom_description: "Be friendly",
        writing_guidelines: "Use simple words",
      };

      vi.mocked(getToneOfVoice).mockResolvedValue({
        success: true,
        data: mockTone,
      });

      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockTone);
    });
  });

  describe("Error Handling", () => {
    it("should set error when fetch fails", async () => {
      vi.mocked(getToneOfVoice).mockResolvedValue({
        success: false,
        error: "Erro ao buscar dados",
      });

      const { result } = renderHook(() => useToneOfVoice(), {
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
      vi.mocked(getToneOfVoice).mockResolvedValue({
        success: false,
        error: "Erro",
      });

      const { result } = renderHook(() => useToneOfVoice(), {
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

  describe("saveTone", () => {
    it("should call saveToneOfVoice with correct data", async () => {
      vi.mocked(saveToneOfVoice).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const toneData = {
        preset: "formal" as const,
        custom_description: "Professional tone",
        writing_guidelines: "Use formal language",
      };

      await act(async () => {
        await result.current.saveTone(toneData);
      });

      expect(saveToneOfVoice).toHaveBeenCalledWith(toneData);
    });

    it("should return success result on successful save", async () => {
      vi.mocked(saveToneOfVoice).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveTone({
          preset: "formal",
          custom_description: "",
          writing_guidelines: "",
        });
      });

      expect(saveResult).toEqual({ success: true });
    });

    it("should return error result on failed save", async () => {
      vi.mocked(saveToneOfVoice).mockResolvedValue({
        success: false,
        error: "Erro ao salvar",
      });

      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveTone({
          preset: "formal",
          custom_description: "",
          writing_guidelines: "",
        });
      });

      expect(saveResult).toEqual({ success: false, error: "Erro ao salvar" });
    });

    it("should handle isSaving state during mutation", async () => {
      vi.mocked(saveToneOfVoice).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initially not saving
      expect(result.current.isSaving).toBe(false);

      // After save completes, isSaving should be false
      await act(async () => {
        await result.current.saveTone({
          preset: "formal",
          custom_description: "",
          writing_guidelines: "",
        });
      });

      expect(result.current.isSaving).toBe(false);
    });
  });

  describe("Return Values", () => {
    it("should return saveTone function", async () => {
      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.saveTone).toBe("function");
    });

    it("should return isSaving state", async () => {
      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.isSaving).toBe("boolean");
    });

    it("should return error state", async () => {
      const { result } = renderHook(() => useToneOfVoice(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
