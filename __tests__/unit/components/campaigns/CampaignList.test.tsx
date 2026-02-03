/**
 * CampaignList Component Tests
 * Story 5.1: Campaigns Page & Data Model
 *
 * AC: #1 - Display grid of campaign cards
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CampaignList } from "@/components/campaigns/CampaignList";
import type { CampaignWithCount } from "@/types/campaign";

describe("CampaignList", () => {
  const mockCampaigns: CampaignWithCount[] = [
    {
      id: "campaign-1",
      tenantId: "tenant-1",
      name: "Q1 Outreach",
      status: "active",
      productId: null,
      createdAt: "2026-02-01T10:00:00Z",
      updatedAt: "2026-02-01T10:00:00Z",
      leadCount: 25,
    },
    {
      id: "campaign-2",
      tenantId: "tenant-1",
      name: "Welcome Series",
      status: "draft",
      productId: null,
      createdAt: "2026-01-30T10:00:00Z",
      updatedAt: "2026-01-30T10:00:00Z",
      leadCount: 0,
    },
    {
      id: "campaign-3",
      tenantId: "tenant-1",
      name: "Re-engagement",
      status: "paused",
      productId: null,
      createdAt: "2026-01-28T10:00:00Z",
      updatedAt: "2026-01-29T10:00:00Z",
      leadCount: 150,
    },
  ];

  describe("Rendering (AC: #1)", () => {
    it("renders all campaign cards", () => {
      render(<CampaignList campaigns={mockCampaigns} />);

      expect(screen.getByText("Q1 Outreach")).toBeInTheDocument();
      expect(screen.getByText("Welcome Series")).toBeInTheDocument();
      expect(screen.getByText("Re-engagement")).toBeInTheDocument();
    });

    it("renders correct number of cards", () => {
      render(<CampaignList campaigns={mockCampaigns} />);

      const cards = screen.getAllByText(/leads?$/);
      expect(cards).toHaveLength(3);
    });

    it("renders empty list when no campaigns", () => {
      const { container } = render(<CampaignList campaigns={[]} />);

      // Grid should exist but be empty
      const grid = container.querySelector(".grid");
      expect(grid).toBeInTheDocument();
      expect(grid?.children).toHaveLength(0);
    });

    it("applies responsive grid classes", () => {
      const { container } = render(<CampaignList campaigns={mockCampaigns} />);

      const grid = container.firstChild;
      expect(grid).toHaveClass("grid");
      expect(grid).toHaveClass("sm:grid-cols-2");
      expect(grid).toHaveClass("lg:grid-cols-3");
    });
  });

  describe("Interactions", () => {
    it("calls onCampaignClick with correct campaign when card clicked", () => {
      const handleClick = vi.fn();
      render(
        <CampaignList campaigns={mockCampaigns} onCampaignClick={handleClick} />
      );

      const firstCard = screen
        .getByText("Q1 Outreach")
        .closest("[data-slot='card']");
      if (firstCard) {
        fireEvent.click(firstCard);
      }

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith(mockCampaigns[0]);
    });

    it("calls onCampaignClick with different campaign for each card", () => {
      const handleClick = vi.fn();
      render(
        <CampaignList campaigns={mockCampaigns} onCampaignClick={handleClick} />
      );

      const secondCard = screen
        .getByText("Welcome Series")
        .closest("[data-slot='card']");
      if (secondCard) {
        fireEvent.click(secondCard);
      }

      expect(handleClick).toHaveBeenCalledWith(mockCampaigns[1]);
    });

    it("does not crash when onCampaignClick is not provided", () => {
      render(<CampaignList campaigns={mockCampaigns} />);

      const card = screen.getByText("Q1 Outreach").closest("[data-slot='card']");
      if (card) {
        expect(() => fireEvent.click(card)).not.toThrow();
      }
    });
  });

  describe("Campaign data display", () => {
    it("displays lead counts for all campaigns", () => {
      render(<CampaignList campaigns={mockCampaigns} />);

      expect(screen.getByText("25 leads")).toBeInTheDocument();
      expect(screen.getByText("0 leads")).toBeInTheDocument();
      expect(screen.getByText("150 leads")).toBeInTheDocument();
    });

    it("displays status badges for all campaigns", () => {
      render(<CampaignList campaigns={mockCampaigns} />);

      expect(screen.getByText("Ativa")).toBeInTheDocument();
      expect(screen.getByText("Rascunho")).toBeInTheDocument();
      expect(screen.getByText("Pausada")).toBeInTheDocument();
    });
  });
});
