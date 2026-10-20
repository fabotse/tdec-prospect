---
title: '24.7 — Seção de Provas na Knowledge Base'
type: 'feature'
created: '2026-10-19'
status: done
baseline_revision: '640b5b982435bd2055e6221b7805d3cc29eede4f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['oversized']
deferred: []
operator_actions:
  - "Aplicar a migration supabase/migrations/00066_create_knowledge_base_proofs.sql no SQL Editor do Supabase de produção (kdgogyqyaxncqoyklyxx) antes do deploy deste código, na janela de deploy combinada do Marco 1 (24.1/24.7/23.1/23.3)."
  - "Depois de aplicar, conferir com scripts/db-ro.sh que a tabela public.knowledge_base_proofs existe com RLS ligado e as 4 policies (SELECT para o tenant; INSERT/UPDATE/DELETE só admin)."
  - "Fazer o smoke na tela: em Configurações > Knowledge Base > Provas, cadastrar uma prova autorizada e uma não autorizada, e confirmar no editor manual (ou no agente, parando antes da aprovação da etapa Criação de Campanha) que só a autorizada aparece no bloco PROVAS AUTORIZADAS do prompt; depois remover as provas de teste se não forem reais."
---

<intent-contract>

## Intent

**Problem:** A 24.8 criou a REGRA DE PROVAS nos prompts e a 24.9 o revisor que reprova prova fora da lista, mas a variável `authorized_proofs` é sempre `""` (`buildAIVariables`), porque não existe onde cadastrar provas. Resultado: a IA nunca pode citar um case, número ou cliente real da TDec.

**Approach:** Tabela nova `knowledge_base_proofs` (migration aditiva `00066`), aba "Provas" na Knowledge Base com CRUD (tipo, texto, setor opcional, "autorizado para uso" sim/não) no mesmo padrão da aba Ice Breakers (server actions + hook TanStack + form com Dialog), e os 3 pontos que montam `KnowledgeBaseContext` passam a carregar as provas. `buildAIVariables` transforma só as autorizadas numa lista fechada, uma por linha, em `authorized_proofs`.

## Boundaries & Constraints

**Always:**
- Migration só aditiva (CREATE TABLE/INDEX/TRIGGER/POLICY, COMMENT). Nada de `ALTER`/`DROP`/`UPDATE`/`DELETE` em objeto existente. **Não aplicar** no banco: a aplicação é do Fabossi (operator action).
- O código precisa funcionar antes da migration aplicada. Se a consulta à tabela falhar (tabela inexistente ou qualquer erro), loga e segue com `proofs: []`. Contexto, agente, editor e rota `campaign-structure` continuam como hoje.
- Escrita (criar/editar/excluir) só para admin (`hasAdminAccess`, mesma mensagem de erro no padrão "Apenas administradores podem …"). Leitura no RLS para qualquer membro do tenant, porque o agente e o editor rodam com a sessão do usuário, inclusive SDR.
- `authorized_proofs` contém só `is_authorized = true`, formato fixo `- <Rótulo do tipo>: <texto>` + ` (setor: <setor>)` quando houver setor. Quebras de linha do texto viram espaço (um item por linha). Ordem por `created_at` ascendente, no máximo `MAX_PROOFS_IN_PROMPT = 20`. Sem provas autorizadas, `""`, e o prompt cai no ramo "nenhuma prova".
- `proofs` em `KnowledgeBaseContext` é opcional (`proofs?: KnowledgeBaseProof[]`), para não quebrar quem monta o contexto sem provas.

**Never:**
- Não mexer em `PROOF_RULE_BLOCK`, nos prompts (`defaults.ts`), no `copy-reviewer`, no export/ativação do Instantly, na busca Apollo, em webhook, cron ou Edge Function.
- Não filtrar provas por setor do lead nem usar LLM para escolher provas (o setor vai no texto da linha, e o prompt já decide a relevância).
- Não inserir provas de exemplo no banco nem rodar smoke que grave em produção.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Só autorizadas | proofs: case autorizado "Acme reduziu 30% do retrabalho" (setor "Indústria") + número não autorizado | `authorized_proofs` = `- Case: Acme reduziu 30% do retrabalho (setor: Indústria)`; o não autorizado não aparece | — |
| Nenhuma autorizada | todas `is_authorized: false`, ou `proofs` vazio/ausente, ou `kb` null | `authorized_proofs === ""` | — |
| Texto multilinha / limite | texto com `\n`; 25 autorizadas | uma linha por item, sem `\n` interno; só as 20 primeiras por `created_at` | — |
| Tabela ausente | consulta a `knowledge_base_proofs` retorna erro (ex.: `42P01`) | contexto devolvido com `proofs: []`, resposta 200 na rota de contexto, agente segue | `console.error` e segue |
| SDR tenta escrever | ação de criar/editar/excluir com perfil `sdr` | `{ success: false, error: "Apenas administradores podem …" }` | — |
| Validação | texto vazio, texto > 500, setor > 100, tipo fora do enum, id inválido | `{ success: false, error: <mensagem zod> }` sem tocar no banco | — |

