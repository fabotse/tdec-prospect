# Epic 9: AI Content Quality & Personalization

## Overview

Evolução do sistema de geração de conteúdo AI para atingir personalização real nos Ice Breakers e emails de campanha. Atualmente, os Ice Breakers gerados são genéricos e repetitivos, e a geração de campanha via AI não utiliza dados de leads para personalização. Esta Epic resolve isso com categorias de Ice Breaker, exemplos de referência no Knowledge Base, e variáveis dinâmicas para campanhas.

## Contexto

### Situação Atual
- **Ice Breaker genérico**: Prompt gera Ice Breakers com padrão repetitivo ("Vi seus posts...", "Tenho acompanhado...")
- **Campanha AI sem personalização**: Geração de campanha não considera dados de leads específicos para o Ice Breaker
- **Sem exemplos de referência**: A AI não tem base de exemplos reais de bons Ice Breakers para calibrar qualidade
- **Sem categorias**: Todos os Ice Breakers seguem o mesmo padrão, sem considerar se o foco é no lead, na empresa, no cargo, etc.
- **Estrutura do email implícita**: A separação Saudação → Ice Breaker → Conteúdo → CTA não está explícita nos prompts de campanha

### Objetivo
- Ice Breakers com personalização real e variedade, categorizados por foco (lead, empresa, cargo, post)
- Usuário pode cadastrar exemplos de Ice Breakers como referência no Knowledge Base
- Geração de campanha com variável `{{ice_breaker}}` quando sem lead selecionado
- Prompts refatorados com estrutura clara e consistente

### Infraestrutura Existente (referência)
- **Prompt Manager** com fallback 3 níveis (tenant → global → code default) — `src/lib/ai/prompt-manager.ts`
- **9 prompts** em `src/lib/ai/prompts/defaults.ts` (incluindo `icebreaker_generation` e `icebreaker_premium_generation`)
- **Knowledge Base Context** com suporte a `successful_examples` — `src/lib/services/knowledge-base-context.ts`
- **Template engine** com `{{variável}}` e `{{#if}}...{{else}}...{{/if}}`
- **Campaign structure generation** via `src/app/api/ai/campaign-structure/route.ts`

---

## Stories

### Story 9.1: Categorias de Ice Breaker

**Como** usuário,
**Quero** selecionar a categoria/foco do Ice Breaker ao gerá-lo,
**Para** que a personalização seja direcionada ao contexto correto (lead, empresa, cargo ou post).

**Critérios de Aceite:**

1. **Given** o usuário está gerando um Ice Breaker (individual ou em lote)
   **When** inicia a geração
   **Then** pode selecionar uma categoria de foco:
   - **Lead** (foco na pessoa: posts, conquistas, opiniões)
   - **Empresa** (foco na empresa: crescimento, mercado, oportunidade de negócio)
   - **Cargo** (foco no cargo/função: desafios típicos do role, decisões que toma)
   - **Post/LinkedIn** (foco em conteúdo publicado — já existe no premium)
   **And** a categoria padrão é "Empresa" quando nenhuma é selecionada

2. **Given** uma categoria é selecionada
   **When** o prompt de Ice Breaker é montado
   **Then** as instruções do prompt são adaptadas para aquela categoria
   **And** os exemplos internos do prompt mudam conforme a categoria
   **And** as regras de foco mudam (ex: "Cargo" enfatiza desafios do role, não posts)

3. **Given** a categoria "Post/LinkedIn" é selecionada
   **When** o lead não possui posts do LinkedIn enriquecidos
   **Then** o sistema avisa que é necessário enriquecer os posts primeiro
   **And** faz fallback para a categoria "Lead" automaticamente

**Arquivos Afetados:**
- `src/lib/ai/prompts/defaults.ts` — adaptar prompts `icebreaker_generation` e `icebreaker_premium_generation`
- `src/types/ai-prompt.ts` — adicionar tipo `IcebreakerCategory`
- `src/hooks/use-icebreaker-enrichment.ts` — aceitar categoria como parâmetro
- `src/app/api/leads/enrich-icebreaker/route.ts` — receber e processar categoria
- Componentes UI que disparam a geração de Ice Breaker

**Notas Técnicas:**
- A categoria é uma variável de template `{{icebreaker_category}}` passada ao prompt
- O prompt usa blocos condicionais `{{#if}}` para alternar instruções por categoria
- A categoria "Post/LinkedIn" redireciona para o prompt `icebreaker_premium_generation` existente

---

### Story 9.2: Exemplos de Referência para Ice Breakers no Knowledge Base

