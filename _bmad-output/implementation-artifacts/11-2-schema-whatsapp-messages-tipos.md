# Story 11.2: Schema WhatsApp Messages + Tipos

Status: done

## Story

As a developer,
I want a database schema and TypeScript types for WhatsApp messages tracking,
so that future stories (11.3–11.7) can persist sent messages, track delivery status, and maintain full tenant isolation with RLS.

## Acceptance Criteria

1. **Given** a Supabase migration `00042_create_whatsapp_messages.sql` **When** applied to the database **Then** a `whatsapp_messages` table exists with all required columns (id, tenant_id, campaign_id, lead_id, phone, message, status, external IDs, timestamps) **And** column types match the architecture conventions (UUID PKs, TIMESTAMPTZ, VARCHAR)

2. **Given** the `whatsapp_messages` table **When** a message status enum is defined **Then** a PostgreSQL ENUM `whatsapp_message_status` exists with values: `pending`, `sent`, `delivered`, `read`, `failed` **And** the `status` column uses this enum with default `pending`

3. **Given** the `whatsapp_messages` table **When** RLS is enabled **Then** 4 policies exist (SELECT, INSERT, UPDATE, DELETE) using `public.get_current_tenant_id()` **And** tenant isolation is enforced — users can only access messages belonging to their tenant

4. **Given** the `whatsapp_messages` table **When** queried for common access patterns **Then** indexes exist for: `(tenant_id)`, `(campaign_id, lead_id)`, `(campaign_id, status)` **And** a partial index exists for `external_message_id WHERE external_message_id IS NOT NULL`

5. **Given** the TypeScript types file `src/types/database.ts` **When** WhatsApp types are added **Then** `WhatsAppMessageStatus` type exists with the 5 status values **And** `WhatsAppMessage` interface mirrors the DB row **And** `WhatsAppMessageInsert` and `WhatsAppMessageUpdate` types exist following the project pattern (Omit for auto-generated fields)

6. **Given** the `Database` interface in `database.ts` **When** `whatsapp_messages` table is added **Then** it includes `Row`, `Insert`, `Update` entries following the existing pattern (campaigns, campaign_events, etc.)

7. **Given** the `whatsapp_messages` table **When** a row is updated **Then** the `updated_at` column is automatically set to `now()` via the existing `update_updated_at_column()` trigger

8. **Given** a UNIQUE constraint on `(campaign_id, lead_id, external_message_id)` **When** a duplicate Z-API message is inserted **Then** the insert is rejected, preventing duplicate message records (idempotency)

## Tasks / Subtasks

