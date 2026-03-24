# Story 14.7: Painel Lateral com Preview dos Steps da Campanha

Status: done

## Story

As a usuario na tela de analytics,
I want clicar em "Step N" na tabela de leads e ver um painel lateral com todos os emails da sequencia (subject + body), destacando o step clicado,
so that eu entenda o conteudo completo que gerou engajamento sem sair da pagina de analytics.

## Acceptance Criteria

1. Ao clicar em "Step N" na coluna Step Abertura da LeadTrackingTable, abrir um painel lateral (Sheet) do lado direito
2. O painel exibe TODOS os steps da campanha em sequencia vertical, cada um com subject e body em formato preview (mesmo pattern do CampaignPreviewPanel/PreviewEmailStep existente)
3. O step clicado fica visualmente destacado (highlight com borda primary + ring, mesmo pattern de `isHighlighted` do PreviewEmailStep)
4. Scroll automatico ate o step destacado quando o painel abre
5. Se dados dos steps nao disponiveis, o step permanece clicavel mas o painel mostra estado vazio gracioso
6. O painel tem titulo "Steps da Campanha" e exibe o nome da campanha
7. Fechar painel via botao X ou click fora (comportamento padrao do Sheet)
8. Testes unitarios: click abre painel, step correto destacado, estado vazio, fechar painel
9. [Bug fix] Step 0 exibe tooltip e e clicavel — corrigir o mapeamento off-by-one entre `email_opened_step` (0-based do Instantly) e o stepsMap

## Tasks / Subtasks