**Como** usuário,
**Quero** cadastrar exemplos de Ice Breakers reais no Knowledge Base,
**Para** que a AI use esses exemplos como referência de estilo e qualidade ao gerar novos.

**Critérios de Aceite:**

1. **Given** o usuário está na seção de Knowledge Base
   **When** acessa a área de exemplos
   **Then** existe uma seção dedicada para "Exemplos de Ice Breakers"
   **And** é separada da seção de "Exemplos de Emails" existente

2. **Given** o usuário adiciona um exemplo de Ice Breaker
   **When** salva o exemplo
   **Then** pode informar:
   - O texto do Ice Breaker
   - A categoria (Lead, Empresa, Cargo, Post) — opcional
   **And** o exemplo é persistido no Knowledge Base do tenant

3. **Given** existem exemplos cadastrados
   **When** a AI gera um Ice Breaker
   **Then** os exemplos são injetados no prompt via variável `{{icebreaker_examples}}`
   **And** no máximo 3 exemplos são usados (priorizando os da mesma categoria selecionada)
   **And** o prompt instrui a AI a imitar o estilo dos exemplos

4. **Given** não existem exemplos cadastrados
   **When** a AI gera um Ice Breaker
   **Then** o bloco de exemplos é omitido do prompt (graceful degradation)
   **And** os exemplos hardcoded atuais do prompt são usados como fallback

**Arquivos Afetados:**
- `src/lib/services/knowledge-base-context.ts` — adicionar método para buscar exemplos de IB
- `src/lib/ai/prompts/defaults.ts` — adicionar variável `{{icebreaker_examples}}` nos prompts de IB
- Componentes UI do Knowledge Base — nova seção de exemplos de Ice Breaker
- Schema do banco — nova tabela ou campo para exemplos de IB (avaliar se reutiliza estrutura de email examples)

**Notas Técnicas:**
- Avaliar reutilização da estrutura `EmailExample[]` existente no KB, adicionando um campo `type: "email" | "icebreaker"`
- A variável `{{icebreaker_examples}}` segue o mesmo padrão que `{{successful_examples}}` já usado nos prompts de email

---

### Story 9.3: Refatoração dos Prompts de Ice Breaker

**Como** sistema,
**Quero** que os prompts de geração de Ice Breaker sejam refatorados para usar categorias e exemplos,
**Para** gerar Ice Breakers com mais variedade, qualidade e personalização real.

**Critérios de Aceite:**

1. **Given** o prompt `icebreaker_generation` é executado
   **When** a categoria é "Empresa"
   **Then** o Ice Breaker foca em:
   - Oportunidade de negócio para a empresa do lead
   - Crescimento, mercado, ou desafios do setor da empresa
   - Conexão entre o produto oferecido e a necessidade da empresa
   **And** NÃO menciona posts, perfil pessoal ou conquistas individuais

2. **Given** o prompt `icebreaker_generation` é executado
   **When** a categoria é "Cargo"
   **Then** o Ice Breaker foca em:
   - Desafios típicos do cargo/função do lead
   - Decisões que profissionais naquele cargo tomam
   - Conexão entre o produto e as dores específicas do role
   **And** usa o cargo como ponto de conexão principal

3. **Given** o prompt `icebreaker_generation` é executado
   **When** a categoria é "Lead"
   **Then** o Ice Breaker foca em:
   - Informações disponíveis sobre a pessoa
   - Trajetória, posição, ou contexto do lead no mercado
   **And** é genérico mas personalizado com dados reais do lead

4. **Given** existem exemplos de referência do KB
   **When** o prompt é montado
   **Then** o bloco de exemplos aparece ANTES das regras
   **And** a instrução "IMITE O ESTILO DOS EXEMPLOS" tem prioridade máxima
   **And** os exemplos filtrados são da mesma categoria quando possível

5. **Given** o prompt gera o Ice Breaker
   **When** o resultado é avaliado
   **Then** NÃO contém frases genéricas como:
   - "Vi que você é ativo no LinkedIn"
   - "Tenho acompanhado seus posts"
   - "Parabéns pelos seus conteúdos"
   **And** contém referências específicas aos dados reais do lead/empresa

**Arquivos Afetados:**
- `src/lib/ai/prompts/defaults.ts` — reescrever `icebreaker_generation` com blocos condicionais por categoria
- `src/app/api/leads/enrich-icebreaker/route.ts` — passar exemplos do KB e categoria ao prompt

**Notas Técnicas:**
- Dependência: Stories 9.1 e 9.2 devem estar completas
- O prompt `icebreaker_premium_generation` (LinkedIn) já é bom — ajustes menores apenas

---

### Story 9.4: Variável {{ice_breaker}} na Geração de Campanha AI

