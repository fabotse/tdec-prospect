/**
 * OpportunityPanel Tests
 * Story 10.7: Janela de Oportunidade — UI + Notificacoes
 *
 * AC: #1 — Lista de leads quentes com destaque visual
 * AC: #2 — Estado vazio com sugestao de ajuste
 * AC: #5 — Dados de contato (email, telefone) + WhatsApp placeholder
 * UX: Collapsible (aberto por padrao) + limite de 5 leads visiveis
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { OpportunityPanel } from "@/components/tracking/OpportunityPanel";
import { createMockOpportunityLead } from "../../../helpers/mock-data";

// ==============================================
// MOCK DATA
// ==============================================

const defaultLeads = [
  createMockOpportunityLead({
    leadEmail: "joao@test.com",
    firstName: "Joao",
    lastName: "Silva",
    openCount: 5,
    phone: "+5511999999999",
    lastOpenAt: "2026-02-09T10:00:00.000Z",
  }),
  createMockOpportunityLead({
    leadEmail: "maria@test.com",
    firstName: "Maria",
    lastName: "Santos",
    openCount: 4,
    phone: undefined,
    lastOpenAt: "2026-02-08T14:00:00.000Z",
  }),
];

// ==============================================
// TESTS
// ==============================================

describe("OpportunityPanel", () => {
  describe("collapsible", () => {
    it("inicia aberto por padrao (conteudo visivel)", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      expect(screen.getByTestId("opportunity-content")).toBeInTheDocument();
      expect(screen.getByTestId("chevron-up")).toBeInTheDocument();
    });

    it("fecha ao clicar no header", async () => {
      const user = userEvent.setup();
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      await user.click(screen.getByTestId("opportunity-header-toggle"));

      expect(screen.queryByTestId("opportunity-content")).not.toBeInTheDocument();
      expect(screen.getByTestId("chevron-down")).toBeInTheDocument();
    });

    it("reabre ao clicar no header novamente", async () => {
      const user = userEvent.setup();
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      await user.click(screen.getByTestId("opportunity-header-toggle")); // close
      await user.click(screen.getByTestId("opportunity-header-toggle")); // reopen

      expect(screen.getByTestId("opportunity-content")).toBeInTheDocument();
      expect(screen.getByTestId("chevron-up")).toBeInTheDocument();
    });
  });

  describe("conteudo (aberto por padrao)", () => {
    it("renderiza lista de leads quentes", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      const rows = screen.getAllByTestId("opportunity-lead-row");
      expect(rows).toHaveLength(2);
    });

    it("exibe email, nome, aberturas e ultimo open de cada lead", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      expect(screen.getAllByText("joao@test.com").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Joao Silva")).toBeInTheDocument();
      expect(screen.getByText("5 aberturas")).toBeInTheDocument();

      expect(screen.getAllByText("maria@test.com").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
      expect(screen.getByText("4 aberturas")).toBeInTheDocument();
    });

    it("exibe dados de contato: email com link mailto", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      const emailLinks = screen.getAllByTestId("contact-email-link");
      expect(emailLinks).toHaveLength(2);
      expect(emailLinks[0]).toHaveAttribute("href", "mailto:joao@test.com");
      expect(emailLinks[1]).toHaveAttribute("href", "mailto:maria@test.com");
    });

    it("exibe telefone com link tel quando disponivel", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      const phoneLinks = screen.getAllByTestId("contact-phone-link");
      expect(phoneLinks).toHaveLength(1);
      expect(phoneLinks[0]).toHaveAttribute("href", "tel:+5511999999999");
      expect(phoneLinks[0]).toHaveTextContent("+5511999999999");
    });

    it("nao exibe telefone quando nao disponivel", () => {
      const leadsWithoutPhone = [
        createMockOpportunityLead({ leadEmail: "test@x.com", phone: undefined }),
      ];

      render(<OpportunityPanel leads={leadsWithoutPhone} isLoading={false} />);

      expect(screen.queryByTestId("contact-phone-link")).not.toBeInTheDocument();
    });

    it("exibe badge WhatsApp em breve", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      expect(screen.getByTestId("whatsapp-badge")).toBeInTheDocument();
      expect(screen.getByText("(WhatsApp em breve)")).toBeInTheDocument();
    });

    it("exibe estado vazio quando nenhum lead qualificado", () => {
      render(<OpportunityPanel leads={[]} isLoading={false} />);

      expect(screen.getByTestId("opportunity-empty")).toBeInTheDocument();
      expect(screen.getByText("Nenhum lead atingiu o threshold atual")).toBeInTheDocument();
    });

    it("exibe texto de sugestao de ajuste no estado vazio", () => {
      render(<OpportunityPanel leads={[]} isLoading={false} />);

      expect(screen.getByText("Ajuste o threshold acima")).toBeInTheDocument();
    });

    it("exibe skeleton durante loading", () => {
      render(<OpportunityPanel leads={[]} isLoading={true} />);

      const skeletonRows = screen.getAllByTestId("opportunity-skeleton-row");
      expect(skeletonRows).toHaveLength(3);
    });
  });

  describe("header (sempre visivel)", () => {
    it("exibe icone Flame para destaque visual", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      expect(screen.getByTestId("opportunity-flame-icon")).toBeInTheDocument();
    });

    it("exibe contagem no subtitulo do card", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      expect(screen.getByText("2 leads atingiram o threshold")).toBeInTheDocument();
    });

    it("exibe contagem singular quando 1 lead", () => {
      const singleLead = [createMockOpportunityLead({ leadEmail: "solo@test.com" })];

      render(<OpportunityPanel leads={singleLead} isLoading={false} />);

      expect(screen.getByText("1 lead atingiu o threshold")).toBeInTheDocument();
    });
  });

  describe("limite de leads visiveis", () => {
    const manyLeads = Array.from({ length: 8 }, (_, i) =>
      createMockOpportunityLead({
        leadEmail: `lead-${i}@test.com`,
        firstName: `Lead`,
        lastName: `${i}`,
        openCount: 10 - i,
      })
    );

    it("exibe no maximo 5 leads por padrao", () => {
      render(<OpportunityPanel leads={manyLeads} isLoading={false} />);

      const rows = screen.getAllByTestId("opportunity-lead-row");
      expect(rows).toHaveLength(5);
    });

    it("exibe botao 'Ver todos' quando ha mais de 5 leads", () => {
      render(<OpportunityPanel leads={manyLeads} isLoading={false} />);

      const button = screen.getByTestId("show-all-leads-button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent("Ver todos (8)");
    });

    it("nao exibe botao 'Ver todos' quando ha 5 ou menos leads", () => {
      render(<OpportunityPanel leads={defaultLeads} isLoading={false} />);

      expect(screen.queryByTestId("show-all-leads-button")).not.toBeInTheDocument();
    });

    it("exibe todos os leads ao clicar 'Ver todos'", async () => {
      const user = userEvent.setup();
      render(<OpportunityPanel leads={manyLeads} isLoading={false} />);

      await user.click(screen.getByTestId("show-all-leads-button"));

      const rows = screen.getAllByTestId("opportunity-lead-row");
      expect(rows).toHaveLength(8);
      expect(screen.queryByTestId("show-all-leads-button")).not.toBeInTheDocument();
    });
  });

  it("aceita ref via forwardRef", () => {
    const ref = createRef<HTMLDivElement>();

    render(<OpportunityPanel ref={ref} leads={defaultLeads} isLoading={false} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveAttribute("data-testid", "opportunity-panel");
  });
});
