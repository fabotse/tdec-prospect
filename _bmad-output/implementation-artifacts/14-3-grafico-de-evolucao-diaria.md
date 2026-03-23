# Story 14.3: Grafico de Evolucao Diaria

Status: done

## Story

As a usuario,
I want ver um grafico mostrando a evolucao diaria de envios, aberturas e respostas,
so that eu identifique tendencias e o ritmo da campanha ao longo do tempo.

## Acceptance Criteria

1. Componente `DailyAnalyticsChart` com grafico de linhas/area
2. Series: Enviados (sent), Aberturas (unique_opened), Respostas (unique_replies)
3. Eixo X: datas, Eixo Y: contagens
4. Tooltip ao passar o mouse mostrando valores de cada serie no dia
5. Dados vindos de `dailyAnalytics` (ja buscado durante sync, campo `SyncResult.dailyAnalytics`)
6. Se nao houver dados diarios, mostrar estado vazio: "Sincronize a campanha para ver a evolucao diaria"
7. Secao colapsavel (mesmo padrao do `OpportunityPanel` com ChevronDown/ChevronUp) para nao poluir a tela
8. Testes unitarios para renderizacao com dados e estado vazio

## Tasks / Subtasks

- [x] Task 1: Instalar biblioteca recharts (AC: #1)
  - [x] 1.1 Executar `npm install recharts` (biblioteca padrao React para charts, compativel com SSR/Next.js)
  - [x] 1.2 Verificar que o build continua passando apos instalacao

- [x] Task 2: Capturar `dailyAnalytics` do resultado do sync e threading de dados (AC: #5)
  - [x] 2.1 Em `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx`: adicionar state `dailyAnalytics` com `useState<DailyAnalyticsEntry[]>([])`
  - [x] 2.2 Capturar `dailyAnalytics` do resultado de `useSyncAnalytics` via callback `onSuccess` no `handleSync`
  - [x] 2.3 Passar `dailyAnalytics` como nova prop para `AnalyticsDashboard`

- [x] Task 3: Atualizar `AnalyticsDashboard` para receber e renderizar chart (AC: #1, #7)
  - [x] 3.1 Adicionar prop opcional `dailyAnalytics?: DailyAnalyticsEntry[]` em `AnalyticsDashboardProps`
  - [x] 3.2 Renderizar `DailyAnalyticsChart` abaixo de `AnalyticsCards`
  - [x] 3.3 Adicionar skeleton para a secao do chart no `DashboardSkeleton`

- [x] Task 4: Criar componente `DailyAnalyticsChart` (AC: #1, #2, #3, #4, #6, #7)
  - [x] 4.1 Criar `src/components/tracking/DailyAnalyticsChart.tsx` ("use client")
  - [x] 4.2 Implementar secao colapsavel com estado `isOpen` + icone ChevronDown/ChevronUp (padrao OpportunityPanel)
  - [x] 4.3 Implementar grafico de linhas com recharts: `ResponsiveContainer` + `LineChart` + `Line` + `XAxis` + `YAxis` + `Tooltip` + `CartesianGrid`
  - [x] 4.4 3 series de linhas: Enviados (sent) com --chart-1, Aberturas (unique_opened) com --chart-2, Respostas (unique_replies) com --chart-3
  - [x] 4.5 Tooltip customizado mostrando valores de cada serie no dia (em PT-BR)
  - [x] 4.6 Formatacao do eixo X: datas curtas (DD/MM)
  - [x] 4.7 Estado vazio quando `dailyAnalytics` for array vazio ou undefined: "Sincronize a campanha para ver a evolucao diaria"
  - [x] 4.8 Layout responsivo (ResponsiveContainer com height fixo ~300px)

- [x] Task 5: Testes unitarios (AC: #8)
  - [x] 5.1 Criar `__tests__/unit/components/tracking/DailyAnalyticsChart.test.tsx`
  - [x] 5.2 Testar renderizacao com dados (verifica presenca do chart container)
  - [x] 5.3 Testar estado vazio (array vazio) — mensagem "Sincronize a campanha..."
  - [x] 5.4 Testar estado vazio (prop undefined) — mesma mensagem
  - [x] 5.5 Testar colapsavel: inicialmente aberto, clicar fecha, clicar abre
  - [x] 5.6 Testar que as 3 series estao presentes (verificar legenda ou data-testid)
  - [x] 5.7 Atualizar testes do `AnalyticsDashboard` para verificar presenca do `DailyAnalyticsChart`
  - [x] 5.8 Rodar `npx vitest run` e confirmar que TODOS os testes passam

## Dev Notes

### Contexto de Negocio

Esta story adiciona visualizacao temporal ao dashboard de analytics. O usuario quer ver tendencias ao longo do tempo: "meus envios estao crescendo?", "as aberturas cairam essa semana?". Os dados de `dailyAnalytics` **ja sao buscados** durante o sync (via `TrackingService.getDailyAnalytics()`) e retornados no `SyncResult` — atualmente sao descartados pela UI. Esta story conecta esses dados a um grafico visual.

### Descoberta Critica: Gap no Fluxo de Dados

O `dailyAnalytics` ja percorre: `Instantly API` -> `TrackingService.syncAnalytics()` -> `POST /api/campaigns/[campaignId]/analytics/sync` (resposta) -> `useSyncAnalytics` (mutation result). **Porem, a page descarta o resultado da mutation** — ela so usa `onSuccess` para invalidar a query de analytics agregados. O dev precisa capturar `dailyAnalytics` do resultado da mutation e manter em estado local.

### Fluxo de Dados (Como Deve Funcionar Apos Implementacao)

```
1. Usuario clica "Sincronizar"
2. page.tsx chama handleSync -> useSyncAnalytics.mutate()
3. POST /api/campaigns/[campaignId]/analytics/sync
4. TrackingService.syncAnalytics() faz Promise.all([getCampaignAnalytics, getDailyAnalytics])
5. Retorna SyncResult { analytics, dailyAnalytics, lastSyncAt, source }
6. page.tsx captura dailyAnalytics do resultado -> setDailyAnalytics(result.dailyAnalytics)
7. page.tsx passa dailyAnalytics como prop para AnalyticsDashboard
8. AnalyticsDashboard renderiza DailyAnalyticsChart com os dados
```

### Arquitetura e Padroes Obrigatorios

- **Component file:** `src/components/tracking/DailyAnalyticsChart.tsx` — novo componente, "use client"
- **Chart library:** recharts (NAO esta no projeto — DEVE ser instalada: `npm install recharts`)
- **Tailwind CSS v4:** Usar `flex flex-col gap-*` (NUNCA `space-y-*` — nao funciona com Radix UI neste projeto)
- **Tema B&W:** Usar CSS variables `--chart-1`, `--chart-2`, `--chart-3` para cores das linhas (grayscale, definidos em globals.css)
  - Dark mode: `--chart-1: hsl(0 0% 95%)` (near-white), `--chart-2: hsl(0 0% 75%)` (light gray), `--chart-3: hsl(0 0% 55%)` (medium gray)
  - Light mode: `--chart-1: hsl(0 0% 15%)` (near-black), `--chart-2: hsl(0 0% 30%)` (dark gray), `--chart-3: hsl(0 0% 50%)` (medium gray)
- **UI em portugues brasileiro:** Todos os textos visiveis devem ser em PT-BR
- **Icons:** `ChevronDown`, `ChevronUp` de lucide-react (para colapsavel)
- **data-testid:** Obrigatorio em todos os elementos testaveis (padrao do projeto)
- **Collapsible:** Usar padrao `Card + CardHeader + CardContent` com `useState` + `ChevronDown/ChevronUp` (como `ThresholdConfig.tsx` — NAO existe componente Collapsible do shadcn/ui no projeto)
- **Export:** Adicionar export em `src/components/tracking/index.ts`

### Tipos Relevantes (Ja Existem — NAO Criar Novos)

```typescript
// src/types/tracking.ts
export interface DailyAnalyticsEntry {
  date: string;       // formato YYYY-MM-DD
  sent: number;
  contacted: number;
  opened: number;
  unique_opened: number;
  replies: number;
  unique_replies: number;
  clicks: number;
  unique_clicks: number;
}

export interface SyncResult {
  campaignId: string;
  analytics: CampaignAnalytics;
  dailyAnalytics: DailyAnalyticsEntry[];
  lastSyncAt: string;
  source: "polling";
}
```

### Props do DailyAnalyticsChart

```typescript
interface DailyAnalyticsChartProps {
  dailyAnalytics?: DailyAnalyticsEntry[];
}
```

### Padrao Colapsavel (Copiar de ThresholdConfig)

O `ThresholdConfig` usa `Card` + `CardHeader` (clickavel) + `CardContent` condicional. Seguir o mesmo padrao:

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

const [isOpen, setIsOpen] = useState(true); // aberto por padrao (chart e o foco desta story)

<Card data-testid="daily-analytics-chart">
  <CardHeader
    className="cursor-pointer select-none"
    onClick={() => setIsOpen((prev) => !prev)}
    data-testid="daily-chart-toggle"
  >
    <div className="flex items-center gap-2">
      <CardTitle>Evolucao Diaria</CardTitle>
      <span className="ml-auto">
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </span>
    </div>
    <CardDescription>Tendencia de envios, aberturas e respostas ao longo do tempo</CardDescription>
  </CardHeader>
  {isOpen && (
    <CardContent data-testid="daily-chart-content">
      {/* chart ou estado vazio */}
    </CardContent>
  )}
</Card>
```

**Nota:** `ThresholdConfig` inicia fechado (`useState(false)`) pois e configuracao secundaria. O chart inicia **aberto** (`useState(true)`) pois e o entregavel principal desta story — o usuario quer ver o grafico imediatamente.

### Cores das Series no Recharts

```tsx
// Acessar CSS variables via hsl()
<Line dataKey="sent" stroke="hsl(var(--chart-1))" name="Enviados" strokeWidth={2} />
<Line dataKey="unique_opened" stroke="hsl(var(--chart-2))" name="Aberturas" strokeWidth={2} />
<Line dataKey="unique_replies" stroke="hsl(var(--chart-3))" name="Respostas" strokeWidth={2} />
```

### Modificacao na Page (Capturar dailyAnalytics)

**Arquivo:** `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx`

```typescript
// ADICIONAR: state para dailyAnalytics
const [dailyAnalytics, setDailyAnalytics] = useState<DailyAnalyticsEntry[]>([]);

// MODIFICAR: handleSync para capturar resultado
const handleSync = useCallback(() => {
  syncAnalytics(undefined, {
    onSuccess: (result) => {
      setDailyAnalytics(result.dailyAnalytics);
    },
  });
}, [syncAnalytics]);

// MODIFICAR: prop do AnalyticsDashboard
<AnalyticsDashboard
  analytics={analytics ?? EMPTY_ANALYTICS}
  dailyAnalytics={dailyAnalytics}  // NOVO
  isLoading={isLoadingAnalytics}
  lastSyncAt={analytics?.lastSyncAt ?? null}
  onSync={handleSync}
  isSyncing={isSyncing}
  campaignName={campaign?.name ?? ""}
/>
```

**ATENCAO:** Verificar a assinatura atual de `handleSync` e `syncAnalytics` (que vem de `useMutation`). A mutation de TanStack Query v5 aceita `mutate(variables, { onSuccess })` onde `onSuccess` recebe o resultado. O `syncAnalytics` (mutate) aceita `undefined` como primeiro argumento pois `mutationFn` nao recebe parametros.

### Modificacao no AnalyticsDashboard

**Arquivo:** `src/components/tracking/AnalyticsDashboard.tsx`

```typescript
// ADICIONAR prop:
interface AnalyticsDashboardProps {
  analytics: CampaignAnalytics;
  dailyAnalytics?: DailyAnalyticsEntry[];  // NOVO
  isLoading: boolean;
  lastSyncAt: string | null;
  onSync: () => void;
  isSyncing: boolean;
  campaignName: string;
}

// ADICIONAR apos AnalyticsCards:
<DailyAnalyticsChart dailyAnalytics={dailyAnalytics} />

// ADICIONAR skeleton:
{/* Daily chart skeleton */}
<Skeleton className="h-[350px] rounded-lg" />
```

### Mock de recharts para Testes

recharts renderiza SVG e depende de `ResizeObserver`. Para testes vitest + jsdom:

```typescript
// No arquivo de teste, antes do describe:
vi.mock("recharts", () => {
  const OriginalModule = vi.importActual("recharts");
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 300 }}>
        {children}
      </div>
    ),
  };
});
```

**Alternativa (mais simples):** Se recharts der problemas com jsdom, o dev pode optar por testar apenas:
- Presenca do container do chart (data-testid)
- Estado vazio (mensagem de texto)
- Colapsavel (toggle abre/fecha)
- **NAO** testar internals do SVG (eixos, linhas) — isso e responsabilidade da lib

### Mock Factory para DailyAnalytics

**Arquivo:** `__tests__/helpers/mock-data.ts` — adicionar:

```typescript
export function createMockDailyAnalytics(
  days: number = 7,
  overrides: Partial<DailyAnalyticsEntry> = {}
): DailyAnalyticsEntry[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    return {
      date: date.toISOString().split("T")[0],
      sent: 50 + i * 10,
      contacted: 45 + i * 8,
      opened: 20 + i * 5,
      unique_opened: 15 + i * 4,
      replies: 3 + i,
      unique_replies: 2 + i,
      clicks: 5 + i * 2,
      unique_clicks: 4 + i,
      ...overrides,
    };
  });
}
```

### Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/tracking/DailyAnalyticsChart.tsx` | Novo componente com chart + colapsavel + empty state |
| `__tests__/unit/components/tracking/DailyAnalyticsChart.test.tsx` | Testes do componente |

