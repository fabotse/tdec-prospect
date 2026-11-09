---
title: '24.24 — Conversa depois da execução'
type: 'feature'
created: '2026-11-09'
status: 'awaiting-operator'
baseline_revision: '917eb47aca60e052aa54d82a8965555694d41b5e'
review_loop_iteration: 0
followup_review_recommended: false
linear: 'FEL-47'
requisitos: 'FR37 · NFR1'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: [oversized]
deferred: []
operator_actions:
  - "Revisar e dar o OK (ou pedir mudanca) para a substituicao de e-mail pela conversa antes do Aprovar: ela muda o texto que o export envia ao Instantly pelo mesmo caminho da edicao manual (Regra n 1, ponto 3)."
  - "Depois do merge e do deploy, fazer o smoke real numa execucao de teste: perguntar 'por que esse lead?', pedir 'reescreve o e-mail 2' com o gate da campanha aberto e clicar Substituir sem aprovar, e pedir 'traz mais 2 parecidos' numa execucao terminada sem confirmar o plano. Nao ativar nada no Instantly."
  - "Decidir se a reescrita deve poder trocar a sequencia de uma campanha ja exportada no Instantly (hoje o card so oferece Copiar); se sim, abrir uma story propria."
  - "No Linear, mover a FEL-47 para Review humano / PR com o PR aberto; nao marcar Done antes do merge e do smoke."
---

<intent-contract>

## Intent

**Problem:** Depois que a execução do agente roda, qualquer texto livre recebe só a resposta fixa de status da 24.4 (`buildExecutionStatusReply`). O usuário não consegue perguntar "por que esse lead?", pedir uma reescrita de e-mail ou pedir mais leads sem recomeçar a conversa.

**Approach:** Criar uma rota `POST /api/agent/executions/[id]/conversation`. Ela lê no servidor o output dos steps (leads com score e justificativa, contas, dossiê, gatilho, e-mails) e o histórico recente, e pede a um LLM só duas coisas: a resposta em texto e a intenção. O código decide o resto de forma determinística:
- pergunta → resposta em texto;
- reescrita → gera a nova versão, passa pelo revisor da 24.9 e mostra um card. A substituição só acontece no clique;
- pedido com gasto → card com a ação e o custo estimado. O clique só abre uma conversa nova já preenchida, que segue o pipeline normal (card do briefing → plano com custo → Confirmar).

## Boundaries & Constraints

**Always:**
- Usar o client de sessão e `.eq("tenant_id")` explícito. A chave da OpenAI vem de `readServiceApiKey`.
- Registrar toda chamada de LLM em `api_usage_logs`: `logAgentUsage` com `executionId`, e `logCopyReview` com `source: "agent"`.
- Fail-safe: sem chave, timeout, JSON inválido ou erro de banco, a rota responde `{kind:"fallback"}` e o chat responde como hoje (`buildExecutionStatusReply`). A rota nunca devolve 500 por falha do LLM.
- Tudo que vem do usuário ou do banco entra no prompt entre delimitadores de dados (padrão `<<<DADOS … DADOS>>>` da 24.23). A resposta do LLM é validada e cortada no código. O texto é renderizado como texto puro do React.
- A reescrita mantém o e-mail como **template** (`{{first_name}}`, `{{company_name}}`, `{{title}}`, `{{ice_breaker}}`). Provas só da KB, via `authorizedProofs` no prompt e no revisor.

**Never:**
- Não alterar `create-campaign-step.ts`, `export-step.ts`, `activate-step.ts`, `orchestrator.ts`, `campaign-persistence.ts` nem nenhuma chamada ao Instantly.
- Não gravar em `agent_steps`, `campaigns` nem em tabelas de e-mail. Não escrever migration, `pg_cron` nem env.
- Não substituir e-mail de campanha já aprovada ou exportada.
- Não iniciar busca, execução ou gasto de créditos (Apollo, Treg, Apify) a partir da conversa. Não cancelar a execução atual.
- Não mudar o fluxo de briefing (pré-confirm), o ajuste pós-rejeição (22.13) nem o fluxo manual.

