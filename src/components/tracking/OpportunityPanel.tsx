/**
 * OpportunityPanel Component
 * Story 10.7: Janela de Oportunidade — UI + Notificacoes
 * Story 11.4: Envio Individual de WhatsApp
 * Story 11.5: Busca de Telefone no Fluxo de Leads Quentes
 * Story 11.6: Envio em Massa de WhatsApp com Intervalos Humanizados
 *
 * AC 10.7: #1 — Lista focada de leads quentes com destaque visual
 * AC 10.7: #2 — Estado vazio com sugestao de ajuste
 * AC 11.4: #4 — Botao WhatsApp habilitado/desabilitado por phone
 * AC 11.4: #5 — Integracao OpportunityPanel + WhatsAppComposerDialog
 * AC 11.4: #6 — Props campaignId e productId
 * AC 11.4: #7 — Indicador visual de "já enviado"
 * AC 11.5: #1 — Botao "Buscar Telefone" quando sem phone
 * AC 11.5: #5 — Apos telefone obtido, habilitar WhatsApp
 * AC 11.6: #1 — Modo de selecao no OpportunityPanel
 * AC 11.6: #8 — Marcacao de leads contactados
 * AC 11.6: #9 — Protecoes e edge cases
 *
 * UX: Collapsible (aberto por padrao) + limite de 5 leads visiveis
 */

"use client";

import { forwardRef, useState, useCallback, useMemo } from "react";
import { Flame, Mail, Phone, ChevronDown, ChevronUp, MessageSquare, Check, Loader2, Search, Users, X as XIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";
import { WhatsAppComposerDialog } from "@/components/tracking/WhatsAppComposerDialog";
import { PhoneLookupDialog } from "@/components/tracking/PhoneLookupDialog";
import { BulkWhatsAppDialog } from "@/components/tracking/BulkWhatsAppDialog";
import { useWhatsAppSend } from "@/hooks/use-whatsapp-send";
import { useQueryClient } from "@tanstack/react-query";
import type { OpportunityLead } from "@/types/tracking";
import type { BulkSendLead } from "@/hooks/use-whatsapp-bulk-send";

interface OpportunityPanelProps {
  leads: OpportunityLead[];
  isLoading: boolean;
  campaignId?: string;
  campaignName?: string;
  productId?: string | null;
  sentLeadEmails?: Set<string>;
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={`opp-skeleton-${i}`} data-testid="opportunity-skeleton-row" className="flex items-center gap-3 p-3 rounded-md border border-border">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex flex-col gap-1 flex-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div data-testid="opportunity-empty" className="flex flex-col items-center justify-center py-8 gap-2">
      <Flame className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">Nenhum lead atingiu o threshold atual</p>
      <p className="text-xs text-muted-foreground">Ajuste o threshold acima</p>
    </div>
  );
}

const VISIBLE_LIMIT = 5;

