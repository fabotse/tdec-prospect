# Story 10.6: Janela de Oportunidade — Engine + Config

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want configurar o threshold da Janela de Oportunidade e ver quais leads se qualificam,
so that identificar leads de alto interesse que merecem acao imediata.

## Acceptance Criteria

1. **Given** o `OpportunityEngine` e criado **When** `evaluateOpportunityWindow(leads, config)` e chamado **Then** filtra leads cujo `openCount >= config.minOpens` **And** filtra leads cujo ultimo open esta dentro de `config.periodDays` dias **And** retorna lista de `OpportunityLead` com `qualifiedAt` e `isInOpportunityWindow`

2. **Given** o hook `useOpportunityConfig` e chamado **When** `getConfig(campaignId)` e executado **Then** busca config ativa na tabela `opportunity_configs` **And** se nao existe, retorna defaults: `minOpens=3`, `periodDays=7`

3. **Given** o hook `useSaveOpportunityConfig` e chamado **When** `saveConfig(config)` e executado **Then** salva/atualiza config na tabela `opportunity_configs` (upsert via UNIQUE campaign_id) **And** valida que `minOpens >= 1` e `periodDays >= 1`

4. **Given** o componente `ThresholdConfig` e renderizado **When** o usuario ve a configuracao **Then** exibe inputs para "Minimo de aberturas" e "Periodo em dias" **And** mostra valores atuais ou defaults **And** preview do numero de leads que se qualificam com a config atual

5. **Given** o usuario altera o threshold **When** salva a nova configuracao **Then** a lista de leads na Janela de Oportunidade e reatualizada **And** exibe toast de confirmacao "Configuracao salva" **And** o preview atualiza imediatamente (refetch)

6. **Given** o hook `useOpportunityWindow` e criado **When** usado pelo componente **Then** encapsula `evaluateOpportunityWindow` + `useOpportunityConfig` + `useSaveOpportunityConfig` **And** usa TanStack Query para cache e mutations

## Tasks / Subtasks

