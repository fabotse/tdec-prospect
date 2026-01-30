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
  type ToneOfVoice,
  type ToneOfVoiceInput,
  type EmailExample,
  type EmailExampleInput,
  type ICPDefinition,
  type ICPDefinitionInput,
  type ActionResult,
  companyProfileSchema,
  toneOfVoiceSchema,
  emailExampleSchema,
  icpDefinitionSchema,
  uuidSchema,
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

// ==============================================
// TONE OF VOICE SPECIFIC ACTIONS
// Story: 2.5 - Knowledge Base Editor - Tone & Examples
// ==============================================

/**
 * Get tone of voice settings for current tenant
 * AC: #3 - Load previously saved data
 */
export async function getToneOfVoice(): Promise<ActionResult<ToneOfVoice | null>> {
  return getKnowledgeBaseSection<ToneOfVoice>("tone");
}

/**
 * Save tone of voice settings for current tenant
 * AC: #2 - Save to knowledge_base table (section="tone")
 */
export async function saveToneOfVoice(
  data: ToneOfVoiceInput
): Promise<ActionResult<void>> {
  // Validate input with Zod
  const validated = toneOfVoiceSchema.safeParse(data);
  if (!validated.success) {
    const message = validated.error.issues[0]?.message ?? "Dados inválidos";
    return { success: false, error: message };
  }

  return saveKnowledgeBaseSection("tone", validated.data);
}

// ==============================================
// EMAIL EXAMPLES ACTIONS
// Story: 2.5 - Knowledge Base Editor - Tone & Examples
// ==============================================

/**
 * Get all email examples for current tenant
 * AC: #5 - Fetch examples list
 */
export async function getEmailExamples(): Promise<ActionResult<EmailExample[]>> {
  try {
    // 1. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 2. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem acessar exemplos de email",
      };
    }

    // 3. Fetch examples from database
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("knowledge_base_examples")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching email examples:", error);
      return { success: false, error: "Erro ao buscar exemplos" };
    }

    return { success: true, data: data as EmailExample[] };
  } catch (error) {
    console.error("getEmailExamples error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Create a new email example
 * AC: #5 - Add new examples
 */
export async function createEmailExample(
  data: EmailExampleInput
): Promise<ActionResult<EmailExample>> {
  try {
    // 1. Validate input
    const validated = emailExampleSchema.safeParse(data);
    if (!validated.success) {
      const message = validated.error.issues[0]?.message ?? "Dados inválidos";
      return { success: false, error: message };
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
        error: "Apenas administradores podem adicionar exemplos",
      };
    }

    // 4. Insert example to database
    const supabase = await createClient();
    const { data: example, error } = await supabase
      .from("knowledge_base_examples")
      .insert({
        tenant_id: profile.tenant_id,
        subject: validated.data.subject,
        body: validated.data.body,
        context: validated.data.context ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating email example:", error);
      return { success: false, error: "Erro ao criar exemplo. Tente novamente." };
    }

    return { success: true, data: example as EmailExample };
  } catch (error) {
    console.error("createEmailExample error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Update an existing email example
 * AC: #5 - Edit existing examples
 */
export async function updateEmailExample(
  id: string,
  data: EmailExampleInput
): Promise<ActionResult<EmailExample>> {
  try {
    // 1. Validate ID format
    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return { success: false, error: "ID inválido" };
    }

    // 2. Validate input
    const validated = emailExampleSchema.safeParse(data);
    if (!validated.success) {
      const message = validated.error.issues[0]?.message ?? "Dados inválidos";
      return { success: false, error: message };
    }

    // 3. Check authentication
    const profile = await getCurrentUserProfile();

    if (!profile) {
      return { success: false, error: "Não autenticado" };
    }

    // 4. Check admin role
    if (profile.role !== "admin") {
      return {
        success: false,
        error: "Apenas administradores podem editar exemplos",
      };
    }

    // 5. Update example in database (RLS ensures tenant isolation)
    const supabase = await createClient();
    const { data: example, error } = await supabase
      .from("knowledge_base_examples")
      .update({
        subject: validated.data.subject,
        body: validated.data.body,
        context: validated.data.context ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating email example:", error);
      return { success: false, error: "Erro ao atualizar exemplo. Tente novamente." };
    }

    return { success: true, data: example as EmailExample };
  } catch (error) {
    console.error("updateEmailExample error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

/**
 * Delete an email example
 * AC: #5 - Remove examples
 */
export async function deleteEmailExample(
  id: string
): Promise<ActionResult<void>> {
  try {
    // 1. Validate ID format
    const idValidation = uuidSchema.safeParse(id);
    if (!idValidation.success) {
      return { success: false, error: "ID inválido" };
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
        error: "Apenas administradores podem remover exemplos",
      };
    }

    // 4. Delete example from database (RLS ensures tenant isolation)
    const supabase = await createClient();
    const { error } = await supabase
      .from("knowledge_base_examples")
      .delete()
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id);

    if (error) {
      console.error("Error deleting email example:", error);
      return { success: false, error: "Erro ao remover exemplo. Tente novamente." };
    }

    return { success: true };
  } catch (error) {
    console.error("deleteEmailExample error:", error);
    return { success: false, error: "Erro interno do servidor" };
  }
}

// ==============================================
// ICP DEFINITION ACTIONS (Story 2.6)
// ==============================================

/**
 * Get ICP definition for current tenant
 * AC: #8 - Load previously saved ICP data
 */
export async function getICPDefinition(): Promise<ActionResult<ICPDefinition | null>> {
  return getKnowledgeBaseSection<ICPDefinition>("icp");
}

/**
 * Save ICP definition for current tenant
 * AC: #7 - Save to knowledge_base table (section="icp")
 */
export async function saveICPDefinition(
  data: ICPDefinitionInput
): Promise<ActionResult<void>> {
  // Validate input with Zod
  const validated = icpDefinitionSchema.safeParse(data);
  if (!validated.success) {
    const message = validated.error.issues[0]?.message ?? "Dados inválidos";
    return { success: false, error: message };
  }

  return saveKnowledgeBaseSection("icp", validated.data);
}
