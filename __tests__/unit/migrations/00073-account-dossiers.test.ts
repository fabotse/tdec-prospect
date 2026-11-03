// @vitest-environment node
/**
 * Tests for migration 00073_create_account_dossiers.sql
 * Story 24.19 - Dossiê da conta
 *
 * 1) Leitura do SQL: só aditiva, RLS nas 3 tabelas, `treg` nos dois CHECKs com a lista
 *    anterior preservada.
 * 2) PGlite: o SQL aplica (2x, idempotente) sobre stubs mínimos e as regras valem.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { PGlite } from "@electric-sql/pglite";

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const SDR = "10000000-0000-0000-0000-000000000002";
const SDR_T2 = "10000000-0000-0000-0000-000000000004";

const PREVIOUS_SERVICES = [
  "apollo",
  "signalhire",
  "snovio",
  "instantly",
  "openai",
  "apify",
  "zapi",
  "theirstack",
];

const STUBS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TABLE public.tenants (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants(id), role text NOT NULL);
CREATE TABLE public.agent_executions (id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants(id));
CREATE TABLE public.leads (id uuid PRIMARY KEY, tenant_id uuid REFERENCES public.tenants(id));
CREATE TABLE public.api_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  service_name text NOT NULL,
  CONSTRAINT api_configs_service_name_check CHECK (service_name IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack'))
);
CREATE TABLE public.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  service_name text NOT NULL,
  CONSTRAINT api_usage_logs_service_name_check CHECK (service_name IN ('apollo','signalhire','snovio','instantly','openai','apify','zapi','theirstack'))
);

CREATE FUNCTION public.get_current_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT USAGE ON SCHEMA public TO authenticated;

INSERT INTO public.tenants (id, name) VALUES ('${T1}', 'Cliente'), ('${T2}', 'Outro');
INSERT INTO public.profiles (id, tenant_id, role) VALUES ('${SDR}', '${T1}', 'sdr'), ('${SDR_T2}', '${T2}', 'sdr');
INSERT INTO public.api_configs (tenant_id, service_name) VALUES ('${T1}', 'apollo'), ('${T1}', 'theirstack');
INSERT INTO public.api_usage_logs (tenant_id, service_name) VALUES ('${T1}', 'openai'), ('${T1}', 'theirstack');
`;

function loadMigration(): string {
  return readFileSync(
    resolve(__dirname, "../../../supabase/migrations/00073_create_account_dossiers.sql"),
    "utf-8"
  );
}

function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("Migration 00073: account_dossiers (texto)", () => {
  const migration = loadMigration();
  const code = stripComments(migration);

  it("é só aditiva: sem DROP TABLE/COLUMN, UPDATE, DELETE, TRUNCATE ou cron", () => {
    expect(code).not.toMatch(/DROP\s+TABLE/i);
    expect(code).not.toMatch(/DROP\s+COLUMN/i);
    expect(code).not.toMatch(/^\s*UPDATE\s/im);
    expect(code).not.toMatch(/^\s*DELETE\s/im);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
    expect(code).not.toMatch(/cron\./i);
  });

  it("os únicos DROP são de CONSTRAINT dos CHECKs de service_name e de POLICY (recriadas)", () => {
    const drops = code.match(/DROP\s+\w+(\s+IF\s+EXISTS)?\s+[\w".]+/gi) ?? [];
    for (const drop of drops) {
      expect(drop).toMatch(
        /DROP\s+(POLICY|CONSTRAINT)\s+IF\s+EXISTS\s+("|api_configs_service_name_check|api_usage_logs_service_name_check)/i
      );
    }
  });

  it("ALTER TABLE só nas tabelas novas e nos CHECKs de api_configs/api_usage_logs", () => {
    const alters = code.match(/ALTER\s+TABLE\s+[\w.]+/gi) ?? [];
    expect(alters.length).toBeGreaterThan(0);
    for (const alter of alters) {
      expect(alter).toMatch(/(account_dossiers|account_dossier_facts|account_dossier_leads|api_configs|api_usage_logs)$/i);
    }
  });

  it("habilita RLS nas 3 tabelas, com SELECT e INSERT por tenant e sem UPDATE/DELETE", () => {
    for (const table of ["account_dossiers", "account_dossier_facts", "account_dossier_leads"]) {
      expect(code).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
    expect((code.match(/FOR SELECT/g) ?? []).length).toBe(3);
    expect((code.match(/FOR INSERT/g) ?? []).length).toBe(3);
    expect(code).not.toMatch(/FOR\s+(UPDATE|DELETE|ALL)/i);
    expect((code.match(/tenant_id = public\.get_current_tenant_id\(\)/g) ?? []).length).toBe(6);
  });

  it("inclui 'treg' nos dois CHECKs e preserva a lista anterior", () => {
    const checks = code.match(/CHECK \(service_name IN \(([^)]*)\)\)/g) ?? [];
    expect(checks).toHaveLength(2);
    for (const check of checks) {
      expect(check).toContain("'treg'");
      for (const service of PREVIOUS_SERVICES) expect(check).toContain(`'${service}'`);
    }
    expect(code).toContain("ADD CONSTRAINT api_configs_service_name_check");
    expect(code).toContain("ADD CONSTRAINT api_usage_logs_service_name_check");
  });

  it("tem cabeçalho de OK do Fabossi, pre-check, impacto e rollback", () => {
    expect(migration).toContain("NÃO APLICAR sem o OK do Fabossi");
    expect(migration).toContain("PRE-CHECK");
    expect(migration).toContain("IMPACTO");
    expect(migration).toContain("ROLLBACK");
  });
});

describe("Migration 00073: account_dossiers (PGlite)", () => {
  let db: PGlite;

  async function asUser(uid: string, fn: () => Promise<void>) {
    await db.exec(`SET test.uid = '${uid}'; SET ROLE authenticated;`);
    try {
      await fn();
    } finally {
      await db.exec("RESET ROLE; RESET test.uid;");
    }
  }

  beforeAll(async () => {
    const migration = loadMigration();
    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(migration);
    await db.exec(migration); // idempotente
    await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_dossiers, public.account_dossier_facts, public.account_dossier_leads TO authenticated;`);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("aceita 'treg' em api_configs e api_usage_logs sem tocar nas linhas existentes", async () => {
    await db.exec(`INSERT INTO public.api_configs (tenant_id, service_name) VALUES ('${T1}', 'treg');`);
    await db.exec(`INSERT INTO public.api_usage_logs (tenant_id, service_name) VALUES ('${T1}', 'treg');`);
    const configs = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.api_configs");
    const logs = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.api_usage_logs");
    expect(configs.rows[0].n).toBe(3);
    expect(logs.rows[0].n).toBe(3);
    await expect(
      db.exec(`INSERT INTO public.api_configs (tenant_id, service_name) VALUES ('${T1}', 'nope');`)
    ).rejects.toThrow();
  });

  it("SDR grava dossiê, fato e lead do próprio tenant e não vê os de outro tenant", async () => {
    let dossierId = "";
    await asUser(SDR, async () => {
      const res = await db.query<{ id: string }>(
        `INSERT INTO public.account_dossiers (tenant_id, company_domain, company_name, status, expires_at)
         VALUES ($1, 'bancox.com.br', 'Banco X', 'complete', now() + interval '30 days') RETURNING id`,
        [T1]
      );
      dossierId = res.rows[0].id;
      await db.query(
        `INSERT INTO public.account_dossier_facts (dossier_id, tenant_id, kind, fato, fonte_url, data, confianca)
         VALUES ($1, $2, 'news', 'Banco X anuncia novo CISO', 'https://valor.com.br/x', '2026-10-01', 'alta')`,
        [dossierId, T1]
      );
      await db.query(
        `INSERT INTO public.account_dossier_leads (dossier_id, tenant_id, lead_apollo_id) VALUES ($1, $2, 'ap-1')`,
        [dossierId, T1]
      );
    });

    await asUser(SDR_T2, async () => {
      const res = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.account_dossiers");
      expect(res.rows[0].n).toBe(0);
      await expect(
        db.query(
          `INSERT INTO public.account_dossiers (tenant_id, company_domain, status, expires_at)
           VALUES ($1, 'x.com', 'empty', now())`,
          [T1]
        )
      ).rejects.toThrow();
    });

    await asUser(SDR, async () => {
      const res = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.account_dossier_facts");
      expect(res.rows[0].n).toBe(1);
      // Sem policy de UPDATE/DELETE: nada é alterado.
      await db.exec(`UPDATE public.account_dossiers SET status = 'empty'`);
      await db.exec(`DELETE FROM public.account_dossier_facts`);
      const still = await db.query<{ status: string }>("SELECT status FROM public.account_dossiers");
      expect(still.rows[0].status).toBe("complete");
      const facts = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.account_dossier_facts");
      expect(facts.rows[0].n).toBe(1);
    });
  });

  it("recusa fato sem fonte http(s), vazio, com confiança/kind inválidos e lead sem identificador", async () => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO public.account_dossiers (tenant_id, company_domain, status, expires_at)
       VALUES ($1, 'y.com', 'partial', now()) RETURNING id`,
      [T1]
    );
    const id = res.rows[0].id;
    const insertFact = (kind: string, fato: string, url: string, conf: string) =>
      db.query(
        `INSERT INTO public.account_dossier_facts (dossier_id, tenant_id, kind, fato, fonte_url, data, confianca)
         VALUES ($1, $2, $3, $4, $5, '2026-10-01', $6)`,
        [id, T1, kind, fato, url, conf]
      );
    await expect(insertFact("news", "ok", "ftp://x", "alta")).rejects.toThrow();
    await expect(insertFact("news", "   ", "https://x.com", "alta")).rejects.toThrow();
    await expect(insertFact("news", "ok", "https://x.com", "certa")).rejects.toThrow();
    await expect(insertFact("rumor", "ok", "https://x.com", "alta")).rejects.toThrow();
    await expect(insertFact("site", "ok", "https://x.com", "alta")).resolves.toBeDefined();
    await expect(
      db.query(`INSERT INTO public.account_dossier_leads (dossier_id, tenant_id) VALUES ($1, $2)`, [id, T1])
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO public.account_dossiers (tenant_id, company_domain, status, expires_at) VALUES ($1, 'z.com', 'bom', now())`,
        [T1]
      )
    ).rejects.toThrow();
  });
});

// ==============================================
// Revisao Codex #4: o ROLLBACK restaura EXATAMENTE a lista de producao nas duas tabelas
// ==============================================

/** SQL do bloco ROLLBACK do cabecalho (linhas `--   ...`, sem os comentarios internos). */
function rollbackSql(migration: string): string {
  const lines = migration.split("\n");
  const start = lines.findIndex((l) => l.startsWith("-- ROLLBACK"));
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("--   ")) break;
    const sql = line.slice("--   ".length);
    if (sql.trim().startsWith("--")) continue;
    out.push(sql);
  }
  return out.join("\n");
}

