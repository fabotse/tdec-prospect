---
title: 'Story 23.5 — Lista de supressão: cadastro e import'
type: 'feature'
created: '2026-10-26'
status: 'awaiting-operator'
baseline_revision: 'f5330616386b797cb041638bebbbf57120548a78'
review_loop_iteration: 0
followup_review_recommended: true
operator_actions:
  - "Aplicar a migration supabase/migrations/00071_create_suppression_entries.sql no SQL Editor do projeto kdgogyqyaxncqoyklyxx (rodar antes o PRE-CHECK do cabeçalho e terminar com NOTIFY pgrst, 'reload schema';)."
  - "Depois de aplicar, abrir Configurações → Lista de Supressão como gestor e conferir adicionar, remover e importar um CSV de teste (incluindo um CSV salvo pelo Excel em português); depois remover as entradas de teste."
  - "Logado como SDR, clicar em Configurações na sidebar e conferir que cai na Lista de Supressão só em leitura, e que /settings/integrations redireciona para /leads."
context:
  - '{project-root}/CLAUDE.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Não existe lugar para registrar domínios e e-mails que nunca podem receber campanha (clientes, negociações em andamento, concorrentes, parceiros, opt-outs). Sem essa lista, a 23.6 não tem o que aplicar nos caminhos de envio.

**Approach:** Migration aditiva `00071` com a tabela `suppression_entries` (RLS por tenant: leitura para todo membro, escrita só gestor/diretor). Server actions + hook React Query no padrão das Provas da 24.7. Nova aba Configurações → Lista de Supressão com tabela, busca, adicionar, remover e importar CSV com relatório. O SDR entra só nessa aba, em modo leitura.

## Boundaries & Constraints

**Always:**
- Migration só aditiva e idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, `DROP TRIGGER IF EXISTS`), com cabeçalho "NÃO APLICAR sem o OK do Fabossi" e rollback. Aplicada só pelo Fabossi.
- Valor sempre normalizado no servidor, mesmo vindo do cliente. Unicidade por `(tenant_id, entry_type, value)`.
- Escrita checada duas vezes: `hasAdminAccess` na action e RLS `is_admin()` no banco.
- Sem a migration aplicada, a aba mostra erro com "Tentar novamente" e nada mais quebra.
- `source` já aceita `opt_out_automatico`, para a 23.6 gravar sem `ALTER`.

**Never:**
- Aplicar a supressão em busca, import de leads, campanha, export, agente ou loop de resposta. Isso é a 23.6.
- Tocar em `instantly.ts`, webhook, `reply-sweep`, Apollo, rotas de export/ativação, jobs `pg_cron`, Edge Functions, secrets ou env.
- Liberar ao SDR qualquer outra aba de Configurações.
- `UPDATE`/`DELETE` em dados existentes, ou editar uma entrada. O ciclo é só adicionar e remover.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DOMINIO_SUJO | `https://WWW.Empresa.com.br/contato?x=1` | `domain` / `empresa.com.br` | — |
| ARROBA_DOMINIO | `@empresa.com` | `domain` / `empresa.com` | — |
| EMAIL | ` Joao@Empresa.COM ` | `email` / `joao@empresa.com` | — |
| INVALIDO | `empresa`, `joao@`, `a b.com`, vazio | não grava | motivo "valor inválido" |
| DUPLICADO_MANUAL | gestor adiciona um valor que já existe | nada é gravado | toast de aviso "já está na lista" |
| CSV_OK | `valor;motivo` com 3 linhas válidas | 3 entradas, `source='import_csv'` | relatório: 3 aceitas, 0 ignoradas |
| CSV_MISTO | linhas com valor inválido, motivo ausente ou desconhecido, repetida no arquivo, já existente | só as válidas entram | relatório com o nº da linha e o motivo de cada ignorada |
| CSV_SEM_COLUNA | cabeçalho sem coluna de valor | nada é gravado | erro "coluna de domínio/e-mail não encontrada" |
| SDR_LEITURA | SDR abre `/settings/suppression` | vê tabela e busca, sem botões de adicionar/importar/remover | action de escrita → "Apenas gestores…"; RLS barra |
| SDR_OUTRA_ABA | SDR abre `/settings/integrations` | redirect para `/leads` (como hoje) | — |
| TABELA_AUSENTE | migration não aplicada | erro com "Tentar novamente" | action devolve erro, sem lançar |

