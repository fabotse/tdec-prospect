/**
 * Tests for DeleteLeadsDialog Component
 * Story 12.5: Deleção de Leads (Individual e em Massa)
 *
 * AC: #3 - Dialog de confirmação antes de executar
 * AC: #4 - Dialog mostra contagem de leads a deletar
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteLeadsDialog } from "@/components/leads/DeleteLeadsDialog";

describe("DeleteLeadsDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    leadCount: 5,
    onConfirm: vi.fn().mockResolvedValue(undefined),
    isDeleting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC #3: Dialog de confirmação
  it("should render confirmation dialog when open", () => {
    render(<DeleteLeadsDialog {...defaultProps} />);

    expect(screen.getByText("Excluir Leads")).toBeInTheDocument();
    expect(screen.getByText("Cancelar")).toBeInTheDocument();
    expect(screen.getByText("Excluir")).toBeInTheDocument();
  });

  // AC #4: Dialog mostra contagem plural
  it("should display lead count in description (plural)", () => {
    render(<DeleteLeadsDialog {...defaultProps} leadCount={5} />);

    expect(
      screen.getByText(/Tem certeza que deseja excluir 5 leads\?/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Esta ação não pode ser desfeita\./)
    ).toBeInTheDocument();
  });

  // AC #4: Dialog mostra contagem singular
  it("should display singular when leadCount is 1", () => {
    render(<DeleteLeadsDialog {...defaultProps} leadCount={1} />);

    expect(
      screen.getByText(/Tem certeza que deseja excluir 1 lead\?/)
    ).toBeInTheDocument();
  });

  // AC #3: Cancelar fecha dialog
  it("should call onOpenChange when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<DeleteLeadsDialog {...defaultProps} />);

    await user.click(screen.getByText("Cancelar"));

    expect(defaultProps.onOpenChange).toHaveBeenCalled();
  });

  // AC #3: Confirmar chama onConfirm
  it("should call onConfirm when excluir is clicked", async () => {
    const user = userEvent.setup();
    render(<DeleteLeadsDialog {...defaultProps} />);

    await user.click(screen.getByText("Excluir"));

    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  // Loading state: spinner no botão
  it("should show loading spinner when isDeleting is true", () => {
    render(<DeleteLeadsDialog {...defaultProps} isDeleting={true} />);

    expect(screen.getByText("Excluindo...")).toBeInTheDocument();
    expect(screen.queryByText("Excluir")).not.toBeInTheDocument();
  });

  // Loading state: botões disabled
  it("should disable both buttons when isDeleting is true", () => {
    render(<DeleteLeadsDialog {...defaultProps} isDeleting={true} />);

    expect(screen.getByText("Cancelar")).toBeDisabled();
    expect(screen.getByText("Excluindo...").closest("button")).toBeDisabled();
  });

  // Not rendered when closed
  it("should not render content when open is false", () => {
    render(<DeleteLeadsDialog {...defaultProps} open={false} />);

    expect(screen.queryByText("Excluir Leads")).not.toBeInTheDocument();
  });
});
