# Story 4.7: Import Campaign Results

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to import results from external campaigns,
so that I can track which leads showed interest.

## Context

Esta story implementa a **importacao de resultados de campanhas externas** (Instantly, Snov.io, ou outras ferramentas) para atualizar o status dos leads no sistema. O usuario podera fazer upload de CSV ou colar dados, mapear colunas, e o sistema atualizara os leads correspondentes baseado no email.

**IMPORTANTE:** Esta story opera sobre leads **persistidos** na pagina "Meus Leads" (/leads/my-leads). O sistema faz match por email com leads que ja existem no banco de dados. Leads nao encontrados podem ser opcionalmente criados durante a importacao.

**Requisitos Funcionais Cobertos:**
- FR12: Usuario pode importar resultados de campanhas externas (respostas, interesse)

**Dependencias (todas DONE):**
- Story 4.2 (Lead Status Management) - Status dropdown e labels existentes
- Story 4.2.1 (Lead Import Mechanism) - Mecanismo de importacao de leads
- Story 4.2.2 (My Leads Page) - Pagina com filtros e tabela
- Story 4.3 (Lead Detail View & Interaction History) - Historico de interacoes

**O que JA existe (reutilizar, NAO reimplementar):**
- `LeadStatus` e `leadStatusValues` - Tipos e valores de status em `src/types/lead.ts`
- `LeadInteraction` e `InteractionType` - Tipos de interacao em `src/types/interaction.ts` (inclui "import", "campaign_reply")
- `useCreateInteraction` - Hook para criar interacoes em `src/hooks/use-lead-interactions.ts`
- `useMyLeads` - Hook para buscar leads do banco em `src/hooks/use-my-leads.ts`
- `useImportLeads` - Hook para importar leads em `src/hooks/use-import-leads.ts`
- `MyLeadsPageContent` - Pagina de Meus Leads em `src/components/leads/MyLeadsPageContent.tsx`
- `Dialog`, `Input`, `Button`, `Select` - Componentes shadcn/ui
- Toast notifications via sonner

**O que FALTA implementar nesta story:**
1. Componente `ImportCampaignResultsDialog` - Modal com opcoes CSV/Paste
2. Hook `useImportCampaignResults` - Logica de importacao e matching
3. API route `/api/leads/import-results` - Endpoint de importacao
4. Integracao na `MyLeadsPageContent` - Botao "Importar Resultados"
5. Criacao de interacoes no historico para cada lead atualizado

## Acceptance Criteria

### AC #1 - Opcoes de Importacao (CSV ou Colar)

**Given** estou na pagina "Meus Leads" (/leads/my-leads)
**When** clico em "Importar Resultados"
**Then** um dialog modal abre com duas opcoes: "Upload CSV" e "Colar Dados"
**And** cada opcao tem instrucoes claras de uso
**And** posso alternar entre as opcoes via tabs

### AC #2 - Upload de CSV

**Given** selecionei a opcao "Upload CSV"
**When** faco upload de um arquivo .csv
**Then** o sistema faz parse do arquivo e mostra preview das primeiras linhas
**And** detecta automaticamente colunas como "email", "status", "replied", etc.
**And** posso mapear manualmente colunas se a deteccao automatica falhar
**And** arquivos maiores que 5MB sao rejeitados com mensagem clara

### AC #3 - Colar Dados (Paste)

**Given** selecionei a opcao "Colar Dados"
**When** colo dados no textarea (formato CSV ou tab-separated)
**Then** o sistema faz parse dos dados e mostra preview
**And** detecta automaticamente o delimitador (virgula, tab, ponto-e-virgula)
**And** posso mapear colunas da mesma forma que no CSV upload

### AC #4 - Mapeamento de Colunas

**Given** os dados foram carregados (via CSV ou paste)
**When** a tela de mapeamento aparece
**Then** vejo campos para mapear:
  - Email (obrigatorio) - coluna com email do lead
  - Tipo de Resposta (obrigatorio) - replied, clicked, bounced, unsubscribed, opened
