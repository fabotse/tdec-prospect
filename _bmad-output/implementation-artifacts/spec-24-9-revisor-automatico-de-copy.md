---
title: '24.9 — Revisor automático de copy'
type: 'feature'
created: '2026-10-19'
baseline_revision: 'f36125e877103683a3a2a62b6d8a2dd22d30fce8'
status: done
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      O status do revisor no editor manual some depois de salvar e recarregar a campanha, porque o save grava só subject/body/email_mode.
    evidence: |-
      PATCH /api/campaigns/[campaignId] monta as linhas de email_blocks só com subject, body e email_mode, e email_blocks não tem coluna livre. Persistir exige migration aditiva (ex.: email_blocks.review_status + review_reasons jsonb), que só pode ser aplicada com OK do Fabossi, e o código não pode subir antes dela. No agente o status fica no output do step e não se perde.
    location: >-
      src/app/api/campaigns/[campaignId]/route.ts (mapeamento das linhas de email_blocks)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Os e-mails gerados por IA (agente e editor manual) chegam ao gestor sem nenhuma checagem de saída. A 24.8 só mudou as instruções dos prompts, e o LLM ainda pode devolver clichês, afirmações sem prova, placeholders, texto fora do setor do lead, e-mails longos demais ou CTA pedindo reunião.

**Approach:** Criar um revisor por LLM (modelo em fonte única, no padrão `parser-config.ts`) que devolve JSON aprovado/reprovado com motivos. Se reprovar, o próprio módulo reescreve com base nos motivos e revisa de novo, no máximo 2 vezes. O resultado é um status por e-mail (`approved` / `rewritten` / `needs_human_review` / `not_reviewed`), com o custo registrado em `api_usage_logs`. O agente roda o revisor depois de gerar os e-mails e mostra o status na revisão da campanha. O editor manual chama uma rota nova depois de gerar e mostra o status no bloco.

## Boundaries & Constraints

**Always:**
- O revisor checa 6 critérios, com estes ids no JSON: `unsupported_claim` (número, %, case, cliente, resultado ou certificação fora de `authorized_proofs`; se a lista estiver vazia, qualquer um conta), `cliche`, `placeholder` (`[...]`, "Nome"/"Empresa" soltos, `{{x}}` fora das variáveis do original), `sector_relevance` (oferta sem ligação com o setor ou cargo do público), `length` (corpo acima de ~150 palavras) e `cta` (pedido de reunião ou agenda em vez de pergunta de baixo atrito).
- Resposta do revisor: `{"approved": boolean, "reasons": [{"check": <id>, "detail": string}]}`, validada com zod. Reprovado sem motivos conta como aprovado.
- A reescrita devolve `{"subject","body"}`, mantém exatamente as variáveis `{{...}}` do original, não cria provas, não usa `RE:`/`FW:` e corrige os motivos apontados. O chamador pode passar `clean(subject, body)`, aplicado a cada reescrita antes da nova revisão. Se a reescrita ficar vazia depois do `clean`, conta como falha.
- Status: aprovado na 1ª revisão = `approved` (texto original). Aprovado depois de reescrever = `rewritten` (texto reescrito). Reprovado depois de 2 reescritas = `needs_human_review`, com o texto da última reescrita e os motivos da última revisão. Qualquer falha (sem chave, timeout, erro de rede, JSON inválido) = `not_reviewed`, com o texto ORIGINAL e `reasons: []`. Nunca lança erro.
- Fonte única em `src/lib/ai/copy-review-config.ts`: modelo `gpt-5.4-mini`, timeout por chamada, `MAX_REWRITES = 2`, preço por 1M tokens ($0,75 de entrada / $4,50 de saída) e `buildReviewerRequest` (reaproveita `isGpt5Family`, `response_format: json_object` e omite `temperature` no gpt-5).
- Custo: uma linha em `api_usage_logs` por e-mail revisado, quando houve pelo menos 1 chamada: `serviceName: "openai"`, `requestType: "copy_review"`, `estimatedCost` (soma das chamadas), `status` `success` (ou `failed` se `not_reviewed`) e `metadata` `{model, calls, promptTokens, completionTokens, reviewStatus, source: "agent"|"manual", executionId?, emailPosition}`. O log usa `logApiUsage`, que nunca lança.
- Agente: os e-mails continuam sendo gerados em sequência. A revisão roda depois, em paralelo por e-mail (`Promise.all`), para caber no `maxDuration` de 300s. O `clean` é `cleanAgentEmailCopy`. Cada bloco ganha `review: {status, reasons}`.
- Manual: o status fica em `block.data.reviewStatus`/`reviewReasons` só durante a sessão, porque o save grava apenas `subject`/`body`/`email_mode`.

