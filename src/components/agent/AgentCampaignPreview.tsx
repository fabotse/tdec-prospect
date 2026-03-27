"use client";

import { useState } from "react";
import { Megaphone, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { triggerNextStep } from "@/lib/agent/client-utils";

// === Types ===

interface EmailBlock {
  position: number;
  subject: string;
  body: string;
  emailMode: string;
}

interface LeadIcebreaker {
  name: string;
  companyName: string | null;
  icebreaker: string | null;
}

interface CampaignPreviewData {
  campaignName: string;
  structure: {
    totalEmails: number;
    totalDays: number;
  };
  emailBlocks: EmailBlock[];
  leadsWithIcebreakers: LeadIcebreaker[];
  icebreakerStats: {
    generated: number;
    failed: number;
    skipped: number;
  };
  totalLeads: number;
}

interface AgentCampaignPreviewProps {
  data: CampaignPreviewData;
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  onAction?: () => void;
}

// === Constants ===

const ICEBREAKER_COLLAPSE_THRESHOLD = 10;

// === Component ===

export function AgentCampaignPreview({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
}: AgentCampaignPreviewProps) {
  const [editedBlocks, setEditedBlocks] = useState<EmailBlock[]>(
    () => data.emailBlocks.map((b) => ({ ...b }))
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<"subject" | "body" | null>(null);
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [actionTaken, setActionTaken] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [icebreakerExpanded, setIcebreakerExpanded] = useState(
    data.leadsWithIcebreakers.length <= ICEBREAKER_COLLAPSE_THRESHOLD
  );

  const isDisabled = loading !== null || actionTaken !== null;

  const handleFieldClick = (index: number, field: "subject" | "body") => {
    if (isDisabled) return;
    setEditingIndex(index);
    setEditingField(field);
  };

  const handleFieldChange = (index: number, field: "subject" | "body", value: string) => {
    setEditedBlocks((prev) =>
      prev.map((block, i) => (i === index ? { ...block, [field]: value } : block))
    );
  };

  const handleFieldBlur = () => {
    setEditingIndex(null);
    setEditingField(null);
  };

  const handleApprove = async () => {
    setLoading("approve");
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedData: { emailBlocks: editedBlocks },
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao aprovar");
      }
      setActionTaken("approved");
      onAction?.();
      // Story 17.7 - AC #6: Auto-advance to next step after approval
      // Fire-and-forget: approval already saved, don't let trigger failure affect UI
      triggerNextStep(executionId, stepNumber, totalSteps).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar");
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading("reject");
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/reject`,
        { method: "POST" }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao rejeitar");
      }
      setActionTaken("rejected");
      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rejeitar");
      setLoading(null);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{data.campaignName}</CardTitle>
        </div>
        <CardDescription>
          {data.structure.totalEmails} emails · {data.structure.totalDays} dias · {data.totalLeads} leads
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Email Blocks */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Sequencia de Emails</p>
          {editedBlocks.map((block, index) => (
            <Card key={block.position} className="border-muted">
              <CardContent className="flex flex-col gap-2 p-3">
                <p className="text-xs text-muted-foreground font-medium">
                  Email {index + 1} ({block.emailMode === "initial" ? "Inicial" : "Follow-up"})
                </p>

                {/* Subject */}
                {editingIndex === index && editingField === "subject" ? (
                  <Input
                    value={block.subject}
                    onChange={(e) => handleFieldChange(index, "subject", e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFieldBlur();
                    }}
                    autoFocus
                    className="text-sm"
                    data-testid={`email-subject-input-${index}`}
                  />
                ) : (
                  <p
                    className={`text-sm font-medium border border-dashed border-muted-foreground/30 rounded px-2 py-1 ${
                      isDisabled ? "" : "cursor-pointer hover:border-primary/50"
                    }`}
                    onClick={() => handleFieldClick(index, "subject")}
                    data-testid={`email-subject-${index}`}
                  >
                    <span className="text-muted-foreground text-xs">Assunto: </span>
                    {block.subject}
                  </p>
                )}

                {/* Body */}
                {editingIndex === index && editingField === "body" ? (
                  <Textarea
                    value={block.body}
                    onChange={(e) => handleFieldChange(index, "body", e.target.value)}
                    onBlur={handleFieldBlur}
                    autoFocus
                    rows={4}
                    className="text-sm"
                    data-testid={`email-body-input-${index}`}
                  />
                ) : (
                  <p
                    className={`text-sm whitespace-pre-wrap border border-dashed border-muted-foreground/30 rounded px-2 py-1 ${
                      isDisabled ? "" : "cursor-pointer hover:border-primary/50"
                    }`}
                    onClick={() => handleFieldClick(index, "body")}
                    data-testid={`email-body-${index}`}
                  >
                    {block.body}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Icebreakers */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Icebreakers ({data.icebreakerStats.generated} gerados)
            </p>
            {data.leadsWithIcebreakers.length > ICEBREAKER_COLLAPSE_THRESHOLD && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIcebreakerExpanded((prev) => !prev)}
                className="h-6 px-2 text-xs"
                data-testid="icebreaker-toggle"
              >
                {icebreakerExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Recolher
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Expandir ({data.leadsWithIcebreakers.length})
                  </>
                )}
              </Button>
            )}
          </div>
          {icebreakerExpanded && (
            <div className="flex flex-col gap-1 text-sm" data-testid="icebreaker-list">
              {data.leadsWithIcebreakers.map((lead, idx) => (
                <div
                  key={`${lead.name}-${idx}`}
                  className="flex items-start justify-between border-b pb-1 last:border-b-0 gap-2"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{lead.name}</span>
                    {lead.companyName && (
                      <span className="text-xs text-muted-foreground truncate">
                        {lead.companyName}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground text-right shrink-0 max-w-[50%]">
                    {lead.icebreaker ?? "Sem icebreaker"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive" data-testid="campaign-preview-error">
            {error}
          </p>
        )}

        {/* Action taken feedback */}
        {actionTaken && (
          <p className="text-sm font-medium text-muted-foreground">
            {actionTaken === "approved" ? "✅ Campanha aprovada" : "❌ Campanha rejeitada"}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleApprove}
            disabled={isDisabled}
            size="sm"
            data-testid="campaign-approve-btn"
          >
            {loading === "approve" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aprovar
          </Button>
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={isDisabled}
            size="sm"
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
            data-testid="campaign-reject-btn"
          >
            {loading === "reject" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Rejeitar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
