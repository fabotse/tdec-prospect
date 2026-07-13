---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
status: complete
completedAt: 2026-07-13
inputDocuments:
  - plano-evolucao-maquina-de-resultado-2026-07-10.md
  - ../implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md
  - architecture.md
  - ux-design-specification.md
  - prd.md
---

# tdec-prospect - Epic Breakdown: Loop de Resposta ("Pop-up do Lead")

## Overview

Este documento contém o breakdown de epic e stories para o Loop de Resposta (Epic 21), decompondo a Fase 1 do Plano de Evolução "Máquina de Resultado" em stories implementáveis. A numeração continua a sequência do projeto (Epics 1–20 já implementados; Epic 18 em backlog).

**Contexto:** Projeto brownfield. O momento de maior valor do funil — o lead respondeu — hoje não dispara nada: o webhook grava em `campaign_events` e a reconciliação é manual via CSV. Este epic fecha o loop: resposta → classificação de intenção por IA → Central de Oportunidades → notificação proativa no WhatsApp do vendedor.

**Natureza:** Feature aditiva — não modifica o receiver do webhook (Epic 10) nem funcionalidades existentes.

**Dependências:** Epic 10 (instantly-webhook, `campaign_events`, opportunity-engine), Epic 11 (ZApiService, WhatsApp), Epic 13 (padrão de sugestão de abordagem por IA, fail-open), Epic 14 (`lt_interest_status` mapeado), Knowledge Base (contexto para rascunhos).

**Spike de validação:** `_bmad-output/implementation-artifacts/epic-21-api-validation-spike-2026-07-13.md` — webhook `reply_received` entrega `reply_text`/`reply_html` completos; nosso receiver já persiste o payload bruto em `campaign_events.payload` (JSONB); fallback por polling via `GET /api/v2/emails` (`email_type=received`, rate limit 20 req/min); `lt_interest_status` com escala documentada (Interested=1 … Not Interested=-1).

> **⚠️ ATUALIZAÇÃO 2026-07-13 — Validação real concluída + re-sequenciamento (decisão Fabossi).**
> As 4 pendências do spike foram fechadas com chamadas reais (ver seção "✅ VALIDAÇÃO REAL EXECUTADA" no artefato do spike):
> **webhooks estão BLOQUEADOS no plano do cliente** e `campaign_events` está vazia (webhook nunca ativo) — mas **`GET /api/v2/emails` funciona** (texto completo das respostas, escopo `all:all`, histórico disponível).
> A cláusula condicional deste épico foi **ativada**, com dois efeitos:
> 1. **Polling é o caminho primário de ingestão** — o sweep da antiga Story 21.8 foi **absorvido pela Story 21.2** (agora "Ingestão de Respostas por Polling + Processador + Backfill"). O receiver de webhook (Epic 10) permanece intocado como upgrade path futuro. NFR3 (≤5 min) permanece atingível: 1 chamada workspace-wide por ciclo, cron ≤5 min (1 de 20 req/min).
> 2. **Decisão de produto:** com poucas respostas esperadas nas campanhas, **abertura/clique é o gatilho dominante** da Central — a **Story 21.6 foi promovida** para logo após a 21.2 (engajamento já flui 100% por polling existente do Epic 10).
>
> **Sequência revisada (7 stories):** 21.1 → 21.2' → **21.6** → 21.3 → 21.4 → 21.5 → 21.7. A 21.8 deixa de existir como story separada.

## Requirements Inventory

### Functional Requirements

