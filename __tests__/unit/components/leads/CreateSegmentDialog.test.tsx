/**
 * CreateSegmentDialog Component Tests
 * Story 4.1: Lead Segments/Lists
 *
 * AC: #1 - Create segment with name and optional description
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CreateSegmentDialog } from "@/components/leads/CreateSegmentDialog";

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

describe("CreateSegmentDialog", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders dialog when open is true", () => {
      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Criar Segmento")).toBeInTheDocument();
    });

    it("does not render dialog when open is false", () => {
      render(
        <CreateSegmentDialog
          open={false}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows input for segment name", () => {
      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("segment-name-input")).toBeInTheDocument();
      expect(screen.getByLabelText("Nome do segmento")).toBeInTheDocument();
    });

    it("shows textarea for description", () => {
      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("segment-description-input")).toBeInTheDocument();
      expect(screen.getByLabelText("Descrição (opcional)")).toBeInTheDocument();
    });

    it("shows Criar and Cancelar buttons", () => {
      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("create-segment-submit")).toBeInTheDocument();
      expect(screen.getByText("Cancelar")).toBeInTheDocument();
    });
  });

  describe("Validation (AC: #1)", () => {
    it("shows error when name is empty on submit", async () => {
      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("create-segment-submit"));

      await waitFor(() => {
        expect(screen.getByTestId("segment-name-error")).toBeInTheDocument();
      });
      expect(screen.getByText("Nome do segmento é obrigatório")).toBeInTheDocument();
    });

    it("does not call API when validation fails", async () => {
      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByTestId("create-segment-submit"));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Submission (AC: #1)", () => {
    it("calls API with segment name and description", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "segment-1",
            name: "Leads Qualificados",
            description: "Leads com alto potencial",
            leadCount: 0,
          },
        }),
      });

      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.type(screen.getByTestId("segment-name-input"), "Leads Qualificados");
      await userEvent.type(screen.getByTestId("segment-description-input"), "Leads com alto potencial");
      await userEvent.click(screen.getByTestId("create-segment-submit"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/segments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"name":"Leads Qualificados"'),
        });
      });
    });

    it("shows loading state during save", async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    data: { id: "1", name: "Test", leadCount: 0 },
                  }),
                }),
              100
            )
          )
      );

      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.type(screen.getByTestId("segment-name-input"), "Test");
      await userEvent.click(screen.getByTestId("create-segment-submit"));

      expect(screen.getByText("Criando...")).toBeInTheDocument();
      expect(screen.getByTestId("create-segment-submit")).toBeDisabled();
    });

    it("shows success toast on create", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "segment-1", name: "My Segment", leadCount: 0 },
        }),
      });

      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.type(screen.getByTestId("segment-name-input"), "My Segment");
      await userEvent.click(screen.getByTestId("create-segment-submit"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Segmento criado");
      });
    });

    it("closes dialog on successful create", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: "segment-1", name: "My Segment", leadCount: 0 },
        }),
      });

      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.type(screen.getByTestId("segment-name-input"), "My Segment");
      await userEvent.click(screen.getByTestId("create-segment-submit"));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it("calls onSuccess callback with created segment", async () => {
      const createdSegment = {
        id: "segment-1",
        name: "My Segment",
        description: null,
        leadCount: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: createdSegment }),
      });

      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onSuccess={mockOnSuccess}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.type(screen.getByTestId("segment-name-input"), "My Segment");
      await userEvent.click(screen.getByTestId("create-segment-submit"));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith(createdSegment);
      });
    });

    it("shows error toast on create failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Já existe um segmento com esse nome" },
        }),
      });

      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.type(screen.getByTestId("segment-name-input"), "Duplicate");
      await userEvent.click(screen.getByTestId("create-segment-submit"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Já existe um segmento com esse nome");
      });
    });
  });

  describe("Dialog Controls", () => {
    it("closes dialog on Cancelar click", async () => {
      render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      await userEvent.click(screen.getByText("Cancelar"));

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it("resets form when dialog reopened", async () => {
      const { rerender } = render(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      // Type in the input
      await userEvent.type(screen.getByTestId("segment-name-input"), "Test");
      expect(screen.getByTestId("segment-name-input")).toHaveValue("Test");

      // Close dialog
      await userEvent.click(screen.getByText("Cancelar"));

      // Reopen dialog
      rerender(
        <CreateSegmentDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />
      );

      // Input should be empty
      expect(screen.getByTestId("segment-name-input")).toHaveValue("");
    });
  });
});
