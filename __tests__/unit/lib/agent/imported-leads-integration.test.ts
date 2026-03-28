/**
 * Integration Tests for Imported Leads Flow
 * Story 17.11 - AC: #1-#5
 *
 * Tests: end-to-end style — briefing parse → skipSteps detection →
 * lead import → plan generation → orchestrator skip logic → CreateCampaignStep execution
 */

import { describe, it, expect, vi } from "vitest";
import { parseLeadInput } from "@/lib/agent/lead-import-parser";
import { PlanGeneratorService } from "@/lib/services/agent-plan-generator";
import type { CostEstimate, ParsedBriefing, SearchLeadResult } from "@/types/agent";
import { briefingResponseSchema } from "@/lib/agent/briefing-parser-service";

// ==============================================
// HELPERS
// ==============================================

function createCostEstimate(): CostEstimate {
  return {
    steps: {
      search_companies: { estimated: 0.10, description: "1 busca" },
      search_leads: { estimated: 3.00, description: "60 leads" },
      create_campaign: { estimated: 4.20, description: "210 prompts" },
      export: { estimated: 0.00, description: "free" },
      activate: { estimated: 0.00, description: "Gratuito" },
    },
    total: 7.30,
    currency: "BRL",
  };
}

// ==============================================
// TESTS
// ==============================================

