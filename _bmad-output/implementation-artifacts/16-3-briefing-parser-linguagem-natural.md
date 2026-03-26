# Story 16.3: Briefing Parser & Linguagem Natural

Status: done

## Story

As a usuario do Agente TDEC,
I want descrever o que quero prospectar em linguagem natural,
So that o agente interprete meu briefing e extraia os parametros sem eu precisar preencher formularios.

## Acceptance Criteria

1. **Given** o usuario envia uma mensagem como "Quero prospectar CTOs de fintechs em SP que usam Netskope"
   **When** o agente processa o briefing via BriefingParserService
   **Then** os parametros sao extraidos: technology="Netskope", jobTitles=["CTO"], location="Sao Paulo", industry="fintech"
   **And** o agente confirma os parametros interpretados na resposta

2. **Given** o briefing e enviado para a API POST /api/agent/briefing/parse
   **When** o OpenAI structured output (gpt-4o-mini) processa
   **Then** retorna um objeto ParsedBriefing com todos os campos tipados
   **And** a resposta retorna em menos de 5 segundos (NFR3)

3. **Given** o briefing esta incompleto (ex: "Quero prospectar empresas de tecnologia")
   **When** o parser nao consegue extrair cargo, localizacao ou produto
   **Then** o agente faz perguntas guiadas especificas para os campos faltantes
   **And** cada pergunta e clara e contextualizada (ex: "Qual cargo voce quer atingir? Ex: CTOs, Heads de TI...")

4. **Given** o usuario responde as perguntas guiadas
   **When** todos os parametros obrigatorios estao completos
   **Then** o agente apresenta o briefing consolidado para confirmacao
   **And** o usuario pode confirmar ou corrigir antes de prosseguir

5. **Given** o briefing menciona um produto cadastrado na Knowledge Base
   **When** o parser identifica o produto
   **Then** o campo productSlug do ParsedBriefing e preenchido com o slug correto

## Tasks / Subtasks

