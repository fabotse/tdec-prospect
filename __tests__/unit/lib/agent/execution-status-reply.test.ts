/**
 * Story 24.4 — resposta deterministica a texto livre numa execucao confirmada.
 */

import { describe, it, expect } from "vitest";
import {
  buildExecutionStatusReply,
  buildPreExecutionReply,
} from "@/lib/agent/execution-status-reply";
import type { AgentStep, StepStatus, StepType } from "@/types/agent";

const TYPES: StepType[] = ["search_companies", "search_leads", "create_campaign", "export", "activate"];

function steps(
  statuses: StepStatus[],
  outputs: Record<number, Record<string, unknown> | null> = {}
): Pick<AgentStep, "step_number" | "step_type" | "status" | "output">[] {
  return statuses.map((status, i) => ({
    step_number: i + 1,
    step_type: TYPES[i],
    status,
    output: outputs[i + 1] ?? null,
  }));
}

const OPENING = "O briefing desta execucao ja esta confirmado e nao muda por mensagem.";

describe("buildExecutionStatusReply", () => {
  it("sempre abre dizendo que o briefing esta confirmado", () => {
    expect(buildExecutionStatusReply(steps(["running"]))).toMatch(new RegExp(`^${OPENING}`));
    expect(buildExecutionStatusReply([])).toMatch(new RegExp(`^${OPENING}`));
  });

  it("failed retryable cita 'Tentar novamente'", () => {
    const reply = buildExecutionStatusReply(steps(["completed", "failed", "pending"]));
    expect(reply).toContain('"Busca de Leads"');
    expect(reply).toContain('"Tentar novamente"');
  });

  it("failed NAO retryable nao cita 'Tentar novamente' e manda falar com o suporte", () => {
    const reply = buildExecutionStatusReply(
      steps(["completed", "failed"], { 2: { error: { isRetryable: false, message: "x" } } })
    );
    expect(reply).not.toContain("Tentar novamente");
    expect(reply).toContain("suporte");
    expect(reply).toContain('"Nova conversa"');
  });

  it("failed tem prioridade sobre awaiting_approval e running", () => {
    const reply = buildExecutionStatusReply(steps(["awaiting_approval", "running", "failed"]));
    expect(reply).toContain('"Criacao de Campanha"');
    expect(reply).toContain("falhou");
  });

  it("awaiting_approval aponta os botoes do card", () => {
    const reply = buildExecutionStatusReply(steps(["completed", "awaiting_approval", "pending"]));
    expect(reply).toContain("aguardando sua aprovacao");
    expect(reply).toContain("botoes do card");
  });

  it("awaiting_approval tem prioridade sobre running", () => {
    const reply = buildExecutionStatusReply(steps(["running", "awaiting_approval"]));
    expect(reply).toContain("aguardando sua aprovacao");
  });

  it("running diz a etapa N de T", () => {
    const reply = buildExecutionStatusReply(steps(["completed", "completed", "running", "pending", "pending"]));
    expect(reply).toContain("etapa 3 de 5");
    expect(reply).toContain('"Criacao de Campanha"');
  });

  it("tudo concluido (completed/approved/skipped) aponta 'Nova conversa'", () => {
    const reply = buildExecutionStatusReply(steps(["skipped", "approved", "completed"]));
    expect(reply).toContain("Todas as etapas foram concluidas");
    expect(reply).toContain('"Nova conversa"');
  });

  it("proximo pending aguardando inicio", () => {
    const reply = buildExecutionStatusReply(steps(["completed", "pending", "pending"]));
    expect(reply).toContain('A proxima etapa e "Busca de Leads"');
    expect(reply).toContain("aguardando inicio");
  });

  it("ordena por step_number antes de decidir", () => {
    const unordered = [...steps(["completed", "pending", "pending"])].reverse();
    expect(buildExecutionStatusReply(unordered)).toContain('"Busca de Leads"');
  });

  it("lista vazia: em andamento", () => {
    const reply = buildExecutionStatusReply([]);
    expect(reply).toContain("em andamento");
    expect(reply).toContain('"Nova conversa"');
  });

  it("sem acentos (padrao das mensagens do agente)", () => {
    const all = [
      buildExecutionStatusReply([]),
      buildExecutionStatusReply(steps(["failed"])),
      buildExecutionStatusReply(steps(["failed"], { 1: { error: { isRetryable: false } } })),
      buildExecutionStatusReply(steps(["awaiting_approval"])),
      buildExecutionStatusReply(steps(["running"])),
      buildExecutionStatusReply(steps(["completed"])),
      buildExecutionStatusReply(steps(["completed", "pending"])),
    ].join(" ");
    expect(all.normalize("NFD")).toBe(all);
    expect(/[\u0300-\u036f]/.test(all.normalize("NFD"))).toBe(false);
  });
});

describe("buildPreExecutionReply", () => {
  it("plano visivel aponta Confirmar/Cancelar", () => {
    const reply = buildPreExecutionReply({ showModeSelector: false, showExecutionPlan: true });
    expect(reply).toContain('"Confirmar"');
    expect(reply).toContain('"Cancelar"');
  });

  it("seletor de modo visivel aponta o modo", () => {
    const reply = buildPreExecutionReply({ showModeSelector: true, showExecutionPlan: false });
    expect(reply).toContain("modo de operacao");
  });
});
