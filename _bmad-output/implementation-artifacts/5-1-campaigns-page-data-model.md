# Story 5.1: Campaigns Page & Data Model

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a campaigns page to manage my campaigns,
so that I can create and track multiple outreach sequences.

## Context

Esta story implementa a **pagina de campanhas e o modelo de dados** para o sistema de construcao de campanhas. Esta e a primeira story da Epic 5 (Campaign Builder) e estabelece a fundacao sobre a qual o builder visual sera construido.

**Requisitos Funcionais Cobertos:**
- FR13 (parcial): Base para builder visual drag-and-drop
- FR17: Usuario pode criar multiplas campanhas simultaneamente
- FR18 (parcial): Base para associacao de leads a campanhas

**Relacao com outras Epics:**
- Epic 3/4: Leads ja existem no sistema (tabela `leads`)
- Epic 6 (futura): AI Content Generation usara os blocos de email criados aqui
- Epic 7 (futura): Campaign Deployment exportara campanhas criadas aqui

**O que JA existe (reutilizar, NAO reimplementar):**
- `leads` table - Modelo de leads com tenant isolation
- `segments` e `lead_segments` tables - Pattern de junction table
- `Sidebar` com navegacao para Campanhas
- shadcn/ui components: Table, Card, Button, Badge, Dialog, etc.
- `APISuccessResponse<T>` e `APIErrorResponse` - Formato padrao de resposta
- TanStack Query hooks pattern - Ver `use-segments.ts`, `use-my-leads.ts`
- Zod validation pattern - Ver `src/types/lead.ts`
- Dark mode theme tokens - Ver `tailwind.config.ts`

**O que FALTA implementar nesta story:**
1. Migration `00016_create_campaigns.sql` - Tabelas campaigns e campaign_leads
2. Tipos TypeScript em `src/types/campaign.ts`
3. API routes em `src/app/api/campaigns/`
4. Hook `useCampaigns` para listar campanhas
5. Hook `useCreateCampaign` para criar campanhas
6. Componente `CampaignCard` para exibir campanha na lista
7. Pagina de campanhas atualizada em `src/app/(dashboard)/campaigns/page.tsx`

## Acceptance Criteria

### AC #1 - Visualizacao da Lista de Campanhas

**Given** estou autenticado
**When** navego para Campanhas (/campaigns)
**Then** vejo uma lista das minhas campanhas
**And** cada campanha mostra: nome, status, contagem de leads, data de criacao
**And** vejo um botao "Nova Campanha" proeminente
**And** se nao houver campanhas, vejo empty state com CTA

### AC #2 - Modelo de Dados da Campanha

**Given** o banco de dados
**When** a migration e aplicada
**Then** a tabela `campaigns` e criada com:
  - id (UUID, PK)
  - tenant_id (UUID, FK para tenants)
  - name (VARCHAR 200, NOT NULL)
  - status (campaign_status enum: draft, active, paused, completed)
  - created_at (TIMESTAMPTZ)
  - updated_at (TIMESTAMPTZ)
**And** RLS policies garantem isolamento por tenant

### AC #3 - Junction Table campaign_leads

**Given** o banco de dados
**When** a migration e aplicada
**Then** a tabela `campaign_leads` e criada com:
  - id (UUID, PK)
  - campaign_id (UUID, FK para campaigns)
  - lead_id (UUID, FK para leads)
  - added_at (TIMESTAMPTZ)
**And** constraint UNIQUE(campaign_id, lead_id)
**And** RLS policies via campaign's tenant

### AC #4 - Criar Nova Campanha

**Given** estou na pagina de campanhas
**When** clico em "Nova Campanha"
**Then** um dialog abre solicitando nome da campanha
**And** posso inserir nome e clicar "Criar"
**And** a campanha e criada com status "draft"
**And** sou redirecionado para o builder (Story 5.2)

### AC #5 - Contagem de Leads por Campanha

**Given** campanhas existem com leads associados
**When** visualizo a lista de campanhas
**Then** cada campanha mostra quantos leads estao associados
**And** campanhas sem leads mostram "0 leads"

### AC #6 - Status Visual das Campanhas

