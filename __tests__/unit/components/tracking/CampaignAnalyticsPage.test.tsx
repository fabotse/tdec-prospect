/**
 * Integration Tests for CampaignAnalyticsPage
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #1 — Dashboard com cards de metricas
 * AC: #2 — Skeleton loading state
 * AC: #4 — Sync manual com toast
 * AC: #5 — Estado vazio quando campanha nao exportada
 */

import React, { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CampaignAnalyticsPage from "@/app/(dashboard)/campaigns/[campaignId]/analytics/page";
import { createMockCampaignAnalytics, createMockLeadTracking } from "../../../helpers/mock-data";

// Mock hooks
const mockUseCampaign = vi.fn();
const mockUseCampaignAnalytics = vi.fn();
const mockUseSyncAnalytics = vi.fn();
const mockUseLeadTracking = vi.fn();

vi.mock("@/hooks/use-campaigns", () => ({
  useCampaign: (...args: unknown[]) => mockUseCampaign(...args),
}));

vi.mock("@/hooks/use-campaign-analytics", () => ({
  useCampaignAnalytics: (...args: unknown[]) => mockUseCampaignAnalytics(...args),
  useSyncAnalytics: (...args: unknown[]) => mockUseSyncAnalytics(...args),
}));

vi.mock("@/hooks/use-lead-tracking", () => ({
  useLeadTracking: (...args: unknown[]) => mockUseLeadTracking(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

const campaignId = "campaign-uuid-001";

async function renderPage() {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={<div>Loading...</div>}>
        <CampaignAnalyticsPage params={Promise.resolve({ campaignId })} />
      </Suspense>
    );
  });
  return result!;
}

describe("CampaignAnalyticsPage (AC: #1, #2, #4, #5)", () => {
  const mockAnalytics = createMockCampaignAnalytics({ campaignId });
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSyncAnalytics.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });

    mockUseLeadTracking.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it("exibe skeleton loading state (AC: #2) (7.4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    });
  });

  it("exibe estado vazio quando campanha nao tem externalCampaignId (AC: #5) (7.4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Campanha X", externalCampaignId: null },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("analytics-empty-state")).toBeInTheDocument();
      expect(
        screen.getByText("Esta campanha ainda nao foi exportada")
      ).toBeInTheDocument();
    });
  });

  it("exibe dashboard com dados quando campanha tem externalCampaignId (AC: #1) (7.4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Campanha Outbound", externalCampaignId: "ext-123" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("analytics-dashboard")).toBeInTheDocument();
      expect(screen.getByText("Analytics: Campanha Outbound")).toBeInTheDocument();
      expect(screen.getByTestId("analytics-cards")).toBeInTheDocument();
    });
  });

  it("exibe link de volta para campanha (7.4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      const backLink = screen.getByTestId("back-to-campaign");
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute("href", `/campaigns/${campaignId}/edit`);
    });
  });

  it("chama syncAnalytics.mutate ao clicar Sincronizar (AC: #4) (7.4)", async () => {
    const user = userEvent.setup();

    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("sync-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("sync-button"));
    expect(mockMutate).toHaveBeenCalledOnce();
  });

  it("exibe dashboard loading enquanto campaign ou analytics carregam (7.4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    });
  });

  it("exibe sync button desabilitado durante sincronizacao (AC: #4) (7.4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseSyncAnalytics.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("sync-button")).toBeDisabled();
    });
  });

  it("exibe metricas corretas dos analytics (AC: #1) (7.4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: createMockCampaignAnalytics({
        campaignId,
        totalSent: 1000,
        totalOpens: 250,
        openRate: 0.25,
      }),
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("1000")).toBeInTheDocument();
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.getByText("25.0%")).toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 10.5 — LeadTrackingTable integration
  // ==============================================

  it("renderiza LeadTrackingTable abaixo do dashboard quando campanha exportada (10.5)", async () => {
    const mockLeads = [
      createMockLeadTracking({ leadEmail: "maria@empresa.com", openCount: 5 }),
      createMockLeadTracking({ leadEmail: "joao@empresa.com", openCount: 1 }),
    ];

    mockUseCampaign.mockReturnValue({
      data: { name: "Outbound", externalCampaignId: "ext-123" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: mockLeads,
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("analytics-dashboard")).toBeInTheDocument();
      expect(screen.getByTestId("lead-tracking-table")).toBeInTheDocument();
      expect(screen.getByText("maria@empresa.com")).toBeInTheDocument();
      expect(screen.getByText("joao@empresa.com")).toBeInTheDocument();
    });
  });

  it("nao renderiza LeadTrackingTable quando campanha nao exportada (10.5)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: null },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId("lead-tracking-table")).not.toBeInTheDocument();
    });
  });

  it("passa enabled: hasExternalId para useLeadTracking (10.5)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });

    await renderPage();

    expect(mockUseLeadTracking).toHaveBeenCalledWith(campaignId, { enabled: true });
  });

  it("exibe skeleton na LeadTrackingTable enquanto leads carregam (10.5)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId("skeleton-row")).toHaveLength(5);
    });
  });

  it("exibe estado de erro quando useLeadTracking falha (10.5 CR)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("lead-tracking-error")).toBeInTheDocument();
    });
  });
});
