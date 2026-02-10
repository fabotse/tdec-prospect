/**
 * PhoneLookupDialog Component
 * Story 11.5: Busca de Telefone no Fluxo de Leads Quentes
 *
 * AC #2 — Dialog com info do lead e duas opções
 * AC #3 — Busca via SignalHire com usePhoneLookup
 * AC #4 — Inserir telefone manualmente com validação
 * AC #7 — SignalHire não configurado → botão desabilitado
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { Search, Phone, Loader2, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePhoneLookup } from "@/hooks/use-phone-lookup";
import { toast } from "sonner";

// ==============================================
// TYPES
// ==============================================

export interface PhoneLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    leadEmail: string;
    firstName?: string;
    lastName?: string;
    leadId?: string;
  };
  onPhoneFound: (phone: string) => void;
}

// ==============================================
// CONSTANTS
// ==============================================

const PHONE_REGEX = /^\+?\d{10,15}$/;

// ==============================================
// COMPONENT
// ==============================================

export function PhoneLookupDialog({
  open,
  onOpenChange,
  lead,
  onPhoneFound,
}: PhoneLookupDialogProps) {
  const [mode, setMode] = useState<"choose" | "signalhire" | "manual">("choose");
  const [manualPhone, setManualPhone] = useState("");
  const [manualError, setManualError] = useState("");
  const [lookupResult, setLookupResult] = useState<"success" | "not_found" | "error" | null>(null);
  const [lookupErrorMessage, setLookupErrorMessage] = useState("");
  const [foundPhone, setFoundPhone] = useState("");
  const [isSavingManual, setIsSavingManual] = useState(false);

  const { lookupPhoneAsync, isLoading, reset } = usePhoneLookup({
    leadId: lead.leadId,
    saveToDatabase: Boolean(lead.leadId),
    invalidateLeads: Boolean(lead.leadId),
    showSuccessToast: false,
    showErrorToast: false,
  });

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setMode("choose");
      setManualPhone("");
      setManualError("");
      setLookupResult(null);
      setLookupErrorMessage("");
      setFoundPhone("");
      setIsSavingManual(false);
      reset();
    }
  }, [open, reset]);

  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.leadEmail;

  // ==============================================
  // SIGNALHIRE LOOKUP
  // ==============================================

  const handleSignalHireLookup = useCallback(async () => {
    setMode("signalhire");
    setLookupResult(null);
    setLookupErrorMessage("");

    try {
      const result = await lookupPhoneAsync({
        identifier: lead.leadEmail,
        leadId: lead.leadId,
      });

      // lookupPhoneAsync only resolves when phone is found (hook throws on not_found/error)
      setFoundPhone(result.phone!);
      setLookupResult("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";

      if (message.includes("não encontrado") || message.includes("Telefone não encontrado")) {
        setLookupResult("not_found");
      } else {
        setLookupResult("error");
        setLookupErrorMessage(message);
      }
    }
  }, [lookupPhoneAsync, lead.leadEmail, lead.leadId]);

  const handleConfirmFound = useCallback(() => {
    if (foundPhone) {
      onPhoneFound(foundPhone);
    }
  }, [foundPhone, onPhoneFound]);

  // ==============================================
  // MANUAL INPUT
  // ==============================================

  const handleManualPhoneChange = useCallback((value: string) => {
    setManualPhone(value);
    if (value && !PHONE_REGEX.test(value)) {
      setManualError("Formato inválido. Ex: +5511999999999");
    } else {
      setManualError("");
    }
  }, []);

  const handleManualSave = useCallback(async () => {
    if (!PHONE_REGEX.test(manualPhone)) return;

    // Save to DB if leadId available
    if (lead.leadId) {
      setIsSavingManual(true);
      try {
        const response = await fetch(`/api/leads/${lead.leadId}/phone`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: manualPhone }),
        });
        if (!response.ok) {
          toast.warning("Telefone salvo apenas na sessão — falha ao persistir no banco");
        }
      } finally {
        setIsSavingManual(false);
      }
    }

    onPhoneFound(manualPhone);
  }, [manualPhone, lead.leadId, onPhoneFound]);

  const isManualValid = PHONE_REGEX.test(manualPhone);

  // ==============================================
  // RENDER
  // ==============================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="phone-lookup-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buscar Telefone</DialogTitle>
          <DialogDescription data-testid="phone-lookup-lead-info">
            {leadName} — {lead.leadEmail}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* CHOOSE MODE */}
          {mode === "choose" && (
            <div data-testid="phone-lookup-choose-mode" className="flex flex-col gap-3">
              <Button
                data-testid="phone-lookup-signalhire-button"
                onClick={handleSignalHireLookup}
                className="w-full"
              >
                <Search className="h-4 w-4 mr-2" />
                Buscar via SignalHire
              </Button>
              <Button
                data-testid="phone-lookup-manual-button"
                variant="outline"
                onClick={() => setMode("manual")}
                className="w-full"
              >
                <Phone className="h-4 w-4 mr-2" />
                Inserir manualmente
              </Button>
            </div>
          )}

          {/* SIGNALHIRE MODE */}
          {mode === "signalhire" && (
            <div data-testid="phone-lookup-signalhire-mode" className="flex flex-col gap-3">
              {isLoading && (
                <div data-testid="phone-lookup-loading" className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Buscando telefone...</span>
                </div>
              )}

              {lookupResult === "success" && (
                <div data-testid="phone-lookup-success" className="flex flex-col gap-3 items-center py-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <Check className="h-5 w-5" />
                    <span className="text-sm font-medium">Telefone encontrado</span>
                  </div>
                  <span data-testid="phone-lookup-found-phone" className="text-lg font-mono">{foundPhone}</span>
                  <Button
                    data-testid="phone-lookup-confirm-button"
                    onClick={handleConfirmFound}
                    className="w-full"
                  >
                    Confirmar e usar telefone
                  </Button>
                </div>
              )}

              {lookupResult === "not_found" && (
                <div data-testid="phone-lookup-not-found" className="flex flex-col gap-3 items-center py-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">Telefone não encontrado no SignalHire</span>
                  </div>
                  <Button
                    data-testid="phone-lookup-try-manual-button"
                    variant="outline"
                    onClick={() => setMode("manual")}
                    className="w-full"
                  >
                    Inserir manualmente
                  </Button>
                </div>
              )}

              {lookupResult === "error" && (
                <div data-testid="phone-lookup-error" className="flex flex-col gap-3 items-center py-4">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span data-testid="phone-lookup-error-message" className="text-sm">{lookupErrorMessage}</span>
                  </div>
                  <Button
                    data-testid="phone-lookup-try-manual-button"
                    variant="outline"
                    onClick={() => setMode("manual")}
                    className="w-full"
                  >
                    Inserir manualmente
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* MANUAL MODE */}
          {mode === "manual" && (
            <div data-testid="phone-lookup-manual-mode" className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <label htmlFor="manual-phone" className="text-sm font-medium">
                  Telefone
                </label>
                <Input
                  id="manual-phone"
                  data-testid="phone-lookup-manual-input"
                  placeholder="+5511999999999"
                  value={manualPhone}
                  onChange={(e) => handleManualPhoneChange(e.target.value)}
                />
                {manualError && (
                  <p data-testid="phone-lookup-manual-error" className="text-xs text-destructive">
                    {manualError}
                  </p>
                )}
              </div>
              <Button
                data-testid="phone-lookup-manual-save-button"
                onClick={handleManualSave}
                disabled={!isManualValid || isSavingManual}
                className="w-full"
              >
                {isSavingManual ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Salvar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
