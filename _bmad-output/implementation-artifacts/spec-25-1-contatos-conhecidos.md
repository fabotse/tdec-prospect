---
title: 'Story 25.1 — Contatos conhecidos'
type: 'feature'
created: '2026-11-16'
status: awaiting-operator
baseline_revision: '941e4b2109cfbdbea7e2815cd3c232647a0b1e87'
review_loop_iteration: 0
followup_review_recommended: false
operator_actions:
  - "Aplicar a migration supabase/migrations/00075_create_known_contacts.sql no SQL Editor do projeto kdgogyqyaxncqoyklyxx (rodar antes o PRE-CHECK do cabeçalho e terminar com NOTIFY pgrst, 'reload schema';)."
  - "Conferir que a chave do Treg está configurada em Configurações → Integrações do tenant do cliente (a busca de LinkedIn usa a mesma chave do dossiê da 24.19)."
  - "Depois de aplicar, abrir Radar → Contatos conhecidos como gestor e conferir adicionar (com e sem LinkedIn, escolhendo um candidato da busca), editar, remover e importar um CSV de teste; depois remover os contatos de teste."
  - "Numa oportunidade com reunião marcada, clicar em 'Contato conhecido' e conferir que o lead aparece na lista com relação 'Reunião marcada'; clicar de novo e conferir o aviso 'já é contato conhecido'; depois remover o contato de teste."
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-25-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Não existe cadastro das pessoas com quem a TDec já tem relacionamento (clientes atuais, ex-clientes, parceiros). Sem ele, a 25.2 não tem quem acompanhar quando essas pessoas mudam de empresa.

**Approach:** Migration aditiva `00075` com a tabela `known_contacts` (RLS por tenant: leitura para membro, escrita só gestor/diretor). Nova página Radar → Contatos conhecidos com tabela, adicionar, editar, remover e importar CSV (padrão da Lista de Supressão 23.5). Botão "Contato conhecido" no card da oportunidade com reunião marcada. Para contato sem LinkedIn, busca sob demanda via `treg.web.search` (GO do spike 24.11) com lista de candidatos e confirmação antes de salvar.

## Boundaries & Constraints

**Always:**
- Migration só aditiva e idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, `DROP TRIGGER IF EXISTS`), cabeçalho "NÃO APLICAR sem o OK do Fabossi", pre-check, impacto e rollback. Agente escreve, nunca aplica.
- Escrita checada duas vezes: `hasAdminAccess` na action e RLS `is_admin()` no banco. SDR vê a página só em leitura (sem botões de escrita, sem botão no card).
- Dados normalizados no servidor, mesmo vindos do cliente (nome aparado, domínio via `normalizeSuppressionValue`, LinkedIn via `normalizeLinkedinProfileUrl`).
- Busca de LinkedIn só quando o gestor pede (nunca em lote, nunca em job), sempre com confirmação explícita antes de gravar a URL. Cada chamada ao Treg: teto `X-Treg-Route-Max-Cost` US$ 0,01, `Idempotency-Key` determinística, `X-Treg-Meta` `feature=contatos-conhecidos-25-1,tenant=<id>`, 1 linha em `api_usage_logs` (`treg`, `treg.web.search`, custo em `estimated_cost`). Para o Treg vão só nome + empresa/domínio.
- Sem a migration aplicada, a página mostra erro com "Tentar novamente" e o botão do card mostra toast de erro; nada mais quebra.

