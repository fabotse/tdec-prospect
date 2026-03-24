/**
 * StepPreviewPanel Component
 * Story 14.7: Painel Lateral com Preview dos Steps da Campanha
 *
 * AC: #1 — Sheet lateral ao clicar em "Step N"
 * AC: #2 — Exibe todos os steps com subject + body
 * AC: #3 — Step clicado destacado (isHighlighted)
 * AC: #4 — Scroll automatico ate step destacado
 * AC: #5 — Estado vazio gracioso
 * AC: #6 — Titulo "Steps da Campanha" + nome da campanha
 * AC: #7 — Fechar via X ou click fora
 */

"use client";

import { useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PreviewEmailStep } from "@/components/builder/PreviewEmailStep";
import type { CampaignStep } from "@/types/tracking";

interface StepPreviewPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: CampaignStep[];
  highlightedStep: number | null;
  campaignName: string;
}

export function StepPreviewPanel({
  open,
  onOpenChange,
  steps,
  highlightedStep,
  campaignName,
}: StepPreviewPanelProps) {
  const stepRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (open && highlightedStep != null) {
      const timer = setTimeout(() => {
        stepRefs.current.get(highlightedStep)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, highlightedStep]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-hidden flex flex-col"
        data-testid="step-preview-panel"
      >
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Steps da Campanha</SheetTitle>
          <SheetDescription>
            {campaignName}
            {steps.length > 0 && ` — ${steps.length} step${steps.length > 1 ? "s" : ""}`}
          </SheetDescription>
        </SheetHeader>

        {steps.length === 0 ? (
          <div
            data-testid="step-preview-empty"
            className="flex flex-col items-center justify-center py-12 gap-3 flex-1"
          >
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum step disponivel para esta campanha
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-6 py-4 pb-6 flex flex-col gap-4">
              {steps.map((step, index) => (
                <div
                  key={step.stepNumber}
                  ref={(el) => {
                    if (el) {
                      stepRefs.current.set(step.stepNumber, el);
                    } else {
                      stepRefs.current.delete(step.stepNumber);
                    }
                  }}
                >
                  <PreviewEmailStep
                    stepNumber={index + 1}
                    subject={step.subject}
                    body={typeof step.body === "string" ? step.body : ""}
                    isHighlighted={step.stepNumber === highlightedStep}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