## I/O & Edge-Case Matrix

| Cenário | Estado / entrada | Saída esperada | Erro |
|---|---|---|---|
| Pergunta | steps com output; "por que o João?" | `{kind:"answer", reply}` com base no score, na justificativa e no dossiê | — |
| Sem output | só steps `pending`/`running` sem output | o cliente nem chama a rota e usa a resposta de status | — |
| Reescrita com gate aberto | `create_campaign` `awaiting_approval`; "reescreve o e-mail 3" | card com original, proposta e status do revisor; botão "Substituir na prévia" habilitado | revisor sem chave ou timeout → `not_reviewed`, o card mostra o status |
| Reescrita depois do export | `create_campaign` `approved`/`completed` | card só com "Copiar" e o motivo: campanha já aprovada e enviada ao Instantly | — |
| Posição inexistente | "e-mail 9" e a campanha tem 3 | `answer` dizendo quais posições existem, sem card | — |
| Sem campanha | não há output de `create_campaign` | `answer`: ainda não há e-mails para reescrever | — |
| Mais leads | "traz mais 2 parecidos com X" | card: nova busca com os mesmos critérios, N=2, custo estimado em BRL; `canStart` = execução terminal | briefing com `importedLeads` → `answer` explicando que não há busca para repetir |
| Execução não terminal | pedido de mais leads com gate aberto | card com o botão desabilitado: "disponível quando esta execução terminar" | — |
| Falha do LLM | timeout, JSON inválido, sem chave | `{kind:"fallback"}`; o cliente usa a resposta de status | o `logAgentUsage` registra a falha |

</intent-contract>

## Code Map

- `src/components/agent/AgentChat.tsx:957-971` -- ramo pós-confirm do `handleSendMessage`, que hoje chama `buildExecutionStatusReply(steps)`. Ponto de entrada. Também:
  - `cancelCurrentExecution` (1191): modelo do reset do cliente;
  - efeito do seed do ICP (273-279) e `icpIntroMessage` (282-285);
  - `sendAndRecordAgent` (442).
- `src/lib/agent/execution-status-reply.ts:30` -- resposta de fallback (inalterada).
- `src/hooks/use-briefing-flow.ts:2385` -- `seedIcpProposal(briefing)`. Exige `idle` e memória vazia. Ganha o parâmetro opcional `introTurn`.
- `src/components/agent/AgentCampaignPreview.tsx:88-89,143` -- `editedBlocks` é estado local enviado em `approvedData.emailBlocks` no Aprovar. É o alvo da substituição. Props: `executionId`, `stepNumber`.
- `src/stores/use-agent-store.ts` (zustand do agente) -- recebe o estado transitório `emailBlockReplacement`.
- `src/types/agent.ts`:
  - `SearchLeadResult` (353): `fitScore`, `fitReason`;
  - `ResearchAccountsOutput` (438): `accounts`, `whyNow`;
  - `CreateCampaignOutput` (559): `emailBlocks[{position, subject, body, emailMode, review?}]`;
  - `ParsedBriefing` (123);
  - `CostEstimate` (228).
- `src/lib/agent/dossier/repository.ts:197` `readDossierFacts` e `dossier-view.ts:134` `findLeadWhyNow` -- leitura dos fatos e do gatilho, sem alteração.
- `src/lib/ai/copy-reviewer.ts:216,324` -- `reviewEmailCopy` (nunca lança; aceita `clean`) e `logCopyReview`. Modelo do contexto: `create-campaign-step.ts:1138-1160` (somente leitura).
- `src/lib/agent/steps/create-campaign-step.ts:688-740` -- `loadKBContext` e `loadProduct` privados (somente leitura). São replicados num módulo novo, sem mexer no step.
- `src/lib/services/knowledge-base-context.ts:325` `buildAIVariables`; `knowledge-base-proofs.ts:13` `fetchKnowledgeBaseProofs`.
- `src/lib/agent/campaign-copy.ts` `cleanAgentEmailCopy` -- limpeza do texto reescrito.
- `src/lib/meeting-prep/generator.ts` e `src/lib/ai/meeting-prep-config.ts` -- molde de client injetável, request compat gpt-5, custo e delimitadores.
- `src/app/api/agent/executions/[executionId]/plan/route.ts:150-185` -- molde do custo: `ensureCostModels`, `isTregConfigured` e `estimateCosts(...).total`.
- `src/lib/agent/agent-usage.ts` `logAgentUsage`; `service-keys.ts:59` `readServiceApiKey`.
- Testes: `__tests__/unit/api/agent/reference-profile.test.ts` (molde de rota), `__tests__/unit/components/agent/AgentChat.test.tsx`, `__tests__/helpers/mock-supabase`.

