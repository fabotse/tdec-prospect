// @vitest-environment node
/**
 * Tests for migration 00071_create_suppression_entries.sql
 * Story 23.5 - Lista de supressão: cadastro e import
 *
 * Executa o SQL real num Postgres em WASM (PGlite), sobre stubs mínimos do schema do
 * Supabase (auth.uid, tenants, profiles, is_admin/get_current_tenant_id).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { PGlite } from "@electric-sql/pglite";

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const GESTOR = "10000000-0000-0000-0000-000000000001";
const SDR = "10000000-0000-0000-0000-000000000002";
const DIRETOR = "10000000-0000-0000-0000-000000000003";
const GESTOR_T2 = "10000000-0000-0000-0000-000000000004";

const STUBS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TABLE public.tenants (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  role text NOT NULL
);

CREATE FUNCTION public.get_current_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE FUNCTION public.is_admin() RETURNS boolean AS $$
BEGIN
  RETURN COALESCE((SELECT role IN ('gestor', 'diretor') FROM public.profiles WHERE id = auth.uid()), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT USAGE ON SCHEMA public TO authenticated;
`;

function loadMigration(): string {
  return readFileSync(
    resolve(__dirname, "../../../supabase/migrations/00071_create_suppression_entries.sql"),
    "utf-8"
  );
}

describe("Migration 00071: suppression_entries (PGlite)", () => {
  let db: PGlite;
  let migration: string;
  let code: string;

  async function count(sql: string): Promise<number> {
    const res = await db.query<{ n: number }>(`SELECT (${sql})::int AS n`);
    return res.rows[0].n;
  }

  async function asUser(uid: string, fn: () => Promise<void>) {
    await db.exec(`SET test.uid = '${uid}'; SET ROLE authenticated;`);
    try {
      await fn();
    } finally {
      await db.exec("RESET ROLE; RESET test.uid;");
    }
  }

  async function insertAsOwner(
    tenant: string,
    value: string,
    type = "domain",
    reason = "cliente",
    source = "manual"
  ) {
    await db.query(
      `INSERT INTO public.suppression_entries (tenant_id, entry_type, value, reason, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant, type, value, reason, source]
    );
  }

  beforeAll(async () => {
    migration = loadMigration();
    code = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(migration);
    // Idempotente: aplicar de novo não quebra.
    await db.exec(migration);
    // No Supabase os default privileges dão isso ao `authenticated`.
    await db.exec(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppression_entries TO authenticated;"
    );
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec(`
      TRUNCATE public.suppression_entries, public.profiles, public.tenants CASCADE;
      INSERT INTO public.tenants (id, name) VALUES ('${T1}', 'Cliente'), ('${T2}', 'Outro');
      INSERT INTO public.profiles (id, tenant_id, role) VALUES
        ('${GESTOR}', '${T1}', 'gestor'),
        ('${SDR}', '${T1}', 'sdr'),
        ('${DIRETOR}', '${T1}', 'diretor'),
        ('${GESTOR_T2}', '${T2}', 'gestor');
    `);
  });

  describe("texto da migration", () => {
    it("é só aditiva: sem DROP de tabela/coluna, ALTER de objeto existente, UPDATE/DELETE", () => {
      expect(code).not.toMatch(/DROP\s+TABLE/i);
      expect(code).not.toMatch(/DROP\s+COLUMN/i);
      expect(code).not.toMatch(/^\s*UPDATE\s/im);
      expect(code).not.toMatch(/^\s*DELETE\s/im);
      expect(code).not.toMatch(/cron\./i);
      const alters = code.match(/ALTER\s+TABLE\s+[\w.]+/gi) ?? [];
      expect(alters.every((a) => /suppression_entries$/i.test(a))).toBe(true);
    });

    it("tem cabeçalho de OK do Fabossi, pre-check e rollback", () => {
      expect(migration).toContain("NÃO APLICAR sem o OK do Fabossi");
      expect(migration).toContain("PRE-CHECK");
      expect(migration).toContain("ROLLBACK");
    });

    it("não cria policy de UPDATE", () => {
      expect(code).not.toMatch(/FOR\s+UPDATE/i);
    });
  });

  describe("constraints", () => {
    it("aceita os valores válidos, inclusive source opt_out_automatico", async () => {
      await insertAsOwner(T1, "empresa.com.br", "domain", "cliente", "manual");
      await insertAsOwner(T1, "joao@empresa.com", "email", "opt_out", "import_csv");
      await insertAsOwner(T1, "x.com", "domain", "negociacao", "opt_out_automatico");
      await insertAsOwner(T1, "y.com", "domain", "concorrente");
      await insertAsOwner(T1, "z.com", "domain", "parceiro");
      expect(await count("SELECT count(*) FROM public.suppression_entries")).toBe(5);
    });

    it.each([
      ["entry_type", "phone", "cliente", "manual"],
      ["reason", "domain", "outro", "manual"],
      ["source", "domain", "cliente", "api"],
    ])("rejeita %s inválido", async (_col, type, reason, source) => {
      await expect(insertAsOwner(T1, "a.com", type, reason, source)).rejects.toThrow();
    });

    it("unique por (tenant, tipo, valor) e permite o mesmo valor em outro tenant", async () => {
      await insertAsOwner(T1, "empresa.com");
      await expect(insertAsOwner(T1, "empresa.com")).rejects.toThrow();
      await insertAsOwner(T2, "empresa.com");
      expect(await count("SELECT count(*) FROM public.suppression_entries")).toBe(2);
    });

    it("created_by vira NULL quando o perfil é removido", async () => {
      await db.query(
        `INSERT INTO public.suppression_entries (tenant_id, entry_type, value, reason, created_by)
         VALUES ($1, 'domain', 'a.com', 'cliente', $2)`,
        [T1, GESTOR]
      );
      await db.query("DELETE FROM public.profiles WHERE id = $1", [GESTOR]);
      expect(
        await count("SELECT count(*) FROM public.suppression_entries WHERE created_by IS NULL")
      ).toBe(1);
    });

    it("source default é manual", async () => {
      await db.query(
        `INSERT INTO public.suppression_entries (tenant_id, entry_type, value, reason)
         VALUES ($1, 'domain', 'a.com', 'cliente')`,
        [T1]
      );
      const res = await db.query<{ source: string }>(
        "SELECT source FROM public.suppression_entries"
      );
      expect(res.rows[0].source).toBe("manual");
    });
  });

  describe("RLS", () => {
    beforeEach(async () => {
      await insertAsOwner(T1, "t1.com");
      await insertAsOwner(T2, "t2.com");
    });

    it("SDR lê as entradas do próprio tenant", async () => {
      await asUser(SDR, async () => {
        const res = await db.query<{ value: string }>(
          "SELECT value FROM public.suppression_entries"
        );
        expect(res.rows.map((r) => r.value)).toEqual(["t1.com"]);
      });
    });

    it("SDR não insere nem remove", async () => {
      await asUser(SDR, async () => {
        await expect(
          db.query(
            `INSERT INTO public.suppression_entries (tenant_id, entry_type, value, reason)
             VALUES ($1, 'domain', 'novo.com', 'cliente')`,
            [T1]
          )
        ).rejects.toThrow();
        await db.query("DELETE FROM public.suppression_entries");
      });
      expect(await count("SELECT count(*) FROM public.suppression_entries")).toBe(2);
    });

    it.each([
      ["gestor", GESTOR],
      ["diretor", DIRETOR],
    ])("%s insere e remove no próprio tenant", async (_role, uid) => {
      await asUser(uid, async () => {
        await db.query(
          `INSERT INTO public.suppression_entries (tenant_id, entry_type, value, reason)
           VALUES ($1, 'domain', 'novo.com', 'cliente')`,
          [T1]
        );
        await db.query("DELETE FROM public.suppression_entries WHERE value = 't1.com'");
      });
      const res = await db.query<{ value: string }>(
        "SELECT value FROM public.suppression_entries ORDER BY value"
      );
      expect(res.rows.map((r) => r.value)).toEqual(["novo.com", "t2.com"]);
    });

    it("isolamento: gestor não lê, não insere e não remove no outro tenant", async () => {
      await asUser(GESTOR, async () => {
        const res = await db.query<{ value: string }>(
          "SELECT value FROM public.suppression_entries"
        );
        expect(res.rows.map((r) => r.value)).toEqual(["t1.com"]);
        await expect(
          db.query(
            `INSERT INTO public.suppression_entries (tenant_id, entry_type, value, reason)
             VALUES ($1, 'domain', 'invasor.com', 'cliente')`,
            [T2]
          )
        ).rejects.toThrow();
        await db.query("DELETE FROM public.suppression_entries WHERE value = 't2.com'");
      });
      expect(
        await count("SELECT count(*) FROM public.suppression_entries WHERE value = 't2.com'")
      ).toBe(1);
    });

    it("sem UPDATE: nem o gestor edita uma entrada", async () => {
      await asUser(GESTOR, async () => {
        await db.query("UPDATE public.suppression_entries SET reason = 'parceiro'");
      });
      expect(
        await count("SELECT count(*) FROM public.suppression_entries WHERE reason = 'parceiro'")
      ).toBe(0);
    });
  });
});
