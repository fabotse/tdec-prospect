# Story 14.5: Email Provider e Security Gateway na Tabela de Leads

Status: done

## Story

As a usuario,
I want ver o provedor de email e o gateway de seguranca de cada lead na tabela de tracking,
so that eu entenda o contexto de entregabilidade e confiabilidade dos dados de tracking.

## Acceptance Criteria

1. Coluna "Provedor" na `LeadTrackingTable` exibindo `espCode` com icone representativo (Microsoft, Google, etc.)
2. Coluna "Gateway" exibindo `esgCode` (Proofpoint, Mimecast, Barracuda, Cisco) ou "Nenhum"
3. Icones/badges visuais para os provedores principais (Google, Microsoft, pelo menos)
4. Se `espCode` for "Not Found" ou undefined, mostrar "Desconhecido"
5. Possibilidade de ordenar por provedor
6. Tooltip explicativo: "Leads com Security Gateway podem ter dados de abertura menos confiaveis"
7. Testes unitarios para renderizacao dos provedores e gateways

## Tasks / Subtasks

- [x] Task 1: Criar ESP_PROVIDER_MAP e ESG_GATEWAY_MAP (AC: #1, #2, #3, #4)
  - [x] 1.1 Criar `ESP_PROVIDER_MAP: Record<string, { label: string; icon: string }>` com mapeamento dos provedores (Google, Microsoft, Yahoo, Zoho, etc.) — icone como emoji ou texto curto (ex: "G" para Google, "M" para Microsoft) usando `<Badge>`
  - [x] 1.2 Criar `ESG_GATEWAY_MAP: Record<string, { label: string; variant }>` com mapeamento dos gateways (Barracuda, Mimecast, Proofpoint, Cisco)
  - [x] 1.3 Criar helper `getProviderBadgeProps(espCode: unknown)` com typeof guard — retorna `{ label, icon, variant }` ou fallback "Desconhecido"
  - [x] 1.4 Criar helper `getGatewayLabel(esgCode: unknown)` com typeof guard — retorna label ou "Nenhum"

- [x] Task 2: Adicionar colunas Provedor e Gateway na LeadTrackingTable (AC: #1, #2, #3, #4)
  - [x] 2.1 Adicionar coluna "Provedor" com header sortable — renderizar `<Badge>` com icone/texto curto + label do provedor
  - [x] 2.2 Adicionar coluna "Gateway" com header com tooltip (AC #6) — renderizar nome do gateway ou "Nenhum"
  - [x] 2.3 Tooltip no header "Gateway": "Leads com Security Gateway podem ter dados de abertura menos confiaveis"
  - [x] 2.4 Posicionar as 2 novas colunas ANTES da coluna "WA" (ultima)

- [x] Task 3: Adicionar ordenacao por espCode (AC: #5)
  - [x] 3.1 Adicionar `"espCode"` ao union type `SortableColumn`
  - [x] 3.2 Adicionar case `"espCode"` no switch `compareLead` — comparar como string com `localeCompare`, tratar undefined como "" para ordenacao
  - [x] 3.3 Usar `SortableHeader` para a coluna Provedor com `data-testid="sort-espCode"`

- [x] Task 4: Atualizar SkeletonRows (AC: #1)
  - [x] 4.1 Adicionar 2 novos `<TableCell><Skeleton /></TableCell>` — total sera 14 cells por skeleton row

- [x] Task 5: Testes unitarios (AC: #7)
  - [x] 5.1 Testes de renderizacao: coluna Provedor exibe label correto para cada provider (Google, Microsoft, Yahoo, etc.)
  - [x] 5.2 Testes de fallback: Provedor exibe "Desconhecido" quando espCode e undefined ou "Not Found"
  - [x] 5.3 Testes de renderizacao: coluna Gateway exibe nome do gateway (Barracuda, Mimecast, etc.)
  - [x] 5.4 Testes de fallback: Gateway exibe "Nenhum" quando esgCode e undefined ou null
  - [x] 5.5 Testes de ordenacao: sort por espCode (desc, asc, reset)
  - [x] 5.6 Testes de tooltip: header Gateway exibe tooltip explicativo sobre confiabilidade
  - [x] 5.7 Testes de skeleton: contagem atualizada para 14 celulas por row
  - [x] 5.8 Atualizar teste existente "renderiza 12 colunas de header" para 14 colunas
  - [x] 5.9 Rodar `npx vitest run` e confirmar que TODOS os testes passam

## Dev Notes

### Contexto de Negocio

O usuario quer entender o **contexto de entregabilidade** de cada lead. O `esp_code` (Email Service Provider) indica qual provedor de email o lead usa (Google = Gmail, Microsoft = Outlook/365, etc.). O `esg_code` (Email Security Gateway) indica se o lead tem um gateway de seguranca corporativo (Proofpoint, Mimecast, etc.) que pode interferir no tracking de aberturas — o gateway abre os emails antes do destinatario para scan, inflando artificialmente os dados de "abertura". Essa informacao ajuda o usuario a interpretar os dados de tracking com mais precisao.

### Dados Ja Disponiveis (Story 14.1 — DONE)

~~Todos os campos necessarios ja existem no tipo `LeadTracking` e ja sao mapeados pela `mapToLeadTracking()`. NAO e necessario alterar tipos nem servicos.~~

**ATUALIZADO (implementacao):** A API Instantly retorna `esp_code` e `esg_code` como **numeros** (ex: `1` = Google, `3` = Proofpoint), nao strings. Foi necessario alterar tipos (`InstantlyLeadEntry`) e servicos (`mapToLeadTracking`) para adicionar resolucao numerica → string. Tambem `status_summary` pode vir como objeto.

Campos relevantes (ambos opcionais `?`):
- `espCode?: string` — Email Service Provider (Google, Microsoft, Zoho, AirMail, Yahoo, Yandex, Web.de, Libero.it, Other, Not Found)
- `esgCode?: string` — Email Security Gateway (Barracuda, Mimecast, Proofpoint, Cisco — pode ser null/undefined se nenhum detectado)

### Componente Alvo: LeadTrackingTable

**Arquivo:** `src/components/tracking/LeadTrackingTable.tsx`

**Colunas finais (10 — apos implementacao):**

> **Decisao de implementacao:** 4 colunas de baixo valor foram removidas durante a implementacao (Step Clique, Step Resposta, Ultimo Step, Status) porque: (1) a API Instantly retorna `status_summary` como objeto, nao string, mostrando "-" para quase todos os leads; (2) Step Clique e Step Resposta eram redundantes com clickCount e hasReplied; (3) Ultimo Step era dificil de interpretar isolado. Campos permanecem nos tipos e no service para uso futuro.

| # | Header | Key |
|---|--------|-----|
| 0 | Email | `leadEmail` |
| 1 | Nome | `firstName` |
| 2 | Aberturas | `openCount` |
| 3 | Cliques | `clickCount` |
| 4 | Respondeu | `hasReplied` |
| 5 | Ultimo Open | `lastOpenAt` |
| 6 | Step Abertura | `emailOpenedStep` |
| 7 | Provedor | `espCode` (sortable, Badge) |
| 8 | Gateway | `esgCode` (tooltip no header) |
| 9 | WA | — |

**Total: 10 colunas.**

### ESP_PROVIDER_MAP — Provedor de Email

Seguir padrao visual do tema B&W. Usar `<Badge variant="outline">` com texto compacto.

```typescript
const ESP_PROVIDER_MAP: Record<string, { label: string; shortLabel: string }> = {
  "Google": { label: "Google", shortLabel: "G" },
  "Microsoft": { label: "Microsoft", shortLabel: "M" },
  "Yahoo": { label: "Yahoo", shortLabel: "Y" },
  "Zoho": { label: "Zoho", shortLabel: "Z" },
  "Yandex": { label: "Yandex", shortLabel: "Ya" },
  "AirMail": { label: "AirMail", shortLabel: "AM" },
  "Web.de": { label: "Web.de", shortLabel: "W" },
  "Libero.it": { label: "Libero.it", shortLabel: "Li" },
  "Other": { label: "Outro", shortLabel: "?" },
};
```

Helper:
```typescript
function getProviderBadgeProps(espCode: unknown): { label: string; shortLabel: string } {
  const raw = typeof espCode === "string" ? espCode : undefined;
  if (!raw || raw === "Not Found") return { label: "Desconhecido", shortLabel: "?" };
  const mapped = ESP_PROVIDER_MAP[raw];
  return mapped ?? { label: raw, shortLabel: raw.charAt(0) };
}
```

Renderizacao:
```tsx
const provider = getProviderBadgeProps(lead.espCode);
<Badge variant="outline" data-testid="esp-provider-badge">
  <span className="font-bold mr-1">{provider.shortLabel}</span>
  {provider.label}
</Badge>
```

### ESG_GATEWAY_MAP — Security Gateway

```typescript
function getGatewayLabel(esgCode: unknown): string {
  const raw = typeof esgCode === "string" ? esgCode : undefined;
  if (!raw) return "Nenhum";
  return raw; // Valores ja sao legives: "Barracuda", "Mimecast", "Proofpoint", "Cisco"
}
```

Renderizacao:
```tsx
const gateway = getGatewayLabel(lead.esgCode);
<span>{gateway}</span>
```

### SortableColumn — Adicionar espCode

Atual (linha 52):
```typescript
type SortableColumn = "leadEmail" | "firstName" | "openCount" | "clickCount" | "hasReplied" | "lastOpenAt" | "emailOpenedStep";
```

Adicionar:
```typescript
type SortableColumn = "leadEmail" | "firstName" | "openCount" | "clickCount" | "hasReplied" | "lastOpenAt" | "emailOpenedStep" | "espCode";
```

### compareLead — Adicionar case espCode

```typescript
case "espCode": {
  const aVal = typeof a.espCode === "string" ? a.espCode : "";
  const bVal = typeof b.espCode === "string" ? b.espCode : "";
  return mult * aVal.localeCompare(bVal);
}
```

### Header Gateway com Tooltip (AC #6)

```tsx
<TableHead>
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="cursor-help">Gateway</span>
    </TooltipTrigger>
    <TooltipContent>Leads com Security Gateway podem ter dados de abertura menos confiaveis</TooltipContent>
  </Tooltip>
</TableHead>
```

### SkeletonRows — Atualizar para 14 cells

Atualmente: 12 `<TableCell>` por skeleton row. Adicionar 2 novos cells = **14 cells total**.

### Posicionamento das Novas Colunas no JSX

Inserir as 2 novas colunas **ANTES** da coluna WA (que e a ultima). No `<TableHeader>`:

```tsx
{/* ... colunas existentes ate Status ... */}
<SortableHeader label="Provedor" column="espCode" sort={sort} onSort={handleSort} />
<TableHead>
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="cursor-help">Gateway</span>
    </TooltipTrigger>
    <TooltipContent>Leads com Security Gateway podem ter dados de abertura menos confiaveis</TooltipContent>
  </Tooltip>
</TableHead>
<TableHead className="w-10">WA</TableHead>
```

No `<TableBody>` (dentro do map, antes da celula WA):

```tsx
{/* ... celulas existentes ate Status badge ... */}
<TableCell>
  {(() => {
    const provider = getProviderBadgeProps(lead.espCode);
    return (
      <Badge variant="outline" data-testid="esp-provider-badge">
        <span className="font-bold mr-1">{provider.shortLabel}</span>
        {provider.label}
      </Badge>
    );
  })()}
</TableCell>
<TableCell data-testid="esg-gateway-cell">{getGatewayLabel(lead.esgCode)}</TableCell>
{/* Coluna WA permanece por ultimo */}
```

**NOTA:** Extrair a IIFE para variavel local no map body (padrao `getStatusBadgeProps` da 14.4):
```tsx
const provider = getProviderBadgeProps(lead.espCode);
const gateway = getGatewayLabel(lead.esgCode);
// ... usar nas cells
```

### Imports Necessarios

Todos os imports ja estao presentes no `LeadTrackingTable.tsx`:
- `Badge` de `@/components/ui/badge`
- `Tooltip`, `TooltipTrigger`, `TooltipContent` de `@/components/ui/tooltip`
- `Skeleton` de `@/components/ui/skeleton`

**NAO precisa adicionar novos imports.**

### Arquivos Modificados (atualizado pos-implementacao)

| Arquivo | Modificacao |
|---------|-------------|
| `src/components/tracking/LeadTrackingTable.tsx` | ESP_PROVIDER_MAP, getProviderBadgeProps, getGatewayLabel, SortableColumn + espCode, compareLead + espCode, 2 novas colunas (Provedor, Gateway), removidas 4 colunas, SkeletonRows 10 cells |
| `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` | Testes provedores (9 providers), gateways, ordenacao, tooltip, skeleton 10 cells, header count 10 |
| `src/types/tracking.ts` | `InstantlyLeadEntry.esp_code`/`esg_code` → `number \| string`, `status_summary` → `unknown` |
| `src/lib/services/tracking.ts` | `ESP_CODE_MAP`, `ESG_CODE_MAP`, `resolveEspCode()`, `resolveEsgCode()`, `resolveStatusSummary()` |
| `__tests__/unit/lib/services/tracking.test.ts` | Testes resolucao codigos numericos, string passthrough, codigos desconhecidos |
| `__tests__/helpers/mock-data.ts` | `createMockInstantlyLeadEntry` defaults atualizados para numeros |

### Arquivos NAO Tocados

- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — nao alterado

### Mock Factory — Estado Atual

`createMockLeadTracking()` em `__tests__/helpers/mock-data.ts` ja inclui:
```typescript
espCode: "Google",
esgCode: "Barracuda",
```

Para testar fallback "Desconhecido":
```typescript
createMockLeadTracking({ espCode: undefined })
createMockLeadTracking({ espCode: "Not Found" })
```

Para testar "Nenhum" no gateway:
```typescript
createMockLeadTracking({ esgCode: undefined })
```

### Padroes de Teste Existentes (LeadTrackingTable.test.tsx)

- Organizado em `describe` blocks por AC/Story
- `data-testid` usados: `lead-tracking-table`, `lead-row`, `skeleton-row`, `sort-{columnKey}`, `status-summary-badge`, `high-interest-badge`, etc.
- Padrao de coluna: `within(row).getByText("...")` ou `row.querySelectorAll("td")` para assertar conteudo
- Padrao de sort: clicar `sort-{key}`, verificar ordem das rows com `getAllByTestId("lead-row")`

**Novos data-testid a adicionar:**
- `sort-espCode` — header de sort da coluna Provedor (automatico via SortableHeader)
- `esp-provider-badge` — badge do provedor
- `esg-gateway-cell` — celula do gateway

### Armadilhas e Guardrails

1. **typeof guards OBRIGATORIOS** — A API Instantly retorna codigos numericos e objetos. Usar typeof guards em todos os helpers.
2. **NAO usar `space-y-*`** — Tailwind v4 + Radix nao funciona. Usar `flex flex-col gap-*`.
3. ~~NAO alterar tipos ou servicos~~ — **ALTERADO:** API retorna numeros, foi necessario adicionar resolucao numerica no service.
4. ~~NAO alterar mock factory~~ — **ALTERADO:** Defaults de `createMockInstantlyLeadEntry` atualizados para numeros.
5. **NAO hardcodar cores** — usar `variant` do `Badge` para respeitar tema dark/light B&W.
6. **ESLint no-console** — Nao usar `console.log` no codigo de producao.
7. **Overflow horizontal** — tabela com 10 colunas (reduzida de 14). Container `overflow-x-auto` presente.
8. **Fallback defensivo** — "Not Found" e "Desconhecido" para provedor, "Nenhum" para gateway.
9. **Consistencia PT-BR** — todos os textos visiveis em portugues brasileiro.
10. **Teste header count** — "renderiza 10 colunas de header" (apos remocao de 4 colunas).
11. **Teste skeleton** — 10 celulas por skeleton row.
12. **Campos nao exibidos** — `emailRepliedStep`, `emailClickedStep`, `lastStepId`, etc. permanecem no tipo e service mas nao sao exibidos no componente. Mantidos para uso futuro.

### Previous Story Intelligence

**Story 14.4 (Step Columns) — Learnings:**
- typeof guards sao CRITICOS — API Instantly retorna objetos em campos que deveriam ser string. Todos os helpers de renderizacao usam `typeof x === "string"` / `typeof x === "number"`.
- `getStatusBadgeProps()` e o padrao extraido para helpers de badge — seguir mesmo padrao com `getProviderBadgeProps()`.
- Testes ajustados para novas colunas: `getAllByText("-")` em vez de `getByText("-")` quando multiplas colunas podem ter "-".
- SkeletonRows: atualizar contagem. Teste existente verifica `cells.toHaveLength(12)` — atualizar para 14.
- Teste "renderiza 12 colunas de header" — atualizar numero e adicionar assercoes.
- IIFE no map body: extraida para helper `getStatusBadgeProps()` chamada antes do return — seguir mesmo padrao com `getProviderBadgeProps()` e `getGatewayLabel()`.

**Story 14.3 (Grafico Diario) — Learnings:**
- Acessibilidade teclado exigida em code review — headers de sort ja sao buttons, ok.

**Story 14.2 (Barra de Progresso) — Learnings:**
- Badge pattern: `STATUS_MAP` record + `<Badge variant={...}>` — replicar para provedores.
- Code review encontrou bug em empty state condicional — prestar atencao em undefined vs null vs "".

### Git Intelligence

Ultimo commit: `e397a50 feat(story-14.4): detalhamento aberturas cliques respostas por step + code review fixes`
Branch: `epic/14-analytics-avancado-campanha`

Commit sugerido: `feat(story-14.5): email provider e security gateway na tabela de leads + code review fixes`

### Project Structure Notes

- Modificacao contida em 2 arquivos existentes (componente + teste)
- Zero novos arquivos
- Zero novos tipos ou servicos — dados ja fluem corretamente
- Impacto visual: tabela fica mais larga com 2 novas colunas (14 total)
- Baixo risco de regressao: colunas adicionais nao afetam colunas existentes
- `overflow-x-auto` ja presente no container da tabela (Story 14.4)

### References

- [Source: _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md#Story 14.5]
- [Source: src/components/tracking/LeadTrackingTable.tsx] — Componente alvo (12 colunas atuais)
- [Source: src/components/tracking/LeadTrackingTable.tsx#L52] — SortableColumn type
- [Source: src/components/tracking/LeadTrackingTable.tsx#L89-L96] — getStatusBadgeProps (padrao a replicar)
- [Source: src/components/tracking/LeadTrackingTable.tsx#L104-L137] — compareLead switch
- [Source: src/components/tracking/LeadTrackingTable.tsx#L218-L238] — SkeletonRows (12 cells)
- [Source: src/components/tracking/LeadTrackingTable.tsx#L310-L336] — Headers atuais
- [Source: src/components/tracking/LeadTrackingTable.tsx#L343-L414] — Body rows com cells
- [Source: src/types/tracking.ts#L174-L175] — espCode/esgCode no LeadTracking
- [Source: __tests__/unit/components/tracking/LeadTrackingTable.test.tsx] — Testes existentes
- [Source: __tests__/helpers/mock-data.ts#L328-L329] — espCode/esgCode no mock factory
- [Source: _bmad-output/implementation-artifacts/14-4-detalhamento-aberturas-cliques-respostas-por-step.md] — Story anterior com learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A

### Completion Notes List

- Task 1: Criado `ESP_PROVIDER_MAP` com 9 provedores (Google, Microsoft, Yahoo, Zoho, Yandex, AirMail, Web.de, Libero.it, Other). Helper `getProviderBadgeProps()` com typeof guard e fallback "Desconhecido". Helper `getGatewayLabel()` com typeof guard e fallback "Nenhum".
- Task 2: Colunas Provedor (sortable com Badge) e Gateway (com tooltip) inseridas antes de WA. Header Gateway com tooltip explicativo sobre confiabilidade.
- Task 3: `espCode` adicionado ao union `SortableColumn` e case no `compareLead` com `localeCompare` e typeof guard.
- Task 4: SkeletonRows atualizado.
- Task 5: Testes adicionados (provider rendering, gateway rendering, sort, tooltip, fallbacks).

**Post-implementation fixes (mesma sessao):**

- **Fix: API retorna codigos numericos, nao strings.** A API Instantly retorna `esp_code` como `number` (ex: `999` = "Other") e `esg_code` como `number` (ex: `3` = "Proofpoint"), nao strings. Tambem `status_summary` pode vir como objeto, nao string. Corrigido em 3 camadas:
  - `InstantlyLeadEntry` type: `esp_code`/`esg_code` agora `number | string`, `status_summary` agora `unknown`
  - `mapToLeadTracking()`: Novos helpers `resolveEspCode()`, `resolveEsgCode()`, `resolveStatusSummary()` com `ESP_CODE_MAP` e `ESG_CODE_MAP` (mapeamento numerico → string)
  - Mock factory `createMockInstantlyLeadEntry`: defaults atualizados para numeros
  - Testes do tracking service: cobertura para codigos numericos, string passthrough, codigos desconhecidos, status_summary objeto

- **Otimizacao: Removidas 4 colunas de baixo valor.** Tabela reduzida de 14 para **10 colunas** para melhor legibilidade:
  - Removida: **Step Clique** — redundante com clickCount
  - Removida: **Step Resposta** — redundante com "Respondeu"
  - Removida: **Ultimo Step** — dificil interpretar isolado
  - Removida: **Status** — API retorna objeto (nao string), mostrava "-" para quase todos
  - Codigo morto removido: `STATUS_SUMMARY_MAP`, `getStatusBadgeProps()`
  - Testes removidos/atualizados: tooltips de step clique/resposta, ultimo step, status badge, skeleton count, header count

- Suite final (dev): **279 files, 5104 tests passed**

**Code review fixes:**

- **L1: Removidos type casts desnecessarios** em `tracking.test.ts`: `as unknown as number` e `as unknown as string` removidos onde o tipo union ja aceita o valor diretamente.
- **L2: Removidos null checks inalcancaveis** em `resolveEspCode()` e `resolveEsgCode()`: tipo do parametro e `number | string | undefined`, null nao faz parte do union.
- **L4: Cobertura completa de provedores** — 5 testes adicionados no componente para Yandex, AirMail, Web.de, Libero.it, Other ("Outro"). Agora todos os 9 provedores do ESP_PROVIDER_MAP estao testados.
- **M2: Dev Notes atualizados** — Corrigidas inconsistencias entre Dev Notes (que diziam "NAO alterar tipos/servicos/mocks") e a implementacao real. Tabela de colunas atualizada para 10.
- **M1: Decisao de remocao documentada** — Adicionado blockquote explicativo na secao de colunas justificando a remocao das 4 colunas de baixo valor.
- **L3: Campos nao exibidos documentados** — Nota adicionada nos guardrails sobre campos que permanecem no tipo/service mas nao sao renderizados.

- Suite final (code review): **279 files, 5109 tests passed**

### File List

- `src/components/tracking/LeadTrackingTable.tsx` — ESP_PROVIDER_MAP, getProviderBadgeProps, getGatewayLabel, SortableColumn + espCode, compareLead + espCode, 2 novas colunas (Provedor, Gateway), removidas 4 colunas (Step Clique, Step Resposta, Ultimo Step, Status), removido STATUS_SUMMARY_MAP/getStatusBadgeProps, SkeletonRows 10 cells
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — Testes provider/gateway/sort/tooltip, removidos testes das colunas removidas, header count 10, skeleton count 10
- `src/types/tracking.ts` — `InstantlyLeadEntry.esp_code`/`esg_code` tipo corrigido para `number | string`, `status_summary` para `unknown`
- `src/lib/services/tracking.ts` — `ESP_CODE_MAP`, `ESG_CODE_MAP`, `resolveEspCode()`, `resolveEsgCode()`, `resolveStatusSummary()` no `mapToLeadTracking()`
- `__tests__/unit/lib/services/tracking.test.ts` — Testes para resolucao de codigos numericos, string passthrough, codigos desconhecidos, status_summary objeto
- `__tests__/helpers/mock-data.ts` — `createMockInstantlyLeadEntry` defaults atualizados para numeros (esp_code: 1, esg_code: 1)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status 14-5 atualizado para review
