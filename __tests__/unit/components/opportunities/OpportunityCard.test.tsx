/**
 * Tests for OpportunityCard Component
 * Story 21.4: Central de Oportunidades — AC #2, #3, #5, #8
 * Story 21.5: ações do card — AC #1, #2, #3, #4, #5
 *
 * Cobre: campos do card, badge de intent (5 intents + null), badge de
 * engajamento, expand/collapse do reply_text, unibox condicional, cliques >0,
 * degradações obrigatórias (lead/intent/reply_text/phone/insight nulos),
 * insight do LinkedIn, transição new→viewed UMA vez, rascunho por IA
 * (gerar 1x/copiar/regenerar/falha), mailto, WhatsApp/telefone, triagem.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import type { OpportunityCardData } from "@/hooks/use-opportunities";
import {
  OPPORTUNITY_INTENTS,
  OPPORTUNITY_INTENT_CONFIG,
} from "@/types/opportunity";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockMutate = vi.fn();
const mockGenerate = vi.fn();
const mockRegenerate = vi.fn();
let mockIsGenerating = false;

vi.mock("@/hooks/use-opportunities", () => ({
  useUpdateOpportunityStatus: () => ({ mutate: mockMutate, isPending: false }),
  useOpportunitySuggestion: () => ({
    generate: mockGenerate,
    regenerate: mockRegenerate,
    isGenerating: mockIsGenerating,
    error: null,
    data: null,
  }),
}));

import { toast } from "sonner";

/**
 * `navigator.clipboard` é getter-only no happy-dom — Object.assign não a
 * substitui. defineProperty é o único caminho.
 */
function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

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
    replyText:
      "Olá! Tenho interesse na proposta. Pode me mandar mais detalhes sobre valores e prazos?",
    replySubject: "RE: Proposta comercial",
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