</intent-contract>

## Code Map

- `supabase/migrations/00066_create_knowledge_base_proofs.sql` -- modelo de tabela por tenant (índice, RLS leitura membro / escrita `is_admin()`, comments). `00070` -- modelo de cabeçalho "NÃO APLICAR sem o OK do Fabossi". Próximo número: `00071`.
- `__tests__/unit/migrations/00068-job-health.test.ts:1-140` -- padrão PGlite: stubs `anon`/`authenticated`, `auth.uid()` via `current_setting('test.uid')`, `tenants`, `profiles`, `get_current_tenant_id()`, `is_admin()`, `SET ROLE authenticated`.
- `src/actions/knowledge-base.ts:620-800` -- padrão de action: `getCurrentUserProfile()` → `hasAdminAccess(profile.role)` → `createClient()` com `.eq("tenant_id", profile.tenant_id)`; retorna `ActionResult` (`src/types/knowledge-base.ts:393`).
- `src/hooks/use-knowledge-base-proofs.ts` -- padrão de hook (useQuery + mutations + invalidate). Teste: `__tests__/unit/hooks/use-knowledge-base-proofs.test.tsx`; actions: `__tests__/unit/actions/knowledge-base.test.ts`.
- `src/lib/utils/csv-parser.ts:96-120` -- `parseCSVData(text)` (detecta `,` `;` tab, respeita aspas) → `{headers, rows}`. Reusar, não duplicar.
- `src/components/leads/ImportLeadsDialog.tsx:240-270` -- leitura de arquivo via `FileReader.readAsText`.
- `src/components/settings/ErrorLogList.tsx` -- padrão visual de tabela/skeleton/erro com "Tentar novamente"/vazio em Configurações; data com `format(d, "dd/MM/yyyy HH:mm", { locale: ptBR })`.
- `src/app/(dashboard)/settings/products/page.tsx` -- padrão de página (Card + título + descrição).
- `src/components/settings/SettingsTabs.tsx:7-40` -- array `tabs` com flag `platformOnly`; adicionar a aba antes de "Erros".
- `src/app/(dashboard)/settings/layout.tsx` -- envolve tudo em `AdminGuard` (`src/components/settings/AdminGuard.tsx`, client, usa `useUser().isAdmin`).
- `src/lib/supabase/middleware.ts:55-95` -- `isAdminRoute` redireciona não-admin de `/settings*` para `/leads`. Teste: `__tests__/unit/lib/supabase/middleware.test.ts:99`.
- `src/components/common/Sidebar.tsx:40-112` -- `NavItem.adminOnly`; "Configurações" é `adminOnly`; `canSeeAdmin` espera o perfil carregar. Teste: `__tests__/unit/components/Sidebar.test.tsx`.
- `src/lib/auth/capabilities.ts` -- `hasAdminAccess(role)`, fonte única de capacidade (nunca `role === X`).

## Tasks & Acceptance

