// ==============================================
// Loop de Resposta — Opportunity domain types (Epic 21, Story 21.1)
//
// Espelha o padrão Row (snake_case) + TS (camelCase) + transform de
// `src/types/tracking.ts`. Um domínio por arquivo (convenção monitoring.ts/agent.ts).
// Sem colisão: `Opportunity` ≠ `OpportunityConfig`/`OpportunityLead` (tracking.ts).
// ==============================================

// ==============================================
// CONST ARRAYS + UNION TYPES + GUARDS
// (padrão EVENT_TYPES/isValidEventType de tracking.ts)
// ==============================================

export const OPPORTUNITY_SOURCES = ["reply", "engagement"] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const OPPORTUNITY_INTENTS = [
  "interessado",
  "pediu_info",
  "objecao",
  "nao_agora",
  "opt_out",
] as const;
export type OpportunityIntent = (typeof OPPORTUNITY_INTENTS)[number];

export const OPPORTUNITY_STATUSES = [
  "new",
  "viewed",
  "contacted",
  "meeting_booked",
  "discarded",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/**
 * Status considerados "ativos" (lead ainda vivo na Central) para o dedup de
 * oportunidades. Story 21.6: inclui `meeting_booked` — não re-abordar (nem re-carding)
 * um lead com reunião já marcada. `discarded` fica DE FORA de propósito: um lead
 * descartado que volta a engajar é um sinal novo que pode ressurgir (decisão Fabossi
 * 2026-07-13, code review 21.6). Compartilhado pelo `engagement-processor` (dedup
 * app-level) e pelo `reply-processor` (pré-check do upgrade engagement→reply) — fonte
 * única para os dois não divergirem.
 */
export const ACTIVE_OPPORTUNITY_STATUSES: readonly OpportunityStatus[] = [
  "new",
  "viewed",
  "contacted",
  "meeting_booked",
];

export function isValidOpportunitySource(value: string): value is OpportunitySource {
  return (OPPORTUNITY_SOURCES as readonly string[]).includes(value);
}

export function isValidOpportunityIntent(value: string): value is OpportunityIntent {
  return (OPPORTUNITY_INTENTS as readonly string[]).includes(value);
}

export function isValidOpportunityStatus(value: string): value is OpportunityStatus {
  return (OPPORTUNITY_STATUSES as readonly string[]).includes(value);
}

// ==============================================
// APRESENTAÇÃO — Story 21.4 (Central de Oportunidades)
// Espelha o padrão leadStatusVariants/LEAD_STATUSES/getStatusConfig de lead.ts
// e o idioma de cor do LeadStatusBadge (bg-{cor}-500/20 + text-{cor}-600/400).
// ==============================================

export interface OpportunityIntentConfig {
  label: string;
  badgeClasses: string;
}

export const OPPORTUNITY_INTENT_CONFIG: Record<OpportunityIntent, OpportunityIntentConfig> = {
  interessado: {
    label: "Interessado",
    badgeClasses: "bg-green-500/20 text-green-600 dark:text-green-400",
  },
  pediu_info: {
    label: "Pediu informações",
    badgeClasses: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  },
  objecao: {
    label: "Objeção",
    badgeClasses: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
  },
  nao_agora: {
    label: "Não agora",
    badgeClasses: "bg-muted text-muted-foreground",
  },
  opt_out: {
    label: "Opt-out",
    badgeClasses: "bg-destructive/20 text-destructive",
  },
};

/**
 * Fallback neutro para `intent` null — caso real e legítimo: a 21.3 é fail-open
 * (resposta ainda não classificada / irresolvível) e `source='engagement'`
 * nunca é classificado.
 */
export const UNCLASSIFIED_INTENT_CONFIG: OpportunityIntentConfig = {
  label: "Não classificado",
  badgeClasses: "bg-muted text-muted-foreground",
};

export function getIntentConfig(
  intent: OpportunityIntent | null | undefined
): OpportunityIntentConfig {
  if (!intent) return UNCLASSIFIED_INTENT_CONFIG;
  // Fallback também para uma chave fora do enum (ex.: valor gravado por futura
  // migration que amplie o CHECK sem atualizar o config) — nunca retornar undefined.
  return OPPORTUNITY_INTENT_CONFIG[intent] ?? UNCLASSIFIED_INTENT_CONFIG;
}

/** Labels pt-BR de status do card — fonte única para filtros/exibição (21.4). */
export const OPPORTUNITY_STATUS_CONFIG: Record<OpportunityStatus, { label: string }> = {
  new: { label: "Nova" },
  viewed: { label: "Vista" },
  contacted: { label: "Contatada" },
  meeting_booked: { label: "Reunião marcada" },
  discarded: { label: "Descartada" },
};

// ==============================================
// OPPORTUNITY — DB Row (snake_case)
// nullable espelha exatamente o schema (00055)
// ==============================================

export interface OpportunityRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  campaign_id: string;
  source: OpportunitySource;
  reply_event_id: string | null;
  reply_text: string | null;
  reply_subject: string | null;
  unibox_url: string | null;
  intent: OpportunityIntent | null;
  lt_interest_status: number | null;
  suggestion: string | null;
  status: OpportunityStatus;
  meeting_booked_at: string | null;
  // Story 21.6: métricas de engajamento (nullable — só source='engagement')
  open_count: number | null;
  click_count: number | null;
  last_engagement_at: string | null;
  created_at: string;
  updated_at: string;
}

