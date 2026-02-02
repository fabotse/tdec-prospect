/**
 * Lead Import Hook Tests
 * Story 4.2.1: Lead Import Mechanism
 *
 * AC: #1 - Import button saves selected leads to database
 * AC: #4 - Bulk import with correct count
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useImportLeads } from "@/hooks/use-import-leads";
import { toast } from "sonner";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

// Sample lead data for import
const sampleLeads = [
  {
    apolloId: "apollo-123",
    firstName: "João",
    lastName: "Silva",
    email: "joao@example.com",
    phone: "+5511999999999",
    companyName: "Empresa ABC",
    companySize: "51-200",
    industry: "Technology",
    location: "São Paulo, BR",
    title: "CEO",
    linkedinUrl: "https://linkedin.com/in/joaosilva",
    hasEmail: true,
    hasDirectPhone: "Yes",
  },
  {
    apolloId: "apollo-456",
    firstName: "Maria",
    lastName: "Santos",
    email: "maria@example.com",
    phone: null,
    companyName: "Empresa XYZ",
    companySize: "11-50",
    industry: "Finance",
    location: "Rio de Janeiro, BR",
    title: "CTO",
    linkedinUrl: null,
    hasEmail: true,
    hasDirectPhone: "No",
  },
];

describe("useImportLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==============================================
  // AC #1: Import button saves selected leads
  // ==============================================

  it("calls the correct API endpoint with lead data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { imported: 2, existing: 0, leads: [] },
        message: "2 leads importados",
      }),
    });

    const { result } = renderHook(() => useImportLeads(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(sampleLeads);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/leads/import",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: sampleLeads }),
        })
      );
    });
  });

  it("shows success toast on successful import", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { imported: 2, existing: 0 },
        message: "2 leads importados",
      }),
    });

    const { result } = renderHook(() => useImportLeads(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(sampleLeads);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("2 leads importados");
    });
  });

  // ==============================================
  // AC #4: Bulk import with correct count
  // ==============================================

  it("shows correct message when some leads already exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { imported: 1, existing: 1 },
        message: "1 lead importado (1 já existia)",
      }),
    });

    const { result } = renderHook(() => useImportLeads(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(sampleLeads);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "1 lead importado (1 já existia)"
      );
    });
  });

  it("shows message when all leads already exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { imported: 0, existing: 2 },
        message: "Todos os 2 leads já estavam importados",
      }),
    });

    const { result } = renderHook(() => useImportLeads(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(sampleLeads);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Todos os 2 leads já estavam importados"
      );
    });
  });

  // ==============================================
  // Error handling
  // ==============================================

  it("shows error toast on failed import", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { message: "Erro ao importar leads" },
      }),
    });

    const { result } = renderHook(() => useImportLeads(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(sampleLeads);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao importar leads");
    });
  });

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useImportLeads(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(sampleLeads);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // ==============================================
  // Loading state
  // ==============================================

  it("tracks pending state during import", async () => {
    let resolvePromise: (value: unknown) => void;
    const responsePromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValue(responsePromise);

    const { result } = renderHook(() => useImportLeads(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(false);

    result.current.mutate(sampleLeads);

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    resolvePromise!({
      ok: true,
      json: async () => ({
        data: { imported: 2, existing: 0 },
        message: "2 leads importados",
      }),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});
