# Pesquisa Técnica: API Instantly v2 — Campaign Tracking & Janela de Oportunidade

**Data**: 2026-02-09
**Objetivo**: Investigar a viabilidade técnica de tracking de campanhas via API Instantly para implementar a feature "Janela de Oportunidade"
**Fonte**: https://developer.instantly.ai/api/v2
**Resultado**: VIÁVEL — A API fornece todos os dados necessários

---

## Contexto do Negócio

### Situação Atual
O TDEC Prospect já possui criação de campanhas de cold email e exportação para o Instantly. Após a exportação, o usuário precisa acompanhar a campanha diretamente na plataforma do Instantly.

### Feature Desejada
1. **Tracking de campanhas**: Puxar dados de tracking do Instantly (aberturas, cliques, respostas) e exibir na plataforma TDEC Prospect
2. **Janela de Oportunidade**: Identificar leads que abriram o email mais de uma vez (threshold configurável pelo usuário). Estes são leads com alto interesse que merecem uma ação imediata
3. **Preparação para futuro**: Deixar a arquitetura pronta para ações automatizadas (ex: envio de WhatsApp) a partir da janela de oportunidade, sem implementar a ação agora

### Escopo
- **Incluso**: Tracking de campanhas + visualização + filtro de janela de oportunidade
- **Fora de escopo (futuro)**: Ação de WhatsApp automatizado, mas a arquitetura deve ser extensível para isso

---

## Descobertas da API Instantly v2

### Autenticação
- Bearer Token via API Key
- Suporta múltiplas API keys com scopes granulares
- Base URL: `https://api.instantly.ai/`

---

## 1. Campaign Analytics — Dados Agregados

### 1.1 GET /api/v2/campaigns/analytics

Retorna analytics por campanha individual ou todas as campanhas.

**Query Parameters:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `id` | string (uuid) | ID da campanha (opcional, vazio = todas) |
| `ids` | string[] (uuid) | Array de IDs |
| `start_date` | string | Data início (YYYY-MM-DD) |
| `end_date` | string | Data fim (YYYY-MM-DD) |
| `exclude_total_leads_count` | boolean | Excluir contagem total para performance (default: false) |

**Response (Array):**
| Campo | Tipo | Descrição |
|---|---|---|
| `campaign_name` | string | Nome da campanha |
| `campaign_id` | string (uuid) | ID da campanha |
| `campaign_status` | number | Status (0=Draft, 1=Active, 2=Paused, 3=Completed) |
| `campaign_is_evergreen` | boolean | Se é evergreen |
| `leads_count` | integer | Total de leads |
| `contacted_count` | integer | Leads que iniciaram a sequência |
| `emails_sent_count` | integer | Total de emails enviados |
| `new_leads_contacted_count` | integer | Novos leads contatados |
| `open_count` | integer | Leads que abriram pelo menos um email |
| `open_count_unique` | integer | Aberturas únicas (primeira abertura por lead) |
| `open_count_unique_by_step` | integer | Aberturas únicas por step |
| `reply_count` | integer | Total de respostas (cada resposta conta) |
| `reply_count_unique` | integer | Respostas únicas |
| `reply_count_unique_by_step` | integer | Respostas únicas por step |
| `reply_count_automatic` | integer | Respostas automáticas |
| `reply_count_automatic_unique` | integer | Respostas automáticas únicas |
| `link_click_count` | integer | Total de cliques em links |
| `link_click_count_unique` | integer | Cliques únicos |
| `link_click_count_unique_by_step` | integer | Cliques únicos por step |
| `bounced_count` | integer | Emails bounced |
| `unsubscribed_count` | integer | Unsubscribes |
| `completed_count` | integer | Leads com campanha completa |
| `total_opportunities` | integer | Oportunidades criadas |
| `total_opportunity_value` | number | Valor total de oportunidades |

**Exemplo de request:**
```bash
curl -X GET \
  'https://api.instantly.ai/api/v2/campaigns/analytics?id=UUID&start_date=2024-01-01&end_date=2024-12-31' \
  -H 'Authorization: Bearer <TOKEN>'
```

### 1.2 GET /api/v2/campaigns/analytics/overview

Visão consolidada com campos adicionais de CRM.

**Query Parameters adicionais:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `campaign_status` | number | Filtrar por status da campanha |
| `expand_crm_events` | boolean | Expandir eventos de CRM (default: false) |

**Campos adicionais no response (além dos mesmos do analytics):**
| Campo | Tipo | Descrição |
|---|---|---|
| `total_interested` | integer | Total de leads interessados |
| `total_meeting_booked` | integer | Reuniões agendadas |
| `total_meeting_completed` | integer | Reuniões realizadas |
| `total_closed` | integer | Leads fechados |

