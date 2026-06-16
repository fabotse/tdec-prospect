---
baseline_commit: 76895d62638d60592c250c99beac7af8ae11c0f1
---

# Story 20.1: Modelo de três papéis — enum, migração e RLS

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a sistema,
I want suportar os papéis Gestor, Diretor e SDR no banco e no código, migrando os dados existentes sem quebrar acesso,
so that o controle de acesso por papel tenha uma base sólida, com build e autenticação verdes ponta a ponta.

## Escopo desta story (LEIA PRIMEIRO — decisão de sequenciamento)

A troca do vocabulário de papéis (`admin|user` → `gestor|diretor|sdr`) é **atômica**: mudar o tipo `UserRole`, migrar os dados do banco e atualizar as ~31 comparações `role === "admin"` são **inseparáveis** — qualquer separação deixa o **build quebrado** (erros TS) **ou a auth quebrada** (admin-virou-gestor perde acesso silenciosamente, violando NFR-C1).

**Decisão (Fabossi, 2026-06-15):** a Story 20.1 é **atômica e verde** — entrega a migração + os tipos + o helper `hasAdminAccess` + o swap mecânico de **todos** os call-sites que referenciam os literais antigos. Ao final, `npm run build` passa e admins migrados (→ gestor) mantêm acesso total.

**Knock-on nas stories vizinhas** (a SM deve reescopar):
- **20.2** deixa de ser "criar o helper + refatorar call-sites" e passa a ser **consolidação**: formalizar o padrão de capacidade (uma função por capacidade p/ o futuro Diretor), semântica do "último admin", auditoria mais profunda de AdminGuard/middleware e **testes papel × capacidade**.
- **20.3** (UI de papéis): os labels e o select já passam a funcionar via `ROLE_LABELS` aqui (mínimo p/ compilar); 20.3 vira **polimento de UX** (estilo distinto do Diretor, descrições de papel, fluxo de edição de papel se faltar).
- **20.4** (provisionamento) e a **correção do gap do convite** (lookup server-side pós-aceitação) **NÃO** entram aqui — `handle_new_user()` nesta story muda **apenas** o default `'user'`→`'sdr'`.

## Acceptance Criteria

1. **Given** `UserRole` hoje é `"admin" | "user"` definido em dois arquivos
   **When** o modelo é expandido
   **Then** `UserRole` passa a ser `"gestor" | "diretor" | "sdr"` com **fonte única** (uma definição canônica em `src/types/database.ts`; `src/types/team.ts` deriva dela)
   **And** `USER_ROLES`, `ROLE_LABELS`, `inviteUserSchema` e `isValidRole` refletem os três valores novos

2. **Given** existem perfis com papéis `admin` e `user` em `profiles` e convites em `team_invitations`
   **When** a migration `00053` é aplicada
   **Then** `admin → gestor` e `user → sdr` em **ambas** as tabelas
   **And** nenhum usuário perde o nível de acesso que tinha (admin migrado para gestor mantém acesso total — NFR-C1)

3. **Given** o `role` é `TEXT + CHECK (role IN ('admin','user'))` em `profiles` e `team_invitations`
   **When** a migration é aplicada
   **Then** o CHECK passa a `role IN ('gestor','diretor','sdr')` em ambas as tabelas
   **And** o `DEFAULT` da coluna muda de `'user'` para `'sdr'` (menor privilégio)

4. **Given** as policies RLS dependem de `public.is_admin()` (centralizado) **exceto** as 3 policies inline de `ai_prompts` (`00020`)
   **When** a migration é aplicada
   **Then** o **corpo** de `public.is_admin()` passa a `role IN ('gestor','diretor')` (nome mantido)
   **And** as 3 policies de `ai_prompts` (INSERT/UPDATE/DELETE) são refatoradas para chamar `public.is_admin()` em vez do `EXISTS (... role = 'admin')` inline
   **And** o trigger `handle_new_user()` passa a inserir `role = 'sdr'` por default (apenas o literal default; **sem** honrar metadata — isso é 20.4)
   **And** o isolamento por `tenant_id` é preservado

