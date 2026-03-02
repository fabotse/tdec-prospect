import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import type { LeadInsightRow } from "@/types/monitoring";
import { transformLeadInsightRow } from "@/types/monitoring";

/**
 * GET /api/insights
 * Fetch lead insights with pagination, filtering, and lead data
 * Story 13.6: Pagina de Insights - UI
 *
 * Query params:
 * - status: comma-separated statuses (new,used,dismissed)
 * - period: date filter (7d, 30d, 90d, all)
 * - page: page number (default 1)
 * - per_page: items per page (default 25, max 100)
 */
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

  const statusParam = searchParams.get("status");
  const period = searchParams.get("period") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "25")));

  let query = supabase
    .from("lead_insights")
    .select(`
      *,
      leads!inner (
        id, first_name, last_name, photo_url, company_name, title, linkedin_url, phone, email
      )
    `, { count: "exact" })
    .eq("tenant_id", profile.tenant_id);

  // Filter by status
  if (statusParam) {
    const statuses = statusParam.split(",");
    query = query.in("status", statuses);
  }

  // Filter by period
  if (period !== "all") {
    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[period];
    if (days) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("created_at", since.toISOString());
    }
  }

  // Pagination + ordering (AC #8: mais recentes primeiro)
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar insights" } },
      { status: 500 }
    );
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / perPage);

  // Transform: snake_case -> camelCase + attach lead data
  const transformed = (data ?? []).map((row: LeadInsightRow & { leads: Record<string, unknown> }) => {
    const insight = transformLeadInsightRow(row);
    return {
      ...insight,
      lead: {
        id: row.leads.id as string,
        firstName: row.leads.first_name as string,
        lastName: row.leads.last_name as string | null,
        photoUrl: row.leads.photo_url as string | null,
        companyName: row.leads.company_name as string | null,
        title: row.leads.title as string | null,
        linkedinUrl: row.leads.linkedin_url as string | null,
        phone: row.leads.phone as string | null,
        email: row.leads.email as string | null,
      },
    };
  });

  return NextResponse.json({
    data: transformed,
    meta: { total, page, limit: perPage, totalPages },
  });
}
