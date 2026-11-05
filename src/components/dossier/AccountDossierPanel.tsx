/**
 * Painel do dossie da conta (somente exibicao)
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade
 *
 * Todo texto (fato, gatilho, hipotese, empresa) e filho de JSX: texto puro, sem HTML nem
 * markdown. Links so para URL http(s) revalidada aqui (`safeHttpUrl`), com
 * `target="_blank"` e `rel="noopener noreferrer"`.
 */

"use client";

import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AccountDossierContext,
  AccountDossierView,
  DossierViewFact,
  DossierViewFactKind,
  DossierViewWhyNow,
} from "@/types/account-dossier";

// ==============================================
// HELPERS (puros)
// ==============================================

/** URL absoluta http(s) ou null. Revalidacao no cliente (nao importa `facts.ts`). */
export function safeHttpUrl(url: string | null | undefined): URL | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

const DATE_UTC = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_BRT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** YYYY-MM-DD -> dd/mm/aaaa, sem deslocamento de fuso. */
export function formatFactDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return "";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : DATE_UTC.format(date);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : DATE_BRT.format(date);
}

const KIND_LABEL: Record<DossierViewFactKind, string> = {
  news: "Notícia",
  job: "Vaga",
  post: "Post",
  site: "Site",
  technology: "Tecnologia",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  baixa: "confiança baixa",
  media: "confiança média",
  alta: "confiança alta",
};

/** D11: motivo de "sem gatilho" em linguagem simples. */
const NO_TRIGGER_TEXT: Record<string, string> = {
  not_researched: "conta não pesquisada nesta execução",
  no_eligible_facts: "nenhum fato recente com confiança média ou alta",
  low_confidence: "fato fraco demais para virar gatilho",
  disabled: "avaliação desligada",
  no_openai_key: "sem chave da OpenAI configurada",
  call_limit: "limite da execução atingido",
  budget: "limite da execução atingido",
  time_budget: "limite da execução atingido",
  llm_error: "não foi possível avaliar",
  timeout: "não foi possível avaliar",
  invalid_response: "não foi possível avaliar",
  facts_unavailable: "não foi possível avaliar",
  llm_declined: "nenhum fato serviu como motivo",
};

export function noTriggerText(whyNow: DossierViewWhyNow | null): string {
  if (!whyNow) return "gatilho não avaliado";
  if (whyNow.reason && Object.hasOwn(NO_TRIGGER_TEXT, whyNow.reason)) {
    return NO_TRIGGER_TEXT[whyNow.reason];
  }
  return "sem gatilho";
}

export const GENERATE_RESEARCH_HINT =
  "Hoje a pesquisa da conta é feita pelo agente, na etapa Pesquisa das Contas, quando os leads são aprovados.";

export const LEAD_REVIEW_NOTE =
  "A pesquisa desta execução roda depois que você aprovar os leads.";

// ==============================================
// SUBCOMPONENTS
// ==============================================

