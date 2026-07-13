#!/usr/bin/env node
/**
 * Utilitário admin (uso pontual): define a senha de um usuário DIRETAMENTE via
 * Supabase Auth Admin API — contorna o fluxo de reset por e-mail (hoje quebrado:
 * link chega mas volta como "inválido/expirado").
 *
 * Uso:
 *   node --env-file=.env.local scripts/reset-user-password.mjs "<nova-senha>" [user-id]
 *
 * - <nova-senha>  obrigatório, mínimo 6 caracteres (regra do projeto).
 * - [user-id]     opcional; default = o usuário alvo abaixo.
 *
 * Requer no ambiente (já presentes no .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * SEGURANÇA: usa a service role key (bypassa RLS). Nunca commite a senha —
 * ela é passada por argumento de linha de comando, não fica no arquivo.
 *
 * Obs.: --env-file exige Node >= 20.6. Em Node mais antigo, exporte as vars
 * manualmente ou use `npx dotenv -e .env.local -- node scripts/reset-user-password.mjs ...`.
 */
import { createClient } from "@supabase/supabase-js";

const DEFAULT_USER_ID = "ef64ccf6-52c6-48b5-a3d2-bd5ede7efc3c";

const password = process.argv[2];
const userId = process.argv[3] || DEFAULT_USER_ID;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

if (!password) {
  fail(
    'Senha não informada.\n' +
      '   Uso: node --env-file=.env.local scripts/reset-user-password.mjs "<nova-senha>" [user-id]'
  );
}
if (password.length < 6) {
  fail("Senha muito curta — mínimo de 6 caracteres (regra do projeto).");
}
if (!url || !serviceKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.\n" +
      "   Rode com: node --env-file=.env.local scripts/reset-user-password.mjs ..."
  );
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n→ Redefinindo senha do usuário ${userId} ...`);

const { data, error } = await admin.auth.admin.updateUserById(userId, {
  password,
});

if (error) {
  fail(`Falha ao redefinir senha: ${error.message}`);
}

const u = data.user;
console.log("\n✅ Senha redefinida com sucesso.");
console.log(`   id:               ${u.id}`);
console.log(`   email:            ${u.email}`);
console.log(
  `   email confirmado: ${
    u.email_confirmed_at
      ? `sim (${u.email_confirmed_at})`
      : "NÃO — se 'Confirm email' estiver ativo no Supabase, o login vai falhar mesmo com a senha certa"
  }`
);
console.log(`   último login:     ${u.last_sign_in_at ?? "nunca"}`);
console.log("\n   Peça para o usuário entrar com a nova senha em /login.\n");
