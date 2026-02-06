/**
 * SendingAccountSelector Component Tests
 * Story 7.4: Export Dialog UI com Preview de Variáveis
 *
 * AC #4: Sending account selection for Instantly export
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SendingAccountSelector } from "@/components/builder/SendingAccountSelector";
import type { InstantlyAccountItem } from "@/types/instantly";

// Mock lucide-react icons (includes CheckIcon used by Checkbox component)
vi.mock("lucide-react", () => ({
  Loader2: ({ className }: { className?: string }) => (
    <svg data-testid="loader-icon" className={className} />
  ),
  Mail: ({ className }: { className?: string }) => (
    <svg data-testid="mail-icon" className={className} />
  ),
  CheckIcon: ({ className }: { className?: string }) => (
    <svg data-testid="check-icon" className={className} />
  ),
}));

const mockAccounts: InstantlyAccountItem[] = [
  { email: "joao@empresa.com", first_name: "Joao", last_name: "Silva" },
  { email: "maria@empresa.com", first_name: "Maria", last_name: "Santos" },
  { email: "pedro@empresa.com", first_name: "Pedro" },
];

describe("SendingAccountSelector (Story 7.4)", () => {
  const mockOnSelectionChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Renders list of accounts with checkboxes", () => {
    it("renders all accounts with their emails", () => {
      render(
        <SendingAccountSelector
          accounts={mockAccounts}
          selectedAccounts={[]}
          onSelectionChange={mockOnSelectionChange}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("sending-accounts-list")).toBeInTheDocument();
      expect(screen.getByText("joao@empresa.com")).toBeInTheDocument();
      expect(screen.getByText("maria@empresa.com")).toBeInTheDocument();
      expect(screen.getByText("pedro@empresa.com")).toBeInTheDocument();
      expect(screen.getByText("Contas de envio")).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows loading spinner and text when isLoading is true", () => {
      render(
        <SendingAccountSelector
          accounts={[]}
          selectedAccounts={[]}
          onSelectionChange={mockOnSelectionChange}
          isLoading={true}
        />
      );

      expect(screen.getByTestId("sending-accounts-loading")).toBeInTheDocument();
      expect(screen.getByText("Carregando contas de envio...")).toBeInTheDocument();
      expect(screen.getByTestId("loader-icon")).toBeInTheDocument();
      expect(screen.queryByTestId("sending-accounts-list")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sending-accounts-empty")).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows empty state message when no accounts are available", () => {
      render(
        <SendingAccountSelector
          accounts={[]}
          selectedAccounts={[]}
          onSelectionChange={mockOnSelectionChange}
          isLoading={false}
        />
      );

      expect(screen.getByTestId("sending-accounts-empty")).toBeInTheDocument();
      expect(
        screen.getByText("Nenhuma conta de envio encontrada. Configure no Instantly primeiro.")
      ).toBeInTheDocument();
      expect(screen.queryByTestId("sending-accounts-list")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sending-accounts-loading")).not.toBeInTheDocument();
    });
  });

  describe("Toggle account selection", () => {
    it("adds account to selection when clicking an unselected account", () => {
      render(
        <SendingAccountSelector
          accounts={mockAccounts}
          selectedAccounts={[]}
          onSelectionChange={mockOnSelectionChange}
          isLoading={false}
        />
      );

      // Click the label wrapping the first account
      fireEvent.click(screen.getByText("joao@empresa.com"));

      expect(mockOnSelectionChange).toHaveBeenCalledWith(["joao@empresa.com"]);
    });

    it("removes account from selection when clicking a selected account", () => {
      render(
        <SendingAccountSelector
          accounts={mockAccounts}
          selectedAccounts={["joao@empresa.com", "maria@empresa.com"]}
          onSelectionChange={mockOnSelectionChange}
          isLoading={false}
        />
      );

      // Click the already-selected first account to deselect it
      fireEvent.click(screen.getByText("joao@empresa.com"));

      expect(mockOnSelectionChange).toHaveBeenCalledWith(["maria@empresa.com"]);
    });
  });

  describe("Shows correct accounts selected", () => {
    it("renders checkboxes with correct checked state for selected accounts", () => {
      render(
        <SendingAccountSelector
          accounts={mockAccounts}
          selectedAccounts={["joao@empresa.com", "pedro@empresa.com"]}
          onSelectionChange={mockOnSelectionChange}
          isLoading={false}
        />
      );

      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toHaveLength(3);

      // First account (joao) - selected
      expect(checkboxes[0]).toHaveAttribute("data-state", "checked");
      // Second account (maria) - not selected
      expect(checkboxes[1]).toHaveAttribute("data-state", "unchecked");
      // Third account (pedro) - selected
      expect(checkboxes[2]).toHaveAttribute("data-state", "checked");
    });
  });
});
