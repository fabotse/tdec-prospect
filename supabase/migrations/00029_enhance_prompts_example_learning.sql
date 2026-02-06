-- Migration: Enhance AI Prompts for Example Learning
-- Story 6.10: Use of Successful Examples
--
-- Enhances email_subject_generation, email_body_generation, and icebreaker_generation
-- prompts with explicit instructions to LEARN from examples, not just reference them.
-- AI will now adopt structure, vocabulary, and personalization patterns from examples.
--
-- AC #1: Examples included in AI prompts (already done in 6.3, this enhances)
-- AC #2: Generated text adopts similar structure to examples
-- AC #3: Personalization techniques learned from examples
-- AC #4: Output feels user-written by matching example style

-- Update email_subject_generation prompt with example learning instructions
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

Responda APENAS com o assunto do email, sem explicações.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'email_subject_generation' AND tenant_id IS NULL;

-- Update email_body_generation prompt with example learning instructions
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

Responda APENAS com o corpo do email, sem explicações.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'email_body_generation' AND tenant_id IS NULL;

-- Update icebreaker_generation prompt with example learning instructions
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

Responda APENAS com o quebra-gelo, sem explicações.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'icebreaker_generation' AND tenant_id IS NULL;

-- Add comment for documentation
COMMENT ON TABLE public.ai_prompts IS
  'AI prompt templates. Story 6.10 added explicit example learning instructions - AI now adopts structure, vocabulary, and personalization patterns from user examples';
