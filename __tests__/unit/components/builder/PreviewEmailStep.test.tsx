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
});
