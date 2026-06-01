---
baseline_commit: 8d706fd8e7f50bcc1fc222b4aecc0a49848890d7
---
# Story 19.1: Componente BrandLogo theme-aware + centralização do branding

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário da plataforma,
I want ver o logo da TDec sempre legível, trocando automaticamente conforme o tema claro/escuro,
so that a identidade visual fique correta e profissional em qualquer modo.

## Acceptance Criteria

1. **Componente único + fonte de verdade (FR1, FR3).** Existe um componente único `<BrandLogo/>` responsável por exibir o logo, e o nome da marca + os caminhos dos assets vêm de uma constant `BRAND` (fonte única de verdade). `BRAND.name` usa a grafia oficial **"TDec"** (nunca "TDEC").

2. **Tema escuro → logo branco.** Com o tema **ESCURO** ativo, o `<BrandLogo/>` exibe o logo **BRANCO** (`/brand/Logo-TDec-branco.png`).

3. **Tema claro → logo preto.** Com o tema **CLARO** ativo, o `<BrandLogo/>` exibe o logo **PRETO** (`/brand/Logo-TDec-preto.png`).

4. **Troca automática + sem FOUC.** Ao alternar o tema com a aplicação aberta, o logo troca automaticamente para a variante correta sem reload, **e não há flash/FOUC do logo errado durante o carregamento inicial** (nem para usuários em tema claro).

5. **Integração no Header e no login, sem regressão.** O `<BrandLogo/>` é exibido no Header (app shell autenticado) e na página de login, ambos usando o **mesmo** componente, sem regressão de layout/alinhamento e sem quebrar a suíte de testes existente.

## Tasks / Subtasks