### Arquivos a Modificar

| Arquivo | Modificacao |
|---------|-------------|
| `package.json` | Dependencia `recharts` adicionada via `npm install recharts` |
| `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` | State `dailyAnalytics`, captura no handleSync, prop para AnalyticsDashboard |
| `src/components/tracking/AnalyticsDashboard.tsx` | Nova prop `dailyAnalytics?`, render DailyAnalyticsChart, skeleton |
| `src/components/tracking/index.ts` | Adicionar export `DailyAnalyticsChart` |
| `__tests__/helpers/mock-data.ts` | Adicionar `createMockDailyAnalytics()` |
| `__tests__/unit/components/tracking/AnalyticsDashboard.test.tsx` | Teste presenca DailyAnalyticsChart |

### Arquivos que NAO devem ser tocados

- `src/types/tracking.ts` — `DailyAnalyticsEntry` e `SyncResult` ja existem
- `src/lib/services/tracking.ts` — `syncAnalytics()` ja retorna `dailyAnalytics`
- `src/app/api/campaigns/[campaignId]/analytics/sync/route.ts` — API ja retorna `dailyAnalytics` no response
- `src/hooks/use-campaign-analytics.ts` — `useSyncAnalytics` ja retorna `SyncResult` completo

### Armadilhas e Guardrails

