/**
 * TemplateCard Component Tests
 * Story 6.13: Smart Campaign Templates
 *
 * AC #1 - Template cards display name, description, email count, duration, use case
 * AC #2 - Available templates displayed
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TemplateCard } from "@/components/campaigns/TemplateCard";
import type { CampaignTemplate } from "@/types/campaign-template";

const mockTemplate: CampaignTemplate = {
  id: "template-1",
  name: "Cold Outreach Classico",
  nameKey: "cold_outreach_classic",
  description: "Sequencia completa de 5 emails para primeiro contato com leads frios.",
  structureJson: {
    emails: [
      { position: 1, context: "Introducao", emailMode: "initial" },
      { position: 2, context: "Beneficios", emailMode: "follow-up" },
    ],
    delays: [{ afterEmail: 1, days: 3 }],
  },
  useCase: "Primeiro contato com leads frios",
  emailCount: 5,
  totalDays: 14,
  isActive: true,
  displayOrder: 1,
  createdAt: "2026-02-03T00:00:00Z",
  updatedAt: "2026-02-03T00:00:00Z",
};

describe("TemplateCard", () => {
  const defaultProps = {
    template: mockTemplate,
    isSelected: false,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Display (AC #1, #2)", () => {
    it("renders the template card", () => {
      render(<TemplateCard {...defaultProps} />);

      expect(screen.getByTestId("template-card-cold_outreach_classic")).toBeInTheDocument();
    });

    it("displays template name", () => {
      render(<TemplateCard {...defaultProps} />);

      expect(screen.getByText("Cold Outreach Classico")).toBeInTheDocument();
    });

    it("displays template description", () => {
      render(<TemplateCard {...defaultProps} />);

      expect(screen.getByText(/Sequencia completa de 5 emails/)).toBeInTheDocument();
    });

    it("displays email count", () => {
      render(<TemplateCard {...defaultProps} />);

      expect(screen.getByTestId("template-email-count")).toHaveTextContent("5 emails");
    });

    it("displays singular email count", () => {
      const singleEmailTemplate = { ...mockTemplate, emailCount: 1 };
      render(<TemplateCard {...defaultProps} template={singleEmailTemplate} />);

      expect(screen.getByTestId("template-email-count")).toHaveTextContent("1 email");
    });

    it("displays duration in days", () => {
      render(<TemplateCard {...defaultProps} />);

      expect(screen.getByTestId("template-duration")).toHaveTextContent("14 dias");
    });

    it("displays singular day duration", () => {
      const singleDayTemplate = { ...mockTemplate, totalDays: 1 };
      render(<TemplateCard {...defaultProps} template={singleDayTemplate} />);

      expect(screen.getByTestId("template-duration")).toHaveTextContent("1 dia");
    });

    it("displays use case badge", () => {
      render(<TemplateCard {...defaultProps} />);

      expect(screen.getByTestId("template-use-case")).toHaveTextContent(
        "Primeiro contato com leads frios"
      );
    });
  });

  describe("Selection State", () => {
    it("shows selected icon when isSelected is true", () => {
      render(<TemplateCard {...defaultProps} isSelected />);

      expect(screen.getByTestId("template-selected-icon")).toBeInTheDocument();
    });

    it("does not show selected icon when isSelected is false", () => {
      render(<TemplateCard {...defaultProps} isSelected={false} />);

      expect(screen.queryByTestId("template-selected-icon")).not.toBeInTheDocument();
    });

    it("has aria-pressed true when selected", () => {
      render(<TemplateCard {...defaultProps} isSelected />);

      expect(screen.getByTestId("template-card-cold_outreach_classic")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });

    it("has aria-pressed false when not selected", () => {
      render(<TemplateCard {...defaultProps} isSelected={false} />);

      expect(screen.getByTestId("template-card-cold_outreach_classic")).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    });
  });

  describe("Interaction", () => {
    it("calls onSelect when card is clicked", async () => {
      const user = userEvent.setup();
      render(<TemplateCard {...defaultProps} />);

      await user.click(screen.getByTestId("template-card-cold_outreach_classic"));

      expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSelect).toHaveBeenCalledWith(mockTemplate);
    });

    it("calls onSelect when Enter key is pressed", async () => {
      const user = userEvent.setup();
      render(<TemplateCard {...defaultProps} />);

      const card = screen.getByTestId("template-card-cold_outreach_classic");
      card.focus();
      await user.keyboard("{Enter}");

      expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
    });

    it("calls onSelect when Space key is pressed", async () => {
      const user = userEvent.setup();
      render(<TemplateCard {...defaultProps} />);

      const card = screen.getByTestId("template-card-cold_outreach_classic");
      card.focus();
      await user.keyboard(" ");

      expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("has role button", () => {
      render(<TemplateCard {...defaultProps} />);

      expect(screen.getByTestId("template-card-cold_outreach_classic")).toHaveAttribute(
        "role",
        "button"
      );
    });

    it("has appropriate aria-label", () => {
      render(<TemplateCard {...defaultProps} />);

      const card = screen.getByTestId("template-card-cold_outreach_classic");
      expect(card.getAttribute("aria-label")).toContain("Cold Outreach Classico");
      expect(card.getAttribute("aria-label")).toContain("5 emails");
      expect(card.getAttribute("aria-label")).toContain("14 dias");
    });

    it("is focusable", () => {
      render(<TemplateCard {...defaultProps} />);

      const card = screen.getByTestId("template-card-cold_outreach_classic");
      expect(card).toHaveAttribute("tabindex", "0");
    });
  });
});
