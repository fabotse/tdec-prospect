import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignProgress } from "@/components/tracking/CampaignProgress";
import { createMockCampaignAnalytics } from "../../../helpers/mock-data";

describe("CampaignProgress (AC: #2, #3, #5, #6)", () => {
  it("renderiza com dados completos — 50% progresso (AC: #2, #3)", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 50,
      campaignStatus: 1,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-progress-label")).toHaveTextContent(
      "50 de 100 leads contatados — 50%"
    );
    expect(screen.getByTestId("campaign-progress-bar")).toBeInTheDocument();
  });

  it("renderiza com 0% — 0 contatados de N leads (AC: #2, #3)", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 200,
      contactedCount: 0,
      campaignStatus: 1,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-label")).toHaveTextContent(
      "0 de 200 leads contatados — 0%"
    );
  });

  it("renderiza com 100% — todos contatados (AC: #2, #3)", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 50,
      contactedCount: 50,
      campaignStatus: 3,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-label")).toHaveTextContent(
      "50 de 50 leads contatados — 100%"
    );
  });

  it("clamp porcentagem em 100% quando contactedCount > leadsCount", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 10,
      contactedCount: 15,
      campaignStatus: 1,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-label")).toHaveTextContent(
      "15 de 10 leads contatados — 100%"
    );
  });

  it("exibe 'Nenhum lead' quando leadsCount = 0 e campaignStatus definido (AC: #5)", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 0,
      contactedCount: 0,
      campaignStatus: 1,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-empty")).toHaveTextContent(
      "Nenhum lead na campanha"
    );
    expect(
      screen.queryByTestId("campaign-progress-bar")
    ).not.toBeInTheDocument();
  });

  it("exibe 'Aguardando dados' quando leadsCount = undefined e campaignStatus undefined (AC: #5)", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: undefined,
      contactedCount: undefined,
      campaignStatus: undefined,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-empty")).toHaveTextContent(
      "Aguardando dados..."
    );
    expect(
      screen.queryByTestId("campaign-progress-bar")
    ).not.toBeInTheDocument();
  });

  it("renderiza 0 contatados quando contactedCount=undefined com leadsCount valido", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: undefined,
      campaignStatus: 1,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-label")).toHaveTextContent(
      "0 de 100 leads contatados — 0%"
    );
  });

  it("aplica classes responsivas com flex-wrap (AC: #6)", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 50,
      campaignStatus: 1,
    });

    const { container } = render(<CampaignProgress analytics={analytics} />);

    const flexWrapEl = container.querySelector(".flex-wrap");
    expect(flexWrapEl).toBeInTheDocument();
  });
});

describe("CampaignProgress — Badge de Status (AC: #4)", () => {
  it("exibe badge 'Rascunho' para campaignStatus = 0", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 10,
      campaignStatus: 0,
    });

    render(<CampaignProgress analytics={analytics} />);

    const badge = screen.getByTestId("campaign-status-badge");
    expect(badge).toHaveTextContent("Rascunho");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("exibe badge 'Ativa' para campaignStatus = 1", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 10,
      campaignStatus: 1,
    });

    render(<CampaignProgress analytics={analytics} />);

    const badge = screen.getByTestId("campaign-status-badge");
    expect(badge).toHaveTextContent("Ativa");
    expect(badge).toHaveAttribute("data-variant", "default");
  });

  it("exibe badge 'Pausada' para campaignStatus = 2", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 10,
      campaignStatus: 2,
    });

    render(<CampaignProgress analytics={analytics} />);

    const badge = screen.getByTestId("campaign-status-badge");
    expect(badge).toHaveTextContent("Pausada");
    expect(badge).toHaveAttribute("data-variant", "outline");
  });

  it("exibe badge 'Completa' para campaignStatus = 3", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 10,
      campaignStatus: 3,
    });

    render(<CampaignProgress analytics={analytics} />);

    const badge = screen.getByTestId("campaign-status-badge");
    expect(badge).toHaveTextContent("Completa");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("nao exibe badge quando campaignStatus = undefined", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 10,
      campaignStatus: undefined,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(
      screen.queryByTestId("campaign-status-badge")
    ).not.toBeInTheDocument();
  });

  it("nao exibe badge quando campaignStatus tem valor desconhecido (ex: 99)", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 100,
      contactedCount: 10,
      campaignStatus: 99,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(
      screen.queryByTestId("campaign-status-badge")
    ).not.toBeInTheDocument();
  });

  it("exibe badge no estado vazio quando campaignStatus definido", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 0,
      contactedCount: 0,
      campaignStatus: 2,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-empty")).toHaveTextContent(
      "Nenhum lead na campanha"
    );
    const badge = screen.getByTestId("campaign-status-badge");
    expect(badge).toHaveTextContent("Pausada");
  });

  it("exibe 'Nenhum lead' com badge 'Completa' quando campanha completa sem leads", () => {
    const analytics = createMockCampaignAnalytics({
      leadsCount: 0,
      contactedCount: 0,
      campaignStatus: 3,
    });

    render(<CampaignProgress analytics={analytics} />);

    expect(screen.getByTestId("campaign-progress-empty")).toHaveTextContent(
      "Nenhum lead na campanha"
    );
    expect(screen.getByTestId("campaign-status-badge")).toHaveTextContent(
      "Completa"
    );
  });
});
