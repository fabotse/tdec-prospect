#!/usr/bin/env node
/**
 * Provisionamento dos usuários do cliente (Story 20.4, deliverable A).
 *
 * Cria/garante os 4 usuários da TDec com o papel correto, via service role
 * (determinístico e idempotente — AD-5). NÃO depende do auto-cadastro nem do
 * fluxo de convite por e-mail (que está quebrado — ver reset-user-password.mjs).
 *
 * Uso:
 *   node --env-file=.env.local scripts/provision-client-users.mjs <tenant-id>
 *
 * Alvo da entrega:
 *   node --env-file=.env.local scripts/provision-client-users.mjs 00000000-0000-0000-0000-000000000001
 *
 * Pré-requisitos (banco gerido à mão — ver memória project_db_schema_versioning):
 *   - Migration 00053 aplicada (papéis gestor|diretor|sdr + default sdr nas tabelas).
 *     (A 00054 — policy de UPDATE admin em profiles — NÃO é necessária aqui: este
 *      script usa service role, que bypassa RLS.)
 *   - .env.local com NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY reais
 *     do projeto do cliente (é o ambiente de ENTREGA).
 *
 * Comportamento (idempotente):
 *   - Usuário inexistente  → cria com senha FORTE gerada (crypto.randomBytes) e
 *     email_confirm:true; em seguida grava role + tenant_id corretos.
 *   - Usuário já existente  → NÃO recria e NÃO reseta a senha; apenas garante o
 *     role + tenant_id (corrige drift de papel sem efeitos colaterais).
 *
 * SEGURANÇA:
 *   - Usa a service role key (bypassa RLS). Nunca commite o .env.local.
 *   - As senhas geradas são impressas APENAS no resumo desta execução (mapa
 *     email→senha, somente dos usuários criados agora) e NUNCA gravadas em arquivo.
 *     Distribua cada senha individualmente por canal seguro.
 *
 * Obs.: --env-file exige Node >= 20.6.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// Mapeamento fixo email→{ role, full_name } (Story 20.4).
// full_name segue a convenção do e-mail (inicial + sobrenome) — ajuste para os
// nomes reais antes de rodar, se desejar. Só é aplicado a usuários NOVOS (vai no
// user_metadata em createUser); usuários já existentes mantêm o full_name atual.
const CLIENT_USERS = [
  { email: "mfabossi@tdec.com.br", role: "gestor", full_name: "M. Fabossi" },
  { email: "seste@tdec.com.br", role: "gestor", full_name: "S. Este" },
  { email: "ccase@tdec.com.br", role: "sdr", full_name: "C. Case" },
  { email: "rgomes@tdec.com.br", role: "sdr", full_name: "R. Gomes" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantId = process.argv[2];

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.\n" +
      "   Rode com: node --env-file=.env.local scripts/provision-client-users.mjs <tenant-id>"
  );
}

if (!tenantId) {
  fail(
    "tenant-id não informado (argumento OBRIGATÓRIO — há mais de um tenant no banco,\n" +
      "   não dá para auto-resolver com segurança).\n" +
      "   Alvo da entrega:\n" +
      "   node --env-file=.env.local scripts/provision-client-users.mjs 00000000-0000-0000-0000-000000000001"
  );
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("\n→ Provisionamento de usuários do cliente (Story 20.4)\n");

// 1. Validar que o tenant existe — NUNCA escrever no tenant errado (NFR-S3).
const { data: tenant, error: tenantErr } = await admin
  .from("tenants")
  .select("id, name")
  .eq("id", tenantId)
  .maybeSingle();

if (tenantErr) fail(`Falha ao validar o tenant: ${tenantErr.message}`);
if (!tenant) {
  fail(
    `Tenant "${tenantId}" não existe. Abortando (NFR-S3: nunca escrever no tenant errado).`
  );
}

console.log(`   Tenant alvo: ${tenant.id}  ${tenant.name ?? ""}\n`);

// 2. Carregar usuários existentes (para decidir criar x garantir, idempotente).
const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (authErr) fail(`Falha ao listar usuários: ${authErr.message}`);

const usersByEmail = new Map(
  authData.users
    .filter((u) => u.email)
    .map((u) => [u.email.toLowerCase(), u])
);

// 3. Provisionar cada alvo.
const results = [];

for (const target of CLIENT_USERS) {
  const email = target.email.toLowerCase();
  try {
    const existing = usersByEmail.get(email);
    let userId;
    let generatedPassword = null;

    if (existing) {
      userId = existing.id;
      // Já existe → não recriar, não resetar senha.
    } else {
      // base64url de 16 bytes ≈ 22 chars (forte; min do projeto é 6).
      generatedPassword = randomBytes(16).toString("base64url");
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: target.email,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: { full_name: target.full_name },
        });

      if (createErr) {
        // Pode ter corrido com o listUsers (race) → "already registered".
        results.push({
          email: target.email,
          status: "erro",
          detail: createErr.message,
        });
        continue;
      }
      userId = created.user.id;
    }

    // Garantir role + tenant_id (service role bypassa RLS). Corrige drift sem
    // duplicar. `.select("id")` + guarda de 0 linhas → nunca falso sucesso.
    const { data: updated, error: updateErr } = await admin
      .from("profiles")
      .update({ role: target.role, tenant_id: tenant.id })
      .eq("id", userId)
      .select("id");

    if (updateErr) {
      results.push({
        email: target.email,
        status: "erro",
        detail: updateErr.message,
      });
      continue;
    }

    if (!updated || updated.length === 0) {
      results.push({
        email: target.email,
        status: "erro",
        detail:
          "profile não encontrado (0 linhas) — o trigger handle_new_user criou o perfil? 00053 aplicada?",
      });
      continue;
    }

    results.push({
      email: target.email,
      role: target.role,
      status: existing ? "já existia → papel garantido" : "criado",
      password: generatedPassword,
    });
  } catch (e) {
    results.push({
      email: target.email,
      status: "erro",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

// 4. Resumo (por usuário).
console.log("=== RESUMO ===");
for (const r of results) {
  if (r.status === "erro") {
    console.log(`   ❌ ${r.email.padEnd(24)} ERRO: ${r.detail}`);
  } else {
    console.log(`   ✅ ${r.email.padEnd(24)} ${r.status}  (papel=${r.role})`);
  }
}

// 5. Senhas — somente dos usuários CRIADOS nesta execução.
const created = results.filter((r) => r.password);
if (created.length) {
  console.log(
    "\n=== SENHAS (apenas usuários CRIADOS agora — distribua individualmente, NÃO commite) ==="
  );
  for (const r of created) {
    console.log(`   ${r.email.padEnd(24)} ${r.password}`);
  }
} else {
  console.log("\n(Nenhum usuário novo criado — nenhuma senha gerada.)");
}

const erros = results.filter((r) => r.status === "erro").length;
console.log(
  `\n${erros === 0 ? "✅" : "⚠️"} Concluído: ${results.length - erros} ok, ${erros} erro(s).\n`
);

process.exit(erros === 0 ? 0 : 1);