**Never:**
- Job periódico, detecção de mudança de empresa ou tabela de sinais (25.2). Painel/contador do Radar (25.4).
- Rotas `people.*` do Treg, Apollo, SignalHire ou qualquer outro provedor para a busca.
- Tocar em `instantly.ts`, webhook, `reply-sweep`, busca de leads, import de leads, campanhas, export/ativação, `pg_cron`, Edge Functions, secrets ou env. O card da oportunidade só ganha um botão; a triagem existente não muda.
- `UPDATE`/`DELETE` em dados existentes de outras tabelas; alterar objeto existente no banco.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ADD_COM_LINKEDIN | nome, empresa, relação, `https://br.linkedin.com/in/Joao-Silva/?trk=x` | grava com `linkedin_url=https://www.linkedin.com/in/joao-silva`, `source='manual'` | — |
| ADD_SEM_LINKEDIN | nome + empresa, LinkedIn vazio, clica Salvar | abre dialog "Buscar LinkedIn": até 5 candidatos (título, trecho, URL); "Usar este" grava com a URL escolhida; "Salvar sem LinkedIn" grava sem | — |
| LOOKUP_VAZIO_OU_FALHA | Treg sem chave, timeout, HTTP erro ou 0 perfis `/in/` | dialog mostra o motivo e só oferece "Salvar sem LinkedIn"/"Cancelar" | action devolve erro, nunca lança; uso logado como `failed` (exceto chave ausente: sem chamada, sem log) |
| SEM_EMPRESA | nome sem empresa e sem domínio | não grava | "Informe a empresa ou o domínio" |
| LINKEDIN_INVALIDO | `linkedin.com/company/x` ou `joao` | não grava | "URL do LinkedIn inválida (use linkedin.com/in/...)" |
| DUPLICADO | LinkedIn já cadastrado (add/edit) | não grava | toast "já existe um contato com esse LinkedIn" |
| EDITAR | gestor muda cargo/empresa/relação | linha atualizada, `updated_at` novo | — |
| CSV_OK | `nome;cargo;empresa;dominio;linkedin;relacao`, 3 linhas válidas | 3 contatos, `source='import_csv'`, sem busca de LinkedIn | relatório: 3 aceitas, 0 ignoradas |
| CSV_MISTO | linha sem nome, sem empresa/domínio, relação desconhecida, LinkedIn inválido, LinkedIn repetido no arquivo ou já existente | só as válidas entram | relatório com nº da linha e motivo |
| CSV_SEM_COLUNA | cabeçalho sem coluna de nome ou de relação | nada é gravado | "colunas obrigatórias: nome e relação" |
| BUSCAR_DEPOIS | contato da tabela sem LinkedIn, gestor clica "Buscar LinkedIn" | mesmo dialog de candidatos; "Usar este" atualiza o contato | mesmo tratamento do LOOKUP |
| OPORTUNIDADE_1_CLIQUE | card com `status='meeting_booked'` e lead, gestor clica "Contato conhecido" | grava nome, cargo, empresa, domínio do e-mail (exceto e-mail pessoal), LinkedIn do lead, `relation_type='reuniao_marcada'`, `source='oportunidade'`, `lead_id` | toast de sucesso |
| OPORTUNIDADE_REPETIDA | mesmo lead já é contato conhecido | nada novo é gravado | toast "já é contato conhecido" |
| OPORTUNIDADE_SEM_LEAD | card sem lead ou status ≠ `meeting_booked` | botão não aparece; action recusa com erro | — |
| SDR | SDR abre `/radar/known-contacts` ou o card | vê tabela e busca, sem botões de escrita; sem botão no card | actions de escrita → "Apenas gestores…"; RLS barra |
| TABELA_AUSENTE | migration não aplicada | erro com "Tentar novamente" | action devolve erro, sem lançar |

</intent-contract>

## Code Map

