/**
 * Tests for CSV Parser Utilities
 * Story: 4.7 - Import Campaign Results
 */

import { describe, it, expect } from "vitest";
import {
  detectDelimiter,
  parseCSVLine,
  parseCSVData,
  detectColumnMappings,
  detectLeadColumnMappings,
  parseResponseType,
  isValidEmail,
} from "@/lib/utils/csv-parser";

describe("CSV Parser Utilities", () => {
  describe("detectDelimiter", () => {
    it("should detect comma delimiter", () => {
      expect(detectDelimiter("email,status,name")).toBe(",");
    });

    it("should detect tab delimiter", () => {
      expect(detectDelimiter("email\tstatus\tname")).toBe("\t");
    });

    it("should detect semicolon delimiter", () => {
      expect(detectDelimiter("email;status;name")).toBe(";");
    });

    it("should default to comma when no delimiters found", () => {
      expect(detectDelimiter("emailstatusname")).toBe(",");
    });

    it("should handle quoted values with delimiters inside", () => {
      expect(detectDelimiter('"email,with,commas";status;name')).toBe(";");
    });
  });

  describe("parseCSVLine", () => {
    it("should parse simple CSV line", () => {
      const result = parseCSVLine("a,b,c", ",");
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should handle quoted values", () => {
      const result = parseCSVLine('"hello, world",test', ",");
      expect(result).toEqual(["hello, world", "test"]);
    });

    it("should handle escaped quotes", () => {
      const result = parseCSVLine('"say ""hello""",test', ",");
      expect(result).toEqual(['say "hello"', "test"]);
    });

    it("should trim whitespace", () => {
      const result = parseCSVLine("  a  ,  b  ,  c  ", ",");
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should handle empty values", () => {
      const result = parseCSVLine("a,,c", ",");
      expect(result).toEqual(["a", "", "c"]);
    });

    it("should parse tab-separated values", () => {
      const result = parseCSVLine("a\tb\tc", "\t");
      expect(result).toEqual(["a", "b", "c"]);
    });
  });

  describe("parseCSVData", () => {
    it("should parse CSV text into headers and rows", () => {
      const text = "email,status\ntest@example.com,replied";
      const result = parseCSVData(text);

      expect(result.headers).toEqual(["email", "status"]);
      expect(result.rows).toEqual([["test@example.com", "replied"]]);
    });

    it("should handle multiple rows", () => {
      const text = "email,status\na@test.com,replied\nb@test.com,bounced";
      const result = parseCSVData(text);

      expect(result.headers).toEqual(["email", "status"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(["a@test.com", "replied"]);
      expect(result.rows[1]).toEqual(["b@test.com", "bounced"]);
    });

    it("should handle Windows line endings", () => {
      const text = "email,status\r\ntest@example.com,replied";
      const result = parseCSVData(text);

      expect(result.rows).toHaveLength(1);
    });

    it("should handle empty lines", () => {
      const text = "email,status\n\ntest@example.com,replied\n";
      const result = parseCSVData(text);

      expect(result.rows).toHaveLength(1);
    });

    it("should return empty arrays for empty input", () => {
      const result = parseCSVData("");
      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it("should handle headers only (no data rows)", () => {
      const result = parseCSVData("email,status");
      expect(result.headers).toEqual(["email", "status"]);
      expect(result.rows).toEqual([]);
    });
  });

  describe("detectColumnMappings", () => {
    it("should detect email column", () => {
      const result = detectColumnMappings(["name", "email", "phone"]);
      expect(result.emailColumn).toBe(1);
    });

    it("should detect e-mail variation", () => {
      const result = detectColumnMappings(["name", "e-mail", "phone"]);
      expect(result.emailColumn).toBe(1);
    });

    it("should detect email_address variation", () => {
      const result = detectColumnMappings(["email_address", "status"]);
      expect(result.emailColumn).toBe(0);
    });

    it("should detect status column", () => {
      const result = detectColumnMappings(["email", "status"]);
      expect(result.responseColumn).toBe(1);
    });

    it("should detect response column", () => {
      const result = detectColumnMappings(["email", "response"]);
      expect(result.responseColumn).toBe(1);
    });

    it("should detect replied column", () => {
      const result = detectColumnMappings(["email", "replied"]);
      expect(result.responseColumn).toBe(1);
    });

    it("should return null when columns not found", () => {
      const result = detectColumnMappings(["foo", "bar"]);
      expect(result.emailColumn).toBeNull();
      expect(result.responseColumn).toBeNull();
    });

    it("should be case-insensitive", () => {
      const result = detectColumnMappings(["EMAIL", "STATUS"]);
      expect(result.emailColumn).toBe(0);
      expect(result.responseColumn).toBe(1);
    });
  });

  describe("detectLeadColumnMappings", () => {
    it("should detect all columns with Portuguese headers", () => {
      const result = detectLeadColumnMappings([
        "nome", "sobrenome", "email", "empresa", "cargo", "linkedin", "telefone",
      ]);
      expect(result.nameColumn).toBe(0);
      expect(result.lastNameColumn).toBe(1);
      expect(result.emailColumn).toBe(2);
      expect(result.companyColumn).toBe(3);
      expect(result.titleColumn).toBe(4);
      expect(result.linkedinColumn).toBe(5);
      expect(result.phoneColumn).toBe(6);
    });

    it("should detect all columns with English headers", () => {
      const result = detectLeadColumnMappings([
        "first_name", "last_name", "email", "company", "title", "linkedin_url", "phone",
      ]);
      expect(result.nameColumn).toBe(0);
      expect(result.lastNameColumn).toBe(1);
      expect(result.emailColumn).toBe(2);
      expect(result.companyColumn).toBe(3);
      expect(result.titleColumn).toBe(4);
      expect(result.linkedinColumn).toBe(5);
      expect(result.phoneColumn).toBe(6);
    });

    it("should detect name variations", () => {
      expect(detectLeadColumnMappings(["name"]).nameColumn).toBe(0);
      expect(detectLeadColumnMappings(["first name"]).nameColumn).toBe(0);
      expect(detectLeadColumnMappings(["primeiro_nome"]).nameColumn).toBe(0);
      expect(detectLeadColumnMappings(["primeiro nome"]).nameColumn).toBe(0);
    });

    it("should detect last name variations", () => {
      expect(detectLeadColumnMappings(["surname"]).lastNameColumn).toBe(0);
      expect(detectLeadColumnMappings(["last name"]).lastNameColumn).toBe(0);
      expect(detectLeadColumnMappings(["último nome"]).lastNameColumn).toBe(0);
      expect(detectLeadColumnMappings(["ultimo nome"]).lastNameColumn).toBe(0);
    });

    it("should detect email variations", () => {
      expect(detectLeadColumnMappings(["e-mail"]).emailColumn).toBe(0);
      expect(detectLeadColumnMappings(["email_address"]).emailColumn).toBe(0);
      expect(detectLeadColumnMappings(["emailaddress"]).emailColumn).toBe(0);
    });

    it("should detect company variations", () => {
      expect(detectLeadColumnMappings(["company_name"]).companyColumn).toBe(0);
      expect(detectLeadColumnMappings(["organização"]).companyColumn).toBe(0);
      expect(detectLeadColumnMappings(["organizacao"]).companyColumn).toBe(0);
      expect(detectLeadColumnMappings(["organization"]).companyColumn).toBe(0);
    });

    it("should detect title variations", () => {
      expect(detectLeadColumnMappings(["job_title"]).titleColumn).toBe(0);
      expect(detectLeadColumnMappings(["job title"]).titleColumn).toBe(0);
      expect(detectLeadColumnMappings(["posição"]).titleColumn).toBe(0);
      expect(detectLeadColumnMappings(["posicao"]).titleColumn).toBe(0);
      expect(detectLeadColumnMappings(["position"]).titleColumn).toBe(0);
      expect(detectLeadColumnMappings(["role"]).titleColumn).toBe(0);
    });

    it("should detect linkedin variations", () => {
      expect(detectLeadColumnMappings(["linkedin url"]).linkedinColumn).toBe(0);
      expect(detectLeadColumnMappings(["perfil linkedin"]).linkedinColumn).toBe(0);
    });

    it("should detect phone variations", () => {
      expect(detectLeadColumnMappings(["phone_number"]).phoneColumn).toBe(0);
      expect(detectLeadColumnMappings(["celular"]).phoneColumn).toBe(0);
      expect(detectLeadColumnMappings(["mobile"]).phoneColumn).toBe(0);
      expect(detectLeadColumnMappings(["whatsapp"]).phoneColumn).toBe(0);
    });

    it("should be case-insensitive", () => {
      const result = detectLeadColumnMappings(["NOME", "EMAIL", "EMPRESA"]);
      expect(result.nameColumn).toBe(0);
      expect(result.emailColumn).toBe(1);
      expect(result.companyColumn).toBe(2);
    });

    it("should return null for unrecognized headers", () => {
      const result = detectLeadColumnMappings(["foo", "bar", "baz"]);
      expect(result.nameColumn).toBeNull();
      expect(result.lastNameColumn).toBeNull();
      expect(result.emailColumn).toBeNull();
      expect(result.companyColumn).toBeNull();
      expect(result.titleColumn).toBeNull();
      expect(result.linkedinColumn).toBeNull();
      expect(result.phoneColumn).toBeNull();
    });

    it("should handle partial matches (some columns detected)", () => {
      const result = detectLeadColumnMappings(["nome", "random_column", "email"]);
      expect(result.nameColumn).toBe(0);
      expect(result.emailColumn).toBe(2);
      expect(result.lastNameColumn).toBeNull();
      expect(result.companyColumn).toBeNull();
    });

    it("should NOT match 'sobrenome' as nameColumn (false positive prevention)", () => {
      const result = detectLeadColumnMappings(["sobrenome", "email"]);
      expect(result.nameColumn).toBeNull();
      expect(result.lastNameColumn).toBe(0);
      expect(result.emailColumn).toBe(1);
    });

    it("should NOT match 'company_name' as nameColumn (false positive prevention)", () => {
      const result = detectLeadColumnMappings(["company_name", "last_name", "email"]);
      expect(result.nameColumn).toBeNull();
      expect(result.companyColumn).toBe(0);
      expect(result.lastNameColumn).toBe(1);
      expect(result.emailColumn).toBe(2);
    });

    it("should correctly assign when sobrenome appears before nome", () => {
      const result = detectLeadColumnMappings(["sobrenome", "nome", "email"]);
      expect(result.lastNameColumn).toBe(0);
      expect(result.nameColumn).toBe(1);
      expect(result.emailColumn).toBe(2);
    });

    it("should not assign same column to multiple fields", () => {
      const result = detectLeadColumnMappings(["nome", "email"]);
      expect(result.nameColumn).toBe(0);
      expect(result.emailColumn).toBe(1);
      // "nome" should not also match as companyColumn or titleColumn
      expect(result.companyColumn).toBeNull();
      expect(result.titleColumn).toBeNull();
    });
  });

  describe("parseResponseType", () => {
    it("should parse replied", () => {
      expect(parseResponseType("replied")).toBe("replied");
      expect(parseResponseType("REPLIED")).toBe("replied");
      expect(parseResponseType("Reply")).toBe("replied");
      expect(parseResponseType("responded")).toBe("replied");
    });

    it("should parse clicked", () => {
      expect(parseResponseType("clicked")).toBe("clicked");
      expect(parseResponseType("click")).toBe("clicked");
      expect(parseResponseType("link_clicked")).toBe("clicked");
    });

    it("should parse opened", () => {
      expect(parseResponseType("opened")).toBe("opened");
      expect(parseResponseType("open")).toBe("opened");
      expect(parseResponseType("email_opened")).toBe("opened");
    });

    it("should parse bounced", () => {
      expect(parseResponseType("bounced")).toBe("bounced");
      expect(parseResponseType("bounce")).toBe("bounced");
      expect(parseResponseType("hard_bounce")).toBe("bounced");
      expect(parseResponseType("failed")).toBe("bounced");
    });

    it("should parse unsubscribed", () => {
      expect(parseResponseType("unsubscribed")).toBe("unsubscribed");
      expect(parseResponseType("opt-out")).toBe("unsubscribed");
      expect(parseResponseType("optout")).toBe("unsubscribed");
    });

    it("should return unknown for unrecognized values", () => {
      expect(parseResponseType("something")).toBe("unknown");
      expect(parseResponseType("")).toBe("unknown");
      expect(parseResponseType("random")).toBe("unknown");
    });

    it("should handle Portuguese variations", () => {
      expect(parseResponseType("respondeu")).toBe("replied");
      expect(parseResponseType("clicou")).toBe("clicked");
      expect(parseResponseType("abriu")).toBe("opened");
      expect(parseResponseType("descadastrou")).toBe("unsubscribed");
    });
  });

  describe("isValidEmail", () => {
    it("should validate correct emails", () => {
      expect(isValidEmail("test@example.com")).toBe(true);
      expect(isValidEmail("user.name@domain.co")).toBe(true);
      expect(isValidEmail("user+tag@example.org")).toBe(true);
    });

    it("should reject invalid emails", () => {
      expect(isValidEmail("invalid")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("test@")).toBe(false);
      expect(isValidEmail("test@.com")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });

    it("should reject emails with consecutive dots", () => {
      expect(isValidEmail("test..user@example.com")).toBe(false);
      expect(isValidEmail("test@example..com")).toBe(false);
    });

    it("should reject emails with consecutive @ symbols", () => {
      expect(isValidEmail("test@@example.com")).toBe(false);
    });

    it("should trim whitespace", () => {
      expect(isValidEmail("  test@example.com  ")).toBe(true);
    });
  });
});