**Nota importante:** Os totais de status de interesse são calculados pela primeira ocorrência por contato por padrão. Com `expand_crm_events=true`, calcula todas as ocorrências. Há uma janela de 10 minutos após mudança de status do lead onde novos eventos NÃO são inseridos para evitar duplicatas.

### 1.3 GET /api/v2/campaigns/analytics/daily

Série temporal diária para gráficos de evolução.

**Query Parameters:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `campaign_id` | string (uuid) | ID da campanha (opcional) |
| `start_date` | string | Data início |
| `end_date` | string | Data fim |
| `campaign_status` | number | Filtrar por status |

**Response (Array):**
| Campo | Tipo | Descrição |
|---|---|---|
| `date` | string | Data (YYYY-MM-DD) |
| `sent` | integer | Emails enviados |
| `contacted` | integer | Contatos alcançados |
| `new_leads_contacted` | integer | Novos leads contatados |
| `opened` | integer | Total de aberturas |
| `unique_opened` | integer | Aberturas únicas |
| `replies` | integer | Total de respostas |
| `unique_replies` | integer | Respostas únicas |
| `replies_automatic` | integer | Respostas automáticas |
| `unique_replies_automatic` | integer | Respostas automáticas únicas |
| `clicks` | integer | Cliques em links |
| `unique_clicks` | integer | Cliques únicos (por lead, não por link) |
| `opportunities` | integer | Oportunidades criadas |
| `unique_opportunities` | integer | Oportunidades únicas |

**Exemplo de response:**
```json
[
  {
    "date": "2025-03-01",
    "sent": 5421,
    "contacted": 5000,
    "new_leads_contacted": 200,
    "opened": 99,
    "unique_opened": 60,
    "replies": 60,
    "unique_replies": 60,
    "replies_automatic": 5,
    "unique_replies_automatic": 4,
    "clicks": 60,
    "unique_clicks": 60,
    "opportunities": 5,
    "unique_opportunities": 3
  }
]
```

### 1.4 GET /api/v2/campaigns/analytics/steps

Analytics por step e variante (A/B testing).

**Query Parameters:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `campaign_id` | string (uuid) | ID da campanha |
| `start_date` | string | Data início |
| `end_date` | string | Data fim |
| `include_opportunities_count` | boolean | Incluir contagem de oportunidades (default: false) |

**Response (Array):**
| Campo | Tipo | Descrição |
|---|---|---|
| `step` | null ou string | Número do step (null = indeterminado) |
| `variant` | null ou string | Variante (0=A, 1=B, 2=C) |
| `sent` | integer | Emails enviados |
| `opened` | integer | Total de aberturas |
| `unique_opened` | integer | Aberturas únicas |
| `replies` / `unique_replies` | integer | Respostas |
| `replies_automatic` / `unique_replies_automatic` | integer | Respostas automáticas |
| `clicks` / `unique_clicks` | integer | Cliques |
| `opportunities` / `unique_opportunities` | integer | Oportunidades (se include_opportunities_count=true) |

---

## 2. Lead — Dados Individuais por Lead (CRÍTICO para Janela de Oportunidade)

### 2.1 POST /api/v2/leads/list (List Leads)

**NOTA**: É POST (não GET) devido à complexidade dos parâmetros de filtragem.

**Body Parameters:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `search` | string | Busca por nome ou email |
| `filter` | string (enum) | Filtro: FILTER_VAL_CONTACTED, FILTER_VAL_NOT_CONTACTED, FILTER_VAL_COMPLETED, FILTER_VAL_UNSUBSCRIBED, FILTER_VAL_ACTIVE, FILTER_LEAD_INTERESTED, FILTER_LEAD_NOT_INTERESTED, FILTER_LEAD_MEETING_BOOKED, FILTER_LEAD_MEETING_COMPLETED, FILTER_LEAD_CLOSED, +17 mais |
| `campaign` | string (uuid) | Filtrar por campanha |
| `list_id` | string (uuid) | Filtrar por lista |
| `in_campaign` | boolean | Se está em campanha |
| `in_list` | boolean | Se está em lista |
| `ids` | string[] (uuid) | Array de IDs específicos |
| `queries` | object[] | **Filtros avançados** ex: `[{"actionType":"email-open","values":{"occurrence-days":1}}]` |
| `excluded_ids` | string[] (uuid) | IDs a excluir |
| `contacts` | string[] (email) | Filtrar por emails |
| `limit` | integer (1-100) | Itens por página |
| `starting_after` | string | Cursor de paginação |
| `distinct_contacts` | boolean | Contatos distintos |
| `is_website_visitor` | boolean | Se é visitante do site |

