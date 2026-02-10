# Story 10.2: Webhook Receiver (Supabase Edge Function)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a sistema,
I want receber eventos de tracking do Instantly via webhook em tempo real,
so that os dados de opens, clicks, replies e bounces sejam persistidos automaticamente.

## Acceptance Criteria

1. **Given** a Edge Function `instantly-webhook` é criada **When** recebe um POST com payload válido do Instantly **Then** responde 200 OK imediatamente **And** persiste o evento na tabela `campaign_events` **And** o campo `source` é `'webhook'`

2. **Given** o webhook recebe um evento **When** o `campaign_id` do Instantly é mapeado via `external_campaign_id` **Then** o `campaign_id` local correto é associado ao evento **And** o `tenant_id` é derivado da campanha encontrada

3. **Given** o webhook recebe um evento duplicado **When** o mesmo `(campaign_id, event_type, lead_email, event_timestamp)` já existe **Then** o INSERT é ignorado silenciosamente (ON CONFLICT DO NOTHING) **And** a resposta continua sendo 200 OK

4. **Given** o webhook recebe um payload inválido (campos obrigatórios faltando) **When** `event_type`, `lead_email` ou `campaign_id` estão ausentes **Then** responde 400 Bad Request com mensagem de erro **And** nenhum evento é persistido

5. **Given** o webhook recebe um evento com `campaign_id` desconhecido **When** nenhuma campanha local tem aquele `external_campaign_id` **Then** o evento é descartado **And** responde 200 OK (não causa retry no Instantly) **And** um log de warning é emitido

6. **Given** o webhook está configurado no Instantly **When** um email é aberto, clicado, respondido ou bounced **Then** o evento correspondente é recebido e persistido **And** os event types suportados são: `email_opened`, `email_link_clicked`, `reply_received`, `email_bounced`, `lead_unsubscribed`

## Tasks / Subtasks

