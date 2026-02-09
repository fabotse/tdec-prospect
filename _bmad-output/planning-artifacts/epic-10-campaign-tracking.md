# Epic 10: Campaign Tracking & Janela de Oportunidade

## Overview

Tracking automatizado de campanhas Instantly com dashboard de métricas, tracking granular por lead, e sistema de "Janela de Oportunidade" para identificar leads de alto interesse baseado em threshold configurável de aberturas de email. Inclui preparação arquitetural para automação futura de WhatsApp.

## Contexto

### Situação Atual
- **Campanhas exportadas, sem acompanhamento**: O TDEC Prospect exporta campanhas para o Instantly (Stories 7.2, 7.5 done), mas perde visibilidade sobre os resultados
- **`external_campaign_id` existe**: Story 7.3.1 implementou persistência com `external_campaign_id`, `export_platform`, `exported_at`, `export_status` — vínculo campanha local ↔ Instantly já funcional
- **InstantlyService funcional**: Criação de campanhas, gestão de leads, accounts — extensível para analytics
- **Supabase Edge Functions disponíveis**: Stack já suporta, apenas não usadas ainda
- **API Instantly v2 pesquisada**: 4 endpoints de analytics, Lead endpoint com `email_open_count` e `timestamp_last_open`, sistema de Webhooks com 19 event types — [pesquisa completa](research/instantly-campaign-tracking-api-research-2026-02-09.md)

### Objetivo
- Receber eventos de tracking do Instantly (opens, clicks, replies, bounces) em tempo real via webhooks
- Exibir dashboard de métricas agregadas por campanha
- Tracking granular por lead com timeline de eventos
- Identificar leads com alto interesse via threshold configurável (Janela de Oportunidade)
- Polling de analytics como backup/sincronização dos webhooks
- Preparar arquitetura para ações automatizadas futuras (WhatsApp)

### Infraestrutura Existente (referência)
- **InstantlyService** com gestão de campanhas — `src/lib/services/instantly.ts` (Story 7.2)
- **`external_campaign_id`** em tabela `campaigns` — `src/types/campaign.ts` (Story 7.3.1)
- **ExternalService base class** — `src/lib/services/base-service.ts`
- **Tema B&W** — Epic 8 (done)
- **Export Dialog** com plataformas — `src/components/builder/ExportDialog.tsx` (Story 7.4)
- **Supabase Client/Server** — `src/lib/supabase/client.ts`, `server.ts`

### Dependências
- **Story 7.2** (done): InstantlyService com API client configurado
- **Story 7.3.1** (done): `external_campaign_id` para vincular campanha local ↔ Instantly

### Decisões Arquiteturais
- **ADR-003**: Webhook Receiver via Supabase Edge Function (Deno)
- **ADR-004**: Estratégia Híbrida Webhook + Polling
- **ADR-005**: Preparação Arquitetural WhatsApp via IOpportunityAction

### Ordem de Execução

```
10.1 → 10.2 ──→ 10.4 ──→ 10.5 ──→ 10.6 ──→ 10.7
     → 10.3 ──┘                          └──→ 10.8
```

- 10.1 é fundação (schema + tipos)
- 10.2 e 10.3 podem ser paralelos (webhook e polling são independentes)
- 10.4 depende de 10.2 e 10.3 (dashboard consome ambos)
- 10.5 depende de 10.4 (detalhamento de lead)
- 10.6 depende de 10.5 (engine usa dados de lead)
- 10.7 depende de 10.6 (UI da Janela de Oportunidade)
- 10.8 pode ser paralelo com 10.7 (interfaces independentes)

---

## Stories

### Story 10.1: Schema de Tracking e Tipos

**Como** desenvolvedor,
**Quero** criar as tabelas de tracking e tipos TypeScript correspondentes,
**Para** que a infraestrutura de dados esteja pronta para receber eventos e configurar a Janela de Oportunidade.

**Critérios de Aceite:**

1. **Given** a migration é executada
   **When** as tabelas são criadas no Supabase
   **Then** a tabela `campaign_events` existe com colunas: `id`, `tenant_id`, `campaign_id`, `event_type`, `lead_email`, `event_timestamp`, `payload`, `source`, `processed_at`, `created_at`
   **And** a UNIQUE constraint `(campaign_id, event_type, lead_email, event_timestamp)` existe para idempotência
   **And** os índices `idx_campaign_events_campaign_id`, `idx_campaign_events_campaign_lead`, `idx_campaign_events_campaign_type` são criados

