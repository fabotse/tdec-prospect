/**
 * Sheet lateral da preparação de reunião (um por página, controlado pelo pai)
 * Story: 24.23 - Preparação de reunião
 *
 * Abre com o briefing salvo. Sem briefing salvo, dispara a geração UMA vez ao abrir:
 * o clique em "Preparar reunião" é a intenção. O corpo só monta dentro do
 * `SheetContent`, então nada é chamado com o Sheet fechado.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMeetingPrep, type MeetingPrepResponse } from "@/hooks/use-meeting-prep";
import type { OpportunityCardData } from "@/hooks/use-opportunities";
import type { MeetingPrep } from "@/types/meeting-prep";
import { MeetingPrepPanel, meetingPrepReasonText } from "./MeetingPrepPanel";

export interface MeetingPrepSheetProps {
  opportunity: OpportunityCardData | null;
  onOpenChange: (open: boolean) => void;
}

function leadNameOf(opportunity: OpportunityCardData): string {
  const lead = opportunity.lead;
  return lead ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Lead" : "Lead não cadastrado";
}

function MeetingPrepSheetBody({
  opportunity,
  title,
}: {
  opportunity: OpportunityCardData;
  title: string;
}) {
  const { generate, regenerate, isGenerating } = useMeetingPrep(opportunity.id);
  const [prep, setPrep] = useState<MeetingPrep | null>(opportunity.meetingPrep ?? null);
  const [reason, setReason] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const requestedRef = useRef(false);

  const apply = (result: MeetingPrepResponse | null): boolean => {
    if (result?.meetingPrep) {
      setPrep(result.meetingPrep);
      setSaved(result.saved !== false);
      setReason(null);
      return true;
    }
    // `request_error` = falha de rede/HTTP (o texto genérico cobre).
    setReason(result?.reason ?? "request_error");
    return false;
  };

  const runGenerate = async () => {
    apply(await generate());
  };

  useEffect(() => {
    if (prep || requestedRef.current) return;
    requestedRef.current = true;
    void generate().then(apply);
    // Uma vez por abertura: o ref segura o StrictMode e os re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegenerate = async () => {
    setRegenerating(true);
    const result = await regenerate();
    setRegenerating(false);
    if (!result) return; // erro de rede/HTTP: o hook já deu o toast; o briefing anterior fica
    if (!apply(result) && prep) {
      // Fail-open com briefing anterior na tela: mantém o anterior e avisa.
      toast.error(meetingPrepReasonText(result.reason));
    }
  };

  return (
    <MeetingPrepPanel
      prep={prep}
      isLoading={!prep && (isGenerating || reason === null)}
      reason={reason}
      saved={saved}
      isRegenerating={regenerating}
      onRegenerate={handleRegenerate}
      onRetry={runGenerate}
      title={title}
    />
  );
}

export function MeetingPrepSheet({ opportunity, onOpenChange }: MeetingPrepSheetProps) {
  const leadName = opportunity ? leadNameOf(opportunity) : "";
  const company = opportunity?.lead?.companyName ?? null;
  const title = company || leadName || "lead";
  return (
    <Sheet open={Boolean(opportunity)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-xl"
        data-testid="meeting-prep-sheet"
      >
        <SheetHeader className="flex-shrink-0 border-b pr-12">
          <SheetTitle>Preparar reunião — {title}</SheetTitle>
          <SheetDescription>{leadName}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {opportunity && (
            <MeetingPrepSheetBody key={opportunity.id} opportunity={opportunity} title={title} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
