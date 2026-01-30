"use server";

/**
 * Server Actions: Knowledge Base
 * Story: 2.4 - Knowledge Base Editor - Company Profile
 *
 * AC: #3 - Data saved to knowledge_base table
 * AC: #4 - Table with tenant isolation
 * AC: #5 - Previously saved data populated on load
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  type KnowledgeBaseSection,
  type CompanyProfile,
  type ActionResult,
  companyProfileSchema,
  KNOWLEDGE_BASE_SECTIONS,
} from "@/types/knowledge-base";

// ==============================================
// GET KNOWLEDGE BASE SECTION ACTION
// ==============================================

/**
 * Get a knowledge base section for the current tenant
 * AC: #5 - Load previously saved data
 */
export async function getKnowledgeBaseSection<T = Record<string, unknown>>(
  section: KnowledgeBaseSection
): Promise<ActionResult<T | null>> {
  try {
    // 1. Validate section
    if (!KNOWLEDGE_BASE_SECTIONS.includes(section)) {
      return { success: false, error: "Seção inválida" };
    }

    // 2. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 3. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem acessar a base de conhecimento",
      };
    }

    // 4. Fetch section from database
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("content")
      .eq("tenant_id", profile.tenant_id)
      .eq("section", section)
      .single();

    if (error) {
      // No data found is not an error, just return null
      if (error.code === "PGRST116") {
        return { success: true, data: null };
      }
      console.error("Error fetching knowledge_base:", error);
      return { success: false, error: "Erro ao buscar dados" };
    }

    return { success: true, data: data.content as T };
  } catch (error) {
    console.error("getKnowledgeBaseSection error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// SAVE KNOWLEDGE BASE SECTION ACTION
// ==============================================

/**
 * Save a knowledge base section for the current tenant
 * AC: #3 - Save to knowledge_base table
 */
export async function saveKnowledgeBaseSection<T extends Record<string, unknown>>(
  section: KnowledgeBaseSection,
  content: T
): Promise<ActionResult<void>> {
  try {
    // 1. Validate section
    if (!KNOWLEDGE_BASE_SECTIONS.includes(section)) {
      return { success: false, error: "Seção inválida" };
    }

    // 2. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 3. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem editar a base de conhecimento",
      };
    }

    // 4. Upsert section to database
    const supabase = await createClient();
    const { error } = await supabase.from("knowledge_base").upsert(
      {
        tenant_id: profile.tenant_id,
        section,
        content,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "tenant_id,section",
      }
    );

    if (error) {
      console.error("Error saving knowledge_base:", error);
      return { success: false, error: "Erro ao salvar. Tente novamente." };
    }

    return { success: true };
  } catch (error) {
    console.error("saveKnowledgeBaseSection error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// COMPANY PROFILE SPECIFIC ACTIONS
// ==============================================

/**
 * Get company profile for current tenant
 * AC: #5 - Load previously saved data
 */
export async function getCompanyProfile(): Promise<ActionResult<CompanyProfile | null>> {
  return getKnowledgeBaseSection<CompanyProfile>("company");
}

/**
 * Save company profile for current tenant
 * AC: #3 - Save data with success toast
 */
export async function saveCompanyProfile(
  data: CompanyProfile
): Promise<ActionResult<void>> {
  // Validate input with Zod
  const validated = companyProfileSchema.safeParse(data);
  if (!validated.success) {
    const message = validated.error.issues[0]?.message ?? "Dados inválidos";
    return { success: false, error: message };
  }

  return saveKnowledgeBaseSection("company", validated.data);
}