- `supabase/migrations/00071_create_suppression_entries.sql` -- modelo de cabeçalho, tabela por tenant e RLS (leitura membro / escrita `is_admin()`). `00066_create_knowledge_base_proofs.sql:27-32` -- trigger `update_updated_at_column()`. Última migration: `00074`; próxima: `00075`.
- `__tests__/unit/migrations/00071-suppression-entries.test.ts` -- padrão PGlite (stubs `auth.uid()`, `get_current_tenant_id()`, `is_admin()`, `SET ROLE authenticated`).
- `src/actions/suppression.ts` -- padrão de actions (`getCurrentUserProfile` → `hasAdminAccess` → `createClient` com `.eq("tenant_id", …)`, `ActionResult`, paginação de 1000, import em lotes com lookup em lotes de 100, tabela ausente vira erro). Teste: `__tests__/unit/actions/suppression.test.ts`.
- `src/lib/utils/suppression.ts:48` -- `normalizeSuppressionValue(raw)` (reusar para o domínio: aceitar só `type==='domain'`). `parseSuppressionCsv` (`:107`) -- modelo de leitura do CSV.
- `src/lib/utils/csv-parser.ts:103` -- `parseCSVData(text)`. `src/components/settings/SuppressionImportDialog.tsx:31` -- `decodeCsv` (UTF-8 com fallback windows-1252): mover para `src/lib/utils/csv-decode.ts` e reexportar/importar nos dois dialogs.
- `src/hooks/use-suppression-list.ts`, `src/components/settings/SuppressionList.tsx`, `SuppressionAddForm.tsx`, `SuppressionImportDialog.tsx` -- modelo de hook e de tela (busca sem acento, estados loading/erro/vazio, confirmação ao remover, relatório de import, `e.target.value = ""`).
- `src/lib/services/treg.ts` -- `TregService.call(apiKey, TREG_ENDPOINTS.webSearch, {q, limit}, {maxCostUsd, idempotencyKey, meta, timeoutMs})`, nunca lança; resposta em `json.output.results[]` (`{url, title, snippet}`), custo em `costMicro`, `costUnknown` sem resposta.
- `src/lib/agent/steps/research-accounts-step.ts:1095-1180` -- referência de contabilidade do Treg (sem resposta → custo = teto, `costEstimated`). `:118` -- `buildIdempotencyKey` (sha256).
- `src/lib/agent/service-keys.ts` -- `readServiceApiKey(tenantId, "treg")` → `ok|missing|decrypt_error`. `src/lib/services/usage-logger.ts` -- `logApiUsage` (nunca lança; `UsageServiceName` já tem `treg`).
- `src/lib/agent/account-suppression.ts:27` -- `PERSONAL_EMAIL_DOMAINS` (não exportado): exportar `isPersonalEmailDomain(domain)` sem mudar o comportamento atual.
- `src/components/opportunities/OpportunityCard.tsx:76-87,580-597` -- padrão de prop opcional + botão com `stopPropagation` (`onOpenMeetingPrep`). `OpportunitiesPageContent.tsx:234` -- onde passa as props. `src/hooks/use-opportunities.ts:27-38` -- `OpportunityLeadData` (firstName, lastName, email, companyName, title, linkedinUrl).
- `src/components/common/Sidebar.tsx:56-78` -- `navItems` com `subItems` (modelo: Leads). Ícone `Radar` já é do Technographic; usar `RadioTower`. Teste: `__tests__/unit/components/Sidebar.test.tsx`.
- `src/app/(dashboard)/opportunities/page.tsx` -- padrão de página com cabeçalho. `src/hooks/use-user.ts:223` -- `useUser().isAdmin`. `src/lib/auth/capabilities.ts` -- `hasAdminAccess`.

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/00075_create_known_contacts.sql` -- tabela `known_contacts` (id, `tenant_id` FK tenants CASCADE, `full_name` TEXT NOT NULL CHECK não vazio, `title`, `company_name`, `company_domain`, `linkedin_url` TEXT NULL, `relation_type` CHECK `cliente_atual|ex_cliente|parceiro|reuniao_marcada`, `source` CHECK `manual|import_csv|oportunidade`, `lead_id` uuid NULL FK leads ON DELETE SET NULL, `created_by` uuid NULL FK profiles ON DELETE SET NULL, `created_at`, `updated_at`), CHECK `company_name IS NOT NULL OR company_domain IS NOT NULL`, UNIQUE parciais `(tenant_id, linkedin_url) WHERE linkedin_url IS NOT NULL` e `(tenant_id, lead_id) WHERE lead_id IS NOT NULL`, índice `(tenant_id, created_at DESC)`, trigger `updated_at`, RLS: SELECT membro; INSERT/UPDATE/DELETE `tenant = get_current_tenant_id() AND is_admin()`. Cabeçalho com pre-check, impacto e rollback.
- `src/types/known-contact.ts` -- tipos, `KNOWN_CONTACT_RELATION_LABELS` (Cliente atual, Ex-cliente, Parceiro, Reunião marcada), `KNOWN_CONTACT_SOURCE_LABELS`, schema zod de entrada.
- `src/lib/utils/known-contacts.ts` -- `normalizeLinkedinProfileUrl(raw)` (aceita subdomínio de país, sem protocolo, query, barra final; exige `/in/<slug>`; slug minúsculo e decodificado; senão `null`); `parseKnownContactRelation(raw)` (chave ou rótulo, sem acento/caixa; `cliente`→`cliente_atual`, `ex cliente`/`ex-cliente`→`ex_cliente`); `normalizeKnownContactInput(input)` → dados normalizados ou motivo; `parseKnownContactsCsv(text)`; `buildLinkedinQuery(name, company, domain)` (`"<nome>" <empresa|domínio> site:linkedin.com/in`); `pickLinkedinCandidates(results)` (só perfis `/in/`, deduplicados, máx. 5, com título e trecho).
- `src/lib/utils/csv-decode.ts` -- `decodeCsv` movido do `SuppressionImportDialog.tsx` (que passa a importar daqui).
- `src/lib/agent/account-suppression.ts` -- exportar `isPersonalEmailDomain(domain)`.
- `src/actions/known-contacts.ts` -- `getKnownContacts()` (membro; páginas de 1000), `addKnownContact(input)`, `updateKnownContact(id, input)`, `removeKnownContact(id)`, `importKnownContacts(rows)` (até 5000; normaliza de novo, descarta repetidas no arquivo e LinkedIn já existente; lotes), `addKnownContactFromOpportunity(opportunityId)` (lê oportunidade + lead no servidor pelo tenant; exige `meeting_booked` e lead; idempotente por `lead_id`), `findKnownContactLinkedin({fullName, companyName, companyDomain})` (chave via `readServiceApiKey`; uma chamada `treg.web.search` `limit: 10`, timeout 45 s; loga uso; devolve candidatos). Todas as de escrita/busca exigem admin; 23505 → mensagem de duplicado.
- `src/hooks/use-known-contacts.ts` -- query + mutations com invalidate (`onSettled` no import) + mutation de busca de LinkedIn.
- `src/components/radar/KnownContactsList.tsx`, `KnownContactForm.tsx` (dialog adicionar/editar), `LinkedinLookupDialog.tsx`, `KnownContactsImportDialog.tsx` -- tabela Nome/Cargo/Empresa/LinkedIn/Relação/Origem/Data (+ Editar, Buscar LinkedIn quando vazio, Remover com confirmação — só admin), busca client-side sem acento, contador, loading/erro/vazio; form abre o lookup ao salvar sem LinkedIn; import com instrução de formato e relatório.
- `src/app/(dashboard)/radar/known-contacts/page.tsx` -- página "Contatos conhecidos" no padrão de Oportunidades.
- `src/components/common/Sidebar.tsx` -- item "Radar" (`RadioTower`, `/radar/known-contacts`) com subitem "Contatos conhecidos", visível a todos.
- `src/components/opportunities/OpportunityCard.tsx` + `OpportunitiesPageContent.tsx` -- prop opcional `onAddKnownContact`; botão "Contato conhecido" (`UserPlus`, `stopPropagation`) só com `status==='meeting_booked'`, lead presente e admin (PageContent só passa a prop para admin); toasts de sucesso/repetido/erro.
- Testes -- migration em PGlite (checks, unique parciais, RLS SDR lê e não escreve, gestor escreve/edita, isolamento entre tenants, trigger); utils (matriz de LinkedIn, relações, CSV, query, candidatos); actions (admin/SDR, duplicado, import, oportunidade elegível/inelegível/repetida, lookup: chave ausente sem chamada, falha logada como `failed`, sucesso com custo logado, teto e meta enviados); hook; componentes (SDR sem botões, fluxo add sem LinkedIn → candidatos → "Usar este"/"Salvar sem LinkedIn", relatório do import, botão do card só em `meeting_booked` com a prop); Sidebar; `SuppressionImportDialog` continua passando.

**Acceptance Criteria:**
- Given a migration aplicada e um gestor logado, when abre Radar → Contatos conhecidos, then vê a tabela e consegue adicionar, editar, remover e importar CSV.
- Given um gestor numa oportunidade com reunião marcada, when clica "Contato conhecido", then o lead aparece na lista de contatos conhecidos sem outro passo.
- Given um contato sem LinkedIn, when o gestor salva, then o sistema mostra os perfis candidatos encontrados e só grava a URL que o gestor confirmar.

## Spec Change Log

## Review Triage Log

### 2026-11-16 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 22, false 3, maybe-false 1
- findings:
  - `[medium]` `[patch]` (blind) Import não deduplica contatos sem LinkedIn; reimportar o CSV ou repetir após falha parcial duplica — dedup por nome + empresa/domínio (dobrados) no arquivo e contra os contatos sem LinkedIn do tenant (lidos em páginas de 1000), com motivos próprios no relatório; testes novos.
  - `[low]` `[patch]` (blind) 5000 linhas podem passar do limite de 1 MB do corpo da server action — `KNOWN_CONTACTS_IMPORT_MAX_ROWS` baixou para 2000 (texto do dialog vem da constante); teste ajustado.
  - `[low]` `[reject]` (blind) Falha ao salvar a partir do lookup e Cancelar perde o que foi digitado — o dialog fica aberto em erro (dá para escolher outro candidato ou salvar sem LinkedIn); só perde ao cancelar; reabrir o form exigiria estado novo.
  - `[low]` `[reject]` (blind) Dialog do lookup sem "Tentar novamente" — fechar e clicar "Buscar LinkedIn" na tabela refaz a busca; botão novo adiciona ramo.
  - `[maybe-false]` `[reject]` (blind) `Idempotency-Key` fixa por nome+empresa devolveria resultado antigo — depende de quanto tempo o Treg guarda a chave (não documentado no spike); se real, seria low (perfil de LinkedIn da mesma pessoa/empresa muda pouco).
  - `[false]` `[reject]` (blind) Completion Notes ausentes — escritas no Finalize desta execução.
  - `[false]` `[reject]` (blind) `sprint-status.yaml` não atualizado — o arquivo é do orquestrador e esta execução está proibida de escrevê-lo.
  - `[low]` `[reject]` (blind) Botão do card não mostra que o lead já é contato e aparece para lead sem empresa nem e-mail corporativo — o clique responde com toast claro; mostrar o estado exigiria dado novo na listagem de oportunidades.
  - `[low]` `[reject]` (blind) 1-clique com LinkedIn já cadastrado não liga o `lead_id` ao contato existente — a pessoa já é contato conhecido (resposta verdadeira); ligar exigiria UPDATE em outro registro e um ramo novo.
  - `[low]` `[reject]` (blind) RLS não impede `lead_id` de outro tenant via PostgREST direto — exige gestor forjando request com UUID de lead de outro tenant; a action lê o lead pelo tenant.
  - `[low]` `[reject]` (blind) Banco não exige valores normalizados (empresa vazia, formato do LinkedIn) — todos os escritores passam pela normalização da action; mesmo critério da 23.5.
  - `[low]` `[reject]` (blind) Sem limite de frequência para buscas pagas — cada chamada custa ~US$ 0,00015 (teto US$ 0,01) e só roda por clique de gestor.
  - `[low]` `[reject]` (blind) Editar contato sem LinkedIn não abre a busca — a AC do épico fala em "cadastrado"; a edição segue a matriz (EDITAR sem busca) e a tabela tem "Buscar LinkedIn".
  - `[low]` `[reject]` (edge) Leitura de arquivo antiga pode sobrescrever a nova — o dialog limpa as linhas antes de ler; arquivo local carrega quase instantâneo; exige troca de arquivo no meio da leitura.
  - `[low]` `[reject]` (edge) 23505 concorrente derruba o lote inteiro do import — exige dois gestores importando o mesmo contato ao mesmo tempo; mesmo critério da 23.5.
  - `[low]` `[patch]` (edge) Limite de 1 MB da server action — mesma causa do 2º achado; corrigido junto.
  - `[low]` `[reject]` (edge) 1-clique não aplica o limite de 200 caracteres — lead com nome/empresa > 200 é irreal; o banco não tem limite e nada quebra.
  - `[low]` `[reject]` (edge) Nome só com aspas gera busca paga com termo vazio — entrada absurda de gestor; custo ~US$ 0,00015.
  - `[low]` `[reject]` (edge) Lookup sem limite de tamanho da entrada — só gestor chama; custo por chamada tem teto.
  - `[low]` `[reject]` (edge) Dois cards clicados ao mesmo tempo reabilitam o primeiro botão — a action é idempotente por `lead_id`; no máximo um toast repetido.
  - `[low]` `[reject]` (edge) Paginação por offset pode repetir/pular contato durante a leitura — só com > 1000 contatos e escrita simultânea.
  - `[low]` `[reject]` (edge) Confirmar candidato em modo atualização regrava o snapshot do contato — exige outro gestor editando o mesmo contato ao mesmo tempo.
  - `[medium]` `[patch]` (edge) Claim "descarta repetidas no arquivo" não vale para linhas sem LinkedIn — mesma causa do 1º achado; corrigido junto.
  - `[low]` `[reject]` (edge) Claim da AC "quando o gestor salva" não vale na edição — mesmo motivo do 13º achado.
  - `[low]` `[patch]` (verification-gap) Lotes do lookup (100), inserts (500), falha parcial e 23505 do import sem teste — testes com 150 URLs (lotes 100+50), 600 linhas com falha no 2º insert ("500 linhas já tinham entrado") e 23505 ("outro gestor").
  - `[low]` `[patch]` (verification-gap) Pendência por card no `OpportunitiesPageContent` nunca observada — teste com a mutation pendente: só o botão do card clicado fica desabilitado.
  - `[low]` `[reject]` (verification-gap, other) 1-clique com LinkedIn de outro contato não liga o lead — mesmo motivo do 9º achado.
  - `[false]` `[reject]` (intent) Spec sem `awaiting-operator`/`operator_actions` e sem commit — feitos no Finalize: aplicar a 00075, conferir a chave do Treg e o smoke viraram `operator_actions`.

### 2026-11-16 — Review do Codex (orquestrador, rodada 1)
- `[medium]` `[patch]` Re-import duplicava contato que ganhou LinkedIn depois (dedup sem LinkedIn só olhava contatos com `linkedin_url` nulo) — a comparação por nome + empresa/domínio agora usa todos os contatos do tenant; teste de importar → enriquecer → reimportar.
- `[low]` `[patch]` 2000 linhas podiam passar de 1 MB no corpo da Server Action — o dialog mede os bytes do JSON (`KNOWN_CONTACTS_IMPORT_MAX_BYTES` = 900 KB) e pede para dividir o CSV; teste de componente.

### 2026-11-16 — Review do Codex (orquestrador, rodada 2)
- `[medium]` `[patch]` Mesma pessoa no CSV com e sem LinkedIn entrava duas vezes (os conjuntos de dedup eram independentes) — a linha sem LinkedIn é ignorada quando outra linha do arquivo tem o mesmo nome + empresa com LinkedIn, em qualquer ordem; testes nas duas ordens.

## Design Notes

- **Relação `reuniao_marcada`:** a AC lista cliente atual, ex-cliente e parceiro, mas também pede o lead da reunião marcada "com 1 clique". Esse lead ainda não é nenhum dos três; gravar um deles seria dado falso. O 4º valor mantém o clique único e o gestor pode editar a relação depois. A 25.2 acompanha todos os contatos com LinkedIn, qualquer que seja a relação.
- **Busca só no cadastro manual e por botão:** o import CSV e o 1-clique não buscam LinkedIn (seriam N chamadas pagas sem confirmação individual). Os contatos sem LinkedIn ficam com "Buscar LinkedIn" na tabela, que cumpre "tenta localizar e pede confirmação antes de salvar" contato a contato.
- **Provedor:** `treg.web.search` (US$ 0,00015/chamada no spike, crawl4ai/Google). As rotas `people.*` foram NO-GO no spike e o NO-GO vale aqui.
- **CSV:** cabeçalho obrigatório; colunas por nome sem acento/minúsculo — nome: `nome|name|nome completo`; cargo: `cargo|title`; empresa: `empresa|company`; domínio: `dominio|domain|site|website`; LinkedIn: `linkedin|linkedin_url|perfil`; relação: `relacao|relation|tipo|tipo de relacao`.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm run test:run` -- expected: verdes (lint sem erros; warnings como antes).

