---
title: '24.8 — Prompts honestos: problema primeiro, provas só da KB'
type: 'feature'
created: '2026-10-19'
baseline_revision: '095ac426d4737d13a1f3da500ff05ce24d5e3f2b'
status: done
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      As 8 linhas inativas de ai_prompts ainda carregam as instruções antigas (40%, RE:, sem REGRA DE PROVAS) e voltariam se fossem reativadas.
    evidence: |-
      Consulta somente leitura em 2026-10-19: email_body_generation v5 contém "40%", todas is_active = false e tenant_id nulo. Não há UI que altere is_active; atualizar ou apagar exige escrita em produção, que só pode ser feita com OK do Fabossi.
    location: >-
      ai_prompts (produção kdgogyqyaxncqoyklyxx)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Os prompts padrão (`prompts/defaults.ts`) empurram a IA a inventar e a falar do produto: a estrutura de campanha pede "Prova Social → Escassez", o corpo manda "Dedique 70% do email ao produto", os guias de tom trazem exemplos com números e cases inventados ("reduz o tempo em 40%", "ROI comprovado… case para"), o tom técnico manda "mencionar métricas/ROI" e o assunto de follow-up sugere "viu meu email?" e "RE:". Não existe regra de provas. O fluxo manual (`EmailBlock.tsx`, `use-ai-full-campaign-generation.ts`) ainda manda follow-ups "CONFIRMAR VISUALIZAÇÃO", "RE: SIMPLES" e "traga um case de sucesso" (pendência registrada na 24.6).

**Approach:** Reescrever os trechos dos prompts padrão de assunto, corpo, icebreaker (padrão e premium), follow-up (corpo e assunto) e estrutura de campanha para abrir pelo problema/contexto do lead, usar CTA de baixo atrito e obedecer a um bloco único de REGRA DE PROVAS alimentado pela variável nova `authorized_proofs` (lista fechada; vazia = não citar nenhuma prova). `buildAIVariables` passa a expor `authorized_proofs: ""` até a 24.7 preencher. O fluxo manual passa a usar o mesmo plano de follow-up do agente (`buildFollowUpPlan`).

## Boundaries & Constraints

**Always:**
- Bloco de provas idêntico em todos os prompts alterados, no formato `{{#if authorized_proofs}}…lista + "só cite o que está EXATAMENTE nesta lista"…{{else}}…"nenhuma prova fornecida: NÃO cite números, porcentagens, cases, clientes, resultados nem certificações"…{{/if}}`, em nível de topo (o `interpolateTemplate` não suporta `{{#if}}` aninhado). Variável ausente cai no `{{else}}` — nunca vaza literal.
- Corpo inicial: o primeiro bloco de conteúdo depois da saudação/quebra-gelo é o problema/contexto do lead (dores do ICP, cargo, empresa); o produto vem depois, em no máximo 2 frases, como resposta à dor. CTA de baixo atrito (pergunta de sim/não ou de interesse; nada de pedir reunião de 30 min ou agenda).
- Marcadores existentes do corpo (`[SAUDAÇÃO]`, `[QUEBRA-GELO]`, `[TRANSIÇÃO]`, `[CONTEÚDO PRODUTO]`, `[CTA]`, `[FECHAMENTO]`) continuam, na mesma ordem relativa; entra `[PROBLEMA DO LEAD]` entre `[QUEBRA-GELO]` e `[TRANSIÇÃO]`.
- Variáveis já usadas pelos prompts (`{{follow_up_strategy}}`, `{{subject_strategy}}`, `{{sequence_position}}`, `{{previous_email_*}}`, `{{ice_breaker}}`, `{{first_name}}`, `{{company_name}}`, `{{title}}`, condicionais de produto/exemplos/icebreaker) continuam.
- Fluxo manual: follow-ups usam `buildFollowUpPlan` (mesma numeração "Email n de N", mesmos ângulos e regras do agente). Nenhuma estratégia manual menciona e-mail anterior, "RE:" ou pede case/dado novo.

