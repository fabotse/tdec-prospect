# Story 13.5: Geração de Sugestão de Abordagem

Status: done

## Story

As a sistema de monitoramento,
I want gerar automaticamente uma sugestão de abordagem contextualizada quando um post relevante é detectado,
so that o Marco tenha munição pronta para agir rapidamente sobre oportunidades identificadas.

## Acceptance Criteria

1. Novo `PromptKey` `"monitoring_approach_suggestion"` adicionado ao enum em `ai-prompt.ts` e ao array `PROMPT_KEYS` e schema Zod `promptKeySchema`
2. Prompt default adicionado em `defaults.ts` — recebe contexto do post, dados do lead, Knowledge Base (produtos/serviços, tom de voz)
3. Gera sugestão contextual que conecta o post com o produto/serviço do usuário
4. Sugestão é DIFERENTE do Icebreaker — foco em oportunidade temporal ("vi que você postou sobre X, isso conecta com Y"), NÃO apresentação fria
5. Insight salvo na tabela `lead_insights` com: post_url, post_text, post_published_at, relevance_reasoning, suggestion, status='new'
6. Se geração da sugestão falhar, salva insight SEM sugestão (suggestion=null) — melhor ter o post que perder tudo
7. Logging de custo na `api_usage_logs` com `service_name='openai'`, `request_type='monitoring_approach_suggestion'`
8. Testes unitários para geração e persistência

## Tasks / Subtasks

