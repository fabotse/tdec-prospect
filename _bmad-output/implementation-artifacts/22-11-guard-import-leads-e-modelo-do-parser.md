---
baseline_commit: pendente  # commitar a Story 22.10 (0a16578 + patches do code-review 22.10, hoje uncommitted) ANTES de iniciar a 22.11; usar esse SHA como baseline
---

# Story 22.11: Guardrail Determinístico de Sub-fluxo (import_leads) + Atualização do Modelo do Parser

Status: ready-for-dev

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

- [ ] **Task 1 — Helper `messageSignalsOwnLeads` (puro, SSOT)** (AC: #3)
  - [ ] Criar helper puro exportado: regex de e-mail (`/\S+@\S+\.\S+/`) + set de keywords de leads próprios (normalizado case/acento-insensitive — seguir o padrão de normalização já usado nos helpers de keyword do hook, ex.: `isConfirmation`/`isHelpRequest`). Keywords espelham [briefing-parser-service.ts:128](../../src/lib/agent/briefing-parser-service.ts#L128).
  - [ ] Local: co-locado no `use-briefing-flow.ts` (client-side) e exportado para teste, OU leaf util em `src/lib/agent/` se o projeto preferir (checar onde vivem `isConfirmation`/`isImportedLeadsFlow` e seguir o mesmo lugar).

- [ ] **Task 2 — Passar a mensagem crua ao `handleParseResult` + aplicar o guard** (AC: #1, #2, #4, #5)
  - [ ] Adicionar param `userMessage: string` a `handleParseResult` ([use-briefing-flow.ts:438](../../src/hooks/use-briefing-flow.ts#L438)).
  - [ ] Atualizar os call sites ([:875](../../src/hooks/use-briefing-flow.ts#L875), [:935](../../src/hooks/use-briefing-flow.ts#L935), [:951](../../src/hooks/use-briefing-flow.ts#L951)) passando o `content` do turno. Conferir se há outros.
  - [ ] No primeiro `if` ([:457](../../src/hooks/use-briefing-flow.ts#L457)): exigir `messageSignalsOwnLeads(userMessage)` para entrar no ramo de leads. Sem âncora → **não entra**, o código segue para os ramos seguintes (canProceed / re-apresentação do resumo).
  - [ ] **Não** tocar no restante de `handleParseResult` (register_product, confirming, awaiting_fields, etc.) — só o gate do ramo de leads.

- [ ] **Task 3 — Frente B: troca de modelo + compat** (AC: #6, #7)
  - [ ] Trocar `PARSER_MODEL` ([briefing-parser-service.ts:19](../../src/lib/agent/briefing-parser-service.ts#L19)) para o modelo-alvo decidido (ver Decisão Aberta).
  - [ ] **Verificar compat da chamada** ([:186-194](../../src/lib/agent/briefing-parser-service.ts#L186)): rodar 1 chamada real; se `temperature` custom for rejeitada pela família gpt-5, remover/normalizar; confirmar `response_format: json_object` OK; conferir nome do param de tokens. Reavaliar `PARSER_TIMEOUT_MS` se necessário.
  - [ ] Alinhar o parser de PRODUTO (AC7) ao mesmo modelo (ou centralizar num único constante).

- [ ] **Task 4 — Testes** (AC: #4, #9)
  - [ ] Frente A (RED→GREEN): no estado `confirming`, mensagem "o tamanho da empresa pode aumentar para mais de 50" com parse mockado `nextAction: "import_leads"` → **NÃO** entra em `awaiting_leads_input` (fica em confirming / re-apresenta). RED: sem o guard, entra. E o caso positivo: "já tenho minha lista de leads" (ou mensagem com e-mail) + `import_leads` → entra.
  - [ ] Adaptar os testes 17.11 existentes (mocks com `skipSteps`): garantir que a mensagem do turno traz a âncora (comportamento real). Documentar a adaptação.
  - [ ] Helper `messageSignalsOwnLeads`: casos unitários (e-mail; cada keyword; frase de filtro → false; vazio → false).
  - [ ] `npx vitest run` (zero regressão vs baseline), `npx tsc --noEmit` (0 em `src/`), `npx eslint --max-warnings=0` nos tocados.

- [ ] **Task 5 — Smoke real pela interface (definição-de-pronto)** (AC: #9)
  - [ ] Skill `verify` (Playwright, LLM real, banco real): reproduzir a conversa do bug — (1) prospectar CTOs → resumo; (2) "aumentar tamanho da empresa pra mais de 50" → **agente ajusta o filtro e re-apresenta o resumo** (NÃO pede leads); (3) caso positivo: "na verdade já tenho meus leads" → entra no fluxo de importação. Guardrail de custo: NÃO clicar "Iniciar Execução".
  - [ ] Registrar nas Completion Notes o custo real observado do modelo novo (AC8) e o comportamento do caso que falhava.

- [ ] **Task 6 — Anotar follow-up** (documentação)
  - [ ] Registrar em [deferred-work.md](deferred-work.md): o mesmo padrão "confia no `nextAction` sem âncora" existe em `awaiting_product_decision` → `register_product` ([use-briefing-flow.ts:608](../../src/hooks/use-briefing-flow.ts#L608)) — blast radius menor (pede detalhes do produto, não abandona a busca) e fora do escopo desta story; candidato ao mesmo guardrail se reproduzir.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Decisão de modelo resolvida (Fabossi): modelo-alvo `gpt-5.4-mini` (plano B `gpt-5.4-nano` se surpresa de custo/compat). |
| 2026-07-24 | Story 22.11 criada (create-story). Origem: teste real do Fabossi — ajuste de filtro ("aumentar tamanho da empresa") disparou o fluxo de "cole seus leads". Diagnóstico: gpt-4o-mini alucinou `nextAction: import_leads` e o código confia no `nextAction` sem âncora determinística ([use-briefing-flow.ts:457]). Duas frentes: (A) guard exige sinal real de leads na mensagem crua — regex de e-mail ou keyword — para entrar no sub-fluxo; (B) trocar `gpt-4o-mini` por modelo atual (recomendado gpt-5.4-mini) com compat de API verificada, custo oficial documentado e smoke real. Depende do commit da 22.10. Status → ready-for-dev. |
