"use client";

/**
 * Tone of Voice Form Component
 * Story: 2.5 - Knowledge Base Editor - Tone & Examples
 *
 * AC: #1 - Tom de Voz section with preset selection and custom fields
 * AC: #2 - Save with success toast
 * AC: #3 - Previously saved data populated on load
 */

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToneOfVoice } from "@/hooks/use-tone-of-voice";
import {
  toneOfVoiceSchema,
  type ToneOfVoiceInput,
  TONE_PRESETS,
  TONE_PRESET_LABELS,
} from "@/types/knowledge-base";

/**
 * Loading skeleton for form fields
 */
function ToneOfVoiceSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-4 w-24 bg-foreground/10 rounded" />
        <div className="flex flex-col gap-2">
          <div className="h-6 w-32 bg-foreground/10 rounded" />
          <div className="h-6 w-28 bg-foreground/10 rounded" />
          <div className="h-6 w-36 bg-foreground/10 rounded" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-40 bg-foreground/10 rounded" />
        <div className="h-24 w-full bg-foreground/10 rounded" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-48 bg-foreground/10 rounded" />
        <div className="h-32 w-full bg-foreground/10 rounded" />
      </div>
      <div className="h-10 w-20 bg-foreground/10 rounded" />
    </div>
  );
}

export function ToneOfVoiceForm() {
  const { data, isLoading, saveTone, isSaving, error } = useToneOfVoice();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ToneOfVoiceInput>({
    resolver: zodResolver(toneOfVoiceSchema),
    defaultValues: {
      preset: "formal",
      custom_description: "",
      writing_guidelines: "",
    },
  });

  // Populate form with data when loaded
  useEffect(() => {
    if (data) {
      reset({
        preset: data.preset || "formal",
        custom_description: data.custom_description || "",
        writing_guidelines: data.writing_guidelines || "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: ToneOfVoiceInput) => {
    const result = await saveTone(values);
    if (result.success) {
      toast.success("Tom de voz salvo com sucesso");
    } else {
      toast.error(result.error || "Erro ao salvar. Tente novamente.");
    }
  };

  if (isLoading) {
    return <ToneOfVoiceSkeleton />;
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
        <Label className="block">Tom de comunicação</Label>
        <Controller
          name="preset"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              disabled={isSaving}
              className="flex flex-col space-y-2"
            >
              {TONE_PRESETS.map((preset) => (
                <div key={preset} className="flex items-center space-x-2">
                  <RadioGroupItem value={preset} id={`tone-${preset}`} />
                  <Label
                    htmlFor={`tone-${preset}`}
                    className="cursor-pointer font-normal"
                  >
                    {TONE_PRESET_LABELS[preset]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        />
        {errors.preset && (
          <p className="text-xs text-destructive">{errors.preset.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="custom_description" className="block">
          Descrição personalizada do tom
        </Label>
        <Textarea
          id="custom_description"
          {...register("custom_description")}
          rows={4}
          placeholder="Descreva como você quer que sua comunicação soe. Ex: Profissional mas acessível, direto ao ponto mas amigável..."
          disabled={isSaving}
          aria-invalid={!!errors.custom_description}
          aria-describedby={
            errors.custom_description ? "custom-desc-error" : undefined
          }
        />
        {errors.custom_description && (
          <p id="custom-desc-error" className="text-xs text-destructive">
            {errors.custom_description.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="writing_guidelines" className="block">
          Diretrizes de escrita
        </Label>
        <Textarea
          id="writing_guidelines"
          {...register("writing_guidelines")}
          rows={6}
          placeholder="Adicione regras específicas de escrita. Ex: Sempre usar 'você' ao invés de 'senhor', evitar jargões técnicos, usar frases curtas..."
          disabled={isSaving}
          aria-invalid={!!errors.writing_guidelines}
          aria-describedby={
            errors.writing_guidelines ? "guidelines-error" : undefined
          }
        />
        {errors.writing_guidelines && (
          <p id="guidelines-error" className="text-xs text-destructive">
            {errors.writing_guidelines.message}
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
