---
title: '24.17 — Modo lista de contas (ABM)'
type: 'feature'
created: '2026-10-22'
status: done
baseline_revision: 'b182c8f438ee8dac6da62825db90290cbbad7d37'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A supressao do modo lista cobre so "negociacao" (oportunidade em contacted/meeting_booked); a classe "cliente" do AC3 nao tem fonte de dados.
    evidence: |-
      O epico pede remover conta suprimida "(cliente, negociacao)". Nao existe tabela de clientes nem lista de supressao (23.5 em backlog); a regra provisoria usa a Central de Oportunidades e casa pelo dominio do e-mail do lead. Resolver quando a 23.5 criar a lista de supressao: ler a tabela dentro de findSuppressedAccounts.
    location: >-
      src/lib/agent/account-suppression.ts (findSuppressedAccounts)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** O agente só sabe prospectar por cargo + localização (ou por tecnologia via TheirStack). Quem já sabe quais empresas quer atingir ("quero falar com o Banco X e a Empresa Y", ou uma lista de domínios colada) não tem como pedir isso. E nada impede que uma conta em negociação seja abordada de novo.

**Approach:** O parser do briefing passa a extrair `targetAccounts` (nome + domínio + confiança). Com contas no briefing, a execução entra no **modo lista de contas**: pula a busca de empresas e o `search_leads` busca por domínio (`q_organization_domains_list`, a mesma busca do fluxo por tecnologia), com os cargos do briefing ou, na falta deles, os do ICP. Domínio deduzido com dúvida aparece marcado "(confirme)" no card da 24.5. Domínio desconhecido trava o avanço e o agente pergunta. Contas suprimidas são removidas com aviso antes da busca, na conversa e de novo no step.

## Boundaries & Constraints

**Always:**
- Tipos em `src/types/agent.ts`: `TargetAccount { name: string | null; domain: string | null; confidence: "high" | "low" }` e `SuppressedAccount { name: string | null; domain: string; reason: string }`. `ParsedBriefing` ganha `targetAccounts?: TargetAccount[] | null`, `suppressedAccounts?: SuppressedAccount[] | null` e `jobTitlesFromIcp?: boolean`.
- Módulo puro e client-safe `src/lib/agent/target-accounts.ts` como fonte única:
  - `normalizeDomain(raw)`: minúsculas, trim, sem protocolo, `www.`, porta, caminho, query ou `@`-prefixo de e-mail. Valida `^[a-z0-9-]+(\.[a-z0-9-]+)+$`. Inválido → `null`.
  - `sanitizeTargetAccounts(raw: unknown, userText: string)`: coerção item a item (um item ruim não derruba os outros). Nome com trim e até 120 caracteres. Item sem nome e sem domínio é descartado. Se o domínio aparece literalmente no texto do usuário, a confiança é `"high"`; senão vale a do LLM (default `"low"`). Dedupe por domínio (senão por nome normalizado). Teto de 50.
  - `isAccountListMode(b)`: `targetAccounts` ou `suppressedAccounts` não vazios, e fora do fluxo de leads importados (`skipSteps` com `search_leads`).
  - `hasUnresolvedAccounts`, `resolvedAccountDomains`, `formatTargetAccounts(accounts)` (exibição: `Banco X (bancox.com.br)`, `empresay.com`, `Banco Z (bancoz.com.br — confirme)`, `Empresa W (dominio?)`), `formatTargetAccountsInput` (o mesmo sem marcas, para o editor) e `parseTargetAccountsInput(raw)` (itens separados por vírgula: `dominio` ou `Nome (dominio)`; sem domínio válido → erro `Informe o dominio de: X (ex.: X (empresa.com.br))`; vazio → erro; confiança `"high"`).
  - `canProceedWithSearch(b)`: no modo lista, cargos ≥ 1 **e** ≥ 1 conta **e** nenhuma sem domínio; fora dele, a regra atual (cargos + `hasSearchLocation`). Usado no `canProceed` do `/parse`, no `canConfirm` do card e nos 3 `canProceed` reconciliados do hook.
