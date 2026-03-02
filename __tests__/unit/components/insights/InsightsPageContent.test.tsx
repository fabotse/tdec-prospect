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

// Mock WhatsApp send from insight hook (Story 13.7)
const mockSendWhatsApp = vi.fn();
vi.mock("@/hooks/use-whatsapp-send-from-insight", () => ({
  useWhatsAppSendFromInsight: () => ({
    send: mockSendWhatsApp,
    isSending: false,
    error: null,
    lastResult: null,
  }),
}));

// Mock WhatsAppComposerDialog (Story 13.7)
vi.mock("@/components/tracking/WhatsAppComposerDialog", () => ({
  WhatsAppComposerDialog: ({ open, onOpenChange, onSend, initialMessage }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSend?: (data: { phone: string; message: string }) => void;
    initialMessage?: string;
  }) => {
    if (!open) return null;
    return React.createElement("div", { "data-testid": "whatsapp-composer-dialog" },
      React.createElement("span", { "data-testid": "whatsapp-initial-message" }, initialMessage),
      React.createElement("button", {
        "data-testid": "whatsapp-dialog-send",
        onClick: () => onSend?.({ phone: "+5511999999999", message: "Test message" }),
      }, "Send"),
      React.createElement("button", {
        "data-testid": "whatsapp-dialog-close",
        onClick: () => onOpenChange(false),
      }, "Close"),
    );
  },
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
    phone: "+5511999999999",
    email: "john@acme.com",
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

  // Story 13.7: WhatsApp Composer Dialog integration
  describe("WhatsApp Dialog (Story 13.7)", () => {
    function setupWithInsights() {
      mockUseLeadInsights.mockReturnValue({
        insights: [mockInsight],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
        isLoading: false,
        error: null,
      });
    }

    it("should open WhatsApp dialog when WhatsApp button clicked", async () => {
      const user = userEvent.setup();
      setupWithInsights();

      render(<InsightsPageContent />, { wrapper: createWrapper() });

      // Click the WhatsApp button
      await user.click(screen.getByTestId("insight-whatsapp-button"));

      expect(screen.getByTestId("whatsapp-composer-dialog")).toBeInTheDocument();
    });

    it("should pass suggestion as initialMessage", async () => {
      const user = userEvent.setup();
      setupWithInsights();

      render(<InsightsPageContent />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId("insight-whatsapp-button"));

      expect(screen.getByTestId("whatsapp-initial-message")).toHaveTextContent("Approach suggestion");
    });

    it("should close dialog when close button clicked", async () => {
      const user = userEvent.setup();
      setupWithInsights();

      render(<InsightsPageContent />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId("insight-whatsapp-button"));
      expect(screen.getByTestId("whatsapp-composer-dialog")).toBeInTheDocument();

      await user.click(screen.getByTestId("whatsapp-dialog-close"));
      expect(screen.queryByTestId("whatsapp-composer-dialog")).not.toBeInTheDocument();
    });

    it("should call sendWhatsApp with correct params on send", async () => {
      const user = userEvent.setup();
      setupWithInsights();
      mockSendWhatsApp.mockResolvedValue(true);

      render(<InsightsPageContent />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId("insight-whatsapp-button"));
      await user.click(screen.getByTestId("whatsapp-dialog-send"));

      await waitFor(() => {
        expect(mockSendWhatsApp).toHaveBeenCalledWith({
          leadId: "l1",
          insightId: "insight-1",
          phone: "+5511999999999",
          message: "Test message",
        });
      });
    });

    it("should close dialog on successful send", async () => {
      const user = userEvent.setup();
      setupWithInsights();
      mockSendWhatsApp.mockResolvedValue(true);

      render(<InsightsPageContent />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId("insight-whatsapp-button"));
      await user.click(screen.getByTestId("whatsapp-dialog-send"));

      await waitFor(() => {
        expect(screen.queryByTestId("whatsapp-composer-dialog")).not.toBeInTheDocument();
      });
    });

    it("should NOT close dialog on failed send", async () => {
      const user = userEvent.setup();
      setupWithInsights();
      mockSendWhatsApp.mockResolvedValue(false);

      render(<InsightsPageContent />, { wrapper: createWrapper() });

      await user.click(screen.getByTestId("insight-whatsapp-button"));
      await user.click(screen.getByTestId("whatsapp-dialog-send"));

      await waitFor(() => {
        expect(screen.getByTestId("whatsapp-composer-dialog")).toBeInTheDocument();
      });
    });
  });
});
