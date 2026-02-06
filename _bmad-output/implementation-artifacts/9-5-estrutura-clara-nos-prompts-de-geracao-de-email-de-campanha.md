# Story 9.5: Estrutura Clara nos Prompts de Geração de Email de Campanha

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system,
I want the email generation prompts to have explicit Greeting → Ice Breaker → Content → CTA structure,
so that each part is treated as an independent block with its own rules, improving quality and consistency of generated emails.

## Acceptance Criteria

1. **First Email (`emailMode: "initial"`) follows explicit block structure:**
   - **[SAUDAÇÃO]** Personalizada conforme tom (1 linha)
   - **[QUEBRA-GELO]** Personalizado por categoria (max 2 frases) OU variável `{{ice_breaker}}`
   - **[TRANSIÇÃO]** 1 frase conectando o quebra-gelo ao produto
   - **[CONTEÚDO PRODUTO]** 2-3 frases focadas no valor do produto
   - **[CTA]** Call-to-action claro mas não agressivo
   - **[FECHAMENTO]** Conforme tom de voz
   - Cada seção tem regras independentes que NÃO interferem nas outras seções

2. **Follow-up Emails (position 2+) follow simplified structure:**
   - **[SAUDAÇÃO]** Curta
   - **[CONTEÚDO]** Referencia email anterior + ângulo novo
   - **[CTA]** Direto
   - **[FECHAMENTO]** Breve
   - **SEM Ice Breaker** (já usado no primeiro email)
   - Cada follow-up usa ângulo diferente (valor, prova social, escassez, urgência suave, despedida)

3. **Sequential context passing validated:**
   - Cada email na sequência recebe contexto do email anterior via `previous_email_subject` e `previous_email_body`
   - O prompt de follow-up instrui explicitamente a NÃO repetir informações já mencionadas
   - Cada ângulo deve ser diferente dos anteriores na sequência

4. **Tests validate prompt structure and behavior:**
   - Testes verificam presença de seções obrigatórias no template `email_body_generation`
   - Testes verificam presença de seções obrigatórias no template `follow_up_email_generation`
   - Testes verificam que conditional blocks (icebreaker, product, examples) continuam funcionando
   - Testes verificam que `{{ice_breaker}}` literal sobrevive interpolação (regressão Story 9.4)

## Tasks / Subtasks

