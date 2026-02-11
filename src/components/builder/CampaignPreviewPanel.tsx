/**
 * CampaignPreviewPanel Component
 * Story 5.8: Campaign Preview
 * Story 6.5.7: Premium Icebreaker Integration
 *
 * AC 5.8 #1: Abrir preview da campanha
 * AC 5.8 #5: Fechar preview e retornar a edicao
 * AC 5.8 #6: Estado vazio do preview
 * AC 6.5.7 #3: Premium icebreaker indicator in preview
 * AC 6.5.7 #6: Icebreaker source display with LinkedIn posts
 *
 * Sheet lateral para visualizar preview da campanha antes de exportar.
 */

"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Eye, Users, Mail, Clock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBuilderStore, BuilderBlock } from "@/stores/use-builder-store";
import { PreviewEmailStep } from "./PreviewEmailStep";
import { PreviewDelayStep } from "./PreviewDelayStep";
import { PreviewNavigation } from "./PreviewNavigation";
import { InteractiveTimeline, type TimelineItem } from "@/components/ui/interactive-timeline";
import { EmailBlockData } from "@/types/email-block";
import { DelayBlockData } from "@/types/delay-block";

interface CampaignPreviewPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignName: string;
  leadCount?: number;
}

/**
 * Helper to calculate step number (only emails count)
 */
function getStepNumber(blocks: BuilderBlock[], index: number): number | null {
  const block = blocks[index];
  if (block.type !== "email") return null;

  let emailCount = 0;
  for (let i = 0; i <= index; i++) {
    if (blocks[i].type === "email") emailCount++;
  }
  return emailCount;
}

/**
 * Campaign Preview Panel - Sheet lateral com preview da sequencia
 */
export function CampaignPreviewPanel({
  open,
  onOpenChange,
  campaignName,
  leadCount = 0,
}: CampaignPreviewPanelProps) {
  const blocks = useBuilderStore((state) => state.blocks);
  const previewLead = useBuilderStore((state) => state.previewLead);
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0);

  // Filter only email blocks for navigation
  const emailBlocks = blocks.filter((b) => b.type === "email");
  const totalEmails = emailBlocks.length;

  // Story 8.4: AC #6 - Build timeline items from builder blocks
  const timelineItems = useMemo((): TimelineItem[] => {
    let emailNum = 0;
    return blocks.map((block) => {
      if (block.type === "email") {
        emailNum++;
        const data = block.data as unknown as EmailBlockData;
        return {
          id: block.id,
          title: `Email ${emailNum}`,
          description: data.subject || "Sem assunto",
          icon: <Mail className="h-3 w-3" />,
        };
      }
      const data = block.data as unknown as DelayBlockData;
      return {
        id: block.id,
        title: "Intervalo",
        description: `${data.delayValue} ${data.delayUnit === "days" ? "dias" : "horas"}`,
        icon: <Clock className="h-3 w-3" />,
      };
    });
  }, [blocks]);

  // Reset index when panel opens
  useEffect(() => {
    if (open) {
      setCurrentEmailIndex(0);
    }
  }, [open]);

  // Keyboard navigation (AC #7)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && currentEmailIndex < totalEmails - 1) {
        setCurrentEmailIndex((prev) => prev + 1);
      } else if (e.key === "ArrowLeft" && currentEmailIndex > 0) {
        setCurrentEmailIndex((prev) => prev - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentEmailIndex, totalEmails]);

  const goToPrevious = useCallback(() => {
    if (currentEmailIndex > 0) {
      setCurrentEmailIndex((prev) => prev - 1);
    }
  }, [currentEmailIndex]);

  const goToNext = useCallback(() => {
    if (currentEmailIndex < totalEmails - 1) {
      setCurrentEmailIndex((prev) => prev + 1);
    }
  }, [currentEmailIndex, totalEmails]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-lg overflow-hidden flex flex-col"
        aria-label="Preview da campanha"
      >
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview da Campanha
          </SheetTitle>
          <SheetDescription className="flex flex-col gap-1">
            <span className="font-medium text-foreground">
              {campaignName || "Campanha sem nome"}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {leadCount} lead{leadCount !== 1 ? "s" : ""} associado
              {leadCount !== 1 ? "s" : ""}
            </span>
          </SheetDescription>
        </SheetHeader>

        {blocks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <Mail className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              Adicione blocos para visualizar o preview
            </p>
          </div>
        ) : (
          <>
            {/* Navigation header (AC #4) */}
            {totalEmails > 1 && (
              <PreviewNavigation
                currentIndex={currentEmailIndex}
                totalEmails={totalEmails}
                onPrevious={goToPrevious}
                onNext={goToNext}
              />
            )}

            {/* Preview content */}
            <ScrollArea className="flex-1">
              <div className="px-6 py-4 pb-6 space-y-4">
                {/* Story 8.4: AC #6 - Interactive timeline overview */}
                {timelineItems.length > 0 && (
                  <div className="mb-6 pb-4 border-b border-border">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                      Sequência da Campanha
                    </p>
                    <InteractiveTimeline items={timelineItems} />
                  </div>
                )}
                {blocks.map((block, index) => {
                  const stepNumber = getStepNumber(blocks, index);
                  const isCurrentEmail =
                    block.type === "email" &&
                    emailBlocks.indexOf(block) === currentEmailIndex;

                  if (block.type === "email") {
                    const data = block.data as unknown as EmailBlockData;
                    return (
                      <PreviewEmailStep
                        key={block.id}
                        stepNumber={stepNumber!}
                        subject={data.subject ?? ""}
                        body={data.body ?? ""}
                        isHighlighted={isCurrentEmail}
                        // Story 6.5.7: Pass icebreaker props for premium badge
                        hasPremiumIcebreaker={data.icebreakerSource === "premium"}
                        icebreakerPosts={data.icebreakerPosts}
                        // Story 7.1: Pass previewLead for variable resolution
                        previewLead={previewLead as Record<string, unknown> | null}
                      />
                    );
                  }

                  if (block.type === "delay") {
                    const data = block.data as unknown as DelayBlockData;
                    return (
                      <PreviewDelayStep
                        key={block.id}
                        delayValue={data.delayValue}
                        delayUnit={data.delayUnit}
                      />
                    );
                  }

                  return null;
                })}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
