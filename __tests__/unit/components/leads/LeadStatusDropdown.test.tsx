/**
 * LeadStatusDropdown Component Tests
 * Story 4.2: Lead Status Management
 * Story 4.2.1: Lead Import Mechanism
 *
 * AC: #2 - Change individual status via dropdown
 * Story 4.2.1: AC #2 - Auto-import on status change for unsaved leads
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LeadStatusDropdown } from "@/components/leads/LeadStatusDropdown";
import { createMockLead } from "../../../helpers/mock-data";

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

// ==============================================
// TESTS
// ==============================================

describe("LeadStatusDropdown", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders current status badge", () => {
      render(
        <LeadStatusDropdown lead={createMockLead()} currentStatus="novo" />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText("Novo")).toBeInTheDocument();
    });

    it("shows all status options when clicked", async () => {
      const user = userEvent.setup();

      render(
        <LeadStatusDropdown lead={createMockLead()} currentStatus="novo" />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByText("Novo"));

      // All status options should be visible
      await waitFor(() => {
        expect(screen.getByText("Em Campanha")).toBeInTheDocument();
        expect(screen.getByText("Interessado")).toBeInTheDocument();
        expect(screen.getByText("Oportunidade")).toBeInTheDocument();
        expect(screen.getByText("Não Interessado")).toBeInTheDocument();
      });
    });
  });

  describe("Status change for imported leads", () => {
    it("calls status API directly for imported leads (_isImported: true)", async () => {
      const user = userEvent.setup();
      const lead = createMockLead({ _isImported: true });

      render(
        <LeadStatusDropdown lead={lead} currentStatus="novo" />,
        { wrapper: createWrapper() }
      );

      // Open dropdown
      await user.click(screen.getByText("Novo"));

      // Click on new status
      await waitFor(() => {
        expect(screen.getByText("Interessado")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Interessado"));

      // Verify status API was called (not import API)
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/leads/${lead.id}/status`,
          expect.objectContaining({
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "interessado" }),
          })
        );
      });
    });

    it("does not call API when same status is selected", async () => {
      const user = userEvent.setup();

      render(
        <LeadStatusDropdown lead={createMockLead()} currentStatus="novo" />,
        { wrapper: createWrapper() }
      );

      // Open dropdown
      await user.click(screen.getByText("Novo"));

      // Try to click on the same status (should be disabled)
      await waitFor(() => {
        const novoInDropdown = screen.getAllByText("Novo")[1]; // Second one is in dropdown
        expect(novoInDropdown.closest('[role="menuitem"]')).toHaveAttribute("aria-disabled", "true");
      });
    });
  });

  describe("Auto-import for unsaved leads (Story 4.2.1: AC #2)", () => {
    it("calls import API first for unsaved leads (_isImported: false)", async () => {
      const user = userEvent.setup();
      // Lead with _isImported: false = Apollo-only, not yet saved to DB
      const unsavedLead = createMockLead({
        id: "apollo-12345",
        apolloId: "apollo-12345",
        _isImported: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            imported: 1,
            existing: 0,
            leads: [{ id: "new-uuid-123", apollo_id: "apollo-12345" }],
          },
          message: "1 leads importados",
        }),
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      render(
        <LeadStatusDropdown lead={unsavedLead} currentStatus="novo" />,
        { wrapper: createWrapper() }
      );

      // Open dropdown
      await user.click(screen.getByText("Novo"));

      // Click on new status
      await waitFor(() => {
        expect(screen.getByText("Interessado")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Interessado"));

      // Verify import API was called first
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/leads/import",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
        );
      });
    });
  });

  describe("Undefined/null status", () => {
    it("defaults to 'Novo' when status is undefined", () => {
      render(
        <LeadStatusDropdown lead={createMockLead()} currentStatus={undefined} />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText("Novo")).toBeInTheDocument();
    });

    it("defaults to 'Novo' when status is null", () => {
      render(
        <LeadStatusDropdown lead={createMockLead()} currentStatus={null} />,
        { wrapper: createWrapper() }
      );
      expect(screen.getByText("Novo")).toBeInTheDocument();
    });
  });
});
