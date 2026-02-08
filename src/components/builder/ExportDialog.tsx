/**
 * Export Dialog Component
 * Story 7.4: Export Dialog UI com Preview de Variáveis
 * AC: #1 - Platform selection with status badges
 * AC: #3 - Lead selection with email validation
 * AC: #5 - Previous export indicator with re-export/update actions
 */

"use client";

import { useState, useCallback } from "react";
import { Settings, Upload, RefreshCw, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExportPreview } from "./ExportPreview";
import { SendingAccountSelector } from "./SendingAccountSelector";
import { useSendingAccounts } from "@/hooks/use-sending-accounts";
import type {
  ExportPlatform,
  ExportDialogPlatformOption,
  LeadExportSummary,
  ExportRecord,
  ExportConfig,
  LeadSelection,
  ExportMode,
} from "@/types/export";
import type { BuilderBlock } from "@/stores/use-builder-store";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  blocks: BuilderBlock[];
  platformOptions: ExportDialogPlatformOption[];
  leadSummary: LeadExportSummary;
  previousExport: ExportRecord | null;
  onExport: (config: ExportConfig) => void;
}

// ==============================================
// STATUS BADGE HELPERS
// ==============================================

function getStatusBadge(option: ExportDialogPlatformOption) {
  if (option.connectionStatus === "connected") {
    return <Badge variant="default" className="bg-green-600">Conectado</Badge>;
  }
  if (option.connectionStatus === "configured") {
    return <Badge variant="secondary">Configurado</Badge>;
  }
  if (option.connectionStatus === "error") {
    return <Badge variant="destructive">Erro</Badge>;
  }
  return <Badge variant="outline">Não configurado</Badge>;
}

function formatExportDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ==============================================
// COMPONENT
// ==============================================

/**
 * Export dialog for selecting platform and reviewing variable mappings
 * AC: #1, #3, #5
 *
 * Does NOT execute the export — collects selections and calls onExport(config).
 * Orchestration is handled by Stories 7.5/7.6/7.7.
 */
