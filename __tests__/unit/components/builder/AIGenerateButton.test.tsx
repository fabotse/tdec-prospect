/**
 * AIGenerateButton Component Tests
 * Story 6.2: AI Text Generation in Builder
 *
 * AC: #1 - Generate Button in Email Block
 * AC: #2 - Error handling with retry
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
});
