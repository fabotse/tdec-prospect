/**
 * Unit tests for Instantly Service
 * Story: 2.3 - Integration Connection Testing
 * Story 7.2: Instantly Integration Service - Gestão de Campanhas
 *
 * Tests V2 API with Bearer token authentication
 * Tests: createCampaign, addLeadsToCampaign, activateCampaign, getCampaignStatus
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InstantlyService } from "@/lib/services/instantly";
import { ERROR_MESSAGES, ExternalServiceError } from "@/lib/services/base-service";
import {
  createMockFetch,
  mockJsonResponse,
  mockErrorResponse,
  restoreFetch,
} from "../../../helpers/mock-fetch";
import { InstantlyCampaignStatus } from "@/types/instantly";
import {
  MAX_LEADS_PER_BATCH,
  INSTANTLY_CAMPAIGN_STATUS_LABELS,
  textToEmailHtml,
} from "@/lib/services/instantly";

describe("InstantlyService", () => {
  let service: InstantlyService;

  beforeEach(() => {
    service = new InstantlyService();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  // ==============================================
  // CONSTANTS (moved from types — H1 code review fix)
  // ==============================================

  describe("MAX_LEADS_PER_BATCH", () => {
    it("should be 1000", () => {
      expect(MAX_LEADS_PER_BATCH).toBe(1000);
    });
  });

  describe("INSTANTLY_CAMPAIGN_STATUS_LABELS", () => {
    it("should have PT-BR labels for all known statuses", () => {
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[0]).toBe("Rascunho");
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[1]).toBe("Ativa");
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[2]).toBe("Pausada");
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[3]).toBe("Concluída");
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[4]).toBe("Executando subsequências");
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[-99]).toBe("Conta suspensa");
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[-1]).toBe("Contas com problema");
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[-2]).toBe("Proteção de bounce");
    });

    it("should return undefined for unknown status", () => {
      expect(INSTANTLY_CAMPAIGN_STATUS_LABELS[999]).toBeUndefined();
    });
  });

  // ==============================================
  // textToEmailHtml (Story 7.5 — HTML body conversion)
  // ==============================================

  describe("textToEmailHtml", () => {
    it("returns empty string for empty input", () => {
      expect(textToEmailHtml("")).toBe("");
    });

    it("wraps simple text in <p> tags", () => {
      expect(textToEmailHtml("Hello world")).toBe("<p>Hello world</p>");
    });

    it("converts single \\n to <br>", () => {
      expect(textToEmailHtml("Line 1\nLine 2")).toBe("<p>Line 1<br>Line 2</p>");
    });

    it("converts double \\n to paragraph break", () => {
      expect(textToEmailHtml("Para 1\n\nPara 2")).toBe("<p>Para 1</p><p>Para 2</p>");
    });

    it("handles mixed single and double newlines", () => {
      expect(textToEmailHtml("A\nB\n\nC\nD")).toBe("<p>A<br>B</p><p>C<br>D</p>");
    });

    it("escapes HTML entities", () => {
      expect(textToEmailHtml("a < b & c > d")).toBe("<p>a &lt; b &amp; c &gt; d</p>");
    });

    it("preserves {{variables}} in output", () => {
      const result = textToEmailHtml("Olá {{first_name}}\n\n{{ice_breaker}}");
      expect(result).toContain("{{first_name}}");
      expect(result).toContain("{{ice_breaker}}");
      expect(result).toBe("<p>Olá {{first_name}}</p><p>{{ice_breaker}}</p>");
    });

    it("handles triple+ newlines as single paragraph break", () => {
      expect(textToEmailHtml("A\n\n\nB")).toBe("<p>A</p><p>B</p>");
    });
  });

  // ==============================================
  // testConnection (Story 2.3 — existing tests)
  // ==============================================

  describe("testConnection", () => {
    it("returns success on 200 response", async () => {
      createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({
            items: [{ email: "user@example.com" }],
            total_count: 1,
          }),
        },
      ]);

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
      expect(result.message).toBe(ERROR_MESSAGES.SUCCESS);
      expect(result.testedAt).toBeDefined();
    });

    it("returns error on 401", async () => {
      createMockFetch([
        { url: /instantly\.ai/, response: mockErrorResponse(401) },
      ]);

      const result = await service.testConnection("invalid-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.UNAUTHORIZED);
    });

    it("returns error on 403", async () => {
      createMockFetch([
        { url: /instantly\.ai/, response: mockErrorResponse(403) },
      ]);

      const result = await service.testConnection("insufficient-scopes-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.FORBIDDEN);
    });

    it("returns error on 429", async () => {
      createMockFetch([
        { url: /instantly\.ai/, response: mockErrorResponse(429) },
      ]);

      const result = await service.testConnection("test-key");

      expect(result.success).toBe(false);
      expect(result.message).toBe(ERROR_MESSAGES.RATE_LIMITED);
    });

    it("uses V2 API endpoint with Bearer token", async () => {
      const { mock } = createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({ items: [], total_count: 0 }),
        },
      ]);

      await service.testConnection("test-api-key");

      // Should call V2 accounts endpoint
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v2/accounts"),
        expect.any(Object)
      );

      // Should use Bearer token in Authorization header
      expect(mock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("calls correct domain", async () => {
      const { mock } = createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({ items: [], total_count: 0 }),
        },
      ]);

      await service.testConnection("test-api-key");

      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("api.instantly.ai"),
        expect.any(Object)
      );
    });

    it("handles empty response body", async () => {
      createMockFetch([
        {
          url: /instantly\.ai/,
          response: mockJsonResponse({ items: [], total_count: 0 }),
        },
      ]);

      const result = await service.testConnection("test-api-key");

      expect(result.success).toBe(true);
    });
  });

  describe("service properties", () => {
    it("has correct service name", () => {
      expect(service.name).toBe("instantly");
    });
  });

  // ==============================================
  // createCampaign (Story 7.2 AC: #2)
  // ==============================================

  describe("createCampaign", () => {
    const mockCampaignResponse = {
      id: "camp-123",
      name: "Campanha Teste",
      status: 0,
    };

    it("creates campaign with single email sequence", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      const result = await service.createCampaign({
        apiKey: "test-key",
        name: "Campanha Teste",
        sequences: [
          { subject: "Assunto 1", body: "Corpo 1", delayDays: 0 },
        ],
      });

      expect(result.campaignId).toBe("camp-123");
      expect(result.name).toBe("Campanha Teste");
      expect(result.status).toBe(InstantlyCampaignStatus.Draft);

      const body = calls()[0].body as Record<string, unknown>;
      expect(body.name).toBe("Campanha Teste");

      const sequences = body.sequences as Array<{ steps: Array<{ type: string; delay: number; variants: Array<{ subject: string; body: string }> }> }>;
      expect(sequences).toHaveLength(1);
      expect(sequences[0].steps).toHaveLength(1);
      expect(sequences[0].steps[0].type).toBe("email");
      expect(sequences[0].steps[0].delay).toBe(0);
      expect(sequences[0].steps[0].variants[0].subject).toBe("Assunto 1");
      // Body is converted to HTML for proper rendering in Instantly
      expect(sequences[0].steps[0].variants[0].body).toBe("<p>Corpo 1</p>");
    });

    it("includes stop_on_reply, open_tracking, and link_tracking in request", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      await service.createCampaign({
        apiKey: "test-key",
        name: "Config Test",
        sequences: [{ subject: "S", body: "B", delayDays: 0 }],
      });

      const body = calls()[0].body as Record<string, unknown>;
      expect(body.stop_on_reply).toBe(true);
      expect(body.open_tracking).toBe(true);
      expect(body.link_tracking).toBe(true);
    });

    it("creates campaign with multiple email steps and delays mapped to NEXT email", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      await service.createCampaign({
        apiKey: "test-key",
        name: "Multi-Step",
        sequences: [
          { subject: "S1", body: "B1", delayDays: 0 },
          { subject: "S2", body: "B2", delayDays: 3 },
          { subject: "S3", body: "B3", delayDays: 5 },
        ],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const sequences = body.sequences as Array<{ steps: Array<{ delay: number }> }>;
      expect(sequences[0].steps).toHaveLength(3);
      // Instantly API: delay = "delay before sending the NEXT email"
      // step[0].delay = sequences[1].delayDays (delay before step 1)
      // step[1].delay = sequences[2].delayDays (delay before step 2)
      // step[2].delay = 0 (last step, no next email)
      expect(sequences[0].steps[0].delay).toBe(3);
      expect(sequences[0].steps[1].delay).toBe(5);
      expect(sequences[0].steps[2].delay).toBe(0);
    });

    it("includes default campaign schedule with Brazilian business hours", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      await service.createCampaign({
        apiKey: "test-key",
        name: "Test",
        sequences: [{ subject: "S", body: "B", delayDays: 0 }],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const schedule = body.campaign_schedule as {
        schedules: Array<{
          timing: { from: string; to: string };
          timezone: string;
          days: Record<string, boolean>;
        }>;
      };

      expect(schedule.schedules[0].timing.from).toBe("09:00");
      expect(schedule.schedules[0].timing.to).toBe("17:00");
      expect(schedule.schedules[0].timezone).toBe("America/Sao_Paulo");
      // Mon-Fri enabled, Sat-Sun disabled
      expect(schedule.schedules[0].days["1"]).toBe(true);
      expect(schedule.schedules[0].days["5"]).toBe(true);
      expect(schedule.schedules[0].days["0"]).toBe(false);
      expect(schedule.schedules[0].days["6"]).toBe(false);
    });

    it("sends correct URL and Bearer token", async () => {
      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      await service.createCampaign({
        apiKey: "my-api-key",
        name: "Test",
        sequences: [{ subject: "S", body: "B", delayDays: 0 }],
      });

      expect(mock).toHaveBeenCalledWith(
        "https://api.instantly.ai/api/v2/campaigns",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer my-api-key",
          }),
        })
      );
    });

    it("preserves template variables in email content (no resolution)", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      await service.createCampaign({
        apiKey: "key",
        name: "Template Test",
        sequences: [
          {
            subject: "Olá {{first_name}}, sobre {{company_name}}",
            body: "{{ice_breaker}}\n\nNa {{company_name}}...",
            delayDays: 0,
          },
        ],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const sequences = body.sequences as Array<{ steps: Array<{ variants: Array<{ subject: string; body: string }> }> }>;
      // Subject is NOT converted to HTML
      expect(sequences[0].steps[0].variants[0].subject).toContain("{{first_name}}");
      // Body is HTML but variables are preserved
      expect(sequences[0].steps[0].variants[0].body).toContain("{{ice_breaker}}");
      expect(sequences[0].steps[0].variants[0].body).toContain("{{company_name}}");
    });

    it("converts \\n line breaks to HTML in email body for Instantly rendering", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      await service.createCampaign({
        apiKey: "key",
        name: "LineBreaks Test",
        sequences: [
          {
            subject: "Assunto",
            body: "Primeira linha\nSegunda linha\n\nTerceira linha",
            delayDays: 0,
          },
        ],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const sequences = body.sequences as Array<{ steps: Array<{ variants: Array<{ subject: string; body: string }> }> }>;
      const emailBody = sequences[0].steps[0].variants[0].body;
      // Double newline (\n\n) becomes paragraph break, single \n becomes <br>
      expect(emailBody).toBe("<p>Primeira linha<br>Segunda linha</p><p>Terceira linha</p>");
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.createCampaign({
          apiKey: "bad-key",
          name: "Test",
          sequences: [{ subject: "S", body: "B", delayDays: 0 }],
        })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 429", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockErrorResponse(429),
        },
      ]);

      await expect(
        service.createCampaign({
          apiKey: "key",
          name: "Test",
          sequences: [{ subject: "S", body: "B", delayDays: 0 }],
        })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("maps delay to NEXT step - step[0] gets sequences[1].delay, last step gets 0 (H2)", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns$/,
          method: "POST",
          response: mockJsonResponse(mockCampaignResponse),
        },
      ]);

      await service.createCampaign({
        apiKey: "key",
        name: "Test",
        sequences: [
          { subject: "S1", body: "B1", delayDays: 5 },
          { subject: "S2", body: "B2", delayDays: 3 },
        ],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const sequences = body.sequences as Array<{ steps: Array<{ delay: number }> }>;
      // step[0].delay = sequences[1].delayDays = 3 (delay before next email)
      expect(sequences[0].steps[0].delay).toBe(3);
      // step[1].delay = 0 (last step, no next email)
      expect(sequences[0].steps[1].delay).toBe(0);
    });
  });

  // ==============================================
  // addLeadsToCampaign (Story 7.2 AC: #3)
  // ==============================================

  describe("addLeadsToCampaign", () => {
    const mockBulkResponse = {
      status: "success",
      leads_uploaded: 2,
      duplicated_leads: 0,
      invalid_email_count: 0,
      remaining_in_plan: 9998,
      created_leads: [
        { id: "l1", email: "a@b.com", index: 0 },
        { id: "l2", email: "c@d.com", index: 1 },
      ],
    };

    it("adds leads with correct field mapping (native + custom_variables)", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse(mockBulkResponse),
        },
      ]);

      await service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads: [
          {
            email: "john@acme.com",
            firstName: "John",
            lastName: "Doe",
            companyName: "Acme",
            phone: "+5511999",
            title: "CTO",
            icebreaker: "Vi seu post sobre IA...",
          },
        ],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const leads = body.leads as Array<Record<string, unknown>>;
      expect(leads[0].email).toBe("john@acme.com");
      expect(leads[0].first_name).toBe("John");
      expect(leads[0].last_name).toBe("Doe");
      expect(leads[0].company_name).toBe("Acme");
      expect(leads[0].phone).toBe("+5511999");

      // title and icebreaker go in custom_variables
      const cv = leads[0].custom_variables as Record<string, string>;
      expect(cv.title).toBe("CTO");
      expect(cv.ice_breaker).toBe("Vi seu post sobre IA...");
    });

    it("filters leads without email", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse({ ...mockBulkResponse, leads_uploaded: 1 }),
        },
      ]);

      await service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads: [
          { email: "valid@test.com", firstName: "Valid" },
          { email: "", firstName: "NoEmail" },
        ],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const leads = body.leads as Array<Record<string, unknown>>;
      expect(leads).toHaveLength(1);
      expect(leads[0].email).toBe("valid@test.com");
    });

    it("omits custom_variables when lead has no title or icebreaker", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse(mockBulkResponse),
        },
      ]);

      await service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads: [{ email: "plain@test.com", firstName: "Plain" }],
      });

      const body = calls()[0].body as Record<string, unknown>;
      const leads = body.leads as Array<Record<string, unknown>>;
      expect(leads[0].custom_variables).toBeUndefined();
    });

    it("sets skip_if_in_campaign=false, skip_if_in_workspace=false, verify_leads_on_import=false", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse(mockBulkResponse),
        },
      ]);

      await service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads: [{ email: "a@b.com" }],
      });

      const body = calls()[0].body as Record<string, unknown>;
      expect(body.skip_if_in_campaign).toBe(false);
      expect(body.skip_if_in_workspace).toBe(false);
      expect(body.verify_leads_on_import).toBe(false);
    });

    it("sends leads in 1 batch when count <= 1000", async () => {
      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse(mockBulkResponse),
        },
      ]);

      const leads = Array.from({ length: 999 }, (_, i) => ({
        email: `lead${i}@test.com`,
      }));

      await service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads,
      });

      // Only 1 fetch call for leads endpoint
      const leadsCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("/leads/add")
      );
      expect(leadsCalls).toHaveLength(1);
    });

    it("sends exactly 1000 leads in 1 batch", async () => {
      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse(mockBulkResponse),
        },
      ]);

      const leads = Array.from({ length: 1000 }, (_, i) => ({
        email: `lead${i}@test.com`,
      }));

      await service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads,
      });

      const leadsCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("/leads/add")
      );
      expect(leadsCalls).toHaveLength(1);
    });

    it("batches 1001 leads into 2 requests", async () => {
      vi.useFakeTimers();

      const { mock, calls } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse({
            ...mockBulkResponse,
            leads_uploaded: 1000,
            remaining_in_plan: 8999,
          }),
        },
      ]);

      const leads = Array.from({ length: 1001 }, (_, i) => ({
        email: `lead${i}@test.com`,
      }));

      const promise = service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads,
      });

      // Advance past rate limit delay
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      const leadsCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("/leads/add")
      );
      expect(leadsCalls).toHaveLength(2);

      // First batch: 1000, second batch: 1
      const firstBody = calls().filter(c => c.url.includes("/leads/add"))[0].body as { leads: unknown[] };
      const secondBody = calls().filter(c => c.url.includes("/leads/add"))[1].body as { leads: unknown[] };
      expect(firstBody.leads).toHaveLength(1000);
      expect(secondBody.leads).toHaveLength(1);

      vi.useRealTimers();
    });

    it("batches 2500 leads into 3 requests", async () => {
      vi.useFakeTimers();

      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse({
            ...mockBulkResponse,
            leads_uploaded: 1000,
          }),
        },
      ]);

      const leads = Array.from({ length: 2500 }, (_, i) => ({
        email: `lead${i}@test.com`,
      }));

      const promise = service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads,
      });

      // Advance timers for rate limiting delays between batches
      await vi.advanceTimersByTimeAsync(500);

      await promise;

      const leadsCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("/leads/add")
      );
      expect(leadsCalls).toHaveLength(3);

      vi.useRealTimers();
    });

    it("aggregates results from multiple batches", async () => {
      vi.useFakeTimers();

      let callCount = 0;
      createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: {
            ok: true,
            status: 200,
            json: () => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({
                  status: "success",
                  leads_uploaded: 1000,
                  duplicated_leads: 5,
                  invalid_email_count: 1,
                  remaining_in_plan: 8994,
                  created_leads: [],
                });
              }
              return Promise.resolve({
                status: "success",
                leads_uploaded: 500,
                duplicated_leads: 3,
                invalid_email_count: 2,
                remaining_in_plan: 8489,
                created_leads: [],
              });
            },
            text: () => Promise.resolve(""),
          },
        },
      ]);

      const leads = Array.from({ length: 1500 }, (_, i) => ({
        email: `lead${i}@test.com`,
      }));

      const promise = service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads,
      });

      await vi.advanceTimersByTimeAsync(300);

      const result = await promise;

      expect(result.leadsUploaded).toBe(1500);
      expect(result.duplicatedLeads).toBe(8);
      expect(result.invalidEmails).toBe(3);
      expect(result.remainingInPlan).toBe(8489);

      vi.useRealTimers();
    });

    it("returns -1 remainingInPlan when all leads filtered — no API call made (M4)", async () => {
      const result = await service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads: [
          { email: "", firstName: "A" },
          { email: "", firstName: "B" },
        ],
      });

      expect(result.leadsUploaded).toBe(0);
      expect(result.duplicatedLeads).toBe(0);
      expect(result.invalidEmails).toBe(0);
      expect(result.remainingInPlan).toBe(-1);
    });

    it("includes partial results in error details on batch failure (H3)", async () => {
      vi.useFakeTimers();

      let callCount = 0;
      createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: {
            get ok() {
              callCount++;
              return callCount <= 1;
            },
            get status() {
              return callCount <= 1 ? 200 : 429;
            },
            json: () =>
              Promise.resolve({
                status: "success",
                leads_uploaded: 1000,
                duplicated_leads: 2,
                invalid_email_count: 0,
                remaining_in_plan: 8998,
                created_leads: [],
              }),
            text: () => Promise.resolve(""),
          },
        },
      ]);

      const leads = Array.from({ length: 1500 }, (_, i) => ({
        email: `lead${i}@test.com`,
      }));

      let caughtError: unknown;
      const promise = service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads,
      }).catch((e: unknown) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(300);
      await promise;

      expect(caughtError).toBeInstanceOf(ExternalServiceError);
      const serviceError = caughtError as ExternalServiceError;
      const details = serviceError.details as {
        partialResults: { leadsUploaded: number; duplicatedLeads: number; remainingInPlan: number };
        batchesCompleted: number;
        totalBatches: number;
      };
      expect(details.partialResults.leadsUploaded).toBe(1000);
      expect(details.partialResults.duplicatedLeads).toBe(2);
      expect(details.partialResults.remainingInPlan).toBe(8998);
      expect(details.batchesCompleted).toBe(1);
      expect(details.totalBatches).toBe(2);

      vi.useRealTimers();
    });

    it("applies 150ms rate limit delay between batches (M3)", async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse(mockBulkResponse),
        },
      ]);

      const leads = Array.from({ length: 1001 }, (_, i) => ({
        email: `lead${i}@test.com`,
      }));

      const promise = service.addLeadsToCampaign({
        apiKey: "key",
        campaignId: "camp-123",
        leads,
      });

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      const delayCalls = setTimeoutSpy.mock.calls.filter(
        ([, ms]) => ms === 150
      );
      expect(delayCalls.length).toBeGreaterThanOrEqual(1);

      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.addLeadsToCampaign({
          apiKey: "bad-key",
          campaignId: "camp-123",
          leads: [{ email: "a@b.com" }],
        })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 500", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockErrorResponse(500),
        },
      ]);

      await expect(
        service.addLeadsToCampaign({
          apiKey: "key",
          campaignId: "camp-123",
          leads: [{ email: "a@b.com" }],
        })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("sends Bearer token in all batch requests", async () => {
      const { calls: getCalls } = createMockFetch([
        {
          url: /\/api\/v2\/leads\/add/,
          method: "POST",
          response: mockJsonResponse(mockBulkResponse),
        },
      ]);

      await service.addLeadsToCampaign({
        apiKey: "my-secret-key",
        campaignId: "camp-123",
        leads: [{ email: "a@b.com" }],
      });

      const leadsCall = getCalls().find(c => c.url.includes("/leads/add"));
      expect(leadsCall?.headers?.Authorization).toBe("Bearer my-secret-key");
    });
  });

  // ==============================================
  // addAccountsToCampaign (Story 7.5 AC: #1)
  // ==============================================

  describe("addAccountsToCampaign", () => {
    it("adds accounts to campaign successfully", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/account-campaign-mappings/,
          method: "POST",
          response: mockJsonResponse({
            campaign_id: "camp-123",
            email_account: "sender@example.com",
            status: "active",
          }),
        },
      ]);

      const result = await service.addAccountsToCampaign({
        apiKey: "test-key",
        campaignId: "camp-123",
        accountEmails: ["sender@example.com"],
      });

      expect(result.success).toBe(true);
      expect(result.accountsAdded).toBe(1);

      const body = calls()[0].body as Record<string, unknown>;
      expect(body.campaign_id).toBe("camp-123");
      expect(body.email_account).toBe("sender@example.com");
    });

    it("returns success with 0 accounts when empty array", async () => {
      const result = await service.addAccountsToCampaign({
        apiKey: "test-key",
        campaignId: "camp-123",
        accountEmails: [],
      });

      expect(result.success).toBe(true);
      expect(result.accountsAdded).toBe(0);
    });

    it("adds multiple accounts with rate limiting", async () => {
      vi.useFakeTimers();

      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/account-campaign-mappings/,
          method: "POST",
          response: mockJsonResponse({
            campaign_id: "camp-123",
            email_account: "sender@example.com",
            status: "active",
          }),
        },
      ]);

      const promise = service.addAccountsToCampaign({
        apiKey: "test-key",
        campaignId: "camp-123",
        accountEmails: ["s1@test.com", "s2@test.com", "s3@test.com"],
      });

      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.accountsAdded).toBe(3);

      const mappingCalls = mock.mock.calls.filter(
        (c: [string]) => typeof c[0] === "string" && c[0].includes("/account-campaign-mappings")
      );
      expect(mappingCalls).toHaveLength(3);

      vi.useRealTimers();
    });

    it("throws ExternalServiceError on API failure", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/account-campaign-mappings/,
          method: "POST",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.addAccountsToCampaign({
          apiKey: "bad-key",
          campaignId: "camp-123",
          accountEmails: ["sender@test.com"],
        })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("sends Bearer token in requests", async () => {
      const { calls } = createMockFetch([
        {
          url: /\/api\/v2\/account-campaign-mappings/,
          method: "POST",
          response: mockJsonResponse({
            campaign_id: "camp-123",
            email_account: "sender@test.com",
            status: "active",
          }),
        },
      ]);

      await service.addAccountsToCampaign({
        apiKey: "my-secret",
        campaignId: "camp-123",
        accountEmails: ["sender@test.com"],
      });

      expect(calls()[0].headers?.Authorization).toBe("Bearer my-secret");
    });
  });

  // ==============================================
  // listAccounts (Story 7.4 AC: #4)
  // ==============================================

  describe("listAccounts", () => {
    const mockAccountsResponse = {
      items: [
        { email: "sender1@company.com", first_name: "Ana", last_name: "Silva" },
        { email: "sender2@company.com", first_name: "João" },
      ],
      total_count: 2,
    };

    it("returns accounts on success", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/accounts/,
          method: "GET",
          response: mockJsonResponse(mockAccountsResponse),
        },
      ]);

      const result = await service.listAccounts({ apiKey: "test-key" });

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0].email).toBe("sender1@company.com");
      expect(result.accounts[1].email).toBe("sender2@company.com");
      expect(result.totalCount).toBe(2);
    });

    it("returns empty array when no accounts configured", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/accounts/,
          method: "GET",
          response: mockJsonResponse({ items: [], total_count: 0 }),
        },
      ]);

      const result = await service.listAccounts({ apiKey: "test-key" });

      expect(result.accounts).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it("uses default limit=100 when not specified", async () => {
      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/accounts/,
          method: "GET",
          response: mockJsonResponse(mockAccountsResponse),
        },
      ]);

      await service.listAccounts({ apiKey: "test-key" });

      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining("limit=100"),
        expect.any(Object)
      );
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/accounts/,
          method: "GET",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.listAccounts({ apiKey: "bad-key" })
      ).rejects.toThrow(ExternalServiceError);
    });
  });

  // ==============================================
  // activateCampaign (Story 7.2 AC: #4)
  // ==============================================

  describe("activateCampaign", () => {
    it("activates campaign and returns success", async () => {
      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/camp-123\/activate/,
          method: "POST",
          response: mockJsonResponse({ success: true }),
        },
      ]);

      const result = await service.activateCampaign({ apiKey: "api-key", campaignId: "camp-123" });

      expect(result.success).toBe(true);
      expect(mock).toHaveBeenCalledWith(
        "https://api.instantly.ai/api/v2/campaigns/camp-123/activate",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer api-key",
          }),
        })
      );
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/.*\/activate/,
          method: "POST",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.activateCampaign({ apiKey: "bad-key", campaignId: "camp-123" })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("throws ExternalServiceError on 429", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/.*\/activate/,
          method: "POST",
          response: mockErrorResponse(429),
        },
      ]);

      await expect(
        service.activateCampaign({ apiKey: "key", campaignId: "camp-123" })
      ).rejects.toThrow(ExternalServiceError);
    });
  });

  // ==============================================
  // getCampaignStatus (Story 7.2 AC: #4)
  // ==============================================

  describe("getCampaignStatus", () => {
    it("returns campaign status with PT-BR label for Draft", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/camp-123$/,
          method: "GET",
          response: mockJsonResponse({
            id: "camp-123",
            name: "Minha Campanha",
            status: 0,
          }),
        },
      ]);

      const result = await service.getCampaignStatus({ apiKey: "api-key", campaignId: "camp-123" });

      expect(result.campaignId).toBe("camp-123");
      expect(result.name).toBe("Minha Campanha");
      expect(result.status).toBe(InstantlyCampaignStatus.Draft);
      expect(result.statusLabel).toBe("Rascunho");
    });

    it("returns correct label for Active campaign", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/camp-456$/,
          method: "GET",
          response: mockJsonResponse({
            id: "camp-456",
            name: "Ativa",
            status: 1,
          }),
        },
      ]);

      const result = await service.getCampaignStatus({ apiKey: "api-key", campaignId: "camp-456" });

      expect(result.status).toBe(InstantlyCampaignStatus.Active);
      expect(result.statusLabel).toBe("Ativa");
    });

    it("returns correct label for Paused campaign", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/camp-789$/,
          method: "GET",
          response: mockJsonResponse({
            id: "camp-789",
            name: "Pausada",
            status: 2,
          }),
        },
      ]);

      const result = await service.getCampaignStatus({ apiKey: "api-key", campaignId: "camp-789" });
      expect(result.statusLabel).toBe("Pausada");
    });

    it("returns correct label for Completed campaign", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/camp-done$/,
          method: "GET",
          response: mockJsonResponse({
            id: "camp-done",
            name: "Concluída",
            status: 3,
          }),
        },
      ]);

      const result = await service.getCampaignStatus({ apiKey: "api-key", campaignId: "camp-done" });
      expect(result.statusLabel).toBe("Concluída");
    });

    it("returns 'Desconhecido' for unknown status", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/camp-unknown$/,
          method: "GET",
          response: mockJsonResponse({
            id: "camp-unknown",
            name: "Unknown",
            status: 999,
          }),
        },
      ]);

      const result = await service.getCampaignStatus({ apiKey: "api-key", campaignId: "camp-unknown" });
      expect(result.statusLabel).toBe("Desconhecido");
    });

    it("sends Bearer token and correct URL", async () => {
      const { mock } = createMockFetch([
        {
          url: /\/api\/v2\/campaigns\/camp-123$/,
          method: "GET",
          response: mockJsonResponse({
            id: "camp-123",
            name: "Test",
            status: 0,
          }),
        },
      ]);

      await service.getCampaignStatus({ apiKey: "my-key", campaignId: "camp-123" });

      expect(mock).toHaveBeenCalledWith(
        "https://api.instantly.ai/api/v2/campaigns/camp-123",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer my-key",
          }),
        })
      );
    });

    it("throws ExternalServiceError on 401", async () => {
      createMockFetch([
        {
          url: /\/api\/v2\/campaigns\//,
          method: "GET",
          response: mockErrorResponse(401),
        },
      ]);

      await expect(
        service.getCampaignStatus({ apiKey: "bad-key", campaignId: "camp-123" })
      ).rejects.toThrow(ExternalServiceError);
    });
  });
});