**Response — Campos por Lead (CRUCIAIS):**

| Campo | Tipo | Relevância para Feature |
|---|---|---|
| `id` | string (uuid) | Identificador único |
| `email` | string | Email do lead |
| `first_name` | string | Nome |
| `last_name` | string | Sobrenome |
| `company_name` | string | Empresa |
| `company_domain` | string | Domínio da empresa |
| `phone` | string | Telefone (futuro: WhatsApp) |
| `website` | string | Website |
| **`email_open_count`** | integer | **QUANTIDADE de aberturas — CAMPO PRINCIPAL da Janela de Oportunidade** |
| `email_opened_step` | string | Em qual step abriu |
| `email_opened_variant` | string | Qual variante abriu |
| **`email_click_count`** | integer | Quantidade de cliques |
| `email_clicked_step` | string | Step do clique |
| `email_clicked_variant` | string | Variante do clique |
| `email_reply_count` | integer | Quantidade de respostas |
| `email_replied_step` | string | Step da resposta |
| `email_replied_variant` | string | Variante da resposta |
| **`timestamp_last_open`** | string (datetime) | **Última abertura — para recência** |
| `timestamp_last_click` | string (datetime) | Último clique |
| `timestamp_last_reply` | string (datetime) | Última resposta |
| `timestamp_last_contact` | string (datetime) | Último contato |
| `timestamp_last_touch` | string (datetime) | Último toque |
| `timestamp_last_interest_change` | string (datetime) | Última mudança de interesse |
| `lt_interest_status` | number | Status de interesse no CRM |
| `status` | number | Status do lead na campanha |
| `personalization` | object | Dados de personalização |
| `payload` | object | Dados adicionais |
| `campaign` | string (uuid) | Campanha associada |
| `list_id` | string (uuid) | Lista associada |

### 2.2 GET /api/v2/leads/{id} (Get Lead Individual)
Mesmos campos de resposta. Busca por ID.

### 2.3 PATCH /api/v2/leads/{id} (Atualizar Lead)
Permite atualizar: first_name, last_name, company_name, phone, website, lt_interest_status, personalization, custom_variables.

### 2.4 POST /api/v2/leads/update-interest-status
Atualiza status de interesse do lead (interesse, reunião agendada, etc).

---

## 3. Webhooks — Tracking em Tempo Real

### 3.1 POST /api/v2/webhooks (Criar Webhook)

**Body:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `target_hook_url` | string (uri) | URL para receber o webhook |
| `campaign` | string ou null (uuid) | Filtrar por campanha (null = todas) |
| `name` | string ou null | Nome do webhook |
| `event_type` | string ou null | Tipo de evento (ver lista completa abaixo) |
| `custom_interest_value` | number ou null | Para eventos de label customizado |
| `headers` | object ou null | Headers HTTP customizados para autenticação |

### 3.2 Tipos de Evento Disponíveis

**Eventos de Email:**
| Evento | Descrição |
|---|---|
| `email_sent` | Email enviado |
| **`email_opened`** | **Email aberto (PRINCIPAL para tracking)** |
| `email_link_clicked` | Link clicado |
| `reply_received` | Resposta recebida |
| `auto_reply_received` | Resposta automática |
| `email_bounced` | Email bounced |
| `lead_unsubscribed` | Lead fez unsubscribe |
| `account_error` | Erro na conta |
| `campaign_completed` | Campanha completada |

**Eventos de Status do Lead:**
| Evento | Descrição |
|---|---|
| `lead_neutral` | Lead neutro |
| `lead_interested` | Lead interessado |
| `lead_not_interested` | Lead não interessado |
| `lead_meeting_booked` | Reunião agendada |
| `lead_meeting_completed` | Reunião realizada |
| `lead_closed` | Lead fechado |
| `lead_out_of_office` | Lead fora do escritório |
| `lead_wrong_person` | Pessoa errada |
| `lead_no_show` | No-show |

**Evento especial:** `all_events` — subscreve a todos os eventos incluindo labels customizados.

### 3.3 Schema do Payload do Webhook

