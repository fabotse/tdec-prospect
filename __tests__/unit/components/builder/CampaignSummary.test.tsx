/**
 * CampaignSummary Component Tests
 * Story 6.12: AI Campaign Structure Generation
 *
 * AC #4 - Summary panel showing email count and total duration
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CampaignSummary } from "@/components/builder/CampaignSummary";

// Mock useBuilderStore
const mockBlocks = vi.fn();
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: (selector: (state: { blocks: unknown[] }) => unknown) =>
    selector({ blocks: mockBlocks() }),
}));

describe("CampaignSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders nothing when there are no blocks", () => {
      mockBlocks.mockReturnValue([]);

      const { container } = render(<CampaignSummary />);

      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when there are only delay blocks (no emails)", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "delay", position: 0, data: { delayValue: 3, delayUnit: "days" } },
      ]);

      const { container } = render(<CampaignSummary />);

      expect(container.firstChild).toBeNull();
    });

    it("renders summary when there are email blocks", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: { subject: "", body: "" } },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("campaign-summary")).toBeInTheDocument();
      expect(screen.getByTestId("email-count-summary")).toBeInTheDocument();
    });
  });

  describe("Email Count (AC #4)", () => {
    it("displays singular 'email' for 1 email", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("email-count-summary")).toHaveTextContent("1 email");
    });

    it("displays plural 'emails' for multiple emails", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 3, delayUnit: "days" } },
        { id: "3", type: "email", position: 2, data: {} },
        { id: "4", type: "delay", position: 3, data: { delayValue: 2, delayUnit: "days" } },
        { id: "5", type: "email", position: 4, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("email-count-summary")).toHaveTextContent("3 emails");
    });

    it("counts only email blocks, ignoring delays", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 3, delayUnit: "days" } },
        { id: "3", type: "delay", position: 2, data: { delayValue: 5, delayUnit: "days" } },
        { id: "4", type: "email", position: 3, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("email-count-summary")).toHaveTextContent("2 emails");
    });
  });

  describe("Duration Calculation (AC #4)", () => {
    it("does not show duration when there are no delays", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "email", position: 1, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.queryByTestId("duration-summary")).not.toBeInTheDocument();
    });

    it("displays singular 'dia' for 1 day duration", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 1, delayUnit: "days" } },
        { id: "3", type: "email", position: 2, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("duration-summary")).toHaveTextContent("1 dia de duracao");
    });

    it("displays plural 'dias' for multiple days duration", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 3, delayUnit: "days" } },
        { id: "3", type: "email", position: 2, data: {} },
        { id: "4", type: "delay", position: 3, data: { delayValue: 5, delayUnit: "days" } },
        { id: "5", type: "email", position: 4, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("duration-summary")).toHaveTextContent("8 dias de duracao");
    });

    it("sums all delay blocks correctly", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 2, delayUnit: "days" } },
        { id: "3", type: "email", position: 2, data: {} },
        { id: "4", type: "delay", position: 3, data: { delayValue: 3, delayUnit: "days" } },
        { id: "5", type: "email", position: 4, data: {} },
        { id: "6", type: "delay", position: 5, data: { delayValue: 4, delayUnit: "days" } },
        { id: "7", type: "email", position: 6, data: {} },
      ]);

      render(<CampaignSummary />);

      // 2 + 3 + 4 = 9 days
      expect(screen.getByTestId("duration-summary")).toHaveTextContent("9 dias de duracao");
    });

    it("converts hours to days (rounded up)", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 25, delayUnit: "hours" } },
        { id: "3", type: "email", position: 2, data: {} },
      ]);

      render(<CampaignSummary />);

      // 25 hours = 2 days (rounded up)
      expect(screen.getByTestId("duration-summary")).toHaveTextContent("2 dias de duracao");
    });

    it("handles missing delayValue gracefully (defaults to 0)", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: {} },
        { id: "3", type: "email", position: 2, data: {} },
      ]);

      render(<CampaignSummary />);

      // No duration shown when total is 0
      expect(screen.queryByTestId("duration-summary")).not.toBeInTheDocument();
    });

    it("handles missing delayUnit gracefully (defaults to days)", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 5 } },
        { id: "3", type: "email", position: 2, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("duration-summary")).toHaveTextContent("5 dias de duracao");
    });
  });

  describe("Combined Display", () => {
    it("displays both email count and duration for typical campaign", () => {
      mockBlocks.mockReturnValue([
        { id: "1", type: "email", position: 0, data: {} },
        { id: "2", type: "delay", position: 1, data: { delayValue: 3, delayUnit: "days" } },
        { id: "3", type: "email", position: 2, data: {} },
        { id: "4", type: "delay", position: 3, data: { delayValue: 4, delayUnit: "days" } },
        { id: "5", type: "email", position: 4, data: {} },
        { id: "6", type: "delay", position: 5, data: { delayValue: 5, delayUnit: "days" } },
        { id: "7", type: "email", position: 6, data: {} },
      ]);

      render(<CampaignSummary />);

      expect(screen.getByTestId("email-count-summary")).toHaveTextContent("4 emails");
      expect(screen.getByTestId("duration-summary")).toHaveTextContent("12 dias de duracao");
    });
  });
});
