/**
 * AI Campaign Wizard Component
 * Story 6.12: AI Campaign Structure Generation
 *
 * AC #2 - Wizard form with campaign parameters
 * AC #3 - AI structure generation with loading animation
 * AC #5 - Error handling with retry option
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ArrowLeft, HelpCircle, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useProducts } from "@/hooks/use-products";
import { useToneOfVoice } from "@/hooks/use-tone-of-voice";
import { useAICampaignStructure } from "@/hooks/use-ai-campaign-structure";
import { useCreateCampaign } from "@/hooks/use-campaigns";
import { useBuilderStore } from "@/stores/use-builder-store";
import type { TonePreset } from "@/types/knowledge-base";

// ==============================================
// TYPES & CONSTANTS
// ==============================================

/**
 * Campaign objectives
 * AC #2 - Dropdown: Cold Outreach, Reengajamento, Follow-up, Nutricao
 */
export const CAMPAIGN_OBJECTIVES = [
  { value: "cold_outreach", label: "Cold Outreach", description: "Primeiro contato com leads frios" },
  { value: "reengagement", label: "Reengajamento", description: "Leads que nao responderam antes" },
  { value: "follow_up", label: "Follow-up", description: "Dar continuidade a conversa iniciada" },
  { value: "nurture", label: "Nutricao", description: "Relacionamento de longo prazo" },
] as const;

export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number]["value"];

/**
 * Urgency levels
 * AC #2 - Dropdown: Baixa, Media, Alta
 */
export const URGENCY_LEVELS = [
  { value: "low", label: "Baixa", description: "Intervalos maiores entre emails" },
  { value: "medium", label: "Media", description: "Intervalos padrao" },
  { value: "high", label: "Alta", description: "Intervalos menores, mais agressivo" },
] as const;

export type UrgencyLevel = (typeof URGENCY_LEVELS)[number]["value"];

/**
 * Tone options
 * AC #2 - Dropdown: Formal, Casual, Tecnico (default from KB)
 */
export const TONE_OPTIONS = [
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "technical", label: "Tecnico" },
] as const;

// ==============================================
// FORM SCHEMA
// ==============================================

/**
 * Wizard form validation schema
 * AC #2 - Form fields with validation
 */
export const wizardFormSchema = z.object({
  name: z
    .string()
    .min(1, "Nome e obrigatorio")
    .max(200, "Nome deve ter no maximo 200 caracteres"),
  productId: z.string().nullable(),
  objective: z.enum(["cold_outreach", "reengagement", "follow_up", "nurture"]),
  description: z.string().max(2000, "Descricao deve ter no maximo 2000 caracteres").optional(),
  tone: z.enum(["formal", "casual", "technical"]),
  urgency: z.enum(["low", "medium", "high"]),
});

export type WizardFormData = z.infer<typeof wizardFormSchema>;

// ==============================================
// HELPER COMPONENTS
// ==============================================

/**
 * Field label with tooltip
 * AC #2 - Fields have helpful tooltips
 */
interface FieldLabelProps {
  htmlFor: string;
  label: string;
  tooltip: string;
  required?: boolean;
}

function FieldLabel({ htmlFor, label, tooltip, required = false }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="sr-only">Ajuda sobre {label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Loading animation during generation
 * AC #3 - "Analisando e criando sua campanha..." with animation
 */
function GeneratingState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-12"
      data-testid="generating-state"
    >
      <div className="relative">
        <Sparkles className="h-12 w-12 text-primary animate-pulse" />
        <div className="absolute inset-0 animate-ping">
          <Sparkles className="h-12 w-12 text-primary opacity-20" />
        </div>
      </div>
      <div className="text-center">
        <p className="font-medium">Analisando e criando sua campanha...</p>
        <p className="text-sm text-muted-foreground mt-1">
          A IA esta definindo a melhor estrutura para seu objetivo
        </p>
      </div>
    </div>
  );
}

