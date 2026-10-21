/**
 * API Route: PATCH /api/agent/executions/[executionId]/briefing
 * Story: 16.3 - Briefing Parser & Linguagem Natural
 *
 * AC: #1, #4 - Atualiza execucao com briefing confirmado
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { hasRejectedStep } from "@/lib/agent/step-guards";
import { APOLLO_COMPANY_SIZE_BUCKETS } from "@/lib/agent/search-defaults";

// ==============================================
// REQUEST VALIDATION
// ==============================================

const briefingUpdateSchema = z.object({
  technology: z.string().nullable(),
  jobTitles: z.array(z.string()),
  location: z.string().nullable(),
  companySize: z.string().nullable(),
  industry: z.string().nullable(),
  productSlug: z.string().nullable(),
  mode: z.enum(["guided", "autopilot"]),
  skipSteps: z.array(z.string()),
  importedLeads: z.array(z.object({
    name: z.string(),
    title: z.string().nullable(),
    companyName: z.string().nullable(),
    email: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    apolloId: z.string().nullable(),
  })).optional(),
  // Story 22.5: metadados de campanha. z.object faz STRIP SILENCIOSO de chaves nao
  // declaradas — sem estes 4 campos, o PATCH descartaria objective/urgency/campaignDescription/
  // emailCount antes do .update({ briefing }) e o CreateCampaignStep leria sempre os defaults.
  objective: z.enum(["COLD_OUTREACH", "REENGAGEMENT", "FOLLOW_UP", "NURTURE"]).nullable().optional(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  // Story 22.5: trim + vazio->null + teto 200 chars (mantem o JSONB limpo qualquer que seja a
  // origem do PATCH; evita nome "Campanha -   " e string crua/gigante em {{additional_description}}).
  campaignDescription: z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() || null : v),
      z.string().max(200).nullable()
    )
    .optional(),
  emailCount: z.number().int().min(1).max(10).nullable().optional(),
  // Story 24.13: quantos leads (N). Mesma armadilha de strip — sem declarar, o PATCH
  // descartaria o N e plano/custo/revisao voltariam ao default de 25.
  leadCount: z.number().int().min(1).max(500).nullable().optional(),
  // Story 22.15: mesma armadilha de strip — sem declarar `segmentName`, o PATCH o
  // descartaria antes do update e o CreateCampaignStep cairia sempre no nome da campanha,
  // engolindo o "coloca no segmento X" pedido na conversa. Teto de 100 (segments.name).
  // O teto e medido em CODE POINTS, coerente com o schema do parser e com
  // `normalizeSegmentName`: com `.max(100)` cru (unidades UTF-16), um nome com emoji que
  // o parser ACEITA seria reprovado aqui e derrubaria o PATCH do briefing INTEIRO com 400.
  // Valor nao-string vira null em vez de reprovar o schema: o `segmentName` do `merged`
  // que o cliente reenvia vem do JSONB do briefing, que tem mais de um escritor. Um
  // numero/objeto ali derrubaria o PATCH INTEIRO com 400 e o usuario perderia TODOS os
  // ajustes daquele turno por causa de um campo acessorio. `undefined` continua passando
  // intacto — sem isso o `.optional()` deixaria de funcionar e um PATCH que nem menciona
  // o campo o ZERARIA.
  segmentName: z
    .preprocess(
      (v) => (v === undefined ? undefined : typeof v === "string" ? v.trim() || null : null),
      z
        .string()
        .refine((value) => [...value].length <= 100, {
          message: "Nome de segmento acima de 100 caracteres",
        })
        .nullable()
    )
    .optional(),
  // Story 22.13: mesma armadilha da 22.5, com consequencia PAGA. premiumIcebreakers e
  // escrito pelo SERVIDOR no POST /confirm; sem declara-lo aqui, o z.object o stripava
  // em qualquer PATCH posterior (ajuste pos-rejeicao) e o usuario que pagou icebreaker
  // premium receberia standard, em silencio.
  premiumIcebreakers: z.boolean().optional(),
  // Story 24.14: defaults do ICP (snapshot no briefing). Mesma armadilha de strip — sem
  // declarar, o PATCH descartaria o porte/local do ICP e a busca voltaria ao piso 11+.
  icpDefaults: z
    .object({
      // Vai verbatim para a Apollo: so faixas canonicas.
      companySizes: z.array(z.enum(APOLLO_COMPANY_SIZE_BUCKETS)).max(10),
      locations: z.array(z.string()).max(10),
    })
    .nullable()
    .optional(),
});

// ==============================================
// ROUTE HANDLER
// ==============================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { executionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "JSON invalido" } },
      { status: 400 }
    );
  }

  const validation = briefingUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Briefing invalido",
        },
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Story 22.13: MERGE em vez de replace total. Chaves presentes no payload vencem;
  // as ausentes sao preservadas do briefing persistido. Isto torna o ROUTE a fonte de
  // verdade da preservacao (premiumIcebreakers, importedLeads e qualquer campo futuro
  // que o cliente nao reenvie), protegendo tambem chamadores futuros.
  // Inocuo para o PATCH pre-confirmacao, que envia o objeto completo sobre um briefing
  // ainda vazio.
  const { data: currentExecution, error: readError } = await supabase
    .from("agent_executions")
    .select("briefing, status")
    .eq("id", executionId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  // Story 22.13 (review): NUNCA seguir com a leitura falhada. Ignorar o `error` fazia o
  // merge degradar em silencio para replace-total — apagando premiumIcebreakers e
  // importedLeads e devolvendo 200, que e exatamente o rebaixamento pago que a Task 5
  // existe para impedir. Falhar alto e a unica opcao segura.
  if (readError || !currentExecution) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_ERROR",
          message: "Erro ao ler o briefing atual da execucao",
        },
      },
      { status: 500 }
    );
  }

  // Story 24.2 (AC3): o briefing so pode ser sobrescrito com a execucao `pending`.
  // Sem esta guarda, apos um F5 uma mensagem livre + "sim" PATCHava o briefing de uma
  // execucao ja confirmada (e paga). Unica excecao: o ajuste pos-rejeicao (22.13/22.14),
  // que PATCHa uma execucao `running`/`paused` com um step rejeitado — o FR14 mantem
  // esse fluxo. O status vira CAS no update abaixo: 0 linhas = alguem mudou o status
  // entre a leitura e a escrita -> 409, briefing intacto.
  const executionStatus = (currentExecution as { status?: string }).status;
  let allowedStatuses: string[] | null = null;
  if (executionStatus === "pending") {
    allowedStatuses = ["pending"];
  } else if (
    (executionStatus === "running" || executionStatus === "paused") &&
    (await hasRejectedStep(supabase, executionId))
  ) {
    allowedStatuses = ["running", "paused"];
  }

  if (!allowedStatuses) {
    return executionNotPending(executionStatus);
  }

  const currentBriefing =
    currentExecution?.briefing && typeof currentExecution.briefing === "object"
      ? (currentExecution.briefing as Record<string, unknown>)
      : {};

  const mergedBriefing = { ...currentBriefing, ...validation.data };

  const { data: execution, error } = await supabase
    .from("agent_executions")
    .update({
      briefing: mergedBriefing,
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .eq("tenant_id", profile.tenant_id)
    .in("status", allowedStatuses)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_ERROR",
          message: "Erro ao atualizar briefing da execucao",
        },
      },
      { status: 500 }
    );
  }

  if (!execution) {
    return executionNotPending(executionStatus);
  }

  return NextResponse.json({ data: execution });
}

function executionNotPending(status: string | undefined) {
  return NextResponse.json(
    {
      error: {
        code: "EXECUTION_NOT_PENDING",
        message: `O briefing desta execucao nao pode mais ser alterado (status: ${status ?? "desconhecido"}).`,
      },
    },
    { status: 409 }
  );
}