export function ExportDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  blocks,
  platformOptions,
  leadSummary,
  previousExport,
  onExport,
}: ExportDialogProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<ExportPlatform | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [leadSelection, setLeadSelection] = useState<LeadSelection>("all");
  const [exportMode, setExportMode] = useState<ExportMode>(
    previousExport ? "re-export" : "new"
  );
  // Story 7.7 AC #2: CSV mode toggle (resolved vs with_variables)
  const [csvMode, setCsvMode] = useState<"resolved" | "with_variables">("resolved");

  // M1 fix: Only fetch accounts when Instantly is selected
  const { accounts, isLoading: accountsLoading } = useSendingAccounts({
    enabled: selectedPlatform === "instantly",
  });

  // M2 fix: Reset state when dialog closes (so next open starts fresh)
  const handleDialogOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setSelectedPlatform(null);
        setSelectedAccounts([]);
        setLeadSelection("all");
        setExportMode(previousExport ? "re-export" : "new");
        setCsvMode("resolved");
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, previousExport]
  );

  const selectedOption = platformOptions.find((p) => p.platform === selectedPlatform);
  const isInstantly = selectedPlatform === "instantly";

  const canExport =
    selectedPlatform !== null &&
    selectedOption?.configured &&
    (selectedPlatform === "clipboard" || leadSummary.leadsWithEmail > 0) &&
    (!isInstantly || selectedAccounts.length > 0);

  function handleExport() {
    if (!selectedPlatform) return;

    const config: ExportConfig = {
      campaignId,
      platform: selectedPlatform,
      leadSelection,
      exportMode,
    };
    if (isInstantly && selectedAccounts.length > 0) {
      config.sendingAccounts = selectedAccounts;
    }
    if (exportMode === "update" && previousExport?.externalCampaignId) {
      config.externalCampaignId = previousExport.externalCampaignId;
    }
    if (selectedPlatform === "csv") {
      config.csvMode = csvMode;
    }

    onExport(config);
  }

  function handlePlatformSelect(platform: ExportPlatform) {
    setSelectedPlatform(platform);
    setSelectedAccounts([]);
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Exportar Campanha</DialogTitle>
          <DialogDescription>
            Selecione uma plataforma e revise o mapeamento de variáveis para &quot;{campaignName}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-6 pr-3">
          {/* Previous Export Indicator (AC: #5) */}
          {previousExport && previousExport.exportedAt && (
            <div
              className="flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm"
              data-testid="previous-export-indicator"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-yellow-600" />
                <span>
                  Campanha já exportada para{" "}
                  <strong>
                    {previousExport.exportPlatform === "instantly" ? "Instantly" : "Snov.io"}
                  </strong>{" "}
                  em {formatExportDate(previousExport.exportedAt)}
                </span>
              </div>
              <div className="flex gap-2 ml-6" data-testid="previous-export-actions">
                <button
                  type="button"
                  onClick={() => setExportMode("re-export")}
                  className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                    exportMode === "re-export"
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid="re-export-button"
                >
                  Re-exportar
                </button>
                <button
                  type="button"
                  onClick={() => setExportMode("update")}
                  className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                    exportMode === "update"
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid="update-export-button"
                >
                  Atualizar
                </button>
              </div>
            </div>
          )}

          {/* Platform Selection (AC: #1) */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Plataforma de destino</span>
            <div className="grid grid-cols-2 gap-2" data-testid="platform-options">
              {platformOptions.map((option) => (
                <button
                  key={option.platform}
                  type="button"
                  onClick={() => handlePlatformSelect(option.platform)}
                  className={`flex items-center justify-between rounded-md border p-3 text-left transition-colors ${
                    selectedPlatform === option.platform
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  } ${!option.configured ? "opacity-60" : ""}`}
                  data-testid={`platform-option-${option.platform}`}
                >
                  <span className="text-sm font-medium">{option.displayName}</span>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(option)}
                    {!option.configured && (
                      <a
                        href="/settings"
                        className="text-xs text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Settings className="h-3 w-3 inline mr-0.5" />
                        Configurar
                      </a>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Lead Selection (AC: #3) */}
          {selectedPlatform && (
            <div className="flex flex-col gap-2" data-testid="lead-selection">
              <span className="text-sm font-medium">Leads para exportar</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLeadSelection("all")}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    leadSelection === "all"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid="lead-selection-all"
                >
                  <Users className="h-4 w-4" />
                  Todos os leads da campanha
                </button>
                <button
                  type="button"
                  onClick={() => setLeadSelection("selected")}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    leadSelection === "selected"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid="lead-selection-selected"
                >
                  <Users className="h-4 w-4" />
                  Selecionar leads
                </button>
              </div>
            </div>
          )}

          {/* Story 7.7 AC #2: CSV Mode Toggle (only for CSV platform) */}
          {selectedPlatform === "csv" && (
            <div className="flex flex-col gap-2" data-testid="csv-mode-toggle">
              <span className="text-sm font-medium">Modo do CSV</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCsvMode("resolved")}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    csvMode === "resolved"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid="csv-mode-resolved"
                >
                  CSV Resolvido
                </button>
                <button
                  type="button"
                  onClick={() => setCsvMode("with_variables")}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    csvMode === "with_variables"
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid="csv-mode-with-variables"
                >
                  CSV com Variáveis
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {csvMode === "resolved"
                  ? "Variáveis substituídas por dados reais de cada lead."
                  : "Templates com {{variáveis}} mantidas — ideal para importar em plataformas."}
              </p>
            </div>
          )}

          {/* Export Preview (AC: #2) */}
          {selectedPlatform && (
            <ExportPreview
              platform={selectedPlatform}
              leadSummary={leadSummary}
              blocks={blocks}
            />
          )}

          {/* Sending Accounts (AC: #4 — Instantly only) */}
          {isInstantly && (
            <SendingAccountSelector
              accounts={accounts}
              selectedAccounts={selectedAccounts}
              onSelectionChange={setSelectedAccounts}
              isLoading={accountsLoading}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={!canExport}>
            <Upload className="h-4 w-4 mr-2" />
            {selectedPlatform
              ? `Exportar para ${selectedOption?.displayName ?? selectedPlatform}`
              : "Selecione uma plataforma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
