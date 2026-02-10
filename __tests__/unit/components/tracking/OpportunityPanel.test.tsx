/**
 * OpportunityPanel Tests
 * Story 10.7: Janela de Oportunidade — UI + Notificacoes
 * Story 11.4: Envio Individual de WhatsApp
 * Story 11.5: Busca de Telefone no Fluxo de Leads Quentes
 *
 * AC 10.7: #1 — Lista de leads quentes com destaque visual
 * AC 10.7: #2 — Estado vazio com sugestao de ajuste
 * AC 11.4: #4 — Botao WhatsApp habilitado/desabilitado
 * AC 11.4: #5 — Integracao com WhatsAppComposerDialog
 * AC 11.4: #6 — Props campaignId e productId
 * AC 11.4: #7 — Indicador visual de "ja enviado"
 * AC 11.5: #1 — Botao "Buscar Telefone" quando sem phone
 * AC 11.5: #5 — Apos telefone obtido, habilitar WhatsApp
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { OpportunityPanel } from "@/components/tracking/OpportunityPanel";
import { createMockOpportunityLead } from "../../../helpers/mock-data";

// ==============================================
// MOCKS
// ==============================================

const mockSend = vi.fn();
vi.mock("@/hooks/use-whatsapp-send", () => ({
  useWhatsAppSend: () => ({
    send: mockSend,
    isSending: false,
    error: null,
    lastResult: null,
  }),
}));

const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("@/components/tracking/WhatsAppComposerDialog", () => ({
  WhatsAppComposerDialog: ({
    open,
    onSend,
    lead,
  }: {
    open: boolean;
    onSend?: (data: { phone: string; message: string }) => void;
    lead: { phone?: string };
    onOpenChange: (open: boolean) => void;
    campaignId: string;
    campaignName?: string;
    productId?: string | null;
  }) =>
    open ? (
      <div data-testid="mock-composer-dialog">
        <span data-testid="mock-composer-lead-phone">{lead.phone}</span>
        <button
          data-testid="mock-composer-send"
          onClick={() => onSend?.({ phone: lead.phone!, message: "Test msg" })}
        >
          Send
        </button>
      </div>
    ) : null,
}));

let mockPhoneLookupOnPhoneFound: ((phone: string) => void) | undefined;
vi.mock("@/components/tracking/PhoneLookupDialog", () => ({
  PhoneLookupDialog: ({
    open,
    onPhoneFound,
    lead,
  }: {
    open: boolean;
    onPhoneFound: (phone: string) => void;
    lead: { leadEmail: string; firstName?: string; lastName?: string; leadId?: string };
    onOpenChange: (open: boolean) => void;
  }) => {
    if (open) {
      mockPhoneLookupOnPhoneFound = onPhoneFound;
      return (
        <div data-testid="mock-phone-lookup-dialog">
          <span data-testid="mock-phone-lookup-lead-email">{lead.leadEmail}</span>
          <span data-testid="mock-phone-lookup-lead-id">{lead.leadId || "none"}</span>
          <button
            data-testid="mock-phone-lookup-found"
            onClick={() => onPhoneFound("+5511777777777")}
          >
            Phone Found
          </button>
        </div>
      );
    }
    return null;
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

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

const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";

// ==============================================
// TESTS
// ==============================================

describe("OpportunityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(true);
    mockPhoneLookupOnPhoneFound = undefined;
  });

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

  // ==============================================
  // Story 11.4 Tests
  // ==============================================

  describe("WhatsApp button (AC 11.4 #4)", () => {
    it("exibe botao WhatsApp para lead com phone", () => {
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "with@test.com", phone: "+5511999999999" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      const button = screen.getByTestId("whatsapp-send-button");
      expect(button).not.toBeDisabled();
    });

    it("exibe botao 'Buscar Telefone' quando lead nao tem phone (AC 11.5 #1)", () => {
      const leadsWithoutPhone = [
        createMockOpportunityLead({ leadEmail: "no@test.com", phone: undefined }),
      ];
      render(
        <OpportunityPanel leads={leadsWithoutPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      expect(screen.getByTestId("phone-lookup-button")).toBeInTheDocument();
      expect(screen.queryByTestId("whatsapp-send-button")).not.toBeInTheDocument();
    });

    it("botao WhatsApp desabilitado quando campaignId nao fornecido", () => {
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "x@test.com", phone: "+5511999999999" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} />
      );

      const button = screen.getByTestId("whatsapp-send-button");
      expect(button).toBeDisabled();
    });

    it("exibe mix correto de botoes para leads com e sem phone", () => {
      render(
        <OpportunityPanel leads={defaultLeads} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      // joao has phone → WhatsApp button
      expect(screen.getAllByTestId("whatsapp-send-button")).toHaveLength(1);
      // maria has no phone → Phone lookup button
      expect(screen.getAllByTestId("phone-lookup-button")).toHaveLength(1);
    });
  });

  describe("WhatsApp Composer Dialog (AC 11.4 #5)", () => {
    it("abre dialog ao clicar no botao WhatsApp", async () => {
      const user = userEvent.setup();
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "lead@test.com", phone: "+5511999999999" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      await user.click(screen.getByTestId("whatsapp-send-button"));

      expect(screen.getByTestId("mock-composer-dialog")).toBeInTheDocument();
    });

    it("passa phone do lead para o dialog", async () => {
      const user = userEvent.setup();
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "lead@test.com", phone: "+5511888888888" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      await user.click(screen.getByTestId("whatsapp-send-button"));

      expect(screen.getByTestId("mock-composer-lead-phone")).toHaveTextContent("+5511888888888");
    });

    it("fecha dialog apos envio com sucesso", async () => {
      const user = userEvent.setup();
      mockSend.mockResolvedValue(true);
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "lead@test.com", phone: "+5511999999999" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      await user.click(screen.getByTestId("whatsapp-send-button"));
      expect(screen.getByTestId("mock-composer-dialog")).toBeInTheDocument();

      await user.click(screen.getByTestId("mock-composer-send"));

      expect(screen.queryByTestId("mock-composer-dialog")).not.toBeInTheDocument();
    });

    it("mantem dialog aberto em caso de erro no envio", async () => {
      const user = userEvent.setup();
      mockSend.mockResolvedValue(false);
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "lead@test.com", phone: "+5511999999999" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      await user.click(screen.getByTestId("whatsapp-send-button"));
      await user.click(screen.getByTestId("mock-composer-send"));

      expect(screen.getByTestId("mock-composer-dialog")).toBeInTheDocument();
    });
  });

  describe("indicador de ja enviado (AC 11.4 #7)", () => {
    it("exibe indicador 'Enviado' para leads no sentLeadEmails", () => {
      const sentEmails = new Set(["joao@test.com"]);
      render(
        <OpportunityPanel
          leads={defaultLeads}
          isLoading={false}
          campaignId={CAMPAIGN_ID}
          sentLeadEmails={sentEmails}
        />
      );

      const indicators = screen.getAllByTestId("whatsapp-sent-indicator");
      expect(indicators).toHaveLength(1);
      expect(indicators[0]).toHaveTextContent("Enviado");
    });

    it("nao exibe indicador para leads nao enviados", () => {
      render(
        <OpportunityPanel
          leads={defaultLeads}
          isLoading={false}
          campaignId={CAMPAIGN_ID}
          sentLeadEmails={new Set()}
        />
      );

      expect(screen.queryByTestId("whatsapp-sent-indicator")).not.toBeInTheDocument();
    });

    it("exibe indicador apos envio com sucesso via dialog", async () => {
      const user = userEvent.setup();
      mockSend.mockResolvedValue(true);
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "lead@test.com", phone: "+5511999999999" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      // Open dialog and send
      await user.click(screen.getByTestId("whatsapp-send-button"));
      await user.click(screen.getByTestId("mock-composer-send"));

      // Should now show sent indicator
      expect(screen.getByTestId("whatsapp-sent-indicator")).toBeInTheDocument();
    });
  });

  describe("props (AC 11.4 #6)", () => {
    it("aceita campaignId e productId opcionais", () => {
      render(
        <OpportunityPanel
          leads={defaultLeads}
          isLoading={false}
          campaignId={CAMPAIGN_ID}
          campaignName="Test Campaign"
          productId="prod-1"
        />
      );

      expect(screen.getByTestId("opportunity-panel")).toBeInTheDocument();
    });

    it("funciona sem campaignId (botoes WhatsApp desabilitados)", () => {
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "x@test.com", phone: "+5511999999999" }),
      ];
      render(<OpportunityPanel leads={leadsWithPhone} isLoading={false} />);

      const buttons = screen.getAllByTestId("whatsapp-send-button");
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  // ==============================================
  // Story 11.5 Tests
  // ==============================================

  describe("Botao Buscar Telefone (AC 11.5 #1)", () => {
    it("exibe botao 'Buscar Telefone' quando lead sem phone", () => {
      const leadsWithoutPhone = [
        createMockOpportunityLead({ leadEmail: "no-phone@test.com", phone: undefined }),
      ];
      render(
        <OpportunityPanel leads={leadsWithoutPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      expect(screen.getByTestId("phone-lookup-button")).toBeInTheDocument();
    });

    it("nao exibe botao 'Buscar Telefone' quando lead tem phone", () => {
      const leadsWithPhone = [
        createMockOpportunityLead({ leadEmail: "has-phone@test.com", phone: "+5511999999999" }),
      ];
      render(
        <OpportunityPanel leads={leadsWithPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      expect(screen.queryByTestId("phone-lookup-button")).not.toBeInTheDocument();
    });

    it("abre PhoneLookupDialog ao clicar 'Buscar Telefone'", async () => {
      const user = userEvent.setup();
      const leadsWithoutPhone = [
        createMockOpportunityLead({
          leadEmail: "no-phone@test.com",
          firstName: "Carlos",
          phone: undefined,
          leadId: "lead-uuid-2",
        }),
      ];
      render(
        <OpportunityPanel leads={leadsWithoutPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      await user.click(screen.getByTestId("phone-lookup-button"));

      expect(screen.getByTestId("mock-phone-lookup-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("mock-phone-lookup-lead-email")).toHaveTextContent("no-phone@test.com");
      expect(screen.getByTestId("mock-phone-lookup-lead-id")).toHaveTextContent("lead-uuid-2");
    });
  });

  describe("Apos telefone obtido (AC 11.5 #5)", () => {
    it("atualiza lead para mostrar phone apos PhoneLookup", async () => {
      const user = userEvent.setup();
      const leadsWithoutPhone = [
        createMockOpportunityLead({ leadEmail: "no-phone@test.com", phone: undefined }),
      ];
      render(
        <OpportunityPanel leads={leadsWithoutPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      // Open PhoneLookupDialog
      await user.click(screen.getByTestId("phone-lookup-button"));

      // Simulate phone found
      await user.click(screen.getByTestId("mock-phone-lookup-found"));

      // Dialog should close and phone link should appear
      expect(screen.queryByTestId("mock-phone-lookup-dialog")).not.toBeInTheDocument();
      expect(screen.getByTestId("contact-phone-link")).toHaveTextContent("+5511777777777");
    });

    it("habilita botao WhatsApp apos phone obtido", async () => {
      const user = userEvent.setup();
      const leadsWithoutPhone = [
        createMockOpportunityLead({ leadEmail: "no-phone@test.com", phone: undefined }),
      ];
      render(
        <OpportunityPanel leads={leadsWithoutPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      // Initially shows phone lookup button (no whatsapp button)
      expect(screen.getByTestId("phone-lookup-button")).toBeInTheDocument();
      expect(screen.queryByTestId("whatsapp-send-button")).not.toBeInTheDocument();

      // Get phone
      await user.click(screen.getByTestId("phone-lookup-button"));
      await user.click(screen.getByTestId("mock-phone-lookup-found"));

      // Now shows WhatsApp button instead of lookup
      expect(screen.getByTestId("whatsapp-send-button")).toBeInTheDocument();
      expect(screen.queryByTestId("phone-lookup-button")).not.toBeInTheDocument();
    });

    it("invalida tracking query apos phone obtido", async () => {
      const user = userEvent.setup();
      const leadsWithoutPhone = [
        createMockOpportunityLead({ leadEmail: "no-phone@test.com", phone: undefined }),
      ];
      render(
        <OpportunityPanel leads={leadsWithoutPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      await user.click(screen.getByTestId("phone-lookup-button"));
      await user.click(screen.getByTestId("mock-phone-lookup-found"));

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["leadTracking", CAMPAIGN_ID],
      });
    });

    it("passa effectivePhone para WhatsAppComposerDialog apos phone obtido", async () => {
      const user = userEvent.setup();
      const leadsWithoutPhone = [
        createMockOpportunityLead({ leadEmail: "no-phone@test.com", phone: undefined }),
      ];
      render(
        <OpportunityPanel leads={leadsWithoutPhone} isLoading={false} campaignId={CAMPAIGN_ID} />
      );

      // Get phone via lookup
      await user.click(screen.getByTestId("phone-lookup-button"));
      await user.click(screen.getByTestId("mock-phone-lookup-found"));

      // Now click WhatsApp button
      await user.click(screen.getByTestId("whatsapp-send-button"));

      expect(screen.getByTestId("mock-composer-lead-phone")).toHaveTextContent("+5511777777777");
    });
  });
});
