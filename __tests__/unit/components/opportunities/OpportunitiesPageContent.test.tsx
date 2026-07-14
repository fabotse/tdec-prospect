/**
 * Tests for OpportunitiesPageContent Component
 * Story 21.4: Central de Oportunidades — AC #2, #4, #6
 *
 * Estados loading/error/empty/lista + paginação + busca client-side.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpportunitiesPageContent } from "@/components/opportunities/OpportunitiesPageContent";
import type { OpportunityCardData } from "@/hooks/use-opportunities";

// Mock use-opportunities: useOpportunities controlado; filterOpportunitiesBySearch REAL
const mockUseOpportunities = vi.fn();
const mockMutate = vi.fn();

vi.mock("@/hooks/use-opportunities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-opportunities")>();
  return {
    ...actual,
    useOpportunities: (...args: unknown[]) => mockUseOpportunities(...args),
    useUpdateOpportunityStatus: () => ({ mutate: mockMutate, isPending: false }),
  };
});

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
