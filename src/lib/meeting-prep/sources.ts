/**
 * Preparação de reunião — catálogo de fontes e seções determinísticas (puro)
 * Story: 24.23 - Preparação de reunião
 *
 * Separa o dado real do texto da LLM:
 * - `account` e `engagement` são montados aqui, só com dados do banco (sem LLM);
 * - o catálogo é a ÚNICA coisa que a LLM recebe, e cada entrada tem um id citável
 *   (`F1..F8`, `F-GATILHO`, `R`, `P1..P20`, `KB-DORES`, `KB-OBJ`). O gerador revalida
 *   cada citação contra este catálogo.
 */

import type { AccountDossierView } from "@/types/account-dossier";
import type { KnowledgeBaseProof } from "@/types/knowledge-base";
import { PROOF_TYPES } from "@/types/knowledge-base";
import type {
  MeetingPrepAccount,
  MeetingPrepEngagement,
  MeetingPrepOrigin,
} from "@/types/meeting-prep";

export const MAX_DOSSIER_FACTS = 8;
export const MAX_PROOFS = 20;
export const REPLY_MAX_CHARS = 2000;
export const KB_TEXT_MAX_CHARS = 1500;
export const MAX_EVENTS = 20;

import {
  TRIGGER_REF_ID,
  REPLY_REF_ID,
  KB_PAINS_REF_ID,
  KB_OBJECTIONS_REF_ID,
} from "@/types/meeting-prep";

export { TRIGGER_REF_ID, REPLY_REF_ID, KB_PAINS_REF_ID, KB_OBJECTIONS_REF_ID };

// ==============================================
// TIPOS
// ==============================================

/** Resultado da leitura do dossiê, já reduzido ao que o briefing usa. */
export type MeetingPrepDossierInput =
  | { status: "found"; view: Extract<AccountDossierView, { status: "found" }> }
  | { status: "none" }
  | { status: "error" };

export interface MeetingPrepOpportunityInput {
  source: "reply" | "engagement";
  replySubject: string | null;
  replyText: string | null;
  openCount: number | null;
  clickCount: number | null;
  lastEngagementAt: string | null;
  meetingBookedAt: string | null;
  createdAt: string;
}

export interface MeetingPrepEventInput {
  event_type: string;
  event_timestamp: string;
}

/** Conteúdo do ICP da KB (jsonb — tudo opcional). */
export interface MeetingPrepIcpInput {
  pain_points?: unknown;
  common_objections?: unknown;
}

export interface BuildMeetingPrepSourcesInput {
  dossier: MeetingPrepDossierInput;
  opportunity: MeetingPrepOpportunityInput;
  campaignName: string | null;
  events: MeetingPrepEventInput[];
  proofs: KnowledgeBaseProof[];
  icp: MeetingPrepIcpInput | null;
  lead: { title: string | null; companyName: string | null } | null;
}

export interface CatalogFact {
  id: string;
  kind: string;
  fato: string;
  data: string;
  fonteUrl: string | null;
}

export interface CatalogProof {
  id: string;
  label: string;
  text: string;
  sector: string | null;
}

export interface MeetingPrepCatalog {
  facts: CatalogFact[];
  trigger: { id: string; gatilho: string; hipoteseDor: string | null } | null;
  reply: { id: string; subject: string | null; text: string } | null;
  proofs: CatalogProof[];
  kbPains: { id: string; text: string } | null;
  kbObjections: { id: string; text: string } | null;
  /** Contexto não citável (sem nome nem e-mail). */
  lead: { title: string | null; companyName: string | null };
}

export interface MeetingPrepSources {
  catalog: MeetingPrepCatalog;
  account: MeetingPrepAccount;
  engagement: MeetingPrepEngagement;
}

