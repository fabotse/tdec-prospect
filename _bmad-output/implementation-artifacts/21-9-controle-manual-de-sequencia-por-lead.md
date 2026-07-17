---
baseline_commit: 5623d57023657fdaf57bcbcd8171482d89712339
---

# Story 21.9: Controle Manual de Sequência por Lead

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **STORY PÓS-PLANNING do Epic 21** (adicionada 2026-07-16, demanda direta do Fabossi/cliente). Cobre o **FR18** (novo). Gap real de operação: `stop_on_reply: true` só para a sequência quando o lead responde **o e-mail** — quem responde por **outro canal** (WhatsApp do cliente, telefone) continua recebendo follow-ups. Esta story dá ao usuário o controle manual: **parar a sequência** ou **remover o lead do Instantly** direto do app.
>
> **✅ RISCO EXTERNO JÁ ELIMINADO — smoke test real executado em 2026-07-16** com a API key do cliente na campanha "Evento Rosewood - Julho - 2026 - (Reenvio)":
> - `POST /api/v2/leads/update-interest-status` `{campaign_id, lead_email, interest_value: 1}` → **HTTP 202** ("background job submitted") → em segundos o lead saiu de `status: 1` (ativo) para `status: 3` (sequência concluída) e `lt_interest_status: 1`. **Funciona no plano do cliente** (sem o bloqueio que os webhooks têm).
> - `DELETE /api/v2/leads/{id}` → **HTTP 200** + GET seguinte 404 (removido de verdade).
> - Aprendizado: e-mail de membro do workspace é recusado silenciosamente no add (`skipped_count: 1`) — irrelevante ao runtime, mas explica testes manuais com e-mail próprio (usar alias `+`).

## Story

As a usuário,
I want parar a sequência de um lead ou removê-lo do Instantly direto do app,
so that leads que já responderam por outro canal (ex.: WhatsApp) — ou que não devem mais ser contactados — parem de receber follow-ups sem eu precisar abrir o painel do Instantly.

## Acceptance Criteria

1. **[Parar — respondeu por outro canal]** **Given** um lead ativo numa campanha exportada (`external_campaign_id` preenchido) **When** o usuário aciona "Parar sequência" com motivo "Respondeu por outro canal" e confirma **Then** o backend chama `POST /api/v2/leads/update-interest-status` com `{campaign_id: external_campaign_id, lead_email, interest_value: 1}` (Interested) **And** a resposta 202 é tratada como "solicitado" (job assíncrono do Instantly) **And** o status local do lead é promovido para `interessado` (guarda promote-only — não rebaixa `oportunidade`) **And** uma `lead_interaction` `type='sequence_stopped'` registra a ação com o motivo (FR18)

2. **[Parar — não contactar]** **Given** o mesmo fluxo **When** o motivo escolhido é "Não contactar mais" **Then** `interest_value: -1` (Not Interested) é enviado **And** o status local do lead vira `nao_interessado` **And** a `lead_interaction` registra o motivo

3. **[Remover do Instantly]** **Given** um usuário **admin** (gestor/diretor — `hasAdminAccess`) **When** aciona "Remover do Instantly" e confirma no dialog destrutivo (aviso explícito: "remove o lead e o histórico dele desta campanha no Instantly; a ação não pode ser desfeita") **Then** o backend resolve o ID interno do lead no Instantly por e-mail (`POST /api/v2/leads/list` filtrado pela campanha) e chama `DELETE /api/v2/leads/{id}` **And** uma `lead_interaction` `type='lead_removed'` é registrada **And** o lead local (`leads`) e a associação `campaign_leads` **NÃO** são apagados (histórico local preservado) **And** usuário não-admin recebe 403 com mensagem PT-BR

4. **[Coluna "Sequência"]** **Given** a tabela de leads do Analytics (`LeadTrackingTable`) **Then** exibe nova coluna "Sequência" com o status do lead no Instantly (badge PT-BR: `1`→Ativa, `2`→Pausada, `3`→Concluída, `-1`→Bounce, `-2`→Descadastrado, `-3`→Pulado; desconhecido→"—") **And** o valor vem de `item.status` do `leads/list`, hoje descartado no mapeamento

5. **[UI da tabela]** **Given** cada linha da `LeadTrackingTable` **Then** há menu de ações (⋮, padrão `LeadTable`) com "Parar sequência" (submenu ou dialog com os 2 motivos) e "Remover do Instantly" (visível apenas para admin) **And** ambos abrem `AlertDialog` de confirmação (padrão `DeleteLeadsDialog`) **And** durante a ação a linha mostra estado pendente e sucesso/erro vira toast PT-BR **And** após sucesso a query `["lead-tracking", campaignId]` é invalidada (a coluna Sequência reflete o novo estado no refetch — nota de eventual consistency: segundos)

6. **[Atalho no card de oportunidade]** **Given** um `OpportunityCard` cuja oportunidade tem `campaign_id` válido e e-mail do lead disponível **Then** exibe ação "Parar sequência" (mesmo fluxo de confirmação/motivos; `e.stopPropagation()` como as demais ações do card) **And** o botão NÃO renderiza quando `campaign_id` é null (lição 13.11: coluna nullable) ou o e-mail não está disponível **And** a campanha da oportunidade sem `external_campaign_id` → erro amigável PT-BR

7. **[Ordem e fail-safe]** **Given** qualquer ação **Then** a chamada remota ao Instantly acontece PRIMEIRO; efeitos locais (interaction + status) só são gravados se a remota suceder **And** falha do Instantly → `ExternalServiceError` vira resposta com `userMessage` PT-BR (padrão da rota de tracking) e NADA local é gravado **And** lead não encontrado no Instantly (remove) → 404 PT-BR ("Lead não encontrado no Instantly — ele pode já ter sido removido")

8. Testes unitários para: métodos novos do `InstantlyService` (202, erro, lookup por e-mail com paginação), rota (auth 401, admin 403 no remove, campanha sem export 400, ordem remoto→local, fail-safe), hook (invalidation), tabela (coluna, menu, gating por papel, dialogs) e card (render condicional, stopPropagation)

## Tasks / Subtasks

