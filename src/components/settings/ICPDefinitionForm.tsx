"use client";

/**
 * ICP Definition Form Component
 * Story: 2.6 - Knowledge Base Editor - ICP Definition
 *
 * AC: #1-#6 - All ICP fields with multi-select and tag inputs
 * AC: #7 - Save with success toast
 * AC: #8 - Previously saved data populated on load
 */

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useICPDefinition } from "@/hooks/use-icp-definition";
import {
  icpDefinitionSchema,
  type ICPDefinitionInput,
  COMPANY_SIZES,
  COMPANY_SIZE_LABELS,
  type CompanySize,
} from "@/types/knowledge-base";

/**
 * Loading skeleton for form fields
 */
function ICPFormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-4 w-40 bg-foreground/10 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6 w-full bg-foreground/10 rounded" />
          ))}
        </div>
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-32 bg-foreground/10 rounded" />
          <div className="h-10 w-full bg-foreground/10 rounded" />
        </div>
      ))}
      <div className="space-y-2">
        <div className="h-4 w-40 bg-foreground/10 rounded" />
        <div className="h-24 w-full bg-foreground/10 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-40 bg-foreground/10 rounded" />
        <div className="h-32 w-full bg-foreground/10 rounded" />
      </div>
      <div className="h-10 w-24 bg-foreground/10 rounded" />
    </div>
  );
}

/**
 * Tag Input Field Component
 */
