"use client";

/**
 * Products Empty State Component
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #2 - Empty state shows descriptive message
 */

import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ProductsEmptyStateProps {
  onAdd: () => void;
}

export function ProductsEmptyState({ onAdd }: ProductsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-foreground/5 p-4 mb-4">
        <Package className="h-8 w-8 text-foreground-muted" />
      </div>
      <h3 className="text-lg font-medium mb-2">Nenhum produto cadastrado</h3>
      <p className="text-sm text-foreground-muted mb-4 max-w-sm">
        Adicione produtos para usar como contexto em campanhas.
      </p>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Novo Produto
      </Button>
    </div>
  );
}