**Como** usuário,
**Quero** que, ao gerar uma campanha via AI sem lead selecionado, o Ice Breaker apareça como variável `{{ice_breaker}}`,
**Para** que eu saiba onde a personalização será inserida e possa editá-la depois.

**Critérios de Aceite:**

1. **Given** o usuário gera uma campanha via AI
   **When** nenhum lead está selecionado
   **Then** o corpo do primeiro email contém a variável `{{ice_breaker}}` no local onde o Ice Breaker deveria estar
   **And** os follow-ups NÃO contêm a variável (follow-ups não precisam de Ice Breaker)

2. **Given** o usuário gera uma campanha via AI
   **When** pelo menos um lead está selecionado
   **Then** o Ice Breaker é gerado com dados reais daquele lead
   **And** a variável `{{ice_breaker}}` NÃO aparece — é substituída pelo conteúdo real
   **And** um aviso informa que o Ice Breaker foi gerado com base no lead X e pode variar para outros leads

3. **Given** o email contém a variável `{{ice_breaker}}`
   **When** é exibido no editor de campanha
   **Then** a variável é renderizada com destaque visual (badge, cor diferente, ou tag)
   **And** o usuário pode clicar na variável para editá-la manualmente

4. **Given** o email contém a variável `{{ice_breaker}}`
   **When** o usuário visualiza o preview
   **Then** é exibido um placeholder explicativo: "[Ice Breaker personalizado será gerado para cada lead]"

**Arquivos Afetados:**
- `src/app/api/ai/campaign-structure/route.ts` — ajustar geração para incluir variável
- `src/lib/ai/prompts/defaults.ts` — ajustar prompt `campaign_structure_generation`
- Prompt de geração de email body — lógica condicional para variável vs. conteúdo real
- Componentes do Campaign Builder — renderização da variável com destaque

**Notas Técnicas:**
- A variável `{{ice_breaker}}` é um padrão de template que será resolvido futuramente (Epic de exportação/envio)
- No editor, pode usar regex para detectar e destacar variáveis `{{...}}`
- A geração de email body já recebe `{{icebreaker}}` — verificar alinhamento de nomenclatura

---

### Story 9.5: Estrutura Clara nos Prompts de Geração de Email de Campanha

**Como** sistema,
**Quero** que os prompts de geração de email tenham a estrutura Saudação → Ice Breaker → Conteúdo → CTA explícita,
**Para** que cada parte do email seja tratada como um bloco independente com regras próprias.

**Critérios de Aceite:**

1. **Given** o prompt `email_body_generation` é executado
   **When** gera um email para campanha
   **Then** o resultado segue a estrutura:
   - **Saudação**: Personalizada conforme tom (1 linha)
   - **Ice Breaker**: Personalizado conforme categoria (máx 2 frases) OU variável `{{ice_breaker}}`
   - **Transição**: 1 frase conectando IB ao produto
   - **Conteúdo do produto**: 2-3 frases focadas no produto/valor
   - **CTA**: Call-to-action clara mas não agressiva
   - **Despedida**: Conforme tom

2. **Given** o email gerado é um follow-up (posição 2+ na campanha)
   **When** o prompt gera o follow-up
   **Then** a estrutura é simplificada:
   - **Saudação**: Curta
   - **Conteúdo**: Referência ao email anterior + novo ângulo
   - **CTA**: Direto
   - **Despedida**: Breve
   **And** NÃO contém Ice Breaker (já foi usado no primeiro email)

3. **Given** a campanha é gerada via AI completa (estrutura + conteúdo)
   **When** cada email é gerado na sequência
   **Then** o contexto do email anterior é passado para o próximo
   **And** não há repetição de informações entre emails
   **And** cada email traz um ângulo diferente (valor, prova social, escassez, etc.)

**Arquivos Afetados:**
- `src/lib/ai/prompts/defaults.ts` — refatorar `email_body_generation` e `follow_up_email_generation`
- `src/app/api/ai/generate/route.ts` — garantir que o contexto sequencial é passado

**Notas Técnicas:**
- O prompt `email_body_generation` já tem um "FORMATO OBRIGATÓRIO" — será refinado para ser mais explícito
- O prompt `follow_up_email_generation` já tem estratégias de follow-up — será alinhado com a nova estrutura
- Dependência: Story 9.4 para a lógica de `{{ice_breaker}}` vs conteúdo real

---

### Story 9.6: Revisão de Qualidade Geral dos Prompts AI

**Como** sistema,
**Quero** que todos os prompts de AI sejam revisados para consistência, clareza e qualidade,
**Para** garantir que o padrão de geração é uniforme em todo o sistema.

**Critérios de Aceite:**

