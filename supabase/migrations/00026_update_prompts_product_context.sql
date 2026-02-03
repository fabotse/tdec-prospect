-- Migration: Update AI Prompts for Product Context
-- Story 6.5: Campaign Product Context
--
-- Updates email_subject_generation and email_body_generation prompts
-- to include product-specific context variables when a product is selected.

-- Update email_subject_generation prompt
UPDATE public.ai_prompts
SET
  prompt_template = 'Você é um especialista em copywriting para emails de prospecção B2B.

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
7. {{#if product_name}}OBRIGATÓRIO: mencione o produto "{{product_name}}" no assunto{{/if}}

Responda APENAS com o assunto do email, sem explicações.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'email_subject_generation' AND tenant_id IS NULL;

-- Update email_body_generation prompt
UPDATE public.ai_prompts
SET
  prompt_template = 'Você é um especialista em copywriting para emails de prospecção B2B.

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

Responda APENAS com o corpo do email, sem explicações.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'email_body_generation' AND tenant_id IS NULL;

-- Add comment for documentation
COMMENT ON TABLE public.ai_prompts IS
  'AI prompt templates. Story 6.5 added product context variables: product_name, product_description, product_features, product_differentials, product_target_audience';
