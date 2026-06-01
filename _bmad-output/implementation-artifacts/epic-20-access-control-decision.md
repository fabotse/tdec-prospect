# Epic 20 — Decisão de Controle de Acesso (Matriz de Permissão + Plano de Migração)

> Doc de decisão / convenção. Pré-requisito obrigatório do Epic 20 antes das stories irem para dev.
> Status: **proposto** (aguardando confirmação do Fabossi). Data: 2026-06-01.
> Relacionado: [epic-20-niveis-de-acesso.md](../planning-artifacts/epic-20-niveis-de-acesso.md)

## 1. Contexto

O cliente solicitou níveis de acesso distintos. O sistema hoje tem um modelo binário `role = "admin" | "user"`, enforçado em profundidade:

- **Edge / middleware:** bloqueia `/settings` para não-admin ([src/lib/supabase/middleware.ts:45-75](../../src/lib/supabase/middleware.ts#L45-L75)).
- **UI:** `AdminGuard` envolve o layout de settings.
- **Server-side (TS):** ~30 verificações `role !== "admin"` em actions/rotas (knowledge-base, integrations, team, usage, monitoring) + `tenant.isAdmin()`.
- **Banco (SQL/RLS):** função `public.is_admin()` (`role = 'admin'`) usada por políticas RLS de tabelas administrativas.

## 2. Decisões travadas (Fabossi, 2026-06-01)

1. **Três papéis** no enum: `gestor`, `diretor`, `sdr`.
2. **Gestor e Diretor são idênticos por enquanto** (acesso total). A diferenciação do Diretor vem depois — sem nova migração, só ajuste do helper.
3. **SDR é o nível restrito** conforme o cliente: sem visualização de configurações nem de funcionalidades administrativas.
4. **Mapeamento de migração:** `admin → gestor`, `user → sdr`.
5. **Provisionamento:** 4 usuários do cliente (ainda não existem) — Gestor: mfabossi@tdec.com.br, seste@tdec.com.br / SDR: ccase@tdec.com.br, rgomes@tdec.com.br.

## 3. Matriz de Permissão (papel × superfície)

| Superfície | Gestor | Diretor | SDR |
| --- | :---: | :---: | :---: |
| Dashboard | ✅ | ✅ | ✅ |
| Leads (busca, Meus Leads, import, segmentos) | ✅ | ✅ | ✅ |
| Campanhas (builder, preview, export) | ✅ | ✅ | ✅ |
| Agente / Pipeline (execução, approval gates) | ✅ | ✅ | ✅ |
| Insights / uso do Monitoramento LinkedIn | ✅ | ✅ | ✅ |
| Tracking / Analytics de campanha | ✅ | ✅ | ✅ |
| **Settings — Integrações (API keys)** | ✅ | ✅ | ❌ |
| **Settings — Knowledge Base (company/tone/icp/examples)** | ✅ | ✅ | ❌ |
| **Settings — Gestão de Time (convidar/remover/papéis)** | ✅ | ✅ | ❌ |
| **Settings — Configurações de Monitoramento** | ✅ | ✅ | ❌ |
| **Settings — Uso & Custos (statistics)** | ✅ | ✅ | ❌ |

**Regra de ouro:** SDR = exatamente o que o `user` atual já pode fazer (tudo menos `/settings` e funções administrativas). Gestor e Diretor = exatamente o que o `admin` atual pode fazer. Logo, a mudança de comportamento é **zero** — só muda a nomenclatura e a granularidade futura.

## 4. Arquitetura de autorização — capability helper em DUAS camadas

A autorização passa a depender de **capacidades**, não de comparação direta de papel. Duas camadas espelhadas:

### 4.1 TypeScript (app)
Criar um único ponto de verdade:

```ts
// src/lib/auth/permissions.ts (novo)
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role === "gestor" || role === "diretor"; // hoje: gestor == diretor
}
```

Substituir TODAS as ~30 comparações `role === "admin"` / `role !== "admin"` por `hasAdminAccess(role)`, incluindo:
- `middleware.ts` (gate de `/settings`)
- `AdminGuard` (via `useUser` — expor `hasAdminAccess` ou derivar de `role`)
- `tenant.isAdmin()` (passa a delegar ao helper)
- Actions: `knowledge-base.ts`, `integrations.ts`, `team.ts`
- Rotas: `usage/statistics`, `settings/monitoring`, `settings/integrations`, `settings/integrations/[service]/test`, `integrations/theirstack/test`

### 4.2 SQL (RLS)
A função `public.is_admin()` já é o ponto único do lado do banco. Atualizar:

```sql
-- de: SELECT role = 'admin'
-- para:
RETURN (SELECT role IN ('gestor','diretor') FROM public.profiles WHERE id = auth.uid());
```

Assim, **todas** as políticas RLS que chamam `is_admin()` passam a reconhecer gestor+diretor sem precisar tocá-las uma a uma.

> **Diferenciar o Diretor no futuro** = alterar `hasAdminAccess` (TS) e/ou criar uma capacidade nova (ex.: `canManageIntegrations`) + ajustar `is_admin()`/funções SQL específicas. Ponto único em cada camada.

## 5. Plano de Migração (SQL) — ordem importa

CHECK constraint não pode coexistir com valores que ele rejeita, então a ordem é:

```sql
-- 1. Remover o CHECK antigo (profiles e team_invitations)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check;

-- 2. Migrar dados existentes
UPDATE public.profiles          SET role = 'gestor' WHERE role = 'admin';
UPDATE public.profiles          SET role = 'sdr'    WHERE role = 'user';
UPDATE public.team_invitations  SET role = 'gestor' WHERE role = 'admin';
UPDATE public.team_invitations  SET role = 'sdr'    WHERE role = 'user';

-- 3. Novo CHECK com os 3 papéis
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('gestor','diretor','sdr'));
ALTER TABLE public.team_invitations
  ADD CONSTRAINT team_invitations_role_check CHECK (role IN ('gestor','diretor','sdr'));

-- 4. Novo default (SDR é o menos privilegiado — princípio do menor privilégio)
ALTER TABLE public.profiles         ALTER COLUMN role SET DEFAULT 'sdr';
ALTER TABLE public.team_invitations ALTER COLUMN role SET DEFAULT 'sdr';

-- 5. Atualizar trigger handle_new_user() — default 'user' -> 'sdr'
-- 6. Atualizar is_admin() -> role IN ('gestor','diretor')  (ver 4.2)
```

> Nota de constraint name: confirmar o nome real do constraint gerado pelo Postgres (`\d profiles`) antes de `DROP` — pode não ser `profiles_role_check` literal se foi nomeado inline.

**TypeScript correspondente:**
- `UserRole = "gestor" | "diretor" | "sdr"` ([src/types/database.ts:18](../../src/types/database.ts#L18))
- `isValidRole`, `isAdminRole` ajustados; `isAdminRole` delega a `hasAdminAccess`.

## 6. Plano de Provisionamento (4 usuários)

Os 4 e-mails **não existem ainda**. Opções:

- **(A) Convite via UI de Time** (recomendado): Gestor convida cada e-mail com o papel correto pelo fluxo existente (`InviteUserDialog` + `team.ts`). Aproveita o que já está testado; usuário define senha no primeiro acesso. Pré-condição: existir ao menos 1 Gestor no tenant (seed inicial).
- **(B) Seed/migration**: cria registros de convite/perfil diretamente. Mais frágil com Supabase Auth (criação de `auth.users` exige fluxo de auth), então fica como fallback.

**Decisão proposta:** (A) Convite via UI. Para o bootstrap, promover manualmente o 1º Gestor (ex.: mfabossi) via SQL pontual no tenant do cliente, e ele convida os demais.

| E-mail | Papel |
| --- | --- |
| mfabossi@tdec.com.br | Gestor |
| seste@tdec.com.br | Gestor |
| ccase@tdec.com.br | SDR |
| rgomes@tdec.com.br | SDR |

## 7. Estratégia de testes

- Unit: `hasAdminAccess` (gestor=true, diretor=true, sdr=false, null=false).
- Matriz papel × superfície: para cada superfície protegida, Gestor/Diretor permitido e SDR negado — **na UI e no servidor** (defense-in-depth, NFR-S2).
- Migração: teste de que `admin→gestor` e `user→sdr` não alteram acesso efetivo.
- RLS: SDR não lê/escreve tabelas administrativas via chamada direta.

## 8. Riscos / pontos de atenção

- **Defense-in-depth:** gating de UI é conveniência; a barreira real é server-side + RLS. A auditoria (Story 20.5) é obrigatória.
- **Nome do constraint:** verificar antes do DROP (seção 5).
- **Sessões ativas durante migração:** usuários logados mantêm o papel no perfil (lido do banco), então a migração reflete no próximo fetch de perfil — sem necessidade de logout forçado, mas validar.
- **`team_invitations` pendentes:** convites já enviados com papel `admin`/`user` são migrados junto (seção 5, passo 2).

## 9. Ordem de execução das stories

1. **20.1** — enum + migração + RLS (`is_admin()`) — fundação.
2. **20.2** — `hasAdminAccess` (TS) + refatorar guards — depende de 20.1.
3. **20.3** — UI de papéis (relabel + atribuição) — depende de 20.2.
4. **20.4** — provisionamento dos 4 usuários — depende de 20.3.
5. **20.5** — auditoria de acesso SDR + testes papel × superfície — fecha o epic.
