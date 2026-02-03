/**
 * ExamplesHint Component Tests
 * Story 6.10: Use of Successful Examples
 *
 * AC #7: User Guidance When Examples Missing
 * - Hint visible when no examples configured
 * - Hint hidden when examples exist
 * - Link navigates to Knowledge Base settings
 * - Non-blocking (doesn't prevent generation)
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExamplesHint } from "@/components/builder/ExamplesHint";

describe("ExamplesHint", () => {
  describe("visibility (AC #7)", () => {
    it("renders hint when hasExamples is false", () => {
      render(<ExamplesHint hasExamples={false} />);

      const link = screen.getByTestId("examples-hint-link");
      expect(link).toBeInTheDocument();
    });

    it("does not render when hasExamples is true", () => {
      render(<ExamplesHint hasExamples={true} />);

      const link = screen.queryByTestId("examples-hint-link");
      expect(link).not.toBeInTheDocument();
    });
  });

  describe("link attributes (AC #7)", () => {
    it("links to knowledge base settings", () => {
      render(<ExamplesHint hasExamples={false} />);

      const link = screen.getByTestId("examples-hint-link");
      expect(link).toHaveAttribute("href", "/settings/knowledge-base");
    });

    it("has accessible aria-label", () => {
      render(<ExamplesHint hasExamples={false} />);

      const link = screen.getByTestId("examples-hint-link");
      expect(link).toHaveAttribute(
        "aria-label",
        "Adicione exemplos de emails para melhorar a qualidade da geracao"
      );
    });
  });

  describe("styling (Task 4.4)", () => {
    it("renders lightbulb icon", () => {
      render(<ExamplesHint hasExamples={false} />);

      // Lightbulb icon should be present within the link
      const link = screen.getByTestId("examples-hint-link");
      const svg = link.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass("h-3.5", "w-3.5");
    });

    it("has muted-foreground base color class", () => {
      render(<ExamplesHint hasExamples={false} />);

      const link = screen.getByTestId("examples-hint-link");
      expect(link).toHaveClass("text-muted-foreground");
    });
  });
});
