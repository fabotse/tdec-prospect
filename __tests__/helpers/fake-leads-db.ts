/**
 * Fake in-memory de `leads` / `segments` / `lead_segments` (Story 22.15)
 * + `campaigns` / `campaign_leads` (Story 22.16)
 *
 * Compartilhado por `lead-persistence.test.ts` e `campaign-persistence.test.ts` (unidade
 * dos helpers) e por `create-campaign-step.test.ts` (a costura step -> helper roda contra
 * ELE, nao contra um mock do helper — sem isso nenhum teste exercita os dois juntos).
 *
 * O que este fake reproduz do Postgres, e que um chain-builder generico nao reproduz:
 * - os unique indexes LANCAM `23505` (leads por (tenant_id, apollo_id) PARCIAL, segmentos
 *   por (tenant_id, name) CASE-SENSITIVE, lead_segments por (segment_id, lead_id),
 *   campaign_leads por (campaign_id, lead_id) = `unique_lead_per_campaign`);
 * - `.upsert(..., { ignoreDuplicates: true })` devolve SO as linhas realmente inseridas
 *   (e por isso a segunda execucao com os mesmos pares devolve `[]`, sem erro);
 * - os limites de VARCHAR estouram (`22001`) em vez de truncar em silencio;
 * - `.in()` e comparacao EXATA (o mecanismo que NAO acha email em caixa mista);
 * - `ilike` e case-insensitive COM curinga real (`_` e `%`);
 * - `first_name` e NOT NULL (mas aceita string vazia — por isso o teste confere o valor);
 * - falhas podem ser injetadas por (tabela, operacao), inclusive DEPOIS da 1a escrita.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const FAKE_TENANT = "tenant-001";
export const FAKE_OTHER_TENANT = "tenant-999";

export interface FakeLead {
  id: string;
  tenant_id: string;
  apollo_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  status: string;
  icebreaker: string | null;
  icebreaker_generated_at: string | null;
}

export interface FakeSegment {
  id: string;
  tenant_id: string;
  name: string;
}

export interface FakeAssociation {
  segment_id: string;
  lead_id: string;
}

/** Story 22.16: linha de `campaigns` (colunas de 00016 + 00025 + 00037). */
export interface FakeCampaign {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  product_id: string | null;
  created_at: string;
  updated_at: string;
  external_campaign_id: string | null;
  export_platform: string | null;
  exported_at: string | null;
  export_status: string | null;
}

/** Story 22.16: linha de `campaign_leads` (unique_lead_per_campaign). */
export interface FakeCampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string;
  added_at: string;
}

export interface QueryContext {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  /**
   * Story 22.16: `.select()` foi encadeado?
   *
   * No PostgREST, uma escrita SEM `.select()` volta com `data: null` (`Prefer:
   * return=minimal`). O fake devolvia as linhas de qualquer jeito, e com isso virava um
   * oraculo permissivo: remover o `.select("id")` do UPDATE de idempotencia faria a
   * PRODUCAO cair no ramo de insert e criar uma segunda campanha, enquanto o teste
   * "NAO cria uma segunda campanha" seguia verde.
   */
  returning: boolean;
  /** Story 22.16: 2o argumento de `.upsert()` (onConflict / ignoreDuplicates). */
  upsertOptions?: { onConflict?: string; ignoreDuplicates?: boolean };
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  ilike: Array<[string, string]>;
  or: string | null;
}