- [x] Task 1: Adicionar PromptKey e prompt default (AC: #1, #2)
  - [x] 1.1 Adicionar `"monitoring_approach_suggestion"` ao type `PromptKey` em `src/types/ai-prompt.ts`
  - [x] 1.2 Adicionar ao array `PROMPT_KEYS` em `src/types/ai-prompt.ts`
  - [x] 1.3 Adicionar ao schema `promptKeySchema` (z.enum) em `src/types/ai-prompt.ts`
  - [x] 1.4 Adicionar prompt default em `src/lib/ai/prompts/defaults.ts` com `modelPreference: "gpt-4o-mini"`, `temperature: 0.7`, `maxTokens: 500`
  - [x] 1.5 Atualizar testes existentes de `ai-prompt` se houver validação de exhaustividade do enum (atualmente 11→12 keys)

- [x] Task 2: Criar utilitário de geração de sugestão (AC: #3, #4, #6)
  - [x] 2.1 Criar `src/lib/utils/approach-suggestion.ts`
  - [x] 2.2 Interface `LeadContextForSuggestion` para dados do lead necessários no prompt
  - [x] 2.3 Interface `KBContextForSuggestion` estendendo `KBContextForClassification` com campos de tom de voz
  - [x] 2.4 Função `generateApproachSuggestion(postText, postUrl, leadContext, kbContext, openaiKey, supabase, tenantId)` → `SuggestionResult`
  - [x] 2.5 Helper `loadSuggestionPromptTemplate(supabase, tenantId)` — mesmo padrão de 3-level fallback (tenant → global → code default)
  - [x] 2.6 Helper `callOpenAIForSuggestion(apiKey, prompt, model, temperature, maxTokens)` — mesma implementação de `callOpenAI` do relevance-classifier (duplicar, NÃO importar — função privada)
  - [x] 2.7 Fallback: se geração falhar (timeout, rate limit, erro) → retornar `{ suggestion: null, error: "..." }` (NÃO fail-open — salvar insight sem sugestão)
  - [x] 2.8 Interface `SuggestionResult` com `suggestion: string | null`, `promptTokens`, `completionTokens`, `error?: string`

- [x] Task 3: Integrar geração no process-batch (AC: #5, #7)
  - [x] 3.1 Expandir query de leads em `POST handler` para incluir `first_name, last_name, title, company_name, industry`
  - [x] 3.2 Atualizar tipo do parâmetro `lead` em `processLead()` para incluir campos extras
  - [x] 3.3 Adicionar helper `loadToneContext(supabase, tenantId)` para carregar tom de voz no cron context
  - [x] 3.4 Carregar tom de voz UMA vez no POST handler (junto com openaiKey e kbContext)
  - [x] 3.5 Após classificação relevante: chamar `generateApproachSuggestion()`
  - [x] 3.6 Incluir `suggestion` no objeto de insight antes do insert (pode ser null se geração falhou)
  - [x] 3.7 Logar custo de geração em `api_usage_logs` (service_name='openai', request_type='monitoring_approach_suggestion')
  - [x] 3.8 Atualizar `MonitoringBatchResult` para incluir `suggestionsGenerated: number`

- [x] Task 4: Testes unitários (AC: #8)
  - [x] 4.1 Criar `__tests__/unit/lib/utils/approach-suggestion.test.ts`
  - [x] 4.2 Testar: geração bem-sucedida retorna sugestão
  - [x] 4.3 Testar: erro OpenAI retorna suggestion=null (NÃO fail-open)
  - [x] 4.4 Testar: timeout OpenAI retorna suggestion=null
  - [x] 4.5 Testar: interpolação de variáveis no template (lead data + KB context + tone)
  - [x] 4.6 Testar: loadSuggestionPromptTemplate 3-level fallback
  - [x] 4.7 Atualizar `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` — cenários com geração de sugestão
  - [x] 4.8 Testar: insight salvo com suggestion preenchido quando geração OK
  - [x] 4.9 Testar: insight salvo com suggestion=null quando geração falha
  - [x] 4.10 Testar: MonitoringBatchResult inclui suggestionsGenerated
  - [x] 4.11 Testar: custo de geração logado em api_usage_logs
  - [x] 4.12 Verificar que testes existentes de 13.3 e 13.4 continuam passando
  - [x] 4.13 Atualizar `__tests__/unit/types/ai-prompt.test.ts` para 12 keys (se houver exhaustividade)

## Dev Notes

### Decisão Arquitetural: Geração Inline Após Classificação

**Fluxo atualizado do processLead (após 13.5):**
```
processLead:
1. Fetch LinkedIn posts via Apify (existente 13.3)
2. Detect new posts (existente 13.3)
3. Update linkedin_posts_cache (existente 13.3)
4. Para cada novo post:
   a. classifyPostRelevance() → { isRelevant, reasoning }  (13.4)
   b. Se NÃO relevante: descartar (contabilizar em postsFiltered)
   c. Se relevante:
      i.  generateApproachSuggestion() → { suggestion, tokens }  ← NOVO (13.5)
      ii. Acumular insight com relevance_reasoning + suggestion
   d. Log classification cost (13.4)
   e. Log suggestion cost se gerou ← NOVO (13.5)
5. Insert insights relevantes em lead_insights (com suggestion)
6. Log Apify usage (existente 13.3)
```

**Diferença da classificação (13.4):** O classificador é fail-open (erro → relevante). A geração de sugestão NÃO é fail-open — se falhar, o insight é salvo SEM sugestão (suggestion=null). Isso porque perder um insight é pior que não ter sugestão.

### Prompt Template — monitoring_approach_suggestion

```
Você é um consultor de vendas B2B especializado em abordagens contextuais baseadas em atividade no LinkedIn.

CONTEXTO DA EMPRESA REMETENTE:
{{company_context}}

PRODUTOS/SERVIÇOS:
{{products_services}}

DIFERENCIAIS COMPETITIVOS:
{{competitive_advantages}}

PÚBLICO-ALVO (ICP):
{{icp_summary}}

TOM DE VOZ:
{{tone_description}}
Estilo: {{tone_style}}

DADOS DO LEAD:
- Nome: {{lead_name}}
- Cargo: {{lead_title}}
- Empresa: {{lead_company}}
- Setor: {{lead_industry}}

POST DO LINKEDIN QUE GEROU A OPORTUNIDADE:
{{post_text}}

TAREFA:
Gere uma SUGESTÃO DE ABORDAGEM curta e contextualizada para este lead, baseada no post acima.

A sugestão deve:
- Conectar o TEMA do post com o PRODUTO/SERVIÇO da empresa remetente
- Focar na OPORTUNIDADE TEMPORAL (o lead acabou de demonstrar interesse/necessidade)
- Ser diferente de um Ice Breaker frio — o tom é de quem percebeu uma oportunidade real
- Incluir uma sugestão concreta de como iniciar a conversa (WhatsApp ou email)
- Considerar o cargo e setor do lead para calibrar a abordagem
- Seguir o tom de voz configurado ({{tone_style}})

A sugestão NÃO deve:
- Ser genérica ("entre em contato com o lead")
- Repetir o conteúdo do post sem conectar ao produto
- Usar linguagem de template ("Prezado [nome]")
- Ser longa demais — máximo 3-4 frases objetivas

FORMATO:
Responda APENAS com a sugestão de abordagem, sem explicações ou formatação extra.
Máximo 150 palavras.
```

**Configuração:**
- `modelPreference`: `"gpt-4o-mini"` — custo-efetivo para geração curta
- `temperature`: `0.7` — mais criativo que classificação, mas controlado
- `maxTokens`: `500` — margem para sugestão de ~150 palavras

### Diferença do Icebreaker

| Aspecto | Icebreaker | Sugestão de Abordagem |
|---------|-----------|----------------------|
| **Propósito** | Abertura de email frio | Guia de ação para oportunidade quente |
| **Gatilho** | Enriquecimento manual | Monitoramento automatizado |
| **Foco** | Personalização genérica | Oportunidade temporal específica |
| **Tom** | "Vi algo sobre você" | "Acabou de surgir uma oportunidade" |
| **Uso** | Variável {{ice_breaker}} no email | Texto na página de insights |
| **Prompt key** | `icebreaker_premium_generation` | `monitoring_approach_suggestion` |

### Expansão da Query de Leads

**ANTES (13.4):**
```typescript
.select("id, linkedin_url, linkedin_posts_cache, tenant_id")
```

**DEPOIS (13.5):**
```typescript
.select("id, linkedin_url, linkedin_posts_cache, tenant_id, first_name, last_name, title, company_name, industry")
```

**Tipo expandido do parâmetro lead em processLead:**
```typescript
lead: {
  id: string;
  linkedin_url: string | null;
  linkedin_posts_cache: LinkedInPostsCache | null;
  // NOVO: dados do lead para prompt de sugestão
  first_name: string;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  industry: string | null;
}
```

### Interface LeadContextForSuggestion

**Arquivo:** `src/lib/utils/approach-suggestion.ts`

```typescript
export interface LeadContextForSuggestion {
  leadName: string;      // first_name + last_name
  leadTitle: string;     // title || ""
  leadCompany: string;   // company_name || ""
  leadIndustry: string;  // industry || ""
}
```

### Interface KBContextForSuggestion

Estende o contexto de classificação com dados de tom de voz:

```typescript
export interface KBContextForSuggestion extends KBContextForClassification {
  toneDescription: string;
  toneStyle: string;
}
```

**Nota:** Importar `KBContextForClassification` de `@/lib/utils/relevance-classifier`.

### Carregamento de Tom de Voz no Cron Context

**Helper em `process-batch/route.ts`:**

```typescript
interface ToneContext {
  toneDescription: string;
  toneStyle: string;
}

async function loadToneContext(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<ToneContext> {
  const { data: tone } = await supabase
    .from("tone_of_voice")
    .select("preset, description, writing_guidelines")
    .eq("tenant_id", tenantId)
    .single();

  if (!tone) {
    return { toneDescription: "", toneStyle: "casual" };
  }

  const parts: string[] = [];
  if (tone.preset) parts.push(`Estilo: ${tone.preset}`);
  if (tone.description) parts.push(tone.description);
  if (tone.writing_guidelines) parts.push(`Diretrizes: ${tone.writing_guidelines}`);

  return {
    toneDescription: parts.join(". ") || "",
    toneStyle: tone.preset || "casual",
  };
}
```

### SuggestionResult — Interface de Retorno

```typescript
export interface SuggestionResult {
  suggestion: string | null;
  promptTokens: number;
  completionTokens: number;
  error?: string;
}
```

**Nota:** `suggestion` é `null` quando geração falha — diferente do classificador que é fail-open.

### Integração no processLead — Código Esperado

**Após a classificação (dentro do `for...of newPosts`):**
```typescript
if (classification.isRelevant) {
  // Generate approach suggestion (Story 13.5)
  let suggestion: string | null = null;
  let suggestionTokens = { promptTokens: 0, completionTokens: 0 };

  const leadContext: LeadContextForSuggestion = {
    leadName: `${lead.first_name}${lead.last_name ? ` ${lead.last_name}` : ""}`,
    leadTitle: lead.title || "",
    leadCompany: lead.company_name || "",
    leadIndustry: lead.industry || "",
  };

  const suggestionKBContext: KBContextForSuggestion = {
    ...kbContext!,  // KB is guaranteed non-null (relevance check passed)
    toneDescription: toneContext.toneDescription,
    toneStyle: toneContext.toneStyle,
  };

  const suggestionResult = await generateApproachSuggestion(
    post.text,
    post.postUrl,
    leadContext,
    suggestionKBContext,
    openaiKey,  // Already guaranteed non-null (relevance check passed)
    supabase,
    tenantId
  );

  suggestion = suggestionResult.suggestion;
  suggestionTokens = {
    promptTokens: suggestionResult.promptTokens,
    completionTokens: suggestionResult.completionTokens,
  };

  // Log suggestion cost (AC #7)
  if (suggestionTokens.promptTokens > 0 || suggestionTokens.completionTokens > 0) {
    await logMonitoringUsage(supabase, {
      tenantId,
      serviceName: "openai",
      requestType: "monitoring_approach_suggestion",
      leadId: lead.id,
      estimatedCost: calculateSuggestionCost(
        suggestionTokens.promptTokens,
        suggestionTokens.completionTokens
      ),
      status: "success",
      metadata: {
        source: "monitoring",
        postUrl: post.postUrl,
        hasSuggestion: suggestion !== null,
      },
    });
  }

  relevantInsights.push({
    tenant_id: tenantId,
    lead_id: lead.id,
    post_url: post.postUrl,
    post_text: post.text,
    post_published_at: post.publishedAt || null,
    relevance_reasoning: classification.reasoning,
    suggestion,  // ← NOVO: pode ser string ou null
    status: "new" as const,
  });

  if (suggestion) suggestionsGenerated++;
}
```

**Nota importante:** Quando a classificação passa (isRelevant=true) sem chamar OpenAI (fallback KB null ou OpenAI key null), NÃO temos openaiKey/kbContext. Nesse caso, NÃO devemos tentar gerar sugestão:
```typescript
// Só gera sugestão se temos openaiKey E kbContext (classificação usou AI)
if (openaiKey && kbContext) {
  // ... gerar sugestão
}
```

### Estimativa de Custo — Geração de Sugestão

```typescript
// gpt-4o-mini: $0.15/1M input, $0.60/1M output
// Prompt ~500 tokens input, ~200 tokens output
// Cost per suggestion: ~$0.000195
// 100 leads × 1 relevant post avg × $0.000195 = ~$0.0195/semana
// Total com classificação: ~$0.04/semana — bem abaixo de $0.50/semana
export function calculateSuggestionCost(
  promptTokens: number,
  completionTokens: number
): number {
  return (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000;
}
```

### Atualização do MonitoringBatchResult

Adicionar `suggestionsGenerated` ao tipo existente em `src/lib/utils/monitoring-utils.ts`:

```typescript
export interface MonitoringBatchResult {
  status: string;
  leadsProcessed: number;
  newPostsFound: number;
  postsFiltered: number;
  suggestionsGenerated: number;  // NOVO — sugestões geradas com sucesso
  cursor: string | null;
  errors: Array<{ leadId: string; error: string }>;
}
```

### Padrão do callOpenAI — Duplicar do Relevance Classifier

```typescript
async function callOpenAI(
  apiKey: string,
  prompt: string,
  model: string = "gpt-4o-mini",
  temperature: number = 0.7,
  maxTokens: number = 500
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30000), // 30s timeout (mais longo que classificação — geração é mais pesada)
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing choices[0].message.content");
  }

  return {
    text: content,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}
```

**Diferenças do classificador:**
- `temperature: 0.7` (vs 0.3) — mais criativo
- `maxTokens: 500` (vs 200) — sugestão mais longa
- Timeout: `30000ms` (vs 15000ms) — geração mais pesada
- SEM `response_format: { type: "json_object" }` — retorno é texto livre, não JSON

### Prompt Loading — Mesmo Padrão do Classificador

```typescript
async function loadSuggestionPromptTemplate(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ template: string; modelPreference: string; metadata: AIPromptMetadata }> {
  // Level 1: Tenant-specific
  const { data: tenantPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, model_preference, metadata")
    .eq("prompt_key", "monitoring_approach_suggestion")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (tenantPrompt) {
    return {
      template: tenantPrompt.prompt_template as string,
      modelPreference: (tenantPrompt.model_preference as string) || "gpt-4o-mini",
      metadata: (tenantPrompt.metadata ?? {}) as AIPromptMetadata,
    };
  }

  // Level 2: Global
  const { data: globalPrompt } = await supabase
    .from("ai_prompts")
    .select("prompt_template, model_preference, metadata")
    .eq("prompt_key", "monitoring_approach_suggestion")
    .is("tenant_id", null)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (globalPrompt) {
    return {
      template: globalPrompt.prompt_template as string,
      modelPreference: (globalPrompt.model_preference as string) || "gpt-4o-mini",
      metadata: (globalPrompt.metadata ?? {}) as AIPromptMetadata,
    };
  }

  // Level 3: Code default
  const codeDefault = CODE_DEFAULT_PROMPTS["monitoring_approach_suggestion"];
  return {
    template: codeDefault.template,
    modelPreference: codeDefault.modelPreference || "gpt-4o-mini",
    metadata: codeDefault.metadata ?? {},
  };
}
```

### Função Principal — generateApproachSuggestion

```typescript
export async function generateApproachSuggestion(
  postText: string,
  postUrl: string,
  leadContext: LeadContextForSuggestion,
  kbContext: KBContextForSuggestion,
  openaiKey: string | null,
  supabase: SupabaseClient,
  tenantId: string
): Promise<SuggestionResult> {
  const noTokens = { promptTokens: 0, completionTokens: 0 };

  // No OpenAI key — can't generate
  if (!openaiKey) {
    return { suggestion: null, ...noTokens, error: "OpenAI key não configurada" };
  }

  try {
    const { template, modelPreference, metadata } = await loadSuggestionPromptTemplate(supabase, tenantId);

    // Truncate long posts (max 4000 chars)
    const truncatedText =
      postText.length > 4000 ? postText.substring(0, 4000) + "..." : postText;

    // Interpolate variables (reuse interpolateTemplate from relevance-classifier)
    const prompt = interpolateTemplate(template, {
      company_context: kbContext.companyContext,
      products_services: kbContext.productsServices,
      competitive_advantages: kbContext.competitiveAdvantages,
      icp_summary: kbContext.icpSummary,
      tone_description: kbContext.toneDescription,
      tone_style: kbContext.toneStyle,
      lead_name: leadContext.leadName,
      lead_title: leadContext.leadTitle,
      lead_company: leadContext.leadCompany,
      lead_industry: leadContext.leadIndustry,
      post_text: truncatedText,
      post_url: postUrl,
    });

    const model = modelPreference;
    const temperature = metadata.temperature ?? 0.7;
    const maxTokens = metadata.maxTokens ?? 500;

    const { text, promptTokens, completionTokens } = await callOpenAI(
      openaiKey, prompt, model, temperature, maxTokens
    );

    const suggestion = text.trim();
    if (!suggestion) {
      return { suggestion: null, promptTokens, completionTokens, error: "Sugestão vazia retornada" };
    }

    return { suggestion, promptTokens, completionTokens };
  } catch (error) {
    // Geração falhou — retornar null (NÃO fail-open)
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return { suggestion: null, ...noTokens, error: message };
  }
}
```

### Atualização do Objeto de Insert em lead_insights

**ANTES (13.4):**
```typescript
relevantInsights.push({
  tenant_id: tenantId,
  lead_id: lead.id,
  post_url: post.postUrl,
  post_text: post.text,
  post_published_at: post.publishedAt || null,
  relevance_reasoning: classification.reasoning,
  status: "new" as const,
});
```

**DEPOIS (13.5):**
```typescript
relevantInsights.push({
  tenant_id: tenantId,
  lead_id: lead.id,
  post_url: post.postUrl,
  post_text: post.text,
  post_published_at: post.publishedAt || null,
  relevance_reasoning: classification.reasoning,
  suggestion,  // ← string | null
  status: "new" as const,
});
```

### Padrão de Testes — Seguir Exatamente

**Framework:** Vitest. **ESLint:** no-console.

**Testes de approach-suggestion (unit):**
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateApproachSuggestion,
  calculateSuggestionCost,
} from "@/lib/utils/approach-suggestion";
import type {
  LeadContextForSuggestion,
  KBContextForSuggestion,
} from "@/lib/utils/approach-suggestion";

describe("generateApproachSuggestion", () => {
  it("retorna sugestão quando geração OK", () => { ... });
  it("retorna suggestion=null quando OpenAI key ausente", () => { ... });
  it("retorna suggestion=null quando OpenAI falha (timeout)", () => { ... });
  it("retorna suggestion=null quando OpenAI retorna texto vazio", () => { ... });
  it("retorna suggestion=null quando OpenAI retorna erro HTTP", () => { ... });
  it("interpola variáveis do lead no template", () => { ... });
  it("interpola variáveis de tom de voz no template", () => { ... });
  it("trunca post longo (>4000 chars)", () => { ... });
  it("usa fallback code default quando prompt não encontrado no DB", () => { ... });
});

describe("calculateSuggestionCost", () => {
  it("calcula custo com promptTokens e completionTokens", () => { ... });
  it("retorna 0 para 0 tokens", () => { ... });
});
```

**Mock de fetch para OpenAI:**
```typescript
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock success — texto livre (não JSON)
mockFetch.mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    choices: [{ message: { content: "O post do lead sobre IA em vendas B2B conecta diretamente com nosso produto..." } }],
    usage: { prompt_tokens: 450, completion_tokens: 150 },
  }),
});

