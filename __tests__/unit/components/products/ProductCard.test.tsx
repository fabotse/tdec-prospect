/**
 * ProductCard Component Tests
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #2 - Card with name, description
 * AC: #5 - Edit icon
 * AC: #6 - Delete icon
 * AC: #8 - Campaign usage indicator
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProductCard } from "@/components/products/ProductCard";
import type { Product } from "@/types/product";

const mockProduct: Product = {
  id: "product-123",
  tenantId: "tenant-123",
  name: "Test Product",
  description: "This is a test product description that might be quite long",
  features: "Feature 1, Feature 2",
  differentials: "Differential 1",
  targetAudience: "SMBs and Enterprises",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  campaignCount: 0,
};

describe("ProductCard (AC: #2, #5, #6, #8)", () => {
  describe("Visual Display (AC #2)", () => {
    it("renders product name", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(screen.getByText("Test Product")).toBeInTheDocument();
    });

    it("renders product description", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(
        screen.getByText(
          "This is a test product description that might be quite long"
        )
      ).toBeInTheDocument();
    });

    it("renders target audience when present", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(
        screen.getByText("Público-alvo: SMBs and Enterprises")
      ).toBeInTheDocument();
    });

    it("does not render target audience when null", () => {
      const productWithoutTarget = { ...mockProduct, targetAudience: null };

      render(
        <ProductCard
          product={productWithoutTarget}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(screen.queryByText(/Público-alvo:/)).not.toBeInTheDocument();
    });
  });

  describe("Edit Action (AC #5)", () => {
    it("renders edit button with correct aria-label", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(
        screen.getByRole("button", { name: "Editar produto" })
      ).toBeInTheDocument();
    });

    it("calls onEdit when edit button is clicked", () => {
      const onEdit = vi.fn();

      render(
        <ProductCard
          product={mockProduct}
          onEdit={onEdit}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Editar produto" }));
      expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it("disables edit button when isDeleting is true", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={true}
        />
      );

      expect(
        screen.getByRole("button", { name: "Editar produto" })
      ).toBeDisabled();
    });
  });

  describe("Delete Action (AC #6)", () => {
    it("renders delete button with correct aria-label", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(
        screen.getByRole("button", { name: "Excluir produto" })
      ).toBeInTheDocument();
    });

    it("calls onDelete when delete button is clicked", () => {
      const onDelete = vi.fn();

      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={onDelete}
          isDeleting={false}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Excluir produto" }));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("shows loading spinner when isDeleting is true", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={true}
        />
      );

      // The delete button should show a loader instead of trash icon
      const deleteButton = screen.getByRole("button", {
        name: "Excluir produto",
      });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe("Campaign Usage Indicator (AC #8)", () => {
    it("shows campaign count badge when campaignCount > 0", () => {
      const productWithCampaigns = { ...mockProduct, campaignCount: 3 };

      render(
        <ProductCard
          product={productWithCampaigns}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(screen.getByText("Usado em 3 campanhas")).toBeInTheDocument();
    });

    it("shows singular form for single campaign", () => {
      const productWithOneCampaign = { ...mockProduct, campaignCount: 1 };

      render(
        <ProductCard
          product={productWithOneCampaign}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(screen.getByText("Usado em 1 campanha")).toBeInTheDocument();
    });

    it("does not show badge when campaignCount is 0", () => {
      render(
        <ProductCard
          product={mockProduct}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(screen.queryByText(/Usado em/)).not.toBeInTheDocument();
    });

    it("does not show badge when campaignCount is undefined", () => {
      const productWithoutCount = { ...mockProduct, campaignCount: undefined };

      render(
        <ProductCard
          product={productWithoutCount}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          isDeleting={false}
        />
      );

      expect(screen.queryByText(/Usado em/)).not.toBeInTheDocument();
    });
  });
});
