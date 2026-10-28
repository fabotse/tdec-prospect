// Passo 1: sonda do formato de web.search / web.extract antes do loop (2 buscas + 1 extração).
import { treg, save, spentUsd } from './lib.mjs';

const res = {};
res.search_pt = await treg('treg.web.search', {
  body: { q: 'Movida Aluguel de Carros notícias outubro 2026', limit: 10 }, maxCost: 0.02, tag: 'probe-search',
});
res.search_jobs = await treg('treg.web.search', {
  body: { q: 'vagas segurança da informação TOTVS', limit: 10 }, maxCost: 0.02, tag: 'probe-search',
});
res.extract = await treg('treg.web.extract', { body: { url: 'https://www.movida.com.br' }, maxCost: 0.02, tag: 'probe-extract' });
save('web-probe.json', res);
for (const [k, r] of Object.entries(res)) {
  console.log('==', k, r.status, r.ms + 'ms', 'cost', r.cost_micro, JSON.stringify(r.headers));
  console.log(JSON.stringify(r.json ?? r.text).slice(0, 2500));
}
console.log('spent', spentUsd());