5. **Given** existem ~31 comparações `role === "admin"` / `!== "admin"` espalhadas (server actions, API routes, middleware, `tenant.isAdmin`, `useUser`, `isAdminRole`, e os literais de UI em `TeamMemberList`/`InviteUserDialog`)
   **When** o helper `hasAdminAccess(role)` é introduzido e consumido
   **Then** existe `hasAdminAccess(role: UserRole | null | undefined): boolean` retornando `true` para `gestor` e `diretor`, `false` para `sdr`
   **And** **nenhuma** ocorrência de `role === "admin"`, `role !== "admin"`, `=== "user"` ou `!== "user"` permanece no código de aplicação (verificável por grep retornando zero)
   **And** `tenant.isAdmin`, `useUser().isAdmin` e `isAdminRole` passam a delegar ao helper

6. **Given** o código foi alterado
   **When** `npx tsc --noEmit` e `npm run build` rodam
   **Then** zero erros de compilação
   **And** a suíte de testes (`npx vitest run`) fica verde, com os testes que asseriam os literais antigos atualizados para o vocabulário novo

## Tasks / Subtasks

- [x] Task 1: Migration `00053_expand_roles_to_gestor_diretor_sdr.sql` (AC: #2, #3, #4)
  - [x] 1.1 Verificar os nomes reais dos CHECK constraints (`\d public.profiles`, `\d public.team_invitations`) antes de aplicar
  - [x] 1.2 `DROP CONSTRAINT` dos CHECK antigos em `profiles` e `team_invitations`
  - [x] 1.3 `UPDATE` dados: `admin→gestor`, `user→sdr` em **ambas** as tabelas (nesta ordem, antes do novo CHECK)
  - [x] 1.4 `ADD CONSTRAINT` novo CHECK `role IN ('gestor','diretor','sdr')` em ambas; `ALTER COLUMN role SET DEFAULT 'sdr'` em ambas
  - [x] 1.5 `CREATE OR REPLACE FUNCTION public.is_admin()` com corpo `role IN ('gestor','diretor')` + `COMMENT ON FUNCTION`
  - [x] 1.6 `DROP`/`CREATE` as 3 policies de `ai_prompts` (INSERT/UPDATE/DELETE) usando `public.is_admin()`
  - [x] 1.7 `CREATE OR REPLACE FUNCTION public.handle_new_user()` trocando o literal `'user'` por `'sdr'` (manter o resto idêntico)
- [x] Task 2: Tipos — expandir e unificar `UserRole` (AC: #1)
  - [x] 2.1 `src/types/database.ts`: `UserRole = "gestor" | "diretor" | "sdr"` (fonte canônica); atualizar `isValidRole`; `isAdminRole` delega a `hasAdminAccess`
  - [x] 2.2 `src/types/team.ts`: `USER_ROLES = ["gestor","diretor","sdr"] as const`; `UserRole` derivado/reexportado de database.ts; `ROLE_LABELS = { gestor:"Gestor", diretor:"Diretor", sdr:"SDR" }`; `inviteUserSchema` segue `z.enum(USER_ROLES)`
- [x] Task 3: Helper de capacidade `hasAdminAccess` (AC: #5)
  - [x] 3.1 Criar `src/lib/auth/capabilities.ts` com `ADMIN_ROLES` + `hasAdminAccess(role)`
  - [x] 3.2 Atualizar `tenant.isAdmin()` ([tenant.ts:51](src/lib/supabase/tenant.ts#L51)) para `hasAdminAccess(profile?.role)`
  - [x] 3.3 Atualizar `useUser().isAdmin` ([use-user.ts:250](src/hooks/use-user.ts#L250)) para `hasAdminAccess(profile?.role)`
- [x] Task 4: Swap mecânico dos call-sites server-side (AC: #5)
  - [x] 4.1 `src/actions/team.ts` (5 checagens + 2 `.eq("role","admin")`→`.in("role",ADMIN_ROLES)` p/ "último admin") + `src/actions/knowledge-base.ts` (10) + `src/actions/integrations.ts` (4): `!== "admin"` → `!hasAdminAccess(profile.role)`
  - [x] 4.2 API routes (`src/app/api/settings/**`, `src/app/api/integrations/**`, `src/app/api/usage/**`): idem (11)
  - [x] 4.3 `src/lib/supabase/middleware.ts:75`: `profile?.role !== "admin"` → `!hasAdminAccess(profile?.role)`
- [x] Task 5: Swap mínimo dos literais de UI p/ compilar (AC: #5, #6)
  - [x] 5.1 `TeamMemberList.tsx:109-111`: texto via `ROLE_LABELS[member.role]`; variant via `hasAdminAccess(member.role)`
  - [x] 5.2 `InviteUserDialog.tsx:114-127`: opções a partir de `USER_ROLES` + `ROLE_LABELS`; cast `value as UserRole`; default `'sdr'`
  - [x] 5.3 **Não** fazer polimento de UX aqui (estilo Diretor, descrições) — pertence a 20.3
- [x] Task 6: Verificação e testes (AC: #2, #6)
  - [x] 6.1 Grep garantindo **zero** literais de papel de conta `role === "admin"` / `!== "admin"` / `=== "user"` / `!== "user"` no código de app (a única ocorrência de `=== "user"` restante é `message.role` em AgentMessageBubble — papel de **mensagem de chat** `MessageRole`, domínio distinto de `UserRole`)
  - [x] 6.2 Atualizar testes que asseriam vocabulário antigo: `types/team.test.ts`, `types/database.test.ts`, `actions/team.test.ts`, `InviteUserDialog.test.tsx`, `TeamMemberList.test.tsx`, `use-user.test.ts`, `use-team-members.test.tsx`, `tenant.test.ts`, `RemoveUserDialog.test.tsx`, `actions/integrations.test.ts`, `actions/knowledge-base.test.ts`, `actions/whatsapp*.test.ts`, `monitoring/route.test.ts`, `theirstack/*.test.ts` (AdminGuard.test.tsx não exigiu mudança — consome `isAdmin` via useUser, sem literal)
  - [x] 6.3 Adicionar testes do `hasAdminAccess` (gestor→true, diretor→true, sdr→false, null→false) em `__tests__/unit/lib/auth/capabilities.test.ts`
  - [x] 6.4 `npm run build` verde; `npx vitest run` verde (6112 pass / 2 skip / 0 fail); `npx tsc --noEmit` sem erros em `src/` (161 erros pré-existentes em `__tests__/` não relacionados a papéis — ver Completion Notes)

## Dev Notes

### Decisões da arquitetura que esta story implementa (vinculantes)

Fonte de verdade: [architecture-epic-20-niveis-de-acesso.md](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md). Decisões aprovadas relevantes:
- **AD-1:** `role` continua `TEXT + CHECK` (NÃO criar ENUM Postgres).
- **AD-2:** helper único `hasAdminAccess` é a fonte de verdade de capacidade; futuro Diretor = nova função de capacidade, nunca `role === X` solto.
- **AD-3:** manter o nome `is_admin()` (só trocar o corpo) + eliminar a exceção inline do `00020`.
- **AD-4:** `admin→gestor`, `user→sdr`; default `sdr`.

### Linha de base do código (verificada — ler antes de alterar)

| Artefato | Local | Estado atual |
| --- | --- | --- |
| `UserRole` (canônico) | [database.ts:18](src/types/database.ts#L18) | `"admin" \| "user"` |
| `UserRole`/`USER_ROLES` (duplicado) | [team.ts:25-26](src/types/team.ts#L25-L26) | `["admin","user"]` |
| `ROLE_LABELS` | [team.ts:31-34](src/types/team.ts#L31-L34) | `{admin:"Admin", user:"Usuário"}` |
| `isValidRole` / `isAdminRole` | [database.ts:218-227](src/types/database.ts#L218-L227) | comparam a `"admin"`/`"user"` |
| `tenant.isAdmin` / `getCurrentUserRole` | [tenant.ts:51-63](src/lib/supabase/tenant.ts#L51-L63) | `=== "admin"` |
| `useUser().isAdmin` | [use-user.ts:250](src/hooks/use-user.ts#L250) | `=== "admin"` |
| middleware | [middleware.ts:75](src/lib/supabase/middleware.ts#L75) | `!== "admin"` |
| Badge time | [TeamMemberList.tsx:109-111](src/components/settings/TeamMemberList.tsx#L109-L111) | ternário `=== "admin"` |
| Select de papel | [InviteUserDialog.tsx:114-127](src/components/settings/InviteUserDialog.tsx#L114-L127) | opções "user"/"admin" |

**RLS (verificado):** `public.is_admin()` definido em [00002:79-88](supabase/migrations/00002_create_profiles.sql#L79-L88) é chamado por policies em `00005, 00007, 00008, 00009, 00036` (estas **não** precisam ser tocadas — só o corpo de `is_admin()`). **Exceção:** [00020:48-88](supabase/migrations/00020_create_ai_prompts.sql#L48-L88) usa `EXISTS (... AND role = 'admin')` inline em 3 policies → **precisa** ser refatorada nesta migration. Trigger `handle_new_user` em [00002:36-59](supabase/migrations/00002_create_profiles.sql#L36-L59) (hardcoda `'user'` na linha 55).

**Sessão/JWT:** o papel **não** está no JWT — é lido fresco do `profiles` a cada request ([tenant.ts:16-32](src/lib/supabase/tenant.ts#L16-L32)). ⇒ a migração tem efeito imediato; **não** é preciso forçar logout/refresh.

### Migration numbering

- Última migration existente: `00052_fix_icebreaker_tdec_branding.sql`.
- **Usar: `00053_expand_roles_to_gestor_diretor_sdr.sql`** (uma única migration cobre dados + constraints + funções + policies).

### SQL da migration (referência — AD §5.1; ordem obrigatória)

```sql
-- 1. Remover CHECK antigo (confirmar nomes reais com \d antes de aplicar)
ALTER TABLE public.profiles          DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.team_invitations  DROP CONSTRAINT team_invitations_role_check;

-- 2. Migrar dados (AD-4) — ANTES do novo CHECK
UPDATE public.profiles         SET role = 'gestor' WHERE role = 'admin';
UPDATE public.profiles         SET role = 'sdr'    WHERE role = 'user';
UPDATE public.team_invitations SET role = 'gestor' WHERE role = 'admin';
UPDATE public.team_invitations SET role = 'sdr'    WHERE role = 'user';

-- 3. Novo CHECK + novo default
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('gestor','diretor','sdr'));
ALTER TABLE public.profiles          ALTER COLUMN role SET DEFAULT 'sdr';
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_role_check CHECK (role IN ('gestor','diretor','sdr'));
ALTER TABLE public.team_invitations  ALTER COLUMN role SET DEFAULT 'sdr';

-- 4. Atualizar o helper central (cobre ~26 policies sem tocá-las)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT role IN ('gestor','diretor') FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.is_admin() IS 'TRUE se o papel tem acesso administrativo (gestor ou diretor). Epic 20.';

-- 5. Refatorar as 3 policies de ai_prompts p/ usar is_admin()
DROP POLICY "Admins can insert prompts"              ON public.ai_prompts;
DROP POLICY "Admins can update their tenant prompts"  ON public.ai_prompts;
DROP POLICY "Admins can delete their tenant prompts"  ON public.ai_prompts;
CREATE POLICY "Admins can insert prompts" ON public.ai_prompts FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id() AND public.is_admin());
CREATE POLICY "Admins can update their tenant prompts" ON public.ai_prompts FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant_id());
CREATE POLICY "Admins can delete their tenant prompts" ON public.ai_prompts FOR DELETE
  USING (tenant_id = public.get_current_tenant_id() AND public.is_admin());

-- 6. handle_new_user(): default 'user' -> 'sdr' (NÃO honrar metadata aqui — isso é 20.4)
--    CREATE OR REPLACE FUNCTION public.handle_new_user() ... trocar só o literal 'user' por 'sdr'.
```

### Helper de capacidade (criar exatamente assim)

```ts
// src/lib/auth/capabilities.ts
import type { UserRole } from "@/types/database";

/** Papéis com acesso administrativo (hoje Gestor e Diretor são idênticos). */
export const ADMIN_ROLES = ["gestor", "diretor"] as const satisfies readonly UserRole[];

/** TRUE se o papel tem acesso administrativo. Ponto único de mudança (futuro Diretor). */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role === "gestor" || role === "diretor";
}
```

### Anti-patterns a evitar

1. **NÃO** criar ENUM SQL para `role` — manter `TEXT + CHECK` (AD-1).
2. **NÃO** renomear `public.is_admin()` — só trocar o corpo (AD-3); renomear forçaria recriar ~26 policies.
3. **NÃO** reescrever as policies de `00005/00007/00008/00009/00036` — elas já chamam `is_admin()`; basta atualizar a função. Tocar **apenas** `00020`.
4. **NÃO** rodar o `UPDATE` de dados depois de aplicar o novo CHECK (violaria o constraint durante a transição) — ordem: drop CHECK → update → add CHECK.
5. **NÃO** honrar `raw_user_meta_data->>'role'` no `handle_new_user()` nesta story — é vetor de escalonamento via `/signup`; a correção segura (lookup em `team_invitations` na pós-aceitação) é da **20.4**.
6. **NÃO** deixar nenhum literal `"admin"`/`"user"` de papel no código de app — usar `hasAdminAccess`/`ROLE_LABELS`/`USER_ROLES`. (Grep deve retornar zero.)
7. **NÃO** introduzir variantes só-Gestor ou só-Diretor — nesta entrega Gestor ≡ Diretor (AD-2).
8. **NÃO** usar `export enum` no TS — o projeto usa const array + union type (padrão do projeto, ver [team.ts:25](src/types/team.ts#L25)).

### Regressão — o que NÃO pode quebrar (validar)

- Admin existente (→ gestor) continua acessando `/settings`, integrações, knowledge base, time, uso e monitoramento (UI **e** server).
- Usuário comum (→ sdr) continua acessando `/leads` e `/campaigns` e continua **bloqueado** nas superfícies admin (igual a hoje).
- Fluxo de convite atual continua compilando e funcionando como antes (a correção do gap é 20.4).
- Tabelas mock do Supabase: `profiles`/`team_invitations` já existem nos testes; só os valores de papel mudam.

### Dependências downstream

Esta story é a **base** do Epic 20:
- **20.2** consome `hasAdminAccess`/`ADMIN_ROLES` (consolidação + "último admin" + AdminGuard/middleware + testes papel×capacidade).
- **20.3** consome `ROLE_LABELS`/`USER_ROLES` (polimento de UX dos papéis).
- **20.4** consome o novo enum + corrige o gap do convite (pós-aceitação) e provisiona os 4 usuários.
- **20.5** audita defense-in-depth (SDR sem vazamentos).

### Project Structure Notes

- Migrations: `supabase/migrations/000XX_*.sql` (sequência zero-padded de 5 dígitos).
- Novo módulo de auth: `src/lib/auth/capabilities.ts` (alinhado a `src/lib/supabase/`).
- Tipos: fonte canônica em `src/types/database.ts`; `src/types/team.ts` deriva.
- Zero conflitos com a estrutura unificada; nenhuma nova convenção introduzida.

### References

- [Source: _bmad-output/planning-artifacts/architecture-epic-20-niveis-de-acesso.md#3-decisões-arquiteturais] (AD-1..AD-5)
- [Source: _bmad-output/planning-artifacts/architecture-epic-20-niveis-de-acesso.md#5-plano-de-migração] (SQL 00053 + tabela código→arquivo)
- [Source: _bmad-output/planning-artifacts/epic-20-niveis-de-acesso.md#Story 20.1]
- [Source: supabase/migrations/00002_create_profiles.sql — is_admin(), handle_new_user(), CHECK]
- [Source: supabase/migrations/00009_create_team_invitations.sql — CHECK + policies via is_admin()]
- [Source: supabase/migrations/00020_create_ai_prompts.sql — policies inline role='admin' (exceção a refatorar)]
- [Source: src/types/database.ts, src/types/team.ts — UserRole, USER_ROLES, ROLE_LABELS, isValidRole, isAdminRole]
- [Source: src/lib/supabase/tenant.ts, src/hooks/use-user.ts, src/lib/supabase/middleware.ts — call-sites de auth]
- [Source: _bmad-output/implementation-artifacts/10-1-schema-de-tracking-e-tipos.md — padrão de story migração+tipos]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

- `npm run build` → compilação limpa (manifesto completo de rotas emitido, sem erros de tipo em `src/`).
- `npx vitest run` → 358 arquivos, **6112 testes passando**, 2 skip, 0 falhas (~18s). (O log `ECONNREFUSED 127.0.0.1:3000` é ruído de um teste com fetch mockado — não é falha; todos os arquivos passam.)
- `npx tsc --noEmit` → **0 erros em `src/`**, **0 erros relacionados a papéis**. Restam 161 erros pré-existentes, **todos** em `__tests__/` (helpers de mock, testes de campaign/leads/instantly/snovio etc.), em arquivos **não tocados** por esta story. O total caiu de 172→161 ao corrigir os 11 erros de papel introduzidos pela troca do `UserRole`.
- `npx eslint` (arquivos modificados) → **0 errors**, 2 warnings pré-existentes (`no-non-null-assertion` no `middleware.ts:11-12`, linhas de `process.env.X!` não tocadas por esta story).

### Completion Notes List

- **Migração 00053 (ordem AD §5.1):** drop CHECK → UPDATE dados (`admin→gestor`, `user→sdr` em `profiles` e `team_invitations`) → add CHECK novo + default `'sdr'`. `is_admin()` mantém o nome e passa a `role IN ('gestor','diretor')` (AD-3); as 3 policies inline de `ai_prompts` (00020) foram refatoradas para `public.is_admin()`; `handle_new_user()` troca só o literal default `'user'`→`'sdr'` (sem honrar metadata — isso é 20.4). `DROP CONSTRAINT IF EXISTS` para idempotência.
- **Fonte única de `UserRole`:** definido em `src/types/database.ts`; `src/types/team.ts` reexporta o tipo e deriva `USER_ROLES` com `satisfies readonly UserRole[]`. `isAdminRole` delega a `hasAdminAccess`. `ROLE_LABELS = {gestor:"Gestor", diretor:"Diretor", sdr:"SDR"}`.
- **Helper de capacidade:** `src/lib/auth/capabilities.ts` (`ADMIN_ROLES` + `hasAdminAccess`). `tenant.isAdmin`, `useUser().isAdmin` e os ~31 call-sites server-side (3 server actions + 11 API routes + middleware) passam a delegar ao helper. Nenhum literal de papel de conta sobra no código de app.
- **Decisão dev (dentro do escopo atômico):** os 2 filtros `.eq("role","admin")` em `team.ts` (guarda do "único admin" em `removeTeamMember` e `isOnlyAdmin`) viravam silenciosamente quebrados pós-migração (nenhuma linha `admin` restaria → count 0). Troquei para `.in("role", [...ADMIN_ROLES])`, contando papéis admin-capazes (gestor+diretor). Isso preserva a guarda hoje (gestor≡diretor); o refino da semântica "último admin" continua sendo da 20.2.
- **Desvio consciente em AC#5/Task 6.1 (grep):** o alvo literal inclui `=== "user"`. A única ocorrência remanescente é `message.role === "user"` em `AgentMessageBubble.tsx`, que é o papel de **mensagem de chat** (`MessageRole = "user" | "assistant"` — API de mensagens do agente), domínio totalmente distinto do papel de conta `UserRole`. Convertê-la quebraria a UI do agente. Logo: **zero** literais de papel de **conta** no código de app, que é a intenção do AC.
- **Nota sobre AC#6 / `tsc --noEmit`:** o projeto carrega 161 erros de tipo **pré-existentes** em `__tests__/` (helpers de mock e testes não relacionados a papéis). Não os corrigi por estarem fora do escopo desta story (regra: não implementar nada não mapeado a uma task). O gate efetivo do projeto é `npm run build` (type-check de `src/`), que está **verde**. Minhas mudanças introduzem **zero** erros novos de tipo (0 em `src/`, 0 de papel).
- **Regressão validada:** admin migrado→gestor mantém acesso (UI + servidor) via `hasAdminAccess`; sdr permanece bloqueado nas superfícies admin; fluxo de convite compila e default agora é `sdr` (menor privilégio); sessão lê o papel fresco do `profiles` a cada request (sem logout forçado).

### File List

**Migration (nova):**
- `supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql`

**Código de aplicação (novo):**
- `src/lib/auth/capabilities.ts`

**Código de aplicação (modificado):**
- `src/types/database.ts`
- `src/types/team.ts`
- `src/lib/supabase/tenant.ts`
- `src/lib/supabase/middleware.ts`
- `src/hooks/use-user.ts`
- `src/actions/team.ts`
- `src/actions/knowledge-base.ts`
- `src/actions/integrations.ts`
- `src/app/api/usage/statistics/route.ts`
- `src/app/api/settings/monitoring/route.ts`
- `src/app/api/settings/integrations/route.ts`
- `src/app/api/settings/integrations/[service]/test/route.ts`
- `src/app/api/integrations/theirstack/test/route.ts`
- `src/app/api/integrations/theirstack/credits/route.ts`
- `src/app/api/integrations/theirstack/search/companies/route.ts`
- `src/app/api/integrations/theirstack/search/technologies/route.ts`
- `src/app/api/integrations/apollo/test/route.ts`
- `src/components/settings/TeamMemberList.tsx`
- `src/components/settings/InviteUserDialog.tsx`

**Testes (novo):**
- `__tests__/unit/lib/auth/capabilities.test.ts`

**Testes (modificado — vocabulário de papéis):**
- `__tests__/unit/types/database.test.ts`
- `__tests__/unit/types/team.test.ts`
- `__tests__/unit/actions/team.test.ts`
- `__tests__/unit/actions/integrations.test.ts`
- `__tests__/unit/actions/knowledge-base.test.ts`
- `__tests__/unit/actions/whatsapp.test.ts`
- `__tests__/unit/actions/whatsapp-from-insight.test.ts`
- `__tests__/unit/hooks/use-user.test.ts`
- `__tests__/unit/hooks/use-team-members.test.tsx`
- `__tests__/unit/lib/supabase/tenant.test.ts`
- `__tests__/unit/components/settings/InviteUserDialog.test.tsx`
- `__tests__/unit/components/settings/TeamMemberList.test.tsx`
- `__tests__/unit/components/settings/RemoveUserDialog.test.tsx`
- `__tests__/unit/app/api/settings/monitoring/route.test.ts`
- `__tests__/unit/api/integrations/theirstack/test.test.ts`
- `__tests__/unit/api/integrations/theirstack/credits.test.ts`
- `__tests__/unit/api/integrations/theirstack/search/companies.test.ts`
- `__tests__/unit/api/integrations/theirstack/search/technologies.test.ts`

## Change Log
- 2026-06-15: Story 20.1 criada (ready-for-dev). Escopo definido como atômico-e-verde (decisão Fabossi 2026-06-15): inclui migração 00053 + tipos + helper hasAdminAccess + swap dos call-sites, mantendo build e auth verdes. Knock-on: 20.2 vira consolidação, 20.3 vira polimento de UX.
- 2026-06-15: Implementação completa (Status → review). Migração 00053 + `UserRole` (gestor|diretor|sdr) com fonte única + `hasAdminAccess`/`ADMIN_ROLES` + swap de todos os call-sites de papel de conta (3 actions, 11 API routes, middleware, tenant, useUser, 2 componentes de UI). 2 filtros `.eq("role","admin")` migrados para `.in("role",ADMIN_ROLES)` (guarda do "único admin"). `handle_new_user` default `'user'`→`'sdr'`. Testes atualizados ao novo vocabulário + suíte `capabilities`. Build verde; vitest 6112 pass/0 fail; tsc sem erros em `src/`; eslint 0 errors.
- 2026-06-15: Robustez da migração 00053 — operações em `team_invitations` (00009) e `ai_prompts` (00020) agora guardadas por `to_regclass(...) IS NOT NULL` (DO block + `RAISE NOTICE` quando ausente). Motivo: aplicação contra um banco com histórico de migrations incompleto falhava com `42P01 relation "public.team_invitations" does not exist`. `profiles`/`is_admin()`/`handle_new_user()` permanecem como dependência forte (sem guarda). NÃO substitui a necessidade de reconciliar o histórico de migrations do banco-alvo — apenas evita o hard-fail.
- 2026-06-16: Code review (3 camadas: Blind Hunter / Edge Case Hunter / Acceptance Auditor) em modo YOLO. 2 patches low aplicados; 2 falsos-positivos do Blind Hunter dispensados após verificação no repo; gap convite→signup deferido à 20.4. Status → done. Ver `### Review Findings (2026-06-16)`.

### Review Findings (2026-06-16)

Code review adversarial em 3 camadas (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — todas executadas, nenhuma falhou. Acceptance Auditor: **6/6 ACs satisfeitos, 8/8 anti-patterns respeitados, ambos os desvios documentados justificados.**

**Patches aplicados (low — autorizado YOLO):**

- [x] [Review][Patch] `hasAdminAccess` derivado de `ADMIN_ROLES` (fonte única de verdade) [src/lib/auth/capabilities.ts:16] — o arquivo declarava `ADMIN_ROLES` E uma disjunção literal `role === "gestor" || role === "diretor"`, duas fontes para o mesmo propósito; agora `hasAdminAccess` consome o array, honrando o mandato AD-2 ("ponto único de mudança"). Comportamento idêntico; testes verdes (incl. o loop `ADMIN_ROLES.forEach` agora correto-por-construção).
- [x] [Review][Patch] `is_admin()` com `COALESCE(..., FALSE)` (booleano definido) [supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql:64] — sem linha em `profiles`, a subquery escalar retornava `NULL`. Hoje todo call-site é `AND public.is_admin()` (NULL ≈ FALSE, sem efeito prático), mas garante booleano definido p/ qualquer `NOT is_admin()` futuro. Hardening zero-risco na linha que a própria migration reescreve.

**Deferido:**

- [x] [Review][Defer] Gap convite→signup: `handle_new_user()` não honra o papel convidado [supabase/migrations/00053:144 / src/actions/team.ts:205] — deferido à **Story 20.4** (decisão de segurança consciente: ler `raw_user_meta_data->>'role'` é vetor de escalonamento via `/signup`; correção segura = lookup em `team_invitations` na pós-aceitação). Hoje todo convidado vira `sdr` independente do papel escolhido na UI.
- [x] [Review][Defer] Ordem de deploy vs migration (operacional, sem fix de código) — o código novo rejeita os literais `'admin'`/`'user'` (`isValidRole`/`inviteUserSchema`) e `hasAdminAccess('admin')→false`. Se o código for ao ar **antes** da migration 00053, admins migrados perderiam acesso até a migration rodar (violaria NFR-C1). **Mitigação: aplicar a migration 00053 antes/junto do deploy do código.**

**Dispensados como ruído (falsos-positivos / verificados seguros):**

- Blind Hunter "high" — nome de CHECK constraint assumido: **falso-positivo**. [00002:12](../../supabase/migrations/00002_create_profiles.sql#L12) define `role` com CHECK inline sem nome → Postgres gera exatamente `profiles_role_check`/`team_invitations_role_check`. Assunção da migration correta (confirmado por Edge Case Hunter com acesso ao repo).
- Blind Hunter "medium" — `CREATE OR REPLACE handle_new_user()` clobber: **falso-positivo**. Corpo idêntico ao [00002:36-59](../../supabase/migrations/00002_create_profiles.sql#L36-L59) exceto o literal `'user'`→`'sdr'`; nenhuma migration entre 00002 e 00053 tocou a função.
- Import "circular" `database.ts` ↔ `capabilities.ts`: seguro — back-import é `import type` (apagado no compile) e o uso de `hasAdminAccess` em `isAdminRole` é lazy (corpo da função, não module-eval). Sem ciclo em runtime. Build verde confirma.
- `isAdminRole` wrapper "redundante" / `ROLE_LABELS[role]` sem fallback: cosméticos — `isAdminRole` tem 0 callers em `src/` e estilo consistente com `isValidRole`; `ROLE_LABELS` é `Record<UserRole,string>` total, `undefined` impossível dentro do contrato atômico da story.
