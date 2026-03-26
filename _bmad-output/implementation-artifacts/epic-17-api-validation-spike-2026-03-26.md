# Spike de Validacao — APIs Externas para Pipeline EP17

**Data:** 2026-03-26
**Tipo:** Spike de validacao (padrao obrigatorio desde Epic 15)
**Objetivo:** Validar contratos, gaps e riscos de cada service que o pipeline vai orquestrar
**Status:** Concluido

---

## Pipeline: 5 Steps → 5+ Services

```
Step 1: SearchCompaniesStep  → TheirStackService.searchCompanies()
Step 2: SearchLeadsStep      → ApolloService.searchPeople() + enrichPeople()
Step 3: CreateCampaignStep   → KnowledgeBaseContext + PromptManager + OpenAI + ApifyService
Step 4: ExportStep           → InstantlyService.createCampaign() + addLeads + addAccounts
Step 5: ActivateStep         → InstantlyService.activateCampaign()
```

---

## Step 1: SearchCompaniesStep → TheirStackService

### Contrato Existente

| Metodo | Input | Output | Custo |
|--------|-------|--------|-------|
| `searchCompanies(apiKey, filters)` | `TheirStackSearchFilters` | `CompanySearchResponse` | 3 credits/empresa |
| `getCredits(apiKey)` | apiKey | `TheirStackCredits` | 0 |
| `searchTechnologies(apiKey, query)` | query string | `KeywordAggregated[]` | 0 |

### TheirStackSearchFilters (o que o service aceita)
```typescript
{
  technologySlugs: string[];       // OBRIGATORIO — slugs do catalogo
  countryCodes?: string[];         // Ex: ["BR", "US"]
  minEmployeeCount?: number;
  maxEmployeeCount?: number;
  industryIds?: number[];          // IDs numericos da API
  page?: number;                   // 0-based
  limit?: number;                  // 1-50 (default 10)
}
```

### ParsedBriefing (o que o pipeline tem)
```typescript
{
  technology: string | null;       // Texto livre — ex: "React"
  location: string | null;         // Texto livre — ex: "Brasil"
  companySize: string | null;      // Texto livre — ex: "50-200"
  industry: string | null;         // Texto livre — ex: "SaaS"
  ...
}
```

### GAP 1 (CRITICO): Mapeamento de parametros briefing → service

| Campo Briefing | Campo Service | Tipo de conversao necessaria |
|----------------|--------------|------------------------------|
| `technology: "React"` | `technologySlugs: ["react"]` | Buscar slug via `searchTechnologies()` |
| `location: "Brasil"` | `countryCodes: ["BR"]` | Mapeamento texto → codigo ISO |
| `companySize: "50-200"` | `minEmployeeCount: 50, maxEmployeeCount: 200` | Parse de range string |
| `industry: "SaaS"` | `industryIds: [123]` | Mapeamento texto → ID numerico |

**Impacto:** O SearchCompaniesStep NAO pode simplesmente passar `briefing.technology` para o service. Precisa de camada de resolucao.

**Resolucao proposta:**
1. `technology` → Chamar `searchTechnologies(briefing.technology)` e usar o primeiro match (ou pedir confirmacao no modo guiado)
2. `location` → Mapa estatico de paises comuns (Brasil→BR, EUA→US, etc.) + fallback para texto livre se nao encontrar
3. `companySize` → Regex para extrair min/max de strings como "50-200", "51-200 funcionarios", etc.
4. `industry` → Mapa estatico dos industryIds mais comuns do TheirStack, ou ignorar filtro se nao mapeavel

### GAP 2 (MEDIO): Paginacao para volumes maiores

O step precisa decidir: buscar apenas 1 pagina (ate 50 empresas) ou paginar?

**Recomendacao:** Na Epic 17, buscar 1 pagina com `limit=50`. Suficiente para primeiro ciclo. Paginacao avancada pode ser Epic futura.

### Validacao do Output

Output de `searchCompanies()` inclui:
- `domain` → Usado pelo Step 2 (Apollo domains filter)
- `apollo_id` → Pode ser usado para cross-reference (opcional, nullable)
- `name`, `country`, `industry`, `employee_count_range` → Contexto para approval gate

**Validado:** Output e compativel com input do Step 2.

---

## Step 2: SearchLeadsStep → ApolloService

### Contrato Existente

