/**
 * Known contacts actions tests
 * Story 25.1 - Contatos conhecidos
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("@/lib/agent/service-keys", () => ({
  readServiceApiKey: vi.fn(),
}));

vi.mock("@/lib/services/usage-logger", () => ({
  logApiUsage: vi.fn(),
}));

const mockTregCall = vi.fn();
vi.mock("@/lib/services/treg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/treg")>();
  return {
    ...actual,
    TregService: vi.fn().mockImplementation(function () {
      return { call: mockTregCall };
    }),
  };
});

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/supabase/tenant";
import { readServiceApiKey } from "@/lib/agent/service-keys";
import { logApiUsage } from "@/lib/services/usage-logger";
import {
  getKnownContacts,
  addKnownContact,
  updateKnownContact,
  removeKnownContact,
  importKnownContacts,
  addKnownContactFromOpportunity,
  findKnownContactLinkedin,
} from "@/actions/known-contacts";
import type { KnownContactImportRow } from "@/types/known-contact";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/**
 * Supabase fake: cada `from()` cria um builder encadeável que, ao ser aguardado
 * (ou em `.single()`/`.maybeSingle()`), devolve o próximo resultado da fila.
 */
function makeSupabase(results: Result[]) {
  const calls: Array<{ table: string; log: { method: string; args: unknown[] }[] }> = [];
  const from = vi.fn((table: string) => {
    const log: { method: string; args: unknown[] }[] = [];
    calls.push({ table, log });
    const next = () => {
      const r = results.shift() ?? { data: null, error: null };
      return { data: r.data ?? null, error: r.error ?? null };
    };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "insert", "update", "delete", "eq", "in", "is", "order", "range", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        log.push({ method: m, args });
        return builder;
      };
    }
    builder.single = () => Promise.resolve(next());
    builder.maybeSingle = () => Promise.resolve(next());
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
const OPP = "22222222-2222-4222-8222-222222222222";

function useSupabase(results: Result[]) {
  const fake = makeSupabase(results);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

function arg(fake: ReturnType<typeof makeSupabase>, call: number, method: string) {
  return fake.calls[call].log.find((l) => l.method === method)?.args[0];
}

const validInput = {
  fullName: " João Silva ",
  title: "CTO",
  companyName: "Acme",
  companyDomain: "",
  linkedinUrl: "https://br.linkedin.com/in/Joao-Silva/?trk=x",
  relationType: "cliente_atual" as const,
};

describe("known contacts actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("getKnownContacts", () => {
    it("requer autenticação", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(null);
      expect(await getKnownContacts()).toEqual({ success: false, error: "Não autenticado" });
    });

    it("SDR lê, filtrando pelo tenant, em páginas de 1000", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` }));
      const fake = useSupabase([{ data: page1 }, { data: [{ id: "b0" }] }]);

      const res = await getKnownContacts();

      expect(res.success && res.data).toHaveLength(1001);
      expect(fake.from).toHaveBeenCalledWith("known_contacts");
      expect(fake.calls[0].log).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
      expect(fake.calls[1].log).toContainEqual({ method: "range", args: [1000, 1999] });
    });

    it.each(["PGRST205", "42P01"])("tabela ausente (%s) devolve erro, sem lançar", async (code) => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code } }]);
      const res = await getKnownContacts();
      expect(res.success).toBe(false);
      expect(!res.success && res.error).toMatch(/ainda não estão disponíveis/);
    });
  });

  describe("addKnownContact", () => {
    it("SDR recebe 'Apenas gestores…' e nada é gravado", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const fake = useSupabase([]);
      const res = await addKnownContact(validInput);
      expect(!res.success && res.error).toMatch(/^Apenas gestores/);
      expect(fake.from).not.toHaveBeenCalled();
    });

    it("grava normalizado com source manual (ADD_COM_LINKEDIN)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([{ data: { id: ID } }]);

      const res = await addKnownContact(validInput);

      expect(res).toEqual({ success: true, data: { id: ID } });
      expect(arg(fake, 0, "insert")).toEqual({
        tenant_id: "tenant-1",
        full_name: "João Silva",
        title: "CTO",
        company_name: "Acme",
        company_domain: null,
        linkedin_url: "https://www.linkedin.com/in/joao-silva",
        relation_type: "cliente_atual",
        source: "manual",
        created_by: "user-1",
      });
    });

    it.each([
      [{ companyName: "", companyDomain: "" }, "Informe a empresa ou o domínio"],
      [{ linkedinUrl: "linkedin.com/company/x" }, "URL do LinkedIn inválida (use linkedin.com/in/...)"],
      [{ linkedinUrl: "joao" }, "URL do LinkedIn inválida (use linkedin.com/in/...)"],
    ])("não grava inválido %o", async (override, error) => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([]);
      expect(await addKnownContact({ ...validInput, ...override })).toEqual({
        success: false,
        error,
      });
      expect(fake.from).not.toHaveBeenCalled();
    });

    it("23505 → mensagem de duplicado", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "23505" } }]);
      const res = await addKnownContact(validInput);
      expect(!res.success && res.error).toMatch(/já existe um contato com esse LinkedIn/i);
    });
  });

  describe("updateKnownContact", () => {
    it("atualiza pelo id e tenant, sem mexer em origem/lead/autor", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([{ data: { id: ID } }]);

      const res = await updateKnownContact(ID, { ...validInput, relationType: "ex_cliente" });

      expect(res.success).toBe(true);
      const patch = arg(fake, 0, "update") as Record<string, unknown>;
      expect(patch.relation_type).toBe("ex_cliente");
      expect(patch).not.toHaveProperty("source");
      expect(patch).not.toHaveProperty("lead_id");
      expect(patch).not.toHaveProperty("tenant_id");
      expect(fake.calls[0].log).toContainEqual({ method: "eq", args: ["id", ID] });
      expect(fake.calls[0].log).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
    });

    it("id inválido, SDR, duplicado e inexistente", async () => {
      expect(await updateKnownContact("x", validInput)).toEqual({
        success: false,
        error: "ID inválido",
      });

      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      expect((await updateKnownContact(ID, validInput)).success).toBe(false);

      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "23505" } }]);
      const dup = await updateKnownContact(ID, validInput);
      expect(!dup.success && dup.error).toMatch(/já existe/i);

      useSupabase([{ data: null }]);
      expect(await updateKnownContact(ID, validInput)).toEqual({
        success: false,
        error: "Contato não encontrado",
      });
    });
  });

  describe("removeKnownContact", () => {
    it("remove pelo id e tenant (admin)", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([{}]);
      expect(await removeKnownContact(ID)).toEqual({ success: true });
      expect(fake.calls[0].log).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
    });

    it("SDR é barrado", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const res = await removeKnownContact(ID);
      expect(!res.success && res.error).toMatch(/^Apenas gestores/);
    });
  });

  describe("importKnownContacts", () => {
    const row = (line: number, over: Partial<KnownContactImportRow> = {}): KnownContactImportRow => ({
      line,
      fullName: `Pessoa ${line}`,
      title: "",
      companyName: "Acme",
      companyDomain: "",
      linkedinUrl: "",
      relation: "cliente",
      ...over,
    });

    it("CSV_OK: 3 contatos com source import_csv", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      // lookup de LinkedIn, contatos sem LinkedIn existentes, insert
      const fake = useSupabase([{ data: [] }, { data: [] }, {}]);

      const res = await importKnownContacts([
        row(2, { linkedinUrl: "linkedin.com/in/a" }),
        row(3),
        row(4, { relation: "Parceiro" }),
      ]);

      expect(res).toEqual({ success: true, data: { accepted: 3, skipped: [] } });
      const inserted = arg(fake, 2, "insert") as Array<Record<string, unknown>>;
      expect(inserted).toHaveLength(3);
      expect(inserted.every((r) => r.source === "import_csv")).toBe(true);
      expect(inserted[0].linkedin_url).toBe("https://www.linkedin.com/in/a");
      expect(inserted[2].relation_type).toBe("parceiro");
    });

    it("CSV_MISTO: só as válidas entram; relatório com linha e motivo", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([
        { data: [{ linkedin_url: "https://www.linkedin.com/in/existe" }] },
        { data: [] },
        {},
      ]);

      const res = await importKnownContacts([
        row(2),
        row(3, { fullName: "" }),
        row(4, { companyName: "", companyDomain: "" }),
        row(5, { relation: "fornecedor" }),
        row(6, { linkedinUrl: "linkedin.com/company/x" }),
        row(7, { linkedinUrl: "linkedin.com/in/dup" }),
        row(8, { linkedinUrl: "https://br.linkedin.com/in/DUP/" }),
        row(9, { linkedinUrl: "linkedin.com/in/existe" }),
        row(10, { relation: "" }),
      ]);

      expect(res.success).toBe(true);
      const report = res.success ? res.data! : null;
      expect(report?.accepted).toBe(2);
      expect(report?.skipped.map((s) => [s.line, s.reason])).toEqual([
        [3, "Informe o nome"],
        [4, "Informe a empresa ou o domínio"],
        [5, "relação desconhecida"],
        [6, "URL do LinkedIn inválida (use linkedin.com/in/...)"],
        [8, "LinkedIn repetido no arquivo"],
        [9, "já existe um contato com esse LinkedIn"],
        [10, "relação ausente"],
      ]);
      expect(fake.calls[0].log).toContainEqual({
        method: "in",
        args: [
          "linkedin_url",
          ["https://www.linkedin.com/in/dup", "https://www.linkedin.com/in/existe"],
        ],
      });
    });

    it("limites e permissão", async () => {
      expect((await importKnownContacts([])).success).toBe(false);
      const big = Array.from({ length: 2001 }, (_, i) => row(i + 2));
      const res = await importKnownContacts(big);
      expect(!res.success && res.error).toMatch(/Máximo de 2000/);

      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      const sdrRes = await importKnownContacts([row(2)]);
      expect(!sdrRes.success && sdrRes.error).toMatch(/^Apenas gestores/);
    });

    it("sem LinkedIn: dedup por nome + empresa no arquivo e contra o tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([
        // contatos sem LinkedIn já cadastrados (sem lookup de LinkedIn: nenhuma linha tem)
        {
          data: [
            { full_name: "Carlos Lima", company_name: "Beta", company_domain: null },
            { full_name: "Dora", company_name: null, company_domain: "gama.com" },
          ],
        },
        {},
      ]);

      const res = await importKnownContacts([
        row(2, { fullName: "José  Souza", companyName: "Acme" }),
        row(3, { fullName: "jose souza", companyName: " ACME " }),
        row(4, { fullName: "Carlos Lima", companyName: "beta" }),
        row(5, { fullName: "Dora", companyName: "", companyDomain: "www.gama.com" }),
        row(6, { fullName: "José Souza", companyName: "Outra" }),
      ]);

      expect(res.success).toBe(true);
      const report = res.success ? res.data! : null;
      expect(report?.accepted).toBe(2);
      expect(report?.skipped.map((s) => [s.line, s.reason])).toEqual([
        [3, "contato repetido no arquivo (mesmo nome e empresa)"],
        [4, "já existe um contato com esse nome e empresa"],
        [5, "já existe um contato com esse nome e empresa"],
      ]);
      expect(fake.calls[0].log).toContainEqual({ method: "is", args: ["linkedin_url", null] });
      expect(fake.calls[0].log).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
      expect(fake.calls[0].log).toContainEqual({ method: "range", args: [0, 999] });
      const inserted = arg(fake, 1, "insert") as Array<Record<string, unknown>>;
      expect(inserted.map((r) => [r.full_name, r.company_name])).toEqual([
        ["José Souza", "Acme"],
        ["José Souza", "Outra"],
      ]);
    });

    it("sem LinkedIn: existentes lidos em páginas de 1000", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        full_name: `X${i}`,
        company_name: "Z",
        company_domain: null,
      }));
      const fake = useSupabase([
        { data: page1 },
        { data: [{ full_name: "Pessoa 2", company_name: "Acme", company_domain: null }] },
      ]);

      const res = await importKnownContacts([row(2)]);

      expect(res.success && res.data).toEqual({
        accepted: 0,
        skipped: [{ line: 2, value: "Pessoa 2", reason: "já existe um contato com esse nome e empresa" }],
      });
      expect(fake.calls[1].log).toContainEqual({ method: "range", args: [1000, 1999] });
      expect(fake.calls).toHaveLength(2);
    });

    it("lookup de LinkedIn em lotes de 100", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const rows = Array.from({ length: 150 }, (_, i) =>
        row(i + 2, { linkedinUrl: `linkedin.com/in/p${i}` })
      );
      const fake = useSupabase([{ data: [] }, { data: [] }, {}]);

      const res = await importKnownContacts(rows);

      expect(res.success && res.data?.accepted).toBe(150);
      const batches = [0, 1].map((i) => {
        const call = fake.calls[i].log.find((l) => l.method === "in");
        expect(call?.args[0]).toBe("linkedin_url");
        return call?.args[1] as string[];
      });
      expect(batches.map((b) => b.length)).toEqual([100, 50]);
      expect(batches.flat()).toEqual(
        Array.from({ length: 150 }, (_, i) => `https://www.linkedin.com/in/p${i}`)
      );
    });

    it("insert em lotes de 500: falha no 2º lote informa o que já entrou", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const rows = Array.from({ length: 600 }, (_, i) => row(i + 2));
      const fake = useSupabase([{ data: [] }, {}, { error: { code: "XX000" } }]);

      const res = await importKnownContacts(rows);

      expect(res.success).toBe(false);
      expect(!res.success && res.error).toMatch(/\(500 linhas já tinham entrado\)$/);
      expect((arg(fake, 1, "insert") as unknown[]).length).toBe(500);
      expect((arg(fake, 2, "insert") as unknown[]).length).toBe(100);
    });

    it("23505 no insert: mensagem de outro gestor", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ data: [] }, { error: { code: "23505" } }]);
      const res = await importKnownContacts([row(2)]);
      expect(!res.success && res.error).toMatch(/outro gestor cadastrou durante o import/);
    });

    it("tabela ausente devolve erro", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ error: { code: "PGRST205" } }]);
      const res = await importKnownContacts([row(2)]);
      expect(!res.success && res.error).toMatch(/ainda não estão disponíveis/);
    });
  });

  describe("addKnownContactFromOpportunity", () => {
    const lead = {
      id: "lead-1",
      first_name: "Ana",
      last_name: "Souza",
      email: "ana@Acme.com.br",
      company_name: "Acme",
      title: "CISO",
      linkedin_url: "https://br.linkedin.com/in/ana-souza/",
    };

    it("OPORTUNIDADE_1_CLIQUE: grava os dados do lead", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([
        { data: { id: OPP, status: "meeting_booked", lead_id: "lead-1", lead } },
        { data: [] },
        { data: { id: ID } },
      ]);

      const res = await addKnownContactFromOpportunity(OPP);

      expect(res).toEqual({ success: true, data: { alreadyKnown: false, contact: { id: ID } } });
      expect(fake.calls[0].table).toBe("opportunities");
      expect(fake.calls[0].log).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
      expect(arg(fake, 2, "insert")).toEqual({
        tenant_id: "tenant-1",
        full_name: "Ana Souza",
        title: "CISO",
        company_name: "Acme",
        company_domain: "acme.com.br",
        linkedin_url: "https://www.linkedin.com/in/ana-souza",
        relation_type: "reuniao_marcada",
        source: "oportunidade",
        lead_id: "lead-1",
        created_by: "user-1",
      });
    });

    it("e-mail pessoal não vira domínio", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([
        {
          data: {
            id: OPP,
            status: "meeting_booked",
            lead: [{ ...lead, email: "ana@gmail.com", linkedin_url: "não-é-url" }],
          },
        },
        { data: [] },
        { data: { id: ID } },
      ]);

      await addKnownContactFromOpportunity(OPP);

      const inserted = arg(fake, 2, "insert") as Record<string, unknown>;
      expect(inserted.company_domain).toBeNull();
      expect(inserted.linkedin_url).toBeNull();
    });

    it("OPORTUNIDADE_REPETIDA: lead já é contato → nada novo", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([
        { data: { id: OPP, status: "meeting_booked", lead } },
        { data: [{ id: ID }] },
      ]);

      const res = await addKnownContactFromOpportunity(OPP);

      expect(res).toEqual({ success: true, data: { alreadyKnown: true } });
      expect(fake.calls).toHaveLength(2);
    });

    it("corrida (23505) também conta como já conhecido", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([
        { data: { id: OPP, status: "meeting_booked", lead } },
        { data: [] },
        { error: { code: "23505" } },
      ]);
      expect(await addKnownContactFromOpportunity(OPP)).toEqual({
        success: true,
        data: { alreadyKnown: true },
      });
    });

    it.each([
      ["status ≠ meeting_booked", { id: OPP, status: "contacted", lead }],
      ["sem lead", { id: OPP, status: "meeting_booked", lead: null }],
    ])("OPORTUNIDADE_SEM_LEAD: %s → recusa", async (_label, data) => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([{ data }]);
      const res = await addKnownContactFromOpportunity(OPP);
      expect(!res.success && res.error).toMatch(/reunião marcada/);
      expect(fake.calls).toHaveLength(1);
    });

    it("SDR, id inválido e oportunidade de outro tenant", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      expect((await addKnownContactFromOpportunity(OPP)).success).toBe(false);
      expect(await addKnownContactFromOpportunity("x")).toEqual({
        success: false,
        error: "ID inválido",
      });

      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([{ data: null }]);
      expect(await addKnownContactFromOpportunity(OPP)).toEqual({
        success: false,
        error: "Oportunidade não encontrada",
      });
    });

    it.each([
      ["status ≠ meeting_booked", { id: OPP, status: "viewed", lead_id: "lead-1", lead }],
      ["sem lead", { id: OPP, status: "meeting_booked", lead_id: null, lead: null }],
    ])("OPORTUNIDADE_SEM_LEAD: recusa (%s) sem gravar", async (_label, row) => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const fake = useSupabase([{ data: row }]);
      const res = await addKnownContactFromOpportunity(OPP);
      expect(fake.calls).toHaveLength(1);
      expect(res.success).toBe(false);
      expect(!res.success && res.error).toMatch(/reunião marcada e lead cadastrado/);
    });

    it("tabela ausente devolve erro", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      useSupabase([
        { data: { id: OPP, status: "meeting_booked", lead } },
        { error: { code: "42P01" } },
      ]);
      const res = await addKnownContactFromOpportunity(OPP);
      expect(!res.success && res.error).toMatch(/ainda não estão disponíveis/);
    });
  });

  describe("findKnownContactLinkedin", () => {
    const input = { fullName: "João Silva", companyName: "Acme", companyDomain: "" };

    beforeEach(() => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      vi.mocked(readServiceApiKey).mockResolvedValue({ status: "ok", apiKey: "treg-key" });
    });

    it("sucesso: uma chamada com teto, meta e idempotência; custo logado", async () => {
      mockTregCall.mockResolvedValue({
        ok: true,
        status: 200,
        costMicro: 150,
        durationMs: 900,
        json: {
          output: {
            results: [
              { url: "https://www.linkedin.com/company/acme", title: "Acme" },
              { url: "https://br.linkedin.com/in/joao-silva", title: "João Silva - CTO", snippet: "Acme" },
            ],
          },
        },
      });

      const res = await findKnownContactLinkedin(input);

      expect(res).toEqual({
        success: true,
        data: {
          candidates: [
            { url: "https://www.linkedin.com/in/joao-silva", title: "João Silva - CTO", snippet: "Acme" },
          ],
        },
      });
      expect(readServiceApiKey).toHaveBeenCalledWith("tenant-1", "treg");
      expect(mockTregCall).toHaveBeenCalledTimes(1);
      const [key, endpoint, body, options] = mockTregCall.mock.calls[0];
      expect(key).toBe("treg-key");
      expect(endpoint).toBe("treg.web.search");
      expect(body).toEqual({ q: '"João Silva" Acme site:linkedin.com/in', limit: 10 });
      expect(options).toMatchObject({
        maxCostUsd: 0.01,
        meta: "feature=contatos-conhecidos-25-1,tenant=tenant-1",
        timeoutMs: 45_000,
      });
      expect(options.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);

      // Determinística: a mesma busca gera a mesma chave.
      await findKnownContactLinkedin(input);
      expect(mockTregCall.mock.calls[1][3].idempotencyKey).toBe(options.idempotencyKey);

      expect(logApiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          serviceName: "treg",
          requestType: "treg.web.search",
          status: "success",
          estimatedCost: 0.00015,
        })
      );
    });

    it("chave ausente: sem chamada e sem log", async () => {
      vi.mocked(readServiceApiKey).mockResolvedValue({ status: "missing" });
      const res = await findKnownContactLinkedin(input);
      expect(!res.success && res.error).toMatch(/Treg não configurada/);
      expect(mockTregCall).not.toHaveBeenCalled();
      expect(logApiUsage).not.toHaveBeenCalled();
    });

    it("timeout: erro, logado como failed com custo pelo teto", async () => {
      mockTregCall.mockResolvedValue({
        ok: false,
        status: 0,
        json: null,
        costMicro: 0,
        costUnknown: true,
        durationMs: 45_000,
        error: "timeout (45000 ms)",
      });

      const res = await findKnownContactLinkedin(input);

      expect(!res.success && res.error).toMatch(/não respondeu a tempo/);
      expect(logApiUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          estimatedCost: 0.01,
          metadata: expect.objectContaining({ costEstimated: true }),
        })
      );
    });

    it("HTTP erro: logado como failed com o custo cobrado", async () => {
      mockTregCall.mockResolvedValue({
        ok: false,
        status: 502,
        json: null,
        costMicro: 0,
        durationMs: 100,
        error: "HTTP 502",
      });
      const res = await findKnownContactLinkedin(input);
      expect(!res.success && res.error).toMatch(/HTTP 502/);
      expect(logApiUsage).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", estimatedCost: 0 })
      );
    });

    it("0 perfis /in/: erro e failed", async () => {
      mockTregCall.mockResolvedValue({
        ok: true,
        status: 200,
        costMicro: 150,
        durationMs: 100,
        json: { output: { results: [{ url: "https://www.linkedin.com/company/x" }] } },
      });
      const res = await findKnownContactLinkedin(input);
      expect(!res.success && res.error).toMatch(/Nenhum perfil/);
      expect(logApiUsage).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    });

    it("chamada que lança não derruba a action", async () => {
      mockTregCall.mockRejectedValue(new Error("boom"));
      const res = await findKnownContactLinkedin(input);
      expect(res.success).toBe(false);
      expect(logApiUsage).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    });

    it("SDR e entrada sem empresa: sem chamada", async () => {
      vi.mocked(getCurrentUserProfile).mockResolvedValue(sdr);
      expect((await findKnownContactLinkedin(input)).success).toBe(false);
      vi.mocked(getCurrentUserProfile).mockResolvedValue(admin);
      const res = await findKnownContactLinkedin({ fullName: "João", companyName: "" });
      expect(!res.success && res.error).toBe("Informe a empresa ou o domínio");
      expect(mockTregCall).not.toHaveBeenCalled();
      expect(readServiceApiKey).not.toHaveBeenCalled();
    });

    it("só nome + empresa/domínio vão para o Treg", async () => {
      mockTregCall.mockResolvedValue({ ok: true, status: 200, costMicro: 0, durationMs: 1, json: {} });
      await findKnownContactLinkedin({
        fullName: "João",
        companyName: "",
        companyDomain: "https://www.acme.com/x",
        // @ts-expect-error campo extra não deve ir para o provedor
        email: "joao@acme.com",
      });
      expect(mockTregCall.mock.calls[0][2]).toEqual({
        q: '"João" acme.com site:linkedin.com/in',
        limit: 10,
      });
    });
  });
});
