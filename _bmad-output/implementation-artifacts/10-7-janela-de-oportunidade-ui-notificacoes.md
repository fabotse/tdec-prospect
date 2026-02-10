# Story 10.7: Janela de Oportunidade — UI + Notificacoes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario,
I want ver a lista de leads na Janela de Oportunidade com destaque visual e notificacoes,
so that agir rapidamente sobre leads de alto interesse.

## Acceptance Criteria

1. **Given** o `OpportunityPanel` e renderizado **When** existem leads qualificados na Janela de Oportunidade **Then** exibe lista focada dos leads quentes com: Email, Nome, Aberturas, Ultimo Open **And** visual de destaque (borda, icone ou badge) indica alto interesse **And** segue o tema B&W com cor de acento para destaque

2. **Given** o `OpportunityPanel` esta exibido **When** nao ha leads qualificados **Then** exibe estado vazio "Nenhum lead atingiu o threshold atual" **And** sugere ajustar o threshold (link para ThresholdConfig)

3. **Given** o dashboard de analytics e acessado **When** existem leads na Janela de Oportunidade **Then** exibe badge/contador no header "X leads quentes" **And** toast discreto notifica ao acessar se ha novos leads qualificados desde a ultima visita

4. **Given** a LeadTrackingTable (Story 10.5) **When** um lead esta na Janela de Oportunidade **Then** o badge "Alto Interesse" na tabela usa o threshold configurado (nao mais hardcoded) **And** o badge e clicavel e scrolla/navega ate o OpportunityPanel

5. **Given** o OpportunityPanel esta exibido **When** o usuario ve um lead quente **Then** pode ver dados de contato (email, telefone se disponivel) **And** a secao indica "(WhatsApp em breve)" se acao futura estiver preparada

6. **Given** o layout do dashboard de analytics **When** todos os componentes estao integrados **Then** a ordem vertical e: Cards de Metricas + Sync → Janela de Oportunidade (ThresholdConfig + OpportunityPanel) → LeadTrackingTable **And** o layout e responsivo e legivel em mobile

## Tasks / Subtasks

