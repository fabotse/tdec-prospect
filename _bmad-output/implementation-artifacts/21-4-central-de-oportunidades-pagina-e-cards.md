---
baseline_commit: 099532c
---
# Story 21.4: Central de Oportunidades — Página e Cards

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Sequência do épico (revisada 2026-07-13):** 21.1 → 21.2 → 21.6 → 21.3 → **21.4** → 21.5 → 21.7. As quatro anteriores estão `done`. Esta é a **PRIMEIRA STORY VISUAL** do épico: renderiza as `opportunities` (já ingeridas pela 21.2, classificadas pela 21.3, e as de engajamento pela 21.6) numa **Central de Oportunidades** cross-campanha. Escopo desta story = **página + sidebar + badge + cards + filtros + estados + transição `new→viewed`**. As **ações do card** (WhatsApp, telefone, mailto, rascunho IA, marcar reunião/descartar) são a **21.5** — NÃO implementar aqui.
>
> **⚠️ PÓS-DEPLOY:** o deploy Vercel do Epic 21 foi adiado até esta story. Ao concluir + deployar, rodar `_bmad-output/implementation-artifacts/epic-21-post-deploy-checklist.md` (confirmar loop do cron em prod + secret `REPLIES_CRON_SECRET` idêntico Vercel↔Supabase Edge). O backfill JÁ rodou contra prod — o histórico já está no banco, então a Central terá dados reais assim que deployada.

## Story

As a usuário,
I want ver todas as oportunidades (respostas classificadas + leads de alto engajamento) em uma central única,
so that eu tenha um lugar só onde entrar para agir sobre leads quentes, sem navegar campanha por campanha.

## Acceptance Criteria

1. **Given** o app **When** navego **Then** existe item **"Oportunidades"** na sidebar com badge de contagem de oportunidades `status='new'` (mesmo padrão do badge de Insights) **And** rota `/opportunities` no grupo `(dashboard)` **And** o item é visível para **todos os papéis** (sem `adminOnly` — SDR usa a Central como ferramenta de trabalho, AC7).

2. **Given** a página **Then** lista **cards ordenados por recência** com: nome do lead (`first_name last_name`), empresa (`company_name`), cargo (`title`), campanha de origem (nome), badge de `intent` **com cores distintas por intenção**, trecho da resposta (`reply_text`) **expansível para o texto completo**, engajamento (aberturas/cliques — `open_count`/`click_count`), telefone se disponível (`leads.phone`), e link **"Abrir no Unibox"** (`unibox_url`) quando presente.

3. **Given** o lead da oportunidade é monitorado (Epic 13, `leads.is_monitored`) e tem um insight recente em `lead_insights` **Then** o card exibe o insight do LinkedIn (`suggestion` + `relevance_reasoning`, link do post) como contexto adicional.

4. **Given** filtros **Then** posso filtrar por `intent`, `status` (do card), campanha e período **And** a busca por nome/e-mail/empresa funciona (client-side sobre os dados enriquecidos ou via query param — ver Dev Notes).

5. **Given** abro um card `status='new'` **Then** o status muda para `viewed` (uma vez) **And** o badge da sidebar decrementa (invalidação da query de contagem).

6. **Given** não há oportunidades **Then** estado vazio orienta ("Quando um lead responder, ele aparece aqui") — com copy distinta quando há filtros ativos ("Nenhuma oportunidade com esses filtros") **And** loading usa **skeleton** e há **estado de erro** no padrão dos componentes de tracking (UX-DR2).

7. **Given** os papéis do Epic 20 **Then** o SDR vê a Central normalmente (sem `adminOnly`) **And** nenhuma rota nova vaza dados cross-tenant: a API filtra por `tenant_id` (RLS de `opportunities` já ativa — 00055) e a página não expõe IDs de outros tenants.

8. **Given** os componentes e rotas **Then** testes unitários cobrem: card (incluindo degradações: `intent` null, `lead_id` null, `source='engagement'`, sem `unibox_url`), filtros, badge de contagem, e as API routes (GET lista, GET new-count, PATCH status) — auth, tenant-scope, filtros, paginação, 401/404.

## Tasks / Subtasks

