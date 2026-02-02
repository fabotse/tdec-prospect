"use client";

/**
 * Product Form Component
 * Story: 6.4 - Product Catalog CRUD
 *
 * AC: #3 - Form fields: Nome, Descrição, Características, Diferenciais, Público-alvo
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import {
  createProductSchema,
  type CreateProductInput,
  type Product,
} from "@/types/product";

interface ProductFormProps {
  product?: Product | null;
  onSubmit: (data: CreateProductInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ProductForm({
  product,
  onSubmit,
  onCancel,
  isSubmitting,
}: ProductFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      features: product?.features ?? "",
      differentials: product?.differentials ?? "",
      targetAudience: product?.targetAudience ?? "",
    },
  });

  const handleFormSubmit = handleSubmit(async (data) => {
    await onSubmit(data);
  });

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do produto</Label>
        <Input
          id="name"
          {...register("name")}
          placeholder="Ex: Software de CRM Empresarial"
          disabled={isSubmitting}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          {...register("description")}
          rows={4}
          placeholder="Explicação detalhada do que é o produto e como funciona..."
          disabled={isSubmitting}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="features">Características principais (opcional)</Label>
        <Textarea
          id="features"
          {...register("features")}
          rows={3}
          placeholder="Features, funcionalidades, o que o produto faz..."
          disabled={isSubmitting}
          aria-invalid={!!errors.features}
        />
        {errors.features && (
          <p className="text-xs text-destructive">{errors.features.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="differentials">Diferenciais (opcional)</Label>
        <Textarea
          id="differentials"
          {...register("differentials")}
          rows={3}
          placeholder="O que diferencia dos concorrentes..."
          disabled={isSubmitting}
          aria-invalid={!!errors.differentials}
        />
        {errors.differentials && (
          <p className="text-xs text-destructive">{errors.differentials.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="targetAudience">Público-alvo (opcional)</Label>
        <Textarea
          id="targetAudience"
          {...register("targetAudience")}
          rows={3}
          placeholder="Para quem é ideal, perfil do cliente..."
          disabled={isSubmitting}
          aria-invalid={!!errors.targetAudience}
        />
        {errors.targetAudience && (
          <p className="text-xs text-destructive">{errors.targetAudience.message}</p>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : product ? (
            "Salvar"
          ) : (
            "Adicionar"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