export const OpportunityPanel = forwardRef<HTMLDivElement, OpportunityPanelProps>(
  function OpportunityPanel({ leads, isLoading, campaignId, campaignName, productId, sentLeadEmails }, ref) {
    const [isOpen, setIsOpen] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [composerLead, setComposerLead] = useState<OpportunityLead | null>(null);
    const [recentlySentEmails, setRecentlySentEmails] = useState<Set<string>>(new Set());
    const [phoneLookupLead, setPhoneLookupLead] = useState<OpportunityLead | null>(null);
    const [localPhones, setLocalPhones] = useState<Map<string, string>>(new Map());

    // Story 11.6: Selection mode state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

    const { send, isSending } = useWhatsAppSend();
    const queryClient = useQueryClient();

    // Combine prop-based sent emails with locally-tracked sends (no useEffect needed)
    const allSentEmails = useMemo(() => {
      const merged = new Set(recentlySentEmails);
      sentLeadEmails?.forEach((email) => merged.add(email));
      return merged;
    }, [sentLeadEmails, recentlySentEmails]);

    // AC 11.6 #1: Leads with phone AND not already sent (selectable for bulk)
    const selectableLeads = useMemo(() => {
      return leads.filter((lead) => {
        const effectivePhone = lead.phone || localPhones.get(lead.leadEmail);
        return Boolean(effectivePhone) && !allSentEmails.has(lead.leadEmail);
      });
    }, [leads, localPhones, allSentEmails]);

    const hasLeads = leads.length > 0;
    const hasHiddenLeads = leads.length > VISIBLE_LIMIT;
    const visibleLeads = showAll ? leads : leads.slice(0, VISIBLE_LIMIT);

    // AC 11.6 #1: Show bulk button when ≥2 selectable leads AND campaignId exists
    const showBulkButton = selectableLeads.length >= 2 && Boolean(campaignId);

    const handleSend = useCallback(
      async (data: { phone: string; message: string }) => {
        if (!campaignId || !composerLead) return;

        const success = await send({
          campaignId,
          leadEmail: composerLead.leadEmail,
          phone: data.phone,
          message: data.message,
        });

        if (success) {
          // AC#5: Close dialog on success + mark as sent locally
          setRecentlySentEmails((prev) => new Set(prev).add(composerLead.leadEmail));
          setComposerLead(null);
        }
        // AC#5: On error, dialog stays open (composerLead not cleared)
      },
      [campaignId, composerLead, send]
    );

    const handlePhoneFound = useCallback((phone: string) => {
      if (!phoneLookupLead) return;
      setLocalPhones((prev) => new Map(prev).set(phoneLookupLead.leadEmail, phone));
      setPhoneLookupLead(null);
      // Invalidate tracking query so phone persists on next refresh
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: ["leadTracking", campaignId] });
      }
    }, [phoneLookupLead, campaignId, queryClient]);

    const isLeadSent = (leadEmail: string) => allSentEmails.has(leadEmail);

    // AC 11.6 #1: Enter selection mode
    const handleEnterSelectionMode = useCallback(() => {
      setSelectionMode(true);
      setShowAll(true); // Expand list
      setSelectedEmails(new Set());
    }, []);

    // AC 11.6 #1: Exit selection mode
    const handleExitSelectionMode = useCallback(() => {
      setSelectionMode(false);
      setSelectedEmails(new Set());
    }, []);

    // AC 11.6: Toggle individual lead selection
    const toggleSelection = useCallback((leadEmail: string) => {
      setSelectedEmails((prev) => {
        const next = new Set(prev);
        if (next.has(leadEmail)) {
          next.delete(leadEmail);
        } else {
          next.add(leadEmail);
        }
        return next;
      });
    }, []);

    // AC 11.6: Select all / Deselect all
    const handleSelectAll = useCallback((checked: boolean) => {
      if (checked) {
        setSelectedEmails(new Set(selectableLeads.map((l) => l.leadEmail)));
      } else {
        setSelectedEmails(new Set());
      }
    }, [selectableLeads]);

    // AC 11.6: Open bulk dialog with selected leads
    const handleOpenBulkDialog = useCallback(() => {
      setBulkDialogOpen(true);
    }, []);

    // AC 11.6 #8: Handle individual lead sent during bulk
    const handleBulkLeadSent = useCallback((email: string) => {
      setRecentlySentEmails((prev) => new Set(prev).add(email));
      setSelectedEmails((prev) => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }, []);

    // AC 11.6 #8: Handle bulk complete
    const handleBulkComplete = useCallback(() => {
      setSelectionMode(false);
      setSelectedEmails(new Set());
      setBulkDialogOpen(false);
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: ["sentLeadEmails", campaignId] });
      }
    }, [campaignId, queryClient]);

    // Build BulkSendLead[] from selected emails
    const bulkSendLeads = useMemo((): BulkSendLead[] => {
      return leads
        .filter((lead) => selectedEmails.has(lead.leadEmail))
        .map((lead) => ({
          leadEmail: lead.leadEmail,
          phone: (lead.phone || localPhones.get(lead.leadEmail))!,
          firstName: lead.firstName,
          lastName: lead.lastName,
        }));
    }, [leads, selectedEmails, localPhones]);

    const isLeadSelectable = (lead: OpportunityLead): boolean => {
      const effectivePhone = lead.phone || localPhones.get(lead.leadEmail);
      return Boolean(effectivePhone) && !allSentEmails.has(lead.leadEmail);
    };

    return (
      <TooltipProvider>
        <Card ref={ref} data-testid="opportunity-panel">
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setIsOpen((prev) => !prev)}
            data-testid="opportunity-header-toggle"
          >
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-primary" data-testid="opportunity-flame-icon" />
              <CardTitle>Leads Quentes</CardTitle>
              {/* AC 11.6 #1: Bulk send button in header */}
              {showBulkButton && !selectionMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="bulk-send-mode-button"
                      aria-label="Enviar em massa"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEnterSelectionMode();
                      }}
                      className="h-7 w-7 p-0"
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Enviar em Massa</TooltipContent>
                </Tooltip>
              )}
              <span className="ml-auto">
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" data-testid="chevron-up" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" data-testid="chevron-down" />
                )}
              </span>
            </div>
            <CardDescription>
              {isLoading
                ? "Carregando..."
                : hasLeads
                  ? `${leads.length} lead${leads.length > 1 ? "s" : ""} atingi${leads.length > 1 ? "ram" : "u"} o threshold`
                  : "Nenhum lead qualificado"}
            </CardDescription>
          </CardHeader>
          {isOpen && (
            <CardContent data-testid="opportunity-content">
              {isLoading ? (
                <SkeletonRows />
              ) : leads.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="flex flex-col gap-3">
                  {/* AC 11.6 #1: Selection mode header */}
                  {selectionMode && (
                    <div
                      data-testid="selection-mode-header"
                      className="flex items-center gap-3 p-2 rounded-md border border-border bg-muted/50"
                    >
                      <Checkbox
                        data-testid="select-all-checkbox"
                        checked={selectedEmails.size === selectableLeads.length && selectableLeads.length > 0}
                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                        aria-label="Selecionar todos"
                      />
                      <span className="text-sm text-muted-foreground" data-testid="selection-counter">
                        {selectedEmails.size} de {selectableLeads.length} selecionados
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="cancel-selection-button"
                        onClick={handleExitSelectionMode}
                        className="ml-auto h-7"
                      >
                        <XIcon className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  )}

                  {visibleLeads.map((lead) => {
                    const effectivePhone = lead.phone || localPhones.get(lead.leadEmail);
                    const hasPhone = Boolean(effectivePhone);
                    const sent = isLeadSent(lead.leadEmail);
                    const selectable = isLeadSelectable(lead);
                    const isSelected = selectedEmails.has(lead.leadEmail);

                    return (
                      <div
                        key={lead.leadEmail}
                        data-testid="opportunity-lead-row"
                        className="flex flex-col gap-2 p-3 rounded-md border border-primary/30 bg-primary/5"
                      >
                        <div className="flex items-center gap-3">
                          {/* AC 11.6 #1: Checkbox in selection mode */}
                          {selectionMode && selectable && (
                            <Checkbox
                              data-testid="lead-selection-checkbox"
                              checked={isSelected}
                              onCheckedChange={() => toggleSelection(lead.leadEmail)}
                              aria-label={`Selecionar ${lead.leadEmail}`}
                            />
                          )}
                          <Flame className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-sm truncate">{lead.leadEmail}</span>
                          <span className="text-sm text-muted-foreground truncate">
                            {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "-"}
                          </span>
                          <span className="text-sm text-muted-foreground ml-auto shrink-0">
                            {lead.openCount} abertura{lead.openCount > 1 ? "s" : ""}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {lead.lastOpenAt ? formatRelativeTime(lead.lastOpenAt) : "-"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 pl-7">
                          <a
                            href={`mailto:${lead.leadEmail}`}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            data-testid="contact-email-link"
                          >
                            <Mail className="h-3 w-3" />
                            {lead.leadEmail}
                          </a>
                          {effectivePhone && (
                            <a
                              href={`tel:${effectivePhone}`}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              data-testid="contact-phone-link"
                            >
                              <Phone className="h-3 w-3" />
                              {effectivePhone}
                            </a>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            {sent && (
                              <span data-testid="whatsapp-sent-indicator" className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <Check className="h-3 w-3" />
                                Enviado
                              </span>
                            )}
                            {hasPhone ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    data-testid="whatsapp-send-button"
                                    aria-label="Enviar WhatsApp"
                                    disabled={!campaignId || (isSending && composerLead?.leadEmail === lead.leadEmail)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setComposerLead(lead);
                                    }}
                                    className="h-7 w-7 p-0"
                                  >
                                    {isSending && composerLead?.leadEmail === lead.leadEmail ? (
                                      <Loader2 className="h-4 w-4 animate-spin" data-testid="whatsapp-sending-spinner" />
                                    ) : (
                                      <MessageSquare className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {!campaignId
                                    ? "Campanha não identificada"
                                    : "Enviar WhatsApp"}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    data-testid="phone-lookup-button"
                                    aria-label="Buscar telefone"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPhoneLookupLead(lead);
                                    }}
                                    className="h-7 w-7 p-0"
                                  >
                                    <Search className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Buscar telefone para enviar WhatsApp
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* AC 11.6 #1: "Enviar WhatsApp (X)" button when ≥2 selected */}
                  {selectionMode && selectedEmails.size >= 2 && (
                    <Button
                      data-testid="bulk-send-button"
                      onClick={handleOpenBulkDialog}
                      className="self-center"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Enviar WhatsApp ({selectedEmails.size})
                    </Button>
                  )}

                  {hasHiddenLeads && !showAll && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAll(true)}
                      data-testid="show-all-leads-button"
                      className="self-center text-xs"
                    >
                      Ver todos ({leads.length})
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* WhatsApp Composer Dialog — AC 11.4 #5 */}
        {composerLead && campaignId && (
          <WhatsAppComposerDialog
            open={!!composerLead}
            onOpenChange={(open) => {
              if (!open) setComposerLead(null);
            }}
            lead={{
              firstName: composerLead.firstName,
              lastName: composerLead.lastName,
              phone: composerLead.phone || localPhones.get(composerLead.leadEmail),
              leadEmail: composerLead.leadEmail,
            }}
            campaignId={campaignId}
            campaignName={campaignName}
            productId={productId}
            onSend={handleSend}
          />
        )}

        {/* Phone Lookup Dialog — AC 11.5 #1 */}
        {phoneLookupLead && (
          <PhoneLookupDialog
            open={!!phoneLookupLead}
            onOpenChange={(open) => {
              if (!open) setPhoneLookupLead(null);
            }}
            lead={{
              leadEmail: phoneLookupLead.leadEmail,
              firstName: phoneLookupLead.firstName,
              lastName: phoneLookupLead.lastName,
              leadId: phoneLookupLead.leadId,
            }}
            onPhoneFound={handlePhoneFound}
          />
        )}

        {/* Bulk WhatsApp Dialog — AC 11.6 #2 */}
        {bulkDialogOpen && campaignId && (
          <BulkWhatsAppDialog
            open={bulkDialogOpen}
            onOpenChange={(open) => {
              if (!open) setBulkDialogOpen(false);
            }}
            leads={bulkSendLeads}
            campaignId={campaignId}
            campaignName={campaignName}
            productId={productId}
            onLeadSent={handleBulkLeadSent}
            onComplete={handleBulkComplete}
          />
        )}
      </TooltipProvider>
    );
  }
);
