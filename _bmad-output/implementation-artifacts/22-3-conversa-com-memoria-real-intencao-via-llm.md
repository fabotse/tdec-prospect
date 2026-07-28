---
baseline_commit: 1c35f8dbfeb3f8e646c937fc9a8cd5ecb2a83a3d
---

# Story 22.3: Conversa com Memória Real & Intenção via LLM

Status: done
<!-- Code review COMPLETO (2026-07-20): 3 patches aplicados, código aprovado. Smoke manual dos
     3 cenários em /agent FEITO pela interface real (Playwright, LLM real, logado Fabossi): 3/3
     passaram. Story FECHADA. -->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want que o agente entenda minhas respostas em linguagem natural e lembre do contexto da conversa,
so that eu não precise usar palavras mágicas nem repetir o que já disse.

## Contexto do Épico (por que esta story existe)

Diagnóstico central do plano de melhorias (2026-07-16): o agente hoje é **slot-filling com pele de
chat**. Cada turno é uma chamada isolada ao LLM que **só recebe a concatenação dos textos do
usuário** ([`use-briefing-flow.ts:648,692`](../../src/hooks/use-briefing-flow.ts#L648) —
`messageHistoryRef.current.join("\n")`), **sem** as perguntas/resumos que o próprio agente enviou.
O LLM não tem memória da conversa: ele nunca vê "Confirma: CTO em SP?" antes de receber "sim, mas
troca pra CFO". Por cima disso, **confirmação e correção são decididas por listas de keywords
frágeis** (`CONFIRMATION_KEYWORDS`, `isConfirmation`) — "manda bala" ou "pode seguir assim" não
batem com nenhuma keyword e o fluxo trava.

Esta story (FR5 + FR6, **Frente B — conversa inteligente**) ataca isso em duas frentes:

1. **Memória real (FR5):** o cliente passa a enviar o **histórico estruturado** (`{role, content}[]`
   — mensagens do usuário **e** do agente) para o parser, que monta a conversa completa para o LLM.
2. **Intenção via LLM (FR6):** o parser passa a devolver `nextAction` (`ask` | `confirm` |
   `proceed` | `register_product` | `import_leads`) e `questionText` (pergunta/confirmação em
   linguagem natural). A máquina de estados do `use-briefing-flow` **reage ao `nextAction`** em vez
   de casar keywords. As keywords **permanecem como fallback** quando o LLM falha/timeout
   (fail-open, NFR2).

Esta é a **terceira story do Epic 22** e é **independente da 22.1/22.2**. A **22.4 depende desta**
(usa `nextAction` para disparar os sub-fluxos de produto/leads). **Escopo cirúrgico:** esta story
introduz `nextAction`/`questionText` e a memória; ela **NÃO** re-arquiteta os sub-fluxos de produto
e leads (isso é a 22.4) nem toca no pipeline de execução (NFR1).

## Acceptance Criteria

1. **Given** uma conversa em andamento **When** o cliente chama `POST /api/agent/briefing/parse`
   **Then** envia o histórico como mensagens estruturadas (`messages: {role, content}[]`, onde a
   última é a mensagem atual do usuário) **And** o `BriefingParserService` monta a conversa completa
   para o LLM (system prompt + histórico mapeado para `user`/`assistant`), substituindo a
   concatenação com `\n` de [`use-briefing-flow.ts:648,692`](../../src/hooks/use-briefing-flow.ts#L648).
   **And** o body legado `{ message: string }` continua aceito pelo route e pelo service (back-compat / fail-open).
2. **Given** a resposta do parser **Then** ela inclui `nextAction: "ask" | "confirm" | "proceed" |
   "register_product" | "import_leads"` e `questionText: string | null` (pergunta/confirmação em
   linguagem natural gerada pelo LLM) **And** o `briefingResponseSchema` (Zod) valida os campos novos
   com defaults (`nextAction` default `"ask"`, `questionText` default `null`) **And** ambos aparecem
   em `BriefingParseResponse`.
3. **Given** o estado `confirming` **When** o usuário confirma com frase livre (ex.: "perfeito,
   manda bala") **Then** o parser retorna `nextAction: "proceed"` (ou `"confirm"`) e o fluxo
   transiciona para `confirmed` — **sem** depender de `CONFIRMATION_KEYWORDS` **And** correção
   parcial (ex.: "sim, mas troca o cargo pra CFO") retorna o briefing corrigido (`jobTitles=["CFO"]`)
   via memória do LLM, o resumo é **re-apresentado** e o estado permanece `confirming`.
4. **Given** falha ou timeout do LLM no caminho `confirming`/`awaiting_fields` **Then** o fluxo
   degrada para o comportamento determinístico atual (keyword `isConfirmation` como fallback —
   fail-open, NFR2): "sim"/"ok"/"bora" ainda confirmam; texto não-confirmador mantém o estado
   **And** o caminho feliz responde em < 5s (o timeout do parser continua 5s).
5. **Given** a máquina de estados do `use-briefing-flow` **Then** os estados de pergunta/confirmação
   passam a reagir ao `nextAction` (estrutura preservada — mesmos status; a **decisão** de confirmar
   vs. perguntar vs. corrigir move para o LLM) **And** o gating determinístico `canProceed` (cargo +
   localização, Story 22.1) **sempre prevalece** sobre o `nextAction` do LLM: com `canProceed=false`
   o agente **sempre** pergunta, independentemente do que o LLM sugerir (NFR1).
6. Testes unitários: histórico estruturado enviado ao route/service; `nextAction` em cada ramo
   (`ask` → `awaiting_fields`; `confirm` com `canProceed` → `confirming`; `proceed` em `confirming`
   → `confirmed`); confirmação livre sem keyword; correção parcial re-apresenta resumo; fallback de
   timeout (keyword confirma); schema valida `nextAction`/`questionText`.

## Tasks / Subtasks

- [x] **Task 1 — Schema e prompt do parser: `nextAction` + `questionText` + histórico** (AC: #1, #2, #5)
  - [x] Em [`briefing-parser-service.ts`](../../src/lib/agent/briefing-parser-service.ts): estender `briefingResponseSchema` com:
    - `nextAction: z.enum(["ask","confirm","proceed","register_product","import_leads"]).default("ask")`
    - `questionText: z.string().nullable().default(null)`
    - Mantenha **todos** os campos atuais (`technology`, `jobTitles`, `location`, `companySize`, `industry`, `productMentioned`, `mode`, `skipSteps`) intactos.
  - [x] Mudar a assinatura de `BriefingParserService.parse` para aceitar **histórico OU string** (back-compat): `parse(input: string | ChatTurn[], apiKey)` onde `ChatTurn = { role: "user" | "agent" | "system"; content: string }`. Normalize internamente: string → `[{ role: "user", content: input }]`.
    - Montar `messages` da OpenAI: `{ role: "system", content: SYSTEM_PROMPT }` seguido do histórico mapeado — `role === "user"` → `"user"`, caso contrário (`agent`/`system`) → `"assistant"`. **Não** injete o system prompt no meio do histórico; ele é sempre o primeiro item.
    - `ParseResult` ganha os campos novos no `rawResponse`; adicione `nextAction` e `questionText` ao objeto retornado (o `briefing` **não** carrega esses campos — eles são de conversa, não de pipeline).
  - [x] Estender o `SYSTEM_PROMPT` (preservando **toda** a lógica atual da 22.1 — tech opcional, skip determinístico, "correção mais recente prevalece") com uma seção nova ensinando o LLM a decidir `nextAction` e escrever `questionText` em **PT-BR natural**:
    - `"ask"`: falta cargo ou localização (parâmetros primários) → `questionText` = pergunta natural pelo que falta. **Nunca** exija tecnologia (regra 22.1).
    - `"confirm"`: já há cargo + localização e o agente está apresentando/re-apresentando o resumo para o usuário confirmar (inclusive após aplicar uma correção).
    - `"proceed"`: o usuário, **diante de um resumo já apresentado**, autoriza claramente iniciar (ex.: "pode mandar", "bora", "manda bala", "isso, segue"). Só use `proceed` quando houver confirmação inequívoca de um resumo prévio no histórico.
    - `"register_product"`: o usuário quer cadastrar um produto não encontrado (a 22.4 fará o disparo; aqui só devolva o rótulo).
    - `"import_leads"`: o usuário indica ter leads próprios (a 22.4 fará o disparo; aqui só devolva o rótulo).
    - `questionText`: a mensagem exata a exibir (pergunta ou confirmação natural), PT-BR; `null` quando não houver.
  - [x] Preservar o timeout de 5s (`PARSER_TIMEOUT_MS`), `temperature: 0.1`, `response_format: json_object`, o `AbortController` e o mapeamento de erro para `AGENT_ERROR_CODES.BRIEFING_PARSE_ERROR`.

- [x] **Task 2 — Route aceita histórico e devolve os campos novos** (AC: #1, #2, #5)
  - [x] Em [`parse/route.ts`](../../src/app/api/agent/briefing/parse/route.ts): estender `parseRequestSchema` para aceitar **`messages: {role,content}[]` (novo, preferido) OU `message: string` (legado)**:
    ```ts
    const chatTurnSchema = z.object({
      role: z.enum(["user", "agent", "system"]),
      content: z.string().min(1),
    });
    const parseRequestSchema = z.object({
      executionId: z.string().uuid(),
      messages: z.array(chatTurnSchema).min(1).optional(),
      message: z.string().min(1).optional(),
    }).refine((d) => (d.messages?.length ?? 0) > 0 || !!d.message, {
      message: "Forneca messages[] ou message",
    });
    ```
    Construa o input do parser: `const history = validation.data.messages ?? [{ role: "user", content: validation.data.message! }]` — **atenção ao `no-non-null-assertion`** (Project Memory): use `validation.data.message ?? ""` guardado pelo `.refine`, ou reestruture para evitar o `!`.
  - [x] Passar `history` para `BriefingParserService.parse(history, apiKey)`.
  - [x] Adicionar `nextAction` e `questionText` (do `rawResponse`/retorno do parser) ao objeto `BriefingParseResponse` retornado. Interface `BriefingParseResponse` ganha `nextAction: NextAction` e `questionText: string | null`.
  - [x] **PRESERVAR intacta** a canonicalização determinística de `skipSteps` ([route.ts:226-247](../../src/app/api/agent/briefing/parse/route.ts#L226-L247)) e o `analyzeBriefingCompleteness`/`canProceed` (22.1). O `nextAction` do LLM **não** altera `skipSteps`, `canProceed` nem `missingFields` — esses continuam 100% determinísticos (NFR1). Comentário adicionado no route deixando claro que `canProceed` prevalece sobre `nextAction` no cliente.

- [x] **Task 3 — Hook: histórico estruturado + reação ao `nextAction`** (AC: #1, #3, #4, #5)
  - [x] Em [`use-briefing-flow.ts`](../../src/hooks/use-briefing-flow.ts): trocar `messageHistoryRef: useRef<string[]>` por `conversationRef: useRef<ChatTurn[]>` (`ChatTurn = { role: "user" | "agent"; content: string }`). Zerar no `idle`/primeira mensagem e no `reset()`.
  - [x] Registrar **as duas pontas** da conversa no `conversationRef`:
    - Toda mensagem do usuário processada no caminho de parsing (idle / awaiting_fields / confirming) → `push({ role: "user", content })` **antes** de chamar a API.
    - Toda mensagem do agente enviada **no caminho de briefing/parse** → registrar `{ role: "agent", content }`. Criado o helper interno `sendAndRecord(executionId, content, sendAgentMessage)` que faz `conversationRef.current.push({ role: "agent", content })` e então `await sendAgentMessage(...)`. Usado em `handleParseResult` (perguntas/resumos). Os sub-fluxos de produto/leads seguem usando `sendAgentMessage` direto (não registrados — inócuo, 22.4).
  - [x] `callParseAPI(executionId)` passa a enviar `{ executionId, messages: conversationRef.current }` (o array já termina na mensagem atual do usuário). Removidos o parâmetro `message: string` e o `join("\n")`.
  - [x] `handleParseResult` reage ao `nextAction` + `canProceed`, **preservando** as ramificações de produto e leads existentes (elas continuam disparando por `productMentioned`/`skipSteps` — 22.4 as moverá para `nextAction`):
    - imported-leads flow (`isImportedLeadsFlow`) → `awaiting_leads_input` (**inalterado**, checado primeiro).
    - `!result.canProceed` → `awaiting_fields`; pergunta = `result.questionText ?? generateSmartQuestions(...)` (D3: gating determinístico prevalece — product só é checado dentro do ramo `canProceed=true`, preservando 17.8 "resolver campos antes de checar produto").
    - `productMentioned && productSlug === null` (dentro de `canProceed`) → `awaiting_product_decision` (**inalterado**).
    - senão (`canProceed`) → `confirming`; **sempre** apresenta o resumo determinístico `generateBriefingSummary(briefing, missingFields)` (D1: transparência).
  - [x] Reescrever o handler do estado **`confirming`**:
    - `push({ role: "user", content })`; `setState(parsing)`; `callParseAPI`.
    - No sucesso: `result.nextAction === "proceed"` **e** `result.canProceed` (NFR1) → `confirmed`. Senão (`confirm`/`ask`/correção) → `handleParseResult` (aplica o `result.briefing` e re-apresenta). Ver D2.
    - No `catch` (LLM falhou/timeout) — **fail-open (AC4)**: `isConfirmation(content)` sobre a mensagem crua; confirmar → `confirmed`; senão → `confirming` + `{ handled: false }`.
  - [x] `awaiting_fields`: mantido o atalho `isHelpRequest`/`isTechnologyHelpRequest` **como está** (fast-path determinístico via `sendAgentMessage` direto). No re-parse, usa `conversationRef`. No `catch`, mantém `awaiting_fields` + `{ handled: false }`.
  - [x] `idle`: `conversationRef.current = [{ role: "user", content }]`; `callParseAPI`; `handleParseResult`. `catch` → reset para `idle` + zera `conversationRef`.

- [x] **Task 4 — Fios finais e tipos** (AC: #2, #5)
  - [x] `ChatTurn` e `NextAction` exportados de [`src/types/agent.ts`](../../src/types/agent.ts) (junto de `MessageRole`). Reusados em service, route e hook — sem duplicar a string-union.
  - [x] [`AgentChat.tsx`](../../src/components/agent/AgentChat.tsx): **verificado** — `processBriefing(content, execId, sendAgentMessage, createProduct)` **não muda de assinatura** (o hook cuida do histórico internamente via `conversationRef`). Nada quebra; fluxo pós-confirmação (mode selector / plano) intacto.
  - [x] Memória **within-session** confirmada (`conversationRef` in-memory; refresh reseta para `idle`). Consistente com a Story 22.8 (AC4). Nenhuma persistência de histórico adicionada.

- [x] **Task 5 — Testes** (AC: #6)
  - [x] **`briefing-parser-service.test.ts`**: (a) `parse` com **array** monta `messages` = system + user/assistant/user na ordem; (b) string (back-compat) → 1 user message, sem assistant; (c) schema aplica defaults (`ask`/`null`) e valida valores explícitos; (d) `nextAction` inválido é rejeitado (`BRIEFING_PARSE_ERROR`) + retorno expõe `nextAction`/`questionText` (não vazam para `briefing`).
  - [x] **`briefing-parse.test.ts`** (route): (a) body `{ messages: [...] }` → `parse` com o array + resposta com `nextAction`/`questionText`; (b) body legado `{ message }` → `parse([{role:"user",content}])`; (c) sem `messages` nem `message` → 400; (d) **regressão**: `skipSteps`/`canProceed` determinísticos mesmo com `nextAction:"proceed"` do LLM.
  - [x] **`use-briefing-flow.test.tsx`**:
    - **Núcleo memória (RED→GREEN):** 2º fetch para `/parse` carrega `messages` com role `agent` + última msg do usuário; `message` string ausente.
    - `nextAction:"proceed"` no `confirming` ("segue o baile", sem keyword) → `confirmed`.
    - Correção parcial: "na verdade troca o cargo pra CFO" + `nextAction:"confirm"` → `confirming`, `jobTitles=["CFO"]`, resumo re-apresentado.
    - `nextAction:"ask"` + `canProceed:false` → `awaiting_fields`, usa `questionText` verbatim.
    - **Fallback timeout (AC4):** parse rejeita + "sim" → `confirmed`; parse rejeita + não-confirmadora → `confirming`, `handled:false`.
    - **Regressão:** produto (16.6), imported-leads (17.11), 22.1 verdes; 3 provas de confirmação adaptadas para `nextAction:"proceed"`.
  - [x] Helpers de mock: `nextAction:"proceed"` injetado nas provas de confirmação; demais confiam nos defaults/fallback.

- [x] **Task 6 — Validação final**
  - [x] `npx vitest run` (suíte inteira) = **395 files / 6847 pass / 2 skip / 0 fail** (baseline 22.8 ~6813; +34 testes; zero regressão). `npx tsc --noEmit` = 0 diagnostics **nos 4 arquivos tocados** (diagnostics pré-existentes em `__tests__/`/migrations fora de escopo). `npx eslint --max-warnings=0` limpo nos 7 arquivos tocados (service, route, hook, types + 3 testes).
  - [x] **Smoke manual** em `http://localhost:3000/agent` — **FEITO 2026-07-20** pela interface real (Playwright + LLM real gpt-4o-mini, logado Fabossi; skill `verify`). **3/3 cenários passaram:** (a) **memória** — "quero prospectar CTOs" → pergunta localização → "em São Paulo" → resumo (CTO+SP) → "na verdade troca o cargo pra CFO" → **resumo re-apresentado com CFO, localização SP preservada, sem re-perguntar** (LLM leu o histórico completo); (b) **confirmação livre** — diante do resumo (Diretor de RH + Curitiba), "beleza, prossiga com essa busca" (**sem NENHUMA keyword de confirmação** — só o `nextAction:proceed` do LLM real pode confirmar) → **"Briefing confirmado!" + mode selector**; (c) **guard/keyword** — "sim" diante do resumo → **confirmado + mode selector**. Parado no approval gate (mode selector) — **não** clicado Confirmar/Iniciar Execução (guardrail de custo). Único erro de console = hydration mismatch PRE-EXISTENTE do submenu Leads da Sidebar (gotcha documentado, não-relacionado). **NOTA OPERACIONAL:** durante o smoke, a instância ANTIGA do dev server (rodando desde antes da sessão) estava em estado corrompido (500 em `/executions/{id}/messages` e `/steps`, rotas que a 22.3 não toca) após muitos Fast Refresh; **restart do dev server resolveu** — não é defeito da 22.3.

## Dev Notes

### DEV AGENT GUARDRAILS — o que NÃO quebrar

- **NFR1 — pipeline 100% determinístico:** o `nextAction` do LLM é **exclusivamente sobre a CONVERSA** (perguntar / confirmar / prosseguir). Ele **não** decide `skipSteps`, `canProceed`, `missingFields`, ordem de steps, gasto de crédito nem envio. Toda a canonicalização de `skipSteps` ([route.ts:226-247](../../src/app/api/agent/briefing/parse/route.ts#L226-L247)) e o `analyzeBriefingCompleteness` (22.1) ficam **intactos e determinísticos**. **Regra de ouro:** `canProceed=false` ⇒ o agente **sempre pergunta**, mesmo que o LLM diga `proceed`/`confirm`.
- **NFR2 — fail-open + < 5s:** qualquer falha/timeout do parser **degrada** para o comportamento determinístico de hoje (keyword `isConfirmation` no `confirming`; `generateSmartQuestions` nas perguntas). Nenhum turno pode ficar sem resposta por causa do LLM. O timeout de 5s (`PARSER_TIMEOUT_MS`) permanece.
- **NFR4 — zero regressão:** 16.6 (produto inline), 17.10 (entrada direta), 17.11 (leads próprios) e 22.1/22.2 continuam funcionando. Os estados do `use-briefing-flow` **não mudam de nome nem de conjunto**; só a **decisão** de transição no `confirming`/`awaiting_fields` passa a consultar o LLM (com keyword de fallback).
- **NFR5 — zero migration:** nada de schema de banco. `nextAction`/`questionText` são campos de **resposta de API**, efêmeros; não são persistidos no `briefing` JSONB nem em coluna nova.
- **Escopo — NÃO faça a 22.4 aqui:** esta story **introduz** os valores `register_product`/`import_leads` no enum de `nextAction` (para a 22.4 construir por cima), mas **NÃO** re-arquiteta os sub-fluxos. Os disparos de produto (`productMentioned`) e leads (`skipSteps`) continuam **exatamente** como hoje. Aposentar `PRODUCT_REJECTION_KEYWORDS`/frases-gatilho é trabalho da 22.4.
- **Memória é within-session:** o `conversationRef` é in-memory. Refresh reseta o flow para `idle` — **consistente** com a Story 22.8 (AC4). Não persista histórico de conversa nesta story.

### A mudança em uma frase

Hoje o parser recebe só a colagem dos textos do usuário e o hook decide confirmar/corrigir por
keywords. Depois desta story: o parser recebe a **conversa inteira** (usuário **e** agente) e devolve
**`nextAction` + `questionText`**; o hook **reage ao `nextAction`** (com keyword só como rede de
segurança), então "manda bala" confirma e "troca pra CFO" corrige — sem palavras mágicas.

### Decisões de design (leia antes de codar)

- **D1 — `questionText` vs. `generateBriefingSummary` no ramo `confirm`:** no ramo `canProceed`
  (apresentar resumo), **use o `generateBriefingSummary` determinístico**, não o `questionText` do
  LLM. Motivo: o resumo precisa listar os parâmetros **exatos** que vão rodar (transparência antes
  da execução — valor central do épico). O `questionText` do LLM é usado no ramo **`ask`** (perguntas
  naturais), com `generateSmartQuestions` como fallback. Isso honra o AC2 (questionText existe e é
  usado nas perguntas) **e** preserva a transparência do resumo.
- **D2 — `proceed` vs. `confirm` no estado `confirming`:** trate `nextAction === "proceed"` como
  confirmação final (→ `confirmed`). Trate `"confirm"` e `"ask"` como "ainda conversando" (aplica
  correção do `result.briefing` e re-apresenta o resumo, permanecendo em `confirming`). Justificativa:
  o `handleParseResult` **sempre** apresenta o resumo ao entrar em `canProceed` (nunca pula direto
  para `confirmed`), garantindo que o usuário veja os parâmetros ao menos uma vez antes de executar.
  A transição para `confirmed` só acontece quando o usuário, **diante do resumo**, autoriza (proceed).
- **D3 — reconciliação `canProceed` × `nextAction`:** no `handleParseResult`, cheque `canProceed`
  **primeiro**. Só consulte `nextAction` dentro do ramo `canProceed=true`. Com `canProceed=false`,
  vá para `awaiting_fields` independentemente do `nextAction` (o LLM não pode "prosseguir" sem os
  campos obrigatórios). Isso mantém o gating determinístico (NFR1).
- **D4 — mapeamento de roles para a OpenAI:** `user` → `"user"`; `agent` e `system` → `"assistant"`.
  O system prompt do parser é sempre o primeiro item e é **separado** do histórico. Não confunda o
  `MessageRole` do banco (`user`/`agent`/`system`) com os roles da OpenAI (`system`/`user`/`assistant`).

### Fluxo end-to-end (siga esta cadeia)

1. **Usuário digita** → `AgentChat.handleSendMessage` → `processBriefing(content, execId, sendAgentMessage, createProduct)`.
2. **Hook** (`use-briefing-flow`): registra `{role:"user", content}` no `conversationRef`; chama `POST /parse` com `{ executionId, messages: conversationRef.current }`.
3. **Route** (`parse/route.ts`): valida, resolve produto/skipSteps **determinístico**, chama `BriefingParserService.parse(history, apiKey)`, devolve `BriefingParseResponse` com `briefing`, `canProceed`, `missingFields`, `suggestions`, **`nextAction`**, **`questionText`**.
4. **Service** (`briefing-parser-service`): monta `messages` OpenAI (system + histórico), 1 chamada `gpt-4o-mini` (5s timeout), valida com Zod, devolve briefing + `nextAction`/`questionText`.
5. **Hook** reage: `handleParseResult`/`confirming` decidem o próximo estado por `nextAction` + `canProceed`; a mensagem do agente é enviada por `sendAndRecord` (que também registra `{role:"agent"}` no histórico, fechando o loop de memória).

### Estado atual dos arquivos-chave (leia antes de editar)

- **`use-briefing-flow.ts`** ([hook completo](../../src/hooks/use-briefing-flow.ts)): máquina de estados com status `idle | parsing | awaiting_fields | confirming | confirmed | awaiting_product_* | *_leads`. `messageHistoryRef.current.join("\n")` nas linhas [648](../../src/hooks/use-briefing-flow.ts#L648) e [692](../../src/hooks/use-briefing-flow.ts#L692) é **o alvo** — vira histórico estruturado. `isConfirmation` ([220](../../src/hooks/use-briefing-flow.ts#L220)) vira **fallback**, não caminho principal. `handleParseResult` ([348-426](../../src/hooks/use-briefing-flow.ts#L348-L426)) é onde a reação a `nextAction` entra. O array de deps do `useCallback` de `processMessage` ([730](../../src/hooks/use-briefing-flow.ts#L730)) inclui `state.*` — **não** adicione o `conversationRef` às deps (refs não vão em deps).
- **`briefing-parser-service.ts`** ([service](../../src/lib/agent/briefing-parser-service.ts)): `parse(message: string, apiKey)` hoje monta `[{system},{user}]`. Vai aceitar histórico. `SYSTEM_PROMPT` ([52-77](../../src/lib/agent/briefing-parser-service.ts#L52)) já tem a lógica 22.1 (tech opcional, "correção mais recente prevalece", skipSteps) — **estenda, não reescreva**. `briefingResponseSchema` ([35-44](../../src/lib/agent/briefing-parser-service.ts#L35)) ganha 2 campos.
- **`parse/route.ts`** ([route](../../src/app/api/agent/briefing/parse/route.ts)): `parseRequestSchema` ([22-25](../../src/app/api/agent/briefing/parse/route.ts#L22)) só aceita `message`. `analyzeBriefingCompleteness` ([49-91](../../src/app/api/agent/briefing/parse/route.ts#L49)) e a canonicalização de `skipSteps` ([226-247](../../src/app/api/agent/briefing/parse/route.ts#L226)) são **determinísticas e sagradas** (NFR1). `BriefingParseResponse` ([31-38](../../src/app/api/agent/briefing/parse/route.ts#L31)) ganha 2 campos.
- **`AgentChat.tsx`** ([componente](../../src/components/agent/AgentChat.tsx)): `handleSendMessage` ([198-276](../../src/components/agent/AgentChat.tsx#L198)) chama `processBriefing`. Com `conversationRef` interno, **a assinatura não muda** — verificação, não edição obrigatória.
- **`use-agent-execution.ts`** ([hook](../../src/hooks/use-agent-execution.ts)): fonte da verdade das mensagens persistidas (poll 3s + realtime). **Não** é necessário para esta story (a memória vem do `conversationRef` interno). Deixado como referência caso o dev prefira alimentar o histórico a partir do DB — **NÃO recomendado** aqui (acopla a timing de poll/otimista; o ref interno é mais simples e testável).

### Padrões estabelecidos a seguir

- **OpenAI:** `gpt-4o-mini`, `temperature: 0.1`, `response_format: { type: "json_object" }`, `AbortController` com 5s. Não troque o modelo. (Referência: `claude-api`/`vercel:ai-gateway` não se aplicam — o projeto usa o SDK `openai` direto com key do tenant, decriptada.)
- **Zod defaults:** siga o padrão do schema atual (`.default([])`, `.nullable()`). `nextAction` e `questionText` têm defaults para tolerar respostas parciais do LLM.
- **ESLint:** `no-console` enforced; `no-non-null-assertion` (não use `!` — o `.refine` garante `messages` OU `message`, mas o TS não estreita; use `?? ""` guardado ou reestruture). Pre-commit linta o arquivo inteiro (Project Memory).
- **Português (BR)** em todo texto de chat/UI. O `questionText` e o `SYSTEM_PROMPT` orientam o LLM a responder em PT-BR.
- **Custo:** 1 chamada `gpt-4o-mini` por turno (como hoje) — o histórico maior aumenta tokens de input marginalmente; sem novo tipo de chamada. Não há custo Apollo/Apify nesta story.

### Testing standards

- Vitest (`npx vitest run`). Service: mock `openai` (padrão em `briefing-parser-service.test.ts` — `mockCreate`). Route: mock `BriefingParserService.parse`, `getCurrentUserProfile`, `createClient`/`createChainBuilder`, `decryptApiKey`, `BriefingSuggestionService` (padrão em `briefing-parse.test.ts`). Hook: `createMockFetch`/`mockJsonResponse` (padrão em `use-briefing-flow.test.tsx`).
- **Prove RED antes de GREEN** no núcleo de memória: escreva o teste que afirma `role:"agent"` no `messages` do 2º fetch e veja falhar contra o código atual (que manda `message` string concatenada). Depois implemente.
- **Lição sistêmica Epic 21 (aplica aqui):** a suíte verde **não prova a tela**. Os mocks devolvem `nextAction` fixo; não provam que o LLM real interpreta "manda bala" como `proceed` nem que o histórico real melhora a memória. Por isso a Task 6 exige smoke manual dos 3 cenários. Não declare "pronto" só com a suíte verde.
- **Ponto cego de constraint/JOIN (Project Memory):** aqui não há constraint de banco em jogo (zero migration), mas há um ponto cego análogo: o mock do LLM **sempre** devolve o `nextAction` que o teste programou. O risco real (LLM devolver intenção errada / não respeitar o histórico) só aparece no smoke com o modelo real.

### Project Structure Notes

- Sem novos arquivos de rota, sem migration, sem novo componente. Mudanças concentradas em 3 arquivos de lógica (service, route, hook) + 1 arquivo de tipos (para `ChatTurn`/`NextAction`) + testes.
- A separação "conversa (LLM) decide o texto/intenção → pipeline (determinístico) decide execução" é **preservada e reforçada**: `nextAction` fica no lado da conversa; `canProceed`/`skipSteps` no lado determinístico.

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.3] — ACs, FR5 (memória), FR6 (intenção via LLM), decisão Q2 (LLM só na conversa)
- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#NonFunctional Requirements] — NFR1 (determinístico), NFR2 (< 5s + fail-open), NFR4 (zero regressão), NFR5 (zero migration)
- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Dependências & Sequência] — 22.3 independente; **22.4 depende de 22.3** (usa `nextAction`)
- [Source: src/hooks/use-briefing-flow.ts#L648] — `messageHistoryRef.join("\n")` (alvo Task 3); [#L220] `isConfirmation` (vira fallback); [#L348-L426] `handleParseResult` (reação a `nextAction`)
- [Source: src/lib/agent/briefing-parser-service.ts#L35-L77] — `briefingResponseSchema` + `SYSTEM_PROMPT` (alvos Task 1)
- [Source: src/app/api/agent/briefing/parse/route.ts#L22-L38] — request schema + `BriefingParseResponse` (alvos Task 2); [#L226-L247] canonicalização determinística de `skipSteps` (SAGRADO, NFR1)
- [Source: src/types/agent.ts#L14] — `MessageRole` (`user`/`agent`/`system`); casa do `ChatTurn`/`NextAction`
- [Source: 22-1-tecnologia-opcional-localizacao-obrigatoria.md] — regra tech-opcional/location-obrigatória no prompt (preservar); [22-2-icebreaker-premium-com-linkedin-toggle-opcional.md] — lição "suíte verde não prova a tela", padrão de defensividade
- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.8] — AC4: máquina de estados conversacional NÃO restaura no refresh (memória within-session é consistente)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (BMAD dev-story workflow)

### Debug Log References

- `npx vitest run __tests__/unit/lib/agent/briefing-parser-service.test.ts __tests__/unit/api/agent/briefing-parse.test.ts __tests__/unit/hooks/use-briefing-flow.test.tsx` → 3 files / 114 pass.
- `npx tsc --noEmit` (filtrado nos 4 arquivos-fonte tocados) → sem erros.
- `npx eslint --max-warnings=0` nos 7 arquivos tocados → limpo (exit 0).
- `npx vitest run` (suíte inteira) → **395 files / 6847 pass / 2 skip / 0 fail**.

### Completion Notes List

- **Memória real (FR5):** o hook trocou `messageHistoryRef: string[]` + `join("\n")` por `conversationRef: ChatTurn[]` (usuário **e** agente). O helper `sendAndRecord` registra cada mensagem do agente antes de enviá-la, fechando o loop de memória. `callParseAPI` agora manda `{ executionId, messages }`. O service monta a conversa OpenAI: system prompt (sempre 1º, separado) + histórico mapeado (`user`→`user`, `agent`/`system`→`assistant`, D4). RED→GREEN provado: o 2º `/parse` carrega um turno `role:"agent"`.
- **Intenção via LLM (FR6):** `briefingResponseSchema` ganhou `nextAction` (enum, default `ask`) e `questionText` (nullable, default `null`); o service devolve ambos no `ParseResult` (fora do `briefing`); a route ecoa em `BriefingParseResponse`. O hook reage ao `nextAction` no `confirming` (D2: `proceed`+`canProceed`→`confirmed`; `confirm`/`ask`→re-apresenta). Keywords viraram **fallback fail-open** (AC4) só no `catch`.
- **NFR1 (determinismo):** `canProceed` é checado **antes** do `nextAction` (D3). A route mantém intacta a canonicalização de `skipSteps` e o `analyzeBriefingCompleteness`. Teste de regressão prova: `nextAction:"proceed"` do LLM **não** destrava `canProceed=false` nem altera `skipSteps`. Comentário explícito adicionado na route.
- **D1 (transparência):** no ramo `confirm`/`canProceed`, o resumo determinístico `generateBriefingSummary` é sempre apresentado (não o `questionText`); `questionText` é usado só no ramo `ask`.
- **Back-compat / fail-open:** `parse(input)` aceita `string | ChatTurn[]`; a route aceita `messages[]` (preferido) OU `message` (legado) via `.refine`. Evitado `no-non-null-assertion` com `?? ""` guardado pelo refine (Project Memory).
- **Escopo preservado:** os valores `register_product`/`import_leads` entraram no enum (para a 22.4), mas os disparos de produto (`productMentioned`) e imported-leads (`skipSteps`) continuam **exatamente** como hoje. `AgentChat.tsx` **não** mudou de assinatura (histórico é interno ao hook). Zero migration (campos são de resposta de API, efêmeros — NFR5). Memória within-session (consistente com 22.8 AC4).
- **Pendência OPERACIONAL (Fabossi):** smoke manual dos 3 cenários em `/agent` — a suíte mocka o LLM e não prova a interpretação real de intenção nem o histórico chegando ao OpenAI (lição sistêmica Epic 21).

### File List

**Modificados (fonte):**
- `src/types/agent.ts` — novos tipos `NextAction` e `ChatTurn`.
- `src/lib/agent/briefing-parser-service.ts` — schema (`nextAction`/`questionText`), `parse(string | ChatTurn[])`, `buildOpenAIMessages`, SYSTEM_PROMPT estendido, `ParseResult` com campos de conversa.
- `src/app/api/agent/briefing/parse/route.ts` — `parseRequestSchema` (`messages[]` | `message` + refine), `history`, `BriefingParseResponse` com `nextAction`/`questionText`.
- `src/hooks/use-briefing-flow.ts` — `conversationRef`, `sendAndRecord`, `callParseAPI(executionId)`, `handleParseResult` reagindo a `canProceed`/`nextAction`, handlers `confirming`/`awaiting_fields`/`idle` + `reset`.

**Modificados (testes):**
- `__tests__/unit/lib/agent/briefing-parser-service.test.ts` — +8 testes (histórico, back-compat, nextAction/questionText, schema, enum inválido).
- `__tests__/unit/api/agent/briefing-parse.test.ts` — asserção do `parse` ajustada para histórico + 4 testes (messages[], defaults, 400 sem corpo, regressão determinística).
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — 3 provas de confirmação adaptadas (`nextAction:"proceed"`) + 6 testes (núcleo memória RED→GREEN, proceed livre, correção parcial, ask/questionText, 2× fail-open).

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-20 | 0.1 | Story 22.3 implementada: memória real (histórico estruturado) + intenção via LLM (`nextAction`/`questionText`), keywords como fallback fail-open. 4 arquivos-fonte + 3 de teste; suíte 395/6847/0 fail; tsc/eslint limpos. Smoke manual pendente (OPERACIONAL Fabossi). | Amelia (dev-story) |
| 2026-07-20 | 0.2 | Code review adversarial 3 camadas: AC1-AC6 + D1-D4 + NFRs verificados, 0 violação dura. 3 patches aplicados (guard híbrido keyword no confirming; turnos de ajuda na memória; guard do questionText), +5 testes; suíte 395/6852/2 skip/0 fail; tsc/eslint limpos nos tocados. 3 defers em deferred-work.md. Status → in-progress até o smoke manual (def-de-pronto retro Epic 21). | Code Review (bmad) |
| 2026-07-20 | 1.0 | Smoke manual FEITO pela interface real (Playwright + LLM real, logado Fabossi): 3/3 cenários passaram — memória (correção "troca pra CFO" aplicada via histórico), confirmação livre pura ("beleza, prossiga" sem keyword → proceed do LLM), keyword ("sim" → confirmado). Parado no approval gate. Story FECHADA → **done**. | Smoke (verify) |

## Review Findings

_Code review adversarial (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-07-20. Nenhuma violação dura de AC/NFR/decisão. 3 patches (2 resolvidos de decision-needed por Fabossi), 3 diferidos, 6 descartados como ruído._

- [x] [Review][Patch] Guard híbrido no `confirming`: confirmar no caminho de sucesso (200) quando `canProceed && isConfirmation(content)` E o briefing NÃO mudou (sem correção — helper `briefingChanged`) — mitiga o trap do LLM saudável que classifica "sim" como `confirm`/`ask`, preservando "sim, mas troca pra CFO" como correção (AC3) [src/hooks/use-briefing-flow.ts:678-701] — **APLICADO** (2 testes: guard confirma sem correção; NÃO confirma com correção aplicada)
- [x] [Review][Patch] Gravar turnos de ajuda na memória: no ramo `isHelpRequest` do `awaiting_fields`, empilhar o turno do usuário e usar `sendAndRecord` em vez de `sendAgentMessage` direto — referências posicionais ("a primeira") passam a resolver [src/hooks/use-briefing-flow.ts:707-732] — **APLICADO** (teste: 2º /parse carrega a pergunta de ajuda + lista sugerida)
- [x] [Review][Patch] `questionText` confiado verbatim no ramo `!canProceed` — só usar quando `nextAction === "ask"` E não-vazio (trim); vazio poluiria o histórico (400 no próximo /parse, content min(1)) e tom de confirmação fora de hora estranha o usuário [src/hooks/use-briefing-flow.ts:409-412] — **APLICADO** (2 testes: whitespace cai no determinístico; questionText fora do ramo ask ignorado)
- [x] [Review][Defer] Toda confirmação agora custa uma chamada OpenAI bloqueante (latência + gasto de token) — inerente ao design LLM-intent [src/hooks/use-briefing-flow.ts:669-674] — deferido, tradeoff de design aprovado pela story
- [x] [Review][Defer] `conversationRef` cresce sem limite within-session e é reenviado inteiro a cada turno [src/hooks/use-briefing-flow.ts:319] — deferido, impacto marginal (conversas curtas, reseta no refresh)
- [x] [Review][Defer] `BriefingParserService.parse([])` (método público estático) monta só o system prompt e chama a OpenAI sem turno de usuário [src/lib/agent/briefing-parser-service.ts] — deferido, hardening; a route já guarda com `min(1)`