**And** colunas detectadas automaticamente sao pre-selecionadas
**And** nao posso prosseguir sem mapear campos obrigatorios

### AC #5 - Processamento e Match por Email

**Given** confirmei o mapeamento de colunas
**When** clico em "Importar"
**Then** o sistema busca leads no banco por email (case-insensitive)
**And** leads encontrados tem status atualizado conforme tipo de resposta:
  - replied -> "interessado"
  - clicked -> manter status atual (apenas log)
  - opened -> manter status atual (apenas log)
  - bounced -> "nao_interessado"
  - unsubscribed -> "nao_interessado"
**And** cada atualizacao cria registro em lead_interactions com type="campaign_reply"
**And** vejo indicador de progresso durante processamento

### AC #6 - Sumario de Importacao

**Given** a importacao foi processada
**When** o processo termina
**Then** vejo sumario: "X leads atualizados, Y nao encontrados"
**And** se houver leads nao encontrados, vejo lista dos emails
**And** tenho opcao "Criar leads para emails nao encontrados"
**And** posso fechar o dialog e ver os resultados na tabela

### AC #7 - Criacao de Leads para Emails Nao Encontrados

**Given** a importacao teve emails nao encontrados
**When** seleciono "Criar leads para emails nao encontrados"
**Then** novos leads sao criados com:
  - email preenchido
  - firstName como parte antes do @ do email
  - status baseado no tipo de resposta
**And** cada lead criado tem registro em lead_interactions com type="import"
**And** o sumario atualiza mostrando leads criados

### AC #8 - Validacao de Dados

**Given** estou importando dados
**When** o sistema valida os dados
**Then** emails invalidos sao ignorados com aviso
**And** linhas sem email sao puladas
**And** tipos de resposta desconhecidos sao tratados como "unknown" (apenas log, sem mudanca de status)
**And** ao final, vejo contagem de linhas ignoradas e motivo

## Tasks / Subtasks

