/**
 * Story 24.25 — Memória entre execuções.
 *
 * Contrato único para o servidor (`execution-memory.ts`), a rota de histórico
 * (`/api/agent/lead-history`), o plano (`GET .../plan?memory=1`) e a UI.
 * Tudo é somente leitura e informativo: nada aqui muda plano, custo, seleção ou Aprovar.
 */

/** Execução anterior parecida com o briefing atual, com os resultados do loop do Epic 21. */
export interface PreviousExecutionMemory {
  executionId: string;
  /** ISO da criação da execução anterior. */
  createdAt: string;
  /** Rótulo curto do briefing anterior (ex.: "CISO · São Paulo"). */
  label: string;
  campaignName: string;
  /** Leads distintos que responderam (`campaign_events` `email_replied`). */
  replies: number;
  /** Oportunidades da campanha (`opportunities`). */
  opportunities: number;
  /** Oportunidades com `status = meeting_booked`. */
  meetings: number;
}

export const LEAD_WORK_RESULTS = [
  "meeting_booked",
  "opportunity",
  "replied",
  "engaged",
  "opt_out",
  "discarded",
  "no_reply",
] as const;
export type LeadWorkResult = (typeof LEAD_WORK_RESULTS)[number];

export const LEAD_WORK_RESULT_LABELS: Record<LeadWorkResult, string> = {
  meeting_booked: "reunião marcada",
  opportunity: "oportunidade aberta",
  replied: "respondeu",
  engaged: "engajou",
  opt_out: "pediu para sair",
  discarded: "descartada",
  no_reply: "sem resposta registrada",
};

/** Uma campanha em que o lead já esteve. */
export interface LeadWorkEntry {
  campaignName: string;
  /** ISO de quando o lead entrou na campanha. */
  date: string;
  result: LeadWorkResult;
}

/** Resumo da conta (empresa) já trabalhada com outros contatos do tenant. */
export interface AccountWorkSummary {
  /** Quantos contatos da conta estiveram em campanha. */
  contacts: number;
  lastCampaignName: string;
  /** ISO da entrada mais recente em campanha. */
  lastDate: string;
  /** Melhor resultado entre todos os contatos da conta. */
  result: LeadWorkResult;
}

export interface LeadWorkHistoryResponse {
  /** Chave: `apolloId`. Até 3 entradas, mais recentes primeiro. */
  leads: Record<string, LeadWorkEntry[]>;
  /** Chave: `companyName` exato. */
  accounts: Record<string, AccountWorkSummary>;
}

/** Data em dd/mm/aaaa (fuso de São Paulo). Valor inválido → string vazia. */
export function formatMemoryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}
