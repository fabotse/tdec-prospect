/**
 * AI Campaign Wizard Component
 * Story 6.12: AI Campaign Structure Generation
 * Story 6.12.1: AI Full Campaign Generation
 * Story 6.13: Smart Campaign Templates
 *
 * AC #2 - Wizard form with campaign parameters
 * AC #3 - AI structure generation with loading animation
 * AC #5 - Error handling with retry option
 * AC 6.12.1 #1 - Strategy rationale display
 * AC 6.12.1 #2 - Full generation option
 * AC 6.12.1 #7 - Structure-only option
 * AC 6.13 #1 - Template selection as entry point
 * AC 6.13 #3 - Template preview with structure
 * AC 6.13 #4 - Template application to builder
 * AC 6.13 #5 - Custom structure fallback
 * AC 6.13 #7 - Full generation with templates
 */

"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
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
import { useAICampaignStructure, type GeneratedStructure } from "@/hooks/use-ai-campaign-structure";
import { useAIFullCampaignGeneration } from "@/hooks/use-ai-full-campaign-generation";
import { useCreateCampaign } from "@/hooks/use-campaigns";
import { useBuilderStore, type BuilderBlock } from "@/stores/use-builder-store";
import type { TonePreset } from "@/types/knowledge-base";
import type { CampaignTemplate } from "@/types/campaign-template";
import type { Product } from "@/types/product";
import { StrategySummary } from "./StrategySummary";
import { GenerationProgress } from "./GenerationProgress";
import { TemplateSelector } from "./TemplateSelector";
import { TemplatePreview } from "./TemplatePreview";

// ==============================================
// TYPES & CONSTANTS
// ==============================================

/**
 * Wizard steps
 * Story 6.13: Added template-selection and template-preview steps
 */
type WizardStep =
  | "template-selection"  // Story 6.13: Entry point
  | "template-preview"    // Story 6.13: Preview selected template
  | "form"                // Custom campaign form
  | "generating-structure"
  | "strategy-summary"
  | "generating-content";

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
// HELPER FUNCTIONS
// ==============================================

/**
 * Convert template structure to BuilderBlocks
 * Story 6.13 AC #4: Template application to builder
 */
function convertTemplateToBlocks(template: CampaignTemplate): BuilderBlock[] {
  const blocks: BuilderBlock[] = [];
  const structure = template.structureJson;

  structure.emails.forEach((email) => {
    // Add email block
    blocks.push({
      id: crypto.randomUUID(),
      type: "email",
      position: blocks.length,
      data: {
        subject: "",
        body: "",
        strategicContext: email.context,
        emailMode: email.emailMode,
      },
    });

    // Add delay block if exists
    const delay = structure.delays.find((d) => d.afterEmail === email.position);
    if (delay) {
      blocks.push({
        id: crypto.randomUUID(),
        type: "delay",
        position: blocks.length,
        data: {
          days: delay.days,
          hours: 0,
          minutes: 0,
        },
      });
    }
  });

  return blocks;
}

/**
 * Generate rationale text for template
 * Story 6.13 AC #7: Template rationale for strategy summary
 */
function generateTemplateRationale(template: CampaignTemplate): string {
  return `Estrutura baseada no template "${template.name}". ${template.description} Esta sequencia e otimizada para ${template.useCase.toLowerCase()}, com ${template.emailCount} emails distribuidos ao longo de ${template.totalDays} dias.`;
}

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
 * Loading animation during structure generation
 * AC #3 - "Analisando e criando sua campanha..." with animation
 */