## Tasks & Acceptance

**Execution:**
- `src/types/post-execution-chat.ts` -- NOVO. Tipos:
  - `PostExecutionChatResult`: `fallback | answer | rewrite | more_leads`;
  - `RewriteProposal`: `stepNumber`, `position`, `emailMode`, `original`, `proposed`, `review`, `canApply`, `blockedReason`;
  - `MoreLeadsProposal`: `count`, `referenceName`, `briefing`, `estimatedCostBRL`, `canStart`, `blockedReason`;
  - `EmailBlockReplacement`.
- `src/lib/ai/post-execution-chat-config.ts` -- NOVO, no molde do `meeting-prep-config`:
  - modelo `gpt-5.4-mini`;
  - timeouts: intenção 15s, reescrita 20s;
  - `buildPostExecutionChatRequest` e o custo.
- `src/lib/agent/conversation/context.ts` -- NOVO, puro:
  - `hasConversationalOutput(steps)`;
  - `buildConversationCatalog({steps, facts})` com tetos de 100 leads, 30 contas, 5 fatos por conta e todos os e-mails;
  - `findCampaignStep(steps)`.
- `src/lib/agent/conversation/interpreter.ts` -- NOVO:
  - `interpretMessage({message, history, catalog}, apiKey, factory?)` → intenção validada ou `null`;
  - `answer` com até 1500 caracteres;
  - `position` inteiro ≥ 1;
  - `count` inteiro entre 1 e 500 (o teto de `agent-pricing.ts:45`), padrão 5;
  - `referenceName` com até 120 caracteres.
- `src/lib/agent/conversation/rewrite.ts` -- NOVO. `rewriteEmailBlock(...)`:
  - faz a chamada de reescrita com a instrução, o original e as provas autorizadas;
  - aplica `cleanAgentEmailCopy`;
  - roda `reviewEmailCopy` com `clean`;
  - devolve `null` se o LLM falhar.
- `src/lib/agent/conversation/kb-review-context.ts` -- NOVO. Replica `loadKBContext`/`loadProduct` e monta `CopyReviewContext` igual a `reviewEmailBlocks`.
- `src/lib/agent/conversation/more-leads.ts` -- NOVO, puro. `buildMoreLeadsBriefing(briefing, count)`:
  - devolve `null` com `importedLeads` ou sem critério de busca;
  - copia o briefing com `leadCount = count`;
  - remove `importedLeads`.
- `src/app/api/agent/executions/[executionId]/conversation/route.ts` -- NOVO, `POST {message}`, `maxDuration = 120`:
  - auth → execução do tenant (404) → validação (400, mensagem ≤ 2000 caracteres) → steps;
  - lê as últimas 10 mensagens `text`, os fatos via `readDossierFacts` e a chave;
  - interpreta e despacha conforme a matriz;
  - `canApply` = `create_campaign.status === "awaiting_approval"`; `canStart` = execução em `completed`/`failed`/`cancelled`;
  - registra o uso;
  - nenhuma escrita além de `api_usage_logs` (e o lazy seed já existente do `ensureCostModels`).
