/**
 * useProducts Hook Tests
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #2 - List products
 * AC: #4 - Create product
 * AC: #5 - Edit product
 * AC: #6 - Delete product
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@/hooks/use-products";
import type { Product } from "@/types/product";

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

const mockProduct: Product = {
  id: "product-123",
  tenantId: "tenant-123",
  name: "Test Product",
  description: "Test Description",
  features: "Feature 1",
  differentials: "Differential 1",
  targetAudience: "SMBs",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  campaignCount: 0,
};

describe("useProducts Hook", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useProducts (AC #2)", () => {
    it("fetches and returns products list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [mockProduct] }),
      });

      const { result } = renderHook(() => useProducts(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([mockProduct]);
      expect(mockFetch).toHaveBeenCalledWith("/api/products");
    });

    it("handles empty products list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const { result } = renderHook(() => useProducts(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: { message: "Erro ao buscar produtos" } }),
      });

      const { result } = renderHook(() => useProducts(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect((result.current.error as Error).message).toBe(
        "Erro ao buscar produtos"
      );
    });
  });

  describe("useCreateProduct (AC #4)", () => {
    it("creates a new product", async () => {
      // First call for list, second for create
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockProduct }),
        });

      const { result } = renderHook(() => useCreateProduct(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          name: "Test Product",
          description: "Test Description",
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/products",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Product",
            description: "Test Description",
          }),
        })
      );
    });

    it("throws error on create failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: { message: "Erro ao criar produto" } }),
      });

      const { result } = renderHook(() => useCreateProduct(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          name: "Test",
          description: "Desc",
        })
      ).rejects.toThrow("Erro ao criar produto");
    });
  });

  describe("useUpdateProduct (AC #5)", () => {
    it("updates an existing product", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { ...mockProduct, name: "Updated Name" },
          }),
      });

      const { result } = renderHook(() => useUpdateProduct(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          productId: "product-123",
          data: { name: "Updated Name" },
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/products/product-123",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Name" }),
        })
      );
    });

    it("throws error on update failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: { message: "Erro ao atualizar produto" } }),
      });

      const { result } = renderHook(() => useUpdateProduct(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          productId: "product-123",
          data: { name: "Test" },
        })
      ).rejects.toThrow("Erro ao atualizar produto");
    });
  });

  describe("useDeleteProduct (AC #6)", () => {
    it("deletes a product", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { deleted: true } }),
      });

      const { result } = renderHook(() => useDeleteProduct(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync("product-123");
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/products/product-123", {
        method: "DELETE",
      });
    });

    it("throws error on delete failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: { message: "Erro ao remover produto" } }),
      });

      const { result } = renderHook(() => useDeleteProduct(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync("product-123")
      ).rejects.toThrow("Erro ao remover produto");
    });
  });
});
