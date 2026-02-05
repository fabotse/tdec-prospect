/**
 * CampaignCard Component Tests
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Display campaign name, status, lead count, date
 * AC: #5 - Show lead count
 * AC: #6 - Status badge with colors
 *
 * Delete Campaign:
 * - Menu with "Remover" option
 * - Calls onDelete callback with campaign
 */

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

// Story 8.4: Mock framer-motion for GlassCard wrapper
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, "data-testid": testId, ...props }: Record<string, unknown>) => (
      <div className={className as string} data-testid={testId as string}>
        {children as React.ReactNode}
      </div>
    ),
  },
  useReducedMotion: () => false,
}));

import { CampaignCard } from "@/components/campaigns/CampaignCard";
import type { CampaignWithCount } from "@/types/campaign";

describe("CampaignCard", () => {
  const mockCampaign: CampaignWithCount = {
    id: "campaign-1",
    tenantId: "tenant-1",
    name: "Q1 Outreach Campaign",
    status: "active",
    productId: null,
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-02-01T10:00:00Z",
    leadCount: 25,
  };

  describe("Rendering (AC: #1)", () => {
    it("displays campaign name", () => {
      render(<CampaignCard campaign={mockCampaign} />);

      expect(screen.getByText("Q1 Outreach Campaign")).toBeInTheDocument();
    });

    it("displays lead count", () => {
      render(<CampaignCard campaign={mockCampaign} />);

      expect(screen.getByText("25 leads")).toBeInTheDocument();
    });

    it("displays singular 'lead' for count of 1", () => {
      const singleLeadCampaign = { ...mockCampaign, leadCount: 1 };
      render(<CampaignCard campaign={singleLeadCampaign} />);

      expect(screen.getByText("1 lead")).toBeInTheDocument();
    });

    it("displays '0 leads' for campaigns without leads (AC: #5)", () => {
      const noLeadsCampaign = { ...mockCampaign, leadCount: 0 };
      render(<CampaignCard campaign={noLeadsCampaign} />);

      expect(screen.getByText("0 leads")).toBeInTheDocument();
    });

    it("displays creation date in pt-BR format", () => {
      render(<CampaignCard campaign={mockCampaign} />);

      // Date should be formatted as dd/mm/yyyy
      expect(screen.getByText("01/02/2026")).toBeInTheDocument();
    });
  });

  describe("Status Badge (AC: #6)", () => {
    it("shows 'Ativa' badge for active status", () => {
      render(<CampaignCard campaign={{ ...mockCampaign, status: "active" }} />);

      expect(screen.getByText("Ativa")).toBeInTheDocument();
    });

    it("shows 'Rascunho' badge for draft status", () => {
      render(<CampaignCard campaign={{ ...mockCampaign, status: "draft" }} />);

      expect(screen.getByText("Rascunho")).toBeInTheDocument();
    });

    it("shows 'Pausada' badge for paused status", () => {
      render(<CampaignCard campaign={{ ...mockCampaign, status: "paused" }} />);

      expect(screen.getByText("Pausada")).toBeInTheDocument();
    });

    it("shows 'Concluida' badge for completed status", () => {
      render(
        <CampaignCard campaign={{ ...mockCampaign, status: "completed" }} />
      );

      expect(screen.getByText("Concluida")).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("calls onClick when card is clicked", () => {
      const handleClick = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onClick={handleClick} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      if (card) {
        fireEvent.click(card);
      }

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("has cursor-pointer class when onClick is provided", () => {
      const handleClick = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onClick={handleClick} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      expect(card).toHaveClass("cursor-pointer");
    });
  });

  describe("Long content handling", () => {
    it("truncates long campaign names with line-clamp", () => {
      const longNameCampaign = {
        ...mockCampaign,
        name: "This is a very long campaign name that should be truncated when displayed in the card component",
      };
      render(<CampaignCard campaign={longNameCampaign} />);

      const nameElement = screen.getByText(longNameCampaign.name);
      expect(nameElement).toHaveClass("line-clamp-2");
    });
  });

  describe("Keyboard Accessibility", () => {
    it("calls onClick when Enter key is pressed", () => {
      const handleClick = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onClick={handleClick} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      if (card) {
        fireEvent.keyDown(card, { key: "Enter" });
      }

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("calls onClick when Space key is pressed", () => {
      const handleClick = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onClick={handleClick} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      if (card) {
        fireEvent.keyDown(card, { key: " " });
      }

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("has tabIndex=0 when onClick is provided", () => {
      const handleClick = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onClick={handleClick} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      expect(card).toHaveAttribute("tabindex", "0");
    });

    it("does not have tabIndex when onClick is not provided", () => {
      render(<CampaignCard campaign={mockCampaign} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      expect(card).not.toHaveAttribute("tabindex");
    });

    it("has role=button when onClick is provided", () => {
      const handleClick = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onClick={handleClick} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      expect(card).toHaveAttribute("role", "button");
    });

    it("does not call onClick for other keys", () => {
      const handleClick = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onClick={handleClick} />);

      const card = screen.getByText("Q1 Outreach Campaign").closest("[data-slot='card']");
      if (card) {
        fireEvent.keyDown(card, { key: "Tab" });
        fireEvent.keyDown(card, { key: "Escape" });
        fireEvent.keyDown(card, { key: "a" });
      }

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("Delete Menu", () => {
    it("does not render menu when onDelete is not provided", () => {
      render(<CampaignCard campaign={mockCampaign} />);

      expect(screen.queryByTestId("campaign-menu-trigger")).not.toBeInTheDocument();
    });

    it("renders menu trigger when onDelete is provided", () => {
      const handleDelete = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onDelete={handleDelete} />);

      expect(screen.getByTestId("campaign-menu-trigger")).toBeInTheDocument();
    });

    it("opens menu when clicking menu trigger", async () => {
      const user = userEvent.setup();
      const handleDelete = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onDelete={handleDelete} />);

      await user.click(screen.getByTestId("campaign-menu-trigger"));

      expect(screen.getByText("Remover")).toBeInTheDocument();
    });

    it("calls onDelete with campaign when clicking Remover", async () => {
      const user = userEvent.setup();
      const handleDelete = vi.fn();
      render(<CampaignCard campaign={mockCampaign} onDelete={handleDelete} />);

      await user.click(screen.getByTestId("campaign-menu-trigger"));
      await user.click(screen.getByText("Remover"));

      expect(handleDelete).toHaveBeenCalledWith(mockCampaign);
    });

    it("does not call onClick when clicking menu trigger", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleDelete = vi.fn();
      render(
        <CampaignCard
          campaign={mockCampaign}
          onClick={handleClick}
          onDelete={handleDelete}
        />
      );

      await user.click(screen.getByTestId("campaign-menu-trigger"));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("does not call onClick when clicking Remover option", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleDelete = vi.fn();
      render(
        <CampaignCard
          campaign={mockCampaign}
          onClick={handleClick}
          onDelete={handleDelete}
        />
      );

      await user.click(screen.getByTestId("campaign-menu-trigger"));
      await user.click(screen.getByText("Remover"));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });
});
