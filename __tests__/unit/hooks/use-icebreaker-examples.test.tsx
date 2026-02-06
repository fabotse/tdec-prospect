/**
 * useIcebreakerExamples Hook Tests
 * Story 9.2: Exemplos de Referencia para Ice Breakers no Knowledge Base
 *
 * AC: #1, #2 - CRUD operations for icebreaker examples
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock server actions
vi.mock("@/actions/knowledge-base", () => ({
  getIcebreakerExamples: vi.fn(),
  createIcebreakerExample: vi.fn(),
  updateIcebreakerExample: vi.fn(),
  deleteIcebreakerExample: vi.fn(),
}));

import {
  getIcebreakerExamples,
  createIcebreakerExample,
  updateIcebreakerExample,
  deleteIcebreakerExample,
} from "@/actions/knowledge-base";
import { useIcebreakerExamples } from "@/hooks/use-icebreaker-examples";

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

describe("useIcebreakerExamples", () => {
  const mockExample = {
    id: "1",
    tenant_id: "t1",
    text: "Vi que a Acme Corp está expandindo para o mercado de SaaS.",
    category: "empresa" as const,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getIcebreakerExamples).mockResolvedValue({
      success: true,
      data: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should call getIcebreakerExamples on mount", async () => {
      renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(getIcebreakerExamples).toHaveBeenCalledTimes(1);
      });
    });

    it("should set isLoading false after fetch completes", async () => {
      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should return empty array when no examples exist", async () => {
      vi.mocked(getIcebreakerExamples).mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.examples).toEqual([]);
    });

    it("should return examples when they exist", async () => {
      vi.mocked(getIcebreakerExamples).mockResolvedValue({
        success: true,
        data: [mockExample],
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.examples).toEqual([mockExample]);
    });
  });

  describe("Error Handling", () => {
    it("should set error when fetch fails", async () => {
      vi.mocked(getIcebreakerExamples).mockResolvedValue({
        success: false,
        error: "Erro ao buscar exemplos",
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro ao buscar exemplos");
        },
        { timeout: 2000 }
      );
    });

    it("should return empty array when fetch fails", async () => {
      vi.mocked(getIcebreakerExamples).mockResolvedValue({
        success: false,
        error: "Erro",
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.error).toBe("Erro");
        },
        { timeout: 2000 }
      );

      expect(result.current.examples).toEqual([]);
    });
  });

  describe("createExample", () => {
    it("should call createIcebreakerExample with correct data", async () => {
      vi.mocked(createIcebreakerExample).mockResolvedValue({
        success: true,
        data: mockExample,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const exampleData = {
        text: "Vi que a Acme Corp está expandindo para o mercado de SaaS.",
        category: "empresa" as const,
      };

      await act(async () => {
        await result.current.createExample(exampleData);
      });

      expect(createIcebreakerExample).toHaveBeenCalledWith(exampleData);
    });

    it("should return success result on successful create", async () => {
      vi.mocked(createIcebreakerExample).mockResolvedValue({
        success: true,
        data: mockExample,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createResult;
      await act(async () => {
        createResult = await result.current.createExample({
          text: "Test ice breaker",
        });
      });

      expect(createResult).toEqual({ success: true, data: mockExample });
    });

    it("should return error result on failed create", async () => {
      vi.mocked(createIcebreakerExample).mockResolvedValue({
        success: false,
        error: "Erro ao criar",
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createResult;
      await act(async () => {
        createResult = await result.current.createExample({
          text: "Test",
        });
      });

      expect(createResult).toEqual({ success: false, error: "Erro ao criar" });
    });

    it("should handle isCreating state during mutation", async () => {
      vi.mocked(createIcebreakerExample).mockResolvedValue({
        success: true,
        data: mockExample,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isCreating).toBe(false);

      await act(async () => {
        await result.current.createExample({
          text: "Test",
        });
      });

      expect(result.current.isCreating).toBe(false);
    });
  });

  describe("updateExample", () => {
    it("should call updateIcebreakerExample with correct data", async () => {
      const updatedExample = { ...mockExample, text: "Updated ice breaker" };
      vi.mocked(updateIcebreakerExample).mockResolvedValue({
        success: true,
        data: updatedExample,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updateData = {
        text: "Updated ice breaker",
        category: "lead" as const,
      };

      await act(async () => {
        await result.current.updateExample("1", updateData);
      });

      expect(updateIcebreakerExample).toHaveBeenCalledWith("1", updateData);
    });

    it("should return success result on successful update", async () => {
      const updatedExample = { ...mockExample, text: "Updated" };
      vi.mocked(updateIcebreakerExample).mockResolvedValue({
        success: true,
        data: updatedExample,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updateResult;
      await act(async () => {
        updateResult = await result.current.updateExample("1", {
          text: "Updated",
        });
      });

      expect(updateResult).toEqual({ success: true, data: updatedExample });
    });

    it("should return error result on failed update", async () => {
      vi.mocked(updateIcebreakerExample).mockResolvedValue({
        success: false,
        error: "Erro ao atualizar",
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updateResult;
      await act(async () => {
        updateResult = await result.current.updateExample("1", {
          text: "Test",
        });
      });

      expect(updateResult).toEqual({ success: false, error: "Erro ao atualizar" });
    });
  });

  describe("deleteExample", () => {
    it("should call deleteIcebreakerExample with correct id", async () => {
      vi.mocked(deleteIcebreakerExample).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteExample("1");
      });

      expect(deleteIcebreakerExample).toHaveBeenCalledWith("1");
    });

    it("should return success result on successful delete", async () => {
      vi.mocked(deleteIcebreakerExample).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let deleteResult;
      await act(async () => {
        deleteResult = await result.current.deleteExample("1");
      });

      expect(deleteResult).toEqual({ success: true });
    });

    it("should return error result on failed delete", async () => {
      vi.mocked(deleteIcebreakerExample).mockResolvedValue({
        success: false,
        error: "Erro ao remover",
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let deleteResult;
      await act(async () => {
        deleteResult = await result.current.deleteExample("1");
      });

      expect(deleteResult).toEqual({ success: false, error: "Erro ao remover" });
    });

    it("should handle isDeleting state during mutation", async () => {
      vi.mocked(deleteIcebreakerExample).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isDeleting).toBe(false);

      await act(async () => {
        await result.current.deleteExample("1");
      });

      expect(result.current.isDeleting).toBe(false);
    });
  });

  describe("Return Values", () => {
    it("should return all CRUD functions", async () => {
      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.createExample).toBe("function");
      expect(typeof result.current.updateExample).toBe("function");
      expect(typeof result.current.deleteExample).toBe("function");
    });

    it("should return all loading states", async () => {
      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.isCreating).toBe("boolean");
      expect(typeof result.current.isUpdating).toBe("boolean");
      expect(typeof result.current.isDeleting).toBe("boolean");
    });

    it("should return error state", async () => {
      const { result } = renderHook(() => useIcebreakerExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
