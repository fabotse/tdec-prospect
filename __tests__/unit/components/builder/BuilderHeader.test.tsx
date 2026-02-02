/**
 * BuilderHeader Component Tests
 * Story 5.2: Campaign Builder Canvas
 *
 * AC: #4 - Header do Builder
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BuilderHeader } from "@/components/builder/BuilderHeader";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock useBuilderStore
const mockUseBuilderStore = vi.fn();
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector: (state: unknown) => unknown) =>
    mockUseBuilderStore(selector),
}));

describe("BuilderHeader (AC: #4)", () => {
  const defaultProps = {
    campaignName: "Q1 Prospeccao",
    campaignStatus: "draft" as const,
    onNameChange: vi.fn(),
    onSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBuilderStore.mockImplementation((selector) => {
      const state = { hasChanges: false };
      return selector(state);
    });
  });

  describe("Rendering (AC: #4)", () => {
    it("displays campaign name", () => {
      render(<BuilderHeader {...defaultProps} />);

      expect(screen.getByTestId("campaign-name")).toHaveTextContent("Q1 Prospeccao");
    });

    it("displays status badge", () => {
      render(<BuilderHeader {...defaultProps} />);

      expect(screen.getByTestId("campaign-status-badge")).toHaveTextContent("Rascunho");
    });

    it("displays save button", () => {
      render(<BuilderHeader {...defaultProps} />);

      expect(screen.getByTestId("save-button")).toBeInTheDocument();
      expect(screen.getByTestId("save-button")).toHaveTextContent("Salvar");
    });

    it("displays back link to campaigns", () => {
      render(<BuilderHeader {...defaultProps} />);

      const backLink = screen.getByTestId("back-to-campaigns");
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute("href", "/campaigns");
    });

    it("has correct test id for header", () => {
      render(<BuilderHeader {...defaultProps} />);

      expect(screen.getByTestId("builder-header")).toBeInTheDocument();
    });
  });

  describe("Save Button State", () => {
    it("disables save button when no changes", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = { hasChanges: false };
        return selector(state);
      });

      render(<BuilderHeader {...defaultProps} />);

      expect(screen.getByTestId("save-button")).toBeDisabled();
    });

    it("enables save button when there are changes", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = { hasChanges: true };
        return selector(state);
      });

      render(<BuilderHeader {...defaultProps} />);

      expect(screen.getByTestId("save-button")).not.toBeDisabled();
    });

    it("disables save button while saving", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = { hasChanges: true };
        return selector(state);
      });

      render(<BuilderHeader {...defaultProps} isSaving={true} />);

      expect(screen.getByTestId("save-button")).toBeDisabled();
      expect(screen.getByTestId("save-button")).toHaveTextContent("Salvando...");
    });

    it("calls onSave when save button is clicked", () => {
      mockUseBuilderStore.mockImplementation((selector) => {
        const state = { hasChanges: true };
        return selector(state);
      });

      render(<BuilderHeader {...defaultProps} />);

      fireEvent.click(screen.getByTestId("save-button"));
      expect(defaultProps.onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe("Editable Name (AC: #4)", () => {
    it("shows input when campaign name is clicked", () => {
      render(<BuilderHeader {...defaultProps} />);

      fireEvent.click(screen.getByTestId("campaign-name"));

      expect(screen.getByTestId("campaign-name-input")).toBeInTheDocument();
    });

    it("input is pre-filled with campaign name", () => {
      render(<BuilderHeader {...defaultProps} />);

      fireEvent.click(screen.getByTestId("campaign-name"));

      expect(screen.getByTestId("campaign-name-input")).toHaveValue("Q1 Prospeccao");
    });

    it("calls onNameChange when name is changed and Enter is pressed", () => {
      render(<BuilderHeader {...defaultProps} />);

      fireEvent.click(screen.getByTestId("campaign-name"));
      const input = screen.getByTestId("campaign-name-input");

      fireEvent.change(input, { target: { value: "Novo Nome" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(defaultProps.onNameChange).toHaveBeenCalledWith("Novo Nome");
    });

    it("reverts changes when Escape is pressed", () => {
      render(<BuilderHeader {...defaultProps} />);

      fireEvent.click(screen.getByTestId("campaign-name"));
      const input = screen.getByTestId("campaign-name-input");

      fireEvent.change(input, { target: { value: "Novo Nome" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(defaultProps.onNameChange).not.toHaveBeenCalled();
      expect(screen.getByTestId("campaign-name")).toHaveTextContent("Q1 Prospeccao");
    });
  });

  describe("Status Badge Variants", () => {
    it("shows correct badge for draft status", () => {
      render(<BuilderHeader {...defaultProps} campaignStatus="draft" />);

      expect(screen.getByTestId("campaign-status-badge")).toHaveTextContent("Rascunho");
    });

    it("shows correct badge for active status", () => {
      render(<BuilderHeader {...defaultProps} campaignStatus="active" />);

      expect(screen.getByTestId("campaign-status-badge")).toHaveTextContent("Ativa");
    });

    it("shows correct badge for paused status", () => {
      render(<BuilderHeader {...defaultProps} campaignStatus="paused" />);

      expect(screen.getByTestId("campaign-status-badge")).toHaveTextContent("Pausada");
    });

    it("shows correct badge for completed status", () => {
      render(<BuilderHeader {...defaultProps} campaignStatus="completed" />);

      expect(screen.getByTestId("campaign-status-badge")).toHaveTextContent("Concluida");
    });
  });
});