**Detecção e Classificação de Respostas**
- FR1: Sistema detecta automaticamente respostas de leads via polling da API Instantly (`GET /api/v2/emails`, `email_type=received`), sem reconciliação manual — webhook `reply_received` como upgrade path futuro se o plano do cliente mudar (revisado 2026-07-13: webhooks bloqueados no plano atual)
- FR2: Sistema diferencia respostas automáticas (`auto_reply_received`, out-of-office) de respostas reais — auto-reply não gera lead quente
- FR3: Sistema classifica a intenção da resposta por IA: `interessado` / `pediu_info` / `objecao` / `nao_agora` / `opt_out`
- FR4: Sistema combina a classificação IA com o `lt_interest_status` nativo do Instantly quando disponível
- FR5: Sistema atualiza o status do lead automaticamente conforme a classificação (ex.: → `interessado`)
- FR6: Sistema registra a resposta no histórico de interações do lead (`lead_interactions`)
- FR7: Sistema processa retroativamente respostas já armazenadas em `campaign_events` (backfill)
- FR17: Sistema ingere respostas periodicamente via polling (`GET /api/v2/emails`) como **caminho primário** de detecção (revisado 2026-07-13 — webhooks indisponíveis no plano do cliente); se webhooks forem habilitados no futuro, o dual-source webhook+polling deduplica pela constraint existente — nenhuma resposta se perde silenciosamente

**Central de Oportunidades**
- FR8: Usuário pode acessar Central de Oportunidades cross-campanha (nova página na sidebar, badge de contagem)
- FR9: Card de oportunidade exibe contexto completo: lead, empresa, campanha, texto da resposta, engajamento (opens/clicks), insight LinkedIn (se monitorado), telefone, link para o Unibox
- FR10: IA gera sugestão de próximo passo / rascunho de resposta para cada oportunidade
- FR11: Usuário pode agir do card: enviar WhatsApp (Z-API), copiar rascunho, `mailto:`, buscar telefone (SignalHire), marcar como `oportunidade`/descartar
- FR12: Janela de Oportunidade (aberturas/cliques) passa a alimentar a Central cross-campanha, além do analytics por campanha
- FR16: Usuário pode registrar "reunião marcada" com 1 clique no card (alimenta futuro relatório ROI — Epic 23)

**Notificações**
- FR13: Sistema envia notificação proativa de lead quente via WhatsApp (Z-API) para números configurados do tenant
- FR14: Sistema exibe notificação in-app persistida em banco (não localStorage); badge da sidebar tem fonte única — contagem de oportunidades `new` (definida em 21.4)
- FR15: Admin pode configurar canais de notificação (números, ativar/desativar) em Configurações

### NonFunctional Requirements

- NFR1: Classificação fail-open — falha da IA não bloqueia o registro da resposta (padrão Epic 13)
- NFR2: Processamento idempotente — cada evento de `campaign_events` classificado no máximo 1 vez (constraint unique preservada)
- NFR3: Notificação proativa em ≤5 min após o evento de resposta
- NFR4: RLS por `tenant_id` em toda tabela nova; mensagens de erro em PT-BR
- NFR5: A ingestão por polling (story 21.2, sweep ex-21.8) respeita o rate limit do Instantly (20 req/min) e não duplica eventos (dedupe pela UNIQUE constraint de `campaign_events`)
- NFR6: Custo de IA por classificação ~centavos (gpt-4o-mini), registrado em `api_usage_logs`

### Additional Requirements

**Da Arquitetura / Spike:**
- Consumidor **aditivo** de `campaign_events` — o receiver do webhook (Edge Function `instantly-webhook`) não é modificado
- Novos prompts (`reply_intent_classification`, `opportunity_next_step`) no padrão `ai_prompts` com fallback tenant→global→código (ADR-001)
- Reuso obrigatório: `ZApiService` (Epic 11), padrão `monitoring_approach_suggestion` (Epic 13), `opportunity-engine` (Epic 10), mapeamento `lt_interest_status` (Epic 14), fluxo SignalHire por lead
- As 4 pendências do spike (webhook registrado no workspace do cliente, gating de plano Growth, backfill real em `campaign_events`, escopo `emails:read` da API key) são validadas na primeira story
- API routes (não Server Actions) para integrações externas; TanStack Query no frontend — padrões existentes

### UX Design Requirements

- UX-DR1: Central de Oportunidades segue o padrão visual existente (B&W + cor de acento, cards estilo Attio); item de sidebar com badge de contagem no padrão da página Insights
- UX-DR2: Estados vazio / loading (skeleton) / erro no padrão dos componentes de tracking existentes (`OpportunityPanel`, `LeadTrackingTable`)

