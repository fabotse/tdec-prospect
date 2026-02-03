/**
 * GenerationProgress Component Tests
 * Story 6.12.1: AI Full Campaign Generation
 *
 * AC #4 - Generation Progress UI
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerationProgress } from "@/components/campaigns/GenerationProgress";

describe("GenerationProgress", () => {
  const defaultProps = {
    currentStep: 2,
    totalSteps: 5,
    currentEmailContext: "Proposta de valor e diferenciais",
    completedEmails: [
      { id: "email-1", subject: "Introducao - Teste", context: "Introducao" },
    ],
    emailContexts: [
      "Introducao",
      "Proposta de valor e diferenciais",
      "Prova social",
      "Escassez",
      "Ultimo contato",
    ],
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Progress Display (AC #4)", () => {
    it("renders the generation progress component", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(screen.getByTestId("generation-progress")).toBeInTheDocument();
    });

    it("displays current generation status", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(screen.getByTestId("generation-status")).toHaveTextContent(
        "Gerando email 2 de 5..."
      );
    });

    it("displays progress percentage", () => {
      render(<GenerationProgress {...defaultProps} />);

      // 1 of 5 completed = 20%
      expect(screen.getByTestId("generation-percent")).toHaveTextContent("20%");
    });

    it("displays current email context", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(screen.getByTestId("current-email-context")).toHaveTextContent(
        "Proposta de valor e diferenciais"
      );
    });

    it("renders all step indicators", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(screen.getByTestId("generation-step-1")).toBeInTheDocument();
      expect(screen.getByTestId("generation-step-2")).toBeInTheDocument();
      expect(screen.getByTestId("generation-step-3")).toBeInTheDocument();
      expect(screen.getByTestId("generation-step-4")).toBeInTheDocument();
      expect(screen.getByTestId("generation-step-5")).toBeInTheDocument();
    });

    it("shows checkmark for completed steps", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(screen.getByTestId("step-1-check")).toBeInTheDocument();
    });

    it("shows completed email subject in step", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(screen.getByTestId("generation-step-1")).toHaveTextContent(
        "Introducao - Teste"
      );
    });
  });

  describe("Cancel Functionality", () => {
    it("renders cancel button", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
      expect(screen.getByTestId("cancel-button")).toHaveTextContent("Cancelar");
    });

    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      render(<GenerationProgress {...defaultProps} />);

      await user.click(screen.getByTestId("cancel-button"));

      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it("shows info text about partial save", () => {
      render(<GenerationProgress {...defaultProps} />);

      expect(
        screen.getByText(/Os emails ja gerados serao salvos se voce cancelar/)
      ).toBeInTheDocument();
    });
  });

  describe("Error State (AC #6)", () => {
    it("displays error message when hasError is true", () => {
      render(
        <GenerationProgress
          {...defaultProps}
          hasError
          errorMessage="Tempo limite excedido no email 2. 1 email foi gerado."
        />
      );

      expect(screen.getByTestId("generation-error")).toBeInTheDocument();
      expect(screen.getByTestId("generation-error")).toHaveTextContent(
        "Tempo limite excedido no email 2. 1 email foi gerado."
      );
    });

    it("displays paused status when hasError is true", () => {
      render(
        <GenerationProgress
          {...defaultProps}
          hasError
          errorMessage="Error"
        />
      );

      expect(screen.getByTestId("generation-status")).toHaveTextContent(
        "Geracao pausada. 1 de 5 emails gerados."
      );
    });

    it("renders retry button when hasError and onRetry provided", () => {
      const onRetry = vi.fn();
      render(
        <GenerationProgress
          {...defaultProps}
          hasError
          errorMessage="Error"
          onRetry={onRetry}
        />
      );

      expect(screen.getByTestId("retry-button")).toBeInTheDocument();
      expect(screen.getByTestId("retry-button")).toHaveTextContent("Tentar novamente");
    });

    it("calls onRetry when retry button is clicked", async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      render(
        <GenerationProgress
          {...defaultProps}
          hasError
          errorMessage="Error"
          onRetry={onRetry}
        />
      );

      await user.click(screen.getByTestId("retry-button"));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("changes cancel button text to 'Continuar manualmente' on error", () => {
      render(
        <GenerationProgress
          {...defaultProps}
          hasError
          errorMessage="Error"
        />
      );

      expect(screen.getByTestId("cancel-button")).toHaveTextContent(
        "Continuar manualmente"
      );
    });

    it("hides current email context on error", () => {
      render(
        <GenerationProgress
          {...defaultProps}
          hasError
          errorMessage="Error"
        />
      );

      expect(screen.queryByTestId("current-email-context")).not.toBeInTheDocument();
    });
  });

  describe("Progress Calculation", () => {
    it("calculates 0% progress with no completed emails", () => {
      render(
        <GenerationProgress
          {...defaultProps}
          currentStep={1}
          completedEmails={[]}
        />
      );

      expect(screen.getByTestId("generation-percent")).toHaveTextContent("0%");
    });

    it("calculates 100% progress when all emails completed", () => {
      const allCompleted = [
        { id: "1", subject: "S1" },
        { id: "2", subject: "S2" },
        { id: "3", subject: "S3" },
        { id: "4", subject: "S4" },
        { id: "5", subject: "S5" },
      ];
      render(
        <GenerationProgress
          {...defaultProps}
          currentStep={5}
          completedEmails={allCompleted}
        />
      );

      expect(screen.getByTestId("generation-percent")).toHaveTextContent("100%");
    });

    it("calculates 60% progress with 3 of 5 completed", () => {
      const threeCompleted = [
        { id: "1", subject: "S1" },
        { id: "2", subject: "S2" },
        { id: "3", subject: "S3" },
      ];
      render(
        <GenerationProgress
          {...defaultProps}
          currentStep={4}
          completedEmails={threeCompleted}
        />
      );

      expect(screen.getByTestId("generation-percent")).toHaveTextContent("60%");
    });
  });
});