| Metodo | Input | Output | Custo |
|--------|-------|--------|-------|
| `searchPeople(filters)` | `ApolloSearchFilters` | `ApolloSearchResult` (leads + pagination) | Variavel |
| `enrichPeople(apolloIds, options)` | apolloIds (max 10) | `ApolloEnrichedPerson[]` | Variavel |
| `enrichPeopleByDetails(details)` | details (max 10) | `ApolloEnrichmentResponse[]` | Variavel |

### ApolloSearchFilters (o que o service aceita)
```typescript
{
  titles?: string[];              // Ex: ["CEO", "CTO"]
  locations?: string[];           // Ex: ["Sao Paulo, Brazil"]
  companySizes?: string[];        // Ex: ["11-50", "51-200"]
  domains?: string[];             // Dominios das empresas (do Step 1!)
  keywords?: string;
  industries?: string[];
  contactEmailStatuses?: string[];
  page?: number;                  // 1-based (max 500)
  perPage?: number;               // 1-100 (default 25)
}
```

### GAP 3 (CRITICO): searchPeople NAO retorna email

`searchPeople()` retorna dados **obfuscados**:
- `last_name` → obfuscado
- `email` → **null** (nao disponivel sem enrichment)
- `phone` → **null**

**Impacto:** O Step 4 (Export para Instantly) **EXIGE** email para cada lead. Sem enrichment, o pipeline quebra.

**Resolucao obrigatoria:** O SearchLeadsStep deve:
1. Chamar `searchPeople()` para descobrir leads
2. Chamar `enrichPeople()` em batches de 10 para obter email + dados completos
3. Filtrar leads sem email apos enrichment

**Custo adicional:** Enrichment consome credits separados do search. Incluir na estimativa de custo.

### GAP 4 (MEDIO): Batch de enrichment limitado a 10

Para 60 leads (30 empresas × 2 leads/empresa), sao necessarias 6 chamadas de enrichment em serie (10 por batch). Com rate limiting, ~1s por chamada = ~6 segundos.

**Recomendacao:** Aceitavel para MVP. Paralelizar batches se performance virar problema.

### GAP 5 (BAIXO): Mapeamento de parametros

| Campo Briefing | Campo Apollo | Conversao |
|----------------|-------------|-----------|
| `jobTitles: ["CEO"]` | `titles: ["CEO"]` | Direto — sem conversao |
| `location: "Brasil"` | `locations: ["Brazil"]` | Mapeamento texto simples |
| `companySize: "50-200"` | `companySizes: ["51-200"]` | Mapeamento para ranges Apollo |
| Step 1 output `domains` | `domains: [...]` | Direto — extrair de companies |

**Validado:** Mapeamento mais simples que TheirStack. `domains` do Step 1 passa direto.

### Validacao do Output

Apos enrichment, cada lead tera:
- `email` → OBRIGATORIO para Step 4
- `first_name`, `last_name` → Para personalizacao
- `title` → Para icebreaker e email
- `organization.name` → Company name
- `linkedin_url` → Para icebreaker premium (Apify)

**Validado:** Output enriquecido e compativel com Steps 3 e 4.

---

## Step 3: CreateCampaignStep → AI + Apify + KB

### Sub-operacoes do Step

Este e o step mais complexo. Envolve 4 sub-operacoes:

```
3a. Carregar contexto KB (KnowledgeBaseContext.buildAIVariables)
3b. Gerar estrutura de campanha (POST /api/ai/campaign-structure)
3c. Gerar emails por lead (POST /api/ai/generate × N leads)
3d. Gerar icebreakers (POST /api/leads/enrich-icebreaker)
```

### GAP 6 (CRITICO): Decisao arquitetural — chamar API Routes ou Services direto?

**Opcao A — Chamar API Routes:**
- Pro: Reutiliza logica existente de auth, validacao, KB loading
- Pro: Mantem API routes como unica interface
- Contra: Overhead de HTTP (fetch localhost para si mesmo)
- Contra: Cada chamada precisa de auth header

**Opcao B — Chamar Services direto:**
- Pro: Mais rapido (sem overhead HTTP)
- Pro: Controle total de parametros
- Contra: Precisa replicar logica de KB loading e prompt rendering
- Contra: Bypassa validacao das routes

