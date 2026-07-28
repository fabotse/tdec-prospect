/**
 * Lead Persistence (Story 22.15)
 *
 * Persiste em `leads` (+ `segments`/`lead_segments`) os leads APROVADOS que chegam ao
 * `CreateCampaignStep` — o unico ponto do pipeline onde eles ja estao aprovados,
 * REVELADOS (pos-enrichment) e com icebreaker.
 *
 * Regras que este modulo centraliza (sem duplicar as rotas existentes):
 *
 * 1. IDENTIDADE DO LEAD EM **OR** — `apollo_id` OU email, nunca em prioridade exclusiva.
 *    O precedente do produto e `POST /api/leads/create-batch` ("by email OR apollo_id").
 *    Tratar as duas chaves como particao (quem tem apolloId nao olha email) DUPLICA a
 *    pessoa que ja esta na base vinda de CSV, porque `leads` so tem unique em
 *    (tenant_id, apollo_id) — nao ha unique em email para segurar o erro.
 *
 *    O OR nao pode COLAPSAR duas pessoas numa linha: `apolloId` diferente e gente
 *    diferente, mesmo compartilhando email (caixa de equipe, alias, dado sujo de CSV).
 *    A regra vale dentro do lote (`dedupeBatch`) E contra o banco (`matchExisting` +
 *    mapa de posse): sem a segunda metade, dois leads aprovados com `apolloId` distinto
 *    e email igual resolviam para a MESMA linha legada e um deles nunca era gravado —
 *    sem entrar em `skipped`, sem bolha, sem rastro.
 *
 * 2. EMAIL CASE-INSENSITIVE NOS DOIS LADOS — `leads.email` NAO e normalizado no banco
 *    (import-csv, create-batch e a rota de segmentos gravam a caixa CRUA), entao o
 *    mecanismo da import-csv (`.in("email", <minusculas>)`) nao acha `Maria@Empresa.com`.
 *    Aqui a comparacao e por `ilike` + conferencia em JS (o `ilike` trata `_`/`%` como
 *    curinga, entao o match final e sempre reconferido em memoria).
 *
 * 3. CONTRATO DE FALHA PARCIAL — nao ha transacao (sao chamadas REST independentes).
 *    Depois que os leads do usuario ESTAO na base, nenhuma falha pode virar excecao para
 *    fora daqui: senao o step anuncia "nao consegui salvar ... importe-os manualmente"
 *    sobre leads salvos, e o usuario reimporta, duplicando exatamente a base que a story
 *    existe para organizar. Falha ANTES disso lanca (o step decide o fail-open).
 *
 * 4. VOLUME — `importedLeads` vem de CSV do usuario e nao tem teto: toda query `.in()`/
 *    `.or()` e todo insert sao FATIADOS, e os updates de icebreaker rodam em paralelo
 *    limitado (nunca N round-trips seriais no caminho quente do step).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadWithIcebreaker } from "@/types/agent";

// ==============================================
// CONSTANTS
// ==============================================

/** `segments.name` e VARCHAR(100) (migration 00012). */
const SEGMENT_NAME_MAX_CODE_POINTS = 100;

/** Fatiamento de `.in()` / inserts. */
const CHUNK_SIZE = 100;

/** Fatiamento do filtro `.or()` de emails (cada item vira um termo na URL). */
const EMAIL_CHUNK_SIZE = 50;

/** Updates de icebreaker por rodada (paralelo limitado, nunca serial). */
const UPDATE_CONCURRENCY = 20;

/** unique_violation do Postgres. */
const UNIQUE_VIOLATION = "23505";

// ==============================================
// TYPES
// ==============================================

export interface PersistApprovedLeadsParams {
  /** Client de SESSAO (RLS por tenant). NUNCA service-role — ver Design Notes da 22.15. */
  supabase: SupabaseClient;
  tenantId: string;
  segmentName: string;
  leads: LeadWithIcebreaker[];
}

