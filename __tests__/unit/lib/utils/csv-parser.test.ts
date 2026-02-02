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
