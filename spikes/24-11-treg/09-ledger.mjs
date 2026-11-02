// Resumo do ledger: chamadas, custo, latência p50/p95 e provedores por tag. Não imprime dados de leads.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, pct } from './lib.mjs';

const recs = fs.readFileSync(path.join(OUT, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const by = {};
for (const r of recs) (by[r.tag] ??= []).push(r);
const summary = {};
for (const [tag, rs] of Object.entries(by)) {
  const ok = rs.filter((r) => r.status === 200);
  const ms = ok.map((r) => r.ms);
  const prov = {};
  for (const r of rs) { const k = r.served_by ?? `status:${r.status}`; prov[k] = (prov[k] ?? 0) + 1; }
  const cost = rs.reduce((s, r) => s + r.cost_micro, 0);
  summary[tag] = { calls: rs.length, ok: ok.length, cost_usd: cost / 1e6, usd_per_call: rs.length ? cost / 1e6 / rs.length : 0,
    p50_ms: pct(ms, 0.5), p95_ms: pct(ms, 0.95), max_ms: Math.max(0, ...ms), served_by: prov,
    statuses: rs.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {}) };
}
const total = recs.reduce((s, r) => s + r.cost_micro, 0) / 1e6;
console.log(JSON.stringify(summary, null, 1));
console.log('TOTAL USD', total, 'calls', recs.length);
fs.writeFileSync(path.join(OUT, 'ledger-summary.json'), JSON.stringify({ summary, total_usd: total, calls: recs.length }, null, 2));
