/**
 * ProductForm Component Tests
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #3 - Form fields validation
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ProductForm } from "@/components/products/ProductForm";
import type { Product } from "@/types/product";

const mockProduct: Product = {
  id: "product-123",
  tenantId: "tenant-123",
  name: "Existing Product",
  description: "Existing Description",
  features: "Existing Features",
  differentials: "Existing Differentials",
  targetAudience: "Existing Audience",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  campaignCount: 0,
};

describe("ProductForm (AC #3)", () => {
  describe("Form Fields", () => {
    it("renders all required and optional fields", () => {
      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      expect(screen.getByLabelText("Nome do produto")).toBeInTheDocument();
      expect(screen.getByLabelText("Descrição")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Características principais (opcional)")
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Diferenciais (opcional)")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Público-alvo (opcional)")
      ).toBeInTheDocument();
    });

    it("shows correct placeholders", () => {
      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      expect(
        screen.getByPlaceholderText("Ex: Software de CRM Empresarial")
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(
          "Explicação detalhada do que é o produto e como funciona..."
        )
      ).toBeInTheDocument();
    });

    it("pre-fills form with existing product data on edit", () => {
      render(
        <ProductForm
          product={mockProduct}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      expect(screen.getByLabelText("Nome do produto")).toHaveValue(
        "Existing Product"
      );
      expect(screen.getByLabelText("Descrição")).toHaveValue(
        "Existing Description"
      );
      expect(
        screen.getByLabelText("Características principais (opcional)")
      ).toHaveValue("Existing Features");
    });
  });

  describe("Validation", () => {
    it("shows error when name is empty", async () => {
      const user = userEvent.setup();

      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      // Fill only description
      await user.type(screen.getByLabelText("Descrição"), "Some description");

      // Submit form
      fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

      await waitFor(() => {
        expect(screen.getByText("Nome é obrigatório")).toBeInTheDocument();
      });
    });

    it("shows error when description is empty", async () => {
      const user = userEvent.setup();

      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      // Fill only name
      await user.type(screen.getByLabelText("Nome do produto"), "Product Name");

      // Submit form
      fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

      await waitFor(() => {
        expect(screen.getByText("Descrição é obrigatória")).toBeInTheDocument();
      });
    });

    it("calls onSubmit with valid data", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      render(
        <ProductForm
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      await user.type(screen.getByLabelText("Nome do produto"), "New Product");
      await user.type(screen.getByLabelText("Descrição"), "New Description");

      fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          name: "New Product",
          description: "New Description",
          features: null,
          differentials: null,
          targetAudience: null,
        });
      });
    });
  });

  describe("Submit Button States", () => {
    it("shows 'Adicionar' for new product", () => {
      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      expect(
        screen.getByRole("button", { name: "Adicionar" })
      ).toBeInTheDocument();
    });

    it("shows 'Salvar' for edit mode", () => {
      render(
        <ProductForm
          product={mockProduct}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={false}
        />
      );

      expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    });

    it("shows 'Salvando...' when isSubmitting", () => {
      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={true}
        />
      );

      expect(
        screen.getByRole("button", { name: "Salvando..." })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Salvando..." })
      ).toBeDisabled();
    });

    it("disables all inputs when isSubmitting", () => {
      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={true}
        />
      );

      expect(screen.getByLabelText("Nome do produto")).toBeDisabled();
      expect(screen.getByLabelText("Descrição")).toBeDisabled();
    });
  });

  describe("Cancel Action", () => {
    it("calls onCancel when cancel button is clicked", () => {
      const onCancel = vi.fn();

      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={onCancel}
          isSubmitting={false}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("disables cancel button when isSubmitting", () => {
      render(
        <ProductForm
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isSubmitting={true}
        />
      );

      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    });
  });
});
