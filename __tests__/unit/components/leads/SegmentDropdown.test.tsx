/**
 * SegmentDropdown Component Tests
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #2 - Add leads to segment via dropdown
 * AC: #4 - Show segment list with lead counts
 * AC: #5 - Delete segment with confirmation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SegmentDropdown } from "@/components/leads/SegmentDropdown";
import type { Lead } from "@/types/lead";

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

import { toast } from "sonner";

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

const mockSelectedLeads: Lead[] = [
  {
    id: "lead-1",
    tenantId: "tenant-1",
    apolloId: "apollo-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    companyName: "Acme Inc",
    companySize: null,
    industry: null,
    location: null,
    title: "CEO",
    linkedinUrl: null,
    status: "novo",
    hasEmail: true,
    hasDirectPhone: null,
    createdAt: "2026-01-30T10:00:00Z",
    updatedAt: "2026-01-30T10:00:00Z",
  },
  {
    id: "lead-2",
    tenantId: "tenant-1",
    apolloId: "apollo-2",
    firstName: "Jane",
    lastName: "Smith",
    email: null,
    phone: null,
    companyName: "Tech Corp",
    companySize: null,
    industry: null,
    location: null,
    title: "CTO",
    linkedinUrl: null,
    status: "novo",
    hasEmail: false,
    hasDirectPhone: null,
    createdAt: "2026-01-30T10:00:00Z",
    updatedAt: "2026-01-30T10:00:00Z",
  },
  {
    id: "lead-3",
    tenantId: "tenant-1",
    apolloId: "apollo-3",
    firstName: "Bob",
    lastName: "Wilson",
    email: null,
    phone: null,
    companyName: "Startup LLC",
    companySize: null,
    industry: null,
    location: null,
    title: "VP Sales",
    linkedinUrl: null,
    status: "novo",
    hasEmail: false,
    hasDirectPhone: null,
    createdAt: "2026-01-30T10:00:00Z",
    updatedAt: "2026-01-30T10:00:00Z",
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

describe("SegmentDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for fetching segments
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockSegments }),
    });
  });

  describe("Rendering", () => {
    it("renders trigger button with correct text", () => {
      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("segment-dropdown-trigger")).toBeInTheDocument();
      expect(screen.getByText("Adicionar ao Segmento")).toBeInTheDocument();
    });

    it("disables button when no leads selected", () => {
      render(
        <SegmentDropdown selectedLeads={[]} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("segment-dropdown-trigger")).toBeDisabled();
    });

    it("enables button when leads are selected", () => {
      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("segment-dropdown-trigger")).not.toBeDisabled();
    });
  });

  describe("Dropdown Content (AC: #4)", () => {
    it("shows loading state while fetching segments", async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ data: mockSegments }),
        }), 100))
      );

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      expect(screen.getByTestId("segments-loading")).toBeInTheDocument();
    });

    it("shows empty state when no segments exist", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segments-empty")).toBeInTheDocument();
      });
      expect(screen.getByText("Nenhum segmento ainda.")).toBeInTheDocument();
    });

    it("shows segment list with names and lead counts", async () => {
      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-item-segment-1")).toBeInTheDocument();
      });
      expect(screen.getByText("Hot Leads")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText("Cold Leads")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("shows create segment option", async () => {
      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("create-segment-option")).toBeInTheDocument();
      });
      expect(screen.getByText("Criar Segmento")).toBeInTheDocument();
    });
  });

  describe("Add to Segment (AC: #2)", () => {
    it("adds leads to segment when segment clicked", async () => {
      // First call: fetch segments. Second call: add leads
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { added: 3 }, message: "3 leads adicionados" }),
        });

      const onSuccess = vi.fn();

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} onSuccess={onSuccess} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-item-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-item-segment-1"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"apolloId":"apollo-1"'),
        });
      });
    });

    it("shows success toast after adding leads", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { added: 3 } }),
        });

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-item-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-item-segment-1"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("3 leads adicionados ao segmento");
      });
    });

    it("shows error toast on add failure", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: { message: "Erro ao adicionar leads" } }),
        });

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-item-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-item-segment-1"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao adicionar leads");
      });
    });
  });

  describe("Delete Segment (AC: #5)", () => {
    it("shows confirmation dialog when delete clicked", async () => {
      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-segment-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

      await waitFor(() => {
        expect(screen.getByText("Remover segmento?")).toBeInTheDocument();
      });
    });

    it("deletes segment on confirmation", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-segment-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

      await waitFor(() => {
        expect(screen.getByText("Remover")).toBeInTheDocument();
      });

      // Click the Remover button in the confirmation dialog
      await userEvent.click(screen.getByRole("button", { name: /remover/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1", {
          method: "DELETE",
        });
      });
    });

    it("shows success toast after deleting", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-segment-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

      await waitFor(() => {
        expect(screen.getByText("Remover")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /remover/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Segmento removido");
      });
    });

    it("cancels delete when cancel clicked", async () => {
      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-segment-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

      await waitFor(() => {
        expect(screen.getByText("Cancelar")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Cancelar"));

      // Dialog should close, delete should not be called
      await waitFor(() => {
        expect(screen.queryByText("Remover segmento?")).not.toBeInTheDocument();
      });

      // Only the initial fetch for segments should have been called
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge Cases", () => {
    it("handles lead without apolloId by using id as fallback", async () => {
      const leadWithoutApolloId: Lead[] = [
        {
          id: "lead-no-apollo",
          tenantId: "tenant-1",
          apolloId: null,
          firstName: "No Apollo",
          lastName: "Lead",
          email: null,
          phone: null,
          companyName: "Test Corp",
          companySize: null,
          industry: null,
          location: null,
          title: "Manager",
          linkedinUrl: null,
          status: "novo",
          hasEmail: false,
          hasDirectPhone: null,
          createdAt: "2026-01-30T10:00:00Z",
          updatedAt: "2026-01-30T10:00:00Z",
        },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { added: 1 } }),
        });

      render(
        <SegmentDropdown selectedLeads={leadWithoutApolloId} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-item-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-item-segment-1"));

      await waitFor(() => {
        // Should use id as fallback when apolloId is null
        expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"apolloId":"lead-no-apollo"'),
        });
      });
    });

    it("calls onSuccess callback after adding leads successfully", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { added: 3 } }),
        });

      const onSuccess = vi.fn();

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} onSuccess={onSuccess} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-item-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-item-segment-1"));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it("closes dropdown after successfully adding leads", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { added: 3 } }),
        });

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-item-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-item-segment-1"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });

      // Dropdown should be closed
      expect(screen.queryByTestId("segment-item-segment-1")).not.toBeInTheDocument();
    });

    it("shows error toast for delete failure", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockSegments }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: { message: "Erro ao remover segmento" } }),
        });

      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("delete-segment-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

      await waitFor(() => {
        expect(screen.getByText("Remover")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /remover/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao remover segmento");
      });
    });
  });

  describe("Create Segment", () => {
    it("opens create dialog when create option clicked", async () => {
      render(
        <SegmentDropdown selectedLeads={mockSelectedLeads} />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-dropdown-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("create-segment-option")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("create-segment-option"));

      await waitFor(() => {
        expect(screen.getByText("Criar Segmento")).toBeInTheDocument();
        expect(screen.getByTestId("segment-name-input")).toBeInTheDocument();
      });
    });
  });
});
