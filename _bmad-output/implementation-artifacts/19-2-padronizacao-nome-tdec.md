---
baseline_commit: a1befc3
---
# Story 19.2: Padronização do nome "TDEC" → "TDec" em toda a UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a cliente TDec,
I want que o nome da minha empresa apareça sempre escrito "TDec",
so that a marca seja apresentada de forma consistente e correta em toda a aplicação.

## Acceptance Criteria

1. **Sweep das strings voltadas ao usuário (FR2).** Todas as ocorrências do nome da marca escritas como "TDEC" em **strings visíveis na UI** passam a exibir **"TDec"** (T e D maiúsculos, "ec" minúsculo). Onde for um swap limpo, a string literal é substituída por **`BRAND.name`** (fonte única — `src/lib/constants/brand.ts`, criado na Story 19.1).

2. **Preservação de referências técnicas e do design-system (NFR-Q1).** O sweep **NÃO** altera: referências ao design-system **"TripleD"** (Story 8.4), o slug do projeto **`tdec-prospect`** (lowercase, package/identificador), nem dados de mock/fixtures de teste que coincidentemente contenham "TDEC" (ex.: `"TDEC Analytics"`, `"TDEC Company"`). Ver Dev Notes → "🚫 NÃO TOCAR".

3. **Nenhuma ocorrência visível de "TDEC" remanescente nas telas em escopo.** Após o sweep, navegando pela aplicação (sidebar, página do Agente, onboarding do Agente, formulário de perfil da empresa), não resta nenhum "TDEC" visível. **Exceção fora deste escopo:** o `metadata` do root layout e favicon/OpenGraph são da **Story 19.3** (ver "Fronteira com a Story 19.3").

4. **Zero regressão de testes.** Os testes que asseguram os textos alterados são atualizados na mesma story (`Agente TDEC` → `Agente TDec`), e a suíte completa permanece verde. Build e lint sem novos erros.

## Tasks / Subtasks

> Pré-requisito já satisfeito: a constant `BRAND` existe (`src/lib/constants/brand.ts`, `BRAND.name === "TDec"`) — criada na Story 19.1 (commit `a1befc3`). Esta story a **consome**.