**Manual checks (if no CLI):**
- Migration lida linha a linha: só `CREATE`/`DROP POLICY IF EXISTS`/`DROP TRIGGER IF EXISTS` da tabela nova; nenhum `UPDATE`/`DELETE`; nenhum objeto existente alterado.
- Diff sem arquivos de busca/import de leads, campanha, export/ativação, webhook, `reply-sweep` ou crons.

## Completion Notes

**O que pode ter mudado para o cliente:**
- Rotas e páginas: página nova `/radar/known-contacts` e as server actions de `src/actions/known-contacts.ts`. Sidebar ganha o item "Radar" → "Contatos conhecidos" (todos veem; SDR só lê).
- Oportunidades: o card com reunião marcada e lead ganha o botão "Contato conhecido" (só gestor/diretor). Ele só lê a oportunidade e o lead e grava na tabela nova; a triagem e as outras ações não mudam.
- Integração: `treg.web.search` sob demanda (clique do gestor), teto US$ 0,01 por chamada, 1 linha em `api_usage_logs`. Para o Treg vão só nome + empresa/domínio.
- Banco (só depois de aplicada a `00075`): tabela nova `known_contacts` com RLS. Nenhum objeto existente alterado, nenhuma linha tocada, nenhum job.
- Código compartilhado: `decodeCsv` mudou para `src/lib/utils/csv-decode.ts` (o `SuppressionImportDialog` reexporta, testes da 23.5 passam) e `isPersonalEmailDomain` passou a ser exportado de `account-suppression.ts` sem mudar o comportamento.
- Sem mudança em prompts, `instantly.ts`, webhook, `reply-sweep`, Apollo, busca/import de leads, campanhas, export/ativação, Edge Functions, `pg_cron`, secrets ou env.

