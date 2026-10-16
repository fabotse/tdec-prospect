---
title: '24.6 — E-mails sem dados fictícios e follow-ups com valor'
type: 'bugfix'
created: '2026-10-16'
status: done
baseline_revision: '42dd9ae844b523a3dd2276d3cf150eba57bcd868'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      O fluxo manual de follow-up ainda usa as estratégias insistentes ("viu meu e-mail?", "RE:").
    evidence: |-
      use-ai-full-campaign-generation.ts:313-334 e EmailBlock.tsx:335-385 montam follow_up_strategy/subject_strategy com "CONFIRMAR VISUALIZAÇÃO" e "RE: SIMPLES". A 24.6 limitou a correção ao agente; o épico põe a correção de prompt do fluxo manual na 24.8.
    location: >-
      src/hooks/use-ai-full-campaign-generation.ts:313
    severity: medium
operator_actions:
  - "Rode uma execução real do agente (Guiado) até a revisão da campanha, sem exportar nem ativar, e confira que os e-mails gerados não têm 'Nome', 'Empresa', '[Sua', '[Seu', '{{follow_up_strategy}}' nem variável fora de {{first_name}}/{{company_name}}/{{title}}/{{ice_breaker}}, e que os follow-ups saem como 'Email 2 de N'... com ângulos diferentes; ou rode /private/tmp/claude-501/-Users-fabossi-Documents-Fabossi-Projects-TDec-Prospect/f6bfd665-e221-41f8-b43a-0f669a8c45b8/scratchpad/smoke-24-6.ts com uma OPENAI_API_KEY válida (a do .env.local devolve 401)."
---

<intent-contract>

## Intent

**Problem:** Na geração de campanha do agente, `buildAIVariables` injeta defaults fictícios (`lead_name: "Nome"`, `lead_company: "Empresa"`, `lead_industry: "Tecnologia"`, `lead_location: "Brasil"`). Como `lead_name` vem preenchido, os prompts saem do MODO TEMPLATE e o e-mail fala "Oi Nome". Os icebreakers trocam o setor do lead pelo `target_industries` do tenant. Os follow-ups não recebem `follow_up_strategy` nem `subject_strategy`, então o modelo lê os literais `{{follow_up_strategy}}`/`{{subject_strategy}}`. A numeração usa `item.position`, que conta os delays, e por isso sai "Email 5 de 4". Nada limpa a saída do LLM antes dela virar o template do Instantly (`[Seu nome]`, `{{lead_name}}`, `{{Nome}}`).

**Approach:** Criar o módulo puro `src/lib/agent/campaign-copy.ts`, com: variáveis de lead vazias (MODO TEMPLATE), plano de follow-up por posição (ângulo explícito e diferente por posição, numeração só entre e-mails) e limpeza determinística da saída. Usar esse módulo em `create-campaign-step.ts`. O fluxo manual e `buildAIVariables` não mudam.

## Boundaries & Constraints

**Always:**
- As únicas variáveis válidas no texto final são as que o export já envia ao Instantly (`variable-registry.ts` → `PLATFORM_MAPPINGS.instantly`): `{{first_name}}`, `{{company_name}}`, `{{title}}` e `{{ice_breaker}}`. Aliases conhecidos (`{{Nome}}`, `{{firstName}}`, `{{companyName}}`, `{{lead_name}}`, `{{lead_company}}`, `{{lead_title}}`, `{{icebreaker}}`…) são normalizados para elas. Qualquer outra `{{x}}` é removida.
- Dado de lead ausente é omitido (string vazia) e nunca recebe valor inventado. O setor e a localização do lead nunca vêm do ICP/tenant (`SearchLeadResult` não tem esses campos, então ficam `""`).
- Numeração: `Email {n} de {total}`, com `n` = índice 1-based entre os itens `type: "email"` e `total` = quantidade desses itens. O primeiro item de e-mail é sempre o inicial.
- Toda estratégia de follow-up proíbe referenciar o e-mail anterior ("viu meu e-mail?", "conseguiu ver?"), inventar números, cases ou clientes, e usar colchetes ou variáveis fora das quatro válidas.
- Falha de LLM continua com o tratamento atual (`ExternalServiceError` → `PipelineError`). Nenhuma chamada paga nova.

