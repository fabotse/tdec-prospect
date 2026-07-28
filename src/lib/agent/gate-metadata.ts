/**
 * Carimbo DURAVEL no metadata da mensagem de approval gate.
 * Story 22.18 (AC3) — generaliza o padrao introduzido pela Story 22.13 no reject.
 *
 * Por que existe: o estado de um gate ("aprovado", "rejeitado", "ativado", "adiado")
 * era estado LOCAL do componente React — sumia no remount/refresh e o card voltava com
 * os botoes ativos, ou seja, mentindo sobre uma acao ja tomada. O carimbo vive no
 * `metadata` (JSONB) da mensagem de gate MAIS RECENTE do step: depois de uma
 * re-execucao existem varios `approval_gate` do mesmo step e so o ultimo vale.
 *
 * FAIL-OPEN de proposito: a acao em si (step + mensagens) ja esta persistida quando
 * este helper roda. Um erro aqui e de AUDITORIA e nao pode transformar uma acao
 * bem-sucedida em erro para o usuario.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StepType } from "@/types/agent";

export interface StampGateFilter {
  /** Restringe ao gate de um step especifico (quando o chamador sabe o numero). */
  stepNumber?: number;
  /**
   * Exige que o gate mais recente seja de um tipo de step especifico. Usado por quem
   * NAO sabe o numero do step do gate (o ActivateStep e o step SEGUINTE ao do gate).
   */
  stepType?: StepType;
}

/**
 * Espalha `patch` no metadata do approval gate mais recente da execucao.
 *
 * @returns `true` se carimbou; `false` se nao havia gate, se o filtro nao casou ou se
 *          a escrita falhou (nunca lanca).
 */
export async function stampLatestApprovalGate(
  db: SupabaseClient,
  executionId: string,
  patch: Record<string, unknown>,
  filter: StampGateFilter = {}
): Promise<boolean> {
  try {
    let query = db
      .from("agent_messages")
      .select("id, metadata")
      .eq("execution_id", executionId)
      .eq("metadata->>messageType", "approval_gate");

    if (filter.stepNumber !== undefined) {
      query = query.eq("metadata->>stepNumber", String(filter.stepNumber));
    }

    const { data: gateRows } = await query
      .order("created_at", { ascending: false })
      .limit(1);

    const gate = Array.isArray(gateRows) ? gateRows[0] : null;
    if (!gate?.id) return false;

    const currentMetadata =
      gate.metadata && typeof gate.metadata === "object"
        ? (gate.metadata as Record<string, unknown>)
        : {};

    if (filter.stepType) {
      const approvalData = currentMetadata.approvalData as
        | { stepType?: string }
        | undefined;
      // Filtro em JS (e nao no PostgREST) para nao depender de path JSON aninhado.
      if (approvalData?.stepType !== filter.stepType) return false;
    }

    // JSONB nao tem update parcial pelo client JS: le, espalha e regrava.
    const { error } = await db
      .from("agent_messages")
      .update({ metadata: { ...currentMetadata, ...patch } })
      .eq("id", gate.id);

    return !error;
  } catch {
    // auditoria e best-effort — ver comentario do cabecalho
    return false;
  }
}
