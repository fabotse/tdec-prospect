# Story 10.3: Instantly Analytics Service (Polling)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor,
I want implementar um serviço de polling de analytics da API Instantly,
so that as métricas de campanha sejam sincronizadas como backup dos webhooks.

## Acceptance Criteria

1. **Given** o `TrackingService` é criado **When** `getCampaignAnalytics(campaignId)` é chamado **Then** busca o `external_campaign_id` da campanha local **And** faz request para `GET /api/v2/campaigns/analytics?id={external_campaign_id}` **And** retorna `CampaignAnalytics` com totals: opens, clicks, replies, bounces, taxas percentuais

2. **Given** o `TrackingService` existe **When** `syncAnalytics(campaignId)` é chamado **Then** busca analytics agregados da API Instantly **And** busca daily analytics para gráfico de evolução **And** retorna `SyncResult` com dados de campanha + data da última sincronização

3. **Given** o `TrackingService` existe **When** `getLeadTracking(campaignId)` é chamado **Then** busca leads da campanha via `POST /api/v2/leads/list` com filtro `campaign={external_campaign_id}` **And** retorna lista de `LeadTracking` com `openCount`, `clickCount`, `hasReplied`, `lastOpenAt` por lead

4. **Given** o `TrackingService` herda de `ExternalService` **When** ocorre erro de rede ou timeout **Then** segue o padrão de error handling existente (retry 1x, abort timeout) **And** retorna erro traduzido em português

5. **Given** o `TrackingService` faz polling **When** a campanha não tem `external_campaign_id` (nunca foi exportada) **Then** retorna erro claro indicando que a campanha precisa ser exportada primeiro

6. **Given** os dados de polling são recebidos **When** processados pelo service **Then** a resposta inclui `lastSyncAt` com timestamp da sincronização **And** os dados são retornáveis pelo hook sem persistir (polling é read-only, dados vêm direto da API)

## Tasks / Subtasks

