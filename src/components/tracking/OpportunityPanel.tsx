/**
 * OpportunityPanel Component
 * Story 10.7: Janela de Oportunidade — UI + Notificacoes
 *
 * AC: #1 — Lista focada de leads quentes com destaque visual
 * AC: #2 — Estado vazio com sugestao de ajuste
 * AC: #5 — Dados de contato (email, telefone) + WhatsApp placeholder
 *
 * UX: Collapsible (aberto por padrao) + limite de 5 leads visiveis
 */

"use client";

import { forwardRef, useState } from "react";
import { Flame, Mail, Phone, ChevronDown, ChevronUp } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";
import type { OpportunityLead } from "@/types/tracking";

interface OpportunityPanelProps {
  leads: OpportunityLead[];
  isLoading: boolean;
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
  function OpportunityPanel({ leads, isLoading }, ref) {
    const [isOpen, setIsOpen] = useState(true);
    const [showAll, setShowAll] = useState(false);

    const hasLeads = leads.length > 0;
    const hasHiddenLeads = leads.length > VISIBLE_LIMIT;
    const visibleLeads = showAll ? leads : leads.slice(0, VISIBLE_LIMIT);

    return (
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
                {visibleLeads.map((lead) => (
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
                    </div>
                  </div>
                ))}
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
                <div className="flex justify-end pt-2">
                  <Badge variant="secondary" className="text-[10px] text-muted-foreground" data-testid="whatsapp-badge">
                    (WhatsApp em breve)
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  }
);
