/**
 * PreviewDelayStep Tests
 * Story 5.8: Campaign Preview
 *
 * AC #3: Visualizar delays como timeline
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PreviewDelayStep } from "@/components/builder/PreviewDelayStep";

describe("PreviewDelayStep", () => {
  describe("AC #3 - Visualizar Delays", () => {
    it("displays delay in days (singular)", () => {
      render(<PreviewDelayStep delayValue={1} delayUnit="days" />);
      expect(screen.getByText("Aguardar 1 dia")).toBeInTheDocument();
    });

    it("displays delay in days (plural)", () => {
      render(<PreviewDelayStep delayValue={2} delayUnit="days" />);
      expect(screen.getByText("Aguardar 2 dias")).toBeInTheDocument();
    });

    it("displays delay in hours (singular)", () => {
      render(<PreviewDelayStep delayValue={1} delayUnit="hours" />);
      expect(screen.getByText("Aguardar 1 hora")).toBeInTheDocument();
    });

    it("displays delay in hours (plural)", () => {
      render(<PreviewDelayStep delayValue={5} delayUnit="hours" />);
      expect(screen.getByText("Aguardar 5 horas")).toBeInTheDocument();
    });

    it("handles larger delay values", () => {
      render(<PreviewDelayStep delayValue={7} delayUnit="days" />);
      expect(screen.getByText("Aguardar 7 dias")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has role separator", () => {
      render(<PreviewDelayStep delayValue={2} delayUnit="days" />);
      expect(screen.getByRole("separator")).toBeInTheDocument();
    });

    it("has aria-label with delay info", () => {
      render(<PreviewDelayStep delayValue={2} delayUnit="days" />);
      expect(screen.getByRole("separator")).toHaveAttribute(
        "aria-label",
        "Aguardar 2 dias"
      );
    });

    it("has aria-label for hours", () => {
      render(<PreviewDelayStep delayValue={3} delayUnit="hours" />);
      expect(screen.getByRole("separator")).toHaveAttribute(
        "aria-label",
        "Aguardar 3 horas"
      );
    });
  });

  describe("Visual Elements", () => {
    it("renders clock icon container", () => {
      const { container } = render(
        <PreviewDelayStep delayValue={2} delayUnit="days" />
      );
      const iconContainer = container.querySelector(".bg-accent");
      expect(iconContainer).toBeInTheDocument();
    });

    it("renders timeline lines", () => {
      const { container } = render(
        <PreviewDelayStep delayValue={2} delayUnit="days" />
      );
      const timelineLines = container.querySelectorAll(".w-px.bg-border");
      expect(timelineLines.length).toBe(2);
    });
  });
});
