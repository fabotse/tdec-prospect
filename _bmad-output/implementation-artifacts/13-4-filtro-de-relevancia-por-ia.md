# Story 13.4: Filtro de Relevância por IA

Status: done

## Story

As a sistema de monitoramento,
I want classificar automaticamente posts novos do LinkedIn usando IA para determinar relevância ao negócio do usuário,
so that apenas posts relevantes gerem insights, evitando ruído e otimizando custo.

## Acceptance Criteria

1. Novo `PromptKey` `"monitoring_relevance_filter"` adicionado ao enum em `ai-prompt.ts` e ao array `PROMPT_KEYS` e schema Zod `promptKeySchema`
2. Prompt default adicionado em `defaults.ts` — recebe contexto da empresa (company_context, products_services, competitive_advantages, icp_summary) e post (post_text, post_url)
3. OpenAI retorna classificação JSON: `{ "isRelevant": boolean, "reasoning": "string" }` — binário relevante/não relevante
4. Se relevante: insight inserido em `lead_insights` com `relevance_reasoning` preenchido e `status='new'`
5. Se não relevante: post descartado — NÃO inserido em `lead_insights`
6. Fallback: se Knowledge Base NÃO configurado (sem company profile), marcar TODOS os posts como relevantes (sem chamar AI)
7. Fallback: se OpenAI key NÃO configurada, marcar TODOS os posts como relevantes (sem chamar AI)
8. Fallback: se chamada OpenAI falhar (timeout, rate limit, JSON inválido), marcar post como relevante (fail-open)
9. Modelo usado: `gpt-4o-mini` — cost optimized (classificação = tarefa de baixa complexidade)
10. Custo logado em `api_usage_logs` com `service_name='openai'`, `request_type='monitoring_relevance_filter'`
11. `process-batch/route.ts` modificado: filtro de relevância executado ANTES da inserção em `lead_insights`
12. Testes unitários para lógica de classificação (parsing JSON, fallbacks, integração no processLead)

## Tasks / Subtasks

