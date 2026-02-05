/**
 * AI Generate API Route
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 * Story 6.5: Campaign Product Context
 *
 * POST /api/ai/generate
 * Generates text using AI providers with prompt management.
 *
 * AC 6.1: #1 - Uses configured provider (OpenAI or Anthropic)
 * AC 6.1: #1 - Supports streaming responses
 * AC 6.1: #2 - Uses PromptManager for prompt retrieval
 * AC 6.5: #3 - AI Uses Product Context
 * AC 6.5: #4 - General Context Fallback
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { createAIProvider, promptManager, AIProviderError } from "@/lib/ai";
import { aiGenerateRequestSchema } from "@/types/ai-provider";
import type { AIGenerateResponse, AIModel, AIGenerationOptions } from "@/types/ai-provider";
import type { APIErrorResponse } from "@/types/api";
import type { ProductRow } from "@/types/product";
import { transformProductRow } from "@/types/product";

// ==============================================
// ERROR MESSAGES (Portuguese)
// ==============================================

const ERROR_MESSAGES = {
  UNAUTHORIZED: "Não autenticado",
  TENANT_NOT_FOUND: "Tenant não encontrado",
  API_KEY_NOT_CONFIGURED:
    "API key do OpenAI não configurada. Configure em Configurações > Integrações.",
  DECRYPT_ERROR: "Erro ao descriptografar API key.",
  PROMPT_NOT_FOUND: "Prompt não encontrado.",
  GENERATION_ERROR: "Erro ao gerar texto.",
  VALIDATION_ERROR: "Dados inválidos.",
};

// ==============================================
// HELPER: Get OpenAI API Key
// ==============================================

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

// ==============================================
// HELPER: Get Product by ID (Story 6.5)
// ==============================================

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
 * Build product context variables for prompt interpolation
 * Story 6.5 AC #3: Product context replaces generic company products
 */
function buildProductVariables(product: ReturnType<typeof transformProductRow>) {
  return {
    product_name: product.name,
    product_description: product.description,
    product_features: product.features || "",
    product_differentials: product.differentials || "",
    product_target_audience: product.targetAudience || "",
    // Also update products_services with focused product info
    products_services: `${product.name}: ${product.description}`,
  };
}

// ==============================================
// POST /api/ai/generate
// ==============================================

export async function POST(request: NextRequest) {
  try {
    // 1. Check authentication and get tenant
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
    const parseResult = aiGenerateRequestSchema.safeParse(body);

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

    const { promptKey, variables, options, productId } = parseResult.data;

    // 2b. Fetch product if productId provided (Story 6.5 AC #3)
    let mergedVariables = { ...variables };
    if (productId) {
      const product = await getProductById(productId, tenantId);
      if (product) {
        // AC #3: Merge product context into variables (replaces generic products_services)
        const productVars = buildProductVariables(product);
        mergedVariables = { ...mergedVariables, ...productVars };
      }
      // AC #4: If product not found, continue with general context (no error)
    }

    // 3. Get rendered prompt from PromptManager
    // promptKey is validated by Zod schema against PromptKey enum

    const renderedPrompt = await promptManager.renderPrompt(
      promptKey,
      mergedVariables,
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

    // 4. Get API key from tenant configuration
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

    // 5. Create provider and generate text
    const provider = createAIProvider("openai", apiKey);

    // Merge prompt metadata with request options
    const generationOptions: AIGenerationOptions = {
      stream: options?.stream,
      timeoutMs: options?.timeoutMs,
      temperature:
        options?.temperature ?? renderedPrompt.metadata.temperature,
      maxTokens: options?.maxTokens ?? renderedPrompt.metadata.maxTokens,
      model: (options?.model ?? renderedPrompt.modelPreference) as AIModel | undefined,
    };

    // 6. Check if streaming is requested
    if (options?.stream) {
      // Return streaming response using ReadableStream
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of provider.generateStream(
              renderedPrompt.content,
              generationOptions
            )) {
              // Send as Server-Sent Events format
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
              );
            }
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            const message =
              error instanceof AIProviderError
                ? error.userMessage
                : ERROR_MESSAGES.GENERATION_ERROR;

            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ error: message })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 7. Non-streaming: Generate and return
    const result = await provider.generateText(
      renderedPrompt.content,
      generationOptions
    );

    return NextResponse.json<AIGenerateResponse>({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[AI Generate API Route] Error:", error);

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
