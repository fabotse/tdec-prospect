/**
 * Tests for OpportunitiesPageContent Component
 * Story 21.4: Central de Oportunidades — AC #2, #4, #6
 * Story 21.5: dialogs de ação levantados (composer WhatsApp pré-preenchido com
 *   o rascunho + PhoneLookup alimentando `localPhones`) — AC #3.
 *
 * Estados loading/error/empty/lista + paginação + busca client-side.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { OpportunitiesPageContent } from "@/components/opportunities/OpportunitiesPageContent";
import type { OpportunityCardData } from "@/hooks/use-opportunities";

/**
 * O WhatsAppComposerDialog usa `useAIGenerate` (react-query) internamente para
 * o botão "Gerar com IA" dele — ortogonal ao rascunho da 21.5, mas exige o
 * provider assim que o dialog monta.
 */
function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(QueryClientProvider, { client: queryClient }, ui)
  );
}

// Mock use-opportunities: useOpportunities controlado; filterOpportunitiesBySearch REAL
const mockUseOpportunities = vi.fn();
const mockMutate = vi.fn();
const mockGenerate = vi.fn().mockResolvedValue({ suggestion: null });
const mockRegenerate = vi.fn().mockResolvedValue({ suggestion: null });

vi.mock("@/hooks/use-opportunities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-opportunities")>();
  return {
    ...actual,
    useOpportunities: (...args: unknown[]) => mockUseOpportunities(...args),
    useUpdateOpportunityStatus: () => ({ mutate: mockMutate, isPending: false }),
    useOpportunitySuggestion: () => ({
      generate: mockGenerate,
      regenerate: mockRegenerate,
      isGenerating: false,
      error: null,
      data: null,
    }),
  };
});

// Story 21.5: o envio real é coberto em use-whatsapp-send-from-opportunity.test.ts
const mockSend = vi.fn().mockResolvedValue(true);
vi.mock("@/hooks/use-whatsapp-send-from-opportunity", () => ({
  useWhatsAppSendFromOpportunity: () => ({
    send: mockSend,
    isSending: false,
    error: null,
    lastResult: null,
  }),
}));

// Story 21.9: a mutation real é coberta em use-lead-sequence-action.test.ts.
// O mock também evita o useQueryClient() em testes renderizados sem provider.
const mockSequenceMutate = vi.fn();
const mockUseLeadSequenceAction = vi.fn();
vi.mock("@/hooks/use-lead-sequence-action", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-lead-sequence-action")>();
  return {
    ...actual,
    useLeadSequenceAction: (...args: unknown[]) => mockUseLeadSequenceAction(...args),
  };
});

// PhoneLookupDialog real depende de usePhoneLookup (rede) — stub que expõe
// apenas o contrato usado aqui: onPhoneFound.
vi.mock("@/components/tracking/PhoneLookupDialog", () => ({
  PhoneLookupDialog: ({
    lead,
    onPhoneFound,
  }: {
    lead: { leadEmail: string };
    onPhoneFound: (phone: string) => void;
  }) => (
    <div data-testid="phone-lookup-dialog">
      <span data-testid="phone-lookup-email">{lead.leadEmail}</span>
      <button type="button" onClick={() => onPhoneFound("5511988887777")}>
        Simular telefone encontrado
      </button>
    </div>
  ),
}));

// Mock useCampaigns (usado pelo FilterBar)
vi.mock("@/hooks/use-campaigns", () => ({
  useCampaigns: vi.fn(() => ({ data: [], isLoading: false })),
}));

function makeOpportunity(
  overrides: Partial<OpportunityCardData> = {}
): OpportunityCardData {
  return {
    id: "opp-1",
    tenantId: "t1",
    leadId: "lead-1",
    campaignId: "camp-1",
    source: "reply",
    replyEventId: "evt-1",
    replyText: "Tenho interesse",
    replySubject: "RE: Proposta",
    uniboxUrl: null,
    intent: "interessado",
    ltInterestStatus: null,
    suggestion: null,
    status: "viewed",
    meetingBookedAt: null,
    openCount: null,
    clickCount: null,
    lastEngagementAt: null,
    createdAt: "2026-07-13T10:00:00Z",
    updatedAt: "2026-07-13T10:00:00Z",
    lead: {
      id: "lead-1",
      firstName: "John",
      lastName: "Doe",
      email: "john@acme.com",
      companyName: "Acme Inc",
      title: "CTO",
      phone: null,
      photoUrl: null,
      isMonitored: false,
      linkedinUrl: null,
    },
    campaignName: "Campanha Q3",
    insight: null,
    ...overrides,
  };
}