**Never:**
- Não alterar `buildAIVariables`, `prompts/defaults.ts`, prompts do banco (`ai_prompts`), `EmailBlock.tsx`, `use-ai-full-campaign-generation.ts` nem o fluxo manual. Correção de prompt e fluxo manual ficam para a 24.8.
- Não mudar `export-step.ts`, `instantly.ts`, o mapeamento de leads nem a sintaxe de variáveis enviada ao Instantly. Nenhuma trava ou filtro novo no caminho até o Instantly.
- Sem migration, pg_cron, Edge Function ou secret. Sem chamada extra de LLM (nada de regenerar quando a limpeza encontra problema: limpa e segue).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Variáveis do e-mail | KB qualquer, lead ausente | Prompts de e-mail/estrutura recebem `lead_name/lead_title/lead_company/lead_industry/lead_location/icebreaker = ""` → MODO TEMPLATE | — |
| Icebreaker | lead `{name:"Ana Souza", title:null, companyName:"Acme"}`, ICP com industries | `lead_name:"Ana Souza"`, `lead_title:""`, `lead_company:"Acme"`, `lead_industry:""`, `lead_location:""` (padrão e premium) | — |
| Sequência 4 e-mails + 3 delays | positions 0..6 intercaladas | follow-ups recebem "Email 2 de 4", "Email 3 de 4", "Email 4 de 4" + "ÚLTIMO" | — |
| Estratégias | 4 e-mails | e-mail 2 = INSIGHT DO SETOR, 3 = PERGUNTA, 4 = ENCERRAMENTO; `follow_up_strategy` e `subject_strategy` sempre não vazios e diferentes entre posições | — |
| Sequência longa | 8 e-mails | e-mails 2..7 percorrem os 5 ângulos do meio em ordem (o 7 volta ao 1º); o 8 = ENCERRAMENTO | — |
| Só 1 e-mail | 1 item email | nenhum follow-up, nenhum plano gerado | — |
| Saída suja do LLM | `"Oi {{Nome}},\n\n[Sua empresa] ajuda {{companyName}}.\n\nAbs,\n[Seu nome]\n{{follow_up_strategy}}"` | `"Oi {{first_name}},\n\najuda {{company_name}}.\n\nAbs,"` — sem `[`, `]`, `{{follow_up_strategy}}`, nem linhas vazias sobrando | — |
| Assunto sujo | `"Assunto: \"{{lead_name}}, ideia para [Empresa]\""` | `"{{first_name}}, ideia para"` | — |

</intent-contract>

## Code Map

- `src/lib/agent/steps/create-campaign-step.ts` -- alvo principal.
  - `:176` `const aiVars = buildAIVariables(kbContext, product)`: espalhar `TEMPLATE_LEAD_VARIABLES` por cima para estrutura e e-mails (`:192-196`, `generateEmailBlocks`).
  - `:833-840` (premium) e `:891-899` (padrão): trocar `aiVars.target_industries || "Tecnologia"` por `""` e `aiVars.lead_location || "Brasil"` por `""`. `lead_title`/`lead_company` continuam `?? ""`.
  - `:920-1001` `generateEmailBlocks`: hoje `isFollowUp = emailMode === "follow-up" || position > 0` e `sequence_position: Email ${item.position + 1} de ${emailItems.length}`. Passar a iterar com índice: `index === 0` → inicial; senão `buildFollowUpPlan(index + 1, emailItems.length, anglesUsed)` alimenta `sequence_position`, `follow_up_strategy` e `subject_strategy`. Limpar subject/body com `cleanAgentEmailCopy` antes de `push` e antes de virar `previousSubject/previousBody`. `emailMode` no output segue o índice.