export interface PersistApprovedLeadsResult {
  /** null quando nao havia lead persistivel (nenhum segmento e criado nesse caso). */
  segmentId: string | null;
  segmentName: string;
  /** Leads ineditos gravados agora. */
  inserted: number;
  /** Leads que ja existiam no tenant (dedupe por apollo_id OU email). */
  reused: number;
  /** Associacoes `lead_segments` criadas agora (as que ja existiam nao contam). */
  associated: number;
  /** Leads sem apollo_id E sem email — impossiveis de identificar, nao persistidos. */
  skipped: number;
  /**
   * Story 22.16: os `leads.id` que ESTAO na base ao fim desta chamada (inseridos agora +
   * reusados), sem repeticao. Ja eram calculados aqui (`persistedIds`) e eram
   * DESCARTADOS no return; a campanha do agente precisa exatamente deste conjunto para
   * associar `campaign_leads` sem uma segunda consulta ao banco.
   */
  leadIds: string[];
  /**
   * Algo ja estava salvo e uma parte posterior falhou. O step usa isto para dizer a
   * VERDADE PARCIAL em vez da bolha de falha total.
   */
  degraded: boolean;
}

interface LeadRecord {
  apolloId: string | null;
  email: string | null;
  name: string | null;
  title: string | null;
  companyName: string | null;
  linkedinUrl: string | null;
  icebreaker: string | null;
}

interface ExistingLeadRow {
  id: string;
  apollo_id: string | null;
  email: string | null;
}

interface ResolvedEntry {
  record: LeadRecord;
  existingId: string | null;
}

interface LeadIndex {
  byApollo: Map<string, string>;
  /**
   * email normalizado -> TODAS as linhas com aquele email, na ordem em que vieram.
   *
   * Nao ha unique de email em `leads`: o mesmo endereco aparece em varias linhas
   * (CSV + Apollo). Guardar so a primeira faz o match desistir quando ela ja pertence a
   * outra pessoa do Apollo, mesmo havendo uma linha SEM dono logo atras — e o lead volta
   * a ser INSERIDO, a duplicata que este modulo existe para evitar.
   */
  byEmail: Map<string, string[]>;
  /** id da linha -> `apollo_id` que responde por ela (null = ainda sem dono). */
  apolloByRowId: Map<string, string | null>;
}

// ==============================================
// PURE HELPERS (exportados — testados isoladamente)
// ==============================================

/**
 * Normaliza o nome do segmento: trim, vazio -> null, teto de 100 CODE POINTS.
 *
 * O corte e por code point (`[...nome]`), nao por unidade UTF-16: `slice(0, 100)` cru
 * pode partir um par substituto ao meio e o Postgres rejeita o surrogate solto.
 * Aceita `unknown` de proposito — o valor vem de um JSONB com mais de um escritor.
 */
export function normalizeSegmentName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const codePoints = [...trimmed];
  const truncated =
    codePoints.length > SEGMENT_NAME_MAX_CODE_POINTS
      ? codePoints.slice(0, SEGMENT_NAME_MAX_CODE_POINTS).join("")
      : trimmed;

  const final = truncated.trim();
  return final === "" ? null : final;
}

/**
 * Quebra o nome do lead como o ExportStep faz: primeiro token = `first_name`
 * (NOT NULL), o resto = `last_name`.
 *
 * Sem nome usavel cai para o primeiro `fallback` nao-vazio — o email JA normalizado (o
 * mesmo valor gravado na coluna `email`) e, na falta dele, o `apollo_id`. Nunca um
 * placeholder literal fabricado, e NUNCA string vazia: `first_name` e NOT NULL mas
 * ACEITA `''`, o que criaria em Meus Leads uma linha sem identidade nenhuma. O chamador
 * so persiste registros que tem email OU apolloId, entao sempre ha fallback util.
 */
export function splitLeadName(
  name: unknown,
  ...fallbacks: Array<string | null | undefined>
): { firstName: string; lastName: string | null } {
  const candidates = [name, ...fallbacks];
  const source =
    candidates
      .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
      .find((candidate) => candidate !== "") ?? "";

  if (source === "") {
    return { firstName: "", lastName: null };
  }

  const parts = source.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

// ==============================================
// INTERNAL HELPERS
// ==============================================

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

function normalizeApolloId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  const message =
    typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : fallbackMessage;
  return new Error(message);
}