- `src/stores/use-agent-store.ts` -- adicionar `emailBlockReplacement`, `setEmailBlockReplacement` e `clearEmailBlockReplacement`, fora do `persist`/`partialize`.
- `src/components/agent/AgentCampaignPreview.tsx` -- efeito que aplica a substituição. Só age se `executionId`/`stepNumber` baterem, sem ação local e sem `rejected`. Troca o `subject`/`body`/`review` da posição em `editedBlocks` e limpa o store.
- `src/components/agent/AgentConversationCard.tsx` -- NOVO:
  - **reescrita:** original × proposta, selo do revisor com `COPY_REVIEW_STATUS_LABELS` e motivos, botões "Substituir na prévia", "Copiar" e "Descartar";
  - **mais leads:** ação, N, referência, custo em `formatBRL`, botões "Começar nova busca" e "Descartar";
  - botão desabilitado mostra o `blockedReason`.
- `src/hooks/use-briefing-flow.ts` -- `seedIcpProposal(briefing, introTurn?)`. Com `introTurn`, grava esse texto na memória em vez do turno do ICP.
- `src/components/agent/AgentChat.tsx` -- no ramo pós-confirm:
  - com `hasConversationalOutput(steps)`: chamar a rota, responder com `reply` via `sendAndRecordAgent` e guardar o card em estado local;
  - `fallback` ou erro → resposta de status de hoje.
  - Handlers dos botões:
    - **Substituir:** grava no store e responde "Substituí o e-mail N na prévia. Aprove a campanha para valer.";
    - **Começar nova busca:** só com `canStart`. Faz o reset do cliente extraído de `cancelCurrentExecution` (sem PATCH), guarda o seed pendente e deixa o efeito semear com prioridade sobre o ICP; `icpIntroMessage` usa o texto do seed;
    - **Descartar:** limpa o card.
  - O card some no reset ou na troca de execução.
- `__tests__/unit/...` -- testes de:
  - `context`, `interpreter`, `rewrite` e `more-leads`, com o client injetado;
  - a rota (cada linha da matriz + 401/404/400 + fallback);
  - o store e a substituição no `AgentCampaignPreview`;
  - o `AgentConversationCard`;
  - os ramos novos do `AgentChat`: answer, fallback, rewrite apply e seed de mais leads.

**Acceptance Criteria:**
- Given uma execução com steps concluídos, when o usuário pergunta "por que esse lead?" ou "o que achou da empresa X?", then a resposta cita o score/justificativa, o gatilho e os fatos do dossiê lidos do output, e não inventa nada fora desses dados.
- Given um pedido de reescrita com o gate da campanha aberto, when o usuário clica em "Substituir na prévia", then a posição pedida muda na prévia e o próximo "Aprovar" envia a nova versão. Sem o clique, nada muda.
- Given um pedido com gasto, when interpretado, then nenhuma chamada paga de dados acontece. O card mostra a ação e o custo estimado, e o clique só abre a conversa nova com o card do briefing, que exige Confirmar e o plano como hoje (NFR1).
- Given qualquer falha do LLM ou da leitura, when o usuário manda uma mensagem pós-execução, then ele recebe a resposta de status de antes, e a execução, o export e a ativação ficam iguais.

## Spec Change Log

## Review Triage Log

