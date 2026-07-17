/**
 * SequenceActionDialogs Tests
 * Story 21.9: Controle Manual de Sequência por Lead (AC #5/#6)
 *
 * StopSequenceDialog — confirmação com radio de motivos (compartilhado entre
 * LeadTrackingTable e OpportunityCard). RemoveLeadDialog — dialog destrutivo
 * com aviso explícito (padrão DeleteLeadsDialog).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  StopSequenceDialog,
  RemoveLeadDialog,
} from "@/components/tracking/SequenceActionDialogs";

describe("StopSequenceDialog", () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    leadLabel: "lead@example.com",
    reason: "responded_other_channel" as const,
    onReasonChange: vi.fn(),
    onConfirm: vi.fn(),
    isPending: false,
  };

  it("renderiza título, lead e os 2 motivos", () => {
    render(<StopSequenceDialog {...baseProps} />);

    // Título e botão de confirmação compartilham o texto — mira o heading.
    expect(
      screen.getByRole("heading", { name: "Parar sequência" })
    ).toBeInTheDocument();
    expect(screen.getByText(/lead@example\.com/)).toBeInTheDocument();
    expect(screen.getByText("Respondeu por outro canal")).toBeInTheDocument();
    expect(screen.getByText("Não contactar mais")).toBeInTheDocument();
  });

  it("emite onReasonChange ao trocar o motivo", async () => {
    const user = userEvent.setup();
    const onReasonChange = vi.fn();
    render(<StopSequenceDialog {...baseProps} onReasonChange={onReasonChange} />);

    await user.click(screen.getByLabelText("Não contactar mais"));

    expect(onReasonChange).toHaveBeenCalledWith("do_not_contact");
  });

  it("confirma → onConfirm chamado", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<StopSequenceDialog {...baseProps} onConfirm={onConfirm} />);

    await user.click(screen.getByTestId("confirm-stop-sequence"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("pendente: botões desabilitados e label de progresso", () => {
    render(<StopSequenceDialog {...baseProps} isPending={true} />);

    expect(screen.getByTestId("confirm-stop-sequence")).toBeDisabled();
    expect(screen.getByText("Cancelar")).toBeDisabled();
    expect(screen.getByText("Parando...")).toBeInTheDocument();
  });

  it("não renderiza nada quando open=false", () => {
    render(<StopSequenceDialog {...baseProps} open={false} />);

    expect(screen.queryByText("Parar sequência")).not.toBeInTheDocument();
  });
});

describe("RemoveLeadDialog", () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    leadLabel: "lead@example.com",
    onConfirm: vi.fn(),
    isPending: false,
  };

  it("renderiza o aviso destrutivo explícito (AC#3)", () => {
    render(<RemoveLeadDialog {...baseProps} />);

    expect(screen.getByText("Remover do Instantly")).toBeInTheDocument();
    const description = screen.getByText(/não pode ser desfeita/);
    expect(description).toBeInTheDocument();
    expect(description.textContent).toContain("histórico");
    expect(description.textContent).toContain("Instantly");
  });

  it("confirma → onConfirm chamado", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RemoveLeadDialog {...baseProps} onConfirm={onConfirm} />);

    await user.click(screen.getByTestId("confirm-remove-lead"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("pendente: botões desabilitados e label de progresso", () => {
    render(<RemoveLeadDialog {...baseProps} isPending={true} />);

    expect(screen.getByTestId("confirm-remove-lead")).toBeDisabled();
    expect(screen.getByText("Cancelar")).toBeDisabled();
    expect(screen.getByText("Removendo...")).toBeInTheDocument();
  });
});
