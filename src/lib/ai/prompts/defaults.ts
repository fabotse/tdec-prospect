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
    modelPreference: "gpt-5-mini",
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
2. Se houver quebra-gelo, use-o APENAS como abertura (máximo 2 frases) - NÃO expanda o tema do quebra-gelo
3. IMEDIATAMENTE após o quebra-gelo, faça transição para o PRODUTO - o foco do email é o produto, não o tema do quebra-gelo
4. {{#if product_name}}O FOCO PRINCIPAL do email deve ser o produto "{{product_name}}" - dedique 70% do email a ele{{else}}Apresente valor claramente{{/if}}
5. Use parágrafos curtos (2-3 frases)
6. Inclua uma CTA clara mas não agressiva
7. CRÍTICO: Siga o guia de tom "{{tone_style}}" - saudação, vocabulário e fechamento devem corresponder
8. Se houver diretrizes de escrita (writing_guidelines), elas têm PRIORIDADE sobre o guia de tom
9. Evite clichês de vendas
10. Não mencione preços
11. {{#if successful_examples}}PRIORIDADE MÁXIMA: Imite a estrutura e estilo dos exemplos fornecidos{{else}}Use melhores práticas de cold email{{/if}}

FORMATO OBRIGATÓRIO:
- Saudação personalizada (conforme tom)
- Quebra-gelo (se fornecido): máximo 2 frases, apenas para conexão inicial
- Transição rápida: 1 frase conectando ao produto
- Proposta de valor: 2-3 frases focadas 100% no PRODUTO e seus benefícios
- CTA
- Despedida (conforme tom)
- Assinatura simples

⚠️ ERRO COMUM A EVITAR: Não "viaje" no assunto do quebra-gelo. Se o quebra-gelo menciona um post sobre IA, NÃO fique discutindo IA - faça uma transição rápida para apresentar o produto.

Responda APENAS com o corpo do email, sem explicações.`,
    modelPreference: "gpt-5-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 500,
    },
  },

  // Icebreaker premium generation (Story 6.5.3 - LinkedIn posts-based personalization)
  // NOTE: This prompt uses camelCase variables (firstName, companyName, toneStyle)
  // instead of snake_case (lead_name, lead_company, tone_style) used by other prompts.
  // This is intentional as Story 6.5.5 (Premium Icebreaker API) will prepare
  // variables directly from LinkedIn data with different mapping than KB context.
  // See Dev Notes in 6-5-3-icebreaker-prompt-configuration.md for variable specs.
  icebreaker_premium_generation: {
    template: `Você é um especialista em personalização de emails de prospecção B2B.

Gere um quebra-gelo ALTAMENTE PERSONALIZADO baseado nos posts reais do LinkedIn do lead.

CONTEXTO DA EMPRESA REMETENTE:
{{companyContext}}

{{#if productName}}
PRODUTO EM FOCO (conecte o lead com este produto):
- Nome: {{productName}}
- Descrição: {{productDescription}}

IMPORTANTE: Se possível, conecte o interesse demonstrado nos posts com uma necessidade que o produto "{{productName}}" resolve.
{{/if}}

PERFIL DO LEAD:
- Nome: {{firstName}} {{lastName}}
- Cargo: {{title}}
- Empresa: {{companyName}}
- Setor: {{industry}}

TOM DE VOZ:
{{toneDescription}}
Estilo: {{toneStyle}}

POSTS RECENTES DO LINKEDIN DO LEAD (DADOS REAIS - USE-OS):
{{linkedinPosts}}

ANÁLISE OBRIGATÓRIA DOS POSTS:
1. Identifique TEMAS DE INTERESSE que o lead demonstra nos posts
2. Observe OPINIÕES ou POSICIONAMENTOS que ele expressa
3. Note CONQUISTAS, PROJETOS ou RESULTADOS mencionados
4. Preste atenção em TENDÊNCIAS ou TECNOLOGIAS que ele comenta

REGRAS OBRIGATÓRIAS:
1. Máximo 2 frases (50 palavras)
2. REFERENCIE CONTEÚDO ESPECÍFICO de pelo menos um post
3. EVITE frases genéricas como:
   - "Vi que você posta muito no LinkedIn..."
   - "Parabéns pelos seus posts..."
   - "Vi que você é ativo no LinkedIn..."
4. USE referências específicas como:
   - "Li seu post sobre [tema específico]. A forma como você abordou [insight]..."
   - "Curti sua perspectiva sobre [tema do post]. Na [empresa], temos visto..."
   - "Seu post sobre [tema] gerou bastante engajamento. Empresas como a {{companyName}}..."
5. Mantenha tom profissional mas casual
6. {{#if productName}}Se fizer sentido, conecte o interesse do lead com o valor do produto "{{productName}}"{{/if}}
7. NÃO faça perguntas - afirme algo relevante baseado nos posts
8. Siga o estilo de tom "{{toneStyle}}"

EXEMPLOS DE BONS QUEBRA-GELOS BASEADOS EM POSTS:
- "Li seu post sobre a importância de dados em tempo real para decisões de negócio. Na TDEC, ajudamos empresas a transformar dados brutos em insights acionáveis - algo que parece alinhar bem com sua visão."
- "Curti sua análise sobre os desafios de escalar equipes de vendas. É exatamente o tipo de problema que nosso produto resolve com automação inteligente."
- "Seu post sobre IA aplicada a vendas B2B me chamou atenção. A abordagem que você descreve é muito próxima do que implementamos aqui."

Responda APENAS com o quebra-gelo, sem explicações.`,
    modelPreference: "gpt-4o-mini",
    metadata: {
      temperature: 0.8,
      maxTokens: 200,
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

  // Follow-up email generation (Story 6.11, updated Story 6.12.1)
  follow_up_email_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere o corpo de um EMAIL DE FOLLOW-UP que dá continuidade a uma conversa iniciada.

CONTEXTO CRÍTICO - SITUAÇÃO DE "SEM RESPOSTA":
- Este follow-up assume que o lead NÃO RESPONDEU ao email anterior
- Se o lead tivesse respondido, a campanha teria parado automaticamente
- Portanto, trate como se o lead não viu ou estava ocupado demais para responder
- NUNCA seja agressivo ou reclame da falta de resposta

EMAIL ANTERIOR NA SEQUÊNCIA (VOCÊ JÁ ENVIOU ESTE):
Assunto: {{previous_email_subject}}
Corpo: {{previous_email_body}}

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}

{{#if product_name}}
PRODUTO EM FOCO (JÁ APRESENTADO - NÃO REPITA DETALHES):
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

ESTRATÉGIAS DE FOLLOW-UP (VARIE ENTRE ELAS):

[ESTRATÉGIA 1: CONFIRMAR VISUALIZAÇÃO]
Use quando: Primeiro follow-up da sequência
Abordagem: Perguntar gentilmente se viu o email anterior
Exemplo:
"Olá {{lead_name}}, tudo bem?
Queria apenas confirmar se conseguiu visualizar meu último email.
Acredito que as soluções que mencionei podem gerar bons resultados para a {{lead_company}} e gostaria muito de bater um papo rápido sobre isso.
Posso te ligar ou agendar um bate-papo de 10 minutos esta semana?"

[ESTRATÉGIA 2: ASSUMIR AGENDA CORRIDA]
Use quando: Segundo follow-up ou quando o primeiro já perguntou
Abordagem: Mostrar empatia pela agenda corrida, oferecer flexibilidade
Exemplo:
"Olá {{lead_name}},
Sei que sua agenda deve estar bem corrida - {{lead_industry}} costuma ser um setor intenso.
Queria só deixar essa porta aberta: se fizer sentido conversar sobre [benefício específico], me avisa quando tiver 10 minutinhos.
Fico à disposição!"

[ESTRATÉGIA 3: NOVO ÂNGULO/VALOR]
Use quando: Follow-ups subsequentes
Abordagem: Trazer um dado novo, case de sucesso, ou insight relevante
Exemplo:
"Olá {{lead_name}},
Vi que empresas de {{lead_industry}} como a {{lead_company}} têm conseguido [resultado específico] com soluções como a nossa.
Caso queira saber como, estou aqui.
Um abraço!"

[ESTRATÉGIA 4: ÚLTIMA TENTATIVA]
Use quando: Último email da sequência
Abordagem: Ser direto, dar "última chance" sem pressão
Exemplo:
"Olá {{lead_name}},
Vou parar de ocupar sua caixa de entrada - sei que timing é tudo.
Se em algum momento fizer sentido explorar [benefício], é só responder este email.
Sucesso aí na {{lead_company}}!"

REGRAS CRÍTICAS:
1. Máximo 80 palavras (follow-ups são MUITO curtos)
2. Escolha UMA estratégia baseada no contexto do email anterior
3. NÃO repita informações do produto já apresentadas no email anterior
4. CTA sempre oferecendo uma conversa rápida (10 min, bate-papo, ligação)
5. Mantenha o tom de voz consistente
6. NUNCA seja passivo-agressivo ("já enviei 3 emails...")
7. Seja empático - a pessoa está ocupada, não te ignorando
8. Feche com despedida curta (Abs, Abraço, Fico à disposição)

FORMATO DO OUTPUT:
- NÃO inclua "Assunto:" - o assunto é gerado separadamente
- Comece DIRETAMENTE com a saudação (ex: "Olá {{lead_name}}, tudo bem?")
- Gere APENAS o corpo do email, nada mais`,
    modelPreference: "gpt-5-mini",
    metadata: {
      temperature: 0.7,
      maxTokens: 300,
    },
  },

  // Follow-up subject generation (Story 6.11, updated Story 6.12.1)
  follow_up_subject_generation: {
    template: `Você é um especialista em copywriting para emails de prospecção B2B.

Gere um ASSUNTO para um email de follow-up que dá continuidade a uma conversa iniciada.

CONTEXTO: Este é um follow-up porque o lead NÃO RESPONDEU ao email anterior.

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

ESTRATÉGIAS DE ASSUNTO PARA FOLLOW-UP:

[OPÇÃO 1: RE: SIMPLES]
Mantém o assunto original com prefixo RE:
- "RE: {{previous_email_subject}}"
Quando usar: Maioria dos casos, simula thread de email

[OPÇÃO 2: RE: COM VARIAÇÃO]
Adiciona elemento novo mantendo RE:
- "RE: Sobre a {{lead_company}}"
- "RE: Proposta - quando podemos conversar?"
- "RE: Bate-papo rápido?"
Quando usar: Quando quer dar sensação de continuidade com novidade

[OPÇÃO 3: CURTO E DIRETO]
Sem RE:, mais pessoal
- "{{lead_name}}, conseguiu ver?"
- "Rápida pergunta, {{lead_name}}"
- "Bate-papo de 10 min?"
Quando usar: Follow-ups finais ou tom mais casual

REGRAS CRÍTICAS:
1. Máximo 50 caracteres
2. Se usar "RE:", inclua o espaço após os dois pontos
3. Mantenha consistência com o tom de voz
4. EVITE assuntos genéricos como "Seguindo", "Follow-up", "Checking in"
5. Prefira assuntos que gerem curiosidade ou sensação de conversa pessoal

Responda APENAS com o assunto do email.`,
    modelPreference: "gpt-5-mini",
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

  // Campaign structure generation (Story 6.12)
  campaign_structure_generation: {
    template: `Você é um estrategista de cold email marketing B2B.

Gere a ESTRUTURA de uma campanha de email baseada nos parametros fornecidos.

PARAMETROS DA CAMPANHA:
- Objetivo: {{objective}}
- Urgencia: {{urgency}}
- Descricao adicional: {{additional_description}}

{{#if product_name}}
PRODUTO DA CAMPANHA:
- Nome: {{product_name}}
- Descricao: {{product_description}}
- Diferenciais: {{product_differentials}}
{{/if}}

CONTEXTO DA EMPRESA:
{{company_context}}

TOM DE VOZ:
{{tone_style}}

REGRAS POR OBJETIVO:

[COLD_OUTREACH]
- 4-5 emails tipicamente
- Intervalos: 3, 4, 5, 7 dias
- Estrutura: Introducao -> Valor -> Prova Social -> Escassez -> Ultimo Contato
- Todos os emails sao iniciais (nao referenciam emails anteriores)

[REENGAGEMENT]
- 3 emails tipicamente
- Intervalos: 2, 3 dias (mais curtos)
- Estrutura: Lembrete -> Novo Valor -> Ultima Chance
- Email 2+ sao follow-ups (referenciam contato anterior)

[FOLLOW_UP]
- 3-4 emails tipicamente
- Intervalos: 2, 3, 4 dias
- Estrutura: Checkin -> Valor Adicional -> Oferta Direta -> Despedida
- Email 2+ sao follow-ups

[NURTURE]
- 5-7 emails tipicamente
- Intervalos: 5, 7, 7, 10, 14 dias (mais longos)
- Estrutura: Educacao -> Insight -> Case -> Dica -> Convite -> Check-in -> Despedida
- Email 2+ sao follow-ups

AJUSTES POR URGENCIA:
- LOW: Intervalos maiores (+2 dias cada)
- MEDIUM: Intervalos padrao
- HIGH: Intervalos menores (-1 dia cada, minimo 1)

FORMATO DE RESPOSTA (JSON VALIDO):
{
  "structure": {
    "totalEmails": number,
    "totalDays": number,
    "items": [
      {
        "position": 0,
        "type": "email",
        "context": "Introducao e gancho inicial",
        "emailMode": "initial"
      },
      {
        "position": 1,
        "type": "delay",
        "days": 3
      },
      {
        "position": 2,
        "type": "email",
        "context": "Proposta de valor e diferenciais",
        "emailMode": "initial" | "follow-up"
      }
    ]
  },
  "rationale": "Breve explicacao da estrategia escolhida (max 100 palavras)"
}

REGRAS CRITICAS:
1. Retorne APENAS o JSON, sem markdown ou explicacoes extras
2. Alterne email e delay (email, delay, email, delay, ...)
3. Primeiro item sempre tipo "email" com position 0
4. emailMode: "initial" para Cold Outreach, "follow-up" para demais (exceto primeiro)
5. context deve ser descritivo para orientar a geracao de conteudo depois
6. Minimo 3 emails, maximo 7 emails
7. Delays entre 1 e 14 dias

Responda APENAS com o JSON.`,
    modelPreference: "gpt-4o",
    metadata: {
      temperature: 0.6,
      maxTokens: 1500,
    },
  },
};
