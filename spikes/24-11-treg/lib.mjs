// Cliente mínimo do Treg para o spike 24.11.
// - Lê TREG_API_KEY do .env.local do repo principal; nunca imprime nem grava a chave.
// - Toda chamada manda X-Treg-Route-Max-Cost e entra no ledger (out/ledger.jsonl).
// - Teto global do spike: SPIKE_CAP_USD. Antes de cada chamada, soma o gasto + o teto da chamada
//   e recusa se passaria do limite.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ENV_FILE = '/Users/fabossi/Documents/Fabossi/Projects/TDec-Prospect/.env.local';
export const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const LEDGER = path.join(OUT, 'ledger.jsonl');
export const SPIKE_CAP_USD = 3.0;
export const BASE = 'https://treg.to';

function readKey() {
  const line = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => l.startsWith('TREG_API_KEY='));
  if (!line) throw new Error('TREG_API_KEY ausente');
  return line.slice('TREG_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}
const KEY = readKey();

export function spentUsd() {
  if (!fs.existsSync(LEDGER)) return 0;
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean)
    .map((l) => JSON.parse(l)).reduce((s, r) => s + (r.cost_micro || 0), 0) / 1e6;
}

const H = (r, k) => r.headers.get(k);

/**
 * Chama um endpoint do Treg. opts: { body, method, maxCost (usd), headers, tag, query }
 * Devolve { status, ms, cost_micro, headers:{treg-*}, json, text }
 */
export async function treg(id, opts = {}) {
  const { body, method = body ? 'POST' : 'GET', maxCost, headers = {}, tag = '', query } = opts;
  if (maxCost == null && !opts.free) throw new Error('maxCost obrigatório');
  const spent = spentUsd();
  if (maxCost != null && spent + maxCost > SPIKE_CAP_USD) {
    throw new Error(`teto do spike: gasto ${spent.toFixed(4)} + teto da chamada ${maxCost} > ${SPIKE_CAP_USD}`);
  }
  const url = new URL(id.startsWith('/') ? `${BASE}${id}` : `${BASE}/call/${id}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const h = { 'X-Treg-Token': KEY, 'X-Treg-Meta': 'feature=spike-24-11', ...headers };
  if (maxCost != null) h['X-Treg-Route-Max-Cost'] = String(maxCost);
  if (body) h['content-type'] = 'application/json';
  const t0 = performance.now();
  let r;
  try {
    r = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) });
  } catch (e) {
    const rec = { ts: new Date().toISOString(), id, tag, status: 'neterr', ms: Math.round(performance.now() - t0), error: String(e), cost_micro: 0 };
    fs.appendFileSync(LEDGER, JSON.stringify(rec) + '\n');
    return { ...rec, json: null };
  }
  const text = await r.text();
  const ms = Math.round(performance.now() - t0);
  const th = {};
  for (const [k, v] of r.headers) if (k.startsWith('x-treg') || k === 'retry-after') th[k] = v;
  let json = null;
  try { json = JSON.parse(text); } catch {}
  let cost_micro = Number(H(r, 'x-treg-cost-micro') ?? NaN);
  if (Number.isNaN(cost_micro)) cost_micro = Number(json?._treg?.charged_micro ?? 0) || 0;
  const rec = {
    ts: new Date().toISOString(), id, tag, status: r.status, ms, cost_micro,
    served_by: th['x-treg-served-by'] ?? json?._treg?.served_by ?? null,
    tried: json?._treg?.tried ?? null, call_id: th['x-treg-call-id'] ?? null,
    cache: th['x-treg-cache'] ?? null, replay: th['x-treg-idempotent-replay'] ?? null,
  };
  fs.appendFileSync(LEDGER, JSON.stringify(rec) + '\n');
  return { status: r.status, ms, cost_micro, headers: th, json, text: json ? undefined : text.slice(0, 2000) };
}

export function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));
}

export function readCsv(file) {
  // CSV simples do psql (aspas duplas, vírgula). Suficiente para a amostra.
  const src = fs.readFileSync(file, 'utf8');
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [hdr, ...rest] = rows;
  return rest.filter((r) => r.length === hdr.length).map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i]])));
}

/** Amostra fixa: 25 leads (exclui linhas sem empresa, domínio que não bate e duplicata). */
export function sample() {
  const all = readCsv(path.join(OUT, 'candidates.csv'));
  const skip = new Set([12, 22]); // 12: e-mail de outra empresa; 22: sem company_name
  return all.filter((_, i) => !skip.has(i)).slice(0, 25).map((r, i) => ({
    n: i + 1, ...r, domain: r.email.split('@')[1].toLowerCase(),
  }));
}

export const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
export const uuid = () => crypto.randomUUID();