// Mock error
mockFetch.mockResolvedValue({ ok: false, status: 429 });
```

**Testes do process-batch atualizado:**
```typescript
describe("POST /api/monitoring/process-batch - suggestion generation", () => {
  it("gera sugestão para posts relevantes e inclui no insight", () => { ... });
  it("salva insight sem sugestão quando geração falha", () => { ... });
  it("retorna suggestionsGenerated no resultado do batch", () => { ... });
  it("não tenta gerar sugestão quando openaiKey é null (fallback)", () => { ... });
  it("não tenta gerar sugestão quando kbContext é null (fallback)", () => { ... });
  it("loga custo de geração em api_usage_logs", () => { ... });
  it("inclui dados do lead na geração (first_name, title, company_name)", () => { ... });
});
```

### Imports no approach-suggestion.ts

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIPromptMetadata } from "@/types/ai-prompt";
import { CODE_DEFAULT_PROMPTS } from "@/lib/ai/prompts/defaults";
import { interpolateTemplate } from "@/lib/utils/relevance-classifier";
import type { KBContextForClassification } from "@/lib/utils/relevance-classifier";
```

**Nota:** `interpolateTemplate` é exportada do relevance-classifier — REUTILIZAR, não duplicar. Apenas `callOpenAI` precisa ser duplicado (função privada).