</intent-contract>

## Code Map

- `supabase/migrations/00036_create_icebreaker_examples.sql` -- molde da migration (tabela, índice `idx_<t>_tenant`, trigger `update_updated_at_column()`, RLS com `get_current_tenant_id()` + `is_admin()`, COMMENTs). Última migration: `00065_…`; a nova é `00066_create_knowledge_base_proofs.sql`.
- `src/types/knowledge-base.ts` -- `IcebreakerExample` `:275`, `icebreakerExampleSchema` `:288`, `uuidSchema` `:19`, `ActionResult` `:314`. Adicionar aqui `ProofType`, `PROOF_TYPES` (`{value,label,description}`), `KnowledgeBaseProof`, `proofSchema`, `ProofInput`.
- `src/actions/knowledge-base.ts` -- `getIcebreakerExamples` `:433`, `create…` `:471`, `update…(id,data)` `:521`, `delete…(id)` `:579`. Copiar o fluxo (safeParse → uuid → `getCurrentUserProfile` → `hasAdminAccess` → `createClient` → `.eq("tenant_id", profile.tenant_id)`). `getProofs` lista todas (autorizadas e não), ordem `created_at` asc.
- `src/hooks/use-icebreaker-examples.ts` -- molde do hook (`QUERY_KEY`, invalidação de `["knowledge-base","context"]` em toda mutação).
- `src/components/settings/IcebreakerExamplesForm.tsx` -- molde do form (Dialog add/edit, AlertDialog delete, `Select` de categoria, `EmptyState`, skeleton, toast). Na Prova: `Select` de tipo obrigatório, `Textarea` de texto, `Input` de setor, `Switch` "Autorizado para uso" (default desligado), badge "Autorizado"/"Não autorizado" no card.
- `src/components/settings/KnowledgeBaseTabs.tsx` -- `grid-cols-5` → `grid-cols-6`; aba `proofs` "Provas" depois de "Ice Breakers", Card com título "Provas" e descrição explicando que só itens autorizados podem ser citados pela IA.
- `src/lib/services/knowledge-base-context.ts` -- `KnowledgeBaseContext` `:35-40` (+`proofs?`), `formatEmailExamples` `:207` (molde de `formatAuthorizedProofs`), `buildAIVariables` `:282` (fallback `:287-292`; trocar `authorized_proofs: ""` `:343-344`). Módulo puro, importado no cliente.
- `src/app/api/knowledge-base/context/route.ts` -- `fetchEmailExamples` `:76-92` (molde de `fetchProofs`), `Promise.all` `:121`, objeto `:129`.
- `src/app/api/ai/campaign-structure/route.ts` -- `getKnowledgeBaseContext` `:111-145`; adicionar consulta das provas (erro → `[]`).
- `src/lib/agent/steps/create-campaign-step.ts` -- `loadKBContext` `:654-685`; adicionar consulta das provas (erro → `[]`) e só devolver `null` se company, tone, icp **e** provas estiverem vazios. `authorizedProofs: aiVars.authorized_proofs` `:1044` já leva ao revisor.
- Leitura apenas: `src/lib/ai/prompts/defaults.ts:13-27` (`PROOF_RULE_BLOCK`), `src/lib/ai/copy-reviewer.ts:167`, `src/app/api/ai/review-email/route.ts:148` — já consomem `authorized_proofs`.
- Testes: `__tests__/unit/actions/knowledge-base.test.ts` (padrão de CRUD Icebreaker `:657-949`), `__tests__/unit/hooks/use-icebreaker-examples.test.tsx`, `__tests__/unit/components/settings/icebreaker-examples-form.test.tsx`, `__tests__/unit/components/settings/knowledge-base-tabs.test.tsx` (conta/ordem das abas `:58`), `__tests__/unit/lib/services/knowledge-base-context.test.ts:281-285` (hoje espera `""`), `__tests__/unit/lib/agent/steps/create-campaign-step.test.ts:333-345` (mock de `from()` por tabela), `__tests__/helpers/mock-supabase.ts` (`createMockSupabaseClient`, `mockTableResponse`).

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/00066_create_knowledge_base_proofs.sql` -- NOVO: tabela `knowledge_base_proofs` (`id`, `tenant_id` FK `tenants` ON DELETE CASCADE, `proof_type TEXT NOT NULL CHECK IN ('case','numero','cliente_referencia','certificacao','tempo_mercado')`, `text TEXT NOT NULL`, `sector TEXT NULL`, `is_authorized BOOLEAN NOT NULL DEFAULT false`, `created_at`/`updated_at`), índice por tenant, trigger de `updated_at`, RLS: SELECT `tenant_id = get_current_tenant_id()`; INSERT/UPDATE/DELETE com `AND is_admin()`. COMMENTs. -- AC1, AC3.
- `src/types/knowledge-base.ts` -- tipos, `PROOF_TYPES` (rótulos: Case, Número, Cliente de referência, Certificação, Tempo de mercado) e `proofSchema` (`proof_type` enum, `text` 1..500, `sector` opcional até 100 com vazio virando ausente, `is_authorized` boolean). -- fonte única.
- `src/actions/knowledge-base.ts` -- `getProofs`, `createProof`, `updateProof(id,data)`, `deleteProof(id)` (sector vazio → `null`). -- AC1.
- `src/hooks/use-knowledge-base-proofs.ts` -- NOVO, padrão do hook de ice breakers. -- AC1.
- `src/components/settings/ProofsForm.tsx` -- NOVO, padrão do `IcebreakerExamplesForm`. -- AC1.
- `src/components/settings/KnowledgeBaseTabs.tsx` -- aba "Provas". -- AC1.
- `src/lib/services/knowledge-base-context.ts` -- `proofs?` no contexto, `MAX_PROOFS_IN_PROMPT`, `formatAuthorizedProofs`, `authorized_proofs: formatAuthorizedProofs(proofs)`. -- AC2.
- `src/app/api/knowledge-base/context/route.ts`, `src/app/api/ai/campaign-structure/route.ts`, `src/lib/agent/steps/create-campaign-step.ts` -- carregar provas (`select("*")`, `eq tenant_id`, `order created_at asc`), erro → `[]`. -- AC2.
- Testes -- `knowledge-base-context.test.ts` (linhas da matriz: só autorizadas, nenhuma, multilinha, limite 20; trocar a expectativa da 24.8), `knowledge-base.test.ts` (CRUD de provas: não autenticado, SDR, validação, sucesso, erro do banco), `use-knowledge-base-proofs.test.tsx`, `ProofsForm.test.tsx` (lista com badge, criar com switch, excluir), `knowledge-base-tabs.test.tsx` (6 abas), novo `__tests__/unit/app/api/knowledge-base/context/route.test.ts` (provas no payload; erro da tabela → 200 com `proofs: []`), `create-campaign-step.test.ts` (provas autorizadas chegam em `authorizedProofs`; erro da tabela não quebra).

**Acceptance Criteria:**
- Given a Knowledge Base em Configurações, when o gestor abre a aba "Provas", then pode adicionar, editar e excluir itens com tipo (case, número, cliente de referência, certificação, tempo de mercado), texto, setor opcional e "autorizado para uso" sim/não, e a lista mostra se cada item está autorizado.
- Given provas cadastradas, when o contexto da KB é montado para prompts (editor manual via `/api/knowledge-base/context`, rota `campaign-structure` e agente), then só as autorizadas entram em `authorized_proofs` como lista fechada, e o prompt renderizado mostra o bloco "PROVAS AUTORIZADAS (LISTA FECHADA…)".
- Given a mudança de schema, when a story é concluída, then existe só a migration aditiva `00066`, não aplicada pelo agente, e o Fabossi recebe a instrução de aplicá-la antes do deploy.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 25 findings — high 0, medium 2, low 19, false 4, maybe-false 0
- findings:
  - `low` `reject` [blind] Limites de 500/100 caracteres só no app, sem CHECK no banco — toda escrita passa pelas server actions com `proofSchema` e o RLS só deixa admin escrever; adicionar CHECK é guarda nova para um caminho (SQL direto) que ninguém usa no dia a dia.
  - `low` `reject` [blind] Migration não é reexecutável (trigger/policies sem guarda) — mesmo padrão de todas as migrations do repo (ex.: 00036); a guarda exigiria `DROP … IF EXISTS` (vetado pelo CLAUDE.md) ou bloco `DO $$`, complexidade para um reaplique parcial improvável.
  - `low` `reject` [blind] `created_at`/`updated_at` anuláveis vs. tipo `string` — só um INSERT com NULL explícito chega lá e nenhum caminho faz isso; mesmo padrão das tabelas de exemplos.
  - `low` `reject` [blind] Provas além de 20 autorizadas somem do prompt sem aviso — teto definido no spec; tenants com mais de 20 provas autorizadas são improváveis, e avisar na UI é superfície nova.
  - `false` `reject` [blind] SDR vê botões de adicionar/editar/excluir — refutação: `src/components/settings/SettingsTabs.tsx:13` registra que o middleware redireciona não-admins antes de chegar em Configurações; o SDR não abre a aba.
  - `low` `reject` [blind] update/delete de id inexistente: erro genérico / sucesso silencioso — mesmo comportamento das ações de ice breakers e exemplos; só acontece com duas abas concorrentes, e o fix acrescenta ramos.
  - `medium` `patch` [blind] Consulta das provas sequencial + nada mostra que `campaign-structure` usa `authorized_proofs` — a parte sequencial é ~1 round-trip a mais (low, igual às 3 consultas já sequenciais); a parte de `campaign-structure` é real e foi agrupada com o achado da verification-gap abaixo (mesma causa).
  - `low` `reject` [blind] Erro logado a cada request até a migration ser aplicada — o operator action manda aplicar a migration antes do deploy; antes disso o log é só local.
  - `low` `reject` [blind] Falta nota de impacto nos 3 pontos do cliente — o fix é editar a spec; as Completion Notes do CLAUDE.md estão no Auto Run Result abaixo.
  - `low` `reject` [blind] Spinner de exclusão não aparece / `proofToDelete` não é limpo no cancelar — cosmético e idêntico ao `IcebreakerExamplesForm`; `openDeleteDialog` sempre sobrescreve o id.
  - `false` `reject` [blind] Setor não é usado para relevância — refutação: o setor vai na linha (`(setor: X)`) e o `PROOF_RULE_BLOCK` já manda não citar nenhuma se nenhuma for relevante; filtrar por setor está fora do que a story pede.
  - `low` `reject` [blind] Lacunas de teste (erro no form, limpar setor, retry do hook) — o teste da rota `campaign-structure` entrou no patch; o resto é cobertura de estilo sem defeito escondido.
  - `low` `reject` [edge] Fechar o dialog no meio do save e abrir outro — mesmo padrão dos forms vizinhos; depende de Esc durante o save, uso improvável.
  - `low` `reject` [edge] Dois deletes concorrentes — o AlertDialog é modal; exige clicar em outro card durante um delete em voo.
  - `low` `reject` [edge] updateProof em id inexistente (PGRST116) — mesmo motivo do achado de update/delete acima.
  - `low` `reject` [edge] deleteProof em id inexistente reporta sucesso — idem.
  - `low` `reject` [edge] `created_at` NULL ordena diferente no banco e no formatador — idem ao achado de anuláveis.
  - `low` `reject` [edge] Sem CHECK de tamanho no banco — idem ao primeiro achado.
  - `low` `reject` [edge] Migration não reexecutável — idem ao segundo achado.
  - `medium` `patch` [verification-gap] `campaign-structure` carrega as provas mas `promptVariables` não repassa `authorized_proofs`, e nenhum teste executa a rota — confirmado em `route.ts:253-267`; patch: `authorized_proofs: baseVariables.authorized_proofs` em `promptVariables` + novo `__tests__/unit/app/api/ai/campaign-structure/route.test.ts` (autorizada + não autorizada → só a linha autorizada; tabela ausente → `""`).
  - `low` `reject` [verification-gap] `enrich-icebreaker` não carrega provas — a rota monta contexto próprio (não usa `knowledge-base-context.ts`, que é o que a story cita); cai no ramo "nenhuma prova", direção segura, e quebra-gelo é sobre o contexto do lead, não prova.
  - `low` `reject` [verification-gap] Trigger sem guarda de reexecução — idem ao segundo achado.
  - `false` `reject` [intent] Spec em `in-review` sem `operator_actions` — refutação: estado intermediário da revisão; a finalização grava `status: awaiting-operator` com `operator_actions` (aplicar a migration e fazer o smoke).
  - `false` `reject` [intent] Tolerar a tabela ausente contraria o NFR7 ("código não sobe antes da migration") — refutação: tolerar não faz o código subir; a ordem de deploy fica no operator action, e a tolerância só protege o dev local, que roda contra produção.
  - `low` `reject` [intent] Testes ficam em superfícies mockadas, sem tela/banco real — o smoke real depende da migration aplicada, que só o Fabossi faz; ficou como operator action.

## Design Notes

- **Leitura para todo o tenant:** `knowledge_base` e os exemplos são SELECT só-admin, então para SDR o contexto já volta vazio. Provas são o que impede invenção. Se o SDR não lesse as provas, o agente dele cairia em "nenhuma prova", que é seguro mas inútil. Ler não expõe nada sensível, e a escrita segue só-admin.
- **Default "não autorizado":** nada é citado sem decisão explícita do gestor.

## Verification

**Commands:**
- `npm run lint` -- sem erros (warnings ok).
- `npm run typecheck` -- sem erros.
- `npm run test:run` -- todos verdes.

**Manual checks (if no CLI):**
- A migration `00066` só tem CREATE TABLE/INDEX/TRIGGER/POLICY, COMMENT e o `ALTER TABLE public.knowledge_base_proofs ENABLE ROW LEVEL SECURITY` da própria tabela nova; nenhum `DROP`, `UPDATE`, `DELETE FROM` nem `ALTER` de outra tabela.

## Auto Run Result

Status: awaiting-operator

**Resumo:** a Knowledge Base ganhou a aba "Provas", onde o gestor cadastra itens com tipo (case, número, cliente de referência, certificação, tempo de mercado), texto, setor opcional e "autorizado para uso" (desligado por padrão). Só os itens autorizados entram em `authorized_proofs`, numa lista fechada (`- <Tipo>: <texto> (setor: X)`, ordem de criação, até 20). Essa lista alimenta o bloco "PROVAS AUTORIZADAS (LISTA FECHADA…)" da 24.8 e o revisor da 24.9, no editor manual, na rota `campaign-structure` e no agente. A tabela vem na migration aditiva `00066`, **não aplicada**. Enquanto ela não for aplicada, o código segue com `proofs: []` e se comporta como antes.

**Arquivos:**
- `supabase/migrations/00066_create_knowledge_base_proofs.sql`: tabela `knowledge_base_proofs` nova. RLS: leitura para o tenant, escrita só admin.
- `src/types/knowledge-base.ts`: `PROOF_TYPES`, `KnowledgeBaseProof`, `proofSchema`.
- `src/actions/knowledge-base.ts`: `getProofs`/`createProof`/`updateProof`/`deleteProof`.
- `src/hooks/use-knowledge-base-proofs.ts`: hook novo (TanStack). Invalida o contexto da KB a cada mudança.
- `src/components/settings/ProofsForm.tsx`: form novo da aba (Dialog, Switch e badge Autorizado/Não autorizado).
- `src/components/settings/KnowledgeBaseTabs.tsx`: 6ª aba "Provas".
- `src/lib/services/knowledge-base-context.ts`: `proofs?` no contexto, `formatAuthorizedProofs` e `MAX_PROOFS_IN_PROMPT`.
- `src/lib/services/knowledge-base-proofs.ts`: loader `fetchKnowledgeBaseProofs`, que nunca lança (erro vira `[]`).
- `src/app/api/knowledge-base/context/route.ts`, `src/app/api/ai/campaign-structure/route.ts`, `src/lib/agent/steps/create-campaign-step.ts`: carregam as provas. O `campaign-structure` também repassa `authorized_proofs` ao prompt.
- Testes: `knowledge-base-context.test.ts`, `knowledge-base.test.ts`, `use-knowledge-base-proofs.test.tsx`, `ProofsForm.test.tsx`, `knowledge-base-tabs.test.tsx`, `app/api/knowledge-base/context/route.test.ts` (novo), `app/api/ai/campaign-structure/route.test.ts` (novo) e `create-campaign-step.test.ts`.

**Review:** 25 achados.
- 1 patch, de severidade medium, agrupando 2 achados: a rota `campaign-structure` não repassava `authorized_proofs`. Corrigido, com teste.
- 0 deferidos.
- 23 rejeitados, cada um com o motivo no Review Triage Log: 19 low pelo critério de uso improvável ou guarda nova, e 4 false.

**Follow-up review recomendado:** false. Esta passada fez 1 patch medium e nenhum high.

**Verificação:**
- `npm run lint`: 0 erros (134 warnings que já existiam).
- `npm run typecheck`: limpo.
- `npm run test:run`: 428 arquivos, 8081 testes passando e 2 skipped.
- A migration foi conferida manualmente. Ela só tem CREATE TABLE/INDEX/TRIGGER/POLICY, COMMENT e o `ENABLE ROW LEVEL SECURITY` da própria tabela nova.

**Completion Notes (CLAUDE.md, regra nº 1):**
- **O que pode mudar para o cliente:**
  - Tela Configurações > Knowledge Base: aba nova "Provas".
  - Tabela nova `knowledge_base_proofs`, ainda não aplicada.
  - Rotas `/api/knowledge-base/context` e `/api/ai/campaign-structure` e o step de criação de campanha do agente: passam a ler as provas.
  - Prompts: com provas autorizadas, o editor manual, a estrutura de campanha e o agente recebem a lista fechada. Sem provas autorizadas, o comportamento é o de hoje.
  - Nenhum job, Edge Function, secret ou integração foi tocado.
- **Os 3 pontos**, verificados por **análise do diff**, não por smoke real. O smoke depende da migration aplicada.
  1. Campanhas rodando, webhook e `reply-sweep`: nada tocado.
  2. Busca de leads (Apollo e demais fontes): nada tocado.
  3. Criação de campanha e export/ativação no Instantly: nenhuma trava nova. O agente só faz uma consulta a mais, que em caso de erro vira `[]` e não interrompe o step. O export (`instantly.ts`) não foi tocado.
- Nenhum dos 3 pontos pode ser afetado, então não houve parada.

**Riscos residuais:**
- O smoke real (tela e banco) fica pendente até o Fabossi aplicar a `00066`.
- A rota `enrich-icebreaker` (manual) continua sem provas. Ela cai no ramo seguro "nenhuma prova".
- Se o código subir para produção antes da migration, a aba Provas mostra "Erro ao buscar provas" e cada request loga o erro, mas nada quebra.

**Operator actions:** veja `operator_actions` no frontmatter. São três: aplicar a `00066` antes do deploy, conferir a tabela e as policies, e fazer o smoke da aba Provas e do prompt.


## Migration e smoke (2026-10-20)

- Fabossi aplicou a `00066_create_knowledge_base_proofs.sql` no SQL Editor de produção (`kdgogyqyaxncqoyklyxx`).
- Conferido pelo Claude Code com `scripts/db-ro.sh` (somente leitura): `public.knowledge_base_proofs` existe com RLS ligado, as 4 policies (SELECT para o tenant; INSERT/UPDATE/DELETE só admin) e o trigger `update_knowledge_base_proofs_updated_at`. A tabela está vazia (as provas de teste foram removidas).
- Fabossi fez o smoke na tela, rodando local (`next dev -p 3100`, código da branch `epic/23-plataforma-higiene`): aba Provas com uma prova autorizada e uma não autorizada, e só a autorizada aparecendo na geração.
- O código ainda não está em produção (só na branch do épico); a `main` não lê a tabela.

## Operator Confirmation

Confirmed 2026-10-20: the external actions this story owed were carried out.

- Aplicar a migration supabase/migrations/00066_create_knowledge_base_proofs.sql no SQL Editor do Supabase de produção (kdgogyqyaxncqoyklyxx) antes do deploy deste código, na janela de deploy combinada do Marco 1 (24.1/24.7/23.1/23.3).
- Depois de aplicar, conferir com scripts/db-ro.sh que a tabela public.knowledge_base_proofs existe com RLS ligado e as 4 policies (SELECT para o tenant; INSERT/UPDATE/DELETE só admin).
- Fazer o smoke na tela: em Configurações > Knowledge Base > Provas, cadastrar uma prova autorizada e uma não autorizada, e confirmar no editor manual (ou no agente, parando antes da aprovação da etapa Criação de Campanha) que só a autorizada aparece no bloco PROVAS AUTORIZADAS do prompt; depois remover as provas de teste se não forem reais.

_Appended by the bmad-loop orchestrator (`bmad-loop confirm`, #335): a human confirmed these external actions out of band, and the story was advanced from `awaiting-operator` to `done`._
