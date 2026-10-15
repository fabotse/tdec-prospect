---
title: 'Story 23.4 — CI no GitHub e base verde'
type: 'chore'
created: '2026-10-15'
status: done
baseline_revision: '35a830af148bef181b09a1306ae1eb6e2e68410d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: []
deferred:
  - summary: >-
      Refatorar os dois efeitos do PhoneLookupProgress para tirar os eslint-disable de react-hooks/set-state-in-effect.
    evidence: |-
      A 23.4 manteve o comportamento com disable pontual (Design Notes). A refatoração muda quando o diálogo dispara/reinicia a busca de telefone e precisa de smoke, idealmente com banco de teste (23.0 adiada).
    location: >-
      src/components/leads/PhoneLookupProgress.tsx:80
    severity: low
  - summary: >-
      Nenhum teste verifica que AgentApprovalGate/AgentCampaignPreview repassam totalSteps para triggerNextStep (tratamento do último step).
    evidence: |-
      A 23.4 só adicionou totalSteps={5} nos renders para satisfazer o tsc; a lacuna de cobertura já existia antes.
    location: >-
      __tests__/unit/components/agent/AgentApprovalGate.test.tsx
    severity: low
  - summary: >-
      Edge Functions (supabase/functions, Deno) não passam por typecheck nem lint no CI.
    evidence: |-
      tsconfig.json exclui supabase/functions desde antes da story; o caminho do webhook e do reply-sweep fica fora do CI. Pré-existente.
    location: >-
      tsconfig.json
    severity: low
operator_actions:
  - "Fazer push da branch epic/23-plataforma-higiene para o GitHub e confirmar em Actions que os jobs Lint, Typecheck e Tests do workflow CI terminam verdes."
  - "Abrir um PR de epic/23-plataforma-higiene para main e confirmar que o PR mostra os três checks Lint, Typecheck e Tests."
  - "Opcional: em GitHub > Settings > Branches, criar uma regra de proteção da main que exija os checks Lint, Typecheck e Tests antes do merge."
---

<intent-contract>

## Intent

**Problem:** Nenhum PR roda checagem automática: não existe `.github/workflows`, e a base não passa nos próprios checks (medido em 2026-10-15: `eslint` → 19 erros, sendo 6 em `src`, 9 em `__tests__` e 4 em `docs/apresentacao-v1/*.cjs`; `tsc --noEmit` → 182 erros, todos em `__tests__`; `vitest run` → verde, 409 arquivos / 7544 testes).

**Approach:** Criar um workflow do GitHub Actions que roda `eslint`, `tsc --noEmit` (com `__tests__`) e `vitest run` em PRs para `main` e em push na branch do épico, e zerar os erros atuais com correções que não mudam o comportamento do app.

## Boundaries & Constraints

**Always:**
- Correções em `src` são **equivalentes em comportamento** (reordenar declaração, escapar aspas em JSX, remover setState redundante ou `eslint-disable-next-line` com justificativa). O cliente não pode sentir nada (CLAUDE.md, regra nº 1).
- Erros de tsc em `__tests__` se resolvem nos próprios testes/helpers (tipagem de mocks, fixtures com campos novos, casts). Asserções e cenários dos testes continuam os mesmos; `vitest run` continua com 409 arquivos e 7544 testes passando.
- O CI não usa segredo nem `.env`: os testes não falam com Supabase, Instantly ou Apollo.
- Node 24 e `npm ci` com o `package-lock.json` atual.

**Never:**
- Não afrouxar `tsconfig.json` (`strict`, `target`, `include`) nem desligar regras do ESLint globalmente para passar; o único ignore novo permitido é `docs/**` (scripts de apresentação, não são código do app).
- Não tocar em `src/lib/services/instantly.ts`, rotas de export/ativação, busca de leads (Apollo), webhook, crons, migrations, Edge Functions ou variáveis de ambiente.
- Não fazer upgrade de dependências (é a 23.2). Não pular nem apagar testes (`.skip`, `@ts-nocheck`, `@ts-ignore` em massa).
- Não fazer push, abrir PR nem mudar configuração do repositório no GitHub (branch protection) — fica para o operador.

</intent-contract>

## Code Map

