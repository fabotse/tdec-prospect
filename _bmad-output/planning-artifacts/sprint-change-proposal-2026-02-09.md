# Sprint Change Proposal — Campaign Tracking & Janela de Oportunidade

**Data:** 2026-02-09
**Autor:** Bob (SM) com Fabossi
**Workflow:** Correct Course
**Modo:** Incremental
**Status:** Aprovado

---

## 1. Resumo do Problema

### Problem Statement

O TDEC Prospect exporta campanhas para o Instantly mas perde visibilidade sobre os resultados. O usuário precisa acessar o Instantly separadamente para ver métricas de abertura, cliques e respostas — quebrando a centralização que é proposta de valor da plataforma.

### Contexto de Descoberta

- **Gatilho:** Feature request do stakeholder (Fabossi) durante implementação do Epic 7 (Campaign Deployment & Export)
- **Tipo:** Nova funcionalidade emergente — não é bug ou conflito
- **Motivação:** Ao construir o fluxo de export, ficou evidente que o ciclo está incompleto: exporta mas não acompanha

### Evidência de Suporte

- Pesquisa de API Instantly v2 concluída — viabilidade técnica confirmada (ver [documento de pesquisa](research/instantly-campaign-tracking-api-research-2026-02-09.md))
- API fornece: 4 endpoints de analytics, Lead endpoint com `email_open_count` e `timestamp_last_open`, sistema de Webhooks com 19 event types
- PRD já previa "Analytics avançados" como Growth Phase
- FR12 já mencionava importação de resultados (versão manual do que agora será automatizado)
- Supabase Edge Functions validadas como receptor de webhooks (já no stack)

### Feature Proposta — 3 Pilares

1. **Campaign Tracking** — Receber eventos de tracking (opens, clicks, replies) do Instantly via webhook e polling, exibir dashboard de métricas por campanha
2. **Janela de Oportunidade** — Identificar leads com email_open_count acima de um threshold configurável pelo usuário (leads de alto interesse que merecem ação imediata)
3. **Preparação Arquitetural para WhatsApp** — Interfaces e abstrações que suportem automação futura de WhatsApp baseada na Janela de Oportunidade, sem implementação concreta agora

---

## 2. Análise de Impacto

### Epic Impact

| Epic | Status | Impacto |
|------|--------|---------|
| Epic 1-6, 6.5, 8, 9 | done | Nenhum |
| Epic 7 (Export) | in-progress | Nenhum — continua como planejado |
| **Epic 10 (novo)** | proposto | Novo epic dedicado para tracking + Janela de Oportunidade |

- Epic 7 pode ser concluído normalmente (7/9 stories done, falta 7.6 Export Snov.io)
- Epic 10 depende de 7.3.1 (persistência de export) e 7.2 (InstantlyService), ambos **já done**
- Nenhum epic existente é invalidado ou precisa de reordenação

### Artifact Conflicts

| Artefato | Tipo de Impacto | Detalhes |
|----------|----------------|---------|
| **PRD** | Adição | Novos FRs (FR50-FR56) para tracking, Janela de Oportunidade, WhatsApp prep |
| **Architecture** | Adição | Webhook Receiver, Tracking Service, Opportunity Engine, 3 novos ADRs |
| **UX Design** | Adição | Analytics Dashboard, Lead Tracking Table, Janela de Oportunidade Panel, Threshold Config |
| **Epics & Stories** | Adição | Novo Epic 10 com 8 stories |
| **Sprint Status** | Adição | Epic 10 + 8 stories em backlog |

**Conflitos: zero.** Todas as mudanças são aditivas — nada existente precisa ser alterado ou removido.

### Infraestrutura Existente Reutilizada

| Componente | Origem | Uso no Epic 10 |
|------------|--------|----------------|
| `external_campaign_id` | Story 7.3.1 (done) | Lookup de campanha para vincular eventos/analytics |
| `InstantlyService` | Story 7.2 (done) | Expandir com métodos de analytics e lead tracking |
| `ExternalService` base class | Architecture | Padrão para novos services |
| Supabase Edge Functions | Stack existente | Webhook receiver |
| Tema B&W | Epic 8 (done) | UI de analytics e Janela de Oportunidade |
| Tabela estilo Airtable | UX Design | Lead Tracking Table |

---

## 3. Abordagem Recomendada

### Decisão: Ajuste Direto via Novo Epic

**Opção selecionada:** Criar Epic 10 como extensão natural do projeto.

