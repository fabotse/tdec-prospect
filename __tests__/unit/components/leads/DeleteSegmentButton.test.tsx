/**
 * DeleteSegmentButton Component Tests
 * Story 4.1: Lead Segments/Lists
 *
 * Reusable delete button + confirmation dialog for segments.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DeleteSegmentButton } from "@/components/leads/DeleteSegmentButton";
import type { SegmentWithCount } from "@/types/segment";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockSegment: SegmentWithCount = {
  id: "segment-1",
  tenantId: "tenant-1",
  name: "Hot Leads",
  description: "High priority leads",
  createdAt: "2026-01-30T10:00:00Z",
  updatedAt: "2026-01-30T10:00:00Z",
  leadCount: 25,
};

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

describe("DeleteSegmentButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ deleted: true }),
    });
  });

  it("renders a trash button for the segment", () => {
    render(<DeleteSegmentButton segment={mockSegment} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId("delete-segment-segment-1")).toBeInTheDocument();
  });

  it("opens the confirmation dialog when clicked", async () => {
    render(<DeleteSegmentButton segment={mockSegment} />, {
      wrapper: createWrapper(),
    });

    await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

    await waitFor(() => {
      expect(screen.getByText("Remover segmento?")).toBeInTheDocument();
    });
    expect(screen.getByText(/Hot Leads/)).toBeInTheDocument();
    expect(
      screen.getByText(/Os leads não serão excluídos/)
    ).toBeInTheDocument();
  });

  it("does not propagate the click to a parent handler", async () => {
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick} data-testid="parent">
        <DeleteSegmentButton segment={mockSegment} />
      </div>,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

    await waitFor(() => {
      expect(screen.getByText("Remover segmento?")).toBeInTheDocument();
    });
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("notifies onOpenChange when the dialog opens", async () => {
    const onOpenChange = vi.fn();

    render(
      <DeleteSegmentButton segment={mockSegment} onOpenChange={onOpenChange} />,
      { wrapper: createWrapper() }
    );

    await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  it("deletes the segment and shows success toast on confirm", async () => {
    render(<DeleteSegmentButton segment={mockSegment} />, {
      wrapper: createWrapper(),
    });

    await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /remover/i })
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/segments/segment-1", {
        method: "DELETE",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Segmento removido");
  });

  it("shows an error toast when deletion fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Erro ao remover segmento" } }),
    });

    render(<DeleteSegmentButton segment={mockSegment} />, {
      wrapper: createWrapper(),
    });

    await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /remover/i })
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao remover segmento");
    });
  });

  it("shows the pending state while the delete is in flight", async () => {
    // DELETE never resolves during the assertion window
    let resolveDelete: (value: unknown) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        })
    );

    render(<DeleteSegmentButton segment={mockSegment} />, {
      wrapper: createWrapper(),
    });

    await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /remover/i })
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /remover/i }));

    await waitFor(() => {
      expect(screen.getByText("Removendo...")).toBeInTheDocument();
    });

    // Cleanup: let the mutation settle
    resolveDelete({ ok: true, json: async () => ({ deleted: true }) });
  });

  it("does not delete when cancel is clicked", async () => {
    render(<DeleteSegmentButton segment={mockSegment} />, {
      wrapper: createWrapper(),
    });

    await userEvent.click(screen.getByTestId("delete-segment-segment-1"));

    await waitFor(() => {
      expect(screen.getByText("Cancelar")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Cancelar"));

    await waitFor(() => {
      expect(screen.queryByText("Remover segmento?")).not.toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