**Given** campanhas existem com diferentes status
**When** visualizo a lista
**Then** vejo badges de status com cores:
  - draft: secondary (gray)
  - active: success (green)
  - paused: warning (yellow)
  - completed: default (neutral)

## Tasks / Subtasks

- [x] Task 1: Criar migration para tabelas campaigns e campaign_leads (AC: #2, #3)
  - [x] 1.1 Criar arquivo `supabase/migrations/00016_create_campaigns.sql`
  - [x] 1.2 Criar enum `campaign_status`: draft, active, paused, completed
  - [x] 1.3 Criar tabela `campaigns` com colunas especificadas
  - [x] 1.4 Criar tabela `campaign_leads` junction table
  - [x] 1.5 Criar indexes para tenant_id, status, e FKs
  - [x] 1.6 Criar trigger para updated_at
  - [x] 1.7 Criar RLS policies para ambas tabelas
  - [x] 1.8 Aplicar migration localmente e verificar

- [x] Task 2: Criar tipos TypeScript para campaigns (AC: #2, #5, #6)
  - [x] 2.1 Criar `src/types/campaign.ts`
  - [x] 2.2 Definir `campaignStatusValues` e `CampaignStatus` type
  - [x] 2.3 Definir `Campaign` interface (camelCase)
  - [x] 2.4 Definir `CampaignRow` interface (snake_case)
  - [x] 2.5 Criar `transformCampaignRow` function
  - [x] 2.6 Definir `CampaignWithCount` interface (com leadCount)
  - [x] 2.7 Definir `campaignStatusLabels` e `campaignStatusVariants`
  - [x] 2.8 Criar Zod schemas para validacao
  - [x] 2.9 Exportar em `src/types/index.ts`

- [x] Task 3: Criar API routes para campaigns (AC: #1, #4, #5)
  - [x] 3.1 Criar `src/app/api/campaigns/route.ts` (GET, POST)
  - [x] 3.2 GET: Listar campanhas com contagem de leads (join)
  - [x] 3.3 POST: Criar nova campanha com status draft
  - [x] 3.4 Validacao Zod na entrada
  - [x] 3.5 Auth check e tenant isolation

- [x] Task 4: Criar hooks TanStack Query (AC: #1, #4)
  - [x] 4.1 Criar `src/hooks/use-campaigns.ts`
  - [x] 4.2 Implementar `useCampaigns` query hook
  - [x] 4.3 Implementar `useCreateCampaign` mutation hook
  - [x] 4.4 Invalidar queries apos criacao

- [x] Task 5: Criar componentes de UI (AC: #1, #5, #6)
  - [x] 5.1 Criar `src/components/campaigns/CampaignCard.tsx`
  - [x] 5.2 Implementar badge de status com cores
  - [x] 5.3 Exibir nome, status, lead count, data
  - [x] 5.4 Criar `src/components/campaigns/CampaignList.tsx`
  - [x] 5.5 Criar `src/components/campaigns/CreateCampaignDialog.tsx`
  - [x] 5.6 Criar `src/components/campaigns/EmptyState.tsx`
  - [x] 5.7 Criar `src/components/campaigns/index.ts` com exports

- [x] Task 6: Atualizar pagina de campanhas (AC: #1, #4)
  - [x] 6.1 Refatorar `src/app/(dashboard)/campaigns/page.tsx`
  - [x] 6.2 Adicionar header com titulo e botao "Nova Campanha"
  - [x] 6.3 Renderizar CampaignList ou EmptyState
  - [x] 6.4 Integrar CreateCampaignDialog
  - [x] 6.5 Implementar redirect para builder apos criacao

- [x] Task 7: Testes unitarios (AC: todos)
  - [x] 7.1 Teste para tipos: transformCampaignRow, status configs
  - [x] 7.2 Teste para API route: GET, POST, validation
  - [x] 7.3 Teste para hooks: queries, mutations
  - [x] 7.4 Teste para componentes: CampaignCard, dialog

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
| Validation | Zod schemas para todas as entradas de API |
| State management | TanStack Query para server state |
| Error messages | Sempre em portugues |
| RLS | Todas as tabelas com RLS habilitado |

### Migration SQL Pattern

```sql
-- supabase/migrations/00016_create_campaigns.sql
-- Story 5.1: Campaigns Page & Data Model
-- Creates campaigns and campaign_leads tables with RLS

-- 1. Create campaign_status enum
DO $$ BEGIN
    CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    status campaign_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create campaign_leads junction table
CREATE TABLE IF NOT EXISTS public.campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: lead can only be in a campaign once
    CONSTRAINT unique_lead_per_campaign UNIQUE (campaign_id, lead_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON public.campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_id ON public.campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead_id ON public.campaign_leads(lead_id);

-- 5. Trigger for updated_at
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON public.campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for campaigns
CREATE POLICY "Users can view their tenant campaigns"
    ON public.campaigns FOR SELECT
    USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert campaigns to their tenant"
    ON public.campaigns FOR INSERT
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can update their tenant campaigns"
    ON public.campaigns FOR UPDATE
    USING (tenant_id = public.get_current_tenant_id())
    WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can delete their tenant campaigns"
    ON public.campaigns FOR DELETE
    USING (tenant_id = public.get_current_tenant_id());

-- 8. RLS Policies for campaign_leads (via campaign's tenant)
CREATE POLICY "Users can view campaign_leads for their tenant"
    ON public.campaign_leads FOR SELECT
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can insert campaign_leads for their tenant"
    ON public.campaign_leads FOR INSERT
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

CREATE POLICY "Users can delete campaign_leads for their tenant"
    ON public.campaign_leads FOR DELETE
    USING (
        campaign_id IN (
            SELECT id FROM public.campaigns
            WHERE tenant_id = public.get_current_tenant_id()
        )
    );

-- 9. Comments
COMMENT ON TABLE public.campaigns IS 'Email campaign sequences for outreach';
COMMENT ON TABLE public.campaign_leads IS 'Junction table linking campaigns to leads';
COMMENT ON COLUMN public.campaigns.status IS 'Campaign status: draft, active, paused, completed';
```

### Types Implementation

```typescript
// src/types/campaign.ts

import { z } from "zod";

// ==============================================
// STATUS TYPES
// ==============================================

/**
 * Campaign status matches database enum
 */
export const campaignStatusValues = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

export type CampaignStatus = (typeof campaignStatusValues)[number];

/**
 * UI-friendly status labels (Portuguese)
 */
export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluida",
};

/**
 * Status badge color variants
 */
export type CampaignStatusVariant =
  | "secondary"
  | "success"
  | "warning"
  | "default";

export const campaignStatusVariants: Record<CampaignStatus, CampaignStatusVariant> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  completed: "default",
};

/**
 * Status configuration with label and color variant
 */
export interface CampaignStatusConfig {
  value: CampaignStatus;
  label: string;
  variant: CampaignStatusVariant;
}

/**
 * Get status configuration by value
 */
export function getCampaignStatusConfig(
  status: CampaignStatus
): CampaignStatusConfig {
  return {
    value: status,
    label: campaignStatusLabels[status],
    variant: campaignStatusVariants[status],
  };
}

// ==============================================
// CAMPAIGN INTERFACES
// ==============================================

/**
 * Campaign entity from database (camelCase)
 */
export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Campaign with lead count for listing
 */
export interface CampaignWithCount extends Campaign {
  leadCount: number;
}

/**
 * Database row type (snake_case)
 */
export interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Database row with lead count
 */
export interface CampaignRowWithCount extends CampaignRow {
  lead_count: number;
}

/**
 * Transform database row to Campaign interface
 */
export function transformCampaignRow(row: CampaignRow): Campaign {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Transform database row with count to CampaignWithCount
 */
export function transformCampaignRowWithCount(
  row: CampaignRowWithCount
): CampaignWithCount {
  return {
    ...transformCampaignRow(row),
    leadCount: Number(row.lead_count) || 0,
  };
}

// ==============================================
// ZOD SCHEMAS
// ==============================================

/**
 * Schema for creating a campaign
 */
export const createCampaignSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio").max(200, "Nome muito longo"),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/**
 * Schema for updating a campaign
 */
export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(campaignStatusValues).optional(),
});

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

// ==============================================
// CAMPAIGN-LEAD ASSOCIATION
// ==============================================

/**
 * Campaign-Lead association
 */
export interface CampaignLead {
  id: string;
  campaignId: string;
  leadId: string;
  addedAt: string;
}
```

### API Route Implementation

```typescript
// src/app/api/campaigns/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createCampaignSchema,
  transformCampaignRowWithCount,
  type CampaignRowWithCount,
} from "@/types/campaign";

/**
 * GET /api/campaigns
 * List all campaigns for current tenant with lead counts
 */
export async function GET() {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nao autenticado" } },
      { status: 401 }
    );
  }

  // Query campaigns with lead count
  const { data, error } = await supabase
    .from("campaigns")
    .select(`
      *,
      lead_count:campaign_leads(count)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar campanhas" } },
      { status: 500 }
    );
  }

  // Transform and flatten lead_count
  const campaigns = (data || []).map((row) => {
    const leadCount = Array.isArray(row.lead_count)
      ? row.lead_count[0]?.count || 0
      : 0;
    return transformCampaignRowWithCount({
      ...row,
      lead_count: leadCount,
    } as CampaignRowWithCount);
  });

  return NextResponse.json({ data: campaigns });
}

/**
 * POST /api/campaigns
 * Create a new campaign
 */
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

  // Get tenant_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Sem tenant associado" } },
      { status: 403 }
    );
  }

  // Parse and validate body
  const body = await request.json();
  const parsed = createCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.errors[0]?.message || "Dados invalidos",
        },
      },
      { status: 400 }
    );
  }

  // Insert campaign
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      tenant_id: profile.tenant_id,
      name: parsed.data.name,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating campaign:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao criar campanha" } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: transformCampaignRowWithCount({
      ...data,
      lead_count: 0,
    } as CampaignRowWithCount),
  });
}
```

### Hook Implementation

```typescript
// src/hooks/use-campaigns.ts

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CampaignWithCount,
  CreateCampaignInput,
} from "@/types/campaign";
import type { APISuccessResponse, APIErrorResponse } from "@/types/api";