- Modo lista dentro de `search-defaults.ts`: `resolveSearchLocations` usa só o `location` do usuário (sem ICP), e `buildAccountSearchFilters(b, perPage)` → `{ domains, titles, perPage, page: 1, locations? }`, com `locations` só quando há `location` do usuário. Porte e indústria não entram, como no ramo por domínios de hoje.
- Parser (`briefing-parser-service.ts`): campo `targetAccounts` no schema (`z.unknown()` → `sanitizeTargetAccounts`, fail-open para `[]`) e no prompt. Regras do prompt: o modo lista vale quando o usuário cita empresas-alvo específicas ou cola domínios. Domínio oficial só com certeza (`"high"`). Nome ambíguo ou incerto → melhor palpite com `"low"`, ou `null` sem palpite. Nunca inventar empresa. Contas não exigem localização. Correção mais recente prevalece (tirar/trocar contas).
- `/parse` (depois da canonicalização de `skipSteps` e do ICP): no fluxo importado, `targetAccounts`/`suppressedAccounts` = `null`. Com contas, `findSuppressedAccounts` separa as suprimidas para `suppressedAccounts` (mantém só as restantes), garante `search_companies` em `skipSteps`, zera `technology` e, sem cargos do usuário, usa os cargos do ICP (dedupe, máx. 6) com `jobTitlesFromIcp: true`. Em `missingFields`, `location` não entra no modo lista e `targetAccounts` entra quando há conta sem domínio ou nenhuma restante.
- Supressão (`src/lib/agent/account-suppression.ts`, servidor): `findSuppressedAccounts(supabase, tenantId, domains)` → `SuppressedAccount[]`. Regra provisória até a lista de supressão da 23.5: conta com oportunidade do tenant em `contacted` ou `meeting_booked`, casando o domínio do e-mail do lead (`opportunities` → `lead:leads(email)`). Ignora domínios de e-mail pessoal (gmail, hotmail, outlook, yahoo, icloud, live, bol, uol, terra). Motivo: `negociacao em andamento (oportunidade com reuniao marcada)` ou `(... em contato)`. Erro de leitura → `console.warn` e `[]` (fail-open).
- `search_leads`: o modo lista vem antes dos ramos atuais. O step refaz a supressão sobre os domínios (cobre contas vindas do chip). Se há removidas, grava uma mensagem `system` `Removi da busca: X (motivo).`. Nenhuma restante → lança `ALL_ACCOUNTS_SUPPRESSED_MESSAGE`. Progresso: `Buscando leads (cargos) nas N contas da sua lista...`. Busca com `buildAccountSearchFilters` e o universo da 24.16, e passa pelo mesmo `buildSearchOutput` (Fit Score, ordem, corte do autopilot), com `domainsSearched` e `suppressedAccounts` no output. O `fetch-leads` reaproveita `searchFilters`, então "Buscar mais" continua nas contas.
- Hook/card: chip `Contas` (campo `targetAccounts`) só no modo lista, primeiro da lista, com `formatTargetAccounts`. A edição usa `parseTargetAccountsInput`, e a supressão fica para o step. No resumo (modo lista): `- Contas (N): ...`; se houver `"low"`, `Confira os dominios marcados com "confirme": eu deduzi pelo nome.`; `- Removidas da lista: X (dominio) — motivo`; cargos com ` (do seu ICP)` quando `jobTitlesFromIcp`; e a linha de etapa `Modo lista de contas: vou buscar os decisores direto nessas N contas, sem a busca de empresas.` no lugar da linha de busca direta e da nota de porte. Pergunta determinística de `targetAccounts`: `Qual o site (dominio) de: X? Ex.: empresa.com.br.`, ou, com todas suprimidas, `As contas que voce citou estao suprimidas (X — motivo). Me diga outras empresas (nome ou dominio).`. No ramo `!canProceed` do modo lista, com contas não resolvidas ou nenhuma restante, a pergunta é sempre a determinística, e o aviso de removidas vai antes da pergunta.
- Consumidores: plano (`Buscar {cargos} nas N contas da sua lista (busca por dominio, sem busca de empresas)` + sufixo de N), viabilidade do `/plan` (`buildAccountSearchFilters(b, 1)`), `icpDefaultChipLabel`, o resumo de ajuste (linha `- Contas: ...`, sem porte do ICP), `mergeAdjustedBriefing` (só aceita contas do parse se a execução já está no modo lista, e lista vazia no parse preserva a persistida; `jobTitlesFromIcp` com ausência preservando), `reconcileNonImportBriefing` (o modo lista mantém `search_companies` pulado) e diagnóstico de busca vazia (`N dominios da sua lista de contas` / `nas N contas da sua lista`).
- PATCH `/briefing` declara os 3 campos (armadilha do strip). Domínio validado pela mesma regex, listas com teto de 50, `reason` com até 200.