- [x] Task 1: Adicionar PromptKey e prompt default (AC: #1, #2, #9)
  - [x] 1.1 Adicionar `"monitoring_relevance_filter"` ao type `PromptKey` em `src/types/ai-prompt.ts`
  - [x] 1.2 Adicionar ao array `PROMPT_KEYS` em `src/types/ai-prompt.ts`
  - [x] 1.3 Adicionar ao schema `promptKeySchema` (z.enum) em `src/types/ai-prompt.ts`
  - [x] 1.4 Adicionar prompt default em `src/lib/ai/prompts/defaults.ts` com `modelPreference: "gpt-4o-mini"`, `temperature: 0.3`, `maxTokens: 200`
  - [x] 1.5 Atualizar testes existentes de `ai-prompt` se houver validação de exhaustividade do enum

- [x] Task 2: Criar utilitário de classificação de relevância (AC: #3, #6, #7, #8)
  - [x] 2.1 Criar `src/lib/utils/relevance-classifier.ts`
  - [x] 2.2 Função `classifyPostRelevance(postText, postUrl, kbContext, openaiKey, supabase, tenantId)` → `{ isRelevant: boolean, reasoning: string }`
  - [x] 2.3 Helper `loadPromptTemplate(supabase, tenantId)` — busca prompt em `ai_prompts` (tenant → global → code default), SEM usar PromptManager (sem cookies no cron)
  - [x] 2.4 Helper `interpolatePromptVariables(template, variables)` — substituição simples de `{{variable}}`
  - [x] 2.5 Helper `parseClassificationResponse(text)` — parse do JSON retornado pela OpenAI, com tratamento de JSON malformado
  - [x] 2.6 Implementar fallback KB não configurado: retornar `{ isRelevant: true, reasoning: "KB não configurado — post aceito por padrão" }`
  - [x] 2.7 Implementar fallback OpenAI key ausente: retornar `{ isRelevant: true, reasoning: "OpenAI key não configurada — post aceito por padrão" }`
  - [x] 2.8 Implementar fallback erro OpenAI: try/catch → retornar `{ isRelevant: true, reasoning: "Erro na classificação — post aceito por padrão (fail-open)" }`
  - [x] 2.9 Tipo `RelevanceClassification` para retorno

- [x] Task 3: Integrar filtro no process-batch (AC: #4, #5, #10, #11)
  - [x] 3.1 Modificar `processLead()` em `src/app/api/monitoring/process-batch/route.ts`
  - [x] 3.2 Adicionar parâmetro `openaiKey: string | null` e `kbContext: KBContextForClassification | null` a processLead
  - [x] 3.3 Após `detectNewPosts()`, para cada novo post: chamar `classifyPostRelevance()`
  - [x] 3.4 Filtrar posts — apenas inserir os relevantes em `lead_insights` com `relevance_reasoning`
  - [x] 3.5 Adicionar helper `getOpenAIKey(supabase, tenantId)` — mesmo padrão de `getApifyKey`
  - [x] 3.6 Adicionar helper `loadKBContext(supabase, tenantId)` — busca company_profiles + products
  - [x] 3.7 Carregar OpenAI key e KB context uma vez no POST handler, passar para processLead
  - [x] 3.8 Logar custo de classificação em `api_usage_logs` (service_name='openai', request_type='monitoring_relevance_filter')
  - [x] 3.9 Atualizar `MonitoringBatchResult` para incluir `postsFiltered: number` (posts descartados)

- [x] Task 4: Testes unitários (AC: #12)
  - [x] 4.1 Criar `__tests__/unit/lib/utils/relevance-classifier.test.ts`
  - [x] 4.2 Testar: post relevante → `{ isRelevant: true, reasoning: "..." }`
  - [x] 4.3 Testar: post não relevante → `{ isRelevant: false, reasoning: "..." }`
  - [x] 4.4 Testar: fallback KB não configurado → todos relevantes sem chamar OpenAI
  - [x] 4.5 Testar: fallback OpenAI key ausente → todos relevantes sem chamar OpenAI
  - [x] 4.6 Testar: fallback erro OpenAI (timeout, network error) → fail-open
  - [x] 4.7 Testar: JSON malformado retornado pela OpenAI → fail-open
  - [x] 4.8 Testar: interpolação de variáveis no template
  - [x] 4.9 Testar: loadPromptTemplate fallback chain (tenant → global → code default)
  - [x] 4.10 Atualizar `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` — cenários com filtro de relevância
  - [x] 4.11 Testar: posts filtrados não são inseridos em lead_insights
  - [x] 4.12 Testar: posts relevantes incluem relevance_reasoning
  - [x] 4.13 Testar: MonitoringBatchResult inclui postsFiltered count
  - [x] 4.14 Verificar que testes existentes de 13.3 continuam passando

## Dev Notes

### Decisão Arquitetural: Classificação Inline no process-batch

**Opção escolhida:** Filtrar ANTES da inserção em `lead_insights`. O epic diz explicitamente "If not relevant: post discarded (no insight stored)".

**Nota:** A story 13.3 inseriu um comentário "(pipeline 13.4 processará depois)" — isso significava que 13.4 adicionaria a lógica de filtragem inline, NÃO que seria um pipeline separado.

**Fluxo atualizado:**
```
processLead:
1. Fetch LinkedIn posts via Apify (existente)
2. Detect new posts (existente)
3. Update linkedin_posts_cache (existente)
4. Para cada novo post:
   a. classifyPostRelevance() → { isRelevant, reasoning }  ← NOVO
   b. Se relevante: acumular para inserção com relevance_reasoning
   c. Se não relevante: descartar (contabilizar em postsFiltered)
5. Insert apenas posts relevantes em lead_insights
6. Log usage (existente + log classificação)
```

### PromptManager NÃO Pode Ser Usado no Cron Context

**Problema:** `PromptManager` importa `createClient` de `@/lib/supabase/server` que depende de cookies do request. No cron, não há cookies.

**Solução:** Implementar busca de prompt direta com o service-role client já disponível em `process-batch`:

```typescript
async function loadPromptTemplate(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<{ template: string; metadata: AIPromptMetadata }> {
  // Level 1: Tenant-specific
  const { data: tenantPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, metadata")
    .eq("prompt_key", "monitoring_relevance_filter")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (tenantPrompt) {
    return { template: tenantPrompt.prompt_template, metadata: tenantPrompt.metadata };
  }

  // Level 2: Global
  const { data: globalPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, metadata")
    .eq("prompt_key", "monitoring_relevance_filter")
    .is("tenant_id", null)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (globalPrompt) {
    return { template: globalPrompt.prompt_template, metadata: globalPrompt.metadata };
  }

  // Level 3: Code default
  const codeDefault = CODE_DEFAULT_PROMPTS["monitoring_relevance_filter"];
  return { template: codeDefault.template, metadata: codeDefault.metadata ?? {} };
}
```

### Prompt Template — monitoring_relevance_filter

```
Você é um analista especializado em avaliar se posts do LinkedIn são relevantes para uma empresa B2B.

CONTEXTO DA EMPRESA:
{{company_context}}

PRODUTOS/SERVIÇOS:
{{products_services}}

DIFERENCIAIS COMPETITIVOS:
{{competitive_advantages}}

PÚBLICO-ALVO (ICP):
{{icp_summary}}

POST LINKEDIN A ANALISAR:
{{post_text}}

TAREFA:
Determine se este post indica uma oportunidade de abordagem comercial.
Um post é RELEVANTE se:
- Menciona dores, desafios ou necessidades que os produtos/serviços da empresa resolvem
- Discute temas, tendências ou tecnologias do setor-alvo da empresa
- Indica mudanças (novo cargo, novo projeto, expansão) que podem gerar oportunidade
- Demonstra interesse em tópicos diretamente relacionados à proposta de valor

Um post é NÃO RELEVANTE se:
- É conteúdo genérico sem conexão com o negócio (memes, motivacional sem contexto)
- Aborda temas completamente fora do setor-alvo
- É repost/compartilhamento sem opinião própria relevante

Responda EXCLUSIVAMENTE com JSON válido (sem markdown, sem explicação):
{"isRelevant": true/false, "reasoning": "Justificativa em 1 frase"}
```

**Configuração:**
- `modelPreference`: `"gpt-4o-mini"` — custo ~$0.00015/classificação (150 input tokens + 50 output)
- `temperature`: `0.3` — determinístico para classificação binária
- `maxTokens`: `200` — resposta curta (JSON)

### Knowledge Base Context para Classificação

**Arquivo:** `src/lib/utils/relevance-classifier.ts`

Tipo simplificado para o contexto necessário:

```typescript
export interface KBContextForClassification {
  companyContext: string;
  productsServices: string;
  competitiveAdvantages: string;
  icpSummary: string;
}
```

**Carregamento no cron context (service-role, sem cookies):**

```typescript
async function loadKBContext(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<KBContextForClassification | null> {
  // Buscar company profile
  const { data: company } = await supabase
    .from("company_profiles")
    .select("description, products_services, competitive_advantages")
    .eq("tenant_id", tenantId)
    .single();

  if (!company || !company.description) return null; // KB não configurado

  // Buscar ICP
  const { data: icp } = await supabase
    .from("icp_definitions")
    .select("summary")
    .eq("tenant_id", tenantId)
    .single();

  return {
    companyContext: company.description || "",
    productsServices: company.products_services || "",
    competitiveAdvantages: company.competitive_advantages || "",
    icpSummary: icp?.summary || "",
  };
}
```

### Chamada OpenAI — Sem SDK Provider, Usar fetch Direto

**Problema:** `OpenAIProvider` importa o SDK `openai` que pode não estar disponível no contexto da API Route como dependência. Além disso, a classe provider requer configuração de streaming, retry, etc. que são overengineering para uma classificação simples.

**Solução:** Usar `fetch` direto para a API do OpenAI — consistente com o padrão de serviços externos no cron:

```typescript
async function callOpenAI(
  apiKey: string,
  prompt: string,
  model: string = "gpt-4o-mini",
  temperature: number = 0.3,
  maxTokens: number = 200
): Promise<{ text: string; tokensUsed: number }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(15000), // 15s timeout
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}
```

**NOTA:** Usar `response_format: { type: "json_object" }` força a OpenAI a retornar JSON válido — elimina parsing errors.

**ALTERNATIVA:** Se o projeto já usa `OpenAIProvider` extensivamente e está disponível, pode-se usar `createAIProvider("openai", apiKey)` do `src/lib/ai/create-provider.ts`. Verificar imports antes de decidir.

### Obtenção da OpenAI API Key — Mesmo Padrão de getApifyKey

```typescript
async function getOpenAIKey(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("api_configs")
    .select("encrypted_key")
    .eq("tenant_id", tenantId)
    .eq("service_name", "openai")
    .single();

  if (error || !data) return null;

  try {
    return decryptApiKey(data.encrypted_key);
  } catch {
    return null;
  }
}
```

### Interpolação de Template — Função Pura

```typescript
export function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}
```

**NOTA:** NÃO suportar `{{#if}}` — o prompt de relevância não precisa de condicionais. Keep it simple.

### Parsing de Resposta — Com Fallback

```typescript
export interface RelevanceClassification {
  isRelevant: boolean;
  reasoning: string;
}

export function parseClassificationResponse(text: string): RelevanceClassification {
  try {
    const parsed = JSON.parse(text.trim());
    if (typeof parsed.isRelevant !== "boolean") {
      return { isRelevant: true, reasoning: "Resposta AI sem campo isRelevant — fail-open" };
    }
    return {
      isRelevant: parsed.isRelevant,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return { isRelevant: true, reasoning: "JSON inválido retornado — fail-open" };
  }
}
```

### Estimativa de Custo

```typescript
// gpt-4o-mini pricing: $0.15/1M input tokens, $0.60/1M output tokens
// Prompt ~300 tokens input, ~50 tokens output
// Cost per classification: ~$0.000075
// 100 leads × 3 posts avg × $0.000075 = ~$0.0225/semana
// Muito abaixo do budget de $0.50/semana
export function calculateClassificationCost(tokensUsed: number): number {
  // Aproximação: 75% input, 25% output
  const inputTokens = Math.round(tokensUsed * 0.75);
  const outputTokens = tokensUsed - inputTokens;
  return (inputTokens * 0.15 + outputTokens * 0.6) / 1_000_000;
}
```

### Atualização do MonitoringBatchResult

Adicionar `postsFiltered` ao tipo existente em `src/lib/utils/monitoring-utils.ts`:

```typescript
export interface MonitoringBatchResult {
  status: string;
  leadsProcessed: number;
  newPostsFound: number;
  postsFiltered: number;  // NOVO — posts descartados pelo filtro de relevância
  cursor: string | null;
  errors: Array<{ leadId: string; error: string }>;
}
```

### Modificação do processLead — Antes/Depois

**ANTES (13.3):**
```typescript
// Insert insights for new posts (AC #10)
if (newPosts.length > 0) {
  const insights = newPosts.map((post) => ({
    tenant_id: tenantId,
    lead_id: lead.id,
    post_url: post.postUrl,
    post_text: post.text,
    post_published_at: post.publishedAt || null,
    status: "new" as const,
  }));
  await supabase.from("lead_insights").insert(insights);
}
```

**DEPOIS (13.4):**
```typescript
// Classify new posts for relevance (Story 13.4)
let postsFiltered = 0;
if (newPosts.length > 0) {
  const relevantInsights: Array<{
    tenant_id: string;
    lead_id: string;
    post_url: string;
    post_text: string;
    post_published_at: string | null;
    relevance_reasoning: string;
    status: "new";
  }> = [];

  for (const post of newPosts) {
    const classification = await classifyPostRelevance(
      post.text,
      post.postUrl,
      kbContext,
      openaiKey,
      supabase,
      tenantId
    );

    if (classification.isRelevant) {
      relevantInsights.push({
        tenant_id: tenantId,
        lead_id: lead.id,
        post_url: post.postUrl,
        post_text: post.text,
        post_published_at: post.publishedAt || null,
        relevance_reasoning: classification.reasoning,
        status: "new" as const,
      });
    } else {
      postsFiltered++;
    }
  }

  if (relevantInsights.length > 0) {
    await supabase.from("lead_insights").insert(relevantInsights);
  }
}
```

### Padrão de Testes — Seguir Exatamente

**Framework:** Vitest. **ESLint:** no-console.

**Testes de relevance-classifier (unit):**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyPostRelevance,
  parseClassificationResponse,
  interpolateTemplate,
  calculateClassificationCost,
} from "@/lib/utils/relevance-classifier";

describe("parseClassificationResponse", () => {
  it("retorna classificação de JSON válido relevante", () => { ... });
  it("retorna classificação de JSON válido não relevante", () => { ... });
  it("retorna fail-open para JSON inválido", () => { ... });
  it("retorna fail-open se isRelevant não é boolean", () => { ... });
  it("retorna reasoning vazio se reasoning não é string", () => { ... });
});

describe("interpolateTemplate", () => {
  it("substitui variáveis simples", () => { ... });
  it("mantém placeholder se variável não encontrada", () => { ... });
  it("substitui múltiplas ocorrências", () => { ... });
});

describe("classifyPostRelevance", () => {
  it("retorna relevante quando KB não configurado (fallback)", () => { ... });
  it("retorna relevante quando OpenAI key ausente (fallback)", () => { ... });
  it("retorna relevante quando OpenAI falha (fail-open)", () => { ... });
  it("chama OpenAI e retorna classificação quando tudo disponível", () => { ... });
  it("loga custo de classificação em api_usage_logs", () => { ... });
});
```

**Mock de fetch para OpenAI:**
```typescript
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock success
mockFetch.mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    choices: [{ message: { content: '{"isRelevant": true, "reasoning": "Relevante"}' } }],
    usage: { total_tokens: 200 },
  }),
});

