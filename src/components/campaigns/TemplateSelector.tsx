/**
 * TemplateSelector Component
 * Story 6.13: Smart Campaign Templates
 *
 * AC #1 - Product dropdown + Templates Prontos section with 4-6 cards
 * AC #5 - "Ou crie uma campanha personalizada" section at bottom
 */

"use client";

import { ArrowLeft, Loader2, AlertCircle, Sparkles, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TemplateCard } from "./TemplateCard";
import { useCampaignTemplates } from "@/hooks/use-campaign-templates";
import type { CampaignTemplate } from "@/types/campaign-template";
import type { Product } from "@/types/product";

// ==============================================
// TYPES
// ==============================================

export interface TemplateSelectorProps {
  /** Available products for context selection */
  products: Product[];
  /** Whether products are loading */
  isLoadingProducts: boolean;
  /** Currently selected product (null = general context) */
  selectedProduct: Product | null;
  /** Callback when product selection changes */
  onProductChange: (product: Product | null) => void;
  /** Callback when a template is selected */
  onTemplateSelect: (template: CampaignTemplate) => void;
  /** Callback when user wants to create custom campaign */
  onCustomClick: () => void;
  /** Callback when user wants to go back */
  onBack: () => void;
}

// ==============================================
// COMPONENT
// ==============================================

/**
 * TemplateSelector component
 * Main selector screen with product dropdown, template grid, and custom option
 *
 * AC #1 - Product dropdown at top, template cards below
 * AC #5 - Custom campaign section at bottom
 */
export function TemplateSelector({
  products,
  isLoadingProducts,
  selectedProduct,
  onProductChange,
  onTemplateSelect,
  onCustomClick,
  onBack,
}: TemplateSelectorProps) {
  const { data: templates, isLoading: isLoadingTemplates, error } = useCampaignTemplates();

  const handleProductChange = (value: string) => {
    if (value === "general") {
      onProductChange(null);
    } else {
      const product = products.find((p) => p.id === value);
      onProductChange(product || null);
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="template-selector">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
          data-testid="template-selector-back"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Voltar</span>
        </Button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Criar com IA
          </h2>
          <p className="text-sm text-muted-foreground">
            Selecione um template pronto ou crie uma campanha personalizada
          </p>
        </div>
      </div>

      {/* Product selection (AC #1) */}
      <div className="space-y-2">
        <Label htmlFor="template-product">Produto</Label>
        <Select
          value={selectedProduct?.id || "general"}
          onValueChange={handleProductChange}
          disabled={isLoadingProducts}
        >
          <SelectTrigger id="template-product" data-testid="template-product-select">
            <SelectValue placeholder="Selecione o produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">Contexto Geral</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          O contexto do produto selecionado sera usado na geracao do conteudo
        </p>
      </div>

      {/* Templates section (AC #1, #2) */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Templates Prontos</h3>

        {/* Loading state */}
        {isLoadingTemplates && (
          <div
            className="flex items-center justify-center py-8"
            data-testid="template-loading"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Carregando templates...
            </span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="template-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Erro ao carregar templates. Tente novamente.</span>
          </div>
        )}

        {/* Templates grid */}
        {!isLoadingTemplates && !error && templates && templates.length > 0 && (
          <div
            className="grid gap-3 sm:grid-cols-2"
            data-testid="template-grid"
          >
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={false}
                onSelect={onTemplateSelect}
              />
            ))}
          </div>
        )}

        {/* No templates state */}
        {!isLoadingTemplates && !error && (!templates || templates.length === 0) && (
          <div
            className="text-center py-6 text-sm text-muted-foreground"
            data-testid="template-empty"
          >
            Nenhum template disponivel no momento.
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t" />
        <span className="text-xs text-muted-foreground">ou</span>
        <div className="flex-1 border-t" />
      </div>

      {/* Custom campaign section (AC #5) */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Crie uma campanha personalizada</h3>
        <p className="text-sm text-muted-foreground">
          Configure os parametros e deixe a IA criar uma estrutura unica para voce
        </p>
        <Button
          variant="outline"
          onClick={onCustomClick}
          className="w-full gap-2"
          data-testid="template-custom-button"
        >
          <Pencil className="h-4 w-4" />
          Criar Campanha Personalizada
        </Button>
      </div>
    </div>
  );
}
