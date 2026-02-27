/**
 * Tests for useMyLeads Hook
 * Story 4.2.2: My Leads Page
 * Story 4.6: Interested Leads Highlighting
 *
 * AC: #2, #3, #7 - Fetch imported leads with filtering and pagination
 * Story 4.6: AC #2, #6 - useInterestedCount hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMyLeads, useInterestedCount, useAllLeads } from "@/hooks/use-my-leads";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useMyLeads", () => {
  const mockLeads = [
    {
      id: "lead-1",
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      companyName: "Acme Inc",
      status: "novo",
      createdAt: "2026-01-30T10:00:00Z",
    },
    {
      id: "lead-2",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      companyName: "Tech Corp",
      status: "interessado",
      createdAt: "2026-01-29T10:00:00Z",
    },
  ];

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch leads with default pagination", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    const { result } = renderHook(() => useMyLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.leads).toHaveLength(2);
    expect(result.current.pagination).toEqual({
      total: 2,
      page: 1,
      limit: 25,
      totalPages: 1,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/leads?page=1&per_page=25")
    );
  });

  it("should handle loading state", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useMyLeads(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.leads).toEqual([]);
  });

  it("should handle errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { code: "INTERNAL_ERROR", message: "Erro ao buscar leads" },
        }),
    });

    const { result } = renderHook(() => useMyLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Erro ao buscar leads");
  });

  it("should update filters and reset page to 1", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    const { result } = renderHook(() => useMyLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Set page to 2
    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);

    // Update filters should reset page to 1
    act(() => {
      result.current.updateFilters({ statuses: ["novo"] });
    });

    expect(result.current.page).toBe(1);
  });

  it("should apply status filter to API call", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [mockLeads[0]],
          meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    const { result } = renderHook(
      () => useMyLeads({ statuses: ["novo"] }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("status=novo")
    );
  });

  it("should apply segment filter to API call", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    const { result } = renderHook(
      () => useMyLeads({ segmentId: "segment-123" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("segment_id=segment-123")
    );
  });

  it("should handle pagination correctly", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 50, page: 2, limit: 25, totalPages: 2 },
        }),
    });

    const { result } = renderHook(() => useMyLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setPage(2);
    });

    await waitFor(() => {
      expect(result.current.page).toBe(2);
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringContaining("page=2")
    );
  });

  it("should clear filters", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    const { result } = renderHook(
      () => useMyLeads({ statuses: ["novo"], segmentId: "segment-123" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters).toEqual({});
  });

  it("should cap perPage at 100", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
        }),
    });

    const { result } = renderHook(() => useMyLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setPerPage(200);
    });

    expect(result.current.perPage).toBe(100);
  });
});

// ==============================================
// STORY 4.6: useInterestedCount Hook Tests
// ==============================================

describe("useInterestedCount (Story 4.6)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch count of interested leads", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          meta: { total: 5, page: 1, limit: 1, totalPages: 5 },
        }),
    });

    const { result } = renderHook(() => useInterestedCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("status=interessado")
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("per_page=1")
    );
  });

  it("should return 0 when no interested leads", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 1, totalPages: 0 },
        }),
    });

    const { result } = renderHook(() => useInterestedCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(0);
  });

  it("should handle loading state", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useInterestedCount(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.count).toBe(0);
  });

  it("should return 0 on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { code: "INTERNAL_ERROR", message: "Erro" },
        }),
    });

    const { result } = renderHook(() => useInterestedCount(), {
      wrapper: createWrapper(),
    });

    // Should return 0 on error (default value)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(0);
  });
});

// ==============================================
// STORY 12.7: useAllLeads Hook Tests
// ==============================================

describe("useAllLeads (Story 12.7)", () => {
  const mockLeadsPage1 = Array.from({ length: 100 }, (_, i) => ({
    id: `lead-${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `lead${i + 1}@example.com`,
    companyName: `Company ${i + 1}`,
    status: "novo",
    createdAt: "2026-01-30T10:00:00Z",
  }));

  const mockLeadsPage2 = Array.from({ length: 50 }, (_, i) => ({
    id: `lead-${i + 101}`,
    firstName: `First${i + 101}`,
    lastName: `Last${i + 101}`,
    email: `lead${i + 101}@example.com`,
    companyName: `Company ${i + 101}`,
    status: "novo",
    createdAt: "2026-01-29T10:00:00Z",
  }));

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch first page with per_page=100", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage1.slice(0, 50),
          meta: { total: 50, page: 1, limit: 100, totalPages: 1 },
        }),
    });

    const { result } = renderHook(() => useAllLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.leads).toHaveLength(50);
    expect(result.current.total).toBe(50);
    expect(result.current.hasNextPage).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("per_page=100")
    );
  });

  it("should indicate hasNextPage when more pages exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage1,
          meta: { total: 150, page: 1, limit: 100, totalPages: 2 },
        }),
    });

    const { result } = renderHook(() => useAllLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.leads).toHaveLength(100);
    expect(result.current.total).toBe(150);
    expect(result.current.hasNextPage).toBe(true);
  });

  it("should accumulate leads from multiple pages via fetchNextPage", async () => {
    // Page 1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage1,
          meta: { total: 150, page: 1, limit: 100, totalPages: 2 },
        }),
    });

    const { result } = renderHook(() => useAllLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.leads).toHaveLength(100);
    });

    // Page 2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage2,
          meta: { total: 150, page: 2, limit: 100, totalPages: 2 },
        }),
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.leads).toHaveLength(150);
    });

    expect(result.current.hasNextPage).toBe(false);
    // First 100 leads from page 1 + 50 from page 2
    expect(result.current.leads[0].id).toBe("lead-1");
    expect(result.current.leads[99].id).toBe("lead-100");
    expect(result.current.leads[100].id).toBe("lead-101");
  });

  it("should return correct total from first page meta", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage1.slice(0, 30),
          meta: { total: 30, page: 1, limit: 100, totalPages: 1 },
        }),
    });

    const { result } = renderHook(() => useAllLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.total).toBe(30);
    });
  });

  it("should apply search filter to API call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [mockLeadsPage1[0]],
          meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
        }),
    });

    const { result } = renderHook(
      () => useAllLeads({ search: "First1" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("search=First1")
    );
  });

  it("should apply segment filter to API call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage1.slice(0, 10),
          meta: { total: 10, page: 1, limit: 100, totalPages: 1 },
        }),
    });

    const { result } = renderHook(
      () => useAllLeads({ segmentId: "seg-abc" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("segment_id=seg-abc")
    );
  });

  it("should handle errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { code: "INTERNAL_ERROR", message: "Erro ao buscar leads" },
        }),
    });

    const { result } = renderHook(() => useAllLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Erro ao buscar leads");
    expect(result.current.leads).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it("should fetch all remaining pages via fetchAllPages", async () => {
    // Page 1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage1,
          meta: { total: 150, page: 1, limit: 100, totalPages: 2 },
        }),
    });

    const { result } = renderHook(() => useAllLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.leads).toHaveLength(100);
    });

    // Page 2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage2,
          meta: { total: 150, page: 2, limit: 100, totalPages: 2 },
        }),
    });

    await act(async () => {
      await result.current.fetchAllPages();
    });

    await waitFor(() => {
      expect(result.current.leads).toHaveLength(150);
    });

    expect(result.current.hasNextPage).toBe(false);
  });

  it("should load everything in single page when total <= 100", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeadsPage1.slice(0, 80),
          meta: { total: 80, page: 1, limit: 100, totalPages: 1 },
        }),
    });

    const { result } = renderHook(() => useAllLeads(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.leads).toHaveLength(80);
    expect(result.current.total).toBe(80);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.isFetchingNextPage).toBe(false);
  });
});