function SourceLink({ url, testId }: { url: string | null; testId?: string }) {
  const parsed = safeHttpUrl(url);
  if (!parsed) {
    return (
      <span className="text-xs text-muted-foreground" data-testid={testId ? `${testId}-invalid` : undefined}>
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
      data-testid={testId}
    >
      {parsed.hostname}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function FactItem({ fact }: { fact: DossierViewFact }) {
  return (
    <li className="flex flex-col gap-1 border-b pb-2 last:border-b-0" data-testid="dossier-fact">
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="secondary">{KIND_LABEL[fact.kind] ?? fact.kind}</Badge>
        <Badge variant="outline">{CONFIDENCE_LABEL[fact.confianca] ?? fact.confianca}</Badge>
        {fact.isTriggerSource && (
          <Badge variant="default" data-testid="dossier-fact-trigger">
            Gatilho
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{formatFactDate(fact.data)}</span>
      </div>
      <p className="text-sm whitespace-pre-line break-words" data-testid="dossier-fact-text">
        {fact.fato}
      </p>
      <SourceLink url={fact.fonteUrl} testId="dossier-fact-source" />
    </li>
  );
}

function WhyNowSection({ whyNow }: { whyNow: DossierViewWhyNow | null }) {
  const hasTrigger = whyNow?.status === "trigger" && Boolean(whyNow.gatilho);
  return (
    <>
      <section className="flex flex-col gap-1" data-testid="dossier-why-now">
        <h3 className="text-sm font-medium">Por que agora</h3>
        {hasTrigger && whyNow ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm break-words" data-testid="dossier-trigger-text">
              {whyNow.gatilho}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Fonte:</span>
              <SourceLink url={whyNow.fonteUrl} testId="dossier-trigger-source" />
              {whyNow.data && (
                <span className="text-xs text-muted-foreground">{formatFactDate(whyNow.data)}</span>
              )}
              {whyNow.confianca && (
                <Badge variant="outline">{CONFIDENCE_LABEL[whyNow.confianca]}</Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="dossier-no-trigger">
            Sem gatilho: {noTriggerText(whyNow)}
          </p>
        )}
      </section>
      <section className="flex flex-col gap-1" data-testid="dossier-pain">
        <h3 className="text-sm font-medium">Hipótese de dor</h3>
        {hasTrigger && whyNow?.hipoteseDor ? (
          <p className="text-sm break-words" data-testid="dossier-pain-text">
            {whyNow.hipoteseDor}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Sem hipótese de dor (sem gatilho)</p>
        )}
      </section>
    </>
  );
}

// ==============================================
// PANEL
// ==============================================

export interface AccountDossierPanelProps {
  view: AccountDossierView | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  leadName: string;
  companyName: string | null;
  context: AccountDossierContext;
}

export function AccountDossierPanel({
  view,
  isLoading,
  isError,
  onRetry,
  leadName,
  companyName,
  context,
}: AccountDossierPanelProps) {
  if (isError) {
    return (
      <Alert variant="destructive" data-testid="dossier-error">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar o dossiê</AlertTitle>
        <AlertDescription>
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-2">
            <RefreshCw className="h-3 w-3" />
            Tentar de novo
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !view) {
    return (
      <div className="flex flex-col gap-2" data-testid="dossier-loading">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (view.status === "none") {
    return (
      <div className="flex flex-col gap-3" data-testid="dossier-none">
        <p className="text-sm font-medium">Sem pesquisa</p>
        <p className="text-sm text-muted-foreground">
          Nenhum dossiê encontrado para {leadName}
          {companyName ? ` (${companyName})` : ""}.
        </p>
        {context === "lead_review" && (
          <p className="text-xs text-muted-foreground" data-testid="dossier-lead-review-note">
            {LEAD_REVIEW_NOTE}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <Button type="button" size="sm" disabled data-testid="dossier-generate">
            Gerar pesquisa (em breve)
          </Button>
          <p className="text-xs text-muted-foreground">{GENERATE_RESEARCH_HINT}</p>
        </div>
      </div>
    );
  }

  const { dossier, facts, totalFacts, whyNow } = view;
  const researchedAt = formatTimestamp(dossier.researchedAt);
  const hiddenFacts = Math.max(0, totalFacts - facts.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" data-testid="dossier-found">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium break-words" data-testid="dossier-company">
          {dossier.companyName ?? companyName ?? dossier.companyDomain}
        </p>
        {dossier.companyDomain && (
          <p className="text-xs text-muted-foreground break-all">{dossier.companyDomain}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {researchedAt && (
            <span className="text-xs text-muted-foreground" data-testid="dossier-researched-at">
              Pesquisa de {researchedAt}
            </span>
          )}
          {dossier.expired && (
            <Badge variant="outline" data-testid="dossier-expired">
              Desatualizado
            </Badge>
          )}
          {dossier.dossierStatus === "partial" && (
            <Badge
              variant="outline"
              data-testid="dossier-partial"
              title={
                dossier.failedSources.length > 0
                  ? `Fontes que falharam: ${dossier.failedSources.join(", ")}`
                  : undefined
              }
            >
              Parcial
            </Badge>
          )}
        </div>
        {dossier.dossierStatus === "partial" && dossier.failedSources.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Fontes que falharam: {dossier.failedSources.join(", ")}
          </p>
        )}
      </header>

      <WhyNowSection whyNow={whyNow} />

      <section className="flex min-h-0 flex-1 flex-col gap-1" data-testid="dossier-facts">
        <h3 className="text-sm font-medium">Fatos</h3>
        {facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Pesquisa sem fatos com fonte</p>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <ul className="flex flex-col gap-2">
              {facts.map((fact, index) => (
                <FactItem key={`${fact.kind}-${index}`} fact={fact} />
              ))}
            </ul>
            {hiddenFacts > 0 && (
              <p className="pt-2 text-xs text-muted-foreground" data-testid="dossier-more-facts">
                e mais {hiddenFacts} fatos
              </p>
            )}
          </ScrollArea>
        )}
      </section>
    </div>
  );
}
