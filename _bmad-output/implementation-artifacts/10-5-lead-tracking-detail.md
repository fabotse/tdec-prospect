# Story 10.5: Lead Tracking Detail

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want ver os dados de tracking por lead individual na campanha,
so that identificar quais leads estao engajando mais com meus emails.

## Acceptance Criteria

1. **Given** o dashboard de analytics esta exibido **When** o usuario navega para a secao de lead tracking **Then** exibe tabela estilo Airtable com: Email, Nome, Aberturas, Cliques, Respondeu, Ultimo Open **And** a tabela suporta ordenacao por qualquer coluna **And** segue o tema B&W do projeto

2. **Given** a tabela de leads esta exibida **When** a coluna "Aberturas" e clicada **Then** ordena leads por numero de aberturas (descendente por padrao) **And** indicador visual mostra a direcao da ordenacao

3. **Given** a tabela de leads esta exibida **When** um lead tem `openCount >= 3` (default threshold) **Then** exibe badge visual "Alto Interesse" ao lado do email **And** o badge usa cor de destaque dentro do tema B&W

4. **Given** os dados de lead tracking estao carregando **When** a query esta em estado `isLoading` **Then** exibe skeleton rows na tabela

5. **Given** a campanha tem muitos leads **When** a lista excede a visualizacao **Then** suporta paginacao client-side **And** exibe contagem total de leads

6. **Given** a tabela de leads esta exibida **When** nao ha dados de tracking para nenhum lead **Then** exibe estado vazio "Nenhum evento de tracking recebido ainda"

## Tasks / Subtasks

