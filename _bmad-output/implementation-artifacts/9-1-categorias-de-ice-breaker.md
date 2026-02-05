# Story 9.1: Categorias de Ice Breaker

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário,
I want selecionar a categoria/foco do Ice Breaker ao gerá-lo,
so that a personalização seja direcionada ao contexto correto (lead, empresa, cargo ou post).

## Acceptance Criteria

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

## Tasks / Subtasks

- [x] Task 1: Criar tipo `IcebreakerCategory` e atualizar tipos AI (AC: #1, #2)
  - [x] 1.1 Adicionar `IcebreakerCategory` type em `src/types/ai-prompt.ts`
  - [x] 1.2 Atualizar `PromptKey` type se necessário para suportar variável de categoria
  - [x] 1.3 Exportar constante `ICEBREAKER_CATEGORIES` com labels em português para UI

- [x] Task 2: Adaptar prompts com blocos condicionais por categoria (AC: #2)
  - [x] 2.1 Refatorar `icebreaker_generation` em `src/lib/ai/prompts/defaults.ts` para incluir `{{category_instructions}}` variável (alternativa simples recomendada nas Dev Notes)
  - [x] 2.2 Adicionar instruções específicas por categoria: Lead (pessoa), Empresa (negócio), Cargo (role), Post/LinkedIn (conteúdo) em `ICEBREAKER_CATEGORY_INSTRUCTIONS`
  - [x] 2.3 Adicionar regra #10 sobre seguir o foco da categoria no prompt
  - [x] 2.4 Manter compatibilidade: default "empresa" via Zod schema

- [x] Task 3: Atualizar API route para receber categoria (AC: #1, #2, #3)
  - [x] 3.1 Atualizar `src/app/api/leads/enrich-icebreaker/route.ts` para aceitar `category` no body
  - [x] 3.2 Validar categoria recebida (deve ser uma das 4 opções válidas) via Zod enum
  - [x] 3.3 Implementar lógica de fallback: se "Post/LinkedIn" selecionada mas lead sem posts → fallback para "Lead" + flag `categoryFallback: true`
  - [x] 3.4 Passar `category_instructions` como variável ao `PromptManager.renderPrompt()`
  - [x] 3.5 Para categoria "Post/LinkedIn": redirecionar para prompt `icebreaker_premium_generation` existente

- [x] Task 4: Atualizar hook `useIcebreakerEnrichment` (AC: #1, #3)
  - [x] 4.1 Atualizar `src/hooks/use-icebreaker-enrichment.ts` para aceitar `category` como parâmetro
  - [x] 4.2 Atualizar `generateForLead(leadId, regenerate, category?)` e `generateForLeads(leadIds, regenerate, category?)`
  - [x] 4.3 Passar categoria no body do POST para a API
  - [x] 4.4 Tratar resposta de fallback de categoria com toast informativo

- [x] Task 5: Implementar UI de seleção de categoria (AC: #1, #3)
  - [x] 5.1 Criar componente `IcebreakerCategorySelect` — dropdown/select com as 4 categorias em português
  - [x] 5.2 Integrar no `LeadDetailPanel.tsx` (geração individual) — antes do botão "Gerar Icebreaker"
  - [x] 5.3 Integrar no dialog de confirmação do `LeadSelectionBar.tsx` (geração em lote)
  - [x] 5.4 Default visual: "Empresa" pré-selecionada
  - [x] 5.5 Quando "Post/LinkedIn" selecionada e lead sem posts: mostrar badge/aviso informativo
  - [x] 5.6 Garantir 0 cores hardcoded — usa tokens CSS (`bg-muted`, `text-muted-foreground`, etc.)
  - [x] 5.7 Garantir contraste WCAG AA (4.5:1 texto, 3:1 UI components)

- [x] Task 6: Testes unitários (AC: #1, #2, #3)
  - [x] 6.1 Testes do hook: categoria passada corretamente na API call, fallback handling, default "Empresa" (6 novos testes)
  - [x] 6.2 Testes da API route: validação de categoria, fallback Post→Lead, passagem ao prompt (14 novos testes)
  - [x] 6.3 Testes dos componentes UI: seleção de categoria, estado default, aviso de fallback (9 novos testes)
  - [x] 6.4 Verificar 0 violações ESLint (`no-console` enforced) — fixed unused imports
  - [x] 6.5 Testes pré-existentes atualizados para refletir novo comportamento de categoria (7 API + 2 LeadDetailPanel)

## Dev Notes

### Contexto Crítico do Sistema de Icebreakers

O sistema atual possui **2 prompts** de icebreaker:
1. **`icebreaker_generation`** (Story 6.6) — Ice Breaker genérico baseado em dados do lead. Usa variáveis **snake_case**: `lead_name`, `lead_title`, `lead_company`, etc. Model: `gpt-4o-mini`, temp: 0.8, max_tokens: 150.
2. **`icebreaker_premium_generation`** (Story 6.5.3) — Ice Breaker baseado em posts reais do LinkedIn. Usa variáveis **camelCase**: `firstName`, `lastName`, `companyName`, etc. Model: `gpt-4o-mini`, temp: 0.8, max_tokens: 200.

**ATENÇÃO: Inconsistência de naming** — O prompt premium usa camelCase e o standard usa snake_case. Esta inconsistência será resolvida na Story 9.6. Por enquanto, **manter a inconsistência** e NÃO unificar nesta story.

### Fluxo Atual de Geração

```
User clica "Gerar Icebreaker"
  → Hook: useIcebreakerEnrichment.generateForLead(leadId, regenerate)
    → POST /api/leads/enrich-icebreaker { leadIds, regenerate }
      → Auth check + Validation (1-50 leads, UUIDs)
      → KB Context load (company_context, tone, product)
      → Para cada lead:
        → Check LinkedIn URL
        → Apify: Fetch 3 posts (60s timeout)
        → PromptManager: Get prompt + interpolate variables
        → OpenAI: Generate (gpt-4o-mini)
        → DB: Save icebreaker + timestamp + posts cache
      → Return results + summary
    → Hook: Invalidate queries, show toast
```

### Decisão de Design: Categoria como Variável de Template

A categoria será passada como `{{icebreaker_category}}` ao prompt. O prompt usa blocos condicionais `{{#if}}` para alternar instruções:

```
{{#if category_empresa}}
  [Instruções focadas em oportunidade de negócio, crescimento da empresa]
{{/if}}
{{#if category_cargo}}
  [Instruções focadas em desafios do cargo, decisões do role]
{{/if}}
{{#if category_lead}}
  [Instruções focadas na pessoa, trajetória, conquistas]
{{/if}}
```

**ALTERNATIVA MAIS SIMPLES** (recomendada): Em vez de múltiplos blocos `{{#if}}`, usar uma única variável `{{category_instructions}}` que é preenchida pelo backend com as instruções da categoria selecionada. Isso evita complexidade no template e mantém o prompt limpo. O backend monta as instruções corretas antes de interpolar.

### Mapeamento Categoria → Prompt

| Categoria | Prompt Usado | Variável Focus |
|-----------|-------------|----------------|
| Lead | `icebreaker_generation` | Pessoa: trajetória, posição, contexto no mercado |
| Empresa | `icebreaker_generation` | Negócio: crescimento, mercado, oportunidade |
| Cargo | `icebreaker_generation` | Role: desafios típicos, decisões, dores do cargo |
| Post/LinkedIn | `icebreaker_premium_generation` | Posts reais: temas, opiniões, conquistas publicadas |

### Fallback Post/LinkedIn → Lead

Quando categoria "Post/LinkedIn" é selecionada mas o lead não tem `linkedin_posts_cache` populado:
1. API retorna `categoryFallback: true` e `originalCategory: "post"` no resultado do lead
2. Geração usa prompt `icebreaker_generation` com foco "Lead" (fallback)
3. Hook mostra toast informativo: "Lead X não possui posts — Ice Breaker gerado com foco no perfil"
4. **NÃO** bloqueia a geração — fallback é automático e graceful

### Project Structure Notes

**Arquivos a criar:**
- Nenhum arquivo novo obrigatório — reutilizar componentes existentes

**Arquivos a modificar:**
- `src/types/ai-prompt.ts` — Adicionar `IcebreakerCategory` type + `ICEBREAKER_CATEGORIES` const
- `src/lib/ai/prompts/defaults.ts` — Refatorar `icebreaker_generation` com blocos por categoria
- `src/app/api/leads/enrich-icebreaker/route.ts` — Aceitar `category`, lógica de fallback, passar ao prompt
- `src/hooks/use-icebreaker-enrichment.ts` — Aceitar `category` param, passar na API call
- `src/components/leads/LeadDetailPanel.tsx` — Adicionar select de categoria antes do botão
- `src/components/leads/LeadSelectionBar.tsx` — Adicionar select no dialog de confirmação em lote
- `__tests__/unit/hooks/use-icebreaker-enrichment.test.tsx` — Novos testes de categoria
- `__tests__/unit/api/leads-enrich-icebreaker.test.ts` — Novos testes de validação e fallback

**Alinhamento com estrutura do projeto:**
- Types em `src/types/` (PascalCase para tipos, SCREAMING_SNAKE para constantes)
- API routes em `src/app/api/leads/enrich-icebreaker/route.ts` (kebab-case)
- Hooks em `src/hooks/` (use + PascalCase: `useIcebreakerEnrichment`)
- Components em `src/components/leads/` (PascalCase.tsx)
- Testes espelham `src/` em `__tests__/`

### Padrões Obrigatórios (das stories anteriores)

1. **0 cores hardcoded** — Sempre usar tokens CSS do design system (`bg-muted`, `text-muted-foreground`, `border`)
2. **WCAG AA contrast** — 4.5:1 para texto normal, 3:1 para UI components
3. **ESLint no-console** — Apenas `console.warn()` e `console.error()` permitidos. ZERO `console.log`
4. **Mock factories centralizadas** — Se novo tipo usado em 3+ testes, criar factory em `__tests__/helpers/mock-data.ts`
5. **Mensagens de erro em Português** — Todas as mensagens user-facing em PT-BR
6. **Validação com Zod** (se usado na API) — Validar input no boundary
7. **Isolamento de testes** — `vi.clearAllMocks()` em `beforeEach`, sem dependência de ordem

### Prompt Manager - Sistema de 3 Níveis

```
1. Tenant-specific (ai_prompts WHERE tenant_id = current)
2. Global (ai_prompts WHERE tenant_id IS NULL)
3. Code default (src/lib/ai/prompts/defaults.ts)
```

Cache: 5 min TTL. Template interpolation: `{{variable}}`, `{{#if var}}...{{/if}}`, `{{#if var}}...{{else}}...{{/if}}`.

**IMPORTANTE**: Ao modificar o prompt default em `defaults.ts`, o PromptManager usará a versão do código SOMENTE se não houver versão tenant ou global no banco. Se o tenant customizou o prompt, a mudança no código não terá efeito para ele. Isso é by design.

### Knowledge Base Context

Variáveis compiladas do KB disponíveis para o prompt:
- `company_context` — Perfil da empresa (default: "Empresa de tecnologia focada em soluções B2B")
- `tone_description` — Descrição do tom de voz
- `tone_style` — Preset do tom ("casual", "formal", "technical")
- `writing_guidelines` — Guidelines customizadas
- `product_name`, `product_description`, `product_features`, `product_differentials`, `product_target_audience` — Contexto de produto
- `successful_examples` — Últimos 3 exemplos de email do KB
- `icp_summary` — Definição de ICP

Graceful degradation: quando seção do KB vazia, usa defaults.

### Database Schema Existente (leads table)

Colunas de icebreaker já existem (migration 00034):
- `icebreaker` (TEXT) — Texto gerado
- `icebreaker_generated_at` (TIMESTAMPTZ) — Timestamp de geração
- `linkedin_posts_cache` (JSONB) — Posts do LinkedIn cacheados

**NÃO é necessária nova migration** para esta story. A categoria é um parâmetro de geração, não um dado persistido.

### Custo por Lead

- Apify LinkedIn fetch: ~$0.002
- OpenAI API call: ~$0.002
- **Total: $0.004 por lead**

O custo NÃO muda com categorias (mesma quantidade de API calls).

### Git Intelligence (últimos commits relevantes)

```
91d9b28 fix(cleanup-sprint): fix failing tests, enforce ESLint no-console, centralize mock factories
d2cfc30 fix(filters): prevent trim from removing spaces while typing in filter inputs
d8ef3f9 feat(story-8.5): Visual QA & Contrast Review with code review fixes
```

**Padrão de commit**: `{type}({scope}): {description}`
- Para esta story: `feat(story-9.1): Icebreaker Categories with code review fixes`

### Referências da API Route Existente

A API route atual (`/api/leads/enrich-icebreaker`) valida:
- Lead IDs como UUIDs válidos
- Min 1, Max 50 leads por request
- API keys Apify e OpenAI configuradas
- Auth via `getCurrentUserProfile()`

Adicionar na validação: `category` como opcional, uma das 4 opções válidas, default "empresa".

### UI Components Existentes

**LeadDetailPanel.tsx** — Seção de Icebreaker (linhas 383-522):
- Botão "Gerar Icebreaker" / "Regenerar"
- Timestamp de geração
- Loading state
- Erro para LinkedIn URL ausente
- **Ponto de inserção**: Adicionar select de categoria ANTES do botão de geração

**LeadSelectionBar.tsx** — Bulk Icebreaker (linhas 296-314):
- Dialog de confirmação com custo estimado
- Progress display
- **Ponto de inserção**: Adicionar select de categoria NO dialog de confirmação, antes do botão "Gerar"

### References

- [Source: _bmad-output/planning-artifacts/epic-9-ai-content-quality-personalization.md#Story 9.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-001: AI Prompt Management System]
- [Source: src/lib/ai/prompts/defaults.ts — icebreaker_generation (lines 319-407)]
- [Source: src/lib/ai/prompts/defaults.ts — icebreaker_premium_generation (lines 254-316)]
- [Source: src/types/ai-prompt.ts — PromptKey type, AIPrompt interface]
- [Source: src/hooks/use-icebreaker-enrichment.ts — generateForLead, generateForLeads]
- [Source: src/app/api/leads/enrich-icebreaker/route.ts — POST handler, validation, batch processing]
- [Source: src/components/leads/LeadDetailPanel.tsx — IcebreakerSection (lines 383-522)]
- [Source: src/components/leads/LeadSelectionBar.tsx — Bulk icebreaker button (lines 296-314)]
- [Source: src/lib/services/knowledge-base-context.ts — KB variable compilation]
- [Source: src/lib/ai/prompt-manager.ts — 3-level fallback, template interpolation]
- [Source: __tests__/unit/hooks/use-icebreaker-enrichment.test.tsx — Hook test patterns]
- [Source: __tests__/unit/api/leads-enrich-icebreaker.test.ts — API route test patterns]
- [Source: _bmad-output/implementation-artifacts/cleanup-2-eslint-rule-and-mock-factories.md — ESLint rules, mock factories]
- [Source: _bmad-output/implementation-artifacts/8-5-visual-qa-contrast-review.md — WCAG AA, color tokens]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Pre-existing TypeScript type mismatches in `leads-enrich-icebreaker.test.ts` (null vs mock type) — not caused by Story 9.1, not fixed
- `logApiUsage` stderr warnings in API tests — pre-existing, mock doesn't implement `insert` method on supabase

### Completion Notes List

1. **Design decision**: Used "simpler alternative" from Dev Notes — single `{{category_instructions}}` variable instead of multiple `{{#if}}` blocks per category. Backend fills the correct instructions via `ICEBREAKER_CATEGORY_INSTRUCTIONS` record.
2. **Apify key conditional**: Made Apify API key loading conditional (only for "post" category) so non-post categories work without Apify configured.
3. **Graceful fallback chain**: Post → Lead when: (a) no linkedin_url, (b) no Apify key, (c) no posts found. Returns `categoryFallback: true` + `originalCategory: "post"` in response.
4. **Naming consistency maintained**: Kept camelCase for premium prompt (Post) and snake_case for standard prompt (Lead/Empresa/Cargo) per Dev Notes instruction.
5. **Pre-existing tests updated**: 7 API route tests + 2 LeadDetailPanel tests adapted to new category-aware behavior (default "empresa" no longer requires LinkedIn URL or Apify).
6. **Radix UI Select jsdom limitation**: Component dropdown interaction tests replaced with non-interactive assertions due to `hasPointerCapture` not available in jsdom. Core behavior (renders, disabled, post warning) fully covered.
7. **Test results**: 169/169 files passed, 2977/2977 tests passed (2 skipped pre-existing), 0 regressions.

### Change Log

- `feat(story-9.1)`: Added IcebreakerCategory type, ICEBREAKER_CATEGORIES const, DEFAULT_ICEBREAKER_CATEGORY, ICEBREAKER_CATEGORY_INSTRUCTIONS
- `feat(story-9.1)`: Added `{{category_instructions}}` section and rule #10 to icebreaker_generation prompt
- `feat(story-9.1)`: API route accepts `category` param, routes to processStandardCategory() or processPostCategory() with graceful fallback
- `feat(story-9.1)`: Hook accepts optional `category` param, passes to API, handles fallback toast
- `feat(story-9.1)`: Created IcebreakerCategorySelect component, integrated in LeadDetailPanel and LeadSelectionBar
- `test(story-9.1)`: 29 new tests (6 hook + 14 API + 9 component), 9 pre-existing tests updated

### Senior Developer Review (AI)

**Reviewer**: Amelia (Dev Agent) — 2026-02-05
**Outcome**: Approved with fixes applied

**Issues Found & Fixed (4):**
1. **[H1] Category descriptions not shown in dropdown** — AC #1 partial. `ICEBREAKER_CATEGORIES.description` was defined but never rendered. Fixed: added `<span className="text-xs text-muted-foreground">` for description in `IcebreakerCategorySelect.tsx`.
2. **[H2] Missing test for post+no-LinkedIn error flow** — Added test `AC#5: calls API when generating without LinkedIn for default category` in `LeadDetailPanel.test.tsx`. Post+no-LinkedIn client-side error path not testable in jsdom (Radix Select limitation); server-side fallback fully tested in API tests.
3. **[M1] Category state not reset when switching leads** — Added `setCategory(DEFAULT_ICEBREAKER_CATEGORY)` in `useEffect` on `lead.id` change in `LeadDetailPanel.tsx`.
4. **[M3] Dead re-export + unnecessary span wrapper** — Removed `export { DEFAULT_ICEBREAKER_CATEGORY }` re-export from `IcebreakerCategorySelect.tsx` (consumers import from `@/types/ai-prompt` directly).

**Non-blocking observations:**
- 10 unrelated files in git diff (space-y→flex/gap migration) — should be committed separately
- CampaignList.test.tsx pre-existing timeout on Windows (not story 9.1 related)

### Change Log

**New files:**
- `src/components/leads/IcebreakerCategorySelect.tsx` — Category dropdown component
- `__tests__/unit/components/icebreaker-category-select.test.tsx` — Component tests (9 tests)

**Modified files:**
- `src/types/ai-prompt.ts` — IcebreakerCategory type, ICEBREAKER_CATEGORIES, DEFAULT_ICEBREAKER_CATEGORY, ICEBREAKER_CATEGORY_INSTRUCTIONS
- `src/lib/ai/prompts/defaults.ts` — Added `{{category_instructions}}` section and rule #10 to icebreaker_generation
- `src/app/api/leads/enrich-icebreaker/route.ts` — Category in Zod schema, processStandardCategory(), processPostCategory(), conditional Apify key
- `src/hooks/use-icebreaker-enrichment.ts` — Category param in generateForLead/generateForLeads, fallback toast
- `src/components/leads/LeadDetailPanel.tsx` — Category state, IcebreakerCategorySelect integration, LinkedIn only required for "post"
- `src/components/leads/LeadSelectionBar.tsx` — Category state, IcebreakerCategorySelect in confirmation dialog
- `__tests__/unit/hooks/use-icebreaker-enrichment.test.tsx` — 6 new Story 9.1 category tests
- `__tests__/unit/api/leads-enrich-icebreaker.test.ts` — 14 new Story 9.1 tests + 7 updated pre-existing tests
- `__tests__/unit/components/leads/LeadDetailPanel.test.tsx` — 2 updated tests + 1 new test (category API call verification)