// Mock error
mockFetch.mockResolvedValue({ ok: false, status: 429 });
```

**Testes do process-batch atualizado:**
```typescript
// Adicionar ao arquivo existente
describe("POST /api/monitoring/process-batch - relevance filter", () => {
  it("filtra posts não relevantes — não insere em lead_insights", () => { ... });
  it("insere posts relevantes com relevance_reasoning", () => { ... });
  it("retorna postsFiltered no resultado do batch", () => { ... });
  it("fallback: sem KB → todos posts inseridos como relevantes", () => { ... });
  it("fallback: sem OpenAI key → todos posts inseridos como relevantes", () => { ... });
});
```

### Imports Existentes Reutilizados

| Import | De | Para |
|--------|----|------|
| `decryptApiKey` | `src/lib/crypto/encryption.ts` | Descriptografar OpenAI key do tenant |
| `CODE_DEFAULT_PROMPTS` | `src/lib/ai/prompts/defaults.ts` | Fallback level 3 do prompt |
| `calculateApifyCost` | `src/types/api-usage.ts` | Custo Apify (existente) |
| `LogApiUsageParams` | `src/types/api-usage.ts` | Tipo de logging |
| `MonitoringBatchResult` | `src/lib/utils/monitoring-utils.ts` | Tipo de resultado (atualizar) |
| `AIPromptMetadata` | `src/types/ai-prompt.ts` | Metadata do prompt |

### Project Structure Notes

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| CRIAR | `src/lib/utils/relevance-classifier.ts` | Classificação de relevância por IA — funções puras + chamada OpenAI |
| CRIAR | `__tests__/unit/lib/utils/relevance-classifier.test.ts` | Testes unitários do classificador |
| EDITAR | `src/types/ai-prompt.ts` | Adicionar `"monitoring_relevance_filter"` ao PromptKey, PROMPT_KEYS, promptKeySchema |
| EDITAR | `src/lib/ai/prompts/defaults.ts` | Adicionar code default prompt para `monitoring_relevance_filter` |
| EDITAR | `src/app/api/monitoring/process-batch/route.ts` | Integrar filtro de relevância, getOpenAIKey, loadKBContext |
| EDITAR | `src/lib/utils/monitoring-utils.ts` | Adicionar `postsFiltered` ao MonitoringBatchResult |
| EDITAR | `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` | Testes para filtro de relevância na route |
| EDITAR | `__tests__/unit/lib/utils/monitoring-utils.test.ts` | Atualizar MonitoringBatchResult mock se necessário |

### Guardrails — O Que NÃO Fazer

- **NÃO usar `PromptManager`** — usa `createClient` de `@/lib/supabase/server` (cookies). No cron, usar query direta com service-role client
- **NÃO implementar geração de sugestão** — story 13.5 fará isso
- **NÃO criar UI de insights** — story 13.6 fará isso
- **NÃO modificar schema de `lead_insights`** — colunas `relevance_reasoning` e `suggestion` já existem
- **NÃO modificar `ApifyService`** — reutilizar tal qual
- **NÃO modificar `OpenAIProvider` class** — usar fetch direto (mais simples para cron)
- **NÃO usar streaming** — classificação retorna resposta curta, streaming é overhead
- **NÃO processar posts em paralelo** — processar sequencialmente para controlar rate limits
- **NÃO alterar lógica de batch/cursor** — manter máquina de estados de 13.3 intacta
- **NÃO usar `space-y-*`** — story é backend-only, mas se houver qualquer UI, usar `flex flex-col gap-*`
- **NÃO adicionar nova migration** — todas as colunas necessárias já existem no schema

### Previous Story Intelligence (Story 13.3)

**Learnings da 13.3:**
- `processLead()` usa `ApifyService` instanciado UMA vez no POST handler (fix do code review)
- `logMonitoringUsage()` é helper local que usa service-role client (não `@/lib/services/usage-logger`)
- `getApifyKey()` é helper local — seguir mesmo padrão para `getOpenAIKey()`
- `MONITORING_CRON_SECRET` lido em request-time (não module-level) para testabilidade
- Testes mockam `ApifyService` como classe, `decryptApiKey` e `fetch` como vi.fn()
- Mock de Supabase usa padrão centralizado de `__tests__/helpers/mock-supabase.ts`
- Total antes desta story: **260 arquivos, 4758 testes, 0 falhas**

**Learnings da 13.2:**
- `createMockLead()` já tem `isMonitored: false` — usar em testes
- `linkedin_posts_cache` é JSONB no banco, tipo `LinkedInPostsCache | null`

**Learnings da 13.1:**
- Migration 00043 criou `lead_insights` com `relevance_reasoning TEXT` — JÁ EXISTE
- Tipos em `src/types/monitoring.ts` incluem `relevanceReasoning: string | null`
- `transformLeadInsightRow()` já mapeia `relevance_reasoning` → `relevanceReasoning`

### Git Intelligence

Último commit: `64a65f0 feat(story-13.3): edge function de verificação semanal + code review fixes`
Branch: `epic/12-melhorias-ux-produtividade`
Padrão de commit: `feat(story-13.4): filtro de relevância por IA`

### Edge Cases a Tratar

1. **Post com texto vazio/muito curto:** Classificar como não relevante (nada a analisar)
2. **Post muito longo (>4000 chars):** Truncar para evitar exceder token limit do modelo
3. **Multiple posts no mesmo batch:** Processar sequencialmente (não em paralelo) para evitar rate limit OpenAI
4. **OpenAI retorna JSON com campos extras:** Ignorar campos extras, extrair apenas `isRelevant` e `reasoning`
5. **OpenAI retorna resposta com markdown wrapping (```json):** Limpar antes de parsear
6. **KB parcialmente configurado (company sem products):** Usar o que tiver, enviar campos vazios para variáveis faltantes
7. **Timeout OpenAI (15s):** AbortSignal.timeout → catch → fail-open (post marcado como relevante)
8. **Rate limit OpenAI (429):** fail-open (post marcado como relevante), não retry (cron processará novamente)

