// Passo 7: o que a 24.19 pede pelo nome — vagas (TheirStack jobs) e tecnologias conhecidas.
// treg.companies.jobs.search (rota, 5 empresas, limit 5) e theirstack.companies.technologies (3 empresas).
// Só domínio/nome da empresa vão ao Treg.
import { treg, save, spentUsd } from './lib.mjs';

const JOBS = [['TOTVS', 'totvs.com'], ['Embraer', 'embraer.com.br'], ['PicPay', 'picpay.com'], ['Riachuelo', 'riachuelo.com.br'], ['Movida', 'movida.com.br']];
const TECH = ['totvs.com', 'picpay.com', 'riachuelo.com.br'];
const SEC = /(segur|secur|cyber|ciber|soc\b|siem|grc|infra|cloud|redes|network|devsecops|pentest)/i;
const res = { jobs: [], tech: [] };
// "again": o /calls/<id>/result não guardou a resposta das rotas (stored: false), então os títulos
// do 1º passe se perderam; repete 2 empresas guardando as linhas cruas.
const AGAIN = process.argv[2] === 'again';
if (AGAIN) { JOBS.splice(0, JOBS.length, ['TOTVS', 'totvs.com'], ['Riachuelo', 'riachuelo.com.br']); TECH.splice(0, TECH.length); }

await Promise.all(JOBS.map(async ([name, domain]) => {
  const r = await treg('treg.companies.jobs.search', { body: { name, domain, limit: 5 }, maxCost: 0.06, tag: 'jobs-routed' });
  const o = r.json?.output ?? {};
  const rows = o.jobs ?? o.results ?? o.rows ?? [];
  const titles = rows.map((x) => x.title ?? x.job_title ?? x.name ?? '').filter(Boolean);
  const dates = rows.map((x) => x.date_posted ?? x.posted_at ?? x.posted_on ?? x.first_seen_at ?? x.created_at ?? null);
  res.jobs.push({ name, domain, status: r.status, ms: r.ms, cost_micro: r.cost_micro, served_by: r.headers?.['x-treg-served-by'] ?? null,
    tried: r.headers?.['x-treg-providers-tried'] ?? null, outcome: r.headers?.['x-treg-route-outcome'] ?? null, output_keys: Object.keys(o),
    n: rows.length, security_titles: titles.filter((t) => SEC.test(t)).length, titles: titles.slice(0, 5), dates: dates.slice(0, 5),
    error: r.status === 200 ? null : JSON.stringify(r.json ?? r.text).slice(0, 300), raw_rows: AGAIN ? rows : undefined });
  console.log('jobs', name, r.status, r.ms, r.cost_micro, r.headers?.['x-treg-served-by'], rows.length, titles.slice(0, 3));
}));

await Promise.all(TECH.map(async (domain) => {
  const r = await treg('theirstack.companies.technologies', { body: { company_domain: domain, limit: 50 }, maxCost: 0.07, tag: 'tech-theirstack' });
  const rows = r.json?.data ?? r.json?.technologies ?? [];
  const names = rows.map((x) => x.technology?.name ?? x.name ?? x.technology_name ?? '').filter(Boolean);
  res.tech.push({ domain, status: r.status, ms: r.ms, cost_micro: r.cost_micro, n: rows.length, keys: Object.keys(r.json ?? {}),
    security_tech: names.filter((t) => /(crowdstrike|sentinel|palo alto|fortinet|splunk|okta|zscaler|cloudflare|microsoft defender|qradar|checkpoint|check point|tenable|rapid7|cyberark|netskope|imperva|akamai|trend micro|sophos|darktrace)/i.test(t)),
    sample: names.slice(0, 15), error: r.status === 200 ? null : JSON.stringify(r.json ?? r.text).slice(0, 300) });
  console.log('tech', domain, r.status, r.ms, r.cost_micro, rows.length, names.slice(0, 8));
}));

save(AGAIN ? 'jobs-again.json' : 'jobs-tech.json', res);
console.log('spent', spentUsd());
