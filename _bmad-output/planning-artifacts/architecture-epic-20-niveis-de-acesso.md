---
workflowType: 'architecture'
scope: 'epic-20-niveis-de-acesso'
project_name: 'tdec-prospect'
user_name: 'Fabossi'
date: '2026-06-15'
status: 'approved'
approvedAt: '2026-06-15'
stepsCompleted: [1]
inputDocuments:
  - epic-20-niveis-de-acesso.md
  - epic-19-rebranding-white-label.md
  - architecture.md (contexto da arquitetura existente)
  - 'codebase: src/types, src/lib/supabase, src/actions, src/app/api, supabase/migrations'
relatedEpic: 'Epic 20 — Niveis de Acesso (Gestor / Diretor / SDR)'
preSprintGate: true
securitySensitive: true
---

# Decisão Arquitetural — Epic 20: Níveis de Acesso (Gestor / Diretor / SDR)

> **Natureza deste documento.** Este é o *doc de decisão / matriz de permissão* exigido no pre-sprint da Epic 20 (gate obrigatório antes de qualquer story ir para dev). Ele toca **auth + RLS** — área sensível a segurança. O foco é decisão e plano de migração, não geração de código. As decisões aqui são vinculantes: as stories 20.1–20.5 devem segui-las literalmente.

---

## 1. Contexto e objetivo

O sistema hoje tem um modelo binário `role = "admin" | "user"` **enforçado em profundidade** (middleware, guard de UI, ~31 verificações server-side, RLS por tenant). A Epic 20 **expande** — não reconstrói — esse modelo para três papéis:

- **Gestor** — acesso total.
- **Diretor** — acesso total (**idêntico ao Gestor por enquanto**; a diferenciação vem depois).
- **SDR** — acesso restrito: sem configurações nem funcionalidades administrativas.

**Decisão de produto (Fabossi, 2026-06-01):** os três papéis existem no enum, mas Gestor e Diretor compartilham as mesmas permissões hoje. **Implicação arquitetural central:** a autorização precisa ser **centralizada num helper de capacidade**, para que a futura diferenciação do Diretor seja uma alteração pontual (um arquivo), não uma caça a ~31 call-sites.

---

## 2. Estado atual do código (linha de base, verificado)

Mapeamento exato da realidade — toda decisão abaixo se ancora aqui.

### 2.1 Tipos e helpers (TypeScript)

