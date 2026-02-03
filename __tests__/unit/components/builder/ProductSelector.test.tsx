/**
 * ProductSelector Component Tests
 * Story 6.5: Campaign Product Context
 *
 * AC: #1 - Product dropdown in campaign builder
 * AC: #5 - Warning when changing product with existing content
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductSelector } from "@/components/builder/ProductSelector";
import { useProducts } from "@/hooks/use-products";
import { useBuilderStore } from "@/stores/use-builder-store";
import { toast } from "sonner";
import type { Product } from "@/types/product";

// Mock hooks and toast
vi.mock("@/hooks/use-products");
vi.mock("@/stores/use-builder-store");
vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

const mockProducts: Product[] = [
  {
    id: "product-1",
    tenantId: "tenant-1",
    name: "Premium SaaS",
    description: "Enterprise solution",
    features: "Feature 1, Feature 2",
    differentials: "Best in class",
    targetAudience: "CTOs",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  {
    id: "product-2",
    tenantId: "tenant-1",
    name: "Basic Plan",
    description: "Starter solution",
    features: null,
    differentials: null,
    targetAudience: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("ProductSelector", () => {
  const mockSetProductId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(useProducts).mockReturnValue({
      data: mockProducts,
      isLoading: false,
    } as unknown as ReturnType<typeof useProducts>);

    vi.mocked(useBuilderStore).mockReturnValue({
      productId: null,
      productName: null,
      setProductId: mockSetProductId,
      blocks: [],
    } as unknown as ReturnType<typeof useBuilderStore>);
  });

  describe("Rendering (AC: #1)", () => {
    it("renders product dropdown", () => {
      render(<ProductSelector />);

      expect(
        screen.getByRole("combobox", {
          name: /selecionar produto/i,
        })
      ).toBeInTheDocument();
    });

    it("shows Contexto Geral as default option", () => {
      render(<ProductSelector />);

      expect(screen.getByText("Contexto Geral")).toBeInTheDocument();
    });

    it("shows help icon with tooltip", () => {
      render(<ProductSelector />);

      expect(
        screen.getByLabelText(/ajuda sobre contexto do produto/i)
      ).toBeInTheDocument();
    });

    it("disables dropdown when loading", () => {
      vi.mocked(useProducts).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as ReturnType<typeof useProducts>);

      render(<ProductSelector />);

      expect(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      ).toBeDisabled();
    });
  });

  describe("Product Selection (AC: #1)", () => {
    it("displays products from useProducts hook", async () => {
      render(<ProductSelector />);

      // Open the dropdown
      fireEvent.click(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      );

      await waitFor(() => {
        expect(screen.getByText("Premium SaaS")).toBeInTheDocument();
        expect(screen.getByText("Basic Plan")).toBeInTheDocument();
      });
    });

    it("calls setProductId when product is selected", async () => {
      render(<ProductSelector />);

      // Open dropdown and select product
      fireEvent.click(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      );

      await waitFor(() => {
        expect(screen.getByText("Premium SaaS")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Premium SaaS"));

      expect(mockSetProductId).toHaveBeenCalledWith("product-1", "Premium SaaS");
    });

    it("calls setProductId with null when Contexto Geral selected", async () => {
      vi.mocked(useBuilderStore).mockReturnValue({
        productId: "product-1",
        productName: "Premium SaaS",
        setProductId: mockSetProductId,
        blocks: [],
      } as unknown as ReturnType<typeof useBuilderStore>);

      render(<ProductSelector />);

      // Open dropdown and select Contexto Geral
      fireEvent.click(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      );

      await waitFor(() => {
        expect(screen.getByText("Contexto Geral")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Contexto Geral"));

      expect(mockSetProductId).toHaveBeenCalledWith(null, null);
    });
  });

  describe("Context Label", () => {
    it("shows static Contexto label", () => {
      render(<ProductSelector />);

      expect(screen.getByText("Contexto:")).toBeInTheDocument();
    });

    it("shows selected product name in dropdown", () => {
      vi.mocked(useBuilderStore).mockReturnValue({
        productId: "product-1",
        productName: "Premium SaaS",
        setProductId: mockSetProductId,
        blocks: [],
      } as unknown as ReturnType<typeof useBuilderStore>);

      render(<ProductSelector />);

      // Product name shown in the dropdown trigger
      expect(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      ).toBeInTheDocument();
    });
  });

  describe("Product Change Warning (AC: #5)", () => {
    it("shows warning toast when changing product with existing content", async () => {
      vi.mocked(useBuilderStore).mockReturnValue({
        productId: null,
        productName: null,
        setProductId: mockSetProductId,
        blocks: [
          {
            id: "block-1",
            type: "email",
            position: 0,
            data: { subject: "Test Subject", body: "Test body" },
          },
        ],
      } as unknown as ReturnType<typeof useBuilderStore>);

      render(<ProductSelector />);

      // Open dropdown and select product
      fireEvent.click(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      );

      await waitFor(() => {
        expect(screen.getByText("Premium SaaS")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Premium SaaS"));

      expect(toast.warning).toHaveBeenCalledWith(
        "Textos existentes nao serao alterados. Regenere manualmente se necessario."
      );
    });

    it("does not show warning when no existing content", async () => {
      vi.mocked(useBuilderStore).mockReturnValue({
        productId: null,
        productName: null,
        setProductId: mockSetProductId,
        blocks: [
          {
            id: "block-1",
            type: "email",
            position: 0,
            data: { subject: "", body: "" },
          },
        ],
      } as unknown as ReturnType<typeof useBuilderStore>);

      render(<ProductSelector />);

      // Open dropdown and select product
      fireEvent.click(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      );

      await waitFor(() => {
        expect(screen.getByText("Premium SaaS")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Premium SaaS"));

      expect(toast.warning).not.toHaveBeenCalled();
    });

    it("does not show warning when selecting same product", async () => {
      vi.mocked(useBuilderStore).mockReturnValue({
        productId: "product-1",
        productName: "Premium SaaS",
        setProductId: mockSetProductId,
        blocks: [
          {
            id: "block-1",
            type: "email",
            position: 0,
            data: { subject: "Test", body: "Content" },
          },
        ],
      } as unknown as ReturnType<typeof useBuilderStore>);

      render(<ProductSelector />);

      // Open dropdown and select same product
      fireEvent.click(
        screen.getByRole("combobox", { name: /selecionar produto/i })
      );

      await waitFor(() => {
        // Use role option to select the dropdown item, not the trigger value
        expect(
          screen.getByRole("option", { name: /Premium SaaS/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("option", { name: /Premium SaaS/i }));

      expect(toast.warning).not.toHaveBeenCalled();
    });
  });
});