**Execution:**
- `supabase/migrations/00071_create_suppression_entries.sql` -- tabela `suppression_entries` (id, `tenant_id` FK tenants CASCADE, `entry_type` CHECK `domain|email`, `value` TEXT NOT NULL, `reason` CHECK `cliente|negociacao|concorrente|parceiro|opt_out`, `source` CHECK `manual|import_csv|opt_out_automatico`, `created_by` uuid NULL FK profiles ON DELETE SET NULL, `created_at`), UNIQUE `(tenant_id, entry_type, value)`, índice `(tenant_id, created_at DESC)`, RLS: SELECT membro do tenant; INSERT/DELETE `tenant = get_current_tenant_id() AND is_admin()`; sem policy de UPDATE. Cabeçalho com pre-check, impacto e rollback.
- `src/types/suppression.ts` -- tipos, `SUPPRESSION_REASON_LABELS`, `SUPPRESSION_SOURCE_LABELS`, schema zod de entrada manual.
- `src/lib/utils/suppression.ts` -- `normalizeSuppressionValue(raw)` → `{type, value} | null`; `parseSuppressionReason(raw)` (aceita chave ou rótulo, sem acento/caixa, `opt-out`/`optout`); `parseSuppressionCsv(text)` → linhas `{line, value, reason}` ou erro de coluna.
- `src/actions/suppression.ts` -- `getSuppressionEntries()` (qualquer membro; pagina de 1000 em 1000), `addSuppressionEntry(input)` (admin; duplicado → `{duplicate: true}`), `removeSuppressionEntry(id)` (admin), `importSuppressionEntries(rows)` (admin; até 5000 linhas; normaliza de novo, descarta repetidas no arquivo e já existentes, insere o resto com `source='import_csv'`, devolve relatório).
- `src/hooks/use-suppression-list.ts` -- query + mutations com invalidate.
- `src/components/settings/SuppressionList.tsx`, `SuppressionAddForm.tsx`, `SuppressionImportDialog.tsx` -- tabela Valor/Tipo/Motivo/Origem/Data (+ Remover só admin com confirmação), busca client-side, contador, estados de loading/erro/vazio; dialog de import com arquivo `.csv`, instrução de formato, relatório (aceitas, ignoradas e lista linha → motivo).
- `src/app/(dashboard)/settings/suppression/page.tsx` -- página no padrão de Produtos.
- `src/lib/auth/settings-access.ts` -- `NON_ADMIN_SETTINGS_PATHS = ["/settings/suppression"]` e `isNonAdminSettingsPath(pathname)`.
- `src/lib/supabase/middleware.ts` -- não redirecionar não-admin em caminho liberado.
- `src/components/settings/AdminGuard.tsx` + `settings/layout.tsx` -- prop `nonAdminPaths` (lista serializável) que deixa o não-admin passar nesses caminhos.
- `src/components/settings/SettingsTabs.tsx` -- aba `{ id: "suppression", label: "Lista de Supressão", href: "/settings/suppression" }`; não-admin vê só as abas liberadas.
- `src/components/common/Sidebar.tsx` -- `NavItem.nonAdminHref`; "Configurações" aparece ao não-admin (com o perfil já carregado) apontando para `/settings/suppression`.
- Testes -- migration em PGlite (constraints, unique, RLS SDR lê e não escreve, gestor escreve, isolamento entre tenants, sem UPDATE); `suppression.ts` utils (matriz de normalização, motivos, CSV); actions (admin/SDR, duplicado, relatório de import, tabela ausente); hook; componentes (SDR sem botões, busca, relatório); middleware (SDR passa em `/settings/suppression`, segue barrado no resto); `SettingsTabs`; `Sidebar`; `AdminGuard`.

