/**
 * AI Generate API Route
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * POST /api/ai/generate
 * Generates text using AI providers with prompt management.
 *
 * AC: #1 - Uses configured provider (OpenAI or Anthropic)
 * AC: #1 - Supports streaming responses
 * AC: #2 - Uses PromptManager for prompt retrieval
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/crypto/encryption";
import { createAIProvider, promptManager, AIProviderError } from "@/lib/ai";
import { aiGenerateRequestSchema } from "@/types/ai-provider";
import type { AIGenerateResponse } from "@/types/ai-provider";
import type { APIErrorResponse } from "@/types/api";

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

    const { promptKey, variables, options } = parseResult.data;

    // 3. Get rendered prompt from PromptManager
    // promptKey is validated by Zod schema against PromptKey enum
    const renderedPrompt = await promptManager.renderPrompt(
      promptKey,
      variables,
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
    const generationOptions = {
      ...options,
      temperature:
        options?.temperature ?? renderedPrompt.metadata.temperature,
      maxTokens: options?.maxTokens ?? renderedPrompt.metadata.maxTokens,
      model: options?.model ?? renderedPrompt.modelPreference ?? undefined,
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
