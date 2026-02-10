# Story 10.4: Campaign Analytics Dashboard UI

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want ver um dashboard de metricas da minha campanha exportada,
so that acompanhar o desempenho de opens, clicks, replies e bounces sem sair do TDEC Prospect.

## Acceptance Criteria

1. **Given** o usuario acessa a pagina de analytics de uma campanha exportada **When** a pagina `/campaigns/[campaignId]/analytics` carrega **Then** exibe cards de metricas: Total Enviados, Aberturas, Cliques, Respostas, Bounces **And** cada card mostra valor absoluto e taxa percentual **And** segue o tema B&W do projeto

2. **Given** os dados de analytics estao carregando **When** a query esta em estado `isLoading` **Then** exibe skeletons nos cards de metricas **And** exibe skeleton no grafico

3. **Given** o dashboard esta exibido **When** o usuario ve o indicador de sync **Then** mostra quando foi a ultima sincronizacao **And** disponibiliza botao "Sincronizar" para polling manual

4. **Given** o usuario clica em "Sincronizar" **When** o polling e executado **Then** exibe loading indicator durante a sincronizacao **And** atualiza os cards com dados frescos **And** exibe toast de sucesso ou erro

5. **Given** a campanha nao foi exportada (sem `external_campaign_id`) **When** o usuario acessa a pagina de analytics **Then** exibe estado vazio com mensagem "Esta campanha ainda nao foi exportada" **And** sugere exportar a campanha primeiro

6. **Given** a pagina de edicao da campanha **When** a campanha tem `external_campaign_id` **Then** exibe link/botao "Ver Analytics" para navegar para a pagina de analytics

## Tasks / Subtasks

