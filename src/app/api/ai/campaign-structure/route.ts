/**
 * AI Campaign Structure Generation API Route
 * Story 6.12: AI Campaign Structure Generation
 *
 * POST /api/ai/campaign-structure
 * Generates campaign structure (emails + delays) using AI.
 *
 * AC #3 - AI structure generation with campaign parameters
 * AC #5 - Error handling
 * AC #6 - Follow-up mode assignment based on objective
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { createAIProvider, promptManager, AIProviderError } from "@/lib/ai";
import type { ProductRow } from "@/types/product";
import { transformProductRow } from "@/types/product";
import type { APIErrorResponse } from "@/types/api";
import type {
  KnowledgeBaseContext,
  AIContextVariables,
} from "@/lib/services/knowledge-base-context";
import { buildAIVariables } from "@/lib/services/knowledge-base-context";

// ==============================================
// TYPES & SCHEMAS
// ==============================================

/**
 * Request body schema for campaign structure generation
 */
const requestSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  objective: z.enum(["cold_outreach", "reengagement", "follow_up", "nurture"]),
  description: z.string().max(2000).optional().default(""),
  tone: z.enum(["formal", "casual", "technical"]),
  urgency: z.enum(["low", "medium", "high"]),
});

type RequestBody = z.infer<typeof requestSchema>;

/**
 * Success response type
 */
interface StructureGenerationResponse {
  success: true;
  data: {
    text: string;
  };
}

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Nao autenticado",
  TENANT_NOT_FOUND: "Tenant nao encontrado",
  API_KEY_NOT_CONFIGURED:
    "API key do OpenAI nao configurada. Configure em Configuracoes > Integracoes.",
  DECRYPT_ERROR: "Erro ao descriptografar API key.",
  PROMPT_NOT_FOUND: "Prompt nao encontrado.",
  GENERATION_ERROR: "Erro ao gerar estrutura da campanha.",
  VALIDATION_ERROR: "Dados invalidos.",
};

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Get OpenAI API key for tenant
 */
async function getOpenAIApiKey(tenantId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("service_name", "openai")
    .single();

  if (error || !data) {
    throw new Error(ERROR_MESSAGES.API_KEY_NOT_CONFIGURED);
  }

  try {
    return decryptApiKey(data.encrypted_key);
  } catch {
    throw new Error(ERROR_MESSAGES.DECRYPT_ERROR);
  }
}

/**
 * Get product by ID for tenant
 */
async function getProductById(productId: string, tenantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) {
    return null;
  }

  return transformProductRow(data as ProductRow);
}

/**
 * Get knowledge base context for tenant
 */
async function getKnowledgeBaseContext(
  tenantId: string
): Promise<KnowledgeBaseContext> {
  const supabase = await createClient();

  // Fetch company profile
  const { data: companyData } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", "company")
    .single();

  // Fetch tone settings
  const { data: toneData } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", "tone")
    .single();

  // Fetch ICP
  const { data: icpData } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("section", "icp")
    .single();

  return {
    company: companyData?.content as KnowledgeBaseContext["company"],
    tone: toneData?.content as KnowledgeBaseContext["tone"],
    icp: icpData?.content as KnowledgeBaseContext["icp"],
    examples: [], // Not needed for structure generation
  };
}

/**
 * Map objective to prompt variable format
 */
function formatObjective(objective: RequestBody["objective"]): string {
  const objectiveMap: Record<RequestBody["objective"], string> = {
    cold_outreach: "COLD_OUTREACH",
    reengagement: "REENGAGEMENT",
    follow_up: "FOLLOW_UP",
    nurture: "NURTURE",
  };
  return objectiveMap[objective];
}

/**
 * Map urgency to prompt variable format
 */
function formatUrgency(urgency: RequestBody["urgency"]): string {
  const urgencyMap: Record<RequestBody["urgency"], string> = {
    low: "LOW",
    medium: "MEDIUM",
    high: "HIGH",
  };
  return urgencyMap[urgency];
}

/**
 * Map tone to prompt variable format
 */
function formatTone(tone: RequestBody["tone"]): string {
  const toneMap: Record<RequestBody["tone"], string> = {
    formal: "Formal",
    casual: "Casual",
    technical: "Tecnico",
  };
  return toneMap[tone];
}

// ==============================================
// POST /api/ai/campaign-structure
// ==============================================

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication
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

    // 2. Validate request body
    const body = await request.json();
    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: ERROR_MESSAGES.VALIDATION_ERROR,
            details:
              process.env.NODE_ENV === "development"
                ? parseResult.error.issues
                : undefined,
          },
        },
        { status: 400 }
      );
    }

    const { productId, objective, description, tone, urgency } = parseResult.data;

    // 3. Fetch product if productId provided
    let product = null;
    if (productId) {
      product = await getProductById(productId, tenantId);
    }

    // 4. Get knowledge base context
    const kbContext = await getKnowledgeBaseContext(tenantId);

    // 5. Build AI variables
    const baseVariables: AIContextVariables = buildAIVariables(kbContext, product);

    // 6. Build prompt variables for campaign structure
    const promptVariables: Record<string, string> = {
      objective: formatObjective(objective),
      urgency: formatUrgency(urgency),
      additional_description: description || "",
      tone_style: formatTone(tone),
      company_context: baseVariables.company_context,
      // Product context (if selected)
      ...(product
        ? {
            product_name: baseVariables.product_name,
            product_description: baseVariables.product_description,
            product_differentials: baseVariables.product_differentials,
          }
        : {}),
    };

    // 7. Get rendered prompt
    const renderedPrompt = await promptManager.renderPrompt(
      "campaign_structure_generation",
      promptVariables,
      { tenantId }
    );

    if (!renderedPrompt) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "PROMPT_NOT_FOUND",
            message: ERROR_MESSAGES.PROMPT_NOT_FOUND,
          },
        },
        { status: 404 }
      );
    }

    // 8. Get API key
    let apiKey: string;
    try {
      apiKey = await getOpenAIApiKey(tenantId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.API_KEY_NOT_CONFIGURED;

      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: "API_KEY_ERROR",
            message,
          },
        },
        { status: 401 }
      );
    }

    // 9. Create provider and generate
    const provider = createAIProvider("openai", apiKey);

    const generationOptions: import("@/types/ai-provider").AIGenerationOptions = {
      temperature: renderedPrompt.metadata.temperature ?? 0.6,
      maxTokens: renderedPrompt.metadata.maxTokens ?? 1500,
      model: (renderedPrompt.modelPreference ?? "gpt-4o") as import("@/types/ai-provider").AIModel,
      timeoutMs: 30000, // 30 seconds - structure generation needs more time
    };

    const result = await provider.generateText(
      renderedPrompt.content,
      generationOptions
    );

    // 10. Return response (non-streaming for JSON parsing)
    return NextResponse.json<StructureGenerationResponse>({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[AI Campaign Structure API] Error:", error);

    // Handle AIProviderError
    if (error instanceof AIProviderError) {
      return NextResponse.json<APIErrorResponse>(
        {
          error: {
            code: error.code,
            message: error.userMessage,
          },
        },
        { status: 500 }
      );
    }

    // Generic error
    return NextResponse.json<APIErrorResponse>(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: ERROR_MESSAGES.GENERATION_ERROR,
        },
      },
      { status: 500 }
    );
  }
}
