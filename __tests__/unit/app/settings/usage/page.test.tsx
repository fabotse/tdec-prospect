/**
 * UsagePage Component Tests
 * Story: 6.5.8 - Apify Cost Tracking
 *
 * AC #3: Admin Settings Page - Usage Section
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UsagePage from "@/app/(dashboard)/settings/usage/page";
import type { UsageStatisticsResponse } from "@/types/api-usage";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const mockResponse: UsageStatisticsResponse = {
  statistics: [
    {
      serviceName: "apify",
      totalCalls: 150,
      totalPosts: 450,
      totalCost: 0.45,
      avgPostsPerLead: 3.0,
      lastUsage: "2026-02-04T14:30:00Z",
    },
  ],
  period: {
    startDate: "2026-02-01T00:00:00Z",
    endDate: "2026-03-01T00:00:00Z",
  },
};

describe("UsagePage (AC #3)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders page header correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      expect(screen.getByText("Uso da API")).toBeInTheDocument();
      expect(
        screen.getByText(/Monitore o uso e custos estimados/)
      ).toBeInTheDocument();
    });

    it("renders date range selector", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      expect(screen.getByTestId("date-range-select")).toBeInTheDocument();
    });

    it("renders usage cards for services", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("Apify - Icebreakers Premium")).toBeInTheDocument();
        expect(screen.getByText("Apollo - Busca de Leads")).toBeInTheDocument();
      });
    });

    it("renders info section about costs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      expect(screen.getByText(/Sobre os custos:/)).toBeInTheDocument();
      expect(screen.getByText(/~\$1 por 1.000 posts/)).toBeInTheDocument();
    });
  });

  describe("Date Range Selection (AC #3)", () => {
    it("defaults to 'Este mes'", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      const select = screen.getByTestId("date-range-select");
      expect(select).toHaveTextContent("Este mês");
    });

    it("shows custom date inputs when 'Personalizado' is selected", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      // Open select and choose custom
      const selectTrigger = screen.getByTestId("date-range-select");
      fireEvent.click(selectTrigger);

      await waitFor(() => {
        const customOption = screen.getByText("Personalizado");
        fireEvent.click(customOption);
      });

      // Wait for custom date inputs to appear
      await waitFor(() => {
        expect(screen.getByTestId("custom-start-date")).toBeInTheDocument();
        expect(screen.getByTestId("custom-end-date")).toBeInTheDocument();
      });
    });
  });

  describe("Error Handling (M4)", () => {
    it("shows error message when fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Erro ao buscar estatísticas de uso" },
          }),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Erro ao carregar dados de uso/)).toBeInTheDocument();
      });
    });

    it("shows retry button when error occurs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Erro de conexão" },
          }),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId("retry-button")).toBeInTheDocument();
        expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
      });
    });

    it("refetches data when retry button is clicked", async () => {
      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: { message: "Erro" },
          }),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId("retry-button")).toBeInTheDocument();
      });

      // Setup success response for retry
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Click retry
      fireEvent.click(screen.getByTestId("retry-button"));

      // Verify fetch was called again
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Statistics Display", () => {
    it("displays Apify statistics correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByTestId("usage-calls-apify")).toHaveTextContent("150");
        expect(screen.getByTestId("usage-cost-apify")).toHaveTextContent("$0.4500");
        expect(screen.getByTestId("usage-posts-apify")).toHaveTextContent("450");
      });
    });

    it("shows empty state for Apollo when no data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      render(<UsagePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Apollo should show "Nenhum uso registrado" since mockResponse only has apify data
        const apolloCards = screen.getAllByText("Nenhum uso registrado");
        expect(apolloCards.length).toBeGreaterThan(0);
      });
    });
  });
});