- [x] Task 1: Estender tipo `LeadTracking` e atualizar mapper (AC: #1)
  - [x] 1.1 Adicionar campos opcionais `firstName?: string` e `lastName?: string` em `LeadTracking` (`src/types/tracking.ts`)
  - [x] 1.2 Atualizar `mapToLeadTracking` em `src/lib/services/tracking.ts` para incluir `firstName` e `lastName` do `InstantlyLeadEntry`
  - [x] 1.3 Atualizar mock factory `createMockLeadTracking` em `__tests__/helpers/mock-data.ts` com defaults para `firstName` e `lastName`
  - [x] 1.4 Atualizar testes existentes de `mapToLeadTracking` em `__tests__/unit/lib/services/tracking.test.ts` para validar os novos campos
- [x] Task 2: Criar componente `LeadTrackingTable` (AC: #1, #2, #3, #5, #6)
  - [x] 2.1 Criar `src/components/tracking/LeadTrackingTable.tsx`
  - [x] 2.2 Implementar tabela com shadcn `Table` — colunas: Email, Nome, Aberturas, Cliques, Respondeu, Ultimo Open
  - [x] 2.3 Implementar ordenacao client-side com state `{ column, direction }` — ciclo: null -> desc -> asc -> null
  - [x] 2.4 Icones de ordenacao: `ChevronDown` (desc), `ChevronUp` (asc), `ChevronsUpDown` (neutro)
  - [x] 2.5 Badge "Alto Interesse" com `Badge` variant `outline` + classes customizadas quando `openCount >= DEFAULT_HIGH_INTEREST_THRESHOLD` (3)
  - [x] 2.6 Skeleton loading state: 5 rows de Skeleton
  - [x] 2.7 Estado vazio: "Nenhum evento de tracking recebido ainda"
  - [x] 2.8 Paginacao client-side: LEADS_PER_PAGE=20, botoes Anterior/Proximo, contagem total
  - [x] 2.9 Formatacao de `lastOpenAt` com `formatRelativeTime` (reutilizar de SyncIndicator ou inline)
  - [x] 2.10 Formatacao de `hasReplied`: "Sim" / "Nao"
- [x] Task 3: Integrar `LeadTrackingTable` na pagina de analytics (AC: #1, #4)
  - [x] 3.1 Modificar `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — adicionar `useLeadTracking(campaignId)` com `enabled: hasExternalId`
  - [x] 3.2 Renderizar `LeadTrackingTable` abaixo do `AnalyticsDashboard`, dentro da mesma div com gap-6
  - [x] 3.3 Passar `leads`, `isLoading` como props ao `LeadTrackingTable`
- [x] Task 4: Atualizar barrel export (AC: N/A)
  - [x] 4.1 Adicionar `LeadTrackingTable` ao `src/components/tracking/index.ts`
- [x] Task 5: Testes unitarios (AC: #1, #2, #3, #4, #5, #6)
  - [x] 5.1 `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — renderiza 6 colunas, valores corretos, nomes formatados
  - [x] 5.2 Testes de ordenacao: clicar coluna Aberturas ordena desc, clicar novamente asc, terceiro clique reseta
  - [x] 5.3 Testes de badge: "Alto Interesse" aparece quando openCount >= 3, nao aparece quando < 3
  - [x] 5.4 Testes de skeleton loading state
  - [x] 5.5 Testes de estado vazio (leads = [])
  - [x] 5.6 Testes de paginacao: botoes Anterior/Proximo, contagem total, desabilitar Anterior na primeira pagina
  - [x] 5.7 Testes de integracao na pagina analytics: LeadTrackingTable renderiza abaixo do dashboard

## Dev Notes

### DESCOBERTA CRITICA: LeadTracking Precisa de firstName/lastName

O tipo `LeadTracking` em `src/types/tracking.ts` atualmente **NAO possui** campos de nome:
```typescript
// ATUAL (Story 10.3)
interface LeadTracking {
  leadEmail: string;
  campaignId: string;
  openCount: number;
  clickCount: number;
  hasReplied: boolean;
  lastOpenAt: string | null;
  events: CampaignEvent[];
}
```

A API Instantly retorna `first_name` e `last_name` no `InstantlyLeadEntry` (ja tipado em `src/types/tracking.ts:249-263`), mas esses campos sao **descartados** no `mapToLeadTracking` (`src/lib/services/tracking.ts:86-99`).

**Acao obrigatoria:**
1. Adicionar `firstName?: string` e `lastName?: string` como campos opcionais em `LeadTracking`
2. Atualizar `mapToLeadTracking` para mapear `first_name` -> `firstName`, `last_name` -> `lastName`
3. Atualizar o input type do mapper (atualmente um inline type) para incluir os campos de nome

```typescript
// NOVO (Story 10.5)
interface LeadTracking {
  leadEmail: string;
  campaignId: string;
  openCount: number;
  clickCount: number;
  hasReplied: boolean;
  lastOpenAt: string | null;
  events: CampaignEvent[];
  firstName?: string;  // NOVO
  lastName?: string;   // NOVO
}
```

```typescript
// mapToLeadTracking atualizado
export function mapToLeadTracking(
  item: {
    email: string;
    first_name?: string;   // NOVO
    last_name?: string;    // NOVO
    email_open_count?: number;
    email_click_count?: number;
    email_reply_count?: number;
    timestamp_last_open?: string | null;
  },
  campaignId: string
): LeadTracking {
  return {
    leadEmail: item.email,
    campaignId,
    openCount: item.email_open_count ?? 0,
    clickCount: item.email_click_count ?? 0,
    hasReplied: (item.email_reply_count ?? 0) > 0,
    lastOpenAt: item.timestamp_last_open ?? null,
    events: [],
    firstName: item.first_name,   // NOVO
    lastName: item.last_name,     // NOVO
  };
}
```

Isso e RETROCOMPATIVEL — campos opcionais nao quebram nenhum consumidor existente (dashboard 10.4 nao usa firstName/lastName).

### Hook Existente — `useLeadTracking` (Story 10.3 — DONE)

```typescript
// src/hooks/use-lead-tracking.ts
import { useLeadTracking } from "@/hooks/use-lead-tracking";

const { data: leads, isLoading, isError, error } = useLeadTracking(campaignId);
// leads: LeadTracking[] | undefined
```

- Query key: `["lead-tracking", campaignId]`
- staleTime: 5 minutos
- enabled: `!!campaignId`
- Fetch via: `GET /api/campaigns/${campaignId}/leads/tracking`

**NOTA**: O hook NAO tem parametro `enabled` customizavel como o `useCampaignAnalytics`. Na pagina analytics, precisamos condicionar a chamada a `hasExternalId`. Duas opcoes:
1. Adicionar parametro `options?: { enabled?: boolean }` ao hook (igual ao que foi feito em 10.4 para `useCampaignAnalytics`)
2. Nao chamar o hook condicionalmente (React rules of hooks) — usar `enabled: hasExternalId` como parametro

**Recomendado**: Opcao 1 — adicionar `enabled` ao `useLeadTracking` seguindo exatamente o padrao de `useCampaignAnalytics`:
```typescript
export function useLeadTracking(campaignId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: LEAD_TRACKING_QUERY_KEY(campaignId),
    queryFn: () => fetchLeadTracking(campaignId),
    staleTime: 5 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!campaignId,
  });
}
```

### Tipos de Dados Relevantes

```typescript
// src/types/tracking.ts — APOS EXTENSAO
interface LeadTracking {
  leadEmail: string;
  campaignId: string;
  openCount: number;
  clickCount: number;
  hasReplied: boolean;
  lastOpenAt: string | null;
  events: CampaignEvent[];
  firstName?: string;   // Story 10.5
  lastName?: string;    // Story 10.5
}

// Ja existe — nao modificar
interface InstantlyLeadEntry {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;
  email_open_count: number;
  email_click_count: number;
  email_reply_count: number;
  timestamp_last_open: string | null;
  timestamp_last_click: string | null;
  timestamp_last_reply: string | null;
  status: number;
}
```

### Pagina de Analytics Existente (Story 10.4 — DONE)

A pagina `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` ja:
- Usa `use(params)` para extrair `campaignId`
- Usa `useCampaign(campaignId)` para verificar `externalCampaignId`
- Usa `useCampaignAnalytics(campaignId, { enabled: hasExternalId })`
- Renderiza `AnalyticsDashboard` ou `EmptyState`
- Tem layout `flex flex-col gap-6 p-6`

O `LeadTrackingTable` deve ser adicionado **abaixo** do `AnalyticsDashboard`, dentro do mesmo container quando `hasExternalId && !isLoadingCampaign`:

```typescript
{!isLoadingCampaign && hasExternalId && (
  <>
    <AnalyticsDashboard ... />
    <LeadTrackingTable
      leads={leads ?? []}
      isLoading={isLoadingLeads}
    />
  </>
)}
```

### Componente LeadTrackingTable — Especificacao

**Props:**
```typescript
interface LeadTrackingTableProps {
  leads: LeadTracking[];
  isLoading: boolean;
}
```

**Colunas:**
| Coluna | Campo | Sortable | Formatacao |
|---|---|---|---|
| Email | `leadEmail` | Sim | Texto direto |
| Nome | `firstName + lastName` | Sim (por firstName) | `${firstName} ${lastName}` ou `"-"` se ambos undefined |
| Aberturas | `openCount` | Sim | Numero + badge "Alto Interesse" se >= 3 |
| Cliques | `clickCount` | Sim | Numero |
| Respondeu | `hasReplied` | Sim | "Sim" / "Nao" |
| Ultimo Open | `lastOpenAt` | Sim | Tempo relativo em PT-BR ou "-" |

**Ordenacao:**
- Seguir padrao do `LeadTable` existente (`src/components/leads/LeadTable.tsx`)
- State: `{ column: string | null, direction: 'asc' | 'desc' | null }`
- Ciclo de clique: null -> desc -> asc -> null (prioritizar high values primeiro)
- Icones: `ChevronDown` (desc), `ChevronUp` (asc), `ChevronsUpDown` (neutro)
- Cursor pointer no header sortavel

**Badge "Alto Interesse":**
- Constante: `const DEFAULT_HIGH_INTEREST_THRESHOLD = 3;`
- Exibir quando `lead.openCount >= DEFAULT_HIGH_INTEREST_THRESHOLD`
- Usar `<Badge variant="outline">` com classes: `border-primary/50 text-primary text-[10px]`
- Texto: "Alto Interesse"
- Posicao: ao lado do numero de aberturas na coluna Aberturas
- NOTA: Story 10.7 tornara isso dinamico via config — por ora hardcoded e suficiente

**Paginacao Client-Side:**
- `const LEADS_PER_PAGE = 20;`
- Botoes "Anterior" e "Proximo" com `Button variant="outline" size="sm"`
- Texto: "Pagina X de Y" + "Z leads no total"
- "Anterior" desabilitado na primeira pagina
- "Proximo" desabilitado na ultima pagina

**Skeleton Loading:**
- 5 rows com `Skeleton` em cada celula
- Mesmo numero de colunas que a tabela real

**Estado Vazio:**
- Quando `leads.length === 0` e `!isLoading`
- Icone `Users` ou `Mail` de lucide-react
- Titulo: "Nenhum evento de tracking recebido ainda"
- Subtitulo: "Os dados de tracking aparecerao aqui apos o envio da campanha"

### Formatacao de Tempo Relativo

Reutilizar `formatRelativeTime` do `SyncIndicator.tsx` (`src/components/tracking/SyncIndicator.tsx`). Se a funcao nao estiver exportada, extrair para um utilitario compartilhado ou duplicar inline.

Verificar se `formatRelativeTime` esta exportada do `SyncIndicator`:
```typescript
// Se NAO exportada, criar funcao inline no LeadTrackingTable:
function formatRelativeTime(isoDate: string): string {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Agora mesmo";
  if (diffMin < 60) return `Ha ${diffMin} minuto${diffMin > 1 ? "s" : ""}`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Ha ${diffHours} hora${diffHours > 1 ? "s" : ""}`;
  const diffDays = Math.floor(diffHours / 24);
  return `Ha ${diffDays} dia${diffDays > 1 ? "s" : ""}`;
}
```

### Componentes shadcn/ui Necessarios

- **Table**: `Table`, `TableHeader`, `TableBody`, `TableHead`, `TableRow`, `TableCell` de `@/components/ui/table`
- **Badge**: `Badge` com variant `outline` de `@/components/ui/badge`
- **Button**: `Button` com variant `outline`, size `sm` de `@/components/ui/button`
- **Skeleton**: `Skeleton` de `@/components/ui/skeleton`

### Icones (lucide-react)

- **Ordenacao asc**: `ChevronUp`
- **Ordenacao desc**: `ChevronDown`
- **Ordenacao neutra**: `ChevronsUpDown`
- **Estado vazio**: `Users` ou `MailOpen`
- **Badge**: Nenhum icone necessario (apenas texto)

### Padrao Visual (Tema B&W)

- **Tabela**: `bg-card` para container, `hover:bg-muted/50` para rows (ja no shadcn Table default)
- **Headers**: `text-foreground font-medium` (ja no shadcn TableHead default)
- **Badge "Alto Interesse"**: `border-primary/50 text-primary` — destaque sutil dentro do tema B&W
- **Paginacao**: `text-muted-foreground` para contagem, `Button variant="outline"` para botoes
- **CRITICAL**: Usar `flex flex-col gap-*` ao inves de `space-y-*` (Tailwind v4 + Radix issue)

### Mock Data para Testes

```typescript
import { createMockLeadTracking } from "@/helpers/mock-data";

// Apos atualizar a factory com firstName/lastName:
const lead = createMockLeadTracking({
  leadEmail: "maria@empresa.com",
  firstName: "Maria",
  lastName: "Silva",
  openCount: 5,
  clickCount: 2,
  hasReplied: true,
  lastOpenAt: "2026-02-09T10:00:00Z",
});
```

### Padrao de Testes

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadTrackingTable } from "@/components/tracking/LeadTrackingTable";

describe("LeadTrackingTable", () => {
  it("renderiza 6 colunas de header", () => {
    render(<LeadTrackingTable leads={mockLeads} isLoading={false} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Nome")).toBeInTheDocument();
    expect(screen.getByText("Aberturas")).toBeInTheDocument();
    // ...
  });
});
```

### Story 10.4 Learnings (Previous Story Intelligence)

- **AnalyticsDashboard e composicao simples** de AnalyticsCards + SyncIndicator — LeadTrackingTable sera independente, renderizado pelo page.tsx
- **`enabled` option adicionada ao `useCampaignAnalytics`** durante code review 10.4 — fazer o mesmo para `useLeadTracking`
- **EMPTY_ANALYTICS constante** extraida para default — padrao util para default props
- **DashboardSkeleton** com 7 Skeleton elements — LeadTrackingTable deve ter seu proprio skeleton
- **`formatRelativeTime`** ja implementada no SyncIndicator — verificar se exportada para reutilizar
- **Mock factory `createMockLeadTracking`** ja existe em `__tests__/helpers/mock-data.ts`
- **42 testes** na story 10.4, 3944 total no projeto — verificar regressao
- **BuilderHeader tests** precisaram de mock de `useCampaignLeads` — estar atento a mocks que precisam ser adicionados em testes existentes

### Git Intelligence

Branch: `epic/10-campaign-tracking` (base: main)

Commits recentes relevantes:
- `d3400ba` feat(story-10.4): campaign analytics dashboard UI + code review fixes
- `4150580` feat(story-10.3): TrackingService polling + code review fixes
- `a6cc007` feat(story-10.2): webhook receiver Edge Function + code review fixes

Arquivos que esta story MODIFICA (existentes):
- `src/types/tracking.ts` — adicionar firstName?, lastName? ao LeadTracking
- `src/lib/services/tracking.ts` — atualizar mapToLeadTracking
- `src/hooks/use-lead-tracking.ts` — adicionar parametro `enabled`
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — integrar LeadTrackingTable
- `src/components/tracking/index.ts` — adicionar export
- `__tests__/helpers/mock-data.ts` — atualizar createMockLeadTracking

Arquivos que esta story CRIA (novos):
- `src/components/tracking/LeadTrackingTable.tsx` — componente principal
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — testes

### Anti-Patterns a Evitar

1. **NAO chamar `useLeadTracking` sem `enabled: hasExternalId`** — causa request 400 para campanhas nao exportadas
2. **NAO usar `space-y-*`** — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
3. **NAO usar `console.log`** — ESLint enforces no-console rule
4. **NAO esquecer de exportar `formatRelativeTime`** se reutilizar do SyncIndicator — ou duplicar inline
5. **NAO criar componentes em `src/components/campaigns/`** — tracking components vao em `src/components/tracking/`
6. **NAO adicionar lib de tabela externa** (TanStack Table, AG Grid) — usar shadcn Table simples com sorting manual
7. **NAO mutar o array de leads** — sempre `[...leads].sort()` para sorting
8. **NAO quebrar testes existentes do `mapToLeadTracking`** — campos novos sao opcionais, testes existentes continuam passando
9. **NAO usar `eslint-disable`** para regras de console — nenhum console.log deve existir

### Dependencias Downstream

Esta story alimenta:
- **10.6** (Opportunity Engine): Usara `LeadTracking` com firstName/lastName para lista de leads qualificados
- **10.7** (Opportunity UI): Badge "Alto Interesse" sera atualizado para usar threshold dinamico (config) em vez de hardcoded 3

### Project Structure Notes

- Componente novo: `src/components/tracking/LeadTrackingTable.tsx` — segue padrao dos outros componentes em `tracking/`
- Testes novos: `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx`
- Modificacoes minimais em arquivos existentes: tipo, mapper, hook, pagina, barrel export, mock factory
- Zero conflitos com estrutura existente — extensao natural da infraestrutura da Story 10.3/10.4

### References

- [Source: _bmad-output/planning-artifacts/epic-10-campaign-tracking.md#Story 10.5]
- [Source: _bmad-output/implementation-artifacts/10-4-campaign-analytics-dashboard-ui.md — Previous story intelligence]
- [Source: src/types/tracking.ts — LeadTracking, InstantlyLeadEntry types]
- [Source: src/lib/services/tracking.ts — mapToLeadTracking, TrackingService.getLeadTracking]
- [Source: src/hooks/use-lead-tracking.ts — useLeadTracking hook]
- [Source: src/hooks/use-campaign-analytics.ts — useCampaignAnalytics enabled pattern]
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx — Analytics page structure]
- [Source: src/components/tracking/AnalyticsDashboard.tsx — Dashboard component pattern]
- [Source: src/components/tracking/SyncIndicator.tsx — formatRelativeTime utility]
- [Source: src/components/ui/table.tsx — shadcn Table components]
- [Source: src/components/ui/badge.tsx — Badge component with variants]
- [Source: src/components/leads/LeadTable.tsx — Sorting pattern reference (SortDirection, SortState)]
- [Source: __tests__/helpers/mock-data.ts — createMockLeadTracking factory]
- [Source: _bmad-output/planning-artifacts/research/instantly-campaign-tracking-api-research-2026-02-09.md — Lead endpoint fields]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A

### Completion Notes List

- Task 1: Adicionados campos opcionais `firstName?: string` e `lastName?: string` ao tipo `LeadTracking`. Atualizado `mapToLeadTracking` para mapear `first_name`/`last_name` do `InstantlyLeadEntry`. Mock factory atualizada com defaults. Testes existentes atualizados para validar novos campos (21/21 passando).
- Task 2: Criado componente `LeadTrackingTable` com tabela shadcn de 6 colunas, ordenacao client-side (ciclo null→desc→asc→null), badge "Alto Interesse" (openCount >= 3), skeleton loading (5 rows), estado vazio, paginacao client-side (20/pagina), formatacao de tempo relativo via `formatRelativeTime` importada do SyncIndicator, e formatacao "Sim"/"Nao" para hasReplied.
- Task 3: Adicionado parametro `enabled` ao hook `useLeadTracking` (seguindo padrao de `useCampaignAnalytics`). Integrado `LeadTrackingTable` na pagina analytics abaixo do `AnalyticsDashboard`, com `enabled: hasExternalId`.
- Task 4: Adicionado export de `LeadTrackingTable` ao barrel `src/components/tracking/index.ts`.
- Task 5: 33 testes unitarios para LeadTrackingTable + 4 testes de integracao na pagina analytics = 37 novos testes. Total do projeto: 3981 passando, 1 falha pre-existente (ai-campaign-structure integration test — nao relacionada).

### Change Log

- 2026-02-10: Story 10.5 implementada — LeadTrackingTable com tabela, ordenacao, badge, paginacao, skeleton, estado vazio. 37 novos testes.
- 2026-02-10: Code review — 3 MEDIUM fixes (stale currentPage clamp, error state handling, pagination AC #5 compliance). 5 novos testes. Total: 3986 passando.

### File List

**Modificados:**
- `src/types/tracking.ts` — Adicionados `firstName?: string`, `lastName?: string` ao `LeadTracking`
- `src/lib/services/tracking.ts` — Atualizado `mapToLeadTracking` para mapear `first_name`/`last_name`
- `src/hooks/use-lead-tracking.ts` — Adicionado parametro `options?: { enabled?: boolean }`
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — Integrado `useLeadTracking` e `LeadTrackingTable`
- `src/components/tracking/index.ts` — Adicionado export `LeadTrackingTable`
- `__tests__/helpers/mock-data.ts` — Adicionados defaults `firstName`/`lastName` em `createMockLeadTracking`
- `__tests__/unit/lib/services/tracking.test.ts` — Adicionadas assertions para `firstName`/`lastName`
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — Adicionado mock `useLeadTracking` + 4 testes de integracao
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status 10-5 atualizado

**Criados:**
- `src/components/tracking/LeadTrackingTable.tsx` — Componente principal (tabela, sorting, badge, paginacao, skeleton, empty state)
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — 33 testes unitarios
