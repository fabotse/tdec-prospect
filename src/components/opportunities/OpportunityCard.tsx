/**
 * Opportunity Card
 * Story 21.4: Central de Oportunidades — AC #2, #3, #5 (exibição)
 * Story 21.5: AÇÕES do card — AC #1, #2, #3, #4, #5
 *   rascunho de próximo passo por IA (gerado 1x ao abrir, com cache no servidor)
 *   + copiar/regenerar + WhatsApp + mailto + buscar telefone + triagem.
 *
 * Os dialogs (WhatsApp/telefone) NÃO vivem aqui: o card emite `onWhatsApp` /
 * `onPhoneLookup` e o `OpportunitiesPageContent` renderiza UM dialog de cada
 * tipo (padrão do InsightsPageContent/OpportunityPanel — não um por card).
 *
 * Degradações obrigatórias (todas são casos reais — 21.2/21.3/21.6):
 * intent null, lead null, reply_text null (engagement), unibox_url null
 * (polling), campaignName null, phone null, email null, insight null, rascunho
 * falhou. O card nunca quebra — nenhum acesso a `lead.*`/`draft.*` sem guard.
 *
 * O container é clicável (`onClick={handleOpen}`) → TODA ação precisa de
 * `stopPropagation`, senão dispara o expand/`new→viewed` junto.
 */

"use client";

import { useRef, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  ExternalLink,
  Flame,
  Lightbulb,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getIntentConfig } from "@/types/opportunity";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";
import {
  useUpdateOpportunityStatus,
  useOpportunitySuggestion,
} from "@/hooks/use-opportunities";
import type { OpportunityCardData } from "@/hooks/use-opportunities";

interface OpportunityCardProps {
  opportunity: OpportunityCardData;
  /** Abre o composer de WhatsApp (dialog vive no PageContent). */
  onWhatsApp?: (opportunity: OpportunityCardData) => void;
  /** Abre a busca de telefone via SignalHire (dialog vive no PageContent). */
  onPhoneLookup?: (opportunity: OpportunityCardData) => void;
  /** Telefone encontrado no lookup desta sessão (otimista, antes do refetch). */
  localPhone?: string;
  /**
   * Story 21.9 AC#6 — abre a confirmação de "Parar sequência" (dialog vive no
   * PageContent). O botão só renderiza com `campaignId` não-null (lição 13.11:
   * coluna nullable e sem FK) E e-mail do lead disponível.
   */
  onStopSequence?: (opportunity: OpportunityCardData) => void;
  /** Story 21.9 — desabilita o atalho enquanto a mutation pende. */
  sequenceActionPending?: boolean;
}

/**
 * Assunto do mailto. Não re-prefixa um assunto que já vem com "Re:" do
 * Instantly (o caso comum: a oportunidade nasce de uma RESPOSTA).
 *
 * Sem assunto (oportunidade de ENGAJAMENTO — abriu/clicou, não respondeu, logo
 * não há `reply_subject`), cai num assunto neutro: um `subject=` vazio abriria o
 * cliente de e-mail com a linha de assunto em branco.
 */
function buildMailtoSubject(replySubject: string | null, leadFirstName?: string | null): string {
  const base = replySubject?.trim();
  if (base) return /^re:/i.test(base) ? base : `Re: ${base}`;
  const name = leadFirstName?.trim();
  return name ? `${name}, tudo bem?` : "Tudo bem?";
}

