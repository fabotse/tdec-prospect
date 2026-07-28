---
baseline_commit: 85fbd2a62c3b2e3f6600c7a5ac813ca60bda7514  # Story 22.10 committed (fix CAS + conversa limpa) -> baseline da 22.11
---

# Story 22.11: Guardrail Determinístico de Sub-fluxo (import_leads) + Atualização do Modelo do Parser

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want que o agente **nunca me jogue no fluxo de "cole seus leads" quando eu só estou ajustando um filtro** (ex.: aumentar o tamanho da empresa) — e que a interpretação de intenção seja feita por um modelo mais atual,
so that a conversa siga previsível e o agente não abandone a busca que eu montei por causa de uma classificação errada do modelo.

## Contexto do Épico (por que esta story existe)

Story **pós-planejamento** do Epic 22 (padrão 22.8/22.9/22.10), levantada pelo Fabossi em teste real (2026-07-24). **Bug reproduzido na tela:**

1. Usuário: *"Olá, eu queria prospectar CTOs de Atibaia, São Paulo."* → agente monta o resumo (cargo + localização) e pergunta *"Confirma esses parâmetros?"* (estado `confirming`).
2. Usuário: *"O tamanho da empresa pode aumentar para mais de 50."* (um **ajuste de filtro**) → agente responde *"Entendi! Você já tem seus próprios leads. Cole a lista abaixo…"* e entra no fluxo de importação de leads.

O usuário **nunca** mencionou ter leads próprios. Diagnóstico confirmado em código (não é palpite):

