-- Migration: Seed initial AI prompts for text generation
-- Story: 6.1 - AI Provider Service Layer & Prompt Management System
-- AC: #4 - Initial prompts seeded via migration

-- Insert global prompts (tenant_id = NULL)
-- These serve as defaults that can be overridden per-tenant

-- 1. Email Subject Generation Prompt
INSERT INTO public.ai_prompts (
    tenant_id,
    prompt_key,
    prompt_template,
    model_preference,
    version,
    is_active,
    metadata
) VALUES (
    NULL, -- Global prompt
    'email_subject_generation',
    'Você é um especialista em copywriting para emails de prospecção B2B.

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

Responda APENAS com o assunto do email, sem explicações.',
    'gpt-4o-mini',
    1,
    true,
    '{"temperature": 0.7, "max_tokens": 100}'::jsonb
);

-- 2. Email Body Generation Prompt
INSERT INTO public.ai_prompts (
    tenant_id,
    prompt_key,
    prompt_template,
    model_preference,
    version,
    is_active,
    metadata
) VALUES (
    NULL, -- Global prompt
    'email_body_generation',
    'Você é um especialista em copywriting para emails de prospecção B2B.

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

Responda APENAS com o corpo do email, sem explicações.',
    'gpt-4o-mini',
    1,
    true,
    '{"temperature": 0.7, "max_tokens": 500}'::jsonb
);

-- 3. Icebreaker Generation Prompt
INSERT INTO public.ai_prompts (
    tenant_id,
    prompt_key,
    prompt_template,
    model_preference,
    version,
    is_active,
    metadata
) VALUES (
    NULL, -- Global prompt
    'icebreaker_generation',
    'Você é um especialista em personalização de emails de prospecção B2B.

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

Responda APENAS com o quebra-gelo, sem explicações.',
    'gpt-4o-mini',
    1,
    true,
    '{"temperature": 0.8, "max_tokens": 150}'::jsonb
);

-- 4. Tone Application Prompt
INSERT INTO public.ai_prompts (
    tenant_id,
    prompt_key,
    prompt_template,
    model_preference,
    version,
    is_active,
    metadata
) VALUES (
    NULL, -- Global prompt
    'tone_application',
    'Você é um especialista em copywriting e adaptação de tom de voz.

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

Responda APENAS com o texto reescrito, sem explicações.',
    'gpt-4o-mini',
    1,
    true,
    '{"temperature": 0.5, "max_tokens": 500}'::jsonb
);

-- 5. Search Translation Prompt (AC #4 - search_translation)
INSERT INTO public.ai_prompts (
    tenant_id,
    prompt_key,
    prompt_template,
    model_preference,
    version,
    is_active,
    metadata
) VALUES (
    NULL, -- Global prompt
    'search_translation',
    'Você é um assistente especializado em extrair parâmetros de busca de leads a partir de linguagem natural.

Dado uma consulta em português, extraia os seguintes filtros para a API Apollo:
- industries: lista de setores (technology, finance, healthcare, education, retail, manufacturing, services, consulting)
- companySizes: tamanho da empresa (1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+)
- locations: cidades, estados ou países mencionados (use formato "Cidade, Country" para cidades brasileiras)
- titles: cargos ou funções mencionados (em inglês para API Apollo)
- contactEmailStatuses: status do email do contato (verified, likely to engage)
- keywords: palavras-chave adicionais para a busca (NÃO usar para filtros de email)
- perPage: quantidade de resultados solicitados (padrão 25, máximo 100)

REGRAS IMPORTANTES:
1. Para localizações brasileiras, sempre adicione ", Brazil" no final
2. Para cargos, traduza para inglês (CEO, CTO, CFO, Sales Manager, etc.)
3. Se "startup" for mencionado, use companySizes ["1-10", "11-50"]
4. Se "enterprise" ou "grande empresa" for mencionado, use companySizes ["1001-5000", "5001-10000", "10001+"]
5. Se nenhum perPage for mencionado, use 25
6. Industries devem estar em inglês
7. CRÍTICO - Status de email: Quando o usuário mencionar "email verificado", "emails verificados", "contato verificado", "e-mail verificado", "e-mails verificados", "só verificados", "apenas verificados" ou variações similares referindo-se à qualidade/status do email, use contactEmailStatuses: ["verified"]. NÃO coloque isso em keywords.
8. Se mencionar "likely to engage" ou "propenso a responder", use contactEmailStatuses: ["likely to engage"]

Responda APENAS com um objeto JSON válido seguindo este schema:
{
  "filters": {
    "industries": string[],
    "companySizes": string[],
    "locations": string[],
    "titles": string[],
    "contactEmailStatuses": string[],
    "keywords": string,
    "perPage": number
  },
  "confidence": number (0-1),
  "explanation": string
}',
    'gpt-4o-mini',
    1,
    true,
    '{"temperature": 0.3, "max_tokens": 500}'::jsonb
);

-- Comments
COMMENT ON TABLE public.ai_prompts IS 'Seeded with global prompts for search translation, email generation, icebreakers, and tone application';
