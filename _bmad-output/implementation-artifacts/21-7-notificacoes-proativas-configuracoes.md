---
baseline_commit: a63a9c9
---
# Story 21.7: Notificações Proativas + Configurações

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **ÚLTIMA STORY DO EPIC 21** (sequência: 21.1 → 21.2 → 21.6 → 21.3 → 21.4 → 21.5 → **21.7**). Cobre FR13/FR14/FR15. Fecha o loop: a oportunidade já é detectada (21.2/21.6), classificada (21.3) e exibida na Central com ações (21.4/21.5) — falta o **"pop-up do lead" chegar até o vendedor** por WhatsApp e in-app, mesmo fora da plataforma, e o admin poder **configurar** os canais. Pós-esta story, rodar `epic-21-post-deploy-checklist.md` + a retrospectiva do épico.

## Story

As a usuário,
I want ser avisado no WhatsApp e no app quando surgir um lead quente,
so that o "pop-up do lead" chegue até mim mesmo quando não estou na plataforma.

## Acceptance Criteria

1. **Given** uma oportunidade `source='reply'` com intent `interessado` ou `pediu_info` é criada/classificada **When** as notificações do tenant estão habilitadas (canal WhatsApp on + ao menos 1 número configurado) **Then** mensagem WhatsApp é enviada via `ZApiService` para os números configurados: `🔥 Lead quente: {nome} ({empresa}) respondeu {intent} na campanha {campanha}` + link direto para a Central **And** o disparo ocorre no ciclo do cron ≤5 min após o evento (NFR3) (FR13)
2. **Given** qualquer oportunidade nova (reply OU engagement) **Then** um registro é criado em `app_notifications` (histórico/central de notificações; `read_at` controla leitura) **And** o badge da sidebar mantém **fonte única**: contagem de `opportunities.status='new'` (definida em 21.4, via `/api/opportunities/new-count`), NÃO alimentada por `app_notifications` — o sino de notificações tem contador PRÓPRIO (não-lidas) separado do badge de oportunidades (FR14)
3. **Given** `/settings/notifications` (nova aba em Configurações, admin-only) **Then** o admin configura: números WhatsApp destino (múltiplos, formato E.164), canais on/off (WhatsApp, in-app), quais intents disparam WhatsApp (default `interessado`+`pediu_info`), e opt-in de WhatsApp para engajamento (default OFF) (FR15)
4. **Given** o envio WhatsApp falha (Z-API fora, sem número, sem chave) **Then** a notificação in-app é criada mesmo assim **And** o erro é logado estruturado sem quebrar o cron (fail-open — NFR1)
5. **Given** oportunidades de engajamento (`source='engagement'`) **Then** notificam apenas in-app por padrão; WhatsApp é opt-in explícito na config (`channels.whatsapp_engagement`) — evita ruído (poucas respostas, muitos engajamentos)
6. **Given** múltiplas oportunidades WhatsApp-elegíveis no mesmo ciclo do cron (janela ≈5 min) **Then** se > `NOTIFY_GROUP_THRESHOLD` (3), o WhatsApp é agrupado em UMA mensagem por número (`🔥 {N} novos leads quentes — abrir Central: {link}`) em vez de N mensagens; ≤3 → mensagens individuais (as in-app continuam 1 por oportunidade)
7. Testes unitários para: gatilho por intent, gate de canal/número, agrupamento (>3 vs ≤3), fail-open (in-app criada apesar do WhatsApp falhar), supressão no backfill, re-notificação no upgrade engagement→reply, writer de settings (validação), read/mark-read de `app_notifications`.

## Tasks / Subtasks

> **Ordem sugerida de implementação:** backend do gatilho (Tasks 1–6) primeiro — é o coração do valor e o mais arriscado; depois o writer de settings (Task 7–8) e a central in-app (Tasks 9–10). Testes (11) e validação (12) por último. **Reuso é regra, não sugestão** — ver "Reuso obrigatório".