- [x] **Task 1: Config de apresentação de `intent` (labels + cores) (AC: #2)**
  - [x] 1.1 Em `src/types/opportunity.ts` (arquivo DONE 21.1/21.6 — **mudança 100% ADITIVA**, só novos exports, NÃO alterar nada existente), adicionar o mapa de apresentação de intent **espelhando o padrão de `src/types/lead.ts`** (`leadStatusVariants` [lead.ts:56-62] + `LEAD_STATUSES` config [78-84] + `getStatusConfig()` [91-100]). Criar: `export const OPPORTUNITY_INTENT_CONFIG: Record<OpportunityIntent, { label: string; badgeClasses: string }>` com label pt-BR e classes de cor distintas por intenção (ver Dev Notes "Cores de intent"). Adicionar `export function getIntentConfig(intent: OpportunityIntent | null)` que retorna um fallback neutro ("Não classificado", classes muted) quando `intent` é null (AC2 + robustez: a 21.3 fail-open deixa `intent` null; ver Dev Notes "Degradações obrigatórias do card").
  - [x] 1.2 Adicionar também `export const OPPORTUNITY_STATUS_CONFIG: Record<OpportunityStatus, { label: string }>` (labels pt-BR: `new`→"Nova", `viewed`→"Vista", `contacted`→"Contatada", `meeting_booked`→"Reunião marcada", `discarded`→"Descartada") para os filtros/exibição de status. Fonte de verdade única (evita literais espalhados).

- [x] **Task 2: DTO enriquecido do card + API GET lista (AC: #2, #3, #4, #7)**
  - [x] 2.1 Criar `src/app/api/opportunities/route.ts` (GET) **espelhando `src/app/api/insights/route.ts`**: auth via `getCurrentUserProfile()` [tenant.ts:17-33] → `if (!profile) return 401`; `const supabase = await createClient()` [@/lib/supabase/server]; parse de `request.nextUrl.searchParams`.
  - [x] 2.2 Query base em `opportunities` com **LEFT embed de leads** (⚠️ `lead:leads ( id, first_name, last_name, email, company_name, title, phone, photo_url, is_monitored, linkedin_url )`) — **NÃO usar `leads!inner`**: `lead_id` é nullable (00055:28, ON DELETE SET NULL; 21.2 AC5 cria oportunidade sem lead) e `!inner` dropa silenciosamente esses cards. `.select("*, lead:leads(...)", { count: "exact" }).eq("tenant_id", profile.tenant_id)`.
  - [x] 2.3 Filtros (params opcionais, só aplicar se presentes): `intent` (CSV → `.in("intent", [...])`), `status` (CSV → `.in("status", [...])`), `campaign_id` (→ `.eq("campaign_id", ...)`), `period` (mapear p/ `.gte("created_at", cutoffISO)` — espelhar o mapeamento de período do insights route). Ordenação: `.order("created_at", { ascending: false })`. Paginação: `page` (`Math.max(1, parseInt)`), `per_page` (default 25, `Math.min(100, Math.max(1, ...))`), `.range(from, to)`.
  - [x] 2.4 **Nome da campanha (sem FK — join manual):** `opportunities.campaign_id` NÃO tem FK (00055:29, espelha `campaign_events`) → PostgREST não auto-embeda `campaigns`. Coletar os `campaign_id` distintos da página e buscar `supabase.from("campaigns").select("id, name").in("id", [...]).eq("tenant_id", ...)`, montar `Map<campaignId, name>` (espelha o padrão de Map do tracking route `.../tracking/route.ts:90-112`). Campanha ausente no Map → `campaignName: null` (tratar "campanha desconhecida", como o resto do épico).
  - [x] 2.5 **Insight do LinkedIn (AC3):** para os `lead_id` não-nulos **e monitorados** (`lead.is_monitored`), buscar o insight **mais recente** por lead: `supabase.from("lead_insights").select("lead_id, suggestion, relevance_reasoning, post_url, post_text, post_published_at, created_at").in("lead_id", monitoredLeadIds).eq("tenant_id", ...).order("created_at", { ascending: false })`, reduzir a `Map<leadId, latestInsight>` (primeiro por lead). Anexar ao DTO só o insight mais recente. Não bloquear a resposta se essa query falhar (contexto secundário — logar e seguir com `insight: null`).
  - [x] 2.6 Transformar cada row no DTO camelCase do card: `toOpportunity(row)` [opportunity.ts:119] + sub-objetos `lead` (camelCase, null se `lead_id` null), `campaignName` (do Map), `insight` (do Map, null se não monitorado/sem insight). Definir a interface do DTO (`OpportunityCardData`) em `src/hooks/use-opportunities.ts` (espelha `InsightWithLead`/`InsightLeadData` [use-lead-insights.ts:23-48]). **Resposta:** `{ data: OpportunityCardData[], meta: { total, page, limit: perPage, totalPages } }`. Erro: envelope `{ error: { code: "INTERNAL_ERROR", message } }` status 500 (convenção do insights route — casa com o parse de erro do hook).

- [x] **Task 3: API GET new-count + PATCH status (AC: #1, #5)**
  - [x] 3.1 Criar `src/app/api/opportunities/new-count/route.ts` (GET) **espelhando `src/app/api/insights/new-count/route.ts:1-35`**: `getCurrentUserProfile()` → 401; `supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("tenant_id", profile.tenant_id).eq("status", "new")`. Retornar `{ data: { count } }`.
  - [x] 3.2 Criar `src/app/api/opportunities/[opportunityId]/route.ts` (PATCH) **espelhando `src/app/api/insights/[insightId]/route.ts:13-71`**: auth → 401; parse JSON body com try/catch → 400; **validar `status` com `isValidOpportunityStatus`** [opportunity.ts:59] → 400 se inválido; `supabase.from("opportunities").update({ status }).eq("id", opportunityId).eq("tenant_id", profile.tenant_id).select().single()`; `PGRST116` → 404; outros erros → 500. Retornar `{ data }`. **Escopo desta story:** o PATCH só precisa suportar a transição `new→viewed` (AC5). As demais transições (`contacted`/`meeting_booked`/`discarded` + `meeting_booked_at`) são da **21.5** — a rota pode aceitar qualquer `status` válido (a validação já cobre), mas NÃO implementar aqui os efeitos colaterais da 21.5 (ex.: setar `meeting_booked_at`, atualizar status do lead). Manter mínimo: só grava `status`.

- [x] **Task 4: Hooks TanStack Query `src/hooks/use-opportunities.ts` (AC: #1, #4, #5)**
  - [x] 4.1 **`useOpportunities(filters)`** — espelhar `useLeadInsights` [use-lead-insights.ts:108-129]: `OpportunityFilters` (`intent?`, `status?`, `campaignId?`, `period?`, `search?`, `page?`, `perPage?`); `fetchOpportunities` monta `URLSearchParams` (só params presentes) → `fetch("/api/opportunities?...")`, throw `error.error?.message` em `!ok`; `queryKey: ["opportunities", filters]`, `staleTime: 2 * 60 * 1000`; retornar `{ opportunities, meta, isLoading, isFetching, error, refetch }` (erro coerido a `string | null`).
  - [x] 4.2 **`useNewOpportunitiesCount()`** — espelhar `useNewInsightsCount` [use-lead-insights.ts:161-168]: `queryKey: ["opportunities-new-count"]`, `queryFn` → `GET /api/opportunities/new-count`, `staleTime: 30_000`, `refetchInterval: 60_000`.
  - [x] 4.3 **`useUpdateOpportunityStatus()`** — espelhar `useUpdateInsightStatus` [use-lead-insights.ts:135-155]: `useMutation` com `mutationFn: ({ opportunityId, status }) => PATCH /api/opportunities/${id}`; `onSuccess` → `invalidateQueries(["opportunities"])` **E** `invalidateQueries(["opportunities-new-count"])` (AC5: badge decrementa); `onError` → `toast.error(error.message)`. Para a transição silenciosa `new→viewed` (ao abrir o card), NÃO disparar toast de sucesso (é uma ação passiva) — passar um flag ou usar uma variante sem toast; o toast de sucesso fica para as ações explícitas da 21.5.

- [x] **Task 5: Página + composição `(dashboard)/opportunities` (AC: #1, #6, #7)**
  - [x] 5.1 Criar `src/app/(dashboard)/opportunities/page.tsx` **espelhando `src/app/(dashboard)/insights/page.tsx:1-36`**: **Server Component** (exporta `metadata` — title "Oportunidades", description pt-BR); header (`<div className="flex flex-col gap-6 p-6">`, `<h1 className="text-h1 text-foreground">` + subtítulo muted); `<Suspense>` com fallback skeleton delegando a `<OpportunitiesPageContent />`.
  - [x] 5.2 Criar `src/components/opportunities/OpportunitiesPageContent.tsx` (`"use client"`) **espelhando `InsightsPageContent.tsx:1-212`**: estado de filtros via `useState` (intent, status, campaignId, period, search, page, perPage); `useOpportunities(filters)`; branches **loading** (skeleton em `<Card>`), **error** (`<Card>` destructive), **empty** (`<OpportunitiesEmptyState hasFilters={...} />`), **lista** (grid/coluna de `<OpportunityCard>`); paginação prev/next + per-page `<Select>` quando `totalPages > 1`.
  - [x] 5.3 Para o `<Select>` de campanha do filtro, buscar a lista de campanhas do tenant (reusar um hook/endpoint existente de campanhas se houver — ver Dev Notes; senão derivar as campanhas presentes nos resultados). Não criar endpoint novo de campanhas se já existir um list hook.

- [x] **Task 6: `OpportunityCard` + badge de intent + estados (AC: #2, #3, #5, #6)**
  - [x] 6.1 Criar `src/components/opportunities/OpportunityCard.tsx` **espelhando o look do `OpportunityPanel` card** [OpportunityPanel.tsx:344-468]: container `flex flex-col gap-2 p-3 rounded-md border border-primary/30 bg-primary/5` (card "quente" com acento) OU `GlassCard` [ui/glass-card.tsx] para o look Attio clicável (UX-DR1 — escolher um; recomendo `Card`/painel para consistência com tracking). Conteúdo:
    - **Cabeçalho:** nome do lead (`first_name last_name`; fallback "Lead não cadastrado" se `lead` null — ver 6.5), empresa (`company_name`), cargo (`title`), nome da campanha (`campaignName ?? "Campanha desconhecida"`).
    - **Badge de intent:** `getIntentConfig(opportunity.intent)` → `<Badge variant="outline" className={cn("border-transparent", cfg.badgeClasses)}>{cfg.label}</Badge>` (espelha `LeadStatusBadge.tsx:32-38`). `intent` null → badge "Não classificado" neutro.
    - **Badge "Alto engajamento":** quando `source === 'engagement'`, exibir badge própria (espelha "Alto Interesse" [LeadTrackingTable.tsx:366-376], `variant="outline" border-primary/50 text-primary`).
    - **Trecho da resposta:** `reply_text` truncado com toggle "ver mais/ver menos" (expansível para o texto completo — AC2). Só renderizar se `reply_text` presente (engagement não tem).
    - **Engajamento:** `open_count`/`click_count` (mostrar cliques só quando `> 0`, como [OpportunityPanel.tsx:365-376]); `formatRelativeTime(last_engagement_at)` [importar de tracking/SyncIndicator] quando presente.
    - **Telefone:** `leads.phone` se presente (só exibição — a **ação** de ligar/buscar telefone é 21.5).
    - **"Abrir no Unibox":** `<a href={unibox_url} target="_blank">` só quando `unibox_url` presente (null no caminho de polling — 21.2).
  - [x] 6.2 **Insight do LinkedIn (AC3):** quando `opportunity.insight` presente, um bloco de contexto (ícone `Lightbulb`/`Linkedin`, `suggestion`, `relevance_reasoning` como "por quê", link do `post_url`). Espelhar a densidade visual da InsightsTable/coluna "Por que?" (13.10).
  - [x] 6.3 **Transição `new→viewed` ao abrir (AC5):** ao expandir/clicar o card, se `status === 'new'`, disparar `useUpdateOpportunityStatus` (variante sem toast) **uma única vez** (guardar flag local / `useRef` para não repetir). Ver Dev Notes "Definição de 'abrir um card'".
  - [x] 6.4 Criar `src/components/opportunities/OpportunitiesEmptyState.tsx` **espelhando `InsightsEmptyState.tsx`** (variante `hasFilters`): sem filtros → "Quando um lead responder, ele aparece aqui"; com filtros → "Nenhuma oportunidade com esses filtros". `<Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">`, ícone muted, título, descrição.
  - [x] 6.5 **Degradações obrigatórias** (testar todas — ver Anti-Patterns): `intent` null; `lead` null (`lead_id` null → sem nome/empresa/cargo/telefone; mostrar identidade mínima do payload: `reply_subject` + "Lead não cadastrado"); `source='engagement'` (sem `reply_text`; mostra métricas + badge engajamento); `unibox_url`/`campaignName`/`phone`/`insight` nulos. O card **nunca** deve quebrar (sem `.map`/`.split` em null, sem `!`).

- [x] **Task 7: FilterBar `src/components/opportunities/OpportunitiesFilterBar.tsx` (AC: #4)**
  - [x] 7.1 **Espelhar `src/components/leads/MyLeadsFilterBar.tsx`** (barra inline leve — melhor match): `flex flex-wrap items-center gap-3`; input de busca com ícone `Search` + botão limpar [MyLeadsFilterBar:183-204]; multi-select de `intent` e de `status` via `DropdownMenu` + `DropdownMenuCheckboxItem` [207-235] (usar `OPPORTUNITY_INTENT_CONFIG`/`OPPORTUNITY_STATUS_CONFIG` para labels); `<Select>` de campanha [238-258]; botão "Limpar filtros" ghost gated por `activeFilterCount` [269-281]. Estado via props (`filters`/`onFiltersChange`) vindos do `OpportunitiesPageContent`.
  - [x] 7.2 **Busca (search):** decisão — a busca por nome/e-mail/empresa é sobre campos do **lead embedado**, não colunas de `opportunities`, então filtrar no servidor exigiria filtro no embed (PostgREST `leads.first_name=ilike...`). **Preferir busca client-side** sobre a página carregada (simples, sem risco de sintaxe de embed), documentando a limitação (busca dentro da página atual). Alternativa server-side (se quiser busca global): aplicar `.or(...)` no embed — mais complexo, deixar como Open Question. Default: client-side sobre `opportunities` já carregadas.

- [x] **Task 8: Sidebar — item + badge (AC: #1, #7)**
  - [x] 8.1 Em `src/components/common/Sidebar.tsx`: (a) importar um ícone lucide (ex.: `Inbox`, `Target` ou `Flame` — escolher um não usado; ver ícones já importados [Sidebar.tsx:6-18]); (b) importar `useNewOpportunitiesCount` de `@/hooks/use-opportunities`; (c) adicionar ao array `navItems` [47-62] a entrada `{ label: "Oportunidades", href: "/opportunities", icon: <Icon> }` — **SEM `adminOnly`** (SDR vê, AC7); posicionar perto de "Insights" (é irmão conceitual). (d) Definir `function OpportunitiesBadge()` espelhando `InsightsBadge` [64-72] (usa `useNewOpportunitiesCount`, `null` se count 0, `<Badge variant="default" className="ml-auto text-[10px] h-5 min-w-[20px] px-1.5">{count>99?"99+":count}</Badge>`). (e) Adicionar a linha condicional de render junto a [Sidebar.tsx:410]: `{item.href === "/opportunities" && <OpportunitiesBadge />}`.
  - [x] 8.2 Confirmar que o item aparece para SDR (sem `adminOnly` → passa o filtro `visibleNavItems` [90-92]). NÃO adicionar a `/opportunities` a nenhuma lista de rota admin do middleware (a rota é para todos).

- [x] **Task 9: Testes unitários (AC: #8)**
  - [x] 9.1 `OpportunityCard.test.tsx`: renderiza campos (nome/empresa/cargo/campanha); badge de intent por cada um dos 5 intents + null ("Não classificado"); badge "Alto engajamento" quando `source='engagement'`; expand/collapse do `reply_text`; ausência de "Abrir no Unibox" quando `unibox_url` null; cliques só quando `>0`; **degradações**: `lead` null, `intent` null, sem `reply_text`, sem `phone`, sem `insight` — nenhum crash; insight do LinkedIn exibido quando presente; transição `new→viewed` dispara a mutation **uma vez** ao abrir (mock do hook).
  - [x] 9.2 `OpportunitiesFilterBar.test.tsx`: multi-select de intent/status atualiza `onFiltersChange`; busca atualiza; "Limpar filtros" reseta; `activeFilterCount` correto.
  - [x] 9.3 Badge de contagem: `useNewOpportunitiesCount` mock → `OpportunitiesBadge` mostra número / esconde quando 0 / "99+" quando >99. (Espelhar teste do InsightsBadge se existir.)
  - [x] 9.4 API routes (espelhar testes de `insights/route.test.ts`, `insights/[insightId]/route.test.ts`, `insights/new-count`): GET lista → 401 sem sessão; filtra por `tenant_id`; aplica filtros `intent`/`status`/`campaign_id`/`period`; paginação/meta; **LEFT embed** (oportunidade com `lead_id` null aparece no resultado — regressão contra `!inner`); Map de campanha; new-count → count de `new`; PATCH → 401 sem sessão, 400 status inválido (`isValidOpportunityStatus`), 404 `PGRST116`, sucesso grava `status` + filtra `tenant_id`. Usar mock-supabase resiliente (`createChainBuilder`/`setupSupabase*`) [__tests__/helpers/mock-supabase.ts].
  - [x] 9.5 `OpportunitiesPageContent.test.tsx` (se o padrão do projeto testar o content component — ver `InsightsPageContent` tests): estados loading/error/empty/lista; paginação aparece com `totalPages>1`.

- [x] **Task 10: Validação** — `npx tsc --noEmit` (0 novos erros em `src/`); `npx eslint --max-warnings=0 <arquivos novos/modificados>` limpo (inclusive `no-non-null-assertion` — leitura guardada de env se tocar rota); `npx vitest run` verde; `npm run build` verde (rota `/opportunities` + `/api/opportunities/*` registradas). **Lembrete Tailwind v4 [memória do projeto]:** usar `flex flex-col gap-*`, NUNCA `space-y-*` em wrappers label/select/input.

## Dev Notes

Esta story é a **camada de apresentação** sobre `opportunities` já persistidas e classificadas. **Fora de escopo (não implementar):** ações do card (WhatsApp/mailto/telefone/marcar reunião/descartar) e rascunho `opportunity_next_step` por IA → **21.5**; notificações WhatsApp/in-app + configurações → **21.7**; qualquer ingestão/classificação (21.2/21.3/21.6, done). O PATCH de status desta story só precisa da transição `new→viewed`; a rota aceita os demais status (validados) mas sem os efeitos colaterais da 21.5.

### 🟢 Zero migration — tudo já existe no schema

As tabelas (`opportunities`, `notification_settings`, `app_notifications`), colunas (incl. `intent`/`lt_interest_status`/`open_count`/`click_count`/`last_engagement_at`), índices (`idx_opportunities_tenant_status`, `idx_opportunities_lead_id`) e **RLS por `tenant_id`** já foram criados na `00055` (21.1) + `00057` (21.6). **Esta story NÃO cria nenhuma migration.** A RLS de SELECT (`tenant_id = get_current_tenant_id()` [00055:74-77]) já garante o isolamento client-side; a API ainda adiciona `.eq("tenant_id", profile.tenant_id)` como defesa em profundidade (padrão do insights route).

### O precedente EXATO a espelhar: a feature de Insights (Epic 13)

A Central de Oportunidades é **estruturalmente idêntica** à página de Insights. Espelhe a feature inteira:

| Peça | Fonte (Insights) | Alvo (Oportunidades) |
|---|---|---|
| Página server + metadata + Suspense | `src/app/(dashboard)/insights/page.tsx` | `src/app/(dashboard)/opportunities/page.tsx` |
| Content client (filtros + estados) | `src/components/insights/InsightsPageContent.tsx` | `src/components/opportunities/OpportunitiesPageContent.tsx` |
| Empty state (variante hasFilters) | `src/components/insights/InsightsEmptyState.tsx` | `OpportunitiesEmptyState.tsx` |
| Hook lista + count + mutation | `src/hooks/use-lead-insights.ts` | `src/hooks/use-opportunities.ts` |
| API lista (join lead + tenant + filtros + paginação) | `src/app/api/insights/route.ts` | `src/app/api/opportunities/route.ts` |
| API contagem badge | `src/app/api/insights/new-count/route.ts` | `src/app/api/opportunities/new-count/route.ts` |
| API PATCH status | `src/app/api/insights/[insightId]/route.ts` | `src/app/api/opportunities/[opportunityId]/route.ts` |
| Item de sidebar + badge | `Sidebar.tsx` InsightsBadge/useNewInsightsCount | OpportunitiesBadge/useNewOpportunitiesCount |

O **look do card** vem do tracking (`OpportunityPanel` — card acento-tintado) e a **cor de badge** do `LeadStatusBadge` (Epic 4). A **FilterBar** espelha `MyLeadsFilterBar` (barra inline com multi-select + search).

### ⚠️ Join de `leads` DEVE ser LEFT (não `!inner`)

`opportunities.lead_id` é **nullable** (`ON DELETE SET NULL` [00055:28]; a 21.2 cria oportunidade mesmo sem lead na base — 21.2 AC7). O insights route usa `leads!inner` porque `lead_insights.lead_id` é NOT NULL — **NÃO copie o `!inner`**. Use embed sem qualificador: `lead:leads ( ... )` (PostgREST trata como LEFT join). Um teste de regressão (Task 9.4) deve provar que uma oportunidade com `lead_id` null aparece no resultado.

### Nome da campanha: join manual (sem FK)

`opportunities.campaign_id` é `UUID NOT NULL` **sem FK** (00055:29, decisão deliberada espelhando `campaign_events` — banco gerido à mão + "campanha desconhecida"). PostgREST não auto-embeda `campaigns`. Resolver por **query separada + Map** (padrão do tracking route `.../tracking/route.ts:45-49,90-112`): colher os `campaign_id` distintos da página → `from("campaigns").select("id, name").in("id", ids).eq("tenant_id", ...)` → `Map`. `campaign_id` é o `campaigns.id` **local** (o `reply-sweep` resolve `external_campaign_id → campaigns.id` antes de gravar em `campaign_events` [reply-sweep.ts:162-171,198]), então o Map casa direto. Ausente → "Campanha desconhecida".

### Insight do LinkedIn (AC3) — só para leads monitorados

`lead_insights` (Epic 13, 00043): colunas relevantes `lead_id`, `suggestion`, `relevance_reasoning`, `post_url`, `post_text`, `post_published_at`, `status`, `created_at`. Buscar o insight **mais recente** por lead monitorado (`leads.is_monitored = true`), reduzindo a `Map<leadId, latestInsight>` (order `created_at desc`, primeiro por lead). É **contexto secundário**: se a query falhar, `insight: null` e a Central segue funcionando (não derrubar a resposta). Tipos: `LeadInsightRow`/`LeadInsight`/`transformLeadInsightRow` [src/types/monitoring.ts:47-93].

### Cores de intent (Task 1.1) — idioma de cor do projeto

Espelhar o idioma `bg-{cor}-500/20 text-{cor}-600 dark:text-{cor}-400` de `LeadStatusBadge.tsx:32-38` (tema B&W + tokens de status). Atribuição sugerida (cores distintas, semânticas):
- `interessado` → verde (`bg-green-500/20 text-green-600 dark:text-green-400`) — lead quente.
- `pediu_info` → azul (`bg-blue-500/20 text-blue-600 dark:text-blue-400`) — engajado, neutro-positivo.
- `objecao` → âmbar (`bg-amber-500/20 text-amber-600 dark:text-amber-400`) — atenção.
- `nao_agora` → cinza/muted (`bg-muted text-muted-foreground`) — frio.
- `opt_out` → vermelho (`bg-destructive/20 text-destructive`) — descarte.
- `null` (não classificado) → neutro (`bg-muted text-muted-foreground`), label "Não classificado".

Os únicos não-cinza do tema são `--success`/`--warning`/`--destructive` + a escala literal `green/blue/amber/red-500` (já usada nos badges existentes) — use-a. Confirmar contraste no light + dark (o projeto testa contraste — Epic 8).

### Degradações obrigatórias do card (não quebrar nunca)

A 21.2/21.3/21.6 produzem oportunidades com campos legitimamente nulos — o card **precisa** renderizar todos os casos sem crash:
- **`intent` null** — resposta ainda não classificada, fail-open da 21.3, ou `source='engagement'` (nunca classificado). Badge "Não classificado". (A 21.3 fail-open deixa `intent` null e a review 21.3 notou que rows "irresolvíveis" reentram — a Central é o lugar que **expõe esse backlog**; ver deferred-work.md 21.3. Não é preciso agir sobre isso aqui, só renderizar graciosamente.)
- **`lead_id`/`lead` null** — oportunidade sem lead na base (21.2 AC7). Sem nome/empresa/cargo/telefone/insight. Mostrar `reply_subject` + "Lead não cadastrado". NUNCA acessar `lead.first_name` sem guard.
- **`source='engagement'`** — sem `reply_text`/`reply_subject`/`unibox_url`; tem `open_count`/`click_count`/`last_engagement_at`. Badge "Alto engajamento". `lt_interest_status` **sempre null** para engagement (dívida conhecida — deferred-work.md 21.6; a 21.3 normaliza mas o valor bruto vinha null) → não assumir preenchido.
- **`unibox_url` null** — caminho de polling (só webhook traz; 21.2). Ocultar "Abrir no Unibox".
- **`reply_text` null / `phone` null / `campaignName` null / `insight` null** — ocultar a seção correspondente.

### Métricas de engajamento são write-once (decisão da 21.4 — Open Question #1)

A 21.6 grava `open_count`/`click_count`/`last_engagement_at` **na criação** e o dedup "pula se já existe card ativo" **nunca atualiza** — as métricas congelam no snapshot da 1ª qualificação [deferred-work.md:88; engagement-processor.ts:167-184]. **Fabossi (2026-07-13) aceitou o snapshot e delegou a decisão do refresh a esta story.** Default proposto (recomendado): **manter o snapshot** — esta story é read-only e o snapshot é "bom o suficiente" para acionar o vendedor; implementar refresh do card ativo exigiria reabrir o write-path do `engagement-processor` (fora do espírito de uma story visual). Ver Open Question #1. Se Fabossi quiser refresh, é uma sub-tarefa da 21.6/21.7, não desta.

### Definição de "abrir um card" (AC5) + transição `new→viewed`

"Abrir um card" = a primeira interação que revela o conteúdo (clicar para expandir o card / expandir o `reply_text` completo). Ao abrir, se `status === 'new'`, disparar `useUpdateOpportunityStatus({ opportunityId, status: 'viewed' })` **uma vez** (guardar `useRef(false)` para não repetir em re-renders / re-expansões). Isso invalida `["opportunities-new-count"]` → o badge da sidebar decrementa. Não emitir toast (ação passiva). Alternativa (não recomendada): marcar `viewed` no mount do card visível — gera writes em massa ao carregar a lista; preferir a marcação por interação.

### Reuso obrigatório (não reinventar)

- `getCurrentUserProfile()` [src/lib/supabase/tenant.ts:17-33] — sessão + `tenant_id`. `createClient()` [@/lib/supabase/server].
- `toOpportunity(row)` [opportunity.ts:119] — Row→TS; `isValidOpportunityStatus` [opportunity.ts:59] — validação do PATCH; `OPPORTUNITY_INTENTS`/`OPPORTUNITY_STATUSES` [opportunity.ts:17-33].
- `Badge` [ui/badge.tsx], `Card`/`CardContent`/`CardHeader` [ui/card.tsx], `Skeleton` [ui/skeleton.tsx], `Select`/`DropdownMenu` [ui/*].
- `formatRelativeTime` [src/components/tracking/SyncIndicator] — tempo relativo do engajamento.
- Padrão de badge colorido `Record<variant, classes>` + `<Badge variant="outline" className="border-transparent ...">` [LeadStatusBadge.tsx:32-38].
- Empty/loading/error inline states [OpportunityPanel.tsx:61-87; LeadTrackingTable.tsx:240-283] (UX-DR2).
- Mock HTTP centralizado + mock Supabase resiliente [__tests__/helpers/mock-supabase.ts].
- `flex flex-col gap-*` (NÃO `space-y-*`) [memória do projeto — Tailwind v4 + Radix].

### Anti-Patterns a evitar

1. **NÃO** usar `leads!inner` no embed — `lead_id` é nullable; `!inner` dropa cards sem lead. Use LEFT (`lead:leads(...)`).
2. **NÃO** tentar auto-embedar `campaigns` via PostgREST — não há FK; resolver por query+Map.
3. **NÃO** acessar `lead.*`, `reply_text.*`, `unibox_url`, `campaignName` sem guard de null — todas as degradações são casos reais (21.2/21.6).
4. **NÃO** implementar ações do card (WhatsApp/mailto/telefone/marcar reunião/descartar) nem rascunho IA — é **21.5**. Telefone aqui é só exibição.
5. **NÃO** criar migration — schema completo desde 00055/00057.
6. **NÃO** setar `meeting_booked_at` nem atualizar status do lead no PATCH desta story — efeitos da 21.5.
7. **NÃO** marcar `viewed` no mount (write em massa) — marcar por interação, uma vez (`useRef`).
8. **NÃO** pôr `adminOnly` no item de sidebar — SDR precisa ver (AC7).
9. **NÃO** usar `space-y-*` (Tailwind v4 + Radix não espaça) — `flex flex-col gap-*`.
10. **NÃO** usar `process.env.X!` em rota (eslint `no-non-null-assertion` linta o arquivo inteiro no pre-commit) — leitura guardada.
11. **NÃO** assumir `lt_interest_status` preenchido para `source='engagement'` (sempre null — dívida 21.6).

### Previous Story Intelligence (21.1 / 21.2 / 21.3 / 21.6)

- **21.1 (schema):** `opportunities` + tipos + transforms + RLS aplicados à mão no banco do cliente (idempotentes). `toOpportunity` mapeia todos os campos [opportunity.ts:119-141]. `ACTIVE_OPPORTUNITY_STATUSES` [opportunity.ts:44-49] compartilhado.
- **21.2 (ingestão):** cria oportunidade `source='reply'` com `intent: null`; `unibox_url` **null no caminho de polling** (só webhook traz); `lead_id` nullable (oportunidade existe sem lead). Cron `/api/replies/process-batch` já deployado/validado local; backfill JÁ rodou contra prod → **há dados reais no banco**.
- **21.3 (classificação):** preenche `intent` num passe assíncrono; **fail-open deixa `intent` null** e rows irresolvíveis reentram → a Central é o gatilho para expor esse backlog (deferred-work.md 21.3). Card deve renderizar `intent` null.
- **21.6 (engajamento):** cria `source='engagement'` com `open_count`/`click_count`/`last_engagement_at` (**write-once**, congelam na criação — Open Question #1) e `lt_interest_status` sempre null (dívida). `OpportunityPanel` do analytics já mostra cliques [OpportunityPanel.tsx:368-376] — o card da Central segue o mesmo padrão. Upgrade engagement→reply é in-place (o card muda de `source`).

### Git Intelligence (commits recentes)

- `099532c` feat(story-21.3) — classificação IA (baseline desta story).
- `c7f4beb` feat(story-21.6) — engajamento cross-campanha (métricas write-once).
- `c7940c4` feat(story-21.2) — ingestão/sweep (unibox_url null no polling; lead_id nullable).
- `ed135f3` feat(story-21.1) — schema `opportunities` + tipos + RLS.
- Branch: `epic/21-loop-de-resposta` (commitar na branch do épico — padrão do épico, não abrir feature branch).

### Project Structure Notes

**Novos:**
- `src/app/(dashboard)/opportunities/page.tsx`
- `src/components/opportunities/OpportunitiesPageContent.tsx`
- `src/components/opportunities/OpportunityCard.tsx`
- `src/components/opportunities/OpportunitiesFilterBar.tsx`
- `src/components/opportunities/OpportunitiesEmptyState.tsx`
- `src/hooks/use-opportunities.ts`
- `src/app/api/opportunities/route.ts`
- `src/app/api/opportunities/new-count/route.ts`
- `src/app/api/opportunities/[opportunityId]/route.ts`
- Testes: `__tests__/unit/components/opportunities/*.test.tsx`, `__tests__/unit/app/api/opportunities/**/route.test.ts`, `__tests__/unit/hooks/use-opportunities.test.ts` (seguir a árvore de testes existente do projeto)

**Modificados:**
- `src/types/opportunity.ts` (ADITIVO — `OPPORTUNITY_INTENT_CONFIG`/`getIntentConfig`/`OPPORTUNITY_STATUS_CONFIG`; não alterar exports existentes; rodar `opportunity.test.ts` p/ confirmar verde)
- `src/components/common/Sidebar.tsx` (item + badge)

**Intocados (garantir):** todo o pipeline de ingestão/classificação (`reply-sweep.ts`, `reply-processor.ts`, `reply-classifier.ts`, `engagement-processor.ts`), o receiver do webhook, e as rotas `/api/replies/*` — esta story é **só leitura + apresentação**.

Alinhamento total com a estrutura existente (feature Insights + tracking). Zero conflito arquitetural.

### References

- [Source: _bmad-output/planning-artifacts/epic-21-loop-de-resposta.md#Story 21.4] — ACs, FR8/FR9, UX-DR1/UX-DR2, sequência
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md:771-805] — Jornada 2 (escalonamento de lead interessado; ações são 21.5)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:88] — métricas write-once (decisão de refresh delegada à 21.4)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:87,95] — lt_interest_status null p/ engagement; backlog de intent null que a Central expõe
- [Source: _bmad-output/implementation-artifacts/epic-21-post-deploy-checklist.md] — checklist pós-deploy (rodar ao deployar esta story)
- [Source: supabase/migrations/00055_create_opportunities_schema.sql:25-93] — schema `opportunities` (colunas, CHECKs, UNIQUE, RLS SELECT tenant, índices) — SEM migration nova
- [Source: supabase/migrations/00057_*] — `open_count`/`click_count`/`last_engagement_at` + índice de dedup de engagement (21.6)
- [Source: supabase/migrations/00043_add_lead_monitoring_schema.sql:26,32-44] — `leads.is_monitored`, `lead_insights` (suggestion/relevance_reasoning/post_url/status/created_at)
- [Source: supabase/migrations/00010_create_leads.sql:14-31] + [00014_add_lead_photo_url.sql] — colunas `leads` (first_name NOT NULL/last_name/email/company_name/title/phone/photo_url/linkedin_url)
- [Source: supabase/migrations/00016_create_campaigns.sql:13-20] — `campaigns.id`/`name` (join manual)
- [Source: src/types/opportunity.ts:14-61,68-141] — `Opportunity`/`OpportunityRow`/`toOpportunity`, `OPPORTUNITY_INTENTS`/`_STATUSES`, `isValidOpportunityStatus`, `ACTIVE_OPPORTUNITY_STATUSES` (adicionar config de intent aqui)
- [Source: src/types/lead.ts:49-100] — precedente do config de badge (`leadStatusVariants`/`LEAD_STATUSES`/`getStatusConfig`) a espelhar p/ intent
- [Source: src/app/(dashboard)/insights/page.tsx:1-36] — página server + metadata + Suspense (espelhar)
- [Source: src/components/insights/InsightsPageContent.tsx:1-212] — content client (filtros + loading/error/empty + paginação)
- [Source: src/components/insights/InsightsEmptyState.tsx] — empty state variante hasFilters
- [Source: src/hooks/use-lead-insights.ts:16-58,64-98,108-129,135-168] — `useLeadInsights`/`fetchInsights`/`useNewInsightsCount`/`useUpdateInsightStatus` (espelhar p/ opportunities; invalidar `["opportunities-new-count"]`)
- [Source: src/app/api/insights/route.ts:19-103] — GET lista (auth, tenant, embed lead, filtros, paginação, envelope de erro)
- [Source: src/app/api/insights/new-count/route.ts:1-35] — count head:true por tenant+status='new'
- [Source: src/app/api/insights/[insightId]/route.ts:13-71] — PATCH status (valida enum, tenant-scope, PGRST116→404)
- [Source: src/lib/supabase/tenant.ts:17-33] — `getCurrentUserProfile` (sessão + tenant_id)
- [Source: src/app/api/campaigns/[campaignId]/leads/tracking/route.ts:45-49,90-112] — padrão de query separada + Map (campanha/telefone) sem FK
- [Source: src/components/common/Sidebar.tsx:34-62,64-72,83-92,381-414] — navItems, InsightsBadge, filtro adminOnly (SDR), render condicional do badge
- [Source: src/components/tracking/OpportunityPanel.tsx:61-87,344-468] — card acento-tintado, skeleton/empty inline, opens/clicks + formatRelativeTime
- [Source: src/components/tracking/LeadTrackingTable.tsx:240-283,366-376] — skeleton/empty/error (UX-DR2), badge "Alto Interesse" outline (espelhar "Alto engajamento")
- [Source: src/components/leads/LeadStatusBadge.tsx:32-38] — Record<variant, colorClasses> + Badge outline border-transparent
- [Source: src/components/leads/MyLeadsFilterBar.tsx:137-281] — FilterBar inline (search + multi-select DropdownMenu + Select campanha + limpar)
- [Source: src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx] — wiring precedente (isLoading/isError plumbing) de OpportunityPanel + LeadTrackingTable
- [Source: src/components/ui/{badge,card,skeleton,select,dropdown-menu,glass-card}.tsx] — primitivos shadcn
- [Source: src/lib/utils/reply-sweep.ts:162-171,198] — campaign_id gravado = campaigns.id local (external→local resolvido antes)

## Open Questions (p/ Fabossi — não bloqueiam o dev; defaults propostos)

1. **Refresh das métricas de engajamento (write-once).** A 21.6 congela `open_count`/`click_count`/`last_engagement_at` na criação e Fabossi delegou a decisão do refresh a esta story. **Default proposto (recomendado): manter o snapshot** — a Central é read-only; refresh do card ativo exigiria reabrir o write-path do `engagement-processor` (fora do escopo visual). Se quiser refresh vivo, vira sub-tarefa da 21.6/21.7. Confirmar.
2. **Busca (nome/e-mail/empresa) client-side vs server-side.** Os campos de busca vivem no lead embedado, não em colunas de `opportunities`. **Default proposto: busca client-side** sobre a página carregada (simples, sem sintaxe de filtro no embed do PostgREST) — limitação: busca dentro da página atual. Alternativa server-side (`.or()` no embed, busca global) é mais complexa. Confirmar se a busca por página é aceitável ou se precisa ser global.
3. **Ordenação por recência.** Default: `created_at desc` (espelha Insights). Para engajamento, `last_engagement_at` pode ser mais recente que `created_at` (write-once congela ambos na criação, então na prática coincidem). Manter `created_at desc`? Ou `greatest(created_at, last_engagement_at)`? Default: `created_at desc` (simples).

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Fable 5)

### Debug Log References

- Suite completa inicial acusou 13 falhas em `AppShell.test.tsx`: o AppShell renderiza o Sidebar, que passou a usar `useNewOpportunitiesCount` (sem QueryClientProvider no teste). Fix: mock de `@/hooks/use-opportunities` no teste (mesmo padrão do mock pré-existente de `use-lead-insights`). Regressão zero após o fix.
- `tsc --noEmit`: exit code ≠ 0 vem de erros PRÉ-EXISTENTES em `__tests__/` (baseline conhecido — mock-data.ts, team.test.ts, leads-enrich-icebreaker.test.ts etc.). Gate da story = 0 erros em `src/` (confirmado) + 0 erros nos arquivos novos (confirmado, após trocar `as const` por tipo explícito no it.each do FilterBar test).

### Completion Notes List

- **Task 1:** Config de apresentação ADITIVA em `types/opportunity.ts`: `OPPORTUNITY_INTENT_CONFIG` (labels pt-BR + cores no idioma `bg-{cor}-500/20 text-{cor}-600 dark:text-{cor}-400` do LeadStatusBadge, conforme Dev Notes), `UNCLASSIFIED_INTENT_CONFIG` (fallback "Não classificado" muted), `getIntentConfig(intent | null | undefined)` e `OPPORTUNITY_STATUS_CONFIG` (labels de status). Nenhum export existente alterado — `opportunity.test.ts` pré-existente segue verde.
- **Task 2:** `GET /api/opportunities` espelhando o insights route: auth 401 → tenant-scope `.eq("tenant_id")` (defesa em profundidade sobre a RLS 00055) → **LEFT embed `lead:leads(...)`** (SEM `!inner` — teste de regressão prova que card com `lead_id` null aparece) → filtros intent/status CSV via `.in()`, `campaign_id` via `.eq()`, `period` 7d/30d/90d via `.gte()` → `created_at desc` + paginação (default 25, cap 100). Nome da campanha por query separada + `Map` (sem FK); ausente → `campaignName: null`. Insight do LinkedIn: só leads com `is_monitored`, mais recente por lead (order desc + primeiro no Map); falha na query de insights NÃO derruba a resposta (console.warn + `insight: null`). Resposta `{ data, meta: { total, page, limit, totalPages } }`, erro `{ error: { code, message } }` 500.
- **Task 3:** `GET /api/opportunities/new-count` (count head:true por tenant + status='new') e `PATCH /api/opportunities/[opportunityId]` (400 JSON inválido; 400 status inválido via `isValidOpportunityStatus`; PGRST116 → 404; grava SÓ `{ status }` — sem `meeting_booked_at`/status do lead, que são 21.5).
- **Task 4:** `use-opportunities.ts`: `useOpportunities(filters)` (queryKey `["opportunities", serverFilters]` SEM `search` — busca é client-side e não deve refetchar por tecla; staleTime 2min), `useNewOpportunitiesCount()` (staleTime 30s, refetchInterval 60s), `useUpdateOpportunityStatus()` com flag `silent` (transição passiva new→viewed sem toast; invalida `["opportunities"]` E `["opportunities-new-count"]` → badge decrementa, AC5) e helper puro `filterOpportunitiesBySearch` (nome/e-mail/empresa, case-insensitive).
- **Task 5:** Página server `(dashboard)/opportunities/page.tsx` (metadata + Suspense) + `OpportunitiesPageContent` client (estado de filtros, branches loading skeleton/error destructive/empty/lista, paginação prev/next + per-page quando totalPages>1). Select de campanha REUSA `useCampaigns()` existente (nenhum endpoint novo).
- **Task 6:** `OpportunityCard` com look do OpportunityPanel (`border-primary/30 bg-primary/5`): cabeçalho (nome ou "Lead não cadastrado", cargo · empresa, badge de intent via `getIntentConfig`, badge "Alto engajamento" p/ engagement, badge "Nova" p/ status new, tempo relativo), campanha (?? "Campanha desconhecida"), `reply_subject`, `reply_text` truncado line-clamp-2 com "Ver mais/Ver menos", métricas de engajamento (cliques só >0, `formatRelativeTime` reusado do SyncIndicator), telefone (só exibição), "Abrir no Unibox" condicional, bloco de insight do LinkedIn (suggestion + reasoning + link do post). Transição new→viewed por INTERAÇÃO com `useRef` (1x, silent). Todas as degradações renderizam sem crash (teste worst-case tudo-nulo). `OpportunitiesEmptyState` com variante hasFilters.
- **Task 7:** `OpportunitiesFilterBar` espelhando MyLeadsFilterBar: busca com ícone+limpar, multi-select DropdownMenu de intent e status (labels dos configs da Task 1), Select de campanha (useCampaigns), Select de período, "Limpar filtros" gated por activeFilterCount. Busca client-side sobre a página carregada (default da story; limitação documentada no hook).
- **Task 8:** Sidebar: item `{ label: "Oportunidades", href: "/opportunities", icon: Inbox }` SEM `adminOnly` (SDR vê — teste explícito), posicionado ao lado de Insights; `OpportunitiesBadge` espelhando InsightsBadge (oculto em 0, "99+" acima de 99). Middleware INTOCADO: `/opportunities` fora das listas admin (e fora de `isProtectedRoute`, seguindo o precedente exato do `/insights` — a barreira real é a API 401 + RLS).
- **Task 9:** 112 testes novos: 37 de API (auth/tenant/filtros/paginação/LEFT-embed/Map campanha/insight AC3/fail-soft/PATCH), 21 de hooks (fetch/params/search fora da API/invalidação dupla/silent sem toast/busca client-side), 24 do card (5 intents + null, engajamento, expand, unibox, degradações, new→viewed 1x), 12 do FilterBar (multi-selects reais via Radix, busca, limpar, activeFilterCount), 2 do EmptyState, 10 do PageContent (estados + paginação + busca), 6 do Sidebar (item/badge/SDR). +2 mocks adicionados em testes pré-existentes (Sidebar.test, AppShell.test) pelo novo hook.
- **Task 10:** `tsc` 0 erros em src/; `eslint --max-warnings=0` limpo em todos os arquivos novos/modificados; `npx vitest run` 381 files / 6491 pass / 2 skip / 0 fail; `npm run build` verde com `/opportunities` + `/api/opportunities` + `/api/opportunities/[opportunityId]` + `/api/opportunities/new-count` registradas. Tailwind v4: só `flex flex-col gap-*`, zero `space-y-*`.
- **Open Questions (defaults aplicados, conforme story):** OQ1 métricas write-once → snapshot mantido (story read-only); OQ2 busca → client-side por página; OQ3 ordenação → `created_at desc`.
- **Fora de escopo respeitado:** nenhuma ação de card (WhatsApp/mailto/tel/reunião/descarte), nenhum rascunho IA, nenhuma migration, pipeline de ingestão/classificação intocado (`reply-sweep.ts`, `reply-processor.ts`, `reply-classifier.ts`, `engagement-processor.ts`, webhook, `/api/replies/*`).

### File List

**Novos (src):**
- src/app/(dashboard)/opportunities/page.tsx
- src/app/api/opportunities/route.ts
- src/app/api/opportunities/new-count/route.ts
- src/app/api/opportunities/[opportunityId]/route.ts
- src/hooks/use-opportunities.ts
- src/components/opportunities/OpportunitiesPageContent.tsx
- src/components/opportunities/OpportunityCard.tsx
- src/components/opportunities/OpportunitiesFilterBar.tsx
- src/components/opportunities/OpportunitiesEmptyState.tsx

**Novos (testes):**
- __tests__/unit/app/api/opportunities/route.test.ts
- __tests__/unit/app/api/opportunities/new-count/route.test.ts
- __tests__/unit/app/api/opportunities/[opportunityId]/route.test.ts
- __tests__/unit/hooks/use-opportunities.test.ts
- __tests__/unit/components/opportunities/OpportunityCard.test.tsx
- __tests__/unit/components/opportunities/OpportunitiesFilterBar.test.tsx
- __tests__/unit/components/opportunities/OpportunitiesEmptyState.test.tsx
- __tests__/unit/components/opportunities/OpportunitiesPageContent.test.tsx

**Modificados:**
- src/types/opportunity.ts (ADITIVO: OPPORTUNITY_INTENT_CONFIG / UNCLASSIFIED_INTENT_CONFIG / getIntentConfig / OPPORTUNITY_STATUS_CONFIG)
- src/components/common/Sidebar.tsx (item Oportunidades + OpportunitiesBadge)
- __tests__/unit/components/Sidebar.test.tsx (mock use-opportunities + 6 testes do item/badge)
- __tests__/unit/components/AppShell.test.tsx (mock use-opportunities — Sidebar é filho do AppShell)
- _bmad-output/implementation-artifacts/sprint-status.yaml (status da story)

### Review Findings (code-review bmad 3 camadas — 2026-07-14)

Revisão adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor, modo `full`) sobre o diff da story. Acceptance Auditor: **8/8 ACs satisfeitos, 0 violação de spec**. Triagem: 0 decision-needed, 7 patches, 3 defers, 5 dismiss.

**Patches (todos APLICADOS + validados — 2026-07-14):**

- [x] [Review][Patch] Paginação com `NaN` em `page`/`per_page` não-numéricos [src/app/api/opportunities/route.ts:59-66] — `Math.max(1, parseInt("abc"))` = `NaN` (Math.max não coage NaN) → `.range(NaN, NaN)` + `meta.limit`/`totalPages` = NaN. **Fix:** helper `parsePositiveInt` com `Number.isFinite`/fallback. +teste de regressão. (medium)
- [x] [Review][Patch] Header de contagem + empty-state/paginação inconsistentes com busca client-side ativa [src/components/opportunities/OpportunitiesPageContent.tsx] — header mostrava `meta.total` (servidor) enquanto a lista renderiza `visibleOpportunities` (filtrada); empty-state + paginador apareciam juntos ao buscar termo ausente. **Fix:** `shownCount` reflete a view filtrada e a paginação é oculta quando `isSearchActive`. (medium)
- [x] [Review][Patch] Transição passiva `new→viewed`: toast de erro dispara + `useRef` não reseta em falha [src/hooks/use-opportunities.ts:223 + src/components/opportunities/OpportunityCard.tsx:49-66] — **Fix:** `onError` respeita `silent` (sem toast na ação passiva) + `mutate` passa `onError` que reseta `markedViewedRef` → re-tenta ao reabrir. +2 testes (silent suprime, explícito notifica). (low-medium)
- [x] [Review][Patch] PATCH com body JSON `null` quebra no destructure → 500 em vez de 400 [src/app/api/opportunities/[opportunityId]/route.ts:39-50] — **Fix:** guarda `typeof body !== "object" || body === null` → 400. +teste de regressão. (low)
- [x] [Review][Patch] CSV de `intent`/`status` sem trim → filtro silenciosamente vazio [src/app/api/opportunities/route.ts:77-92] — **Fix:** helper `parseCsv` (`trim` + `filter(Boolean)`); só aplica `.in()` se restar valor. +teste de regressão. (low)
- [x] [Review][Patch] `getIntentConfig` só guarda null — chave desconhecida retorna `undefined` → card quebra [src/types/opportunity.ts:107-112] — **Fix:** `OPPORTUNITY_INTENT_CONFIG[intent] ?? UNCLASSIFIED_INTENT_CONFIG`. (low, defensivo)
- [x] [Review][Patch] Link "Abrir no Unibox" sem `stopPropagation` [src/components/opportunities/OpportunityCard.tsx:172-184] — **Fix:** `onClick={(e) => e.stopPropagation()}` (consistente com o link de post do insight). (low, consistência)

**Defers (reais, não acionáveis agora — registrados em deferred-work.md):**

- [x] [Review][Defer] PATCH aceita qualquer transição de status válida, incl. regressões [src/app/api/opportunities/[opportunityId]/route.ts:41-61] — deferido, `discarded`/`meeting_booked` → `new` ressuscita o card no badge; a guarda de state-machine pertence à 21.5 (efeitos colaterais), por design desta story.
- [x] [Review][Defer] Página pode ficar encalhada além de `totalPages` após marcar cards viewed sob filtro `status=new` [src/components/opportunities/OpportunitiesPageContent.tsx:150-198] — deferido, edge estreito; ao encolher o total a página N atual pode exceder `totalPages` e, se cair a ≤1, o paginador some sem controle de retorno. Clamp de página pós-refetch.
- [x] [Review][Defer] Invalidação da lista inteira a cada abertura de card (sem update otimista) [src/hooks/use-opportunities.ts:220] — deferido, abrir cada card `new` dispara refetch de `["opportunities"]` + `["opportunities-new-count"]`; espelha o precedente do Insights (aceitável), otimização otimista fica para depois.

**Dismiss (5):** embed `lead:leads` sem `.eq(tenant_id)` (RLS de `leads` cobre o cross-tenant); busca client-side só na página atual (decisão OQ2 documentada/aprovada); `isFetching` não consumido (queryKey muda por página/filtro → `isLoading` já cobre o skeleton em chave nova); "Campanha desconhecida" mascara integridade (padrão by-design do épico sem FK); troca de filtro não limpa `search` (filtros compõem com a busca — comportamento aceitável).

## Change Log

- 2026-07-14: Code review bmad (3 camadas, modo full) — Acceptance Auditor 8/8 ACs. Triagem: 0 decision-needed, **7 patches aplicados**, 3 defers (deferred-work.md), 5 dismiss. Patches: (P1) guarda `NaN` na paginação; (P2) contagem/paginação coerentes com busca client-side; (P3) `new→viewed` silencioso não dá toast de erro + reseta `useRef` p/ re-tentar em falha; (P4) PATCH com body `null` → 400 (era 500); (P5) trim dos CSVs de intent/status; (P6) `getIntentConfig` fallback p/ chave fora do enum; (P7) `stopPropagation` no link do Unibox. +4 testes de regressão (NaN pagination, CSV trim, null body, silent-no-toast). VALIDAÇÕES: tsc 0 erros src/; eslint --max-warnings=0 limpo; vitest 381 files/6495 pass/2 skip/0 fail; build verde. Status: review → **done**.
- 2026-07-14: Story 21.4 implementada (dev-story) — 10/10 tasks. Central de Oportunidades completa espelhando a feature Insights: página server + Suspense; PageContent client (filtros/loading/error/empty/paginação); OpportunityCard (badge de intent colorido, badge engajamento, reply expansível, unibox condicional, insight LinkedIn, telefone-exibição, degradações totais sem crash); FilterBar (busca client-side + multi-select intent/status + campanha via useCampaigns + período); hooks lista/new-count/mutation (silent p/ new→viewed, invalidação dupla → badge decrementa); APIs GET lista (LEFT embed leads, Map de campanha sem FK, insight p/ monitorados fail-soft) + new-count + PATCH (só grava status); Sidebar item + badge SEM adminOnly. Config de intent ADITIVA em types/opportunity.ts. ZERO migration; pipeline de ingestão intocado; ações do card = 21.5. Defaults das 3 Open Questions aplicados (snapshot write-once; busca client-side; created_at desc). +112 testes; suite 381 files/6491 pass/2 skip/0 fail; tsc 0 erros src/; eslint --max-warnings=0 limpo; build verde (rotas registradas). Status: review.
- 2026-07-14: Story 21.4 criada (create-story) — Central de Oportunidades (página + cards). PRIMEIRA story visual do Epic 21: renderiza `opportunities` (21.2/21.3/21.6) numa central cross-campanha. Espelha a feature Insights (página server + Suspense; content client com filtros/loading/error/empty; hook lista+count+mutation; API GET lista/new-count + PATCH status) + look de card do tracking (`OpportunityPanel`) + badge colorido do `LeadStatusBadge` + FilterBar do `MyLeadsFilterBar`. **Zero migration** (schema completo desde 00055/00057). Pontos críticos: LEFT embed de `leads` (lead_id nullable — NÃO `!inner`); nome de campanha por query+Map (sem FK); degradações obrigatórias do card (intent/lead/reply_text/unibox_url/insight nulos); transição `new→viewed` por interação (badge decrementa); SDR vê (sem adminOnly, AC7). Ações do card + rascunho IA = 21.5 (fora de escopo). 3 Open Questions p/ Fabossi (refresh de métricas write-once; busca client vs server; ordenação). PÓS-DEPLOY: rodar epic-21-post-deploy-checklist.md. Status: ready-for-dev.