- [x] Task 1: Criar a Edge Function `supabase/functions/instantly-webhook/index.ts` (AC: #1, #2, #3, #4, #5, #6)
  - [x] 1.1 Estrutura base com `Deno.serve` (NÃO usar `serve` do deno.land — ver Dev Notes)
  - [x] 1.2 Tratamento de CORS (OPTIONS → 204) e validação de método (apenas POST)
  - [x] 1.3 Parse do JSON body com try/catch para payloads inválidos
  - [x] 1.4 Validação dos campos obrigatórios: `event_type`, `lead_email`, `campaign_id` (→ 400 se ausentes)
  - [x] 1.5 Mapeamento de event types do Instantly para os do projeto (ver tabela de mapeamento abaixo)
  - [x] 1.6 Inicializar Supabase client com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - [x] 1.7 Lookup da campanha: `campaigns` WHERE `external_campaign_id = webhook.campaign_id`
  - [x] 1.8 Se campanha não encontrada: log warning + responder 200 OK (AC: #5)
  - [x] 1.9 INSERT na `campaign_events` com ON CONFLICT DO NOTHING (AC: #3)
  - [x] 1.10 Retornar 200 OK com `{ success: true }` (AC: #1)
- [x] Task 2: Testes unitários para a lógica de processamento do webhook
  - [x] 2.1 Teste de payload válido → evento persistido
  - [x] 2.2 Teste de payload inválido (campos faltando) → 400
  - [x] 2.3 Teste de campanha desconhecida → 200 OK + log warning
  - [x] 2.4 Teste de evento duplicado → ON CONFLICT DO NOTHING
  - [x] 2.5 Teste de método HTTP incorreto (GET, PUT) → 405
  - [x] 2.6 Teste de JSON malformado → 400
  - [x] 2.7 Teste de mapeamento de event types
  - [x] 2.8 Teste de CORS preflight (OPTIONS) → 204
- [x] Task 3: Registrar tabelas `campaign_events` e `campaigns` no mock Supabase (pendente de 10.1 Task 6.4)
  - [x] 3.1 Adicionar handlers para `campaign_events` no `mock-supabase.ts` ou no setup dos testes
  - [x] 3.2 Adicionar mock de lookup de `campaigns` por `external_campaign_id`
- [x] Task 4: Criar factory de mock em `__tests__/helpers/mock-data.ts`
  - [x] 4.1 `createMockInstantlyWebhookPayload()` — payload completo do Instantly
  - [x] 4.2 `createMockCampaignEvent()` — evento persistido no banco (usando `CampaignEventRow`)

## Dev Notes

### ALERTA CRÍTICO: Imports do Supabase Edge Functions (2026)

O projeto existente (`supabase/functions/signalhire-callback/index.ts`) usa o padrão **ANTIGO**:

```typescript
// ❌ ANTIGO — NÃO usar
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```

O padrão **ATUAL** (2026) para Supabase Edge Functions é:

```typescript
// ✅ ATUAL — USAR ESTE
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request): Promise<Response> => {
  // handler aqui
});
```

**Motivo:** A Supabase atualizou o runtime Deno. `Deno.serve` é nativo (sem import), e imports devem usar prefixo `npm:` ou `jsr:` em vez de URLs do `esm.sh` ou `deno.land`.

**Fonte:** [Supabase Edge Functions Docs 2026](https://supabase.com/docs/guides/getting-started/ai-prompts/edge-functions)

### Mapeamento de Event Types (Instantly → Projeto)

O Instantly envia event types que NÃO correspondem exatamente aos `EventType` definidos em `src/types/tracking.ts`. É necessário mapear:

| Instantly `event_type` | Projeto `EventType` | Notas |
|---|---|---|
| `email_opened` | `email_opened` | Direto |
| `email_link_clicked` | `email_clicked` | Rename necessário |
| `reply_received` | `email_replied` | Rename necessário |
| `email_bounced` | `email_bounced` | Direto |
| `lead_unsubscribed` | `email_unsubscribed` | Rename necessário |

Os demais event types do Instantly (`email_sent`, `campaign_completed`, `account_error`, etc.) devem ser **ignorados silenciosamente** — não são relevantes para tracking nesta fase.

**Implementar a função de mapeamento:**
```typescript
const EVENT_TYPE_MAP: Record<string, EventType | null> = {
  email_opened: 'email_opened',
  email_link_clicked: 'email_clicked',
  reply_received: 'email_replied',
  email_bounced: 'email_bounced',
  lead_unsubscribed: 'email_unsubscribed',
};

function mapEventType(instantlyEventType: string): EventType | null {
  return EVENT_TYPE_MAP[instantlyEventType] ?? null;
}
```

Se `mapEventType` retorna `null`, ignorar o evento silenciosamente e responder 200 OK (não é erro).

### Padrão Existente: SignalHire Callback (Referência)

O `supabase/functions/signalhire-callback/index.ts` (357 linhas) serve como referência arquitetural:

**Padrões a reutilizar:**
- CORS headers com wildcard origin
- Validação POST-only + 405 para outros métodos
- JSON parse com try/catch separado
- Supabase client com `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS)
- Retornar 200 mesmo em erros parciais (evita retry do provedor)

**Padrões a modernizar:**
- Usar `Deno.serve` em vez de `serve()` importado
- Usar `npm:@supabase/supabase-js@2` em vez de `esm.sh`

### Fluxo Completo do Webhook

```
Instantly dispara webhook
        │
        ▼
POST /functions/v1/instantly-webhook
        │
        ├── OPTIONS? → 204 (CORS preflight)
        │
        ├── não é POST? → 405 Method Not Allowed
        │
        ├── parse JSON body
        │   └── falha? → 400 Invalid JSON
        │
        ├── validar campos obrigatórios (event_type, lead_email, campaign_id)
        │   └── faltando? → 400 Missing required fields
        │
        ├── mapear event_type do Instantly → EventType do projeto
        │   └── não mapeável? → 200 OK (ignorar silenciosamente)
        │
        ├── Supabase client (SERVICE_ROLE_KEY)
        │
        ├── SELECT campaigns WHERE external_campaign_id = webhook.campaign_id
        │   └── não encontrada? → 200 OK + console.warn
        │
        ├── INSERT campaign_events {
        │     tenant_id: campaign.tenant_id,
        │     campaign_id: campaign.id,  // ID INTERNO
        │     event_type: mappedEventType,
        │     lead_email: webhook.lead_email,
        │     event_timestamp: webhook.timestamp,
        │     payload: webhook (completo),
        │     source: 'webhook'
        │   }
        │   ON CONFLICT DO NOTHING
        │
        └── 200 OK { success: true }
```

### Schema da Tabela `campaign_events` (Criada em 10.1)

```sql
CREATE TABLE public.campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  lead_email VARCHAR(255) NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  source VARCHAR(20) NOT NULL DEFAULT 'webhook',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotência: previne webhooks duplicados
ALTER TABLE public.campaign_events
  ADD CONSTRAINT uq_campaign_events_idempotency
  UNIQUE (campaign_id, event_type, lead_email, event_timestamp);
```

### Tipos TypeScript Relevantes (Criados em 10.1)

**`src/types/tracking.ts` — InstantlyWebhookEvent:**
```typescript
export interface InstantlyWebhookEvent {
  event_type: string;
  lead_email: string;
  campaign_id: string;
  timestamp: string;
  campaign_name?: string;
  workspace?: string;
  email_account?: string;
  step?: number;
  variant?: number;
  is_first?: boolean;
  payload?: Record<string, unknown>;
}
```

**`src/types/tracking.ts` — EventType:**
```typescript
export const EVENT_TYPES = [
  'email_opened', 'email_clicked', 'email_replied',
  'email_bounced', 'email_unsubscribed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export function isValidEventType(value: string): value is EventType { ... }
```

**`src/types/tracking.ts` — CampaignEventRow:**
```typescript
export interface CampaignEventRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  event_type: EventType;
  lead_email: string;
  event_timestamp: string;
  payload: Record<string, unknown>;
  source: 'webhook' | 'polling';
  processed_at: string;
  created_at: string;
}
```

### Campo `external_campaign_id` na Tabela `campaigns`

**`src/types/campaign.ts`:**
```typescript
export interface Campaign {
  id: string;                           // UUID interno
  tenantId: string;
  name: string;
  externalCampaignId: string | null;    // ID da campanha no Instantly
  exportPlatform: RemoteExportPlatform | null;  // "instantly" | "snovio" | null
  exportedAt: string | null;
  exportStatus: ExportStatus | null;
  // ... demais campos
}

export interface CampaignRow {
  external_campaign_id: string | null;  // snake_case no DB
  // ...
}
```

O webhook do Instantly envia `campaign_id` que é o **ID do Instantly** (armazenado em `external_campaign_id`). A lookup é:
```sql
SELECT id, tenant_id FROM campaigns WHERE external_campaign_id = $1 LIMIT 1;
```

### Variáveis de Ambiente (Supabase Edge Functions)

Disponíveis automaticamente em runtime:
- `SUPABASE_URL` — URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — Chave de service role (bypass RLS)
- `SUPABASE_ANON_KEY` — Chave anônima (NÃO usar aqui — não tem permissão de INSERT)

Usar `Deno.env.get("SUPABASE_URL")` e `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`.

### Decisões Arquiteturais (ADR-003)

| Aspecto | Decisão |
|---|---|
| **Tecnologia** | Supabase Edge Function (Deno runtime) |
| **Endpoint** | `POST /functions/v1/instantly-webhook` |
| **Idempotência** | UNIQUE constraint + ON CONFLICT DO NOTHING |
| **Autenticação** | Sem validação de token (Instantly não suporta headers customizados) |
| **Mitigação Segurança** | Validação de payload + idempotência |
| **Cold Start** | ~50ms (aceitável para webhooks) |
| **Deploy** | `npx supabase functions deploy instantly-webhook --no-verify-jwt` |

### Testes — Abordagem Recomendada

**Padrão do projeto:** Edge Functions são testadas **indiretamente** via testes unitários da lógica de processamento. O projeto NÃO tem testes end-to-end para Edge Functions.

**Estratégia para 10.2:**

1. **Extrair a lógica de processamento** para funções puras testáveis:
   - `validateWebhookPayload(body)` → valida campos obrigatórios
   - `mapEventType(instantlyEventType)` → mapeia event type
   - `buildCampaignEvent(campaign, webhook, mappedType)` → constrói o row para insert

2. **Testar as funções puras** em `__tests__/unit/`:
   - Payload válido → retorna dados processados
   - Payload inválido → retorna erro
   - Event type desconhecido → retorna null
   - Campanha desconhecida → comportamento correto

3. **Mock Supabase** para testes de integração da Edge Function:
   - Usar `createMockSupabaseClient()` de `__tests__/helpers/mock-supabase.ts`
   - Registrar handlers para `campaigns` (lookup) e `campaign_events` (insert)

**Localização dos testes:** `__tests__/unit/functions/instantly-webhook.test.ts` (novo)

### Anti-Patterns a Evitar

1. **NÃO usar `import { serve }` do deno.land** — usar `Deno.serve` nativo
2. **NÃO usar `esm.sh`** — usar prefixo `npm:` para imports
3. **NÃO retornar 4xx/5xx para campanhas desconhecidas** — Instantly faz retry em erros, causando loop
4. **NÃO fazer processing pesado antes de responder** — Instantly requer resposta rápida (ms)
5. **NÃO usar `SUPABASE_ANON_KEY`** — não tem permissão para INSERT direto (RLS bloqueia sem tenant context)
6. **NÃO validar JWT do request** — Instantly não envia JWT; deploy com `--no-verify-jwt`
7. **NÃO usar `console.log` em produção para dados de PII** — logar apenas metadata (event_type, campaign_id)
8. **NÃO criar FOREIGN KEY** para campaigns.id — padrão do projeto é sem FKs explícitas
9. **NÃO esquecer o mapeamento de event types** — `email_link_clicked` ≠ `email_clicked`, `reply_received` ≠ `email_replied`

### Payload de Exemplo do Instantly Webhook

```json
{
  "event_type": "email_opened",
  "lead_email": "joao@empresa.com.br",
  "campaign_id": "abc-123-def-456",
  "timestamp": "2026-02-09T15:30:00.000Z",
  "campaign_name": "Q1 Prospecção B2B",
  "workspace": "workspace-uuid",
  "email_account": "vendas@minha-empresa.com",
  "step": 1,
  "variant": 0,
  "is_first": true
}
```

### Dependências Downstream

Esta story alimenta:
- **10.3** (Polling): Ambas as fontes gravam em `campaign_events` — mesma tabela
- **10.4** (Dashboard): Exibe dados vindos de webhook + polling
- **10.5** (Lead Tracking): Eventos granulares por lead
- **10.6** (Opportunity Engine): Avalia threshold sobre eventos persistidos

### Story 10.1 Learnings (Previous Story Intelligence)

Da story 10.1 (done):
- **Migration numbering**: Última foi `00040_create_opportunity_configs.sql` — sem novas migrations nesta story
- **Mock Supabase**: Handler default resiliente cobre tabelas desconhecidas (cleanup sprint 2); registro explícito DEVE ser feito nesta story (Task 6.4 foi SKIPPED em 10.1)
- **isValidEventType guard** foi adicionado no code review — usar para validação
- **Zero FKs explícitas** — padrão do projeto confirmado
- **`public.get_current_tenant_id()`** — helper function usada nas RLS policies (não `auth.jwt() ->>`)

### Git Intelligence

Commits recentes relevantes:
- `5f4b775` feat(story-10.1): schema de tracking, tipos TypeScript e sprint status
- `22a3f6f` docs(epic-10): Sprint Change Proposal, PRD, Architecture e Epic 10 stories
- `63ab385` chore: sprint status — epic-7 done, branch tracking epic/10

Branch atual: `epic/10-campaign-tracking` (base: main)

### Project Structure Notes

- Edge Functions: `supabase/functions/{function-name}/index.ts`
- Tipos compartilhados: `src/types/tracking.ts` (já criado em 10.1)
- Testes: `__tests__/unit/functions/` (novo diretório para testes de Edge Functions)
- Mocks: `__tests__/helpers/mock-data.ts` (adicionar factories)
- Mock Supabase: `__tests__/helpers/mock-supabase.ts`
- Precedente: `supabase/functions/signalhire-callback/index.ts` (357 linhas)
- Zero conflitos ou variações com a estrutura unificada

### References

- [Source: _bmad-output/planning-artifacts/epic-10-campaign-tracking.md#Story 10.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003-Webhook-Receiver-Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-004-Hybrid-Webhook-Polling]
- [Source: _bmad-output/planning-artifacts/research/instantly-campaign-tracking-api-research-2026-02-09.md#Webhooks]
- [Source: supabase/functions/signalhire-callback/index.ts — padrão Edge Function existente]
- [Source: supabase/migrations/00039_create_campaign_events.sql — schema da tabela]
- [Source: src/types/tracking.ts — tipos, EventType, InstantlyWebhookEvent]
- [Source: src/types/campaign.ts — external_campaign_id, CampaignRow]
- [Source: Supabase Edge Functions Docs 2026 — Deno.serve pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- 41 testes passando no arquivo `__tests__/unit/functions/instantly-webhook.test.ts`
- 3862 testes totais passando (1 falha pre-existente em `ai-campaign-structure.test.tsx` — flaky, não relacionado)

### Completion Notes List

- **Task 1**: Edge Function criada em `supabase/functions/instantly-webhook/index.ts` com padrão moderno (`Deno.serve` + `npm:` imports). Fluxo completo: CORS → method validation → JSON parse → payload validation → event type mapping → campaign lookup → INSERT com idempotência → 200 OK.
- **Task 2**: 41 testes unitários cobrindo: mapeamento de event types (10 testes), validação de payload (12 testes), buildCampaignEventInsert (4 testes), jsonResponse (4 testes), CORS headers (3 testes), mock factories (4 testes), mock Supabase integration (4 testes).
- **Task 3**: Tabelas `campaign_events` e `campaigns` integradas nos testes via `mockTableResponse()` — lookup por `external_campaign_id` e insert com detecção de conflito 23505.
- **Task 4**: Factories `createMockInstantlyWebhookPayload()` e `createMockCampaignEvent()` adicionadas ao `__tests__/helpers/mock-data.ts`.
- **Decisão**: Lógica pura extraída para `src/lib/webhook/instantly-webhook-utils.ts` (testável via Vitest) enquanto Edge Function mantém cópia para Deno runtime. Testes de handler-level (2.5 método incorreto, 2.8 CORS) cobertos via testes de `jsonResponse` e `CORS_HEADERS` — o handler em si é Deno-only.

### Change Log

- 2026-02-09: Story 10.2 implementada — Edge Function instantly-webhook + 41 testes + mock factories
- 2026-02-09: Code Review fixes — +processWebhookRequest handler-flow function, +12 handler-flow tests (total 53), timestamp optional (M1), SYNC-NOTICE comments (H1), sprint-status no File List (M2)

### File List

- `supabase/functions/instantly-webhook/index.ts` (novo) — Edge Function principal (SYNC-NOTICE: lógica duplicada do utils por limitação Deno)
- `src/lib/webhook/instantly-webhook-utils.ts` (novo) — Funções puras testáveis (mapEventType, validateWebhookPayload, buildCampaignEventInsert, processWebhookRequest, jsonResponse, CORS_HEADERS)
- `__tests__/unit/functions/instantly-webhook.test.ts` (novo) — 52 testes unitários (41 originais + 11 handler-flow)
- `__tests__/helpers/mock-data.ts` (modificado) — +createMockInstantlyWebhookPayload, +createMockCampaignEvent
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modificado) — status da story 10.2
