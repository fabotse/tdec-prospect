---
baseline_commit: e7355f66af8df192c6bc392c0080eca9d86584e7
---

# Story 21.1: Schema de Oportunidades, Tipos e Validação Real do Spike

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor,
I want criar a estrutura de dados do loop de resposta (tabelas `opportunities`, `notification_settings`, `app_notifications` + tipos TypeScript) e concluir as validações reais pendentes do spike,
so that as stories seguintes (21.2–21.7) tenham fundação de dados sólida e zero incerteza operacional.

## Acceptance Criteria

1. **Given** a migration é aplicada **When** o schema é inspecionado **Then** existe a tabela `opportunities` com: `id`, `tenant_id`, `lead_id`, `campaign_id`, `source` (enum: `reply`/`engagement`), `reply_event_id` (FK `campaign_events`, nullable), `reply_text`, `reply_subject`, `unibox_url`, `intent` (enum: `interessado`/`pediu_info`/`objecao`/`nao_agora`/`opt_out`, nullable), `lt_interest_status` (int, nullable), `suggestion` (text, nullable), `status` (enum: `new`/`viewed`/`contacted`/`meeting_booked`/`discarded`), `meeting_booked_at` (nullable), `created_at`, `updated_at` **And** constraint UNIQUE em `reply_event_id` (idempotência — NFR2)

2. **Given** a migration é aplicada **Then** existem as tabelas `notification_settings` (por tenant: números WhatsApp destino, canais habilitados) e `app_notifications` (in-app persistida: `tenant_id`, `type`, `payload` JSONB, `read_at` nullable)

3. **Given** as tabelas novas **Then** RLS por `tenant_id` aplicada no padrão existente **And** trigger `update_updated_at_column()` **And** índices `idx_opportunities_tenant_status`, `idx_opportunities_lead_id`, `idx_app_notifications_tenant_unread`

4. **Given** os tipos TypeScript **Then** existem `Opportunity`, `OpportunityRow`, `NotificationSettings`, `AppNotification` com funções de transformação `toOpportunity()`/`toOpportunityRow()` e testes unitários

5. **Given** o banco do ambiente de referência **When** executo `SELECT payload FROM campaign_events WHERE event_type='email_replied' LIMIT 5` **Then** o resultado (payload real com/sem `reply_text`) é documentado no artefato do spike, junto com: webhook registrado no workspace (ou registrado via API de webhooks), gating de plano verificado, escopo `emails:read` da API key conferido

6. **Given** a migration segue o padrão defensivo do projeto **Then** usa `to_regclass`/idempotência (aprendizado do banco gerenciado à mão — migration 00053)

## Tasks / Subtasks

