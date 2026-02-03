-- Migration: Update AI prompts with Knowledge Base context variables
-- Story: 6.3 - Knowledge Base Integration for Context
-- AC: #2 - Company Context Alignment
-- AC: #3 - Tone of Voice Matching
-- AC: #4 - Email Examples Reference

-- Update email_subject_generation prompt to include KB variables
UPDATE public.ai_prompts
SET prompt_template = 'Você é um especialista em copywriting para emails de prospecção B2B.

Gere um assunto de email persuasivo e profissional para prospecção comercial.

CONTEXTO DA EMPRESA:
{{company_context}}
Produtos/Serviços: {{products_services}}
Diferenciais: {{competitive_advantages}}

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

Responda APENAS com o assunto do email, sem explicações.',
    version = 2,
    updated_at = NOW()
WHERE prompt_key = 'email_subject_generation'
  AND tenant_id IS NULL
  AND is_active = true;

-- Update email_body_generation prompt to include KB variables
UPDATE public.ai_prompts
SET prompt_template = 'Você é um especialista em copywriting para emails de prospecção B2B.

Gere o corpo de um email de prospecção comercial personalizado e persuasivo.

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}
Produtos/Serviços: {{products_services}}
Diferenciais: {{competitive_advantages}}

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
3. Apresente valor claramente, mencionando diferenciais relevantes
4. Use parágrafos curtos (2-3 frases)
5. Inclua uma CTA clara mas não agressiva
6. Mantenha tom alinhado ao estilo ({{tone_style}}) e diretrizes
7. Evite clichês de vendas
8. Não mencione preços
9. Se houver exemplos, inspire-se na estrutura e abordagem

FORMATO:
- Saudação personalizada
- 1-2 parágrafos de conteúdo
- CTA
- Assinatura simples

Responda APENAS com o corpo do email, sem explicações.',
    version = 2,
    updated_at = NOW()
WHERE prompt_key = 'email_body_generation'
  AND tenant_id IS NULL
  AND is_active = true;

-- Add comment for this migration
COMMENT ON TABLE public.ai_prompts IS 'Updated with Knowledge Base context variables (Story 6.3) - company profile, tone of voice, ICP, and successful examples';