**Alternativas descartadas:**
- ~~Incorporar no Epic 7~~ — escopo grande demais, quebraria coesão do epic
- ~~Rollback de stories~~ — não aplicável, nova feature depende do que já foi feito
- ~~Reduzir MVP~~ — MVP não é afetado, Epic 10 é extensão pós-MVP
- ~~Esperar projeto separado~~ — perderia momentum e contexto do Epic 7

### Justificativa

| Fator | Avaliação |
|-------|-----------|
| **Esforço** | Médio — infraestrutura base pronta (InstantlyService, persistência, Edge Functions) |
| **Risco técnico** | Baixo — API pesquisada, webhooks são padrão conhecido, Supabase Edge Functions documentadas |
| **Impacto na equipe** | Zero disrupção — Epic 7 continua normalmente |
| **Sustentabilidade** | Alta — arquitetura event-driven reutilizável, preparação WhatsApp via interfaces |
| **Valor de negócio** | Alto — centraliza fluxo completo (export → tracking → ação), Janela de Oportunidade é diferencial |
| **Timeline** | Sem impacto no Epic 7 — Epic 10 entra na fila após conclusão |

### Requisito Especial

**Testabilidade incremental (requisito do Fabossi):** Cada story do Epic 10 deve ser testável de forma independente — validação incremental, não acumulada. Não esperar stories avançadas para descobrir problemas.

---

## 4. Propostas de Mudança Detalhadas

### 4.1 PRD — Novos Requisitos Funcionais

**Seção:** Requisitos Funcionais + Fases de Crescimento

**Adicionar FRs:**
- **FR50:** Sistema recebe eventos de tracking (opens, clicks, replies) via webhook do Instantly em tempo real
- **FR51:** Sistema exibe dashboard de métricas por campanha (opens, clicks, replies, bounces, taxas)
- **FR52:** Sistema identifica leads com email_open_count acima do threshold configurado (Janela de Oportunidade)
- **FR53:** Usuário pode configurar threshold da Janela de Oportunidade (mín. aberturas, período)
- **FR54:** Sistema exibe lista de leads na Janela de Oportunidade com dados de tracking por lead
- **FR55:** Sistema faz polling periódico de analytics como backup/sync dos webhooks
- **FR56:** Arquitetura suporta extensão para automação de WhatsApp (interfaces preparadas, sem implementação)

**Atualizar Growth Phase:**
- Mover "Analytics avançados de campanhas" → Epic 10 (implementação imediata após Epic 7)
- Adicionar "Automação de WhatsApp via Janela de Oportunidade" como Growth Phase

---

### 4.2 Architecture — Novos Componentes e ADRs

**Adicionar componentes:**

1. **Webhook Receiver** (Supabase Edge Function)
   - Endpoint: `POST /functions/v1/instantly-webhook`
   - Validação de payload (event_type, lead_email, campaign_id)
   - Idempotência: dedup por event_type + lead_email + timestamp
   - Resposta 200 imediata, processamento assíncrono
   - Persistência em `campaign_events`

2. **Tracking Service** (`src/lib/services/tracking.ts`)
   - `getCampaignAnalytics(campaignId)` — agrega métricas
   - `getLeadTracking(campaignId, leadId)` — tracking por lead
   - `syncAnalytics(campaignId)` — polling manual/scheduled
   - Segue padrão ExternalService existente

3. **Opportunity Engine** (`src/lib/services/opportunity-engine.ts`)
   - `evaluateOpportunityWindow(campaignId, config)` — filtra leads
   - Config: `{ minOpens: number, periodDays: number }`
   - Interface `IOpportunityAction` preparada para WhatsApp futuro

4. **Data Models** (novas tabelas):
   - `campaign_events`: id, campaign_id, event_type, lead_email, timestamp, payload, processed_at, created_at
   - `opportunity_configs`: id, tenant_id, campaign_id, min_opens, period_days, is_active, created_at
   - Índices: `(campaign_id, lead_email)`, `(campaign_id, event_type)`
   - RLS por tenant_id

**Novos ADRs:**

- **ADR-003:** Webhook Receiver Architecture — Supabase Edge Function com idempotência via UNIQUE constraint
- **ADR-004:** Estratégia Híbrida Webhook + Polling — webhooks primário, polling backup
- **ADR-005:** Preparação Arquitetural WhatsApp — Interface IOpportunityAction extensível

---

### 4.3 UX Design — Novas Telas

