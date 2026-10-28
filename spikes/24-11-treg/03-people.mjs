// Passo 3: people.email.verify (e-mail do Apollo), people.email.find (nome + domínio) e
// people.phone.find (nome + domínio, subamostra de 8 com telefone no Apollo).
// Dados enviados: verify -> só o e-mail; find/phone -> first_name, last_name, domain.
// O domínio vem do e-mail do Apollo (não há coluna de domínio em leads): isso favorece o find.
import { treg, save, sample, spentUsd } from './lib.mjs';

const which = process.argv[2] || 'all';
const leads = sample();
const brief = (r) => ({ status: r.status, ms: r.ms, cost_micro: r.cost_micro, served_by: r.headers?.['x-treg-served-by'] ?? null,
  tried: r.headers?.['x-treg-providers-tried'] ?? null, outcome: r.headers?.['x-treg-route-outcome'] ?? null,
  advice: r.json?._treg?.advice ?? null, error: r.status === 200 ? null : (r.json ?? r.text) });
const digits = (s) => (s || '').replace(/\D/g, '');

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

if (which === 'all' || which === 'verify') {
  const res = await pool(leads, 5, async (l) => {
    const r = await treg('treg.people.email.verify', { body: { email: l.email }, maxCost: 0.02, tag: 'verify' });
    const o = r.json?.output ?? {};
    return { n: l.n, ...brief(r), out_status: o.status ?? null, valid: o.valid ?? null, score: o.score ?? null };
  });
  save('verify-results.json', res);
  console.log('verify done, spent', spentUsd().toFixed(5));
}

// Segunda opinião: mesmos e-mails, excluindo o contactout (rota grátis que deu 429 no meio do lote),
// para medir concordância entre provedores. Não há email_status do Apollo gravado em leads.
if (which === 'verify2') {
  const res = await pool(leads, 5, async (l) => {
    const r = await treg('treg.people.email.verify', { body: { email: l.email }, maxCost: 0.02, tag: 'verify2',
      headers: { 'X-Treg-Route-Exclude': 'contactout' } });
    const o = r.json?.output ?? {};
    return { n: l.n, ...brief(r), out_status: o.status ?? null, valid: o.valid ?? null, score: o.score ?? null };
  });
  save('verify2-results.json', res);
  console.log('verify2 done, spent', spentUsd().toFixed(5));
}

if (which === 'all' || which === 'find') {
  const res = await pool(leads, 5, async (l) => {
    const r = await treg('treg.people.email.find', { body: { first_name: l.first_name, last_name: l.last_name, domain: l.domain }, maxCost: 0.025, tag: 'find' });
    const o = r.json?.output ?? {};
    const found = (o.email || '').toLowerCase();
    return { n: l.n, ...brief(r), found: !!found, same_as_apollo: found ? found === l.email.toLowerCase() : null,
      found_domain: found ? found.split('@')[1] : null, confidence: o.confidence ?? null, verified: o.verified ?? null, _found: found || null };
  });
  save('find-results.json', res);
  console.log('find done, spent', spentUsd().toFixed(5));
}

if (which === 'all' || which === 'phone') {
  const sub = leads.filter((l) => l.has_phone === 't').slice(0, 8);
  const res = await pool(sub, 4, async (l) => {
    const r = await treg('treg.people.phone.find', { body: { first_name: l.first_name, last_name: l.last_name, domain: l.domain }, maxCost: 0.03, tag: 'phone' });
    const o = r.json?.output ?? {};
    const ph = digits(o.phone || o.phones?.[0]);
    return { n: l.n, ...brief(r), found: !!ph, same_as_apollo: ph ? ph.slice(-8) === digits(l.phone).slice(-8) : null,
      apollo_phone_kind: digits(l.phone).length, mobile_like: ph ? /^55\d{2}9/.test(ph) || /^\d{2}9\d{8}$/.test(ph) : null, _found: ph || null };
  });
  save('phone-results.json', res);
  console.log('phone done, spent', spentUsd().toFixed(5));
}

// Desempate do find: quando o e-mail achado difere do Apollo, verifica os dois (Apollo já tem o
// verify do trykitt em verify2-results.json; aqui verifica o achado pelo Treg, mesmo provedor).
if (which === 'verifyfound') {
  const f = (await import('node:fs')).readFileSync(new URL('./out/find-results.json', import.meta.url), 'utf8');
  const diff = JSON.parse(f).filter((x) => x.found && x.same_as_apollo === false);
  const res = await pool(diff, 4, async (x) => {
    const r = await treg('treg.people.email.verify', { body: { email: x._found }, maxCost: 0.02, tag: 'verify-found',
      headers: { 'X-Treg-Route-Exclude': 'contactout' } });
    return { n: x.n, ...brief(r), out_status: r.json?.output?.status ?? null };
  });
  save('verify-found-results.json', res);
  console.log('verifyfound done', res.map((x) => `${x.n}:${x.out_status}`).join(' '), 'spent', spentUsd().toFixed(5));
}

// Repete o find que estourou o timeout de 120 s do cliente (lead 17), agora com Idempotency-Key.
if (which === 'findretry') {
  const l = leads.find((x) => x.n === 17);
  const key = (await import('node:crypto')).randomUUID();
  const body = { first_name: l.first_name, last_name: l.last_name, domain: l.domain };
  const r = await treg('treg.people.email.find', { body, maxCost: 0.025, tag: 'find-retry', headers: { 'Idempotency-Key': key } });
  const o = r.json?.output ?? {};
  const found = (o.email || '').toLowerCase();
  const res = { n: 17, ...brief(r), found: !!found, same_as_apollo: found ? found === l.email.toLowerCase() : null, verified: o.verified ?? null, _found: found || null };
  save('find-retry.json', res);
  console.log('findretry', r.status, r.ms, r.cost_micro, res.served_by, res.found, res.same_as_apollo, res.tried, 'spent', spentUsd().toFixed(5));
}

// Variantes do phone: com teto 0,03 os 8 deram miss e os provedores caros foram "skipped".
// (a) 5 leads só com linkedin_url (abre os provedores baratos que aceitam LinkedIn), teto 0,05.
// (b) 2 leads com nome + domínio e teto 0,25 (libera limadata/prospeo/leadsforge).
if (which === 'phone2') {
  const sub = leads.filter((l) => l.has_phone === 't' && l.linkedin_url).slice(0, 7);
  const run = async (l, body, maxCost, tag) => {
    const r = await treg('treg.people.phone.find', { body, maxCost, tag });
    const o = r.json?.output ?? {};
    const ph = digits(o.phone || o.phones?.[0]);
    return { n: l.n, variant: tag, ...brief(r), found: !!ph, same_as_apollo: ph ? ph.slice(-8) === digits(l.phone).slice(-8) : null,
      mobile_like: ph ? /^55\d{2}9/.test(ph) : null, verified: o.verified ?? null, _found: ph || null };
  };
  const a = await pool(sub.slice(0, 5), 5, (l) => run(l, { linkedin_url: l.linkedin_url }, 0.05, 'phone-li'));
  const b = await pool(sub.slice(5, 7), 2, (l) => run(l, { first_name: l.first_name, last_name: l.last_name, domain: l.domain }, 0.25, 'phone-hi'));
  save('phone2-results.json', [...a, ...b]);
  console.log('phone2 done, spent', spentUsd().toFixed(5));
}