function TagInputField({
  label,
  description,
  tags,
  inputValue,
  onInputChange,
  onAddTag,
  onRemoveTag,
  onKeyDown,
  placeholder,
  disabled,
}: {
  label: string;
  description: string;
  tags: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="mb-2 block">{label}</Label>
      <p className="text-body-small text-foreground-muted mb-2">{description}</p>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onAddTag}
          disabled={!inputValue.trim() || disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2" aria-live="polite">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="ml-1 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={disabled}
                aria-label={`Remover ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ICPDefinitionForm() {
  const { data, isLoading, saveICP, isSaving, error } = useICPDefinition();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ICPDefinitionInput>({
    resolver: zodResolver(icpDefinitionSchema),
    defaultValues: {
      company_sizes: [],
      industries: [],
      job_titles: [],
      geographic_focus: [],
      pain_points: "",
      common_objections: "",
    },
  });

  // State for tag inputs
  const [industryInput, setIndustryInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  // Watch arrays for real-time display
  const companySizes = watch("company_sizes");
  const industries = watch("industries");
  const jobTitles = watch("job_titles");
  const geographicFocus = watch("geographic_focus");

  // Populate form with data when loaded
  useEffect(() => {
    if (data) {
      reset({
        company_sizes: (data.company_sizes || []) as CompanySize[],
        industries: data.industries || [],
        job_titles: data.job_titles || [],
        geographic_focus: data.geographic_focus || [],
        pain_points: data.pain_points || "",
        common_objections: data.common_objections || "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: ICPDefinitionInput) => {
    const result = await saveICP(values);
    if (result.success) {
      toast.success("ICP salvo com sucesso");
    } else {
      toast.error(result.error || "Erro ao salvar. Tente novamente.");
    }
  };

  // Tag management functions
  const addTag = (
    field: "industries" | "job_titles" | "geographic_focus",
    value: string,
    currentValues: string[]
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (!currentValues.includes(trimmed)) {
      setValue(field, [...currentValues, trimmed]);
    }
  };

  const removeTag = (
    field: "industries" | "job_titles" | "geographic_focus",
    value: string,
    currentValues: string[]
  ) => {
    setValue(
      field,
      currentValues.filter((v) => v !== value)
    );
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: "industries" | "job_titles" | "geographic_focus",
    value: string,
    currentValues: string[],
    clearInput: () => void
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(field, value, currentValues);
      clearInput();
    }
  };

  if (isLoading) {
    return <ICPFormSkeleton />;
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-md bg-destructive/10 border border-destructive/20"
        role="alert"
      >
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Company Sizes - Checkbox Group */}
      <div className="space-y-3">
        <Label className="text-body font-medium">Tamanho da Empresa</Label>
        <p className="text-body-small text-foreground-muted">
          Selecione os tamanhos de empresa que você atende
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {COMPANY_SIZES.map((size) => (
            <div key={size} className="flex items-center space-x-2">
              <Checkbox
                id={`company-size-${size}`}
                checked={companySizes?.includes(size)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setValue("company_sizes", [...(companySizes || []), size]);
                  } else {
                    setValue(
                      "company_sizes",
                      (companySizes || []).filter((s) => s !== size)
                    );
                  }
                }}
                disabled={isSaving}
              />
              <Label
                htmlFor={`company-size-${size}`}
                className="text-body-small font-normal cursor-pointer"
              >
                {COMPANY_SIZE_LABELS[size]}
              </Label>
            </div>
          ))}
        </div>
        {errors.company_sizes && (
          <p className="text-xs text-destructive">{errors.company_sizes.message}</p>
        )}
      </div>

      {/* Industries - Tag Input */}
      <TagInputField
        label="Setores/Indústrias"
        description="Adicione os setores que você atende (pressione Enter para adicionar)"
        tags={industries || []}
        inputValue={industryInput}
        onInputChange={setIndustryInput}
        onAddTag={() => {
          addTag("industries", industryInput, industries || []);
          setIndustryInput("");
        }}
        onRemoveTag={(tag) => removeTag("industries", tag, industries || [])}
        onKeyDown={(e) =>
          handleKeyDown(e, "industries", industryInput, industries || [], () => setIndustryInput(""))
        }
        placeholder="Ex: Tecnologia, SaaS, Fintech"
        disabled={isSaving}
      />

      {/* Job Titles - Tag Input */}
      <TagInputField
        label="Cargos Alvo"
        description="Adicione os cargos que você busca alcançar"
        tags={jobTitles || []}
        inputValue={titleInput}
        onInputChange={setTitleInput}
        onAddTag={() => {
          addTag("job_titles", titleInput, jobTitles || []);
          setTitleInput("");
        }}
        onRemoveTag={(tag) => removeTag("job_titles", tag, jobTitles || [])}
        onKeyDown={(e) =>
          handleKeyDown(e, "job_titles", titleInput, jobTitles || [], () => setTitleInput(""))
        }
        placeholder="Ex: CEO, CTO, VP de Vendas"
        disabled={isSaving}
      />

      {/* Geographic Focus - Tag Input */}
      <TagInputField
        label="Foco Geográfico"
        description="Adicione as regiões/localidades que você atende"
        tags={geographicFocus || []}
        inputValue={locationInput}
        onInputChange={setLocationInput}
        onAddTag={() => {
          addTag("geographic_focus", locationInput, geographicFocus || []);
          setLocationInput("");
        }}
        onRemoveTag={(tag) => removeTag("geographic_focus", tag, geographicFocus || [])}
        onKeyDown={(e) =>
          handleKeyDown(e, "geographic_focus", locationInput, geographicFocus || [], () =>
            setLocationInput("")
          )
        }
        placeholder="Ex: São Paulo, Brasil, América Latina"
        disabled={isSaving}
      />

      {/* Pain Points - Textarea */}
      <div className="space-y-2">
        <Label htmlFor="pain_points" className="mb-2 block">
          Dores que Resolvemos
        </Label>
        <p className="text-body-small text-foreground-muted mb-2">
          Descreva as principais dores/problemas que sua solução resolve
        </p>
        <Textarea
          id="pain_points"
          {...register("pain_points")}
          rows={4}
          placeholder={`- Dificuldade em escalar prospecção\n- Textos genéricos que não convertem\n- Alto tempo gasto em pesquisa manual`}
          className="resize-none"
          disabled={isSaving}
        />
        {errors.pain_points && (
          <p className="text-xs text-destructive">{errors.pain_points.message}</p>
        )}
      </div>

      {/* Common Objections - Textarea */}
      <div className="space-y-2">
        <Label htmlFor="common_objections" className="mb-2 block">
          Objeções Comuns
        </Label>
        <p className="text-body-small text-foreground-muted mb-2">
          Liste objeções comuns e como respondê-las
        </p>
        <Textarea
          id="common_objections"
          {...register("common_objections")}
          rows={6}
          placeholder={`- 'Já usamos outra ferramenta'\n  Resposta: Nossa solução complementa...\n\n- 'Parece caro'\n  Resposta: Considere o ROI...`}
          className="resize-none"
          disabled={isSaving}
        />
        {errors.common_objections && (
          <p className="text-xs text-destructive">
            {errors.common_objections.message}
          </p>
        )}
      </div>

      {/* Save Button */}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          "Salvar"
        )}
      </Button>
    </form>
  );
}
