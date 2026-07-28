"use client";

import { useState, useMemo } from "react";
import { ShieldCheck, Loader2, SearchX, AlertTriangle } from "lucide-react";
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
import { useAgentStore } from "@/stores/use-agent-store";
import type { AdjustmentChip, EmptySearchDiagnosis } from "@/lib/agent/empty-search-diagnosis";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

interface LeadPreview {
  name: string;
  title: string | null;
  companyName: string | null;
  email: string | null;
}

interface AgentLeadReviewProps {
  data: {
    totalFound: number;
    leads: LeadPreview[];
    jobTitles: string[];
    /** Story 22.14 (AC1): a busca voltou sem nenhum lead. Escrito pelo step. */
    emptyResult?: boolean;
    /** Story 22.14 (AC2): diagnóstico determinístico calculado no servidor. */
    emptyDiagnosis?: EmptySearchDiagnosis;
  };
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  onAction?: () => void;
  /** Story 22.13 (AC5): rejeicao DURAVEL vinda de `message.metadata.rejected`. */
  rejected?: boolean;
}

const LEAD_COUNT_OPTIONS = [50, 100, 200, 500];

export function AgentLeadReview({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
  rejected,
}: AgentLeadReviewProps) {
  // Story 17.12: local leads state (updated after fetch-more)
  const [localLeads, setLocalLeads] = useState<LeadPreview[]>(data.leads);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(data.leads.map((_, i) => i))
  );
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [localActionTaken, setLocalActionTaken] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setAdjustingStep = useAgentStore((s) => s.setAdjustingStep);
  // Story 22.14: sinais dos chips do empty-state. Os gates ja falam com o store
  // diretamente (padrao dos `handleReject`) — ver D4 no story file.
  const setPendingChipAdjustment = useAgentStore((s) => s.setPendingChipAdjustment);
  const setChatInputDraft = useAgentStore((s) => s.setChatInputDraft);
  const [chipLoading, setChipLoading] = useState<string | null>(null);

  // Story 22.13: o sinal durável (servidor) vence o local (some no remount).
  const actionTaken: "approved" | "rejected" | null = rejected
    ? "rejected"
    : localActionTaken;

  // Story 17.12: quantity selector state
  const [selectedQuantity, setSelectedQuantity] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasExpanded, setHasExpanded] = useState(false);

  const filteredLeads = useMemo(() => {
    if (!filter.trim()) return localLeads.map((lead, i) => ({ lead, index: i }));
    const lower = filter.toLowerCase();
    return localLeads
      .map((lead, i) => ({ lead, index: i }))
      .filter(
        ({ lead }) =>
          lead.name.toLowerCase().includes(lower) ||
          (lead.companyName?.toLowerCase().includes(lower) ?? false) ||
          (lead.title?.toLowerCase().includes(lower) ?? false)
      );
  }, [localLeads, filter]);

  const selectedCount = selectedIndices.size;
  const allFilteredSelected = filteredLeads.every(({ index }) => selectedIndices.has(index));

  const toggleAll = () => {
    const newSet = new Set(selectedIndices);
    if (allFilteredSelected) {
      filteredLeads.forEach(({ index }) => newSet.delete(index));
    } else {
      filteredLeads.forEach(({ index }) => newSet.add(index));
    }
    setSelectedIndices(newSet);
  };

  const toggleOne = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  // Story 17.12: fetch more leads
  const handleFetchMore = async () => {
    if (!selectedQuantity) return;
    setIsFetching(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/fetch-leads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ desiredCount: selectedQuantity }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Falha ao buscar leads");
      }
      const result = await response.json();
      const newLeads = result.data.leads as LeadPreview[];
      setLocalLeads(newLeads);
      setHasExpanded(true);
      setSelectedIndices(new Set(newLeads.map((_: LeadPreview, i: number) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar leads");
    } finally {
      setIsFetching(false);
    }
  };

  const handleApprove = async () => {
    setLoading("approve");
    setError(null);
    const selectedLeads = localLeads.filter((_, i) => selectedIndices.has(i));
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvedData: { leads: selectedLeads },
          }),
        }
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
      // Story 22.13 (AC1): entra em estado de ajuste deste step + para o spinner no sucesso.
      setAdjustingStep({ executionId, stepNumber, stepType: "search_leads", phase: "describe" });
      setLoading(null);
      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rejeitar");
      setLoading(null);
    }
  };

  const isDisabled = loading !== null || actionTaken !== null || chipLoading !== null;

  // ============================================================
  // Story 22.14 — empty-state de busca sem resultados
  // ============================================================

  /**
   * O gatilho e a LISTA, nunca `totalFound === 0` (Trap #5): uma pagina alem do fim devolve
   * lista vazia com total > 0 e o usuario continua sem nada na tela.
   *
   * `emptyResult` sozinho nao bastava (code review 22.14): o flag so existe em execucoes
   * criadas DEPOIS desta story, entao um gate legado ainda em `awaiting_approval` com
   * `leads: []` continuava renderizando tabela vazia + filtro + "Aprovar (0 leads)" — o P1
   * exato que esta story existe para matar. `data.leads.length === 0` cobre o passado e
   * satisfaz o Trap #5 igualmente, porque continua olhando a lista. O `AgentApprovalGate`
   * ja fazia assim (`companies.length === 0`); os dois cards agora concordam.
   */
  const isEmpty = data.emptyResult === true || (data.leads?.length ?? 0) === 0;
  const diagnosis = data.emptyDiagnosis;

  /**
   * Chip = REJEITAR + ajuste determinístico em um clique (D1).
   *
   * O `POST /reject` vem primeiro de propósito: ele carimba a rejeição de forma DURÁVEL
   * (`metadata.rejected`, 22.13 AC5), mata o card e liga o estado de ajuste — então um F5
   * no meio do caminho cai na reentrada que a 22.13 já resolveu, de graça.
   *
   * O que o chip NÃO faz: chamar `/execute`. Um clique PREPARA o ajuste; quem paga a
   * re-execução é a confirmação explícita depois do resumo de custo (D3 / Trap #2).
   */
  const handleChipClick = async (chip: AdjustmentChip) => {
    setChipLoading(chip.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/executions/${executionId}/steps/${stepNumber}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: chip.label }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error?.message ?? "Erro ao aplicar o ajuste");
      }

      setLocalActionTaken("rejected");
      setAdjustingStep({ executionId, stepNumber, stepType: "search_leads", phase: "describe" });

      if (chip.kind === "delta" && chip.delta) {
        // O AgentChat consome este sinal: briefing persistido + delta -> PATCH -> resumo
        // com custo -> fase "confirm".
        setPendingChipAdjustment({
          executionId,
          stepNumber,
          stepType: "search_leads",
          label: chip.label,
          delta: chip.delta,
        });
      } else if (chip.prefillText) {
        // Sem delta seguro (não inventamos geografia): o texto sugerido vai para o input e
        // o usuário envia, caindo no caminho de TEXTO da 22.13.
        setChatInputDraft(chip.prefillText);
      }

      onAction?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aplicar o ajuste");
    } finally {
      setChipLoading(null);
    }
  };

  if (isEmpty) {
    const chips = diagnosis?.suggestedChips ?? [];
    const chipsWithWarning = chips.filter((chip) => chip.warning);

    return (
      <Card className="border-primary/20" data-testid="agent-lead-review-empty">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SearchX className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Nenhum lead encontrado</CardTitle>
          </div>
          <CardDescription>
            A busca rodou, mas não retornou nenhum contato com os filtros abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {diagnosis ? (
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

              {chips.length > 0 && (
                <section className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-4">
                  <p className="text-sm font-medium">Ajustes rápidos</p>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip) => (
                      <Button
                        key={chip.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleChipClick(chip)}
                        disabled={isDisabled}
                        data-testid={`empty-chip-${chip.id}`}
                      >
                        {chipLoading === chip.id && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {chip.label}
                      </Button>
                    ))}
                  </div>
                  {chipsWithWarning.map((chip) => (
                    <p
                      key={`${chip.id}-warning`}
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-medium">{chip.label}:</span> {chip.warning}
                      </span>
                    </p>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Eu mostro o resumo e o custo antes de refazer a busca — nada é executado
                    só com o clique.
                  </p>
                </section>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Rejeite a etapa e descreva o ajuste que quer fazer nos filtros da busca.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {actionTaken && (
            <p className="text-sm font-medium text-muted-foreground">
              {actionTaken === "approved" ? "✅ Aprovado" : "❌ Rejeitado"}
            </p>
          )}

          {/* AC4: o caminho de TEXTO continua vivo e converge no mesmo `adjustingStep`. */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isDisabled}
              size="sm"
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
            >
              {loading === "reject" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rejeitar e ajustar por texto
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Revisao: Leads Encontrados</CardTitle>
        </div>
        <CardDescription>
          {selectedCount} de {data.totalFound} leads selecionados
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Story 17.12: quantity selector when more leads available */}
        {data.totalFound > localLeads.length && !hasExpanded && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {localLeads.length} de {data.totalFound} leads encontrados.
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Quantos leads deseja usar?</p>
              <div className="flex gap-2">
                {LEAD_COUNT_OPTIONS
                  .filter(opt => opt <= data.totalFound && opt > localLeads.length)
                  .map(opt => (
                    <Button
                      key={opt}
                      variant={selectedQuantity === opt ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedQuantity(opt)}
                      disabled={isFetching || isDisabled}
                    >
                      {opt}
                    </Button>
                  ))}
              </div>
              {selectedQuantity && (
                <p className="text-xs text-muted-foreground">
                  Custo estimado: ~{selectedQuantity} creditos Apollo
                </p>
              )}
              <Button
                onClick={handleFetchMore}
                disabled={!selectedQuantity || isFetching || isDisabled}
                size="sm"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Buscando mais leads...
                  </>
                ) : (
                  `Buscar ${selectedQuantity ?? "..."} leads`
                )}
              </Button>
            </div>
          </div>
        )}

        <Input
          placeholder="Filtrar por nome, empresa ou cargo..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={isDisabled}
        />

        <div className="max-h-64 overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected && filteredLeads.length > 0}
                    onCheckedChange={toggleAll}
                    disabled={isDisabled}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map(({ lead, index }) => (
                <TableRow key={`${lead.name}-${lead.email ?? index}`}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIndices.has(index)}
                      onCheckedChange={() => toggleOne(index)}
                      disabled={isDisabled}
                      aria-label={`Selecionar ${lead.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.title ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.companyName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{lead.email ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {actionTaken && (
          <p className="text-sm font-medium text-muted-foreground">
            {actionTaken === "approved" ? `✅ Aprovado (${selectedCount} leads)` : "❌ Rejeitado"}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleApprove}
            disabled={isDisabled || selectedCount === 0}
            size="sm"
          >
            {loading === "approve" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aprovar ({selectedCount} leads)
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
