"use client";

import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { triggerNextStep } from "@/lib/agent/client-utils";

interface CompanyPreview {
  name: string;
  country: string;
  industry: string;
  employeeRange: string;
}

interface AgentApprovalGateProps {
  data: {
    totalFound: number;
    companies: CompanyPreview[];
    filtersApplied: Record<string, unknown>;
  };
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  onAction?: () => void;
}

export function AgentApprovalGate({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
}: AgentApprovalGateProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [actionTaken, setActionTaken] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading("approve");
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/approve`,
        { method: "POST" }
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

  const isDisabled = loading !== null || actionTaken !== null;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Revisao: Busca de Empresas</CardTitle>
        </div>
        <CardDescription>
          {data.totalFound} empresas encontradas
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2 text-sm">
          {data.companies.map((company) => (
            <li key={company.name} className="flex items-center justify-between border-b pb-1 last:border-b-0">
              <span className="font-medium">{company.name}</span>
              <span className="text-muted-foreground text-xs">
                {company.country} · {company.industry} · {company.employeeRange}
              </span>
            </li>
          ))}
        </ul>
        {data.totalFound > data.companies.length && (
          <p className="text-xs text-muted-foreground">
            +{data.totalFound - data.companies.length} mais empresas
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {actionTaken && (
          <p className="text-sm font-medium text-muted-foreground">
            {actionTaken === "approved" ? "✅ Aprovado" : "❌ Rejeitado"}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleApprove}
            disabled={isDisabled}
            size="sm"
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
          >
            {loading === "reject" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Rejeitar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
