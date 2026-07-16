---
baseline_commit: dd934493
---
# Story 21.6: Janela de Oportunidade Cross-Campanha

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **PROMOVIDA 2026-07-13 (decisão Fabossi):** executa logo após a 21.2 — com poucas respostas esperadas nas campanhas, **abertura/clique é o gatilho dominante** da Central. Zero dependência de webhook: o polling existente do Epic 10 (`POST /api/v2/leads/list` via `TrackingService.getLeadTracking`) já entrega `openCount`/`clickCount` por lead e o `opportunity-engine` já qualifica por abertura. Sequência do épico: 21.1 → 21.2 → **21.6** → 21.3 → 21.4 → 21.5 → 21.7.

## Story

As a usuário,
I want que leads com alto engajamento (aberturas/cliques) também apareçam na Central,
so that eu aja sobre leads quentes que ainda não responderam — antes do concorrente.

## Acceptance Criteria

1. **Given** o sync de analytics de uma campanha detecta lead que cruza o threshold da Janela de Oportunidade — regra: threshold de opens existente (`openCount >= minOpens` na janela `periodDays`) **OU** `clickCount >= 1` (clique é sinal mais raro e mais forte que abertura) **When** o processamento roda **Then** cria oportunidade `source='engagement'` para o lead (sem duplicar se já existe oportunidade **ativa** do mesmo lead) (FR12)

2. **Given** a Central **Then** oportunidades de engajamento aparecem com badge própria ("Alto engajamento") distinta das de resposta **And** o card mostra o detalhe (X aberturas, Y cliques, último engajamento em Z). *(A renderização do card/badge na página Central é da Story 21.4 — esta story entrega o **modelo de dados** que a 21.4 consome: `source='engagement'` + colunas de métrica `open_count`/`click_count`/`last_engagement_at`; ver Dev Notes "Fronteira de escopo 21.6 × 21.4". A superfície visual que a 21.6 toca hoje é o `OpportunityPanel` dentro do analytics da campanha — ver AC3.)*

3. **Given** o `opportunity-engine` existente **Then** é **estendido (não duplicado)** para considerar cliques e operar cross-campanha **And** a UI atual da Janela dentro do analytics da campanha (`OpportunityPanel` + preview do `ThresholdConfig`) continua funcionando sem regressão (o conjunto qualificado agora inclui leads com `clickCount >= 1` — mudança **intencional** da regra, não regressão; comportamento opens-only permanece idêntico quando não há cliques)

4. **Given** um lead de engajamento posteriormente responde **Then** a oportunidade é atualizada para `source='reply'` (upgrade **in-place**, não duplicata) — o card único preserva o histórico de engajamento

5. Testes unitários para: o engine estendido (opens OU cliques; regressão opens-only; janela de clique; leads só-clique sem `lastOpenAt`), o processador de engajamento (mock `getLeadTracking`), as regras de dedupe (ativo do mesmo lead) e o upgrade engagement→reply no reply-processor

## Tasks / Subtasks

