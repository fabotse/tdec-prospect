/**
 * Story 24.24 — fixtures da conversa depois da execucao.
 */

import { vi } from "vitest";
import type { ConversationStep } from "@/lib/agent/conversation/context";

export const LEAD_JOAO = {
  name: "Joao Silva",
  title: "CISO",
  companyName: "Banco X",
  email: "joao@bancox.com.br",
  linkedinUrl: null,
  apolloId: "ap-joao",
  fitScore: "A",
  fitReason: "CISO de banco medio em SP, igual ao ICP",
};

export const LEAD_MARIA = {
  name: "Maria Souza",
  title: "CTO",
  companyName: "Seg Z",
  email: "maria@segz.com.br",
  linkedinUrl: null,
  apolloId: "ap-maria",
  fitScore: "B",
  fitReason: "Cargo certo, porte menor",
};

export const EMAIL_BLOCKS = [
  { position: 1, subject: "Seguranca no Banco X", body: "Oi {{first_name}}, ...", emailMode: "initial" },
  { position: 3, subject: "Re: seguranca", body: "Retomando, {{first_name}}...", emailMode: "follow-up" },
  { position: 5, subject: "Ultima ideia", body: "Fecho por aqui, {{first_name}}.", emailMode: "follow-up" },
];

export function buildSteps(overrides?: {
  campaignStatus?: ConversationStep["status"];
  withCampaign?: boolean;
  withResearch?: boolean;
}): ConversationStep[] {
  const steps: ConversationStep[] = [
    {
      step_number: 1,
      step_type: "search_leads",
      status: "completed",
      output: { leads: [LEAD_JOAO, LEAD_MARIA], totalFound: 2, jobTitles: ["CISO"], domainsSearched: [] },
    },
  ];
  if (overrides?.withResearch !== false) {
    steps.push({
      step_number: 2,
      step_type: "research_accounts",
      status: "completed",
      output: {
        accounts: [
          { companyName: "Banco X", domain: "bancox.com.br", dossierId: "dos-1", status: "complete" },
          { companyName: "Seg Z", domain: "segz.com.br", dossierId: null, status: "skipped" },
        ],
        whyNow: {
          leads: [
            {
              leadIndex: 0,
              apolloId: "ap-joao",
              email: "joao@bancox.com.br",
              companyDomain: "bancox.com.br",
              dossierId: "dos-1",
              status: "trigger",
              trigger: {
                gatilho: "Vaga: Banco X contrata analista de SOC",
                hipoteseDor: "O time de SOC esta sobrecarregado?",
                confianca: "alta",
                fatoOrigem: {
                  ref: 0,
                  kind: "job",
                  fato: "Banco X contrata analista de SOC",
                  fonte_url: "https://vagas.example/1",
                  data: "2026-10-01",
                  confianca: "alta",
                },
              },
            },
          ],
        },
      },
    });
  }
  if (overrides?.withCampaign !== false) {
    steps.push({
      step_number: 3,
      step_type: "create_campaign",
      status: overrides?.campaignStatus ?? "awaiting_approval",
      output: { campaignName: "Campanha", emailBlocks: EMAIL_BLOCKS },
    });
  }
  return steps;
}

export const FACTS = {
  "dos-1": [
    {
      kind: "news" as const,
      fato: "Banco X anuncia expansao digital",
      fonte_url: "https://news.example/1",
      data: "2026-09-10",
      confianca: "alta" as const,
    },
  ],
};

/** Client do LLM fake: devolve `content` (string) ou lanca `error`. */
export function fakeLlm(content: string | Error, usage = { prompt_tokens: 100, completion_tokens: 20 }) {
  const create = vi.fn(async () => {
    if (content instanceof Error) throw content;
    return { choices: [{ message: { content } }], usage };
  });
  return { factory: () => ({ chat: { completions: { create } } }), create };
}
