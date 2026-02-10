/**
 * Unit Tests for AnalyticsDashboard Component
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #1 — Renderiza composicao completa (header + cards)
 * AC: #2 — Skeleton loading state
 * AC: #3, #4 — SyncIndicator integrado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalyticsDashboard } from "@/components/tracking/AnalyticsDashboard";
import { createMockCampaignAnalytics } from "../../../helpers/mock-data";

describe("AnalyticsDashboard (AC: #1, #2, #3)", () => {
  const mockAnalytics = createMockCampaignAnalytics({
    totalSent: 500,
    totalOpens: 120,
    openRate: 0.24,
  });
  const onSync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza skeleton loading state (AC: #2) (7.3)", () => {
    render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={true}
        lastSyncAt={null}
        onSync={onSync}
        isSyncing={false}
        campaignName="Campanha Teste"
      />
    );

    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-dashboard")).not.toBeInTheDocument();
  });

  it("renderiza dashboard completo quando nao esta carregando (AC: #1) (7.3)", () => {
    render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={false}
        lastSyncAt="2026-02-10T10:00:00.000Z"
        onSync={onSync}
        isSyncing={false}
        campaignName="Campanha Teste"
      />
    );

    expect(screen.getByTestId("analytics-dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-skeleton")).not.toBeInTheDocument();
  });

  it("exibe titulo com nome da campanha (7.3)", () => {
    render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={false}
        lastSyncAt={null}
        onSync={onSync}
        isSyncing={false}
        campaignName="Minha Campanha Outbound"
      />
    );

    expect(screen.getByText("Analytics: Minha Campanha Outbound")).toBeInTheDocument();
  });

  it("renderiza AnalyticsCards com dados (7.3)", () => {
    render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={false}
        lastSyncAt={null}
        onSync={onSync}
        isSyncing={false}
        campaignName="Teste"
      />
    );

    expect(screen.getByTestId("analytics-cards")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("24.0%")).toBeInTheDocument();
  });

  it("renderiza SyncIndicator (AC: #3) (7.3)", () => {
    render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={false}
        lastSyncAt="2026-02-10T10:00:00.000Z"
        onSync={onSync}
        isSyncing={false}
        campaignName="Teste"
      />
    );

    expect(screen.getByTestId("sync-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("sync-button")).toBeInTheDocument();
  });

  it("propaga callback de sync (AC: #4) (7.3)", async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={false}
        lastSyncAt={null}
        onSync={onSync}
        isSyncing={false}
        campaignName="Teste"
      />
    );

    await user.click(screen.getByTestId("sync-button"));
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("propaga isSyncing para SyncIndicator (7.3)", () => {
    render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={false}
        lastSyncAt={null}
        onSync={onSync}
        isSyncing={true}
        campaignName="Teste"
      />
    );

    expect(screen.getByTestId("sync-button")).toBeDisabled();
    expect(screen.getByTestId("sync-button")).toHaveTextContent("Sincronizando...");
  });

  it("skeleton inclui 5 placeholders de cards (AC: #2) (7.3)", () => {
    const { container } = render(
      <AnalyticsDashboard
        analytics={mockAnalytics}
        isLoading={true}
        lastSyncAt={null}
        onSync={onSync}
        isSyncing={false}
        campaignName="Teste"
      />
    );

    const skeletonCards = container.querySelectorAll("[data-slot='skeleton']");
    // 2 header skeletons + 5 card skeletons = 7 total
    expect(skeletonCards.length).toBe(7);
  });
});