### 2026-11-09 — Review pass
- verdicts: 37 findings — high 0, medium 0, low 31, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) "Substituir" responde sucesso mesmo quando a prévia recusa (sem ack) — raro: o handler já confere `awaiting_approval`; a prévia do gate está sempre montada e o desencontro de `blockPosition` não acontece com o output do step. Um ack exigiria uma superfície nova no store. A janela realista (Aprovar em voo) foi corrigida à parte (edge #2).
  - `[false]` `[reject]` (blind) numeração pula blocos malformados e aponta para o slot errado — com o gate aberto, `emailBlocks` vem do `create_campaign`, que sempre gera blocos bem formados. Fora do gate, `canApply` é false.
  - `[low]` `[reject]` (blind) a reescrita parte do output do servidor e sobrescreve a edição manual da prévia — a troca aparece na prévia e o card mostra o original. Editar à mão e depois pedir reescrita do mesmo e-mail é incomum, e a correção exigiria comparação e confirmação extra.
  - `[low]` `[patch]` (blind) o log do revisor atrasado se perde depois da resposta na Vercel — `rewrite.ts` agenda com `after()` de `next/server` e, fora de request, cai no disparo solto.
  - `[false]` `[reject]` (blind) sem sinal de progresso nem timeout no cliente — `setAgentProcessing(true)` mostra o `AgentTypingIndicator` (`AgentMessageList.tsx:65`), e o `maxDuration = 120` limita a espera.
  - `[low]` `[reject]` (blind) toda mensagem pós-execução custa LLM, sem throttle — é o desenho da spec. São centavos e ficam em `api_usage_logs`. Um limitador acrescentaria complexidade sem um dano demonstrado.
  - `[low]` `[reject]` (blind) "já contatados ficam de fora" não exclui os leads de execução `failed`/`cancelled` — o texto é exato (esses não foram contatados), e o caso comum é `completed` com export. Uma lista de exclusão nova seria complexidade.
  - `[low]` `[patch]` (blind) seed que falha deixa o `seededIntroTurn` velho — agora há `setSeededIntroTurn(null)` quando `seedIcpProposal` devolve false, com teste.
  - `[low]` `[patch]` (blind) card antigo continua na tela depois de outra pergunta — `conversationCard` é limpo no início de cada envio pós-execução, com testes de answer e fallback.
  - `[false]` `[reject]` (blind) uma leitura de dossiê que lança derruba a resposta — `readDossierFacts` nunca lança (`repository.ts:197-234`, try/catch que devolve `{facts: []}`).
  - `[low]` `[patch]` (blind) `MORE_LEADS_MAX = 500` duplica o teto — `MAX_LEAD_COUNT` foi exportado de `agent-pricing.ts` e é usado no interpreter.
  - `[false]` `[reject]` (blind) a rota aceita execução `pending` e gasta LLM — sem output nos steps, `hasConversationalOutput` devolve fallback antes de ler a chave, então nenhuma chamada é feita.
  - `[low]` `[reject]` (blind) o cliente confia no formato da proposta — cliente e rota saem no mesmo deploy. A divergência é improvável e a validação acrescentaria ramos.
  - `[low]` `[reject]` (blind) faltam as Completion Notes da Regra nº 1 e a parada `precisa-felipe` — a correção é editar a spec. Foi coberto no Auto Run Result e em `operator_actions`.
  - `[low]` `[patch]` (blind) casos sem teste — testes adicionados para card velho, seed que falha, `after` do revisor (fallback), troca de execução e briefing sem `jobTitles`.
  - `[low]` `[patch]` (blind) o interpreter pede um `reply` que a rota descarta — o prompt agora pede `reply: null` em rewrite e more_leads.
  - `[low]` `[reject]` (edge) prévia recusa e o chat confirma (mesmo grupo do 1º achado blind) — mesma razão.
  - `[low]` `[patch]` (edge) troca aplicada com o Aprovar em voo — `replacementApplies` exige `loading === null`. O pedido espera no store. Com teste.
  - `[low]` `[reject]` (edge) edição manual descartada sem aviso — mesmo motivo do 3º achado blind.
  - `[low]` `[reject]` (edge) desencontro de `blockPosition` consumido em silêncio (grupo do 1º achado blind) — inalcançável com o output do step.
  - `[false]` `[reject]` (edge) numeração `n` diverge do índice da prévia — mesma refutação do 2º achado blind.
  - `[low]` `[patch]` (edge) pedido que bate com a execução e o step mas não pode mais aplicar fica no store — agora é limpo quando `rejected` ou `localActionTaken`, com teste.
  - `[low]` `[patch]` (edge) seed que falha deixa a abertura errada — mesmo patch do 8º achado blind.
  - `[low]` `[patch]` (edge) briefing sem array `jobTitles` quebra o `seedIcpProposal` — `buildMoreLeadsBriefing` normaliza para `[]`, com teste.
  - `[low]` `[patch]` (edge) card desatualizado ao lado de outra resposta — mesmo patch do 9º achado blind.
  - `[low]` `[reject]` (edge) corte no meio de `{{variavel}}` acima de 3000 caracteres — o LLM é instruído a usar até ~120 palavras e o revisor checa o tamanho. O corte é improvável, e recuar até a variável seria lógica nova.
  - `[low]` `[reject]` (edge) o texto do revisor escapa do teto de tamanho — o revisor tem a checagem `length`. Improvável.
  - `[low]` `[reject]` (edge, claim) falha na leitura da KB não vira fallback — degrada para "sem provas", que é mais conservador: o revisor reprova qualquer alegação. Não há dano para o cliente.
  - `[low]` `[reject]` (edge, claim) chat confirma a troca que a prévia pode pular — grupo do 1º achado blind. A janela do Aprovar em voo foi corrigida.
  - `[low]` `[patch]` (gap) nenhum teste prova que o `introTurn` entra na memória do hook — testes adicionados em `use-briefing-flow.test.tsx` (introTurn e fallback em branco).
  - `[low]` `[patch]` (gap) loader de KB e produto sem teste — teste novo `kb-review-context.test.ts` (prova vai para `authorizedProofs`, filtro de `tenant_id`, fallback de erro).
  - `[low]` `[patch]` (gap) dedupe do histórico não é verificado — o teste da rota verifica que a mensagem aparece uma vez só no prompt.
  - `[low]` `[patch]` (gap) card escondido na troca de execução sem teste — teste adicionado no `AgentChat.test.tsx`.
  - `[low]` `[patch]` (gap, outros) `canStart` em `failed`/`cancelled` e o `blockedReason` genérico sem teste — casos adicionados no `conversation.test.ts`.
  - `[false]` `[reject]` (intent) sem `awaiting-operator`/`operator_actions` nem Auto Run Result — a finalização ainda não tinha rodado. Ela faz isso nesta mesma passada.
  - `[low]` `[reject]` (intent) o texto que chega ao Instantly muda (via `editedBlocks`) sem registro da Regra nº 1 — não é código. O registro está no Auto Run Result e o OK do Fabossi está em `operator_actions`.
  - `[low]` `[reject]` (intent) testes só unitários, sem LLM real nem smoke — o smoke real em produção precisa de um humano (não se ativa nada no Instantly) e está em `operator_actions`.

## Design Notes

- **Por que "Substituir na prévia" e não no banco:** os e-mails do agente existem só em `agent_steps.output` e no Instantly (`campaign-persistence.ts:30-33`). Depois do Aprovar, o export sobe a sequência. A única janela segura é o gate aberto, e o `editedBlocks` já é o caminho oficial de edição (o mesmo do editar à mão). Trocar a sequência no Instantly depois do export mexe no caminho da Regra nº 1 e fica como decisão do Fabossi (`operator_actions`).
- **"E-mail 3 do Fulano":** até a 24.21 (copy 1-para-1) o e-mail é um template único. A resposta deixa claro que a nova versão vale para todos os leads, e o lead citado entra só como contexto da conversa.
- **"Parecidos com X":** a busca por parecidos (24.18) exige de 3 a 5 referências e um enrichment pago. Aqui, "mais N" repete os critérios da execução que encontrou X, com `leadCount = N`. O dedupe do Epic 23 já existe no pipeline. O card diz isso com todas as letras.

## Verification

**Commands:**
- `npm run lint` -- sem erros
- `npm run typecheck` -- sem erros
- `npm run test:run` -- tudo verde, inclusive `AgentChat.test.tsx` e os testes do editor manual

**Manual checks:**
- O diff não toca os arquivos do **Never** nem `supabase/migrations/`.
- `git grep -n "instantly" -- <arquivos novos>` → nenhuma chamada.

## Auto Run Result

Status: awaiting-operator

**Resumo:** depois da execução, o texto livre no chat passa por `POST /api/agent/executions/[id]/conversation`. Essa rota lê o output dos steps, os fatos do dossiê e o histórico recente. O LLM decide só o texto e a intenção. O código decide o resto:
- **pergunta:** responde em texto;
- **reescrita:** gera a nova versão, passa pelo revisor da 24.9 e mostra um card. "Substituir na prévia" só existe com o gate da campanha aberto. Depois do export, o card só oferece "Copiar";
- **mais leads:** mostra um card com a ação e o custo estimado. O clique, só com a execução terminada, abre uma conversa nova preenchida, que segue briefing → plano com custo → Confirmar.

Qualquer falha cai na resposta de status de antes (24.4).

**Arquivos:**
- `src/app/api/agent/executions/[executionId]/conversation/route.ts`: rota nova. Só lê e grava apenas em `api_usage_logs`.
- `src/lib/agent/conversation/{context,interpreter,rewrite,kb-review-context,more-leads,llm}.ts`: catálogo, intenção, reescrita mais revisor, contexto da KB, briefing de "mais leads" e chamada JSON ao LLM.
- `src/lib/ai/post-execution-chat-config.ts`: modelo, timeouts e custo.
- `src/types/post-execution-chat.ts`: contratos.
- `src/components/agent/AgentConversationCard.tsx`: card de reescrita e de mais leads.
- `src/components/agent/AgentChat.tsx`: ramo pós-confirm, botões, reset extraído (`resetClientConversation`) e seed da conversa nova.
- `src/components/agent/AgentCampaignPreview.tsx`: aplica a troca em `editedBlocks` (o mesmo caminho da edição à mão).
- `src/stores/use-agent-store.ts`: `emailBlockReplacement`, que é efêmero.
- `src/hooks/use-briefing-flow.ts`: `seedIcpProposal(briefing, introTurn?)` e exporta `BRIEFING_CARD_HINT`.
- `src/lib/agent/agent-pricing.ts`: exporta `MAX_LEAD_COUNT`.
- Testes em `__tests__/unit/**` (rota, módulos, card, prévia, chat, hook e store).

**Review:** 37 achados (0 high, 0 medium, 31 low, 6 false):
- **18 viraram patch.** Os principais: guarda do Aprovar em voo e limpeza do pedido órfão na prévia; `after()` no log do revisor; card limpo a cada nova mensagem; seed que falha; `jobTitles` normalizado; teto importado; prompt sem `reply` descartado. Mais os testes que faltavam: introTurn, loader da KB, dedupe do histórico, troca de execução, `failed`/`cancelled`.
- **0 adiados.** Os rejeitados e o motivo de cada um estão no Review Triage Log.

**Follow-up review recomendado:** false. Os patches desta passada são todos low: 0 high, 0 medium, 18 low.

**Verificação:**
- `npm run lint`: 0 erros (135 warnings, todos já existentes);
- `npm run typecheck`: limpo;
- `npm run test:run`: 488 arquivos, 9576 testes passaram e 2 foram pulados.

A auditoria da matriz cobriu todas as linhas com testes que rodaram.

**Regra nº 1 (Completion Notes), verificada pela análise do diff, sem smoke:**
1. **Campanhas rodando, webhook e reply-sweep:** não foram tocados.
2. **Busca de leads:** não foi tocada. "Mais leads" só abre uma conversa nova e não chama a busca.
3. **Criação, export e ativação:** não houve mudança em `create-campaign-step`, `export-step`, `activate-step`, `orchestrator`, `campaign-persistence` nem em chamadas ao Instantly. Também não há trava nova. **Atenção:** o texto de um e-mail pode mudar pela conversa antes do Aprovar, pelo mesmo `editedBlocks` da edição à mão. Isso muda o conteúdo que segue para o Instantly. Por isso o OK do Fabossi está em `operator_actions`.

Sem migration, sem `pg_cron` e sem env. O `sprint-status.yaml` não foi tocado.

**Riscos residuais:**
- a resposta pode passar de 5 s (intenção até 15 s; reescrita mais revisor até cerca de 105 s);
- o "Substituir" responde sucesso sem confirmação da prévia (janela rara; detalhes no Triage Log);
- uma KB malformada faz o loader cair no contexto vazio (sem provas).

**Smoke local (`/verify`, sem efeitos colaterais):**
- com `npm run dev` e login real, `/agent` carregou sem erro de console;
- `POST .../conversation` respondeu 401 sem sessão e 404 `EXECUTION_NOT_FOUND` para uma execução inexistente com sessão.

Nenhuma mensagem foi enviada em execução real do cliente e nada foi gravado. O smoke funcional completo fica em `operator_actions`.
