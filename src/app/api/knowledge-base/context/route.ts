/**
 * Knowledge Base Context API Route
 * Story 6.3: Knowledge Base Integration for Context
 *
 * GET /api/knowledge-base/context
 * Returns compiled KB context for AI generation.
 *
 * AC: #1 - Any authenticated user can fetch KB context (not admin-only)
 * AC: #5 - Handle missing sections gracefully
 */

import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import type {
  CompanyProfile,
  ToneOfVoice,
  ICPDefinition,
  EmailExample,
  KnowledgeBaseSection,
} from "@/types/knowledge-base";
import type { KnowledgeBaseContext } from "@/lib/services/knowledge-base-context";
import type { APIErrorResponse } from "@/types/api";

// ==============================================
// TYPES
// ==============================================

interface KnowledgeBaseContextResponse {
  success: true;
  data: KnowledgeBaseContext;
}

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Não autenticado",
  TENANT_NOT_FOUND: "Tenant não encontrado",
  FETCH_ERROR: "Erro ao buscar contexto da base de conhecimento",
};

// ==============================================
// HELPER: Fetch KB Section
// ==============================================

async function fetchKBSection<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  section: KnowledgeBaseSection
): Promise<T | null> {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", section)
    .single();

  if (error) {
    // No data found is not an error, return null
    if (error.code === "PGRST116") {
      return null;
    }
    console.error(`[KB Context] Error fetching ${section}:`, error);
    return null;
  }

  return data.content as T;
}

// ==============================================
// HELPER: Fetch Email Examples
// ==============================================

async function fetchEmailExamples(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
): Promise<EmailExample[]> {
  const { data, error } = await supabase
    .from("knowledge_base_examples")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[KB Context] Error fetching examples:", error);
    return [];
  }

  return (data as EmailExample[]) || [];
}

// ==============================================
// GET /api/knowledge-base/context
// ==============================================

export async function GET() {
  try {
    // 1. Check authentication (AC: #1 - any authenticated user)
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return NextResponse.json<APIErrorResponse>(
        { error: { code: "UNAUTHORIZED", message: ERROR_MESSAGES.UNAUTHORIZED } },
        { status: 401 }
      );
    }

    const tenantId = profile.tenant_id;
    if (!tenantId) {
      return NextResponse.json<APIErrorResponse>(
        { error: { code: "FORBIDDEN", message: ERROR_MESSAGES.TENANT_NOT_FOUND } },
        { status: 403 }
      );
    }

    // 2. Fetch all KB sections in parallel (AC: #5 - graceful handling)
    const supabase = await createClient();

    const [company, tone, icp, examples] = await Promise.all([
      fetchKBSection<CompanyProfile>(supabase, tenantId, "company"),
      fetchKBSection<ToneOfVoice>(supabase, tenantId, "tone"),
      fetchKBSection<ICPDefinition>(supabase, tenantId, "icp"),
      fetchEmailExamples(supabase, tenantId),
    ]);

    // 3. Return compiled context
    const context: KnowledgeBaseContext = {
      company,
      tone,
      icp,
      examples,
    };

    return NextResponse.json<KnowledgeBaseContextResponse>({
      success: true,
      data: context,
    });
  } catch (error) {
    console.error("[KB Context API] Error:", error);

    return NextResponse.json<APIErrorResponse>(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: ERROR_MESSAGES.FETCH_ERROR,
        },
      },
      { status: 500 }
    );
  }
}
