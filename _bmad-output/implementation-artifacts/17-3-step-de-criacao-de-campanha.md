# Story 17.3: Step de Criacao de Campanha

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario do Agente TDEC,
I want que o agente crie uma campanha completa com emails personalizados e icebreakers,
So that eu tenha uma campanha pronta para envio sem precisar escrever os textos manualmente.

## Acceptance Criteria

1. **Given** os leads foram encontrados no step anterior
   **When** o CreateCampaignStep e executado
   **Then** o step carrega o contexto da Knowledge Base via KnowledgeBaseContext existente (perfil empresa, ICP, tom de voz)
   **And** seleciona o produto correto baseado no productSlug do briefing (FR24)

2. **Given** o contexto da Knowledge Base esta carregado
   **When** o step gera os emails da campanha
   **Then** utiliza os AI providers existentes para gerar a sequencia de emails
   **And** a sequencia segue estrutura otimizada: quantidade de emails, intervalos entre envios, objetivo de cada email (FR26)
   **And** o tom de voz da Knowledge Base e aplicado a todos os textos

3. **Given** os leads possuem LinkedIn URL
   **When** o step gera icebreakers
   **Then** chama o ApifyService existente para buscar posts recentes do LinkedIn
   **And** gera icebreakers personalizados baseados nos posts reais de cada lead (FR25)

4. **Given** o CreateCampaignStep concluiu
   **When** o output e salvo
   **Then** contem: campanha completa (nome, emails com assuntos e corpos, icebreakers por lead, configuracoes)
   **And** checkpoint e custo sao registrados

## Tasks / Subtasks

