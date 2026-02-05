/**
 * NativeMagnetic Component Tests
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W, animações com framer-motion
 * AC #2: Efeito magnético nos botões primários
 * AC #7: Respeita prefers-reduced-motion
 *
 * Tests: renderização, props, click handler, className passthrough, as variants
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Track useReducedMotion mock value
let mockReducedMotion = false;

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, onClick, style, ...props }: Record<string, unknown>) => (
      <div className={className as string} onClick={onClick as () => void} style={style as Record<string, unknown>} data-testid={props["data-testid"] as string}>
        {children as React.ReactNode}
      </div>
    ),
    button: ({ children, className, onClick, type, ...props }: Record<string, unknown>) => (
      <button className={className as string} onClick={onClick as () => void} type={type as "button"} data-testid={props["data-testid"] as string}>
        {children as React.ReactNode}
      </button>
    ),
    a: ({ children, className, onClick, href, ...props }: Record<string, unknown>) => (
      <a className={className as string} onClick={onClick as () => void} href={href as string} data-testid={props["data-testid"] as string}>
        {children as React.ReactNode}
      </a>
    ),
  },
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useSpring: (v: unknown) => v,
  useTransform: () => 0,
  useReducedMotion: () => mockReducedMotion,
}));

import { NativeMagnetic } from "@/components/ui/native-magnetic";

describe("NativeMagnetic (Story 8.4 AC #1, #2)", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("renders children correctly", () => {
    render(
      <NativeMagnetic>
        <span>Click me</span>
      </NativeMagnetic>
    );

    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("renders as div by default", () => {
    const { container } = render(
      <NativeMagnetic>
        <span>Content</span>
      </NativeMagnetic>
    );

    expect(container.firstChild?.nodeName).toBe("DIV");
  });

  it("renders as button when as='button'", () => {
    const { container } = render(
      <NativeMagnetic as="button">
        <span>Button</span>
      </NativeMagnetic>
    );

    expect(container.firstChild?.nodeName).toBe("BUTTON");
  });

  it("renders as anchor when as='a' with href", () => {
    const { container } = render(
      <NativeMagnetic as="a" href="https://example.com">
        <span>Link</span>
      </NativeMagnetic>
    );

    const anchor = container.firstChild as HTMLAnchorElement;
    expect(anchor.nodeName).toBe("A");
    expect(anchor.href).toContain("example.com");
  });

  it("passes onClick handler", () => {
    const handleClick = vi.fn();
    render(
      <NativeMagnetic onClick={handleClick}>
        <span>Clickable</span>
      </NativeMagnetic>
    );

    fireEvent.click(screen.getByText("Clickable"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("passes className through", () => {
    const { container } = render(
      <NativeMagnetic className="custom-class">
        <span>Styled</span>
      </NativeMagnetic>
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("applies inline-block class by default", () => {
    const { container } = render(
      <NativeMagnetic>
        <span>Default</span>
      </NativeMagnetic>
    );

    expect(container.firstChild).toHaveClass("inline-block");
  });

  it("handles button type attribute when as='button'", () => {
    const { container } = render(
      <NativeMagnetic as="button">
        <span>Submit</span>
      </NativeMagnetic>
    );

    const button = container.firstChild as HTMLButtonElement;
    expect(button.type).toBe("button");
  });

  it("uses custom strength value", () => {
    // Component should render without errors with custom strength
    const { container } = render(
      <NativeMagnetic strength={0.8}>
        <span>Strong pull</span>
      </NativeMagnetic>
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders without scaleOnHover when disabled", () => {
    const { container } = render(
      <NativeMagnetic scaleOnHover={false}>
        <span>No scale</span>
      </NativeMagnetic>
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("NativeMagnetic reduced motion (Story 8.4 AC #7)", () => {
  beforeEach(() => {
    mockReducedMotion = true;
  });

  it("renders without animation effects when reduced motion", () => {
    const { container } = render(
      <NativeMagnetic>
        <span>Reduced</span>
      </NativeMagnetic>
    );

    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText("Reduced")).toBeInTheDocument();
  });

  it("onClick still works with reduced motion", () => {
    const handleClick = vi.fn();
    render(
      <NativeMagnetic onClick={handleClick}>
        <span>Still clickable</span>
      </NativeMagnetic>
    );

    fireEvent.click(screen.getByText("Still clickable"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