interface InjectedFailure {
  table: string;
  op: QueryContext["op"];
  error: { code?: string; message: string };
  remaining: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `ilike` do Postgres: case-insensitive, `_` = 1 char, `%` = n chars, e `\` como ESCAPE
 * default (`\%` casa um `%` literal).
 *
 * O escape importa: e exatamente o que separa "buscar o email `a%@x.com`" de "varrer a
 * tabela inteira". Um fake que ignorasse `\` aprovaria a query degenerada.
 */
export function ilikeMatch(value: string | null, pattern: string): boolean {
  if (value === null) return false;

  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) {
        regex += "\\\\";
        break;
      }
      regex += escapeRegExp(next);
      i++;
      continue;
    }
    if (char === "%") {
      regex += ".*";
      continue;
    }
    if (char === "_") {
      regex += ".";
      continue;
    }
    regex += escapeRegExp(char);
  }

  return new RegExp(`${regex}$`, "i").test(value);
}

/**
 * Desfaz o valor CITADO do PostgREST (`"a\\%@x.com"` -> `a\%@x.com`). As aspas existem
 * para o valor poder conter virgula/parentese; o `\` do LIKE e dobrado dentro delas e
 * volta ao normal aqui, antes de o padrao chegar ao `ilike`.
 */
function unquoteFilterValue(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw;
  return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** `campaigns.name` e VARCHAR(200) (migration 00016). */
const CAMPAIGN_NAME_MAX = 200;

/** ENUM `campaign_status` (migration 00016). */
const CAMPAIGN_STATUSES = new Set(["draft", "active", "paused", "completed"]);

export class FakeDb {
  leads: FakeLead[] = [];
  segments: FakeSegment[] = [];
  associations: FakeAssociation[] = [];
  /** Story 22.16 */
  campaigns: FakeCampaign[] = [];
  /** Story 22.16 */
  campaignLeads: FakeCampaignLead[] = [];
  /**
   * Toda query executada. Os FILTROS entram no log de proposito: alguns defeitos (padrao
   * de `ilike` nao escapado -> varredura da tabela) so sao observaveis na QUERY, porque a
   * reconferencia em memoria mascara o resultado.
   */
  log: Array<{
    table: string;
    op: string;
    payload?: unknown;
    or?: string | null;
    ilike?: Array<[string, string]>;
    in?: Array<[string, unknown[]]>;
    /** Story 22.16: o `onConflict` faz parte da query — sem ele o upsert nao e idempotente. */
    upsertOptions?: { onConflict?: string; ignoreDuplicates?: boolean };
  }> = [];
  private failures: InjectedFailure[] = [];
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  seedLead(row: Partial<FakeLead>): FakeLead {
    const lead: FakeLead = {
      id: row.id ?? this.nextId("lead"),
      tenant_id: row.tenant_id ?? FAKE_TENANT,
      apollo_id: row.apollo_id ?? null,
      first_name: row.first_name ?? "Seed",
      last_name: row.last_name ?? null,
      email: row.email ?? null,
      company_name: row.company_name ?? null,
      title: row.title ?? null,
      linkedin_url: row.linkedin_url ?? null,
      status: row.status ?? "novo",
      icebreaker: row.icebreaker ?? null,
      icebreaker_generated_at: row.icebreaker_generated_at ?? null,
    };
    this.leads.push(lead);
    return lead;
  }

  /** Story 22.16: linha de campanha pre-existente (ex.: rascunho manual do builder). */
  seedCampaign(row: Partial<FakeCampaign> = {}): FakeCampaign {
    const now = new Date().toISOString();
    const campaign: FakeCampaign = {
      id: row.id ?? this.nextId("campaign"),
      tenant_id: row.tenant_id ?? FAKE_TENANT,
      name: row.name ?? "Campanha seed",
      status: row.status ?? "draft",
      product_id: row.product_id ?? null,
      created_at: row.created_at ?? now,
      updated_at: row.updated_at ?? now,
      external_campaign_id: row.external_campaign_id ?? null,
      export_platform: row.export_platform ?? null,
      exported_at: row.exported_at ?? null,
      export_status: row.export_status ?? null,
    };
    this.campaigns.push(campaign);
    return campaign;
  }

  seedSegment(name: string, tenantId = FAKE_TENANT): FakeSegment {
    const segment = { id: this.nextId("segment"), tenant_id: tenantId, name };
    this.segments.push(segment);
    return segment;
  }

  /** Injeta falha nas proximas `times` execucoes de (table, op). */
  fail(
    table: string,
    op: QueryContext["op"],
    error: { code?: string; message: string },
    times = 1
  ): void {
    this.failures.push({ table, op, error, remaining: times });
  }

  private takeFailure(ctx: QueryContext): { code?: string; message: string } | null {
    const failure = this.failures.find(
      (f) => f.table === ctx.table && f.op === ctx.op && f.remaining > 0
    );
    if (!failure) return null;
    failure.remaining -= 1;
    return failure.error;
  }

  execute(ctx: QueryContext): { data: unknown; error: unknown } {
    this.log.push({
      table: ctx.table,
      op: ctx.op,
      payload: ctx.payload,
      or: ctx.or,
      ilike: ctx.ilike.map(([column, pattern]) => [column, pattern] as [string, string]),
      // O `.in()` entra no log para que o FATIAMENTO das leituras seja assertavel: sem
      // isto, remover o `chunk()` da busca por `apollo_id` ou da leitura de
      // `lead_segments` passa verde e so quebra em producao, nos lotes grandes de CSV.
      in: ctx.in.map(([column, values]) => [column, [...values]] as [string, unknown[]]),
      upsertOptions: ctx.upsertOptions,
    });

    const injected = this.takeFailure(ctx);
    if (injected) return { data: null, error: injected };

    const result = this.dispatch(ctx);

    // `Prefer: return=minimal`: escrita sem `.select()` nao devolve linha nenhuma. A
    // escrita EM SI ja aconteceu acima — o que sumir aqui e so o RETURNING, como no
    // PostgREST real.
    if (ctx.op !== "select" && !ctx.returning && !result.error) {
      return { data: null, error: null };
    }

    return result;
  }

  private dispatch(ctx: QueryContext): { data: unknown; error: unknown } {
    if (ctx.table === "leads") return this.executeLeads(ctx);
    if (ctx.table === "segments") return this.executeSegments(ctx);
    if (ctx.table === "lead_segments") return this.executeAssociations(ctx);
    if (ctx.table === "campaigns") return this.executeCampaigns(ctx);
    if (ctx.table === "campaign_leads") return this.executeCampaignLeads(ctx);
    return { data: null, error: null };
  }

  private matchesFilters(row: Record<string, unknown>, ctx: QueryContext): boolean {
    for (const [column, value] of ctx.eq) {
      if (row[column] !== value) return false;
    }
    for (const [column, values] of ctx.in) {
      // `.in()` do PostgREST e comparacao EXATA (e o mecanismo que NAO acha caixa mista).
      if (!values.includes(row[column] as never)) return false;
    }
    for (const [column, pattern] of ctx.ilike) {
      // SEM unquote aqui. Medido contra o PostgREST real: aspas so sao desfeitas dentro
      // de `or=(...)`, onde existem para proteger virgula/parentese da separacao de
      // termos. Num filtro AVULSO elas entram no pattern como texto literal — `%CEO%`
      // devolve 2 linhas e `"%CEO%"` devolve 0. O fake desfazia em qualquer filtro e com
      // isso certificava como verde uma busca de segmento que nunca achava nada.
      if (!ilikeMatch(row[column] as string | null, pattern)) return false;
    }
    if (ctx.or) {
      const terms = [...ctx.or.matchAll(/(\w+)\.ilike\.("(?:[^"\\]|\\.)*"|[^,]*)/g)];
      const matched = terms.some(([, column, rawValue]) =>
        ilikeMatch(row[column] as string | null, unquoteFilterValue(rawValue))
      );
      if (!matched) return false;
    }
    return true;
  }

  private executeLeads(ctx: QueryContext) {
    if (ctx.op === "select") {
      return {
        data: this.leads.filter((row) =>
          this.matchesFilters(row as unknown as Record<string, unknown>, ctx)
        ),
        error: null,
      };
    }

    if (ctx.op === "insert") {
      const rows = (Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload]) as Array<
        Partial<FakeLead>
      >;

      // unique index PARCIAL (tenant_id, apollo_id) WHERE apollo_id IS NOT NULL.
      // Um insert que viola derruba o LOTE INTEIRO (nada e gravado).
      const seenInBatch = new Set<string>();
      for (const row of rows) {
        if (!row.apollo_id) continue;
        const key = `${row.tenant_id}::${row.apollo_id}`;
        const clashes =
          seenInBatch.has(key) ||
          this.leads.some(
            (existing) =>
              existing.tenant_id === row.tenant_id && existing.apollo_id === row.apollo_id
          );
        if (clashes) {
          return {
            data: null,
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "idx_leads_tenant_apollo_unique"',
            },
          };
        }
        seenInBatch.add(key);
      }

      // NOT NULL violado: o supabase-js RETORNA `{ data: null, error }`, nunca lanca. Um
      // fake que lancasse deixaria a excecao escapar por cima do contrato de falha parcial
      // do helper — exatamente o caminho que estes testes existem para vigiar.
      if (rows.some((row) => typeof row.first_name !== "string")) {
        return {
          data: null,
          error: {
            code: "23502",
            message: 'null value in column "first_name" violates not-null constraint',
          },
        };
      }

      const inserted = rows.map((row) => {
        const lead: FakeLead = {
          id: this.nextId("lead"),
          tenant_id: row.tenant_id as string,
          apollo_id: row.apollo_id ?? null,
          first_name: row.first_name as string,
          last_name: row.last_name ?? null,
          email: row.email ?? null,
          company_name: row.company_name ?? null,
          title: row.title ?? null,
          linkedin_url: row.linkedin_url ?? null,
          status: row.status ?? "novo",
          icebreaker: row.icebreaker ?? null,
          icebreaker_generated_at: row.icebreaker_generated_at ?? null,
        };
        this.leads.push(lead);
        return lead;
      });

      return { data: inserted, error: null };
    }

    // update
    const patch = ctx.payload as Partial<FakeLead>;
    const affected = this.leads.filter((row) =>
      this.matchesFilters(row as unknown as Record<string, unknown>, ctx)
    );
    for (const row of affected) Object.assign(row, patch);
    return { data: affected, error: null };
  }

  private executeSegments(ctx: QueryContext) {
    if (ctx.op === "select") {
      return {
        data: this.segments.filter((row) =>
          this.matchesFilters(row as unknown as Record<string, unknown>, ctx)
        ),
        error: null,
      };
    }

    if (ctx.op === "insert") {
      const row = ctx.payload as { tenant_id: string; name: string };
      // unique_segment_name_per_tenant e CASE-SENSITIVE no Postgres.
      const clash = this.segments.some(
        (existing) => existing.tenant_id === row.tenant_id && existing.name === row.name
      );
      if (clash) {
        return {
          data: null,
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "unique_segment_name_per_tenant"',
          },
        };
      }
      if (row.name.length > 100) {
        return { data: null, error: { code: "22001", message: "value too long for type character varying(100)" } };
      }
      const segment: FakeSegment = { id: this.nextId("segment"), tenant_id: row.tenant_id, name: row.name };
      this.segments.push(segment);
      return { data: [segment], error: null };
    }

    return { data: null, error: null };
  }

  private executeAssociations(ctx: QueryContext) {
    if (ctx.op === "select") {
      return {
        data: this.associations.filter((row) =>
          this.matchesFilters(row as unknown as Record<string, unknown>, ctx)
        ),
        error: null,
      };
    }

    if (ctx.op === "insert") {
      const rows = (Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload]) as FakeAssociation[];
      const seen = new Set<string>();
      for (const row of rows) {
        const key = `${row.segment_id}::${row.lead_id}`;
        const clashes =
          seen.has(key) ||
          this.associations.some(
            (existing) => existing.segment_id === row.segment_id && existing.lead_id === row.lead_id
          );
        if (clashes) {
          return {
            data: null,
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "unique_lead_per_segment"',
            },
          };
        }
        seen.add(key);
      }
      this.associations.push(...rows.map((row) => ({ ...row })));
      return { data: rows, error: null };
    }

    return { data: null, error: null };
  }

  /**
   * Story 22.16: `campaigns`.
   *
   * O que este executor codifica e o CONTRATO MINIMO da linha que os leitores do produto
   * exigem — e por isso ele recusa o que o Postgres recusaria em vez de aceitar em
   * silencio: `name` NOT NULL e VARCHAR(200) (22001) e `status` dentro do ENUM
   * `campaign_status` (22P02). Um fake permissivo aqui certificaria como verde um insert
   * que na producao derrubaria a linha inteira — a campanha simplesmente nao apareceria.
   */
  private executeCampaigns(ctx: QueryContext) {
    if (ctx.op === "select") {
      return {
        data: this.campaigns.filter((row) =>
          this.matchesFilters(row as unknown as Record<string, unknown>, ctx)
        ),
        error: null,
      };
    }

    if (ctx.op === "insert") {
      const rows = (Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload]) as Array<
        Partial<FakeCampaign>
      >;

      for (const row of rows) {
        if (typeof row.name !== "string" || row.name === "") {
          return {
            data: null,
            error: { code: "23502", message: 'null value in column "name" violates not-null constraint' },
          };
        }
        // VARCHAR(200) conta CARACTERES (code points), nao unidades UTF-16.
        if ([...row.name].length > CAMPAIGN_NAME_MAX) {
          return {
            data: null,
            error: { code: "22001", message: "value too long for type character varying(200)" },
          };
        }
        if (row.status !== undefined && !CAMPAIGN_STATUSES.has(row.status)) {
          return {
            data: null,
            error: { code: "22P02", message: `invalid input value for enum campaign_status: "${row.status}"` },
          };
        }
        if (!row.tenant_id) {
          return {
            data: null,
            error: { code: "23502", message: 'null value in column "tenant_id" violates not-null constraint' },
          };
        }
      }

      const inserted = rows.map((row) => this.seedCampaign(row));
      return { data: inserted, error: null };
    }

    if (ctx.op === "update") {
      const patch = ctx.payload as Partial<FakeCampaign>;

      if (typeof patch.name === "string" && [...patch.name].length > CAMPAIGN_NAME_MAX) {
        return {
          data: null,
          error: { code: "22001", message: "value too long for type character varying(200)" },
        };
      }
      if (patch.status !== undefined && !CAMPAIGN_STATUSES.has(patch.status)) {
        return {
          data: null,
          error: { code: "22P02", message: `invalid input value for enum campaign_status: "${patch.status}"` },
        };
      }

      const affected = this.campaigns.filter((row) =>
        this.matchesFilters(row as unknown as Record<string, unknown>, ctx)
      );
      for (const row of affected) {
        Object.assign(row, patch);
        // trigger update_campaigns_updated_at
        row.updated_at = new Date().toISOString();
      }
      return { data: affected, error: null };
    }

    return { data: null, error: null };
  }

  /**
   * Story 22.16: `campaign_leads`, com `unique_lead_per_campaign` de verdade.
   *
   * O `.upsert(..., { onConflict: "campaign_id,lead_id", ignoreDuplicates: true })` do
   * builder vira `ON CONFLICT (campaign_id, lead_id) DO NOTHING`: NAO erra e devolve SO as
   * linhas realmente inseridas — por isso a segunda execucao com os mesmos pares devolve
   * `[]`. Sem `ignoreDuplicates` o conflito volta como `23505` (seja porque o alvo do
   * upsert cai na PK `id`, que nao cobre a unique, seja porque nao pedimos DO NOTHING);
   * e a tripwire que denuncia um upsert montado errado.
   *
   * As duas FOREIGN KEYs tambem valem aqui (23503): sem elas o fake aceita associacao
   * contra campanha ou lead inexistente, e um teste "verde" descreve uma escrita que a
   * producao recusa inteira.
   */
  private executeCampaignLeads(ctx: QueryContext) {
    if (ctx.op === "select") {
      return {
        data: this.campaignLeads.filter((row) =>
          this.matchesFilters(row as unknown as Record<string, unknown>, ctx)
        ),
        error: null,
      };
    }

    if (ctx.op === "insert" || ctx.op === "upsert") {
      const rows = (Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload]) as Array<{
        campaign_id: string;
        lead_id: string;
      }>;

      // O `on_conflict` do PostgREST tem que nomear uma constraint que EXISTE. Um alvo
      // errado (`"id"`, ou com espaco depois da virgula) volta como `42P10` e derruba a
      // associacao inteira em producao — sem esta checagem o fake aceitaria qualquer
      // string e o erro so apareceria no banco real.
      const onConflict = ctx.upsertOptions?.onConflict;
      if (ctx.op === "upsert" && onConflict !== undefined && onConflict !== "campaign_id,lead_id") {
        return {
          data: null,
          error: {
            code: "42P10",
            message: `there is no unique or exclusion constraint matching the ON CONFLICT specification (${onConflict})`,
          },
        };
      }

      // `campaign_leads.campaign_id` e `lead_id` sao FOREIGN KEY (migration 00016). Um
      // fake que aceitasse qualquer string aqui certificaria como verde uma associacao
      // contra uma campanha que nao existe — exatamente o caminho em que a Fase 1 falha
      // ao atualizar, adota o `existingCampaignId` mesmo assim e segue associando. No
      // Postgres esse lote inteiro volta 23503.
      for (const row of rows) {
        if (!this.campaigns.some((campaign) => campaign.id === row.campaign_id)) {
          return {
            data: null,
            error: {
              code: "23503",
              message:
                'insert or update on table "campaign_leads" violates foreign key constraint "campaign_leads_campaign_id_fkey"',
            },
          };
        }
        if (!this.leads.some((lead) => lead.id === row.lead_id)) {
          return {
            data: null,
            error: {
              code: "23503",
              message:
                'insert or update on table "campaign_leads" violates foreign key constraint "campaign_leads_lead_id_fkey"',
            },
          };
        }
      }

      const ignoreDuplicates =
        ctx.op === "upsert" && ctx.upsertOptions?.ignoreDuplicates === true;

      const seen = new Set<string>();
      const toInsert: Array<{ campaign_id: string; lead_id: string }> = [];

      for (const row of rows) {
        const key = `${row.campaign_id}::${row.lead_id}`;
        const clashes =
          seen.has(key) ||
          this.campaignLeads.some(
            (existing) =>
              existing.campaign_id === row.campaign_id && existing.lead_id === row.lead_id
          );

        if (clashes) {
          if (!ignoreDuplicates) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "unique_lead_per_campaign"',
              },
            };
          }
          continue; // DO NOTHING: nem insere, nem entra no RETURNING
        }

        seen.add(key);
        toInsert.push(row);
      }

      const now = new Date().toISOString();
      const inserted = toInsert.map((row) => {
        const created: FakeCampaignLead = {
          id: this.nextId("campaign-lead"),
          campaign_id: row.campaign_id,
          lead_id: row.lead_id,
          added_at: now,
        };
        this.campaignLeads.push(created);
        return created;
      });

      return { data: inserted, error: null };
    }

    return { data: null, error: null };
  }
}

export function createFakeSupabase(db: FakeDb): SupabaseClient {
  const from = (table: string) => {
    const ctx: QueryContext = {
      table,
      op: "select",
      eq: [],
      in: [],
      ilike: [],
      or: null,
      returning: false,
    };
    // `single()` e `maybeSingle()` NAO sao a mesma coisa no PostgREST, e tratar as duas
    // como "primeira linha ou null" e exatamente o tipo de premissa errada que a 22.15
    // pagou caro: `.single()` com ZERO linhas devolve o ERRO `PGRST116`, enquanto
    // `.maybeSingle()` devolve `{ data: null, error: null }`. Codigo que ramifica em
    // `if (error)` antes de `if (!data)` toma caminhos diferentes nos dois casos.
    let single = false;
    let tolerateEmpty = false;

    const run = () => {
      const result = db.execute(ctx);
      if (!single) return result;
      if (result.error) return result;
      const rows = (result.data ?? []) as unknown[];
      if (rows.length === 0 && !tolerateEmpty) {
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: "The result contains 0 rows",
          },
        };
      }
      return { data: rows[0] ?? null, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => {
        ctx.returning = true;
        return builder;
      },
      insert: (payload: unknown) => {
        ctx.op = "insert";
        ctx.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        ctx.op = "update";
        ctx.payload = payload;
        return builder;
      },
      upsert: (
        payload: unknown,
        options?: { onConflict?: string; ignoreDuplicates?: boolean }
      ) => {
        ctx.op = "upsert";
        ctx.payload = payload;
        ctx.upsertOptions = options;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        ctx.eq.push([column, value]);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        ctx.in.push([column, values]);
        return builder;
      },
      ilike: (column: string, pattern: string) => {
        ctx.ilike.push([column, pattern]);
        return builder;
      },
      or: (filter: string) => {
        ctx.or = filter;
        return builder;
      },
      single: () => {
        single = true;
        return builder;
      },
      maybeSingle: () => {
        single = true;
        tolerateEmpty = true;
        return builder;
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve()
          .then(() => run())
          .then(resolve, reject),
    };

    return builder;
  };

  return { from } as unknown as SupabaseClient;
}