function GeneratingStructureState() {
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
 * Story 6.12: Structure generation
 * Story 6.12.1: Full campaign generation with strategy summary
 * Story 6.13: Template selection as entry point
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
  const { loadBlocks, setProductId, setTemplateName } = useBuilderStore();
  const {
    generate: generateStructure,
    isGenerating: isGeneratingStructure,
    error: structureError,
    reset: resetStructureGeneration,
  } = useAICampaignStructure();
  const {
    generate: generateFullCampaign,
    isGenerating: isGeneratingContent,
    progress: generationProgress,
    error: contentError,
    cancel: cancelGeneration,
    reset: resetContentGeneration,
  } = useAIFullCampaignGeneration();

  // Wizard state - Story 6.13: Start at template-selection
  const [step, setStep] = useState<WizardStep>("template-selection");
  const [generatedStructure, setGeneratedStructure] = useState<GeneratedStructure | null>(null);
  const [formData, setFormData] = useState<WizardFormData | null>(null);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  // Story 6.13: Template state
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
  const [templateProduct, setTemplateProduct] = useState<Product | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
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

  // Compute email contexts for progress display
  const emailContexts = useMemo(() => {
    if (!generatedStructure?.blocks) return [];
    return generatedStructure.blocks
      .filter((b) => b.type === "email")
      .map((b) => {
        const data = b.data as { strategicContext?: string };
        return data.strategicContext || "Email";
      });
  }, [generatedStructure?.blocks]);

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
          id: product.id,
          name: product.name,
          description: product.description,
        });
      }
    },
    [form, products]
  );

  // Story 6.13: Handle template product change
  const handleTemplateProductChange = useCallback(
    (product: Product | null) => {
      setTemplateProduct(product);
      if (product) {
        setSelectedProduct({
          id: product.id,
          name: product.name,
          description: product.description,
        });
      } else {
        setSelectedProduct(null);
      }
    },
    []
  );

  // Story 6.13: Handle template selection -> preview
  const handleTemplateSelect = useCallback((template: CampaignTemplate) => {
    setSelectedTemplate(template);
    setStep("template-preview");
  }, []);

  // Story 6.13: Handle custom campaign click -> form
  const handleCustomClick = useCallback(() => {
    // Carry over product selection to form
    if (templateProduct) {
      form.setValue("productId", templateProduct.id);
    }
    setStep("form");
  }, [templateProduct, form]);

  // Story 6.13: Handle back from template preview
  const handleBackToTemplateSelection = useCallback(() => {
    setSelectedTemplate(null);
    setStep("template-selection");
  }, []);

  // Story 6.13 AC #4: Apply template -> strategy summary
  const handleApplyTemplate = useCallback(() => {
    if (!selectedTemplate) return;

    // Convert template to blocks
    const blocks = convertTemplateToBlocks(selectedTemplate);

    // Create GeneratedStructure from template
    const structure: GeneratedStructure = {
      blocks,
      rationale: generateTemplateRationale(selectedTemplate),
      totalEmails: selectedTemplate.emailCount,
      totalDays: selectedTemplate.totalDays,
    };

    setGeneratedStructure(structure);

    // Create form data from template
    const templateFormData: WizardFormData = {
      name: "",
      productId: templateProduct?.id || null,
      objective: "cold_outreach", // Default for templates
      description: "",
      tone: defaultTone,
      urgency: "medium",
    };
    setFormData(templateFormData);

    // Go to strategy summary (AC 6.13 #7)
    setStep("strategy-summary");
  }, [selectedTemplate, templateProduct, defaultTone]);

  // Step 1: Generate structure (AC #3) - for custom campaigns
  const onSubmit = useCallback(
    async (data: WizardFormData) => {
      try {
        setFormData(data);
        setStep("generating-structure");

        // Generate structure via AI
        const structure = await generateStructure({
          productId: data.productId,
          objective: data.objective,
          description: data.description || "",
          tone: data.tone,
          urgency: data.urgency,
        });

        setGeneratedStructure(structure);

        // Story 6.12.1 AC #7: Skip summary for single-email campaigns
        if (structure.totalEmails <= 1) {
          // Go directly to structure-only flow
          await handleStructureOnly(data, structure.blocks);
        } else {
          // Show strategy summary (AC 6.12.1 #1)
          setStep("strategy-summary");
        }
      } catch {
        // Error is handled by the hook
        setStep("form");
      }
    },
    [generateStructure]
  );

  // Step 2a: Full generation (AC 6.12.1 #2)
  const handleGenerateFull = useCallback(async () => {
    // Need campaign name for templates
    const campaignName = formData?.name || selectedTemplate?.name || "Campanha IA";

    if (!generatedStructure) return;

    try {
      setStep("generating-content");

      // Create campaign first
      setIsCreatingCampaign(true);
      const campaign = await createCampaign.mutateAsync({ name: campaignName });
      setIsCreatingCampaign(false);

      // Generate all email content
      const populatedBlocks = await generateFullCampaign({
        blocks: generatedStructure.blocks,
        campaignId: campaign.id,
        productId: selectedProduct?.id || null,
        productName: selectedProduct?.name || null,
        objective: formData?.objective || "cold_outreach",
        tone: formData?.tone || defaultTone,
      });

      // Load blocks into builder store (AC 6.12.1 #5: mark as AI-generated)
      loadBlocks(populatedBlocks, true);

      // Set product context if selected
      if (selectedProduct) {
        setProductId(selectedProduct.id, selectedProduct.name);
      }

      // Story 6.13 AC #4: Set template name if from template
      if (selectedTemplate) {
        setTemplateName(selectedTemplate.name);
      }

      toast.success("Campanha criada com IA!");
      resetWizard();
      onOpenChange(false);

      // Navigate to builder
      router.push(`/campaigns/${campaign.id}/edit`);
    } catch {
      // Error is handled by hook - stay on progress screen
      setIsCreatingCampaign(false);
    }
  }, [formData, generatedStructure, selectedProduct, selectedTemplate, defaultTone, createCampaign, generateFullCampaign, loadBlocks, setProductId, setTemplateName, onOpenChange, router]);

  // Step 2b: Structure only (AC 6.12.1 #7)
  const handleStructureOnly = useCallback(
    async (data?: WizardFormData, blocks?: BuilderBlock[]) => {
      const useData = data || formData;
      const useBlocks = blocks || generatedStructure?.blocks;
      const campaignName = useData?.name || selectedTemplate?.name || "Campanha IA";

      if (!useBlocks) return;

      try {
        setIsCreatingCampaign(true);

        // Create campaign
        const campaign = await createCampaign.mutateAsync({ name: campaignName });

        // Load blocks into builder store (empty content, AC 6.12.1 #5: mark as AI-generated)
        loadBlocks(useBlocks, true);

        // Set product context if selected
        if (selectedProduct) {
          setProductId(selectedProduct.id, selectedProduct.name);
        }

        // Story 6.13 AC #4: Set template name if from template
        if (selectedTemplate) {
          setTemplateName(selectedTemplate.name);
        }

        toast.success("Campanha criada com sucesso!");
        resetWizard();
        onOpenChange(false);

        // Navigate to builder
        router.push(`/campaigns/${campaign.id}/edit`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao criar campanha"
        );
      } finally {
        setIsCreatingCampaign(false);
      }
    },
    [formData, generatedStructure, selectedProduct, selectedTemplate, createCampaign, loadBlocks, setProductId, setTemplateName, onOpenChange, router]
  );

  // Handle back from strategy summary
  const handleBackToForm = useCallback(() => {
    // If from template, go back to template preview; otherwise, form
    if (selectedTemplate) {
      setStep("template-preview");
    } else {
      setStep("form");
    }
    setGeneratedStructure(null);
  }, [selectedTemplate]);

  // Handle cancel during generation
  const handleCancelGeneration = useCallback(async () => {
    cancelGeneration();

    // If we have partial results, save them
    if (generationProgress && generationProgress.completedEmails.length > 0) {
      const campaignName = formData?.name || selectedTemplate?.name || "Campanha IA";
      // Navigate to builder with partial content
      try {
        setIsCreatingCampaign(true);
        const campaign = await createCampaign.mutateAsync({ name: campaignName });

        // Update blocks with partial content
        const partialBlocks = generatedStructure?.blocks.map((block) => {
          if (block.type !== "email") return block;
          const completed = generationProgress.completedEmails.find(
            (e) => e.id === block.id
          );
          if (completed) {
            return {
              ...block,
              data: { ...block.data, subject: completed.subject, body: completed.body },
            };
          }
          return block;
        }) || [];

        loadBlocks(partialBlocks, true);

        if (selectedProduct) {
          setProductId(selectedProduct.id, selectedProduct.name);
        }

        if (selectedTemplate) {
          setTemplateName(selectedTemplate.name);
        }

        toast.success(
          `Campanha criada com ${generationProgress.completedEmails.length} emails gerados`
        );
        resetWizard();
        onOpenChange(false);
        router.push(`/campaigns/${campaign.id}/edit`);
      } catch {
        setStep("strategy-summary");
      } finally {
        setIsCreatingCampaign(false);
      }
    } else {
      setStep("strategy-summary");
    }
  }, [cancelGeneration, generationProgress, formData, selectedTemplate, generatedStructure, createCampaign, loadBlocks, setProductId, setTemplateName, selectedProduct, onOpenChange, router]);

  // Handle retry after error
  const handleRetryGeneration = useCallback(() => {
    resetContentGeneration();
    handleGenerateFull();
  }, [resetContentGeneration, handleGenerateFull]);

  // Reset wizard state
  const resetWizard = useCallback(() => {
    form.reset();
    resetStructureGeneration();
    resetContentGeneration();
    setSelectedProduct(null);
    setSelectedTemplate(null);
    setTemplateProduct(null);
    setStep("template-selection");
    setGeneratedStructure(null);
    setFormData(null);
    setIsCreatingCampaign(false);
  }, [form, resetStructureGeneration, resetContentGeneration]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetWizard();
      }
      onOpenChange(newOpen);
    },
    [resetWizard, onOpenChange]
  );

  const handleBack = useCallback(() => {
    resetWizard();
    onBack();
  }, [resetWizard, onBack]);

  // AC #5 - Retry on structure error
  const handleRetryStructure = useCallback(() => {
    resetStructureGeneration();
    setStep("form");
  }, [resetStructureGeneration]);

  // Get dialog title based on current step (for accessibility)
  const getDialogTitle = (): string => {
    switch (step) {
      case "template-selection":
        return "Criar Campanha com IA";
      case "template-preview":
        return `Preview: ${selectedTemplate?.name || "Template"}`;
      case "generating-structure":
        return "Gerando estrutura da campanha";
      case "strategy-summary":
        return "Resumo da estrategia";
      case "generating-content":
        return "Gerando conteudo da campanha";
      case "form":
        return "Campanha Personalizada";
      default:
        return "Criar Campanha com IA";
    }
  };

  // Determine current step to render
  const renderStep = () => {
    switch (step) {
      // Story 6.13: Template selection as entry point
      case "template-selection":
        return (
          <>
            <DialogTitle className="sr-only">{getDialogTitle()}</DialogTitle>
            <TemplateSelector
              products={products || []}
              isLoadingProducts={isLoadingProducts}
              selectedProduct={templateProduct}
              onProductChange={handleTemplateProductChange}
              onTemplateSelect={handleTemplateSelect}
              onCustomClick={handleCustomClick}
              onBack={handleBack}
            />
          </>
        );

      // Story 6.13: Template preview
      case "template-preview":
        if (!selectedTemplate) {
          return null;
        }
        return (
          <>
            <DialogTitle className="sr-only">{getDialogTitle()}</DialogTitle>
            <TemplatePreview
              template={selectedTemplate}
              selectedProduct={templateProduct}
              onApply={handleApplyTemplate}
              onBack={handleBackToTemplateSelection}
            />
          </>
        );

      case "generating-structure":
        return (
          <>
            <DialogTitle className="sr-only">{getDialogTitle()}</DialogTitle>
            <GeneratingStructureState />
          </>
        );

      case "strategy-summary":
        if (!generatedStructure) {
          return (
            <>
              <DialogTitle className="sr-only">{getDialogTitle()}</DialogTitle>
              <GeneratingStructureState />
            </>
          );
        }
        return (
          <>
            <DialogTitle className="sr-only">{getDialogTitle()}</DialogTitle>
            <StrategySummary
              rationale={generatedStructure.rationale}
              totalEmails={generatedStructure.totalEmails}
              totalDays={generatedStructure.totalDays}
              objective={formData?.objective || "cold_outreach"}
              onGenerateFull={handleGenerateFull}
              onStructureOnly={() => handleStructureOnly()}
              onBack={handleBackToForm}
              fullGenerationDisabled={generatedStructure.totalEmails <= 1}
              isGeneratingFull={isGeneratingContent}
              isCreatingStructure={isCreatingCampaign}
            />
          </>
        );

      case "generating-content":
        if (!generationProgress) {
          return (
            <>
              <DialogTitle className="sr-only">{getDialogTitle()}</DialogTitle>
              <GeneratingStructureState />
            </>
          );
        }
        return (
          <>
            <DialogTitle className="sr-only">{getDialogTitle()}</DialogTitle>
            <GenerationProgress
              currentStep={generationProgress.currentEmail}
              totalSteps={generationProgress.totalEmails}
              currentEmailContext={generationProgress.currentContext}
              completedEmails={generationProgress.completedEmails}
              emailContexts={emailContexts}
              onCancel={handleCancelGeneration}
              hasError={!!contentError}
              errorMessage={contentError || undefined}
              onRetry={handleRetryGeneration}
            />
          </>
        );

      case "form":
      default:
        return (
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setStep("template-selection")}
                  className="h-8 w-8"
                  data-testid="back-to-templates"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">Voltar aos templates</span>
                </Button>
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Campanha Personalizada
                  </DialogTitle>
                  <DialogDescription>
                    Preencha os parametros e deixe a IA criar a estrutura da campanha.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* AC #5 - Error message with retry */}
            {structureError && (
              <div
                className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="generation-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{structureError}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRetryStructure}
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
                disabled={isGeneratingStructure || createCampaign.isPending}
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
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