- [x] Task 1: BriefingParserService (AC: #1, #2)
  - [x] 1.1 Criar `src/lib/agent/briefing-parser-service.ts`
  - [x] 1.2 Implementar prompt de sistema para extracao estruturada (portugues)
  - [x] 1.3 Chamar OpenAI gpt-4o-mini com `response_format: { type: "json_object" }`
  - [x] 1.4 Validar resposta com schema Zod que mapeia para `ParsedBriefing`
  - [x] 1.5 Tratar erros de parsing com fallback para campos null
  - [x] 1.6 Timeout de 10s com AbortController (padrao do projeto)
- [x] Task 2: API Route POST /api/agent/briefing/parse (AC: #2)
  - [x] 2.1 Criar `src/app/api/agent/briefing/parse/route.ts`
  - [x] 2.2 Auth via `getCurrentUserProfile()` (401 se nao autenticado)
  - [x] 2.3 Receber `{ executionId, message }` no body
  - [x] 2.4 Buscar API key OpenAI decriptada do `api_configs` (mesmo padrao de `src/lib/ai/ai-service.ts`)
  - [x] 2.5 Chamar BriefingParserService.parse(message, apiKey)
  - [x] 2.6 Retornar `{ briefing: ParsedBriefing, missingFields: string[], isComplete: boolean }`
  - [x] 2.7 Erro padrao: `{ error: { code, message } }` com mensagens em portugues
- [x] Task 3: Resolucao de produto na Knowledge Base (AC: #5)
  - [x] 3.1 No BriefingParserService, apos parsing, buscar produtos do tenant via Supabase
  - [x] 3.2 Match fuzzy: comparar nome do produto mencionado com `products.name` (case-insensitive, includes)
  - [x] 3.3 Se match unico, preencher `productSlug` com o `id` do produto
  - [x] 3.4 Se multiplos matches ou nenhum, retornar `productSlug: null` e incluir "productSlug" em `missingFields`
- [x] Task 4: Deteccao de campos faltantes e perguntas guiadas (AC: #3)
  - [x] 4.1 Definir campos obrigatorios: `technology` (obrigatorio), `jobTitles` (obrigatorio, default se vazio)
  - [x] 4.2 Definir campos opcionais com defaults: `location` (null = global), `companySize` (null = qualquer), `industry` (null = qualquer)
  - [x] 4.3 Calcular `missingFields` baseado nos obrigatorios nao preenchidos
  - [x] 4.4 Gerar perguntas guiadas em portugues para cada campo faltante, contextualizadas ao briefing parcial
  - [x] 4.5 Retornar `isComplete: false` quando ha campos obrigatorios faltantes
- [x] Task 5: Fluxo de conversa no AgentChat (AC: #3, #4)
  - [x] 5.1 Criar hook `useBriefingFlow` em `src/hooks/use-briefing-flow.ts`
  - [x] 5.2 Estado do fluxo: `idle` | `parsing` | `awaiting_fields` | `confirming` | `confirmed`
  - [x] 5.3 Na primeira mensagem do usuario, chamar POST /api/agent/briefing/parse
  - [x] 5.4 Se `isComplete: false`, inserir mensagem do agente com perguntas guiadas via POST /api/agent/executions/[id]/messages (role: 'agent')
  - [x] 5.5 Nas mensagens subsequentes, re-chamar parse com contexto acumulado (mensagem original + respostas)
  - [x] 5.6 Se `isComplete: true`, inserir mensagem do agente com resumo do briefing para confirmacao
  - [x] 5.7 Detectar confirmacao do usuario ("sim", "confirmo", "ok", "pode ir") e marcar briefing como confirmado
  - [x] 5.8 Detectar correcao do usuario e re-parsear com a correcao aplicada
- [x] Task 6: Atualizar execucao com briefing parseado (AC: #1, #4)
  - [x] 6.1 Criar API PATCH /api/agent/executions/[executionId]/briefing ou reutilizar rota existente
  - [x] 6.2 Ao confirmar briefing, atualizar `agent_executions.briefing` com o ParsedBriefing completo
  - [x] 6.3 Atualizar `agent_executions.status` de `pending` para `running` (ou manter pending ate story 16.5)
- [x] Task 7: Integracao no AgentChat.tsx (AC: #1, #3, #4)
  - [x] 7.1 Importar e usar `useBriefingFlow` no AgentChat
  - [x] 7.2 Interceptar `handleSendMessage` — se briefing nao confirmado, rotear para fluxo de briefing
  - [x] 7.3 Apos confirmacao do briefing, liberar fluxo normal de mensagens (para stories futuras 16.4, 16.5)
  - [x] 7.4 Exibir indicador de typing enquanto API de parsing processa
- [x] Task 8: Testes unitarios (AC: #1-#5)
  - [x] 8.1 Testes do BriefingParserService: parsing completo, parcial, sem dados, timeout, erro OpenAI
  - [x] 8.2 Testes da API route /api/agent/briefing/parse: auth, validacao, sucesso, erro
  - [x] 8.3 Testes do useBriefingFlow hook: estados, transicoes, confirmacao, correcao
  - [x] 8.4 Testes de resolucao de produto: match unico, multiplos, nenhum, case-insensitive
  - [x] 8.5 Testes do AgentChat com fluxo de briefing: interceptacao, perguntas guiadas, confirmacao

## Dev Notes

### Decisao Arquitetural: OpenAI Structured Output

A arquitetura define que o parsing de briefing usa **OpenAI structured output com gpt-4o-mini**. O projeto ja tem o padrao implementado em `src/lib/ai/ai-service.ts` (story 3.4) e `src/lib/utils/relevance-classifier.ts` (story 13.4).

**Padrao a seguir (de ai-service.ts):**
```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
  response_format: { type: 'json_object' },
  temperature: 0.1, // Baixa temperatura para parsing deterministico
});
```

**NAO usar** `createAIProvider()` factory para este caso — o factory e para geracao de texto com streaming. Para structured output JSON, chamar OpenAI SDK diretamente (mesmo padrao de `ai-service.ts` e `relevance-classifier.ts`).

### Prompt de Sistema para o Parser

O prompt deve instruir o modelo a extrair campos do `ParsedBriefing` a partir de texto livre em portugues. Campos a extrair:

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| technology | string \| null | SIM | Tecnologia/ferramenta que as empresas usam (ex: Netskope, AWS, Salesforce) |
| jobTitles | string[] | SIM (default: []) | Cargos-alvo (ex: CTO, Head de TI, CISO) |
| location | string \| null | NAO | Localizacao geografica (ex: Sao Paulo, Brasil, LATAM) |
| companySize | string \| null | NAO | Tamanho da empresa (ex: 50-200, enterprise, startup) |
| industry | string \| null | NAO | Industria/setor (ex: fintech, saude, varejo) |
| productSlug | string \| null | RESOLVIDO DEPOIS | Produto mencionado — resolvido via KB, nao pelo parser |
| mode | 'guided' \| 'autopilot' | NAO (default: guided) | Modo de operacao se mencionado |
| skipSteps | string[] | NAO (default: []) | Etapas a pular se mencionado |

**IMPORTANTE:** O campo `productSlug` NAO deve ser extraido pelo OpenAI. O parser retorna o nome do produto como texto e a resolucao para slug e feita server-side via query na tabela `products`.

### Obtencao da API Key OpenAI

Seguir o padrao existente de `src/lib/ai/ai-service.ts`:
```typescript
// Buscar API key decriptada do tenant
const { data: config } = await supabase
  .from('api_configs')
  .select('decrypted_api_key')
  .eq('tenant_id', profile.tenant_id)
  .eq('provider', 'openai')
  .single();
```
**ATENCAO:** O campo exato pode ser `api_key` ou `decrypted_api_key` dependendo da view. Verificar o padrao em `src/lib/ai/ai-service.ts` antes de implementar.

### Fluxo Conversacional Completo

```
Usuario: "Quero prospectar CTOs de fintechs em SP que usam Netskope"
   |
   v
POST /api/agent/briefing/parse { executionId, message }
   |
   v
BriefingParserService.parse(message, apiKey)
   |-- OpenAI gpt-4o-mini structured output
   |-- Validacao Zod do response
   |-- Resolucao de produto via KB (query products table)
   |
   v
Response: { briefing: ParsedBriefing, missingFields: [], isComplete: true }
   |
   v
Inserir mensagem do agente: "Entendi! Vou prospectar:
  - Tecnologia: Netskope
  - Cargos: CTO
  - Localizacao: Sao Paulo
  - Industria: Fintech
  Confirma?"
   |
   v
Usuario: "Sim" → briefing confirmado → PATCH execution.briefing
```

**Fluxo incompleto:**
```
Usuario: "Quero prospectar empresas de tecnologia"
   |
   v
Response: { briefing: { technology: null, ... }, missingFields: ["technology", "jobTitles"], isComplete: false }
   |
   v
Agente: "Para montar a prospeccao, preciso de mais alguns detalhes:
  1. Qual tecnologia ou ferramenta essas empresas devem usar? (ex: Netskope, AWS, Salesforce)
  2. Quais cargos voce quer atingir? (ex: CTOs, Heads de TI, CISOs)"
   |
   v
Usuario: "Netskope, CTOs" → re-parse com contexto acumulado
```

### Contexto Acumulado para Re-parse

Ao re-parsear apos perguntas guiadas, enviar ao OpenAI o contexto completo:
```
Mensagem original: "Quero prospectar empresas de tecnologia"
Resposta do usuario: "Netskope, CTOs"
```
O parser deve mesclar os dois para extrair: `technology="Netskope"`, `jobTitles=["CTO"]`.

### Padrao de API Route (do projeto)

Todas as API routes seguem este padrao:
```typescript
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Nao autenticado' } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'JSON invalido' } },
      { status: 400 }
    );
  }
  // ... validacao e logica
}
```

### Resolucao de Produto — Padrao Existente

Produtos estao em `src/app/api/products/route.ts` e tipos em `src/types/product.ts`. A query para match:
```typescript
const { data: products } = await supabase
  .from('products')
  .select('id, name')
  .eq('tenant_id', profile.tenant_id);

// Match fuzzy case-insensitive
const productName = briefingResponse.product_mentioned; // nome extraido pelo parser
if (productName) {
  const match = products?.find(p =>
    p.name.toLowerCase().includes(productName.toLowerCase())
  );
  briefing.productSlug = match?.id ?? null;
}
```

### Validacao Zod do Response do OpenAI

Criar schema Zod para validar a resposta do OpenAI antes de confiar:
```typescript
const briefingResponseSchema = z.object({
  technology: z.string().nullable(),
  jobTitles: z.array(z.string()).default([]),
  location: z.string().nullable(),
  companySize: z.string().nullable(),
  industry: z.string().nullable(),
  productMentioned: z.string().nullable(), // nome cru, nao slug
  mode: z.enum(['guided', 'autopilot']).default('guided'),
  skipSteps: z.array(z.string()).default([]),
});
```

### Tipo ParsedBriefing ja Existe

O tipo `ParsedBriefing` ja esta definido em `src/types/agent.ts:73-82`:
```typescript
export interface ParsedBriefing {
  technology: string | null;
  jobTitles: string[];
  location: string | null;
  companySize: string | null;
  industry: string | null;
  productSlug: string | null;
  mode: ExecutionMode;
  skipSteps: string[];
}
```
**NAO recriar este tipo.** Importar de `@/types/agent`.

### AGENT_ERROR_CODES ja Existem

`src/types/agent.ts:124-131` ja define `BRIEFING_PARSE_ERROR`. Usar este codigo nos erros de parsing.

### Dependencia: OpenAI SDK

O projeto ja tem `openai` como dependencia (usado em `src/lib/ai/providers/openai.ts`). NAO instalar novamente.

### Padrao de Testes do Projeto

- **Framework:** Vitest
- **Mocks:** Mock factories centralizadas, `vi.mock()` para modulos
- **Supabase mock:** Seguir padrao de chain builder (`mockSupabase.from().select().eq().single()`)
- **OpenAI mock:** `vi.mock('openai')` com mock do `chat.completions.create`
- **Sem console.log:** ESLint enforces no-console
- **Localizacao:** `__tests__/unit/` espelhando a estrutura de `src/`

### Project Structure Notes

Novos arquivos a criar:
```
src/
├── lib/agent/
│   └── briefing-parser-service.ts   ← NOVO: servico de parsing
├── app/api/agent/
│   └── briefing/parse/
│       └── route.ts                  ← NOVO: API route
├── hooks/
│   └── use-briefing-flow.ts          ← NOVO: hook do fluxo conversacional

__tests__/unit/
├── lib/agent/
│   └── briefing-parser-service.test.ts  ← NOVO
├── api/agent/
│   └── briefing-parse.test.ts           ← NOVO
├── hooks/
│   └── use-briefing-flow.test.tsx       ← NOVO
├── components/agent/
│   └── AgentChat.test.tsx               ← MODIFICAR (adicionar testes de briefing flow)
```

Arquivos a modificar:
```
src/components/agent/AgentChat.tsx   ← Integrar useBriefingFlow
```

### Learnings das Stories Anteriores (16.1, 16.2)

**Da Story 16.1:**
- RLS policies usam `public.get_current_tenant_id()` (NAO `auth.jwt()`)
- Usar shadcn `<Input>` para inputs (nao HTML nativo)
- Todas as mensagens de erro em portugues

**Da Story 16.2:**
- `useSendMessage` passa `executionId` via mutate params para evitar race condition com Zustand
- Query key para messages usa `useMemo` para evitar re-renders
- Deduplicacao de mensagens temporarias feita por ID no `onSuccess`
- Toast de erro com `sonner` para feedback de falha de criacao de execucao
- Realtime subscription no canal `agent-messages-${executionId}` com filtro `execution_id=eq.${executionId}`
- `isAgentProcessing` desligado quando chega mensagem com role 'agent' ou 'system'

**CRITICO — Race condition na criacao de execucao:**
O `AgentChat.tsx` cria execucao automaticamente na primeira mensagem. O `useBriefingFlow` deve usar o `executionId` do Zustand store (via `useAgentStore`) e NAO criar execucao duplicada.

### Git Intelligence

Ultimos commits relevantes:
- `80c16eb` feat(story-16.1): data models, tipos e pagina do agente + code review fixes
- `9a11a95` feat(story-16.2): sistema de mensagens do chat com realtime + code review fixes (se no branch)

Branch atual: `epic/16-agent-foundation-briefing-conversacional`

### References

- [Source: _bmad-output/planning-artifacts/epics-agente-tdec.md#Story 16.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Parsing de Briefing]
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent TDEC]
- [Source: src/types/agent.ts#ParsedBriefing]
- [Source: src/lib/ai/ai-service.ts#OpenAI structured output pattern]
- [Source: src/lib/utils/relevance-classifier.ts#JSON response_format pattern]
- [Source: src/app/api/products/route.ts#Product CRUD]
- [Source: src/types/product.ts#ProductRow]
- [Source: _bmad-output/implementation-artifacts/16-2-sistema-de-mensagens-do-chat.md#Code Review Fixes]
- [Source: _bmad-output/implementation-artifacts/16-1-data-models-tipos-e-pagina-do-agente.md#Code Review Fixes]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Todos os 5504 testes passaram (315 arquivos) — zero regressoes
- 41 testes novos adicionados para story 16.3

### Completion Notes List
- Task 1: BriefingParserService criado com OpenAI gpt-4o-mini, response_format json_object, Zod validation, AbortController timeout 10s
- Task 2: API Route POST /api/agent/briefing/parse com auth, Zod body validation, decryption de API key, error handling em portugues
- Task 3: Resolucao de produto via match fuzzy case-insensitive na tabela products do tenant
- Task 4: Deteccao de campos obrigatorios (technology, jobTitles) e geracao de perguntas guiadas contextualizadas
- Task 5: Hook useBriefingFlow com maquina de estados (idle -> parsing -> awaiting_fields/confirming -> confirmed), contexto acumulado para re-parse, deteccao de confirmacao/correcao
- Task 6: API PATCH /api/agent/executions/[executionId]/briefing para persistir briefing confirmado
- Task 7: AgentChat integrado com useBriefingFlow — intercepta mensagens, roteia para fluxo de briefing, salva briefing apos confirmacao, typing indicator durante parsing
- Task 8: 41 testes unitarios cobrindo parsing, API routes, hook states/transitions, resolucao de produto, integracao AgentChat

### Post-Implementation Fixes (CRITICO — nao reverter no Code Review)

**Fix A — Rota de mensagens rejeitava role "agent" (bloqueava resposta do agente no chat)**
- **Arquivo:** `src/app/api/agent/executions/[executionId]/messages/route.ts`
- **Problema:** Validacao `if (role && role !== "user")` retornava 400 para qualquer role != "user", impedindo que o fluxo de briefing (story 16.3) inserisse mensagens do agente via API.
- **Correcao:** Substituido por whitelist `["user", "agent", "system"]`. Role default continua "user". Roles invalidos (ex: "admin") ainda retornam 400.
- **Teste atualizado:** `__tests__/unit/api/agent-messages.test.ts` — teste antigo "should return 400 when role is not user" renomeado para "should return 400 when role is invalid" (testa role "admin"), novo teste "should accept agent role" adicionado.

**Fix B — Mensagem do usuario enviada em duplicata quando parse falhava**
- **Arquivo:** `src/components/agent/AgentChat.tsx`
- **Problema:** Dentro do bloco `if (briefingState.status !== "confirmed")`, a mensagem do usuario era enviada via `sendMessageMutation.mutate()` no inicio. Se `result.handled === false` (API de parse falhava), o fluxo nao retornava e caia no `sendMessageMutation.mutate()` final, duplicando a mensagem.
- **Correcao:** Adicionado `return` incondicional apos o bloco de briefing — mensagem ja foi enviada, nunca cai no envio final. O `sendMessageMutation.mutate()` final so executa quando `briefingState.status === "confirmed"` (fluxo normal pos-briefing).

### Code Review Fixes (2026-03-26)

**H1 — Bug resolucao de produto: multiplos matches retornava primeiro ao inves de null**
- **Arquivo:** `src/app/api/agent/briefing/parse/route.ts`
- **Fix:** Trocado `.find()` por `.filter()` + check `length === 1`. Multiplos matches agora retornam `null` conforme Task 3.4.

**H2 — AgentChat.test.tsx sem testes de briefing flow (Task 8.5)**
- **Arquivo:** `__tests__/unit/components/agent/AgentChat.test.tsx`
- **Fix:** Adicionados 7 testes: interceptacao briefing, criacao execucao, confirmacao+save, fluxo normal pos-briefing, erro criacao execucao, erro sendAgentMessage, erro saveBriefing.

**M1 — sendAgentMessage engolia erros silenciosamente**
- **Arquivo:** `src/components/agent/AgentChat.tsx`
- **Fix:** Adicionado check `response.ok` + `toast.error()` para feedback ao usuario.

**M2 — saveBriefing engolia erros silenciosamente**
- **Arquivo:** `src/components/agent/AgentChat.tsx`
- **Fix:** Adicionado check `response.ok` + `toast.error()` para feedback ao usuario.

**M4 — executionId no parse route nunca validado contra DB**
- **Arquivo:** `src/app/api/agent/briefing/parse/route.ts`
- **Fix:** Adicionada query de verificacao em `agent_executions` antes de chamar OpenAI. Retorna 404 se execucao nao existe.

**L1 — Mutacao direta do retorno de BriefingParserService**
- **Arquivo:** `src/app/api/agent/briefing/parse/route.ts`
- **Fix:** Criado novo objeto `resolvedBriefing` com spread ao inves de mutar `briefing.productSlug`.

**L2 — Non-null assertions (execId!) no AgentChat**
- **Arquivo:** `src/components/agent/AgentChat.tsx`
- **Fix:** Adicionado guard `if (!execId) return;` apos bloco de criacao. Removidos todos `!` assertions.

**L3 — Timeout 10s vs NFR3 < 5s**
- **Arquivo:** `src/lib/agent/briefing-parser-service.ts`
- **Fix:** `PARSER_TIMEOUT_MS` alterado de 10000 para 5000ms conforme NFR3.

### Change Log
- 2026-03-26: Story 16.3 implementada — Briefing Parser & Linguagem Natural
- 2026-03-26: Fix A — rota de mensagens aceita role "agent"/"system" para respostas do agente
- 2026-03-26: Fix B — corrigido envio duplicado de mensagem quando parse API falhava
- 2026-03-26: Code Review — 8 issues corrigidos (2 HIGH, 3 MEDIUM, 3 LOW), 10 testes novos adicionados

### File List
**Novos:**
- src/lib/agent/briefing-parser-service.ts
- src/app/api/agent/briefing/parse/route.ts
- src/app/api/agent/executions/[executionId]/briefing/route.ts
- src/hooks/use-briefing-flow.ts
- __tests__/unit/lib/agent/briefing-parser-service.test.ts
- __tests__/unit/api/agent/briefing-parse.test.ts
- __tests__/unit/api/agent/briefing-update.test.ts
- __tests__/unit/hooks/use-briefing-flow.test.tsx

**Modificados:**
- src/components/agent/AgentChat.tsx
- src/app/api/agent/executions/[executionId]/messages/route.ts (aceitar role agent/system)
- __tests__/unit/components/agent/AgentChat.test.tsx
- __tests__/unit/api/agent-messages.test.ts (ajustar teste de role + adicionar teste role agent)