- [x] **Task 1: Migration `00060` — marcador de idempotência + imutabilidade de `app_notifications` (AC: #1, #2, #4)**
  - [x] 1.1 `supabase/migrations/00060_add_notifications_hardening.sql` — **idempotente/defensiva** (banco gerido à mão, ver 00053/00055/00057). `ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;` (nullable; NULL = ainda não notificada — espelha o gate `intent IS NULL` da 21.3). `COMMENT ON COLUMN` explicando: marca a oportunidade como já notificada (WhatsApp/in-app avaliados 1×); reset para NULL no upgrade engagement→reply (Task 6).
  - [x] 1.2 Índice parcial para o passe: `CREATE INDEX IF NOT EXISTS idx_opportunities_pending_notification ON public.opportunities(tenant_id, created_at) WHERE notified_at IS NULL;` (espelha `idx_app_notifications_tenant_unread` da 00055).
  - [x] 1.3 **Fecha deferred-work "app_notifications imutável exceto read_at não enforçado" (dono: 21.7)** [deferred-work.md#L19]: trigger `BEFORE UPDATE` que rejeita alteração de qualquer coluna exceto `read_at` (`tenant_id`/`type`/`payload`/`created_at`/`id` imutáveis). `CREATE OR REPLACE FUNCTION public.enforce_app_notifications_immutable()` + `DROP TRIGGER IF EXISTS ... ; CREATE TRIGGER`. Sem isso, a policy de UPDATE (00055:178-182) só valida `tenant_id` — um usuário do tenant poderia reescrever `type`/`payload` das próprias notificações (LOW, sem brecha cross-tenant, mas o comentário do schema promete imutabilidade).
  - [x] 1.4 **NÃO** cria tabela nova: `notification_settings` e `app_notifications` já existem (00055). **NÃO** redefinir `update_updated_at_column()`/`get_current_tenant_id()`.
  - [x] 1.5 **OPERACIONAL (Fabossi):** aplicar 00060 no banco do cliente (idempotente) antes/junto do deploy — igual às 00055/00057/00058/00059.

- [x] **Task 2: Tipos — `notified_at`, opt-in de engajamento e defesa de JSONB (AC: #2, #3, #5)**
  - [x] 2.1 Em `src/types/opportunity.ts`: adicionar `notified_at: string | null` a `OpportunityRow` e `notifiedAt: string | null` a `Opportunity`; mapear em `toOpportunity`/`toOpportunityRow`. Estender o round-trip test (`__tests__/unit/types/opportunity.test.ts`) com o campo (preenchido e null).
  - [x] 2.2 Estender `NotificationChannels`/`NotificationChannelsRow` com o opt-in de engajamento (AC5): `NotificationChannelsRow` += `whatsapp_engagement?: boolean`; `NotificationChannels` += `whatsappEngagement: boolean`. **Zero migration** — vive no JSONB `channels` já existente (00055:103). Default OFF.
  - [x] 2.3 **Fecha deferred-work "`toNotificationSettings` não defende `channels` parcial/malformado" + "conteúdo de JSONB sem validação" (dono: 21.7)** [deferred-work.md#L17-L18]: endurecer `toNotificationSettings` — `channels` pode vir parcial/null/não-objeto do banco. Usar leitura defensiva: `whatsapp: channels?.whatsapp ?? true`, `inApp: channels?.in_app ?? true`, `whatsappEngagement: channels?.whatsapp_engagement ?? false`; `whatsappNumbers: Array.isArray(row.whatsapp_numbers) ? row.whatsapp_numbers.filter(n => typeof n === "string") : []`; `notifyIntents: Array.isArray(row.notify_intents) ? row.notify_intents.filter(isValidOpportunityIntent) : DEFAULT`. Idem `toAppNotification.payload`: `payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}`. Estender os testes de transform com entradas malformadas.
  - [x] 2.4 Constante compartilhada de defaults de settings (fonte única p/ o writer e o passe quando não há linha configurada): `export const DEFAULT_NOTIFICATION_SETTINGS` com `whatsappNumbers: []`, `channels: { whatsapp: true, inApp: true, whatsappEngagement: false }`, `notifyIntents: ["interessado", "pediu_info"]` — igual aos defaults do schema (00055:102-104).

- [x] **Task 3: `src/lib/utils/notification-processor.ts` — o passe (AC: #1, #2, #4, #5)**
  - [x] 3.1 `export async function notifyNewOpportunities(supabase, params: { tenantId?; suppressOnly?: boolean }): Promise<NotifyResult>`. **Espelha estruturalmente `reply-classifier.ts`** (`classifyPendingReplies`): seleciona pendentes, agrupa por tenant, carrega config 1×/tenant, `Promise.allSettled` por-item em lotes, fail-open. Cliente parametrizado (service-role no cron).
  - [x] 3.2 Query de pendentes: `opportunities` com `notified_at IS NULL`, com embed do lead (`leads` FK existe): `.select("id, tenant_id, lead_id, campaign_id, source, intent, created_at, leads(first_name, last_name, company_name)").is("notified_at", null).order("created_at", { ascending: true }).limit(MAX_NOTIFY_PER_RUN)`. Filtrar por `tenantId` se informado. **`campaign_id` NÃO tem FK** (00055:29) → nome da campanha via lookup em lote (Map, padrão 21.4), NÃO embed.
  - [x] 3.3 `suppressOnly` (chamado pelo backfill — Task 5): NÃO envia nada; apenas `UPDATE opportunities SET notified_at = now() WHERE tenant_id = X AND notified_at IS NULL`. **Trap crítico** — sem isso, o backfill de meses de histórico (21.2 AC6) criaria centenas de oportunidades `notified_at NULL` e o **próximo ciclo do cron dispararia WhatsApp para todas** (spam do vendedor). Ver Dev Notes "Backfill nunca notifica".
  - [x] 3.4 Por tenant (modo normal): carregar `notification_settings` (via SELECT; sem linha → `DEFAULT_NOTIFICATION_SETTINGS` da Task 2.4 — **service-role bypassa RLS**, então filtrar `.eq("tenant_id", t)` explicitamente). Se `!channels.whatsapp && !channels.inApp` → marca `notified_at` e pula envios (nada habilitado).
  - [x] 3.5 Por oportunidade pendente, decidir canais:
    - **In-app (AC2):** se `channels.inApp` → INSERT em `app_notifications` (`type: "nova_oportunidade"`, `payload: { opportunityId, source, intent, leadName, company, campaignName }`). Sempre 1 por oportunidade.
    - **WhatsApp-elegível (AC1/AC5):** `channels.whatsapp && whatsappNumbers.length > 0` **E** ((`source==='reply'` e `intent ∈ notifyIntents`) **OU** (`source==='engagement'` e `channels.whatsappEngagement === true`)) **E** freshness-guard (Task 4.4). Elegíveis são COLETADOS (não enviados aqui) para o agrupamento da Task 4.
  - [x] 3.6 Marcar `notified_at = now()` na oportunidade **após** decidir/enfileirar os canais (mesmo que só in-app, mesmo que WhatsApp vá falhar — AC4: in-app criada + `notified_at` setado; não re-tentar WhatsApp infinitamente). O UPDATE usa `.is("notified_at", null)` (compare-and-swap, evita double-notify em cron×backfill concorrentes — espelha o `.is("intent", null)` da 21.3, review P1).
  - [x] 3.7 Contadores no resultado: `inAppCreated`, `whatsappSent`, `whatsappGrouped`, `skipped`, `errors[]` (com `scope`). Fail-open: erro por-item nunca quebra o passe; erro por-tenant isolado com `allSettled`.
  - [x] 3.8 Constantes: `MAX_NOTIFY_PER_RUN = 200` (cap de custo/latência), `NOTIFY_CONCURRENCY = 10` (in-app inserts), `NOTIFY_GROUP_THRESHOLD = 3`, `MAX_WHATSAPP_NOTIFY_AGE_MS` (freshness — Task 4.4).

- [x] **Task 4: Composição da mensagem WhatsApp + agrupamento + envio (AC: #1, #4, #6)**
  - [x] 4.1 Helper puro `buildHotLeadMessage({ leadName, company, intentLabel, campaignName, link })` → string do AC1. `intentLabel` vem de `OPPORTUNITY_INTENT_CONFIG[intent].label` (fonte única, `opportunity.ts:74`); `campaignName` do Map (fallback `"campanha desconhecida"` quando `campaign_id` dangling — mesmo idioma da 21.4/21.5). Nome: `first_name + last_name` (trim); empresa: `company_name ?? "empresa não informada"`.
  - [x] 4.2 Helper puro `buildGroupedMessage(count, link)` → `🔥 {count} novos leads quentes — abrir Central: {link}` (AC6).
  - [x] 4.3 Link direto: `${appBaseUrl}/opportunities` onde `appBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || ""` (**leitura guardada** — eslint no-non-null-assertion). Se vazio, a mensagem vai **sem** link (nunca quebra). Não há rota de detalhe por oportunidade (a Central é a lista `/opportunities`, 21.4) — link aponta para a Central. **PÓS-DEPLOY:** confirmar `NEXT_PUBLIC_SITE_URL` setado na Vercel (adicionar ao `epic-21-post-deploy-checklist.md`).
  - [x] 4.4 **Freshness-guard (belt-and-suspenders do backfill):** só envia WhatsApp se `now - created_at <= MAX_WHATSAPP_NOTIFY_AGE_MS` (ex.: 60 min). Protege contra qualquer backlog residual mesmo se a supressão da Task 3.3 falhar. Oportunidade fora da janela: in-app ainda é criada, WhatsApp pulado, `notified_at` setado. Log estruturado.
  - [x] 4.5 Envio: por tenant, coletados os WhatsApp-elegíveis do ciclo → se `count > NOTIFY_GROUP_THRESHOLD` envia UMA `buildGroupedMessage` para cada número; senão envia `buildHotLeadMessage` individual (uma por oportunidade × cada número). Chave Z-API: `getApiKey(supabase, tenantId, "zapi")` (decripta; null → só in-app, log). Enviar via `new ZApiService().sendText(zapiKey, phone, message)` (Epic 11). **Sequencial** por número/mensagem (respeita Z-API; não paralelizar em rajada). Cada `sendText` em try/catch — falha isola e conta em `errors` (fail-open AC4), **não** desfaz a in-app nem o `notified_at`.
  - [x] 4.6 **NÃO** grava em `whatsapp_messages`: aquela tabela é para mensagens direcionadas ao LEAD (Epic 11/13.7/21.5, com `lead_id`/`campaign_id`). Notificação é alerta interno ao VENDEDOR (números do tenant) — só log estruturado. Documentar em comentário.

- [x] **Task 5: Acoplar ao cron + supressão no backfill (AC: #1, #4)**
  - [x] 5.1 **Reusar o cron da 21.2** — em `src/app/api/replies/process-batch/route.ts` (POST): chamar `notifyNewOpportunities(supabase)` **POR ÚLTIMO**, depois de `sweepReplies` → `processReplies` → `processEngagement` → `classifyPendingReplies`. Ordem é obrigatória: o WhatsApp por intent (AC1) depende da classificação (21.3) já ter setado `intent` no mesmo ciclo. Incluir contadores (`notified`, `whatsappSent`, `whatsappGrouped`) e `errors` com `scope: "notify"` no resumo. **NÃO** criar cron/edge-fn/secret novos (mesma justificativa da 21.6 — ver Dev Notes "piggyback").
  - [x] 5.2 Em `src/app/api/replies/backfill/route.ts` (admin session, 21.2): após as passagens de ingestão/classificação, chamar `notifyNewOpportunities(supabase, { tenantId: profile.tenant_id, suppressOnly: true })`. Isso marca todo o backlog histórico como `notified_at = now()` **SEM enviar** — o cron só notifica oportunidades genuinamente novas dali em diante. Incluir `suppressed` no resumo. **Este é o guard-rail central contra spam de backfill.**
  - [x] 5.3 Comentário no topo de ambas as rotas atualizando o pipeline documentado (agora inclui `notify`).

- [x] **Task 6: Re-notificar no upgrade engagement→reply (AC: #1)** — **fecha deferred-work "upgrade não reseta status/notificação" (dono: revisitar com 21.7)** [deferred-work.md#L86]
  - [x] 6.1 **Modificar** `src/lib/utils/reply-processor.ts` (arquivo DONE 21.2/21.6 — **regressão-crítico**, ver Dev Notes "Modificar reply-processor com segurança"): no ramo de upgrade engagement→reply (linhas 237-251, o `.update({...})`), adicionar `notified_at: null` ao objeto do UPDATE. Efeito: um card de engajamento já notificado (in-app) que vira reply com intent quente re-entra no passe de notificação e **dispara o WhatsApp** que o engagement (opt-in OFF por padrão) não disparou — o sinal mais forte do funil não pode passar silencioso. **DECISÃO PADRÃO (confirmar OQ1):** re-notificar no upgrade.
  - [x] 6.2 **Regressão:** o caminho "reply sem engajamento prévio" (INSERT, o único exercitado pelos testes da 21.2) NÃO muda — o INSERT já nasce com `notified_at` NULL (default da coluna) e é notificado normalmente. Só o ramo de UPDATE ganha `notified_at: null`. Rodar `reply-processor.test.ts` + rotas — verde antes de fechar a task. Adicionar teste: upgrade reseta `notified_at`.

- [x] **Task 7: Writer de `notification_settings` — API route admin-only (AC: #3)**
  - [x] 7.1 `src/app/api/settings/notifications/route.ts` — **clonar `src/app/api/settings/monitoring/route.ts`** (Route Handler, NÃO Server Action): `GET` (retorna a linha ou `DEFAULT_NOTIFICATION_SETTINGS` quando `PGRST116`) + `PUT`/`POST` upsert `onConflict: "tenant_id"`. Auth: `getCurrentUserProfile()` → 401; admin: `hasAdminAccess(profile.role)` → 403 [capabilities.ts:21]. `createClient` de `@/lib/supabase/server`.
  - [x] 7.2 **Validação Zod na escrita (fecha deferred #18):** `whatsapp_numbers` = array de strings E.164 (`/^\d{10,15}$/` após sanitizar — reusar o strip de `whatsapp.ts:98` `replace(/[^\d+]/g, "")`); `channels` = `{ whatsapp: boolean, in_app: boolean, whatsapp_engagement: boolean }`; `notify_intents` = array de `OpportunityIntent` válidos (`isValidOpportunityIntent`). Rejeitar payload inválido com 400 + mensagem pt-BR.
  - [x] 7.3 Persistir no shape do banco (snake_case): `channels.in_app`/`channels.whatsapp_engagement`. O middleware já admin-gate `/settings/*` [middleware.ts:59-61] — mesmo assim manter o check explícito na rota (defesa em profundidade, padrão do projeto).
  - [x] 7.4 Hook `src/hooks/use-notification-settings.ts` — **clonar `src/hooks/use-monitoring-config.ts`**: `useQuery(["notification-settings"], GET)` + `useMutation(PUT)` com `invalidateQueries(["notification-settings"])` + `toast.success/error`.

- [x] **Task 8: UI de Configurações — aba "Notificações" (AC: #3)**
  - [x] 8.1 Adicionar entrada `{ label: "Notificações", href: "/settings/notifications" }` em `src/components/settings/SettingsTabs.tsx:14`.
  - [x] 8.2 `src/app/(dashboard)/settings/notifications/page.tsx` — wrapper client trivial (espelha `settings/monitoring/page.tsx`) renderizando `<NotificationSettings />`. Já admin-gated pelo `layout.tsx` (`AdminGuard`) + middleware.
  - [x] 8.3 `src/components/settings/NotificationSettings.tsx` — RHF + Zod (**padrão de `IcebreakerExamplesForm.tsx`**). Campos:
    - Lista de números WhatsApp: **reusar `TagInputField`** (`src/components/settings/ICPDefinitionForm.tsx:69-139` — chips + Enter-to-add) com validação de telefone.
    - Toggles de canal (WhatsApp / in-app / WhatsApp p/ engajamento): **`Switch`** (`src/components/ui/switch.tsx`, uso em `LeadTable.tsx:1196`) via `Controller`.
    - Intents que notificam: grupo de checkboxes (**padrão `ICPDefinitionForm.tsx:261-285`**) sobre `OPPORTUNITY_INTENT_CONFIG` (labels prontos). Default `interessado`+`pediu_info`.
    - Save desabilitado até `isDirty` + `isPending` (padrão `MonitoringSettings.tsx:236-243`); loading = Skeleton.
  - [x] 8.4 **Tailwind v4:** wrappers label+input/switch usam `flex flex-col gap-*`, **nunca** `space-y-*` [memória do projeto].

- [x] **Task 9: Central de notificações in-app — read API + mark-read + contador (AC: #2)**
  - [x] 9.1 `src/app/api/notifications/route.ts` — `GET` lista `app_notifications` do tenant (recentes primeiro, cap ex.: 30), envelope `{ data, meta }` (**espelha `/api/opportunities`**). Auth `getCurrentUserProfile()` → 401; filtra `.eq("tenant_id", profile.tenant_id)` (via RLS + explícito).
  - [x] 9.2 `src/app/api/notifications/unread-count/route.ts` — **clonar quase literal `/api/opportunities/new-count/route.ts`** trocando a tabela: `count exact head` em `app_notifications` com `.is("read_at", null)`. Envelope `{ data: { count } }`. Este contador é do SINO, **distinto** do badge de oportunidades (AC2 — fonte única do badge permanece `new-count`, intocado).
  - [x] 9.3 `src/app/api/notifications/[notificationId]/route.ts` — `PATCH` marca `read_at = now()` (só read_at — o trigger da Task 1.3 recusa outras colunas). Tenant-scoped. Opcional: `PATCH /api/notifications/mark-all-read` (bulk).
  - [x] 9.4 Hook `src/hooks/use-notifications.ts` (**padrão `use-opportunities.ts`**): `useNotifications` (`["notifications"]`), `useUnreadNotificationsCount` (`["notifications-unread-count"]`, `refetchInterval: 60_000` como o `useNewOpportunitiesCount`), `useMarkNotificationRead` (invalida ambas as keys). **NÃO** invalidar `["opportunities-new-count"]` (fontes separadas).

- [x] **Task 10: Sino de notificações no Header (AC: #2)**
  - [x] 10.1 `src/components/common/NotificationBell.tsx` — ícone `Bell` (lucide) + badge de não-lidas (`useUnreadNotificationsCount`) num dropdown (shadcn `DropdownMenu`/`Popover` — usar o que já existe no projeto) listando as recentes (`useNotifications`); clicar num item marca lido (`useMarkNotificationRead`) e navega para `/opportunities`. Estado vazio ("Nenhuma notificação").
  - [x] 10.2 Montar em `src/components/common/Header.tsx:50-51` no cluster à direita, **antes** de `<ThemeToggle />`. `data-testid="notification-bell"`.
  - [x] 10.3 **NÃO** tocar `OpportunitiesBadge`/`useNewOpportunitiesCount`/`/api/opportunities/new-count` — a fonte única do badge da sidebar é preservada (AC2). O sino é superfície NOVA e independente.

- [x] **Task 11: Testes unitários (AC: #7)**
  - [x] 11.1 `__tests__/unit/lib/utils/notification-processor.test.ts` (novo): reply intent quente → WhatsApp + in-app; reply intent frio (`objecao`/`nao_agora`) → só in-app; reply intent null (fail-open 21.3) → só in-app; engagement → só in-app (opt-in OFF); engagement + opt-in ON → WhatsApp; canal WhatsApp off → só in-app; `whatsappNumbers` vazio → só in-app; agrupamento (>3 elegíveis → 1 grouped/número; ≤3 → individuais); fail-open (sendText lança → in-app criada, `notified_at` setado, erro contado); `suppressOnly` (marca `notified_at`, ZERO envio/insert); freshness-guard (opp velha → WhatsApp pulado, in-app criada); idempotência (`notified_at` já setado → não reprocessa); isolamento por-tenant; sem chave zapi → só in-app. **Mockar** `ZApiService.sendText`, `getApiKey`, e as tabelas (`opportunities`, `notification_settings`, `app_notifications`, `campaigns`, `leads`).
  - [x] 11.2 `__tests__/unit/lib/utils/reply-processor.test.ts` (estender): upgrade engagement→reply reseta `notified_at` para null; caminho "sem engajamento prévio" intocado (21.2 100% verde).
  - [x] 11.3 `__tests__/unit/types/opportunity.test.ts` (estender): round-trip `notified_at`; `toNotificationSettings`/`toAppNotification` com JSONB malformado (channels parcial/null, notify_intents com valor inválido, payload não-objeto) → defaults seguros.
  - [x] 11.4 Rotas: `notifications/route.ts`, `unread-count`, `[id]` (mark-read), `settings/notifications` (GET default + PUT valida + 403 não-admin + 401 sem sessão). Estender `process-batch/route.test.ts` e `backfill/route.test.ts` (contadores `notified`/`suppressed`; ordem: notify por último).
  - [x] 11.5 Componentes: `NotificationSettings` (render, validação de número inválido, save desabilitado até dirty), `NotificationBell` (badge de não-lidas, mark-read, vazio). Registrar mocks de tabela em `__tests__/helpers` já existentes; adicionar `notification_settings`/`app_notifications` se faltarem.

- [x] **Task 12: Validação** — `npx tsc --noEmit` (0 novos erros em `src/`); `npx eslint <arquivos novos/modificados> --max-warnings=0` limpo (inclusive `no-non-null-assertion` — leitura guardada de env); `npx vitest run` verde; `npm run build` verde (rotas `/api/notifications/*` + `/settings/notifications` registradas).

## Dev Notes

Esta é a **camada de proatividade** do Epic 21: o dado já existe (`opportunities`), a Central já exibe (21.4/21.5) — 21.7 leva o alerta ao vendedor (WhatsApp + sino in-app) e dá ao admin o controle (config). **A infraestrutura de dados já está pronta:** as tabelas `notification_settings` e `app_notifications` + tipos + mappers foram criados na 21.1 (migration 00055, `src/types/opportunity.ts`). **21.7 NÃO é story de schema** — a única migration é o marcador `notified_at` (idempotência do passe) + a trava de imutabilidade de `app_notifications` (dívida deferida). O comentário do próprio 00055 já referencia "21.7" nas 3 tabelas.

### Arquitetura — o passe de notificação encadeado no cron da 21.2

```
pg_cron (*/5, 00056) → reply-sweep (edge fn, thin) → /api/replies/process-batch (Node, service-role, REPLIES_CRON_SECRET)
   ├─ sweepReplies()            [21.2]  Instantly → campaign_events (source='polling')
   ├─ processReplies()          [21.2]  campaign_events → opportunities (source='reply', notified_at NULL)
   ├─ processEngagement()       [21.6]  getLeadTracking → opportunities (source='engagement', notified_at NULL)
   ├─ classifyPendingReplies()  [21.3]  opportunities.intent NULL → intent (gate do WhatsApp por intent)
   └─ notifyNewOpportunities()  [21.7]  opportunities.notified_at NULL → WhatsApp (ZApiService) + app_notifications  ← NOVO, POR ÚLTIMO

/api/replies/backfill (Node, admin) → sweep + process + engagement + classify + notify(suppressOnly:true)  ← marca notified_at SEM enviar
```

O passe **espelha estruturalmente `reply-classifier.ts`** (`classifyPendingReplies`): seleciona pendentes por marcador nullable (`intent IS NULL` lá, `notified_at IS NULL` aqui), agrupa por tenant, carrega config/credencial 1×/tenant, `Promise.allSettled` por-item, fail-open. **Reusar essa forma, não reinventar.** [Source: `src/lib/utils/reply-classifier.ts:517-595`]

### 🔴 Backfill NUNCA notifica (trap central desta story)

O backfill da 21.2 (AC6) ingere respostas de **meses** de histórico via API. Se o passe de notificação tratasse toda oportunidade `notified_at NULL` como "nova", o **primeiro ciclo do cron após um backfill dispararia WhatsApp para centenas de leads antigos** — o vendedor seria bombardeado e a feature morreria no dia 1. Guard-rail: o backfill chama `notifyNewOpportunities(..., { suppressOnly: true })`, que faz `UPDATE opportunities SET notified_at = now() WHERE notified_at IS NULL` **sem enviar nada**. Só oportunidades detectadas pelo cron DEPOIS do backfill notificam. Belt-and-suspenders: o freshness-guard (Task 4.4) pula WhatsApp de qualquer opp com `created_at` velho, mesmo que a supressão falhe. **Este é o defeito mais provável e mais danoso da story — teste-o explicitamente (Task 11.1).**

### Ordem no cron é obrigatória: notify por ÚLTIMO

O WhatsApp por intent (AC1) exige `intent` já preenchido. `classifyPendingReplies` (21.3) roda ANTES de `notifyNewOpportunities`, no mesmo ciclo — então um reply criado neste ciclo já é classificado neste ciclo quando o notify roda. Um reply com `intent` ainda null no momento do notify é uma **falha real de IA** (fail-open da 21.3) → recebe só in-app (AC2 "qualquer oportunidade nova"), nunca WhatsApp (AC1 exige intent quente). Aceitável e coerente. Se a IA classificar num ciclo posterior, é tarde para o WhatsApp daquela opp (edge de falha de IA) — não re-armamos por isso (só o upgrade engagement→reply re-arma, Task 6).

### Re-notificação no upgrade engagement→reply (deferred da review 21.6)

[Source: deferred-work.md — "Upgrade engagement→reply não reseta status para new" (dono: revisitar com 21.7)]. Um lead que engajou (card `source='engagement'`, notificado só in-app por padrão) e **depois respondeu** vira `source='reply'` via upgrade IN-PLACE no `reply-processor.ts` (21.6 AC4). Sem intervenção, `notified_at` já está setado → o passe não re-notifica → o vendedor perde o alerta WhatsApp do sinal MAIS FORTE do funil. Fix (Task 6): o UPDATE do upgrade seta `notified_at = null`, re-armando a opp para o passe reavaliar (agora como reply, com intent classificado → WhatsApp se quente). **Decisão padrão:** re-notificar. Custo: uma 2ª notificação in-app para o mesmo card (o "engajou" e o "respondeu" são eventos distintos — aceitável). Ver OQ1.

### Modificar `reply-processor.ts` (arquivo DONE 21.2/21.6) com segurança

Regressão-crítico. Regras (mesmas da 21.6): (1) o caminho "reply sem engajamento prévio" (INSERT — o único que os testes da 21.2 exercitam) fica **byte-a-byte igual**; o INSERT já nasce com `notified_at` NULL (default da coluna), notificado normalmente. (2) A ÚNICA mudança é adicionar `notified_at: null` ao objeto do `.update()` do ramo de upgrade (linhas 239-250). (3) Rodar a suíte completa (`reply-processor.test.ts`, `process-batch/route.test.ts`, `backfill/route.test.ts`) verde antes de fechar. [Source: `src/lib/utils/reply-processor.ts:207-268`]

### WhatsApp em contexto de cron (service-role, sem sessão)

As server actions do Epic 11/13.7/21.5 (`sendWhatsAppFromOpportunity`) usam `getCurrentUserProfile()` + `createClient` de sessão — **isso NÃO existe no cron**. O passe roda service-role, então: (a) credencial via `getApiKey(supabase, tenantId, "zapi")` — retorna a string JSON descriptografada (mesmo helper que a 21.3 usa p/ openai e a 21.6 p/ instantly; null → só in-app) [Source: `monitoring-processor.ts:136-155`]; (b) enviar via `new ZApiService().sendText(zapiKey, phone, message)` [Source: `zapi.ts:112-121`]. **NÃO** reusar a server action (ela depende de sessão e grava em `whatsapp_messages` — errado p/ alerta interno). **NÃO** gravar em `whatsapp_messages` (Task 4.6).

### Config: reuso de `notification_settings` (já existe) — NÃO criar tabela nova

A tabela `notification_settings` (1/tenant, `whatsapp_numbers`/`channels`/`notify_intents`) e os tipos/mappers já existem (00055 + `opportunity.ts:243-284`). O writer (Task 7) é um Route Handler admin-only que faz upsert `onConflict: "tenant_id"` — **clonar `src/app/api/settings/monitoring/route.ts`** (padrão de settings per-tenant: auth → `hasAdminAccess` 403 → zod → upsert). O opt-in de WhatsApp p/ engajamento (AC5) mora no JSONB `channels` (`whatsapp_engagement`), **sem migration**. RLS de `notification_settings` é tenant-only (não `is_admin` no SQL) — admin-only é enforçado no middleware (`/settings/*` [middleware.ts:59-61]) + no handler; isso segue o precedente `monitoring_configs` (00043) e é intencional. [Source: explorer settings; `capabilities.ts:14-21`]

### Sino in-app: superfície NOVA; badge da sidebar é intocado (AC2)

Não existe hoje NENHUM sino/central de notificações no app (busca em `src/` por `Bell`/`notifica` só acha o toast transitório do OpportunityPanel). 21.7 constrói o sino do zero no Header. **Fonte única do badge da sidebar** (AC2): a contagem de oportunidades `status='new'` via `useNewOpportunitiesCount` → `/api/opportunities/new-count` (21.4) — **não tocar**. O contador do sino é SEPARADO: não-lidas de `app_notifications` (`.is("read_at", null)`). Duas superfícies, duas fontes, zero acoplamento. [Source: explorer sidebar; `Sidebar.tsx:79-91,430`; `use-opportunities.ts:227-234`; `/api/opportunities/new-count/route.ts:21-25`]

### Agrupamento = por ciclo de cron (AC6)

A "janela de 5 min" do AC6 ≈ **um ciclo do cron** (cadência ≤5 min, NFR3). Logo, o agrupamento é por execução do passe, por tenant: junte os WhatsApp-elegíveis daquele ciclo; > `NOTIFY_GROUP_THRESHOLD` (3) → uma mensagem agrupada por número; ≤3 → individuais. Não precisa de janela temporal persistida — o `notified_at` garante que cada opp entra em exatamente um ciclo. As in-app permanecem 1 por opp (o agrupamento é só do WhatsApp, p/ reduzir ruído no celular).

### Reuso obrigatório (não reinventar)

- Estrutura do passe: `classifyPendingReplies` (grupo por tenant, config 1×/tenant, allSettled, fail-open, `.is(col, null)` CAS). [Source: `reply-classifier.ts:517-595`]
- WhatsApp: `ZApiService.sendText` (Epic 11). [Source: `zapi.ts:102-121`]
- Credencial descriptografada em cron: `getApiKey(supabase, tenantId, service)`. [Source: `monitoring-processor.ts:136-155`]
- Sanitização de telefone: `phone.replace(/[^\d+]/g, "")`. [Source: `whatsapp.ts:98`]
- Labels de intent: `OPPORTUNITY_INTENT_CONFIG[intent].label`. [Source: `opportunity.ts:74-95`]
- Dedup/marcador nullable + índice parcial: espelha 00055/00057. [Source: `00055:162-164`, `00057`]
- Writer de settings: `api/settings/monitoring/route.ts` + `use-monitoring-config.ts`. [Source: explorer settings]
- Form: RHF de `IcebreakerExamplesForm.tsx`; `Switch` de `ui/switch.tsx`; `TagInputField` (chips) de `ICPDefinitionForm.tsx:69-139`; checkbox-group de `ICPDefinitionForm.tsx:261-285`.
- Read API + hook + query-keys: `/api/opportunities/*` + `use-opportunities.ts`. [Source: explorer sidebar]
- Admin gate: `hasAdminAccess(profile.role)` — nunca `role === X` inline. [Source: `capabilities.ts:21`]
- `NEXT_PUBLIC_SITE_URL` para link user-facing (fallback `""`), leitura guardada. [Source: `team.ts:209`; `.env.example:28`]
- `SUPABASE_SERVICE_ROLE_KEY`/env com **leitura guardada** (eslint no-non-null-assertion linta o arquivo inteiro no pre-commit). [Source: memória "Pre-commit eslint"; `process-batch/route.ts:33-38`]
- Tailwind v4: `flex flex-col gap-*`, nunca `space-y-*`. [Source: memória do projeto]

### Anti-Patterns a evitar

1. **NÃO** notificar no backfill — `suppressOnly` marca `notified_at` sem enviar (senão: spam de histórico). Trap central.
2. **NÃO** rodar o notify ANTES do classify no cron — WhatsApp por intent depende de `intent` já setado.
3. **NÃO** gravar notificação interna em `whatsapp_messages` (é p/ mensagens ao lead).
4. **NÃO** reusar a server action `sendWhatsApp*` no cron (depende de sessão; grava tabela errada) — usar `ZApiService.sendText` direto + `getApiKey`.
5. **NÃO** alimentar o badge da sidebar com `app_notifications` — fonte única = `new-count` de oportunidades (AC2). O sino tem contador próprio.
6. **NÃO** criar tabela de settings/notificações nova — `notification_settings`/`app_notifications` já existem (00055).
7. **NÃO** deixar o WhatsApp bloquear a in-app — fail-open: in-app criada + `notified_at` setado mesmo com Z-API fora (AC4).
8. **NÃO** quebrar o caminho "reply sem engajamento prévio" do `reply-processor.ts` — só o ramo de UPDATE ganha `notified_at: null`.
9. **NÃO** usar `process.env.X!` (eslint pre-commit) — leitura guardada; env de link com fallback.
10. **NÃO** re-notificar infinitamente — `notified_at` (com `.is(null)` CAS) garante 1×; só o upgrade re-arma.
11. **NÃO** `space-y-*` em wrappers de form (Tailwind v4) — `flex flex-col gap-*`.
12. **NÃO** enviar WhatsApp em rajada paralela — sequencial por número (respeita Z-API).

### Previous Story Intelligence (21.6, 21.5, 21.3)

- **21.6 (DONE):** deixou 1 defer explícito p/ cá — upgrade engagement→reply não reseta status/notificação (Task 6). O `reply-processor.ts` já foi tocado com segurança lá (ramo aditivo) — repetir a disciplina. `engagement-processor` cria opps com `notified_at` NULL (default) → notificadas normalmente pelo passe (só in-app por default, AC5). [Source: `21-6-...md:318`]
- **21.5 (DONE):** `sendWhatsAppFromOpportunity` (server action) é o precedente de envio ao LEAD e de auto-mark de status — **NÃO** é o que o passe usa (contexto de sessão). Mas confirma `getZApiCredentials`/`ZApiService.sendText` como o caminho de envio. A 21.5 também provou (na tela, banco real) que o Z-API do cliente funciona e que `company_name` precisa estar presente — o passe degrada empresa ausente com fallback.
- **21.3 (DONE):** `classifyPendingReplies` é o template estrutural direto (mesmo cron, mesmo padrão fail-open, mesma técnica de CAS `.is(col,null)`). O gate de WhatsApp por intent depende dela. `intent` pode ser null (fail-open) → só in-app.
- **21.1 (DONE):** criou `notification_settings`/`app_notifications` + tipos/mappers. Migration aplicada à mão no banco do cliente (idempotente) — a 00060 idem. Os 4 defers da review 21.1 com dono/relevância 21.7 estão endereçados: `channels` malformado (Task 2.3), conteúdo JSONB não validado (Task 2.3/7.2), `app_notifications` imutabilidade (Task 1.3), lifecycle CHECK (dono 21.5, fora daqui). [Source: deferred-work.md#L17-L19]
- **Banco gerido à mão, sem migration tracking** [memória] → 00060 reaplica sem erro (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`/`CREATE TRIGGER`).

### Git Intelligence (commits recentes)

- `a63a9c9` chore: ignora design/ — **baseline (HEAD)**.
- `1eb0c1f` feat(story-21.5) — ações do card + próximo passo por IA (precedente de envio WhatsApp da opp).
- `701f2e3` fix(story-13.11) — WhatsApp campaign_id nullable (contexto do envio ao lead).
- `37e286e` feat(story-21.4) — Central + cards (badge/new-count a preservar).
- `099532c` feat(story-21.3) — classificação IA (o classify que precede o notify).
- Branch: `epic/21-loop-de-resposta` (commitar na branch do épico — padrão do épico; não abrir feature branch).

### Project Structure Notes

**Novos:**
- `supabase/migrations/00060_add_notifications_hardening.sql`
- `src/lib/utils/notification-processor.ts`
- `src/app/api/settings/notifications/route.ts`
- `src/app/api/notifications/route.ts`, `src/app/api/notifications/unread-count/route.ts`, `src/app/api/notifications/[notificationId]/route.ts`
- `src/hooks/use-notification-settings.ts`, `src/hooks/use-notifications.ts`
- `src/app/(dashboard)/settings/notifications/page.tsx`
- `src/components/settings/NotificationSettings.tsx`
- `src/components/common/NotificationBell.tsx`
- Testes correspondentes.

**Modificados:**
- `src/types/opportunity.ts` (+`notified_at`; +`whatsappEngagement`; transforms defensivos; `DEFAULT_NOTIFICATION_SETTINGS`)
- `src/lib/utils/reply-processor.ts` (+`notified_at: null` no ramo de upgrade)
- `src/app/api/replies/process-batch/route.ts` (+`notifyNewOpportunities` por último)
- `src/app/api/replies/backfill/route.ts` (+`notifyNewOpportunities({ suppressOnly })`)
- `src/components/settings/SettingsTabs.tsx` (+aba Notificações)
- `src/components/common/Header.tsx` (+`<NotificationBell />`)
- Testes: `opportunity.test.ts`, `reply-processor.test.ts`, `process-batch/route.test.ts`, `backfill/route.test.ts`, helpers de mock.

**Intocados (garantir):** `src/components/common/Sidebar.tsx` (badge de oportunidades — fonte única), `use-opportunities.ts`/`/api/opportunities/new-count` (fonte do badge), `supabase/functions/reply-sweep/index.ts` (edge fn thin), `00056`, receiver do webhook (`instantly-webhook`), `src/actions/whatsapp.ts` (server actions ao lead).

### Latest Tech Information

- **Z-API** `/send-text` (`POST`, `Client-Token` header, body `{ phone, message, delayTyping }`) — já encapsulado em `ZApiService.sendText`; não chamar a API crua. [Source: `zapi.ts`]
- **OpenAI/IA:** o passe de notificação **NÃO usa IA** (mensagem é template puro) — sem `api_usage_logs`, sem custo, sem prompt.
- **Next.js App Router:** Route Handlers (não Server Actions) para as rotas de settings/notifications (padrão do projeto para dados que o front consome via TanStack Query). Vars `NEXT_PUBLIC_*` são legíveis server-side.

## Project Context Reference

- Epic: [epic-21-loop-de-resposta.md](../planning-artifacts/epic-21-loop-de-resposta.md#Story 21.7) — ACs, FR13/FR14/FR15, sequência.
- Deferred: [deferred-work.md](./deferred-work.md) — itens dono/relevância 21.7 (L17-L19, L86).
- Pós-deploy: [epic-21-post-deploy-checklist.md](./epic-21-post-deploy-checklist.md) — secret do cron; **adicionar** verificação de `NEXT_PUBLIC_SITE_URL` na Vercel.
- Migrations base: [00055](../../supabase/migrations/00055_create_opportunities_schema.sql) (settings/app_notifications), [00057](../../supabase/migrations/00057_add_engagement_to_opportunities.sql).

## Open Questions (para Fabossi — não bloqueiam o dev; defaults assumidos)

1. **Re-notificar no upgrade engagement→reply?** Default assumido: **SIM** — resetar `notified_at` no upgrade dispara o WhatsApp do reply quente (Task 6), ao custo de uma 2ª notificação in-app do mesmo card ("engajou" → "respondeu"). Alternativa: não re-notificar (perde o alerta do sinal mais forte). Recomendo SIM.
2. **Agrupamento por ciclo de cron vs janela temporal real?** Default: **por ciclo** (a cadência ≤5 min já é a janela do AC6; sem estado extra). Se o cliente quiser janela deslizante real (ex.: agrupar entre execuções), vira hardening futuro.
3. **Freshness-guard de WhatsApp (`MAX_WHATSAPP_NOTIFY_AGE_MS`):** default proposto **60 min** — belt-and-suspenders além da supressão de backfill. Confirmar o valor (ou remover se a supressão for considerada suficiente).
4. **Opt-in de WhatsApp p/ engajamento default OFF** (AC5) — confirmado pela redação do AC ("apenas in-app por padrão"). Mantido OFF.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` → 0 erros em `src/`.
- `npx eslint <arquivos novos/modificados> --max-warnings=0` → limpo (1 warning `react-hooks/incompatible-library` no `watch()` do NotificationSettings suprimido com o mesmo disable do `ICPDefinitionForm`; leitura de env guardada = sem `no-non-null-assertion`).
- `npx vitest run` → 391 files / 6687 pass / 2 skip / 0 fail (baseline 386/6627). +5 arquivos de teste, +60 testes.
- `npm run build` → ✓ Compiled successfully; rotas `/api/notifications`, `/api/notifications/[notificationId]`, `/api/notifications/unread-count`, `/api/settings/notifications`, `/settings/notifications` registradas.
- Mock trap corrigida no teste: `ZApiService` mockado via `class { sendText = mockSendText }` (arrow-fn não é construtor).

### Completion Notes List

Implementadas as 12 tasks (backend do gatilho → writer de settings → central in-app → testes → validação):

- **Task 1 (00060):** migration idempotente/defensiva — `notified_at` (marcador de idempotência do passe) + índice parcial `idx_opportunities_pending_notification` + trigger `enforce_app_notifications_immutable` (fecha o defer 21.1: `app_notifications` imutável exceto `read_at`, agora enforçado no banco). **OPERACIONAL Fabossi:** aplicar 00060 no banco do cliente antes/junto do deploy.
- **Task 2 (tipos):** `notified_at`/`notifiedAt` em `OpportunityRow`/`Opportunity` + round-trip; `whatsapp_engagement`/`whatsappEngagement` no JSONB `channels` (AC5, ZERO migration); `toNotificationSettings`/`toAppNotification` endurecidos com leitura defensiva (channels parcial/null/não-objeto, `notify_intents` com valor fora do enum filtrado, `whatsapp_numbers` não-array, `payload` não-objeto → `{}`) — **fecha 2 defers 21.1**; `DEFAULT_NOTIFICATION_SETTINGS` como fonte única.
- **Tasks 3+4 (`notification-processor.ts`):** `notifyNewOpportunities` espelhando `classifyPendingReplies` (grupo por tenant, config 1×/tenant, `Promise.allSettled` por-item, fail-open). In-app sempre 1/opp; WhatsApp-elegível coletado e enviado na fase B (agrupado se `> NOTIFY_GROUP_THRESHOLD=3`, senão individual — sequencial por número). Helpers puros `buildHotLeadMessage`/`buildGroupedMessage`/`buildLeadName`. Freshness-guard (60 min). `notified_at` marcado com CAS `.is(null)`. NÃO usa IA, NÃO grava `whatsapp_messages`, usa `ZApiService.sendText` + `getApiKey` (não a server action).
- **Task 5 (cron/backfill):** `notifyNewOpportunities` encadeado POR ÚLTIMO no `process-batch` (depois do classify) com contadores `notified`/`whatsappSent`/`whatsappGrouped`; no `backfill` com `{ suppressOnly: true }` (marca o backlog SEM enviar — guard-rail central contra spam) + contador `suppressed`.
- **Task 6 (upgrade):** `reply-processor.ts` ganha `notified_at: null` SÓ no ramo de UPDATE do upgrade engagement→reply (fecha defer 21.6); caminho de INSERT intocado.
- **Task 7 (writer):** `api/settings/notifications` (GET default/PGRST116 + PUT upsert `onConflict: tenant_id`, admin-only, Zod: E.164 sanitizado p/ dígitos + intents válidos + canais) + `use-notification-settings`.
- **Task 8 (UI settings):** aba "Notificações" + página wrapper + `NotificationSettings` (RHF+Zod, `TagInputField` de chips, `Switch` via `Controller`, checkbox-group de intents, save desabilitado até `isDirty`, `flex flex-col gap-*`).
- **Task 9 (central in-app):** `GET /api/notifications` (envelope data/meta), `GET /api/notifications/unread-count` (contador do SINO, distinto do badge), `PATCH /api/notifications/[id]` (só `read_at`) + `use-notifications` (NÃO invalida o badge de oportunidades).
- **Task 10 (sino):** `NotificationBell` (badge de não-lidas + dropdown + mark-read + navega p/ `/opportunities`) montado no Header antes do `ThemeToggle`; badge da sidebar (fonte única `new-count`) intocado.
- **Task 11 (testes):** `notification-processor.test.ts` (22 — gatilho por intent, gate de canal/número, agrupamento >3/≤3, fail-open, `suppressOnly`, freshness, sem chave zapi, isolamento por-tenant); extensões em `reply-processor.test.ts` (upgrade reseta `notified_at`), `opportunity.test.ts` (round-trip + JSONB malformado), rotas `settings/notifications` + `notifications/*`, `process-batch`/`backfill` (notify por último + `suppressed`); componentes `NotificationBell`/`NotificationSettings`; regressões corrigidas em `Header`/`AppShell`/`SettingsTabs`.
- **Task 12:** todas as validações verdes (ver Debug Log).

**Open Questions — defaults aplicados** (confirmar na review): OQ1 re-notificar no upgrade = SIM (Task 6); OQ2 agrupamento por ciclo de cron; OQ3 freshness `MAX_WHATSAPP_NOTIFY_AGE_MS = 60 min`; OQ4 engagement WhatsApp opt-in OFF.

**PÓS-DEPLOY (Fabossi):** aplicar 00060; confirmar `NEXT_PUBLIC_SITE_URL` na Vercel (link do WhatsApp — adicionar ao `epic-21-post-deploy-checklist.md`); rodar `epic-21-post-deploy-checklist.md` + retrospectiva do épico.

### File List

**Novos:**
- `supabase/migrations/00060_add_notifications_hardening.sql`
- `src/lib/utils/notification-processor.ts`
- `src/app/api/settings/notifications/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/notifications/unread-count/route.ts`
- `src/app/api/notifications/[notificationId]/route.ts`
- `src/hooks/use-notification-settings.ts`
- `src/hooks/use-notifications.ts`
- `src/app/(dashboard)/settings/notifications/page.tsx`
- `src/components/settings/NotificationSettings.tsx`
- `src/components/common/NotificationBell.tsx`
- `__tests__/unit/lib/utils/notification-processor.test.ts`
- `__tests__/unit/app/api/settings/notifications/route.test.ts`
- `__tests__/unit/app/api/notifications/route.test.ts`
- `__tests__/unit/components/common/NotificationBell.test.tsx`
- `__tests__/unit/components/settings/NotificationSettings.test.tsx`

**Modificados:**
- `src/types/opportunity.ts` (+`notified_at`/`notifiedAt`; +`whatsappEngagement`; transforms defensivos; `DEFAULT_NOTIFICATION_SETTINGS`)
- `src/lib/utils/reply-processor.ts` (+`notified_at: null` no ramo de upgrade)
- `src/app/api/replies/process-batch/route.ts` (+`notifyNewOpportunities` por último + contadores)
- `src/app/api/replies/backfill/route.ts` (+`notifyNewOpportunities({ suppressOnly })` + `suppressed`)
- `src/components/settings/SettingsTabs.tsx` (+aba Notificações)
- `src/components/common/Header.tsx` (+`<NotificationBell />`)
- `__tests__/unit/types/opportunity.test.ts` (round-trip `notified_at` + JSONB malformado + `whatsappEngagement`)
- `__tests__/unit/lib/utils/reply-processor.test.ts` (upgrade reseta `notified_at`)
- `__tests__/unit/app/api/replies/process-batch/route.test.ts` (mock notify + contadores + ordem)
- `__tests__/unit/app/api/replies/backfill/route.test.ts` (mock notify suppressOnly + `suppressed`)
- `__tests__/unit/components/Header.test.tsx` (mock use-notifications)
- `__tests__/unit/components/AppShell.test.tsx` (mock use-notifications)
- `__tests__/unit/components/settings/SettingsTabs.test.tsx` (7 abas)

## Change Log

- 2026-07-16 (dev-story): 12/12 tasks implementadas → Status **review**. Passe `notifyNewOpportunities` (novo `notification-processor.ts` espelhando `classifyPendingReplies`) encadeado POR ÚLTIMO no cron da 21.2 + supressão no backfill (`suppressOnly` = guard-rail central contra spam de histórico). Migration 00060 idempotente (`notified_at` + índice parcial + trigger de imutabilidade de `app_notifications`, fechando defer 21.1). Tipos endurecidos (defesa de JSONB, fecha 2 defers 21.1) + `whatsappEngagement` (AC5, ZERO migration). Upgrade engagement→reply reseta `notified_at` (fecha defer 21.6). Writer admin-only `/settings/notifications` + UI (RHF/TagInput/Switch) + sino no Header (read API + unread-count + mark-read) com badge da sidebar preservado como fonte única. Validações: tsc 0 src/; eslint --max-warnings=0 limpo; vitest 391 files/6687 pass/2 skip/0 fail; build verde. Defaults das 4 OQs aplicados. OPERACIONAL Fabossi: aplicar 00060 + confirmar `NEXT_PUBLIC_SITE_URL` na Vercel + rodar `epic-21-post-deploy-checklist.md`. Falta code-review.
- 2026-07-16: Story 21.7 criada (create-story) — Notificações Proativas + Configurações (última story do Epic 21; FR13/FR14/FR15). Passe `notifyNewOpportunities` (novo `notification-processor.ts`) espelhando `classifyPendingReplies`, encadeado POR ÚLTIMO no cron da 21.2 (após classify): WhatsApp via `ZApiService`/`getApiKey` para leads quentes (reply intent ∈ notify_intents) + `app_notifications` in-app para qualquer opp nova; agrupamento >3/ciclo; fail-open (in-app apesar do WhatsApp). Marcador `notified_at` (migration 00060, idempotente) + trava de imutabilidade de `app_notifications` (fecha defer 21.1). **Supressão no backfill** (`suppressOnly`) — guard-rail central contra spam de histórico. Re-notificação no upgrade engagement→reply (fecha defer 21.6). Writer de `notification_settings` (aba admin-only `/settings/notifications`, RHF + TagInputField + Switch) + defesa de JSONB nos transforms (fecha 2 defers 21.1). Sino de notificações NOVO no Header (read API + mark-read + contador de não-lidas), com badge da sidebar preservado como fonte única (`new-count`). ZERO tabela nova (reusa 00055). 4 Open Questions p/ Fabossi (defaults assumidos). Baseline `a63a9c9`. Status: ready-for-dev.

## Review Findings (code review bmad 3 camadas — 2026-07-16)

> Review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo **full**. **Acceptance Auditor: 7/7 ACs SATISFEITOS + 12 anti-patterns respeitados** (backfill suppress, notify por último, sem `whatsapp_messages`, badge da sidebar intocado, upgrade aditivo). Nenhum bug HIGH. Convergência forte: o **CAS de `notified_at` ordenado após os side-effects (achado nº1) foi eleito de forma INDEPENDENTE por Blind + Edge**. 1 decision-needed, 4 patches, 5 defers, 7 dismiss.

- [x] [Review][Patch] **Freshness-guard mata o WhatsApp do upgrade engagement→reply que a Task 6 re-arma** (era decision-needed; RESOLVIDO Fabossi 2026-07-16 → isentar reply do guard) — a Task 6 reseta `notified_at: null` no upgrade para disparar o WhatsApp do reply quente, mas o freshness-guard [notification-processor.ts:300] usa `created_at` (que o upgrade 21.6 PRESERVA). Engajamento >60 min antes do reply (caso comum) → WhatsApp pulado, alerta do sinal mais forte perdido. **Fix decidido:** o freshness-guard passa a aplicar SÓ a `source='engagement'` (belt-and-suspenders contra backfill); `source='reply'` tem `reply_event_id` = sinal genuíno e fresco → isento. Fonte: Blind Hunter.

- [x] [Review][Patch] CAS de `notified_at` ordenado APÓS os side-effects e resultado ignorado — in-app INSERT + coleta WhatsApp acontecem antes do `.update().is(null)` e `markError` nunca checa linhas afetadas; passes concorrentes (cron×backfill / cron×cron sobreposto) duplicam in-app + WhatsApp. O freshness-guard limita o pior caso (histórico velho), mas a idempotência prometida no comentário é falsa. Fix: reivindicar a linha via CAS-com-`.select("id")` PRIMEIRO; só então inserir in-app + coletar elegível (espelha o CAS-como-gate do `reply-classifier.ts:498`). [notification-processor.ts:262-323]
- [x] [Review][Patch] `loadNotificationSettings` confunde erro transitório com sem-linha — `.single()` erro (transitório) cai no mesmo ramo de PGRST116 → defaults (`whatsappNumbers` vazio) → tenant configurado tem o WhatsApp silenciosamente pulado E `notified_at` marcado (alerta perdido, sem retry). Fix: só PGRST116 → defaults; erro real → throw (o catch por-tenant pula o tenant sem marcar → reentra no próximo ciclo). [notification-processor.ts:186]
- [x] [Review][Patch] `NotificationBell` ignora `isLoading`/`error` — desestrutura só `{ notifications }`; durante o fetch ou em erro de rede mostra "Nenhuma notificação", indistinguível de vazio real. Fix: superficializar loading/erro. [NotificationBell.tsx:62,100]
- [x] [Review][Patch] Telefone do vendedor (PII) logado na falha de WhatsApp — `phone` nos payloads de warn [notification-processor.ts:375-405]; consistente com a lição de PII-em-log da 13.11. Fix: remover/mascarar o número no log.

- [x] [Review][Defer] Falha na in-app INSERT ainda marca `notified_at` → registro perdido para sempre [notification-processor.ts:275-323] — deferred, fail-open aceito (retry de in-app fora de escopo)
- [x] [Review][Defer] Central de notificações é tenant-shared (sem `user_id`); mark-read é global [app_notifications 00055] — deferred, limitação de schema pré-existente da 21.1 (um SDR limpa o badge de todos); confirmar intenção de produto + migration em story futura
- [x] [Review][Defer] Ordering de deploy: o cron pode criar in-app do backlog antes do suppress-backfill rodar [notification-processor.ts:472] — deferred, freshness limita o WhatsApp; flood de in-app é único e pequeno (cliente ~4 opps hoje); mitigação operacional no post-deploy checklist
- [x] [Review][Defer] `MAX_NOTIFY_PER_RUN=200` é global, não por-tenant [notification-processor.ts:41] — deferred, single-tenant hoje; revisitar em escala multi-tenant
- [x] [Review][Defer] `notificationId` não-UUID devolve 500 em vez de 404 [notifications/[notificationId]/route.ts:27-40] — deferred, MESMO padrão `22P02` já deferido na 21.5 (decisão consistente do codebase)