**Never:**
- Não criar tabela/migration nem a seção de Provas (é a 24.7). Não ler provas de lugar nenhum: `authorized_proofs` é sempre `""` nesta story.
- Não alterar `ai_prompts` em produção: as 8 linhas existentes estão todas `is_active = false` e globais (nenhum prompt por tenant), então o `promptManager` usa os code defaults. Só documentar.
- Não mexer em `export-step.ts`, `instantly.ts`, mapeamento de variáveis, prompts de monitoramento/oportunidade/WhatsApp/reply nem em `search_translation`. Nenhuma trava nova no caminho até o Instantly. Nenhuma chamada de LLM nova.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sem provas | prompt renderizado com `authorized_proofs: ""` ou ausente | contém "nenhuma prova" + proibição de citar números/cases; não contém `{{authorized_proofs}}` | — |
| Com provas | `authorized_proofs: "- Case: Acme reduziu 30% do retrabalho"` | lista aparece no prompt + "só cite… EXATAMENTE nesta lista" | — |
| Texto antigo | os 7 templates alterados | nenhum contém "Prova Social", "Escassez", "Dedique 70%", "40%", "ROI comprovado", "viu meu email", "case de sucesso" | — |
| Follow-up manual | sequência de 4 e-mails no editor (e na geração completa) | e-mail 2/3/4 recebem `sequence_position` "Email n de 4" e estratégias do `buildFollowUpPlan`; nenhuma contém "CONFIRMAR VISUALIZAÇÃO" nem "RE:" como instrução | — |

</intent-contract>

## Code Map

