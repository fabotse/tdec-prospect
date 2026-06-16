---
baseline_commit: 657888074ff4c2c8e8188756a7f4d7ec1bafbbdb
---

# Story 20.3: UI de papéis na gestão de time (relabel + atribuição)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Gestor,
I want visualizar e atribuir os papéis Gestor / Diretor / SDR aos membros do time (no convite **e** na edição de um membro existente),
so that eu controle quem tem cada nível de acesso diretamente pela interface.

## Contexto desta story (LEIA PRIMEIRO)

Esta é a story de **UI** da Epic 20. As camadas de dados (enum, migração, RLS — 20.1) e de autorização (helper `hasAdminAccess` + swap dos ~31 call-sites — 20.2) **já estão em código** no working tree do Epic 20. Como consequência do swap atômico de tipos feito na 20.1, **parte do escopo de UI já foi entregue de fato**:

| AC | Parte | Estado no código hoje | O que falta na 20.3 |
| --- | --- | --- | --- |
| **AC1** | Relabel dos badges Admin/Usuário → Gestor/Diretor/SDR | ✅ **Já entregue** — `ROLE_LABELS` virou `{gestor:"Gestor", diretor:"Diretor", sdr:"SDR"}` ([team.ts:33-37](../../src/types/team.ts#L33-L37)) e `TeamMemberList` consome via `ROLE_LABELS[member.role]` ([TeamMemberList.tsx:114](../../src/components/settings/TeamMemberList.tsx#L114)) | Apenas **endurecer** (fallback defensivo) + **teste de regressão** |
| **AC2** | Atribuição no **convite** (select de 3 opções, persistido em `team_invitations.role`) | ✅ **Já entregue** — `InviteUserDialog` itera `USER_ROLES`/`ROLE_LABELS` ([InviteUserDialog.tsx:130-134](../../src/components/settings/InviteUserDialog.tsx#L130-L134)), default `sdr`; `inviteUser` grava o papel ([team.ts:205,228](../../src/actions/team.ts#L205)) | Apenas **teste de regressão** |
| **AC2** | Atribuição na **edição de um membro existente** (papel persistido em `profiles.role`) | ❌ **NÃO existe** — o dropdown de `TeamMemberList` só tem "Cancelar Convite" e "Remover"; não há ação `updateMemberRole` em `team.ts` (grep confirmou: zero call-sites) | **★ Este é o trabalho net-new da story:** ação server + hook + UI de edição |
| **AC3** | SDR não acessa a página de time | ✅ **Já entregue (servidor + guard de página)** — middleware redireciona `/settings/*` p/ não-admin ([middleware.ts:76](../../src/lib/supabase/middleware.ts#L76)); `AdminGuard` envolve o layout de settings ([layout.tsx:24](../../src/app/(dashboard)/settings/layout.tsx#L24)) **e** a página de time ([team/page.tsx:43](../../src/app/(dashboard)/settings/team/page.tsx#L43)) | Apenas **teste de regressão** (o vazamento do **link** "Configurações" no Sidebar é escopo explícito da **20.5**, não desta story) |

> **Resumo:** o coração desta story é o **fluxo de edição de papel de um membro ativo** (AC2, parte "editando"). O resto (AC1 relabel, AC2 convite, AC3 negação de página) já está satisfeito pela 20.1/20.2 e aqui é **verificado + coberto por teste de regressão**, mais um endurecimento cosmético do badge.

## Acceptance Criteria

> Os 3 ACs são os definidos no épico ([epic-20-niveis-de-acesso.md](../planning-artifacts/epic-20-niveis-de-acesso.md#L147-L160)). Anotados com estado atual e o que esta story precisa entregar/comprovar.

1. **Given** a lista de membros do time hoje exibe badges "Admin"/"Usuário"
   **When** a UI é atualizada
   **Then** os badges passam a exibir "Gestor", "Diretor" ou "SDR" conforme o papel
   → **Já satisfeito pela 20.1** (`ROLE_LABELS` + `TeamMemberList`). Esta story **endurece** o badge com fallback defensivo (`ROLE_LABELS[role] ?? role`) e adiciona **teste de regressão** garantindo o label correto por papel.

2. **Given** o Gestor está convidando **ou editando** um membro
   **When** seleciona o papel
   **Then** as opções disponíveis são Gestor, Diretor e SDR
   **And** o papel selecionado é persistido no perfil do membro
   → **Convite: já satisfeito** (InviteUserDialog). **Edição: net-new** — adicionar fluxo para alterar o papel de um **membro ativo** e persistir em `profiles.role`, com as opções Gestor/Diretor/SDR, autorização server-side (`hasAdminAccess`), isolamento de tenant e proteção do "último admin".

3. **Given** apenas Gestor/Diretor tem acesso à gestão de time
   **When** um SDR tenta acessar a página de time
   **Then** o acesso é negado (consistente com NFR-S1)
   → **Já satisfeito** (middleware + AdminGuard de página). Esta story adiciona/confirma **teste de regressão** do `AdminGuard` renderizando o fallback para SDR. **(O gate do item de menu no Sidebar é da 20.5.)**

## Tasks / Subtasks

- [x] **Task 1 — AC1: Relabel dos badges (verificar + endurecer)**
  - [x] 1.1 Confirmado: `ROLE_LABELS` = `{gestor:"Gestor", diretor:"Diretor", sdr:"SDR"}` e `TeamMemberList` renderiza o label com `variant` via `hasAdminAccess(member.role)` (entregue na 20.1)
  - [x] 1.2 Fallback defensivo no badge: `ROLE_LABELS[member.role] ?? member.role` ([TeamMemberList.tsx:114](../../src/components/settings/TeamMemberList.tsx#L114)). *Resolve o item P2 deferido da review 20.2.*
  - [x] 1.3 Teste (`TeamMemberList.test.tsx`): badge "Gestor"/"SDR" por papel (já existia) + novo teste de fallback para papel desconhecido (`role badge fallback`)

- [x] **Task 2 — AC2 (convite): verificar select de 3 opções (regressão)**
  - [x] 2.1 Confirmado: `InviteUserDialog` lista Gestor/Diretor/SDR via `USER_ROLES`/`ROLE_LABELS`, default `sdr`; `inviteUser` grava o papel em `team_invitations.role`
  - [x] 2.2 Regressão coberta por `InviteUserDialog.test.tsx` existente (default sdr, 3 papéis, submit com role) — verde, sem alterações

- [x] **Task 3 — AC2 (edição): ação server `updateMemberRole` (NET-NEW)**
  - [x] 3.1 `updateMemberRoleSchema` em [types/team.ts](../../src/types/team.ts) (`userId` uuid + `role` enum)
  - [x] 3.2 `updateMemberRole(userId, newRole)` em [src/actions/team.ts](../../src/actions/team.ts): valida → auth `hasAdminAccess` → tenant isolation → proteção do último admin → `update profiles.role` tenant-scoped
  - [x] 3.3 7 testes em `team.test.ts` (papel inválido, não-auth, não-admin, cross-tenant, rebaixar único admin bloqueado, sucesso sdr→gestor, diretor com acesso admin)

- [x] **Task 4 — AC2 (edição): hook + dialog + ação na lista (NET-NEW)**
  - [x] 4.1 [use-team-members.ts](../../src/hooks/use-team-members.ts): `updateRoleMutation` invalida `TEAM_QUERY_KEY` **e** `ONLY_ADMIN_QUERY_KEY`; wrapper `updateMemberRole(userId, role)` + `isUpdatingRole`
  - [x] 4.2 [ChangeRoleDialog.tsx](../../src/components/settings/ChangeRoleDialog.tsx) criado (Dialog + Select 3 opções, `flex flex-col gap-2`, toast, fecha no sucesso). Reset de estado via `key={member.id}` no parent (padrão React, sem effect — evita `react-hooks/set-state-in-effect`)
  - [x] 4.3 [TeamMemberList.tsx](../../src/components/settings/TeamMemberList.tsx): item "Alterar Função" só para `active`, callback `onChangeRole`; anti-lockout (desabilitado p/ único admin self); fiado em [team/page.tsx](../../src/app/(dashboard)/settings/team/page.tsx)
  - [x] 4.4 Testes: hook (invalida ambas as queries), TeamMemberList (item p/ ativo, ausente p/ pendente, desabilitado p/ único admin), ChangeRoleDialog (novo — render, save→updateMemberRole+toast+close, erro mantém aberto, loading)

- [x] **Task 5 — AC3: SDR negado na página de time (regressão)**
  - [x] 5.1 Confirmado: `team/page.tsx` e `settings/layout.tsx` usam `AdminGuard`; middleware redireciona `/settings/*` p/ SDR (entregue na 20.1/20.2)
  - [x] 5.2 Coberto por `AdminGuard.test.tsx` existente ("fallback when not admin" = SDR deriva `isAdmin=false`). **Não fabriquei teste duplicado** (regra anti-cheating). Caveat: link "Configurações" no Sidebar segue visível ao SDR → **Story 20.5**

- [x] **Task 6 — Validação final**
  - [x] 6.1 `npx vitest run` — **359 arquivos, 6135 pass / 2 skip, 0 falhas**
  - [x] 6.2 `npx eslint` nos arquivos tocados — **0 erros / 0 warnings**; `tsc --noEmit` — **0 erros em `src/`**
  - [x] 6.3 Os 3 ACs do épico conferidos contra o código final (ver Completion Notes)

- [x] **Task 7 — Correção pós-teste visual: persistência real do papel (AC2)**
  > Bug encontrado por Fabossi no teste visual: toast de sucesso, mas o papel **não** gravava (sumia no refresh).
  - [x] 7.1 **Causa:** `profiles` só tinha policy de UPDATE "próprio perfil" (`id = auth.uid()`, [00003:39](../../supabase/migrations/00003_setup_rls_policies.sql#L39)). Admin editando OUTRO membro → RLS filtra a linha → UPDATE afeta **0 linhas sem erro** → falso sucesso.
  - [x] 7.2 **Fix RLS (decisão A, Fabossi 2026-06-16):** nova migration [00054](../../supabase/migrations/00054_allow_admin_update_tenant_profiles.sql) — policy `"Admins can update tenant profiles"` via `public.is_admin()` + tenant, **simétrica** à policy de DELETE de admin (00009). Defesa-em-profundidade (NFR-S2 / AD-3).
  - [x] 7.3 **Blindagem da action:** `updateMemberRole` agora faz `.select("id")` no UPDATE e retorna **erro real** se 0 linhas afetadas (`"Não foi possível alterar o papel do usuário."`) — nunca mais reporta sucesso falso. Teste novo cobre o caso RLS-bloqueado.
  - [x] 7.4 ⚠️ **Deploy:** a 00054 precisa ser aplicada no banco (Supabase Dashboard → SQL Editor) — banco é gerido à mão. Entra no checklist de release junto da 00053.

## Dev Notes

### Estado atual verificado (linha de base — não reinventar)

- **Tipos / labels** ([src/types/team.ts](../../src/types/team.ts)): `USER_ROLES = ["gestor","diretor","sdr"]` (deriva de `UserRole` em `database.ts`), `ROLE_LABELS` mapeia os 3 papéis, `inviteUserSchema.role = z.enum(USER_ROLES)`. **`UserRole` é reexportado de `@/types/database` — não recriar um terceiro tipo.**
- **Capacidade** ([src/lib/auth/capabilities.ts](../../src/lib/auth/capabilities.ts)): `ADMIN_ROLES = ["gestor","diretor"]`, `hasAdminAccess(role)`. **Fonte única de "tem acesso admin". NUNCA comparar `role === "gestor"` solto** — sempre via `hasAdminAccess`. Grep por `role === "admin"`/`!== "admin"` em `src/` retorna zero (garantido pela 20.2).
- **Ações de time** ([src/actions/team.ts](../../src/actions/team.ts)): `getTeamMembers`, `inviteUser`, `removeTeamMember`, `cancelInvitation`, `isOnlyAdmin`. **Todas** seguem o mesmo cabeçalho de autorização: `getCurrentUserProfile()` → `hasAdminAccess` → operação. `removeTeamMember` ([:304-318](../../src/actions/team.ts#L304-L318)) é o **modelo a copiar** para a proteção de "último admin" (conta por `.in("role", [...ADMIN_ROLES])`, `count === 1`).
- **Hook** ([src/hooks/use-team-members.ts](../../src/hooks/use-team-members.ts)): TanStack Query; `TEAM_QUERY_KEY = ["team","members"]`, `ONLY_ADMIN_QUERY_KEY = ["team","isOnlyAdmin"]`. Padrão de mutation: `useMutation` + `onSuccess` invalida/atualiza cache. A nova mutation de papel **deve invalidar ambas** (mudar papel pode alterar quem é admin → afeta `isOnlyAdmin`).
- **Lista** ([src/components/settings/TeamMemberList.tsx](../../src/components/settings/TeamMemberList.tsx)): badge de papel em [:109-116](../../src/components/settings/TeamMemberList.tsx#L109-L116); dropdown de ações em [:140-184](../../src/components/settings/TeamMemberList.tsx#L140-L184) (hoje: Cancelar Convite / Remover, com guarda de "único admin" via `isCurrentUserOnlyAdmin`).
- **Dialogs**: `InviteUserDialog` (form com `react-hook-form` + `zodResolver`, `Select` shadcn) e `RemoveUserDialog` (`AlertDialog` de confirmação) são os **dois padrões existentes** — o `ChangeRoleDialog` deve espelhar um deles (recomendado: `Dialog` simples com `Select`, mais próximo do InviteUserDialog).
- **Guards de página**: `AdminGuard` ([src/components/settings/AdminGuard.tsx](../../src/components/settings/AdminGuard.tsx)) usa `useUser().isAdmin` (derivado de `hasAdminAccess`). Envolve `settings/layout.tsx` e `team/page.tsx`.

### Decisões de design vinculantes (para não over/under-engineer)

1. **Edição atinge apenas membros `active`.** O AC2 diz "persistido no **perfil** do membro" → `profiles.role`. Convites `pending` não têm profile; seu papel é definido no convite (já coberto). **Não** implementar edição de papel de convite pendente (se necessário trocar, cancela-se e reconvida-se). O item "Alterar função" não aparece para `pending`.
2. **Sem gate de quais papéis um admin pode atribuir.** Pela [matriz de permissão §4](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md#L187-L205): Gestor == Diretor (idênticos hoje) e **não há** superfície "só Gestor"/"só Diretor". Logo qualquer admin (gestor/diretor) pode atribuir **qualquer** dos 3 papéis. **Não** adicionar gating de capacidade do convidador/editor (isso resolve, por decisão, o item LOW deferido da review 20.2 sobre `InviteUserDialog`). A única regra protetiva é a do "último admin".
3. **Proteção do último admin também na edição.** Rebaixar (`gestor|diretor` → `sdr`) o único admin do tenant deixaria o tenant sem ninguém com acesso admin. Bloquear no servidor (espelhar `removeTeamMember`) e desabilitar na UI para o auto-rebaixamento do único admin.
4. **`updateMemberRole` é idempotente/segura:** filtrar sempre por `tenant_id` no `UPDATE` (defense-in-depth além do RLS). Mensagens de erro em PT-BR, no mesmo tom das existentes.

### Padrões obrigatórios do projeto

- **Tailwind v4 + Radix:** `space-y-*` **NÃO** funciona com componentes Radix (Select/Dialog). Use **`flex flex-col gap-2`** em todo wrapper label+select/input. (InviteUserDialog já segue isso — replicar no ChangeRoleDialog.)
- **shadcn Select:** manter `position="popper"` + `align="start"` (default do projeto em `ui/select.tsx`) — não passar overrides por call-site.
- **ESLint `no-console`:** proibido `console.log`; `console.error` é tolerado nos blocos `catch` das server actions (padrão já presente em team.ts).
- **i18n:** todo texto de UI em **Português (BR)**.
- **Server action result:** sempre `ActionResult<T>` = `{ success:true, data? } | { success:false, error }`.

### Anti-patterns — NÃO fazer

- ❌ Não introduzir `role === "gestor"`/`=== "diretor"` solto — use `hasAdminAccess`/`ADMIN_ROLES`.
- ❌ Não criar um novo tipo `UserRole` — reuse o de `@/types/database` (via `team.ts`).
- ❌ Não confiar só na UI para autorização — a action `updateMemberRole` **precisa** revalidar `hasAdminAccess` no servidor (NFR-S2).
- ❌ Não tocar em `middleware.ts`, `capabilities.ts`, RLS/migrations — fora do escopo (20.5 cuida de auditoria; 20.4 do provisionamento).
- ❌ Não "consertar" o link do Sidebar para SDR aqui — é da 20.5.

### Itens deferidos relevantes (de onde vêm / para onde vão)

- **P2 (badge sem fallback)** — review 20.2, `deferred-work.md`. **Resolvido nesta story** (Task 1.2).
- **InviteUserDialog sem gate de papéis** — review 20.2. **Resolvido por decisão** (Decisão de design #2: sem gate por enquanto).
- **Convite → signup não aplica papel** (`handle_new_user` hardcoda `sdr`) — **Dono: 20.4.** Não é desta story. Consequência prática: hoje, convidar como gestor/diretor cria o usuário como `sdr` até a 20.4; a **edição** desta story é justamente o caminho manual para corrigir o papel de um membro já criado.
- **AC3 overclaim / Sidebar leak para SDR** — **Dono: 20.5.**
- **`isAdminRole` dead code**, **deploy×migration**, **tsc em `__tests__/`** — fora do escopo.

### Testing requirements

- Framework: **Vitest** + Testing Library (happy-dom). Rodar: `npx vitest run`.
- **Mocks (espelhar `team.test.ts`):** `vi.mock` de `@/lib/supabase/server` (`createClient`), `@/lib/supabase/admin` (`createAdminClient`), `@/lib/supabase/tenant` (`getCurrentUserProfile`). Perfis mock: `mockAdminProfile` (`role:"gestor"`), `mockUserProfile` (`role:"sdr"`). Para `updateMemberRole`, encadear `from().update().eq().eq()` e `from().select().eq().in()` (proteção último admin) como nos testes de `removeTeamMember`.
- **Cobrir papel `diretor`** em ao menos um caso de autorização da nova action (a review 20.2 apontou que hoje só `gestor`/`sdr` são exercitados; incluir `diretor` previne regressão de `hasAdminAccess`→`=== "gestor"`).
- Não regredir os testes existentes de: `team.test.ts`, `types/team.test.ts`, `InviteUserDialog.test.tsx`, `TeamMemberList.test.tsx`, `use-team-members.test.tsx`, `AdminGuard.test.tsx`.
- Cobertura papel × superfície completa (middleware/API/RLS) é da **20.5** — não tentar fechar aqui.

### Project Structure Notes

- Action nova **dentro** de `src/actions/team.ts` (não criar arquivo novo) — mantém coesão do domínio de time.
- Schema novo **dentro** de `src/types/team.ts` (junto de `inviteUserSchema`).
- Componente novo: `src/components/settings/ChangeRoleDialog.tsx`; se houver barrel `src/components/settings/index.ts`, exportar lá (verificar — `AdminGuard` está nele).
- Sem novas dependências: `react-hook-form`, `zod`, `@tanstack/react-query`, shadcn `Select`/`Dialog`, `sonner` (toast) e `lucide-react` já estão no projeto. Versões pinadas pela arquitetura — **nenhuma pesquisa de versão necessária**.

### References

- [epic-20-niveis-de-acesso.md#L141-L160](../planning-artifacts/epic-20-niveis-de-acesso.md#L141-L160) — Story 20.3 (FR6) e ACs
- [architecture-epic-20-niveis-de-acesso.md#L265-L282](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md#L265-L282) — §5.3 mudanças de código da 20.3; [§4 matriz de permissão](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md#L187-L205) (gestor==diretor, sem superfície exclusiva)
- [20-2-helper-capacidade-refatoracao-guards.md](20-2-helper-capacidade-refatoracao-guards.md) — padrão de capacidade, defense-in-depth, itens roteados para 20.3/20.4/20.5
- [deferred-work.md](deferred-work.md) — P2 badge fallback, InviteUserDialog sem gate, AC3/Sidebar (20.5), convite→signup (20.4)
- Código-base: [team.ts](../../src/actions/team.ts) (padrão de action + último admin), [use-team-members.ts](../../src/hooks/use-team-members.ts) (padrão de mutation), [TeamMemberList.tsx](../../src/components/settings/TeamMemberList.tsx), [InviteUserDialog.tsx](../../src/components/settings/InviteUserDialog.tsx), [RemoveUserDialog.tsx](../../src/components/settings/RemoveUserDialog.tsx)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Code / bmad-dev-story)

### Debug Log References

- Teste de action falhou na 1ª execução: `TARGET_ID` all-zeros não é UUID válido pelo regex estrito do Zod (`z.string().uuid()` exige nibbles de versão/variante válidos) → trocado por UUID v4 (`11111111-1111-4111-8111-111111111111`). 31/31 verdes.
- ESLint `react-hooks/set-state-in-effect` em `ChangeRoleDialog`: o reset de `selectedRole` via `useEffect` foi substituído por remount com `key={member.id}` no parent (padrão React recomendado). Sem effect, sem warning, testes seguem verdes.

### Completion Notes List

**Escopo (A) completo entregue** — fluxo de edição de papel de membro ativo, além de verificação/endurecimento de AC1/AC2-convite/AC3.

**Verificação dos ACs do épico:**
- **AC1 (badges Gestor/Diretor/SDR):** ✅ já entregue na 20.1; endurecido com fallback `?? member.role` (resolve P2 da review 20.2) + teste de fallback.
- **AC2 (atribuição no convite OU edição, persistido no perfil):** ✅ convite já entregue; **edição net-new** — `updateMemberRole` action (auth admin, tenant-isolated, proteção do último admin) + hook + `ChangeRoleDialog` + item "Alterar Função". Persiste em `profiles.role`. Membros `pending` não são editáveis (papel definido no convite — por design).
- **AC3 (SDR negado na página de time):** ✅ já entregue (middleware redirect + `AdminGuard` no layout e na página); coberto por `AdminGuard.test.tsx`. Link do Sidebar p/ SDR fica para a 20.5.

**Decisões de design aplicadas:** sem gate de quais papéis um admin pode atribuir (gestor==diretor, matriz §4); proteção do último admin também no rebaixamento (servidor + UI); `ChangeRoleDialog` permite salvar mesmo sem mudança (action idempotente) para manter o caminho de confirmação testável dada a limitação do Radix Select em happy-dom.

**Correção pós-teste visual (Task 7):** o teste visual do Fabossi expôs um falso sucesso — toast verde mas o papel não gravava. Causa: faltava policy de RLS de UPDATE de admin em `profiles` (só havia "atualizar o próprio perfil"). Corrigido com a migration **00054** (policy via `is_admin()` + tenant, simétrica à de DELETE) **e** blindagem da action (`.select()` + guarda de 0 linhas → erro real). Decisão A (RLS, defesa-em-profundidade).

**Qualidade:** suíte completa **6135 pass / 2 skip / 0 fail** (359 arquivos); eslint 0; `tsc --noEmit` 0 erros em `src/`. Nenhuma regressão. 23 testes novos.

**⚠️ Pré-requisito de teste/deploy:** aplicar a migration **00054** no banco (Supabase é gerido à mão) — sem ela, a edição de papel reporta erro honesto (não mais falso sucesso), mas só grava de verdade após a policy existir.

**Roteado para outras stories (não regressão desta):** convite→signup aplica papel (`handle_new_user`) → **20.4**; link "Configurações" no Sidebar visível ao SDR → **20.5**.

### File List

**Modificados:**
- src/types/team.ts (`updateMemberRoleSchema` + `UpdateMemberRoleInput`)
- src/actions/team.ts (action `updateMemberRole` + blindagem `.select()`/guarda de 0 linhas)
- src/hooks/use-team-members.ts (mutation + wrapper `updateMemberRole` + `isUpdatingRole`)
- src/components/settings/TeamMemberList.tsx (prop `onChangeRole`, item "Alterar Função", fallback de badge, ícone `UserCog`)
- src/app/(dashboard)/settings/team/page.tsx (estado `memberToChangeRole` + `ChangeRoleDialog` com `key`)
- __tests__/unit/actions/team.test.ts (+`mockDiretorProfile`, +describe `updateMemberRole`)
- __tests__/unit/hooks/use-team-members.test.tsx (+mock/import `updateMemberRole`, +describe `updateMemberRole`)
- __tests__/unit/components/settings/TeamMemberList.test.tsx (+`onChangeRole`/hook fields, +describes change-role e badge fallback)

**Criados:**
- src/components/settings/ChangeRoleDialog.tsx
- supabase/migrations/00054_allow_admin_update_tenant_profiles.sql
- __tests__/unit/components/settings/ChangeRoleDialog.test.tsx
- _bmad-output/implementation-artifacts/20-3-ui-papeis-gestao-de-time.md (story)

## Change Log

- 2026-06-16: Story criada via `create-story` (ready-for-dev). Análise revelou que relabel (AC1) + select de convite (AC2-convite) já entregues na 20.1; net-new = edição de papel.
- 2026-06-16: Decisão de escopo **(A) completo** (Fabossi). Implementado `updateMemberRole` (action + hook + `ChangeRoleDialog` + item "Alterar Função") com proteção do último admin e isolamento de tenant; fallback de badge (P2 da review 20.2); ACs 1/2/3 verificados. Suíte verde 6134 pass / 0 fail; eslint e tsc(src) limpos. Status → review.
- 2026-06-16: **Correção pós-teste visual** (Fabossi reportou falso sucesso). Causa = sem policy de RLS de UPDATE de admin em `profiles`. Fix: migration **00054** (policy `is_admin()`+tenant) + blindagem da action (`.select()`/guarda de 0 linhas). Decisão A (RLS). Suíte 6135 pass / 0 fail; eslint/tsc(src) limpos. Mantém status review.
- 2026-06-16: **Code review adversarial 3 camadas (YOLO).** 0 bug HIGH; ACs 1/2/3 verificados; sem scope creep. 2 patches aplicados (test-hardening dos predicados de segurança em `updateMemberRole` + `console.error` no caminho de 0 linhas); 3 defers → 20.5 (invariante ≥1 admin só na app/TOCTOU; `useUser` obsoleto no auto-rebaixamento; RLS row-level não restringe coluna); 9 dismiss. `team.test.ts` 32/32 verde, eslint limpo. Status → **done**.

## Review Findings (Code Review adversarial 3 camadas — 2026-06-16, YOLO)

> Camadas: **Blind Hunter** (diff-only), **Edge Case Hunter** (diff + leitura do projeto), **Acceptance Auditor** (diff + spec + ACs). Resultado: **0 bug HIGH**, ACs 1/2/3 verificados de forma independente, **sem scope creep** (não tocou `middleware.ts`/`capabilities.ts`/Sidebar/RLS além da 00054). `is_admin()` (00053) e `get_current_tenant_id()` (00002) confirmados; 00054 idempotente e simétrica à DELETE de admin (00009). Triagem: 2 patches (aplicados), 3 defers, 9 dismiss.

**Patches (aplicados nesta review):**
- [x] [Review][Patch] Test-hardening dos predicados de segurança em `updateMemberRole` — os testes de "último admin" e de UPDATE bem-sucedido não asseriam os filtros (`.eq("tenant_id")` / `.in("role", ["gestor","diretor")`); uma regressão que removesse o isolamento de tenant ou o filtro de papel passaria verde. Spies nomeados + assertions adicionados. [__tests__/unit/actions/team.test.ts] — **32/32 verdes, eslint limpo.**
- [x] [Review][Patch] `console.error` no caminho de 0 linhas afetadas em `updateMemberRole` — sem log, um deploy sem a migration 00054 parecia "erro do usuário" em vez de problema de config. Agora é diagnosticável. [src/actions/team.ts:477]

**Defers (reais, pré-existentes/arquiteturais → roteados; ver `deferred-work.md`):**
- [x] [Review][Defer] Invariante "≥1 admin" só na camada de aplicação — TOCTOU (rebaixamentos concorrentes → 0 admins), fail-open se `count` for `null`, e RLS não garante o invariante. Mesmo padrão de `removeTeamMember` (não regressão). **Dono: 20.5.** MEDIUM.
- [x] [Review][Defer] Auto-rebaixamento deixa `useUser().isAdmin` obsoleto no cliente (singleton de módulo fora do TanStack Query; mutation não o atualiza). Servidor barra; UI corrige no reload. **Dono: 20.5.** MEDIUM (UX, raro).
- [x] [Review][Defer] Policy RLS de UPDATE (00054) é row-level e não restringe à coluna `role` (concede UPDATE de qualquer coluna do tenant ao admin). Mitigado: única caller escreve só `{ role }`; simétrica à DELETE de admin. **Dono: 20.5** (hardening). LOW.

**Dismiss (9 — falsos positivos / verificados seguros / por design):** divergência de semântica admin UI×servidor (verificado consistente via `ADMIN_ROLES`); lookup do alvo sem filtro de tenant na query (correto de qualquer forma — guarda JS é load-bearing e testada); flicker do dialog no fechamento (cosmético, conteúdo desmonta); salvar mesmo papel reporta sucesso (**por design**, documentado nas Completion Notes — action idempotente p/ testabilidade no happy-dom); `hasAdminAccess(role)` no `variant` do badge com papel desconhecido (verificado tolerante — retorna `false`, não lança); dois dialogs abertos ao mesmo tempo (inalcançável — dropdown serializa); comentário da 00054 cita 00009 (citação **correta**); init do `selectedRole` com papel legado (inalcançável — enum do banco impede valor fora de `gestor|diretor|sdr`).

**Qualidade pós-review:** `npx vitest run __tests__/unit/actions/team.test.ts` → 32/32 pass; `npx eslint` nos arquivos tocados → 0/0.

## Decisão de escopo (resolvida)

> **Fabossi, 2026-06-16:** escolhido **(A) Escopo completo** — implementar o fluxo de edição de papel de membro ativo (`updateMemberRole` action + hook + `ChangeRoleDialog` + item "Alterar função"), além de verificar/endurecer AC1/AC2-convite/AC3. As Tasks 1–6 acima refletem essa decisão.

A arquitetura (§5.3) listou para a 20.3 apenas *relabel de badge + select do convite* (ambos já entregues pela 20.1), mas o **AC2 do épico** exige o caminho "editando um membro... papel persistido no perfil", que não existe hoje. A leitura (A) entrega o AC2 de verdade e serve de caminho manual de correção de papel enquanto a 20.4 não conserta o fluxo convite→signup.
