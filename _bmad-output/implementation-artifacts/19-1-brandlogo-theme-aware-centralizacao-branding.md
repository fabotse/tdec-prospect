# Story 19.1: Componente BrandLogo theme-aware + centralização do branding

Status: ready-for-dev

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

- [ ] **Task 1 — Criar a constant `BRAND` (fonte única de marca)** (AC: #1, #2, #3)
  - [ ] Criar `src/lib/constants/brand.ts` exportando `export const BRAND = { ... } as const` com: `name: "TDec"`, `productName: "TDec Prospect"`, `description` (manter a atual), e `logo: { light, dark, alt }` apontando para os assets reais em `/brand/` (ver Dev Notes → "Assets" para os nomes exatos).
  - [ ] (RED) Criar `__tests__/unit/lib/constants/brand.test.ts` com testes que falham antes da implementação: `BRAND.name === "TDec"`, `BRAND.name` NÃO casa `/TDEC/`, `BRAND.logo.dark === "/brand/Logo-TDec-branco.png"`, `BRAND.logo.light === "/brand/Logo-TDec-preto.png"`.
  - [ ] (GREEN) Implementar a constant até os testes passarem.

- [ ] **Task 2 — Criar o componente `<BrandLogo/>` theme-aware (abordagem CSS, FOUC-free)** (AC: #1, #2, #3, #4)
  - [ ] Criar `src/components/common/BrandLogo.tsx`. **NÃO** usar `"use client"` e **NÃO** chamar `useTheme()` — a troca é 100% via CSS (variante `dark:` do Tailwind). Ver Dev Notes → "Decisão técnica: por que CSS e não JS".
  - [ ] Renderizar **as duas** variantes (`next/image`) lendo os caminhos de `BRAND.logo`: a branca com classe de visibilidade `hidden dark:block`, a preta com `block dark:hidden`. Ambas com `alt={BRAND.logo.alt}`. Aceitar prop `className` (controla tamanho), mesclando com `cn()` de `@/lib/utils`.
  - [ ] Obter as **dimensões intrínsecas reais** dos PNGs e usá-las em `width`/`height` do `next/image` (preserva proporção e evita warning de aspect-ratio). Tamanho de exibição via `className` (`h-* w-auto`).
  - [ ] (RED) Criar `__tests__/unit/components/BrandLogo.test.tsx` que falha antes da implementação: renderiza 2 imagens com `alt` da marca; a branca tem `src` contendo `Logo-TDec-branco` e classe `dark:block`/`hidden`; a preta tem `src` contendo `Logo-TDec-preto` e classe `dark:hidden`/`block`. **Usar `toContain` no `src`** (ver Dev Notes → "Testes").
  - [ ] (GREEN) Implementar até os testes passarem.

- [ ] **Task 3 — Integrar `<BrandLogo/>` no Header** (AC: #5)
  - [ ] Em `src/components/common/Header.tsx`, inserir `<BrandLogo className="h-8 w-auto" />` dentro do slot esquerdo já reservado e vazio na linha 47 (`<div className="flex items-center" />`). Importar de `@/components/common/BrandLogo`. Header tem `h-16`; logo `h-8` cabe com folga.
  - [ ] (RED→GREEN) Rodar `__tests__/unit/components/Header.test.tsx`; ajustar/adicionar asserção mínima se necessário (os testes atuais checam `role="banner"`, botões e theme toggle — não devem quebrar). Adicionar uma asserção de que o logo aparece (ex.: `getAllByAltText`).

- [ ] **Task 4 — Integrar `<BrandLogo/>` na página de login** (AC: #5)
  - [ ] Em `src/app/(auth)/login/page.tsx` (bloco linhas 100-105), substituir o `<h1>TDEC Prospect</h1>` visível por `<BrandLogo className="mx-auto h-12 w-auto" />`, mantendo o subtítulo `<p>`. Preservar a semântica de heading com um `<h1 className="sr-only">{BRAND.productName}</h1>` (acessibilidade + compatibilidade do teste existente). Importar `BRAND` e `BrandLogo`.
  - [ ] (RED→GREEN) Rodar `__tests__/unit/components/LoginPage.test.tsx`. **Atenção (regressão):** o teste na linha 67 faz `getByRole("heading", { name: /TDEC Prospect/i })`. Com o `<h1 className="sr-only">{BRAND.productName}</h1>` = "TDec Prospect", o regex case-insensitive ainda casa e o teste passa. Confirmar; ajustar o teste apenas se a abordagem de heading mudar.

- [ ] **Task 5 — Validação e gate de qualidade** (AC: #1-#5)
  - [ ] `npm run build` (gate obrigatório do projeto — sem erros TS).
  - [ ] `npx vitest run` — suíte completa verde, **zero regressão** (atenção a Header, LoginPage, AppShell, Sidebar).
  - [ ] `npm run lint` — sem erros (atenção a `no-console` e evitar non-null assertion `!`).
  - [ ] Validação manual rápida: em tema escuro vê logo branco; em tema claro vê logo preto; alternar tema troca na hora; recarregar em tema claro NÃO mostra flash do logo branco.

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

Trade-off aceito: as duas PNGs (~90KB cada) carregam (o `<img>` oculto via `display:none` ainda é baixado). Para um logo é irrelevante e fica em cache; otimização futura possível com SVG/`<picture>` (o README de `public/brand/` já prevê SVG).

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

### Debug Log References

### Completion Notes List

### File List
