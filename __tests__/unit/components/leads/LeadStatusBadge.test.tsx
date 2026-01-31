/**
 * LeadStatusBadge Component Tests
 * Story: 3.5 - Lead Table Display
 * AC: #1 - Status column with appropriate styling
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

    it("applies primary styling for oportunidade status", () => {
      render(<LeadStatusBadge status="oportunidade" />);
      const badge = screen.getByText("Oportunidade");
      expect(badge).toHaveClass("bg-primary/20");
      expect(badge).toHaveClass("text-primary");
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
});
