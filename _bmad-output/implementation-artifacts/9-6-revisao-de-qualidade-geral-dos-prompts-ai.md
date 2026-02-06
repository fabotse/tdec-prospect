# Story 9.6: Revisão de Qualidade Geral dos Prompts AI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system,
I want all AI prompts reviewed for consistency, clarity, and quality,
so that the generation pattern is uniform across the entire system — unified variable naming, consistent tone guides, and standardized section structure.

## Acceptance Criteria

1. **All 9 prompts follow consistent section structure:**
   - The 6 lead-communication prompts (email_subject_generation, email_body_generation, icebreaker_generation, icebreaker_premium_generation, follow_up_email_generation, follow_up_subject_generation) follow a canonical section order: CONTEXTO → PRODUTO → PERFIL DO LEAD → TOM DE VOZ + GUIA DE TOM → [seções específicas] → EXEMPLOS → REGRAS → FORMATO/OUTPUT
   - The 3 utility prompts (search_translation, tone_application, campaign_structure_generation) are reviewed for quality but keep their specialized structures
   - Section headings use consistent formatting (MAIÚSCULAS com dois-pontos)

2. **Ice Breaker and Email prompts work well in sequence (IB → Email):**
   - O Ice Breaker gerado é usado naturalmente no email (via `{{icebreaker}}` variable)
   - O email NÃO repete ou expande excessivamente o tema do IB
   - A transição IB → conteúdo é fluida (bloco [TRANSIÇÃO] já existe na Story 9.5)
   - Follow-ups NÃO contêm Ice Breaker (regra já existe na Story 9.5)

3. **Tone guides are identical across all 6 lead-communication prompts:**
   - Todos os 6 prompts têm seção GUIA DE TOM com [CASUAL], [FORMAL], [TÉCNICO]
   - Os guias de tom usam vocabulário e exemplos consistentes entre si
   - `icebreaker_premium_generation` (atualmente SEM guia de tom) recebe um
   - `follow_up_subject_generation` (atualmente SEM guia de tom) recebe um

4. **Variable naming unified to snake_case:**
   - `icebreaker_premium_generation` migrado de camelCase para snake_case
   - `buildIcebreakerVariables()` em `enrich-icebreaker/route.ts` atualizado para snake_case
   - Mapeamento completo: `firstName`+`lastName` → `lead_name`, `title` → `lead_title`, `companyName` → `lead_company`, `industry` → `lead_industry`, `linkedinPosts` → `linkedin_posts`, `companyContext` → `company_context`, `toneDescription` → `tone_description`, `toneStyle` → `tone_style`, `productName` → `product_name`, `productDescription` → `product_description`
   - Todos os pontos de chamada atualizados
   - Comentário "intentional camelCase" removido do `defaults.ts`

5. **Tests validate consistency across all prompts:**
   - Testes verificam que NENHUM prompt de comunicação usa camelCase em variáveis
   - Testes verificam presença de GUIA DE TOM em todos os 6 prompts
   - Testes verificam presença de [CASUAL], [FORMAL], [TÉCNICO] em cada guia
   - Testes de regressão garantem que Stories 9.1-9.5 continuam funcionando
   - All existing prompt tests pass without modification (exceto ajustes camelCase → snake_case no premium)

## Tasks / Subtasks

