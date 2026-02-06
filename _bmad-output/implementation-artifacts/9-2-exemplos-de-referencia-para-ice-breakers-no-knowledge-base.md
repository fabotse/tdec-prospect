# Story 9.2: Exemplos de Referencia para Ice Breakers no Knowledge Base

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want cadastrar exemplos de Ice Breakers reais no Knowledge Base,
so that a AI use esses exemplos como referencia de estilo e qualidade ao gerar novos.

## Acceptance Criteria

1. **Given** o usuario esta na secao de Knowledge Base
   **When** acessa a area de exemplos
   **Then** existe uma secao dedicada para "Exemplos de Ice Breakers"
   **And** e separada da secao de "Exemplos de Emails" existente

2. **Given** o usuario adiciona um exemplo de Ice Breaker
   **When** salva o exemplo
   **Then** pode informar:
   - O texto do Ice Breaker
   - A categoria (Lead, Empresa, Cargo, Post) -- opcional
   **And** o exemplo e persistido no Knowledge Base do tenant

3. **Given** existem exemplos cadastrados
   **When** a AI gera um Ice Breaker
   **Then** os exemplos sao injetados no prompt via variavel `{{icebreaker_examples}}`
   **And** no maximo 3 exemplos sao usados (priorizando os da mesma categoria selecionada)
   **And** o prompt instrui a AI a imitar o estilo dos exemplos

4. **Given** nao existem exemplos cadastrados
   **When** a AI gera um Ice Breaker
   **Then** o bloco de exemplos e omitido do prompt (graceful degradation)
   **And** os exemplos hardcoded atuais do prompt sao usados como fallback

## Tasks / Subtasks

