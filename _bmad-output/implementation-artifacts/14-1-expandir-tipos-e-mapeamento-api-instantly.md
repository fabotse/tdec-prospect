# Story 14.1: Expandir Tipos e Mapeamento da API Instantly

Status: done

## Story

As a desenvolvedor,
I want expandir os tipos `InstantlyLeadEntry` e `CampaignAnalytics` para capturar todos os campos relevantes da API do Instantly,
so that as stories subsequentes (14.2-14.5) tenham os dados disponíveis sem mudanças adicionais na camada de serviço.

## Acceptance Criteria

1. `InstantlyLeadEntry` expandido com campos: `esp_code`, `esg_code`, `email_opened_step`, `email_opened_variant`, `email_replied_step`, `email_replied_variant`, `email_clicked_step`, `email_clicked_variant`, `last_step_id`, `last_step_from`, `last_step_timestamp_executed`, `status_summary`, `lt_interest_status`
2. `CampaignAnalytics` expandido com campos: `leadsCount`, `contactedCount`, `campaignStatus`, `unsubscribedCount`
3. `mapToLeadTracking()` atualizado para incluir os novos campos no tipo `LeadTracking`
4. `TrackingService.getCampaignAnalytics()` atualizado para mapear `leads_count`, `contacted_count`, `campaign_status`
5. Tipo `LeadTracking` expandido com campos opcionais para os novos dados
6. Nenhuma alteração na UI — apenas tipos, mapeamentos e serviço
7. Testes unitários atualizados para `mapToLeadTracking()` e `getCampaignAnalytics()`
8. Testes existentes continuam passando sem quebra

## Tasks / Subtasks

