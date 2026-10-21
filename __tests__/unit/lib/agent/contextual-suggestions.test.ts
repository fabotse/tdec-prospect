/**
 * Unit Tests for contextual-suggestions (server-only)
 * Story 22.7 - AC: #1, #2
 *
 * Cobre: KB presente -> sugestoes derivam do ICP; KB ausente / erro /
 * createAdminClient lanca -> fallback SILENCIOSO pros mapas estaticos (fail-open,
 * nunca 500). O mock NAO simula RLS (Trap #1) — a prova real de que o SDR recebe
 * sugestoes KB e smoke manual; aqui garantimos apenas a orquestracao/fail-open.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_JOB_TITLES,
  INDUSTRY_TO_TECH,
} from "@/lib/agent/briefing-suggestion-service";
import type { ParsedBriefing } from "@/types/agent";

const mockCreateAdminClient = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

// Import DEPOIS do vi.mock (hoisted).
import {
  readTenantICP,
  resolveContextualSuggestions,
} from "@/lib/agent/contextual-suggestions";

// ==============================================
// HELPERS
// ==============================================

function createBriefing(overrides: Partial<ParsedBriefing> = {}): ParsedBriefing {
  return {
    technology: null,
    jobTitles: [],
    location: null,
    companySize: null,
    industry: null,
    productSlug: null,
    mode: "guided",
    skipSteps: [],
    ...overrides,
  };
}

/** Client admin encadeavel: from().select().eq().eq().single() -> mockSingle. */
function buildAdminClient() {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: mockSingle,
  };
  return { from: vi.fn(() => chain) };
}

// ==============================================
// TESTS
// ==============================================

