/**
 * PreviewEmailStep Tests
 * Story 5.8: Campaign Preview
 *
 * AC #2: Visualizar sequencia de emails
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PreviewEmailStep } from "@/components/builder/PreviewEmailStep";

describe("PreviewEmailStep", () => {
  const defaultProps = {
    stepNumber: 1,
    subject: "Test Subject",
    body: "Test body content",
  };

  describe("AC #2 - Visualizar Emails", () => {
    it("renders step number", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByText("Email 1")).toBeInTheDocument();
    });

    it("renders subject", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByText("Test Subject")).toBeInTheDocument();
    });

    it("renders body", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByText("Test body content")).toBeInTheDocument();
    });

    it("renders subject label", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByText("Assunto")).toBeInTheDocument();
    });

    it("renders body label", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByText("Corpo")).toBeInTheDocument();
    });
  });

  describe("Empty Content", () => {
    it("shows 'Email sem conteudo' when both subject and body are empty", () => {
      render(<PreviewEmailStep stepNumber={1} subject="" body="" />);
      expect(screen.getByText("Email sem conteudo")).toBeInTheDocument();
    });

    it("shows 'Sem assunto' when only subject is empty", () => {
      render(<PreviewEmailStep stepNumber={1} subject="" body="Some body" />);
      expect(screen.getByText("Sem assunto")).toBeInTheDocument();
    });

    it("shows 'Sem conteudo' when only body is empty", () => {
      render(<PreviewEmailStep stepNumber={1} subject="Some subject" body="" />);
      expect(screen.getByText("Sem conteudo")).toBeInTheDocument();
    });
  });

  describe("Highlighted State", () => {
    it("applies highlight styles when isHighlighted is true", () => {
      const { container } = render(
        <PreviewEmailStep {...defaultProps} isHighlighted={true} />
      );
      const card = container.querySelector("[role='article']");
      expect(card).toHaveClass("border-primary");
      expect(card).toHaveClass("ring-2");
    });

    it("does not apply highlight styles when isHighlighted is false", () => {
      const { container } = render(
        <PreviewEmailStep {...defaultProps} isHighlighted={false} />
      );
      const card = container.querySelector("[role='article']");
      expect(card).not.toHaveClass("border-primary");
      expect(card).toHaveClass("border-border");
    });
  });

  describe("Accessibility", () => {
    it("has role article", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByRole("article")).toBeInTheDocument();
    });

    it("has aria-label with email info", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByRole("article")).toHaveAttribute(
        "aria-label",
        "Email 1: Test Subject"
      );
    });

    it("has aria-label with 'sem assunto' when subject is empty", () => {
      render(<PreviewEmailStep stepNumber={2} subject="" body="body" />);
      expect(screen.getByRole("article")).toHaveAttribute(
        "aria-label",
        "Email 2: sem assunto"
      );
    });
  });

  describe("Whitespace Preservation", () => {
    it("preserves line breaks in body text", () => {
      const bodyWithLineBreaks = "Line 1\nLine 2\nLine 3";
      render(
        <PreviewEmailStep stepNumber={1} subject="Test" body={bodyWithLineBreaks} />
      );
      const bodyElement = screen.getByText(/Line 1/);
      expect(bodyElement).toHaveClass("whitespace-pre-wrap");
    });
  });

  // ==============================================
  // Story 9.4: Ice Breaker Variable Placeholder
  // ==============================================

  describe("Ice Breaker Variable Placeholder (Story 9.4 AC #4)", () => {
    it("replaces {{ice_breaker}} with styled placeholder text", () => {
      const bodyWithVariable = "Olá João! {{ice_breaker}} Gostaria de apresentar nosso produto.";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={bodyWithVariable} />
      );

      // Should show placeholder text instead of {{ice_breaker}}
      expect(screen.getByTestId("icebreaker-placeholder")).toBeInTheDocument();
      expect(
        screen.getByText("[Ice Breaker personalizado será gerado para cada lead]")
      ).toBeInTheDocument();

      // Should NOT show the raw variable
      expect(screen.queryByText("{{ice_breaker}}")).not.toBeInTheDocument();
    });

    it("renders placeholder with italic styling", () => {
      const bodyWithVariable = "Texto {{ice_breaker}} mais texto";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={bodyWithVariable} />
      );

      const placeholder = screen.getByTestId("icebreaker-placeholder");
      expect(placeholder).toHaveClass("italic");
    });

    it("renders normal body when no {{ice_breaker}} variable present", () => {
      render(<PreviewEmailStep {...defaultProps} />);

      // Should render body normally
      expect(screen.getByText("Test body content")).toBeInTheDocument();
      expect(screen.queryByTestId("icebreaker-placeholder")).not.toBeInTheDocument();
    });

    it("preserves surrounding text around {{ice_breaker}} placeholder", () => {
      const bodyWithVariable = "Olá! {{ice_breaker}} Vamos conversar?";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={bodyWithVariable} />
      );

      // Surrounding text should still be present
      expect(screen.getByText(/Olá!/)).toBeInTheDocument();
      expect(screen.getByText(/Vamos conversar\?/)).toBeInTheDocument();
    });
  });
});