### Project Structure Notes

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| CRIAR | `src/lib/utils/approach-suggestion.ts` | Geração de sugestão de abordagem — tipos + callOpenAI + loadPrompt + generateApproachSuggestion |
| CRIAR | `__tests__/unit/lib/utils/approach-suggestion.test.ts` | Testes unitários do gerador de sugestão |
| EDITAR | `src/types/ai-prompt.ts` | Adicionar `"monitoring_approach_suggestion"` ao PromptKey, PROMPT_KEYS, promptKeySchema |
| EDITAR | `src/lib/ai/prompts/defaults.ts` | Adicionar code default prompt para `monitoring_approach_suggestion` |
| EDITAR | `src/app/api/monitoring/process-batch/route.ts` | Integrar geração de sugestão, expandir query leads, loadToneContext |
| EDITAR | `src/lib/utils/monitoring-utils.ts` | Adicionar `suggestionsGenerated` ao MonitoringBatchResult |
| EDITAR | `__tests__/unit/types/ai-prompt.test.ts` | Atualizar contagem para 12 keys |
| EDITAR | `__tests__/unit/app/api/monitoring/process-batch/route.test.ts` | Testes para geração de sugestão na route |

### Guardrails — O Que NÃO Fazer

- **NÃO usar `PromptManager`** — usa cookies do request. No cron, usar query direta com service-role client
- **NÃO modificar `relevance-classifier.ts`** — apenas IMPORTAR `interpolateTemplate` e `KBContextForClassification`
- **NÃO criar nova migration** — coluna `suggestion` já existe em `lead_insights` (migration 00043)
- **NÃO modificar `ApifyService`** — reutilizar tal qual
- **NÃO usar streaming** — sugestão é texto curto (~150 palavras)
- **NÃO processar posts em paralelo** — sequencial para controlar rate limits
- **NÃO alterar lógica de batch/cursor** — manter máquina de estados de 13.3 intacta
- **NÃO duplicar `interpolateTemplate`** — importar do relevance-classifier (já exportada)
- **NÃO usar `space-y-*`** — story é backend-only, mas se houver qualquer UI, usar `flex flex-col gap-*`
- **NÃO usar `response_format: json_object`** na chamada OpenAI — retorno é texto livre, não JSON
- **NÃO criar UI de insights** — story 13.6 fará isso
- **NÃO implementar envio WhatsApp** — story 13.7 fará isso
- **NÃO fazer a sugestão fail-open** — diferente da classificação, se falhar salvar insight SEM sugestão

