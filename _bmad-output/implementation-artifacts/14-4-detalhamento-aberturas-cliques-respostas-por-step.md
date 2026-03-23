# Story 14.4: Detalhamento de Aberturas/Cliques/Respostas por Step

Status: done

## Story

As a usuario,
I want ver em qual step (email da sequencia) cada lead abriu, clicou ou respondeu,
so that eu entenda qual mensagem esta gerando mais engajamento.

## Acceptance Criteria

1. Colunas adicionais ou indicadores na `LeadTrackingTable`: step de abertura, step de clique, step de resposta
2. Exibicao clara: "Step 1", "Step 2", etc. (com tooltip se necessario)
3. Se lead nao teve abertura/clique/resposta, mostrar "-"
4. Indicador do ultimo step executado (`last_step_id`) e quando (`last_step_timestamp_executed`)
5. Possibilidade de ordenar por step de abertura
6. `status_summary` exibido como badge visual (ex: "Completed", "Email opened", "Bounced", "Reply received")
7. Testes unitarios para renderizacao dos novos campos e ordenacao

## Tasks / Subtasks

- [x] Task 1: Adicionar colunas de step na LeadTrackingTable (AC: #1, #2, #3)
  - [x] 1.1 Adicionar coluna "Abertura" com header "Step Abertura" — renderizar `"Step N"` se `emailOpenedStep` existir, senao `"-"`
  - [x] 1.2 Adicionar coluna "Clique" com header "Step Clique" — renderizar `"Step N"` se `emailClickedStep` existir, senao `"-"`
  - [x] 1.3 Adicionar coluna "Resposta" com header "Step Resposta" — renderizar `"Step N"` se `emailRepliedStep` existir, senao `"-"`
  - [x] 1.4 Tooltip opcional nos headers explicando: "Step da sequencia em que o lead realizou a acao"

- [x] Task 2: Indicador do ultimo step executado (AC: #4)
  - [x] 2.1 Adicionar coluna "Ultimo Step" — renderizar step ID simplificado ou `"-"`
  - [x] 2.2 Exibir `lastStepTimestampExecuted` como tempo relativo usando `formatRelativeTime()` (ja importada)
  - [x] 2.3 Tooltip mostrando data completa se disponivel

- [x] Task 3: Ordenacao por step de abertura (AC: #5)
  - [x] 3.1 Adicionar `"emailOpenedStep"` ao union type `SortableColumn`
  - [x] 3.2 Adicionar case `"emailOpenedStep"` no switch `compareLead` — tratar undefined como -1 para ordenacao
  - [x] 3.3 Adicionar `data-testid="sort-emailOpenedStep"` no header clickavel

- [x] Task 4: Badge de `status_summary` (AC: #6)
  - [x] 4.1 Criar `STATUS_SUMMARY_MAP: Record<string, { label: string; variant }>` com mapeamento PT-BR
  - [x] 4.2 Adicionar coluna "Status" com `<Badge>` renderizando label mapeado
  - [x] 4.3 Fallback para valor original se status nao esta no mapa (defensivo)

- [x] Task 5: Atualizar SkeletonRows (AC: #1)
  - [x] 5.1 Adicionar `<TableCell><Skeleton /></TableCell>` para cada nova coluna no SkeletonRows
  - [x] 5.2 Atualizar contagem de celulas nos testes de skeleton se necessario

- [x] Task 6: Testes unitarios (AC: #7)
  - [x] 6.1 Testes de renderizacao: colunas de step exibem "Step N" quando campo presente
  - [x] 6.2 Testes de fallback: colunas exibem "-" quando campo undefined
  - [x] 6.3 Testes de ordenacao: sort por emailOpenedStep (desc, asc, reset)
  - [x] 6.4 Testes de status_summary: badge exibido com label PT-BR correto
  - [x] 6.5 Testes de status_summary: fallback para valor original quando nao mapeado
  - [x] 6.6 Testes de ultimo step: exibicao do timestamp relativo
  - [x] 6.7 Testes de skeleton: contagem correta de celulas por row
  - [x] 6.8 Rodar `npx vitest run` e confirmar que TODOS os testes passam

## Dev Notes

### Contexto de Negocio

O usuario quer entender **qual email da sequencia** esta gerando engajamento. Se a campanha tem 5 steps (emails), saber que a maioria das aberturas aconteceu no Step 1 (vs Step 3) ajuda a otimizar a sequencia. O `status_summary` complementa mostrando o estado geral de cada lead na campanha (abriu, respondeu, bounced, etc.).

### Dados Ja Disponiveis (Story 14.1 — DONE)

Todos os campos necessarios ja existem no tipo `LeadTracking` e ja sao mapeados pela `mapToLeadTracking()`. **NAO e necessario alterar tipos nem servicos.**

Campos relevantes (todos opcionais `?`):
- `emailOpenedStep?: number` — step em que o lead abriu
- `emailOpenedVariant?: number` — variante do step (A/B test)
- `emailClickedStep?: number` — step em que o lead clicou
- `emailClickedVariant?: number`
- `emailRepliedStep?: number` — step em que o lead respondeu
- `emailRepliedVariant?: number`
- `lastStepId?: string` — ID do ultimo step executado
- `lastStepFrom?: string` — email remetente do ultimo step
- `lastStepTimestampExecuted?: string` — timestamp ISO do ultimo step
- `statusSummary?: string` — status geral do lead na campanha

### Componente Alvo: LeadTrackingTable

**Arquivo:** `src/components/tracking/LeadTrackingTable.tsx`

**Colunas atuais (7):**

| Header | Key | Renderizacao |
|--------|-----|-------------|
| Email | `leadEmail` | `lead.leadEmail` |
| Nome | `firstName` | `formatName(lead)` |
| Aberturas | `openCount` | count + badge "Alto Interesse" |
| Cliques | `clickCount` | `lead.clickCount` |
| Respondeu | `hasReplied` | "Sim" / "Nao" |
| Ultimo Open | `lastOpenAt` | `formatRelativeTime()` ou "-" |
| WA | — | Icone MessageCircle |

**Colunas a adicionar (5):**

| Header | Key | Renderizacao |
|--------|-----|-------------|
| Step Abertura | `emailOpenedStep` | "Step N" ou "-" (sortable) |
| Step Clique | `emailClickedStep` | "Step N" ou "-" |
| Step Resposta | `emailRepliedStep` | "Step N" ou "-" |
| Ultimo Step | — | "Step N · ha X min" ou "-" |
| Status | `statusSummary` | Badge PT-BR |

**NOTA IMPORTANTE — Tabela Larga:** Com 12 colunas, a tabela pode ficar larga. O componente atual usa `Table` (que renderiza `<table>` HTML padrao) SEM scroll horizontal. Avaliar se necessario adicionar `overflow-x-auto` no container. Manter tabela funcional — nao complicar com toggles de colunas a menos que o resultado fique ilegivel.

### Tipo SortableColumn (Linha 52)

Atual:
```typescript
type SortableColumn = "leadEmail" | "firstName" | "openCount" | "clickCount" | "hasReplied" | "lastOpenAt";
```

Adicionar:
```typescript
type SortableColumn = "leadEmail" | "firstName" | "openCount" | "clickCount" | "hasReplied" | "lastOpenAt" | "emailOpenedStep";
```

### Switch compareLead (Linha 83)

Adicionar case:
```typescript
case "emailOpenedStep": {
  const aVal = a.emailOpenedStep ?? -1;
  const bVal = b.emailOpenedStep ?? -1;
  return aVal - bVal;
}
```

### STATUS_SUMMARY_MAP (Padrao CampaignProgress)

Seguir exatamente o padrao de `CampaignProgress.tsx` (linhas 7-15):

```typescript
const STATUS_SUMMARY_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  "Email opened": { label: "Aberto", variant: "default" },
  "Reply received": { label: "Respondeu", variant: "default" },
  "Completed": { label: "Completo", variant: "secondary" },
  "Bounced": { label: "Bounce", variant: "destructive" },
  "Unsubscribed": { label: "Descadastrou", variant: "destructive" },
};
```

Renderizacao:
```tsx
const statusInfo = STATUS_SUMMARY_MAP[lead.statusSummary ?? ""];
<Badge
  data-testid="status-summary-badge"
  variant={statusInfo?.variant ?? "outline"}
>
  {statusInfo?.label ?? lead.statusSummary ?? "-"}
</Badge>
```

**Fallback:** Se `statusSummary` nao esta no mapa, exibir o valor original como texto do badge (variant `"outline"`). Se undefined, exibir `"-"`.

### Helper de Renderizacao de Step

```typescript
function formatStep(step: number | undefined): string {
  return step != null ? `Step ${step}` : "-";
}
```

### Ultimo Step — Renderizacao Combinada

```tsx
// Combinar step number + tempo relativo
{lead.lastStepTimestampExecuted ? (
  <Tooltip>
    <TooltipTrigger asChild>
      <span>
        {lead.lastStepId ? `Step · ` : ""}
        {formatRelativeTime(lead.lastStepTimestampExecuted)}
      </span>
    </TooltipTrigger>
    <TooltipContent>
      {new Date(lead.lastStepTimestampExecuted).toLocaleString("pt-BR")}
    </TooltipContent>
  </Tooltip>
) : "-"}
```

### SkeletonRows

**Arquivo:** `src/components/tracking/LeadTrackingTable.tsx` (linhas 196-207)

Atualmente: 7 `<TableCell>` por skeleton row. Adicionar 5 novos cells para as novas colunas = **12 cells total**.

### Imports Necessarios (Ja Existem no Arquivo)

Todos os imports abaixo ja estao presentes no `LeadTrackingTable.tsx`:
- `Badge` de `@/components/ui/badge`
- `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` de `@/components/ui/tooltip`
- `Skeleton` de `@/components/ui/skeleton`
- `formatRelativeTime` de `@/components/tracking/SyncIndicator`

**NAO precisa adicionar novos imports.**

### Arquivos a Modificar

| Arquivo | Modificacao |
|---------|-------------|
| `src/components/tracking/LeadTrackingTable.tsx` | Novas colunas, STATUS_SUMMARY_MAP, formatStep helper, SortableColumn, compareLead, SkeletonRows |
| `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` | Novos testes para colunas de step, ordenacao, badge status_summary, skeleton |

### Arquivos que NAO Devem ser Tocados

- `src/types/tracking.ts` — campos ja definidos (Story 14.1)
- `src/lib/services/tracking.ts` — `mapToLeadTracking()` ja mapeia tudo (Story 14.1)
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — LeadTrackingTable ja recebe `leads` com todos os campos
- `src/components/tracking/AnalyticsDashboard.tsx` — nao renderiza LeadTrackingTable
- `__tests__/helpers/mock-data.ts` — `createMockLeadTracking()` ja inclui `emailOpenedStep`, `emailClickedStep`, `espCode`, `esgCode`, `statusSummary` nos defaults

### Mock Factory — Estado Atual

`createMockLeadTracking()` em `__tests__/helpers/mock-data.ts` ja inclui:
```typescript
espCode: "Google",
esgCode: "Barracuda",
emailOpenedStep: 2,
emailOpenedVariant: 1,
emailClickedStep: 1,
emailClickedVariant: 0,
lastStepId: "step-uuid-001",
lastStepFrom: "vendas@empresa.com",
lastStepTimestampExecuted: "2026-02-08T14:00:00.000Z",
statusSummary: "Email opened",
```

**Campos AUSENTES dos defaults:** `emailRepliedStep`, `emailRepliedVariant`, `ltInterestStatus`. Estes virao como `undefined` a menos que override seja usado nos testes.

Para testar step de resposta:
```typescript
createMockLeadTracking({ emailRepliedStep: 1, emailRepliedVariant: 0 })
```

Para testar fallback "-":
```typescript
createMockLeadTracking({ emailOpenedStep: undefined, emailClickedStep: undefined })
```

### Padroes de Teste Existentes (LeadTrackingTable.test.tsx)

- **607 linhas**, organizado em `describe` blocks por AC
- **data-testid usados:** `lead-tracking-table`, `lead-row`, `skeleton-row`, `lead-tracking-empty`, `lead-tracking-error`, `high-interest-badge`, `whatsapp-indicator`, `sort-{columnKey}`, `pagination`, `prev-page`, `next-page`, `page-indicator`
- **Padrao de coluna:** `within(row).getByText("...")` para assertar conteudo da celula
- **Padrao de sort:** clicar `sort-{key}`, verificar ordem das rows com `getAllByTestId("lead-row")`
- **mockLeads:** array de 4 leads com valores distintos (linhas 40-77)

**Novos data-testid a adicionar:**
- `sort-emailOpenedStep` — header de sort da coluna Step Abertura
- `status-summary-badge` — badge do status_summary

### Armadilhas e Guardrails

1. **NAO usar `space-y-*`** — Tailwind v4 + Radix nao funciona. Usar `flex flex-col gap-*`.
2. **NAO alterar tipos ou servicos** — tudo ja vem pronto da Story 14.1.
3. **NAO alterar mock factory** — `createMockLeadTracking()` ja tem os campos necessarios.
4. **NAO esquecer de atualizar SkeletonRows** — cada nova coluna precisa de um `<TableCell><Skeleton /></TableCell>`.
5. **NAO hardcodar cores** — usar `variant` do `Badge` para respeitar tema dark/light.
6. **ESLint no-console** — Nao usar `console.log` no codigo de producao.
7. **Tratar undefined como -1 no sort** — leads sem step devem ir ao final (ou inicio) da ordenacao.
8. **Fallback defensivo no STATUS_SUMMARY_MAP** — a API pode retornar valores nao mapeados. Sempre ter fallback.
9. **Overflow horizontal** — com 12 colunas, verificar se a tabela renderiza corretamente. Considerar `overflow-x-auto` no wrapper `<div>` se necessario.
10. **`formatRelativeTime` ja importada** — NAO duplicar import.
11. **`mockLeads` no teste** — os 4 leads ja tem `emailOpenedStep: 2` (do factory default). Para testar "-", criar lead com override `emailOpenedStep: undefined`.
12. **Consistencia PT-BR** — todos os textos visiveis devem ser em portugues brasileiro.

### Previous Story Intelligence

**Story 14.3 (Grafico Diario) — Learnings:**
- Integracao em componente existente foi simples: imports + JSX + skeleton
- recharts mockado com `vi.mock("recharts")` — NAO relevante para esta story
- Code review: acessibilidade teclado exigida (role="button", tabIndex, onKeyDown) — headers de sort na tabela ja sao buttons, ok
- `formatRelativeTime` ja importada no LeadTrackingTable — reutilizar para `lastStepTimestampExecuted`

**Story 14.2 (Barra de Progresso) — Learnings:**
- Badge pattern: `STATUS_MAP` record + `<Badge variant={...}>` — EXATO padrao a seguir para `statusSummary`
- Code review encontrou bug em empty state condicional — prestar atencao em undefined vs null vs ""
- `DashboardSkeleton` teve skeleton count atualizado — lembrar de atualizar skeleton no LeadTrackingTable tambem

**Story 14.1 (Expandir Tipos) — Learnings:**
- Campos novos sao opcionais (`?`) — nao assumir que sempre existem
- Code review removeu `?? undefined` redundantes — nao adicionar fallbacks desnecessarios nos mapeamentos
- Mock factory `createMockLeadTracking()` foi atualizada com todos os novos campos

### Git Intelligence

Ultimo commit: `cbea4f5 feat(story-14.3): grafico de evolucao diaria + code review fixes`
Branch: `epic/14-analytics-avancado-campanha`

Commit sugerido: `feat(story-14.4): detalhamento aberturas cliques respostas por step + code review fixes`

### Project Structure Notes

- Modificacao contida em 2 arquivos existentes (componente + teste)
- Zero novos arquivos — tudo dentro do `LeadTrackingTable` existente
- Zero novos tipos ou servicos — dados ja fluem corretamente
- Impacto visual: tabela fica mais larga com 5 novas colunas
- Baixo risco de regressao: colunas adicionais nao afetam colunas existentes

### References

- [Source: _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md#Story 14.4]
- [Source: src/components/tracking/LeadTrackingTable.tsx] — Componente alvo (7 colunas atuais)
- [Source: src/components/tracking/LeadTrackingTable.tsx#L52] — SortableColumn type
- [Source: src/components/tracking/LeadTrackingTable.tsx#L83-L111] — compareLead switch
- [Source: src/components/tracking/LeadTrackingTable.tsx#L196-L207] — SkeletonRows
- [Source: src/components/tracking/LeadTrackingTable.tsx#L279-L286] — Header colunas atuais
- [Source: src/types/tracking.ts#L144-L176] — LeadTracking interface com campos 14.1
- [Source: src/types/tracking.ts#L280-L308] — InstantlyLeadEntry com campos 14.1
- [Source: src/lib/services/tracking.ts#L92-L123] — mapToLeadTracking com todos os campos
- [Source: src/components/tracking/CampaignProgress.tsx#L7-L15] — STATUS_MAP pattern (replicar)
- [Source: src/components/tracking/SyncIndicator.tsx] — formatRelativeTime (ja importada)
- [Source: __tests__/unit/components/tracking/LeadTrackingTable.test.tsx] — Testes existentes (607 linhas)
- [Source: __tests__/helpers/mock-data.ts#L312-L340] — createMockLeadTracking factory
- [Source: _bmad-output/implementation-artifacts/14-3-grafico-de-evolucao-diaria.md] — Story anterior com learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Teste antigo "exibe lastOpenAt como tempo relativo ou '-'" ajustado: `getByText("-")` → `getAllByText("-")` devido a novas colunas com "-"
- Teste "exibe badge para cada status mapeado" ajustado: `getByText("Respondeu")` conflitava com header da coluna — corrigido com `getAllByTestId("status-summary-badge")`

### CRITICAL — Runtime Fix: typeof Guards nos Campos da API Instantly

**Problema encontrado em runtime:** A API Instantly retorna certos campos (ex: `status_summary`) como **objetos aninhados** em vez de strings simples em alguns cenários. O tipo `InstantlyLeadEntry` (Story 14.1) define `status_summary?: string`, mas a API real pode retornar `{ lastStep: "..." }`. Isso causava erro React: "Objects are not valid as a React child (found: object with keys {lastStep})".

**Fix aplicado:** `typeof` guards em TODOS os campos novos renderizados no JSX:

1. `formatStep()` — usa `typeof step === "number"` em vez de `step != null`
2. Ultimo Step — `typeof lead.lastStepTimestampExecuted === "string"` e `typeof lead.lastStepId === "string"`
3. Status badge — `typeof lead.statusSummary === "string"` antes de usar no lookup e no fallback

**DO NOT REMOVE estas guards no code review.** Elas previnem crash em produção com dados reais da API Instantly. Os testes unitários passam com dados limpos (mock factory), mas a API real pode retornar tipos inesperados. Se um campo não é do tipo esperado, o componente exibe `"-"` graciosamente em vez de crashar.

### Completion Notes List

- Task 1: 3 colunas de step (Abertura, Clique, Resposta) com `formatStep()` helper. Tooltips nos headers Step Clique e Step Resposta.
- Task 2: Coluna "Ultimo Step" com tempo relativo via `formatRelativeTime()` + tooltip com data completa pt-BR.
- Task 3: `emailOpenedStep` adicionado ao `SortableColumn` union type e `compareLead` switch. `undefined` tratado como `-1`.
- Task 4: `STATUS_SUMMARY_MAP` com 5 status PT-BR + fallback para valor original (variant outline) + "-" se undefined.
- Task 5: SkeletonRows atualizado de 7 para 12 cells. Container com `overflow-x-auto` para tabela larga.
- Task 6: 14 novos testes adicionados (step columns, ultimo step, sort emailOpenedStep, status badge, skeleton cells). 2 testes existentes ajustados para compatibilidade.
- Suite completa: 279 files, 5090 tests passed, 0 failures.

### Code Review Fixes (2026-03-23)

- **H1**: Revertido `src/components/common/Sidebar.tsx` — mudanca SSR hydration nao-relacionada removida do escopo
- **M1**: Tooltips diferenciados — Step Clique: "Step em que o lead clicou no link", Step Resposta: "Step em que o lead respondeu ao email"
- **M2**: Nome do teste atualizado "renderiza 6 colunas" → "renderiza 12 colunas" com assercoes completas
- **M3**: IIFE do status badge extraido para `getStatusBadgeProps()` helper, chamada unica no map
- **L1**: Assercao de fallback "-" fortalecida — verifica cells[6], cells[7], cells[8] especificamente
- **L2**: 2 novos testes de tooltip: conteudo de Step Clique e Step Resposta
- **L3**: Removido prefixo "Step ·" do Ultimo Step (lastStepId e UUID sem numero extraivel)
- Suite completa: 279 files, 5092 tests passed, 0 failures

### File List

- `src/components/tracking/LeadTrackingTable.tsx` — 5 novas colunas, formatStep, STATUS_SUMMARY_MAP, getStatusBadgeProps, compareLead emailOpenedStep, SkeletonRows 12 cells, overflow-x-auto
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — 16 novos testes (Story 14.4 + code review), 2 testes existentes ajustados
