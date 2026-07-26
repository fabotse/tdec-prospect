"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, SearchX } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { triggerNextStep } from "@/lib/agent/client-utils";
import { useAgentStore } from "@/stores/use-agent-store";
import type { EmptyCompanySearchDiagnosis } from "@/lib/agent/empty-search-diagnosis";

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
    /** Story 22.14 (AC1): a busca voltou sem nenhuma empresa. Escrito pelo step. */
    emptyResult?: boolean;
    /** Story 22.14 (AC5): diagnóstico MÍNIMO (sem chips — ver Trap #6). */
    emptyDiagnosis?: EmptyCompanySearchDiagnosis;
  };
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  onAction?: () => void;
  /**
   * Story 22.13 (AC5): rejeicao DURAVEL vinda de `message.metadata.rejected`.
   * Sobrevive a refetch/remount/refresh — o estado local abaixo nao sobrevivia.
   */
  rejected?: boolean;
}

export function AgentApprovalGate({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
  rejected,
}: AgentApprovalGateProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [localActionTaken, setLocalActionTaken] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setAdjustingStep = useAgentStore((s) => s.setAdjustingStep);

  // O sinal durável vence o local: um card carimbado como rejeitado no servidor volta
  // marcado (e desabilitado) mesmo depois de um F5.
  const actionTaken: "approved" | "rejected" | null = rejected
    ? "rejected"
    : localActionTaken;

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
      setLocalActionTaken("approved");
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
      setLocalActionTaken("rejected");
      // Story 22.13 (AC1): a resposta do usuario ganha um consumidor — o chat entra em
      // estado de AJUSTE deste step. Sem isto, "Rejeitar" era um beco sem saida.
      setAdjustingStep({
        executionId,
        stepNumber,
        stepType: "search_companies",
        phase: "describe",
      });
      // Story 22.13 (AC1): o spinner tambem para no SUCESSO. Antes so parava no erro —
      // o botao girava para sempre enquanto o usuario digitava o ajuste.
      setLoading(null);
      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rejeitar");
      setLoading(null);
    }
  };

  const isDisabled = loading !== null || actionTaken !== null;

  /**
   * Story 22.14 (AC5): aprovar ZERO empresas era possível — `disabled` só olhava
   * `isDisabled`. Quem aprovava seguia para o `search_leads`, que lançava "Lista de
   * empresas do step anterior e obrigatoria" e derrubava a execução. O guard é sobre a
   * LISTA (não sobre `totalFound`, que é metadado da API e pode divergir da página).
   */
  const hasNoCompanies = data.companies.length === 0;
  const diagnosis = data.emptyDiagnosis;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          {hasNoCompanies ? (
            <SearchX className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-primary" />
          )}
          <CardTitle className="text-base">
            {hasNoCompanies ? "Nenhuma empresa encontrada" : "Revisao: Busca de Empresas"}
          </CardTitle>
        </div>
        <CardDescription>
          {hasNoCompanies
            ? "A busca rodou, mas não retornou nenhuma empresa com os filtros abaixo."
            : `${data.totalFound} empresas encontradas`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hasNoCompanies ? (
          diagnosis ? (
            <>
              <section className="flex flex-col gap-2">
                <p className="text-sm font-medium">Filtros usados nesta busca</p>
                <ul className="flex flex-col gap-1.5">
                  {diagnosis.activeFilters.map((filterLine) => (
                    <li key={filterLine.label} className="text-sm">
                      <span className="text-muted-foreground">{filterLine.label}: </span>
                      <span className="font-medium">{filterLine.value}</span>
                      {filterLine.note && (
                        <p className="text-xs text-muted-foreground">{filterLine.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="flex flex-col gap-2">
                <p className="text-sm font-medium">Causas mais prováveis</p>
                <ol className="flex flex-col gap-1.5 list-decimal pl-5">
                  {diagnosis.probableCauses.map((cause) => (
                    <li key={cause.code} className="text-sm text-muted-foreground">
                      {cause.text}
                    </li>
                  ))}
                </ol>
              </section>
              <p className="text-sm text-muted-foreground">{diagnosis.guidance}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Rejeite a etapa e descreva o ajuste que quer fazer na busca de empresas.
            </p>
          )
        ) : (
          <>
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
          </>
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
            disabled={isDisabled || hasNoCompanies}
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
