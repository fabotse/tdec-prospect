---
baseline_commit: 1c35f8dbfeb3f8e646c937fc9a8cd5ecb2a83a3d
---

# Story 22.1: Tecnologia Opcional, Localização Obrigatória

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want completar o briefing informando apenas cargo e localização,
so that eu prospecte sem depender de tecnologia/TheirStack e sem cair em loop de perguntas.

## Contexto do Épico (por que esta story existe)

Diagnóstico do Fabossi em teste manual: o agente **parece obrigar** o usuário a informar
uma tecnologia (para conectar ao TheirStack), mesmo quando o cliente não quer mais depender
dessa ferramenta. Decisão de produto (Q1, 2026-07-16): **TheirStack vira opção secundária** —
para avançar basta **cargo + localização**; tecnologia e setor são **opcionais**.

**Achado importante da arquitetura:** a obrigatoriedade da tecnologia é **apenas percebida**,
vinda da conversa — não do pipeline. O pipeline já sabe pular `search_companies` quando `technology`
é null ([parse/route.ts:227-230](../../src/app/api/agent/briefing/parse/route.ts#L227-L230)). Esta
story **não mexe no pipeline**; ela conserta a camada de decisão de completude (`canProceed`), o
conjunto de campos que o agente pergunta (`QUESTIONABLE_FIELDS`), o prompt do parser e o resumo de
confirmação. Escopo cirúrgico, **zero migration** (NFR5), risco baixo.

Esta é a **primeira story do Epic 22** (quick win que valida na tela a dor original) e é
independente das demais (22.2 em diante).

## Acceptance Criteria

1. **Given** um briefing com cargo e localização (sem tech, sem setor) **When** `analyzeBriefingCompleteness` avalia ([parse/route.ts:49-90](../../src/app/api/agent/briefing/parse/route.ts#L49-L90)) **Then** `canProceed=true` **And** a regra passa a ser `hasJobTitles && hasLocation` (ou fluxo de leads importados) — tech e setor deixam de contar como parâmetro obrigatório para avançar.
2. **Given** um briefing sem localização (ex.: "quero prospectar CTOs") **When** o agente faz perguntas guiadas **Then** pergunta **localização** (e cargo, se faltar) **And** `QUESTIONABLE_FIELDS` ([use-briefing-flow.ts:133](../../src/hooks/use-briefing-flow.ts#L133)) passa a ser `["jobTitles","location"]` **And** tecnologia nunca é apresentada como exigência no caminho principal.
3. **Given** o `SYSTEM_PROMPT` do parser ([briefing-parser-service.ts:43-66](../../src/lib/agent/briefing-parser-service.ts#L43-L66)) **Then** é reescrito com tecnologia descrita como filtro **OPCIONAL** e busca padrão = cargo + localização **And** o skip determinístico de `search_companies` quando tech é null é mantido ([parse/route.ts:227-230](../../src/app/api/agent/briefing/parse/route.ts#L227-L230)).
4. **Given** o usuário recusa informar tecnologia ("não tenho tecnologia", "sem filtro de tech") **When** o agente re-avalia **Then** pivota para pedir localização / confirmar o briefing — **NÃO** re-pergunta tecnologia (teste de regressão do loop morto).
5. **Given** o usuário menciona tecnologia espontaneamente **Then** ela entra como filtro extra e `search_companies` (TheirStack) é mantido no pipeline (FR4) — `skipSteps` **não** ganha `search_companies` quando `technology` está presente.
6. **Given** o resumo de confirmação do briefing ([generateBriefingSummary, use-briefing-flow.ts:156-201](../../src/hooks/use-briefing-flow.ts#L156-L201)) **Then** reflete a nova regra (ex.: "Sem tecnologia específica — busca por cargo + localização"; nota de setor apenas se informado).
7. Testes unitários atualizados/adicionados: `analyzeBriefingCompleteness`, `generateSmartQuestion(s)`, prompt/schema do parser, e o cenário de loop morto (AC4).

## Tasks / Subtasks

- [x] **Task 1 — `canProceed = hasJobTitles && hasLocation` no route** (AC: #1)
  - [x] Em [`analyzeBriefingCompleteness`](../../src/app/api/agent/briefing/parse/route.ts#L49-L90): substituir `hasSearchParam` (`technology || industry || location`) por `hasLocation = Boolean(briefing.location)`. Nova regra: `canProceed = Boolean((hasJobTitles && hasLocation) || isImportedLeadsFlow)`.
  - [x] Remover a variável `hasSearchParam` (não usada em mais nada) e atualizar o comentário `// canProceed logic:` (linhas 74-77) para descrever a regra nova.
  - [x] **NÃO alterar** o cálculo de `missingFields` (segue listando technology/jobTitles/location/industry/companySize — alimenta `isComplete` e as notas do resumo). **NÃO alterar** o bloco `isImportedLeadsFlow` (linhas 81-83).

- [x] **Task 2 — `QUESTIONABLE_FIELDS = ["jobTitles","location"]` no hook** (AC: #2, #4)
  - [x] Em [use-briefing-flow.ts:133](../../src/hooks/use-briefing-flow.ts#L133): trocar `["technology", "jobTitles"]` por `["jobTitles", "location"]` e atualizar o comentário acima (linhas 130-132) para: campos ativos = jobTitles + location; technology/industry/companySize são contexto opcional.
  - [x] Garantir que `generateSmartQuestion` gera pergunta válida para `"location"`. Adicionei um branch dedicado (`Em qual localizacao voce quer focar a prospeccao? Ex: Sao Paulo, Brasil, LATAM.`) — mais proativo que o fallback genérico (`fieldLabels.location`), evitando o "posso sugerir opcoes" que não se aplica a localização.
  - [x] O branch `field === "technology"` de `generateSmartQuestion` segue vivo só via `isHelpRequest`. **Mantido** — é fallback de ajuda, não caminho de exigência.

- [x] **Task 3 — Reescrever `SYSTEM_PROMPT` do parser** (AC: #3, #5)
  - [x] Em [briefing-parser-service.ts:43-66](../../src/lib/agent/briefing-parser-service.ts#L43-L66): reescrito para descrever **technology como filtro OPCIONAL** (não atributo primário). Busca padrão = **cargo + localização**; setor e tecnologia entram só se selecionados.
  - [x] Regras de `skipSteps` canonicalizadas no route: tech null → `search_companies` no skip; tech presente → remove skip inconsistente; leads próprios → preserva `["search_companies","search_leads"]`.
  - [x] **`briefingResponseSchema` mantém os mesmos campos** e agora normaliza `location` com trim, convertendo string vazia/espaços em `null`. Campos novos continuam sendo responsabilidade da 22.5.
  - [x] Prompt define que menções negadas não contam, correção mais recente prevalece e recusa/remoção de tech resulta em `technology=null` + skip de TheirStack.

- [x] **Task 4 — Resumo de confirmação reflete a nova regra** (AC: #6)
  - [x] Em [`generateBriefingSummary`, fieldNotes](../../src/hooks/use-briefing-flow.ts#L166-L172): nota de `technology` mudada de "busca mais ampla por industria/localizacao" para `"Sem tecnologia especifica — busca por cargo + localizacao."`
  - [x] Conforme decisão do code review, setor só aparece no resumo quando informado; a nota `"Sem industria especifica"` foi removida.

- [x] **Task 5 — Testes** (AC: #7)
  - [x] `briefing-parse.test.ts`: cobre núcleo da 22.1, location vazia, remoção de `search_companies` inconsistente com tech presente e preservação do fluxo de leads importados.
  - [x] `use-briefing-flow.test.tsx`: cobre cargo + localização, loop morto de recusa, ajuda explícita de tecnologia e ausência da nota de indústria quando setor não foi informado.
  - [x] `briefing-parser-service.test.ts`: valida contrato do `SYSTEM_PROMPT` para negação/correção mais recente e normalização de `location` vazia/espaçada no schema.
  - [x] `search-leads-step.test.ts`: prova que cidade/região é reaplicada no Apollo também no fluxo normal com domínios.
  - [x] Suíte completa verde — zero regressão em 17.10 / 17.11 / 16.6 (NFR4).

- [x] **Task 6 — Validação final**
  - [x] `npx vitest run`: **395 arquivos, 6799 pass, 2 skip, 0 fail**. `npx tsc --noEmit`: exit 2 por diagnostics pré-existentes (460 linhas), **zero diagnostics nos 8 arquivos tocados**. `eslint --max-warnings=0` limpo nos 8 arquivos; `git diff --check` sem erros.
  - [x] Smoke manual em `http://localhost:3000/agent`: "quero CTOs em São Paulo" avançou sem tech; "quero CTOs" pediu localização; recusa explícita de tech continuou pedindo localização; pedido de ajuda de tecnologia respondeu como filtro opcional; briefing com AWS + São Paulo preservou `location` e `skipSteps=[]` até o plano guiado. A execução paga de TheirStack/Apollo foi cancelada antes de iniciar.

### Review Findings

- [x] [Review][Patch] **[High] Preservar cidade/região informada até a busca normal do Apollo** [`src/lib/agent/steps/search-leads-step.ts:135`]
- [x] [Review][Patch] **[Low] Seguir a AC6 e omitir nota de indústria quando o setor não foi informado** [`src/hooks/use-briefing-flow.ts:174`]
- [x] [Review][Patch] **[High] Dar precedência a recusas e correções de tecnologia no parser acumulado** [`src/lib/agent/briefing-parser-service.ts:51`]
- [x] [Review][Patch] **[Medium] Canonicalizar `skipSteps` quando existe tecnologia sem quebrar leads importados** [`src/app/api/agent/briefing/parse/route.ts:226`]
- [x] [Review][Patch] **[Medium] Tornar sugestões de tecnologia alcançáveis em pedidos explícitos de ajuda** [`src/hooks/use-briefing-flow.ts:653`]
- [x] [Review][Patch] **[Medium] Rejeitar ou normalizar localização vazia composta só por espaços** [`src/app/api/agent/briefing/parse/route.ts:62`]
- [x] [Review][Patch] **[Medium] Cobrir o contrato novo do prompt/parser e a recusa real de tecnologia** [`__tests__/unit/lib/agent/briefing-parser-service.test.ts:80`]

## Dev Notes

### DEV AGENT GUARDRAILS — o que NÃO quebrar

- **NFR1 — pipeline 100% determinístico:** nenhuma decisão de execução muda aqui. Você só toca a camada de conversa/completude. O `DeterministicOrchestrator` e os approval gates ficam intactos.
- **NFR5 — zero migration de schema:** nenhum campo novo no banco nem no `ParsedBriefing`. Campos novos de briefing são responsabilidade da 22.5, não desta story.
- **NFR4 — zero regressão:** os fluxos de leads importados (17.11) e produto inline (16.6) passam pelo mesmo `analyzeBriefingCompleteness`/hook — o `isImportedLeadsFlow` **precisa** continuar retornando `canProceed=true` sem jobTitles/location.
- **O skip determinístico de `search_companies` ([parse/route.ts:227-230](../../src/app/api/agent/briefing/parse/route.ts#L227-L230)) é sagrado** — é o mecanismo que torna TheirStack secundária. Não remova, não condicione.

### A mudança de comportamento em uma frase

Regra **antiga** de avanço: `hasJobTitles && (technology OR industry OR location)`.
Regra **nova** de avanço: `hasJobTitles && location` (ou fluxo de leads importados).

Tabela do que muda por cenário de briefing:

| Briefing | canProceed ANTES | canProceed DEPOIS | Nota |
|---|---|---|---|
| cargo + localização (sem tech) | true | **true** | caso feliz da story |
| cargo + tech, **sem localização** | **true** | **false** → pede localização | **núcleo da mudança** |
| cargo + setor, sem localização | true | **false** → pede localização | tech/setor não bastam mais |
| só cargo (nada mais) | false | false | pede localização |
| leads importados (skip search_*) | true | true | `isImportedLeadsFlow`, inalterado |

O agente **pergunta** (via `QUESTIONABLE_FIELDS`) o que falta entre `jobTitles` e `location`.
Tecnologia sai da lista de perguntas obrigatórias — só volta como sugestão se o usuário pedir ajuda
(`isHelpRequest`) ou como filtro extra se o usuário mencionar espontaneamente.

### Arquivos a tocar (todos UPDATE — nenhum NEW)

1. [`src/app/api/agent/briefing/parse/route.ts`](../../src/app/api/agent/briefing/parse/route.ts) — `analyzeBriefingCompleteness` (Task 1). **Estado atual:** `canProceed = (hasJobTitles && hasSearchParam) || isImportedLeadsFlow`, com `hasSearchParam = technology || industry || location`. **Preservar:** cálculo de `missingFields`, `resolveProduct`, o bloco de `skipSteps` determinístico (227-230), toda a validação/auth.
2. [`src/hooks/use-briefing-flow.ts`](../../src/hooks/use-briefing-flow.ts) — `QUESTIONABLE_FIELDS` (Task 2) + `generateBriefingSummary.fieldNotes` (Task 4). **Preservar:** toda a máquina de estados, os handlers de produto/leads, `CONFIRMATION_KEYWORDS` (esses continuam como fluxo atual — a substituição por LLM é a 22.3, não aqui).
3. [`src/lib/agent/briefing-parser-service.ts`](../../src/lib/agent/briefing-parser-service.ts) — `SYSTEM_PROMPT` (Task 3). **Preservar:** `briefingResponseSchema`, timeout de 5s, tratamento de AbortError/fail, modelo `gpt-4o-mini` @ `temperature 0.1`.

### Padrões estabelecidos a seguir

- Prompts vivem como constantes TS no padrão existente (não migre para `ai_prompts`/`promptManager` nesta story — o parser usa constante inline e é o padrão dele).
- Português (BR) em todo texto de UI/chat (o SYSTEM_PROMPT do parser é escrito sem acentos por convenção do arquivo — mantenha o estilo do arquivo).
- `flex flex-col gap-*` para spacing (Tailwind v4) — não há UI nova aqui, mas se tocar algum wrapper, siga o padrão.

### Testing standards

- Vitest (`npx vitest run`). Mocks de Supabase via `createChainBuilder` (`__tests__/helpers/mock-supabase`). O parser é mockado nos testes de rota (`mockParse`), então testes de rota controlam o `briefing` de entrada diretamente.
- **Lição sistêmica do Epic 21 (aplicável aqui):** a suíte verde **não prova a tela**. Os testes de rota mockam o parser e o Supabase; eles validam a lógica de `canProceed`, mas o comportamento conversacional real (pergunta de localização, ausência de loop) só se prova rodando o app. Por isso a Task 6 pede smoke manual. Não declare "pronto" só com a suíte verde.
- Prove RED antes de GREEN no caso-núcleo (tech presente + location null → canProceed=false): escreva o teste, veja-o falhar contra o código atual, então aplique o fix.

### Project Structure Notes

- Sem novos arquivos, sem novas rotas, sem migration. A story é 100% edição de 3 arquivos-fonte + 3 arquivos de teste.
- Nenhum conflito com a estrutura existente. A separação "decisão de completude no route / máquina de estados no hook / extração no service" é preservada.

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.1] — ACs e decisões Q1-Q4
- [Source: _bmad-output/planning-artifacts/agente-tdec-plano-melhorias-2026-07-16.md#Frente A] — A1/A2/A3, regra `canProceed = hasJobTitles && hasLocation`, diagnóstico "tecnologia forçada"
- [Source: src/app/api/agent/briefing/parse/route.ts#L49-L90] — `analyzeBriefingCompleteness` (alvo Task 1)
- [Source: src/app/api/agent/briefing/parse/route.ts#L227-L230] — skip determinístico de `search_companies` (preservar)
- [Source: src/hooks/use-briefing-flow.ts#L130-L149] — `QUESTIONABLE_FIELDS` + `generateSmartQuestions` (alvo Task 2)
- [Source: src/hooks/use-briefing-flow.ts#L156-L201] — `generateBriefingSummary` (alvo Task 4)
- [Source: src/lib/agent/briefing-parser-service.ts#L43-L66] — `SYSTEM_PROMPT` (alvo Task 3)
- [Source: src/types/agent.ts#L73-L83] — `ParsedBriefing` (inalterado nesta story)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- RED provado: `npx vitest run briefing-parse.test.ts -t "22.1"` → 2 falhas contra o código antigo (tech presente + location null retornava `canProceed=true`; esperado `false`). Após Task 1, verde.
- `npx vitest run` (suíte inteira, pós-review): 395 files / 6799 pass / 2 skip / 0 fail.
- `npx tsc --noEmit`: exit 2 por diagnostics pré-existentes (460 linhas); busca dirigida confirmou 0 diagnostics nos 8 arquivos tocados.
- `npx eslint --max-warnings=0` nos 8 arquivos: limpo. `git diff --check`: limpo.
- Smoke Playwright em `http://localhost:3000/agent`: cargo+local sem tech, falta de local, recusa de tech, ajuda opcional e briefing AWS+São Paulo observados na UI; execução externa cancelada no approval gate.

### Completion Notes List

- **Núcleo da mudança entregue**: `canProceed = (hasJobTitles && hasLocation) || isImportedLeadsFlow`. Cargo + localização bastam; tecnologia e setor deixaram de contar como parâmetro para avançar.
- **Pipeline determinístico preservado e endurecido (NFR1)**: orchestrator/approval gates seguem intactos; o route canonicaliza `skipSteps` e preserva leads importados. No fluxo com tecnologia, cidade/região é reaplicada na busca normal do Apollo.
- **Zero migration (NFR5)**: nenhum campo novo no `ParsedBriefing`; o schema apenas normaliza `location` vazia/espaçada para `null`.
- **Zero regressão (NFR4)**: fluxos 17.11 (leads importados), 17.10 (entrada direta) e 16.6 (produto inline) seguem verdes.
- `QUESTIONABLE_FIELDS` = `["jobTitles","location"]`; tecnologia nunca é exigida no caminho principal e volta apenas quando a pessoa pede ajuda. Sem contexto de setor, o agente explica que o filtro é opcional em vez de prometer sugestões inexistentes.
- `SYSTEM_PROMPT` agora dá precedência à correção mais recente e trata recusa/negação de tecnologia como `technology=null` + skip de TheirStack. O contrato é verificado no teste do parser.
- **Smoke manual executado**: os três cenários centrais passaram na tela; o briefing AWS + São Paulo chegou ao plano guiado com localização preservada. A execução paga externa não foi iniciada.

### File List

- `src/app/api/agent/briefing/parse/route.ts` (M) — nova regra de `canProceed`; normalização defensiva de `location`; canonicalização determinística de `skipSteps`.
- `src/hooks/use-briefing-flow.ts` (M) — `QUESTIONABLE_FIELDS = [jobTitles, location]`; pergunta de localização; ajuda opcional de tecnologia; resumo sem nota de indústria ausente.
- `src/lib/agent/briefing-parser-service.ts` (M) — prompt com negação/correção mais recente; schema normaliza `location` vazia/espaçada.
- `src/lib/agent/steps/search-leads-step.ts` (M) — reaplica `briefing.location` no Apollo no fluxo normal com domínios.
- `__tests__/unit/api/agent/briefing-parse.test.ts` (M) — cobertura de completude, location vazia e canonicalização de skips.
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` (M) — cobertura de perguntas, recusa, ajuda de tecnologia e resumo conforme AC6.
- `__tests__/unit/lib/agent/briefing-parser-service.test.ts` (M) — contrato do prompt e normalização do schema.
- `__tests__/unit/lib/agent/steps/search-leads-step.test.ts` (M) — localização preservada no fluxo com tecnologia/domínios.
- `_bmad-output/implementation-artifacts/22-1-agent-verification.png` (NEW) — evidência visual do smoke manual no Agente TDec.

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-20 | Story 22.1 implementada (dev-story): localização obrigatória, tecnologia opcional. `canProceed = hasJobTitles && hasLocation`; `QUESTIONABLE_FIELDS = [jobTitles, location]`; `SYSTEM_PROMPT` do parser reescrito (tech = filtro OPCIONAL); nota de tech no resumo. +6 testes (3 parse + 3 hook), incluindo RED provado e loop morto AC4. Suíte 395/6790/0 fail; tsc 0 em `src/`; eslint limpo. Smoke manual pendente (Fabossi). |
| 2026-07-20 | Code review aplicado: 7 patches resolvidos — localização preservada no Apollo, negação/correção de tech, skips canonicalizados, ajuda opcional restaurada, location vazia normalizada, AC6 alinhada e testes ampliados. Suíte 395/6799/0 fail; smoke manual central passou. |
