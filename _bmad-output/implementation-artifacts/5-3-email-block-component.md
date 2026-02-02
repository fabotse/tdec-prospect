# Story 5.3: Email Block Component

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to add email blocks to my sequence,
so that I can define each touchpoint in my campaign.

## Context

Esta story implementa o **componente EmailBlock completo** para o builder de campanhas. O EmailBlock e o bloco principal do sistema - cada email na sequencia de outreach e representado por um destes blocos. Esta story transforma o `BlockPlaceholder` atual em um componente funcional e interativo.

**Requisitos Funcionais Cobertos:**
- FR13 (parcial): Builder visual drag-and-drop - blocos de email
- FR14: Usuario pode adicionar multiplos touchpoints (emails) em uma sequencia
- FR23 (parcial): Base para edicao manual de textos (inline editing)

**Relacao com outras Stories do Epic 5:**
- **Story 5.1 (DONE):** Campaigns page, data model, `campaigns` e `campaign_leads` tables
- **Story 5.2 (DONE):** Builder Canvas, Sidebar, Header, useBuilderStore, BlockPlaceholder
- **Story 5.4:** Delay Block Component (similar pattern)
- **Story 5.5:** Sequence Connector Lines (conectores entre blocos)
- **Story 5.6:** Block Drag & Reorder (logica de reordenacao)

**O que JA existe (reutilizar, NAO reimplementar):**
- `campaigns` table - Modelo de campanhas com tenant isolation
- `useBuilderStore` - Store Zustand com blocks[], selectedBlockId, addBlock, updateBlock, selectBlock
- `BuilderCanvas` - Canvas que renderiza blocos (usa BlockPlaceholder atualmente)
- `BuilderSidebar` - Sidebar com Email e Delay blocks arrastaveis
- `BlockPlaceholder` - Componente placeholder atual que sera substituido/expandido
- `BLOCK_CONFIG` em BlockPlaceholder - Configuracao de icones e cores por tipo
- `@dnd-kit/core` - Ja configurado no builder
- shadcn/ui: Card, Input, Textarea, Button, etc.
- Dark mode theme tokens configurados

**O que FALTA implementar nesta story:**
1. Migration `00018_create_email_blocks.sql` - Tabela email_blocks
2. Tipos TypeScript em `src/types/email-block.ts`
3. Componente `EmailBlock` em `src/components/builder/EmailBlock.tsx`
4. Integracao com useBuilderStore para selecao e edicao
5. Visual de selecao (borda destacada quando selecionado)
6. Atualizar `BuilderCanvas` para renderizar EmailBlock em vez de BlockPlaceholder para tipo email
7. Campos editaveis: subject (placeholder), body (placeholder)
8. Drag handle visual para reposicionamento (preparacao para 5.6)

## Acceptance Criteria

### AC #1 - Arrastar Email Block para Canvas

**Given** estou no campaign builder
**When** arrasto um email block da sidebar para o canvas
**Then** o bloco aparece onde soltei com animacao suave (framer-motion)
**And** o bloco mostra: icone de email, "Email", placeholder para subject
**And** o bloco e adicionado ao useBuilderStore.blocks
**And** hasChanges e marcado como true

### AC #2 - Visual do Email Block (Estilo Attio)

**Given** um email block existe no canvas
**When** visualizo o bloco
**Then** vejo um card com design clean estilo Attio:
  - Header: icone + "Step X" + tipo "Email"
  - Campo subject com label e placeholder "Assunto do email"
  - Campo body com placeholder "Conteudo do email..."
  - Visual minimalista com bordas sutis
  - Background levemente diferente do canvas (card style)

### AC #3 - Selecionar Email Block

**Given** um email block existe no canvas
**When** clico no bloco
**Then** o bloco fica selecionado (selectedBlockId no store)
**And** o bloco tem borda destacada com cor primary
**And** clicar fora do bloco deseleciona
**And** apenas um bloco pode estar selecionado por vez

### AC #4 - Drag Handle para Reposicionamento

