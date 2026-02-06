/**
 * Campaign Templates API Route
 * Story 6.13: Smart Campaign Templates
 *
 * AC #1: Fetch active templates for wizard display
 * AC #6: Read access for authenticated users
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  type CampaignTemplateRow,
  type CampaignTemplate,
  transformTemplateRow,
  isValidTemplateStructure,
} from "@/types/campaign-template";

interface ApiError {
  code: string;
  message: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

/**
 * GET /api/campaign-templates
 * Fetch all active campaign templates ordered by display_order
 * AC #6: RLS allows read access to authenticated users
 */
export async function GET(): Promise<NextResponse<ApiResponse<CampaignTemplate[]>>> {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
        { status: 401 }
      );
    }

    // Fetch active templates ordered by display_order
    const { data: rows, error } = await supabase
      .from("campaign_templates")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[campaign-templates] Supabase error:", error);
      return NextResponse.json(
        { error: { code: "FETCH_ERROR", message: "Erro ao buscar templates" } },
        { status: 500 }
      );
    }

    // Transform and validate templates
    const templates: CampaignTemplate[] = [];
    for (const row of rows as CampaignTemplateRow[]) {
      // Validate structure_json before including
      if (!isValidTemplateStructure(row.structure_json)) {
        console.warn(
          `[campaign-templates] Invalid structure_json for template ${row.id}`
        );
        continue;
      }

      templates.push(transformTemplateRow(row));
    }

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error("[campaign-templates] Unexpected error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" } },
      { status: 500 }
    );
  }
}
