# Story 14.6: Tooltip com Preview do Email por Step

Status: done

## Story

As a usuario,
I want ver qual email corresponde a cada step da sequencia (ex: assunto do email) ao passar o mouse sobre "Step N",
so that eu nao precise sair da tela de analytics para entender qual mensagem gerou engajamento.

## Acceptance Criteria

1. Ao hover sobre "Step N" (nas colunas Step Abertura, Step Clique, Step Resposta), exibir tooltip com o assunto (subject) do email daquele step
2. Dados dos steps buscados a partir dos email_blocks locais (fonte primaria) OU via API Instantly `GET /api/v2/campaigns/{id}` (fallback para campanhas externas)
3. Cache dos steps no frontend — steps nao mudam durante a campanha, buscar apenas uma vez (`staleTime` longo)
4. Se dados de steps nao disponiveis, manter comportamento atual (exibir "Step N" sem tooltip)
5. Coluna "Ultimo Step" (se reativada) tambem enriquecida com subject no tooltip
6. Loading state gracioso enquanto steps sao carregados (nao bloquear renderizacao da tabela)
7. Testes unitarios para tooltip com subject, fallback sem dados, e estado de loading

## Tasks / Subtasks

- [x] Task 1: Criar tipo `CampaignStep` e expandir resposta da API (AC: #1, #2)
  - [x] 1.1 Adicionar tipo `CampaignStep` em `src/types/tracking.ts`: `{ stepNumber: number; subject: string }`
  - [x] 1.2 Adicionar campo opcional `steps?: CampaignStep[]` no response type de lead tracking (ou retornar separado)
  - [x] 1.3 Expandir `GetCampaignResponse` em `src/types/instantly.ts` para incluir `sequences` (fallback)
- [x] Task 2: Criar API route `/api/campaigns/[campaignId]/steps` (AC: #2, #6)
  - [x] 2.1 Criar `src/app/api/campaigns/[campaignId]/steps/route.ts` com GET handler
  - [x] 2.2 Fonte primaria: query `email_blocks` por `campaignId` ordenado por `position` → mapear para `{ stepNumber: position, subject }`
  - [x] 2.3 Fallback (se nenhum block local): chamar `GET /api/v2/campaigns/{externalCampaignId}` → extrair `sequences[0].steps[].variants[0].subject`
  - [x] 2.4 Retornar `CampaignStep[]` como JSON
- [x] Task 3: Criar hook `useCampaignSteps(campaignId)` (AC: #3, #6)
  - [x] 3.1 Criar `src/hooks/use-campaign-steps.ts` usando TanStack Query
  - [x] 3.2 Configurar `staleTime: Infinity` (steps nao mudam durante campanha) e `gcTime` longo
  - [x] 3.3 Retornar `{ steps: Map<number, string>, isLoading: boolean }` — Map de stepNumber → subject
- [x] Task 4: Integrar tooltips na `LeadTrackingTable` (AC: #1, #4, #5, #6)
  - [x] 4.1 Consumir `useCampaignSteps(campaignId)` no componente
  - [x] 4.2 Criar helper `getStepTooltip(stepNumber, stepsMap)` retornando subject ou undefined
  - [x] 4.3 Envolver `formatStep()` output com `<Tooltip>` condicional (so se subject disponivel)
  - [x] 4.4 Aplicar em Step Abertura, Step Clique, Step Resposta (3 colunas)
  - [x] 4.5 Fallback gracioso: sem dados → "Step N" sem tooltip (comportamento atual preservado)
  - [x] 4.6 Texto do tooltip: subject do email em portugues, sem truncar
- [x] Task 5: Testes unitarios (AC: #7)
  - [x] 5.1 Testes do hook `useCampaignSteps`: fetch success, fallback vazio, error handling
  - [x] 5.2 Testes da `LeadTrackingTable` com tooltips: hover mostra subject, sem dados mostra "Step N", loading state
  - [x] 5.3 Teste da API route `/api/campaigns/[campaignId]/steps`: retorno com blocks locais, fallback Instantly

## Dev Notes

### Business Context

Usuarios precisam entender qual email na sequencia gerou engajamento. Atualmente veem "Step 1", "Step 2" etc., mas nao sabem qual era o assunto de cada step sem sair da tela de analytics e ir ao builder. Tooltip com o subject resolve isso com minimo impacto visual.

### Abordagem de Dados — Duas Fontes

**Fonte Primaria: email_blocks locais (preferida)**
- Campanhas criadas no app tem `email_blocks` no banco com `position` (= step number) e `subject`
- Query simples: `SELECT position, subject FROM email_blocks WHERE campaign_id = ? ORDER BY position`
- Sem API call externo, sem rate limit, resposta instantanea
- Endpoint existente: `GET /api/campaigns/[campaignId]/blocks` ja retorna blocks (ver `src/app/api/campaigns/[campaignId]/blocks/route.ts` linhas 71-76)

**Fonte Fallback: API Instantly (para campanhas importadas/externas)**
- `GET /api/v2/campaigns/{id}` retorna `sequences[0].steps[].variants[0].subject`
- `getCampaignStatus()` em `InstantlyService` ja chama este endpoint mas nao extrai sequences
- Tipo `GetCampaignResponse` em `src/types/instantly.ts` (linhas 146-151) precisa ser expandido para incluir `sequences`
- Rate limit: 10 req/s compartilhado entre todas API keys do workspace

**Decisao de implementacao:** Criar nova API route `/api/campaigns/[campaignId]/steps` que:
1. Busca email_blocks locais primeiro
2. Se nenhum block encontrado, busca via Instantly API usando `externalCampaignId` da campanha
3. Retorna array unificado `CampaignStep[]`

### Mapeamento Step Number

- **email_blocks.position:** 0-based (posicao no builder) — VERIFICAR se e 0-based ou 1-based no banco
- **Instantly API email_opened_step:** 1-based (Step 1, Step 2...)
- **sequences[0].steps[index]:** 0-based array
- **CRITICO:** Garantir que o mapeamento position → stepNumber esteja correto. Se position e 0-based, fazer `stepNumber = position + 1`. Testar com dados reais.

### Tooltip Pattern (ja estabelecido na codebase)

```typescript
// Tooltip ja usado em LeadTrackingTable para Gateway e WhatsApp
// Componentes ja importados: Tooltip, TooltipContent, TooltipTrigger, TooltipProvider
// TooltipProvider ja envolve toda a tabela (linha 317)

// Pattern para step tooltip:
const subject = stepsMap.get(lead.emailOpenedStep);
{lead.emailOpenedStep != null ? (
  subject ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted">
          {formatStep(lead.emailOpenedStep)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {subject}
      </TooltipContent>
    </Tooltip>
  ) : (
    formatStep(lead.emailOpenedStep)
  )
) : "-"}
```

### typeof Guards — OBRIGATORIO

Stories 14.4 e 14.5 descobriram que a API Instantly retorna tipos inesperados (objetos em vez de strings, numeros em vez de strings). SEMPRE usar typeof guards:
- `typeof lead.emailOpenedStep === "number"` antes de usar como key no Map
- `typeof subject === "string"` antes de renderizar no tooltip
- Fallback gracioso para qualquer tipo inesperado

### Colunas Atuais da Tabela (10 colunas — story 14.5)

1. Email (leadEmail)
2. Nome (firstName)
3. Aberturas (openCount)
4. Cliques (clickCount)
5. Respondeu (hasReplied)
6. Ultimo Open (lastOpenAt)
7. Step Abertura (emailOpenedStep) ← **TOOLTIP AQUI**
8. Provedor (espCode)
9. Gateway (esgCode)
10. WA (WhatsApp)

**Nota:** Step Clique e Step Resposta foram REMOVIDOS na story 14.5 (redundantes com clickCount e "Respondeu"). O tooltip so precisa ser aplicado na coluna **Step Abertura** que existe atualmente. Se Step Clique/Resposta forem readicionados no futuro, aplicar tooltip la tambem.

### Project Structure Notes

- Alinhado com estrutura unificada: hooks em `src/hooks/`, API routes em `src/app/api/`, types em `src/types/`
- API route segue padrao existente: `src/app/api/campaigns/[campaignId]/steps/route.ts`
- Hook segue padrao TanStack Query igual a `use-lead-tracking.ts` e `use-campaign-analytics.ts`
- Nenhum conflito de variancias detectado

### References

- [Source: _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md#Story 14.6]
- [Source: src/components/tracking/LeadTrackingTable.tsx] — Componente alvo, Tooltip ja importado
- [Source: src/types/tracking.ts#L144-L176] — LeadTracking interface com emailOpenedStep
- [Source: src/types/instantly.ts#L45-L57] — InstantlySequenceStep e InstantlyVariant types
- [Source: src/types/instantly.ts#L146-L151] — GetCampaignResponse (precisa expansao)
- [Source: src/lib/services/instantly.ts] — InstantlyService com getCampaignStatus()
- [Source: src/app/api/campaigns/[campaignId]/blocks/route.ts#L71-L76] — GET blocks existente
- [Source: src/hooks/use-lead-tracking.ts] — Pattern de hook com TanStack Query
- [Source: __tests__/helpers/mock-data.ts] — createMockLeadTracking() factory
- [Source: Instantly API v2] — GET /api/v2/campaigns/{id} retorna sequences[0].steps[].variants[].subject
- [Source: _bmad-output/implementation-artifacts/14-5-email-provider-e-security-gateway.md] — Story anterior com patterns
- [Source: _bmad-output/implementation-artifacts/14-4-detalhamento-aberturas-cliques-respostas-por-step.md] — Story dependencia

### Previous Story Intelligence (14.5)

**Aprendizados criticos da story 14.5:**
- API Instantly retorna `esp_code` e `esg_code` como NUMEROS, nao strings — sempre verificar tipos reais
- `status_summary` pode ser objeto em vez de string — usar typeof guards
- Tabela foi otimizada de 14 → 10 colunas (4 removidas por baixo valor)
- Pattern de Badge com shortLabel funciona bem para dados compactos
- Tooltip no header ja funciona (ver Gateway tooltip)
- `resolveEspCode()` e `resolveEsgCode()` em tracking.ts sao bom pattern para resolucao de tipos

**Aprendizados da story 14.4:**
- `formatStep()` helper ja existe e retorna "Step N" ou "-"
- Sorting com fallback -1 para undefined funciona bem
- `data-testid` especificos facilitam testes (ex: `status-summary-badge`)
- `overflow-x-auto` container ja presente na tabela

### Git Intelligence

Ultimos commits relevantes:
```
5894b5a feat(story-14.5): email provider e security gateway na tabela de leads + code review fixes
e397a50 feat(story-14.4): detalhamento aberturas cliques respostas por step + code review fixes
cbea4f5 feat(story-14.3): grafico de evolucao diaria + code review fixes
480cd72 feat(story-14.2): barra de progresso e status da campanha + code review fixes
0e84ab7 feat(story-14.1): expandir tipos e mapeamento da API Instantly + code review fixes
```

Branch: `epic/14-analytics-avancado-campanha`

### Library/Framework Requirements

- **TanStack Query (React Query):** Usar para hook `useCampaignSteps` com `staleTime: Infinity`
- **shadcn/ui Tooltip:** Ja importado e usado no componente alvo
- **Tailwind CSS v4:** Usar `flex flex-col gap-*` (NAO `space-y-*`)
- **Vitest + React Testing Library:** Para testes unitarios
- **ESLint:** Enforces no-console — nao usar console.log

### Testing Requirements

- **Hook tests:** Mockar fetch, testar success/error/empty states
- **Component tests:** Hover em "Step N" mostra subject, sem dados mostra "Step N" normal, loading nao bloqueia tabela
- **API route tests:** Mockar Supabase query e InstantlyService, testar ambas fontes
- **Mock factory:** Adicionar `steps` ao mock se necessario, ou criar `createMockCampaignSteps()`
- **Padrao de teste:** Usar `screen.getByText()`, `userEvent.hover()`, `waitFor()` para tooltips assincronos
- **data-testid:** Usar `step-tooltip-trigger` ou similar para facilitar selecao em testes

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- CampaignAnalyticsPage.test.tsx needed mock for new `useCampaignSteps` hook — added mock default in beforeEach

### Completion Notes List
- Task 1: Added `CampaignStep` type to tracking.ts, expanded `GetCampaignResponse` with optional `sequences` field
- Task 2: Created `/api/campaigns/[campaignId]/steps` route — primary source: email_blocks (position+1 for 1-based step), fallback: Instantly API raw fetch for sequences
- Task 3: Created `useCampaignSteps` hook with `staleTime: Infinity`, returns `Map<number, string>` (stepNumber → subject), filters empty subjects
- Task 4: Added `stepsMap` and `campaignId` props to LeadTrackingTable, `getStepTooltip()` helper, conditional Tooltip with `cursor-help underline decoration-dotted` styling, `data-testid="step-tooltip-trigger"`. Step Clique/Resposta columns were already removed in story 14.5 so tooltip only applies to Step Abertura
- Task 5: 21 new tests (6 hook, 8 API route, 7 component tooltip). All 281 test files pass (5130 tests, 0 failures)

### Code Review Fixes (2026-03-24)
- [H1] API route: added explicit error handling for blocksError (was silently falling through to Instantly fallback)
- [M1] Hook fetchCampaignSteps: added try-catch around response.json() for non-JSON error responses
- [M2] Test files: added afterAll to restore global.fetch after override (steps.test.ts + use-campaign-steps.test.ts)
- [M3] Verified email_blocks.position is 0-based (use-builder-store.ts assigns position: i) — +1 conversion confirmed correct
- [L1] Added comment in steps/route.ts explaining why getCurrentUserProfile is used (needs tenant_id for api_configs)
- [L2] Fixed Dev Notes column list to match actual table (was listing "Enviados (sentCount)" which doesn't exist)
- Added 2 new tests: API route returns 500 on blocksError, hook handles non-JSON response
- Total: 23 tests (7 hook, 9 API route, 7 component tooltip). All 123 story-related tests passing.

### Change Log
- 2026-03-23: Story 14.6 implementation complete — tooltip preview email por step
- 2026-03-24: Code review fixes — 6 issues fixed (1 HIGH, 3 MEDIUM, 2 LOW), 2 new tests added

### File List
- src/types/tracking.ts (modified — added CampaignStep interface)
- src/types/instantly.ts (modified — expanded GetCampaignResponse with sequences)
- src/app/api/campaigns/[campaignId]/steps/route.ts (new — GET handler, CR: explicit blocksError handling + auth comment)
- src/hooks/use-campaign-steps.ts (new — TanStack Query hook, CR: non-JSON response handling)
- src/components/tracking/LeadTrackingTable.tsx (modified — tooltip integration, getStepTooltip helper, stepsMap prop, CR: removed unused campaignId prop)
- src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx (modified — useCampaignSteps hook, pass stepsMap to table, CR: removed campaignId prop from LeadTrackingTable)
- __tests__/unit/hooks/use-campaign-steps.test.ts (new — 7 tests, CR: +1 non-JSON test, afterAll fetch restore)
- __tests__/unit/api/campaigns/steps.test.ts (new — 9 tests, CR: +1 blocksError test, afterAll fetch restore)
- __tests__/unit/components/tracking/LeadTrackingTable.test.tsx (modified — 7 new tooltip tests)
- __tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx (modified — added useCampaignSteps mock)
