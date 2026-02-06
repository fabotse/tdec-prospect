/**
 * SegmentFilter Component Tests
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #3 - Filter leads by segment
 * AC: #4 - Show segment list with lead counts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SegmentFilter } from "@/components/leads/SegmentFilter";

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

describe("SegmentFilter", () => {
  const mockOnSegmentChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockSegments }),
    });
  });

  describe("Rendering", () => {
    it("renders trigger button", () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("segment-filter-trigger")).toBeInTheDocument();
    });

    it("shows 'Segmentos' when no segment selected", () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Segmentos")).toBeInTheDocument();
    });

    it("shows selected segment name when segment selected", async () => {
      render(
        <SegmentFilter
          selectedSegmentId="segment-1"
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(screen.getByText("Hot Leads")).toBeInTheDocument();
      });
    });
  });

  describe("Dropdown Content (AC: #4)", () => {
    it("shows loading state while fetching", async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: mockSegments }),
                }),
              100
            )
          )
      );

      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      expect(screen.getByTestId("segment-filter-loading")).toBeInTheDocument();
    });

    it("shows 'Todos os Leads' option", async () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-all")).toBeInTheDocument();
      });
      expect(screen.getByText("Todos os Leads")).toBeInTheDocument();
    });

    it("shows segment list with names and counts", async () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-item-segment-1")).toBeInTheDocument();
      });
      expect(screen.getByText("Hot Leads")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText("Cold Leads")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("shows create segment option", async () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-create")).toBeInTheDocument();
      });
      expect(screen.getByText("Criar Segmento")).toBeInTheDocument();
    });
  });

  describe("Filter Selection (AC: #3)", () => {
    it("calls onSegmentChange with null when 'Todos os Leads' clicked", async () => {
      render(
        <SegmentFilter
          selectedSegmentId="segment-1"
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-all")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-filter-all"));

      expect(mockOnSegmentChange).toHaveBeenCalledWith(null);
    });

    it("calls onSegmentChange with segment id when segment clicked", async () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-item-segment-1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-filter-item-segment-1"));

      expect(mockOnSegmentChange).toHaveBeenCalledWith("segment-1");
    });

    it("shows checkmark on selected segment", async () => {
      render(
        <SegmentFilter
          selectedSegmentId="segment-1"
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-item-segment-1")).toBeInTheDocument();
      });

      const segmentItem = screen.getByTestId("segment-filter-item-segment-1");
      expect(segmentItem).toHaveTextContent("✓");
    });

    it("shows checkmark on 'Todos os Leads' when no segment selected", async () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-all")).toBeInTheDocument();
      });

      const allOption = screen.getByTestId("segment-filter-all");
      expect(allOption).toHaveTextContent("✓");
    });
  });

  describe("Create Segment", () => {
    it("opens create dialog when create option clicked", async () => {
      render(
        <SegmentFilter
          selectedSegmentId={null}
          onSegmentChange={mockOnSegmentChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("segment-filter-trigger"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-filter-create")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("segment-filter-create"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-name-input")).toBeInTheDocument();
      });
    });
  });
});
