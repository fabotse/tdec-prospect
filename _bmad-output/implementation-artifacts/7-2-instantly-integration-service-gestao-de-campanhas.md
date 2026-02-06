# Story 7.2: Instantly Integration Service - Gestão de Campanhas

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor,
I want expandir o `InstantlyService` com métodos de gestão de campanhas,
So that o sistema possa criar campanhas e enviar leads para o Instantly via API.

## Acceptance Criteria

1. **Given** a API key do Instantly está configurada
   **When** o `InstantlyService` é chamado
   **Then** utiliza a API key encriptada do tenant
   **And** requests são proxied via API routes
   **And** erros são capturados e traduzidos para português
   **And** timeout de 10 segundos com 1 retry
   (AC: #1)

2. **Given** o service é chamado para criar campanha
   **When** `createCampaign(name, sequences)` é invocado
   **Then** cria uma campanha no Instantly via API v2
   **And** configura a sequência de emails com delays
   **And** mapeia variáveis internas para custom variables do Instantly
   **And** retorna o `campaignId` criado
   (AC: #2)

3. **Given** o service é chamado para adicionar leads
   **When** `addLeadsToCampaign(campaignId, leads)` é invocado
   **Then** envia leads em batches (máx. 1000 por request)
   **And** cada lead inclui: email, first_name, company_name, custom variables (ice_breaker, etc.)
   **And** retorna contagem de leads adicionados com sucesso
   (AC: #3)

4. **Given** o service é chamado para obter status
   **When** `getCampaignStatus(campaignId)` é invocado
   **Then** retorna status atual da campanha no Instantly
   (AC: #4)

## Tasks / Subtasks

- [x] Task 1: Criar tipos da API Instantly (AC: #1, #2, #3, #4)
  - [x] 1.1 Criar `src/types/instantly.ts` com interfaces para request/response de todos os endpoints
  - [x] 1.2 Definir `InstantlyCampaignSchedule`, `InstantlySequenceStep`, `InstantlyVariant` (estrutura de criação de campanha)
  - [x] 1.3 Definir `CreateCampaignRequest`, `CreateCampaignResponse` (POST /api/v2/campaigns)
  - [x] 1.4 Definir `BulkAddLeadsRequest`, `BulkAddLeadsResponse`, `InstantlyLead` (POST /api/v2/leads/add)
  - [x] 1.5 Definir `InstantlyCampaignStatus` enum (0=Draft, 1=Active, 2=Paused, 3=Completed, etc.)
  - [x] 1.6 Definir `ActivateCampaignResponse`, `GetCampaignResponse` (para activate e get status)
  - [x] 1.7 Criar testes de tipo em `__tests__/unit/types/instantly.test.ts`

- [x] Task 2: Expandir InstantlyService com createCampaign (AC: #2)
  - [x] 2.1 Adicionar método `createCampaign(params: CreateCampaignParams): Promise<CreateCampaignResult>` ao `InstantlyService`
  - [x] 2.2 Implementar mapeamento: EmailBlock[] + DelayBlock[] → sequences[0].steps[] (cada EmailBlock = 1 step com 1 variant)
  - [x] 2.3 Implementar conversão de delay: horas do builder → dias para o Instantly (`Math.ceil(hours / 24)`, mínimo 1 dia)
  - [x] 2.4 Gerar `campaign_schedule` com defaults razoáveis (horário comercial 09-17, seg-sex, timezone América/São_Paulo)
  - [x] 2.5 Campanha criada em status Draft (0) — não ativar automaticamente
  - [x] 2.6 Retornar `{ campaignId, name, status }` com dados da response

- [x] Task 3: Expandir InstantlyService com addLeadsToCampaign (AC: #3)
  - [x] 3.1 Adicionar método `addLeadsToCampaign(params: AddLeadsParams): Promise<AddLeadsResult>`
  - [x] 3.2 Implementar batching: dividir array de leads em chunks de 1000
  - [x] 3.3 Para cada lead, mapear campos internos → campos Instantly:
    - `lead.firstName` → `first_name` (campo nativo)
    - `lead.lastName` → `last_name` (campo nativo)
    - `lead.companyName` → `company_name` (campo nativo)
    - `lead.email` → `email` (campo nativo, obrigatório)
    - `lead.title` → `custom_variables.title`
    - `lead.icebreaker` → `custom_variables.ice_breaker`
  - [x] 3.4 Configurar flags: `skip_if_in_campaign: true`, `verify_leads_on_import: false`
  - [x] 3.5 Agregar resultados de múltiplos batches: total uploaded, duplicates, errors
  - [x] 3.6 Retornar `{ leadsUploaded, duplicatedLeads, invalidEmails, remainingInPlan }`

- [x] Task 4: Expandir InstantlyService com activateCampaign e getCampaignStatus (AC: #4)
  - [x] 4.1 Adicionar método `activateCampaign(campaignId: string): Promise<ActivateResult>`
  - [x] 4.2 Adicionar método `getCampaignStatus(campaignId: string): Promise<CampaignStatusResult>`
  - [x] 4.3 Mapear status numérico para label em português (0=Rascunho, 1=Ativa, 2=Pausada, 3=Concluída)

- [x] Task 5: Criar API routes Next.js para proxy dos requests (AC: #1)
  - [x] 5.1 Criar `src/app/api/instantly/campaign/route.ts` — POST handler para criar campanha
  - [x] 5.2 Criar `src/app/api/instantly/campaign/[id]/route.ts` — GET handler para status da campanha
  - [x] 5.3 Criar `src/app/api/instantly/campaign/[id]/activate/route.ts` — POST handler para ativar campanha
  - [x] 5.4 Criar `src/app/api/instantly/leads/route.ts` — POST handler para adicionar leads
  - [x] 5.5 Cada route: extrair API key do tenant (via Supabase auth), validar inputs, chamar Instantly API, retornar resultado
  - [x] 5.6 Implementar rate limiting defensivo: delay de 150ms entre requests ao Instantly (margem de segurança para 10 req/s)

- [x] Task 6: Testes completos (AC: #1, #2, #3, #4)
  - [x] 6.1 Expandir `__tests__/unit/lib/services/instantly.test.ts` com testes para todos novos métodos
  - [x] 6.2 Criar `__tests__/unit/api/instantly-campaign.test.ts` — testes das API routes
  - [x] 6.3 Criar `__tests__/unit/api/instantly-leads.test.ts` — testes do bulk add leads
  - [x] 6.4 Testes de batching: verificar split correto em chunks de 1000, agregação de resultados
  - [x] 6.5 Testes de mapeamento: verificar conversão lead interno → InstantlyLead com custom_variables
  - [x] 6.6 Testes de erro: 401 (unauthorized), 429 (rate limit), 500 (server error), timeout, network error
  - [x] 6.7 Testes de edge cases: leads sem email (filtrar), leads sem icebreaker (custom_variables parciais), campanha sem delays

## Dev Notes

### Contexto Crítico do Codebase

**InstantlyService existente** (`src/lib/services/instantly.ts`):
- Classe que extends `ExternalService` (base class em `src/lib/services/base-service.ts`)
- Apenas `testConnection(apiKey)` implementado — retorna sucesso/falha com latência
- Usa Bearer token authentication: `Authorization: Bearer <API_KEY>`
- Base URL: `https://api.instantly.ai`
- Endpoint atual: `/api/v2/accounts`

**ExternalService base class** (`src/lib/services/base-service.ts`):
- Método protegido `request<T>(url, options)` — faz fetch com 10s timeout e 1 retry
- Método protegido `handleError(error)` — converte erros para `ExternalServiceError` com mensagem PT-BR
- Mensagens de erro pré-definidas: `TIMEOUT`, `NETWORK_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `INSTANTLY_ERROR`
- Helper methods: `createSuccessResult()`, `createErrorResult()`
- **IMPORTANTE**: O método `request()` já implementa timeout de 10s e retry 1x — NÃO reimplementar

**Variable Registry existente** (`src/lib/export/variable-registry.ts` — Story 7.1):
- Mapeamento completo de variáveis por plataforma já definido
- Instantly: `first_name` → `{{first_name}}`, `company_name` → `{{company_name}}`, `title` → `{{title}}`, `ice_breaker` → `{{ice_breaker}}`
- Campos nativos do Instantly (não precisam de custom_variables): `first_name`, `last_name`, `company_name`
- Campos que VÃO em custom_variables: `title`, `ice_breaker`

**A AI NÃO passa dados do lead para geração** — Emails gerados pelo Wizard SEMPRE contêm variáveis (`{{first_name}}`, etc.) em vez de dados reais. A resolução é feita on-demand no preview e no export. O service aqui NÃO precisa resolver variáveis — os emails já contêm as tags `{{variable}}` que o Instantly reconhece nativamente.

### API Instantly v2 — Referência Rápida

**Fonte:** [Pesquisa Técnica 2026-02-06](../_bmad-output/planning-artifacts/research/technical-instantly-snovio-api-integration-research-2026-02-06.md)

**Autenticação:**
- Header: `Authorization: Bearer <API_KEY>`
- Content-Type: `application/json`
- Base URL: `https://api.instantly.ai`

**Rate Limits:**
- 10 requests por segundo (compartilhado v1+v2, todo workspace)
- HTTP 429 ao exceder

**Endpoints utilizados nesta story:**

| Ação | Método | Endpoint | Max Batch |
|------|--------|----------|-----------|
| Criar campanha | POST | `/api/v2/campaigns` | N/A |
| Obter campanha | GET | `/api/v2/campaigns/{id}` | N/A |
| Ativar campanha | POST | `/api/v2/campaigns/{id}/activate` | N/A |
| Adicionar leads (bulk) | POST | `/api/v2/leads/add` | 1000 leads/req |

**Estrutura de Sequences/Steps:**
```
sequences (array — usar apenas 1 elemento)
  └── steps (array de email steps)
       ├── step[0]: { type: "email", delay: 0, variants: [{ subject, body }] }
       ├── step[1]: { type: "email", delay: 3, variants: [{ subject, body }] }
       └── step[2]: { type: "email", delay: 5, variants: [{ subject, body }] }
```

**Mapeamento Builder → Instantly:**
- Cada `EmailBlock` → 1 step com 1 variant (subject + body)
- Cada `DelayBlock` → campo `delay` do step SEGUINTE (converter horas → dias)
- `step[0].delay` = SEMPRE 0 (primeiro email, sem delay)
- `step[N].delay` = dias até este email ser enviado APÓS o anterior

**Custom Variables no Lead:**
- Campos nativos: `email` (required), `first_name`, `last_name`, `company_name`, `phone`
- Custom: `custom_variables: { ice_breaker: "...", title: "..." }` — flat object, valores string|number|boolean|null
- Os templates de email referenciam via `{{variable_name}}`

**Campaign Status Enum:**
| Valor | Status | Label PT-BR |
|-------|--------|-------------|
| 0 | Draft | Rascunho |
| 1 | Active | Ativa |
| 2 | Paused | Pausada |
| 3 | Completed | Concluída |
| 4 | Running Subsequences | Executando subsequências |
| -99 | Account Suspended | Conta suspensa |
| -1 | Accounts Unhealthy | Contas com problema |
| -2 | Bounce Protect | Proteção de bounce |

**Response do Bulk Add Leads (campos importantes):**
```json
{
  "status": "success",
  "leads_uploaded": 2,
  "duplicated_leads": 0,
  "invalid_email_count": 0,
  "remaining_in_plan": 9998,
  "created_leads": [{ "id": "...", "email": "...", "index": 0 }]
}
```

### Learnings da Story 7.1

**Padrões estabelecidos:**
1. **Dois sistemas de `{{variáveis}}`**: Não confundir prompt variables (input para AI via PromptManager) com email output variables (personalização). Esta story lida APENAS com email output — as tags `{{first_name}}`, `{{ice_breaker}}` nos emails são passadas diretamente para o Instantly, que as interpreta nativamente
2. **Variable Registry**: O registry em `src/lib/export/variable-registry.ts` já contém todos os mapeamentos por plataforma — usar `getPlatformMapping('instantly')` quando necessário
3. **Export barrel file**: Usar imports via `src/lib/export/index.ts`
4. **Testing pattern**: Vitest com `vi.hoisted()` para setup, mock fetch centralizado

**Code Review learnings (7.1):**
- H1: Não adicionar parâmetros desnecessários que criam footguns (ex: previewLead foi removido de FullGenerationParams)
- M2: Tipos files devem conter APENAS tipos — lógica/constantes vão em módulos de lógica
- M3: Criar barrel files para módulos com múltiplos exports

### Mapeamento de Campos Lead → InstantlyLead

```
Lead (interno)              → InstantlyLead (API v2)
─────────────────────────────────────────────────────
lead.email                  → email (REQUIRED, nativo)
lead.firstName              → first_name (nativo)
lead.lastName               → last_name (nativo)
lead.companyName            → company_name (nativo)
lead.phone                  → phone (nativo, opcional)
lead.title                  → custom_variables.title
lead.icebreaker             → custom_variables.ice_breaker
```

**NOTA**: `first_name`, `last_name`, `company_name` são campos NATIVOS do lead no Instantly — NÃO colocar em `custom_variables`. Apenas `title` e `ice_breaker` vão como custom variables.

### Builder Store — Estrutura de Blocos

```typescript
// src/stores/use-builder-store.ts
interface BuilderState {
  blocks: Block[];  // Array ordenado de EmailBlock e DelayBlock
  // ...
}

type Block = EmailBlock | DelayBlock;

interface EmailBlock {
  id: string;
  type: 'email';
  data: {
    subject: string;   // "Olá {{first_name}}, ..."
    body: string;       // "{{ice_breaker}}\n\nNa {{company_name}}..."
  };
}

interface DelayBlock {
  id: string;
  type: 'delay';
  data: {
    hours: number;     // 24, 48, 72, 96, 120 (em horas)
  };
}
```

**Conversão blocks → Instantly steps:**
1. Filtrar apenas EmailBlocks
2. Para cada EmailBlock, pegar o DelayBlock ANTERIOR (se existir)
3. Converter delay horas → dias: `Math.ceil(hours / 24)` (mínimo 1 dia)
4. Primeiro email sempre tem delay = 0

### Padrão de API Routes Existente

O projeto usa API routes Next.js como proxy para APIs externas. Padrão observado em routes existentes:
1. Extrair API key do tenant via Supabase auth
2. Validar inputs do request body
3. Chamar serviço externo
4. Retornar resultado como JSON

**NOTA**: As API routes para Instantly são NOVAS — não existem routes Instantly no projeto ainda (apenas o service direto). Seguir o padrão das routes existentes em `src/app/api/`.

### Decisões de Design

1. **NÃO resolver variáveis**: Os emails do builder já contêm `{{first_name}}`, `{{ice_breaker}}`, etc. O Instantly reconhece essas tags nativamente. O service deve passar os emails AS-IS para a API.

2. **Campaign Schedule defaults**: Usar horário comercial brasileiro (09:00-17:00, seg-sex, America/Sao_Paulo). Esses defaults podem ser customizados na Story 7.4 (Export Dialog UI) posteriormente.

3. **Batching transparente**: O `addLeadsToCampaign` deve fazer batching internamente (chunks de 1000) e retornar resultado agregado. O caller não precisa saber sobre batching.

4. **Campanha em Draft**: `createCampaign` cria em status Draft. A ativação é um método separado (`activateCampaign`) — permite ao caller fazer: create → add leads → activate em sequência.

5. **Rate limiting defensivo**: Adicionar delay de 150ms entre requests ao Instantly para ficar abaixo do limite de 10 req/s com margem de segurança.

### Project Structure Notes

**Arquivos novos seguem padrões existentes:**
- `src/types/instantly.ts` — tipos no padrão do projeto (PascalCase interfaces)
- `src/app/api/instantly/campaign/route.ts` — padrão Next.js App Router
- `src/app/api/instantly/campaign/[id]/route.ts` — dynamic route padrão
- `src/app/api/instantly/campaign/[id]/activate/route.ts` — nested route
- `src/app/api/instantly/leads/route.ts` — padrão Next.js

**Modificados:**
- `src/lib/services/instantly.ts` — expandir classe existente (NÃO criar novo arquivo)

**Sem conflitos** com estrutura existente. O diretório `src/app/api/instantly/` é novo.

### Testing Requirements

**Framework**: Vitest (projeto usa Vitest, NÃO Jest)
**Mock Fetch**: Usar `createMockFetch` de `__tests__/test-utils/mock-fetch.ts` — helper centralizado (Cleanup Sprint 2)
**Mock Supabase**: Usar `createMockSupabase` de `__tests__/test-utils/mock-supabase.ts` — para testes de API routes com auth
**ESLint**: `no-console` rule ativa — NÃO usar console.log/warn/error

**Testes obrigatórios:**

| Arquivo de Teste | Escopo |
|-----------------|--------|
| `__tests__/unit/types/instantly.test.ts` | Testes de tipo (type-level assertions) |
| `__tests__/unit/lib/services/instantly.test.ts` | Expandir com testes de createCampaign, addLeadsToCampaign, activateCampaign, getCampaignStatus |
| `__tests__/unit/app/api/instantly/campaign/route.test.ts` | Testes da API route de criar campanha |
| `__tests__/unit/app/api/instantly/campaign/[id]/route.test.ts` | Testes da API route de get status |
| `__tests__/unit/app/api/instantly/campaign/[id]/activate/route.test.ts` | Testes da API route de ativar |
| `__tests__/unit/app/api/instantly/leads/route.test.ts` | Testes da API route de bulk add leads |

**Cenários de teste críticos:**
- Criar campanha com 1 email, 2 emails, 3+ emails (sequência completa)
- Batching: 999 leads (1 batch), 1000 leads (1 batch), 1001 leads (2 batches), 2500 leads (3 batches)
- Mapeamento: lead com todos campos → verify native fields + custom_variables separados
- Lead sem email → deve ser filtrado antes do envio
- Lead sem icebreaker → custom_variables sem ice_breaker (parcial)
- Erro 401 → mensagem "API key inválida ou expirada."
- Erro 429 → mensagem "Limite de requisições atingido."
- Timeout → mensagem "Tempo limite excedido."
- Delay conversion: 24h→1dia, 48h→2dias, 72h→3dias, 36h→2dias (ceil)

### Architecture Compliance

- **Naming**: Arquivos utility em kebab-case (`base-service.ts`, `instantly.ts`)
- **Types**: PascalCase para interfaces (`CreateCampaignRequest`, `BulkAddLeadsResponse`)
- **Functions/Methods**: camelCase (`createCampaign`, `addLeadsToCampaign`, `getCampaignStatus`)
- **Constants**: SCREAMING_SNAKE para constantes (`INSTANTLY_API_BASE`, `MAX_LEADS_PER_BATCH`)
- **Errors**: Mensagens em português brasileiro
- **Exports**: Named exports (não default)
- **Service extends ExternalService**: Usar `this.request<T>()` para fazer fetch (já tem timeout+retry)

### Library / Framework Requirements

- **Sem novas dependências** — Esta story usa TypeScript puro + fetch API + ExternalService base
- **Vitest** para testes (já instalado)
- **Next.js App Router** para API routes (já instalado)

### Git Intelligence Summary

**Branch atual**: `epic/7-campaign-deployment-export`
**Último commit**: `9c3a495 feat(story-7.1): personalization variable system for export with code review fixes`
**Branch base para PR**: `main`

**Commits recentes relevantes:**
- `9c3a495 feat(story-7.1)` — sistema de variáveis de personalização, variable-registry, resolve-variables
- `ecc8de7 chore(epic-7)` — inicialização da branch epic
- `49bd93b feat(cleanup-sprint-2)` — mock infrastructure centralizada (mock-fetch, mock-supabase)
- `cfe6ecc feat(story-9.6)` — prompts unificados com variáveis

### References

- [Source: _bmad-output/planning-artifacts/epic-7-campaign-deployment-export.md#Story 7.2]
- [Source: _bmad-output/planning-artifacts/research/technical-instantly-snovio-api-integration-research-2026-02-06.md]
- [Source: _bmad-output/planning-artifacts/architecture.md#External API Service Pattern]
- [Source: src/lib/services/instantly.ts — InstantlyService com testConnection()]
- [Source: src/lib/services/base-service.ts — ExternalService base class]
- [Source: src/lib/export/variable-registry.ts — Platform mappings Instantly]
- [Source: src/types/export.ts — ExportPlatform, PersonalizationVariable]
- [Source: _bmad-output/implementation-artifacts/7-1-sistema-de-variaveis-de-personalizacao-para-exportacao.md — Story anterior completa]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- API route mock pattern: `createChainBuilder` de `helpers/mock-supabase.ts` funciona; mock manual com `then` thenable falha em vitest
- Batching tests com `vi.useFakeTimers()` para rate limiting delay de 150ms

### Completion Notes List

- ✅ Task 1: Criado `src/types/instantly.ts` com 18 interfaces/types, enum `InstantlyCampaignStatus`, constantes `MAX_LEADS_PER_BATCH` e `INSTANTLY_CAMPAIGN_STATUS_LABELS`. 22 type-level tests passando.
- ✅ Task 2: `createCampaign()` implementado — aceita sequences com delay em dias, gera campaign_schedule com defaults brasileiros (09-17 seg-sex America/Sao_Paulo), cria campanha em Draft (status 0). Template variables preservadas (sem resolução).
- ✅ Task 3: `addLeadsToCampaign()` implementado — batching automático em chunks de 1000, mapeamento native fields (first_name, last_name, company_name) vs custom_variables (title, ice_breaker), filtragem de leads sem email, flags `skip_if_in_campaign: true` / `verify_leads_on_import: false`, rate limiting 150ms entre batches.
- ✅ Task 4: `activateCampaign()` e `getCampaignStatus()` implementados — status numérico mapeado para label PT-BR via `INSTANTLY_CAMPAIGN_STATUS_LABELS`, status desconhecido retorna "Desconhecido".
- ✅ Task 5: 4 API routes criadas — POST /api/instantly/campaign, GET /api/instantly/campaign/[id], POST /api/instantly/campaign/[id]/activate, POST /api/instantly/leads. Todas com auth via tenant, validação de inputs, error handling com ExternalServiceError.
- ✅ Task 6: 84 testes no total da story (22 types + 38 service + 24 API routes). Cobertura de batching (999/1000/1001/2500), mapeamento, erros (401/429/500), edge cases (sem email, sem icebreaker).
- ✅ Regressão completa: 190 test files, 3391 testes passando, 0 falhas.

### Code Review Record

**Reviewer:** Claude Opus 4.6 (Adversarial Code Review)
**Date:** 2026-02-06
**Findings:** 9 total (3 HIGH, 5 MEDIUM, 1 LOW)
**Disposition:** All HIGH and MEDIUM auto-fixed; LOW accepted

**Findings Applied:**

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| H1 | HIGH | Constants (`MAX_LEADS_PER_BATCH`, `INSTANTLY_CAMPAIGN_STATUS_LABELS`) in types file violates 7.1 M2 lesson | Moved constants to `instantly.ts` service, types file now contains only types |
| H2 | HIGH | `createCampaign` doesn't enforce `step[0].delay === 0` | Added `index === 0 ? 0 : seq.delayDays` guard in step mapping |
| H3 | HIGH | Partial batch failure in `addLeadsToCampaign` loses data silently | Added try/catch per batch with `partialResults` in error details |
| M1 | MEDIUM | Inconsistent method signatures (params object vs individual args) | Changed `activateCampaign` and `getCampaignStatus` to accept params objects (`ActivateCampaignParams`, `GetCampaignStatusParams`) |
| M2 | MEDIUM | Campaign route missing sequence entry validation | Added `subject`, `body`, `delayDays` validation returning 400 |
| M3 | MEDIUM | No test asserting 150ms rate limiting delay value | Added test verifying `setTimeout` called with 150ms between batches |
| M4 | MEDIUM | `remainingInPlan: 0` misleading when no API call made | Changed init to `remainingInPlan: -1` for "unknown" state |
| M5 | MEDIUM | Missing generic 500 error test for 3 of 4 API routes | Added 500 error tests to campaign, campaign-status, campaign-activate routes |
| L1 | LOW | Two separate import statements from same module | Consolidated to single import (accepted, cosmetic) |

**Post-review stats:** 95 story tests (was 84, +11 new), 190 files / 3402 tests full regression, 0 failures

### File List

**Novos:**
- `src/types/instantly.ts` — Tipos da API Instantly v2 (interfaces, enum, types only — no constants)
- `src/app/api/instantly/campaign/route.ts` — POST criar campanha (with sequence entry validation)
- `src/app/api/instantly/campaign/[id]/route.ts` — GET status campanha (params object signature)
- `src/app/api/instantly/campaign/[id]/activate/route.ts` — POST ativar campanha (params object signature)
- `src/app/api/instantly/leads/route.ts` — POST bulk add leads
- `__tests__/unit/types/instantly.test.ts` — 21 testes de tipo (constants moved to service)
- `__tests__/unit/api/instantly-campaign.test.ts` — 10 testes da route criar campanha (+3 validation, +1 500 error)
- `__tests__/unit/api/instantly-campaign-status.test.ts` — 6 testes da route status (+1 ExternalServiceError, +1 500 error)
- `__tests__/unit/api/instantly-campaign-activate.test.ts` — 6 testes da route ativar (+1 500 error)
- `__tests__/unit/api/instantly-leads.test.ts` — 8 testes da route leads

**Modificados:**
- `src/lib/services/instantly.ts` — Expandido com createCampaign, addLeadsToCampaign, activateCampaign, getCampaignStatus. Constants moved here from types (H1). Partial batch error handling (H3). First step delay guard (H2). Params object signatures (M1).
- `__tests__/unit/lib/services/instantly.test.ts` — Expandido de 8 para 44 testes (+constants, +H2 delay guard, +H3 partial batch, +M3 rate limit timing, +M1 params objects)

## Change Log

- 2026-02-06: Story 7.2 implementada — InstantlyService expandido com gestão de campanhas (createCampaign, addLeadsToCampaign, activateCampaign, getCampaignStatus), 4 API routes Next.js como proxy, 84 testes passando
- 2026-02-06: Code review adversarial — 9 findings (3H, 5M, 1L). All HIGH/MEDIUM auto-fixed: constants moved from types to service (H1), first step delay guard (H2), partial batch error handling with details (H3), consistent params object signatures (M1), sequence entry validation (M2), rate limit timing test (M3), remainingInPlan=-1 init (M4), 500 error tests for 3 routes (M5). 95 story tests, 3402 full regression, 0 failures.