- `src/lib/agent/campaign-copy.ts` -- NOVO, puro, sem I/O. Exporta `TEMPLATE_LEAD_VARIABLES`, `SUPPORTED_EMAIL_VARIABLES`, `buildFollowUpPlan`, `cleanAgentEmailCopy(text, kind: "subject" | "body")` e `findUnsupportedCopyTokens(text)` (lista o que sobrou: `{{x}}` fora das válidas, `[...]`, `"Nome"`/`"Empresa"` como palavra isolada; serve aos testes).
- `src/lib/ai/sanitize-ai-output.ts` -- REUSO, somente leitura: `sanitizeGeneratedSubject`, `sanitizeGeneratedBody` e `normalizeTemplateVariables` (já mapeia nome/empresa/firstname/companyname/cargo/icebreaker). Não editar, porque é usado pelo fluxo manual.
- `src/lib/export/variable-registry.ts:80-86` -- evidência, somente leitura: o Instantly recebe `{{first_name}}`/`{{company_name}}`/`{{title}}`/`{{ice_breaker}}`, e `instantly.ts:524-532` grava esses campos no lead.
- `src/lib/ai/prompt-manager.ts:235-258` -- evidência: uma variável ausente fica literal (`?? match`), e `{{#if x}}` com valor vazio cai no `{{else}}` (MODO TEMPLATE).
- `src/lib/ai/prompts/defaults.ts:502-680` -- evidência, somente leitura: `follow_up_email_generation` usa `{{follow_up_strategy}}` e `{{sequence_position}}`; `follow_up_subject_generation` usa `{{subject_strategy}}`.
- `src/hooks/use-ai-full-campaign-generation.ts:313-334` -- referência do fluxo manual (estratégias por posição). Não reusar o texto: os ângulos dele ("confirmar visualização", "RE:") são justamente os insistentes que a story remove.
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` -- testes existentes (`:506` KB vazio, `:736` follow-up) que precisam continuar verdes. Os novos casos entram aqui.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/agent/campaign-copy.ts` -- criar o módulo. Ângulos do meio, em ordem: INSIGHT DO SETOR, PERGUNTA, RECURSO ÚTIL, CUSTO DE NÃO AGIR, OUTRA PERSPECTIVA. O último e-mail (n === total, total ≥ 2) é sempre ENCERRAMENTO. O plano devolve `{ angle, sequencePosition, followUpStrategy, subjectStrategy }`, e `followUpStrategy` cita os ângulos já usados para evitar repetição. Limpeza na ordem: prefixo (`sanitizeGenerated*`) → aliases → `normalizeTemplateVariables` → remover `{{x}}` não suportada → remover `[...]` (linha só com placeholder sai inteira; inline sai o token) → arrumar espaços duplos, espaço antes de pontuação, 3+ quebras → trim. Assunto: tirar aspas/pontuação sobrando nas pontas. -- fonte única e testável da regra de copy do agente.
- [x] `src/lib/agent/steps/create-campaign-step.ts` -- aplicar as mudanças do Code Map. -- corrige "Oi Nome", setor trocado, literal vazando e "5 de 4".
- [x] `__tests__/unit/lib/agent/campaign-copy.test.ts` -- NOVO: cobrir todas as linhas da matriz I/O de `buildFollowUpPlan` e `cleanAgentEmailCopy`, além de `findUnsupportedCopyTokens` em texto limpo (vazio) e sujo. -- trava a regra.
- [x] `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` -- adicionar: (a) variáveis passadas a `email_subject_generation`/`email_body_generation`/`campaign_structure_generation` têm `lead_name === ""` etc.; (b) icebreaker com ICP preenchido recebe `lead_industry === ""` e `lead_location === ""`; (c) estrutura com delays intercalados (4 e-mails) → `sequence_position` "Email 2 de 4"…"Email 4 de 4", `follow_up_strategy`/`subject_strategy` não vazios e distintos; (d) com o LLM mockado devolvendo texto sujo (`Nome`, `[Sua empresa]`, `{{follow_up_strategy}}`, `{{lead_name}}`), o `emailBlocks` final tem `findUnsupportedCopyTokens` vazio. Ajustar asserções antigas só onde elas fixavam o comportamento bugado. -- AC na superfície do step (output gravado e exportado).

