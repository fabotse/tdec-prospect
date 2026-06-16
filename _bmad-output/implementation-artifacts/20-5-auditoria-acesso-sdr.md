---
baseline_commit: d2443d723e73d327833abfb6bf07f7f30fb54499
---

# Story 20.5: Auditoria de acesso do SDR (sem vazamentos)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a responsável pela segurança,
I want garantir que o SDR não enxergue nem acione nenhuma funcionalidade administrativa em nenhuma camada,
so that o controle de acesso seja efetivo (defense-in-depth) antes da entrega ao cliente.

**Natureza desta story:** é a story de **fechamento** do Epic 20 — predominantemente **auditoria + correção de gaps conhecidos + cobertura de teste papel × superfície**, NÃO uma feature nova. A base (enum, `hasAdminAccess`, RLS, UI de papéis, provisionamento) já está implementada nas stories 20.1–20.4. Aqui você **prova** que o SDR está barrado em todas as camadas, **corrige** os vazamentos já identificados nas reviews anteriores, e **fecha** as lacunas de teste (middleware/API/RLS hoje sem cobertura de autorização).

## Acceptance Criteria

> Os ACs 1–3 vêm do epic ([epic-20-niveis-de-acesso.md:186-204](../planning-artifacts/epic-20-niveis-de-acesso.md#L186-L204)). Os ACs 4–7 materializam os gaps concretos roteados a esta story pelas reviews das stories 20.2/20.3/20.4 (ver [deferred-work.md](deferred-work.md)). Implemente **todos**.

**AC1 — Varredura anti-vazamento (UI):**
**Given** o modelo de três papéis e o helper de capacidade estão em produção
**When** uma varredura é feita em rotas, itens de navegação, dialogs e endpoints
**Then** confirma-se que **nenhum** link/rota/endpoint administrativo fica visível ou acionável para SDR

**AC2 — Defense-in-depth (UI + servidor):**
**Given** cada superfície protegida (settings, integrações, knowledge base, time, uso, monitoramento, prompts de IA — gerir, e a busca technográfica)
**When** acessada por um SDR (na UI **e** via chamada direta de API/action)
**Then** o acesso é negado **tanto na UI quanto no servidor** — gating de UI é conveniência, o servidor é a barreira real (NFR-S2)

**AC3 — Gap encontrado → corrigido + testado:**
**Given** a auditoria identifica alguma superfície não protegida
**When** o gap é encontrado
**Then** é corrigido **e** coberto por teste automatizado de papel × superfície (Gestor ✅, Diretor ✅, SDR ❌)

**AC4 — Vazamento de UI do link "Configurações" (gap conhecido, deferido da 20.2):**
**Given** o [Sidebar.tsx:54](../../src/components/common/Sidebar.tsx#L54) renderiza o link "Configurações" (`/settings`) **incondicionalmente**, visível para SDR (que ao clicar é redirecionado em silêncio para `/leads` pelo middleware)
**When** o SDR está logado
**Then** o link "Configurações" **não é renderizado** para SDR (gate `hasAdminAccess`/`isAdmin`)
**And** Gestor e Diretor continuam vendo o link normalmente

**AC5 — Reconciliação da superfície Technographic (gap novo encontrado nesta auditoria):**
**Given** as rotas de busca/credits do theirStack já exigem `hasAdminAccess` no servidor ([theirstack/search/companies/route.ts:70](../../src/app/api/integrations/theirstack/search/companies/route.ts#L70), `search/technologies`, `credits/route.ts`), retornando **403** para SDR — mas o link "Technographic" no [Sidebar.tsx:50](../../src/components/common/Sidebar.tsx#L50) e a página `/technographic` estão visíveis/acessíveis ao SDR (a página **não** está sob `/settings`, logo o middleware não a protege)
**When** a inconsistência é resolvida tratando Technographic como superfície administrativa (consistente com seu gating de API e com o princípio "SDR = só prospecção via leads/campanhas")
**Then** o link "Technographic" é ocultado para SDR (mesmo gate do AC4)
**And** a rota `/technographic` é negada para SDR no servidor (incluir o prefixo no check admin do middleware **ou** envolver a página com `AdminGuard`) — defense-in-depth, sem depender só de esconder o link
> ✅ **DECIDIDO (Fabossi, 2026-06-16): Technographic = admin-only.** Esconder o link p/ SDR + proteger `/technographic` no servidor + **manter** o `hasAdminAccess` nas 3 rotas theirStack. NÃO liberar para SDR.

**AC6 — Endurecimento do invariante "≥1 admin" (deferido da 20.3):**
**Given** a proteção do último admin em `updateMemberRole` ([team.ts:450-468](../../src/actions/team.ts#L450-L468)) e em `removeTeamMember`/`isOnlyAdmin` é um check-then-update **não transacional** com **fail-open** (se a query de contagem falhar e retornar `count: null`, `null === 1` é `false` → o rebaixamento/remoção prossegue)
**When** o endurecimento mínimo é aplicado
**Then** o caminho passa a **falhar fechado**: contagem ausente/`null`/`<= 1` **bloqueia** a operação (nunca permite ficar com 0 admins por erro de leitura)
**And** o comportamento é coberto por teste (count=null → bloqueia; count=1 → bloqueia; count>=2 → permite)
> A garantia transacional/DB-level (trigger ou constraint) fica documentada como hardening futuro (ver Dev Notes §Hardening) — fora do escopo mínimo desta story, mas o **fail-open deve ser eliminado** agora.

**AC7 — Limpeza de dead code de autorização (deferido da 20.2):**
**Given** `isAdminRole` em [database.ts:233](../../src/types/database.ts#L233) delega a `hasAdminAccess` mas **não tem nenhum call-site em `src/`** (só a própria definição + teste), e importa um helper de runtime para dentro de um módulo de **tipos**
**When** a limpeza é feita
**Then** `isAdminRole` é removido (junto do seu teste em `database.test.ts`)
**And** a suíte permanece verde (nenhum import quebrado)

## Tasks / Subtasks

- [x] **Task 1 — Varredura de autorização documentada (AC1, AC2)**
  - [x] Rodar e registrar a varredura: `grep -rE 'role\s*(===|!==)\s*"(admin|user|member)"' src/` deve retornar **apenas** `AgentMessageBubble.tsx` (role de mensagem de chat, não de auth). Qualquer outro hit em `src/` é um call-site esquecido → corrigir para `hasAdminAccess`. **Hoje retorna zero literais de auth** — registrar isso como evidência no Completion Notes. ✅ Confirmado: único hit é `AgentMessageBubble.tsx:39` (`message.role === "user"` — chat, não auth). Zero literais de auth em produção.
  - [x] Confirmar a matriz §4 do doc de decisão contra o código: para cada superfície (settings root, integrações, knowledge base, time, uso, monitoramento, prompts IA gerir, technographic) existe gate `!hasAdminAccess(...)` no servidor. Usar o mapa em Dev Notes §"Mapa de superfícies" como checklist. ✅ Todas as 12 superfícies admin carregam gate `hasAdminAccess` no servidor (actions team/integrations/knowledge-base; rotas usage/integrations/monitoring/theirstack/apollo-test; RLS prompts IA).
  - [x] Para cada superfície, confirmar a camada de UI (link/nav/guard) **e** a camada de servidor (action/route/middleware/RLS). Marcar explicitamente onde a UI **não** gateia mas o servidor barra (caso do AC4/AC5). ✅ Gaps de UI confirmados: link "Configurações" (AC4) e link/página "Technographic" (AC5) renderizados ao SDR — servidor barra, UI não. Corrigidos nas Tasks 2/3.
- [x] **Task 2 — Esconder links administrativos do SDR no Sidebar (AC4, AC5)**
  - [x] Tornar o `Sidebar` ciente de papel: importar `useUser` (`@/hooks/use-user`) e derivar `isAdmin` (`hasAdminAccess` já embutido no hook — `useUser().isAdmin`).
  - [x] Marcar os nav items administrativos com uma flag `adminOnly: true` na lista `navItems`: **"Configurações"** (`/settings`) e **"Technographic"** (`/technographic`). Renderiza `visibleNavItems` = `navItems.filter(item => !item.adminOnly || canSeeAdmin)`.
  - [x] Não quebrar o comportamento durante o carregamento do perfil: `canSeeAdmin = isAdmin && !isLoading && !isProfileLoading` — esconde itens admin até a capacidade ser confirmada (menor privilégio); para SDR `isAdmin` nunca fica true → sem "flash".
  - [x] Atualizar [Sidebar.test.tsx](../../__tests__/unit/components/Sidebar.test.tsx): mock de `useUser` (default Gestor preserva asserções pré-existentes). +6 testes: Gestor vê os dois; Diretor vê os dois; SDR vê nenhum; SDR mantém prospecção; itens admin escondidos em isLoading e isProfileLoading. **54/54 passando.**
- [x] **Task 3 — Proteger a rota `/technographic` no servidor (AC5 — DECIDIDO: admin-only)**
  - [x] Adicionar `/technographic` ao check admin do middleware ([middleware.ts](../../src/lib/supabase/middleware.ts)): incluído em `isProtectedRoute` (exige auth) **e** em `isAdminRoute` (exige admin). Barra antes de carregar a página, consistente com `/settings`. Não-admin → redirect `/leads`; não autenticado → `/login`.
  - [x] Garantir que as 3 rotas theirStack (`search/companies`, `search/technologies`, `credits`) permanecem com `hasAdminAccess` (**não removidas** — confirmadas na varredura da Task 1).
- [x] **Task 4 — Eliminar o fail-open do invariante "≥1 admin" (AC6)**
  - [x] Em `updateMemberRole`: `if (count === 1)` → `if (count == null || count <= 1)` (fail-closed). Mensagem mantida.
  - [x] Mesmo endurecimento em `removeTeamMember` (`count == null || count <= 1`) e em `isOnlyAdmin` (`return count == null || count <= 1`; catch → `return true` em vez de `false`, fail-closed também na exceção).
  - [x] Testes em [team.test.ts](../../__tests__/unit/actions/team.test.ts): novos casos `count: null` → bloqueia + `count: 2` → permite, nos 3 caminhos (updateMemberRole, removeTeamMember, isOnlyAdmin). `count: 1` (bloqueia) já coberto. Predicado `.in("role", ["gestor","diretor"])` já pinado nos testes pré-existentes. **47/47 passando (+5).**
- [x] **Task 5 — Fechar lacunas de teste de autorização papel × superfície (AC2, AC3)**
  - [x] **Middleware (zero cobertura hoje):** criado `__tests__/unit/lib/supabase/middleware.test.ts` (11 testes). SDR em `/settings` e `/technographic` → redirect `/leads`; Gestor e Diretor em ambas → passa (sem redirect); não autenticado em `/settings`/`/technographic`/`/leads` → `/login`; SDR/Gestor em `/leads` (não-admin) → passa. Mock de `@supabase/ssr` `createServerClient` (auth.getUser + from→single).
  - [x] **API routes (sem cobertura de authz):** "SDR → 403" e "Diretor → permitido" cobertos em: `usage/statistics` (novo), `settings/integrations` GET/POST/DELETE (novo), `integrations/apollo/test` (novo), `settings/integrations/[service]/test` (novo), `theirstack/{search/companies,search/technologies,credits,test}` (existentes, +caso Diretor), `settings/monitoring` (existente, +caso Diretor). Padrão `getCurrentUserProfile` + `createChainBuilder`/single mock.
  - [x] **Corrigir fixtures de papel obsoletos:** `member`→`sdr` em `settings/monitoring/route.test.ts` (NON_ADMIN_PROFILE) e nos 4 theirstack tests. Escopo = **superfícies admin** (como pede a task). Fixtures `role:"admin"` remanescentes estão só em rotas **SDR-allowed/não-admin** (instantly/snovio/apollo-integration/monitoring-initial-scan — nenhuma gateia admin) → fora do escopo "superfícies admin". `message.role` (agent/chat) **não** tocado.
  - [x] Adicionado caso `role: "diretor"` positivo em múltiplos guards de servidor (middleware, usage, integrações, theirstack×4, apollo/test, [service]/test, monitoring) — detecta regressão para `=== "gestor"`. (team.test.ts já cobria Diretor em updateMemberRole/applyInvitedRoleOnAcceptance.)
- [x] **Task 6 — Limpeza de `isAdminRole` (AC7)**
  - [x] Removido `isAdminRole` de [database.ts](../../src/types/database.ts) (+ o import agora-órfão de `hasAdminAccess` no módulo de tipos) e o describe `isAdminRole helper` de [database.test.ts](../../__tests__/unit/types/database.test.ts). `grep -rn isAdminRole src __tests__` → **vazio**. database.test.ts 33/33 verde.
- [x] **Task 7 — Atualizar estado obsoleto de admin no `useUser` após auto-rebaixamento (AC3 — DECIDIDO: corrigir)**
  - [x] `useTeamMembers` agora consome `useUser` (`user`, `refetchProfile`). Na `onSuccess` da mutation de papel ([use-team-members.ts](../../src/hooks/use-team-members.ts)), quando `variables.userId === user?.id` (auto-mudança), chama `void refetchProfile()` → Sidebar/AdminGuard reavaliam `isAdmin` na hora (escondem links admin sem reload). Testes em [use-team-members.test.tsx](../../__tests__/unit/hooks/use-team-members.test.tsx): self-change dispara refetch; mudança de outro membro **não** dispara; falha do self-change **não** dispara. **26/26 passando (+3).**
- [x] **Task 8 — Validação final (todas as ACs)**
  - [x] `npx vitest run` — **365 files / 6195 pass / 2 skip / 0 fail** (baseline ~360/6149 → +5 files, +46 testes). Sem regressão.
  - [x] `npx tsc --noEmit` — **0 erros em `src/`** (erros remanescentes são todos pré-existentes em `__tests__/` — type-looseness de mocks, não tocada).
  - [x] `npx eslint` nos arquivos tocados — **limpo** (sem warnings; `no-console`/`no-non-null-assertion` respeitadas).
  - [x] `npm run build` — **✓ Compiled successfully** + TypeScript check + 70/70 páginas estáticas. `/technographic` e Middleware no manifesto.
  - [x] Tabela papel × superfície e grep de literais registrados no Completion Notes.

## Dev Notes

### Contexto crítico (leia antes de codar)

- **Esta é a story de auditoria/fechamento.** A autorização real **já funciona** (servidor barra SDR em todas as superfícies — confirmado pela varredura abaixo). Os gaps reais são: (1) **UI** mostra links que o servidor depois barra (AC4/AC5), (2) **fail-open** num edge de concorrência (AC6), (3) **cobertura de teste** de middleware/API/RLS ausente (AC2/AC3/Task 5), (4) **dead code** (AC7). Não reescreva o modelo de autorização — ele está correto.
- **Fonte de verdade de capacidade:** `hasAdminAccess(role)` em [capabilities.ts:21](../../src/lib/auth/capabilities.ts#L21), derivado de `ADMIN_ROLES = ["gestor","diretor"]`. **Nunca** introduza `role === "..."` solto. SDR = `false`.
- **Papel é lido fresco do banco a cada request** (não está no JWT) — migração teve efeito imediato; não há sessão com papel obsoleto **no servidor**. O único estado obsoleto é o **cliente** `useUser` (singleton), tratado na Task 7.

### Mapa de superfícies (verificado no código — use como checklist da Task 1)

Legenda: ✅ gate presente · ❌ negado a SDR · ⚠️ gap a corrigir nesta story.

| Superfície | Camada UI | Camada servidor | Status |
| --- | --- | --- | --- |
| `/settings/*` (root + integrações, KB, products, usage, monitoring, team) | `AdminGuard` no [settings/layout.tsx](../../src/app/(dashboard)/settings/layout.tsx); **link no Sidebar SEM gate** | middleware [middleware.ts:77-89](../../src/lib/supabase/middleware.ts#L77-L89) (`hasAdminAccess`) | ⚠️ **UI: link visível p/ SDR (AC4)**; servidor OK |
| Integrações / API keys (actions) | via settings | [integrations.ts](../../src/actions/integrations.ts) 4 funcs `!hasAdminAccess` (74,181,307,364) | ✅ |
| Integrações (API) | — | [api/settings/integrations/route.ts](../../src/app/api/settings/integrations/route.ts) GET/POST/DELETE 403 | ✅ (falta teste authz) |
| Teste de conexão | — | `api/integrations/{apollo,theirstack}/test` + `api/settings/integrations/[service]/test` 403 | ✅ (falta teste authz) |
| Knowledge base (actions) | via settings | [knowledge-base.ts](../../src/actions/knowledge-base.ts) ~10 funcs `!hasAdminAccess` | ✅ |
| Gestão de time (actions) | `AdminGuard` em [team/page.tsx](../../src/app/(dashboard)/settings/team/page.tsx) | [team.ts](../../src/actions/team.ts) 5 funcs `!hasAdminAccess` (46,158,279,367,426) | ✅ (fail-open no "último admin" → AC6) |
| Uso / custos (API) | via settings | [api/usage/statistics/route.ts:67-84](../../src/app/api/usage/statistics/route.ts#L67-L84) 403 | ✅ (falta teste authz) |
| Monitoramento (API) | via settings | [api/settings/monitoring/route.ts](../../src/app/api/settings/monitoring/route.ts) GET/PATCH 403 | ✅ (fixture `member` obsoleto → Task 5) |
| Prompts de IA (gerir) | — | RLS `is_admin()` ([00053](../../supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql)) | ✅ |
| **Technographic** (`/technographic`) | **link no Sidebar SEM gate; página SEM AdminGuard; SEM middleware** | theirStack search/credits 403 (`hasAdminAccess`) | ⚠️ **UI+rota: visível/navegável p/ SDR, mas API 403 → inconsistência (AC5)** |
| KB context (API) | — | [api/knowledge-base/context/route.ts](../../src/app/api/knowledge-base/context/route.ts) **sem gate (intencional)** | ✅ SDR-allowed (prospecção) |
| Enrich-icebreaker (API) | — | sem gate (intencional) | ✅ SDR-allowed (prospecção) |
| Leads, Campanhas, Insights, Agente | links sem gate (corretos) | sem gate admin (intencional) | ✅ SDR-allowed |

> **Superfícies SDR-allowed (NÃO gatear):** Leads (busca/enriquecimento/listas), Campanhas (builder/sequências/export), Insights, Agente, KB-context-fetch, enrich-icebreaker. Gatear qualquer uma destas é **regressão** — o SDR precisa prospectar.

### Anti-patterns a evitar (impeditivos)

- ❌ **NÃO** gatear superfícies de prospecção (leads/campanhas/insights/agente) — SDR precisa delas. A matriz §4 do doc de decisão é a fonte: só o que é admin vira `hasAdminAccess`.
- ❌ **NÃO** confiar só em esconder o link de UI (AC4/AC5). A barreira real é o servidor (middleware/action/route/RLS). Esconder o link é **conveniência adicional**, não substituto (NFR-S2). Por isso o AC5 exige proteger `/technographic` no servidor **além** de esconder o link.
- ❌ **NÃO** introduzir `role === "gestor"`/`role === "admin"` literal em lugar nenhum — sempre `hasAdminAccess`. (A varredura da Task 1 deve continuar retornando zero literais de auth.)
- ❌ **NÃO** alterar fixtures de `message.role` (agent/chat) ao corrigir os fixtures de papel de auth (Task 5) — são coisas diferentes. Distinguir pelo contexto: fixture de **perfil/auth** (`{ id, tenant_id, role }`) vs **mensagem** (`{ role: "user"|"assistant", content }`).
- ❌ **NÃO** implementar os dois caminhos do AC5 (admin-only vs SDR-allowed). Confirmar a decisão (Open Questions) e implementar **um**.
- ❌ **NÃO** "resolver" o invariante ≥1 admin só com mais um check na app achando que fechou o TOCTOU — o mínimo desta story é **eliminar o fail-open** (count null/≤1 bloqueia). A garantia transacional real é DB-level e fica como hardening documentado.

### Hardening documentado (fora do escopo mínimo — registrar em deferred-work se não feito)

- **Invariante "≥1 admin" no banco (TOCTOU real):** o check-then-update na app não é transacional — dois admins rebaixados concorrentemente podem ambos passar (`count===2`) e zerar os admins do tenant. Probabilidade baixíssima com ~4 usuários. Fix robusto = trigger `BEFORE UPDATE/DELETE` em `profiles` que conte admins na transação, ou constraint. Esta story **elimina o fail-open** (AC6) mas **não** resolve o TOCTOU concorrente — documentar como hardening futuro.
- **RLS de UPDATE é row-level, não column-level (deferido da 20.3, LOW):** a policy `"Admins can update tenant profiles"` (00054) concede UPDATE de **qualquer coluna** de perfis do mesmo tenant ao admin (RLS no Postgres não restringe colunas). Mitigado: a única caller (`updateMemberRole`) escreve apenas `{ role }`. Endurecimento opcional = trigger que limite as colunas alteráveis. Apenas **documentar** como nota de hardening; não implementar nesta story salvo decisão contrária.

### Migrations / banco

- **Nenhuma migration nova é necessária** para o escopo mínimo (a auditoria é de código + testes; correções de UI/app não tocam schema).
- ⚠️ **Pré-condição operacional:** as migrations **00053** e **00054** precisam estar aplicadas no banco do cliente (gerido à mão — Supabase Dashboard → SQL Editor) para o modelo de papéis e a edição de papel funcionarem. Já sinalizado nas stories 20.1/20.3/20.4; confirmar na entrega. Não é tarefa de código desta story, mas a auditoria pressupõe ambas aplicadas.
- Se a Task 4 (hardening DB-level do ≥1 admin) for decidida como in-scope, seria a migration **00055** — mas o default é **não** criar (só eliminar o fail-open na app).

### Padrões de teste do projeto (obrigatório seguir)

- **Runner:** Vitest. Rodar: `npx vitest run`. Baseline atual ~360 files / ~6149 pass / 2 skip — **não regredir**.
- **Mock Supabase:** `createChainBuilder`/`ChainBuilder` de `__tests__/helpers/mock-supabase` (ver [monitoring/route.test.ts:11-14](../../__tests__/unit/app/api/settings/monitoring/route.test.ts#L11-L14)). Para route handlers: mockar `@/lib/supabase/tenant` (`getCurrentUserProfile`) e `@/lib/supabase/server` (`createClient`).
- **Mock de hooks de auth em componentes:** para o Sidebar (Task 2), mockar `@/hooks/use-user` (`vi.mock`) retornando `{ isAdmin, isLoading, ... }`. O Sidebar já mocka `next/navigation` e `@/hooks/use-lead-insights` — seguir o mesmo estilo ([Sidebar.test.tsx:8-16](../../__tests__/unit/components/Sidebar.test.tsx#L8-L16)).
- **Tailwind v4:** se mexer em wrappers label+input, usar `flex flex-col gap-*` (não `space-y-*`). (Improvável nesta story — é majoritariamente auth/teste.)
- **ESLint:** `no-console` ativa (só `console.error` em caminhos de erro), `no-non-null-assertion` ativa. Pre-commit linta o arquivo inteiro (lint-staged) — não introduzir `process.env.X!`.

### Project Structure Notes

- **Helper de capacidade:** `src/lib/auth/capabilities.ts` (não recriar — consumir).
- **Middleware:** `src/lib/supabase/middleware.ts` — `isAdminRoute` em [linha 54](../../src/lib/supabase/middleware.ts#L54) é onde se adiciona prefixo admin (Task 3).
- **Sidebar:** `src/components/common/Sidebar.tsx` — lista `navItems` em [40-55](../../src/components/common/Sidebar.tsx#L40-L55).
- **Team actions:** `src/actions/team.ts` — `updateMemberRole`, `removeTeamMember`, `isOnlyAdmin` (Task 4).
- **Tipos:** `src/types/database.ts` (`UserRole`, `isAdminRole` a remover), `src/types/team.ts` (`USER_ROLES`, `ROLE_LABELS`).
- Testes espelham `src/` sob `__tests__/unit/...` (ex.: `__tests__/unit/lib/supabase/middleware.test.ts` é o novo arquivo a criar).

### References

- [Source: _bmad-output/planning-artifacts/epic-20-niveis-de-acesso.md#Story-20.5] — ACs base e NFR-S1/S2/S3, NFR-Q1
- [Source: _bmad-output/planning-artifacts/architecture-epic-20-niveis-de-acesso.md#6-Estratégia-de-teste-e-auditoria-Story-20.5] — estratégia de teste papel × superfície, fechar lacunas middleware/API/RLS
- [Source: _bmad-output/planning-artifacts/architecture-epic-20-niveis-de-acesso.md#4-Matriz-de-permissão] — matriz canônica Gestor/Diretor/SDR por superfície
- [Source: _bmad-output/planning-artifacts/architecture-epic-20-niveis-de-acesso.md#7-Riscos] — "call-site esquecido com 'admin' literal → busca deve retornar zero; Story 20.5 audita"
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — gaps roteados a 20.5: link Configurações (20.2), Technographic implícito, ≥1 admin TOCTOU/fail-open (20.3), useUser obsoleto (20.3), RLS column-level (20.3), isAdminRole dead code (20.2), team list 2x (20.4)
- [Source: src/lib/auth/capabilities.ts] — `hasAdminAccess`, `ADMIN_ROLES`
- [Source: src/lib/supabase/middleware.ts#L54-L89] — gate admin de `/settings`

## Previous Story Intelligence

Aprendizados diretamente acionáveis das stories 20.1–20.4 (e reviews):

- **20.1 (enum + migração + RLS):** `is_admin()` no banco mudou para `role IN ('gestor','diretor')`; default da coluna virou `sdr` (menor privilégio); papel NÃO está no JWT (lido fresco) → migração com efeito imediato. **Ordem deploy×migration importa** (código novo rejeita literais antigos) — pré-condição operacional, não código desta story.
- **20.2 (helper + refactor dos 31 call-sites):** todos os guards passaram a `hasAdminAccess`. Reviews registraram: **link Configurações sem gate (→ AC4)**, `isAdminRole` dead code (→ AC7), test-hardening papel×capacidade (→ Task 5: incluir caso `diretor`). A varredura `role === "admin"` em `src/` já retorna **zero** — manter assim.
- **20.3 (UI de papéis + updateMemberRole):** `updateMemberRole` usa `.in("role", ADMIN_ROLES)` para contar admins, blindagem `.select()`/0-rows contra RLS, e protege o último admin — **mas fail-open + TOCTOU (→ AC6)**. `ROLE_LABELS[role] ?? role` (fallback) já resolvido. Migration **00054** (policy UPDATE admin em `profiles`) é pré-condição. `useUser` obsoleto pós-auto-rebaixamento (→ Task 7).
- **20.4 (provisionamento):** `applyInvitedRoleOnAcceptance` (pós-aceitação via lookup em `team_invitations`, service role) já corrige o gap convite→signup — **testado end-to-end ao vivo (2026-06-16), funciona** (papel sobe de `sdr`→`gestor`, convite vira `accepted`). Script `provision-client-users.mjs` é OPERACIONAL (Fabossi roda). **Não retocar** salvo a auditoria achar vazamento. Item relacionado deferido: **lista de time mostra convidado 2x + status "Ativo" falso** (pré-existente da 2.7) — ver Open Questions (fora do core SDR-audit).

## Git Intelligence

Commits recentes do Epic 20 (padrões a seguir):
- `d2443d7 feat(story-20.4): provisionamento usuários cliente + fix convite→signup + code review`
- `9c03edb feat(story-20.3): edição de papel de membro (updateMemberRole) + migration 00054 + code review YOLO`
- `6578880 chore(story-20.2): reconciliação/verificação dos guards + code review adversarial 3 camadas`
- `e7ede69 feat(story-20.1): modelo de três papéis — enum, migração 00053, RLS + helper hasAdminAccess`

Padrão: cada story termina com code review (frequentemente adversarial 3 camadas / YOLO) e a suíte verde antes do commit. Mensagens em pt-BR, escopo explícito. Esta story (auditoria) deve fechar com a tabela papel × superfície provada e a suíte verde. Branch atual: `epic/20-niveis-de-acesso` (commit direto na branch do epic, como as anteriores).

## Decisões confirmadas (Fabossi, 2026-06-16)

1. ✅ **Technographic = admin-only.** Esconder o link p/ SDR (Task 2) + proteger `/technographic` no servidor via middleware (Task 3) + **manter** o `hasAdminAccess` nas 3 rotas theirStack. → AC5
2. ✅ **Corrigir o `useUser` obsoleto pós-auto-rebaixamento** com `refetchProfile()` na mutation de papel quando for self-change. → Task 7
3. ✅ **Bug "lista de time 2x + status 'Ativo' falso" fica FORA do core desta story** — é polish separado da Story 2.7 (UX de gestão de time, tangencial à auditoria de acesso do SDR). **Não** adicionar task para isso aqui; apenas manter rastreado no [deferred-work.md](deferred-work.md).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — BMAD dev-story workflow

### Debug Log References

- `npx vitest run` (full): 365 files / 6195 pass / 2 skip / 0 fail.
- `npx tsc --noEmit`: 0 erros em `src/` (erros remanescentes pré-existentes em `__tests__/`).
- `npx eslint` (arquivos tocados): limpo.
- `npm run build`: ✓ Compiled successfully + TypeScript + 70/70 static pages.

### Completion Notes List

**Natureza:** story de auditoria/fechamento do Epic 20 — o modelo de autorização do servidor **já estava correto** (SDR barrado em todas as superfícies); esta story provou isso por teste, corrigiu os gaps de UI, eliminou um fail-open e removeu dead code. Nenhuma migration nova.

**Evidência da varredura (Task 1 / AC1):** `grep -rE 'role\s*(===|!==)\s*"(admin|user|member)"' src/` retorna **apenas** `AgentMessageBubble.tsx:39` (`message.role === "user"` — role de mensagem de chat, **não** de auth). **Zero literais de auth em produção** — toda capacidade passa por `hasAdminAccess` (fonte única, derivada de `ADMIN_ROLES`).

**Tabela final papel × superfície (provada por teste automatizado):**

| Superfície | Camada provada | Gestor | Diretor | SDR |
| --- | --- | --- | --- | --- |
| `/settings/*` | middleware (`middleware.test.ts`) | ✅ passa | ✅ passa | ❌ → `/leads` |
| `/technographic` (página/rota) | middleware (`middleware.test.ts`) | ✅ passa | ✅ passa | ❌ → `/leads` |
| Link "Configurações" (Sidebar) | componente (`Sidebar.test.tsx`) | ✅ vê | ✅ vê | ❌ não vê |
| Link "Technographic" (Sidebar) | componente (`Sidebar.test.tsx`) | ✅ vê | ✅ vê | ❌ não vê |
| Uso/custos (`usage/statistics`) | route (`usage/statistics/route.test.ts`) | ✅ 200 | ✅ 200 | ❌ 403 |
| Integrações (`settings/integrations` GET/POST/DELETE) | route (`settings/integrations/route.test.ts`) | ✅ | ✅ (GET) | ❌ 403 |
| Teste de conexão (`apollo/test`, `[service]/test`, `theirstack/test`) | routes | ✅ | ✅ passa gate | ❌ 403 |
| theirStack search/credits | routes (existentes, +Diretor) | ✅ | ✅ passa gate | ❌ 403 |
| Monitoramento (`settings/monitoring`) | route (existente, +Diretor) | ✅ 200 | ✅ 200 | ❌ 403 |
| Gestão de time (`team.ts`) | actions (`team.test.ts`) | ✅ | ✅ | ❌ |
| Não autenticado em rota protegida | middleware | — | — | → `/login` |

**Gaps corrigidos:**
- **AC4** — link "Configurações" não é mais renderizado para SDR (`Sidebar` ciente de papel via `useUser`).
- **AC5** — "Technographic" tratado como admin-only: link escondido p/ SDR **e** rota `/technographic` barrada no middleware (`isProtectedRoute` + `isAdminRoute`); as 3 rotas theirStack mantêm `hasAdminAccess` (403).
- **AC6** — invariante "≥1 admin" passou a **fail-closed**: `count == null || count <= 1` bloqueia em `updateMemberRole`, `removeTeamMember` e `isOnlyAdmin` (catch de `isOnlyAdmin` agora retorna `true`). O TOCTOU concorrente (DB-level) permanece documentado como hardening futuro (Dev Notes §Hardening).
- **AC7** — `isAdminRole` (dead code, sem call-site) removido de `database.ts` + teste; import órfão de `hasAdminAccess` no módulo de tipos removido.
- **Task 7** — `useUser` obsoleto pós auto-rebaixamento corrigido via `refetchProfile()` na mutation quando `userId === user.id`.

**Cobertura de teste authz adicionada** (antes inexistente): middleware (11 testes, zero antes), `usage/statistics`, `settings/integrations`, `apollo/test`, `[service]/test`. Casos `role: "diretor"` positivos adicionados em múltiplos guards (antes só `gestor`/`sdr`). Fixtures obsoletos `member`→`sdr` corrigidos nas superfícies admin (monitoring + theirstack ×4).

**Escopo deliberadamente NÃO tocado:** fixtures `role:"admin"` em rotas SDR-allowed/não-admin (instantly/snovio/apollo-integration/monitoring-initial-scan — nenhuma gateia admin) ficam fora do escopo "superfícies admin". Bug "lista de time 2x / status 'Ativo' falso" permanece deferido (polish da Story 2.7, Decisão Fabossi #3). Hardening DB-level do ≥1 admin (TOCTOU) e RLS column-level permanecem documentados como hardening futuro.

**Pré-condição operacional (não-código):** migrations **00053** e **00054** precisam estar aplicadas no banco do cliente (gerido à mão) — já sinalizado nas stories 20.1/20.3/20.4.

### File List

**Código (modificado):**
- src/components/common/Sidebar.tsx
- src/lib/supabase/middleware.ts
- src/actions/team.ts
- src/types/database.ts
- src/hooks/use-team-members.ts

**Testes (modificado):**
- __tests__/unit/components/Sidebar.test.tsx
- __tests__/unit/actions/team.test.ts
- __tests__/unit/types/database.test.ts
- __tests__/unit/hooks/use-team-members.test.tsx
- __tests__/unit/app/api/settings/monitoring/route.test.ts
- __tests__/unit/api/integrations/theirstack/credits.test.ts
- __tests__/unit/api/integrations/theirstack/search/companies.test.ts
- __tests__/unit/api/integrations/theirstack/search/technologies.test.ts
- __tests__/unit/api/integrations/theirstack/test.test.ts

**Testes (novo):**
- __tests__/unit/lib/supabase/middleware.test.ts
- __tests__/unit/app/api/usage/statistics/route.test.ts
- __tests__/unit/app/api/settings/integrations/route.test.ts
- __tests__/unit/app/api/integrations/apollo/test/route.test.ts
- __tests__/unit/app/api/settings/integrations/service-test/route.test.ts

**Tracking (modificado):**
- _bmad-output/implementation-artifacts/20-5-auditoria-acesso-sdr.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

| Data | Mudança |
| --- | --- |
| 2026-06-16 | Story 20.5 implementada (dev-story). 7 ACs satisfeitos: varredura authz (0 literais), Sidebar ciente de papel (esconde Configurações+Technographic do SDR), `/technographic` admin-only no middleware, invariante ≥1 admin fail-closed, `isAdminRole` removido, `useUser` sincronizado no auto-rebaixamento, cobertura authz papel×superfície (middleware/API/role-fixtures). Suíte 365 files / 6195 pass / 2 skip; tsc 0 erros em src/; eslint limpo; build verde. |

## Review Findings

> Code review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor), modo full c/ spec, 2026-06-16. **0 bug HIGH/MEDIUM de código.** O Acceptance Auditor (com a spec) confirmou os **7 ACs SATISFEITOS** + anti-patterns respeitados + Task 7. Os findings de código mais fortes foram **refutados** por defesa em profundidade: (a) o suposto fail-open de `isOnlyAdmin` (`!profile → false`) NÃO zera admins porque o caminho de auto-remoção em `removeTeamMember` ainda passa pelo guard inline fail-closed ([team.ts:325](../../src/actions/team.ts#L325)); (b) o middleware é fail-closed para rotas admin (`hasAdminAccess(undefined) → false → /leads`). Sobram 2 patches de **test-hardening (opcionais)** + 4 defers pré-existentes. 9 dismiss.

### Patches (test-hardening, opcionais)

- [x] [Review][Patch] ✅ aplicado — Teste do middleware agora prova que o papel é lido de `profiles` filtrado pelo `user.id` autenticado (mocks `from`/`select`/`eq` hoisted + asserções de alvo; +1 teste de que rota não-admin não consulta o perfil) [__tests__/unit/lib/supabase/middleware.test.ts]
- [x] [Review][Patch] ✅ aplicado — Adicionado teste do caminho fail-closed `catch → return true` de `isOnlyAdmin` (exceção via `getCurrentUserProfile` rejeitando → `true`) [__tests__/unit/actions/team.test.ts] / [src/actions/team.ts:672](../../src/actions/team.ts#L672)

### Deferred (pré-existentes / fora do escopo desta story)

- [x] [Review][Defer] `refetchProfile` não tem timeout/fallback (ao contrário do load inicial, com fallback de 5s) → se o refetch do auto-rebaixamento travar, o Sidebar esconde a nav admin de um Gestor/Diretor legítimo até reload [src/hooks/use-user.ts] — deferred, pre-existing
- [x] [Review][Defer] Middleware só consulta o perfil em rotas admin; um usuário autenticado sem linha em `profiles` (provisionamento parcial) alcança `/leads`,`/campaigns` sem tenant, dependendo só da RLS [src/lib/supabase/middleware.ts:48-52](../../src/lib/supabase/middleware.ts#L48-L52) — deferred, pre-existing
- [x] [Review][Defer] `startsWith("/technographic")` sobre-casa irmãos (`/technographic-foo`); um futuro `/api/technographic/*` receberia redirect 302 do middleware em vez de 403 JSON (contrato de API inconsistente com as rotas theirStack) [src/lib/supabase/middleware.ts:52,61](../../src/lib/supabase/middleware.ts#L52) — deferred, pre-existing/latent
- [x] [Review][Defer] `/insights` e `/agent` estão fora de `isProtectedRoute` → navegação direta não autenticada não é barrada para `/login` no middleware (página/RLS precisa cobrir) [src/lib/supabase/middleware.ts:48-52](../../src/lib/supabase/middleware.ts#L48-L52) — deferred, pre-existing
