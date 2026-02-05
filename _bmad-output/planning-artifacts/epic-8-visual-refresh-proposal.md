# Epic 8: Visual Refresh - Clean B&W Theme

## Overview

Transformação visual do sistema de um tema dark com tons azulados para um tema clean preto e branco neutro, inspirado no UI TripleD (ui.tripled.work). **Objetivo: apenas visual, zero impacto funcional.**

## Contexto

### Situação Atual
- Tema dark com tons azulados (`hsl(222 XX% XX%)`)
- Primary color: Indigo (`hsl(239 84% 67%)`)
- Bordas e backgrounds com saturação azul

### Objetivo
- Tema clean B&W neutro (`hsl(0 0% XX%)`)
- Primary color: Branco/Cinza claro
- Estilo minimalista inspirado no UI TripleD
- **Manter** cores de status (success, warning, destructive)

### Referência Visual
- UI TripleD: https://ui.tripled.work/
- Estilo: Glassmorphism, animações suaves, preto neutro

---

## Análise de Viabilidade ✅

| Aspecto | Status | Notas |
|---------|--------|-------|
| framer-motion | ✅ Já instalado | v12.29.2 |
| shadcn/ui | ✅ Configurado | CSS Variables |
| Tailwind v4 | ✅ Configurado | @theme inline |
| Cores centralizadas | ✅ globals.css | ~30 variáveis |

**Risco: BAIXO** — arquitetura favorece a mudança.

---

## Proposta de Paleta B&W

### Tema Dark (`:root`) — Nova Paleta

```css
:root {
  /* Background - Preto neutro */
  --background: hsl(0 0% 4%);              /* #0a0a0a */
  --background-secondary: hsl(0 0% 7%);    /* #121212 */
  --background-tertiary: hsl(0 0% 10%);    /* #1a1a1a */

  /* Foreground - Brancos */
  --foreground: hsl(0 0% 98%);             /* #fafafa */
  --foreground-muted: hsl(0 0% 64%);       /* #a3a3a3 */

  /* Borders - Cinzas neutros */
  --border: hsl(0 0% 15%);                 /* #262626 */
  --border-hover: hsl(0 0% 22%);           /* #383838 */
  --input: hsl(0 0% 15%);                  /* #262626 */
  --ring: hsl(0 0% 100%);                  /* #ffffff */

  /* Primary - Branco (clean look) */
  --primary: hsl(0 0% 98%);                /* #fafafa */
  --primary-hover: hsl(0 0% 90%);          /* #e5e5e5 */
  --primary-foreground: hsl(0 0% 4%);      /* #0a0a0a */

  /* Secondary */
  --secondary: hsl(0 0% 15%);              /* #262626 */
  --secondary-foreground: hsl(0 0% 98%);   /* #fafafa */

  /* Muted */
  --muted: hsl(0 0% 15%);                  /* #262626 */
  --muted-foreground: hsl(0 0% 64%);       /* #a3a3a3 */

  /* Accent */
  --accent: hsl(0 0% 15%);                 /* #262626 */
  --accent-foreground: hsl(0 0% 98%);      /* #fafafa */

  /* Status Colors - MANTIDOS */
  --success: hsl(142 71% 45%);             /* Verde */
  --warning: hsl(38 92% 50%);              /* Amarelo */
  --destructive: hsl(0 84% 60%);           /* Vermelho */

  /* Card & Popover */
  --card: hsl(0 0% 7%);                    /* #121212 */
  --card-foreground: hsl(0 0% 98%);
  --popover: hsl(0 0% 7%);
  --popover-foreground: hsl(0 0% 98%);

  /* Sidebar */
  --sidebar: hsl(0 0% 7%);
  --sidebar-foreground: hsl(0 0% 98%);
  --sidebar-primary: hsl(0 0% 98%);
  --sidebar-primary-foreground: hsl(0 0% 4%);
  --sidebar-accent: hsl(0 0% 10%);
  --sidebar-accent-foreground: hsl(0 0% 98%);
  --sidebar-border: hsl(0 0% 15%);
  --sidebar-ring: hsl(0 0% 100%);

  /* Charts - Grayscale completo */
  --chart-1: hsl(0 0% 98%);                /* Branco */
  --chart-2: hsl(0 0% 80%);                /* Cinza claro */
  --chart-3: hsl(0 0% 60%);                /* Cinza médio */
  --chart-4: hsl(0 0% 40%);                /* Cinza escuro */
  --chart-5: hsl(0 0% 25%);                /* Cinza muito escuro */

  /* Glow Effects - Branco sutil */
  --glow-primary: 0 0 20px hsla(0, 0%, 100%, 0.1);
  --glow-accent: 0 0 20px hsla(0, 0%, 100%, 0.1);
}
```

