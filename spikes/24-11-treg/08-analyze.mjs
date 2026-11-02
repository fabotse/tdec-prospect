// Passo 8: números agregados para o relatório. Não imprime nomes nem e-mails de leads.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, pct, sample } from './lib.mjs';
const apolloDomain = Object.fromEntries(sample().map((l) => [l.n, l.domain]));

const J = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const cnt = (a, f) => a.filter(f).length;
const lat = (a) => ({ p50: pct(a, 0.5), p95: pct(a, 0.95) });
const A = {};

// --- web (passo 2) ---
const w = J('web-results.json');
A.web = {
  companies: w.length,
  site_found: cnt(w, (x) => x.site.found),
  news_any_dated_90d: cnt(w, (x) => x.news.recent_90d > 0),
  news_recent_avg: w.reduce((s, x) => s + x.news.recent_90d, 0) / w.length,
  jobs_mention_company: cnt(w, (x) => x.jobs.mentions_company > 0),
  incident_relevant: cnt(w, (x) => x.incident.relevant > 0),
  search_latency: lat(w.flatMap((x) => [x.site.ms, x.news.ms, x.jobs.ms, x.incident.ms])),
  search_served: [...new Set(w.flatMap((x) => [x.site.served_by, x.news.served_by, x.jobs.served_by, x.incident.served_by]))],
};
for (const k of ['extract_home', 'extract_news', 'extract_job']) {
  const e = w.map((x) => x[k]).filter(Boolean);
  A.web[k] = { attempted: e.length, ok_200: cnt(e, (x) => x.status === 200), useful_gt500chars: cnt(e, (x) => x.status === 200 && x.chars > 500),
    statuses: e.reduce((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {}),
    served: e.reduce((m, x) => ((m[x.served_by ?? 'none'] = (m[x.served_by ?? 'none'] ?? 0) + 1), m), {}),
    latency: lat(e.filter((x) => x.status === 200).map((x) => x.ms)), cost_usd: e.reduce((s, x) => s + x.cost_micro, 0) / 1e6 };
}
A.web.site_missed = w.filter((x) => !x.site.found).map((x) => `${x.company} (top: ${x.site.top_host})`);
A.web.home_failed = w.filter((x) => !(x.extract_home.status === 200 && x.extract_home.chars > 500)).map((x) => `${x.company} [${x.extract_home.status}, ${x.extract_home.chars} chars]`);

// --- comparação de notícias (passo 5) ---
const c = J('web-compare.json');
A.news_compare = { companies: c.length };
for (const k of ['serper', 'exa', 'tavily']) {
  A.news_compare[k] = { ok: cnt(c, (x) => x[k].status === 200), statuses: c.reduce((m, x) => ((m[x[k].status] = (m[x[k].status] ?? 0) + 1), m), {}),
    companies_ge3_dated90_and_mention: cnt(c, (x) => x[k].dated_90d >= 3 && x[k].mentions >= 3),
    avg_dated_90d: c.reduce((s, x) => s + x[k].dated_90d, 0) / c.length, avg_mentions: c.reduce((s, x) => s + x[k].mentions, 0) / c.length,
    latency: lat(c.filter((x) => x[k].status === 200).map((x) => x[k].ms)), cost_usd: c.reduce((s, x) => s + x[k].cost_micro, 0) / 1e6 };
}
A.news_compare.companies_news = { with_rows: cnt(c, (x) => (x.companies_news.n ?? 0) > 0),
  served: c.reduce((m, x) => ((m[x.companies_news.served_by ?? 'miss'] = (m[x.companies_news.served_by ?? 'miss'] ?? 0) + 1), m), {}),
  cost_usd: c.reduce((s, x) => s + x.companies_news.cost_micro, 0) / 1e6, billed_without_rows_usd: c.filter((x) => !(x.companies_news.n > 0)).reduce((s, x) => s + x.companies_news.cost_micro, 0) / 1e6,
  latency: lat(c.map((x) => x.companies_news.ms)) };
A.news_compare.li_jobs_company_query = { rows_total: c.reduce((s, x) => s + (x.li_jobs.n ?? 0), 0) };

// --- vagas (passo 6) ---
const jb = J('jobs.json');
A.jobs = { companies: jb.length, exa_with_company_job: cnt(jb, (x) => x.exa.job_like_company > 0), li_with_company_rows: cnt(jb, (x) => x.li.company_rows > 0),
  exa_cost: jb.reduce((s, x) => s + x.exa.cost_micro, 0) / 1e6, li_cost: jb.reduce((s, x) => s + x.li.cost_micro, 0) / 1e6,
  exa_latency: lat(jb.map((x) => x.exa.ms)), li_latency: lat(jb.map((x) => x.li.ms)) };

// --- verify ---
const v1 = J('verify-results.json'); const v2 = J('verify2-results.json');
const v2m = Object.fromEntries(v2.map((x) => [x.n, x]));
const norm = (s) => (s === 'valid' ? 'valid' : s === 'invalid' ? 'invalid' : 'risky/unknown');
A.verify = {
  calls: v1.length, served: v1.reduce((m, x) => ((m[x.served_by] = (m[x.served_by] ?? 0) + 1), m), {}),
  status_first: v1.reduce((m, x) => ((m[x.out_status] = (m[x.out_status] ?? 0) + 1), m), {}),
  status_trykitt: v2.reduce((m, x) => ((m[x.out_status] = (m[x.out_status] ?? 0) + 1), m), {}),
  contactout_vs_trykitt: (() => { const pairs = v1.filter((x) => x.served_by?.startsWith('contactout')).map((x) => [norm(x.out_status), norm(v2m[x.n].out_status)]);
    return { pairs: pairs.length, agree: cnt(pairs, ([a, b]) => a === b), disagreements: pairs.filter(([a, b]) => a !== b).map((p) => p.join('→')) }; })(),
  latency_first: lat(v1.map((x) => x.ms)), latency_trykitt: lat(v2.map((x) => x.ms)),
  cost_first_usd: v1.reduce((s, x) => s + x.cost_micro, 0) / 1e6, cost_trykitt_usd: v2.reduce((s, x) => s + x.cost_micro, 0) / 1e6,
};

// --- find ---
const f = J('find-results.json');
const fh = f.filter((x) => x.found);
A.find = { calls: f.length, ok: cnt(f, (x) => x.status === 200), found: fh.length, same_as_apollo: cnt(fh, (x) => x.same_as_apollo),
  different_from_apollo: cnt(fh, (x) => x.same_as_apollo === false), different_domain: cnt(fh, (x) => x.same_as_apollo === false && x.found_domain !== apolloDomain[x.n]),
  verified_true: cnt(fh, (x) => x.verified === true), verified_true_and_same: cnt(fh, (x) => x.verified === true && x.same_as_apollo),
  served: fh.reduce((m, x) => ((m[x.served_by] = (m[x.served_by] ?? 0) + 1), m), {}),
  cost_usd: f.reduce((s, x) => s + x.cost_micro, 0) / 1e6, cost_per_lead: f.reduce((s, x) => s + x.cost_micro, 0) / 1e6 / f.length,
  cost_per_hit: f.reduce((s, x) => s + x.cost_micro, 0) / 1e6 / fh.length, latency: lat(f.filter((x) => x.status === 200).map((x) => x.ms)),
  tried_len: lat(f.filter((x) => x.tried).map((x) => x.tried.split(',').length)),
  diff_detail: fh.filter((x) => x.same_as_apollo === false).map((x) => ({ n: x.n, served_by: x.served_by, verified: x.verified,
    domain_same_as_apollo: x.found_domain === apolloDomain[x.n] })) };

// --- phone ---
const p1 = J('phone-results.json'); const p2 = J('phone2-results.json');
const pa = [...p1.map((x) => ({ ...x, variant: 'name+domain cap0.03' })), ...p2];
A.phone = { attempts: pa.length, found: cnt(pa, (x) => x.found), same_as_apollo: cnt(pa, (x) => x.same_as_apollo),
  by_variant: pa.reduce((m, x) => { const k = x.variant; m[k] ??= { n: 0, found: 0, cost_usd: 0 }; m[k].n++; m[k].found += x.found ? 1 : 0; m[k].cost_usd += x.cost_micro / 1e6; return m; }, {}),
  hits: pa.filter((x) => x.found).map((x) => ({ variant: x.variant, served_by: x.served_by, cost_usd: x.cost_micro / 1e6, same_as_apollo: x.same_as_apollo, mobile_like: x.mobile_like })),
  cost_usd: pa.reduce((s, x) => s + x.cost_micro, 0) / 1e6, latency: lat(pa.map((x) => x.ms)) };

const vf = J('verify-found-results.json'); const v2s = Object.fromEntries(J('verify2-results.json').map((x) => [x.n, x.out_status]));
A.find.tiebreak = vf.map((x) => ({ n: x.n, apollo_email: v2s[x.n], treg_email: x.out_status }));
A.find.retry_lead17 = J('find-retry.json');
delete A.find.retry_lead17._found;
fs.writeFileSync(path.join(OUT, 'analysis.json'), JSON.stringify(A, null, 2));
console.log(JSON.stringify(A, null, 1));