### Fora do Escopo (exclusões conscientes)

- **Lembrete/follow-up agendado:** a Jornada 2 do UX spec prevê "Agendar lembrete" para desfechos "vai pensar"/"não atendeu". Excluído deste épico — coerente com a diretriz "não virar CRM" do plano de evolução. Intents `nao_agora`/`objecao` permanecem visíveis na Central para triagem manual.
- **Canal e-mail de notificação:** citado no plano de evolução ("WhatsApp + e-mail + badge"), excluído do épico — WhatsApp + in-app cobrem o speed-to-lead; e-mail exigiria infra de envio transacional nova (provedor + templates). Candidato a story futura.
- **Exibir `lt_interest_status` na LeadTrackingTable** (quick win #1 do plano): fora do épico — melhoria UI-only independente (dado já mapeado em `src/lib/services/tracking.ts:166`), a ser entregue avulsa, podendo sair antes do épico.

### FR Coverage Map

| FR | Épico | Resumo |
|---|---|---|
| FR1 | Epic 21 | Detecção automática de reply via webhook |
| FR2 | Epic 21 | Filtro de auto-replies (out-of-office) |
| FR3 | Epic 21 | Classificação de intenção por IA |
| FR4 | Epic 21 | Ensemble com `lt_interest_status` do Instantly |
| FR5 | Epic 21 | Auto-atualização de status do lead |
| FR6 | Epic 21 | Registro em `lead_interactions` |
| FR7 | Epic 21 | Backfill de respostas retroativas |
| FR8 | Epic 21 | Central de Oportunidades (página + sidebar + badge) |
| FR9 | Epic 21 | Card de oportunidade com contexto completo |
| FR10 | Epic 21 | Rascunho de próximo passo por IA |
| FR11 | Epic 21 | Ações do card (WhatsApp, mailto, telefone, status) |
| FR12 | Epic 21 | Janela de Oportunidade cross-campanha |
| FR13 | Epic 21 | Notificação proativa via WhatsApp |
| FR14 | Epic 21 | Notificação in-app persistida em banco |
| FR15 | Epic 21 | Configuração de canais de notificação |
| FR16 | Epic 21 | Registro de reunião marcada (1 clique) |
| FR17 | Epic 21 | Reconciliação por polling (rede de segurança do webhook) |

Cobertura: 17/17 FRs mapeados, sem órfãos.

## Epic List

### Epic 21: Loop de Resposta — "Pop-up do Lead"

Quando um lead responde uma campanha, o sistema detecta, classifica a intenção por IA e entrega a oportunidade pronta ao vendedor — na Central de Oportunidades e no WhatsApp — com contexto completo e rascunho de próximo passo. Elimina a reconciliação manual de respostas via CSV e transforma a plataforma de "ferramenta de envio" em "máquina que entrega leads qualificados".

**FRs cobertos:** FR1–FR17 (todos)

**Standalone:** usa apenas Epics 10/11/13/14 (todos done); não requer épicos futuros. Habilita os Epics 22 (lead score alimenta a Central) e 23 (FR16 alimenta o relatório de ROI).

**Sequência interna de valor (revisada 2026-07-13):** fundação (schema + validações do spike ✅) → ingestão (sweep de polling + processador + backfill — 21.2', absorve a antiga 21.8) → **engajamento (21.6 promovida — gatilho dominante: aberturas/cliques)** → inteligência (classificação IA + ensemble) → entrega (Central de Oportunidades + ações) → proatividade (notificações + config).

---

## Epic 21: Loop de Resposta — "Pop-up do Lead"

Quando um lead responde uma campanha, o sistema detecta, classifica a intenção por IA e entrega a oportunidade pronta ao vendedor — na Central de Oportunidades e no WhatsApp — com contexto completo e rascunho de próximo passo.

### Story 21.1: Schema de Oportunidades, Tipos e Validação Real do Spike

As a desenvolvedor,
I want criar a estrutura de dados do loop de resposta e concluir as validações reais pendentes do spike,
So that as stories seguintes tenham fundação de dados e zero incerteza operacional.

**Acceptance Criteria:**

1. **Given** a migration é aplicada **When** o schema é inspecionado **Then** existe a tabela `opportunities` com: `id`, `tenant_id`, `lead_id`, `campaign_id`, `source` (enum: `reply`/`engagement`), `reply_event_id` (FK `campaign_events`, nullable), `reply_text`, `reply_subject`, `unibox_url`, `intent` (enum: `interessado`/`pediu_info`/`objecao`/`nao_agora`/`opt_out`, nullable), `lt_interest_status` (int, nullable), `suggestion` (text, nullable), `status` (enum: `new`/`viewed`/`contacted`/`meeting_booked`/`discarded`), `meeting_booked_at` (nullable), `created_at`, `updated_at` **And** constraint UNIQUE em `reply_event_id` (idempotência — NFR2)
2. **Given** a migration é aplicada **Then** existem as tabelas `notification_settings` (por tenant: números WhatsApp destino, canais habilitados) e `app_notifications` (in-app persistida: `tenant_id`, `type`, `payload` JSONB, `read_at` nullable)
3. **Given** as tabelas novas **Then** RLS por `tenant_id` aplicada no padrão existente **And** trigger `update_updated_at_column()` **And** índices `idx_opportunities_tenant_status`, `idx_opportunities_lead_id`, `idx_app_notifications_tenant_unread`
4. **Given** os tipos TypeScript **Then** existem `Opportunity`, `OpportunityRow`, `NotificationSettings`, `AppNotification` com funções de transformação `toOpportunity()`/`toOpportunityRow()` e testes unitários
5. **Given** o banco do ambiente de referência **When** executo `SELECT payload FROM campaign_events WHERE event_type='email_replied' LIMIT 5` **Then** o resultado (payload real com/sem `reply_text`) é documentado no artefato do spike, junto com: webhook registrado no workspace (ou registrado via API de webhooks), gating de plano verificado, escopo `emails:read` da API key conferido
6. **Given** a migration segue o padrão defensivo do projeto **Then** usa `to_regclass`/idempotência (aprendizado do banco gerenciado à mão — migration 00053)

### Story 21.2: Ingestão de Respostas por Polling + Processador + Backfill

> **Revisada 2026-07-13 (decisão Fabossi):** absorve o sweep de polling da antiga Story 21.8 — com webhooks bloqueados no plano do cliente, o polling é o **caminho primário** de ingestão, não rede de segurança. O pipeline interno não muda: sweep grava `campaign_events` (`source='polling'`) e o processador consome de lá.

As a usuario,
I want que respostas de leads sejam detectadas e registradas automaticamente,
So that eu nunca mais precise importar CSV de resultados para saber quem respondeu.

**Acceptance Criteria:**

1. **[Sweep — ex-21.8]** **Given** o cron de ingestão roda (cadência ≤5 min — NFR3; padrão do monitoring cron 13.3 / migration 00045) **When** o sweep executa **Then** busca respostas via `GET /api/v2/emails` (`email_type=received`, workspace-wide, janela desde o último sweep) **And** grava eventos em `campaign_events` com `source='polling'`, `event_type='email_replied'` e payload equivalente ao do webhook (`reply_text` ← `body.text`, `reply_subject` ← `subject`, `lead_email`, timestamp, `message_id`) **And** não duplica (dedupe pela UNIQUE constraint existente de `campaign_events` + `message_id` no payload) (FR1, FR17)
2. **[Rate limit — ex-21.8]** **Given** o rate limit do Instantly (20 req/min — NFR5) **Then** o sweep respeita o limite (1 chamada workspace-wide por ciclo + paginação limitada) **And** degrada graciosamente: o que não couber no ciclo atual é ingerido no próximo **And** falha de API loga erro estruturado sem quebrar o cron (fail-open)
3. **[Processador]** **Given** um evento `email_replied` novo em `campaign_events` **When** o processador roda **Then** cria uma `opportunity` (`source='reply'`) com `reply_text`/`reply_subject`/`unibox_url` extraídos de `payload` **And** não duplica se o evento já foi processado (UNIQUE `reply_event_id`) **And** `unibox_url` pode ser null via polling (campo nullable; presente apenas em payload de webhook)
4. **[Auto-reply]** **Given** respostas OOO/automáticas **Then** o processador aplica heurística defensiva (ex.: `lt_interest_status = 0` "Out of Office" → NÃO cria oportunidade, motivo em log estruturado) **And** teste de regressão garante que `auto_reply_received` permanece fora do `EVENT_TYPE_MAP` do receiver (nunca gera `campaign_events` via webhook futuro) (FR2)
5. **Given** uma oportunidade é criada **Then** uma `lead_interaction` do tipo `campaign_reply` é registrada para o lead correspondente (match por `lead_email` + tenant) (FR6)
6. **[Backfill]** **Given** o histórico de respostas disponível na API (validado: desde mar/2026) **When** o backfill é executado (primeiro sweep com janela ampla, ação idempotente disparável por rota admin) **Then** oportunidades retroativas são criadas sem duplicatas (FR7 — revisado: via API, pois `campaign_events` está vazia)
7. **Given** o lead da resposta não existe na base **When** o processador roda **Then** a oportunidade é criada mesmo assim com os dados do payload **And** `lead_id` nullable é tratado em toda a cadeia
8. **Given** o receiver do webhook (`instantly-webhook`) **Then** NENHUMA modificação é feita nele — permanece como upgrade path se o cliente habilitar webhooks (dual-source deduplica por construção)
9. Testes unitários para: sweep (mock da API Instantly), dedupe, rate limit, extração de payload, filtro de auto-reply, idempotência e backfill

### Story 21.3: Classificação de Intenção por IA

As a usuario,
I want que cada resposta seja classificada automaticamente por intenção,
So that eu saiba imediatamente quais respostas são leads quentes e quais são descarte.

**Acceptance Criteria:**

1. **Given** uma oportunidade `source='reply'` com `reply_text` e `intent` nulo **When** a classificação roda **Then** a IA (gpt-4o-mini, novo prompt `reply_intent_classification` no padrão `ai_prompts`) preenche `intent` com um de: `interessado`/`pediu_info`/`objecao`/`nao_agora`/`opt_out`
2. **Given** o Instantly forneceu `lt_interest_status` para o lead **When** a classificação roda **Then** o valor é gravado na oportunidade **And** normalizado para int na ingestão (o código existente tipa como string — `src/types/tracking.ts:309`; parse explícito com teste) **And** em divergência com a IA (ex.: IA=`interessado`, Instantly=Not Interested), prevalece a IA e a divergência é logada (ensemble — FR4)
3. **Given** a classificação resulta `interessado` ou `pediu_info` **Then** o status do lead é atualizado para `interessado` automaticamente (FR5) **And** `opt_out` marca o lead como `nao_interessado` **And** `objecao`/`nao_agora` não alteram status
4. **Given** a chamada de IA falha **Then** a oportunidade permanece com `intent` nulo e visível (fail-open — NFR1) **And** retry na próxima execução do processador
5. **Given** cada chamada de classificação **Then** custo estimado é registrado em `api_usage_logs` (NFR6)
6. **Given** respostas sem texto (payload antigo sem `reply_text`) **Then** a classificação usa apenas `lt_interest_status` se disponível, senão mantém `intent` nulo
7. Testes unitários para o classificador (mock OpenAI), regras de ensemble e transições de status

### Story 21.4: Central de Oportunidades — Página e Cards

As a usuario,
I want ver todas as oportunidades (respostas classificadas) em uma central única,
So that eu tenha um lugar só onde entrar para agir sobre leads quentes, sem navegar campanha por campanha.

**Acceptance Criteria:**

1. **Given** o app **When** navego **Then** existe item "Oportunidades" na sidebar com badge de contagem de oportunidades `new` (padrão do badge de Insights) **And** rota `/opportunities` no grupo `(dashboard)`
2. **Given** a página **Then** lista cards ordenados por recência com: nome do lead, empresa, cargo, campanha de origem, badge de `intent` (cores distintas), trecho da resposta expansível para texto completo, engajamento (aberturas/cliques do tracking), telefone se disponível, link "Abrir no Unibox" (`unibox_url`)
3. **Given** o lead da oportunidade é monitorado (Epic 13) e tem insight recente **Then** o card exibe o insight do LinkedIn como contexto adicional
4. **Given** filtros **Then** posso filtrar por `intent`, `status`, campanha e período **And** a busca por nome/e-mail/empresa funciona
5. **Given** abro um card **Then** o status muda de `new` para `viewed` **And** o badge da sidebar decrementa
6. **Given** não há oportunidades **Then** estado vazio orienta ("Quando um lead responder, ele aparece aqui") **And** loading usa skeleton no padrão de tracking (UX-DR2)
7. **Given** papéis do Epic 20 **Then** SDR vê a central normalmente (é ferramenta de trabalho dele); nenhuma rota nova vaza dados cross-tenant (RLS)
8. Testes unitários para componentes (card, filtros, badge) e API routes

### Story 21.5: Ações do Card + Próximo Passo por IA

As a usuario,
I want agir direto do card com um próximo passo já rascunhado pela IA,
So that eu responda o lead quente em minutos, não em dias.

**Acceptance Criteria:**

1. **Given** uma oportunidade classificada **When** o card é aberto **Then** a IA gera (on-demand, com cache em `suggestion`) um rascunho de resposta/abordagem contextualizado — novo prompt `opportunity_next_step` usando Knowledge Base (tom de voz, produto) + texto da resposta + intent (padrão do `monitoring_approach_suggestion` do Epic 13)
2. **Given** o rascunho exibido **Then** posso copiá-lo em 1 clique **And** regenerá-lo
3. **Given** as ações do card **Then** existem: enviar WhatsApp (reuso do WhatsAppComposer/ZApiService do Epic 11, pré-preenchido com o rascunho), `mailto:` com assunto/corpo pré-preenchidos, buscar telefone via SignalHire (fluxo existente por lead)
4. **Given** as ações de triagem **Then** posso marcar a oportunidade como `contacted`, `discarded`, ou registrar **"Reunião marcada"** em 1 clique (`meeting_booked_at` preenchido) (FR16) **And** marcar reunião atualiza o status do lead para `oportunidade`
5. **Given** falha na geração do rascunho **Then** o card continua utilizável com as demais ações (fail-open)
6. **Given** custo de cada geração **Then** registrado em `api_usage_logs`
7. Testes unitários para ações, transições de status e integração do composer

### Story 21.6: Janela de Oportunidade Cross-Campanha

> **PROMOVIDA 2026-07-13 (decisão Fabossi):** executa logo após a 21.2 — com poucas respostas esperadas nas campanhas, **abertura/clique é o gatilho dominante** da Central. Zero dependência de webhook: o polling existente do Epic 10 (`POST /leads/list`) já entrega `openCount`/`clickCount` por lead e o `opportunity-engine` já qualifica por abertura.

As a usuario,
I want que leads com alto engajamento (aberturas/cliques) também apareçam na Central,
So that eu aja sobre leads quentes que ainda não responderam — antes do concorrente.

**Acceptance Criteria:**

1. **Given** o sync de analytics de uma campanha detecta lead que cruza o threshold da Janela de Oportunidade — regra: threshold de opens existente **OU** ≥1 clique (clique é sinal mais raro e mais forte que abertura) **When** o processamento roda **Then** cria oportunidade `source='engagement'` para o lead (sem duplicar se já existe oportunidade ativa do mesmo lead)
2. **Given** a Central **Then** oportunidades de engajamento aparecem com badge própria ("Alto engajamento") distinta das de resposta **And** o card mostra o detalhe (X aberturas, Y cliques, último em Z)
3. **Given** o `opportunity-engine` existente **Then** é estendido (não duplicado) para considerar cliques e operar cross-campanha **And** a UI atual da Janela dentro do analytics da campanha continua funcionando sem regressão
4. **Given** um lead de engajamento posteriormente responde **Then** a oportunidade é atualizada para `source='reply'` (upgrade, não duplicata)
5. Testes unitários para o engine estendido e regras de dedupe/upgrade

### Story 21.7: Notificações Proativas + Configurações

As a usuario,
I want ser avisado no WhatsApp e no app quando surgir um lead quente,
So that o "pop-up do lead" chegue até mim mesmo quando não estou na plataforma.

**Acceptance Criteria:**

1. **Given** uma oportunidade `source='reply'` com intent `interessado` ou `pediu_info` é criada **When** as notificações do tenant estão habilitadas **Then** mensagem WhatsApp é enviada via ZApiService para os números configurados: "🔥 Lead quente: {nome} ({empresa}) respondeu {intent} na campanha {campanha}" + link direto para a oportunidade **And** em ≤5 min do evento (NFR3)
2. **Given** qualquer oportunidade nova **Then** registro em `app_notifications` (histórico/central de notificações; `read_at` controla leitura) **And** o badge da sidebar mantém fonte única: contagem de oportunidades `status='new'` conforme 21.4 AC1 (banco, não localStorage) — `app_notifications` NÃO alimenta o badge
3. **Given** `/settings/monitoring` (ou seção equivalente em Configurações) **Then** admin configura: números WhatsApp destino (múltiplos), canais on/off (WhatsApp, in-app), e quais intents notificam (default: `interessado`+`pediu_info`)
4. **Given** o envio WhatsApp falha (Z-API fora) **Then** a notificação in-app é criada mesmo assim **And** o erro é logado sem quebrar o processador (fail-open)
5. **Given** oportunidades de engajamento (`source='engagement'`) **Then** notificam apenas in-app por padrão (WhatsApp opt-in na config) — evita ruído
6. **Given** múltiplas respostas em rajada **Then** notificações WhatsApp são agrupadas se >3 no intervalo de 5 min ("4 novos leads quentes — abrir Central")
7. Testes unitários para gatilhos, agrupamento, fallback e configurações

### ~~Story 21.8: Reconciliação por Polling (Rede de Segurança)~~ — ABSORVIDA PELA 21.2 (2026-07-13)

A validação real da 21.1 AC5 concluiu que **webhooks estão bloqueados no plano do cliente** — a prioridade condicional desta story se ativou na forma máxima: o sweep de polling não é rede de segurança, é o **caminho primário de ingestão**, e por isso foi fundido na Story 21.2 (ACs 1, 2 e parte do 9). Não existe mais como story separada. A cadência definida (cron ≤5 min, 1 chamada workspace-wide por ciclo) mantém NFR3 atingível dentro do rate limit (NFR5). Se o cliente habilitar webhooks no futuro, o receiver existente (Epic 10, intocado) passa a coexistir com o sweep — o dedupe pela UNIQUE constraint de `campaign_events` já cobre o dual-source.

### Cobertura final (revisada 2026-07-13)

| Story | FRs | UX-DRs |
|---|---|---|
| 21.1 | fundação (habilita todos) + pendências do spike ✅ | — |
| 21.2 | FR1, FR2, FR6, FR7, FR17 (absorveu a 21.8) | — |
| 21.6 (promovida — 3ª na sequência) | FR12 | — |
| 21.3 | FR3, FR4, FR5 | — |
| 21.4 | FR8, FR9 | UX-DR1, UX-DR2 |
| 21.5 | FR10, FR11, FR16 | — |
| 21.7 | FR13, FR14, FR15 | — |

17/17 FRs e 2/2 UX-DRs cobertos. Sequência de execução: 21.1 → 21.2 → 21.6 → 21.3 → 21.4 → 21.5 → 21.7.