1. **NAO usar `space-y-*`** — Tailwind v4 + Radix nao funciona. Usar `flex flex-col gap-*`.
2. **NAO criar tipos novos** — `DailyAnalyticsEntry` ja existe em `src/types/tracking.ts`.
3. **NAO modificar a API route ou o service** — os dados ja fluem corretamente ate o frontend.
4. **NAO alterar `useSyncAnalytics`** — o hook ja retorna `SyncResult` com `dailyAnalytics`. A captura deve ser feita na page via `onSuccess` callback.
5. **NAO persistir dailyAnalytics em React Query** — estado local `useState` e suficiente pois os dados sao efemeros (resetam ao navegar, refetch ao sync).
6. **NAO hardcodar cores** — usar CSS variables `hsl(var(--chart-N))` para respeitar tema dark/light.
7. **NAO esquecer de mockar `ResponsiveContainer`** do recharts nos testes — jsdom nao suporta `ResizeObserver`.
8. **ESLint no-console** — Nao usar `console.log` no codigo de producao.
9. **recharts DEVE ser instalada** — nao esta no projeto atualmente. Usar `npm install recharts`.
10. **Prop `dailyAnalytics` deve ser opcional** — componente deve funcionar com `undefined` (estado antes do primeiro sync).
11. **Datas no formato brasileiro** — eixo X deve mostrar DD/MM, nao YYYY-MM-DD.
12. **`handleSync` atual pode ser diferente** — verificar implementacao atual antes de modificar. A mutation de TanStack Query v5 tem `mutate(vars, { onSuccess })`.

