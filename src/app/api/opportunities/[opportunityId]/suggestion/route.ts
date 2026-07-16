import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  getApiKey,
  loadKBContext,
  loadToneContext,
  logMonitoringUsage,
} from "@/lib/utils/monitoring-processor";
import {
  generateOpportunityNextStep,
  calculateSuggestionCost,
} from "@/lib/utils/opportunity-suggestion";
import type { KBContextForSuggestion } from "@/lib/utils/opportunity-suggestion";
import type { OpportunityIntent } from "@/types/opportunity";

/**
 * POST /api/opportunities/:opportunityId/suggestion
 * Story 21.5: rascunho de próximo passo por IA — geração ON-DEMAND (request-time)
 * com CACHE persistente em `opportunities.suggestion`.
 *
 * Body: { regenerate?: boolean }
 * - regenerate=false (default): `suggestion` presente → devolve o cache, sem IA e sem custo (AC1).
 * - regenerate=true: bypassa o cache, gera de novo e sobrescreve (AC2).
 *
 * Fail-open (AC5): sem chave OpenAI / IA fora / retorno vazio → 200 com
 * `suggestion: null`. O card segue utilizável com as demais ações — nunca 500.
 *
 * Custo (AC6/NFR6): api_usage_logs (service_name='openai',
 * request_type='opportunity_next_step'), só quando houve consumo real de tokens.
 */

// A geração tem timeout interno de 30s (AbortSignal) — 60s dá folga para o
// round-trip completo sem deixar a function ser morta no meio de uma chamada paga.
export const maxDuration = 60;

interface LeadEmbed {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  title: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const { opportunityId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser JSON valido" } },
      { status: 400 }
    );
  }

  // request.json() aceita `null`/primitivos sem lançar (mesmo guard do PATCH irmão).
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Body deve ser um objeto JSON" } },
      { status: 400 }
    );
  }

  const regenerate = (body as Record<string, unknown>).regenerate === true;

  const supabase = await createClient();

  // Oportunidade tenant-scoped + lead embedado (LEFT — lead_id é nullable)
  const { data: row, error: loadError } = await supabase
    .from("opportunities")
    .select("*, lead:leads ( id, first_name, last_name, company_name, title )")
    .eq("id", opportunityId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (loadError || !row) {
    if (loadError?.code === "PGRST116") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Oportunidade nao encontrada" } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao carregar oportunidade" } },
      { status: 500 }
    );
  }

  // AC1 — cache-hit: aberturas subsequentes não custam nada.
  if (row.suggestion && !regenerate) {
    return NextResponse.json({ data: { suggestion: row.suggestion, cached: true } });
  }

  // A chave da OpenAI [api_configs] e a Knowledge Base [knowledge_base] vivem
  // atrás de policies `is_admin()` (00005:14-20, 00007:41-47), e `is_admin()` é
  // `role IN ('gestor','diretor')` (00053:64-78) — um `sdr` lê ZERO linhas. Sem
  // isto o rascunho (AC1) morre em silêncio justamente para o dono declarado da
  // Central (Sidebar.tsx:61, "ferramenta de trabalho do SDR"): sem a chave não
  // gera, e com a chave mas sem KB geraria um rascunho sem empresa/produto/tom.
  // Estas três leituras são server-side, seguem tenant-scoped pelo
  // `.eq("tenant_id", profile.tenant_id)` e a chave nunca chega ao browser.
  // O resto da rota continua no client de sessão: `opportunities` e
  // `api_usage_logs` são tenant-scoped SEM `is_admin()` (00055:75, 00035:85) —
  // o SDR já passa neles, e mantê-los sob RLS preserva o isolamento.
  let contextClient: SupabaseClient;
  try {
    contextClient = createAdminClient();
  } catch (adminError) {
    // Service-role key ausente: fail-open (AC5) em vez de 500.
    console.error("[opportunity-suggestion] client admin indisponivel:", adminError);
    return NextResponse.json({ data: { suggestion: null } });
  }

  // AC5 — sem chave: fail-open gracioso, sem custo.
  const openaiKey = await getApiKey(contextClient, profile.tenant_id, "openai");
  if (!openaiKey) {
    return NextResponse.json({ data: { suggestion: null } });
  }

  // KB + tom (mesma montagem do monitoring-processor). KB vazia não bloqueia:
  // o rascunho ainda tem lead + resposta + tom — melhor um rascunho magro que nenhum.
  const [kb, tone] = await Promise.all([
    loadKBContext(contextClient, profile.tenant_id),
    loadToneContext(contextClient, profile.tenant_id),
  ]);

  const kbContext: KBContextForSuggestion = {
    companyName: kb?.companyName ?? "",
    companyContext: kb?.companyContext ?? "",
    productsServices: kb?.productsServices ?? "",
    competitiveAdvantages: kb?.competitiveAdvantages ?? "",
    icpSummary: kb?.icpSummary ?? "",
    toneDescription: tone.toneDescription,
    toneStyle: tone.toneStyle,
  };

  const lead = (row.lead ?? null) as LeadEmbed | null;
  const leadContext = {
    leadName: lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") : "",
    leadTitle: lead?.title ?? "",
    leadCompany: lead?.company_name ?? "",
    // `leads` não tem coluna `industry` — o gerador interpola vazio.
    leadIndustry: "",
  };

  const { suggestion, promptTokens, completionTokens } = await generateOpportunityNextStep(
    {
      replyText: (row.reply_text ?? null) as string | null,
      replySubject: (row.reply_subject ?? null) as string | null,
      intent: (row.intent ?? null) as OpportunityIntent | null,
    },
    leadContext,
    kbContext,
    openaiKey,
    // `ai_prompts` também é admin-gated (00053:86-94). Sem o client admin, um SDR
    // cairia SEMPRE no default de código enquanto um gestor usaria o override do
    // tenant — o mesmo card geraria rascunhos diferentes conforme o papel de quem
    // abre. A resolução do template é tenant-scoped por `.eq("tenant_id")`.
    contextClient,
    profile.tenant_id
  );

  // Custo (AC6) — só com consumo real de tokens (erro-duro/cache-hit não logam).
  if (promptTokens + completionTokens > 0) {
    await logMonitoringUsage(supabase, {
      tenantId: profile.tenant_id,
      serviceName: "openai",
      requestType: "opportunity_next_step",
      leadId: (row.lead_id as string | null) ?? undefined,
      estimatedCost: calculateSuggestionCost(promptTokens, completionTokens),
      status: "success",
      metadata: { promptTokens, completionTokens, regenerate },
    });
  }

  if (!suggestion) {
    // AC5: geração falhou — não grava nada, card segue utilizável e pode re-tentar.
    return NextResponse.json({ data: { suggestion: null } });
  }

  // Cache persistente (dispara o trigger update_updated_at_column da 00055).
  const { error: updateError } = await supabase
    .from("opportunities")
    .update({ suggestion })
    .eq("id", opportunityId)
    .eq("tenant_id", profile.tenant_id);

  if (updateError) {
    // Secundário: o texto já foi gerado (e pago) — devolver ao usuário vale mais
    // que falhar. Só se perde o cache: a próxima abertura gera de novo.
    console.error("[opportunity-suggestion] falha ao cachear rascunho:", updateError);
  }

  return NextResponse.json({ data: { suggestion } });
}
