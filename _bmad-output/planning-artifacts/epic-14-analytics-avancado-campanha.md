# Epic 14: Analytics Avancado de Campanha

**Objetivo:** Enriquecer o dashboard de analytics de campanha com progresso visual, detalhamento por step, evolucao diaria e dados de email provider/security gateway do Instantly.

**Natureza:** Feature evolutiva — expande a analytics existente (Epic 10) sem modificar funcionalidades atuais.

**Dependencias:** Epic 10 (TrackingService, AnalyticsDashboard, LeadTrackingTable — todos done), Epic 7 (InstantlyService 7.2 — done)

**Contexto tecnico:** A API v2 do Instantly (`POST /api/v2/leads/list`) retorna 48 campos por lead. Atualmente mapeamos apenas 12 no tipo `InstantlyLeadEntry`. Campos disponiveis e nao utilizados incluem: `esp_code`, `esg_code`, `email_opened_step`, `email_replied_step`, `email_clicked_step`, `last_step_id`, `last_step_timestamp_executed`, `status_summary`, `lt_interest_status`, entre outros. Da mesma forma, `GET /api/v2/campaigns/analytics` retorna `leads_count`, `contacted_count`, `campaign_status` e `unsubscribed_count` que sao descartados no mapeamento atual. Os dados de `dailyAnalytics` ja sao buscados durante o sync mas nao sao exibidos na UI.

**Referencia API:** https://developer.instantly.ai/api-reference/lead/list-leads

---

## Story 14.1: Expandir Tipos e Mapeamento da API Instantly

**Como** desenvolvedor, **quero** expandir os tipos `InstantlyLeadEntry` e `CampaignAnalytics` para capturar todos os campos relevantes da API do Instantly, **para que** as stories subsequentes tenham os dados disponiveis sem mudancas adicionais na camada de servico.

### Acceptance Criteria

1. `InstantlyLeadEntry` expandido com campos: `esp_code`, `esg_code`, `email_opened_step`, `email_opened_variant`, `email_replied_step`, `email_replied_variant`, `email_clicked_step`, `email_clicked_variant`, `last_step_id`, `last_step_from`, `last_step_timestamp_executed`, `status_summary`, `lt_interest_status`
2. `CampaignAnalytics` expandido com campos: `leadsCount`, `contactedCount`, `campaignStatus`, `unsubscribedCount`
3. `mapToLeadTracking()` atualizado para incluir os novos campos no tipo `LeadTracking`
4. `TrackingService.getCampaignAnalytics()` atualizado para mapear `leads_count`, `contacted_count`, `campaign_status`
5. Tipo `LeadTracking` expandido com campos opcionais para os novos dados
6. Nenhuma alteracao na UI — apenas tipos, mapeamentos e servico
7. Testes unitarios atualizados para `mapToLeadTracking()` e `getCampaignAnalytics()`
8. Testes existentes continuam passando sem quebra

### Technical Notes

- Campos novos no `LeadTracking` devem ser opcionais (`?`) para nao quebrar consumidores existentes
- `esp_code` valores possiveis: Google, Microsoft, Zoho, AirMail, Yahoo, Yandex, Web.de, Libero.it, Other, Not Found
- `esg_code` valores possiveis: Barracuda, Mimecast, Proofpoint, Cisco (pode ser null/undefined se nenhum detectado)
- `dailyAnalytics` ja e buscado no sync — verificar se precisa de ajuste no tipo `SyncResult`

---

## Story 14.2: Barra de Progresso e Status da Campanha

**Como** usuario, **quero** ver o progresso da campanha (% de leads contatados) e o status atual (ativa/pausada/completa), **para que** eu saiba rapidamente em que ponto a campanha esta sem precisar ir ao Instantly.

### Acceptance Criteria

1. Componente `CampaignProgress` exibido acima dos AnalyticsCards
2. Barra de progresso visual mostrando `contactedCount / leadsCount` com porcentagem
3. Label descritivo: "X de Y leads contatados — Z%"
4. Badge de status da campanha (ex: "Ativa", "Pausada", "Completa", "Rascunho") com cores distintas
5. Se `leadsCount` for 0 ou indefinido, mostrar estado vazio gracioso (ex: "Aguardando dados...")
6. Componente responsivo — funciona bem em telas menores
7. Testes unitarios para o componente com diferentes cenarios (0%, 50%, 100%, sem dados)

