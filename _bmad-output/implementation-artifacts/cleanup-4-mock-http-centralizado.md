# Story Cleanup-4: Padrão de Mock HTTP para APIs Externas — Helper Centralizado

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

Como desenvolvedor,
Quero um helper centralizado para mockar `global.fetch` com respostas por URL/pattern,
Para que novos testes de integração com APIs externas (Instantly, Snov.io na Epic 7) sigam um padrão consistente e os mocks existentes sejam mais legíveis e manuteníveis.

## Acceptance Criteria

1. **Given** um helper `createMockFetch()` é exportado de `__tests__/helpers/mock-fetch.ts`
   **When** chamado com configuração de respostas por URL pattern
   **Then** atribui `global.fetch` com um `vi.fn()` que despacha respostas baseado na URL
   **And** URLs não configuradas retornam `{ ok: false, status: 404, json: () => ({ error: "Not mocked" }) }` por padrão

2. **Given** `createMockFetch()` é configurado com respostas
   **When** código de produção chama `fetch("https://api.apollo.io/v1/people/search", ...)`
   **Then** o mock retorna a resposta configurada para esse URL pattern
   **And** o mock captura a request (url, method, body, headers) para assertions

3. **Given** helpers de resposta são fornecidos
   **When** usados para configurar mocks
   **Then** `mockJsonResponse(data, status?)` cria resposta JSON válida
   **And** `mockErrorResponse(status, message?)` cria resposta de erro
   **And** `mockNetworkError(message?)` cria rejeição de fetch (simula rede indisponível)

4. **Given** pelo menos 5 dos 15 arquivos que usam `global.fetch = vi.fn()` são refatorados
   **When** migrados para usar `createMockFetch()`
   **Then** o código de mock é mais curto e legível
   **And** todos os testes desses arquivos continuam passando

5. **Given** a suite completa é executada com `vitest run`
   **When** todos os testes são processados
   **Then** 0 testes devem falhar
   **And** a contagem total de testes passando deve ser >= 3188 (baseline atual)

## Tasks / Subtasks

