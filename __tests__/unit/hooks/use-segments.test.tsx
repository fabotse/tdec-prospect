/**
 * useSegments Hook Tests
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #1 - Create segment
 * AC: #2 - Add leads to segment
 * AC: #4 - View segment list
 * AC: #5 - Delete segment
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useSegments,
  useCreateSegment,
  useDeleteSegment,
  useAddLeadsToSegment,
  useRemoveLeadsFromSegment,
  useSegmentLeadIds,
} from "@/hooks/use-segments";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test data
const mockSegments = [
  {
    id: "segment-1",
    tenantId: "tenant-1",
    name: "Hot Leads",
    description: "High priority leads",
    createdAt: "2026-01-30T10:00:00Z",
    updatedAt: "2026-01-30T10:00:00Z",
    leadCount: 25,
  },
  {
    id: "segment-2",
    tenantId: "tenant-1",
    name: "Cold Leads",
    description: null,
    createdAt: "2026-01-29T10:00:00Z",
    updatedAt: "2026-01-29T10:00:00Z",
    leadCount: 50,
  },
];

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

describe("useSegments Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useSegments - List (AC: #4)", () => {
    it("fetches segments successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockSegments }),
      });

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockSegments);
      expect(mockFetch).toHaveBeenCalledWith("/api/segments");
    });

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao buscar segmentos" },
        }),
      });

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Erro ao buscar segmentos");
    });

    it("returns empty array when no segments exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const { result } = renderHook(() => useSegments(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe("useCreateSegment - Create (AC: #1)", () => {
    it("creates segment successfully", async () => {
      const newSegment = {
        name: "New Segment",
        description: "A new segment",
      };

      const createdSegment = {
        id: "segment-new",
        tenantId: "tenant-1",
        ...newSegment,
        createdAt: "2026-01-31T10:00:00Z",
        updatedAt: "2026-01-31T10:00:00Z",
        leadCount: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createdSegment }),
      });

      const { result } = renderHook(() => useCreateSegment(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync(newSegment);

      expect(mockFetch).toHaveBeenCalledWith("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSegment),
      });
    });

    it("handles create error - duplicate name", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Já existe um segmento com esse nome" },
        }),
      });

      const { result } = renderHook(() => useCreateSegment(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({ name: "Duplicate" })
      ).rejects.toThrow("Já existe um segmento com esse nome");
    });

    it("handles create error - validation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Nome do segmento é obrigatório" },
        }),
      });

      const { result } = renderHook(() => useCreateSegment(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync({ name: "" })).rejects.toThrow(
        "Nome do segmento é obrigatório"
      );
    });
  });

  describe("useDeleteSegment - Delete (AC: #5)", () => {
    it("deletes segment successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteSegment(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync("segment-1");

      expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1", {
        method: "DELETE",
      });
    });

    it("handles delete error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao remover segmento" },
        }),
      });

      const { result } = renderHook(() => useDeleteSegment(), {
        wrapper: createWrapper(),
      });

      await expect(result.current.mutateAsync("segment-1")).rejects.toThrow(
        "Erro ao remover segmento"
      );
    });
  });

  describe("useAddLeadsToSegment - Add Leads (AC: #2)", () => {
    const mockLeadsData = [
      {
        apolloId: "apollo-1",
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        companyName: "Acme Inc",
        title: "CEO",
      },
      {
        apolloId: "apollo-2",
        firstName: "Jane",
        lastName: "Smith",
        companyName: "Tech Corp",
        title: "CTO",
      },
      {
        apolloId: "apollo-3",
        firstName: "Bob",
        lastName: "Wilson",
        companyName: "Startup LLC",
        title: "VP Sales",
      },
    ];

    it("adds leads to segment successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { added: 3 } }),
      });

      const { result } = renderHook(() => useAddLeadsToSegment(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        segmentId: "segment-1",
        leads: mockLeadsData,
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: mockLeadsData }),
      });
    });

    it("handles add leads error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao adicionar leads ao segmento" },
        }),
      });

      const { result } = renderHook(() => useAddLeadsToSegment(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          segmentId: "segment-1",
          leads: [mockLeadsData[0]],
        })
      ).rejects.toThrow("Erro ao adicionar leads ao segmento");
    });
  });

  describe("useRemoveLeadsFromSegment", () => {
    it("removes leads from segment successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { removed: 2 } }),
      });

      const { result } = renderHook(() => useRemoveLeadsFromSegment(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync({
        segmentId: "segment-1",
        leadIds: ["lead-1", "lead-2"],
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: ["lead-1", "lead-2"] }),
      });
    });

    it("handles remove leads error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao remover leads do segmento" },
        }),
      });

      const { result } = renderHook(() => useRemoveLeadsFromSegment(), {
        wrapper: createWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          segmentId: "segment-1",
          leadIds: ["lead-1"],
        })
      ).rejects.toThrow("Erro ao remover leads do segmento");
    });
  });

  describe("useSegmentLeadIds (AC: #3)", () => {
    it("fetches lead IDs for a segment", async () => {
      const leadIds = ["lead-1", "lead-2", "lead-3"];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { segmentId: "segment-1", leadIds },
        }),
      });

      const { result } = renderHook(() => useSegmentLeadIds("segment-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(leadIds);
      expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1/leads");
    });

    it("returns empty array when segmentId is null", async () => {
      const { result } = renderHook(() => useSegmentLeadIds(null), {
        wrapper: createWrapper(),
      });

      // Query should be disabled
      expect(result.current.isFetching).toBe(false);
      expect(result.current.data).toBeUndefined();
    });

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Erro ao buscar leads do segmento" },
        }),
      });

      const { result } = renderHook(() => useSegmentLeadIds("segment-1"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe("Erro ao buscar leads do segmento");
    });
  });
});
