# Story 8.3: Charts Grayscale Conversion

Status: done

## Story

Como usuário,
Quero que os gráficos usem escala de cinzas,
Para manter consistência com o tema B&W.

## Acceptance Criteria

1. **Given** variáveis de charts em globals.css (`:root` e `.light`)
   **When** são atualizadas
   **Then** chart-1 a chart-5 usam escala de cinzas completa
   **And** gráficos permanecem distinguíveis entre si (contraste adequado)
   **And** legendas são legíveis em ambos os temas

2. **Given** a paleta de charts é atualizada
   **When** visualizada no dark mode
   **Then** cores vão de claro para escuro para distinção visual
   **And** contraste é adequado contra background escuro

3. **Given** a paleta de charts é atualizada
   **When** visualizada no light mode
   **Then** cores vão de escuro para claro para distinção visual
   **And** contraste é adequado contra background claro

4. **Given** futuros componentes de charts são implementados
   **When** usam as variáveis CSS
   **Then** herdam automaticamente as cores grayscale do tema

## Tasks / Subtasks

- [x] Task 1: Atualizar chart colors no dark theme (`:root`) (AC: #1, #2)
  - [x] 1.1 Atualizar `--chart-1` de `hsl(0 0% 70%)` para `hsl(0 0% 95%)` (near-white)
  - [x] 1.2 Atualizar `--chart-2` de `hsl(0 0% 50%)` para `hsl(0 0% 75%)` (light gray)
  - [x] 1.3 Atualizar `--chart-3` de status color para `hsl(0 0% 55%)` (medium gray)
  - [x] 1.4 Atualizar `--chart-4` de status color para `hsl(0 0% 35%)` (dark gray)
  - [x] 1.5 Atualizar `--chart-5` de status color para `hsl(0 0% 20%)` (near-black)

- [x] Task 2: Atualizar chart colors no light theme (`.light`) (AC: #1, #3)
  - [x] 2.1 Atualizar `--chart-1` de `hsl(0 0% 20%)` para `hsl(0 0% 15%)` (near-black)
  - [x] 2.2 Atualizar `--chart-2` de `hsl(0 0% 40%)` para `hsl(0 0% 30%)` (dark gray)
  - [x] 2.3 Atualizar `--chart-3` de status color para `hsl(0 0% 50%)` (medium gray)
  - [x] 2.4 Atualizar `--chart-4` de status color para `hsl(0 0% 70%)` (light gray)
  - [x] 2.5 Atualizar `--chart-5` de status color para `hsl(0 0% 85%)` (near-white)

- [x] Task 3: Atualizar comentários CSS (AC: #1)
  - [x] 3.1 Remover referências a "status colors" nos comentários de charts
  - [x] 3.2 Documentar a escala de contraste (claro→escuro para dark, escuro→claro para light)

- [x] Task 4: Verificação visual (AC: #1, #2, #3)
  - [x] 4.1 Verificar que as 5 cores são distinguíveis entre si no dark mode
  - [x] 4.2 Verificar que as 5 cores são distinguíveis entre si no light mode
  - [x] 4.3 Verificar contraste adequado contra backgrounds

## Dev Notes

### Contexto do Epic 8

Este é o Epic 8: Visual Refresh - Clean B&W Theme. As stories 8.1 (Dark Theme) e 8.2 (Light Theme) já foram implementadas e converteram as cores base para B&W neutro. Esta story completa a conversão dos charts para grayscale puro.

### DECISAO DE DESIGN IMPORTANTE

**Discrepância entre implementacao atual e epics.md:**

A implementacao das stories 8-1 e 8-2 manteve chart-3/4/5 como status colors (verde/amarelo/vermelho) para preservar significado semantico em visualizacoes de dados.

O epics.md especifica que TODOS os 5 charts devem ser grayscale:
```
- chart-1: hsl(0 0% 98%) - Branco
- chart-2: hsl(0 0% 80%) - Cinza claro
- chart-3: hsl(0 0% 60%) - Cinza medio
- chart-4: hsl(0 0% 40%) - Cinza escuro
- chart-5: hsl(0 0% 25%) - Cinza muito escuro
```

**Recomendacao:** Seguir o epics.md e converter TODOS para grayscale. Se futuramente precisarmos de cores semanticas em charts, podemos criar variaveis especificas (`--chart-success`, `--chart-warning`, etc.) separadas das variaveis de paleta base.

### Estado Atual das Variaveis CSS

**Dark Theme (`:root`) - Linhas 155-160 de globals.css:**
```css
/* Charts - Neutral grays for B&W theme, status colors preserved */
--chart-1: hsl(0 0% 70%);               /* Light gray */
--chart-2: hsl(0 0% 50%);               /* Medium gray */
--chart-3: hsl(142 71% 45%);            /* Success green (status) */
--chart-4: hsl(38 92% 50%);             /* Warning yellow (status) */
--chart-5: hsl(0 84% 60%);              /* Destructive red (status) */
```

**Light Theme (`.light`) - Linhas 255-260 de globals.css:**
```css
/* Charts - B&W Neutral (chart-1/2), Status colors (chart-3/4/5) */
--chart-1: hsl(0 0% 20%);                   /* Cinza escuro */
--chart-2: hsl(0 0% 40%);                   /* Cinza medio */
--chart-3: hsl(142 71% 40%);                /* Success green (status) */
--chart-4: hsl(38 92% 45%);                 /* Warning yellow (status) */
--chart-5: hsl(0 84% 55%);                  /* Destructive red (status) */
```

### Paleta Grayscale Proposta (baseada em epics.md, ajustada)

**NOTA DE DESVIO:** O epics.md especifica uma unica paleta (98/80/60/40/25%) sem distinguir dark/light. A implementacao ajustou os valores para:
1. Criar paletas separadas dark/light com ordem invertida (contraste adequado por tema)
2. Espacamento mais uniforme (~20% entre vizinhos vs 18-20% variavel do epics.md)
3. Valores: 95/75/55/35/20 (dark) e 15/30/50/70/85 (light) — delta de 3-5% do epics.md

**Dark Theme (cores claras para contraste com fundo escuro):**
```css
--chart-1: hsl(0 0% 95%);    /* Near-white - mais claro */
--chart-2: hsl(0 0% 75%);    /* Light gray */
--chart-3: hsl(0 0% 55%);    /* Medium gray */
--chart-4: hsl(0 0% 35%);    /* Dark gray */
--chart-5: hsl(0 0% 20%);    /* Near-black - mais escuro */
```

**Light Theme (cores escuras para contraste com fundo claro):**
```css
--chart-1: hsl(0 0% 15%);    /* Near-black - mais escuro */
--chart-2: hsl(0 0% 30%);    /* Dark gray */
--chart-3: hsl(0 0% 50%);    /* Medium gray */
--chart-4: hsl(0 0% 70%);    /* Light gray */
--chart-5: hsl(0 0% 85%);    /* Near-white - mais claro */
```

### Aprendizados das Stories Anteriores (APLICAR)

1. **Padrao de conversao:** Sempre usar `hsl(0 0% XX%)` para manter 0% saturation
2. **Escala invertida:** Dark theme usa cores claras, Light theme usa cores escuras (para contraste)
3. **Consistencia:** Manter espacamento uniforme entre os valores de luminosidade (~20% de diferenca)
4. **Zero impacto funcional:** Apenas mudanca visual

### Git Intelligence

```
672ab63 feat(story-8.2): Light Theme B&W Conversion with code review fixes
8e93b74 feat(story-8.1): Dark Theme B&W Conversion with code review fixes
```

As duas stories anteriores estabeleceram o padrao de conversao B&W. Esta story completa a conversao dos charts.

### Arquivo Alvo

**Unico arquivo a modificar:** `src/app/globals.css`

**Secoes especificas:**
- `:root` - Linhas 155-160 (chart variables dark theme)
- `.light` - Linhas 255-260 (chart variables light theme)

### Componentes de Chart

**IMPORTANTE:** Nao existem componentes de chart implementados no codebase atualmente. Esta story prepara as CSS variables para futura implementacao de charts (possivelmente usando Recharts ou shadcn/ui charts).

As variaveis CSS sao referenciadas em globals.css:
```css
--color-chart-1: var(--chart-1);
--color-chart-2: var(--chart-2);
--color-chart-3: var(--chart-3);
--color-chart-4: var(--chart-4);
--color-chart-5: var(--chart-5);
```

### Arquitetura Relevante

[Source: architecture.md#Styling-Solution]
- Tailwind CSS v4 com PostCSS
- CSS Variables para theming (dark/light mode)
- shadcn/ui components usam CSS variables

### Project Structure Notes

- Alinhado com estrutura existente: todas as variaveis CSS estao centralizadas em `globals.css`
- Nao ha conflitos - e uma mudanca puramente de valores
- Consistencia com Stories 8.1 e 8.2 ja implementadas

### References

- [Source: epics.md#Story-8.3] - Acceptance criteria e paleta proposta
- [Source: architecture.md#Styling-Solution] - Stack de estilos
- [Source: globals.css:155-160] - Variaveis atuais do dark theme
- [Source: globals.css:255-260] - Variaveis atuais do light theme
- [Source: 8-1-dark-theme-bw-conversion.md] - Story anterior como referencia
- [Source: 8-2-light-theme-bw-conversion.md] - Story anterior como referencia
- [Reference: ui.tripled.work] - Design system inspiracao

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

Nenhum debug necessário — mudança puramente de valores CSS.

### Completion Notes List

- Task 1: Convertidos chart-1 a chart-5 no dark theme (:root) de mix grayscale+status colors para full grayscale (95%→75%→55%→35%→20%)
- Task 2: Convertidos chart-1 a chart-5 no light theme (.light) de mix grayscale+status colors para full grayscale (15%→30%→50%→70%→85%)
- Task 3: Comentários CSS atualizados — removidas referências a "status colors preserved" e "Status colors (chart-3/4/5)", substituídos por "Full grayscale palette" com direção da escala documentada
- Task 4: Verificação de contraste por cálculo de luminosidade — todas as 5 cores têm min 15% delta entre vizinhos e min 15% delta do background em ambos os temas
- Testes: Nenhum teste unitário novo necessário — não existem componentes de chart no codebase. 156 test files passing (22 falhas pré-existentes em AICampaignWizard, não relacionadas)
- Decisão: Baseado em epics.md mas ajustado — todos os 5 charts convertidos para grayscale puro, removendo status colors (verde/amarelo/vermelho) que estavam em chart-3/4/5. Valores ajustados 3-5% do epics.md para espacamento uniforme entre vizinhos

### Code Review Fixes (2026-02-05)

- [M1/M2] Corrigida documentacao: "conforme epics.md" → "baseada em epics.md, ajustada" com nota de desvio detalhando as diferencas (3-5% delta) e justificativa (espacamento uniforme)
- [M3] Criado teste de regressao `__tests__/unit/styles/globals-chart-grayscale.test.ts` (4 testes): valida saturation=0%, hue=0, 10 declaracoes presentes (5 por tema), e min 15% delta entre cores vizinhas

### File List

- `src/app/globals.css` — Atualizado chart-1 a chart-5 em :root e .light para full grayscale
- `__tests__/unit/styles/globals-chart-grayscale.test.ts` — Teste de regressao grayscale compliance (4 testes)

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-02-04 | Story criada com contexto completo | SM Agent (Bob) |
| 2026-02-05 | Implementação completa — all 5 charts convertidos para grayscale em ambos temas | Dev Agent (Amelia) |
| 2026-02-05 | Code Review: 3M/3L issues encontrados. Fixes: documentacao corrigida (M1/M2), teste de regressao criado (M3) | Code Review (Amelia) |