**Recomendacao:** **Opcao B — chamar services direto**, porque:
1. O Step ja roda no server-side (API route do step)
2. Tem acesso direto ao tenant_id (auth ja resolvida na route do step)
3. Evita fetch para si mesmo (anti-pattern)
4. Performance critica — gerar emails para 60 leads via HTTP seria lento

**Implementacao proposta:**
```typescript
// No CreateCampaignStep.executeInternal()
const kbContext = await KnowledgeBaseContext.load(tenantId);
const aiVars = KnowledgeBaseContext.buildAIVariables(kbContext, product);
const prompt = await PromptManager.renderPrompt('campaign_structure_generation', aiVars);
const result = await openaiProvider.generateText(prompt.content, { temperature: 0.7 });
```

### GAP 7 (ALTO): Icebreaker premium pode ser MUITO lento

Apify scraping: **10-30 segundos por perfil LinkedIn**, timeout de 60s.

Para 60 leads com icebreaker premium:
- Sequencial: 60 × 20s = **20 minutos** (inaceitavel)
- Batch de 5 paralelos: 12 batches × 20s = **~4 minutos** (aceitavel mas lento)
- Sem icebreaker premium (standard): 60 × 0.5s = **30 segundos** (rapido)

**Recomendacao:**
1. **Default:** Icebreaker standard (sem LinkedIn scraping) — rapido e confiavel
2. **Opcional:** Icebreaker premium se usuario tem Apify configurado E escolher explicitamente
3. **NFR2:** Pipeline completo deve ser < 15 min — icebreaker premium para 60+ leads pode estourar

### GAP 8 (MEDIO): Email generation para muitos leads

Para 60 leads × 3 emails = 180 chamadas OpenAI.

**Otimizacao existente:**
- `POST /api/leads/enrich-icebreaker` ja processa em batches de 5
- Mas email generation nao tem batch — seria 1 chamada por email

**Recomendacao:**
1. Gerar campanha TEMPLATE (1 chamada) com variaveis `{{lead_name}}`, `{{icebreaker}}`, etc.
2. Variaveis resolvidas no export (Instantly suporta custom_variables)
3. Icebreakers gerados em batch separado
4. Resultado: ~1-3 chamadas OpenAI para template + N chamadas para icebreakers

### Validacao do Output

O Step 3 deve produzir:
```typescript
{
  campaignName: string;
  sequences: Array<{
    subject: string;          // Template com {{variaveis}}
    body: string;             // Template com {{variaveis}}
    delayDays: number;
  }>;
  leads: Array<{
    ...leadData,
    icebreaker: string;       // Gerado individualmente
    customVariables: Record<string, string>;
  }>;
}
```

**Validado:** Formato compativel com InstantlyService.createCampaign() e addLeadsToCampaign().

---

## Step 4: ExportStep → InstantlyService

### Contrato Existente

| Metodo | Input | Output |
|--------|-------|--------|
| `createCampaign(params)` | name, sequences, sendingAccounts? | `{ campaignId, name, status }` |
| `addLeadsToCampaign(params)` | campaignId, leads[] | `{ leadsUploaded, duplicated, invalid }` |
| `addAccountsToCampaign(params)` | campaignId, accountEmails[] | `{ success, accountsAdded }` |

### Fluxo do Step
```
1. createCampaign() → obtem campaignId
2. addLeadsToCampaign() → envia leads em batches de 1000
3. addAccountsToCampaign() → associa sending accounts
```

### GAP 9 (ALTO): Sending accounts — de onde vem?

O briefing (`ParsedBriefing`) NAO tem campo para sending accounts. Mas o Instantly exige pelo menos 1 account para ativar.

**Opcoes:**
A. Buscar accounts via `InstantlyService.listAccounts()` e usar todas disponiveis
B. Adicionar campo `sendingAccounts` ao briefing (mudanca no parser)
C. Pedir no approval gate de campanha (modo guiado)
D. Configuracao default no tenant (settings)

**Recomendacao:** **Opcao A + C**
- `listAccounts()` ja existe e retorna todas accounts configuradas
- No modo Guiado: mostrar accounts no approval gate para o usuario confirmar
- No modo Autopilot: usar todas accounts ativas automaticamente
- Se zero accounts: erro claro "Nenhuma conta de envio configurada no Instantly"

### GAP 10 (BAIXO): Lead format mapping

InstantlyService espera:
```typescript
{
  email: string;           // OBRIGATORIO
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  title?: string;          // → custom_variables
  icebreaker?: string;     // → custom_variables
}
```

