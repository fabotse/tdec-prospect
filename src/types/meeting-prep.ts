/**
 * Preparação de reunião — contrato salvo em `opportunities.meeting_prep` (versão 1)
 * Story: 24.23 - Preparação de reunião
 *
 * Fonte única do formato. `parseMeetingPrep` lê o jsonb de forma defensiva: qualquer
 * coisa fora do formato vira `null` (o card segue como se não houvesse briefing).
 */

import { z } from "zod";

export const MEETING_PREP_ORIGINS = ["dossie", "resposta", "kb", "sugestao"] as const;

export type MeetingPrepOrigin = (typeof MEETING_PREP_ORIGINS)[number];

const originSchema = z.enum(MEETING_PREP_ORIGINS);

/** Limites do briefing (o gerador e a leitura do jsonb salvo usam os mesmos). */
export const MAX_ITEMS = 5;
export const MIN_TALKING_POINTS = 3;
export const MIN_OBJECTIONS = 1;

/** Ids citáveis fixos do catálogo (os demais são `F1..`, `P1..`). */
export const TRIGGER_REF_ID = "F-GATILHO";
export const REPLY_REF_ID = "R";
export const KB_PAINS_REF_ID = "KB-DORES";
export const KB_OBJECTIONS_REF_ID = "KB-OBJ";

const nonEmpty = z.string().refine((v) => v.trim() !== "");

const factSchema = z.object({
  id: z.string(),
  kind: z.string(),
  fato: z.string(),
  fonteUrl: z.string().nullable(),
  data: z.string(),
});

const accountSchema = z.object({
  status: z.enum(["found", "none", "error"]),
  companyName: z.string().nullable(),
  companyDomain: z.string().nullable(),
  researchedAt: z.string().nullable(),
  expired: z.boolean(),
  facts: z.array(factSchema),
  whyNow: z
    .object({
      gatilho: z.string(),
      hipoteseDor: z.string().nullable(),
    })
    .nullable(),
});

const engagementSchema = z.object({
  source: z.enum(["reply", "engagement"]),
  campaignName: z.string().nullable(),
  replySubject: z.string().nullable(),
  replyText: z.string().nullable(),
  repliedAt: z.string().nullable(),
  openCount: z.number().nullable(),
  clickCount: z.number().nullable(),
  lastEngagementAt: z.string().nullable(),
  meetingBookedAt: z.string().nullable(),
  events: z.array(z.object({ type: z.string(), at: z.string() })),
});

const talkingPointSchema = z.object({
  text: nonEmpty,
  origin: originSchema,
  refs: z.array(z.string()),
});

const objectionSchema = z.object({
  objection: nonEmpty,
  answer: nonEmpty,
  origin: originSchema,
  refs: z.array(z.string()),
});

export const meetingPrepSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  account: accountSchema,
  engagement: engagementSchema,
  talkingPoints: z.array(talkingPointSchema).min(MIN_TALKING_POINTS).max(MAX_ITEMS),
  objections: z.array(objectionSchema).min(MIN_OBJECTIONS).max(MAX_ITEMS),
  /** Ids da KB que estavam no catálogo na geração (`P1..`, `KB-DORES`, `KB-OBJ`). */
  kbRefs: z.array(z.string()),
});

export type MeetingPrep = z.infer<typeof meetingPrepSchema>;
export type MeetingPrepAccount = MeetingPrep["account"];
export type MeetingPrepAccountFact = MeetingPrepAccount["facts"][number];
export type MeetingPrepEngagement = MeetingPrep["engagement"];
export type MeetingPrepTalkingPoint = MeetingPrep["talkingPoints"][number];
export type MeetingPrepObjection = MeetingPrep["objections"][number];

/** Motivo de não haver briefing (resposta fail-open da rota). */
export type MeetingPrepFailureReason =
  | "no_openai_key"
  | "llm_error"
  | "invalid_response"
  | "unavailable";

/**
 * Origem de cada ref que o próprio snapshot sustenta. Fatos (`F1..`) e o gatilho só
 * valem se estiverem salvos na conta e com texto; `R` só com resposta salva; KB só se o
 * id estiver em `kbRefs` (as fontes disponíveis na geração).
 */
function snapshotRefOrigin(
  id: string,
  prep: MeetingPrep
): Exclude<MeetingPrepOrigin, "sugestao"> | null {
  if (prep.account.status === "found") {
    if (prep.account.facts.some((f) => f.id === id && f.fato.trim() !== "")) return "dossie";
    if (id === TRIGGER_REF_ID && prep.account.whyNow?.gatilho.trim()) return "dossie";
  }
  if (id === REPLY_REF_ID && prep.engagement.replyText?.trim()) return "resposta";
  if (prep.kbRefs.includes(id)) return "kb";
  return null;
}

/** Descarta refs que o snapshot não sustenta e rebaixa para `sugestao` a origem sem ref. */
function revalidateItem<T extends { origin: MeetingPrepOrigin; refs: string[] }>(
  item: T,
  prep: MeetingPrep
): T {
  const refs = item.refs.filter((id) => snapshotRefOrigin(id, prep) !== null);
  const supported =
    item.origin !== "sugestao" && refs.some((id) => snapshotRefOrigin(id, prep) === item.origin);
  return { ...item, refs, origin: supported ? item.origin : "sugestao" };
}

/**
 * Leitura defensiva do jsonb salvo. Nunca lança. Fora do formato (inclusive menos de 3
 * pontos ou nenhuma objeção) vira `null`; citação que o snapshot não sustenta vira
 * `sugestao`.
 */
export function parseMeetingPrep(value: unknown): MeetingPrep | null {
  if (value === null || value === undefined) return null;
  const parsed = meetingPrepSchema.safeParse(value);
  if (!parsed.success) return null;
  const prep = parsed.data;
  return {
    ...prep,
    talkingPoints: prep.talkingPoints.map((t) => revalidateItem(t, prep)),
    objections: prep.objections.map((o) => revalidateItem(o, prep)),
  };
}