/**
 * Fetch all campaigns for current tenant
 */
async function fetchCampaigns(): Promise<CampaignWithCount[]> {
  const response = await fetch("/api/campaigns");
  const json = await response.json();

  if (!response.ok) {
    const error = json as APIErrorResponse;
    throw new Error(error.error.message);
  }

  return (json as APISuccessResponse<CampaignWithCount[]>).data;
}

/**
 * Create a new campaign
 */
async function createCampaign(
  input: CreateCampaignInput
): Promise<CampaignWithCount> {
  const response = await fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await response.json();

  if (!response.ok) {
    const error = json as APIErrorResponse;
    throw new Error(error.error.message);
  }

  return (json as APISuccessResponse<CampaignWithCount>).data;
}

/**
 * Hook to fetch campaigns list
 */
export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to create a new campaign
 */
export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
```

### Component Structure

```tsx
// src/components/campaigns/CampaignCard.tsx

"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import {
  type CampaignWithCount,
  getCampaignStatusConfig,
} from "@/types/campaign";

interface CampaignCardProps {
  campaign: CampaignWithCount;
  onClick?: () => void;
}

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  const statusConfig = getCampaignStatusConfig(campaign.status);

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-background-secondary"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <h3 className="font-medium text-foreground">{campaign.name}</h3>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-foreground-muted">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{campaign.leadCount} leads</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>
              {new Date(campaign.createdAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/campaigns/CreateCampaignDialog.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateCampaign } from "@/hooks/use-campaigns";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCampaignDialog({
  open,
  onOpenChange,
}: CreateCampaignDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const { mutate: createCampaign, isPending } = useCreateCampaign();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Nome da campanha e obrigatorio");
      return;
    }

    createCampaign(
      { name: name.trim() },
      {
        onSuccess: (campaign) => {
          toast.success("Campanha criada com sucesso!");
          onOpenChange(false);
          setName("");
          // Navigate to builder (Story 5.2)
          router.push(`/campaigns/${campaign.id}/edit`);
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Campanha</DialogTitle>
          <DialogDescription>
            Crie uma nova campanha de outreach para seus leads.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Prospecao Q1 2026"
                disabled={isPending}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Campanha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### Project Structure Notes

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── campaigns/
│   │       └── page.tsx                  # MODIFY - Full page implementation
│   └── api/
│       └── campaigns/
│           └── route.ts                  # NEW - GET, POST endpoints
├── components/
│   └── campaigns/
│       ├── CampaignCard.tsx              # NEW - Campaign card component
│       ├── CampaignList.tsx              # NEW - Grid of campaign cards
│       ├── CreateCampaignDialog.tsx      # NEW - Create dialog
│       ├── EmptyState.tsx                # NEW - Empty state component
│       └── index.ts                      # NEW - Exports
├── hooks/
│   └── use-campaigns.ts                  # NEW - TanStack Query hooks
├── types/
│   ├── campaign.ts                       # NEW - Campaign types
│   └── index.ts                          # MODIFY - Export campaign types
└── supabase/
    └── migrations/
        └── 00016_create_campaigns.sql    # NEW - Database migration
```

### Previous Story Intelligence

**From Story 4.1 (Lead Segments/Lists):**
- Pattern de junction table: segments -> lead_segments
- RLS via campaign's tenant (subquery pattern)
- Types com Row e transform functions
- Hook pattern com TanStack Query

**From Story 4.7 (Import Campaign Results):**
- Dialog com estados: input -> processing -> summary
- Toast feedback via sonner
- Mutation com invalidateQueries
- Form validation inline

**From Epic 3 (Lead Discovery):**
- LeadTable component patterns
- Status badges com variants
- Empty states com CTAs

### Git Intelligence

**Commit pattern esperado:**
```
feat(story-5.1): campaigns page and data model
```

**Padroes recentes observados:**
- Code review fixes aplicados no mesmo commit
- Componentes dialog seguem padrao shadcn/ui
- Hooks usam TanStack Query v5 patterns
- API routes usam Zod para validacao

### UX Design Notes

**Do UX Spec:**
- Cards estilo Airtable para campanhas
- Espaçamento generoso (space-4, space-6)
- Badges de status com cores semanticas
- Dark mode como padrao
- Hover states sutis (bg-background-secondary)

**Empty State:**
- Mensagem: "Nenhuma campanha encontrada"
- CTA: "Criar sua primeira campanha"
- Ilustracao minimalista (opcional)

**Card Layout:**
```
┌─────────────────────────────────────────┐
│  Nome da Campanha            [Rascunho] │
│  👥 12 leads   📅 02/02/2026            │
└─────────────────────────────────────────┘
```

### O Que NAO Fazer

- NAO criar builder visual nesta story - apenas modelo de dados e listagem
- NAO implementar associacao de leads via UI - apenas junction table
- NAO criar email_blocks table - sera na Story 5.3
- NAO modificar sidebar - ja tem link para Campanhas
- NAO usar Zustand para estado de campanhas - usar TanStack Query
- NAO fazer queries sem RLS - sempre via Supabase client

### Testing Strategy

**Unit Tests:**
- Types: transformCampaignRow, status configs
- API Route: GET list, POST create, validation errors, auth check
- Hooks: query fetch, mutation create, invalidation
- Components: CampaignCard render, dialog form, empty state

**Test Patterns (de stories anteriores):**
```typescript
// Mock Supabase
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Test API route
describe("GET /api/campaigns", () => {
  it("returns campaigns for authenticated user", async () => {
    // ...
  });

  it("returns 401 for unauthenticated request", async () => {
    // ...
  });
});
```

### NFR Compliance

- **Performance:** Query com join para lead count (1 query)
- **Security:** RLS policies em todas as tabelas, auth check em API routes
- **UX:** Loading states, error toasts em portugues
- **Accessibility:** Labels em forms, keyboard navigation em cards

### References

- [Source: supabase/migrations/00012_create_segments.sql] - Pattern de junction table e RLS
- [Source: src/types/segment.ts] - Pattern de types com Row e transform
- [Source: src/types/lead.ts] - Pattern de status configs e Zod schemas
- [Source: src/hooks/use-segments.ts] - Pattern de TanStack Query hooks
- [Source: src/components/leads/MyLeadsPageContent.tsx] - Pattern de pagina com lista
- [Source: architecture.md#API-Response-Format] - Formato padrao de resposta
- [Source: ux-design-specification.md#Component-Strategy] - Design system specs
- [Source: epics.md#Epic-5-Story-5.1] - Requisitos da story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Build passed successfully with Next.js 16.1.6 (Turbopack)
- All 64 campaign-related tests passing
- 1622/1623 tests passing (1 pre-existing LoginPage test failure unrelated to this story)

### Completion Notes List

- Task 1: Created migration `00016_create_campaigns.sql` with campaigns table, campaign_leads junction table, RLS policies, indexes, and triggers
- Task 2: Created `src/types/campaign.ts` with all types, Zod schemas, and transform functions. Exported via `src/types/index.ts`
- Task 3: Created `src/app/api/campaigns/route.ts` with GET (list with lead count) and POST (create with draft status) endpoints
- Task 4: Created `src/hooks/use-campaigns.ts` with `useCampaigns` query and `useCreateCampaign` mutation hooks
- Task 5: Created campaign components: CampaignCard, CampaignList, CreateCampaignDialog, EmptyState, and index.ts exports
- Task 6: Updated `/campaigns` page with full implementation using hooks and components
- Task 7: Created comprehensive unit tests for types (19), API (15), hooks (8), and components (22)
- Task 8: Build passes, all new tests pass (64 tests total for this story)

### File List

**New Files:**
- supabase/migrations/00016_create_campaigns.sql
- supabase/migrations/00017_add_campaign_leads_update_policy.sql (code review fix)
- src/types/campaign.ts
- src/app/api/campaigns/route.ts
- src/hooks/use-campaigns.ts
- src/components/campaigns/CampaignCard.tsx
- src/components/campaigns/CampaignList.tsx
- src/components/campaigns/CreateCampaignDialog.tsx
- src/components/campaigns/EmptyState.tsx
- src/components/campaigns/index.ts
- __tests__/unit/types/campaign.test.ts
- __tests__/unit/api/campaigns.test.ts
- __tests__/unit/hooks/use-campaigns.test.tsx
- __tests__/unit/components/campaigns/CampaignCard.test.tsx
- __tests__/unit/components/campaigns/CreateCampaignDialog.test.tsx
- __tests__/unit/components/campaigns/CampaignList.test.tsx (code review fix)
- __tests__/unit/components/campaigns/EmptyState.test.tsx (code review fix)

**Modified Files:**
- src/types/index.ts (added campaign export)
- src/app/(dashboard)/campaigns/page.tsx (full refactor)

## Senior Developer Review (AI)

**Review Date:** 2026-02-02
**Reviewer:** Amelia (Dev Agent)

### Issues Found & Fixed

| Severity | Issue | Fix Applied |
|----------|-------|-------------|
| HIGH | Missing tests for CampaignList and EmptyState | Created CampaignList.test.tsx and EmptyState.test.tsx |
| HIGH | API route doesn't handle invalid JSON | Added try-catch for request.json() with INVALID_JSON error |
| HIGH | Missing UPDATE RLS policy for campaign_leads | Created migration 00017_add_campaign_leads_update_policy.sql |
| MEDIUM | Hook reads response.json() twice | Refactored to read once before checking response.ok |
| MEDIUM | CampaignCard lacks keyboard accessibility | Added tabIndex, role="button", and onKeyDown handler |

### Test Results After Fixes

- All 85 campaign-related tests passing (was 64)
- CampaignCard.test.tsx: 18 tests (was 12)
- CampaignList.test.tsx: 9 tests (NEW)
- EmptyState.test.tsx: 12 tests (NEW)
- campaigns.test.ts: 16 tests (was 15)
- Build passes successfully

### Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-02 | Initial implementation | Dev Agent |
| 2026-02-02 | Code review fixes applied | Dev Agent (Review)
