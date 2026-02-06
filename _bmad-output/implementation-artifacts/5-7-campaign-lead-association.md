# Story 5.7: Campaign Lead Association

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to associate leads with my campaign,
so that I know who will receive this sequence.

## Context

Esta story implementa a funcionalidade de **associar leads a uma campanha** no builder. Os usuarios podem adicionar leads de duas formas:
1. Clicando em "Adicionar Leads" dentro do builder (abre modal com lista de leads)
2. Vindo da pagina de Leads com leads pre-selecionados (ao clicar "Criar Campanha")

**Requisitos Funcionais Cobertos:**
- FR18: Associar leads selecionados a uma campanha

**Relacao com outras Stories do Epic 5:**
- **Story 5.1 (DONE):** Campaigns page, data model, campaign_leads junction table
- **Story 5.2 (DONE):** Builder Canvas, Sidebar, Header, useBuilderStore
- **Story 5.3 (DONE):** Email Block Component
- **Story 5.4 (DONE):** Delay Block Component
- **Story 5.5 (DONE):** Sequence Connector Lines
- **Story 5.6 (DONE):** Block Drag & Reorder
- **Story 5.8:** Campaign Preview
- **Story 5.9:** Campaign Save & Multiple Campaigns

**O que JA existe (reutilizar, NAO reimplementar):**
- `campaign_leads` table - Junction table com campaign_id, lead_id, RLS policies
- `CampaignLead`, `CampaignLeadRow`, `transformCampaignLeadRow` - Types em `src/types/campaign.ts`
- `useSelectionStore` - Store Zustand para selecao de leads (selectedIds)
- `useMyLeads` hook - Para buscar leads persistidos do banco de dados
- `Lead` interface - Types em `src/types/lead.ts`
- `Dialog` component - shadcn/ui dialog pattern
- `BuilderHeader` - Header do builder que precisa mostrar lead count
- `CreateSegmentDialog` - Pattern de dialog com form validation (referencia)

**O que FALTA implementar nesta story:**
1. Componente `AddLeadsDialog` - Modal para buscar/filtrar/selecionar leads
2. Extensao do `useBuilderStore` para incluir `campaignLeads` array
3. Hook `useCampaignLeads` para gerenciar leads da campanha (fetch, add, remove)
4. API routes para campaign_leads CRUD (POST /api/campaigns/[id]/leads, DELETE)
5. Modificacao do `BuilderHeader` para mostrar lead count
6. Fluxo de "Criar Campanha" vindo da pagina de Leads com leads pre-selecionados

## Acceptance Criteria

### AC #1 - Abrir Modal de Adicionar Leads

**Given** estou no campaign builder
**When** clico em "Adicionar Leads"
**Then** um modal se abre mostrando meus leads disponiveis
**And** vejo uma tabela com colunas: checkbox, Nome, Empresa, Email
**And** vejo um campo de busca para filtrar leads
**And** vejo contagem de leads selecionados

### AC #2 - Buscar e Filtrar Leads no Modal

**Given** o modal de adicionar leads esta aberto
**When** digito no campo de busca
**Then** a lista de leads e filtrada em tempo real (debounced 300ms)
**And** a busca considera nome, empresa e email

### AC #3 - Selecionar Leads no Modal

**Given** o modal de adicionar leads esta aberto
**When** clico no checkbox de um lead
**Then** o lead e selecionado (checkbox marcado)
**And** o contador de "X leads selecionados" atualiza
**And** posso selecionar multiplos leads

**When** clico no checkbox do header
**Then** todos os leads visiveis sao selecionados/deselecionados

### AC #4 - Associar Leads a Campanha

**Given** tenho leads selecionados no modal
**When** clico em "Adicionar"
**Then** os leads sao associados a campanha via API
**And** o modal fecha
**And** vejo toast de sucesso "X leads adicionados"
**And** o header do builder atualiza o lead count
**And** hasChanges e marcado como true no store

### AC #5 - Mostrar Lead Count no Header

