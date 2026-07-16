#!/usr/bin/env node
/**
 * Utilitário admin (uso pontual, SOMENTE LEITURA): inspeciona o estado do loop de
 * resposta (Story 21.2) — campaign_events de polling, opportunities e
 * lead_interactions — para baseline antes do backfill e verificação depois.
 * NÃO escreve nada no banco.
 *
 * Uso:
 *   node --env-file=.env.local scripts/inspect-reply-loop.mjs
 *
 * Requer no ambiente (já presentes no .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * SEGURANÇA: usa a service role key (bypassa RLS) só para LER. Nenhum UPDATE/INSERT.
 * Obs.: --env-file exige Node >= 20.6.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.\n" +
      "   Rode com: node --env-file=.env.local scripts/inspect-reply-loop.mjs"
  );
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Contagem exata via head:true (não traz linhas). Aplica os filtros [col,val]. */
async function countRows(table, filters = []) {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  for (const [col, val] of filters) {
    q = val === "NOT_NULL" ? q.not(col, "is", null) : q.eq(col, val);
  }
  const { count, error } = await q;
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
}

function line(label, value) {
  console.log(`   ${String(label).padEnd(52)} ${value}`);
}

console.log("\n→ Inspeção do loop de resposta (Story 21.2) — SOMENTE LEITURA\n");

// 1. Tenants com api_config de instantly
const { data: apiConfigs, error: acErr } = await admin
  .from("api_configs")
  .select("tenant_id")
  .eq("service_name", "instantly");
if (acErr) {
  console.log(`   ⚠️ api_configs: ${acErr.message}`);
} else {
  const tenants = [...new Set(apiConfigs.map((r) => r.tenant_id).filter(Boolean))];
  console.log(`API_CONFIGS instantly: ${apiConfigs.length} (tenants: ${tenants.length})`);
  for (const t of tenants) console.log(`   • tenant ${t}`);
  console.log("");
}

// 2. Campanhas exportadas (têm external_campaign_id) — pré-requisito do lookup do sweep
const campaigns = await countRows("campaigns", [["external_campaign_id", "NOT_NULL"]]);
line("campaigns c/ external_campaign_id", campaigns.error ?? campaigns.count);

// 3. campaign_events — destino do sweep
console.log("\ncampaign_events (destino do sweep):");
const ceAll = await countRows("campaign_events");
const cePolling = await countRows("campaign_events", [["source", "polling"]]);
const ceReplied = await countRows("campaign_events", [["event_type", "email_replied"]]);
const ceWebhook = await countRows("campaign_events", [["source", "webhook"]]);
line("total", ceAll.error ?? ceAll.count);
line("source='polling'", cePolling.error ?? cePolling.count);
line("source='webhook'", ceWebhook.error ?? ceWebhook.count);
line("event_type='email_replied'", ceReplied.error ?? ceReplied.count);

// 4. opportunities — destino do processador
console.log("\nopportunities (destino do processador):");
const oppAll = await countRows("opportunities");
const oppReply = await countRows("opportunities", [["source", "reply"]]);
const oppWithEvent = await countRows("opportunities", [["reply_event_id", "NOT_NULL"]]);
const oppWithLead = await countRows("opportunities", [["lead_id", "NOT_NULL"]]);
line("total", oppAll.error ?? oppAll.count);
line("source='reply'", oppReply.error ?? oppReply.count);
line("com reply_event_id setado (NFR2)", oppWithEvent.error ?? oppWithEvent.count);
line("com lead_id casado", oppWithLead.error ?? oppWithLead.count);

// 5. lead_interactions — só onde o lead casou
console.log("\nlead_interactions:");
const liReply = await countRows("lead_interactions", [["type", "campaign_reply"]]);
line("type='campaign_reply'", liReply.error ?? liReply.count);

// 6. Amostra de oportunidades (para eyeball pós-backfill) — no máx. 10
const { data: sample, error: sampleErr } = await admin
  .from("opportunities")
  .select("id, source, reply_event_id, lead_id, unibox_url, reply_subject, created_at")
  .order("created_at", { ascending: false })
  .limit(10);
if (sampleErr) {
  console.log(`\n   ⚠️ amostra opportunities: ${sampleErr.message}`);
} else if (sample.length) {
  console.log(`\nAMOSTRA opportunities (${sample.length} mais recentes):`);
  for (const o of sample) {
    console.log(
      `   • ${o.id.slice(0, 8)}  source=${o.source}  ` +
        `reply_event_id=${o.reply_event_id ? o.reply_event_id.slice(0, 8) : "NULL"}  ` +
        `lead_id=${o.lead_id ? o.lead_id.slice(0, 8) : "NULL"}  ` +
        `unibox=${o.unibox_url ? "sim" : "null"}  ` +
        `subj="${(o.reply_subject ?? "").slice(0, 40)}"`
    );
  }
} else {
  console.log("\nAMOSTRA opportunities: (vazio)");
}

console.log("\n✅ Leitura concluída. Nada foi alterado.\n");
