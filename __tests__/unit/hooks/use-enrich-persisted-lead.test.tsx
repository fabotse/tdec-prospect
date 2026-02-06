/**
 * Unit tests for useEnrichPersistedLead hooks
 * Story 4.4.1: Lead Data Enrichment
 *
 * Tests:
 * - useEnrichPersistedLead mutation for single persisted lead
 * - useBulkEnrichPersistedLeads mutation for bulk enrichment
 * - Toast notifications
 * - Query cache invalidation
 * - Error handling with specific messages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useEnrichPersistedLead,
  useBulkEnrichPersistedLeads,
} from "@/hooks/use-enrich-persisted-lead";
import type { ReactNode } from "react";

// ==============================================
// TEST SETUP
// ==============================================

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

// ==============================================
// MOCKS
// ==============================================

// Mock toast - must be hoisted, so define inline
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// Get the mocked toast for assertions
import { toast as mockToast } from "sonner";

const mockLeadRow = {
  id: "lead-123",
  tenant_id: "tenant-1",
  apollo_id: "apollo-123",
  first_name: "João",
  last_name: "Silva",
  email: "joao@empresa.com",
  phone: null,
  company_name: "Empresa SA",
  company_size: "51-200",
  industry: "Technology",
  location: "São Paulo, SP, Brazil",
  title: "CEO",
  linkedin_url: "https://linkedin.com/in/joaosilva",
  photo_url: "https://example.com/photo.jpg",
  status: "novo",
  has_email: true,
  has_direct_phone: "No",
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T12:00:00Z",
};

const mockBulkResult = {
  enriched: 2,
  notFound: 1,
  failed: 0,
  leads: [mockLeadRow],
};

// ==============================================
// TESTS - useEnrichPersistedLead
// ==============================================

describe("useEnrichPersistedLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("returns initial idle state", () => {
      const { result } = renderHook(() => useEnrichPersistedLead(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe("successful enrichment", () => {
    it("enriches single lead and shows success toast", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockLeadRow }),
      });

      const { result } = renderHook(() => useEnrichPersistedLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate("lead-123");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        "Dados do lead enriquecidos com sucesso"
      );
      expect(result.current.data?.email).toBe("joao@empresa.com");
    });

    it("calls correct API endpoint", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockLeadRow }),
      });
      global.fetch = fetchMock;

      const { result } = renderHook(() => useEnrichPersistedLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate("lead-123");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/leads/lead-123/enrich",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("calls onSuccess callback with enriched lead", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockLeadRow }),
      });

      const onSuccessMock = vi.fn();
      const { result } = renderHook(
        () => useEnrichPersistedLead({ onSuccess: onSuccessMock }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        result.current.mutate("lead-123");
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(onSuccessMock).toHaveBeenCalledWith(mockLeadRow);
    });
  });

  describe("error handling", () => {
    it("shows warning toast for not found error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              code: "NOT_FOUND",
              message: "Lead não encontrado no Apollo para enriquecimento",
            },
          }),
      });

      const { result } = renderHook(() => useEnrichPersistedLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate("lead-123");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(mockToast.warning).toHaveBeenCalledWith(
        "Lead não encontrado no Apollo para enriquecimento"
      );
    });

    it("shows error toast for generic errors", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              code: "INTERNAL_ERROR",
              message: "Erro ao enriquecer lead",
            },
          }),
      });

      const { result } = renderHook(() => useEnrichPersistedLead(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate("lead-123");
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(mockToast.error).toHaveBeenCalledWith("Erro ao enriquecer lead");
    });
  });
});

// ==============================================
// TESTS - useBulkEnrichPersistedLeads
// ==============================================

describe("useBulkEnrichPersistedLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("returns initial idle state", () => {
      const { result } = renderHook(() => useBulkEnrichPersistedLeads(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe("successful bulk enrichment", () => {
    it("enriches multiple leads and shows success toast with counts", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockBulkResult }),
      });

      const { result } = renderHook(() => useBulkEnrichPersistedLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(["lead-1", "lead-2", "lead-3"]);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        "2 leads enriquecidos, 1 não encontrados"
      );
    });

    it("calls correct API endpoint with lead IDs", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: mockBulkResult }),
      });
      global.fetch = fetchMock;

      const { result } = renderHook(() => useBulkEnrichPersistedLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(["lead-1", "lead-2"]);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/leads/enrich/bulk",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: ["lead-1", "lead-2"] }),
        })
      );
    });

    it("shows warning when all leads not found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { enriched: 0, notFound: 3, failed: 0, leads: [] },
          }),
      });

      const { result } = renderHook(() => useBulkEnrichPersistedLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(["lead-1", "lead-2", "lead-3"]);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockToast.warning).toHaveBeenCalledWith(
        "3 leads não encontrados no Apollo"
      );
    });

    it("shows error when no leads could be enriched", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { enriched: 0, notFound: 0, failed: 0, leads: [] },
          }),
      });

      const { result } = renderHook(() => useBulkEnrichPersistedLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(["lead-1"]);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        "Nenhum lead pôde ser enriquecido"
      );
    });
  });

  describe("error handling", () => {
    it("shows error toast on API failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              code: "INTERNAL_ERROR",
              message: "Erro ao enriquecer leads",
            },
          }),
      });

      const { result } = renderHook(() => useBulkEnrichPersistedLeads(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(["lead-1"]);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(mockToast.error).toHaveBeenCalledWith("Erro ao enriquecer leads");
    });
  });
});