**Never:**
- Migration, tabela de supressão (é a 23.5), `pg_cron`, Edge Function, secret, mudança no export/ativação do Instantly, no webhook ou no `reply-sweep`.
- Chamada paga nova para resolver nome → domínio (Apollo organizations, enrichment). A resolução é do LLM do parse, já pago, com confirmação no card.
- Mudar o comportamento sem contas: briefing, resumo, plano, busca e diagnóstico idênticos aos de hoje.
- Aplicar porte, indústria ou local do ICP na busca do modo lista.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nomes | "CISO do Banco X e da Empresa Y" | 2 contas, `search_companies` pulado, sem exigir local, card com chip Contas | — |
| Domínios colados | "CISO em https://www.bancox.com.br/, empresay.com" | `bancox.com.br`, `empresay.com`, ambos `high` | domínio inválido → `null` → pergunta |
| Ambíguo | LLM: Banco X `low` | resumo/chip "(… — confirme)", `canProceed` true | — |
| Sem domínio | LLM: Empresa W `domain: null` | `canProceed` false, "Qual o site (dominio) de: Empresa W?" | — |
| Cargos do ICP | contas sem cargo, ICP [CISO] | `jobTitles` [CISO], `jobTitlesFromIcp`, resumo "(do seu ICP)" | sem ICP → pergunta cargo |
| Suprimida | Banco X com oportunidade `meeting_booked` (e-mail @bancox.com.br) | removida, aviso + "Removidas da lista", busca só com o resto | leitura falha → nada suprimido |
| Todas suprimidas | só Banco X | `canProceed` false, pergunta por outras contas | — |
| Step | contas [a.com, b.com], b suprimida via chip | mensagem "Removi da busca", busca `domains: [a.com]` | todas → erro `ALL_ACCOUNTS_SUPPRESSED_MESSAGE` |
| Chip | "Banco X (bancox.com.br), empresay.com" | 2 contas `high` | "Banco X" sozinho → erro inline |
| Importados | leads colados + contas citadas | contas `null`, fluxo importado igual | — |
| Sem contas | "CISO em SP" | tudo idêntico a hoje | — |

</intent-contract>

## Code Map