- `.github/workflows/` -- não existe; criar `ci.yml`.
- `package.json` -- scripts `lint` (`eslint`), `test:run` (`vitest run`); não há script de typecheck. npm 11 / Node 24 locais; campo `allowScripts` exige npm ≥ 11 (Node 24 traz).
- `tsconfig.json` -- `include: **/*.ts(x)` já cobre `__tests__`; exclui `supabase/functions`. `.next/types/**` não existe no CI (glob vazio, sem efeito).
- `eslint.config.mjs` -- flat config; `globalIgnores` recebe `docs/**`.
- `vitest.config.ts` / `__tests__/setup.ts` -- sem carregar `.env`; testes 100% mockados.
- Erros de lint em `src` (6):
  - `src/components/leads/ImportCampaignResultsDialog.tsx:182` -- `processData` (useCallback deps `[]`, linha ~235) é usado por `handleDrop`/`handleFileChange`/`handlePasteData` antes de declarado; mover a declaração para antes de `handleDrop` (~linha 156).
  - `src/components/leads/LeadPreviewPanel.tsx:171` -- aspas em `"Meus Leads"` → `&quot;`.
  - `src/components/leads/PhoneLookupProgress.tsx:80,152` -- `react-hooks/set-state-in-effect` (validação ao abrir e reset ao fechar); `eslint-disable-next-line` com motivo.
  - `src/hooks/use-voice-recording.ts:66` -- `setPermissionState("unknown")` com estado inicial já `"unknown"`: remover a chamada (no-op).
- Erros de lint em `__tests__` (9): `PhoneLookupProgress.test.tsx:103` (tipo `Function`), wrappers sem display name em `use-campaign-analytics`, `use-campaign-blocks`, `use-campaign-steps`, `use-lead-tracking`, `use-opportunity-window`, `use-save-campaign`, `use-whatsapp-messages` (`.test.ts`), `use-user.test.ts:55` (atribuição a `module`).
- Erros de tsc (182, por código): TS2345 43, TS2322 42, TS2348 40, TS2741 14, TS2769 9, TS2556 9, TS2739 8, TS18048 7, TS1501 4, outros 6. Maiores focos: `__tests__/unit/helpers/mock-supabase.test.ts` (33, `Mock<Procedure|Constructable>` não chamável — tipar o mock), `__tests__/helpers/mock-data.ts:88,120` e `__tests__/helpers/mock-supabase.ts:172` (fixtures sem `external_campaign_id`/`export_platform`/`exported_at`/`export_status`), `campaign-export-repository.test.ts` (15). TS1501 = flag `/s` de regex com target ES2017 → reescrever a regex no teste.

## Tasks & Acceptance

**Execution:**
- `.github/workflows/ci.yml` -- workflow `CI`: gatilhos `pull_request` (branches `main`, tipos padrão opened/synchronize/reopened), `push` em `main` e `epic/**`, `workflow_dispatch`; `concurrency` por ref com cancelamento; job `ubuntu-latest`, `permissions: contents: read`, `actions/checkout@v4`, `actions/setup-node@v4` (node 24, cache npm), `npm ci`, depois passos nomeados `Lint` (`npm run lint`), `Typecheck` (`npm run typecheck`), `Tests` (`npm run test:run`) -- o PR mostra cada check.
- `package.json` -- adicionar script `"typecheck": "tsc --noEmit"` -- mesmo comando local e no CI.
- `eslint.config.mjs` -- `docs/**` em `globalIgnores` -- scripts `.cjs` de apresentação não são código do app.
- `src/...` (4 arquivos do Code Map) -- correções de lint equivalentes em comportamento.
- `__tests__/...` -- zerar os 9 erros de lint e os 182 de tsc sem mudar o que cada teste verifica.

**Acceptance Criteria:**
- Given o workflow em `.github/workflows/ci.yml`, when um PR para `main` é aberto ou atualizado, then rodam `eslint`, `tsc --noEmit` (incluindo `__tests__`) e `vitest run` como passos separados e o PR mostra o resultado.
- Given a branch `epic/23-plataforma-higiene` depois da story, when `npm run lint`, `npm run typecheck` e `npm run test:run` rodam num checkout limpo sem `.env.local` (após `npm ci`), then os três terminam com exit 0 e o vitest mantém 7544 testes passando.
- Given o diff da story, when comparado com os 3 pontos do CLAUDE.md, then nenhum arquivo dos caminhos de campanha/Instantly, busca de leads ou webhook/crons foi alterado.

## Spec Change Log

## Review Triage Log

