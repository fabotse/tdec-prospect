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
import { Checkbox } from "@/components/ui/checkbox";
import { triggerNextStep } from "@/lib/agent/client-utils";

// === Types ===

interface ExportPreviewData {
  externalCampaignId: string;
  campaignName: string;
  totalEmails: number;
  leadsUploaded: number;
  accountsAdded: number;
  platform: string;
  accounts: Array<{ email: string; first_name?: string; last_name?: string }>;
}

interface AgentActivationGateProps {
  data: ExportPreviewData;
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  onAction?: () => void;
}

// === Component ===

export function AgentActivationGate({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
}: AgentActivationGateProps) {
  const [loading, setLoading] = useState<"activate" | "defer" | null>(null);
  const [actionTaken, setActionTaken] = useState<"activated" | "deferred" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  const isDisabled = loading !== null || actionTaken !== null;
  const hasAccounts = data.accounts && data.accounts.length > 0;
  const noAccountSelected = hasAccounts && selectedAccounts.size === 0;

  const toggleAccount = (email: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedAccounts.size === data.accounts.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(data.accounts.map((a) => a.email)));
    }
  };

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
            approvedData: {
              activate: true,
              selectedAccounts: Array.from(selectedAccounts),
            },
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao ativar");
      }
      setActionTaken("activated");
      onAction?.();
      // Story 17.7 - AC #6: Auto-advance (guard: won't trigger if last step)
      // Fire-and-forget: activation already saved, don't let trigger failure affect UI
      triggerNextStep(executionId, stepNumber, totalSteps).catch(() => {});
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
            approvedData: {
              activate: false,
              deferred: true,
              selectedAccounts: Array.from(selectedAccounts),
            },
          }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao adiar ativacao");
      }
      setActionTaken("deferred");
      onAction?.();
      // Trigger next step so orchestrator processes activationDeferred skip + completes execution
      triggerNextStep(executionId, stepNumber, totalSteps).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adiar ativacao");
      setLoading(null);
    }
  };

  const allSelected = hasAccounts && selectedAccounts.size === data.accounts.length;

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
          <p className="text-xs text-muted-foreground">
            Plataforma: {data.platform}
          </p>
        </div>

        {/* Account Selection (Story 17.9 AC #1) */}
        {hasAccounts && (
          <div className="flex flex-col gap-2" data-testid="account-selection">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Contas de envio ({selectedAccounts.size}/{data.accounts.length})
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                disabled={isDisabled}
                data-testid="account-toggle-all-btn"
                className="h-auto px-2 py-1 text-xs"
              >
                {allSelected ? "Limpar Selecao" : "Selecionar Todas"}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto rounded border p-2">
              {data.accounts.map((account) => {
                const label = [account.first_name, account.last_name]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <label
                    key={account.email}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                    data-testid={`account-item-${account.email}`}
                  >
                    <Checkbox
                      checked={selectedAccounts.has(account.email)}
                      onCheckedChange={() => toggleAccount(account.email)}
                      disabled={isDisabled}
                      aria-label={`Selecionar conta ${account.email}`}
                    />
                    <span className="flex flex-col">
                      {label && <span>{label}</span>}
                      <span className="text-xs text-muted-foreground">{account.email}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
            disabled={isDisabled || noAccountSelected}
            size="sm"
            data-testid="activation-activate-btn"
          >
            {loading === "activate" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ativar Campanha
          </Button>
          <Button
            variant="outline"
            onClick={handleDefer}
            disabled={isDisabled || noAccountSelected}
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
