/**
 * Instantly API v2 Types Tests
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 * AC: #1, #2, #3, #4 - Type-level assertions for all Instantly types
 */

import { describe, it, expect } from "vitest";
import {
  InstantlyCampaignStatus,
  type InstantlyCampaignSchedule,
  type InstantlyVariant,
  type InstantlySequenceStep,
  type CreateCampaignRequest,
  type CreateCampaignResponse,
  type InstantlyLead,
  type BulkAddLeadsRequest,
  type BulkAddLeadsResponse,
  type ActivateCampaignResponse,
  type GetCampaignResponse,
  type CreateCampaignParams,
  type CreateCampaignResult,
  type AddLeadsParams,
  type AddLeadsResult,
  type ActivateCampaignParams,
  type ActivateResult,
  type GetCampaignStatusParams,
  type CampaignStatusResult,
} from "@/types/instantly";

describe("instantly types", () => {
  // ==============================================
  // CAMPAIGN STATUS ENUM (AC: #4)
  // ==============================================

  describe("InstantlyCampaignStatus", () => {
    it("should have correct numeric values", () => {
      expect(InstantlyCampaignStatus.Draft).toBe(0);
      expect(InstantlyCampaignStatus.Active).toBe(1);
      expect(InstantlyCampaignStatus.Paused).toBe(2);
      expect(InstantlyCampaignStatus.Completed).toBe(3);
      expect(InstantlyCampaignStatus.RunningSubsequences).toBe(4);
      expect(InstantlyCampaignStatus.AccountSuspended).toBe(-99);
      expect(InstantlyCampaignStatus.AccountsUnhealthy).toBe(-1);
      expect(InstantlyCampaignStatus.BounceProtect).toBe(-2);
    });
  });

  // ==============================================
  // CAMPAIGN CREATION TYPES (AC: #2)
  // ==============================================

  describe("InstantlyCampaignSchedule", () => {
    it("should accept valid schedule with business hours", () => {
      const schedule: InstantlyCampaignSchedule = {
        schedules: [
          {
            name: "Horário Comercial",
            timing: { from: "09:00", to: "17:00" },
            days: {
              "0": false,
              "1": true,
              "2": true,
              "3": true,
              "4": true,
              "5": true,
              "6": false,
            },
            timezone: "America/Sao_Paulo",
          },
        ],
      };

      expect(schedule.schedules).toHaveLength(1);
      expect(schedule.schedules[0].timing.from).toBe("09:00");
      expect(schedule.schedules[0].timezone).toBe("America/Sao_Paulo");
    });
  });

  describe("InstantlyVariant", () => {
    it("should accept subject and body with template variables", () => {
      const variant: InstantlyVariant = {
        subject: "Olá {{first_name}}, sobre {{company_name}}",
        body: "{{ice_breaker}}\n\nNa {{company_name}}...",
      };

      expect(variant.subject).toContain("{{first_name}}");
      expect(variant.body).toContain("{{ice_breaker}}");
    });
  });

  describe("InstantlySequenceStep", () => {
    it("should have type email, delay number, and variants array", () => {
      const step: InstantlySequenceStep = {
        type: "email",
        delay: 0,
        variants: [{ subject: "Test", body: "Body" }],
      };

      expect(step.type).toBe("email");
      expect(step.delay).toBe(0);
      expect(step.variants).toHaveLength(1);
    });
  });

  describe("CreateCampaignRequest", () => {
    it("should accept name, schedule, and sequences", () => {
      const request: CreateCampaignRequest = {
        name: "Campanha Teste",
        campaign_schedule: {
          schedules: [
            {
              name: "Default",
              timing: { from: "09:00", to: "17:00" },
              days: { "1": true, "2": true, "3": true, "4": true, "5": true, "0": false, "6": false },
              timezone: "America/Sao_Paulo",
            },
          ],
        },
        sequences: [
          {
            steps: [
              { type: "email", delay: 0, variants: [{ subject: "S1", body: "B1" }] },
              { type: "email", delay: 3, variants: [{ subject: "S2", body: "B2" }] },
            ],
          },
        ],
      };

      expect(request.name).toBe("Campanha Teste");
      expect(request.sequences).toHaveLength(1);
      expect(request.sequences[0].steps).toHaveLength(2);
      expect(request.sequences[0].steps[0].delay).toBe(0);
      expect(request.sequences[0].steps[1].delay).toBe(3);
    });
  });

  describe("CreateCampaignResponse", () => {
    it("should have id, name, and status", () => {
      const response: CreateCampaignResponse = {
        id: "camp-123",
        name: "Campanha Teste",
        status: 0,
      };

      expect(response.id).toBe("camp-123");
      expect(response.status).toBe(InstantlyCampaignStatus.Draft);
    });
  });

  // ==============================================
  // LEAD TYPES (AC: #3)
  // ==============================================

  describe("InstantlyLead", () => {
    it("should require email and accept optional native fields", () => {
      const lead: InstantlyLead = {
        email: "john@example.com",
        first_name: "John",
        last_name: "Doe",
        company_name: "Acme",
      };

      expect(lead.email).toBe("john@example.com");
      expect(lead.first_name).toBe("John");
    });

    it("should support custom_variables for title and ice_breaker", () => {
      const lead: InstantlyLead = {
        email: "maria@empresa.com",
        first_name: "Maria",
        custom_variables: {
          title: "CTO",
          ice_breaker: "Vi seu post sobre IA generativa...",
        },
      };

      expect(lead.custom_variables?.title).toBe("CTO");
      expect(lead.custom_variables?.ice_breaker).toContain("IA generativa");
    });

    it("should accept minimal lead with email only", () => {
      const lead: InstantlyLead = { email: "min@test.com" };
      expect(lead.email).toBe("min@test.com");
      expect(lead.first_name).toBeUndefined();
      expect(lead.custom_variables).toBeUndefined();
    });
  });

  describe("BulkAddLeadsRequest", () => {
    it("should accept campaign_id, flags, and leads array", () => {
      const request: BulkAddLeadsRequest = {
        campaign_id: "camp-123",
        skip_if_in_campaign: true,
        verify_leads_on_import: false,
        leads: [{ email: "a@b.com" }, { email: "c@d.com" }],
      };

      expect(request.campaign_id).toBe("camp-123");
      expect(request.skip_if_in_campaign).toBe(true);
      expect(request.verify_leads_on_import).toBe(false);
      expect(request.leads).toHaveLength(2);
    });
  });

  describe("BulkAddLeadsResponse", () => {
    it("should include upload counts and created_leads", () => {
      const response: BulkAddLeadsResponse = {
        status: "success",
        leads_uploaded: 2,
        duplicated_leads: 0,
        invalid_email_count: 0,
        remaining_in_plan: 9998,
        created_leads: [
          { id: "lead-1", email: "a@b.com", index: 0 },
          { id: "lead-2", email: "c@d.com", index: 1 },
        ],
      };

      expect(response.leads_uploaded).toBe(2);
      expect(response.remaining_in_plan).toBe(9998);
      expect(response.created_leads).toHaveLength(2);
    });
  });

  // ==============================================
  // ACTIVATE/STATUS TYPES (AC: #4)
  // ==============================================

  describe("ActivateCampaignResponse", () => {
    it("should have success boolean", () => {
      const response: ActivateCampaignResponse = { success: true };
      expect(response.success).toBe(true);
    });
  });

  describe("GetCampaignResponse", () => {
    it("should have id, name, and numeric status", () => {
      const response: GetCampaignResponse = {
        id: "camp-123",
        name: "Minha Campanha",
        status: 1,
      };

      expect(response.id).toBe("camp-123");
      expect(response.status).toBe(InstantlyCampaignStatus.Active);
    });
  });

  // ==============================================
  // SERVICE PARAM/RESULT TYPES
  // ==============================================

  describe("CreateCampaignParams", () => {
    it("should accept apiKey, name, and sequences", () => {
      const params: CreateCampaignParams = {
        apiKey: "key-123",
        name: "Campanha",
        sequences: [
          { subject: "Email 1", body: "Corpo 1", delayDays: 0 },
          { subject: "Email 2", body: "Corpo 2", delayDays: 3 },
        ],
      };

      expect(params.sequences).toHaveLength(2);
      expect(params.sequences[0].delayDays).toBe(0);
    });
  });

  describe("CreateCampaignResult", () => {
    it("should have campaignId, name, status", () => {
      const result: CreateCampaignResult = {
        campaignId: "camp-abc",
        name: "Campanha",
        status: 0,
      };

      expect(result.campaignId).toBe("camp-abc");
    });
  });

  describe("AddLeadsParams", () => {
    it("should accept apiKey, campaignId, and leads with internal field names", () => {
      const params: AddLeadsParams = {
        apiKey: "key-123",
        campaignId: "camp-abc",
        leads: [
          {
            email: "john@acme.com",
            firstName: "John",
            lastName: "Doe",
            companyName: "Acme",
            title: "CTO",
            icebreaker: "Vi seu post...",
          },
        ],
      };

      expect(params.leads[0].firstName).toBe("John");
      expect(params.leads[0].icebreaker).toContain("post");
    });
  });

  describe("AddLeadsResult", () => {
    it("should have aggregated batch results", () => {
      const result: AddLeadsResult = {
        leadsUploaded: 1500,
        duplicatedLeads: 10,
        invalidEmails: 2,
        remainingInPlan: 8488,
      };

      expect(result.leadsUploaded).toBe(1500);
      expect(result.duplicatedLeads).toBe(10);
    });
  });

  describe("ActivateCampaignParams", () => {
    it("should accept apiKey and campaignId", () => {
      const params: ActivateCampaignParams = {
        apiKey: "key-123",
        campaignId: "camp-abc",
      };

      expect(params.apiKey).toBe("key-123");
      expect(params.campaignId).toBe("camp-abc");
    });
  });

  describe("ActivateResult", () => {
    it("should have success boolean", () => {
      const result: ActivateResult = { success: true };
      expect(result.success).toBe(true);
    });
  });

  describe("GetCampaignStatusParams", () => {
    it("should accept apiKey and campaignId", () => {
      const params: GetCampaignStatusParams = {
        apiKey: "key-456",
        campaignId: "camp-xyz",
      };

      expect(params.apiKey).toBe("key-456");
      expect(params.campaignId).toBe("camp-xyz");
    });
  });

  describe("CampaignStatusResult", () => {
    it("should have campaignId, name, status, and PT-BR label", () => {
      const result: CampaignStatusResult = {
        campaignId: "camp-abc",
        name: "Campanha Teste",
        status: 1,
        statusLabel: "Ativa",
      };

      expect(result.statusLabel).toBe("Ativa");
    });
  });
});
