/**
 * SequenceConnector Component Tests
 * Story 5.5: Sequence Connector Lines
 *
 * AC: #1 - Conectores entre Blocos Consecutivos
 * AC: #2 - Visual do Conector (Estilo Attio)
 * AC: #3 - Animacao de Entrada (Draw Line)
 * AC: #5 - Acessibilidade
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SequenceConnector } from "@/components/builder/SequenceConnector";

// Mock framer-motion
let mockReducedMotion = false;

vi.mock("framer-motion", () => ({
  motion: {
    path: ({
      d,
      stroke,
      strokeWidth,
      strokeLinecap,
      strokeLinejoin,
      fill,
      initial,
      animate,
      ...props
    }: {
      d: string;
      stroke: string;
      strokeWidth: number;
      strokeLinecap?: "inherit" | "butt" | "round" | "square";
      strokeLinejoin?: "inherit" | "round" | "miter" | "bevel";
      fill?: string;
      initial?: string;
      animate?: string;
    }) => (
      <path
        data-testid={d.includes("L") ? "connector-arrow" : "connector-path"}
        d={d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
        fill={fill}
        data-initial={initial}
        data-animate={animate}
        {...props}
      />
    ),
  },
  useReducedMotion: () => mockReducedMotion,
}));

describe("SequenceConnector (AC: #1, #2, #3, #5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReducedMotion = false;
  });

  describe("Visual Style (AC: #2)", () => {
    it("renders SVG connector with correct test id", () => {
      render(<SequenceConnector />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toBeInTheDocument();
    });

    it("renders SVG with correct default dimensions", () => {
      render(<SequenceConnector />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toHaveAttribute("width", "20");
      expect(svg).toHaveAttribute("height", "24");
    });

    it("respects custom height prop", () => {
      render(<SequenceConnector height={48} />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toHaveAttribute("height", "48");
    });

    it("renders connector path with bezier curve", () => {
      render(<SequenceConnector />);

      const path = screen.getByTestId("connector-path");
      expect(path).toBeInTheDocument();
      // Path should contain C for cubic bezier
      expect(path).toHaveAttribute("d", expect.stringContaining("C"));
    });

    it("renders arrow marker", () => {
      render(<SequenceConnector />);

      const arrow = screen.getByTestId("connector-arrow");
      expect(arrow).toBeInTheDocument();
      // Arrow path contains L for line commands
      expect(arrow).toHaveAttribute("d", expect.stringContaining("L"));
    });

    it("uses currentColor for stroke to inherit text color", () => {
      render(<SequenceConnector />);

      const path = screen.getByTestId("connector-path");
      expect(path).toHaveAttribute("stroke", "currentColor");
    });

    it("uses correct stroke width of 2px", () => {
      render(<SequenceConnector />);

      const path = screen.getByTestId("connector-path");
      expect(path).toHaveAttribute("stroke-width", "2");
    });

    it("applies round stroke linecap", () => {
      render(<SequenceConnector />);

      const path = screen.getByTestId("connector-path");
      expect(path).toHaveAttribute("stroke-linecap", "round");
    });

    it("has correct viewBox", () => {
      render(<SequenceConnector />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toHaveAttribute("viewBox", "0 0 20 24");
    });

    it("adjusts viewBox for custom height", () => {
      render(<SequenceConnector height={48} />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toHaveAttribute("viewBox", "0 0 20 48");
    });
  });

  describe("Animation (AC: #3)", () => {
    it("starts with hidden initial state when animate is true", () => {
      render(<SequenceConnector animate={true} />);

      const path = screen.getByTestId("connector-path");
      expect(path).toHaveAttribute("data-initial", "hidden");
    });

    it("animates to visible state", () => {
      render(<SequenceConnector animate={true} />);

      const path = screen.getByTestId("connector-path");
      expect(path).toHaveAttribute("data-animate", "visible");
    });

    it("skips animation when animate is false", () => {
      render(<SequenceConnector animate={false} />);

      const path = screen.getByTestId("connector-path");
      expect(path).toHaveAttribute("data-initial", "visible");
    });
  });

  describe("Reduced Motion (AC: #3, #5)", () => {
    it("skips animation when reduced motion is preferred", () => {
      mockReducedMotion = true;

      render(<SequenceConnector animate={true} />);

      const path = screen.getByTestId("connector-path");
      // Should start visible immediately when reduced motion is on
      expect(path).toHaveAttribute("data-initial", "visible");
    });
  });

  describe("Accessibility (AC: #5)", () => {
    it("has aria-hidden attribute set to true", () => {
      render(<SequenceConnector />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });

    it("has tabIndex -1 to prevent focus", () => {
      render(<SequenceConnector />);

      const svg = screen.getByTestId("sequence-connector");
      // In the DOM, React's tabIndex becomes lowercase tabindex
      expect(svg).toHaveAttribute("tabindex", "-1");
    });

    it("is centered with mx-auto class", () => {
      render(<SequenceConnector />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toHaveClass("mx-auto");
    });
  });

  describe("Default Props", () => {
    it("defaults height to 24", () => {
      render(<SequenceConnector />);

      const svg = screen.getByTestId("sequence-connector");
      expect(svg).toHaveAttribute("height", "24");
    });

    it("defaults animate to true", () => {
      render(<SequenceConnector />);

      const path = screen.getByTestId("connector-path");
      // When animate is true, initial should be "hidden"
      expect(path).toHaveAttribute("data-initial", "hidden");
    });
  });
});