- [x] Task 1: Unificar nomenclatura de variáveis — camelCase → snake_case (AC: #4)
  - [x] 1.1: Refatorar template `icebreaker_premium_generation` em `defaults.ts` — trocar TODAS as variáveis camelCase por snake_case equivalentes (ver mapeamento no AC #4)
  - [x] 1.2: Mudar `- Nome: {{firstName}} {{lastName}}` para `- Nome: {{lead_name}}` (variável combinada, como nos outros prompts)
  - [x] 1.3: Atualizar `buildIcebreakerVariables()` em `enrich-icebreaker/route.ts` — output snake_case, combinando `lead_name: \`${lead.first_name} ${lead.last_name || ""}\`.trim()`
  - [x] 1.4: Remover comentário "NOTE: This prompt uses camelCase..." de `defaults.ts` (linhas 274-279)
  - [x] 1.5: Atualizar testes existentes em `prompt-manager.test.ts` que referenciam variáveis camelCase do premium

- [x] Task 2: Adicionar Guia de Tom nos prompts que não têm (AC: #3)
  - [x] 2.1: Adicionar GUIA DE TOM ao `icebreaker_premium_generation` — [CASUAL], [FORMAL], [TÉCNICO] com vocabulário consistente com os outros prompts
  - [x] 2.2: Adicionar GUIA DE TOM ao `follow_up_subject_generation` — [CASUAL], [FORMAL], [TÉCNICO] adaptado para assuntos de email
  - [x] 2.3: Harmonizar os guias de tom existentes — comparar vocabulário e exemplos entre email_subject, email_body, icebreaker_generation, follow_up_email e garantir que [CASUAL], [FORMAL], [TÉCNICO] usam os MESMOS termos-chave

- [x] Task 3: Padronizar estrutura de seções nos 6 prompts de comunicação (AC: #1)
  - [x] 3.1: Definir e documentar a estrutura canônica (ver Dev Notes abaixo)
  - [x] 3.2: Ajustar `email_subject_generation` para seguir a ordem canônica (mover seções se necessário) — já segue ordem canônica ✓
  - [x] 3.3: Ajustar `icebreaker_premium_generation` para seguir a ordem canônica (reorganizar seções existentes) — EXEMPLOS movido antes de REGRAS
  - [x] 3.4: Ajustar `follow_up_subject_generation` para seguir a ordem canônica — ESTRATÉGIAS movido antes de EXEMPLOS
  - [x] 3.5: Verificar `email_body_generation`, `icebreaker_generation`, `follow_up_email_generation` (já refatorados em 9.3/9.5 — apenas ajustes menores se necessário) — já canônicos ✓

- [x] Task 4: Revisão de qualidade dos 3 prompts utilitários (AC: #1)
  - [x] 4.1: Revisar `tone_application` — PRESETS consistentes com guias de tom ✓
  - [x] 4.2: Revisar `campaign_structure_generation` — bem estruturado, regras claras ✓
  - [x] 4.3: `search_translation` — importado de `filter-extraction.ts`, estável desde Epic 3 ✓

- [x] Task 5: Criar testes de consistência cross-prompt (AC: #5)
  - [x] 5.1: Novo arquivo `__tests__/unit/lib/ai/prompts/prompt-quality-review.test.ts` — 53 testes
  - [x] 5.2: Teste: nenhum prompt de comunicação usa variáveis camelCase (regex `{{[a-z]+[A-Z]}}`)
  - [x] 5.3: Teste: todos os 6 prompts têm `[CASUAL]`, `[FORMAL]`, `[TÉCNICO]` no template
  - [x] 5.4: Teste: vocabulário de tom consistente — verificar termos-chave presentes em cada guia
  - [x] 5.5: Teste: fluxo IB → Email — variáveis de output do IB são compatíveis com input do Email
  - [x] 5.6: Testes de regressão — rodar testes existentes de Stories 9.1-9.5

- [x] Task 6: Validação final
  - [x] 6.1: Rodar `npx vitest run` — 179 files, 3188 tests, 0 failures ✓
  - [x] 6.2: Verificar que testes de Stories 9.1-9.5 passam sem regressão ✓
  - [x] 6.3: ESLint sem violações (`no-console` rule) ✓

## Dev Notes

### Escopo e Limites

**ESTA STORY É DE "POLIMENTO"** — modifica primariamente prompts (texto) e a função `buildIcebreakerVariables()`. Não há mudanças de UI, hooks de frontend, ou rotas novas.

**ESCOPO INCLUÍDO:**
- Refatorar variáveis no template `icebreaker_premium_generation` e no builder correspondente
- Adicionar guias de tom em 2 prompts
- Padronizar ordem de seções nos 6 prompts de comunicação
- Criar testes de consistência cross-prompt

**ESCOPO EXCLUÍDO:**
- NÃO modificar `search_translation` (prompt importado de `filter-extraction.ts`, propósito diferente)
- NÃO modificar lógica do template engine (`interpolateTemplate` em `prompt-manager.ts`)
- NÃO criar novas variáveis de template — usar apenas as existentes
- NÃO modificar componentes UI (EmailBlock, PreviewEmailStep, IcebreakerCategorySelect, etc.)
- NÃO modificar hooks de frontend (`use-ai-full-campaign-generation`, `use-icebreaker-enrichment`)
- NÃO modificar rotas API (exceto `buildIcebreakerVariables()` na rota de enrich-icebreaker)
- NÃO alterar `ICEBREAKER_CATEGORY_INSTRUCTIONS` em `ai-prompt.ts` (já refatorado na 9.3)
- NÃO modificar seed files de banco de dados (se existirem)
- NÃO alterar tabela `ai_prompts` no Supabase

### Análise dos 9 Prompts — Estado Atual

| # | Prompt Key | Variáveis | Guia de Tom | Estrutura | Última Refatoração |
|---|---|---|---|---|---|
| 1 | `search_translation` | N/A (filtros Apollo) | N/A | Própria | Epic 3 |
| 2 | `email_subject_generation` | snake_case ✓ | ✓ [C/F/T] | Quase canônica | Epic 6.9 |
| 3 | `email_body_generation` | snake_case ✓ | ✓ [C/F/T] detalhado | Canônica ✓ | Story 9.5 |
| 4 | `icebreaker_premium_generation` | **camelCase ✗** | **AUSENTE ✗** | Fora de ordem | Epic 6.5.3 |
| 5 | `icebreaker_generation` | snake_case ✓ | ✓ [C/F/T] | Quase canônica | Story 9.3 |
| 6 | `follow_up_email_generation` | snake_case ✓ | ✓ (per-block) | Canônica ✓ | Story 9.5 |
| 7 | `follow_up_subject_generation` | snake_case ✓ | **AUSENTE ✗** | Fora de ordem | Epic 6.11 |
| 8 | `tone_application` | snake_case ✓ | PRESETS (OK) | Própria | Epic 6.9 |
| 9 | `campaign_structure_generation` | snake_case ✓ | N/A (JSON) | Própria | Epic 6.12 |

**Problemas identificados:**
1. `icebreaker_premium_generation` usa **camelCase** — ÚNICO prompt com esta inconsistência
2. `icebreaker_premium_generation` e `follow_up_subject_generation` não têm **Guia de Tom**
3. Seções em ordem diferente entre prompts (ex: EXEMPLOS antes ou depois de REGRAS)

### Mapeamento Completo de Variáveis — camelCase → snake_case

Para `icebreaker_premium_generation` e `buildIcebreakerVariables()`:

| Atual (camelCase) | Novo (snake_case) | Notas |
|---|---|---|
| `{{firstName}}` + `{{lastName}}` | `{{lead_name}}` | Combinar em uma variável — padrão dos outros prompts |
| `{{title}}` | `{{lead_title}}` | Prefixo `lead_` para consistência |
| `{{companyName}}` | `{{lead_company}}` | Prefixo `lead_` para consistência |
| `{{industry}}` | `{{lead_industry}}` | Prefixo `lead_` para consistência |
| `{{linkedinPosts}}` | `{{linkedin_posts}}` | Variável única deste prompt |
| `{{companyContext}}` | `{{company_context}}` | Idêntica ao standard icebreaker |
| `{{toneDescription}}` | `{{tone_description}}` | Idêntica ao standard icebreaker |
| `{{toneStyle}}` | `{{tone_style}}` | Idêntica ao standard icebreaker |
| `{{productName}}` | `{{product_name}}` | Idêntica ao standard icebreaker |
| `{{productDescription}}` | `{{product_description}}` | Idêntica ao standard icebreaker |

**Mudança no builder (`enrich-icebreaker/route.ts` linhas 293-318):**
```typescript
// ANTES (camelCase):
function buildIcebreakerVariables(lead, posts, kbContext) {
  return {
    firstName: lead.first_name,
    lastName: lead.last_name || "",
    companyName: lead.company_name || "",
    // ...
  };
}

// DEPOIS (snake_case):
function buildIcebreakerVariables(lead, posts, kbContext) {
  return {
    lead_name: `${lead.first_name} ${lead.last_name || ""}`.trim(),
    lead_title: lead.title || "",
    lead_company: lead.company_name || "",
    lead_industry: lead.industry || "",
    linkedin_posts: formatLinkedInPostsForPrompt(posts),
    company_context: compileCompanyContext(kbContext.company),
    tone_description: compileToneDescription(kbContext.tone),
    tone_style: kbContext.tone?.preset || DEFAULT_TONE_STYLE,
    product_name: "",
    product_description: "",
  };
}
```

### Estrutura Canônica para Prompts de Comunicação

Os 6 prompts de comunicação devem seguir esta ordem de seções:

```
1. ROLE STATEMENT: "Você é um especialista em..."
2. OBJETIVO: O que o prompt deve gerar
3. CONTEXTO DA EMPRESA (REMETENTE): {{company_context}}, {{competitive_advantages}}
4. PRODUTO (condicional): {{#if product_name}}...{{/if}}
5. PERFIL DO LEAD: {{lead_name}}, {{lead_title}}, {{lead_company}}, {{lead_industry}}
6. TOM DE VOZ: {{tone_description}}, {{tone_style}}, {{writing_guidelines}}
7. GUIA DE TOM: [CASUAL], [FORMAL], [TÉCNICO]
8. [SEÇÕES ESPECÍFICAS DO PROMPT]:
   - IB: FOCO DA CATEGORIA, POSTS DO LINKEDIN
   - Email: OBJETIVO DO EMAIL, QUEBRA-GELO
   - Follow-up: CONTEXTO CRÍTICO, EMAIL ANTERIOR, ESTRATÉGIAS
9. EXEMPLOS (condicional): {{#if successful_examples}}...{{/if}}
10. REGRAS
11. FORMATO/ESTRUTURA DE OUTPUT
12. Instrução final: "Responda APENAS com..."
```

**NÃO aplicar rigidamente** — cada prompt tem necessidades únicas. O objetivo é APROXIMAR da ordem canônica, não forçar conformidade 100%. Prompts já refatorados (9.3, 9.5) podem ter ajustes mínimos apenas.

### Guia de Tom — Versão de Referência

O guia mais completo está em `email_body_generation` (Story 9.5). Os outros prompts devem usar vocabulário consistente. Versão compacta para prompts menores:

```
GUIA DE TOM — SIGA O ESTILO "{{tone_style}}":

[CASUAL]
- Linguagem amigável e próxima
- Saudação: "Olá", "Oi" (nunca "Prezado")
- Vocabulário: "super", "bem legal", "dá uma olhada"
- Fechamento: "Abraço", "Até mais", "Valeu"

[FORMAL]
- Linguagem corporativa e respeitosa
- Saudação: "Prezado(a)", "Caro(a)"
- Evite gírias e expressões coloquiais
- Fechamento: "Atenciosamente", "Cordialmente"

[TÉCNICO]
- Terminologia técnica do setor {{lead_industry}}
- Preciso e objetivo, sem simplificações
- Mencione métricas e KPIs quando relevante
- Fechamento: neutro e objetivo
```

Para `follow_up_subject_generation` e `icebreaker_premium_generation`, adaptar os exemplos ao contexto (assuntos curtos vs quebra-gelos).

### Arquitetura de Prompts (Referência)

O sistema de prompts usa 3 níveis de fallback (ADR-001):
1. **Tenant-specific** (Supabase DB) — prioridade máxima
2. **Global prompts** (Supabase DB) — fallback
3. **Code defaults** (`defaults.ts`) — último recurso

Esta story modifica APENAS o nível 3 (code defaults) e o builder de variáveis.

**Template engine** (`prompt-manager.ts`):
- Usa `{{#if var}}...{{else}}...{{/if}}` para condicionais (single-pass, NÃO suporta nested)
- Usa `{{variable}}` para interpolação simples
- **Preserva variáveis desconhecidas** (não remove `{{ice_breaker}}` se não está no mapa)

**CUIDADO com DB prompts**: Se existirem prompts tenant-specific ou global na tabela `ai_prompts` que usam variáveis camelCase do `icebreaker_premium_generation`, eles QUEBRARÃO após esta mudança. Verificar se há registros na tabela antes de fazer deploy. Se houver, criar migration de atualização.

### Dois Fluxos de Ice Breaker

1. **Standard** (Lead/Empresa/Cargo): `icebreaker_generation` + `buildStandardIcebreakerVariables()` (snake_case ✓)
2. **Premium** (Post/LinkedIn): `icebreaker_premium_generation` + `buildIcebreakerVariables()` (camelCase → **snake_case**)

Ambos são chamados por `processLeadIcebreaker()` em `enrich-icebreaker/route.ts` com base na categoria selecionada.

### Fluxo IB → Email (AC #2)

O fluxo funciona assim:
1. IB é gerado (standalone) e salvo na coluna `icebreaker` do lead
2. Na geração de email, o IB é passado via variável `{{icebreaker}}` (sem underscore)
3. O prompt `email_body_generation` tem bloco condicional: `{{#if icebreaker}}` → usa como abertura, `{{else}}` → usa `{{ice_breaker}}` literal
4. Follow-ups NÃO recebem icebreaker (regra explícita na Story 9.5)

A Task 5.5 deve verificar que os nomes de variáveis de output do IB são compatíveis com o input do email.

### Padrão de Testes Existentes

Arquivos de teste de prompts já existentes (criar novo na mesma pasta):
- `__tests__/unit/lib/ai/prompts/icebreaker-prompt-refactor.test.ts` (Story 9.3 — 19 tests)
- `__tests__/unit/lib/ai/prompts/email-body-icebreaker-variable.test.ts` (Story 9.4 — 19 tests)
- `__tests__/unit/lib/ai/prompts/email-prompt-structure.test.ts` (Story 9.5 — 28 tests)

Padrão:
```typescript
import { describe, it, expect } from "vitest";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";

describe("cross-prompt quality review", () => {
  const COMMUNICATION_PROMPTS = [
    "email_subject_generation",
    "email_body_generation",
    "icebreaker_generation",
    "icebreaker_premium_generation",
    "follow_up_email_generation",
    "follow_up_subject_generation",
  ] as const;

  it.each(COMMUNICATION_PROMPTS)("%s should have tone guide", (key) => {
    const template = CODE_DEFAULT_PROMPTS[key].template;
    expect(template).toContain("[CASUAL]");
    expect(template).toContain("[FORMAL]");
    expect(template).toContain("[TÉCNICO]");
  });
});
```

### Project Structure Notes

- Prompts: `src/lib/ai/prompts/defaults.ts` — arquivo principal (modificar)
- Builder: `src/app/api/leads/enrich-icebreaker/route.ts` — função `buildIcebreakerVariables()` (modificar)
- Types: `src/types/ai-prompt.ts` — sem mudanças necessárias (PromptKey e IcebreakerCategory não mudam)
- Testes: `__tests__/unit/lib/ai/prompts/` — criar novo arquivo e ajustar existentes
- NÃO criar pasta nova — usar estrutura existente

### References

- [Source: _bmad-output/planning-artifacts/epic-9-ai-content-quality-personalization.md#Story 9.6]
- [Source: src/lib/ai/prompts/defaults.ts] — todos os 9 prompts (795 linhas)
- [Source: src/app/api/leads/enrich-icebreaker/route.ts#L293-318] — `buildIcebreakerVariables()` camelCase
- [Source: src/app/api/leads/enrich-icebreaker/route.ts#L329-354] — `buildStandardIcebreakerVariables()` snake_case (referência)
- [Source: src/lib/ai/prompt-manager.ts] — template engine (interpolateTemplate)
- [Source: src/types/ai-prompt.ts] — PromptKey, IcebreakerCategory, ICEBREAKER_CATEGORY_INSTRUCTIONS
- [Source: _bmad-output/planning-artifacts/architecture.md#AI Architecture] — ADR-001 prompt management
- [Source: _bmad-output/implementation-artifacts/9-5-estrutura-clara-nos-prompts-de-geracao-de-email-de-campanha.md] — story anterior

### Previous Story Intelligence (Stories 9.1-9.5)

**Learnings consolidados:**
- Template engine single-pass: NÃO suporta `{{#if}}` aninhados — usar blocos sequenciais (Story 9.3)
- `{{ice_breaker}}` (com underscore) = variável de personalização visível ao usuário; `{{icebreaker}}` (sem underscore) = variável de template interpolada (Story 9.4)
- Template engine preserva variáveis desconhecidas (não remove `{{ice_breaker}}`)
- `successful_examples` é sempre vazio na geração de IB (email examples não se aplicam — dead code mas inofensivo)
- Exemplos de IB são injetados diretamente na rota de enrich-icebreaker, NÃO via `knowledge-base-context.ts`
- Todos os prompts de email/IB já foram refatorados nas Stories 9.3 e 9.5 — a Story 9.6 faz polimento final
- 4 stories confirmaram: "Don't unify camelCase/snake_case (Story 9.6)" — esta É a story para isso

**Do's:**
- Testar que `{{ice_breaker}}` literal sobrevive interpolação (regressão Story 9.4)
- Manter todas as condicionais existentes intactas
- Usar `it.each()` para testes repetitivos cross-prompt (DRY)
- Verificar regressão em TODOS os 66+ testes de prompt existentes

**Don'ts:**
- NÃO aninhar `{{#if}}` dentro de `{{#if}}` (limitação do engine)
- NÃO adicionar variáveis novas ao template
- NÃO modificar `buildStandardIcebreakerVariables()` (já está em snake_case)
- NÃO modificar lógica de `use-ai-full-campaign-generation.ts`
- NÃO modificar componentes UI
- NÃO modificar `ICEBREAKER_CATEGORY_INSTRUCTIONS` (já refatorado na 9.3)

### Git Intelligence

Últimos commits relevantes:
```
909689f feat(story-9.5): Clear Email Structure in Campaign Generation Prompts with code review fixes
1d83871 feat(story-9.4): Ice Breaker Variable in AI Campaign Generation with code review fixes
76a9b3f feat(story-9.3): Refactored Icebreaker Prompts for Quality and Category Support with code review fixes
41070cf feat(story-9.2): Icebreaker Reference Examples in Knowledge Base with code review fixes
ac3bef2 feat(story-9.1): Icebreaker Categories with code review fixes
```

Padrão de commit: `feat(story-9.6): AI Prompt Quality Review — unified variables and consistent tone guides`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- First run of prompt-quality-review.test.ts: 7 failures — `follow_up_email_generation` lacked [CASUAL]/[FORMAL]/[TÉCNICO] bracket markers (used per-block format), vocabulary test term "respeitosa" too specific for gender variations
- Full suite run: 2 failures in `leads-enrich-icebreaker.test.ts` — tests still asserting camelCase variable names (firstName, companyName) after snake_case migration

### Completion Notes List

- Task 1.5: Story referenced `icebreaker-prompt-refactor.test.ts` but the camelCase variables were actually in `prompt-manager.test.ts` — updated there instead
- Task 2.3: Added GUIA DE TOM to `follow_up_email_generation` as well (had per-block tone format but lacked [CASUAL]/[FORMAL]/[TÉCNICO] bracket markers needed for consistency)
- Task 3.2: `email_subject_generation` already followed canonical order — no changes needed
- Task 3.5: `email_body_generation`, `icebreaker_generation`, `follow_up_email_generation` already canonical from Stories 9.3/9.5 — no changes needed
- Task 5.4: Vocabulary test uses prefix matching (e.g., "respeitos" matches "respeitosa"/"respeitosos") for Portuguese gender-variant adjectives
- Final validation: 179 test files, 3188 tests, 0 failures, ESLint clean

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-02-06
**Outcome:** Approved with fixes applied

**Findings (2 MEDIUM, 4 LOW):**

- [x] [AI-Review][MEDIUM] Stale comment "(camelCase)" in route.ts:523 — FIXED: updated to "(snake_case)"
- [x] [AI-Review][MEDIUM] Mock content `{{firstName}}` in leads-enrich-icebreaker.test.ts:201 — FIXED: updated to `{{lead_name}}`
- [ ] [AI-Review][LOW] 3/6 communication prompts lack `{{writing_guidelines}}` in TOM DE VOZ — intentional per scope ("no new template variables")
- [ ] [AI-Review][LOW] Vocabulary tests in prompt-quality-review.test.ts assume [CASUAL]→[FORMAL]→[TÉCNICO] order — fragile if reordered
- [ ] [AI-Review][LOW] `icebreaker_premium_generation` missing `competitive_advantages` — pre-existing since Story 6.5.3, out of scope
- [ ] [AI-Review][LOW] 2 skipped tests undocumented in story validation (3188 passed, 2 skipped)

**All ACs verified against implementation. All tasks [x] confirmed with code evidence. Git changes match File List.**

### Change Log

1. **defaults.ts** — Migrated `icebreaker_premium_generation` variables from camelCase to snake_case (10 variables). Added GUIA DE TOM to `icebreaker_premium_generation`, `follow_up_subject_generation`, and `follow_up_email_generation`. Reordered sections in `icebreaker_premium_generation` (EXEMPLOS before REGRAS) and `follow_up_subject_generation` (ESTRATÉGIAS before EXEMPLOS). Removed legacy camelCase comment.
2. **enrich-icebreaker/route.ts** — Refactored `buildIcebreakerVariables()` to output snake_case keys, combining `firstName`+`lastName` into `lead_name`.
3. **prompt-manager.test.ts** — Updated mock template and all test assertions from camelCase to snake_case for premium prompt.
4. **leads-enrich-icebreaker.test.ts** — Updated 2 test assertions from camelCase (firstName, companyName) to snake_case (lead_name, lead_company).
5. **prompt-quality-review.test.ts** — NEW: 53 cross-prompt consistency tests covering variable naming, tone guides, vocabulary, IB→Email flow, and regression.
6. **enrich-icebreaker/route.ts** — [Code Review Fix] Updated stale comment "(camelCase)" → "(snake_case)" at line 523.
7. **leads-enrich-icebreaker.test.ts** — [Code Review Fix] Updated stale mock content `{{firstName}}` → `{{lead_name}}` at line 201.

### File List

| File | Action | Description |
|---|---|---|
| `src/lib/ai/prompts/defaults.ts` | Modified | snake_case variables, GUIA DE TOM added to 3 prompts, section reordering, comment cleanup |
| `src/app/api/leads/enrich-icebreaker/route.ts` | Modified | `buildIcebreakerVariables()` migrated to snake_case output |
| `__tests__/unit/lib/ai/prompt-manager.test.ts` | Modified | Mock template + assertions updated camelCase → snake_case |
| `__tests__/unit/api/leads-enrich-icebreaker.test.ts` | Modified | 2 assertions updated camelCase → snake_case |
| `__tests__/unit/lib/ai/prompts/prompt-quality-review.test.ts` | Created | 53 cross-prompt consistency tests |