- O gatilho de `import_leads` em [use-briefing-flow.ts:457](../../src/hooks/use-briefing-flow.ts#L457) é o **primeiro `if`** de `handleParseResult`: `result.nextAction === "import_leads" || isImportedLeadsFlow(result.briefing)`. Ele **confia na palavra do LLM sem nenhuma corroboração determinística**.
- No estado `confirming` ([use-briefing-flow.ts:850,875](../../src/hooks/use-briefing-flow.ts#L850)), quando a mensagem não é `proceed`/"sim", o fluxo chama `handleParseResult`, que bate nesse primeiro `if`.
- O **`gpt-4o-mini`** (modelo do parser, [briefing-parser-service.ts:19](../../src/lib/agent/briefing-parser-service.ts#L19)) **alucinou** `nextAction: "import_leads"` para uma frase que é claramente ajuste de filtro. O SYSTEM_PROMPT está **correto** — [briefing-parser-service.ts:128](../../src/lib/agent/briefing-parser-service.ts#L128) manda emitir `import_leads` só quando o usuário indica ter leads próprios ("já tenho minha lista", "minha planilha de contatos", etc.). O modelo leu errado.

### Duas frentes (independentes, somam)

- **Frente A — Guard determinístico (fecha o bug de vez):** o sub-fluxo `import_leads` (caro: abandona a busca) só entra quando a **mensagem crua do usuário** tiver um sinal real de leads próprios (e-mails colados OU palavras-âncora que o próprio prompt já lista). A palavra do LLM vira sinal *contribuinte*, não *suficiente sozinho*. Funciona **independente do que o modelo alucine** — um ajuste de filtro nunca tem e-mail nem "tenho minha lista".
- **Frente B — Modelo do parser (reduz a frequência de TODO erro de classificação):** trocar `gpt-4o-mini` por um modelo atual da OpenAI (`gpt-5.4-mini` recomendado, `gpt-5.4-nano` como opção econômica), com verificação de compatibilidade de API, custo documentado e validação sem regressão.

> **A Frente A sozinha já resolve o bug reportado, de forma determinística.** A Frente B ataca a raiz (a má-classificação) e melhora a interpretação de intenção em toda a conversa. Sequência segura: **A primeiro** (autocontida, sem risco); **B depois** (mexe em TODO parsing de briefing — blast radius maior).

## Acceptance Criteria

### Frente A — Guard determinístico do import_leads

1. **[Âncora determinística obrigatória]** **Given** um resultado do parser com `result.nextAction === "import_leads"` (ou `isImportedLeadsFlow(result.briefing) === true`) **When** `handleParseResult` decide o ramo de leads ([use-briefing-flow.ts:457](../../src/hooks/use-briefing-flow.ts#L457)) **Then** o ramo `awaiting_leads_input` **só é acionado** se a **mensagem crua do usuário** (`content` daquele turno) contiver um sinal determinístico de leads próprios: **(a)** conteúdo de e-mail (regex `/\S+@\S+\.\S+/`) **OU** **(b)** casar uma das palavras-âncora de leads próprios (espelhar os exemplos do SYSTEM_PROMPT em [briefing-parser-service.ts:128](../../src/lib/agent/briefing-parser-service.ts#L128): "tenho minha lista", "minha planilha", "importar meus leads", "minha base de e-mails", "já tenho os contatos", "leads próprios", "CSV com contatos", "minha lista de e-mails") **And** sem esse sinal, o `import_leads`/`skipSteps` do LLM é **ignorado** e o fluxo segue como conversa normal (cai no restante do `handleParseResult` — re-apresenta o resumo / pergunta o que falta).

2. **[handleParseResult recebe a mensagem crua]** **Given** que hoje `handleParseResult` só recebe `result` (não tem o texto do usuário) **Then** sua assinatura passa a receber também a mensagem crua do turno (`userMessage: string`) **And** os **4 call sites** ([use-briefing-flow.ts:875,935,951](../../src/hooks/use-briefing-flow.ts#L875) + o do `awaiting_product_decision` se aplicável) passam o `content` correspondente **And** nenhum outro comportamento de `handleParseResult` muda.

3. **[Helper puro e testável]** **Given** a regra da AC1 **Then** ela vive num helper **puro** exportado (ex.: `messageSignalsOwnLeads(content: string): boolean` — regex de e-mail + lista de keywords normalizada, case/acento-insensitive no padrão dos helpers do projeto) **And** é a SSOT do sinal (sem literal repetido).

4. **[Fluxo legítimo de leads preservado — zero regressão 17.11]** **Given** o usuário que **de fato** tem leads ("já tenho minha lista de leads" ou cola e-mails) **Then** o fluxo `awaiting_leads_input` entra normalmente (a âncora está presente na própria mensagem) **And** os cenários da Story 17.11 (import de leads próprios) continuam funcionando — os testes existentes que hoje só mockam `skipSteps` são **adaptados** para que a mensagem do turno também traga a âncora (é o comportamento real: o usuário anuncia os leads na mensagem que dispara o fluxo).

5. **[Trade-off fail-safe explícito]** **Given** uma frase de leads muito fora do padrão (sem e-mail e sem keyword) que o LLM classifique como `import_leads` **Then** o guard **não** entra no fluxo de leads (fail-safe: segue a conversa em vez de sequestrá-la) **And** esse trade-off (preferir não-sequestrar a sequestrar) fica documentado — é a decisão consciente desta story (alinha com "LLM conversa, sub-fluxo caro exige âncora determinística" do Epic 22).

### Frente B — Modelo do parser

6. **[Troca de modelo com compat verificada]** **Given** `PARSER_MODEL = "gpt-4o-mini"` ([briefing-parser-service.ts:19](../../src/lib/agent/briefing-parser-service.ts#L19)) **When** trocado para o modelo-alvo decidido (recomendado `gpt-5.4-mini`; alternativa econômica `gpt-5.4-nano`) **Then** a chamada `client.chat.completions.create({ model, messages, response_format: { type: "json_object" }, temperature: PARSER_TEMPERATURE }, { signal })` ([briefing-parser-service.ts:186-194](../../src/lib/agent/briefing-parser-service.ts#L186)) é **verificada compatível** com o novo modelo — **ATENÇÃO:** a família gpt-5 pode **rejeitar `temperature` custom** (só aceitar o default) e/ou usar `max_completion_tokens` no lugar de `max_tokens`; se for o caso, ajustar a chamada (remover/normalizar `temperature`) sem quebrar o `response_format: json_object` **And** o `PARSER_TIMEOUT_MS` (5000ms) é reavaliado se o modelo novo for mais lento.

7. **[Consistência do parser de produto]** **Given** que existe também o parser de produto ([parse-product/route.ts](../../src/app/api/agent/executions/[executionId]/parse-product/route.ts) e o service correspondente) **Then** verificar se ele tem seu **próprio** constante de modelo e alinhá-lo à mesma decisão (evitar drift de modelo entre os dois parsers) **And** se a decisão for centralizar, extrair o modelo para um único ponto (SSOT).

8. **[Custo documentado com número real]** **Given** que o `/parse` roda **a cada mensagem** do briefing **Then** o custo incremental do modelo-alvo é documentado nas Completion Notes com preço **oficial** por 1M tokens (ver tabela em Dev Notes) e o efeito de **prompt caching** (o SYSTEM_PROMPT é idêntico a cada chamada → input cacheado é ~10x mais barato) **And** o resultado é consistente com o modelo de custo do projeto ([[feedback-cost-model-accuracy]]).

9. **[Validação sem regressão + o caso que falhou]** **Given** a suíte e o caso real do bug **Then** a troca de modelo (a) **corrige o caso reportado** — "o tamanho da empresa pode aumentar para mais de 50" no estado `confirming` NÃO vira `import_leads`; (b) **zero regressão** nos testes existentes do parser; (c) **smoke real** na conversa que falhou (lição do Epic 21: suíte mockada não prova a interpretação real do LLM — o teste mocka a OpenAI).

## Tasks / Subtasks

- [x] **Task 1 — Helper `messageSignalsOwnLeads` (puro, SSOT)** (AC: #3)
  - [x] Criar helper puro exportado: regex de e-mail (`/\S+@\S+\.\S+/`) + set de keywords de leads próprios (normalizado case/acento-insensitive — `normalizeForSignal`: `toLowerCase` + NFD/strip-diacríticos + strip-hífen, indo além do `toLowerCase` de `isConfirmation`/`isHelpRequest`). Keywords espelham [briefing-parser-service.ts:128](../../src/lib/agent/briefing-parser-service.ts#L128).
  - [x] Local: co-locado no `use-briefing-flow.ts` (client-side) e exportado para teste (mesmo lugar de `isConfirmation`/`isImportedLeadsFlow`).

- [x] **Task 2 — Passar a mensagem crua ao `handleParseResult` + aplicar o guard** (AC: #1, #2, #4, #5)
  - [x] Adicionar param `userMessage: string` a `handleParseResult`.
  - [x] Atualizar os call sites (confirming, awaiting_fields, idle) passando o `content` do turno. Confirmado: são **3** call sites de `handleParseResult`; `awaiting_product_decision` NÃO chama `handleParseResult` (trata inline), então não há 4º.
  - [x] No primeiro `if` do ramo de leads: exigir `messageSignalsOwnLeads(userMessage)` (aplicado a `nextAction==="import_leads"` **E** ao fallback `isImportedLeadsFlow`). Sem âncora → **não entra**, o código segue para os ramos seguintes (canProceed / re-apresentação do resumo).
  - [x] **Não** toquei no restante de `handleParseResult` — só o gate do ramo de leads.

- [x] **Task 3 — Frente B: troca de modelo + compat** (AC: #6, #7) — código feito; **compat ao vivo PROVADA no smoke (Task 5)**
  - [x] Trocar `PARSER_MODEL` para `gpt-5.4-mini`. Centralizado num SSOT novo (`src/lib/agent/parser-config.ts`) — AC7: os DOIS parsers (briefing + produto) consomem o mesmo constante, sem drift.
  - [x] **Verificar compat da chamada**: `buildParserRequest` OMITE `temperature` para a família gpt-5, mantendo `response_format: json_object`; `PARSER_TIMEOUT_MS` ampliado 5000→8000ms. **Compat CONFIRMADA ao vivo** (smoke: `/parse` → 200, JSON válido, gpt-5.4-mini classifica bem). Latência real 3.3–4.4s → o bump do timeout se justificou.
  - [x] Alinhar o parser de PRODUTO (AC7) ao mesmo modelo — feito via SSOT (`parser-config`), centralizado num único ponto.

- [x] **Task 4 — Testes** (AC: #4, #9)
  - [x] Frente A (RED→GREEN): no estado `confirming`, "O tamanho da empresa pode aumentar para mais de 50." com parse mockado `nextAction: "import_leads"` → **NÃO** entra em `awaiting_leads_input` (fica em `confirming`). **RED PROVADO**: removendo o guard, o teste falha (`awaiting_leads_input`). Caso positivo (confirming + "na verdade ja tenho meus leads" → entra) e caso e-mail (idle + e-mails colados → entra).
  - [x] Testes 17.11 existentes: **verificados sem edição** — os triggers já usam mensagens com âncora ("Ja tenho meus leads", "...ja tenho minha lista de contatos"), confirmando a premissa (o usuário anuncia os leads na própria mensagem que dispara o fluxo). Documentado: nenhuma adaptação foi necessária, é o comportamento real.
  - [x] Helper `messageSignalsOwnLeads`: casos unitários (e-mail; keywords; frase de filtro → false; vazio → false; acento/hífen-insensitive).
  - [x] `npx vitest run` (zero regressão: 7015 pass / 2 skip / 0 fail — o único FAIL é o flaky pré-existente do `EmailBlock`, verde isolado 105/105, sem código de agente); `npx tsc --noEmit` (0 em `src/`); `npx eslint --max-warnings=0` limpo nos 8 tocados.

- [x] **Task 5 — Smoke real pela interface (definição-de-pronto)** (AC: #9) — **FEITO (Playwright, gpt-5.4-mini real, banco real, logado Fabossi)**
  - [x] Skill `verify`: 3/3 cenários passaram na tela — (1) "prospectar CTOs de Atibaia, São Paulo" → resumo (confirming), `/parse` 200 com gpt-5.4-mini (compat AC6 provada ao vivo); (2) **"O tamanho da empresa pode aumentar para mais de 50."** → agente **ajustou o filtro** (`- Tamanho: 50+`) e **re-apresentou o resumo**, NÃO pediu leads (BUG MORTO); (3) "Na verdade, já tenho meus leads prontos numa lista." → entrou no fluxo de importação ("Cole a lista abaixo..."). NÃO cliquei "Iniciar Execução" (guardrail de custo respeitado).
  - [x] Custo/latência real (AC8) registrado nas Completion Notes.

- [x] **Task 6 — Anotar follow-up** (documentação)
  - [x] Registrado em [deferred-work.md](deferred-work.md): mesmo padrão "confia no `nextAction` sem âncora" em `awaiting_product_decision` → `register_product` (blast radius menor; candidato ao mesmo guardrail se reproduzir). +1 defer LOW do `PARSER_TIMEOUT_MS` (estimativa, não medição).

## Dev Notes

### DEV AGENT GUARDRAILS — o que NÃO quebrar

- **NFR1 — determinismo do pipeline intocado:** a Frente A só decide **entrada no sub-fluxo de leads no cliente**; não muda ordem de steps, gasto, `skipSteps` canonicalizados no route, nem o orchestrator. A Frente B só troca o modelo do parser (conversa) — o pipeline segue determinístico.
- **NFR — first-time/regressão:** o fluxo legítimo de import (17.11) e o de produto (16.6) não podem quebrar. A âncora está sempre presente na mensagem real que dispara o fluxo de leads; os testes que assumiam o contrário são adaptados, não removidos.
- **PT-BR** em todo texto de UI; ESLint `no-console`; Tailwind v4 `flex flex-col gap-*` (não há UI nova nesta story, mas vale a regra).
- **Lição Epic 21/[[project-schema-constraint-blind-spot]] (4ª dimensão — concorrência/LLM):** a suíte **mocka a OpenAI** — ela NÃO prova que o modelo real classifica certo nem que a troca de modelo mantém a interpretação. Por isso o smoke real (Task 5) é definição-de-pronto, não opcional.
- **Fail-safe, não fail-open perigoso:** na dúvida, o guard **não** entra no fluxo de leads (segue a conversa). Nunca o contrário — sequestrar a conversa é o bug que estamos matando.

### A mudança em uma frase

O sub-fluxo de "colar leads" deixa de disparar só na palavra (alucinável) do LLM e passa a exigir um **sinal determinístico de leads na mensagem crua** (e-mail ou keyword) — e o parser sobe de `gpt-4o-mini` para um modelo atual, reduzindo a má-classificação na origem.

### Estado atual dos arquivos-chave (verificado no código)

- **[use-briefing-flow.ts](../../src/hooks/use-briefing-flow.ts):** `isImportedLeadsFlow` (306-309, exige `skipSteps` com `search_companies`+`search_leads`); `handleParseResult` (438-…, **primeiro `if` é o gatilho de leads na linha 457** e NÃO recebe a mensagem crua); estado `confirming` (845-886) chama `handleParseResult` na 875; `awaiting_fields` chama na 935; `idle` na 951. `processMessage` (583-…) é quem tem o `content` do turno.
- **[briefing-parser-service.ts](../../src/lib/agent/briefing-parser-service.ts):** `PARSER_MODEL = "gpt-4o-mini"` (19), `PARSER_TEMPERATURE = 0.1` (20), `PARSER_TIMEOUT_MS = 5000` (21); chamada em 186-194 (`response_format: json_object`, `temperature`); SYSTEM_PROMPT com a regra de `import_leads` na 128; schema Zod com `nextAction` enum (59-60).

### Frente B — dados oficiais de modelo/preço (fonte: developers.openai.com/api/docs/pricing, 2026-07-24)

| Modelo | Input /1M | Output /1M | Cached input /1M | Structured Output |
|---|---|---|---|---|
| **gpt-4o-mini** (atual) | ~$0,15 | ~$0,60 | — | sim (json_object) |
| **gpt-5.4-nano** | $0,20 | $1,25 | $0,02 | sim |
| **gpt-5.4-mini** (recomendado) | $0,75 | $4,50 | $0,075 | sim |
| gpt-5.4 | $2,50 | $15,00 | $0,25 | sim |

- **Por que `gpt-5.4-mini` recomendado:** o problema é **qualidade de classificação de intenção** (o mini atual erra). `gpt-5.4-mini` é o salto de qualidade com custo ainda modesto; `gpt-5.4-nano` é mais barato e ainda assim mais novo que o `4o-mini`, mas pode não fechar 100% a qualidade. Decisão final = Fabossi (ver Decisão Aberta).
- **Prompt caching importa muito aqui:** o SYSTEM_PROMPT é idêntico a cada `/parse` → o input cacheado (10x mais barato) domina o custo real numa conversa de vários turnos. O custo "por mensagem" real é bem menor que o preço de input cheio sugere.
- **Risco de API (verificar no dev):** modelos gpt-5 podem exigir `temperature` default (rejeitar `0.1`) e/ou `max_completion_tokens`. A chamada atual passa `temperature: 0.1` — se quebrar, remover/normalizar. Não deixar isso derrubar o `/parse` (fail-open já existe no catch do parser).

### Decisão de modelo — RESOLVIDA (Fabossi, 2026-07-24): `gpt-5.4-mini`

- **Modelo-alvo: `gpt-5.4-mini`** ($0,75 input / $4,50 output por 1M, cached $0,075). Escolhido porque a dor é **má-classificação de intenção** e o mini dá o salto real de qualidade; o custo por conversa fica moderado graças ao prompt caching (SYSTEM_PROMPT fixo).
- **Plano B — `gpt-5.4-nano`** ($0,20 / $1,25, cached $0,02): só se o dev encontrar surpresa de custo ao vivo (Task 5/AC8) OU se `gpt-5.4-mini` tiver incompatibilidade de API não-contornável (AC6). Nesse caso, registrar o motivo nas Completion Notes e usar o nano.
- **Structured Outputs (`json_schema`)** em vez de `json_object`: possível nos gpt-5 e reduziria alucinação de *shape* — mas é mudança maior; **deferido** de propósito (não inflar esta story).

### Testing standards

- Vitest, `npx vitest run`. `use-briefing-flow` já tem testes; seguir o setup existente. Provar RED: reverter o gate do import_leads derruba o teste do "ajuste de filtro não vira leads".
- A suíte MOCKA a OpenAI → a Frente B **precisa** do smoke real (Task 5). O teste unitário prova o guard (Frente A) e o wiring, não a inteligência do modelo.

### References

- [Source: src/hooks/use-briefing-flow.ts#L457] — gatilho de `import_leads` (alvo Frente A)
- [Source: src/hooks/use-briefing-flow.ts#L306-L309] — `isImportedLeadsFlow` (sinal `skipSteps`)
- [Source: src/hooks/use-briefing-flow.ts#L845-L886] — estado `confirming` que chamou `handleParseResult` no bug
- [Source: src/lib/agent/briefing-parser-service.ts#L19-L21] — constantes do parser (alvo Frente B)
- [Source: src/lib/agent/briefing-parser-service.ts#L128] — regra de `import_leads` no SYSTEM_PROMPT (base das keywords)
- [Source: src/lib/agent/briefing-parser-service.ts#L186-L194] — chamada OpenAI (compat de API)
- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.4] — Sub-fluxos como Decisão do Agente (a decisão D1 de 22.4 que esta story reforça com âncora determinística)
- [Source: OpenAI pricing oficial — developers.openai.com/api/docs/pricing] — tabela de custo (2026-07-24)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — dev-story 2026-07-24.

### Debug Log References

- **RED provado (Frente A)**: removendo o clause `&& messageSignalsOwnLeads(userMessage)` do guard, o teste "NAO entra em awaiting_leads_input quando o LLM alucina import_leads para um ajuste de filtro" falha com `expected 'awaiting_leads_input' not to be 'awaiting_leads_input'` — o ramo caro dispara sem a âncora. Com o guard, verde.
- **Regressão**: `npx vitest run` → 400 files, 7015 pass / 2 skip / 1 fail; o único fail é `EmailBlock.test.tsx:932` (flaky `waitFor` pré-existente, documentado nas stories 22.8/22.10) → passa 105/105 isolado. Zero regressão atribuível à 22.11.
- **tsc**: `npx tsc --noEmit` → 0 erros em `src/` (erros pré-existentes em `__tests__/` fora do escopo).
- **eslint**: `--max-warnings=0` limpo nos 8 arquivos tocados.

### Completion Notes List

**Frente A — Guard determinístico (fecha o bug de vez):**
- Helper puro `messageSignalsOwnLeads(content)` co-locado e exportado em `use-briefing-flow.ts` (AC3, SSOT): (a) regex de e-mail `/\S+@\S+\.\S+/` OU (b) uma keyword-âncora de leads próprios (19 âncoras normalizadas espelhando o SYSTEM_PROMPT do parser). `normalizeForSignal` = lowercase + strip-diacríticos (NFD) + strip-hífen → robusto a acento e a "e-mails"/"emails".
- `handleParseResult` ganhou o param `userMessage: string` (AC2); os **3** call sites (confirming/awaiting_fields/idle) passam o `content` do turno. Confirmado que `awaiting_product_decision` trata inline e não chama `handleParseResult` (não há 4º call site).
- O gate do ramo de leads passou a exigir `messageSignalsOwnLeads(userMessage)` junto de `(nextAction==="import_leads" || isImportedLeadsFlow)`. Sem âncora, o `import_leads`/`skipSteps` do LLM é ignorado e o fluxo segue como conversa normal (AC1). Fail-safe (AC5): na dúvida NÃO sequestra a conversa — trade-off consciente (preferir não-sequestrar). Um ajuste de filtro nunca tem e-mail nem keyword → nunca dispara, independente da alucinação do modelo.
- Zero regressão 17.11 (AC4): os testes de import de leads já disparavam com mensagens que trazem a âncora ("Ja tenho meus leads", "...ja tenho minha lista de contatos") — comportamento real, nenhuma adaptação necessária.

**Frente B — Modelo do parser:**
- `PARSER_MODEL` `gpt-4o-mini` → **`gpt-5.4-mini`** (decisão Fabossi 2026-07-24). Centralizado num SSOT novo `src/lib/agent/parser-config.ts` consumido pelos DOIS parsers (briefing + produto) — AC7, sem drift de modelo.
- Compat de API (AC6) tratada defensivamente: `buildParserRequest` OMITE `temperature` para a família gpt-5 (que pode rejeitar override), mantendo `response_format: json_object`. `PARSER_TIMEOUT_MS` ampliado 5000→8000ms (gpt-5.4-mini pode ser mais lento; reavaliar no smoke — defer LOW).
- **Custo documentado (AC8)** — preço oficial (developers.openai.com, 2026-07-24), por 1M tokens: `gpt-5.4-mini` = **$0,75 input / $4,50 output, cached $0,075** (vs `gpt-4o-mini` ~$0,15 / ~$0,60). O `/parse` roda a cada turno, mas o SYSTEM_PROMPT é idêntico → **prompt caching** (input cacheado ~10x mais barato, $0,075/1M) domina o custo real numa conversa de vários turnos. Plano B `gpt-5.4-nano` ($0,20 / $1,25, cached $0,02) reservado para surpresa de custo/compat. Consistente com [[feedback-cost-model-accuracy]] (fonte oficial, não blog). **Custo real por conversa ainda a medir no smoke (AC8/AC9).**

**✅ Smoke real FEITO (Task 5 / AC6 ao vivo / AC8 / AC9)** — Playwright, `gpt-5.4-mini` real, banco real, logado Fabossi (admin), dev server em `:3000`. 3/3 cenários:
1. **"Olá, eu queria prospectar CTOs de Atibaia, São Paulo."** → agente montou o resumo (Cargos: CTO / Localizacao: Atibaia, São Paulo), estado `confirming`. `POST /api/agent/briefing/parse` → **200**. **Compat de API (AC6) PROVADA ao vivo**: a chamada com `gpt-5.4-mini` (sem `temperature`, `response_format: json_object`) funciona e devolve JSON estruturado válido — o modelo existe e classifica bem.
2. **"O tamanho da empresa pode aumentar para mais de 50."** (o passo que reproduzia o bug) → agente respondeu **"Entendi! Vou prospectar... - Tamanho: 50+ ... Confirma esses parametros?"** — **AJUSTOU o filtro e RE-APRESENTOU o resumo, NÃO pediu "cole seus leads"**. **BUG MORTO** (AC1/AC5/AC9). Dupla defesa observada: o `gpt-5.4-mini` classificou corretamente (benefício da Frente B) E o guard determinístico seguraria mesmo se alucinasse (Frente A).
3. **"Na verdade, já tenho meus leads prontos numa lista."** → agente entrou no fluxo de importação ("Cole a lista abaixo no formato..."). Caso positivo OK (AC1/AC4) — a mensagem traz a âncora ("minha lista"/"meus leads").

**Custo/latência real (AC8):** as 3 chamadas `/parse` levaram **4.4s, 3.3s, 3.7s** (render/LLM dominante). O `gpt-5.4-mini` é mais lento que o `gpt-4o-mini`: a 1ª bateu 4.4s → o `PARSER_TIMEOUT_MS` original de **5000ms teria ficado perigosamente apertado** (jitter poderia estourar e disparar fail-open a cada turno). **O bump para 8000ms se justificou pela medição real.** Custo por chamada não foi extraído do `api_usage_logs` (exigiria query no banco); mantém-se o número oficial documentado acima ($0,75/$4,50 por 1M, cached $0,075) — com prompt caching (SYSTEM_PROMPT fixo) o custo real por conversa é fração de centavo. Sem incompatibilidade nem surpresa de custo → **plano B (`gpt-5.4-nano`) NÃO acionado**. Guardrail de custo: NÃO cliquei "Iniciar Execução".

**Observação (não-falha):** único erro de console = hydration mismatch **pré-existente** do submenu "Leads" da Sidebar (chevron/aria-expanded), documentado em stories anteriores; não-relacionado à 22.11.

A Frente A já fechava o bug de forma determinística, independente do modelo; o smoke confirmou o comportamento ponta-a-ponta e a compatibilidade/latência do modelo novo.

### File List

**Novos:**
- `src/lib/agent/parser-config.ts` — SSOT do modelo dos parsers + `buildParserRequest` compat-safe (Frente B).
- `__tests__/unit/lib/agent/parser-config.test.ts`

**Modificados (src):**
- `src/hooks/use-briefing-flow.ts` — helper `messageSignalsOwnLeads` + `normalizeForSignal` + `OWN_LEADS_KEYWORDS`; `userMessage` em `handleParseResult` (3 call sites) + guard no ramo de leads.
- `src/lib/agent/briefing-parser-service.ts` — consome `parser-config` (modelo + `buildParserRequest`); removidas as constantes locais de modelo/temperature.
- `src/lib/agent/product-parser-service.ts` — idem (AC7, alinhado ao mesmo modelo via SSOT).

**Modificados (testes):**
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — bloco "Guard determinístico do import_leads (Story 22.11)": unit do helper + RED→GREEN do guard + casos positivos.
- `__tests__/unit/lib/agent/briefing-parser-service.test.ts` — contrato do modelo `gpt-5.4-mini` sem temperature.
- `__tests__/unit/lib/agent/product-parser-service.test.ts` — idem.

**Modificados (docs):**
- `_bmad-output/implementation-artifacts/deferred-work.md` — follow-up `register_product` + timeout.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 22-11 → in-progress.
- `_bmad-output/implementation-artifacts/22-11-guard-import-leads-e-modelo-do-parser.md` — este arquivo.

## Review Finding (2026-07-24, teste E2E ponta-a-ponta — tratar antes de fechar a story)

**Caso novo reproduzido ao vivo COM o guard ativo** (branch atual): no estado `confirming`, a mensagem composta *"pode incluir empresas com menos de 11 funcionários? E como é um teste, quero **importar** no máximo 2 leads"* produziu:

1. O guard **funcionou no que promete**: `messageSignalsOwnLeads` = false ("importar no máximo 2 leads" não casa nenhuma das 19 keywords nem tem e-mail) → NÃO entrou em `awaiting_leads_input` (não pediu "cole a lista"). ✅
2. **MAS o briefing ficou poluído**: o parser (gpt-5.4-mini) devolveu `skipSteps: [search_companies, search_leads]` + `emailCount: 2`, e o fluxo "segue como conversa normal" **re-apresentando o resumo com o briefing poluído**: *"Etapas de busca de empresas e leads serão puladas — **0 leads importados serão usados diretamente**... Confirma esses parâmetros?"*. Se o usuário leigo confirmar → execução com busca pulada e 0 leads = campanha vazia.

**Gap vs AC1**: a AC1 diz que sem âncora "o `import_leads`/`skipSteps` do LLM é **ignorado**" — a implementação ignora o RAMO, mas o `skipSteps` alucinado sobrevive no briefing que segue para o resumo/confirmação. Fix sugerido (cirúrgico): quando o guard barra o ramo de leads, **sanitizar** `search_leads` (e `search_companies` se não-tech) do `briefing.skipSteps` antes de seguir — o mesmo espírito da reconciliação de skipSteps do patch A da 22.4, na direção inversa. Caso de teste: a mensagem composta acima (RED contra o código atual: resumo contém "0 leads importados").

Nota adicional (escopo 22.11 ou 22.5, decidir na review): "no máximo 2 **leads**" virou `emailCount: 2` — o parser não distingue quantidade de leads de tamanho de sequência (não existe `leadCount`; a Story 22.14/22.15+ do backlog trata o conceito). Mínimo aqui: não mapear números ligados à palavra "leads" para `emailCount`.

### Review Findings

**Code review adversarial (2026-07-24) — 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo full. Verificado em código ponta-a-ponta.** O achado nº1 confirma, de forma independente pelas 3 camadas, a "Review Finding" que a própria story já registrava (o guard é meio-fix). Resultado: **2 decision-needed, 2 patch, 5 defer, 4 dismiss**. Auditor: AC2/AC3/AC4/AC5/AC7 SATISFEITOS; AC6 satisfeito em código (compat provada no smoke); AC1 e AC8 parciais.

**Resolução (2026-07-24):** 2 patches **APLICADOS** (nº1 = AC1 + D1 preservar leads; nº2 = briefingChanged), emailCount **DEFERIDO** p/ 22.14/22.15 (no `deferred-work.md`). Suíte **400 files / 7019 pass / 2 skip / 0 fail**; **RED provado** (os 4 asserts-alvo falham com o fix revertido); `tsc` 0 em `src/`; `eslint --max-warnings=0` limpo nos 8. AC1 agora cumprido de fato. Status → **done**.

- [x] [Review][Decision→Patch] **RESOLVIDO (Fabossi: preservar leads → patch nº1):** Correção após import de leads descarta `importedLeads` silenciosamente — No `confirming` com leads já colados (state.briefing.importedLeads populado, [use-briefing-flow.ts:872](../../src/hooks/use-briefing-flow.ts#L872)), uma correção sem âncora (ex.: "troca o cargo pra CFO") faz o guard barrar o ramo e o fall-through sobrescrever `state.briefing` com `result.briefing` — que NUNCA traz `importedLeads` (montado campo-a-campo em [briefing-parser-service.ts:209-224](../../src/lib/agent/briefing-parser-service.ts#L209)). Os leads colados somem sem aviso; **antes da 22.11** o ramo re-entrava em `awaiting_leads_input` e os re-coletava. Decisão de produto: preservar `prev.briefing.importedLeads` ao barrar, ou re-perguntar? Sem teste cobrindo correção-após-import.
- [x] [Review][Decision→Defer] **DEFERIDO p/ 22.14/22.15 (registrado no deferred-work):** `"no máximo 2 leads"` → `emailCount: 2` — O parser mapeia quantidade de leads para tamanho de sequência de e-mail; o resumo exibe "- Nº de e-mails: 2" incorretamente ([use-briefing-flow.ts:201](../../src/hooks/use-briefing-flow.ts#L201)). A própria story marca "escopo 22.11 ou 22.5, decidir na review". Corrigir agora (mínimo: não mapear números ligados à palavra "leads" para `emailCount`) ou deferir para 22.14/22.15?

- [x] [Review][Patch] **APLICADO:** AC1 NÃO cumprido: `skipSteps` alucinado sobrevive ao guard → campanha confirmável que quebra a execução [src/hooks/use-briefing-flow.ts:522-556] — Quando o guard barra o ramo de leads (sem âncora), o `skipSteps: [search_companies, search_leads]` que o SYSTEM_PROMPT MANDA o modelo acoplar a `import_leads` ([briefing-parser-service.ts:124](../../src/lib/agent/briefing-parser-service.ts#L124)) sobrevive no `result.briefing` armazenado no fall-through ([:560-644](../../src/hooks/use-briefing-flow.ts#L560)). A rota ainda força os dois skips e seta `canProceed: true` ([route.ts:254-259,103](../../src/app/api/agent/briefing/parse/route.ts#L254)), então o resumo re-apresentado diz **"0 leads importados serão usados diretamente. Confirma?"** ([:231-234](../../src/hooks/use-briefing-flow.ts#L231)); um "sim" confirma e a execução **lança** "Lista de leads importados esta vazia" ([create-campaign-step.ts:100](../../src/lib/agent/steps/create-campaign-step.ts#L100)). Fix (já sugerido na story): ao barrar o ramo, sanitizar `skipSteps` (remover `search_leads`; re-derivar `search_companies` pela regra de tecnologia) antes de seguir → AC1 "skipSteps ignorado" passa a valer. **O teste atual mocka `skipSteps: []` (contradiz o prompt) e mascara o veneno** — fortalecer o RED com o shape realista e assertar ausência de "0 leads importados" no resumo. Encontrado por Blind+Edge+Auditor.
- [x] [Review][Patch] **APLICADO:** `briefingChanged` ignora `skipSteps` → um "sim" confirma um import-shape injetado sem passar pelo guard [src/hooks/use-briefing-flow.ts:279-295] — No `confirming`, `keywordConfirmed = isConfirmation && !briefingChanged`; como `briefingChanged` não compara `skipSteps` ([:279-295](../../src/hooks/use-briefing-flow.ts#L279)), se o parser devolver `import_leads`+skipSteps sem mudar outro campo, um "sim"/"pode" confirma direto ([:930-938](../../src/hooks/use-briefing-flow.ts#L930)) para o estado envenenado — o guard nem é consultado (é um 2º portão, que o fix do patch nº1 sozinho NÃO fecha). Pré-existente (22.3), mas é a MESMA porta que a story fecha. Fix: incluir `skipSteps` na comparação de `briefingChanged`.

- [x] [Review][Defer] Falsos negativos de keyword uma palavra fora da lista ("planilha com contatos", "csv de contatos", singular "minha base de email") [src/hooks/use-briefing-flow.ts:328-348] — deferred, trade-off AC5 (fail-safe); inócuo depois do patch nº1
- [x] [Review][Defer] Guard olha só o turno atual — âncora dita num turno anterior não conta [src/hooks/use-briefing-flow.ts:522-524] — deferred, by-design AC5
- [x] [Review][Defer] Residual de falsos positivos por substring (URL com @, "meus leads"/"minha listagem", negação "não tenho leads próprios") [src/hooks/use-briefing-flow.ts:355-362] — deferred, mitigado pela conjunção com o LLM (sem regressão vs pré-22.11: o guard só NARROWS)
- [x] [Review][Defer] `isGpt5Family` por prefixo + ramo `temperature` morto (dead code até editar o const) [src/lib/agent/parser-config.ts:37-58] — deferred, defensivo correto p/ modelo atual + plano B gpt-5.4-nano
- [x] [Review][Defer] Custo do `/parse` com gpt-5.4-mini não refletido no SSOT `docs/custos-operacao.md` (AC8) [docs/custos-operacao.md] — deferred, follow-up de doc ([[feedback-cost-model-accuracy]])

**Dismiss (noise):** `PARSER_TIMEOUT_MS=8000` vs orçamento serverless (default Vercel = 300s, 8s é trivial); ReDoS no email regex (exige paste patológico de ~50k chars sem ponto; 1º e-mail real curto-circuita); smoke AC6/AC9 "asserted-only" (smoke documentado como feito na story); strip de hífen em "leads-proprios" (negligível, AC5 cobre).

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | **Code review bmad 3 camadas (Blind/Edge/Auditor, full) → 2 patches APLICADOS + story FECHADA.** Confirmado pelas 3 camadas o gap de AC1 que a própria story registrava: o guard barrava o ramo mas o `skipSteps` alucinado (que o SYSTEM_PROMPT MANDA acoplar a `import_leads`) sobrevivia no `result.briefing` do fall-through → rota computava `canProceed:true` via `isImportedLeadsFlow` → resumo "0 leads importados serão usados diretamente. Confirma?" → "sim" → execução lançava "Lista de leads importados esta vazia" (`create-campaign-step:100`). **Patch nº1** (`reconcileNonImportBriefing`): ao barrar o ramo sem âncora e sem leads reais, remove `search_leads` e re-deriva `search_companies` pela tecnologia (espelha o route) + recomputa o gate → AC1 "skipSteps ignorado" passa a valer; **D1** (decisão Fabossi): se já há `importedLeads` em andamento, preserva-os + o fluxo (correção não some com os leads). **Patch nº2**: `briefingChanged` passa a comparar `skipSteps` → um "sim" não confirma um import-shape injetado sem passar pelo guard. +4 asserts (RED provado: os 4 falham com o fix revertido). Suíte 400 files/7019 pass/2 skip/0 fail; tsc 0 em `src/`; eslint limpo nos 8. emailCount("2 leads"→`emailCount:2`) DEFERIDO p/ 22.14/22.15; 5 defers LOW no `deferred-work.md` (falsos neg/pos residuais AC5, guard por-turno, `isGpt5Family` por prefixo, custo SSOT). 4 dismiss. Status review → **done**. |
| 2026-07-24 | **Review finding registrado (teste E2E)**: guard barra o ramo mas `skipSteps` alucinado sobrevive no briefing re-apresentado ("0 leads importados serão usados diretamente. Confirma?") — gap vs AC1 ("skipSteps ignorado"); fix sugerido = sanitizar skipSteps ao barrar; caso de teste da mensagem composta documentado acima. +nota: "2 leads" → `emailCount: 2`. |
| 2026-07-24 | **Smoke real FEITO** (Playwright, gpt-5.4-mini real, banco real, Fabossi): 3/3 cenários — resumo OK; **"aumentar tamanho pra mais de 50" AJUSTOU o filtro e re-apresentou o resumo (BUG MORTO, não pediu leads)**; "já tenho meus leads" entrou na importação. `/parse` 200 (compat gpt-5.4-mini ao vivo, AC6). Latência 3.3–4.4s → bump do timeout p/ 8000ms justificado. Sem "Iniciar Execução" (guardrail). Único erro = hydration mismatch pré-existente do submenu Leads. Status → **review**. |
| 2026-07-24 | dev-story (Opus 4.8): Story 22.10 committed (`85fbd2a`) como baseline. **Frente A** implementada — helper puro `messageSignalsOwnLeads` (SSOT: e-mail regex + 19 keywords-âncora normalizadas), `userMessage` em `handleParseResult` (3 call sites) e guard no ramo de leads (fail-safe). **RED provado** (sem o guard, o ajuste de filtro vira `awaiting_leads_input`). **Frente B** implementada — `PARSER_MODEL gpt-4o-mini → gpt-5.4-mini` num SSOT novo (`parser-config.ts`) consumido pelos 2 parsers (AC7); compat defensiva (`buildParserRequest` omite `temperature` p/ gpt-5; timeout 5000→8000ms); custo oficial documentado (AC8). Suíte 7015 pass / 0 regressão (1 flaky pré-existente do EmailBlock); tsc 0 em `src/`; eslint limpo nos 8. Tasks 1,2,4,6 ✅; Task 3 código ✅ (compat ao vivo pende do smoke); **Task 5 (smoke real, def-de-pronto) PENDENTE — aguarda go-ahead do Fabossi (chamada paga gpt-5.4-mini + Playwright)**. |
| 2026-07-24 | Decisão de modelo resolvida (Fabossi): modelo-alvo `gpt-5.4-mini` (plano B `gpt-5.4-nano` se surpresa de custo/compat). |
| 2026-07-24 | Story 22.11 criada (create-story). Origem: teste real do Fabossi — ajuste de filtro ("aumentar tamanho da empresa") disparou o fluxo de "cole seus leads". Diagnóstico: gpt-4o-mini alucinou `nextAction: import_leads` e o código confia no `nextAction` sem âncora determinística ([use-briefing-flow.ts:457]). Duas frentes: (A) guard exige sinal real de leads na mensagem crua — regex de e-mail ou keyword — para entrar no sub-fluxo; (B) trocar `gpt-4o-mini` por modelo atual (recomendado gpt-5.4-mini) com compat de API verificada, custo oficial documentado e smoke real. Depende do commit da 22.10. Status → ready-for-dev. |