**Os 3 pontos (por análise do diff; sem smoke real, porque a tela depende da migration aplicada):**
1. Campanhas rodando, webhook e `reply-sweep`: nenhum arquivo tocado.
2. Busca de leads: nenhum arquivo tocado.
3. Criação de campanha e export/ativação no Instantly: nenhum arquivo tocado; nenhuma trava nova.

## Auto Run Result

Status: awaiting-operator

**Resumo:** cadastro de contatos conhecidos em Radar → Contatos conhecidos. Gestor/diretor adicionam, editam, removem e importam CSV com relatório por linha; SDR consulta em leitura. Contato salvo sem LinkedIn abre a busca de perfis via `treg.web.search` e só grava a URL que o gestor escolher (ou salva sem). No card da oportunidade com reunião marcada, "Contato conhecido" grava o lead com 1 clique (relação "Reunião marcada", idempotente por lead).

**Arquivos alterados:**
- `supabase/migrations/00075_create_known_contacts.sql` — tabela, checks, unique parciais (LinkedIn e lead por tenant), índice, trigger `updated_at`, RLS (leitura membro, escrita admin), cabeçalho com pre-check e rollback.
- `src/types/known-contact.ts`, `src/lib/utils/known-contacts.ts` — tipos/rótulos, normalização de LinkedIn/relação/contato, leitura do CSV, query e filtro de candidatos.
- `src/actions/known-contacts.ts` — listar, adicionar, editar, remover, importar, 1-clique da oportunidade e busca de LinkedIn.
- `src/hooks/use-known-contacts.ts`, `src/components/radar/*`, `src/app/(dashboard)/radar/known-contacts/page.tsx` — tela.
- `src/components/common/Sidebar.tsx` — item Radar.
- `src/components/opportunities/OpportunityCard.tsx`, `OpportunitiesPageContent.tsx` — botão do 1-clique.
- `src/lib/utils/csv-decode.ts`, `src/components/settings/SuppressionImportDialog.tsx`, `src/lib/agent/account-suppression.ts` — `decodeCsv` compartilhado e `isPersonalEmailDomain` exportado.
- Testes: migration em PGlite, utils, actions, hook, componentes, card, página de oportunidades e sidebar.