### Technical Notes

- Posicionar entre `SyncIndicator` e `AnalyticsCards` na pagina de analytics
- Reutilizar componente `Progress` do shadcn/ui se disponivel
- `campaign_status` do Instantly pode vir como string — mapear para enum legivel em portugues

---

## Story 14.3: Grafico de Evolucao Diaria

**Como** usuario, **quero** ver um grafico mostrando a evolucao diaria de envios, aberturas e respostas, **para que** eu identifique tendencias e o ritmo da campanha ao longo do tempo.

### Acceptance Criteria

1. Componente `DailyAnalyticsChart` com grafico de linhas/area
2. Series: Enviados (sent), Aberturas (unique_opened), Respostas (unique_replies)
3. Eixo X: datas, Eixo Y: contagens
4. Tooltip ao passar o mouse mostrando valores de cada serie no dia
5. Dados vindos de `dailyAnalytics` (ja buscado durante sync, campo `SyncResult.dailyAnalytics`)
6. Se nao houver dados diarios, mostrar estado vazio: "Sincronize a campanha para ver a evolucao diaria"
7. Secao colapsavel (mesmo padrao do `ThresholdConfig`) para nao poluir a tela
8. Testes unitarios para renderizacao com dados e estado vazio

### Technical Notes

- `dailyAnalytics` ja e retornado pelo `POST /api/campaigns/[campaignId]/analytics/sync` mas nao e persistido no estado do hook — verificar se `useSyncAnalytics` precisa expor esse dado
- Usar biblioteca de charts ja no projeto (recharts) ou avaliar alternativa leve
- Respeitar o tema B&W (grayscale) definido na Epic 8

---

## Story 14.4: Detalhamento de Aberturas/Cliques/Respostas por Step

**Como** usuario, **quero** ver em qual step (email da sequencia) cada lead abriu, clicou ou respondeu, **para que** eu entenda qual mensagem esta gerando mais engajamento.

### Acceptance Criteria

1. Colunas adicionais ou indicadores na `LeadTrackingTable`: step de abertura, step de clique, step de resposta
2. Exibicao clara: "Step 1", "Step 2", etc. (com tooltip se necessario)
3. Se lead nao teve abertura/clique/resposta, mostrar "-"
4. Indicador do ultimo step executado (`last_step_id`) e quando (`last_step_timestamp_executed`)
5. Possibilidade de ordenar por step de abertura
6. `status_summary` exibido como badge visual (ex: "Completed", "Email opened", "Bounced", "Reply received")
7. Testes unitarios para renderizacao dos novos campos e ordenacao

### Technical Notes

- Campos `email_opened_step`, `email_replied_step`, `email_clicked_step` sao numeros (1, 2, 3...)
- `status_summary` e string retornada pelo Instantly — mapear para badges com cores
- Manter tabela nao poluida — avaliar se colunas extras ou expandable row detail

---

## Story 14.5: Email Provider e Security Gateway na Tabela de Leads

**Como** usuario, **quero** ver o provedor de email e o gateway de seguranca de cada lead na tabela de tracking, **para que** eu entenda o contexto de entregabilidade e confiabilidade dos dados de tracking.

### Acceptance Criteria

1. Coluna "Provedor" na `LeadTrackingTable` exibindo `esp_code` com icone representativo (Microsoft, Google, etc.)
2. Coluna "Gateway" exibindo `esg_code` (Proofpoint, Mimecast, Barracuda, Cisco) ou "Nenhum"
3. Icones/badges visuais para os provedores principais (Google, Microsoft, pelo menos)
4. Se `esp_code` for "Not Found" ou undefined, mostrar "Desconhecido"
5. Possibilidade de filtrar/ordenar por provedor
6. Tooltip explicativo: "Leads com Security Gateway podem ter dados de abertura menos confiaveis"
7. Testes unitarios para renderizacao dos provedores e gateways

### Technical Notes

- Icones podem ser logos simples ou badges coloridos (seguir padrao B&W do tema)
- `esp_code` e `esg_code` vem da API Instantly — sao dados de enrichment automatico deles
- Colunas podem ser opcionais/toggleable se a tabela ficar muito larga

