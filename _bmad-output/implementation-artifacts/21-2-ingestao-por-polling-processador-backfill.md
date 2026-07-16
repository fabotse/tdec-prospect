---
baseline_commit: e7355f66af8df192c6bc392c0080eca9d86584e7
---
# Story 21.2: Ingestão de Respostas por Polling + Processador + Backfill

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário,
I want que respostas de leads sejam detectadas e registradas automaticamente,
so that eu nunca mais precise importar CSV de resultados para saber quem respondeu.

> **Revisada 2026-07-13 (decisão Fabossi):** absorve o sweep de polling da antiga Story 21.8. Com webhooks **bloqueados** no plano do cliente (validado na 21.1 AC5), o polling é o **caminho primário** de ingestão, não rede de segurança. O pipeline interno não muda: o **sweep** grava `campaign_events` (`source='polling'`) e o **processador** consome de lá — igual ao que faria com o webhook. O receiver de webhook (Epic 10) permanece **intocado** como upgrade path futuro.

## Acceptance Criteria

1. **[Sweep — ex-21.8]** **Given** o cron de ingestão roda (cadência ≤5 min — NFR3; padrão do monitoring cron 13.3 / migration 00045) **When** o sweep executa **Then** busca respostas via `GET /api/v2/emails` (`email_type=received`, workspace-wide, janela desde o último sweep) **And** grava eventos em `campaign_events` com `source='polling'`, `event_type='email_replied'` e payload equivalente ao do webhook (`reply_text` ← `body.text`, `reply_subject` ← `subject`, `lead_email`, timestamp, `message_id`) **And** não duplica (dedupe pela UNIQUE constraint existente de `campaign_events` + `message_id` no payload) (FR1, FR17)

2. **[Rate limit — ex-21.8]** **Given** o rate limit do Instantly (20 req/min — NFR5) **Then** o sweep respeita o limite (1 chamada workspace-wide por ciclo + paginação limitada) **And** degrada graciosamente: o que não couber no ciclo atual é ingerido no próximo **And** falha de API loga erro estruturado sem quebrar o cron (fail-open)

3. **[Processador]** **Given** um evento `email_replied` novo em `campaign_events` **When** o processador roda **Then** cria uma `opportunity` (`source='reply'`) com `reply_text`/`reply_subject`/`unibox_url` extraídos de `payload` **And** não duplica se o evento já foi processado (UNIQUE `reply_event_id`) **And** `unibox_url` pode ser null via polling (campo nullable; presente apenas em payload de webhook)

4. **[Auto-reply]** **Given** respostas OOO/automáticas **Then** o processador aplica heurística defensiva (ex.: `lt_interest_status = 0` "Out of Office" → NÃO cria oportunidade, motivo em log estruturado) **And** teste de regressão garante que `auto_reply_received` permanece fora do `EVENT_TYPE_MAP` do receiver (nunca gera `campaign_events` via webhook futuro) (FR2)

5. **Given** uma oportunidade é criada **Then** uma `lead_interaction` do tipo `campaign_reply` é registrada para o lead correspondente (match por `lead_email` + tenant) (FR6)

6. **[Backfill]** **Given** o histórico de respostas disponível na API (validado: desde mar/2026) **When** o backfill é executado (primeiro sweep com janela ampla, ação idempotente disparável por rota admin) **Then** oportunidades retroativas são criadas sem duplicatas (FR7 — revisado: via API, pois `campaign_events` está vazia)

7. **Given** o lead da resposta não existe na base **When** o processador roda **Then** a oportunidade é criada mesmo assim com os dados do payload **And** `lead_id` nullable é tratado em toda a cadeia

8. **Given** o receiver do webhook (`instantly-webhook`) **Then** NENHUMA modificação é feita nele — permanece como upgrade path se o cliente habilitar webhooks (dual-source deduplica por construção)

9. Testes unitários para: sweep (mock da API Instantly), dedupe, rate limit, extração de payload, filtro de auto-reply, idempotência e backfill

## Tasks / Subtasks

