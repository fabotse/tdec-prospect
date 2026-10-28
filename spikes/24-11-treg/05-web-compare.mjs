// Passo 5: notícias recentes (90 dias) e vagas — o routed web.search não aceita filtro de data,
// e no passo 2 a busca "<empresa> notícias" trouxe poucas notícias datadas nos últimos 90 dias.
// Aqui, 10 empresas, comparando provedores que aceitam data/país e as rotas dedicadas:
//   serper (Google, gl=br, hl=pt-br, tbs=qdr:m3), exa (startPublishedDate, userLocation BR),
//   tavily (topic news, start_date), treg.companies.news (por domínio), crawl4ai.linkedin.search.jobs.
// Só nome da empresa e domínio vão ao Treg.
import { treg, save, sample, spentUsd } from './lib.mjs';
import { snippetDate } from './02-web-lib.mjs';

const START = '2026-07-30'; // hoje (2026-10-28) - 90 dias
const D90 = new Date(START);
const leads = sample().slice(0, 10);
const brief = (r) => ({ status: r.status, ms: r.ms, cost_micro: r.cost_micro, served_by: r.headers?.['x-treg-served-by'] ?? null,
  error: r.status === 200 ? null : JSON.stringify(r.json ?? r.text).slice(0, 300) });
const nameOf = (l) => l.company_name.replace(/[^\p{L}\p{N} &.-]/gu, ' ').replace(/\s+/g, ' ').trim();
const first = (l) => nameOf(l).toLowerCase().split(' ')[0];
const mentions = (l, x) => JSON.stringify(x).toLowerCase().includes(first(l));
const recentCount = (items, getDate) => items.filter((x) => { const d = getDate(x); return d && d >= D90; }).length;

async function one(l) {
  const name = nameOf(l);
  const o = { n: l.n, company: l.company_name, domain: l.domain };

  const s = await treg('serper.web.search', { body: { q: `${name}`, gl: 'br', hl: 'pt-br', tbs: 'qdr:m3', num: 10 }, maxCost: 0.005, tag: 'cmp-serper' });
  const sr = s.json?.organic ?? [];
  o.serper = { ...brief(s), n: sr.length, mentions: sr.filter((x) => mentions(l, x)).length,
    dated_90d: recentCount(sr, (x) => (x.date ? snippetDate(x.date) ?? new Date(x.date) : snippetDate(x.snippet))), sample: sr.slice(0, 3).map((x) => ({ t: x.title, d: x.date ?? null, u: x.link })) };

  const e = await treg('exa.web.search', { body: { query: `notícias sobre a empresa ${name}`, numResults: 10, userLocation: 'BR', startPublishedDate: `${START}T00:00:00.000Z` }, maxCost: 0.01, tag: 'cmp-exa' });
  const er = e.json?.results ?? [];
  o.exa = { ...brief(e), n: er.length, mentions: er.filter((x) => mentions(l, x)).length,
    dated_90d: recentCount(er, (x) => (x.publishedDate ? new Date(x.publishedDate) : null)), sample: er.slice(0, 3).map((x) => ({ t: x.title, d: x.publishedDate ?? null, u: x.url })) };

  const t = await treg('tavily.web.search', { body: { query: `${name} notícias`, topic: 'news', start_date: START, max_results: 10, search_depth: 'basic', include_usage: true }, maxCost: 0.02, tag: 'cmp-tavily' });
  const tr = t.json?.results ?? [];
  o.tavily = { ...brief(t), n: tr.length, mentions: tr.filter((x) => mentions(l, x)).length,
    dated_90d: recentCount(tr, (x) => (x.published_date ? new Date(x.published_date) : null)), sample: tr.slice(0, 3).map((x) => ({ t: x.title, d: x.published_date ?? null, u: x.url })) };

  const c = await treg('treg.companies.news', { body: { domain: l.domain, limit: 10 }, maxCost: 0.06, tag: 'cmp-companies-news' });
  const cr = c.json?.output?.news ?? c.json?.output?.articles ?? c.json?.output?.results ?? [];
  o.companies_news = { ...brief(c), outcome: c.headers?.['x-treg-route-outcome'] ?? null, n: Array.isArray(cr) ? cr.length : null,
    output_keys: Object.keys(c.json?.output ?? {}), sample: JSON.stringify(cr).slice(0, 400) };

  const j = await treg('crawl4ai.linkedin.search.jobs', { body: { query: `segurança da informação ${name}`, location: 'Brazil', limit: 10 }, maxCost: 0.005, tag: 'cmp-li-jobs' });
  const jr = j.json?.jobs ?? j.json?.results ?? j.json?.data ?? [];
  o.li_jobs = { ...brief(j), n: Array.isArray(jr) ? jr.length : null, mentions: Array.isArray(jr) ? jr.filter((x) => mentions(l, x)).length : null,
    keys: Object.keys(j.json ?? {}), sample: JSON.stringify(Array.isArray(jr) ? jr.slice(0, 2) : j.json).slice(0, 400) };

  console.log(l.n, l.company_name, 'serper', o.serper.status, o.serper.dated_90d, '| exa', o.exa.status, o.exa.mentions, o.exa.dated_90d,
    '| tavily', o.tavily.status, o.tavily.mentions, o.tavily.dated_90d, '| cnews', o.companies_news.status, o.companies_news.n, o.companies_news.served_by,
    '| lijobs', o.li_jobs.status, o.li_jobs.n, o.li_jobs.mentions, '| spent', spentUsd().toFixed(4));
  return o;
}

const res = [];
for (let i = 0; i < leads.length; i += 5) {
  if (spentUsd() > 2.4) { console.log('parando: perto do teto'); break; }
  res.push(...(await Promise.all(leads.slice(i, i + 5).map(one))));
}
save('web-compare.json', res);
console.log('spent', spentUsd());
