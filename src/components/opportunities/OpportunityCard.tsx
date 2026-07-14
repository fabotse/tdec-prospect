/**
 * Opportunity Card
 * Story 21.4: Central de Oportunidades — AC #2, #3, #5
 *
 * Look do card "quente" do tracking (OpportunityPanel) + badge colorido no
 * padrão do LeadStatusBadge. Somente exibição — as AÇÕES do card (WhatsApp,
 * telefone, mailto, marcar reunião/descartar, rascunho IA) são da Story 21.5.
 *
 * Degradações obrigatórias (todas são casos reais — 21.2/21.3/21.6):
 * intent null, lead null, reply_text null (engagement), unibox_url null
 * (polling), campaignName null, phone null, insight null. O card nunca quebra.
 */

"use client";

import { useRef, useState } from "react";
import { ExternalLink, Flame, Lightbulb, Phone, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getIntentConfig } from "@/types/opportunity";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";
import { useUpdateOpportunityStatus } from "@/hooks/use-opportunities";
import type { OpportunityCardData } from "@/hooks/use-opportunities";

interface OpportunityCardProps {
  opportunity: OpportunityCardData;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const [expanded, setExpanded] = useState(false);
  // AC5: transição new→viewed UMA vez por interação (não no mount — evita
  // writes em massa ao carregar a lista). useRef não repete em re-renders.
  const markedViewedRef = useRef(false);
  const updateStatus = useUpdateOpportunityStatus();

  const lead = opportunity.lead;
  const leadName = lead
    ? [lead.firstName, lead.lastName].filter(Boolean).join(" ")
    : "Lead não cadastrado";
  const leadContext = lead
    ? [lead.title, lead.companyName].filter(Boolean).join(" · ")
    : "";

  const intentConfig = getIntentConfig(opportunity.intent);
  const openCount = opportunity.openCount;
  const clickCount = opportunity.clickCount;
  const hasEngagementMetrics = openCount !== null || clickCount !== null;

  const handleOpen = () => {
    setExpanded((prev) => !prev);
    if (!markedViewedRef.current && opportunity.status === "new") {
      markedViewedRef.current = true;
      updateStatus.mutate(
        {
          opportunityId: opportunity.id,
          status: "viewed",
          silent: true,
        },
        {
          // Falhou (rede/500): libera o guard para re-tentar ao reabrir o card —
          // senão o status ficaria preso em `new` e o badge nunca decrementaria.
          onError: () => {
            markedViewedRef.current = false;
          },
        }
      );
    }
  };

  return (
    <div
      data-testid="opportunity-card"
      className="flex flex-col gap-2 p-3 rounded-md border border-primary/30 bg-primary/5 cursor-pointer"
      onClick={handleOpen}
    >
      {/* Cabeçalho: lead + badges + recência */}
      <div className="flex flex-wrap items-center gap-2">
        <Flame className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium text-sm" data-testid="opportunity-lead-name">
          {leadName}
        </span>
        {leadContext && (
          <span className="text-sm text-muted-foreground truncate">{leadContext}</span>
        )}
        <Badge
          variant="outline"
          className={cn("border-transparent", intentConfig.badgeClasses)}
          data-testid="opportunity-intent-badge"
        >
          {intentConfig.label}
        </Badge>
        {opportunity.source === "engagement" && (
          <Badge
            variant="outline"
            className="border-primary/50 text-primary"
            data-testid="opportunity-engagement-badge"
          >
            Alto engajamento
          </Badge>
        )}
        {opportunity.status === "new" && (
          <Badge variant="default" data-testid="opportunity-new-badge">
            Nova
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {formatRelativeTime(opportunity.createdAt)}
        </span>
      </div>

      {/* Campanha de origem */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Send className="h-3 w-3 shrink-0" />
        <span data-testid="opportunity-campaign-name">
          {opportunity.campaignName ?? "Campanha desconhecida"}
        </span>
      </div>

      {/* Assunto da resposta (identidade mínima quando lead null) */}
      {opportunity.replySubject && (
        <span className="text-xs font-medium text-foreground" data-testid="opportunity-subject">
          {opportunity.replySubject}
        </span>
      )}

      {/* Trecho da resposta — expansível (AC2). Engagement não tem reply_text. */}
      {opportunity.replyText && (
        <div className="flex flex-col gap-1">
          <p
            className={cn(
              "text-sm text-foreground/90 whitespace-pre-line",
              !expanded && "line-clamp-2"
            )}
            data-testid="opportunity-reply-text"
          >
            {opportunity.replyText}
          </p>
          <button
            type="button"
            className="self-start text-xs text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            data-testid="opportunity-toggle-expand"
          >
            {expanded ? "Ver menos" : "Ver mais"}
          </button>
        </div>
      )}

      {/* Engajamento (aberturas/cliques — cliques só quando > 0) */}
      {hasEngagementMetrics && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span data-testid="opportunity-opens">
            {openCount ?? 0} abertura{(openCount ?? 0) === 1 ? "" : "s"}
          </span>
          {(clickCount ?? 0) > 0 && (
            <span data-testid="opportunity-clicks">
              · {clickCount} clique{clickCount === 1 ? "" : "s"}
            </span>
          )}
          {opportunity.lastEngagementAt && (
            <span className="text-xs">· {formatRelativeTime(opportunity.lastEngagementAt)}</span>
          )}
        </div>
      )}

      {/* Contato: telefone (só exibição — ação é 21.5) + Unibox */}
      {(lead?.phone || opportunity.uniboxUrl) && (
        <div className="flex items-center gap-4">
          {lead?.phone && (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="opportunity-phone"
            >
              <Phone className="h-3 w-3 shrink-0" />
              {lead.phone}
            </span>
          )}
          {opportunity.uniboxUrl && (
            <a
              href={opportunity.uniboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
              data-testid="opportunity-unibox-link"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              Abrir no Unibox
            </a>
          )}
        </div>
      )}

      {/* Insight do LinkedIn (AC3) — contexto adicional p/ leads monitorados */}
      {opportunity.insight && (
        <div
          className="flex flex-col gap-1 p-2 rounded-md border border-border bg-muted/40"
          data-testid="opportunity-insight"
        >
          <span className="flex items-center gap-1 text-xs font-medium text-foreground">
            <Lightbulb className="h-3 w-3 shrink-0" />
            Insight do LinkedIn
          </span>
          {opportunity.insight.suggestion && (
            <p className="text-sm text-foreground/90">{opportunity.insight.suggestion}</p>
          )}
          {opportunity.insight.relevanceReasoning && (
            <p className="text-xs text-muted-foreground">
              {opportunity.insight.relevanceReasoning}
            </p>
          )}
          {opportunity.insight.postUrl && (
            <a
              href={opportunity.insight.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
              data-testid="opportunity-insight-post-link"
            >
              Ver post
            </a>
          )}
        </div>
      )}
    </div>
  );
}
