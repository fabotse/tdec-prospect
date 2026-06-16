---
baseline_commit: 9c03edb2b3a817e03df618c10d3cca5da2946634
---

# Story 20.4: Provisionamento dos usuários do cliente

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Gestor,
I want que os quatro usuários do cliente existam com os papéis corretos **e** que o fluxo de convite passe a aplicar o papel automaticamente na aceitação,
so that a equipe da TDec acesse a plataforma com os níveis adequados na entrega, sem ajuste manual de papel a cada novo convidado.

## Contexto desta story (LEIA PRIMEIRO)

Esta é a story de **provisionamento** (FR7) da Epic 20. Diferente das anteriores, ela tem **dois deliverables distintos** — um de código durável (security-critical) e um de tooling operacional — mais um **passo de execução que é humano, não do dev agent**.

| # | Deliverable | Natureza | Quem entrega |
| --- | --- | --- | --- |
| **(B)** | **Correção do gap convite→signup** — passo server-side de pós-aceitação que aplica o papel do convite ao perfil | **Código durável + testes** (security-critical) | **dev agent (esta story)** |
| **(A)** | **Script de provisionamento** dos 4 usuários via service role (determinístico, idempotente) | **Tooling operacional** (espelha `scripts/reset-user-password.mjs`) | **dev agent (esta story)** |
| **(OP)** | **Execução real** do provisionamento contra o banco do cliente (rodar o script com credenciais reais) | **Operacional / humano** (DB gerido à mão, requer creds + migrations aplicadas) | **Fabossi (fora do alcance do LLM)** — ver §"Execução do provisionamento (OPERACIONAL)" |

> **Por que (OP) não é uma Task marcável:** o dev agent LLM não tem credenciais de service role nem acesso ao banco de produção do cliente (gerido à mão, ver [[project_db_schema_versioning]]). Criar as 4 contas reais exige `.env.local` com `SUPABASE_SERVICE_ROLE_KEY` real + as migrations 00053/00054 já aplicadas. Isso é trabalho do Fabossi, igual ao "aplicar a 00054 no banco" das stories 20.1/20.3. As Tasks abaixo entregam **o mecanismo** (script + fix + testes); a execução é checklist de release.

