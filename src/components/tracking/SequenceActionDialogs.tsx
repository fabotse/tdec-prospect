/**
 * Sequence Action Dialogs
 * Story 21.9: Controle Manual de Sequência por Lead (AC #5/#6)
 *
 * Dialogs de confirmação levantados para os containers (analytics page e
 * OpportunitiesPageContent), padrão DeleteLeadsDialog/dialogs de WhatsApp 21.5:
 *   - StopSequenceDialog  — confirmação com radio dos 2 motivos (compartilhado
 *     entre a LeadTrackingTable e o atalho do OpportunityCard);
 *   - RemoveLeadDialog    — destrutivo, com o aviso explícito exigido pelo AC#3.
 */

"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  SEQUENCE_STOP_REASON_LABELS,
  type SequenceStopReason,
} from "@/hooks/use-lead-sequence-action";

// ==============================================
// STOP SEQUENCE DIALOG
// ==============================================

interface StopSequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** E-mail (ou nome) do lead exibido na confirmação. */
  leadLabel: string;
  reason: SequenceStopReason;
  onReasonChange: (reason: SequenceStopReason) => void;
  onConfirm: () => void | Promise<void>;
  isPending: boolean;
}

export function StopSequenceDialog({
  open,
  onOpenChange,
  leadLabel,
  reason,
  onReasonChange,
  onConfirm,
  isPending,
}: StopSequenceDialogProps) {
  const handleConfirmClick = async (e: React.MouseEvent): Promise<void> => {
    // preventDefault ANTES do await (padrão DeleteLeadsDialog): o AlertDialog
    // fecharia sozinho e perderíamos o estado pendente.
    e.preventDefault();
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Parar sequência</AlertDialogTitle>
          <AlertDialogDescription>
            O Instantly deixa de enviar follow-ups desta campanha para{" "}
            {leadLabel}. A aplicação leva alguns instantes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup
          value={reason}
          onValueChange={(value) => onReasonChange(value as SequenceStopReason)}
          className="flex flex-col gap-2"
          data-testid="stop-reason-group"
        >
          {(
            Object.keys(SEQUENCE_STOP_REASON_LABELS) as SequenceStopReason[]
          ).map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`stop-reason-${value}`} />
              <Label htmlFor={`stop-reason-${value}`}>
                {SEQUENCE_STOP_REASON_LABELS[value]}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmClick}
            disabled={isPending}
            data-testid="confirm-stop-sequence"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parando...
              </>
            ) : (
              "Parar sequência"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ==============================================
// REMOVE LEAD DIALOG (destrutivo — AC#3)
// ==============================================

interface RemoveLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadLabel: string;
  onConfirm: () => void | Promise<void>;
  isPending: boolean;
}

export function RemoveLeadDialog({
  open,
  onOpenChange,
  leadLabel,
  onConfirm,
  isPending,
}: RemoveLeadDialogProps) {
  const handleConfirmClick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault();
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover do Instantly</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {leadLabel} e o histórico dele desta campanha no Instantly; a
            ação não pode ser desfeita. Os dados locais do lead na plataforma são
            preservados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmClick}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="confirm-remove-lead"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removendo...
              </>
            ) : (
              "Remover"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
