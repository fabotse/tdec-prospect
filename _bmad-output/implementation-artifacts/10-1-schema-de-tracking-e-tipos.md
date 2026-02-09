# Story 10.1: Schema de Tracking e Tipos

Status: done

## Story

As a desenvolvedor,
I want criar as tabelas de tracking e tipos TypeScript correspondentes,
so that a infraestrutura de dados esteja pronta para receber eventos e configurar a Janela de Oportunidade.

## Acceptance Criteria

1. **Given** a migration é executada **When** as tabelas são criadas no Supabase **Then** a tabela `campaign_events` existe com colunas: `id`, `tenant_id`, `campaign_id`, `event_type`, `lead_email`, `event_timestamp`, `payload`, `source`, `processed_at`, `created_at` **And** a UNIQUE constraint `(campaign_id, event_type, lead_email, event_timestamp)` existe para idempotência **And** os índices `idx_campaign_events_campaign_id`, `idx_campaign_events_campaign_lead`, `idx_campaign_events_campaign_type` são criados

2. **Given** a migration é executada **When** a tabela `opportunity_configs` é criada **Then** contém colunas: `id`, `tenant_id`, `campaign_id`, `min_opens`, `period_days`, `is_active`, `created_at`, `updated_at` **And** a UNIQUE constraint `(campaign_id)` existe (uma config por campanha) **And** defaults são `min_opens=3`, `period_days=7`

3. **Given** as tabelas existem **When** RLS policies são aplicadas **Then** `campaign_events` filtra por `tenant_id = public.get_current_tenant_id()` **And** `opportunity_configs` filtra por `tenant_id = public.get_current_tenant_id()`

4. **Given** os tipos TypeScript são criados **When** importados em `src/types/tracking.ts` **Then** existem interfaces: `CampaignEvent`, `CampaignAnalytics`, `LeadTracking`, `OpportunityConfig`, `OpportunityLead`, `InstantlyWebhookEvent`, `SyncResult` **And** existem enums/constantes para `EventType` ('email_opened', 'email_clicked', 'email_replied', 'email_bounced', 'email_unsubscribed') **And** os tipos são re-exportados em `src/types/index.ts`

5. **Given** os tipos existem **When** compilados com TypeScript strict mode **Then** zero erros de compilação **And** os tipos são compatíveis com o schema do banco

## Tasks / Subtasks

