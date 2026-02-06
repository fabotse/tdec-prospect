/**
 * Snov.io API Types Tests
 * Story 7.3: Snov.io Integration Service - Gestão de Campanhas
 * AC: #1, #2, #3, #4, #5 - Type-level assertions for all Snov.io types
 */

import { describe, it, expect } from "vitest";
import type {
  SnovioTokenResponse,
  CreateListRequest,
  CreateListResponse,
  SnovioList,
  GetUserListsResponse,
  SnovioProspect,
  AddProspectRequest,
  AddProspectResponse,
  SnovioCampaign,
  GetUserCampaignsResponse,
  CreateListParams,
  CreateListResult,
  AddProspectParams,
  AddProspectResult,
  AddProspectsParams,
  AddProspectsResult,
  GetCampaignsParams,
  GetCampaignsResult,
  GetListsParams,
  GetListsResult,
} from "@/types/snovio";

describe("snovio types", () => {
  // ==============================================
  // AUTHENTICATION TYPES (AC: #1)
  // ==============================================

  describe("SnovioTokenResponse", () => {
    it("should have access_token, token_type, and expires_in", () => {
      const response: SnovioTokenResponse = {
        access_token: "abc123",
        token_type: "Bearer",
        expires_in: 3600,
      };

      expect(response.access_token).toBe("abc123");
      expect(response.token_type).toBe("Bearer");
      expect(response.expires_in).toBe(3600);
    });
  });

  // ==============================================
  // LIST TYPES (AC: #2, #5)
  // ==============================================

  describe("CreateListRequest", () => {
    it("should accept access_token and name", () => {
      const request: CreateListRequest = {
        access_token: "token-123",
        name: "Minha Lista",
      };

      expect(request.access_token).toBe("token-123");
      expect(request.name).toBe("Minha Lista");
    });
  });

  describe("CreateListResponse", () => {
    it("should have success, id, and name", () => {
      const response: CreateListResponse = {
        success: true,
        id: 12345,
        name: "Minha Lista",
      };

      expect(response.success).toBe(true);
      expect(response.id).toBe(12345);
    });
  });

  describe("SnovioList", () => {
    it("should have id, name, and contacts count", () => {
      const list: SnovioList = {
        id: 1,
        name: "Prospects Q1",
        contacts: 150,
      };

      expect(list.id).toBe(1);
      expect(list.contacts).toBe(150);
    });
  });

  describe("GetUserListsResponse", () => {
    it("should have success and data array of lists", () => {
      const response: GetUserListsResponse = {
        success: true,
        data: [
          { id: 1, name: "Lista A", contacts: 100 },
          { id: 2, name: "Lista B", contacts: 50 },
        ],
      };

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.data[0].name).toBe("Lista A");
    });
  });

  // ==============================================
  // PROSPECT TYPES (AC: #3)
  // ==============================================

  describe("SnovioProspect", () => {
    it("should require email and accept optional native fields in camelCase", () => {
      const prospect: SnovioProspect = {
        email: "joao@empresa.com",
        firstName: "João",
        lastName: "Silva",
        companyName: "Empresa Ltda",
        position: "CTO",
      };

      expect(prospect.email).toBe("joao@empresa.com");
      expect(prospect.position).toBe("CTO");
    });

    it("should support phones as array of strings", () => {
      const prospect: SnovioProspect = {
        email: "joao@empresa.com",
        phones: ["+5511999999999", "+5511888888888"],
      };

      expect(prospect.phones).toHaveLength(2);
    });

    it("should support customFields bracket notation for ice_breaker", () => {
      const prospect: SnovioProspect = {
        email: "joao@empresa.com",
        "customFields[ice_breaker]": "Parabéns pelo novo cargo de CTO!",
      };

      expect(prospect["customFields[ice_breaker]"]).toContain("CTO");
    });

    it("should accept minimal prospect with email only", () => {
      const prospect: SnovioProspect = { email: "min@test.com" };
      expect(prospect.email).toBe("min@test.com");
      expect(prospect.firstName).toBeUndefined();
      expect(prospect.phones).toBeUndefined();
      expect(prospect["customFields[ice_breaker]"]).toBeUndefined();
    });
  });

  describe("AddProspectRequest", () => {
    it("should extend SnovioProspect with access_token, listId, updateContact", () => {
      const request: AddProspectRequest = {
        access_token: "token-abc",
        email: "joao@empresa.com",
        firstName: "João",
        position: "CTO",
        listId: 12345,
        updateContact: true,
      };

      expect(request.access_token).toBe("token-abc");
      expect(request.listId).toBe(12345);
      expect(request.updateContact).toBe(true);
      expect(request.position).toBe("CTO");
    });
  });

  describe("AddProspectResponse", () => {
    it("should have success, added, and updated flags", () => {
      const response: AddProspectResponse = {
        success: true,
        added: true,
        updated: false,
      };

      expect(response.success).toBe(true);
      expect(response.added).toBe(true);
      expect(response.updated).toBe(false);
    });
  });

  // ==============================================
  // CAMPAIGN TYPES (AC: #4)
  // ==============================================

  describe("SnovioCampaign", () => {
    it("should have id, title, and status", () => {
      const campaign: SnovioCampaign = {
        id: 1,
        title: "Drip Campaign Q1",
        status: "active",
      };

      expect(campaign.id).toBe(1);
      expect(campaign.title).toBe("Drip Campaign Q1");
      expect(campaign.status).toBe("active");
    });
  });

  describe("GetUserCampaignsResponse", () => {
    it("should have success and data array of campaigns", () => {
      const response: GetUserCampaignsResponse = {
        success: true,
        data: [
          { id: 1, title: "Campaign A", status: "active" },
          { id: 2, title: "Campaign B", status: "paused" },
        ],
      };

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
    });
  });

  // ==============================================
  // SERVICE PARAM/RESULT TYPES
  // ==============================================

  describe("CreateListParams", () => {
    it("should accept credentials and name", () => {
      const params: CreateListParams = {
        credentials: "client_id:client_secret",
        name: "Lista de Prospects",
      };

      expect(params.credentials).toContain(":");
      expect(params.name).toBe("Lista de Prospects");
    });
  });

  describe("CreateListResult", () => {
    it("should have listId and name", () => {
      const result: CreateListResult = {
        listId: 12345,
        name: "Lista de Prospects",
      };

      expect(result.listId).toBe(12345);
    });
  });

  describe("AddProspectParams", () => {
    it("should accept credentials, listId, and lead with internal field names", () => {
      const params: AddProspectParams = {
        credentials: "client_id:client_secret",
        listId: 12345,
        lead: {
          email: "joao@empresa.com",
          firstName: "João",
          lastName: "Silva",
          companyName: "Empresa Ltda",
          title: "CTO",
          phone: "+5511999999999",
          icebreaker: "Parabéns pelo novo cargo!",
        },
      };

      expect(params.lead.email).toBe("joao@empresa.com");
      expect(params.lead.title).toBe("CTO");
      expect(params.lead.icebreaker).toContain("cargo");
    });
  });

  describe("AddProspectResult", () => {
    it("should have success, added, and updated", () => {
      const result: AddProspectResult = {
        success: true,
        added: true,
        updated: false,
      };

      expect(result.success).toBe(true);
    });
  });

  describe("AddProspectsParams", () => {
    it("should accept credentials, listId, and leads array", () => {
      const params: AddProspectsParams = {
        credentials: "client_id:client_secret",
        listId: 12345,
        leads: [
          { email: "a@b.com", firstName: "A" },
          { email: "c@d.com", firstName: "C" },
        ],
      };

      expect(params.leads).toHaveLength(2);
    });
  });

  describe("AddProspectsResult", () => {
    it("should have aggregated results: added, updated, errors, totalProcessed", () => {
      const result: AddProspectsResult = {
        added: 8,
        updated: 1,
        errors: 1,
        totalProcessed: 10,
      };

      expect(result.added).toBe(8);
      expect(result.errors).toBe(1);
      expect(result.totalProcessed).toBe(10);
    });
  });

  describe("GetCampaignsParams", () => {
    it("should accept credentials", () => {
      const params: GetCampaignsParams = {
        credentials: "client_id:client_secret",
      };

      expect(params.credentials).toContain(":");
    });
  });

  describe("GetCampaignsResult", () => {
    it("should have campaigns array with id, title, status", () => {
      const result: GetCampaignsResult = {
        campaigns: [
          { id: 1, title: "Campaign A", status: "active" },
          { id: 2, title: "Campaign B", status: "paused" },
        ],
      };

      expect(result.campaigns).toHaveLength(2);
      expect(result.campaigns[0].title).toBe("Campaign A");
    });
  });

  describe("GetListsParams", () => {
    it("should accept credentials", () => {
      const params: GetListsParams = {
        credentials: "client_id:client_secret",
      };

      expect(params.credentials).toContain(":");
    });
  });

  describe("GetListsResult", () => {
    it("should have lists array with id, name, contacts", () => {
      const result: GetListsResult = {
        lists: [
          { id: 1, name: "Lista A", contacts: 100 },
          { id: 2, name: "Lista B", contacts: 50 },
        ],
      };

      expect(result.lists).toHaveLength(2);
      expect(result.lists[0].contacts).toBe(100);
    });
  });
});