### Padroes de Teste Existentes

- **Framework:** vitest + @testing-library/react + @testing-library/user-event
- **Mock factories:** `createMockCampaignAnalytics()` em `__tests__/helpers/mock-data.ts`
- **data-testid:** Todos os elementos testados usam `data-testid` para queries
- **Padrao de import:** `import { createMockCampaignAnalytics } from "../../../helpers/mock-data";`
- **Padrao de describe:** `describe("DailyAnalyticsChart (AC: #X, #Y)", () => { ... })`

### Previous Story Intelligence

**Story 14.2 (Barra de Progresso) — Learnings:**
- Integracao no AnalyticsDashboard foi simples: import + 1 linha JSX + 1 skeleton
- Mock factory `createMockCampaignAnalytics()` aceita overrides parciais
- Campos opcionais em props: verificar existencia antes de usar
- Testes: `render()` + `screen.getByTestId()` + `expect().toBeInTheDocument()`
- Code review encontrou bug em empty state condicional — prestar atencao nos edge cases de dados undefined vs zero
- `DashboardSkeleton` teve skeleton count atualizado de 7 para 8 — lembrar de atualizar nos testes

**Story 14.1 (Expandir Tipos) — Learnings:**
- Campos novos em CampaignAnalytics sao opcionais (`?`) — mesmo padrao para dailyAnalytics prop
- Code review removeu `?? undefined` redundantes — nao adicionar fallbacks desnecessarios
- `campaignStatus` e number (0-3) — dailyAnalytics nao tem esse campo, so dados numericos simples

