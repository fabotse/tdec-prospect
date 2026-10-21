/**
 * Story 24.14 — briefing a partir do ICP (leaf puro).
 */

import { describe, it, expect } from "vitest";
import {
  buildIcpProposal,
  buildIcpProposalMessage,
  buildIcpSearchDefaults,
  type TenantICP,
} from "@/lib/agent/icp-briefing";

function icp(overrides: Partial<TenantICP> = {}): TenantICP {
  return { jobTitles: [], industries: [], companySizes: [], geographicFocus: [], ...overrides };
}

describe("icp-briefing — buildIcpSearchDefaults", () => {
  it("mapeia faixas iguais e mantem a ordem canonica", () => {
    expect(
      buildIcpSearchDefaults(icp({ companySizes: ["501-1000", "201-500"], geographicFocus: [] }))
    ).toEqual({ companySizes: ["201-500", "501-1000"], locations: [] });
  });

  it("'1000+' abre nas tres faixas acima de 1000", () => {
    expect(buildIcpSearchDefaults(icp({ companySizes: ["501-1000", "1000+"] }))?.companySizes).toEqual(
      ["501-1000", "1001-5000", "5001-10000", "10001+"]
    );
  });

  it("locais: trim, sem vazios, dedupe e teto de 10", () => {
    const geo = [" SP ", "", "SP", "RJ", ...Array.from({ length: 12 }, (_, i) => `L${i}`)];
    const result = buildIcpSearchDefaults(icp({ geographicFocus: geo }));
    expect(result?.locations[0]).toBe("SP");
    expect(result?.locations[1]).toBe("RJ");
    expect(result?.locations).toHaveLength(10);
  });

  it("descarta faixas desconhecidas e devolve null quando as duas listas ficam vazias", () => {
    expect(buildIcpSearchDefaults(icp({ companySizes: ["abc"], geographicFocus: ["  "] }))).toBeNull();
    expect(buildIcpSearchDefaults(icp())).toBeNull();
  });
});

describe("icp-briefing — buildIcpProposal", () => {
  it("sem cargos no ICP -> null (mesmo com portes e geo)", () => {
    expect(
      buildIcpProposal(icp({ companySizes: ["201-500"], geographicFocus: ["SP"] }))
    ).toBeNull();
    expect(buildIcpProposal(icp())).toBeNull();
  });

  it("com cargos -> briefing de busca direta guiada com icpDefaults", () => {
    const proposal = buildIcpProposal(
      icp({
        jobTitles: ["CISO", "Head de TI", "CISO"],
        industries: ["Fintech"],
        companySizes: ["201-500", "501-1000"],
        geographicFocus: ["SP"],
      })
    );
    expect(proposal).toEqual({
      technology: null,
      jobTitles: ["CISO", "Head de TI"],
      location: null,
      companySize: null,
      industry: null,
      productSlug: null,
      mode: "guided",
      skipSteps: ["search_companies"],
      icpDefaults: { companySizes: ["201-500", "501-1000"], locations: ["SP"] },
    });
  });

  it("limita os cargos a 6", () => {
    const proposal = buildIcpProposal(
      icp({ jobTitles: ["A", "B", "C", "D", "E", "F", "G", "H"] })
    );
    expect(proposal?.jobTitles).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("industrias do ICP nunca viram filtro", () => {
    const proposal = buildIcpProposal(icp({ jobTitles: ["CFO"], industries: ["Varejo"] }));
    expect(proposal?.industry).toBeNull();
  });
});

describe("icp-briefing — buildIcpProposalMessage", () => {
  it("mensagem completa (cenario da matriz)", () => {
    const proposal = buildIcpProposal(
      icp({
        jobTitles: ["CISO", "Head de TI"],
        companySizes: ["201-500", "501-1000"],
        geographicFocus: ["SP"],
      })
    );
    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(buildIcpProposalMessage(proposal)).toBe(
      "Pelo seu ICP: CISO/Head de TI, SP, 201–1000 funcionarios. Ajusto algo?"
    );
  });

  it("omite as partes vazias (ICP so com cargos)", () => {
    const proposal = buildIcpProposal(icp({ jobTitles: ["CFO"] }));
    expect(proposal?.icpDefaults).toBeNull();
    if (!proposal) return;
    expect(buildIcpProposalMessage(proposal)).toBe("Pelo seu ICP: CFO. Ajusto algo?");
  });

  it("varios locais juntados com ', ' e rotulo 501+", () => {
    const proposal = buildIcpProposal(
      icp({ jobTitles: ["CFO"], companySizes: ["501-1000", "1000+"], geographicFocus: ["SP", "RJ"] })
    );
    if (!proposal) throw new Error("proposta esperada");
    expect(buildIcpProposalMessage(proposal)).toBe(
      "Pelo seu ICP: CFO, SP, RJ, 501+ funcionarios. Ajusto algo?"
    );
  });
});
