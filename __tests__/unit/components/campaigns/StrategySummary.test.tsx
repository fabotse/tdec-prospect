/**
 * StrategySummary Component Tests
 * Story 6.12.1: AI Full Campaign Generation
 *
 * AC #1 - Structure Rationale Display
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrategySummary } from "@/components/campaigns/StrategySummary";

describe("StrategySummary", () => {
  const defaultProps = {
    rationale: "Esta estrutura foi escolhida para maximizar o engajamento com leads frios.",
    totalEmails: 5,
    totalDays: 14,
    objective: "cold_outreach" as const,
    onGenerateFull: vi.fn(),
    onStructureOnly: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Display (AC #1)", () => {
    it("renders the strategy summary component", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("strategy-summary")).toBeInTheDocument();
    });

    it("displays the AI rationale", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("strategy-rationale")).toHaveTextContent(
        "Esta estrutura foi escolhida para maximizar o engajamento com leads frios."
      );
    });

    it("displays email count", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("strategy-email-count")).toHaveTextContent("5 emails");
    });

    it("displays singular email count", () => {
      render(<StrategySummary {...defaultProps} totalEmails={1} />);

      expect(screen.getByTestId("strategy-email-count")).toHaveTextContent("1 email");
    });

    it("displays campaign duration", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("strategy-duration")).toHaveTextContent("14 dias de duracao");
    });

    it("displays singular day duration", () => {
      render(<StrategySummary {...defaultProps} totalDays={1} />);

      expect(screen.getByTestId("strategy-duration")).toHaveTextContent("1 dia de duracao");
    });

    it("displays objective label", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("strategy-objective")).toHaveTextContent("Cold Outreach");
    });

    it("displays correct objective label for follow_up", () => {
      render(<StrategySummary {...defaultProps} objective="follow_up" />);

      expect(screen.getByTestId("strategy-objective")).toHaveTextContent("Follow-up");
    });

    it("displays correct objective label for reengagement", () => {
      render(<StrategySummary {...defaultProps} objective="reengagement" />);

      expect(screen.getByTestId("strategy-objective")).toHaveTextContent("Reengajamento");
    });

    it("displays correct objective label for nurture", () => {
      render(<StrategySummary {...defaultProps} objective="nurture" />);

      expect(screen.getByTestId("strategy-objective")).toHaveTextContent("Nutricao");
    });
  });

  describe("Buttons", () => {
    it("renders generate full button", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("generate-full-button")).toBeInTheDocument();
      expect(screen.getByTestId("generate-full-button")).toHaveTextContent("Gerar Campanha Completa");
    });

    it("renders structure only button", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("structure-only-button")).toBeInTheDocument();
      expect(screen.getByTestId("structure-only-button")).toHaveTextContent("Criar Apenas Estrutura");
    });

    it("renders back button", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByTestId("strategy-back-button")).toBeInTheDocument();
      expect(screen.getByTestId("strategy-back-button")).toHaveTextContent("Voltar ao formulario");
    });

    it("calls onGenerateFull when full generation button is clicked", async () => {
      const user = userEvent.setup();
      render(<StrategySummary {...defaultProps} />);

      await user.click(screen.getByTestId("generate-full-button"));

      expect(defaultProps.onGenerateFull).toHaveBeenCalledTimes(1);
    });

    it("calls onStructureOnly when structure only button is clicked", async () => {
      const user = userEvent.setup();
      render(<StrategySummary {...defaultProps} />);

      await user.click(screen.getByTestId("structure-only-button"));

      expect(defaultProps.onStructureOnly).toHaveBeenCalledTimes(1);
    });

    it("calls onBack when back button is clicked", async () => {
      const user = userEvent.setup();
      render(<StrategySummary {...defaultProps} />);

      await user.click(screen.getByTestId("strategy-back-button"));

      expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("Disabled States", () => {
    it("disables full generation button when fullGenerationDisabled is true", () => {
      render(<StrategySummary {...defaultProps} fullGenerationDisabled />);

      expect(screen.getByTestId("generate-full-button")).toBeDisabled();
    });

    it("disables buttons during full generation", () => {
      render(<StrategySummary {...defaultProps} isGeneratingFull />);

      expect(screen.getByTestId("generate-full-button")).toBeDisabled();
      expect(screen.getByTestId("structure-only-button")).toBeDisabled();
      expect(screen.getByTestId("strategy-back-button")).toBeDisabled();
    });

    it("disables buttons during structure creation", () => {
      render(<StrategySummary {...defaultProps} isCreatingStructure />);

      expect(screen.getByTestId("generate-full-button")).toBeDisabled();
      expect(screen.getByTestId("structure-only-button")).toBeDisabled();
      expect(screen.getByTestId("strategy-back-button")).toBeDisabled();
    });

    it("shows loading text during full generation", () => {
      render(<StrategySummary {...defaultProps} isGeneratingFull />);

      expect(screen.getByTestId("generate-full-button")).toHaveTextContent(
        "Gerando campanha completa..."
      );
    });

    it("shows loading text during structure creation", () => {
      render(<StrategySummary {...defaultProps} isCreatingStructure />);

      expect(screen.getByTestId("structure-only-button")).toHaveTextContent(
        "Criando estrutura..."
      );
    });

    it("shows hint for single email campaigns when disabled", () => {
      render(<StrategySummary {...defaultProps} fullGenerationDisabled totalEmails={1} />);

      expect(screen.getByText(/Campanha com apenas 1 email/)).toBeInTheDocument();
    });

    it("shows hint for normal campaigns", () => {
      render(<StrategySummary {...defaultProps} />);

      expect(screen.getByText(/Geracao completa cria todo o conteudo automaticamente/)).toBeInTheDocument();
    });
  });
});
