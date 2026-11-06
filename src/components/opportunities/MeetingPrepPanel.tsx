/**
 * Painel da preparação de reunião (somente exibição)
 * Story: 24.23 - Preparação de reunião
 *
 * Todo texto (fato, resposta, pontos, objeções) é filho de JSX: texto puro, sem HTML nem
 * markdown. Links só para URL http(s) (`safeHttpUrl`), com `rel="noopener noreferrer"`.
 */

"use client";

import { AlertTriangle, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { safeHttpUrl } from "@/components/dossier/AccountDossierPanel";
import {
  EVENT_LABEL,
  FACT_KIND_LABEL,
  ORIGIN_LABEL,
  formatDateTime,
  formatDay,
  formatMeetingPrepText,
} from "@/lib/meeting-prep/format-text";
import type {
  MeetingPrep,
  MeetingPrepAccount,
  MeetingPrepEngagement,
  MeetingPrepOrigin,
} from "@/types/meeting-prep";

/** Motivo de não haver briefing, em linguagem simples. */
const REASON_TEXT: Record<string, string> = {
  no_openai_key: "Não há chave da OpenAI configurada. Peça a um gestor para cadastrar em Configurações.",
  llm_error: "A IA não respondeu a tempo. Tente de novo em instantes.",
  invalid_response: "A IA não devolveu um briefing completo. Tente de novo.",
  unavailable: "O serviço está indisponível no momento. Tente de novo em instantes.",
};

export function meetingPrepReasonText(reason: string | null | undefined): string {
  if (reason && Object.hasOwn(REASON_TEXT, reason)) return REASON_TEXT[reason];
  return "Não foi possível preparar a reunião agora.";
}

export const NO_RESEARCH_NOTE =
  "A pesquisa sob demanda ainda não está disponível (DW-34). Hoje a pesquisa da conta é feita pelo agente, na etapa Pesquisa das Contas.";

// ==============================================
// SUBCOMPONENTS
// ==============================================

function SourceLink({ url }: { url: string | null }) {
  const parsed = safeHttpUrl(url);
  if (!parsed) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="meeting-prep-source-invalid">
        fonte inválida
      </span>
    );
  }
  return (
    <a
      href={parsed.href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      data-testid="meeting-prep-source-link"
    >
      {parsed.hostname}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function OriginBadge({ origin, refs }: { origin: MeetingPrepOrigin; refs: string[] }) {
  const isSuggestion = origin === "sugestao";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge
        variant="outline"
        className={cn(
          isSuggestion && "border-amber-500/50 text-amber-600 dark:text-amber-400"
        )}
        data-testid={isSuggestion ? "meeting-prep-badge-suggestion" : "meeting-prep-badge-origin"}
      >
        {ORIGIN_LABEL[origin]}
      </Badge>
      {!isSuggestion && refs.length > 0 && (
        <span className="text-xs text-muted-foreground">{refs.join(", ")}</span>
      )}
    </span>
  );
}

function AccountSection({ account }: { account: MeetingPrepAccount }) {
  return (
    <section className="flex flex-col gap-2" data-testid="meeting-prep-account">
      <h3 className="text-sm font-medium">Resumo da conta</h3>
      {account.status !== "found" ? (
        <div className="flex flex-col gap-1" data-testid="meeting-prep-no-research">
          <p className="text-sm text-muted-foreground">
            Sem pesquisa da conta
            {account.status === "error" ? " (não foi possível ler o dossiê)" : ""}
          </p>
          <p className="text-xs text-muted-foreground">{NO_RESEARCH_NOTE}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(account.companyName || account.companyDomain) && (
              <span className="text-sm break-words">
                {account.companyName ?? account.companyDomain}
              </span>
            )}
            {account.researchedAt && (
              <span className="text-xs text-muted-foreground">
                Pesquisa de {formatDateTime(account.researchedAt).slice(0, 10)}
              </span>
            )}
            {account.expired && <Badge variant="outline">Desatualizado</Badge>}
          </div>
          {account.whyNow && (
            <div className="flex flex-col gap-1">
              <p className="text-sm break-words">
                <span className="font-medium">Gatilho: </span>
                {account.whyNow.gatilho}
              </p>
              {account.whyNow.hipoteseDor && (
                <p className="text-sm break-words">
                  <span className="font-medium">Hipótese de dor: </span>
                  {account.whyNow.hipoteseDor}
                </p>
              )}
            </div>
          )}
          {account.facts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pesquisa sem fatos com fonte</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {account.facts.map((fact) => (
                <li
                  key={fact.id}
                  className="flex flex-col gap-1 border-b pb-2 last:border-b-0"
                  data-testid="meeting-prep-fact"
                >
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="secondary">{fact.id}</Badge>
                    <Badge variant="outline">{FACT_KIND_LABEL[fact.kind] ?? fact.kind}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDay(fact.data)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-line break-words">{fact.fato}</p>
                  <SourceLink url={fact.fonteUrl} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function EngagementSection({ engagement }: { engagement: MeetingPrepEngagement }) {
  const booked = formatDateTime(engagement.meetingBookedAt);
  const repliedAt = formatDateTime(engagement.repliedAt);
  return (
    <section className="flex flex-col gap-2" data-testid="meeting-prep-engagement">
      <h3 className="text-sm font-medium">Engajamento e resposta</h3>
      {engagement.campaignName && (
        <p className="text-xs text-muted-foreground">Campanha: {engagement.campaignName}</p>
      )}
      {engagement.replySubject && (
        <p className="text-sm font-medium break-words">{engagement.replySubject}</p>
      )}
      {engagement.replyText ? (
        <div className="flex flex-col gap-1">
          {repliedAt && (
            <span className="text-xs text-muted-foreground">Resposta em {repliedAt}</span>
          )}
          <p
            className="text-sm whitespace-pre-line break-words rounded-md border bg-muted/40 p-2"
            data-testid="meeting-prep-reply-text"
          >
            {engagement.replyText}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sem resposta escrita do lead.</p>
      )}
      {(engagement.openCount !== null || engagement.clickCount !== null) && (
        <p className="text-sm text-muted-foreground">
          {engagement.openCount ?? 0} abertura{(engagement.openCount ?? 0) === 1 ? "" : "s"} ·{" "}
          {engagement.clickCount ?? 0} clique{(engagement.clickCount ?? 0) === 1 ? "" : "s"}
        </p>
      )}
      {booked && <p className="text-sm">Reunião marcada em {booked}</p>}
      {engagement.events.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-testid="meeting-prep-events">
          {engagement.events.map((event, index) => (
            <li key={`${event.type}-${event.at}-${index}`} className="text-xs text-muted-foreground">
              {EVENT_LABEL[event.type] ?? event.type} · {formatDateTime(event.at)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ==============================================
// PANEL
// ==============================================

export interface MeetingPrepPanelProps {
  prep: MeetingPrep | null;
  isLoading: boolean;
  /** Motivo de não haver briefing (fail-open da rota ou erro de rede). */
  reason: string | null;
  /** `false` quando o briefing veio mas não foi salvo. */
  saved: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
  /** Título usado no texto copiado. */
  title?: string | null;
}

export function MeetingPrepPanel({
  prep,
  isLoading,
  reason,
  saved,
  isRegenerating,
  onRegenerate,
  onRetry,
  title,
}: MeetingPrepPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" data-testid="meeting-prep-loading">
        <p className="text-sm text-muted-foreground">Preparando o briefing…</p>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!prep) {
    return (
      <Alert data-testid="meeting-prep-empty">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Briefing não gerado</AlertTitle>
        <AlertDescription>
          <p data-testid="meeting-prep-reason">{meetingPrepReasonText(reason)}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2"
            data-testid="meeting-prep-retry"
          >
            <RefreshCw className="h-3 w-3" />
            Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatMeetingPrepText(prep, title));
      toast.success("Briefing copiado!");
    } catch {
      toast.error("Erro ao copiar o briefing");
    }
  };

  const generatedAt = formatDateTime(prep.generatedAt);

  return (
    <div className="flex flex-col gap-4" data-testid="meeting-prep-briefing">
      <div className="flex flex-wrap items-center gap-2">
        {generatedAt && (
          <span className="text-xs text-muted-foreground" data-testid="meeting-prep-generated-at">
            Gerado em {generatedAt}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            data-testid="meeting-prep-copy"
          >
            <Copy className="h-3 w-3" />
            Copiar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
            data-testid="meeting-prep-regenerate"
          >
            <RefreshCw className={cn("h-3 w-3", isRegenerating && "animate-spin")} />
            Regenerar
          </Button>
        </div>
      </div>

      {!saved && (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="meeting-prep-not-saved">
          Não foi possível salvar o briefing. Ele aparece agora, mas será gerado de novo na
          próxima abertura.
        </p>
      )}

      <AccountSection account={prep.account} />
      <EngagementSection engagement={prep.engagement} />

      <section className="flex flex-col gap-2" data-testid="meeting-prep-talking-points">
        <h3 className="text-sm font-medium">Pontos de conversa</h3>
        <ol className="flex flex-col gap-2">
          {prep.talkingPoints.map((point, index) => (
            <li key={index} className="flex flex-col gap-1" data-testid="meeting-prep-talking-point">
              <p className="text-sm break-words">
                {index + 1}. {point.text}
              </p>
              <OriginBadge origin={point.origin} refs={point.refs} />
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2" data-testid="meeting-prep-objections">
        <h3 className="text-sm font-medium">Objeções prováveis</h3>
        {prep.objections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma objeção prevista.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {prep.objections.map((item, index) => (
              <li key={index} className="flex flex-col gap-1" data-testid="meeting-prep-objection">
                <p className="text-sm font-medium break-words">
                  {index + 1}. {item.objection}
                </p>
                <p className="text-sm break-words text-foreground/90">
                  <span className="text-muted-foreground">Resposta sugerida: </span>
                  {item.answer}
                </p>
                <OriginBadge origin={item.origin} refs={item.refs} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