- [x] Task 1: Refatorar prompt `email_body_generation` em `defaults.ts` (AC: #1)
  - [x] 1.1: Reestruturar seção "FORMATO OBRIGATÓRIO" com blocos explícitos [SAUDAÇÃO], [QUEBRA-GELO], [TRANSIÇÃO], [CONTEÚDO], [CTA], [FECHAMENTO]
  - [x] 1.2: Adicionar regras específicas POR BLOCO (não regras genéricas que misturam seções)
  - [x] 1.3: Manter lógica condicional `{{#if icebreaker}}...{{else}}...{{/if}}` dentro do bloco [QUEBRA-GELO]
  - [x] 1.4: Manter lógica condicional `{{#if product_name}}...{{/if}}` dentro do bloco [CONTEÚDO]
  - [x] 1.5: Manter lógica de exemplos `{{#if successful_examples}}...{{/if}}`
  - [x] 1.6: Preservar todas as variáveis existentes — nenhuma variável nova é necessária

- [x] Task 2: Refatorar prompt `follow_up_email_generation` em `defaults.ts` (AC: #2, #3)
  - [x] 2.1: Reestruturar com blocos explícitos [SAUDAÇÃO], [CONTEÚDO], [CTA], [FECHAMENTO]
  - [x] 2.2: Melhorar instrução de "anti-repetição" — referenciar email anterior mas trazer ângulo NOVO
  - [x] 2.3: Definir ângulos sugeridos por posição na sequência (2o: valor adicional, 3o: prova social, 4o: escassez suave, 5o: despedida)
  - [x] 2.4: Manter estratégias existentes (Confirmar Visualização, Agenda Corrida, Novo Ângulo, Última Tentativa)
  - [x] 2.5: Adicionar regra explícita: "NÃO inclua Ice Breaker — já usado no primeiro email"

- [x] Task 3: Criar testes de validação de estrutura (AC: #4)
  - [x] 3.1: Testes para `email_body_generation` — verificar presença de seções [SAUDAÇÃO], [QUEBRA-GELO], [TRANSIÇÃO], [CONTEÚDO], [CTA], [FECHAMENTO]
  - [x] 3.2: Testes para `follow_up_email_generation` — verificar presença de seções [SAUDAÇÃO], [CONTEÚDO], [CTA], [FECHAMENTO]
  - [x] 3.3: Testes de regressão — conditionals `{{#if icebreaker}}`, `{{#if product_name}}`, `{{#if successful_examples}}`
  - [x] 3.4: Teste de regressão Story 9.4 — `{{ice_breaker}}` literal preservada na interpolação

- [x] Task 4: Validação final
  - [x] 4.1: Rodar `npx vitest run` — todos os testes passando
  - [x] 4.2: Verificar que testes existentes de Story 9.4 continuam passando (regressão)
  - [x] 4.3: ESLint sem violações (no-console rule)

## Dev Notes

### Escopo e Limites

**ESTA STORY MODIFICA APENAS PROMPTS (TEXTO)**. Não há mudanças em lógica de negócio, componentes UI, hooks, ou rotas API.

**ESCOPO INCLUÍDO:**
- Refatorar texto dos prompts `email_body_generation` e `follow_up_email_generation` em `defaults.ts`
- Criar testes que validam a estrutura dos prompts

**ESCOPO EXCLUÍDO:**
- NÃO modificar a rota `/api/ai/generate/route.ts` (contexto sequencial já funciona)
- NÃO modificar o hook `use-ai-full-campaign-generation.ts` (passagem de contexto já implementada)
- NÃO modificar `EmailBlock.tsx` ou `PreviewEmailStep.tsx`
- NÃO modificar `campaign_structure_generation` (prompt de estrutura é outra coisa)
- NÃO unificar variáveis camelCase/snake_case (isso é Story 9.6)
- NÃO criar novas variáveis de template — usar apenas as existentes
- NÃO modificar `icebreaker_generation` ou `icebreaker_premium_generation` (prompts de ice breaker standalone)

### Arquitetura de Prompts Atual

O sistema de prompts usa 3 níveis de fallback (ADR-001):
1. **Tenant-specific** (Supabase DB) — prioridade máxima
2. **Global prompts** (Supabase DB) — fallback
3. **Code defaults** (`defaults.ts`) — último recurso

Esta story modifica APENAS o nível 3 (code defaults). O template engine:
- Usa `{{#if var}}...{{else}}...{{/if}}` para condicionais (single-pass, NÃO suporta nested)
- Usa `{{variable}}` para interpolação simples
- **Preserva variáveis desconhecidas** (não remove `{{ice_breaker}}` se não está no mapa de variáveis)

### Contexto Sequencial (Já Funciona)

O hook `use-ai-full-campaign-generation.ts` (linhas 275-289) já implementa:
```typescript
// Get previous email for context (AC #3)
const previousEmail = i > 0 ? completedEmails[i - 1] : null;

// Add previous email context for follow-ups
if (previousEmail && emailMode === "follow-up") {
  baseVariables.previous_email_subject = previousEmail.subject;
  baseVariables.previous_email_body = previousEmail.body;
}
```

Isso significa que `{{previous_email_subject}}` e `{{previous_email_body}}` já estão disponíveis no prompt de follow-up. A story 9.5 apenas precisa **melhorar as instruções textuais** para usar esse contexto de forma mais inteligente.

### Dois Fluxos de Geração de Email

Existem dois fluxos independentes (definidos na Story 9.4):

1. **Full Campaign Generation** (AICampaignWizard → `useAIFullCampaignGeneration`):
   - Sem lead selecionado → `baseVariables` **NÃO** contém `icebreaker`
   - Prompt recebe `icebreaker` vazio → branch `{{else}}` → AI gera `{{ice_breaker}}` literal
   - Emails sequenciais com contexto do anterior

2. **Individual EmailBlock Generation** (EmailBlock → `handleGenerate`):
   - Pode ter lead → `icebreaker` populado com conteúdo real
   - Prompt recebe `icebreaker` com valor → branch `{{#if icebreaker}}` → usa como abertura

Ambos os fluxos serão beneficiados pela estrutura mais clara nos prompts.

### Variáveis Disponíveis no Prompt `email_body_generation`

| Variável | Fonte | Descrição |
|----------|-------|-----------|
| `company_context` | KB | Contexto da empresa remetente |
| `competitive_advantages` | KB | Diferenciais da empresa |
| `product_name` | Produto selecionado | Nome do produto (condicional) |
| `product_description` | Produto selecionado | Descrição do produto |
| `product_features` | Produto selecionado | Características |
| `product_differentials` | Produto selecionado | Diferenciais do produto |
| `product_target_audience` | Produto selecionado | Público-alvo |
| `products_services` | KB | Fallback quando sem produto |
| `lead_name` | Lead | Nome do lead |
| `lead_title` | Lead | Cargo |
| `lead_company` | Lead | Empresa |
| `lead_industry` | Lead | Setor |
| `lead_location` | Lead | Localização |
| `icp_summary` | KB | Perfil de cliente ideal |
| `pain_points` | KB | Dores comuns do ICP |
| `tone_description` | KB | Descrição do tom |
| `tone_style` | KB | Estilo (casual/formal/técnico) |
| `writing_guidelines` | KB | Diretrizes adicionais |
| `email_objective` | Campanha | Contexto/objetivo do email |
| `icebreaker` | Lead/vazio | Quebra-gelo real ou vazio |
| `successful_examples` | KB | Exemplos de emails bem-sucedidos |

### Variáveis Disponíveis no Prompt `follow_up_email_generation`

| Variável | Fonte | Descrição |
|----------|-------|-----------|
| `previous_email_subject` | Email anterior | Assunto do email anterior |
| `previous_email_body` | Email anterior | Corpo do email anterior |
| `company_context` | KB | Contexto da empresa |
| `product_name` | Produto | Nome do produto (condicional) |
| `lead_name` | Lead | Nome do lead |
| `lead_title` | Lead | Cargo |
| `lead_company` | Lead | Empresa |
| `lead_industry` | Lead | Setor |
| `tone_description` | KB | Descrição do tom |
| `tone_style` | KB | Estilo de tom |
| `email_objective` | Campanha | Contexto/objetivo deste follow-up |
| `successful_examples` | KB | Exemplos de follow-ups |

### Padrão de Teste a Seguir

Arquivo de referência: `__tests__/unit/lib/ai/prompts/email-body-icebreaker-variable.test.ts`

Padrão:
```typescript
import { describe, it, expect } from "vitest";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";

// interpolateTemplate helper para testar condicionais
function interpolateTemplate(template: string, variables: Record<string, string>): string {
  // ... (copiar do arquivo de referência)
}

describe("prompt structure", () => {
  const template = CODE_DEFAULT_PROMPTS.email_body_generation.template;

  it("should contain required section markers", () => {
    expect(template).toContain("[SAUDAÇÃO]");
    // etc.
  });
});
```

### Estrutura Alvo para `email_body_generation`

O prompt deve ser reorganizado mantendo TODO o conteúdo existente mas agrupando em blocos explícitos:

```
CONTEXTO (empresa, produto, lead, ICP, tom) → igual ao atual
ICEBREAKER (condicional) → igual ao atual
EXEMPLOS (condicional) → igual ao atual
REGRAS GERAIS → simplificadas (mover regras específicas para cada bloco)
ESTRUTURA OBRIGATÓRIA POR BLOCOS:
  [SAUDAÇÃO] → regras específicas de saudação per tom
  [QUEBRA-GELO] → regras de tamanho, transição
  [TRANSIÇÃO] → 1 frase conectora
  [CONTEÚDO PRODUTO] → foco 70% no produto
  [CTA] → claro, não agressivo
  [FECHAMENTO] → per tom
OUTPUT → apenas o corpo do email
```

### Estrutura Alvo para `follow_up_email_generation`

```
CONTEXTO (situação sem resposta, email anterior, empresa, lead, tom)
ESTRATÉGIAS → manter 4 estratégias existentes
REGRAS GERAIS → simplificadas
ESTRUTURA OBRIGATÓRIA POR BLOCOS:
  [SAUDAÇÃO] → curta, per tom
  [CONTEÚDO] → referenciar anterior + ângulo novo
  [CTA] → conversa rápida (10 min)
  [FECHAMENTO] → curto
ANTI-REPETIÇÃO → não repetir informações do email anterior
OUTPUT → apenas o corpo do email
```

### Project Structure Notes

- Prompts ficam em `src/lib/ai/prompts/defaults.ts` — único arquivo a modificar
- Testes ficam em `__tests__/unit/lib/ai/prompts/` — padrão existente
- NÃO criar pasta nova — usar a estrutura existente
- Arquivo de teste sugerido: `__tests__/unit/lib/ai/prompts/email-prompt-structure.test.ts`

### References

- [Source: _bmad-output/planning-artifacts/epic-9-ai-content-quality-personalization.md#Story 9.5]
- [Source: _bmad-output/implementation-artifacts/9-4-variavel-ice-breaker-na-geracao-de-email-de-campanha-ai.md]
- [Source: src/lib/ai/prompts/defaults.ts] — prompts atuais (email_body_generation linhas 129-254, follow_up_email_generation linhas 449-547)
- [Source: src/hooks/use-ai-full-campaign-generation.ts] — hook de geração sequencial (linhas 275-289 context passing)
- [Source: src/app/api/ai/generate/route.ts] — rota de geração AI (sem mudanças necessárias)
- [Source: __tests__/unit/lib/ai/prompts/email-body-icebreaker-variable.test.ts] — padrão de testes existente
- [Source: _bmad-output/planning-artifacts/architecture.md#AI Architecture] — arquitetura AI

### Previous Story Intelligence (Story 9.4)

**Learnings da Story 9.4:**
- A variável `{{ice_breaker}}` (com underscore) é diferente de `{{icebreaker}}` (sem underscore)
- `{{icebreaker}}` é interpolada pelo template engine; `{{ice_breaker}}` sobrevive e aparece no output
- Template engine é single-pass — NÃO suporta `{{#if}}` aninhados (bug fixado na Story 9.3)
- Use condicionais sequenciais em vez de aninhadas
- Módulo `sanitize-ai-output.ts` remove prefixos "Assunto:" e "Corpo:" do output da AI

**Do's:**
- Testar que `{{ice_breaker}}` literal sobrevive interpolação
- Manter todas as condicionais existentes intactas
- Usar `flex flex-col gap-*` (não `space-y-*`) em qualquer componente UI (não aplicável aqui)

**Don'ts:**
- NÃO aninhar `{{#if}}` dentro de `{{#if}}`
- NÃO adicionar variáveis novas ao template sem adicioná-las no hook
- NÃO modificar lógica de `use-ai-full-campaign-generation.ts`

### Git Intelligence

Últimos commits relevantes:
```
1d83871 feat(story-9.4): Ice Breaker Variable in AI Campaign Generation
76a9b3f feat(story-9.3): Refactored Icebreaker Prompts for Quality and Category Support
41070cf feat(story-9.2): Icebreaker Reference Examples in Knowledge Base
ac3bef2 feat(story-9.1): Icebreaker Categories
```

Padrão de commit: `feat(story-9.5): Clear Email Structure in Campaign Generation Prompts`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Story 9.4 regression test expected `"variável {{ice_breaker}} literal"` exact string — adjusted [QUEBRA-GELO] block text to preserve backward compatibility

### Completion Notes List

- **Task 1 (AC #1):** Refatorado `email_body_generation` — substituído REGRAS (11 itens genéricos) + FORMATO OBRIGATÓRIO por REGRAS GERAIS (4 itens) + ESTRUTURA OBRIGATÓRIA com 6 blocos explícitos: [SAUDAÇÃO], [QUEBRA-GELO], [TRANSIÇÃO], [CONTEÚDO PRODUTO], [CTA], [FECHAMENTO]. Cada bloco tem regras independentes específicas do bloco. Todas as condicionais preservadas intactas.
- **Task 2 (AC #2, #3):** Refatorado `follow_up_email_generation` — adicionada seção ÂNGULOS SUGERIDOS POR POSIÇÃO (valor, prova social, escassez, despedida), seção ANTI-REPETIÇÃO explícita com regra "NÃO inclua Ice Breaker", simplificadas REGRAS GERAIS (5 itens), adicionada ESTRUTURA OBRIGATÓRIA com 4 blocos: [SAUDAÇÃO], [CONTEÚDO], [CTA], [FECHAMENTO]. 4 estratégias existentes preservadas.
- **Task 3 (AC #4):** Criado `email-prompt-structure.test.ts` com 28 testes: marcadores de bloco (7), ordem dos blocos (2), regras per-block (1), follow-up structure (7), contexto sequencial (4), regressão conditionals (7). Testes da Story 9.4 (4 testes) continuam passando.
- **Task 4:** 178 files, 3135 testes passando. Zero regressões. ESLint limpo.

### Code Review Record

**Reviewer:** Amelia (Dev Agent) — Code Review Adversarial
**Date:** 2026-02-06
**Issues Found:** 0 Critical, 4 Medium, 3 Low
**Issues Fixed:** 4 (all MEDIUM)

**Fixes Applied:**
- **M1:** Adicionados exemplos TÉCNICO em `[SAUDAÇÃO]` e `[FECHAMENTO]` do follow-up prompt (consistência com email_body_generation)
- **M2:** Teste "per-block rules" fortalecido — agora valida presença de bullet-point rules (`^- .+`) em vez de apenas `length > 20`
- **M3:** Teste "suggested angles" agora verifica TODOS os 4 ângulos individualmente (valor, prova social, escassez, despedida)
- **M4:** Teste "per-block rules" expandido para cobrir todos os 6 blocos ([SAUDAÇÃO], [QUEBRA-GELO], [TRANSIÇÃO], [CONTEÚDO PRODUTO], [CTA], [FECHAMENTO])

**Low Issues (not fixed — no impact on functionality):**
- L1: Story 9.4 test description references renamed section "FORMATO OBRIGATÓRIO"
- L2: `interpolateTemplate` helper duplicated across test files
- L3: Order test for email_body_generation uses global indexOf (fragile but functional)

### Change Log

- 2026-02-06: Story 9.5 implementada — prompts email_body_generation e follow_up_email_generation reestruturados com blocos explícitos
- 2026-02-06: Code Review — 4 MEDIUM issues fixed (TÉCNICO tone in follow-up, test quality improvements)

### File List

- `src/lib/ai/prompts/defaults.ts` — prompts refatorados (email_body_generation + follow_up_email_generation)
- `__tests__/unit/lib/ai/prompts/email-prompt-structure.test.ts` — 28 testes novos de estrutura e regressão