- [x] **Task 1: Estender o `opportunity-engine` para qualificar por cliques (AC: #1, #3)**
  - [x] 1.1 Em `src/lib/services/opportunity-engine.ts`: adicionar `export const MIN_CLICKS_FOR_OPPORTUNITY = 1;` (clique é sinal forte — threshold fixo, **não** configurável; ver Dev Notes "Por que ≥1 clique não é config")
  - [x] 1.2 Reescrever o predicado de `evaluateOpportunityWindow` (linhas 33-38) para `qualificaPorOpens || qualificaPorClicks`:
    - `qualificaPorOpens` = `lead.openCount >= config.minOpens && lead.lastOpenAt != null && new Date(lead.lastOpenAt) >= cutoff` (comportamento atual **preservado byte-a-byte** quando não há cliques)
    - `qualificaPorClicks` = `lead.clickCount >= MIN_CLICKS_FOR_OPPORTUNITY && (lead.lastClickAt == null ? true : new Date(lead.lastClickAt) >= cutoff)`
    - **🔴 Trap de regressão (ver Dev Notes "Trap #1"):** o guard atual `if (!lead.lastOpenAt) return false` (linha 35) descarta silenciosamente leads só-clique (`clickCount>0`, `openCount=0` → `lastOpenAt=null`). O novo predicado NÃO pode ter esse early-return no caminho de clique.
  - [x] 1.3 Adicionar campo `qualifiedBy: "opens" | "clicks" | "both"` ao tipo `OpportunityLead` (`src/types/tracking.ts:182-185`) e populá-lo no `.map()` do engine (linhas 39-43). Usado pelo processador (métricas) e, futuramente, pela 21.4 (badge). `lastEngagementAt` derivado no `.map()` = `max(lastOpenAt, lastClickAt)` (o mais recente não-nulo) — expõe o "último em Z" do AC2 sem recomputar downstream
  - [x] 1.4 `getDefaultConfig` (linhas 10-21) **não** muda (o threshold de clique é constante, não vive no config) — garante que os 2 call-sites existentes (`useOpportunityLeads` e o preview `getDefaultConfig("")` do `ThresholdConfig.tsx:56`) não quebrem

- [x] **Task 2: Mapear `lastClickAt` no `LeadTracking` (AC: #1, #2)**
  - [x] 2.1 Em `src/types/tracking.ts`: adicionar `lastClickAt: string | null;` à interface `LeadTracking` (junto de `lastOpenAt`, linha 150) — aditivo
  - [x] 2.2 Em `src/lib/services/tracking.ts`, `mapToLeadTracking` (linhas 141-172): mapear `lastClickAt: item.timestamp_last_click ?? null` (o campo `timestamp_last_click` **já existe** em `InstantlyLeadEntry:291`, só nunca foi mapeado). Aditivo — nenhum consumidor atual quebra

- [x] **Task 3: Migration `00057` — métricas de engajamento + chave de dedup (AC: #1, #2)**
  - [x] 3.1 `supabase/migrations/00057_add_engagement_to_opportunities.sql` — idempotente/defensiva (banco gerido à mão, ver 00053/00055). `ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS open_count INTEGER`, `ADD COLUMN IF NOT EXISTS click_count INTEGER`, `ADD COLUMN IF NOT EXISTS last_engagement_at TIMESTAMPTZ` (todas nullable — irrelevantes p/ `source='reply'`)
  - [x] 3.2 Índice parcial UNIQUE de idempotência (dívida deferida da review 21.1 — ver Dev Notes "Dedup deferido p/ 21.6"): `CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_engagement ON public.opportunities(tenant_id, campaign_id, lead_id) WHERE source='engagement';` — backstop para reprocesso do mesmo `(campaign, lead)` (o dedupe AC1 "do mesmo lead" é app-level, ver Task 4.4). `COMMENT ON` documentando o trade-off (lead descartado que re-engaja na MESMA campanha não gera card novo — aceitável, evita ruído)
  - [x] 3.3 Atualizar os tipos em `src/types/opportunity.ts`: adicionar `open_count: number | null`, `click_count: number | null`, `last_engagement_at: string | null` a `OpportunityRow`; `openCount`/`clickCount`/`lastEngagementAt` a `Opportunity`; mapear em `toOpportunity`/`toOpportunityRow`. Estender os testes de round-trip (`__tests__/unit/types/opportunity.test.ts`) com os 3 campos novos (preenchidos e nulos)

- [x] **Task 4: Processador de engajamento `src/lib/utils/engagement-processor.ts` (AC: #1, #4)**
  - [x] 4.1 `export async function processEngagement(supabase, { tenantId? }): Promise<EngagementResult>` — cliente parametrizado (service-role no cron, admin no backfill). **Espelha estruturalmente `reply-sweep.ts`** (iteração de tenants + `Promise.allSettled` + fail-open per-tenant)
  - [x] 4.2 Por tenant: `getApiKey(supabase, tenantId, "instantly")` (reuso de `monitoring-processor.ts:136-155`; null → log + pula, fail-open). Enumerar as campanhas exportadas do tenant: `from("campaigns").select("id, external_campaign_id").eq("tenant_id", tenantId).not("external_campaign_id", "is", null)` (opcional `.eq("export_platform","instantly")`; existe índice parcial `idx_campaigns_external_campaign_id`). **Nova query** — não há repo que enumere isso (só o lookup por-id do `reply-sweep.ts:163-185`)
  - [x] 4.3 Por campanha: `new TrackingService().getLeadTracking({ apiKey, externalCampaignId })` → `LeadTracking[]`; carregar o `OpportunityConfig` do tenant/campanha (SELECT `opportunity_configs` por `campaign_id`; fallback `getDefaultConfig(campaignId)` se ausente — mesmo fallback do `useOpportunityConfig:62`); rodar `evaluateOpportunityWindow(leads, config)` → `OpportunityLead[]` qualificados. **Respeitar NFR5** (rate limit 20 req/min): 1 `getLeadTracking` por campanha; se um tenant tiver muitas campanhas, limitar N por ciclo e logar o remanescente (o próximo ciclo continua) — ver Dev Notes "Rate limit do engagement"
  - [x] 4.4 Por lead qualificado, criar `opportunity` (`source='engagement'`) com dedup:
    - **Match de lead local (obrigatório):** `matchLeadId(supabase, tenantId, leadEmail)` — **reusar o helper de `reply-processor.ts:121-141`** (extrair para módulo compartilhado ou re-exportar; NÃO copiar/colar a lógica de escape de LIKE). `LeadTracking.leadId` é o id do lead **no Instantly**, não o `leads.id` local (`tracking.ts:156`) → precisa do match por e-mail. **Se não casar lead local → PULAR** (log; ver Dev Notes "Por que engajamento exige lead local" — diverge do reply AC7 conscientemente)
    - **Dedup app-level (AC1 "ativo do mesmo lead"):** antes do INSERT, checar se já existe oportunidade ativa do lead: `from("opportunities").select("id").eq("tenant_id", t).eq("lead_id", leadId).in("status", ["new","viewed","contacted"]).limit(1).maybeSingle()`. Se existir → PULAR (não duplica card para lead já na Central, qualquer source/campanha)
    - **INSERT** com `source:'engagement'`, `reply_event_id: null` (N engagements não colidem no UNIQUE — 00055), `campaign_id` (local, da enumeração), `lead_id`, `open_count`, `click_count`, `last_engagement_at`, `lt_interest_status` (bruto se `int`, senão null — normalização é 21.3). **Tratar `23505`** (índice parcial `uq_opportunities_engagement`) **como sucesso benigno** (reprocesso do mesmo campaign+lead) — mesmo padrão do reply-processor
  - [x] 4.5 Registrar `lead_interaction`? **NÃO** nesta story — o enum `interaction_type` (00013) é PG ENUM nativo e **não tem** valor de engajamento; adicionar exigiria `ALTER TYPE` (fora de escopo; o reply usa `campaign_reply`). Deixar `lead_interactions` só para replies (21.2). Documentar em comentário

- [x] **Task 5: Upgrade engagement→reply no reply-processor (AC: #4)**
  - [x] 5.1 **Modificar** `src/lib/utils/reply-processor.ts` (arquivo DONE da 21.2 — regressão-crítico, ver Dev Notes "Modificar 21.2 com segurança"): em `processReplyEvent`, **antes** do INSERT de reply (linha 175), se `leadId` não-nulo, buscar oportunidade **ativa** `source='engagement'` do lead (`.eq("lead_id", leadId).eq("source","engagement").in("status",["new","viewed","contacted"]).limit(1).maybeSingle()`)
  - [x] 5.2 Se existir engajamento ativo → **UPDATE in-place** dessa linha: `source='reply'`, `reply_event_id=event.id`, `reply_text`/`reply_subject`/`unibox_url`/`lt_interest_status` do payload — em vez de INSERT novo (evita card duplicado; preserva `open_count`/`click_count`/`created_at`). Tratar `23505` do UPDATE (`reply_event_id` já usado por outro reply) como benigno. Se **não** existir → INSERT normal (caminho da 21.2, **intocado** — comportamento byte-a-byte igual)
  - [x] 5.3 **Regressão:** todos os 9 ACs e testes da 21.2 permanecem verdes. O caminho "sem engajamento prévio" (o único que os testes da 21.2 exercitam hoje) NÃO pode mudar de comportamento. Adicionar teste do novo caminho de upgrade

- [x] **Task 6: Acoplar `processEngagement` ao cron existente (AC: #1)**
  - [x] 6.1 **Reusar o cron da 21.2** — em `src/app/api/replies/process-batch/route.ts` (POST): após `sweepReplies` + `processReplies`, chamar `processEngagement(supabase)`. Incluir os contadores no resumo (`engagementCreated`, `engagementSkipped`, erros com `scope:"engagement"`). **NÃO** criar cron/edge-function/secret novos (ver Dev Notes "Por que piggyback, não cron novo"). A edge fn `reply-sweep` + migration `00056` + `REPLIES_CRON_SECRET` já cobrem o disparo ≤5 min (NFR3)
  - [x] 6.2 Comentário no topo da rota documentando que ela agora processa **replies + engajamento** (o nome `replies` fica por compat do endpoint já deployado — renomear quebraria o `NEXT_APP_URL` da edge fn em prod)

- [x] **Task 7: Backfill de engajamento (AC: #1)**
  - [x] 7.1 Em `src/app/api/replies/backfill/route.ts` (admin session, da 21.2): após `sweepReplies` + `processReplies`, chamar `processEngagement(supabase, { tenantId: profile.tenant_id })`. Idempotente por construção (dedup app-level + `uq_opportunities_engagement` + 23505). Incluir contadores de engajamento no resumo

- [x] **Task 8: Exibir cliques no `OpportunityPanel` (AC: #2, #3 — superfície atual)**
  - [x] 8.1 Em `src/components/tracking/OpportunityPanel.tsx` (linhas 363-368): exibir `clickCount` ao lado de `openCount` (ex.: "{openCount} abertura(s) · {clickCount} clique(s)"). Aditivo, baixo risco. Ajustar a cópia do `EmptyState` (linhas 79-87, "Nenhum lead atingiu o threshold atual") se ficar opens-cêntrica demais
  - [x] 8.2 **Não** construir a página Central nem o card de engajamento com badge "Alto engajamento" aqui — isso é da 21.4 (ver Fronteira de escopo). O `OpportunityPanel` já recebe `OpportunityLead[]` do engine estendido e passa a incluir leads qualificados por clique automaticamente (via Task 1)

- [x] **Task 9: Testes unitários (AC: #5)**
  - [x] 9.1 `__tests__/unit/lib/services/opportunity-engine.test.ts`: **regressão opens-only** (mesmos leads → mesmo resultado de antes quando `clickCount=0`); qualificação por clique (`clickCount>=1`, `openCount=0`, `lastOpenAt=null` → qualifica, **prova que o trap #1 foi corrigido**); janela de clique (`lastClickAt` fora do `periodDays` → não qualifica); `qualifiedBy` correto (opens/clicks/both); `lastEngagementAt` = max
  - [x] 9.2 `__tests__/unit/lib/utils/engagement-processor.test.ts`: mock `getLeadTracking` + enumeração de campanhas; cria `source='engagement'` com métricas; dedup app-level (oportunidade ativa do lead → pula); `23505` benigno; lead sem match local → pula; fail-open per-tenant (sem key / erro de API não quebra); isolamento por-tenant
  - [x] 9.3 `__tests__/unit/lib/utils/reply-processor.test.ts` (estender): upgrade — engajamento ativo do lead + reply chega → UPDATE in-place (não INSERT novo); **sem** engajamento prévio → comportamento 21.2 intocado
  - [x] 9.4 `__tests__/unit/types/opportunity.test.ts` (estender): round-trip dos 3 campos de métrica
  - [x] 9.5 Rotas: `process-batch` e `backfill` retornam contadores de engajamento (estender os testes existentes de 21.2)
  - [x] 9.6 Registrar mocks das tabelas usadas (`opportunities`, `campaigns`, `leads`, `api_configs`) — já registrados na 21.2; reusar

- [x] **Task 10: Validação** — `npx tsc --noEmit` (0 novos erros em `src/`); `npx eslint <arquivos novos/modificados>` limpo (`--max-warnings=0`, inclusive `no-non-null-assertion` — leitura guardada de env); `npx vitest run` verde; `npm run build` verde

## Dev Notes

Esta story adiciona o **gatilho dominante** da Central (engajamento por aberturas/cliques) **antes** da classificação IA (21.3) e da página Central (21.4). O pipeline de engajamento é **paralelo** ao de resposta (21.2): não passa por `campaign_events` (opens/clicks não viram evento via polling — só replies viram, na 21.2), e sim lê o tracking ao vivo (`getLeadTracking` → `LeadTracking` com `openCount`/`clickCount`) e persiste `opportunities` (`source='engagement'`).

### Arquitetura (paralela ao pipeline de resposta da 21.2)

```
pg_cron (*/5, migration 00056)  →  reply-sweep (edge fn, thin)  →  fetch  →
  /api/replies/process-batch (Node, service-role, REPLIES_CRON_SECRET)   ← REUSA a rota da 21.2
     ├─ sweepReplies()       : Instantly GET /emails → campaign_events (source='polling')      [21.2]
     ├─ processReplies()     : campaign_events → opportunities (source='reply')                 [21.2, +upgrade Task 5]
     └─ processEngagement()  : por campanha → getLeadTracking → evaluateOpportunityWindow →
                                opportunities (source='engagement')                             [NOVO, Task 4/6]

/api/replies/backfill (Node, admin session)  →  sweepReplies + processReplies + processEngagement  [Task 7]
```

Fonte da qualificação de engajamento (validada no spike EP21): `POST /api/v2/leads/list` (`TrackingService.getLeadTracking`) devolve `email_open_count`/`email_click_count`/`timestamp_last_open`/`timestamp_last_click` por lead — o `opportunity-engine` já qualifica por `openCount >= minOpens` hoje na UI do analytics; esta story só soma cliques e persiste. [Source: `epic-21-api-validation-spike-2026-07-13.md:105`; `src/lib/services/tracking.ts:141-172,284-324`]

### 🔴 Trap #1 — o guard `if (!lead.lastOpenAt) return false` mata leads só-clique

[Source: `src/lib/services/opportunity-engine.ts:35`] O predicado atual retorna `false` cedo se `lastOpenAt` é null. Um lead com `clickCount>0` mas `openCount=0` tem `lastOpenAt=null` (o `mapToLeadTracking` só popula `lastOpenAt` de `timestamp_last_open`). Se você mantiver esse early-return, **nenhum lead só-clique jamais qualifica** — AC1 quebra silenciosamente e nenhum teste opens-only pega. O novo predicado tem que ser um OR onde o ramo de clique é independente do `lastOpenAt`. **Este é o defeito mais provável desta story.**

### Fronteira de escopo 21.6 × 21.4 (LEIA — a 21.6 roda ANTES da Central)

A sequência revisada põe a **21.6 antes da 21.4** (Central de Oportunidades — Página e Cards). Logo, a **página Central e o card com badge "Alto engajamento" (AC2) são construídos na 21.4**, não aqui. O que a 21.6 entrega para a 21.4 renderizar:
- **Distinção de badge** = a coluna `source` (`'engagement'` vs `'reply'`) — já no schema (00055).
- **Detalhe do card ("X aberturas, Y cliques, último em Z")** = as 3 colunas novas `open_count`/`click_count`/`last_engagement_at` (migration 00057, Task 3).

A superfície **visual** que a 21.6 toca hoje é o `OpportunityPanel` **dentro do analytics da campanha** (Task 8): ele já consome o output do engine e passará a incluir leads qualificados por clique + exibir a contagem de cliques. **Não construa a página `/opportunities` aqui.** ✅ **DECIDIDO (Fabossi 2026-07-13):** manter a sequência 21.6 → 21.4 — a 21.6 entrega **só o modelo de dados**; a Central e o card de engajamento são da 21.4.

### Dedup deferido p/ 21.6 (dívida da review 21.1)

[Source: `_bmad-output/implementation-artifacts/deferred-work.md` — "Engajamentos sem chave de dedup"] A review da 21.1 deferiu explicitamente para esta story: `source='engagement'` tem `reply_event_id` NULL por design → o UNIQUE(reply_event_id) **não** deduplica engajamentos (múltiplos NULL são distintos no Postgres). Dono: 21.6. Solução em duas camadas (Task 3.2 + 4.4):
1. **App-level (primário, AC1 "ativo do mesmo lead"):** antes do INSERT, pular se já há oportunidade ativa (`status IN new/viewed/contacted`, **qualquer source/campanha**) do mesmo `lead_id`. Cobre "não duplicar card para lead já na Central".
2. **Índice parcial UNIQUE (backstop de idempotência):** `uq_opportunities_engagement (tenant_id, campaign_id, lead_id) WHERE source='engagement'` + `23505` benigno. Cobre reprocesso do mesmo `(campaign, lead)` em ciclos consecutivos do cron.

**Trade-off documentado:** um lead cuja engagement foi `discarded` e que re-engaja na **mesma** campanha não gera card novo (o índice bloqueia; 23505 benigno). Aceitável — evita re-nag. (Se null-lead fosse permitido, o índice não deduplicaria — por isso engagement exige lead local; ver abaixo.)

### Por que engajamento exige lead local (diverge do reply AC7 conscientemente)

O reply (21.2 AC7) cria oportunidade mesmo sem lead local (`lead_id: null`). O **engajamento não**: (a) o dedup depende de `lead_id` (sem ele, app-level e índice parcial não deduplicam → cards duplicados a cada ciclo); (b) o card de engajamento não tem texto de resposta — sem o lead local (nome, empresa, telefone) ele fica sem contexto útil; (c) leads de engajamento vêm de campanhas que **nós exportamos** → o lead tende a existir na base. Decisão: **match obrigatório por e-mail; sem match → pular + log** (não é erro). Reusar `matchLeadId` do `reply-processor.ts:121-141` (com o escape de LIKE já corrigido na review 21.2 — NÃO reescrever). ✅ **DECIDIDO (Fabossi 2026-07-13): "o mais seguro"** = pular sem lead local (criar com `lead_id: null` geraria card duplicado a cada ciclo — sem chave de dedup — e sem contexto).

### Modificar `reply-processor.ts` (arquivo DONE da 21.2) com segurança

O AC4 (upgrade engagement→reply) **exige** tocar o `reply-processor.ts`, que está `done`/revisado. Regras:
- O único caminho que os testes da 21.2 exercitam é "reply sem engajamento prévio" → esse caminho tem que ficar **byte-a-byte igual** (INSERT com `reply_event_id` sempre setado + 23505 benigno — NFR2 da 21.2).
- O upgrade é um ramo **novo e aditivo**: só dispara quando `leadId` não-nulo E existe engajamento ativo do lead. Nesse caso, UPDATE in-place (`source='reply'` + campos de reply + `reply_event_id`) em vez de INSERT.
- Preserve a idempotência: o UPDATE seta `reply_event_id` → reprocessar o mesmo reply cai no anti-join / 23505 da 21.2. Trate `23505` no UPDATE (o `reply_event_id` pode já estar em outra linha) como benigno.
- Rode a suíte completa da 21.2 (`reply-processor.test.ts`, `process-batch/route.test.ts`, `backfill/route.test.ts`) e confirme verde antes de considerar a Task 5 pronta.

### Por que piggyback no cron da 21.2, não cron novo

O `epic-21-post-deploy-checklist.md` já sinaliza a fragilidade de manter `REPLIES_CRON_SECRET` idêntico entre Vercel e o secret da Edge Function (401 silencioso se divergir). **Um segundo cron dobraria** essa superfície operacional (novo edge fn + nova migration de cron + novo secret + novo hop a validar pós-deploy). Reusar `/api/replies/process-batch` (Task 6) herda o disparo ≤5 min (NFR3), o secret e o cliente service-role já provados — zero config nova. Custo: o nome `replies` da rota fica levemente impróprio (também faz engajamento) — resolvido com um comentário; renomear quebraria o `NEXT_APP_URL` da edge fn já deployada. ✅ **DECIDIDO (Fabossi 2026-07-13): "melhor e mais simples"** = piggyback (sem cron/edge-fn/secret novos).

### Rate limit do engagement (NFR5)

Diferente do reply-sweep (1 chamada workspace-wide `GET /emails` por tenant), o engagement faz **1 `getLeadTracking` por campanha exportada**. O cliente tem 7 campanhas com `external_campaign_id` [Source: validação 21.2 — "campaigns c/ external_campaign_id = 7"] → ~7 req + 1 (reply) por ciclo, folgado contra 20 req/min. Ainda assim, cap defensivo: limite N campanhas por ciclo (ex.: 15) e log do remanescente (próximo ciclo continua). `getLeadTracking` já pagina com teto `MAX_PAGINATION_PAGES=50` [Source: `tracking.ts:43,321`].

### Por que ≥1 clique não é config (mantém 3 arquivos intactos)

AC1 fixa "≥1 clique" ("clique é sinal mais raro e mais forte"). Mantê-lo como **constante** (`MIN_CLICKS_FOR_OPPORTUNITY=1`), não como campo de `OpportunityConfig`, evita tocar 4 superfícies (`OpportunityConfig` type, `opportunity_configs` migration, rota `/api/campaigns/[id]/opportunity-config`, input do `ThresholdConfig`). Menos escopo, menos risco. Se o cliente pedir clique configurável depois, é story avulsa.

### Reuso obrigatório (não reinventar)

- `evaluateOpportunityWindow`/`getDefaultConfig` — **estender**, não duplicar (AC3). [Source: `src/lib/services/opportunity-engine.ts`]
- `TrackingService.getLeadTracking` — a fonte de opens/clicks. [Source: `src/lib/services/tracking.ts:284-324`]
- `getApiKey(supabase, tenantId, "instantly")` — decripta a chave. [Source: `src/lib/utils/monitoring-processor.ts:136-155`]
- `matchLeadId` (+ `escapeLikePattern`/`normalizeEmail`) — **extrair p/ compartilhado** ou re-exportar de `reply-processor.ts`; NÃO recolar. [Source: `src/lib/utils/reply-processor.ts:100-141`]
- Padrão de módulo processador: `Promise.allSettled` per-tenant + fail-open + cliente parametrizado. [Source: `src/lib/utils/reply-sweep.ts:220-321`]
- Enumeração de campanhas: idioma `.not("external_campaign_id","is",null)` (já usado em `reply-processor.ts:253-254` p/ outra coluna). Índice `idx_campaigns_external_campaign_id` existe. [Source: `00037_add_campaign_export_tracking.sql:39-41`]
- Dedupe `.insert()` + `23505` benigno (NUNCA `.upsert` com merge). [Source: `reply-processor.ts:191-198`; `reply-sweep.ts:206-217`]
- `SUPABASE_SERVICE_ROLE_KEY` com **leitura guardada** (eslint `no-non-null-assertion` linta o arquivo inteiro no pre-commit). [Source: memória "Pre-commit eslint"; `process-batch/route.ts:29-33`]
- Tailwind v4: `flex flex-col gap-*`, **não** `space-y-*`, em wrappers label+input (se tocar UI). [Source: memória do projeto]

### `campaigns` — schema (fonte da enumeração)

[Source: `00016_create_campaigns.sql`, `00037_add_campaign_export_tracking.sql`] Colunas relevantes: `id` (UUID), `tenant_id` (FK), `external_campaign_id` (**TEXT nullable** — NULL = não exportada), `export_platform` (`instantly`/`snovio`, nullable), `export_status`, `status` (enum `campaign_status`). Índice parcial `idx_campaigns_external_campaign_id ... WHERE external_campaign_id IS NOT NULL` (00037:39-41) — use-o. Tipos: `src/types/campaign.ts:78-115`.

### `opportunities` — schema atual + o que a 00057 adiciona

[Source: `00055_create_opportunities_schema.sql:25-48`] Já existe: `source` CHECK `('reply','engagement')`, `reply_event_id` FK nullable + `uq_opportunities_reply_event_id UNIQUE`, `lead_id` nullable SET NULL, `campaign_id` NOT NULL sem FK, `status` default `'new'`. **Falta p/ engajamento** (Task 3): `open_count`, `click_count`, `last_engagement_at` + `uq_opportunities_engagement` parcial. Para o INSERT, monte o objeto snake_case parcial (não um `Opportunity` inteiro) e deixe o DB preencher `id`/`status`/`created_at`/`updated_at` — igual ao reply-processor.

### Anti-Patterns a evitar

1. **NÃO** manter o early-return `if (!lead.lastOpenAt) return false` no ramo de clique (Trap #1) — mata leads só-clique.
2. **NÃO** duplicar o `opportunity-engine` — estenda a função existente (AC3; a UI do analytics e a persistência compartilham a MESMA fonte).
3. **NÃO** criar `campaign_events` para engajamento — engajamento não é evento de polling; lê `getLeadTracking` ao vivo e persiste `opportunities` direto.
4. **NÃO** criar cron/edge-function/secret novos — reusar `/api/replies/process-batch` (Task 6).
5. **NÃO** usar `LeadTracking.leadId` como `opportunities.lead_id` — é o id do lead no Instantly, não o local (`tracking.ts:156`); casar por e-mail (`matchLeadId`).
6. **NÃO** criar engajamento sem lead local (dedup depende de `lead_id`; sem contexto de card) — pular + log.
7. **NÃO** usar `.upsert` com merge — `.insert()` + `23505` benigno.
8. **NÃO** quebrar o caminho "reply sem engajamento prévio" do `reply-processor.ts` (regressão 21.2) — o upgrade é ramo aditivo.
9. **NÃO** tornar o threshold de clique configurável (mantém 4 superfícies intactas) — constante `MIN_CLICKS_FOR_OPPORTUNITY=1`.
10. **NÃO** adicionar valor ao enum PG `interaction_type` (exigiria `ALTER TYPE`) — engajamento não gera `lead_interaction` nesta story.
11. **NÃO** usar `process.env.X!` (eslint pre-commit) — leitura guardada.
12. **NÃO** `space-y-*` em wrappers de form (Tailwind v4) — `flex flex-col gap-*`.

### Previous Story Intelligence (21.1 + 21.2)

- **21.2 (imediata anterior, DONE):** entregou o pipeline de reply e é o **template estrutural** direto (sweep/processor/cron/backfill). O `reply-processor.ts` e `reply-sweep.ts` são os arquivos a espelhar. `matchLeadId`/`escapeLikePattern` já corrigidos na review 21.2 (escape de `%`/`_`/`\`) — reusar, não reescrever. O cron (`/api/replies/process-batch` + edge fn `reply-sweep` + `00056` + `REPLIES_CRON_SECRET`) **já está deployado e validado** localmente contra Instantly/banco reais.
- **Achado real da 21.2 relevante:** `i_status`/`email_type` voltam `undefined` nos dados reais do cliente. Para engajamento isso não afeta (usamos `email_open_count`/`email_click_count` de `getLeadTracking`, não `i_status`). Mas `lt_interest_status` (string, `tracking.ts:170`) também pode vir vazio — grave só se `int`, senão null (normalização é 21.3).
- **21.1 (fundação, DONE):** schema `opportunities` + tipos. `source='engagement'` já aceito no CHECK; a coluna de dedup de engagement foi **deferida para cá** (deferred-work.md). Migration é aplicada **à mão** no banco do cliente (idempotente) — a 00057 idem (nota operacional p/ Fabossi).
- **Banco gerido à mão, sem migration tracking** [memória do projeto] → 00057 tem que reaplicar sem erro (`ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`).

### Git Intelligence (commits recentes)

- `c7940c4` feat(story-21.2) — sweep + processor + backfill + cron (a base a espelhar/estender). Working tree do baseline.
- `ed135f3` feat(story-21.1) — schema `opportunities` + tipos.
- `dd93449` docs(epic-21) — checklist pós-deploy (fragilidade do secret do cron — motiva o piggyback).
- Branch: `epic/21-loop-de-resposta` (não abrir feature branch — padrão do épico é commitar na branch do épico).

### Project Structure Notes

**Novos:**
- `src/lib/utils/engagement-processor.ts`
- `supabase/migrations/00057_add_engagement_to_opportunities.sql`
- `__tests__/unit/lib/utils/engagement-processor.test.ts`

**Modificados:**
- `src/lib/services/opportunity-engine.ts` (+ramo de clique, `MIN_CLICKS_FOR_OPPORTUNITY`, `qualifiedBy`)
- `__tests__/unit/lib/services/opportunity-engine.test.ts` (JÁ EXISTE — estender com regressão opens-only + qualificação por clique)
- `src/types/tracking.ts` (+`lastClickAt` em `LeadTracking`; +`qualifiedBy` em `OpportunityLead`)
- `src/lib/services/tracking.ts` (`mapToLeadTracking` +`lastClickAt`)
- `src/types/opportunity.ts` (+`open_count`/`click_count`/`last_engagement_at` em Row/TS/transforms)
- `src/lib/utils/reply-processor.ts` (+upgrade engagement→reply; extrair/compartilhar `matchLeadId`)
- `src/app/api/replies/process-batch/route.ts` (+`processEngagement`)
- `src/app/api/replies/backfill/route.ts` (+`processEngagement`)
- `src/components/tracking/OpportunityPanel.tsx` (+exibir `clickCount`)
- Testes: `opportunity.test.ts`, `reply-processor.test.ts`, `process-batch/route.test.ts`, `backfill/route.test.ts`, `use-opportunity-window.test.ts`/`ThresholdConfig.test.ts` (se o `qualifiedBy`/clique afetar asserts)

**Intocados (garantir):** `supabase/functions/instantly-webhook/index.ts`, `src/lib/webhook/instantly-webhook-utils.ts`, `supabase/functions/reply-sweep/index.ts` (a edge fn é thin — nenhuma lógica nova nela), `00056_schedule_reply_sweep_cron.sql`.

### References

- [Source: `_bmad-output/planning-artifacts/epic-21-loop-de-resposta.md#Story 21.6`] — ACs, FR12, sequência revisada
- [Source: `_bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md:99-105`] — engajamento como gatilho dominante; opens/clicks via polling existente
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md`] — "Engajamentos sem chave de dedup" (dono: 21.6)
- [Source: `src/lib/services/opportunity-engine.ts:23-44`] — engine a estender; trap do `lastOpenAt` (linha 35)
- [Source: `src/hooks/use-opportunity-window.ts:85-93`] + [`src/components/tracking/ThresholdConfig.tsx:54-61`] — os 2 call-sites do engine (regressão)
- [Source: `src/components/tracking/OpportunityPanel.tsx:335-459`] — painel atual (exibe openCount/lastOpenAt, NÃO clickCount)
- [Source: `src/components/tracking/LeadTrackingTable.tsx:333-334,380`] — convenção "Aberturas"/"Cliques" já existente
- [Source: `src/lib/services/tracking.ts:141-172,284-324`] — `mapToLeadTracking` (add `lastClickAt`), `getLeadTracking`
- [Source: `src/types/tracking.ts:144-185,291`] — `LeadTracking`/`OpportunityLead`; `timestamp_last_click` disponível
- [Source: `src/lib/utils/reply-processor.ts:100-141,147-321`] — `matchLeadId` (reuso), padrão de INSERT + 23505, ponto do upgrade (linha 175)
- [Source: `src/lib/utils/reply-sweep.ts:76-321`] — template do processador per-tenant (fail-open, allSettled, lookup de campanha)
- [Source: `src/app/api/replies/process-batch/route.ts:18-55`] + [`backfill/route.ts`] — rotas a estender
- [Source: `supabase/migrations/00055_create_opportunities_schema.sql:25-48`] — schema `opportunities` (o que a 00057 estende)
- [Source: `supabase/migrations/00037_add_campaign_export_tracking.sql:9-41`] — `external_campaign_id` + índice parcial
- [Source: `supabase/migrations/00016_create_campaigns.sql`] — `campaigns` base
- [Source: `supabase/migrations/00013_create_lead_interactions.sql:7`] — enum PG `interaction_type` (sem valor de engajamento)
- [Source: `src/lib/utils/monitoring-processor.ts:136-155`] — `getApiKey`
- [Source: `_bmad-output/implementation-artifacts/epic-21-post-deploy-checklist.md`] — fragilidade do secret do cron (motiva piggyback)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit`: 0 erros em `src/`; 0 erros nos arquivos tocados (baseline pré-existente de 175 erros só em test files não relacionados, inalterado).
- `npx vitest run`: 372 files / 6314 pass / 2 skip / 0 fail.
- `npx eslint --max-warnings=0` nos 9 arquivos `src/` novos/modificados: limpo (exit 0). Removido non-null assertion pré-existente em `OpportunityPanel.tsx:240` (fallback `|| ""` inalcançável) para desbloquear o lint-staged `src/**`.
- `npm run build`: verde (rotas `/api/replies/*` registradas).

### Completion Notes List

- **Task 1 (engine estendido):** `evaluateOpportunityWindow` reescrito como `qualificaPorOpens || qualificaPorClicks`. Ramo de clique INDEPENDENTE de `lastOpenAt` — Trap #1 corrigido (lead só-clique `openCount=0/lastOpenAt=null` agora qualifica; provado por teste dedicado). `MIN_CLICKS_FOR_OPPORTUNITY=1` constante fixa (não configurável). Comportamento opens-only preservado byte-a-byte quando `clickCount=0`. `qualifiedBy` (opens|clicks|both) + `lastEngagementAt`=max(lastOpenAt,lastClickAt) derivados no `.map()`.
- **Task 2 (lastClickAt):** `LeadTracking.lastClickAt` (`string|null`, requerido — simétrico a `lastOpenAt`) + `OpportunityLead.qualifiedBy`/`lastEngagementAt`; `mapToLeadTracking` mapeia `timestamp_last_click` (campo já existente, nunca mapeado). Literais crus de `LeadTracking`/`OpportunityLead` em `tracking.test.ts`/`leads-tracking.test.ts` atualizados (tsc type-checka `__tests__/`).
- **Task 3 (migration 00057 + tipos):** `open_count`/`click_count`/`last_engagement_at` (nullable) + índice parcial UNIQUE `uq_opportunities_engagement` (fecha o dedup de engagement deferido da review 21.1). Idempotente (`ADD COLUMN IF NOT EXISTS`/`CREATE UNIQUE INDEX IF NOT EXISTS`). Tipos `OpportunityRow`/`Opportunity` + transforms + round-trip tests estendidos.
- **Task 4 (engagement-processor):** novo `processEngagement` espelhando `reply-sweep.ts` (allSettled per-tenant + fail-open + cliente parametrizado). Por campanha exportada: `getLeadTracking` → engine → dedup em 2 camadas (match de lead local obrigatório + oportunidade ativa do lead → pula) → INSERT `source='engagement'` com métricas; `23505` (índice parcial) benigno. Cap de 15 campanhas/ciclo (NFR5). NÃO cria `lead_interaction`.
- **Task 5 (upgrade engagement→reply):** `reply-processor.ts` (arquivo DONE 21.2) recebe ramo aditivo: se há engajamento ATIVO do lead → UPDATE in-place para `source='reply'` (preserva open/click/created_at) em vez de INSERT. Caminho "reply sem engajamento prévio" intocado (byte-a-byte). `matchLeadId`/`normalizeEmail` exportados p/ reuso (só `export` adicionado). Interação `campaign_reply` extraída p/ helper compartilhado.
- **Task 6/7 (piggyback):** `processEngagement` acoplado às rotas `process-batch` (cron) e `backfill` (admin) da 21.2 — sem cron/edge-fn/secret novos. Contadores `engagementCreated`/`engagementSkipped` + erros `scope:"engagement"` no resumo.
- **Task 8 (OpportunityPanel):** exibe `clickCount` em span separado (só quando >0) — preserva o assert `"5 aberturas"` existente.
- **Task 9 (testes):** engine (regressão opens-only com `clickCount=0` + qualificação por clique/janela/`qualifiedBy`/`lastEngagementAt`); engagement-processor (novo, 8 testes: métricas/dedup/23505/sem-lead/fail-open/isolamento); reply-processor (mock aprimorado distingue pré-check de engajamento do INSERT — 21.2 100% verde sem alterar asserts + 4 testes de upgrade); round-trip dos 3 campos; contadores de engajamento nas 2 rotas; painel.
- **Fronteira de escopo respeitada:** entregue só o MODELO DE DADOS (`source` + 3 métricas). Página `/opportunities` e card com badge "Alto engajamento" continuam sendo da 21.4.
- **OPERACIONAL (Fabossi):** aplicar `00057` no banco do cliente (idempotente) antes/junto do deploy. Deploy Vercel segue adiado até a story visual (21.4) conforme decisão prévia — backend continua validável localmente; backfill de engajamento é idempotente.

### File List

**Novos:**
- `src/lib/utils/engagement-processor.ts`
- `supabase/migrations/00057_add_engagement_to_opportunities.sql`
- `__tests__/unit/lib/utils/engagement-processor.test.ts`

**Modificados (src):**
- `src/lib/services/opportunity-engine.ts`
- `src/types/tracking.ts`
- `src/lib/services/tracking.ts`
- `src/types/opportunity.ts`
- `src/lib/utils/reply-processor.ts`
- `src/app/api/replies/process-batch/route.ts`
- `src/app/api/replies/backfill/route.ts`
- `src/components/tracking/OpportunityPanel.tsx`

**Modificados (testes/helpers):**
- `__tests__/helpers/mock-data.ts`
- `__tests__/unit/lib/services/opportunity-engine.test.ts`
- `__tests__/unit/types/tracking.test.ts`
- `__tests__/unit/types/opportunity.test.ts`
- `__tests__/unit/hooks/use-opportunity-window.test.ts`
- `__tests__/unit/lib/utils/reply-processor.test.ts`
- `__tests__/unit/app/api/replies/process-batch/route.test.ts`
- `__tests__/unit/app/api/replies/backfill/route.test.ts`
- `__tests__/unit/app/api/campaigns/leads-tracking.test.ts`
- `__tests__/unit/components/tracking/OpportunityPanel.test.tsx`

## Change Log

- 2026-07-13: Story 21.6 criada (create-story) — Janela de Oportunidade Cross-Campanha. Engine `evaluateOpportunityWindow` **estendido** (opens OU ≥1 clique; trap do guard `lastOpenAt` documentado) + novo `engagement-processor.ts` cross-campanha (`getLeadTracking` por campanha exportada, service-role) → `opportunities` `source='engagement'`; migration `00057` (`open_count`/`click_count`/`last_engagement_at` + índice parcial `uq_opportunities_engagement` — fecha o dedup de engagement deferido da review 21.1); upgrade engagement→reply **in-place** no `reply-processor.ts` (modifica arquivo DONE da 21.2, regressão-crítico); **piggyback** no cron `/api/replies/process-batch` da 21.2 (sem cron/edge-fn/secret novos). Roda ANTES da Central (21.4): entrega o modelo de dados; superfície visual hoje só o `OpportunityPanel` do analytics (+`clickCount`). Status: ready-for-dev.
- 2026-07-13: **3 Open Questions RESOLVIDAS (Fabossi)** — todas confirmam os defaults da story: (1) manter sequência 21.6 → 21.4 (21.6 = só modelo de dados; Central é da 21.4); (2) "o mais seguro" = pular engajamento sem lead local (evita card duplicado sem chave de dedup); (3) "melhor e mais simples" = piggyback na rota da 21.2 (sem cron/secret novos). Nenhuma mudança de escopo — decisões travadas inline nas Dev Notes.
- 2026-07-13: **Implementação (dev-story) — Status: review.** 10 tasks concluídas. Engine estendido (opens OU ≥1 clique; Trap #1 corrigido: lead só-clique qualifica; `qualifiedBy`/`lastEngagementAt` derivados). `lastClickAt` mapeado no `mapToLeadTracking`. Migration `00057` (3 métricas + `uq_opportunities_engagement`) + tipos `opportunity.ts`. Novo `engagement-processor.ts` (cross-campanha, allSettled/fail-open, dedup app-level + 23505 benigno, match de lead local obrigatório, cap 15 campanhas/ciclo). Upgrade engagement→reply in-place no `reply-processor.ts` (ramo aditivo; caminho 21.2 intocado; `matchLeadId`/`normalizeEmail` re-exportados). Piggyback nas rotas `process-batch`+`backfill` (contadores `engagement*` + `scope:"engagement"`). `OpportunityPanel` exibe cliques (span próprio, >0). Testes: +8 engagement-processor, +7 engine (regressão opens-only c/ `clickCount=0` + qualificação por clique), +4 upgrade reply-processor (mock aprimorado distingue pré-check do INSERT → 21.2 100% verde), +round-trip/contadores/painel. Validações: tsc 0 erros `src/`; vitest 372 files/6314 pass/2 skip/0 fail; eslint `--max-warnings=0` limpo nos arquivos `src/` (removido non-null assertion pré-existente em `OpportunityPanel.tsx:240`); build verde. OPERACIONAL Fabossi: aplicar `00057` no banco (idempotente); deploy Vercel segue adiado até 21.4 (decisão prévia).

## Review Findings (bmad-code-review — 2026-07-13)

> Revisão adversarial de 3 camadas (Blind Hunter, Edge Case Hunter, Acceptance Auditor) sobre o working tree vs baseline `dd934493`. **Veredicto: ACs 1–5 e os 12 anti-patterns satisfeitos** — Trap #1 corrigido e provado por teste; two-layer dedup, match-lead-local, upgrade in-place e piggyback confirmados no código. Triagem inicial: 2 decision-needed, 3 patch, 4 defer, 10 dismiss (ruído). Após resolução das 2 decisões (Fabossi 2026-07-13): **4 patch, 5 defer, 10 dismiss, 0 decisão pendente**.

### Decision Needed — RESOLVIDAS (Fabossi 2026-07-13)
- [x] [Review][Decision→Patch] Dedup/upgrade ignoram `meeting_booked`/`discarded` → **DECISÃO: incluir só `meeting_booked`** no conjunto que suprime card novo (não re-abordar lead com reunião marcada). `discarded` fica DE FORA de propósito — um lead descartado que volta a engajar é sinal novo que pode ressurgir. Vira patch P4 (2 locais).
- [x] [Review][Decision→Defer] Métricas de engajamento write-once → **DECISÃO: aceitar o snapshot da criação**; o refresh do card ativo é decidido/implementado na 21.4 (quando o card é renderizado). Movido para Deferred abaixo.

### Patch
- [x] [Review][Patch] Upgrade engagement→reply não atualiza `campaign_id` [src/lib/utils/reply-processor.ts:224-234] — o UPDATE preserva o `campaign_id` da campanha de engajamento (A) enquanto seta `reply_event_id` de um evento de OUTRA campanha (B); o INSERT de reply (linha 259) usa `event.campaign_id`. Fix: adicionar `campaign_id: event.campaign_id` ao UPDATE (alinha com a convenção do INSERT).
- [x] [Review][Patch] Pré-check de upgrade engole erro do SELECT [src/lib/utils/reply-processor.ts:212-220] — só desestrutura `data`; num erro transitório do SELECT `engagement=null` → cai no INSERT (linha 255) e cria um 2º card (reply) além do engagement ativo (viola AC4). Fix: capturar `error` e, em erro, retornar `{success:false}` (retry no próximo ciclo) — espelhar o `activeError` do `engagement-processor.ts:178`.
- [x] [Review][Patch] loadCampaignConfig engole erro do SELECT [src/lib/utils/engagement-processor.ts:134-145] — só desestrutura `data`; num erro transitório aplica silenciosamente `getDefaultConfig` (minOpens=3/period=7) no lugar do threshold do tenant → cards espúrios. Fix: capturar `error` e pular a campanha no ciclo (fail-open observável, como no erro de `getLeadTracking`).
- [x] [Review][Patch] Incluir `meeting_booked` no dedup de "ativo" [src/lib/utils/engagement-processor.ts:43] e no pré-check do upgrade [src/lib/utils/reply-processor.ts:218] — resolvido de D1: adicionar `"meeting_booked"` a `ACTIVE_OPPORTUNITY_STATUSES` e ao `.in("status", [...])` do upgrade, para não gerar card novo (nem re-carding) de lead com reunião já marcada. `discarded` permanece fora (decisão Fabossi).

### Deferred
- [x] [Review][Defer] Métricas de engajamento são write-once (open/click/last_engagement congelam na criação) [src/lib/utils/engagement-processor.ts:167-184] — deferred (decisão Fabossi 2026-07-13): aceitar o snapshot da criação; o refresh do card ativo é decidido/implementado na 21.4, quando o card de engajamento é de fato renderizado.
- [x] [Review][Defer] TOCTOU cron+backfill concorrentes → card duplicado cross-campanha [src/lib/utils/engagement-processor.ts:169-200] — deferred: dedup app-level é check-then-act não-atômico; janela estreita (backfill admin sobreposto ao cron ≤5min p/ o MESMO lead em 2 campanhas). Índice parcial é (tenant,campaign,lead) → não cobre cross-campanha.
- [x] [Review][Defer] Upgrade não reseta `status` para `new` [src/lib/utils/reply-processor.ts:224-234] — deferred: um card já `viewed`/`contacted` que recebe reply (sinal mais forte) permanece no mesmo status; a 21.7 (notificações) pode não re-notificar. Revisitar quando a 21.7 definir o gatilho de notificação.
- [x] [Review][Defer] `lt_interest_status` sempre null para engagement [src/lib/utils/engagement-processor.ts:186-188] — deferred: `LeadTracking.ltInterestStatus` é `string`, então `typeof rawStatus === "number"` nunca casa e o ramo grava sempre null (por spec — normalização é 21.3). Carregar p/ 21.3/21.4 não assumirem a coluna preenchida.
- [x] [Review][Defer] processEngagement re-varre todas as campanhas + re-consulta cada lead qualificado a cada ciclo, inclusive já-carded [src/lib/utils/engagement-processor.ts:247-295] — deferred: custo (getLeadTracking paginado + matchLeadId + dedup SELECT por lead) cresce com o volume acumulado, não com o novo; fail-open + idempotente cobrem 429/duração na escala atual (~7 campanhas). Otimizar (pré-fetch em lote de já-carded / marcar processados) se o volume crescer.
