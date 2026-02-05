/**
 * Import Results Summary Component
 * Story 4.7: Import Campaign Results
 *
 * AC: #6 - Display import summary with counts
 * AC: #7 - Option to create leads for unmatched emails
 */

"use client";

import { CheckCircle2, XCircle, AlertTriangle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportCampaignResultsResponse } from "@/types/campaign-import";

interface ImportResultsSummaryProps {
  result: ImportCampaignResultsResponse;
  onCreateMissingLeads?: () => void;
}

/**
 * Displays the results of a campaign import operation
 */
export function ImportResultsSummary({
  result,
  onCreateMissingLeads,
}: ImportResultsSummaryProps) {
  const hasUnmatched = result.unmatched.length > 0;
  const hasErrors = result.errors.length > 0;
  const hasCreated = result.created && result.created > 0;

  return (
    <div className="space-y-6" data-testid="import-results-summary">
      {/* Success Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
          <div className="p-2 rounded-full bg-primary/10">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{result.matched}</p>
            <p className="text-sm text-muted-foreground">
              {result.matched === 1 ? "Lead encontrado" : "Leads encontrados"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
          <div className="p-2 rounded-full bg-green-500/10">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{result.updated}</p>
            <p className="text-sm text-muted-foreground">
              {result.updated === 1 ? "Lead atualizado" : "Leads atualizados"}
            </p>
          </div>
        </div>

        {hasCreated && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
            <div className="p-2 rounded-full bg-muted">
              <UserPlus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{result.created}</p>
              <p className="text-sm text-muted-foreground">
                {result.created === 1 ? "Lead criado" : "Leads criados"}
              </p>
            </div>
          </div>
        )}

        {hasUnmatched && !hasCreated && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
            <div className="p-2 rounded-full bg-yellow-500/10">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{result.unmatched.length}</p>
              <p className="text-sm text-muted-foreground">
                {result.unmatched.length === 1
                  ? "Nao encontrado"
                  : "Nao encontrados"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Unmatched Emails List */}
      {hasUnmatched && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Emails nao encontrados</h4>
            {onCreateMissingLeads && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateMissingLeads}
                data-testid="create-missing-leads-button"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Criar leads para estes emails
              </Button>
            )}
          </div>
          <ScrollArea className="h-[150px] rounded-md border p-3">
            <ul className="space-y-1 text-sm">
              {result.unmatched.map((email, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <XCircle className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                  {email}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}

      {/* Errors List */}
      {hasErrors && (
        <div className="space-y-3">
          <h4 className="font-medium text-destructive">Erros encontrados</h4>
          <ScrollArea className="h-[100px] rounded-md border border-destructive/50 p-3">
            <ul className="space-y-1 text-sm">
              {result.errors.map((error, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-destructive"
                >
                  <XCircle className="h-3 w-3 flex-shrink-0" />
                  {error}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}

      {/* Success Message */}
      {!hasUnmatched && !hasErrors && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <p>Todos os resultados foram processados com sucesso!</p>
        </div>
      )}
    </div>
  );
}
