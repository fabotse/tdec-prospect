/**
 * Conversa depois da execucao — contexto da KB para reescrita e revisao (Story 24.24)
 *
 * Replica a leitura de `loadKBContext`/`loadProduct` do `create-campaign-step.ts` (que sao
 * privados e ficam intocados) e monta o `CopyReviewContext` igual ao `reviewEmailBlocks`.
 * Le com o client recebido (sessao) e `tenant_id` explicito. Nunca lanca: falha de
 * leitura vira contexto vazio (sem provas = nenhuma prova permitida).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAIVariables,
  type AIContextVariables,
  type KnowledgeBaseContext,
} from "@/lib/services/knowledge-base-context";
import { fetchKnowledgeBaseProofs } from "@/lib/services/knowledge-base-proofs";
import { TEMPLATE_LEAD_VARIABLES } from "@/lib/agent/campaign-copy";
import { transformProductRow, type Product, type ProductRow } from "@/types/product";
import type { CopyReviewContext } from "@/lib/ai/copy-reviewer";
import type { ParsedBriefing } from "@/types/agent";

const LOG_PREFIX = "[post-execution-chat]";

async function readSection(
  supabase: SupabaseClient,
  tenantId: string,
  section: "company" | "tone" | "icp"
): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("content")
      .eq("tenant_id", tenantId)
      .eq("section", section)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { content?: unknown }).content ?? null;
  } catch {
    return null;
  }
}

/** Mesma leitura do `loadKBContext` do `create_campaign`. */
export async function loadConversationKBContext(
  supabase: SupabaseClient,
  tenantId: string
): Promise<KnowledgeBaseContext | null> {
  const [company, tone, icp, proofs] = await Promise.all([
    readSection(supabase, tenantId, "company"),
    readSection(supabase, tenantId, "tone"),
    readSection(supabase, tenantId, "icp"),
    fetchKnowledgeBaseProofs(supabase, tenantId, LOG_PREFIX),
  ]);
  if (!company && !tone && !icp && proofs.length === 0) return null;
  return {
    company: (company as KnowledgeBaseContext["company"]) ?? null,
    tone: (tone as KnowledgeBaseContext["tone"]) ?? null,
    icp: (icp as KnowledgeBaseContext["icp"]) ?? null,
    examples: [],
    proofs,
  };
}

/** Mesma leitura do `loadProduct` do `create_campaign`. */
export async function loadConversationProduct(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string | null | undefined
): Promise<Product | null> {
  if (!productId) return null;
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return transformProductRow(data as ProductRow);
  } catch {
    return null;
  }
}

/** `CopyReviewContext` igual ao do `reviewEmailBlocks` (24.9). Puro. */
export function buildCopyReviewContext(
  aiVars: AIContextVariables,
  briefing: ParsedBriefing | null | undefined
): CopyReviewContext {
  const audience = [
    briefing?.jobTitles?.length ? `Cargos: ${briefing.jobTitles.join(", ")}` : "",
    briefing?.industry ? `Setor: ${briefing.industry}` : "",
    briefing?.location ? `Local: ${briefing.location}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  return {
    audience: audience || aiVars.target_titles || "",
    productName: aiVars.product_name ?? "",
    productDescription: aiVars.product_description ?? "",
    targetIndustries: aiVars.target_industries ?? "",
    painPoints: aiVars.pain_points ?? "",
    icpSummary: aiVars.icp_summary ?? "",
    authorizedProofs: aiVars.authorized_proofs ?? "",
  };
}

/** Le KB + produto e monta o contexto da revisao. Nunca lanca. */
export async function loadCopyReviewContext(
  supabase: SupabaseClient,
  tenantId: string,
  briefing: ParsedBriefing | null | undefined
): Promise<CopyReviewContext> {
  try {
    const [kb, product] = await Promise.all([
      loadConversationKBContext(supabase, tenantId),
      loadConversationProduct(supabase, tenantId, briefing?.productSlug),
    ]);
    // Mesmo MODO TEMPLATE do create_campaign (24.6): sem lead ficticio.
    const aiVars: AIContextVariables = {
      ...buildAIVariables(kb, product),
      ...TEMPLATE_LEAD_VARIABLES,
    };
    return buildCopyReviewContext(aiVars, briefing);
  } catch (error) {
    console.error(`${LOG_PREFIX} falha ao montar o contexto da KB:`, error);
    return buildCopyReviewContext(
      { ...buildAIVariables(null), ...TEMPLATE_LEAD_VARIABLES },
      briefing
    );
  }
}