describe("OpportunityCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGenerating = false;
    mockGenerate.mockResolvedValue({ suggestion: null });
    mockRegenerate.mockResolvedValue({ suggestion: null });
  });

  describe("Campos do card (AC2)", () => {
    it("should render lead name, title/company, and campaign name", () => {
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      expect(screen.getByTestId("opportunity-lead-name")).toHaveTextContent("John Doe");
      expect(screen.getByText("CTO · Acme Inc")).toBeInTheDocument();
      expect(screen.getByTestId("opportunity-campaign-name")).toHaveTextContent(
        "Campanha Q3"
      );
    });

    it("should render reply subject and reply text", () => {
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      expect(screen.getByTestId("opportunity-subject")).toHaveTextContent(
        "RE: Proposta comercial"
      );
      expect(screen.getByTestId("opportunity-reply-text")).toHaveTextContent(
        /Tenho interesse na proposta/
      );
    });

    it("should show 'Campanha desconhecida' when campaignName is null", () => {
      render(
        <OpportunityCard opportunity={makeOpportunity({ campaignName: null })} />
      );

      expect(screen.getByTestId("opportunity-campaign-name")).toHaveTextContent(
        "Campanha desconhecida"
      );
    });

    it("should render phone when present (só exibição — ação é 21.5)", () => {
      const opportunity = makeOpportunity();
      opportunity.lead!.phone = "+5511999999999";
      render(<OpportunityCard opportunity={opportunity} />);

      expect(screen.getByTestId("opportunity-phone")).toHaveTextContent(
        "+5511999999999"
      );
    });

    it("should not render phone when null", () => {
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      expect(screen.queryByTestId("opportunity-phone")).not.toBeInTheDocument();
    });
  });

  describe("Badge de intent (AC2)", () => {
    it.each(OPPORTUNITY_INTENTS)(
      "should render intent badge with label for '%s'",
      (intent) => {
        render(<OpportunityCard opportunity={makeOpportunity({ intent })} />);

        expect(screen.getByTestId("opportunity-intent-badge")).toHaveTextContent(
          OPPORTUNITY_INTENT_CONFIG[intent].label
        );
      }
    );

    it("should render 'Não classificado' badge when intent is null", () => {
      render(<OpportunityCard opportunity={makeOpportunity({ intent: null })} />);

      expect(screen.getByTestId("opportunity-intent-badge")).toHaveTextContent(
        "Não classificado"
      );
    });
  });

  describe("Badge de engajamento + métricas (AC2)", () => {
    it("should render 'Alto engajamento' badge when source is engagement", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            source: "engagement",
            replyText: null,
            replySubject: null,
            intent: null,
            openCount: 5,
            clickCount: 0,
          })}
        />
      );

      expect(screen.getByTestId("opportunity-engagement-badge")).toHaveTextContent(
        "Alto engajamento"
      );
    });

    it("should not render engagement badge for reply source", () => {
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      expect(
        screen.queryByTestId("opportunity-engagement-badge")
      ).not.toBeInTheDocument();
    });

    it("should render opens and clicks when clickCount > 0", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            source: "engagement",
            replyText: null,
            openCount: 5,
            clickCount: 2,
            lastEngagementAt: "2026-07-12T08:00:00Z",
          })}
        />
      );

      expect(screen.getByTestId("opportunity-opens")).toHaveTextContent("5 aberturas");
      expect(screen.getByTestId("opportunity-clicks")).toHaveTextContent("2 cliques");
    });

    it("should hide clicks when clickCount is 0", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            source: "engagement",
            replyText: null,
            openCount: 3,
            clickCount: 0,
          })}
        />
      );

      expect(screen.getByTestId("opportunity-opens")).toBeInTheDocument();
      expect(screen.queryByTestId("opportunity-clicks")).not.toBeInTheDocument();
    });

    it("should hide engagement metrics for reply cards (counts null)", () => {
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      expect(screen.queryByTestId("opportunity-opens")).not.toBeInTheDocument();
      expect(screen.queryByTestId("opportunity-clicks")).not.toBeInTheDocument();
    });
  });

  describe("Expand/collapse do reply_text (AC2)", () => {
    it("should start collapsed (line-clamp) and expand on 'Ver mais'", async () => {
      const user = userEvent.setup();
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      const replyText = screen.getByTestId("opportunity-reply-text");
      expect(replyText.className).toContain("line-clamp-2");
      expect(screen.getByTestId("opportunity-toggle-expand")).toHaveTextContent(
        "Ver mais"
      );

      await user.click(screen.getByTestId("opportunity-toggle-expand"));

      expect(replyText.className).not.toContain("line-clamp-2");
      expect(screen.getByTestId("opportunity-toggle-expand")).toHaveTextContent(
        "Ver menos"
      );
    });

    it("should collapse again on 'Ver menos'", async () => {
      const user = userEvent.setup();
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      await user.click(screen.getByTestId("opportunity-toggle-expand"));
      await user.click(screen.getByTestId("opportunity-toggle-expand"));

      expect(screen.getByTestId("opportunity-reply-text").className).toContain(
        "line-clamp-2"
      );
    });
  });

  describe("Unibox (AC2)", () => {
    it("should render 'Abrir no Unibox' link when unibox_url present", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            uniboxUrl: "https://app.instantly.ai/unibox/1",
          })}
        />
      );

      const link = screen.getByTestId("opportunity-unibox-link");
      expect(link).toHaveTextContent("Abrir no Unibox");
      expect(link).toHaveAttribute("href", "https://app.instantly.ai/unibox/1");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("should not render Unibox link when unibox_url is null (caminho de polling)", () => {
      render(<OpportunityCard opportunity={makeOpportunity({ uniboxUrl: null })} />);

      expect(
        screen.queryByTestId("opportunity-unibox-link")
      ).not.toBeInTheDocument();
    });
  });

  describe("Insight do LinkedIn (AC3)", () => {
    it("should render insight block when present", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            insight: {
              leadId: "lead-1",
              suggestion: "Abordar sobre expansão do time",
              relevanceReasoning: "Postou sobre crescimento",
              postUrl: "https://linkedin.com/post/9",
              postText: "Crescendo!",
              postPublishedAt: null,
              createdAt: "2026-07-12T10:00:00Z",
            },
          })}
        />
      );

      const insight = screen.getByTestId("opportunity-insight");
      expect(insight).toHaveTextContent("Insight do LinkedIn");
      expect(insight).toHaveTextContent("Abordar sobre expansão do time");
      expect(insight).toHaveTextContent("Postou sobre crescimento");
      expect(screen.getByTestId("opportunity-insight-post-link")).toHaveAttribute(
        "href",
        "https://linkedin.com/post/9"
      );
    });

    it("should not render insight block when null", () => {
      render(<OpportunityCard opportunity={makeOpportunity({ insight: null })} />);

      expect(screen.queryByTestId("opportunity-insight")).not.toBeInTheDocument();
    });
  });

  describe("Degradações obrigatórias (nunca quebrar)", () => {
    it("should render 'Lead não cadastrado' when lead is null (21.2 AC7)", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({ lead: null, leadId: null })}
        />
      );

      expect(screen.getByTestId("opportunity-lead-name")).toHaveTextContent(
        "Lead não cadastrado"
      );
      // Identidade mínima: reply_subject continua visível
      expect(screen.getByTestId("opportunity-subject")).toHaveTextContent(
        "RE: Proposta comercial"
      );
      expect(screen.queryByTestId("opportunity-phone")).not.toBeInTheDocument();
    });

    it("should not render reply block for engagement (sem reply_text)", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            source: "engagement",
            replyText: null,
            replySubject: null,
            uniboxUrl: null,
            intent: null,
            openCount: 4,
            clickCount: 1,
          })}
        />
      );

      expect(screen.queryByTestId("opportunity-reply-text")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("opportunity-toggle-expand")
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId("opportunity-subject")).not.toBeInTheDocument();
    });

    it("should render worst-case card without crash (tudo nulo)", () => {
      expect(() =>
        render(
          <OpportunityCard
            opportunity={makeOpportunity({
              lead: null,
              leadId: null,
              intent: null,
              replyText: null,
              replySubject: null,
              uniboxUrl: null,
              campaignName: null,
              insight: null,
              openCount: null,
              clickCount: null,
              lastEngagementAt: null,
            })}
          />
        )
      ).not.toThrow();

      expect(screen.getByTestId("opportunity-card")).toBeInTheDocument();
      expect(screen.getByTestId("opportunity-intent-badge")).toHaveTextContent(
        "Não classificado"
      );
    });
  });

  describe("Transição new→viewed (AC5)", () => {
    it("should mark viewed ONCE when opening a new card (silent)", async () => {
      const user = userEvent.setup();
      render(<OpportunityCard opportunity={makeOpportunity({ status: "new" })} />);

      await user.click(screen.getByTestId("opportunity-card"));

      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMutate).toHaveBeenCalledWith(
        {
          opportunityId: "opp-1",
          status: "viewed",
          silent: true,
        },
        // 2º arg: callbacks da mutation — onError libera o useRef para re-tentar em falha
        expect.objectContaining({ onError: expect.any(Function) })
      );

      // Segunda interação NÃO repete a mutation (useRef)
      await user.click(screen.getByTestId("opportunity-card"));
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it("should not mutate when card is not new", async () => {
      const user = userEvent.setup();
      render(<OpportunityCard opportunity={makeOpportunity({ status: "viewed" })} />);

      await user.click(screen.getByTestId("opportunity-card"));

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("should show 'Nova' badge only for status new", () => {
      const { rerender } = render(
        <OpportunityCard opportunity={makeOpportunity({ status: "new" })} />
      );
      expect(screen.getByTestId("opportunity-new-badge")).toBeInTheDocument();

      rerender(<OpportunityCard opportunity={makeOpportunity({ status: "viewed" })} />);
      expect(screen.queryByTestId("opportunity-new-badge")).not.toBeInTheDocument();
    });
  });
});

// ==============================================
// Story 21.5 — ações do card
// ==============================================

describe("OpportunityCard — Story 21.5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGenerating = false;
    mockGenerate.mockResolvedValue({ suggestion: null });
    mockRegenerate.mockResolvedValue({ suggestion: null });
  });

  describe("Rascunho por IA (AC1/AC2/AC5)", () => {
    it("não gera nada antes de o card ser aberto (evita write/custo em massa na lista)", () => {
      render(<OpportunityCard opportunity={makeOpportunity()} />);

      expect(mockGenerate).not.toHaveBeenCalled();
      expect(screen.queryByTestId("opportunity-draft")).not.toBeInTheDocument();
    });

    it("gera o rascunho UMA vez ao abrir, mesmo com várias aberturas (AC1)", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue({ suggestion: "Rascunho gerado" });

      render(<OpportunityCard opportunity={makeOpportunity()} />);
      const card = screen.getByTestId("opportunity-card");

      await user.click(card); // abre
      await user.click(card); // fecha
      await user.click(card); // reabre

      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("opportunity-draft-text")).toHaveTextContent(
        "Rascunho gerado"
      );
    });

    it("suggestion já cacheada no servidor → renderiza sem gerar (sem custo novo — AC1)", async () => {
      const user = userEvent.setup();

      render(
        <OpportunityCard
          opportunity={makeOpportunity({ suggestion: "Rascunho do cache" })}
        />
      );

      expect(screen.getByTestId("opportunity-draft-text")).toHaveTextContent(
        "Rascunho do cache"
      );

      await user.click(screen.getByTestId("opportunity-card"));
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("estado carregando enquanto gera (AC1)", () => {
      mockIsGenerating = true;

      render(<OpportunityCard opportunity={makeOpportunity({ suggestion: null })} />);

      expect(screen.getByTestId("opportunity-draft-loading")).toHaveTextContent(
        "Gerando rascunho"
      );
    });

    it("Copiar coloca o rascunho no clipboard (AC2)", async () => {
      const user = userEvent.setup();
      // Depois do setup(): o userEvent instala o próprio stub de clipboard e
      // sobrescreveria o nosso se viesse antes.
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);

      render(
        <OpportunityCard opportunity={makeOpportunity({ suggestion: "Rascunho X" })} />
      );

      await user.click(screen.getByTestId("opportunity-draft-copy"));

      expect(writeText).toHaveBeenCalledWith("Rascunho X");
      expect(toast.success).toHaveBeenCalledWith("Rascunho copiado!");
    });

    it("Regenerar chama regenerate() e substitui o texto (AC2)", async () => {
      const user = userEvent.setup();
      mockRegenerate.mockResolvedValue({ suggestion: "Rascunho NOVO" });

      render(
        <OpportunityCard
          opportunity={makeOpportunity({ suggestion: "Rascunho antigo" })}
        />
      );

      await user.click(screen.getByTestId("opportunity-draft-regenerate"));

      expect(mockRegenerate).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("opportunity-draft-text")).toHaveTextContent(
        "Rascunho NOVO"
      );
    });

    it("Copiar/Regenerar NÃO disparam o expand do card (stopPropagation)", async () => {
      const user = userEvent.setup();
      stubClipboard(vi.fn());

      render(
        <OpportunityCard
          opportunity={makeOpportunity({ suggestion: "Rascunho", status: "new" })}
        />
      );

      await user.click(screen.getByTestId("opportunity-draft-copy"));
      await user.click(screen.getByTestId("opportunity-draft-regenerate"));

      // O new→viewed do container não foi acionado
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("falha na geração → mensagem discreta + Tentar de novo; o card NÃO quebra (AC5)", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue(null); // hook resolve null em erro

      render(<OpportunityCard opportunity={makeOpportunity()} />);
      await user.click(screen.getByTestId("opportunity-card"));

      expect(screen.getByTestId("opportunity-draft-unavailable")).toBeInTheDocument();
      expect(screen.getByTestId("opportunity-draft-retry")).toBeInTheDocument();
      // Demais ações continuam de pé
      expect(screen.getByTestId("opportunity-triage")).toBeInTheDocument();
      expect(screen.getByTestId("opportunity-lead-name")).toHaveTextContent("John Doe");
    });

    it("Tentar de novo após falha regenera e mostra o rascunho (AC5)", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue(null);
      mockRegenerate.mockResolvedValue({ suggestion: "Deu certo agora" });

      render(<OpportunityCard opportunity={makeOpportunity()} />);
      await user.click(screen.getByTestId("opportunity-card"));
      await user.click(screen.getByTestId("opportunity-draft-retry"));

      expect(screen.getByTestId("opportunity-draft-text")).toHaveTextContent(
        "Deu certo agora"
      );
    });

    it("degradação engagement (sem reply_text) → rascunho ainda é oferecido (AC5)", async () => {
      const user = userEvent.setup();
      mockGenerate.mockResolvedValue({ suggestion: "Vi que você abriu o e-mail" });

      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            source: "engagement",
            replyText: null,
            replySubject: null,
            intent: null,
            openCount: 5,
            clickCount: 2,
          })}
        />
      );

      await user.click(screen.getByTestId("opportunity-card"));

      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("opportunity-draft-text")).toHaveTextContent(
        "Vi que você abriu o e-mail"
      );
    });
  });

  describe("mailto (AC3)", () => {
    it("href tem o assunto e o corpo do rascunho, encodados", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            suggestion: "Olá John, tudo bem?",
            replySubject: "Proposta comercial",
          })}
        />
      );

      const link = screen.getByTestId("opportunity-action-mailto");
      expect(link).toHaveAttribute(
        "href",
        `mailto:john@acme.com?subject=${encodeURIComponent(
          "Re: Proposta comercial"
        )}&body=${encodeURIComponent("Olá John, tudo bem?")}`
      );
    });

    it("não duplica o prefixo quando o assunto já vem com RE: do Instantly", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({ replySubject: "RE: Proposta comercial" })}
        />
      );

      const href = screen.getByTestId("opportunity-action-mailto").getAttribute("href");
      expect(href).toContain(encodeURIComponent("RE: Proposta comercial"));
      expect(href).not.toContain(encodeURIComponent("Re: RE:"));
    });

    it("oportunidade de ENGAJAMENTO (sem replySubject) usa assunto neutro, nunca vazio", () => {
      // Engajamento = abriu/clicou, não respondeu → não há `reply_subject`. Um
      // `subject=` vazio abriria o cliente de e-mail com a linha em branco.
      render(<OpportunityCard opportunity={makeOpportunity({ replySubject: null })} />);

      const href = screen.getByTestId("opportunity-action-mailto").getAttribute("href");
      expect(href).not.toContain("subject=&");
      expect(href).toContain(encodeURIComponent("John, tudo bem?"));
    });

    it("ausente quando o lead não tem e-mail (degradação)", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            lead: {
              id: "lead-1",
              firstName: "John",
              lastName: "Doe",
              email: null,
              companyName: "Acme Inc",
              title: "CTO",
              phone: null,
              photoUrl: null,
              isMonitored: false,
              linkedinUrl: null,
            },
          })}
        />
      );

      expect(screen.queryByTestId("opportunity-action-mailto")).not.toBeInTheDocument();
    });
  });

  describe("WhatsApp / telefone (AC3)", () => {
    it("sem telefone → oferece Buscar telefone e emite onPhoneLookup", async () => {
      const user = userEvent.setup();
      const onPhoneLookup = vi.fn();
      const opportunity = makeOpportunity(); // lead.phone = null

      render(
        <OpportunityCard opportunity={opportunity} onPhoneLookup={onPhoneLookup} />
      );

      expect(
        screen.queryByTestId("opportunity-action-whatsapp")
      ).not.toBeInTheDocument();
      await user.click(screen.getByTestId("opportunity-action-phone-lookup"));

      expect(onPhoneLookup).toHaveBeenCalledWith(opportunity);
      expect(mockMutate).not.toHaveBeenCalled(); // stopPropagation
    });

    it("com telefone do lead → emite onWhatsApp", async () => {
      const user = userEvent.setup();
      const onWhatsApp = vi.fn();
      const opportunity = makeOpportunity({
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
      });

      render(<OpportunityCard opportunity={opportunity} onWhatsApp={onWhatsApp} />);

      await user.click(screen.getByTestId("opportunity-action-whatsapp"));
      expect(onWhatsApp).toHaveBeenCalledWith(opportunity);
    });

    it("localPhone (lookup recém-feito) habilita o WhatsApp sem refetch", () => {
      render(
        <OpportunityCard opportunity={makeOpportunity()} localPhone="5511988887777" />
      );

      expect(screen.getByTestId("opportunity-action-whatsapp")).toBeInTheDocument();
      expect(
        screen.queryByTestId("opportunity-action-phone-lookup")
      ).not.toBeInTheDocument();
    });

    it("sem e-mail e sem telefone → nem WhatsApp nem busca (SignalHire precisa de e-mail)", () => {
      render(
        <OpportunityCard
          opportunity={makeOpportunity({
            lead: {
              id: "lead-1",
              firstName: "John",
              lastName: "Doe",
              email: null,
              companyName: null,
              title: null,
              phone: null,
              photoUrl: null,
              isMonitored: false,
              linkedinUrl: null,
            },
          })}
        />
      );

      expect(
        screen.queryByTestId("opportunity-action-whatsapp")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("opportunity-action-phone-lookup")
      ).not.toBeInTheDocument();
    });

    it("lead null → nenhuma ação de contato, sem crash (AC5)", () => {
      render(<OpportunityCard opportunity={makeOpportunity({ lead: null })} />);

      expect(screen.queryByTestId("opportunity-actions")).not.toBeInTheDocument();
      expect(screen.getByTestId("opportunity-lead-name")).toHaveTextContent(
        "Lead não cadastrado"
      );
      expect(screen.getByTestId("opportunity-triage")).toBeInTheDocument();
    });
  });

  describe("Triagem (AC4)", () => {
    it.each([
      ["opportunity-triage-contacted", "contacted"],
      ["opportunity-triage-meeting", "meeting_booked"],
      ["opportunity-triage-discarded", "discarded"],
    ])("%s chama a mutation com status %s (sem silent → toast)", async (testId, status) => {
      const user = userEvent.setup();

      render(<OpportunityCard opportunity={makeOpportunity()} />);
      await user.click(screen.getByTestId(testId));

      expect(mockMutate).toHaveBeenCalledWith({
        opportunityId: "opp-1",
        status,
      });
    });

    it("oculta a ação correspondente ao status atual", () => {
      const { rerender } = render(
        <OpportunityCard opportunity={makeOpportunity({ status: "contacted" })} />
      );
      expect(
        screen.queryByTestId("opportunity-triage-contacted")
      ).not.toBeInTheDocument();

      rerender(
        <OpportunityCard opportunity={makeOpportunity({ status: "discarded" })} />
      );
      expect(
        screen.queryByTestId("opportunity-triage-discarded")
      ).not.toBeInTheDocument();

      rerender(
        <OpportunityCard opportunity={makeOpportunity({ status: "meeting_booked" })} />
      );
      expect(
        screen.queryByTestId("opportunity-triage-meeting")
      ).not.toBeInTheDocument();
    });

    it("triagem em card new NÃO dispara também o new→viewed (stopPropagation)", async () => {
      const user = userEvent.setup();

      render(<OpportunityCard opportunity={makeOpportunity({ status: "new" })} />);
      await user.click(screen.getByTestId("opportunity-triage-contacted"));

      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMutate).toHaveBeenCalledWith({
        opportunityId: "opp-1",
        status: "contacted",
      });
    });
  });
});