**Given** estou no campaign builder
**When** a campanha tem leads associados
**Then** o header mostra "X leads" proximo ao nome da campanha
**And** a contagem atualiza quando adiciono/removo leads

### AC #6 - Fluxo Vindo da Pagina de Leads

**Given** tenho leads selecionados na pagina de Leads (/leads/my-leads)
**When** clico em "Criar Campanha" no selection bar
**Then** sou redirecionado para nova campanha
**And** os leads selecionados sao automaticamente associados
**And** vejo os leads ja listados na campanha

### AC #7 - Ver Leads Associados

**Given** a campanha tem leads associados
**When** clico em "Ver Leads" ou no contador de leads
**Then** o modal abre mostrando os leads ja associados
**And** leads associados aparecem marcados/destacados
**And** posso remover leads existentes

### AC #8 - Remover Leads da Campanha

**Given** estou visualizando leads da campanha no modal
**When** clico em "Remover" em um lead associado
**Then** o lead e removido da campanha
**And** vejo toast de confirmacao
**And** o lead count no header atualiza

## Tasks / Subtasks

- [x] Task 1: Criar API routes para campaign_leads (AC: #4, #8)
  - [x] 1.1 Criar `src/app/api/campaigns/[campaignId]/leads/route.ts`
  - [x] 1.2 Implementar GET para listar leads da campanha
  - [x] 1.3 Implementar POST para adicionar leads (array de lead_ids)
  - [x] 1.4 Implementar DELETE para remover lead individual
  - [x] 1.5 Validar campaignId e leadIds como UUIDs
  - [x] 1.6 Usar RLS para isolamento de tenant

- [x] Task 2: Criar hook useCampaignLeads (AC: #4, #7, #8)
  - [x] 2.1 Criar `src/hooks/use-campaign-leads.ts`
  - [x] 2.2 Implementar fetch dos leads da campanha via TanStack Query
  - [x] 2.3 Implementar mutation para adicionar leads
  - [x] 2.4 Implementar mutation para remover leads
  - [x] 2.5 Invalidar cache do campaign e leads ao mutar

- [x] Task 3: Estender useBuilderStore para leads (AC: #5)
  - [x] 3.1 Adicionar `leadCount: number` ao state
  - [x] 3.2 Adicionar `setLeadCount: (count: number) => void` action
  - [x] 3.3 Resetar leadCount no reset()

- [x] Task 4: Criar componente AddLeadsDialog (AC: #1, #2, #3, #4, #7, #8)
  - [x] 4.1 Criar `src/components/builder/AddLeadsDialog.tsx`
  - [x] 4.2 Usar shadcn Dialog com tamanho lg
  - [x] 4.3 Implementar busca com debounce de 300ms
  - [x] 4.4 Implementar tabela de leads com checkbox
  - [x] 4.5 Implementar selecao individual e em lote
  - [x] 4.6 Implementar contador de leads selecionados
  - [x] 4.7 Implementar estado loading durante add/remove
  - [x] 4.8 Destacar leads ja associados a campanha

- [x] Task 5: Modificar BuilderHeader para lead count (AC: #5)
  - [x] 5.1 Adicionar prop `leadCount?: number`
  - [x] 5.2 Adicionar botao "Adicionar Leads" ou "X leads"
  - [x] 5.3 Abrir AddLeadsDialog ao clicar no botao
  - [x] 5.4 Estilizar badge de lead count

- [x] Task 6: Modificar page do builder para integrar leads (AC: #6)
  - [x] 6.1 Ler query params para leads pre-selecionados
  - [x] 6.2 Auto-associar leads ao criar campanha se vindo de /leads
  - [x] 6.3 Carregar lead count da campanha existente
  - [x] 6.4 Integrar AddLeadsDialog no builder page

- [x] Task 7: Modificar LeadSelectionBar para "Criar Campanha" (AC: #6)
  - [x] 7.1 Adicionar botao "Criar Campanha" no selection bar
  - [x] 7.2 Navegar para /campaigns/new?leads=id1,id2,id3
  - [x] 7.3 Passar IDs via query string

- [x] Task 8: Testes unitarios (AC: todos)
  - [x] 8.1 Teste: AddLeadsDialog renderiza e abre
  - [x] 8.2 Teste: Busca filtra leads corretamente
  - [x] 8.3 Teste: Selecao individual e em lote funciona
  - [x] 8.4 Teste: Adicionar leads chama API e fecha modal
  - [x] 8.5 Teste: Remover lead chama API
  - [x] 8.6 Teste: Lead count atualiza no header
  - [x] 8.7 Teste: API route campaign_leads CRUD
  - [x] 8.8 Atualizar testes do BuilderHeader

- [x] Task 9: Exportar e verificar build (AC: N/A)
  - [x] 9.1 Adicionar AddLeadsDialog ao `src/components/builder/index.ts`
  - [x] 9.2 Executar todos os testes
  - [x] 9.3 Verificar build sem erros

## Dev Notes

### Arquitetura e Padroes

**MUST Follow:**

| Rule | Implementation |
|------|----------------|
| Component naming | PascalCase para componentes React |
| State management | Zustand (useBuilderStore) para UI state |
| Server state | TanStack Query para dados do servidor |
| Form validation | react-hook-form + zod para forms |
| API response | Formato padrao APISuccessResponse/APIErrorResponse |
| Error messages | Sempre em portugues |
| Accessibility | ARIA labels, keyboard navigation |

### API Routes - Campaign Leads

```typescript
// src/app/api/campaigns/[campaignId]/leads/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Schema for adding leads
const addLeadsSchema = z.object({
  leadIds: z.array(z.string().regex(UUID_REGEX, "ID de lead invalido")).min(1),
});

interface RouteParams {
  params: Promise<{ campaignId: string }>;
}

/**
 * GET /api/campaigns/[campaignId]/leads
 * List leads associated with a campaign
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { campaignId } = await params;

  // Validate UUID
  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de campanha invalido" } },
      { status: 400 }
    );
  }

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Fetch leads via junction table
  const { data, error } = await supabase
    .from("campaign_leads")
    .select(`
      id,
      added_at,
      lead:leads (
        id, first_name, last_name, email, company_name, title, photo_url
      )
    `)
    .eq("campaign_id", campaignId);

  if (error) {
    console.error("[Campaign Leads API] GET error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar leads da campanha" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/campaigns/[campaignId]/leads
 * Add leads to campaign
 */
export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await createClient();
  const { campaignId } = await params;

  // Validate UUID
  if (!UUID_REGEX.test(campaignId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "ID de campanha invalido" } },
      { status: 400 }
    );
  }

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Parse and validate body
  const body = await request.json();
  const parsed = addLeadsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "IDs de leads invalidos" } },
      { status: 400 }
    );
  }

  // Insert campaign_leads (upsert to handle duplicates)
  const insertData = parsed.data.leadIds.map((leadId) => ({
    campaign_id: campaignId,
    lead_id: leadId,
  }));

  const { data, error } = await supabase
    .from("campaign_leads")
    .upsert(insertData, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true })
    .select();

  if (error) {
    console.error("[Campaign Leads API] POST error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao adicionar leads" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data, meta: { added: data.length } }, { status: 201 });
}
```

### useCampaignLeads Hook

```typescript
// src/hooks/use-campaign-leads.ts

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Lead } from "@/types/lead";

interface CampaignLeadWithLead {
  id: string;
  added_at: string;
  lead: Pick<Lead, "id" | "firstName" | "lastName" | "email" | "companyName" | "title" | "photoUrl">;
}

/**
 * Hook for managing leads associated with a campaign
 */
export function useCampaignLeads(campaignId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaign-leads", campaignId],
    queryFn: async () => {
      if (!campaignId) return [];
      const res = await fetch(`/api/campaigns/${campaignId}/leads`);
      const result = await res.json();
      if (result.error) throw new Error(result.error.message);
      return result.data as CampaignLeadWithLead[];
    },
    enabled: !!campaignId,
  });

  const addLeads = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (!campaignId) throw new Error("Campaign ID required");
      const res = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error.message);
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      toast.success(`${variables.length} lead${variables.length > 1 ? "s" : ""} adicionado${variables.length > 1 ? "s" : ""}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar leads");
    },
  });

  const removeLead = useMutation({
    mutationFn: async (leadId: string) => {
      if (!campaignId) throw new Error("Campaign ID required");
      const res = await fetch(`/api/campaigns/${campaignId}/leads/${leadId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error?.message || "Erro ao remover lead");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      toast.success("Lead removido da campanha");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao remover lead");
    },
  });

  return {
    leads: data ?? [],
    leadCount: data?.length ?? 0,
    isLoading,
    error: error instanceof Error ? error.message : null,
    addLeads,
    removeLead,
  };
}
```

### AddLeadsDialog Component

```tsx
// src/components/builder/AddLeadsDialog.tsx

"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, Loader2, Users, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebounce } from "@/hooks/use-debounce";
import { useMyLeads } from "@/hooks/use-my-leads";
import { useCampaignLeads } from "@/hooks/use-campaign-leads";
import type { Lead } from "@/types/lead";

interface AddLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  onLeadsAdded?: () => void;
}

export function AddLeadsDialog({
  open,
  onOpenChange,
  campaignId,
  onLeadsAdded,
}: AddLeadsDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(search, 300);

  const { leads, isLoading } = useMyLeads({ search: debouncedSearch });
  const { leads: campaignLeads, addLeads, removeLead } = useCampaignLeads(campaignId);

  // Set of lead IDs already in campaign
  const existingLeadIds = useMemo(
    () => new Set(campaignLeads.map((cl) => cl.lead.id)),
    [campaignLeads]
  );

  // Toggle single lead selection
  const toggleLead = useCallback((leadId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }, []);

  // Toggle all visible leads
  const toggleAll = useCallback(() => {
    const availableIds = leads
      .filter((l) => !existingLeadIds.has(l.id))
      .map((l) => l.id);

    setSelectedIds((prev) => {
      const allSelected = availableIds.every((id) => prev.has(id));
      if (allSelected) {
        // Deselect all
        return new Set();
      } else {
        // Select all available
        return new Set(availableIds);
      }
    });
  }, [leads, existingLeadIds]);

  // Handle add leads
  const handleAddLeads = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await addLeads.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
    onLeadsAdded?.();
  }, [selectedIds, addLeads, onLeadsAdded]);

  // Handle remove lead
  const handleRemoveLead = useCallback(
    async (leadId: string) => {
      await removeLead.mutateAsync(leadId);
    },
    [removeLead]
  );

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setSearch("");
        setSelectedIds(new Set());
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  const availableLeads = leads.filter((l) => !existingLeadIds.has(l.id));
  const isAllSelected =
    availableLeads.length > 0 &&
    availableLeads.every((l) => selectedIds.has(l.id));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Leads</DialogTitle>
          <DialogDescription>
            Selecione os leads que deseja adicionar a esta campanha.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, empresa ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="lead-search-input"
          />
        </div>

        {/* Leads already in campaign */}
        {campaignLeads.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Leads na campanha ({campaignLeads.length})
            </p>
            <ScrollArea className="h-24 rounded-md border">
              <div className="p-2 space-y-1">
                {campaignLeads.map((cl) => (
                  <div
                    key={cl.id}
                    className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted"
                  >
                    <span className="text-sm">
                      {cl.lead.firstName} {cl.lead.lastName} - {cl.lead.companyName}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleRemoveLead(cl.lead.id)}
                      disabled={removeLead.isPending}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Available leads */}
        <div className="flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              Leads disponiveis ({availableLeads.length})
            </p>
            {selectedIds.size > 0 && (
              <span className="text-sm text-primary">
                {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : availableLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mb-2" />
              <p className="text-sm">
                {search ? "Nenhum lead encontrado" : "Nenhum lead disponivel"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2">
                {/* Header with select all */}
                <div className="flex items-center gap-3 px-2 py-1.5 border-b">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                  <span className="text-sm font-medium">Selecionar todos</span>
                </div>

                {/* Lead rows */}
                {availableLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    isSelected={selectedIds.has(lead.id)}
                    onToggle={() => toggleLead(lead.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleAddLeads}
            disabled={selectedIds.size === 0 || addLeads.isPending}
            data-testid="add-leads-submit"
          >
            {addLeads.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              `Adicionar ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Lead row component
function LeadRow({
  lead,
  isSelected,
  onToggle,
}: {
  lead: Lead;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const initials = `${lead.firstName?.[0] || ""}${lead.lastName?.[0] || ""}`.toUpperCase();

  return (
    <div
      className="flex items-center gap-3 px-2 py-2 hover:bg-muted rounded cursor-pointer"
      onClick={onToggle}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Selecionar ${lead.firstName} ${lead.lastName}`}
      />
      <Avatar className="h-8 w-8">
        <AvatarImage src={lead.photoUrl || undefined} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {lead.firstName} {lead.lastName}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {lead.title} {lead.companyName ? `@ ${lead.companyName}` : ""}
        </p>
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[150px]">
        {lead.email}
      </span>
    </div>
  );
}
```

### BuilderHeader Modifications

```tsx
// Adicionar ao BuilderHeader.tsx

interface BuilderHeaderProps {
  campaignName: string;
  campaignStatus: CampaignStatus;
  leadCount?: number; // NEW
  onNameChange?: (name: string) => void;
  onSave?: () => void;
  onAddLeads?: () => void; // NEW
  isSaving?: boolean;
}

// No JSX, apos o status badge:
<div className="h-6 w-px bg-border" />

{/* Lead count button */}
<Button
  variant="ghost"
  size="sm"
  onClick={onAddLeads}
  className="gap-1.5"
  data-testid="lead-count-button"
>
  <Users className="h-4 w-4" />
  {leadCount ?? 0} lead{(leadCount ?? 0) !== 1 ? "s" : ""}
</Button>
```

### Project Structure Notes

```
src/
├── app/
│   └── api/
│       └── campaigns/
│           └── [campaignId]/
│               └── leads/
│                   ├── route.ts              # NEW - GET, POST
│                   └── [leadId]/
│                       └── route.ts          # NEW - DELETE
├── components/
│   └── builder/
│       ├── AddLeadsDialog.tsx                # NEW
│       ├── BuilderHeader.tsx                 # MODIFY - Add lead count
│       └── index.ts                          # MODIFY - Export AddLeadsDialog
├── hooks/
│   └── use-campaign-leads.ts                 # NEW
├── stores/
│   └── use-builder-store.ts                  # MODIFY - Add leadCount
└── types/
    └── campaign.ts                           # EXISTING - Already has CampaignLead types
```

### Previous Story Intelligence

**From Story 5.6 (Block Drag & Reorder):**
- Pattern de componente wrapper com props especificas
- Pattern de data-testid para testes
- useSortable pattern se necessario

**From Story 5.2 (Campaign Builder Canvas):**
- BuilderHeader ja existe com props bem definidas
- useBuilderStore pattern estabelecido
- Pattern de campaign page structure

**From Story 4.1 (Lead Segments/Lists):**
- CreateSegmentDialog como referencia de dialog pattern
- react-hook-form + zod para validacao
- toast para feedback

**From Story 4.2.2 (My Leads Page):**
- useMyLeads hook para buscar leads persistidos
- Pattern de filtragem com debounce

### Git Intelligence

**Commit pattern esperado:**
```
feat(story-5.7): campaign lead association
```

**Padroes recentes observados:**
- 8b6e497 feat(story-5.6): block drag & reorder with code review fixes
- Code review fixes aplicados no mesmo commit ou separadamente

### Database Schema Reference

```sql
-- campaign_leads table (already exists from 00016_create_campaigns.sql)
CREATE TABLE IF NOT EXISTS public.campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_lead_per_campaign UNIQUE (campaign_id, lead_id)
);

-- RLS policies already exist for tenant isolation via campaign ownership
```

### O Que NAO Fazer

- NAO reimplementar campaign_leads schema - ja existe
- NAO criar novos types para CampaignLead - usar os existentes em campaign.ts
- NAO modificar o LeadTable principal - usar componente separado no dialog
- NAO fazer fetch de leads diretamente no componente - usar hooks
- NAO esquecer de invalidar cache ao mutar campaign_leads

### Testing Strategy

**Unit Tests:**

```typescript
describe("AddLeadsDialog", () => {
  it("renders search input and lead list", () => {
    render(<AddLeadsDialog open campaignId="test-id" onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("lead-search-input")).toBeInTheDocument();
  });

  it("filters leads based on search input", async () => {
    // Mock useMyLeads with test data
    // Type in search
    // Verify filtered results
  });

  it("toggles lead selection", async () => {
    // Click checkbox
    // Verify selection state
  });

  it("calls addLeads mutation on submit", async () => {
    // Select leads
    // Click add button
    // Verify mutation called
  });
});

describe("useCampaignLeads", () => {
  it("fetches leads for campaign", async () => {
    // Mock API
    // Call hook
    // Verify data
  });

  it("adds leads to campaign", async () => {
    // Call addLeads mutation
    // Verify API called
    // Verify cache invalidated
  });
});
```

### NFR Compliance

- **Performance:** Busca com debounce de 300ms para evitar requests excessivos
- **UX:** Feedback visual claro (loading, toast, contador)
- **Accessibility:** aria-labels em checkboxes, keyboard navigation
- **Error Handling:** Mensagens em portugues, tratamento de erros de API

### References

- [Source: epics.md#Epic-5-Story-5.7] - Requisitos da story
- [Source: architecture.md#API-Patterns] - Padrao de API response
- [Source: supabase/migrations/00016_create_campaigns.sql] - Schema campaign_leads
- [Source: src/types/campaign.ts:163-195] - CampaignLead types
- [Source: src/stores/use-selection-store.ts] - Pattern de selecao
- [Source: src/hooks/use-my-leads.ts] - Hook para buscar leads
- [Source: src/components/leads/CreateSegmentDialog.tsx] - Pattern de dialog

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

**NEW:**
- src/app/api/campaigns/[campaignId]/leads/route.ts
- src/app/api/campaigns/[campaignId]/leads/[leadId]/route.ts
- src/app/(dashboard)/campaigns/new/page.tsx (handle pre-selected leads, create campaign redirect)
- src/components/builder/AddLeadsDialog.tsx
- src/hooks/use-campaign-leads.ts
- __tests__/unit/components/builder/AddLeadsDialog.test.tsx
- __tests__/unit/hooks/use-campaign-leads.test.tsx
- __tests__/unit/api/campaigns-leads.test.ts

**MODIFIED:**
- src/components/builder/BuilderHeader.tsx (add leadCount prop, add leads button)
- src/components/builder/index.ts (export AddLeadsDialog)
- src/stores/use-builder-store.ts (add leadCount state)
- src/components/leads/LeadSelectionBar.tsx (add "Criar Campanha" button)
- src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx (integrate AddLeadsDialog, setHasChanges on leads added)
- __tests__/unit/components/builder/BuilderHeader.test.tsx (update for new props)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Story 5.7 context created with comprehensive implementation guide | Bob (SM) |
| 2026-02-02 | Code Review: Fixed AC #4 - modal now closes after adding leads | Amelia (Dev) |
| 2026-02-02 | Code Review: Fixed AC #4 - hasChanges now marked true when leads added | Amelia (Dev) |
| 2026-02-02 | Code Review: Corrected File List documentation | Amelia (Dev) |