2. **Given** a migration é executada
   **When** a tabela `opportunity_configs` é criada
   **Then** contém colunas: `id`, `tenant_id`, `campaign_id`, `min_opens`, `period_days`, `is_active`, `created_at`, `updated_at`
   **And** a UNIQUE constraint `(campaign_id)` existe (uma config por campanha)
   **And** defaults são `min_opens=3`, `period_days=7`

3. **Given** as tabelas existem
   **When** RLS policies são aplicadas
   **Then** `campaign_events` filtra por `tenant_id = auth.jwt() ->> 'tenant_id'`
   **And** `opportunity_configs` filtra por `tenant_id = auth.jwt() ->> 'tenant_id'`

4. **Given** os tipos TypeScript são criados
   **When** importados em `src/types/tracking.ts`
   **Then** existem interfaces: `CampaignEvent`, `CampaignAnalytics`, `LeadTracking`, `OpportunityConfig`, `OpportunityLead`, `InstantlyWebhookEvent`, `SyncResult`
   **And** existem enums/constantes para `EventType` ('email_opened', 'email_clicked', 'email_replied', 'email_bounced', 'email_unsubscribed')
   **And** os tipos são re-exportados em `src/types/index.ts`

5. **Given** os tipos existem
   **When** compilados com TypeScript strict mode
   **Then** zero erros de compilação
   **And** os tipos são compatíveis com o schema do banco

**Arquivos Afetados:**
- `supabase/migrations/000XX_create_campaign_events.sql` — nova migration
- `supabase/migrations/000XX_create_opportunity_configs.sql` — nova migration
- `src/types/tracking.ts` — novo: tipos de tracking
- `src/types/index.ts` — re-export

**Testável Isoladamente:** Migration roda, tipos compilam, RLS funciona. Pode ser verificado via Supabase Studio e `npx tsc --noEmit`.

**Notas Técnicas:**
- Seguir padrão de naming do projeto: snake_case para tabelas/colunas
- `event_timestamp` é o timestamp do evento no Instantly, diferente de `created_at` (quando foi inserido no nosso banco)
- Campo `source` distingue se o evento veio de webhook ou polling
- `payload` armazena o JSON completo do evento original para auditoria

---

### Story 10.2: Webhook Receiver (Supabase Edge Function)

**Como** sistema,
**Quero** receber eventos de tracking do Instantly via webhook em tempo real,
**Para** que os dados de opens, clicks, replies e bounces sejam persistidos automaticamente.

**Critérios de Aceite:**

1. **Given** a Edge Function `instantly-webhook` é criada
   **When** recebe um POST com payload válido do Instantly
   **Then** responde 200 OK imediatamente
   **And** persiste o evento na tabela `campaign_events`
   **And** o campo `source` é `'webhook'`

2. **Given** o webhook recebe um evento
   **When** o `campaign_id` do Instantly é mapeado via `external_campaign_id`
   **Then** o `campaign_id` local correto é associado ao evento
   **And** o `tenant_id` é derivado da campanha encontrada

3. **Given** o webhook recebe um evento duplicado
   **When** o mesmo `(campaign_id, event_type, lead_email, event_timestamp)` já existe
   **Then** o INSERT é ignorado silenciosamente (ON CONFLICT DO NOTHING)
   **And** a resposta continua sendo 200 OK

4. **Given** o webhook recebe um payload inválido (campos obrigatórios faltando)
   **When** `event_type`, `lead_email` ou `campaign_id` estão ausentes
   **Then** responde 400 Bad Request com mensagem de erro
   **And** nenhum evento é persistido

5. **Given** o webhook recebe um evento com `campaign_id` desconhecido
   **When** nenhuma campanha local tem aquele `external_campaign_id`
   **Then** o evento é descartado
   **And** responde 200 OK (não causa retry no Instantly)
   **And** um log de warning é emitido

6. **Given** o webhook está configurado no Instantly
   **When** um email é aberto, clicado, respondido ou bounced
   **Then** o evento correspondente é recebido e persistido
   **And** os event types suportados são: `email_opened`, `email_link_clicked`, `reply_received`, `email_bounced`, `lead_unsubscribed`

**Arquivos Afetados:**
- `supabase/functions/instantly-webhook/index.ts` — novo: Edge Function principal
- Configuração de deploy da Edge Function

**Testável Isoladamente:** `curl` com payload simulado para a Edge Function, evento persiste na tabela `campaign_events`. Pode testar localmente com `supabase functions serve`.

