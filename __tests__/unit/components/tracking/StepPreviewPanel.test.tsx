/**
 * Unit Tests for StepPreviewPanel
 * Story 14.7: Painel Lateral com Preview dos Steps da Campanha
 *
 * AC: #1 — Click abre painel
 * AC: #2 — Exibe todos os steps com subject + body
 * AC: #3 — Step correto destacado
 * AC: #4 — Scroll automatico
 * AC: #5 — Estado vazio
 * AC: #7 — Fechar painel
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepPreviewPanel } from "@/components/tracking/StepPreviewPanel";
import type { CampaignStep } from "@/types/tracking";

// Mock PreviewEmailStep to isolate StepPreviewPanel logic
vi.mock("@/components/builder/PreviewEmailStep", () => ({
  PreviewEmailStep: ({
    stepNumber,
    subject,
    body,
    isHighlighted,
  }: {
    stepNumber: number;
    subject: string;
    body: string;
    isHighlighted?: boolean;
  }) => (
    <div
      data-testid={`preview-step-${stepNumber}`}
      data-highlighted={isHighlighted ? "true" : "false"}
    >
      <span data-testid={`step-subject-${stepNumber}`}>{subject}</span>
      <span data-testid={`step-body-${stepNumber}`}>{body}</span>
    </div>
  ),
}));

// Mock scrollIntoView
const mockScrollIntoView = vi.fn();
Element.prototype.scrollIntoView = mockScrollIntoView;

const mockSteps: CampaignStep[] = [
  { stepNumber: 0, subject: "Olá {{firstName}}", body: "Corpo do email 1" },
  { stepNumber: 1, subject: "Follow-up sobre proposta", body: "Corpo do follow-up" },
  { stepNumber: 2, subject: "Última tentativa", body: "Corpo final" },
];

describe("StepPreviewPanel (Story 14.7)", () => {
  it("renderiza todos os steps com PreviewEmailStep quando open=true (AC #2)", () => {
    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={vi.fn()}
        steps={mockSteps}
        highlightedStep={null}
        campaignName="Campanha Teste"
      />
    );

    expect(screen.getByTestId("step-preview-panel")).toBeInTheDocument();
    expect(screen.getByTestId("preview-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("preview-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("preview-step-3")).toBeInTheDocument();
  });

  it("exibe titulo 'Steps da Campanha' e nome da campanha (AC #6)", () => {
    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={vi.fn()}
        steps={mockSteps}
        highlightedStep={null}
        campaignName="Campanha Teste"
      />
    );

    expect(screen.getByText("Steps da Campanha")).toBeInTheDocument();
    expect(screen.getByText(/Campanha Teste/)).toBeInTheDocument();
    expect(screen.getByText(/3 steps/)).toBeInTheDocument();
  });

  it("step correto recebe isHighlighted=true (AC #3)", () => {
    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={vi.fn()}
        steps={mockSteps}
        highlightedStep={1}
        campaignName="Campanha Teste"
      />
    );

    // Step 2 (display) = stepNumber 1 (0-based) → highlighted
    expect(screen.getByTestId("preview-step-2")).toHaveAttribute("data-highlighted", "true");
    expect(screen.getByTestId("preview-step-1")).toHaveAttribute("data-highlighted", "false");
    expect(screen.getByTestId("preview-step-3")).toHaveAttribute("data-highlighted", "false");
  });

  it("scrollIntoView chamado para step destacado ao abrir (AC #4)", async () => {
    vi.useFakeTimers();
    mockScrollIntoView.mockClear();

    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={vi.fn()}
        steps={mockSteps}
        highlightedStep={1}
        campaignName="Campanha Teste"
      />
    );

    vi.advanceTimersByTime(300);

    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });

    vi.useRealTimers();
  });

  it("estado vazio mostra mensagem quando steps=[] (AC #5)", () => {
    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={vi.fn()}
        steps={[]}
        highlightedStep={null}
        campaignName="Campanha Teste"
      />
    );

    expect(screen.getByTestId("step-preview-empty")).toBeInTheDocument();
    expect(screen.getByText("Nenhum step disponivel para esta campanha")).toBeInTheDocument();
  });

  it("fechar painel chama onOpenChange(false) (AC #7)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={onOpenChange}
        steps={mockSteps}
        highlightedStep={null}
        campaignName="Campanha Teste"
      />
    );

    // Click the close button (X) in the sheet
    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("usa indice sequencial (nao stepNumber) para numerar emails", () => {
    // Simula campanha com delays entre emails: positions 0, 2, 4
    const stepsWithGaps: CampaignStep[] = [
      { stepNumber: 0, subject: "Primeiro email", body: "Body 1" },
      { stepNumber: 2, subject: "Segundo email", body: "Body 2" },
      { stepNumber: 4, subject: "Terceiro email", body: "Body 3" },
    ];

    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={vi.fn()}
        steps={stepsWithGaps}
        highlightedStep={null}
        campaignName="Test"
      />
    );

    // Deve mostrar Email 1, 2, 3 (sequencial) — nao Email 1, 3, 5
    expect(screen.getByTestId("preview-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("preview-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("preview-step-3")).toBeInTheDocument();
  });

  it("nao renderiza conteudo quando open=false", () => {
    render(
      <StepPreviewPanel
        open={false}
        onOpenChange={vi.fn()}
        steps={mockSteps}
        highlightedStep={null}
        campaignName="Campanha Teste"
      />
    );

    expect(screen.queryByTestId("step-preview-panel")).not.toBeInTheDocument();
  });

  it("exibe descricao com 1 step singular", () => {
    render(
      <StepPreviewPanel
        open={true}
        onOpenChange={vi.fn()}
        steps={[{ stepNumber: 0, subject: "Unico", body: "Body" }]}
        highlightedStep={null}
        campaignName="Campaign"
      />
    );

    expect(screen.getByText(/1 step$/)).toBeInTheDocument();
  });
});
