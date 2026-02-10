/**
 * OpportunityPanel Component
 * Story 10.7: Janela de Oportunidade — UI + Notificacoes
 * Story 11.4: Envio Individual de WhatsApp
 *
 * AC 10.7: #1 — Lista focada de leads quentes com destaque visual
 * AC 10.7: #2 — Estado vazio com sugestao de ajuste
 * AC 11.4: #4 — Botao WhatsApp habilitado/desabilitado por phone
 * AC 11.4: #5 — Integracao OpportunityPanel + WhatsAppComposerDialog
 * AC 11.4: #6 — Props campaignId e productId
 * AC 11.4: #7 — Indicador visual de "já enviado"
 *
 * UX: Collapsible (aberto por padrao) + limite de 5 leads visiveis
 */

"use client";

import { forwardRef, useState, useCallback, useMemo } from "react";
import { Flame, Mail, Phone, ChevronDown, ChevronUp, MessageSquare, Check, Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";
import { WhatsAppComposerDialog } from "@/components/tracking/WhatsAppComposerDialog";
import { useWhatsAppSend } from "@/hooks/use-whatsapp-send";
import type { OpportunityLead } from "@/types/tracking";

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

    const { send, isSending } = useWhatsAppSend();

    // Combine prop-based sent emails with locally-tracked sends (no useEffect needed)
    const allSentEmails = useMemo(() => {
      const merged = new Set(recentlySentEmails);
      sentLeadEmails?.forEach((email) => merged.add(email));
      return merged;
    }, [sentLeadEmails, recentlySentEmails]);

    const hasLeads = leads.length > 0;
    const hasHiddenLeads = leads.length > VISIBLE_LIMIT;
    const visibleLeads = showAll ? leads : leads.slice(0, VISIBLE_LIMIT);

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

    const isLeadSent = (leadEmail: string) => allSentEmails.has(leadEmail);

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
                  {visibleLeads.map((lead) => {
                    const hasPhone = Boolean(lead.phone);
                    const sent = isLeadSent(lead.leadEmail);

                    return (
                      <div
                        key={lead.leadEmail}
                        data-testid="opportunity-lead-row"
                        className="flex flex-col gap-2 p-3 rounded-md border border-primary/30 bg-primary/5"
                      >
                        <div className="flex items-center gap-3">
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
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              data-testid="contact-phone-link"
                            >
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </a>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            {sent && (
                              <span data-testid="whatsapp-sent-indicator" className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <Check className="h-3 w-3" />
                                Enviado
                              </span>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-testid="whatsapp-send-button"
                                  disabled={!hasPhone || !campaignId || (isSending && composerLead?.leadEmail === lead.leadEmail)}
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
                                {!hasPhone
                                  ? "Telefone não disponível"
                                  : !campaignId
                                    ? "Campanha não identificada"
                                    : "Enviar WhatsApp"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

        {/* WhatsApp Composer Dialog — AC #5 */}
        {composerLead && campaignId && (
          <WhatsAppComposerDialog
            open={!!composerLead}
            onOpenChange={(open) => {
              if (!open) setComposerLead(null);
            }}
            lead={{
              firstName: composerLead.firstName,
              lastName: composerLead.lastName,
              phone: composerLead.phone,
              leadEmail: composerLead.leadEmail,
            }}
            campaignId={campaignId}
            campaignName={campaignName}
            productId={productId}
            onSend={handleSend}
          />
        )}
      </TooltipProvider>
    );
  }
);
