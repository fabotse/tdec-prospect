// @vitest-environment node
/**
 * Tests for migration 00075_create_known_contacts.sql
 * Story 25.1 - Contatos conhecidos
 *
 * Executa o SQL real num Postgres em WASM (PGlite), sobre stubs mínimos do schema do
 * Supabase (auth.uid, tenants, profiles, leads, is_admin/get_current_tenant_id,
 * update_updated_at_column).
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
const LEAD = "20000000-0000-0000-0000-000000000001";

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
CREATE TABLE public.leads (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id)
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

CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

GRANT USAGE ON SCHEMA public TO authenticated;
`;

function loadMigration(): string {
  return readFileSync(
    resolve(__dirname, "../../../supabase/migrations/00075_create_known_contacts.sql"),
    "utf-8"
  );
}

describe("Migration 00075: known_contacts (PGlite)", () => {
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

  async function insert(
    tenant: string,
    fields: Partial<{
      full_name: string;
      company_name: string | null;
      company_domain: string | null;
      linkedin_url: string | null;
      relation_type: string;
      source: string;
      lead_id: string | null;
      created_by: string | null;
    }> = {}
  ) {
    const f = {
      full_name: "João Silva",
      company_name: "Acme",
      company_domain: null,
      linkedin_url: null,
      relation_type: "cliente_atual",
      source: "manual",
      lead_id: null,
      created_by: null,
      ...fields,
    };
    await db.query(
      `INSERT INTO public.known_contacts
         (tenant_id, full_name, company_name, company_domain, linkedin_url, relation_type, source, lead_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenant,
        f.full_name,
        f.company_name,
        f.company_domain,
        f.linkedin_url,
        f.relation_type,
        f.source,
        f.lead_id,
        f.created_by,
      ]
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
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.known_contacts TO authenticated;"
    );
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec(`
      TRUNCATE public.known_contacts, public.leads, public.profiles, public.tenants CASCADE;
      INSERT INTO public.tenants (id, name) VALUES ('${T1}', 'Cliente'), ('${T2}', 'Outro');
      INSERT INTO public.profiles (id, tenant_id, role) VALUES
        ('${GESTOR}', '${T1}', 'gestor'),
        ('${SDR}', '${T1}', 'sdr'),
        ('${DIRETOR}', '${T1}', 'diretor'),
        ('${GESTOR_T2}', '${T2}', 'gestor');
      INSERT INTO public.leads (id, tenant_id) VALUES ('${LEAD}', '${T1}');
    `);
  });

  describe("texto da migration", () => {
    it("é só aditiva: sem DROP de tabela/coluna, ALTER de objeto existente, UPDATE/DELETE", () => {
      expect(code).not.toMatch(/DROP\s+TABLE/i);
      expect(code).not.toMatch(/DROP\s+COLUMN/i);
      expect(code).not.toMatch(/DROP\s+FUNCTION/i);
      expect(code).not.toMatch(/^\s*UPDATE\s/im);
      expect(code).not.toMatch(/^\s*DELETE\s/im);
      expect(code).not.toMatch(/cron\./i);
      expect(code).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
      const alters = code.match(/ALTER\s+TABLE\s+[\w.]+/gi) ?? [];
      expect(alters.every((a) => /known_contacts$/i.test(a))).toBe(true);
      const drops = code.match(/DROP\s+(POLICY|TRIGGER)\s+IF\s+EXISTS\s+[^;]+ON\s+[\w.]+/gi) ?? [];
      expect(drops.length).toBeGreaterThan(0);
      expect(drops.every((d) => /public\.known_contacts$/i.test(d))).toBe(true);
    });

    it("tem cabeçalho de OK do Fabossi, pre-check, impacto e rollback", () => {
      expect(migration).toContain("NÃO APLICAR sem o OK do Fabossi");
      expect(migration).toContain("PRE-CHECK");
      expect(migration).toContain("IMPACTO");
      expect(migration).toContain("ROLLBACK");
    });
  });

  describe("constraints", () => {
    it("aceita as 4 relações e as 3 origens", async () => {
      await insert(T1, { relation_type: "cliente_atual", source: "manual" });
      await insert(T1, { relation_type: "ex_cliente", source: "import_csv" });
      await insert(T1, { relation_type: "parceiro" });
      await insert(T1, { relation_type: "reuniao_marcada", source: "oportunidade", lead_id: LEAD });
      expect(await count("SELECT count(*) FROM public.known_contacts")).toBe(4);
    });

    it.each([
      ["relation_type", { relation_type: "cliente" }],
      ["source", { source: "api" }],
      ["full_name vazio", { full_name: "   " }],
      ["sem empresa e sem domínio", { company_name: null, company_domain: null }],
    ])("rejeita %s", async (_label, fields) => {
      await expect(insert(T1, fields)).rejects.toThrow();
    });

    it("aceita só domínio, sem nome da empresa", async () => {
      await insert(T1, { company_name: null, company_domain: "acme.com" });
      expect(await count("SELECT count(*) FROM public.known_contacts")).toBe(1);
    });

    it("LinkedIn único por tenant; vários sem LinkedIn; mesmo LinkedIn em outro tenant", async () => {
      const url = "https://www.linkedin.com/in/joao";
      await insert(T1, { linkedin_url: url });
      await expect(insert(T1, { linkedin_url: url })).rejects.toThrow();
      await insert(T1);
      await insert(T1);
      await insert(T2, { linkedin_url: url });
      expect(await count("SELECT count(*) FROM public.known_contacts")).toBe(4);
    });

    it("lead único por tenant", async () => {
      await insert(T1, { lead_id: LEAD, source: "oportunidade", relation_type: "reuniao_marcada" });
      await expect(insert(T1, { lead_id: LEAD })).rejects.toThrow();
    });

    it("lead_id e created_by viram NULL quando o lead/perfil é removido", async () => {
      await insert(T1, { lead_id: LEAD, created_by: GESTOR });
      await db.query("DELETE FROM public.leads WHERE id = $1", [LEAD]);
      await db.query("DELETE FROM public.profiles WHERE id = $1", [GESTOR]);
      expect(
        await count(
          "SELECT count(*) FROM public.known_contacts WHERE lead_id IS NULL AND created_by IS NULL"
        )
      ).toBe(1);
    });

    it("source default é manual", async () => {
      await db.query(
        `INSERT INTO public.known_contacts (tenant_id, full_name, company_name, relation_type)
         VALUES ($1, 'A', 'B', 'parceiro')`,
        [T1]
      );
      const res = await db.query<{ source: string }>("SELECT source FROM public.known_contacts");
      expect(res.rows[0].source).toBe("manual");
    });

    it("trigger atualiza updated_at no UPDATE", async () => {
      await insert(T1);
      const before = await db.query<{ updated_at: Date }>(
        "SELECT updated_at FROM public.known_contacts"
      );
      await new Promise((r) => setTimeout(r, 5));
      await db.query("UPDATE public.known_contacts SET title = 'CTO'");
      const after = await db.query<{ updated_at: Date }>(
        "SELECT updated_at FROM public.known_contacts"
      );
      expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
        new Date(before.rows[0].updated_at).getTime()
      );
    });
  });

  describe("RLS", () => {
    beforeEach(async () => {
      await insert(T1, { full_name: "t1" });
      await insert(T2, { full_name: "t2" });
    });

    it("SDR lê os contatos do próprio tenant", async () => {
      await asUser(SDR, async () => {
        const res = await db.query<{ full_name: string }>(
          "SELECT full_name FROM public.known_contacts"
        );
        expect(res.rows.map((r) => r.full_name)).toEqual(["t1"]);
      });
    });

    it("SDR não insere, não edita e não remove", async () => {
      await asUser(SDR, async () => {
        await expect(
          db.query(
            `INSERT INTO public.known_contacts (tenant_id, full_name, company_name, relation_type)
             VALUES ($1, 'novo', 'X', 'parceiro')`,
            [T1]
          )
        ).rejects.toThrow();
        await db.query("UPDATE public.known_contacts SET title = 'hack'");
        await db.query("DELETE FROM public.known_contacts");
      });
      expect(await count("SELECT count(*) FROM public.known_contacts")).toBe(2);
      expect(
        await count("SELECT count(*) FROM public.known_contacts WHERE title = 'hack'")
      ).toBe(0);
    });

    it.each([
      ["gestor", GESTOR],
      ["diretor", DIRETOR],
    ])("%s insere, edita e remove no próprio tenant", async (_role, uid) => {
      await asUser(uid, async () => {
        await db.query(
          `INSERT INTO public.known_contacts (tenant_id, full_name, company_name, relation_type)
           VALUES ($1, 'novo', 'X', 'parceiro')`,
          [T1]
        );
        await db.query("UPDATE public.known_contacts SET title = 'CTO' WHERE full_name = 'novo'");
        await db.query("DELETE FROM public.known_contacts WHERE full_name = 't1'");
      });
      const res = await db.query<{ full_name: string; title: string | null }>(
        "SELECT full_name, title FROM public.known_contacts ORDER BY full_name"
      );
      expect(res.rows).toEqual([
        { full_name: "novo", title: "CTO" },
        { full_name: "t2", title: null },
      ]);
    });

    it("isolamento: gestor não lê, não insere, não edita e não remove no outro tenant", async () => {
      await asUser(GESTOR, async () => {
        const res = await db.query<{ full_name: string }>(
          "SELECT full_name FROM public.known_contacts"
        );
        expect(res.rows.map((r) => r.full_name)).toEqual(["t1"]);
        await expect(
          db.query(
            `INSERT INTO public.known_contacts (tenant_id, full_name, company_name, relation_type)
             VALUES ($1, 'invasor', 'X', 'parceiro')`,
            [T2]
          )
        ).rejects.toThrow();
        await db.query("UPDATE public.known_contacts SET title = 'hack' WHERE full_name = 't2'");
        await db.query("DELETE FROM public.known_contacts WHERE full_name = 't2'");
        // Mover a própria linha para outro tenant também é barrado (WITH CHECK).
        await expect(
          db.query(`UPDATE public.known_contacts SET tenant_id = $1 WHERE full_name = 't1'`, [T2])
        ).rejects.toThrow();
      });
      expect(
        await count(
          "SELECT count(*) FROM public.known_contacts WHERE full_name = 't2' AND title IS NULL"
        )
      ).toBe(1);
    });
  });
});
