"use client";

/**
 * Products Management Page
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #1 - Produtos tab in settings
 * AC: #2 - Products list display
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProductList } from "@/components/products";

export default function ProductsPage() {
  return (
    <Card className="bg-background-secondary border-border">
      <CardHeader>
        <CardTitle className="text-h3">Produtos</CardTitle>
        <CardDescription className="text-body-small text-foreground-muted">
          Gerencie seu catálogo de produtos para usar como contexto em campanhas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProductList />
      </CardContent>
    </Card>
  );
}
