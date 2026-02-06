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
});
