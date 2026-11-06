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
  text: z.string(),
  origin: originSchema,
  refs: z.array(z.string()),
});

const objectionSchema = z.object({
  objection: z.string(),
  answer: z.string(),
  origin: originSchema,
  refs: z.array(z.string()),
});

export const meetingPrepSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  account: accountSchema,
  engagement: engagementSchema,
  talkingPoints: z.array(talkingPointSchema),
  objections: z.array(objectionSchema),
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

/** Leitura defensiva do jsonb salvo. Nunca lança. */
export function parseMeetingPrep(value: unknown): MeetingPrep | null {
  if (value === null || value === undefined) return null;
  const parsed = meetingPrepSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