**Revisão:** 28 achados (medium 2 — mesma causa —, low 22, false 3, maybe-false 1). Patches: 1 entrada medium (dedup de contatos sem LinkedIn no import, com motivos próprios no relatório) e 3 low (limite de import 2000; testes de lotes/falha parcial/23505; teste da pendência por card). 0 deferidos. Rejeitados com motivo no Review Triage Log.

**Follow-up review recomendado: false** (patches: 1 medium, 3 low; nenhum high).

**Verificação:** `npm run lint` 0 erros (135 warnings, todos em arquivos existentes); `npm run typecheck` ok; `npm run test:run` 496 arquivos, 9874 testes ok (2 skipped). Matriz de I/O auditada: cada linha tem teste que rodou e passou. Migration lida linha a linha: só `CREATE` e `DROP POLICY/TRIGGER IF EXISTS` da tabela nova, sem `UPDATE`/`DELETE`.

**Riscos residuais:** SQL testado em PGlite com stubs, não no Supabase real; formato da resposta do `treg.web.search` assumido igual ao do dossiê (`output.results`), sem chamada real; import em lotes sem transação (falha no meio deixa lotes anteriores, com aviso); relação extra `reuniao_marcada` além das 3 da AC (Design Notes).

**Devido pelo operador:** ver `operator_actions` no frontmatter.
