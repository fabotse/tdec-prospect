/**
 * Campaign Templates Integration Tests
 * Story 6.13: Smart Campaign Templates
 *
 * AC #1-#7 - Full template flow integration tests
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TemplateCard } from "@/components/campaigns/TemplateCard";
import { TemplatePreview } from "@/components/campaigns/TemplatePreview";
import type { CampaignTemplate } from "@/types/campaign-template";
import type { Product } from "@/types/product";

// Mock templates data matching database seed
const mockTemplates: CampaignTemplate[] = [
  {
    id: "template-1",
    name: "Cold Outreach Classico",
    nameKey: "cold_outreach_classic",
    description: "Sequencia completa de 5 emails para primeiro contato com leads frios. Inclui introducao, beneficios, prova social, superacao de objecoes e call-to-action final.",
    structureJson: {
      emails: [
        { position: 1, context: "Introducao e proposta de valor", emailMode: "initial" },
        { position: 2, context: "Aprofundamento em beneficios", emailMode: "follow-up" },
        { position: 3, context: "Prova social e case de sucesso", emailMode: "follow-up" },
        { position: 4, context: "Superacao de objecoes", emailMode: "follow-up" },
        { position: 5, context: "Urgencia e call-to-action final", emailMode: "follow-up" },
      ],
      delays: [
        { afterEmail: 1, days: 3 },
        { afterEmail: 2, days: 3 },
        { afterEmail: 3, days: 4 },
        { afterEmail: 4, days: 4 },
      ],
    },
    useCase: "Primeiro contato com leads frios",
    emailCount: 5,
    totalDays: 14,
    isActive: true,
    displayOrder: 1,
    createdAt: "2026-02-03T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
  },
  {
    id: "template-2",
    name: "Reengajamento Rapido",
    nameKey: "quick_reengagement",
    description: "Sequencia curta de 3 emails para reativar leads que nao responderam anteriormente.",
    structureJson: {
      emails: [
        { position: 1, context: "Retomada do contato anterior", emailMode: "initial" },
        { position: 2, context: "Apresentacao de novo valor", emailMode: "follow-up" },
        { position: 3, context: "Ultima chance com oferta especial", emailMode: "follow-up" },
      ],
      delays: [
        { afterEmail: 1, days: 3 },
        { afterEmail: 2, days: 4 },
      ],
    },
    useCase: "Leads que nao responderam antes",
    emailCount: 3,
    totalDays: 7,
    isActive: true,
    displayOrder: 2,
    createdAt: "2026-02-03T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
  },
];

const mockProduct: Product = {
  id: "product-1",
  tenantId: "tenant-1",
  name: "CRM Pro",
  description: "Software de CRM completo para gestao de relacionamento com clientes",
  features: "Automacao de vendas, Pipeline visual, Relatorios",
  differentials: "Integracao com mais de 100 ferramentas",
  targetAudience: "PMEs em crescimento",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("Campaign Templates Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Template Selection Flow (AC #1)", () => {
    it("displays template cards with all required information", () => {
      render(
        <TemplateCard
          template={mockTemplates[0]}
          isSelected={false}
          onSelect={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      // AC #1: name, description, email count, duration, use case
      expect(screen.getByText("Cold Outreach Classico")).toBeInTheDocument();
      expect(screen.getByText(/Sequencia completa de 5 emails/)).toBeInTheDocument();
      expect(screen.getByTestId("template-email-count")).toHaveTextContent("5 emails");
      expect(screen.getByTestId("template-duration")).toHaveTextContent("14 dias");
      expect(screen.getByTestId("template-use-case")).toHaveTextContent(
        "Primeiro contato com leads frios"
      );
    });

    it("shows visual selection state when template is selected", () => {
      const { rerender } = render(
        <TemplateCard
          template={mockTemplates[0]}
          isSelected={false}
          onSelect={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      // Initially not selected
      expect(screen.queryByTestId("template-selected-icon")).not.toBeInTheDocument();

      // After selection
      rerender(
        <TemplateCard
          template={mockTemplates[0]}
          isSelected={true}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByTestId("template-selected-icon")).toBeInTheDocument();
    });
  });

  describe("Template Preview Flow (AC #3)", () => {
    it("displays complete email sequence structure", () => {
      render(
        <TemplatePreview
          template={mockTemplates[0]}
          selectedProduct={null}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      // Should show all 5 emails
      expect(screen.getByTestId("template-email-1")).toBeInTheDocument();
      expect(screen.getByTestId("template-email-2")).toBeInTheDocument();
      expect(screen.getByTestId("template-email-3")).toBeInTheDocument();
      expect(screen.getByTestId("template-email-4")).toBeInTheDocument();
      expect(screen.getByTestId("template-email-5")).toBeInTheDocument();
    });

    it("displays strategic context for each email", () => {
      render(
        <TemplatePreview
          template={mockTemplates[0]}
          selectedProduct={null}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText("Introducao e proposta de valor")).toBeInTheDocument();
      expect(screen.getByText("Aprofundamento em beneficios")).toBeInTheDocument();
      expect(screen.getByText("Prova social e case de sucesso")).toBeInTheDocument();
      expect(screen.getByText("Superacao de objecoes")).toBeInTheDocument();
      expect(screen.getByText("Urgencia e call-to-action final")).toBeInTheDocument();
    });

    it("displays email mode (initial vs follow-up) for each email", () => {
      render(
        <TemplatePreview
          template={mockTemplates[0]}
          selectedProduct={null}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      // First email is initial, others are follow-up
      expect(screen.getByText("Inicial")).toBeInTheDocument();
      expect(screen.getAllByText("Follow-up")).toHaveLength(4);
    });

    it("displays delay information between emails", () => {
      render(
        <TemplatePreview
          template={mockTemplates[0]}
          selectedProduct={null}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      // Template has 4 delays: 3, 3, 4, 4 days
      expect(screen.getByTestId("template-delay-1")).toBeInTheDocument();
      expect(screen.getByTestId("template-delay-2")).toBeInTheDocument();
      expect(screen.getByTestId("template-delay-3")).toBeInTheDocument();
      expect(screen.getByTestId("template-delay-4")).toBeInTheDocument();
    });

    it("shows product context when product is selected", () => {
      render(
        <TemplatePreview
          template={mockTemplates[0]}
          selectedProduct={mockProduct}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("template-preview-product")).toBeInTheDocument();
      expect(screen.getByText("CRM Pro")).toBeInTheDocument();
    });
  });

  describe("Template Application Flow (AC #4)", () => {
    it("calls onApply when 'Usar Este Template' is clicked", async () => {
      const user = userEvent.setup();
      const onApply = vi.fn();

      render(
        <TemplatePreview
          template={mockTemplates[0]}
          selectedProduct={null}
          onApply={onApply}
          onBack={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("template-preview-apply"));

      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("calls onBack when back button is clicked", async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();

      render(
        <TemplatePreview
          template={mockTemplates[0]}
          selectedProduct={null}
          onApply={vi.fn()}
          onBack={onBack}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("template-preview-back"));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("Template Card Interaction (AC #1, #2)", () => {
    it("triggers selection on click", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <TemplateCard
          template={mockTemplates[0]}
          isSelected={false}
          onSelect={onSelect}
        />,
        { wrapper: createWrapper() }
      );

      await user.click(screen.getByTestId("template-card-cold_outreach_classic"));

      expect(onSelect).toHaveBeenCalledWith(mockTemplates[0]);
    });

    it("triggers selection on keyboard Enter", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <TemplateCard
          template={mockTemplates[0]}
          isSelected={false}
          onSelect={onSelect}
        />,
        { wrapper: createWrapper() }
      );

      const card = screen.getByTestId("template-card-cold_outreach_classic");
      card.focus();
      await user.keyboard("{Enter}");

      expect(onSelect).toHaveBeenCalledWith(mockTemplates[0]);
    });
  });

  describe("Template Data Structure (AC #6)", () => {
    it("correctly handles template with minimal delays", () => {
      const minimalTemplate: CampaignTemplate = {
        ...mockTemplates[1],
        structureJson: {
          emails: [{ position: 1, context: "Single email", emailMode: "initial" }],
          delays: [],
        },
        emailCount: 1,
        totalDays: 1,
      };

      render(
        <TemplatePreview
          template={minimalTemplate}
          selectedProduct={null}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      // Should render single email without delays
      expect(screen.getByTestId("template-email-1")).toBeInTheDocument();
      expect(screen.queryByTestId("template-delay-1")).not.toBeInTheDocument();
    });

    it("renders multiple templates in sequence", () => {
      const { container } = render(
        <div>
          {mockTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={false}
              onSelect={vi.fn()}
            />
          ))}
        </div>,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId("template-card-cold_outreach_classic")).toBeInTheDocument();
      expect(screen.getByTestId("template-card-quick_reengagement")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("template cards are keyboard navigable", async () => {
      const user = userEvent.setup();
      const onSelect1 = vi.fn();
      const onSelect2 = vi.fn();

      render(
        <div>
          <TemplateCard
            template={mockTemplates[0]}
            isSelected={false}
            onSelect={onSelect1}
          />
          <TemplateCard
            template={mockTemplates[1]}
            isSelected={false}
            onSelect={onSelect2}
          />
        </div>,
        { wrapper: createWrapper() }
      );

      // Tab to first card
      await user.tab();
      expect(screen.getByTestId("template-card-cold_outreach_classic")).toHaveFocus();

      // Tab to second card
      await user.tab();
      expect(screen.getByTestId("template-card-quick_reengagement")).toHaveFocus();

      // Enter to select
      await user.keyboard("{Enter}");
      expect(onSelect2).toHaveBeenCalled();
    });

    it("template cards have appropriate ARIA attributes", () => {
      render(
        <TemplateCard
          template={mockTemplates[0]}
          isSelected={true}
          onSelect={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      const card = screen.getByTestId("template-card-cold_outreach_classic");
      expect(card).toHaveAttribute("role", "button");
      expect(card).toHaveAttribute("aria-pressed", "true");
      expect(card).toHaveAttribute("tabindex", "0");
    });
  });
});
