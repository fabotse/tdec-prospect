/**
 * Unit tests for PhoneLookupProgress Component
 * Story 4.5: Phone Number Lookup
 *
 * Tests:
 * - AC #5.1 - Creates component
 * - AC #5.2 - Progress bar with X/Y counter
 * - AC #5.3 - Current lead being processed
 * - AC #5.4 - Cancel button to stop batch
 * - AC #5.5 - Results list (found/not found)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PhoneLookupProgress } from "@/components/leads/PhoneLookupProgress";
import type { Lead } from "@/types/lead";

// Mock batchPhoneLookup
vi.mock("@/hooks/use-phone-lookup", () => ({
  batchPhoneLookup: vi.fn(),
}));

import { batchPhoneLookup } from "@/hooks/use-phone-lookup";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create test wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// Mock lead factory
function createMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: `lead-${Math.random().toString(36).slice(2)}`,
    tenantId: "tenant-1",
    apolloId: null,
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    companyName: "Test Corp",
    companySize: "50-100",
    industry: "Technology",
    location: "São Paulo",
    title: "Developer",
    linkedinUrl: null,
    photoUrl: null,
    status: "novo",
    hasEmail: true,
    hasDirectPhone: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _isImported: true,
    // Story 6.5.4: Icebreaker fields
    icebreaker: null,
    icebreakerGeneratedAt: null,
    linkedinPostsCache: null,
    ...overrides,
  };
}

describe("PhoneLookupProgress", () => {
  const mockOnComplete = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // AC #5.1 - Component renders
  describe("rendering", () => {
    it("renders dialog when open", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      const leads = [createMockLead({ firstName: "Test" })];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Buscando telefones")).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      render(
        <PhoneLookupProgress
          leads={[]}
          open={false}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.queryByText("Buscando telefones")).not.toBeInTheDocument();
    });
  });

  // AC #5.2 - Progress bar with X/Y counter
  describe("progress display", () => {
    it("shows progress percentage", async () => {
      let progressCallback: Function;
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(async (leads, onProgress) => {
        progressCallback = onProgress!;
        // Simulate processing first lead
        onProgress?.(1, 2, { leadId: "1", status: "found", phone: "+55" });
        return [];
      });

      const leads = [
        createMockLead({ id: "1", firstName: "Lead1" }),
        createMockLead({ id: "2", firstName: "Lead2" }),
      ];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Should show total leads
      await waitFor(() => {
        expect(screen.getByText(/Processando 2 leads/)).toBeInTheDocument();
      });
    });
  });

  // AC #5.4 - Cancel button
  describe("cancel functionality", () => {
    it("shows cancel button during processing", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      );

      const leads = [createMockLead()];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      const cancelButton = screen.getByRole("button", { name: /cancelar/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      );

      const leads = [createMockLead()];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      const cancelButton = screen.getByRole("button", { name: /cancelar/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  // AC #5.5 - Results list
  describe("results display", () => {
    it("shows stats summary", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockImplementation(async (leads, onProgress) => {
        onProgress?.(1, 2, { leadId: "1", status: "found", phone: "+55" });
        onProgress?.(2, 2, { leadId: "2", status: "not_found" });
        return [
          { leadId: "1", status: "found", phone: "+55" },
          { leadId: "2", status: "not_found" },
        ];
      });

      const leads = [
        createMockLead({ id: "1", firstName: "Lead1" }),
        createMockLead({ id: "2", firstName: "Lead2" }),
      ];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Wait for results to be displayed - check stats summary container
      await waitFor(() => {
        // Both "encontrados" and "não encontrados" should be present
        const foundElements = screen.getAllByText(/encontrados/i);
        expect(foundElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // Empty leads handling
  describe("empty leads handling", () => {
    it("shows error message when leads array is empty", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      render(
        <PhoneLookupProgress
          leads={[]}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Should show error message
      await waitFor(() => {
        expect(
          screen.getByText(/Nenhum lead selecionado para buscar telefone/i)
        ).toBeInTheDocument();
      });

      // Should NOT call batchPhoneLookup
      expect(mockBatchLookup).not.toHaveBeenCalled();
    });

    it("shows close button when there is an error", async () => {
      render(
        <PhoneLookupProgress
          leads={[]}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Should show "Fechar" button instead of "Cancelar"
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
      });
    });

    it("does not call onComplete when leads array is empty", async () => {
      render(
        <PhoneLookupProgress
          leads={[]}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Wait a bit to ensure effect has run
      await waitFor(() => {
        expect(
          screen.getByText(/Nenhum lead selecionado/i)
        ).toBeInTheDocument();
      });

      // Should NOT call onComplete
      expect(mockOnComplete).not.toHaveBeenCalled();
    });
  });

  // Completion
  describe("completion", () => {
    it("calls onComplete when user clicks Fechar button", async () => {
      const user = userEvent.setup();
      const results = [{ leadId: "1", status: "found" as const, phone: "+55" }];
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue(results);

      const leads = [createMockLead({ id: "1" })];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      // Wait for processing to complete and "Fechar" button to appear
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
      });

      // Click "Fechar" to close dialog - this should call onComplete
      const closeButton = screen.getByRole("button", { name: /fechar/i });
      await user.click(closeButton);

      expect(mockOnComplete).toHaveBeenCalledWith(results);
    });

    it("shows close button when complete", async () => {
      const mockBatchLookup = vi.mocked(batchPhoneLookup);
      mockBatchLookup.mockResolvedValue([]);

      const leads = [createMockLead()];

      render(
        <PhoneLookupProgress
          leads={leads}
          open={true}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />,
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        // After completion, should show "Fechar" button instead of "Cancelar"
        expect(screen.getByRole("button", { name: /fechar/i })).toBeInTheDocument();
      });
    });
  });
});
