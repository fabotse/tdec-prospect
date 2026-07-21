---
baseline_commit: d90e36e
---

# Story 22.5: Briefing de Campanha — Objetivo, Urgência, Descrição e Nº de E-mails

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário do Agente TDEC,
I want dizer na conversa o objetivo da campanha, a urgência, uma descrição e quantos e-mails quero,
so that a campanha gerada reflita minha intenção em vez de sair sempre no padrão genérico.

## Acceptance Criteria

1. **Given** o tipo `ParsedBriefing` (`src/types/agent.ts`) **Then** ganha `objective`, `urgency`, `campaignDescription`, `emailCount` (todos nullable) **And** o cast `briefing as unknown as Record<string, unknown>` em [create-campaign-step.ts:164](src/lib/agent/steps/create-campaign-step.ts#L164) (e o acesso via `briefingRecord` na linha 210) é removido em favor do tipo.
2. **Given** o usuário menciona objetivo/urgência/descrição/quantidade na conversa **When** o parser extrai **Then** os campos são preenchidos no briefing **And** aparecem no resumo de confirmação (`generateBriefingSummary`).
3. **Given** os campos ausentes **Then** o agente faz UMA pergunta leve sobre objetivo (não bloqueante — defaults `COLD_OUTREACH`/`MEDIUM` permanecem) **And** `canProceed` NÃO depende desses campos (nenhum deles entra no gate de `analyzeBriefingCompleteness`).
4. **Given** `emailCount` informado **When** a estrutura da campanha é gerada **Then** o prompt `campaign_structure_generation` recebe a preferência e a sequência respeita a quantidade pedida.
5. **Given** `campaignDescription` presente **Then** o nome da campanha usa a descrição (a regra atual de [create-campaign-step.ts:210-213](src/lib/agent/steps/create-campaign-step.ts#L210-L213) passa a ser alimentada de verdade, via campo tipado).
6. Testes unitários: extração dos campos (parser), defaults, propagação pro step, nome da campanha, e — **crítico** — persistência real dos campos no JSONB (o schema do PATCH de briefing).

## Tasks / Subtasks

- [x] **Task 1 — Tipos: estender `ParsedBriefing`** (AC: #1)
  - [x] Em [src/types/agent.ts](src/types/agent.ts): adicionar unions `CampaignObjective = 'COLD_OUTREACH' | 'REENGAGEMENT' | 'FOLLOW_UP' | 'NURTURE'` e `CampaignUrgency = 'LOW' | 'MEDIUM' | 'HIGH'` (valores **exatos** que o prompt `campaign_structure_generation` já usa — ver [defaults.ts:751-780](src/lib/ai/prompts/defaults.ts#L751-L780)).
  - [x] Adicionar a `ParsedBriefing` (após `premiumIcebreakers`, mesmo padrão de campo opcional documentado): `objective?: CampaignObjective | null; urgency?: CampaignUrgency | null; campaignDescription?: string | null; emailCount?: number | null;`. Todos **nullable/opcionais** — briefings antigos no JSONB não têm esses campos (NFR5, zero migration).
  - [x] Comentar cada campo com `// Story 22.5:` no padrão dos comentários de `premiumIcebreakers`/`importedLeads`.

- [x] **Task 2 — Parser: extrair os 4 campos** (AC: #2, #3)
  - [x] Em [src/lib/agent/briefing-parser-service.ts](src/lib/agent/briefing-parser-service.ts): adicionar ao `briefingResponseSchema` (linha ~36): `objective: z.enum([...]).nullable().default(null)`, `urgency: z.enum([...]).nullable().default(null)`, `campaignDescription: z.string().nullable().default(null)`, `emailCount: z.number().int().min(1).max(10).nullable().default(null)`. Os `.default(null)` garantem fail-open: LLM que não emite o campo → null, nunca quebra o parse (padrão 22.3).
  - [x] Mapear os 4 campos no objeto `briefing: ParsedBriefing` construído em [briefing-parser-service.ts:184-193](src/lib/agent/briefing-parser-service.ts#L184-L193) (o objeto é montado campo-a-campo, NÃO faz spread do raw — precisa adicionar explicitamente, senão os campos somem).
  - [x] Estender o `SYSTEM_PROMPT`: descrever objective/urgency/campaignDescription/emailCount como campos **OPCIONAIS de campanha** (não de busca). Regras: extrair só quando o usuário mencionar; nunca inventar; mapear linguagem natural PT → enum (ex.: "primeiro contato"/"prospecção fria" → `COLD_OUTREACH`; "reengajar"/"reativar" → `REENGAGEMENT`; "follow-up"/"acompanhamento" → `FOLLOW_UP`; "nutrir"/"educar" → `NURTURE`; "urgente"/"rápido" → `HIGH`; "sem pressa"/"tranquilo" → `LOW`); `emailCount` = inteiro entre 1 e 10 quando o usuário pedir uma quantidade ("quero 3 e-mails", "uma sequência curta de 2").
  - [x] **Guardrail (NFR1):** deixar explícito no prompt que esses campos NÃO alteram `nextAction`, `skipSteps` nem os parâmetros de busca — são metadados da campanha. `canProceed` continua = cargo + localização.

- [x] **Task 3 — Passthrough na rota /parse (sem gate)** (AC: #3)
  - [x] Em [src/app/api/agent/briefing/parse/route.ts](src/app/api/agent/briefing/parse/route.ts): confirmar que `resolvedBriefing` (linha 267) propaga os novos campos — como faz `...briefing`, eles passam automaticamente **desde que o parser os inclua** (Task 2). Verificar que nada os descarta.
  - [x] **NÃO** adicionar objective/urgency/campaignDescription/emailCount a `analyzeBriefingCompleteness` (linha 66) nem a `missingFields` — eles não são campos "faltando" que travam o avanço; têm defaults e são não-bloqueantes (AC3). `canProceed` permanece intocado.

- [x] **Task 4 — Persistência no JSONB: `briefingUpdateSchema`** (AC: #1, #6) — **⚠️ ARMADILHA CRÍTICA**
  - [x] Em [src/app/api/agent/executions/[executionId]/briefing/route.ts](src/app/api/agent/executions/[executionId]/briefing/route.ts#L17-L34): adicionar os 4 campos ao `briefingUpdateSchema`. **Este `z.object` faz strip silencioso de chaves desconhecidas** — se os campos NÃO forem adicionados aqui, o cliente envia o briefing completo (`AgentChat.saveBriefing` → PATCH, [AgentChat.tsx:186-190](src/components/agent/AgentChat.tsx#L186-L190)) mas o Zod **descarta** objective/urgency/campaignDescription/emailCount antes do `.update({ briefing: validation.data })`. Resultado: o `CreateCampaignStep` leria sempre os defaults e a story inteira falharia em produção com a suíte verde. Campos: mesmos tipos/enum do schema do parser, todos opcionais/nullable.

- [x] **Task 5 — CreateCampaignStep: remover cast + alimentar o prompt** (AC: #1, #4, #5)
  - [x] Em [create-campaign-step.ts:163-166](src/lib/agent/steps/create-campaign-step.ts#L163-L166): remover `const briefingRecord = briefing as unknown as Record<string, unknown>;` e ler direto do tipo: `const objective = briefing.objective ?? "COLD_OUTREACH";` e `const urgency = briefing.urgency ?? "MEDIUM";` (defaults preservados — AC3).
  - [x] Wire `additional_description` no render de `campaign_structure_generation` ([linha 168-172](src/lib/agent/steps/create-campaign-step.ts#L168-L172)): passar `additional_description: briefing.campaignDescription ?? ""`. O template **já referencia `{{additional_description}}`** ([defaults.ts:736](src/lib/ai/prompts/defaults.ts#L736)) mas hoje nunca recebe valor — é uma variável órfã. Alimentá-la fecha metade do AC.
  - [x] `emailCount` (AC4): passar ao render (ex.: `email_count: briefing.emailCount ? String(briefing.emailCount) : ""`) **e** adicionar a instrução correspondente no template (Task 6). Quando null/ausente, o prompt segue a heurística por objetivo atual (4-5 e-mails etc.) — comportamento byte-a-byte de hoje.
  - [x] Nome da campanha (AC5): em [linha 210-213](src/lib/agent/steps/create-campaign-step.ts#L210-L213) trocar `briefingRecord.campaignDescription` por `briefing.campaignDescription`. Lógica idêntica, agora tipada.

- [x] **Task 6 — Prompt `campaign_structure_generation`: respeitar a quantidade** (AC: #4)
  - [x] Em [src/lib/ai/prompts/defaults.ts](src/lib/ai/prompts/defaults.ts#L728-L808): adicionar variável de quantidade (ex.: bloco condicional `{{#if email_count}}QUANTIDADE SOLICITADA: gere EXATAMENTE {{email_count}} e-mails na sequência (sobrepõe a heurística por objetivo abaixo).{{/if}}`) posicionada antes das "REGRAS POR OBJETIVO". Manter as regras por objetivo como fallback quando `email_count` vazio.
  - [x] Verificar a sintaxe de template suportada pelo `promptManager` (Handlebars-like `{{#if}}` já é usado no template — ver `{{#if product_name}}` na [linha 738](src/lib/ai/prompts/defaults.ts#L738)); reusar o mesmo mecanismo.
  - [x] **Nota de override de tenant:** prompts podem ter versão custom em `ai_prompts` (DB) por tenant. A nova variável só existe no default de código. Tenants com prompt custom antigo simplesmente ignoram `{{email_count}}` (sem erro) até re-seed — comportamento aceitável (fail-soft); documentar em Completion Notes, não bloquear.

- [x] **Task 7 — Hook: resumo + pergunta leve + fechar armadilha do confirm** (AC: #2, #3)
  - [x] Em [src/hooks/use-briefing-flow.ts](src/hooks/use-briefing-flow.ts) `generateBriefingSummary` ([linha 170](src/hooks/use-briefing-flow.ts#L170)): adicionar linhas para os campos presentes (ex.: `- Objetivo: <label PT>`, `- Urgência: <label>`, `- Descrição: <...>`, `- Nº de e-mails: <n>`). Usar rótulos PT amigáveis (mapa enum→label), não os enums crus.
  - [x] **Pergunta leve não-bloqueante (AC3):** quando cargo+localização já presentes (rumo ao resumo/confirm) e `objective` é null, incluir UMA linha convidando o usuário a opcionalmente informar objetivo/quantidade — ex.: no final do resumo, antes de "Confirma esses parâmetros?": `"Se quiser, me diga o objetivo (primeiro contato, reengajamento…) e quantos e-mails — senão sigo com uma sequência padrão de primeiro contato."`. Isso reusa o ponto de confirmação existente, é opcional (o usuário pode só confirmar) e não cria estado novo. **Não** transformar em pergunta de `awaiting_fields` (seria bloqueante).
  - [x] **⚠️ Fechar a armadilha de `briefingChanged`** ([linha 228-237](src/hooks/use-briefing-flow.ts#L228-L237)): o guard híbrido do estado `confirming` ([linha 802-804](src/hooks/use-briefing-flow.ts#L802-L804)) faz `keywordConfirmed = isConfirmation(content) && !briefingChanged(...)`. Se o usuário, diante do resumo, responder algo como **"sim, e usa reengajamento com 3 e-mails"**, `isConfirmation` = true e `briefingChanged` (que hoje só compara technology/location/companySize/industry/jobTitles) retorna **false** → confirma SEM aplicar objective/emailCount. **Estender `briefingChanged` para incluir os 4 novos campos** (`objective`, `urgency`, `campaignDescription`, `emailCount`), para que uma correção que só toca esses campos seja tratada como correção (reapresenta o resumo), não engolida como confirmação.

- [x] **Task 8 — Testes** (AC: #6)
  - [x] `__tests__/unit/lib/agent/briefing-parser-service.test.ts`: extração dos 4 campos (mock da resposta OpenAI com objective/urgency/campaignDescription/emailCount) + defaults null quando ausentes + emailCount fora do range (0/11) cai para null via schema.
  - [x] `__tests__/unit/api/agent/briefing-update.test.ts`: **RED→GREEN da armadilha** — PATCH com os 4 campos no corpo → `validation.data` **preserva** os campos (hoje strip-a). Este é o teste que prova que o JSONB recebe os dados.
  - [x] `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts`: **adaptar** os testes existentes de `campaignDescription` ([linha 588-606](../..) usam o cast `as unknown as Record`) para o campo tipado; adicionar: `emailCount` propagado ao render do `campaign_structure_generation` (assert nas variáveis passadas ao `renderPrompt`); `additional_description` alimentado; defaults COLD_OUTREACH/MEDIUM quando ausentes.
  - [x] `__tests__/unit/hooks/use-briefing-flow.test.tsx`: resumo mostra os campos; **regressão da armadilha** — no `confirming`, "sim, mas reengajamento" NÃO confirma (briefingChanged=true) e reapresenta; "sim" puro ainda confirma (briefingChanged=false).
  - [x] `__tests__/unit/api/agent/briefing-parse.test.ts` (se aplicável): passthrough dos campos + `canProceed` inalterado quando só objective muda.
  - [x] Rodar `npx vitest run` (suíte-alvo ~6861 pass baseline pós-22.4); `npx tsc --noEmit` limpo nos arquivos tocados; `npx eslint --max-warnings=0` nos arquivos tocados.

- [x] **Task 9 — Smoke manual pela interface real** (lição Epic 21 / def-de-pronto)
  - [x] A suíte **mocka o OpenAI e o Supabase** — não prova extração real de intenção nem o JSONB gravado. Rodar `/agent` logado (skill `verify`, Playwright + LLM real gpt-4o-mini): (a) montar briefing e dizer "objetivo é reengajamento, 3 e-mails, campanha Black Friday" → conferir que o resumo reflete os 4 campos; (b) confirmar e ir até o plano/preview → conferir que a campanha gerada tem 3 e-mails e o nome usa a descrição; (c) briefing sem objetivo → sai no padrão (COLD_OUTREACH, sequência default) sem travar. **Parar antes de "Iniciar Execução"** (guardrail de custo — Apify/OpenAI pagos).

## Dev Notes

### Fluxo de dados (ponta a ponta) — leia antes de codar

```
[usuário] → AgentChat.handleSendMessage
   → POST /api/agent/briefing/parse  (messages[])
      → BriefingParserService.parse → OpenAI gpt-4o-mini (SYSTEM_PROMPT + schema)   ← Task 2
      → route monta resolvedBriefing (spread ...briefing)                            ← Task 3 (passthrough)
   → resposta vira briefingState.briefing (client, use-briefing-flow)                ← Task 7 (resumo/pergunta)
   → ao CONFIRMAR: AgentChat.saveBriefing → PATCH /executions/{id}/briefing
      → briefingUpdateSchema.safeParse(body)  ⚠️ STRIP de chaves não declaradas      ← Task 4 (CRÍTICO)
      → .update({ briefing: validation.data }) → agent_executions.briefing (JSONB)
   → POST /executions/{id}/confirm → lê execution.briefing, mescla premiumIcebreakers,
      gera plano/custo, cria steps
   → execução: CreateCampaignStep.executeInternal lê briefing (JSONB)                ← Task 5
      → renderPrompt("campaign_structure_generation", { objective, urgency,
         additional_description, email_count })                                      ← Task 5 + Task 6
```

**Os dois pontos que quebram silenciosamente** (suíte verde, produção quebrada — o padrão sistêmico já documentado no projeto): (1) parser monta o briefing campo-a-campo, não faz spread → campo novo some se não for adicionado no objeto das linhas 184-193; (2) `briefingUpdateSchema` faz strip → campo novo some do JSONB se não for adicionado ao schema. Ambos exigem teste que prove RED (campo presente na entrada, ausente na saída antes do fix).

### Estado atual dos arquivos UPDATE (o que preservar)

- **[create-campaign-step.ts](src/lib/agent/steps/create-campaign-step.ts)**: hoje já lê objective/urgency via cast `briefingRecord` (linhas 164-166, 210) com defaults COLD_OUTREACH/MEDIUM. A story **substitui o cast pelo tipo** — comportamento idêntico quando os campos são null. NÃO tocar no caminho premium/Apify (22.2), nem no `isImportedLeadsFlow`, nem no enrich Apollo, nem na geração de icebreakers/e-mails. O `additional_description` é variável órfã no template — alimentá-la muda o output do LLM (esperado, é o objetivo da story).
- **[briefing-parser-service.ts](src/lib/agent/briefing-parser-service.ts)**: preservar `nextAction`/`questionText` (22.3), `buildOpenAIMessages` (D4), o timeout de 5s (NFR2) e o fail-open. Só ampliar schema + prompt + mapeamento.
- **[parse/route.ts](src/app/api/agent/briefing/parse/route.ts)**: preservar a canonicalização de `skipSteps` (linhas 254-265) e `analyzeBriefingCompleteness` (NFR1). Passthrough puro dos novos campos.
- **[briefing/route.ts (PATCH)](src/app/api/agent/executions/[executionId]/briefing/route.ts)**: preservar RLS por tenant (`.eq("tenant_id", ...)`). Só ampliar o schema.
- **[use-briefing-flow.ts](src/hooks/use-briefing-flow.ts)**: preservar toda a máquina de estados de 22.3/22.4 (nextAction, confirming, awaiting_product/leads, fail-open por keyword). Mudanças cirúrgicas: `generateBriefingSummary`, `briefingChanged`, e a linha da pergunta leve.

### Decisões de design (tomadas aqui — o dev segue)

- **D1 — Defaults no STEP, não no parser/tipo:** `ParsedBriefing.objective`/`urgency` ficam **nullable**; o default (COLD_OUTREACH/MEDIUM) é aplicado só na leitura em `create-campaign-step` (`?? "COLD_OUTREACH"`). Motivo: manter o briefing fiel ao que o usuário disse (null = "não especificou") e centralizar o default no único ponto que consome. Consistente com o comportamento atual (que já usa `?? "COLD_OUTREACH"`).
- **D2 — Pergunta leve no ponto de confirmação, não em estado bloqueante:** a "UMA pergunta" do AC3 vira uma linha opcional no resumo (`generateBriefingSummary`), não um novo `awaiting_*`. Motivo: AC3 exige não-bloqueante e `canProceed` independente; criar estado de espera seria bloquear. O usuário responde na conversa e a correção flui pelo caminho 22.3 existente.
- **D3 — `emailCount` sobrepõe a heurística por objetivo:** quando informado, o prompt gera exatamente N e-mails; quando null, mantém a heurística atual (4-5 para COLD_OUTREACH etc.). Bound 1-10 no schema (evita prompt absurdo). AC4.
- **D4 — Zero migration (NFR5):** os 4 campos vivem no JSONB `agent_executions.briefing`, opcionais. Briefings antigos (sem os campos) leem como null → defaults. Nenhuma alteração de schema SQL.
- **D5 — `briefingChanged` passa a incluir os 4 campos:** fecha a armadilha do guard híbrido do `confirming` (correção que só toca campos de campanha não pode ser engolida como confirmação por keyword). Task 7.

### Testing standards

- Framework: **Vitest** (`npx vitest run`). Testes em `__tests__/**/*.{test,spec}.{ts,tsx}` (config: [vitest.config.ts](vitest.config.ts)). OpenAI e Supabase são **mockados** — por isso a Task 9 (smoke real) é def-de-pronto, não opcional (lição Epic 21: 6.8k testes verdes não provam a tela).
- ESLint enforça `no-console` e `no-non-null-assertion` (Project Memory: `process.env.X!` pré-existente nos `src/lib/supabase/*.ts` pode bloquear o pre-commit ao lintar o arquivo inteiro — usar leitura guardada, nunca `--no-verify`). `eslint --max-warnings=0` nos arquivos tocados.
- RED→GREEN obrigatório nos dois pontos de strip silencioso (parser mapping + briefingUpdateSchema): escrever o teste que falha ANTES do fix.

### Project Structure Notes

- Escopo cirúrgico: **7 arquivos de código** (types, parser-service, parse/route [passthrough], briefing/route [schema], create-campaign-step, defaults [prompt], use-briefing-flow) + **5 arquivos de teste**. ZERO migration, ZERO componente novo, ZERO rota nova (NFR1/NFR4/NFR5).
- Alinhado ao padrão do épico: LLM só amplia a CONVERSA (extração), pipeline de execução permanece determinístico (objective/urgency são metadados de prompt, não decisões de execução).
- **Baseline commit:** `d90e36e` (HEAD atual; stories 22.1–22.4 + 22.8 já mergeadas em `78a4cf8`). Nota: as stories anteriores citavam "baseline 1c35f8d" — esse era o ponto pré-merge do Epic 22; para a 22.5 o baseline real é `d90e36e`.

### References

- [Source: _bmad-output/planning-artifacts/epic-22-agente-tdec-2.0.md#Story 22.5] — FR8, ACs 1-6, sequência/dependências
- [Source: src/types/agent.ts#L85-L96] — `ParsedBriefing` atual (padrão de campo opcional: `premiumIcebreakers`, `importedLeads`)
- [Source: src/lib/agent/briefing-parser-service.ts#L36-L100] — `briefingResponseSchema` + `SYSTEM_PROMPT` (padrão 22.3 de campos de conversa com `.default`)
- [Source: src/app/api/agent/executions/[executionId]/briefing/route.ts#L17-L34] — `briefingUpdateSchema` (armadilha do strip silencioso)
- [Source: src/lib/agent/steps/create-campaign-step.ts#L163-L213] — cast a remover + render do prompt + nome da campanha
- [Source: src/lib/ai/prompts/defaults.ts#L728-L808] — prompt `campaign_structure_generation` (`{{additional_description}}` órfã; regras por objetivo/urgência)
- [Source: src/hooks/use-briefing-flow.ts#L170-L237] — `generateBriefingSummary` + `briefingChanged`; [#L785-L828] guard híbrido do `confirming`
- [Source: src/components/agent/AgentChat.tsx#L182-L196] — `saveBriefing` (PATCH do briefing completo do cliente)
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml] — notas de 22.3/22.4 (nextAction, fail-open, guard briefingChanged)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story BMAD)

### Debug Log References

- **RED→GREEN das 2 armadilhas de strip (prova obrigatória):** revertendo temporariamente o mapeamento campo-a-campo do parser + os 4 campos do `briefingUpdateSchema`, os 7 testes-alvo falharam (extração dos 4 campos, defaults, fail-open de range/enum, preservação no PATCH); com os fixes de volta, 43/43 verdes. Confirma que ambos os pontos de strip silencioso (parser mapping + PATCH schema) estavam realmente cobertos.
- **Gotcha operacional (dev server):** a instância antiga do dev server (rodando desde antes da sessão) deu 500 em `/executions/{id}/messages` e `/steps` (rotas que a 22.5 NÃO toca) após muitos Fast Refresh — exatamente o gotcha da 22.3. **Restart do dev server resolveu** (estado corrompido de dev, não defeito da story); o `/parse` já vinha 200 mesmo na instância corrompida.

### Completion Notes List

Implementação FR8 — 4 metadados de campanha (objective/urgency/campaignDescription/emailCount, todos nullable) capturados na conversa, persistidos no JSONB e propagados ao prompt de estrutura. Escopo cirúrgico: 7 arquivos de código + 5 de teste, ZERO migration/rota/componente novo (NFR1/4/5).

- **Task 1 (tipos):** `CampaignObjective`/`CampaignUrgency` (valores exatos do prompt) + 4 campos opcionais em `ParsedBriefing`.
- **Task 2 (parser):** schema estendido com `.default(null).catch(null)` — o `.default(null)` cobre campo AUSENTE, o `.catch(null)` cobre valor INVÁLIDO (enum fora da lista, emailCount fora de 1–10) → ambos caem para null sem quebrar o parse inteiro (fail-open real, não só ausência). Mapeamento explícito campo-a-campo (armadilha #1 fechada). SYSTEM_PROMPT ganhou seção "CAMPOS OPCIONAIS DE CAMPANHA" + regra 6.1 (guardrail NFR1: não alteram nextAction/skipSteps/busca).
- **Task 3 (passthrough):** nenhuma alteração de código — a rota `/parse` já faz `resolvedBriefing = { ...briefing }` e `analyzeBriefingCompleteness` não toca os campos. Coberto por teste de passthrough + canProceed inalterado.
- **Task 4 (persistência — armadilha #2):** 4 campos adicionados ao `briefingUpdateSchema` (o `z.object` stripava chaves não-declaradas). **Provado no banco real no smoke:** o PATCH gravou `objective:REENGAGEMENT, emailCount:3, campaignDescription:"campanha de Black Friday"` no JSONB (o mock não simula strip).
- **Task 5 (step):** cast `briefing as unknown as Record` REMOVIDO (linhas 164/210) → leitura tipada; defaults COLD_OUTREACH/MEDIUM aplicados na leitura (null = não especificado); `additional_description` (variável antes órfã no template) e `email_count` alimentados; nome da campanha via campo tipado.
- **Task 6 (prompt):** bloco `{{#if email_count}}` (mesmo mecanismo Handlebars-like do `{{#if product_name}}`) antes das REGRAS POR OBJETIVO, com override "gere EXATAMENTE N"; regra crítica #6 ajustada para deferir à quantidade pedida (1–10) quando informada. **Nota de override de tenant (fail-soft, aceitável):** prompts custom em `ai_prompts` (DB) por tenant só existem no default de código — tenants com prompt antigo ignoram `{{email_count}}` sem erro até re-seed; não bloqueia.
- **Task 7 (hook):** `generateBriefingSummary` mostra os 4 campos com rótulos PT (mapas `OBJECTIVE_LABELS`/`URGENCY_LABELS`, nunca o enum cru) + pergunta leve NÃO-bloqueante quando `objective` é null (linha opcional no resumo, D2 — não cria estado `awaiting_*`); `briefingChanged` estendido com os 4 campos (D5 — fecha a armadilha do guard híbrido do `confirming`).
- **Task 8 (testes):** +18 testes líquidos (parser 5; PATCH 3; step 5; hook 4; parse route 1); RED→GREEN provado nas 2 armadilhas. Suíte **395 files / 6879 pass / 2 skip / 0 fail** (baseline 22.4 = 6861; +18, zero regressão). tsc 0 nos tocados; eslint --max-warnings=0 limpo.
- **Task 9 (smoke pela interface real — skill verify, Playwright + LLM real gpt-4o-mini, logado Fabossi):** 3/3 cenários passaram na tela:
  - **(a)** "objetivo é reengajamento, 3 e-mails, campanha Black Friday" → resumo refletiu **Objetivo: Reengajamento / Descricao: campanha de Black Friday / Nº de e-mails: 3** (rótulos PT; urgência ausente=null, correto); `/parse` 200.
  - **(b)** confirmação ("sim, confirmo") → mode selector → Guiado → **PATCH /briefing 200 com os 4 campos no body E no JSONB gravado** (prova de persistência no banco real); Plano de Execução gerado (5 etapas, passo 3 Criar Campanha R$4,20). **Parado no approval gate, SEM clicar "Iniciar Execução"** (guardrail de custo). A geração real dos 3 e-mails + nome "Campanha - …" roda dentro do passo pago (create_campaign) — coberta no nível unitário (propagação de email_count/additional_description + campaignName).
  - **(c)** briefing sem objetivo (Diretores de Marketing em BH) → resumo sem campos de campanha + **pergunta leve opcional aparece** ("Se quiser, me diga o objetivo…") + "Confirma esses parametros?", input habilitado, `canProceed` verdadeiro (não travou) — prova AC3 não-bloqueante e defaults.
  - Screenshot: `.playwright-mcp/22-5-smoke-cenario-c-pergunta-leve.png`. Gotcha: dev server antigo corrompido (500 em rotas não-tocadas) resolvido por restart.

### File List

**Código (7):**
- `src/types/agent.ts` — unions `CampaignObjective`/`CampaignUrgency` + 4 campos em `ParsedBriefing`
- `src/lib/agent/briefing-parser-service.ts` — schema (`.default(null).catch(null)`) + mapeamento campo-a-campo + SYSTEM_PROMPT
- `src/app/api/agent/briefing/parse/route.ts` — (verificado; passthrough automático, sem mudança de código)
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` — 4 campos no `briefingUpdateSchema` (armadilha do strip)
- `src/lib/agent/steps/create-campaign-step.ts` — remove cast; alimenta objective/urgency/additional_description/email_count; nome tipado
- `src/lib/ai/prompts/defaults.ts` — bloco `{{#if email_count}}` + ajuste da regra crítica #6
- `src/hooks/use-briefing-flow.ts` — resumo (rótulos PT) + pergunta leve + `briefingChanged` estendido

**Testes (5):**
- `__tests__/unit/lib/agent/briefing-parser-service.test.ts` — extração/defaults/fail-open dos 4 campos + guardrail no prompt (+ adaptação do toEqual completo)
- `__tests__/unit/api/agent/briefing-update.test.ts` — RED→GREEN da preservação no PATCH + range 400
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` — campaignDescription tipado + describe de variáveis do prompt (objective/urgency defaults, additional_description, email_count)
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — resumo mostra campos + pergunta leve + guard híbrido (correção só de campanha reapresenta; "sim" puro confirma)
- `__tests__/unit/api/agent/briefing-parse.test.ts` — passthrough dos 4 campos + canProceed inalterado

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-07-21 | Fabossi (dev-story) | Implementação completa da Story 22.5 (FR8): 4 metadados de campanha (objective/urgency/campaignDescription/emailCount) extraídos na conversa, persistidos no JSONB e propagados ao prompt `campaign_structure_generation`. 7 arquivos de código + 5 de teste, zero migration. +18 testes (RED→GREEN nas 2 armadilhas de strip). Suíte 395/6879 pass/2 skip/0 fail; tsc/eslint limpos. Smoke pela interface real 3/3 (persistência no JSONB provada no banco real; parado antes de Iniciar Execução). Status → review. |

## Review Findings

_(code-review bmad — 3 camadas Blind/Edge/Auditor, modo full, 2026-07-21. **Acceptance Auditor: AC1–AC6 todos SATISFEITOS e provados em código**; as 2 armadilhas de strip fechadas com teste no dado real; briefingChanged/D5 provado nos dois sentidos. Achados abaixo são reliability/consistência/UX ao redor da feature, não fio quebrado.)_

### decision-needed (1) — RESOLVIDA por Fabossi → patch aplicado

- [x] [Review][Decision→Patch] **Estimativa de custo ignora `emailCount` enquanto a geração real escala com ele** — [agent-cost-estimator.ts:112-116](src/lib/services/agent-cost-estimator.ts#L112-L116) usava `ESTIMATED_EMAILS_PER_LEAD = 3` fixo; com `emailCount = 10`, o `create_campaign` gerava ~3× mais e-mails/prompts que o estimado sem o valor do approval gate mudar. Fabossi escolheu **corrigir agora** (regra: custo não pode errar, cliente precifica em cima). **APLICADO:** `emailsPerLead = briefing.emailCount ?? ESTIMATED_EMAILS_PER_LEAD` alimenta `createCampaignAiCost` e `createCampaignPromptCount` + 2 testes (emailCount=10 → R$12,60; sem emailCount → R$4,20 regressão). Severidade: MEDIUM. Fonte: Blind Hunter.

### patch (3) — TODOS APLICADOS

- [x] [Review][Patch] **Parser pode descartar `emailCount` se o LLM emitir string** — `z.number()` sem coerção + `.catch(null)` fazia `"emailCount": "3"` (comum em `json_object`) virar `null` silenciosamente. **APLICADO:** `z.coerce.number().int().min(1).max(10).nullable().default(null).catch(null)` + teste (string "3" → 3). [briefing-parser-service.ts:61](src/lib/agent/briefing-parser-service.ts#L61). Severidade: MEDIUM.
- [x] [Review][Patch] **`campaignDescription` sem trim nem `.max()`** → whitespace-only produzia `"Campanha -   "` + linha em branco no resumo; sem teto a string entrava crua em `{{additional_description}}`. **APLICADO:** `campaignDescriptionSchema` (preprocess trim→null + `.max(200)`) no parser E preprocess equivalente no `briefingUpdateSchema` do PATCH + teste (whitespace→null, 250 chars→null, "  Black Friday  "→"Black Friday"). [briefing-parser-service.ts:60](src/lib/agent/briefing-parser-service.ts#L60), [briefing/route.ts:39](src/app/api/agent/executions/[executionId]/briefing/route.ts#L39). Severidade: LOW-MEDIUM.
- [x] [Review][Patch] **Pergunta leve contraditória** — o convite "…e quantos e-mails" reaparecia mesmo com `emailCount` já informado. **APLICADO:** cauda condicionada a `!briefing.emailCount` + teste. [use-briefing-flow.ts:234](src/hooks/use-briefing-flow.ts#L234). Severidade: LOW.

### defer (4)

- [x] [Review][Defer] **PATCH rejeita 400 o briefing inteiro** em valor fora do range (assimétrico com o fail-open `.catch(null)` do parser) [briefing/route.ts:37-40](src/app/api/agent/executions/[executionId]/briefing/route.ts#L37-L40) — deferred, pré-existente (padrão do schema; entrada real vem já clampada do parser)
- [x] [Review][Defer] **`premiumIcebreakers` (22.2) ausente do `briefingUpdateSchema`** — stripado no PATCH, mascarado pelo confirm route que o re-deriva [briefing/route.ts:17-41](src/app/api/agent/executions/[executionId]/briefing/route.ts#L17-L41) — deferred, pré-existente (inconsistência tipo↔schema)
- [x] [Review][Defer] **Notas de campos opcionais somem em re-resumos** (chamadas de `generateBriefingSummary` sem `missingFields`) [use-briefing-flow.ts:710,737](src/hooks/use-briefing-flow.ts#L710) — deferred, pré-existente
- [x] [Review][Defer] **`emailCount` 1-2 colide com "position>0 ⇒ follow-up" e "todos iniciais" do COLD_OUTREACH** — o 2º e-mail de uma sequência curta cold sai como follow-up apesar do objetivo — deferred, interação pré-existente prompt/`generateEmailBlocks`, agora alcançável

### dismiss (3)

- "EXATAMENTE N" sem clamp determinístico no `parseStructureJSON` — **by-design** (D3, fail-soft; exatidão coberta pelo smoke real Task 9).
- Leitura de JSONB legado com `emailCount` fora de range no read-path do step — **inalcançável pelo app** (todos os caminhos de escrita clampam 1-10; briefings antigos = null); exigiria adulteração manual do banco.
- `Nº` não-ASCII no resumo — texto **voltado ao usuário em PT, correto** (abreviação de "Número"); cosmético.