**Acceptance Criteria:**
- Given a migration aplicada e um gestor logado, when abre Configurações → Lista de Supressão, then vê a tabela com busca e consegue adicionar, remover e importar CSV.
- Given um SDR logado, when clica em "Configurações" na sidebar, then cai na Lista de Supressão, consulta e busca, e não vê nem consegue usar as ações de escrita.
- Given o import de um CSV com linhas inválidas, when termina, then o dialog mostra quantas entraram, quantas foram ignoradas e o motivo de cada uma.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 35 findings — high 0, medium 4, low 24, false 3, maybe-false 4
- findings:
  - `[medium]` `[patch]` (blind) Lookup de "já está na lista" manda 500 valores num GET `.in()`; e-mails longos estouram o limite de URL e abortam o import — lookup em lotes de 100 (`LOOKUP_CHUNK_SIZE`); insert segue em 500; teste de 501 linhas confere 100×5+1.
  - `[low]` `[reject]` (blind) Corrida: outro admin grava o mesmo valor entre o lookup e o insert e o lote inteiro cai em 23505 — exige dois gestores importando o mesmo valor ao mesmo tempo; `upsert ignoreDuplicates` deixaria a contagem de aceitas errada.
  - `[low]` `[reject]` (blind) Remover informa sucesso quando 0 linhas casam — só com id velho removido por outro gestor; o refetch já tira a linha; checar contagem adiciona ramo.
  - `[low]` `[reject]` (blind) Remoção sem trilha de auditoria (opt-out pode ser removido sem registro) — a story pede adicionar/remover; auditoria é funcionalidade nova (tabela/colunas).
  - `[maybe-false]` `[reject]` (blind) Banco não exige valor normalizado e escritores futuros (23.6) podem gravar sujo — depende de código que não existe; a 23.6 reusa `normalizeSuppressionValue`. Se real, seria low.
  - `[medium]` `[patch]` (blind) CSV do Excel brasileiro (Windows-1252) vira "motivo desconhecido"/coluna ausente — `decodeCsv`: UTF-8 estrito com fallback `windows-1252`; teste com arquivo em Windows-1252.
  - `[low]` `[reject]` (blind) Regex de domínio aceita IP/hífen nas pontas; regra de subdomínio indefinida — entrada lixo é improvável vinda de gestor; a regra de casamento é da 23.6.
  - `[low]` `[patch]` (blind) Gestor vê por um instante só a aba "Lista de Supressão" enquanto o perfil carrega — `SettingsTabs` não renderiza abas até o perfil carregar; teste do estado de loading.
  - `[low]` `[reject]` (blind) Lista inteira carregada e renderizada, sem paginação — volume atual pequeno; paginação é funcionalidade nova.
  - `[low]` `[reject]` (blind) Payload do import sem limite de bytes (1 MB das server actions) — 5000 linhas cabem com folga; arquivo patológico é improvável.
  - `[false]` `[reject]` (blind) Completion Notes ausentes — escritas no Finalize desta execução.
  - `[low]` `[patch]` (blind) Escolher o mesmo arquivo de novo não dispara onChange — `e.target.value = ""` após pegar o arquivo; teste.
  - `[low]` `[reject]` (blind) SDR não vê aviso de "somente leitura" — cosmético; a ausência dos botões já comunica; seria UI nova.
  - `[low]` `[reject]` (blind) Lookup sem `entry_type` usa mal o índice único — o prefixo `tenant_id` é usado; listas pequenas.
  - `[medium]` `[patch]` (edge) URL longa no `.in()` do lookup — mesmo defeito do 1º achado; corrigido junto.
  - `[low]` `[reject]` (edge) Corrida no insert → 23505 no lote — mesmo motivo do 2º achado.
  - `[low]` `[reject]` (edge) Falha parcial sem relatório por linha — a mensagem já diz quantas entraram; relatório parcial exigiria novo formato de retorno.
  - `[low]` `[patch]` (edge) Import com falha parcial não atualiza a tabela — invalidate em `onSettled`; teste ajustado.
  - `[low]` `[patch]` (edge) Linhas do arquivo anterior ficam enquanto o novo carrega/falha e podem ser importadas com o nome novo — limpa `rows`/`error` antes de ler e no `onerror`; teste.
  - `[medium]` `[patch]` (edge) Windows-1252 — mesmo defeito do 6º achado; corrigido junto.
  - `[low]` `[patch]` (edge) Flash de abas para gestor — mesmo defeito do 8º achado; corrigido junto.
  - `[low]` `[reject]` (edge) Remover 0 linhas informa sucesso — mesmo motivo do 3º achado.
  - `[low]` `[reject]` (edge) URL > 320 caracteres com domínio curto é rejeitada — colar URL longa é raro; mexer no limite muda a validação do schema e da normalização.
  - `[low]` `[reject]` (edge) `zod .max(320)` no valor bruto — mesmo motivo do achado anterior.
  - `[low]` `[reject]` (edge) Rótulos só com hífen viram domínio — mesmo motivo do 7º achado.
  - `[maybe-false]` `[reject]` (edge) `max_rows` do PostgREST abaixo de 1000 truncaria a lista — o padrão do Supabase é 1000; resolveria lendo a config do projeto. Se real, seria low.
  - `[low]` `[patch]` (edge) Busca sem acento ("negociacao") não acha "Negociação" — termo e campos dobrados (NFD sem diacríticos); teste.
  - `[low]` `[patch]` (edge) Duplicado adicionado por outro gestor não aparece na tabela — invalidate em qualquer sucesso do add; teste ajustado.
  - `[low]` `[patch]` (verification-gap) Nenhum teste prova que o layout passa `nonAdminPaths` ao `AdminGuard` — novo `__tests__/unit/app/settings/layout.test.tsx` (SDR vê a lista em /settings/suppression e o fallback em /settings/integrations).
  - `[low]` `[patch]` (verification-gap) Caminho de falha do insert e múltiplos lotes sem teste — caso de 501 linhas com falha no 2º insert ("500 linhas já tinham entrado").
  - `[low]` `[patch]` (verification-gap, other) Flash de abas — mesmo defeito do 8º achado; corrigido junto.
  - `[false]` `[reject]` (verification-gap, other) Nº de linha do relatório desalinha com quebras de linha dentro de aspas — `parseCSVData` também divide por linha e não suporta quebra dentro de aspas, então o mapa é o mesmo.
  - `[maybe-false]` `[reject]` (verification-gap, other) Corrida no insert — mesmo motivo do 2º achado; depende de dois gestores simultâneos.
  - `[false]` `[reject]` (intent) Diff sem commit, status final, `operator_actions` e Completion Notes — feitos no Finalize; a aplicação da 00071 virou `operator_actions` (só o Fabossi aplica migration em produção).
  - `[maybe-false]` `[reject]` (intent) Critérios só simulados (mocks/PGlite), nunca vistos com a migration aplicada — só se resolve aplicando a 00071 e fazendo o smoke; está nas `operator_actions`.

