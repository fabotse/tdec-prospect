---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments: ['epic-7-campaign-deployment-export.md']
workflowType: 'research'
lastStep: 5
status: 'complete'
research_type: 'technical'
research_topic: 'Instantly & Snov.io API Integration para Epic 7'
research_goals: 'Documentar endpoints, payloads, limites e padroes de integracao das APIs Instantly v2 e Snov.io para Campaign Management e Lead Export'
user_name: 'Fabossi'
date: '2026-02-06'
web_research_enabled: true
source_verification: true
---

# Pesquisa Tecnica: APIs Instantly & Snov.io para Integracao Epic 7

**Data:** 2026-02-06
**Autor:** Fabossi
**Tipo de Pesquisa:** Tecnica
**Nivel de Confianca Geral:** Alto (documentacao oficial verificada)

---

## Indice

1. [Resumo Executivo](#resumo-executivo)
2. [Instantly API v2](#instantly-api-v2)
   - [Autenticacao](#instantly-autenticacao)
   - [Rate Limits](#instantly-rate-limits)
   - [Criar Campanha](#instantly-criar-campanha)
   - [Estrutura de Sequences/Steps](#instantly-sequences)
   - [Adicionar Leads em Bulk](#instantly-bulk-add-leads)
   - [Custom Variables](#instantly-custom-variables)
   - [Gerenciar Campanha](#instantly-gerenciar-campanha)
   - [Adicionar Variaveis a Campanha](#instantly-add-campaign-variables)
3. [Snov.io API](#snovio-api)
   - [Autenticacao](#snovio-autenticacao)
   - [Rate Limits](#snovio-rate-limits)
   - [Gerenciar Listas de Prospects](#snovio-listas)
   - [Adicionar Prospect a Lista](#snovio-add-prospect)
   - [Campanhas (Drip Campaigns)](#snovio-campanhas)
   - [Variaveis de Personalizacao](#snovio-variaveis)
   - [Custom Fields via API](#snovio-custom-fields)
4. [Analise Comparativa para Epic 7](#analise-comparativa)
   - [Mapeamento de Variaveis](#mapeamento-variaveis)
   - [Fluxo de Integracao por Plataforma](#fluxos-integracao)
   - [Limitacoes e Restricoes](#limitacoes)
5. [Impacto nas Stories da Epic 7](#impacto-stories)
6. [Decisoes Tecnicas Recomendadas](#decisoes-tecnicas)
7. [Fontes](#fontes)

---

## Resumo Executivo

Esta pesquisa documenta as APIs do Instantly (v2) e Snov.io (v1/v2) para subsidiar a implementacao da Epic 7 (Campaign Deployment & Export). Os principais achados sao:

1. **Instantly API v2** oferece endpoints completos para criacao de campanhas e adicao de leads em bulk (ate 1000/request) via API, com suporte a custom variables.

2. **Snov.io API NAO suporta criacao de drip campaigns via API.** O fluxo e: criar lista via API -> adicionar prospects a lista -> a campanha (criada manualmente no UI) inicia automaticamente para novos prospects da lista.

3. **Mapeamento de variaveis** entre plataformas e viavel: ambas usam formato `{{variavel}}`, mas com convencoes de nomes diferentes.

4. **Rate limits** sao muito diferentes: Instantly = 10 req/s, Snov.io = 60 req/min (1 req/s efetivo).

**[Alta Confianca]** Baseado em documentacao oficial de ambas as plataformas.

---

## Instantly API v2

### Instantly: Autenticacao {#instantly-autenticacao}

- **Metodo:** Bearer Token
- **Header:** `Authorization: Bearer <API_KEY>`
- **Content-Type:** `application/json`
- **Base URL:** `https://api.instantly.ai`
- **Scopes necessarios:** `campaigns:create`, `campaigns:all`, `leads:create`, `leads:all`, `all:create`, `all:all`
- **Plano minimo:** Growth plan (API v2 acesso)

**[Alta Confianca]** Verificado na documentacao oficial e consistente com a implementacao existente em `src/lib/services/instantly.ts`.

_Fonte: [Instantly API V2 - Developer Docs](https://developer.instantly.ai/)_

---

### Instantly: Rate Limits {#instantly-rate-limits}

| Parametro | Valor |
|-----------|-------|
| Rate limit | **10 requests por segundo** |
| Compartilhado entre | API v1 e v2 |
| Escopo | Todo o Workspace (mesmo com multiplas API keys) |
| HTTP status ao exceder | `429 Too Many Requests` |

**Impacto pratico para Epic 7:**
- Com batch de 1000 leads/request, um export de 5000 leads precisa de 5 requests = ~1 segundo
- Margem segura: 1 request a cada 200ms para evitar 429

**[Alta Confianca]** Verificado em [Rate Limit - Instantly Developer Docs](https://developer.instantly.ai/getting-started/rate-limit)

---

### Instantly: Criar Campanha {#instantly-criar-campanha}

**Endpoint:** `POST /api/v2/campaigns`

**Request Body (campos obrigatorios e relevantes):**

```json
{
  "name": "Minha Campanha",                    // required: string
  "campaign_schedule": {                        // required: object
    "schedules": [{
      "name": "Horario Comercial",
      "timing": {
        "from": "09:00",                        // required: HH:MM
        "to": "17:00"                           // required: HH:MM
      },
      "days": {
        "0": false,                             // domingo
        "1": true,                              // segunda
        "2": true,                              // terca
        "3": true,                              // quarta
        "4": true,                              // quinta
        "5": true,                              // sexta
        "6": false                              // sabado
      },
      "timezone": "America/Sao_Paulo"           // required: IANA timezone
    }],
    "start_date": "2026-03-01",                 // YYYY-MM-DD ou null
    "end_date": null                            // YYYY-MM-DD ou null
  },
  "sequences": [{                               // array (apenas 1 elemento usado)
    "steps": [
      {
        "type": "email",                        // required: sempre "email"
        "delay": 0,                             // dias ate o PROXIMO email
        "variants": [{
          "subject": "Ola {{first_name}}",      // required: string
          "body": "Ola {{first_name}},\n\nEspero que esteja bem.",
          "v_disabled": false                   // opcional: desativar variante
        }]
      },
      {
        "type": "email",
        "delay": 3,                             // 3 dias depois do anterior
        "variants": [{
          "subject": "Follow-up: {{company_name}}",
          "body": "{{first_name}}, gostaria de retomar..."
        }]
      }
    ]
  }],
  "email_list": ["remetente@empresa.com"],      // contas de envio
  "daily_limit": 100,                           // limite diario de emails
  "daily_max_leads": 50,                        // max novos leads/dia
  "stop_on_reply": true,                        // parar ao receber resposta
  "text_only": false,
  "link_tracking": true,
  "open_tracking": true,
  "stop_on_auto_reply": false,
  "stop_for_company": false,                    // parar para todo dominio ao responder
  "insert_unsubscribe_header": false
}
```

**Response (200 OK):**

```json
{
  "id": "019c0e38-b388-7f06-a8c8-eb2a40e02c19",  // UUID da campanha criada
  "name": "Minha Campanha",
  "status": 0,                                      // 0 = Draft (recem criada)
  "campaign_schedule": { ... },
  "sequences": [ ... ],
  "timestamp_created": "2026-02-06T...",
  "custom_variables": null,
  "core_variables": null,
  ...
}
```

**Status da Campanha (enum):**

| Valor | Status |
|-------|--------|
| 0 | Draft |
| 1 | Active |
| 2 | Paused |
| 3 | Completed |
| 4 | Running Subsequences |
| -99 | Account Suspended |
| -1 | Accounts Unhealthy |
| -2 | Bounce Protect |

**Notas importantes:**
- `sequences` e um array, mas **apenas o primeiro elemento e usado** — adicionar steps dentro dele
- `steps[].delay` = numero de dias ate o proximo email (0 para o primeiro)
- `steps[].type` = sempre `"email"` (unico tipo suportado)
- `variants[]` permite A/B testing com multiplas versoes do mesmo step
- A campanha e criada em status **Draft** (0) — precisa ser ativada separadamente

**[Alta Confianca]** Verificado em [Create Campaign - Instantly API V2](https://developer.instantly.ai/api/v2/campaign/createcampaign)

---

### Instantly: Estrutura de Sequences/Steps {#instantly-sequences}

```
sequences (array - usar apenas 1 elemento)
  └── steps (array de email steps)
       ├── step[0]
       │    ├── type: "email"
       │    ├── delay: 0 (primeiro email, sem delay)
       │    └── variants (array - A/B testing)
       │         ├── variant[0]: { subject, body }
       │         └── variant[1]: { subject, body, v_disabled: false }
       ├── step[1]
       │    ├── type: "email"
       │    ├── delay: 3 (3 dias apos step[0])
       │    └── variants: [{ subject, body }]
       └── step[2]
            ├── type: "email"
            ├── delay: 5 (5 dias apos step[1])
            └── variants: [{ subject, body }]
```

**Mapeamento direto do nosso Builder:**
- Cada `EmailBlock` do nosso builder → 1 step com 1 variant
- Cada `DelayBlock` do nosso builder → campo `delay` do step seguinte (converter horas para dias)
- Subject do EmailBlock → `variants[0].subject`
- Body do EmailBlock → `variants[0].body`

**[Alta Confianca]** Verificado em [Schemas - Instantly API V2](https://developer.instantly.ai/api/v2/schemas)

---

### Instantly: Adicionar Leads em Bulk {#instantly-bulk-add-leads}

**Endpoint:** `POST /api/v2/leads/add`

**Request Body:**

```json
{
  "campaign_id": "019c0e38-...",               // UUID da campanha (OU list_id)
  "leads": [                                    // 1 a 1000 leads por request
    {
      "email": "joao@empresa.com",             // required (quando campaign_id)
      "first_name": "Joao",
      "last_name": "Silva",
      "company_name": "Empresa Ltda",
      "phone": "+5511999999999",
      "personalization": "Vi que voce...",      // campo de texto livre
      "custom_variables": {                     // objeto flat (key-value)
        "ice_breaker": "Parabens pelo novo cargo de CTO!",
        "title": "CTO"
      }
    },
    {
      "email": "maria@outra.com",
      "first_name": "Maria",
      "company_name": "Outra SA",
      "custom_variables": {
        "ice_breaker": "O evento da semana passada foi incrivel",
        "title": "Head of Sales"
      }
    }
  ],
  "skip_if_in_workspace": false,
  "skip_if_in_campaign": true,                 // evitar duplicatas na campanha
  "skip_if_in_list": false,
  "blocklist_id": null,                        // usa blocklist padrao se null
  "verify_leads_on_import": false              // verificacao de email assincrona
}
```

**Response (200 OK):**

```json
{
  "status": "success",
  "total_sent": 2,
  "leads_uploaded": 2,
  "in_blocklist": 0,
  "duplicated_leads": 0,
  "skipped_count": 0,
  "invalid_email_count": 0,
  "incomplete_count": 0,
  "duplicate_email_count": 0,
  "remaining_in_plan": 9998,
  "created_leads": [
    { "id": "...", "email": "joao@empresa.com", "index": 0 },
    { "id": "...", "email": "maria@outra.com", "index": 1 }
  ]
}
```

**Limites e restricoes:**
- **Maximo:** 1000 leads por request
- **Email obrigatorio** quando usando `campaign_id`
- `custom_variables` = objeto flat, valores: `string | number | boolean | null` (arrays e objetos NAO permitidos)
- Response inclui `remaining_in_plan` — util para mostrar ao usuario

**[Alta Confianca]** Verificado em [Add leads in bulk - Instantly API V2](https://developer.instantly.ai/api/v2/lead/bulkaddleads)

---

### Instantly: Custom Variables {#instantly-custom-variables}

**Como funcionam:**
- Custom variables sao passadas no objeto `custom_variables` de cada lead
- Ao adicionar leads com custom variables, a **campanha e atualizada** para reconhecer essas variaveis para todos os leads
- No subject/body dos emails, referenciar como `{{nome_da_variavel}}`
- Valores permitidos: `string`, `number`, `boolean`, `null`
- **NAO** permitidos: objects, arrays

**Exemplo pratico para nosso app:**

```json
{
  "email": "joao@empresa.com",
  "first_name": "Joao",
  "company_name": "Empresa Ltda",
  "custom_variables": {
    "ice_breaker": "Parabens pelo novo cargo!",
    "title": "CTO"
  }
}
```

E no template do email:
```
Ola {{first_name}},

{{ice_breaker}}

Na {{company_name}}, imagino que voce como {{title}} esteja...
```

**Nota:** `first_name`, `last_name`, `company_name` sao campos nativos do lead (nao precisam estar em custom_variables). Apenas campos adicionais (como `ice_breaker`, `title`) vao em `custom_variables`.

**[Alta Confianca]** Verificado nas paginas de [Lead](https://developer.instantly.ai/api/v2/lead) e [Schemas](https://developer.instantly.ai/api/v2/schemas)

---

### Instantly: Gerenciar Campanha {#instantly-gerenciar-campanha}

| Acao | Metodo | Endpoint |
|------|--------|----------|
| Listar campanhas | GET | `/api/v2/campaigns?limit=10` |
| Obter campanha | GET | `/api/v2/campaigns/{id}` |
| Ativar/Iniciar | POST | `/api/v2/campaigns/{id}/activate` |
| Pausar | POST | `/api/v2/campaigns/{id}/pause` |
| Atualizar (patch) | PATCH | `/api/v2/campaigns/{id}` |
| Deletar | DELETE | `/api/v2/campaigns/{id}` |
| Buscar por email do lead | GET | `/api/v2/campaigns/search-by-contact` |
| Analytics | GET | `/api/v2/campaigns/analytics` |
| Analytics overview | GET | `/api/v2/campaigns/analytics/overview` |

**Fluxo completo de export para Instantly:**
1. `POST /api/v2/campaigns` — criar campanha (status = Draft)
2. `POST /api/v2/leads/add` — adicionar leads com custom_variables (batches de 1000)
3. `POST /api/v2/campaigns/{id}/activate` — ativar campanha

**[Alta Confianca]** Verificado em [Campaign - Instantly API V2](https://developer.instantly.ai/api/v2/campaign)

---

### Instantly: Adicionar Variaveis a Campanha {#instantly-add-campaign-variables}

**Endpoint:** `POST /api/v2/campaigns/{campaign_id}/variables`

Este endpoint permite adicionar variaveis customizadas a uma campanha existente. Na pratica, as variaveis tambem sao registradas automaticamente quando leads com `custom_variables` sao adicionados a campanha.

**[Media Confianca]** Endpoint confirmado na listagem de rotas, mas detalhes do payload nao foram extraidos da documentacao interativa.

_Fonte: [Add Campaign Variables - Instantly API V2](https://developer.instantly.ai/api/v2/campaign/addvariables)_

---

## Snov.io API

### Snov.io: Autenticacao {#snovio-autenticacao}

- **Metodo:** OAuth 2.0 (Client Credentials)
- **Endpoint de token:** `POST https://api.snov.io/v1/oauth/access_token`
- **Base URL:** `https://api.snov.io`

**Request:**

```
POST /v1/oauth/access_token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET
```

**Response:**

```json
{
  "access_token": "abc123...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Notas:**
- Token expira em **3600 segundos (1 hora)**
- Apos obter o token, usar como query param (`?access_token=...`) ou header `Authorization: Bearer ...`
- Credenciais encontradas em Account Settings no Snov.io

**[Alta Confianca]** Verificado em [Snov.io API Docs](https://snov.io/api) e consistente com `src/lib/services/snovio.ts` existente.

---

### Snov.io: Rate Limits {#snovio-rate-limits}

| Parametro | Valor |
|-----------|-------|
| Rate limit | **60 requests por minuto** |
| Efetivo | ~1 request por segundo |
| HTTP status ao exceder | `429` |

**Impacto pratico para Epic 7:**
- Adicionar 100 prospects = 100 requests = ~100 segundos (1.5 min)
- Adicionar 500 prospects = 500 requests = ~8.3 minutos
- **Necessario:** progress indicator + processamento em background

**Comparacao com Instantly:**
- Instantly: 10 req/s, 1000 leads/batch = 1000 leads em <1s
- Snov.io: 1 req/s, 1 lead/request = 1000 leads em ~17 minutos

**[Alta Confianca]** Verificado em [Snov.io API](https://snov.io/api)

---

### Snov.io: Gerenciar Listas de Prospects {#snovio-listas}

**Criar Lista:**

```
POST https://api.snov.io/v1/add-list
Body: { "access_token": "...", "name": "Minha Lista" }
```

**Listar Todas as Listas:**

```
GET https://api.snov.io/v1/get-user-lists
Authorization: Bearer <token>
```

**Obter Prospects de uma Lista:**

```
POST https://api.snov.io/v1/get-prospects-from-list
Body: { "access_token": "...", "list_id": 12345 }
```

**[Alta Confianca]** Verificado em [Snov.io API](https://snov.io/api)

---

### Snov.io: Adicionar Prospect a Lista {#snovio-add-prospect}

**Endpoint:** `POST https://api.snov.io/v1/add-prospect-to-list`

**Request Body:**

```json
{
  "access_token": "abc123...",
  "email": "joao@empresa.com",
  "firstName": "Joao",
  "lastName": "Silva",
  "fullName": "Joao Silva",
  "position": "CTO",
  "companyName": "Empresa Ltda",
  "companySite": "https://empresa.com",
  "phones": ["+5511999999999"],
  "country": "Brazil",
  "locality": "Sao Paulo",
  "socialLinks": {
    "linkedin": "https://linkedin.com/in/joaosilva"
  },
  "customFields[ice_breaker]": "Parabens pelo novo cargo!",
  "listId": 12345,
  "updateContact": true
}
```

**Notas Importantes:**
- **1 prospect por request** (sem endpoint de bulk add nativo)
- Custom fields passados como `customFields[nome_do_campo]`
- `updateContact: true` atualiza prospect existente com mesmo email
- Se a lista esta associada a uma campanha ativa, o prospect **entra automaticamente na campanha**
- Campos usam **camelCase** (`firstName`, `lastName`, `companyName`) — diferente do nosso modelo

**[Alta Confianca]** Verificado em [Snov.io API](https://snov.io/api) e [Snov.io Knowledgebase - How to use API](https://snov.io/knowledgebase/how-to-use-snov-io-api/)

---

### Snov.io: Campanhas (Drip Campaigns) {#snovio-campanhas}

> **ACHADO CRITICO:** A API do Snov.io **NAO possui endpoint para criacao de drip campaigns programaticamente.** Campanhas devem ser criadas pelo UI do Snov.io.

**Endpoints disponiveis (apenas leitura/monitoramento):**

| Acao | Metodo | Endpoint |
|------|--------|----------|
| Listar campanhas | GET | `/v1/get-user-campaigns` |
| Analytics de campanha | GET | `/v2/statistics/campaign-analytics` |
| Progresso da campanha | GET | `/v2/campaigns/{id}/progress` |

**Fluxo correto de integracao com Snov.io:**

```
1. Criar lista de prospects via API (POST /v1/add-list)
2. Adicionar prospects a lista via API (POST /v1/add-prospect-to-list) [1 por vez]
3. [MANUAL] Usuario cria drip campaign no UI do Snov.io e associa a lista
4. Prospects adicionados a lista entram automaticamente na campanha
```

**OU (se campanha ja existe):**

```
1. Listar campanhas via API (GET /v1/get-user-campaigns) para obter IDs
2. Identificar a lista associada a campanha existente
3. Adicionar prospects a essa lista via API
4. Prospects entram automaticamente na campanha ativa
```

**Impacto na Story 7.3 e 7.6:**
- A Story 7.3 (Snov.io Integration Service) **precisa ser ajustada** — `createDripCampaign()` nao e viavel via API
- O fluxo deve ser: criar lista + adicionar prospects + opcionalmente listar campanhas existentes
- A Story 7.6 (Export to Snov.io) deve oferecer: "Adicionar a lista existente" ou "Criar nova lista"

**[Alta Confianca]** Verificado em [Snov.io API](https://snov.io/api) e [Snov.io Knowledgebase - How to use API](https://snov.io/knowledgebase/how-to-use-snov-io-api/)

---

### Snov.io: Variaveis de Personalizacao {#snovio-variaveis}

**Formato:** `{{nome_variavel}}` (snake_case com underscores)

**Variaveis padrao disponiveis:**

| Campo do Prospect | Variavel no Email |
|-------------------|-------------------|
| Full name | `{{full_name}}` |
| First Name | `{{first_name}}` |
| Last Name | `{{last_name}}` |
| Position | `{{position}}` |
| Company name | `{{company_name}}` |
| Company website | `{{company_website}}` |
| Country | `{{country}}` |
| Location | `{{location}}` |
| Industry | `{{industry}}` |
| LinkedIn URL | `{{linkedin_url}}` |
| Facebook URL | `{{facebook_url}}` |
| Twitter URL | `{{twitter_url}}` |
| Sender account name | `{{sender_account_name}}` |

**Custom Fields como Variaveis:**
- Ate **30 custom fields** por conta
- Nome do campo vira variavel: campo "ice_breaker" → `{{ice_breaker}}`
- Custom fields passados na API como `customFields[ice_breaker]`

**[Alta Confianca]** Verificado em [Snov.io - How to use variables for personalization](https://snov.io/knowledgebase/how-to-add-variables-to-emails/)

---

### Snov.io: Custom Fields via API {#snovio-custom-fields}

**Listar custom fields existentes:**

```
GET https://api.snov.io/v1/prospect-custom-fields?access_token=...
```

**Response:**

```json
[
  {
    "key": "customFields['ice_breaker']",
    "label": "ice_breaker",
    "required": false,
    "type": "string"
  }
]
```

**[Alta Confianca]** Verificado em [Snov.io API](https://snov.io/api)

---

## Analise Comparativa para Epic 7

### Mapeamento de Variaveis {#mapeamento-variaveis}

| Variavel TDEC | Campo Lead | Instantly (email template) | Instantly (lead field) | Snov.io (email template) | Snov.io (prospect field) |
|---------------|-----------|---------------------------|----------------------|--------------------------|--------------------------|
| `{{first_name}}` | `lead.name` (split) | `{{first_name}}` | `first_name` (nativo) | `{{first_name}}` | `firstName` |
| `{{company_name}}` | `lead.company` | `{{company_name}}` | `company_name` (nativo) | `{{company_name}}` | `companyName` |
| `{{title}}` | `lead.title` | `{{title}}` | `custom_variables.title` | `{{title}}` | `position` |
| `{{ice_breaker}}` | `lead.icebreaker` | `{{ice_breaker}}` | `custom_variables.ice_breaker` | `{{ice_breaker}}` | `customFields[ice_breaker]` |

**Observacoes criticas:**
1. **Instantly** usa `snake_case` nos campos nativos (`first_name`, `company_name`) — **alinhado com nosso formato**
2. **Snov.io** usa `camelCase` nos campos da API (`firstName`, `companyName`) mas `snake_case` nas variaveis de email (`{{first_name}}`, `{{company_name}}`)
3. No Instantly, `title` nao e campo nativo — vai como `custom_variable`
4. No Snov.io, `title` mapeia para o campo nativo `position`
5. `ice_breaker` e custom em ambas as plataformas

---

### Fluxo de Integracao por Plataforma {#fluxos-integracao}

#### Instantly — Fluxo Completo via API

```
[Nosso App]
    │
    ├── 1. POST /api/v2/campaigns
    │   Body: { name, campaign_schedule, sequences[{steps}] }
    │   Response: { id: "campaign-uuid" }
    │
    ├── 2. POST /api/v2/leads/add (batches de 1000)
    │   Body: { campaign_id, leads[{email, first_name, company_name, custom_variables}] }
    │   Response: { leads_uploaded, remaining_in_plan }
    │
    └── 3. POST /api/v2/campaigns/{id}/activate
        Response: campanha ativa e enviando
```

**Tempo estimado para 500 leads:** < 2 segundos

#### Snov.io — Fluxo Hibrido (API + UI)

```
[Nosso App]
    │
    ├── 1. POST /v1/add-list
    │   Body: { access_token, name: "TDEC - Campanha X" }
    │   Response: { id: list_id }
    │
    ├── 2. POST /v1/add-prospect-to-list (1 por vez, loop)
    │   Body: { access_token, listId, email, firstName, companyName, customFields[ice_breaker] }
    │   [Rate limit: 60/min → ~1/segundo]
    │
    └── 3. [MANUAL] Usuario abre Snov.io → cria drip campaign → associa lista
        OU
        [Se campanha ja existe e esta linkada a lista → prospects entram automaticamente]
```

**Tempo estimado para 500 leads:** ~8-9 minutos

---

### Limitacoes e Restricoes {#limitacoes}

| Aspecto | Instantly | Snov.io |
|---------|-----------|---------|
| Criar campanha via API | SIM | **NAO** |
| Bulk add leads | 1000/request | **1 por vez** |
| Rate limit | 10 req/s | 60 req/min (~1 req/s) |
| Custom variables | Ilimitadas (flat object) | Ate 30 custom fields |
| Criar sequencia de emails | Via API (sequences.steps) | **Apenas via UI** |
| Ativar campanha | Via API | **Apenas via UI** |
| Token expiration | Nao expira (API key) | 1 hora (OAuth2) |
| Export completo via API | 100% automatizado | **Parcial** (lista + prospects) |

---

## Impacto nas Stories da Epic 7 {#impacto-stories}

### Story 7.2 (Instantly Service) — SEM MUDANCAS NECESSARIAS

O servico pode ser implementado conforme planejado:
- `createCampaign(name, sequences)` → `POST /api/v2/campaigns`
- `addLeadsToCampaign(campaignId, leads)` → `POST /api/v2/leads/add` (batches de 1000)
- `activateCampaign(campaignId)` → `POST /api/v2/campaigns/{id}/activate`
- `getCampaignStatus(campaignId)` → `GET /api/v2/campaigns/{id}`

### Story 7.3 (Snov.io Service) — PRECISA AJUSTE

**Antes (planejado):**
- `createDripCampaign(name, sequences)` — NAO E POSSIVEL via API

**Depois (ajustado):**
- `createProspectList(name)` → `POST /v1/add-list`
- `addProspectToList(listId, prospect)` → `POST /v1/add-prospect-to-list`
- `getUserCampaigns()` → `GET /v1/get-user-campaigns`
- `getUserLists()` → `GET /v1/get-user-lists`
- `getCustomFields()` → `GET /v1/prospect-custom-fields`

### Story 7.5 (Export to Instantly) — SEM MUDANCAS

Fluxo 100% automatizado conforme planejado.

### Story 7.6 (Export to Snov.io) — PRECISA AJUSTE

**Antes (planejado):**
1. Criar drip campaign no Snov.io
2. Adicionar recipients

**Depois (ajustado):**
1. Criar lista de prospects no Snov.io (ou selecionar existente)
2. Adicionar prospects a lista (com progress bar — operacao lenta)
3. Informar usuario: "Lista criada no Snov.io. Crie uma campanha no Snov.io e associe a lista '[nome]'"
4. Opcionalmente: link direto para o Snov.io (`https://app.snov.io/campaigns`)

### Story 7.1 (Variaveis) — AJUSTE MENOR

Mapeamento de variaveis confirmado. Adicionar ao registry:
- Instantly: campos nativos (`first_name`, `company_name`) + custom_variables (`ice_breaker`, `title`)
- Snov.io: campos API em camelCase + customFields em bracket notation

### Story 7.8 (Validacao) — ADICIONAR CENARIO

Adicionar validacao para Snov.io:
- Verificar se lista foi criada com sucesso antes de adicionar prospects
- Timeout mais longo para operacoes de batch (ate 10 min para listas grandes)
- Feedback de progresso: "Adicionando prospect X de Y..."

---

## Decisoes Tecnicas Recomendadas {#decisoes-tecnicas}

### 1. Formato de Variaveis Unificado

**Recomendacao:** Manter `{{snake_case}}` para todas as variaveis.
- Alinhado com Instantly (campos nativos ja sao snake_case)
- Alinhado com Snov.io (variaveis no email sao snake_case)
- Apenas a API do Snov.io usa camelCase (mapeamento na camada de servico)

### 2. Batch Strategy

**Instantly:** Enviar em batches de 1000 leads (maximo permitido). Com 10 req/s, e praticamente instantaneo.

**Snov.io:** Enviar 1 a 1 com delay de 1.1 segundo entre requests. Necessario:
- Progress bar com percentual
- Estimativa de tempo restante
- Opcao de cancelar
- Processamento em background (nao bloquear UI)

### 3. Token Management (Snov.io)

Implementar renovacao automatica do access_token:
- Cache do token em memoria
- Renovar proativamente antes de expirar (ex: apos 50 minutos)
- Retry com novo token se receber 401

### 4. Formato CSV para Import

**Instantly CSV format:**
- Colunas: `email`, `first_name`, `last_name`, `company_name`, `personalization`, `ice_breaker`, `title`
- Custom variables como colunas adicionais

**Snov.io CSV format:**
- Colunas: `email`, `firstName`, `lastName`, `companyName`, `position`
- Custom fields como colunas adicionais

### 5. Limite de Leads por Export

- **Instantly:** 1000 por batch (sem limite total pratico)
- **Snov.io:** Sem limite de API, mas rate limit torna inviavel mais de ~3000 leads em uma sessao (50 min)
- **Recomendacao:** Avisar usuario quando Snov.io export > 500 leads sobre o tempo estimado

---

## Fontes {#fontes}

1. [Instantly API V2 - Developer Docs](https://developer.instantly.ai/) — Documentacao oficial completa da API v2
2. [Create Campaign - Instantly API V2](https://developer.instantly.ai/api/v2/campaign/createcampaign) — Endpoint de criacao de campanha
3. [Add leads in bulk - Instantly API V2](https://developer.instantly.ai/api/v2/lead/bulkaddleads) — Endpoint de adicao de leads em bulk
4. [Lead - Instantly API V2](https://developer.instantly.ai/api/v2/lead) — Schema de leads e custom variables
5. [Schemas - Instantly API V2](https://developer.instantly.ai/api/v2/schemas) — Schemas completos (sequences, steps, variants)
6. [Rate Limit - Instantly](https://developer.instantly.ai/getting-started/rate-limit) — Rate limits da API
7. [Campaign - Instantly API V2](https://developer.instantly.ai/api/v2/campaign) — Todos os endpoints de campanha
8. [Add Campaign Variables - Instantly API V2](https://developer.instantly.ai/api/v2/campaign/addvariables) — Endpoint de variaveis
9. [Snov.io API Docs](https://snov.io/api) — Documentacao oficial da API
10. [Snov.io - How to use API](https://snov.io/knowledgebase/how-to-use-snov-io-api/) — Guia de uso da API
11. [Snov.io - Variables for personalization](https://snov.io/knowledgebase/how-to-add-variables-to-emails/) — Formato de variaveis
12. [Snov.io - Custom fields](https://snov.io/knowledgebase/adding-custom-prospect-fields-for-personalization/) — Custom fields para personalizacao
13. [Snov.io - Drip Campaigns Guide](https://snov.io/blog/a-complete-guide-to-snovio-drip-campaigns/) — Guia completo de drip campaigns
14. [API V2 - Instantly Help Center](https://help.instantly.ai/en/articles/10432807-api-v2) — Artigo de ajuda sobre API v2