// ==============================================
// OPPORTUNITY — TS Type (camelCase)
// ==============================================

export interface Opportunity {
  id: string;
  tenantId: string;
  leadId: string | null;
  campaignId: string;
  source: OpportunitySource;
  replyEventId: string | null;
  replyText: string | null;
  replySubject: string | null;
  uniboxUrl: string | null;
  intent: OpportunityIntent | null;
  ltInterestStatus: number | null;
  suggestion: string | null;
  status: OpportunityStatus;
  meetingBookedAt: string | null;
  // Story 21.6: métricas de engajamento (nullable — só source='engagement')
  openCount: number | null;
  clickCount: number | null;
  lastEngagementAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row (snake_case) -> TS (camelCase). */
export function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    campaignId: row.campaign_id,
    source: row.source,
    replyEventId: row.reply_event_id,
    replyText: row.reply_text,
    replySubject: row.reply_subject,
    uniboxUrl: row.unibox_url,
    intent: row.intent,
    ltInterestStatus: row.lt_interest_status,
    suggestion: row.suggestion,
    status: row.status,
    meetingBookedAt: row.meeting_booked_at,
    openCount: row.open_count,
    clickCount: row.click_count,
    lastEngagementAt: row.last_engagement_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * TS (camelCase) -> Row (snake_case). Novo no projeto (bidirecional exigido pelo
 * AC4): necessário para os INSERTs da 21.2 (processador de respostas via service role).
 */
export function toOpportunityRow(o: Opportunity): OpportunityRow {
  return {
    id: o.id,
    tenant_id: o.tenantId,
    lead_id: o.leadId,
    campaign_id: o.campaignId,
    source: o.source,
    reply_event_id: o.replyEventId,
    reply_text: o.replyText,
    reply_subject: o.replySubject,
    unibox_url: o.uniboxUrl,
    intent: o.intent,
    lt_interest_status: o.ltInterestStatus,
    suggestion: o.suggestion,
    status: o.status,
    meeting_booked_at: o.meetingBookedAt,
    open_count: o.openCount,
    click_count: o.clickCount,
    last_engagement_at: o.lastEngagementAt,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

// ==============================================
// NOTIFICATION_SETTINGS (1 por tenant)
// JSONB channels usa chave snake_case `in_app` no banco -> `inApp` no TS.
// ==============================================

export interface NotificationChannelsRow {
  whatsapp: boolean;
  in_app: boolean;
}

export interface NotificationSettingsRow {
  id: string;
  tenant_id: string;
  whatsapp_numbers: string[];
  channels: NotificationChannelsRow;
  notify_intents: OpportunityIntent[];
  created_at: string;
  updated_at: string;
}

export interface NotificationChannels {
  whatsapp: boolean;
  inApp: boolean;
}

export interface NotificationSettings {
  id: string;
  tenantId: string;
  whatsappNumbers: string[];
  channels: NotificationChannels;
  notifyIntents: OpportunityIntent[];
  createdAt: string;
  updatedAt: string;
}

/** Row (snake_case) -> TS (camelCase). Mapeia channels.in_app -> channels.inApp. */
export function toNotificationSettings(
  row: NotificationSettingsRow
): NotificationSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    whatsappNumbers: row.whatsapp_numbers,
    channels: {
      whatsapp: row.channels.whatsapp,
      inApp: row.channels.in_app,
    },
    notifyIntents: row.notify_intents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==============================================
// APP_NOTIFICATIONS (in-app persistida — imutável exceto read_at)
// ==============================================

export interface AppNotificationRow {
  id: string;
  tenant_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/** Row (snake_case) -> TS (camelCase). */
export function toAppNotification(row: AppNotificationRow): AppNotification {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type,
    payload: row.payload,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
