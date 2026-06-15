---
baseline_commit: 5ba6dc9
---
# Story 19.3: Favicon, título da aba e metadata com a marca TDec

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário da plataforma,
I want que a aba do navegador, o favicon e os previews de link compartilhado reflitam a marca **TDec**,
so that a identidade visual fique consistente também **fora da área de conteúdo** (chrome do navegador e redes sociais), completando o rebranding para a entrega ao cliente.

## Acceptance Criteria

1. **Título da aba (FR4).** O `metadata.title` do **root layout** ([src/app/layout.tsx](src/app/layout.tsx#L21)) deixa de ser a string literal `"TDEC Prospect"` e passa a refletir a marca correta **"TDec Prospect"**, consumindo `BRAND.productName` (fonte única — `src/lib/constants/brand.ts`, Story 19.1). A `description` do root passa a consumir `BRAND.description`.

2. **Favicon TDec (FR4).** O favicon servido deixa de ser o **default do Next.js** (`src/app/favicon.ico`, ícone genérico do template) e passa a ser o ícone da TDec — **`public/brand/tdec-favicon.png`** (32×32, fornecido pelo cliente; ícone azul circular que lê tanto em chrome claro quanto escuro → **ícone único**, sem necessidade de variante por tema). **Não pode sobrar** o favicon default sendo servido em paralelo (ver Dev Notes → "🔴 Armadilha do favicon que não troca").

3. **OpenGraph / preview de link (FR4).** Ao compartilhar um link da aplicação, o preview (OpenGraph) reflete a marca TDec: `openGraph.title`, `openGraph.description`, `openGraph.siteName` (todos via `BRAND`) e uma **imagem** (`openGraph.images`) com a identidade TDec. Um `metadataBase` é definido (a partir de `NEXT_PUBLIC_SITE_URL`) para que a URL da imagem OG resolva como **absoluta** (sem `metadataBase`, o Next 16 emite warning de build e usa `localhost`).

4. **Centralização preservada (FR3).** Os novos caminhos de asset (favicon e imagem OG) são adicionados à constant `BRAND` (não hard-coded em `layout.tsx`), mantendo o ponto único de configuração estabelecido na Story 19.1. O `layout.tsx` referencia `BRAND.*`, nunca strings literais de marca ou de path.

5. **E2E e testes verdes (NFR-Q2).** O teste E2E [__tests__/e2e/home.spec.ts](__tests__/e2e/home.spec.ts#L14) (`toHaveTitle(/TDEC Prospect/)` — **case-sensitive**) é atualizado para `/TDec Prospect/`, pois o título da aba muda nesta story. A suíte de testes completa (`npx vitest run`) e o `npm run build` permanecem **verdes, sem novos erros**. Os testes que usam `/TDEC Prospect/i` (case-insensitive — `auth.spec.ts:40`, `LoginPage.test.tsx:67`) **não** precisam mudar (o regex `i` já casa "TDec"), e **não** devem ser tocados.

6. **Escopo respeitado (NFR-Q1).** O sweep desta story **NÃO** altera: os títulos de página que usam o slug técnico lowercase `tdec-prospect` (`"Leads - tdec-prospect"`, `"Insights - tdec-prospect"`, etc. — ver Dev Notes → "🚫 NÃO TOCAR"), fixtures de teste com `"TDEC Prospect"` como mock data (`WhatsAppComposerDialog.test.tsx`), nem qualquer lógica de negócio. Story 100% cosmética/metadata.

## Tasks / Subtasks

> **Status dos assets:** o **favicon já existe** — `public/brand/tdec-favicon.png` (32×32, fornecido pelo cliente). Falta **apenas a imagem OpenGraph** (1200×630), endereçada na Task 0. Open Questions #1 e #2 (lado favicon) **resolvidas**.

- [x] **Task 0 — Gerar a imagem OpenGraph** (AC: #3) — *resta só a imagem OG; favicon já entregue*
  - [x] Gerar `public/brand/og-image.png` em **1200×630** (logo TDec centralizado sobre fundo de marca sólido — usar `Logo-TDec-branco.png` sobre fundo escuro para máximo contraste/consistência com o tema padrão). **Não** usar o `tdec-favicon.png` como OG (32×32, circular — pequeno/inadequado para preview social).
  - [x] Ferramenta sugerida (Node, sem dependência nova obrigatória — `sharp` se já presente, senão ImageMagick/`squoosh`): documentar o comando usado no Completion Notes para reprodutibilidade.
  - [x] **NÃO** remover os wordmarks (`Logo-TDec-branco.png`/`Logo-TDec-preto.png`) — consumidos pelo `<BrandLogo/>` (19.1) — nem o `tdec-favicon.png`.
  - [x] *Se preferir não criar arte agora:* pode-se omitir `openGraph.images` e entregar apenas o OG textual (title/description/siteName) — registrar a decisão. Mas o ideal de entrega é ter a imagem. **→ Decisão: arte GERADA (caminho ideal), fallback textual NÃO usado.**

- [x] **Task 1 — Estender a constant `BRAND` com os paths de favicon/OG** (AC: #1, #4)
  - [x] Em [src/lib/constants/brand.ts](src/lib/constants/brand.ts), adicionar (sugestão):
    ```ts
    favicon: "/brand/tdec-favicon.png", // 32×32, ícone azul único (lê em chrome claro e escuro)
    ogImage: "/brand/og-image.png",     // 1200×630 (Task 0)
    ```
  - [x] Manter `as const`. Não alterar os campos existentes (`name`, `productName`, `description`, `logo`) — apenas **adicionar**.
  - [x] **Atualizar o teste** [__tests__/unit/lib/constants/brand.test.ts](__tests__/unit/lib/constants/brand.test.ts): adicionar asserts de que `BRAND.favicon` e `BRAND.ogImage` apontam para os assets reais (espelhando o padrão dos asserts de `BRAND.logo.*` já existentes nas linhas 18–24).

- [x] **Task 2 — Root metadata: title, description, metadataBase, icons, openGraph** (AC: #1, #2, #3, #4)
  - [x] Em [src/app/layout.tsx](src/app/layout.tsx#L20), substituir o objeto `metadata` por (consumindo `BRAND`):
    ```ts
    import { BRAND } from "@/lib/constants/brand";

    export const metadata: Metadata = {
      metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
      title: BRAND.productName,
      description: BRAND.description,
      icons: {
        icon: { url: BRAND.favicon, type: "image/png", sizes: "32x32" },
      },
      openGraph: {
        title: BRAND.productName,
        description: BRAND.description,
        siteName: BRAND.productName,
        type: "website",
        locale: "pt_BR",
        images: [{ url: BRAND.ogImage, width: 1200, height: 630, alt: BRAND.name }],
      },
    };
    ```
  - [x] **NÃO** adicionar `title.template` no root (ver Dev Notes → "Não usar title.template"). `title` é string absoluta.
  - [x] `layout.tsx` é Server Component (sem `"use client"`) → `import { BRAND }` e leitura de `process.env.NEXT_PUBLIC_SITE_URL` são seguros aqui.

- [x] **Task 3 — Eliminar o favicon default que sobra** (AC: #2) — *ver Dev Notes → "🔴 Armadilha do favicon"*
  - [x] O Next.js auto-detecta [src/app/favicon.ico](src/app/favicon.ico) (file-convention) e emite `<link rel="icon" href="/favicon.ico">` **independentemente** do `metadata.icons`. Hoje esse arquivo é o **ícone genérico do template Next** (16×16/32×32). Se deixado, o navegador continuará servindo o ícone errado.
  - [x] **Opção recomendada (ADOTADA):** **remover** `src/app/favicon.ico` (via `git rm`) e deixar o controle 100% no `metadata.icons` (Task 2). Validado no HTML do build: `<link rel="icon" href="/brand/tdec-favicon.png">` e **nenhuma** referência a `/favicon.ico` em qualquer página gerada.
  - [x] **Alternativa (NÃO usada):** substituir `src/app/favicon.ico` por um `.ico` da TDec gerado na Task 0 (mantém o file-convention). Se escolher esta, **não** declarar `icons.icon` em paralelo apontando para outro asset, para evitar dois ícones concorrentes.

- [x] **Task 4 — Atualizar o E2E do título** (AC: #5)
  - [x] Em [__tests__/e2e/home.spec.ts](__tests__/e2e/home.spec.ts#L14), trocar `await expect(page).toHaveTitle(/TDEC Prospect/);` por `await expect(page).toHaveTitle(/TDec Prospect/);`.
  - [x] **NÃO** tocar `auth.spec.ts:40` nem `LoginPage.test.tsx:67` (usam `/TDEC Prospect/i` — case-insensitive, já casam "TDec"; além disso testam o **heading** do login, não o `<title>`). → Não tocados.

- [x] **Task 5 — Validação e gate de qualidade** (AC: #1–#6)
  - [x] `npm run build` — **gate obrigatório** do projeto; confirmar que **não há warning de `metadataBase`** (sinal de que o OG image resolve absoluto) e zero erro TS. → EXIT 0, sem warning de metadataBase, sem erro TS.
  - [x] `npx vitest run` — suíte completa **verde** (atenção: `brand.test.ts` com os novos asserts). → 357 files, 6102 passed, 2 skipped.
  - [x] `npm run lint` — sem novos erros/warnings (`no-console`, evitar non-null `!`). → Arquivos da story lintam limpos (EXIT 0); 15 erros/144 warnings restantes são **pré-existentes** (outros arquivos).
  - [x] **Validação manual (`npm run dev`):** → Verificado via HTML do build (`.next/server/app/*.html`) + E2E Playwright (mais determinístico que eyeballing do chrome do SO).
    - Aba do navegador mostra **"TDec Prospect"** (em `/login` e na home).
    - Favicon na aba é o da TDec (testar em tema claro e escuro do SO/navegador — ver se a variante correta aparece).
    - DevTools → Elements `<head>`: `<title>TDec Prospect</title>`, `<meta property="og:title" content="TDec Prospect">`, `<meta property="og:image" content="http://localhost:3000/brand/og-image.png">` (URL absoluta).
    - Opcional: validar o preview OG num validador (ex.: opengraph.xyz) apontando para a URL de preview da Vercel.
  - [x] **E2E (se o runner local estiver configurado):** `npx playwright test home.spec.ts` deve passar com o novo título. → 4/4 passaram (incl. "should load login page with correct title" com `/TDec Prospect/`).

### Review Findings (Senior Developer Review — Amelia, 2026-06-15)

**Veredicto:** Aprovada com ressalvas. **6/6 ACs satisfeitas** (Acceptance Auditor); File List confere; claims das Completion Notes verificadas. **0 bug HIGH** no código mergeado — apenas 1 decisão + 3 patches de hardening. 3 camadas adversariais (Blind Hunter, Edge Case Hunter, Acceptance Auditor), nenhuma falhou.

#### Decisão necessária

- [x] [Review][Decision] **Fallback `/favicon.ico` ausente** — após deletar `src/app/favicon.ico`, requests convencionais a `/favicon.ico` (browsers legados, crawlers, leitores RSS, alguns unfurlers que sondam o path fixo) retornam **404**. Browsers modernos honram `<link rel="icon" type="image/png">`, então a aba funciona normalmente. Opções: (a) gerar um `favicon.ico` TDec a partir do PNG e servir como fallback de máxima compatibilidade; ou (b) manter só PNG (aceitável para stack moderna). `public/brand/README.md` lista `favicon.ico` como slot pretendido. [src/app/favicon.ico (del) + src/app/layout.tsx:27] → **Resolvido 2026-06-15 (decisão do usuário): manter só PNG; 404 convencional aceito para stack moderna.**

#### Patches

- [x] [Review][Patch] **Hardening do `metadataBase` contra `NEXT_PUBLIC_SITE_URL` malformado** — `new URL("dominio-sem-scheme")` lança `TypeError: Invalid URL` em tempo de build (a `metadata` é avaliada no module-eval) → `next build` quebra. Valor sem protocolo (ex.: `tdec.com.br`, `www.tdec.com.br`) é colável por engano no painel da Vercel. Guardar com try/catch + fallback (ou normalização de scheme). **Nota de deploy:** garantir a env setada em prod — senão OG/favicon resolvem para `http://localhost:3000` e o preview social quebra silenciosamente. [src/app/layout.tsx:22]
- [x] [Review][Patch] **`.gitignore` — padrões de credenciais assimétricos** — `docs/**/credentials*.md` e `docs/**/credenciais*.md` cobrem só `docs/`, enquanto `**/credentials.local.md` é global; um `credentials.md` na raiz **não** seria ignorado. Tornar simétrico/global (`**/credentials*.md`, `**/credenciais*.md`). [.gitignore:81]
- [x] [Review][Patch] **File List da story incompleta** — falta a entrada `public/brand/tdec-favicon.png (new)` (primeiro commitado neste range, embora tratado como "entregue pelo cliente"). [story File List]

#### Dismissados (ruído / já correto)

- Asserts "tautológicos" em `brand.test.ts` — seguem o padrão existente do arquivo (`logo.light` etc.); servem de regression guard do contrato `BRAND`.
- `sizes:"32x32"` / `type` "frágeis" — atualmente corretos (favicon verificado 32×32; OG 1200×630); declarar dimensões é prática padrão.
- `||` vs `??` no fallback da env — equivalente funcional para string; nenhuma AC afetada.

## Dev Notes

### Resumo do que construir
**Última story do Epic 19** (rebranding para entrega ao cliente). Fecha o FR4: leva a marca TDec para o **chrome do navegador** (título da aba + favicon) e para o **compartilhamento social** (OpenGraph). É a peça que faltava — a Story 19.1 (logo/`BRAND`) e a 19.2 (sweep "TDEC"→"TDec" no conteúdo) já estão em `review`, e ambas **reservaram explicitamente** este bloco de `metadata`/favicon/OG para a 19.3. Risco técnico baixo; o risco real é (a) o **gap de assets** (favicon/OG não existem) e (b) a **armadilha do favicon default** do Next que continua sendo servido se não for removido.

### ✅ Inventário EXATO — o que ALTERAR

| # | Arquivo | Local | Hoje | Vira |
|---|---------|-------|------|------|
| 1 | `src/lib/constants/brand.ts` | objeto `BRAND` | (sem `favicon`/`ogImage`) | **+** `favicon`, `ogImage` |
| 2 | `src/app/layout.tsx` | `export const metadata` (L20–23) | `title: "TDEC Prospect"` + `description` literal | `metadataBase` + `title: BRAND.productName` + `description: BRAND.description` + `icons` + `openGraph` |
| 3 | `src/app/favicon.ico` | arquivo | ícone **default do Next** | **removido** (ou substituído pelo da TDec) — ver Task 3 |
| 4 | `public/brand/tdec-favicon.png` | **JÁ EXISTE** (32×32, cliente) | — | consumido via `BRAND.favicon` (nada a gerar) |
| 5 | `public/brand/og-image.png` | **NOVO** | — | imagem OG 1200×630 (Task 0) |
| 6 | `__tests__/e2e/home.spec.ts` | L14 | `toHaveTitle(/TDEC Prospect/)` | `toHaveTitle(/TDec Prospect/)` |
| 7 | `__tests__/unit/lib/constants/brand.test.ts` | bloco de asserts | (sem asserts de favicon/og) | **+** asserts `BRAND.favicon` / `BRAND.ogImage` |

### 🚫 NÃO TOCAR (preservar — fora de escopo)

1. **Títulos de página com slug lowercase `tdec-prospect`** — `insights/page.tsx` (`"Insights - tdec-prospect"`), `leads/page.tsx`, `technographic/page.tsx`, `leads/my-leads/page.tsx`. São o **slug técnico** do projeto (preservado pela 19.2, NFR-Q1), **não** a grafia "TDEC" da marca. **Não** são alvo do rebranding e **não** devem virar "TDec Prospect". O `agent/page.tsx` já consome `BRAND.name` (feito na 19.2). Mexer nesses títulos seria scope creep e contraria a decisão da 19.2.
2. **Fixtures de teste com "TDEC Prospect" como mock data** — `__tests__/unit/components/tracking/WhatsAppComposerDialog.test.tsx:46,346` (`company_context: "TDEC Prospect"`). É **dado de entrada fictício** (empresa que o usuário prospecta), não a marca da plataforma. **Não tocar** (regra herdada da 19.2: "TDEC" em `__tests__/**` como dado = preservar).
3. **Testes case-insensitive `/TDEC Prospect/i`** — `auth.spec.ts:40`, `LoginPage.test.tsx:67`. Já casam "TDec" e testam o heading do login (que usa `BRAND.productName` desde a 19.1). **Não tocar.**
4. **Wordmarks `Logo-TDec-branco.png` / `Logo-TDec-preto.png`** — consumidos pelo `<BrandLogo/>` (19.1). **Não remover nem renomear.** Os novos ícones quadrados são **adicionais**.
5. **Comentário `globals.css:7`** (`DESIGN SYSTEM TOKENS - TDEC Prospect`) — comentário não user-facing; opcional, fora do objetivo desta story (pode ser trocado para "TDec Prospect" se quiser, mas não é AC).

### Next.js 16 Metadata API — pontos críticos (versão do projeto: **next 16.1.6**, react 19.2.3)

- **`metadataBase` é obrigatório para OG image absoluta.** Sem ele, o Next 16 loga `metadata.metadataBase is not set ... using "http://localhost:3000"` no build e a `og:image` sai relativa/localhost. Usar `new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")`. A env `NEXT_PUBLIC_SITE_URL` **já existe** no projeto (`.env.example`; usada em `actions/team.ts:197` e `forgot-password/page.tsx:45`), default `http://localhost:3000`, prod = URL da Vercel. **Reutilizar essa env — não criar uma nova.**
- **Favicon único (sem media query).** O cliente entregou um ícone **azul circular** (`tdec-favicon.png`, 32×32) que lê em chrome claro e escuro — **não** precisa de variante por tema. Declarar um `icons.icon` simples (objeto único), não array com `media`. (O caminho via `metadata.icons` é preferível ao file-convention puro por ser **centralizável em `BRAND`** — FR3.)
- **File-convention vs. `metadata.icons`.** O Next auto-detecta `app/favicon.ico`, `app/icon.{png,svg}`, `app/apple-icon.png`, `app/opengraph-image.png` e gera as tags automaticamente. Esses arquivos **coexistem** com `metadata.icons`/`metadata.openGraph` declarados — podendo gerar **tags duplicadas/conflitantes**. Por isso a Task 3 trata o `favicon.ico` default explicitamente.

### Favicon — ícone único que lê nos dois fundos
A aba do navegador (chrome) tem cor própria conforme o tema do SO/navegador — **independente** do tema da app. Por isso um logo puro **preto** somre no chrome escuro e um **branco** no claro. O ícone fornecido (`tdec-favicon.png`) é **azul colorido**, então tem contraste suficiente em ambos os fundos → **um único favicon resolve**, sem necessidade da abordagem theme-aware do `<BrandLogo/>`.

### 🔴 Armadilha do favicon que não troca (leia antes da Task 3)
O arquivo `src/app/favicon.ico` é o **ícone genérico do template Next** (confirmado: `.ico` multi-res 16×16/32×32, criado no project-init). O Next.js **sempre** o serve via file-convention (`<link rel="icon" href="/favicon.ico">`), mesmo que você defina `metadata.icons` apontando para outro asset. **Resultado clássico:** você muda o `metadata`, builda, e a aba **continua** mostrando o ícone antigo (e ainda há cache de favicon agressivo do navegador). **Solução:** remover (ou substituir) o `app/favicon.ico` e validar no DevTools que não há mais request a `/favicon.ico`. Limpar cache / hard-reload ao validar manualmente.

### Não usar `title.template`
Tentação natural: criar `title: { default: "TDec Prospect", template: "%s | TDec Prospect" }` no root. **NÃO fazer.** As páginas internas (`leads`, `insights`, `technographic`, `my-leads`, `agent`) já definem `title` **absoluto** terminando em `- tdec-prospect`. Com um template no root, esses títulos virariam `"Leads - tdec-prospect | TDec Prospect"` (duplo-brand, feio) e seria uma mudança não pedida em 5 páginas. Manter o root `title` como **string absoluta** (`BRAND.productName`) — aplica-se apenas às rotas sem título próprio (login, home redirect, error/not-found).

### `BRAND` — fonte de verdade (Story 19.1, a estender nesta story)
```ts
// src/lib/constants/brand.ts (commit a1befc3) — estado ATUAL
export const BRAND = {
  name: "TDec",
  productName: "TDec Prospect",
  description: "AI-powered prospecting and outbound sales automation platform",
  logo: { light: "/brand/Logo-TDec-preto.png", dark: "/brand/Logo-TDec-branco.png", alt: "TDec" },
} as const;
// Esta story ADICIONA: icon: { light, dark }, ogImage. NÃO altera os campos acima.
```
Alias de import: `@/lib/constants/brand` (`@/*` → `src/*`). Há teste garantindo `name === "TDec"` e que NÃO casa `/TDEC/` (`brand.test.ts`).

### Padrões de qualidade do projeto (recorrentes nas Epics 11+ / 19.1 / 19.2)
- **TS `strict: true`** — sem `any`, sem non-null `!` em código novo.
- **ESLint `no-console`** — só `console.warn`/`console.error`.
- **`npm run build` é gate obrigatório** antes de marcar a story pronta.
- Mensagens user-facing em **PT-BR**; metadata pode ser em PT/EN (a `description` atual é EN — manter `BRAND.description`).
- Tailwind v4 — `flex flex-col gap-*` (não relevante aqui; sem mudança de layout).

### Project Structure Notes
- `src/app/layout.tsx` = root layout, **Server Component** (sem `"use client"`). Único lugar onde root `metadata` é definido. Já importa `ThemeProvider`/`QueryProvider`/`Toaster` e tem um script inline anti-FOUC de tema (não tocar nesse script).
- Assets estáticos servidos de `public/` → URL `/...` (ex.: `public/brand/og-image.png` → `/brand/og-image.png`). Convenção de nomes de marca documentada em [public/brand/README.md](public/brand/README.md) (atualizar o README com os novos ícones/OG é um plus opcional).
- Nenhum arquivo de código novo (apenas estende `brand.ts` e `layout.tsx`); arquivos **novos** são apenas os assets em `public/brand/` (Task 0) e, no teste, asserts adicionais.

### Previous Story Intelligence (Stories 19.1 e 19.2 — ambas `review`)
- **19.1** criou `BRAND` (`src/lib/constants/brand.ts`) e `<BrandLogo/>` theme-aware. Reservou explicitamente `layout.tsx` root metadata + favicon + OpenGraph para a **19.3** (esta).
- **19.2** fez o sweep "TDEC"→"TDec" no conteúdo. Seu bloco **"Fronteira com a Story 19.3"** confirma, palavra por palavra, o escopo desta story:
  - `src/app/layout.tsx` L21 (`title: "TDEC Prospect"`), favicon e OpenGraph → **19.3** (não foram tocados na 19.2).
  - `globals.css:7` comentário → 19.3 ou ignorar (não user-facing).
  - `home.spec.ts:14` (`/TDEC Prospect/` **case-sensitive**) → "será ajustado na 19.3" (esta story, Task 4).
  - `auth.spec.ts:40` / `LoginPage.test.tsx:67` (`/i`) → **não tocar** (já casam "TDec").
- **Aprendizado de teste herdado:** `next/image` não é mockado nos testes; mas esta story não usa `next/image` (assets via `metadata`/`public/`) → risco de teste baixo. O único teste a atualizar de fato é `home.spec.ts` (E2E) + os asserts novos em `brand.test.ts`.
- Padrão de commit: `{type}({scope}): {descrição}`. Sugestão: `feat(story-19.3): favicon, titulo e OpenGraph com a marca TDec (consome BRAND)`.

### Git Intelligence (commits recentes relevantes)
```
5ba6dc9 feat(story-19.2): padroniza grafia TDEC -> TDec na UI (consome BRAND.name)   ← baseline desta story (HEAD)
a1befc3 feat(story-19.1): BrandLogo theme-aware + constant BRAND + code review fixes  ← BRAND nasce aqui
8d706fd docs(story-19.1): create story - BrandLogo theme-aware + BRAND constant
00fc441 chore(delivery-prep): brand assets, Epic 19/20 planning e branch 19 setup     ← wordmarks chegam em public/brand/
```
Branch atual: `epic/19-rebranding-white-label` (base `main`). `baseline_commit`: `5ba6dc9`.

### Custo / Risco
Zero custo de API. Risco técnico baixo. Riscos principais: (1) **gap de assets** favicon/OG — endereçado na Task 0 + Open Question #1; (2) **favicon default persistente** — endereçado na Task 3 + nota "Armadilha"; (3) **`metadataBase` ausente** → OG image quebrada no preview — endereçado na Task 2.

### References
- Épico: [_bmad-output/planning-artifacts/epic-19-rebranding-white-label.md](_bmad-output/planning-artifacts/epic-19-rebranding-white-label.md) (Story 19.3, FR4, NFR-C1/Q2)
- Story 19.1: [_bmad-output/implementation-artifacts/19-1-brandlogo-theme-aware-centralizacao-branding.md](_bmad-output/implementation-artifacts/19-1-brandlogo-theme-aware-centralizacao-branding.md) (constant `BRAND`, reserva do metadata/favicon/OG para a 19.3)
- Story 19.2: [_bmad-output/implementation-artifacts/19-2-padronizacao-nome-tdec.md](_bmad-output/implementation-artifacts/19-2-padronizacao-nome-tdec.md) (seção "Fronteira com a Story 19.3")
- Constant de marca: [src/lib/constants/brand.ts](src/lib/constants/brand.ts) · teste: [__tests__/unit/lib/constants/brand.test.ts](__tests__/unit/lib/constants/brand.test.ts)
- Alvo principal: [src/app/layout.tsx](src/app/layout.tsx#L20) · favicon default: [src/app/favicon.ico](src/app/favicon.ico)
- Assets de marca: [public/brand/](public/brand/) · convenção: [public/brand/README.md](public/brand/README.md)
- E2E a atualizar: [__tests__/e2e/home.spec.ts](__tests__/e2e/home.spec.ts#L14)
- Env do site URL: `NEXT_PUBLIC_SITE_URL` (`.env.example`; uso em [src/actions/team.ts](src/actions/team.ts#L197))
- Next.js 16 Metadata API: https://nextjs.org/docs/app/api-reference/functions/generate-metadata (campos `metadataBase`, `icons`, `openGraph`)

## Open Questions

1. ~~**Origem dos assets de favicon.**~~ **✅ RESOLVIDA** — o cliente entregou `public/brand/tdec-favicon.png` (32×32, ícone azul). Story usa esse asset diretamente via `BRAND.favicon`.
2. ~~**Variante única vs. theme-aware no favicon.**~~ **✅ RESOLVIDA** — ícone único (o azul lê em chrome claro e escuro), sem media-query.
3. **Imagem OpenGraph (Task 0).** Resta gerar `public/brand/og-image.png` (1200×630). Recomendado gerar a partir do `Logo-TDec-branco.png` sobre fundo escuro. Alternativa de menor esforço: omitir `openGraph.images` e entregar só o OG textual. Confirmar preferência (gerar imagem vs. só texto).
4. **`apple-icon` / PWA manifest fora de escopo?** As ACs cobrem favicon + título + OG. `apple-icon.png` (home-screen iOS) e `manifest.webmanifest` (PWA) **não** estão nas ACs — proposto **deixar de fora** (evitar scope creep). O `tdec-favicon.png` (32×32) é pequeno para apple-icon (ideal 180×180), então incluir exigiria novo asset. Confirmar se fica fora.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / bmad-dev-story)

### Debug Log References

- `npx vitest run __tests__/unit/lib/constants/brand.test.ts` — RED inicial (2 falhas: `BRAND.favicon`/`BRAND.ogImage` undefined) → GREEN após estender `BRAND` (8/8).
- `npx vitest run` — suíte completa: **357 files, 6102 passed, 2 skipped**.
- `npm run build` — **EXIT 0**, "Compiled successfully", **sem** warning de `metadataBase`, 0 erro TS.
- `npx eslint <4 arquivos da story>` — **EXIT 0** (limpo). `npm run lint` global: 15 errors / 144 warnings **pré-existentes** em arquivos não tocados por esta story.
- `npx playwright test home.spec.ts` — **4/4 passed** (inclui o título atualizado).
- Verificação do `<head>` no HTML do build (`.next/server/app/{login,index}.html`): `<title>TDec Prospect</title>`, `og:image` = `http://localhost:3000/brand/og-image.png` (absoluto), `rel="icon"` → `/brand/tdec-favicon.png`, **zero** `/favicon.ico` em qualquer página.

### Completion Notes List

- **Task 0 — OG image gerada (caminho ideal, não o fallback textual).** `public/brand/og-image.png` 1200×630, logo branco (`Logo-TDec-branco.png`) centralizado sobre fundo `#0A0A0A` (cor `--background` do tema dark, p/ consistência). Gerada com **`sharp`** (já presente — sem dependência nova). Comando reproduzível:
  ```bash
  node -e "const sharp=require('sharp');const W=1200,H=630,logoW=720;(async()=>{const logo=await sharp('public/brand/Logo-TDec-branco.png').resize({width:logoW}).toBuffer();const m=await sharp(logo).metadata();const top=Math.round((H-m.height)/2);const left=Math.round((W-logoW)/2);await sharp({create:{width:W,height:H,channels:4,background:{r:10,g:10,b:10,alpha:1}}}).composite([{input:logo,top,left}]).png().toFile('public/brand/og-image.png');})();"
  ```
- **Task 1 — `BRAND` estendido** com `favicon: "/brand/tdec-favicon.png"` e `ogImage: "/brand/og-image.png"` (mantido `as const`; campos existentes intactos). Teste `brand.test.ts` ganhou 2 asserts (RED→GREEN).
- **Task 2 — Root metadata** em `layout.tsx` agora consome `BRAND` (sem strings literais): `metadataBase` via `NEXT_PUBLIC_SITE_URL` (env reutilizada), `title`/`description`, `icons.icon` (objeto único — favicon azul único), `openGraph` (title/description/siteName/type/locale/images). **Sem `title.template`** (preserva os títulos `- tdec-prospect` das páginas internas). Bônus: Next 16 auto-gerou as tags `twitter:*` (`summary_large_image`) a partir do `openGraph`.
- **Task 3 — Favicon default eliminado.** `src/app/favicon.ico` (ícone genérico do template Next) removido via `git rm`. Controle 100% no `metadata.icons`. Confirmado no build: nenhum `/favicon.ico` servido.
- **Task 4 — E2E** `home.spec.ts:14`: `/TDEC Prospect/` → `/TDec Prospect/`. `auth.spec.ts`/`LoginPage.test.tsx` (case-insensitive) e fixtures `WhatsAppComposerDialog.test.tsx` **não** tocados (AC #6).
- **Open Question #4** (apple-icon / PWA manifest): mantido **fora de escopo** conforme a story (não está nas ACs; evitar scope creep).
- **Validação manual:** feita por inspeção do HTML do build + E2E Playwright (determinístico) em vez de eyeballing do chrome do SO — todos os sinais (título, favicon link, og:image absoluto) confirmados.

### File List

- `src/lib/constants/brand.ts` — (mod) +`favicon`, +`ogImage`
- `src/app/layout.tsx` — (mod) import `BRAND`; novo objeto `metadata` (metadataBase/title/description/icons/openGraph); **[review P1]** `metadataBase` agora via helper resiliente `resolveMetadataBase()` (guarda contra `NEXT_PUBLIC_SITE_URL` malformado)
- `src/app/favicon.ico` — (del) favicon default do Next removido
- `public/brand/og-image.png` — (new) imagem OpenGraph 1200×630
- `public/brand/tdec-favicon.png` — (new) favicon 32×32 da TDec (entregue pelo cliente; servido via `BRAND.favicon`)
- `__tests__/unit/lib/constants/brand.test.ts` — (mod) +2 asserts (`favicon`/`ogImage`)
- `__tests__/e2e/home.spec.ts` — (mod) regex do título `/TDEC Prospect/` → `/TDec Prospect/`
- `.gitignore` — (mod) **[review P2]** padrões de credenciais globais/simétricos (`**/credentials*.md`, `**/credenciais*.md`)

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-01 | 0.1 | Criação da Story 19.3 (context engine) — favicon + título da aba + OpenGraph com a marca TDec, consumindo/estendendo `BRAND`. Inventário exato (8 itens), Next 16 Metadata API, armadilha do favicon default, fronteira herdada das 19.1/19.2 e 3 Open Questions (gap de assets). | Bob (create-story) |
| 2026-06-01 | 0.2 | Cliente entregou `public/brand/tdec-favicon.png` (32×32, azul). OQ #1/#2 resolvidas → favicon único (sem theme-aware/media-query); `BRAND` passa a expor `favicon` (não `icon{light,dark}`); Task 0 reduzida só à imagem OG; inventário e metadata atualizados. | Bob (create-story) |
| 2026-06-01 | 1.0 | Implementação completa (dev-story). OG image 1200×630 gerada (sharp), `BRAND` estendido, root metadata consumindo `BRAND` (title/metadataBase/icons/openGraph), favicon default removido, E2E do título atualizado. Build verde (sem warning metadataBase), vitest 6102 verde, E2E 4/4, lint limpo nos arquivos da story. Status → review. | Amelia (dev-story) |