- [x] **Task 1: `InstantlyService` — métodos de mutação de lead (AC: #1, #2, #3, #7)**
  - [x] 1.1 Constantes novas no topo de `src/lib/services/instantly.ts` (padrão linhas 48-52): `INSTANTLY_LEADS_ENDPOINT = "/api/v2/leads"`, `INSTANTLY_LEADS_LIST_ENDPOINT = "/api/v2/leads/list"`, `INSTANTLY_INTEREST_STATUS_ENDPOINT = "/api/v2/leads/update-interest-status"`.
  - [x] 1.2 `updateLeadInterestStatus({ apiKey, campaignId, leadEmail, interestValue }): Promise<{ accepted: boolean }>` — `POST` com body `{ campaign_id, lead_email, interest_value }` via `this.request<T>` + `buildAuthHeaders`. O Instantly responde **202** `{"message":"...background job submitted"}` (validado no smoke test) — verificar que `this.request`/`base-service` trata 2xx não-200 como sucesso; ajustar se necessário. ✅ VERIFICADO: `response.ok` cobre 2xx (base-service.ts:240) — 202 é sucesso sem ajuste.
  - [x] 1.3 `findLeadIdByEmail({ apiKey, campaignId, email }): Promise<string | null>` — `POST /leads/list` body `{ campaign: campaignId, search: email }`; **VERIFICAR** se `search` casa por e-mail (não foi confirmado no smoke test); fallback obrigatório: paginar (`limit: 100` + `starting_after`) comparando `item.email` normalizado (lowercase/trim), cap de páginas com warning (padrão do sweep 21.2). ✅ Fast-path `search` sempre re-verificado client-side por e-mail normalizado + fallback de paginação SEMPRE presente (cap 50 páginas + warning).
  - [x] 1.4 `deleteLead({ apiKey, leadId }): Promise<{ deleted: boolean }>` — `DELETE /api/v2/leads/{id}` (200 com o objeto do lead removido).
  - [x] 1.5 Constante `INSTANTLY_LEAD_STATUS_LABELS: Record<number, string>` (escala de LEAD: 1 Ativa, 2 Pausada, 3 Concluída, -1 Bounce, -2 Descadastrado, -3 Pulado) — exportada; NÃO confundir com `INSTANTLY_CAMPAIGN_STATUS_LABELS` (linhas 59-68, escala de CAMPANHA, diferente).
  - [x] 1.6 Testes em `__tests__/unit/lib/services/instantly.test.ts` (estender): `createMockFetch`/`mockJsonResponse` de `__tests__/helpers/mock-fetch.ts`; casos: 202 aceito, erro 4xx/5xx vira `ExternalServiceError`, lookup acha na 1ª página, acha via paginação, não acha → null. (+15 testes; RED provado antes do GREEN)

- [x] **Task 2: Tipos + mapeamento — `sequenceStatus` (AC: #4)**
  - [x] 2.1 `src/types/tracking.ts`: adicionar `sequenceStatus?: number` à interface `LeadTracking` (após `statusSummary`/`ltInterestStatus`, ~linha 175). O tipo cru `InstantlyLeadEntry` JÁ tem `status: number` (linha 306) — nada a mudar lá.
  - [x] 2.2 `src/lib/services/tracking.ts` `mapToLeadTracking` (linhas 141-174): mapear `sequenceStatus: item.status` (hoje o campo é lido da API e **descartado**).
  - [x] 2.3 Estender testes de `mapToLeadTracking` (arquivo de teste existente do tracking service) com o campo novo. (+3 testes)

- [x] **Task 3: Migration `00062` — valores novos do enum `interaction_type` (AC: #1, #2, #3)**
  - [x] 3.1 `supabase/migrations/00062_add_sequence_interaction_types.sql` — **idempotente/defensiva** (banco gerido à mão): `ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'sequence_stopped';` + `ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'lead_removed';` + `COMMENT` explicando (ação manual da 21.9). Enum atual: `'note','status_change','import','campaign_sent','campaign_reply'` [00013:7].
  - [ ] 3.2 **OPERACIONAL (Fabossi):** aplicar 00062 no banco do cliente antes/junto do deploy (como 00055-00061). ⚠️ PENDENTE — ação operacional do Fabossi (a suíte mockada não prova o enum; ver Completion Notes).
  - [x] 3.3 Se houver union TS espelhando o enum (buscar `interaction_type`/`InteractionType` em `src/types/`), estender com os 2 valores + teste. ✅ `src/types/interaction.ts` (`interactionTypeValues`) estendido + novo `__tests__/unit/types/interaction.test.ts` (5 testes).

- [x] **Task 4: Rota `POST /api/campaigns/[campaignId]/leads/sequence-actions` (AC: #1, #2, #3, #7)**
  - [x] 4.1 Novo `src/app/api/campaigns/[campaignId]/leads/sequence-actions/route.ts` — espelhar a rota de tracking (auth/erros): `getCurrentUserProfile()` → 401; `UUID_RE` no `campaignId` → 400; campanha do tenant → 404; `external_campaign_id` null → 400 "Campanha ainda não exportada para o Instantly".
  - [x] 4.2 Body Zod: `{ action: "stop" | "remove", leadEmail: string (email), reason?: "responded_other_channel" | "do_not_contact" }` — `reason` obrigatório quando `action === "stop"` (refine); inválido → 400 PT-BR.
  - [x] 4.3 Gating: `action === "remove"` exige `hasAdminAccess(profile.role)` → 403 "Acesso negado" (padrão `replies/backfill/route.ts:37`). `stop` liberado para qualquer papel do tenant (SDR usa a Central — 21.4 AC7). Testado nos 2 sentidos (403 p/ SDR no remove; 200 p/ SDR no stop).
  - [x] 4.4 API key via `getApiKey(adminClient, profile.tenant_id, "instantly")` → null → 404 "API key do Instantly não configurada". ✅ CLIENT ADMIN via `createAdminClient()` (mesmo padrão do patch 4 da review 21.5 — suggestion/route.ts), com try/catch → 500 se service-role ausente; teste de regressão prova QUAL client lê a key.
  - [x] 4.5 `stop`: `updateLeadInterestStatus` com `interestValue: reason === "responded_other_channel" ? 1 : -1`. Depois do sucesso remoto: (a) `matchLeadId` REUSADO de `reply-processor.ts` (escape de ILIKE da 21.2, não duplicado); (b) interaction `sequence_stopped` com motivo + `created_by: profile.id` + status via `resolveLeadStatusTransition` REUSADO da 21.3 (promote-only; opt_out preserva `oportunidade`); (c) lead local não encontrado → 200 com `localSynced: false`.
  - [x] 4.6 `remove`: `findLeadIdByEmail` → null → 404 PT-BR; senão `deleteLead` → sucesso → `lead_interactions` `type='lead_removed'` (se lead local existe). `leads`/`campaign_leads` locais INTOCADOS (testado).
  - [x] 4.7 `ExternalServiceError` → `{ error: error.userMessage }` com `status: error.statusCode || 502` (padrão da rota de tracking). Efeitos locais NUNCA antes do sucesso remoto (ordem provada por `invocationCallOrder`).
  - [x] 4.8 Testes `__tests__/unit/api/sequence-actions.test.ts` (padrão `instantly-leads.test.ts`): 27 testes — 401; 400 UUID/body/sem-reason/e-mail/ação/sem-export; 403 remove não-admin + stop liberado p/ SDR; key via client ADMIN + 404 sem key + 500 sem service-role; stop ok (ordem remoto→local, promote-only ×2, interaction, do_not_contact); localSynced:false (lead ausente e insert falho); remove ok (sem delete local); remove 404; falhas remotas → nada local.

- [x] **Task 5: Hook `useLeadSequenceAction` (AC: #5, #6)**
  - [x] 5.1 Novo `src/hooks/use-lead-sequence-action.ts` (padrão `useUpdateOpportunityStatus`): `useMutation` → `POST /api/campaigns/${campaignId}/leads/sequence-actions`; `onSuccess`: `toast.success` ("Sequência interrompida — o Instantly aplica em instantes" / "Lead removido do Instantly") + `invalidateQueries(LEAD_TRACKING_QUERY_KEY)`; `onError`: `toast.error` com a mensagem da API. Exporta `SEQUENCE_STOP_REASON_LABELS` (fonte única dos labels de motivo p/ os dialogs).
  - [x] 5.2 Testes do hook (padrão dos testes de `use-opportunities`) — 6 testes (URL/body, toasts, invalidation, erro da API, fallback PT-BR, labels).

- [x] **Task 6: UI — `LeadTrackingTable` (AC: #4, #5)**
  - [x] 6.1 Coluna "Sequência": `<TableHead>` no header (após "Respondeu") + `<TableCell>` no body com `Badge` do label (`INSTANTLY_LEAD_STATUS_LABELS[lead.sequenceStatus]` → "—" se undefined/desconhecido) + célula extra em `SkeletonRows`. Não-ordenável (default da OQ3).
  - [x] 6.2 Coluna de ações: `<TableHead className="w-10">` + célula com `DropdownMenu` (padrão `LeadTable.tsx`: trigger ghost `MoreHorizontal`, `data-testid`, item destrutivo `text-destructive` com `Trash2`): "Parar sequência" como 2 itens de motivo sob `DropdownMenuLabel` (decisão do dev: mais simples; o dialog confirma com o motivo pré-selecionado e permite trocar via radio) e "Remover do Instantly" (renderizado só quando `onRemoveLead` presente — o container só o passa p/ admin).
  - [x] 6.3 Props novas em `LeadTrackingTableProps`: `onStopSequence?(lead, reason)`, `onRemoveLead?(lead)`, `pendingLeadEmail?` (trigger desabilitado + `Loader2` na linha pendente) — a tabela EMITE; os `AlertDialog`s vivem no container. Novo `src/components/tracking/SequenceActionDialogs.tsx`: `StopSequenceDialog` (radio de motivos, compartilhado com o card da Task 7) + `RemoveLeadDialog` destrutivo (padrão `DeleteLeadsDialog`: `bg-destructive`, `e.preventDefault()` antes do await, `Loader2`; aviso explícito do AC#3).
  - [x] 6.4 Papel no client: `useUser()` (padrão Sidebar — capacidade CONFIRMADA: `!isProfileLoading && isAdmin`) esconde "Remover do Instantly" de não-admin; a rota barra 403 de qualquer forma (defesa em profundidade). Testado também o estado perfil-carregando.
  - [x] 6.5 Wiring no container `analytics/page.tsx`: estado dos dialogs (`stopTarget`/`stopReason`/`removeTarget`) + `useLeadSequenceAction(campaignId)` + `onSettled` fecha o dialog + `pendingLeadEmail` derivado de `isPending`.
  - [x] 6.6 Testes: coluna labels/"—" (+3), menu emite motivos/remove (+5), skeleton 11/12 células (+2), dialogs (9 no arquivo novo), wiring da página (menu→dialog→mutate, gating por papel ×2, campaignId no hook — +5 em CampaignAnalyticsPage.test).

- [x] **Task 7: UI — `OpportunityCard` atalho "Parar sequência" (AC: #6)**
  - [x] 7.1 Botão no bloco de ações de contato (`Ban` + ghost): `e.stopPropagation()`, `disabled` via prop `sequenceActionPending`, renderizado APENAS quando `onStopSequence` presente E `opportunity.campaignId` truthy E `lead.email` disponível (e-mail já vem no lead embed — `OpportunityLeadData.email`). Nota: `opportunities.campaign_id` é NOT NULL no schema (00055:29) — o guard é defensivo contra dado degradado, conforme o AC.
  - [x] 7.2 Reusa o MESMO `StopSequenceDialog` (com radio de motivos) levantado para o `OpportunitiesPageContent` (padrão dos dialogs de WhatsApp da 21.5) + `useLeadSequenceAction(sequenceStopTarget?.campaignId ?? "")` — o hook é instanciado com o campaignId da OPORTUNIDADE alvo (cards podem vir de campanhas diferentes).
  - [x] 7.3 Testes: render condicional (sem campaignId/sem e-mail/sem handler → sem botão), stopPropagation (não dispara new→viewed), disabled pendente (+6 no OpportunityCard.test); fluxo card→dialog→confirmar→mutate + campaignId do alvo no hook (+2 no OpportunitiesPageContent.test).

- [x] **Task 8: Validação**
  - [x] 8.1 `npx tsc --noEmit` (0 erros em `src/`; 0 erros nos arquivos da story — os restantes em `__tests__` são pré-existentes); `npx eslint <22 arquivos tocados> --max-warnings=0` limpo (3 warnings PRÉ-existentes corrigidos nos arquivos tocados: 2 non-null assertion em LeadTrackingTable.tsx:330 + 1 unused var em instantly.test.ts — pre-commit linta o arquivo inteiro); `npx vitest run` verde: **395 files / 6778 pass / 2 skip / 0 fail** (baseline 391/6687 → +91 testes, 0 regressões); `npm run build` verde (rota `/api/campaigns/[campaignId]/leads/sequence-actions` registrada no manifest).
  - [ ] 8.2 **Validação manual pós-implementação (Fabossi ou dev com key real)** — a suíte mockada NÃO prova a semântica externa [memória do projeto]: repetir o smoke test PELO APP (lead cobaia `fabotse+teste@gmail.com` na campanha de teste): parar → conferir status 3 no Instantly; remover → sumir da tabela no refetch. ⚠️ PENDENTE — ação operacional do Fabossi (exige a key real + 00062 aplicada).

## Dev Notes

Gap de produto: o `stop_on_reply: true` (setado na criação da campanha — `instantly.ts:208`) cobre só resposta por e-mail. Cenário real do cliente: lead vê o e-mail e responde no **WhatsApp** → Instantly não sabe → follow-ups continuam (constrangimento com lead já engajado). A story dá o controle manual nas duas superfícies onde o usuário trabalha: a tabela do Analytics (única visão com TODOS os leads da campanha) e o card de oportunidade (onde o cenário WhatsApp aparece naturalmente via engajamento 21.6).

### Semântica Instantly (validada em produção real, 2026-07-16)

| Ação | Endpoint | Efeito observado |
|---|---|---|
| Parar sequência | `POST /api/v2/leads/update-interest-status` `{campaign_id, lead_email, interest_value}` | **202** background job; em segundos `status` 1→**3** (Concluída) e `lt_interest_status` gravado. Histórico/analytics preservados |
| Remover lead | `DELETE /api/v2/leads/{leadId}` | **200** (retorna o lead); GET posterior 404. Perde histórico do lead no Instantly |
| Escala `interest_value` | — | `1` Interested (validado) · `-1` Not Interested (spike do épico: "Interested=1 … Not Interested=-1") · `0` = Out of Office (usado como filtro de auto-reply — `reply-processor.ts:69`) |
| Escala `status` (lead) | — | `1` ativo (baseline observado) · `3` concluído (pós-stop observado) · `2` pausado, `-1/-2/-3` bounce/unsub/skip (documentação — **conferir labels na 1ª renderização real**) |

O ciclo fecha sozinho com o Epic 21: o `lt_interest_status` que gravamos é o MESMO campo que o `reply-classifier` (ensemble 21.3) e o tracking já leem — o estado manual flui pela plataforma sem código extra.

### 🔴 Traps principais

1. **A rota de tracking DESCARTA o Instantly lead id** — `mapToLeadTracking` põe `item.id` em `leadId` (tracking.ts:158), mas a rota sobrescreve com o id LOCAL (`route.ts:163`). Por isso: o front envia **`leadEmail`**, e o `remove` resolve o id no server via `findLeadIdByEmail` (Task 1.3). NÃO passar id do Instantly pelo client.
2. **202 ≠ efeito imediato** — a UI comunica "solicitado" e confia no refetch (invalidation da Task 5.1). Não escrever verificação síncrona pós-stop na rota (custo/latência à toa; staleTime 5 min é vencido pela invalidation).
3. **Remoto primeiro, local depois** (AC7) — inverter a ordem deixa interaction/status gravados para uma ação que falhou no Instantly.
4. **`ALTER TYPE ... ADD VALUE`** precisa migration própria (00062) e `IF NOT EXISTS` (banco gerido à mão; reaplicação segura). Postgres 15 do Supabase aceita em transação.
5. **`.ilike` com escape** — o match por e-mail local reusa a lição do patch 1 da review 21.2 (escapar `%/_/\`).
6. **`opportunities.campaign_id` é nullable e sem FK** (13.11/21.4) — o botão do card só renderiza com campaignId válido; campanha dangling → a rota devolve 404 de campanha (PT-BR), o card não quebra.
7. **`search` do `leads/list` NÃO está validado para e-mail** — no smoke test a busca retornou vazio (lead ainda não estava na campanha; inconclusivo). Task 1.3 exige o fallback de paginação SEMPRE presente.
8. **Rota local existente `DELETE .../leads/[leadId]`** apaga SÓ a associação `campaign_leads` local (não toca o Instantly) — NÃO reusar nem modificar; a ação da 21.9 é outra rota com outra semântica. Não confundir o usuário: o menu novo fala do INSTANTLY.

### Reuso obrigatório (não reinventar)

- HTTP Instantly: `this.request` + `buildAuthHeaders` + constantes de endpoint [instantly.ts:48-100].
- API key em rota: `getApiKey(supabase, tenantId, "instantly")` [monitoring-processor.ts:136-155].
- Auth/erros/UUID/`ExternalServiceError`: espelhar a rota de tracking [.../leads/tracking/route.ts:17-80,172-184].
- Match de lead local por e-mail: `matchLeadId` [reply-processor.ts:128-148] (reusar/extrair — não duplicar a lógica de escape).
- Promote-only de status do lead: guarda da 21.3 (`INTENT_TO_LEAD_STATUS` + não rebaixar) [reply-classifier.ts].
- Insert de interaction: molde `logCampaignReplyInteraction` [reply-processor.ts:161-167] (com `created_by: profile.id` — aqui a ação É de um usuário).
- Dropdown por linha: `LeadTable.tsx:873-906`. Dialog destrutivo: `DeleteLeadsDialog.tsx` (inteiro). Botão de ação no card: `OpportunityCard.tsx:500-542` + `handleTriage`.
- Mutação+invalidation+toast: `useUpdateOpportunityStatus` [use-opportunities.ts:250-281]; queryKey `LEAD_TRACKING_QUERY_KEY` [use-lead-tracking.ts:19].
- Admin gate: `hasAdminAccess(profile.role)` [capabilities.ts:21] — NUNCA `role === X` inline.
- Testes: `createMockFetch` [__tests__/helpers/mock-fetch.ts] p/ service; mocks de tenant/server/chainBuilder [__tests__/unit/api/instantly-leads.test.ts] p/ rota.
- Tailwind v4: `flex flex-col gap-*`, nunca `space-y-*` [memória do projeto].

### Anti-Patterns a evitar

1. **NÃO** deletar `leads`/`campaign_leads` locais no remove — só o Instantly (histórico local é ativo do cliente).
2. **NÃO** gravar efeito local antes do sucesso remoto (AC7).
3. **NÃO** passar o Instantly lead id pelo client — resolver por e-mail no server.
4. **NÃO** usar Server Action — API route (padrão do projeto p/ integração externa + TanStack Query).
5. **NÃO** modificar a rota `DELETE .../leads/[leadId]` existente nem o pipeline de ingestão (reply-sweep/processor/classifier/notification) — intocados.
6. **NÃO** rebaixar status local de lead (`oportunidade` fica) — promote-only no motivo "respondeu outro canal".
7. **NÃO** esconder a falha remota atrás de toast genérico — superficializar `userMessage` PT-BR.
8. **NÃO** `process.env.X!` (pre-commit `--max-warnings=0` linta o arquivo inteiro).
9. **NÃO** duplicar `INSTANTLY_CAMPAIGN_STATUS_LABELS` — a escala de LEAD é outra constante (Task 1.5).

### Previous Story Intelligence (21.7, 21.5, 21.2)

- **21.7 (DONE, review 3 camadas):** CAS claim-first e fail-open são o padrão da casa para efeitos concorrentes — aqui não há passe concorrente (ação é user-driven), mas a ordem remoto→local cumpre o mesmo princípio. PII fora de log (patch 21.7): não logar e-mail/telefone em warn/error da rota nova além do necessário.
- **21.5 (DONE):** validação visual contra banco real pegou o que 6.6k testes mockados não pegam — repetir a disciplina (Task 8.2). Padrão de dialogs levantados p/ o PageContent e `stopPropagation` em toda ação de card. RLS admin-gated em `api_configs` exige atenção: a rota nova usa client de sessão + `getApiKey`; `api_configs` tem RLS `is_admin()` — **se o SDR precisar do `stop` (AC1), a leitura da key deve usar o client admin (service-role), como o patch 4 da review 21.5 fez nas rotas de sugestão** [lição central: SDR + api_configs = 403 silencioso]. Implementar a leitura da key com o MESMO padrão da rota de sugestão da 21.5 (client admin), não com o client de sessão.
- **21.2 (DONE):** escape de `.ilike`; cap de paginação com warning; `ExternalServiceError` com `userMessage`.

### Git Intelligence

- Branch: `epic/21-loop-de-resposta` (commitar na branch do épico, padrão das stories 21.x).
- `adb11c5` (HEAD) docs recap 21 · `d4c0a77` 21.7 + patches · `1eb0c1f` 21.5. Working tree tem 00061 (cron timeout) untracked — a migration nova é **00062**.

### Project Structure Notes

**Novos:**
- `supabase/migrations/00062_add_sequence_interaction_types.sql`
- `src/app/api/campaigns/[campaignId]/leads/sequence-actions/route.ts`
- `src/hooks/use-lead-sequence-action.ts`
- Testes correspondentes (`__tests__/unit/...`).

**Modificados:**
- `src/lib/services/instantly.ts` (+3 métodos, +2 constantes)
- `src/lib/services/tracking.ts` (+`sequenceStatus` no map)
- `src/types/tracking.ts` (+`sequenceStatus?` em `LeadTracking`)
- `src/components/tracking/LeadTrackingTable.tsx` (+coluna Sequência, +coluna ações, +props)
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` (wiring dialogs + hook)
- `src/components/opportunities/OpportunityCard.tsx` (+botão condicional) e `OpportunitiesPageContent` (dialog levantado)
- Testes existentes de tracking/instantly/card estendidos.

**Intocados (garantir):** rota `DELETE .../leads/[leadId]` local; pipeline de ingestão (reply-sweep/processor/classifier/engagement/notification); receiver do webhook; `TrackingService.getLeadTracking` (só o map ganha 1 campo).

### Latest Tech Information

- Instantly API v2 (docs: developer.instantly.ai): `POST /api/v2/leads/update-interest-status` (body `lead_email`, `campaign_id`, `interest_value`; certos valores marcam a sequência como Completed — comportamento confirmado ao vivo); `DELETE /api/v2/leads/{id}`; `POST /api/v2/leads/list` (body `campaign`, `search`, `limit`, `starting_after`). Auth Bearer. Cloudflare bloqueia User-Agent de urllib — irrelevante server-side (fetch do Node), relevante só p/ scripts de debug.
- Blocklist (`POST /api/v2/block-lists-entries`) existe para opt-out workspace-wide — **fora do escopo** desta story (ver OQ2).

## Project Context Reference

- Epic: [epic-21-loop-de-resposta.md](../planning-artifacts/epic-21-loop-de-resposta.md) — Story 21.9 / FR18 (adicionados 2026-07-16).
- Smoke test: registrado no preâmbulo desta story (executado via curl com a key real, 2026-07-16).
- Memórias relevantes: mocks não provam semântica externa (validação manual obrigatória — Task 8.2); pre-commit eslint `--max-warnings=0`; Tailwind v4 `flex gap`.

## Open Questions (para Fabossi — não bloqueiam o dev; defaults assumidos)

1. **Papel do `stop`:** default assumido — **qualquer papel** (SDR incluído; é ferramenta de trabalho, consistente com a Central 21.4). `remove` = admin-only. Alternativa: tudo admin-only.
2. **"Não contactar" também adiciona à blocklist do workspace?** Default: **NÃO** (só para a campanha; blocklist é opt-out global e merece decisão à parte — candidata a extensão futura).
3. **Coluna Sequência ordenável?** Default: **não** na v1 (menos código; filtro/ordenação seguem pelas colunas atuais).

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Fable 5) — dev-story 2026-07-16.

### Debug Log References

- **202 do Instantly**: verificado que `base-service.ts` usa `response.ok` (cobre todo 2xx) — o 202 do `update-interest-status` é sucesso sem nenhum ajuste (Task 1.2 fechada só com verificação).
- **Fallback de paginação do lookup**: o fast-path `search` é SEMPRE re-verificado client-side por e-mail normalizado (trim+lowercase) — mesmo que o `search` case por e-mail um dia, nunca confiamos no match do servidor; cap de 50 páginas com `console.warn` (padrão sweep 21.2).
- **ACHADO COLATERAL (sem ação, para registro)**: o union TS `interactionTypeValues` contém `whatsapp_sent` desde a 11.7, mas NENHUMA migration adicionou esse valor ao enum `interaction_type` do Postgres (00013 tem só os 5 originais). Hoje é inofensivo — `whatsapp_sent` só aparece em rendering (LeadDetailPanel) e nenhum insert em runtime o usa — mas se alguém um dia inserir uma interaction com esse type, quebra 22P02 em silêncio (mesma classe do ponto cego sistêmico do épico). Fora do escopo da 21.9; candidato a linha extra na 00062 ou migration própria, decisão do Fabossi.
- **`opportunities.campaign_id` é NOT NULL** (00055:29), então `OpportunityCardData.campaignId: string` — o guard do AC6 no card ("não renderiza quando campaign_id é null") foi implementado como truthiness defensiva contra dado degradado do runtime; nos testes o cenário null é simulado com cast explícito documentado.
- **Warnings pré-existentes corrigidos** (pre-commit linta o arquivo inteiro com `--max-warnings=0`): LeadTrackingTable.tsx:330 (2× non-null assertion no sort → narrowing por destructuring) e instantly.test.ts:813 (unused `result`).
- **OpportunitiesPageContent.test**: o hook novo chama `useQueryClient()` e vários testes renderizam sem provider → mock do `useLeadSequenceAction` no teste do container (mesmo precedente da 21.4: AppShell/Sidebar.test ganharam mock do hook novo).

### Completion Notes List

- **Task 1** — 3 métodos novos no `InstantlyService` (`updateLeadInterestStatus`, `findLeadIdByEmail` com fast-path search + fallback de paginação obrigatório, `deleteLead`) + `INSTANTLY_LEAD_STATUS_LABELS` (escala de LEAD, separada da de campanha). +15 testes (RED provado: 15 falhas antes do GREEN).
- **Task 2** — `sequenceStatus` mapeado em `mapToLeadTracking` (o `item.status` era lido da API e descartado desde a 10.3) + tipo em `LeadTracking`. +3 testes.
- **Task 3** — migration 00062 idempotente (`ADD VALUE IF NOT EXISTS` ×2 + COMMENT) + union TS estendido + novo teste de tipos (5). **OPERACIONAL Fabossi: aplicar 00062 no banco do cliente antes/junto do deploy** — sem ela, o insert das interactions falha 22P02 (a rota degrada para `localSynced: false` sem quebrar a ação remota, por design).
- **Task 4** — rota `POST .../leads/sequence-actions`: Zod com refine (reason obrigatório no stop), `remove` admin-only (403), `stop` para qualquer papel, key do Instantly lida com CLIENT ADMIN (lição patch 4 review 21.5 — RLS `is_admin()` em `api_configs` mataria o stop do SDR em silêncio), ordem REMOTO→LOCAL com fail-safe (AC7), reuso real de `matchLeadId` (escape ILIKE 21.2) e `resolveLeadStatusTransition` (promote-only 21.3), `localSynced: false` quando lead local não existe OU insert da interaction falha. 27 testes (inclui regressão de QUAL client lê a key e prova de ordem por `invocationCallOrder`).
- **Task 5** — hook `useLeadSequenceAction` (mutation + toasts PT-BR + invalidation de `LEAD_TRACKING_QUERY_KEY`) exportando `SEQUENCE_STOP_REASON_LABELS` como fonte única dos labels. 6 testes.
- **Task 6** — coluna "Sequência" (badge PT-BR, "—" para ausente/desconhecido, não-ordenável por default da OQ3) + menu ⋮ por linha (2 motivos de stop + remove destrutivo gated por papel via `useUser` padrão Sidebar) + dialogs novos `StopSequenceDialog` (radio de motivos, COMPARTILHADO com o card) e `RemoveLeadDialog` (aviso explícito do AC3) + wiring completo na analytics page (estado pendente por linha, `onSettled` fecha dialog). +24 testes (tabela/dialogs/página).
- **Task 7** — atalho "Parar sequência" no `OpportunityCard` (render condicional a campaignId + e-mail do lead + handler; `stopPropagation` provado contra o new→viewed) + dialog reusado no `OpportunitiesPageContent` com o hook instanciado pelo campaignId da oportunidade alvo. +8 testes.
- **Task 8** — tsc 0 em src/; eslint `--max-warnings=0` limpo nos 22 arquivos tocados; vitest **395 files / 6778 pass / 2 skip / 0 fail** (+91 testes vs baseline, 0 regressões); build verde com a rota nova registrada. **PENDENTE OPERACIONAL (Fabossi): 8.2 — smoke test pelo app com a key real** (parar → status 3 no Instantly; remover → some no refetch), além de aplicar a 00062 (3.2).
- **Defaults das 3 OQs aplicados**: (1) `stop` para qualquer papel / `remove` admin-only; (2) SEM blocklist na v1; (3) coluna Sequência não-ordenável.
- **Intocados (garantido)**: rota local `DELETE .../leads/[leadId]`, pipeline de ingestão (reply-sweep/processor/classifier/engagement/notification), webhook receiver, `TrackingService.getLeadTracking` (só o map ganhou 1 campo).

### File List

**Novos:**
- `supabase/migrations/00062_add_sequence_interaction_types.sql`
- `src/app/api/campaigns/[campaignId]/leads/sequence-actions/route.ts`
- `src/hooks/use-lead-sequence-action.ts`
- `src/components/tracking/SequenceActionDialogs.tsx`
- `__tests__/unit/api/sequence-actions.test.ts`
- `__tests__/unit/hooks/use-lead-sequence-action.test.ts`
- `__tests__/unit/types/interaction.test.ts`
- `__tests__/unit/components/tracking/SequenceActionDialogs.test.tsx`

**Modificados:**
- `src/lib/services/instantly.ts` (+3 métodos, +5 constantes incl. labels)
- `src/lib/services/tracking.ts` (+`sequenceStatus` no map)
- `src/types/instantly.ts` (+params/results/response dos métodos novos)
- `src/types/tracking.ts` (+`sequenceStatus?` em `LeadTracking`)
- `src/types/interaction.ts` (+`sequence_stopped`/`lead_removed` no union)
- `src/components/tracking/LeadTrackingTable.tsx` (+coluna Sequência, +coluna ações, +3 props; fix lint pré-existente no sort)
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` (wiring dialogs + hook + useUser)
- `src/components/opportunities/OpportunityCard.tsx` (+botão condicional Parar sequência, +2 props)
- `src/components/opportunities/OpportunitiesPageContent.tsx` (dialog levantado + hook por oportunidade alvo)
- `__tests__/unit/lib/services/instantly.test.ts` (+15 testes; fix unused var pré-existente)
- `__tests__/unit/lib/services/tracking.test.ts` (+3 testes)
- `__tests__/unit/components/tracking/LeadTrackingTable.test.tsx` (+10 testes; 2 existentes ajustados p/ coluna nova)
- `__tests__/unit/components/tracking/CampaignAnalyticsPage.test.tsx` (+5 testes de wiring; mocks dos hooks novos)
- `__tests__/unit/components/opportunities/OpportunityCard.test.tsx` (+6 testes)
- `__tests__/unit/components/opportunities/OpportunitiesPageContent.test.tsx` (+2 testes; mock do hook novo)

## Change Log

- 2026-07-17: **Ajuste de UX pós-review (validação visual do Fabossi na tela).** O menu ⋮ da `LeadTrackingTable` renderizava "Parar sequência" como `DropdownMenuLabel` (cabeçalho **não-clicável**, com os 2 motivos como itens abaixo) — na tela lia como "ação desabilitada" (dava pra selecionar o texto). Trocado por um **item único clicável "Parar sequência"** (ícone `Ban`) que abre o `StopSequenceDialog`; o motivo passou a ser escolhido no **radio do dialog** (que já existia), eliminando a redundância e ficando consistente com o atalho do `OpportunityCard` (que já era botão único). NÃO era bug — era a decisão de design da Task 6.2; backend e fluxo inalterados. Testes: 2 testes de menu da `LeadTrackingTable` colapsados em 1 (item único emite o motivo default) + novo e2e na `CampaignAnalyticsPage` (trocar o radio → `mutate` com `do_not_contact`), preservando a cobertura do motivo. Suíte 395/6778/0 fail; eslint limpo; tsc sem erro novo.

- 2026-07-17: **Code review (bmad-code-review, 3 camadas, modo full) — status → done.** Acceptance Auditor 8/8 ACs SATISFEITOS, 0 HIGH. 1 decision-needed (falha silenciosa do audit local vs. drift da 00062) resolvida pelo Fabossi como fail-loud mínimo (`warn`→`error` no INSERT de auditoria falho com lead existente). 4 patches aplicados: **P1** `findLeadIdByEmail` lança erro distinto no teto de paginação (não devolve `null` → a rota deixa de dizer "pode já ter sido removido" para um lead ainda ativo); **P2** parse defensivo do JSON no hook (não vaza `SyntaxError` em inglês em 5xx/HTML); **P3** throttle `RATE_LIMIT_DELAY_MS` entre páginas (padrão dos métodos irmãos); **P4** log de auditoria falho em `error` (drift da 00062 não passa silencioso). 3 defers → `deferred-work.md`; 7 dismiss. Validação pós-patch: vitest **395 files / 6778 pass / 2 skip / 0 fail** (0 regressão), eslint `--max-warnings=0` limpo, tsc sem erro novo (os 5 TS2769 em `instantly.test.ts` são pré-existentes em helpers antigos, padrão `(c: [string])`). Testes ajustados aos patches: teste do teto de paginação agora espera throw + fake timers; "finds on page 2" migrado p/ fake timers + `runAllTimersAsync` (o throttle novo usa `setTimeout`). **OPERACIONAL Fabossi mantido:** aplicar 00062 no banco + smoke test pelo app com key real.

- 2026-07-16: **Story 21.9 implementada (dev-story) — status → review.** 8 tasks (3.2 e 8.2 = operacionais Fabossi, pendentes e sinalizadas). Controle manual de sequência entregue nas 2 superfícies: LeadTrackingTable (coluna Sequência + menu ⋮ com stop/remove) e OpportunityCard (atalho Parar sequência). Backend: 3 métodos novos no InstantlyService + rota sequence-actions (remoto→local fail-safe, stop qualquer papel/remove admin, key via client ADMIN) + migration 00062 + union TS. Reuso real: matchLeadId (21.2), resolveLeadStatusTransition (21.3), getApiKey/createAdminClient (21.5), padrões LeadTable/DeleteLeadsDialog/useUpdateOpportunityStatus. +91 testes (RED-GREEN por task); suíte 395/6778/0 fail; tsc/eslint/build verdes. Achado colateral registrado: `whatsapp_sent` no union TS sem valor correspondente no enum do Postgres (dormant, decisão do Fabossi).

- 2026-07-16: Story 21.9 criada (create-story) — Controle Manual de Sequência por Lead (FR18, pós-planning, demanda direta do cliente: lead respondeu por WhatsApp segue recebendo follow-up). Smoke test real EXECUTADO antes da story (update-interest-status 202 → status 1→3; DELETE 200→404) — risco de plano/scope eliminado. Escopo: 3 métodos novos no InstantlyService + rota `sequence-actions` (stop por interest_value 1/-1 + remove por delete com lookup por e-mail server-side; remoto→local; remove admin-only) + migration 00062 (enum interaction_type +sequence_stopped/+lead_removed) + coluna "Sequência" (item.status hoje descartado no map) + menu ⋮ na LeadTrackingTable + atalho no OpportunityCard (condicional a campaign_id não-null). Traps mapeados: rota de tracking descarta o Instantly lead id (linha 163); 202 assíncrono; leitura de api_configs com client ADMIN (lição patch 4 da review 21.5 — SDR + RLS is_admin); `search` do leads/list não validado (fallback paginação obrigatório). 3 OQs com defaults. Status: ready-for-dev.

## Review Findings

### Review Findings (bmad-code-review — 2026-07-17)

> Review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo **full**. **Acceptance Auditor: 8/8 ACs SATISFEITOS, 0 violação.** Nenhum bug HIGH — auth (401), admin-gate do remove (403), tenant-scoping, ordem remoto→local (AC7), promote-only, PII fora de log e leitura da key via client ADMIN verificados **corretos** pelas 3 camadas, lendo o código-fonte (não só o hunk). Triagem: **1 decision-needed, 3 patch, 3 defer, 7 dismiss**.
>
> **Atualização 2026-07-17 (aplicação):** decision-needed resolvido pelo Fabossi como *fail-loud mínimo* (`warn`→`error` no INSERT de auditoria falho com lead existente) e os **4 patches aplicados + validados** — suíte 395/6778/0 fail, eslint limpo, tsc sem erro novo. Os 3 defers permanecem registrados no `deferred-work.md`.

**Decision-needed:**

- [x] [Review][Decision] Falha silenciosa do audit local vs. drift de migration — quando a ação remota do Instantly SUCEDE mas o INSERT em `lead_interactions` falha (notadamente 22P02 se a 00062 não estiver aplicada em prod), a rota loga `console.warn`, ainda roda a transição de status, devolve `{success:true, localSynced:false}` e o hook IGNORA `localSynced`: o usuário é informado que deu tudo certo enquanto a linha de auditoria (`sequence_stopped`/`lead_removed`) é descartada em silêncio. É by-design p/ "lead não existe localmente" (correto e testado), mas mascara o drift de schema — mesma classe que queimou o Epic 21 duas vezes (00058/00059). Escolha: manter degrade silencioso vs. fail-loud (warn→error no caso anômalo + sinal distinto). [route.ts:283-297](../../src/app/api/campaigns/[campaignId]/leads/sequence-actions/route.ts#L283-L297) + [use-lead-sequence-action.ts:77-86](../../src/hooks/use-lead-sequence-action.ts#L77-L86) — MEDIUM.

**Patch:**

- [x] [Review][Patch] `findLeadIdByEmail` reporta teto de páginas (cursor remanescente após 50 págs) como "não encontrado" → rota devolve 404 "pode já ter sido removido" para um lead que ainda está no Instantly (e ainda recebendo follow-up) [instantly.ts:611-617](../../src/lib/services/instantly.ts#L611-L617) — LOW
- [x] [Review][Patch] Hook faz `await response.json()` antes de checar `response.ok` → em resposta não-JSON (5xx/HTML de gateway) estoura `SyntaxError` em inglês no toast em vez de mensagem PT-BR [use-lead-sequence-action.ts:60-64](../../src/hooks/use-lead-sequence-action.ts#L60-L64) — LOW
- [x] [Review][Patch] Paginação do `findLeadIdByEmail` sem throttle entre páginas — os métodos irmãos do mesmo arquivo usam `await delay(RATE_LIMIT_DELAY_MS)` (ex. addAccountsToCampaign:322-324); 50 POSTs rápidos podem levar 429 no meio da varredura [instantly.ts:591-609](../../src/lib/services/instantly.ts#L591-L609) — LOW

**Defer:**

- [x] [Review][Defer] base-service `request()` faz `response.json()` para todo 2xx → corpo 2xx vazio/não-JSON (204 no DELETE / 202 sem corpo) viraria 500 após a ação remota já ter sucedido [base-service.ts:262](../../src/lib/services/base-service.ts#L262) — deferred, pré-existente (infra compartilhada; o smoke test 2026-07-16 confirma que `update-interest-status` e `DELETE /leads/{id}` retornam corpo JSON hoje, então não dispara no comportamento validado)
- [x] [Review][Defer] `matchLeadId` só escopa por tenant (`.limit(1)`, sem ORDER BY) e `leads` não tem UNIQUE(tenant,email) → efeitos locais (interaction + status) podem cair em linha arbitrária de mesmo e-mail [route.ts:280,322](../../src/app/api/campaigns/[campaignId]/leads/sequence-actions/route.ts#L280) / [reply-processor.ts:128-148](../../src/lib/utils/reply-processor.ts#L128-L148) — deferred, pré-existente (helper reusado, também no pipeline de reply/engagement; mesmo e-mail = mesma pessoa)
- [x] [Review][Defer] Drift de enum: `whatsapp_sent` no union TS `interactionTypeValues` desde a 11.7 sem valor correspondente no enum `interaction_type` do Postgres → insert futuro 22P02 [types/interaction.ts](../../src/types/interaction.ts) — deferred, fora do escopo da 21.9 (já registrado no Debug Log da story; mesma classe do decision-needed; candidato a linha extra numa migration futura)

**Dismissed (7):** paginação encerra em `next_starting_after` ausente (consumo correto de cursor); "não contactar" per-campanha vs. blocklist global (resolvido pela OQ2 — default sem blocklist); `deleteLead` 404 entre lookup e delete (raro; lead sumiu = intenção do usuário); double-submit concorrente → interaction duplicada (tolerável p/ ação manual); `updateLeadInterestStatus` sempre `accepted:true` (semântica correta de job assíncrono, validada no smoke test); `pendingLeadEmail`/testid por e-mail (e-mail é único por campanha — já é a key do React); AC2 headline "vira nao_interessado" vs. guarda promote-only que preserva `oportunidade` (by-design, Task 4.5).