function checkLists(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /ADD CONSTRAINT (\w+)\s+CHECK \(service_name IN \(([^)]*)\)\)/g;
  for (const match of sql.matchAll(re)) {
    out[match[1]] = match[2].split(",").map((s) => s.trim().replace(/'/g, ""));
  }
  return out;
}

describe("Migration 00073: rollback dos CHECKs (revisao Codex)", () => {
  const PROD = [...PREVIOUS_SERVICES].sort();

  it("o rollback do cabecalho restaura a lista de producao (com zapi) nas duas tabelas", () => {
    const lists = checkLists(rollbackSql(loadMigration()));
    expect([...lists.api_configs_service_name_check].sort()).toEqual(PROD);
    expect([...lists.api_usage_logs_service_name_check].sort()).toEqual(PROD);
  });

  it("o rollback das Completion Notes da spec e o mesmo", () => {
    const spec = readFileSync(
      resolve(__dirname, "../../../_bmad-output/implementation-artifacts/spec-24-19-dossie-da-conta.md"),
      "utf-8"
    );
    const block = spec.slice(spec.indexOf("**Rollback da 00073:**"));
    const lists = checkLists(block.slice(0, block.indexOf("```", block.indexOf("```") + 3)));
    expect([...lists.api_configs_service_name_check].sort()).toEqual(PROD);
    expect([...lists.api_usage_logs_service_name_check].sort()).toEqual(PROD);
  });

  it("PGlite: migration + rollback volta ao estado de producao (zapi aceito, treg recusado)", async () => {
    const migration = loadMigration();
    const db = new PGlite();
    try {
      await db.exec(STUBS);
      await db.exec(migration);
      await db.exec(rollbackSql(migration));
      for (const table of ["api_configs", "api_usage_logs"]) {
        for (const service of PREVIOUS_SERVICES) {
          await db.exec(`INSERT INTO public.${table} (tenant_id, service_name) VALUES ('${T1}', '${service}');`);
        }
        await expect(
          db.exec(`INSERT INTO public.${table} (tenant_id, service_name) VALUES ('${T1}', 'treg');`)
        ).rejects.toThrow();
      }
      const tables = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pg_tables WHERE tablename LIKE 'account_dossier%'"
      );
      expect(tables.rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  }, 60_000);
});
