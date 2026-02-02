"use client";

/**
 * Product List Component
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #2 - List of products in cards format
 * AC: #7 - Search/filter by name in real-time
 */

import { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductCard } from "./ProductCard";
import { ProductDialog } from "./ProductDialog";
import { DeleteProductDialog } from "./DeleteProductDialog";
import { ProductsEmptyState } from "./ProductsEmptyState";
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@/hooks/use-products";
import type { Product, CreateProductInput } from "@/types/product";

/**
 * Loading skeleton for products list
 */
function ProductListSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-4 rounded-lg border border-border bg-background"
        >
          <div className="h-5 w-48 bg-foreground/10 rounded mb-2" />
          <div className="h-4 w-full bg-foreground/10 rounded mb-1" />
          <div className="h-4 w-3/4 bg-foreground/10 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ProductList() {
  const { data: products, isLoading, error } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!searchTerm.trim()) return products;

    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const openAddDialog = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const openDeleteDialog = (product: Product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async (data: CreateProductInput) => {
    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({
          productId: editingProduct.id,
          data,
        });
        toast.success("Produto atualizado com sucesso");
      } else {
        await createProduct.mutateAsync(data);
        toast.success("Produto salvo com sucesso");
      }
      setDialogOpen(false);
      setEditingProduct(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar produto";
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete) return;

    try {
      await deleteProduct.mutateAsync(productToDelete.id);
      toast.success("Produto removido com sucesso");
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao remover produto";
      toast.error(message);
    }
  };

  if (isLoading) {
    return <ProductListSkeleton />;
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-md bg-destructive/10 border border-destructive/20"
        role="alert"
      >
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar produtos"}
        </p>
      </div>
    );
  }

  const hasProducts = products && products.length > 0;
  const isSubmitting = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="space-y-4">
      {!hasProducts ? (
        <ProductsEmptyState onAdd={openAddDialog} />
      ) : (
        <>
          {/* Search and Add button */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted" />
              <Input
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openAddDialog} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Novo Produto
            </Button>
          </div>

          {/* Product cards */}
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-foreground-muted text-center py-8">
              Nenhum produto encontrado para &quot;{searchTerm}&quot;
            </p>
          ) : (
            <div className="space-y-3">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={() => openEditDialog(product)}
                  onDelete={() => openDeleteDialog(product)}
                  isDeleting={
                    deleteProduct.isPending &&
                    productToDelete?.id === product.id
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Add/Edit Dialog */}
      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteProductDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        product={productToDelete}
        onConfirm={handleDelete}
        isDeleting={deleteProduct.isPending}
      />
    </div>
  );
}
