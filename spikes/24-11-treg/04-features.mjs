// Passo 4: Idempotency-Key, cache de repetição, teto por chamada (X-Treg-Route-Max-Cost) e
// conferência de BYOK. Só consultas de empresa (sem dados pessoais).
import { treg, save, spentUsd, uuid } from './lib.mjs';

const show = (label, r) => {
  const h = r.headers ?? {};
  const row = { label, status: r.status, ms: r.ms, cost_micro: r.cost_micro, served_by: h['x-treg-served-by'] ?? null, cache: h['x-treg-cache'] ?? null,
    replay: h['x-treg-idempotent-replay'] ?? null, original_cost: h['x-treg-original-cost-micro'] ?? null, treg_error: h['x-treg-error'] ?? null,
    headers: h, body: r.status === 200 ? undefined : (r.json ?? r.text) };
  console.log(label, '|', r.status, r.ms + 'ms', 'cost', r.cost_micro, 'cache', row.cache, 'replay', row.replay, 'orig', row.original_cost,
    row.body ? JSON.stringify(row.body).slice(0, 300) : '');
  return row;
};
const out = [];

// 1) Idempotency-Key numa chamada direta paga (exa, $0.007): 1ª chamada, repetição com a mesma chave,
//    mesma chave com corpo diferente (doc: 422).
const key = uuid();
const qA = { query: 'Embraer segurança cibernética 2026', numResults: 3, userLocation: 'BR' };
out.push(show('idem-1st', await treg('exa.web.search', { body: qA, maxCost: 0.01, headers: { 'Idempotency-Key': key }, tag: 'feat-idem' })));
out.push(show('idem-replay', await treg('exa.web.search', { body: qA, maxCost: 0.01, headers: { 'Idempotency-Key': key }, tag: 'feat-idem' })));
out.push(show('idem-other-body', await treg('exa.web.search', { body: { ...qA, numResults: 4 }, maxCost: 0.01, headers: { 'Idempotency-Key': key }, tag: 'feat-idem' })));
// Idempotency-Key em rota (routed)
const key2 = uuid();
const qR = { q: 'TOTVS relações com investidores', limit: 5 };
out.push(show('idem-routed-1st', await treg('treg.web.search', { body: qR, maxCost: 0.01, headers: { 'Idempotency-Key': key2 }, tag: 'feat-idem' })));
out.push(show('idem-routed-replay', await treg('treg.web.search', { body: qR, maxCost: 0.01, headers: { 'Idempotency-Key': key2 }, tag: 'feat-idem' })));

// 2) Cache: a mesma pergunta sem chave (doc: 2ª vez sai do arquivo do Treg a 10%), e com Cache-Control: no-cache.
out.push(show('cache-repeat-exa', await treg('exa.web.search', { body: qA, maxCost: 0.01, tag: 'feat-cache' })));
out.push(show('cache-nocache-exa', await treg('exa.web.search', { body: qA, maxCost: 0.01, headers: { 'Cache-Control': 'no-cache' }, tag: 'feat-cache' })));
out.push(show('cache-repeat-routed', await treg('treg.web.search', { body: qR, maxCost: 0.01, tag: 'feat-cache' })));
// a mesma busca de notícias do passo 5 (Bradesco Seguros), repetida sem chave
out.push(show('cache-repeat-exa-news', await treg('exa.web.search', { body: { query: 'notícias sobre a empresa Bradesco Seguros', numResults: 10, userLocation: 'BR', startPublishedDate: '2026-07-30T00:00:00.000Z' }, maxCost: 0.01, tag: 'feat-cache' })));

// 3) Teto por chamada: direta com teto abaixo do preço (doc: 402 route_max_cost, sem cobrança);
//    rota com teto minúsculo.
out.push(show('cap-direct-below-price', await treg('exa.web.search', { body: { ...qA, query: 'Natura segurança da informação' }, maxCost: 0.001, tag: 'feat-cap' })));
out.push(show('cap-routed-tiny', await treg('treg.companies.news', { body: { domain: 'natura.net', limit: 5 }, maxCost: 0.001, tag: 'feat-cap' })));

// 4) Formato do LinkedIn jobs (no passo 5 voltou rows vazio com o nome da empresa na query).
out.push(show('li-jobs-generic', await treg('crawl4ai.linkedin.search.jobs', { body: { query: 'segurança da informação', location: 'Brazil', limit: 5, posted: 'month' }, maxCost: 0.005, tag: 'feat-lijobs' })));
const last = out.at(-1);
save('features.json', out);
console.log('li rows sample:', JSON.stringify(last).slice(0, 200));
console.log('spent', spentUsd());