### Comparativo

| Token | Atual (Azulado) | Proposta (B&W) |
|-------|-----------------|----------------|
| `--background` | `hsl(222 60% 7%)` | `hsl(0 0% 4%)` |
| `--primary` | `hsl(239 84% 67%)` | `hsl(0 0% 98%)` |
| `--border` | `hsl(217 33% 17%)` | `hsl(0 0% 15%)` |
| `--ring` | `hsl(239 84% 67%)` | `hsl(0 0% 100%)` |

---

## Stories

### Story 8.1: Dark Theme B&W Conversion

**Como** usuário,
**Quero** que o tema dark use cores preto e branco neutras,
**Para** ter uma experiência visual mais clean e moderna.

**Critérios de Aceite:**

1. **Given** o arquivo globals.css existe
   **When** as variáveis CSS do `:root` são atualizadas
   **Then** todas as cores de background usam `hsl(0 0% XX%)`
   **And** todas as cores de foreground usam tons neutros
   **And** bordas usam cinzas neutros sem saturação azul

2. **Given** o tema é atualizado
   **When** visualizo qualquer página do sistema
   **Then** os componentes herdam as novas cores automaticamente
   **And** não há cores azuladas visíveis (exceto status colors)

3. **Given** cores de status (success, warning, destructive)
   **When** são exibidas na interface
   **Then** mantêm suas cores originais (verde, amarelo, vermelho)
   **And** badges de status são claramente distinguíveis

4. **Given** o glow effect é usado
   **When** elementos têm focus ou destaque
   **Then** o glow usa branco sutil (não indigo)

**Arquivos Afetados:**
- `src/app/globals.css` (único arquivo)

**Notas Técnicas:**
- Mudança de ~30 variáveis CSS
- Zero mudança em componentes
- Zero mudança em lógica

---

### Story 8.2: Light Theme B&W Conversion (Opcional)

**Como** usuário,
**Quero** que o tema light também use cores neutras,
**Para** manter consistência visual entre os temas.

**Critérios de Aceite:**

1. **Given** o bloco `.light` em globals.css
   **When** as variáveis são atualizadas
   **Then** backgrounds usam brancos/cinzas claros neutros
   **And** foregrounds usam pretos/cinzas escuros neutros
   **And** primary color mantém consistência com dark theme

**Prioridade:** P2 (se o light mode for usado)

**Arquivos Afetados:**
- `src/app/globals.css`

---

### Story 8.3: Visual QA & Contrast Review

**Como** usuário,
**Quero** que o contraste seja adequado em todas as telas,
**Para** garantir legibilidade e acessibilidade.

**Critérios de Aceite:**

1. **Given** o novo tema é aplicado
   **When** navego por todas as páginas principais
   **Then** texto é legível em todos os contextos
   **And** contraste atende WCAG 2.1 AA (4.5:1 para texto normal)

2. **Given** elementos interativos (botões, inputs)
   **When** são exibidos
   **Then** são claramente distinguíveis do background
   **And** estados de hover/focus são visíveis

