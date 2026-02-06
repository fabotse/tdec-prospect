/**
 * Export Preview Component
 * Story 7.4: Export Dialog UI com Preview de Variáveis
 * AC: #2 - Variable mapping preview, lead summary
 * AC: #3 - Lead selection with email validation
 */

"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Mail } from "lucide-react";
import { getVariables, mapVariableForPlatform } from "@/lib/export/variable-registry";
import { renderTextWithVariablePlaceholders } from "./PreviewEmailStep";
import type { ExportPlatform } from "@/types/export";
import type { LeadExportSummary } from "@/types/export";
import type { BuilderBlock } from "@/stores/use-builder-store";

interface ExportPreviewProps {
  platform: ExportPlatform;
  leadSummary: LeadExportSummary;
  blocks: BuilderBlock[];
}

/**
 * Preview of variable mapping and lead summary for export
 * AC: #2, #3
 */
export function ExportPreview({
  platform,
  leadSummary,
  blocks,
}: ExportPreviewProps) {
  const firstEmailBlock = useMemo(
    () => blocks.find((b) => b.type === "email") ?? null,
    [blocks]
  );

  const variableMappings = useMemo(() => {
    // Scan blocks for used variables
    const usedVarNames = new Set<string>();
    blocks
      .filter((b) => b.type === "email")
      .forEach((block) => {
        const text = `${(block.data.subject as string) || ""} ${(block.data.body as string) || ""}`;
        const matches = text.match(/\{\{(\w+)\}\}/g);
        matches?.forEach((m) => usedVarNames.add(m.slice(2, -2)));
      });

    const allVars = getVariables();
    return allVars
      .filter((v) => usedVarNames.has(v.name))
      .map((v) => ({
        name: v.name,
        label: v.label,
        template: v.template,
        platformTag: mapVariableForPlatform(v.name, platform) || v.template,
      }));
  }, [blocks, platform]);

  return (
    <div className="flex flex-col gap-4" data-testid="export-preview">
      {/* Variable Mapping Table */}
      {variableMappings.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Mapeamento de Variáveis</span>
          <div className="rounded-md border" data-testid="variable-mapping-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Variável</th>
                  <th className="px-3 py-2 text-left font-medium">Na plataforma</th>
                </tr>
              </thead>
              <tbody>
                {variableMappings.map((mapping) => (
                  <tr key={mapping.name} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{mapping.template}</code>
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{mapping.platformTag}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lead Summary */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Resumo de Leads</span>
        <div className="flex flex-col gap-1.5 text-sm" data-testid="lead-summary">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>{leadSummary.leadsWithEmail} leads com email (serão exportados)</span>
          </div>

          {leadSummary.leadsWithoutEmail > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span>{leadSummary.leadsWithoutEmail} leads sem email (excluídos)</span>
            </div>
          )}

          {leadSummary.leadsWithoutIcebreaker > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>{leadSummary.leadsWithoutIcebreaker} leads sem icebreaker</span>
            </div>
          )}

          <div className="mt-1">
            <Badge variant="secondary">{leadSummary.totalLeads} leads total</Badge>
          </div>
        </div>
      </div>

      {/* Email Preview (Task 7.5) */}
      {firstEmailBlock && (
        <div className="flex flex-col gap-2" data-testid="email-preview-section">
          <span className="text-sm font-medium">Preview do Email</span>
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Email 1
              </span>
            </div>
            {firstEmailBlock.data.subject && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">Assunto: </span>
                <span className="text-sm font-medium">
                  {renderTextWithVariablePlaceholders(firstEmailBlock.data.subject as string)}
                </span>
              </div>
            )}
            {firstEmailBlock.data.body && (
              <div className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="email-preview-body">
                {renderTextWithVariablePlaceholders(firstEmailBlock.data.body as string)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
