-- Migration: Update Icebreaker Generation Prompt
-- Story 6.6: Personalized Icebreakers
--
-- Updates icebreaker_generation prompt to include:
-- - Product context with conditional blocks (AC #4)
-- - KB context variables (company_context, tone_style) (AC #5)
-- - Quality rules (avoid cliches, max 2 sentences) (AC #8)

-- Update icebreaker_generation prompt
UPDATE public.ai_prompts
SET
  prompt_template = 'Você é um especialista em personalização de emails de prospecção B2B.

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

Responda APENAS com o quebra-gelo, sem explicações.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'icebreaker_generation' AND tenant_id IS NULL;

-- Add comment for documentation
COMMENT ON TABLE public.ai_prompts IS
  'AI prompt templates. Story 6.6 updated icebreaker_generation with product context, KB context, and quality rules';