/**
 * Escapa os METACARACTERES do LIKE (`\`, `%`, `_`) para que o valor seja tratado como
 * TEXTO LITERAL no `ilike`.
 *
 * Sem isto, um email vindo de CSV do usuario com `%` vira curinga e a query varre a
 * tabela `leads` INTEIRA do tenant (idem para um segmento "Leads 50% off"). A
 * reconferencia em memoria ja garante a correcao do match — este escape existe para nao
 * degradar a query. `\` e o escape default do LIKE no Postgres.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Valor de filtro do PostgREST: aspas duplas + escape, para nao quebrar o `or=(...)`
 * com virgulas/parenteses vindos de um email malformado.
 *
 * Aplicado DEPOIS de `escapeLikePattern`: o `\` que o LIKE precisa e dobrado aqui para
 * sobreviver ao parser de string do PostgREST e chegar intacto ao operador.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Dedupe DENTRO do lote pela MESMA identidade em OR (union-find): o mesmo contato
 * entrando uma vez com `apolloId` e outra so com email e UM lead, nao dois.
 */
function dedupeBatch(leads: LeadWithIcebreaker[]): { records: LeadRecord[]; skipped: number } {
  const raw: LeadRecord[] = [];
  let skipped = 0;

  for (const lead of leads) {
    // Sem cast: `SearchLeadResult.apolloId` e OBRIGATORIO. Um `& { apolloId?: ... }`
    // afrouxaria o campo para opcional e deixaria de acusar em compilacao justamente a
    // regressao de parar de repassar `apolloId` ate aqui.
    const typed = lead;
    const apolloId = normalizeApolloId(typed.apolloId);
    const email = normalizeEmail(typed.email);

    if (!apolloId && !email) {
      skipped++;
      continue;
    }

    raw.push({
      apolloId,
      email,
      name: nullableString(typed.name),
      title: nullableString(typed.title),
      companyName: nullableString(typed.companyName),
      linkedinUrl: nullableString(typed.linkedinUrl),
      icebreaker: nullableString(typed.icebreaker),
    });
  }

  const parent = raw.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  // 1a passada: uniao por `apolloId` IDENTICO — sempre segura (e a mesma pessoa do Apollo).
  const firstByApollo = new Map<string, number>();
  raw.forEach((record, index) => {
    if (!record.apolloId) return;
    const seen = firstByApollo.get(record.apolloId);
    if (seen === undefined) firstByApollo.set(record.apolloId, index);
    else union(index, seen);
  });

  // Apos a 1a passada cada grupo tem NO MAXIMO um `apolloId` distinto.
  const rootApollo = new Map<number, string | null>();
  raw.forEach((record, index) => {
    const root = find(index);
    if (record.apolloId) rootApollo.set(root, record.apolloId);
    else if (!rootApollo.has(root)) rootApollo.set(root, null);
  });

  // 2a passada: uniao por email SO quando nao ha CONFLITO de identidade. Dois registros
  // com `apolloId` DIFERENTE sao duas pessoas do Apollo — uni-las por um email
  // compartilhado (caixa de equipe, alias, dado sujo do CSV) fundiria os dois e o
  // `?? ` do merge descartaria o segundo `apollo_id` EM SILENCIO: o lead sumiria sem
  // sequer entrar em `skipped`.
  const firstByEmail = new Map<string, number>();
  raw.forEach((record, index) => {
    if (!record.email) return;
    const root = find(index);
    const seen = firstByEmail.get(record.email);
    if (seen === undefined) {
      firstByEmail.set(record.email, root);
      return;
    }

    const seenRoot = find(seen);
    if (seenRoot === root) return;

    const apolloA = rootApollo.get(seenRoot) ?? null;
    const apolloB = rootApollo.get(root) ?? null;
    if (apolloA && apolloB && apolloA !== apolloB) return; // identidades distintas: nao une

    union(seenRoot, root);
    const mergedRoot = find(seenRoot);
    rootApollo.set(mergedRoot, apolloA ?? apolloB);
    firstByEmail.set(record.email, mergedRoot);
  });

  const groups = new Map<number, LeadRecord>();
  const order: number[] = [];

  raw.forEach((record, index) => {
    const root = find(index);
    const merged = groups.get(root);
    if (!merged) {
      groups.set(root, { ...record });
      order.push(root);
      return;
    }
    merged.apolloId = merged.apolloId ?? record.apolloId;
    merged.email = merged.email ?? record.email;
    merged.name = merged.name ?? record.name;
    merged.title = merged.title ?? record.title;
    merged.companyName = merged.companyName ?? record.companyName;
    merged.linkedinUrl = merged.linkedinUrl ?? record.linkedinUrl;
    merged.icebreaker = merged.icebreaker ?? record.icebreaker;
  });

  return { records: order.map((root) => groups.get(root) as LeadRecord), skipped };
}

