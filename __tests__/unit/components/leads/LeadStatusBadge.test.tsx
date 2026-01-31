/**
 * LeadStatusBadge Component Tests
 * Story: 3.5 - Lead Table Display
 * Story 4.2: Lead Status Management
 *
 * AC: #1 - Status column with appropriate styling
 * Story 4.2 AC: #1 - View status badge with correct colors
 * Story 4.2 AC: #5 - Status colors per type
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";
import { LeadStatus } from "@/types/lead";

describe("LeadStatusBadge", () => {
  describe("Rendering", () => {
    it('renders "Novo" label for novo status', () => {
      render(<LeadStatusBadge status="novo" />);
      expect(screen.getByText("Novo")).toBeInTheDocument();
    });

    it('renders "Em Campanha" label for em_campanha status', () => {
      render(<LeadStatusBadge status="em_campanha" />);
      expect(screen.getByText("Em Campanha")).toBeInTheDocument();
    });

    it('renders "Interessado" label for interessado status', () => {
      render(<LeadStatusBadge status="interessado" />);
      expect(screen.getByText("Interessado")).toBeInTheDocument();
    });

    it('renders "Oportunidade" label for oportunidade status', () => {
      render(<LeadStatusBadge status="oportunidade" />);
      expect(screen.getByText("Oportunidade")).toBeInTheDocument();
    });

    it('renders "Não Interessado" label for nao_interessado status', () => {
      render(<LeadStatusBadge status="nao_interessado" />);
      expect(screen.getByText("Não Interessado")).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("applies green styling for interessado status", () => {
      render(<LeadStatusBadge status="interessado" />);
      const badge = screen.getByText("Interessado");
      expect(badge).toHaveClass("bg-green-500/20");
      expect(badge).toHaveClass("text-green-600");
    });

    it("applies yellow/warning styling for oportunidade status", () => {
      render(<LeadStatusBadge status="oportunidade" />);
      const badge = screen.getByText("Oportunidade");
      // Story 4.2 AC#5: Oportunidade uses yellow/warning color
      expect(badge).toHaveClass("bg-yellow-500/20");
      expect(badge).toHaveClass("text-yellow-600");
    });

    it("accepts custom className", () => {
      render(<LeadStatusBadge status="novo" className="custom-class" />);
      const badge = screen.getByText("Novo");
      expect(badge).toHaveClass("custom-class");
    });
  });

  describe("All statuses render correctly", () => {
    const statuses: LeadStatus[] = [
      "novo",
      "em_campanha",
      "interessado",
      "oportunidade",
      "nao_interessado",
    ];

    statuses.forEach((status) => {
      it(`renders badge for status: ${status}`, () => {
        const { container } = render(<LeadStatusBadge status={status} />);
        const badge = container.querySelector('[data-slot="badge"]');
        expect(badge).toBeInTheDocument();
      });
    });
  });

  // Story 4.2: New tests for enhanced functionality
  describe("Story 4.2: Undefined/null status handling", () => {
    it("defaults to 'Novo' when status is undefined", () => {
      render(<LeadStatusBadge status={undefined} />);
      expect(screen.getByText("Novo")).toBeInTheDocument();
    });

    it("defaults to 'Novo' when status is null", () => {
      render(<LeadStatusBadge status={null} />);
      expect(screen.getByText("Novo")).toBeInTheDocument();
    });
  });

  describe("Story 4.2: Interactive mode", () => {
    it("has cursor-pointer class when interactive is true", () => {
      const { container } = render(
        <LeadStatusBadge status="novo" interactive />
      );
      const badge = container.querySelector('[data-slot="badge"]');
      expect(badge).toHaveClass("cursor-pointer");
    });

    it("does not have cursor-pointer class by default", () => {
      const { container } = render(<LeadStatusBadge status="novo" />);
      const badge = container.querySelector('[data-slot="badge"]');
      expect(badge).not.toHaveClass("cursor-pointer");
    });
  });

  describe("Story 4.2: Click handler", () => {
    it("calls onClick when badge is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<LeadStatusBadge status="novo" onClick={handleClick} interactive />);

      await user.click(screen.getByText("Novo"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Story 4.2 AC#5: Status colors", () => {
    it("applies gray/default styling for 'novo' status", () => {
      const { container } = render(<LeadStatusBadge status="novo" />);
      const badge = container.querySelector('[data-slot="badge"]');
      expect(badge).toHaveClass("bg-muted");
    });

    it("applies blue/secondary styling for 'em_campanha' status", () => {
      const { container } = render(<LeadStatusBadge status="em_campanha" />);
      const badge = container.querySelector('[data-slot="badge"]');
      expect(badge).toHaveClass("bg-primary/20");
    });

    it("applies yellow/warning styling for 'oportunidade' status", () => {
      const { container } = render(<LeadStatusBadge status="oportunidade" />);
      const badge = container.querySelector('[data-slot="badge"]');
      expect(badge).toHaveClass("bg-yellow-500/20");
    });

    it("applies red/destructive styling for 'nao_interessado' status", () => {
      const { container } = render(<LeadStatusBadge status="nao_interessado" />);
      const badge = container.querySelector('[data-slot="badge"]');
      expect(badge).toHaveClass("bg-destructive/20");
    });
  });
});
