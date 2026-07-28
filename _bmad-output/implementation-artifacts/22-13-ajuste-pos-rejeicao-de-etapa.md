---
baseline_commit: 079aca09dc5be1ecfce3622939af6d0a70215eec
---

# Story 22.13: Ajuste Pós-Rejeição de Etapa — a resposta do usuário precisa ter um consumidor

Status: done

> **P1 — hoje rejeitar uma etapa é um beco sem saída.** O agente pergunta "o que você gostaria de ajustar?" e ignora a resposta para sempre. A única saída é "Nova conversa" — que joga fora o briefing inteiro.

## Story

As a usuário do Agente TDEC,
I want que, ao rejeitar uma etapa (ex.: leads ruins) e responder o que quero ajustar, o agente aplique o ajuste e re-execute a etapa,
so that eu não precise abandonar a conversa inteira (e o briefing que construí) só porque a primeira busca não veio boa.

## Contexto (bug reproduzido em teste E2E, 2026-07-24)

Busca de leads retornou 0 resultados → "Rejeitar" → agente: *"Entendido. O que você gostaria de ajustar na etapa 'Busca de Leads'?"* → usuário respondeu **duas vezes** ("remove o filtro de tamanho e o de indústria...", "pode buscar de novo sem os filtros?") → **zero reação**. Network: `POST /messages` 201 e só polling — nenhum `briefing/parse`, nenhum PATCH, nenhum re-execute.

## Diagnóstico confirmado em código

