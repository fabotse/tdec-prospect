/**
 * LeadTrackingTable Tests
 * Story 10.5: Lead Tracking Detail
 * Story 11.7: WhatsApp indicator column (AC #3, #7)
 *
 * AC: #1 — Tabela com 6 colunas, valores corretos, nomes formatados
 * AC: #2 — Ordenacao client-side
 * AC: #3 — Badge "Alto Interesse" quando openCount >= 3
 * AC: #4 — Skeleton loading state
 * AC: #5 — Paginacao client-side
 * AC: #6 — Estado vazio
 * AC 11.7 #3 — WhatsApp icon for leads with messages + tooltip
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadTrackingTable } from "@/components/tracking/LeadTrackingTable";
import { createMockLeadTracking } from "../../../helpers/mock-data";
import type { LeadTracking } from "@/types/tracking";

// ==============================================
// MOCK DATA
// ==============================================

function createLeads(count: number): LeadTracking[] {
  return Array.from({ length: count }, (_, i) =>
    createMockLeadTracking({
      leadEmail: `lead-${i + 1}@empresa.com`,
      firstName: `Nome${i + 1}`,
      lastName: `Sobrenome${i + 1}`,
      openCount: i + 1,
      clickCount: i,
      hasReplied: i % 2 === 0,
      lastOpenAt: i === 0 ? null : `2026-02-0${Math.min(i, 9)}T10:00:00Z`,
    })
  );
}

const mockLeads: LeadTracking[] = [
  createMockLeadTracking({
    leadEmail: "maria@empresa.com",
    firstName: "Maria",
    lastName: "Silva",
    openCount: 5,
    clickCount: 3,
    hasReplied: true,
    lastOpenAt: "2026-02-09T10:00:00Z",
  }),
  createMockLeadTracking({
    leadEmail: "joao@empresa.com",
    firstName: "Joao",
    lastName: "Santos",
    openCount: 2,
    clickCount: 1,
    hasReplied: false,
    lastOpenAt: "2026-02-08T14:30:00Z",
  }),
  createMockLeadTracking({
    leadEmail: "ana@empresa.com",
    firstName: "Ana",
    lastName: undefined,
    openCount: 3,
    clickCount: 0,
    hasReplied: false,
    lastOpenAt: null,
  }),
  createMockLeadTracking({
    leadEmail: "sem-nome@empresa.com",
    firstName: undefined,
    lastName: undefined,
    openCount: 0,
    clickCount: 0,
    hasReplied: false,
    lastOpenAt: null,
  }),
];

// ==============================================
// 5.1: Renderizacao — 6 colunas, valores, nomes
// ==============================================

describe("LeadTrackingTable", () => {
  describe("renderizacao basica (AC #1)", () => {
    it("renderiza 6 colunas de header", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Nome")).toBeInTheDocument();
      expect(screen.getByText("Aberturas")).toBeInTheDocument();
      expect(screen.getByText("Cliques")).toBeInTheDocument();
      expect(screen.getByText("Respondeu")).toBeInTheDocument();
      expect(screen.getByText("Ultimo Open")).toBeInTheDocument();
    });

    it("renderiza emails dos leads", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      expect(screen.getByText("maria@empresa.com")).toBeInTheDocument();
      expect(screen.getByText("joao@empresa.com")).toBeInTheDocument();
      expect(screen.getByText("ana@empresa.com")).toBeInTheDocument();
      expect(screen.getByText("sem-nome@empresa.com")).toBeInTheDocument();
    });

    it("formata nome completo corretamente", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      expect(screen.getByText("Maria Silva")).toBeInTheDocument();
      expect(screen.getByText("Joao Santos")).toBeInTheDocument();
    });

    it("exibe somente firstName quando lastName e undefined", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      expect(screen.getByText("Ana")).toBeInTheDocument();
    });

    it("exibe '-' quando firstName e lastName sao undefined", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      const rows = screen.getAllByTestId("lead-row");
      const lastRow = rows[3];
      // Row sem nome tem pelo menos um "-" (nome e/ou lastOpenAt)
      const dashes = within(lastRow).getAllByText("-");
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it("exibe hasReplied como 'Sim' ou 'Nao'", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      expect(screen.getByText("Sim")).toBeInTheDocument();
      expect(screen.getAllByText("Nao")).toHaveLength(3);
    });

    it("exibe lastOpenAt como tempo relativo ou '-'", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      // Leads com lastOpenAt=null exibem "-"
      const rows = screen.getAllByTestId("lead-row");
      const anaRow = rows[2];
      expect(within(anaRow).getByText("-")).toBeInTheDocument();
    });

    it("renderiza contagem de openCount e clickCount", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      const rows = screen.getAllByTestId("lead-row");
      // Maria: openCount=5, clickCount=3
      expect(within(rows[0]).getByText("5")).toBeInTheDocument();
      expect(within(rows[0]).getByText("3")).toBeInTheDocument();
    });
  });

  // ==============================================
  // 5.2: Ordenacao (AC #2)
  // ==============================================

  describe("ordenacao (AC #2)", () => {
    it("ordena por Aberturas desc ao clicar na coluna", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      await user.click(screen.getByTestId("sort-openCount"));

      const rows = screen.getAllByTestId("lead-row");
      // Desc: 5, 3, 2, 0
      expect(within(rows[0]).getByText("maria@empresa.com")).toBeInTheDocument();
      expect(within(rows[1]).getByText("ana@empresa.com")).toBeInTheDocument();
      expect(within(rows[2]).getByText("joao@empresa.com")).toBeInTheDocument();
      expect(within(rows[3]).getByText("sem-nome@empresa.com")).toBeInTheDocument();
    });

    it("ordena por Aberturas asc ao clicar novamente", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      // 1st click: desc
      await user.click(screen.getByTestId("sort-openCount"));
      // 2nd click: asc
      await user.click(screen.getByTestId("sort-openCount"));

      const rows = screen.getAllByTestId("lead-row");
      // Asc: 0, 2, 3, 5
      expect(within(rows[0]).getByText("sem-nome@empresa.com")).toBeInTheDocument();
      expect(within(rows[1]).getByText("joao@empresa.com")).toBeInTheDocument();
      expect(within(rows[2]).getByText("ana@empresa.com")).toBeInTheDocument();
      expect(within(rows[3]).getByText("maria@empresa.com")).toBeInTheDocument();
    });

    it("reseta ordenacao ao clicar pela terceira vez", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      // 3 clicks: desc -> asc -> null
      await user.click(screen.getByTestId("sort-openCount"));
      await user.click(screen.getByTestId("sort-openCount"));
      await user.click(screen.getByTestId("sort-openCount"));

      const rows = screen.getAllByTestId("lead-row");
      // Original order
      expect(within(rows[0]).getByText("maria@empresa.com")).toBeInTheDocument();
      expect(within(rows[1]).getByText("joao@empresa.com")).toBeInTheDocument();
    });

    it("ordena por Email ao clicar na coluna", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      await user.click(screen.getByTestId("sort-leadEmail"));

      const rows = screen.getAllByTestId("lead-row");
      // Desc alphabetical: s, m, j, a
      expect(within(rows[0]).getByText("sem-nome@empresa.com")).toBeInTheDocument();
    });

    it("muda coluna de ordenacao ao clicar em coluna diferente", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      await user.click(screen.getByTestId("sort-openCount"));
      await user.click(screen.getByTestId("sort-clickCount"));

      const rows = screen.getAllByTestId("lead-row");
      // clickCount desc: 3, 1, 0, 0
      expect(within(rows[0]).getByText("maria@empresa.com")).toBeInTheDocument();
      expect(within(rows[1]).getByText("joao@empresa.com")).toBeInTheDocument();
    });
  });

  // ==============================================
  // 5.3: Badge "Alto Interesse" (AC #3)
  // ==============================================

  describe("badge Alto Interesse (AC #3)", () => {
    it("exibe badge quando openCount >= 3", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      const badges = screen.getAllByTestId("high-interest-badge");
      // Maria (5) e Ana (3) devem ter badge
      expect(badges).toHaveLength(2);
      expect(badges[0]).toHaveTextContent("Alto Interesse");
    });

    it("nao exibe badge quando openCount < 3", () => {
      const lowLeads = [
        createMockLeadTracking({ openCount: 0 }),
        createMockLeadTracking({ leadEmail: "test2@x.com", openCount: 1 }),
        createMockLeadTracking({ leadEmail: "test3@x.com", openCount: 2 }),
      ];
      render(<LeadTrackingTable leads={lowLeads} isLoading={false} />);

      expect(screen.queryByTestId("high-interest-badge")).not.toBeInTheDocument();
    });

    it("exibe badge no threshold exato (openCount === 3)", () => {
      const leads = [
        createMockLeadTracking({ openCount: 3 }),
      ];
      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      expect(screen.getByTestId("high-interest-badge")).toBeInTheDocument();
    });
  });

  // ==============================================
  // 5.4: Skeleton loading state (AC #4)
  // ==============================================

  describe("skeleton loading state (AC #4)", () => {
    it("exibe 5 skeleton rows quando isLoading=true", () => {
      render(<LeadTrackingTable leads={[]} isLoading={true} />);

      const skeletonRows = screen.getAllByTestId("skeleton-row");
      expect(skeletonRows).toHaveLength(5);
    });

    it("nao exibe leads quando isLoading=true", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={true} />);

      expect(screen.queryByTestId("lead-row")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("skeleton-row")).toHaveLength(5);
    });

    it("exibe headers mesmo durante loading", () => {
      render(<LeadTrackingTable leads={[]} isLoading={true} />);

      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Nome")).toBeInTheDocument();
      expect(screen.getByText("Aberturas")).toBeInTheDocument();
    });

    it("nao exibe paginacao durante loading", () => {
      render(<LeadTrackingTable leads={[]} isLoading={true} />);

      expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
    });
  });

  // ==============================================
  // 5.5: Estado vazio (AC #6)
  // ==============================================

  describe("estado vazio (AC #6)", () => {
    it("exibe estado vazio quando leads=[] e !isLoading", () => {
      render(<LeadTrackingTable leads={[]} isLoading={false} />);

      expect(screen.getByTestId("lead-tracking-empty")).toBeInTheDocument();
      expect(screen.getByText("Nenhum evento de tracking recebido ainda")).toBeInTheDocument();
      expect(screen.getByText("Os dados de tracking aparecerao aqui apos o envio da campanha")).toBeInTheDocument();
    });

    it("nao exibe tabela no estado vazio", () => {
      render(<LeadTrackingTable leads={[]} isLoading={false} />);

      expect(screen.queryByTestId("lead-tracking-table")).not.toBeInTheDocument();
    });
  });

  // ==============================================
  // 5.6: Paginacao (AC #5)
  // ==============================================

  describe("paginacao (AC #5)", () => {
    const manyLeads = createLeads(45);

    it("exibe contagem total de leads", () => {
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      expect(screen.getByText("45 leads no total")).toBeInTheDocument();
    });

    it("exibe 'Pagina 1 de 3' com 45 leads", () => {
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      expect(screen.getByTestId("page-indicator")).toHaveTextContent("Pagina 1 de 3");
    });

    it("exibe apenas 20 leads por pagina", () => {
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      const rows = screen.getAllByTestId("lead-row");
      expect(rows).toHaveLength(20);
    });

    it("desabilita botao Anterior na primeira pagina", () => {
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      expect(screen.getByTestId("prev-page")).toBeDisabled();
    });

    it("habilita botao Proximo quando ha mais paginas", () => {
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      expect(screen.getByTestId("next-page")).not.toBeDisabled();
    });

    it("navega para proxima pagina ao clicar Proximo", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      await user.click(screen.getByTestId("next-page"));

      expect(screen.getByTestId("page-indicator")).toHaveTextContent("Pagina 2 de 3");
      expect(screen.getByTestId("prev-page")).not.toBeDisabled();
    });

    it("navega para pagina anterior ao clicar Anterior", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      await user.click(screen.getByTestId("next-page"));
      await user.click(screen.getByTestId("prev-page"));

      expect(screen.getByTestId("page-indicator")).toHaveTextContent("Pagina 1 de 3");
    });

    it("desabilita Proximo na ultima pagina", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      await user.click(screen.getByTestId("next-page"));
      await user.click(screen.getByTestId("next-page"));

      expect(screen.getByTestId("page-indicator")).toHaveTextContent("Pagina 3 de 3");
      expect(screen.getByTestId("next-page")).toBeDisabled();
    });

    it("ultima pagina exibe leads restantes (5 leads)", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      await user.click(screen.getByTestId("next-page"));
      await user.click(screen.getByTestId("next-page"));

      const rows = screen.getAllByTestId("lead-row");
      expect(rows).toHaveLength(5);
    });

    it("reseta para pagina 1 ao ordenar", async () => {
      const user = userEvent.setup();
      render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      await user.click(screen.getByTestId("next-page"));
      expect(screen.getByTestId("page-indicator")).toHaveTextContent("Pagina 2 de 3");

      await user.click(screen.getByTestId("sort-openCount"));
      expect(screen.getByTestId("page-indicator")).toHaveTextContent("Pagina 1 de 3");
    });

    it("nao exibe paginacao quando leads <= LEADS_PER_PAGE", () => {
      const fewLeads = createLeads(5);
      render(<LeadTrackingTable leads={fewLeads} isLoading={false} />);

      expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
    });

    it("clamps pagina quando leads diminuem dinamicamente", async () => {
      const user = userEvent.setup();
      const manyLeads = createLeads(45);
      const { rerender } = render(<LeadTrackingTable leads={manyLeads} isLoading={false} />);

      // Navigate to page 3
      await user.click(screen.getByTestId("next-page"));
      await user.click(screen.getByTestId("next-page"));
      expect(screen.getByTestId("page-indicator")).toHaveTextContent("Pagina 3 de 3");

      // Rerender with fewer leads (only 1 page worth)
      const fewLeads = createLeads(5);
      rerender(<LeadTrackingTable leads={fewLeads} isLoading={false} />);

      // Should clamp — all 5 leads rendered, no empty table
      const rows = screen.getAllByTestId("lead-row");
      expect(rows).toHaveLength(5);
    });
  });

  // ==============================================
  // Estado de erro (Code Review M2)
  // ==============================================

  describe("estado de erro", () => {
    it("exibe estado de erro quando isError=true", () => {
      render(<LeadTrackingTable leads={[]} isLoading={false} isError={true} />);

      expect(screen.getByTestId("lead-tracking-error")).toBeInTheDocument();
      expect(screen.getByText("Erro ao carregar dados de tracking")).toBeInTheDocument();
      expect(screen.getByText("Tente novamente mais tarde")).toBeInTheDocument();
    });

    it("prioriza erro sobre estado vazio", () => {
      render(<LeadTrackingTable leads={[]} isLoading={false} isError={true} />);

      expect(screen.getByTestId("lead-tracking-error")).toBeInTheDocument();
      expect(screen.queryByTestId("lead-tracking-empty")).not.toBeInTheDocument();
    });

    it("nao exibe erro quando isError=false", () => {
      render(<LeadTrackingTable leads={[]} isLoading={false} isError={false} />);

      expect(screen.queryByTestId("lead-tracking-error")).not.toBeInTheDocument();
      expect(screen.getByTestId("lead-tracking-empty")).toBeInTheDocument();
    });
  });

  // ==============================================
  // Story 10.7 — Dynamic threshold + clickable badge
  // ==============================================

  describe("badge dinamico com threshold (10.7 AC #4)", () => {
    it("usa highInterestThreshold prop para badge", () => {
      const leads = [
        createMockLeadTracking({ leadEmail: "a@x.com", openCount: 5 }),
        createMockLeadTracking({ leadEmail: "b@x.com", openCount: 4 }),
        createMockLeadTracking({ leadEmail: "c@x.com", openCount: 3 }),
      ];

      render(<LeadTrackingTable leads={leads} isLoading={false} highInterestThreshold={5} />);

      // Only lead with openCount=5 should have badge (threshold=5)
      const badges = screen.getAllByTestId("high-interest-badge");
      expect(badges).toHaveLength(1);
    });

    it("usa fallback DEFAULT_HIGH_INTEREST_THRESHOLD quando prop ausente", () => {
      const leads = [
        createMockLeadTracking({ leadEmail: "a@x.com", openCount: 3 }),
        createMockLeadTracking({ leadEmail: "b@x.com", openCount: 2 }),
      ];

      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      // Default threshold is 3, so openCount=3 gets badge
      expect(screen.getAllByTestId("high-interest-badge")).toHaveLength(1);
    });

    it("badge e clicavel e chama onHighInterestClick", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const leads = [createMockLeadTracking({ openCount: 5 })];

      render(<LeadTrackingTable leads={leads} isLoading={false} onHighInterestClick={onClick} />);

      await user.click(screen.getByTestId("high-interest-badge"));
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("badge tem cursor-pointer", () => {
      const leads = [createMockLeadTracking({ openCount: 5 })];

      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      const badge = screen.getByTestId("high-interest-badge");
      expect(badge.className).toContain("cursor-pointer");
    });
  });

  // ==============================================
  // Story 11.7 — WhatsApp indicator column (AC #3, #7)
  // ==============================================

  describe("coluna WhatsApp (Story 11.7 AC #3)", () => {
    it("renderiza header WA", () => {
      render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);

      expect(screen.getByText("WA")).toBeInTheDocument();
    });

    it("exibe icone MessageCircle para leads com mensagens WhatsApp", () => {
      const leads = [
        createMockLeadTracking({
          leadEmail: "sent@test.com",
          whatsappMessageCount: 2,
          lastWhatsAppSentAt: "2026-02-10T14:00:00Z",
          lastWhatsAppStatus: "sent",
        }),
      ];

      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      expect(screen.getByTestId("whatsapp-indicator")).toBeInTheDocument();
    });

    it("nao exibe icone para leads sem mensagens WhatsApp (AC #3)", () => {
      const leads = [
        createMockLeadTracking({
          leadEmail: "unsent@test.com",
          whatsappMessageCount: 0,
        }),
      ];

      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      expect(screen.queryByTestId("whatsapp-indicator")).not.toBeInTheDocument();
    });

    it("nao exibe icone quando whatsappMessageCount e undefined", () => {
      const leads = [
        createMockLeadTracking({ leadEmail: "no-data@test.com" }),
      ];

      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      expect(screen.queryByTestId("whatsapp-indicator")).not.toBeInTheDocument();
    });

    it("tooltip mostra contagem e data para multiplas mensagens", async () => {
      const user = userEvent.setup();
      const leads = [
        createMockLeadTracking({
          leadEmail: "multi@test.com",
          whatsappMessageCount: 3,
          lastWhatsAppSentAt: "2026-02-10T14:00:00Z",
          lastWhatsAppStatus: "sent",
        }),
      ];

      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      const indicator = screen.getByTestId("whatsapp-indicator");
      await user.hover(indicator);

      // Tooltip should mention "3 mensagens WhatsApp"
      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip.textContent).toContain("3 mensagens WhatsApp");
    });

    it("tooltip mostra 'WhatsApp enviado em' para mensagem unica", async () => {
      const user = userEvent.setup();
      const leads = [
        createMockLeadTracking({
          leadEmail: "single@test.com",
          whatsappMessageCount: 1,
          lastWhatsAppSentAt: "2026-02-10T14:00:00Z",
          lastWhatsAppStatus: "sent",
        }),
      ];

      render(<LeadTrackingTable leads={leads} isLoading={false} />);

      const indicator = screen.getByTestId("whatsapp-indicator");
      await user.hover(indicator);

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip.textContent).toContain("WhatsApp enviado em");
    });
  });
});
