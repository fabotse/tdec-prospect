"use client";

/**
 * Company Profile Form Component
 * Story: 2.4 - Knowledge Base Editor - Company Profile
 *
 * AC: #1 - Empresa section visible and editable
 * AC: #2 - Fields: Nome, Descrição, Produtos/serviços, Diferenciais
 * AC: #3 - Save with success toast
 * AC: #5 - Previously saved data populated on load
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useKnowledgeBase } from "@/hooks/use-knowledge-base";
import {
  companyProfileSchema,
  type CompanyProfileInput,
} from "@/types/knowledge-base";

/**
 * Loading skeleton for form fields
 */
function CompanyProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-4 w-24 bg-foreground/10 rounded" />
        <div className="h-10 w-full bg-foreground/10 rounded" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-32 bg-foreground/10 rounded" />
        <div className="h-24 w-full bg-foreground/10 rounded" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-40 bg-foreground/10 rounded" />
        <div className="h-24 w-full bg-foreground/10 rounded" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-36 bg-foreground/10 rounded" />
        <div className="h-24 w-full bg-foreground/10 rounded" />
      </div>
      <div className="h-10 w-20 bg-foreground/10 rounded" />
    </div>
  );
}

export function CompanyProfileForm() {
  const { data, isLoading, saveCompany, isSaving, error } = useKnowledgeBase();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyProfileInput>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      company_name: "",
      business_description: "",
      products_services: "",
      competitive_advantages: "",
    },
  });

  // Populate form with data when loaded
  useEffect(() => {
    if (data) {
      reset({
        company_name: data.company_name || "",
        business_description: data.business_description || "",
        products_services: data.products_services || "",
        competitive_advantages: data.competitive_advantages || "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: CompanyProfileInput) => {
    const result = await saveCompany(values);
    if (result.success) {
      toast.success("Informações da empresa salvas com sucesso");
    } else {
      toast.error(result.error || "Erro ao salvar. Tente novamente.");
    }
  };

  if (isLoading) {
    return <CompanyProfileSkeleton />;
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="company_name" className="block">
          Nome da empresa
        </Label>
        <Input
          id="company_name"
          {...register("company_name")}
          placeholder="Ex: TDEC Soluções"
          disabled={isSaving}
          aria-invalid={!!errors.company_name}
          aria-describedby={errors.company_name ? "company-name-error" : undefined}
        />
        {errors.company_name && (
          <p id="company-name-error" className="text-xs text-destructive">
            {errors.company_name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="business_description" className="block">
          Descrição do negócio
        </Label>
        <Textarea
          id="business_description"
          {...register("business_description")}
          rows={4}
          placeholder="Descreva o que sua empresa faz..."
          disabled={isSaving}
          aria-invalid={!!errors.business_description}
          aria-describedby={
            errors.business_description ? "business-desc-error" : undefined
          }
        />
        {errors.business_description && (
          <p id="business-desc-error" className="text-xs text-destructive">
            {errors.business_description.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="products_services" className="block">
          Produtos/serviços oferecidos
        </Label>
        <Textarea
          id="products_services"
          {...register("products_services")}
          rows={4}
          placeholder="Liste seus principais produtos ou serviços..."
          disabled={isSaving}
          aria-invalid={!!errors.products_services}
          aria-describedby={
            errors.products_services ? "products-error" : undefined
          }
        />
        {errors.products_services && (
          <p id="products-error" className="text-xs text-destructive">
            {errors.products_services.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="competitive_advantages" className="block">
          Diferenciais competitivos
        </Label>
        <Textarea
          id="competitive_advantages"
          {...register("competitive_advantages")}
          rows={4}
          placeholder="O que diferencia sua empresa da concorrência..."
          disabled={isSaving}
          aria-invalid={!!errors.competitive_advantages}
          aria-describedby={
            errors.competitive_advantages ? "advantages-error" : undefined
          }
        />
        {errors.competitive_advantages && (
          <p id="advantages-error" className="text-xs text-destructive">
            {errors.competitive_advantages.message}
          </p>
        )}
      </div>

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