- [x] **Task 1: Método `getReceivedEmails` na `TrackingService` + tipos do e-mail** (AC: #1, #2)
  - [x] 1.1 Em `src/types/tracking.ts`: adicionar `EMAILS_ENDPOINT = "/api/v2/emails"` (junto aos consts das linhas 36-38) e as interfaces `InstantlyReceivedEmail` (shape do item retornado — ver Dev Notes "Shape do `GET /emails`") e `InstantlyEmailsListResponse` (`{ items: InstantlyReceivedEmail[]; next_starting_after?: string }`). **NÃO** invente campos: use apenas os validados no spike (`id`, `message_id`, `timestamp_created`, `timestamp_email`, `subject`, `body.text`/`body.html`, `campaign_id`/`campaign`, `to_address_email_list`, `lead`/e-mail do lead, `email_type`, `ue_type`, `i_status`)
  - [x] 1.2 Adicionar `async getReceivedEmails(params: GetReceivedEmailsParams): Promise<InstantlyReceivedEmail[]>` na `TrackingService` (`src/lib/services/tracking.ts`), **espelhando estruturalmente `getLeadTracking` (linhas 280-320)**: cursor `starting_after` → `next_starting_after`, loop `do/while (cursor && pageCount < MAX_PAGINATION_PAGES)`. Chamada `GET {INSTANTLY_API_BASE}{EMAILS_ENDPOINT}?email_type=received&limit=100&min_timestamp_created=<sinceISO>` (+ `starting_after` quando houver cursor). Reusar `buildAuthHeaders(apiKey)` e `this.request<InstantlyEmailsListResponse>(...)` do `ExternalService`
  - [x] 1.3 Filtrar defensivamente por `email_type === "received"` (ou `ue_type === 2`) no cliente, mesmo com o filtro de query — nunca ingerir `sent`/`manual`
- [x] **Task 2: Módulo de sweep `src/lib/utils/reply-sweep.ts`** (AC: #1, #2, #7)
  - [x] 2.1 `export async function sweepReplies(supabase, { since, tenantId? }): Promise<SweepResult>` — módulo TS puro, **cliente parametrizado** (roda sob service-role no cron e sob admin no backfill), no padrão de `src/lib/utils/monitoring-processor.ts`
  - [x] 2.2 Iterar tenants com `api_config` de `instantly` (cada tenant tem workspace/chave próprios). Para cada: `getApiKey(supabase, tenantId, "instantly")` (reuso de `monitoring-processor.ts:136-155`); se null, logar e pular (fail-open). Isolar falha por-tenant com `Promise.allSettled`
  - [x] 2.3 Para cada e-mail recebido: resolver `campaign_id` local + `tenant_id` via lookup `campaigns.external_campaign_id = email.campaign_id` (`.limit(1).maybeSingle()`, **mesmo padrão do webhook** `instantly-webhook/index.ts:201-217`). Campanha desconhecida → pular silenciosamente (espelha o webhook)
  - [x] 2.4 Montar o payload equivalente ao webhook e o `event_timestamp` **estável** (ver Dev Notes "Normalização de timestamp — risco #1"). INSERT em `campaign_events` com `source: "polling"`, `event_type: "email_replied"`. Reusar o builder de `src/lib/webhook/instantly-webhook-utils.ts` se aplicável — senão montar inline o mesmo shape
  - [x] 2.5 Dedupe: `.insert()` simples e **tratar Postgres `23505` como sucesso benigno** (evento já ingerido) — exatamente como `instantly-webhook-utils.ts:255` / `instantly-webhook/index.ts:247-258`. NUNCA usar `.upsert` com merge (perderia o comportamento provado)
  - [x] 2.6 Janela incremental sem tabela nova: `since = MAX(event_timestamp) WHERE source='polling' AND tenant_id=<t>` menos um overlap (`REPLY_SWEEP_OVERLAP_MINUTES`, default 10) — floor default se não houver linhas (ex.: 30 dias atrás). O dedupe (2.5) torna o overlap seguro. Backfill passa `since` amplo (ver Task 5)
- [x] **Task 3: Processador `src/lib/utils/reply-processor.ts`** (AC: #3, #4, #5, #7)
  - [x] 3.1 `export async function processReplies(supabase, { tenantId? }): Promise<ProcessResult>` — seleciona `campaign_events` `event_type='email_replied'` ainda **não processados** (LEFT ANTI-JOIN por `opportunities.reply_event_id`: buscar events e filtrar os que já têm oportunidade, ou `.not("id", "in", <ids já em opportunities.reply_event_id>)`). Iterar com `Promise.allSettled` (isolamento por item — padrão `process-batch/route.ts:219-243`)
  - [x] 3.2 `processReplyEvent(event, supabase): Promise<ProcessReplyResult>` — worker por item que **nunca lança** para falhas esperadas; retorna objeto tipado `{ success, opportunityId?, skipped?, reason?, error? }` (padrão `processLead`)
  - [x] 3.3 **Filtro de auto-reply (AC4):** antes de criar a oportunidade, aplicar heurística defensiva → se OOO, **NÃO** criar oportunidade, `skipped: true` + `reason` em log estruturado. Heurística combinada: (a) `lt_interest_status === 0` (Out of Office) quando disponível no payload/`i_status`; (b) regex de assunto/corpo (`/out of office|automatic reply|auto-?reply|resposta autom|ausência do escrit/i`). Documentar a heurística em comentário
  - [x] 3.4 Criar `opportunity` (`source='reply'`) via `supabase.from("opportunities").insert(...)`: `tenant_id`, `campaign_id` (do event), **`reply_event_id: event.id` SEMPRE** (idempotência NFR2 — ver Dev Notes "Idempotência de reply"), `reply_text`/`reply_subject`/`unibox_url` extraídos de `payload` (`unibox_url` = null via polling — OK, nullable), `lead_id` (resolvido em 3.6, pode ser null), `lt_interest_status` bruto se presente (normalização string→int é da 21.3 — aqui só grave se já for int, senão null). Deixar DB preencher `id`/`status='new'`/`created_at`/`updated_at`. **Tratar `23505` (UNIQUE `reply_event_id`) como sucesso benigno** (já processado)
  - [x] 3.5 **NÃO** preencher `intent`/`suggestion` (é 21.3/21.5). `intent` fica null; a oportunidade permanece visível (fail-open, NFR1)
  - [x] 3.6 **Match de lead + `lead_interaction` (AC5, AC7):** normalizar `lead_email` (lowercase/trim) e buscar `leads` por `.eq("tenant_id", t).ilike("email", email).limit(1).maybeSingle()` (ver Dev Notes "Match de lead"). Se encontrado → `lead_id` na oportunidade **e** INSERT `lead_interactions` `type='campaign_reply'` (precedente `import-results/route.ts:157-164`); se NÃO encontrado → oportunidade criada com `lead_id: null` e **sem** `lead_interaction` (a coluna `lead_id` é `NOT NULL` em `lead_interactions` — ver Dev Notes "Bloqueio de schema")
- [x] **Task 4: Cron do sweep — rota Node + edge function + migration 00056** (AC: #1, #2)
  - [x] 4.1 Rota `src/app/api/replies/process-batch/route.ts` (POST): auth por **secret compartilhado** `REPLIES_CRON_SECRET` (`authHeader !== \`Bearer ${secret}\`` → 401; padrão `monitoring/process-batch/route.ts:35-39`); cliente **service-role** inline `createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)` (ou `createAdminClient()`); chama `sweepReplies` **depois** `processReplies`; retorna resumo `{ swept, created, skipped, errors }` (sem wrapper `{ data }` — é cron)
  - [x] 4.2 Edge function `supabase/functions/reply-sweep/index.ts` — **thin trigger** espelhando `supabase/functions/monitor-leads/index.ts` (lê `NEXT_APP_URL` + `REPLIES_CRON_SECRET` via `Deno.env.get`, faz `fetch` para `/api/replies/process-batch` com `Bearer REPLIES_CRON_SECRET`, repassa status/body). Usar `Deno.serve`. **Zero** lógica de negócio no Deno
  - [x] 4.3 Migration `supabase/migrations/00056_schedule_reply_sweep_cron.sql` — **espelhar `00045`**: `cron.schedule('reply-sweep-cron', '*/5 * * * *', $$ SELECT net.http_post(url := <vault supabase_url> || '/functions/v1/reply-sweep', headers := ... Bearer <vault service_role_key>, body := '{}') $$)`. Segredos via **Vault** (`vault.decrypted_secrets`), **nunca hardcoded** (foi fix CRITICAL na review da 13.3). Documentar em comentário os `vault.create_secret` necessários e o `cron.unschedule` de rollback. Idempotente/defensiva
  - [x] 4.4 Adicionar `REPLIES_CRON_SECRET` ao `.env.example` (padrão do `MONITORING_CRON_SECRET`, `.env.example:66-72`; `openssl rand -hex 32`; "must match Supabase Edge Function secret"). Nota operacional p/ Fabossi no Completion Notes
- [x] **Task 5: Rota de backfill admin `src/app/api/replies/backfill/route.ts`** (AC: #6, #7)
  - [x] 5.1 POST com auth por **sessão de admin**: `getCurrentUserProfile()` + gate de admin (`hasAdminAccess(profile.role)` / `isAdmin()`); não-admin → 403. Cliente **service-role** para o INSERT cross-lookup (ou cliente de sessão + confiar na RLS do tenant do admin)
  - [x] 5.2 Executa `sweepReplies(supabase, { since: <janela ampla, ex. '2026-01-01'>, tenantId: profile.tenant_id })` **depois** `processReplies(supabase, { tenantId })` para o tenant do admin. Idempotente por construção (dedupe 23505 no sweep + UNIQUE `reply_event_id` no processador). Retorna resumo. Paginação limitada a `MAX_PAGINATION_PAGES` numa invocação; se estourar, chamar de novo é seguro (dedupe)
- [x] **Task 6: Preservar o receiver do webhook + regressão de auto-reply** (AC: #4, #8)
  - [x] 6.1 **NÃO** modificar `supabase/functions/instantly-webhook/index.ts` nem `src/lib/webhook/instantly-webhook-utils.ts` (SYNC-NOTICE — cópia espelhada testada). Confirmar no File List que ambos ficam intocados
  - [x] 6.2 Teste de regressão: `EVENT_TYPE_MAP` de `instantly-webhook-utils.ts` **não** contém `auto_reply_received` (e `mapEventType("auto_reply_received")` retorna `null`) — garante que um webhook futuro nunca gera `campaign_events` de auto-reply
- [x] **Task 7: Testes unitários** (AC: #9)
  - [x] 7.1 `getReceivedEmails`: mock do `global.fetch` (helper de mock HTTP centralizado do cleanup-4), paginação por cursor, filtro `received`, propagação de `since`
  - [x] 7.2 Sweep: dedupe (23505 tratado como sucesso), resolução de `campaign_id` (conhecida/desconhecida), montagem de payload + `event_timestamp` estável, `source='polling'`, isolamento por-tenant, fail-open em erro de API
  - [x] 7.3 Processador: criação de oportunidade `source='reply'` com `reply_event_id` sempre setado, idempotência (reprocesso não duplica), filtro de auto-reply (OOO por `lt_interest_status=0` e por regex), extração de payload, `unibox_url` null
  - [x] 7.4 Lead match: encontrado → `lead_id` + `lead_interaction` `campaign_reply`; não encontrado → oportunidade com `lead_id: null` e sem interaction; e-mail com case/whitespace divergente
  - [x] 7.5 Backfill: janela ampla idempotente (2ª execução não cria duplicatas)
  - [x] 7.6 Rotas (`process-batch` service-role secret; `backfill` admin gate): 401/403 corretos, happy path
  - [x] 7.7 Registrar mocks explícitos das tabelas novas (`opportunities`, `campaign_events`, `leads`, `lead_interactions`, `api_configs`, `campaigns`) no mock factory Supabase (a 21.1 pulou; agora há queries reais)
- [x] **Task 8: Validação** — `npx tsc --noEmit` (0 novos erros em `src/`); `npx eslint <arquivos novos>` limpo (inclusive `no-non-null-assertion` — usar leitura guardada de env, ver Dev Notes); `npx vitest run` verde; `npm run build` verde

### Review Findings (code review 3 camadas — 2026-07-13)

> Blind Hunter + Edge Case Hunter + Acceptance Auditor (Opus 4.8, paralelo, sem contexto prévio). Todos os 9 ACs SATISFEITOS (AC9 parcial — cobertura de rate-limit/cap indireta). Anti-patterns das Dev Notes: 10/10 respeitados. Severidades reatribuídas na triagem (consequência real no call site), não as dos subagentes.

**Decision-needed (1) — RESOLVIDO → vira patch:**
- [x] [Review][Decision][MEDIUM] Tuning do regex de auto-reply. **Decisão Fabossi (2026-07-13): CONSERVADOR (não perde lead).** Manter só marcadores inequívocos de autoresponder (`out of (the )?office|automatic reply|auto-?reply|automated response|ausência do escritório|OOO`), acento-insensível; **remover** as frases amplas de risco no corpo (`de férias`, `on vacation`, `estarei ausente`) que dropavam resposta humana real. Menos OOO filtrado, ~zero lead perdido. → Patch #7 abaixo.

**Patch (7):**
- [x] [Review][Patch][MEDIUM] (ex-decision) Regex de auto-reply conservador: só autoresponder inequívoco + acento-insensível; sem frases amplas de férias/ausência no corpo. [reply-processor.ts:45-46,53-69]
- [x] [Review][Patch][MEDIUM] `matchLeadId` passa e-mail cru como padrão `.ilike` → `_`/`%` viram wildcards SQL LIKE → atribuição ao lead errado (ex.: `ana_paula@corp.com` casa `anaXpaula@corp.com`; com `.limit(1)` sem `ORDER BY` resolve arbitrário; pior no caso AC7 em que o remetente não existe mas um `_` casa outro lead → `lead_interaction` gravada na pessoa errada). Escapar `%`/`_`/`\` no padrão (ou `.eq` sobre coluna lowercased). [reply-processor.ts:110]
- [x] [Review][Patch][MEDIUM] Rota `process-batch` fail-open se `REPLIES_CRON_SECRET` ausente/vazio: `authHeader !== \`Bearer ${repliesSecret}\`` compara com `"Bearer undefined"` → `Authorization: Bearer undefined` passa → execução service-role não autenticada. Adicionar `!repliesSecret ||` ao guard (fail-closed). [process-batch/route.ts:22]
- [x] [Review][Patch][MEDIUM] `processReplies` faz `.select("*")` sem `ORDER BY`/`.limit`/paginação → teto PostgREST (1000) + anti-join client-side → past-1000 pode starvar permanentemente (created:0 sem erro); e `Promise.allSettled(pending.map(...))` dispara concorrência ilimitada (~3 queries/evento). Espelhar o batching ordenado de `monitoring-processor` (Dev Notes pediam isso). [reply-processor.ts:221-254]
- [x] [Review][Patch][LOW] `insertReplyEvent`: erro Postgres ≠ 23505 é logado mas retorna `false` → contado como `skipped` (benigno), não em `errors` → falha sistemática de INSERT parece "nada novo". Também `event_timestamp = email.timestamp_created` sem guarda → `undefined` = 23502 (NOT NULL). Distinguir erro real de dup + pular e-mail sem `timestamp_created`. [reply-sweep.ts:199,204-213]
- [x] [Review][Patch][LOW] `processReplies` não checa o `error` da query de anti-join (opportunities) → falha transitória vira `existing=null` → reprocessa TODOS os eventos (salvo pelo 23505, mas silencioso). Checar o error e abortar. [reply-processor.ts:243]
- [x] [Review][Patch][LOW] `getReceivedEmails` trunca em `MAX_PAGINATION_PAGES` com `cursor` ainda setado, sem warning → backfill amplo perde silenciosamente >5000 e-mails (espelha o cap silencioso de `getLeadTracking`). Adicionar warning na exaustão do cap + teste AC9 do cap (rate-limit hoje só coberto indiretamente). [tracking.ts:367]

**Defer (1):**
- [x] [Review][Defer][MEDIUM] Mesmo fail-open de secret ausente existe em `monitoring/process-batch/route.ts:35-37` (pré-existente, story 13.3) — hardening cross-cutting das rotas de cron. [monitoring/process-batch/route.ts:35-37] — deferred, pre-existing

**Dismissed (5):** `i_status===0` = OOO (validado no spike; código só casa `number` 0; dados reais `undefined` → não dispara); comentário "dual-source deduplica" (webhooks bloqueados; épico escopa dedupe cross-source como best-effort futuro explícito); migration 00056 url NULL se Vault vazio (espelha 00045 aceito; documentado; segredos reusados do monitoring cron que já roda); `getReceivedEmails` NPE em body null (já mais defensivo que o precedente `getLeadTracking` via `?? []`; capturado no try/catch por-tenant); Task 7.7 tabelas não no mock factory central (testes existem/passam com helpers locais; AC9 satisfeito).

## Dev Notes

Esta story **implementa o pipeline de ingestão** (a 21.1 entregou só o schema+tipos). Escopo: **sweep (Instantly → `campaign_events`) + processador (`campaign_events` → `opportunities` + `lead_interactions`) + cron + backfill**. **NÃO** faz classificação de intent por IA (21.3), engajamento/`source='engagement'` (21.6), UI (21.4), ações do card (21.5), nem notificações (21.7).

### Arquitetura do pipeline (decoupled, aditivo)

```
pg_cron (*/5)  →  pg_net.http_post  →  reply-sweep (Deno, thin)  →  fetch  →
  /api/replies/process-batch (Node, service-role, REPLIES_CRON_SECRET)
     ├─ sweepReplies()     : Instantly GET /emails → INSERT campaign_events (source='polling')   [AC1,AC2]
     └─ processReplies()   : campaign_events (email_replied não processados) → INSERT opportunities + lead_interactions  [AC3-AC7]

/api/replies/backfill (Node, admin session)  →  sweepReplies({since: amplo}) + processReplies()   [AC6]
```

O **processador consome `campaign_events` independente da `source`** (webhook OU polling) — por isso o receiver do webhook (Epic 10) fica intocado e vira upgrade path: se o cliente habilitar webhooks, as linhas `source='webhook'` entram no mesmo processador, e o dedupe cobre o dual-source. Espelhe estruturalmente o par **`monitoring-processor.ts` + `monitoring/process-batch/route.ts`** (Story 13.3) — é o precedente exato de "cron thin-trigger → rota Node → módulo processador".

### 🔴 Normalização de timestamp — risco de correção #1 (AC1)

`campaign_events` **não tem coluna `message_id`**. O dedupe é a UNIQUE `uq_campaign_events_idempotency` sobre a **4-tupla** `(campaign_id, event_type, lead_email, event_timestamp)` [Source: supabase/migrations/00039_create_campaign_events.sql:24-26]. `source` **não** faz parte da chave. Consequências:

- Para o re-poll do **mesmo** e-mail deduplicar, o `event_timestamp` gravado tem que ser **estável e determinístico** a partir do e-mail. **Use `email.timestamp_created`** (ISO) — é o campo pelo qual filtramos (`min_timestamp_created`) e é estável entre polls. NÃO use `new Date().toISOString()` (mataria o dedupe).
- `message_id` (RFC 5322, chave natural) vai **dentro do `payload`** JSONB — para referência/threading e para o dual-source futuro. Ele **não** participa do UNIQUE (a coluna não existe); o dedupe operacional é a 4-tupla.
- O webhook grava `event_timestamp = webhook.timestamp || now()`. O dedupe cross-source (polling↔webhook) só é perfeito se os timestamps coincidirem — como webhooks estão **bloqueados hoje**, isso é cenário futuro e "best-effort by construction" (o épico já o trata como upgrade path). Não gaste esforço tentando reconciliar timestamps de duas fontes que hoje não coexistem.

### 🔴 Idempotência de reply — dívida herdada da review 21.1 (NFR2, AC3)

A review da 21.1 deferiu explicitamente p/ **esta story** [Source: _bmad-output/implementation-artifacts/deferred-work.md#story-21.1]: `opportunities` aceita `source='reply'` com `reply_event_id` NULL, e no Postgres **NULLs são distintos** no índice UNIQUE → dois ingests do mesmo reply sem `reply_event_id` resolvido **duplicariam o card**. A idempotência (`UNIQUE(reply_event_id)`) só vale se o processador **SEMPRE popular `reply_event_id = campaign_events.id`** (nunca null para `source='reply'`) e tratar `23505` como no-op. Isso é obrigatório na Task 3.4. (A opção belt-and-suspenders `CHECK (source <> 'reply' OR reply_event_id IS NOT NULL)` fica como migration futura opcional — não é requisito desta story, mas mencione no Completion Notes se aplicar.)

> **Fora de escopo aqui:** dedup de `source='engagement'` (deferido p/ 21.6) — esta story só cria `source='reply'`.

### Dedupe: `.insert()` + tratar `23505` (não `.upsert`)

O webhook **não** usa SQL `ON CONFLICT` nem `.upsert` — faz `.insert()` simples e engole o erro Postgres `23505` (unique violation) como sucesso [Source: supabase/functions/instantly-webhook/index.ts:247-258; src/lib/webhook/instantly-webhook-utils.ts:255]. **Replique esse padrão exato** tanto no sweep (dedupe de `campaign_events`) quanto no processador (dedupe de `opportunities` por `reply_event_id`). Qualquer erro ≠ `23505` é real → logar/propagar.

### Shape do `GET /api/v2/emails` (net-new — validado no spike)

`GET /api/v2/emails` **nunca foi chamado no projeto** — é novo. Campos validados na amostra real do spike [Source: _bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md:52-97]: `id` (UUID), `message_id` (RFC 5322), `timestamp_created`, `timestamp_email`, `subject` (`"RE: ..."`), `body.text` (texto COMPLETO da resposta) / `body.html`, `to_address_email_list`, `email_type` ("received"/"sent"/"manual"), `ue_type` (2 = received), `campaign_id` (external), `i_status` (interest status). Filtros de query relevantes: `email_type=received`, `min_timestamp_created`, `campaign_id`, `lead`, `is_unread`, `latest_of_thread`, `i_status`. **Rate limit: 20 req/min** — 1 chamada workspace-wide (`email_type=received` + `min_timestamp_created`) por ciclo cobre TODAS as campanhas do workspace; cron de 5 min = 1 req/5min (folgado). Paginação por cursor (`limit` + `starting_after` → `next_starting_after`), teto `MAX_PAGINATION_PAGES`.

**Mapeamento payload → `campaign_events`/`opportunities`:**
| Destino | Origem no e-mail |
|---|---|
| `campaign_events.event_type` | literal `'email_replied'` |
| `campaign_events.source` | literal `'polling'` |
| `campaign_events.event_timestamp` | `email.timestamp_created` (ISO — estável, ver risco #1) |
| `campaign_events.lead_email` | remetente/lead da resposta (e-mail do lead, não o `to`) |
| `campaign_events.campaign_id` | `campaigns.id` local (via lookup por `external_campaign_id`) |
| `campaign_events.tenant_id` | `campaigns.tenant_id` do lookup |
| `campaign_events.payload` | objeto do e-mail (inclui `message_id`, `subject`, `body.text`, `timestamp_email`) — shape aproximado ao body do webhook |
| `opportunities.reply_text` | `payload.body.text` |
| `opportunities.reply_subject` | `payload.subject` |
| `opportunities.unibox_url` | `payload.unibox_url` se houver, senão **null** (polling não entrega — AC3) |

### Match de lead por e-mail + tenant (AC5, AC7) — armadilhas reais

[Source: supabase/migrations/00010_create_leads.sql] — a tabela `leads`: `email TEXT` **nullable**, índice `idx_leads_email` **não-único**, e **NÃO existe** UNIQUE `(tenant_id, email)`; e-mail **não** é normalizado no banco (gravado como veio). Portanto:

- Um match `(tenant_id, email)` pode retornar **>1 linha** — **NÃO** use `.single()` (erra em >1). Use `.eq("tenant_id", t).ilike("email", email).limit(1).maybeSingle()`. O `ilike` cobre divergência de caixa (o import-results lowercaseia na app mas os valores no banco podem estar em caixa mista — [Source: src/app/api/leads/import-results/route.ts:97-117]).
- Zero matches é **esperado e válido** (AC7): a oportunidade é criada com `lead_id: null`.

### 🔴 Bloqueio de schema: `lead_interactions.lead_id` é `NOT NULL`

[Source: supabase/migrations/00013_create_lead_interactions.sql:15] — `lead_id UUID NOT NULL`. O tipo `campaign_reply` **já existe** no enum `interaction_type` (00013:6-10) → **nenhuma migration necessária p/ o tipo**. MAS não dá para inserir `lead_interactions` sem `lead_id`. **Decisão (Option A, sem migration):** só cria a `lead_interaction` quando o lead **casou**; quando não casa, cria a `opportunity` com `lead_id: null` e **pula** a interaction. A oportunidade (fonte de verdade da Central) nunca se perde; a `lead_interaction` é secundária (o próprio `import-results` trata log de interaction como secundário — [Source: src/app/api/leads/import-results/route.ts:215]). NÃO faça `ALTER TABLE ... DROP NOT NULL` (adicionaria toil de migration à mão sem ganho — a Central não depende da interaction).

Precedente do INSERT [Source: src/app/api/leads/import-results/route.ts:157-164]:
```ts
{ lead_id: lead.id, tenant_id: profile.tenant_id, type: "campaign_reply",
  content: `Resposta de campanha: ${...}`, created_by: null }  // created_by nullable p/ processador de background
```

### Filtro de auto-reply (AC4) — não há precedente a copiar

O webhook **não** filtra auto-reply — `auto_reply_received` simplesmente **não está** no `EVENT_TYPE_MAP` (é dropado por omissão) [Source: src/lib/webhook/instantly-webhook-utils.ts:18-24]. No **polling** não existe essa distinção de `event_type`: OOO chega como e-mail `received` comum. Logo o **processador** precisa filtrar por conta própria (Task 3.3). Heurística defensiva combinada: `lt_interest_status === 0` (escala do spike: 0 = Out of Office) quando disponível + regex de assunto/corpo. Item filtrado → `skipped` + `reason` em log estruturado, **sem** criar oportunidade. A regressão da Task 6.2 apenas **garante** que o webhook continua sem `auto_reply_received` no map (não modifica o receiver).

### Infra de cron — 4 hops, 2 segredos (espelhar 13.3 / 00045)

[Source: supabase/functions/monitor-leads/index.ts; supabase/migrations/00045_schedule_monitor_leads_cron.sql; src/app/api/monitoring/process-batch/route.ts]

- **Hop A** (pg_cron → edge fn): `cron.schedule('reply-sweep-cron','*/5 * * * *', $$ SELECT net.http_post(url := <vault supabase_url>||'/functions/v1/reply-sweep', headers := jsonb_build_object('Authorization','Bearer '|| <vault service_role_key>), body := '{}') $$)`. URL e chave via **Vault** (`vault.decrypted_secrets`) — **nunca hardcode** (foi CRITICAL na review 13.3). `pg_cron`+`pg_net` via `CREATE EXTENSION IF NOT EXISTS`.
- **Hop B** (edge fn → rota Node): a edge fn envia `Bearer REPLIES_CRON_SECRET`; a rota valida `authHeader !== \`Bearer ${process.env.REPLIES_CRON_SECRET}\`` → 401. Ler `process.env` **em tempo de request** (testabilidade), não no load do módulo.
- A edge fn é **thin** (só `fetch` de repasse; lê `NEXT_APP_URL` + `REPLIES_CRON_SECRET` via `Deno.env.get`; usa `Deno.serve`). Toda a lógica fica no Node (reuso de `decryptApiKey`, `TrackingService`, e a suíte Vitest).
- **`NEXT_APP_URL`** vive só nos secrets da Edge Function (Supabase Dashboard), **não** no `.env.example`. `REPLIES_CRON_SECRET` vai no `.env.example` (Vercel) **e** nos secrets da Edge Function — devem casar.
- **Não existe `supabase/config.toml`** no repo — edge functions são configuradas via Dashboard/Vault. Deploy: `npx supabase functions deploy reply-sweep`.

> **Decisão de segredo:** `REPLIES_CRON_SECRET` dedicado (isolamento de rotação). Se Fabossi preferir menos config operacional, reutilizar `MONITORING_CRON_SECRET` é aceitável — deixar como nota operacional, default no dedicado.

### Clientes Supabase e reuso obrigatório (não reinventar)

- **Service-role** (cron/processador, bypassa RLS): `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` inline [Source: src/app/api/monitoring/process-batch/route.ts:42-45] **ou** `createAdminClient()` [Source: src/lib/supabase/admin.ts]. ⚠️ `no-non-null-assertion`: o eslint do pre-commit linta o arquivo inteiro e reprova `process.env.X!` — usar leitura guardada (`const url = process.env.NEXT_PUBLIC_SUPABASE_URL; if (!url) throw ...`) [Source: memória do projeto "Pre-commit eslint"].
- **Sessão de usuário** (backfill admin): `createClient()` de `@/lib/supabase/server` + `getCurrentUserProfile()` [Source: src/lib/supabase/tenant.ts:17-33].
- **API key Instantly:** `getApiKey(supabase, tenantId, "instantly")` [Source: src/lib/utils/monitoring-processor.ts:136-155] → decripta via `decryptApiKey` [Source: src/lib/crypto/encryption.ts]. `api_configs`: `encrypted_key` filtrado por `tenant_id` + `service_name='instantly'`.
- **HTTP externo:** `ExternalService.request<T>()` (timeout 10s, 1 retry só em 408/rede, `ExternalServiceError` PT-BR) [Source: src/lib/services/base-service.ts:197-274]. **Não** faça `fetch` cru.
- **Isolamento por item:** `Promise.allSettled` + worker que retorna resultado tipado (nunca lança) [Source: src/app/api/monitoring/process-batch/route.ts:219-264].
- **Mock HTTP centralizado** (cleanup-4) e **mock Supabase resiliente** (cleanup-3) nos testes.

### `campaign_events` — schema confirmado (destino do sweep)

[Source: supabase/migrations/00039_create_campaign_events.sql] Colunas: `id`, `tenant_id` NOT NULL, `campaign_id` UUID NOT NULL, `event_type` VARCHAR(50) NOT NULL (sem CHECK), `lead_email` VARCHAR(255) NOT NULL, `event_timestamp` TIMESTAMPTZ NOT NULL, `payload` JSONB NOT NULL DEFAULT '{}', **`source` VARCHAR(20) NOT NULL DEFAULT 'webhook' (sem CHECK — `'polling'` aceito sem migration)**, `processed_at`, `created_at`. UNIQUE `(campaign_id, event_type, lead_email, event_timestamp)`. RLS tenant-scoped (service-role bypassa). Tipo TS `CampaignEventRow` com `source: "webhook" | "polling"` **já** no union [Source: src/types/tracking.ts:25-36,33] — nenhuma mudança de tipo p/ inserir `'polling'`.

### `opportunities` — schema confirmado (destino do processador)

[Source: supabase/migrations/00055_create_opportunities_schema.sql:25-48] `source` CHECK `('reply','engagement')`; `reply_event_id` FK `campaign_events(id)` nullable com UNIQUE `uq_opportunities_reply_event_id`; `lead_id` nullable SET NULL; `campaign_id` NOT NULL sem FK; `intent`/`lt_interest_status`/`suggestion`/`unibox_url`/`reply_text`/`reply_subject` nullable; `status` default `'new'`. Tipos + `toOpportunityRow` [Source: src/types/opportunity.ts:52-139]. **Para o INSERT, monte um payload parcial** (não um `Opportunity` completo) e deixe o DB preencher `id`/`status`/`created_at`/`updated_at` — `toOpportunityRow` exige um `Opportunity` inteiro, então aqui é mais direto montar o objeto snake_case do insert manualmente.

### Anti-Patterns a evitar

1. **NÃO** modificar `instantly-webhook/index.ts` nem `instantly-webhook-utils.ts` (AC8; SYNC-NOTICE).
2. **NÃO** usar `new Date()` para `event_timestamp` — use `email.timestamp_created` (dedupe depende disso).
3. **NÃO** deixar `reply_event_id` null em `source='reply'` (quebra NFR2).
4. **NÃO** usar `.upsert` com merge — use `.insert()` + tratar `23505` (padrão do webhook).
5. **NÃO** usar `.single()` no match de lead (erra em >1 linha) — use `.limit(1).maybeSingle()` + `ilike`.
6. **NÃO** fazer `ALTER lead_interactions.lead_id DROP NOT NULL` — pule a interaction quando não há lead (Option A).
7. **NÃO** classificar intent por IA, criar `source='engagement'`, UI ou notificações (21.3/21.6/21.4/21.7).
8. **NÃO** hardcodar segredos na migration 00056 — Vault (fix CRITICAL da 13.3).
9. **NÃO** usar `process.env.X!` (eslint `no-non-null-assertion` no pre-commit) — leitura guardada.
10. **NÃO** `fetch` cru para o Instantly — passe pela `TrackingService`/`ExternalService`.

### Previous Story Intelligence (21.1)

- Migration `00055` **já aplicada à mão** no banco do cliente (idempotente). As 3 tabelas (`opportunities`/`notification_settings`/`app_notifications`) e os tipos (`src/types/opportunity.ts`, re-export no barrel) já existem.
- AC5 do spike já **fechado**: webhooks bloqueados, `GET /emails` funciona (escopo `all:all`), `campaign_events` **vazia** (0 linhas) → backfill é 100% via API.
- A 21.1 **pulou** o registro de mocks Supabase (não tinha queries); **esta story tem** — registre os mocks (Task 7.7).
- Padrões de teste da story: red-green, espelhar `__tests__/unit/lib/utils/monitoring-processor.test.ts` e `__tests__/unit/app/api/monitoring/process-batch/route.test.ts`.

### Git Intelligence (últimos commits relevantes)

- `e7355f6` docs/scripts (custos/proposta 20.4) — sem impacto técnico.
- `dcc25fa` planejamento Epic 21 + spike + sprint status — contexto desta story.
- Story 21.1 (working tree: `src/types/opportunity.ts`, `00055_*.sql`, testes) — fundação já commitada no baseline.

### Project Structure Notes

**Novos:**
- `src/lib/utils/reply-sweep.ts`, `src/lib/utils/reply-processor.ts`
- `src/app/api/replies/process-batch/route.ts`, `src/app/api/replies/backfill/route.ts`
- `supabase/functions/reply-sweep/index.ts`
- `supabase/migrations/00056_schedule_reply_sweep_cron.sql`
- Testes: `__tests__/unit/lib/utils/reply-sweep.test.ts`, `reply-processor.test.ts`, `__tests__/unit/app/api/replies/process-batch/route.test.ts`, `backfill/route.test.ts`, e regressão do `EVENT_TYPE_MAP`

**Modificados:**
- `src/lib/services/tracking.ts` (+`getReceivedEmails`), `src/types/tracking.ts` (+tipos do e-mail + `EMAILS_ENDPOINT`)
- `.env.example` (+`REPLIES_CRON_SECRET`)

**Intocados (garantir):** `supabase/functions/instantly-webhook/index.ts`, `src/lib/webhook/instantly-webhook-utils.ts`.

Alinhamento total com a estrutura existente; zero conflito.

### References

- [Source: _bmad-output/planning-artifacts/epic-21-loop-de-resposta.md#Story 21.2] — ACs, FRs, sequência
- [Source: _bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md] — `GET /emails` validado, amostra real, rate limit, escala `lt_interest_status`
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#story-21.1] — dívidas NFR2 (reply idempotência) e engagement dedup (esta → reply; engagement → 21.6)
- [Source: _bmad-output/implementation-artifacts/21-1-schema-de-oportunidades-tipos-e-validacao-real-do-spike.md] — schema/tipos da fundação, decisões de FK/enum
- [Source: supabase/migrations/00039_create_campaign_events.sql] — destino do sweep, UNIQUE 4-tupla, `source` sem CHECK
- [Source: supabase/migrations/00055_create_opportunities_schema.sql:25-48] — destino do processador, UNIQUE `reply_event_id`
- [Source: supabase/migrations/00013_create_lead_interactions.sql] — enum `campaign_reply`, `lead_id NOT NULL`
- [Source: supabase/migrations/00010_create_leads.sql] — sem UNIQUE(tenant,email), e-mail não-normalizado
- [Source: supabase/functions/instantly-webhook/index.ts:201-258] — lookup de campanha + INSERT + dedupe `23505` (padrão a espelhar; NÃO modificar)
- [Source: src/lib/webhook/instantly-webhook-utils.ts:18-24,255] — `EVENT_TYPE_MAP` (regressão AC4), dedupe
- [Source: src/lib/services/tracking.ts:35-38,280-320] — base URL, cursor pagination (template de `getReceivedEmails`)
- [Source: src/lib/services/base-service.ts:197-274] — `request`/retry/`ExternalServiceError`
- [Source: src/types/tracking.ts:25-36,280-315] — `CampaignEventRow` (`source` union), `InstantlyLeadEntry`, `lt_interest_status` string (309)
- [Source: supabase/functions/monitor-leads/index.ts] — thin trigger (template da edge fn)
- [Source: supabase/migrations/00045_schedule_monitor_leads_cron.sql] — `cron.schedule` + Vault (template da 00056)
- [Source: src/app/api/monitoring/process-batch/route.ts:35-45,219-264] — auth por secret, service-role, `Promise.allSettled`
- [Source: src/app/api/monitoring/initial-scan/route.ts] — variante sessão de usuário (template do backfill)
- [Source: src/lib/utils/monitoring-processor.ts:136-155] — `getApiKey`; padrão do módulo processador
- [Source: src/app/api/leads/import-results/route.ts:97-164] — match de lead por e-mail (lowercase) + INSERT `campaign_reply`

## Dev Agent Record

### Agent Model Used

Amelia (dev-story workflow) — claude-opus-4-8[1m]

### Debug Log References

- Suíte completa: 371 arquivos / 6283 testes verdes, 0 falhas, 2 skip (2ª execução limpa; a 1ª teve um crash de worker environmental — não-determinístico, não é falha de teste).
- Testes da story em isolamento: 154 verdes (tracking 33, reply-sweep 12, reply-processor 17, process-batch 5, backfill 6, webhook regressão +2, tracking types).
- `npx tsc --noEmit`: 0 erros em `src/` (erros pré-existentes só em `__tests__/` — fora do escopo do DoD).
- `npx eslint --max-warnings=0` nos 6 arquivos `src/` novos/modificados: limpo (inclusive `no-non-null-assertion` — leitura guardada de env).
- `npm run build`: exit 0; rotas `/api/replies/process-batch` e `/api/replies/backfill` registradas (ƒ dynamic).

### Completion Notes List

Pipeline de ingestão por polling implementado end-to-end (a 21.1 entregou só schema+tipos):

- **Sweep** (`reply-sweep.ts`): `GET /api/v2/emails?email_type=received` → INSERT `campaign_events` (`source='polling'`, `event_type='email_replied'`). `event_timestamp = email.timestamp_created` (ISO estável — dedupe pela UNIQUE 4-tupla funciona entre polls; risco #1 resolvido). Dedupe `.insert()` + `23505` benigno (padrão webhook, NÃO `.upsert`). Janela incremental por-tenant = `MAX(event_timestamp)` de polling − overlap (10 min), piso 30 dias. Isolamento por-tenant com `Promise.allSettled` + fail-open (API/erro/sem-key não quebram o cron). Cache de lookup de campanha por sweep.
- **Processador** (`reply-processor.ts`): `campaign_events` (email_replied não processados via LEFT anti-join por `reply_event_id`) → INSERT `opportunities` (`source='reply'`). **NFR2 resolvido**: `reply_event_id` SEMPRE setado + `23505` (UNIQUE) benigno = idempotência real. Filtro de auto-reply (AC4) combinado: `i_status===0` (OOO) OU regex PT/EN de assunto/corpo → `skipped`, sem oportunidade. Match de lead `.ilike` + `.limit(1).maybeSingle()` (nunca `.single()`); lead casado → `lead_id` + `lead_interaction` `campaign_reply`; sem lead (AC7) → oportunidade com `lead_id: null` e SEM interaction (Option A — `lead_interactions.lead_id` é NOT NULL). `intent` fica null (é 21.3). `unibox_url` null via polling.
- **Cron** (`/api/replies/process-batch` + edge fn `reply-sweep` + migration `00056`): 4 hops espelhando 13.3/00045. Rota service-role, auth por `REPLIES_CRON_SECRET` (leitura guardada). Edge fn thin (só `fetch`). Migration idempotente com `cron.unschedule` defensivo + segredos via **Vault** (nunca hardcoded).
- **Backfill** (`/api/replies/backfill`): auth por sessão de admin (`hasAdminAccess`; sdr → 403), service-role, `sweepReplies({since:'2026-01-01', tenantId})` + `processReplies({tenantId})`. Idempotente por construção.
- **Webhook intocado** (AC8): `instantly-webhook/index.ts` e `instantly-webhook-utils.ts` não foram modificados. Regressão AC4 adicionada garante `auto_reply_received` fora do `EVENT_TYPE_MAP`.

**Notas operacionais p/ Fabossi (OPERACIONAL — não bloqueiam a review):**
1. Gerar e configurar `REPLIES_CRON_SECRET` (`openssl rand -hex 32`) na Vercel (env) **e** nos secrets da Edge Function `reply-sweep` (Supabase Dashboard) — devem casar. `NEXT_APP_URL` vai só nos secrets da Edge Function.
2. Deploy da edge fn: `npx supabase functions deploy reply-sweep`.
3. Aplicar a migration `00056` no banco (gerido à mão) — reutiliza os segredos Vault (`supabase_url`, `service_role_key`) já criados pela 00045; se ainda não existirem, criar via `vault.create_secret`.
4. Rodar o backfill uma vez (`POST /api/replies/backfill` como admin) para importar o histórico de respostas (desde mar/2026).

**Decisão de segredo:** `REPLIES_CRON_SECRET` dedicado (isolamento de rotação), conforme default das Dev Notes. **CHECK belt-and-suspenders** (`source<>'reply' OR reply_event_id IS NOT NULL`) NÃO aplicado — a idempotência já é garantida pelo processador sempre popular `reply_event_id`; fica como migration futura opcional.

### Validação Local & Handoff para o Review (2026-07-13)

> **Para o revisor:** esta seção registra o que já foi validado localmente contra o Instantly/banco **reais**, dois achados de dados reais que impactam a review, e o que **ainda falta testar** (o backfill real). Ordem recomendada: **review (LLM diferente) → backfill real → deploy**.

**Config operacional já executada (Fabossi):**
- `REPLIES_CRON_SECRET` gerado (`openssl rand -hex 32`) e configurado na **Vercel** (Dev/Preview/Prod) **e** nos secrets da **Edge Function `reply-sweep`** (Supabase) — mesmos valores. `.env.local` também recebeu (dev local).
- Edge Function `reply-sweep` **deployada** no Supabase.
- Migration **`00056` aplicada** no banco.

**Testado localmente (dev server + Instantly/banco reais):**
- **Auth:** 401 sem header / secret errado; 200 com secret correto.
- **`POST /api/replies/process-batch` (cron, janela 30d):** 200 → `{swept:0,created:0,skipped:0,errors:[]}`. **0 é o comportamento CORRETO** — as respostas reais são de **mar/2026** (fora da janela de 30 dias); quem pega o histórico é o backfill (janela ampla). Nenhum log de erro/`no-key` (tenant+chave existem).
- **Read real (diagnóstico read-only, janela ampla desde 2026-01-01):** `GET /api/v2/emails` → **200, 5 received na 1ª página + cursor `next_starting_after`** (paginação ok); chave decripta OK; **shape confere** com `InstantlyReceivedEmail` (`campaign_id`, `lead`=e-mail do lead, `subject`, `body.text` 5196 chars, `timestamp_created` mar/2026).
- **Estado do banco:** `api_configs` instantly = 1 (tenant `...0001`); `campaigns` c/ `external_campaign_id` = 7; `campaign_events` = 0; `opportunities` = 0.

**🔴 Dois achados de dados reais (o revisor DEVE avaliar):**
1. **`email_type` volta `undefined`** nos e-mails reais; só **`ue_type: 2`** identifica received. O filtro defensivo da Task 1.3 (`email_type === "received" || ue_type === 2`) é **ESSENCIAL** — sem o fallback `ue_type`, os 5 e-mails seriam descartados. Confirmar que esse filtro se mantém intacto.
2. **`i_status` volta `undefined`** nos dados reais → a heurística de auto-reply **`(a) i_status === 0` fica dormente** na prática; o **`(b) regex` de assunto/corpo é o filtro efetivo de OOO**. Não é bug, mas avaliar a robustez/cobertura do regex (PT/EN), já que é o filtro real.

**⏳ Falta testar no review (pós-review — ESCREVE dados reais):**
- **Backfill real** (`POST /api/replies/backfill` como admin, janela ampla) — único passo que grava `opportunities`/`campaign_events` de verdade. Rodar **DEPOIS** do review para o 1º write real ser sobre código revisado. **Validar:** oportunidades criadas com `reply_event_id` setado; `lead_interactions` só quando o lead casa; **idempotência** (2ª execução → `created:0`); dedupe `23505`.
- **Match de lead:** conferir se os leads das respostas existem na base (senão, `opportunities` com `lead_id: null` — AC7, esperado/válido).
- **Cron end-to-end** (pós-deploy): confirmar que o `pg_cron`→edge-fn→rota fecha o loop (hop 3→4 depende do `REPLIES_CRON_SECRET` casar nos dois lados).

### File List

**Novos:**
- `src/lib/utils/reply-sweep.ts`
- `src/lib/utils/reply-processor.ts`
- `src/app/api/replies/process-batch/route.ts`
- `src/app/api/replies/backfill/route.ts`
- `supabase/functions/reply-sweep/index.ts`
- `supabase/migrations/00056_schedule_reply_sweep_cron.sql`
- `__tests__/unit/lib/utils/reply-sweep.test.ts`
- `__tests__/unit/lib/utils/reply-processor.test.ts`
- `__tests__/unit/app/api/replies/process-batch/route.test.ts`
- `__tests__/unit/app/api/replies/backfill/route.test.ts`

**Modificados:**
- `src/lib/services/tracking.ts` (+`getReceivedEmails`, `EMAILS_ENDPOINT`)
- `src/types/tracking.ts` (+`InstantlyReceivedEmail`, `InstantlyEmailBody`, `InstantlyEmailsListResponse`, `GetReceivedEmailsParams`)
- `.env.example` (+`REPLIES_CRON_SECRET`)
- `__tests__/unit/lib/services/tracking.test.ts` (+testes `getReceivedEmails`)
- `__tests__/unit/functions/instantly-webhook.test.ts` (+regressão `auto_reply_received`)
- `__tests__/helpers/mock-data.ts` (+`createMockInstantlyReceivedEmail`)

**Intocados (garantido — AC8/SYNC-NOTICE):**
- `supabase/functions/instantly-webhook/index.ts`
- `src/lib/webhook/instantly-webhook-utils.ts`

## Change Log

- 2026-07-13: **Backfill real executado + validado (fecha a pendência pós-review).** Contra Instantly + banco de produção reais, sobre o código já revisado. Baseline limpo (0/0). Smoke do cron (`process-batch`, secret): 401 sem/errado, 200 com secret correto → `{swept:0}` (janela 30d não alcança mar/2026 — correto). Backfill 1ª execução: `{swept:3, created:2, skipped:3, errors:[]}`. Verificação no banco: `campaign_events`=3 (polling/email_replied), `opportunities`=2 (source='reply', **2/2 com reply_event_id setado — NFR2**, 2/2 lead casado, unibox_url null), `lead_interactions campaign_reply`=2, 1 auto-reply filtrado pelo regex conservador. Idempotência (2ª execução): `{swept:0, created:0, skipped:6}` — totais inalterados (3/2/2), zero duplicata. Diagnóstico read-only: `scripts/inspect-reply-loop.mjs` (novo). **Pendente só a nível de deploy:** cron deployado (pg_cron→edge fn→rota) só fecha o loop quando a branch 21.2 for para a Vercel — o `NEXT_APP_URL` da edge fn aponta pra prod, que ainda não tem `/api/replies/*`; validar `cron.job_run_details` + logs da edge fn pós-deploy.
- 2026-07-13: **Code review 3 camadas (bmad-code-review) — status → done.** 9/9 ACs SATISFEITOS, 10/10 anti-patterns respeitados, 0 HIGH. 1 decision-needed (tuning do regex OOO → decisão Fabossi: CONSERVADOR, não perde lead) + **7 patches aplicados**: (1) escape de `%`/`_`/`\` no `.ilike` do match de lead [reply-processor.ts]; (2) guard `!repliesSecret` fail-closed na auth do cron [process-batch/route.ts]; (3) `processReplies` com anti-join buscado antes, ordenação determinística, cap explícito+warning e concorrência limitada (lotes de 20) [reply-processor.ts]; (4) `insertReplyEvent` surfaça erro real ≠23505 em `errors` + guarda `timestamp_created` [reply-sweep.ts]; (5) checagem do `error` do anti-join [reply-processor.ts]; (6) warning na exaustão do cap de paginação [tracking.ts]; (7) regex de auto-reply conservador + acento-insensível [reply-processor.ts]. 1 defer (fail-open de secret ausente é sistêmico — também na rota de monitoring 13.3 → deferred-work). 5 dismiss. +7 testes. Validação reconfirmada: suíte 371 files/6290 pass/2 skip/0 fail; tsc 0 erros em src/; eslint `--max-warnings=0` limpo; `npm run build` verde (rotas `/api/replies/*` registradas).
- 2026-07-13: Validação local + config operacional (pós dev-story). `REPLIES_CRON_SECRET` na Vercel (3 envs) + secret da edge fn; edge fn `reply-sweep` deployada; migration 00056 aplicada. Testado local contra Instantly/banco reais: auth 401/200 ok; process-batch (janela 30d) → 0 (correto, respostas são de mar/2026); read real (janela ampla) → GET /emails 200, 5 received + cursor, shape confere. 2 achados reais registrados no handoff (email_type=undefined→ue_type=2 salva o filtro defensivo; i_status=undefined→regex é o filtro efetivo de OOO). Backfill real (write) deixado p/ DEPOIS do review. Ver "Validação Local & Handoff para o Review". Sem mudança de código.
- 2026-07-13: Story 21.2 implementada (dev-story) — sweep de polling (`getReceivedEmails` → `campaign_events` `source='polling'`) + processador (`campaign_events` → `opportunities`/`lead_interactions`, NFR2 idempotência resolvida) + filtro de auto-reply + cron (edge fn `reply-sweep` + migration 00056, Vault) + backfill admin. Webhook intocado (AC8) + regressão. tsc 0 erros em src/, eslint limpo, suíte 371/6283 verde, build verde. Execução operacional (secret + deploy edge + 00056 + backfill) sinalizada p/ Fabossi. Status: review.
- 2026-07-13: Story 21.2 criada (create-story) — ingestão por polling (sweep `GET /emails` → `campaign_events` `source='polling'`) + processador (`campaign_events` → `opportunities` + `lead_interactions`) + cron (edge fn + migration 00056) + backfill admin. Absorve a antiga 21.8. Herda e resolve dívidas NFR2 da review 21.1. Status: ready-for-dev.
