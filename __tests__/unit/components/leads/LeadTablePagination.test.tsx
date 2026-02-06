/**
 * LeadTablePagination Component Tests
 * Story: 3.8 - Lead Table Pagination
 *
 * AC #1: Pagination controls display
 * AC #2: Page navigation
 * AC #3: Items per page selector
 * AC #7: Edge cases (0 results, 1 page)
 * AC #8: Keyboard accessibility
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LeadTablePagination } from "@/components/leads/LeadTablePagination";
import type { PaginationMeta } from "@/types/apollo";

// ==============================================
// TEST DATA
// ==============================================

const mockPagination: PaginationMeta = {
  totalEntries: 250,
  page: 1,
  perPage: 25,
  totalPages: 10,
};

const mockPaginationSinglePage: PaginationMeta = {
  totalEntries: 15,
  page: 1,
  perPage: 25,
  totalPages: 1,
};

// ==============================================
// TESTS
// ==============================================

describe("LeadTablePagination", () => {
  // AC #7: Edge cases - 0 results
  describe("Edge Cases", () => {
    it("should not render when pagination is null", () => {
      const { container } = render(
        <LeadTablePagination
          pagination={null}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("should not render when totalEntries is 0", () => {
      const { container } = render(
        <LeadTablePagination
          pagination={{ totalEntries: 0, page: 1, perPage: 25, totalPages: 0 }}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("should hide navigation buttons when only 1 page", () => {
      render(
        <LeadTablePagination
          pagination={mockPaginationSinglePage}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      // Results counter should be visible
      expect(screen.getByText(/Mostrando 1-15 de 15 resultados/)).toBeInTheDocument();

      // Navigation buttons should not be visible
      expect(screen.queryByLabelText("Página anterior")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Próxima página")).not.toBeInTheDocument();
    });
  });

  // AC #1: Pagination controls display
  describe("Display", () => {
    it("should display results counter with correct range", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByText(/Mostrando 1-25 de 250 resultados/)).toBeInTheDocument();
    });

    it("should display correct range for middle page", () => {
      render(
        <LeadTablePagination
          pagination={{ ...mockPagination, page: 5 }}
          page={5}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByText(/Mostrando 101-125 de 250 resultados/)).toBeInTheDocument();
    });

    it("should display correct range for last page with partial results", () => {
      render(
        <LeadTablePagination
          pagination={{ totalEntries: 230, page: 10, perPage: 25, totalPages: 10 }}
          page={10}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByText(/Mostrando 226-230 de 230 resultados/)).toBeInTheDocument();
    });

    it("should display page indicator", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={3}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByText(/Página 3 de 10/)).toBeInTheDocument();
    });

    it("should display Previous and Next buttons", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={2}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText("Página anterior")).toBeInTheDocument();
      expect(screen.getByLabelText("Próxima página")).toBeInTheDocument();
    });

    it("should display per page selector", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByText("Por página:")).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  // AC #2: Page navigation
  describe("Page Navigation", () => {
    it("should disable Previous button on first page", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText("Página anterior")).toBeDisabled();
      expect(screen.getByLabelText("Próxima página")).not.toBeDisabled();
    });

    it("should disable Next button on last page", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={10}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText("Página anterior")).not.toBeDisabled();
      expect(screen.getByLabelText("Próxima página")).toBeDisabled();
    });

    it("should call onPageChange with next page when clicking Next", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={25}
          onPageChange={onPageChange}
          onPerPageChange={vi.fn()}
        />
      );

      await user.click(screen.getByLabelText("Próxima página"));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it("should call onPageChange with previous page when clicking Previous", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={5}
          perPage={25}
          onPageChange={onPageChange}
          onPerPageChange={vi.fn()}
        />
      );

      await user.click(screen.getByLabelText("Página anterior"));
      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it("should not call onPageChange when Previous is disabled", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={25}
          onPageChange={onPageChange}
          onPerPageChange={vi.fn()}
        />
      );

      // Button is disabled, so click should not fire
      const prevButton = screen.getByLabelText("Página anterior");
      expect(prevButton).toBeDisabled();
      await user.click(prevButton);
      expect(onPageChange).not.toHaveBeenCalled();
    });
  });

  // AC #3: Items per page selector
  describe("Items Per Page", () => {
    it("should render per page selector with options", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      // Verify the select trigger is present and shows current value
      const combobox = screen.getByRole("combobox");
      expect(combobox).toBeInTheDocument();
      expect(combobox).toHaveTextContent("25");
    });

    it("should display current perPage value in selector", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={50}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByRole("combobox")).toHaveTextContent("50");
    });

    it("should display perPage of 100", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={100}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByRole("combobox")).toHaveTextContent("100");
    });
  });

  // AC #6: Loading state
  describe("Loading State", () => {
    it("should disable all controls when loading", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={5}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
          isLoading={true}
        />
      );

      expect(screen.getByLabelText("Página anterior")).toBeDisabled();
      expect(screen.getByLabelText("Próxima página")).toBeDisabled();
      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("should not call handlers when loading", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();
      const onPerPageChange = vi.fn();

      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={5}
          perPage={25}
          onPageChange={onPageChange}
          onPerPageChange={onPerPageChange}
          isLoading={true}
        />
      );

      // Try to click buttons - they're disabled so clicks won't register
      await user.click(screen.getByLabelText("Próxima página"));
      await user.click(screen.getByLabelText("Página anterior"));

      expect(onPageChange).not.toHaveBeenCalled();
    });
  });

  // AC #8: Keyboard accessibility
  describe("Accessibility", () => {
    it("should have navigation role with appropriate label", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={1}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByRole("navigation")).toHaveAttribute(
        "aria-label",
        "Paginação da tabela"
      );
    });

    it("should have accessible labels on buttons", () => {
      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={2}
          perPage={25}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      expect(screen.getByLabelText("Página anterior")).toBeInTheDocument();
      expect(screen.getByLabelText("Próxima página")).toBeInTheDocument();
      expect(screen.getByLabelText("Selecionar quantidade por página")).toBeInTheDocument();
    });

    it("should be keyboard navigable", async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <LeadTablePagination
          pagination={mockPagination}
          page={5}
          perPage={25}
          onPageChange={onPageChange}
          onPerPageChange={vi.fn()}
        />
      );

      // Tab to previous button and press Enter
      await user.tab();
      await user.tab();
      await user.tab();
      await user.keyboard("{Enter}");

      // Should have triggered page change
      expect(onPageChange).toHaveBeenCalled();
    });
  });

  // Large numbers formatting
  describe("Number Formatting", () => {
    it("should format large numbers with Brazilian locale", () => {
      render(
        <LeadTablePagination
          pagination={{
            totalEntries: 1234567,
            page: 1,
            perPage: 100,
            totalPages: 500,
          }}
          page={1}
          perPage={100}
          onPageChange={vi.fn()}
          onPerPageChange={vi.fn()}
        />
      );

      // Brazilian locale uses dots as thousand separators
      expect(screen.getByText(/1\.234\.567/)).toBeInTheDocument();
    });
  });
});
