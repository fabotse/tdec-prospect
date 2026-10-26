/**
 * Suppression actions tests
 * Story 23.5 - Lista de supressão: cadastro e import
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import {
  getSuppressionEntries,
  addSuppressionEntry,
  removeSuppressionEntry,
  importSuppressionEntries,
} from "@/actions/suppression";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/**
 * Supabase fake: cada chamada de `from()` cria um builder encadeável que, ao ser
 * aguardado (ou em `.single()`), devolve o próximo resultado da fila.
 */
function makeSupabase(results: Result[]) {
  const calls: Array<{ method: string; args: unknown[] }[]> = [];
  const from = vi.fn(() => {
    const log: { method: string; args: unknown[] }[] = [];
    calls.push(log);
    const next = () => {
      const r = results.shift() ?? { data: null, error: null };
      return { data: r.data ?? null, error: r.error ?? null };
    };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "insert", "delete", "eq", "in", "order", "range"]) {
      builder[m] = (...args: unknown[]) => {
        log.push({ method: m, args });
        return builder;
      };
    }
    builder.single = () => Promise.resolve(next());
    builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(next()).then(resolve, reject);
    return builder;
  });
  return { client: { from }, from, calls };
}

const admin = {
  id: "user-1",
  tenant_id: "tenant-1",
  role: "gestor" as const,
  full_name: "Gestor",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
const sdr = { ...admin, role: "sdr" as const };

const ID = "11111111-1111-4111-8111-111111111111";

function useSupabase(results: Result[]) {
  const fake = makeSupabase(results);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

describe("suppression actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("getSuppressionEntries", () => {
    it("requer autenticação", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);
      expect(await getSuppressionEntries()).toEqual({ success: false, error: "Não autenticado" });
    });

    it("SDR lê, filtrando pelo tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const entry = { id: ID, value: "a.com" };
      const fake = useSupabase([{ data: [entry] }]);

      const res = await getSuppressionEntries();

      expect(res).toEqual({ success: true, data: [entry] });
      expect(fake.from).toHaveBeenCalledWith("suppression_entries");
      expect(fake.calls[0]).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
      expect(fake.calls[0]).toContainEqual({ method: "range", args: [0, 999] });
    });

    it("pagina de 1000 em 1000", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` }));
      const page2 = [{ id: "b0" }];
      const fake = useSupabase([{ data: page1 }, { data: page2 }]);

      const res = await getSuppressionEntries();

      expect(res.success && res.data).toHaveLength(1001);
      expect(fake.calls[1]).toContainEqual({ method: "range", args: [1000, 1999] });
    });

    it("tabela ausente devolve erro, sem lançar", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "PGRST205", message: "not found" } }]);

      const res = await getSuppressionEntries();

      expect(res.success).toBe(false);
      expect(!res.success && res.error).toMatch(/ainda não está disponível/);
    });

    it("tabela ausente (42P01) também", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "42P01" } }]);
      const res = await getSuppressionEntries();
      expect(!res.success && res.error).toMatch(/ainda não está disponível/);
    });
  });

  describe("addSuppressionEntry", () => {
    it("SDR não escreve", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const fake = useSupabase([]);

      const res = await addSuppressionEntry({ value: "a.com", reason: "cliente" });

      expect(res).toEqual({ success: false, error: expect.stringMatching(/^Apenas gestores/) });
      expect(fake.from).not.toHaveBeenCalled();
    });

    it("valor inválido não grava", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([]);

      const res = await addSuppressionEntry({ value: "empresa", reason: "cliente" });

      expect(res.success).toBe(false);
      expect(!res.success && res.error).toMatch(/Valor inválido/);
      expect(fake.from).not.toHaveBeenCalled();
    });

    it("motivo inválido não grava", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([]);
      const res = await addSuppressionEntry({ value: "a.com", reason: "outro" as never });
      expect(res).toEqual({ success: false, error: "Motivo inválido" });
    });

    it("gestor grava valor normalizado com source manual", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const entry = { id: ID, value: "empresa.com.br" };
      const fake = useSupabase([{ data: entry }]);

      const res = await addSuppressionEntry({
        value: "https://WWW.Empresa.com.br/contato?x=1",
        reason: "negociacao",
      });

      expect(res).toEqual({ success: true, data: { duplicate: false, entry } });
      expect(fake.calls[0]).toContainEqual({
        method: "insert",
        args: [
          {
            tenant_id: "tenant-1",
            entry_type: "domain",
            value: "empresa.com.br",
            reason: "negociacao",
            source: "manual",
            created_by: "user-1",
          },
        ],
      });
    });

    it("duplicado → { duplicate: true }", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "23505" } }]);

      const res = await addSuppressionEntry({ value: "a.com", reason: "cliente" });

      expect(res).toEqual({ success: true, data: { duplicate: true } });
    });

    it("tabela ausente devolve erro", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "PGRST205" } }]);
      const res = await addSuppressionEntry({ value: "a.com", reason: "cliente" });
      expect(!res.success && res.error).toMatch(/ainda não está disponível/);
    });
  });

  describe("removeSuppressionEntry", () => {
    it("ID inválido", async () => {
      expect(await removeSuppressionEntry("x")).toEqual({ success: false, error: "ID inválido" });
    });

    it("SDR não remove", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const fake = useSupabase([]);
      const res = await removeSuppressionEntry(ID);
      expect(!res.success && res.error).toMatch(/^Apenas gestores/);
      expect(fake.from).not.toHaveBeenCalled();
    });

    it("gestor remove filtrando por id e tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([{}]);

      expect(await removeSuppressionEntry(ID)).toEqual({ success: true });
      expect(fake.calls[0]).toContainEqual({ method: "delete", args: [] });
      expect(fake.calls[0]).toContainEqual({ method: "eq", args: ["id", ID] });
      expect(fake.calls[0]).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
    });
  });

  describe("importSuppressionEntries", () => {
    it("SDR não importa", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const fake = useSupabase([]);
      const res = await importSuppressionEntries([{ line: 2, value: "a.com", reason: "cliente" }]);
      expect(!res.success && res.error).toMatch(/^Apenas gestores/);
      expect(fake.from).not.toHaveBeenCalled();
    });

    it("recusa mais de 5000 linhas e lista vazia", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const rows = Array.from({ length: 5001 }, (_, i) => ({
        line: i + 2,
        value: `a${i}.com`,
        reason: "cliente",
      }));
      expect((await importSuppressionEntries(rows)).success).toBe(false);
      expect((await importSuppressionEntries([])).success).toBe(false);
    });

    it("CSV_OK: 3 aceitas com source import_csv", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([{ data: [] }, {}]);

      const res = await importSuppressionEntries([
        { line: 2, value: "a.com", reason: "cliente" },
        { line: 3, value: "B.com", reason: "Parceiro" },
        { line: 4, value: "c@d.com", reason: "opt-out" },
      ]);

      expect(res).toEqual({ success: true, data: { accepted: 3, skipped: [] } });
      const insert = fake.calls[1].find((c) => c.method === "insert");
      expect(insert?.args[0]).toEqual([
        expect.objectContaining({ entry_type: "domain", value: "a.com", reason: "cliente", source: "import_csv", created_by: "user-1", tenant_id: "tenant-1" }),
        expect.objectContaining({ entry_type: "domain", value: "b.com", reason: "parceiro", source: "import_csv" }),
        expect.objectContaining({ entry_type: "email", value: "c@d.com", reason: "opt_out", source: "import_csv" }),
      ]);
    });

    it("CSV_MISTO: relatório com linha e motivo de cada ignorada", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([
        { data: [{ entry_type: "domain", value: "existe.com" }] },
        {},
      ]);

      const res = await importSuppressionEntries([
        { line: 2, value: "ok.com", reason: "cliente" },
        { line: 3, value: "empresa", reason: "cliente" },
        { line: 4, value: "sem-motivo.com", reason: "" },
        { line: 5, value: "motivo-ruim.com", reason: "fornecedor" },
        { line: 6, value: "https://www.OK.com/x", reason: "parceiro" },
        { line: 7, value: "existe.com", reason: "cliente" },
      ]);

      expect(res).toEqual({
        success: true,
        data: {
          accepted: 1,
          skipped: [
            { line: 3, value: "empresa", reason: "valor inválido" },
            { line: 4, value: "sem-motivo.com", reason: "motivo ausente" },
            { line: 5, value: "motivo-ruim.com", reason: "motivo desconhecido" },
            { line: 6, value: "https://www.OK.com/x", reason: "repetida no arquivo" },
            { line: 7, value: "existe.com", reason: "já está na lista" },
          ],
        },
      });
      expect(fake.calls[0]).toContainEqual({ method: "in", args: ["value", ["ok.com", "existe.com"]] });
      const insert = fake.calls[1].find((c) => c.method === "insert");
      expect(insert?.args[0]).toEqual([expect.objectContaining({ value: "ok.com" })]);
    });

    it("lookup de existentes em chunks de 100; insert em 500; erro no 2º chunk informa o parcial", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const rows = Array.from({ length: 501 }, (_, i) => ({
        line: i + 2,
        value: `empresa${i}.com`,
        reason: "cliente",
      }));
      // 6 lookups (100 x5 + 1), insert 500 ok, insert 1 falha
      const fake = useSupabase([
        ...Array.from({ length: 6 }, () => ({ data: [] })),
        {},
        { error: { code: "XX000", message: "boom" } },
      ]);

      const res = await importSuppressionEntries(rows);

      expect(res.success).toBe(false);
      expect(!res.success && res.error).toContain("500 linhas já tinham entrado");
      const lookups = fake.calls.slice(0, 6).map((c) => c.find((x) => x.method === "in"));
      expect(lookups.map((l) => (l?.args[1] as string[]).length)).toEqual([100, 100, 100, 100, 100, 1]);
      const inserts = fake.calls.slice(6).map((c) => c.find((x) => x.method === "insert"));
      expect(inserts.map((l) => (l?.args[0] as unknown[]).length)).toEqual([500, 1]);
    });

    it("tudo ignorado não chama insert", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([]);
      const res = await importSuppressionEntries([{ line: 2, value: "x", reason: "cliente" }]);
      expect(res.success && res.data?.accepted).toBe(0);
      expect(fake.from).not.toHaveBeenCalled();
    });

    it("tabela ausente devolve erro, sem lançar", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "PGRST205" } }]);
      const res = await importSuppressionEntries([{ line: 2, value: "a.com", reason: "cliente" }]);
      expect(!res.success && res.error).toMatch(/ainda não está disponível/);
    });
  });
});
