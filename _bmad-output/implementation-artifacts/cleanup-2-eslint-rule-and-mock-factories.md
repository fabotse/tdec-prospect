# Story Cleanup-2: ESLint Rule Enforcement & Mock Factories Update

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero validar que a ESLint rule `no-console` está funcionando, corrigir violações existentes, e centralizar mock factories com tipos completos,
Para que o código de produção nunca contenha debug logs e os testes sejam type-safe sem mocks inline desatualizados.

## Acceptance Criteria

1. **Given** o ESLint é executado com `npx eslint src/`
   **When** todos os arquivos `src/**/*.{ts,tsx}` são analisados
   **Then** 0 violações de `no-console` devem existir (console.log, console.info, console.debug proibidos)
   **And** a rule `no-console: ["error", { allow: ["warn", "error"] }]` deve estar ativa em `eslint.config.mjs`

2. **Given** o arquivo `__tests__/helpers/mock-data.ts` é atualizado
   **When** as factories existentes são verificadas
   **Then** `createMockCampaignRowWithCount()` deve incluir `product_name: null` (campo opcional faltando)
   **And** `createMockProduct()` deve incluir `campaignCount: 0` (campo opcional faltando)

3. **Given** novos tipos HIGH priority são identificados sem factories
   **When** factory functions são criadas
   **Then** `createMockCampaignWithCount()` deve existir com todos os campos de `CampaignWithCount`
   **And** `createMockCampaignTemplate()` deve existir com todos os campos de `CampaignTemplate`
   **And** `createMockSegmentWithCount()` deve existir com todos os campos de `SegmentWithCount`

4. **Given** existem 6 arquivos de teste com `createMockLead()` duplicada localmente
   **When** esses arquivos são refatorados
   **Then** devem importar `createMockLead` de `__tests__/helpers/mock-data.ts`
   **And** a função local duplicada deve ser removida
   **And** todos os testes desses arquivos devem continuar passando

5. **Given** a suite de testes é executada com `vitest run`
   **When** todos os testes são processados
   **Then** 0 testes devem falhar
   **And** a contagem total de testes passando deve ser >= 2949 (baseline da cleanup-1)

## Tasks / Subtasks