**Acceptance Criteria:**
- Given a geração de campanha pelo agente, when as variáveis de IA são montadas para estrutura, e-mails e icebreakers, then nenhum valor fictício de `buildAIVariables` ("Nome", "Cargo", "Empresa", "Tecnologia", "Brasil") chega ao prompt, e o setor do lead nunca vem do ICP do tenant.
- Given uma estrutura com N e-mails intercalados com delays, when cada follow-up é gerado, then ele recebe "Email n de N" (n ≤ N) e estratégias de corpo e de assunto explícitas, não vazias e diferentes das posições anteriores (dentro do ciclo de 5 + encerramento).
- Given o output `emailBlocks` do step (o que vai ao Instantly), when ele é verificado, then não contém "Nome", "Empresa", "[Sua", "[Seu", `{{follow_up_strategy}}`, `{{subject_strategy}}` nem `{{x}}` fora de `first_name/company_name/title/ice_breaker`.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 34 findings — high 0, medium 7, low 24, false 3, maybe-false 0
- findings:
  - `low` `patch` [blind] Alias com espaço (`{{Primeiro Nome}}`) era apagado em vez de mapeado — `applyAliases` passou a reescrever a chave normalizada para o `normalizeTemplateVariables`; teste adicionado.
  - `low` `patch` [blind] Com 8+ e-mails, o e-mail 7 recebia INSIGHT DO SETOR e "não repita INSIGHT DO SETOR" no mesmo texto — o ângulo atual saiu da lista de já usados; teste no caso de 8.
  - `low` `reject` [blind] `[Sua empresa]` inline é removido em vez de mapeado e deixa a frase sem sujeito — é o comportamento que a matriz pede. As estratégias proíbem colchetes, então o caso real é a assinatura. Mapear exigiria heurística nova (remetente × lead).
  - `medium` `patch` [blind] Texto que vira vazio depois da limpeza não tem fallback — assunto vazio recebe fallback fixo válido e corpo vazio lança `ExternalServiceError` 502 (retryable); testes.
  - `low` `patch` [blind] `RE:`/`FW:` não eram removidos do assunto — a limpeza de assunto tira `RE:/FW:/FWD:/ENC:` do início; teste.
  - `low` `patch` [blind] `COMMON_RULES` permitia `{{ice_breaker}}` nos follow-ups, e o assunto aceitava essa variável — a regra agora lista só 3 variáveis e o assunto remove `{{ice_breaker}}`; teste.
  - `low` `reject` [blind] `BARE_PLACEHOLDER` pode reescrever prosa legítima ("Nome, cargo…") — com as variáveis de lead vazias, a fonte de "Nome"/"Empresa" sumiu, e o falso positivo é improvável em cold email. Apertar o padrão é heurística nova.
  - `low` `reject` [blind] Tirar `[Seu nome]` deixa o e-mail sem assinatura — a assinatura vem da conta remetente no Instantly. Inventar nome é o que a story proíbe.
  - `low` `reject` [blind] Faltam as Completion Notes da Regra nº 1 — a correção é editar a spec (rejeitado pela regra de triagem). Elas foram escritas na finalização mesmo assim, como exige o CLAUDE.md.
  - `low` `patch` [blind] Lacunas de teste no step (1º item com `emailMode: follow-up`, default "Cargo") — teste novo de estrutura que começa com delay e follow-up rotulado. O `lead_title === ""` já era afirmado.
  - `low` `reject` [blind] `tidyLine` tira a indentação e remove `[1]`/links markdown — o e-mail é texto puro, sem listas indentadas nem markdown. É improvável, e a correção precisaria de heurística.
  - `medium` `patch` [edge] Só placeholder → assunto/corpo vazio em `campaign-copy.ts` — mesmo grupo do fallback acima.
  - `medium` `patch` [edge] Bloco vazio em `create-campaign-step.ts` vai ao Instantly e vira contexto do próximo follow-up — mesmo grupo do fallback.
  - `low` `reject` [edge] "Oi Nome tudo bem?" (sem pontuação) sobrevive — a fonte (lead fictício) foi removida, então só aparece se o LLM alucinar o literal. É improvável, e cobrir exigiria heurística.
  - `low` `reject` [edge] "Qual a sua Empresa?" vira variável — mesmo raciocínio do `BARE_PLACEHOLDER` acima.
  - `low` `reject` [edge] `{Nome}`/`{{{first_name}}}` passam — o LLM não costuma produzir essas sintaxes. Seria heurística nova.
  - `low` `reject` [edge] Variável removida no meio da frase quebra a gramática — as estratégias e o MODO TEMPLATE só pedem as 4 variáveis. É improvável.
  - `low` `reject` [edge] Link markdown perde o texto — e-mail em texto puro; é improvável.
  - `low` `patch` [edge] `RE:`/`FW:` não removidos — mesmo grupo do patch de prefixo.
  - `low` `patch` [edge] `emailItems` não era ordenado por `position` — agora é ordenado numa cópia; teste com estrutura fora de ordem.
  - `medium` `patch` [edge] Icebreakers iam ao Instantly sem limpeza (`[proposta de valor]`) — `cleanIcebreakerText` remove `[...]` e qualquer `{{x}}` nos dois caminhos (padrão e premium); se ficar vazio, conta como falha; teste.
  - `low` `reject` [edge/claim] "Nome" ainda pode chegar ao template — duplicado do "Oi Nome tudo bem?".
  - `low` `reject` [edge/claim] Sintaxe malformada de chaves passa sem ser detectada — duplicado do `{Nome}`.
  - `low` `patch` [edge/claim] O primeiro e-mail não era o primeiro por `position` — mesmo grupo da ordenação.
  - `low` `patch` [verification-gap] Sem teste no step para "1º item é sempre o inicial" com delay na frente e `emailMode: follow-up` — teste adicionado ("Email 2 de 2", `emailMode` `["initial","follow-up"]`).
  - `low` `reject` [verification-gap/other] "Oi Nome tudo bem" sobrevive — duplicado do achado do edge acima.
  - `medium` `patch` [verification-gap/other] Assunto vazio sem fallback — mesmo grupo do fallback.
  - `medium` `reject` [intent] O AC3 pede "campanha real gerada", mas os testes usam LLM mockado — não é defeito de código. O smoke com LLM real não rodou aqui (a `OPENAI_API_KEY` do `.env.local` devolve 401) e virou `operator_actions` (status `awaiting-operator`).
  - `low` `reject` [intent] O prompt renderizado não é testado (MODO TEMPLATE via `{{#if}}`) — o comportamento de `prompt-manager.ts:244-251` já existia e é coberto pelos testes dele; aqui só mudam os valores.
  - `false` `reject` [intent] O AC cita `{{firstName}}` e o diff emite `{{first_name}}` — refutação: `variable-registry.ts` (`PLATFORM_MAPPINGS.instantly`) e `instantly.ts:524-532` usam snake_case, e `{{firstName}}` é a forma do Snov.io. A decisão está nas Design Notes.
  - `false` `reject` [intent] `target_industries` do tenant ainda chega ao prompt (R1f) — refutação: ele entra como bloco "ICP", não como setor do lead. O `lead_industry` agora fica vazio em todos os caminhos.
  - `medium` `defer` [intent] O fluxo manual (`use-ai-full-campaign-generation.ts`, `EmailBlock.tsx`) mantém as estratégias insistentes ("viu meu e-mail?", "RE:") — é pré-existente e não foi causado por esta mudança. O épico põe a correção de prompt do fluxo manual na 24.8.
  - `false` `reject` [intent] O step ignora `item.emailMode` do LLM — refutação: a spec exige "o primeiro item de e-mail é sempre o inicial", e o teste fixa esse comportamento.
  - `low` `reject` [intent] Colchetes removidos às cegas — duplicado do `tidyLine`/markdown.

