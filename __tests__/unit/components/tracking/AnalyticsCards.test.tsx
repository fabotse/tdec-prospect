/**
 * Unit Tests for AnalyticsCards Component
 * Story 10.4: Campaign Analytics Dashboard UI
 *
 * AC: #1 — Renderiza 5 cards de metricas com valores absolutos e taxas percentuais
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalyticsCards } from "@/components/tracking/AnalyticsCards";
import { createMockCampaignAnalytics } from "../../../helpers/mock-data";

describe("AnalyticsCards (AC: #1)", () => {
  const mockAnalytics = createMockCampaignAnalytics({
    totalSent: 500,
    totalOpens: 120,
    totalClicks: 35,
    totalReplies: 20,
    totalBounces: 8,
    openRate: 0.24,
    clickRate: 0.07,
    replyRate: 0.04,
    bounceRate: 0.016,
  });

  it("renderiza 5 cards de metricas (7.1)", () => {
    render(<AnalyticsCards analytics={mockAnalytics} />);

    expect(screen.getByTestId("metric-total-sent")).toBeInTheDocument();
    expect(screen.getByTestId("metric-opens")).toBeInTheDocument();
    expect(screen.getByTestId("metric-clicks")).toBeInTheDocument();
    expect(screen.getByTestId("metric-replies")).toBeInTheDocument();
    expect(screen.getByTestId("metric-bounces")).toBeInTheDocument();
  });

  it("exibe labels corretos nos cards (7.1)", () => {
    render(<AnalyticsCards analytics={mockAnalytics} />);

    expect(screen.getByText("Total Enviados")).toBeInTheDocument();
    expect(screen.getByText("Aberturas")).toBeInTheDocument();
    expect(screen.getByText("Cliques")).toBeInTheDocument();
    expect(screen.getByText("Respostas")).toBeInTheDocument();
    expect(screen.getByText("Bounces")).toBeInTheDocument();
  });

  it("exibe valores absolutos corretos (7.1)", () => {
    render(<AnalyticsCards analytics={mockAnalytics} />);

    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("formata rates como percentual (7.1)", () => {
    render(<AnalyticsCards analytics={mockAnalytics} />);

    expect(screen.getByText("24.0%")).toBeInTheDocument();
    expect(screen.getByText("7.0%")).toBeInTheDocument();
    expect(screen.getByText("4.0%")).toBeInTheDocument();
    expect(screen.getByText("1.6%")).toBeInTheDocument();
  });

  it("Total Enviados nao exibe rate (sem percentual) (7.1)", () => {
    render(<AnalyticsCards analytics={mockAnalytics} />);

    const sentCard = screen.getByTestId("metric-total-sent");
    // Should have the absolute value but no percentage
    expect(sentCard).toHaveTextContent("500");
    // The other cards have % but Total Enviados does not
    const sentPercentages = sentCard.querySelectorAll(".text-muted-foreground");
    // Only the label span should have text-muted-foreground, not a rate
    const rateElements = Array.from(sentPercentages).filter((el) =>
      el.textContent?.includes("%")
    );
    expect(rateElements).toHaveLength(0);
  });

  it("renderiza grid container com testid (7.1)", () => {
    render(<AnalyticsCards analytics={mockAnalytics} />);

    expect(screen.getByTestId("analytics-cards")).toBeInTheDocument();
  });

  it("lida com rates zero corretamente (7.1)", () => {
    const zeroAnalytics = createMockCampaignAnalytics({
      totalSent: 0,
      totalOpens: 0,
      totalClicks: 0,
      totalReplies: 0,
      totalBounces: 0,
      openRate: 0,
      clickRate: 0,
      replyRate: 0,
      bounceRate: 0,
    });

    render(<AnalyticsCards analytics={zeroAnalytics} />);

    // Should show "0.0%" for rates
    const zeroRates = screen.getAllByText("0.0%");
    expect(zeroRates).toHaveLength(4); // 4 cards with rates
  });

  it("formata rates decimais pequenos corretamente (7.1)", () => {
    const smallRates = createMockCampaignAnalytics({
      openRate: 0.001,
      clickRate: 0.999,
      replyRate: 0.5,
      bounceRate: 0.123,
    });

    render(<AnalyticsCards analytics={smallRates} />);

    expect(screen.getByText("0.1%")).toBeInTheDocument();
    expect(screen.getByText("99.9%")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText("12.3%")).toBeInTheDocument();
  });
});
