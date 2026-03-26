# Story 16.6: Cadastro de Produto Inline

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuario do Agente TDEC,
I want cadastrar um produto novo durante o briefing sem sair do chat,
So that eu possa prospectar para produtos novos imediatamente sem precisar ir ate as configuracoes.

## Acceptance Criteria

1. **Given** o usuario menciona um produto no briefing (ex: "Quero prospectar pro TDEC Analytics")
   **When** o BriefingParserService nao encontra o produto na Knowledge Base
   **Then** o agente informa: "Nao encontrei o produto 'TDEC Analytics'. Quer cadastrar agora?"
   **And** explica os campos necessarios: nome, descricao, principais features, diferenciais, publico-alvo

2. **Given** o agente ofereceu cadastrar o produto inline
   **When** o usuario aceita e fornece as informacoes em linguagem natural
   **Then** o agente extrai os campos estruturados da resposta
   **And** apresenta um resumo para confirmacao: "Cadastrei o TDEC Analytics: [resumo]. Esta correto?"

3. **Given** o usuario confirma o cadastro do produto
   **When** o agente persiste o produto
   **Then** o produto e salvo na Knowledge Base via servico existente
   **And** o campo productSlug do ParsedBriefing e atualizado com o novo produto

4. **Given** o produto foi cadastrado inline
   **When** o fluxo de briefing continua
   **Then** o agente utiliza o produto recem-cadastrado normalmente na campanha
   **And** a transicao e transparente — o usuario nao percebe diferenca entre produto existente e recem-criado

5. **Given** o usuario nao quer cadastrar o produto agora
   **When** recusa a oferta de cadastro inline
   **Then** o agente pergunta se quer usar outro produto ja cadastrado ou continuar sem produto especifico

## Tasks / Subtasks