- [x] Task 1: Schema de banco de dados - Criar tabela `icebreaker_examples` (AC: #1, #2)
  - [x]1.1 Criar migration `supabase/migrations/00036_create_icebreaker_examples.sql` com colunas: `id` UUID PK, `tenant_id` UUID FK, `text` TEXT NOT NULL, `category` TEXT (nullable, CHECK IN ('lead','empresa','cargo','post')), `created_at` TIMESTAMPTZ, `updated_at` TIMESTAMPTZ
  - [x]1.2 Criar RLS policies: admin-only CRUD isolado por tenant (mesmo padrao de `knowledge_base_examples`)
  - [x]1.3 Criar indice `idx_icebreaker_examples_tenant` em `tenant_id`

- [x] Task 2: Definir tipos TypeScript e validacao Zod (AC: #2)
  - [x]2.1 Adicionar `IcebreakerExample` interface em `src/types/knowledge-base.ts` (campos: id, tenant_id, text, category, created_at, updated_at)
  - [x]2.2 Adicionar `icebreakerExampleSchema` Zod: `text` (1-500 chars, obrigatorio), `category` (enum IcebreakerCategory optional)
  - [x]2.3 Adicionar `IcebreakerExampleInput` e `IcebreakerExampleInsert` types derivados
  - [x]2.4 Importar `IcebreakerCategory` de `src/types/ai-prompt.ts` para reutilizar o tipo existente (Story 9.1)

- [x] Task 3: Server actions CRUD para exemplos de ice breaker (AC: #1, #2)
  - [x]3.1 Adicionar `getIcebreakerExamples()` em `src/actions/knowledge-base.ts` -- retorna todos os exemplos do tenant ordenados por `created_at DESC`
  - [x]3.2 Adicionar `createIcebreakerExample(data: IcebreakerExampleInput)` -- validacao Zod + admin check + insert
  - [x]3.3 Adicionar `updateIcebreakerExample(id, data: IcebreakerExampleInput)` -- validacao UUID + Zod + admin check + tenant isolation
  - [x]3.4 Adicionar `deleteIcebreakerExample(id)` -- validacao UUID + admin check + tenant isolation
  - [x]3.5 Seguir exatamente o padrao de `createEmailExample`/`updateEmailExample`/`deleteEmailExample` existentes

- [x] Task 4: Hook `useIcebreakerExamples` com TanStack Query (AC: #1, #2)
  - [x]4.1 Criar `src/hooks/use-icebreaker-examples.ts` seguindo padrao de `src/hooks/use-email-examples.ts`
  - [x]4.2 Query key: `["knowledge-base", "icebreaker-examples"]`
  - [x]4.3 Mutations: create, update, delete com invalidacao de cache
  - [x]4.4 Invalidar tambem `["knowledge-base", "context"]` em cada mutation (para AI usar dados frescos)
  - [x]4.5 Retornar: `examples`, `isLoading`, `error`, `createExample`, `updateExample`, `deleteExample`, mutation loading states

- [x] Task 5: Componente UI `IcebreakerExamplesForm` (AC: #1, #2)
  - [x]5.1 Criar `src/components/settings/IcebreakerExamplesForm.tsx` seguindo padrao de `EmailExamplesForm.tsx`
  - [x]5.2 Dialog de adicionar/editar com campos: `text` (Textarea, 4 rows), `category` (Select opcional com IcebreakerCategorySelect ou select simples)
  - [x]5.3 Lista de exemplos em cards: texto (line-clamp-2), badge de categoria (se informada), botoes editar/deletar
  - [x]5.4 Empty state com icone + CTA "Adicionar Exemplo de Ice Breaker"
  - [x]5.5 Delete confirmation com AlertDialog
  - [x]5.6 Toast notifications em portugues (sucesso/erro)
  - [x]5.7 Loading skeleton durante fetch
  - [x]5.8 Garantir 0 cores hardcoded -- usar tokens CSS (`bg-muted`, `text-muted-foreground`, `border`)
  - [x]5.9 Garantir contraste WCAG AA (4.5:1 texto, 3:1 UI components)
  - [x]5.10 Usar `flex flex-col gap-2` para label+input wrappers (Tailwind v4 pattern, NAO usar space-y-*)

- [x] Task 6: Integrar nova aba no KnowledgeBaseTabs (AC: #1)
  - [x]6.1 Adicionar 5a aba "Ice Breakers" em `src/components/settings/KnowledgeBaseTabs.tsx` (apos "Exemplos", antes de "ICP")
  - [x]6.2 Renderizar `<IcebreakerExamplesForm />` no conteudo da nova aba
  - [x]6.3 Manter ordem: Empresa | Tom de Voz | Exemplos | Ice Breakers | ICP

- [x] Task 7: Buscar e formatar exemplos de IB na API route de geracao (AC: #3, #4)
  - [x]7.1 Em `src/app/api/leads/enrich-icebreaker/route.ts`, estender `fetchKBContext` para tambem buscar exemplos de IB do banco
  - [x]7.2 Criar funcao `fetchIcebreakerExamples(supabase, tenantId)` -- query `icebreaker_examples` WHERE tenant_id, ORDER BY created_at DESC
  - [x]7.3 Criar funcao `formatIcebreakerExamples(examples, category?)` -- filtra por categoria (prioriza mesma), limita a 3, formata como string
  - [x]7.4 Formato: `"Exemplo 1:\nTexto: [texto]\nCategoria: [cat]"` (similar a `formatEmailExamples`)
  - [x]7.5 Em `buildStandardIcebreakerVariables()`: chamar formatIcebreakerExamples e atribuir a variavel `icebreaker_examples`
  - [x]7.6 Graceful degradation: se nenhum exemplo, `icebreaker_examples` = "" (string vazia)

- [x] Task 8: Adicionar variavel `{{icebreaker_examples}}` nos prompts de IB (AC: #3, #4)
  - [x]8.1 Em `src/lib/ai/prompts/defaults.ts`, no prompt `icebreaker_generation`: adicionar bloco condicional `{{#if icebreaker_examples}}` ANTES das regras (apos a secao de tom), similar ao bloco `{{#if successful_examples}}` existente
  - [x]8.2 Conteudo do bloco: "EXEMPLOS DE ICE BREAKERS DE REFERENCIA (APRENDA COM ELES):" + instrucoes criticas de imitacao
  - [x]8.3 Na regra #9: adicionar condicional para priorizar exemplos de IB quando disponíveis
  - [x]8.4 Manter `{{#if successful_examples}}` intacto -- sao exemplos de EMAIL, nao de IB (variaveis diferentes)

- [x] Task 9: Testes unitarios (AC: #1, #2, #3, #4)
  - [x]9.1 Testes do hook `useIcebreakerExamples`: CRUD operations, cache invalidation, loading states (~8 testes)
  - [x]9.2 Testes das server actions: create/update/delete validation, admin check, tenant isolation (~10 testes)
  - [x]9.3 Testes do componente `IcebreakerExamplesForm`: render, add dialog, edit dialog, delete dialog, empty state, loading, category select (~10 testes)
  - [x]9.4 Testes da API route: `icebreaker_examples` passada ao prompt, filtragem por categoria, graceful degradation sem exemplos (~6 testes)
  - [x]9.5 Teste do KnowledgeBaseTabs: nova aba "Ice Breakers" renderizada
  - [x]9.6 Verificar 0 violacoes ESLint (`no-console` enforced)
  - [x]9.7 Verificar que testes pre-existentes continuam passando (169 files, ~2977 tests)

## Dev Notes

### Decisao de Design: Tabela Separada vs Reutilizacao

O epic sugere "Avaliar reutilizacao da estrutura `EmailExample[]` existente no KB, adicionando um campo `type: 'email' | 'icebreaker'`". **Decisao: Tabela separada `icebreaker_examples`**. Razoes:

1. **Modelo de dados diferente**: Email examples tem `subject` + `body` (2 campos de texto). Icebreaker examples tem apenas `text` (1 campo) + `category` opcional. Forcar o mesmo schema seria hacky.
2. **Separacao de concerns**: Email examples alimentam `{{successful_examples}}` nos prompts de EMAIL. Icebreaker examples alimentam `{{icebreaker_examples}}` nos prompts de IB. Sao pipelines completamente distintos.
3. **Evolucao independente**: Cada tipo pode ganhar campos especificos no futuro sem impactar o outro.
4. **Padroes identicos**: Apesar de tabela separada, TODO o codigo segue os mesmos padroes de `knowledge_base_examples` (server actions, hook, componente), minimizando esforco.

### Contexto Critico do Sistema de Exemplos de Email (referencia)

O sistema existente de email examples serve como blueprint exato para esta story:

```
knowledge_base_examples table
  → src/actions/knowledge-base.ts (CRUD server actions)
  → src/hooks/use-email-examples.ts (TanStack Query hook)
  → src/components/settings/EmailExamplesForm.tsx (CRUD UI)
  → src/lib/services/knowledge-base-context.ts → formatEmailExamples()
  → {{successful_examples}} nos prompts de email
```

**Para esta story, replicar a mesma cadeia:**

```
icebreaker_examples table (NOVA)
  → src/actions/knowledge-base.ts (ADICIONAR CRUD)
  → src/hooks/use-icebreaker-examples.ts (NOVO)
  → src/components/settings/IcebreakerExamplesForm.tsx (NOVO)
  → src/app/api/leads/enrich-icebreaker/route.ts → formatIcebreakerExamples() (NOVO)
  → {{icebreaker_examples}} nos prompts de IB (ADICIONAR)
```

### Fluxo de Integracao com Geracao de Icebreaker

**ATENCAO**: Os exemplos de IB NAO passam pelo KB context service generico (`knowledge-base-context.ts`). Eles sao injetados diretamente na API route `enrich-icebreaker/route.ts`. Razao: icebreaker examples so sao usados na geracao de IB, nao em email generation. Manter self-contained no endpoint.

```
Fluxo atual (Story 9.1):
  POST /api/leads/enrich-icebreaker
    → fetchKBContext(tenantId) → {company, tone}
    → buildStandardIcebreakerVariables(lead, kbContext, category)
      → successful_examples: "" (vazio!)
      → category_instructions: ICEBREAKER_CATEGORY_INSTRUCTIONS[category]
    → promptManager.renderPrompt("icebreaker_generation", variables)

Fluxo com Story 9.2:
  POST /api/leads/enrich-icebreaker
    → fetchKBContext(tenantId) → {company, tone, icebreakerExamples}  ← ESTENDER
    → fetchIcebreakerExamples(supabase, tenantId)                     ← NOVO
    → formatIcebreakerExamples(examples, category)                    ← NOVO
    → buildStandardIcebreakerVariables(lead, kbContext, category)
      → icebreaker_examples: formatIcebreakerExamples(...)            ← ADICIONAR
    → promptManager.renderPrompt("icebreaker_generation", variables)
```

### Filtragem de Exemplos por Categoria (AC #3)

A logica de selecao de exemplos para o prompt:
1. Buscar TODOS os exemplos do tenant (ordered by `created_at DESC`)
2. Filtrar pela categoria selecionada na geracao
3. Se houver >= 3 exemplos da mesma categoria → usar esses 3
4. Se houver < 3 da mesma categoria → completar com exemplos sem categoria (`category IS NULL`)
5. Se nao houver nenhum exemplo → `icebreaker_examples` = "" → bloco `{{#if}}` e omitido
6. **Maximo absoluto: 3 exemplos** (MAX_IB_EXAMPLES_IN_PROMPT = 3)

### Formato dos Exemplos no Prompt

```
Exemplo 1:
Texto: "Vi que a Acme Corp esta expandindo para o mercado de SaaS. Nossa plataforma tem ajudado empresas nessa transicao..."
Categoria: Empresa

Exemplo 2:
Texto: "Como Head de Vendas, voce provavelmente enfrenta o desafio de escalar prospecao sem perder qualidade..."
Categoria: Cargo

Exemplo 3:
Texto: "A trajetoria da Maria Silva no setor de fintech me chamou atencao..."
```

### Bloco de Exemplos de IB no Prompt (referencia)

Adicionar ao prompt `icebreaker_generation` o seguinte bloco (apos `{{#if successful_examples}}`, antes de `REGRAS OBRIGATORIAS`):

```handlebars
{{#if icebreaker_examples}}
EXEMPLOS DE ICE BREAKERS DE REFERENCIA (APRENDA COM ELES):
{{icebreaker_examples}}

⚠️ INSTRUCOES CRITICAS - IMITE OS EXEMPLOS:
- Adote o MESMO estilo de abertura dos exemplos
- Use vocabulario e expressoes similares aos exemplos de ice breaker
- Copie a forma como personalizam (mencao a empresa, setor, conquistas)
- O quebra-gelo gerado DEVE parecer escrito pela mesma pessoa que escreveu os exemplos
- Observe o comprimento dos exemplos e mantenha similar
- Se os exemplos fazem conexoes especificas, faca conexoes similares
{{/if}}
```

### UI: Nova Aba no KnowledgeBaseTabs

**Ordem das abas apos a Story 9.2:**
1. Empresa (CompanyProfileForm)
2. Tom de Voz (ToneOfVoiceForm)
3. Exemplos (EmailExamplesForm) — exemplos de EMAIL
4. **Ice Breakers (IcebreakerExamplesForm)** — NOVA
5. ICP (ICPDefinitionForm)

**Componente `IcebreakerExamplesForm`** — replicar padrao de `EmailExamplesForm.tsx`:
- Usar `useIcebreakerExamples()` hook
- Dialog com 2 campos: `text` (Textarea) + `category` (Select opcional usando IcebreakerCategory)
- Cards com texto (line-clamp-2) + badge de categoria + botoes edit/delete
- Empty state: icone MessageSquare + "Nenhum exemplo de Ice Breaker cadastrado" + botao "Adicionar"
- Delete confirmation: AlertDialog padrao

**Campo de categoria no dialog:**
- Reutilizar as categorias de `ICEBREAKER_CATEGORIES` do `src/types/ai-prompt.ts` (Story 9.1)
- Select com opcao "Nenhuma categoria" (valor null/undefined) + 4 categorias
- Labels em portugues: Lead, Empresa, Cargo, Post/LinkedIn
- Descriptions: usar `ICEBREAKER_CATEGORIES[cat].description` para tooltip/helper

### Validacao Zod para Exemplos de IB

```typescript
const icebreakerExampleSchema = z.object({
  text: z.string()
    .min(1, "Texto do ice breaker e obrigatorio")
    .max(500, "Texto muito longo (maximo 500 caracteres)"),
  category: z.enum(["lead", "empresa", "cargo", "post"]).optional(),
});
```

**500 caracteres max** pois IB sao curtos (max 2 frases). Emails podem ter ate 10000 chars.

### Project Structure Notes

**Arquivos a criar:**
- `supabase/migrations/00036_create_icebreaker_examples.sql` — Nova tabela
- `src/hooks/use-icebreaker-examples.ts` — Hook TanStack Query para CRUD
- `src/components/settings/IcebreakerExamplesForm.tsx` — Componente CRUD UI
- `__tests__/unit/hooks/use-icebreaker-examples.test.tsx` — Testes do hook
- `__tests__/unit/components/settings/icebreaker-examples-form.test.tsx` — Testes do componente
- `__tests__/unit/api/leads-enrich-icebreaker-examples.test.ts` — Testes de integracao IB examples na API

**Arquivos a modificar:**
- `src/types/knowledge-base.ts` — Adicionar `IcebreakerExample`, `icebreakerExampleSchema`, types derivados
- `src/actions/knowledge-base.ts` — Adicionar CRUD server actions para icebreaker examples
- `src/components/settings/KnowledgeBaseTabs.tsx` — Adicionar 5a aba "Ice Breakers"
- `src/app/api/leads/enrich-icebreaker/route.ts` — Fetch IB examples, format, pass to prompt variables
- `src/lib/ai/prompts/defaults.ts` — Adicionar `{{icebreaker_examples}}` ao prompt `icebreaker_generation`
- `__tests__/unit/api/leads-enrich-icebreaker.test.ts` — Atualizar testes existentes para novo fluxo

**Alinhamento com estrutura do projeto:**
- Types em `src/types/` (PascalCase para tipos, SCREAMING_SNAKE para constantes)
- Server actions em `src/actions/` (camelCase funcoes)
- API routes em `src/app/api/` (kebab-case dirs)
- Hooks em `src/hooks/` (use-kebab-case.ts)
- Components em `src/components/settings/` (PascalCase.tsx)
- Testes espelham `src/` em `__tests__/`

### Padroes Obrigatorios (das stories anteriores)

1. **0 cores hardcoded** — Sempre usar tokens CSS do design system (`bg-muted`, `text-muted-foreground`, `border`)
2. **WCAG AA contrast** — 4.5:1 para texto normal, 3:1 para UI components
3. **ESLint no-console** — Apenas `console.warn()` e `console.error()` permitidos. ZERO `console.log`
4. **Mock factories centralizadas** — Se novo tipo usado em 3+ testes, criar factory em `__tests__/helpers/mock-data.ts`
5. **Mensagens de erro em Portugues** — Todas as mensagens user-facing em PT-BR
6. **Validacao com Zod** (se usado na API) — Validar input no boundary
7. **Isolamento de testes** — `vi.clearAllMocks()` em `beforeEach`, sem dependencia de ordem
8. **Tailwind v4** — Usar `flex flex-col gap-*` ao inves de `space-y-*` para label+input wrappers
9. **DialogDescription** — Sempre incluir `<DialogDescription>` em shadcn Dialog (acessibilidade)

### Prompt Manager - Sistema de 3 Niveis

```
1. Tenant-specific (ai_prompts WHERE tenant_id = current)
2. Global (ai_prompts WHERE tenant_id IS NULL)
3. Code default (src/lib/ai/prompts/defaults.ts)
```

Cache: 5 min TTL. Template interpolation: `{{variable}}`, `{{#if var}}...{{/if}}`, `{{#if var}}...{{else}}...{{/if}}`.

**IMPORTANTE**: Ao modificar o prompt default em `defaults.ts`, o PromptManager usara a versao do codigo SOMENTE se nao houver versao tenant ou global no banco.

### Knowledge Base Context - NAO MODIFICAR

O servico `src/lib/services/knowledge-base-context.ts` e a interface `AIContextVariables` NAO devem ser modificados nesta story. Os icebreaker examples sao injetados diretamente na API route `enrich-icebreaker`, NAO no KB context generico. Razao: exemplos de IB so sao relevantes para geracao de IB, nao para email generation.

### Referencia: EmailExamplesForm Patterns (Blueprint)

Estado do componente `EmailExamplesForm.tsx` a replicar:
- `dialogOpen` (boolean) — controle do dialog add/edit
- `editingExample` (IcebreakerExample | null) — null=add, obj=edit
- `deleteDialogOpen` (boolean) — controle do AlertDialog
- `exampleToDelete` (string | null) — ID do exemplo a deletar
- React Hook Form com `useForm<IcebreakerExampleInput>()` + Zod resolver
- `openAddDialog()` — limpa form, abre dialog
- `openEditDialog(example)` — popula form com dados existentes
- `onSubmit()` — cria ou atualiza baseado em `editingExample`
- `onConfirmDelete()` — deleta e atualiza cache

### Git Intelligence (ultimos commits relevantes)

```
ac3bef2 feat(story-9.1): Icebreaker Categories with code review fixes
91d9b28 fix(cleanup-sprint): fix failing tests, enforce ESLint no-console, centralize mock factories
d2cfc30 fix(filters): prevent trim from removing spaces while typing in filter inputs
```

**Padrao de commit**: `{type}({scope}): {description}`
- Para esta story: `feat(story-9.2): Icebreaker Reference Examples in Knowledge Base`

### Custo de Implementacao

Nenhum custo adicional de API. Os exemplos sao armazenados localmente e injetados no prompt existente. O custo por lead de geracao de IB permanece o mesmo (~$0.004).

### Dependencias

- **Story 9.1 (DONE)**: Fornece `IcebreakerCategory` type, `ICEBREAKER_CATEGORIES` const, e `ICEBREAKER_CATEGORY_INSTRUCTIONS` usados nesta story
- **Esta story NAO bloqueia**: Story 9.3 (Refatoracao dos Prompts de IB) depende de 9.1 + 9.2

### References

- [Source: _bmad-output/planning-artifacts/epic-9-ai-content-quality-personalization.md#Story 9.2]
- [Source: _bmad-output/implementation-artifacts/9-1-categorias-de-ice-breaker.md — Previous story patterns]
- [Source: src/types/knowledge-base.ts — EmailExample, emailExampleSchema, types]
- [Source: src/types/ai-prompt.ts — IcebreakerCategory, ICEBREAKER_CATEGORIES (Story 9.1)]
- [Source: src/actions/knowledge-base.ts — CRUD server actions (createEmailExample pattern)]
- [Source: src/hooks/use-email-examples.ts — TanStack Query hook pattern]
- [Source: src/components/settings/EmailExamplesForm.tsx — CRUD UI component pattern]
- [Source: src/components/settings/KnowledgeBaseTabs.tsx — Tab container (4 tabs currently)]
- [Source: src/lib/services/knowledge-base-context.ts — formatEmailExamples, buildAIVariables]
- [Source: src/lib/ai/prompts/defaults.ts — icebreaker_generation prompt (lines 318-411), {{successful_examples}} pattern]
- [Source: src/app/api/leads/enrich-icebreaker/route.ts — fetchKBContext, buildStandardIcebreakerVariables, processStandardCategory]
- [Source: src/lib/ai/prompt-manager.ts — 3-level fallback, template interpolation]
- [Source: supabase/migrations/00008_create_knowledge_base_examples.sql — DB schema pattern]
- [Source: __tests__/unit/hooks/use-icebreaker-enrichment.test.tsx — Hook test patterns]
- [Source: __tests__/unit/api/leads-enrich-icebreaker.test.ts — API route test patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed KnowledgeBaseTabs test: Radix UI Tabs only renders active tab content, needed userEvent.click before asserting
- Fixed 31 regression failures in leads-enrich-icebreaker.test.ts: 4 custom mockFrom implementations needed icebreaker_examples table handler

### Completion Notes List

- All 9 tasks completed successfully
- 173 test files passing, 3022 tests (45 new tests for story 9.2)
- 0 ESLint violations
- Followed exact patterns from EmailExamplesForm/use-email-examples for consistency
- Used flex flex-col gap-2 instead of space-y-* (Tailwind v4 pattern)
- Included DialogDescription for accessibility compliance

### File List

**Created:**
- supabase/migrations/00036_create_icebreaker_examples.sql
- src/hooks/use-icebreaker-examples.ts
- src/components/settings/IcebreakerExamplesForm.tsx
- __tests__/unit/hooks/use-icebreaker-examples.test.tsx
- __tests__/unit/components/settings/icebreaker-examples-form.test.tsx
- __tests__/unit/api/leads-enrich-icebreaker-examples.test.ts
- __tests__/unit/components/settings/knowledge-base-tabs.test.tsx

**Modified:**
- src/types/knowledge-base.ts (IcebreakerExample type, Zod schema)
- src/actions/knowledge-base.ts (4 CRUD server actions)
- src/components/settings/KnowledgeBaseTabs.tsx (5th tab "Ice Breakers")
- src/app/api/leads/enrich-icebreaker/route.ts (fetch, format, inject examples; replaced local IcebreakerExampleRow with imported IcebreakerExample)
- src/lib/ai/prompts/defaults.ts ({{icebreaker_examples}} block in prompt)
- src/components/leads/IcebreakerCategorySelect.tsx (moved category description outside SelectItem for better UX)
- __tests__/unit/api/leads-enrich-icebreaker.test.ts (added icebreaker_examples mock handlers)
- __tests__/unit/actions/knowledge-base.test.ts (added 15 icebreaker CRUD server action tests)

### Change Log

| Change | Reason |
|--------|--------|
| New table `icebreaker_examples` | AC #1, #2: Dedicated storage for IB examples per tenant |
| IcebreakerExample type + Zod | AC #2: Type safety and validation (500 char max, optional category) |
| 4 CRUD server actions | AC #1, #2: Admin-only CRUD with tenant isolation |
| useIcebreakerExamples hook | AC #1, #2: TanStack Query for data fetching + mutations |
| IcebreakerExamplesForm component | AC #1, #2: Full CRUD UI with dialog, category select, delete confirmation |
| KnowledgeBaseTabs 5th tab | AC #1: "Ice Breakers" tab between "Exemplos" and "ICP" |
| fetchIcebreakerExamples + formatIcebreakerExamples | AC #3: Query DB, filter by category, max 3 examples |
| {{icebreaker_examples}} in prompt | AC #3: Conditional block with imitation instructions |
| Graceful degradation | AC #4: Empty string when no examples, {{#if}} omits block |
| Code Review: replaced IcebreakerExampleRow with IcebreakerExample import | Type safety: eliminated duplicate type with weaker typing |
| Code Review: added server action tests (15 tests) | Missing coverage: auth, admin role, Zod validation, CRUD for icebreaker actions |
| Code Review: added component CRUD flow tests (3 tests) | Missing coverage: submit create, submit edit, confirm delete |
| Code Review: added edge case format tests (2 tests) | Missing coverage: cross-category empty result, cargo category |
| Code Review: documented IcebreakerCategorySelect.tsx in File List | Git discrepancy: file was modified but not tracked in story |