function mockHookReturn(
  overrides: Partial<{
    opportunities: OpportunityCardData[];
    meta: { total: number; page: number; limit: number; totalPages: number } | null;
    isLoading: boolean;
    isFetching: boolean;
    error: string | null;
  }> = {}
) {
  mockUseOpportunities.mockReturnValue({
    opportunities: [],
    meta: null,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

describe("OpportunitiesPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLeadSequenceAction.mockReturnValue({
      mutate: mockSequenceMutate,
      isPending: false,
    });
  });

  it("should render loading skeleton when loading (AC6/UX-DR2)", () => {
    mockHookReturn({ isLoading: true });

    render(<OpportunitiesPageContent />);

    expect(screen.getByTestId("opportunities-loading")).toBeInTheDocument();
  });

  it("should render error state (AC6/UX-DR2)", () => {
    mockHookReturn({ error: "Falha na API" });

    render(<OpportunitiesPageContent />);

    expect(screen.getByTestId("opportunities-error")).toHaveTextContent(
      "Erro: Falha na API"
    );
  });

  it("should render empty state without filters (AC6)", () => {
    mockHookReturn({
      opportunities: [],
      meta: { total: 0, page: 1, limit: 25, totalPages: 0 },
    });

    render(<OpportunitiesPageContent />);

    expect(screen.getByTestId("opportunities-empty-state")).toHaveTextContent(
      "Nenhuma oportunidade ainda"
    );
  });

  it("should render list of opportunity cards", () => {
    mockHookReturn({
      opportunities: [
        makeOpportunity({ id: "a" }),
        makeOpportunity({ id: "b" }),
      ],
      meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
    });

    render(<OpportunitiesPageContent />);

    expect(screen.getAllByTestId("opportunity-card")).toHaveLength(2);
    expect(screen.getByText("2 oportunidades")).toBeInTheDocument();
  });

  it("should pass server filters to the hook (default period=all, page=1, perPage=25)", () => {
    mockHookReturn();

    render(<OpportunitiesPageContent />);

    expect(mockUseOpportunities).toHaveBeenCalledWith(
      expect.objectContaining({ period: "all", page: 1, perPage: 25 })
    );
  });

  it("should show pagination when totalPages > 1", () => {
    mockHookReturn({
      opportunities: [makeOpportunity()],
      meta: { total: 60, page: 1, limit: 25, totalPages: 3 },
    });

    render(<OpportunitiesPageContent />);

    expect(
      screen.getByRole("button", { name: /pagina anterior/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /proxima pagina/i })
    ).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("should hide pagination when totalPages <= 1", () => {
    mockHookReturn({
      opportunities: [makeOpportunity()],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    });

    render(<OpportunitiesPageContent />);

    expect(
      screen.queryByRole("button", { name: /proxima pagina/i })
    ).not.toBeInTheDocument();
  });

  it("should filter client-side by search and show filtered empty state (AC4/AC6)", async () => {
    const user = userEvent.setup();
    mockHookReturn({
      opportunities: [makeOpportunity()],
      meta: { total: 1, page: 1, limit: 25, totalPages: 1 },
    });

    render(<OpportunitiesPageContent />);

    expect(screen.getAllByTestId("opportunity-card")).toHaveLength(1);

    const searchInput = screen.getByPlaceholderText(
      /Buscar por nome, e-mail ou empresa/i
    );
    await user.type(searchInput, "zzz-nao-existe");

    expect(screen.queryByTestId("opportunity-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("opportunities-empty-state")).toHaveTextContent(
      "Nenhuma oportunidade com esses filtros"
    );
  });

  it("should keep matching cards when search matches lead (busca client-side)", async () => {
    const user = userEvent.setup();
    mockHookReturn({
      opportunities: [
        makeOpportunity({ id: "a" }),
        makeOpportunity({
          id: "b",
          lead: {
            id: "lead-2",
            firstName: "Maria",
            lastName: "Silva",
            email: "maria@globex.com",
            companyName: "Globex",
            title: null,
            phone: null,
            photoUrl: null,
            isMonitored: false,
            linkedinUrl: null,
          },
        }),
      ],
      meta: { total: 2, page: 1, limit: 25, totalPages: 1 },
    });

    render(<OpportunitiesPageContent />);

    const searchInput = screen.getByPlaceholderText(
      /Buscar por nome, e-mail ou empresa/i
    );
    await user.type(searchInput, "maria");

    const cards = screen.getAllByTestId("opportunity-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Maria Silva");
  });
});

// ==============================================
// Story 21.5 — dialogs de ação (AC #3)
// ==============================================

describe("OpportunitiesPageContent — ações (Story 21.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerate.mockResolvedValue({ suggestion: null });
    mockUseLeadSequenceAction.mockReturnValue({
      mutate: mockSequenceMutate,
      isPending: false,
    });
  });

  it("abrir o composer via WhatsApp pré-preenche com o rascunho (suggestion)", async () => {
    const user = userEvent.setup();
    mockHookReturn({
      opportunities: [
        makeOpportunity({
          suggestion: "Rascunho da IA para o João",
          lead: {
            id: "lead-1",
            firstName: "John",
            lastName: "Doe",
            email: "john@acme.com",
            companyName: "Acme Inc",
            title: "CTO",
            phone: "5511999999999",
            photoUrl: null,
            isMonitored: false,
            linkedinUrl: null,
          },
        }),
      ],
    });

    renderWithClient(<OpportunitiesPageContent />);

    expect(screen.queryByTestId("whatsapp-composer-dialog")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("opportunity-action-whatsapp"));

    expect(screen.getByTestId("whatsapp-composer-dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rascunho da IA para o João")).toBeInTheDocument();
  });

  it("onPhoneFound alimenta localPhones → o card passa a oferecer WhatsApp", async () => {
    const user = userEvent.setup();
    mockHookReturn({ opportunities: [makeOpportunity()] }); // lead.phone = null

    renderWithClient(<OpportunitiesPageContent />);

    // Sem telefone: o card oferece a busca
    expect(screen.queryByTestId("opportunity-action-whatsapp")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("opportunity-action-phone-lookup"));

    expect(screen.getByTestId("phone-lookup-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("phone-lookup-email")).toHaveTextContent("john@acme.com");

    await user.click(screen.getByText("Simular telefone encontrado"));

    // Dialog fecha e o card recebe o telefone (otimista, antes do refetch)
    expect(screen.queryByTestId("phone-lookup-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("opportunity-action-whatsapp")).toBeInTheDocument();
  });

  it("envio bem-sucedido fecha o composer e repassa opportunityId/leadId", async () => {
    const user = userEvent.setup();
    mockSend.mockResolvedValue(true);
    mockHookReturn({
      opportunities: [
        makeOpportunity({
          suggestion: "Rascunho",
          lead: {
            id: "lead-1",
            firstName: "John",
            lastName: "Doe",
            email: "john@acme.com",
            companyName: "Acme Inc",
            title: "CTO",
            phone: "5511999999999",
            photoUrl: null,
            isMonitored: false,
            linkedinUrl: null,
          },
        }),
      ],
    });

    renderWithClient(<OpportunitiesPageContent />);
    await user.click(screen.getByTestId("opportunity-action-whatsapp"));
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(mockSend).toHaveBeenCalledWith({
      opportunityId: "opp-1",
      leadId: "lead-1",
      phone: "5511999999999",
      message: "Rascunho",
    });
    expect(screen.queryByTestId("whatsapp-composer-dialog")).not.toBeInTheDocument();
  });

  it("envio que falha mantém o composer aberto (usuário pode tentar de novo)", async () => {
    const user = userEvent.setup();
    mockSend.mockResolvedValue(false);
    mockHookReturn({
      opportunities: [
        makeOpportunity({
          suggestion: "Rascunho",
          lead: {
            id: "lead-1",
            firstName: "John",
            lastName: "Doe",
            email: "john@acme.com",
            companyName: "Acme Inc",
            title: "CTO",
            phone: "5511999999999",
            photoUrl: null,
            isMonitored: false,
            linkedinUrl: null,
          },
        }),
      ],
    });

    renderWithClient(<OpportunitiesPageContent />);
    await user.click(screen.getByTestId("opportunity-action-whatsapp"));
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(screen.getByTestId("whatsapp-composer-dialog")).toBeInTheDocument();
  });

  it("lead null → card sem ações de contato, e nenhum dialog é montado", () => {
    mockHookReturn({ opportunities: [makeOpportunity({ lead: null })] });

    renderWithClient(<OpportunitiesPageContent />);

    expect(screen.queryByTestId("opportunity-actions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("whatsapp-composer-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("phone-lookup-dialog")).not.toBeInTheDocument();
    // Triagem segue disponível (AC4 não depende de lead)
    expect(screen.getByTestId("opportunity-triage")).toBeInTheDocument();
  });

  // ==============================================
  // Story 21.9 AC#6 — "Parar sequência" a partir do card
  // ==============================================

  it("parar sequência: card → dialog com motivos → confirmar → mutate stop (21.9)", async () => {
    const user = userEvent.setup();
    mockHookReturn({
      opportunities: [makeOpportunity({ campaignId: "camp-9" })],
    });

    renderWithClient(<OpportunitiesPageContent />);

    await user.click(screen.getByTestId("opportunity-action-stop-sequence"));

    // O hook é re-instanciado com o campaignId da oportunidade alvo.
    expect(mockUseLeadSequenceAction).toHaveBeenLastCalledWith("camp-9");

    const confirm = await screen.findByTestId("confirm-stop-sequence");
    await user.click(confirm);

    expect(mockSequenceMutate).toHaveBeenCalledWith(
      {
        action: "stop",
        leadEmail: "john@acme.com",
        reason: "responded_other_channel",
      },
      expect.anything()
    );
  });

  it("parar sequência: oportunidade com campaignId null não exibe o atalho (21.9)", () => {
    // Cast: o tipo diz `string` (00055 NOT NULL); o guard do AC6 é defensivo.
    mockHookReturn({
      opportunities: [makeOpportunity({ campaignId: null as unknown as string })],
    });

    renderWithClient(<OpportunitiesPageContent />);

    expect(
      screen.queryByTestId("opportunity-action-stop-sequence")
    ).not.toBeInTheDocument();
  });
});