**Validado:** Dados do Step 2 (enrichment) + Step 3 (icebreaker) cobrem todos os campos.

### Limites e Custos

- Batch: max 1000 leads por chamada
- Rate limit: 150ms entre chamadas
- Para 60 leads: 1 batch, ~1 segundo
- Para 1000+ leads: N batches, ~N × 1.15 segundos
- Custo: R$ 0.00 (Instantly nao cobra por API)

---

## Step 5: ActivateStep → InstantlyService

### Contrato Existente

| Metodo | Input | Output |
|--------|-------|--------|
| `activateCampaign(params)` | apiKey, campaignId | `{ success: boolean }` |

**Validado:** Simples, baixo risco. Precisa apenas do `campaignId` do Step 4.

**Pre-condicao:** Campanha deve ter:
- Pelo menos 1 lead
- Pelo menos 1 sending account
- Status Draft (0)

---

## Resumo de Gaps

### Criticos (bloqueia implementacao)

| # | Gap | Step | Resolucao |
|---|-----|------|-----------|
| 1 | Mapeamento briefing → TheirStack params (slugs, country codes, industry IDs) | 1 | Camada de resolucao com `searchTechnologies()` + mapas estaticos |
| 3 | `searchPeople()` nao retorna email | 2 | Incluir sub-step de enrichment obrigatorio |
| 6 | Chamar API routes vs services direto no CreateCampaignStep | 3 | Services direto (decisao arquitetural) |

### Altos (impacta design)

| # | Gap | Step | Resolucao |
|---|-----|------|-----------|
| 7 | Icebreaker premium lento (10-30s × N leads) | 3 | Default standard; premium opcional |
| 9 | Sending accounts nao vem no briefing | 4 | `listAccounts()` + confirmation no gate |

### Medios (impacta implementacao)

| # | Gap | Step | Resolucao |
|---|-----|------|-----------|
| 2 | Paginacao para volumes maiores | 1 | Limit 50 no MVP, paginar depois |
| 4 | Enrichment batch limitado a 10 | 2 | 6 chamadas seriais para 60 leads (~6s) |
| 5 | Mapeamento simples briefing → Apollo | 2 | Mapa texto simples |
| 8 | Email generation para muitos leads | 3 | Template unico + variaveis |

### Baixos (detalhe de implementacao)

| # | Gap | Step | Resolucao |
|---|-----|------|-----------|
| 10 | Lead format mapping para Instantly | 4 | Dados cobertos pelos steps anteriores |

---

## Estimativa de Tempo por Step (Pipeline 60 leads)

| Step | Operacao | Tempo estimado |
|------|----------|----------------|
| 1 - SearchCompanies | 1 chamada TheirStack | ~2-3s |
| 2 - SearchLeads | 1 search + 6 enrichment batches | ~8-12s |
| 3 - CreateCampaign | KB load + 1-3 AI calls + 12 icebreaker batches | ~30-60s (standard) |
| 3 - CreateCampaign | (com icebreaker premium) | ~3-5 min |
| 4 - Export | 1 create + 1 leads batch + 1 accounts | ~3-5s |
| 5 - Activate | 1 chamada | ~1-2s |
| **Total (standard)** | | **~45s - 1.5min** |
| **Total (premium)** | | **~4-6 min** |

**NFR2 (< 15 min):** Atendido com folga em ambos cenarios.

---

## Decisoes Arquiteturais Validadas

### 1. Steps chamam services direto (nao API routes)
- Motivo: Performance + evita anti-pattern de fetch para si mesmo
- Excecao: Nenhuma

### 2. Enrichment obrigatorio no SearchLeadsStep
- Motivo: Instantly exige email; searchPeople nao retorna email
- Custo: Credits adicionais de Apollo (incluir na estimativa)

### 3. Icebreaker standard como default
- Motivo: Premium muito lento para volumes > 20 leads
- Icebreaker premium: Feature futura com opt-in explicito

### 4. Template de campanha unico + variaveis
- Motivo: Gerar 180 emails individuais via OpenAI seria lento e caro
- Instantly suporta `custom_variables` nativamente

### 5. Sending accounts via listAccounts()
- Motivo: Briefing nao tem esse dado; accounts mudam com frequencia
- Modo Guiado: Usuario confirma no gate
- Modo Autopilot: Todas accounts ativas

