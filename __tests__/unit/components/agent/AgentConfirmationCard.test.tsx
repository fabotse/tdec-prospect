/**
 * AgentConfirmationCard Tests
 * Story 24.5: Confirmacao por card com botoes
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentConfirmationCard } from "@/components/agent/AgentConfirmationCard";
import type { ParsedBriefing } from "@/types/agent";

const BRIEFING: ParsedBriefing = {
  technology: null,
  jobTitles: ["CTO", "CIO"],
  location: "Sao Paulo",
  companySize: null,
  industry: "fintech",
  productSlug: null,
  mode: "guided",
  skipSteps: ["search_companies"],
  objective: "COLD_OUTREACH",
  emailCount: 3,
};

const PRODUCT = {
  name: "Radar",
  description: "Monitora custos de nuvem",
  features: "Alertas",
  differentials: null,
  targetAudience: "CFOs",
};

describe("AgentConfirmationCard", () => {
  const onAction = vi.fn();
  const onEditField = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onEditField.mockResolvedValue({ ok: true });
  });

  describe("variante briefing", () => {
    it("mostra os campos como chips e os botoes Confirmar/Ajustar", () => {
      render(
        <AgentConfirmationCard variant="briefing" briefing={BRIEFING} onAction={onAction} onEditField={onEditField} />
      );

      expect(screen.getByTestId("briefing-chip-jobTitles")).toHaveTextContent("Cargos:CTO, CIO");
      expect(screen.getByTestId("briefing-chip-location")).toHaveTextContent("Sao Paulo");
      expect(screen.getByTestId("briefing-chip-industry")).toHaveTextContent("fintech");
      expect(screen.getByTestId("briefing-chip-technology")).toHaveTextContent("nao definido");
      expect(screen.getByTestId("briefing-chip-objective")).toHaveTextContent("Primeiro contato");
      expect(screen.getByTestId("briefing-chip-emailCount")).toHaveTextContent("3");

      fireEvent.click(screen.getByTestId("card-action-confirm_briefing"));
      fireEvent.click(screen.getByTestId("card-action-adjust_briefing"));
      expect(onAction).toHaveBeenNthCalledWith(1, "confirm_briefing");
      expect(onAction).toHaveBeenNthCalledWith(2, "adjust_briefing");
    });

    it("editar um chip: abre o editor com o valor atual, salva e fecha", async () => {
      render(
        <AgentConfirmationCard variant="briefing" briefing={BRIEFING} onAction={onAction} onEditField={onEditField} />
      );

      fireEvent.click(screen.getByTestId("briefing-chip-jobTitles"));
      const input = screen.getByTestId("chip-input-jobTitles") as HTMLInputElement;
      expect(input.value).toBe("CTO, CIO");

      fireEvent.change(input, { target: { value: "CFO" } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("chip-save-jobTitles"));
      });

      expect(onEditField).toHaveBeenCalledWith("jobTitles", "CFO");
      expect(screen.queryByTestId("chip-editor-jobTitles")).not.toBeInTheDocument();
    });

    it("erro devolvido aparece inline e o editor continua aberto", async () => {
      onEditField.mockResolvedValue({ ok: false, error: "A localizacao nao pode ficar vazia." });
      render(
        <AgentConfirmationCard variant="briefing" briefing={BRIEFING} onAction={onAction} onEditField={onEditField} />
      );

      fireEvent.click(screen.getByTestId("briefing-chip-location"));
      fireEvent.change(screen.getByTestId("chip-input-location"), { target: { value: "" } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("chip-save-location"));
      });

      expect(screen.getByTestId("chip-error-location")).toHaveTextContent("nao pode ficar vazia");
      expect(screen.getByTestId("chip-editor-location")).toBeInTheDocument();
    });

    it("objetivo e urgencia usam select com as opcoes do enum", async () => {
      render(
        <AgentConfirmationCard variant="briefing" briefing={BRIEFING} onAction={onAction} onEditField={onEditField} />
      );

      fireEvent.click(screen.getByTestId("briefing-chip-urgency"));
      const select = screen.getByTestId("chip-input-urgency") as HTMLSelectElement;
      expect(select.tagName).toBe("SELECT");
      expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "LOW", "MEDIUM", "HIGH"]);

      fireEvent.change(select, { target: { value: "HIGH" } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("chip-save-urgency"));
      });
      expect(onEditField).toHaveBeenCalledWith("urgency", "HIGH");
    });

    it("cancelar fecha o editor sem salvar", () => {
      render(
        <AgentConfirmationCard variant="briefing" briefing={BRIEFING} onAction={onAction} onEditField={onEditField} />
      );
      fireEvent.click(screen.getByTestId("briefing-chip-location"));
      fireEvent.click(screen.getByTestId("chip-cancel-location"));
      expect(screen.queryByTestId("chip-editor-location")).not.toBeInTheDocument();
      expect(onEditField).not.toHaveBeenCalled();
    });

    it("disabled desabilita botoes e chips", () => {
      render(
        <AgentConfirmationCard
          variant="briefing"
          briefing={BRIEFING}
          disabled
          onAction={onAction}
          onEditField={onEditField}
        />
      );
      expect(screen.getByTestId("card-action-confirm_briefing")).toBeDisabled();
      expect(screen.getByTestId("card-action-adjust_briefing")).toBeDisabled();
      expect(screen.getByTestId("briefing-chip-location")).toBeDisabled();
    });
  });

  describe("variante produto", () => {
    it("mostra os dados e os botoes Confirmar/Refazer cadastro/Seguir sem produto", () => {
      render(<AgentConfirmationCard variant="product" product={PRODUCT} onAction={onAction} />);

      const card = screen.getByTestId("agent-confirmation-card-product");
      expect(card).toHaveTextContent("Radar");
      expect(card).toHaveTextContent("Monitora custos de nuvem");
      expect(card).toHaveTextContent("nao informado");

      fireEvent.click(screen.getByTestId("card-action-confirm_product"));
      fireEvent.click(screen.getByTestId("card-action-redo_product"));
      fireEvent.click(screen.getByTestId("card-action-skip_product"));
      expect(onAction.mock.calls.map((c) => c[0])).toEqual([
        "confirm_product",
        "redo_product",
        "skip_product",
      ]);
      expect(screen.getByTestId("card-action-redo_product")).toHaveTextContent("Refazer cadastro");
      expect(screen.getByTestId("card-action-skip_product")).toHaveTextContent("Seguir sem produto");
    });
  });

  describe("variante leads", () => {
    it("mostra a contagem e os botoes Confirmar leads/Colar outra lista", () => {
      render(<AgentConfirmationCard variant="leads" leadCount={12} onAction={onAction} disabled={false} />);

      expect(screen.getByTestId("agent-confirmation-card-leads")).toHaveTextContent("12 leads");
      fireEvent.click(screen.getByTestId("card-action-confirm_leads"));
      fireEvent.click(screen.getByTestId("card-action-redo_leads"));
      expect(onAction.mock.calls.map((c) => c[0])).toEqual(["confirm_leads", "redo_leads"]);
    });

    it("disabled desabilita os botoes", () => {
      render(<AgentConfirmationCard variant="leads" leadCount={1} onAction={onAction} disabled />);
      expect(screen.getByTestId("card-action-confirm_leads")).toBeDisabled();
      expect(screen.getByTestId("card-action-redo_leads")).toBeDisabled();
    });
  });
});
