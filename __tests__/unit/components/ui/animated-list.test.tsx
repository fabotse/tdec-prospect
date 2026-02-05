/**
 * AnimatedList Component Tests
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #4: Itens entram com animação stagger
 * AC #7: Respeita prefers-reduced-motion
 *
 * Tests: renderização, children, variants, stagger config
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let mockReducedMotion = false;

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: Record<string, unknown>) => (
      <div className={className as string} data-testid={props["data-testid"] as string}>
        {children as React.ReactNode}
      </div>
    ),
  },
  useReducedMotion: () => mockReducedMotion,
}));

import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";

describe("AnimatedList (Story 8.4 AC #1, #4)", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("renders children correctly", () => {
    render(
      <AnimatedList>
        <AnimatedListItem>Item 1</AnimatedListItem>
        <AnimatedListItem>Item 2</AnimatedListItem>
        <AnimatedListItem>Item 3</AnimatedListItem>
      </AnimatedList>
    );

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("applies className to container", () => {
    const { container } = render(
      <AnimatedList className="grid gap-4">
        <AnimatedListItem>Item</AnimatedListItem>
      </AnimatedList>
    );

    expect(container.firstChild).toHaveClass("grid");
    expect(container.firstChild).toHaveClass("gap-4");
  });

  it("renders multiple items in order", () => {
    render(
      <AnimatedList>
        <AnimatedListItem>First</AnimatedListItem>
        <AnimatedListItem>Second</AnimatedListItem>
        <AnimatedListItem>Third</AnimatedListItem>
      </AnimatedList>
    );

    const items = screen.getAllByText(/First|Second|Third/);
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First");
    expect(items[1]).toHaveTextContent("Second");
    expect(items[2]).toHaveTextContent("Third");
  });

  it("accepts custom stagger configuration", () => {
    const { container } = render(
      <AnimatedList staggerChildren={0.12} delayChildren={0.3}>
        <AnimatedListItem>Item</AnimatedListItem>
      </AnimatedList>
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders empty list without errors", () => {
    const { container } = render(
      <AnimatedList>
        {[]}
      </AnimatedList>
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("AnimatedListItem (Story 8.4 AC #4)", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("renders item content", () => {
    render(
      <AnimatedList>
        <AnimatedListItem>
          <div data-testid="inner">Inner content</div>
        </AnimatedListItem>
      </AnimatedList>
    );

    expect(screen.getByTestId("inner")).toBeInTheDocument();
  });

  it("applies className to item", () => {
    render(
      <AnimatedList>
        <AnimatedListItem className="my-item">Content</AnimatedListItem>
      </AnimatedList>
    );

    const item = screen.getByText("Content");
    expect(item).toHaveClass("my-item");
  });
});

describe("AnimatedList reduced motion (Story 8.4 AC #7)", () => {
  beforeEach(() => {
    mockReducedMotion = true;
  });

  it("renders all items immediately without stagger", () => {
    render(
      <AnimatedList>
        <AnimatedListItem>Item A</AnimatedListItem>
        <AnimatedListItem>Item B</AnimatedListItem>
      </AnimatedList>
    );

    expect(screen.getByText("Item A")).toBeInTheDocument();
    expect(screen.getByText("Item B")).toBeInTheDocument();
  });
});
