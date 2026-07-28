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
import { triggerNextStepChecked } from "@/lib/agent/client-utils";

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
  /**
   * Story 22.18 (AC3): desfecho DURAVEL vindo de `message.metadata.activationOutcome`.
   * Sobrevive a refetch/remount/refresh — o estado local abaixo nao sobrevivia, e o
   * card voltava com os botoes ativos sobre uma campanha ja ativa no Instantly.
   *
   * QUEM carimba (a regra que impede a AC3 de matar a AC2):
   * - `deferred` e carimbado pelo APPROVE (ali o approve *e* a acao completa);
   * - `activated` so e carimbado DEPOIS que a ativacao acontece de fato no Instantly
   *   (dentro do ActivateStep) — nunca no approve, que retorna antes de o `execute`
   *   sequer disparar;
   * - ativacao que FALHOU nao carimba nada: o card volta re-armado, senao a retomada
   *   da AC2 ficaria inalcancavel atras de um card desabilitado.
   */
  activationOutcome?: "activated" | "deferred";
}

// === Component ===

export function AgentActivationGate({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
  activationOutcome,
}: AgentActivationGateProps) {
  const [loading, setLoading] = useState<"activate" | "defer" | null>(null);
  const [localActionTaken, setLocalActionTaken] = useState<"activated" | "deferred" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  /** Story 22.18 (AC2): a acao foi RETOMADA a partir de um step ja aprovado. */
  const [resumed, setResumed] = useState(false);

  // O sinal durável vence o local (mesmo template do AgentApprovalGate da 22.13).
  const actionTaken: "activated" | "deferred" | null =
    activationOutcome ?? localActionTaken;

  const isDisabled = loading !== null || actionTaken !== null;
  const hasAccounts = Boolean(data.accounts && data.accounts.length > 0);
  const noAccountSelected = hasAccounts && selectedAccounts.size === 0;
  /**
   * Story 22.18 (AC6): ZERO conta de envio configurada no Instantly.
   *
   * Antes, `hasAccounts` e `noAccountSelected` eram ambos falsy nesse caso e o
   * `disabled={isDisabled || noAccountSelected}` deixava "Ativar Campanha" HABILITADO
   * — ativar uma campanha sem remetente conclui a execucao com "sucesso" sobre uma
   * campanha que nunca vai enviar nada. Adiar, ao contrario, e legitimo: exportar sem
   * ativar continua valendo.
   *
   * Story 22.18 (code review, P10): `[]` (sabemos que nao ha remetente) e diferente de
   * AUSENTE (nao sabemos) — a mesma distincao que o servidor faz com cuidado no
   * `emailList` do `getCampaignStatus`. Tratar os dois igual desabilitava para sempre o
   * "Ativar Campanha" de qualquer gate antigo cujo `previewData` foi gravado antes de o
   * campo `accounts` existir, sem outra saida alem de adiar. Quando nao sabemos,
   * deixamos passar: a guarda de SERVIDOR (AC6) ainda barra a campanha sem remetente,
   * e ela le o estado real da campanha em vez do preview.
   */
  const cannotActivate = Array.isArray(data.accounts) && data.accounts.length === 0;

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

  /**
   * Story 22.18 (AC1 + AC2): as duas acoes do gate passam pelo MESMO caminho.
   *
   * O gate faz duas chamadas em sequencia — `approve` (registra a decisao) e
   * `execute` (quem de fato ativa ou processa o adiamento). Antes, a segunda era
   * fire-and-forget SEM checar `ok`: o card exibia "✅ Campanha ativada" por cima de
   * um step de ativacao que nunca rodou.
   */
  const runGateAction = async (kind: "activate" | "defer") => {
    setLoading(kind);
    setError(null);
    setResumed(false);

    const fallbackMessage = kind === "activate" ? "Erro ao ativar" : "Erro ao adiar ativacao";
    const approvedData =
      kind === "activate"
        ? { activate: true, selectedAccounts: Array.from(selectedAccounts) }
        : {
            activate: false,
            deferred: true,
            selectedAccounts: Array.from(selectedAccounts),
          };

    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvedData }),
        }
      );

      if (!response.ok) {
        // Story 22.18 (code review, P6): corpo de erro pode nao ser JSON (HTML de gateway
        // 502/504, corpo vazio, pagina de crash). Sem esta guarda o `SyntaxError` escapava
        // pelo catch de baixo e o card renderizava `Unexpected token '<', "<!DOCTYPE"...`
        // no lugar de "Erro ao ativar". O mesmo parse ja e guardado em `client-utils.ts`.
        let errorData: unknown = null;
        try {
          errorData = await response.json();
        } catch {
          // corpo ausente/invalido — cai no `fallbackMessage` abaixo
        }
        const apiError = (
          errorData as
            | {
                error?: {
                  message?: string;
                  currentStatus?: string;
                  activationDeferred?: boolean;
                };
              }
            | null
        )?.error;

        // Story 22.18 (AC2): retomada de uma ativacao interrompida. O step ja esta
        // `approved` (o approve rodou antes de o `execute` falhar), entao repetir o
        // approve devolve 409 — e ate aqui o fluxo TRAVAVA nesse 409, sem caminho de
        // volta. Seguimos adiante SOMENTE com o discriminador estruturado do servidor
        // (`currentStatus`), nunca por match na mensagem em PT-BR: um step `running`
        // tratado como "siga adiante" viraria double-execute concorrente.
        if (apiError?.currentStatus === "approved") {
          // A intencao ja persistida manda. Retomar "Ativar Depois" como ativacao (ou
          // o contrario) trocaria a decisao registrada pelo usuario — no sentido
          // perigoso, ativaria de verdade uma campanha que ele mandou adiar.
          const persistedDeferred = apiError.activationDeferred === true;
          if (persistedDeferred !== (kind === "defer")) {
            throw new Error(
              persistedDeferred
                ? 'Esta etapa ja foi aprovada como "Ativar Depois". Use "Ativar Depois" para retomar de onde parou.'
                : 'Esta etapa ja foi aprovada como "Ativar Campanha". Use "Ativar Campanha" para retomar de onde parou.'
            );
          }
          // Story 22.18 (code review, P11): avisar ANTES, nao depois.
          //
          // O aviso so era ligado no caminho de sucesso — ou seja, o usuario remarcava as
          // contas, clicava, a campanha ativava com a selecao ANTIGA e so entao lia que a
          // selecao marcada nao havia sido reaplicada. Ligado aqui, ele aparece junto com
          // o resultado da retomada, e continua visivel se o `execute` falhar de novo.
          setResumed(true);
        } else {
          throw new Error(apiError?.message ?? fallbackMessage);
        }
      }

      const outcome = await triggerNextStepChecked(executionId, stepNumber, totalSteps);
      if (outcome.status === "failed") {
        setLoading(null);
        // Pos-orchestrator: o `sendErrorMessage` ja escreveu a bolha no chat — nao duplicar.
        if (!outcome.alreadyReported) setError(outcome.message);
        // `actionTaken` continua null: o card volta RE-ARMADO para tentar de novo.
        return;
      }

      setLocalActionTaken(kind === "activate" ? "activated" : "deferred");
      // Story 22.17 (AC1): o caminho de SUCESSO tambem precisa limpar `loading` — sem
      // isso o Loader2 girava para sempre ao lado do "✅ Campanha ativada". Os botoes
      // continuam desabilitados porque `isDisabled` tambem olha `actionTaken`.
      setLoading(null);
      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
      setLoading(null);
    }
  };

  const handleActivate = () => runGateAction("activate");
  const handleDefer = () => runGateAction("defer");

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

        {/* Story 22.18 (AC6): sem remetente nao ha ativacao possivel — diga por que. */}
        {cannotActivate && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="activation-no-accounts"
          >
            Nenhuma conta de envio configurada no Instantly — configure uma antes de
            ativar. Voce ainda pode adiar a ativacao e ativar manualmente depois.
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive" data-testid="activation-gate-error">
            {error}
          </p>
        )}

        {/* Story 22.18 (AC2): a retomada NAO remescla a selecao de contas — o approve
            nao roda de novo, entao vale a selecao ja persistida no step. Dizer isso
            evita o usuario achar que a selecao que ele acabou de marcar foi aplicada. */}
        {resumed && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="activation-gate-resumed"
          >
            Etapa ja aprovada antes — retomamos de onde parou usando a selecao de contas
            salva naquele momento (a selecao marcada agora nao foi reaplicada).
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
            disabled={isDisabled || noAccountSelected || cannotActivate}
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