1. **Campaign Analytics View** — Cards de métricas (opens, clicks, replies, bounces), gráfico diário, indicador de sync
2. **Lead Tracking Table** — Tabela estilo Airtable com opens por lead, último open, badge "Janela de Oportunidade"
3. **Janela de Oportunidade Panel** — Lista focada de leads quentes com config inline de threshold
4. **Threshold Config** — Mín. aberturas + período em dias, defaults: 3 opens em 7 dias, preview de leads qualificados

---

### 4.4 Epics & Stories — Novo Epic 10

**Epic 10: Campaign Tracking & Janela de Oportunidade**

| Story | Descrição | Testável Isoladamente |
|-------|-----------|----------------------|
| 10.1 | Schema de Tracking e Tipos | Migration roda, tipos compilam, RLS funciona |
| 10.2 | Webhook Receiver (Supabase Edge Function) | curl com payload simulado, evento persiste |
| 10.3 | Instantly Analytics Service (Polling) | API call com campaign real, dados retornam |
| 10.4 | Campaign Analytics Dashboard UI | Dados mockados, UI renderiza corretamente |
| 10.5 | Lead Tracking Detail | Dados seed, tabela renderiza, ordenação funciona |
| 10.6 | Janela de Oportunidade - Engine + Config | Engine retorna leads corretos com threshold |
| 10.7 | Janela de Oportunidade - UI + Notificações | UI renderiza, badge aparece, toast dispara |
| 10.8 | Preparação Arquitetural WhatsApp | Interface compila, stub executa sem erro |

**Ordem de execução:**
```
10.1 → 10.2 ──→ 10.4 ──→ 10.5 ──→ 10.6 ──→ 10.7
     → 10.3 ──┘                          └──→ 10.8
```

**FR Coverage:**
- FR50 → 10.2 | FR51 → 10.4 | FR52 → 10.6 | FR53 → 10.6 | FR54 → 10.7 | FR55 → 10.3 | FR56 → 10.8

---

### 4.5 Sprint Status

**Adicionar ao sprint-status.yaml:**
- Epic 10 com status `backlog`
- 8 stories com status `backlog`
- Branch `epic/10-campaign-tracking` registrada

---

## 5. Handoff de Implementação

### Classificação de Escopo: Moderado

A mudança não é trivial (novo epic com 8 stories, novas tabelas, Edge Function) mas também não é uma revisão fundamental — é uma extensão natural com infraestrutura base já pronta.

### Responsabilidades

| Papel | Ação | Quando |
|-------|------|--------|
| **SM (Bob)** | Sprint Change Proposal (este documento) ✅ | Agora |
| **SM (Bob)** | Atualizar sprint-status.yaml | Após aprovação |
| **Analyst** | Atualizar PRD com FR50-FR56 | Antes de criar stories detalhadas |
| **Architect** | Atualizar Architecture com componentes e ADRs | Antes de criar stories detalhadas |
| **UX Designer** | (Opcional) Detalhar telas de analytics e Janela de Oportunidade | Pode ser junto com stories |
| **SM** | Criar Epic 10 com stories detalhadas | Após PRD e Architecture atualizados |
| **Dev** | Implementar stories com validação incremental | Após stories criadas |

### Fluxo de Execução

```
1. [SM] Finalizar Epic 7 (Story 7.6 + Retrospectiva)
2. [Analyst] Atualizar PRD com novos FRs
3. [Architect] Atualizar Architecture com novos componentes e ADRs
4. [SM] Criar Epic 10 com stories detalhadas
5. [Dev] Implementar story por story com testes
```

### Critérios de Sucesso

- [ ] PRD atualizado com FR50-FR56
- [ ] Architecture atualizado com Webhook Receiver, Tracking Service, Opportunity Engine, ADRs 003-005
- [ ] Epic 10 criado com 8 stories detalhadas e acceptance criteria
- [ ] Cada story implementada e testada isoladamente antes de avançar
- [ ] Dashboard de analytics exibe dados reais do Instantly
- [ ] Janela de Oportunidade identifica leads quentes corretamente
- [ ] Interfaces para WhatsApp preparadas e documentadas

---

## 6. Referências

- [Pesquisa API Instantly v2](research/instantly-campaign-tracking-api-research-2026-02-09.md)
- [Epic 7 — Campaign Deployment & Export](epic-7-campaign-deployment-export.md)
- [PRD](prd.md)
- [Architecture](architecture.md)
- [UX Design Specification](ux-design-specification.md)
- [Sprint Status](../implementation-artifacts/sprint-status.yaml)

---

*Sprint Change Proposal gerado em: 2026-02-09*
*Workflow: Correct Course (BMAD Framework)*
*Aprovado por: Fabossi*
