/**
 * TemplatePreview Component Tests
 * Story 6.13: Smart Campaign Templates
 *
 * AC #3 - Template Preview: Shows structure, strategic rationale, apply button
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TemplatePreview } from "@/components/campaigns/TemplatePreview";
import type { CampaignTemplate } from "@/types/campaign-template";
import type { Product } from "@/types/product";

const mockTemplate: CampaignTemplate = {
  id: "template-1",
  name: "Cold Outreach Classico",
  nameKey: "cold_outreach_classic",
  description: "Sequencia completa de 5 emails para primeiro contato com leads frios.",
  structureJson: {
    emails: [
      { position: 1, context: "Introducao e proposta de valor", emailMode: "initial" },
      { position: 2, context: "Aprofundamento em beneficios", emailMode: "follow-up" },
      { position: 3, context: "Prova social e case de sucesso", emailMode: "follow-up" },
    ],
    delays: [
      { afterEmail: 1, days: 3 },
      { afterEmail: 2, days: 4 },
    ],
  },
  useCase: "Primeiro contato com leads frios",
  emailCount: 3,
  totalDays: 7,
  isActive: true,
  displayOrder: 1,
  createdAt: "2026-02-03T00:00:00Z",
  updatedAt: "2026-02-03T00:00:00Z",
};

const mockProduct: Product = {
  id: "product-1",
  tenantId: "tenant-1",
  name: "CRM Pro",
  description: "Software de CRM completo",
  features: null,
  differentials: null,
  targetAudience: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("TemplatePreview", () => {
  const defaultProps = {
    template: mockTemplate,
    selectedProduct: null,
    onApply: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Display (AC #3)", () => {
    it("renders the template preview", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId("template-preview")).toBeInTheDocument();
    });

    it("displays template name", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId("template-preview-name")).toHaveTextContent(
        "Cold Outreach Classico"
      );
    });

    it("displays template description", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText(/Sequencia completa de 5 emails/)).toBeInTheDocument();
    });

    it("displays email count", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText("3 emails")).toBeInTheDocument();
    });

    it("displays duration", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText("7 dias")).toBeInTheDocument();
    });

    it("displays use case badge", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText("Primeiro contato com leads frios")).toBeInTheDocument();
    });
  });

  describe("Structure Visualization (AC #3)", () => {
    it("displays all emails in the structure", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId("template-email-1")).toBeInTheDocument();
      expect(screen.getByTestId("template-email-2")).toBeInTheDocument();
      expect(screen.getByTestId("template-email-3")).toBeInTheDocument();
    });

    it("displays email context for each email", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText("Introducao e proposta de valor")).toBeInTheDocument();
      expect(screen.getByText("Aprofundamento em beneficios")).toBeInTheDocument();
      expect(screen.getByText("Prova social e case de sucesso")).toBeInTheDocument();
    });

    it("displays email mode badges", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText("Inicial")).toBeInTheDocument();
      expect(screen.getAllByText("Follow-up")).toHaveLength(2);
    });

    it("displays delay indicators", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId("template-delay-1")).toBeInTheDocument();
      expect(screen.getByTestId("template-delay-2")).toBeInTheDocument();
    });

    it("displays delay durations", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByText("Aguardar 3 dias")).toBeInTheDocument();
      expect(screen.getByText("Aguardar 4 dias")).toBeInTheDocument();
    });
  });

  describe("Product Context (AC #3)", () => {
    it("does not show product indicator when no product selected", () => {
      render(<TemplatePreview {...defaultProps} selectedProduct={null} />);

      expect(screen.queryByTestId("template-preview-product")).not.toBeInTheDocument();
    });

    it("shows product indicator when product is selected", () => {
      render(<TemplatePreview {...defaultProps} selectedProduct={mockProduct} />);

      expect(screen.getByTestId("template-preview-product")).toBeInTheDocument();
      expect(screen.getByText("CRM Pro")).toBeInTheDocument();
    });
  });

  describe("Buttons (AC #3)", () => {
    it("renders apply button", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId("template-preview-apply")).toBeInTheDocument();
      expect(screen.getByTestId("template-preview-apply")).toHaveTextContent(
        "Usar Este Template"
      );
    });

    it("renders back button (ghost)", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId("template-preview-back")).toBeInTheDocument();
      expect(screen.getByTestId("template-preview-back")).toHaveTextContent(
        "Voltar aos templates"
      );
    });

    it("renders back button (footer)", () => {
      render(<TemplatePreview {...defaultProps} />);

      expect(screen.getByTestId("template-preview-back-button")).toBeInTheDocument();
      expect(screen.getByTestId("template-preview-back-button")).toHaveTextContent("Voltar");
    });

    it("calls onApply when apply button is clicked", async () => {
      const user = userEvent.setup();
      render(<TemplatePreview {...defaultProps} />);

      await user.click(screen.getByTestId("template-preview-apply"));

      expect(defaultProps.onApply).toHaveBeenCalledTimes(1);
    });

    it("calls onBack when back button (ghost) is clicked", async () => {
      const user = userEvent.setup();
      render(<TemplatePreview {...defaultProps} />);

      await user.click(screen.getByTestId("template-preview-back"));

      expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
    });

    it("calls onBack when back button (footer) is clicked", async () => {
      const user = userEvent.setup();
      render(<TemplatePreview {...defaultProps} />);

      await user.click(screen.getByTestId("template-preview-back-button"));

      expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
    });
  });
});
