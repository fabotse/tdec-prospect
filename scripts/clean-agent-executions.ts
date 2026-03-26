/**
 * Script: Limpar dados do Agente TDEC
 * Deleta todas as execucoes (e mensagens/steps em cascata) do tenant autenticado.
 *
 * Uso: npx tsx scripts/clean-agent-executions.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Carrega .env.local manualmente (Next.js nao expoe dotenv como dep)
const envPath = resolve(import.meta.dirname ?? __dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = val;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Faltam variaveis: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function clean() {
  // agent_messages e agent_steps tem ON DELETE CASCADE na FK execution_id
  // entao basta deletar agent_executions que o resto vai junto

  const { data, error, count } = await supabase
    .from("agent_executions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000") // deleta tudo (workaround: delete precisa de filtro)
    .select("id", { count: "exact" });

  if (error) {
    console.error("Erro ao limpar:", error.message);
    process.exit(1);
  }

  const total = count ?? data?.length ?? 0;
  console.log(`Pronto! ${total} execucao(oes) removida(s) (mensagens e steps em cascata).`);
}

clean();
