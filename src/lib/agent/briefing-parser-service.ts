/**
 * Briefing Parser Service
 * Story: 16.3 - Briefing Parser & Linguagem Natural
 *
 * AC: #1 - Extrai parametros de briefing em linguagem natural
 * AC: #2 - Usa OpenAI gpt-4o-mini com structured output JSON
 */

import OpenAI from "openai";
import { z } from "zod";
import type { ParsedBriefing } from "@/types/agent";
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

export const briefingResponseSchema = z.object({
  technology: z.string().nullable(),
  jobTitles: z.array(z.string()).default([]),
  location: z.string().nullable(),
  companySize: z.string().nullable(),
  industry: z.string().nullable(),
  productMentioned: z.string().nullable(),
  mode: z.enum(["guided", "autopilot"]).default("guided"),
  skipSteps: z.array(z.string()).default([]),
});

export type BriefingResponse = z.infer<typeof briefingResponseSchema>;

// ==============================================
// SYSTEM PROMPT
// ==============================================

const SYSTEM_PROMPT = `Voce e um parser de briefings de prospeccao B2B. Sua tarefa e extrair parametros estruturados a partir de texto livre em portugues.

Extraia os seguintes campos do texto do usuario:

- technology (string | null): Tecnologia ou ferramenta que as empresas-alvo usam. Exemplos: Netskope, AWS, Salesforce, SAP, Kubernetes.
- jobTitles (string[]): Cargos-alvo para prospeccao. Exemplos: CTO, Head de TI, CISO, Diretor de Tecnologia. Se o usuario nao mencionar cargos, retorne array vazio [].
- location (string | null): Localizacao geografica. Exemplos: Sao Paulo, Brasil, LATAM, EUA. Null se nao mencionado.
- companySize (string | null): Tamanho da empresa. Exemplos: "50-200", "enterprise", "startup", "PME". Null se nao mencionado.
- industry (string | null): Industria ou setor. Exemplos: fintech, saude, varejo, educacao. Null se nao mencionado.
- productMentioned (string | null): Nome de produto mencionado pelo usuario que pode estar cadastrado na base. Null se nao mencionado.
- mode ("guided" | "autopilot"): Modo de operacao. Default "guided" a menos que o usuario peca modo automatico/autopilot.
- skipSteps (string[]): Etapas a pular. Default [].
  - Se o usuario NAO mencionar tecnologia e nao quiser buscar empresas por tech, adicione "search_companies" no skipSteps.
  - Se o usuario pedir busca direta por cargos/industria/localizacao sem tecnologia, adicione "search_companies" no skipSteps.
  - Se o usuario mencionar tecnologia, NAO adicione "search_companies" no skipSteps.
  - Se o usuario indicar que ja possui leads/contatos proprios (ex: "ja tenho os contatos", "quero importar meus leads", "tenho uma planilha de leads", "leads proprios", "minha lista de emails", "CSV com contatos"), adicione ["search_companies", "search_leads"] no skipSteps.
  - Se skipSteps contem "search_leads", NAO exija jobTitles — o usuario fornecera os leads diretamente.

REGRAS:
1. Retorne SOMENTE um objeto JSON valido com os campos acima.
2. NAO invente dados que o usuario nao mencionou — use null ou [] para campos ausentes.
3. Interprete abreviacoes e sinonimos em portugues (ex: "SP" = "Sao Paulo", "TI" = "Tecnologia da Informacao").
4. Para jobTitles, normalize para o formato padrao (ex: "CTOs" -> "CTO", "heads de TI" -> "Head de TI").
5. Se o usuario mencionar um produto especifico (ex: "nosso produto X", "quem usa o Y"), extraia o nome em productMentioned.`;

// ==============================================
// SERVICE
// ==============================================

export interface ParseResult {
  briefing: ParsedBriefing;
  rawResponse: BriefingResponse;
}

export class BriefingParserService {
  /**
   * Parse briefing text into structured parameters.
   * AC: #1 - Extracts technology, jobTitles, location, etc.
   * AC: #2 - Uses gpt-4o-mini with response_format json_object
   */
  static async parse(message: string, apiKey: string): Promise<ParseResult> {
    const client = new OpenAI({ apiKey });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create(
        {
          model: PARSER_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          response_format: { type: "json_object" },
          temperature: PARSER_TEMPERATURE,
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      const validated = briefingResponseSchema.safeParse(parsed);

      if (!validated.success) {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      const raw = validated.data;

      const briefing: ParsedBriefing = {
        technology: raw.technology,
        jobTitles: raw.jobTitles,
        location: raw.location,
        companySize: raw.companySize,
        industry: raw.industry,
        productSlug: null, // Resolved later via KB (Task 3)
        mode: raw.mode,
        skipSteps: raw.skipSteps,
      };

      return { briefing, rawResponse: raw };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR);
    }
  }
}