- [x] Task 1: Criar `TrackingService` em `src/lib/services/tracking.ts` (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Classe `TrackingService extends ExternalService` com `readonly name = "instantly"`
  - [x] 1.2 Helper `resolveExternalCampaignId(campaignId, apiKey)` — validação movida para cada método (lança ExternalServiceError se externalCampaignId vazio) e API routes fazem lookup no banco (AC: #5)
  - [x] 1.3 Método `getCampaignAnalytics(params: GetAnalyticsParams)` — `GET /api/v2/campaigns/analytics?id={externalId}&exclude_total_leads_count=true` (AC: #1)
  - [x] 1.4 Método `getDailyAnalytics(params: GetDailyAnalyticsParams)` — `GET /api/v2/campaigns/analytics/daily?campaign_id={externalId}` (AC: #2)
  - [x] 1.5 Método `syncAnalytics(params: SyncAnalyticsParams)` — orquestra getCampaignAnalytics + getDailyAnalytics, retorna `SyncResult` (AC: #2)
  - [x] 1.6 Método `getLeadTracking(params: GetLeadTrackingParams)` — `POST /api/v2/leads/list` com `campaign={externalId}`, paginação via cursor `starting_after`, limit=100, MAX_PAGINATION_PAGES=50 (AC: #3)
  - [x] 1.7 Reutilizar `buildAuthHeaders(apiKey)` e `this.request<T>()` do base-service para timeout/retry (AC: #4)
- [x] Task 2: Adicionar tipos de request/response em `src/types/tracking.ts` (AC: #1, #2, #3)
  - [x] 2.1 `GetAnalyticsParams` — `{ apiKey: string; externalCampaignId: string }`
  - [x] 2.2 `GetDailyAnalyticsParams` — `{ apiKey: string; externalCampaignId: string; startDate?: string; endDate?: string }`
  - [x] 2.3 `SyncAnalyticsParams` — `{ apiKey: string; externalCampaignId: string }`
  - [x] 2.4 `GetLeadTrackingParams` — `{ apiKey: string; externalCampaignId: string }`
  - [x] 2.5 `InstantlyAnalyticsResponse` — shape exata do response `GET /api/v2/campaigns/analytics`
  - [x] 2.6 `InstantlyDailyAnalyticsResponse` — wrapper com `data: DailyAnalyticsEntry[]`
  - [x] 2.7 `DailyAnalyticsEntry` — `{ date, sent, contacted, opened, unique_opened, replies, unique_replies, clicks, unique_clicks }`
  - [x] 2.8 `InstantlyLeadListResponse` — `{ items: InstantlyLeadEntry[]; next_starting_after?: string }`
  - [x] 2.9 `InstantlyLeadEntry` — shape do response `POST /api/v2/leads/list`
- [x] Task 3: Criar hook `src/hooks/use-campaign-analytics.ts` (AC: #1, #2, #6)
  - [x] 3.1 `useCampaignAnalytics(campaignId)` — TanStack Query com staleTime 5min, queryKey `["campaign-analytics", campaignId]`
  - [x] 3.2 `useSyncAnalytics()` — useMutation que chama syncAnalytics e invalida query de analytics
  - [x] 3.3 API key buscada server-side na API route (padrão do projeto)
  - [x] 3.4 Chamada via API route para proteger a apiKey (não expor no client)
- [x] Task 4: Criar hook `src/hooks/use-lead-tracking.ts` (AC: #3, #6)
  - [x] 4.1 `useLeadTracking(campaignId)` — TanStack Query com queryKey `["lead-tracking", campaignId]`
  - [x] 4.2 Paginação via cursor (`starting_after`) — implementada no TrackingService
  - [x] 4.3 Mapear `InstantlyLeadEntry` → `LeadTracking` — via `mapToLeadTracking()` no service
- [x] Task 5: Criar API route ou server action para proxy das chamadas (AC: #4)
  - [x] 5.1 API route `src/app/api/campaigns/[campaignId]/analytics/route.ts` — GET para analytics
  - [x] 5.2 API route `src/app/api/campaigns/[campaignId]/analytics/sync/route.ts` — POST para sync
  - [x] 5.3 API route `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` — GET para lead tracking
  - [x] 5.4 Cada route: autenticação via getCurrentUserProfile(), buscar apiKey do tenant via api_configs + decryptApiKey, instanciar TrackingService, chamar método, retornar resultado
  - [x] 5.5 Buscar `external_campaign_id` da campanha no banco antes de chamar o service
- [x] Task 6: Testes unitários do TrackingService (AC: #1, #2, #3, #4, #5)
  - [x] 6.1 `getCampaignAnalytics` — mock fetch, verifica URL/headers, retorna CampaignAnalytics correto
  - [x] 6.2 `getCampaignAnalytics` — campanha sem external_campaign_id → erro claro
  - [x] 6.3 `getDailyAnalytics` — mock fetch, verifica query params, retorna array de DailyAnalyticsEntry
  - [x] 6.4 `syncAnalytics` — orquestra analytics + daily, retorna SyncResult com lastSyncAt
  - [x] 6.5 `getLeadTracking` — mock fetch, verifica body com campaign filter, retorna LeadTracking[]
  - [x] 6.6 `getLeadTracking` — paginação: mock 2 páginas, verifica starting_after, concatena resultados
  - [x] 6.7 Erro de rede → ExternalServiceError com mensagem em português
  - [x] 6.8 Timeout → retry 1x via base-service
  - [x] 6.9 401 Unauthorized → mensagem "API key inválida ou expirada."
  - [x] 6.10 429 Rate Limited → mensagem "Limite de requisições atingido."
- [x] Task 7: Testes unitários dos hooks (AC: #6)
  - [x] 7.1 `useCampaignAnalytics` — renderiza, loading state, dados retornados
  - [x] 7.2 `useSyncAnalytics` — mutation trigger, invalidation da query
  - [x] 7.3 `useLeadTracking` — renderiza, loading state, dados mapeados corretamente
- [x] Task 8: Adicionar mock factories em `__tests__/helpers/mock-data.ts`
  - [x] 8.1 `createMockCampaignAnalytics()` — retorna CampaignAnalytics com dados realistas
  - [x] 8.2 `createMockLeadTracking()` — retorna LeadTracking com openCount, clickCount, etc.
  - [x] 8.3 `createMockInstantlyAnalyticsResponse()` — retorna shape exata da API Instantly
  - [x] 8.4 `createMockInstantlyLeadEntry()` — retorna lead com email_open_count, timestamp_last_open

## Dev Notes

### TrackingService — Padrão do Projeto

O `TrackingService` DEVE seguir exatamente o padrão do `InstantlyService`:

```typescript
// src/lib/services/tracking.ts
import { ExternalService, ExternalServiceError, type TestConnectionResult } from "./base-service";

const INSTANTLY_API_BASE = "https://api.instantly.ai";

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export class TrackingService extends ExternalService {
  readonly name = "instantly";

  // testConnection NÃO é necessário (já existe no InstantlyService)
  // Mas ExternalService exige — implementar como stub ou delegar
  async testConnection(apiKey: string): Promise<TestConnectionResult> {
    // Delegate ou stub — não é o foco desta story
    throw new ExternalServiceError(this.name, 501, "Use InstantlyService.testConnection");
  }

  async getCampaignAnalytics(params: GetAnalyticsParams): Promise<CampaignAnalytics> { ... }
  async getDailyAnalytics(params: GetDailyAnalyticsParams): Promise<DailyAnalyticsEntry[]> { ... }
  async syncAnalytics(params: SyncAnalyticsParams): Promise<SyncResult> { ... }
  async getLeadTracking(params: GetLeadTrackingParams): Promise<LeadTracking[]> { ... }
}
```

**Por que não adicionar ao InstantlyService existente?**
- O InstantlyService foca em **deployment** (criar campanha, adicionar leads, ativar)
- O TrackingService foca em **leitura de analytics** (polling, métricas, lead tracking)
- Separar responsabilidades — Single Responsibility Principle
- Ambos usam a mesma API key do Instantly e herdam de ExternalService

### API Instantly v2 — Endpoints de Analytics

**1. GET /api/v2/campaigns/analytics**
```
GET https://api.instantly.ai/api/v2/campaigns/analytics?id={externalCampaignId}&exclude_total_leads_count=true
Authorization: Bearer {apiKey}
```

Response (array — pegar [0]):
```json
[{
  "campaign_id": "uuid",
  "campaign_name": "Nome",
  "campaign_status": 1,
  "leads_count": 500,
  "contacted_count": 450,
  "emails_sent_count": 1200,
  "open_count": 180,
  "open_count_unique": 120,
  "reply_count": 25,
  "reply_count_unique": 20,
  "link_click_count": 45,
  "link_click_count_unique": 35,
  "bounced_count": 8,
  "unsubscribed_count": 3
}]
```

**Mapeamento → CampaignAnalytics:**
```typescript
{
  campaignId: localCampaignId,  // ID interno, NÃO o do Instantly
  totalSent: response.emails_sent_count,
  totalOpens: response.open_count_unique,  // usar unique para evitar inflação
  totalClicks: response.link_click_count_unique,
  totalReplies: response.reply_count_unique,
  totalBounces: response.bounced_count,
  openRate: response.emails_sent_count > 0 ? response.open_count_unique / response.emails_sent_count : 0,
  clickRate: response.emails_sent_count > 0 ? response.link_click_count_unique / response.emails_sent_count : 0,
  replyRate: response.emails_sent_count > 0 ? response.reply_count_unique / response.emails_sent_count : 0,
  bounceRate: response.emails_sent_count > 0 ? response.bounced_count / response.emails_sent_count : 0,
  lastSyncAt: new Date().toISOString(),
}
```

**2. GET /api/v2/campaigns/analytics/daily**
```
GET https://api.instantly.ai/api/v2/campaigns/analytics/daily?campaign_id={externalCampaignId}
Authorization: Bearer {apiKey}
```

Response (array):
```json
[
  { "date": "2026-02-01", "sent": 50, "contacted": 45, "opened": 12, "unique_opened": 8, "replies": 3, "unique_replies": 3, "clicks": 5, "unique_clicks": 4 },
  { "date": "2026-02-02", "sent": 48, "contacted": 42, "opened": 15, "unique_opened": 10, "replies": 2, "unique_replies": 2, "clicks": 3, "unique_clicks": 3 }
]
```

**3. POST /api/v2/leads/list**
```
POST https://api.instantly.ai/api/v2/leads/list
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "campaign": "{externalCampaignId}",
  "limit": 100,
  "starting_after": "cursor-string-or-omit"
}
```

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "email": "joao@empresa.com",
      "first_name": "João",
      "last_name": "Silva",
      "company_name": "Empresa LTDA",
      "phone": "+5511999999999",
      "email_open_count": 5,
      "email_click_count": 2,
      "email_reply_count": 0,
      "timestamp_last_open": "2026-02-08T14:30:00.000Z",
      "timestamp_last_click": "2026-02-07T10:00:00.000Z",
      "timestamp_last_reply": null,
      "status": 1
    }
  ],
  "next_starting_after": "cursor-next-page-or-null"
}
```

**Mapeamento → LeadTracking:**
```typescript
{
  leadEmail: item.email,
  campaignId: localCampaignId,
  openCount: item.email_open_count ?? 0,
  clickCount: item.email_click_count ?? 0,
  hasReplied: (item.email_reply_count ?? 0) > 0,
  lastOpenAt: item.timestamp_last_open ?? null,
  events: [],  // Eventos granulares vêm do webhook (tabela campaign_events), não do polling
}
```

### Hooks — Padrão TanStack Query do Projeto

Os hooks DEVEM seguir o padrão existente em `use-campaigns.ts`:

```typescript
// src/hooks/use-campaign-analytics.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CampaignAnalytics, SyncResult } from "@/types/tracking";

const ANALYTICS_QUERY_KEY = (id: string) => ["campaign-analytics", id];

async function fetchAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const response = await fetch(`/api/campaigns/${campaignId}/analytics`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Erro ao buscar analytics");
  }
  return result.data;
}

export function useCampaignAnalytics(campaignId: string) {
  return useQuery({
    queryKey: ANALYTICS_QUERY_KEY(campaignId),
    queryFn: () => fetchAnalytics(campaignId),
    staleTime: 5 * 60 * 1000, // 5 minutos — analytics não muda em tempo real
    enabled: !!campaignId,
  });
}
```

### API Routes — Padrão do Projeto

API routes seguem o padrão Next.js App Router existente:

```typescript
// src/app/api/campaigns/[campaignId]/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  // 1. Autenticação via session (Supabase)
  // 2. Buscar campanha + external_campaign_id
  // 3. Buscar apiKey do tenant (settings)
  // 4. Instanciar TrackingService, chamar getCampaignAnalytics
  // 5. Retornar NextResponse.json({ data: analytics })
}
```

### Polling é READ-ONLY — NÃO persistir

**Decisão arquitetural (ADR-004):**
- Polling retorna dados **agregados** direto da API Instantly
- NÃO gravar em `campaign_events` — webhooks já fazem isso com granularidade
- TanStack Query gerencia cache client-side (staleTime 5min)
- Dashboard exibe dados do polling response via hooks
- Webhook data (tabela `campaign_events`) é para eventos granulares e timeline

### Buscar API Key — Padrão Existente

A API key do Instantly é armazenada nas settings do tenant:

```typescript
// Padrão usado em use-campaign-export.ts / deployment-service.ts
const settings = await getSettings(tenantId); // ou API call
const apiKey = settings.instantly_api_key;
```

O TrackingService recebe `apiKey` como parâmetro (mesmo que InstantlyService) — a API route é responsável por buscar do banco.

### Paginação de Leads (cursor-based)

O endpoint `POST /api/v2/leads/list` usa paginação por cursor:

```typescript
async getLeadTracking(params: GetLeadTrackingParams): Promise<LeadTracking[]> {
  const allLeads: LeadTracking[] = [];
  let cursor: string | undefined = undefined;

  do {
    const body: Record<string, unknown> = {
      campaign: params.externalCampaignId,
      limit: 100,
    };
    if (cursor) body.starting_after = cursor;

    const response = await this.request<InstantlyLeadListResponse>(url, {
      method: "POST",
      headers: buildAuthHeaders(params.apiKey),
      body: JSON.stringify(body),
    });

    const mapped = response.items.map(item => mapToLeadTracking(item, localCampaignId));
    allLeads.push(...mapped);

    cursor = response.next_starting_after ?? undefined;
  } while (cursor);

  return allLeads;
}
```

**Limites:** `limit` aceita 1-100 por página. Para campanhas com milhares de leads, considerar limite máximo de iterações (ex: 50 páginas = 5000 leads) para evitar loops infinitos.

### Error Messages — Em Português

O `ExternalService` base já traduz erros via `ERROR_MESSAGES`. Para erros específicos do tracking:

```typescript
// Campanha não exportada (AC: #5)
throw new ExternalServiceError(
  this.name,
  400,
  "Esta campanha ainda não foi exportada para o Instantly. Exporte a campanha primeiro."
);
```

### Story 10.2 Learnings (Previous Story Intelligence)

Da story 10.2 (review):
- **Imports modernos Deno**: Apenas para Edge Functions — TrackingService roda em Node.js, usar imports normais
- **EVENT_TYPE_MAP**: Mapeamento Instantly → projeto já implementado em `src/lib/webhook/instantly-webhook-utils.ts`
- **Mock Supabase**: Handlers para `campaign_events` e `campaigns` lookup já registrados (Task 3 da 10.2)
- **Mock factories**: `createMockInstantlyWebhookPayload()` e `createMockCampaignEvent()` já existem em `mock-data.ts`
- **Lógica pura testável**: Extrair lógica de mapeamento/transformação para funções puras — mesmo padrão da 10.2

### Git Intelligence

Commits recentes:
- `a6cc007` feat(story-10.2): webhook receiver Edge Function + code review fixes
- `63ab385` chore: sprint status — epic-7 done, branch tracking epic/10
- `5f4b775` feat(story-10.1): schema de tracking, tipos TypeScript e sprint status

Branch: `epic/10-campaign-tracking` (base: main)

### Anti-Patterns a Evitar

1. **NÃO persistir dados de polling em `campaign_events`** — polling é read-only, webhooks persistem
2. **NÃO expor apiKey no client-side** — toda chamada deve ir via API route que busca apiKey no server
3. **NÃO usar `open_count` (total)** — usar `open_count_unique` para evitar inflação por tracking pixels
4. **NÃO esquecer `exclude_total_leads_count=true`** no analytics endpoint — melhora performance
5. **NÃO criar loop infinito na paginação** — implementar limite máximo de iterações
6. **NÃO copiar o helper `buildAuthHeaders` do InstantlyService** — criar localmente no tracking.ts (mesmo padrão, arquivo separado)
7. **NÃO usar `console.log`** — ESLint enforces no-console rule
8. **NÃO criar FKs explícitas** — padrão do projeto é sem foreign keys
9. **NÃO misturar `externalCampaignId` com `campaignId` local** — sempre documentar qual é qual

### Dependências Downstream

Esta story alimenta:
- **10.4** (Dashboard UI): Usa `useCampaignAnalytics` e `useSyncAnalytics` hooks
- **10.5** (Lead Tracking Detail): Usa `useLeadTracking` hook
- **10.6** (Opportunity Engine): Avalia threshold sobre dados de `LeadTracking`

### Project Structure Notes

- Services: `src/lib/services/tracking.ts` (novo, ao lado de `instantly.ts`)
- Hooks: `src/hooks/use-campaign-analytics.ts`, `src/hooks/use-lead-tracking.ts` (novos)
- API Routes: `src/app/api/campaigns/[campaignId]/analytics/` (novo diretório)
- Types: `src/types/tracking.ts` (modificar — adicionar tipos de params/response)
- Mocks: `__tests__/helpers/mock-data.ts` (modificar — adicionar factories)
- Testes service: `__tests__/unit/services/tracking.test.ts` (novo)
- Testes hooks: `__tests__/unit/hooks/use-campaign-analytics.test.ts`, `use-lead-tracking.test.ts` (novos)
- Zero conflitos com estrutura existente

### References

- [Source: _bmad-output/planning-artifacts/epic-10-campaign-tracking.md#Story 10.3]
- [Source: _bmad-output/planning-artifacts/research/instantly-campaign-tracking-api-research-2026-02-09.md#Sections 1-2]
- [Source: src/lib/services/instantly.ts — InstantlyService pattern (ExternalService, buildAuthHeaders, request)]
- [Source: src/lib/services/base-service.ts — ExternalService base class (timeout 10s, retry 1x, Portuguese errors)]
- [Source: src/types/tracking.ts — CampaignAnalytics, LeadTracking, SyncResult, CampaignEvent types]
- [Source: src/types/campaign.ts — Campaign.externalCampaignId, CampaignRow.external_campaign_id]
- [Source: src/hooks/use-campaigns.ts — TanStack Query hook pattern (queryKey, fetchFn, useQuery)]
- [Source: _bmad-output/implementation-artifacts/10-2-webhook-receiver-supabase-edge-function.md — Previous story intelligence]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A

### Completion Notes List

- 8/8 tasks implementados com sucesso
- 29 novos testes (21 service + 4 analytics hook + 4 lead tracking hook)
- Suite completa: 3902 testes passando, 1 falha pré-existente (ai-campaign-structure integration)
- TrackingService separado do InstantlyService (SRP: analytics vs deployment)
- Funções puras `mapToCampaignAnalytics` e `mapToLeadTracking` exportadas para testabilidade
- Paginação cursor-based com MAX_PAGINATION_PAGES=50 safety limit
- API routes como proxy para proteger apiKey (nunca exposta client-side)
- Dados de polling são read-only (ADR-004), não persistidos em campaign_events
- Contadores unique usados (open_count_unique, não open_count) para evitar inflação
- Adicionado `dailyAnalytics: DailyAnalyticsEntry[]` ao SyncResult existente (breaking change corrigido em testes)

### Code Review Fixes (Amelia — Claude Opus 4.6)

- **[H1] Teste 6.8 timeout/retry reescrito**: Teste era placeholder vazio (zero assertions). Reescrito com mock real que injeta AbortError no fetch level na 1a chamada, verifica retry na 2a chamada, e asserta resultado correto com `expect(callCount).toBe(2)`.
- **[M1] JSDoc campaignId semantics**: Adicionados comentários em `mapToCampaignAnalytics` e `mapToLeadTracking` documentando que `campaignId` é passado as-is (externalCampaignId no service, API routes override para local ID).
- **[M3] UUID validation nas API routes**: Adicionada validação regex UUID em `analytics/route.ts`, `analytics/sync/route.ts` e `leads/tracking/route.ts` — rejeita IDs inválidos com 400 antes de queries ao banco.

### File List

**Novos:**
- `src/lib/services/tracking.ts` — TrackingService (getCampaignAnalytics, getDailyAnalytics, syncAnalytics, getLeadTracking)
- `src/hooks/use-campaign-analytics.ts` — useCampaignAnalytics + useSyncAnalytics hooks
- `src/hooks/use-lead-tracking.ts` — useLeadTracking hook
- `src/app/api/campaigns/[campaignId]/analytics/route.ts` — GET analytics
- `src/app/api/campaigns/[campaignId]/analytics/sync/route.ts` — POST sync
- `src/app/api/campaigns/[campaignId]/leads/tracking/route.ts` — GET lead tracking
- `__tests__/unit/lib/services/tracking.test.ts` — 21 testes do TrackingService
- `__tests__/unit/hooks/use-campaign-analytics.test.ts` — 4 testes do hook analytics
- `__tests__/unit/hooks/use-lead-tracking.test.ts` — 4 testes do hook lead tracking

**Modificados:**
- `src/types/tracking.ts` — Adicionados tipos de params/response da API Instantly + dailyAnalytics no SyncResult
- `__tests__/helpers/mock-data.ts` — 4 novas mock factories (CampaignAnalytics, LeadTracking, InstantlyAnalyticsResponse, InstantlyLeadEntry)
- `__tests__/unit/types/tracking.test.ts` — Adicionado `dailyAnalytics: []` ao teste de SyncResult
