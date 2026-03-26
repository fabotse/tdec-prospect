/**
 * AgentModeSelector Tests
 * Story 16.4 - AC: #3, #4
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentModeSelector } from "@/components/agent/AgentModeSelector";

describe("AgentModeSelector", () => {
  const mockOnModeSelect = vi.fn();

  beforeEach(() => {
    mockOnModeSelect.mockClear();
  });

  it("renderiza com data-testid correto", () => {
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);
    expect(screen.getByTestId("agent-mode-selector")).toBeInTheDocument();
  });

  it("renderiza dois cards de modo", () => {
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);
    expect(screen.getByTestId("mode-guided")).toBeInTheDocument();
    expect(screen.getByTestId("mode-autopilot")).toBeInTheDocument();
  });

  it("renderiza titulos dos modos", () => {
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);
    expect(screen.getByText("Guiado")).toBeInTheDocument();
    expect(screen.getByText("Autopilot")).toBeInTheDocument();
  });

  it("renderiza descricoes dos modos", () => {
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);
    expect(screen.getByText("Vou pedir sua aprovacao em cada etapa")).toBeInTheDocument();
    expect(screen.getByText("Executo tudo sem interrupcoes")).toBeInTheDocument();
  });

  it("botao confirmar esta desabilitado sem selecao", () => {
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);
    expect(screen.getByTestId("mode-confirm-btn")).toBeDisabled();
  });

  it("botao confirmar habilita apos selecionar modo", async () => {
    const user = userEvent.setup();
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);

    await user.click(screen.getByTestId("mode-guided"));
    expect(screen.getByTestId("mode-confirm-btn")).toBeEnabled();
  });

  it("aplica estilo visual ao card selecionado", async () => {
    const user = userEvent.setup();
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);

    await user.click(screen.getByTestId("mode-guided"));
    expect(screen.getByTestId("mode-guided").className).toContain("border-foreground");
    expect(screen.getByTestId("mode-guided").className).toContain("bg-muted");
  });

  it("chama onModeSelect com 'guided' ao confirmar", async () => {
    const user = userEvent.setup();
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);

    await user.click(screen.getByTestId("mode-guided"));
    await user.click(screen.getByTestId("mode-confirm-btn"));

    expect(mockOnModeSelect).toHaveBeenCalledWith("guided");
  });

  it("chama onModeSelect com 'autopilot' ao confirmar", async () => {
    const user = userEvent.setup();
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);

    await user.click(screen.getByTestId("mode-autopilot"));
    await user.click(screen.getByTestId("mode-confirm-btn"));

    expect(mockOnModeSelect).toHaveBeenCalledWith("autopilot");
  });

  it("pre-seleciona modo quando defaultMode fornecido", () => {
    render(
      <AgentModeSelector
        onModeSelect={mockOnModeSelect}
        defaultMode="autopilot"
      />
    );
    expect(screen.getByTestId("mode-autopilot").className).toContain("border-foreground");
    expect(screen.getByTestId("mode-confirm-btn")).toBeEnabled();
  });

  it("permite trocar selecao entre modos", async () => {
    const user = userEvent.setup();
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);

    await user.click(screen.getByTestId("mode-guided"));
    expect(screen.getByTestId("mode-guided").className).toContain("bg-muted");

    await user.click(screen.getByTestId("mode-autopilot"));
    expect(screen.getByTestId("mode-autopilot").className).toContain("bg-muted");
    expect(screen.getByTestId("mode-guided").className).not.toContain("bg-muted");
  });

  it("renderiza titulo da secao", () => {
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);
    expect(screen.getByText("Escolha o modo de operacao")).toBeInTheDocument();
  });

  it("cards tem aria-pressed correto baseado na selecao", async () => {
    const user = userEvent.setup();
    render(<AgentModeSelector onModeSelect={mockOnModeSelect} />);

    expect(screen.getByTestId("mode-guided")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("mode-autopilot")).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByTestId("mode-guided"));
    expect(screen.getByTestId("mode-guided")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("mode-autopilot")).toHaveAttribute("aria-pressed", "false");
  });

  it("desabilita botao confirmar e cards quando isSubmitting=true", () => {
    render(
      <AgentModeSelector
        onModeSelect={mockOnModeSelect}
        defaultMode="guided"
        isSubmitting={true}
      />
    );
    expect(screen.getByTestId("mode-confirm-btn")).toBeDisabled();
    expect(screen.getByTestId("mode-guided")).toBeDisabled();
    expect(screen.getByTestId("mode-autopilot")).toBeDisabled();
  });

  it("mostra texto 'Confirmando...' quando isSubmitting=true", () => {
    render(
      <AgentModeSelector
        onModeSelect={mockOnModeSelect}
        defaultMode="guided"
        isSubmitting={true}
      />
    );
    expect(screen.getByText("Confirmando...")).toBeInTheDocument();
  });
});