### 6. Paginacao limitada no MVP
- TheirStack: max 50 empresas (1 pagina)
- Apollo: max 100 leads (1 pagina) + enrichment
- Suficiente para primeiro ciclo de validacao

---

## Impacto nos Tipos Existentes

### ParsedBriefing — sem mudanca necessaria

Os campos existentes sao suficientes. A camada de resolucao (briefing → service params) fica dentro de cada Step, nao no tipo.

### StepOutput — precisa de tipagem mais rica

```typescript
// Proposta: output tipado por step (extends Record<string, unknown>)
interface SearchCompaniesOutput {
  companies: TheirStackCompany[];
  totalFound: number;
  technologySlug: string;        // Slug resolvido
  filtersApplied: Record<string, unknown>;
}

interface SearchLeadsOutput {
  leads: ApolloEnrichedPerson[];  // Enriquecidos!
  totalFound: number;
  totalEnriched: number;
  enrichmentSkipped: number;     // Leads sem apollo_id
}

interface CreateCampaignOutput {
  campaignName: string;
  sequences: CampaignSequence[];
  leadsWithIcebreakers: LeadWithIcebreaker[];
  icebreakerStats: { generated: number; failed: number; skipped: number };
}

interface ExportOutput {
  instantlyCampaignId: string;
  leadsUploaded: number;
  accountsAdded: number;
  sendingAccounts: string[];
}

interface ActivateOutput {
  activated: boolean;
  campaignName: string;
  instantlyCampaignId: string;
}
```

### PipelineError — ja existe, sem mudanca

```typescript
interface PipelineError {
  code: string;
  message: string;
  stepNumber: number;
  stepType: StepType;
  isRetryable: boolean;
  externalService?: string;
}
```

### AGENT_ERROR_CODES — expandir conforme convenção de error handling

Ja documentado em `epic-17-error-handling-convention.md`.

---

## Checklist Pre-Story 17.1

Com base neste spike, antes de iniciar a Story 17.1:

- [x] Convenção de error handling documentada (epic-17-error-handling-convention.md)
- [x] Spike de validação APIs concluido (este documento)
- [x] Gaps criticos identificados e resolucoes propostas
- [x] Decisoes arquiteturais validadas
- [x] Estimativas de tempo dentro do NFR2
- [ ] Mock factories para TheirStack, Apollo, Instantly (Item Paralelo — pode ser na 17.1)
- [ ] Refatorar useAgentMessages → useAgentExecution (Item C — pode ser na 17.1)

---

## Apendice: Mapeamento Completo de Dependencias

```
ParsedBriefing
  ├── technology ─────→ searchTechnologies() ─→ slug ─→ TheirStack.searchCompanies()
  ├── jobTitles ──────→ Apollo.searchPeople(titles)
  ├── location ───────→ countryCode map ─→ TheirStack + Apollo
  ├── companySize ────→ parse range ─→ TheirStack(min/max) + Apollo(companySizes)
  ├── industry ───────→ industryId map ─→ TheirStack + Apollo
  ├── productSlug ────→ DB lookup ─→ KnowledgeBaseContext.buildAIVariables(product)
  ├── mode ───────────→ Orchestrator (guided = gates, autopilot = auto-advance)
  └── skipSteps ──────→ Orchestrator (shouldSkip())

Step 1 Output (companies[])
  ├── domain ─────────→ Apollo.searchPeople(domains)
  ├── apollo_id ──────→ Cross-reference (opcional)
  └── name/info ──────→ Approval gate display

Step 2 Output (enriched leads[])
  ├── email ──────────→ Instantly.addLeadsToCampaign() [OBRIGATORIO]
  ├── first/last_name ─→ Instantly lead + email personalizacao
  ├── title ──────────→ Instantly custom_variables + email context
  ├── linkedin_url ───→ ApifyService (icebreaker premium) [OPCIONAL]
  └── organization ───→ Email context + approval gate

Step 3 Output (campaign + icebreakers)
  ├── sequences ──────→ Instantly.createCampaign()
  ├── icebreaker ─────→ Instantly custom_variables
  └── campaign_name ──→ Instantly + UI

Step 4 Output (campaign ID + stats)
  ├── campaignId ─────→ Instantly.activateCampaign()
  └── stats ──────────→ Summary message

Step 5 Output (activation)
  └── status ─────────→ Final summary message + execution completed
```