- [x] Task 1: Criar migration `00042_create_whatsapp_messages.sql` (AC: #1, #2, #7)
  - [x] 1.1 Criar ENUM `whatsapp_message_status` com DO $$ block (padrão existente)
  - [x] 1.2 Criar tabela `whatsapp_messages` com todas as colunas
  - [x] 1.3 Adicionar trigger `update_updated_at_column` para `updated_at`
- [x] Task 2: Criar indexes e constraints (AC: #4, #8)
  - [x] 2.1 Index composto `(campaign_id, lead_id)` para queries de histórico por lead
  - [x] 2.2 Index composto `(campaign_id, status)` para queries de status agregado
  - [x] 2.3 Index parcial `external_message_id` WHERE NOT NULL
  - [x] 2.4 UNIQUE constraint `(campaign_id, lead_id, external_message_id)` para idempotência
- [x] Task 3: Criar RLS policies (AC: #3)
  - [x] 3.1 Policy SELECT usando `get_current_tenant_id()`
  - [x] 3.2 Policy INSERT com WITH CHECK
  - [x] 3.3 Policy UPDATE com USING + WITH CHECK
  - [x] 3.4 Policy DELETE com USING
- [x] Task 4: Criar tipos TypeScript em `src/types/database.ts` (AC: #5, #6)
  - [x] 4.1 `WhatsAppMessageStatus` type union
  - [x] 4.2 `WhatsAppMessage` interface (Row)
  - [x] 4.3 `WhatsAppMessageInsert` type (Omit auto-generated)
  - [x] 4.4 `WhatsAppMessageUpdate` type (Partial)
  - [x] 4.5 Adicionar `whatsapp_messages` à interface `Database`
- [x] Task 5: Criar constantes e helpers (AC: #5)
  - [x] 5.1 `WHATSAPP_MESSAGE_STATUSES` array const para validação
  - [x] 5.2 `isValidWhatsAppMessageStatus()` type guard
- [x] Task 6: Testes unitários (AC: todos)
  - [x] 6.1 Testes dos tipos TypeScript (type assertions, type guards)
  - [x] 6.2 Testes das constantes e helpers
  - [x] 6.3 Testes da migration SQL (validação de schema no mock)

## Dev Notes

### Decisão Arquitetural: Estrutura da Tabela

A tabela `whatsapp_messages` armazena cada mensagem WhatsApp enviada via Z-API com tracking completo de status. Campos de ID externo (`external_message_id`, `external_zaap_id`) mapeiam diretamente para a resposta da Z-API (`messageId`, `zaapId`).

**Campos da tabela:**

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| tenant_id | UUID | NOT NULL | — | FK tenants, RLS |
| campaign_id | UUID | NOT NULL | — | FK campaigns |
| lead_id | UUID | NOT NULL | — | FK leads |
| phone | VARCHAR(20) | NOT NULL | — | Número do destinatário (formato E.164: 551199999999) |
| message | TEXT | NOT NULL | — | Conteúdo da mensagem enviada |
| status | whatsapp_message_status | NOT NULL | 'pending' | Estado atual da mensagem |
| external_message_id | VARCHAR(255) | NULL | — | Z-API messageId (retorno do send-text) |
| external_zaap_id | VARCHAR(255) | NULL | — | Z-API zaapId (retorno do send-text) |
| error_message | TEXT | NULL | — | Mensagem de erro (se status = 'failed') |
| sent_at | TIMESTAMPTZ | NULL | — | Timestamp de envio efetivo |
| created_at | TIMESTAMPTZ | NOT NULL | now() | Timestamp de criação |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | Atualizado automaticamente via trigger |

### Referência Z-API Send Text Response

[Source: story 11.1 — Z-API API Reference]

```
POST https://api.z-api.io/instances/{instanceId}/token/{instanceToken}/send-text
Response (200):
{
  "zaapId": "3999984263738042930CD6ECDE9VDWSA",
  "messageId": "D241XXXX732339502B68"
}
```

- `zaapId` → `external_zaap_id` (identificador interno Z-API)
- `messageId` → `external_message_id` (identificador da mensagem)

### Status Flow da Mensagem

```
pending → sent → delivered → read
    ↘ failed
```

- `pending`: Mensagem criada, aguardando envio via Z-API
- `sent`: Z-API retornou sucesso (200 + messageId)
- `delivered`: Confirmação de entrega (futuro: webhook Z-API)
- `read`: Confirmação de leitura (futuro: webhook Z-API)
- `failed`: Erro no envio (timeout, credencial inválida, número inválido)

### Padrão de Migration SQL — Referência

[Source: supabase/migrations/00039_create_campaign_events.sql]

Seguir exatamente o padrão da migration 00039:
- `DO $$ BEGIN ... EXCEPTION` para ENUMs
- Foreign keys com `ON DELETE CASCADE`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- 4 policies (SELECT, INSERT, UPDATE, DELETE)
- Trigger `update_updated_at_column`
- `COMMENT ON TABLE` e `COMMENT ON COLUMN`

### Padrão de Tipos TypeScript — Referência

[Source: src/types/database.ts]

Seguir o padrão existente:
- Interface `WhatsAppMessage` espelha Row do DB
- `WhatsAppMessageInsert = Omit<WhatsAppMessage, 'id' | 'created_at' | 'updated_at'>` com campos opcionais
- `WhatsAppMessageUpdate = Partial<Omit<WhatsAppMessage, 'id' | 'tenant_id' | 'created_at'>>`
- Adicionar à interface `Database.public.Tables`

### Project Structure Notes

- Migration: `supabase/migrations/00042_create_whatsapp_messages.sql`
- Tipos: `src/types/database.ts` (adicionar, não criar arquivo novo)
- Testes tipos: `__tests__/unit/types/database.test.ts` (adicionar testes)
- **NÃO** criar repositório/service/hook nesta story — escopo é apenas schema + tipos

### Padrões a Seguir (Obrigatórios)

1. **ENUM com DO $$ block** — padrão do projeto para evitar erro de duplicata
2. **FK com ON DELETE CASCADE** — padrão do projeto (tenants, campaigns, leads)
3. **RLS com `get_current_tenant_id()`** — função existente, usar diretamente
4. **Trigger `update_updated_at_column`** — função existente, apenas criar trigger
5. **COMMENT ON** — documentar tabela e colunas críticas em português
6. **`as const` arrays** — para `WHATSAPP_MESSAGE_STATUSES` (padrão SERVICE_NAMES)
7. **Type guards** — `isValidWhatsAppMessageStatus()` (padrão `isValidRole`)

### Anti-Patterns a Evitar

1. **NÃO** criar service, hook, ou componente UI — escopo é APENAS schema + tipos
2. **NÃO** usar `any` — strict typing em tudo
3. **NÃO** usar `console.log` — ESLint enforces no-console
4. **NÃO** criar arquivo de tipos separado — adicionar ao `database.ts` existente
5. **NÃO** usar `space-y-*` — projeto usa `flex flex-col gap-*` (Tailwind v4)
6. **NÃO** criar tabela sem RLS — TODAS as tabelas precisam de RLS neste projeto
7. **NÃO** esquecer o trigger de `updated_at` — toda tabela com `updated_at` precisa
8. **NÃO** usar VARCHAR para status — usar PostgreSQL ENUM (padrão `lead_status`)
9. **NÃO** duplicar definição de Database interface — estender a existente

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-10.md#Stories de Alto Nível] — Definição da story 11.2
- [Source: _bmad-output/implementation-artifacts/11-1-zapi-integration-service-config.md#Z-API API Reference] — Formato de resposta Z-API (zaapId, messageId)
- [Source: _bmad-output/implementation-artifacts/11-1-zapi-integration-service-config.md#Critical Implementation Decision] — Padrão de storage de credenciais Z-API
- [Source: supabase/migrations/00039_create_campaign_events.sql] — Padrão de migration com RLS
- [Source: supabase/migrations/00040_create_opportunity_configs.sql] — Padrão de ENUM + trigger
- [Source: src/types/database.ts] — Padrão de tipos TS (Row, Insert, Update, Database interface)
- [Source: src/types/integration.ts] — Padrão de `as const` arrays e type guards
- [Source: _bmad-output/planning-artifacts/architecture.md] — ADR-005 WhatsApp preparational architecture

### Previous Story Intelligence (11.1)

**Learnings from Story 11.1:**
- Z-API usa 3 credenciais (instanceId, instanceToken, securityToken) — já armazenadas como JSON criptografado em `api_configs`
- IntegrationCard ganhou suporte multi-field via prop `fields`
- `ZApiService` extends `ExternalService` — herda retry, timeout
- Migration 00041 expandiu `key_suffix` para VARCHAR(200) para JSON
- 44 testes adicionados (24 service, 12 card, 3 hook, 5 actions)
- Pattern: `ExternalServiceError` para erros tipados com mensagem em português

**Files created/modified in 11.1:**
- `src/lib/services/zapi.ts` — ZApiService (reutilizar `ZApiCredentials`, `buildZApiUrl`, `buildZApiHeaders`)
- `src/types/integration.ts` — `"zapi"` adicionado a `SERVICE_NAMES`
- `supabase/migrations/00041_expand_key_suffix_for_zapi.sql` — última migration

### Git Intelligence

**Commit mais recente:** `9898abb feat(story-11.1): Z-API integration service + config + code review fixes`
**Branch:** `epic/11-whatsapp-integration`
**17 arquivos** no commit 11.1 — padrões consolidados de service, types, tests

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Teste `Object.isFrozen` falhou para `as const` array — `as const` é compile-time only, corrigido para validar conteúdo em vez de freeze state.

### Completion Notes List

- Migration `00042_create_whatsapp_messages.sql` criada com ENUM (DO $$ block), tabela com 12 colunas, 3 FKs com CASCADE, trigger updated_at, 4 indexes (tenant_id, campaign_lead, campaign_status, partial external_message_id), UNIQUE constraint de idempotência, 4 RLS policies, e COMMENT ON em tabela e 6 colunas.
- Tipos TypeScript adicionados a `database.ts`: `WhatsAppMessageStatus` (union 5 valores), `WhatsAppMessage` (interface Row com 12 campos), `WhatsAppMessageInsert` (Omit auto-generated, status opcional), `WhatsAppMessageUpdate` (Partial sem immutáveis).
- `whatsapp_messages` adicionado à interface `Database.public.Tables` com Row/Insert/Update.
- `WHATSAPP_MESSAGE_STATUSES` array const e `isValidWhatsAppMessageStatus()` type guard criados.
- 52 testes da story: 31 em `database.test.ts` (18 novos para WhatsApp types) + 21 em `00042-whatsapp-messages.test.ts` (migration SQL validation).
- 232 test files, 4149 tests passing, 0 failures, 0 regressões.

### Change Log

- 2026-02-10: Story 11.2 implementada — schema WhatsApp messages + tipos TS + 52 testes
- 2026-02-10: Code Review (Amelia) — 5 issues encontradas (1 HIGH, 3 MEDIUM, 1 LOW), todas corrigidas:
  - HIGH: `WhatsAppMessageInsert` — `status` não era realmente opcional (intersection type bug). Fix: adicionado `"status"` ao Omit.
  - MEDIUM: Teste Database interface era no-op (`expect(true).toBe(true)`). Fix: substituído por 3 testes com assertivas reais.
  - MEDIUM: Organização inconsistente — WhatsApp types definidos após Database interface. Fix: movidos para antes.
  - MEDIUM: Index `idx_whatsapp_messages_campaign_lead` redundante (coberto pelo UNIQUE constraint). Fix: removido.
  - LOW: Testes de COMMENT ON incompletos (faltavam `error_message`, `sent_at`). Fix: adicionados.
  - 232 test files, 4150 tests passing, 0 failures, 0 regressões.

### File List

- `supabase/migrations/00042_create_whatsapp_messages.sql` (novo — index redundante removido no code review)
- `src/types/database.ts` (modificado — WhatsApp types + Database interface, reorganizado + Insert fix no code review)
- `__tests__/unit/types/database.test.ts` (modificado — 20 novos testes WhatsApp, Database interface test corrigido no code review)
- `__tests__/unit/migrations/00042-whatsapp-messages.test.ts` (novo — 20 testes de validação SQL, comments test expandido no code review)