1. **Não existe consumidor da resposta (cliente).** [AgentChat.tsx:302-303](../../src/components/agent/AgentChat.tsx#L302) — com `briefingState.status === "confirmed"`, `handleSendMessage` cai no "fluxo normal": `sendMessageMutation.mutate(...)` e mais nada. Todo o roteamento inteligente (parse → briefing) só existe PRÉ-confirmação ([:266-299](../../src/components/agent/AgentChat.tsx#L266)).
2. **O hook também não atende.** [use-briefing-flow.ts:1112-1113](../../src/hooks/use-briefing-flow.ts#L1112) — `processMessage` retorna `{ handled: false }` quando o status é `confirmed`. Correto e deve continuar assim; o consumidor novo é outro.
3. **O reject só insere a pergunta.** [reject/route.ts:122-136](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts#L122) — insere a mensagem e mantém o step `awaiting_approval` (comentário do arquivo: *"Pipeline does NOT advance until user approves"*). Não há sinal durável de rejeição.
4. **A marcação "❌ Rejeitado" é uma meia-verdade.** [AgentApprovalGate.tsx:122-126](../../src/components/agent/AgentApprovalGate.tsx#L122) — vem do `actionTaken` **local**; some no remount/refresh e o card volta com os botões ativos.
5. **Bônus da mesma família da 22.17:** `handleReject` seta `setLoading("reject")` e **nunca limpa no sucesso** ([AgentApprovalGate.tsx:68-86](../../src/components/agent/AgentApprovalGate.tsx#L68), e idem em `AgentLeadReview.tsx:164-180` / `AgentCampaignPreview.tsx:131-147`) → o spinner do botão "Rejeitar" gira para sempre **enquanto o usuário digita o ajuste**. Neste fluxo isso deixa de ser cosmético.

**O que JÁ funciona e não precisa ser construído** (verificado nesta create-story — ver Dev Notes para as linhas): o `/parse` com memória, o `PATCH /briefing`, o `POST /steps/{n}/execute` sobre um step `awaiting_approval`, e a reabertura automática do gate pelo `BaseStep`. A story é 90% cliente.

## Acceptance Criteria

1. **[Estado de ajuste — genérico por step]** **Given** uma execução guiada com step em `awaiting_approval` **When** o usuário clica "Rejeitar" e o reject retorna sucesso **Then** o sistema entra num estado client-side de ajuste identificando **qual** step (`stepNumber` + `stepType`), válido para busca de empresas, busca de leads **e** campanha **And** o input do chat exibe placeholder orientando (ex.: *"Descreva o ajuste — ex.: 'remove o filtro de tamanho'"*) **And** o spinner do botão "Rejeitar" para (`setLoading(null)` também no caminho de sucesso).

2. **[A resposta é parseada e aplicada ao briefing]** **Given** o estado de ajuste na fase "descrever" **When** o usuário envia uma mensagem **Then** ela é persistida no chat como hoje **And** roteada ao `/api/agent/briefing/parse` **reusando a memória conversacional da 22.3** (o mesmo `conversationRef`/`callParseAPI`, nunca uma chamada nova) **And** o briefing resultante é mesclado conforme o AC4 e persistido via `PATCH /briefing` **And** o agente responde, em UMA mensagem, com resumo curto do ajuste + custo estimado da re-execução + pergunta de confirmação **And** a fase vira "confirmar". **Fail-open:** se o parse falhar/timeout, o agente avisa que não entendeu, o estado de ajuste **permanece**, e NENHUM PATCH e NENHUM execute acontecem.

3. **[Re-execução só com confirmação determinística]** **Given** a fase "confirmar" **When** a mensagem do usuário é uma confirmação pelo helper determinístico (`isConfirmation`, o mesmo SSOT do fluxo de briefing) **Then** o step rejeitado é re-executado via `POST /steps/{n}/execute` **And** o estado de ajuste é limpo **And** o novo resultado reabre um gate de aprovação (novo card). **When** a mensagem NÃO é confirmação clara **Then** é tratada como um novo ajuste (volta à fase "descrever", AC2) e **nada é executado** — fail-safe da 22.11: na dúvida, não gasta crédito. A decisão de re-executar **nunca** vem da interpretação do LLM.

4. **[O ajuste muda filtros, nunca a forma do pipeline]** **Given** que o `/parse` devolve um `ParsedBriefing` completo derivado da conversa **Then** o briefing enviado no `PATCH` aplica do parse **somente** os campos de filtro (`technology`, `jobTitles`, `location`, `companySize`, `industry`, `objective`, `urgency`, `campaignDescription`, `emailCount`) **And preserva** da execução em andamento `skipSteps`, `importedLeads`, `mode`, `productSlug` e `premiumIcebreakers` **And** `PATCH /briefing` deixa de descartar `premiumIcebreakers` (hoje o schema não o declara e o `z.object` faz strip silencioso) — de modo que um ajuste **não** rebaixa icebreaker premium pago para standard nem muda a forma do pipeline no meio da execução.

5. **[Auditoria durável do card rejeitado]** **Given** um step rejeitado **Then** a mensagem `approval_gate` **mais recente daquele step** recebe `metadata.rejected = true` (JSONB, sem migration) **And** ao recarregar a página esse card continua exibido, marcado como rejeitado e com os botões desabilitados **And** o novo gate gerado pela re-execução aparece abaixo, ativo.

6. **[Sem regressão nos fluxos existentes]** **Given** approve normal, autopilot, o fluxo de briefing pré-confirmação e o caminho de defer da 22.12 **Then** nada muda neles — o roteamento novo só ativa com o estado de ajuste ligado **And** `processMessage` continua devolvendo `{handled:false}` em status `confirmed` **And** nenhum status novo é adicionado ao enum `StepStatus` **And** os guards CAS/terminais da 22.10 permanecem intactos **And** o `PATCH /briefing` pré-confirmação continua com resultado byte-a-byte idêntico.

7. **[Testes RED→GREEN + smoke real]** **Then** (a) RED provado: hoje, com briefing confirmado, uma mensagem não dispara `/parse`, `/briefing` nem `/execute`; (b) GREEN: os quatro caminhos do AC2/AC3 (descrever → parse+PATCH+resumo; confirmar → execute; não-confirmação → novo ajuste; fora do estado de ajuste → só persiste); (c) teste do reject carimbando `metadata.rejected` e mantendo o step `awaiting_approval`; (d) suíte cheia sem novas falhas, `tsc --noEmit` limpo, eslint `--max-warnings=0` nos arquivos tocados; (e) **smoke real** pela interface (a suíte mocka OpenAI e pipeline): rejeitar uma busca → descrever o ajuste em linguagem natural → ver resumo + custo → confirmar → nova busca executa e reabre o gate; conferir que o card antigo continua rejeitado após F5. **Parar aí** (guardrail de custo).

## Tasks / Subtasks

- [x] **Task 1 — Estado de ajuste no store** (AC1): em [use-agent-store.ts](../../src/stores/use-agent-store.ts), adicionar ao `AgentUIState` `adjustingStep: { stepNumber: number; stepType: StepType; phase: "describe" | "confirm" } | null` + setter/clear. **NÃO** incluir no `partialize` (:68) — ver Trap #5.
- [x] **Task 2 — Seams no `useBriefingFlow`** (AC2, AC3): exportar `isConfirmation` (função pura, [:271](../../src/hooks/use-briefing-flow.ts#L271)) e adicionar ao `UseBriefingFlowReturn` ([:422](../../src/hooks/use-briefing-flow.ts#L422)) um `parseAdjustment(content, executionId)` que empilha o turno do usuário em `conversationRef` e chama `callParseAPI`, mais um `recordAgentTurn(content)` (ou reuso do `sendAndRecord`) para o resumo do agente entrar na memória. **Não duplicar** parser, lista de keywords nem mecanismo de memória. `processMessage` fica intocado.
- [x] **Task 3 — Ramo de ajuste no `handleSendMessage`** (AC2, AC3): em [AgentChat.tsx](../../src/components/agent/AgentChat.tsx), inserir o ramo **logo após o guard `if (!execId) return` ([:263](../../src/components/agent/AgentChat.tsx#L263)) e ANTES do roteamento de briefing ([:266](../../src/components/agent/AgentChat.tsx#L266))** — ver Trap #1. Espelhar o ramo de briefing: `sendMessageMutation.mutate` + `setAgentProcessing(true/false)` + `await refetchMessages(execId)`.
- [x] **Task 4 — Merge + PATCH do briefing ajustado** (AC4): helper puro (ex.: `mergeAdjustedBriefing(persisted, parsed)`) aplicando a regra "filtros do parse, forma da execução"; PATCH explícito com o objeto mesclado (**não** reusar `saveBriefing` [:225-238](../../src/components/agent/AgentChat.tsx#L225) — closure stale). Base do merge = briefing persistido (`GET /api/agent/executions` devolve `select("*")`) ou o do estado, conforme a decisão registrada em Dev Notes.
- [x] **Task 5 — `PATCH /briefing` deixa de apagar campos** (AC4, AC6): em [briefing/route.ts](../../src/app/api/agent/executions/[executionId]/briefing/route.ts), adicionar `premiumIcebreakers: z.boolean().optional()` ao schema (:17-48) e fazer o update **mesclar** sobre o briefing persistido (chaves presentes no payload vencem; ausentes preservadas) em vez de sobrescrever (:95-98).
- [x] **Task 6 — Custo da re-execução** (AC2): `GET /api/agent/executions/{id}/plan` **depois** do PATCH (o route lê o briefing do banco) → `steps[N-1].estimatedCost`. Fail-open: se falhar, resumo sem o número, mas a confirmação continua obrigatória.
- [x] **Task 7 — Ativar o estado de ajuste no reject** (AC1): nos três `handleReject` ([AgentApprovalGate.tsx:68](../../src/components/agent/AgentApprovalGate.tsx#L68), [AgentLeadReview.tsx:164](../../src/components/agent/AgentLeadReview.tsx#L164), [AgentCampaignPreview.tsx:131](../../src/components/agent/AgentCampaignPreview.tsx#L131)), no sucesso: setar `adjustingStep` no store **e** `setLoading(null)`.
- [x] **Task 8 — Auditoria durável** (AC5): no [reject route](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts), carimbar `metadata.rejected: true` na mensagem `approval_gate` mais recente do step (read-modify-write do JSONB); `rejected?: boolean` em `AgentMessageMetadata` ([types/agent.ts:84](../../src/types/agent.ts#L84)); os 3 componentes de gate aceitam prop `rejected` que inicializa `actionTaken` como `"rejected"`; [`ApprovalGateRenderer`](../../src/components/agent/AgentMessageBubble.tsx#L114) repassa `message.metadata.rejected`.
- [x] **Task 9 — Testes RED→GREEN** (AC7 a–d): RED provado antes de cada implementação; GREEN nos 4 caminhos do AC2/AC3 + carimbo do reject + merge do PATCH + helper puro + seams do hook; suíte cheia, `tsc` 0 em `src/`, eslint limpo nos arquivos tocados.
  - [x] **AC7(e) — smoke real FEITO (2026-07-25, skill `verify`, Playwright + LLM real + Apollo real, logado fabotse).** Roteiro completo executado: briefing "CTOs em São Paulo" → guiado → busca (1298 leads) → **Rejeitar** → card "❌ Rejeitado" + botões mortos + placeholder de ajuste + spinner parado (AC1) → *"troca o cargo para Diretor de TI e remove o filtro de tamanho"* → LLM real aplicou (Cargos: Diretor de TI, Tamanho: sem filtro, São Paulo preservado) + custo R$ 3,00 + confirmação em UMA mensagem (AC2) → **teste do P1 ao vivo**: *"sim, mas troca para Diretor de Tecnologia"* NÃO executou — virou novo ajuste com a correção aplicada (AC3 fail-safe) → "sim" limpo → re-execução real: novo gate com leads "Diretor de Tecnologia" (o filtro chegou à Apollo) → **F5**: card antigo segue rejeitado/desabilitado via `metadata.rejected`, gate novo ativo, sem reentrada em ajuste (correto — gate mais recente não está rejeitado) (AC5). **Parado no gate reaberto — guardrail de custo respeitado, nada aprovado.** Evidência: `.playwright-mcp/smoke-22-13-pos-f5.png`. Custo: 2× busca Apollo (R$ 3,00 cada) + 3 chamadas de parse.

## Dev Notes

### Verificações feitas nesta create-story (não refaça — e não contrarie sem evidência)

**O backend já suporta a re-execução. Confirmado:**

- [execute/route.ts:87-97](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L87) — o **único** guard é o terminal da *execução* (22.10). **Não há guard de status do step** → um step `awaiting_approval` re-executa sem alteração de rota.
- [orchestrator.ts:213-218](../../src/lib/agent/orchestrator.ts#L213) — `input.briefing = executionData.briefing`, relido do banco a cada `executeStep`. **O PATCH feito antes É lido.** Nenhuma mudança na resolução de input.
- [orchestrator.ts:124-133](../../src/lib/agent/orchestrator.ts#L124) — `previousStepOutput` = último step `< N` com status `in (completed, approved)`. O step anterior aprovado continua servindo; nada a mexer.
- [base-step.ts:45-68](../../src/lib/agent/steps/base-step.ts#L45) — em `guided`, o `run()` reescreve `awaiting_approval` e chama `sendApprovalGateMessage` → **o novo card de gate nasce sozinho**. É exatamente por isso que o backend não precisa de estado novo.
- [AgentInput.tsx:30](../../src/components/agent/AgentInput.tsx#L30) — o input **já fica habilitado** pós-briefing (só `isInputDisabled`/`isSending`/`isAgentProcessing`/mode-selector desabilitam). AC1 só precisa do placeholder.

### O que NÃO existe hoje e você precisa criar (seams)

`isConfirmation` ([:271](../../src/hooks/use-briefing-flow.ts#L271)) e `CONFIRMATION_KEYWORDS` ([:53](../../src/hooks/use-briefing-flow.ts#L53)) são **privados**. `callParseAPI` ([:461](../../src/hooks/use-briefing-flow.ts#L461)) e `conversationRef` ([:445](../../src/hooks/use-briefing-flow.ts#L445)) **não estão** em `UseBriefingFlowReturn` ([:422-431](../../src/hooks/use-briefing-flow.ts#L422)), que expõe apenas `state`/`processMessage`/`reset`. Sem a Task 2 a story vira duplicação de parser e de keywords — exatamente o que a 22.11 mandou não fazer.

### Decisão de design: o ajuste muda FILTROS, nunca a FORMA (AC4)

O `/parse` re-deriva o briefing **inteiro** a partir da conversa. Duas coisas nunca estão na conversa e uma é re-derivada de forma perigosa:

| Campo | Origem real | O que acontece se você aplicar o parse cru |
|---|---|---|
| `premiumIcebreakers` | escrito pelo **servidor** no confirm ([confirm/route.ts:78,117](../../src/app/api/agent/executions/[executionId]/confirm/route.ts#L78)) | some → [create-campaign-step.ts:200](../../src/lib/agent/steps/create-campaign-step.ts#L200) e [agent-cost-estimator.ts:108](../../src/lib/services/agent-cost-estimator.ts#L108) leem `false` → **o usuário pagou premium e recebe standard, em silêncio** |
| `importedLeads` | client-only ([use-briefing-flow.ts:950](../../src/hooks/use-briefing-flow.ts#L950)) | some → `create_campaign` quebra com "Lista de leads importados esta vazia" (a mesma falha da 22.11) |
| `skipSteps` | canonicalizado por regra determinística ([parse/route.ts:252-263](../../src/app/api/agent/briefing/parse/route.ts#L252): sem `technology` → empurra `search_companies`) | muda a **forma** do pipeline depois que os `agent_steps` já foram criados no confirm; `shouldSkip` ([orchestrator.ts:164](../../src/lib/agent/orchestrator.ts#L164)) é avaliado por step em tempo de execução → comportamento incoerente com o plano aprovado |

Daí a regra do AC4. E como o `PATCH /briefing` é **replace total** com `z.object` (strip silencioso de chaves não declaradas — a lição da 22.5, comentada no próprio schema em [:34-36](../../src/app/api/agent/executions/[executionId]/briefing/route.ts#L34)), preservar no cliente não basta: `premiumIcebreakers` seria descartado na porta. Por isso a Task 5 (schema + merge server-side). O merge é a escolha certa porque torna o route **a** fonte de verdade da preservação — qualquer chamador futuro fica protegido — e é inócuo para o PATCH pré-confirmação, que envia o objeto completo.

**Alternativa rejeitada:** o cliente buscar `GET /api/agent/executions` (que faz `select("*")`, [executions/route.ts:32](../../src/app/api/agent/executions/route.ts#L32)) só para reconstruir `premiumIcebreakers` antes de cada PATCH — round-trip extra, racy, e deixa o buraco aberto para o próximo chamador.

### Traps

- **Trap #1 — posição do ramo.** Colocar o ramo de ajuste depois do `if (briefingState.status !== "confirmed")` ([:266](../../src/components/agent/AgentChat.tsx#L266)) parece natural e está errado: numa execução **reatachada** (22.8/22.10) o `useBriefingFlow` renasce em `idle` e a mensagem cairia no fluxo de briefing. Ramo antes de :266, condicionado só a `adjustingStep != null`.
- **Trap #2 — memória bidirecional.** O resumo do ajuste que o agente envia **precisa** entrar em `conversationRef` (padrão `sendAndRecord`, [:449-459](../../src/hooks/use-briefing-flow.ts#L449)). Sem isso, o turno seguinte ("na verdade troca o cargo pra CFO") é parseado sem contexto e o parser esquece os campos já preenchidos (Trap #1 clássico da 22.3).
- **Trap #3 — `saveBriefing` é armadilha de closure.** [:225-238](../../src/components/agent/AgentChat.tsx#L225) fecha sobre `briefingState.briefing`. No ramo de ajuste, PATCH explícito com o objeto mesclado.
- **Trap #4 — re-executar `search_leads` não amplia o universo de empresas.** [search-leads-step.ts:71](../../src/lib/agent/steps/search-leads-step.ts#L71): `isDirectEntry = !previousStepOutput`. Com o step 1 aprovado, a re-execução do step 2 continua buscando **pelos domínios das empresas do step 1** ([:126-137](../../src/lib/agent/steps/search-leads-step.ts#L126)). Não prometa no resumo o que a re-execução não faz ("vou buscar de novo com esses ajustes", não "vou buscar em todo o mercado"). Ampliar o universo é assunto da 22.14.
- **Trap #5 — não persista `adjustingStep`.** Se ele sobrevivesse ao refresh, a próxima mensagem seria parseada com `conversationRef` **vazio** → o parser derivaria um briefing do zero a partir de uma frase e o merge destruiria os filtros. Estado efêmero de propósito; pós-refresh o usuário cai no comportamento atual. Reentrada durável em ajuste = fora de escopo (registrar em `deferred-work.md`).
- **Trap #6 — o step rejeitado pode não ser o "atual".** Use sempre o `stepNumber` guardado no `adjustingStep`, nunca um "step corrente" derivado da lista de steps.
- **Trap #7 — carimbar o gate certo.** Após uma re-execução existirão **vários** `approval_gate` do mesmo step. No reject, filtre por `execution_id` + `metadata->>messageType = 'approval_gate'` + `metadata->>stepNumber = String(stepNumber)`, ordene por `created_at desc` e pegue **1**. `metadata` é JSONB: leia, espalhe e regrave (`{...metadata, rejected: true}`) — não há update parcial de JSONB pelo client JS.

### Testes — infra existente a reusar

- [`__tests__/unit/components/agent/AgentChat.test.tsx`](../../__tests__/unit/components/agent/AgentChat.test.tsx) (1284 linhas): padrão já montado — `capturedOnSendMessage`, `mockBriefingState`, `mockStoreState`, `mockExecutionData`, `mockRefetchMessages`, `vi.mock` de `use-agent-execution`/`use-briefing-flow`/`use-user`. O RED é direto: com `mockBriefingState.status = "confirmed"`, chamar `capturedOnSendMessage("remove o filtro de tamanho")` e assertar que **só** `mockMutate` foi chamado (nenhum `fetch` para `/parse`, `/briefing`, `/execute`).
- [`__tests__/unit/app/api/agent/executions/steps/reject.test.ts`](../../__tests__/unit/app/api/agent/executions/steps/reject.test.ts): `createChainBuilder` + `mockFrom` por tabela — estender para o carimbo do `metadata.rejected` e para o invariante "step segue `awaiting_approval`".
- Comandos: `npx vitest run __tests__/unit/components/agent/AgentChat.test.tsx`, `npx vitest run __tests__/unit/app/api/agent/executions/steps/reject.test.ts`, `npx vitest run`, `npx tsc --noEmit`, `npx eslint <arquivos tocados> --max-warnings=0`.
- Smoke real (AC7e): skill `verify` (Playwright, app local, usuário logado).

### Previous story intelligence

- **22.11** — o padrão âncora: *o LLM sugere, o determinístico decide*. O guard fail-safe (na dúvida, não sequestra a conversa / não gasta crédito) é o modelo direto do AC3. Também de lá: um briefing "envenenado" que passa despercebido só explode na execução — daí o rigor do AC4.
- **22.12** — mock não prova rota externa; smoke real é definição de pronto. Aqui o análogo é o LLM: a suíte mocka a OpenAI, então a interpretação real do ajuste **só** é provada no smoke.
- **22.3** — a memória (`conversationRef` + `sendAndRecord`) existe e funciona; o erro caro é não plugá-la (Trap #2).
- **22.17** (mesma sessão, ready-for-dev) — mesma família do spinner que não limpa no sucesso; se as duas stories tocarem `AgentActivationGate`/gates ao mesmo tempo, coordenar para não conflitar. Esta story mexe apenas nos `handleReject`; a 22.17, nos `handleActivate`/`handleDefer`.
- **Pre-commit**: `lint-staged` roda eslint com `--max-warnings=0` no arquivo inteiro. `process.env.X!` pré-existente em `src/lib/supabase/*.ts` bloqueia commit se algum deles for tocado — não use `--no-verify`.

### Nota sobre pesquisa de tecnologia externa

Nenhuma dependência, versão de biblioteca ou contrato de API externa muda nesta story: o parser e seu modelo foram atualizados na 22.11 e permanecem como estão; todas as rotas consumidas (`/parse`, `/briefing`, `/plan`, `/execute`, `/reject`) são internas. Não há pesquisa externa pendente.

### References

- [Source: src/components/agent/AgentChat.tsx#L240-L318] — `handleSendMessage`; ponto de inserção do ramo (:263/:266) e o "fluxo normal" inerte (:302)
- [Source: src/hooks/use-briefing-flow.ts#L422-L431] — `UseBriefingFlowReturn` (seams a estender)
- [Source: src/hooks/use-briefing-flow.ts#L445-L485] — `conversationRef`, `sendAndRecord`, `callParseAPI` (memória 22.3)
- [Source: src/hooks/use-briefing-flow.ts#L53-L70, #L271-L274] — `CONFIRMATION_KEYWORDS` / `isConfirmation` (SSOT determinístico)
- [Source: src/app/api/agent/executions/[executionId]/briefing/route.ts#L17-L48, #L91-L102] — schema estrito + replace total
- [Source: src/app/api/agent/executions/[executionId]/confirm/route.ts#L68-L78, #L117] — `premiumIcebreakers` gravado pelo servidor
- [Source: src/app/api/agent/briefing/parse/route.ts#L240-L295] — canonicalização determinística de `skipSteps` e `canProceed`
- [Source: src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L81-L97] — guard terminal 22.10; sem guard de status de step
- [Source: src/lib/agent/orchestrator.ts#L120-L218] — `previousStepOutput`, `shouldSkip`, montagem do `StepInput`
- [Source: src/lib/agent/steps/base-step.ts#L45-L68] — guided reabre o gate sozinho
- [Source: src/lib/agent/steps/search-leads-step.ts#L58-L137] — direct entry vs. busca por domínios (Trap #4)
- [Source: src/components/agent/AgentApprovalGate.tsx#L68-L147] — `handleReject`, `actionTaken`, spinner que não limpa
- [Source: src/components/agent/AgentMessageBubble.tsx#L114-L165] — `ApprovalGateRenderer`
- [Source: src/types/agent.ts#L84-L110] — `AgentMessageMetadata`, `ParsedBriefing`
- [Source: _bmad-output/implementation-artifacts/22-11-guard-import-leads-e-modelo-do-parser.md] — padrão "LLM sugere, âncora/confirmação decide"
- [Source: _bmad-output/implementation-artifacts/spec-22-13-ajuste-pos-rejeicao-de-etapa.md] — intent-contract da story
- [Source: _bmad-output/planning-artifacts/agente-e2e-teste-atibaia-2026-07-24.md] — evidência (2 mensagens ignoradas, network limpo)

### Review Findings (code-review 3 camadas, 2026-07-24)

> **Status: 11/11 patches APLICADOS** (2 vindos das decisões + 9 diretos). 6 deferidos registrados em `deferred-work.md`, 7 descartados. Detalhe do que mudou em cada um no Dev Agent Record → *Patches do code review*.

**Decisões necessárias (bloqueiam os patches):**

- [x] **[Review][Decision] Beco sem saída pós-F5: o card rejeitado durável desabilita os DOIS botões e o `adjustingStep` é efêmero** — `AgentApprovalGate.tsx:55-57,108` + `use-agent-store.ts:92`. AC5 exige o card marcado **e com os botões desabilitados**; o Trap #5 exige o `adjustingStep` efêmero. Juntos: o usuário rejeita, dá F5 antes de digitar o ajuste, e fica sem nenhuma saída — o card volta morto, o step segue `awaiting_approval`, e só "Nova conversa" (que cancela a execução) resta. O comentário do store diz *"pós-refresh o usuário cai no comportamento atual"* — falso neste build, porque o comportamento atual tinha os botões vivos. Mesmo caminho para um clique errado em "Rejeitar" (nada des-carimba o `rejected`). Convergência blind+edge. **Opções:** (a) reentrada durável em ajuste no load — é a opção que o próprio spec recomenda em Design Notes e que a decisão D2 (guard `canProceed`) tornou segura; (b) manter só "Aprovar" habilitado num card rejeitado; (c) aceitar e deferir (o Trap #5 declarou reentrada durável fora de escopo, mas sem prever este efeito da AC5). → **DECIDIDO por Fabossi (2026-07-24): opção (a)** — reentrada durável no load. Vira patch.
- [x] **[Review][Decision] O merge coage metadados de campanha (e filtros) a `null` quando o parse não os re-deriva** — `briefing-adjustment.ts:60-63,55,59`. `objective/urgency/campaignDescription/emailCount: parsed.X ?? null`, e `technology/companySize/industry` são sobrescritos incondicionalmente. Com memória cheia é o comportamento correto (AC4 manda aplicar esses campos do parse). Com memória vazia (rejeitar após F5 — o `canProceed` da D2 só cobre cargo+localização) um "quero CTOs em SP sem filtro de tamanho" apaga `emailCount: 5` e `objective: REENGAGEMENT` — e o resumo de confirmação **não mostra** esses 4 campos quando o step ajustado não é `create_campaign`. Convergência nas 3 camadas. **Opções:** (a) preservar com `?? persisted.X` — mas aí "remove a descrição da campanha" deixa de funcionar; (b) manter a semântica literal da AC4 e **mostrar as remoções no resumo** ("vou REMOVER: tecnologia, setor, nº de e-mails"), deixando a confirmação ser o backstop; (c) (a) para os 4 metadados de campanha + (b) para os filtros de busca. → **DECIDIDO por Fabossi (2026-07-24): opção (c)** — preservar os 4 metadados de campanha quando o parse devolve null + listar as remoções de filtro no resumo. Vira patch. Nota: com isso, remover um metadado de campanha só falando deixa de funcionar (ex.: "tira a descrição da campanha") — remoção de campanha passa a exigir valor novo.

**Patches (fix não-ambíguo):**

- [x] [Review][Patch] **[High]** Confirmação da re-execução usa `isConfirmation` cru — substring match dispara em não-confirmações e gasta crédito com os parâmetros ANTIGOS [src/components/agent/AgentChat.tsx:321]
- [x] [Review][Patch] **[High]** `execute` fire-and-forget com `.catch(() => {})` **depois** de `clearAdjustingStep()` — 409/422/500 viram silêncio e recriam o beco sem saída [src/components/agent/AgentChat.tsx:322-333]
- [x] [Review][Patch] **[Med]** O merge server-side descarta o `error` da leitura prévia → degrada para replace-total e apaga `premiumIcebreakers` com 200 [src/app/api/agent/executions/[executionId]/briefing/route.ts:101-113]
- [x] [Review][Patch] **[Med]** `adjustingStep` não guarda o `executionId` — sobrevive ao descarte de execução fantasma/troca de usuário e sequestra a próxima conversa [src/stores/use-agent-store.ts:29-37]
- [x] [Review][Patch] **[Med]** O corpo do ramo de ajuste é `try/finally` sem `catch` — falha de rede no `sendAndRecordAgent` após o PATCH deixa o briefing alterado, sem resumo e com unhandled rejection [src/components/agent/AgentChat.tsx:315-408]
- [x] [Review][Patch] **[Med]** O resumo imprime filtros de busca ao ajustar `create_campaign` e promete "executar com esses parâmetros" — a re-execução da campanha não re-filtra leads [src/lib/agent/briefing-adjustment.ts:105-123]
- [x] [Review][Patch] **[Med]** `reject.test.ts` não asserta os filtros do Trap #7 (`metadata->>stepNumber`, `order desc`, `limit 1`) — carimbar o gate ERRADO após uma re-execução passaria verde [__tests__/unit/app/api/agent/executions/steps/reject.test.ts:126-159]
- [x] [Review][Patch] **[Low]** `ADJUSTABLE_BRIEFING_FIELDS` é exportado e nunca usado — segunda cópia da lista de campos, some com o próximo filtro novo [src/lib/agent/briefing-adjustment.ts:18-30]
- [x] [Review][Patch] **[Low]** Assimetria de memória no ramo de confirmação: grava o turno do agente sem o turno do usuário [src/components/agent/AgentChat.tsx:321-328]

**Deferidos (reais, fora do alcance desta story):**

- [x] [Review][Defer] `GET /api/agent/executions` (`select("*")`, sem limit) é chamado a cada turno de ajuste [src/app/api/agent/executions/route.ts:30] — deferido, endpoint pré-existente (já usado no mount)
- [x] [Review][Defer] O merge no PATCH impede REMOVER chaves opcionais (`importedLeads`) [briefing/route.ts:104] — deferido, inalcançável hoje (só há 1 PATCH pré-confirm, contra briefing vazio)
- [x] [Review][Defer] `approved` continua sendo estado local — card aprovado volta com botões vivos após F5 e o clique responde 409 [AgentApprovalGate.tsx:55] — deferido, pré-existente
- [x] [Review][Defer] Gate `export` não recebe `rejected` no `ApprovalGateRenderer` [AgentMessageBubble.tsx:161] — deferido, `AgentActivationGate` não tem botão Rejeitar hoje; a 22.17 mexe nesse componente
- [x] [Review][Defer] Read-modify-write sem controle de concorrência no `briefing` e no `metadata` [briefing/route.ts:104, reject/route.ts:161] — deferido, padrão pré-existente do projeto
- [x] [Review][Defer] Carimbo usa `created_at DESC LIMIT 1` sem tie-break e filtra expressão JSONB sem índice [reject/route.ts:158-166] — deferido, colisão exige mesmo-milissegundo

## File List

**Novos**
- `src/lib/agent/briefing-adjustment.ts` — helpers puros `mergeAdjustedBriefing` (AC4) e `buildAdjustmentSummary` (AC2)
- `__tests__/unit/lib/agent/briefing-adjustment.test.ts`

**Modificados (src)**
- `src/stores/use-agent-store.ts` — `adjustingStep` + `setAdjustingStep`/`clearAdjustingStep` (fora do `partialize`)
- `src/hooks/use-briefing-flow.ts` — `isConfirmation` exportado; seams `parseAdjustment` e `recordAgentTurn`
- `src/components/agent/AgentChat.tsx` — ramo de ajuste em `handleSendMessage` + helpers (`sendAndRecordAgent`, `fetchPersistedBriefing`, `fetchStepEstimatedCost`, `handleAdjustmentMessage`); "Nova conversa" limpa o ajuste
- `src/components/agent/AgentInput.tsx` — placeholder orientado por fase do ajuste
- `src/components/agent/AgentApprovalGate.tsx` — prop `rejected`, ajuste no reject, spinner para no sucesso
- `src/components/agent/AgentLeadReview.tsx` — idem (`search_leads`)
- `src/components/agent/AgentCampaignPreview.tsx` — idem (`create_campaign`)
- `src/components/agent/AgentMessageBubble.tsx` — `ApprovalGateRenderer` repassa `metadata.rejected`
- `src/types/agent.ts` — `rejected?: boolean` em `AgentMessageMetadata`
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` — schema declara `premiumIcebreakers`; update virou **merge** sobre o persistido
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts` — carimbo `metadata.rejected` (best-effort)

**Modificados (testes)**
- `__tests__/unit/components/agent/AgentChat.test.tsx` — 7 testes do ramo de ajuste
- `__tests__/unit/components/agent/AgentApprovalGate.test.tsx`, `AgentLeadReview.test.tsx`, `AgentCampaignPreview.test.tsx` — ajuste no reject + prop `rejected`
- `__tests__/unit/components/agent/AgentMessageBubble.test.tsx` — repasse do `metadata.rejected`
- `__tests__/unit/components/agent/AgentInput.test.tsx` — placeholder de ajuste
- `__tests__/unit/hooks/use-briefing-flow.test.tsx` — seams + memória + `{handled:false}` em `confirmed`
- `__tests__/unit/api/agent/briefing-update.test.ts` — merge + `premiumIcebreakers`
- `__tests__/unit/app/api/agent/executions/steps/reject.test.ts` — carimbo + invariante `awaiting_approval`

## Dev Agent Record

### Implementation Plan (decisões tomadas no dev)

**A story é 90% cliente, como previsto.** O backend só ganhou duas mudanças: o merge do `PATCH /briefing` (Task 5) e o carimbo de auditoria no reject (Task 8). `execute`, `orchestrator`, `base-step` e o enum `StepStatus` ficaram intocados.

**D1 — base do merge = briefing PERSISTIDO (decisão pendente na Task 4).** O ramo de ajuste faz `GET /api/agent/executions` e usa o briefing do servidor como base, com `briefingState.briefing` só como fallback. Motivo: numa execução **reatachada** (22.8/22.10) o `useBriefingFlow` renasce em `idle` e o briefing local é `null` — o merge sobre `null` seria impossível ou destrutivo. A "alternativa rejeitada" das Dev Notes era usar o GET **em vez** do merge server-side (deixando o buraco do `premiumIcebreakers` aberto para o próximo chamador); aqui o GET é só a base do merge — a Task 5 (merge no route) foi feita e continua sendo a proteção estrutural.

**D2 — guard `canProceed` no ramo de ajuste (proteção extra, mesma família do Trap #5).** O Trap #5 explica por que `adjustingStep` não é persistido: com `conversationRef` vazio, o parser derivaria um briefing do zero a partir de uma frase e o merge destruiria os filtros. Existe uma porta lateral para o mesmo desastre que a story não cobria: **rejeitar depois de um refresh** (o gate ainda está na tela, mas a memória conversacional nasceu vazia). Fechei com o gate determinístico que já existe: se `parse.canProceed === false` (sem cargo + localização), o ajuste **não aplica nada** — mesma mensagem de fail-open do AC2, sem PATCH e sem execute. Custo zero de superfície nova, e coerente com NFR1 ("o determinístico prevalece").

**D3 — `rejected` derivado, não inicializador.** A Task 8 sugeria a prop `rejected` inicializando `actionTaken`. Um `useState(rejected ? ...)` não reagiria à chegada do metadata carimbado no refetch seguinte (o card voltaria ativo por alguns segundos). Implementado como valor derivado: `actionTaken = rejected ? "rejected" : localActionTaken`. O AC5 (marcado + botões desabilitados após F5) é atendido de forma reativa.

**D4 — "Nova conversa" limpa o `adjustingStep`.** Não estava nas tasks e é necessário: um ajuste em aberto atravessaria para a conversa nova e sequestraria a primeira mensagem para uma execução que já não existe.

**Fire-and-forget no `execute`**: mesmo padrão do `handleConfirmPlan`/`triggerNextStep` já existentes — o resultado chega pelo polling e o `BaseStep` reabre o gate sozinho.

### Patches do code review (2026-07-24, 3 camadas adversariais)

As três camadas **convergiram** nos dois achados mais graves — e ambos eram do dev, não da story:

- **P1 (High) — `isConfirmation` cru decidia gastar crédito.** Chamei o helper de "SSOT determinístico" mas o copiei com fidelidade MENOR que a do próprio dono: no fluxo de briefing ele nunca decide sozinho (`isConfirmation(content) && !briefingChanged(...)`). Sozinho é `includes()` de substring sobre `["sim","ok","pode","vai","isso","manda","vamos"]` → *"pode tirar o filtro de indústria?"*, *"isso não está certo"* e *"as**sim** não dá"* disparavam a re-execução **paga com os parâmetros antigos**, engolindo a correção. Fix: `isAdjustmentConfirmation` (puro, em `briefing-adjustment.ts`) exige (1) keyword como **palavra inteira** sobre a MESMA lista — agora exportada, sem segunda cópia; (2) sem `?`; (3) sem sinal de ajuste (negação, ressalva ou verbo de mudança). Assimétrico de propósito: falso negativo custa um parse, falso positivo custa crédito + a correção do usuário. `isConfirmation` **não** foi alterado (AC6: fluxo de briefing intacto). 15 testes novos, incluindo os 5 falsos positivos reportados.
- **P2 (High) — falha do `execute` era silêncio absoluto.** `clearAdjustingStep()` rodava ANTES de um `fetch(...).catch(() => {})`. Um 409/422/500 deixava o usuário com a promessa *"vou executar de novo"*, o card antigo desabilitado pelo `rejected` durável e o estado de ajuste destruído — o beco sem saída de volta. Fix: o disparo segue não-aguardado (o step roda por minutos e travaria o input), mas agora trata a resposta: em falha **restaura a fase "confirm"** e diz *"nenhum crédito foi gasto — responda sim para tentar de novo"*.
- **P3 (High, decisão 1 de Fabossi) — beco sem saída pós-F5.** AC5 (card rejeitado com botões desabilitados) + Trap #5 (`adjustingStep` efêmero) juntas trancavam o usuário: rejeitar → F5 antes de digitar → nenhuma saída além de "Nova conversa" (que cancela a execução). O comentário que eu havia escrito no store (*"pós-refresh cai no comportamento atual"*) era falso, porque o comportamento atual tinha os botões vivos. Fix: **reentrada durável** — um efeito reconstrói o estado a partir do servidor (gate mais recente carimbado como rejeitado + step ainda `awaiting_approval`). É a opção que o próprio spec recomendava em Design Notes, e a decisão D2 (guard `canProceed`) é o que a torna segura com memória vazia. Um `Set` de gates já tratados garante "no máximo uma vez por gate por vida da página" — sem ele, a janela entre confirmar e o novo gate nascer jogaria o usuário de volta para "describe".
- **P4 (Med, decisão 2 de Fabossi) — metadados de campanha coagidos a `null`.** `objective/urgency/campaignDescription/emailCount: parsed.X ?? null` rebaixava em silêncio uma sequência de 5 e-mails de reengajamento para os defaults. Fix (opção c): os 4 metadados **preservam** o persistido quando o parse não os re-deriva; os filtros de busca continuam vindo do parse (para "remove o filtro de tamanho" funcionar) **e** o resumo agora avisa *"vou REMOVER Tamanho, Industria"* antes da confirmação (`listRemovedFilters`). Trade-off aceito e registrado: remover metadado de campanha passa a exigir valor novo.
- **P5 (Med) — o merge degradava para replace em silêncio.** `const { data } = await supabase...` descartava o `error`: leitura falha → `currentBriefing = {}` → apaga `premiumIcebreakers`/`importedLeads` e responde **200**. Exatamente o rebaixamento pago que a Task 5 existe para impedir, reintroduzido pela porta do erro. Fix: falha alto (500) sem tocar no update.
- **P6 (Med) — `adjustingStep` sem `executionId`.** Estado global efêmero sobrevivia ao descarte de execução fantasma / troca de usuário sem unmount e sequestraria a primeira mensagem da conversa seguinte (PATCH + execute contra o step de OUTRA execução). Fix: `executionId` no estado + guard no `handleSendMessage` que **descarta** um ajuste órfão em vez de aplicá-lo.
- **P7 (Med) — ramo sem `catch`.** Era `try/finally`: uma falha de rede no POST da mensagem do agente escapava como unhandled rejection, possivelmente **depois** do PATCH. Fix: `catch` que avisa e mantém o estado de ajuste (o fluxo é idempotente ao redescrever).
- **P8 (Med) — resumo enganoso na campanha.** Ao rejeitar a campanha, o resumo listava filtros de busca e prometia "executar com esses parâmetros" — mas re-executar `create_campaign` não re-filtra o conjunto de leads aprovado. Fix: corpo do resumo por tipo de step; na campanha mostra objetivo/urgência/descrição/nº de e-mails e diz *"os leads já aprovados continuam os mesmos"*.
- **P9 (Med) — teste que não provava o Trap #7.** `reject.test.ts` assertava o payload do update mas não os filtros (`metadata->>stepNumber`, `order desc`, `limit 1`): uma regressão que carimbasse o gate ERRADO (o novo, ativo) passaria verde. Fix: asserts dos 5 filtros.
- **P10 (Low) — `ADJUSTABLE_BRIEFING_FIELDS` morto**, segunda cópia da lista de campos: removido (a lista vive no docblock do merge).
- **P11 (Low) — memória assimétrica no confirm**: gravava o turno do agente sem o turno do usuário. Fix: seam `recordUserTurn`.

**Dois achados caíram na verificação** (não são alcançáveis): o "loop de 400 irrecuperável" por `campaignDescription > 200`/`emailCount` fora de faixa e o `TypeError` em `jobTitles.length` — o parser já clampa (`.max(200).catch(null)`, `.min(1).max(10).catch(null)`, `jobTitles.default([])`). E o gate `export` sem `rejected` perdeu gravidade: o `AgentActivationGate` não tem botão "Rejeitar" (só Ativar/Adiar) — deferido para a 22.17, que já mexe nesse componente.

### Debug Log

- **Ambiente**: `node_modules` deste repo foi instalado pelo **WSL** (só há `@rollup/rollup-linux-*`). `npx vitest` no Windows quebra com `Cannot find module @rollup/rollup-win32-x64-msvc`. Toda a suíte, `tsc` e `eslint` desta story rodaram via `wsl -e bash -lc "cd /mnt/c/... && npx ..."`. Nada foi instalado/alterado no `package.json` para contornar.
- **RED provado (3 rodadas, antes de cada implementação)**: (1) AgentChat — 5 falhas nos caminhos do AC2/AC3 com 57 legados verdes; (2) `briefing-update` — 2 falhas (premiumIcebreakers stripado + não preservado); (3) reject/gates/bubble/input — 1 + 8 falhas.
- **Suíte cheia**: 7058 passaram, 2 skipped, **2 falhas** em `knowledge-base-tabs.test.tsx` e `types/*.test.ts` — timeouts de 5 s por contenção do `/mnt/c` (setup 3557 s no total). Ambas **passam isoladas** e não tocam nenhum arquivo desta story.
- **`tsc --noEmit`**: **0 erros em `src/`**. Os erros restantes são pré-existentes em `__tests__/` (mock helpers); conferi arquivo por arquivo que **nenhum** foi introduzido por esta story (as linhas que eu adicionei saíram limpas).

### Completion Notes

- **O beco sem saída fechou.** Rejeitar → descrever o ajuste em linguagem natural → o agente aplica no briefing, mostra o que mudou + o custo → confirmar → a etapa re-executa e um gate novo abre. O briefing inteiro é preservado; "Nova conversa" deixou de ser a única saída.
- **A decisão cara continua determinística** (padrão 22.11): `isConfirmation` — agora exportado como SSOT em vez de duplicado — decide a re-execução. Qualquer mensagem ambígua vira um novo ajuste e **não** gasta crédito. O LLM só interpreta *o que* ajustar.
- **A memória da 22.3 foi plugada, não recriada**: `parseAdjustment` empilha o turno no mesmo `conversationRef` e chama o mesmo `callParseAPI`; `recordAgentTurn` devolve o resumo do agente para a memória (Trap #2). Teste prova o histórico completo chegando ao `/parse`.
- **Duas armadilhas de dinheiro fechadas**: (a) `premiumIcebreakers` era stripado pelo `z.object` em todo PATCH pós-confirm — um ajuste rebaixaria icebreaker **pago** para standard em silêncio; agora o schema o declara **e** o route mescla sobre o persistido (protege qualquer chamador futuro); (b) `skipSteps`/`importedLeads`/`mode`/`productSlug` re-derivados pelo parse não tocam mais a forma do pipeline em execução.
- **Auditoria durável**: o reject carimba `metadata.rejected` no `approval_gate` mais recente do step (filtro por `execution_id` + `messageType` + `stepNumber`, `order desc limit 1` — Trap #7). Fail-open: erro de auditoria não derruba um reject bem-sucedido.
- **Spinner do "Rejeitar"** para no sucesso nos 3 gates (deixava de ser cosmético neste fluxo).
- **PENDENTE (AC7e)**: smoke real pela interface. A suíte mocka OpenAI e o pipeline — a interpretação real do ajuste e a re-execução paga só são provadas no app. Roteiro no AC7(e); guardrail de custo: parar no gate reaberto.

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-24 | Story criada (Amelia) a partir do teste E2E — dead-end pós-rejeição reproduzido com evidência de network; diagnóstico em código. Status: draft. |
| 2026-07-25 | **SMOKE REAL FEITO → STORY DONE.** Interface real (Playwright, `npm run dev` Windows nativo restaurado, LLM + Apollo reais): rejeição → ajuste em linguagem natural aplicado de verdade (leads voltaram como "Diretor de Tecnologia") → falso positivo *"sim, mas..."* NÃO executou (patch P1 provado ao vivo) → confirmação limpa re-executou e reabriu o gate → F5 manteve o card rejeitado durável e não reentrou em ajuste. Parado no gate reaberto (guardrail). **Nota de ambiente da mesma data:** o `node_modules` estava com binários linux (o `npm install` do setup do bmad-loop rodou de dentro do WSL) — corrigido com `npm ci` no PowerShell, repo devolvido ao fluxo Windows-nativo do Fabossi; regra nova na memória do projeto: nunca rodar npm do WSL contra esta pasta. |
| 2026-07-24 | **Code review 3 camadas (Blind Hunter + Edge Case Hunter + Acceptance Auditor, paralelas e cegas entre si).** Auditor: AC1/AC2/AC4/AC5/AC6 MET, AC3 PARCIAL (cláusula fail-safe violada), AC7 parcial-declarado; D1–D4 justificáveis. 24 achados → **2 decision-needed + 9 patch + 6 defer + 7 dismiss**. As 3 camadas convergiram em: `isConfirmation` cru gastando crédito em falso positivo (P1) e `execute` fire-and-forget silencioso após destruir o estado (P2). Decisões de Fabossi: (1) reentrada durável no ajuste — fecha o beco sem saída pós-F5 criado pela AC5+Trap #5; (2) preservar metadados de campanha + avisar remoções no resumo. **11/11 patches aplicados**, +25 testes novos (15 de confirmação estrita, 5 de falso positivo no ramo confirm, 3 de reentrada, ajuste órfão, falha do execute). 6 defers em `deferred-work.md`. Detalhe por patch no Dev Agent Record. |
| 2026-07-24 | **Implementada (dev-story, Opus 5).** 9 tasks, AC1–AC6 completos, AC7 a–d verdes. Cliente: `adjustingStep` efêmero no store + ramo de ajuste no `handleSendMessage` (antes do roteamento de briefing — Trap #1) + seams `isConfirmation`/`parseAdjustment`/`recordAgentTurn` no `useBriefingFlow` + helper puro `mergeAdjustedBriefing`/`buildAdjustmentSummary` + placeholder do input + 3 `handleReject` ligando o ajuste e parando o spinner. Servidor: `PATCH /briefing` passou a **mesclar** (e declara `premiumIcebreakers`) e o reject carimba `metadata.rejected`. Decisões: base do merge = briefing persistido (D1); guard `canProceed` fecha a porta lateral do Trap #5 (rejeitar após refresh, D2); `rejected` derivado em vez de inicializador (D3); "Nova conversa" limpa o ajuste (D4). Suíte 7058 pass / 2 flakes de timeout não relacionados; `tsc` 0 em `src/`; eslint limpo. **PENDENTE: smoke real (AC7e).** Status: review. baseline 079aca0. |
| 2026-07-24 | Contexto completo (create-story, Opus 5): backend validado como suficiente (execute sem guard de step, briefing relido do banco, gate reaberto pelo `BaseStep`); seams inexistentes no `useBriefingFlow` mapeados; **AC4 novo** — `PATCH /briefing` apaga `premiumIcebreakers` (schema não o declara + replace total) e o parse re-deriva `skipSteps`, o que rebaixaria icebreaker pago e mudaria a forma do pipeline em execução; AC5 endurecido para auditoria durável; 7 traps com file:line. Status: ready-for-dev. |