---

## Story 14.6: Tooltip com Preview do Email por Step

**Como** usuario, **quero** ver qual email corresponde a cada step da sequencia (ex: assunto do email) ao passar o mouse sobre "Step N", **para que** eu nao precise sair da tela de analytics para entender qual mensagem gerou engajamento.

### Acceptance Criteria

1. Ao hover sobre "Step N" (nas colunas Step Abertura, Step Clique, Step Resposta), exibir tooltip com o assunto (subject) do email daquele step
2. Dados dos steps buscados via API Instantly (endpoint de sequencia/steps da campanha)
3. Cache dos steps no frontend — steps nao mudam durante a campanha, buscar apenas uma vez
4. Se dados de steps nao disponiveis, manter comportamento atual (exibir "Step N" sem tooltip)
5. Coluna "Ultimo Step" tambem enriquecida com subject no tooltip
6. Loading state gracioso enquanto steps sao carregados (nao bloquear renderizacao da tabela)
7. Testes unitarios para tooltip com subject, fallback sem dados, e estado de loading

### Technical Notes

- Requer novo endpoint: buscar steps/sequencia da campanha na API Instantly (ex: `GET /api/v2/campaigns/{id}/sequences` ou similar — verificar docs)
- Novo hook `useCampaignSteps(campaignId)` com `staleTime` longo (steps raramente mudam)
- Novo servico ou metodo no `TrackingService`: `getCampaignSteps()` retornando `{ stepNumber: number; subject: string }[]`
- Nova API route: `GET /api/campaigns/[campaignId]/steps`
- Nao requer persistencia — leitura pura da API Instantly
- Depende de 14.4 (colunas de step ja existentes)
- Referencia API Instantly: https://developer.instantly.ai/api-reference

---

## Story 14.7: Painel Lateral com Preview dos Steps da Campanha

**Como** usuario na tela de analytics, **quero** clicar em "Step N" na tabela de leads e ver um painel lateral com todos os emails da sequencia (subject + body), destacando o step clicado, **para que** eu entenda o conteudo completo que gerou engajamento sem sair da pagina de analytics.

### Acceptance Criteria

1. Ao clicar em "Step N" na coluna Step Abertura da LeadTrackingTable, abrir painel lateral (Sheet) do lado direito
2. O painel exibe TODOS os steps da campanha em sequencia vertical, cada um com subject e body em formato preview (mesmo pattern do CampaignPreviewPanel/PreviewEmailStep)
3. O step clicado fica visualmente destacado (highlight com borda primary + ring)
4. Scroll automatico ate o step destacado quando o painel abre
5. Se dados dos steps nao disponiveis, estado vazio gracioso
6. Painel com titulo "Steps da Campanha" e nome da campanha
7. Fechar painel via botao X ou click fora
8. Testes unitarios: click abre painel, step correto destacado, estado vazio, fechar painel
9. [Bug fix] Corrigir mapeamento off-by-one entre `email_opened_step` (0-based Instantly) e stepsMap

### Technical Notes

- Reutilizar `PreviewEmailStep` do builder (ja suporta subject + body + isHighlighted)
- Expandir endpoint `/api/campaigns/[campaignId]/steps` para retornar `body` alem de `subject`
- Expandir hook `useCampaignSteps` para retornar dados completos (stepsData + stepsMap)
- Referencia visual: CampaignPreviewPanel e LeadDetailPanel (ambos usam Sheet lateral)
- Depende de 14.6 (tooltip e hook useCampaignSteps)

---

## Ordem de Implementacao Sugerida

1. **14.1** (fundacao — tipos e mapeamento) — OBRIGATORIO primeiro
2. **14.2** (progresso da campanha) — independente apos 14.1
3. **14.3** (grafico diario) — independente apos 14.1
4. **14.4** (detalhe por step) — independente apos 14.1
5. **14.5** (email provider/gateway) — independente apos 14.1
6. **14.6** (tooltip preview email por step) — depende de 14.4
7. **14.7** (painel lateral preview steps) — depende de 14.6

Stories 14.2 a 14.5 podem ser implementadas em qualquer ordem apos 14.1.
Story 14.6 depende de 14.4 (colunas de step).
Story 14.7 depende de 14.6 (hook useCampaignSteps e tooltip).
