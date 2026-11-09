/**
 * Story 24.24 — briefing da nova busca ("mais leads")
 */

import { describe, it, expect } from "vitest";
import { buildMoreLeadsBriefing, hasRepeatableSearch } from "@/lib/agent/conversation/more-leads";
import type { ParsedBriefing } from "@/types/agent";

const BASE = {
  technology: null,
  jobTitles: ["CISO"],
  location: "Sao Paulo",
  companySize: null,
  industry: "banking",
  productSlug: "prod-1",
  mode: "guided",
  skipSteps: ["search_companies"],
  leadCount: 25,
} as ParsedBriefing;

describe("buildMoreLeadsBriefing", () => {
  it("copia os criterios com leadCount = N, sem mutar o original", () => {
    const next = buildMoreLeadsBriefing(BASE, 2);
    expect(next).toMatchObject({
      jobTitles: ["CISO"],
      location: "Sao Paulo",
      industry: "banking",
      skipSteps: ["search_companies"],
      leadCount: 2,
    });
    expect(BASE.leadCount).toBe(25);
    expect(next).not.toBe(BASE);
  });

  it("null com leads importados", () => {
    const imported = { ...BASE, importedLeads: [{ name: "X" }] } as unknown as ParsedBriefing;
    expect(buildMoreLeadsBriefing(imported, 2)).toBeNull();
    expect(hasRepeatableSearch(imported)).toBe(false);
  });

  it("null sem criterio de busca ou com a busca pulada", () => {
    expect(buildMoreLeadsBriefing({ ...BASE, jobTitles: [] }, 2)).toBeNull();
    expect(buildMoreLeadsBriefing({ ...BASE, skipSteps: ["search_leads"] }, 2)).toBeNull();
    expect(buildMoreLeadsBriefing(null, 2)).toBeNull();
  });

  it("remove importedLeads vazio e aceita modo lista de contas", () => {
    const accounts = {
      ...BASE,
      jobTitles: [],
      importedLeads: [],
      targetAccounts: [{ name: "Banco X", domain: "bancox.com.br", confidence: "high" }],
    } as ParsedBriefing;
    const next = buildMoreLeadsBriefing(accounts, 3);
    expect(next).not.toBeNull();
    expect(next).not.toHaveProperty("importedLeads");
  });

  it("briefing gravado sem jobTitles (tecnologia): a copia sai com jobTitles []", () => {
    const tech = { ...BASE, technology: "React" } as Record<string, unknown>;
    delete tech.jobTitles;
    const next = buildMoreLeadsBriefing(tech as unknown as ParsedBriefing, 4);
    expect(next?.jobTitles).toEqual([]);
    expect(next?.technology).toBe("React");
    expect(next?.leadCount).toBe(4);
  });
});