1. **Given** os 9 prompts do sistema
   **When** são revisados
   **Then** todos seguem a mesma estrutura de seções:
   - CONTEXTO → PERFIL DO LEAD → TOM DE VOZ → EXEMPLOS → REGRAS → FORMATO
   **And** a nomenclatura de variáveis é consistente (resolver `camelCase` vs `snake_case`)

2. **Given** os prompts de Ice Breaker e Email
   **When** são executados em sequência (IB → Email)
   **Then** o Ice Breaker gerado é usado naturalmente no email
   **And** o email não repete ou expande excessivamente o tema do IB
   **And** a transição IB → conteúdo é fluida

3. **Given** as diretrizes de tom (casual, formal, técnico)
   **When** são aplicadas em qualquer prompt
   **Then** o resultado respeita o tom selecionado
   **And** os guias de tom são idênticos em todos os prompts (sem divergências)

4. **Given** o prompt `icebreaker_premium_generation` usa `camelCase` (firstName, companyName)
   **When** comparado com `icebreaker_generation` que usa `snake_case` (lead_name, lead_company)
   **Then** a nomenclatura é unificada em um padrão único
   **And** todos os pontos de chamada são atualizados

**Arquivos Afetados:**
- `src/lib/ai/prompts/defaults.ts` — todos os 9 prompts
- `src/types/ai-prompt.ts` — se houver mudança de variáveis
- `src/lib/services/knowledge-base-context.ts` — se variáveis mudarem
- `src/app/api/leads/enrich-icebreaker/route.ts` — alinhamento de variáveis

**Notas Técnicas:**
- Story de "polimento" — deve ser executada por último
- Dependência: Todas as stories anteriores (9.1 a 9.5)
- Inclui testes manuais de geração para validar qualidade

---

## Estimativa de Esforço

| Story | Complexidade | Arquivos | Prioridade | Dependência |
|-------|-------------|----------|------------|-------------|
| 9.1 Categorias de IB | ⭐⭐ Média | ~5 | P0 | — |
| 9.2 Exemplos no KB | ⭐⭐ Média | ~5 | P0 | — |
| 9.3 Refatoração Prompts IB | ⭐⭐ Média | ~3 | P1 | 9.1 + 9.2 |
| 9.4 Variável {{ice_breaker}} | ⭐⭐ Média | ~4 | P1 | — |
| 9.5 Estrutura Email Campanha | ⭐⭐ Média | ~3 | P1 | 9.4 |
| 9.6 Quality Review Geral | ⭐⭐⭐ Alta | ~5 | P2 | 9.1-9.5 |

**Total Epic:** 6 stories

---

## Ordem de Execução Recomendada

```
9.1 (Categorias) ──┐
                    ├──→ 9.3 (Refatoração Prompts IB) ──┐
9.2 (Exemplos KB) ─┘                                    │
                                                         ├──→ 9.6 (Quality Review)
9.4 (Variável {{ice_breaker}}) ──→ 9.5 (Estrutura Email)┘
```

- 9.1 e 9.2 podem ser executadas em paralelo
- 9.4 é independente de 9.1/9.2 e pode ser feita em paralelo também
- 9.3 depende de 9.1 + 9.2
- 9.5 depende de 9.4
- 9.6 é a última (polimento geral)

---

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Prompts longos demais (custo/latência) | Média | Manter máximo de 800 tokens por prompt; usar blocos condicionais para omitir seções vazias |
| Inconsistência camelCase/snake_case ao unificar | Baixa | Story 9.6 dedicada; mapear todos os pontos de chamada antes de mudar |
| Qualidade dos exemplos do usuário impactar negativamente | Baixa | Limitar a 3 exemplos no prompt; manter exemplos hardcoded como fallback |
| Categoria de IB complexa demais no UI | Média | Começar com dropdown simples; categoria padrão "Empresa" se não selecionada |

---

## Decisões Pendentes

| Decisão | Opções | Status |
|---------|--------|--------|
| Nomenclatura unificada de variáveis | snake_case vs camelCase | Definir na Story 9.6 |
| Estrutura de exemplos no KB | Reutilizar `EmailExample[]` com campo type vs. nova tabela | Definir na Story 9.2 |
| UI das categorias de IB | Dropdown vs. Radio buttons vs. Segmented control | Definir na Story 9.1 |

---

## Aprovação

- [ ] Product Owner aprova escopo
- [ ] Decisões de design definidas
- [ ] Dev confirma viabilidade técnica

---

*Documento criado em: 2026-02-05*
*Epic anterior: Epic 8 - Visual Refresh (concluída)*
*Próxima na fila: Epic 7 - Campaign Deployment (backlog)*