### References

- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.4] — AC originais
- [Source: _bmad-output/implementation-artifacts/13-3-edge-function-de-verificacao-semanal.md] — Story anterior e padrões
- [Source: _bmad-output/implementation-artifacts/13-2-toggle-de-monitoramento-na-tabela-de-leads.md] — Toggle e validações
- [Source: _bmad-output/implementation-artifacts/13-1-schema-de-monitoramento-e-tipos.md] — Schema e tipos base
- [Source: src/types/ai-prompt.ts] — PromptKey enum e schemas Zod
- [Source: src/lib/ai/prompts/defaults.ts] — Padrão de code default prompts
- [Source: src/lib/ai/prompt-manager.ts] — PromptManager (NÃO usar no cron, referência apenas)
- [Source: src/lib/services/knowledge-base-context.ts] — KnowledgeBaseContext e AIContextVariables
- [Source: src/app/api/monitoring/process-batch/route.ts] — Route onde filtro será integrado
- [Source: src/lib/utils/monitoring-utils.ts] — MonitoringBatchResult (atualizar)
- [Source: src/types/monitoring.ts] — LeadInsight com relevanceReasoning
- [Source: src/lib/crypto/encryption.ts] — decryptApiKey para OpenAI key
- [Source: supabase/migrations/00043_add_lead_monitoring_schema.sql] — Schema lead_insights com relevance_reasoning

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum debug necessário — todos os testes passaram na primeira execução.

