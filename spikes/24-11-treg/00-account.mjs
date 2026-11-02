// Passo 0: conta, saldo, ferramentas próprias (BYOK). Endpoints de leitura, sem custo.
import { treg, save } from './lib.mjs';

const label = process.argv[2] || 'start';
const out = {};
// /balance, /me, /whoami respondem 404; o saldo fica em /orgs/<id>/balance (integrate.md).
for (const p of ['/orgs', '/tools', '/connections', '/orgs/16513/balance', '/orgs/16513/usage/by-tag?key=feature&days=2', '/calls?limit=400']) {
  const r = await treg(p, { free: true, tag: `account-${label}` });
  out[p] = { status: r.status, headers: r.headers, body: r.json ?? r.text };
  console.log(p, r.status, JSON.stringify(r.json ?? r.text).slice(0, 600));
}
save(`account-${label}.json`, out);

// Recuperação de respostas já pagas (doc: GET /calls/<call id>/result), para os jobs do passo 7.
if (label === 'recover') {
  const fs = await import('node:fs');
  const recs = fs.readFileSync(new URL('./out/ledger.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.tag === 'jobs-routed' && r.call_id);
  const rec = [];
  for (const r of recs) {
    const x = await treg(`/calls/${r.call_id}/result`, { free: true, tag: 'recover' });
    let resp = x.json?.response;
    if (typeof resp === 'string') { try { resp = JSON.parse(resp); } catch {} }
    const body = resp?.body ?? resp;
    const jobs = body?.output?.jobs ?? body?.jobs ?? [];
    rec.push({ call_id: r.call_id, status: x.status, cost_micro: x.cost_micro, keys: Object.keys(x.json ?? {}), jobs });
    console.log('recover', x.status, x.cost_micro, Object.keys(x.json ?? {}), jobs.length, jobs[0] ? Object.keys(jobs[0]) : []);
  }
  save('jobs-recovered.json', rec);
}
