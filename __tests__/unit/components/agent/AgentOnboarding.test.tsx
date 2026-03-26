/**
 * AgentOnboarding Tests
 * Story 16.4 - AC: #1
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AgentOnboarding } from "@/components/agent/AgentOnboarding";

describe("AgentOnboarding", () => {
  it("renderiza com data-testid correto", () => {
    render(<AgentOnboarding />);
    expect(screen.getByTestId("agent-onboarding")).toBeInTheDocument();
  });

  it("renderiza titulo 'Agente TDEC'", () => {
    render(<AgentOnboarding />);
    expect(screen.getByText("Agente TDEC")).toBeInTheDocument();
  });

  it("renderiza texto explicativo sobre o que o agente faz", () => {
    render(<AgentOnboarding />);
    expect(
      screen.getByText(/campanhas de prospeccao completas/i)
    ).toBeInTheDocument();
  });

  it("renderiza as 4 etapas do fluxo", () => {
    render(<AgentOnboarding />);
    expect(screen.getByText(/descreve quem quer prospectar/i)).toBeInTheDocument();
    expect(screen.getByText(/interpreto e extraio os parametros/i)).toBeInTheDocument();
    expect(screen.getByText(/escolhe o modo/i)).toBeInTheDocument();
    expect(screen.getByText(/executo o pipeline/i)).toBeInTheDocument();
  });

  it("renderiza convite para comecar", () => {
    render(<AgentOnboarding />);
    expect(
      screen.getByText(/comece descrevendo quem voce quer prospectar/i)
    ).toBeInTheDocument();
  });

  it("tem max-w-md para limitar largura", () => {
    render(<AgentOnboarding />);
    const container = screen.getByTestId("agent-onboarding");
    const inner = container.querySelector(".max-w-md");
    expect(inner).toBeInTheDocument();
  });
});