**Never:**
- Nenhuma migration nem coluna nova. Nada de mexer em `ai_prompts`, `pg_cron`, Edge Functions ou secrets.
- O revisor nunca bloqueia a geração, o approve, o save nem o export. Nada muda em `export-step.ts`, `instantly.ts`, `campaign-persistence` ou na rota `/api/ai/generate`. Nenhuma trava nova no caminho até o Instantly.
- Não usar `createAIProvider`/`AIModel` para o revisor (o tipo não aceita gpt-5.4-mini): usar o SDK `openai` direto, como os parsers. Não colocar o prompt do revisor no `promptManager`: ele não é customizável por tenant e fica como constante no módulo.
- Não ler provas do banco: usar o `authorized_proofs` que `buildAIVariables` já entrega (hoje `""`, preenchido pela 24.7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Aprovado | 1ª revisão `approved: true` | `approved`, texto original, 1 chamada | — |
| Reescrito | reprova → reescreve → aprova | `rewritten`, texto da reescrita (já passado pelo `clean`), 3 chamadas | — |
| Revisão humana | reprova 3× (original + 2 reescritas) | `needs_human_review`, texto da 2ª reescrita, motivos da última revisão, 5 chamadas | — |
| Falha | timeout/erro/JSON inválido em qualquer chamada | `not_reviewed`, texto original, `reasons: []` | não lança; loga `failed` se houve chamada |
| Sem chave (manual) | tenant sem chave OpenAI | 200 com `not_reviewed`, sem chamada | sem log |
| Rota manual com erro | fetch falha ou rota responde não-2xx | cliente devolve `not_reviewed` com o texto enviado | não lança |

</intent-contract>

## Code Map

- `src/lib/agent/parser-config.ts` -- padrão a espelhar (`PARSER_MODEL`, `isGpt5Family`, `buildParserRequest`). Reaproveitar `isGpt5Family` por import.
- `src/lib/agent/briefing-parser-service.ts:198-278` -- padrão de chamada: `new OpenAI({apiKey})`, `AbortController` + timeout, `chat.completions.create(req, {signal})`, `JSON.parse` + zod `safeParse`. `completion.usage` traz `prompt_tokens`/`completion_tokens`.
- `src/lib/agent/steps/create-campaign-step.ts` -- `aiVars` em `:184` (com `authorized_proofs`, `product_*`, `target_industries`, `pain_points`, `icp_summary`). `apiKey` em `:191`. `generateEmailBlocks` em `:234`, implementado em `:938-1063`, que limpa com `cleanAgentEmailCopy` em `:1039-1049`. Montagem do output em `:255`. `cost` em `:271` (adicionar `openai_review: <total de chamadas>` quando > 0). O briefing tem `jobTitles`, `industry` e `location` (`src/types/agent.ts:111`) para descrever o público. Import do logger em `:20`.
- `src/types/agent.ts:281-293` -- `CreateCampaignOutput.emailBlocks`: adicionar `review?: { status: CopyReviewStatus; reasons: string[] }`.
- `src/lib/services/usage-logger.ts:22` -- `logApiUsage`. `src/types/api-usage.ts` -- `"openai"` já é `UsageServiceName`.
- `src/lib/agent/campaign-copy.ts:232` -- `cleanAgentEmailCopy(text, kind)`, o `clean` do agente.
- `src/components/agent/AgentCampaignPreview.tsx` -- `interface EmailBlock` em `:21` (adicionar `review?`). O rótulo "Email N (Inicial/Follow-up)" fica em `:193-195`, e o badge entra ao lado. Os motivos aparecem em texto pequeno abaixo quando o status é `needs_human_review`. Sem `review` (execuções antigas), sem badge. O approve (`:123`) reenvia os blocos com spread, então `review` sobrevive.
- `src/components/builder/EmailBlock.tsx` -- `handleGenerate` `:317-458`: a revisão entra depois de `cleanSubject`/`cleanBody` e antes do `updateBlock` final (`:382` follow-up, `:441` inicial). Depois da revisão, reaplicar ao texto devolvido a mesma limpeza da geração. O badge vai no cabeçalho (`:513-568`), onde `Badge` já é importado.
- `src/hooks/use-ai-full-campaign-generation.ts:330-380` -- revisar cada e-mail logo depois do `sanitizeGeneratedBody` (antes de virar `previousEmail`/`resultBlocks`). Reaplicar `sanitizeGeneratedSubject`/`sanitizeGeneratedBody` ao resultado e gravar `reviewStatus`/`reviewReasons` em `data`.
- `src/app/api/ai/generate/route.ts` -- só leitura: padrão de auth (`getCurrentUserProfile`, 401/403), `readServiceApiKey(tenantId,"openai")`, `getProductById`/`buildProductVariables` (copiar o necessário para a rota nova) e envelope `APIErrorResponse`.
- `src/app/api/opportunities/[opportunityId]/suggestion/route.ts` -- padrão fail-open sem chave (200 com resultado nulo) e `maxDuration = 60`.
- Testes existentes que precisam continuar verdes: `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` (mock de `@/lib/ai` e de `@/lib/services/usage-logger` em `:110`, que precisa ganhar `logApiUsage`; mockar também o módulo do revisor), `__tests__/unit/components/agent/AgentCampaignPreview.test.tsx`, `__tests__/unit/components/builder/EmailBlock.test.tsx` e `__tests__/unit/hooks/use-ai-full-campaign-generation.test.tsx` (usa `global.fetch` com respostas encadeadas, então mockar o cliente do revisor por módulo). O padrão de mock do SDK `openai` está em `briefing-parser-service.test.ts:19`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/copy-review.ts` -- NOVO: `CopyReviewStatus`, `COPY_REVIEW_CHECKS`, `CopyReviewResult {subject, body, status, reasons: string[], calls, promptTokens, completionTokens, estimatedCost}` e `COPY_REVIEW_STATUS_LABELS` ("Aprovado", "Reescrito", "Precisa revisão humana", "Não revisado"). -- tipos compartilhados cliente/servidor.
- [x] `src/lib/ai/copy-review-config.ts` -- NOVO: fonte única do modelo, timeout, `MAX_REWRITES`, preços, `buildReviewerRequest(messages)` e `calculateReviewCost(promptTokens, completionTokens)`. -- AC3.
- [x] `src/lib/ai/copy-reviewer.ts` -- NOVO, só servidor: `reviewEmailCopy({subject, body, emailMode, context: {audience, productName, productDescription, targetIndustries, painPoints, icpSummary, authorizedProofs}}, {apiKey, clean?})` → `CopyReviewResult`. Ciclo revisão/reescrita conforme o Always e a matriz. Inclui `logCopyReview(result, {tenantId, source, executionId?, emailPosition})`. -- núcleo.
- [x] `src/lib/agent/steps/create-campaign-step.ts` -- depois de `generateEmailBlocks`, revisar todos os blocos em paralelo, gravar `review` em cada bloco, logar o custo e somar `openai_review` ao `cost`. O contexto vem de `aiVars` + briefing. -- AC1/AC2 no agente.
- [x] `src/types/agent.ts` -- campo `review?` em `emailBlocks`.
- [x] `src/components/builder/CopyReviewBadge.tsx` -- NOVO: badge com o rótulo do status e os motivos opcionais (`data-testid="copy-review-badge"`). Usado no agente e no editor.
- [x] `src/components/agent/AgentCampaignPreview.tsx` -- tipo + badge por e-mail + motivos quando `needs_human_review`. -- AC2 (superfície da revisão).
- [x] `src/app/api/ai/review-email/route.ts` -- NOVO `POST {subject, body, emailMode, productId?, variables?}`: valida com zod, autentica, lê a chave (sem chave → 200 `not_reviewed`), monta o contexto a partir de `variables` (chaves de ICP/produto/`authorized_proofs`) + produto do banco, chama `reviewEmailCopy` (sem `clean`), loga com `source: "manual"` e responde `{data: {subject, body, status, reasons}}`. `maxDuration = 60`.
- [x] `src/lib/ai/review-email-client.ts` -- NOVO: `requestEmailReview(params, signal?)` faz `fetch` na rota e nunca lança (qualquer falha → `not_reviewed` com o texto enviado).
- [x] `src/components/builder/EmailBlock.tsx` e `src/hooks/use-ai-full-campaign-generation.ts` -- chamar `requestEmailReview` depois da geração, reaplicar a limpeza e gravar texto + `reviewStatus`/`reviewReasons`. `EmailBlock` mostra o `CopyReviewBadge` quando há `reviewStatus`. -- AC1/AC2 no manual.
- [x] Testes NOVOS: `__tests__/unit/lib/ai/copy-reviewer.test.ts` (matriz I/O com mock do SDK `openai`: contagem de chamadas, texto devolvido, `clean` aplicado, falha → original, reprovado sem motivos → aprovado, custo), `__tests__/unit/lib/ai/copy-review-config.test.ts` (sem `temperature` no gpt-5, `json_object`, custo), `__tests__/unit/api/ai-review-email.test.ts` (401, 400, sem chave → `not_reviewed`, sucesso + log) e `__tests__/unit/lib/ai/review-email-client.test.ts` (não-2xx/erro → `not_reviewed`). Casos novos nos testes existentes: o step grava `review` e `openai_review` e segue gerando quando o revisor devolve `not_reviewed`; o preview mostra o badge e os motivos; o `EmailBlock` e o hook gravam o texto revisado e o status.

**Acceptance Criteria:**
- Given um e-mail gerado pelo agente, when o step `create_campaign` termina, then cada e-mail no card de revisão da campanha mostra um dos 4 status, e um e-mail `needs_human_review` mostra os motivos.
- Given um e-mail gerado no editor manual (bloco a bloco ou geração completa), when a geração termina, then o bloco mostra o status e guarda o texto revisado.
- Given o revisor indisponível (sem chave, timeout, JSON inválido), when a geração roda, then a campanha é gerada igual, com os e-mails `not_reviewed` e o texto original.
- Given cada e-mail revisado, when a revisão termina, then existe uma linha `copy_review` em `api_usage_logs` com custo, tokens, modelo e origem.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 36 findings — high 0, medium 4, low 28, false 4, maybe-false 0
- findings:
  - `low` `patch` [blind] O badge "Aprovado"/"Reescrito" continua no preview do agente depois que o usuário edita o texto, e o approve envia o `review` velho — `handleFieldChange` remove `review` do bloco editado; teste em `AgentCampaignPreview.test.tsx`.
  - `medium` `patch` [blind] A reescrita pode perder `{{first_name}}`/`{{ice_breaker}}` e ainda voltar `rewritten`, tirando a personalização por lead — depois do `clean`, variável original ausente vira falha (`not_reviewed` com o original); teste em `copy-reviewer.test.ts`.
  - `low` `reject` [blind] A rota manual não aplica `clean` entre as rodadas — o efeito máximo é gastar uma reescrita a mais, porque o próprio revisor reprova placeholder; o cliente limpa o texto final. A intenção da spec manda a rota chamar sem `clean`.
  - `low` `reject` [blind] A rota confia em `authorized_proofs` e no ICP vindos do navegador — só afeta a revisão do próprio e-mail do usuário no próprio tenant. `mergedVariables` vem de `buildAIVariables` e já traz `authorized_proofs` (hoje `""`). Carregar a KB no servidor seria um caminho novo para um risco sem dano a terceiros.
  - `low` `patch` [blind] `subject`/`body` sem tamanho máximo na rota, o que permite texto enorme em até 5 chamadas pagas — `.max(1000)` no assunto e `.max(20000)` no corpo; teste 400 em `ai-review-email.test.ts`.
  - `low` `reject` [blind] Não há chave para desligar o revisor — é pedido de recurso, não defeito. A intenção não pede, e o custo medido no smoke é de ~US$0,0005 a 0,003 por e-mail.
  - `low` `reject` [blind] O cancelamento durante a revisão no hook não é tratado, e o `EmailBlock` não passa signal — no hook o abort do controller já corta o fetch (fallback `not_reviewed`) e o laço checa `cancelledRef` na volta. No bloco, o patch de estado "revisando" cobre a interação; o desmontar no meio é raro.
  - `low` `patch` [blind] O resultado da revisão pode sobrescrever o que o usuário digitou, e não há indicação de "revisando" — estado local `isReviewing`, botão Gerar desabilitado e linha "Revisando copy..." (`ai-reviewing-status`); teste em `EmailBlock.test.tsx`.
  - `low` `patch` [blind] Ids de checagem fora dos 6 disparam reescrita — os motivos são filtrados para `COPY_REVIEW_CHECKS` antes da regra "reprovado sem motivos = aprovado"; testes em `copy-reviewer.test.ts`.
  - `low` `reject` [blind] O log não registra a causa da falha — a causa vai para `console.warn`. Guardá-la no resultado criaria campo público novo sem defeito de uso.
  - `low` `defer` [blind] O aviso `needs_human_review` do editor manual some depois de recarregar — persistir exige migration em produção com OK do Fabossi; registrado em `deferred`.
  - `false` `reject` [blind] Nenhum teste mostra que o approve e o export aceitam o campo extra — refutação: o approve (`approve/route.ts:165-166`) substitui `emailBlocks` pelo array recebido, sem schema estrito, e o export (`export-step.ts:59` em diante, `convertToInstantlySequences`) lê só posição, assunto e corpo.
  - `low` `reject` [blind] `Promise.all` sem limite de concorrência no agente — o máximo é 10 e-mails (`emailCount` 1-10). Um rate limit vira `not_reviewed` (fail-open), e agora existe o orçamento total.
  - `false` `reject` [blind] `emailPosition` é calculado de jeitos diferentes — refutação: `emailIndex` (`EmailBlock.tsx:344`) e `emailNumber` (`:150-156`) são o índice 1-based entre os e-mails ordenados por `position`, a mesma coisa que `i + 1` no hook e `index + 1` no agente. O `0` da rota só vale quando o campo é omitido.
  - `low` `reject` [blind] A lista de motivos é montada duas vezes (preview e `showReasons` do badge) — é estilo, sem chamador que vá divergir.
  - `low` `reject` [blind] Faltam casos de teste (rota com `readServiceApiKey` lançando, produto ausente etc.) — o caso que escondia defeito (variável perdida) ganhou teste com o patch. Os demais são caminhos fail-open simples.
  - `false` `reject` [blind] A spec não está no diff — refutação: ela foi excluída de propósito do diff revisado (é o claims file). As Completion Notes com os 3 pontos estão nela.
  - `low` `patch` [edge] Gerar termina enquanto a revisão está pendente, e o usuário pode editar ou gerar de novo — mesmo grupo do achado "sobrescreve o que o usuário digitou" (estado `isReviewing`).
  - `low` `reject` [edge] No hook, o `clearTimeout` roda antes da revisão — a revisão é limitada pelo `maxDuration` da rota e cai em fail-open. Mover o timeout faria uma revisão lenta derrubar a geração do e-mail, que é pior.
  - `medium` `patch` [edge] A reescrita perde variável `{{...}}` — mesmo grupo do achado de variáveis acima.
  - `low` `reject` [edge] O badge do `EmailBlock` some na primeira edição ou troca de modo — é o comportamento desejado: depois de edição humana, o status não descreve mais o texto. O preview do agente foi alinhado a isso.
  - `low` `patch` [edge] O preview mantém o status velho depois da edição — mesmo grupo do primeiro achado (remove `review` ao editar).
  - `medium` `patch` [edge] A revisão pode empurrar o step `create_campaign` além dos 300s — orçamento total `REVIEW_BUDGET_MS = 60000` (`copy-review-config.ts`) em corrida com o `Promise.all`: se estourar, os blocos seguem com o texto gerado e `not_reviewed`. Teste com fake timers.
  - `low` `patch` [edge] Sem limite de tamanho na rota — mesmo grupo do achado de `.max` acima.
  - `low` `reject` [edge] A spec diz `maxDuration = 60` e o código usa 120 — a correção seria editar a spec. O 120 é deliberado (5 × 20s cortaria em 60s) e está registrado nas Completion Notes.
  - `low` `patch` [verification-gap] O mapeamento briefing/aiVars → contexto do revisor no agente não é afirmado — o teste do step afirma `audience` ("Cargos: CTO, VP Engineering", "Setor: saas") e `productName`/`painPoints`/`icpSummary`.
  - `low` `patch` [verification-gap] `emailMode`/`emailPosition`/`variables` do follow-up no hook não são afirmados — o teste do hook afirma `calls[1][0]` com `follow-up`, posição 2 e as chaves da KB.
  - `low` `reject` [verification-gap/other] O timeout por e-mail do hook não cobre a revisão — mesmo achado do `clearTimeout` acima.
  - `medium` `patch` [verification-gap/other] O orçamento de tempo do step do agente não é verificado — mesmo grupo do orçamento total acima.
  - `low` `reject` [verification-gap/other] Os follow-ups do agente usam o e-mail anterior sem revisão como contexto, e o wizard usa o revisado — trade-off registrado nas Design Notes (paralelo para caber em 300s). A regra de follow-up proíbe citar o e-mail anterior.
  - `low` `defer` [intent] R1c: o status não persiste em telas reabertas (editor depois de salvar) — mesmo grupo do achado de persistência acima (defer, migration).
  - `low` `reject` [intent] R2b/R2c: `needs_human_review` não bloqueia approve/export — a trava é proibida pelo CLAUDE.md do projeto ("nenhuma trava nova no caminho até o Instantly"). O e-mail fica marcado e com os motivos visíveis.
  - `low` `reject` [intent] R3b: a checagem não é por lead nem cobre o icebreaker — os e-mails do agente são templates por posição, e a copy por lead é a 24.21, que o épico diz reaproveitar a 24.9. O icebreaker não é um e-mail.
  - `low` `reject` [intent] A rota manual não grava id de campanha/execução no log — a geração manual pode acontecer antes de a campanha existir. Tenant, origem, modelo e tokens são gravados.
  - `false` `reject` [intent] O julgamento real do LLM não é exercitado — refutação: houve smoke com LLM real (bom → `approved`; ruim → `rewritten`, sem provas nem placeholder), registrado nas Completion Notes.
  - `low` `reject` [intent] Diferença `maxDuration` 60 × 120 entre spec e código — mesmo achado da edge acima.

### 2026-10-19 — Review pass (follow-up)
- verdicts: 31 findings — high 0, medium 0, low 29, false 2, maybe-false 0
- findings:
  - `low` `reject` [blind] Ids de checagem com caixa/espaço diferentes ("CTA", "unsupported claim") são descartados e o e-mail vira `approved` — o prompt fixa os ids exatos em modo `json_object` e o smoke real devolveu ids exatos. Normalizar/mapear ids seria lógica nova para um caso raro.
  - `low` `patch` [blind] A reescrita pode criar variáveis novas (ex.: `{{ice_breaker}}` num follow-up) e nada reprova — a guarda agora compara o conjunto de nomes de variáveis (sem espaços) da reescrita com o do original, nos dois sentidos; perder ou criar variável = `not_reviewed` com o original. Testes novos em `copy-reviewer.test.ts`.
  - `low` `reject` [blind] O critério `length` conta `{{ice_breaker}}` como 1 palavra — a intenção fala do corpo (~150 palavras) do template; estimar a expansão por lead é recurso novo.
  - `low` `patch` [blind] No agente, o orçamento de 60s descarta todas as revisões, até as que já terminaram, e as chamadas atrasadas seguem logando — cada e-mail grava o resultado no seu slot ao terminar; se o orçamento estourar, os terminados ficam e só os atrasados viram `not_reviewed`. `openai_review` soma as chamadas dos terminados. Teste novo em `create-campaign-step.test.ts`.
  - `low` `reject` [blind] carried Follow-ups do agente gerados a partir do e-mail inicial sem revisão — trade-off registrado nas Design Notes (paralelo para caber em 300s).
  - `low` `reject` [blind] carried Revisão no hook sem timeout próprio e cancelamento engolido (inclui `request.signal` não repassado ao SDK) — mesmo motivo dos achados `clearTimeout` e cancelamento no hook da 1ª passada; repassar o signal exigiria opção pública nova em `reviewEmailCopy`.
  - `low` `reject` [blind] carried O editor manual não cancela a revisão nem tem timeout no cliente — mesmo motivo do achado de cancelamento/desmontar da 1ª passada.
  - `low` `reject` [blind] carried A rota confia no contexto (`authorized_proofs`, ICP) vindo do navegador — mesmo motivo da 1ª passada.
  - `low` `reject` [blind] Sem rate limit/quota na rota e `variables` sem limite de tamanho — o usuário autenticado gasta a chave do próprio tenant, igual a `/api/ai/generate`; assunto e corpo já têm `.max`. Quota é recurso novo.
  - `low` `reject` [blind] Depois de reescrever, o texto original se perde (sem "restaurar original") — pedido de recurso; a intenção não pede comparação nem restauração.
  - `low` `reject` [blind] carried `not_reviewed` não diz o motivo — mesmo motivo do achado "causa da falha" da 1ª passada.
  - `low` `reject` [blind] carried O preview do agente duplica a lista de motivos do badge — mesmo motivo da 1ª passada (estilo, sem chamador que divirja).
  - `low` `reject` [blind] Faltam testes para os caminhos acima — os caminhos corrigidos nesta passada (variável nova, espaços, orçamento parcial) ganharam teste; os demais foram rejeitados.
  - `low` `patch` [edge] carried O usuário edita enquanto a revisão está pendente e o resultado sobrescreve — mesma linha da 1ª passada (estado `isReviewing`, botão Gerar desabilitado); o código ainda está como a linha descreve, então não é corrigido de novo.
  - `low` `reject` [edge] carried Bloco desmontado com a revisão pendente — mesmo motivo do achado de desmontar da 1ª passada.
  - `low` `patch` [edge] Um e-mail lento faz o orçamento descartar as revisões já terminadas — mesmo grupo do orçamento acima.
  - `low` `patch` [edge] Chamadas atrasadas continuam e gravam custo enquanto `openai_review` fica indefinido — mesmo grupo do orçamento acima. O custo das atrasadas continua sendo logado porque foi gasto de verdade.
  - `low` `reject` [edge] carried O `clearTimeout` do hook roda antes da revisão — mesmo motivo da 1ª passada.
  - `low` `reject` [edge] Se o re-sanitize esvaziar o texto revisado, o fallback mostra o texto gerado com o badge de revisado — exige uma reescrita não vazia que a sanitização apague inteira, o que é muito improvável; o conserto adicionaria ramos nos três chamadores.
  - `low` `patch` [edge] A reescrita pode adicionar `{{ice_breaker}}`/variáveis que o original não tinha — mesmo grupo da guarda de variáveis acima.
  - `low` `patch` [edge] A guarda só checa que as variáveis do original sobrevivem, nunca que nenhuma foi criada (divergência com "mantém exatamente") — mesmo grupo da guarda de variáveis acima.
  - `low` `reject` [edge] carried `maxDuration` 60 × 120 entre spec e código — mesmo motivo da 1ª passada.
  - `low` `patch` [verification-gap] Nenhum teste prova que editar assunto/corpo no `EmailBlock` remove `reviewStatus` — teste novo (`it.each` assunto/corpo) em `EmailBlock.test.tsx` afirma que o `updateBlock` depois da edição não traz `reviewStatus`/`reviewReasons`.
  - `low` `reject` [verification-gap/other] O store só recebe o texto gerado depois da revisão, então um save nessa janela grava o texto antigo — a janela típica é de 2 a 7s com "Revisando copy..." visível, comparável à janela de geração que já existia; a parte de sobrescrever a edição é a linha carried acima.
  - `low` `reject` [intent] O hook de geração completa é uma terceira superfície não nomeada — o hook faz parte do editor manual (lido como R1b) e está listado no Code Map; não há defeito descrito.
  - `false` `reject` [intent] carried A rota e o revisor nunca rodam juntos nem com LLM real — refutação: smoke com LLM real registrado nas Completion Notes.
  - `low` `patch` [intent] Com o orçamento estourado, texto e log de custo divergem — mesmo grupo do orçamento acima.
  - `low` `patch` [intent] "Não cria variáveis novas" não é aplicado no código (RE:/FW: também só no prompt) — mesmo grupo da guarda de variáveis; RE:/FW: no agente já são tratados pelo `cleanAgentEmailCopy`.
  - `low` `reject` [intent] carried A rota manual chama sem `clean` e limpa no navegador depois — mesmo motivo do achado `clean` da 1ª passada (a spec manda a rota chamar sem `clean`).
  - `low` `reject` [intent] carried `authorized_proofs` vem do cliente na rota manual — mesmo motivo da 1ª passada.
  - `false` `reject` [intent] carried Numeração `emailPosition` diferente entre fontes — refutação da 1ª passada: todas são o índice 1-based entre os e-mails ordenados.

## Design Notes

- **Por que revisar em paralelo no agente e em linha no manual:** no agente, o pior caso em sequência (5 e-mails × 5 chamadas) estouraria os 300s da rota execute. Em paralelo, o pior caso é ~5 chamadas × timeout. O follow-up do agente já foi gerado com o e-mail anterior sem revisão, o que é aceitável: a regra de follow-up proíbe citar o e-mail anterior. No hook manual (cliente, sem `maxDuration`), revisar em linha faz o próximo follow-up já usar o texto revisado.
- **Por que o status manual não persiste:** o save do editor apaga e reinsere `email_blocks` só com `subject`/`body`/`email_mode`, e persistir exigiria migration com OK do Fabossi. O status vale para a sessão, como já acontece com `icebreakerSource`.
- Prompt do revisor (resumo): papel de editor de cold email B2B. Recebe público (cargo/setor/local), oferta, ICP, dores, lista de provas e as variáveis permitidas. Devolve só o JSON. As variáveis `{{first_name}}`, `{{company_name}}`, `{{title}}` e `{{ice_breaker}}` NÃO são placeholders.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/ai __tests__/unit/lib/agent __tests__/unit/api/ai-review-email.test.ts __tests__/unit/components/agent/AgentCampaignPreview.test.tsx __tests__/unit/components/builder/EmailBlock.test.tsx __tests__/unit/hooks` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Smoke com LLM real (script descartável no scratchpad, `npx tsx --env-file=.env.local`, chave OpenAI do tenant lida em modo somente leitura ou via `OPENAI_API_KEY`): rodar `reviewEmailCopy` num e-mail bom e num ruim (com "aumente 40% suas vendas", "[Seu Nome]" e pedido de reunião de 30 min). Conferir `approved` no bom e `rewritten`/`needs_human_review` no ruim, com motivos coerentes. Sem gravar no banco (não chamar `logCopyReview`), sem Apollo e sem Instantly.

## Completion Notes

**O que pode mudar para o cliente**
- Arquivos novos: `src/types/copy-review.ts`, `src/lib/ai/copy-review-config.ts`, `src/lib/ai/copy-reviewer.ts`, `src/lib/ai/review-email-client.ts`, `src/components/builder/CopyReviewBadge.tsx`, rota nova `POST /api/ai/review-email` (`maxDuration = 120`: o pior caso são 5 chamadas de 20s).
- Alterados: `create-campaign-step.ts` (revisão em paralelo depois de gerar os e-mails, `review` por bloco, `cost.openai_review`), `types/agent.ts` e `types/email-block.ts` (campos opcionais), `AgentCampaignPreview.tsx` (badge + motivos), `EmailBlock.tsx` e `use-ai-full-campaign-generation.ts` (revisão logo depois da geração, texto revisado + status na sessão).
- Prompts: o prompt do revisor é constante do módulo (fora de `ai_prompts`/`promptManager`). Nenhum prompt existente mudou.
- Tabelas: só INSERT novo em `api_usage_logs` (`service_name='openai'`, `request_type='copy_review'`), via `logApiUsage`. Nenhuma migration, nenhuma coluna nova.
- Jobs/Edge Functions/secrets: nada.
- Integrações: chamadas extras à OpenAI com a chave do tenant (gpt-5.4-mini, até 5 por e-mail). Apollo e Instantly não são tocados.
- Efeito visível: o texto dos e-mails gerados (agente e manual) pode chegar reescrito pelo revisor; o gestor vê o status por e-mail.

**Os 3 pontos (por análise do diff + smoke do revisor com LLM real, sem banco/Apollo/Instantly)**
1. Campanhas rodando, webhook e `reply-sweep`: não tocados (nenhum arquivo de Instantly, webhook ou cron no diff).
2. Busca de leads: não tocada (steps de busca e serviços Apollo fora do diff).
3. Criação/export/ativação: `export-step.ts`, `instantly.ts`, `campaign-persistence` e `/api/ai/generate` sem mudança. O campo `review` extra nos blocos é ignorado pelo export (usa só `subject`/`body`). O revisor nunca lança: falha = `not_reviewed` com o texto original, então a geração, o approve, o save e o export seguem iguais.

**Verificação**
- `npm run lint` (0 erros, mesmas 134 warnings da base), `npm run typecheck` e `npm run test:run` (421 arquivos, 7960 testes) verdes.
- Smoke com LLM real (`npx tsx --env-file=.env.local`, `OPENAI_API_KEY`, sem `logCopyReview`): e-mail bom → `approved` (1 chamada, ~1,6s, ~US$0,0005). E-mail ruim ("40% suas vendas", "[Seu Nome]", ISO/Itaú, reunião de 30 min) → `rewritten` (3 chamadas, ~4,2s, ~US$0,0028), reescrita sem provas, sem placeholder e com pergunta de baixo atrito.

## Auto Run Result

Status: done

**Resumo:**
- O revisor automático de copy (`reviewEmailCopy`) checa cada e-mail gerado contra 6 critérios (prova não autorizada, clichê, placeholder, setor × oferta, tamanho, CTA) e devolve JSON aprovado/reprovado com motivos. Se reprovar, reescreve até 2 vezes. Os status são `approved`, `rewritten`, `needs_human_review` e `not_reviewed`, e o revisor nunca lança erro.
- Modelo, timeout, reescritas, preços e orçamento ficam em fonte única (`copy-review-config.ts`). Cada e-mail revisado grava uma linha `copy_review` em `api_usage_logs`.
- Agente: revisão em paralelo depois da geração, com orçamento de 60s, e status por e-mail no card de revisão. Editor manual: rota `POST /api/ai/review-email` chamada depois de cada geração, com o status no bloco durante a sessão.
- Esta passada (follow-up) corrigiu 3 pontos:
  - a reescrita agora precisa manter exatamente as mesmas variáveis do original (sem perder nem criar, ignorando espaços);
  - quando o orçamento do agente estoura, as revisões que já terminaram são mantidas;
  - um teste novo prova que editar o bloco no editor remove o status.

**Arquivos alterados nesta passada:**
- `src/lib/ai/copy-reviewer.ts`: guarda de variáveis da reescrita por conjunto de nomes, nos dois sentidos.
- `src/lib/agent/steps/create-campaign-step.ts`: `reviewEmailBlocks` guarda o resultado por e-mail e, se o orçamento estourar, só os atrasados viram `not_reviewed`.
- `__tests__/unit/lib/ai/copy-reviewer.test.ts`: casos de variável nova e de variável com espaços.
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts`: caso de orçamento estourado que mantém as revisões já terminadas.
- `__tests__/unit/components/builder/EmailBlock.test.tsx`: editar assunto ou corpo remove `reviewStatus`/`reviewReasons`.
- (Arquivos da 1ª passada: tipos, config, revisor, cliente, rota, badge, step, preview, `EmailBlock`, hook e testes, como listado nas Completion Notes.)

**Achados da revisão (31):**
- 0 high, 0 medium, 29 low, 2 false.
- Patches (3 entradas, todas low): guarda de variáveis da reescrita; orçamento parcial no agente; teste da edição no `EmailBlock`.
- Carried sem nova correção: sobrescrever a edição durante a revisão (a linha da 1ª passada continua valendo).
- Nenhum adiamento novo. O item `deferred` da persistência do status manual continua como estava.
- Rejeitados, com o motivo no Review Triage Log: ids com caixa diferente; `length` com `{{ice_breaker}}`; rate limit/quota; restaurar o original; fallback do re-sanitize; janela do store durante a revisão; terceira superfície (hook); e os carried da 1ª passada (follow-up sem revisão, timeout/cancelamento no hook e no bloco, contexto vindo do cliente, causa do `not_reviewed`, lista de motivos duplicada, `maxDuration`, `clean` na rota, `authorized_proofs` do cliente, LLM real e `emailPosition`).

**Follow-up review recomendado:** `false`. Esta é uma passada de follow-up e nenhum patch foi high. Contagem de entradas corrigidas: 0 high, 0 medium, 3 low.

**Verificação:**
- Testes focados: `copy-reviewer.test.ts` (21), `create-campaign-step.test.ts` (84) e o bloco "Copy review" de `EmailBlock.test.tsx` (8), todos verdes.
- `npm run lint`: 0 erros (as mesmas 134 warnings).
- `npm run typecheck`: limpo.
- `npm run test:run`: 421 arquivos, 7973 passando e 2 skipped.

**Os 3 pontos da Regra nº 1** (por análise do diff; nesta passada só mudaram o revisor, o step de criação do agente e testes):
1. Campanhas rodando, webhook e `reply-sweep`: não tocados.
2. Busca de leads: não tocada.
3. Criação e export para o Instantly: `export-step.ts`, `instantly.ts` e `campaign-persistence` sem mudança. O step continua fail-open: com o orçamento estourado, os blocos seguem com o texto gerado.
- Nenhuma migration, job, Edge Function ou secret.

**Riscos residuais:**
- Chamadas atrasadas depois do orçamento continuam rodando em segundo plano e gravam custo, porque o custo foi gasto de verdade. O texto delas é descartado.
- No editor, o que o usuário digita durante "Revisando copy..." é sobrescrito pelo texto revisado (linha carried).
- Os riscos residuais da 1ª passada continuam: até 5 chamadas por e-mail, log pelo client de sessão, status manual sem persistência e despedida solta depois da limpeza.