- [x] **Task 1 — Sidebar: nav label "Agente TDEC"** (AC: #1, #3, #4)
  - [x] Em [src/components/common/Sidebar.tsx](src/components/common/Sidebar.tsx#L52), trocar o label do nav item `{ label: "Agente TDEC", href: "/agent", icon: Bot }` para usar `BRAND.name`: `` label: `Agente ${BRAND.name}` ``.
  - [x] Adicionar `import { BRAND } from "@/lib/constants/brand";` (o arquivo já importa `BrandLogo` da Story 19.1, mas **ainda não** importa `BRAND`).
  - [x] **Regressão obrigatória** — atualizar [__tests__/unit/components/Sidebar.test.tsx](__tests__/unit/components/Sidebar.test.tsx): linha **120** (`queryByText('Agente TDEC')`) e linha **130** (`getByText('Agente TDEC')`) → `'Agente TDec'`. Atualizar também os nomes de `describe`/`it` (linhas ~207, 208, 215, 223) de "Agente TDEC" → "Agente TDec" por clareza (não-funcional, mas evita confusão).

- [x] **Task 2 — Página do Agente: heading + metadata** (AC: #1, #3)
  - [x] Em [src/app/(dashboard)/agent/page.tsx](<src/app/(dashboard)/agent/page.tsx#L32>) linha 32, trocar `<h1 className="text-h1 text-foreground">Agente TDEC</h1>` por `<h1 className="text-h1 text-foreground">Agente {BRAND.name}</h1>`.
  - [x] Linha 13-16 (`export const metadata`): trocar `title: "Agente TDEC - tdec-prospect"` por `` title: `Agente ${BRAND.name} - tdec-prospect` `` (mantém o slug técnico `tdec-prospect` intacto — ver AC #2). **Decisão de fronteira:** este `metadata` é **de página** (não o root) → fica nesta story; o root `layout.tsx` é da Story 19.3 (ver "Fronteira com a Story 19.3").
  - [x] Adicionar `import { BRAND } from "@/lib/constants/brand";` (é Server Component — import direto, sem `"use client"`).
  - [x] Linha 2 (comentário de cabeçalho `* Pagina do Agente TDEC`): trocar para "TDec" por consistência (não é user-facing, mas é trivial e evita confusão futura).
  - [x] Não há teste específico para o `<h1>` desta página (a renderização do agente é coberta por `AgentChat`/onboarding). Rodar a suíte para confirmar zero regressão.

- [x] **Task 3 — AgentOnboarding: heading** (AC: #1, #3, #4)
  - [x] Em [src/components/agent/AgentOnboarding.tsx](src/components/agent/AgentOnboarding.tsx#L22) linha 22, trocar `<h2 className="text-h2 text-foreground">Agente TDEC</h2>` por `<h2 className="text-h2 text-foreground">Agente {BRAND.name}</h2>`.
  - [x] Adicionar `import { BRAND } from "@/lib/constants/brand";` (componente é `"use client"` — o import de uma const é compatível com client).
  - [x] **Regressão obrigatória** — atualizar [__tests__/unit/components/agent/AgentOnboarding.test.tsx](__tests__/unit/components/agent/AgentOnboarding.test.tsx): linha **16** (nome do `it("renderiza titulo 'Agente TDEC'")`) e linha **18** (`getByText("Agente TDEC")`) → `"Agente TDec"`.

- [x] **Task 4 — CompanyProfileForm: placeholder de exemplo** (AC: #1, #3)
  - [x] Em [src/components/settings/CompanyProfileForm.tsx](src/components/settings/CompanyProfileForm.tsx#L119) linha 119, trocar `placeholder="Ex: TDEC Soluções"` por `` placeholder={`Ex: ${BRAND.name} Soluções`} `` (ou literal `"Ex: TDec Soluções"` se preferir não importar BRAND aqui — mas BRAND.name é preferível, AC #1).
  - [x] Adicionar `import { BRAND } from "@/lib/constants/brand";` se usar `BRAND.name`.
  - [x] **Sem regressão de teste:** [__tests__/unit/components/settings/CompanyProfileForm.test.tsx](__tests__/unit/components/settings/CompanyProfileForm.test.tsx#L101) (linhas 101, 110) usa `"TDEC Company"` como **valor digitado** no campo (mock data), **não** o placeholder. Não alterar esse teste — é dado de fixture, fora de escopo (ver AC #2).

- [x] **Task 5 — Prompt de IA: exemplo "Na TDEC" (code default)** (AC: #1)
  - [x] Em [src/lib/ai/prompts/defaults.ts](src/lib/ai/prompts/defaults.ts#L351) linha 351, no exemplo de quebra-gelo, trocar `"...Na TDEC, ajudamos empresas..."` por `"...Na TDec, ajudamos empresas..."`. Manter como **string literal** "TDec" (não `${BRAND.name}` — ver Dev Notes → "Prompt: por que literal").
  - [x] **⚠️ Ler antes:** Dev Notes → "🔴 Armadilha do prompt no banco (DB override)". Mudar `defaults.ts` **isoladamente pode NÃO mudar o que o usuário vê**, porque o mesmo texto existe no DB (migration `00033`) e o nível DB-global do PromptManager **sobrescreve** o code default. Decisão sobre o DB → ver Task 6.

- [x] **Task 6 — [DECISÃO] Prompt global no banco (`00033`)** (AC: #1) — *ver Open Questions ao final*
  - [x] O texto "Na TDEC" também existe em [supabase/migrations/00033_add_icebreaker_premium_prompt.sql](supabase/migrations/00033_add_icebreaker_premium_prompt.sql#L72) (linha 72), que insere um prompt **global** (`tenant_id IS NULL`) em `ai_prompts`. Migrations são **histórico imutável** — **não editar** a `00033`.
  - [x] **Opção A (recomendada se quiser paridade real):** criar **nova** migration `supabase/migrations/000NN_fix_icebreaker_tdec_branding.sql` com um `UPDATE public.ai_prompts SET content = REPLACE(content, 'Na TDEC', 'Na TDec') WHERE tenant_id IS NULL AND content LIKE '%Na TDEC%';`. Garante que a saída renderizada não mostre "TDEC".
  - [x] **Opção B (deferir):** deixar como está. Justificativa: é texto **exemplo interno do prompt** (lido pela IA, não pelo destinatário final do e-mail — o quebra-gelo gerado usa o nome real do tenant via KB context, não "TDEC"). Impacto user-facing ~nulo. Documentar no Completion Notes.
  - [x] **Confirmar com o usuário (Fabossi) qual opção seguir antes de implementar** — está nas Open Questions.

- [x] **Task 7 — Validação e gate de qualidade** (AC: #1–#4)
  - [x] `grep -rn "TDEC" src/` deve retornar **apenas** ocorrências fora de escopo conscientes: o comentário-doc de `brand.ts` (`(NUNCA "TDEC")`), o comentário de `globals.css` e o root `layout.tsx` metadata (Story 19.3). Tudo o que é user-facing nas telas em escopo deve estar como "TDec".
  - [x] `npm run build` — gate obrigatório do projeto, sem erros TS.
  - [x] `npx vitest run` — suíte completa **verde, zero regressão** (atenção: `Sidebar.test.tsx`, `AgentOnboarding.test.tsx`).
  - [x] `npm run lint` — sem novos erros/warnings nos arquivos tocados (`no-console`, evitar non-null `!`).
  - [x] Validação manual rápida: sidebar mostra "Agente TDec"; página `/agent` mostra heading "Agente TDec" e título da aba "Agente TDec - tdec-prospect"; onboarding mostra "Agente TDec"; placeholder do perfil mostra "Ex: TDec Soluções".

## Dev Notes

### Resumo do que construir
Story **100% cosmética / conteúdo** — sweep de grafia "TDEC" → "TDec" nas strings **visíveis** da UI, consumindo a constant `BRAND` (já criada na 19.1). **Não toca lógica de negócio.** O risco real não é a complexidade — é o **excesso de zelo**: um find-replace global de "TDEC" quebraria ~50 fixtures de teste e alteraria identificadores técnicos. O valor desta story está na **precisão do escopo** (abaixo).

### ✅ Inventário EXATO — o que ALTERAR (strings user-facing em `src/`)

| # | Arquivo | Linha | Hoje | Vira | Tipo |
|---|---------|-------|------|------|------|
| 1 | `src/components/common/Sidebar.tsx` | 52 | `label: "Agente TDEC"` | `` label: `Agente ${BRAND.name}` `` | nav label (visível) |
| 2 | `src/app/(dashboard)/agent/page.tsx` | 32 | `<h1>Agente TDEC</h1>` | `<h1>Agente {BRAND.name}</h1>` | heading (visível) |
| 3 | `src/app/(dashboard)/agent/page.tsx` | 14 | `title: "Agente TDEC - tdec-prospect"` | `` title: `Agente ${BRAND.name} - tdec-prospect` `` | metadata de página (título da aba) |
| 4 | `src/app/(dashboard)/agent/page.tsx` | 2 | comentário `* Pagina do Agente TDEC` | `* Pagina do Agente TDec` | comentário (trivial) |
| 5 | `src/components/agent/AgentOnboarding.tsx` | 22 | `<h2>Agente TDEC</h2>` | `<h2>Agente {BRAND.name}</h2>` | heading (visível) |
| 6 | `src/components/settings/CompanyProfileForm.tsx` | 119 | `placeholder="Ex: TDEC Soluções"` | `` placeholder={`Ex: ${BRAND.name} Soluções`} `` | placeholder (visível) |
| 7 | `src/lib/ai/prompts/defaults.ts` | 351 | `...Na TDEC, ajudamos...` | `...Na TDec, ajudamos...` | exemplo no prompt de IA (literal) |

**Testes a atualizar junto (regressão obrigatória):**
- `__tests__/unit/components/Sidebar.test.tsx` linhas **120**, **130** (assertions) → `'Agente TDec'`; e nomes de `describe`/`it` ~207–223 (clareza).
- `__tests__/unit/components/agent/AgentOnboarding.test.tsx` linhas **16**, **18** → `"Agente TDec"`.

### 🚫 NÃO TOCAR (preservar — fora de escopo / quebraria coisas)

1. **Fixtures/mocks de teste com "TDEC..." = dados de produto/empresa fictícios, NÃO a marca da plataforma.** Estes representam o *produto que um usuário quer prospectar* (entrada de exemplo no fluxo do Agente). Alterá-los não tem benefício e quebra dezenas de testes:
   - `"TDEC Analytics"` — em `use-briefing-flow.test.tsx` (~30 ocorrências), `AgentChat.test.tsx`, `briefing-parse*.test.ts`, `product-parser-service.test.ts`, etc. (input do tipo `"Quero prospectar pro TDEC Analytics"`).
   - `"TDEC Company"` (`CompanyProfileForm.test.tsx`), `"TDEC Tecnologia"` (`email-personalization-variables.test.ts`), `"TDEC Prospect"` (`WhatsAppComposerDialog.test.tsx` mock), `"TDEC"` (`relevance-classifier.test.ts`, `sanitize-ai-output.test.ts`, `product-parser-service.test.ts`).
   - **Regra:** se a string "TDEC" está num `__tests__/**` como **dado** (mock/fixture/input), **não mexer**.
2. **Design-system "TripleD"** (Story 8.4) — `src/components/ui/*.tsx` (ai-unlock-animation, native-magnetic, interactive-timeline, glass-card, animated-list). Nome próprio do design system, **não** é "TDEC". Preservar.
3. **Slug técnico `tdec-prospect`** (lowercase) — nome do projeto/package, aparece em `package.json`, no `metadata.title` ("- tdec-prospect"), etc. Identificador técnico — **preservar**.
4. **Comentário-doc de `brand.ts`** linha 6: `/** Nome da empresa, grafia oficial (NUNCA "TDEC"). */` — referência **intencional** à grafia errada. Preservar.
5. **Seed/infra dev:** `supabase/seed.sql` ("TDEC Test Tenant"), `.env.example`, `README.md` — dados de dev/infra, nunca vistos pelo cliente em produção. Fora de escopo (opcionalmente atualizáveis, mas não é o objetivo).
6. **Comentários SQL** (`00047_create_agent_executions.sql:2`) — não user-facing. Opcional/ignorar.

### Fronteira com a Story 19.3 (NÃO invadir)
- **`src/app/layout.tsx` linha 21** (`title: "TDEC Prospect"`, root `metadata`), **favicon** e **OpenGraph** → **Story 19.3** (FR4). A Story 19.1 reservou explicitamente esse bloco para a 19.3. **NÃO alterar `layout.tsx` aqui.**
- **`src/app/globals.css` linha 7** (comentário `DESIGN SYSTEM TOKENS - TDEC Prospect`) → comentário não user-facing; deixar para a 19.3 ou ignorar.
- **E2E `home.spec.ts:14`** (`toHaveTitle(/TDEC Prospect/)`, **case-sensitive**) → depende do root `metadata` → será ajustado na **19.3**. **Não** alterar agora (e não quebra: o título da página `/` continua vindo do root layout, inalterado nesta story).
- **`auth.spec.ts:40`** e **`LoginPage.test.tsx:67`** usam `/TDEC Prospect/i` (**case-insensitive**) — o login já usa `BRAND.productName` ("TDec Prospect") desde a 19.1; o regex `i` casa "TDec". **Não tocar** (login = 19.1, já feito).

### 🔴 Armadilha do prompt no banco (DB override) — leia antes da Task 5/6
O texto `"Na TDEC, ajudamos empresas..."` aparece em **dois** lugares:
- **Code default:** `src/lib/ai/prompts/defaults.ts:351`.
- **DB global:** `supabase/migrations/00033_add_icebreaker_premium_prompt.sql:72` (insere prompt `ai_prompts` com `tenant_id IS NULL`).

O **PromptManager** ([src/lib/ai/prompt-manager.ts](src/lib/ai/prompt-manager.ts)) resolve em 3 níveis: **tenant → global (DB) → code default**. Se o ambiente tem o prompt global no banco (via migration `00033`), o `defaults.ts` **nunca é usado** para esse prompt → **mudar só o `defaults.ts` não muda a saída renderizada**. Isso é uma armadilha de "falsa conclusão": testar `defaults.ts`, passar, mas o app ainda emite "TDEC". Por isso a Task 6 trata o DB explicitamente. Decisão (A: nova migration de UPDATE / B: deferir) está nas **Open Questions**.

### Prompt: por que literal "TDec" (e não `${BRAND.name}`)
O bloco de prompt em `defaults.ts` é conteúdo textual extenso (exemplos de estilo lidos pela IA). Injetar `${BRAND.name}` acopla o módulo de prompts à constant de marca sem ganho real (é uma string-exemplo, não config de UI) e dificulta o paralelo com a versão do DB. AC #1 diz "**preferencialmente** `BRAND.name`" — soft. Para as **labels/headings de UI**, usar `BRAND.name`; para o **exemplo de prompt**, literal "TDec" é o trade-off correto.

### `BRAND` — fonte de verdade (já existe, Story 19.1)
```ts
// src/lib/constants/brand.ts (commit a1befc3)
export const BRAND = {
  name: "TDec",            // ← usar isto
  productName: "TDec Prospect",
  description: "AI-powered prospecting and outbound sales automation platform",
  logo: { light: "/brand/Logo-TDec-preto.png", dark: "/brand/Logo-TDec-branco.png", alt: "TDec" },
} as const;
```
Alias de import: `@/lib/constants/brand` (`@/*` → `src/*`, ver `tsconfig.json`). Já há teste garantindo `BRAND.name === "TDec"` e que NÃO casa `/TDEC/` (`__tests__/unit/lib/constants/brand.test.ts`).

### Padrões de qualidade do projeto (recorrentes nas Epics 11+ / 19.1)
- **TS `strict: true`** — sem `any`, sem non-null `!` em código novo (code reviews recentes bloqueiam; `@typescript-eslint/no-non-null-assertion: "warn"`).
- **ESLint `no-console`** — só `console.warn`/`console.error`. Zero `console.log`.
- **`npm run build` é gate obrigatório** antes de marcar a story pronta.
- **Tailwind v4** — preferir `flex flex-col gap-*` a `space-y-*` (não relevante aqui, mas vale se mexer em layout).
- Mensagens user-facing em **PT-BR**.

### Project Structure Notes
- Componentes em `src/components/{common,agent,settings}/` (PascalCase, named export). Páginas em `src/app/(dashboard)/.../page.tsx` (Server Components por padrão; `"use client"` só com hooks/interatividade). Constants em `src/lib/constants/`. Testes espelham `src/` em `__tests__/unit/`.
- `Sidebar.tsx` é `"use client"`; `AgentOnboarding.tsx` é `"use client"`; `agent/page.tsx` é Server Component. Importar uma const (`BRAND`) é seguro em todos.
- Nenhum arquivo novo é criado (exceto, **se** Opção A da Task 6, uma nova migration SQL).

### Previous Story Intelligence (Story 19.1 — status `review`)
- **`BRAND` e `<BrandLogo/>` já entregues** (`src/lib/constants/brand.ts`, `src/components/common/BrandLogo.tsx`). Esta story só **consome** `BRAND.name`.
- A 19.1 já fez um **inventário preliminar** das ocorrências "TDEC" e o deixou documentado como "para a 19.2" — esta story **revalidou** esse inventário no código atual (alguns itens da lista da 19.1 já foram resolvidos: o título do login virou `BRAND.productName` na própria 19.1; `layout.tsx` foi reservado para a 19.3).
- **Aprendizado de teste herdado (19.1):** `next/image` não é mockado; `Sidebar.test.tsx` **não** mocka `window.location` (por isso integrar imagem ali funcionou). Para esta story, sem `next/image` novo — risco baixo.
- Padrão de commit do projeto: `{type}({scope}): {descrição}`. Sugestão: `feat(story-19.2): padroniza grafia TDEC -> TDec na UI (consome BRAND.name)`.

### Git Intelligence (commits recentes relevantes)
```
a1befc3 feat(story-19.1): BrandLogo theme-aware + constant BRAND + code review fixes  ← BRAND nasce aqui
8d706fd docs(story-19.1): create story - BrandLogo theme-aware + BRAND constant
00fc441 chore(delivery-prep): brand assets, Epic 19/20 planning e branch 19 setup
```
Branch atual: `epic/19-rebranding-white-label` (base `main`). `baseline_commit` desta story: `a1befc3`.

### Custo / Risco
Zero custo de API. Risco técnico baixo (mudança de texto). Risco principal = **escopo** (não vazar para fixtures/TripleD/slug) e o **DB override** do prompt (Task 6). Ambos endereçados acima.

### References
- Épico: [_bmad-output/planning-artifacts/epic-19-rebranding-white-label.md](_bmad-output/planning-artifacts/epic-19-rebranding-white-label.md) (Story 19.2, FR2, NFR-Q1)
- Story anterior: [_bmad-output/implementation-artifacts/19-1-brandlogo-theme-aware-centralizacao-branding.md](_bmad-output/implementation-artifacts/19-1-brandlogo-theme-aware-centralizacao-branding.md) (constant `BRAND`, inventário preliminar, escopo da 19.2/19.3)
- Constant de marca: [src/lib/constants/brand.ts](src/lib/constants/brand.ts)
- Sites de alteração: [src/components/common/Sidebar.tsx](src/components/common/Sidebar.tsx#L52), [src/app/(dashboard)/agent/page.tsx](<src/app/(dashboard)/agent/page.tsx#L14>), [src/components/agent/AgentOnboarding.tsx](src/components/agent/AgentOnboarding.tsx#L22), [src/components/settings/CompanyProfileForm.tsx](src/components/settings/CompanyProfileForm.tsx#L119), [src/lib/ai/prompts/defaults.ts](src/lib/ai/prompts/defaults.ts#L351)
- DB override: [supabase/migrations/00033_add_icebreaker_premium_prompt.sql](supabase/migrations/00033_add_icebreaker_premium_prompt.sql#L72), [src/lib/ai/prompt-manager.ts](src/lib/ai/prompt-manager.ts)
- Testes de regressão: [__tests__/unit/components/Sidebar.test.tsx](__tests__/unit/components/Sidebar.test.tsx#L120), [__tests__/unit/components/agent/AgentOnboarding.test.tsx](__tests__/unit/components/agent/AgentOnboarding.test.tsx#L16)
- Fronteira 19.3: [src/app/layout.tsx](src/app/layout.tsx#L21), [__tests__/e2e/home.spec.ts](__tests__/e2e/home.spec.ts#L14)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (BMAD dev-story workflow)

### Debug Log References

- `grep -rn "TDEC" src/` (pós-sweep): restam apenas 3 ocorrências conscientes fora de escopo — `globals.css:7` (comentário, 19.3/ignorar), `layout.tsx:21` (root metadata, Story 19.3/FR4), `brand.ts:6` (referência intencional à grafia errada). Nenhuma user-facing nas telas em escopo.
- `npx vitest run` (suíte completa): **357 arquivos, 6100 passed, 2 skipped, 0 regressões**.
- `npm run build`: sucesso (sem erros TS).
- `npx eslint` nos 5 arquivos tocados: exit 0, limpo.
- Testes-alvo de regressão (75 testes): `Sidebar.test.tsx` (48), `AgentOnboarding.test.tsx` (6), `CompanyProfileForm.test.tsx` (15), `brand.test.ts` (6) — todos verdes.

### Completion Notes List

- **Sweep "TDEC" → "TDec" concluído** nas 7 strings user-facing do inventário, consumindo `BRAND.name` (constant da Story 19.1) nas labels/headings de UI (Sidebar, página `/agent`, AgentOnboarding, placeholder do CompanyProfileForm, metadata da página `/agent`). O exemplo no prompt de IA (`defaults.ts:351`) ficou como literal "TDec" (decisão da story: não acoplar prompt à constant de marca).
- **Task 6 (decisão do DB) — Opção A escolhida pelo usuário (Fabossi).** Criada nova migration `supabase/migrations/00052_fix_icebreaker_tdec_branding.sql` com `UPDATE ... SET prompt_template = REPLACE(prompt_template, 'Na TDEC', 'Na TDec') WHERE tenant_id IS NULL AND prompt_key = 'icebreaker_premium_generation'`.
  - ⚠️ **Correção em relação ao SQL sugerido na story:** a coluna correta é **`prompt_template`** (não `content`, como constava no rascunho da Task 6). Verificado contra a migration `00033` e o schema de `ai_prompts`.
  - 🔍 **Intelligence adicional descoberta durante a implementação:** a migration **`00038_deactivate_db_prompts_use_code_defaults.sql`** já desativou TODOS os prompts globais (`is_active = false`). Como o `PromptManager` filtra `.eq("is_active", true)` no Level 2 (global), o prompt global de quebra-gelo **não é mais usado hoje** → o `defaults.ts` (Level 3) é a fonte de verdade renderizada. Portanto: (a) mudar o `defaults.ts` **é** o que afeta a saída atual; (b) a nova migration `00052` não muda nada no estado atual, mas garante **paridade** caso os prompts globais sejam reativados no futuro. A "armadilha do DB override" descrita na story era historicamente real, mas está neutralizada pela `00038`.
- **Preservado (fora de escopo, AC #2/NFR-Q1):** fixtures/mocks de teste com "TDEC..." (não tocados), design-system "TripleD", slug técnico `tdec-prospect`, comentário-doc de `brand.ts`, e a fronteira da Story 19.3 (`layout.tsx` root metadata, favicon/OpenGraph, `globals.css` comment, e2e `home.spec.ts`).
- **Testes de regressão atualizados junto:** `Sidebar.test.tsx` (assertions exatas linhas 120/130 + nomes de describe/it para "TDec"; queries `getByRole(/agente tdec/i)` mantidas — regex case-insensitive já casa "TDec") e `AgentOnboarding.test.tsx` (it + assertion).

### File List

**Código (src/):**
- `src/components/common/Sidebar.tsx` — import `BRAND` + label do nav item `` `Agente ${BRAND.name}` ``
- `src/app/(dashboard)/agent/page.tsx` — import `BRAND`; heading `Agente {BRAND.name}`; metadata `title` com `${BRAND.name}`; comentário de cabeçalho
- `src/components/agent/AgentOnboarding.tsx` — import `BRAND` + heading `Agente {BRAND.name}`
- `src/components/settings/CompanyProfileForm.tsx` — import `BRAND` + placeholder `` `Ex: ${BRAND.name} Soluções` ``
- `src/lib/ai/prompts/defaults.ts` — exemplo de quebra-gelo "Na TDEC" → "Na TDec" (literal)

**Migration (supabase/):**
- `supabase/migrations/00052_fix_icebreaker_tdec_branding.sql` — **NOVO** — UPDATE do prompt global `icebreaker_premium_generation` no DB (Opção A da Task 6)

**Testes (__tests__/):**
- `__tests__/unit/components/Sidebar.test.tsx` — assertions + nomes describe/it "TDEC" → "TDec"
- `__tests__/unit/components/agent/AgentOnboarding.test.tsx` — it + assertion "TDEC" → "TDec"

## Senior Developer Review (AI)

**Reviewer:** Claude (Opus 4.8 — `/code-review`, xhigh effort) — 2026-06-02
**Outcome:** Aprovada — sem mudanças obrigatórias. Story → `done`.

**Escopo revisado:** diff do commit `5ba6dc9` (line-by-line, removed-behavior, cross-file tracer, language-pitfall, verificação da migration SQL + sweep de completude).

**Resultado:**
- ✅ **Zero bugs de correção e zero regressão.** Sweep "TDEC" → "TDec" completo no `src/` (só restam comentários intencionais em `globals.css:7` e `brand.ts:6`). `BRAND.name === "TDec"` confirmado; sem risco de hidratação (valor estático em module-scope, idêntico no server e client).
- ✅ **Migration `00052` válida** — colunas `prompt_template`/`prompt_key`/`tenant_id`/`updated_at` existem (confirmado em `00020`/`00033`); `WHERE tenant_id IS NULL AND prompt_key = '…' AND prompt_template LIKE '%Na TDEC%'` é idempotente e atinge a linha global mesmo desativada pela `00038`. O `updated_at = NOW()` é redundante (trigger `BEFORE UPDATE` já seta), mas segue a convenção do repo (`00038` faz igual) — não é defeito.
- ✅ **Sem quebra de testes/e2e** — nenhum teste ativo referencia as strings alteradas de forma case-sensitive; os hits remanescentes de "TDEC" em `__tests__/` são fixtures preservados (AC #2) e asserts `/TDEC Prospect/i` que ainda casam "TDec Prospect".

**Achados:** 0 CRITICAL, 0 MEDIUM, 1 LOW (deferido).
- **LOW (altitude — deferido para o white-label, Epic 19/20):** nome "TDec" hardcoded como literal em `defaults.ts:351` e espelhado na migration `00052` (`'Na TDec'`) em vez de derivar de `BRAND`. Decisão consciente e documentada na story (Dev Notes → "Prompt: por que literal"). Em deploy white-label, o exemplo few-shot do prompt nomeia o vendor "TDec" e pode eventualmente vazar para o conteúdo gerado por IA. Sem ação nesta story; revisitar quando o conteúdo de IA entrar no escopo do white-label.

**Test Suite (conforme commit):** 357 arquivos, 6100 passed, 2 skipped. Build e lint OK.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-01 | 1.0 | Implementação da Story 19.2 — sweep "TDEC" → "TDec" em 7 strings user-facing (consome `BRAND.name`), nova migration `00052` para paridade do prompt no DB (Opção A), 2 testes de regressão atualizados. Suíte verde (6100), build e lint OK. | Amelia (dev-story) |
| 2026-06-02 | 1.1 | Senior Developer Review (AI) via `/code-review` — Aprovada: 0 bugs / 0 regressão, 1 achado LOW (literal de marca no prompt) deferido para o white-label. Story → `done`. | Claude (Opus 4.8) |
