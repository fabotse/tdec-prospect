/**
 * Tests for ImportCampaignResultsDialog Component
 * Story: 4.7 - Import Campaign Results
 *
 * Note: Tab switching tests are simplified due to Radix UI's rendering behavior
 * in test environments. Complex user interactions are better covered by E2E tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportCampaignResultsDialog } from "@/components/leads/ImportCampaignResultsDialog";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("ImportCampaignResultsDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Dialog rendering", () => {
    it("should render dialog when open", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(
        screen.getByText("Importar Resultados de Campanha")
      ).toBeInTheDocument();
    });

    it("should not render dialog when closed", () => {
      render(
        <ImportCampaignResultsDialog
          open={false}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(
        screen.queryByText("Importar Resultados de Campanha")
      ).not.toBeInTheDocument();
    });

    it("should show upload and paste tabs", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("tab-upload")).toBeInTheDocument();
      expect(screen.getByTestId("tab-paste")).toBeInTheDocument();
    });

    it("should show dialog description", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(
        screen.getByText(/Importe resultados de campanhas externas/)
      ).toBeInTheDocument();
    });
  });

  describe("CSV upload tab", () => {
    it("should show upload dropzone by default", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("upload-dropzone")).toBeInTheDocument();
    });

    it("should have file input accepting CSV", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const fileInput = screen.getByTestId("file-input");
      expect(fileInput).toHaveAttribute("accept", ".csv");
    });

    it("should show file size limit message", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText(/Limite: 5MB/)).toBeInTheDocument();
    });

    it("should show upload instructions", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(
        screen.getByText(/Clique ou arraste um arquivo CSV/)
      ).toBeInTheDocument();
    });
  });

  describe("Tab content", () => {
    it("should have upload tab active by default", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const uploadTab = screen.getByTestId("tab-upload");
      expect(uploadTab).toHaveAttribute("data-state", "active");
    });

    it("should have paste tab inactive by default", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const pasteTab = screen.getByTestId("tab-paste");
      expect(pasteTab).toHaveAttribute("data-state", "inactive");
    });
  });

  describe("Accessibility", () => {
    it("should have dialog title for accessibility", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const title = screen.getByRole("heading", {
        name: /Importar Resultados de Campanha/,
      });
      expect(title).toBeInTheDocument();
    });

    it("should have tab panel role for tabs", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const tabList = screen.getByRole("tablist");
      expect(tabList).toBeInTheDocument();
    });
  });

  describe("Drag and drop functionality (AC #2)", () => {
    // Helper to create mock DataTransfer
    function createMockDataTransfer(files: File[]) {
      return {
        files,
        items: files.map((file) => ({
          kind: "file",
          type: file.type,
          getAsFile: () => file,
        })),
        types: ["Files"],
      };
    }

    it("should show drag-over state when dragging file over dropzone", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const dropzone = screen.getByTestId("upload-dropzone");

      fireEvent.dragOver(dropzone, {
        dataTransfer: createMockDataTransfer([]),
      });

      // Check for visual feedback (border-primary class)
      expect(dropzone.className).toContain("border-primary");
    });

    it("should remove drag-over state when dragging leaves dropzone", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const dropzone = screen.getByTestId("upload-dropzone");

      // First drag over
      fireEvent.dragOver(dropzone, {
        dataTransfer: createMockDataTransfer([]),
      });

      // Then drag leave
      fireEvent.dragLeave(dropzone, {
        dataTransfer: createMockDataTransfer([]),
      });

      // Should not have the drag-over class
      expect(dropzone.className).not.toContain("bg-primary/5");
    });

    it("should accept dropped CSV file", async () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const dropzone = screen.getByTestId("upload-dropzone");
      const csvContent = "email,status\ntest@example.com,replied";
      const file = new File([csvContent], "test.csv", { type: "text/csv" });

      fireEvent.drop(dropzone, {
        dataTransfer: createMockDataTransfer([file]),
      });

      // Should proceed to mapping step (shows column selects)
      await waitFor(() => {
        expect(screen.getByTestId("email-column-select")).toBeInTheDocument();
      });
    });

    it("should show error for files larger than 5MB", async () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const dropzone = screen.getByTestId("upload-dropzone");

      // Create a "large" file by mocking its size
      const file = new File(["x"], "large.csv", { type: "text/csv" });
      Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 }); // 6MB

      fireEvent.drop(dropzone, {
        dataTransfer: createMockDataTransfer([file]),
      });

      await waitFor(() => {
        expect(screen.getByText(/Arquivo muito grande/)).toBeInTheDocument();
      });
    });

    it("should show error for non-CSV files", async () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const dropzone = screen.getByTestId("upload-dropzone");
      const file = new File(["content"], "test.pdf", { type: "application/pdf" });

      fireEvent.drop(dropzone, {
        dataTransfer: createMockDataTransfer([file]),
      });

      await waitFor(() => {
        expect(screen.getByText(/Apenas arquivos CSV/)).toBeInTheDocument();
      });
    });

    it("should handle drag enter event", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      const dropzone = screen.getByTestId("upload-dropzone");

      fireEvent.dragEnter(dropzone, {
        dataTransfer: createMockDataTransfer([]),
      });

      // Should show drag state
      expect(dropzone.className).toContain("border-primary");
    });
  });

  describe("Progress indicator (AC #5)", () => {
    it("should show download template button", () => {
      render(
        <ImportCampaignResultsDialog
          open={true}
          onOpenChange={mockOnOpenChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("download-template-button")).toBeInTheDocument();
    });
  });
});