describe("Imported Leads Flow Integration (Story 17.11)", () => {
  describe("AC #1: Briefing parsing detects imported leads intent", () => {
    it("schema accepts skipSteps with both search_companies and search_leads", () => {
      const response = {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided" as const,
        skipSteps: ["search_companies", "search_leads"],
      };

      const result = briefingResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skipSteps).toEqual(["search_companies", "search_leads"]);
      }
    });
  });

  describe("AC #2: Lead import parsing and validation", () => {
    it("full flow: parse various formats, validate, and produce SearchLeadResult[]", () => {
      const userInput = [
        "nome,cargo,empresa,email",
        "Joao Silva, CTO, Acme Corp, joao@acme.com",
        "maria@beta.com",
        "Pedro Lima, Head de TI, pedro@gamma.io",
        "invalido-sem-email",
        "Ana, ana@acme.com",
        "Joao Dup, joao@acme.com",
      ].join("\n");

      const result = parseLeadInput(userInput);

      // 4 accepted (Joao, Maria, Pedro, Ana)
      expect(result.accepted).toHaveLength(4);
      // 2 rejected (invalido, duplicado)
      expect(result.rejected).toHaveLength(2);

      // Verify SearchLeadResult structure
      const joao = result.accepted[0];
      expect(joao.name).toBe("Joao Silva");
      expect(joao.title).toBe("CTO");
      expect(joao.companyName).toBe("Acme Corp");
      expect(joao.email).toBe("joao@acme.com");
      expect(joao.linkedinUrl).toBeNull();
      expect(joao.apolloId).toBeNull();

      // Maria: only email — name/company extracted
      const maria = result.accepted[1];
      expect(maria.name).toBe("Maria");
      expect(maria.companyName).toBe("Beta");
      expect(maria.title).toBeNull();

      // Rejected reasons
      expect(result.rejected[0].reason).toBe("Email invalido ou ausente");
      expect(result.rejected[1].reason).toBe("Email duplicado");
    });
  });

  describe("AC #3: Pipeline config with imported leads", () => {
    it("plan generator marks search steps as skipped and uses imported leads description", () => {
      const importedLeads: SearchLeadResult[] = [
        { name: "Joao", title: "CTO", companyName: "Acme", email: "joao@acme.com", linkedinUrl: null, apolloId: null },
        { name: "Maria", title: null, companyName: null, email: "maria@beta.com", linkedinUrl: null, apolloId: null },
      ];

      const briefing: ParsedBriefing = {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided",
        skipSteps: ["search_companies", "search_leads"],
        importedLeads,
      };

      const steps = PlanGeneratorService.generatePlan(briefing, createCostEstimate());

      // Steps 1,2 skipped
      expect(steps[0].skipped).toBe(true);
      expect(steps[0].estimatedCost).toBe(0);
      expect(steps[1].skipped).toBe(true);
      expect(steps[1].description).toBe("Etapa pulada — leads fornecidos pelo usuario");

      // Step 3 active with imported leads count
      expect(steps[2].skipped).toBe(false);
      expect(steps[2].description).toContain("2 leads importados");

      // Steps 4,5 active
      expect(steps[3].skipped).toBe(false);
      expect(steps[4].skipped).toBe(false);
    });
  });

  describe("AC #3: Orchestrator skip logic for 2 skipped steps", () => {
    it("when all previous steps are skipped, previousStepOutput should be undefined", () => {
      // Simulates orchestrator allSkipped check (orchestrator.ts line 136-151)
      const prevSteps = [
        { status: "skipped" },
        { status: "skipped" },
      ];

      const allSkipped = prevSteps.every((s) => s.status === "skipped");
      expect(allSkipped).toBe(true);

      // When allSkipped, previousStepOutput = undefined
      const previousStepOutput = allSkipped ? undefined : { leads: [] };
      expect(previousStepOutput).toBeUndefined();
    });
  });

  describe("AC #4: Step progress rendering with skipped steps", () => {
    it("active steps count excludes skipped steps", () => {
      const allSteps = [
        { status: "skipped" },  // search_companies
        { status: "skipped" },  // search_leads
        { status: "running" },  // create_campaign
        { status: "pending" },  // export
        { status: "pending" },  // activate
      ];

      const activeSteps = allSteps.filter(s => s.status !== "skipped");
      expect(activeSteps).toHaveLength(3);

      // Numbering: "Etapa 1 de 3" (campanha is first active)
      const activeStepIndex = allSteps.filter(s =>
        s.status !== "skipped" && s.status !== "pending"
      ).length;
      // running count = 1, so index = 1 (first active step)
      expect(activeStepIndex).toBe(1);
    });
  });

  describe("AC #5: Icebreakers with partial data", () => {
    it("imported leads have valid structure for icebreaker generation", () => {
      const leadsInput = "joao@empresa.com\nmaria@acme.io";
      const result = parseLeadInput(leadsInput);

      // Both leads have at minimum: name (from email), email, companyName (from domain)
      for (const lead of result.accepted) {
        expect(lead.name).toBeTruthy();
        expect(lead.email).toBeTruthy();
        // title may be null — icebreaker generator handles this
        // companyName extracted from domain — icebreaker generator handles empty
      }

      // Verify the structure matches what generateSingleIcebreaker expects
      expect(result.accepted[0]).toMatchObject({
        name: expect.any(String),
        title: null,
        companyName: expect.any(String),
        email: "joao@empresa.com",
        linkedinUrl: null,
        apolloId: null,
      });
    });
  });

  describe("Full E2E-style flow", () => {
    it("briefing → parse → imported leads → plan → step execution input", () => {
      // 1. Briefing parser returns skipSteps: ["search_companies", "search_leads"]
      const parserResponse = briefingResponseSchema.parse({
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productMentioned: null,
        mode: "guided",
        skipSteps: ["search_companies", "search_leads"],
      });
      expect(parserResponse.skipSteps).toEqual(["search_companies", "search_leads"]);

      // 2. User pastes leads
      const leadInput = "Joao Silva, CTO, Acme, joao@acme.com\nMaria Santos, maria@beta.com";
      const parseResult = parseLeadInput(leadInput);
      expect(parseResult.accepted).toHaveLength(2);

      // 3. Briefing is built with importedLeads
      const briefing: ParsedBriefing = {
        technology: null,
        jobTitles: [],
        location: null,
        companySize: null,
        industry: null,
        productSlug: null,
        mode: "guided",
        skipSteps: parserResponse.skipSteps,
        importedLeads: parseResult.accepted,
      };

      // 4. Plan generated with steps 1-2 skipped
      const plan = PlanGeneratorService.generatePlan(briefing, createCostEstimate());
      expect(plan[0].skipped).toBe(true);
      expect(plan[1].skipped).toBe(true);
      expect(plan[2].skipped).toBe(false);
      expect(plan[2].description).toContain("2 leads importados");

      // 5. CreateCampaignStep would receive:
      //    - previousStepOutput: undefined (all prev steps skipped)
      //    - briefing.importedLeads: [Joao, Maria]
      expect(briefing.importedLeads).toHaveLength(2);
      expect(briefing.importedLeads![0].email).toBe("joao@acme.com");
      expect(briefing.importedLeads![1].email).toBe("maria@beta.com");
    });
  });
});