- [x] Task 1: Criar `__tests__/helpers/mock-fetch.ts` (AC: #1, #3)
  - [x] 1.1 Criar tipo `MockFetchConfig` com `routes: Array<{ url: string | RegExp, method?: string, response: MockResponse }>`
  - [x] 1.2 Criar `mockJsonResponse(data, status = 200)` — retorna `{ ok: true, status, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) }`
  - [x] 1.3 Criar `mockErrorResponse(status, message?)` — retorna `{ ok: false, status, json: () => Promise.resolve({ error: message }) }`
  - [x] 1.4 Criar `mockNetworkError(message?)` — para simular `fetch()` rejeitado
  - [x] 1.5 Criar `createMockFetch(routes)` que atribui `global.fetch = vi.fn()` com dispatch por URL
  - [x] 1.6 Default: URLs não matchadas retornam 404 com mensagem descritiva incluindo a URL chamada
  - [x] 1.7 Retornar objeto com `calls()` para inspecionar requests feitas (url, method, body, headers)

- [x] Task 2: Criar `restoreFetch()` cleanup helper (AC: #1)
  - [x] 2.1 Criar `restoreFetch()` que restaura `global.fetch` original
  - [x] 2.2 Documentar uso com `afterEach(() => restoreFetch())` ou `beforeEach`

- [x] Task 3: Escrever testes para os helpers (AC: #1, #2, #3)
  - [x] 3.1 Criar `__tests__/unit/helpers/mock-fetch.test.ts`
  - [x] 3.2 Testar match por URL string exata
  - [x] 3.3 Testar match por RegExp
  - [x] 3.4 Testar match por method (GET vs POST para mesma URL)
  - [x] 3.5 Testar default 404 para URL não configurada
  - [x] 3.6 Testar mockNetworkError
  - [x] 3.7 Testar captura de requests (calls)

- [x] Task 4: Migrar 5 arquivos de service tests para usar createMockFetch (AC: #4)
  - [x] 4.1 `__tests__/unit/lib/services/apollo.test.ts` — substituir global.fetch inline por createMockFetch
  - [x] 4.2 `__tests__/unit/lib/services/instantly.test.ts` — idem
  - [x] 4.3 `__tests__/unit/lib/services/snovio.test.ts` — idem
  - [x] 4.4 `__tests__/unit/lib/services/apify.test.ts` — idem
  - [x] 4.5 `__tests__/unit/lib/services/signalhire.test.ts` — idem

- [x] Task 5: Validação final (AC: #5)
  - [x] 5.1 Executar `vitest run` — confirmar >= 3188 testes passando, 0 falhas
  - [x] 5.2 Executar testes isolados dos 5 arquivos migrados — confirmar todos passando
  - [x] 5.3 Verificar que nenhum teste em outro arquivo quebrou

## Dev Notes

### Problema Raiz

O padrão atual de `global.fetch = vi.fn().mockResolvedValue(...)` tem problemas:
- Cada teste reconfigura `global.fetch` completamente — verbose e repetitivo
- Não distingue por URL — se código faz 2 fetches para APIs diferentes, o mock retorna o mesmo para ambos
- Sem captura estruturada de requests para assertions
- Sem default para URLs não mockadas — silenciosamente retorna undefined

**Impacto na Epic 7:** Stories 7.2 (Instantly) e 7.3 (Snov.io) adicionarão novos services HTTP. Sem padrão centralizado, cada teste repetirá o boilerplate de mock.

### 15 Arquivos com `global.fetch = vi.fn()`

| Arquivo | API Mockada | Prioridade de Migração |
|---------|------------|----------------------|
| `services/apollo.test.ts` | Apollo API | HIGH — migrar |
| `services/instantly.test.ts` | Instantly API | HIGH — migrar |
| `services/snovio.test.ts` | Snov.io API | HIGH — migrar |
| `services/apify.test.ts` | Apify API | HIGH — migrar |
| `services/signalhire.test.ts` | SignalHire API | HIGH — migrar |
| `services/base-service.test.ts` | Generic fetch | MEDIUM — deixar |
| `hooks/use-save-campaign.test.ts` | Internal API | MEDIUM — deixar |
| `hooks/use-enrich-lead.test.tsx` | Internal API | MEDIUM — deixar |
| `hooks/use-enrich-persisted-lead.test.tsx` | Internal API | MEDIUM — deixar |
| `hooks/use-campaign-templates.test.tsx` | Internal API | MEDIUM — deixar |
| `hooks/use-campaign-blocks.test.ts` | Internal API | MEDIUM — deixar |
| `hooks/use-ai-full-campaign-generation.test.tsx` | Internal API | MEDIUM — deixar |
| `hooks/use-ai-campaign-structure.test.tsx` | Internal API | MEDIUM — deixar |
| `hooks/use-ai-full-campaign-generation-icebreaker.test.ts` | Internal API | MEDIUM — deixar |
| `integration/apollo-api.test.ts` | Apollo API (route) | MEDIUM — deixar |

**Decisão de escopo:** Migrar apenas os 5 services de API externa (HIGH). Os hooks e integration tests mockam `fetch("/api/...")` (API interna Next.js) — padrão diferente, escopo diferente.

### Padrão Atual (Exemplo: apollo.test.ts)

```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ is_logged_in: true }),
});

// Em cada teste individual:
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ people: [...], pagination: {...} }),
});
```

### Padrão Proposto (Após migração)

```typescript
import { createMockFetch, mockJsonResponse, restoreFetch } from "__tests__/helpers/mock-fetch";

beforeEach(() => {
  createMockFetch([
    { url: /apollo\.io.*search/, method: "POST", response: mockJsonResponse({ people: [], pagination: {} }) },
    { url: /apollo\.io.*auth/, response: mockJsonResponse({ is_logged_in: true }) },
  ]);
});

afterEach(() => restoreFetch());
```

### ALERTA — NÃO Fazer

- **NÃO** migrar hooks que mockam `/api/...` (API interna) — padrão diferente, escopo futuro
- **NÃO** instalar MSW ou outra lib — manter Vitest nativo com vi.fn()
- **NÃO** alterar código de produção (src/) — esta story é 100% teste
- **NÃO** migrar `base-service.test.ts` — testa o wrapper genérico, mock simples é adequado
- **NÃO** criar tipos complexos com generics — manter API simples e prática
- **NÃO** tentar interceptar no nível de `http`/`https` — apenas `global.fetch`

### Relação com Cleanup-3

- **Cleanup-3** (mock-supabase.ts) → infraestrutura para mocks de banco
- **Cleanup-4** (mock-fetch.ts) → infraestrutura para mocks de HTTP externo
- São **independentes** — podem ser desenvolvidas em qualquer ordem
- Ambas ficam em `__tests__/helpers/` e seguem o mesmo padrão de export

### Previous Story Intelligence (Cleanup-2)

- Cleanup-2 centralizou mock factories de **dados** em `__tests__/helpers/mock-data.ts`
- Cleanup-3 centraliza mock de **Supabase client**
- Cleanup-4 centraliza mock de **HTTP fetch**
- O trio `mock-data.ts` + `mock-supabase.ts` + `mock-fetch.ts` forma a fundação de teste completa

### References

- [Source: epic-9-retro-2026-02-06.md#Action-Items] — Item 5 (Padrão de mock HTTP centralizado)
- [Source: __tests__/unit/lib/services/apollo.test.ts] — Exemplo de global.fetch mock atual
- [Source: __tests__/unit/lib/services/instantly.test.ts] — Exemplo com múltiplos endpoints
- [Source: __tests__/unit/lib/services/snovio.test.ts] — Exemplo com OAuth flow
- [Source: __tests__/helpers/mock-data.ts] — Pattern de helpers existente

## Dev Agent Record

### Implementation Plan

- Helper centralizado `mock-fetch.ts` com 5 exports: `createMockFetch`, `mockJsonResponse`, `mockErrorResponse`, `mockNetworkError`, `restoreFetch`
- Tipos: `MockResponse`, `MockRoute`, `FetchCall`, `MockFetchResult`, `MockNetworkErrorMarker`
- URL matching: string → exact match, RegExp → regex test
- Method matching: case-insensitive, optional (matches any when not specified)
- Route priority: first match wins (order matters)
- Default 404 com mensagem descritiva incluindo URL chamada
- `calls()` retorna array de `FetchCall` com url, method, body (auto-parsed JSON), headers
- `restoreFetch()` salva/restaura `global.fetch` original

### Decisões Técnicas

- **AbortError edge cases**: 3 testes (apollo, apify, signalhire) que testam AbortError mantidos com `global.fetch = vi.fn().mockRejectedValue()` direto, pois `mockNetworkError` cria TypeError (não AbortError). Edge case irrelevante para o padrão centralizado.
- **Generic Error edge cases**: 2 testes (apollo, apify) que testam `new Error("Unknown error")` mantidos com mock direto para preservar tipo exato do erro (Error vs TypeError).
- **snovio OAuth flow**: Resolvido com 2 routes — `{ url: /oauth\/access_token/, method: "POST" }` para token exchange e `{ url: /snov\.io/ }` como catch-all para balance check. Eliminou completamente o pattern `callCount++`.
- **apify fetchLinkedInPosts**: Testes de LinkedIn posts usam ApifyClient mocks (não global.fetch) — mantidos intactos. Apenas testes de `testConnection` foram migrados.

### Completion Notes

- 28 testes do helper (`mock-fetch.test.ts`) — todos passando
- 113 testes nos 5 arquivos migrados — todos passando
- Suite completa: 181 arquivos, 3242 testes, 0 falhas (+54 testes vs baseline 3188)
- Nenhum código de produção (src/) foi alterado — story é 100% teste
- Trio completo de test helpers: `mock-data.ts` + `mock-supabase.ts` + `mock-fetch.ts`

## File List

| Arquivo | Ação |
|---------|------|
| `__tests__/helpers/mock-fetch.ts` | **NOVO** — Helper centralizado com createMockFetch, mockJsonResponse, mockErrorResponse, mockNetworkError, restoreFetch |
| `__tests__/unit/helpers/mock-fetch.test.ts` | **NOVO** — 28 testes para o helper |
| `__tests__/unit/lib/services/apollo.test.ts` | **MODIFICADO** — Migrado para createMockFetch (31 testes) |
| `__tests__/unit/lib/services/instantly.test.ts` | **MODIFICADO** — Migrado para createMockFetch (8 testes) |
| `__tests__/unit/lib/services/snovio.test.ts` | **MODIFICADO** — Migrado para createMockFetch (10 testes) |
| `__tests__/unit/lib/services/apify.test.ts` | **MODIFICADO** — testConnection migrado para createMockFetch (39 testes) |
| `__tests__/unit/lib/services/signalhire.test.ts` | **MODIFICADO** — Migrado para createMockFetch (25 testes) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | **MODIFICADO** — Status atualizado |
| `_bmad-output/implementation-artifacts/cleanup-4-mock-http-centralizado.md` | **MODIFICADO** — Story file atualizado |

## Change Log

| Data | Mudança | Autor |
|------|---------|-------|
| 2026-02-06 | Story criada com análise dos 15 arquivos afetados. 5 HIGH priority para migração (services externos). Baseline: 179 arquivos, 3188 testes, 0 falhas | SM Agent (Bob) |
| 2026-02-06 | Implementação completa: mock-fetch.ts helper criado, 28 testes do helper, 5 service tests migrados, suite completa 181 arquivos/3242 testes/0 falhas | Dev Agent (Amelia) |
| 2026-02-06 | Code review: 3 MEDIUM fixes (headers type assertion unsafe → Headers instanceof check, unused `type Mock` import removido, vi.useFakeTimers() desnecessário removido). Suite intacta 181/3242/0 | Dev Agent (Amelia) — Code Review |