**Padrao do OpportunityPanel (Collapsible):**
- `useState(true)` para iniciar aberto
- `ChevronDown/ChevronUp` toggle
- `cursor-pointer` no header clickavel
- Conteudo condicionalmente renderizado com `{isOpen && (...)}`

### Git Intelligence

Ultimo commit: `480cd72 feat(story-14.2): barra de progresso e status da campanha + code review fixes`
Branch: `epic/14-analytics-avancado-campanha`

Commit sugerido para esta story: `feat(story-14.3): grafico de evolucao diaria + code review fixes`

### Project Structure Notes

- Novo componente segue padrao existente: `src/components/tracking/DailyAnalyticsChart.tsx`
- Novo teste segue padrao existente: `__tests__/unit/components/tracking/DailyAnalyticsChart.test.tsx`
- Nova dependencia: `recharts` — amplamente usada, tree-shakeable, compativel com Next.js
- Integracao no AnalyticsDashboard: nova prop + 1 componente + 1 skeleton (mesmo padrao da 14.2)
- Modificacao na page.tsx: state + captura onSuccess — impacto minimo, sem risco de regressao

### References

- [Source: _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md#Story 14.3]
- [Source: src/types/tracking.ts#L264-L274] — DailyAnalyticsEntry type
- [Source: src/types/tracking.ts#L209-L215] — SyncResult com dailyAnalytics
- [Source: src/components/tracking/AnalyticsDashboard.tsx] — Dashboard atual (ponto de integracao)
- [Source: src/components/tracking/CampaignProgress.tsx] — Componente 14.2 (padrao a seguir)
- [Source: src/components/tracking/OpportunityPanel.tsx] — Padrao colapsavel manual
- [Source: src/hooks/use-campaign-analytics.ts#L69-L78] — useSyncAnalytics (retorna SyncResult)
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx] — Pagina de analytics (captura dailyAnalytics)
- [Source: src/app/api/campaigns/[campaignId]/analytics/sync/route.ts] — API route que retorna dailyAnalytics
- [Source: src/lib/services/tracking.ts#L187-L206] — TrackingService.getDailyAnalytics()
- [Source: src/lib/services/tracking.ts#L212-L229] — TrackingService.syncAnalytics()
- [Source: src/app/globals.css] — CSS variables --chart-1 a --chart-5 (grayscale B&W)
- [Source: __tests__/helpers/mock-data.ts] — Mock factories existentes
- [Source: _bmad-output/implementation-artifacts/14-2-barra-de-progresso-e-status-campanha.md] — Story anterior com learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Build had 3 pre-existing TS errors (insights route insightStatusValues cast, UsageServiceName missing "openai", apollo.ts missing is_monitored). Fixed inline.
- recharts Legend text not rendered in jsdom — adjusted test to verify chart container + responsive-container via data-testid instead of legend text (per Dev Notes: "NAO testar internals do SVG").

### Completion Notes List

- Task 1: Installed recharts (34 packages). Fixed 3 pre-existing TS build errors to validate build.
- Task 2: Added `useState<DailyAnalyticsEntry[]>([])` + captured `result.dailyAnalytics` in `handleSync` onSuccess + passed as prop to AnalyticsDashboard. Changed handleSync to useCallback.
- Task 3: Added `dailyAnalytics?` prop to AnalyticsDashboardProps, rendered DailyAnalyticsChart below AnalyticsCards, added chart skeleton (h-[350px]) to DashboardSkeleton.
- Task 4: Created DailyAnalyticsChart.tsx with: collapsible Card (useState(true)), LineChart with 3 series (sent/unique_opened/unique_replies), custom tooltip PT-BR (DD/MM), CSS variables for colors, empty state, ResponsiveContainer 300px. Exported from index.ts.
- Task 5: Created 8 tests for DailyAnalyticsChart (render with data, empty state x2, collapsible x3, responsive container, title/description). Updated AnalyticsDashboard tests (+1 test for DailyAnalyticsChart presence, skeleton count 8→9). Added createMockDailyAnalytics factory to mock-data.ts. All 279 files, 5068 tests passing.

### Post-Implementation Visual Refinements (User-Approved)

> **IMPORTANTE para Code Review:** As decisoes abaixo foram validadas visualmente pelo usuario com dados reais do Instantly. NAO reverter estas escolhas — sao intencionais e aprovadas.

1. **LineChart → AreaChart com gradiente fade** — Aprovado pelo usuario. O LineChart original com `dot={false}` era invisivel com dados esparsos (poucos dias com atividade). O AreaChart com fill gradient torna a evolucao visivel mesmo com gaps.

2. **Cores reais ao inves de grayscale CSS vars** — Excecao aprovada ao tema B&W do projeto. O chart usa cores distintas para legibilidade:
   - Enviados: `hsl(210 80% 60%)` (azul)
   - Aberturas: `hsl(45 90% 55%)` (amarelo/amber)
   - Respostas: `hsl(150 60% 50%)` (verde)
   - Justificativa: com 3 series sobrepostas em area chart, grayscale tornava impossivel distinguir as series. Cores sao essenciais para a funcao do componente.

3. **Gradiente com opacidade mais forte** — Top 0.6, bottom 0.1 (original era 0.4/0.05). Usuario pediu "um pouquinho mais visivel". Valor calibrado com dados reais.

4. **Legenda com bolinhas coloridas** — `iconType="circle"` + `iconSize={10}`. Antes era texto puro sem indicador visual de cor.

5. **Tooltip com dots coloridos** — Cada serie no tooltip mostra bolinha colorida + valor em negrito para identificacao rapida.

6. **`type="monotone"` + dots visiveis** — Curva suave entre pontos + dots permanentes (r:2) com activeDot maior (r:5) no hover. Original com `dot={false}` nao mostrava pontos de dados.

### Code Review Fixes (Amelia — 2026-03-23)

**Issues encontrados:** 0 High, 5 Medium, 3 Low → Todos corrigidos.

- **M1:** `Sidebar.tsx` estava staged fora do escopo → unstaged (`git reset HEAD`)
- **M2:** 3 pre-existing TS fixes documentados no Dev Agent Record (scope creep aceito — necessarios para build)
- **M3:** `CustomTooltip` e `formatDateBR` exportados + 5 novos testes (AC #4 agora coberto)
- **M4:** Teste do AnalyticsDashboard agora verifica threading de `dailyAnalytics` com dados reais (mock recharts adicionado)
- **M5:** Toggle colapsavel agora acessivel por teclado (`role="button"`, `tabIndex={0}`, `onKeyDown` para Enter/Space) + 2 testes
- **L1:** `sprint-status.yaml` adicionado ao File List
- **L2:** Gradient IDs agora unicos via `useId()` (evita colisao com multiplas instancias)
- **L3:** `formatDateBR` retorna input original se formato invalido (defensivo)

**Testes apos fixes:** 279 arquivos, 5076 testes passando (+8 novos testes).

### File List

**New Files:**
- src/components/tracking/DailyAnalyticsChart.tsx
- __tests__/unit/components/tracking/DailyAnalyticsChart.test.tsx

**Modified Files:**
- package.json (recharts dependency)
- package-lock.json (recharts + 34 transitive deps)
- src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx (dailyAnalytics state, handleSync capture, prop threading)
- src/components/tracking/AnalyticsDashboard.tsx (dailyAnalytics prop, DailyAnalyticsChart render, skeleton)
- src/components/tracking/index.ts (DailyAnalyticsChart export)
- __tests__/helpers/mock-data.ts (createMockDailyAnalytics factory, DailyAnalyticsEntry import)
- __tests__/unit/components/tracking/AnalyticsDashboard.test.tsx (DailyAnalyticsChart presence + data threading tests, recharts mock, skeleton count 8→9)
- _bmad-output/implementation-artifacts/sprint-status.yaml (story status tracking)
- src/app/api/insights/[insightId]/route.ts (pre-existing TS fix: insightStatusValues cast)
- src/types/api-usage.ts (pre-existing TS fix: added "openai" to UsageServiceName)
- src/types/apollo.ts (pre-existing TS fix: added is_monitored to transformApolloToLeadRow)
