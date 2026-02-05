/**
 * GlassCard Component Tests
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #3: Glassmorphism, hover interactions, dados exibidos com clareza
 * AC #7: Respeita prefers-reduced-motion
 *
 * Tests: renderização, children, click, className, data-testid, a11y props
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let mockReducedMotion = false;

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, "data-testid": testId, ...props }: Record<string, unknown>) => (
      <div className={className as string} data-testid={testId as string}>
        {children as React.ReactNode}
      </div>
    ),
  },
  useReducedMotion: () => mockReducedMotion,
}));

import { GlassCard } from "@/components/ui/glass-card";

/**
 * GlassCard DOM structure (with mocked motion.div):
 * div (motion.div mock - has className, data-testid)
 *   └── div.group.backdrop-blur-md (glass wrapper - has onClick, onKeyDown, tabIndex, role)
 *        ├── div.blur-3xl (abstract shape 1)
 *        ├── div.blur-3xl (abstract shape 2)
 *        └── div.relative (content wrapper)
 *             └── {children}
 */
function getGlassWrapper(text: string): HTMLElement {
  // Navigate: text → div.relative → div.group (glass wrapper)
  return screen.getByText(text).parentElement!.parentElement!;
}

describe("GlassCard (Story 8.4 AC #1, #3)", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("renders children correctly", () => {
    render(
      <GlassCard>
        <p>Card content</p>
      </GlassCard>
    );

    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("passes data-testid", () => {
    render(
      <GlassCard data-testid="my-card">
        <p>Content</p>
      </GlassCard>
    );

    expect(screen.getByTestId("my-card")).toBeInTheDocument();
  });

  it("handles click events", () => {
    const handleClick = vi.fn();
    render(
      <GlassCard onClick={handleClick}>
        <p>Clickable card</p>
      </GlassCard>
    );

    fireEvent.click(getGlassWrapper("Clickable card"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("passes className through to outer wrapper", () => {
    render(
      <GlassCard className="custom-glass" data-testid="glass">
        <p>Styled</p>
      </GlassCard>
    );

    const el = screen.getByTestId("glass");
    expect(el).toHaveClass("custom-glass");
  });

  it("supports keyboard handler", () => {
    const handleKeyDown = vi.fn();
    render(
      <GlassCard onKeyDown={handleKeyDown}>
        <p>Key-aware</p>
      </GlassCard>
    );

    fireEvent.keyDown(getGlassWrapper("Key-aware"), { key: "Enter" });
    expect(handleKeyDown).toHaveBeenCalledTimes(1);
  });

  it("supports tabIndex for keyboard navigation", () => {
    render(
      <GlassCard tabIndex={0}>
        <p>Focusable</p>
      </GlassCard>
    );

    expect(getGlassWrapper("Focusable")).toHaveAttribute("tabindex", "0");
  });

  it("supports ARIA role", () => {
    render(
      <GlassCard role="button">
        <p>Button-like</p>
      </GlassCard>
    );

    expect(getGlassWrapper("Button-like")).toHaveAttribute("role", "button");
  });

  it("renders glassmorphism styles (backdrop-blur, gradient)", () => {
    render(
      <GlassCard>
        <p>Glass</p>
      </GlassCard>
    );

    const glassDiv = getGlassWrapper("Glass");
    expect(glassDiv.className).toContain("backdrop-blur");
    expect(glassDiv.className).toContain("bg-gradient-to-br");
  });

  it("renders abstract background shapes", () => {
    const { container } = render(
      <GlassCard>
        <p>Shapes</p>
      </GlassCard>
    );

    const blurShapes = container.querySelectorAll(".blur-3xl");
    expect(blurShapes.length).toBe(2);
  });

  it("adds cursor-pointer when onClick is provided", () => {
    render(
      <GlassCard onClick={() => {}}>
        <p>Cursor</p>
      </GlassCard>
    );

    expect(getGlassWrapper("Cursor").className).toContain("cursor-pointer");
  });
});

describe("GlassCard reduced motion (Story 8.4 AC #7)", () => {
  beforeEach(() => {
    mockReducedMotion = true;
  });

  it("renders without animation when reduced motion", () => {
    render(
      <GlassCard data-testid="reduced">
        <p>No animation</p>
      </GlassCard>
    );

    expect(screen.getByTestId("reduced")).toBeInTheDocument();
    expect(screen.getByText("No animation")).toBeInTheDocument();
  });
});