// ==============================================
// HELPERS
// ==============================================

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...` : value;
}

function nullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

/** Provas autorizadas, como `formatAuthorizedProofs` (created_at asc, máx. 20). */
function authorizedProofs(proofs: KnowledgeBaseProof[]): KnowledgeBaseProof[] {
  const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, " ").trim();
  return (Array.isArray(proofs) ? proofs : [])
    .filter((p) => p && p.is_authorized === true && oneLine(p.text ?? "") !== "")
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => {
      const ta = Date.parse(a.p.created_at);
      const tb = Date.parse(b.p.created_at);
      const da = Number.isNaN(ta) ? 0 : ta;
      const db = Number.isNaN(tb) ? 0 : tb;
      return da - db || a.idx - b.idx;
    })
    .slice(0, MAX_PROOFS)
    .map(({ p }) => ({ ...p, text: oneLine(p.text) }));
}

// ==============================================
// BUILD
// ==============================================

export function buildMeetingPrepSources(input: BuildMeetingPrepSourcesInput): MeetingPrepSources {
  const { dossier, opportunity } = input;

  // ---- Conta (dossiê) ----
  let facts: CatalogFact[] = [];
  let trigger: MeetingPrepCatalog["trigger"] = null;
  let account: MeetingPrepAccount;

  if (dossier.status === "found") {
    const view = dossier.view;
    facts = view.facts
      .filter((f) => cleanText(f.fato) !== "")
      .slice(0, MAX_DOSSIER_FACTS)
      .map((f, i) => ({
        id: `F${i + 1}`,
        kind: f.kind,
        fato: cleanText(f.fato),
        data: f.data,
        fonteUrl: f.fonteUrl ?? null,
      }));
    const gatilho = view.whyNow?.status === "trigger" ? cleanText(view.whyNow.gatilho) : "";
    if (gatilho) {
      trigger = {
        id: TRIGGER_REF_ID,
        gatilho,
        hipoteseDor: nullableText(view.whyNow?.hipoteseDor),
      };
    }
    account = {
      status: "found",
      companyName: view.dossier.companyName ?? null,
      companyDomain: view.dossier.companyDomain || null,
      researchedAt: view.dossier.researchedAt || null,
      expired: view.dossier.expired === true,
      facts: facts.map((f) => ({ ...f })),
      whyNow: trigger ? { gatilho: trigger.gatilho, hipoteseDor: trigger.hipoteseDor } : null,
    };
  } else {
    account = {
      status: dossier.status,
      companyName: input.lead?.companyName ?? null,
      companyDomain: null,
      researchedAt: null,
      expired: false,
      facts: [],
      whyNow: null,
    };
  }

  // ---- Resposta ----
  const replyText = cleanText(opportunity.replyText);
  const replySubject = nullableText(opportunity.replySubject);
  const reply: MeetingPrepCatalog["reply"] = replyText
    ? { id: REPLY_REF_ID, subject: replySubject, text: clip(replyText, REPLY_MAX_CHARS) }
    : null;

  // ---- Eventos (já vêm em ordem desc do banco; reordena por segurança) ----
  const events = (Array.isArray(input.events) ? input.events : [])
    .filter((e) => e && typeof e.event_type === "string" && typeof e.event_timestamp === "string")
    .map((e) => ({ type: e.event_type, at: e.event_timestamp }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, MAX_EVENTS);

  const lastReplyEvent = events.find((e) => e.type === "email_replied");
  const repliedAt =
    opportunity.source === "reply" ? (lastReplyEvent?.at ?? opportunity.createdAt) : (lastReplyEvent?.at ?? null);

  const engagement: MeetingPrepEngagement = {
    source: opportunity.source,
    campaignName: input.campaignName ?? null,
    replySubject,
    replyText: replyText ? clip(replyText, REPLY_MAX_CHARS) : null,
    repliedAt,
    openCount: opportunity.openCount ?? null,
    clickCount: opportunity.clickCount ?? null,
    lastEngagementAt: opportunity.lastEngagementAt ?? null,
    meetingBookedAt: opportunity.meetingBookedAt ?? null,
    events,
  };

  // ---- KB ----
  const proofs: CatalogProof[] = authorizedProofs(input.proofs).map((p, i) => ({
    id: `P${i + 1}`,
    label: PROOF_TYPES.find((t) => t.value === p.proof_type)?.label ?? String(p.proof_type),
    text: p.text,
    sector: nullableText(p.sector),
  }));
  const pains = cleanText(input.icp?.pain_points);
  const objections = cleanText(input.icp?.common_objections);

  const catalog: MeetingPrepCatalog = {
    facts,
    trigger,
    reply,
    proofs,
    kbPains: pains ? { id: KB_PAINS_REF_ID, text: clip(pains, KB_TEXT_MAX_CHARS) } : null,
    kbObjections: objections
      ? { id: KB_OBJECTIONS_REF_ID, text: clip(objections, KB_TEXT_MAX_CHARS) }
      : null,
    lead: {
      title: nullableText(input.lead?.title),
      companyName: nullableText(input.lead?.companyName),
    },
  };

  return { catalog, account, engagement };
}

/**
 * Ids citáveis do catálogo e a origem de cada um. Só entra id com conteúdo: `R` exige
 * resposta não vazia, `KB-DORES`/`KB-OBJ` exigem texto.
 */
export function catalogRefOrigins(
  catalog: MeetingPrepCatalog
): Map<string, Exclude<MeetingPrepOrigin, "sugestao">> {
  const map = new Map<string, Exclude<MeetingPrepOrigin, "sugestao">>();
  for (const f of catalog.facts) map.set(f.id, "dossie");
  if (catalog.trigger) map.set(catalog.trigger.id, "dossie");
  if (catalog.reply && catalog.reply.text) map.set(catalog.reply.id, "resposta");
  for (const p of catalog.proofs) map.set(p.id, "kb");
  if (catalog.kbPains) map.set(catalog.kbPains.id, "kb");
  if (catalog.kbObjections) map.set(catalog.kbObjections.id, "kb");
  return map;
}
