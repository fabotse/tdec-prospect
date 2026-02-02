"use client";

/**
 * Product Card Component
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #2 - Card with name, description (truncated)
 * AC: #5 - Edit icon
 * AC: #6 - Delete icon
 * AC: #8 - Campaign usage indicator
 */

import { Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

export function ProductCard({
  product,
  onEdit,
  onDelete,
  isDeleting,
}: ProductCardProps) {
  return (
    <Card className="bg-background border-border">
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm truncate">{product.name}</h4>
              {product.campaignCount !== undefined && product.campaignCount > 0 && (
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  Usado em {product.campaignCount}{" "}
                  {product.campaignCount === 1 ? "campanha" : "campanhas"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground-muted line-clamp-2">
              {product.description}
            </p>
            {product.targetAudience && (
              <p className="text-xs text-foreground-muted mt-2 italic">
                Público-alvo: {product.targetAudience}
              </p>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              disabled={isDeleting}
              aria-label="Editar produto"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              aria-label="Excluir produto"
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