**Given** um email block existe no canvas
**When** visualizo o bloco
**Then** vejo um drag handle (icone de 6 dots ou grip)
**And** o cursor muda para "grab" ao passar sobre o handle
**And** o handle indica visualmente que o bloco e arrastavel
**Note:** A logica de reordenacao sera implementada na Story 5.6

### AC #5 - Campos Editaveis (Placeholder)

**Given** um email block esta selecionado
**When** clico no campo subject ou body
**Then** posso editar o texto inline
**And** mudancas sao salvas no block.data no store
**And** hasChanges e atualizado para true
**Note:** Geracao IA sera implementada no Epic 6

### AC #6 - Tabela email_blocks no Banco

**Given** o banco de dados
**When** a migration e aplicada
**Then** a tabela `email_blocks` e criada com:
  - id (UUID, PK)
  - campaign_id (UUID, FK para campaigns, ON DELETE CASCADE)
  - position (INTEGER, NOT NULL)
  - subject (TEXT)
  - body (TEXT)
  - created_at (TIMESTAMPTZ)
  - updated_at (TIMESTAMPTZ)
**And** RLS policies garantem isolamento via campaign's tenant
**And** index em campaign_id para performance

## Tasks / Subtasks

- [x] Task 1: Criar migration para tabela email_blocks (AC: #6)
  - [x] 1.1 Criar arquivo `supabase/migrations/00018_create_email_blocks.sql`
  - [x] 1.2 Criar tabela `email_blocks` com colunas especificadas
  - [x] 1.3 Criar indexes para campaign_id e position
  - [x] 1.4 Criar trigger para updated_at
  - [x] 1.5 Criar RLS policies via campaign's tenant
  - [x] 1.6 Aplicar migration localmente e verificar

- [x] Task 2: Criar tipos TypeScript para email blocks (AC: #2, #5)
  - [x] 2.1 Criar `src/types/email-block.ts`
  - [x] 2.2 Definir `EmailBlock` interface (camelCase)
  - [x] 2.3 Definir `EmailBlockRow` interface (snake_case)
  - [x] 2.4 Criar `transformEmailBlockRow` function
  - [x] 2.5 Definir `EmailBlockData` para uso no BuilderBlock.data
  - [x] 2.6 Criar Zod schemas para validacao
  - [x] 2.7 Exportar em `src/types/index.ts`

- [x] Task 3: Criar componente EmailBlock (AC: #1, #2, #3, #4, #5)
  - [x] 3.1 Criar `src/components/builder/EmailBlock.tsx`
  - [x] 3.2 Implementar visual estilo Attio (header, subject, body)
  - [x] 3.3 Implementar estado de selecao com borda destacada
  - [x] 3.4 Implementar drag handle visual
  - [x] 3.5 Implementar campos editaveis (subject, body)
  - [x] 3.6 Integrar com useBuilderStore (selectBlock, updateBlock)
  - [x] 3.7 Adicionar animacao suave com framer-motion

- [x] Task 4: Atualizar BuilderCanvas para usar EmailBlock (AC: #1, #2, #3)
  - [x] 4.1 Modificar `BuilderCanvas.tsx` para renderizar EmailBlock para type="email"
  - [x] 4.2 Manter BlockPlaceholder para type="delay" (sera substituido em 5.4)
  - [x] 4.3 Implementar click outside para deselecionar blocos

- [x] Task 5: Atualizar useBuilderStore se necessario (AC: #5)
  - [x] 5.1 Verificar se updateBlock funciona corretamente para data.subject e data.body
  - [x] 5.2 Adicionar type-safety para EmailBlockData se necessario

- [x] Task 6: Atualizar index de exports (AC: N/A)
  - [x] 6.1 Adicionar EmailBlock ao `src/components/builder/index.ts`

- [x] Task 7: Testes unitarios (AC: todos)
  - [x] 7.1 Teste para tipos: transformEmailBlockRow, Zod schemas
  - [x] 7.2 Teste para EmailBlock: render, selecao, edicao, drag handle
  - [x] 7.3 Teste para BuilderCanvas: renderizar EmailBlock para tipo email
  - [x] 7.4 Teste para integracao com store

- [x] Task 8: Verificar build e testes (AC: N/A)
  - [x] 8.1 Executar todos os testes
  - [x] 8.2 Verificar build sem erros
  - [x] 8.3 Testar manualmente no browser

## Dev Notes

### Arquitetura e Padroes

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| API Response Format | Usar `APISuccessResponse<T>` e `APIErrorResponse` de `src/types/api.ts` |
| Database naming | snake_case para tabelas e colunas |
| TypeScript naming | camelCase para interfaces e variaveis |
| Component naming | PascalCase para componentes React |
| State management | Zustand (useBuilderStore) para UI state |
| Error messages | Sempre em portugues |
| Animations | framer-motion para transicoes suaves |

### Migration SQL Pattern

```sql
-- supabase/migrations/00018_create_email_blocks.sql
-- Story 5.3: Email Block Component
-- Creates email_blocks table for storing email content in campaign sequences

-- 1. Create email_blocks table
CREATE TABLE IF NOT EXISTS public.email_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    subject TEXT,
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_email_blocks_campaign_id ON public.email_blocks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_blocks_position ON public.email_blocks(campaign_id, position);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS update_email_blocks_updated_at ON public.email_blocks;
CREATE TRIGGER update_email_blocks_updated_at
    BEFORE UPDATE ON public.email_blocks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.email_blocks ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (via campaign's tenant)
CREATE POLICY "Users can view email_blocks for their tenant"
    ON public.email_blocks FOR SELECT
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can insert email_blocks for their tenant"
    ON public.email_blocks FOR INSERT
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can update email_blocks for their tenant"
    ON public.email_blocks FOR UPDATE
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    )
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can delete email_blocks for their tenant"
    ON public.email_blocks FOR DELETE
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- 6. Comments
COMMENT ON TABLE public.email_blocks IS 'Email content blocks within campaign sequences';
COMMENT ON COLUMN public.email_blocks.position IS 'Order position within the campaign sequence';
COMMENT ON COLUMN public.email_blocks.subject IS 'Email subject line';
COMMENT ON COLUMN public.email_blocks.body IS 'Email body content';
```

### Types Implementation

```typescript
// src/types/email-block.ts

import { z } from "zod";

// ==============================================
// EMAIL BLOCK INTERFACES
// ==============================================

/**
 * Email block entity from database (camelCase)
 */
export interface EmailBlock {
  id: string;
  campaignId: string;
  position: number;
  subject: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Database row type (snake_case)
 */
export interface EmailBlockRow {
  id: string;
  campaign_id: string;
  position: number;
  subject: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Transform database row to EmailBlock interface
 */
export function transformEmailBlockRow(row: EmailBlockRow): EmailBlock {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    position: row.position,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Data structure for email block in BuilderBlock.data
 * Used in useBuilderStore
 */
export interface EmailBlockData {
  subject: string;
  body: string;
}

/**
 * Default data for new email blocks
 */
export const DEFAULT_EMAIL_BLOCK_DATA: EmailBlockData = {
  subject: "",
  body: "",
};

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Schema for email block data
 */
export const emailBlockDataSchema = z.object({
  subject: z.string().max(200, "Assunto muito longo"),
  body: z.string(),
});

export type EmailBlockDataInput = z.infer<typeof emailBlockDataSchema>;

/**
 * Schema for creating an email block
 */
export const createEmailBlockSchema = z.object({
  campaignId: z.string().uuid("ID de campanha invalido"),
  position: z.number().int().min(0),
  subject: z.string().max(200).optional(),
  body: z.string().optional(),
});

export type CreateEmailBlockInput = z.infer<typeof createEmailBlockSchema>;

/**
 * Schema for updating an email block
 */
export const updateEmailBlockSchema = z.object({
  position: z.number().int().min(0).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().optional(),
});

export type UpdateEmailBlockInput = z.infer<typeof updateEmailBlockSchema>;
```

### EmailBlock Component Implementation

```tsx
// src/components/builder/EmailBlock.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { Mail, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBuilderStore, type BuilderBlock } from "@/stores/use-builder-store";
import type { EmailBlockData } from "@/types/email-block";

interface EmailBlockProps {
  block: BuilderBlock;
  stepNumber: number;
}

/**
 * Email block component for the campaign builder
 * Displays editable subject and body fields with Attio-style design
 */
export function EmailBlock({ block, stepNumber }: EmailBlockProps) {
  const selectedBlockId = useBuilderStore((state) => state.selectedBlockId);
  const selectBlock = useBuilderStore((state) => state.selectBlock);
  const updateBlock = useBuilderStore((state) => state.updateBlock);

  const isSelected = selectedBlockId === block.id;
  const blockData = (block.data as EmailBlockData) || { subject: "", body: "" };

  const [subject, setSubject] = useState(blockData.subject || "");
  const [body, setBody] = useState(blockData.body || "");

  const blockRef = useRef<HTMLDivElement>(null);

  // Update store when subject changes
  const handleSubjectChange = (value: string) => {
    setSubject(value);
    updateBlock(block.id, {
      data: { ...blockData, subject: value },
    });
  };

  // Update store when body changes
  const handleBodyChange = (value: string) => {
    setBody(value);
    updateBlock(block.id, {
      data: { ...blockData, body: value },
    });
  };

  // Handle block selection
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectBlock(block.id);
  };

  return (
    <motion.div
      ref={blockRef}
      data-testid={`email-block-${block.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={cn(
        // Card styling - Attio-inspired clean design
        "w-full max-w-lg",
        "rounded-xl border bg-card",
        "shadow-sm transition-all duration-200",
        // Selection state
        isSelected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-border/80 hover:shadow-md",
        // Cursor
        "cursor-pointer"
      )}
    >
      {/* Block Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        {/* Drag Handle */}
        <div
          data-testid="drag-handle"
          className="cursor-grab hover:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Icon */}
        <div className="rounded-lg p-2 bg-blue-500/10">
          <Mail className="h-5 w-5 text-blue-500" />
        </div>

        {/* Title */}
        <div className="flex-1">
          <p className="font-medium text-sm">Step {stepNumber}</p>
          <p className="text-xs text-muted-foreground">Email</p>
        </div>
      </div>

      {/* Block Content */}
      <div className="p-4 space-y-4">
        {/* Subject Field */}
        <div className="space-y-2">
          <label
            htmlFor={`subject-${block.id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Assunto
          </label>
          <Input
            id={`subject-${block.id}`}
            data-testid="email-subject-input"
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Assunto do email"
            className="bg-background/50"
            maxLength={200}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Body Field */}
        <div className="space-y-2">
          <label
            htmlFor={`body-${block.id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Conteudo
          </label>
          <Textarea
            id={`body-${block.id}`}
            data-testid="email-body-input"
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            placeholder="Conteudo do email..."
            className="bg-background/50 min-h-[100px] resize-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </motion.div>
  );
}
```

### BuilderCanvas Update

```tsx
// Modificar src/components/builder/BuilderCanvas.tsx

// Adicionar import
import { EmailBlock } from "./EmailBlock";

// Modificar a renderizacao de blocos
{blocks.map((block, index) => (
  block.type === "email" ? (
    <EmailBlock key={block.id} block={block} stepNumber={index + 1} />
  ) : (
    <BlockPlaceholder key={block.id} block={block} />
  )
))}

// Adicionar click handler para deselecionar
const handleCanvasClick = () => {
  selectBlock(null);
};

// No JSX, adicionar onClick ao container principal
<div
  ref={setNodeRef}
  data-testid="builder-canvas"
  onClick={handleCanvasClick}
  // ... resto das classes
>
```

### Project Structure Notes

```
src/
├── app/
│   └── (dashboard)/
│       └── campaigns/
│           └── [campaignId]/
│               └── edit/
│                   └── page.tsx                 # EXISTING - Nao modificar
├── components/
│   └── builder/
│       ├── BuilderCanvas.tsx                    # MODIFY - Renderizar EmailBlock
│       ├── BuilderSidebar.tsx                   # EXISTING - Nao modificar
│       ├── BuilderHeader.tsx                    # EXISTING - Nao modificar
│       ├── BlockPlaceholder.tsx                 # EXISTING - Manter para delay
│       ├── EmailBlock.tsx                       # NEW - Componente de email
│       └── index.ts                             # MODIFY - Exportar EmailBlock
├── stores/
│   └── use-builder-store.ts                     # EXISTING - Verificar types
├── types/
│   ├── email-block.ts                           # NEW - Tipos de email block
│   └── index.ts                                 # MODIFY - Exportar email-block
└── supabase/
    └── migrations/
        └── 00018_create_email_blocks.sql        # NEW - Tabela de email blocks
```

### Previous Story Intelligence

**From Story 5.2 (Campaign Builder Canvas):**
- `useBuilderStore` com blocks[], selectedBlockId, addBlock, updateBlock, selectBlock
- `BlockPlaceholder` com BLOCK_CONFIG para icones e cores por tipo
- `BuilderCanvas` renderiza blocos usando blocks.map()
- Pattern de drop zone com @dnd-kit/core
- Visual estilo Attio: clean, minimal, bordas sutis
- DndContext ja configurado na pagina do builder

**From Story 5.1 (Campaigns Page):**
- Pattern de RLS via campaign's tenant (subquery)
- Pattern de migration com trigger updated_at
- Pattern de tipos com Row e transform functions
- Pattern de Zod schemas para validacao

**From Architecture:**
- framer-motion para animacoes
- Zustand para UI state
- @dnd-kit para drag and drop
- shadcn/ui components (Input, Textarea)

### Git Intelligence

**Commit pattern esperado:**
```
feat(story-5.3): email block component
```

**Padroes recentes observados:**
- Code review fixes aplicados no mesmo commit
- Componentes seguem pattern shadcn/ui
- Animacoes com framer-motion (motion.div)
- Inputs com maxLength para validacao

### UX Design Notes

**Referencia Visual: Attio.com Sequences**

```
┌─────────────────────────────────────────────────────────┐
│  ⠿  📧  Step 1                                Email    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Assunto                                               │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Assunto do email                                  │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Conteudo                                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Conteudo do email...                              │ │
│  │                                                    │ │
│  │                                                    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Cores e Estados:**
- Default: border-border, shadow-sm
- Hover: hover:shadow-md
- Selected: border-primary, ring-2 ring-primary/20
- Drag handle: text-muted-foreground, hover:text-foreground

### O Que NAO Fazer

- NAO implementar DelayBlock nesta story - sera na Story 5.4
- NAO implementar conectores SVG - sera na Story 5.5
- NAO implementar reordenacao drag funcional - sera na Story 5.6
- NAO implementar geracao IA de texto - sera no Epic 6
- NAO criar API routes para email_blocks - apenas migration e tipos
- NAO persistir no banco - apenas estado local no store (persistencia sera futura)
- NAO usar useState para estado global - usar Zustand

### Testing Strategy

**Unit Tests:**
- Types: transformEmailBlockRow, Zod schemas validation
- EmailBlock: render, selecao visual, edicao subject/body, drag handle
- BuilderCanvas: renderizar EmailBlock para type="email", deselecao ao clicar fora
- Store integration: updateBlock atualiza data corretamente

**Test Patterns (de stories anteriores):**
```typescript
// Test EmailBlock render
describe("EmailBlock", () => {
  it("renders with step number and email type", () => {
    render(<EmailBlock block={mockBlock} stepNumber={1} />);
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("shows selected state when selectedBlockId matches", () => {
    // Mock store with selectedBlockId = block.id
    render(<EmailBlock block={mockBlock} stepNumber={1} />);
    expect(screen.getByTestId(`email-block-${mockBlock.id}`))
      .toHaveClass("border-primary");
  });

  it("updates store when subject changes", () => {
    render(<EmailBlock block={mockBlock} stepNumber={1} />);
    const input = screen.getByTestId("email-subject-input");
    fireEvent.change(input, { target: { value: "Novo assunto" } });
    expect(mockUpdateBlock).toHaveBeenCalledWith(mockBlock.id, {
      data: { subject: "Novo assunto", body: "" },
    });
  });
});

// Test BuilderCanvas with EmailBlock
describe("BuilderCanvas with EmailBlock", () => {
  it("renders EmailBlock for email type blocks", () => {
    // Setup store with email block
    render(<BuilderCanvas />);
    expect(screen.getByTestId(`email-block-${mockBlock.id}`))
      .toBeInTheDocument();
  });

  it("deselects block when clicking canvas", () => {
    render(<BuilderCanvas />);
    fireEvent.click(screen.getByTestId("builder-canvas"));
    expect(mockSelectBlock).toHaveBeenCalledWith(null);
  });
});
```

### NFR Compliance

- **Performance:** Componente otimizado com framer-motion, sem re-renders desnecessarios
- **Security:** RLS policies garantem isolamento por tenant
- **UX:** Feedback visual claro para selecao, placeholders em portugues
- **Accessibility:** Labels em inputs, aria-label no drag handle

### References

- [Source: src/stores/use-builder-store.ts] - Pattern de Zustand store e BuilderBlock type
- [Source: src/components/builder/BlockPlaceholder.tsx] - Pattern de bloco e BLOCK_CONFIG
- [Source: src/components/builder/BuilderCanvas.tsx] - Canvas com renderizacao de blocos
- [Source: supabase/migrations/00016_create_campaigns.sql] - Pattern de migration
- [Source: supabase/migrations/00017_add_campaign_leads_update_policy.sql] - RLS via campaign
- [Source: architecture.md#Frontend-Architecture] - framer-motion, Zustand
- [Source: architecture.md#Builder-Component-Architecture] - Compound components
- [Source: ux-design-specification.md#BuilderCanvas] - Estilo Attio
- [Source: epics.md#Epic-5-Story-5.3] - Requisitos da story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- Criada migration 00018_create_email_blocks.sql seguindo pattern de RLS via campaign's tenant (subquery)
- Tipos TypeScript criados com interfaces EmailBlock, EmailBlockRow, EmailBlockData e transform function
- Zod schemas para validacao: emailBlockDataSchema, createEmailBlockSchema, updateEmailBlockSchema
- Componente EmailBlock implementado com design Attio: header com drag handle, campos editaveis subject/body
- BuilderCanvas atualizado para renderizar EmailBlock para type="email" e BlockPlaceholder para type="delay"
- Click outside implementado para deselecionar blocos
- useBuilderStore verificado - funciona corretamente com data generico (Record<string, unknown>)
- Type-safe extraction de block.data implementada no EmailBlock
- 58 testes criados/atualizados passando (22 tipos, 25 EmailBlock, 13 BuilderCanvas)
- Build passando sem erros TypeScript

### Code Review Fixes (2026-02-02)

- **H1 FIX:** Adicionado useEffect para sincronizar estado local quando block.data muda externamente (undo/redo, server sync)
- **H2 FIX:** Adicionados 3 novos testes: sync de props, cobertura hasChanges, validacao body max length
- **H3 FIX:** Removido blockRef nao utilizado
- **M2 FIX:** Adicionado limite de 50000 caracteres para body no emailBlockDataSchema
- **M3 FIX:** Removido comentario JSDoc duplicado

### File List

**NEW:**
- supabase/migrations/00018_create_email_blocks.sql
- src/types/email-block.ts
- src/components/builder/EmailBlock.tsx
- __tests__/unit/types/email-block.test.ts
- __tests__/unit/components/builder/EmailBlock.test.tsx

**MODIFIED:**
- src/types/index.ts (added email-block export)
- src/components/builder/index.ts (added EmailBlock export)
- src/components/builder/BuilderCanvas.tsx (render EmailBlock, click to deselect)
- __tests__/unit/components/builder/BuilderCanvas.test.tsx (EmailBlock rendering, deselect tests)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Story 5.3 implementation complete | Claude Opus 4.5 |
| 2026-02-02 | Code review fixes: H1, H2, H3, M2, M3 | Claude Opus 4.5 |
