/**
 * Unit tests for SignalHire Types
 * Story: 4.4.2 - SignalHire Callback Architecture
 *
 * Tests:
 * - extractPhoneFromContacts function (AC #5)
 * - Type guards and helper functions
 * - Phone prioritization (mobile > work_phone > personal)
 */

import { describe, it, expect } from "vitest";
import {
  extractPhoneFromContacts,
  extractPrimaryPhone,
  isLinkedInUrl,
  isEmail,
  isPhoneNumber,
  detectIdentifierType,
  type SignalHireContact,
  type SignalHirePerson,
} from "@/types/signalhire";

describe("SignalHire Types (Story 4.4.2)", () => {
  // ==============================================
  // extractPhoneFromContacts (NEW - AC #5)
  // ==============================================

  describe("extractPhoneFromContacts", () => {
    it("returns null for undefined contacts", () => {
      expect(extractPhoneFromContacts(undefined)).toBeNull();
    });

    it("returns null for empty contacts array", () => {
      expect(extractPhoneFromContacts([])).toBeNull();
    });

    it("returns null when no phone type contacts exist", () => {
      const contacts: SignalHireContact[] = [
        { type: "email", value: "test@example.com" },
      ];
      expect(extractPhoneFromContacts(contacts)).toBeNull();
    });

    it("extracts phone from single phone contact", () => {
      const contacts: SignalHireContact[] = [
        { type: "phone", value: "+5511999887766" },
      ];
      expect(extractPhoneFromContacts(contacts)).toBe("+5511999887766");
    });

    it("prioritizes mobile over other phone types", () => {
      const contacts: SignalHireContact[] = [
        { type: "phone", value: "+5511111111111", subType: "work_phone" },
        { type: "phone", value: "+5522222222222", subType: "mobile" },
        { type: "phone", value: "+5533333333333", subType: "personal" },
      ];
      expect(extractPhoneFromContacts(contacts)).toBe("+5522222222222");
    });

    it("prioritizes work_phone when no mobile exists", () => {
      const contacts: SignalHireContact[] = [
        { type: "phone", value: "+5533333333333", subType: "personal" },
        { type: "phone", value: "+5511111111111", subType: "work_phone" },
      ];
      expect(extractPhoneFromContacts(contacts)).toBe("+5511111111111");
    });

    it("prioritizes personal when no mobile or work exists", () => {
      const contacts: SignalHireContact[] = [
        { type: "phone", value: "+5533333333333", subType: "personal" },
        { type: "phone", value: "+5544444444444" }, // no subType
      ];
      expect(extractPhoneFromContacts(contacts)).toBe("+5533333333333");
    });

    it("falls back to first phone when no priority matches", () => {
      const contacts: SignalHireContact[] = [
        { type: "email", value: "test@example.com" },
        { type: "phone", value: "+5544444444444" }, // no subType
        { type: "phone", value: "+5555555555555", subType: "other" },
      ];
      expect(extractPhoneFromContacts(contacts)).toBe("+5544444444444");
    });

    it("handles mixed contact types correctly", () => {
      const contacts: SignalHireContact[] = [
        { type: "email", value: "work@company.com", subType: "work" },
        { type: "phone", value: "+5511999887766", subType: "mobile" },
        { type: "email", value: "personal@gmail.com", subType: "personal" },
      ];
      expect(extractPhoneFromContacts(contacts)).toBe("+5511999887766");
    });
  });

  // ==============================================
  // extractPrimaryPhone (LEGACY)
  // ==============================================

  describe("extractPrimaryPhone (legacy)", () => {
    it("returns null for person without phones", () => {
      const person: SignalHirePerson = { phones: [] };
      expect(extractPrimaryPhone(person)).toBeNull();
    });

    it("returns null for undefined phones", () => {
      const person: SignalHirePerson = {};
      expect(extractPrimaryPhone(person)).toBeNull();
    });

    it("extracts phone from single entry", () => {
      const person: SignalHirePerson = {
        phones: [{ phone: "+5511999887766" }],
      };
      expect(extractPrimaryPhone(person)).toBe("+5511999887766");
    });

    it("prioritizes mobile over work", () => {
      const person: SignalHirePerson = {
        phones: [
          { phone: "+5511111111111", type: "work" },
          { phone: "+5522222222222", type: "mobile" },
        ],
      };
      expect(extractPrimaryPhone(person)).toBe("+5522222222222");
    });

    it("handles cell type as mobile", () => {
      const person: SignalHirePerson = {
        phones: [
          { phone: "+5511111111111", type: "work" },
          { phone: "+5522222222222", type: "cell" },
        ],
      };
      expect(extractPrimaryPhone(person)).toBe("+5522222222222");
    });

    it("handles business type as work", () => {
      const person: SignalHirePerson = {
        phones: [
          { phone: "+5511111111111", type: "business" },
          { phone: "+5522222222222" }, // no type
        ],
      };
      expect(extractPrimaryPhone(person)).toBe("+5511111111111");
    });
  });

  // ==============================================
  // IDENTIFIER TYPE DETECTION
  // ==============================================

  describe("isLinkedInUrl", () => {
    it("returns true for linkedin.com/in/ URLs", () => {
      expect(isLinkedInUrl("https://linkedin.com/in/john-doe")).toBe(true);
      expect(isLinkedInUrl("https://www.linkedin.com/in/john-doe")).toBe(true);
      expect(isLinkedInUrl("http://linkedin.com/in/john-doe/")).toBe(true);
    });

    it("returns true for linkedin.com/pub/ URLs", () => {
      expect(isLinkedInUrl("https://linkedin.com/pub/john-doe/1/2/3")).toBe(
        true
      );
    });

    it("returns false for non-LinkedIn URLs", () => {
      expect(isLinkedInUrl("https://example.com")).toBe(false);
      expect(isLinkedInUrl("john@linkedin.com")).toBe(false);
    });
  });

  describe("isEmail", () => {
    it("returns true for email addresses", () => {
      expect(isEmail("john@example.com")).toBe(true);
      expect(isEmail("john.doe@company.co")).toBe(true);
    });

    it("returns false for LinkedIn URLs with @", () => {
      expect(isEmail("@linkedin.com/in/john")).toBe(false);
    });

    it("returns false for non-emails", () => {
      expect(isEmail("john-doe")).toBe(false);
      expect(isEmail("+5511999887766")).toBe(false);
    });
  });

  describe("isPhoneNumber", () => {
    it("returns true for E164 format numbers", () => {
      expect(isPhoneNumber("+5511999887766")).toBe(true);
      expect(isPhoneNumber("+14155551234")).toBe(true);
    });

    it("returns true for numbers with spaces", () => {
      expect(isPhoneNumber("+55 11 99988 7766")).toBe(true);
    });

    it("returns false for short numbers", () => {
      expect(isPhoneNumber("+551199")).toBe(false);
    });

    it("returns false for numbers without +", () => {
      expect(isPhoneNumber("5511999887766")).toBe(false);
    });
  });

  describe("detectIdentifierType", () => {
    it("detects LinkedIn URLs", () => {
      expect(detectIdentifierType("https://linkedin.com/in/john")).toBe(
        "linkedin"
      );
    });

    it("detects emails", () => {
      expect(detectIdentifierType("john@example.com")).toBe("email");
    });

    it("detects phone numbers", () => {
      expect(detectIdentifierType("+5511999887766")).toBe("phone");
    });

    it("returns unknown for unrecognized identifiers", () => {
      expect(detectIdentifierType("john-doe")).toBe("unknown");
      expect(detectIdentifierType("random-string")).toBe("unknown");
    });
  });
});
