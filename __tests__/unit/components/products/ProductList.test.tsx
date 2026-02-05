/**
 * ProductList Component Tests
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #2 - List display with empty state
 * AC: #7 - Search/filter products
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, "data-testid": testId, onClick, ...props }: Record<string, unknown>) => (
      <div className={className as string} data-testid={testId as string} onClick={onClick as () => void}>
        {children as React.ReactNode}
      </div>
    ),
    button: ({ children, className, onClick, type, ...props }: Record<string, unknown>) => (
      <button className={className as string} onClick={onClick as () => void} type={type as "button"}>
        {children as React.ReactNode}
      </button>
    ),
    a: ({ children, className, href, ...props }: Record<string, unknown>) => (
      <a className={className as string} href={href as string}>
        {children as React.ReactNode}
      </a>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
  useSpring: (v: unknown) => v,
  useTransform: () => 0,
  useReducedMotion: () => false,
}));

import { ProductList } from "@/components/products/ProductList";
import type { Product } from "@/types/product";

// Mock the hooks
const mockProducts: Product[] = [
  {
    id: "product-1",
    tenantId: "tenant-123",
    name: "CRM Software",
    description: "Customer relationship management",
    features: null,
    differentials: null,
    targetAudience: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    campaignCount: 0,
  },
  {
    id: "product-2",
    tenantId: "tenant-123",
    name: "Analytics Platform",
    description: "Business intelligence and analytics",
    features: null,
    differentials: null,
    targetAudience: null,
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    campaignCount: 2,
  },
];

let mockUseProductsReturn: {
  data: Product[] | undefined;
  isLoading: boolean;
  error: Error | null;
} = {
  data: mockProducts,
  isLoading: false,
  error: null,
};

const mockCreateProduct = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const mockUpdateProduct = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const mockDeleteProduct = {
  mutateAsync: vi.fn(),
  isPending: false,
};

vi.mock("@/hooks/use-products", () => ({
  useProducts: () => mockUseProductsReturn,
  useCreateProduct: () => mockCreateProduct,
  useUpdateProduct: () => mockUpdateProduct,
  useDeleteProduct: () => mockDeleteProduct,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ProductList (AC: #2, #7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProductsReturn = {
      data: mockProducts,
      isLoading: false,
      error: null,
    };
  });

  describe("Loading State", () => {
    it("shows skeleton while loading", () => {
      mockUseProductsReturn = {
        data: undefined as unknown as Product[],
        isLoading: true,
        error: null,
      };

      render(<ProductList />);

      // Should show skeleton animation
      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("shows error message on fetch error", () => {
      mockUseProductsReturn = {
        data: undefined as unknown as Product[],
        isLoading: false,
        error: new Error("Erro ao carregar produtos"),
      };

      render(<ProductList />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Erro ao carregar produtos")).toBeInTheDocument();
    });
  });

  describe("Empty State (AC #2)", () => {
    it("shows empty state when no products", () => {
      mockUseProductsReturn = {
        data: [],
        isLoading: false,
        error: null,
      };

      render(<ProductList />);

      expect(screen.getByText("Nenhum produto cadastrado")).toBeInTheDocument();
      expect(
        screen.getByText("Adicione produtos para usar como contexto em campanhas.")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Novo Produto/i })
      ).toBeInTheDocument();
    });
  });

  describe("Products Display (AC #2)", () => {
    it("renders all products", () => {
      render(<ProductList />);

      expect(screen.getByText("CRM Software")).toBeInTheDocument();
      expect(screen.getByText("Analytics Platform")).toBeInTheDocument();
    });

    it("shows search input and add button when products exist", () => {
      render(<ProductList />);

      expect(
        screen.getByPlaceholderText("Buscar produto...")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Novo Produto/i })
      ).toBeInTheDocument();
    });
  });

  describe("Search Filter (AC #7)", () => {
    it("filters products by name", async () => {
      const user = userEvent.setup();

      render(<ProductList />);

      const searchInput = screen.getByPlaceholderText("Buscar produto...");
      await user.type(searchInput, "CRM");

      expect(screen.getByText("CRM Software")).toBeInTheDocument();
      expect(screen.queryByText("Analytics Platform")).not.toBeInTheDocument();
    });

    it("filters products by description", async () => {
      const user = userEvent.setup();

      render(<ProductList />);

      const searchInput = screen.getByPlaceholderText("Buscar produto...");
      await user.type(searchInput, "intelligence");

      expect(screen.queryByText("CRM Software")).not.toBeInTheDocument();
      expect(screen.getByText("Analytics Platform")).toBeInTheDocument();
    });

    it("shows no results message when filter matches nothing", async () => {
      const user = userEvent.setup();

      render(<ProductList />);

      const searchInput = screen.getByPlaceholderText("Buscar produto...");
      await user.type(searchInput, "xyz123");

      expect(
        screen.getByText(/Nenhum produto encontrado para "xyz123"/)
      ).toBeInTheDocument();
    });

    it("is case-insensitive", async () => {
      const user = userEvent.setup();

      render(<ProductList />);

      const searchInput = screen.getByPlaceholderText("Buscar produto...");
      await user.type(searchInput, "crm");

      expect(screen.getByText("CRM Software")).toBeInTheDocument();
    });
  });

  describe("Add Product Dialog", () => {
    it("opens dialog when Novo Produto button is clicked", async () => {
      render(<ProductList />);

      // Click the first "Novo Produto" button (in the list)
      const buttons = screen.getAllByRole("button", { name: /Novo Produto/i });
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        // Dialog should appear
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
    });
  });

  describe("Edit Product", () => {
    it("opens dialog with product data when edit is clicked", async () => {
      render(<ProductList />);

      // Find the first edit button
      const editButtons = screen.getAllByRole("button", {
        name: "Editar produto",
      });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Editar Produto")).toBeInTheDocument();
      });
    });
  });

  describe("Delete Product", () => {
    it("opens confirmation dialog when delete is clicked", async () => {
      render(<ProductList />);

      // Find the first delete button
      const deleteButtons = screen.getAllByRole("button", {
        name: "Excluir produto",
      });
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Remover produto?")).toBeInTheDocument();
      });
    });

    it("shows warning for product with campaigns", async () => {
      render(<ProductList />);

      // Delete the second product (has campaignCount: 2)
      const deleteButtons = screen.getAllByRole("button", {
        name: "Excluir produto",
      });
      fireEvent.click(deleteButtons[1]);

      await waitFor(() => {
        expect(
          screen.getByText(/Este produto está vinculado a 2 campanhas/)
        ).toBeInTheDocument();
      });
    });
  });
});