**Notas Técnicas:**
- Runtime Deno (Supabase Edge Functions) — diferente do Node.js do projeto
- Usar `supabase-js` client com `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS para insert)
- Responder 200 rapidamente — Instantly requer resposta rápida e faz retry em 5xx
- Campo `is_first` do payload do Instantly pode ser armazenado no `payload` JSONB para uso futuro
- Deploy: `supabase functions deploy instantly-webhook`
- Referência API: [Pesquisa Instantly v2](research/instantly-campaign-tracking-api-research-2026-02-09.md) — Seção 3 (Webhooks)

---

### Story 10.3: Instantly Analytics Service (Polling)

**Como** desenvolvedor,
**Quero** implementar um serviço de polling de analytics da API Instantly,
**Para** que as métricas de campanha sejam sincronizadas como backup dos webhooks.

**Critérios de Aceite:**

1. **Given** o `TrackingService` é criado
   **When** `getCampaignAnalytics(campaignId)` é chamado
   **Then** busca o `external_campaign_id` da campanha local
   **And** faz request para `GET /api/v2/campaigns/analytics?id={external_campaign_id}`
   **And** retorna `CampaignAnalytics` com totals: opens, clicks, replies, bounces, taxas percentuais

2. **Given** o `TrackingService` existe
   **When** `syncAnalytics(campaignId)` é chamado
   **Then** busca analytics agregados da API Instantly
   **And** busca daily analytics para gráfico de evolução
   **And** retorna `SyncResult` com dados de campanha + data da última sincronização

3. **Given** o `TrackingService` existe
   **When** `getLeadTracking(campaignId)` é chamado
   **Then** busca leads da campanha via `POST /api/v2/leads/list` com filtro `campaign={external_campaign_id}`
   **And** retorna lista de `LeadTracking` com `openCount`, `clickCount`, `hasReplied`, `lastOpenAt` por lead

4. **Given** o `TrackingService` herda de `ExternalService`
   **When** ocorre erro de rede ou timeout
   **Then** segue o padrão de error handling existente (retry 1x, abort timeout)
   **And** retorna erro traduzido em português

5. **Given** o `TrackingService` faz polling
   **When** a campanha não tem `external_campaign_id` (nunca foi exportada)
   **Then** retorna erro claro indicando que a campanha precisa ser exportada primeiro

6. **Given** os dados de polling são recebidos
   **When** processados pelo service
   **Then** a resposta inclui `lastSyncAt` com timestamp da sincronização
   **And** os dados são retornáveis pelo hook sem persistir (polling é read-only, dados vêm direto da API)

**Arquivos Afetados:**
- `src/lib/services/tracking.ts` — novo: TrackingService
- `src/hooks/use-campaign-analytics.ts` — novo: hook TanStack Query para analytics
- `src/hooks/use-lead-tracking.ts` — novo: hook TanStack Query para lead tracking

**Testável Isoladamente:** API call com `external_campaign_id` de campanha real, dados retornam corretamente. Mock dos endpoints Instantly para testes unitários.

**Notas Técnicas:**
- Reutilizar o `apiKey` que já está no `InstantlyService` — o `TrackingService` precisa de acesso à mesma API key
- Usar `exclude_total_leads_count=true` para performance no analytics endpoint
- Paginação de leads via cursor (`starting_after`) com `limit=100`
- Não persistir dados de polling em `campaign_events` — polling retorna dados agregados, webhooks dão granularidade. O dashboard exibe dados diretamente do polling response (via TanStack Query cache)
- Referência API: [Pesquisa Instantly v2](research/instantly-campaign-tracking-api-research-2026-02-09.md) — Seções 1 e 2

---

### Story 10.4: Campaign Analytics Dashboard UI

**Como** usuário,
**Quero** ver um dashboard de métricas da minha campanha exportada,
**Para** acompanhar o desempenho de opens, clicks, replies e bounces sem sair do TDEC Prospect.

**Critérios de Aceite:**

1. **Given** o usuário acessa a página de analytics de uma campanha exportada
   **When** a página `/campaigns/[campaignId]/analytics` carrega
   **Then** exibe cards de métricas: Total Enviados, Aberturas, Cliques, Respostas, Bounces
   **And** cada card mostra valor absoluto e taxa percentual
   **And** segue o tema B&W do projeto

2. **Given** os dados de analytics estão carregando
   **When** a query está em estado `isLoading`
   **Then** exibe skeletons nos cards de métricas
   **And** exibe skeleton no gráfico

3. **Given** o dashboard está exibido
   **When** o usuário vê o indicador de sync
   **Then** mostra quando foi a última sincronização
   **And** disponibiliza botão "Sincronizar" para polling manual

4. **Given** o usuário clica em "Sincronizar"
   **When** o polling é executado
   **Then** exibe loading indicator durante a sincronização
   **And** atualiza os cards com dados frescos
   **And** exibe toast de sucesso ou erro

5. **Given** a campanha não foi exportada (sem `external_campaign_id`)
   **When** o usuário acessa a página de analytics
   **Then** exibe estado vazio com mensagem "Esta campanha ainda não foi exportada"
   **And** sugere exportar a campanha primeiro

6. **Given** a página de edição da campanha
   **When** a campanha tem `external_campaign_id`
   **Then** exibe link/botão "Ver Analytics" para navegar para a página de analytics

**Arquivos Afetados:**
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — nova página
- `src/components/tracking/AnalyticsDashboard.tsx` — novo: componente principal
- `src/components/tracking/AnalyticsCards.tsx` — novo: cards de métricas
- `src/components/tracking/SyncIndicator.tsx` — novo: indicador de sync + botão
- `src/components/tracking/index.ts` — novo: barrel export
- `src/app/(dashboard)/campaigns/[campaignId]/edit/page.tsx` — adicionar link para analytics

**Testável Isoladamente:** Dados mockados, UI renderiza corretamente. Cards mostram valores, skeleton aparece durante loading, estado vazio funciona.

**Notas Técnicas:**
- Usar `use-campaign-analytics` hook (Story 10.3) para buscar dados
- TanStack Query com `staleTime` de 5 minutos — dados de analytics não mudam em tempo real
- Cards seguem padrão visual do projeto (shadcn Card + tema B&W)
- Layout responsivo: 4 cards em row desktop, 2 em mobile
- Gráfico de evolução diária pode ser feito com barras simples (sem lib de chart externa por enquanto — CSS/Tailwind)

---

### Story 10.5: Lead Tracking Detail

**Como** usuário,
**Quero** ver os dados de tracking por lead individual na campanha,
**Para** identificar quais leads estão engajando mais com meus emails.

**Critérios de Aceite:**

1. **Given** o dashboard de analytics está exibido
   **When** o usuário navega para a seção de lead tracking
   **Then** exibe tabela estilo Airtable com: Email, Nome, Aberturas, Cliques, Respondeu, Último Open
   **And** a tabela suporta ordenação por qualquer coluna
   **And** segue o tema B&W do projeto

2. **Given** a tabela de leads está exibida
   **When** a coluna "Aberturas" é clicada
   **Then** ordena leads por número de aberturas (descendente por padrão)
   **And** indicador visual mostra a direção da ordenação

3. **Given** a tabela de leads está exibida
   **When** um lead tem `openCount >= 3` (default threshold)
   **Then** exibe badge visual "Alto Interesse" ou similar ao lado do nome
   **And** o badge usa cor de destaque dentro do tema B&W

4. **Given** os dados de lead tracking estão carregando
   **When** a query está em estado `isLoading`
   **Then** exibe skeleton rows na tabela

5. **Given** a campanha tem muitos leads
   **When** a lista excede a visualização
   **Then** suporta paginação ou scroll infinito
   **And** exibe contagem total de leads

6. **Given** a tabela de leads está exibida
   **When** não há dados de tracking para nenhum lead
   **Then** exibe estado vazio "Nenhum evento de tracking recebido ainda"

**Arquivos Afetados:**
- `src/components/tracking/LeadTrackingTable.tsx` — novo: tabela de leads
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — integrar tabela no dashboard

**Testável Isoladamente:** Dados seed/mockados, tabela renderiza, ordenação funciona, badge aparece, paginação funciona.

**Notas Técnicas:**
- Usar `use-lead-tracking` hook (Story 10.3) para buscar dados
- Reutilizar padrão de tabela do shadcn/ui (`<Table>`)
- Ordenação client-side (dados já carregados via TanStack Query)
- Badge "Alto Interesse" pode usar threshold hardcoded por enquanto (3 opens) — Story 10.6 tornará configurável
- Paginação via cursor do Instantly (`starting_after`) ou client-side se volume for baixo

---

### Story 10.6: Janela de Oportunidade — Engine + Config

**Como** usuário,
**Quero** configurar o threshold da Janela de Oportunidade e ver quais leads se qualificam,
**Para** identificar leads de alto interesse que merecem ação imediata.

**Critérios de Aceite:**

1. **Given** o `OpportunityEngine` é criado
   **When** `evaluateOpportunityWindow(campaignId, config)` é chamado
   **Then** filtra leads cujo `openCount >= config.minOpens`
   **And** filtra leads cujo último open está dentro de `config.periodDays` dias
   **And** retorna lista de `OpportunityLead` com `qualifiedAt` e `isInOpportunityWindow`

2. **Given** o `OpportunityEngine` existe
   **When** `getConfig(campaignId)` é chamado
   **Then** busca config ativa na tabela `opportunity_configs`
   **And** se não existe, retorna defaults: `minOpens=3`, `periodDays=7`

3. **Given** o `OpportunityEngine` existe
   **When** `saveConfig(config)` é chamado
   **Then** salva/atualiza config na tabela `opportunity_configs` (upsert via UNIQUE campaign_id)
   **And** valida que `minOpens >= 1` e `periodDays >= 1`

4. **Given** o componente `ThresholdConfig` é renderizado
   **When** o usuário vê a configuração
   **Then** exibe inputs para "Mínimo de aberturas" e "Período em dias"
   **And** mostra valores atuais ou defaults
   **And** preview do número de leads que se qualificam com a config atual

5. **Given** o usuário altera o threshold
   **When** salva a nova configuração
   **Then** a lista de leads na Janela de Oportunidade é reatualizada
   **And** exibe toast de confirmação "Configuração salva"
   **And** o preview atualiza imediatamente (otimistic update ou refetch)

6. **Given** o hook `use-opportunity-window` é criado
   **When** usado pelo componente
   **Then** encapsula `OpportunityEngine.evaluateOpportunityWindow` + `getConfig` + `saveConfig`
   **And** usa TanStack Query para cache e mutations

**Arquivos Afetados:**
- `src/lib/services/opportunity-engine.ts` — novo: OpportunityEngine
- `src/components/tracking/ThresholdConfig.tsx` — novo: config inline
- `src/hooks/use-opportunity-window.ts` — novo: hook TanStack Query
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — integrar config

**Testável Isoladamente:** Engine retorna leads corretos com threshold mockado. Config salva e carrega. Preview atualiza ao mudar threshold.

**Notas Técnicas:**
- OpportunityEngine avalia leads usando dados do `use-lead-tracking` (já carregados)
- Config pode ser avaliada client-side para preview rápido (filtro sobre dados em memória)
- Persistência da config via API route ou Server Action que chama Supabase
- Validação com Zod: `minOpens: z.number().min(1)`, `periodDays: z.number().min(1)`
- Considerar debounce no preview durante digitação

---

### Story 10.7: Janela de Oportunidade — UI + Notificações

**Como** usuário,
**Quero** ver a lista de leads na Janela de Oportunidade com destaque visual e notificações,
**Para** agir rapidamente sobre leads de alto interesse.

**Critérios de Aceite:**

1. **Given** o `OpportunityPanel` é renderizado
   **When** existem leads qualificados na Janela de Oportunidade
   **Then** exibe lista focada dos leads quentes com: Email, Nome, Aberturas, Último Open
   **And** visual de destaque (borda, ícone ou badge) indica alto interesse
   **And** segue o tema B&W com cor de acento para destaque

2. **Given** o `OpportunityPanel` está exibido
   **When** não há leads qualificados
   **Then** exibe estado vazio "Nenhum lead atingiu o threshold atual"
   **And** sugere ajustar o threshold (link para ThresholdConfig)

3. **Given** o dashboard de analytics é acessado
   **When** existem leads na Janela de Oportunidade
   **Then** exibe badge/contador na navegação ou header "X leads quentes"
   **And** toast discreto notifica ao acessar se há novos leads qualificados desde a última visita

4. **Given** a LeadTrackingTable (Story 10.5)
   **When** um lead está na Janela de Oportunidade
   **Then** o badge "Alto Interesse" na tabela usa o threshold configurado (não mais hardcoded)
   **And** o badge é clicável e scrolla/navega até o OpportunityPanel

5. **Given** o OpportunityPanel está exibido
   **When** o usuário vê um lead quente
   **Then** pode ver dados de contato (email, telefone se disponível)
   **And** a seção indica "(WhatsApp em breve)" se ação futura estiver preparada

6. **Given** o layout do dashboard de analytics
   **When** todos os componentes estão integrados
   **Then** a ordem vertical é: Cards de Métricas → Gráfico → Janela de Oportunidade → LeadTrackingTable
   **And** o layout é responsivo e legível em mobile

**Arquivos Afetados:**
- `src/components/tracking/OpportunityPanel.tsx` — novo: painel de leads quentes
- `src/components/tracking/LeadTrackingTable.tsx` — atualizar badge para usar threshold dinâmico
- `src/app/(dashboard)/campaigns/[campaignId]/analytics/page.tsx` — integrar OpportunityPanel + layout final

**Testável Isoladamente:** UI renderiza, badge aparece em leads qualificados, estado vazio funciona, toast dispara, layout responsivo ok.

**Notas Técnicas:**
- OpportunityPanel usa `use-opportunity-window` hook (Story 10.6)
- Toast via shadcn/ui `toast()` — mesmo padrão do projeto
- Badge na LeadTrackingTable agora dinâmico: `lead.openCount >= config.minOpens`
- "(WhatsApp em breve)" pode ser derivado de `IOpportunityAction.isAvailable()` (Story 10.8)
- Considerar lazy load do OpportunityPanel se a avaliação for pesada

---

### Story 10.8: Preparação Arquitetural WhatsApp

**Como** desenvolvedor,
**Quero** criar interfaces extensíveis para ações automatizadas baseadas na Janela de Oportunidade,
**Para** que a integração com WhatsApp (e outras ações) possa ser adicionada no futuro sem refactoring.

**Critérios de Aceite:**

1. **Given** a interface `IOpportunityAction` é criada
   **When** compilada com TypeScript strict mode
   **Then** contém: `type: string`, `label: string`, `execute(lead: OpportunityLead): Promise<ActionResult>`, `isAvailable(): boolean`
   **And** o tipo `ActionResult` contém: `success: boolean`, `message: string`

2. **Given** o `WhatsAppActionStub` implementa `IOpportunityAction`
   **When** `execute()` é chamado
   **Then** retorna `{ success: false, message: 'WhatsApp não configurado' }`
   **And** `isAvailable()` retorna `false`
   **And** `type` é `'whatsapp'` e `label` é `'WhatsApp'`

3. **Given** o `OpportunityActionRegistry` é criado
   **When** ações são registradas
   **Then** `register(action)` adiciona ao Map interno
   **And** `getAvailable()` retorna apenas ações onde `isAvailable()` é `true`
   **And** o registry é inicializado com `WhatsAppActionStub` registrado

4. **Given** o registry existe
   **When** `getAvailable()` é chamado (nenhuma ação real configurada)
   **Then** retorna array vazio (WhatsAppStub.isAvailable() é false)
   **And** nenhum erro é lançado

5. **Given** todos os artefatos são criados
   **When** compilados com `npx tsc --noEmit`
   **Then** zero erros de compilação
   **And** os testes unitários passam

6. **Given** a UI mostra o OpportunityPanel (Story 10.7)
   **When** `getAvailable()` retorna vazio
   **Then** pode opcionalmente exibir "(WhatsApp em breve)" baseado na presença do stub no registry

**Arquivos Afetados:**
- `src/types/opportunity-action.ts` — novo: interfaces IOpportunityAction, ActionResult
- `src/lib/services/opportunity-action-registry.ts` — novo: OpportunityActionRegistry
- `src/lib/services/actions/whatsapp-stub.ts` — novo: WhatsAppActionStub

**Testável Isoladamente:** Interface compila, stub executa sem erro, registry funciona. Zero erros de compilação.

**Notas Técnicas:**
- Escopo MÍNIMO: 1 interface + 1 stub + 1 registry
- Nenhuma integração real com WhatsApp API
- Nenhuma UI de configuração de WhatsApp
- Stubs servem como documentação viva do contrato
- O registry é singleton ou instanciado na inicialização da app
- Padrão Strategy + Registry — adicionar novas ações no futuro é apenas criar uma classe e chamar `registry.register(new NovaAcao())`

---

## Referências

- [Pesquisa API Instantly v2](research/instantly-campaign-tracking-api-research-2026-02-09.md)
- [Sprint Change Proposal](sprint-change-proposal-2026-02-09.md)
- [Architecture — ADRs 003-005](architecture.md#adr-003-webhook-receiver-architecture)
- [PRD — FR50-FR56](prd.md#campaign-tracking--janela-de-oportunidade)
- [Epic 7 — Campaign Deployment & Export](epic-7-campaign-deployment-export.md)

---

*Epic criado em: 2026-02-09*
*Sprint Change Proposal aprovado por: Fabossi*
*Total de stories: 8*
