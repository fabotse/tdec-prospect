// Passo 6: vagas de segurança/infra recentes (sinal para o dossiê 24.19 e o radar do Epic 25).
// 10 empresas: exa.web.search com data (90 dias) e LinkedIn jobs (crawl4ai) com o nome curto da empresa.
import { treg, save, sample, spentUsd } from './lib.mjs';

const START = '2026-07-30';
const leads = sample().slice(10, 20); // outras 10 empresas, diferentes do passo 5
const nameOf = (l) => l.company_name.replace(/[^\p{L}\p{N} &.-]/gu, ' ').replace(/\s+/g, ' ').trim();
const short = (l) => nameOf(l).split(' ').slice(0, 2).join(' ');
const JOBISH = /(vaga|job|carreira|career|gupy|linkedin\.com\/jobs|contrata|hiring|oportunidade)/i;

const res = [];
await Promise.all(leads.map(async (l) => {
  const e = await treg('exa.web.search', { body: { query: `vaga segurança da informação ou cibersegurança na ${nameOf(l)}`, numResults: 10, userLocation: 'BR', startPublishedDate: `${START}T00:00:00.000Z` }, maxCost: 0.01, tag: 'jobs-exa' });
  const er = e.json?.results ?? [];
  const first = nameOf(l).toLowerCase().split(' ')[0];
  const ej = er.filter((x) => JOBISH.test(x.url + ' ' + x.title) && (x.url + ' ' + x.title).toLowerCase().includes(first.slice(0, 5)));
  const j = await treg('crawl4ai.linkedin.search.jobs', { body: { query: `${short(l)} segurança`, location: 'Brazil', limit: 10, posted: 'month' }, maxCost: 0.005, tag: 'jobs-li' });
  const rows = j.json?.rows ?? [];
  const lj = rows.filter((x) => JSON.stringify(x).toLowerCase().includes(first.slice(0, 5)));
  res.push({ n: l.n, company: l.company_name,
    exa: { status: e.status, ms: e.ms, cost_micro: e.cost_micro, n: er.length, job_like_company: ej.length, sample: ej.slice(0, 3).map((x) => ({ t: x.title, d: x.publishedDate, u: x.url })) },
    li: { status: j.status, ms: j.ms, cost_micro: j.cost_micro, n: rows.length, company_rows: lj.length, sample: lj.slice(0, 3), row_keys: rows[0] ? Object.keys(rows[0]) : [] } });
  console.log(l.n, l.company_name, '| exa', e.status, er.length, ej.length, '| li', j.status, rows.length, lj.length);
}));
save('jobs.json', res.sort((a, b) => a.n - b.n));
console.log('spent', spentUsd());
