/**
 * Story 24.24 — card da conversa depois da execucao
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentConversationCard } from "@/components/agent/AgentConversationCard";
import type { MoreLeadsProposal, RewriteProposal } from "@/types/post-execution-chat";

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const REWRITE: RewriteProposal = {
  stepNumber: 3,
  position: 2,
  blockPosition: 3,
  emailMode: "follow-up",
  original: { subject: "Assunto antigo", body: "Corpo antigo" },
  proposed: { subject: "Assunto novo", body: "Corpo novo {{first_name}}" },
  review: { status: "needs_human_review", reasons: ["Clichê: alavancar"] },
  canApply: true,
  blockedReason: null,
};

const MORE: MoreLeadsProposal = {
  count: 2,
  referenceName: "Joao Silva",
  briefing: { jobTitles: ["CISO"] } as never,
  estimatedCostBRL: 12.5,
  canStart: true,
  blockedReason: null,
};

function renderCard(card: Parameters<typeof AgentConversationCard>[0]["card"]) {
  const handlers = { onApply: vi.fn(), onStartSearch: vi.fn(), onDiscard: vi.fn() };
  render(<AgentConversationCard card={card} {...handlers} />);
  return handlers;
}

describe("AgentConversationCard (24.24)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("reescrita", () => {
    it("mostra original x proposta, selo do revisor e motivos", () => {
      renderCard({ kind: "rewrite", executionId: "e", proposal: REWRITE });
      expect(screen.getByText("Nova versão do e-mail 2")).toBeInTheDocument();
      expect(screen.getByTestId("conversation-card-original")).toHaveTextContent("Corpo antigo");
      expect(screen.getByTestId("conversation-card-proposed")).toHaveTextContent("Corpo novo {{first_name}}");
      expect(screen.getByTestId("copy-review-badge")).toHaveTextContent("Precisa revisão humana");
      expect(screen.getByText("Clichê: alavancar")).toBeInTheDocument();
    });

    it("Substituir e Descartar chamam os handlers", () => {
      const h = renderCard({ kind: "rewrite", executionId: "e", proposal: REWRITE });
      fireEvent.click(screen.getByTestId("conversation-card-apply"));
      expect(h.onApply).toHaveBeenCalledWith(REWRITE);
      fireEvent.click(screen.getByTestId("conversation-card-discard"));
      expect(h.onDiscard).toHaveBeenCalled();
    });

    it("sem gate aberto: so Copiar e o motivo", () => {
      renderCard({
        kind: "rewrite",
        executionId: "e",
        proposal: { ...REWRITE, canApply: false, blockedReason: "A campanha ja foi aprovada e enviada ao Instantly." },
      });
      expect(screen.queryByTestId("conversation-card-apply")).not.toBeInTheDocument();
      expect(screen.getByTestId("conversation-card-copy")).toBeInTheDocument();
      expect(screen.getByTestId("conversation-card-blocked-reason")).toHaveTextContent("enviada ao Instantly");
    });

    it("Copiar leva a proposta para a area de transferencia", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      renderCard({ kind: "rewrite", executionId: "e", proposal: REWRITE });
      fireEvent.click(screen.getByTestId("conversation-card-copy"));
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      expect(writeText).toHaveBeenCalledWith("Assunto: Assunto novo\n\nCorpo novo {{first_name}}");
    });
  });

  describe("mais leads", () => {
    it("mostra N, referencia e custo em BRL; o clique chama o handler", () => {
      const h = renderCard({ kind: "more_leads", executionId: "e", proposal: MORE });
      expect(screen.getByTestId("conversation-card-count")).toHaveTextContent("2 leads");
      expect(screen.getByTestId("conversation-card-reference")).toHaveTextContent("Joao Silva");
      expect(screen.getByTestId("conversation-card-cost")).toHaveTextContent(/R\$\s*12,50/);
      fireEvent.click(screen.getByTestId("conversation-card-start"));
      expect(h.onStartSearch).toHaveBeenCalledWith(MORE);
    });

    it("execucao nao terminal: botao desabilitado com o motivo", () => {
      const h = renderCard({
        kind: "more_leads",
        executionId: "e",
        proposal: { ...MORE, canStart: false, blockedReason: "Disponivel quando esta execucao terminar." },
      });
      const start = screen.getByTestId("conversation-card-start");
      expect(start).toBeDisabled();
      fireEvent.click(start);
      expect(h.onStartSearch).not.toHaveBeenCalled();
      expect(screen.getByTestId("conversation-card-blocked-reason")).toHaveTextContent(
        "Disponivel quando esta execucao terminar."
      );
    });
  });
});