// ==============================================
// MAIN COMPONENT
// ==============================================

interface AICampaignWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack: () => void;
}

/**
 * AI Campaign Wizard Component
 * AC #2 - Complete wizard form with all fields
 * AC #3 - Generation flow with loading state
 * AC #5 - Error handling
 */
export function AICampaignWizard({
  open,
  onOpenChange,
  onBack,
}: AICampaignWizardProps) {
  const router = useRouter();
  const { data: products, isLoading: isLoadingProducts } = useProducts();
  const { data: toneSettings } = useToneOfVoice();
  const createCampaign = useCreateCampaign();
  const { loadBlocks, setProductId } = useBuilderStore();
  const { generate, isGenerating, error: generationError, reset: resetGeneration } = useAICampaignStructure();

  const [selectedProduct, setSelectedProduct] = useState<{
    name: string;
    description: string;
  } | null>(null);

  // Default tone from KB settings (AC #2)
  const defaultTone: TonePreset = toneSettings?.preset || "formal";

  const form = useForm<WizardFormData>({
    resolver: zodResolver(wizardFormSchema),
    defaultValues: {
      name: "",
      productId: null,
      objective: "cold_outreach",
      description: "",
      tone: defaultTone,
      urgency: "medium",
    },
  });

  // Update form when KB tone loads
  useEffect(() => {
    if (toneSettings?.preset) {
      form.setValue("tone", toneSettings.preset);
    }
  }, [toneSettings?.preset, form]);

  // AC #2 - Show product description preview when selected
  const handleProductChange = useCallback(
    (productId: string) => {
      form.setValue("productId", productId === "general" ? null : productId);

      if (productId === "general") {
        setSelectedProduct(null);
        return;
      }

      const product = products?.find((p) => p.id === productId);
      if (product) {
        setSelectedProduct({
          name: product.name,
          description: product.description,
        });
      }
    },
    [form, products]
  );

  // AC #3, #4 - Generate campaign structure and create campaign
  const onSubmit = useCallback(
    async (data: WizardFormData) => {
      try {
        // 1. Generate structure via AI
        const structure = await generate({
          productId: data.productId,
          objective: data.objective,
          description: data.description || "",
          tone: data.tone,
          urgency: data.urgency,
        });

        // 2. Create campaign
        const campaign = await createCampaign.mutateAsync({ name: data.name });

        // 3. Load generated blocks into builder store
        loadBlocks(structure.blocks);

        // 4. Set product context if selected (Story 6.5)
        if (data.productId && selectedProduct) {
          setProductId(data.productId, selectedProduct.name);
        }

        toast.success("Campanha criada com sucesso!");
        form.reset();
        onOpenChange(false);

        // 5. Navigate to builder with pre-populated structure
        router.push(`/campaigns/${campaign.id}/edit`);
      } catch (error) {
        // Error is already handled by the hook
        if (!(error instanceof Error && error.message.includes("generation"))) {
          toast.error(
            error instanceof Error ? error.message : "Erro ao criar campanha"
          );
        }
      }
    },
    [generate, createCampaign, loadBlocks, setProductId, selectedProduct, form, onOpenChange, router]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        form.reset();
        resetGeneration();
        setSelectedProduct(null);
      }
      onOpenChange(newOpen);
    },
    [form, resetGeneration, onOpenChange]
  );

  const handleBack = useCallback(() => {
    form.reset();
    resetGeneration();
    setSelectedProduct(null);
    onBack();
  }, [form, resetGeneration, onBack]);

  // AC #5 - Retry on error
  const handleRetry = useCallback(() => {
    resetGeneration();
  }, [resetGeneration]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        {/* AC #3 - Loading state during generation */}
        {isGenerating ? (
          <GeneratingState />
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  className="h-8 w-8"
                  data-testid="back-to-selection"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Voltar</span>
                </Button>
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Criar com IA
                  </DialogTitle>
                  <DialogDescription>
                    Preencha os parametros e deixe a IA criar a estrutura da campanha.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* AC #5 - Error message with retry */}
            {generationError && (
              <div
                className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="generation-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{generationError}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRetry}
                  className="h-7 px-2"
                >
                  Tentar novamente
                </Button>
              </div>
            )}

            <div className="grid gap-4 py-4">
              {/* Nome da Campanha */}
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="campaign-name"
                  label="Nome da Campanha"
                  tooltip="Nome para identificar esta campanha na lista"
                  required
                />
                <Input
                  id="campaign-name"
                  placeholder="Ex: Prospeccao Q1 2026"
                  {...form.register("name")}
                  data-testid="wizard-campaign-name"
                  autoFocus
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              {/* Produto */}
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="product"
                  label="Produto"
                  tooltip="Selecione um produto para usar o contexto especifico dele na geracao, ou use o contexto geral da empresa"
                />
                <Controller
                  name="productId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value || "general"}
                      onValueChange={handleProductChange}
                      disabled={isLoadingProducts}
                    >
                      <SelectTrigger
                        id="product"
                        className="w-full"
                        data-testid="wizard-product-select"
                      >
                        <SelectValue placeholder="Selecione o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">Contexto Geral</SelectItem>
                        {products?.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {/* AC #2 - Product description preview */}
                {selectedProduct && (
                  <div
                    className="rounded-md bg-muted p-2 text-sm"
                    data-testid="product-preview"
                  >
                    <p className="text-muted-foreground line-clamp-3">
                      {selectedProduct.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Objetivo */}
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="objective"
                  label="Objetivo da Campanha"
                  tooltip="O objetivo determina a quantidade de emails e intervalos recomendados"
                  required
                />
                <Controller
                  name="objective"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="objective"
                        className="w-full"
                        data-testid="wizard-objective-select"
                      >
                        <SelectValue placeholder="Selecione o objetivo" />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_OBJECTIVES.map((obj) => (
                          <SelectItem key={obj.value} value={obj.value}>
                            <span className="font-medium">{obj.label}</span>
                            <span className="text-muted-foreground ml-1 text-xs">
                              - {obj.description}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Tom */}
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="tone"
                  label="Tom Desejado"
                  tooltip="O tom de voz que a IA usara para estruturar as mensagens"
                />
                <Controller
                  name="tone"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="tone"
                        className="w-full"
                        data-testid="wizard-tone-select"
                      >
                        <SelectValue placeholder="Selecione o tom" />
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((tone) => (
                          <SelectItem key={tone.value} value={tone.value}>
                            {tone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Urgencia */}
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="urgency"
                  label="Urgencia"
                  tooltip="Afeta os intervalos entre emails: baixa = mais espaco, alta = mais intenso"
                />
                <Controller
                  name="urgency"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="urgency"
                        className="w-full"
                        data-testid="wizard-urgency-select"
                      >
                        <SelectValue placeholder="Selecione a urgencia" />
                      </SelectTrigger>
                      <SelectContent>
                        {URGENCY_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            <span className="font-medium">{level.label}</span>
                            <span className="text-muted-foreground ml-1 text-xs">
                              - {level.description}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Descricao Adicional */}
              <div className="space-y-1.5">
                <FieldLabel
                  htmlFor="description"
                  label="Descricao Adicional"
                  tooltip="Informacoes extras que complementam o contexto do produto ou empresa"
                />
                <Textarea
                  id="description"
                  placeholder="Ex: Foco em empresas de tecnologia que estao expandindo..."
                  {...form.register("description")}
                  data-testid="wizard-description"
                  className="min-h-[80px] resize-none"
                />
                {form.formState.errors.description && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isGenerating || createCampaign.isPending}
                data-testid="generate-campaign-submit"
              >
                {createCampaign.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Gerar Campanha
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
