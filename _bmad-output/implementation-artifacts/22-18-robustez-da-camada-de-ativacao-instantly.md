---
baseline_commit: 8d990b4  # Story 22.17 (dev + code review) commitada -> baseline da 22.18
---

# Story 22.18: Robustez da camada de ativação/contas do Instantly — o retry precisa existir E ser seguro

Status: done

> **Agrupamento deliberado de 6 defers correlatos** (reviews da 22.12 e da 22.17 — 4 nomeados na proposta + os 2 do `addAccountsToCampaign` que a AC5 absorve). O argumento que justifica UMA story em vez de seis está em "Por que uma story só" abaixo, e ele é **mecânico, não estético**: hoje o retry da ativação é praticamente inalcançável pela UI *porque* o caminho de recuperação está quebrado. Consertar a recuperação sem tornar o activate idempotente transforma um risco raro em risco corriqueiro.

## Story

As a usuário do Agente TDEC,
I want que uma falha na ativação da campanha me seja comunicada e que eu consiga retomar de onde parou com um clique — sem risco de ativar (ou reiniciar) a mesma campanha duas vezes,
so that um erro na etapa mais cara e mais irreversível do fluxo não me deixe sem saída nem me faça reenviar e-mail para leads que já receberam.

## Por que uma story só (o argumento central, verificado em código)

São **três elos do mesmo loop**, não três bugs independentes:

1. **O usuário nunca fica sabendo que o activate falhou.** [client-utils.ts:18-21](../../src/lib/agent/client-utils.ts#L18) devolve a `Response` do `fetch` **sem checar `ok`**, e o `.catch(() => {})` do gate ([AgentActivationGate.tsx:103](../../src/components/agent/AgentActivationGate.tsx#L103), `:137`) só apanha rejeição de rede — `fetch` resolve normalmente em 4xx/5xx. Pior: 409 (`EXECUTION_NOT_ACTIVE`, [execute/route.ts:87](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L87)) e 422 (`API_KEY_NOT_FOUND`, `:105`) acontecem **antes** do orchestrator, então nem a bolha de erro do `sendErrorMessage` existe. O card exibe "✅ Campanha ativada" sobre um step 5 que nunca rodou.

2. **Não há caminho de volta.** Numa execução `paused` (step 4 `approved`, step 5 `failed`), o gate re-dispara `POST /steps/4/approve` → [409 em approve/route.ts:114-124](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L114) e **nunca chega** ao `execute` do step 5. O smoke da 22.12 só passou porque foi chamado o `execute` direto pela API.

3. **E se houvesse caminho de volta, ele seria perigoso.** [activate-step.ts:109](../../src/lib/agent/steps/activate-step.ts#L109) dispara `POST /activate` incondicionalmente, e o endpoint é literalmente "Activate (start), **or resume**".

**A prova de que (2) hoje protege (3) por acidente:** o `useAutoTrigger` **não** re-dispara um step 5 `failed` — `allDone` inclui `"failed"` ([use-auto-trigger.ts:61-64](../../src/hooks/use-auto-trigger.ts#L61)) e ainda há o guard `nextStep.status !== "pending"` (`:89`); além disso, em modo guiado `triggerAfterStatuses` é só `["skipped"]` (`:68-70`), então um step 4 `approved` também nunca auto-avança. O único caminho para um segundo `activateCampaign` hoje é chamada direta à API. **Consertar (2) sozinho torna o retry um clique** — e é exatamente aí que (3) deixa de ser teórico. Por isso os dois andam juntos.

A metade "contas" da story (AC5 + AC6) é o mesmo componente e o mesmo serviço: `AgentActivationGate` + `InstantlyService.addAccountsToCampaign`. Mantida junta por coesão de arquivo e de smoke.

## Acceptance Criteria

1. **[Falha da ativação vira sinal]** **Given** o gate de ativação **When** o `POST /steps/{n+1}/execute` disparado após o approve devolve um status não-2xx **Then** o card NÃO exibe "✅ Campanha ativada" **And** o `actionTaken` é revertido e o spinner para, deixando o usuário tentar de novo **And** o mesmo vale para "Ativar Depois".
   **Distinção obrigatória de duas classes de erro** (o `execute` não é homogêneo):
   - **Pré-orchestrator** — 409 `EXECUTION_NOT_ACTIVE` ([execute/route.ts:87](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L87)), 422 `API_KEY_NOT_FOUND` (`:105`), 500 `API_KEY_ERROR` (`:117`): **nada é escrito em `agent_messages`** → o gate DEVE renderizar a mensagem de erro, senão o usuário não vê nada.
   - **Pós-orchestrator** — 500/503 de `PipelineError` (`:143-158`): o `executeStep` **já** chamou `sendErrorMessage` ([orchestrator.ts:427-428](../../src/lib/agent/orchestrator.ts#L427)) e já marcou `paused`; a bolha de erro já está no chat. O gate reverte o estado mas **não** duplica a mensagem.
   *(Elo 1 — D1 deferida da review da 22.17. Padrão de referência: [AgentChat.tsx:437](../../src/components/agent/AgentChat.tsx#L437) `if (response.ok) return;`.)*

2. **[Retomar depois da falha — exige mudança no SERVIDOR]** **Given** uma execução `paused` com step 4 `approved` e step 5 `failed`/`pending` **When** o usuário aciona a ativação pelo gate **Then** o fluxo não trava no 409 do approve.
   **O discriminador NÃO existe hoje e criá-lo faz parte desta AC.** [approve/route.ts:114-124](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L114) devolve `code: "CONFLICT"` genérico para **todos** os status ≠ `awaiting_approval` (`approved`, `running`, `failed`, `completed`, `skipped`, `pending`), e o status atual vive **só dentro da string em PT-BR**. Um cliente que trate "todo `CONFLICT` = siga adiante" dispararia o `execute` por cima de um step 4 `running` — um double-execute concorrente, exatamente o perigo que a AC4 existe para conter.
   **Then** a rota de approve passa a devolver o status atual de forma **estruturada** (ex.: `error.currentStatus: "approved"`, ou um `code` próprio tipo `STEP_ALREADY_APPROVED`) **And** o gate segue adiante **somente** quando o status for exatamente `approved` **And** qualquer outro 409 — inclusive o `EXECUTION_NOT_ACTIVE` do `execute` — continua sendo erro visível **And** nenhum comportamento é derivado de match na mensagem em PT-BR.
   **And** a retomada **reusa a seleção de contas já persistida** no output do step 4 (no caminho "409 = siga adiante" o approve não roda, então `approvedData.selectedAccounts` não é remesclado — [approve/route.ts:141-158](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L141)); a copy do card deve dizer isso, para o usuário não achar que uma nova seleção foi aplicada.

3. **[Gate durável — e QUEM carimba, QUANDO]** **Given** uma ação do gate concluída **When** o usuário dá F5 ou a lista de mensagens remonta **Then** o card volta marcado e desabilitado, com marcação durável no `metadata` da mensagem de gate (padrão `rejected` da 22.13 — [reject/route.ts:150-184](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/reject/route.ts#L150): ler o gate mais recente do step, espalhar o JSONB, regravar; **fail-open**), zero migration.
   **Regra de quem carimba — sem ela a AC3 mata a AC2:**
   - `deferred` pode ser carimbado pelo **approve**, porque ali o approve *é* a ação completa.
   - `activated` só pode ser carimbado **depois** que o step de ativação chega a `completed` — nunca no approve, que retorna antes de o `execute` sequer disparar ([AgentActivationGate.tsx:91-103](../../src/components/agent/AgentActivationGate.tsx#L91)) e não tem como saber se a ativação deu certo.
   - **Given** uma ativação que FALHOU **Then** o card volta **re-armado** (botões ativos), **não** carimbado — caso contrário o bug da AC1 vira permanente e a retomada da AC2 fica inalcançável atrás de um card desabilitado.
   **And** o flag novo é declarado em `AgentMessageMetadata` ([types/agent.ts:88-100](../../src/types/agent.ts#L88)), ao lado de `rejected?: boolean` **And** o `ApprovalGateRenderer` repassa o flag ao `AgentActivationGate` como já faz para os outros três gates ([AgentMessageBubble.tsx:89](../../src/components/agent/AgentMessageBubble.tsx#L89) e o renderer em `:133-189`; o case `export` a alterar é `:177-185`) **And** o componente aplica o mesmo template client-side do [AgentApprovalGate.tsx:39-61](../../src/components/agent/AgentApprovalGate.tsx#L39) (`const actionTaken = durableFlag ? "..." : localActionTaken`).

4. **[Ativação idempotente do NOSSO lado]** **Given** o step de ativação prestes a chamar o Instantly **Then** duas guardas independentes, porque cobrem casos DIFERENTES:
   - **(4a) barata, sem rede:** se o output já gravado do próprio step traz `activated: true`, o `activateCampaign` é **pulado** e o step conclui com o output existente. O `StepInput` **não** carrega a própria linha ([orchestrator.ts:233-238](../../src/lib/agent/orchestrator.ts#L233) monta `{ executionId, briefing, previousStepOutput, mode }`), então o `ActivateStep` precisa de um `select("output")` explícito em `agent_steps` por `execution_id` + `step_number`. Isso é seguro: `updateStepStatus("running")` ([base-step.ts:260-276](../../src/lib/agent/steps/base-step.ts#L260)) **não** limpa o `output`.
   - **(4b) a que realmente importa — erro parcial:** o Instantly ativa e a resposta volta 502/timeout → `saveFailure` grava `output: { error }` ([base-step.ts:240-254](../../src/lib/agent/steps/base-step.ts#L240)), então o `activated: true` **nunca foi gravado** e (4a) não protege. **Precedente no próprio arquivo, a ser REUSADO e não reinventado:** `createCampaign` já trata isso com `GATEWAY_ERROR_CODES = {502,503,504}` + `GATEWAY_VERIFY_DELAY_MS` + verificação por leitura ([instantly.ts:63-64](../../src/lib/services/instantly.ts#L63) e `:255-269`). **Then** o dev DEVE avaliar as duas formas e registrar a escolha: (i) verificação **pós-erro-de-gateway** dentro do `activateCampaign` (grátis no caminho feliz, cobre exatamente o 502) ou (ii) pré-flight `getCampaignStatus` em toda ativação (1 GET a mais sempre). A verificação usa `getCampaignStatus` ([instantly.ts:508](../../src/lib/services/instantly.ts#L508)) e considera já-ativa quando o status for `Active (1)` ou `RunningSubsequences (4)` ([types/instantly.ts:11-20](../../src/types/instantly.ts#L11)).
   - **And** falha na leitura de status **não** bloqueia a ativação (fail-open: se não sabemos, seguimos o comportamento de hoje) — mas é logada.

5. **[Attach de contas: dedup e lost update]** **Given** `addAccountsToCampaign` ([instantly.ts:320-351](../../src/lib/services/instantly.ts#L320)) **Then**:
   - a deduplicação normaliza `trim` + case **apenas para COMPARAR**, preservando a grafia original do primeiro ocorrido no `email_list` enviado (não assumir que o Instantly é case-insensitive no e-mail da conta);
   - a verificação pós-escrita usa o **corpo da resposta do PATCH**, que hoje é descartado (`:344-348`) e já declara `email_list?: string[]` em `UpdateCampaignResponse` ([types/instantly.ts:169-174](../../src/types/instantly.ts#L169)); só cai para um GET extra se o corpo não trouxer o campo. **Assim o caminho feliz continua literalmente 1 GET + 1 PATCH.**
   - se alguma conta pedida não estiver no resultado, refazer o merge **uma vez**; se ainda faltar, **lançar `ExternalServiceError`** — silenciar seria devolver `{ success: true }` com a conta ausente, o exato fracasso silencioso que esta AC existe para matar.
   **And** a assimetria a jusante é preservada: na ativação REAL o erro **bloqueia** ([activate-step.ts:88-105](../../src/lib/agent/steps/activate-step.ts#L88) — 22.12/AC4), no ramo defer ele apenas liga `accountsAttachFailed` ([orchestrator.ts:262-268](../../src/lib/agent/orchestrator.ts#L262)).
   **Callers a revisar (3 em produção):** [activate-step.ts:89](../../src/lib/agent/steps/activate-step.ts#L89) (bloqueante), [orchestrator.ts:257](../../src/lib/agent/orchestrator.ts#L257) (ramo defer), [instantly/campaign/[id]/accounts/route.ts:59](../../src/app/api/instantly/campaign/[id]/accounts/route.ts#L59) (rota avulsa). Suítes: `instantly.test.ts:1094-1240`, `orchestrator.test.ts:1279-1440`, `activate-step.test.ts:348-390`, `app/api/instantly/campaign/accounts.test.ts`.

6. **[Zero contas de envio não é sucesso — cliente E servidor]** **Given** o gate com `data.accounts` vazio ou ausente **Then** "Ativar Campanha" fica **desabilitado** com explicação ("Nenhuma conta de envio configurada no Instantly — configure uma antes de ativar") **And** "Ativar Depois" continua habilitado (exportar sem ativar é legítimo).
   **And — guarda de servidor, obrigatória:** desabilitar o botão só fecha o caminho da UI, e as AC1/AC2 tornam o `execute` direto/retry MAIS comum, não menos. Hoje `selectedAccounts` vazio faz o attach ser pulado ([activate-step.ts:82-83](../../src/lib/agent/steps/activate-step.ts#L82)) e a execução fecha com "Pipeline concluido com sucesso!" ([orchestrator.ts:570](../../src/lib/agent/orchestrator.ts#L570)) sobre uma campanha sem remetente. **Then** o `ActivateStep` recusa ativar uma campanha cujo `email_list` esteja vazio, com erro claro. *Nota de implementação:* o `email_list` vem no GET cru (`GetCampaignResponse`, [types/instantly.ts:153-154](../../src/types/instantly.ts#L153)) mas o mapper `getCampaignStatus` **descarta** o campo ([instantly.ts:517-522](../../src/lib/services/instantly.ts#L517)) — estender o `CampaignStatusResult` é a forma barata de reaproveitar a mesma leitura da AC4b.

7. **[Contrato do `activateCampaign` — decisão default: REMOVER a rota]** [instantly.ts:476](../../src/lib/services/instantly.ts#L476) devolve `{ success: response.success }`, e `ActivateCampaignResponse` declara `{ success: boolean }` ([types/instantly.ts:139-141](../../src/types/instantly.ts#L139)) enquanto a API v2 responde o *Campaign object* — logo `success` é provavelmente `undefined`. A única superfície que repassa esse shape é [`/api/instantly/campaign/[id]/activate`](../../src/app/api/instantly/campaign/[id]/activate/route.ts), **órfã** (grep confirma: nenhum `fetch` para ela em `src/`; o `ActivateStep` ignora o retorno). **Then** a rota é removida **And** o teste que a importa — `__tests__/unit/api/instantly-campaign-activate.test.ts` (4+ testes, importa `POST` da rota em `:11`) — é removido junto, senão a AC9(f) não fecha **And** o tipo/retorno de `activateCampaign` é ajustado para não afirmar um `success` que a API não manda. *(Se o dev preferir manter a rota, precisa justificar por escrito e corrigir o tipo — mas o default é remover.)*

8. **[Preservação — inegociável]** **Then** o ramo defer da 22.12 ([orchestrator.ts:222-332](../../src/lib/agent/orchestrator.ts#L222)) não sofre **nenhuma edição textual** — note que seu *comportamento* muda de propósito via o serviço compartilhado da AC5, e isso é aceito **And** os CAS `.neq("status","cancelled")` da 22.10 não são removidos de nenhuma escrita **And** a conclusão da execução guiada da 22.17 (`requiresPostApproval()` + `ORCHESTRATOR_COMPLETION_FAILED` + guarda do `logStep`) continua funcionando **And** o autopilot é inalterado.
   **Verificação concreta (não "olhei e está ok"):** `git diff 8d990b4 -- src/lib/agent/orchestrator.ts` não pode conter hunk que toque `:222-332`, e os dois `.neq("status","cancelled")` devem sobreviver verbatim — mesmo método que provou a AC5 da 22.17.

9. **[Testes + smoke]** **Then** (a) RED provado para cada AC comportamental antes do fix; (b) teste de que o 409 com `currentStatus: "approved"` segue adiante e um 409 com qualquer outro status **não** segue; (c) teste de que `activateCampaign` **não** dispara quando a campanha já está `Active`, e **dispara** quando está `Draft`; (d) teste de que falha na leitura de status não bloqueia a ativação; (e) teste do guardrail invertido da AC5 (conta ainda ausente após o retry **lança**); (f) **smoke real barato** — ver "Estratégia de smoke"; (g) suíte cheia sem regressão e `eslint --max-warnings=0` limpo nos arquivos tocados.

## Tasks / Subtasks

- [x] **Task 1 — Elo 1: falha do execute vira sinal (AC1).** Checar `response.ok`; reverter `actionTaken`; parar spinner; renderizar erro **só** para os códigos pré-orchestrator. **Callers de `triggerNextStep` (4, já mapeados — não re-grepar):** [AgentLeadReview.tsx:177](../../src/components/agent/AgentLeadReview.tsx#L177), [AgentCampaignPreview.tsx:134](../../src/components/agent/AgentCampaignPreview.tsx#L134), [AgentApprovalGate.tsx:80](../../src/components/agent/AgentApprovalGate.tsx#L80), [AgentActivationGate.tsx:103](../../src/components/agent/AgentActivationGate.tsx#L103) e `:137`. Mudar a assinatura afeta os 4 — considerar tratar no gate.
- [x] **Task 2 — Discriminador estruturado no approve + retomada (AC2).** Servidor primeiro (`currentStatus` ou code próprio), cliente depois. Não usar match de string.
- [x] **Task 3 — Durabilidade do gate (AC3).** Flag em `AgentMessageMetadata`; carimbo de `activated` só após o step concluir; `deferred` pode ser no approve; falha ⇒ re-armado. Espelhar o fail-open da 22.13.
- [x] **Task 4 — Idempotência (AC4).** (4a) `select("output")` explícito no `ActivateStep`; (4b) escolher e JUSTIFICAR entre verificação pós-gateway-error (precedente do `createCampaign`) e pré-flight.
- [x] **Task 5 — Attach de contas (AC5).** Dedup normalizado só na comparação; verificação pelo corpo do PATCH; 1 retry; erro terminal se ainda faltar. Rodar as 4 suítes listadas.
- [x] **Task 6 — Zero contas: UI + guarda de servidor (AC6).**
- [x] **Task 7 — Remover a rota órfã + o teste dela; ajustar o tipo (AC7).**
- [x] **Task 8 — Verificação de preservação (AC8).** Rodar o `git diff` da AC8 e colar o resultado nas Completion Notes.
- [x] **Task 9 — Testes + smoke (AC9).**

### Review Findings

> **Code review BMAD 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo `full`, baseline `8d990b4` — 2026-07-27.** Nenhuma camada falhou. Verificações independentes do revisor: suíte cheia **402 arquivos / 7356 testes / 0 falhas / 2 skip** (alegação da AC9(g) confirmada); AC8 confirmada por comando (`git diff 8d990b4 -- orchestrator.ts` **vazio**, 4 CAS `.neq("status","cancelled")` verbatim); AC7 limpa (rota, teste e `ActivateResult` sem referência remanescente).

**Decisões necessárias (bloqueiam os patches):**

- [x] [Review][Decision] **O carimbo `deferred` no approve trava o card antes de o defer ter acontecido — viola o "Then" da própria AC3** — 3/3 camadas, HIGH. [approve/route.ts:280-287](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts#L280) escreve `activationOutcome: "deferred"` e retorna; só **depois** o cliente dispara o `execute`, e é o `execute` que faz o trabalho real do defer (attach de contas + skip do step 5 + conclusão da execução, [orchestrator.ts:241-336](../../src/lib/agent/orchestrator.ts#L241)). Se esse `execute` falhar (`ORCHESTRATOR_SKIP_FAILED` `:293`, `ORCHESTRATOR_COMPLETION_FAILED` `:314`, rede, 409), o gate re-arma **localmente** ([AgentActivationGate.tsx:170-176](../../src/components/agent/AgentActivationGate.tsx#L170)) mas o carimbo durável já está no banco — e o sinal durável vence o local (`:70-73`). No primeiro F5 (ou em 3 s, pelo polling de `use-agent-execution.ts:100`) o card volta "⏸️ Ativacao adiada" com os **dois botões desabilitados**, sobre um step 5 `pending` e uma execução nunca concluída. É exatamente o bug que a AC3 descreve ("falha ⇒ re-armado, nunca carimbado") e que o comentário da própria rota (`:272-279`) invoca para **não** carimbar `activated` — a mesma razão não foi aplicada ao `deferred`. **A bullet da AC3 que autoriza isso ("`deferred` pode ser carimbado pelo approve, porque ali o approve *é* a ação completa") é factualmente falsa**; o dev seguiu a letra da spec e quebrou o "Then" dela. **O conflito que exige decisão:** o lugar correto do carimbo é o ramo defer do orchestrator — que está **dentro da faixa `:222-332` declarada INTOCÁVEL pela AC8**. Opções: (a) liberar a exceção à AC8 e carimbar no ramo defer; (b) manter a AC8 e carimbar de um ponto pós-`execute` fora da faixa protegida; (c) aceitar o comportamento atual.
- [x] [Review][Decision] **A retomada da AC2 tornou alcançável um 2º `execute` concorrente sobre um step de ativação ainda `running`** — 2/3 camadas, HIGH. [AgentActivationGate.tsx:151-169](../../src/components/agent/AgentActivationGate.tsx#L151) segue adiante com `currentStatus === "approved"`, mas esse é o status do step **N** (o gate) — não diz nada sobre o step **N+1**, que é o que vai ser disparado. E ninguém valida o status do alvo: [execute/route.ts:87-97](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts#L87) só rejeita execução terminal e [orchestrator.ts:120-135](../../src/lib/agent/orchestrator.ts#L120) checa apenas a **existência** do step. Cenário: clique em "Ativar Campanha" → approve 200 → `execute/5` em voo (attach + GET + activate, dezenas de segundos) → F5 ou 2ª aba → card volta re-armado (o `activated` só é carimbado no fim) → 2º clique → 409 `STEP_ALREADY_APPROVED` → "retoma" → **2º `execute/5`**. As duas guardas da AC4 erram a janela: `readOwnOutput` ainda vê `output` sem `activated` (só é gravado na conclusão) e o pré-flight ainda pode ler `Draft`. Resultado: `POST /activate` disparado duas vezes num endpoint "activate **or resume**". **Antes deste diff o 409 era terminal e essa segunda chamada era impossível** — é regressão introduzida pela AC2. **Decisão:** (a) `execute` recusa quando o step alvo já está `running` (risco: um step deixado `running` por função morta fica irretomável); (b) CAS na transição para `running` + janela de staleness; (c) expor o status do step N+1 no 409 e o cliente recusa retomar.
- [x] [Review][Decision] **A verificação da AC5 pode ser tautológica — ela confia no eco do PATCH** — Blind, MEDIUM. [instantly.ts:445-457](../../src/lib/services/instantly.ts#L445) (`resolveEmailList`) devolve `patched.email_list` sempre que presente e só faz GET como fallback; `:398-408` verifica contra esse valor. Se o Instantly ecoar o **request body** (comportamento REST comuníssimo) em vez da linha persistida, `findMissingAccounts` devolve `[]` sempre, o retry de lost-update nunca dispara e o `ExternalServiceError` terminal de `:415-421` é código morto — o fracasso silencioso que a AC5 existe para matar sobrevive intacto. Os testes não decidem isso: eles *declaram* um eco diferente do request, que é exatamente a premissa sob suspeita. A própria story já registrou a lacuna ("Decisão do Fabossi se vale criar uma campanha descartável"). **Decisão:** (a) criar campanha descartável no Instantly e provar a semântica com 1 PATCH real; (b) trocar `resolveEmailList` para sempre reler por GET (o argumento de custo já foi concedido em `activate-step.ts:158-161`); (c) aceitar a lacuna documentada.

**Patches (fix não-ambíguo):**

- [x] [Review][Patch] `ALREADY_ACTIVE_STATUSES` cobre só `Active(1)` e `RunningSubsequences(4)` — `Paused(2)` e `Completed(3)` caem no `POST /activate` (= resume), re-enviando a sequência a quem já recebeu ou anulando uma pausa humana [src/lib/agent/steps/activate-step.ts:36-39]
- [x] [Review][Patch] `alreadyReported` é inferido de `stepType`, que também vem em `ORCHESTRATOR_INVALID_STEP` (`orchestrator.ts:110`, `:129`) e `ORCHESTRATOR_STEP_NOT_READY` (`:163`) — lançados FORA do `try` que chama `sendErrorMessage` (`:419-430`), e serializados com `stepType` em `execute/route.ts:151`. Resultado: falha 100% silenciosa, o defeito que a AC1 existe para matar [src/lib/agent/client-utils.ts:94]
- [x] [Review][Patch] O atalho da guarda 4a retorna antes do `stampLatestApprovalGate` e da mensagem de confirmação, e devolve `cost: { instantly_activate: 0 }` que **sobrescreve** o custo real já gravado (`base-step.ts:229`) — o card fica re-armado para sempre sobre uma campanha ativa [src/lib/agent/steps/activate-step.ts:90-98]
- [x] [Review][Patch] A guarda 4a não confronta `existingOutput.externalCampaignId` com o `externalCampaignId` do step anterior — se o export for reexecutado e criar campanha nova, o step reporta sucesso sobre a campanha **antiga** [src/lib/agent/steps/activate-step.ts:91]
- [x] [Review][Patch] `cost: { instantly_activate: 1 }` é devolvido incondicionalmente, inclusive no caminho `alreadyActive` em que o activate comprovadamente não disparou — incoerente com o `0` da guarda 4a [src/lib/agent/steps/activate-step.ts:232]
- [x] [Review][Patch] `await response.json()` no caminho de erro do approve não tem guarda: corpo não-JSON (HTML de gateway 502/504, corpo vazio) lança `SyntaxError`, escapa o `fallbackMessage` e renderiza `Unexpected token '<'...` no card. O mesmo parse está corretamente guardado em `client-utils.ts:79-83` [src/components/agent/AgentActivationGate.tsx:142]
- [x] [Review][Patch] `mergeEmailList` envia `raw` sem `trim` (`merged.push(raw)`) — `"  a@x.com  "` vai literal para o Instantly; e uma entrada vazia/whitespace é descartada pelo merge mas ainda **exigida** por `findMissingAccounts`, garantindo 2º PATCH + erro terminal com nome vazio. `findMissingAccounts` também não replica o guard `typeof !== "string"` do merge (`TypeError` em `selectedAccounts` não validado) [src/lib/services/instantly.ts:145-147, :154-172]
- [x] [Review][Patch] O `ExternalServiceError` terminal da AC5 usa `502`, que `BaseStep.isRetryableStatus` classifica como **retryable** (`base-step.ts:338`) → a UI oferece "tentar novamente" numa falha determinística (conta fora do workspace), queimando 2 PATCH + 2 GET por tentativa [src/lib/services/instantly.ts:415-421]
- [x] [Review][Patch] `resolveEmailList` faz um GET de verificação que **não** é fail-open: se ele falhar depois de um PATCH bem-sucedido, o erro vira "Não consegui anexar as contas de envio" e bloqueia a ativação de contas que **estão** anexadas — mensagem factualmente falsa (a direção de bloquear é segura; a mensagem não) [src/lib/services/instantly.ts:452-456]
- [x] [Review][Patch] `cannotActivate = !hasAccounts` trata `data.accounts` **ausente** igual a `[]`, enquanto o servidor distingue com cuidado `undefined` (não sabemos) de `[]` (comprovadamente sem remetente) em `instantly.ts:641`. Consequência: qualquer gate legado cujo `previewData` anteceda o campo `accounts` fica com "Ativar Campanha" permanentemente desabilitado, sem recurso além de adiar [src/components/agent/AgentActivationGate.tsx:85]
- [x] [Review][Patch] O aviso "usamos a seleção de contas salva" (`resumed`) só é setado no caminho de **sucesso**, depois de a campanha já estar ativa — o usuário remarca checkboxes, clica, e a campanha ativa com as contas antigas; o aviso chega tarde demais (e nunca chega se o `execute` falhar de novo) [src/components/agent/AgentActivationGate.tsx:178]

**Deferidos (reais, fora do escopo desta story):**

- [x] [Review][Defer] `reject/route.ts` mantém a cópia inline do carimbo que o `gate-metadata.ts` diz generalizar, e ambos fazem read-modify-write não-atômico do JSONB (um `rejected` e um `activationOutcome` concorrentes perdem um dos dois) [src/lib/agent/gate-metadata.ts:72-76, .../reject/route.ts:152-180] — deferido, pré-existente (22.13); o dev declarou explicitamente fora de escopo
- [x] [Review][Defer] `activationDeferred` só é **setado**, nunca limpo — se um step voltar a `awaiting_approval` (`reject/route.ts:189`) com a flag no output, um "Ativar Campanha" seguinte carimba `deferred`, publica `activationDeferred: true` no 409 e faz o orchestrator pular a ativação [approve/route.ts:170-172] — deferido, hoje inalcançável pela UI (o gate de ativação não tem botão de rejeitar)
- [x] [Review][Defer] `accountsAdded` devolve `accountEmails.length` (lista crua) depois de a dedup ter sido introduzida — `["a@x.com","A@X.COM"]` reporta 2 sobre 1 entrada escrita [src/lib/services/instantly.ts:423] — deferido, cosmético: os 3 callers em produção ignoram o retorno
- [x] [Review][Defer] A guarda de zero-remetente é avaliada **antes** de `alreadyActive`: uma campanha já `Active(1)` cujas contas foram desanexadas vira `STEP_EXECUTION_ERROR` não-retryable ("anexe uma conta antes de ativar") em vez de sucesso idempotente [src/lib/agent/steps/activate-step.ts:168-178] — deferido, exige decidir qual leitura é mais honesta (bloquear vs. sucesso sobre campanha inerte)

**Dispensados (2):** `console.error` no caminho feliz "já ativa" (`activate-step.ts:181`) — o ESLint do projeto proíbe `console.log` e não há logger estruturado, então não existe canal info disponível; e a "alegação não verificada" da suíte cheia — verificada pelo revisor, é verdadeira.

### Correções aplicadas na code review (2026-07-27)

**Decisões do Fabossi:** D1 → liberar exceção à AC8; D2 → CAS na transição para `running`; D3 → smoke com campanha descartável.

**⚠️ EXCEÇÃO AUTORIZADA À AC8 (registrada de propósito, para a próxima review não confundir com descumprimento).** A AC8 declara `orchestrator.ts:222-332` sem "nenhuma edição textual". O carimbo `deferred` foi movido para dentro dessa faixa — [orchestrator.ts](../../src/lib/agent/orchestrator.ts), ramo defer, logo após o insert do resumo e antes do `return`. **Por quê:** a bullet da AC3 que autorizava carimbar no approve é factualmente falsa (o trabalho do defer roda no `execute`, não no approve), e esse é o único ponto do fluxo em que "adiada" é verdade. **O que a exceção NÃO cobriu:** os 4 CAS `.neq("status","cancelled")` seguem verbatim, nenhuma linha pré-existente do ramo foi alterada (a mudança é puramente aditiva) e a assimetria bloqueante da 22.12/AC4 está intacta.

| # | Correção | Arquivo |
|---|---|---|
| D1 | Carimbo `deferred` movido do approve para o ramo defer do orchestrator; o approve não carimba mais **nenhum** desfecho | `orchestrator.ts`, `approve/route.ts` |
| D2 | CAS `.neq("status","running")` na entrada em `running` → `STEP_ALREADY_RUNNING` (409), sem pausar a execução de quem venceu a corrida | `base-step.ts`, `orchestrator.ts`, `execute/route.ts` |
| P1 | `DO_NOT_ACTIVATE_STATUSES` passou a incluir `Paused(2)` e `Completed(3)` — os dois estados em que "resume" é destrutivo | `activate-step.ts` |
| P2 | `reportedInChat` explícito (escrito **depois** da bolha) no lugar da inferência por `stepType` | `types/agent.ts`, `orchestrator.ts`, `execute/route.ts`, `client-utils.ts` |
| P3 | O atalho da guarda 4a agora carimba o gate e **preserva** o custo já gravado | `activate-step.ts` |
| P4 | A guarda 4a confronta `externalCampaignId` — `activated:true` de outra campanha não cala a atual | `activate-step.ts` |
| P5 | `instantly_activate: 0` quando o activate comprovadamente não disparou | `activate-step.ts` |
| P6 | `response.json()` guardado no caminho de erro do approve | `AgentActivationGate.tsx` |
| P7 | `trim()` no envio (caixa preservada) + os mesmos filtros nas duas pontas do dedup | `instantly.ts` |
| P8 | Erro terminal de conta ausente passou de 502 (retryable) para 422 | `instantly.ts` |
| P9 | Falha no GET de conferência deixou de virar a afirmação falsa "o Instantly não registrou as contas" | `instantly.ts` |
| P10 | `accounts` **ausente** (não sabemos) deixou de ser tratado como `[]` (sabemos que é zero) | `AgentActivationGate.tsx` |
| P11 | O aviso da seleção salva aparece na retomada, não só depois do sucesso | `AgentActivationGate.tsx` |

**Testes:** os 4 testes que falharam ao aplicar os patches eram exatamente os que **codificavam o comportamento corrigido** (a inferência por `stepType`, o custo zerado no atalho 4a, o carimbo no approve) — RED legítimo, reescritos. **20 testes novos**, incluindo 4 guardrails invertidos: (a) `ORCHESTRATOR_INVALID_STEP`/`STEP_NOT_READY` têm `stepType` mas **não** têm bolha → o gate PRECISA mostrar; (b) `Draft(0)` continua ativando (a guarda do P1 não engole a ativação legítima); (c) resposta sem array de linhas **não** inventa bloqueio no CAS (fail-open); (d) falha no carimbo do defer não derruba um defer bem-sucedido.

**Verificação:** suíte cheia **402 arquivos / 7376 testes / 0 falhas / 2 skip**; `eslint --max-warnings=0` limpo nos 12 arquivos de `src/` tocados; `tsc --noEmit` com **zero** erros em `src/`. *Ressalva honesta:* restam erros de `tsc` em arquivos de teste (`approve.test.ts`, `gate-metadata.test.ts` e outros) vindos do padrão de mock `.then = (resolve: ...)`; são **pré-existentes** — o mesmo padrão já aparece 8 vezes na versão do `approve.test.ts` em `HEAD`, antes desta story.

#### D3 — SMOKE REAL do PATCH (campanha descartável, executado 2026-07-27)

Campanha `TDEC-SMOKE-22.18-APAGAR` (`8d75b18c-…`) criada em rascunho com o **mesmo payload que a produção usa** (`buildDefaultSchedule()` verbatim), usada para o experimento e **apagada no fim** — `DELETE → 200`, `GET de conferência → 404`. 🚫 A campanha viva `f67e06fc` **não foi tocada** (o script tem um guard que aborta se o id aparecer na URL); nenhum `POST /activate` em lugar nenhum.

```
[0] GET  /accounts                      -> 200   1a conta: mfabossi@tdecnetworks.com
[1] PATCH /campaigns/{id} email_list=[conta real]  -> 200
    corpo do PATCH -> email_list = ["mfabossi@tdecnetworks.com"]
[2] GET   /campaigns/{id}               -> email_list = ["mfabossi@tdecnetworks.com"]
[3] PATCH email_list=["MFABOSSI@TDECNETWORKS.COM"]  -> 400
    GET  de conferencia -> email_list = ["mfabossi@tdecnetworks.com"]  (inalterado)
[-] PATCH email_list=["tdec-smoke-nao-existe@example.invalid"] -> 400
```

**O que isso PROVA contra a API real:**

1. **A verificação da AC5 NÃO é tautológica** (a suspeita que abriu a D3). O corpo do PATCH traz `email_list` **e ele é igual ao estado persistido** lido pelo GET seguinte — não é eco do request. Logo `resolveEmailList` preferir o corpo do PATCH é legítimo, o retry de lost-update é alcançável e o erro terminal não é código morto. **E o "1 GET + 1 PATCH" do caminho feliz, que a story afirmava sem prova, é verdade.**
2. **O Instantly é case-SENSITIVE no e-mail da conta** — a MESMA conta em caixa alta é recusada com **400**, e o `email_list` persistido fica intacto. Isso **fecha empiricamente a incógnita que a 22.12 se recusou a chutar** e valida a decisão da AC5 de normalizar caixa *só para comparar*: baixar o payload para `toLowerCase()` teria quebrado toda ativação cuja conta tem maiúscula. O `mergeEmailList` preserva a grafia do primeiro ocorrido (o existente, vindo do próprio Instantly), então na prática manda sempre a grafia canônica.
3. **Conta inexistente é recusada com 400, não silenciosamente descartada.** O modo de falha real do "conta ausente" é uma exceção do PATCH, não um `email_list` que volta sem ela — ou seja, o guardrail da AC5 é a segunda linha de defesa, não a primeira. Isso reforça o P8: 422 (não-retryable) é a classificação certa, porque a causa é determinística.

**O que o smoke ainda NÃO prova:** o fluxo de retomada ponta a ponta pela UI (falhar o `execute`, ver o card re-armado, clicar de novo e retomar) continua coberto só por teste de unidade nas duas pontas — exige uma execução nova com falha induzida no app.

## Dev Notes

### Estado atual dos arquivos (lidos na create-story e reconferidos na validação — preservar o que não é o bug)

- **[AgentActivationGate.tsx](../../src/components/agent/AgentActivationGate.tsx):** props = `data, executionId, stepNumber, totalSteps, onAction` (`:28-34`) — **nenhum estado durável entra hoje**; a AC3 muda isso. `loading`/`actionTaken`/`error`/`selectedAccounts` locais (`:45-48`); `isDisabled = loading !== null || actionTaken !== null` (`:50`). A 22.17 acrescentou `setLoading(null)` no sucesso (`:99`, `:134`) — **manter**. `hasAccounts` (`:51`) e `noAccountSelected` (`:52`) são a raiz da AC6: com zero contas ambos são falsy e `disabled={isDisabled || noAccountSelected}` deixa "Ativar Campanha" **habilitado**.
- **O gate não enxerga o estado dos steps.** `useAgentStore` expõe `totalSteps` e **não** um array `steps`; o `AgentMessageBubble` só lê `totalSteps` (`:62`). Ou seja, "está paused com step 5 failed" **não é decidível no cliente hoje** — por isso a AC2 resolve pelo 409 estruturado e a AC3 pelo flag durável, e não por leitura de estado. Não invente um terceiro mecanismo.
- **[client-utils.ts](../../src/lib/agent/client-utils.ts):** 22 linhas; `triggerNextStep` retorna `Promise<Response | null>` sem checar `ok`; guard `currentStepNumber >= totalSteps → null` (`:15`).
- **[approve/route.ts](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts):** dois 409 diferentes — `EXECUTION_NOT_ACTIVE` (`:81-91`) e o `CONFLICT` genérico de status de step (`:114-124`). Merge de `approvedData` em `:141-158`. Completa a execução só quando `isLastStep` (`:188`) com CAS (`:206`); o gate atua no step 4 de 5 → **não** passa por esse bloco. Supressão do resumo para `activate` em `:236`.
- **[execute/route.ts](../../src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts):** 409 `EXECUTION_NOT_ACTIVE` (`:87`), 422 (`:105`), 500 (`:117`) — nenhum escreve em `agent_messages`. `PipelineError` em `:143-158` — esse **já** tem bolha. `paused` não é terminal, de propósito (`:85-86`).
- **[activate-step.ts](../../src/lib/agent/steps/activate-step.ts):** valida `previousStepOutput` (`:49-62`), mensagem `progress` (`:65`), chave (`:76`), attach bloqueante (`:88-105` — 22.12/AC4, intocável), `activateCampaign` (`:109`), mensagem de sucesso com a pluralização da 22.17 (`:118-126`), `activated: true` (`:132`). `requiresPostApproval() → false` (`:41-43`).
- **[instantly.ts](../../src/lib/services/instantly.ts):** `addAccountsToCampaign` `:320-351`; `activateCampaign` `:466-477` (o `{ success }` em `:476`); `getCampaignStatus` `:508-523` (descarta `email_list`); labels `:70-79`; **precedente de verificação pós-gateway** `:63-64` + `:255-269`.
- **[base-step.ts](../../src/lib/agent/steps/base-step.ts):** `saveFailure` grava `output: { error }` (`:240-254`) — é isso que apaga o `activated: true`; `updateStepStatus` **não** limpa `output` (`:260-276`).
- **[use-auto-trigger.ts](../../src/hooks/use-auto-trigger.ts):** `hasRunning` (`:57`), `allDone` incluindo `"failed"` (`:61-64`), guiado só auto-avança após `skipped` (`:68-70`), `nextStep.status !== "pending"` (`:89`).
- **[orchestrator.ts](../../src/lib/agent/orchestrator.ts):** fetch da execução `:100-118`; **existência do step** `:128-135` (nunca valida `stepRecord.status`); input montado `:233-238`; ramo defer `:222-332` **INTOCÁVEL**; conclusão da 22.17 `:373-413`. Detalhe útil para o retry: `.in("status", ["completed","approved"])` (`:143-151`) faz o step 5 achar o input do step 4 `approved`, e a escrita de conclusão move `paused → completed` — ou seja, **o backend já suporta o retry**; o que falta é o caminho pela UI.

### Decisões de design tomadas (racional)

- **Duas guardas de idempotência, não uma.** O `deferred-work.md` oferecia `activated: true` **ou** `getCampaignStatus` como alternativas. São coisas diferentes: no cenário que importa (erro parcial), o output do step é `{ error }` — o `activated: true` nunca foi gravado —, então só a leitura de status protege.
- **Dedup normaliza para comparar, não para enviar.** Baixar tudo para `toLowerCase()` no payload seria apostar que o Instantly é case-insensitive no e-mail da conta — aposta que o defer da 22.12 explicitamente recusou fazer sem confirmar.
- **Zero contas bloqueia ATIVAR, não EXPORTAR.** Adiar a ativação com zero contas é legítimo. Ativar sem remetente nunca é — e a guarda tem que estar no servidor, porque a UI não é a única porta.
- **O 409 é resolvido no servidor.** Fazer o cliente inferir causa a partir de texto em PT-BR acopla o gate à copy da rota e quebra em silêncio na primeira reescrita de mensagem.

### Estratégia de smoke (leia antes de prometer qualquer coisa)

- **Lição da 22.17 — fixture externa apodrece.** O smoke previsto na AC6d da 22.17 morreu: a campanha `5d059a98-…` tinha sido **apagada do Instantly** (404). **Verificar que o recurso externo ainda existe ANTES de planejar o smoke em cima dele.**
- **Caminho barato provado:** fluxo novo com **import de leads próprios** pula os steps 1-2 (zero busca paga) — custou R$ 4,20 na 22.17. Usar `fabotse@gmail.com` como lead, nunca um terceiro.
- **Fixture ideal para a AC4b:** a campanha `f67e06fc-47be-43ec-abd8-b0cc7ef843c2` ficou **ATIVA** desde o smoke da 22.17. `getCampaignStatus` nela deve devolver `Active (1)` e prova a guarda de graça — sem custo e sem mudar estado (é um `GET`). **Decisão do Fabossi em 2026-07-26: manter a campanha ATIVA justamente para servir de fixture desta story** — ela não é resíduo esquecido, é material de teste deliberado (os 5 e-mails vão para a caixa do próprio Fabossi). **Ainda assim, confirmar o estado dela antes de planejar o smoke em cima** — a lição da fixture apagada continua valendo.
- 🚫 **NUNCA chamar `POST /activate` na `f67e06fc`.** Ela já tem uma sequência de 5 e-mails pendente para `fabotse@gmail.com` (~19 dias) e o endpoint é "activate **or resume**" — um resume pode reiniciar a sequência. Leitura (`getCampaignStatus`) é o único uso autorizado. Qualquer alteração de estado nessa campanha é decisão do Fabossi.
- **Mock não prova contrato externo.** Onde a story depende do Instantly (status do GET, semântica do PATCH `email_list`, corpo da resposta do PATCH), cubra por smoke.

### Traps

- **Trap #1 — `triggerNextStep` tem 4 callers** (listados na Task 1). Mudar a assinatura afeta todos.
- **Trap #2 — existem DOIS 409 diferentes**, e mais um no `execute`. `approve:114` = step não está `awaiting_approval`; `approve:81` e `execute:87` = execução terminal. A AC2 fala **só** do primeiro. Não conflacionar.
- **Trap #3 — `paused` não é terminal de propósito.** Não "consertar" isso: seria matar o caminho que a AC2 constrói.
- **Trap #4 — carimbo otimista mata a retomada.** Ver a regra de quem-carimba-quando na AC3. Falha ⇒ re-armado, nunca carimbado.
- **Trap #5 — o bloqueio de attach da 22.12/AC4 é intencional.** Na ativação REAL, falha de attach **deve** bloquear. Não relaxar ao mexer no `addAccountsToCampaign`.
- **Trap #6 — a AC5 mexe num serviço com 3 callers**, um deles dentro do ramo declarado intocável. "Intocável" = sem edição textual; a mudança de comportamento via serviço é aceita e precisa passar nas suítes daquele ramo.
- **Trap #7 — custo.** Se a escolha da AC4b for pré-flight, é 1 GET a mais por ativação. Registrar em `docs/custos-operacao.md` se a contagem de chamadas ao Instantly for material ([[feedback-cost-model-accuracy]]).

### Previous story intelligence (22.17 — commit `8d990b4`, mesma sessão)

- **A code review da 22.17 é a origem de metade desta story.** D1 (elo 1), gate não durável e contas zero já estão verificados com file:line em [deferred-work.md](deferred-work.md).
- **Padrão de mock do orchestrator:** `createChainBuilder` + `mockSupabase.from.mockImplementation`; para distinguir chamadas à MESMA tabela em momentos diferentes, usar contador (ver o teste de `ORCHESTRATOR_COMPLETION_FAILED` da review da 22.17, que separa fetch / completion / paused).
- **Todo patch comportamental precisa de teste**, incluindo o **guardrail invertido** (provar que a guarda nova não engole a falha que importa) — padrão adotado na guarda do `logStep`.
- **Pre-commit:** `eslint --max-warnings=0` no arquivo inteiro; `console.error` permitido, `console.log` não.
- **Story pós-planejamento**, como as 22.12–22.17 — não consta em [epic-22-agente-tdec-2.0.md](../planning-artifacts/epic-22-agente-tdec-2.0.md), que lista até a 22.11. Origem: reviews adversariais + smokes reais.

### References

- [Source: src/lib/agent/client-utils.ts#L15-L21] — `triggerNextStep` sem checagem de `ok` (elo 1)
- [Source: src/components/agent/AgentActivationGate.tsx#L28-L52] — props sem estado durável; `hasAccounts`/`noAccountSelected`
- [Source: src/components/agent/AgentApprovalGate.tsx#L39-L61] — template client-side do flag durável (copiar)
- [Source: src/components/agent/AgentMessageBubble.tsx#L89] — pass-down do flag; renderer em `:133-189`, case `export` em `:177-185`
- [Source: src/types/agent.ts#L88-L100] — `AgentMessageMetadata` (onde `rejected` vive e o flag novo entra)
- [Source: .../approve/route.ts#L81-L91, #L114-L124, #L141-L158] — os dois 409 e o merge de `approvedData`
- [Source: .../execute/route.ts#L87-L127, #L143-L158] — erros pré vs. pós-orchestrator
- [Source: .../reject/route.ts#L150-L184] — padrão de carimbo durável (com fail-open)
- [Source: src/lib/agent/steps/activate-step.ts#L82-L112] — attach pulado com contas vazias; activate incondicional
- [Source: src/lib/agent/steps/base-step.ts#L240-L276] — `saveFailure` apaga o output; `running` preserva
- [Source: src/lib/services/instantly.ts#L63-L64, #L255-L269] — precedente de verificação pós-gateway (reusar)
- [Source: src/lib/services/instantly.ts#L320-L351, #L466-L477, #L508-L523] — attach, activate, status
- [Source: src/types/instantly.ts#L11-L20, #L139-L141, #L153-L154, #L169-L174] — enum de status, `ActivateCampaignResponse`, `email_list` no GET e no PATCH
- [Source: src/hooks/use-auto-trigger.ts#L57-L89] — guards que hoje impedem o retry automático
- [Source: _bmad-output/implementation-artifacts/22-17-conclusao-da-execucao-guiada.md] — story anterior + a review que originou D1/contas zero/gate não durável
- Doc oficial: `https://developer.instantly.ai/api-reference/campaign/activatestart-or-resume-a-campaign` — documenta 200/400/401/402/404/429 e **não** cobre campanha já ativa

## Dev Agent Record

### Implementation Plan

Ciclo red-green-refactor por task, na ordem das Tasks. Cada AC comportamental teve teste RED provado antes do fix (saídas coladas no Debug Log abaixo).

1. **AC1** — função NOVA `triggerNextStepChecked` em `client-utils.ts` em vez de mudar a assinatura de `triggerNextStep` (Trap #1: 4 callers). Só o gate de ativação verifica.
2. **AC2** — servidor primeiro (`currentStatus` + `STEP_ALREADY_APPROVED` + `activationDeferred`), cliente depois.
3. **AC3** — helper compartilhado `stampLatestApprovalGate` (generaliza o padrão inline da 22.13), com dois chamadores distintos e filtros distintos.
4. **AC4/AC6** — uma única leitura (`getCampaignStatus` estendido) alimenta as duas guardas no `ActivateStep`.
5. **AC5** — dedup normalizado + verificação pelo corpo do PATCH + 1 retry + erro terminal.
6. **AC7** — remoção da rota órfã, do teste dela e do tipo `ActivateResult`.

### Debug Log / decisões durante o dev

**RED provado (AC9a).** Saída dos ciclos, na ordem:

| AC | RED | GREEN |
|---|---|---|
| AC1 (gate) | `5 failed \| 20 passed` | `25 passed` |
| AC1 (`triggerNextStepChecked`) | função inexistente | `10 passed` |
| AC2 (approve/servidor) | `8 failed \| 19 passed` | `27 passed` |
| AC2 (gate/cliente) | `3 failed \| 33 passed` | `36 passed` |
| AC3 (gate durável) | `3 failed \| 37 passed` | `40 passed` |
| AC3 (carimbos) | `2 failed \| 50 passed` | `52 passed` |
| AC4 + AC6 (servidor) | `6 failed \| 27 passed` | `33 passed` |
| AC6 (UI) | `3 failed \| 42 passed` | `45 passed` |
| AC5 (attach) | `6 failed \| 86 passed` | `92 passed` |

**Decisão AC4b — PRÉ-FLIGHT (opção ii), não verificação pós-erro-de-gateway (opção i).**
O argumento de custo que favorecia (i) — "o pré-flight é 1 GET a mais sempre" — **não se aplica aqui**, porque a AC6 exige um GET da campanha de qualquer forma (é de lá que sai o `email_list`). Com o GET já pago, (ii) domina: só ela cobre a campanha que ficou ativa numa tentativa ANTERIOR (o cenário de erro parcial em que o `saveFailure` sobrescreveu o `output` com `{ error }` e o `activated: true` nunca foi gravado). A opção (i) protegeria apenas o 502 da chamada corrente. Uma leitura, duas guardas.
*Custo:* o Instantly é plano fixo (não é por chamada) — nada a registrar em `docs/custos-operacao.md` (Trap #7 não dispara).

**Decisão AC1 — como distinguir pré de pós-orchestrator sem enumerar códigos.** A detecção é POSITIVA: só é tratado como "já reportado no chat" o payload que carrega a forma de `PipelineError` (`error.stepType` presente — sempre presente em `:143-158` e nunca nos erros pré-orchestrator). O default é MOSTRAR: falhar visível é melhor que falhar silencioso, que é o bug que a AC1 existe para matar.

**Decisão AC2 — o discriminador precisou de um segundo campo (`activationDeferred`).** Só `currentStatus === "approved"` não bastava: com o card re-armado depois de uma falha, nada impedia o usuário de clicar o *outro* botão. Retomar com o botão errado dispararia o caminho já persistido — no sentido perigoso, **ativaria de verdade uma campanha que ele mandou adiar**. O 409 passa a expor a intenção persistida (lida de `stepRecord.output.activationDeferred`, que já vinha no `select`) e o gate só retoma quando o botão clicado casa com ela; caso contrário explica qual botão usar. Continua tudo estruturado — zero match em PT-BR.

**AC3 — o helper é novo, o reject da 22.13 não foi mexido.** `stampLatestApprovalGate` generaliza o padrão, com filtro opcional por `stepNumber` (approve, que sabe o número) ou por `stepType` em JS (ActivateStep, que é o step SEGUINTE ao do gate e não sabe o número). O filtro por tipo é feito em JS de propósito — não depender de path JSON aninhado no PostgREST. O `reject/route.ts` ficou com o código inline dele: refatorá-lo não é escopo desta story.

**AC5 — `accountsAdded` mantido como `accountEmails.length`.** Quando a função retorna com sucesso, todas as contas pedidas estão comprovadamente presentes (senão teria lançado), então o valor não mente mais do que antes — e o contrato público não muda.

### Completion Notes

**AC1 ✅** `triggerNextStepChecked` (novo) classifica o resultado do `execute`; o gate reverte estado, para o spinner e renderiza a mensagem **só** quando o erro é pré-orchestrator. Vale para os dois botões. `triggerNextStep` ficou intacto — os outros 3 callers não foram tocados (Trap #1).

**AC2 ✅** O 409 de status de step agora devolve `{ code: "STEP_ALREADY_APPROVED" | "CONFLICT", currentStatus, activationDeferred }`. O gate segue adiante **somente** com `currentStatus === "approved"` **e** intenção casada; `running`/`failed`/`completed`/`skipped`/`pending` e o `EXECUTION_NOT_ACTIVE` (que não tem `currentStatus`) continuam erro visível. Copy do card avisa que a seleção de contas usada é a já salva.

**AC3 ✅** `activationOutcome?: "activated" | "deferred"` em `AgentMessageMetadata` (JSONB, zero migration), repassado pelo `ApprovalGateRenderer` no case `export`, aplicado no componente com o mesmo template do `AgentApprovalGate` (durável vence local). `deferred` carimbado no approve; `activated` carimbado no `ActivateStep` **depois** de a campanha ficar ativa. Ativação que falha **não** carimba — provado por teste. Fail-open nos dois carimbos.

**AC4 ✅** (4a) `readOwnOutput` faz o `select("output")` explícito do próprio step (o `StepInput` não carrega a própria linha) e conclui com o output existente, custo `instantly_activate: 0`. (4b) pré-flight `getCampaignStatus`; `Active(1)`/`RunningSubsequences(4)` ⇒ activate **não** dispara. Falha na leitura ⇒ fail-open + `console.error`.

**AC5 ✅** Dedup normaliza `trim`+caixa **só para comparar** e envia a grafia original do primeiro ocorrido. Verificação pós-escrita usa o corpo do PATCH (caminho feliz segue **1 GET + 1 PATCH** — provado por teste que conta as chamadas); GET extra só quando o corpo não traz `email_list`. Conta ausente ⇒ 1 retry ⇒ ainda ausente ⇒ `ExternalServiceError` nomeando a conta. Assimetria a jusante preservada: ativação real bloqueia (22.12/AC4), ramo defer só liga `accountsAttachFailed` — as 4 suítes listadas passam sem edição de comportamento.

**AC6 ✅** Cliente: "Ativar Campanha" desabilitado com explicação quando não há conta; "Ativar Depois" segue habilitado. Servidor: `ActivateStep` recusa ativar com `email_list` vazio (`undefined` — campo ausente — **não** bloqueia; só `[]` bloqueia). O `getCampaignStatus` passou a expor `emailList`, reaproveitando a leitura da AC4b.

**AC7 ✅** Rota órfã `POST /api/instantly/campaign/[id]/activate` **removida** junto com `__tests__/unit/api/instantly-campaign-activate.test.ts`. `activateCampaign` agora é `Promise<void>` (erro = exceção); `ActivateResult` deletado e `ActivateCampaignResponse` passou a descrever o *Campaign object* real (campos opcionais).

**AC8 ✅ — verificação concreta, não "olhei e está ok":**
```
$ git diff 8d990b4 -- src/lib/agent/orchestrator.ts
(saída VAZIA — o arquivo inteiro está intocado, logo o ramo defer :222-332 também)

$ grep -rn 'neq("status", "cancelled")' src/lib/agent/orchestrator.ts .../approve/route.ts
src/lib/agent/orchestrator.ts:311   src/lib/agent/orchestrator.ts:388
src/lib/agent/orchestrator.ts:490   .../approve/route.ts:225
(os CAS da 22.10 sobrevivem verbatim)

$ grep -n "requiresPostApproval|ORCHESTRATOR_COMPLETION_FAILED" ...
orchestrator.ts:315, :371, :392 · base-step.ts:53, :104 · activate-step.ts:58
(a conclusão da execução guiada da 22.17 continua de pé)
```
**Nota honesta sobre "o autopilot é inalterado":** nenhum código específico de autopilot foi tocado, mas o `ActivateStep` é compartilhado — as guardas novas (AC4/AC6) valem para os dois modos, **de propósito** (é a mesma natureza da mudança-via-serviço que a AC8 já aceita para o ramo defer). No autopilot o `ExportStep` cria a campanha com `email_list` cheio (`export-step.ts:154`) e já falha antes se o Instantly não tem nenhuma conta (`:140-142`), então a guarda da AC6 não fecha nenhum caminho que funcionava.

**AC9 ✅** (a) RED provado por AC — tabela no Debug Log. (b)(c)(d)(e) testes específicos escritos, incluindo o **guardrail invertido** da AC5 (conta ainda ausente após o retry **lança**) e o inverso da AC6 (leitura indisponível **não** inventa bloqueio). (g) **suíte cheia: 402 arquivos, 7356 testes passando, 0 falhando**; `eslint --max-warnings=0` limpo em todos os 10 arquivos de src + 7 de teste tocados; `tsc --noEmit` sem nenhum erro em `src/` (os erros restantes são pré-existentes em `__tests__/helpers/*` e nos tipos gerados em `.next/`, que somem no próximo build).

**(f) SMOKE REAL — leitura pura, autorizada pela story (executado 2026-07-27):**
```
GET /api/v2/campaigns/f67e06fc-47be-43ec-abd8-b0cc7ef843c2
{ "id": "f67e06fc-...", "name": "Campanha - campanha de teste",
  "status": 1, "statusLabel": "Ativa",
  "hasEmailListField": true, "emailListType": "array", "emailListLength": 1 }
GET /api/v2/campaigns/98b5ae57-... (fixture da 22.12) -> HTTP 404
```
O que isso **prova** contra a API real: (1) a fixture viva está **Ativa (status 1)** — exatamente o estado em que a guarda da AC4b impede o `POST /activate`, ou seja, o cenário perigoso é real e a guarda o cobre; (2) o GET da campanha **traz `email_list` como array**, então o `emailList` que a AC6 extrai da mesma leitura existe no payload real (não é suposição de tipo). E confirma de novo a lição de fixture externa: a campanha da 22.12 já foi apagada (404).

🚫 Nenhum `POST /activate` e nenhum `PATCH` foi disparado na `f67e06fc` — só `GET`, como a story autoriza.

**O que o smoke NÃO prova (transparência, não desculpa):**
- **O corpo do PATCH traz `email_list`?** Não verificado contra a API real: provar isso exige um `PATCH`, proibido na campanha viva e sem outra campanha descartável disponível. O código está correto sob **ambas** as semânticas (se o corpo não trouxer o campo, cai para um GET de verificação) — o que fica sem prova é apenas qual dos dois ramos roda em produção. Se o corpo não trouxer, o caminho feliz custa 2 GET + 1 PATCH em vez de 1 GET + 1 PATCH. **Decisão do Fabossi** se vale criar uma campanha descartável no Instantly para fechar esse ponto.
- **O fluxo de retomada pela UI** (falhar o `execute`, ver o card re-armado, clicar de novo e retomar) não foi rodado ponta a ponta no app — exige uma execução nova com falha induzida. Coberto por testes de unidade nas duas pontas (rota + componente).

### File List

**Fonte (novos):**
- `src/lib/agent/gate-metadata.ts`

**Fonte (modificados):**
- `src/lib/agent/client-utils.ts`
- `src/lib/agent/steps/activate-step.ts`
- `src/lib/services/instantly.ts`
- `src/types/agent.ts`
- `src/types/instantly.ts`
- `src/components/agent/AgentActivationGate.tsx`
- `src/components/agent/AgentMessageBubble.tsx`
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/approve/route.ts`

**Fonte (modificados na code review):**
- `src/lib/agent/orchestrator.ts` *(D1 — exceção autorizada à AC8 — e P2)*
- `src/lib/agent/steps/base-step.ts` *(D2 — CAS de posse do step)*
- `src/app/api/agent/executions/[executionId]/steps/[stepNumber]/execute/route.ts` *(D2 + P2)*

**Fonte (removidos):**
- `src/app/api/instantly/campaign/[id]/activate/route.ts` *(rota órfã — AC7)*

**Testes (novos):**
- `__tests__/unit/lib/agent/gate-metadata.test.ts`

**Testes (modificados):**
- `__tests__/unit/lib/agent/client-utils.test.ts`
- `__tests__/unit/lib/agent/steps/activate-step.test.ts`
- `__tests__/unit/lib/services/instantly.test.ts`
- `__tests__/unit/types/instantly.test.ts`
- `__tests__/unit/components/agent/AgentActivationGate.test.tsx`
- `__tests__/unit/components/agent/AgentMessageBubble.test.tsx`
- `__tests__/unit/app/api/agent/executions/steps/approve.test.ts`

**Testes (modificados na code review):**
- `__tests__/unit/lib/agent/steps/base-step.test.ts` *(CAS do D2 + guardrail invertido)*
- `__tests__/unit/lib/agent/orchestrator.test.ts` *(carimbo `deferred` do D1 + fail-open)*

**Testes (removidos):**
- `__tests__/unit/api/instantly-campaign-activate.test.ts` *(testava a rota removida — AC7)*

**Tracking:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/22-18-robustez-da-camada-de-ativacao-instantly.md`

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-27 | **Code review BMAD 3 camadas (Blind/Edge/Auditor, `full`, baseline `8d990b4`) — 13 patches aplicados, story → `done`.** Nenhuma camada falhou; o revisor verificou por conta própria a suíte cheia (a alegação de 7356 testes era verdadeira), a AC8 por comando e a limpeza da AC7. **3 HIGH, todos com a mesma raiz:** duas guardas novas assumiam que o `approve` sabe o que só o `execute` sabe. (D1) O carimbo `deferred` no approve travava o card ANTES de o defer acontecer — a bullet da AC3 que autorizava isso é **factualmente falsa** (attach + skip + conclusão vivem em `orchestrator.ts:241-336`, alcançável só pelo `execute`); um "Ativar Depois" que falhasse voltava do F5 desabilitado, com a retomada da AC2 inalcançável: o bug da AC1, movido para o outro botão. Corrigido com **exceção à AC8 autorizada pelo Fabossi** (mudança puramente aditiva; os 4 CAS e o bloqueio da 22.12/AC4 intactos). (D2) A retomada da AC2 tornou alcançável um 2º `execute` concorrente sobre um step de ativação ainda `running` — `currentStatus` fala do step do GATE, não do step disparado, e nem a rota nem o orchestrator olhavam o status do alvo; as duas guardas da AC4 erram a janela. Fechado com **CAS `.neq("status","running")`** → `STEP_ALREADY_RUNNING` (409) sem pausar a execução de quem venceu. (P1) `Paused(2)` e `Completed(3)` caíam no `POST /activate` — os dois estados em que "resume" é destrutivo. **P2:** a inferência "tem `stepType` logo já tem bolha" era falsa para `ORCHESTRATOR_INVALID_STEP`/`STEP_NOT_READY` (lançados fora do catch que escreve a bolha) → falha 100% silenciosa; trocada por `reportedInChat`, um fato escrito depois da bolha. Mais 8 patches (custo, campanhaId no atalho 4a, `response.json()` guardado, trim no payload, 422 no erro terminal, GET de conferência com mensagem honesta, `accounts` ausente ≠ `[]`, aviso da seleção salva na hora certa). **20 testes novos + 4 reescritos** (os 4 que falharam codificavam o comportamento corrigido — RED legítimo), com 4 guardrails invertidos. Suíte **402 arq / 7376 testes / 0 falhas**; lint limpo; `tsc` zero em `src/`. **SMOKE REAL da D3 em campanha descartável (criada e apagada; a `f67e06fc` intocada):** o corpo do PATCH **é** o estado persistido — a verificação da AC5 não é tautológica e o "1 GET + 1 PATCH" é verdade; e o Instantly é **case-sensitive** no e-mail da conta (mesma conta em caixa alta → 400), o que **fecha a incógnita aberta pela 22.12** e valida a decisão de normalizar caixa só para comparar. 4 defers documentados em `deferred-work.md`. |
| 2026-07-27 | **Dev-story concluída (Opus 5) — AC1–AC9 implementadas, story → `review`.** 9 tasks, todas com RED provado antes do fix (tabela no Debug Log). Decisão registrada da AC4b: **pré-flight** `getCampaignStatus`, porque a AC6 já obriga a ler a campanha — uma leitura, duas guardas — e só o pré-flight cobre a campanha que ficou ativa numa tentativa anterior (o cenário de erro parcial). Ampliação de escopo mínima e justificada na AC2: o 409 estruturado precisou expor também a **intenção persistida** (`activationDeferred`), senão o card re-armado permitia retomar pelo botão errado e ativar de verdade uma campanha que o usuário mandou adiar. AC8 verificada por comando: `git diff 8d990b4 -- orchestrator.ts` **vazio**, os 4 CAS `.neq("status","cancelled")` intactos, conclusão da 22.17 de pé. Suíte cheia **402 arquivos / 7356 testes / 0 falhas**, lint `--max-warnings=0` limpo. Smoke real **somente leitura** na fixture viva `f67e06fc`: status **Ativa (1)** e `email_list` presente como array — prova em API real tanto o cenário da guarda da AC4b quanto a origem do `emailList` da AC6; nenhum `POST /activate` nem `PATCH` disparado. Lacunas declaradas: o corpo do PATCH (AC5) não foi verificado contra a API real (exigiria um PATCH, não autorizado) — o código funciona sob ambas as semânticas; e o fluxo de retomada não foi rodado ponta a ponta pela UI. |
| 2026-07-26 | **Revisão de qualidade da story (checklist do create-story, validador em contexto limpo).** 3 defeitos HIGH corrigidos antes de liberar: (1) **AC2 era satisfazível deixando o sistema quebrado** — o 409 do approve devolve `code: "CONFLICT"` genérico para TODOS os status e o status atual vive só na string PT-BR; um dev "lendo o código do erro" trataria um step 4 `running` como "siga adiante" (double-execute). A AC2 passou a EXIGIR o discriminador estruturado no servidor. (2) **AC1 e AC3 se contradiziam** — o padrão durável da 22.13 é escrito na rota, mas o approve retorna antes de o `execute` disparar; carimbar ali tornaria o bug da AC1 permanente e deixaria a retomada atrás de um card desabilitado. A AC3 ganhou a regra de quem-carimba-quando + "falha ⇒ re-armado". (3) **O gate não enxerga o estado dos steps** (`useAgentStore` não expõe `steps`), então as ACs 2 e 3 não eram decidíveis no cliente; o mecanismo ficou explícito para o dev não inventar um terceiro. Outros ajustes: AC4a diz de onde ler o output (o `StepInput` não carrega a própria linha) e que `running` preserva o `output`; AC4b passou a exigir REUSO do precedente de verificação pós-gateway do `createCampaign` em vez de reinventar pré-flight; AC5 verifica pelo corpo do PATCH (que já traz `email_list` e hoje é descartado) — resolvendo a contradição com "1 GET + 1 PATCH" —, define o comportamento terminal (lançar) e lista os 3 callers em produção; AC6 ganhou guarda de SERVIDOR (a UI não é a única porta, e as AC1/AC2 tornam o execute direto mais comum); AC7 fixou o default (remover a rota) e revelou o teste que quebraria a suíte; AC8 ganhou verificação concreta por `git diff`; AC1 deixou de mandar duplicar erro que o `sendErrorMessage` já escreveu. Corrigidas as refs de `AgentMessageBubble` (`:89`, não `:66-69`) e de `orchestrator.ts`; acrescentados `AgentApprovalGate.tsx` e `types/agent.ts` às References; contagem de defers 4 → 6; smoke ganhou proibição explícita de `POST /activate` na campanha viva `f67e06fc`. |
| 2026-07-26 | Story criada (create-story, Opus 5) a partir de defers correlatos (reviews 22.12 e 22.17), com escopo validado no código a pedido do Fabossi. **Argumento central provado mecanicamente:** o retry perigoso do activate hoje é quase inalcançável pela UI *porque* o caminho de recuperação está quebrado (`useAutoTrigger` não re-dispara step `failed`; em guiado só auto-avança após `skipped`); consertar a retomada sem idempotência transforma risco raro em corriqueiro. Escopo ampliado em 3 pontos vs. a proposta original: (1) o **elo 1** (D1 da review da 22.17) entrou como AC1; (2) (a) é **maior** que o descrito — o 409 aparece em qualquer remontagem do gate → AC3 de durabilidade; (3) **zero contas de envio** entrou como AC6. A idempotência virou **duas guardas** (AC4a/AC4b) em vez de uma alternativa, porque no cenário de erro parcial o `activated: true` nunca chega a ser gravado. baseline `8d990b4`. |