### Previous Story Intelligence (Story 13.4)

**Learnings da 13.4:**
- `classifyPostRelevance()` retorna `ClassificationResult` com `promptTokens`, `completionTokens` (fix do code review — campos separados, não `tokensUsed`)
- `callOpenAI()` usa `response_format: { type: "json_object" }` para classificação — NÃO usar para sugestão (texto livre)
- `interpolateTemplate()` é exportada e reutilizável — usa `{{variable}}` syntax simples
- `parseClassificationResponse()` faz parse JSON — NÃO reutilizar para sugestão (texto livre)
- `loadPromptTemplate()` é privada — duplicar padrão para `loadSuggestionPromptTemplate`
- `calculateClassificationCost()` usa preços corretos de `gpt-4o-mini`: $0.15/1M input, $0.60/1M output
- Mock de Supabase usa padrão centralizado de `__tests__/helpers/mock-supabase.ts`
- `getApiKey()` é DRY helper que aceita `serviceName` como parâmetro (refatorado no code review 13.4)
- Timeout de 15s para classificação — usar 30s para geração (mais tokens)
- Total antes desta story: **261 arquivos, 4790 testes, 0 falhas**

**Learnings da 13.3:**
- `processLead()` usa `ApifyService` instanciado UMA vez no POST handler
- `logMonitoringUsage()` é helper local com try/catch (logging nunca quebra flow)
- `MONITORING_CRON_SECRET` lido em request-time (não module-level) para testabilidade
- Query de leads usa `.order("id", { ascending: true }).limit(BATCH_SIZE)` com cursor

