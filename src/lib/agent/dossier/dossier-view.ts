/**
 * Dossie da conta — montagem da VISAO de exibicao (funcoes puras, sem I/O)
 * Story: 24.22 - Dossie visivel na revisao e na oportunidade
 *
 * Le de forma defensiva o `whyNow` do output do `research_accounts` (24.20) e os fatos do
 * dossie (24.19) e monta o DTO do painel. So server-side (importa `httpUrl` de `facts.ts`).
 */

import type { LeadWhyNow, WhyNowSourceFact } from "@/types/agent";
import type {
  AccountDossierView,
  AccountDossierViewDossier,
  DossierViewFact,
  DossierViewFactKind,
  DossierViewWhyNow,
} from "@/types/account-dossier";
import { httpUrl, type DossierFact } from "./facts";

/** D8: teto de fatos exibidos no painel. */
export const DOSSIER_VIEW_MAX_FACTS = 50;

/** D8: ordem por tipo (Noticia, Vaga, Post, Site, Tecnologia). */
const KIND_ORDER: Record<DossierViewFactKind, number> = {
  news: 0,
  job: 1,
  post: 2,
  site: 3,
  technology: 4,
};

const CONFIDENCES = new Set(["baixa", "media", "alta"]);
const DOSSIER_STATUSES = new Set(["complete", "partial", "empty"]);

export interface LeadIdent {
  apolloId?: string | null;
  email?: string | null;
}

