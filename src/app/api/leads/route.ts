/**
 * Leads List API Route
 * Story 4.2.2: My Leads Page
 * Story 12.8: Ordenação Padrão — Leads Enriquecidos Primeiro
 *
 * GET /api/leads - Fetch imported leads from database (not Apollo)
 *
 * AC: #2 - Table structure with leads data
 * AC: #3 - Filter by status, segment, search
 * AC: #7 - Pagination support
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import type { LeadRow } from "@/types/lead";
import { transformLeadRow } from "@/types/lead";

/**
 * GET /api/leads
 * Fetch imported leads from database
 *
 * Query params:
 * - status: comma-separated list of statuses
 * - segment_id: UUID of segment to filter by
 * - search: search term for name/company
 * - page: page number (default 1)
 * - per_page: items per page (default 25, max 100)
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const searchParams = request.nextUrl.searchParams;
  const statusParam = searchParams.get("status");
  const segmentId = searchParams.get("segment_id");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("per_page") || "25"))
  );

  // Handle segment filtering first (requires subquery)
  let leadIdsInSegment: string[] | null = null;
  if (segmentId) {
    const { data: segmentLeads } = await supabase
      .from("lead_segments")
      .select("lead_id")
      .eq("segment_id", segmentId);

    if (!segmentLeads || segmentLeads.length === 0) {
      // No leads in segment, return empty result
      return NextResponse.json({
        data: [],
        meta: { total: 0, page, limit: perPage, totalPages: 0 },
      });
    }
    leadIdsInSegment = segmentLeads.map((sl) => sl.lead_id);
  }

  // Build query
  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("tenant_id", profile.tenant_id);

  // Filter by status
  if (statusParam) {
    const statuses = statusParam.split(",");
    query = query.in("status", statuses);
  }

  // Filter by segment (lead IDs from subquery)
  if (leadIdsInSegment) {
    query = query.in("id", leadIdsInSegment);
  }

  // Search by name or company (case-insensitive)
  // Sanitize search input to escape PostgREST special characters
  if (search) {
    // Escape characters that have special meaning in PostgREST/ILIKE:
    // % and _ are ILIKE wildcards, backslash for escaping
    const sanitizedSearch = search
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/%/g, "\\%")   // Escape percent signs
      .replace(/_/g, "\\_");  // Escape underscores
    query = query.or(
      `first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,company_name.ilike.%${sanitizedSearch}%`
    );
  }

  // Pagination
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // Story 12.8: Server-side ordering para paginação — sem isso, leads
  // enriquecidos com created_at antigo ficariam em páginas posteriores.
  // Client-side sort (LeadTable.tsx) complementa com critério "interessado"
  // (não suportado pelo Supabase .order()). Dentro do grupo enriched, a
  // ordenação é por string da URL (limitação do Supabase), mas o client-side
  // reordena por createdAt DESC dentro de cada página.
  query = query
    .order("photo_url", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data: leads, error, count } = await query;

  if (error) {
    console.error("[GET /api/leads] Error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar leads" } },
      { status: 500 }
    );
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / perPage);

  // Transform snake_case to camelCase
  const transformedLeads = (leads as LeadRow[]).map(transformLeadRow);

  return NextResponse.json({
    data: transformedLeads,
    meta: {
      total,
      page,
      limit: perPage,
      totalPages,
    },
  });
}
