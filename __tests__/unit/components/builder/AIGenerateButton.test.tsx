/**
 * AIGenerateButton Component Tests
 * Story 6.2: AI Text Generation in Builder
 * Story 6.8: Text Regeneration
 *
 * AC 6.2: #1 - Generate Button in Email Block
 * AC 6.2: #2 - Error handling with retry
 *
 * AC 6.8: #1 - Regenerate Button Visibility
 * AC 6.8: #3 - Streaming Animation on Regeneration
 * AC 6.8: #4 - Multiple Regenerations
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIGenerateButton } from "@/components/builder/AIGenerateButton";
import type { GenerationPhase } from "@/hooks/use-ai-generate";

describe("AIGenerateButton (AC: #1, #2)", () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Idle State (AC: #1)", () => {
    it("renders with sparkle icon and 'Gerar com IA' text", () => {
      render(
        <AIGenerateButton phase="idle" onClick={mockOnClick} />
      );

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("has correct aria-label for accessibility", () => {
      render(
        <AIGenerateButton phase="idle" onClick={mockOnClick} />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Gerar texto com IA");
    });

    it("calls onClick when clicked", () => {
      render(
        <AIGenerateButton phase="idle" onClick={mockOnClick} />
      );

      fireEvent.click(screen.getByRole("button"));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("is enabled by default", () => {
      render(
        <AIGenerateButton phase="idle" onClick={mockOnClick} />
      );

      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  describe("Loading/Generating State (AC: #1)", () => {
    it.each<GenerationPhase>(["generating", "streaming"])(
      "shows 'Gerando...' and spinner when phase is %s",
      (phase) => {
        render(
          <AIGenerateButton phase={phase} onClick={mockOnClick} />
        );

        expect(screen.getByText("Gerando...")).toBeInTheDocument();
      }
    );

    it("is disabled during generation", () => {
      render(
        <AIGenerateButton phase="generating" onClick={mockOnClick} />
      );

      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("has aria-busy true during generation", () => {
      render(
        <AIGenerateButton phase="streaming" onClick={mockOnClick} />
      );

      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });

    it("has cursor-wait class during generation", () => {
      render(
        <AIGenerateButton phase="generating" onClick={mockOnClick} />
      );

      expect(screen.getByRole("button")).toHaveClass("cursor-wait");
    });
  });

  describe("Error State (AC: #2)", () => {
    it("shows 'Tentar novamente' text on error phase", () => {
      render(
        <AIGenerateButton phase="error" onClick={mockOnClick} />
      );

      expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
    });

    it("shows 'Tentar novamente' when error prop is provided", () => {
      render(
        <AIGenerateButton
          phase="idle"
          error="Erro ao gerar"
          onClick={mockOnClick}
        />
      );

      expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
    });

    it("has destructive variant on error", () => {
      render(
        <AIGenerateButton phase="error" onClick={mockOnClick} />
      );

      // The button should have the destructive variant styling
      // Check for the data-slot="button" and variant attribute
      const button = screen.getByRole("button");
      expect(button.className).toContain("destructive");
    });

    it("has correct aria-label for retry", () => {
      render(
        <AIGenerateButton phase="error" onClick={mockOnClick} />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Tentar gerar novamente");
    });

    it("is enabled on error state for retry", () => {
      render(
        <AIGenerateButton phase="error" onClick={mockOnClick} />
      );

      expect(screen.getByRole("button")).not.toBeDisabled();
    });

    it("calls onClick for retry when clicked in error state", () => {
      render(
        <AIGenerateButton phase="error" onClick={mockOnClick} />
      );

      fireEvent.click(screen.getByRole("button"));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Done State", () => {
    it("returns to idle appearance after completion", () => {
      render(
        <AIGenerateButton phase="done" onClick={mockOnClick} />
      );

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
    });
  });

  describe("Event Propagation", () => {
    it("stops event propagation when clicked", () => {
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <AIGenerateButton phase="idle" onClick={mockOnClick} />
        </div>
      );

      fireEvent.click(screen.getByRole("button"));

      expect(mockOnClick).toHaveBeenCalled();
      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe("Disabled Prop", () => {
    it("respects disabled prop when true", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          disabled={true}
        />
      );

      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not call onClick when disabled", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          disabled={true}
        />
      );

      fireEvent.click(screen.getByRole("button"));
      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe("Custom className", () => {
    it("applies custom className", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          className="custom-class"
        />
      );

      expect(screen.getByRole("button")).toHaveClass("custom-class");
    });
  });

  // ==============================================
  // Story 6.8: Text Regeneration Tests
  // ==============================================
  describe("Regeneration State (Story 6.8 AC: #1, #3, #4)", () => {
    // Task 4.1: Test button shows "Gerar com IA" when hasContent=false
    it("shows 'Gerar com IA' when hasContent is false (AC #1)", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          hasContent={false}
        />
      );

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
    });

    // Task 4.2: Test button shows "Regenerar" when hasContent=true and phase=idle
    it("shows 'Regenerar' when hasContent is true and phase is idle (AC #1)", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      expect(screen.getByText("Regenerar")).toBeInTheDocument();
    });

    // Task 4.3: Test button shows "Gerando..." when phase=generating (regardless of hasContent)
    it("shows 'Gerando...' during generation even when hasContent is true (AC #3)", () => {
      render(
        <AIGenerateButton
          phase="generating"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      expect(screen.getByText("Gerando...")).toBeInTheDocument();
      expect(screen.queryByText("Regenerar")).not.toBeInTheDocument();
    });

    it("shows 'Gerando...' during streaming even when hasContent is true (AC #3)", () => {
      render(
        <AIGenerateButton
          phase="streaming"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      expect(screen.getByText("Gerando...")).toBeInTheDocument();
    });

    // Task 4.4: Test button shows "Tentar novamente" on error (regardless of hasContent)
    it("shows 'Tentar novamente' on error even when hasContent is true (AC #3)", () => {
      render(
        <AIGenerateButton
          phase="error"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
      expect(screen.queryByText("Regenerar")).not.toBeInTheDocument();
    });

    it("shows 'Tentar novamente' when error prop is set regardless of hasContent", () => {
      render(
        <AIGenerateButton
          phase="idle"
          error="Falha na geração"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
    });

    // Task 4.5: Test icon changes to RefreshCw when showing "Regenerar"
    // Note: We test this indirectly by ensuring the button renders correctly
    // Icon testing would require inspecting SVG elements or snapshots
    it("renders with RefreshCw icon styling when hasContent is true", () => {
      const { container } = render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      // Verify button is rendered with regenerate text (icon is RefreshCw)
      expect(screen.getByText("Regenerar")).toBeInTheDocument();
      // The button should contain an SVG element (the RefreshCw icon)
      const svgElement = container.querySelector("svg");
      expect(svgElement).toBeInTheDocument();
    });

    // Task 4.6: Test aria-label updates for regeneration state
    it("has correct aria-label for regeneration (AC #1)", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Regenerar texto com IA");
    });

    it("has 'Gerar texto com IA' aria-label when hasContent is false", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          hasContent={false}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Gerar texto com IA");
    });

    it("error aria-label takes precedence over hasContent (AC #3)", () => {
      render(
        <AIGenerateButton
          phase="error"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Tentar gerar novamente");
    });

    // AC #4: Multiple regenerations test
    it("allows multiple clicks for consecutive regenerations (AC #4)", () => {
      render(
        <AIGenerateButton
          phase="idle"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      const button = screen.getByRole("button");

      // First click
      fireEvent.click(button);
      expect(mockOnClick).toHaveBeenCalledTimes(1);

      // Second click
      fireEvent.click(button);
      expect(mockOnClick).toHaveBeenCalledTimes(2);

      // Third click
      fireEvent.click(button);
      expect(mockOnClick).toHaveBeenCalledTimes(3);
    });

    // Verify button returns to "Regenerar" after completion (AC #4)
    it("returns to Regenerar after done phase when hasContent is true (AC #4)", () => {
      // Simulate: generation complete, phase returns to idle but content exists
      render(
        <AIGenerateButton
          phase="done"
          onClick={mockOnClick}
          hasContent={true}
        />
      );

      // When phase is "done" and hasContent is true, should show "Regenerar"
      // Note: The current implementation treats "done" as not loading/error,
      // so it should show "Regenerar" if hasContent is true
      expect(screen.getByText("Regenerar")).toBeInTheDocument();
    });

    it("defaults hasContent to false when prop is not provided", () => {
      render(
        <AIGenerateButton phase="idle" onClick={mockOnClick} />
      );

      expect(screen.getByText("Gerar com IA")).toBeInTheDocument();
    });
  });
});