- [x] Task 1: Expandir tipos em `src/types/agent.ts` (AC: #4)
  - [x] 1.1 Adicionar novo AGENT_ERROR_CODE: `STEP_CREATE_CAMPAIGN_ERROR: 'Erro na criacao da campanha'`
  - [x] 1.2 Criar interface `CreateCampaignOutput` tipando output do step (campaignId, campaignName, structure, emailBlocks, delayBlocks, leadsWithIcebreakers, icebreakerStats, totalLeads)
  - [x] 1.3 Criar interface `CampaignStructureItem` para items do AI response (position, type: 'email'|'delay', context?, days?, emailMode?)
  - [x] 1.4 Criar interface `LeadWithIcebreaker` extends SearchLeadResult com campo `icebreaker: string | null`

- [x] Task 2: Criar `CreateCampaignStep` em `src/lib/agent/steps/create-campaign-step.ts` (AC: #1, #2, #3, #4)
  - [x] 2.1 Extends BaseStep, constructor recebe `(stepNumber, supabase, tenantId: string)` — precisa de tenantId para buscar API keys e KB context
  - [x] 2.2 Implementa `executeInternal(input: StepInput): Promise<StepOutput>`
  - [x] 2.3 Extrair leads do `previousStepOutput`: `input.previousStepOutput?.leads` como `SearchLeadResult[]` — validar que existe e nao esta vazio
  - [x] 2.4 Enviar mensagem de progresso: `"Etapa ${stepNumber}/5: Criando campanha com emails personalizados para ${totalLeads} leads..."`
  - [x] 2.5 **Sub-step A — Carregar contexto KB:** Buscar knowledge_base (company, tone, icp) via queries Supabase diretas (reutilizar padrao do `/api/ai/campaign-structure/route.ts` linhas 119-154). Chamar `buildAIVariables(kbContext, product)` para compilar variaveis AI
  - [x] 2.6 **Sub-step A.1 — Carregar produto:** Se `briefing.productSlug` existir, buscar produto via `products` table WHERE `id = briefing.productSlug AND tenant_id`. Passar para `buildAIVariables(kbContext, product)`
  - [x] 2.7 **Sub-step B — Gerar estrutura de campanha:** Buscar OpenAI API key via `api_configs` (mesmo padrao do route). Chamar `promptManager.renderPrompt('campaign_structure_generation', variables, { tenantId })`. Chamar `createAIProvider('openai', apiKey).generateText(prompt.content, options)`. Parsear JSON do resultado (campaign structure com emails + delays)
  - [x] 2.8 **Sub-step B.1 — Validar JSON do AI:** Parsear `result.text` com `JSON.parse()`. Validar que `structure.items` existe e tem pelo menos 1 email. Se parse falhar, throw Error com mensagem descritiva
  - [x] 2.9 **Sub-step C — Gerar icebreakers standard:** Para cada lead, gerar icebreaker usando prompt `icebreaker_generation` via `promptManager.renderPrompt()` + `provider.generateText()`. Usar variaveis do KB + dados do lead (name, title, companyName, industry). Processar em batches de 5 (paralelo) para performance
  - [x] 2.10 **Sub-step C.1 — Tratamento de falhas de icebreaker:** Se icebreaker falhar para um lead especifico, definir `icebreaker: null` e continuar (NAO abortar o step inteiro). Registrar em `icebreakerStats.failed`
  - [x] 2.11 **Sub-step D — Gerar conteudo de emails:** Para cada email block na estrutura, gerar subject e body usando prompts `email_subject_generation` e `email_body_generation` via `promptManager.renderPrompt()` + `provider.generateText()`. Usar KB context + campaign context. Email 1 usa template inicial; emails 2+ usam `follow_up_email_generation` com referencia ao email anterior
  - [x] 2.12 **Sub-step E — Montar output:** Compor `CreateCampaignOutput` com: campaignName (gerado a partir do briefing), structure items, email blocks (position, subject, body, emailMode), delay blocks (position, delayDays), leads com icebreakers, stats
  - [x] 2.13 Calcular custo: `{ openai_structure: 1, openai_emails: emailCount, openai_icebreakers: icebreakerStats.generated }` — cada chamada OpenAI = 1 unidade
  - [x] 2.14 Retornar StepOutput com `success: true`, `data: CreateCampaignOutput`, `cost`

- [x] Task 3: Atualizar `DeterministicOrchestrator` em `src/lib/agent/orchestrator.ts` (AC: #1)
  - [x] 3.1 Importar CreateCampaignStep
  - [x] 3.2 No step registry (`getStepInstance`), substituir o throw de `create_campaign` por `return new CreateCampaignStep(stepNumber, this.supabase, tenantId)`
  - [x] 3.3 Verificar que `previousStepOutput` (ja implementado na 17.2) passa corretamente os leads do SearchLeadsStep

- [x] Task 4: Testes unitarios (AC: todos)
  - [x] 4.1 CreateCampaignStep: happy path — previousStepOutput com leads, KB carregado, AI gera estrutura valida, icebreakers gerados, emails gerados -> output completo
  - [x] 4.2 CreateCampaignStep: validacao input — sem previousStepOutput -> throw Error
  - [x] 4.3 CreateCampaignStep: validacao input — previousStepOutput sem leads -> throw Error
  - [x] 4.4 CreateCampaignStep: validacao input — leads array vazio -> throw Error
  - [x] 4.5 CreateCampaignStep: KB nao configurado -> usa defaults graceful (buildAIVariables(null) retorna defaults)
  - [x] 4.6 CreateCampaignStep: produto nao encontrado (productSlug invalido) -> continua sem produto (buildAIVariables(kb, null))
  - [x] 4.7 CreateCampaignStep: AI retorna JSON invalido -> throw Error com mensagem descritiva
  - [x] 4.8 CreateCampaignStep: AI retorna estrutura sem emails -> throw Error
  - [x] 4.9 CreateCampaignStep: icebreaker falha para 1 lead -> continua com icebreaker null para esse lead, stats registram failed=1
  - [x] 4.10 CreateCampaignStep: icebreaker falha para todos os leads -> step continua (icebreakers sao opcionais), icebreakerStats.failed = totalLeads
  - [x] 4.11 CreateCampaignStep: erro retryable do OpenAI (429 rate limit) -> toPipelineError com isRetryable=true, externalService='openai'
  - [x] 4.12 CreateCampaignStep: erro terminal do OpenAI (401 API key invalida) -> toPipelineError com isRetryable=false
  - [x] 4.13 CreateCampaignStep: custo calculado corretamente (1 structure + N emails + M icebreakers)
  - [x] 4.14 CreateCampaignStep: mensagem de progresso enviada ao agent_messages
  - [x] 4.15 CreateCampaignStep: email follow-up recebe previous_email_subject e previous_email_body como variaveis
  - [x] 4.16 DeterministicOrchestrator: dispatch para create_campaign funciona (nao mais throw)

## Dev Notes

### Convencao de Error Handling (OBRIGATORIA)

Documento completo: `_bmad-output/implementation-artifacts/epic-17-error-handling-convention.md`

Seguir EXATAMENTE o mesmo padrao das Stories 17.1 e 17.2. Resumo:

- **Camada 1 (BaseStep):** JA EXISTE. CreateCampaignStep herda run() com try/catch, saveCheckpoint, toPipelineError automaticos.
- **Camada 2 (Orchestrator):** JA EXISTE. Erro -> 'paused' + sendErrorMessage. So precisa registrar CreateCampaignStep no registry.
- **Padroes PROIBIDOS:** fetch sem response.ok, catch vazio, non-null assertions (!), erro generico sem contexto.

### Decisao Arquitetural: campaignId removido do CreateCampaignOutput

Task 1.2 originalmente listava `campaignId` no output. Removido porque o ID da campanha so existe apos o Export step criar a campanha no Instantly. Este step gera o *conteudo* da campanha; o ID e atribuido pelo provider externo (Instantly) no step seguinte.

### Decisao Arquitetural: Services Direto (NAO API Routes)

Conforme spike `_bmad-output/implementation-artifacts/epic-17-api-validation-spike-2026-03-26.md` (GAP 6):

**O CreateCampaignStep chama services direto, NAO API routes.** Motivos:
1. Step ja roda no server-side (API route do step)
2. Tem acesso direto ao tenantId (auth ja resolvida na route do step)
3. Evita fetch para si mesmo (anti-pattern)
4. Performance critica — gerar emails para muitos leads via HTTP seria lento

### Decisao Arquitetural: Icebreaker Standard como Default

Conforme spike (GAP 7):
- **Default:** Icebreaker standard (sem LinkedIn scraping) — rapido e confiavel
- Icebreaker premium (Apify/LinkedIn) sera feature futura com opt-in explicito
- Para 60 leads com icebreaker standard: ~30 segundos (5 batches paralelos × ~5-6s cada)
- Para icebreaker premium: 3-5 min (inviavel para MVP)

**Implementacao:** Usar prompt `icebreaker_generation` (NAO `icebreaker_premium_generation`). Variaveis do lead (name, title, company, industry) + KB context. Nao precisa de ApifyService nesta story.

### Decisao Arquitetural: Template Unico de Emails + Variaveis

Conforme spike (GAP 8):
- Gerar campanha TEMPLATE com subject e body por email block
- Icebreakers gerados separadamente por lead
- Templates podem usar `{{icebreaker}}`, `{{lead_name}}`, etc. — resolucao ocorre no Export step (Instantly suporta custom_variables)
- Resultado: 1 chamada AI para estrutura + N chamadas para conteudo de email + M chamadas para icebreakers

### Fluxo do Step (4 sub-operacoes)

```
1. Carregar contexto KB (buildAIVariables) + produto (se productSlug)
2. Gerar estrutura de campanha (campaign_structure_generation prompt → JSON)
3. Gerar conteudo de emails (email_subject_generation + email_body_generation por email)
4. Gerar icebreakers standard (icebreaker_generation por lead, batches de 5)
```

### Servicos/Funcoes a REUTILIZAR (NAO RECRIAR)

| Servico/Funcao | Arquivo | Uso nesta story |
|----------------|---------|----------------|
| BaseStep | `src/lib/agent/steps/base-step.ts` | Extends — herda run(), saveCheckpoint, toPipelineError |
| buildAIVariables | `src/lib/services/knowledge-base-context.ts` | Compilar variaveis AI a partir do KB + produto |
| PromptManager (promptManager) | `src/lib/ai/prompt-manager.ts` | `promptManager.renderPrompt(key, vars, { tenantId })` |
| createAIProvider | `src/lib/ai/providers/index.ts` | `createAIProvider('openai', apiKey).generateText(prompt, options)` |
| decryptApiKey | `src/lib/crypto/encryption.ts` | Descriptografar API key do OpenAI |
| transformProductRow | `src/types/product.ts` | Converter ProductRow para Product |
| DeterministicOrchestrator | `src/lib/agent/orchestrator.ts` | Registrar create_campaign no step registry |

### Contratos dos Services (CRITICO)

#### buildAIVariables (knowledge-base-context.ts)

```typescript
import { buildAIVariables } from "@/lib/services/knowledge-base-context";
import type { KnowledgeBaseContext, AIContextVariables } from "@/lib/services/knowledge-base-context";

// Carregar KB do banco (3 queries: company, tone, icp)
const { data: companyData } = await this.supabase
  .from("knowledge_base").select("content")
  .eq("tenant_id", this.tenantId).eq("section", "company").single();
const { data: toneData } = await this.supabase
  .from("knowledge_base").select("content")
  .eq("tenant_id", this.tenantId).eq("section", "tone").single();
const { data: icpData } = await this.supabase
  .from("knowledge_base").select("content")
  .eq("tenant_id", this.tenantId).eq("section", "icp").single();

const kbContext: KnowledgeBaseContext = {
  company: companyData?.content as KnowledgeBaseContext["company"],
  tone: toneData?.content as KnowledgeBaseContext["tone"],
  icp: icpData?.content as KnowledgeBaseContext["icp"],
  examples: [],
};

const aiVars: AIContextVariables = buildAIVariables(kbContext, product);
// Retorna: company_context, products_services, tone_description, tone_style, writing_guidelines,
//          product_name, product_description, product_features, product_differentials,
//          icp_summary, target_industries, target_titles, pain_points, etc.
```

**Graceful degradation:** Se KB vazio, `buildAIVariables(null)` retorna defaults sensiveis ("Empresa de tecnologia...", tom casual, etc.)

#### PromptManager + OpenAI Provider

```typescript
import { promptManager, createAIProvider, AIProviderError } from "@/lib/ai";
import { decryptApiKey } from "@/lib/crypto/encryption";
import type { AIGenerationOptions } from "@/types/ai-provider";

// 1. Buscar API key
const { data: apiConfig } = await this.supabase
  .from("api_configs").select("encrypted_key")
  .eq("tenant_id", this.tenantId).eq("service_name", "openai").single();
if (!apiConfig) throw new Error("API key do OpenAI nao configurada");
const apiKey = decryptApiKey(apiConfig.encrypted_key);

// 2. Render prompt
const rendered = await promptManager.renderPrompt(
  "campaign_structure_generation",
  { objective: "COLD_OUTREACH", urgency: "MEDIUM", ... },
  { tenantId: this.tenantId }
);
if (!rendered) throw new Error("Prompt campaign_structure_generation nao encontrado");

// 3. Gerar via OpenAI
const provider = createAIProvider("openai", apiKey);
const result = await provider.generateText(rendered.content, {
  temperature: rendered.metadata.temperature ?? 0.6,
  maxTokens: rendered.metadata.maxTokens ?? 1500,
  model: (rendered.modelPreference ?? "gpt-4o") as AIModel,
  timeoutMs: 30000,
});

// result.text = JSON string com a estrutura
```

#### Prompts Disponiveis para Email Generation

| PromptKey | Uso | Variaveis principais |
|-----------|-----|---------------------|
| `campaign_structure_generation` | Gerar estrutura (JSON com items email+delay) | objective, urgency, company_context, tone_style, product_name? |
| `email_subject_generation` | Gerar assunto de email inicial | company_context, product_name?, lead_name, lead_title, lead_company, tone_style, email_objective |
| `email_body_generation` | Gerar corpo de email inicial | company_context, product_name?, product_description?, lead_name, lead_title, lead_company, tone_style, icebreaker |
| `follow_up_email_generation` | Gerar email follow-up | previous_email_subject, previous_email_body, company_context, product_name?, lead_name, lead_title, lead_company, tone_style |
| `icebreaker_generation` | Gerar icebreaker standard | company_context, product_name?, lead_name, lead_title, lead_company, lead_industry, lead_location, tone_style, category_instructions |

**IMPORTANTE sobre email generation:**
- Emails sao gerados como TEMPLATES (um subject/body por email block da estrutura)
- Variaveis como `{{lead_name}}`, `{{icebreaker}}` podem ser usadas nos templates — serao resolvidas pelo Instantly via custom_variables no Export step
- Alternativa: gerar emails genericos na campanha, e personalizar via Instantly custom_variables
- Recomendacao do spike: gerar 1 template por email position, usar `{{icebreaker}}` como placeholder

### Dados do Step Anterior (previousStepOutput)

O SearchLeadsStep (story 17.2) retorna:
```typescript
{
  success: true,
  data: {
    leads: SearchLeadResult[],     // Array de leads
    totalFound: number,
    jobTitles: string[],
    domainsSearched: string[]
  },
  cost: { apollo_search: number }
}
```

**SearchLeadResult (src/types/agent.ts):**
```typescript
interface SearchLeadResult {
  name: string;          // first_name + last_name
  title: string | null;  // Cargo
  companyName: string | null; // Empresa
  email: string | null;  // Email (pode ser null no api_search)
  linkedinUrl: string | null; // URL LinkedIn
}
```

O campo `leads` e a chave: usar `previousStepOutput.leads` para extrair os leads.

### Briefing — Campos Relevantes para este Step

```typescript
interface ParsedBriefing {
  // ... campos anteriores
  productSlug: string | null;       // Slug do produto para buscar no DB (FR24)
  objective: string | null;         // Objetivo da campanha (cold_outreach, etc.)
  urgency: string | null;           // Urgencia (low, medium, high)
  campaignDescription: string | null; // Descricao adicional
  // ...
}
```

**IMPORTANTE:** Verificar se `briefing.objective` e `briefing.urgency` existem. Se nao, usar defaults: `objective = "COLD_OUTREACH"`, `urgency = "MEDIUM"`.

### Padrao CreateCampaignStep (seguir SearchLeadsStep como referencia)

```typescript
export class CreateCampaignStep extends BaseStep {
  private readonly tenantId: string;

  constructor(stepNumber: number, supabase: SupabaseClient, tenantId: string) {
    super(stepNumber, "create_campaign" as StepType, supabase);
    this.tenantId = tenantId;
  }

  protected async executeInternal(input: StepInput): Promise<StepOutput> {
    const { briefing, previousStepOutput } = input;

    // 1. Validar input (leads do step anterior)
    // 2. Enviar mensagem de progresso
    // 3. Carregar KB context + produto
    // 4. Buscar OpenAI API key
    // 5. Gerar estrutura de campanha (campaign_structure_generation)
    // 6. Parsear e validar JSON da estrutura
    // 7. Gerar conteudo de cada email block (subject + body)
    // 8. Gerar icebreakers standard por lead (batches de 5)
    // 9. Montar CreateCampaignOutput
    // 10. Calcular custo
    // 11. Retornar StepOutput
  }
}
```

### Geracao de Icebreakers — Padrao de Batch

```typescript
// Processar leads em batches de 5 para paralelismo controlado
const ICEBREAKER_BATCH_SIZE = 5;
const leadsWithIcebreakers: LeadWithIcebreaker[] = [];
const icebreakerStats = { generated: 0, failed: 0, skipped: 0 };

for (let i = 0; i < leads.length; i += ICEBREAKER_BATCH_SIZE) {
  const batch = leads.slice(i, i + ICEBREAKER_BATCH_SIZE);
  const results = await Promise.allSettled(
    batch.map(lead => generateIcebreaker(lead, aiVars, provider))
  );

  for (let j = 0; j < results.length; j++) {
    const lead = batch[j];
    const result = results[j];
    if (result.status === 'fulfilled' && result.value) {
      leadsWithIcebreakers.push({ ...lead, icebreaker: result.value });
      icebreakerStats.generated++;
    } else {
      leadsWithIcebreakers.push({ ...lead, icebreaker: null });
      icebreakerStats.failed++;
    }
  }
}
```

### Category Instructions para Icebreaker (OBRIGATORIO)

O prompt `icebreaker_generation` exige a variavel `category_instructions`. Para icebreaker standard (categoria "lead"), usar:

```typescript
const categoryInstructions = `FOCO: Situacao profissional do lead.
PRIORIZE: cargo atual, responsabilidades tipicas do cargo, desafios comuns do setor.
CONECTE: a situacao do lead com o valor que a empresa/produto oferece.
ANTI-PATTERN: NAO mencione posts, publicacoes ou atividade online.`;
```

Verificar o padrao exato no arquivo `src/app/api/leads/enrich-icebreaker/route.ts` — ha category instructions especificas por tipo (lead, empresa, cargo, post).

### Geracao de Emails — Fluxo Detalhado

```
Para cada email item na estrutura:
  Se position == 0 (primeiro email):
    - Gerar subject via email_subject_generation
    - Gerar body via email_body_generation
    - Usar: company_context, product_*, lead_name={{lead_name}}, icebreaker={{icebreaker}}, tone_style

  Se position > 0 (follow-up):
    - Gerar body via follow_up_email_generation
    - Gerar subject via follow_up_subject_generation (ou derivar do body)
    - Usar: previous_email_subject, previous_email_body, company_context, tone_style
```

**NOTA:** Os emails sao templates — usam `{{lead_name}}`, `{{icebreaker}}` etc. como placeholders que serao resolvidos pelo Instantly custom_variables no Export step. O step NAO personaliza cada email por lead.

### Output Esperado do Step (compativel com Step 4 - Export)

```typescript
{
  success: true,
  data: {
    campaignName: string,           // Ex: "Campanha React BR - Q1 2026"
    structure: {                    // Estrutura da campanha
      totalEmails: number,
      totalDays: number,
      items: CampaignStructureItem[]
    },
    emailBlocks: Array<{            // Emails gerados
      position: number,
      subject: string,
      body: string,
      emailMode: "initial" | "follow-up"
    }>,
    delayBlocks: Array<{            // Delays entre emails
      position: number,
      delayDays: number
    }>,
    leadsWithIcebreakers: LeadWithIcebreaker[],  // Leads + icebreaker
    icebreakerStats: {
      generated: number,
      failed: number,
      skipped: number
    },
    totalLeads: number
  },
  cost: {
    openai_structure: 1,
    openai_emails: number,          // Numero de emails gerados
    openai_icebreakers: number      // Numero de icebreakers gerados
  }
}
```

Este output e consumido pelo Step 4 (ExportStep) que vai:
1. Usar `emailBlocks` + `delayBlocks` para criar campanha no Instantly via `blocksToInstantlySequences()`
2. Usar `leadsWithIcebreakers` para adicionar leads com custom_variables no Instantly
3. Usar `campaignName` como nome da campanha

### Estimativa de Tempo do Step (60 leads)

| Sub-operacao | Chamadas AI | Tempo estimado |
|--------------|-------------|----------------|
| KB load | 0 (3 DB queries) | ~0.5s |
| Estrutura campanha | 1 chamada OpenAI | ~3-5s |
| Conteudo emails (4-5) | 8-10 chamadas OpenAI | ~15-25s |
| Icebreakers standard (60 leads, batches de 5) | 60 chamadas OpenAI | ~30-60s |
| **Total** | ~70 chamadas | **~50s - 1.5min** |

NFR2 (< 15 min): Atendido com folga.

### Error Handling Especifico deste Step

| Erro | isRetryable | externalService | Tratamento |
|------|-------------|-----------------|------------|
| API key OpenAI nao configurada | false | undefined | `throw new Error("API key do OpenAI nao configurada")` |
| OpenAI 429 rate limit | true | 'openai' | toPipelineError do BaseStep trata via AIProviderError/ExternalServiceError |
| OpenAI 401 key invalida | false | 'openai' | toPipelineError |
| JSON parse falhou (AI retornou formato invalido) | true | 'openai' | `throw new Error("Formato invalido na resposta do AI")` — retryable porque retry pode gerar JSON valido |
| KB nao encontrado | N/A | N/A | NAO e erro — usar defaults via buildAIVariables(null) |
| Produto nao encontrado | N/A | N/A | NAO e erro — continuar sem produto |
| Icebreaker falhou para lead X | N/A | N/A | NAO e erro do step — registrar em stats e continuar |

### Project Structure Notes

**Novos arquivos a criar:**
```
src/lib/agent/steps/create-campaign-step.ts         <- CreateCampaignStep
__tests__/unit/lib/agent/steps/create-campaign-step.test.ts
```

**Arquivos a modificar:**
```
src/types/agent.ts                                   <- Adicionar STEP_CREATE_CAMPAIGN_ERROR, CreateCampaignOutput, CampaignStructureItem, LeadWithIcebreaker
src/lib/agent/orchestrator.ts                        <- Registrar create_campaign no registry (substituir throw)
__tests__/unit/lib/agent/orchestrator.test.ts        <- Novo teste dispatch create_campaign
__tests__/unit/types/agent.test.ts                   <- Atualizar contagem AGENT_ERROR_CODES (12 -> 13)
```

**Convencoes de naming (seguir stories 17.1 e 17.2):**
- Step class: `CreateCampaignStep` (PascalCase + sufixo Step)
- Step type: `create_campaign` (snake_case)
- Arquivo: `create-campaign-step.ts` (kebab-case)
- Error code: `STEP_CREATE_CAMPAIGN_ERROR` (UPPER_SNAKE_CASE)

### Padroes de Codigo (Stories 17.1 e 17.2 learnings)

**Service/Step classes:**
- Metodos estaticos para operacoes stateless
- OU instancias com contexto (BaseStep pattern — stepNumber, stepType, supabase)
- Throw errors, nao retornar objetos de erro

**Testes (Vitest):**
- Mock factories centralizadas em test utils
- createChainBuilder() para mock de Supabase query chains
- Mock de PromptManager: `vi.mock("@/lib/ai", () => ({ promptManager: { renderPrompt: vi.fn() }, createAIProvider: vi.fn(), AIProviderError: ... }))`
- Mock de OpenAI provider: `{ generateText: vi.fn().mockResolvedValue({ text: '...', model: 'gpt-4o', usage: {...} }) }`
- Mock de buildAIVariables: `vi.mock("@/lib/services/knowledge-base-context", () => ({ buildAIVariables: vi.fn().mockReturnValue({...}) }))`
- Cobrir: happy path + erro retryable + erro terminal + input invalido + falhas parciais (icebreaker)

**Debug learnings das stories anteriores:**
- TheirStack/ApolloService mock: precisa ser class mock para funcionar como construtor no Vitest
- toPipelineError: `code` field usa string key ("STEP_CREATE_CAMPAIGN_ERROR"), nao o valor do AGENT_ERROR_CODES
- Teste de contagem de AGENT_ERROR_CODES: atualizar contagem apos adicionar novo codigo
- `promptManager` e exportado como instancia singleton de `@/lib/ai` — mockar diretamente

### Checklist de Code Review (Epic 17)

Toda story da Epic 17 deve passar:
- [ ] Todo `fetch` tem check de `response.ok`
- [ ] Todo handler/callback tem `try/catch`
- [ ] Todo `catch` propaga ou exibe o erro (nunca engole)
- [ ] Erros de service convertidos em PipelineError via toPipelineError()
- [ ] saveCheckpoint() chamado tanto no sucesso quanto na falha
- [ ] Mensagem de erro enviada ao chat via sendErrorMessage()
- [ ] isRetryable corretamente classificado
- [ ] externalService preenchido quando aplicavel
- [ ] Nenhum console.log de erro (usar logStep())
- [ ] Nenhuma non-null assertion (!)
- [ ] Testes cobrem: happy path + erro retryable + erro terminal + input invalido

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Story 17.3]
- [Source: _bmad-output/implementation-artifacts/17-2-step-de-busca-de-leads.md]
- [Source: _bmad-output/implementation-artifacts/17-1-pipeline-orchestrator-step-de-busca-de-empresas.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-error-handling-convention.md]
- [Source: _bmad-output/implementation-artifacts/epic-17-api-validation-spike-2026-03-26.md — GAPs 6, 7, 8]
- [Source: src/types/agent.ts — tipos do pipeline, SearchLeadResult, StepInput, StepOutput]
- [Source: src/lib/agent/steps/base-step.ts — BaseStep]
- [Source: src/lib/agent/steps/search-leads-step.ts — SearchLeadsStep (padrao de referencia)]
- [Source: src/lib/agent/orchestrator.ts — DeterministicOrchestrator]
- [Source: src/lib/services/knowledge-base-context.ts — buildAIVariables, KnowledgeBaseContext]
- [Source: src/lib/ai/prompt-manager.ts — PromptManager, renderPrompt]
- [Source: src/lib/ai/providers/index.ts — createAIProvider]
- [Source: src/lib/ai/prompts/defaults.ts — campaign_structure_generation, icebreaker_generation, email_*_generation]
- [Source: src/app/api/ai/campaign-structure/route.ts — padrao de referencia para KB loading + AI generation]
- [Source: src/app/api/leads/enrich-icebreaker/route.ts — padrao de referencia para icebreaker generation]
- [Source: src/types/ai-prompt.ts — PromptKey, inclui campaign_structure_generation]
- [Source: src/lib/crypto/encryption.ts — decryptApiKey]
- [Source: src/types/product.ts — ProductRow, transformProductRow]
- [Source: src/lib/export/blocks-to-sequences.ts — blocksToInstantlySequences (output compatibility)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- productSlug e na verdade o product ID (UUID), nao um slug textual — query ajustada para `.eq("id", productId)` em vez de `.eq("slug", ...)`
- ParsedBriefing nao tem campos objective/urgency/campaignDescription ainda — acesso seguro via Record cast com defaults

### Completion Notes List

- ✅ Task 1: Adicionado STEP_CREATE_CAMPAIGN_ERROR, CreateCampaignOutput, CampaignStructureItem, LeadWithIcebreaker em agent.ts
- ✅ Task 2: CreateCampaignStep implementado com 5 sub-steps (KB load, structure gen, icebreaker gen, email gen, output assembly). Segue padrao BaseStep, usa services direto (nao API routes), icebreakers em batches de 5 com Promise.allSettled
- ✅ Task 3: Orchestrator atualizado — create_campaign no registry, import adicionado
- ✅ Task 4: 16 testes no create-campaign-step.test.ts + 1 teste dispatch no orchestrator.test.ts + contagem AGENT_ERROR_CODES atualizada (12→13). Total: 5785 testes passando, 0 regressoes

### Code Review Fixes (Adversarial Review)

- ✅ **[H1] Follow-up subject**: Corrigido — agora usa `follow_up_subject_generation` separado para subject e `follow_up_email_generation` para body (antes fazia split por newline de um unico prompt). Adicionado `sequence_position` nas variaveis.
- ✅ **[H2] JSON parse retryable**: Corrigido — `parseStructureJSON` agora lanca `ExternalServiceError("openai", 502, ...)` em vez de plain Error, tornando retryable via BaseStep.toPipelineError. 502 (Bad Gateway) semanticamente correto para resposta AI malformada.
- ✅ **[H3] Icebreaker examples do DB**: Corrigido — adicionado `loadIcebreakerExamples()` e `formatIcebreakerExamples()` (mesmo padrao da route enrich-icebreaker). Exemplos salvos pelo usuario sao injetados no prompt com prioridade maxima.
- ✅ **[M1] email_objective para follow-up**: Corrigido — `item.context` agora e passado como `email_objective` nos prompts de follow-up.
- ✅ **[M2] campaignId documentado**: Adicionado Dev Note explicando porque `campaignId` foi removido do output (so existe apos Export step).
- ✅ **[L1] campaignName testes**: Adicionados 2 testes para os dois paths (com/sem campaignDescription).
- ✅ **[L2] formatIcebreakerExamples testes**: Adicionados 3 testes (empty, formatting, prioritization max 3).
- Total apos review: 22 testes create-campaign-step + 13 orchestrator + 27 agent.types = 62 testes story, 5791 total, 0 regressoes

### Change Log

- 2026-03-26: Story 17.3 implementada — CreateCampaignStep com KB context, AI structure/email/icebreaker generation, orchestrator dispatch
- 2026-03-26: Code review adversarial — 7 issues corrigidos (3 HIGH, 2 MEDIUM, 2 LOW). Follow-up subject, JSON retryable, icebreaker examples, email_objective, campaignName tests

### File List

**Novos:**
- src/lib/agent/steps/create-campaign-step.ts
- __tests__/unit/lib/agent/steps/create-campaign-step.test.ts

**Modificados:**
- src/types/agent.ts
- src/lib/agent/orchestrator.ts
- __tests__/unit/lib/agent/orchestrator.test.ts
- __tests__/unit/types/agent.test.ts