export function OpportunityCard({
  opportunity,
  onWhatsApp,
  onPhoneLookup,
  localPhone,
  onStopSequence,
  sequenceActionPending,
}: OpportunityCardProps) {
  const [expanded, setExpanded] = useState(false);
  // AC5: transição new→viewed UMA vez por interação (não no mount — evita
  // writes em massa ao carregar a lista). useRef não repete em re-renders.
  const markedViewedRef = useRef(false);
  // Mesma guarda para o rascunho: 1 geração por card por sessão (o cache no
  // servidor garante 1 por oportunidade para sempre — decisão Fabossi #1).
  const draftRequestedRef = useRef(false);
  const [draft, setDraft] = useState<string | null>(opportunity.suggestion);
  const [draftAttempted, setDraftAttempted] = useState(false);
  const updateStatus = useUpdateOpportunityStatus();
  const { generate, regenerate, isGenerating } = useOpportunitySuggestion(opportunity.id);

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

  const effectivePhone = localPhone ?? lead?.phone ?? null;
  const mailtoHref = lead?.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent(
        buildMailtoSubject(opportunity.replySubject, lead.firstName)
      )}&body=${encodeURIComponent(draft ?? "")}`
    : null;

  /**
   * Dispara a geração do rascunho no máximo 1x por card (AC1). Extraído do
   * `handleOpen` porque os botões de ação (WhatsApp/E-mail) vivem FORA do gate
   * `expanded` e dão `stopPropagation` — quem clica direto na ação nunca passava
   * pelo `handleOpen`, e o composer/mailto abriam vazios, quebrando o AC3.
   * Passivo: nunca dá toast, nunca rejeita (o hook resolve null em erro).
   * Custo inalterado: o cache do servidor segue limitando a 1 geração por
   * oportunidade para sempre (decisão #1) — muda QUANDO dispara, não QUANTAS vezes.
   */
  const ensureDraft = async (): Promise<string | null> => {
    if (draft) return draft;
    if (draftRequestedRef.current) return null;
    draftRequestedRef.current = true;
    setDraftAttempted(true);
    const result = await generate();
    if (result?.suggestion) {
      setDraft(result.suggestion);
      return result.suggestion;
    }
    // Falhou/veio vazio: libera o guard para re-tentar (espelha o onError
    // do new→viewed).
    draftRequestedRef.current = false;
    return null;
  };

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

    // AC1 — rascunho on-demand na PRIMEIRA abertura.
    ensureDraft();
  };

  const handleCopyDraft = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Rascunho copiado!");
    } catch {
      toast.error("Erro ao copiar rascunho");
    }
  };

  const handleRegenerateDraft = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setDraftAttempted(true);
    const result = await regenerate();
    if (result?.suggestion) {
      setDraft(result.suggestion);
      draftRequestedRef.current = true;
    }
  };

  const handleTriage = (event: React.MouseEvent, status: "contacted" | "discarded" | "meeting_booked") => {
    event.stopPropagation();
    // Sem `silent` → toast de sucesso/erro automático (hook, Story 21.5).
    updateStatus.mutate({ opportunityId: opportunity.id, status });
  };

  const showDraftBlock = Boolean(draft) || isGenerating || draftAttempted;

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

      {/* Rascunho de próximo passo por IA (AC1/AC2/AC5) */}
      {showDraftBlock && (
        <div
          className="flex flex-col gap-2 p-2 rounded-md border border-border bg-muted/40"
          data-testid="opportunity-draft"
        >
          <span className="flex items-center gap-1 text-xs font-medium text-foreground">
            <Sparkles className="h-3 w-3 shrink-0" />
            Próximo passo sugerido
          </span>

          {isGenerating && (
            <p
              className="text-sm text-muted-foreground animate-pulse"
              data-testid="opportunity-draft-loading"
            >
              Gerando rascunho…
            </p>
          )}

          {!isGenerating && draft && (
            <>
              <p
                className="text-sm text-foreground/90 whitespace-pre-line"
                data-testid="opportunity-draft-text"
              >
                {draft}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyDraft}
                  data-testid="opportunity-draft-copy"
                >
                  <Copy className="h-3 w-3" />
                  Copiar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerateDraft}
                  data-testid="opportunity-draft-regenerate"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerar
                </Button>
              </div>
            </>
          )}

          {/* AC5: falhou/sem rascunho → mensagem discreta, demais ações intactas */}
          {!isGenerating && !draft && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-xs text-muted-foreground"
                data-testid="opportunity-draft-unavailable"
              >
                Não foi possível gerar o rascunho agora.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRegenerateDraft}
                data-testid="opportunity-draft-retry"
              >
                <RefreshCw className="h-3 w-3" />
                Tentar de novo
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Ações de contato (AC3) — só quando há lead (sem lead, não há destino) */}
      {lead && (
        <div className="flex flex-wrap items-center gap-2" data-testid="opportunity-actions">
          {effectivePhone ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation();
                // AC3: o composer nasce pré-preenchido com o rascunho. Este botão
                // vive FORA do gate `expanded` e dá stopPropagation, então quem
                // clica direto na ação nunca passou pelo `handleOpen` e abria o
                // composer vazio. Esperar o rascunho antes de emitir é o que
                // garante o pré-preenchimento: o composer usa `useState`
                // (WhatsAppComposerDialog.tsx:94) e NÃO ressincroniza depois de
                // montado — emitir agora e resolver depois não funcionaria.
                const text = await ensureDraft();
                onWhatsApp?.({ ...opportunity, suggestion: text ?? opportunity.suggestion });
              }}
              disabled={isGenerating}
              data-testid="opportunity-action-whatsapp"
            >
              <MessageSquare className="h-3 w-3" />
              WhatsApp
            </Button>
          ) : (
            // Sem telefone: oferecer a busca (SignalHire precisa de e-mail)
            lead.email && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onPhoneLookup?.(opportunity);
                }}
                data-testid="opportunity-action-phone-lookup"
              >
                <Search className="h-3 w-3" />
                Buscar telefone
              </Button>
            )
          )}

          {mailtoHref && (
            <Button asChild variant="outline" size="sm">
              {/*
                AC3: o `body` do mailto é o rascunho, e o href é reativo ao state
                `draft` — abrir o card (ou clicar em WhatsApp) já o preenche.

                NÃO aquecer o rascunho no hover/focus: passar o mouse NÃO é
                intenção. Ao percorrer a lista o cursor cruza o botão de vários
                cards, e cada cruzada dispararia uma geração PAGA que o usuário
                não pediu — quebra a guarda de custo que sustenta a decisão #1
                (anti-pattern #14). Geração só com intenção explícita.
              */}
              <a
                href={mailtoHref}
                onClick={(e) => e.stopPropagation()}
                data-testid="opportunity-action-mailto"
              >
                <Mail className="h-3 w-3" />
                E-mail
              </a>
            </Button>
          )}

          {/* Story 21.9 AC#6 — cenário WhatsApp: lead respondeu por outro canal
              e segue recebendo follow-up. Confirmação (com motivos) no PageContent. */}
          {onStopSequence && opportunity.campaignId && lead.email && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onStopSequence(opportunity);
              }}
              disabled={sequenceActionPending}
              data-testid="opportunity-action-stop-sequence"
            >
              <Ban className="h-3 w-3" />
              Parar sequência
            </Button>
          )}
        </div>
      )}

      {/* Triagem (AC4) — disponível mesmo sem lead */}
      <div className="flex flex-wrap items-center gap-2" data-testid="opportunity-triage">
        {opportunity.status !== "contacted" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => handleTriage(e, "contacted")}
            disabled={updateStatus.isPending}
            data-testid="opportunity-triage-contacted"
          >
            <Check className="h-3 w-3" />
            Contatada
          </Button>
        )}
        {opportunity.status !== "meeting_booked" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => handleTriage(e, "meeting_booked")}
            // Sem isto, duplo-clique = 2 PATCHes: 2 toasts, 2 promoções de lead
            // e 2 carimbos de meeting_booked_at.
            disabled={updateStatus.isPending}
            data-testid="opportunity-triage-meeting"
          >
            <Flame className="h-3 w-3" />
            Reunião marcada
          </Button>
        )}
        {opportunity.status !== "discarded" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => handleTriage(e, "discarded")}
            disabled={updateStatus.isPending}
            data-testid="opportunity-triage-discarded"
          >
            <XIcon className="h-3 w-3" />
            Descartar
          </Button>
        )}
      </div>
    </div>
  );
}
