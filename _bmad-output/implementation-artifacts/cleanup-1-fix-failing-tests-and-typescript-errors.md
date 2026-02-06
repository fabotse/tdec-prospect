# Story Cleanup-1: Fix Failing Tests and TypeScript Errors

Status: done

## Story

Como desenvolvedor,
Quero corrigir todos os ~21 testes falhando e erros de TypeScript nos testes,
Para que a suite de testes seja confiável e não mascare regressões futuras.

## Acceptance Criteria

1. **Given** a suite de testes é executada com `vitest run`
   **When** todos os testes são processados
   **Then** 0 testes devem falhar (excluindo testes intencionalmente `.skip`)
   **And** a contagem total de testes passando deve ser >= 2927 (baseline atual)

2. **Given** os arquivos de teste são compilados
   **When** TypeScript verifica os tipos
   **Then** nenhum erro de tipo `@ts-ignore` ou `@ts-expect-error` deve ser necessário nos testes corrigidos
   **And** todos os mocks devem refletir as interfaces reais dos componentes/hooks

3. **Given** os testes corrigidos passam
   **When** o componente AICampaignWizard é testado
   **Then** os testes refletem o fluxo atual (template-selection → form → generating → strategy)
   **And** os mocks incluem todas as propriedades usadas pelo componente

4. **Given** os testes corrigidos passam
   **When** o componente LoginPage é testado
   **Then** nenhum teste depende da ordem de execução de outros testes
   **And** o teste "should not redirect on error" passa de forma consistente (não flaky)

## Tasks / Subtasks

