import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock server actions
vi.mock("@/actions/knowledge-base", () => ({
  getEmailExamples: vi.fn(),
  createEmailExample: vi.fn(),
  updateEmailExample: vi.fn(),
  deleteEmailExample: vi.fn(),
}));

import {
  getEmailExamples,
  createEmailExample,
  updateEmailExample,
  deleteEmailExample,
} from "@/actions/knowledge-base";
import { useEmailExamples } from "@/hooks/use-email-examples";

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

describe("useEmailExamples", () => {
  const mockExample = {
    id: "1",
    tenant_id: "t1",
    subject: "Test Subject",
    body: "Test Body",
    context: "Test Context",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(getEmailExamples).mockResolvedValue({
      success: true,
      data: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should start with isLoading true", () => {
      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should call getEmailExamples on mount", async () => {
      renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(getEmailExamples).toHaveBeenCalledTimes(1);
      });
    });

    it("should set isLoading false after fetch completes", async () => {
      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should return empty array when no examples exist", async () => {
      vi.mocked(getEmailExamples).mockResolvedValue({
        success: true,
        data: [],
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.examples).toEqual([]);
    });

    it("should return examples when they exist", async () => {
      vi.mocked(getEmailExamples).mockResolvedValue({
        success: true,
        data: [mockExample],
      });

      const { result } = renderHook(() => useEmailExamples(), {
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
      vi.mocked(getEmailExamples).mockResolvedValue({
        success: false,
        error: "Erro ao buscar exemplos",
      });

      const { result } = renderHook(() => useEmailExamples(), {
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
      vi.mocked(getEmailExamples).mockResolvedValue({
        success: false,
        error: "Erro",
      });

      const { result } = renderHook(() => useEmailExamples(), {
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
    it("should call createEmailExample with correct data", async () => {
      vi.mocked(createEmailExample).mockResolvedValue({
        success: true,
        data: mockExample,
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const exampleData = {
        subject: "New Subject",
        body: "New Body",
        context: "New Context",
      };

      await act(async () => {
        await result.current.createExample(exampleData);
      });

      expect(createEmailExample).toHaveBeenCalledWith(exampleData);
    });

    it("should return success result on successful create", async () => {
      vi.mocked(createEmailExample).mockResolvedValue({
        success: true,
        data: mockExample,
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createResult;
      await act(async () => {
        createResult = await result.current.createExample({
          subject: "Test",
          body: "Body",
        });
      });

      expect(createResult).toEqual({ success: true, data: mockExample });
    });

    it("should return error result on failed create", async () => {
      vi.mocked(createEmailExample).mockResolvedValue({
        success: false,
        error: "Erro ao criar",
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let createResult;
      await act(async () => {
        createResult = await result.current.createExample({
          subject: "Test",
          body: "Body",
        });
      });

      expect(createResult).toEqual({ success: false, error: "Erro ao criar" });
    });

    it("should handle isCreating state during mutation", async () => {
      vi.mocked(createEmailExample).mockResolvedValue({
        success: true,
        data: mockExample,
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isCreating).toBe(false);

      await act(async () => {
        await result.current.createExample({
          subject: "Test",
          body: "Body",
        });
      });

      expect(result.current.isCreating).toBe(false);
    });
  });

  describe("updateExample", () => {
    it("should call updateEmailExample with correct data", async () => {
      const updatedExample = { ...mockExample, subject: "Updated Subject" };
      vi.mocked(updateEmailExample).mockResolvedValue({
        success: true,
        data: updatedExample,
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updateData = {
        subject: "Updated Subject",
        body: "Updated Body",
      };

      await act(async () => {
        await result.current.updateExample("1", updateData);
      });

      expect(updateEmailExample).toHaveBeenCalledWith("1", updateData);
    });

    it("should return success result on successful update", async () => {
      const updatedExample = { ...mockExample, subject: "Updated" };
      vi.mocked(updateEmailExample).mockResolvedValue({
        success: true,
        data: updatedExample,
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updateResult;
      await act(async () => {
        updateResult = await result.current.updateExample("1", {
          subject: "Updated",
          body: "Body",
        });
      });

      expect(updateResult).toEqual({ success: true, data: updatedExample });
    });

    it("should return error result on failed update", async () => {
      vi.mocked(updateEmailExample).mockResolvedValue({
        success: false,
        error: "Erro ao atualizar",
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updateResult;
      await act(async () => {
        updateResult = await result.current.updateExample("1", {
          subject: "Test",
          body: "Body",
        });
      });

      expect(updateResult).toEqual({ success: false, error: "Erro ao atualizar" });
    });
  });

  describe("deleteExample", () => {
    it("should call deleteEmailExample with correct id", async () => {
      vi.mocked(deleteEmailExample).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteExample("1");
      });

      expect(deleteEmailExample).toHaveBeenCalledWith("1");
    });

    it("should return success result on successful delete", async () => {
      vi.mocked(deleteEmailExample).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useEmailExamples(), {
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
      vi.mocked(deleteEmailExample).mockResolvedValue({
        success: false,
        error: "Erro ao remover",
      });

      const { result } = renderHook(() => useEmailExamples(), {
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
      vi.mocked(deleteEmailExample).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useEmailExamples(), {
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
      const { result } = renderHook(() => useEmailExamples(), {
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
      const { result } = renderHook(() => useEmailExamples(), {
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
      const { result } = renderHook(() => useEmailExamples(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
