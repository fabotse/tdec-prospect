/**
 * Tests for InsightsPageContent Component
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #2, #7, #8, #9 - Main page content with filters, table, pagination, empty state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { InsightsPageContent } from "@/components/insights/InsightsPageContent";

// Mock hooks
const mockUseLeadInsights = vi.fn();
const mockMutate = vi.fn();
const mockUseUpdateInsightStatus = vi.fn();

vi.mock("@/hooks/use-lead-insights", () => ({
  useLeadInsights: (...args: unknown[]) => mockUseLeadInsights(...args),
  useUpdateInsightStatus: () => mockUseUpdateInsightStatus(),
}));

// Mock clipboard
vi.mock("@/lib/utils/clipboard", () => ({
  copyToClipboard: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

const mockInsight = {
  id: "insight-1",
  tenantId: "t1",
  leadId: "l1",
  postUrl: "https://linkedin.com/post/1",
  postText: "AI post",
  postPublishedAt: null,
  relevanceReasoning: null,
  suggestion: "Approach suggestion",
  status: "new" as const,
  createdAt: "2026-02-25T10:00:00Z",
  updatedAt: "2026-02-25T10:00:00Z",
  lead: {
    id: "l1",
    firstName: "John",
    lastName: "Doe",
    photoUrl: null,
    companyName: "Acme",
    title: "CTO",
    linkedinUrl: null,
  },
};

describe("InsightsPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateInsightStatus.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it("should render loading skeleton when loading", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [],
      meta: null,
      isLoading: true,
      error: null,
    });

    // Loading state shows animated pulse divs
    const { container } = render(<InsightsPageContent />, { wrapper: createWrapper() });
    const pulseElements = container.querySelectorAll(".animate-pulse");
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it("should render error state", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [],
      meta: null,
      isLoading: false,
      error: "Erro de teste",
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    expect(screen.getByText("Erro: Erro de teste")).toBeInTheDocument();
  });

  it("should render empty state when no insights", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [],
      meta: { total: 0, page: 1, limit: 25, totalPages: 0 },
      isLoading: false,
      error: null,
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    expect(screen.getByText("Nenhum insight ainda")).toBeInTheDocument();
  });

  it("should render table when insights exist", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [mockInsight],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      isLoading: false,
      error: null,
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("1 insight")).toBeInTheDocument();
  });

  it("should pluralize insight count", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [mockInsight, { ...mockInsight, id: "i2" }],
      meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
      isLoading: false,
      error: null,
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    expect(screen.getByText("2 insights")).toBeInTheDocument();
  });

  it("should render filters", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [],
      meta: { total: 0, page: 1, limit: 25, totalPages: 0 },
      isLoading: false,
      error: null,
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    expect(screen.getByText("Todos os Status")).toBeInTheDocument();
    expect(screen.getByText("Todo o periodo")).toBeInTheDocument();
  });

  it("should render pagination when multiple pages", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [mockInsight],
      meta: { total: 50, page: 1, limit: 25, totalPages: 2 },
      isLoading: false,
      error: null,
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Pagina anterior")).toBeDisabled();
    expect(screen.getByLabelText("Proxima pagina")).not.toBeDisabled();
  });

  it("should not render pagination for single page", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [mockInsight],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
      isLoading: false,
      error: null,
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    expect(screen.queryByLabelText("Pagina anterior")).not.toBeInTheDocument();
  });

  it("should pass filters to useLeadInsights hook", () => {
    mockUseLeadInsights.mockReturnValue({
      insights: [],
      meta: null,
      isLoading: false,
      error: null,
    });

    render(<InsightsPageContent />, { wrapper: createWrapper() });

    // Default filters
    expect(mockUseLeadInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        period: "all",
        page: 1,
        perPage: 25,
      })
    );
  });
});