## Design Notes

- **Tipo detectado pelo valor:** um campo "Domínio ou e-mail". Tem parte local antes do `@` → e-mail. Senão → domínio (tira protocolo, `www.`, `@` inicial, porta, caminho, query e ponto final; exige ao menos um ponto e só `[a-z0-9-.]`).
- **CSV:** cabeçalho obrigatório. Coluna de valor = primeira cujo cabeçalho (sem acento, minúsculo) é `valor|value|dominio|domain|email|e-mail|site|website`; coluna de motivo = `motivo|reason`. Se houver colunas de e-mail e de domínio, a linha usa o e-mail quando preenchido, senão o domínio. Motivo ausente ou desconhecido ignora a linha.
- **Por que SDR dentro de Configurações:** o épico pede a tela em Configurações e a leitura para SDR. Abrir só esse caminho (middleware + guard + abas) mantém as outras abas fechadas.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm run test:run` -- expected: verdes.

**Manual checks (if no CLI):**
- Migration lida linha a linha: só `CREATE`, nenhum `DROP` de tabela/coluna, nenhum `UPDATE`/`DELETE`, nenhum objeto existente alterado.
- Diff sem nenhum arquivo dos caminhos de busca, import de leads, campanha, export/ativação, webhook ou crons.

## Completion Notes

**O que pode ter mudado para o cliente:**
- Rotas e páginas: nova página `/settings/suppression` e as server actions de `src/actions/suppression.ts`. O middleware deixa de redirecionar o não-admin **só** em `/settings/suppression` (e subcaminhos); o resto de `/settings*` segue admin-only.
- UI: a sidebar passa a mostrar "Configurações" ao SDR, apontando para a Lista de Supressão (só leitura). Gestor/diretor ganham a aba "Lista de Supressão" entre Notificações e Erros. `AdminGuard` e `SettingsTabs` aceitam a exceção.
- Banco (só depois de aplicada a `00071`): tabela nova `suppression_entries` com RLS. Nenhum objeto existente alterado, nenhuma linha tocada, nenhum job.
- Sem mudança em prompts, `instantly.ts`, webhook, `reply-sweep`, Apollo, export/ativação, Edge Functions, secrets ou env. Nada lê a lista ainda (isso é a 23.6).

**Os 3 pontos (por análise do diff; sem smoke real, porque a tela depende da migration aplicada):**
1. Campanhas rodando, webhook e `reply-sweep`: nenhum arquivo tocado.
2. Busca de leads: nenhum arquivo tocado.
3. Criação de campanha e export/ativação no Instantly: nenhum arquivo tocado; nenhuma trava nova.

## Auto Run Result

Status: awaiting-operator

**Resumo:** lista de supressão por domínio e e-mail, com motivo e origem, em Configurações → Lista de Supressão. Gestor/diretor adicionam, removem e importam CSV com relatório por linha. Valores normalizados no servidor; duplicados ignorados com aviso. SDR consulta e busca em modo leitura (middleware, guard, abas e sidebar liberam só esse caminho; action e RLS barram a escrita).

**Arquivos alterados:**
- `supabase/migrations/00071_create_suppression_entries.sql` — tabela, unique, índice, RLS (leitura membro, insert/delete admin, sem update), cabeçalho com pre-check e rollback.
- `src/types/suppression.ts`, `src/lib/utils/suppression.ts` — tipos/rótulos, normalização, motivos e leitura do CSV.
- `src/actions/suppression.ts` — listar, adicionar, remover e importar.
- `src/hooks/use-suppression-list.ts`, `src/components/settings/SuppressionList.tsx`, `SuppressionAddForm.tsx`, `SuppressionImportDialog.tsx`, `src/app/(dashboard)/settings/suppression/page.tsx` — tela.
- `src/lib/auth/settings-access.ts`, `src/lib/supabase/middleware.ts`, `src/components/settings/AdminGuard.tsx`, `src/app/(dashboard)/settings/layout.tsx`, `src/components/settings/SettingsTabs.tsx`, `src/components/common/Sidebar.tsx` — acesso do SDR só a essa aba.
- Testes: migration em PGlite, utils, actions, hook, componentes, layout, middleware, abas, guard e sidebar.

**Revisão:** 35 achados (medium 4 — 2 entradas por causa raiz —, low 24, false 3, maybe-false 4). 10 correções aplicadas (2 medium: lookup em lotes de 100; CSV em Windows-1252 — e 8 low). 0 deferidos. Rejeitados com motivo no Review Triage Log.

**Follow-up review recomendado: true** (2 medium corrigidos). Risco não verificado: a decodificação Windows-1252 e o lookup em lotes de 100 só foram testados com mocks; o import real de um CSV do Excel em português contra o Supabase de produção não foi feito.

**Verificação:** `npm run lint` 0 erros (134 warnings, como antes); `npm run typecheck` ok; `npm run test:run` 453 arquivos, 8759 testes ok (numa rodada anterior, 2 testes de loading de `SegmentDropdown`/`SavedFiltersDropdown`, fora do diff, falharam por tempo e passaram isolados e na rodada seguinte). Migration lida linha a linha: só `CREATE`/`DROP POLICY IF EXISTS` da tabela nova, sem `UPDATE`/`DELETE`.

**Riscos residuais:** import em lotes sem transação (falha no meio deixa os lotes anteriores gravados, com aviso da contagem); lista carregada inteira no cliente; SQL testado em PGlite com stubs, não no Supabase real; SDR passa a ver o link "Configurações".

**Devido pelo operador:** ver `operator_actions` no frontmatter.