- [x] Task 1: Estender BriefingParseResponse com productMentioned (AC: #1)
  - [x] 1.1 Em `src/app/api/agent/briefing/parse/route.ts`: adicionar `productMentioned: string | null` a interface `BriefingParseResponse`
  - [x] 1.2 Na construcao da response (dentro do try/catch), adicionar: `productMentioned: rawResponse.productMentioned`

- [x] Task 2: ProductParserService (AC: #2)
  - [x]2.1 Criar `src/lib/agent/product-parser-service.ts`
  - [x]2.2 Adicionar `ExtractedProduct` interface ao `src/types/agent.ts`:
        ```typescript
        export interface ExtractedProduct {
          name: string;
          description: string;
          features: string | null;
          differentials: string | null;
          targetAudience: string | null;
        }
        ```
  - [x]2.3 Zod schema `productResponseSchema`:
        ```typescript
        export const productResponseSchema = z.object({
          name: z.string(),
          description: z.string(),
          features: z.string().nullable(),
          differentials: z.string().nullable(),
          targetAudience: z.string().nullable(),
        });
        ```
  - [x]2.4 System prompt para extracao de campos de produto de texto livre em portugues. Campos: name (obrigatorio), description (obrigatorio — gerar breve se nao fornecido), features (null se ausente), differentials (null se ausente), targetAudience (null se ausente). Instrucao extra: usar o productName fornecido no contexto como fallback para name.
  - [x]2.5 Metodo `static async parse(message: string, productName: string, apiKey: string): Promise<ExtractedProduct>`:
        - Inclui productName no contexto do user message: `Produto: ${productName}\n\nDescricao do usuario: ${message}`
        - Mesmo padrao de BriefingParserService: OpenAI gpt-4o-mini, response_format json_object, temperature 0.1, timeout 5000ms
        - Zod validation do response
        - Error handling identico a BriefingParserService (abort, parse error)
  - [x]2.6 Constantes: PARSER_MODEL = "gpt-4o-mini", PARSER_TEMPERATURE = 0.1, PARSER_TIMEOUT_MS = 5000

- [x] Task 3: API Route POST /api/agent/briefing/parse-product (AC: #2)
  - [x]3.1 Criar `src/app/api/agent/briefing/parse-product/route.ts`
  - [x]3.2 Request schema:
        ```typescript
        const parseProductRequestSchema = z.object({
          executionId: z.string().uuid(),
          message: z.string().min(1),
          productName: z.string().min(1),
        });
        ```
  - [x]3.3 Auth via `getCurrentUserProfile()` (401 se null)
  - [x]3.4 Parse + validacao do body (400 se invalido)
  - [x]3.5 Supabase client → verificar execucao existe e pertence ao tenant (404 se nao)
  - [x]3.6 Buscar OpenAI API key em `api_configs` (422 se nao configurada)
  - [x]3.7 Decriptar via `decryptApiKey` (500 se falhar)
  - [x]3.8 Chamar `ProductParserService.parse(message, productName, apiKey)`
  - [x]3.9 Retornar `{ product: ExtractedProduct }` (200)
  - [x]3.10 Catch error → 500 com code "PRODUCT_PARSE_ERROR"

- [x] Task 4: Estender useBriefingFlow com fluxo de cadastro de produto (AC: #1-#5)
  - [x]4.1 Adicionar novos BriefingFlowStatus values:
        ```typescript
        export type BriefingFlowStatus =
          | "idle"
          | "parsing"
          | "awaiting_fields"
          | "confirming"
          | "confirmed"
          | "awaiting_product_decision"   // NOVO: perguntou se quer cadastrar
          | "awaiting_product_details"    // NOVO: esperando NL com detalhes
          | "confirming_product";         // NOVO: resumo do produto para confirmar
        ```
  - [x]4.2 Estender BriefingFlowState com campos de produto:
        ```typescript
        export interface BriefingFlowState {
          status: BriefingFlowStatus;
          briefing: ParsedBriefing | null;
          missingFields: string[];
          isComplete: boolean;
          productMentioned: string | null;          // NOVO
          pendingProduct: ExtractedProduct | null;   // NOVO
        }
        ```
  - [x]4.3 Inicializar novos campos: `productMentioned: null, pendingProduct: null`
  - [x]4.4 Novo helper `callParseProductAPI(message, executionId, productName)`:
        - Chama POST `/api/agent/briefing/parse-product`
        - Retorna `{ product: ExtractedProduct }`
  - [x]4.5 Novo helper `generateProductSummary(product: ExtractedProduct): string`:
        ```
        "Cadastrei o {name} com os seguintes dados:
        - Descricao: {description}
        - Features: {features || 'nao informado'}
        - Diferenciais: {differentials || 'nao informado'}
        - Publico-alvo: {targetAudience || 'nao informado'}

        Esta correto?"
        ```
  - [x]4.6 Constante `PRODUCT_REJECTION_KEYWORDS`:
        ```typescript
        const PRODUCT_REJECTION_KEYWORDS = ["nao", "depois", "sem produto", "pular", "outro", "skip"];
        ```
  - [x]4.7 Helper `isProductRejection(message: string): boolean` — mesma logica de `isConfirmation` mas com PRODUCT_REJECTION_KEYWORDS
  - [x]4.8 Atualizar assinatura de processMessage para aceitar callback de criacao de produto:
        ```typescript
        processMessage: (
          content: string,
          executionId: string,
          sendAgentMessage: (executionId: string, content: string) => Promise<void>,
          createProduct?: (product: CreateProductInput) => Promise<string | null>
        ) => Promise<{ handled: boolean; confirmed?: boolean }>;
        ```
  - [x]4.9 Logica de deteccao de produto nao encontrado (inserir ANTES de ir para "confirming"):
        - Apos parse retornar `isComplete: true`:
          - Se `parseResponse.productMentioned` E `parseResponse.briefing.productSlug === null`:
            - setState: status → "awaiting_product_decision", productMentioned → parseResponse.productMentioned
            - sendAgentMessage: "Nao encontrei o produto '{productMentioned}' na base de conhecimento. Quer cadastrar agora? Vou precisar de: nome, descricao, features, diferenciais e publico-alvo."
            - return { handled: true }
          - Senao: → flow normal (confirming com summary)
  - [x]4.10 Handler estado `awaiting_product_decision`:
        - Se `isConfirmation(content)`:
          - setState: status → "awaiting_product_details"
          - sendAgentMessage: "Otimo! Me descreva o produto em linguagem natural. Pode incluir o que ele faz, funcionalidades, diferenciais e para quem e voltado."
          - return { handled: true }
        - Se `isProductRejection(content)`:
          - setState: status → "confirming", productMentioned → null
          - sendAgentMessage: generateBriefingSummary(briefing) (resumo sem produto)
          - return { handled: true }
        - Senao (ambiguo):
          - sendAgentMessage: "Quer cadastrar o produto '{productMentioned}' agora? Responda 'sim' para cadastrar ou 'nao' para continuar sem produto."
          - return { handled: true }
  - [x]4.11 Handler estado `awaiting_product_details`:
        - setState: status → "parsing" (indicador visual)
        - Chamar `callParseProductAPI(content, executionId, productMentioned)`
        - Se sucesso:
          - setState: status → "confirming_product", pendingProduct → result.product
          - sendAgentMessage: generateProductSummary(result.product)
          - return { handled: true }
        - Se erro:
          - setState: status → "awaiting_product_details"
          - sendAgentMessage: "Nao consegui extrair os dados. Tente descrever novamente o produto, incluindo nome, o que faz e para quem."
          - return { handled: true }
  - [x]4.12 Handler estado `confirming_product`:
        - Se `isConfirmation(content)`:
          - Chamar `createProduct(pendingProduct)` (callback do AgentChat)
          - Se sucesso (retorna productId):
            - Atualizar briefing.productSlug = productId
            - setState: status → "confirming", briefing atualizado, pendingProduct → null, productMentioned → null
            - sendAgentMessage: `Produto cadastrado! ${generateBriefingSummary(updatedBriefing)}`
            - return { handled: true }
          - Se falha (null):
            - sendAgentMessage: "Erro ao cadastrar produto. Quer tentar novamente?"
            - setState: status → "awaiting_product_decision"
            - return { handled: true }
        - Se rejeicao:
          - setState: status → "awaiting_product_details", pendingProduct → null
          - sendAgentMessage: "OK, me descreva o produto novamente."
          - return { handled: true }
  - [x]4.13 Reset: limpar `productMentioned` e `pendingProduct` junto com demais campos

- [x] Task 5: Atualizar AgentChat para suportar criacao de produto (AC: #3, #4)
  - [x]5.1 Criar callback `createProduct` em AgentChat:
        ```typescript
        const createProduct = useCallback(
          async (product: CreateProductInput): Promise<string | null> => {
            try {
              const response = await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(product),
              });
              if (!response.ok) return null;
              const result = await response.json();
              return result.data.id;
            } catch {
              return null;
            }
          },
          []
        );
        ```
  - [x]5.2 Passar `createProduct` como 4o argumento ao `processBriefing`:
        ```typescript
        const result = await processBriefing(content, execId, sendAgentMessage, createProduct);
        ```
  - [x]5.3 Importar `CreateProductInput` de `@/types/product`

- [x] Task 6: Unit Tests (AC: #1-#5)
  - [x]6.1 Testes ProductParserService (`__tests__/unit/lib/agent/product-parser-service.test.ts`):
        - Extrai name e description corretamente
        - Features/differentials/targetAudience null quando nao fornecidos
        - Usa productName como fallback para name
        - Valida zod schema (rejeita dados invalidos)
        - Handles OpenAI error
        - Handles timeout (AbortError)
  - [x]6.2 Testes POST /api/agent/briefing/parse-product (`__tests__/unit/api/agent/briefing-parse-product.test.ts`):
        - 401 se nao autenticado
        - 400 se body invalido (executionId nao UUID, message vazio, productName vazio)
        - 404 se execucao nao encontrada
        - 422 se API key OpenAI nao configurada
        - 500 se decriptacao falhar
        - 500 se ProductParserService.parse falhar
        - 200 sucesso retorna { product: ExtractedProduct }
  - [x]6.3 Testes useBriefingFlow produto (`__tests__/unit/hooks/use-briefing-flow.test.tsx` — adicionar novos testes):
        - Produto mencionado mas nao encontrado → awaiting_product_decision
        - Briefing incompleto com produto mencionado → resolve campos primeiro, depois produto
        - Usuario aceita cadastrar → awaiting_product_details + mensagem guia
        - Usuario rejeita cadastrar → confirming sem produto + summary
        - Usuario fornece detalhes → confirming_product + summary do produto
        - Parse product falha → permanece em awaiting_product_details + mensagem erro
        - Usuario confirma produto → produto criado + briefing atualizado + confirming com summary
        - Criacao de produto falha → mensagem erro + awaiting_product_decision
        - Usuario rejeita produto extraido → awaiting_product_details para tentar novamente
        - Fluxo completo: briefing → produto → confirmacao
  - [x]6.4 Testes AgentChat produto (`__tests__/unit/components/agent/AgentChat.test.tsx` — adicionar novos testes):
        - createProduct callback passado ao processBriefing
        - Criacao de produto via POST /api/products (mock fetch)
  - [x]6.5 Testes briefing-parse response estendida (`__tests__/unit/api/agent/briefing-parse.test.ts` — adicionar novos testes):
        - productMentioned retornado quando produto detectado mas nao resolvido
        - productMentioned null quando nenhum produto mencionado

## Dev Notes

### Fluxo Completo Atualizado (com 16.6)

```
1. Usuario abre pagina do agente
   ├── Primeiro uso → AgentOnboarding
   └── Uso recorrente → Placeholder breve

2. Usuario digita primeira mensagem
   → Execucao criada (POST /api/agent/executions) — status: pending
   → Briefing flow inicia

3. Briefing parseado
   ├── Se completo E sem produto pendente:
   │   → confirming (resumo para confirmacao)
   ├── Se completo MAS produto mencionado e NAO encontrado:  ← NOVO
   │   → awaiting_product_decision
   │   → "Nao encontrei o produto X. Quer cadastrar agora?"
   └── Se incompleto:
       → awaiting_fields → perguntas guiadas → re-parse
       → Quando completo: mesma logica de produto acima

4. Cadastro de produto inline (se aplicavel)           ← NOVO
   4a. Usuario aceita cadastrar:
       → awaiting_product_details
       → "Me descreva o produto em linguagem natural..."
       → Usuario descreve → parse-product API → confirming_product
       → "Cadastrei o X: [resumo]. Esta correto?"
       → Usuario confirma → POST /api/products → productSlug atualizado
       → confirming (resumo completo com produto)
   4b. Usuario recusa cadastrar:
       → confirming (resumo sem produto)

5. Briefing confirmado pelo usuario
   → saveBriefing (PATCH /api/agent/executions/[id]/briefing)
   → "Briefing confirmado! Agora escolha o modo..."
   → showModeSelector = true

6. Usuario seleciona modo (Guiado/Autopilot)
   → showExecutionPlan = true

7. Plano de execucao + custo estimado
   → Usuario confirma ou cancela
```

### DECISAO: Produto Inline e Conversacional, NAO um Componente

A arquitetura define: "Produto inline (FR27-29) e interacao conversacional dentro do briefing, nao um PipelineStep". O cadastro ocorre 100% via mensagens de chat — SEM componente inline dedicado (diferente do AgentModeSelector ou AgentExecutionPlan). Razoes:
- O usuario fornece dados em linguagem natural (nao preenche form)
- O agente extrai campos estruturados (OpenAI)
- O fluxo e uma sub-conversacao dentro do briefing
- NAO criar componente AgentProductRegistration — tudo via mensagens

### DECISAO: Deteccao de Produto Antes do Confirming

O fluxo de produto intercepta ANTES de mostrar o resumo do briefing (antes de "confirming"). Se o briefing esta incompleto (faltam technology/jobTitles), resolve campos primeiro via perguntas guiadas, e so depois verifica produto. Isso evita confusao com multiplos fluxos simultaneos.

### DECISAO: productMentioned na BriefingParseResponse

Atualmente a API /briefing/parse retorna `briefing.productSlug` mas NAO o nome do produto mencionado. Quando productSlug e null, o frontend nao sabe SE um produto foi mencionado ou nao. A extensao adiciona `productMentioned: string | null` para distinguir:
- `productMentioned: null, productSlug: null` → usuario nao mencionou produto
- `productMentioned: "TDEC Analytics", productSlug: "uuid"` → produto encontrado
- `productMentioned: "TDEC Analytics", productSlug: null` → produto mencionado MAS nao encontrado → trigger cadastro inline

### DECISAO: processMessage Aceita Callback createProduct

Em vez de fazer fetch diretamente no hook, o createProduct e um callback fornecido pelo AgentChat. Isso mantém o padrao existente: hooks fazem reads (callParseAPI, callParseProductAPI), AgentChat fornece callbacks para writes (sendAgentMessage, createProduct).

### ProductParserService — Padrao

```typescript
// Mesmo padrao exato de BriefingParserService:
// - Classe com metodo static
// - OpenAI gpt-4o-mini
// - response_format: { type: "json_object" }
// - Zod validation do response
// - Timeout 5s via AbortController
// - Constantes no topo do arquivo

export class ProductParserService {
  static async parse(
    message: string,
    productName: string,
    apiKey: string
  ): Promise<ExtractedProduct> {
    // ... identico ao padrao de BriefingParserService
  }
}
```

### API Route parse-product — Padrao

```typescript
// Mesmo padrao exato de /api/agent/briefing/parse:
// - Auth via getCurrentUserProfile
// - Parse body com zod
// - Verificar execucao existe (RLS)
// - Buscar/decriptar API key OpenAI
// - Chamar service
// - Return JSON

export async function POST(request: Request) {
  // ... identico ao padrao de briefing/parse
}
```

### useBriefingFlow — Estados de Produto

```typescript
// Maquina de estados ampliada:
//
// idle → parsing → awaiting_fields → parsing → confirming
//                                                   ↑
// idle → parsing → awaiting_product_decision → awaiting_product_details
//                        ↑                     → confirming_product → confirming
//                        |                              ↓
//                        └──────── (falha criacao) ─────┘
//
// De qualquer estado de produto, rejeicao → confirming (sem produto)
```

### Mensagens do Agente (Textos Exatos)

```typescript
// Deteccao de produto nao encontrado (AC: #1)
`Nao encontrei o produto '${productMentioned}' na base de conhecimento. Quer cadastrar agora? Vou precisar de: nome, descricao, features, diferenciais e publico-alvo.`

// Usuario aceita cadastrar (AC: #2)
`Otimo! Me descreva o produto em linguagem natural. Pode incluir o que ele faz, funcionalidades, diferenciais e para quem e voltado.`

// Resumo para confirmacao (AC: #2)
`Cadastrei o ${product.name} com os seguintes dados:\n- Descricao: ${product.description}\n- Features: ${product.features || 'nao informado'}\n- Diferenciais: ${product.differentials || 'nao informado'}\n- Publico-alvo: ${product.targetAudience || 'nao informado'}\n\nEsta correto?`

// Produto criado com sucesso (AC: #3)
`Produto cadastrado! ${generateBriefingSummary(updatedBriefing)}`

// Erro na extracao (retry)
`Nao consegui extrair os dados. Tente descrever novamente o produto, incluindo nome, o que faz e para quem.`

// Erro na criacao (retry)
`Erro ao cadastrar produto. Quer tentar novamente?`

// Usuario recusa cadastro (AC: #5)
generateBriefingSummary(briefing) // resumo normal sem produto

// Ambiguidade na decisao
`Quer cadastrar o produto '${productMentioned}' agora? Responda 'sim' para cadastrar ou 'nao' para continuar sem produto.`
```

### Imports Existentes que DEVEM ser Reutilizados

| Import | De | Usado em |
|--------|-----|----------|
| `ParsedBriefing` | `@/types/agent` | useBriefingFlow, API routes |
| `createProductSchema`, `CreateProductInput` | `@/types/product` | AgentChat (createProduct callback) |
| `transformProductRow`, `ProductRow` | `@/types/product` | Somente no POST /api/products existente |
| `BriefingParserService` | `@/lib/agent/briefing-parser-service` | Referencia de padrao |
| `getCurrentUserProfile` | `@/lib/supabase/tenant` | API route parse-product |
| `createClient` | `@/lib/supabase/server` | API route parse-product |
| `decryptApiKey` | `@/lib/crypto/encryption` | API route parse-product |
| `AGENT_ERROR_CODES` | `@/types/agent` | ProductParserService (error messages) |
| `BriefingParseResponse` | `@/app/api/agent/briefing/parse/route` | useBriefingFlow (type import) |
| `createMockFetch`, `mockJsonResponse`, etc. | `__tests__/helpers/mock-fetch` | Testes do hook |
| `createChainBuilder` | `__tests__/helpers/mock-supabase` | Testes da API route |

### NAO CRIAR / NAO DUPLICAR

- NAO criar componente AgentProductRegistration — o fluxo e conversacional via mensagens
- NAO criar migration — tabela `products` ja existe
- NAO modificar POST /api/products — ja funciona perfeitamente para criar produtos
- NAO modificar BriefingParserService — o `productMentioned` ja e extraido corretamente
- NAO modificar AgentModeSelector ou AgentExecutionPlan — nao sao afetados
- NAO modificar useAgentStore — estado de produto vive no useBriefingFlow (nao precisa de store global)
- NAO duplicar `createProductSchema` — importar de `@/types/product`
- NAO criar hook separado para produto — o fluxo faz parte do useBriefingFlow

### Learnings da Story 16.5 (APLICAR AQUI)

1. **Race condition execucao**: Hooks devem usar executionId do Zustand store
2. **Mensagens via fetch direto**: `sendAgentMessage` usa fetch direto, nao hook. Manter padrao
3. **Guard execId**: Sempre verificar `if (!execId) return;` antes de usar executionId
4. **Toast para erros**: Usar `toast.error()` do sonner para feedback visual
5. **ESLint no-console**: NAO usar console.log nos componentes/hooks. Apenas nas API routes
6. **RouteParams com Promise**: `params: Promise<{ executionId: string }>` e `await params` (se API route aceitar params)
7. **Classes de Service com metodos static**: Seguir padrao BriefingParserService
8. **Testes mock-fetch**: Usar `createMockFetch` com regex para URL matching
9. **Testes mock-supabase**: Usar `createChainBuilder` para chain de queries
10. **isSubmitting state**: Usar useState local para controlar loading — NAO aplicavel aqui (sem componente inline)

### Padrao de Testes (do projeto)

```typescript
// Service tests (ProductParserService)
import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock OpenAI
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

// API route tests
vi.mock("@/lib/supabase/tenant", () => ({ getCurrentUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/crypto/encryption", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/lib/agent/product-parser-service", () => ({
  ProductParserService: { parse: vi.fn() },
}));

// Hook tests (useBriefingFlow)
// Usar createMockFetch com rotas para /briefing/parse, /briefing/parse-product, /api/products
import { createMockFetch, mockJsonResponse, restoreFetch } from "../../helpers/mock-fetch";

// Component tests (AgentChat)
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

### resolveProduct() — Logica Existente

```typescript
// Em /api/agent/briefing/parse/route.ts (NAO MODIFICAR esta funcao)
async function resolveProduct(
  productMentioned: string | null,
  tenantId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  if (!productMentioned) return null;
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .eq("tenant_id", tenantId);
  if (!products) return null;
  const matches = products.filter((p) =>
    p.name.toLowerCase().includes(productMentioned.toLowerCase())
  );
  return matches.length === 1 ? matches[0].id : null;
}
```

Fuzzy match: retorna ID se exatamente 1 match. Se 0 ou 2+ matches → null → trigger cadastro inline.

### Project Structure Notes

Arquivos a CRIAR:
```
src/
├── lib/agent/
│   └── product-parser-service.ts     (ProductParserService)
└── app/api/agent/briefing/
    └── parse-product/
        └── route.ts                  (POST parse product NL)

__tests__/unit/
├── lib/agent/
│   └── product-parser-service.test.ts
└── api/agent/
    └── briefing-parse-product.test.ts
```

Arquivos a MODIFICAR:
```
src/
├── types/agent.ts                          (ExtractedProduct interface)
├── app/api/agent/briefing/parse/route.ts   (productMentioned na response)
├── hooks/use-briefing-flow.ts              (estados de produto + logica)
└── components/agent/AgentChat.tsx           (createProduct callback)

__tests__/unit/
├── hooks/use-briefing-flow.test.tsx         (testes produto)
├── components/agent/AgentChat.test.tsx      (testes produto)
└── api/agent/briefing-parse.test.ts         (testes productMentioned)
```

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md — Story 16.6 Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md#L1825 — "Produto inline (FR27-29) e interacao conversacional dentro do briefing"]
- [Source: _bmad-output/planning-artifacts/architecture.md#L1462 — Agente TDEC Padroes de Implementacao]
- [Source: _bmad-output/planning-artifacts/architecture.md#L1576 — Agente TDEC Estrutura do Projeto]
- [Source: src/lib/agent/briefing-parser-service.ts — Padrao de service com static methods + OpenAI]
- [Source: src/app/api/agent/briefing/parse/route.ts — resolveProduct + BriefingParseResponse + padrao API]
- [Source: src/hooks/use-briefing-flow.ts — Maquina de estados do briefing flow]
- [Source: src/types/agent.ts — ParsedBriefing, ExtractedProduct target location]
- [Source: src/types/product.ts — createProductSchema, CreateProductInput, Product types]
- [Source: src/app/api/products/route.ts — POST /api/products existente para criar produtos]
- [Source: src/components/agent/AgentChat.tsx — Orquestrador principal, sendAgentMessage, saveBriefing]
- [Source: src/stores/use-agent-store.ts — Zustand store (NAO modificar)]
- [Source: _bmad-output/implementation-artifacts/16-5-plano-de-execucao-estimativa-de-custo.md — Learnings stories anteriores]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Adicionado `productMentioned: string | null` a `BriefingParseResponse` e incluido na construcao da response. 12 testes existentes passando.
- Task 2: Criado `ProductParserService` com metodo `static async parse()`, zod schema `productResponseSchema`, system prompt para extracao de campos de produto de texto livre em portugues. Mesmo padrao de `BriefingParserService`.
- Task 3: Criado API route `POST /api/agent/briefing/parse-product` com auth, validation, execution check, API key decryption, e chamada ao `ProductParserService.parse()`. Mesmo padrao de `/api/agent/briefing/parse`.
- Task 4: Estendido `useBriefingFlow` com 3 novos estados (`awaiting_product_decision`, `awaiting_product_details`, `confirming_product`), helpers `callParseProductAPI`, `generateProductSummary`, `isProductRejection`, e handler `handleParseResult` refatorado para centralizar logica de deteccao de produto. Assinatura de `processMessage` aceita 4o arg `createProduct`.
- Task 5: Adicionado callback `createProduct` no `AgentChat` que chama `POST /api/products`. Passado como 4o argumento ao `processBriefing`.
- Task 6: 91 testes nas 5 test files — 9 testes ProductParserService, 11 testes parse-product API, 14 testes briefing-parse (2 novos), 23 testes useBriefingFlow (12 novos), 34 testes AgentChat (3 novos). Suite completo: 5664 passando, 0 falhas.

### Change Log

- 2026-03-26: Story 16.6 implementada — cadastro de produto inline no briefing flow (6 tasks, 91 testes)
- 2026-03-26: Code Review — 7 issues encontrados e corrigidos (1H, 3M, 3L). 5 testes adicionados. Suite: 5669 passando.

### Senior Developer Review (AI)

**Reviewer:** Amelia (Dev Agent) — 2026-03-26
**Outcome:** Aprovado com correcoes aplicadas

**Issues encontrados e corrigidos:**

| # | Severidade | Descricao | Arquivo | Fix |
|---|-----------|-----------|---------|-----|
| H1 | HIGH | ProductParserService usava BRIEFING_PARSE_ERROR (semanticamente errado) | product-parser-service.ts, agent.ts | Adicionado PRODUCT_PARSE_ERROR ao AGENT_ERROR_CODES, atualizado service e testes |
| M1 | MEDIUM | Conflito de keywords: "nao pode" tratado como confirmacao | use-briefing-flow.ts | Verificar rejection e confirmation independentemente; ambos → ambiguo |
| M2 | MEDIUM | Teste ausente: briefing incompleto + produto mencionado | use-briefing-flow.test.tsx | Adicionado teste que verifica resolve campos antes de checar produto |
| M3 | MEDIUM | productResponseSchema aceitava strings vazias para name/description | product-parser-service.ts | Adicionado .min(1) no schema + 2 testes |
| L1 | LOW | Non-null assertions frageis (state.briefing!, state.productMentioned!) | use-briefing-flow.ts | Substituido por null guards explicitos |
| L2 | LOW | confirming_product sem tratamento de ambiguidade | use-briefing-flow.ts | Adicionado logica de ambiguidade + teste |
| L3 | LOW | Variavel mockFetch nao utilizada em teste | use-briefing-flow.test.tsx | Removida atribuicao |

**Testes adicionados (5):**
- `deve resolver campos faltantes antes de checar produto (briefing incompleto + produto mencionado)` (M2)
- `deve tratar conflito de keywords: 'nao pode' como ambiguo` (M1)
- `deve tratar ambiguidade em confirming_product` (L2)
- `deve rejeitar name vazio via min(1)` (M3)
- `deve rejeitar description vazia via min(1)` (M3)

### File List

**Criados:**
- src/lib/agent/product-parser-service.ts
- src/app/api/agent/briefing/parse-product/route.ts
- __tests__/unit/lib/agent/product-parser-service.test.ts
- __tests__/unit/api/agent/briefing-parse-product.test.ts

**Modificados:**
- src/types/agent.ts (ExtractedProduct interface + PRODUCT_PARSE_ERROR)
- src/app/api/agent/briefing/parse/route.ts (productMentioned na BriefingParseResponse)
- src/hooks/use-briefing-flow.ts (estados de produto + keyword conflict fix + null guards + ambiguidade)
- src/components/agent/AgentChat.tsx (createProduct callback)
- __tests__/unit/hooks/use-briefing-flow.test.tsx (15 testes produto)
- __tests__/unit/components/agent/AgentChat.test.tsx (3 testes produto)
- __tests__/unit/api/agent/briefing-parse.test.ts (2 testes productMentioned)
- __tests__/unit/lib/agent/product-parser-service.test.ts (11 testes — 2 novos min validation)
- __tests__/unit/types/agent.test.ts (atualizado contagem error codes)