## Design Notes

- **`{{firstName}}` no AC × `{{first_name}}` no código:** o AC cita `{{firstName}}`/`{{companyName}}` como exemplo de "variável do Instantly". Neste repo, o export (fluxo manual e agente) já grava `first_name`/`company_name` no lead e usa `{{first_name}}`/`{{company_name}}` no template (`variable-registry.ts`, `instantly.ts:524`). Trocar a sintaxe mexeria no caminho até o Instantly (proibido pela Regra nº 1). Seguimos o registro, que é a fonte única. A forma camelCase passa a ser normalizada e nunca fica no texto.
- **Por que não alterar `buildAIVariables`:** ele também alimenta `campaign-structure/route.ts` e `use-knowledge-base-context` (fluxo manual). O AC é do agente, e a 24.8 cuida de prompts e fluxo manual. Sobrescrever no agente resolve sem risco para o cliente.
- **Limpar em vez de regenerar:** regenerar custaria uma chamada de LLM a mais, e o revisor automático com reescrita é a 24.9. Aqui a limpeza é determinística e barata.
- Exemplo de plano (n=3, total=4): `{ angle: "PERGUNTA", sequencePosition: "Email 3 de 4", followUpStrategy: "PERGUNTA: faça UMA pergunta curta e específica sobre como {{company_name}} lida hoje com <dor>… Ângulos já usados: INSIGHT DO SETOR. …regras comuns", subjectStrategy: "Pergunta curta, sem RE:, ≤ 50 caracteres…" }`.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent/campaign-copy.test.ts __tests__/unit/lib/agent/steps/` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Smoke real (se houver `OPENAI_API_KEY` local): script descartável no scratchpad que roda `generateEmailBlocks` com prompts code-default e LLM real (sem Apollo, sem Instantly, banco só leitura) e passa a saída em `findUnsupportedCopyTokens`. Se não for possível, a execução real no app fica como ação do operador.

## Completion Notes

**O que pode mudar para o cliente:**
- Muda só o step de criação de campanha do agente (`src/lib/agent/steps/create-campaign-step.ts`) e entra o módulo puro novo `src/lib/agent/campaign-copy.ts`.
- O que muda no texto gerado pelo agente:
  - os e-mails saem em MODO TEMPLATE (`{{first_name}}`/`{{company_name}}`) em vez de "Nome"/"Empresa";
  - os icebreakers não recebem mais o setor do ICP nem "Brasil";
  - os follow-ups ganham numeração e ângulo explícitos;
  - a saída do LLM passa por uma limpeza;
  - um e-mail cujo corpo fique vazio depois da limpeza agora falha o step como retryable.
- Não foram tocados: rotas, prompts (`defaults.ts`/`ai_prompts`), tabelas/migrations, jobs `pg_cron`, Edge Functions, secrets, `export-step.ts`, `instantly.ts` e o fluxo manual.

**Os 3 pontos, conferidos por análise do diff (o smoke real ficou como ação do operador):**
1. Campanhas rodando, webhook e `reply-sweep`: nenhum desses arquivos foi tocado. Continuam funcionando.
2. Busca de leads (Apollo e demais fontes): nenhum arquivo de busca foi tocado. Continua funcionando.
3. Criação de campanha e export/ativação no Instantly: o export, o mapeamento de leads e a sintaxe de variáveis são os mesmos, e não entrou nenhuma trava ou filtro novo. Muda só o conteúdo do template gerado pelo agente. O único caminho novo de falha é um corpo de e-mail vazio depois da limpeza, que já sairia inválido; ele vira erro retryable, com "Tentar novamente" (24.3).

## Auto Run Result

Status: awaiting-operator

**Resumo:**
- O agente deixou de usar o lead fictício de `buildAIVariables`: as variáveis de lead vão vazias e os prompts caem no MODO TEMPLATE, com `{{first_name}}`/`{{company_name}}`.
- Os icebreakers usam o lead real, sem setor nem localização inventados.
- Cada follow-up recebe "Email n de N", contado só entre e-mails. Os ângulos vêm nesta ordem: INSIGHT DO SETOR, PERGUNTA, RECURSO ÚTIL, CUSTO DE NÃO AGIR, OUTRA PERSPECTIVA. O último e-mail é sempre ENCERRAMENTO.
- Os follow-ups recebem `follow_up_strategy` e `subject_strategy` explícitos.
- Assunto, corpo e icebreaker passam por uma limpeza determinística, que normaliza aliases, remove `{{x}}` não suportada, `[...]`, `RE:`/`FW:` e assinatura fictícia.

**Arquivos:**
- `src/lib/agent/campaign-copy.ts` — novo: variáveis de template, plano de follow-up, limpeza da copy e do icebreaker, e um detector de tokens inválidos.
- `src/lib/agent/steps/create-campaign-step.ts` — passa a usar o módulo: variáveis vazias, numeração por índice com e-mails ordenados por `position`, plano por posição, limpeza, fallback de assunto e erro retryable para corpo vazio.
- `__tests__/unit/lib/agent/campaign-copy.test.ts` — novo: cobre toda a matriz de I/O e os patches da revisão.
- `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts` — casos novos da 24.6 na superfície do step.

**Revisão (1 passada, 34 achados):**
- 0 high, 7 medium, 24 low, 3 false.
- Patches aplicados (8 grupos):
  - alias com espaço;
  - ângulo repetido em sequência longa;
  - `{{ice_breaker}}` em follow-up e no assunto;
  - prefixo `RE:`/`FW:`;
  - fallback para cópia vazia (medium);
  - ordenação dos e-mails por `position`;
  - limpeza do icebreaker (medium);
  - teste do "1º e-mail é sempre o inicial".
- Adiado: fluxo manual com as estratégias insistentes (24.8).
- Rejeitados, com o motivo registrado no Review Triage Log:
  - heurísticas de "Nome"/"Empresa" sem pontuação;
  - colchetes inline;
  - markdown e indentação;
  - chaves malformadas;
  - gramática depois de remover variável;
  - assinatura;
  - Completion Notes (edição da spec);
  - grafia `{{firstName}}`;
  - `target_industries`;
  - `emailMode` ignorado;
  - prompt renderizado;
  - AC3 real, tratado como ação do operador.

**Follow-up review recomendado:** `true`. Nesta passada foram aplicados 2 patches medium e 6 low. O risco que não foi verificado são os dois caminhos novos de degradação, o erro retryable para corpo vazio e o icebreaker que vira `null` depois da limpeza, que ainda não passaram por revisão nem por LLM real.

**Verificação:**
- `npm run lint`: 0 erros (134 warnings pré-existentes).
- `npm run typecheck`: limpo.
- `npm run test:run`: 416 arquivos, 7833 testes passando e 2 skipped.
- Smoke com LLM real não executado: a `OPENAI_API_KEY` do `.env.local` devolve 401. O script ficou pronto no scratchpad, e a execução real ficou como ação do operador.

**Riscos residuais:**
- Este repo sempre exportou `{{first_name}}`/`{{company_name}}` ao Instantly, como já faz o fluxo manual. Vale confirmar no preview do Instantly que essas variáveis resolvem.
- Prompts customizados por tenant no banco podem ignorar as novas estratégias (24.8).
- "Nome"/"Empresa" sem pontuação depois, se o LLM alucinar, não são reescritos.

## Operator Confirmation

Confirmed 2026-10-16: the external actions this story owed were carried out.

- Rode uma execução real do agente (Guiado) até a revisão da campanha, sem exportar nem ativar, e confira que os e-mails gerados não têm 'Nome', 'Empresa', '[Sua', '[Seu', '{{follow_up_strategy}}' nem variável fora de {{first_name}}/{{company_name}}/{{title}}/{{ice_breaker}}, e que os follow-ups saem como 'Email 2 de N'... com ângulos diferentes; ou rode /private/tmp/claude-501/-Users-fabossi-Documents-Fabossi-Projects-TDec-Prospect/f6bfd665-e221-41f8-b43a-0f669a8c45b8/scratchpad/smoke-24-6.ts com uma OPENAI_API_KEY válida (a do .env.local devolve 401).

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
