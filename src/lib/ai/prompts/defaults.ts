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

  // Email subject generation (Updated for Story 6.3 - KB context, Story 6.5 - Product context, Story 6.9 - Tone guides)
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
Estilo atual: {{tone_style}}
Diretrizes adicionais: {{writing_guidelines}}

GUIA DE TOM - SIGA O ESTILO "{{tone_style}}":

[CASUAL]
- Use linguagem conversacional e amigável
- Evite "Prezado(a)" - prefira "Olá" ou nenhuma saudação formal
- Pode usar expressões como "super", "dá uma olhada", "bem legal"
- Tom como conversa entre colegas
- Exemplo: "{{lead_name}}, uma ideia rápida para {{lead_company}}"

[FORMAL]
- Use linguagem corporativa e respeitosa
- Evite gírias e expressões coloquiais
- Estrutura mais rígida e profissional
- Exemplo: "Proposta de parceria estratégica para {{lead_company}}"

[TÉCNICO]
- Use terminologia técnica do setor {{lead_industry}}
- Seja preciso e objetivo
- Mencione métricas ou KPIs quando relevante
- Exemplo: "ROI comprovado em {{lead_industry}}: case para {{lead_company}}"

OBJETIVO DO EMAIL:
{{email_objective}}

{{#if successful_examples}}
EXEMPLOS DE ASSUNTOS QUE FUNCIONARAM (APRENDA COM ELES):
{{successful_examples}}

⚠️ INSTRUÇÕES CRÍTICAS - IMITE OS EXEMPLOS:
- Adote estrutura similar aos exemplos (comprimento, formato, pontuação)
- Use vocabulário e expressões parecidas com os exemplos
- Copie o estilo de personalização usado nos exemplos
- O assunto gerado deve parecer escrito pela mesma pessoa que escreveu os exemplos
- Se os exemplos usam perguntas, use perguntas. Se usam afirmações, use afirmações.
- Observe como os exemplos mencionam a empresa do lead e faça similar
{{/if}}

REGRAS:
1. Máximo 60 caracteres
2. Evite palavras que disparam filtros de spam (grátis, urgente, promoção)
3. Use personalização quando possível
4. Seja direto e gere curiosidade
5. OBRIGATÓRIO: Siga o estilo de tom "{{tone_style}}" conforme guia acima
6. Se houver diretrizes de escrita, elas têm prioridade sobre o guia
7. {{#if successful_examples}}PRIORIDADE MÁXIMA: Imite o estilo dos exemplos fornecidos{{else}}Use melhores práticas de cold email{{/if}}

Responda APENAS com o assunto do email, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 100,
    },
  },

  // Email body generation (Updated for Story 6.3 - KB context, Story 6.5 - Product context, Story 6.9 - Tone guides)
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
Estilo atual: {{tone_style}}
Diretrizes adicionais: {{writing_guidelines}}

GUIA DE TOM - SIGA RIGOROSAMENTE O ESTILO "{{tone_style}}":

[CASUAL]
- Use "você" (nunca "senhor/senhora" ou "Vossa Senhoria")
- Evite "Prezado(a)" - use "Olá {{lead_name}}" ou "Oi {{lead_name}}"
- Pode usar expressões informais: "super", "bem legal", "dá uma olhada", "bater um papo"
- Tom amigável como conversa entre colegas de trabalho
- Feche com "Abraço", "Até mais" ou "Valeu" (nunca "Atenciosamente")
- Parágrafos curtos e diretos
- Exemplo de abertura casual: "Oi {{lead_name}}, tudo bem?"

[FORMAL]
- Use linguagem corporativa e respeitosa
- Saudação: "Prezado(a) {{lead_name}}" ou "Caro(a) {{lead_name}}"
- Evite gírias, abreviações e expressões coloquiais
- Estrutura mais rígida: saudação → contexto → proposta → despedida
- Feche com "Atenciosamente", "Cordialmente" ou "Respeitosamente"
- Mantenha distância profissional
- Exemplo de abertura formal: "Prezado {{lead_name}}, espero que esta mensagem o encontre bem."

[TÉCNICO]
- Use terminologia técnica apropriada ao setor {{lead_industry}}
- Seja preciso, objetivo e direto ao ponto
- Mencione métricas, KPIs, ROI quando relevante
- Tom de especialista falando com especialista
- Evite simplificações excessivas - o lead entende o jargão
- Use dados e evidências quando possível
- Exemplo: "Nosso sistema reduz o tempo de processamento em 40%..."

OBJETIVO DO EMAIL:
{{email_objective}}

QUEBRA-GELO (se disponível):
{{icebreaker}}

{{#if successful_examples}}
EXEMPLOS DE EMAILS QUE FUNCIONARAM (APRENDA COM ELES):
{{successful_examples}}

⚠️ INSTRUÇÕES CRÍTICAS - IMITE OS EXEMPLOS:
- Adote a MESMA estrutura dos exemplos (quantidade de parágrafos, comprimento, formatação)
- Use vocabulário e expressões similares aos exemplos
- Aplique as mesmas técnicas de personalização (como mencionam empresa, cargo, setor)
- Copie o fluxo: como abrem, desenvolvem e fecham o email
- O email gerado DEVE parecer escrito pela mesma pessoa que escreveu os exemplos
- Se os exemplos usam bullet points, use bullet points. Se são parágrafos corridos, use parágrafos corridos.
- Observe a CTA dos exemplos e crie CTA similar em tom e estilo
{{/if}}

REGRAS:
1. Máximo 150 palavras
2. Comece com o quebra-gelo se fornecido
3. {{#if product_name}}Apresente o produto "{{product_name}}" como solução, destacando benefícios específicos{{else}}Apresente valor claramente{{/if}}
4. Use parágrafos curtos (2-3 frases)
5. Inclua uma CTA clara mas não agressiva
6. CRÍTICO: Siga o guia de tom "{{tone_style}}" - saudação, vocabulário e fechamento devem corresponder
7. Se houver diretrizes de escrita (writing_guidelines), elas têm PRIORIDADE sobre o guia de tom
8. Evite clichês de vendas
9. Não mencione preços
10. {{#if successful_examples}}PRIORIDADE MÁXIMA: Imite a estrutura e estilo dos exemplos fornecidos{{else}}Use melhores práticas de cold email{{/if}}

FORMATO:
- Saudação personalizada (conforme tom)
- 1-2 parágrafos de conteúdo
- CTA
- Despedida (conforme tom)
- Assinatura simples

Responda APENAS com o corpo do email, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 500,
    },
  },

  // Icebreaker generation (Updated for Story 6.6 - Product context, KB context, quality rules, Story 6.9 - Tone guides)
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
Estilo atual: {{tone_style}}
Diretrizes adicionais: {{writing_guidelines}}

GUIA DE TOM - ADAPTE O QUEBRA-GELO AO ESTILO "{{tone_style}}":

[CASUAL]
- Linguagem amigável e próxima
- Pode usar expressões como "Vi que...", "Curti muito...", "Legal ver que..."
- Tom como se já conhecesse a pessoa
- Exemplo: "Vi que a {{lead_company}} está crescendo bastante no mercado de {{lead_industry}} - muito legal!"

[FORMAL]
- Linguagem corporativa e respeitosa
- Use expressões como "Observei que...", "Tenho acompanhado...", "É notável que..."
- Mantenha distância profissional
- Exemplo: "Tenho acompanhado o crescimento da {{lead_company}} no setor de {{lead_industry}} com interesse."

[TÉCNICO]
- Linguagem precisa e baseada em fatos
- Mencione dados, métricas ou tendências do setor
- Use terminologia técnica de {{lead_industry}}
- Exemplo: "Analisando o mercado de {{lead_industry}}, a {{lead_company}} se destaca pela adoção de [tecnologia/prática]."

{{#if successful_examples}}
EXEMPLOS DE ABORDAGENS QUE FUNCIONARAM (APRENDA COM ELES):
{{successful_examples}}

⚠️ INSTRUÇÕES CRÍTICAS - IMITE OS EXEMPLOS:
- Adote o MESMO estilo de abertura dos exemplos
- Use vocabulário e expressões similares aos exemplos
- Copie a forma como personalizam (menção à empresa, setor, conquistas)
- O quebra-gelo gerado DEVE parecer escrito pela mesma pessoa que escreveu os exemplos
- Observe o comprimento dos exemplos e mantenha similar
- Se os exemplos fazem conexões específicas com o lead, faça conexões similares
{{/if}}

REGRAS OBRIGATÓRIAS:
1. Máximo 2 frases
2. USE O NOME REAL DA EMPRESA "{{lead_company}}" - não use placeholders
3. Evite frases genéricas como "Olá {{lead_name}}, espero que esteja bem"
4. {{#if product_name}}Conecte a situação da "{{lead_company}}" com o valor do produto "{{product_name}}"{{else}}Mencione algo relevante sobre "{{lead_company}}"{{/if}}
5. CRÍTICO: Adapte o vocabulário e tom ao estilo "{{tone_style}}" conforme guia acima
6. Se houver diretrizes de escrita, elas têm prioridade
7. Demonstre que pesquisou sobre a empresa
8. Não faça perguntas - afirme algo relevante
9. {{#if successful_examples}}PRIORIDADE MÁXIMA: Imite o estilo dos exemplos fornecidos{{else}}Use as abordagens eficazes listadas abaixo{{/if}}

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

  // Follow-up email generation (Story 6.11)
  follow_up_email_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere o corpo de um EMAIL DE FOLLOW-UP que dá continuidade a uma conversa iniciada.

EMAIL ANTERIOR NA SEQUÊNCIA (VOCÊ JÁ ENVIOU ESTE):
Assunto: {{previous_email_subject}}
Corpo: {{previous_email_body}}

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}

{{#if product_name}}
PRODUTO EM FOCO (JÁ APRESENTADO NO EMAIL ANTERIOR - NÃO REPITA INFORMAÇÕES):
- Nome: {{product_name}}
{{/if}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}

OBJETIVO DO FOLLOW-UP:
{{email_objective}}

{{#if successful_examples}}
EXEMPLOS DE FOLLOW-UPS QUE FUNCIONARAM:
{{successful_examples}}
{{/if}}

REGRAS CRÍTICAS PARA FOLLOW-UP:
1. Máximo 100 palavras (follow-ups são mais curtos)
2. REFERENCIE o email anterior naturalmente ("Conforme mencionei...", "Dando continuidade...", "Voltando ao assunto...")
3. NÃO repita informações do produto já apresentadas
4. Adicione NOVO valor: um caso de sucesso, uma estatística, um insight
5. CTA diferente do email anterior (mais direto, oferecer reunião, pedir feedback)
6. Mantenha o mesmo tom de voz do email anterior
7. NÃO use "Espero que tenha recebido meu email anterior" - assuma que recebeu
8. Seja breve e direto - o lead já conhece o contexto

ESTRUTURA RECOMENDADA:
- Saudação (ex: "Oi {{lead_name}},")
- Referência sutil ao contato anterior
- Novo ponto de valor (case, dado, insight)
- CTA direto
- Despedida curta

IMPORTANTE - FORMATO DO OUTPUT:
- NÃO inclua "Assunto:" no corpo - o assunto é gerado separadamente
- Comece DIRETAMENTE com a saudação (ex: "Oi Maria,")
- Gere APENAS o corpo do email, nada mais`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 300,
    },
  },

  // Follow-up subject generation (Story 6.11 - RE: prefix for follow-up emails)
  follow_up_subject_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere um ASSUNTO para um email de follow-up que dá continuidade a uma conversa iniciada.

EMAIL ANTERIOR NA SEQUÊNCIA:
Assunto anterior: {{previous_email_subject}}

PERFIL DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}

{{#if successful_examples}}
EXEMPLOS DE ASSUNTOS DE FOLLOW-UP QUE FUNCIONARAM:
{{successful_examples}}
{{/if}}

REGRAS CRÍTICAS PARA ASSUNTO DE FOLLOW-UP:
1. OBRIGATÓRIO: Comece SEMPRE com "RE: " (incluindo o espaço após os dois pontos)
2. Após o "RE: ", você pode:
   - Manter o assunto anterior: "RE: {{previous_email_subject}}"
   - OU criar variação curta mantendo contexto: "RE: Sobre {{lead_company}} + [palavra-chave]"
3. Máximo 60 caracteres (incluindo o "RE: ")
4. Mantenha o mesmo tom do email anterior
5. O "RE:" simula uma resposta/continuação de conversa, criando familiaridade

EXEMPLOS DE FORMATOS VÁLIDOS:
- "RE: {{previous_email_subject}}"
- "RE: Proposta para {{lead_company}}"
- "RE: Nossa conversa sobre [tema]"

Responda APENAS com o assunto do email, começando com "RE: ".`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.6,
      maxTokens: 80,
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
