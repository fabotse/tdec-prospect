/**
 * InteractiveTimeline Component Tests
 * Story 8.4: UI TripleD Components Integration
 *
 * AC #1: Funciona com tema B&W existente
 * AC #6: Linha conectora cresce com scroll-trigger, dots e cards com animação spring
 * AC #7: Respeita prefers-reduced-motion
 *
 * Tests: items rendering, timeline line, dots, cards, acessibilidade
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let mockReducedMotion = false;

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      className,
      "data-testid": testId,
      ...rest
    }: Record<string, unknown>) => (
      <div
        className={className as string}
        data-testid={testId as string}
      >
        {children as React.ReactNode}
      </div>
    ),
  },
  useInView: () => true,
  useReducedMotion: () => mockReducedMotion,
}));

import {
  InteractiveTimeline,
  type TimelineItem,
} from "@/components/ui/interactive-timeline";

const mockItems: TimelineItem[] = [
  { id: "1", title: "Email 1", description: "Primeiro contato" },
  { id: "2", title: "Intervalo", description: "3 dias" },
  { id: "3", title: "Email 2", description: "Follow-up" },
];

describe("InteractiveTimeline (Story 8.4 AC #1, #6)", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("renders all timeline items", () => {
    render(<InteractiveTimeline items={mockItems} />);

    expect(screen.getByText("Email 1")).toBeInTheDocument();
    expect(screen.getByText("Intervalo")).toBeInTheDocument();
    expect(screen.getByText("Email 2")).toBeInTheDocument();
  });

  it("renders item descriptions", () => {
    render(<InteractiveTimeline items={mockItems} />);

    expect(screen.getByText("Primeiro contato")).toBeInTheDocument();
    expect(screen.getByText("3 dias")).toBeInTheDocument();
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
  });

  it("renders timeline line", () => {
    const { container } = render(<InteractiveTimeline items={mockItems} />);

    const line = container.querySelector(".origin-top.bg-border");
    expect(line).toBeInTheDocument();
  });

  it("renders timeline dots", () => {
    const { container } = render(<InteractiveTimeline items={mockItems} />);

    const dots = container.querySelectorAll(".rounded-full.border-primary");
    expect(dots.length).toBe(3);
  });

  it("renders content cards with border", () => {
    const { container } = render(<InteractiveTimeline items={mockItems} />);

    const cards = container.querySelectorAll(".border-border.bg-card");
    expect(cards.length).toBe(3);
  });

  it("applies className to container", () => {
    const { container } = render(
      <InteractiveTimeline items={mockItems} className="my-timeline" />
    );

    expect(container.firstChild).toHaveClass("my-timeline");
  });

  it("renders date when provided", () => {
    const itemsWithDate: TimelineItem[] = [
      { id: "1", title: "Email 1", description: "Test", date: "05/02/2026" },
    ];
    render(<InteractiveTimeline items={itemsWithDate} />);

    expect(screen.getByText("05/02/2026")).toBeInTheDocument();
  });

  it("renders custom icons", () => {
    const itemsWithIcon: TimelineItem[] = [
      {
        id: "1",
        title: "Email",
        description: "Test",
        icon: <span data-testid="custom-icon">📧</span>,
      },
    ];
    render(<InteractiveTimeline items={itemsWithIcon} />);

    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("renders empty timeline without errors", () => {
    const { container } = render(<InteractiveTimeline items={[]} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe("InteractiveTimeline reduced motion (Story 8.4 AC #7)", () => {
  beforeEach(() => {
    mockReducedMotion = true;
  });

  it("renders all items without animation", () => {
    render(<InteractiveTimeline items={mockItems} />);

    expect(screen.getByText("Email 1")).toBeInTheDocument();
    expect(screen.getByText("Intervalo")).toBeInTheDocument();
    expect(screen.getByText("Email 2")).toBeInTheDocument();
  });
});