3. **Given** tabelas e cards
   **When** são exibidos
   **Then** bordas são visíveis mas sutis
   **And** hierarquia visual é clara

**Páginas para Revisar:**
- [ ] Login
- [ ] Dashboard/Home
- [ ] Leads (busca e meus leads)
- [ ] Campanhas (lista e builder)
- [ ] Configurações (todas as abas)
- [ ] Modais e sidepanels

---

### Story 8.4: UI TripleD Components Integration

**Como** usuário,
**Quero** componentes animados premium do UI TripleD,
**Para** ter uma experiência visual sofisticada com micro-interações modernas.

**Critérios de Aceite:**

1. **Given** o CLI do UI TripleD está disponível
   **When** componentes são adicionados via `npx shadcn@latest add @uitripled/[component]`
   **Then** funcionam com o tema B&W existente
   **And** animações rodam suavemente com framer-motion

2. **Given** o componente Native Magnetic é instalado
   **When** aplicado aos botões primários
   **Then** o cursor é "atraído" pelo botão (efeito magnético)
   **And** a interação é fluida e responsiva

3. **Given** componentes são adicionados
   **When** visualizados na interface
   **Then** respeitam as CSS variables do tema B&W
   **And** não introduzem cores hardcoded

**Componentes a Incluir:**

| Componente | Uso Proposto | Comando |
|------------|--------------|---------|
| **Native Magnetic** | Botões primários (CTAs) | `npx shadcn@latest add @uitripled/native-magnetic` |
| Glass Wallet Card | Cards de métricas/stats | `npx shadcn@latest add @uitripled/glass-wallet-card` |
| Animated List | Listas de leads/campanhas | `npx shadcn@latest add @uitripled/animated-list` |
| AI Unlock Animation | Geração de conteúdo IA | `npx shadcn@latest add @uitripled/ai-unlock-animation` |
| Interactive Timeline | Timeline de campanha | `npx shadcn@latest add @uitripled/interactive-timeline` |

**Prioridade:** P1 (incluído no escopo)

**Dependências:**
- framer-motion ✅ (já instalado v12.29.2)
- Story 8.1 completa (tema B&W aplicado)

---

## Estimativa de Esforço

| Story | Complexidade | Arquivos | Prioridade |
|-------|--------------|----------|------------|
| 8.1 Dark Theme B&W | ⭐ Baixa | 1 | P0 |
| 8.2 Light Theme B&W | ⭐ Baixa | 1 | P0 |
| 8.3 Visual QA | ⭐⭐ Média | 0 | P1 |
| 8.4 UI TripleD Components | ⭐⭐ Média | ~5-10 | P1 |

**Total Epic:** 4 stories, todas incluídas no escopo

---

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Contraste insuficiente | Média | Story 8.3 dedicada a QA |
| Componentes hardcoded | Baixa | Arquitetura usa CSS vars |
| Quebra visual | Baixa | Mudança é apenas de valores |

---

## Decisões Aprovadas ✅

| Decisão | Resposta |
|---------|----------|
| Light mode | ✅ Atualizar junto (B&W) |
| Glow effects | ✅ Manter (branco sutil) |
| Charts | ✅ Grayscale |
| UI TripleD Components | ✅ Incluir nesta Epic |
| Prioridade | ✅ **Antes da Epic 7** |

---

## Prioridade Atualizada

**Epic 8 será executada ANTES da Epic 7 (Campaign Deployment)**

Ordem de execução:
1. ~~Epic 6.5: Icebreaker Premium~~ (em finalização)
2. **Epic 8: Visual Refresh** ← PRÓXIMA
3. Epic 7: Campaign Deployment

---

## Aprovação

- [x] Product Owner aprova escopo ✅
- [x] Decisões de design definidas ✅
- [x] Dev confirma viabilidade técnica ✅

---

*Documento criado em: 2026-02-04*
*Atualizado em: 2026-02-04*
*Referência: ui.tripled.work*
