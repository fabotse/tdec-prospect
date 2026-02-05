/**
 * AIUnlockAnimation Component Tests
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #5: Animação de progresso premium (partículas, ripple, loading bar)
 * AC #7: Respeita prefers-reduced-motion
 *
 * Tests: estados (idle, unlocking, complete), autoPlay, onComplete, reduced motion
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

let mockReducedMotion = false;

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      className,
      "data-testid": testId,
      ...props
    }: Record<string, unknown>) => (
      <div
        className={className as string}
        data-testid={testId as string}
        data-state={props["data-state"] as string}
      >
        {children as React.ReactNode}
      </div>
    ),
    p: ({ children, className }: Record<string, unknown>) => (
      <p className={className as string}>{children as React.ReactNode}</p>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useReducedMotion: () => mockReducedMotion,
}));

import { AIUnlockAnimation } from "@/components/ui/ai-unlock-animation";

describe("AIUnlockAnimation (Story 8.4 AC #1, #5)", () => {
  beforeEach(() => {
    mockReducedMotion = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with data-testid", () => {
    render(<AIUnlockAnimation autoPlay={false} />);
    expect(screen.getByTestId("ai-unlock-animation")).toBeInTheDocument();
  });

  it("starts in idle state when autoPlay is false", () => {
    render(<AIUnlockAnimation autoPlay={false} />);
    const el = screen.getByTestId("ai-unlock-animation");
    expect(el).toHaveAttribute("data-state", "idle");
  });

  it("auto-starts animation when autoPlay is true", () => {
    render(<AIUnlockAnimation autoPlay />);
    const el = screen.getByTestId("ai-unlock-animation");
    expect(el).toHaveAttribute("data-state", "unlocking");
  });

  it("transitions to complete after duration", () => {
    render(<AIUnlockAnimation autoPlay duration={2000} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const el = screen.getByTestId("ai-unlock-animation");
    expect(el).toHaveAttribute("data-state", "complete");
  });

  it("calls onComplete when animation finishes", () => {
    const onComplete = vi.fn();
    render(<AIUnlockAnimation autoPlay duration={1000} onComplete={onComplete} />);

    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("uses default duration of 3000ms", () => {
    const onComplete = vi.fn();
    render(<AIUnlockAnimation autoPlay onComplete={onComplete} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("displays 'Processando...' text during unlocking", () => {
    render(<AIUnlockAnimation autoPlay />);
    expect(screen.getByText("Processando...")).toBeInTheDocument();
  });

  it("displays 'Concluído' text when complete", () => {
    render(<AIUnlockAnimation autoPlay duration={500} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("Concluído")).toBeInTheDocument();
  });

  it("passes className through", () => {
    render(<AIUnlockAnimation autoPlay={false} className="custom-class" />);
    const el = screen.getByTestId("ai-unlock-animation");
    expect(el).toHaveClass("custom-class");
  });

  it("renders lightning bolt icon", () => {
    render(<AIUnlockAnimation autoPlay={false} />);
    const svg = screen.getByTestId("ai-unlock-animation").querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});

describe("AIUnlockAnimation reduced motion (Story 8.4 AC #7)", () => {
  beforeEach(() => {
    mockReducedMotion = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders simplified UI without particles", () => {
    render(<AIUnlockAnimation autoPlay />);
    expect(screen.getByTestId("ai-unlock-animation")).toBeInTheDocument();
    expect(screen.getByText("Processando...")).toBeInTheDocument();
  });

  it("still calls onComplete with reduced motion", () => {
    const onComplete = vi.fn();
    render(<AIUnlockAnimation autoPlay duration={500} onComplete={onComplete} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows loading bar without particles", () => {
    render(<AIUnlockAnimation autoPlay />);
    // The reduced motion version has a simple loading bar
    const bar = screen.getByTestId("ai-unlock-animation").querySelector(".bg-foreground");
    expect(bar).toBeInTheDocument();
  });
});
