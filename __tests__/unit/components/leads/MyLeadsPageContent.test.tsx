/**
 * Tests for MyLeadsPageContent Component
 * Story 4.2.2: My Leads Page
 *
 * AC: #2, #3, #4, #5, #6, #7 - Main content component tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyLeadsPageContent } from "@/components/leads/MyLeadsPageContent";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/leads/my-leads"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock hooks
vi.mock("@/hooks/use-segments", () => ({
  useSegments: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useCreateSegment: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/hooks/use-import-leads-csv", () => ({
  useImportLeadsCsv: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/lib/utils/csv-parser", () => ({
  parseCSVData: vi.fn(() => ({ headers: [], rows: [] })),
  detectLeadColumnMappings: vi.fn(() => ({})),
}));

vi.mock("@/stores/use-selection-store", () => ({
  useSelectionStore: vi.fn(() => ({
    selectedIds: [],
    setSelectedIds: vi.fn(),
    clearSelection: vi.fn(),
  })),
}));

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

describe("MyLeadsPageContent", () => {
  const mockLeads = [
    {
      id: "lead-1",
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      companyName: "Acme Inc",
      status: "novo",
      hasEmail: true,
      hasDirectPhone: null,
      createdAt: "2026-01-30T10:00:00Z",
    },
    {
      id: "lead-2",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      companyName: "Tech Corp",
      status: "interessado",
      hasEmail: true,
      hasDirectPhone: "Yes",
      createdAt: "2026-01-29T10:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show loading skeleton initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    // Should show loading state (skeleton has specific classes)
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("should show empty state when no leads", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 25, totalPages: 0 },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByText("Nenhum lead importado ainda")
      ).toBeInTheDocument();
    });
  });

  it("should render leads table when leads exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("2 leads importados")).toBeInTheDocument();
    });

    // Check leads are rendered
    expect(screen.getByText(/John/)).toBeInTheDocument();
    expect(screen.getByText(/Jane/)).toBeInTheDocument();
  });

  it("should show filter bar", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 25, totalPages: 0 },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("my-leads-filter-bar")).toBeInTheDocument();
    });
  });

  it("should show pagination when multiple pages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 50, page: 1, limit: 25, totalPages: 2 },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Mostrando 1-25 de 50 leads/)).toBeInTheDocument();
    });

    // Check pagination controls
    expect(screen.getByLabelText("Próxima página")).toBeInTheDocument();
    expect(screen.getByLabelText("Página anterior")).toBeInTheDocument();
  });

  it("should show 'Criar Lead' button when leads exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("create-lead-button")).toBeInTheDocument();
    });
  });

  it("should show 'Criar Manualmente' button in empty state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: 25, totalPages: 0 },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByTestId("empty-state-create-lead-button")
      ).toBeInTheDocument();
    });
  });

  it("should show error state on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          error: { code: "INTERNAL_ERROR", message: "Erro ao buscar leads" },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Erro ao buscar leads/)).toBeInTheDocument();
    });
  });

  // Story 12.2: AC #1 - Import CSV button opens dialog
  it("should show 'Importar CSV' button and open dialog on click", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: mockLeads,
          meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
        }),
    });

    render(<MyLeadsPageContent />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("import-csv-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("import-csv-button"));

    await waitFor(() => {
      expect(screen.getByText("Importar Leads")).toBeInTheDocument();
    });
  });
});