```typescript
{
  // Campos base (sempre presentes)
  timestamp: string;           // ISO timestamp do evento
  event_type: string;          // Tipo do evento
  workspace: string;           // UUID do workspace
  campaign_id: string;         // UUID da campanha
  campaign_name: string;       // Nome da campanha

  // Campos opcionais
  lead_email?: string;         // Email do lead
  email_account?: string;      // Conta de email usada para enviar
  unibox_url?: string;         // URL para ver conversa no Unibox (apenas replies)

  // Informação de step
  step?: number;               // Número do step (começando em 1)
  variant?: number;            // Variante do step (começando em 1)
  is_first?: boolean;          // Se é o PRIMEIRO evento deste tipo para o lead

  // Informação do email (para emails enviados)
  email_id?: string;           // ID do email (pode ser usado para reply)
  email_subject?: string;
  email_text?: string;
  email_html?: string;

  // Informação de resposta (para reply events)
  reply_text_snippet?: string; // Preview curto da resposta
  reply_subject?: string;
  reply_text?: string;         // Texto completo
  reply_html?: string;         // HTML completo

  // Dados do lead (merged do banco)
  [key: string]: any;          // Campos adicionais do lead
}
```

**Campo `is_first` é crucial**: Permite distinguir a primeira abertura de aberturas subsequentes, facilitando a lógica da Janela de Oportunidade.

---

## 4. Análise e Recomendações

### 4.1 Viabilidade da Feature

**TOTALMENTE VIÁVEL.** A API Instantly v2 fornece:
- Dados agregados para dashboards (Campaign Analytics)
- Dados individuais por lead com `email_open_count` para a Janela de Oportunidade
- Webhooks em tempo real com evento `email_opened` e campo `is_first`
- Dados de contato do lead (phone) para futura integração com WhatsApp

### 4.2 Abordagem Técnica Recomendada

**Abordagem Híbrida (Webhook + Polling):**

1. **Webhook (`email_opened`)** → Supabase Edge Function → Gravar em tabela de tracking
   - Real-time, notificação imediata
   - Campo `is_first` para lógica de primeira vs. múltipla abertura
   - Supabase Edge Functions: sempre online, acesso direto ao banco, sem infra adicional

2. **Polling (List Leads)** → Sync periódico como backup
   - `email_open_count` por lead para validação e reconciliação
   - `queries` com `actionType: "email-open"` para filtros avançados

3. **Campaign Analytics** → Dashboard de visão geral
   - Dados agregados para métricas macro
   - Daily analytics para gráficos de evolução

### 4.3 Decisão Arquitetural: Supabase Edge Functions

**Escolha**: Supabase Edge Functions para receber webhooks do Instantly.

**Justificativa:**
- Já faz parte da stack do projeto (Supabase é o backend)
- Serverless, sempre disponível para receber webhooks
- Acesso direto ao PostgreSQL do Supabase
- Sem necessidade de infraestrutura adicional
- Resposta rápida (ms) — necessário para webhook receivers
- Free tier suficiente para o volume esperado

**Fluxo:**
```
Instantly (email_opened) → POST → Supabase Edge Function → INSERT tabela tracking → (futuro) Trigger → Ação
```

**Cuidados:**
- Idempotência: tratar duplicatas por `event_type + lead_email + timestamp`
- Retry do Instantly: responder 200 rapidamente
- Validação do payload recebido

### 4.4 Extensibilidade para WhatsApp (futuro)

A arquitetura proposta facilita a adição futura de ações:
- Trigger no banco quando lead atinge threshold de `email_open_count`
- Dados de `phone` do lead já disponíveis na API
- Edge Function separada para despachar ação de WhatsApp
- Padrão event-driven já estabelecido

### 4.5 Rate Limits e Considerações

- A documentação não especifica rate limits explícitos, mas retorna status `429` (Too Many Requests)
- Recomenda-se implementar retry com backoff exponencial
- O parâmetro `exclude_total_leads_count=true` melhora performance significativamente
- Paginação via cursor (`starting_after`) com `limit` de 1-100 itens

---

## 5. Endpoints Relevantes — Resumo Rápido

| Endpoint | Método | Uso na Feature |
|---|---|---|
| `/api/v2/campaigns/analytics` | GET | Dashboard: métricas agregadas por campanha |
| `/api/v2/campaigns/analytics/overview` | GET | Dashboard: visão geral com CRM |
| `/api/v2/campaigns/analytics/daily` | GET | Dashboard: gráficos de evolução diária |
| `/api/v2/campaigns/analytics/steps` | GET | Dashboard: performance por step/variante |
| `/api/v2/leads/list` | POST | Janela de Oportunidade: leads com email_open_count >= threshold |
| `/api/v2/leads/{id}` | GET | Detalhe do lead individual |
| `/api/v2/webhooks` | POST | Configurar webhook para email_opened |
| `/api/v2/webhooks` | GET | Listar webhooks configurados |
| `/api/v2/webhooks/event-types` | GET | Listar tipos de evento disponíveis |
| `/api/v2/webhook-events` | GET | Histórico de eventos enviados |