- [x] **Task 1 — Criar a constant `BRAND` (fonte única de marca)** (AC: #1, #2, #3)
  - [x] Criar `src/lib/constants/brand.ts` exportando `export const BRAND = { ... } as const` com: `name: "TDec"`, `productName: "TDec Prospect"`, `description` (manter a atual), e `logo: { light, dark, alt }` apontando para os assets reais em `/brand/` (ver Dev Notes → "Assets" para os nomes exatos).
  - [x] (RED) Criar `__tests__/unit/lib/constants/brand.test.ts` com testes que falham antes da implementação: `BRAND.name === "TDec"`, `BRAND.name` NÃO casa `/TDEC/`, `BRAND.logo.dark === "/brand/Logo-TDec-branco.png"`, `BRAND.logo.light === "/brand/Logo-TDec-preto.png"`.
  - [x] (GREEN) Implementar a constant até os testes passarem.

- [x] **Task 2 — Criar o componente `<BrandLogo/>` theme-aware (abordagem CSS, FOUC-free)** (AC: #1, #2, #3, #4)
  - [x] Criar `src/components/common/BrandLogo.tsx`. **NÃO** usar `"use client"` e **NÃO** chamar `useTheme()` — a troca é 100% via CSS (variante `dark:` do Tailwind). Ver Dev Notes → "Decisão técnica: por que CSS e não JS".
  - [x] Renderizar **as duas** variantes (`next/image`) lendo os caminhos de `BRAND.logo`: a branca com classe de visibilidade `hidden dark:block`, a preta com `block dark:hidden`. Ambas com `alt={BRAND.logo.alt}`. Aceitar prop `className` (controla tamanho), mesclando com `cn()` de `@/lib/utils`.
  - [x] Obter as **dimensões intrínsecas reais** dos PNGs e usá-las em `width`/`height` do `next/image` (preserva proporção e evita warning de aspect-ratio). Tamanho de exibição via `className` (`h-* w-auto`). → 1400×750.
  - [x] (RED) Criar `__tests__/unit/components/BrandLogo.test.tsx` que falha antes da implementação: renderiza 2 imagens com `alt` da marca; a branca tem `src` contendo `Logo-TDec-branco` e classe `dark:block`/`hidden`; a preta tem `src` contendo `Logo-TDec-preto` e classe `dark:hidden`/`block`. **Usar `toContain` no `src`** (ver Dev Notes → "Testes").
  - [x] (GREEN) Implementar até os testes passarem.

- [x] **Task 3 — Integrar `<BrandLogo/>` no app shell autenticado (topo do Sidebar)** (AC: #5)
  - **⚠️ Mudança de escopo pós-feedback do usuário (review 2026-06-01):** o ponto de integração mudou do **Header** para o **topo do `Sidebar`** (maior, ocupando a largura, como os itens do menu). O `Header.tsx` e `Header.test.tsx` foram **revertidos ao estado original** (sem diff líquido — confirmar com `git diff`). AC #5 ("exibido no app shell autenticado") continua satisfeito: o Sidebar É o app shell. **NÃO recolocar o logo no Header.**
  - [x] Em `src/components/common/Sidebar.tsx`, inserir `<BrandLogo />` em um bloco no **topo** do `<aside>` (antes do `<nav>`); reduzir `nav` `pt-[80px]`→`pt-2`. Expandido: `className="h-auto w-[85%]"`. Colapsado (64px): `className="h-6 w-auto"` centralizado. Importar de `@/components/common/BrandLogo`.
  - [x] (RED→GREEN) Rodar `__tests__/unit/components/Sidebar.test.tsx`; adicionar asserção de que o logo aparece (`getAllByAltText`) nos estados expandido e colapsado. → 2 testes adicionados; 48/48 verde; AppShell (14) sem regressão. (`Sidebar.test.tsx` NÃO mocka `window.location`, então o `next/image` resolve `new URL` sem o problema "Invalid URL" que apareceu na 1ª tentativa no Header.)

- [x] **Task 4 — Integrar `<BrandLogo/>` na página de login** (AC: #5)
  - [x] Em `src/app/(auth)/login/page.tsx` (bloco linhas 100-105), substituir o `<h1>TDEC Prospect</h1>` visível por `<BrandLogo className="mx-auto h-24 w-auto" />` (tamanho `h-24` ajustado de `h-12` por feedback do usuário — estava pequeno), mantendo o subtítulo `<p>`. Preservar a semântica de heading com um `<h1 className="sr-only">{BRAND.productName}</h1>` (acessibilidade + compatibilidade do teste existente). Importar `BRAND` e `BrandLogo`.
  - [x] (RED→GREEN) Rodar `__tests__/unit/components/LoginPage.test.tsx`. **Atenção (regressão):** o teste na linha 67 faz `getByRole("heading", { name: /TDEC Prospect/i })`. Com o `<h1 className="sr-only">{BRAND.productName}</h1>` = "TDec Prospect", o regex case-insensitive ainda casa e o teste passa. Confirmar; ajustar o teste apenas se a abordagem de heading mudar. → 19/19 verde, sem ajuste de teste necessário.

- [x] **Task 5 — Validação e gate de qualidade** (AC: #1-#5)
  - [x] `npm run build` (gate obrigatório do projeto — sem erros TS). → "✓ Compiled successfully", build completo sem erros.
  - [x] `npx vitest run` — suíte completa verde, **zero regressão** (atenção a Header, LoginPage, AppShell, Sidebar). → 357 arquivos, 6098 passed / 2 skipped / 0 falhas.
  - [x] `npm run lint` — sem erros (atenção a `no-console` e evitar non-null assertion `!`). → Arquivos desta story: **0 erros, 0 novos warnings**. (Os 15 erros/147 warnings do repo são pré-existentes em arquivos não tocados.)
  - [x] Validação manual rápida: em tema escuro vê logo branco; em tema claro vê logo preto; alternar tema troca na hora; recarregar em tema claro NÃO mostra flash do logo branco. → Validado no browser (prod build): `<html class="dark">` mostra logo branco (display:block) e preto oculto; `<html class="light">` mostra logo preto e branco oculto. Classe do tema aplicada antes do paint (script inline) → sem FOUC. Screenshots: story-19.1-login-dark-white-logo.png, story-19.1-login-light-black-logo.png.

## Dev Notes

### Resumo do que construir
Três entregáveis pequenos e bem isolados: (1) a constant `BRAND` em `src/lib/constants/brand.ts`; (2) o componente `src/components/common/BrandLogo.tsx`; (3) fiação do componente no Header e no login. Feature 100% cosmética — **não toca nenhuma lógica de negócio**.

### 🚨 Decisão técnica: por que CSS (e NÃO `useTheme`) — chave para o AC #4 (sem FOUC)
O projeto **não usa `next-themes`**. O tema é um provider custom em [src/components/common/ThemeProvider.tsx](src/components/common/ThemeProvider.tsx):
- Hook `useTheme()` retorna `{ theme: "dark" | "light", setTheme, toggleTheme }` — `theme` já é o valor resolvido.
- **Porém** `getServerThemeSnapshot()` retorna **sempre `"dark"`** ([ThemeProvider.tsx:69-71](src/components/common/ThemeProvider.tsx#L69-L71)) e o `useSyncExternalStore` só sincroniza o tema real **depois** da hidratação ([ThemeProvider.tsx:90-94](src/components/common/ThemeProvider.tsx#L90-L94)).
- **Consequência:** um logo condicional em JS (`theme === "dark" ? branco : preto`) renderiza o logo **branco** no SSR e no primeiro paint. Para um usuário em tema **claro**, o script inline já pintou o fundo claro, mas o logo só viraria preto após o React sincronizar → **flash do logo branco sobre fundo claro = FOUC**. Isso **viola o AC #4**.

**Abordagem correta (FOUC-free):** renderizar **as duas** imagens e alternar por **CSS** com a variante `dark:` do Tailwind. O script inline de [src/app/layout.tsx:31-52](src/app/layout.tsx#L31-L52) aplica `.dark`/`.light` no `<html>` **antes do primeiro paint** (`<html lang="pt-BR" suppressHydrationWarning>`), e a variante `dark` está definida em [src/app/globals.css:4](src/app/globals.css#L4) como `@custom-variant dark (&:is(.dark *))`. Como o CSS resolve qual imagem mostrar já no primeiro paint (sem depender de JS/hidratação), **não há FOUC** e a troca ao alternar tema é instantânea (a classe muda no `<html>`, o CSS reage). Por isso o componente é **server-safe** (sem `"use client"`).

Padrão de referência de renderização condicional por tema já existente: [src/components/common/ThemeToggle.tsx](src/components/common/ThemeToggle.tsx) (este usa JS para um ícone — aceitável para ícone, mas para o logo seguimos CSS pelo motivo de FOUC acima).

Mapeamento de visibilidade (default do app é tema **dark**):
- Logo **branco** (`BRAND.logo.dark`) → visível só no escuro → `className="hidden dark:block"`.
- Logo **preto** (`BRAND.logo.light`) → visível só no claro → `className="block dark:hidden"`.

Trade-off aceito: as duas PNGs (~90KB cada) carregam. ⚠️ **Correção de review:** o `<img>` oculto via `display:none` NÃO seria baixado com o lazy-loading padrão do `next/image` (sem layout box → nunca intersecta o viewport), o que causaria flash de logo ausente no 1º toggle de tema. Por isso ambas as `<Image>` usam `priority` (precarrega as duas + melhora o LCP do logo above-the-fold). Otimização futura possível com SVG/`<picture>` (o README de `public/brand/` já prevê SVG) — eliminaria a 2ª imagem.

### Assets (fonte de verdade = README, não o épico)
Arquivos reais já presentes em [public/brand/](public/brand/):
- `Logo-TDec-branco.png` → logo **branco**, tema **escuro**.
- `Logo-TDec-preto.png` → logo **preto**, tema **claro**.
- ⚠️ O texto do épico citou nomes placeholder `tdec-logo-white`/`tdec-logo-dark`. **Ignore** — use os nomes reais acima (ver [public/brand/README.md](public/brand/README.md)). Referencie por caminho público (`/brand/<arquivo>`), nunca import relativo.

### Implementação de referência (seguir a house style)

`src/lib/constants/brand.ts`:
```ts
/**
 * BRAND — fonte única de verdade da identidade de marca (Epic 19).
 * Centraliza nome e assets para facilitar white-label/renomeações.
 */
export const BRAND = {
  /** Nome da empresa, grafia oficial (NUNCA "TDEC"). */
  name: "TDec",
  /** Nome do produto (título). */
  productName: "TDec Prospect",
  description: "AI-powered prospecting and outbound sales automation platform",
  logo: {
    /** Logo preto — usado no tema CLARO (fundo claro). */
    light: "/brand/Logo-TDec-preto.png",
    /** Logo branco — usado no tema ESCURO (fundo escuro). */
    dark: "/brand/Logo-TDec-branco.png",
    alt: "TDec",
  },
} as const;
```
Padrão de constants do projeto: named `export const ... as const` (ver [src/lib/constants/error-codes.ts](src/lib/constants/error-codes.ts)). Alias de import `@/*` → `src/*` ([tsconfig.json](tsconfig.json) `paths`).

`src/components/common/BrandLogo.tsx` (esboço — substituir LARGURA/ALTURA pelas dimensões reais dos PNGs):
```tsx
// SEM "use client" e SEM useTheme: troca via CSS (variante dark:) → zero FOUC.
import Image from "next/image";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/constants/brand";

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <>
      {/* Logo branco — visível só no tema escuro */}
      <Image
        src={BRAND.logo.dark}
        alt={BRAND.logo.alt}
        width={LARGURA}
        height={ALTURA}
        className={cn("hidden w-auto dark:block", className)}
      />
      {/* Logo preto — visível só no tema claro */}
      <Image
        src={BRAND.logo.light}
        alt={BRAND.logo.alt}
        width={LARGURA}
        height={ALTURA}
        className={cn("block w-auto dark:hidden", className)}
      />
    </>
  );
}
```
Convenção de `next/image` para asset estático: import default `Image`, `width`/`height` explícitos, `alt` obrigatório, `className` para tamanho. Ref. real: [src/components/insights/InsightsTable.tsx:82-89](src/components/insights/InsightsTable.tsx#L82-L89). [next.config.ts](next.config.ts) não tem config de `images` (defaults). `cn` vem de `@/lib/utils`.

> A11y: as duas `<img>` têm o mesmo `alt`, mas como exatamente uma está sempre em `display:none` (via `hidden`/`dark:hidden`), o leitor de tela anuncia só a visível — sem duplicação.

### Sites de integração (estado atual lido)
- **Header** — [src/components/common/Header.tsx:46-47](src/components/common/Header.tsx#L46-L47): slot esquerdo já reservado e **vazio** (`<div className="flex items-center" />`). É o ponto de inserção. Header é `"use client"`, `h-16`, `role="banner"`.
- **Login** — [src/app/(auth)/login/page.tsx:99-105](<src/app/(auth)/login/page.tsx#L99-L105>): hoje mostra o texto `<h1 className="text-2xl font-bold tracking-tight">TDEC Prospect</h1>` + subtítulo, dentro de card `max-w-[400px]` ([(auth)/layout.tsx](<src/app/(auth)/layout.tsx>)).
- ⚠️ **Discrepância com o épico:** o AC do épico assume que "o logo aparece no Header e no login" e que o componente "substitui as ocorrências atuais". Na prática **não há logo hoje** — o Header tem slot vazio e o login mostra só texto. Interpretação para esta story: **adicionar** o `<BrandLogo/>` nesses dois locais (no login, no lugar do texto do título).

### Escopo — o que NÃO fazer nesta story (evitar overlap)
- **NÃO** fazer o sweep global "TDEC" → "TDec" na UI — isso é a **Story 19.2**. Exceção pontual permitida: o título do login passa a usar `{BRAND.productName}` (acoplado à troca do logo neste mesmo bloco).
- **NÃO** alterar o `metadata` de [src/app/layout.tsx:20-23](src/app/layout.tsx#L20-L23) (`title`/`description`) nem favicon/OpenGraph — isso é a **Story 19.3** (a constant `BRAND` fica pronta para ela consumir).
- Inventário de ocorrências "TDEC" (para a 19.2, NÃO mexer agora): `Sidebar.tsx:51` ("Agente TDEC"), `agent/page.tsx:14,32`, `AgentOnboarding.tsx:22`, `CompanyProfileForm.tsx:119` (placeholder), `login/page.tsx:101`, `layout.tsx:21`, `lib/ai/prompts/defaults.ts:351`. **Não confundir** com "TripleD" (design system, Story 8.4 — preservar) nem com comentários técnicos.

### Testes
- Framework: Vitest + Testing Library, ambiente `happy-dom`, setup em [__tests__/setup.ts](__tests__/setup.ts). Testes de componentes ficam direto em `__tests__/unit/components/` (não há subpasta `common/`). Espelhar para `lib`: `__tests__/unit/lib/constants/brand.test.ts`.
- **`next/image` NÃO é mockado** nos testes do projeto → renderiza `<img>` real e o `src` vira URL otimizada (`/_next/image?url=%2Fbrand%2FLogo-TDec-branco.png&...`). Portanto **asserte `src` com `toContain("Logo-TDec-branco")`**, nunca com igualdade exata.
- Padrões de mock de tema (se precisar) em [__tests__/unit/components/ThemeProvider.test.tsx](__tests__/unit/components/ThemeProvider.test.tsx) (localStorage + matchMedia). Para o `<BrandLogo/>` CSS-based **não é necessário** mockar tema — basta renderizar e verificar `src` + classes `dark:`.
- **Regressão (obrigatório rodar e garantir verde):**
  - [__tests__/unit/components/LoginPage.test.tsx:67](__tests__/unit/components/LoginPage.test.tsx#L67) → `getByRole("heading", { name: /TDEC Prospect/i })`. Mantendo um `<h1 className="sr-only">{BRAND.productName}</h1>` ("TDec Prospect"), o regex case-insensitive ainda casa e o `getByRole("heading")` encontra heading sr-only. Confirmar.
  - [__tests__/unit/components/Header.test.tsx](__tests__/unit/components/Header.test.tsx) → checa `role="banner"`/botões; baixo risco. Adicionar asserção do logo.
  - `AppShell.test.tsx` e `Sidebar.test.tsx` renderizam o shell — rodar para garantir que importar `next/image`/`BRAND` no Header não quebrou nada.

### Padrões de qualidade do projeto
- TS `strict: true` ([tsconfig.json](tsconfig.json)).
- ESLint ([eslint.config.mjs](eslint.config.mjs)): `no-console: ["error", { allow: ["warn","error"] }]` e `@typescript-eslint/no-non-null-assertion: "warn"` — **evitar `!`** em código novo (code reviews recentes bloqueiam).
- Tailwind v4: preferir `flex flex-col gap-*` a `space-y-*` para wrappers de label+input/select (memória do projeto). Para esta story isso pouco importa (o componente só renderiza imagens), mas vale ao mexer no bloco do login.
- `npm run build` é gate de qualidade obrigatório antes de marcar a story como pronta (aprendizado recorrente das Epics 11+).

### Project Structure Notes
- Estrutura `src/`: `components/common/` (compartilhados: Header, Sidebar, ThemeProvider, ThemeToggle, AppShell), `lib/constants/` (constants), `app/(auth)/` (login), `app/(dashboard)/`. Convenções: componentes em PascalCase, named export, props via `interface`, `"use client"` só quando há hooks/interatividade.
- Arquivos previstos (a confirmar no File List ao implementar):
  - NEW `src/lib/constants/brand.ts`
  - NEW `src/components/common/BrandLogo.tsx`
  - NEW `__tests__/unit/lib/constants/brand.test.ts`
  - NEW `__tests__/unit/components/BrandLogo.test.tsx`
  - UPDATE `src/components/common/Header.tsx`
  - UPDATE `src/app/(auth)/login/page.tsx`
  - UPDATE (se necessário p/ asserção) `__tests__/unit/components/Header.test.tsx`, `__tests__/unit/components/LoginPage.test.tsx`

### References
- Épico: [_bmad-output/planning-artifacts/epic-19-rebranding-white-label.md](_bmad-output/planning-artifacts/epic-19-rebranding-white-label.md) (Story 19.1, FR1/FR3, NFR-C1/C2/Q2)
- Tema/provider: [src/components/common/ThemeProvider.tsx](src/components/common/ThemeProvider.tsx#L69-L94)
- Script anti-FOUC + `<html>`: [src/app/layout.tsx](src/app/layout.tsx#L31-L52)
- Variante `dark` do Tailwind: [src/app/globals.css](src/app/globals.css#L4)
- Site Header: [src/components/common/Header.tsx](src/components/common/Header.tsx#L46-L47)
- Site Login: [src/app/(auth)/login/page.tsx](<src/app/(auth)/login/page.tsx#L99-L105>)
- Convenção `next/image`: [src/components/insights/InsightsTable.tsx](src/components/insights/InsightsTable.tsx#L82-L89)
- Convenção constants: [src/lib/constants/error-codes.ts](src/lib/constants/error-codes.ts)
- Assets + README: [public/brand/README.md](public/brand/README.md)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — via skill `bmad-dev-story`.

### Debug Log References

- **(1ª iteração, depois revertida) Header.test.tsx — 18 falhas (`TypeError: Invalid URL`) ao integrar `next/image`:** o `beforeEach` sobrescrevia `window.location` com `{ href: "" }`; o `next/image` (`getImgProps`) chama `new URL(...)` e o happy-dom usa `window.location.href` como base — base vazia lança "Invalid URL". Como o logo acabou indo para o `Sidebar` (cujo teste não mocka `location`), o `Header` foi revertido e o problema não se aplica mais. Aprendizado geral registrado em memória do projeto.

### Completion Notes List

Story 100% cosmética (branding), sem tocar lógica de negócio. Abordagem CSS (`dark:`) escolhida sobre `useTheme()` para garantir AC #4 (sem FOUC), conforme Dev Notes.

- ✅ **AC #1** — Componente único `<BrandLogo/>` + constant `BRAND` como fonte única. `BRAND.name === "TDec"` e NÃO casa `/TDEC/` (testado).
- ✅ **AC #2** — Tema escuro → logo branco (`Logo-TDec-branco.png`, `hidden dark:block`). Validado no browser: `display:block` no `.dark`.
- ✅ **AC #3** — Tema claro → logo preto (`Logo-TDec-preto.png`, `block dark:hidden`). Validado no browser: `display:block` no `.light`.
- ✅ **AC #4** — Troca automática + sem FOUC. Renderização das DUAS variantes alternadas só por CSS (variante `dark:` do Tailwind); o script inline de `layout.tsx` aplica `.dark`/`.light` no `<html>` antes do primeiro paint, sem dependência de JS/hidratação. Sem `"use client"` e sem `useTheme()`.
- ✅ **AC #5** — `<BrandLogo/>` exibido no app shell autenticado e no login, ambos com o mesmo componente, sem regressão. Suíte completa verde (6099 testes) — Header, LoginPage, AppShell, Sidebar.
- **Dimensões dos PNGs:** 1400×750 (usadas em `width`/`height` do `next/image`).
- **Lint:** arquivos da story com 0 erros e 0 novos warnings; nenhum `console` nem non-null assertion `!` introduzidos.
- **Escopo respeitado:** não foi feito o sweep "TDEC"→"TDec" (Story 19.2) nem alterado `metadata`/favicon (Story 19.3). O título da aba do browser segue "TDEC Prospect" (metadata) — intencional, fora de escopo.

#### Ajustes pós-feedback do usuário (review, 2026-06-01)
- **Logo movido do Header → topo do Sidebar.** Por feedback do usuário, o logo no app shell saiu do Header e foi para o **topo do `Sidebar`**, maior, ocupando a largura do conteúdo (como os itens do menu). O slot esquerdo do `Header` voltou ao estado original (vazio) — `Header.tsx`/`Header.test.tsx` revertidos.
  - Expandido: `<BrandLogo className="h-auto w-[85%]" />` (85% da largura do conteúdo `px-3` — ajustado de `w-full` para `w-[85%]` por feedback do usuário). Colapsado (64px): versão compacta `h-6 w-auto` centralizada.
  - `Sidebar` nav: `pt-[80px]` → `pt-2` (o bloco do logo agora ocupa o topo).
- **Login: logo aumentado** de `h-12` (48px) para **`h-24`** (96px) — estava pequeno/ilegível.
- **Validação visual (prod build, browser):** sidebar dark = fundo escuro + logo branco; sidebar light = fundo claro (`rgb(250,250,250)`) + logo preto (o token `bg-sidebar` acompanha o tema, então a regra `dark:` continua correta no sidebar); colapsado = logo compacto sem overflow; login = logo grande e legível.

### File List

**Novos:**
- `src/lib/constants/brand.ts`
- `src/components/common/BrandLogo.tsx`
- `__tests__/unit/lib/constants/brand.test.ts`
- `__tests__/unit/components/BrandLogo.test.tsx`

**Modificados:**
- `src/components/common/Sidebar.tsx` (import + `<BrandLogo/>` no topo; nav `pt-[80px]`→`pt-2`)
- `src/app/(auth)/login/page.tsx` (imports + `<BrandLogo/>` `h-24` + `<h1 class="sr-only">` no lugar do título textual)
- `__tests__/unit/components/Sidebar.test.tsx` (2 testes do logo: expandido e colapsado)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status da story → review; `last_updated`)

> Nota: `Header.tsx` e `Header.test.tsx` foram tocados durante a 1ª iteração (logo no Header) e **revertidos ao estado original** após o feedback do usuário — sem diff líquido.

## Change Log

| Data       | Versão | Descrição                                                                                   | Autor   |
| ---------- | ------ | ------------------------------------------------------------------------------------------- | ------- |
| 2026-06-01 | 1.0    | Implementação da Story 19.1: constant `BRAND`, componente `<BrandLogo/>` theme-aware (CSS `dark:`, FOUC-free), integração no Header e na página de login. 10 novos testes; suíte completa verde (6098). | Amelia (Dev) |
| 2026-06-01 | 1.1    | Ajustes pós-feedback (review): logo movido do Header para o **topo do Sidebar** (maior, largura cheia; Header revertido) e **aumentado no login** (`h-12`→`h-24`). Testes do logo migrados p/ `Sidebar.test.tsx`. Suíte verde (6099); build ok; QA visual nos 2 temas + colapsado. | Amelia (Dev) |
| 2026-06-01 | 1.2    | Correções de code review (xhigh): (1) `priority` nas duas `<Image>` — elimina flash no toggle de tema (lazy-loading não baixava a variante `display:none`) e melhora LCP; (2) prop `decorative` no `<BrandLogo/>` → logo do login com `alt=""` (evita anúncio duplicado, já que o `<h1 sr-only>` nomeia a marca); sidebar mantém o alt. +1 teste (modo decorativo). Verde: 92 unit afetados + 15 e2e (auth/home); lint 0 erros. | Claude (Review) |