/**
 * Busca no tenant os leads que ja existem por `apollo_id` OU email (case-insensitive
 * nos DOIS lados). Lanca em erro de leitura — ainda nao houve escrita nenhuma.
 */
async function fetchExistingLeads(
  supabase: SupabaseClient,
  tenantId: string,
  apolloIds: string[],
  emails: string[]
): Promise<ExistingLeadRow[]> {
  const rows: ExistingLeadRow[] = [];

  for (const ids of chunk(apolloIds, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, apollo_id, email")
      .eq("tenant_id", tenantId)
      .in("apollo_id", ids);

    if (error) throw toError(error, "Erro ao buscar leads existentes por apollo_id");
    if (data) rows.push(...(data as ExistingLeadRow[]));
  }

  const emailSet = new Set(emails);
  for (const batch of chunk(emails, EMAIL_CHUNK_SIZE)) {
    // Padrao NAO ancorado (`%email%`) de proposito: `leads.email` nao e normalizado no
    // banco e `create-batch` grava o valor CRU, sem trim (`z.string().nullable()` +
    // `lead.email ?? null`), entao ha linhas com espaco em volta. Um padrao ancorado nao
    // acha ` Maria@Acme.COM ` e o lead volta a ser INSERIDO — a duplicata que este modulo
    // existe para evitar. O `%` extra so amplia o candidato: a reconferencia em memoria
    // abaixo compara o email normalizado por igualdade e descarta o resto.
    const filter = batch
      .map((email) => `email.ilike.${quoteFilterValue(`%${escapeLikePattern(email)}%`)}`)
      .join(",");
    const { data, error } = await supabase
      .from("leads")
      .select("id, apollo_id, email")
      .eq("tenant_id", tenantId)
      .or(filter);

    if (error) throw toError(error, "Erro ao buscar leads existentes por email");
    if (!data) continue;

    // `ilike` trata `_` e `%` como curinga: o match final e reconferido em memoria.
    for (const row of data as ExistingLeadRow[]) {
      const normalized = normalizeEmail(row.email);
      if (normalized && emailSet.has(normalized)) rows.push(row);
    }
  }

  return rows;
}

function indexExistingLeads(rows: ExistingLeadRow[]): LeadIndex {
  const byApollo = new Map<string, string>();
  const byEmail = new Map<string, string[]>();
  /**
   * Posse da linha: qual `apollo_id` ja responde por ela. Comeca com o valor da PROPRIA
   * linha e passa a ser preenchido pelo primeiro registro do lote que a reivindicar.
   */
  const apolloByRowId = new Map<string, string | null>();

  for (const row of rows) {
    const apolloId = normalizeApolloId(row.apollo_id);
    if (apolloId && !byApollo.has(apolloId)) byApollo.set(apolloId, row.id);
    const email = normalizeEmail(row.email);
    if (email) {
      // A MESMA linha chega duas vezes quando casa pelas duas queries (apollo + email).
      const candidates = byEmail.get(email) ?? [];
      if (!candidates.includes(row.id)) candidates.push(row.id);
      byEmail.set(email, candidates);
    }
    if (!apolloByRowId.has(row.id) || apolloId) apolloByRowId.set(row.id, apolloId);
  }

  return { byApollo, byEmail, apolloByRowId };
}

/**
 * Casa o registro com uma linha existente por `apollo_id` OU email — RECUSANDO o match
 * por email quando a linha ja pertence a outra pessoa do Apollo.
 *
 * Sem essa recusa, dois registros do lote com `apolloId` DIFERENTE e email igual (a
 * uniao dentro do lote e negada exatamente por isso, ver `dedupeBatch`) resolviam para a
 * mesma linha legada: o segundo saia de `pending`, nao era inserido, nao era contado em
 * `skipped` — o lead aprovado simplesmente nao chegava em Meus Leads, em silencio.
 *
 * Reivindicar tem efeito colateral de proposito (`apolloByRowId`): o primeiro registro
 * com `apolloId` passa a ser o dono da linha para os seguintes do MESMO lote.
 */
function matchExisting(record: LeadRecord, index: LeadIndex): string | null {
  if (record.apolloId) {
    const byApolloId = index.byApollo.get(record.apolloId);
    if (byApolloId) return byApolloId;
  }
  if (record.email) {
    // Varre TODAS as linhas daquele email: uma delas pertencer a outra pessoa do Apollo
    // nao torna as demais invalidas. Parar na primeira faria este registro ser inserido
    // mesmo havendo uma linha legada (CSV, sem `apollo_id`) livre logo atras.
    for (const rowId of index.byEmail.get(record.email) ?? []) {
      const owner = index.apolloByRowId.get(rowId) ?? null;
      // Identidades distintas: a linha e de outra pessoa, tenta a proxima candidata.
      if (record.apolloId && owner && owner !== record.apolloId) continue;
      if (record.apolloId && !owner) index.apolloByRowId.set(rowId, record.apolloId);
      return rowId;
    }
  }
  return null;
}

/**
 * Resolve-ou-cria o segmento. A BUSCA e case-insensitive: o nome vem de extracao do LLM
 * (que varia a caixa entre turnos) e `unique_segment_name_per_tenant` e case-sensitive —
 * sem isto nascem "Teste Atibaia" e "teste atibaia" separados.
 */
async function resolveOrCreateSegment(
  supabase: SupabaseClient,
  tenantId: string,
  name: string
): Promise<string> {
  const lowered = name.trim().toLowerCase();

  const findExisting = async (): Promise<string | null> => {
    const { data, error } = await supabase
      .from("segments")
      .select("id, name")
      .eq("tenant_id", tenantId)
      // `%`/`_` no nome ("Leads 50% off") viram curinga sem este escape e a busca deixa
      // de ser pelo nome pedido. O match final e reconferido em memoria de qualquer forma.
      //
      // SEM `quoteFilterValue` aqui, ao contrario do filtro de email. O PostgREST so
      // desfaz valor citado DENTRO de `or=(...)`, onde as aspas existem para proteger
      // virgula e parentese da separacao de termos. Num filtro AVULSO como este as aspas
      // entram no pattern como texto literal, e a busca deixa de achar qualquer coisa —
      // medido contra o banco real: `%CEO%` devolve 2 linhas, `"%CEO%"` devolve 0. O
      // efeito era o segmento NUNCA ser reusado: toda campanha seguinte com o mesmo nome
      // batia na `unique_segment_name_per_tenant`, degradava, e os leads novos ficavam em
      // Meus Leads FORA do segmento pedido — contra a AC de reuso. O fake dos testes nao
      // pegava porque desfazia valor citado em QUALQUER filtro, premissa que so vale no
      // `or=()`.
      //
      // Padrao NAO ancorado pelo mesmo motivo do filtro de email: `POST /api/segments`
      // grava o nome CRU (`z.string().min(1).max(100)`, sem `.trim()`), entao existe
      // "Teste Atibaia " com espaco em volta. Ancorado, a busca nao acha, a unique
      // (byte-exata) deixa o insert passar e o tenant fica com dois segmentos identicos
      // aos olhos — com os leads no que o usuario NAO estava olhando. A reconferencia em
      // memoria abaixo compara por igualdade e descarta o resto.
      .ilike("name", `%${escapeLikePattern(name)}%`);

    if (error) throw toError(error, "Erro ao buscar segmento");
    const match = ((data ?? []) as Array<{ id: string; name: string }>).find(
      (row) => typeof row.name === "string" && row.name.trim().toLowerCase() === lowered
    );
    return match?.id ?? null;
  };

  const existingId = await findExisting();
  if (existingId) return existingId;

  const { data, error } = await supabase
    .from("segments")
    .insert({ tenant_id: tenantId, name })
    .select("id, name")
    .single();

  if (error) {
    // Corrida: outra execucao criou o mesmo nome entre o select e o insert.
    if (isUniqueViolation(error)) {
      const raced = await findExisting();
      if (raced) return raced;
    }
    throw toError(error, "Erro ao criar segmento");
  }

  const created = data as { id: string } | null;
  if (!created?.id) throw new Error("Segmento criado sem id");
  return created.id;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<boolean>
): Promise<boolean> {
  let allOk = true;
  for (const batch of chunk(items, limit)) {
    const results = await Promise.all(batch.map((item) => task(item).catch(() => false)));
    if (results.some((ok) => !ok)) allOk = false;
  }
  return allOk;
}

// ==============================================
// MAIN
// ==============================================

export async function persistApprovedLeads(
  params: PersistApprovedLeadsParams
): Promise<PersistApprovedLeadsResult> {
  const { supabase, tenantId, leads } = params;

  const segmentName = normalizeSegmentName(params.segmentName);
  if (!segmentName) {
    // Antes de qualquer escrita: pode lancar (o step decide o fail-open).
    throw new Error("Nome de segmento invalido para persistir os leads");
  }

  const { records, skipped } = dedupeBatch(Array.isArray(leads) ? leads : []);

  // Segmento so nasce quando ha lead persistivel — senao a lista do tenant enche de
  // segmentos vazios que ainda sequestram o nome pela unique.
  if (records.length === 0) {
    return {
      segmentId: null,
      segmentName,
      inserted: 0,
      reused: 0,
      associated: 0,
      skipped,
      leadIds: [],
      degraded: false,
    };
  }

  // --- Fase 1: quem ja existe (leitura pura; falha aqui lanca) ---
  const apolloIds = records.map((r) => r.apolloId).filter((id): id is string => Boolean(id));
  const emails = records.map((r) => r.email).filter((email): email is string => Boolean(email));
  const existingRows = await fetchExistingLeads(supabase, tenantId, apolloIds, emails);
  const existingIndex = indexExistingLeads(existingRows);

  const entries: ResolvedEntry[] = records.map((record) => ({
    record,
    existingId: matchExisting(record, existingIndex),
  }));

  /**
   * Ha LEADS do usuario em Meus Leads (ja existentes no tenant ou gravados agora)? A
   * partir do momento em que isto e verdade, nenhuma falha pode virar excecao — o step
   * nao pode mandar reimportar leads que estao salvos.
   *
   * Um segmento NAO conta: um segmento vazio nao e dado do usuario. Por isso ele nasce
   * depois dos leads (Fase 3) — assim uma falha do insert de leads continua sendo falha
   * TOTAL ("nao consegui salvar em Meus Leads"), como manda a matriz de casos da story,
   * sem deixar segmento orfao para tras.
   */
  let anythingPersisted = entries.some((entry) => entry.existingId !== null);
  let degraded = false;

  const failOrDegrade = (error: unknown, message: string): void => {
    if (!anythingPersisted) throw toError(error, message);
    console.error(`[lead-persistence] ${message}:`, error);
    degraded = true;
  };

  // --- Fase 2: insert dos ineditos (com icebreaker embutido) ---
  //
  // ANTES do segmento de proposito. Com a ordem invertida, uma falha do insert de leads
  // sem nada pre-existente lancava DEPOIS de o segmento ja estar criado: o usuario recebia
  // "nao consegui salvar ... importe-os manualmente" enquanto um segmento VAZIO ficava
  // para tras sequestrando o nome pela `unique_segment_name_per_tenant` — e a reimportacao
  // pedida colidia com ele. Leads primeiro tambem torna a falha do segmento uma
  // degradacao (leads salvos, sem agrupamento) em vez de uma falha total.
  const nowIso = new Date().toISOString();
  const pending = entries.filter((entry) => entry.existingId === null);
  const insertedEntries = new Set<ResolvedEntry>();
  let inserted = 0;

  const buildRow = (record: LeadRecord) => {
    // Fallback em cascata: email normalizado -> apollo_id. `dedupeBatch` garante que ao
    // menos um dos dois existe, entao `first_name` NUNCA sai vazio (linha sem identidade
    // nenhuma em Meus Leads).
    const { firstName, lastName } = splitLeadName(record.name, record.email, record.apolloId);
    return {
      tenant_id: tenantId,
      apollo_id: record.apolloId,
      first_name: firstName,
      last_name: lastName,
      // Email NORMALIZADO de proposito: e o mesmo valor que alimenta o fallback de
      // first_name e o que torna o proximo dedupe barato.
      email: record.email,
      company_name: record.companyName,
      title: record.title,
      linkedin_url: record.linkedinUrl,
      status: "novo" as const,
      icebreaker: record.icebreaker,
      icebreaker_generated_at: record.icebreaker ? nowIso : null,
    };
  };

  const applyInsertedRows = (rows: ExistingLeadRow[], batch: ResolvedEntry[]): void => {
    const insertedIndex = indexExistingLeads(rows);
    for (const entry of batch) {
      if (entry.existingId) continue;
      const id = matchExisting(entry.record, insertedIndex);
      if (id) {
        entry.existingId = id;
        insertedEntries.add(entry);
        inserted++;
      }
    }
  };

  for (const batch of chunk(pending, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("leads")
      .insert(batch.map((entry) => buildRow(entry.record)))
      .select("id, apollo_id, email");

    if (!error) {
      applyInsertedRows((data ?? []) as ExistingLeadRow[], batch);
      if (batch.length > 0) anythingPersisted = true;
      continue;
    }

    // 23505: execucao concorrente gravou o mesmo apollo_id. Um lote inteiro nao pode
    // morrer por uma colisao — re-seleciona e insere so o que ainda falta.
    if (isUniqueViolation(error)) {
      try {
        const retryRows = await fetchExistingLeads(
          supabase,
          tenantId,
          batch.map((e) => e.record.apolloId).filter((id): id is string => Boolean(id)),
          batch.map((e) => e.record.email).filter((email): email is string => Boolean(email))
        );
        const retryIndex = indexExistingLeads(retryRows);
        for (const entry of batch) {
          if (entry.existingId) continue;
          const id = matchExisting(entry.record, retryIndex);
          if (id) {
            entry.existingId = id;
            anythingPersisted = true;
          }
        }

        const remaining = batch.filter((entry) => entry.existingId === null);
        if (remaining.length > 0) {
          const retry = await supabase
            .from("leads")
            .insert(remaining.map((entry) => buildRow(entry.record)))
            .select("id, apollo_id, email");

          if (retry.error) {
            failOrDegrade(retry.error, "Falha ao inserir leads apos colisao unica");
          } else {
            applyInsertedRows((retry.data ?? []) as ExistingLeadRow[], remaining);
            anythingPersisted = true;
          }
        }
      } catch (retryError) {
        failOrDegrade(retryError, "Falha ao reconciliar leads apos colisao unica");
      }
      continue;
    }

    failOrDegrade(error, "Falha ao inserir leads");
  }

  /**
   * Reconciliacao: TODO registro persistivel tem que ter terminado com um id. Um registro
   * sem id aqui, sem nenhuma falha registrada, significa que a linha pode ter sido gravada
   * sem voltar no `RETURNING` (politica de SELECT restritiva, `return=minimal`, payload
   * curto) — leads na base, sem associacao e sem icebreaker, com o helper reportando
   * sucesso LIMPO. Melhor degradar e dizer a verdade parcial do que anunciar sucesso.
   */
  const unresolved = entries.filter((entry) => entry.existingId === null).length;
  if (unresolved > 0 && !degraded) {
    console.error(
      `[lead-persistence] ${unresolved} lead(s) sem id apos o insert — resultado degradado`
    );
    degraded = true;
  }

  const persisted = entries.filter((entry): entry is ResolvedEntry & { existingId: string } =>
    Boolean(entry.existingId)
  );

  // Dois registros DISTINTOS do lote podem apontar para a MESMA linha do banco: a linha
  // existente tem apollo_id E email, um registro trouxe so o apolloId e o outro so o
  // email, e `dedupeBatch` nao os uniu porque nao compartilhavam chave. Sem deduplicar
  // aqui, o insert em `lead_segments` violaria `unique_lead_per_segment` contra a propria
  // duplicata (o chunk inteiro viraria `degraded`) e `reused` contaria a mesma pessoa
  // duas vezes.
  const persistedIds = Array.from(new Set(persisted.map((entry) => entry.existingId)));
  const reused = Math.max(persistedIds.length - inserted, 0);

  // --- Fase 3: segmento (resolve-ou-cria) ---
  // Depois dos leads: um segmento vazio nao e dado do usuario e nao pode sobrar de uma
  // falha total (ver o comentario da Fase 2).
  let segmentId: string | null = null;
  if (persistedIds.length > 0) {
    try {
      segmentId = await resolveOrCreateSegment(supabase, tenantId, segmentName);
    } catch (error) {
      failOrDegrade(error, "Falha ao resolver o segmento");
    }
  }

  // --- Fase 4: associacoes faltantes ---
  let associated = 0;

  if (segmentId && persistedIds.length > 0) {
    const alreadyAssociated = new Set<string>();

    try {
      for (const ids of chunk(persistedIds, CHUNK_SIZE)) {
        const { data, error } = await supabase
          .from("lead_segments")
          .select("lead_id")
          .eq("segment_id", segmentId)
          .in("lead_id", ids);

        if (error) throw toError(error, "Erro ao buscar associacoes existentes");
        for (const row of (data ?? []) as Array<{ lead_id: string }>) {
          alreadyAssociated.add(row.lead_id);
        }
      }

      const missing = persistedIds.filter((id) => !alreadyAssociated.has(id));

      for (const ids of chunk(missing, CHUNK_SIZE)) {
        const rows = ids.map((leadId) => ({ segment_id: segmentId, lead_id: leadId }));
        const { error } = await supabase.from("lead_segments").insert(rows);

        if (!error) {
          associated += rows.length;
          anythingPersisted = true;
          continue;
        }

        // 23505 em `unique_lead_per_segment`: alguem ja associou. Nao e falha.
        if (isUniqueViolation(error)) {
          const { data: recheck, error: recheckError } = await supabase
            .from("lead_segments")
            .select("lead_id")
            .eq("segment_id", segmentId)
            .in("lead_id", ids);

          if (recheckError) {
            failOrDegrade(recheckError, "Falha ao reconferir associacoes");
            continue;
          }

          const present = new Set(
            ((recheck ?? []) as Array<{ lead_id: string }>).map((row) => row.lead_id)
          );
          const stillMissing = ids.filter((id) => !present.has(id));

          if (stillMissing.length > 0) {
            const retry = await supabase
              .from("lead_segments")
              .insert(stillMissing.map((leadId) => ({ segment_id: segmentId, lead_id: leadId })));

            if (retry.error) {
              failOrDegrade(retry.error, "Falha ao associar leads ao segmento");
              continue;
            }
            associated += stillMissing.length;
          }
          anythingPersisted = true;
          continue;
        }

        failOrDegrade(error, "Falha ao associar leads ao segmento");
      }
    } catch (error) {
      failOrDegrade(error, "Falha na etapa de associacao ao segmento");
    }
  }

  // --- Fase 5: icebreaker dos REUSADOS, por ultimo ---
  // Deixado para o fim de proposito: um erro aqui nao pode bloquear leads e associacoes,
  // que sao o valor principal da persistencia.
  // Um UPDATE por LINHA (nunca dois registros do lote apontando para o mesmo lead) e
  // nenhum para os que acabaram de ser inseridos — esses ja gravaram o icebreaker.
  const insertedIds = new Set(
    Array.from(insertedEntries).map((entry) => entry.existingId as string)
  );
  const refreshableById = new Map<string, ResolvedEntry & { existingId: string }>();
  for (const entry of persisted) {
    if (!entry.record.icebreaker) continue;
    if (insertedIds.has(entry.existingId)) continue;
    if (!refreshableById.has(entry.existingId)) refreshableById.set(entry.existingId, entry);
  }
  const refreshable = Array.from(refreshableById.values());

  if (refreshable.length > 0) {
    const allOk = await runWithConcurrency(refreshable, UPDATE_CONCURRENCY, async (entry) => {
      const { error } = await supabase
        .from("leads")
        .update({
          icebreaker: entry.record.icebreaker,
          icebreaker_generated_at: nowIso,
        })
        .eq("tenant_id", tenantId)
        .eq("id", entry.existingId);
      return !error;
    });

    if (!allOk) {
      failOrDegrade(
        new Error("update de icebreaker falhou"),
        "Falha ao atualizar icebreaker de leads existentes"
      );
    }
  }

  // Story 22.16: `persistedIds` sai daqui em vez de morrer na funcao. E o unico ponto do
  // fluxo que sabe quais linhas de `leads` respondem pelos leads aprovados.
  return { segmentId, segmentName, inserted, reused, associated, skipped, leadIds: persistedIds, degraded };
}