- [x] Task 1: Corrigir bug off-by-one no mapeamento de steps (AC: #9)
  - [x] 1.1 Investigar se `email_opened_step` do Instantly e 0-based: verificar dados reais no banco/API e comparar com `email_blocks.position`
  - [x] 1.2 Alinhar o mapeamento: na API route `/steps` (linha 64), remover `position + 1` e manter stepsMap 0-based para alinhar com `email_opened_step`
  - [x] 1.3 Atualizar `formatStep()` em `LeadTrackingTable.tsx` (linha 78-80) para exibir "Step N+1" ao usuario (display 1-based, dados 0-based)
  - [x] 1.4 Atualizar fallback Instantly na API route para manter steps 0-based (index do array = stepNumber)
  - [x] 1.5 Atualizar testes existentes da story 14.6 para refletir o novo mapeamento
  - [x] 1.6 Verificar que tooltips agora funcionam para Step 0

- [x] Task 2: Expandir endpoint `/api/campaigns/[campaignId]/steps` para retornar body (AC: #2)
  - [x] 2.1 Adicionar campo `body: string` ao tipo `CampaignStep` em `src/types/tracking.ts` (linha 318-324)
  - [x] 2.2 Expandir query `email_blocks` na API route (linha 51) para incluir `body` no select: `position, subject, body`
  - [x] 2.3 Incluir `body` no mapeamento (linhas 63-66): `{ stepNumber: block.position, subject: block.subject, body: block.body ?? "" }`
  - [x] 2.4 Expandir fallback Instantly (linhas 124-129) para extrair `variants[0].body` alem de `subject`
  - [x] 2.5 Atualizar testes da API route em `__tests__/unit/api/campaigns/steps.test.ts`

- [x] Task 3: Expandir hook `useCampaignSteps` para retornar dados completos (AC: #2, #5)
  - [x] 3.1 Alterar retorno do hook para `{ stepsMap: Map<number, string>, stepsData: CampaignStep[], isLoading: boolean }`
  - [x] 3.2 Manter `stepsMap` existente para tooltips (backward compatible)
  - [x] 3.3 Adicionar `stepsData: CampaignStep[]` ao retorno para alimentar o painel
  - [x] 3.4 Atualizar testes do hook em `__tests__/unit/hooks/use-campaign-steps.test.ts`

- [x] Task 4: Criar componente `StepPreviewPanel` (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] 4.1 Criar `src/components/tracking/StepPreviewPanel.tsx` usando Sheet do shadcn/ui
  - [x] 4.2 Reutilizar `PreviewEmailStep` do builder para renderizar cada step (subject + body + highlight)
  - [x] 4.3 Props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `steps: CampaignStep[]`, `highlightedStep: number | null`, `campaignName: string`
  - [x] 4.4 Scroll automatico para o step destacado via `useEffect` + `ref` + `scrollIntoView({ behavior: "smooth", block: "center" })`
  - [x] 4.5 Estado vazio quando `steps` esta vazio: icone + "Nenhum step disponivel para esta campanha"
  - [x] 4.6 Header: SheetHeader com SheetTitle "Steps da Campanha" + SheetDescription com nome da campanha + contagem de steps

- [x] Task 5: Integrar click no "Step N" da LeadTrackingTable (AC: #1, #3)
  - [x] 5.1 Adicionar prop `onStepClick?: (stepNumber: number) => void` na interface de props da LeadTrackingTable (linhas 60-67)
  - [x] 5.2 Tornar "Step N" clicavel: mudar `cursor-help` para `cursor-pointer`, adicionar onClick handler
  - [x] 5.3 Manter tooltip no hover (comportamento existente preservado) + click abre painel
  - [x] 5.4 Steps sem tooltip (stepsMap vazio): click ainda funciona e chama onStepClick
  - [x] 5.5 No parent CampaignAnalyticsPage (page.tsx), adicionar state: `selectedStep` e `isStepPanelOpen`
  - [x] 5.6 Criar handler `handleStepClick` com useCallback
  - [x] 5.7 Passar `stepsData` e `campaignName` para o StepPreviewPanel
  - [x] 5.8 Atualizar destructuring do hook para extrair `stepsData` alem de `stepsMap`

- [x] Task 6: Testes unitarios (AC: #8)
  - [x] 6.1 Criar `__tests__/unit/components/tracking/StepPreviewPanel.test.tsx`: renderiza steps, highlight correto, scroll chamado, estado vazio, fecha painel
  - [x] 6.2 Atualizar `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx`: click em "Step N" chama onStepClick com stepNumber correto
  - [x] 6.3 Atualizar `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx`: integracao click -> painel abre com step destacado
  - [x] 6.4 Atualizar testes existentes que possam ser afetados pela mudanca off-by-one e novo hook return type

## Dev Notes

### Business Context

Usuarios da tela de analytics veem "Step N" na tabela de leads mas nao sabem qual era o conteudo completo do email daquele step. A story 14.6 adicionou tooltip com subject no hover. Agora queremos permitir um click para abrir um painel lateral com o conteudo completo (subject + body) de TODOS os steps, destacando o step clicado. Isso completa a experiencia de preview sem forcar o usuario a navegar para o builder.

### Bug Off-by-One (AC #9) — CRITICO, FAZER PRIMEIRO

**Problema atual:**
- `email_blocks.position` e 0-based (0, 1, 2...) — confirmado em `use-builder-store.ts:162` e `use-ai-campaign-structure.ts:100`
- API route `/steps` converte para 1-based: `stepNumber: block.position + 1` (retorna 1, 2, 3...)
- `email_opened_step` do Instantly e 0-based (0, 1, 2...)
- **Mismatch**: lead com `emailOpenedStep: 0` nao encontra match no stepsMap que comeca em 1

**Solucao:**
1. Remover `+ 1` na API route (linha 64): `stepNumber: block.position` (manter 0-based)
2. Manter fallback Instantly como 0-based: `stepNumber: index` (array index)
3. Atualizar `formatStep()` para display 1-based: `Step ${step + 1}` em vez de `Step ${step}`
4. stepsMap agora usa chaves 0-based → match direto com `emailOpenedStep`

**Impacto:** Todos os testes que verificam "Step 1", "Step 2" no display precisam ser atualizados.

### Componentes Reutilizaveis

**PreviewEmailStep** (`src/components/builder/PreviewEmailStep.tsx`):
```typescript
interface PreviewEmailStepProps {
  stepNumber: number;
  subject: string;
  body: string;
  isHighlighted?: boolean;
  // hasPremiumIcebreaker, icebreakerPosts, previewLead — NAO necessarios
}
```
- Renderiza subject + body com variable placeholders
- Suporta `isHighlighted` prop: borda primary + ring (linhas 120-125)
- Usa `renderTextWithVariablePlaceholders()` para exibir variaveis

**CampaignPreviewPanel** (`src/components/builder/CampaignPreviewPanel.tsx`) — REFERENCIA VISUAL:
- Sheet com `side="right"` e `className="w-full sm:max-w-lg overflow-hidden flex flex-col"`
- SheetHeader com titulo e descricao
- ScrollArea para conteudo scrollavel
- Map de blocks → PreviewEmailStep com highlight

**LeadDetailPanel** (`src/components/leads/LeadDetailPanel.tsx`) — REFERENCIA para Sheet em contexto de lista:
- `<Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>` (linha 682)
- `<SheetContent side="right" className="w-full flex flex-col overflow-hidden">` (linha 684)
- SheetHeader com flex-shrink-0

### Fluxo de Dados Completo

```
CampaignAnalyticsPage
  ├── useCampaignSteps(campaignId)
  │     → GET /api/campaigns/[campaignId]/steps
  │     → Retorna { stepsMap, stepsData, isLoading }
  │
  ├── LeadTrackingTable
  │     ├── props: stepsMap (tooltip), onStepClick (callback)
  │     └── Click "Step N" → onStepClick(stepNumber)
  │
  └── StepPreviewPanel
        ├── props: open, onOpenChange, steps (CampaignStep[]), highlightedStep, campaignName
        ├── Renderiza PreviewEmailStep para cada step
        ├── isHighlighted={step.stepNumber === highlightedStep}
        └── scrollIntoView no step destacado ao abrir
```

### Implementacao do StepPreviewPanel

```typescript
// Props
interface StepPreviewPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: CampaignStep[];
  highlightedStep: number | null;
  campaignName: string;
}

// Pattern de scroll automatico:
const stepRefs = useRef<Map<number, HTMLDivElement>>(new Map());

useEffect(() => {
  if (open && highlightedStep != null) {
    // Timeout para aguardar Sheet animation
    const timer = setTimeout(() => {
      stepRefs.current.get(highlightedStep)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 150);
    return () => clearTimeout(timer);
  }
}, [open, highlightedStep]);
```

### Integracao na LeadTrackingTable

```typescript
// Celula Step Abertura — mudar de cursor-help para cursor-pointer
// Manter tooltip + adicionar onClick
{(() => {
  const subject = getStepTooltip(lead.emailOpenedStep, stepsMap);
  if (typeof lead.emailOpenedStep !== "number") return "-";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="cursor-pointer underline decoration-dotted"
          onClick={(e) => {
            e.stopPropagation();
            onStepClick?.(lead.emailOpenedStep);
          }}
          data-testid="step-click-trigger"
        >
          {formatStep(lead.emailOpenedStep)}
        </span>
      </TooltipTrigger>
      {subject && <TooltipContent>{subject}</TooltipContent>}
    </Tooltip>
  );
})()}
```

### Integracao na CampaignAnalyticsPage

```typescript
// Novos states (apos linha 74):
const [isStepPanelOpen, setIsStepPanelOpen] = useState(false);
const [selectedStep, setSelectedStep] = useState<number | null>(null);

// Atualizar destructuring do hook (linha 76):
// De: const { data: stepsMap } = useCampaignSteps(...)
// Para: const { stepsMap, stepsData } = useCampaignSteps(...)

// Handler:
const handleStepClick = useCallback((stepNumber: number) => {
  setSelectedStep(stepNumber);
  setIsStepPanelOpen(true);
}, []);

// Na LeadTrackingTable (linha 199-206), adicionar prop:
// onStepClick={handleStepClick}

// Apos LeadTrackingTable, renderizar:
// <StepPreviewPanel
//   open={isStepPanelOpen}
//   onOpenChange={setIsStepPanelOpen}
//   steps={stepsData ?? []}
//   highlightedStep={selectedStep}
//   campaignName={campaign?.name ?? ""}
// />
```

### Hook useCampaignSteps — Mudanca de Retorno

**Antes (story 14.6):**
```typescript
// select transforma CampaignStep[] -> Map<number, string>
select: (steps) => {
  const map = new Map<number, string>();
  for (const step of steps) {
    if (step.subject) map.set(step.stepNumber, step.subject);
  }
  return map;
}
// Retorno: UseQueryResult<Map<number, string>>
```

**Depois (story 14.7):**
```typescript
// Remover select transform do useQuery
// Retornar CampaignStep[] diretamente
// Criar stepsMap derivado via useMemo no hook ou no componente

// Opcao recomendada — hook retorna objeto custom:
export function useCampaignSteps(campaignId: string | undefined, options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: ["campaign-steps", campaignId],
    queryFn: () => fetchCampaignSteps(campaignId!),
    enabled: !!campaignId && (options?.enabled ?? true),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  const stepsMap = useMemo(() => {
    if (!query.data) return undefined;
    const map = new Map<number, string>();
    for (const step of query.data) {
      if (step.subject) map.set(step.stepNumber, step.subject);
    }
    return map;
  }, [query.data]);

  return {
    stepsMap,
    stepsData: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
```

**ATENCAO:** Todos os consumidores do hook precisam ser atualizados:
- `CampaignAnalyticsPage` (page.tsx linha 76): de `const { data: stepsMap }` para `const { stepsMap, stepsData }`
- Qualquer outro consumidor

### typeof Guards — OBRIGATORIO

Stories 14.4, 14.5 e 14.6 descobriram que a API Instantly retorna tipos inesperados. SEMPRE usar typeof guards:
- `typeof lead.emailOpenedStep === "number"` antes de usar como key no Map ou chamar onStepClick
- `typeof step.body === "string"` antes de passar para PreviewEmailStep
- Fallback gracioso para qualquer tipo inesperado

### Colunas Atuais da Tabela (10 colunas)

1. Email (leadEmail)
2. Nome (firstName)
3. Aberturas (openCount)
4. Cliques (clickCount)
5. Respondeu (hasReplied)
6. Ultimo Open (lastOpenAt)
7. Step Abertura (emailOpenedStep) ← **CLICK ABRE PAINEL + TOOLTIP NO HOVER**
8. Provedor (espCode)
9. Gateway (esgCode)
10. WA (WhatsApp)

**Nota:** Step Clique e Step Resposta foram REMOVIDOS na story 14.5 (redundantes). O click/tooltip so precisa ser na coluna **Step Abertura**.

### Project Structure Notes

- Novo componente: `src/components/tracking/StepPreviewPanel.tsx` (segue pattern de componentes em tracking/)
- Modificacoes: `src/types/tracking.ts`, `src/hooks/use-campaign-steps.ts`, `src/app/api/campaigns/[campaignId]/steps/route.ts`, `src/components/tracking/LeadTrackingTable.tsx`, `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx`
- Novo teste: `__tests__/unit/components/tracking/StepPreviewPanel.test.tsx`
- Testes atualizados: steps.test.ts, use-campaign-steps.test.ts, LeadTrackingTable.test.tsx, CampaignAnalyticsPage.test.tsx
- Alinhado com estrutura unificada do projeto
- Nenhum conflito de variancias detectado

### References

- [Source: _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md#Story 14.7]
- [Source: src/components/builder/PreviewEmailStep.tsx] — Componente de preview (reutilizar), isHighlighted linhas 120-125
- [Source: src/components/builder/CampaignPreviewPanel.tsx] — Pattern Sheet + PreviewEmailStep
- [Source: src/components/leads/LeadDetailPanel.tsx] — Pattern Sheet lateral em contexto de lista
- [Source: src/components/tracking/LeadTrackingTable.tsx] — Step Abertura rendering linhas 382-402, formatStep linhas 78-80
- [Source: src/hooks/use-campaign-steps.ts] — Hook existente (expandir retorno)
- [Source: src/app/api/campaigns/[campaignId]/steps/route.ts] — API route (expandir com body), position+1 bug linha 64
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx] — Parent page, hook call linha 76
- [Source: src/types/tracking.ts#L318-L324] — CampaignStep interface (adicionar body)
- [Source: _bmad-output/implementation-artifacts/14-6-tooltip-preview-email-por-step.md] — Story anterior com patterns e aprendizados
- [Source: __tests__/unit/api/campaigns/steps.test.ts] — Testes API route existentes
- [Source: __tests__/unit/hooks/use-campaign-steps.test.ts] — Testes hook existentes
- [Source: __tests__/unit/components/tracking/LeadTrackingTable.test.tsx] — Testes tabela existentes

### Previous Story Intelligence (14.6)

**Aprendizados criticos:**
- Fonte primaria de steps: `email_blocks` locais (query Supabase), fallback: API Instantly `GET /api/v2/campaigns/{id}`
- `email_blocks.position` e 0-based (confirmado em use-builder-store.ts:162)
- API route converte para 1-based com `position + 1` — CAUSA do bug off-by-one
- `staleTime: Infinity` no hook (steps nao mudam durante campanha)
- `getStepTooltip()` helper ja existe na LeadTrackingTable
- `data-testid="step-tooltip-trigger"` ja existe para selecao em testes
- TooltipProvider ja envolve toda a tabela
- `cursor-help underline decoration-dotted` e o estilo atual do step com tooltip
- 23 testes existentes (7 hook, 9 API route, 7 component tooltip) — todos precisam ser revisados apos mudanca off-by-one
- `afterAll` para restaurar `global.fetch` ja implementado nos testes

**Aprendizados da story 14.5:**
- API Instantly retorna tipos inesperados — SEMPRE typeof guards
- Pattern de Badge com shortLabel funciona bem
- Tooltip no header ja funciona (ver Gateway tooltip)
- `resolveEspCode()` e `resolveEsgCode()` em tracking.ts sao bom pattern

**Aprendizados da story 14.4:**
- `formatStep()` helper ja existe e retorna "Step N" ou "-"
- Sorting com fallback -1 para undefined funciona bem
- `data-testid` especificos facilitam testes
- `overflow-x-auto` container ja presente na tabela

### Git Intelligence

Ultimos commits relevantes:
```
db82773 feat(story-14.6): tooltip preview email por step + code review fixes
5894b5a feat(story-14.5): email provider e security gateway na tabela de leads + code review fixes
e397a50 feat(story-14.4): detalhamento aberturas cliques respostas por step + code review fixes
cbea4f5 feat(story-14.3): grafico de evolucao diaria + code review fixes
480cd72 feat(story-14.2): barra de progresso e status da campanha + code review fixes
0e84ab7 feat(story-14.1): expandir tipos e mapeamento da API Instantly + code review fixes
```

Branch: `epic/14-analytics-avancado-campanha`

### Library/Framework Requirements

- **TanStack Query (React Query) v5:** Hook `useCampaignSteps` com `staleTime: Infinity` — remover `select` transform, usar `useMemo` para derivar stepsMap
- **shadcn/ui Sheet:** `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` — ja disponivel no projeto
- **shadcn/ui ScrollArea:** Para conteudo scrollavel do painel — ja disponivel
- **PreviewEmailStep:** Componente builder existente — reutilizar sem modificacoes
- **Tailwind CSS v4:** Usar `flex flex-col gap-*` (NAO `space-y-*`). Padding/margin conforme patterns existentes
- **Vitest + React Testing Library:** Para testes unitarios
- **ESLint:** Enforces no-console — nao usar console.log

### Testing Requirements

- **StepPreviewPanel tests (novo):**
  - Renderiza todos os steps com PreviewEmailStep
  - Step correto recebe isHighlighted=true
  - scrollIntoView chamado para step destacado
  - Estado vazio mostra mensagem quando steps=[]
  - Fechar painel chama onOpenChange(false)

- **LeadTrackingTable tests (atualizar):**
  - Click em "Step N" chama onStepClick com stepNumber correto
  - Click + tooltip coexistem (hover mostra subject, click chama handler)
  - Steps sem tooltip ainda sao clicaveis

- **CampaignAnalyticsPage tests (atualizar):**
  - Integracao: click em step -> StepPreviewPanel abre
  - Step correto e passado como highlightedStep
  - Mock do hook useCampaignSteps retorna stepsMap + stepsData

- **API route tests (atualizar):**
  - Response inclui body no mapeamento
  - Fallback Instantly extrai body de variants
  - body null/undefined retorna string vazia

- **Hook tests (atualizar):**
  - Retorna stepsMap (Map<number, string>) E stepsData (CampaignStep[])
  - stepsData inclui body
  - Backward compatible: stepsMap ainda funciona para tooltips

- **Mock factory:** Atualizar `createMockCampaignSteps()` para incluir `body`
- **Padrao de teste:** `data-testid="step-click-trigger"` para click, `screen.getByText()`, `userEvent.click()`, `waitFor()`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — no debug issues encountered.

### Completion Notes List

- **Task 1 (off-by-one fix):** Removed `position + 1` from API route and Instantly fallback. Updated `formatStep()` to display 1-based (`Step ${step + 1}`). All stepsMap keys now 0-based, matching Instantly's `email_opened_step`. Updated 23+ tests across API, hook, and component test files.
- **Task 2 (body expansion):** Added `body: string` to `CampaignStep` interface. Expanded Supabase query to include `body`. Added `typeof` guard for body field. Updated Instantly fallback to extract `variants[0].body`. Updated API route tests.
- **Task 3 (hook refactor):** Removed `select` transform from `useQuery`. Added `useMemo`-derived `stepsMap` inside the hook. Hook now returns `{ stepsMap, stepsData, isLoading, isError }`. Updated all consumers (CampaignAnalyticsPage). Rewrote hook tests for new return shape.
- **Task 4 (StepPreviewPanel):** Created new component using Sheet + ScrollArea + PreviewEmailStep. Implemented auto-scroll via `useRef` Map + `scrollIntoView`. Empty state with FileText icon. Header shows campaign name + step count.
- **Task 5 (click integration):** Added `onStepClick` prop to LeadTrackingTable. Changed `cursor-help` to `cursor-pointer`. Both tooltip (hover) and click coexist. Steps without tooltip are still clickable. Added state + handler in CampaignAnalyticsPage.
- **Task 6 (tests):** Created 9 new StepPreviewPanel tests. Added 4 new click tests to LeadTrackingTable. Added 1 integration test to CampaignAnalyticsPage. Updated all existing tests for 0-based keys, new testid, cursor-pointer.
- **Post-review fix (padding):** StepPreviewPanel ScrollArea content was missing padding — conteudo colado nas margens. Corrigido para usar `px-6 py-4 pb-6` (mesmo pattern do CampaignPreviewPanel).
- **Post-review fix (email numbering):** `stepNumber` do banco e a posicao no Instantly (inclui delay steps entre emails). Antes: `stepNumber={step.stepNumber + 1}` → mostrava "Email 1, 3, 5". Corrigido para `stepNumber={index + 1}` → mostra "Email 1, 2, 3" (numeracao sequencial de emails, mesmo comportamento do `getStepNumber()` no CampaignPreviewPanel). Adicionado teste com steps nao-sequenciais (posicoes 0, 2, 4).

### Change Log

- 2026-03-24: Story 14.7 implementation complete — 282 test files, 5146 tests passed, 0 failures.
- 2026-03-24: Post-review fixes — padding do painel lateral e numeracao sequencial de emails (index-based em vez de position-based).
- 2026-03-24: Code review fixes — teste integração click→painel (M1), docstring API route (M2), comentário tracking.ts (L1), remoção type assertion (L2), scrollIntoView timeout 150→250ms (L3).

### File List

**New:**
- src/components/tracking/StepPreviewPanel.tsx
- __tests__/unit/components/tracking/StepPreviewPanel.test.tsx

**Modified:**
- src/types/tracking.ts (added `body` to CampaignStep)
- src/app/api/campaigns/[campaignId]/steps/route.ts (0-based stepNumber, body field)
- src/hooks/use-campaign-steps.ts (refactored return type: stepsMap + stepsData)
- src/components/tracking/LeadTrackingTable.tsx (onStepClick prop, cursor-pointer, formatStep 1-based display)
- src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx (StepPreviewPanel integration, handleStepClick)
- __tests__/unit/api/campaigns/steps.test.ts (0-based stepNumber, body assertions)
- __tests__/unit/hooks/use-campaign-steps.test.ts (new return shape tests)
- __tests__/unit/components/tracking/LeadTrackingTable.test.tsx (click tests, 0-based data, cursor-pointer)
- __tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx (hook mock updated, integration test)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status updated)
