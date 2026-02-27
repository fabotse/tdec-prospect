/**
 * ProductSelector Component
 * Story 6.5: Campaign Product Context
 *
 * AC: #1 - Product dropdown in campaign builder
 * AC: #5 - Warning when changing product with existing content
 *
 * Dropdown to select product context for AI generation.
 */

"use client";

import { useProducts } from "@/hooks/use-products";
import { useBuilderStore } from "@/stores/use-builder-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { toast } from "sonner";

const GENERAL_CONTEXT_VALUE = "__general__";

export function ProductSelector() {
  const { productId, setProductId, blocks } = useBuilderStore();
  const { data: products, isLoading } = useProducts();

  // Check if any email block has content
  const hasContent = blocks.some(
    (b) =>
      b.type === "email" &&
      ((b.data as { subject?: string }).subject ||
        (b.data as { body?: string }).body)
  );

  const handleChange = (value: string) => {
    const newProductId = value === GENERAL_CONTEXT_VALUE ? null : value;
    const product = products?.find((p) => p.id === value);

    // AC #5: Warning when changing product with existing content
    if (hasContent && productId !== newProductId) {
      toast.warning(
        "Textos existentes nao serao alterados. Regenere manualmente se necessario."
      );
    }

    setProductId(newProductId, product?.name ?? null);
  };

  // Current display value
  const currentValue = productId ?? GENERAL_CONTEXT_VALUE;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Contexto:</span>
      <Select
        value={currentValue}
        onValueChange={handleChange}
        disabled={isLoading}
      >
        <SelectTrigger
          className="w-[200px] h-8 border-0 !bg-transparent hover:!bg-transparent focus:ring-0 focus:ring-offset-0 shadow-none"
          aria-label="Selecionar produto para contexto da IA"
        >
          <SelectValue placeholder="Contexto Geral" />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          <SelectItem value={GENERAL_CONTEXT_VALUE}>Contexto Geral</SelectItem>
          {products?.map((product) => (
            <SelectItem key={product.id} value={product.id}>
              {product.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle
            className="h-4 w-4 text-muted-foreground cursor-help"
            aria-label="Ajuda sobre contexto do produto"
          />
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">
          <p>
            Selecione um produto para contextualizar os textos desta campanha. A
            IA usara as informacoes do produto selecionado.
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
