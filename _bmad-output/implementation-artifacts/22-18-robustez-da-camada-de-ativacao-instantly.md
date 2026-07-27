---
baseline_commit: 8d990b4  # Story 22.17 (dev + code review) commitada -> baseline da 22.18
---

# Story 22.18: Robustez da camada de ativação/contas do Instantly — o retry precisa existir E ser seguro

Status: ready-for-dev

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

- [ ] **Task 1 — Elo 1: falha do execute vira sinal (AC1).** Checar `response.ok`; reverter `actionTaken`; parar spinner; renderizar erro **só** para os códigos pré-orchestrator. **Callers de `triggerNextStep` (4, já mapeados — não re-grepar):** [AgentLeadReview.tsx:177](../../src/components/agent/AgentLeadReview.tsx#L177), [AgentCampaignPreview.tsx:134](../../src/components/agent/AgentCampaignPreview.tsx#L134), [AgentApprovalGate.tsx:80](../../src/components/agent/AgentApprovalGate.tsx#L80), [AgentActivationGate.tsx:103](../../src/components/agent/AgentActivationGate.tsx#L103) e `:137`. Mudar a assinatura afeta os 4 — considerar tratar no gate.
- [ ] **Task 2 — Discriminador estruturado no approve + retomada (AC2).** Servidor primeiro (`currentStatus` ou code próprio), cliente depois. Não usar match de string.
- [ ] **Task 3 — Durabilidade do gate (AC3).** Flag em `AgentMessageMetadata`; carimbo de `activated` só após o step concluir; `deferred` pode ser no approve; falha ⇒ re-armado. Espelhar o fail-open da 22.13.
- [ ] **Task 4 — Idempotência (AC4).** (4a) `select("output")` explícito no `ActivateStep`; (4b) escolher e JUSTIFICAR entre verificação pós-gateway-error (precedente do `createCampaign`) e pré-flight.
- [ ] **Task 5 — Attach de contas (AC5).** Dedup normalizado só na comparação; verificação pelo corpo do PATCH; 1 retry; erro terminal se ainda faltar. Rodar as 4 suítes listadas.
- [ ] **Task 6 — Zero contas: UI + guarda de servidor (AC6).**
- [ ] **Task 7 — Remover a rota órfã + o teste dela; ajustar o tipo (AC7).**
- [ ] **Task 8 — Verificação de preservação (AC8).** Rodar o `git diff` da AC8 e colar o resultado nas Completion Notes.
- [ ] **Task 9 — Testes + smoke (AC9).**

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

_(preencher no dev-story)_

### Debug Log / decisões durante o dev

_(preencher no dev-story)_

### Completion Notes

_(preencher no dev-story — incluir a saída do `git diff` da AC8)_

### File List

_(preencher no dev-story)_

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-26 | **Revisão de qualidade da story (checklist do create-story, validador em contexto limpo).** 3 defeitos HIGH corrigidos antes de liberar: (1) **AC2 era satisfazível deixando o sistema quebrado** — o 409 do approve devolve `code: "CONFLICT"` genérico para TODOS os status e o status atual vive só na string PT-BR; um dev "lendo o código do erro" trataria um step 4 `running` como "siga adiante" (double-execute). A AC2 passou a EXIGIR o discriminador estruturado no servidor. (2) **AC1 e AC3 se contradiziam** — o padrão durável da 22.13 é escrito na rota, mas o approve retorna antes de o `execute` disparar; carimbar ali tornaria o bug da AC1 permanente e deixaria a retomada atrás de um card desabilitado. A AC3 ganhou a regra de quem-carimba-quando + "falha ⇒ re-armado". (3) **O gate não enxerga o estado dos steps** (`useAgentStore` não expõe `steps`), então as ACs 2 e 3 não eram decidíveis no cliente; o mecanismo ficou explícito para o dev não inventar um terceiro. Outros ajustes: AC4a diz de onde ler o output (o `StepInput` não carrega a própria linha) e que `running` preserva o `output`; AC4b passou a exigir REUSO do precedente de verificação pós-gateway do `createCampaign` em vez de reinventar pré-flight; AC5 verifica pelo corpo do PATCH (que já traz `email_list` e hoje é descartado) — resolvendo a contradição com "1 GET + 1 PATCH" —, define o comportamento terminal (lançar) e lista os 3 callers em produção; AC6 ganhou guarda de SERVIDOR (a UI não é a única porta, e as AC1/AC2 tornam o execute direto mais comum); AC7 fixou o default (remover a rota) e revelou o teste que quebraria a suíte; AC8 ganhou verificação concreta por `git diff`; AC1 deixou de mandar duplicar erro que o `sendErrorMessage` já escreveu. Corrigidas as refs de `AgentMessageBubble` (`:89`, não `:66-69`) e de `orchestrator.ts`; acrescentados `AgentApprovalGate.tsx` e `types/agent.ts` às References; contagem de defers 4 → 6; smoke ganhou proibição explícita de `POST /activate` na campanha viva `f67e06fc`. |
| 2026-07-26 | Story criada (create-story, Opus 5) a partir de defers correlatos (reviews 22.12 e 22.17), com escopo validado no código a pedido do Fabossi. **Argumento central provado mecanicamente:** o retry perigoso do activate hoje é quase inalcançável pela UI *porque* o caminho de recuperação está quebrado (`useAutoTrigger` não re-dispara step `failed`; em guiado só auto-avança após `skipped`); consertar a retomada sem idempotência transforma risco raro em corriqueiro. Escopo ampliado em 3 pontos vs. a proposta original: (1) o **elo 1** (D1 da review da 22.17) entrou como AC1; (2) (a) é **maior** que o descrito — o 409 aparece em qualquer remontagem do gate → AC3 de durabilidade; (3) **zero contas de envio** entrou como AC6. A idempotência virou **duas guardas** (AC4a/AC4b) em vez de uma alternativa, porque no cenário de erro parcial o `activated: true` nunca chega a ser gravado. baseline `8d990b4`. |
