"use client";

/**
 * NotificationSettings Component
 * Story 21.7: Notificações Proativas + Configurações (AC3)
 *
 * Admin-only (layout AdminGuard + middleware). Configura: números WhatsApp destino (E.164,
 * múltiplos), canais on/off (WhatsApp / in-app / WhatsApp p/ engajamento), e quais intents
 * disparam WhatsApp. RHF + Zod (padrão IcebreakerExamplesForm/ICPDefinitionForm); TagInputField
 * (chips) + Switch; save desabilitado até isDirty; loading = Skeleton.
 *
 * Tailwind v4: wrappers label+input/switch usam `flex flex-col gap-*`, NUNCA `space-y-*`.
 */

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  OPPORTUNITY_INTENTS,
  OPPORTUNITY_INTENT_CONFIG,
  type OpportunityIntent,
} from "@/types/opportunity";

// ==============================================
// SCHEMA
// ==============================================

/** E.164 em dígitos (sem "+"): 10–15 dígitos — casa o formato enviado à Z-API. */
const PHONE_DIGITS = /^\d{10,15}$/;

const intentEnum = z.enum(
  OPPORTUNITY_INTENTS as unknown as [OpportunityIntent, ...OpportunityIntent[]]
);

const notificationSettingsSchema = z.object({
  whatsappNumbers: z.array(
    z.string().regex(PHONE_DIGITS, "Número inválido (use E.164, ex.: 5511999999999)")
  ),
  channels: z.object({
    whatsapp: z.boolean(),
    inApp: z.boolean(),
    whatsappEngagement: z.boolean(),
  }),
  notifyIntents: z.array(intentEnum),
});

type NotificationSettingsFormValues = z.infer<typeof notificationSettingsSchema>;

function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

// ==============================================
// COMPONENT
// ==============================================

export function NotificationSettings() {
  const { settings, isLoading, error, saveSettings } = useNotificationSettings();
  const [numberInput, setNumberInput] = useState("");

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<NotificationSettingsFormValues>({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues: {
      whatsappNumbers: DEFAULT_NOTIFICATION_SETTINGS.whatsappNumbers,
      channels: DEFAULT_NOTIFICATION_SETTINGS.channels,
      notifyIntents: DEFAULT_NOTIFICATION_SETTINGS.notifyIntents,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const whatsappNumbers = watch("whatsappNumbers");
  const notifyIntents = watch("notifyIntents");

  // Popula o form quando a config carrega (baseline do isDirty).
  useEffect(() => {
    if (settings) {
      reset({
        whatsappNumbers: settings.whatsappNumbers,
        channels: settings.channels,
        notifyIntents: settings.notifyIntents,
      });
    }
  }, [settings, reset]);

  const addNumber = () => {
    const sanitized = sanitizePhone(numberInput);
    if (!sanitized) return;
    if (!whatsappNumbers.includes(sanitized)) {
      setValue("whatsappNumbers", [...whatsappNumbers, sanitized], { shouldDirty: true });
    }
    setNumberInput("");
  };

  const removeNumber = (number: string) => {
    setValue(
      "whatsappNumbers",
      whatsappNumbers.filter((n) => n !== number),
      { shouldDirty: true }
    );
  };

  const onSubmit = (values: NotificationSettingsFormValues) => {
    saveSettings.mutate(values, {
      onSuccess: () => reset(values), // limpa o isDirty após salvar
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-4 rounded-md bg-destructive/10 border border-destructive/20"
        role="alert"
      >
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar configurações"}
        </p>
      </div>
    );
  }

  const isPending = saveSettings.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Canais */}
      <Card>
        <CardHeader>
          <CardTitle>Canais de notificação</CardTitle>
          <CardDescription>
            Escolha por onde receber o alerta quando surgir um lead quente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="channel-whatsapp">WhatsApp</Label>
              <p className="text-body-small text-foreground-muted">
                Envia o alerta por WhatsApp para os números configurados abaixo.
              </p>
            </div>
            <Controller
              control={control}
              name="channels.whatsapp"
              render={({ field }) => (
                <Switch
                  id="channel-whatsapp"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="channel-inapp">No aplicativo (sino)</Label>
              <p className="text-body-small text-foreground-muted">
                Registra a notificação no sino do topo, mesmo sem WhatsApp.
              </p>
            </div>
            <Controller
              control={control}
              name="channels.inApp"
              render={({ field }) => (
                <Switch
                  id="channel-inapp"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="channel-engagement">WhatsApp para engajamento</Label>
              <p className="text-body-small text-foreground-muted">
                Também dispara WhatsApp em aberturas/cliques (não só respostas). Desligado por
                padrão para evitar ruído.
              </p>
            </div>
            <Controller
              control={control}
              name="channels.whatsappEngagement"
              render={({ field }) => (
                <Switch
                  id="channel-engagement"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Números WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle>Números de WhatsApp destino</CardTitle>
          <CardDescription>
            Formato E.164, apenas dígitos (ex.: 5511999999999). Pressione Enter ou + para
            adicionar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsapp-number-input" className="sr-only">
              Adicionar número de WhatsApp
            </Label>
            <div className="flex gap-2">
              <Input
                id="whatsapp-number-input"
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNumber();
                  }
                }}
                placeholder="5511999999999"
                inputMode="numeric"
                className="flex-1"
                disabled={isPending}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addNumber}
                disabled={!numberInput.trim() || isPending}
                aria-label="Adicionar número"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {whatsappNumbers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2" aria-live="polite">
                {whatsappNumbers.map((number) => (
                  <Badge key={number} variant="secondary" className="flex items-center gap-1">
                    {number}
                    <button
                      type="button"
                      onClick={() => removeNumber(number)}
                      className="ml-1 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isPending}
                      aria-label={`Remover ${number}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {errors.whatsappNumbers && (
              <p className="text-xs text-destructive">
                {errors.whatsappNumbers.message ||
                  "Há um número inválido. Use o formato E.164 (ex.: 5511999999999)."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Intents que disparam WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle>Respostas que disparam WhatsApp</CardTitle>
          <CardDescription>
            Selecione as intenções de resposta que geram alerta por WhatsApp. As notificações no
            sino são criadas para toda oportunidade nova, independente desta seleção.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {OPPORTUNITY_INTENTS.map((intent) => (
                <div key={intent} className="flex items-center space-x-2">
                  <Checkbox
                    id={`notify-intent-${intent}`}
                    checked={notifyIntents.includes(intent)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setValue("notifyIntents", [...notifyIntents, intent], {
                          shouldDirty: true,
                        });
                      } else {
                        setValue(
                          "notifyIntents",
                          notifyIntents.filter((i) => i !== intent),
                          { shouldDirty: true }
                        );
                      }
                    }}
                    disabled={isPending}
                  />
                  <Label
                    htmlFor={`notify-intent-${intent}`}
                    className="text-body-small font-normal cursor-pointer"
                  >
                    {OPPORTUNITY_INTENT_CONFIG[intent].label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={!isDirty || isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar"
          )}
        </Button>
      </div>
    </form>
  );
}
