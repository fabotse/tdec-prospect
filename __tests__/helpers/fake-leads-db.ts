/**
 * Fake in-memory de `leads` / `segments` / `lead_segments` (Story 22.15)
 *
 * Compartilhado por `lead-persistence.test.ts` (unidade do helper) e por
 * `create-campaign-step.test.ts` (a costura step -> helper roda contra ELE, nao contra um
 * mock do helper — sem isso nenhum teste exercita os dois juntos).
 *
 * O que este fake reproduz do Postgres, e que um chain-builder generico nao reproduz:
 * - os unique indexes LANCAM `23505` (leads por (tenant_id, apollo_id) PARCIAL, segmentos
 *   por (tenant_id, name) CASE-SENSITIVE, lead_segments por (segment_id, lead_id));
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

export interface QueryContext {
  table: string;
  op: "select" | "insert" | "update";
  payload?: unknown;
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

export class FakeDb {
  leads: FakeLead[] = [];
  segments: FakeSegment[] = [];
  associations: FakeAssociation[] = [];
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
    });

    const injected = this.takeFailure(ctx);
    if (injected) return { data: null, error: injected };

    if (ctx.table === "leads") return this.executeLeads(ctx);
    if (ctx.table === "segments") return this.executeSegments(ctx);
    if (ctx.table === "lead_segments") return this.executeAssociations(ctx);
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
      // Valor citado tambem no filtro simples: o PostgREST le a `"` inicial como abertura
      // de valor citado em QUALQUER filtro, nao so dentro de `or=(...)`.
      if (!ilikeMatch(row[column] as string | null, unquoteFilterValue(pattern))) return false;
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
}

export function createFakeSupabase(db: FakeDb): SupabaseClient {
  const from = (table: string) => {
    const ctx: QueryContext = { table, op: "select", eq: [], in: [], ilike: [], or: null };
    let single = false;

    const run = () => {
      const result = db.execute(ctx);
      if (!single) return result;
      if (result.error) return result;
      const rows = (result.data ?? []) as unknown[];
      return { data: rows[0] ?? null, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
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
