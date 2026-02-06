/**
 * PreviewNavigation Tests
 * Story 5.8: Campaign Preview
 *
 * AC #4: Navegar entre emails no preview
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PreviewNavigation } from "@/components/builder/PreviewNavigation";

describe("PreviewNavigation", () => {
  const defaultProps = {
    currentIndex: 1,
    totalEmails: 3,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  };

  describe("AC #4 - Navegar Entre Emails", () => {
    it("displays current position indicator", () => {
      render(<PreviewNavigation {...defaultProps} />);
      expect(screen.getByText("Email 2 de 3")).toBeInTheDocument();
    });

    it("displays first email position", () => {
      render(<PreviewNavigation {...defaultProps} currentIndex={0} />);
      expect(screen.getByText("Email 1 de 3")).toBeInTheDocument();
    });

    it("displays last email position", () => {
      render(<PreviewNavigation {...defaultProps} currentIndex={2} />);
      expect(screen.getByText("Email 3 de 3")).toBeInTheDocument();
    });

    it("calls onPrevious when clicking Anterior button", () => {
      const onPrevious = vi.fn();
      render(<PreviewNavigation {...defaultProps} onPrevious={onPrevious} />);

      fireEvent.click(screen.getByText("Anterior"));
      expect(onPrevious).toHaveBeenCalledTimes(1);
    });

    it("calls onNext when clicking Proximo button", () => {
      const onNext = vi.fn();
      render(<PreviewNavigation {...defaultProps} onNext={onNext} />);

      fireEvent.click(screen.getByText("Proximo"));
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("Button States", () => {
    it("disables Anterior button when on first email", () => {
      render(<PreviewNavigation {...defaultProps} currentIndex={0} />);

      const anteriorButton = screen.getByRole("button", { name: /anterior/i });
      expect(anteriorButton).toBeDisabled();
    });

    it("enables Anterior button when not on first email", () => {
      render(<PreviewNavigation {...defaultProps} currentIndex={1} />);

      const anteriorButton = screen.getByRole("button", { name: /anterior/i });
      expect(anteriorButton).not.toBeDisabled();
    });

    it("disables Proximo button when on last email", () => {
      render(<PreviewNavigation {...defaultProps} currentIndex={2} />);

      const proximoButton = screen.getByRole("button", { name: /proximo/i });
      expect(proximoButton).toBeDisabled();
    });

    it("enables Proximo button when not on last email", () => {
      render(<PreviewNavigation {...defaultProps} currentIndex={1} />);

      const proximoButton = screen.getByRole("button", { name: /proximo/i });
      expect(proximoButton).not.toBeDisabled();
    });

    it("both buttons disabled when only one email", () => {
      render(
        <PreviewNavigation
          currentIndex={0}
          totalEmails={1}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />
      );

      const anteriorButton = screen.getByRole("button", { name: /anterior/i });
      const proximoButton = screen.getByRole("button", { name: /proximo/i });

      expect(anteriorButton).toBeDisabled();
      expect(proximoButton).toBeDisabled();
    });
  });

  describe("Accessibility", () => {
    it("has aria-label on Anterior button", () => {
      render(<PreviewNavigation {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: "Email anterior" })
      ).toBeInTheDocument();
    });

    it("has aria-label on Proximo button", () => {
      render(<PreviewNavigation {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: "Proximo email" })
      ).toBeInTheDocument();
    });
  });
});