- [x] Task 1: Corrigir violação console.info existente (AC: #1)
  - [x] 1.1 Abrir `src/lib/services/lead.ts:97` — substituir `console.info(...)` por `console.warn(...)` ou remover se desnecessário
  - [x] 1.2 Executar `npx eslint src/ --rule 'no-console: error'` — confirmar 0 violações de no-console
  - [x] 1.3 Verificar que `eslint.config.mjs` continua com a rule correta (não alterar)

- [x] Task 2: Completar factories existentes com campos faltando (AC: #2)
  - [x] 2.1 Em `__tests__/helpers/mock-data.ts`, adicionar `product_name: null` em `createMockCampaignRowWithCount()`
  - [x] 2.2 Em `__tests__/helpers/mock-data.ts`, adicionar `campaignCount: 0` em `createMockProduct()`

- [x] Task 3: Criar novas factory functions HIGH priority (AC: #3)
  - [x] 3.1 Criar `createMockCampaignWithCount()` para tipo `CampaignWithCount` (`src/types/campaign.ts:90-93`)
    - Campos: `id, tenantId, name, status, productId, createdAt, updatedAt, leadCount, productName?`
  - [x] 3.2 Criar `createMockCampaignTemplate()` para tipo `CampaignTemplate` (`src/types/campaign-template.ts:52-65`)
    - Campos: `id, name, nameKey, description, structureJson, useCase, emailCount, totalDays, isActive, displayOrder, createdAt, updatedAt`
  - [x] 3.3 Criar `createMockSegmentWithCount()` para tipo `SegmentWithCount` (`src/types/segment.ts:21-23`)
    - Campos: `id, tenantId, name, description, createdAt, updatedAt, leadCount`
  - [x] 3.4 Importar todos os tipos necessários no topo do mock-data.ts

- [x] Task 4: Remover `createMockLead()` duplicadas em 6 arquivos (AC: #4)
  - [x] 4.1 `__tests__/unit/components/leads/LeadDetailPanel.test.tsx:67` — remover local, importar de mock-data.ts
  - [x] 4.2 `__tests__/unit/components/leads/LeadPreviewPanel.test.tsx:39` — remover local, importar de mock-data.ts
  - [x] 4.3 `__tests__/unit/components/leads/LeadImportIndicator.test.tsx:25` — remover local, importar de mock-data.ts
  - [x] 4.4 `__tests__/unit/components/leads/LeadStatusDropdown.test.tsx:48` — remover local, importar de mock-data.ts
  - [x] 4.5 `__tests__/unit/components/leads/PhoneLookupProgress.test.tsx:53` — remover local, importar de mock-data.ts
  - [x] 4.6 `__tests__/unit/hooks/use-phone-lookup.test.tsx:60` — remover local, importar de mock-data.ts

- [x] Task 5: Validação final (AC: #5)
  - [x] 5.1 Executar `vitest run` — confirmar >= 2949 testes passando, 0 falhas
  - [x] 5.2 Executar `npx eslint src/` — confirmar 0 violações de no-console
  - [x] 5.3 Executar testes isolados dos 6 arquivos refatorados — confirmar todos passando

## Dev Notes

### ESLint Rule — Análise Completa

A rule `no-console: ["error", { allow: ["warn", "error"] }]` **já está configurada** em `eslint.config.mjs` (linhas 18-22) para `src/**/*.{ts,tsx}`. NÃO precisa criar a rule — apenas validar e corrigir violações.

**Violações encontradas:**
- `src/lib/services/lead.ts:97` — `console.info(...)` — `console.info` NÃO está na lista de allow
- Nenhuma outra violação de `console.log` em código executável (1 hit em JSDoc comment não conta)
- Nenhum `eslint-disable` para `no-console` em nenhum arquivo src/
- Nenhum `.eslintignore` no projeto

**Outros ESLint errors (FORA DO ESCOPO desta story):**
- 4 errors: `react-hooks/set-state-in-effect` (BuilderHeader, Sidebar x2), variable before declaration (ImportCampaignResultsDialog)
- 10 warnings: `no-unused-vars`, `exhaustive-deps` em vários componentes

### Mock Factories — Análise de Completude

**Factories COMPLETAS (não alterar):**
| Factory | Tipo | Campos |
|---------|------|--------|
| `createMockLead()` | `Lead` | 23/23 campos |
| `createMockLeads()` | `Lead[]` | Usa createMockLead |
| `createMockCampaignRow()` | `CampaignRow` | 7/7 campos |
| `createMockFilterValues()` | `FilterValues` | 7/7 campos |

**Factories INCOMPLETAS (corrigir):**
| Factory | Tipo | Campo Faltando |
|---------|------|----------------|
| `createMockCampaignRowWithCount()` | `CampaignRowWithCount` | `product_name: null` (opcional) |
| `createMockProduct()` | `Product` | `campaignCount: 0` (opcional) |

**Factories NOVAS a criar (HIGH priority):**
| Factory | Tipo | Usado em | Campos |
|---------|------|----------|--------|
| `createMockCampaignWithCount()` | `CampaignWithCount` | 4 arquivos de teste | 9 campos |
| `createMockCampaignTemplate()` | `CampaignTemplate` | 4 arquivos de teste | 12 campos |
| `createMockSegmentWithCount()` | `SegmentWithCount` | 4 arquivos de teste | 7 campos |

**Tipos MEDIUM/LOW priority — NÃO incluídos nesta story (escopo controlado):**
TeamMember, EmailExample, LeadInteraction, LeadRow, EmailBlockRow, DelayBlockRow, UsageStatistics, CompanyProfile, ToneOfVoice, ICPDefinition

### 6 Arquivos com `createMockLead()` Duplicada

Todos definem uma função local idêntica à factory central. Nenhum importa de `__tests__/helpers/mock-data.ts`.

| Arquivo | Linha da Função Local |
|---------|----------------------|
| `__tests__/unit/components/leads/LeadDetailPanel.test.tsx` | ~67 |
| `__tests__/unit/components/leads/LeadPreviewPanel.test.tsx` | ~39 |
| `__tests__/unit/components/leads/LeadImportIndicator.test.tsx` | ~25 |
| `__tests__/unit/components/leads/LeadStatusDropdown.test.tsx` | ~48 |
| `__tests__/unit/components/leads/PhoneLookupProgress.test.tsx` | ~53 |
| `__tests__/unit/hooks/use-phone-lookup.test.tsx` | ~60 |

**Processo para cada arquivo:**
1. Adicionar `import { createMockLead } from "__tests__/helpers/mock-data";` (ou path relativo adequado)
2. Remover a função `createMockLead()` local
3. Se a função local tem campos extras específicos ao teste, manter como override via `createMockLead({ campo: valor })`
4. Executar os testes do arquivo isoladamente para confirmar

### Padrão de Importação do Projeto

O projeto usa path aliases `@/` para `src/` mas os testes importam helpers com caminhos relativos ou path alias. Verificar como outros arquivos importam de `__tests__/helpers/`:
- O `vitest.config.ts` pode ter alias configurado — verificar antes de definir import path
- Usar o mesmo padrão de import já existente em outros testes que usam helpers

### Previous Story Intelligence (Cleanup-1)

**Learnings da Cleanup-1:**
- Suite baseline: 2949 testes passando, 0 falhas, 2 skipped
- Login tests tinham timer leak — fix aplicado com `waitFor` flush
- A Story 6.13 mudou o wizard step inicial — 15 testes precisaram adaptar
- Code review encontrou timer leak como issue MEDIUM que foi fixado
- ESLint rule no-console já existia — confirmado na cleanup-1 (Dev Notes seção)

**Findings da cleanup-1 relevantes para esta story:**
- Finding #3 (LOW): Helper `navigateToForm` duplicado em 3 arquivos — "Candidato para cleanup-2"
- Finding #4 (LOW): Console warnings `Missing Description/aria-describedby` — "Candidato para cleanup-2"

**DECISÃO:** Findings #3 e #4 da cleanup-1 são LOW priority e estão FORA do escopo desta story para manter foco no ESLint + mock factories.

### Git Intelligence

```
d2cfc30 fix(filters): prevent trim from removing spaces while typing in filter inputs
d8ef3f9 feat(story-8.5): Visual QA & Contrast Review with code review fixes
7eb0879 fix(apollo): correct API query string encoding and filter params
03adfc3 feat(story-8.4): UI TripleD Components Integration with code review fixes
9f6f5ca feat(story-8.3): Charts Grayscale Conversion with code review fixes
```

Últimos commits são da Epic 8. O cleanup-sprint opera sobre a mesma branch `epic/8-visual-refresh`.

### Project Structure Notes

- Mock factories centralizadas: `__tests__/helpers/mock-data.ts`
- Tipos centralizados: `src/types/` (lead.ts, campaign.ts, campaign-template.ts, segment.ts, product.ts, etc.)
- ESLint config: `eslint.config.mjs` (flat config format, ESLint 9+)
- Test runner: Vitest v4.0.18, happy-dom v20.4.0
- Padrão do projeto: cada arquivo de teste faz seus próprios `vi.mock()` — NÃO centralizar mocks de módulos

### ALERTA — NÃO Fazer

- **NÃO** alterar a rule ESLint existente — ela já está correta
- **NÃO** migrar TODOS os inline mocks para factories — apenas os 6 arquivos com `createMockLead()` duplicada (escopo controlado)
- **NÃO** criar factories para tipos MEDIUM/LOW priority — escopo desta story é HIGH priority apenas
- **NÃO** corrigir os outros ESLint errors (set-state-in-effect, unused-vars) — fora do escopo
- **NÃO** alterar componentes de produção (src/) exceto o `console.info` em lead.ts
- **NÃO** mexer em testes que já passam (exceto os 6 com createMockLead duplicada)

### References

- [Source: eslint.config.mjs] — ESLint config com no-console rule (linhas 18-22)
- [Source: src/lib/services/lead.ts:97] — Única violação console.info
- [Source: __tests__/helpers/mock-data.ts] — Mock factories centrais (5 factories existentes)
- [Source: src/types/campaign.ts:90-93] — CampaignWithCount type (precisa factory)
- [Source: src/types/campaign.ts:111-114] — CampaignRowWithCount type (falta product_name)
- [Source: src/types/campaign-template.ts:52-65] — CampaignTemplate type (precisa factory)
- [Source: src/types/segment.ts:21-23] — SegmentWithCount type (precisa factory)
- [Source: src/types/product.ts:29-40] — Product type (falta campaignCount)
- [Source: cleanup-1-fix-failing-tests-and-typescript-errors.md] — Previous story learnings
- [Source: epic-8-retro-2026-02-05.md#Action-Items] — Items 5 e 6 (ESLint + mock factories)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Vitest run: 2949 passed, 0 failed, 2 skipped (168 test files)
- ESLint no-console: 0 violations
- 6 refactored test files: 97/97 tests passing

### Completion Notes List

- Task 1: Substituído `console.info` → `console.warn` em `src/lib/services/lead.ts:97`. ESLint no-console confirmado 0 violations.
- Task 2: Adicionado `product_name: null` em `createMockCampaignRowWithCount()`, `campaignCount: 0` em `createMockProduct()`.
- Task 3: Criadas 3 novas factories: `createMockCampaignWithCount()` (9 campos), `createMockCampaignTemplate()` (12 campos), `createMockSegmentWithCount()` (7 campos). Imports de `CampaignWithCount`, `CampaignTemplate`, `SegmentWithCount` adicionados.
- Task 4: Removidas 6 funções `createMockLead()` duplicadas. Cada arquivo agora importa da factory central. Assertions atualizadas para usar os defaults da factory central (ex: `firstName: "João"`, `email: "joao@empresa.com"`, `phone: "+55 11 99999-1111"`).
- Task 5: Suite completa verde — 2949 testes, 0 falhas. ESLint no-console 0 violations.

### File List

- `src/lib/services/lead.ts` — console.info removido (log desnecessário — resultado já retornado ao caller)
- `__tests__/helpers/mock-data.ts` — product_name, campaignCount adicionados; 3 novas factories + imports
- `__tests__/unit/components/leads/LeadDetailPanel.test.tsx` — removida createMockLead local, import centralizado, assertions atualizadas
- `__tests__/unit/components/leads/LeadPreviewPanel.test.tsx` — removida createMockLead local, import centralizado, assertions atualizadas
- `__tests__/unit/components/leads/LeadImportIndicator.test.tsx` — removida createMockLead local, import centralizado
- `__tests__/unit/components/leads/LeadStatusDropdown.test.tsx` — removida createMockLead local, import centralizado
- `__tests__/unit/components/leads/PhoneLookupProgress.test.tsx` — removida createMockLead local, import centralizado
- `__tests__/unit/hooks/use-phone-lookup.test.tsx` — removida createMockLead local, import centralizado

## Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — Code Review Mode
**Date:** 2026-02-05
**Model:** Claude Opus 4.5

### Outcome: APPROVED (with fix applied)

**Issues Found:** 0 High, 1 Medium, 2 Low
**Issues Fixed:** 1 (1 Medium)

### Findings

1. **[MEDIUM][FIXED]** lead.ts:97 — `console.warn` semanticamente incorreto para log de sucesso. Enriquecimento completado não é condição de alerta. Apareceria como WARNING em log aggregators. **Fix aplicado:** log removido — resultado já retornado ao caller via `{ success, leadId, updatedFields }`.
2. **[LOW]** mock-data.ts:103-170 — 3 novas factories (`createMockCampaignWithCount`, `createMockCampaignTemplate`, `createMockSegmentWithCount`) criadas mas nunca importadas por test files. Tipos são compile-time checked, então campos estão corretos. Serão usadas quando tests inline forem migrados.
3. **[LOW]** PhoneLookupProgress.test.tsx — `act()` warnings pré-existentes no teste "renders dialog when open". Não introduzidos por esta story.

### AC Validation

| AC | Status |
|----|--------|
| #1 — 0 violações no-console | IMPLEMENTED (console.warn removido → 0 logs) |
| #2 — Factories completadas | IMPLEMENTED |
| #3 — 3 novas factories | IMPLEMENTED (tipos 100% cobertos) |
| #4 — 6 createMockLead removidas | IMPLEMENTED |
| #5 — >= 2949, 0 falhas | IMPLEMENTED (97/97 nos 6 arquivos) |

### Files Modified by Review

- `src/lib/services/lead.ts` — Removido console.warn desnecessário (log de sucesso de enriquecimento)

## Change Log

| Data | Mudanca | Autor |
|------|---------|-------|
| 2026-02-05 | Story criada com análise exaustiva: ESLint audit (0 violations executáveis, 1 console.info), mock factory audit (2 incompletas, 3 novas HIGH, 6 duplicatas) | SM Agent (Bob) |
| 2026-02-05 | Implementação completa: console.info fixado, 2 factories completadas, 3 novas factories criadas, 6 duplicatas removidas. 2949 testes passando, 0 no-console violations | Dev Agent (Amelia) |
| 2026-02-05 | Code review adversarial: 3 issues encontrados, 1 fixado (console.warn removido). Status → done | Dev Agent (Amelia) — Code Review |