describe("contextual-suggestions (Story 22.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockReturnValue(buildAdminClient());
    // Silencia o console.error do fail-open sem perder a assercao de comportamento.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readTenantICP", () => {
    it("le job_titles/industries da secao icp da KB (AC1)", async () => {
      mockSingle.mockResolvedValue({
        data: { content: { job_titles: ["CRO", "Head de Vendas"], industries: ["fintech"] } },
        error: null,
      });

      const icp = await readTenantICP("tenant-1");

      expect(icp).toEqual({
        jobTitles: ["CRO", "Head de Vendas"],
        industries: ["fintech"],
        companySizes: [], geographicFocus: [], painPoints: "",
      });
    });

    it("fail-open (ICP vazio) quando a KB nao tem a secao icp (AC2)", async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

      const icp = await readTenantICP("tenant-1");

      expect(icp).toEqual({ jobTitles: [], industries: [], companySizes: [], geographicFocus: [], painPoints: "" });
    });

    it("fail-open quando createAdminClient lanca (service-role ausente) — nunca 500", async () => {
      mockCreateAdminClient.mockImplementation(() => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
      });

      const icp = await readTenantICP("tenant-1");

      expect(icp).toEqual({ jobTitles: [], industries: [], companySizes: [], geographicFocus: [], painPoints: "" });
    });

    it("fail-open quando content vem com shape inesperado (nao-array)", async () => {
      mockSingle.mockResolvedValue({
        data: { content: { job_titles: "CTO", industries: null } },
        error: null,
      });

      const icp = await readTenantICP("tenant-1");

      expect(icp).toEqual({ jobTitles: [], industries: [], companySizes: [], geographicFocus: [], painPoints: "" });
    });

    it("descarta elementos nao-string do array (jsonb legado) sem lancar — nunca 500 (P1/AC2)", async () => {
      // Linha legada/inserida a mao: job_titles/industries com elementos nao-string.
      // Sem o filtro na fronteira de leitura, `dedupeNonEmpty` faria `(123).trim()` ->
      // TypeError -> escaparia ate o catch da rota -> 500 (viola AC2).
      mockSingle.mockResolvedValue({
        data: {
          content: {
            job_titles: ["CTO", 123, null, { role: "x" }, "CFO"],
            industries: ["fintech", 42, undefined],
          },
        },
        error: null,
      });

      const icp = await readTenantICP("tenant-1");

      expect(icp).toEqual({
        jobTitles: ["CTO", "CFO"],
        industries: ["fintech"],
        companySizes: [], geographicFocus: [], painPoints: "",
      });
    });

    it("Story 24.16: le pain_points como string (nao-string vira \"\")", async () => {
      mockSingle.mockResolvedValue({
        data: { content: { job_titles: [], pain_points: "Vazamento de dados" } },
        error: null,
      });
      expect((await readTenantICP("tenant-1")).painPoints).toBe("Vazamento de dados");

      mockSingle.mockResolvedValue({
        data: { content: { job_titles: [], pain_points: 42 } },
        error: null,
      });
      expect((await readTenantICP("tenant-1")).painPoints).toBe("");
    });

    it("Story 24.14: le company_sizes e geographic_focus (coercao toStringArray)", async () => {
      mockSingle.mockResolvedValue({
        data: {
          content: {
            job_titles: ["CISO"],
            industries: [],
            company_sizes: ["201-500", 7, "1000+"],
            geographic_focus: ["SP", null, "RJ"],
          },
        },
        error: null,
      });

      const icp = await readTenantICP("tenant-1");

      expect(icp).toEqual({
        jobTitles: ["CISO"],
        industries: [],
        companySizes: ["201-500", "1000+"],
        geographicFocus: ["SP", "RJ"],
        painPoints: "",
      });
    });

    it("resolveContextualSuggestions nao lanca com ICP contendo nao-strings (fail-open ponta-a-ponta)", async () => {
      mockSingle.mockResolvedValue({
        data: { content: { job_titles: [123, {}, "Head de Growth"], industries: [true, "fintech"] } },
        error: null,
      });

      const suggestions = await resolveContextualSuggestions(createBriefing(), "tenant-1");

      expect(suggestions.jobTitles).toEqual(["Head de Growth"]);
      expect(suggestions.technology).toEqual(INDUSTRY_TO_TECH["fintech"]);
    });
  });

  describe("resolveContextualSuggestions", () => {
    it("KB presente -> sugestoes derivam do ICP, NAO do estatico (AC1)", async () => {
      mockSingle.mockResolvedValue({
        data: {
          content: { job_titles: ["Head de Growth", "VP de Marketing"], industries: ["fintech"] },
        },
        error: null,
      });

      const suggestions = await resolveContextualSuggestions(createBriefing(), "tenant-1");

      expect(suggestions.jobTitles).toEqual(["Head de Growth", "VP de Marketing"]);
      // technology deriva do setor fintech do ICP (reusa INDUSTRY_TO_TECH)
      expect(suggestions.technology).toEqual(INDUSTRY_TO_TECH["fintech"]);
      // NAO caiu no fallback estatico generico
      expect(suggestions.jobTitles).not.toEqual(DEFAULT_JOB_TITLES);
    });

    it("KB ausente -> fallback SILENCIOSO pro estatico (AC2)", async () => {
      mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

      const suggestions = await resolveContextualSuggestions(createBriefing(), "tenant-1");

      // Briefing vazio + ICP vazio -> estatico devolve DEFAULT_JOB_TITLES
      expect(suggestions.jobTitles).toEqual(DEFAULT_JOB_TITLES);
    });

    it("createAdminClient lanca -> fallback estatico, sem 500 (fail-open, AC2/AC3)", async () => {
      mockCreateAdminClient.mockImplementation(() => {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
      });

      // Nao deve lancar
      const suggestions = await resolveContextualSuggestions(createBriefing(), "tenant-1");

      expect(suggestions.jobTitles).toEqual(DEFAULT_JOB_TITLES);
    });

    it("Story 24.14: ICP recebido e reaproveitado — sem segunda leitura da KB", async () => {
      const suggestions = await resolveContextualSuggestions(createBriefing(), "tenant-1", {
        jobTitles: ["CISO"],
        industries: [],
        companySizes: [],
        geographicFocus: [],
        painPoints: "",
      });

      expect(suggestions.jobTitles).toEqual(["CISO"]);
      expect(mockCreateAdminClient).not.toHaveBeenCalled();
      expect(mockSingle).not.toHaveBeenCalled();
    });

    it("ICP parcial -> campo com material vem do ICP, o outro cai no estatico (AC2)", async () => {
      // ICP tem cargos, mas nenhum setor. Briefing tem industry=fintech ->
      // technology deve cair no estatico (INDUSTRY_TO_TECH[fintech]); jobTitles do ICP.
      mockSingle.mockResolvedValue({
        data: { content: { job_titles: ["Diretor de Compras"], industries: [] } },
        error: null,
      });

      const suggestions = await resolveContextualSuggestions(
        createBriefing({ industry: "fintech" }),
        "tenant-1"
      );

      expect(suggestions.jobTitles).toEqual(["Diretor de Compras"]);
      expect(suggestions.technology).toEqual(INDUSTRY_TO_TECH["fintech"]);
    });
  });
});
