-- Migration: Add email_mode column to email_blocks
-- Story 6.11: Follow-Up Email Mode
--
-- Adds email_mode column for distinguishing initial vs follow-up emails.
-- Emails marked as 'follow-up' will include previous email context in AI generation.
--
-- AC #2: Mode persists in database with email_mode column
-- AC #3, #4: Enables follow-up generation with previous email context

-- 1. Add email_mode column to email_blocks
ALTER TABLE public.email_blocks
ADD COLUMN IF NOT EXISTS email_mode VARCHAR(20) DEFAULT 'initial';

-- 2. Add CHECK constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_blocks_email_mode_check'
  ) THEN
    ALTER TABLE public.email_blocks
    ADD CONSTRAINT email_blocks_email_mode_check
    CHECK (email_mode IN ('initial', 'follow-up'));
  END IF;
END $$;

-- 3. Comment for documentation
COMMENT ON COLUMN public.email_blocks.email_mode IS 'Email mode: initial (first contact) or follow-up (references previous email in sequence)';

-- 4. Seed follow_up_email_generation prompt
INSERT INTO public.ai_prompts (
  tenant_id,
  prompt_key,
  prompt_template,
  model_preference,
  version,
  is_active,
  metadata,
  created_at,
  updated_at
) VALUES (
  NULL,
  'follow_up_email_generation',
  'Você é um especialista em copywriting para emails de prospecção B2B.

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
- Gere APENAS o corpo do email, nada mais',
  'gpt-4o-mini',
  1,
  true,
  '{"temperature": 0.7, "maxTokens": 300}'::jsonb,
  NOW(),
  NOW()
)
-- CR-M1 FIX: Use DO NOTHING to avoid overwriting existing customized prompts
ON CONFLICT (tenant_id, prompt_key, version) DO NOTHING;

-- 5. Seed follow_up_subject_generation prompt (RE: prefix for follow-ups)
INSERT INTO public.ai_prompts (
  tenant_id,
  prompt_key,
  prompt_template,
  model_preference,
  version,
  is_active,
  metadata,
  created_at,
  updated_at
) VALUES (
  NULL,
  'follow_up_subject_generation',
  'Você é um especialista em copywriting para emails de prospecção B2B.

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

Responda APENAS com o assunto do email, começando com "RE: ".',
  'gpt-4o-mini',
  1,
  true,
  '{"temperature": 0.6, "maxTokens": 80}'::jsonb,
  NOW(),
  NOW()
)
-- CR-M1 FIX: Use DO NOTHING to avoid overwriting existing customized prompts
ON CONFLICT (tenant_id, prompt_key, version) DO NOTHING;
