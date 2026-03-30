"use client";

import { useState, useMemo } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
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
  };
  executionId: string;
  stepNumber: number;
  totalSteps: number;
  onAction?: () => void;
}

const LEAD_COUNT_OPTIONS = [50, 100, 200, 500];

export function AgentLeadReview({
  data,
  executionId,
  stepNumber,
  totalSteps,
  onAction,
}: AgentLeadReviewProps) {
  // Story 17.12: local leads state (updated after fetch-more)
  const [localLeads, setLocalLeads] = useState<LeadPreview[]>(data.leads);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(data.leads.map((_, i) => i))
  );
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [actionTaken, setActionTaken] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
