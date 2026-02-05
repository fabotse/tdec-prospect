/**
 * CampaignPreviewPanel Tests
 * Story 5.8: Campaign Preview
 *
 * AC #1: Abrir preview da campanha
 * AC #5: Fechar preview e retornar a edicao
 * AC #6: Estado vazio do preview
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, "data-testid": testId, onClick, ...props }: Record<string, unknown>) => (
      <div className={className as string} data-testid={testId as string} onClick={onClick as () => void}>
        {children as React.ReactNode}
      </div>
    ),
    button: ({ children, className, onClick, type, ...props }: Record<string, unknown>) => (
      <button className={className as string} onClick={onClick as () => void} type={type as "button"}>
        {children as React.ReactNode}
      </button>
    ),
    a: ({ children, className, href, ...props }: Record<string, unknown>) => (
      <a className={className as string} href={href as string}>
        {children as React.ReactNode}
      </a>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useSpring: (v: unknown) => v,
  useTransform: () => 0,
  useReducedMotion: () => false,
  useInView: () => true,
}));

import { CampaignPreviewPanel } from "@/components/builder/CampaignPreviewPanel";
import { useBuilderStore } from "@/stores/use-builder-store";
import type { BuilderBlock } from "@/stores/use-builder-store";

// Mock the store
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: vi.fn(),
}));

const mockUseBuilderStore = useBuilderStore as unknown as ReturnType<typeof vi.fn>;

describe("CampaignPreviewPanel", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    campaignName: "Minha Campanha",
    leadCount: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock - empty blocks
    mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
      selector({ blocks: [] })
    );
  });

  describe("AC #1 - Abrir Preview", () => {
    it("renders when open prop is true", () => {
      render(<CampaignPreviewPanel {...defaultProps} />);
      expect(screen.getByText("Preview da Campanha")).toBeInTheDocument();
    });

    it("does not render when open prop is false", () => {
      render(<CampaignPreviewPanel {...defaultProps} open={false} />);
      expect(screen.queryByText("Preview da Campanha")).not.toBeInTheDocument();
    });

    it("displays campaign name", () => {
      render(<CampaignPreviewPanel {...defaultProps} />);
      expect(screen.getByText("Minha Campanha")).toBeInTheDocument();
    });

    it("displays default campaign name when not provided", () => {
      render(<CampaignPreviewPanel {...defaultProps} campaignName="" />);
      expect(screen.getByText("Campanha sem nome")).toBeInTheDocument();
    });

    it("displays lead count with singular form", () => {
      render(<CampaignPreviewPanel {...defaultProps} leadCount={1} />);
      expect(screen.getByText("1 lead associado")).toBeInTheDocument();
    });

    it("displays lead count with plural form", () => {
      render(<CampaignPreviewPanel {...defaultProps} leadCount={5} />);
      expect(screen.getByText("5 leads associados")).toBeInTheDocument();
    });

    it("displays zero leads correctly", () => {
      render(<CampaignPreviewPanel {...defaultProps} leadCount={0} />);
      expect(screen.getByText("0 leads associados")).toBeInTheDocument();
    });
  });

  describe("AC #5 - Fechar Preview", () => {
    it("calls onOpenChange when sheet is closed", () => {
      const onOpenChange = vi.fn();
      render(<CampaignPreviewPanel {...defaultProps} onOpenChange={onOpenChange} />);

      // Find and click the close button
      const closeButton = screen.getByRole("button", { name: /close/i });
      fireEvent.click(closeButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("AC #6 - Estado Vazio", () => {
    it("shows empty state when no blocks", () => {
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: [] })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);
      expect(screen.getByText("Adicione blocos para visualizar o preview")).toBeInTheDocument();
    });

    it("does not show empty state when blocks exist", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Test", body: "Body" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);
      expect(screen.queryByText("Adicione blocos para visualizar o preview")).not.toBeInTheDocument();
    });
  });

  describe("Preview Content", () => {
    it("displays email blocks with step numbers", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Primeiro Assunto", body: "Body 1" } },
        { id: "2", type: "email", position: 1, data: { subject: "Segundo Assunto", body: "Body 2" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);
      // InteractiveTimeline may also render subjects, so use getAllByText
      expect(screen.getAllByText("Primeiro Assunto").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Segundo Assunto").length).toBeGreaterThanOrEqual(1);
    });

    it("displays delay blocks", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Test", body: "Body" } },
        { id: "2", type: "delay", position: 1, data: { delayValue: 2, delayUnit: "days" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);
      expect(screen.getByText("Aguardar 2 dias")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has aria-label on sheet content", () => {
      render(<CampaignPreviewPanel {...defaultProps} />);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Preview da campanha");
    });
  });

  describe("AC #7 - Keyboard Navigation", () => {
    it("navigates to next email with ArrowRight key", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Email 1", body: "Body 1" } },
        { id: "2", type: "email", position: 1, data: { subject: "Email 2", body: "Body 2" } },
        { id: "3", type: "email", position: 2, data: { subject: "Email 3", body: "Body 3" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);

      // Initial state: Email 1 de 3
      expect(screen.getByText("Email 1 de 3")).toBeInTheDocument();

      // Press ArrowRight
      fireEvent.keyDown(window, { key: "ArrowRight" });

      // Should show Email 2 de 3
      expect(screen.getByText("Email 2 de 3")).toBeInTheDocument();
    });

    it("navigates to previous email with ArrowLeft key", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Email 1", body: "Body 1" } },
        { id: "2", type: "email", position: 1, data: { subject: "Email 2", body: "Body 2" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);

      // Navigate to second email first
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByText("Email 2 de 2")).toBeInTheDocument();

      // Press ArrowLeft
      fireEvent.keyDown(window, { key: "ArrowLeft" });

      // Should show Email 1 de 2
      expect(screen.getByText("Email 1 de 2")).toBeInTheDocument();
    });

    it("does not navigate past first email with ArrowLeft", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Email 1", body: "Body 1" } },
        { id: "2", type: "email", position: 1, data: { subject: "Email 2", body: "Body 2" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);

      // Already on first email, press ArrowLeft
      fireEvent.keyDown(window, { key: "ArrowLeft" });

      // Should still show Email 1 de 2
      expect(screen.getByText("Email 1 de 2")).toBeInTheDocument();
    });

    it("does not navigate past last email with ArrowRight", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Email 1", body: "Body 1" } },
        { id: "2", type: "email", position: 1, data: { subject: "Email 2", body: "Body 2" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} />);

      // Navigate to last email
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getByText("Email 2 de 2")).toBeInTheDocument();

      // Try to go further
      fireEvent.keyDown(window, { key: "ArrowRight" });

      // Should still show Email 2 de 2
      expect(screen.getByText("Email 2 de 2")).toBeInTheDocument();
    });

    it("does not add keyboard listener when panel is closed", () => {
      const mockBlocks: BuilderBlock[] = [
        { id: "1", type: "email", position: 0, data: { subject: "Email 1", body: "Body 1" } },
        { id: "2", type: "email", position: 1, data: { subject: "Email 2", body: "Body 2" } },
      ];
      mockUseBuilderStore.mockImplementation((selector: (state: { blocks: BuilderBlock[] }) => BuilderBlock[]) =>
        selector({ blocks: mockBlocks })
      );

      render(<CampaignPreviewPanel {...defaultProps} open={false} />);

      // Press ArrowRight - should not cause any errors since panel is closed
      fireEvent.keyDown(window, { key: "ArrowRight" });

      // Panel should not be visible
      expect(screen.queryByText("Preview da Campanha")).not.toBeInTheDocument();
    });
  });
});