- `src/lib/ai/prompts/defaults.ts` -- alvo principal. `email_subject_generation` `:38-136` (exemplos `[TÉCNICO]` `:99-103` "ROI comprovado… case"); `email_body_generation` `:139-295` (`[TÉCNICO]` `:210-217` "40%", estrutura `:252-287`, "Dedique 70%" `:273`, CTA `:278-280`); `icebreaker_premium_generation` `:298-383` (exemplos `:350-353` com "nosso produto resolve"); `icebreaker_generation` `:386-499` (abordagens com `[proposta de valor]`/`[solução]` `:487-491`); `follow_up_email_generation` `:502-612` (`[TÉCNICO]` "métricas e resultados" `:563`); `follow_up_subject_generation` `:615-691` ("viu meu email?" `:641,:652`, "RE:" `:657`, regra anti-RE `:668-671`, "ROI" `:662`); `campaign_structure_generation` `:728-827` ("Prova Social -> Escassez" `:758`, "Ultima Chance" `:764`, "Oferta Direta" `:770`, "Case" `:776`).
- `src/lib/ai/prompt-manager.ts:235-258` -- evidência, somente leitura: `{{#if x}}` não aninhável (regex não-gulosa); variável ausente/vazia → `{{else}}`; `{{x}}` ausente fica literal.
- `src/lib/services/knowledge-base-context.ts:51-89` (`AIContextVariables`) e `:278-337` (`buildAIVariables`) -- adicionar `authorized_proofs: string` e `authorized_proofs: ""` (comentário: preenchido pela 24.7). Usado por agente, `campaign-structure/route.ts` e `use-knowledge-base-context` (editor), então todos recebem a variável.
- `src/lib/agent/campaign-copy.ts:140-180` -- `buildFollowUpPlan`/`COMMON_RULES`. Exportar helper `buildSequenceFollowUpPlan(n, total)` que calcula sozinho os ângulos já usados (2..n-1) e chama `buildFollowUpPlan`. Ajustar `COMMON_RULES` para "NÃO invente…; só cite provas da REGRA DE PROVAS do prompt, se houver". Módulo puro, importável no cliente.
- `src/components/builder/EmailBlock.tsx:330-353` -- trocar `bodyStrategy`/`subjectStrategy`/`sequencePosition` por `buildSequenceFollowUpPlan(emailIndex, totalEmails)`.
- `src/hooks/use-ai-full-campaign-generation.ts:313-334` -- idem com `emailPosition`/`totalEmails`.
- `__tests__/unit/lib/ai/prompts/email-prompt-structure.test.ts`, `prompt-quality-review.test.ts` -- fixam marcadores/ordem do corpo; precisam continuar verdes (só acrescentar `[PROBLEMA DO LEAD]` onde a ordem é afirmada, se necessário).
- `__tests__/unit/components/builder/EmailBlock.test.tsx`, `__tests__/unit/hooks/use-ai-full-campaign-generation.test.tsx` -- testes do editor que precisam continuar verdes; novos casos de follow-up entram aqui.
- `__tests__/unit/lib/services/knowledge-base-context.test.ts` -- teste de `buildAIVariables`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/services/knowledge-base-context.ts` -- adicionar `authorized_proofs` ao tipo e ao retorno (`""`). -- fonte única da variável de provas.
- [x] `src/lib/ai/prompts/defaults.ts` -- nos 7 templates do Code Map: inserir o bloco REGRA DE PROVAS; remover os exemplos/instruções inventados listados; corpo com `[PROBLEMA DO LEAD]`, `[CONTEÚDO PRODUTO]` limitado a 1-2 frases como resposta à dor, CTA de baixo atrito; tom `[TÉCNICO]` cita métricas só da lista de provas; follow-up subject sem "viu meu email?"/"RE:" (proibir `RE:`/`FW:`); estrutura de campanha com sequências sem prova social/escassez/oferta direta (ex.: Problema → Insight → Pergunta → Recurso útil → Encerramento) e "Case" só se houver prova autorizada; icebreakers com abordagens sem colchetes e centradas no contexto do lead. -- AC1.
- [x] `src/lib/agent/campaign-copy.ts` -- `buildSequenceFollowUpPlan` + ajuste de `COMMON_RULES`. -- plano único agente/manual.
- [x] `src/components/builder/EmailBlock.tsx` e `src/hooks/use-ai-full-campaign-generation.ts` -- usar `buildSequenceFollowUpPlan`. -- AC2.
- [x] `__tests__/unit/lib/ai/prompts/honest-prompts.test.ts` -- NOVO: para cada um dos 7 templates, renderizar (cópia local do `interpolateTemplate`, padrão dos testes vizinhos) com e sem `authorized_proofs` e afirmar a matriz I/O; afirmar ordem `[QUEBRA-GELO]` < `[PROBLEMA DO LEAD]` < `[CONTEÚDO PRODUTO]` < `[CTA]`. -- trava AC1.
- [x] `__tests__/unit/lib/agent/campaign-copy.test.ts` -- casos de `buildSequenceFollowUpPlan` (n=3,total=4 lista INSIGHT DO SETOR como usado; igual a `buildFollowUpPlan` com ângulos calculados).
- [x] `__tests__/unit/components/builder/EmailBlock.test.tsx` e `__tests__/unit/hooks/use-ai-full-campaign-generation.test.tsx` -- caso novo: follow-up recebe `sequence_position` "Email n de N" e estratégias sem "CONFIRMAR VISUALIZAÇÃO"/"RE: SIMPLES". -- AC2 na superfície do editor.
- [x] `__tests__/unit/lib/services/knowledge-base-context.test.ts` -- `authorized_proofs === ""`.

**Acceptance Criteria:**
- Given os prompts padrão de corpo, assunto, icebreaker (2), follow-up (2) e estrutura de campanha, when renderizados, then não pedem prova social/escassez, não trazem números/cases inventados, não mandam dedicar 70% ao produto, o corpo abre pelo problema do lead com CTA de baixo atrito, e todos têm a regra explícita de provas (com lista: só a lista; sem lista: nenhuma).
- Given uma campanha gerada no editor manual (bloco a bloco ou geração completa), when os follow-ups são gerados, then usam o mesmo plano do agente, e os testes existentes do editor continuam verdes.
- Given os prompts customizados no banco, when a story é concluída, then o levantamento está documentado nas Completion Notes (8 linhas, todas inativas, nenhuma por tenant → nenhuma migração necessária).
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 21 findings — high 0, medium 3, low 13, false 5, maybe-false 0
- findings:
  - `low` `patch` [blind] `email_subject_generation`: "só faça referência ao produto se soar natural" ambíguo frente à regra "nunca do produto" — trocado por "Nunca abra o assunto pelo produto; mencionar o produto é opcional".
  - `medium` `patch` [blind] A REGRA DE PROVAS não prevalecia sobre "PRIORIDADE MÁXIMA: imite os exemplos" nem sobre `writing_guidelines`; exemplos do tenant com números poderiam ser copiados — os dois ramos do `PROOF_RULE_BLOCK` agora dizem que a regra prevalece e que números/cases dos exemplos não podem ser copiados; teste em `honest-prompts.test.ts`.
  - `low` `patch` [blind] `[PROBLEMA DO LEAD]` sem fallback para `pain_points` vazio, empurrando o modelo a inventar — fallback: desafio típico do cargo/setor em tom de hipótese, sem afirmar fatos.
  - `low` `reject` [blind] Exemplos de abordagem do icebreaker padrão afirmam generalidades do setor — são observações genéricas e hedgeadas ("costuma"), não fatos da empresa nem provas; o fallback só vale sem exemplos. Reescrever é ajuste subjetivo sem dano nomeado.
  - `medium` `patch` [blind] Ângulo RECURSO ÚTIL mandava oferecer checklist/material e "perguntar se faz sentido enviar", prometendo algo que pode não existir (agora também no editor) — reescrito para entregar a ideia/passo prático no próprio e-mail, sem prometer anexo, checklist ou material; o assunto não cita checklist.
  - `low` `reject` [blind] "Ângulos já usados" conta posições de e-mails `initial` numa sequência mista — a anti-repetição cita um ângulo que não foi usado, e o efeito é só o modelo evitar esse ângulo. A numeração por posição já era assim antes. Corrigir exige passar o modo de cada bloco (parâmetro e ramos novos), e sequência mista no editor é incomum.
  - `low` `reject` [blind] O hook não ordena os blocos por `position` e o `EmailBlock` ordena — pré-existente (o hook já usava `i + 1` na ordem do array, e o `previousEmail` segue a mesma ordem). Os blocos vêm do wizard em ordem; a story não mudou a numeração desse caminho.
  - `false` `reject` [blind] O editor pode lançar `RangeError` se `emailIndex` for 0 ou o follow-up for o primeiro — refutação: `getPreviousEmailBlock` (`use-builder-store.ts:255-269`) devolve `null` na primeira posição e o plano só é montado quando há e-mail anterior, então `emailIndex >= 2`; no hook o caminho exige `i > 0`.
  - `low` `reject` [blind] O teste novo usa cópia local do `interpolateTemplate` — é o padrão dos testes vizinhos de prompt, e a cópia é idêntica à real (conferido pela verification-gap). Exportar o método privado criaria superfície pública nova.
  - `low` `reject` [blind] A lista de frases banidas no teste é curta (variantes "viu meu e-mail", "conseguiu ver") — nenhuma dessas variantes aparece nos templates. Ampliar a lista não pega defeito existente.
  - `low` `defer` [blind] As 8 linhas inativas de `ai_prompts` ainda têm o texto antigo e voltariam se alguém as reativasse — pré-existente. Não há UI que mude `is_active` (grep em `src/app`/`src/components` vazio), e atualizar exige escrita em produção, que é proibida sem OK do Fabossi.
  - `low` `reject` [blind] Lacunas de robustez nos testes (`buildAIVariables` só com `null`, `find(...)!`, ordem fixa das chamadas) — `authorized_proofs` é literal `""` em qualquer contexto, e os demais pontos são estilo de teste sem defeito escondido.
  - `low` `reject` [edge] `buildSequenceFollowUpPlan` conta posições 2..n-1 mesmo quando são e-mails `initial` — mesmo achado do "ângulos já usados" acima.
  - `low` `reject` [edge] `EmailBlock`: índice conta blocos `initial`; ENCERRAMENTO pula se o último for `initial` — mesmo achado; antes o "último" também era por índice.
  - `low` `reject` [edge] Hook: e-mails `initial` entre follow-ups geram lista falsa — mesmo achado.
  - `false` `reject` [verification-gap/other] Os code defaults só valem sem prompt no banco, e um prompt ativo manteria o texto antigo — refutação: consulta somente leitura (`scripts/db-ro.sh`) em 2026-10-19 achou 8 linhas, 0 ativas e 0 por tenant; o `promptManager` filtra `is_active = true` (`prompt-manager.ts:105-116`).
  - `low` `reject` [intent] A lista de provas nunca chega preenchida (o ramo "com provas" só existe como texto) — por desenho: o épico diz que a 24.7 (Provas) alimenta a 24.8, e a 24.7 está em backlog. O ramo "sem provas" é o comportamento certo enquanto ela não existe, e o ramo "com provas" é testado na renderização.
  - `false` `reject` [intent] A garantia "nenhuma campanha invente" só é verificada no texto do template — refutação parcial: houve smoke com LLM real (corpo e follow-up sem números/cases). A saída do LLM não é determinística, e o revisor automático de saída é a 24.9.
  - `low` `reject` [intent] Testes existentes do icebreaker foram reescritos — os dois asserts fixavam o texto com colchetes que a story remove. Os testes dos fluxos de geração do editor ficaram intactos e verdes.
  - `low` `defer` [intent] AC3 sob a leitura ampla: as linhas inativas globais com instruções antigas não foram atualizadas — mesmo grupo do achado das linhas inativas acima (defer).
  - `false` `reject` [intent] `tone_application` não foi tocado — refutação: ele só reescreve um texto já gerado mantendo o significado ("Não adicione informações novas"), sem estrutura, provas nem CTA.

### 2026-10-19 — Review pass
- verdicts: 23 findings — high 0, medium 2, low 14, false 7, maybe-false 0
- findings:
  - `low` `patch` [blind] O JSDoc de `buildSequenceFollowUpPlan` diz que ela é a "fonte única do plano para o agente", mas o agente (`create-campaign-step.ts:993`) acumula `anglesUsed` sozinho e chama `buildFollowUpPlan` — comentário corrigido: a função é usada pelo editor manual e o agente acumula a mesma lista.
  - `medium` `reject` [blind] `whatsapp_message_generation`, `monitoring_approach_suggestion`, `opportunity_next_step` e `tone_application` não ganharam REGRA DE PROVAS — fora do escopo pela própria intenção ("Não mexer em… prompts de monitoramento/oportunidade/WhatsApp/reply"); `tone_application` já foi refutado na passada anterior (só reescreve texto pronto, sem adicionar informação).
  - `medium` `patch` [blind] No corpo, "PRIORIDADE MÁXIMA: imite a estrutura", "Copie o fluxo: como abrem" e "CTA similar" dos exemplos competiam com a ordem problema-primeiro e o CTA de baixo atrito (a precedência só existia para provas) — a regra 5 agora diz que a ordem e o CTA de baixo atrito prevalecem sobre exemplos e diretrizes, e o bloco de exemplos ganhou a exceção explícita; teste em `honest-prompts.test.ts`.
  - `low` `reject` [blind] O bloco "sem provas" pode inibir o icebreaker premium de citar números do próprio post do lead — a regra 9 já isenta o conteúdo dos posts logo antes do bloco, e o efeito, se houver, é na direção segura (o quebra-gelo cita o tema sem o número). O bloco precisa ser idêntico em todos os prompts, então qualificá-lo mexe nos 7.
  - `low` `reject` [blind] carried — O teste novo usa cópia local do `interpolateTemplate` — padrão dos testes vizinhos; a cópia é idêntica à real; exportar o método privado criaria superfície pública nova.
  - `false` `reject` [blind] carried — O editor pode lançar `RangeError` em posição inválida — `getPreviousEmailBlock` devolve `null` na primeira posição e ordena pelo mesmo `position`, então com e-mail anterior `emailIndex >= 2`; no hook o caminho exige `i > 0`.
  - `low` `patch` [blind] Em sequências com 8+ e-mails o ciclo de ângulos se repete e "Ângulos já usados" lista INSIGHT DO SETOR duas vezes (o mesmo vale para o agente) — `buildFollowUpPlan` remove duplicatas com `Set` antes de montar o texto; teste com 9 e-mails em `campaign-copy.test.ts`.
  - `low` `reject` [blind] carried — Lacunas de robustez nos testes (caso `used: null` sem assert negativo, chamadas por ordem, sufixo de último e-mail no hook) — estilo de teste sem defeito escondido; o sufixo "(ÚLTIMO e-mail da sequência)" já é coberto em `campaign-copy.test.ts`.
  - `low` `reject` [blind] carried — `authorized_proofs` fixo em `""` sem caminho registrado para a 24.7 — por desenho: a intenção manda `""` nesta story e a 24.7 preenche.
  - `false` `reject` [edge] carried — `block.id` ausente → `findIndex` -1 → `emailIndex` 0 → `RangeError` — o bloco renderizado vem da própria lista `blocks` da store e o plano só é montado com e-mail anterior encontrado pelo mesmo `position`.
  - `low` `reject` [edge] carried — `buildSequenceFollowUpPlan` conta posições 2..n-1 mesmo quando são e-mails `initial` — mesmo achado do "ângulos já usados" da passada anterior; efeito é só o modelo evitar um ângulo não usado.
  - `low` `patch` [edge] Ângulo duplicado na lista para total >= 8 — mesmo grupo do achado de duplicatas acima (dedupe em `buildFollowUpPlan`).
  - `low` `reject` [edge] carried — Hook: sequência mista gera lista de ângulos diferente da do agente — mesmo achado.
  - `low` `reject` [edge] carried — `EmailBlock`: geração bloco a bloco depois de um e-mail `initial` no meio cita ângulos não usados — mesmo achado.
  - `low` `reject` [intent] carried — Os testes renderizam com cópia do interpolador, não com `promptManager.renderPrompt` — mesmo achado da cópia local acima.
  - `low` `reject` [intent] Os testes do editor e do hook param no mock e não renderizam template + estratégia juntos — os templates e as estratégias são verificados separadamente contra a lista de frases banidas, e a junção é concatenação de variável; não há defeito escondido.
  - `false` `reject` [intent] `COMMON_RULES` contém "viu meu e-mail?" e "conseguiu ver?" — refutação: aparecem só dentro de "NÃO mencione nem pergunte sobre e-mails anteriores (nada de …)", como proibição.
  - `low` `reject` [intent] Os prompts renderizados no agente e em `/api/ai/campaign-structure` não são testados — recebem `authorized_proofs` por `buildAIVariables` (testado) e o bloco é o mesmo template testado; o smoke com LLM real cobriu corpo e follow-up.
  - `low` `reject` [intent] carried — Sequência mista (R4c) diverge do plano do agente — mesmo achado do "ângulos já usados".
  - `false` `reject` [intent] O agente também mudou (RECURSO ÚTIL e cláusula de provas em `COMMON_RULES`) — refutação: a intenção manda o manual usar o plano do agente sem pedir case/dado novo; o plano é compartilhado, então a correção só existe nele. Nada da lista "Never" foi tocado.
  - `false` `reject` [intent] Os icebreakers foram reescritos além da regra de provas — refutação: a intenção pede reescrever icebreaker padrão e premium para abrir pelo contexto do lead.
  - `false` `reject` [intent] O assunto inicial agora proíbe abrir pelo produto, além do texto da intenção — refutação: a intenção inclui o assunto entre os prompts que abrem pelo problema/contexto do lead.
  - `false` `reject` [intent] carried — A saída real do LLM (R3) não é exercitada — houve smoke com LLM real; o revisor automático de saída é a 24.9.

## Design Notes

- **Por que `{{#if authorized_proofs}}` com `{{else}}`:** o editor e rotas antigas podem chamar o prompt sem a variável; o `{{else}}` garante a regra "sem provas" e evita o literal vazar. Exemplo do bloco:
  ```
  {{#if authorized_proofs}}
  PROVAS AUTORIZADAS (LISTA FECHADA — ÚNICAS QUE PODEM SER CITADAS):
  {{authorized_proofs}}
  REGRA DE PROVAS: só cite números, cases, clientes ou certificações que estejam EXATAMENTE nesta lista, sem alterar valores. Se nenhuma for relevante, não cite nenhuma.
  {{else}}
  REGRA DE PROVAS: nenhuma prova foi fornecida. NÃO cite números, porcentagens, cases, clientes, resultados nem certificações.
  {{/if}}
  ```
- **Reuso de `campaign-copy.ts` no editor:** o módulo é puro e já é a regra de follow-up do agente; duplicar o texto recriaria a divergência que a 24.6 deixou. A mudança de comportamento no manual (sem "RE:", sem "viu meu e-mail?") é intencional pelo épico.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/ai/prompts __tests__/unit/lib/agent __tests__/unit/components/builder/EmailBlock.test.tsx __tests__/unit/hooks __tests__/unit/lib/services/knowledge-base-context.test.ts` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Smoke com LLM real (script descartável no scratchpad, `npx tsx --env-file=.env.local`): renderizar `email_body_generation` e `follow_up_email_generation` code-default com KB de exemplo e `authorized_proofs: ""`, gerar 1 vez cada, e conferir que a saída não tem números/porcentagens/cases e que o corpo abre pela dor. Sem Apollo, sem Instantly, sem escrita no banco.

## Completion Notes

**O que pode mudar para o cliente:**
- Prompts code-default (`src/lib/ai/prompts/defaults.ts`): `email_subject_generation`, `email_body_generation`, `icebreaker_premium_generation`, `icebreaker_generation`, `follow_up_email_generation`, `follow_up_subject_generation` e `campaign_structure_generation`. Entra a constante `PROOF_RULE_BLOCK` (REGRA DE PROVAS) em todos eles. Muda o texto gerado no agente, no editor manual (bloco a bloco e geração completa) e na rota `campaign-structure`: abre pelo problema do lead, produto em até 2 frases, CTA de sim/não, sem números/cases (não há provas ainda), assunto de follow-up sem `RE:`/"viu meu email?", estruturas de campanha sem prova social/escassez/oferta direta.
- `src/lib/services/knowledge-base-context.ts`: variável nova `authorized_proofs`, sempre `""` (a 24.7 preenche).
- `src/lib/agent/campaign-copy.ts`: `buildSequenceFollowUpPlan(n, total)` novo; `COMMON_RULES` passa a dizer "só cite provas que estejam na REGRA DE PROVAS do prompt, se houver".
- `src/components/builder/EmailBlock.tsx` e `src/hooks/use-ai-full-campaign-generation.ts`: os follow-ups manuais usam o plano do agente ("Email n de N", ângulos INSIGHT DO SETOR → PERGUNTA → … → ENCERRAMENTO). Saem as estratégias "CONFIRMAR VISUALIZAÇÃO", "AGENDA CORRIDA", "RE: SIMPLES", "RE: COM VARIAÇÃO" e "traga um case de sucesso". Mudança intencional pelo épico. Diferença de comportamento: o 5º e-mail de uma sequência com mais de 5 deixa de ser tratado como último; só o último de fato é ENCERRAMENTO (igual ao agente).
- Não foram tocados: tabelas/migrations, `ai_prompts`, jobs `pg_cron`, Edge Functions, secrets, `export-step.ts`, `instantly.ts`, mapeamento de variáveis, prompts de monitoramento/oportunidade/WhatsApp/reply e `search_translation`. Nenhuma chamada de LLM nova.

**Prompts customizados no banco (`ai_prompts`), levantamento somente leitura em 2026-10-19 (`scripts/db-ro.sh`):** 8 linhas, todas globais (`tenant_id` nulo) e todas `is_active = false`: `email_body_generation` v5, `email_subject_generation` v5, `follow_up_email_generation` v1 (2 linhas), `follow_up_subject_generation` v1, `icebreaker_generation` v4, `icebreaker_premium_generation` v1, `tone_application` v1. Nenhum prompt por tenant e nenhum ativo, então o `promptManager` usa os code defaults e nenhuma migração de prompt é necessária.

**Os 3 pontos, conferidos por análise do diff:**
1. Campanhas rodando, webhook e `reply-sweep`: nenhum desses arquivos foi tocado. Continuam funcionando.
2. Busca de leads: `search_translation` e os arquivos de busca não foram tocados. Continua funcionando.
3. Criação de campanha e export/ativação no Instantly: o export e o mapeamento de variáveis são os mesmos, e não entrou nenhuma trava ou filtro. Muda só o conteúdo gerado. `buildSequenceFollowUpPlan` lança `RangeError` só para posição inválida (n < 2 ou n > total), que os dois chamadores manuais não produzem (só é chamado quando há e-mail anterior); se acontecesse, cairia no tratamento de erro de geração já existente, sem afetar export.

**Verificação:**
- `npx vitest run` nas pastas da spec: verde. `npm run lint`: 0 erros (warnings pré-existentes). `npm run typecheck`: limpo. `npm run test:run`: 417 arquivos, todos passando.
- Testes novos: `__tests__/unit/lib/ai/prompts/honest-prompts.test.ts` (matriz I/O nos 7 templates, ordem dos marcadores, CTA, RE:, estrutura), casos de `buildSequenceFollowUpPlan` em `campaign-copy.test.ts`, follow-up 2/3/4 de 4 em `EmailBlock.test.tsx` e `use-ai-full-campaign-generation.test.tsx`, `authorized_proofs === ""` em `knowledge-base-context.test.ts`.
- Ajustado `icebreaker-prompt-refactor.test.ts`: dois asserts fixavam o texto antigo com colchetes (`TEMA ESPECÍFICO DO POST`, "Oportunidade de negócio:"/"Crescimento da empresa:"), que a spec manda remover.
- Smoke com LLM real (gpt-4o-mini, script descartável no scratchpad, sem banco/Apollo/Instantly): `email_body_generation` e `follow_up_email_generation` (Email 3 de 4) code-default com KB de exemplo e `authorized_proofs: ""`. Corpo abriu pela dor do ICP, produto em 2 frases, CTA "Faz sentido para vocês?", sem números/porcentagens/cases. Follow-up foi uma pergunta sobre a dor, sem números e sem citar o e-mail anterior.

**Risco observado (fora do escopo):** no smoke, o corpo manual terminou com a assinatura `[Seu Nome]`. O agente remove colchetes em `cleanAgentEmailCopy`, mas o editor manual não. Já era assim antes desta story.

## Auto Run Result

Status: done

**Resumo:**
- Os 7 prompts de copy (assunto, corpo, icebreaker padrão e premium, follow-up corpo e assunto, estrutura de campanha) têm um bloco único de REGRA DE PROVAS (`PROOF_RULE_BLOCK`): com lista, só ela pode ser citada; sem lista (hoje sempre), nenhum número, case, cliente ou certificação.
- O corpo abre pelo problema do lead (`[PROBLEMA DO LEAD]`), o produto entra em até 2 frases e o CTA é uma pergunta de sim/não. Nesta passada, a ordem e o CTA passaram a prevalecer também sobre os exemplos do tenant.
- `authorized_proofs` entra em `buildAIVariables` como `""` até a 24.7.
- O editor manual (bloco a bloco e geração completa) usa o plano de follow-up do agente (`buildSequenceFollowUpPlan`).

**Arquivos:**
- `src/lib/ai/prompts/defaults.ts` — 7 prompts reescritos, `PROOF_RULE_BLOCK` e, nesta passada, precedência da ordem/CTA sobre os exemplos no corpo.
- `src/lib/services/knowledge-base-context.ts` — variável `authorized_proofs`.
- `src/lib/agent/campaign-copy.ts` — `buildSequenceFollowUpPlan`; nesta passada, ângulos usados sem duplicata e JSDoc corrigido.
- `src/components/builder/EmailBlock.tsx`, `src/hooks/use-ai-full-campaign-generation.ts` — follow-ups manuais com o plano do agente.
- Testes: `honest-prompts.test.ts`, `campaign-copy.test.ts` (2 testes novos nesta passada) e os demais da primeira passada.

**Revisão de acompanhamento (23 achados):**
- 0 high, 2 medium, 14 low, 7 false.
- Patches (3 entradas): precedência de ordem/CTA sobre os exemplos (medium), ângulos duplicados em sequências longas (low, 2 achados), JSDoc de `buildSequenceFollowUpPlan` (low).
- Adiados: nenhum novo (as linhas inativas de `ai_prompts` seguem no `deferred` da primeira passada).
- Rejeitados, com motivo no Review Triage Log: prompts de WhatsApp/monitoramento/oportunidade (fora do escopo pela intenção), regra de provas no icebreaker premium vs. números do post (direção segura), cópia do interpolador, `RangeError` (false, 2), robustez de testes, `authorized_proofs` fixo (24.7), sequência mista (5 linhas, carried), testes que param no mock, renders do agente/estrutura, `COMMON_RULES` (false), mudanças no agente/icebreaker/assunto (false), saída real do LLM (false).

**Follow-up review recomendado:** `false` — passada de acompanhamento sem patch high (patches: 1 medium, 2 low).

**Verificação:**
- Testes focados (`__tests__/unit/lib/ai/prompts`, `lib/agent`, `EmailBlock`, `hooks`, `knowledge-base-context`): 109 arquivos, 2068 testes verdes.
- `npm run lint`: 0 erros (134 warnings pré-existentes). `npm run typecheck`: limpo. `npm run test:run`: 417 arquivos, 7921 passando e 2 skipped.
- Sem LLM real nesta passada: os patches mudam só texto de instrução e a montagem da lista de ângulos.

**Os 3 pontos da Regra nº 1:** conferidos por análise do diff. Os patches desta passada tocam só texto de prompt (`defaults.ts`) e o texto da estratégia de follow-up (`campaign-copy.ts`). Campanhas rodando, webhook/`reply-sweep`, busca de leads e export/ativação no Instantly não foram tocados. Nada no banco, nenhum job, nenhuma Edge Function.

**Riscos residuais:**
- O texto novo de precedência (ordem/CTA sobre os exemplos) não passou por LLM real; tenants com exemplos que pedem reunião podem ver o modelo dividir a diferença.
- O editor manual não remove colchetes (`[Seu Nome]`), pré-existente.
- Em sequência mista (initial + follow-up), a lista de "ângulos já usados" pode citar ângulo não usado.


## Smoke em produção (2026-10-19)

Deploy via PR #9 (merge `5aee72c` na `main`, Vercel prod OK). Fabossi rodou o agente em produção no modo Guiado (execução `ade2e314-2a7a-441b-956e-7da53a6bdfd0`, cargo CISO em São Paulo, 1 lead aprovado de 25) e confirmou na tela: estimativa no plano, e-mails abrindo pelo problema do lead sem números/cases inventados, CTA de sim/não e status do revisor por e-mail. Conferido no banco com `scripts/db-ro.sh`:

- `agent_steps.cost` gravado em todos os steps (`apollo_search` 25, `apollo_enrich` 1, `openai_emails` 5, `openai_review` 13, `openai_structure` 1, `openai_icebreakers` 1, `instantly_create` 1, `instantly_leads` 1).
- `api_usage_logs` com `metadata.executionId` para cada chamada paga: OpenAI (parse do briefing, geração, 5 revisões de copy com custo), Apollo (busca e enrichment) e Instantly (export).
- `cost_actual` ficou vazio: a execução foi cancelada e o custo real só era gravado na conclusão ou na pausa. Corrigido em seguida: o cancelamento também grava o custo real ("Custo até o cancelamento").

**Efeito no cliente:** aprovar a etapa "Criação de Campanha" dispara o export. Este smoke e o do Marco 1 (execução `e4721592-…`, 09:42) criaram duas campanhas "Campanha Outbound - 19/10/2026" no Instantly (`55b91cdb-728a-4256-b4a9-6fe52d285c55` com 1 lead e `9d0624b0-9a3a-48c1-9a98-45deade6df84` com 20), **nenhuma ativada** (activate pendente, execuções canceladas). Limpeza no Instantly fica com Fabossi. Os leads foram para o segmento "Campanha Outbound - 19/10/2026". Próximos smokes param na etapa "Criação de Campanha", sem aprovar.