### Completion Notes List

- Task 1: `monitoring_relevance_filter` adicionado ao `PromptKey`, `PROMPT_KEYS`, `promptKeySchema`. Prompt default com `gpt-4o-mini`, `temperature: 0.3`, `maxTokens: 200`. Testes existentes atualizados (10→11 keys).
- Task 2: `relevance-classifier.ts` criado com funções puras (`parseClassificationResponse`, `interpolateTemplate`, `calculateClassificationCost`) + `classifyPostRelevance` com fallbacks (KB null, OpenAI key null, OpenAI error → fail-open). Prompt loading 3-level (tenant → global → code default) sem PromptManager. `callOpenAI` via fetch direto com `response_format: json_object` e timeout 15s. Edge cases: post vazio/curto (não relevante), post longo (truncado 4000 chars), markdown wrapping no JSON.
- Task 3: `processLead` recebe `openaiKey` e `kbContext`. Filtro de relevância ANTES da inserção em `lead_insights`. Posts relevantes incluem `relevance_reasoning`. Posts não relevantes descartados. `postsFiltered` adicionado ao `MonitoringBatchResult`. Helpers `getOpenAIKey` e `loadKBContext` no cron context (service-role client). Custo de classificação logado em `api_usage_logs` (service_name='openai', request_type='monitoring_relevance_filter').
- Task 4: 26 testes unitários para `relevance-classifier.ts` (parsing, interpolação, custos, fallbacks, integração OpenAI, prompt tenant). 5 testes adicionados ao `route.test.ts` (filtro posts, relevance_reasoning, postsFiltered, fallback sem KB, fallback sem OpenAI key). 14 testes existentes do 13.3 continuam passando. Total: 261 arquivos, 4789 testes, 0 falhas.

### File List

| Ação | Arquivo |
|------|---------|
| CRIAR | `src/lib/utils/relevance-classifier.ts` |
| CRIAR | `__tests__/unit/lib/utils/relevance-classifier.test.ts` |
| EDITAR | `src/types/ai-prompt.ts` |
| EDITAR | `src/lib/ai/prompts/defaults.ts` |
| EDITAR | `src/app/api/monitoring/process-batch/route.ts` |
| EDITAR | `src/lib/utils/monitoring-utils.ts` |
| EDITAR | `__tests__/unit/types/ai-prompt.test.ts` |
| EDITAR | `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` |

### Change Log

- 2026-02-28: Story 13.4 implementada — filtro de relevância por IA com classificação inline no process-batch, 31 novos testes
- 2026-02-28: Code review — 7 findings (1H, 3M, 3L) all fixed. H1: accurate token cost (promptTokens/completionTokens). M1: newPostsFound semantics restored. M2: OpenAI key test now verifies null. M3: DRY getApiKey. L1-L3: test desc, post_url template, response validation. +1 test (56 total). 261 files, 4790 total.
