---
baseline_commit: 1c35f8dbfeb3f8e646c937fc9a8cd5ecb2a83a3d
---

# Story 22.4: Sub-fluxos como Decisão do Agente

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want que cadastro de produto e import de leads aconteçam naturalmente na conversa,
so that eu não dependa de frases-gatilho específicas para acessar esses fluxos.

## Contexto do Épico (por que esta story existe)

A Story 22.3 (**done**) entregou **memória conversacional real** + **intenção via LLM**: o parser
recebe o histórico estruturado (`ChatTurn[]`) e devolve `nextAction` (`ask` | `confirm` | `proceed`
| **`register_product`** | **`import_leads`**) e `questionText`. Os dois últimos valores foram
**introduzidos no enum** pela 22.3, mas ainda **não disparam nada** — 22.3 os deixou como rótulos
"prontos para a 22.4 construir por cima" (ver `22-3...md` §Escopo, e o comentário no hook).

Hoje os dois sub-fluxos são disparados por sinais **determinísticos/keywords**, não pela intenção do LLM:

- **Import de leads (17.11):** disparado por `isImportedLeadsFlow(briefing)` — checa
  `skipSteps.includes("search_companies") && skipSteps.includes("search_leads")`
  ([`use-briefing-flow.ts:388`](../../src/hooks/use-briefing-flow.ts#L388)).
- **Cadastro de produto (16.6):** disparado por `productMentioned && productSlug === null` dentro
  do ramo `canProceed=true` ([`use-briefing-flow.ts:439`](../../src/hooks/use-briefing-flow.ts#L439));
  a **decisão** "quer cadastrar? sim/não" no estado `awaiting_product_decision` é resolvida por
  **keywords locais** (`isConfirmation` / `isProductRejection` sobre `CONFIRMATION_KEYWORDS` /
  `PRODUCT_REJECTION_KEYWORDS`, [linhas 489-523](../../src/hooks/use-briefing-flow.ts#L489)).

Esta story (**FR7 — sub-fluxos por decisão do LLM**) move o **gatilho** desses fluxos para o
`nextAction` do parser, **mantendo os sinais determinísticos como fallback fail-open** (mesmo padrão
que a 22.3 usou para as keywords de confirmação — NFR2). O usuário passa a acessar produto/leads em
linguagem livre ("na verdade eu já tenho minha lista de contatos", "quero cadastrar meu produto
antes"), sem depender das frases exatas dos prompts atuais.

**Escopo cirúrgico — o que esta story NÃO faz:**
- **NÃO** toca no pipeline determinístico (`skipSteps`/`canProceed`/`missingFields` continuam 100%
  determinísticos — NFR1). `nextAction` só move a **conversa**.
- **NÃO** re-arquiteta os handlers de parse (`parse-product`/`ProductParserService`, `parseLeadInput`)
  — eles continuam idênticos; só o **gatilho de entrada** muda.
- **NÃO** remove os estados da máquina (`awaiting_product_*`, `*_leads`) — eles são **simplificados
  para reagir ao `nextAction`**, com keyword como rede de segurança.

Esta é a **quarta story do Epic 22** e **depende da 22.3** (usa `nextAction`). A 22.3 já está `done`
e o smoke real provou que o LLM devolve `nextAction` corretamente na tela.

## Acceptance Criteria

1. **Given** o usuário menciona/pede cadastro de produto em qualquer ponto do briefing (com
   `canProceed=true`) **When** o parser responde com `nextAction="register_product"` **Then** o
   sub-fluxo de produto dispara — indo direto para `awaiting_product_details` quando o pedido é
   explícito, ou, quando o produto foi só **mencionado** (não encontrado na base), o agente oferece
   o cadastro (`awaiting_product_decision`) e a **decisão** do usuário passa a ser interpretada pelo
   `nextAction` (`register_product` = cadastrar; qualquer outro = seguir sem produto) — **aposentando
   `PRODUCT_REJECTION_KEYWORDS`/`isConfirmation` do caminho principal** (keywords permanecem só como
   fallback fail-open no `catch`).

2. **Given** o usuário indica ter leads próprios em linguagem livre **When** o parser responde com
   `nextAction="import_leads"` **Then** o fluxo da 17.11 dispara (`awaiting_leads_input` →
   paste/CSV via `parseLeadInput`) — sem depender das frases exatas do prompt atual **And** o sinal
   determinístico `isImportedLeadsFlow(skipSteps)` permanece como **fallback** (OR — zero regressão).

3. **Given** os estados `awaiting_product_decision`, `awaiting_product_details`, `confirming_product`,
   `awaiting_leads_input` e `confirming_leads` **Then** o **gatilho de entrada** de cada sub-fluxo
   reage ao `nextAction`, mantendo **intactos** os handlers de parse existentes (`callParseProductAPI`
   / `ProductParserService`, `parseLeadInput`) e os previews/confirmações internos (as confirmações
   internas de preview — `confirming_product`/`confirming_leads` — podem manter a keyword como
   fallback; elas não são "frases-gatilho de acesso", são um "ok" sobre um preview já exibido).

4. **Given** os testes existentes das stories 16.6 (`awaiting_product_*`) e 17.11
   (`imported leads flow`) **Then** continuam passando (adaptados ao novo disparo por `nextAction`
   onde necessário) — **zero regressão funcional** (NFR4). Os fluxos 17.10 (entrada direta em leads),
   22.1 (tech opcional) e 22.3 (memória/confirmação) permanecem verdes.

5. **Given** falha/timeout do parser em qualquer estado que passou a consultar o LLM **Then** o
   comportamento degrada para o determinístico atual (keyword fallback no `catch` — fail-open, NFR2)
   **And** nenhum turno fica sem resposta.

6. Testes unitários novos: disparo de `register_product` (explícito → `details`; oferta → decisão via
   `nextAction`), disparo de `import_leads` via `nextAction` sem skipSteps-exatos, fallback determinístico
   (skipSteps/keyword), retorno ao fluxo principal após concluir cada sub-fluxo, fail-open no `catch`.

## Tasks / Subtasks

- [x] **Task 1 — Gatilho de `import_leads` via `nextAction` (com fallback determinístico)** (AC: #2, #3, #4, #5)
  - [x] Em [`use-briefing-flow.ts`](../../src/hooks/use-briefing-flow.ts), no `handleParseResult`
    ([linha 388](../../src/hooks/use-briefing-flow.ts#L388)): trocar a condição do primeiro ramo de
    `isImportedLeadsFlow(result.briefing)` para
    `result.nextAction === "import_leads" || isImportedLeadsFlow(result.briefing)`. **Mantenha este
    ramo como o PRIMEIRO** (antes de `!canProceed`) — imported-leads não exige cargo/localização.
    Restante do ramo (mensagem de instrução de colagem, `awaiting_leads_input`) **inalterado**.
  - [x] **Não** altere `parseLeadInput`, `formatLeadPreview`, nem os handlers `awaiting_leads_input`
    / `confirming_leads`. O paste/CSV é dado estruturado, não conversa — continua via `parseLeadInput`.
  - [x] **NFR1 — não mexa em `skipSteps`:** `isImportedLeadsFlow` no route
    ([`parse/route.ts:99-101`](../../src/app/api/agent/briefing/parse/route.ts#L99)) e a canonicalização
    de `skipSteps` ([route.ts:251-265](../../src/app/api/agent/briefing/parse/route.ts#L251)) continuam
    **determinísticas e intactas**. `nextAction="import_leads"` **não** adiciona/remove `skipSteps` no
    route (a linha "nextAction não altera skipSteps" da 22.3 é preservada). Ver **D3** para a nuance
    de consistência.

- [x] **Task 2 — Gatilho de `register_product` via `nextAction`** (AC: #1, #3, #4, #5)
  - [x] No `handleParseResult`, **dentro do ramo `canProceed=true`** (após o gate de `!canProceed`,
    onde hoje mora o check de produto — [linha 439](../../src/hooks/use-briefing-flow.ts#L439)):
    - **Pedido explícito:** se `result.nextAction === "register_product"` **e**
      `result.briefing.productSlug === null` → ir **direto** para `awaiting_product_details`
      (setState + `sendAndRecord` com a mensagem "Ótimo! Me descreva o produto…"). Guardar
      `productMentioned` no state (use `result.productMentioned` quando presente, senão mantenha o
      atual). **Reconciliação (D4):** se `productSlug !== null` (produto JÁ existe na base), **ignore**
      `register_product` e siga o fluxo normal (não cadastre duplicado — a resolução de KB
      determinística prevalece, NFR1).
    - **Só mencionado (não encontrado):** senão, se `result.productMentioned && productSlug === null`
      → `awaiting_product_decision` (agente **oferece** o cadastro) — **inalterado** no gatilho, mas
      ver Task 3 para a decisão.
  - [x] Coloque o check de `register_product`/produto **depois** do gate `!canProceed` (D2: o gating
    determinístico prevalece — não desvie para produto sem cargo+localização; consistente com 17.8
    "resolver campos antes de checar produto" e com a 22.3/D3).

- [x] **Task 3 — `awaiting_product_decision` reage ao `nextAction`** (AC: #1, #3, #5)
  - [x] Reescrever o handler de `awaiting_product_decision`
    ([linhas 489-523](../../src/hooks/use-briefing-flow.ts#L489)) para **consultar o LLM** em vez de
    casar keywords locais:
    - `conversationRef.current.push({ role: "user", content })`; `setState(parsing)`; `callParseAPI(executionId)`.
    - No sucesso: `result.nextAction === "register_product"` → `awaiting_product_details`
      (`sendAndRecord` "Ótimo! Me descreva o produto…"). Senão (usuário recusou/seguiu) → limpar
      `productMentioned` (setState `productMentioned: null`) e ir para `confirming` reapresentando o
      resumo determinístico `generateBriefingSummary(state.briefing)` via `sendAndRecord`. **Não**
      chame `handleParseResult` aqui: ele re-detectaria `productMentioned` e voltaria a oferecar o
      cadastro (loop). Limpar `productMentioned` é o que hoje já é feito na rejeição
      ([linha 494-498](../../src/hooks/use-briefing-flow.ts#L494)).
    - No `catch` (fail-open, AC5): **keyword como rede de segurança** — `isConfirmation(content) && !isProductRejection(content)`
      → `awaiting_product_details`; `isProductRejection(content) && !isConfirmation(content)` →
      `confirming` + `productMentioned: null`; ambíguo → reapresentar a pergunta de oferta (texto
      atual "Quer cadastrar o produto '…' agora? Responda 'sim'…").
  - [x] Registrar as mensagens do agente deste estado via **`sendAndRecord`** (não `sendAgentMessage`
    direto) para manter a memória coerente — o parser precisa ver a oferta e a resposta do usuário
    para classificar `register_product` corretamente (a oferta "Não encontrei o produto…" já é enviada
    por `sendAndRecord` no `handleParseResult`, [linha 448](../../src/hooks/use-briefing-flow.ts#L448)).
  - [x] **Preservar** os handlers `awaiting_product_details` e `confirming_product` como estão
    (parse-product + preview + `createProduct`). A confirmação de preview em `confirming_product`
    (keyword `isConfirmation`/`isProductRejection` sobre o produto extraído) **pode permanecer** — é
    um "ok" sobre um preview exibido, não uma frase-gatilho de acesso (D5). Não amplie o escopo aqui.

- [x] **Task 4 — Prompt do parser: quando emitir `register_product`/`import_leads`** (AC: #1, #2, #5)
  - [x] Em [`briefing-parser-service.ts`](../../src/lib/agent/briefing-parser-service.ts), **estender**
    a seção "CONVERSA (nextAction + questionText)" do `SYSTEM_PROMPT`
    ([linhas 86-100](../../src/lib/agent/briefing-parser-service.ts#L86)) — **preservando toda a lógica
    22.1/22.3** — para orientar:
    - **`register_product`**: use quando (a) o usuário **pede explicitamente** para cadastrar um
      produto ("quero cadastrar meu produto X antes", "cadastra o produto Y"), **ou** (b) o agente
      **acabou de oferecer** o cadastro no histórico ("Não encontrei o produto '…'. Quer cadastrar
      agora?") **e** o usuário **afirma** ("sim", "pode cadastrar", "vamos nessa"). Se o usuário
      **recusa** a oferta ("não", "depois", "segue sem produto"), **NÃO** use `register_product` —
      use `confirm` (seguir para o resumo). **Não** invente produto que o usuário não citou.
    - **`import_leads`**: use quando o usuário indica ter **leads/contatos próprios** para usar
      diretamente ("já tenho minha lista", "tenho uma planilha de contatos", "quero importar meus
      leads", "minha base de e-mails"). Mantenha **coerência** com `skipSteps`: quando emitir
      `import_leads`, também inclua `["search_companies","search_leads"]` em `skipSteps` (a regra de
      `skipSteps` para leads próprios já existe no prompt, [linha 75](../../src/lib/agent/briefing-parser-service.ts#L75)
      — reforce que os dois andam juntos).
  - [x] **Não** altere a regra de `skipSteps`/tech opcional (22.1) nem o mapeamento de roles/histórico
    (22.3). Só a orientação de **quando** os dois `nextAction` novos aparecem.

- [x] **Task 5 — Testes** (AC: #6, e adaptação AC: #4)
  - [x] **`use-briefing-flow.test.tsx`** — novos testes (bloco "Story 22.4"):
    - `import_leads` via `nextAction`: mock `/parse` devolvendo `nextAction: "import_leads"` **sem**
      `skipSteps` de leads → transiciona para `awaiting_leads_input` (prova que o gatilho é o
      `nextAction`, não o skipSteps). Depois cola leads → `confirming_leads` (reusa `parseLeadInput`).
    - `import_leads` fallback determinístico: mock **sem** `nextAction` (undefined) **com**
      `skipSteps:["search_companies","search_leads"]` → ainda `awaiting_leads_input` (fallback OR intacto).
    - `register_product` explícito: `canProceed:true`, `nextAction:"register_product"`, `productMentioned` set,
      `briefing.productSlug:null` → vai **direto** para `awaiting_product_details` (sem passar por decision).
    - `register_product` reconciliação (D4): `nextAction:"register_product"` mas `briefing.productSlug:"prod-123"`
      → **não** entra no fluxo de produto (segue para `confirming`).
    - `awaiting_product_decision` → cadastrar via `nextAction`: 1º `/parse` = product-not-found (vai para
      decision); 2º `/parse` (resposta livre "pode cadastrar sim") devolve `nextAction:"register_product"`
      → `awaiting_product_details`.
    - `awaiting_product_decision` → recusa via `nextAction`: 2º `/parse` devolve `nextAction:"confirm"`
      (canProceed) → `confirming`, `productMentioned:null`, resumo reapresentado.
    - Fail-open (AC5): em `awaiting_product_decision`, `/parse` **rejeita** + "sim" → `awaiting_product_details`
      (keyword fallback); `/parse` rejeita + "não" → `confirming` + `productMentioned:null`.
  - [x] **Adaptar** os testes 16.6 existentes de `awaiting_product_decision` que hoje mandam "sim"/"nao"
    e esperam o resultado por keyword ([linhas 498-561, 563-…](../../__tests__/unit/hooks/use-briefing-flow.test.tsx#L498)):
    esses agora chamam `/parse` — adicione um **segundo mock** de `/parse` retornando o `nextAction`
    correspondente (`register_product` para "sim quero cadastrar"; `confirm` para "não"). Os testes de
    `awaiting_product_details`/`confirming_product` (parse-product) **não mudam**.
  - [x] **Verificar sem alterar** (devem passar como estão): imported-leads 17.11
    ([linhas 1706-1808](../../__tests__/unit/hooks/use-briefing-flow.test.tsx#L1706)) — os mocks
    daquele bloco já trazem `skipSteps` de leads, então o fallback OR os mantém verdes **sem** editar.
  - [x] **`briefing-parser-service.test.ts`**: se necessário, um teste afirmando que o schema aceita
    `nextAction:"register_product"`/`"import_leads"` (já coberto pela 22.3 — confirmar, não duplicar).

- [x] **Task 6 — Validação final**
  - [x] `npx vitest run` (suíte inteira) verde, **zero regressão** (baseline 22.3 ~6852 pass). Reporte
    o delta de testes. → **395 files / 6860 pass / 2 skip / 0 fail** (delta **+8** testes: os 8 novos 22.4).
  - [x] `npx tsc --noEmit` sem novos diagnostics nos arquivos tocados (`use-briefing-flow.ts`,
    `briefing-parser-service.ts` + testes). `npx eslint --max-warnings=0` limpo nos tocados
    (atenção: `no-non-null-assertion`, `no-console` — Project Memory; pre-commit linta o arquivo inteiro).
    → **tsc 0 diagnostics nos tocados; eslint --max-warnings=0 limpo.**
  - [x] **Smoke manual** em `http://localhost:3000/agent` (skill `verify`, Playwright + LLM real
    `gpt-4o-mini`, logado Fabossi) — **3/3 cenários passaram** (evidência de rede confirma o gatilho
    via `nextAction`, não keyword). Ver §Smoke Results abaixo. Parado antes de "Iniciar Execução" (guardrail).

## Dev Notes

### DEV AGENT GUARDRAILS — o que NÃO quebrar

- **NFR1 — pipeline 100% determinístico:** `nextAction` é **exclusivamente sobre a CONVERSA** (qual
  sub-fluxo abrir). Ele **NÃO** decide `skipSteps`, `canProceed`, `missingFields`, ordem de steps,
  gasto de crédito nem envio. A canonicalização de `skipSteps`
  ([route.ts:251-265](../../src/app/api/agent/briefing/parse/route.ts#L251)), o
  `analyzeBriefingCompleteness`/`isImportedLeadsFlow` do route
  ([route.ts:66-108](../../src/app/api/agent/briefing/parse/route.ts#L66)) e a resolução de produto
  (`resolveProduct` → `productSlug`, [route.ts:114-133](../../src/app/api/agent/briefing/parse/route.ts#L114))
  ficam **intactos e determinísticos**. **Regra de ouro:** o gating (`canProceed`, `productSlug`)
  prevalece sobre o `nextAction`.
- **NFR2 — fail-open + < 5s:** todo estado que passou a consultar o parser (`awaiting_product_decision`)
  precisa de **keyword fallback no `catch`** — nenhum turno pode ficar sem resposta se o LLM
  falhar/timeout. O timeout de 5s (`PARSER_TIMEOUT_MS`) do parser permanece.
- **NFR4 — zero regressão:** 16.6 (produto inline), 17.10 (entrada direta), 17.11 (leads próprios),
  22.1/22.2/22.3 continuam funcionando. Os estados **não mudam de nome nem de conjunto**
  (`BriefingFlowStatus` intacto); só a **decisão de entrada** de produto/leads passa a consultar o
  LLM (com fallback determinístico). Os handlers de parse (`ProductParserService`, `parseLeadInput`)
  **não mudam**.
- **NFR5 — zero migration:** nada de schema de banco. `nextAction` é campo de **resposta de API**,
  efêmero.
- **Escopo — NÃO faça a 22.5/22.6 aqui:** esta story só move os **gatilhos** de produto/leads para
  `nextAction`. Não adicione `objective`/`urgency`/`emailCount` (22.5) nem filtros-padrão de busca
  (22.6). Não re-arquiteta o pipeline (full-C está fora — decisão Q2).

### A mudança em uma frase

Hoje o agente abre o cadastro de produto e o import de leads por sinais determinísticos + keywords
locais (`productMentioned`/`skipSteps` + `isConfirmation`/`PRODUCT_REJECTION_KEYWORDS`). Depois desta
story: o **LLM decide** abrir cada sub-fluxo via `nextAction` (`register_product`/`import_leads`), e
os sinais determinísticos/keywords viram **rede de segurança** — sem palavras mágicas.

### Decisões de design (leia antes de codar)

- **D1 — `nextAction` é gatilho, sinal determinístico é fallback (OR):** o padrão é o mesmo da 22.3
  (keyword como fail-open). Para leads:
  `nextAction === "import_leads" || isImportedLeadsFlow(briefing)`. Para produto (oferta): entra por
  `nextAction === "register_product"` **ou** pelo `productMentioned && productSlug===null` existente.
  Isso garante **zero regressão** (os testes/fluxos antigos, que não setam `nextAction`, continuam via
  o ramo determinístico) **e** adiciona o disparo por linguagem livre.
- **D2 — gating determinístico prevalece (ordem no `handleParseResult`):** mantenha a ordem —
  (1) imported-leads (`nextAction`/skipSteps), (2) `!canProceed` → `awaiting_fields`, (3) produto
  (`register_product`/`productMentioned`) **dentro** de `canProceed=true`, (4) `confirming`. Produto
  **nunca** desvia o fluxo com `canProceed=false` (17.8 "campos antes de produto"; 22.3/D3). Leads
  **pode** disparar antes de `canProceed` (é o caminho de leads próprios, que dispensa cargo/localização).
- **D3 — consistência `import_leads` × `skipSteps` (por que NÃO reconciliar no route):** o pipeline
  depende de `skipSteps` (determinístico, NFR1). O prompt já emite `import_leads` **e** os `skipSteps`
  de leads **juntos** (mesmo sinal do usuário). Se o LLM, por inconsistência, emitir `import_leads`
  **sem** os `skipSteps`, o hook abre a colagem de leads, mas o pipeline não pularia as buscas — a
  segurança aqui é o `canProceed` (sem cargo/localização e sem skipSteps → `awaiting_fields` no
  próximo turno) e o smoke. **Decisão:** NÃO acople `nextAction`→`skipSteps` no route (preserva a
  linha "nextAction não altera skipSteps" da 22.3 — NFR1). Se o smoke expuser a inconsistência,
  trate como hardening (defer), não como parte desta story.
- **D4 — reconciliação `register_product` × `productSlug` (KB prevalece):** só entre no fluxo de
  produto quando `productSlug === null` (produto **não** existe na base). Se o LLM disser
  `register_product` mas o produto já existir (`productSlug !== null`), **ignore** — não cadastre
  duplicado. A resolução de KB (`resolveProduct`) é determinística e prevalece (NFR1).
- **D5 — confirmações internas de preview permanecem por keyword (escopo):** `confirming_product` (ok
  sobre o produto extraído) e `confirming_leads` (ok sobre a tabela de leads) confirmam um **preview
  já exibido** — não são "frases-gatilho de acesso". Mantenha a keyword (`isConfirmation`) ali como
  está. Mover essas para `nextAction` seria escopo extra sem valor de FR7; **não faça**.

### Fluxo end-to-end (siga esta cadeia)

1. **Usuário digita** → `AgentChat.handleSendMessage` → `processBriefing(content, execId, sendAgentMessage, createProduct)`
   (assinatura **não muda** — 22.3 já confirmou).
2. **Hook** registra `{role:"user"}` no `conversationRef`; chama `POST /parse` com o histórico.
3. **Route** (determinístico): resolve `productSlug`, canonicaliza `skipSteps`, calcula
   `canProceed`/`missingFields`, e ecoa `nextAction`/`questionText` do parser.
4. **Hook reage:** `handleParseResult` decide o próximo estado por **(a)** import-leads
   (`nextAction`/skipSteps), **(b)** `canProceed`, **(c)** produto (`register_product`/`productMentioned`).
   `awaiting_product_decision` agora **re-consulta o parser** e reage ao `nextAction` (keyword no catch).
5. Sub-fluxo conclui (produto cadastrado / leads colados) → volta para `confirming` (resumo) → confirmação
   (22.3) → `confirmed`.

### Estado atual dos arquivos-chave (leia antes de editar)

- **`use-briefing-flow.ts`** ([hook completo](../../src/hooks/use-briefing-flow.ts)):
  - `handleParseResult` ([380-475](../../src/hooks/use-briefing-flow.ts#L380)): ordem atual dos ramos
    (imported-leads → `!canProceed` → produto → `confirming`). **Alvo Tasks 1 e 2.**
  - Handler `awaiting_product_decision` ([489-523](../../src/hooks/use-briefing-flow.ts#L489)): hoje
    usa `isProductRejection`/`isConfirmation` locais e **não** chama o parser. **Alvo Task 3.**
  - Handlers `awaiting_product_details` ([526-553](../../src/hooks/use-briefing-flow.ts#L526)) e
    `confirming_product` ([556-630](../../src/hooks/use-briefing-flow.ts#L556)): **preservar** (parse-product
    + `createProduct`). Confirmação de preview por keyword fica (D5).
  - Handlers `awaiting_leads_input` ([635-659](../../src/hooks/use-briefing-flow.ts#L635)) e
    `confirming_leads` ([662-684](../../src/hooks/use-briefing-flow.ts#L662)): **preservar**
    (`parseLeadInput`/`formatLeadPreview`; confirmação por keyword fica — D5).
  - `isImportedLeadsFlow` ([248-251](../../src/hooks/use-briefing-flow.ts#L248)) vira **fallback** no
    ramo de leads (não remova). `PRODUCT_REJECTION_KEYWORDS`/`isProductRejection`
    ([68-75, 239-242](../../src/hooks/use-briefing-flow.ts#L68)) e `isConfirmation`
    ([220-223](../../src/hooks/use-briefing-flow.ts#L220)) **permanecem** — usados só como fallback no
    `catch` do `awaiting_product_decision` (e por D5 nos previews).
  - `sendAndRecord` ([314-324](../../src/hooks/use-briefing-flow.ts#L314)) e `callParseAPI`
    ([326-350](../../src/hooks/use-briefing-flow.ts#L326)): reuse-os no novo `awaiting_product_decision`
    (empilhar user turn + parse + registrar respostas do agente).
  - Deps do `useCallback` de `processMessage` ([809](../../src/hooks/use-briefing-flow.ts#L809)): já
    incluem `state.*`, `callParseAPI`, `handleParseResult`, `sendAndRecord`, `callParseProductAPI`.
    **Não** adicione `conversationRef` às deps (refs não vão em deps — nota da 22.3).
- **`briefing-parser-service.ts`** ([service](../../src/lib/agent/briefing-parser-service.ts)):
  `SYSTEM_PROMPT` ([59-100](../../src/lib/agent/briefing-parser-service.ts#L59)) já descreve
  `register_product`/`import_leads` (22.3). **Estenda** a orientação de **quando** emiti-los (Task 4)
  — **não reescreva** a lógica 22.1 (tech opcional/skipSteps) nem o mapeamento de histórico (22.3). O
  `briefingResponseSchema` ([36-51](../../src/lib/agent/briefing-parser-service.ts#L36)) **já** valida
  os dois valores — **não** mexa no schema.
- **`parse/route.ts`** ([route](../../src/app/api/agent/briefing/parse/route.ts)): **NÃO precisa mudar**
  para esta story (ele já ecoa `nextAction`/`questionText` e resolve `productSlug`/`skipSteps`
  determinístico). Só toque se um teste de route exigir — improvável. `resolveProduct`
  ([114-133](../../src/app/api/agent/briefing/parse/route.ts#L114)) e a canonicalização
  ([251-265](../../src/app/api/agent/briefing/parse/route.ts#L251)) são **sagrados** (NFR1).
- **`parse-product/route.ts`** ([route](../../src/app/api/agent/briefing/parse-product/route.ts)) e
  `ProductParserService`, `parseLeadInput`/`lead-import-parser.ts`: **intactos** — só o gatilho de
  entrada muda, não os parsers.
- **`AgentChat.tsx`** ([componente](../../src/components/agent/AgentChat.tsx)): `handleSendMessage`
  ([198-276](../../src/components/agent/AgentChat.tsx#L198)) chama `processBriefing`. **Assinatura não
  muda** (histórico é interno ao hook). Verificação, não edição.

### Padrões estabelecidos a seguir

- **OpenAI:** o parser usa `gpt-4o-mini`, `temperature: 0.1`, `response_format: json_object`,
  `AbortController` 5s (não troque). Esta story **não** adiciona novas chamadas de LLM — só reusa
  `callParseAPI` no `awaiting_product_decision` (1 chamada por turno, como já acontece nos outros
  estados que parseiam).
- **Custo:** `awaiting_product_decision` passa a custar 1 chamada `gpt-4o-mini` por turno (antes era
  keyword local, custo zero). É o mesmo tradeoff aprovado na 22.3 (intenção via LLM). Defer conhecido.
- **ESLint:** `no-console`, `no-non-null-assertion` (Project Memory — pre-commit linta o arquivo
  inteiro; leitura guardada, nunca `!`). **Português (BR)** em todo texto de chat.
- **Zustand/refs:** `conversationRef` é ref; não entra em deps.

### Testing standards

- Vitest (`npx vitest run`). Hook: `createMockFetch`/`mockJsonResponse` (padrão em
  `use-briefing-flow.test.tsx`). Para estados que consultam o parser **duas vezes** (ex.:
  `awaiting_product_decision`), o mock precisa de **duas respostas** de `/parse` (a lib de mock casa
  por URL/method na ordem — verifique como `createMockFetch` lida com múltiplas respostas para a mesma
  rota; se ele consome sequencialmente, ordene os mocks; se não, use um mock que muda o retorno por
  chamada). **Confirme o comportamento do helper antes de escrever** — olhe os testes existentes que
  fazem 2× `/parse` (ex.: correção parcial da 22.3, [linhas ~2160-2210](../../__tests__/unit/hooks/use-briefing-flow.test.tsx#L2160)).
- **Prove RED antes de GREEN** no núcleo: escreva o teste de `import_leads` via `nextAction` **sem**
  `skipSteps` e veja falhar contra o código atual (que só dispara por `isImportedLeadsFlow`). Idem para
  `register_product` explícito → `awaiting_product_details`.
- **Lição sistêmica Epic 21 (aplica aqui):** a suíte verde **não prova a tela**. Os mocks devolvem
  `nextAction` fixo; não provam que o LLM real classifica "pode cadastrar" como `register_product` nem
  "já tenho minha lista" como `import_leads`. Por isso a Task 6 exige smoke manual. Não declare
  "pronto" só com a suíte verde.
- **Ponto cego análogo (Project Memory):** o mock **sempre** devolve o `nextAction` programado; o
  risco real (LLM abrir o sub-fluxo errado ou não abrir) só aparece no smoke com o modelo real.

### Project Structure Notes

- **Sem** novos arquivos, **sem** migration, **sem** novo componente, **sem** mudança de route. Mudanças
  concentradas em **2 arquivos de lógica** (`use-briefing-flow.ts` — gatilhos; `briefing-parser-service.ts`
  — orientação de prompt) + **testes**.
- A separação "conversa (LLM) decide QUAL sub-fluxo → pipeline (determinístico) decide execução" é
  **preservada e reforçada**: `nextAction` no lado da conversa; `skipSteps`/`productSlug`/`canProceed`
  no lado determinístico.

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.4] — ACs, FR7 (sub-fluxos
  por decisão do LLM), decisão Q2 (LLM só na conversa)
- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#NonFunctional Requirements] — NFR1
  (determinístico), NFR2 (< 5s + fail-open), NFR4 (zero regressão), NFR5 (zero migration)
- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Dependências & Sequência] —
  **22.4 depende de 22.3** (usa `nextAction`)
- [Source: 22-3-conversa-com-memoria-real-intencao-via-llm.md] — `nextAction`/`questionText`,
  `conversationRef`/`sendAndRecord`/`callParseAPI`, keyword como fallback fail-open, D1-D4; §Escopo:
  "22.3 introduz `register_product`/`import_leads` no enum mas NÃO re-arquiteta os sub-fluxos (isso é
  a 22.4)"
- [Source: src/hooks/use-briefing-flow.ts#L388] — ramo imported-leads (alvo Task 1);
  [#L439] check de produto (alvo Task 2); [#L489-L523] `awaiting_product_decision` (alvo Task 3);
  [#L68-L75] `PRODUCT_REJECTION_KEYWORDS` (vira fallback)
- [Source: src/lib/agent/briefing-parser-service.ts#L86-L100] — seção CONVERSA do SYSTEM_PROMPT (alvo
  Task 4); [#L36-L51] schema já valida os `nextAction` novos (não mexer)
- [Source: src/app/api/agent/briefing/parse/route.ts#L114-L133] — `resolveProduct`/`productSlug`
  (determinístico, sagrado); [#L251-L265] canonicalização de `skipSteps` (sagrado, NFR1)
- [Source: __tests__/unit/hooks/use-briefing-flow.test.tsx#L448-L561] — testes 16.6 de
  `awaiting_product_decision` a adaptar; [#L1706-L1808] testes 17.11 imported-leads (verificar,
  provavelmente sem editar)
- [Source: src/lib/agent/lead-import-parser.ts] — `parseLeadInput` (intacto);
  [Source: src/lib/agent/product-parser-service.ts] — `ProductParserService` (intacto)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Code / BMAD dev-story)

### Debug Log References

- RED provado: ao mover a decisão de `awaiting_product_decision` para o `/parse`, os 10 testes 16.6
  que enviavam `sim`/`nao`/`talvez` por keyword falharam (esperavam `awaiting_product_details` /
  `confirming_product`, recebiam `confirming`) — confirmando que o gatilho antigo era a keyword local.
  GREEN após adaptar cada teste com um 2º mock de `/parse` (`swapParseToRegisterProduct` / `swapParseToFailure`).
- `createMockFetch` casa a **primeira** rota por URL/method (não consome sequencialmente) → o padrão
  para 2× `/parse` é `restoreFetch()` + `createMockFetch()` entre os passos (mesmo padrão da 22.3).

### Completion Notes List

Implementação **cirúrgica em 2 arquivos de lógica** (`use-briefing-flow.ts` gatilhos +
`briefing-parser-service.ts` prompt) + testes. Zero route/migration/componente (NFR1/NFR5).

- **Task 1 (import_leads):** ramo de leads no `handleParseResult` passou a disparar por
  `result.nextAction === "import_leads" || isImportedLeadsFlow(result.briefing)` (D1 — fallback OR),
  mantido como **primeiro** ramo (antes de `!canProceed`, D2). `parseLeadInput`/`formatLeadPreview`/
  handlers de leads **inalterados**. Route/`skipSteps` intactos (NFR1).
- **Task 2 (register_product):** dentro de `canProceed=true`, antes da oferta, novo ramo — se
  `nextAction === "register_product"` **e** `productSlug === null` → **direto** para
  `awaiting_product_details` (guarda `productMentioned` = `result.productMentioned ?? prev`). **D4:**
  `productSlug !== null` → ignora `register_product` (KB prevalece, sem duplicata). A oferta
  (`productMentioned && productSlug===null`) segue como fallback deste ramo (D1).
- **Task 3 (awaiting_product_decision):** reescrito para **consultar o LLM** — empilha o turno do
  usuário, chama `callParseAPI`, e reage: `register_product` → `awaiting_product_details`; qualquer
  outro → limpa `productMentioned` + `confirming` reapresentando `generateBriefingSummary(state.briefing)`
  (não chama `handleParseResult` para evitar re-oferecer em loop). **catch fail-open (AC5):** desempate
  por keyword (`isConfirmation`/`isProductRejection`) — aposenta `PRODUCT_REJECTION_KEYWORDS` do caminho
  principal, mantém como rede de segurança. Mensagens do estado via `sendAndRecord` (memória coerente).
  Handlers `awaiting_product_details`/`confirming_product`/`awaiting_leads_input`/`confirming_leads`
  **preservados** (D5 — confirmações de preview seguem por keyword).
- **Task 4 (prompt):** seção CONVERSA do `SYSTEM_PROMPT` estendida com **quando** emitir
  `register_product` (pedido explícito OU afirmação após oferta; recusa → `confirm`) e `import_leads`
  (leads próprios, coerente com `skipSteps` — os dois andam juntos). Lógica 22.1/22.3 e schema intactos.
- **Task 5 (testes):** +8 testes novos (bloco "Sub-fluxos por decisao do LLM (Story 22.4)"): import_leads
  via `nextAction` sem skipSteps (+ paste → `confirming_leads`); fallback determinístico (skipSteps sem
  nextAction); register_product explícito → `details`; D4 (produto já existe → `confirming`);
  decisão via `nextAction` em linguagem livre (cadastrar / recusar); fail-open catch (`sim`/`nao`).
  10 testes 16.6 de `awaiting_product_decision` **adaptados** (2º mock de `/parse`); 2 testes de
  ambiguidade repurposados para o catch fail-open. Testes 17.11 (imported leads) **verdes sem edição**
  (mocks já trazem `skipSteps` → fallback OR).
- **Task 6:** suíte inteira **395 files / 6860 pass / 2 skip / 0 fail** (baseline 22.3 6852 → **+8**,
  zero regressão). `tsc --noEmit` 0 diagnostics nos tocados; `eslint --max-warnings=0` limpo.

**PENDENTE (não vira `done` sem isto):** smoke manual em `/agent` com LLM real (OPERACIONAL Fabossi).
A suíte **mocka** o `/parse` — os mocks devolvem `nextAction` fixo e **não provam** que o modelo real
(`gpt-4o-mini`) classifica "já tenho minha lista" como `import_leads` nem "pode cadastrar" como
`register_product` na hora certa (lição sistêmica Epic 21: suíte verde ≠ tela). 3 cenários na Task 6.

### File List

- `src/hooks/use-briefing-flow.ts` (M) — gatilhos import_leads/register_product via `nextAction`;
  `awaiting_product_decision` consulta o parser (keyword no catch)
- `src/lib/agent/briefing-parser-service.ts` (M) — SYSTEM_PROMPT: quando emitir `register_product`/`import_leads`
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` (M) — +8 testes 22.4; 10 testes 16.6 adaptados;
  helpers `swapParseToRegisterProduct`/`swapParseToFailure` + const `PRODUCT_DECISION_REGISTER`

## Smoke Results (2026-07-21 — skill `verify`, Playwright + LLM real `gpt-4o-mini`, logado Fabossi)

**3/3 cenários passaram na tela**, com o body de `/api/agent/briefing/parse` confirmando que o gatilho
foi o `nextAction` do modelo real (não keyword/skipSteps determinístico). Screenshot: `22-4-smoke-verify.png`.

- **(a) import livre** — "na verdade eu já tenho minha lista de contatos" → agente pediu a colagem dos
  leads (`awaiting_leads_input`). `/parse` devolveu **`nextAction:"import_leads"`** (+ `skipSteps:
  ["search_companies","search_leads"]` juntos, como o prompt orienta). Prova AC2 na tela.
- **(b) produto livre** — "Quero prospectar CTOs em São Paulo para vender meu produto ZephyrGuard
  Analytics" → agente ofereceu cadastro (produto não encontrado, `awaiting_product_decision`); resposta
  **em linguagem livre "pode cadastrar, vamos nessa" (sem "sim" literal)** → `/parse` devolveu
  **`nextAction:"register_product"`** (`productMentioned:"ZephyrGuard Analytics"`, `productSlug:null`) →
  agente foi para `awaiting_product_details` ("Ótimo! Me descreva o produto…"). Prova AC1 na tela.
- **(c) recusa** — na oferta de "NimbusShield Pro", resposta livre **"não precisa, pode seguir sem o
  produto mesmo"** → `/parse` devolveu **`nextAction:"confirm"`, `productMentioned:null`** → agente
  limpou o produto e reapresentou o resumo determinístico (CTO + São Paulo, sem produto). Prova AC1
  (ramo "qualquer outro = seguir sem produto") na tela.

**Gotcha (não é falha da story):** 1 erro de console = hydration mismatch **pré-existente** do submenu
Leads da Sidebar (`aria-expanded`/ChevronDown), já documentado. Residuo esperado: caminho pago ("Iniciar
Execução") **não** disparado (guardrail de custo). Gatilho de entrada é `nextAction`; pipeline
determinístico intocado.

## Review Findings

> Code review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo full, 2026-07-21. **Acceptance Auditor: AC1-AC6 + NFR1/5 + escopo VERIFICADOS EM CÓDIGO** — nenhuma violação dura de AC. Convergência forte: o disparo de `import_leads` sem `skipSteps` foi eleito de forma INDEPENDENTE por Blind (#1) + Edge (#5) como o achado nº1. 9 findings descartados como ruído/by-design/pré-existentes de 22.3. Escopo focado na 22.4 (22.1/22.3 vêm juntos no diff por estarem uncommitted, mas foram ignorados como já `done`).

### Decision-needed (resolvidas por Fabossi → viraram patch → APLICADAS)

- [x] **[Review][Decision→Patch APLICADO] `nextAction:"import_leads"` sem `skipSteps` descarta os leads colados e roda busca paga** [use-briefing-flow.ts:391](../../src/hooks/use-briefing-flow.ts#L391) → [create-campaign-step.ts:81-95](../../src/lib/agent/steps/create-campaign-step.ts#L81) — O ramo de leads dispara pela intenção do LLM sozinha (D1/OR), mas por D3 o `nextAction` NÃO seta `skipSteps`. O usuário cola os leads → [:718](../../src/hooks/use-briefing-flow.ts#L718) grava `importedLeads` mas **não** grava `skipSteps`. Na execução, `create-campaign-step` verifica `isImportedLeadsFlow` por `skipSteps` (não por `importedLeads`): com `skipSteps:[]` cai no ramo `previousStepOutput` e usa os resultados da **busca paga** — os leads colados são silenciosamente descartados E `search_companies`/`search_leads` rodam (gasto Apollo). A rede de segurança que a D3 invoca (`canProceed`) **NÃO se aplica**: `import_leads` é o PRIMEIRO ramo, antes do gate `!canProceed`. Blind#1 + Edge#5. **RESOLUÇÃO (Fabossi):** Patch — reconciliar no hook. O ramo `import_leads` agora garante `["search_companies","search_leads"]` em `briefing.skipSteps` (client-side, idempotente; o route/NFR1 segue intacto). +2 asserts no teste `import_leads via nextAction`.

- [x] **[Review][Decision→Patch APLICADO] `awaiting_product_decision` (ramo "seguir sem produto") descarta `result.briefing` — correção embutida na recusa é perdida** [use-briefing-flow.ts:546-553](../../src/hooks/use-briefing-flow.ts#L546) — Quando o LLM não devolve `register_product`, o handler ia para `confirming` sem gravar `result.briefing`/`missingFields` e reapresentava `generateBriefingSummary(state.briefing)` (closure ANTIGO) → correção embutida na recusa ("não precisa do produto, mas troca pra CFO") era silenciosamente perdida. Blind#2/#3 + Edge#2. **RESOLUÇÃO (Fabossi):** Patch — usar `result.briefing`. O ramo agora persiste `result.briefing`/`missingFields`/`isComplete` e resume a partir deles. +1 teste novo (recusa com correção embutida → `jobTitles` vira CFO).

### Patch (aplicado)

- [x] **[Review][Patch APLICADO] Resumo reapresentado em `awaiting_product_decision` omitia as notas de campos opcionais** [use-briefing-flow.ts:550](../../src/hooks/use-briefing-flow.ts#L550), [:576](../../src/hooks/use-briefing-flow.ts#L576) — Os `generateBriefingSummary(state.briefing)` (sucesso + catch) não passavam `missingFields`, então as notas "Sem tecnologia…", "Sem filtro de tamanho…" sumiam — inconsistente com `handleParseResult`/`confirming_leads`. Cosmético (LOW). **APLICADO:** sucesso subsumido pelo patch acima (usa `result.missingFields`); catch fail-open passa `state.missingFields`. +1 assert no teste fail-open "nao". Blind#6.

### Defer

- [x] **[Review][Defer] Correção no `confirming` pode reofertar um produto já recusado** [use-briefing-flow.ts:789](../../src/hooks/use-briefing-flow.ts#L789) → `handleParseResult` [:469](../../src/hooks/use-briefing-flow.ts#L469) — deferido, hardening dependente de LLM (ver deferred-work.md)
- [x] **[Review][Defer] AC6: retorno `confirming_leads → confirming` não é afirmado por um teste rotulado 22.4** [use-briefing-flow.test.tsx](../../__tests__/unit/hooks/use-briefing-flow.test.tsx) — deferido, coberto pelos testes 17.11 herdados (ver deferred-work.md)

### Dismissed (9)

1. `register_product` sem nome de produto → `awaiting_product_details` com `productName:""` (Blind#5/Edge#1/Auditor#3) — **spec permite explicitamente** ("pedido explícito pode não repetir o nome"); a extração real vem da descrição do próximo turno.
2. `import_leads` (1º ramo) ignora `productMentioned` quando produto+leads na mesma msg (Edge#4) — by-design: leads próprios dispensam produto/campos.
3. `register_product` explícito com `canProceed=false` é adiado (Edge#7) — by-design D2 (gating prevalece; campos antes de produto).
4. `state.briefing` null no ramo de decisão → confirming silencioso (Blind#7/Edge#3) — invariante: `briefing` sempre setado ao entrar em `awaiting_product_decision`.
5. Fail-open ambíguo renderiza produto vazio `''` (Edge#10) — invariante: `productMentioned` setado ao entrar no estado.
6. `register_product` carrega `prev.productMentioned` de outro produto (Edge#6) — o nome é só dica de parse; a extração vem da descrição.
7. `conversationRef` cresce sem limite (Edge#8) — código 22.3, **já deferido na review 22.3**.
8. `conversationRef` acumula turnos de usuário consecutivos nos catches fail-open de `confirming`/`awaiting_fields` (Blind#8/Edge#9) — código 22.3, não tocado pela 22.4.
9. `briefingChanged` ignora `productSlug`/`importedLeads` (Blind#9) — código 22.3, não tocado pela 22.4.

## Change Log

- 2026-07-21 — **code-review bmad 3 camadas (Blind/Edge/Auditor, full) → DONE.** Acceptance Auditor: AC1-AC6 + NFR1/5 + escopo verificados em código, 0 violação dura. 2 decision-needed (resolvidas por Fabossi → patch) + 1 patch = **3 patches aplicados**: (A) reconcilia `skipSteps` no ramo `import_leads` do hook — fecha perda silenciosa de leads colados + busca paga quando o LLM emite `import_leads` sem os `skipSteps` (Blind#1/Edge#5; a rede D3 do `canProceed` não pegava porque `import_leads` é o 1º ramo); (B) ramo "seguir sem produto" de `awaiting_product_decision` passa a usar `result.briefing` — honra correção embutida na recusa (Blind#2/Edge#2); (C) resumos reapresentados passam `missingFields` (notas de campos opcionais, LOW). +3 asserts/testes (RED→GREEN). 2 defers (reoferta de produto recusado via `confirming`→`handleParseResult`, dependente de LLM; nit de cobertura AC6 `confirming_leads`→`confirming`) → deferred-work.md. 9 dismiss (spec-permitido / by-design D2 / invariantes / código 22.3 herdado). Suíte **395/6861 pass/2 skip/0 fail** (+1 líquido), tsc/eslint limpos nos tocados.
- 2026-07-21 — dev-story 22.4 (FR7 — sub-fluxos por decisão do LLM). Gatilhos de `import_leads` e
  `register_product` movidos para o `nextAction` do parser, com sinais determinísticos (`skipSteps`/
  `productMentioned`) e keywords como fallback fail-open (D1/AC5). `awaiting_product_decision` passou a
  consultar o LLM; `SYSTEM_PROMPT` estendido com o "quando" de cada `nextAction`. 2 arquivos de lógica
  + testes; zero route/migration/componente (NFR1/NFR5). Suíte 395/6860/2 skip/0 fail (+8), tsc/eslint
  limpos. **Status → review** (smoke manual em `/agent` pendente — OPERACIONAL Fabossi).
