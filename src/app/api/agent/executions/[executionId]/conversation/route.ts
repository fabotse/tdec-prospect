/**
 * API Route: POST /api/agent/executions/[executionId]/conversation
 * Story 24.24: Conversa depois da execucao.
 *
 * Body: { message: string } (1..2000 caracteres)
 *
 * Le no servidor o output dos steps, os fatos do dossie e o historico recente, e pede ao
 * LLM so o texto e a intencao. O resto e decidido aqui:
 * - pergunta     -> `{kind:"answer", reply}`;
 * - reescrita    -> nova versao revisada (24.9) num card; a troca so acontece no clique
 *                   "Substituir na previa" (gate aberto). Nada e gravado aqui;
 * - mais leads   -> card com a acao e o custo estimado; o clique so abre uma conversa nova
 *                   preenchida, que segue o pipeline normal (briefing -> plano -> Confirmar).
 *
 * Fail-safe: sem chave, timeout, JSON invalido ou erro de banco -> `{kind:"fallback"}` e o
 * chat responde com o status de hoje. Nunca 500 por falha do LLM. A unica escrita e o log
 * em `api_usage_logs` (mais o lazy seed ja existente de `cost_models`).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { readServiceApiKey } from "@/lib/agent/service-keys";
import { logAgentUsage } from "@/lib/agent/agent-usage";
import { readDossierFacts } from "@/lib/agent/dossier/repository";
import type { DossierFact } from "@/lib/agent/dossier/facts";
import { CostEstimatorService } from "@/lib/services/agent-cost-estimator";
import { calculatePostExecutionChatCost } from "@/lib/ai/post-execution-chat-config";
import {
  CATALOG_MAX_ACCOUNTS,
  buildConversationCatalog,
  findCampaignStep,
  hasConversationalOutput,
  readCampaignEmails,
  type ConversationStep,
} from "@/lib/agent/conversation/context";
import { interpretMessage, type ConversationTurn } from "@/lib/agent/conversation/interpreter";
import { rewriteEmailBlock } from "@/lib/agent/conversation/rewrite";
import { loadCopyReviewContext } from "@/lib/agent/conversation/kb-review-context";
import { buildMoreLeadsBriefing } from "@/lib/agent/conversation/more-leads";
import type { ConversationLlmUsage } from "@/lib/agent/conversation/llm";
import type { ExecutionStatus, ParsedBriefing, ResearchAccountsOutput } from "@/types/agent";
import type { PostExecutionChatResult } from "@/types/post-execution-chat";

// Intencao (15s) + reescrita (20s) + revisor (ate 70s) + leituras.
export const maxDuration = 120;

const MESSAGE_MAX_CHARS = 2000;
const HISTORY_LIMIT = 10;
const TERMINAL_STATUSES: readonly ExecutionStatus[] = ["completed", "failed", "cancelled"];

const requestSchema = z.object({
  message: z.string().trim().min(1).max(MESSAGE_MAX_CHARS),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function respond(result: PostExecutionChatResult) {
  return NextResponse.json({ data: result });
}

const FALLBACK: PostExecutionChatResult = { kind: "fallback" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) return errorResponse(401, "UNAUTHORIZED", "Nao autenticado");
  const tenantId = profile.tenant_id;

  const { executionId } = await params;
  const supabase = (await createClient()) as unknown as SupabaseClient;

  const { data: execution, error: execError } = await supabase
    .from("agent_executions")
    .select("id, status, briefing")
    .eq("id", executionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (execError || !execution) {
    return errorResponse(404, "EXECUTION_NOT_FOUND", "Execucao nao encontrada");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "JSON invalido");
  }
  const validation = requestSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `Envie uma mensagem de 1 a ${MESSAGE_MAX_CHARS} caracteres.`
    );
  }
  const message = validation.data.message;
  const briefing = (execution.briefing ?? null) as ParsedBriefing | null;
  const executionStatus = execution.status as ExecutionStatus;

  try {
    const { data: stepRows, error: stepsError } = await supabase
      .from("agent_steps")
      .select("step_number, step_type, status, output")
      .eq("execution_id", executionId)
      .order("step_number", { ascending: true });
    if (stepsError || !Array.isArray(stepRows)) return respond(FALLBACK);
    const steps = stepRows as ConversationStep[];
    if (!hasConversationalOutput(steps)) return respond(FALLBACK);

    const keyLookup = await readServiceApiKey(tenantId, "openai");
    if (keyLookup.status !== "ok") return respond(FALLBACK);
    const apiKey = keyLookup.apiKey;

    const [history, facts] = await Promise.all([
      readHistory(supabase, executionId, message),
      readFacts(supabase, tenantId, steps),
    ]);
    const catalog = buildConversationCatalog({ steps, facts, briefing });

    const interpreted = await interpretMessage({ message, history, catalog }, apiKey);
    await logLlmUsage(tenantId, executionId, "agent_conversation", interpreted.usage, interpreted.error, {
      intent: interpreted.intent?.kind ?? null,
    });
    const intent = interpreted.intent;
    if (!intent) return respond(FALLBACK);

    if (intent.kind === "answer") {
      return respond({ kind: "answer", reply: intent.reply });
    }

    if (intent.kind === "rewrite") {
      const campaignStep = findCampaignStep(steps);
      const emails = readCampaignEmails(campaignStep);
      if (!campaignStep || emails.length === 0) {
        return respond({
          kind: "answer",
          reply:
            "Ainda nao ha e-mails para reescrever: a campanha desta execucao ainda nao foi criada.",
        });
      }
      const listing = emails.map((e) => e.n).join(", ");
      const position =
        intent.position ?? (emails.length === 1 ? 1 : null);
      const email = position !== null ? emails.find((e) => e.n === position) : undefined;
      if (!email) {
        return respond({
          kind: "answer",
          reply:
            position === null
              ? `A campanha tem ${emails.length} e-mails (${listing}). Qual deles voce quer reescrever?`
              : `Nao existe o e-mail ${position}. A campanha tem ${emails.length} ${emails.length === 1 ? "e-mail" : "e-mails"} (${listing}).`,
        });
      }

      const context = await loadCopyReviewContext(supabase, tenantId, briefing);
      const rewrite = await rewriteEmailBlock({
        original: { subject: email.subject, body: email.body },
        emailMode: email.emailMode,
        instruction: message,
        context,
        apiKey,
        tenantId,
        executionId,
        emailPosition: email.n,
      });
      await logLlmUsage(tenantId, executionId, "agent_conversation_rewrite", rewrite.usage, rewrite.error, {
        emailPosition: email.n,
      });
      if (!rewrite.result) return respond(FALLBACK);

      const canApply = campaignStep.status === "awaiting_approval";
      const blockedReason = canApply
        ? null
        : campaignStep.status === "approved" || campaignStep.status === "completed"
          ? "A campanha ja foi aprovada e enviada ao Instantly. Copie o texto se quiser usar."
          : "A campanha nao esta aguardando aprovacao, entao a previa nao pode ser trocada.";
      const reply =
        `Escrevi uma nova versao do e-mail ${email.n}. Ela vale para todos os leads da campanha (o e-mail e um template).` +
        (canApply
          ? ' Nada muda ate voce clicar em "Substituir na previa".'
          : ` ${blockedReason}`);
      return respond({
        kind: "rewrite",
        reply,
        proposal: {
          stepNumber: campaignStep.step_number,
          position: email.n,
          blockPosition: email.blockPosition,
          emailMode: email.emailMode,
          original: { subject: email.subject, body: email.body },
          proposed: rewrite.result.proposed,
          review: rewrite.result.review,
          canApply,
          blockedReason,
        },
      });
    }

    // more_leads
    const nextBriefing = buildMoreLeadsBriefing(briefing, intent.count);
    if (!nextBriefing) {
      return respond({
        kind: "answer",
        reply: briefing?.importedLeads?.length
          ? "Esta execucao usou leads importados, entao nao ha busca para repetir. Para buscar novos leads, comece uma nova conversa com os criterios da busca."
          : "Esta execucao nao tem criterios de busca para repetir. Para buscar novos leads, comece uma nova conversa com os criterios da busca.",
      });
    }
    const costModels = await CostEstimatorService.ensureCostModels(supabase, tenantId);
    const tregConfigured = await CostEstimatorService.isTregConfigured(tenantId);
    const estimatedCostBRL = CostEstimatorService.estimateCosts(costModels, nextBriefing, {
      tregConfigured,
    }).total;
    const canStart = TERMINAL_STATUSES.includes(executionStatus);
    const reference = intent.referenceName ? ` parecidos com ${intent.referenceName}` : "";
    return respond({
      kind: "more_leads",
      reply:
        `Posso abrir uma nova busca com os mesmos criterios desta execucao para ${intent.count} ${intent.count === 1 ? "lead" : "leads"}${reference}. ` +
        "Nada roda agora: o clique abre uma conversa nova com o briefing preenchido, e a busca so comeca depois do plano com o custo e do Confirmar. Leads ja contatados ficam de fora.",
      proposal: {
        count: intent.count,
        referenceName: intent.referenceName,
        briefing: nextBriefing,
        estimatedCostBRL,
        canStart,
        blockedReason: canStart ? null : "Disponivel quando esta execucao terminar.",
      },
    });
  } catch (error) {
    console.error(
      "[post-execution-chat] falha, usando a resposta de status:",
      error instanceof Error ? error.message : error
    );
    return respond(FALLBACK);
  }
}

// ==============================================
// LEITURAS (nenhuma lanca)
// ==============================================

/** Ultimas mensagens de texto (usuario/agente), sem a mensagem atual (ja gravada). */
async function readHistory(
  supabase: SupabaseClient,
  executionId: string,
  message: string
): Promise<ConversationTurn[]> {
  try {
    const { data, error } = await supabase
      .from("agent_messages")
      .select("role, content, metadata, created_at")
      .eq("execution_id", executionId)
      .in("role", ["user", "agent"])
      .eq("metadata->>messageType", "text")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT + 1);
    if (error || !Array.isArray(data)) return [];
    const turns = (data as Array<{ role: string; content: unknown }>)
      .filter((row) => typeof row.content === "string" && row.content.trim())
      .map((row) => ({
        role: row.role === "user" ? ("user" as const) : ("agent" as const),
        content: row.content as string,
      }))
      .reverse();
    const last = turns.at(-1);
    if (last && last.role === "user" && last.content.trim() === message) turns.pop();
    return turns.slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/** Fatos dos dossies das contas pesquisadas (ate 30 contas). */
async function readFacts(
  supabase: SupabaseClient,
  tenantId: string,
  steps: ConversationStep[]
): Promise<Record<string, DossierFact[]>> {
  const research = [...steps].reverse().find((s) => s.step_type === "research_accounts");
  const output = research?.output as Partial<ResearchAccountsOutput> | null | undefined;
  const ids = Array.from(
    new Set(
      (Array.isArray(output?.accounts) ? output.accounts : [])
        .slice(0, CATALOG_MAX_ACCOUNTS)
        .map((a) => (a && typeof a.dossierId === "string" ? a.dossierId : null))
        .filter((id): id is string => Boolean(id))
    )
  );
  const entries = await Promise.all(
    ids.map(async (id) => {
      const result = await readDossierFacts(supabase, tenantId, id);
      return [id, result.facts] as const;
    })
  );
  return Object.fromEntries(entries);
}

async function logLlmUsage(
  tenantId: string,
  executionId: string,
  requestType: string,
  usage: ConversationLlmUsage,
  error: string | undefined,
  metadata: Record<string, unknown>
): Promise<void> {
  if (usage.calls === 0) return;
  await logAgentUsage({
    tenantId,
    executionId,
    serviceName: "openai",
    requestType,
    status: error ? "failed" : "success",
    calls: usage.calls,
    durationMs: usage.durationMs,
    errorMessage: error,
    estimatedCost: calculatePostExecutionChatCost(usage.promptTokens, usage.completionTokens),
    metadata: {
      ...metadata,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    },
  });
}