- [x] Task 1: Estender LeadTracking com campo phone (AC: #5)
  - [x] 1.1 Adicionar `phone?: string` na interface `LeadTracking` em `src/types/tracking.ts`
  - [x] 1.2 Atualizar `mapToLeadTracking()` em `src/lib/services/tracking.ts` para incluir `phone: item.phone` (campo ja existe no `InstantlyLeadEntry`)
  - [x] 1.3 Atualizar `createMockLeadTracking()` em `__tests__/helpers/mock-data.ts` para incluir `phone` opcional
- [x] Task 2: Criar componente OpportunityPanel (AC: #1, #2, #5)
  - [x] 2.1 Criar `src/components/tracking/OpportunityPanel.tsx`
  - [x] 2.2 Props: `leads: OpportunityLead[]`, `isLoading: boolean`, `config: OpportunityConfig | null`
  - [x] 2.3 Lista de leads quentes com colunas: Email, Nome, Aberturas, Ultimo Open, Telefone (se disponivel)
  - [x] 2.4 Cada lead com visual de destaque: icone `Flame` (lucide-react) + borda `border-primary/30`
  - [x] 2.5 Dados de contato: email com `mailto:` link, telefone com `tel:` link (se existir)
  - [x] 2.6 Estado vazio: icone + "Nenhum lead atingiu o threshold atual" + texto "Ajuste o threshold acima"
  - [x] 2.7 Loading state: skeleton rows
  - [x] 2.8 Texto "(WhatsApp em breve)" como Badge cinza no footer do painel
  - [x] 2.9 Card wrapper com titulo "Leads Quentes" e subtitulo com contagem
  - [x] 2.10 Usar `forwardRef` para aceitar ref de scroll (AC #4)
- [x] Task 3: Atualizar LeadTrackingTable — badge dinamico (AC: #4)
  - [x] 3.1 Adicionar prop `highInterestThreshold?: number` ao `LeadTrackingTableProps`
  - [x] 3.2 Substituir `DEFAULT_HIGH_INTEREST_THRESHOLD` pelo prop (fallback para 3)
  - [x] 3.3 Tornar badge "Alto Interesse" clicavel com `onClick` + `cursor-pointer`
  - [x] 3.4 Adicionar prop `onHighInterestClick?: () => void` para callback de scroll
  - [x] 3.5 Manter `DEFAULT_HIGH_INTEREST_THRESHOLD` exportado para backward compatibility em testes
- [x] Task 4: Adicionar badge de leads quentes no header (AC: #3)
  - [x] 4.1 No header da pagina de analytics (entre back link e AnalyticsDashboard), adicionar badge "X leads quentes" quando `opportunityLeads.length > 0`
  - [x] 4.2 Badge usa icone `Flame` + contagem + estilo `bg-primary/10 text-primary`
  - [x] 4.3 Badge nao aparece quando contagem e 0
- [x] Task 5: Toast de notificacao para novos leads qualificados (AC: #3)
  - [x] 5.1 Usar `localStorage` com chave `opportunity-seen-${campaignId}` para armazenar ultimo `opportunityLeads.length` visto
  - [x] 5.2 No `useEffect` da pagina, comparar contagem atual com armazenada
  - [x] 5.3 Se contagem atual > armazenada, disparar `toast.info("X novo(s) lead(s) na Janela de Oportunidade")`
  - [x] 5.4 Atualizar localStorage apos exibir toast
  - [x] 5.5 Nao disparar toast no primeiro acesso (localStorage vazio) — apenas salvar contagem inicial
- [x] Task 6: Integrar tudo na pagina de analytics + reordenar layout (AC: #6)
  - [x] 6.1 Importar `OpportunityPanel` e `useOpportunityLeads` na pagina
  - [x] 6.2 Computar `opportunityLeads` via `useOpportunityLeads(leads, opportunityConfig)`
  - [x] 6.3 Criar `useRef` para OpportunityPanel e passar `scrollToOpportunity` callback para LeadTrackingTable
  - [x] 6.4 Reordenar layout: AnalyticsDashboard → (badge header) → ThresholdConfig → OpportunityPanel → LeadTrackingTable
  - [x] 6.5 Passar `highInterestThreshold={opportunityConfig?.minOpens ?? DEFAULT_MIN_OPENS}` para LeadTrackingTable
  - [x] 6.6 Garantir responsividade mobile
- [x] Task 7: Atualizar barrel export (AC: N/A)
  - [x] 7.1 Adicionar `OpportunityPanel` ao `src/components/tracking/index.ts`
- [x] Task 8: Testes unitarios (AC: #1, #2, #3, #4, #5, #6)
  - [x] 8.1 `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` — 20 testes: collapsible (aberto por padrao, fecha, reabre), leads quentes, estado vazio, loading skeleton, dados de contato, telefone visivel/oculto, WhatsApp badge, link mailto/tel, contagem no subtitulo (singular/plural), icone Flame, limite 5 leads (ver todos), forwardRef
  - [x] 8.2 `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — 4 testes adicionados: badge com threshold dinamico, badge clicavel, callback onHighInterestClick, fallback para threshold default
  - [x] 8.3 `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — 6 testes adicionados: OpportunityPanel integrado, badge header com contagem, badge ausente sem leads, toast para novos leads, nao toast no primeiro acesso, threshold dinamico passado para LeadTrackingTable
  - [x] 8.4 Verificar regressao: rodar suite completa `npx vitest run` — 4051 passando, 0 falhas novas (1 falha pre-existente em ai-campaign-structure.test.tsx)

## Dev Notes

### ARQUITETURA CRITICA: OpportunityPanel e APRESENTACAO, nao LOGICA

O `OpportunityPanel` e um componente de APRESENTACAO. Toda a logica de filtragem ja esta implementada no `useOpportunityLeads` hook (Story 10.6) que chama `evaluateOpportunityWindow()`. O painel apenas RECEBE a lista de `OpportunityLead[]` e exibe.

```
Fluxo de dados:
useLeadTracking → leads[] (dados brutos do Instantly)
useOpportunityConfig → config (threshold do banco)
useOpportunityLeads(leads, config) → OpportunityLead[] (filtrados)
OpportunityPanel ← recebe OpportunityLead[] pronto
```

### Estender LeadTracking com Phone — ESCOPO MINIMO

O `InstantlyLeadEntry` (tipo da API Instantly) JA tem `phone?: string` mas o `mapToLeadTracking()` NAO mapeia esse campo. Precisamos:

1. Adicionar `phone?: string` em `LeadTracking` (src/types/tracking.ts)
2. Mapear em `mapToLeadTracking()` (src/lib/services/tracking.ts, linha ~86-101):

```typescript
// ANTES (atual):
return {
  leadEmail: item.email,
  campaignId,
  openCount: item.email_open_count ?? 0,
  clickCount: item.email_click_count ?? 0,
  hasReplied: (item.email_reply_count ?? 0) > 0,
  lastOpenAt: item.timestamp_last_open ?? null,
  events: [],
  firstName: item.first_name,
  lastName: item.last_name,
};

// DEPOIS (adicionar phone):
return {
  leadEmail: item.email,
  campaignId,
  openCount: item.email_open_count ?? 0,
  clickCount: item.email_click_count ?? 0,
  hasReplied: (item.email_reply_count ?? 0) > 0,
  lastOpenAt: item.timestamp_last_open ?? null,
  events: [],
  firstName: item.first_name,
  lastName: item.last_name,
  phone: item.phone,  // NOVO — campo ja disponivel no InstantlyLeadEntry
};
```

**IMPORTANTE**: O campo `phone` no `InstantlyLeadEntry` e `phone?: string`. Ele pode ser `undefined`. O componente deve tratar isso gracefully.

### OpportunityPanel Component — Especificacao

**Props:**
```typescript
interface OpportunityPanelProps {
  leads: OpportunityLead[];
  isLoading: boolean;
  config: OpportunityConfig | null;
}
```

**Layout:**
```
+------------------------------------------------------+
| Card: "Leads Quentes" 🔥                             |
| Subtitle: "X leads atingiram o threshold"             |
|                                                      |
| +--------------------------------------------------+ |
| | 🔥 joao@empresa.com | Joao Silva | 5 opens | Ha 2h | |
| |    📧 joao@empresa.com  📱 +5511999...           | |
| +--------------------------------------------------+ |
| | 🔥 maria@co.com | Maria Santos | 4 opens | Ha 1d  | |
| |    📧 maria@co.com                                | |
| +--------------------------------------------------+ |
|                                                      |
| Badge: "(WhatsApp em breve)" [cinza, discreto]       |
+------------------------------------------------------+
```

**Implementacao:**

```typescript
"use client";

import { forwardRef } from "react";
import { Flame, Mail, Phone } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";
import type { OpportunityLead, OpportunityConfig } from "@/types/tracking";

interface OpportunityPanelProps {
  leads: OpportunityLead[];
  isLoading: boolean;
  config: OpportunityConfig | null;
}

export const OpportunityPanel = forwardRef<HTMLDivElement, OpportunityPanelProps>(
  function OpportunityPanel({ leads, isLoading, config }, ref) {
    // ... implementacao
  }
);
```

**Estados:**
1. **Loading**: Skeleton rows (3 linhas)
2. **Vazio**: Icone + "Nenhum lead atingiu o threshold atual" + "Ajuste o threshold acima"
3. **Com leads**: Lista com destaque visual

### LeadTrackingTable — Alteracoes para Badge Dinamico

**ANTES (atual, hardcoded):**
```typescript
const DEFAULT_HIGH_INTEREST_THRESHOLD = 3;

// No JSX:
{lead.openCount >= DEFAULT_HIGH_INTEREST_THRESHOLD && (
  <Badge variant="outline" className="border-primary/50 text-primary text-[10px]">
    Alto Interesse
  </Badge>
)}
```

**DEPOIS (dinamico via prop):**
```typescript
interface LeadTrackingTableProps {
  leads: LeadTracking[];
  isLoading: boolean;
  isError?: boolean;
  highInterestThreshold?: number;       // NOVO
  onHighInterestClick?: () => void;     // NOVO — callback para scroll
}

// No JSX:
{lead.openCount >= (highInterestThreshold ?? DEFAULT_HIGH_INTEREST_THRESHOLD) && (
  <Badge
    variant="outline"
    className="border-primary/50 text-primary text-[10px] cursor-pointer hover:bg-primary/10"
    data-testid="high-interest-badge"
    onClick={(e) => {
      e.stopPropagation();
      onHighInterestClick?.();
    }}
  >
    Alto Interesse
  </Badge>
)}
```

**NOTA**: Manter `DEFAULT_HIGH_INTEREST_THRESHOLD` exportado — testes existentes referenciam esse valor. Apenas o JSX muda para usar o prop com fallback.

### Toast de Notificacao — Mecanismo

```typescript
// Na pagina de analytics, dentro de useEffect:
useEffect(() => {
  if (!opportunityLeads || opportunityLeads.length === 0) return;

  const storageKey = `opportunity-seen-${campaignId}`;
  const lastSeen = localStorage.getItem(storageKey);

  if (lastSeen === null) {
    // Primeiro acesso — apenas salvar contagem, sem toast
    localStorage.setItem(storageKey, String(opportunityLeads.length));
    return;
  }

  const previousCount = parseInt(lastSeen, 10);
  const currentCount = opportunityLeads.length;

  if (currentCount > previousCount) {
    const newLeads = currentCount - previousCount;
    toast.info(
      `${newLeads} novo(s) lead(s) na Janela de Oportunidade`,
      { duration: 5000 }
    );
  }

  localStorage.setItem(storageKey, String(currentCount));
}, [opportunityLeads, campaignId]);
```

**ATENCAO**: O `useEffect` deve ter `opportunityLeads` como dependencia. Como `useOpportunityLeads` retorna um novo array a cada re-render (via `useMemo`), o efeito so dispara quando os leads realmente mudam (referencia estavel via useMemo).

### Badge de Leads Quentes no Header

Adicionar entre o back link e o AnalyticsDashboard na pagina:

```typescript
{/* Badge de leads quentes */}
{opportunityLeads.length > 0 && (
  <div className="flex items-center gap-2" data-testid="hot-leads-badge">
    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
      <Flame className="h-3 w-3 mr-1" />
      {opportunityLeads.length} lead{opportunityLeads.length > 1 ? "s" : ""} quente{opportunityLeads.length > 1 ? "s" : ""}
    </Badge>
  </div>
)}
```

### Scroll para OpportunityPanel

```typescript
// Ref no componente pai:
const opportunityPanelRef = useRef<HTMLDivElement>(null);

const scrollToOpportunity = () => {
  opportunityPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
};

// Passando para componentes:
<OpportunityPanel ref={opportunityPanelRef} ... />
<LeadTrackingTable onHighInterestClick={scrollToOpportunity} ... />
```

### Componentes shadcn/ui Necessarios

Todos ja instalados e usados no projeto:
- **Card**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` de `@/components/ui/card`
- **Badge**: `Badge` de `@/components/ui/badge`
- **Skeleton**: `Skeleton` de `@/components/ui/skeleton`

### Icones (lucide-react)

- **Flame**: Icone de fogo para destaque de leads quentes (OpportunityPanel + badge header)
- **Mail**: Icone de email para contato no OpportunityPanel
- **Phone**: Icone de telefone para contato no OpportunityPanel
- **ArrowUpRight** (opcional): Para links clicaveis

### Layout Final da Pagina de Analytics (AC #6)

```
+------------------------------------------------------+
| ← Voltar para campanha                               |
|                                                      |
| [Badge: 3 leads quentes 🔥] (se houver)             |
|                                                      |
| +--------------------------------------------------+ |
| | AnalyticsDashboard (Cards + Sync)                 | |
| +--------------------------------------------------+ |
|                                                      |
| +--------------------------------------------------+ |
| | ThresholdConfig (config da Janela)                | |
| +--------------------------------------------------+ |
|                                                      |
| +--------------------------------------------------+ |
| | OpportunityPanel (leads quentes) 🔥               | |
| +--------------------------------------------------+ |
|                                                      |
| +--------------------------------------------------+ |
| | LeadTrackingTable (todos os leads)                | |
| +--------------------------------------------------+ |
+------------------------------------------------------+
```

**NOTA sobre "Grafico"**: O AC #6 do epic menciona "Grafico" na ordem, mas NAO existe componente de grafico implementado. O AnalyticsDashboard exibe cards de metricas, nao graficos. Manter o layout sem grafico por enquanto — pode ser adicionado em story futura.

### Padrao de Testes

```typescript
// __tests__/unit/components/tracking/OpportunityPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpportunityPanel } from "@/components/tracking/OpportunityPanel";
import { createMockOpportunityLead, createMockOpportunityConfig } from "@/helpers/mock-data";

describe("OpportunityPanel", () => {
  const defaultLeads = [
    createMockOpportunityLead({ leadEmail: "joao@test.com", firstName: "Joao", openCount: 5, phone: "+5511999" }),
    createMockOpportunityLead({ leadEmail: "maria@test.com", firstName: "Maria", openCount: 4 }),
  ];
  const defaultConfig = createMockOpportunityConfig();

  it("renderiza lista de leads quentes", () => { ... });
  it("exibe email, nome, aberturas e ultimo open de cada lead", () => { ... });
  it("exibe dados de contato: email com link mailto", () => { ... });
  it("exibe telefone com link tel quando disponivel", () => { ... });
  it("nao exibe telefone quando nao disponivel", () => { ... });
  it("exibe icone Flame para destaque visual", () => { ... });
  it("exibe contagem no subtitulo do card", () => { ... });
  it("exibe estado vazio quando nenhum lead qualificado", () => { ... });
  it("exibe texto de sugestao de ajuste no estado vazio", () => { ... });
  it("exibe skeleton durante loading", () => { ... });
  it("exibe badge WhatsApp em breve", () => { ... });
  it("aceita ref via forwardRef", () => { ... });
});
```

```typescript
// __tests__/unit/components/tracking/LeadTrackingTable.test.tsx — ADICIONAR
describe("LeadTrackingTable - dynamic threshold", () => {
  it("usa highInterestThreshold prop para badge", () => { ... });
  it("usa fallback DEFAULT_HIGH_INTEREST_THRESHOLD quando prop ausente", () => { ... });
  it("badge e clicavel e chama onHighInterestClick", () => { ... });
  it("badge tem cursor-pointer e hover style", () => { ... });
});
```

```typescript
// __tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx — ADICIONAR
describe("CampaignAnalyticsPage - Story 10.7", () => {
  it("renderiza OpportunityPanel com leads qualificados", () => { ... });
  it("exibe badge de leads quentes no header quando ha leads", () => { ... });
  it("nao exibe badge quando nao ha leads quentes", () => { ... });
  it("dispara toast quando ha novos leads qualificados", () => { ... });
  it("nao dispara toast no primeiro acesso", () => { ... });
  it("passa threshold dinamico para LeadTrackingTable", () => { ... });
});
```

### Mock Factories — Atualizacoes

```typescript
// __tests__/helpers/mock-data.ts — ATUALIZAR

// createMockLeadTracking — adicionar phone
export function createMockLeadTracking(
  overrides: Partial<LeadTracking> = {}
): LeadTracking {
  return {
    // ... campos existentes ...
    phone: undefined, // NOVO — default sem telefone
    ...overrides,
  };
}

// createMockOpportunityLead — ja herda de createMockLeadTracking, phone disponivel via overrides
```

### Mocking de localStorage nos Testes

```typescript
// Para testar toast de notificacao:
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });
```

### Mocking de useOpportunityLeads na Pagina

```typescript
// No CampaignAnalyticsPage.test.tsx:
vi.mock("@/hooks/use-opportunity-window", () => ({
  useOpportunityConfig: vi.fn(() => ({ data: mockConfig })),
  useSaveOpportunityConfig: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useOpportunityLeads: vi.fn(() => mockOpportunityLeads), // NOVO
}));
```

### Story 10.6 Learnings (Previous Story Intelligence)

- **ThresholdConfig calcula preview localmente** via `evaluateOpportunityWindow` — mesmo pattern usado no OpportunityPanel (dados ja em memoria)
- **Hook `useOpportunityLeads` retorna `OpportunityLead[]`** com `useMemo` — referencia estavel, seguro para `useEffect` dependency
- **UUID validation** adicionada em API routes no code review 10.6 — nao afeta esta story (nenhuma API route nova)
- **Timer cleanup** importante — tests de 10.6 tiveram problemas com `vi.useFakeTimers()`. Para esta story, se usar `useEffect` com localStorage, garantir cleanup
- **Auth pattern**: API route de `opportunity-config` usa query na `profiles` table para `tenant_id` — nao afeta 10.7 (nenhuma API route nova)
- **55 testes na story 10.6, 4028 total** — manter regressao zero
- **`isError` prop do LeadTrackingTable** — padrao de error handling a seguir

### Git Intelligence

Branch: `epic/10-campaign-tracking` (base: main)

Commits recentes:
- `39cbd02` feat(story-10.6): opportunity window engine + config + code review fixes
- `861914a` feat(story-10.5): lead tracking detail table + code review fixes
- `d3400ba` feat(story-10.4): campaign analytics dashboard UI + code review fixes

Arquivos que esta story CRIA (novos):
- `src/components/tracking/OpportunityPanel.tsx` — painel de leads quentes
- `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` — testes do painel

Arquivos que esta story MODIFICA (existentes):
- `src/types/tracking.ts` — adicionar `phone?: string` ao `LeadTracking`
- `src/lib/services/tracking.ts` — mapear `phone` em `mapToLeadTracking()`
- `src/components/tracking/LeadTrackingTable.tsx` — badge dinamico + props de threshold/click
- `src/components/tracking/index.ts` — adicionar export OpportunityPanel
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — integrar OpportunityPanel, badge header, toast, reordenar layout
- `__tests__/helpers/mock-data.ts` — phone em createMockLeadTracking
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — testes de threshold dinamico
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — testes de integracao 10.7

### Anti-Patterns a Evitar

1. **NAO criar logica de filtragem no OpportunityPanel** — usar `useOpportunityLeads` (ja implementado na 10.6)
2. **NAO usar `space-y-*`** — usar `flex flex-col gap-*` (Tailwind v4 + Radix)
3. **NAO usar `console.log`** — ESLint enforces no-console rule
4. **NAO chamar APIs no OpportunityPanel** — e componente de apresentacao, recebe dados via props
5. **NAO remover `DEFAULT_HIGH_INTEREST_THRESHOLD`** da LeadTrackingTable — manter para fallback e backward compatibility dos testes existentes
6. **NAO usar `sessionStorage`** para tracking de "novos leads" — usar `localStorage` para persistir entre sessions
7. **NAO adicionar libs externas** — tudo disponivel com shadcn/ui + lucide-react
8. **NAO implementar WhatsApp real** — apenas exibir "(WhatsApp em breve)" como badge cinza
9. **NAO criar novo hook** — reutilizar `useOpportunityLeads` da story 10.6
10. **NAO fazer fetch de dados no OpportunityPanel** — dados vem do `useLeadTracking` + `useOpportunityLeads` no pai
11. **NAO usar `window.scrollTo`** — usar `ref.scrollIntoView({ behavior: "smooth" })` para scroll suave
12. **NAO disparar toast no primeiro acesso** — apenas salvar contagem inicial no localStorage

### Dependencias Downstream

Esta story alimenta:
- **10.8** (Preparacao WhatsApp): Usara `OpportunityPanel` como ponto de integracao visual para futuras acoes. O badge "(WhatsApp em breve)" sera substituido por botao funcional quando 10.8 estiver pronto.

### Verificacao Critica: `formatRelativeTime` Export

A funcao `formatRelativeTime` e exportada de `src/components/tracking/SyncIndicator.tsx` e ja usada no `LeadTrackingTable`. O `OpportunityPanel` pode importa-la diretamente:

```typescript
import { formatRelativeTime } from "@/components/tracking/SyncIndicator";
```

### Verificacao Critica: `mapToLeadTracking` Input Type

A funcao `mapToLeadTracking` em `src/lib/services/tracking.ts` tem um tipo inline para o parametro `item`. Ao adicionar `phone`, verificar se o tipo inline inclui `phone?: string`. Se nao, adicionar:

```typescript
export function mapToLeadTracking(
  item: {
    email: string;
    first_name?: string;
    last_name?: string;
    email_open_count?: number;
    email_click_count?: number;
    email_reply_count?: number;
    timestamp_last_open?: string | null;
    phone?: string;  // ADICIONAR
  },
  campaignId: string
): LeadTracking {
```

### Project Structure Notes

- Componente em `src/components/tracking/` — segue padrao dos outros componentes de tracking
- Tipos em `src/types/tracking.ts` — extensao de interface existente
- Service em `src/lib/services/tracking.ts` — extensao de funcao existente
- Pagina em `src/app/(dashboard)/campaigns/[campaignId]/analytics/` — modificacao de pagina existente
- Testes em `__tests__/unit/` espelhando a estrutura de `src/`

### References

- [Source: _bmad-output/planning-artifacts/epic-10-campaign-tracking.md#Story 10.7]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-005 — IOpportunityAction (Story 10.8)]
- [Source: _bmad-output/implementation-artifacts/10-6-janela-de-oportunidade-engine-config.md — Previous story intelligence]
- [Source: src/types/tracking.ts — LeadTracking, OpportunityLead, OpportunityConfig]
- [Source: src/lib/services/tracking.ts — mapToLeadTracking, InstantlyLeadEntry (phone field)]
- [Source: src/lib/services/opportunity-engine.ts — evaluateOpportunityWindow, DEFAULT_MIN_OPENS]
- [Source: src/hooks/use-opportunity-window.ts — useOpportunityLeads, useOpportunityConfig]
- [Source: src/hooks/use-lead-tracking.ts — useLeadTracking]
- [Source: src/components/tracking/LeadTrackingTable.tsx — DEFAULT_HIGH_INTEREST_THRESHOLD, badge rendering]
- [Source: src/components/tracking/SyncIndicator.tsx — formatRelativeTime]
- [Source: src/components/tracking/ThresholdConfig.tsx — pattern de Card com config]
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx — integration point]
- [Source: __tests__/helpers/mock-data.ts — createMockLeadTracking, createMockOpportunityLead]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- OpportunityPanel.test.tsx: `getByText("joao@test.com")` falhou por email duplicado (header + contact link). Corrigido com `getAllByText`.
- CampaignAnalyticsPage.test.tsx: Mock de `@/lib/services/opportunity-engine` precisava incluir `DEFAULT_PERIOD_DAYS` (importado por ThresholdConfig). Corrigido com `importOriginal`.

### Completion Notes List

- Task 1: Adicionado `phone?: string` em `LeadTracking`, mapeamento em `mapToLeadTracking()`, e mock factory atualizada
- Task 2: OpportunityPanel criado como componente de apresentacao com forwardRef — 3 estados (loading, vazio, com leads), destaque visual Flame, dados de contato mailto/tel, badge WhatsApp placeholder
- Task 3: LeadTrackingTable badge agora dinâmico via `highInterestThreshold` prop com fallback, clicável com `onHighInterestClick` callback, `DEFAULT_HIGH_INTEREST_THRESHOLD` exportado
- Task 4: Badge "X leads quentes" no header da página com icone Flame, condicional quando `opportunityLeads.length > 0`
- Task 5: Toast via localStorage — compara contagem anterior vs atual, não dispara no primeiro acesso
- Task 6: Layout reordenado: Dashboard → Badge → ThresholdConfig → OpportunityPanel → LeadTrackingTable. Scroll via useRef + scrollIntoView. Threshold dinâmico passado para LeadTrackingTable via `DEFAULT_MIN_OPENS`
- Task 7: Barrel export atualizado em `src/components/tracking/index.ts`
- Task 8: 30 novos testes (20 OpportunityPanel + 4 LeadTrackingTable + 6 CampaignAnalyticsPage). 229 test files, 4051 tests passing, 0 novas regressoes

### Change Log

- 2026-02-10: Story 10.7 implementada — OpportunityPanel UI, badge header, toast notificação, badge dinâmico, layout integrado
- 2026-02-10: Code Review fixes — [M2] removida prop `config` não utilizada do OpportunityPanel, [M3] painel agora abre por padrão (AC #1 compliance), [M1] ThresholdConfig adicionado ao File List, contagem de testes corrigida

### File List

**Novos:**
- `src/components/tracking/OpportunityPanel.tsx` — Componente de apresentação de leads quentes (aberto por padrão)
- `__tests__/unit/components/tracking/OpportunityPanel.test.tsx` — 20 testes unitários

**Modificados:**
- `src/types/tracking.ts` — `phone?: string` adicionado em `LeadTracking`
- `src/lib/services/tracking.ts` — `phone` mapeado em `mapToLeadTracking()`
- `src/components/tracking/LeadTrackingTable.tsx` — Props `highInterestThreshold` + `onHighInterestClick`, badge dinâmico e clicável, `DEFAULT_HIGH_INTEREST_THRESHOLD` exportado
- `src/components/tracking/ThresholdConfig.tsx` — Collapsible UX (fechado por padrão) com ChevronDown/ChevronUp
- `src/components/tracking/index.ts` — Export de `OpportunityPanel`
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — Integração OpportunityPanel, badge header, toast localStorage, layout reordenado
- `__tests__/helpers/mock-data.ts` — `phone: undefined` em `createMockLeadTracking`
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` — 4 testes de badge dinâmico
- `__tests__/unit/components/tracking/ThresholdConfig.test.tsx` — Testes reestruturados para collapsible UX (renderAndOpen helper, testes de toggle)
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` — 6 testes de integração 10.7