- `src/types/agent.ts:113-145` -- `ParsedBriefing`: novos campos e tipos `TargetAccount`/`SuppressedAccount`.
- `src/lib/agent/target-accounts.ts` (novo, puro) -- helpers da seção Always. Molde: `icp-briefing.ts` (leaf puro, `dedupeNonEmpty`).
- `src/lib/agent/search-defaults.ts:112-131` (`resolveSearchLocations`) e `:258` (`buildDirectSearchFilters`) -- modo lista no local efetivo e `buildAccountSearchFilters` ao lado. Importa `target-accounts.ts` (os dois são puros, sem ciclo: `target-accounts` não importa `search-defaults`).
- `src/lib/agent/account-suppression.ts` (novo, servidor) -- `findSuppressedAccounts`. Join no padrão de `src/app/api/opportunities/[opportunityId]/suggestion/route.ts:86` (`lead:leads ( ... )`). Status de `src/types/opportunity.ts:26`.
- `src/lib/agent/briefing-parser-service.ts:72-118` (schema), `:124-185` (prompt: campo, regras de `skipSteps`, regra 6.1 "cargo + localizacao" passa a citar contas, nova regra 10), `:255-280` (briefing campo a campo; o texto do usuário vem do `history`).
- `src/app/api/agent/briefing/parse/route.ts:67-110` (`analyzeBriefingCompleteness` → `canProceedWithSearch` + `missingFields` do modo lista) e `:262-297` (canonicalização: o ICP é aguardado antes do bloco de contas; a supressão usa o `supabase` de sessão já criado).
- `src/app/api/agent/executions/[executionId]/briefing/route.ts:35-95` -- schema do PATCH.
- `src/lib/agent/steps/search-leads-step.ts:81-185` -- ramo do modo lista antes de `isDirectEntry`. A mensagem de progresso passa a depender do ramo. `buildSearchOutput` (:233) ganha `extraData?: Record<string, unknown>`, mesclado no `data` dos dois retornos.
- `src/app/api/agent/executions/[executionId]/plan/route.ts:58-104` -- `isDirectSearch` também vale no modo lista e os filtros vêm de `buildAccountSearchFilters`.
- `src/lib/services/agent-plan-generator.ts:47-76` -- descrição do `search_leads` no modo lista (antes do ramo `search_companies` pulado).
- `src/lib/agent/briefing-adjustment.ts:139-170` (`mergeAdjustedBriefing`) e `:268-300` (linhas de busca).
- `src/lib/agent/empty-search-diagnosis.ts:294-335` -- ramo `domains`: textos do modo lista (`DiagnosisBriefing` ganha `targetAccounts`/`skipSteps` opcionais).
- `src/hooks/use-briefing-flow.ts` -- `generateSmartQuestion` (:110) + `QUESTIONABLE_FIELDS` (:154); `generateBriefingSummary` (:196); `icpDefaultChipLabel` (:318, sem porte do ICP no modo lista); `withRequiredMissing` (:534); `reconcileNonImportBriefing` (:612); `BriefingCardField`/labels/`BriefingFieldValue`/`formatBriefingFieldValue`/`parseBriefingFieldInput` (:690-820); ramo `!canProceed` (:1116); `canProceed` reconciliados (:1108, :1573, :1600); `canConfirm` (:1794); `editBriefingField` (:1897, `targetAccounts` fora de `TRACKED_MISSING_FIELDS`).
- `src/components/agent/AgentConfirmationCard.tsx:43-60` (ordem dos chips, `rawFieldValue`) e `:200-225` (chip Contas só no modo lista).
- Sem mudança (evidência): `fetch-leads/route.ts:117-158` reaproveita `searchFilters` (domínios). O orchestrator passa `previousStepOutput` indefinido quando `search_companies` foi pulado (`orchestrator.ts:144-177`). `ApolloService.searchPeople` envia `domains` como `q_organization_domains_list` (`apollo.ts:335`).
- Testes: `__tests__/unit/lib/agent/target-accounts.test.ts` e `account-suppression.test.ts` (novos), `search-defaults.test.ts`, `briefing-parser-service.test.ts` (ou o arquivo de teste existente do parser), `steps/search-leads-step.test.ts`, `briefing-adjustment.test.ts`, `empty-search-diagnosis.test.ts`, `__tests__/unit/lib/services/agent-plan-generator.test.ts`, `__tests__/unit/api/agent/{briefing-parse,briefing-update}.test.ts` (o parse precisa mockar `account-suppression`), o teste da rota de plano, se existir, `__tests__/unit/hooks/use-briefing-flow.test.tsx` e `__tests__/unit/components/agent/AgentConfirmationCard.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `src/types/agent.ts`, `src/lib/agent/target-accounts.ts`, `src/lib/agent/search-defaults.ts` -- tipos, helpers puros, local e filtros do modo lista -- AC1/AC2.
- [x] `src/lib/agent/account-suppression.ts` -- regra provisória de supressão, fail-open -- AC3.
- [x] `briefing-parser-service.ts`, `parse/route.ts`, `briefing/route.ts` (PATCH) -- extração, canonicalização, cargos do ICP, supressão na conversa, persistência -- AC1/AC3.
- [x] `search-leads-step.ts`, `plan/route.ts`, `agent-plan-generator.ts`, `briefing-adjustment.ts`, `empty-search-diagnosis.ts` -- busca por domínio, re-supressão, plano, viabilidade, ajuste e diagnóstico -- AC2/AC3.
- [x] `use-briefing-flow.ts`, `AgentConfirmationCard.tsx` -- chip Contas, resumo, perguntas, regra única de avanço -- AC1/AC3.
- [x] Testes: uma linha por cenário da matriz nos arquivos do Code Map. Os testes existentes continuam verdes (sem contas, comportamento idêntico).

**Acceptance Criteria:**
- Given a conversa, when o usuário cita empresas ou cola domínios, then o briefing grava as contas com domínio normalizado, o card mostra o chip Contas (domínios incertos marcados "confirme"), conta sem domínio faz o agente perguntar o site, e a confirmação não exige localização.
- Given contas no briefing confirmado, when a execução roda, then `search_companies` fica pulado e o `search_leads` chama a Apollo com `domains` = as contas restantes e os cargos do briefing ou do ICP, sem porte ou local do ICP. O plano e a viabilidade descrevem e contam essa mesma busca.
- Given uma conta com oportunidade em `contacted`/`meeting_booked`, when é informada (conversa ou chip), then o agente avisa e a remove antes de buscar, e com todas removidas não busca.
- Given um briefing sem contas, when qualquer fluxo roda, then o comportamento é idêntico ao de hoje.
- Given `npm run lint`, `npm run typecheck` e `npm run test:run`, when executados, then passam.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 40 findings — high 0, medium 4, low 33, false 3, maybe-false 0
- findings:
  - `low` `reject` [blind] Consulta de supressao sem limite (corte de 1000 linhas do PostgREST) — exige mais de 1000 oportunidades em contacted/meeting_booked num tenant (oportunidades nascem de respostas); filtro por dominio no servidor e complexidade nova.
  - `low` `reject` [blind] DOMAIN_REGEX aceita sufixo publico ("com.br") e IP — ninguem cita "com.br" como conta e o LLM nao devolve isso; barrar sufixos exige lista de sufixos.
  - `low` `patch` [blind] Confianca "high" por substring (`includes`) — corrigido: casamento por fronteira de dominio (aceita `www.` antes), com teste.
  - `low` `patch` [blind] Editar o chip Contas promove os dominios "low" a "high" — corrigido: o editor abre com a marca "— confirme" e o parse mantem "low" enquanto a marca estiver la; testes.
  - `low` `patch` [blind] "1 contas" no progresso, plano e resumo — corrigido o singular nos tres; testes.
  - `low` `reject` [blind] Plano/viabilidade contam contas que o step suprime depois — so acontece com conta suprimida adicionada pelo chip; o step avisa e remove antes de buscar.
  - `low` `patch` [blind] Linha "confirm" do prompt so citava cargo + localizacao — corrigido: "(ou cargo + lista de contas)".
  - `low` `reject` [blind] No ajuste pos-rejeicao nao da para sair do modo lista e o guard do AgentChat fala de "cargo e localizacao" — a forma do pipeline fica fixa apos o confirm (regra da 22.13); o guard so aparece com parse sem `canProceed`, caso raro no modo lista.
  - `low` `patch` [blind] `mergeAdjustedBriefing` deixava entrar tecnologia num briefing do modo lista — corrigido: tecnologia `null` quando o resultado esta no modo lista; teste.
  - `low` `reject` [blind] O step nao grava as contas suprimidas de volta no briefing — so afeta conta suprimida adicionada pelo chip, e o output do step guarda `suppressedAccounts`.
  - `low` `reject` [blind] Aviso "Removi da lista" repete a cada pergunta — so com supressao + campo faltando; deduplicar exige estado do turno anterior.
  - `low` `patch` [blind] Filtro de e-mail pessoal pelo primeiro rotulo (uol/terra nunca supressos, aol/msn de fora) — corrigido: lista exata de 18 dominios de provedor aplicada so ao e-mail do lead; testes.
  - `medium` `patch` [blind] Erro "todas suprimidas" como Error generico — mesmo grupo do achado verification-gap da mensagem quebrada (corrigido).
  - `false` `reject` [blind] `briefingChanged` ignora `suppressedAccounts`/`jobTitlesFromIcp` — os dois sao derivados da mesma lista do LLM: uma conta nova suprimida sai de `targetAccounts` (detectado), e `jobTitlesFromIcp` so muda junto com `jobTitles` (detectado).
  - `low` `reject` [blind] Chip separa nome com virgula ("Itau Unibanco Holding, S.A.") — raro e o erro inline aparece; separar fora de parenteses nao resolve virgula no nome.
  - `low` `reject` [blind] Spec sem Completion Notes — o fix e editar a spec; registradas na finalizacao.
  - `low` `reject` [edge] Consulta sem paginacao — mesmo grupo do primeiro achado blind.
  - `false` `reject` [edge] Step lanca "todas suprimidas" com todas as contas sem dominio — inalcancavel: `canProceed`/`canConfirm` exigem todas resolvidas e o chip exige dominio.
  - `low` `patch` [edge] Confianca por substring — mesmo grupo do patch blind (corrigido).
  - `low` `reject` [edge] Dominio com acento (IDN) rejeitado — raro em B2B; o agente pede o dominio de novo.
  - `low` `reject` [edge] Mais de 50 contas no chip cortadas sem aviso — raro; teto igual ao do PATCH.
  - `low` `reject` [edge] Virgula no nome — mesmo grupo do achado blind.
  - `low` `reject` [edge] Aviso de removidas repetido — mesmo grupo do achado blind.
  - `low` `patch` [edge] Chip Tecnologia editavel no modo lista — corrigido: chip escondido no modo lista; teste.
  - `low` `patch` [edge] Editar cargos depois do ICP mantinha "(do seu ICP)" — corrigido: `jobTitlesFromIcp` false ao editar o chip de cargos; teste.
  - `low` `patch` [edge] "nas 1 contas" — mesmo grupo do patch blind (corrigido).
  - `low` `patch` [edge] Provedor pelo primeiro rotulo — mesmo grupo do patch blind (corrigido).
  - `low` `reject` [edge] Import alucinado + contas: o hook reconcilia para nao-import e as contas ja foram zeradas pelo parse — exige o LLM marcar import e citar contas no mesmo turno; o proximo parse traz as contas de volta.
  - `low` `reject` [edge] Ajuste de execucao fora do modo lista citando empresas sem cargos troca os cargos pelos do ICP — exige parse sem memoria e mensagem so com empresas; raro.
  - `low` `reject` [edge] Claim: plano/viabilidade contam a mesma busca — mesmo grupo do achado blind de viabilidade.
  - `low` `patch` [edge] Claim: editor do chip apaga as marcas "confirme" — mesmo grupo do patch blind (corrigido).
  - `false` `reject` [edge] PATCH aceita contas sem `search_companies` pulado — todo escritor do briefing (parse route e `reconcileNonImportBriefing`) garante o skip; o PATCH so recebe o estado do hook.
  - `low` `patch` [verification-gap] Sem teste de correcao so de contas no `confirming` — teste de dois turnos adicionado ("- Contas (1): empresay.com").
  - `low` `patch` [verification-gap] `searchFilters` do modo lista nunca verificado (o fetch-leads reusa) — asserção adicionada no teste de supressao do step.
  - `medium` `patch` [verification-gap] Mensagem "todas suprimidas" sai quebrada ("...Ajuste a lista de contas e. Entre em contato com o suporte.") — corrigido: mensagem sem "tente novamente" + teste com `formatStepErrorMessage`.
  - `medium` `patch` [verification-gap] (other) O mesmo defeito da mensagem quebrada — mesmo grupo (corrigido).
  - `low` `reject` [intent] Resolucao nome → dominio pelo LLM real nunca exercitada — sem smoke nesta execucao; registrado nos riscos residuais com o smoke recomendado.
  - `medium` `defer` [intent] Classe "cliente" da supressao nao implementada — nao ha fonte de dados ate a 23.5; deferido.
  - `low` `reject` [intent] Confirmacao do dominio ambiguo e so a marca + o clique no card — e o mecanismo de confirmacao da 24.5; o resumo pede para conferir os marcados.
  - `low` `reject` [intent] Spec ainda nao finalizada — o fix e editar a spec; feito na finalizacao.

## Design Notes

- **Supressão provisória:** a lista de supressão (23.5–23.7) está em espera, e o épico manda aplicar "conforme a regra já existente". A única regra existente sobre contas em negociação é a Central de Oportunidades: oportunidade em `contacted` (vendedor já falando) ou `meeting_booked` (reunião marcada). Ela é casada pelo domínio do e-mail do lead, porque `leads` não tem domínio da empresa. "Cliente" ainda não tem fonte de dados e entra quando a 23.5 criar a tabela, atrás da mesma função `findSuppressedAccounts`.
- **Nome → domínio pelo LLM do parse:** custo zero (a chamada já existe), e a confiança + o card mantêm o humano no circuito. Uma busca por domínio errado volta vazia e cai no diagnóstico, sem gastar crédito (a `api_search` não consome).
- **`suppressedAccounts` no briefing:** mantém o modo lista quando todas as contas foram removidas. Sem isso, a lista vazia viraria busca aberta por cargo + local, que é o oposto do pedido.
- **`technology` zerada no modo lista:** a tecnologia exige o TheirStack (`search_companies`), que o modo lista pula. Deixá-la no briefing exibiria um filtro que não roda.

## Verification

**Commands:**
- `npx vitest run __tests__/unit/lib/agent __tests__/unit/lib/services __tests__/unit/api/agent __tests__/unit/hooks __tests__/unit/components/agent` -- expected: verde
- `npm run lint && npm run typecheck && npm run test:run` -- expected: sem erro (warnings toleradas)

**Manual checks (if no CLI):**
- Os 3 pontos do cliente por análise do diff: busca sem contas inalterada, export/ativação não tocados, nada em webhook/`reply-sweep`.

## Completion Notes

**O que pode mudar para o cliente**
- Conversa do agente: o prompt do parser de briefing (`briefing-parser-service.ts`, constante no codigo, fora do `promptManager`) ganhou o campo `targetAccounts` e a regra do modo lista. Ele vale para toda conversa do agente. Quando o usuario cita empresas ou cola dominios, a conversa entra no modo lista: nao pede localizacao, mostra o chip Contas e marca os dominios deduzidos com "confirme".
- `/api/agent/briefing/parse`: no modo lista, le `opportunities` + `leads(email)` do tenant (somente leitura, client de sessao) para a supressao provisoria, pula `search_companies`, zera `technology` e usa os cargos do ICP quando o usuario nao cita cargos. Sem contas, o briefing sai identico (sem as chaves novas).
- PATCH `/briefing`: aceita `targetAccounts`, `suppressedAccounts` e `jobTitlesFromIcp`.
- Step `search_leads`: novo ramo do modo lista (busca Apollo por dominio, a mesma do fluxo por tecnologia, que nao consome credito). Ele refaz a supressao e grava a mensagem "Removi da busca". Plano, viabilidade, resumo de ajuste e diagnostico de busca vazia descrevem esse ramo.
- Nenhuma tabela, migration, job `pg_cron`, Edge Function, secret ou integracao nova.

**Os 3 pontos (por analise do diff + testes, sem smoke real)**
1. Campanhas rodando, webhook e `reply-sweep`: nao tocados.
2. Busca de leads: sem contas no briefing, a busca do agente, a manual e o `fetch-leads` nao mudam (testes de paridade; a supressao nem e consultada sem contas). Unico ponto de atencao: o prompt do parser mudou para todas as conversas. Se o LLM ler o nome de uma tecnologia como empresa ("CTOs que usam Netskope"), a conversa entra no modo lista, e o card mostra isso antes de qualquer gasto.
3. Criacao, export e ativacao no Instantly: nao tocados, sem trava nova.

## Auto Run Result

Status: done

**Resumo:** o agente agora tem o modo lista de contas (ABM). Quando o usuario cita empresas ("CISO do Banco X e da Empresa Y") ou cola dominios, o parser grava as contas com o dominio normalizado. Dominio deduzido com duvida aparece com "confirme" no card, e conta sem dominio faz o agente perguntar o site. A localizacao nao e exigida, e sem cargos do usuario valem os do ICP. A execucao pula a busca de empresas e o `search_leads` busca os decisores por dominio (`q_organization_domains_list`) nas contas, com o Fit Score da 24.16. Contas com negociacao em andamento (oportunidade em contato ou com reuniao marcada, casada pelo dominio do e-mail do lead) sao avisadas e removidas na conversa e de novo no step. Com todas removidas, nada e buscado. Sem contas, tudo fica igual a hoje.

**Arquivos alterados:**
- `src/types/agent.ts` — `TargetAccount`, `SuppressedAccount` e os 3 campos novos do briefing.
- `src/lib/agent/target-accounts.ts` (novo) — normalizacao de dominio, saneamento das contas do LLM, gate do modo lista, formato e parse do chip.
- `src/lib/agent/account-suppression.ts` (novo) — supressao provisoria por oportunidades, fail-open.
- `src/lib/agent/search-defaults.ts` — local sem ICP no modo lista, `canProceedWithSearch` (regra unica de avanco) e `buildAccountSearchFilters`.
- `src/lib/agent/briefing-parser-service.ts` — campo `targetAccounts` no schema e no prompt.
- `src/app/api/agent/briefing/parse/route.ts` — canonicalizacao do modo lista, supressao, cargos do ICP, completude.
- `src/app/api/agent/executions/[executionId]/briefing/route.ts` — schema do PATCH.
- `src/app/api/agent/executions/[executionId]/plan/route.ts` — viabilidade pela busca por dominio.
- `src/lib/agent/steps/search-leads-step.ts` — ramo do modo lista com re-supressao.
- `src/lib/services/agent-plan-generator.ts`, `src/lib/agent/briefing-adjustment.ts`, `src/lib/agent/empty-search-diagnosis.ts` — plano, ajuste e diagnostico no modo lista.
- `src/hooks/use-briefing-flow.ts`, `src/components/agent/AgentConfirmationCard.tsx` — chip Contas, resumo, perguntas deterministicas, regra unica de avanco.
- Testes: 2 arquivos novos (`target-accounts`, `account-suppression`) e casos novos em 11 arquivos existentes.

**Revisao:** 40 achados (0 high, 4 medium, 33 low, 3 false, 0 maybe-false).
- Patches: 1 entrada medium (mensagem "todas suprimidas" quebrada pelo saneamento de erro) e 11 entradas low (confianca por fronteira de dominio, marca "confirme" preservada no editor, singular, linha do prompt, tecnologia no merge, filtro de provedor por dominio exato, chip Tecnologia escondido, `jobTitlesFromIcp` ao editar cargos, e 2 testes novos de verificacao).
- Deferido: 1 (classe "cliente" da supressao, depende da 23.5).
- Rejeitados: 19 linhas low e 3 false, com os motivos no Triage Log.

**Follow-up review recomendado:** false — so 1 entrada medium corrigida, nenhuma high.

**Verificacao:** `npm run lint` com 0 erros (134 warnings ja existentes), `npm run typecheck` ok, `npm run test:run` com 445 arquivos e 8552 testes verdes. Auditoria da matriz I/O: todas as linhas tem teste, e eles passaram.

**Riscos residuais:**
- Sem smoke real. Recomendado: no agente, pedir "CISO do Banco X e empresay.com", conferir o chip Contas, o plano "nas N contas da sua lista" e o gate, e parar antes de gastos e ativacao.
- A resolucao nome → dominio depende do LLM e nunca foi medida com o modelo real. Um dominio errado volta vazio (sem custo, a `api_search` nao consome credito) e cai no diagnostico.
- O prompt do parser mudou para todas as conversas (ver ponto 2 das Completion Notes).
- A supressao cobre so "negociacao" (deferido "cliente"). Ela casa pelo dominio do e-mail do lead, le todas as oportunidades ativas do tenant sem paginacao e falha aberta.
- O aviso "Removi da lista" se repete enquanto a conversa pede outros dados.
