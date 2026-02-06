/**
 * Lead Preview Panel Component
 * Story 4.3: Lead Detail View & Interaction History
 *
 * AC: #6 - Simplified preview for Apollo search leads (not yet imported)
 * Shows lead information without interaction history.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Building2,
  Briefcase,
  Mail,
  Phone,
  Linkedin,
  MapPin,
  Download,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "./LeadStatusBadge";
import { InfoRow } from "./InfoRow";
import { useImportLeads, type LeadDataForImport } from "@/hooks/use-import-leads";
import type { Lead } from "@/types/lead";
import { cn } from "@/lib/utils";

interface LeadPreviewPanelProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called after successful import to update UI state */
  onImportSuccess?: (lead: Lead) => void;
}

/**
 * Lead Preview Panel - Simplified version without interaction history
 * AC: #6 - For Apollo search leads that haven't been imported yet
 */
export function LeadPreviewPanel({
  lead,
  isOpen,
  onClose,
  onImportSuccess,
}: LeadPreviewPanelProps) {
  const [isImporting, setIsImporting] = useState(false);
  const importLeads = useImportLeads();

  // Reset importing state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setIsImporting(false);
    }
  }, [isOpen]);

  // AC: #6 - Import lead handler
  const handleImport = useCallback(async () => {
    if (!lead || !lead.apolloId) return;

    setIsImporting(true);

    const leadData: LeadDataForImport = {
      apolloId: lead.apolloId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName,
      companySize: lead.companySize,
      industry: lead.industry,
      location: lead.location,
      title: lead.title,
      linkedinUrl: lead.linkedinUrl,
      hasEmail: lead.hasEmail,
      hasDirectPhone: lead.hasDirectPhone,
    };

    try {
      await importLeads.mutateAsync([leadData]);
      // Notify parent that import was successful
      if (onImportSuccess) {
        onImportSuccess({ ...lead, _isImported: true });
      }
    } catch {
      // Error is already handled by the hook
    } finally {
      setIsImporting(false);
    }
  }, [lead, importLeads, onImportSuccess]);

  // Don't render if no lead
  if (!lead) return null;

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const isImported = lead._isImported === true;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full flex flex-col overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="text-xl">{fullName}</SheetTitle>
          <SheetDescription className="sr-only">
            Preview do lead {fullName}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto space-y-6 px-6 pb-6">
          {/* Lead Info Section */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Informacoes
            </h3>
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <InfoRow
                icon={Building2}
                label="Empresa"
                value={lead.companyName}
              />
              <InfoRow icon={Briefcase} label="Cargo" value={lead.title} />
              <InfoRow
                icon={Mail}
                label="Email"
                value={lead.email}
                copyable
              />
              <InfoRow
                icon={Phone}
                label="Telefone"
                value={lead.phone}
                copyable
              />
              <InfoRow
                icon={Linkedin}
                label="LinkedIn"
                value={lead.linkedinUrl}
                href={lead.linkedinUrl ?? undefined}
                external
              />
              <InfoRow icon={MapPin} label="Localizacao" value={lead.location} />

              {/* Status Badge */}
              <div className="flex items-center gap-2 py-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <LeadStatusBadge status={lead.status} />
              </div>
            </div>
          </section>

          {/* Import Section - AC: #6 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Acoes
            </h3>
            <div className="rounded-lg border bg-card p-4">
              {isImported ? (
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground">
                    Este lead ja foi importado para "Meus Leads".
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Importe este lead para acompanhar interacoes e gerenciar o
                    status.
                  </p>
                  <Button
                    className="w-full"
                    onClick={handleImport}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Importar Lead
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Info about interaction history */}
          <div
            className={cn(
              "rounded-lg border border-dashed p-4 text-center",
              "bg-muted/30"
            )}
          >
            <p className="text-sm text-muted-foreground">
              {isImported
                ? 'Acesse "Meus Leads" para ver o historico de interacoes.'
                : "Importe o lead para habilitar o historico de interacoes."}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