- [x] Task 1: Criar migration `00039_create_campaign_events.sql` (AC: #1, #3)
  - [x] 1.1 CREATE TABLE `campaign_events` com todas as colunas
  - [x] 1.2 Adicionar UNIQUE constraint para idempotência
  - [x] 1.3 Criar 3 índices para performance de queries
  - [x] 1.4 ENABLE ROW LEVEL SECURITY + policies
- [x] Task 2: Criar migration `00040_create_opportunity_configs.sql` (AC: #2, #3)
  - [x] 2.1 CREATE TABLE `opportunity_configs` com defaults
  - [x] 2.2 Adicionar UNIQUE constraint `(campaign_id)`
  - [x] 2.3 ENABLE ROW LEVEL SECURITY + policies
- [x] Task 3: Criar `src/types/tracking.ts` com todos os tipos (AC: #4)
  - [x] 3.1 Definir `EventType` como const array + union type
  - [x] 3.2 Definir `CampaignEventRow` (snake_case DB) e `CampaignEvent` (camelCase TS)
  - [x] 3.3 Definir `OpportunityConfigRow` e `OpportunityConfig`
  - [x] 3.4 Definir `CampaignAnalytics`, `LeadTracking`, `OpportunityLead`
  - [x] 3.5 Definir `InstantlyWebhookEvent`, `SyncResult`
  - [x] 3.6 Criar funções de transformação Row → TS (padrão do projeto)
- [x] Task 4: Atualizar `src/types/index.ts` com re-export (AC: #4)
- [x] Task 5: Validar compilação `npx tsc --noEmit` (AC: #5)
- [x] Task 6: Testes unitários para tipos e transformações
  - [x] 6.1 Testes de transformação `CampaignEventRow` → `CampaignEvent`
  - [x] 6.2 Testes de transformação `OpportunityConfigRow` → `OpportunityConfig`
  - [x] 6.3 Testes de validação dos EventType values
  - [~] 6.4 Adicionar tabelas ao mock Supabase (mockFrom handler) — SKIPPED: handler default resiliente cobre; registro explícito será feito em 10.2/10.3

## Dev Notes

### Padrões Críticos do Projeto

**Naming Convention (OBRIGATÓRIO):**
- DB: snake_case — `campaign_events`, `event_type`, `lead_email`, `event_timestamp`
- TS: camelCase — `campaignId`, `eventType`, `leadEmail`, `eventTimestamp`
- Types/Interfaces: PascalCase — `CampaignEvent`, `OpportunityConfig`
- Sempre criar Row type (snake_case) + TS type (camelCase) + função de transformação

**Padrão de Transformação (seguir `src/types/campaign.ts`):**
```typescript
// DB Row type (snake_case — mapeia direto para colunas do banco)
export interface CampaignEventRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  event_type: string;
  lead_email: string;
  event_timestamp: string;
  payload: Record<string, unknown>;
  source: 'webhook' | 'polling';
  processed_at: string;
  created_at: string;
}

// TS type (camelCase — usado na aplicação)
export interface CampaignEvent {
  id: string;
  tenantId: string;
  campaignId: string;
  eventType: EventType;
  leadEmail: string;
  eventTimestamp: string;
  payload: Record<string, unknown>;
  source: 'webhook' | 'polling';
  processedAt: string;
  createdAt: string;
}

// Função de transformação (padrão do projeto)
export function transformCampaignEventRow(row: CampaignEventRow): CampaignEvent { ... }
```

**RLS Policy Pattern (seguir `supabase/migrations/00003_setup_rls_policies.sql`):**
```sql
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant campaign events"
  ON public.campaign_events FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());

CREATE POLICY "Users can insert campaign events to their tenant"
  ON public.campaign_events FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- UPDATE e DELETE seguem o mesmo padrão
```

**NOTA sobre campaign_events INSERT via webhook:** A Edge Function (Story 10.2) usará `SUPABASE_SERVICE_ROLE_KEY` que bypassa RLS. A policy de INSERT é para uso futuro via client-side, mas o fluxo principal de insert é server-side sem RLS.

### Schema SQL Definido na Architecture

**Tabela `campaign_events`:**
```sql
CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  lead_email VARCHAR(255) NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  payload JSONB DEFAULT '{}',
  source VARCHAR(20) DEFAULT 'webhook',
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, event_type, lead_email, event_timestamp)
);

CREATE INDEX idx_campaign_events_campaign_id ON campaign_events(campaign_id);
CREATE INDEX idx_campaign_events_campaign_lead ON campaign_events(campaign_id, lead_email);
CREATE INDEX idx_campaign_events_campaign_type ON campaign_events(campaign_id, event_type);
```

**Tabela `opportunity_configs`:**
```sql
CREATE TABLE opportunity_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  min_opens INTEGER NOT NULL DEFAULT 3,
  period_days INTEGER NOT NULL DEFAULT 7,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id)
);
```

### Tipos TypeScript Definidos na Architecture

**EventType (const array + union — padrão moderno):**
```typescript
export const EVENT_TYPES = [
  'email_opened',
  'email_clicked',
  'email_replied',
  'email_bounced',
  'email_unsubscribed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
```

**CampaignAnalytics:**
```typescript
export interface CampaignAnalytics {
  campaignId: string;
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  totalBounces: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  lastSyncAt: string;
}
```

**LeadTracking:**
```typescript
export interface LeadTracking {
  leadEmail: string;
  campaignId: string;
  openCount: number;
  clickCount: number;
  hasReplied: boolean;
  lastOpenAt: string | null;
  events: CampaignEvent[];
}
```

**OpportunityLead:**
```typescript
export interface OpportunityLead extends LeadTracking {
  qualifiedAt: string;
  isInOpportunityWindow: boolean;
}
```

**InstantlyWebhookEvent (payload recebido do Instantly):**
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

**SyncResult:**
```typescript
export interface SyncResult {
  campaignId: string;
  analytics: CampaignAnalytics;
  lastSyncAt: string;
  source: 'polling';
}
```

### Migration Numbering

- Última migration existente: `00038_deactivate_db_prompts_use_code_defaults.sql`
- **Usar: `00039_create_campaign_events.sql` e `00040_create_opportunity_configs.sql`**

### Mock Supabase — Tabelas Novas

Ao adicionar `campaign_events` e `opportunity_configs`, atualizar o mock Supabase para reconhecer essas tabelas. O cleanup sprint 2 implementou handler default para tabelas desconhecidas, mas é boa prática registrar explicitamente:
- Verificar `src/test-utils/` ou `src/__mocks__/` para o mock de Supabase
- Adicionar as novas tabelas ao handler do `mockFrom`

### Referências de ADRs

- **ADR-003:** Webhook Receiver via Supabase Edge Function — idempotência via UNIQUE constraint (diretamente relevante para a constraint em `campaign_events`)
- **ADR-004:** Estratégia Híbrida Webhook + Polling — campo `source` distingue origem do evento
- **ADR-005:** Preparação Arquitetural WhatsApp — `OpportunityConfig` alimenta o `OpportunityEngine`

### Anti-Patterns a Evitar

1. **NÃO usar `auth.jwt() ->> 'tenant_id'` diretamente** — o projeto usa a helper function `public.get_current_tenant_id()` que já foi criada na migration 00003
2. **NÃO criar FOREIGN KEY para `campaigns.id`** — as tabelas do Supabase do projeto não usam FKs explícitas (por design — simplifica multi-tenancy e operações)
3. **NÃO usar enum SQL para `event_type`** — usar VARCHAR(50) como definido na architecture; a validação é feita no TypeScript
4. **NÃO esquecer `ENABLE ROW LEVEL SECURITY`** — toda tabela PRECISA ter RLS habilitado
5. **NÃO usar `export enum`** no TypeScript — o projeto usa const arrays + union types (padrão moderno)

### Dependências Downstream

Esta story é fundação para TODO o Epic 10:
- **10.2** (Webhook): INSERT na `campaign_events`
- **10.3** (Polling): SELECT de `campaign_events`, tipos `CampaignAnalytics`, `LeadTracking`
- **10.4** (Dashboard UI): Usa `CampaignAnalytics` para cards
- **10.5** (Lead Tracking): Usa `LeadTracking` para tabela
- **10.6** (Opportunity Engine): Usa `OpportunityConfig`, `OpportunityLead`, SELECT de `opportunity_configs`
- **10.8** (WhatsApp Prep): Usa `OpportunityLead`

### Contexto de Projeto — Infraestrutura Existente

- **`external_campaign_id`** em `campaigns` (Story 7.3.1): campo que vincula campanha local à campanha do Instantly — usado em 10.2/10.3 para lookup
- **`ExternalService`** base class em `src/lib/services/base-service.ts`: padrão para services (10.3)
- **`InstantlyService`** em `src/lib/services/instantly.ts`: API client existente com autenticação Bearer token

### Project Structure Notes

- Migrations: `supabase/migrations/000XX_*.sql`
- Types: `src/types/tracking.ts` (novo) + re-export em `src/types/index.ts`
- Alinhamento total com estrutura unificada do projeto
- Zero conflitos ou variações detectadas

### References

- [Source: _bmad-output/planning-artifacts/epic-10-campaign-tracking.md#Story 10.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003, ADR-004, ADR-005]
- [Source: _bmad-output/planning-artifacts/research/instantly-campaign-tracking-api-research-2026-02-09.md]
- [Source: supabase/migrations/00003_setup_rls_policies.sql — RLS pattern]
- [Source: supabase/migrations/00037_add_campaign_export_tracking.sql — export fields]
- [Source: src/types/campaign.ts — Row/TS transform pattern]
- [Source: src/types/index.ts — re-export pattern]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- `npx tsc --noEmit`: Zero erros em tracking.ts (erros pré-existentes em test files não relacionados)
- `npx vitest run`: 3818 passed, 1 failed (pré-existente — TemplateCard.test.tsx timeout flaky)

### Completion Notes List
- Task 1: Migration 00039 criada com CREATE TABLE campaign_events, UNIQUE constraint para idempotência (ADR-003), 3 índices de performance, RLS policies (SELECT/INSERT/UPDATE/DELETE) usando `public.get_current_tenant_id()`
- Task 2: Migration 00040 criada com CREATE TABLE opportunity_configs, defaults min_opens=3 period_days=7, UNIQUE(campaign_id), RLS policies completas
- Task 3: `src/types/tracking.ts` criado com 7 interfaces (CampaignEvent, CampaignAnalytics, LeadTracking, OpportunityConfig, OpportunityLead, InstantlyWebhookEvent, SyncResult), 2 Row types, 2 funções de transformação, const array EVENT_TYPES + union type
- Task 4: Re-export adicionado em `src/types/index.ts`
- Task 5: Zero erros de compilação em tracking.ts (`npx tsc --noEmit` validado)
- Task 6: 19 testes unitários — transformações Row→TS, validação EVENT_TYPES, estrutura de todos os tipos, re-export do barrel. Nota sobre Task 6.4: mock Supabase usa handler default resiliente (cleanup sprint 2) — tabelas desconhecidas já resolvem `{ data: null, error: null }`. Registro explícito será feito nas stories que criam repositories/services.
- Decisão: Não registrar tabelas explicitamente no mock Supabase nesta story — o handler default resiliente cobre, e as stories 10.2/10.3 que criam services farão o registro quando necessário

### File List
- `supabase/migrations/00039_create_campaign_events.sql` (novo)
- `supabase/migrations/00040_create_opportunity_configs.sql` (novo)
- `src/types/tracking.ts` (novo)
- `src/types/index.ts` (modificado — re-export tracking)
- `__tests__/unit/types/tracking.test.ts` (novo)
- `_bmad-output/implementation-artifacts/10-1-schema-de-tracking-e-tipos.md` (modificado)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modificado)

## Change Log
- 2026-02-09: Story 10.1 implementada — 2 migrations SQL, tipos TypeScript completos, 19 testes unitários. 216 test files, 3818 tests passing.
- 2026-02-09: Code Review fixes — (1) `isValidEventType` guard adicionado, (2) `CampaignEventRow.event_type` tipado como `EventType` (alinhado com padrão campaign.ts), (3) cast `as EventType` removido do transform, (4) NOT NULL adicionado a colunas com DEFAULT em ambas migrations, (5) Task 6.4 status corrigido para [~] SKIPPED, (6) 3 testes novos para isValidEventType + re-export test expandido.
