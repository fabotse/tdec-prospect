// Passo 2: web.search + web.extract para o dossiê (24.19), 25 empresas da amostra.
// Por empresa: 4 buscas em português (site, notícias, vagas de segurança, incidentes) e
// 3 extrações (home, 1ª notícia, 1ª vaga). Só nome da empresa e domínio vão ao Treg.
import { treg, save, sample, spentUsd } from './lib.mjs';
import { snippetDate } from './02-web-lib.mjs';

const D90 = new Date(new Date('2026-10-28').getTime() - 90 * 864e5);
const MAX = 0.02;
// snippetDate fica em 02-web-lib.mjs (reaproveitado pelo 05-web-compare).
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const brand = (d) => d.split('.')[0];
const SOCIAL = /(linkedin|instagram|facebook|youtube|twitter|x\.com|tiktok|play\.google|apps\.apple|wikipedia|glassdoor|indeed|reclameaqui)/;
const JOBS = /(gupy\.io|linkedin\.com\/jobs|indeed|glassdoor|vagas\.com|infojobs|catho|trabalhabrasil|simplyhired|trabajo\.org|solides|kenoby|abler|inhire|jobs\.|carreiras|trabalheconosco|vempra|talentos)/i;

const rows = (r) => r?.json?.output?.results ?? [];
function brief(r) {
  return { status: r.status, ms: r.ms, cost_micro: r.cost_micro, served_by: r.headers?.['x-treg-served-by'] ?? null,
    tried: r.headers?.['x-treg-providers-tried'] ?? null, outcome: r.headers?.['x-treg-route-outcome'] ?? null,
    error: r.status === 200 ? null : (r.json ?? r.text) };
}
function pageInfo(r) {
  const p = r?.json?.output?.pages?.[0];
  const md = p?.markdown ?? p?.content ?? p?.text ?? '';
  return { ...brief(r), chars: md.length, title: p?.title ?? p?.metadata?.title ?? null, pt: /\b(não|você|serviços|empresa|nossa|são)\b/i.test(md) };
}

async function company(lead) {
  const name = lead.company_name.replace(/[^\p{L}\p{N} &.-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const dom = lead.domain;
  const out = { n: lead.n, company: lead.company_name, domain: dom };

  const s1 = await treg('treg.web.search', { body: { q: `${name} site oficial`, limit: 10 }, maxCost: MAX, tag: 'web-site' });
  const r1 = rows(s1);
  const siteRow = r1.find((x) => brand(host(x.url)) === brand(dom) || host(x.url).endsWith(dom));
  out.site = { ...brief(s1), n: r1.length, found: !!siteRow, found_url: siteRow?.url ?? null, top_host: host(r1[0]?.url) };

  const s2 = await treg('treg.web.search', { body: { q: `${name} notícias`, limit: 10 }, maxCost: MAX, tag: 'web-news' });
  const r2 = rows(s2);
  const dated = r2.map((x) => ({ url: x.url, title: x.title, date: snippetDate(x.snippet ?? x.description ?? '') }));
  const recent = dated.filter((x) => x.date && x.date >= D90);
  out.news = { ...brief(s2), n: r2.length, dated: dated.filter((x) => x.date).length, recent_90d: recent.length,
    recent: recent.slice(0, 5).map((x) => ({ url: x.url, title: x.title, date: x.date.toISOString().slice(0, 10) })) };

  const s3 = await treg('treg.web.search', { body: { q: `vagas segurança da informação ${name}`, limit: 10 }, maxCost: MAX, tag: 'web-jobs' });
  const r3 = rows(s3);
  const jobRows = r3.filter((x) => JOBS.test(x.url) || /\bvaga|\bjob|contratando|hiring/i.test(x.title ?? ''));
  const ownJobs = jobRows.filter((x) => (x.title + ' ' + (x.snippet ?? '')).toLowerCase().includes(brand(dom).slice(0, 5)) || (x.title + ' ' + (x.snippet ?? '')).toLowerCase().includes(name.toLowerCase().split(' ')[0]));
  out.jobs = { ...brief(s3), n: r3.length, job_rows: jobRows.length, mentions_company: ownJobs.length,
    sample: ownJobs.slice(0, 4).map((x) => ({ url: x.url, title: x.title, date: snippetDate(x.snippet ?? '')?.toISOString().slice(0, 10) ?? null })) };

  const s4 = await treg('treg.web.search', { body: { q: `${name} ataque hacker vazamento de dados incidente cibernético`, limit: 10 }, maxCost: MAX, tag: 'web-incident' });
  const r4 = rows(s4);
  const inc = r4.filter((x) => /(hacker|vazamento|ataque|incidente|ransomware|ciber|cyber|invas)/i.test((x.title ?? '') + ' ' + (x.snippet ?? '')) &&
    ((x.title ?? '') + ' ' + (x.snippet ?? '')).toLowerCase().includes(name.toLowerCase().split(' ')[0]));
  out.incident = { ...brief(s4), n: r4.length, relevant: inc.length,
    sample: inc.slice(0, 3).map((x) => ({ url: x.url, title: x.title, date: snippetDate(x.snippet ?? '')?.toISOString().slice(0, 10) ?? null })) };

  const e1 = await treg('treg.web.extract', { body: { url: `https://www.${dom}` }, maxCost: MAX, tag: 'extract-home' });
  out.extract_home = pageInfo(e1);
  const newsUrl = (recent[0] ?? dated.find((x) => !SOCIAL.test(x.url) && brand(host(x.url)) !== brand(dom)))?.url;
  if (newsUrl) { const e2 = await treg('treg.web.extract', { body: { url: newsUrl }, maxCost: MAX, tag: 'extract-news' }); out.extract_news = { url_host: host(newsUrl), ...pageInfo(e2) }; }
  const jobUrl = (ownJobs[0] ?? jobRows[0])?.url;
  if (jobUrl) { const e3 = await treg('treg.web.extract', { body: { url: jobUrl }, maxCost: MAX, tag: 'extract-job' }); out.extract_job = { url_host: host(jobUrl), ...pageInfo(e3) }; }
  console.log(lead.n, lead.company_name, 'site', out.site.found, 'news90', out.news.recent_90d, 'jobs', out.jobs.mentions_company, 'inc', out.incident.relevant,
    'home', out.extract_home.status, out.extract_home.chars, 'spent', spentUsd().toFixed(5));
  return out;
}

const leads = sample();
const results = [];
for (let i = 0; i < leads.length; i += 5) {
  if (spentUsd() > 2.5) { console.log('parando: perto do teto'); break; }
  results.push(...(await Promise.all(leads.slice(i, i + 5).map(company))));
}
save('web-results.json', results);
console.log('spent total', spentUsd());
