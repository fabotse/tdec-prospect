import { describe, it, expect } from "vitest";
import {
  SERVICE_NAMES,
  SERVICE_LABELS,
  isValidServiceName,
  type ServiceName,
} from "@/types/integration";

describe("integration types", () => {
  describe("SERVICE_NAMES", () => {
    it("should contain all supported services", () => {
      expect(SERVICE_NAMES).toContain("apollo");
      expect(SERVICE_NAMES).toContain("signalhire");
      expect(SERVICE_NAMES).toContain("snovio");
      expect(SERVICE_NAMES).toContain("instantly");
      expect(SERVICE_NAMES).toContain("apify");
    });

    it("should have exactly 5 services", () => {
      expect(SERVICE_NAMES).toHaveLength(5);
    });
  });

  describe("SERVICE_LABELS", () => {
    it("should have labels for all services", () => {
      expect(SERVICE_LABELS.apollo).toBe("Apollo.io");
      expect(SERVICE_LABELS.signalhire).toBe("SignalHire");
      expect(SERVICE_LABELS.snovio).toBe("Snov.io");
      expect(SERVICE_LABELS.instantly).toBe("Instantly");
      expect(SERVICE_LABELS.apify).toBe("Apify");
    });

    it("should have a label for every service name", () => {
      SERVICE_NAMES.forEach((name) => {
        expect(SERVICE_LABELS[name]).toBeDefined();
        expect(typeof SERVICE_LABELS[name]).toBe("string");
      });
    });
  });

  describe("isValidServiceName", () => {
    it("should return true for valid service names", () => {
      expect(isValidServiceName("apollo")).toBe(true);
      expect(isValidServiceName("signalhire")).toBe(true);
      expect(isValidServiceName("snovio")).toBe(true);
      expect(isValidServiceName("instantly")).toBe(true);
      expect(isValidServiceName("apify")).toBe(true);
    });

    it("should return false for invalid service names", () => {
      expect(isValidServiceName("invalid")).toBe(false);
      expect(isValidServiceName("")).toBe(false);
      expect(isValidServiceName("Apollo")).toBe(false); // case sensitive
      expect(isValidServiceName("APOLLO")).toBe(false);
    });

    it("should work as type guard", () => {
      const testValue: string = "apollo";

      if (isValidServiceName(testValue)) {
        // TypeScript should narrow this to ServiceName
        const serviceName: ServiceName = testValue;
        expect(serviceName).toBe("apollo");
      }
    });
  });
});
