/**
 * Integration Tests for CampaignAnalyticsPage
 * Story 10.4: Campaign Analytics Dashboard UI
 * Story 10.6: Janela de Oportunidade — Engine + Config
 *
 * AC: #1 — Dashboard com cards de metricas
 * AC: #2 — Skeleton loading state
 * AC: #4 — Sync manual com toast
 * AC: #5 — Estado vazio quando campanha nao exportada
 * AC 10.6 #4, #5 — ThresholdConfig integrado na pagina
 */

import React, { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CampaignAnalyticsPage from "@/app/(dashboard)/campaigns/[campaignId]/analytics/page";
import { createMockCampaignAnalytics, createMockLeadTracking, createMockOpportunityConfig, createMockOpportunityLead } from "../../../helpers/mock-data";

// Mock hooks
const mockUseCampaign = vi.fn();
const mockUseCampaignAnalytics = vi.fn();
const mockUseSyncAnalytics = vi.fn();
const mockUseLeadTracking = vi.fn();
const mockUseOpportunityConfig = vi.fn();
const mockUseSaveOpportunityConfig = vi.fn();

vi.mock("@/hooks/use-campaigns", () => ({
  useCampaign: (...args: unknown[]) => mockUseCampaign(...args),
}));

vi.mock("@/hooks/use-campaign-analytics", () => ({
  useCampaignAnalytics: (...args: unknown[]) => mockUseCampaignAnalytics(...args),
  useSyncAnalytics: (...args: unknown[]) => mockUseSyncAnalytics(...args),
}));

const mockUseSentLeadEmails = vi.fn();
vi.mock("@/hooks/use-lead-tracking", () => ({
  useLeadTracking: (...args: unknown[]) => mockUseLeadTracking(...args),
  useSentLeadEmails: (...args: unknown[]) => mockUseSentLeadEmails(...args),
}));

const mockUseOpportunityLeads = vi.fn();

vi.mock("@/hooks/use-opportunity-window", () => ({
  useOpportunityConfig: (...args: unknown[]) => mockUseOpportunityConfig(...args),
  useSaveOpportunityConfig: (...args: unknown[]) => mockUseSaveOpportunityConfig(...args),
  useOpportunityLeads: (...args: unknown[]) => mockUseOpportunityLeads(...args),
}));

vi.mock("@/lib/services/opportunity-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/opportunity-engine")>();
  return {
    ...actual,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
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

    mockUseOpportunityConfig.mockReturnValue({
      data: null,
      isLoading: false,
    });

    mockUseSaveOpportunityConfig.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    mockUseOpportunityLeads.mockReturnValue([]);

    mockUseSentLeadEmails.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    // Clear localStorage for toast tests
    localStorage.clear();
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

  // ==============================================
  // Story 10.6 — ThresholdConfig integration
  // ==============================================

  it("renderiza ThresholdConfig quando campanha exportada (10.6 AC: #4)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Outbound", externalCampaignId: "ext-123" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: [createMockLeadTracking()],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("threshold-config")).toBeInTheDocument();
      expect(screen.getByText("Janela de Oportunidade")).toBeInTheDocument();
    });
  });

  it("nao renderiza ThresholdConfig quando campanha nao exportada (10.6)", async () => {
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
      expect(screen.queryByTestId("threshold-config")).not.toBeInTheDocument();
    });
  });

  it("passa enabled: hasExternalId para useOpportunityConfig (10.6)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });

    await renderPage();

    expect(mockUseOpportunityConfig).toHaveBeenCalledWith(campaignId, { enabled: true });
  });

  it("chama useSaveOpportunityConfig com campaignId (10.6)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });

    await renderPage();

    expect(mockUseSaveOpportunityConfig).toHaveBeenCalledWith(campaignId);
  });

  it("chama toast.success ao salvar config com sucesso (10.6 AC: #5)", async () => {
    const { toast } = await import("sonner");
    const saveMutate = vi.fn();

    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: [createMockLeadTracking({ openCount: 5, lastOpenAt: "2026-02-09T10:00:00.000Z" })],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });
    mockUseSaveOpportunityConfig.mockReturnValue({
      mutate: saveMutate,
      isPending: false,
    });

    await renderPage();

    // Open ThresholdConfig (collapsible, closed by default)
    const user = userEvent.setup();
    await user.click(screen.getByTestId("threshold-header-toggle"));

    const minOpensInput = screen.getByTestId("min-opens-input");
    fireEvent.change(minOpensInput, { target: { value: "5" } });

    const saveButton = screen.getByTestId("save-config-button");
    await user.click(saveButton);

    // Verify mutate was called and simulate onSuccess callback
    expect(saveMutate).toHaveBeenCalledOnce();
    const [, callbacks] = saveMutate.mock.calls[0];
    callbacks.onSuccess();

    expect(toast.success).toHaveBeenCalledWith("Configuracao salva");
  });

  it("chama toast.error ao falhar ao salvar config (10.6 AC: #5)", async () => {
    const { toast } = await import("sonner");
    const saveMutate = vi.fn();

    mockUseCampaign.mockReturnValue({
      data: { name: "Teste", externalCampaignId: "ext-1" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: [createMockLeadTracking({ openCount: 5, lastOpenAt: "2026-02-09T10:00:00.000Z" })],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });
    mockUseSaveOpportunityConfig.mockReturnValue({
      mutate: saveMutate,
      isPending: false,
    });

    await renderPage();

    // Open ThresholdConfig (collapsible, closed by default)
    const user = userEvent.setup();
    await user.click(screen.getByTestId("threshold-header-toggle"));

    const minOpensInput = screen.getByTestId("min-opens-input");
    fireEvent.change(minOpensInput, { target: { value: "5" } });

    const saveButton = screen.getByTestId("save-config-button");
    await user.click(saveButton);

    // Simulate onError callback
    const [, callbacks] = saveMutate.mock.calls[0];
    callbacks.onError(new Error("Erro ao salvar configuracao"));

    expect(toast.error).toHaveBeenCalledWith("Erro ao salvar configuracao");
  });

  // ==============================================
  // Story 10.7 — OpportunityPanel, badge, toast
  // ==============================================

  it("renderiza OpportunityPanel com leads qualificados (10.7 AC: #1)", async () => {
    const mockOpportunityLeads = [
      createMockOpportunityLead({ leadEmail: "hot@test.com", openCount: 5 }),
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
      data: [createMockLeadTracking()],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });
    mockUseOpportunityLeads.mockReturnValue(mockOpportunityLeads);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("opportunity-panel")).toBeInTheDocument();
    });
  });

  it("exibe badge de leads quentes no header quando ha leads (10.7 AC: #3)", async () => {
    const mockOpportunityLeads = [
      createMockOpportunityLead({ leadEmail: "hot1@test.com" }),
      createMockOpportunityLead({ leadEmail: "hot2@test.com" }),
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
      data: [createMockLeadTracking()],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });
    mockUseOpportunityLeads.mockReturnValue(mockOpportunityLeads);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("hot-leads-badge")).toBeInTheDocument();
      expect(screen.getByText("2 leads quentes")).toBeInTheDocument();
    });
  });

  it("nao exibe badge quando nao ha leads quentes (10.7 AC: #3)", async () => {
    mockUseCampaign.mockReturnValue({
      data: { name: "Outbound", externalCampaignId: "ext-123" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: [createMockLeadTracking()],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });
    mockUseOpportunityLeads.mockReturnValue([]);

    await renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId("hot-leads-badge")).not.toBeInTheDocument();
    });
  });

  it("dispara toast quando ha novos leads qualificados (10.7 AC: #3)", async () => {
    const { toast } = await import("sonner");

    // Simulate previous visit with 1 lead
    localStorage.setItem(`opportunity-seen-${campaignId}`, "1");

    const mockOpportunityLeads = [
      createMockOpportunityLead({ leadEmail: "hot1@test.com" }),
      createMockOpportunityLead({ leadEmail: "hot2@test.com" }),
      createMockOpportunityLead({ leadEmail: "hot3@test.com" }),
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
      data: [createMockLeadTracking()],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });
    mockUseOpportunityLeads.mockReturnValue(mockOpportunityLeads);

    await renderPage();

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        "2 novo(s) lead(s) na Janela de Oportunidade",
        { duration: 5000 }
      );
    });
  });

  it("nao dispara toast no primeiro acesso (10.7 AC: #3)", async () => {
    const { toast } = await import("sonner");

    const mockOpportunityLeads = [
      createMockOpportunityLead({ leadEmail: "hot1@test.com" }),
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
      data: [createMockLeadTracking()],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: createMockOpportunityConfig(),
      isLoading: false,
    });
    mockUseOpportunityLeads.mockReturnValue(mockOpportunityLeads);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("opportunity-panel")).toBeInTheDocument();
    });

    // No toast on first access
    expect(toast.info).not.toHaveBeenCalled();
    // But localStorage should be set
    expect(localStorage.getItem(`opportunity-seen-${campaignId}`)).toBe("1");
  });

  it("passa threshold dinamico para LeadTrackingTable (10.7 AC: #4)", async () => {
    const config = createMockOpportunityConfig({ minOpens: 5 });

    mockUseCampaign.mockReturnValue({
      data: { name: "Outbound", externalCampaignId: "ext-123" },
      isLoading: false,
    });
    mockUseCampaignAnalytics.mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    });
    mockUseLeadTracking.mockReturnValue({
      data: [
        createMockLeadTracking({ leadEmail: "a@x.com", openCount: 5 }),
        createMockLeadTracking({ leadEmail: "b@x.com", openCount: 4 }),
        createMockLeadTracking({ leadEmail: "c@x.com", openCount: 3 }),
      ],
      isLoading: false,
    });
    mockUseOpportunityConfig.mockReturnValue({
      data: config,
      isLoading: false,
    });
    mockUseOpportunityLeads.mockReturnValue([]);

    await renderPage();

    await waitFor(() => {
      // With threshold=5 from config, only openCount=5 should have badge
      const badges = screen.getAllByTestId("high-interest-badge");
      expect(badges).toHaveLength(1);
    });
  });
});