- [x] Task 1: Criar OpportunityEngine — funcao pura client-side (AC: #1)
  - [x] 1.1 Criar `src/lib/services/opportunity-engine.ts` com funcao `evaluateOpportunityWindow(leads: LeadTracking[], config: OpportunityConfig): OpportunityLead[]`
  - [x] 1.2 Implementar logica: filtrar leads onde `openCount >= config.minOpens` E `lastOpenAt` dentro de `config.periodDays` dias
  - [x] 1.3 Para cada lead qualificado, retornar `OpportunityLead` com `qualifiedAt: new Date().toISOString()` e `isInOpportunityWindow: true`
  - [x] 1.4 Exportar constantes `DEFAULT_MIN_OPENS = 3` e `DEFAULT_PERIOD_DAYS = 7` para uso por componentes e testes
  - [x] 1.5 Exportar funcao helper `getDefaultConfig(campaignId: string): OpportunityConfig` para retornar config com defaults
- [x] Task 2: Criar API route para CRUD de OpportunityConfig (AC: #2, #3)
  - [x] 2.1 Criar `src/app/api/campaigns/[campaignId]/opportunity-config/route.ts`
  - [x] 2.2 Implementar `GET` handler: buscar config ativa em `opportunity_configs` filtrado por `campaign_id` + RLS por `tenant_id`
  - [x] 2.3 Se nao encontrada, retornar `{ data: null }` (hook tratara defaults)
  - [x] 2.4 Implementar `PUT` handler: upsert config com validacao Zod (`minOpens >= 1`, `periodDays >= 1`)
  - [x] 2.5 PUT retorna config salva como `{ data: OpportunityConfig }`
  - [x] 2.6 Error handling com mensagens em portugues
- [x] Task 3: Criar hook `useOpportunityWindow` (AC: #2, #3, #6)
  - [x] 3.1 Criar `src/hooks/use-opportunity-window.ts`
  - [x] 3.2 Implementar `useOpportunityConfig(campaignId, options?)` com TanStack `useQuery` — queryKey: `["opportunity-config", campaignId]`
  - [x] 3.3 Se API retorna `null`, mapear para defaults via `getDefaultConfig(campaignId)` dentro do hook
  - [x] 3.4 Implementar `useSaveOpportunityConfig(campaignId)` com TanStack `useMutation` — invalidate `["opportunity-config", campaignId]` no onSuccess
  - [x] 3.5 Implementar `useOpportunityLeads(leads, config)` que chama `evaluateOpportunityWindow` e retorna `OpportunityLead[]` — usa `useMemo` para evitar re-calculos desnecessarios
  - [x] 3.6 Exportar tudo do arquivo
- [x] Task 4: Criar componente `ThresholdConfig` (AC: #4, #5)
  - [x] 4.1 Criar `src/components/tracking/ThresholdConfig.tsx`
  - [x] 4.2 Props: `config: OpportunityConfig | null`, `leads: LeadTracking[]`, `onSave: (config: { minOpens: number; periodDays: number }) => void`, `isSaving: boolean` (revisado: preview local com leads)
  - [x] 4.3 Inputs controlados para `minOpens` e `periodDays` com `type="number"` e `min={1}`
  - [x] 4.4 Preview em tempo real: "X de Y leads se qualificam" — calculo local via `evaluateOpportunityWindow`
  - [x] 4.5 Botao "Salvar" com loading state (`isSaving`) e disabled quando valores iguais aos atuais
  - [x] 4.6 Layout com `Card` do shadcn — titulo "Janela de Oportunidade", subtitulo com explicacao breve
  - [x] 4.7 Labels em portugues: "Minimo de aberturas", "Periodo em dias"
  - [x] 4.8 Usar `flex flex-col gap-2` para wrappers label+input (Tailwind v4 + Radix)
- [x] Task 5: Integrar ThresholdConfig na pagina de analytics (AC: #4, #5)
  - [x] 5.1 Modificar `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx`
  - [x] 5.2 Adicionar `useOpportunityConfig(campaignId, { enabled: hasExternalId })` e `useSaveOpportunityConfig(campaignId)`
  - [x] 5.3 ThresholdConfig calcula preview localmente via `evaluateOpportunityWindow` (nao precisa de useMemo no pai)
  - [x] 5.4 Renderizar `ThresholdConfig` entre `AnalyticsDashboard` e `LeadTrackingTable` com props adequadas
  - [x] 5.5 Handler `onSave` chama mutation + toast de sucesso/erro
- [x] Task 6: Atualizar barrel export (AC: N/A)
  - [x] 6.1 Adicionar `ThresholdConfig` ao `src/components/tracking/index.ts`
- [x] Task 7: Adicionar mock factories (AC: N/A)
  - [x] 7.1 Adicionar `createMockOpportunityConfig()` em `__tests__/helpers/mock-data.ts` com defaults
  - [x] 7.2 Adicionar `createMockOpportunityLead()` em `__tests__/helpers/mock-data.ts` extendendo `createMockLeadTracking`
- [x] Task 8: Testes unitarios (AC: #1, #2, #3, #4, #5, #6)
  - [x] 8.1 `__tests__/unit/lib/services/opportunity-engine.test.ts` — 12 testes: leads qualificados, fora do periodo, abaixo do threshold, null lastOpenAt, vazio, defaults, config customizada, limite exato
  - [x] 8.2 `__tests__/unit/components/tracking/ThresholdConfig.test.tsx` — 13 testes: renderiza inputs, preview count, salvar config, loading state, botao desabilitado, valores minimos, reinicializacao, labels PT
  - [x] 8.3 `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — 4 testes adicionados: ThresholdConfig integrado, enabled prop, nao renderiza sem export, useSaveOpportunityConfig mock
  - [x] 8.4 `__tests__/unit/hooks/use-opportunity-window.test.ts` — 11 testes: fetch + defaults, mutation, enabled guard, error handling, useOpportunityLeads, query key

## Dev Notes

### ARQUITETURA CRITICA: OpportunityEngine e CLIENT-SIDE

O `OpportunityEngine` NAO faz chamadas de API. Ele e uma funcao PURA que recebe `LeadTracking[]` + `OpportunityConfig` e retorna `OpportunityLead[]`. Os dados de leads ja estao carregados no cache do TanStack Query via `useLeadTracking` (Story 10.5). A avaliacao e um filtro em memoria.

```typescript
// src/lib/services/opportunity-engine.ts — NAO e uma classe, e uma funcao pura
export function evaluateOpportunityWindow(
  leads: LeadTracking[],
  config: OpportunityConfig
): OpportunityLead[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() - config.periodDays * 24 * 60 * 60 * 1000);

  return leads
    .filter((lead) => {
      if (lead.openCount < config.minOpens) return false;
      if (!lead.lastOpenAt) return false;
      const lastOpen = new Date(lead.lastOpenAt);
      return lastOpen >= cutoff;
    })
    .map((lead) => ({
      ...lead,
      qualifiedAt: now.toISOString(),
      isInOpportunityWindow: true,
    }));
}
```

**Por que funcao pura e nao classe?**
- Nao ha estado interno
- Nao ha dependencias externas (sem fetch, sem DB)
- Testabilidade maxima — input deterministic, output deterministic
- Reusavel em qualquer contexto (hook, componente, teste)

### Tipos Ja Existentes (Story 10.1 — NAO CRIAR NOVOS)

Todos os tipos necessarios JA EXISTEM em `src/types/tracking.ts`:

```typescript
// JA EXISTE — NAO DUPLICAR
interface OpportunityConfigRow {
  id: string; tenant_id: string; campaign_id: string;
  min_opens: number; period_days: number; is_active: boolean;
  created_at: string; updated_at: string;
}

interface OpportunityConfig {
  id: string; tenantId: string; campaignId: string;
  minOpens: number; periodDays: number; isActive: boolean;
  createdAt: string; updatedAt: string;
}

function transformOpportunityConfigRow(row: OpportunityConfigRow): OpportunityConfig { ... }

interface OpportunityLead extends LeadTracking {
  qualifiedAt: string;
  isInOpportunityWindow: boolean;
}
```

**CRITICO**: NAO recriar esses tipos. Importar de `@/types/tracking`.

### API Route Pattern — GET/PUT `/api/campaigns/[campaignId]/opportunity-config`

Seguir o padrao existente das API routes de tracking:

```typescript
// src/app/api/campaigns/[campaignId]/opportunity-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transformOpportunityConfigRow } from "@/types/tracking";
import { z } from "zod";

const saveConfigSchema = z.object({
  minOpens: z.number().min(1, "Minimo de aberturas deve ser pelo menos 1"),
  periodDays: z.number().min(1, "Periodo deve ser pelo menos 1 dia"),
});

// GET — buscar config da campanha
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("opportunity_configs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar configuracao" }, { status: 500 });
  }

  return NextResponse.json({
    data: data ? transformOpportunityConfigRow(data) : null,
  });
}

// PUT — upsert config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  const body = await request.json();

  const parsed = saveConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = await createClient();

  // Upsert via ON CONFLICT (campaign_id)
  const { data, error } = await supabase
    .from("opportunity_configs")
    .upsert(
      {
        campaign_id: campaignId,
        min_opens: parsed.data.minOpens,
        period_days: parsed.data.periodDays,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Erro ao salvar configuracao" }, { status: 500 });
  }

  return NextResponse.json({ data: transformOpportunityConfigRow(data) });
}
```

**NOTA sobre tenant_id**: O RLS da tabela `opportunity_configs` filtra por `tenant_id = auth.jwt() ->> 'tenant_id'`. O Supabase server client usa cookies para autenticacao, entao o RLS funciona automaticamente. NAO precisamos enviar `tenant_id` manualmente — o Supabase insere via trigger ou o RLS filtra.

**ATENCAO**: Verificar se existe trigger `set_tenant_id` na migration de `opportunity_configs` (Story 10.1). Se nao houver, precisaremos incluir `tenant_id` no INSERT buscando do JWT.

### Hook Pattern — Seguir `use-campaign-analytics.ts`

```typescript
// src/hooks/use-opportunity-window.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { OpportunityConfig, LeadTracking, OpportunityLead } from "@/types/tracking";
import { evaluateOpportunityWindow, DEFAULT_MIN_OPENS, DEFAULT_PERIOD_DAYS } from "@/lib/services/opportunity-engine";

export const OPPORTUNITY_CONFIG_QUERY_KEY = (id: string) => ["opportunity-config", id];

// --- Fetch ---
async function fetchOpportunityConfig(campaignId: string): Promise<OpportunityConfig | null> {
  const response = await fetch(`/api/campaigns/${campaignId}/opportunity-config`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Erro ao buscar configuracao");
  return result.data;
}

async function saveOpportunityConfig(
  campaignId: string,
  config: { minOpens: number; periodDays: number }
): Promise<OpportunityConfig> {
  const response = await fetch(`/api/campaigns/${campaignId}/opportunity-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Erro ao salvar configuracao");
  return result.data;
}

// --- Hooks ---
export function useOpportunityConfig(campaignId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: OPPORTUNITY_CONFIG_QUERY_KEY(campaignId),
    queryFn: () => fetchOpportunityConfig(campaignId),
    staleTime: 5 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!campaignId,
  });
}

export function useSaveOpportunityConfig(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: { minOpens: number; periodDays: number }) =>
      saveOpportunityConfig(campaignId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPPORTUNITY_CONFIG_QUERY_KEY(campaignId) });
    },
  });
}

export function useOpportunityLeads(
  leads: LeadTracking[] | undefined,
  config: OpportunityConfig | null | undefined
): OpportunityLead[] {
  return useMemo(() => {
    if (!leads || !config) return [];
    return evaluateOpportunityWindow(leads, config);
  }, [leads, config]);
}
```

### ThresholdConfig Component — Especificacao

**Props:**
```typescript
interface ThresholdConfigProps {
  config: OpportunityConfig | null;
  qualifiedCount: number;
  totalLeadCount: number;
  onSave: (config: { minOpens: number; periodDays: number }) => void;
  isSaving: boolean;
}
```

**Layout:**
```
+------------------------------------------+
| Card: "Janela de Oportunidade"           |
| Subtitle: "Configure o threshold..."     |
|                                          |
| [Minimo de aberturas: ___]               |
| [Periodo em dias: ___]                   |
|                                          |
| "X de Y leads se qualificam"            |
|                                          |
| [Salvar]                                 |
+------------------------------------------+
```

**Detalhes de implementacao:**
- Inputs controlados com `useState` inicializados a partir da prop `config` (ou defaults se null)
- Preview usa `qualifiedCount` (calculado pelo pai via `useOpportunityLeads`)
- Botao desabilitado quando `isSaving` ou quando `minOpens` e `periodDays` nao mudaram
- `Input type="number"` do shadcn com `min={1}`
- Card com titulo e descricao breve em portugues
- Usar `flex flex-col gap-2` para wrappers label+input
- NAO usar `space-y-*` (Tailwind v4 + Radix issue)

**Reinicializacao de state quando config muda:**
```typescript
const [minOpens, setMinOpens] = useState(config?.minOpens ?? DEFAULT_MIN_OPENS);
const [periodDays, setPeriodDays] = useState(config?.periodDays ?? DEFAULT_PERIOD_DAYS);

// Reinicializar quando config carrega do servidor
useEffect(() => {
  if (config) {
    setMinOpens(config.minOpens);
    setPeriodDays(config.periodDays);
  }
}, [config]);
```

**ATENCAO**: O preview precisa refletir o threshold EDITADO (nao salvo), mas o calculo do `qualifiedCount` e feito pelo pai. Para preview em tempo real durante edicao, o componente pai precisa passar um `qualifiedCount` que reflete os valores atuais dos inputs, NAO os valores salvos. Duas opcoes:
1. **Callback `onPreview`**: ThresholdConfig emite os valores editados para o pai recalcular
2. **Calculo local**: ThresholdConfig recebe `leads[]` e calcula preview internamente

**Recomendado**: Opcao 2 — ThresholdConfig recebe `leads` como prop adicional e calcula o preview localmente usando `evaluateOpportunityWindow`. Isso evita prop-drilling complexo e permite preview instantaneo sem re-render do pai.

```typescript
// Props REVISADAS:
interface ThresholdConfigProps {
  config: OpportunityConfig | null;
  leads: LeadTracking[];
  onSave: (config: { minOpens: number; periodDays: number }) => void;
  isSaving: boolean;
}

// Preview local:
const previewCount = useMemo(() => {
  const previewConfig = { ...getDefaultConfig(""), minOpens: localMinOpens, periodDays: localPeriodDays };
  return evaluateOpportunityWindow(leads, previewConfig).length;
}, [leads, localMinOpens, localPeriodDays]);
```

### Integracao na Pagina de Analytics

```typescript
// src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx — ADICOES
import { useOpportunityConfig, useSaveOpportunityConfig } from "@/hooks/use-opportunity-window";
import { ThresholdConfig } from "@/components/tracking/ThresholdConfig";

// Dentro do componente:
const { data: opportunityConfig } = useOpportunityConfig(campaignId, { enabled: hasExternalId });
const { mutate: saveConfig, isPending: isSavingConfig } = useSaveOpportunityConfig(campaignId);

const handleSaveConfig = (config: { minOpens: number; periodDays: number }) => {
  saveConfig(config, {
    onSuccess: () => toast.success("Configuracao salva"),
    onError: (error) => toast.error(error.message || "Erro ao salvar configuracao"),
  });
};

// No JSX, entre AnalyticsDashboard e LeadTrackingTable:
<ThresholdConfig
  config={opportunityConfig ?? null}
  leads={leads ?? []}
  onSave={handleSaveConfig}
  isSaving={isSavingConfig}
/>
```

### Componentes shadcn/ui Necessarios

- **Card**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` de `@/components/ui/card`
- **Input**: `Input` de `@/components/ui/input`
- **Label**: `Label` de `@/components/ui/label`
- **Button**: `Button` de `@/components/ui/button`

### Icones (lucide-react)

- **ThresholdConfig**: `Settings2` ou `SlidersHorizontal` para icone do card (opcional)
- Nenhum icone obrigatorio — o card e minimalista

### Padrao de Testes

```typescript
// __tests__/unit/lib/services/opportunity-engine.test.ts
import { describe, it, expect } from "vitest";
import { evaluateOpportunityWindow, DEFAULT_MIN_OPENS, DEFAULT_PERIOD_DAYS, getDefaultConfig } from "@/lib/services/opportunity-engine";
import { createMockLeadTracking, createMockOpportunityConfig } from "@/helpers/mock-data";

describe("evaluateOpportunityWindow", () => {
  it("retorna leads com openCount >= minOpens e lastOpenAt dentro do periodo", () => { ... });
  it("exclui leads com openCount abaixo do threshold", () => { ... });
  it("exclui leads com lastOpenAt fora do periodo", () => { ... });
  it("exclui leads sem lastOpenAt (null)", () => { ... });
  it("retorna array vazio quando nenhum lead qualifica", () => { ... });
  it("retorna array vazio quando leads e vazio", () => { ... });
  it("define qualifiedAt e isInOpportunityWindow corretamente", () => { ... });
  it("preserva todos os campos do LeadTracking original", () => { ... });
});

describe("getDefaultConfig", () => {
  it("retorna config com defaults corretos", () => { ... });
});
```

```typescript
// __tests__/unit/components/tracking/ThresholdConfig.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThresholdConfig } from "@/components/tracking/ThresholdConfig";

describe("ThresholdConfig", () => {
  it("renderiza inputs com valores da config", () => { ... });
  it("renderiza inputs com defaults quando config e null", () => { ... });
  it("exibe preview de leads qualificados", () => { ... });
  it("atualiza preview ao mudar input", () => { ... });
  it("chama onSave com valores corretos", () => { ... });
  it("desabilita botao durante saving", () => { ... });
  it("desabilita botao quando valores nao mudaram", () => { ... });
  it("nao permite valores menores que 1", () => { ... });
});
```

### Mock Factories a Adicionar

```typescript
// __tests__/helpers/mock-data.ts — ADICIONAR

export function createMockOpportunityConfig(
  overrides: Partial<OpportunityConfig> = {}
): OpportunityConfig {
  return {
    id: "opp-config-1",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    minOpens: 3,
    periodDays: 7,
    isActive: true,
    createdAt: "2026-02-10T10:00:00.000Z",
    updatedAt: "2026-02-10T10:00:00.000Z",
    ...overrides,
  };
}

export function createMockOpportunityLead(
  overrides: Partial<OpportunityLead> = {}
): OpportunityLead {
  return {
    ...createMockLeadTracking(),
    qualifiedAt: "2026-02-10T12:00:00.000Z",
    isInOpportunityWindow: true,
    ...overrides,
  };
}
```

### Story 10.5 Learnings (Previous Story Intelligence)

- **`LeadTrackingTable` usa `DEFAULT_HIGH_INTEREST_THRESHOLD = 3` hardcoded** — Story 10.7 tornara dinamico. Story 10.6 NAO modifica o LeadTrackingTable — apenas cria a infraestrutura de config
- **Hook `useLeadTracking` ja tem parametro `enabled`** — padrao a seguir para `useOpportunityConfig`
- **`formatRelativeTime` importada do SyncIndicator** — funciona bem, reutilizar se necessario
- **Paginacao client-side com `LEADS_PER_PAGE = 20`** — nao afeta avaliacao do engine (engine opera sobre todos os leads)
- **Mock factory `createMockLeadTracking` ja tem `firstName`/`lastName`** — usar para testes do engine
- **42 testes na story 10.5, 3986 total** — manter regressao zero
- **`isError` prop adicionada ao `LeadTrackingTable`** durante code review 10.5 — padrao de error handling a seguir

### Git Intelligence

Branch: `epic/10-campaign-tracking` (base: main)

Commits recentes:
- `861914a` feat(story-10.5): lead tracking detail table + code review fixes
- `d3400ba` feat(story-10.4): campaign analytics dashboard UI + code review fixes
- `4150580` feat(story-10.3): TrackingService polling + code review fixes
- `a6cc007` feat(story-10.2): webhook receiver Edge Function + code review fixes

Arquivos que esta story CRIA (novos):
- `src/lib/services/opportunity-engine.ts` — funcao pura de avaliacao
- `src/hooks/use-opportunity-window.ts` — hooks TanStack Query
- `src/components/tracking/ThresholdConfig.tsx` — componente de config inline
- `src/app/api/campaigns/[campaignId]/opportunity-config/route.ts` — API route GET/PUT
- `__tests__/unit/lib/services/opportunity-engine.test.ts` — testes do engine
- `__tests__/unit/components/tracking/ThresholdConfig.test.tsx` — testes do componente

Arquivos que esta story MODIFICA (existentes):
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — integrar ThresholdConfig
- `src/components/tracking/index.ts` — adicionar export ThresholdConfig
- `__tests__/helpers/mock-data.ts` — adicionar createMockOpportunityConfig, createMockOpportunityLead
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — mock de useOpportunityConfig + testes de integracao

### Anti-Patterns a Evitar

1. **NAO criar OpportunityEngine como classe** — e uma funcao pura, nao tem estado
2. **NAO recriar tipos que ja existem** — `OpportunityConfig`, `OpportunityConfigRow`, `OpportunityLead`, `transformOpportunityConfigRow` ja estao em `src/types/tracking.ts`
3. **NAO usar `space-y-*`** — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
4. **NAO usar `console.log`** — ESLint enforces no-console rule
5. **NAO chamar API do Instantly** — o engine opera sobre dados ja em cache (useLeadTracking)
6. **NAO persistir resultados da avaliacao** — sao computados on-the-fly em memoria
7. **NAO enviar `tenant_id` manualmente na API route** — RLS cuida disso via Supabase server client
8. **NAO modificar `LeadTrackingTable`** — Story 10.7 fara o badge dinamico
9. **NAO adicionar libs externas** (Formik, react-number-format) — usar Input nativo com type="number"
10. **NAO fazer debounce no preview** — `useMemo` com dependencias e suficiente para performance com ~100-500 leads

### Dependencias Downstream

Esta story alimenta:
- **10.7** (Opportunity UI + Notificacoes): Usara `useOpportunityConfig` e `useOpportunityLeads` para exibir OpportunityPanel. Modificara LeadTrackingTable badge para usar threshold dinamico
- **10.8** (Preparacao WhatsApp): Usara `OpportunityLead` como input para `IOpportunityAction.execute(lead)`

### Verificacao Critica: tenant_id na Migration

A migration de `opportunity_configs` (Story 10.1) pode ou nao ter trigger para auto-inserir `tenant_id`. Verificar antes de implementar a API route.

Se NAO tiver trigger:
```typescript
// Na API route PUT, buscar tenant_id do JWT
const { data: { user } } = await supabase.auth.getUser();
const tenantId = user?.app_metadata?.tenant_id;
// Incluir tenant_id no upsert
```

Se TIVER trigger (padrao do projeto):
```typescript
// Apenas fazer o upsert, trigger preenche tenant_id automaticamente
```

### Project Structure Notes

- Engine em `src/lib/services/` — segue padrao de outros services (tracking.ts, instantly.ts)
- Hook em `src/hooks/` — segue padrao dos outros hooks de tracking
- Componente em `src/components/tracking/` — segue padrao dos outros componentes de tracking
- API route em `src/app/api/campaigns/[campaignId]/` — segue padrao existente
- Testes em `__tests__/unit/` espelhando a estrutura de `src/`

### References

- [Source: _bmad-output/planning-artifacts/epic-10-campaign-tracking.md#Story 10.6]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-005 — IOpportunityAction (Story 10.8)]
- [Source: _bmad-output/planning-artifacts/architecture.md#opportunity_configs schema]
- [Source: src/types/tracking.ts — OpportunityConfig, OpportunityConfigRow, OpportunityLead, transformOpportunityConfigRow]
- [Source: src/lib/services/tracking.ts — TrackingService pattern]
- [Source: src/hooks/use-campaign-analytics.ts — TanStack Query mutation pattern (useSyncAnalytics)]
- [Source: src/hooks/use-lead-tracking.ts — useLeadTracking hook + enabled pattern]
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx — Analytics page integration point]
- [Source: src/components/tracking/LeadTrackingTable.tsx — DEFAULT_HIGH_INTEREST_THRESHOLD = 3]
- [Source: src/lib/supabase/server.ts — createClient() for API routes]
- [Source: __tests__/helpers/mock-data.ts — existing mock factories]
- [Source: _bmad-output/implementation-artifacts/10-5-lead-tracking-detail.md — Previous story intelligence]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- ThresholdConfig testes: `vi.useFakeTimers()` em nivel de modulo causava timeout no `userEvent.setup()`. Resolvido mockando `evaluateOpportunityWindow` no teste do componente e usando `fireEvent.change` para inputs controlados.
- Migration `opportunity_configs` NAO tem trigger `set_tenant_id`. API route PUT busca `tenant_id` via `profiles` table (padrao existente em `src/app/api/campaigns/route.ts`).
- Props do ThresholdConfig revisadas: seguiu recomendacao "Opcao 2" das Dev Notes — `leads` como prop para preview local, sem `qualifiedCount`/`totalLeadCount`.

### Completion Notes List

- ✅ Task 1: OpportunityEngine — funcao pura `evaluateOpportunityWindow` + `getDefaultConfig` + constantes `DEFAULT_MIN_OPENS=3`, `DEFAULT_PERIOD_DAYS=7`. 12 testes passando.
- ✅ Task 2: API route GET/PUT `/api/campaigns/[campaignId]/opportunity-config` com auth, RLS, Zod validation, tenant_id via profiles table, mensagens em portugues.
- ✅ Task 3: Hook `useOpportunityWindow` — `useOpportunityConfig` (TanStack useQuery com defaults mapping), `useSaveOpportunityConfig` (useMutation + cache invalidation), `useOpportunityLeads` (useMemo wrapper).
- ✅ Task 4: ThresholdConfig — Card shadcn com inputs controlados, preview local via `evaluateOpportunityWindow`, botao save com loading/disabled states, labels em portugues, `flex flex-col gap-2`.
- ✅ Task 5: Integrado ThresholdConfig entre AnalyticsDashboard e LeadTrackingTable na pagina de analytics. Toast success/error no save.
- ✅ Task 6: Barrel export atualizado em `src/components/tracking/index.ts`.
- ✅ Task 7: Mock factories `createMockOpportunityConfig` e `createMockOpportunityLead` adicionadas.
- ✅ Task 8: 53 testes da story passando (12 engine + 13 component + 11 hooks + 17 page integration). 4026 testes totais passando, 0 regressoes. 1 falha pre-existente em `ai-campaign-structure.test.tsx` (nao relacionada).

### Code Review Fixes (CR 10.6)

- **[H1-FIX]** Adicionado UUID validation para `campaignId` em ambos GET e PUT handlers de `opportunity-config/route.ts`. Padrão consistente com demais API routes.
- **[H2-FIX]** Estabilizado referência do default config em `useOpportunityConfig` com `useMemo`. Antes, `getDefaultConfig()` criava novo objeto a cada render quando API retornava null, quebrando memoização downstream no `useOpportunityLeads`.
- **[M1-FIX]** Adicionado `afterEach(() => vi.useRealTimers())` em `opportunity-engine.test.ts` e `use-opportunity-window.test.ts` para cleanup de fake timers.
- **[M3-FIX]** Adicionados 2 testes de integração na page: `toast.success` no save com sucesso e `toast.error` no save com falha (AC #5).
- **[M2-ACTION]** Auth pattern usa query manual na `profiles` table em vez de `getCurrentUserProfile()` (usado pelas routes vizinhas analytics/tracking). Funcional mas inconsistente — avaliar unificação em futura refatoração.

### Change Log

- 2026-02-10: Story 10.6 implementada — OpportunityEngine, API route, hooks, ThresholdConfig, integracao na analytics page. 53 testes da story, 4026 total.
- 2026-02-10: Code review fixes — UUID validation, useMemo estabilização, timer cleanup, 2 testes toast. 55 testes da story, 4028 total.

### File List

**Novos:**
- `src/lib/services/opportunity-engine.ts`
- `src/hooks/use-opportunity-window.ts`
- `src/components/tracking/ThresholdConfig.tsx`
- `src/app/api/campaigns/[campaignId]/opportunity-config/route.ts`
- `__tests__/unit/lib/services/opportunity-engine.test.ts`
- `__tests__/unit/components/tracking/ThresholdConfig.test.tsx`
- `__tests__/unit/hooks/use-opportunity-window.test.ts`

**Modificados:**
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx`
- `src/components/tracking/index.ts`
- `__tests__/helpers/mock-data.ts`
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
