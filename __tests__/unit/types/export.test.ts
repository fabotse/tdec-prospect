/**
 * Export & Personalization Variable Types Tests
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 * AC: #1, #5 - Variable types, platform types, mapping types
 */

import { describe, it, expect } from "vitest";
import {
  type ExportPlatform,
  type PersonalizationVariable,
  type VariableMapping,
  type PlatformMapping,
  type ResolveEmailInput,
  type ResolveEmailOutput,
  type ExportStatus,
  type RemoteExportPlatform,
  type ExportRecord,
  type ExportDialogPlatformOption,
  type LeadExportSummary,
  type DeploymentStepId,
  type DeploymentStep,
  type DeploymentResult,
  type PreDeployValidationResult,
  type ExportConfig,
  type LeadSelection,
  type ExportMode,
} from "@/types/export";
import { EXPORT_PLATFORMS } from "@/lib/export/variable-registry";

describe("export types", () => {
  // ==============================================
  // PLATFORM TYPES (AC: #5)
  // ==============================================

  describe("ExportPlatform", () => {
    it("should support instantly platform", () => {
      const platform: ExportPlatform = "instantly";
      expect(platform).toBe("instantly");
    });

    it("should support snovio platform", () => {
      const platform: ExportPlatform = "snovio";
      expect(platform).toBe("snovio");
    });

    it("should support csv platform", () => {
      const platform: ExportPlatform = "csv";
      expect(platform).toBe("csv");
    });

    it("should support clipboard platform", () => {
      const platform: ExportPlatform = "clipboard";
      expect(platform).toBe("clipboard");
    });
  });

  describe("EXPORT_PLATFORMS", () => {
    it("should contain all 4 supported platforms", () => {
      expect(EXPORT_PLATFORMS).toHaveLength(4);
    });

    it("should include instantly, snovio, csv, clipboard", () => {
      expect(EXPORT_PLATFORMS).toContain("instantly");
      expect(EXPORT_PLATFORMS).toContain("snovio");
      expect(EXPORT_PLATFORMS).toContain("csv");
      expect(EXPORT_PLATFORMS).toContain("clipboard");
    });
  });

  // ==============================================
  // PERSONALIZATION VARIABLE TYPES (AC: #1)
  // ==============================================

  describe("PersonalizationVariable", () => {
    it("should accept valid variable definition with placeholderLabel", () => {
      const variable: PersonalizationVariable = {
        name: "first_name",
        label: "Nome",
        leadField: "firstName",
        template: "{{first_name}}",
        placeholderLabel: "Nome personalizado para cada lead",
      };

      expect(variable.name).toBe("first_name");
      expect(variable.label).toBe("Nome");
      expect(variable.leadField).toBe("firstName");
      expect(variable.template).toBe("{{first_name}}");
      expect(variable.placeholderLabel).toBe("Nome personalizado para cada lead");
    });

    it("should support ice_breaker variable", () => {
      const variable: PersonalizationVariable = {
        name: "ice_breaker",
        label: "Quebra-gelo",
        leadField: "icebreaker",
        template: "{{ice_breaker}}",
        placeholderLabel: "Ice Breaker personalizado será gerado para cada lead",
      };

      expect(variable.name).toBe("ice_breaker");
      expect(variable.leadField).toBe("icebreaker");
    });
  });

  // ==============================================
  // VARIABLE MAPPING TYPES (AC: #5)
  // ==============================================

  describe("VariableMapping", () => {
    it("should map variable to platform tag", () => {
      const mapping: VariableMapping = {
        variableName: "first_name",
        platformTag: "{{firstName}}",
      };

      expect(mapping.variableName).toBe("first_name");
      expect(mapping.platformTag).toBe("{{firstName}}");
    });
  });

  describe("PlatformMapping", () => {
    it("should contain platform and array of mappings", () => {
      const platformMapping: PlatformMapping = {
        platform: "snovio",
        mappings: [
          { variableName: "first_name", platformTag: "{{firstName}}" },
          { variableName: "company_name", platformTag: "{{companyName}}" },
        ],
      };

      expect(platformMapping.platform).toBe("snovio");
      expect(platformMapping.mappings).toHaveLength(2);
      expect(platformMapping.mappings[0].platformTag).toBe("{{firstName}}");
    });
  });

  // ==============================================
  // RESOLVE TYPES (AC: #4)
  // ==============================================

  describe("ResolveEmailInput", () => {
    it("should accept subject and body templates", () => {
      const input: ResolveEmailInput = {
        subject: "Olá {{first_name}}, sobre {{company_name}}",
        body: "Prezado {{first_name}}, {{ice_breaker}}",
      };

      expect(input.subject).toContain("{{first_name}}");
      expect(input.body).toContain("{{ice_breaker}}");
    });
  });

  describe("ResolveEmailOutput", () => {
    it("should return resolved subject and body", () => {
      const output: ResolveEmailOutput = {
        subject: "Olá João, sobre Acme Corp",
        body: "Prezado João, Vi seu post sobre IA...",
      };

      expect(output.subject).toContain("João");
      expect(output.body).toContain("Vi seu post");
    });
  });

  // ==============================================
  // EXPORT TRACKING TYPES (Story 7.3.1: AC #4)
  // ==============================================

  describe("ExportStatus", () => {
    const validStatuses: ExportStatus[] = [
      "pending",
      "success",
      "partial_failure",
      "failed",
    ];

    it("should support all 4 valid export status values", () => {
      expect(validStatuses).toHaveLength(4);
      expect(validStatuses).toContain("pending");
      expect(validStatuses).toContain("success");
      expect(validStatuses).toContain("partial_failure");
      expect(validStatuses).toContain("failed");
    });

    it.each(validStatuses)("should accept '%s' as valid status", (status) => {
      const s: ExportStatus = status;
      expect(s).toBe(status);
    });
  });

  describe("RemoteExportPlatform", () => {
    it("should support instantly platform", () => {
      const platform: RemoteExportPlatform = "instantly";
      expect(platform).toBe("instantly");
    });

    it("should support snovio platform", () => {
      const platform: RemoteExportPlatform = "snovio";
      expect(platform).toBe("snovio");
    });
  });

  // ==============================================
  // DEPLOYMENT TYPES (Story 7.5: AC #1, #3, #4, #5)
  // ==============================================

  describe("DeploymentStepId", () => {
    it("should support all 6 deployment step identifiers", () => {
      const steps: DeploymentStepId[] = [
        "validate",
        "create_campaign",
        "add_accounts",
        "add_leads",
        "activate",
        "persist",
      ];
      expect(steps).toHaveLength(6);
    });
  });

  describe("DeploymentStep", () => {
    it("should represent a pending step", () => {
      const step: DeploymentStep = {
        id: "validate",
        label: "Validação",
        status: "pending",
      };
      expect(step.id).toBe("validate");
      expect(step.status).toBe("pending");
      expect(step.error).toBeUndefined();
    });

    it("should represent a failed step with error", () => {
      const step: DeploymentStep = {
        id: "create_campaign",
        label: "Criar Campanha",
        status: "failed",
        error: "API key inválida",
      };
      expect(step.status).toBe("failed");
      expect(step.error).toBe("API key inválida");
    });

    it("should represent a skipped step with detail", () => {
      const step: DeploymentStep = {
        id: "add_accounts",
        label: "Associar Accounts",
        status: "skipped",
        detail: "Accounts included in campaign creation",
      };
      expect(step.status).toBe("skipped");
      expect(step.detail).toBeDefined();
    });
  });

  describe("DeploymentResult", () => {
    it("should represent a successful deployment", () => {
      const result: DeploymentResult = {
        success: true,
        externalCampaignId: "ext-123",
        leadsUploaded: 50,
        duplicatedLeads: 2,
        steps: [
          { id: "validate", label: "Validação", status: "success" },
          { id: "create_campaign", label: "Criar Campanha", status: "success" },
          { id: "add_accounts", label: "Associar Accounts", status: "success" },
          { id: "add_leads", label: "Enviar Leads", status: "success" },
          { id: "activate", label: "Ativar Campanha", status: "success" },
          { id: "persist", label: "Salvar Registro", status: "success" },
        ],
      };
      expect(result.success).toBe(true);
      expect(result.externalCampaignId).toBe("ext-123");
      expect(result.leadsUploaded).toBe(50);
      expect(result.steps).toHaveLength(6);
    });

    it("should represent a failed deployment", () => {
      const result: DeploymentResult = {
        success: false,
        steps: [
          { id: "validate", label: "Validação", status: "success" },
          { id: "create_campaign", label: "Criar Campanha", status: "failed", error: "Erro na API" },
          { id: "add_accounts", label: "Associar Accounts", status: "pending" },
          { id: "add_leads", label: "Enviar Leads", status: "pending" },
          { id: "activate", label: "Ativar Campanha", status: "pending" },
          { id: "persist", label: "Salvar Registro", status: "pending" },
        ],
        error: "Erro na API",
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe("Erro na API");
    });
  });

  describe("PreDeployValidationResult", () => {
    it("should represent valid pre-deploy state", () => {
      const result: PreDeployValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should represent invalid state with blocking errors", () => {
      const result: PreDeployValidationResult = {
        valid: false,
        errors: ["Nenhum lead com email válido"],
        warnings: [],
      };
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("should represent valid state with warnings", () => {
      const result: PreDeployValidationResult = {
        valid: true,
        errors: [],
        warnings: ["5 leads sem icebreaker"],
      };
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe("ExportConfig", () => {
    it("should represent a new Instantly export config", () => {
      const config: ExportConfig = {
        campaignId: "c-1",
        platform: "instantly",
        sendingAccounts: ["user@example.com"],
        leadSelection: "all",
        exportMode: "new",
      };
      expect(config.platform).toBe("instantly");
      expect(config.sendingAccounts).toHaveLength(1);
      expect(config.exportMode).toBe("new");
    });

    it("should support re-export mode", () => {
      const config: ExportConfig = {
        campaignId: "c-1",
        platform: "instantly",
        leadSelection: "all",
        exportMode: "re-export",
      };
      expect(config.exportMode).toBe("re-export");
      expect(config.sendingAccounts).toBeUndefined();
    });

    it("should support update mode with selected leads and externalCampaignId", () => {
      const config: ExportConfig = {
        campaignId: "c-1",
        platform: "instantly",
        leadSelection: "selected",
        exportMode: "update",
        externalCampaignId: "ext-abc-123",
      };
      expect(config.exportMode).toBe("update");
      expect(config.leadSelection).toBe("selected");
      expect(config.externalCampaignId).toBe("ext-abc-123");
    });
  });

  describe("LeadSelection", () => {
    it("should support all and selected values", () => {
      const all: LeadSelection = "all";
      const selected: LeadSelection = "selected";
      expect(all).toBe("all");
      expect(selected).toBe("selected");
    });
  });

  describe("ExportMode", () => {
    it("should support new, re-export, and update values", () => {
      const modes: ExportMode[] = ["new", "re-export", "update"];
      expect(modes).toHaveLength(3);
    });
  });

  // ==============================================
  // EXPORT DIALOG TYPES (Story 7.4: AC #1, #2)
  // ==============================================

  describe("ExportDialogPlatformOption", () => {
    it("should represent a configured and connected platform", () => {
      const option: ExportDialogPlatformOption = {
        platform: "instantly",
        displayName: "Instantly",
        configured: true,
        connectionStatus: "connected",
        exportRecord: null,
      };

      expect(option.platform).toBe("instantly");
      expect(option.displayName).toBe("Instantly");
      expect(option.configured).toBe(true);
      expect(option.connectionStatus).toBe("connected");
      expect(option.exportRecord).toBeNull();
    });

    it("should represent a non-configured platform", () => {
      const option: ExportDialogPlatformOption = {
        platform: "snovio",
        displayName: "Snov.io",
        configured: false,
        connectionStatus: "not_configured",
        exportRecord: null,
      };

      expect(option.configured).toBe(false);
      expect(option.connectionStatus).toBe("not_configured");
    });

    it("should include previous export record when available", () => {
      const option: ExportDialogPlatformOption = {
        platform: "instantly",
        displayName: "Instantly",
        configured: true,
        connectionStatus: "connected",
        exportRecord: {
          campaignId: "c-1",
          externalCampaignId: "ext-abc",
          exportPlatform: "instantly",
          exportedAt: "2026-02-06T10:00:00Z",
          exportStatus: "success",
        },
      };

      expect(option.exportRecord).not.toBeNull();
      expect(option.exportRecord!.exportPlatform).toBe("instantly");
      expect(option.exportRecord!.exportStatus).toBe("success");
    });
  });

  describe("LeadExportSummary", () => {
    it("should summarize lead export eligibility", () => {
      const summary: LeadExportSummary = {
        totalLeads: 50,
        leadsWithEmail: 45,
        leadsWithoutEmail: 5,
        leadsWithoutIcebreaker: 10,
      };

      expect(summary.totalLeads).toBe(50);
      expect(summary.leadsWithEmail).toBe(45);
      expect(summary.leadsWithoutEmail).toBe(5);
      expect(summary.leadsWithoutIcebreaker).toBe(10);
    });

    it("should represent campaign with all leads having email", () => {
      const summary: LeadExportSummary = {
        totalLeads: 20,
        leadsWithEmail: 20,
        leadsWithoutEmail: 0,
        leadsWithoutIcebreaker: 0,
      };

      expect(summary.leadsWithEmail).toBe(summary.totalLeads);
      expect(summary.leadsWithoutEmail).toBe(0);
    });
  });

  describe("ExportRecord", () => {
    it("should represent a fully exported campaign", () => {
      const record: ExportRecord = {
        campaignId: "c-1",
        externalCampaignId: "ext-abc-123",
        exportPlatform: "instantly",
        exportedAt: "2026-02-06T10:00:00Z",
        exportStatus: "success",
      };

      expect(record.campaignId).toBe("c-1");
      expect(record.externalCampaignId).toBe("ext-abc-123");
      expect(record.exportPlatform).toBe("instantly");
      expect(record.exportedAt).toBe("2026-02-06T10:00:00Z");
      expect(record.exportStatus).toBe("success");
    });

    it("should represent a non-exported campaign with null fields", () => {
      const record: ExportRecord = {
        campaignId: "c-2",
        externalCampaignId: null,
        exportPlatform: null,
        exportedAt: null,
        exportStatus: null,
      };

      expect(record.externalCampaignId).toBeNull();
      expect(record.exportPlatform).toBeNull();
      expect(record.exportedAt).toBeNull();
      expect(record.exportStatus).toBeNull();
    });

    it("should represent a failed export", () => {
      const record: ExportRecord = {
        campaignId: "c-3",
        externalCampaignId: null,
        exportPlatform: "snovio",
        exportedAt: "2026-02-06T10:00:00Z",
        exportStatus: "failed",
      };

      expect(record.exportPlatform).toBe("snovio");
      expect(record.exportStatus).toBe("failed");
      expect(record.externalCampaignId).toBeNull();
    });
  });
});