**Learnings da 13.1:**
- Migration 00043 criou `lead_insights` com `suggestion TEXT` — JÁ EXISTE
- Tipos em `src/types/monitoring.ts`: `LeadInsight.suggestion: string | null`
- `transformLeadInsightRow()` já mapeia `suggestion` → `suggestion`

### Git Intelligence

Último commit: `64a65f0 feat(story-13.3): edge function de verificação semanal + code review fixes`
Branch: `epic/12-melhorias-ux-produtividade`
Padrão de commit: `feat(story-13.5): geração de sugestão de abordagem`

### Edge Cases a Tratar

1. **Post com texto muito curto (<10 chars):** Classificação já retorna `isRelevant: false` (13.4) — sugestão nunca é chamada
2. **Post muito longo (>4000 chars):** Truncar antes de interpolar no prompt
3. **Lead sem nome:** Usar apenas `first_name` (obrigatório no schema)
4. **Lead sem cargo/empresa/setor:** Interpolar string vazia — prompt deve funcionar com dados parciais
5. **OpenAI retorna sugestão vazia:** Tratar como falha, salvar insight sem sugestão
6. **Timeout OpenAI (30s):** AbortSignal.timeout → catch → suggestion=null (NÃO fail-open)
7. **Rate limit OpenAI (429):** suggestion=null, próximo cron tentará gerar para novos posts
8. **Classificação deu fallback (sem AI):** Não tentar gerar sugestão — sem openaiKey/kbContext não há como
9. **Custo duplicado:** Separar logs de classificação e geração por `request_type` diferente
10. **Múltiplos posts relevantes para mesmo lead:** Cada post gera sua própria sugestão independente

