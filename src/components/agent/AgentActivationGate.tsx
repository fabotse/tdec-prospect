"use client";

import { useState } from "react";
import { Rocket, Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// === Types ===

interface ExportPreviewData {
  externalCampaignId: string;
  campaignName: string;
  totalEmails: number;
  leadsUploaded: number;
  accountsAdded: number;
  platform: string;
}

interface AgentActivationGateProps {
  data: ExportPreviewData;
  executionId: string;
  stepNumber: number;
  onAction?: () => void;
}

// === Component ===

export function AgentActivationGate({
  data,
  executionId,
  stepNumber,
  onAction,
}: AgentActivationGateProps) {
  const [loading, setLoading] = useState<"activate" | "defer" | null>(null);
  const [actionTaken, setActionTaken] = useState<"activated" | "deferred" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = loading !== null || actionTaken !== null;

  const handleActivate = async () => {
    setLoading("activate");
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedData: { activate: true },
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao ativar");
      }
      setActionTaken("activated");
      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ativar");
      setLoading(null);
    }
  };

  const handleDefer = async () => {
    setLoading("defer");
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedData: { activate: false, deferred: true },
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao adiar ativacao");
      }
      setActionTaken("deferred");
      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adiar ativacao");
      setLoading(null);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Ativacao da Campanha</CardTitle>
        </div>
        <CardDescription>{data.campaignName}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Summary */}
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">{data.leadsUploaded}</span> leads exportados
          </p>
          <p>
            <span className="font-medium">{data.totalEmails}</span> emails na sequencia
          </p>
          <p>
            <span className="font-medium">{data.accountsAdded}</span> sending accounts
          </p>
          <p className="text-xs text-muted-foreground">
            Plataforma: {data.platform}
          </p>
        </div>

        <p className="text-sm">Quer ativar a campanha agora?</p>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive" data-testid="activation-gate-error">
            {error}
          </p>
        )}

        {/* Action taken feedback */}
        {actionTaken && (
          <p className="text-sm font-medium text-muted-foreground">
            {actionTaken === "activated"
              ? "✅ Campanha ativada"
              : "⏸️ Ativacao adiada — ative manualmente quando desejar"}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleActivate}
            disabled={isDisabled}
            size="sm"
            data-testid="activation-activate-btn"
          >
            {loading === "activate" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ativar Campanha
          </Button>
          <Button
            variant="outline"
            onClick={handleDefer}
            disabled={isDisabled}
            size="sm"
            data-testid="activation-defer-btn"
          >
            {loading === "defer" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ativar Depois
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