- [x] Task 1: Expandir `InstantlyLeadEntry` em `src/types/tracking.ts` (AC: #1)
  - [x] 1.1 Adicionar 13 novos campos opcionais ao tipo `InstantlyLeadEntry`
  - [x] 1.2 Todos os campos novos devem ser opcionais (`?`) — a API pode não retornar todos

- [x] Task 2: Expandir `CampaignAnalytics` em `src/types/tracking.ts` (AC: #2)
  - [x] 2.1 Adicionar `leadsCount`, `contactedCount`, `campaignStatus`, `unsubscribedCount` como opcionais ao tipo `CampaignAnalytics`
  - [x] 2.2 `campaignStatus` deve ser `number | undefined` (a API retorna numérico: 0=Draft, 1=Active, 2=Paused, 3=Completed)

- [x] Task 3: Expandir `LeadTracking` em `src/types/tracking.ts` (AC: #5)
  - [x] 3.1 Adicionar campos opcionais para step tracking: `emailOpenedStep`, `emailOpenedVariant`, `emailRepliedStep`, `emailRepliedVariant`, `emailClickedStep`, `emailClickedVariant`
  - [x] 3.2 Adicionar campos opcionais para último step: `lastStepId`, `lastStepFrom`, `lastStepTimestampExecuted`
  - [x] 3.3 Adicionar campos opcionais: `statusSummary`, `ltInterestStatus`, `espCode`, `esgCode`

- [x] Task 4: Atualizar `mapToLeadTracking()` em `src/lib/services/tracking.ts` (AC: #3)
  - [x] 4.1 Expandir o tipo do parâmetro `item` para aceitar os novos campos opcionais
  - [x] 4.2 Mapear snake_case da API para camelCase no retorno (ex: `email_opened_step` -> `emailOpenedStep`)
  - [x] 4.3 Campos novos devem usar `?? undefined` (não preencher com valores default falsos)

- [x] Task 5: Atualizar `mapToCampaignAnalytics()` em `src/lib/services/tracking.ts` (AC: #4)
  - [x] 5.1 Mapear `response.leads_count` -> `leadsCount`
  - [x] 5.2 Mapear `response.contacted_count` -> `contactedCount`
  - [x] 5.3 Mapear `response.campaign_status` -> `campaignStatus`
  - [x] 5.4 Mapear `response.unsubscribed_count` -> `unsubscribedCount`
  - [x] 5.5 Atualizar o fallback de resposta vazia em `getCampaignAnalytics()` para incluir os novos campos

- [x] Task 6: Atualizar mock factories em `__tests__/helpers/mock-data.ts` (AC: #7, #8)
  - [x] 6.1 Atualizar `createMockCampaignAnalytics()` com novos campos
  - [x] 6.2 Atualizar `createMockInstantlyAnalyticsResponse()` (já tem `leads_count`, `contacted_count`, `campaign_status`, `unsubscribed_count` no tipo `InstantlyAnalyticsResponse`)
  - [x] 6.3 Atualizar `createMockInstantlyLeadEntry()` com novos campos
  - [x] 6.4 Atualizar `createMockLeadTracking()` com novos campos

- [x] Task 7: Atualizar testes unitários (AC: #7, #8)
  - [x] 7.1 Em `__tests__/unit/types/tracking.test.ts`: adicionar assertions de tipo para novos campos em `CampaignAnalytics`, `LeadTracking`, `InstantlyLeadEntry`
  - [x] 7.2 Em `__tests__/unit/lib/services/tracking.test.ts`: testar que `mapToLeadTracking()` mapeia novos campos corretamente
  - [x] 7.3 Em `__tests__/unit/lib/services/tracking.test.ts`: testar que `mapToCampaignAnalytics()` mapeia `leadsCount`, `contactedCount`, `campaignStatus`, `unsubscribedCount`
  - [x] 7.4 Em `__tests__/unit/lib/services/tracking.test.ts`: testar que `mapToLeadTracking()` com lead sem novos campos retorna `undefined` (não quebra)
  - [x] 7.5 Em `__tests__/unit/lib/services/tracking.test.ts`: testar que `getCampaignAnalytics()` retorno vazio inclui novos campos como 0/undefined
  - [x] 7.6 Rodar `npx vitest run` e confirmar que TODOS os testes passam

## Dev Notes

### Contexto de Negócio

Esta story é a **fundação** do Epic 14 — todas as stories 14.2 a 14.5 dependem dos tipos e mapeamentos expandidos aqui. Não há alteração na UI. O objetivo é garantir que os dados da API Instantly que já são buscados (mas descartados no mapeamento) passem a ser preservados nos tipos TypeScript.

### Arquitetura e Padrões Obrigatórios

- **Service layer:** `TrackingService` em `src/lib/services/tracking.ts` estende `ExternalService` (base class com timeout 10s + 1 retry)
- **Pure functions:** `mapToCampaignAnalytics()` e `mapToLeadTracking()` são funções puras (sem side effects) — manter assim
- **Tipos:** Definidos em `src/types/tracking.ts`, barrel export via `src/types/index.ts`
- **Mapeamento snake_case -> camelCase:** Padrão já estabelecido (API usa snake_case, tipos internos usam camelCase)
- **Campos opcionais:** Novos campos em `LeadTracking` DEVEM ser opcionais (`?`) para não quebrar consumidores existentes (`OpportunityLead`, `LeadTrackingTable`, hooks, API routes)
- **Zero UI changes:** AC #6 é explícito — esta story NÃO toca em componentes React

### Mapeamento de Campos — API Instantly -> Tipos Internos

#### InstantlyLeadEntry (novos campos da API `POST /api/v2/leads/list`)

| Campo API (snake_case)         | Tipo             | Valores possíveis                                                                 |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------------- |
| `esp_code`                     | `string?`        | Google, Microsoft, Zoho, AirMail, Yahoo, Yandex, Web.de, Libero.it, Other, Not Found |
| `esg_code`                     | `string?`        | Barracuda, Mimecast, Proofpoint, Cisco (ou null)                                  |
| `email_opened_step`            | `number?`        | Step number (1, 2, 3...)                                                          |
| `email_opened_variant`         | `number?`        | Variant number                                                                    |
| `email_replied_step`           | `number?`        | Step number                                                                       |
| `email_replied_variant`        | `number?`        | Variant number                                                                    |
| `email_clicked_step`           | `number?`        | Step number                                                                       |
| `email_clicked_variant`        | `number?`        | Variant number                                                                    |
| `last_step_id`                 | `string?`        | UUID do step                                                                      |
| `last_step_from`               | `string?`        | Email account used                                                                |
| `last_step_timestamp_executed` | `string?`        | ISO timestamp                                                                     |
| `status_summary`               | `string?`        | Completed, Email opened, Bounced, Reply received, etc.                            |
| `lt_interest_status`           | `string?`        | Interest level indicator                                                          |

#### CampaignAnalytics (novos campos de `GET /api/v2/campaigns/analytics`)

| Campo API                | Campo Interno      | Nota                                                     |
| ------------------------ | ------------------ | --------------------------------------------------------- |
| `leads_count`            | `leadsCount`       | Já existe no `InstantlyAnalyticsResponse` — só não era mapeado |
| `contacted_count`        | `contactedCount`   | Já existe no `InstantlyAnalyticsResponse` — só não era mapeado |
| `campaign_status`        | `campaignStatus`   | Já existe no `InstantlyAnalyticsResponse` (number: 0-3)        |
| `unsubscribed_count`     | `unsubscribedCount`| Já existe no `InstantlyAnalyticsResponse` — só não era mapeado |

**Importante:** `InstantlyAnalyticsResponse` já tem os 4 campos (`leads_count`, `contacted_count`, `campaign_status`, `unsubscribed_count`) — eles simplesmente não são mapeados em `mapToCampaignAnalytics()`. A task é adicionar os campos em `CampaignAnalytics` e mapear.

#### LeadTracking (novos campos mapeados de InstantlyLeadEntry)

| Campo em LeadTracking          | Fonte em InstantlyLeadEntry    |
| ------------------------------ | ------------------------------ |
| `espCode?`                     | `esp_code`                     |
| `esgCode?`                     | `esg_code`                     |
| `emailOpenedStep?`             | `email_opened_step`            |
| `emailOpenedVariant?`          | `email_opened_variant`         |
| `emailRepliedStep?`            | `email_replied_step`           |
| `emailRepliedVariant?`         | `email_replied_variant`        |
| `emailClickedStep?`            | `email_clicked_step`           |
| `emailClickedVariant?`         | `email_clicked_variant`        |
| `lastStepId?`                  | `last_step_id`                 |
| `lastStepFrom?`                | `last_step_from`               |
| `lastStepTimestampExecuted?`   | `last_step_timestamp_executed` |
| `statusSummary?`               | `status_summary`               |
| `ltInterestStatus?`            | `lt_interest_status`           |

### Arquivos a Modificar

| Arquivo                                              | Modificação                                              |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `src/types/tracking.ts`                              | Expandir `InstantlyLeadEntry`, `CampaignAnalytics`, `LeadTracking` |
| `src/lib/services/tracking.ts`                       | Atualizar `mapToLeadTracking()`, `mapToCampaignAnalytics()`, fallback em `getCampaignAnalytics()` |
| `__tests__/helpers/mock-data.ts`                     | Atualizar mock factories                                 |
| `__tests__/unit/types/tracking.test.ts`              | Adicionar type assertions                                |
| `__tests__/unit/lib/services/tracking.test.ts`       | Testar novos mapeamentos                                 |

### Arquivos que NÃO devem ser tocados

- `src/components/tracking/*` — sem mudanças de UI (AC #6)
- `src/hooks/use-campaign-analytics.ts` — hooks consomem `CampaignAnalytics` que é retrocompatível
- `src/hooks/use-lead-tracking.ts` — hooks consomem `LeadTracking` que é retrocompatível
- `src/app/api/campaigns/[campaignId]/*` — API routes passam dados through, campos opcionais não quebram

### Armadilhas e Guardrails

1. **NÃO adicionar valores default falsos para novos campos em `mapToLeadTracking()`** — se a API não retornar `esp_code`, o campo deve ser `undefined`, não `""` ou `"Not Found"`. Isso permite que a UI diferencie "sem dado" de "valor real".
2. **NÃO alterar o `InstantlyAnalyticsResponse`** — este tipo já tem `leads_count`, `contacted_count`, `campaign_status`, `unsubscribed_count`. Só precisa mapear no `mapToCampaignAnalytics()`.
3. **Manter `campaignStatus` como `number`** — a conversão para enum legível (Active, Paused, etc.) será feita na Story 14.2 na camada de UI.
4. **Testes existentes NÃO podem quebrar** — os mock factories devem fornecer valores default para novos campos, mas os testes antigos que não usam esses campos devem continuar passando.
5. **`OpportunityLead extends LeadTracking`** — novos campos opcionais em `LeadTracking` são automaticamente herdados. Não precisa de alteração em `OpportunityLead`.
6. **Barrel export** — se adicionar novos tipos/enums, garantir que sejam exportados via `src/types/index.ts`.

### Padrões de Teste Existentes

- **Mock fetch centralizado:** `createMockFetch()` de `__tests__/test-utils/mock-fetch.ts`
- **Mock factories:** `createMockCampaignAnalytics()`, `createMockLeadTracking()`, `createMockInstantlyLeadEntry()`, `createMockInstantlyAnalyticsResponse()` em `__tests__/helpers/mock-data.ts`
- **Type assertions:** Verificar presença de campos, tipos de valores, readonly arrays
- **Defensive mapping tests:** Verificar comportamento com campos ausentes (`undefined`), nulos, e presentes
- **ESLint no-console:** Não usar `console.log` no código de produção

### Previous Story Intelligence

**Epic 10 (Campaign Tracking) — Learnings relevantes:**
- Research completa da API antes de implementar elimina surpresas
- `TrackingService` é separado de `InstantlyService` por SRP (read-only vs deployment)
- Mocks resilientes do Cleanup Sprint 2 habilitam testes rápidos
- UUID validation obrigatória em API routes (não se aplica aqui — sem API route changes)
- `enabled` option em hooks TanStack Query (não se aplica aqui — sem hook changes)

**Epic 13 (Lead Monitoring) — Commits recentes:**
- Epic 13 completou todas as stories (13.1-13.10) com sucesso
- Padrão de story: feat(story-X.Y): descrição + code review fixes
- Stories de Epic 13 construíram em cima do Epic 10 (tracking) e Epic 11 (WhatsApp)

### Git Intelligence

Últimos commits são todos do Epic 13 (lead monitoring/insights). O Epic 14 inicia um novo domínio (analytics avançado) que constrói sobre a infraestrutura do Epic 10.

Branch atual: `epic/12-melhorias-ux-produtividade` — o dev precisará criar branch `epic/14-analytics-avancado-campanha` a partir da main (ou da branch atual se Epic 12 já foi merged).

### Project Structure Notes

- Alinhamento total com estrutura existente — todos os arquivos a modificar já existem
- Sem novos arquivos a criar — apenas expansão de tipos e mapeamentos existentes
- Sem conflitos detectados — campos novos são todos opcionais

### References

- [Source: _bmad-output/planning-artifacts/epic-14-analytics-avancado-campanha.md#Story 14.1]
- [Source: src/types/tracking.ts#L121-L133] — CampaignAnalytics atual
- [Source: src/types/tracking.ts#L139-L155] — LeadTracking atual
- [Source: src/types/tracking.ts#L226-L241] — InstantlyAnalyticsResponse (já tem campos não mapeados)
- [Source: src/types/tracking.ts#L259-L273] — InstantlyLeadEntry atual
- [Source: src/lib/services/tracking.ts#L58-L77] — mapToCampaignAnalytics() atual
- [Source: src/lib/services/tracking.ts#L86-L102] — mapToLeadTracking() atual
- [Source: src/lib/services/tracking.ts#L120-L155] — getCampaignAnalytics() com fallback vazio
- [Source: _bmad-output/planning-artifacts/architecture.md] — Padrões de arquitetura
- [Source: _bmad-output/implementation-artifacts/epic-10-retro-2026-02-10.md] — Retrospectiva Epic 10

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Full test suite: 276 passed, 1 pre-existing flaky (monitoring-utils timing race condition)
- Tracking tests: 51/51 passed (2 files, 0 failures)

### Completion Notes List
- Task 1-3: Expanded `InstantlyLeadEntry` (+13 fields), `CampaignAnalytics` (+4 fields), `LeadTracking` (+13 fields) in `src/types/tracking.ts`. All new fields optional (`?`) for backward compatibility.
- Task 4: Updated `mapToLeadTracking()` parameter type and return mapping. All 13 new fields mapped snake_case -> camelCase with `?? undefined` (no false defaults per AC).
- Task 5: Updated `mapToCampaignAnalytics()` to map `leads_count`, `contacted_count`, `campaign_status`, `unsubscribed_count`. Updated empty response fallback in `getCampaignAnalytics()`.
- Task 6: Updated 3 mock factories (`createMockCampaignAnalytics`, `createMockLeadTracking`, `createMockInstantlyLeadEntry`). `createMockInstantlyAnalyticsResponse` already had the 4 fields — confirmed no change needed.
- Task 7: Added 7 new test cases: type assertions for CampaignAnalytics (2), InstantlyLeadEntry (2), LeadTracking (1), mapToLeadTracking new fields (1), mapToLeadTracking missing fields (1), mapToCampaignAnalytics new fields (1), getCampaignAnalytics empty response new fields (1).
- Zero UI changes (AC #6 satisfied).
- No new files created — only expanded existing types, mappings, and tests.

### Change Log
- 2026-03-23: Story 14.1 implementation complete — expanded types, mappings, mock factories, and tests
- 2026-03-23: Code review fixes applied:
  - [M2] Replaced inline type in `mapToLeadTracking()` with `Partial<InstantlyLeadEntry> & Pick<InstantlyLeadEntry, "email">` to prevent type drift
  - [M3] Removed redundant `?? undefined` from `mapToCampaignAnalytics()` for required `InstantlyAnalyticsResponse` fields
  - [M4] Removed explicit `undefined` assignments from mock factories (`createMockInstantlyLeadEntry`, `createMockLeadTracking`)
  - [L1] Updated File List to include `sprint-status.yaml`
  - [L2] Fixed pre-existing bug: `mapToLeadTracking()` now maps `item.id → leadId`; added `leadId` to `createMockLeadTracking` mock and test assertions

### File List
- src/types/tracking.ts (modified — expanded InstantlyLeadEntry, CampaignAnalytics, LeadTracking)
- src/lib/services/tracking.ts (modified — updated mapToLeadTracking, mapToCampaignAnalytics, getCampaignAnalytics fallback; code review: refactored inline type, removed redundant ??, added leadId mapping)
- __tests__/helpers/mock-data.ts (modified — updated createMockCampaignAnalytics, createMockLeadTracking, createMockInstantlyLeadEntry; code review: removed explicit undefined, added leadId)
- __tests__/unit/types/tracking.test.ts (modified — added 5 type assertion tests for Story 14.1 fields)
- __tests__/unit/lib/services/tracking.test.ts (modified — added 4 mapping tests for Story 14.1 fields; code review: added leadId assertions)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — story status tracking)