- [x] Task 1: Fix AICampaignWizard.test.tsx — 8 testes falhando (AC: #1, #2, #3)
  - [x] 1.1 **CAUSA RAIZ:** Story 6.13 mudou o step inicial de `"form"` para `"template-selection"`. Os testes assumem que o wizard abre no step "form", mas agora abre no step "template-selection" (renderiza `<TemplateSelector>`)
  - [x] 1.2 Adicionar helper `navigateToForm()` que navega do "template-selection" para o "form" step (click em "Campanha Personalizada" / custom button via `data-testid="template-custom-button"`)
  - [x] 1.3 Atualizar teste "renders wizard dialog when open" → Renomeado para "renders template selection when open", verifica template-selector e texto correto
  - [x] 1.4 Atualizar teste "renders all form fields" — precisa navegar para o form step primeiro
  - [x] 1.5 Atualizar teste "renders back button" → "renders back-to-templates button in form step" com testId `back-to-templates`
  - [x] 1.6 Atualizar teste "calls onBack when back button is clicked" → "navigates back to template selection when back-to-templates is clicked"
  - [x] 1.7 Atualizar teste "requires campaign name" — navegar para form step primeiro
  - [x] 1.8 Atualizar teste "calls generate with correct parameters" — navegar para form step primeiro
  - [x] 1.9 Atualizar teste "creates campaign after successful generation" — navegar para form step primeiro
  - [x] 1.10 Atualizar teste "calls onOpenChange when cancel is clicked" — navegar para form step primeiro
  - [x] 1.11 Adicionar `setTemplateName: vi.fn()` ao mock de useBuilderStore + mock de `useCampaignTemplates`

- [x] Task 2: Fix ai-full-campaign-generation.test.tsx — 7 testes falhando (AC: #1, #2, #3)
  - [x] 2.1 **MESMA CAUSA RAIZ:** Testes renderizam `<AICampaignWizard>` mas o step inicial é "template-selection"
  - [x] 2.2 Criar helper `navigateToForm()` para navegar ao form step antes de interagir
  - [x] 2.3 Atualizar teste "shows form initially" → split em "shows template selection initially" + "shows form after navigating from template selection"
  - [x] 2.4 Atualizar testes de flow: todos precisam navegar template-selection → form → interagir
  - [x] 2.5 Adicionar `setTemplateName: vi.fn()` ao mock de useBuilderStore + mock de `useCampaignTemplates`
  - [x] 2.6 AbortErrors não persistiram após fix — sem necessidade de cleanup adicional

- [x] Task 3: Fix LoginPage.test.tsx — 1 teste falhando (AC: #1, #4)
  - [x] 3.1 **CAUSA RAIZ REAL:** Loading-state tests usam `setTimeout(100ms)` nos mocks que resolvem APÓS o teste terminar, chamando `mockPush("/leads")` no contexto do próximo teste
  - [x] 3.2 Remover `mockPush.mockReset()` manual redundante
  - [x] 3.3 Adicionar flush de 200ms + `mockPush.mockClear()` antes do teste para garantir que timers dos testes anteriores resolveram
  - [x] 3.4 Fix confirmado: teste passa consistentemente em isolamento e full suite

- [x] Task 4: Verificar e corrigir TypeScript errors nos testes (AC: #2)
  - [x] 4.1 `npx tsc --noEmit` — 6 erros encontrados, todos pré-existentes (leads-enrich-icebreaker.test.ts + src/types/index.ts), fora do escopo
  - [x] 4.2 `setTemplateName` adicionado aos mocks em 3 arquivos (AICampaignWizard, ai-full-campaign-generation, ai-campaign-structure)
  - [x] 4.3 Zero `@ts-ignore` ou `@ts-expect-error` nos testes corrigidos
  - [x] 4.4 `knowledge-base.test.ts` — 3 `@ts-expect-error` são intencionais (testing invalid inputs: section, preset, size)

- [x] Task 5: Validação final (AC: #1)
  - [x] 5.1 `vitest run` — 2949 testes passando, 0 falhas, 2 skipped
  - [x] 5.2 Zero regressões — 2949 >= 2927 baseline
  - [x] 5.3 3 arquivos corrigidos rodados isoladamente (36/36 passing) — sem order-dependency

## Dev Notes

### Causa Raiz Principal (15 dos 21 testes)

A Story 6.13 (Smart Campaign Templates) mudou o step inicial do `AICampaignWizard` de `"form"` para `"template-selection"`:

```typescript
// src/components/campaigns/AICampaignWizard.tsx, linha 298
const [step, setStep] = useState<WizardStep>("template-selection");
```

Os testes da Story 6.12 e 6.12.1 foram escritos quando o wizard abria direto no form. Com a mudança, o Dialog abre e renderiza `<TemplateSelector>` em vez do formulário. Todos os `getByTestId("wizard-campaign-name")` e similares falham porque o form não está no DOM.

### Wizard Steps (Fluxo Atual — Story 6.13)

```
template-selection → template-preview → strategy-summary → generating-content
                   ↘ form → generating-structure → strategy-summary → generating-content
```

O botão para ir ao form está no `<TemplateSelector>` (custom campaign click → `handleCustomClick` → `setStep("form")`).

### Componente AICampaignWizard — Mock Incompleto

O mock atual de `useBuilderStore` está faltando `setTemplateName`:

```typescript
// Mock ATUAL (incompleto)
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: () => ({
    loadBlocks: mockLoadBlocks,
    setProductId: mockSetProductId,
  }),
}));

// Mock CORRETO (precisa de setTemplateName)
const mockSetTemplateName = vi.fn();
vi.mock("@/stores/use-builder-store", () => ({
  useBuilderStore: () => ({
    loadBlocks: mockLoadBlocks,
    setProductId: mockSetProductId,
    setTemplateName: mockSetTemplateName,  // Adicionado na Story 6.13
  }),
}));
```

### LoginPage — Análise do Teste Flaky

```typescript
// __tests__/unit/components/LoginPage.test.tsx, linhas 318-340
it("should not redirect on error", async () => {
  mockPush.mockReset();  // ← REDUNDANTE: beforeEach já faz clearAllMocks
  mockSignInWithPassword.mockResolvedValue({
    error: { message: "Invalid login credentials" },
  });
  // ... form interaction ...
  expect(mockPush).not.toHaveBeenCalled();  // ← Pode falhar se promise anterior não resolveu
});
```

O `beforeEach` já faz `vi.clearAllMocks()` (linha 58). O `mockPush.mockReset()` extra pode interferir com promises pending do teste anterior ("should redirect to /leads on successful login"), que chama `mockPush("/leads")`.

### Arquivos de Teste Falhando (Confirmados)

| Arquivo | Falhas | Causa Raiz |
|---------|--------|------------|
| `__tests__/unit/components/campaigns/AICampaignWizard.test.tsx` | 8 | Step inicial mudou para template-selection (Story 6.13) |
| `__tests__/integration/ai-full-campaign-generation.test.tsx` | ~7 | Mesma causa — renderiza AICampaignWizard |
| `__tests__/unit/components/LoginPage.test.tsx` | 1 | Mock timing/race condition com mockPush |

### TemplateSelector Component — Entender para Navegar

Para navegar do `template-selection` para o `form` step nos testes, o dev precisa:
1. Ler o componente `TemplateSelector` para encontrar o botão/link que chama `onCustomClick`
2. No componente pai (`AICampaignWizard`), `handleCustomClick` faz `setStep("form")`
3. O testId do botão pode ser algo como `custom-campaign-button` — verificar no componente

### Ambiente de Testes

- **Test Runner:** Vitest v4.0.18
- **DOM:** happy-dom v20.4.0
- **Testing Library:** @testing-library/react v16.3.2
- **Setup:** `__tests__/setup.ts` (vitest-axe + jest-dom matchers)
- **Config:** `vitest.config.ts`

### ESLint Rule (Contexto)

A rule `no-console: ["error", { allow: ["warn", "error"] }]` JÁ EXISTE em `eslint.config.mjs` para `src/**/*.{ts,tsx}`. Não precisa ser implementada nesta story — será validada na Cleanup-2.

### Git Intelligence

```
d2cfc30 fix(filters): prevent trim from removing spaces while typing in filter inputs
d8ef3f9 feat(story-8.5): Visual QA & Contrast Review with code review fixes
7eb0879 fix(apollo): correct API query string encoding and filter params
03adfc3 feat(story-8.4): UI TripleD Components Integration with code review fixes
9f6f5ca feat(story-8.3): Charts Grayscale Conversion with code review fixes
```

Últimos commits são da Epic 8 (visual). Os testes falhando são da Epic 6 (Stories 6.12, 6.12.1, 6.13) e originais (LoginPage).

### ALERTA — NÃO Fazer

- **NÃO** mudar o step inicial do componente `AICampaignWizard` — os testes devem se adaptar ao componente, não o contrário
- **NÃO** deletar testes — corrigi-los para testar o fluxo correto
- **NÃO** usar `@ts-ignore` como "fix" — corrigir os tipos
- **NÃO** mexer em testes que já passam — zero regressões
- **NÃO** alterar componentes de produção (src/) — esta story é APENAS testes

### Project Structure Notes

- Testes seguem a estrutura espelho: `__tests__/unit/` espelha `src/`
- Mock factories centralizadas em `__tests__/helpers/mock-data.ts`
- Framer-motion mock duplicado em múltiplos arquivos (padrão existente, não alterar)
- Cada arquivo de teste faz seus próprios vi.mock() — padrão do projeto

### References

- [Source: src/components/campaigns/AICampaignWizard.tsx] — Componente com step "template-selection" como default
- [Source: __tests__/unit/components/campaigns/AICampaignWizard.test.tsx] — 8 testes falhando
- [Source: __tests__/integration/ai-full-campaign-generation.test.tsx] — ~7 testes falhando
- [Source: __tests__/unit/components/LoginPage.test.tsx:318-340] — 1 teste flaky
- [Source: __tests__/helpers/mock-data.ts] — Mock factories existentes
- [Source: epic-8-retro-2026-02-05.md#Action-Items] — Items 4 e 7 (CRITICAL + MEDIUM)
- [Source: epic-6-retro-2026-02-03.md#Patterns] — Padrões recorrentes identificados
- [Source: vitest.config.ts] — Test runner config (happy-dom)
- [Source: eslint.config.mjs] — ESLint rule no-console já existe para src/

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Full suite run: 168 files, 2949 passed, 0 failed, 2 skipped
- Isolated run (3 corrected files): 36/36 passed (38 with 2 skipped)
- Extra fix needed: `ai-campaign-structure.test.tsx` (6 tests) had same root cause — discovered during full suite validation

### Completion Notes List

- **Task 1:** Added `navigateToForm()` helper, `useCampaignTemplates` mock, `setTemplateName` to useBuilderStore mock. Refactored "renders wizard dialog when open" to test template-selection step. Updated back button tests to use `back-to-templates` testId. 9/9 passing (2 skipped pre-existing).
- **Task 2:** Same pattern as Task 1. Split "shows form initially" into 2 tests (template-selection + form navigation). 8/8 passing. No AbortErrors after fix.
- **Task 3:** Root cause was deeper than story anticipated — loading-state tests use `setTimeout(100ms)` mocks that leak `mockPush("/leads")` into subsequent tests. Fix: 200ms flush + mockClear before test. 19/19 passing.
- **Task 4:** No new TS errors in corrected files. Pre-existing errors (leads-enrich-icebreaker.test.ts, src/types/index.ts) are out of scope. `knowledge-base.test.ts` @ts-expect-error are intentional.
- **Task 5:** Full suite: 2949 tests passing (baseline was 2927). Zero regressions. 3 corrected files pass in isolation.
- **Extra:** Also fixed `ai-campaign-structure.test.tsx` (6 failing tests) — same template-selection root cause. Added `navigateToAIForm()` helper, `useCampaignTemplates` mock, `setTemplateName` mock, updated `back-to-selection` to `template-selector-back` for AI wizard back navigation.

### File List

- `__tests__/unit/components/campaigns/AICampaignWizard.test.tsx` — Modified: navigateToForm helper, useCampaignTemplates mock, setTemplateName mock, test descriptions updated
- `__tests__/integration/ai-full-campaign-generation.test.tsx` — Modified: navigateToForm helper, useCampaignTemplates mock, setTemplateName mock, split "shows form initially" test
- `__tests__/unit/components/LoginPage.test.tsx` — Modified: removed mockPush.mockReset(), added 200ms flush + mockClear for timer isolation
- `__tests__/integration/ai-campaign-structure.test.tsx` — Modified: navigateToAIForm helper, useCampaignTemplates mock, setTemplateName mock, updated testIds for template-selection flow

## Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — Code Review Mode
**Date:** 2026-02-05
**Model:** Claude Opus 4.5

### Outcome: APPROVED (with fixes applied)

**Issues Found:** 0 High, 1 Medium, 3 Low
**Issues Fixed:** 2 (1 Medium + 1 Low)

### Findings

1. **[MEDIUM][FIXED]** LoginPage.test.tsx:318-321 — Timing-based fix (`setTimeout(200ms)`) era frágil e order-dependent. **Fix aplicado:** Adicionado `await waitFor()` no final dos loading-state tests para flush determinístico dos timers pendentes, eliminando o leak na raiz. Removido o hack de 200ms e `mockPush.mockClear()` redundante do teste "should not redirect on error". Também eliminou os `act()` warnings.
2. **[LOW][FIXED]** LoginPage.test.tsx:59-60 — `mockPush.mockClear()` e `mockRefresh.mockClear()` redundantes após `vi.clearAllMocks()`. Removidos.
3. **[LOW]** Helper `navigateToForm` duplicado em 3 arquivos de teste. Consistente com padrão do projeto (mocks por arquivo). Candidato para cleanup-2.
4. **[LOW]** Console warnings `Missing Description/aria-describedby` em testes de Dialog — pré-existentes, componente não fornece `aria-describedby`. Candidato para cleanup-2.

### AC Validation

| AC | Status |
|----|--------|
| #1 — 0 falhas, >= 2927 | IMPLEMENTED (47/47 + 2 skipped) |
| #2 — Zero @ts-ignore, mocks reais | IMPLEMENTED |
| #3 — Fluxo template-selection → form | IMPLEMENTED |
| #4 — Sem order-dependency, não flaky | IMPLEMENTED (fix aplicado) |

### Files Modified by Review

- `__tests__/unit/components/LoginPage.test.tsx` — Removido redundant mockClear, adicionado waitFor flush nos loading-state tests, removido hack 200ms

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-02-05 | Story criada com análise de causa raiz completa para ~21 testes falhando | SM Agent (Bob) |
| 2026-02-05 | Implementação completa: 4 arquivos de teste corrigidos, 2949/2949 testes passando, 0 falhas | Dev Agent (Amelia) |
| 2026-02-05 | Code review adversarial: 4 issues encontrados, 2 fixados (timer leak + redundant mockClear). Status → done | Dev Agent (Amelia) — Code Review |