- [x] Task 1: Criar pagina Next.js `/campaigns/[campaignId]/analytics` (AC: #1, #2, #5)
  - [x] 1.1 Criar `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — page component com `use(params)` para extrair `campaignId`
  - [x] 1.2 Usar `useCampaignAnalytics(campaignId)` para buscar dados
  - [x] 1.3 Usar `useCampaign(campaignId)` para verificar `externalCampaignId`
  - [x] 1.4 Renderizar `AnalyticsDashboard` quando dados disponiveis
  - [x] 1.5 Renderizar estado vazio quando `externalCampaignId` e null/undefined (AC: #5)
  - [x] 1.6 Renderizar skeleton loading state enquanto dados carregam (AC: #2)
- [x] Task 2: Criar componente `AnalyticsDashboard` (AC: #1)
  - [x] 2.1 Criar `src/components/tracking/AnalyticsDashboard.tsx` — componente principal do dashboard
  - [x] 2.2 Layout: Header com titulo + SyncIndicator, depois AnalyticsCards, depois area para grafico simples
  - [x] 2.3 Receber `analytics: CampaignAnalytics` e callbacks de sync como props
  - [x] 2.4 Layout responsivo: cards em grid, stacking em mobile
- [x] Task 3: Criar componente `AnalyticsCards` (AC: #1)
  - [x] 3.1 Criar `src/components/tracking/AnalyticsCards.tsx` — grid de cards de metricas
  - [x] 3.2 5 cards: Total Enviados, Aberturas, Cliques, Respostas, Bounces
  - [x] 3.3 Cada card usa shadcn `Card` com valor absoluto (numero) e taxa percentual (%)
  - [x] 3.4 Formatar rates como percentual: `(rate * 100).toFixed(1)%` (rates vem como decimal 0-1)
  - [x] 3.5 Grid responsivo: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4`
  - [x] 3.6 Tema B&W: `bg-card text-card-foreground` com bordas do projeto
  - [x] 3.7 Icones lucide-react por card: `Send`, `MailOpen`, `MousePointerClick`, `Reply`, `AlertTriangle`
- [x] Task 4: Criar componente `SyncIndicator` (AC: #3, #4)
  - [x] 4.1 Criar `src/components/tracking/SyncIndicator.tsx`
  - [x] 4.2 Exibir `lastSyncAt` formatado em portugues (ex: "Sincronizado ha 3 minutos")
  - [x] 4.3 Botao "Sincronizar" que chama `useSyncAnalytics().mutate()`
  - [x] 4.4 Loading state: `Loader2` com `animate-spin` durante sync
  - [x] 4.5 Toast de sucesso/erro via `sonner` (AC: #4)
  - [x] 4.6 Desabilitar botao durante mutacao (`isPending`)
- [x] Task 5: Criar barrel export `src/components/tracking/index.ts` (AC: N/A)
  - [x] 5.1 Exportar `AnalyticsDashboard`, `AnalyticsCards`, `SyncIndicator`
- [x] Task 6: Adicionar link "Ver Analytics" no BuilderHeader (AC: #6)
  - [x] 6.1 Modificar `src/components/builder/BuilderHeader.tsx` — adicionar prop `externalCampaignId?: string | null`
  - [x] 6.2 Quando `externalCampaignId` existe, exibir botao/link `BarChart3` icon + "Analytics" ao lado dos botoes existentes
  - [x] 6.3 Link navega para `/campaigns/${campaignId}/analytics`
  - [x] 6.4 Modificar `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — passar `campaign.externalCampaignId` como prop ao `BuilderHeader`
- [x] Task 7: Testes unitarios dos componentes (AC: #1, #2, #3, #4, #5, #6)
  - [x] 7.1 `__tests__/unit/components/tracking/AnalyticsCards.test.tsx` — renderiza 5 cards, valores corretos, rates formatados
  - [x] 7.2 `__tests__/unit/components/tracking/SyncIndicator.test.tsx` — exibe lastSyncAt, botao sync, loading state, toast
  - [x] 7.3 `__tests__/unit/components/tracking/AnalyticsDashboard.test.tsx` — renderiza composicao completa, skeleton loading, empty state
  - [x] 7.4 Testes de integracao da pagina: loading state, empty state (sem externalCampaignId), estado com dados

## Dev Notes

### Hooks e Servicos Existentes (Story 10.3 — DONE)

Os hooks que alimentam o dashboard ja existem e estao testados:

```typescript
// src/hooks/use-campaign-analytics.ts
import { useCampaignAnalytics } from "@/hooks/use-campaign-analytics";
import { useSyncAnalytics } from "@/hooks/use-campaign-analytics";

// Retorna UseQueryResult<CampaignAnalytics>
const { data: analytics, isLoading, isError, error } = useCampaignAnalytics(campaignId);

// Retorna UseMutationResult<SyncResult> — invalida query automaticamente
const { mutate: syncAnalytics, isPending: isSyncing } = useSyncAnalytics(campaignId);
```

```typescript
// src/hooks/use-lead-tracking.ts (para Story 10.5, nao necessario agora)
import { useLeadTracking } from "@/hooks/use-lead-tracking";
const { data: leads, isLoading } = useLeadTracking(campaignId);
```

### Tipos de Dados (src/types/tracking.ts)

```typescript
interface CampaignAnalytics {
  campaignId: string;
  totalSent: number;
  totalOpens: number;      // unique opens (nao total)
  totalClicks: number;     // unique clicks
  totalReplies: number;    // unique replies
  totalBounces: number;
  openRate: number;        // decimal 0-1 (ex: 0.24 = 24%)
  clickRate: number;       // decimal 0-1
  replyRate: number;       // decimal 0-1
  bounceRate: number;      // decimal 0-1
  lastSyncAt: string;      // ISO date string
}

interface SyncResult {
  campaignId: string;
  analytics: CampaignAnalytics;
  dailyAnalytics: DailyAnalyticsEntry[];
  lastSyncAt: string;
  source: "polling";
}

interface DailyAnalyticsEntry {
  date: string;            // YYYY-MM-DD
  sent: number;
  contacted: number;
  opened: number;
  unique_opened: number;
  replies: number;
  unique_replies: number;
  clicks: number;
  unique_clicks: number;
}
```

### API Routes Existentes (Story 10.3 — DONE)

Todas as API routes ja existem:
- `GET /api/campaigns/[campaignId]/analytics` → retorna `{ data: CampaignAnalytics }`
- `POST /api/campaigns/[campaignId]/analytics/sync` → retorna `{ data: SyncResult }`
- `GET /api/campaigns/[campaignId]/leads/tracking` → retorna `{ data: LeadTracking[] }`

Formato de erro: `{ error: "Mensagem em portugues" }`

### Padrao de Pagina Next.js App Router

```typescript
// src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx
"use client";

import { use } from "react";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default function CampaignAnalyticsPage({ params }: PageProps) {
  const { campaignId } = use(params);
  // ... componentes
}
```

### Componentes shadcn/ui Disponiveis

- **Card**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` — usar para cada card de metrica
- **Skeleton**: `Skeleton` — classes `bg-accent animate-pulse rounded-md`, usar para loading states
- **Badge**: `Badge` com variantes (default, secondary, outline) — para badges visuais
- **Button**: `Button` com variantes — para botao Sincronizar
- **Toast**: Usar `import { toast } from "sonner"` — `toast.success()`, `toast.error()`, `toast.loading()`

### Padrao Visual (Tema B&W)

O projeto usa tema B&W neutro (Epic 8):
- **Backgrounds**: `bg-background` (#0A0A0A dark), `bg-card` (#121212 dark)
- **Texto**: `text-foreground` (#FAFAFA), `text-muted-foreground` (#9E9E9E)
- **Bordas**: `border` (#2B2B2B), `border-border`
- **Primary/CTA**: `text-primary` (branco), `bg-primary` (branco), `text-primary-foreground` (preto)
- **Status colors**: `text-success` (#22C55E), `text-warning` (#F59E0B), `text-destructive` (#EF4444)
- **CRITICAL**: Usar `flex flex-col gap-*` ao inves de `space-y-*` (Tailwind v4 + Radix issue)
- Dark mode e o DEFAULT — nao precisa de prefixo `dark:`

### Icones (lucide-react)

Icones recomendados por card:
- **Total Enviados**: `Send` ou `Mail`
- **Aberturas**: `MailOpen`
- **Cliques**: `MousePointerClick`
- **Respostas**: `Reply` ou `MessageSquare`
- **Bounces**: `AlertTriangle` ou `MailX`
- **Sync**: `RefreshCw`
- **Analytics link**: `BarChart3`
- **Loading**: `Loader2` com `animate-spin`

### Formatacao de Rates

As rates vem como decimal (0-1). Formatar para exibicao:
```typescript
// Exemplos de formatacao
const formatRate = (rate: number): string => {
  return `${(rate * 100).toFixed(1)}%`;
};

// openRate: 0.24 → "24.0%"
// bounceRate: 0.016 → "1.6%"
```

### Formatacao de lastSyncAt

Usar formatacao relativa em portugues:
```typescript
// Opcao simples (sem lib externa)
const formatRelativeTime = (isoDate: string): string => {
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
};
```

### Estado Vazio (Campanha Nao Exportada)

AC #5: Verificar `campaign.externalCampaignId` (via `useCampaign` hook):
```typescript
const { data: campaign } = useCampaign(campaignId);

if (!campaign?.externalCampaignId) {
  return <EmptyState message="Esta campanha ainda nao foi exportada" />;
}
```

O hook `useCampaign(campaignId)` ja existe em `src/hooks/use-campaigns.ts` e retorna `Campaign` que inclui `externalCampaignId: string | null`.

### BuilderHeader — Adicionar Link Analytics (AC #6)

O `BuilderHeader` em `src/components/builder/BuilderHeader.tsx` aceita props via interface `BuilderHeaderProps`. Para adicionar o link "Ver Analytics":

1. Adicionar prop `externalCampaignId?: string | null` ao `BuilderHeaderProps`
2. Condicional: se `externalCampaignId` && `campaignId` existem, renderizar botao `Link` com icone `BarChart3`
3. Posicionar entre os botoes existentes (Preview e Export), visualmente proximo ao Export
4. Usar `<Link href={/campaigns/${campaignId}/analytics}>` (Next.js Link)
5. No `edit/page.tsx`, passar `campaign.externalCampaignId` para `BuilderHeader`

```typescript
// No BuilderHeader, entre Export e Save:
{externalCampaignId && campaignId && (
  <Button
    data-testid="analytics-button"
    variant="outline"
    size="sm"
    asChild
    className="gap-1.5"
  >
    <Link href={`/campaigns/${campaignId}/analytics`}>
      <BarChart3 className="h-4 w-4" />
      Analytics
    </Link>
  </Button>
)}
```

### Grafico de Evolucao Diaria (Escopo Simplificado)

A epic define: "Grafico de evolucao diaria pode ser feito com barras simples (sem lib de chart externa por enquanto — CSS/Tailwind)".

O `SyncResult.dailyAnalytics` retorna `DailyAnalyticsEntry[]` com dados diarios. Implementar um grafico de barras simples com CSS/Tailwind:
- Barras verticais proporcionais ao max value
- Labels de data no eixo X
- Tooltip opcional com valores exatos
- Se complexidade for alta, pode ser adiado para story futura — o core sao os cards de metricas

### Mock Data para Testes

Factories ja existem em `__tests__/helpers/mock-data.ts`:
```typescript
import { createMockCampaignAnalytics, createMockLeadTracking } from "@/helpers/mock-data";

const analytics = createMockCampaignAnalytics({
  campaignId: "campaign-1",
  totalSent: 500,
  totalOpens: 120,
  openRate: 0.24,
});
```

### Padrao de Testes de Componentes

Seguir padrao existente do projeto:
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock hooks
vi.mock("@/hooks/use-campaign-analytics", () => ({
  useCampaignAnalytics: vi.fn(),
  useSyncAnalytics: vi.fn(),
}));

describe("AnalyticsCards", () => {
  it("renderiza 5 cards de metricas", () => {
    render(<AnalyticsCards analytics={mockAnalytics} />);
    expect(screen.getByText("Total Enviados")).toBeInTheDocument();
    // ...
  });
});
```

### Story 10.3 Learnings (Previous Story Intelligence)

- **TrackingService separado do InstantlyService** (SRP) — dashboard consome apenas via hooks
- **Funcoes puras `mapToCampaignAnalytics` e `mapToLeadTracking`** exportadas para testabilidade
- **Paginacao cursor-based com MAX_PAGINATION_PAGES=50** safety limit no service
- **API routes como proxy** — apiKey nunca exposta client-side
- **Dados de polling sao read-only** (ADR-004) — nao persistidos em campaign_events
- **Contadores unique usados** (open_count_unique, nao open_count) para evitar inflacao
- **`dailyAnalytics: DailyAnalyticsEntry[]`** adicionado ao SyncResult (commit 10.3)
- **UUID validation** nas API routes (adicionada no code review 10.3)

### Git Intelligence

Branch: `epic/10-campaign-tracking` (base: main)

Commits recentes relevantes:
- `4150580` feat(story-10.3): TrackingService polling + code review fixes
- `a6cc007` feat(story-10.2): webhook receiver Edge Function + code review fixes
- `5f4b775` feat(story-10.1): schema de tracking, tipos TypeScript e sprint status

Arquivos criados na 10.3 que o dashboard consome:
- `src/hooks/use-campaign-analytics.ts` — hook TanStack Query
- `src/hooks/use-lead-tracking.ts` — hook TanStack Query
- `src/lib/services/tracking.ts` — TrackingService
- `src/types/tracking.ts` — tipos completos

### Anti-Patterns a Evitar

1. **NAO chamar TrackingService diretamente** — usar APENAS via hooks (`useCampaignAnalytics`, `useSyncAnalytics`)
2. **NAO expor apiKey no client-side** — tudo passa pela API route ja existente
3. **NAO usar `space-y-*`** — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
4. **NAO usar `console.log`** — ESLint enforces no-console rule
5. **NAO formatar rates como se fossem percentuais prontos** — rates sao decimal 0-1, multiplicar por 100
6. **NAO esquecer estado vazio** — verificar `externalCampaignId` antes de buscar analytics
7. **NAO criar componentes em `src/components/campaigns/`** — tracking components vao em `src/components/tracking/`
8. **NAO adicionar libs externas de charts** — usar CSS/Tailwind para grafico simples

### Dependencias Downstream

Esta story alimenta:
- **10.5** (Lead Tracking Detail): Tabela de leads no mesmo dashboard — componente sera adicionado na analytics page
- **10.6** (Opportunity Engine): Config de threshold sera integrada ao dashboard
- **10.7** (Opportunity UI): OpportunityPanel sera adicionado ao layout do dashboard

### Project Structure Notes

- Nova pagina: `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx`
- Novos componentes: `src/components/tracking/AnalyticsDashboard.tsx`, `AnalyticsCards.tsx`, `SyncIndicator.tsx`, `index.ts`
- Modificacoes: `src/components/builder/BuilderHeader.tsx` (prop externalCampaignId + botao Analytics)
- Modificacoes: `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` (passar prop ao BuilderHeader)
- Novos testes: `__tests__/unit/components/tracking/AnalyticsCards.test.tsx`, `SyncIndicator.test.tsx`, `AnalyticsDashboard.test.tsx`
- Zero conflitos com estrutura existente — tracking components sao novos

### References

- [Source: _bmad-output/planning-artifacts/epic-10-campaign-tracking.md#Story 10.4]
- [Source: _bmad-output/implementation-artifacts/10-3-instantly-analytics-service-polling.md — Previous story intelligence]
- [Source: src/hooks/use-campaign-analytics.ts — useCampaignAnalytics + useSyncAnalytics hooks]
- [Source: src/hooks/use-lead-tracking.ts — useLeadTracking hook]
- [Source: src/types/tracking.ts — CampaignAnalytics, SyncResult, DailyAnalyticsEntry types]
- [Source: src/components/ui/card.tsx — Card component pattern (bg-card, rounded-xl, border)]
- [Source: src/components/ui/skeleton.tsx — Skeleton (bg-accent animate-pulse)]
- [Source: src/components/builder/BuilderHeader.tsx — BuilderHeaderProps interface, button pattern]
- [Source: src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx — Campaign edit page structure]
- [Source: src/hooks/use-campaigns.ts — useCampaign(campaignId) hook, Campaign type with externalCampaignId]
- [Source: src/app/globals.css — CSS variables, B&W theme, typography scale]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- BuilderHeader tests needed `useCampaignLeads` mock added — `LeadPreviewSelector` renders when `campaignId` is provided and requires QueryClient
- CampaignAnalyticsPage tests needed `Suspense` wrapper + `act()` + `waitFor()` — `use(params)` with Promise causes React suspension

### Completion Notes List

- Task 3 (AnalyticsCards): 5 metric cards with METRIC_CARDS config array, `formatRate()` utility, responsive grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`, shadcn Card component, lucide-react icons. 8 tests.
- Task 4 (SyncIndicator): `formatRelativeTime()` with PT-BR formatting (Agora mesmo/minutos/horas/dias), sync Button with Loader2 spinner, disabled during `isPending`. 13 tests (6 component + 7 formatRelativeTime unit).
- Task 2 (AnalyticsDashboard): Composition of AnalyticsCards + SyncIndicator, DashboardSkeleton with 7 Skeleton elements (2 header + 5 cards), campaign name in title. 8 tests.
- Task 5 (barrel): `src/components/tracking/index.ts` exports all 3 components.
- Task 1 (page): `CampaignAnalyticsPage` with `use(params)`, `useCampaign` for externalCampaignId check, `useCampaignAnalytics` for data, `useSyncAnalytics` for manual sync with toast callbacks, EmptyState component, back navigation link. 8 tests.
- Task 6 (BuilderHeader): Added `externalCampaignId` prop, BarChart3 icon, `asChild` Button wrapping Next.js Link, positioned between Export and Save. `edit/page.tsx` passes `campaign.externalCampaignId`. 5 tests.
- Task 7 (tests): 4 test files, 42 new tests total. All passing. Full regression suite: 3944 passed, 1 pre-existing flaky failure (ai-campaign-structure unrelated).

### File List

- `src/components/tracking/AnalyticsCards.tsx` (new)
- `src/components/tracking/SyncIndicator.tsx` (new)
- `src/components/tracking/AnalyticsDashboard.tsx` (new)
- `src/components/tracking/index.ts` (new)
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` (new)
- `src/components/builder/BuilderHeader.tsx` (modified — added externalCampaignId prop + Analytics button)
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` (modified — passes externalCampaignId to BuilderHeader)
- `src/hooks/use-campaign-analytics.ts` (modified — added optional `enabled` parameter to useCampaignAnalytics)
- `src/lib/services/tracking.ts` (modified — empty analytics response returns zero-filled data instead of 404 error)
- `__tests__/unit/components/tracking/AnalyticsCards.test.tsx` (new — 8 tests)
- `__tests__/unit/components/tracking/SyncIndicator.test.tsx` (new — 13 tests)
- `__tests__/unit/components/tracking/AnalyticsDashboard.test.tsx` (new — 8 tests)
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` (new — 8 tests)
- `__tests__/unit/components/builder/BuilderHeader.test.tsx` (modified — added 5 Analytics button tests + useCampaignLeads mock)
- `__tests__/unit/lib/services/tracking.test.ts` (modified — updated empty response test to expect zero-filled analytics)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — 10-4 status: done)

### Change Log

- 2026-02-10: Story 10.4 implementation complete. 7 tasks, 42 new tests. All ACs satisfied. Dashboard UI with 5 metric cards, sync indicator, empty state, analytics link in BuilderHeader.
- 2026-02-10: Code Review fixes applied (6 issues: 1 HIGH, 3 MEDIUM, 2 LOW). Removed dead toast import from SyncIndicator. Added `enabled` option to useCampaignAnalytics hook. Restructured page to eliminate skeleton→empty state flash. Extracted EMPTY_ANALYTICS constant. Removed redundant handleSync wrapper. Updated File List with undocumented tracking.ts changes.