- [x] Task 1: Criar tipos e schemas para importacao (AC: #4, #5, #8)
  - [x] 1.1 Criar `src/types/campaign-import.ts` com interfaces
  - [x] 1.2 Definir `ResponseType` enum: replied, clicked, opened, bounced, unsubscribed, unknown
  - [x] 1.3 Criar Zod schemas para validacao de dados importados
  - [x] 1.4 Mapear `ResponseType` para `LeadStatus`

- [x] Task 2: Criar API route para importacao (AC: #5, #6, #7, #8)
  - [x] 2.1 Criar `src/app/api/leads/import-results/route.ts`
  - [x] 2.2 Implementar validacao de entrada com Zod
  - [x] 2.3 Implementar match por email (case-insensitive) usando ilike
  - [x] 2.4 Atualizar status dos leads encontrados
  - [x] 2.5 Criar interacoes em lead_interactions para cada atualizacao
  - [x] 2.6 Retornar sumario com matched, unmatched, errors

- [x] Task 3: Criar hook useImportCampaignResults (AC: #5, #6)
  - [x] 3.1 Criar `src/hooks/use-import-campaign-results.ts`
  - [x] 3.2 Implementar mutacao TanStack Query
  - [x] 3.3 Invalidar queries de leads apos sucesso
  - [x] 3.4 Implementar estados de loading e erro

- [x] Task 4: Criar componente ImportCampaignResultsDialog (AC: #1, #2, #3, #4)
  - [x] 4.1 Criar `src/components/leads/ImportCampaignResultsDialog.tsx`
  - [x] 4.2 Implementar tabs para CSV Upload e Paste
  - [x] 4.3 Implementar upload de arquivo com drag-and-drop
  - [x] 4.4 Implementar textarea para paste de dados
  - [x] 4.5 Implementar parser de CSV/TSV com deteccao automatica
  - [x] 4.6 Implementar tela de mapeamento de colunas
  - [x] 4.7 Implementar preview dos dados

- [x] Task 5: Criar componente ImportResultsSummary (AC: #6, #7)
  - [x] 5.1 Criar `src/components/leads/ImportResultsSummary.tsx`
  - [x] 5.2 Exibir contadores: atualizados, nao encontrados, erros
  - [x] 5.3 Exibir lista de emails nao encontrados
  - [x] 5.4 Implementar botao "Criar leads para nao encontrados"

- [x] Task 6: Integrar na MyLeadsPageContent (AC: #1)
  - [x] 6.1 Adicionar botao "Importar Resultados" no header
  - [x] 6.2 Adicionar state para controlar abertura do dialog
  - [x] 6.3 Renderizar ImportCampaignResultsDialog
  - [x] 6.4 Atualizar exports em index.ts

- [x] Task 7: Testes unitarios (AC: todos)
  - [x] 7.1 Teste para API route: match, update, create interactions
  - [x] 7.2 Teste para hook: mutacao e invalidacao
  - [x] 7.3 Teste para dialog: tabs, upload, paste, mapeamento
  - [x] 7.4 Teste para summary: contadores e criacao de leads
  - [x] 7.5 Teste para parser CSV: delimitadores, deteccao de colunas

- [x] Task 8: Verificar build e testes (AC: N/A)
  - [x] 8.1 Executar todos os testes
  - [x] 8.2 Verificar build sem erros

## Dev Notes

### Arquitetura e Padroes

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| API Response Format | Usar `APISuccessResponse<T>` e `APIErrorResponse` |
| Component structure | shadcn Dialog + Tabs para modal |
| State management | TanStack Query para mutacao |
| Validation | Zod schemas para entrada de dados |
| Error handling | Mensagens em portugues, toast feedback |
| Naming | camelCase para TypeScript, snake_case para DB |

### Tipos para Importacao

```typescript
// src/types/campaign-import.ts

import { z } from "zod";
import type { LeadStatus } from "@/types/lead";

// Response types from campaign tools
export const responseTypeValues = [
  "replied",
  "clicked",
  "opened",
  "bounced",
  "unsubscribed",
  "unknown",
] as const;

export type ResponseType = (typeof responseTypeValues)[number];

// Mapping response type to lead status
export const responseToStatus: Record<ResponseType, LeadStatus | null> = {
  replied: "interessado",
  clicked: null, // No status change, just log
  opened: null,  // No status change, just log
  bounced: "nao_interessado",
  unsubscribed: "nao_interessado",
  unknown: null, // No status change, just log
};

// Single import row
export interface CampaignResultRow {
  email: string;
  responseType: ResponseType;
  originalData?: Record<string, string>; // For reference
}

// Import request
export const importCampaignResultsSchema = z.object({
  results: z.array(z.object({
    email: z.string().email(),
    responseType: z.enum(responseTypeValues),
  })).min(1, "Pelo menos um resultado e necessario"),
});

export type ImportCampaignResultsInput = z.infer<typeof importCampaignResultsSchema>;

// Import response
export interface ImportCampaignResultsResponse {
  matched: number;
  updated: number;
  unmatched: string[]; // List of unmatched emails
  errors: string[];
  created?: number; // If user chose to create leads
}
```

### API Route Implementation

```typescript
// src/app/api/leads/import-results/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importCampaignResultsSchema, responseToStatus } from "@/types/campaign-import";
import type { ImportCampaignResultsResponse } from "@/types/campaign-import";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const parsed = importCampaignResultsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados invalidos" } },
      { status: 400 }
    );
  }

  const { results } = parsed.data;
  const response: ImportCampaignResultsResponse = {
    matched: 0,
    updated: 0,
    unmatched: [],
    errors: [],
  };

  // Process each result
  for (const result of results) {
    // Find lead by email (case-insensitive)
    const { data: lead, error: findError } = await supabase
      .from("leads")
      .select("id, status, email")
      .ilike("email", result.email)
      .single();

    if (findError || !lead) {
      response.unmatched.push(result.email);
      continue;
    }

    response.matched++;

    // Get new status (or null if no change)
    const newStatus = responseToStatus[result.responseType];

    // Update status if needed
    if (newStatus && lead.status !== newStatus) {
      const { error: updateError } = await supabase
        .from("leads")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      if (updateError) {
        response.errors.push(`Erro ao atualizar ${result.email}`);
        continue;
      }
      response.updated++;
    }

    // Create interaction record
    await supabase.from("lead_interactions").insert({
      lead_id: lead.id,
      type: "campaign_reply",
      content: `Resposta de campanha: ${result.responseType}`,
      created_by: user.id,
    });
  }

  return NextResponse.json({ data: response });
}
```

### CSV Parser Logic

```typescript
// Utility for parsing CSV/TSV data

export function parseCSVData(text: string): { headers: string[]; rows: string[][] } {
  // Detect delimiter (comma, tab, semicolon)
  const firstLine = text.split("\n")[0];
  const delimiter = detectDelimiter(firstLine);

  const lines = text.trim().split("\n");
  const headers = parseCSVLine(lines[0], delimiter);
  const rows = lines.slice(1).map(line => parseCSVLine(line, delimiter));

  return { headers, rows };
}

function detectDelimiter(line: string): string {
  const delimiters = [",", "\t", ";"];
  let maxCount = 0;
  let detected = ",";

  for (const d of delimiters) {
    const count = (line.match(new RegExp(d, "g")) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detected = d;
    }
  }

  return detected;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  // Handle quoted values
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// Auto-detect column mappings
export function detectColumnMappings(headers: string[]): {
  emailColumn: number | null;
  responseColumn: number | null;
} {
  const lowerHeaders = headers.map(h => h.toLowerCase());

  const emailPatterns = ["email", "e-mail", "email_address", "emailaddress"];
  const responsePatterns = ["status", "response", "replied", "action", "event", "type"];

  return {
    emailColumn: lowerHeaders.findIndex(h => emailPatterns.some(p => h.includes(p))),
    responseColumn: lowerHeaders.findIndex(h => responsePatterns.some(p => h.includes(p))),
  };
}

// Parse response type from various formats
export function parseResponseType(value: string): ResponseType {
  const lower = value.toLowerCase().trim();

  if (["replied", "reply", "respondeu", "responded"].includes(lower)) return "replied";
  if (["clicked", "click", "clicou"].includes(lower)) return "clicked";
  if (["opened", "open", "abriu"].includes(lower)) return "opened";
  if (["bounced", "bounce", "retornou", "failed"].includes(lower)) return "bounced";
  if (["unsubscribed", "unsubscribe", "descadastrou", "optout", "opt-out"].includes(lower)) return "unsubscribed";

  return "unknown";
}
```

### Component Dialog Structure

```tsx
// src/components/leads/ImportCampaignResultsDialog.tsx

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, ClipboardPaste } from "lucide-react";

type ImportStep = "input" | "mapping" | "processing" | "summary";

interface ImportCampaignResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportCampaignResultsDialog({
  open,
  onOpenChange,
}: ImportCampaignResultsDialogProps) {
  const [step, setStep] = useState<ImportStep>("input");
  const [parsedData, setParsedData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<{
    emailColumn: number;
    responseColumn: number;
  } | null>(null);

  // ... implementation

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Resultados de Campanha</DialogTitle>
          <DialogDescription>
            Importe resultados de campanhas externas (Instantly, Snov.io, etc.)
            para atualizar o status dos leads.
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <Tabs defaultValue="upload">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </TabsTrigger>
              <TabsTrigger value="paste">
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Colar Dados
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload">
              {/* File upload dropzone */}
            </TabsContent>
            <TabsContent value="paste">
              {/* Textarea for pasting */}
            </TabsContent>
          </Tabs>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            {/* Column mapping selects */}
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center py-8">
            {/* Loading spinner and progress */}
          </div>
        )}

        {step === "summary" && (
          <div className="space-y-4">
            {/* ImportResultsSummary component */}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### Integracao na MyLeadsPageContent

```tsx
// Adicionar ao MyLeadsPageContent.tsx

import { useState } from "react";
import { ImportCampaignResultsDialog } from "@/components/leads/ImportCampaignResultsDialog";
import { Upload } from "lucide-react";

// Dentro do componente, apos outros states:
const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

// No CardHeader, adicionar botao:
<div className="flex items-center gap-2">
  <Button
    variant="outline"
    size="sm"
    onClick={() => setIsImportDialogOpen(true)}
  >
    <Upload className="h-4 w-4 mr-2" />
    Importar Resultados
  </Button>
</div>

// Antes do fechamento do componente:
<ImportCampaignResultsDialog
  open={isImportDialogOpen}
  onOpenChange={setIsImportDialogOpen}
/>
```

### Project Structure Notes

```
src/
├── app/
│   └── api/
│       └── leads/
│           └── import-results/
│               └── route.ts                  # NEW - API endpoint
├── components/
│   └── leads/
│       ├── ImportCampaignResultsDialog.tsx   # NEW - Main dialog
│       ├── ImportResultsSummary.tsx          # NEW - Summary component
│       ├── MyLeadsPageContent.tsx            # MODIFY - Add button and dialog
│       └── index.ts                          # MODIFY - Add exports
├── hooks/
│   └── use-import-campaign-results.ts        # NEW - TanStack mutation
├── types/
│   └── campaign-import.ts                    # NEW - Types and schemas
└── lib/
    └── utils/
        └── csv-parser.ts                     # NEW - CSV parsing utilities
```

### Previous Story Intelligence

**From Story 4.2.1 (Lead Import Mechanism):**
- Pattern para importar leads: POST para `/api/leads/import`
- `useImportLeads` hook com `useMutation`
- Toast feedback para sucesso/erro
- Invalidacao de queries apos mutacao

**From Story 4.3 (Lead Detail View & Interaction History):**
- `lead_interactions` table com type enum: note, status_change, import, campaign_sent, campaign_reply
- `useCreateInteraction` hook para criar interacoes
- Interacoes ordenadas por created_at desc

**From Story 4.6 (Interested Leads Highlighting):**
- Status "interessado" ja tem destaque visual na tabela
- Leads atualizados para "interessado" serao automaticamente destacados

### Git Intelligence

**Commit pattern:**
```
feat(story-4.7): import campaign results with code review fixes
```

**Recent patterns observed:**
- Componentes dialog seguem padrao shadcn/ui
- Hooks usam TanStack Query com invalidateQueries
- API routes usam Zod para validacao
- Mensagens de erro sempre em portugues

### UX Design Notes

**Dialog Flow:**
1. Input Step: Tabs para CSV Upload ou Paste
2. Mapping Step: Selects para mapear colunas
3. Processing Step: Spinner com progresso
4. Summary Step: Contadores e lista de nao encontrados

**Feedback Visual:**
- Loading state com mensagem descritiva
- Toast de sucesso com contagem
- Lista de erros/avisos claramente separada
- Botao de acao para criar leads ausentes

### O Que NAO Fazer

- NAO criar nova estrutura de importacao - reutilizar padroes de Story 4.2.1
- NAO modificar tipos de interaction existentes - usar "campaign_reply" ja definido
- NAO fazer match case-sensitive de email - usar ilike do Supabase
- NAO processar arquivos no frontend - enviar dados para API
- NAO permitir CSV > 5MB - limitar no frontend
- NAO criar leads automaticamente - apenas com confirmacao explicita

### Testing Strategy

**Unit Tests:**
- CSV Parser: diferentes delimitadores, valores com aspas, deteccao de colunas
- API Route: match, update, interaction creation, error handling
- Hook: mutacao, loading state, invalidacao
- Dialog: steps, tabs, upload, paste, mapeamento

**Test Mocks:**
- Mock Supabase client para DB operations
- Mock file input para upload
- Mock clipboard API para paste

### NFR Compliance

- **Performance:** Processamento batch na API (nao individual)
- **Security:** Validacao Zod na entrada, auth check
- **UX:** Feedback claro, progresso visivel, mensagens em portugues
- **Accessibility:** Labels nos forms, feedback de erros claro

### References

- [Source: src/types/lead.ts] - Tipos de status e transformacoes
- [Source: src/types/interaction.ts] - Tipos de interacao (campaign_reply)
- [Source: src/hooks/use-import-leads.ts] - Padrao de hook de importacao
- [Source: src/hooks/use-lead-interactions.ts] - Hook de interacoes
- [Source: src/components/leads/MyLeadsPageContent.tsx] - Pagina a integrar
- [Source: architecture.md#API-Response-Format] - Formato padrao de resposta
- [Source: epics.md#Story-4.7] - Requisitos da story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

- 2026-02-02: Implementação completa da Story 4.7 - Import Campaign Results
- Criados tipos e schemas com mapeamento responseType → LeadStatus
- API route implementada com match por email case-insensitive via ilike
- Hook TanStack Query com invalidação de queries de leads
- Dialog multi-step: input (upload/paste) → mapping → processing → summary
- CSV parser com detecção automática de delimitador (comma, tab, semicolon)
- Detecção automática de colunas de email e response
- Suporte a criação opcional de leads para emails não encontrados
- 113 testes unitários passando (27 tipos, 14 API, 7 hook, 12 dialog, 18 summary, 35 CSV parser)
- Build Next.js bem-sucedido
- Nota: 1 teste falho em LoginPage.test.tsx é problema pré-existente não relacionado

**Code Review Fixes (2026-02-02):**
- HIGH-1: Implementado drag-and-drop real (onDragOver, onDragEnter, onDragLeave, onDrop handlers)
- HIGH-2: API refatorada para batch processing (1 query para buscar leads, batch updates por status)
- HIGH-3: Melhor tratamento de erros com batch operations e logging
- HIGH-4: Email regex melhorado (previne dots consecutivos e @@ symbols)
- HIGH-5: Adicionados 7 testes para drag-and-drop e 2 para email validation
- MED-1: Adicionado console.error logging no processData catch
- MED-2: Melhorada validação MIME type com isValidCSVFile function
- MED-3: Adicionado indicador de progresso com contagem de leads sendo processados
- 122 testes unitários passando após fixes

### File List

**Novos arquivos:**
- src/types/campaign-import.ts
- src/app/api/leads/import-results/route.ts
- src/hooks/use-import-campaign-results.ts
- src/components/leads/ImportCampaignResultsDialog.tsx
- src/components/leads/ImportResultsSummary.tsx
- src/lib/utils/csv-parser.ts
- __tests__/unit/types/campaign-import.test.ts
- __tests__/unit/api/leads-import-results.test.ts
- __tests__/unit/hooks/use-import-campaign-results.test.tsx
- __tests__/unit/components/leads/ImportCampaignResultsDialog.test.tsx
- __tests__/unit/components/leads/ImportResultsSummary.test.tsx
- __tests__/unit/lib/utils/csv-parser.test.ts

**Arquivos modificados:**
- src/components/leads/MyLeadsPageContent.tsx (+ botão "Importar Resultados" e dialog)
- src/components/leads/index.ts (+ exports para novos componentes)
- __tests__/unit/components/leads/LeadDetailPanel.test.tsx (fix: acento em "interação")

## Change Log

- 2026-02-02: Story 4.7 implementada - Importação de resultados de campanhas externas
- 2026-02-02: Code Review - Corrigidos 5 issues HIGH e 3 issues MEDIUM (drag-and-drop, batch processing, email validation, progress indicator)