### 2026-10-15 — Review pass
- verdicts: 20 findings — high 0, medium 3, low 15, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) push em `epic/**` + PR para `main` rodam o CI duas vezes — custo de minutos só; o push no épico é o que verifica a AC2 sem PR aberto.
  - `[medium]` `[patch]` (blind) `cancel-in-progress: true` cancela runs de push na `main` — aplicado `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
  - `[low]` `[reject]` (blind) CI sem `next build` — a intenção pede eslint/tsc/vitest; o build precisaria de envs e a Vercel já builda o preview do PR.
  - `[low]` `[defer]` (blind) Edge Functions fora de typecheck/lint — pré-existente (`tsconfig` já excluía); registrado em `deferred`.
  - `[low]` `[reject]` (blind) Node fixado só no CI (sem `.nvmrc`/`engines`) — sem dano no dia a dia; local já é Node 24.
  - `[low]` `[reject]` (blind) `!` novos em testes — a regra do Epic 16 vale para `src` (escopo do eslint); em teste é precedido de `toBeDefined`.
  - `[low]` `[reject]` (blind) mocks `vi.fn<(...args: unknown[]) => T>` frouxos — melhoria de tipagem, fix maior que correção direta.
  - `[low]` `[reject]` (blind) casts `as unknown as` em Request/fetch/Response — só em testes; trocar exige reescrever mocks.
  - `[low]` `[reject]` (blind) fixtures inline em vez de `createMockCampaign*` — refactor, não correção direta.
  - `[low]` `[reject]` (blind) tipo do resolver `.then` repetido — duplicação em teste, refactor.
  - `[low]` `[defer]` (blind) refatoração do `PhoneLookupProgress` adiada sem registro — registrada em `deferred`.
  - `[false]` `[reject]` (blind) disable cobre só o primeiro setState — o rule reporta um erro por efeito (baseline: 80:7 e 152:7); se a ordem mudar, o lint falha alto, não silencia.
  - `[low]` `[reject]` (blind) sem teste para remoção do `setPermissionState("unknown")` — chamada era no-op (estado inicial igual, efeito de mount `[]`).
  - `[low]` `[defer]` (blind) `totalSteps={5}` sem teste de repasse a `triggerNextStep` — lacuna pré-existente; registrada em `deferred`.
  - `[low]` `[reject]` (blind) `docs/**` amplo demais — `docs/` não tem código do app; ignore permitido pela spec.
  - `[medium]` `[patch]` (edge) falha de lint pulava Typecheck e Tests — CI dividido em 3 jobs paralelos (`lint`, `typecheck`, `test`).
  - `[medium]` `[patch]` (edge) cancelamento na `main` — mesma causa do item do blind; mesmo patch.
  - `[low]` `[reject]` (edge) PRs com destino `epic/**` sem check — stories commitam direto na branch do épico (push já dispara); intenção cita PR para `main`.
  - `[low]` `[patch]` (edge) um único job = um único check no PR — resolvido pelos 3 jobs (checks Lint, Typecheck, Tests).
  - `[false]` `[reject]` (intent) faltam commit/`awaiting-operator`/`operator_actions` — é o passo de Finalize, feito nesta mesma execução (commit + frontmatter).

## Design Notes

`set-state-in-effect` no `PhoneLookupProgress`: refatorar para estado derivado mudaria o momento em que o diálogo inicia/reinicia o processamento (efeito com fetch). O disable pontual mantém o comportamento em produção; refatoração fica para quando houver banco de teste.

## Verification

**Commands:**
- `npm run lint` -- expected: exit 0 (warnings permitidos)
- `npm run typecheck` -- expected: exit 0
- `npm run test:run` -- expected: exit 0, 409 arquivos, 7544 passando
- Clone limpo em diretório temporário (`git worktree add`), `npm ci` e os três comandos acima -- expected: exit 0 sem `.env.local`
- `git diff --stat main...HEAD -- src` -- expected: só os 4 arquivos do Code Map

## Completion Notes

**Resultado (2026-10-15):** `npm run lint` com 0 erros (122 warnings), `npm run typecheck` com 0 erros e `npm run test:run` com 409 arquivos e 7544 testes passando (2 skipped, como antes). Também rodei num worktree limpo sem `.env.local` (`npm ci` + os 3 comandos), e tudo terminou com exit 0. Nada foi commitado nem enviado.

**O que mudou:**
- `.github/workflows/ci.yml` (novo): roda nos PRs para `main`, em push para `main`/`epic/**` e via `workflow_dispatch`. Os jobs `lint`, `typecheck` e `test` rodam em paralelo, um check para cada. Só os PRs cancelam a execução anterior; push em `main`/`epic/**` não cancela. Usa Node 24 com `npm ci` e não usa nenhum segredo.
- `package.json`: novo script `typecheck` (`tsc --noEmit`). `eslint.config.mjs`: `docs/**` entrou em `globalIgnores`. O `tsconfig.json` ficou como estava.
- `src`, 4 arquivos, sem mudar comportamento:
  - `ImportCampaignResultsDialog.tsx`: a declaração de `processData` subiu para antes de `handleDrop`, sem mudar o corpo nem as deps.
  - `LeadPreviewPanel.tsx`: as aspas viraram `&quot;`, e o texto renderizado é o mesmo.
  - `PhoneLookupProgress.tsx`: 2 `eslint-disable-next-line react-hooks/set-state-in-effect`, cada um com o motivo.
  - `use-voice-recording.ts`: removi `setPermissionState("unknown")`. É um efeito de mount e o estado inicial já é `"unknown"`, então a chamada não fazia nada.
- `__tests__`, 45 arquivos, só tipagem e fixtures:
  - Mocks tipados com `Mock` do vitest e fixtures com os campos novos (`external_campaign_id`/`export_*`, `notifiedAt`, `companyName`, `totalSteps`, `apolloId`, `updateMemberRole`).
  - Casts `as unknown as T`, wrappers nomeados (display-name) e `module` renomeado para `userModule`.
  - Regex `/s` reescrita como `[\s\S]`.
  - Sem `@ts-ignore`, `.skip` ou `any`, e as asserções continuam as mesmas.

**Os 3 pontos do CLAUDE.md**, verificados **por análise do diff**, sem smoke, porque nenhum caminho deles foi tocado:
1. Campanhas rodando, webhook e `reply-sweep`: não mexi em `instantly.ts`, webhook, crons nem Edge Functions.
2. Busca de leads: não mexi em Apollo nem em outras fontes.
3. Criação, export e ativação no Instantly: nenhuma rota ou serviço do caminho foi alterado.

Não há migration, job, secret nem variável de ambiente no diff. Os 4 arquivos de `src` são UI de import de resultados, preview de lead, busca de telefone e gravação de voz, e as mudanças neles não alteram comportamento.

**Pendente para o operador:** fazer o push da branch, abrir o PR e, se quiser, configurar a branch protection exigindo os checks `Lint`, `Typecheck` e `Tests`.

## Auto Run Result

Status: awaiting-operator

**Resumo:** criado `.github/workflows/ci.yml` (jobs paralelos Lint, Typecheck, Tests em PR para `main`, push em `main`/`epic/**` e manual) e a base ficou verde: lint 0 erros (eram 19), tsc 0 erros (eram 182), vitest 409 arquivos / 7544 testes passando.

**Arquivos:**
- `.github/workflows/ci.yml` — workflow novo, Node 24 + `npm ci`, sem segredos.
- `package.json` — script `typecheck`.
- `eslint.config.mjs` — ignora `docs/**` (scripts .cjs de apresentação).
- `src/components/leads/ImportCampaignResultsDialog.tsx` — `processData` declarado antes do uso.
- `src/components/leads/LeadPreviewPanel.tsx` — aspas escapadas em JSX.
- `src/components/leads/PhoneLookupProgress.tsx` — 2 `eslint-disable-next-line` justificados.
- `src/hooks/use-voice-recording.ts` — removido setState no-op.
- `__tests__/**` (45 arquivos) — só tipagem de mocks e fixtures; asserções iguais.

**Revisão:** 20 achados. Patches: 2 entradas medium (cancelamento na `main`; jobs separados, que absorveu o low do check único). Deferred: 3 (low). Rejeitados: 14, cada um com motivo no Review Triage Log.

**Follow-up review:** `false` — patches só em YAML de CI, sem high; 2 medium patcheados, mas ambos validados por leitura do YAML (parse OK) e o código do app não mudou após o patch. Risco não verificado: o workflow ainda não rodou no GitHub (ver operator_actions).

**Verificação:** `npm run lint` exit 0 (122 warnings), `npm run typecheck` exit 0, `npm run test:run` 7544 passando; repetido em worktree limpo sem `.env.local` após `npm ci` → tudo exit 0. Após o patch do YAML, os 3 comandos rodaram de novo, verdes. `src` alterado: só os 4 arquivos previstos.

**CLAUDE.md (3 pontos):** verificados por análise do diff — nenhum arquivo de Instantly/export/ativação, busca de leads, webhook, crons, migrations, Edge Functions ou env foi tocado.

**Pendente (operador):** ver `operator_actions` no frontmatter — push da branch, conferir os 3 checks no PR para `main`, branch protection opcional.

**Riscos residuais:** primeiro run real no GitHub pode revelar diferença de ambiente (ex.: `npm ci` com `allowScripts`), embora o worktree limpo tenha passado.

## Operator Confirmation

Confirmed 2026-10-15: the external actions this story owed were carried out.

- Fazer push da branch epic/23-plataforma-higiene para o GitHub e confirmar em Actions que os jobs Lint, Typecheck e Tests do workflow CI terminam verdes.
- Abrir um PR de epic/23-plataforma-higiene para main e confirmar que o PR mostra os três checks Lint, Typecheck e Tests.
- Opcional: em GitHub > Settings > Branches, criar uma regra de proteção da main que exija os checks Lint, Typecheck e Tests antes do merge.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
