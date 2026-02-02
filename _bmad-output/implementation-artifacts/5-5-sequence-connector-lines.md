# Story 5.5: Sequence Connector Lines

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want visual connectors between blocks,
so that I can see the flow of my sequence.

## Context

Esta story implementa o **componente SequenceConnector** para o builder de campanhas. Os conectores sao linhas visuais SVG que conectam blocos consecutivos, mostrando o fluxo da sequencia de campanha. Esta e uma feature visual essencial para UX premium estilo Attio.

**Requisitos Funcionais Cobertos:**
- FR13: Builder visual drag-and-drop (complemento visual)
- FR14: Multiplos touchpoints em uma sequencia (visualizacao do fluxo)

**Relacao com outras Stories do Epic 5:**
- **Story 5.1 (DONE):** Campaigns page, data model
- **Story 5.2 (DONE):** Builder Canvas, Sidebar, Header, useBuilderStore
- **Story 5.3 (DONE):** Email Block Component
- **Story 5.4 (DONE):** Delay Block Component
- **Story 5.6:** Block Drag & Reorder (conectores atualizam automaticamente)
- **Story 5.7:** Campaign Lead Association

**O que JA existe (reutilizar, NAO reimplementar):**
- `BuilderCanvas` - Canvas que renderiza blocos em flex column com gap-6 (24px)
- `useBuilderStore` - Store Zustand com blocks[] array
- `EmailBlock` e `DelayBlock` - Componentes de bloco ja implementados
- framer-motion - Ja configurado no projeto
- Dark mode theme tokens configurados
- CSS variables: --border, --primary

**O que FALTA implementar nesta story:**
1. Componente `SequenceConnector` em `src/components/builder/SequenceConnector.tsx`
2. SVG path com curva bezier vertical entre blocos
3. Seta triangular no final indicando direcao
4. Animacao "draw line" com stroke-dashoffset ao aparecer
5. Integrar no `BuilderCanvas` entre blocos consecutivos
6. Testes unitarios para o componente

## Acceptance Criteria

### AC #1 - Conectores entre Blocos Consecutivos

**Given** tenho multiplos blocos no canvas
**When** os blocos estao posicionados
**Then** linhas conectoras SVG sao desenhadas entre blocos consecutivos
**And** cada conector conecta a parte inferior de um bloco ao topo do proximo
**And** conectores nao aparecem se houver apenas um bloco

### AC #2 - Visual do Conector (Estilo Attio)

**Given** conectores existem entre blocos
**When** visualizo os conectores
**Then** vejo uma linha com curva bezier suave (nao reta)
**And** a cor da linha usa `--border` token (sutil)
**And** a espessura da linha e 2px
**And** o conector tem uma seta triangular no final indicando direcao

### AC #3 - Animacao de Entrada (Draw Line)

**Given** um novo bloco e adicionado ao canvas
**When** o bloco aparece
**Then** o conector para o bloco anterior anima com efeito "draw line"
**And** a animacao usa stroke-dashoffset em 300ms
**And** a animacao respeita `prefers-reduced-motion: reduce`

### AC #4 - Responsividade do Layout

**Given** blocos existem no canvas com conectores
**When** a janela e redimensionada ou blocos sao reordenados
**Then** conectores permanecem centralizados entre blocos
**And** conectores ajustam automaticamente ao gap entre blocos

### AC #5 - Acessibilidade

**Given** um usuario navega com screen reader
**When** passa pelos conectores
**Then** os conectores sao marcados como `aria-hidden="true"`
**And** conectores nao interferem na navegacao por teclado
**And** a sequencia e comunicada pelos proprios blocos (role="listitem")

## Tasks / Subtasks

