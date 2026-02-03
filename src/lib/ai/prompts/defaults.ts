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

  // Email subject generation (Updated for Story 6.3 - KB context, Story 6.5 - Product context)
  email_subject_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere um assunto de email persuasivo e profissional para prospecção comercial.

CONTEXTO DA EMPRESA:
{{company_context}}
Diferenciais: {{competitive_advantages}}

{{#if product_name}}
PRODUTO EM FOCO (USE ESTE CONTEXTO OBRIGATORIAMENTE):
- Nome: {{product_name}}
- Descrição: {{product_description}}
- Características: {{product_features}}
- Diferenciais: {{product_differentials}}
- Público-alvo: {{product_target_audience}}

IMPORTANTE: O assunto DEVE mencionar ou fazer referência ao produto "{{product_name}}" de forma natural.
{{else}}
Produtos/Serviços da empresa: {{products_services}}
{{/if}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}

ICP (Perfil de Cliente Ideal):
{{icp_summary}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}

OBJETIVO DO EMAIL:
{{email_objective}}

{{#if successful_examples}}
EXEMPLOS DE ASSUNTOS QUE FUNCIONARAM:
{{successful_examples}}
{{/if}}

REGRAS:
1. Máximo 60 caracteres
2. Evite palavras que disparam filtros de spam (grátis, urgente, promoção)
3. Use personalização quando possível
4. Seja direto e gere curiosidade
5. Tom alinhado ao estilo configurado ({{tone_style}})
6. Se houver exemplos, inspire-se neles

Responda APENAS com o assunto do email, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 100,
    },
  },

  // Email body generation (Updated for Story 6.3 - KB context, Story 6.5 - Product context)
  email_body_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere o corpo de um email de prospecção comercial personalizado e persuasivo.

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}
Diferenciais da empresa: {{competitive_advantages}}

{{#if product_name}}
PRODUTO EM FOCO (FALE ESPECIFICAMENTE SOBRE ESTE PRODUTO):
- Nome: {{product_name}}
- Descrição: {{product_description}}
- Características: {{product_features}}
- Diferenciais: {{product_differentials}}
- Público-alvo: {{product_target_audience}}

IMPORTANTE: O email DEVE apresentar o produto "{{product_name}}" como a solução principal. Mencione suas características e benefícios específicos.
{{else}}
Produtos/Serviços oferecidos: {{products_services}}
{{/if}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}
- Localização: {{lead_location}}

ICP (Perfil de Cliente Ideal):
{{icp_summary}}
Dores comuns: {{pain_points}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}
Diretrizes de escrita: {{writing_guidelines}}

OBJETIVO DO EMAIL:
{{email_objective}}

QUEBRA-GELO (se disponível):
{{icebreaker}}

{{#if successful_examples}}
EXEMPLOS DE EMAILS QUE FUNCIONARAM:
{{successful_examples}}
{{/if}}

REGRAS:
1. Máximo 150 palavras
2. Comece com o quebra-gelo se fornecido
3. {{#if product_name}}Apresente o produto "{{product_name}}" como solução, destacando seus benefícios específicos{{else}}Apresente valor claramente, mencionando diferenciais relevantes{{/if}}
4. Use parágrafos curtos (2-3 frases)
5. Inclua uma CTA clara mas não agressiva
6. Mantenha tom alinhado ao estilo ({{tone_style}}) e diretrizes
7. Evite clichês de vendas
8. Não mencione preços
9. Se houver exemplos, inspire-se na estrutura e abordagem
10. {{#if product_name}}OBRIGATÓRIO: mencione o nome "{{product_name}}" pelo menos uma vez no email{{/if}}

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

  // Icebreaker generation (Updated for Story 6.6 - Product context, KB context, quality rules)
  icebreaker_generation: {
    template: `Você é um especialista em personalização de emails de prospecção B2B.

Gere um quebra-gelo personalizado para iniciar um email de prospecção.

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}
Diferenciais: {{competitive_advantages}}

{{#if product_name}}
PRODUTO EM FOCO (conecte o lead com este produto):
- Nome: {{product_name}}
- Descrição: {{product_description}}
- Diferenciais: {{product_differentials}}
- Público-alvo: {{product_target_audience}}

IMPORTANTE: O quebra-gelo deve conectar a situação do lead com uma necessidade que o produto "{{product_name}}" resolve.
{{else}}
Produtos/Serviços oferecidos: {{products_services}}
{{/if}}

PERFIL DO LEAD (DADOS REAIS - USE-OS):
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}
- Localização: {{lead_location}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}

{{#if successful_examples}}
EXEMPLOS DE ABORDAGENS QUE FUNCIONARAM:
{{successful_examples}}
{{/if}}

REGRAS OBRIGATÓRIAS:
1. Máximo 2 frases
2. USE O NOME REAL DA EMPRESA "{{lead_company}}" - não use placeholders
3. Evite frases genéricas como "Olá {{lead_name}}, espero que esteja bem"
4. {{#if product_name}}Conecte a situação da "{{lead_company}}" com o valor do produto "{{product_name}}"{{else}}Mencione algo relevante sobre "{{lead_company}}"{{/if}}
5. Mantenha o tom {{tone_style}}
6. Demonstre que pesquisou sobre a empresa
7. Não faça perguntas - afirme algo relevante

TIPOS DE QUEBRA-GELO EFICAZES:
- "Vi que a {{lead_company}} está [ação/conquista]. Nosso [Produto] tem ajudado empresas nessa fase..."
- "Empresas de {{lead_industry}} como a {{lead_company}} frequentemente enfrentam [desafio]..."
- "O crescimento da {{lead_company}} no mercado me chamou atenção..."

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