export interface DossierRow {
  id: string;
  company_domain?: unknown;
  company_name?: unknown;
  status?: unknown;
  failed_sources?: unknown;
  researched_at?: unknown;
  expires_at?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function lower(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function parseSourceFact(value: unknown): WhyNowSourceFact | null {
  if (!isRecord(value)) return null;
  const { kind, fato, fonte_url, data, confianca, ref } = value;
  if (kind !== "news" && kind !== "job" && kind !== "post") return null;
  if (typeof fato !== "string" || typeof fonte_url !== "string" || typeof data !== "string") return null;
  if (confianca !== "media" && confianca !== "alta") return null;
  return { ref: typeof ref === "number" ? ref : -1, kind, fato, fonte_url, data, confianca };
}

/** Entrada do `whyNow.leads[]` validada (fora do formato = null). */
function parseLeadEntry(value: unknown): LeadWhyNow | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  if (status !== "trigger" && status !== "no_trigger") return null;
  const entry: LeadWhyNow = {
    leadIndex: typeof value.leadIndex === "number" ? value.leadIndex : -1,
    apolloId: str(value.apolloId),
    email: lower(str(value.email)),
    companyDomain: str(value.companyDomain),
    dossierId: str(value.dossierId),
    status,
  };
  if (typeof value.reason === "string") entry.reason = value.reason as LeadWhyNow["reason"];
  const trigger = value.trigger;
  if (isRecord(trigger)) {
    const fatoOrigem = parseSourceFact(trigger.fatoOrigem);
    if (
      typeof trigger.gatilho === "string" &&
      typeof trigger.hipoteseDor === "string" &&
      (trigger.confianca === "media" || trigger.confianca === "alta") &&
      fatoOrigem
    ) {
      entry.trigger = {
        gatilho: trigger.gatilho,
        hipoteseDor: trigger.hipoteseDor,
        confianca: trigger.confianca,
        fatoOrigem,
      };
    }
  }
  return entry;
}

/**
 * Le `output.whyNow` (24.20) de forma defensiva e casa o lead por `apolloId`, depois por
 * e-mail minusculo. Output antigo (sem `whyNow`) ou fora do formato = null.
 */
export function findLeadWhyNow(whyNow: unknown, ident: LeadIdent): LeadWhyNow | null {
  if (!isRecord(whyNow) || !Array.isArray(whyNow.leads)) return null;
  const entries = whyNow.leads.map(parseLeadEntry).filter((e): e is LeadWhyNow => e !== null);
  const apolloId = ident.apolloId?.trim() || null;
  if (apolloId) {
    const byApollo = entries.find((e) => e.apolloId === apolloId);
    if (byApollo) return byApollo;
  }
  const email = lower(ident.email);
  if (email) {
    const byEmail = entries.find((e) => e.email === email);
    if (byEmail) return byEmail;
  }
  return null;
}

/** Entrada do `whyNow` -> DTO. null = gatilho nao avaliado. */
export function toWhyNowView(entry: LeadWhyNow | null): DossierViewWhyNow | null {
  if (!entry) return null;
  if (entry.status === "trigger" && entry.trigger) {
    return {
      status: "trigger",
      reason: null,
      gatilho: entry.trigger.gatilho,
      hipoteseDor: entry.trigger.hipoteseDor,
      confianca: entry.trigger.confianca,
      fonteUrl: httpUrl(entry.trigger.fatoOrigem.fonte_url),
      data: entry.trigger.fatoOrigem.data,
    };
  }
  return {
    status: "no_trigger",
    reason: entry.reason ?? null,
    gatilho: null,
    hipoteseDor: null,
    confianca: null,
    fonteUrl: null,
    data: null,
  };
}

/** D7: post so aparece quando e do lead aberto. */
function isOwnPost(fact: DossierFact, ident: LeadIdent): boolean {
  const apolloId = ident.apolloId?.trim() || null;
  if (apolloId && fact.lead_apollo_id && fact.lead_apollo_id === apolloId) return true;
  const email = lower(ident.email);
  const factEmail = lower(fact.lead_email ?? null);
  return Boolean(email && factEmail && factEmail === email);
}

function sanitizeDossier(row: DossierRow, now: Date): AccountDossierViewDossier {
  const status = DOSSIER_STATUSES.has(row.status as string)
    ? (row.status as AccountDossierViewDossier["dossierStatus"])
    : "partial";
  const failedSources = Array.isArray(row.failed_sources)
    ? row.failed_sources.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  const expiresAt = typeof row.expires_at === "string" ? new Date(row.expires_at).getTime() : NaN;
  return {
    id: row.id,
    companyName: str(row.company_name),
    companyDomain: str(row.company_domain) ?? "",
    dossierStatus: status,
    failedSources,
    researchedAt: str(row.researched_at) ?? "",
    expired: Number.isFinite(expiresAt) && expiresAt < now.getTime(),
  };
}

/**
 * Monta o DTO `found`: aplica D7 (posts so do lead), D8 (ordem, `isTriggerSource`, corte)
 * e revalida as URLs.
 */
export function buildDossierView(params: {
  dossierRow: DossierRow;
  facts: DossierFact[];
  ident: LeadIdent;
  whyNowEntry: LeadWhyNow | null;
  now: Date;
}): AccountDossierView {
  const { dossierRow, facts, ident, whyNowEntry, now } = params;
  const origin = whyNowEntry?.status === "trigger" ? whyNowEntry.trigger?.fatoOrigem ?? null : null;

  const visible = facts
    .filter((fact) => Object.hasOwn(KIND_ORDER, fact.kind) && CONFIDENCES.has(fact.confianca))
    .filter((fact) => fact.kind !== "post" || isOwnPost(fact, ident))
    .sort((a, b) => {
      const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (byKind !== 0) return byKind;
      return a.data < b.data ? 1 : a.data > b.data ? -1 : 0;
    });

  const viewFacts: DossierViewFact[] = visible.slice(0, DOSSIER_VIEW_MAX_FACTS).map((fact) => ({
    kind: fact.kind,
    fato: fact.fato,
    fonteUrl: httpUrl(fact.fonte_url),
    data: fact.data,
    confianca: fact.confianca,
    isTriggerSource: Boolean(
      origin &&
        origin.kind === fact.kind &&
        origin.fato === fact.fato &&
        origin.fonte_url === fact.fonte_url
    ),
  }));

  return {
    status: "found",
    dossier: sanitizeDossier(dossierRow, now),
    facts: viewFacts,
    totalFacts: visible.length,
    whyNow: toWhyNowView(whyNowEntry),
  };
}