- [x] Task 1: Criar componente SequenceConnector (AC: #1, #2)
  - [x] 1.1 Criar `src/components/builder/SequenceConnector.tsx`
  - [x] 1.2 Implementar SVG path com curva bezier vertical
  - [x] 1.3 Adicionar marker para seta triangular
  - [x] 1.4 Usar CSS variables para cores (--border)
  - [x] 1.5 Definir espessura de 2px

- [x] Task 2: Implementar animacao draw line (AC: #3)
  - [x] 2.1 Usar framer-motion para animacao
  - [x] 2.2 Implementar stroke-dasharray e stroke-dashoffset
  - [x] 2.3 Duracao de 300ms com easing natural
  - [x] 2.4 Respeitar prefers-reduced-motion

- [x] Task 3: Integrar no BuilderCanvas (AC: #1, #4)
  - [x] 3.1 Modificar `BuilderCanvas.tsx` para renderizar SequenceConnector entre blocos
  - [x] 3.2 Calcular altura baseada no gap entre blocos (24px)
  - [x] 3.3 Manter centralizacao com flex layout

- [x] Task 4: Acessibilidade (AC: #5)
  - [x] 4.1 Adicionar aria-hidden="true" aos SVGs
  - [x] 4.2 Garantir que conectores nao recebam foco

- [x] Task 5: Testes unitarios (AC: todos)
  - [x] 5.1 Teste para SequenceConnector: render, animacao, acessibilidade
  - [x] 5.2 Teste para BuilderCanvas: renderizar conectores entre blocos
  - [x] 5.3 Teste para verificar que conectores nao aparecem com 1 bloco

- [x] Task 6: Exportar e verificar build (AC: N/A)
  - [x] 6.1 Adicionar SequenceConnector ao `src/components/builder/index.ts`
  - [x] 6.2 Executar todos os testes
  - [x] 6.3 Verificar build sem erros

## Dev Notes

### Arquitetura e Padroes

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Component naming | PascalCase para componentes React |
| State management | Zustand (useBuilderStore) para UI state |
| Animations | framer-motion para transicoes suaves |
| CSS Variables | Usar --border e --primary para cores |
| Accessibility | aria-hidden="true" para elementos decorativos |
| Error messages | Sempre em portugues |

### SequenceConnector Component Implementation

```tsx
// src/components/builder/SequenceConnector.tsx

"use client";

import { motion } from "framer-motion";

interface SequenceConnectorProps {
  /** Height of the connector in pixels */
  height?: number;
  /** Whether this is a new connector that should animate */
  animate?: boolean;
}

/**
 * Visual connector between blocks in the campaign builder.
 * Displays a vertical bezier curve with an arrow indicating flow direction.
 *
 * UX Spec Reference: SequenceConnector
 * - SVG path with bezier curve
 * - Color: --border (subtle)
 * - Stroke width: 2px
 * - Arrow marker at end
 * - Draw line animation on appear (300ms)
 */
export function SequenceConnector({
  height = 24,
  animate = true
}: SequenceConnectorProps) {
  // Calculate path dimensions
  const width = 20;
  const halfWidth = width / 2;
  const curveOffset = height * 0.3; // Control point offset for bezier

  // Create bezier curve path from top center to bottom center
  // M = move to start, C = cubic bezier curve
  const pathD = `
    M ${halfWidth} 0
    C ${halfWidth} ${curveOffset}, ${halfWidth} ${height - curveOffset}, ${halfWidth} ${height - 6}
  `;

  // Arrow marker path (triangle pointing down)
  const arrowSize = 6;
  const arrowD = `
    M ${halfWidth - arrowSize / 2} ${height - arrowSize}
    L ${halfWidth} ${height}
    L ${halfWidth + arrowSize / 2} ${height - arrowSize}
  `;

  // Animation variants for draw line effect
  const pathVariants = {
    hidden: {
      pathLength: 0,
      opacity: 0,
    },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { duration: 0.3, ease: "easeOut" },
        opacity: { duration: 0.1 },
      },
    },
  };

  const arrowVariants = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { delay: 0.2, duration: 0.15 },
    },
  };

  return (
    <svg
      data-testid="sequence-connector"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="mx-auto"
      style={{
        // Respect reduced motion preference
        // framer-motion handles this automatically via useReducedMotion
      }}
    >
      {/* Main connector line */}
      <motion.path
        d={pathD}
        stroke="hsl(var(--border))"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={animate ? "hidden" : "visible"}
        animate="visible"
        variants={pathVariants}
      />

      {/* Arrow marker at the end */}
      <motion.path
        d={arrowD}
        stroke="hsl(var(--border))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={animate ? "hidden" : "visible"}
        animate="visible"
        variants={arrowVariants}
      />
    </svg>
  );
}
```

### BuilderCanvas Update

```tsx
// Modificar src/components/builder/BuilderCanvas.tsx

// Adicionar import
import { SequenceConnector } from "./SequenceConnector";

// Modificar a renderizacao de blocos (dentro do div flex-col)
{blocks.map((block, index) => (
  <React.Fragment key={block.id}>
    {/* Render connector BEFORE each block (except first) */}
    {index > 0 && (
      <SequenceConnector
        height={24}
        animate={true}
      />
    )}

    {block.type === "email" ? (
      <EmailBlock
        block={block}
        stepNumber={index + 1}
      />
    ) : (
      <DelayBlock
        block={block}
        stepNumber={index + 1}
      />
    )}
  </React.Fragment>
))}
```

### Project Structure Notes

```
src/
├── components/
│   └── builder/
│       ├── BuilderCanvas.tsx                    # MODIFY - Adicionar SequenceConnector
│       ├── BuilderSidebar.tsx                   # EXISTING - Nao modificar
│       ├── BuilderHeader.tsx                    # EXISTING - Nao modificar
│       ├── EmailBlock.tsx                       # EXISTING - Nao modificar
│       ├── DelayBlock.tsx                       # EXISTING - Nao modificar
│       ├── SequenceConnector.tsx                # NEW - Componente conector
│       └── index.ts                             # MODIFY - Exportar SequenceConnector
```

### Previous Story Intelligence

**From Story 5.4 (Delay Block Component):**
- Pattern de motion.div com initial, animate, exit
- Pattern de animacao com variants e transition
- Pattern de integrar componente no BuilderCanvas
- Pattern de testes com data-testid
- useEffect para sync de estado externo

**From Story 5.3 (Email Block Component):**
- Pattern de componente completo com motion
- Pattern de props tipadas com interface
- Pattern de CSS classes com cn()

**From Story 5.2 (Campaign Builder Canvas):**
- BuilderCanvas usa flex-col com gap-6 (24px entre blocos)
- blocks.map() para renderizar blocos em sequencia
- Deselecao ao clicar fora dos blocos

**From Architecture:**
- framer-motion para animacoes
- CSS variables para theming
- aria-hidden para elementos decorativos

### Git Intelligence

**Commit pattern esperado:**
```
feat(story-5.5): sequence connector lines
```

**Padroes recentes observados (ultimos commits):**
- 860ed61 feat(story-5.4): delay block component with code review fixes
- cb425b0 feat(story-5.3): email block component with code review fixes
- Code review fixes aplicados no mesmo commit
- Componentes seguem pattern framer-motion
- Testes completos para cada componente

### UX Design Notes

**Referencia Visual: SequenceConnector**

```
┌─────────────────────────┐
│    Email Block 1        │
└─────────────────────────┘
          │
          │  ← Curva bezier suave (2px, --border color)
          │
          ▼  ← Seta triangular indicando direcao
┌─────────────────────────┐
│    Delay Block          │
└─────────────────────────┘
          │
          │
          ▼
┌─────────────────────────┐
│    Email Block 2        │
└─────────────────────────┘
```

**Especificacoes da UX Spec:**
- SVG path com curva bezier suave
- Cor: `--border` (inativo), `--primary` (ativo - futuro)
- Espessura: 2px
- Seta triangular no final
- Animacao: stroke-dashoffset "draw line" em 300ms

**Animacao Draw Line:**
1. Linha comeca com pathLength=0, opacity=0
2. Anima para pathLength=1, opacity=1 em 300ms
3. Seta aparece com delay de 200ms, scale de 0.5 para 1
4. Respeita prefers-reduced-motion

### O Que NAO Fazer

- NAO implementar estado ativo/selecionado para conectores - sera futuro
- NAO implementar conectores curvos horizontais - apenas verticais
- NAO adicionar logica de reordenacao - sera na Story 5.6
- NAO usar refs para calcular posicoes - usar altura fixa (gap do layout)
- NAO modificar EmailBlock ou DelayBlock
- NAO criar estado adicional no store para conectores

### Testing Strategy

**Unit Tests:**
- SequenceConnector: render, SVG elements, aria-hidden, animacao
- BuilderCanvas: renderizar conectores entre blocos, nao renderizar com 1 bloco

**Test Patterns (de stories anteriores):**
```typescript
// Test SequenceConnector render
describe("SequenceConnector", () => {
  it("renders SVG connector with path and arrow", () => {
    render(<SequenceConnector />);
    const svg = screen.getByTestId("sequence-connector");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("has correct default height", () => {
    render(<SequenceConnector />);
    const svg = screen.getByTestId("sequence-connector");
    expect(svg).toHaveAttribute("height", "24");
  });

  it("respects custom height prop", () => {
    render(<SequenceConnector height={48} />);
    const svg = screen.getByTestId("sequence-connector");
    expect(svg).toHaveAttribute("height", "48");
  });
});

// Test BuilderCanvas with connectors
describe("BuilderCanvas with Connectors", () => {
  it("renders connectors between multiple blocks", () => {
    // Setup store with 2+ blocks
    render(<BuilderCanvas />);
    const connectors = screen.getAllByTestId("sequence-connector");
    expect(connectors).toHaveLength(1); // n-1 connectors for n blocks
  });

  it("does not render connectors with single block", () => {
    // Setup store with 1 block
    render(<BuilderCanvas />);
    expect(screen.queryByTestId("sequence-connector")).not.toBeInTheDocument();
  });

  it("does not render connectors with empty canvas", () => {
    // Setup store with 0 blocks
    render(<BuilderCanvas />);
    expect(screen.queryByTestId("sequence-connector")).not.toBeInTheDocument();
  });
});
```

### NFR Compliance

- **Performance:** SVG leve, animacao com transform e opacity (GPU accelerated)
- **UX:** Feedback visual claro do fluxo da sequencia
- **Accessibility:** aria-hidden="true", nao interfere com keyboard navigation
- **Reduced Motion:** framer-motion respeita prefers-reduced-motion automaticamente

### References

- [Source: ux-design-specification.md#SequenceConnector] - Especificacoes visuais
- [Source: architecture.md#Frontend-Architecture] - framer-motion para animacoes
- [Source: src/components/builder/BuilderCanvas.tsx] - Canvas atual com gap-6
- [Source: src/components/builder/EmailBlock.tsx] - Pattern de motion component
- [Source: src/components/builder/DelayBlock.tsx] - Pattern de motion component
- [Source: epics.md#Epic-5-Story-5.5] - Requisitos da story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed TypeScript build error: Changed ease from string "easeOut" to Bezier tuple `[0, 0, 0.2, 1]` for framer-motion variants type compatibility
- Fixed test assertion: Changed `tabIndex` to `tabindex` (DOM attribute is lowercase)

### Code Review Fixes (2026-02-02)

**H1 - TypeScript error in test mock:**
- Fixed `strokeLinecap` and `strokeLinejoin` prop types in framer-motion mock to use literal union types

**M1 - Color token mismatch (AC #2):**
- Changed `stroke="currentColor"` with `text-muted-foreground` class to `stroke="hsl(var(--border))"` as specified in AC #2
- Updated test to expect `hsl(var(--border))` instead of `currentColor`

**M2 - Double gap spacing:**
- Removed `gap-6` from BuilderCanvas flex container to prevent 72px total spacing (was: 24px gap + 24px connector + 24px gap)
- Connector height (24px) now provides the correct spacing between blocks

### Completion Notes List

- ✅ Implementado componente SequenceConnector com SVG path bezier e seta triangular
- ✅ Animacao draw line com framer-motion pathLength (300ms)
- ✅ Suporte a prefers-reduced-motion via useReducedMotion hook
- ✅ Acessibilidade: aria-hidden="true", tabIndex={-1}
- ✅ Integrado no BuilderCanvas entre blocos consecutivos
- ✅ 38 testes passando (19 SequenceConnector + 19 BuilderCanvas)
- ✅ Build TypeScript OK

### File List

**NEW:**
- src/components/builder/SequenceConnector.tsx
- __tests__/unit/components/builder/SequenceConnector.test.tsx

**MODIFIED:**
- src/components/builder/index.ts (add SequenceConnector export)
- src/components/builder/BuilderCanvas.tsx (render SequenceConnector between blocks, added Fragment import)
- __tests__/unit/components/builder/BuilderCanvas.test.tsx (connector rendering tests, updated framer-motion mock)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Story 5.5 context created | Bob (SM) |
| 2026-02-02 | Story 5.5 implementado - SequenceConnector com animacao draw line, integrado no BuilderCanvas | Amelia (Dev) |
| 2026-02-02 | Code Review fixes: TypeScript mock types, --border color token, removed double gap spacing | Amelia (Dev) |