- [x] **Task 1: Migration `00055_create_opportunities_schema.sql`** (AC: #1, #2, #3, #6)
  - [x] 1.1 `CREATE TABLE IF NOT EXISTS public.opportunities` com todas as colunas do AC1, CHECKs de `source`/`intent`/`status`, FKs conforme "Decisão de Foreign Keys" (Dev Notes), e `CONSTRAINT uq_opportunities_reply_event_id UNIQUE (reply_event_id)`
  - [x] 1.2 `CREATE TABLE IF NOT EXISTS public.notification_settings` (1 linha por tenant: `UNIQUE (tenant_id)`; colunas `whatsapp_numbers`, `channels`, `notify_intents` — ver schema em Dev Notes)
  - [x] 1.3 `CREATE TABLE IF NOT EXISTS public.app_notifications` (`type`, `payload` JSONB, `read_at` nullable, `created_at`)
  - [x] 1.4 Índices `idx_opportunities_tenant_status`, `idx_opportunities_lead_id`, `idx_app_notifications_tenant_unread` (parcial `WHERE read_at IS NULL`) — todos com `CREATE INDEX IF NOT EXISTS`
  - [x] 1.5 Triggers `update_updated_at_column()` em `opportunities` e `notification_settings` (padrão `DROP TRIGGER IF EXISTS ...; CREATE TRIGGER ...`). `app_notifications` NÃO tem `updated_at`/trigger (imutável exceto `read_at`)
  - [x] 1.6 `ENABLE ROW LEVEL SECURITY` + 4 policies (SELECT/INSERT/UPDATE/DELETE) por tabela, padrão `tenant_id = public.get_current_tenant_id()` (com `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`)
  - [x] 1.7 Garantir idempotência total da migration (AC6): tudo em `IF NOT EXISTS` / `DROP ... IF EXISTS` — a migration deve reaplicar sem erro em banco que já a rodou
- [x] **Task 2: Tipos TypeScript `src/types/opportunity.ts`** (AC: #4)
  - [x] 2.1 `const` arrays + union types + guards `isValid*`: `OPPORTUNITY_SOURCES`, `OPPORTUNITY_INTENTS`, `OPPORTUNITY_STATUSES` (padrão `EVENT_TYPES`/`isValidEventType` de `tracking.ts`)
  - [x] 2.2 `OpportunityRow` (snake_case) + `Opportunity` (camelCase) + `toOpportunity(row): Opportunity` + `toOpportunityRow(opp): OpportunityRow`
  - [x] 2.3 `NotificationSettingsRow` + `NotificationSettings` + `toNotificationSettings(row)`
  - [x] 2.4 `AppNotificationRow` + `AppNotification` + `toAppNotification(row)`
  - [x] 2.5 Re-export em `src/types/index.ts` (`export * from "./opportunity";`)
- [x] **Task 3: Testes unitários `__tests__/unit/types/opportunity.test.ts`** (AC: #4)
  - [x] 3.1 Round-trip `toOpportunity`/`toOpportunityRow` (Row→TS→Row idêntico) incluindo campos nullable (`lead_id`, `reply_event_id`, `intent`, `lt_interest_status`, `suggestion`, `meeting_booked_at`)
  - [x] 3.2 Transforms de `NotificationSettings` e `AppNotification` (incl. `read_at` null)
  - [x] 3.3 Guards `isValid*` e contagem/valores dos `const` arrays
- [x] **Task 4: Validar compilação e suíte** (`npx tsc --noEmit` sem novos erros em `src/`; `npx vitest run` verde)
- [x] **Task 5: Validação real do spike (AC: #5) — ✅ CONCLUÍDA em 2026-07-13 (durante o create-story, com acesso real à conta Instantly e ao DB do cliente)**
  - [x] 5.1 ~~Script `inspect-reply-events.mjs`~~ DESNECESSÁRIO — `campaign_events` tem **0 linhas** (verificado via REST + service role); não há payload a inspecionar no banco
  - [x] 5.2 Query real executada: `count(campaign_events) = 0`; `count(event_type='email_replied') = 0` — o webhook **nunca** esteve ativo
  - [x] 5.3 As 4 pendências fechadas com chamadas reais — resultados completos na seção "✅ VALIDAÇÃO REAL EXECUTADA" do artefato do spike: (1) nenhum webhook registrado; (2) webhooks **bloqueados** no plano do cliente, mas **`GET /api/v2/emails` funciona** (amostra real com `body.text` completo); (3) backfill via banco impossível / **via API possível** (histórico desde mar/2026); (4) escopo da chave = `all:all`
  - [x] 5.4 Veredito do gating registrado no `sprint-status.yaml` — **cláusula condicional do épico ATIVADA**: polling vira o caminho primário (re-sequenciamento 21.2/21.6/21.8 em decisão com Fabossi)
- [~] **Task 6: Mock Supabase** — **SKIPPED** (como na 10.1): esta story não cria repository/service/API que consulte essas tabelas; o handler default resiliente (cleanup sprint 2) cobre tabelas desconhecidas com `{ data: null, error: null }` — o teste de re-export via barrel `@/types` passou por ele sem registro explícito. Registro explícito será feito em 21.2+ quando houver processador/queries.

### Review Findings

**Code review 3 camadas adversariais (Blind Hunter / Edge Case Hunter / Acceptance Auditor — modo full) — 2026-07-13**

Resultado: **0 patch, 0 decision-needed, 6 defers, 8 dismiss.** Acceptance Auditor: **6/6 ACs SATISFEITOS**, 0 violação de AC, 0 anti-pattern quebrado → ACCEPT. Suíte da story reconfirmada de forma independente durante a review: **27/27 testes verdes + eslint limpo**. Nenhum defeito no escopo entregue (schema + tipos + testes) — os defers são riscos/hardening que pertencem às stories consumidoras (21.2/21.5/21.7), não à fundação.

_Defers (registrados também em `deferred-work.md`):_

- [x] [Review][Defer] Premissa de idempotência de reply não forçada no schema [supabase/migrations/00055_create_opportunities_schema.sql:30-47] — deferred p/ 21.2: `source='reply'` aceita `reply_event_id` NULL, e no Postgres NULLs são distintos no índice UNIQUE → dois ingests do mesmo reply podem duplicar card. NFR2 depende de a 21.2 sempre popular `reply_event_id` + usar `ON CONFLICT`. Opção belt-and-suspenders: `CHECK (source <> 'reply' OR reply_event_id IS NOT NULL)` em migration futura.
- [x] [Review][Defer] Engajamentos sem chave de dedup [supabase/migrations/00055_create_opportunities_schema.sql:44-46] — deferred p/ 21.2/21.6: `source='engagement'` (reply_event_id NULL) não tem unique → polling pode inserir cards duplicados. Dedup na app (21.2) ou índice parcial `UNIQUE(tenant_id, campaign_id, lead_id) WHERE source='engagement'` em migration futura.
- [x] [Review][Defer] `toNotificationSettings` não defende `channels` JSONB parcial/malformado [src/types/opportunity.ts:184-187] — deferred p/ 21.7: chave `in_app` ausente → `inApp: undefined` (tipo declara `boolean`); `channels` null/array → throw. Segue a convenção do projeto (transforms sem defesa, confiam no schema); revisitar quando 21.7 criar o writer de settings.
- [x] [Review][Defer] Conteúdo de JSONB (`notify_intents`/`whatsapp_numbers`/`payload`) sem validação nos transforms [src/types/opportunity.ts:183,188,224] — deferred p/ 21.7: `notify_intents` pode conter intent inválida sem passar por `isValidOpportunityIntent`; considerar validação/CHECK de conteúdo quando houver writer.
- [x] [Review][Defer] `app_notifications` "imutável exceto read_at" documentado mas RLS de UPDATE permite mutar qualquer coluna [supabase/migrations/00055_create_opportunities_schema.sql:178-182] — deferred p/ 21.7: a policy só checa `tenant_id`; um usuário do tenant pode reescrever `type`/`payload`. Sem brecha cross-tenant; writes reais são via service-role. Enforçar via trigger/policy coluna-scoped quando o update path existir.
- [x] [Review][Defer] Sem CHECK acoplando `meeting_booked_at`↔`status='meeting_booked'` nem guarda de transição de status [supabase/migrations/00055_create_opportunities_schema.sql:39-41] — deferred p/ 21.5: o ciclo de vida do card é ilustrativo (CHECK valida o valor, não a transição); enforcement pertence às ações do card (21.5).

_Dismiss (8): naming `toX` vs `transformXRow` (AC4 nomeou explicitamente `toOpportunity`/`toOpportunityRow` + precedente `toAIPrompt` + story pré-autorizou coexistência); guards não usados dentro dos transforms (convenção do projeto — mapeamento direto, DB CHECK valida na escrita); testes "narrows type correctly" (inofensivos; cobertura comportamental existe via casos true/false); transforms reversos assimétricos só p/ Opportunity (conforme AC4 + YAGNI p/ writers da 21.7); `CREATE TABLE IF NOT EXISTS` × shape-drift (irrelevante — as 3 tabelas são novas, sem shape anterior a reconciliar); índice em `campaign_id` + ausência de BEGIN/COMMIT (YAGNI + migration já aplicada sem erro); testes não exercitam JSONB malformado (par dos defers de transform; sem consumidor hoje); nota estrutural obsoleta `inspect-reply-events.mjs` (só doc; task cancelada)._

## Dev Notes

Esta é a **story de fundação do Epic 21** — só schema + tipos + validação do spike. **Não** cria services, API routes, UI nem processadores (isso é 21.2+). Espelhe estruturalmente a **Story 10.1** (`10-1-schema-de-tracking-e-tipos.md`), que fez exatamente isto para o Epic 10.

### Decisão de Foreign Keys (LEIA — reconcilia contradição no histórico)

A Story 10.1 (era do Epic 10) trazia o anti-pattern _"NÃO criar FOREIGN KEY"_. **Isso está desatualizado**: a partir da migration **00042** (`whatsapp_messages`, Epic 11) o projeto passou a usar FKs com `ON DELETE`. Além disso, o **AC1 exige** FK em `reply_event_id`. Portanto, para `opportunities` use FKs assim:

| Coluna | FK / Nullability | Motivo |
|---|---|---|
| `tenant_id` | `NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE` | Core, sempre válido (padrão 00042) |
| `lead_id` | **nullable**, `REFERENCES public.leads(id) ON DELETE SET NULL` | 21.2 AC5: oportunidade é criada mesmo se o lead não existir na base → `lead_id` NULL é tratado em toda a cadeia |
| `campaign_id` | `NOT NULL`, **SEM FK** | Espelha a tabela-fonte `campaign_events` (00039, sem FK) e o tratamento de "campanha desconhecida" do webhook. FK aqui arriscaria falha de INSERT no banco gerido à mão. Defensivo (espírito do AC6) |
| `reply_event_id` | **nullable**, `REFERENCES public.campaign_events(id) ON DELETE SET NULL` | Exigido pelo AC1. `SET NULL` preserva a oportunidade se o evento for removido. `campaign_events` é nossa (controlada) → FK segura |

**Sutileza crítica da `UNIQUE (reply_event_id)`:** no Postgres, `NULL` é distinto em índice UNIQUE — múltiplas linhas com `reply_event_id = NULL` são permitidas. Isso é **exatamente o desejado**: idempotência (1 oportunidade por resposta) para `source='reply'`, e ao mesmo tempo N oportunidades `source='engagement'` (que têm `reply_event_id` nulo) sem colidir. Documente isso num comentário SQL.

### Decisão de enum: TEXT + CHECK (NÃO Postgres ENUM)

`source`, `intent`, `status` são "enum" conceituais. Use **`TEXT` + `CHECK (... IN (...))`**, não `CREATE TYPE ... AS ENUM`.

- Precedente mais recente e explícito: **Epic 20 / AD-1 / migration 00053** escolheu `TEXT + CHECK` sobre ENUM nativo, justamente pela dor de `ALTER TYPE` em banco gerenciado à mão (drift de schema — ver memória do projeto).
- `intent`/`status` do loop de resposta tendem a evoluir; TEXT+CHECK é trivial de alterar (drop+add constraint) vs. ENUM.
- A migration 00042 (whatsapp) usou ENUM nativo, mas a diretriz posterior (00053) migrou para TEXT+CHECK. **Siga 00053.**

`CHECK` de coluna nullable: `CHECK (intent IS NULL OR intent IN (...))`. Para `status` (NOT NULL, default `'new'`): `CHECK (status IN (...))`.

### `lt_interest_status`: coluna INT, mas API entrega string

O AC1 pede `lt_interest_status` **INTEGER** nullable. Atenção: o código existente tipa esse campo como **string** (`InstantlyLeadEntry.lt_interest_status?: string` em `src/types/tracking.ts:309`). A normalização string→int acontece na **ingestão (21.3 AC2)**, não aqui. Nesta story só defina a coluna `INTEGER` e o tipo TS `number | null`. Escala documentada (do spike): Interested=1, Meeting Booked=2, Meeting Completed=3, Won=4, Out of Office=0, Not Interested=-1, Wrong Person=-2, Lost=-3, No Show=-4.

### Migration defensiva/idempotente (AC6) — padrão obrigatório

Banco do cliente é **gerenciado à mão, sem migration tracking** (ver memória "DB sem migration tracking"). A migration DEVE reaplicar sem erro. Idiomas:

- `CREATE TABLE IF NOT EXISTS` (CHECKs e UNIQUE inline; se a tabela já existir, o bloco é pulado inteiro)
- `CREATE INDEX IF NOT EXISTS`
- Trigger: `DROP TRIGGER IF EXISTS <nome> ON <tabela>; CREATE TRIGGER <nome> ...`
- Policy: `DROP POLICY IF EXISTS "<nome>" ON <tabela>; CREATE POLICY "<nome>" ...` (padrão do 00053)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` já é idempotente (no-op se ativo)
- **NÃO** redefina `public.update_updated_at_column()` nem `public.get_current_tenant_id()` — já existem (usadas em 00042 e desde 00003). Apenas referencie.

**Número da migration:** última existente é `00054`. Use **`00055`**. Um único arquivo com as 3 tabelas (menos arquivos para o Fabossi aplicar à mão = menos toil operacional; coeso por story).

### Schema SQL de referência (use como base)

```sql
-- Migration: Create opportunities + notification schema (Loop de Resposta)
-- Epic 21 - Story 21.1
-- Idempotente/defensivo (banco gerido à mão — ver 00053).

-- ============ OPPORTUNITIES ============
CREATE TABLE IF NOT EXISTS public.opportunities (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id            UUID REFERENCES public.leads(id) ON DELETE SET NULL,      -- nullable (21.2 AC5)
  campaign_id        UUID NOT NULL,                                            -- sem FK (espelha campaign_events)
  source             TEXT NOT NULL CHECK (source IN ('reply','engagement')),
  reply_event_id     UUID REFERENCES public.campaign_events(id) ON DELETE SET NULL,
  reply_text         TEXT,
  reply_subject      TEXT,
  unibox_url         TEXT,
  intent             TEXT CHECK (intent IS NULL OR intent IN
                       ('interessado','pediu_info','objecao','nao_agora','opt_out')),
  lt_interest_status INTEGER,
  suggestion         TEXT,
  status             TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','viewed','contacted','meeting_booked','discarded')),
  meeting_booked_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- UNIQUE em coluna nullable: idempotência p/ replies; N engagements (reply_event_id NULL) não colidem
  CONSTRAINT uq_opportunities_reply_event_id UNIQUE (reply_event_id)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_status
  ON public.opportunities(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead_id
  ON public.opportunities(lead_id);

DROP TRIGGER IF EXISTS update_opportunities_updated_at ON public.opportunities;
CREATE TRIGGER update_opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
-- 4 policies (SELECT/INSERT/UPDATE/DELETE) no padrão tenant — DROP IF EXISTS + CREATE cada uma:
--   USING/WITH CHECK (tenant_id = public.get_current_tenant_id())

-- ============ NOTIFICATION_SETTINGS (1 por tenant) ============
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,                          -- ["5511999999999", ...]
  channels         JSONB NOT NULL DEFAULT '{"whatsapp": true, "in_app": true}'::jsonb,
  notify_intents   JSONB NOT NULL DEFAULT '["interessado","pediu_info"]'::jsonb, -- forward-compat 21.7 AC3
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_settings_tenant UNIQUE (tenant_id)
);
-- trigger update_updated_at_column + RLS tenant (mesmo padrão acima)

-- ============ APP_NOTIFICATIONS (in-app persistida) ============
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_notifications_tenant_unread
  ON public.app_notifications(tenant_id, created_at DESC) WHERE read_at IS NULL;
-- RLS tenant (SELECT/INSERT/UPDATE/DELETE). Sem trigger updated_at (imutável exceto read_at).
```

> Escreva as 12 policies por extenso (4 por tabela) — o exemplo canônico é `00042_create_whatsapp_messages.sql` (linhas 94–111) e `00039_create_campaign_events.sql` (linhas 44–59). Nomeie no padrão `"Users can view their tenant opportunities"` etc.

**Nota sobre RLS × service role:** o processador (21.2) e as notificações (21.7) inserem via `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS), igual ao webhook do Epic 10. As policies de tenant são para leitura client-side e defesa em profundidade — mantenha as 4 mesmo assim (padrão do projeto).

### Padrão de Tipos (espelhar `src/types/tracking.ts`)

Arquivo **novo** `src/types/opportunity.ts` (um domínio por arquivo — convenção `monitoring.ts`/`agent.ts`/`tracking.ts`). Sem colisão de nomes: `Opportunity` ≠ `OpportunityConfig`/`OpportunityLead` (que já vivem em `tracking.ts`).

```typescript
export const OPPORTUNITY_SOURCES = ["reply", "engagement"] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const OPPORTUNITY_INTENTS = [
  "interessado", "pediu_info", "objecao", "nao_agora", "opt_out",
] as const;
export type OpportunityIntent = (typeof OPPORTUNITY_INTENTS)[number];

export const OPPORTUNITY_STATUSES = [
  "new", "viewed", "contacted", "meeting_booked", "discarded",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export function isValidOpportunityIntent(v: string): v is OpportunityIntent {
  return (OPPORTUNITY_INTENTS as readonly string[]).includes(v);
}
// (guards análogos para source e status)

// DB Row (snake_case) — nullable espelha o schema
export interface OpportunityRow {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  campaign_id: string;
  source: OpportunitySource;
  reply_event_id: string | null;
  reply_text: string | null;
  reply_subject: string | null;
  unibox_url: string | null;
  intent: OpportunityIntent | null;
  lt_interest_status: number | null;
  suggestion: string | null;
  status: OpportunityStatus;
  meeting_booked_at: string | null;
  created_at: string;
  updated_at: string;
}

// TS (camelCase)
export interface Opportunity {
  id: string;
  tenantId: string;
  leadId: string | null;
  campaignId: string;
  source: OpportunitySource;
  replyEventId: string | null;
  replyText: string | null;
  replySubject: string | null;
  uniboxUrl: string | null;
  intent: OpportunityIntent | null;
  ltInterestStatus: number | null;
  suggestion: string | null;
  status: OpportunityStatus;
  meetingBookedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toOpportunity(row: OpportunityRow): Opportunity { /* map snake→camel */ }
export function toOpportunityRow(o: Opportunity): OpportunityRow { /* map camel→snake */ }
```

`NotificationSettings`/`AppNotification` seguem o mesmo Row+TS+transform. Sugestão de shape:
- `NotificationSettings`: `whatsappNumbers: string[]`, `channels: { whatsapp: boolean; inApp: boolean }`, `notifyIntents: OpportunityIntent[]` (os JSONB desserializam para esses tipos — tipe o Row como `string[]`/`Record<string, boolean>` conforme o que o supabase-js retorna do JSONB).
- `AppNotification`: `type: string`, `payload: Record<string, unknown>`, `readAt: string | null`.

**Convenção de nomes de transform:** o AC4 nomeia explicitamente `toOpportunity()`/`toOpportunityRow()` (bidirecional — o `toOpportunityRow` TS→Row é novo no projeto, necessário para INSERTs da 21.2). Para as outras entidades, use `toNotificationSettings`/`toAppNotification` (Row→TS) no mesmo estilo. O restante do projeto usa `transformXRow` — ambos coexistem, apenas seja consistente dentro do arquivo novo.

### Testes (espelhar `__tests__/unit/types/tracking.test.ts`)

Arquivo `__tests__/unit/types/opportunity.test.ts`. Cubra: round-trip `toOpportunity`→`toOpportunityRow` idêntico (com TODOS os nullable preenchidos e nulos), transforms de settings/notifications, guards `isValid*`, e `expect(OPPORTUNITY_*).toHaveLength(...)` + `toContain(...)`. Import direto de `@/types/opportunity` (não do barrel, p/ isolar).

### AC5 — Validação real do spike — ✅ RESOLVIDO (2026-07-13)

**O AC5 está SATISFEITO** — validação executada com chamadas reais durante o create-story (credenciais de `.env.local`: `INSTANTLY_API_KEY` + service role Supabase). Resultados documentados na seção "✅ VALIDAÇÃO REAL EXECUTADA" de `epic-21-api-validation-spike-2026-07-13.md`. O dev **não precisa refazer nada** desta parte.

**Consequência para ESTA story:** nenhuma mudança no schema — ele é agnóstico à fonte (o `reply_event_id` continua FK para `campaign_events`; as linhas serão criadas por **polling** em vez de webhook, com `source='polling'`, sem alterar contrato).

**Consequência para as PRÓXIMAS stories (contexto, não escopo desta):** webhooks bloqueados no plano do cliente + `campaign_events` vazia → a cláusula condicional do épico foi ativada: o sweep por polling (`GET /api/v2/emails`, era a 21.8) vira a fonte primária de ingestão, e o backfill (FR7) passa a ser "primeiro sweep com janela ampla" via API (histórico disponível). Aberturas/cliques (gatilho principal do cliente) já fluem por polling hoje (`src/lib/services/tracking.ts:142-166`) — a 21.6 sobe de prioridade. Re-sequenciamento formal registrado no sprint-status.

### Anti-Patterns a evitar

1. **NÃO** usar `CREATE TYPE ... AS ENUM` — use `TEXT + CHECK` (decisão 00053/AD-1).
2. **NÃO** usar `auth.jwt() ->> 'tenant_id'` — use `public.get_current_tenant_id()` (existe desde 00003).
3. **NÃO** redefinir `update_updated_at_column()` — só anexar o trigger.
4. **NÃO** usar `export enum` no TS — use `const` array + union type (padrão do projeto).
5. **NÃO** esquecer `ENABLE ROW LEVEL SECURITY` em nenhuma das 3 tabelas.
6. **NÃO** criar FK em `campaign_id` (ver decisão de FKs) nem migration não-idempotente.
7. **NÃO** implementar processador/service/UI/API route — é 21.2+. Esta story é só schema+tipos+spike.

### Reuso obrigatório (não reinventar)

- `public.get_current_tenant_id()` (00003), `public.update_updated_at_column()` (trigger fn existente), `public.is_admin()` (00053 — não usado aqui, mas disponível se algum write precisar de admin-gate no futuro/21.7).
- Padrão de tipos Row/TS/transform de `src/types/tracking.ts` e `src/types/campaign.ts`.
- Idioma de script DB somente-leitura de `scripts/list-users.mjs`.
- FK/trigger/index/RLS: `00042_create_whatsapp_messages.sql` é o exemplo canônico completo mais recente.

### Dependências Downstream (o que consome esta fundação — sequência revisada 2026-07-13)

- **21.2** (Ingestão por Polling + Processador + Backfill — absorveu a antiga 21.8): o sweep grava `campaign_events` com `source='polling'` (`GET /api/v2/emails`); o processador faz INSERT em `opportunities` (`source='reply'`) via `toOpportunityRow`; `unibox_url` será null via polling (nullable no schema).
- **21.6** (Engajamento — PROMOVIDA, 3ª na sequência): INSERT `source='engagement'` (reply_event_id NULL), regra de upgrade→`reply`. Gatilho dominante do cliente (aberturas/cliques).
- **21.3** (Classificação IA): UPDATE `intent`/`lt_interest_status`/`suggestion`; normaliza `lt_interest_status` string→int aqui.
- **21.4** (Central): SELECT `opportunities`, badge = contagem `status='new'`.
- **21.5** (Ações): UPDATE `status`/`meeting_booked_at`, cache `suggestion`.
- **21.7** (Notificações): lê `notification_settings`, INSERT `app_notifications`.

### Project Structure Notes

- Migration: `supabase/migrations/00055_create_opportunities_schema.sql` (nova)
- Tipos: `src/types/opportunity.ts` (nova) + re-export em `src/types/index.ts`
- Testes: `__tests__/unit/types/opportunity.test.ts` (nova)
- Script: `scripts/inspect-reply-events.mjs` (nova)
- Doc atualizada: `_bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md`
- Zero conflito com estrutura existente; alinhamento total.

### References

- [Source: _bmad-output/planning-artifacts/epic-21-loop-de-resposta.md#Story 21.1] — ACs, FRs, sequência de valor
- [Source: _bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md] — payload webhook, pendências de validação (AC5)
- [Source: _bmad-output/implementation-artifacts/10-1-schema-de-tracking-e-tipos.md] — precedente estrutural direto (schema+tipos)
- [Source: supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql] — padrão defensivo (to_regclass, DROP POLICY IF EXISTS) + decisão TEXT+CHECK sobre ENUM (AD-1)
- [Source: supabase/migrations/00042_create_whatsapp_messages.sql] — exemplo canônico FK+trigger+índice parcial+RLS
- [Source: supabase/migrations/00039_create_campaign_events.sql] — tabela-fonte de `reply_event_id`; padrão sem-FK em campaign_id
- [Source: src/types/tracking.ts] — padrão Row/TS/transform + `EVENT_TYPES`/`isValidEventType`; `lt_interest_status` como string (linha 309)
- [Source: supabase/functions/instantly-webhook/index.ts:51-57,243] — `EVENT_TYPE_MAP` (`reply_received`→`email_replied`), `payload: body`
- [Source: scripts/list-users.mjs] — idioma de script DB somente-leitura via service role

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (BMAD dev-story workflow)

### Debug Log References

- `npx vitest run __tests__/unit/types/opportunity.test.ts` — RED confirmado (`Failed to resolve import "@/types/opportunity"`) antes de implementar os tipos; GREEN após implementação (27/27).
- `npx tsc --noEmit` — 0 erros em `src/` e 0 nos arquivos novos (grep `^src/` e `opportunity` vazios). Os 175 erros restantes são pré-existentes em `__tests__/` (snovio, monitoring-processor, 00042, agent, campaign) — vitest transpila testes via esbuild (transpile-only), por isso a suíte fica verde apesar deles. Nenhum introduzido por esta story.
- `npx eslint src/types/opportunity.ts src/types/index.ts __tests__/unit/types/opportunity.test.ts` — limpo (exit 0), inclusive `no-non-null-assertion`.
- `npx vitest run` (suíte completa) — 367 files / 6237 pass / 2 skip / 0 fail.

### Completion Notes List

Implementação seguiu o ciclo red-green espelhando estruturalmente a Story 10.1 (schema+tipos do Epic 10). Escopo: **só fundação de dados** — nenhum service/API/UI/processador (isso é 21.2+).

- **Task 1 — Migration `00055` (AC1/2/3/6):** 3 tabelas num único arquivo idempotente. `opportunities` com todas as colunas do AC1, `source`/`intent`/`status` como **TEXT + CHECK** (decisão 00053/AD-1, não ENUM nativo), `CHECK (intent IS NULL OR intent IN (...))` para o nullable, e `CONSTRAINT uq_opportunities_reply_event_id UNIQUE (reply_event_id)`. FKs conforme a decisão da story: `tenant_id` CASCADE; `lead_id` nullable SET NULL; `campaign_id` **sem FK** (espelha `campaign_events`); `reply_event_id` nullable SET NULL (FK `campaign_events`). Comentário SQL documenta a sutileza do UNIQUE sobre coluna nullable (múltiplos NULL distintos → idempotência p/ replies + N engagements). `notification_settings` (1 por tenant, `UNIQUE(tenant_id)`, JSONB `whatsapp_numbers`/`channels`/`notify_intents` com defaults) e `app_notifications` (imutável exceto `read_at`, sem trigger). 3 índices (`idx_opportunities_tenant_status`, `idx_opportunities_lead_id`, `idx_app_notifications_tenant_unread` parcial `WHERE read_at IS NULL`). Triggers `update_updated_at_column()` em opportunities+notification_settings (padrão DROP/CREATE). RLS habilitada nas 3 + **12 policies por extenso** (4 por tabela, padrão `public.get_current_tenant_id()`), cada uma com `DROP POLICY IF EXISTS` antes. Idempotência total: `CREATE TABLE/INDEX IF NOT EXISTS`, `DROP TRIGGER/POLICY IF EXISTS`, reutiliza (não redefine) `get_current_tenant_id()` e `update_updated_at_column()`.
- **Task 2 — Tipos `src/types/opportunity.ts` (AC4):** const arrays `OPPORTUNITY_SOURCES` (2), `OPPORTUNITY_INTENTS` (5), `OPPORTUNITY_STATUSES` (5) + union types + guards `isValidOpportunitySource/Intent/Status`. `OpportunityRow` (snake) + `Opportunity` (camel) + `toOpportunity()` **e** `toOpportunityRow()` (bidirecional exigido pelo AC4, TS→Row novo p/ INSERTs da 21.2). `NotificationSettingsRow`/`NotificationSettings`/`toNotificationSettings` (mapeia a chave JSONB `channels.in_app` → `channels.inApp`). `AppNotificationRow`/`AppNotification`/`toAppNotification`. Re-export `export * from "./opportunity"` no barrel `src/types/index.ts` — sem colisão com `OpportunityConfig`/`OpportunityLead` do `tracking.ts`.
- **Task 3 — Testes `__tests__/unit/types/opportunity.test.ts` (AC4):** 27 testes. Round-trip Row→TS→Row idêntico com **todos os nullable preenchidos** (fixture `reply`) e **todos nulos** (fixture `engagement`); transforms de settings (incl. `in_app`→`inApp` e arrays vazios) e notifications (incl. `read_at` null e lido); guards `isValid*` (positivo/negativo/narrowing); contagem e valores dos const arrays; re-export via barrel `@/types`.
- **Task 4 — Validação:** ver Debug Log. tsc 0 erros em `src/`, eslint limpo, suíte completa verde.
- **Task 5 — AC5 (spike):** já concluído no create-story (validação real com credenciais). Sem retrabalho.
- **Task 6 — Mock Supabase:** `[~] SKIPPED` — sem repository/service nesta story; handler default resiliente cobre.

**Nota operacional p/ Fabossi:** a migration `00055` precisa ser **aplicada à mão** no banco do cliente (banco gerido sem migration tracking — memória do projeto). É idempotente/defensiva, reaplicável sem erro.

### File List

- `supabase/migrations/00055_create_opportunities_schema.sql` (novo)
- `src/types/opportunity.ts` (novo)
- `src/types/index.ts` (modificado — 1 linha: re-export de `./opportunity`)
- `__tests__/unit/types/opportunity.test.ts` (novo)

## Change Log

- 2026-07-13: Story 21.1 criada (create-story) — fundação do Epic 21: 3 tabelas (opportunities/notification_settings/app_notifications), tipos TS + transforms, validação real do spike (parte operacional Fabossi). Status: ready-for-dev.
- 2026-07-13: **AC5/Task 5 CONCLUÍDOS na criação da story** — validação real executada (API Instantly + DB do cliente): webhooks bloqueados no plano, `GET /emails` funciona com texto completo, `campaign_events` vazia (backfill via API), escopo `all:all`. Cláusula condicional do épico ativada (polling primário). Escopo restante da story: **apenas migration 00055 + tipos + testes** (Tasks 1–4, 6).
- 2026-07-13: **Implementação (dev-story)** — migration `00055` (3 tabelas idempotentes, 3 índices, 2 triggers, RLS + 12 policies, TEXT+CHECK, FKs conforme decisão), tipos `src/types/opportunity.ts` (Row/TS/transforms bidirecionais + guards + const arrays) re-exportados no barrel, e 27 testes unitários (round-trip, transforms, guards, re-export). tsc 0 erros em `src/`, eslint limpo, suíte completa 367 files/6237 pass/2 skip/0 fail. Task 6 SKIPPED. Status: review.
- 2026-07-13: **Migration `00055` APLICADA** no banco do cliente por Fabossi. Fecha o último item operacional da story — resta apenas o code-review.
- 2026-07-13: **Code review 3 camadas (Blind/Edge/Acceptance, modo full) — Status: done.** 0 patch, 0 decision-needed, 6 defers (→ 21.2/21.5/21.7, em `deferred-work.md`), 8 dismiss. Acceptance Auditor: 6/6 ACs SATISFEITOS, 0 anti-pattern quebrado. 27/27 testes + eslint reconfirmados de forma independente. Nenhum defeito no escopo entregue; defers são hardening das stories consumidoras (schema já aplicado → hardening = migration futura).
