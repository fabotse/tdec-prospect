#!/usr/bin/env node
/**
 * Utilitário admin (uso pontual, SOMENTE LEITURA): lista os usuários do Supabase
 * — auth.users cruzado com profiles (papel + tenant) — para inspeção antes do
 * provisionamento (Story 20.4). NÃO escreve nada no banco.
 *
 * Uso:
 *   node --env-file=.env.local scripts/list-users.mjs
 *
 * Requer no ambiente (já presentes no .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * SEGURANÇA: usa a service role key (bypassa RLS) só para LER. Nenhum UPDATE/INSERT.
 *
 * Obs.: --env-file exige Node >= 20.6.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// E-mails alvo do provisionamento (Story 20.4) — marcados na saída.
const TARGET = {
  "mfabossi@tdec.com.br": "gestor",
  "seste@tdec.com.br": "gestor",
  "ccase@tdec.com.br": "sdr",
  "rgomes@tdec.com.br": "sdr",
};

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.\n" +
      "   Rode com: node --env-file=.env.local scripts/list-users.mjs"
  );
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("\n→ Lendo Supabase (somente leitura)...\n");

// 1. Tenants
const { data: tenants, error: tenantsErr } = await admin
  .from("tenants")
  .select("id, name");

if (tenantsErr) {
  console.error(`   ⚠️ Falha ao ler tenants: ${tenantsErr.message}`);
} else {
  console.log(`TENANTS (${tenants.length}):`);
  for (const t of tenants) console.log(`   • ${t.id}  ${t.name ?? ""}`);
  console.log("");
}

// 2. auth.users (pode paginar; pegamos um lote grande)
const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (authErr) fail(`Falha ao listar auth.users: ${authErr.message}`);
const authUsers = authData.users;

// 3. profiles
const { data: profiles, error: profErr } = await admin
  .from("profiles")
  .select("id, tenant_id, full_name, role, created_at");
if (profErr) fail(`Falha ao ler profiles: ${profErr.message}`);

const profileById = new Map(profiles.map((p) => [p.id, p]));

// 4. Cruzar e imprimir
console.log(`USUÁRIOS (auth.users = ${authUsers.length}):`);
console.log(
  "   " +
    ["email".padEnd(30), "role".padEnd(9), "tenant_id".padEnd(38), "confirmado", "últ.login"].join(
      "  "
    )
);
console.log("   " + "-".repeat(110));

for (const u of authUsers) {
  const p = profileById.get(u.id);
  const role = p ? p.role : "(SEM PROFILE)";
  const tenant = p ? p.tenant_id : "—";
  const confirmed = u.email_confirmed_at ? "sim" : "NÃO";
  const lastLogin = u.last_sign_in_at
    ? new Date(u.last_sign_in_at).toISOString().slice(0, 10)
    : "nunca";
  const isTarget = u.email && TARGET[u.email.toLowerCase()];
  const mark = isTarget
    ? role === TARGET[u.email.toLowerCase()]
      ? " ✅(alvo, papel OK)"
      : ` ⚠️(alvo: deveria ser ${TARGET[u.email.toLowerCase()]})`
    : "";

  console.log(
    "   " +
      [
        (u.email ?? "(sem email)").padEnd(30),
        String(role).padEnd(9),
        String(tenant).padEnd(38),
        confirmed.padEnd(10),
        lastLogin,
      ].join("  ") +
      mark
  );
}

// 5. Profiles órfãos (sem auth user) — raro, mas útil saber
const authIds = new Set(authUsers.map((u) => u.id));
const orphans = profiles.filter((p) => !authIds.has(p.id));
if (orphans.length) {
  console.log(`\n⚠️ PROFILES SEM AUTH USER (${orphans.length}):`);
  for (const p of orphans)
    console.log(`   • ${p.id}  role=${p.role}  tenant=${p.tenant_id}`);
}

// 6. Convites pendentes
const { data: invites, error: invErr } = await admin
  .from("team_invitations")
  .select("email, role, status, tenant_id, expires_at")
  .eq("status", "pending");

if (invErr) {
  console.log(`\n   ⚠️ Falha ao ler team_invitations: ${invErr.message}`);
} else if (invites.length) {
  console.log(`\nCONVITES PENDENTES (${invites.length}):`);
  for (const i of invites)
    console.log(`   • ${i.email}  role=${i.role}  tenant=${i.tenant_id}  expira=${i.expires_at?.slice(0, 10)}`);
} else {
  console.log("\nCONVITES PENDENTES: nenhum.");
}

// 7. Resumo dos 4 alvos
console.log("\nALVOS DO PROVISIONAMENTO (Story 20.4):");
for (const [email, expectedRole] of Object.entries(TARGET)) {
  const u = authUsers.find((x) => x.email?.toLowerCase() === email);
  if (!u) {
    console.log(`   • ${email.padEnd(24)} → NÃO existe (será criado como ${expectedRole})`);
  } else {
    const p = profileById.get(u.id);
    const role = p ? p.role : "(SEM PROFILE)";
    const ok = role === expectedRole ? "OK" : `DIVERGENTE (esperado ${expectedRole})`;
    console.log(`   • ${email.padEnd(24)} → já existe, role=${role} [${ok}]`);
  }
}

console.log("\n✅ Leitura concluída. Nada foi alterado.\n");
