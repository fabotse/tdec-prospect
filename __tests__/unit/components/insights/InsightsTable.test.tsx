/**
 * Tests for InsightsTable Component
 * Story 13.6: Pagina de Insights - UI
 *
 * AC: #2 - Tabela de insights com colunas
 * AC: #4 - Copiar Sugestao
 * AC: #5 - Marcar como Usado
 * AC: #6 - Descartar
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsightsTable } from "@/components/insights/InsightsTable";
import type { InsightWithLead } from "@/hooks/use-lead-insights";

// Mock clipboard utility
vi.mock("@/lib/utils/clipboard", () => ({
  copyToClipboard: vi.fn(),
}));

import { copyToClipboard } from "@/lib/utils/clipboard";

function makeInsight(overrides: Partial<InsightWithLead> = {}): InsightWithLead {
  return {
    id: "insight-1",
    tenantId: "t1",
    leadId: "l1",
    postUrl: "https://linkedin.com/post/1",
    postText: "This is a post about AI and technology that is interesting",
    postPublishedAt: "2026-02-20T10:00:00Z",
    relevanceReasoning: "Relevant to product",
    suggestion: "Approach with a personalized message about AI",
    status: "new",
    createdAt: "2026-02-25T10:00:00Z",
    updatedAt: "2026-02-25T10:00:00Z",
    lead: {
      id: "l1",
      firstName: "John",
      lastName: "Doe",
      photoUrl: "https://example.com/photo.jpg",
      companyName: "Acme Inc",
      title: "CTO",
      linkedinUrl: "https://linkedin.com/in/johndoe",
    },
    ...overrides,
  };
}

describe("InsightsTable", () => {
  const defaultProps = {
    insights: [makeInsight()],
    onUpdateStatus: vi.fn(),
    isPending: false,
  };

  it("should render table headers", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Post")).toBeInTheDocument();
    expect(screen.getByText("Sugestao de Abordagem")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(screen.getByText("Acoes")).toBeInTheDocument();
  });

  it("should render lead name with avatar", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    const img = screen.getByAltText("John Doe");
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
  });

  it("should render initial letter when no photo", () => {
    const insight = makeInsight({
      lead: {
        id: "l2",
        firstName: "Jane",
        lastName: null,
        photoUrl: null,
        companyName: null,
        title: null,
        linkedinUrl: null,
      },
    });

    render(<InsightsTable {...defaultProps} insights={[insight]} />);

    expect(screen.getByText("J")).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
  });

  it("should render company name and title", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText(/CTO.*Acme Inc/)).toBeInTheDocument();
  });

  it("should render post text", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText(/This is a post about AI/)).toBeInTheDocument();
  });

  it("should render post link with external link icon", () => {
    render(<InsightsTable {...defaultProps} />);

    const link = screen.getByText("Ver post").closest("a");
    expect(link).toHaveAttribute("href", "https://linkedin.com/post/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("should not render post link when postUrl is empty", () => {
    const insight = makeInsight({ postUrl: "" });
    render(<InsightsTable {...defaultProps} insights={[insight]} />);

    expect(screen.queryByText("Ver post")).not.toBeInTheDocument();
  });

  it("should render suggestion text", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText(/Approach with a personalized/)).toBeInTheDocument();
  });

  it("should render 'Sugestao nao disponivel' when suggestion is null", () => {
    const insight = makeInsight({ suggestion: null });
    render(<InsightsTable {...defaultProps} insights={[insight]} />);

    expect(screen.getByText("Sugestao nao disponivel")).toBeInTheDocument();
  });

  it("should not render copy button when suggestion is null", () => {
    const insight = makeInsight({ suggestion: null });
    render(<InsightsTable {...defaultProps} insights={[insight]} />);

    expect(screen.queryByText("Copiar")).not.toBeInTheDocument();
  });

  it("should render copy button for insights with suggestion", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText("Copiar")).toBeInTheDocument();
  });

  it("should call copyToClipboard when copy button clicked", async () => {
    const user = userEvent.setup();
    render(<InsightsTable {...defaultProps} />);

    await user.click(screen.getByText("Copiar"));

    expect(copyToClipboard).toHaveBeenCalledWith(
      "Approach with a personalized message about AI"
    );
  });

  it("should render status badge", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText("Novo")).toBeInTheDocument();
  });

  it("should render date in pt-BR format", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByText("25/02/2026")).toBeInTheDocument();
  });

  it("should render actions dropdown trigger", () => {
    render(<InsightsTable {...defaultProps} />);

    expect(screen.getByLabelText("Acoes do insight")).toBeInTheDocument();
  });

  it("should show 'Marcar como Usado' in dropdown for new insights", async () => {
    const user = userEvent.setup();
    render(<InsightsTable {...defaultProps} />);

    await user.click(screen.getByLabelText("Acoes do insight"));

    expect(screen.getByText("Marcar como Usado")).toBeInTheDocument();
  });

  it("should show 'Descartar' in dropdown for new insights", async () => {
    const user = userEvent.setup();
    render(<InsightsTable {...defaultProps} />);

    await user.click(screen.getByLabelText("Acoes do insight"));

    expect(screen.getByText("Descartar")).toBeInTheDocument();
  });

  it("should not show 'Marcar como Usado' for already used insights", async () => {
    const user = userEvent.setup();
    const insight = makeInsight({ status: "used" });
    render(<InsightsTable {...defaultProps} insights={[insight]} />);

    await user.click(screen.getByLabelText("Acoes do insight"));

    expect(screen.queryByText("Marcar como Usado")).not.toBeInTheDocument();
  });

  it("should not show 'Descartar' for already dismissed insights", async () => {
    const user = userEvent.setup();
    const insight = makeInsight({ status: "dismissed" });
    render(<InsightsTable {...defaultProps} insights={[insight]} />);

    await user.click(screen.getByLabelText("Acoes do insight"));

    expect(screen.queryByText("Descartar")).not.toBeInTheDocument();
  });

  it("should call onUpdateStatus when 'Marcar como Usado' clicked", async () => {
    const user = userEvent.setup();
    const onUpdateStatus = vi.fn();
    render(<InsightsTable {...defaultProps} onUpdateStatus={onUpdateStatus} />);

    await user.click(screen.getByLabelText("Acoes do insight"));
    await user.click(screen.getByText("Marcar como Usado"));

    expect(onUpdateStatus).toHaveBeenCalledWith("insight-1", "used");
  });

  it("should call onUpdateStatus when 'Descartar' clicked", async () => {
    const user = userEvent.setup();
    const onUpdateStatus = vi.fn();
    render(<InsightsTable {...defaultProps} onUpdateStatus={onUpdateStatus} />);

    await user.click(screen.getByLabelText("Acoes do insight"));
    await user.click(screen.getByText("Descartar"));

    expect(onUpdateStatus).toHaveBeenCalledWith("insight-1", "dismissed");
  });

  it("should render multiple insights", () => {
    const insights = [
      makeInsight({ id: "i1", lead: { ...makeInsight().lead, firstName: "Alice" } }),
      makeInsight({ id: "i2", lead: { ...makeInsight().lead, firstName: "Bob" } }),
    ];
    render(<InsightsTable {...defaultProps} insights={insights} />);

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("should render long post text with CSS line-clamp", () => {
    const longText = "A".repeat(200);
    const insight = makeInsight({ postText: longText });
    render(<InsightsTable {...defaultProps} insights={[insight]} />);

    // Full text is rendered, CSS line-clamp-2 handles visual truncation
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText(longText)).toHaveClass("line-clamp-2");
  });

  it("should show 'Ver Post Original' in dropdown when postUrl exists", async () => {
    const user = userEvent.setup();
    render(<InsightsTable {...defaultProps} />);

    await user.click(screen.getByLabelText("Acoes do insight"));

    expect(screen.getByText("Ver Post Original")).toBeInTheDocument();
  });
});
