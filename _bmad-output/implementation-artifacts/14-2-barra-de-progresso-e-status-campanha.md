# Story 14.2: Barra de Progresso e Status da Campanha

Status: done

## Story

As a usuario,
I want ver o progresso da campanha (% de leads contatados) e o status atual (ativa/pausada/completa),
so that eu saiba rapidamente em que ponto a campanha esta sem precisar ir ao Instantly.

## Acceptance Criteria

1. Componente `CampaignProgress` exibido acima dos `AnalyticsCards` (entre o header com `SyncIndicator` e o grid de cards, dentro do `AnalyticsDashboard`)
2. Barra de progresso visual mostrando `contactedCount / leadsCount` com porcentagem
3. Label descritivo: "X de Y leads contatados — Z%"
4. Badge de status da campanha (ex: "Ativa", "Pausada", "Completa", "Rascunho") com cores distintas
5. Se `leadsCount` for 0 ou indefinido, mostrar estado vazio gracioso (ex: "Aguardando dados...")
6. Componente responsivo — funciona bem em telas menores
7. Testes unitarios para o componente com diferentes cenarios (0%, 50%, 100%, sem dados)

## Tasks / Subtasks

- [x] Task 1: Criar componente `CampaignProgress` (AC: #1, #2, #3, #4, #5, #6)
  - [x] 1.1 Criar `src/components/tracking/CampaignProgress.tsx`
  - [x] 1.2 Implementar barra de progresso com `Progress` (shadcn/ui) mostrando `contactedCount / leadsCount`
  - [x] 1.3 Implementar label "X de Y leads contatados — Z%"
  - [x] 1.4 Implementar badge de status com mapeamento `campaignStatus` (number) para label PT-BR + variantes visuais
  - [x] 1.5 Implementar estado vazio quando `leadsCount` for 0 ou `undefined`
  - [x] 1.6 Garantir layout responsivo (flex-wrap em telas menores)

- [x] Task 2: Integrar `CampaignProgress` no `AnalyticsDashboard` (AC: #1)
  - [x] 2.1 Adicionar prop `analytics` ao `AnalyticsDashboard` (ja recebe — verificar se os novos campos estao acessiveis)
  - [x] 2.2 Renderizar `CampaignProgress` entre o header (titulo + SyncIndicator) e o `AnalyticsCards`
  - [x] 2.3 Incluir no `DashboardSkeleton` um skeleton para a barra de progresso

- [x] Task 3: Atualizar `EMPTY_ANALYTICS` na page (AC: #5)
  - [x] 3.1 Em `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx`, adicionar campos opcionais ao `EMPTY_ANALYTICS` se necessario (campos opcionais — `undefined` por default, nenhuma alteracao necessaria)

- [x] Task 4: Testes unitarios (AC: #7)
  - [x] 4.1 Criar `__tests__/unit/components/tracking/CampaignProgress.test.tsx`
  - [x] 4.2 Testar renderizacao com dados completos (50% progresso)
  - [x] 4.3 Testar renderizacao com 0% (0 contatados de N leads)
  - [x] 4.4 Testar renderizacao com 100% (todos contatados)
  - [x] 4.5 Testar estado vazio (leadsCount = 0)
  - [x] 4.6 Testar estado vazio (leadsCount = undefined)
  - [x] 4.7 Testar badge de status para cada valor (0=Rascunho, 1=Ativa, 2=Pausada, 3=Completa)
  - [x] 4.8 Testar badge com campaignStatus undefined
  - [x] 4.9 Atualizar testes do `AnalyticsDashboard` para verificar presenca do `CampaignProgress`
  - [x] 4.10 Rodar `npx vitest run` e confirmar que TODOS os testes passam

## Dev Notes

### Contexto de Negocio

Esta story adiciona feedback visual de progresso ao dashboard de analytics. O usuario quer saber rapidamente: "quantos leads ja foram contatados?" e "a campanha esta ativa?". Os dados ja existem no `CampaignAnalytics` (expandidos na Story 14.1) — esta story e puramente UI.

### Arquitetura e Padroes Obrigatorios

- **Component file:** `src/components/tracking/CampaignProgress.tsx` — novo componente, "use client"
- **Componentes reutilizaveis:** `Progress` de `@/components/ui/progress` (Radix-based, ja instalado), `Badge` de `@/components/ui/badge`
- **Tailwind CSS v4:** Usar `flex flex-col gap-*` (NUNCA `space-y-*` — nao funciona com Radix UI neste projeto)
- **Tema B&W:** O projeto segue tema grayscale (Epic 8). Usar `bg-primary`, `text-muted-foreground`, `bg-secondary`, variantes do Badge (`default`, `secondary`, `outline`, `destructive`)
- **UI em portugues brasileiro:** Todos os textos visiveis devem ser em PT-BR
- **Icons:** lucide-react (ja no projeto) — usar se necessario para decorar o status badge
- **data-testid:** Obrigatorio em todos os elementos testaveis (padrao do projeto)

### Mapeamento de `campaignStatus` (number -> label PT-BR)

A API Instantly retorna `campaign_status` como number. O mapeamento para labels deve ser feito na UI (decisao documentada na Story 14.1):

| Valor | Label PT-BR | Badge Variant |
|-------|-------------|---------------|
| `0` | Rascunho | `secondary` |
| `1` | Ativa | `default` |
| `2` | Pausada | `outline` |
| `3` | Completa | `secondary` (ou custom com bg distinto) |
| `undefined` | — (nao exibir badge) | — |

### Integracao no AnalyticsDashboard

**Arquivo:** `src/components/tracking/AnalyticsDashboard.tsx`

O `AnalyticsDashboard` ja recebe `analytics: CampaignAnalytics` como prop. Os campos `leadsCount`, `contactedCount`, `campaignStatus` sao opcionais no tipo — acessiveis via `analytics.leadsCount`, etc.

**Posicao do CampaignProgress no JSX (entre header e cards):**

```tsx
{/* Header: titulo + sync */}
<div className="flex items-center justify-between">...</div>

{/* NOVO: Barra de progresso + status */}
<CampaignProgress analytics={analytics} />

{/* Metric cards */}
<AnalyticsCards analytics={analytics} />
```

**Skeleton:** Adicionar um `Skeleton` no `DashboardSkeleton` entre o header skeleton e o cards skeleton (ex: `<Skeleton className="h-12 rounded-lg" />`).

### Props do CampaignProgress

```typescript
interface CampaignProgressProps {
  analytics: CampaignAnalytics;
}
```

O componente extrai `leadsCount`, `contactedCount`, `campaignStatus` de `analytics`. Nao precisa de props adicionais — tudo vem do CampaignAnalytics.

### Calculo da Porcentagem

```typescript
const percentage = leadsCount && leadsCount > 0
  ? Math.round((contactedCount ?? 0) / leadsCount * 100)
  : 0;
```

- Usar `Math.round` para porcentagem inteira (sem decimais)
- Proteger contra divisao por zero

### Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/components/tracking/CampaignProgress.tsx` | Novo componente |
| `__tests__/unit/components/tracking/CampaignProgress.test.tsx` | Testes do componente |

### Arquivos a Modificar

| Arquivo | Modificacao |
|---------|-------------|
| `src/components/tracking/AnalyticsDashboard.tsx` | Importar e renderizar `CampaignProgress`, atualizar `DashboardSkeleton` |

### Arquivos que NAO devem ser tocados

- `src/types/tracking.ts` — tipos ja expandidos na Story 14.1
- `src/lib/services/tracking.ts` — servico ja retorna os campos necessarios
- `src/hooks/use-campaign-analytics.ts` — hook ja retorna `CampaignAnalytics` com novos campos
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — nao precisa alterar; `EMPTY_ANALYTICS` nao precisa dos campos opcionais (sao `undefined` por default)

### Armadilhas e Guardrails

1. **NAO usar `space-y-*`** — Tailwind v4 + Radix nao funciona. Usar `flex flex-col gap-*`.
2. **NAO adicionar valores default para `campaignStatus`** — se `undefined`, nao exibir badge (o dado simplesmente nao foi sincronizado ainda).
3. **NAO alterar tipos ou servicos** — esta story e puramente UI.
4. **NAO criar hook novo** — `useCampaignAnalytics` ja fornece os dados.
5. **`Progress` value aceita 0-100** — o componente shadcn/ui `Progress` usa `value` como porcentagem (0-100), nao fracao.
6. **Proteger contra `contactedCount > leadsCount`** — clamp porcentagem em 100% max.
7. **ESLint no-console** — Nao usar `console.log` no codigo de producao.
8. **Campos opcionais** — `leadsCount`, `contactedCount`, `campaignStatus` sao `number | undefined`. Verificar existencia antes de usar.

### Padroes de Teste Existentes

- **Framework:** vitest + @testing-library/react + @testing-library/user-event
- **Mock factories:** `createMockCampaignAnalytics()` em `__tests__/helpers/mock-data.ts` — ja inclui os campos novos (Story 14.1)
- **data-testid:** Todos os elementos testados usam `data-testid` para queries
- **Padrao de import:** `import { createMockCampaignAnalytics } from "../../../helpers/mock-data";`
- **Padrao de describe:** `describe("CampaignProgress (AC: #X, #Y)", () => { ... })`

### Previous Story Intelligence

**Story 14.1 (Expandir Tipos) — Learnings:**
- Campos novos em `CampaignAnalytics` sao opcionais (`?`) — `leadsCount?: number`, `contactedCount?: number`, `campaignStatus?: number`
- Mock factory `createMockCampaignAnalytics()` ja tem os novos campos com valores default
- `campaignStatus` e `number` (0-3), NAO string — conversao para label legivel e responsabilidade da UI (esta story)
- `mapToCampaignAnalytics()` mapeia `campaign_status` diretamente como number
- Code review da 14.1 removeu `?? undefined` redundantes — seguir mesmo padrao (nao adicionar fallbacks desnecessarios)

**Padroes do Projeto (Epics anteriores):**
- Componentes de tracking seguem padrao: "use client", props tipadas, data-testid obrigatorio
- Testes usam `render()` + `screen.getByTestId()` + `expect().toBeInTheDocument()`
- `AnalyticsDashboard` tem `DashboardSkeleton` separado — manter padrao ao adicionar skeleton para CampaignProgress

### Git Intelligence

Ultimo commit: `0e84ab7 feat(story-14.1): expandir tipos e mapeamento da API Instantly + code review fixes`
Branch: `epic/14-analytics-avancado-campanha`

Commit sugerido para esta story: `feat(story-14.2): barra de progresso e status da campanha + code review fixes`

### Project Structure Notes

- Novo componente segue padrao existente: `src/components/tracking/CampaignProgress.tsx`
- Novo teste segue padrao existente: `__tests__/unit/components/tracking/CampaignProgress.test.tsx`
- Sem conflitos — componente e aditivo, integracao no AnalyticsDashboard e minima (import + 1 linha JSX + 1 skeleton)

### References

- [Source: _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md#Story 14.2]
- [Source: src/types/tracking.ts#L121-L138] — CampaignAnalytics com campos novos
- [Source: src/components/tracking/AnalyticsDashboard.tsx] — Dashboard atual (ponto de integracao)
- [Source: src/components/tracking/AnalyticsCards.tsx] — Cards existentes (renderizado apos CampaignProgress)
- [Source: src/components/ui/progress.tsx] — Progress shadcn/ui (Radix-based)
- [Source: src/components/ui/badge.tsx] — Badge shadcn/ui com variantes (default, secondary, outline, destructive)
- [Source: src/hooks/use-campaign-analytics.ts] — Hook TanStack Query que retorna CampaignAnalytics
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx] — Pagina de analytics (layout order)
- [Source: _bmad-output/implementation-artifacts/14-1-expandir-tipos-e-mapeamento-api-instantly.md] — Story anterior com learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

Nenhum issue encontrado.

### Completion Notes List

- Componente `CampaignProgress` criado com barra de progresso (Progress shadcn/ui), label descritivo PT-BR, badge de status com mapeamento 0-3, estado vazio para leadsCount=0/undefined, layout responsivo com flex-wrap
- Integrado no `AnalyticsDashboard` entre header e AnalyticsCards, skeleton adicionado ao DashboardSkeleton
- `EMPTY_ANALYTICS` verificado — campos opcionais ficam undefined por default, nenhuma alteracao necessaria
- 12 testes unitarios para CampaignProgress (progresso 0%/50%/100%, clamp >100%, empty states, badges 0-3, badge undefined, badge no empty state)
- 1 teste adicionado ao AnalyticsDashboard para verificar presenca do CampaignProgress
- Contagem skeleton atualizada de 7 para 8 no teste existente
- Suite completa: 278 arquivos, 5055 testes passando, 0 falhas

### Code Review Fixes (2026-03-23)

- **Bug fix**: Estado vazio diferenciava dados nao sincronizados ("Aguardando dados...") vs campanha sem leads ("Nenhum lead na campanha") — antes mostrava "Aguardando dados..." mesmo com campaignStatus definido (ex: "Completa" + "Aguardando dados...")
- **Acessibilidade**: Adicionado `aria-label="Progresso de leads contatados"` ao Progress bar
- **Testes adicionados**: contactedCount=undefined com leadsCount valido, campaignStatus desconhecido (99), classes responsivas (flex-wrap), campanha completa sem leads
- **Testes atualizados**: empty state ajustado para nova mensagem condicional, describe header expandido para incluir AC #6

### Change Log

- 2026-03-23: Implementacao completa da Story 14.2 — componente CampaignProgress + integracao + testes
- 2026-03-23: Code review fixes — bug empty state, aria-label, 4 novos testes, testes existentes atualizados

### File List

- `src/components/tracking/CampaignProgress.tsx` (novo)
- `__tests__/unit/components/tracking/CampaignProgress.test.tsx` (novo)
- `src/components/tracking/AnalyticsDashboard.tsx` (modificado — import + render CampaignProgress + skeleton)
- `__tests__/unit/components/tracking/AnalyticsDashboard.test.tsx` (modificado — novo teste presenca + skeleton count 7→8)

### Git Discrepancy (nao pertence a esta story)

- `src/components/common/Sidebar.tsx` — modificado no git (refator hydration localStorage useState→useEffect) mas nao faz parte da story 14.2. Deve ser commitado separadamente.