**O gap convite→signup (B) — origem:** rastreado desde a review da 20.1 (`deferred-work.md`), dono explícito = **20.4**. O `handle_new_user()` ([00053:130-153](../../supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql#L130-L153)) cria todo perfil como `sdr` + primeiro tenant, **ignorando** o `role`/`tenant_id` do convite. Logo, hoje, convidar alguém como `gestor`/`diretor` cria o perfil como `sdr` até alguém corrigir manualmente (o caminho manual é o `updateMemberRole` entregue na 20.3). A 20.4 fecha isso de forma **segura** (AD-5).

## Acceptance Criteria

> Os 3 ACs são os definidos no épico ([epic-20-niveis-de-acesso.md#L162-L184](../planning-artifacts/epic-20-niveis-de-acesso.md#L162-L184)) e regidos pela decisão **AD-5** ([architecture #L165-L183](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md#L165-L183)). Anotados com a fronteira código × operacional.

1. **Given** os quatro e-mails do cliente ainda não possuem conta
   **When** o provisionamento é executado (mecanismo AD-5: **seed/script com service role**, determinístico, independente do auto-cadastro)
   **Then** são criadas as contas com os papéis:
   - mfabossi@tdec.com.br → **Gestor**
   - seste@tdec.com.br → **Gestor**
   - ccase@tdec.com.br → **SDR**
   - rgomes@tdec.com.br → **SDR**
   → **Código (esta story):** o script `scripts/provision-client-users.mjs` cria/atualiza esses usuários e grava o papel explicitamente via service role. **Execução real:** operacional (Fabossi roda o script — §Execução).

2. **Given** um usuário provisionado faz login pela primeira vez
   **When** acessa a plataforma
   **Then** vê exatamente as funcionalidades correspondentes ao seu papel (Gestor = total; SDR = só prospecção, sem `/settings`)
   → **Já garantido pelas camadas 20.1/20.2** (middleware + `hasAdminAccess` + RLS). Esta story **não** reimplementa autorização — apenas garante que o **papel certo** chega ao perfil (via script para os 4, via fix (B) para convites futuros). Verificação por papel é exercida pela suíte existente + verificação manual (§Execução).

3. **Given** os usuários pertencem ao tenant do cliente
   **When** são criados
   **Then** o `tenant_id` correto é atribuído (isolamento preservado — NFR-S3)
   → **Código:** tanto o script (A) quanto o fix (B) gravam `tenant_id` explicitamente a partir de fonte confiável (arg/tenant resolvido no script; `team_invitations.tenant_id` no fix), **não** confiando no `LIMIT 1` do trigger.

**AC adicional desta story (mecanismo — fecha o gap rastreado da 20.1):**

4. **Given** um Gestor/Diretor convida alguém com papel `gestor`/`diretor`/`sdr` pela UI de time
   **When** o convidado aceita o convite e o fluxo de aceitação roda
   **Then** o perfil é promovido ao papel **registrado no convite** (`team_invitations`), e a invitation é marcada `accepted`
   **And** o papel **nunca** vem de `raw_user_meta_data` (vetor de escalonamento) — vem de lookup server-side confiável por e-mail autenticado.

## Tasks / Subtasks

- [x] **Task 1 — (B) Ação server de pós-aceitação de convite (NET-NEW, security-critical)** (AC: #4, #2, #3)
  - [x] 1.1 Criar `applyInvitedRoleOnAcceptance(): Promise<ActionResult<{ applied: boolean }>>` em [src/actions/team.ts](../../src/actions/team.ts) (coesão do domínio de time; sem parâmetros — lê a identidade do **servidor**, não do cliente).
  - [x] 1.2 Identidade confiável: `const { data: { user } } = await supabase.auth.getUser()` (sessão server). Sem user → `{ success: true, data: { applied: false } }` (no-op, não trava login).
  - [x] 1.3 Lookup do convite via **admin client** (service role — obrigatório: o usuário recém-aceito é `sdr` por default e a RLS de `team_invitations` exige `is_admin()`; a sessão dele **não** lê a tabela). Casar `email = user.email` **AND** `status = 'pending'` **AND** `expires_at > now()`, ordenar por `created_at desc`, `limit 1`. Nenhum → no-op success (`applied:false`).
  - [x] 1.4 Aplicar (admin client): `update profiles SET role = inv.role, tenant_id = inv.tenant_id WHERE id = user.id` com `.select("id")` + **guarda de 0 linhas** → erro real + `console.error` (espelhar o padrão de `updateMemberRole` [team.ts:465-489](../../src/actions/team.ts#L465-L489)). Em seguida `update team_invitations SET status='accepted', accepted_at=now() WHERE id = inv.id`.
  - [x] 1.5 **Segurança (vinculante):** validar `inv.role` com o enum (`USER_ROLES`/`isValidRole`); **NUNCA** ler `raw_user_meta_data->>'role'`. Mensagens PT-BR; `ActionResult<T>`.
  - [x] 1.6 Testes em [__tests__/unit/actions/team.test.ts](../../__tests__/unit/actions/team.test.ts) (espelhar mocks de `team.test.ts`): (a) convite `pending` válido → grava role+tenant + marca `accepted`; (b) sem convite → no-op `applied:false`; (c) convite expirado (`expires_at` passado) → no-op (perfil segue `sdr`); (d) ignora metadata (mesmo com `raw_user_meta_data.role='gestor'`, se não há invitation `pending`, não promove); (e) update afeta 0 linhas → erro + log; (f) cobrir `role: "diretor"` em ao menos um caso.

- [x] **Task 2 — (B) Acionar a ação no callback de aceitação** (AC: #4)
  - [x] 2.1 [src/app/auth/callback/page.tsx](../../src/app/auth/callback/page.tsx): quando `type === "invite"`, chamar `applyInvitedRoleOnAcceptance()` **depois** de `setSession` e **ANTES** de `signOut` (a sessão precisa existir para o `getUser()` server-side enxergar o usuário). **Ordenação é vinculante.**
  - [x] 2.2 Tolerância a falha: erro na ação **não** trava o fluxo — `console.error` + segue para `/login?invite=accepted` (o papel pode ser corrigido depois via `updateMemberRole`). Não introduzir `console.log` (regra `no-console`).
  - [x] 2.3 Teste do componente ([__tests__/unit/.../auth/callback.test.tsx](../../__tests__/unit/) — criar se não existir; espelhar testes de página client existentes): mockar `applyInvitedRoleOnAcceptance`, asserir que é chamada no fluxo `type=invite`; **não** chamada para outros `type`; que falha da ação não impede o redirect.

- [x] **Task 3 — (A) Script de provisionamento (service role, idempotente)** (AC: #1, #3)
  - [x] 3.1 Criar `scripts/provision-client-users.mjs` espelhando [scripts/reset-user-password.mjs](../../scripts/reset-user-password.mjs): shebang, `import { createClient } from "@supabase/supabase-js"`, ler `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, fail-fast com mensagem clara se ausentes; rodar via `node --env-file=.env.local scripts/provision-client-users.mjs [tenant-id]`.
  - [x] 3.2 Constante `CLIENT_USERS` = mapeamento fixo email→{ role, full_name }: `mfabossi`/`seste` → `gestor`; `ccase`/`rgomes` → `sdr` (e-mails completos `@tdec.com.br`).
  - [x] 3.3 `tenant_id` é **argumento obrigatório** (há 2 tenants no banco → não auto-resolver). Validar que o tenant existe (`SELECT id FROM tenants WHERE id = arg`) e **abortar** se não bater. Alvo da entrega: `00000000-0000-0000-0000-000000000001`.
  - [x] 3.4 Por usuário (idempotente): se **não existe** → gerar senha forte (`crypto.randomBytes(...).toString("base64url")`, ≥16 chars) + `admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`; se **já existe** (ex.: `seste`; `createUser` retorna "already registered" ou achar via `listUsers()`) → **não recriar, não resetar senha**. Em ambos os casos: `update profiles SET role, tenant_id WHERE id = user.id` (service role bypassa RLS) — corrige drift de papel sem duplicar.
  - [x] 3.5 Resumo no stdout por usuário (`criado` / `já existia → papel garantido` / `erro`) **+ mapa `email→senha` somente dos criados nesta execução**. Não imprimir senha de usuário pré-existente.
  - [x] 3.6 Cabeçalho do script: documentar pré-requisitos (00053+00054 aplicadas), o `--env-file`, e que a senha é passada por arg (não fica no arquivo) — mesmo padrão do `reset-user-password.mjs`.

- [x] **Task 4 — Confirmar que nenhuma migration nova é necessária (evitar redundância)** (AC: #1)
  - [x] 4.1 Confirmar que a 00053 já cobre o lado banco do provisionamento: default `sdr` + CHECK `(gestor|diretor|sdr)` em `profiles` e `team_invitations`, comentários atualizados. **NÃO** criar migration nova para a 20.4 (o fix (B) é 100% application-layer; o script usa service role). Documentar a confirmação nas Completion Notes.
  - [x] 4.2 Confirmar que a RLS de `team_invitations` UPDATE (00009) e a de `profiles` UPDATE de admin (00054) **não** são pré-requisito do fix (B) — porque (B) usa **admin client** (service role, bypassa RLS). Anotar (o fix (B) funciona mesmo se a 00054 ainda não estiver no banco; já o `updateMemberRole` da 20.3 depende dela).

- [x] **Task 5 — Validação final** (AC: todos)
  - [x] 5.1 `npx vitest run` — suíte completa verde, **sem regressão** (linha de base 20.3: 359 arquivos, 6135 pass / 2 skip).
  - [x] 5.2 `npx eslint` nos arquivos tocados — 0 erros / 0 warnings; `npx tsc --noEmit` — 0 erros em `src/`.
  - [x] 5.3 Reconferir os ACs #1–#4 contra o código final (anotando a fronteira código × operacional nas Completion Notes).

### Review Findings

> Code review adversarial 3 camadas (Blind Hunter / Edge Case Hunter / Acceptance Auditor) — 2026-06-16. 0 bug HIGH confirmado na ação de auth (Acceptance Auditor com contexto confirmou conformidade total com AD-5 e os 4 ACs). 1 patch real (correção, falha segura), 1 decisão operacional, 3 defers, ~10 dispensados como ruído/by-design. Detalhe completo do raciocínio de triagem na conversa da review.

**Decision-needed:**

- [x] [Review][Decision→Defer] `full_name` do script são placeholders derivados do e-mail — `CLIENT_USERS` ([scripts/provision-client-users.mjs:43-48](../../scripts/provision-client-users.mjs#L43-L48)) usa "M. Fabossi", "S. Este", "C. Case", "R. Gomes" (só aplicados a usuários NOVOS, via `user_metadata`; existentes mantêm o nome atual). **Decisão Fabossi 2026-06-16: manter os placeholders por enquanto** — os nomes reais dos 3 novos (mfabossi/ccase/rgomes) ainda são desconhecidos; ajustar o `CLIENT_USERS` na hora de rodar a OP se vier o nome. Fonte: Acceptance Auditor.

**Patch:**

- [x] [Review][Patch] E-mail do convite gravado sem normalização → lookup case-sensitive da ação B falha [src/actions/team.ts:229] — `inviteUser` gravava `email` cru em `team_invitations` (`inviteUserSchema` não tem `.toLowerCase()` — [types/team.ts:107](../../src/types/team.ts#L107)); o Supabase GoTrue normaliza o e-mail auth p/ minúsculas, então `applyInvitedRoleOnAcceptance` ([team.ts:549](../../src/actions/team.ts#L549)) faz `.eq("email", user.email)` (minúsculo) e **não casava** convites com qualquer maiúscula → convidado preso como `sdr` (falha SEGURA — menor privilégio — mas a feature B silenciosamente não aplicava o papel). **APLICADO 2026-06-16:** `inviteUser` normaliza o e-mail p/ minúsculas (`const normalizedEmail = validated.data.email.toLowerCase()`) e usa esse valor no insert + nas checagens de convite/usuário existente + no `inviteUserByEmail` → fluxo de convite case-consistente. Ação B inalterada (já recebe `user.email` minúsculo do GoTrue). team.test.ts 42/42 + callback 4/4 verdes, eslint limpo. Fonte: Blind Hunter + Edge Case Hunter.

**Defer (pré-existente / fora do escopo acionável agora):**

- [x] [Review][Defer] AC#4 sem cobertura automatizada do transporte cookie→server action [src/app/auth/callback/page.tsx:72] — deferred, verificação manual mandada pela própria spec (§Execução item 7).
- [x] [Review][Defer] Robustez de idempotência do script ops — paginação >1000 users, race "already registered" pulando o papel, timing do trigger `handle_new_user` → 0 linhas em usuário recém-criado [scripts/provision-client-users.mjs:98-171] — deferred, ops tooling sobre DB pequeno verificado e re-executável.
- [x] [Review][Defer] Script realoca usuário existente entre tenants sem aviso/read-back [scripts/provision-client-users.mjs:148-152] — deferred, latente (seste já está no tenant alvo `...0001`).

## Dev Notes

### Estado verificado do banco do cliente (2026-06-16, via `scripts/list-users.mjs`)

Inspeção read-only + decisões do Fabossi nesta sessão (vinculantes):

- **Ambiente = ENTREGA.** Este projeto Supabase é o de produção do cliente (não staging). O provisionamento roda aqui pra valer.
- **Migration 00053 já aplicada** — papéis no banco já são `gestor`/`sdr` (não `admin`/`user`). *Confirmar a 00054 à parte — necessária só para o `updateMemberRole` manual da 20.3, **não** para esta story (script usa service role; fix (B) usa admin client).*
- **Tenant do cliente = `00000000-0000-0000-0000-000000000001`** ("TDEC Test Tenant") — onde o usuário real `seste@tdec.com.br` (gestor) já está. Existe um 2º tenant `...0002` ("Other Company Tenant") **vazio** → ignorar. Como há **2 tenants**, o script **NÃO** pode auto-resolver: o tenant-id é **argumento obrigatório**.
- **Dos 4 alvos, só 3 são criação nova:** `mfabossi` (gestor), `ccase` (sdr), `rgomes` (sdr). `seste@tdec.com.br` **já existe como gestor no 0001** → caminho idempotente: **não** recriar, **não** resetar senha, só garantir papel/tenant.
- **Handover = senha única por usuário** (gerada pelo script com `crypto.randomBytes`, forte; impressa no resumo email→senha). Usuários existentes não têm senha alterada.
- **Contas de teste no 0001** (`fabotse@gmail.com` = Fabossi/gestor, `fabotse+1@gmail.com` = sdr, `s.samueleste@gmail.com` = sdr): limpeza antes da entrega é **operacional/opcional** (§Execução), **fora** das Tasks de código.

### Estado atual verificado (linha de base — não reinventar)

- **Fluxo de convite hoje** ([inviteUser, team.ts:132-247](../../src/actions/team.ts#L132-L247)): `adminClient.auth.admin.inviteUserByEmail(email, { data: { tenant_id, role, invited_by }, redirectTo: \`${siteUrl}/auth/callback\` })` e **depois** insere em `team_invitations` (`status:'pending'`, `expires_at` = +7 dias). ⚠️ A ordem importa: a linha de `team_invitations` é gravada **após** o `inviteUserByEmail` retornar.
- **Callback de aceitação** ([src/app/auth/callback/page.tsx](../../src/app/auth/callback/page.tsx)): page **client**. Lê tokens do hash → `supabase.auth.setSession(...)` → **`signOut()` imediato** → `router.replace("/login?invite=accepted")` (para `type==="invite"`). O usuário define senha depois via forgot-password.
- **Trigger de criação de perfil** ([handle_new_user, 00053:130-153](../../supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql#L130-L153)): hardcoda `role='sdr'` e `tenant_id = (SELECT id FROM tenants LIMIT 1)`. **Ignora** o convite. Default `sdr` = menor privilégio (intencional, AD-4).
- **Admin client** ([src/lib/supabase/admin.ts](../../src/lib/supabase/admin.ts)): `createAdminClient()` (service role, `autoRefreshToken:false`, `persistSession:false`). **Bypassa RLS.** Único caminho para ler `team_invitations` e gravar `profiles` em nome de um usuário que ainda é `sdr`.
- **`team_invitations`** ([00009](../../supabase/migrations/00009_create_team_invitations.sql) + CHECK atualizado pela 00053): colunas `email`, `role` (agora `gestor|diretor|sdr`), `status` (`pending|accepted|expired|cancelled`), `tenant_id`, `expires_at`, `accepted_at`. Índice único parcial em `(tenant_id, email) WHERE status='pending'` → **no máximo 1 convite pendente por (tenant,email)**; entre tenants pode haver mais de um → o lookup ordena por `created_at desc, limit 1`.
- **Capacidade** ([src/lib/auth/capabilities.ts](../../src/lib/auth/capabilities.ts)): `ADMIN_ROLES`, `hasAdminAccess`. **Não** comparar `role === "gestor"` solto.
- **Tipos/labels** ([src/types/team.ts](../../src/types/team.ts)): `USER_ROLES`, `ROLE_LABELS`, `isValidRole` (em [database.ts](../../src/types/database.ts)). `UserRole = "gestor"|"diretor"|"sdr"`.
- **Precedente de script ops** ([scripts/reset-user-password.mjs](../../scripts/reset-user-password.mjs)): service role via `admin.auth.admin.updateUserById`, `node --env-file=.env.local`, fail-fast em env ausente, senha por arg. **Espelhar este padrão.** (Há também `scripts/clean-agent-executions.ts`.)
- **Sem rota `/signup` pública** hoje (o middleware lista `/signup` como path público [middleware.ts:58](../../src/lib/supabase/middleware.ts#L58), mas a página não existe). O vetor "escalonamento via metadata no signup" é **defensivo/futuro** — a decisão de não confiar em metadata (AD-5) permanece correta de qualquer forma.

### Decisões de design vinculantes (AD-5 + para não over/under-engineer)

1. **Fix (B) é pós-aceitação, NUNCA no trigger.** No momento do convite, `inviteUserByEmail` cria o auth user e dispara `handle_new_user` **antes** de a linha de `team_invitations` existir (ela é inserida depois). Logo o trigger não tem como ler o convite → o único ponto confiável é a **aceitação**. Documentar essa razão.
2. **Papel/tenant vêm do convite, não do cliente.** O trust anchor é o `user.email` (verificado pelo Supabase via link do convite). A partir dele, lookup server-side em `team_invitations`. **Proibido** honrar `raw_user_meta_data->>'role'` (AD-5 — escalonamento de privilégio).
3. **Fix (B) usa admin client (service role) para lookup E update.** O usuário recém-aceito é `sdr`; a RLS de `team_invitations` (SELECT) e a de `profiles` (UPDATE admin, 00054) exigem `is_admin()` → a sessão dele não consegue. Service role é necessário e suficiente — e torna (B) **independente** da 00054 estar aplicada (diferente do `updateMemberRole`).
4. **Provisionamento (A) = createUser + papel explícito, não inviteByEmail.** AD-5 manda "service role, determinístico, independente do auto-cadastro". O reset por e-mail está documentado como quebrado ([reset-user-password.mjs:5-7](../../scripts/reset-user-password.mjs#L5-L7)); `createUser({ email_confirm:true, password })` + set explícito de `role`/`tenant_id` é o caminho que funciona na entrega. **Senha = única por usuário** (decisão Fabossi 2026-06-16): o script **gera** uma senha forte por usuário **novo** com `crypto.randomBytes` e imprime o mapa `email→senha` no resumo (Fabossi distribui individualmente). **Usuário já existente (seste) não tem senha alterada.**
5. **Script idempotente e tenant-safe.** Re-rodar não duplica e corrige drift de papel. **Tenant é argumento obrigatório** (há 2 tenants no banco → auto-resolve não serve): passar `00000000-0000-0000-0000-000000000001`. O script valida que o tenant existe antes de escrever. Nunca escrever no tenant errado (NFR-S3).
6. **Sem migration nova.** A 00053 já entregou default `sdr` + CHECK dos 3 papéis nas duas tabelas. (B) é application-layer; (A) é service role. Criar uma 00055 seria redundante — **não fazer**.
7. **Guarda de 0 linhas em todo UPDATE** (espelhar `updateMemberRole`): `.select("id")` + checagem de `length === 0` → erro real + `console.error` (nunca falso sucesso). Lição direta da 20.3 (bug do falso sucesso por RLS).

### Padrões obrigatórios do projeto

- **Server action result:** sempre `ActionResult<T>` = `{ success:true, data? } | { success:false, error }`.
- **`no-console`:** proibido `console.log`; `console.error` tolerado em `catch`/caminhos de erro de actions (padrão já em `team.ts`). O script `.mjs` é ops tooling (fora do ESLint de produto, como o `reset-user-password.mjs`) — `console.log` de resumo é aceitável ali.
- **i18n:** todo texto de UI/erro em **Português (BR)**.
- **Pre-commit:** `eslint --max-warnings=0` linta o arquivo inteiro — atenção a `process.env.X!` (no-non-null-assertion) em arquivos tocados; usar leitura guardada se for editar os `src/lib/supabase/*.ts`. (Não previsto tocá-los nesta story.) Ver [[project_precommit_eslint_nonnull]].

### Anti-patterns — NÃO fazer

- ❌ Honrar `raw_user_meta_data->>'role'` no trigger ou na ação (escalonamento — AD-5).
- ❌ Fazer o lookup/update de (B) com a sessão do próprio usuário (RLS barra — usar admin client).
- ❌ Criar migration nova (00053 já cobre o banco).
- ❌ Reportar sucesso em UPDATE de 0 linhas (guarda obrigatória).
- ❌ Adivinhar o tenant no script (abortar se ambíguo).
- ❌ Logar senha no script.
- ❌ Tocar em `middleware.ts`/`capabilities.ts`/autorização — a 20.4 só garante que o **papel certo** chega ao perfil; a varredura defense-in-depth do SDR é da **20.5**.
- ❌ Marcar a execução real do provisionamento como Task concluída — é operacional (Fabossi).

### Execução do provisionamento (OPERACIONAL — fora do dev agent)

> Esta seção é **checklist de release para o Fabossi**, não Tasks do dev agent. O LLM entrega o script e o fix; a execução real cria as contas no banco do cliente.

1. **Pré-requisito:** **00053 já aplicada** (confirmado 2026-06-16). Aplicar a **00054** se ainda não estiver (necessária para o `updateMemberRole` manual; **não** para o script nem o fix (B)). Banco gerido à mão — ver [[project_db_schema_versioning]].
2. Garantir `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` reais do projeto do cliente (é o de **entrega**).
3. Tenant do cliente = **`00000000-0000-0000-0000-000000000001`** (TDEC Test Tenant; já confirmado via `list-users.mjs`).
4. Rodar: `node --env-file=.env.local scripts/provision-client-users.mjs 00000000-0000-0000-0000-000000000001` — cria `mfabossi`/`ccase`/`rgomes` (seste já existe, é pulado) e imprime o mapa `email→senha` dos criados.
5. Conferir resumo (3 criados + seste garantido, papéis corretos). **Distribuir cada senha individualmente** por canal seguro.
6. **Verificação manual por papel:** logar como `mfabossi` (Gestor) → vê `/settings`; logar como `ccase` (SDR) → `/settings` redireciona p/ `/leads`. (Fecha o AC#2 de fato; a varredura completa é da 20.5.)
7. **Verificação manual do fix (B):** convidar um e-mail teste como `gestor` pela UI de time → aceitar o convite → confirmar `profiles.role = gestor` (não `sdr`). Valida a propagação do cookie de sessão para a action no callback — o que o unit test não cobre.
8. **Limpeza pré-entrega (opcional, operacional):** remover as contas de teste do tenant 0001 (`fabotse+1@gmail.com`, `s.samueleste@gmail.com`; decidir sobre `fabotse@gmail.com` = seu admin) e, se quiser, renomear o tenant "TDEC Test Tenant" para algo de produção. Cosmético/higiene — fora do escopo de código da 20.4.

### Testing requirements

- **Framework:** Vitest + Testing Library (happy-dom). Rodar: `npx vitest run`.
- **Action (B):** espelhar os mocks de [team.test.ts](../../__tests__/unit/actions/team.test.ts): `vi.mock` de `@/lib/supabase/server` (`createClient` → `auth.getUser`), `@/lib/supabase/admin` (`createAdminClient`). Encadeamentos a mockar: `from("team_invitations").select().eq().eq().gt?().order().limit()` (lookup), `from("profiles").update().eq().select()` (update + guarda), `from("team_invitations").update().eq()` (marca accepted). Cobrir os 6 casos da Task 1.6, **incluindo `diretor`** (a review 20.2 apontou que só `gestor`/`sdr` eram exercitados).
- **Callback (Task 2):** se não houver teste para a page client hoje, criar um mínimo (mock da action + `next/navigation`); espelhar o tratamento de `window.location.hash`/mocks de teste já usados no projeto (ver [[reference_next_image_window_location_test]] p/ a pegadinha do `window.location`).
- **Script (A):** é **ops tooling** (sem unit test, igual ao `reset-user-password.mjs`) — validado por review + dry-run do Fabossi. Opcional: extrair `CLIENT_USERS` para módulo testável e testar o mapeamento email→papel (baixo valor; só se trivial).
- **Não regredir** os testes existentes de time: `team.test.ts`, `use-team-members.test.tsx`, `TeamMemberList.test.tsx`, `InviteUserDialog.test.tsx`, `AdminGuard.test.tsx`.
- Cobertura completa papel × superfície (middleware/API/RLS) é da **20.5** — não tentar fechar aqui.

### Project Structure Notes

- Ação (B) **dentro** de [src/actions/team.ts](../../src/actions/team.ts) (não criar arquivo novo) — coesão do domínio de time; reusa `createClient`/`createAdminClient`/`ActionResult` já importados.
- Script (A): `scripts/provision-client-users.mjs` (junto de `reset-user-password.mjs`).
- Sem novas dependências: `@supabase/supabase-js` já está no projeto. Versões pinadas — **nenhuma pesquisa de versão necessária**.

### References

- [epic-20-niveis-de-acesso.md#L162-L184](../planning-artifacts/epic-20-niveis-de-acesso.md#L162-L184) — Story 20.4 (FR7) e ACs
- [architecture-epic-20-niveis-de-acesso.md#L165-L183](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md#L165-L183) — **AD-5** (provisionamento + correção do gap convite→signup); [§5.2](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md#L261-L263) (pós-aceitação); [Decisões confirmadas #2/#4](../planning-artifacts/architecture-epic-20-niveis-de-acesso.md#L335-L341)
- [deferred-work.md#L13-L17](deferred-work.md) — gap convite→signup (dono 20.4) + ordem deploy×migration
- [20-3-ui-papeis-gestao-de-time.md](20-3-ui-papeis-gestao-de-time.md) — padrão de action de time, guarda de 0 linhas, `updateMemberRole` (caminho manual de correção de papel), lição do falso sucesso por RLS
- Código-base: [team.ts](../../src/actions/team.ts) (inviteUser + updateMemberRole), [auth/callback/page.tsx](../../src/app/auth/callback/page.tsx), [admin.ts](../../src/lib/supabase/admin.ts), [00053](../../supabase/migrations/00053_expand_roles_to_gestor_diretor_sdr.sql) (handle_new_user), [00009](../../supabase/migrations/00009_create_team_invitations.sql) (team_invitations), [reset-user-password.mjs](../../scripts/reset-user-password.mjs)
- Memórias relevantes: [[project_db_schema_versioning]] (banco gerido à mão), [[project_precommit_eslint_nonnull]], [[reference_next_image_window_location_test]]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — via `bmad-dev-story`.

### Debug Log References

- `npx vitest run __tests__/unit/actions/team.test.ts` → 42 passed (32 pré-existentes + 10 novos da ação B).
- `npx vitest run __tests__/unit/app/auth/callback.test.tsx` → 4 passed (novo arquivo).
- `npx tsc --noEmit` → **0 erros em `src/`** e 0 nos arquivos tocados (os 175 erros reportados são pré-existentes, todos em `__tests__/` não relacionados — esbuild/vitest não faz typecheck, não afetam a suíte).
- `npx eslint` nos arquivos tocados + `scripts/provision-client-users.mjs` → 0 erros / 0 warnings.
- `npx vitest run` (suíte completa) → **360 arquivos, 6149 pass | 2 skip**. Linha de base 20.3 = 359 arquivos / 6135 pass; +1 arquivo (callback) e +14 testes, **sem regressão**.

### Completion Notes List

**Deliverable (B) — fix convite→signup pós-aceitação (security-critical):**
- ✅ `applyInvitedRoleOnAcceptance()` em [src/actions/team.ts](../../src/actions/team.ts) — sem parâmetros; identidade vem do servidor (`supabase.auth.getUser()`), nunca do cliente.
- ✅ Lookup do convite via **admin client** (service role): `team_invitations` casando `email = user.email` AND `status='pending'` AND `expires_at > now()`, `order created_at desc`, `limit 1`. Isso torna (B) **independente da migration 00054** (usa service role, bypassa RLS) — diferente do `updateMemberRole` da 20.3.
- ✅ Papel validado com `isValidRole` (enum `gestor|diretor|sdr`); **NUNCA** lê `raw_user_meta_data->>'role'` (AD-5 — anti-escalonamento). Teste (d) prova: mesmo com `raw_user_meta_data.role='gestor'` no usuário, sem convite pendente o perfil **não** é promovido.
- ✅ UPDATE de `profiles` (role + tenant_id) com `.select("id")` + **guarda de 0 linhas** → erro real + `console.error` (espelha `updateMemberRole`, lição do falso sucesso por RLS da 20.3). Depois marca `team_invitations.status='accepted'` + `accepted_at`. Se o accept falhar mas o role já foi aplicado, não desfaz — apenas loga (estado seguro).
- ✅ Tolerante a falha: sem sessão / sem convite válido → no-op `{ success:true, data:{ applied:false } }` (não trava o login).
- ✅ Acionada no [callback de aceitação](../../src/app/auth/callback/page.tsx): **após `setSession`** (a action precisa do cookie de sessão para o `getUser()` server-side) e **antes do `signOut`** (ordenação vinculante). Erro na ação não trava o redirect — `console.error` + segue para `/login?invite=accepted` (sem introduzir `console.log`).
- ✅ Testes (6 casos da Task 1.6 + extras): (a) convite válido grava role+tenant + marca accepted; (b) sem convite → no-op; (c) expirado filtrado pelo `.gt("expires_at")` → no-op (predicado pinado contra regressão); (d) ignora metadata; (e) update 0 linhas → erro; (f) cobre `diretor`. Extras: sem sessão, papel inválido no convite, erro de lookup, falha ao marcar accepted (role mantido). Callback: chama p/ `type=invite` (ordem `setSession < action < signOut` pinada), **não** chama p/ outros types, falha/throw da ação não bloqueia o redirect.

**Deliverable (A) — script de provisionamento (ops tooling):**
- ✅ [scripts/provision-client-users.mjs](../../scripts/provision-client-users.mjs) espelhando `reset-user-password.mjs`: shebang, `@supabase/supabase-js`, lê `NEXT_PUBLIC_SUPABASE_URL`+`SUPABASE_SERVICE_ROLE_KEY` com fail-fast, roda via `node --env-file=.env.local`.
- ✅ `CLIENT_USERS` fixo: `mfabossi`/`seste` → `gestor`; `ccase`/`rgomes` → `sdr` (emails `@tdec.com.br`). **Nota:** `full_name` segue a convenção do e-mail (inicial+sobrenome) com comentário pedindo ajuste para nomes reais antes de rodar, se desejado — só se aplica a usuários novos (vai no `user_metadata`); existentes mantêm o nome atual.
- ✅ `tenant-id` é **argumento obrigatório** (há 2 tenants → sem auto-resolve); o script **valida que o tenant existe** e aborta se não bater (NFR-S3). Alvo da entrega: `00000000-0000-0000-0000-000000000001`.
- ✅ Idempotente: usuário inexistente → `createUser({ email_confirm:true, password })` com senha forte gerada por `crypto.randomBytes(16).toString("base64url")`; existente → não recria/não reseta senha. Em ambos: UPDATE `profiles` role+tenant (service role) com guarda de 0 linhas.
- ✅ Resumo por usuário (`criado` / `já existia → papel garantido` / `erro`) + mapa `email→senha` **só dos criados nesta execução**. Senha **nunca** gravada em arquivo (impressa só no stdout do run). **Reconciliação Task 3.6:** a decisão final (Dev Notes #4, Change Log 2026-06-16) é **gerar** a senha (não recebê-la por arg como o `reset-user-password.mjs`); o cabeçalho documenta esse modelo de segurança (senha gerada, nunca persistida).

**Deliverable (OP) — execução real:** **NÃO executada** (operacional/humano, fora do alcance do LLM — sem creds de service role nem acesso ao DB do cliente). Checklist em §"Execução do provisionamento (OPERACIONAL)".

**Task 4 — sem migration nova (confirmado):**
- 4.1 A 00053 já cobre o lado banco: default `sdr` + CHECK `(gestor|diretor|sdr)` em `profiles` **e** `team_invitations` + comentários atualizados. Nenhuma 00055 criada (seria redundante).
- 4.2 A RLS de `team_invitations` UPDATE (00009) e a de `profiles` UPDATE admin (00054) **não** são pré-requisito do fix (B): (B) usa **admin client** (service role, bypassa RLS) tanto no lookup quanto no update → funciona mesmo se a 00054 ainda não estiver aplicada no banco. (Já o `updateMemberRole` da 20.3 **depende** da 00054.)

**ACs reconferidos (fronteira código × operacional):**
- AC #1 ✅ mecanismo entregue (script cria/atualiza com role explícito via service role); execução real = operacional.
- AC #2 ✅ autorização já garantida por 20.1/20.2 (middleware + `hasAdminAccess` + RLS); esta story só garante que o **papel certo** chega ao perfil. Verificação por papel = suíte existente + verificação manual (§Execução).
- AC #3 ✅ `tenant_id` gravado explicitamente de fonte confiável: script (arg validado) e fix B (`team_invitations.tenant_id`), nunca do `LIMIT 1` do trigger.
- AC #4 ✅ aceitação promove o perfil ao papel **do convite** + marca `accepted`; papel via lookup server-side por e-mail autenticado, **nunca** de `raw_user_meta_data`.

### File List

- `src/actions/team.ts` (modificado — nova action `applyInvitedRoleOnAcceptance` + import de `isValidRole`)
- `src/app/auth/callback/page.tsx` (modificado — aciona a action no fluxo `type=invite`, após `setSession` e antes do `signOut`)
- `scripts/provision-client-users.mjs` (novo — script de provisionamento service role, idempotente)
- `__tests__/unit/actions/team.test.ts` (modificado — +10 testes da action B + `auth.getUser`/`from` nos mocks)
- `__tests__/unit/app/auth/callback.test.tsx` (novo — testes do wiring do callback)
- `_bmad-output/implementation-artifacts/20-4-provisionamento-usuarios-cliente.md` (story — frontmatter `baseline_commit`, checkboxes, Dev Agent Record, Change Log, Status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status 20.4 → in-progress → review)

## Change Log

- 2026-06-16: Story criada via `create-story` (ready-for-dev). Análise dos artefatos da Epic 20 (épico + architecture AD-5 + deferred-work + código de convite/callback/trigger). Escopo definido em dois deliverables de código — (B) fix convite→signup pós-aceitação (security-critical) e (A) script de provisionamento service role — mais a execução real marcada como operacional (Fabossi). Confirmado que nenhuma migration nova é necessária (00053 já cobre o banco).
- 2026-06-16: Inspeção read-only do banco (`scripts/list-users.mjs`) + decisões do Fabossi fixadas na story: ambiente = ENTREGA; tenant do cliente = `...0001`; 00053 já aplicada; dos 4 alvos, 3 são criação nova (`seste` já é gestor no 0001 → idempotente); handover = senha única por usuário (gerada pelo script). Tasks 3.3/3.4/3.5 e §Execução ajustadas (tenant-id obrigatório por arg, geração de senha forte por usuário novo, limpeza de contas de teste como passo operacional opcional).
- 2026-06-16: **Implementação (dev-story).** (B) `applyInvitedRoleOnAcceptance` em `src/actions/team.ts` (lookup via admin client + guarda de 0 linhas + validação de enum, anti-metadata) acionada no `auth/callback/page.tsx` (após `setSession`, antes do `signOut`). (A) `scripts/provision-client-users.mjs` (service role, idempotente, tenant-id obrigatório/validado, senha gerada por usuário novo). Confirmado sem migration nova (00053 já cobre o banco; (B) usa service role → independe da 00054). +14 testes (10 action + 4 callback). Suíte completa: 360 arquivos, 6149 pass / 2 skip (sem regressão). tsc 0 erros em `src/`, eslint limpo. Execução real do provisionamento permanece OPERACIONAL (Fabossi). Status → review.