### References

- [Source: _bmad-output/planning-artifacts/epic-13-monitoramento-inteligente-leads-linkedin.md#Story 13.5] — AC originais
- [Source: _bmad-output/implementation-artifacts/13-4-filtro-de-relevancia-por-ia.md] — Story anterior e padrões
- [Source: src/lib/utils/relevance-classifier.ts] — Padrão de callOpenAI, interpolateTemplate, loadPromptTemplate
- [Source: src/app/api/monitoring/process-batch/route.ts] — Route onde sugestão será integrada
- [Source: src/lib/utils/monitoring-utils.ts] — MonitoringBatchResult (atualizar)
- [Source: src/types/monitoring.ts] — LeadInsight com suggestion: string | null
- [Source: src/types/ai-prompt.ts] — PromptKey enum e schemas Zod
- [Source: src/lib/ai/prompts/defaults.ts] — Padrão de code default prompts
- [Source: src/lib/services/knowledge-base-context.ts] — AIContextVariables com tone_description, tone_style
- [Source: src/types/lead.ts] — Lead type com firstName, lastName, title, companyName, industry
- [Source: supabase/migrations/00043_add_lead_monitoring_schema.sql] — Schema lead_insights com suggestion TEXT

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Task 1: Adicionado `"monitoring_approach_suggestion"` ao PromptKey union type, PROMPT_KEYS array, e promptKeySchema (z.enum) — 12 keys total. Prompt default adicionado em defaults.ts com template completo para sugestão de abordagem contextual (modelPreference: gpt-4o-mini, temperature: 0.7, maxTokens: 500). Testes de ai-prompt atualizados para 12 keys (10/10 passando).
- Task 2: Criado `approach-suggestion.ts` com interfaces (LeadContextForSuggestion, KBContextForSuggestion, SuggestionResult), calculateSuggestionCost, loadSuggestionPromptTemplate (3-level fallback), callOpenAI (duplicado com temperature 0.7, maxTokens 500, timeout 30s, SEM response_format JSON), e generateApproachSuggestion. Importa interpolateTemplate e KBContextForClassification do relevance-classifier.
- Task 3: Integrado no process-batch — query de leads expandida com first_name/last_name/title/company_name/industry, processLead tipo expandido com campos extras + toneContext param, helper loadToneContext para carregar tom de voz, geração de sugestão após classificação relevante (apenas quando openaiKey E kbContext disponíveis), logging de custo separado (request_type='monitoring_approach_suggestion'), suggestionsGenerated em MonitoringBatchResult. Todos os MonitoringBatchResult retornados incluem suggestionsGenerated: 0.
- Task 4: 13 testes unitários em approach-suggestion.test.ts (geração OK, OpenAI key ausente, HTTP error, texto vazio, content missing, interpolação lead/tone, truncação, fallback code default, tenant prompt, sem response_format, custo). 7 testes de suggestion em process-batch/route.test.ts (insight com suggestion, insight sem suggestion, suggestionsGenerated, fallback openaiKey null, fallback kbContext null, log custo, dados do lead). Testes existentes de 13.3/13.4 continuam passando. Total: 262 arquivos, 4810 testes, 0 falhas.

### Change Log

- 2026-02-28: Implementação completa da Story 13.5 — geração de sugestão de abordagem contextualizada. 20 novos testes (+13 approach-suggestion + 7 process-batch).
- 2026-02-28: Code review fixes — 6 issues (1 HIGH, 2 MEDIUM, 3 LOW): (1) Adicionado teste de timeout AbortError, (2) logging de falha para erros de geração sem tokens, (3) status corrigido para "failed" quando suggestion=null, (4) teste de loadToneContext default fallback, (5) teste de toneContext passado ao generateApproachSuggestion, (6) adicionado {{post_url}} ao template default. +4 testes (14 approach-suggestion + 10 process-batch). Total story: 53 testes.

### File List

- src/types/ai-prompt.ts (EDITADO — adicionado monitoring_approach_suggestion ao PromptKey, PROMPT_KEYS, promptKeySchema)
- src/lib/ai/prompts/defaults.ts (EDITADO — adicionado prompt default monitoring_approach_suggestion + code review: adicionado {{post_url}} ao template)
- src/lib/utils/approach-suggestion.ts (CRIADO — gerador de sugestão de abordagem: tipos, callOpenAI, loadPrompt, generateApproachSuggestion, calculateSuggestionCost)
- src/lib/utils/monitoring-utils.ts (EDITADO — adicionado suggestionsGenerated ao MonitoringBatchResult)
- src/app/api/monitoring/process-batch/route.ts (EDITADO — imports, loadToneContext, query expandida, processLead tipo expandido, geração de sugestão, log custo/falha, suggestionsGenerated + code review: failure logging + status correto)
- __tests__/unit/types/ai-prompt.test.ts (EDITADO — atualizado para 12 keys)
- __tests__/unit/lib/utils/approach-suggestion.test.ts (CRIADO — 14 testes unitários + code review: timeout test)
- __tests__/unit/app/api/monitoring/process-batch/route.test.ts (EDITADO — mock generateApproachSuggestion, createMockLead expandido, 10 testes de suggestion + code review: tone tests, failure logging test)
- _bmad-output/implementation-artifacts/sprint-status.yaml (EDITADO — status in-progress → review)
