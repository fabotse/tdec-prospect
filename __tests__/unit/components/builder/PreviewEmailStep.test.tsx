/**
 * PreviewEmailStep Tests
 * Story 5.8: Campaign Preview
 * Story 7.1: Generic variable placeholders and lead resolution
 *
 * AC #2: Visualizar sequencia de emails
 * AC 7.1 #3: Variables resolved with lead data
 * AC 7.1 #4: resolveEmailVariables used for resolution
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
  // Story 7.1: Generic Variable Placeholders
  // ==============================================

  describe("Variable Placeholders - No PreviewLead (Story 7.1 AC #3)", () => {
    it("replaces {{ice_breaker}} with styled placeholder", () => {
      const bodyWithVariable = "Olá João! {{ice_breaker}} Gostaria de apresentar nosso produto.";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={bodyWithVariable} />
      );

      expect(screen.getByTestId("variable-placeholder-ice_breaker")).toBeInTheDocument();
      expect(
        screen.getByText("[Ice Breaker personalizado será gerado para cada lead]")
      ).toBeInTheDocument();
      expect(screen.queryByText("{{ice_breaker}}")).not.toBeInTheDocument();
    });

    it("replaces {{first_name}} with styled placeholder", () => {
      const body = "Olá {{first_name}}, tudo bem?";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={body} />
      );

      expect(screen.getByTestId("variable-placeholder-first_name")).toBeInTheDocument();
      expect(
        screen.getByText("[Nome personalizado para cada lead]")
      ).toBeInTheDocument();
    });

    it("replaces {{company_name}} with styled placeholder", () => {
      const body = "A {{company_name}} está crescendo.";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={body} />
      );

      expect(screen.getByTestId("variable-placeholder-company_name")).toBeInTheDocument();
      expect(
        screen.getByText("[Empresa personalizada para cada lead]")
      ).toBeInTheDocument();
    });

    it("replaces {{title}} with styled placeholder", () => {
      const body = "Como {{title}}, você deve saber...";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={body} />
      );

      expect(screen.getByTestId("variable-placeholder-title")).toBeInTheDocument();
      expect(
        screen.getByText("[Cargo personalizado para cada lead]")
      ).toBeInTheDocument();
    });

    it("renders multiple variables as placeholders in same text", () => {
      const body = "Olá {{first_name}}! {{ice_breaker}} Na {{company_name}}...";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={body} />
      );

      expect(screen.getByTestId("variable-placeholder-first_name")).toBeInTheDocument();
      expect(screen.getByTestId("variable-placeholder-ice_breaker")).toBeInTheDocument();
      expect(screen.getByTestId("variable-placeholder-company_name")).toBeInTheDocument();
    });

    it("renders variable placeholders with italic styling", () => {
      const body = "Texto {{ice_breaker}} mais texto";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={body} />
      );

      const placeholder = screen.getByTestId("variable-placeholder-ice_breaker");
      expect(placeholder).toHaveClass("italic");
    });

    it("renders normal body when no variables present", () => {
      render(<PreviewEmailStep {...defaultProps} />);
      expect(screen.getByText("Test body content")).toBeInTheDocument();
      expect(screen.queryByTestId("variable-placeholder-ice_breaker")).not.toBeInTheDocument();
    });

    it("preserves surrounding text around variable placeholders", () => {
      const body = "Olá! {{ice_breaker}} Vamos conversar?";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={body} />
      );

      expect(screen.getByText(/Olá!/)).toBeInTheDocument();
      expect(screen.getByText(/Vamos conversar\?/)).toBeInTheDocument();
    });

    it("renders variable placeholders in subject too", () => {
      render(
        <PreviewEmailStep
          stepNumber={1}
          subject="Olá {{first_name}}, sobre {{company_name}}"
          body="corpo"
        />
      );

      const placeholders = screen.getAllByTestId(/variable-placeholder/);
      expect(placeholders.length).toBeGreaterThanOrEqual(2);
    });

    it("keeps unknown variables as-is (not in registry)", () => {
      const body = "Texto {{unknown_var}} aqui";

      render(
        <PreviewEmailStep stepNumber={1} subject="Assunto" body={body} />
      );

      expect(screen.getByText(/\{\{unknown_var\}\}/)).toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 7.1: PreviewLead Resolution
  // ==============================================

  describe("PreviewLead Resolution (Story 7.1 AC #3, #4)", () => {
    const mockLead = {
      firstName: "Maria",
      companyName: "Tech Corp",
      title: "CTO",
      icebreaker: "Vi seu post sobre IA generativa.",
    };

    it("resolves variables when previewLead is provided", () => {
      render(
        <PreviewEmailStep
          stepNumber={1}
          subject="Olá {{first_name}}"
          body="Prezada {{first_name}}, como {{title}} da {{company_name}}... {{ice_breaker}}"
          previewLead={mockLead}
        />
      );

      // Maria appears in both subject and body
      const mariaMatches = screen.getAllByText(/Maria/);
      expect(mariaMatches.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Tech Corp/)).toBeInTheDocument();
      expect(screen.getByText(/CTO/)).toBeInTheDocument();
      expect(screen.getByText(/Vi seu post sobre IA generativa/)).toBeInTheDocument();
      // Should NOT show placeholders when lead data resolves all variables
      expect(screen.queryByTestId("variable-placeholder-first_name")).not.toBeInTheDocument();
    });

    it("shows placeholders for unresolved variables even with previewLead", () => {
      const partialLead = {
        firstName: "Carlos",
        companyName: null,
        title: null,
        icebreaker: null,
      };

      render(
        <PreviewEmailStep
          stepNumber={1}
          subject="Assunto"
          body="Olá {{first_name}}, na {{company_name}}... {{ice_breaker}}"
          previewLead={partialLead}
        />
      );

      // first_name resolved
      expect(screen.getByText(/Carlos/)).toBeInTheDocument();
      // company_name and ice_breaker not resolved → show placeholders
      expect(screen.getByTestId("variable-placeholder-company_name")).toBeInTheDocument();
      expect(screen.getByTestId("variable-placeholder-ice_breaker")).toBeInTheDocument();
    });

    it("shows all placeholders when previewLead is null", () => {
      render(
        <PreviewEmailStep
          stepNumber={1}
          subject="Assunto"
          body="{{first_name}} da {{company_name}}"
          previewLead={null}
        />
      );

      expect(screen.getByTestId("variable-placeholder-first_name")).toBeInTheDocument();
      expect(screen.getByTestId("variable-placeholder-company_name")).toBeInTheDocument();
    });

    it("renders body without variables unchanged even with previewLead", () => {
      render(
        <PreviewEmailStep
          stepNumber={1}
          subject="Assunto normal"
          body="Corpo sem variáveis"
          previewLead={mockLead}
        />
      );

      expect(screen.getByText("Corpo sem variáveis")).toBeInTheDocument();
    });
  });
});
