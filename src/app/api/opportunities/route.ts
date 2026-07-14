import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { toOpportunity, type OpportunityRow } from "@/types/opportunity";

/**
 * GET /api/opportunities
 * Story 21.4: Central de Oportunidades — lista cross-campanha com DTO enriquecido
 * (lead embedado LEFT, nome da campanha via Map, insight do LinkedIn p/ monitorados).
 *
 * Query params:
 * - intent: CSV de intents (interessado,pediu_info,...)
 * - status: CSV de statuses do card (new,viewed,...)
 * - campaign_id: filtra por campanha
 * - period: 7d | 30d | 90d | all (default all)
 * - page: página (default 1)
 * - per_page: itens por página (default 25, max 100)
 */

interface LeadJoinRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  title: string | null;
  phone: string | null;
  photo_url: string | null;
  is_monitored: boolean | null;
  linkedin_url: string | null;
}

interface InsightJoinRow {
  lead_id: string;
  suggestion: string | null;
  relevance_reasoning: string | null;
  post_url: string | null;
  post_text: string | null;
  post_published_at: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;

  const intentParam = searchParams.get("intent");
  const statusParam = searchParams.get("status");
  const campaignIdParam = searchParams.get("campaign_id");
  const period = searchParams.get("period") || "all";
  // parseInt("abc") === NaN e Math.max/Math.min NÃO coagem NaN ao bound
  // (Math.max(1, NaN) === NaN) → guardar com Number.isFinite antes de clampar.
  const parsePositiveInt = (raw: string | null, fallback: number): number => {
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const page = Math.max(1, parsePositiveInt(searchParams.get("page"), 1));
  const perPage = Math.min(100, Math.max(1, parsePositiveInt(searchParams.get("per_page"), 25)));

  // LEFT embed de leads (SEM !inner): lead_id é nullable (00055, ON DELETE SET NULL;
  // a 21.2 cria oportunidade sem lead na base) — !inner dropa esses cards em silêncio.
  let query = supabase
    .from("opportunities")
    .select(
      `
      *,
      lead:leads (
        id, first_name, last_name, email, company_name, title, phone, photo_url, is_monitored, linkedin_url
      )
    `,
      { count: "exact" }
    )
    .eq("tenant_id", profile.tenant_id);

  // trim + descarta segmentos vazios: "a, b" / "a," não devem virar valores
  // que nunca casam o CHECK TEXT (filtro silenciosamente vazio).
  const parseCsv = (raw: string): string[] =>
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  if (intentParam) {
    const intents = parseCsv(intentParam);
    if (intents.length > 0) query = query.in("intent", intents);
  }

  if (statusParam) {
    const statuses = parseCsv(statusParam);
    if (statuses.length > 0) query = query.in("status", statuses);
  }

  if (campaignIdParam) {
    query = query.eq("campaign_id", campaignIdParam);
  }

  if (period !== "all") {
    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[period];
    if (days) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("created_at", since.toISOString());
    }
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar oportunidades" } },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as (OpportunityRow & { lead: LeadJoinRow | null })[];

  // Nome da campanha: opportunities.campaign_id NÃO tem FK (00055, espelha
  // campaign_events) → PostgREST não auto-embeda. Query separada + Map.
  const campaignNameMap = new Map<string, string>();
  const campaignIds = [...new Set(rows.map((row) => row.campaign_id))];
  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .in("id", campaignIds)
      .eq("tenant_id", profile.tenant_id);
    for (const campaign of campaigns ?? []) {
      campaignNameMap.set(campaign.id, campaign.name);
    }
  }

  // Insight do LinkedIn (AC3): só para leads monitorados. Contexto secundário —
  // se a query falhar, a Central segue funcionando com insight: null.
  const insightMap = new Map<string, InsightJoinRow>();
  const monitoredLeadIds = [
    ...new Set(
      rows
        .map((row) => (row.lead && row.lead.is_monitored ? row.lead.id : null))
        .filter((id): id is string => id !== null)
    ),
  ];
  if (monitoredLeadIds.length > 0) {
    const { data: insightRows, error: insightError } = await supabase
      .from("lead_insights")
      .select(
        "lead_id, suggestion, relevance_reasoning, post_url, post_text, post_published_at, created_at"
      )
      .in("lead_id", monitoredLeadIds)
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (insightError) {
      console.warn("[opportunities] Falha ao buscar insights (seguindo sem):", insightError);
    } else {
      for (const insightRow of (insightRows ?? []) as InsightJoinRow[]) {
        // Ordenado por created_at desc — o primeiro por lead é o mais recente
        if (!insightMap.has(insightRow.lead_id)) {
          insightMap.set(insightRow.lead_id, insightRow);
        }
      }
    }
  }

  const transformed = rows.map((row) => {
    const opportunity = toOpportunity(row);
    const lead = row.lead;
    const insightRow = lead && lead.is_monitored ? insightMap.get(lead.id) : undefined;

    return {
      ...opportunity,
      lead: lead
        ? {
            id: lead.id,
            firstName: lead.first_name,
            lastName: lead.last_name,
            email: lead.email,
            companyName: lead.company_name,
            title: lead.title,
            phone: lead.phone,
            photoUrl: lead.photo_url,
            isMonitored: lead.is_monitored ?? false,
            linkedinUrl: lead.linkedin_url,
          }
        : null,
      campaignName: campaignNameMap.get(row.campaign_id) ?? null,
      insight: insightRow
        ? {
            leadId: insightRow.lead_id,
            suggestion: insightRow.suggestion,
            relevanceReasoning: insightRow.relevance_reasoning,
            postUrl: insightRow.post_url,
            postText: insightRow.post_text,
            postPublishedAt: insightRow.post_published_at,
            createdAt: insightRow.created_at,
          }
        : null,
    };
  });

  const total = count ?? 0;
  const totalPages = Math.ceil(total / perPage);

  return NextResponse.json({
    data: transformed,
    meta: { total, page, limit: perPage, totalPages },
  });
}