| Artefato | Local | Conteúdo atual |
| --- | --- | --- |
| `UserRole` (def. 1) | [database.ts:18](src/types/database.ts#L18) | `export type UserRole = "admin" \| "user"` |
| `UserRole` (def. 2) + `USER_ROLES` | [team.ts:25-26](src/types/team.ts#L25-L26) | `const USER_ROLES = ["admin","user"] as const` |
| `ROLE_LABELS` | [team.ts:31-34](src/types/team.ts#L31-L34) | `{ admin: "Admin", user: "Usuário" }` |
| `isValidRole` | [database.ts:218-220](src/types/database.ts#L218-L220) | `role === "admin" \|\| role === "user"` |
| `isAdminRole` | [database.ts:225-227](src/types/database.ts#L225-L227) | `role === "admin"` |
| `inviteUserSchema` | [team.ts:103-106](src/types/team.ts#L103-L106) | `role: z.enum(USER_ROLES)` |

> ⚠️ `UserRole` está definido em **dois arquivos** (`database.ts` e `team.ts`). Ambos precisam mudar — e idealmente deveriam ser unificados (ver AD-2).

### 2.2 Resolução de papel em runtime

- **Servidor:** [tenant.ts](src/lib/supabase/tenant.ts) — `getCurrentUserProfile()` ([:16](src/lib/supabase/tenant.ts#L16)) busca o profile do banco a cada request; `isAdmin()` ([:51](src/lib/supabase/tenant.ts#L51)) = `profile?.role === "admin"`; `getCurrentUserRole()` ([:60](src/lib/supabase/tenant.ts#L60)).
- **Cliente:** [use-user.ts:250](src/hooks/use-user.ts#L250) deriva `isAdmin: state.profile?.role === "admin"`.
- **JWT:** o papel **não** está no token — é lido fresco do `profiles` a cada request.
  - ✅ **Implicação favorável:** a migração tem efeito imediato; **não há problema de token velho** com papel obsoleto. Não é preciso forçar logout/refresh de sessão.

### 2.3 Call-sites de autorização (31, por camada)

| Camada | Qtd | Padrão | Exemplos |
| --- | --- | --- | --- |
| Middleware | 2 | `pathname.startsWith("/settings")` + `profile?.role !== "admin"` | [middleware.ts:45,75](src/lib/supabase/middleware.ts#L45) |
| UI | 3 | `useUser().isAdmin`, badge ternário | [AdminGuard.tsx:22,46](src/components/settings/AdminGuard.tsx#L22), [TeamMemberList.tsx:109-111](src/components/settings/TeamMemberList.tsx#L109-L111) |
| Server actions | ~14 | `if (profile.role !== "admin")` | [team.ts](src/actions/team.ts) (5), [knowledge-base.ts](src/actions/knowledge-base.ts) (~10), [integrations.ts](src/actions/integrations.ts) (4) |
| API routes | ~11 | `if (profile.role !== "admin")` | [settings/integrations](src/app/api/settings/integrations/route.ts), [settings/monitoring](src/app/api/settings/monitoring/route.ts), [usage/statistics](src/app/api/usage/statistics/route.ts), [integrations/*/test](src/app/api/integrations/apollo/test/route.ts) |
| Hook | 1 | derivação `isAdmin` | [use-user.ts:250](src/hooks/use-user.ts#L250) |

> **Caso especial de UI:** [team.ts:303](src/actions/team.ts#L303) usa `targetProfile.role === "admin"` para a regra "não remover o último admin". Essa é uma checagem de *outro usuário* (não do solicitante) — ver AD-2 §nota.

### 2.4 Camada de banco / RLS

- **Armazenamento:** `role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user'))` em **duas** tabelas:
  - `profiles` — [00002:12](supabase/migrations/00002_create_profiles.sql#L12)
  - `team_invitations` — [00009:12](supabase/migrations/00009_create_team_invitations.sql#L12)
  - É **coluna TEXT com CHECK**, **não um tipo ENUM do Postgres** → migração = trocar o CHECK, sem recriar tipo. Mais simples e reversível.
- **Função central:** `public.is_admin()` — [00002:79-88](supabase/migrations/00002_create_profiles.sql#L79-L88), `SECURITY DEFINER STABLE`, retorna `role = 'admin'`.
- **Policies que usam `public.is_admin()` (centralizadas — ✅):**
  `00005_api_configs_rls` (5), `00007_create_knowledge_base` (5), `00008_create_knowledge_base_examples` (5), `00009_create_team_invitations` (6, incl. delete de profiles), `00036_create_icebreaker_examples` (5).
- **EXCEÇÃO (⚠️ não usa o helper):** [00020_create_ai_prompts.sql:48-88](supabase/migrations/00020_create_ai_prompts.sql#L48-L88) — 3 policies (INSERT/UPDATE/DELETE) com subquery **inline** `... AND role = 'admin'`. Estas **quebram** após a migração de dados (nenhuma linha terá `role='admin'`) se não forem tratadas. **Esta é a única fonte de RLS fora do helper.**
- **Trigger de criação de perfil:** `handle_new_user()` — [00002:36-59](supabase/migrations/00002_create_profiles.sql#L36-L59). **Ignora o metadata do convite**: hardcoda `role = 'user'` ([:55](supabase/migrations/00002_create_profiles.sql#L55)) e usa o *primeiro tenant existente* (`SELECT id ... LIMIT 1`), não o `tenant_id` do convite. → **Gap de provisionamento** (ver AD-5).
- **Última migração existente:** `00052`. As novas começam em **`00053`**.

### 2.5 Convite / provisionamento atual

- `inviteUser()` ([team.ts:129-243](src/actions/team.ts#L129-L243)) chama `adminClient.auth.admin.inviteUserByEmail(email, { data: { tenant_id, role, invited_by }, redirectTo })` e registra em `team_invitations`.
- **Mas** o role e o tenant do metadata **não são aplicados ao profile** — `handle_new_user()` sobrescreve com `'user'` + primeiro tenant. Hoje, na prática, o papel do convidado precisaria ser ajustado manualmente depois. Isso precisa ser resolvido para a FR7.

### 2.6 Cobertura de teste existente (não pode regredir)

`team.test.ts`, `types/team.test.ts`, `types/database.test.ts`, `AdminGuard.test.tsx`, `InviteUserDialog.test.tsx`, `TeamMemberList.test.tsx`, `use-user.test.ts`, `use-team-members.test.tsx`.
**Lacunas atuais:** middleware, API routes e RLS **não** têm teste automatizado de autorização → a Epic 20 (Story 20.5) deve fechar essas lacunas para os papéis novos.

---

## 3. Decisões arquiteturais

### AD-1 — Manter `role` como TEXT + CHECK (não migrar para ENUM Postgres)

**Decisão:** o papel continua `TEXT` com `CHECK (role IN ('gestor','diretor','sdr'))`.
**Por quê:** já é TEXT+CHECK; criar ENUM exigiria `CREATE TYPE` + `ALTER COLUMN TYPE` + cast, mais frágil e mais difícil de evoluir (adicionar valor a ENUM é `ALTER TYPE`, e remover é praticamente impossível). TEXT+CHECK mantém a migração como um simples swap de constraint e facilita futuras adições.
**Consequência:** a "fonte de verdade" do enum vive no código (`USER_ROLES`) + no CHECK do banco; ambos precisam ficar sincronizados (documentado no plano).

### AD-2 — Helper de capacidade central `hasAdminAccess(role)` (o coração da epic)

**Decisão:** criar **uma única função pura** que define "tem acesso administrativo", e fazer **todas** as camadas a consumirem.

```ts
// src/lib/auth/capabilities.ts  (novo — fonte única de verdade de capacidade)
import type { UserRole } from "@/types/database";

/** Papéis com acesso administrativo completo (hoje Gestor e Diretor são idênticos). */
export const ADMIN_ROLES = ["gestor", "diretor"] as const satisfies readonly UserRole[];

/** Verdadeiro se o papel tem acesso administrativo. Ponto único de mudança. */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role === "gestor" || role === "diretor";
}
```

**Como cada camada passa a consumir (sem lógica de papel espalhada):**

| Camada | Antes | Depois |
| --- | --- | --- |
| `tenant.isAdmin()` | `profile?.role === "admin"` | `hasAdminAccess(profile?.role)` |
| `useUser().isAdmin` | `profile?.role === "admin"` | `hasAdminAccess(profile?.role)` |
| `isAdminRole(role)` | `role === "admin"` | torna-se alias/reexport de `hasAdminAccess` (ou removido) |
| 14 server actions | `if (profile.role !== "admin")` | `if (!hasAdminAccess(profile.role))` |
| 11 API routes | `if (profile.role !== "admin")` | `if (!hasAdminAccess(profile.role))` |
| middleware | `if (profile?.role !== "admin")` | `if (!hasAdminAccess(profile?.role))` |
| `AdminGuard` | usa `useUser().isAdmin` | inalterado (a derivação do hook já passa pelo helper) |

**Unificação de tipos:** unificar as duas declarações de `UserRole` — manter a canônica em [database.ts](src/types/database.ts#L18) e fazer [team.ts](src/types/team.ts#L25) **derivar** dela (`USER_ROLES` é a tupla; `type UserRole` re-exporta de database). Evita as duas verdades divergirem.

**Futuro Diretor (barato por design):** quando o Diretor precisar de permissões diferentes, **não se mexe em `hasAdminAccess`** — cria-se uma nova função de capacidade específica (ex.: `canManageBilling(role)`, `canManageTeam(role)`) e só os call-sites daquela capacidade mudam. O padrão é **capability-based**: uma função por capacidade, nunca `role === X` solto.

**Nota sobre o caso "último admin"** ([team.ts:303](src/actions/team.ts#L303)): essa checagem pergunta "o usuário-alvo é admin?" para impedir remover o último gestor. Deve passar a usar `hasAdminAccess(targetProfile.role)` e a regra vira "não remover o último usuário com acesso administrativo do tenant".

### AD-3 — RLS: atualizar o helper `is_admin()` + eliminar a exceção do `00020`

**Decisão:**
1. **Manter o nome** `public.is_admin()` (é o chokepoint que ~26 policies já referenciam — renomear multiplicaria o diff e o risco) e **trocar só o corpo** para `role IN ('gestor','diretor')`. Após isso, todas as policies centralizadas passam a refletir o novo modelo **sem serem tocadas**.
2. **Refatorar as 3 policies do `00020`** (ai_prompts) para chamar `public.is_admin()` em vez do `EXISTS (... role = 'admin')` inline. Isso elimina a única fonte de RLS fora do helper e alinha o banco ao mesmo princípio do código (ponto único).

**Por quê manter o nome `is_admin()`:** semanticamente vira "tem acesso administrativo", mas o custo/risco de renomear (recriar dezenas de policies) não compensa. Documentar a semântica via `COMMENT ON FUNCTION`. (Renomear para `has_admin_access()` fica como refactor opcional futuro, fora do escopo da entrega.)

**Defesa em profundidade preservada (NFR-S2):** a autorização real continua no servidor (RLS + checagens server-side via helper). O gating de UI é só conveniência.

### AD-4 — Mapeamento de migração de dados

**Decisão (conforme epic, aprovado por Fabossi):**

| Papel antigo | Papel novo | Justificativa |
| --- | --- | --- |
| `admin` | `gestor` | admins atuais mantêm acesso total |
| `user` | `sdr` | usuários comuns viram o papel restrito |

- Aplica-se a **ambas** as tabelas: `profiles` **e** `team_invitations` (convites pendentes com papel antigo são migrados também).
- **Default da coluna** muda de `'user'` → **`'sdr'`** (princípio do menor privilégio: novo cadastro nasce restrito).
- **NFR-C1:** nenhum admin existente perde acesso (admin→gestor mantém tudo).

### AD-5 — Provisionamento dos 4 usuários + correção segura do gap do trigger

**O problema:** `handle_new_user()` ignora o `role`/`tenant_id` do convite. Honrar cegamente `raw_user_meta_data->>'role'` no trigger seria **escalonamento de privilégio** se o `/signup` público permitir auto-cadastro com metadata controlado pelo usuário.

**Decisão (segura, defense-in-depth):**

- **Fluxo geral de convite (sustentável):** ao **aceitar** o convite (auth callback), aplicar o papel a partir de um **lookup server-side confiável** na tabela `team_invitations` (casando `email` + `status='pending'` + `tenant_id`), **não** a partir do metadata do cliente. O trigger continua nascendo `sdr` (menor privilégio); um passo server-side de pós-aceitação promove ao papel registrado no convite e marca a invitation como `accepted`. Assim o papel só pode vir de um convite real criado por um Gestor/Diretor.
- **Provisionamento dos 4 usuários do cliente (one-time, agora):** executar via **service role** (seed/admin script ou ação administrativa) que cria/convida e **define o papel explicitamente** — não depende do fluxo de auto-cadastro:

  | E-mail | Papel | Acesso |
  | --- | --- | --- |
  | mfabossi@tdec.com.br | Gestor | total |
  | seste@tdec.com.br | Gestor | total |
  | ccase@tdec.com.br | SDR | restrito |
  | rgomes@tdec.com.br | SDR | restrito |

  - `tenant_id` = tenant do cliente (isolamento preservado — NFR-S3).

**Por quê não confiar no metadata do trigger:** mantém o menor privilégio como default e fecha o vetor de escalonamento via `/signup`. O custo é um passo de pós-aceitação, que também conserta o gap latente que já existia no fluxo de convite.

---

## 4. Matriz de permissão (entregável central)

Legenda: ✅ acesso · ❌ negado (UI + servidor).

| Superfície | Rota / Origem | Gestor | Diretor | SDR |
| --- | --- | :---: | :---: | :---: |
| Leads (busca, enriquecimento, listas) | `/leads` | ✅ | ✅ | ✅ |
| Campanhas (builder, sequências, export) | `/campaigns` | ✅ | ✅ | ✅ |
| **Configurações (raiz)** | `/settings/*` | ✅ | ✅ | ❌ |
| Integrações / API keys | `/settings` · [integrations.ts](src/actions/integrations.ts) · [api/settings/integrations](src/app/api/settings/integrations/route.ts) | ✅ | ✅ | ❌ |
| Teste de conexão de integrações | [api/integrations/*/test](src/app/api/integrations/apollo/test/route.ts) | ✅ | ✅ | ❌ |
| Base de conhecimento | [knowledge-base.ts](src/actions/knowledge-base.ts) | ✅ | ✅ | ❌ |
| Gestão de time (convidar/remover/papéis) | `/settings/team` · [team.ts](src/actions/team.ts) | ✅ | ✅ | ❌ |
| Uso / custos | [api/usage/statistics](src/app/api/usage/statistics/route.ts) | ✅ | ✅ | ❌ |
| Monitoramento (config) | [api/settings/monitoring](src/app/api/settings/monitoring/route.ts) | ✅ | ✅ | ❌ |
| Prompts de IA (gerir) | RLS [00020](supabase/migrations/00020_create_ai_prompts.sql) | ✅ | ✅ | ❌ |
| Prompts de IA (ler/usar na geração) | RLS [00020:40-46](supabase/migrations/00020_create_ai_prompts.sql#L40-L46) | ✅ | ✅ | ✅ |

> Regra geral: **toda superfície hoje gated por `role === "admin"` passa a ser gated por `hasAdminAccess` (Gestor + Diretor).** SDR = exatamente o acesso de prospecção (leads + campanhas), sem nada administrativo. Não há, nesta entrega, nenhuma superfície que seja "só Diretor" ou "só Gestor".

---

## 5. Plano de migração

### 5.1 Banco — `00053_expand_roles_to_gestor_diretor_sdr.sql`

Ordem obrigatória (evita violar o CHECK durante o UPDATE):

```sql
-- 1. Remover CHECK antigo (nomes auto-gerados; confirmar com \d antes de aplicar)
ALTER TABLE public.profiles          DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.team_invitations  DROP CONSTRAINT team_invitations_role_check;

-- 2. Migrar dados existentes (AD-4)
UPDATE public.profiles         SET role = 'gestor' WHERE role = 'admin';
UPDATE public.profiles         SET role = 'sdr'    WHERE role = 'user';
UPDATE public.team_invitations SET role = 'gestor' WHERE role = 'admin';
UPDATE public.team_invitations SET role = 'sdr'    WHERE role = 'user';

-- 3. Novo CHECK + novo default (menor privilégio)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('gestor','diretor','sdr'));
ALTER TABLE public.profiles          ALTER COLUMN role SET DEFAULT 'sdr';
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_role_check CHECK (role IN ('gestor','diretor','sdr'));
ALTER TABLE public.team_invitations  ALTER COLUMN role SET DEFAULT 'sdr';

-- 4. Atualizar o helper central (cobre ~26 policies sem tocá-las) — AD-3
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT role IN ('gestor','diretor') FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
COMMENT ON FUNCTION public.is_admin() IS 'TRUE se o papel tem acesso administrativo (gestor ou diretor). Epic 20.';

-- 5. Eliminar a exceção: refatorar as 3 policies de ai_prompts p/ usar is_admin() — AD-3
DROP POLICY "Admins can insert prompts"             ON public.ai_prompts;
DROP POLICY "Admins can update their tenant prompts" ON public.ai_prompts;
DROP POLICY "Admins can delete their tenant prompts" ON public.ai_prompts;
CREATE POLICY "Admins can insert prompts" ON public.ai_prompts FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant_id() AND public.is_admin());
CREATE POLICY "Admins can update their tenant prompts" ON public.ai_prompts FOR UPDATE
  USING (tenant_id = public.get_current_tenant_id() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_current_tenant_id());
CREATE POLICY "Admins can delete their tenant prompts" ON public.ai_prompts FOR DELETE
  USING (tenant_id = public.get_current_tenant_id() AND public.is_admin());

-- 6. Default do trigger handle_new_user(): 'user' -> 'sdr' (menor privilégio) — AD-5
--    (substituir o literal 'user' por 'sdr' no INSERT; manter o resto)
```

> **Validar antes de aplicar:** os nomes reais dos constraints (`\d public.profiles`) — se não forem `profiles_role_check`/`team_invitations_role_check`, ajustar o `DROP CONSTRAINT`.

### 5.2 Pós-aceitação de convite (correção do gap — AD-5)

Adicionar passo server-side no callback de aceitação que, casando `team_invitations` por `email`+`pending`+`tenant`, promove o profile ao papel do convite e marca `status='accepted'`. **Não** confiar em `raw_user_meta_data`.

### 5.3 Código (TypeScript)

| Mudança | Arquivos |
| --- | --- |
| Novo helper `hasAdminAccess` + `ADMIN_ROLES` | `src/lib/auth/capabilities.ts` (novo) |
| `UserRole` → `"gestor"\|"diretor"\|"sdr"` + unificar as 2 defs | [database.ts:18](src/types/database.ts#L18), [team.ts:25-26](src/types/team.ts#L25-L26) |
| `USER_ROLES`, `inviteUserSchema` | [team.ts:25,103-106](src/types/team.ts#L25) |
| `ROLE_LABELS` → `{ gestor:"Gestor", diretor:"Diretor", sdr:"SDR" }` | [team.ts:31-34](src/types/team.ts#L31-L34) |
| `isValidRole` (novos valores), `isAdminRole`→alias de `hasAdminAccess` | [database.ts:218-227](src/types/database.ts#L218-L227) |
| `isAdmin()`/`getCurrentUserRole()` via helper | [tenant.ts:51-63](src/lib/supabase/tenant.ts#L51-L63) |
| `useUser().isAdmin` via helper | [use-user.ts:250](src/hooks/use-user.ts#L250) |
| 14 server actions: `!== "admin"` → `!hasAdminAccess(...)` | [team.ts](src/actions/team.ts), [knowledge-base.ts](src/actions/knowledge-base.ts), [integrations.ts](src/actions/integrations.ts) |
| 11 API routes: idem | `src/app/api/settings/**`, `src/app/api/integrations/**`, `src/app/api/usage/**` |
| middleware: idem | [middleware.ts:75](src/lib/supabase/middleware.ts#L75) |
| "último admin" → "último com acesso admin" | [team.ts:303](src/actions/team.ts#L303) |
| Badges Admin/Usuário → Gestor/Diretor/SDR | [TeamMemberList.tsx:109-111](src/components/settings/TeamMemberList.tsx#L109-L111) |
| Select de papel (3 opções) | [InviteUserDialog.tsx:114-127](src/components/settings/InviteUserDialog.tsx#L114-L127) |

---

## 6. Estratégia de teste e auditoria (Story 20.5)

- **Matriz papel × superfície:** para cada superfície da §4, teste que Gestor ✅, Diretor ✅, SDR ❌ — tanto na **UI** quanto na **chamada direta de action/rota** (defense-in-depth, NFR-S2).
- **Fechar lacunas atuais:** adicionar testes de autorização para **middleware** e **API routes** (hoje sem cobertura).
- **Teste de migração:** asserir que `admin→gestor` e `user→sdr` preservam acesso (NFR-C1) e que `is_admin()` retorna o esperado para cada papel.
- **Varredura anti-vazamento (SDR):** rotas, itens de navegação, dialogs e endpoints — nenhum link/endpoint administrativo visível ou acionável para SDR. Gap encontrado → corrige + teste.
- Não regredir os testes existentes da §2.6.

---

## 7. Riscos e mitigação

| Risco | Severidade | Mitigação |
| --- | --- | --- |
| `00020` (ai_prompts) inline quebra após migração de dados | Alta | Refatorado para `is_admin()` na mesma migração (AD-3, passo 5) |
| Nome real do CHECK constraint diferente do assumido | Média | Verificar `\d` antes de aplicar; migração só roda após confirmação |
| Escalonamento de privilégio via metadata de signup | Alta | Papel vem de lookup server-side em `team_invitations`, nunca do cliente (AD-5) |
| Duas defs de `UserRole` divergirem | Média | Unificar: `team.ts` deriva de `database.ts` (AD-2) |
| Call-site esquecido continua com `"admin"` literal | Média | Após refactor, busca por `role === "admin"`/`!== "admin"` deve retornar **zero**; Story 20.5 audita |
| Sessão com papel obsoleto | Baixa | Papel é lido fresco do banco a cada request (não está no JWT) — sem ação necessária |

---

## 8. Rastreabilidade FR → decisão → story

| FR/NFR | Decisão | Story |
| --- | --- | --- |
| FR1 (3 papéis) | AD-1, AD-2 | 20.1 |
| FR5 (migração admin/user→gestor/sdr) | AD-4, §5.1 | 20.1 |
| FR4 (helper de capacidade) | AD-2 | 20.2 |
| FR2 (Gestor=Diretor) | AD-2 (`ADMIN_ROLES`) | 20.2 |
| FR3 (SDR restrito) | AD-2, §4 | 20.2 |
| FR6 (UI de papéis) | §5.3 (TeamMemberList, InviteUserDialog, ROLE_LABELS) | 20.3 |
| FR7 (provisionar 4 usuários) | AD-5 | 20.4 |
| NFR-S1/S2 (negado em todas as camadas, server-side) | AD-2, AD-3, §6 | 20.5 |
| NFR-S3 (isolamento por tenant) | preservado (RLS + tenant_id) | todas |
| NFR-C1 (sem quebra para admins) | AD-4 | 20.1 |

---

## 9. Sequência de implementação recomendada

1. **20.1** — Migração `00053` (enum/CHECK + dados + `is_admin()` + refactor `00020` + default `sdr`) e tipos `UserRole`. *Base de tudo.*
2. **20.2** — Helper `hasAdminAccess` + refactor dos 31 call-sites + `tenant.isAdmin`/`useUser`. *Depende de 20.1 (tipos).*
3. **20.3** — UI de papéis (labels, badges, select de 3 opções).
4. **20.4** — Provisionamento dos 4 usuários (service role) + correção do pós-aceitação de convite (AD-5).
5. **20.5** — Auditoria + testes papel × superfície + fechar lacunas de middleware/API/RLS.

---

## Decisões confirmadas (Fabossi, 2026-06-15)

1. ✅ **`is_admin()` — manter o nome**, trocar só o corpo para `role IN ('gestor','diretor')`. Renomear para `has_admin_access()` fica como refactor opcional futuro. → AD-3
2. ✅ **Provisionamento via seed/script com service role** (determinístico, one-time, independente do fluxo de auto-cadastro). → AD-5
3. ✅ **Default de novo cadastro = `sdr`** (menor privilégio). → AD-4
4. ✅ **Corrigir o gap do fluxo de convite agora**, na Story 20.4 — papel vem de lookup server-side em `team_invitations`, nunca do metadata do cliente. → AD-5

> Gate de pre-sprint da Epic 20 **aprovado**. As stories 20.1–20.5 podem ir para dev seguindo este documento.
