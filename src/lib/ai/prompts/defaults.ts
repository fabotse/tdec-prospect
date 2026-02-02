/**
 * Code Default Prompts
 * Story: 6.1 - AI Provider Service Layer & Prompt Management System
 *
 * Fallback prompts when no DB prompt exists (ADR-001 Level 3).
 * AC: #2 - Code defaults for 3-level fallback
 */

import type { PromptKey, AIPromptMetadata } from "@/types/ai-prompt";
import { FILTER_EXTRACTION_PROMPT, FILTER_EXTRACTION_MODEL } from "./filter-extraction";

// ==============================================
// CODE DEFAULT PROMPTS
// ==============================================

export interface CodeDefaultPrompt {
  template: string;
  modelPreference?: string;
  metadata?: AIPromptMetadata;
}

/**
 * Code default prompts - fallback when DB has no prompt
 * These should mirror the seeded prompts but serve as last resort
 */
export const CODE_DEFAULT_PROMPTS: Record<PromptKey, CodeDefaultPrompt> = {
  // Search translation uses existing prompt from filter-extraction.ts
  search_translation: {
    template: FILTER_EXTRACTION_PROMPT,
    modelPreference: FILTER_EXTRACTION_MODEL,
    metadata: {
      temperature: 0.3,
      maxTokens: 500,
    },
  },

  // Email subject generation
  email_subject_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere um assunto de email persuasivo e profissional para prospecção comercial.

CONTEXTO DA EMPRESA:
{{company_context}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}

OBJETIVO DO EMAIL:
{{email_objective}}

REGRAS:
1. Máximo 60 caracteres
2. Evite palavras que disparam filtros de spam (grátis, urgente, promoção)
3. Use personalização quando possível
4. Seja direto e gere curiosidade
5. Tom profissional mas não formal demais

Responda APENAS com o assunto do email, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 100,
    },
  },

  // Email body generation
  email_body_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere o corpo de um email de prospecção comercial personalizado e persuasivo.

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}
- Localização: {{lead_location}}

TOM DE VOZ:
{{tone_description}}

OBJETIVO DO EMAIL:
{{email_objective}}

QUEBRA-GELO (se disponível):
{{icebreaker}}

REGRAS:
1. Máximo 150 palavras
2. Comece com o quebra-gelo se fornecido
3. Apresente valor claramente
4. Use parágrafos curtos (2-3 frases)
5. Inclua uma CTA clara mas não agressiva
6. Mantenha tom profissional alinhado às diretrizes
7. Evite clichês de vendas
8. Não mencione preços

FORMATO:
- Saudação personalizada
- 1-2 parágrafos de conteúdo
- CTA
- Assinatura simples

Responda APENAS com o corpo do email, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 500,
    },
  },

  // Icebreaker generation
  icebreaker_generation: {
    template: `Você é um especialista em personalização de emails de prospecção B2B.

Gere um quebra-gelo personalizado para iniciar um email de prospecção.

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}
- Localização: {{lead_location}}

INFORMAÇÕES ADICIONAIS (se disponíveis):
{{additional_context}}

REGRAS:
1. Máximo 2 frases
2. Seja específico e genuíno
3. Evite elogios genéricos
4. Mencione algo relevante sobre a pessoa ou empresa
5. Demonstre que pesquisou sobre o lead
6. Não mencione redes sociais diretamente

TIPOS DE QUEBRA-GELO:
- Conquista recente da empresa
- Tendência do setor
- Conexão geográfica
- Interesse comum
- Notícia relevante

Responda APENAS com o quebra-gelo, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.8,
      maxTokens: 150,
    },
  },

  // Tone application
  tone_application: {
    template: `Você é um especialista em copywriting e adaptação de tom de voz.

Reescreva o texto a seguir mantendo o significado mas adaptando ao tom de voz especificado.

TEXTO ORIGINAL:
{{original_text}}

TOM DE VOZ DESEJADO:
- Preset: {{tone_preset}}
- Descrição: {{tone_description}}
- Diretrizes: {{writing_guidelines}}

REGRAS:
1. Mantenha o significado e informações do texto original
2. Adapte vocabulário e estrutura ao tom especificado
3. Preserve CTAs e informações importantes
4. Mantenha o tamanho similar ao original
5. Não adicione informações novas

PRESETS:
- formal: Linguagem corporativa, respeitosa, sem gírias
- casual: Linguagem amigável, próxima, pode usar expressões coloquiais
- technical: Linguagem técnica, precisa, com termos do setor

Responda APENAS com o texto reescrito, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.5,
      maxTokens: 500,
    },
  },
};
