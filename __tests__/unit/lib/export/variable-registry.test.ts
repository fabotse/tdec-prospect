/**
 * Variable Registry Tests
 * Story 7.1: Sistema de Variáveis de Personalização para Exportação
 * AC: #1, #5 - Registry CRUD, mapeamentos, plataformas
 */

import { describe, it, expect } from "vitest";
import {
  getVariables,
  getVariable,
  getPlatformMapping,
  mapVariableForPlatform,
} from "@/lib/export/variable-registry";

describe("variable-registry", () => {
  // ==============================================
  // getVariables() (AC: #1)
  // ==============================================

  describe("getVariables", () => {
    it("should return all 4 registered variables", () => {
      const variables = getVariables();
      expect(variables).toHaveLength(4);
    });

    it("should include first_name variable", () => {
      const variables = getVariables();
      const firstNameVar = variables.find((v) => v.name === "first_name");
      expect(firstNameVar).toBeDefined();
      expect(firstNameVar!.label).toBe("Nome");
      expect(firstNameVar!.leadField).toBe("firstName");
      expect(firstNameVar!.template).toBe("{{first_name}}");
    });

    it("should include company_name variable", () => {
      const variables = getVariables();
      const companyVar = variables.find((v) => v.name === "company_name");
      expect(companyVar).toBeDefined();
      expect(companyVar!.label).toBe("Empresa");
      expect(companyVar!.leadField).toBe("companyName");
      expect(companyVar!.template).toBe("{{company_name}}");
    });

    it("should include title variable", () => {
      const variables = getVariables();
      const titleVar = variables.find((v) => v.name === "title");
      expect(titleVar).toBeDefined();
      expect(titleVar!.label).toBe("Cargo");
      expect(titleVar!.leadField).toBe("title");
      expect(titleVar!.template).toBe("{{title}}");
    });

    it("should include ice_breaker variable", () => {
      const variables = getVariables();
      const ibVar = variables.find((v) => v.name === "ice_breaker");
      expect(ibVar).toBeDefined();
      expect(ibVar!.label).toBe("Quebra-gelo");
      expect(ibVar!.leadField).toBe("icebreaker");
      expect(ibVar!.template).toBe("{{ice_breaker}}");
    });

    it("should return a copy (not mutate internal registry)", () => {
      const variables1 = getVariables();
      const variables2 = getVariables();
      expect(variables1).not.toBe(variables2);
      expect(variables1).toEqual(variables2);
    });
  });

  // ==============================================
  // getVariable(name) (AC: #1)
  // ==============================================

  describe("getVariable", () => {
    it("should return variable by name", () => {
      const variable = getVariable("first_name");
      expect(variable).toBeDefined();
      expect(variable!.name).toBe("first_name");
      expect(variable!.leadField).toBe("firstName");
    });

    it("should return undefined for unknown variable", () => {
      const variable = getVariable("unknown_variable");
      expect(variable).toBeUndefined();
    });

    it("should return ice_breaker variable", () => {
      const variable = getVariable("ice_breaker");
      expect(variable).toBeDefined();
      expect(variable!.leadField).toBe("icebreaker");
    });
  });

  // ==============================================
  // getPlatformMapping(platform) (AC: #5)
  // ==============================================

  describe("getPlatformMapping", () => {
    it("should return Instantly mappings (same as internal format)", () => {
      const mapping = getPlatformMapping("instantly");
      expect(mapping.platform).toBe("instantly");
      expect(mapping.mappings).toHaveLength(4);

      const firstNameMapping = mapping.mappings.find(
        (m) => m.variableName === "first_name"
      );
      expect(firstNameMapping!.platformTag).toBe("{{first_name}}");
    });

    it("should return Snov.io mappings (camelCase format)", () => {
      const mapping = getPlatformMapping("snovio");
      expect(mapping.platform).toBe("snovio");

      const firstNameMapping = mapping.mappings.find(
        (m) => m.variableName === "first_name"
      );
      expect(firstNameMapping!.platformTag).toBe("{{firstName}}");

      const companyMapping = mapping.mappings.find(
        (m) => m.variableName === "company_name"
      );
      expect(companyMapping!.platformTag).toBe("{{companyName}}");

      const ibMapping = mapping.mappings.find(
        (m) => m.variableName === "ice_breaker"
      );
      expect(ibMapping!.platformTag).toBe("{{iceBreaker}}");
    });

    it("should return CSV mappings (column names without braces)", () => {
      const mapping = getPlatformMapping("csv");
      expect(mapping.platform).toBe("csv");

      const firstNameMapping = mapping.mappings.find(
        (m) => m.variableName === "first_name"
      );
      expect(firstNameMapping!.platformTag).toBe("first_name");

      const companyMapping = mapping.mappings.find(
        (m) => m.variableName === "company_name"
      );
      expect(companyMapping!.platformTag).toBe("company_name");
    });

    it("should return clipboard mappings (same as internal)", () => {
      const mapping = getPlatformMapping("clipboard");
      expect(mapping.platform).toBe("clipboard");

      const firstNameMapping = mapping.mappings.find(
        (m) => m.variableName === "first_name"
      );
      expect(firstNameMapping!.platformTag).toBe("{{first_name}}");
    });

    it("should include all 4 variables in every platform mapping", () => {
      const platforms = ["instantly", "snovio", "csv", "clipboard"] as const;
      for (const platform of platforms) {
        const mapping = getPlatformMapping(platform);
        expect(mapping.mappings).toHaveLength(4);
        const varNames = mapping.mappings.map((m) => m.variableName);
        expect(varNames).toContain("first_name");
        expect(varNames).toContain("company_name");
        expect(varNames).toContain("title");
        expect(varNames).toContain("ice_breaker");
      }
    });
  });

  // ==============================================
  // mapVariableForPlatform(variable, platform) (AC: #5)
  // ==============================================

  describe("mapVariableForPlatform", () => {
    it("should map first_name for Instantly", () => {
      const tag = mapVariableForPlatform("first_name", "instantly");
      expect(tag).toBe("{{first_name}}");
    });

    it("should map first_name for Snov.io (camelCase)", () => {
      const tag = mapVariableForPlatform("first_name", "snovio");
      expect(tag).toBe("{{firstName}}");
    });

    it("should map first_name for CSV (column name)", () => {
      const tag = mapVariableForPlatform("first_name", "csv");
      expect(tag).toBe("first_name");
    });

    it("should map ice_breaker for Snov.io", () => {
      const tag = mapVariableForPlatform("ice_breaker", "snovio");
      expect(tag).toBe("{{iceBreaker}}");
    });

    it("should return undefined for unknown variable", () => {
      const tag = mapVariableForPlatform("unknown", "instantly");
      expect(tag).toBeUndefined();
    });

    it("should map company_name for all platforms", () => {
      expect(mapVariableForPlatform("company_name", "instantly")).toBe(
        "{{company_name}}"
      );
      expect(mapVariableForPlatform("company_name", "snovio")).toBe(
        "{{companyName}}"
      );
      expect(mapVariableForPlatform("company_name", "csv")).toBe(
        "company_name"
      );
      expect(mapVariableForPlatform("company_name", "clipboard")).toBe(
        "{{company_name}}"
      );
    });

    it("should map title for all platforms", () => {
      expect(mapVariableForPlatform("title", "instantly")).toBe("{{title}}");
      expect(mapVariableForPlatform("title", "snovio")).toBe("{{title}}");
      expect(mapVariableForPlatform("title", "csv")).toBe("title");
      expect(mapVariableForPlatform("title", "clipboard")).toBe("{{title}}");
    });
  });
});
