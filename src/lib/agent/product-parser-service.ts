/**
 * Product Parser Service
 * Story: 16.6 - Cadastro de Produto Inline
 *
 * AC: #2 - Extrai campos estruturados de produto a partir de texto livre
 */

import OpenAI from "openai";
import { z } from "zod";
import type { ExtractedProduct } from "@/types/agent";
import { AGENT_ERROR_CODES } from "@/types/agent";

// ==============================================
// CONSTANTS
// ==============================================

const PARSER_MODEL = "gpt-4o-mini";
const PARSER_TEMPERATURE = 0.1;
const PARSER_TIMEOUT_MS = 5000;

// ==============================================
// ZOD SCHEMA — Validates OpenAI response
// ==============================================

export const productResponseSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  features: z.string().nullable(),
  differentials: z.string().nullable(),
  targetAudience: z.string().nullable(),
});

// ==============================================
// SYSTEM PROMPT
// ==============================================

const SYSTEM_PROMPT = `Voce e um extrator de dados de produto a partir de texto livre em portugues. Sua tarefa e extrair campos estruturados de um produto descrito pelo usuario.

Extraia os seguintes campos:

- name (string, obrigatorio): Nome do produto. Use o productName fornecido no contexto como fallback se o usuario nao mencionar nome.
- description (string, obrigatorio): Descricao breve do produto. Se o usuario nao fornecer uma descricao clara, gere uma descricao breve baseada nas informacoes disponiveis.
- features (string | null): Principais funcionalidades/caracteristicas. Null se nao fornecido.
- differentials (string | null): Diferenciais competitivos. Null se nao fornecido.
- targetAudience (string | null): Publico-alvo do produto. Null se nao fornecido.

REGRAS:
1. Retorne SOMENTE um objeto JSON valido com os campos acima.
2. NAO invente dados que o usuario nao mencionou — use null para campos ausentes (exceto name e description que sao obrigatorios).
3. Se o usuario nao fornecer description, gere uma descricao breve baseada no contexto.
4. Para name, use o productName do contexto se o usuario nao mencionar um nome diferente.`;

// ==============================================
// SERVICE
// ==============================================

export class ProductParserService {
  static async parse(
    message: string,
    productName: string,
    apiKey: string
  ): Promise<ExtractedProduct> {
    const client = new OpenAI({ apiKey });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create(
        {
          model: PARSER_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Produto: ${productName}\n\nDescricao do usuario: ${message}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: PARSER_TEMPERATURE,
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
      }

      const validated = productResponseSchema.safeParse(parsed);

      if (!validated.success) {
        throw new Error(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
      }

      return validated.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(AGENT_ERROR_CODES.PRODUCT_PARSE_ERROR);
    }
  }
}
