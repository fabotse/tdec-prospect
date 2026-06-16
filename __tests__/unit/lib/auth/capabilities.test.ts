import { describe, it, expect } from "vitest";
import { hasAdminAccess, ADMIN_ROLES } from "@/lib/auth/capabilities";

/**
 * Tests for auth capabilities
 * Epic: 20 - Níveis de Acesso
 * Story: 20.1 - Modelo de três papéis (enum, migração e RLS)
 *
 * AC #5: hasAdminAccess retorna true para gestor e diretor, false para sdr.
 */
describe("auth capabilities", () => {
  describe("hasAdminAccess", () => {
    it("should return true for gestor", () => {
      expect(hasAdminAccess("gestor")).toBe(true);
    });

    it("should return true for diretor", () => {
      expect(hasAdminAccess("diretor")).toBe(true);
    });

    it("should return false for sdr", () => {
      expect(hasAdminAccess("sdr")).toBe(false);
    });

    it("should return false for null", () => {
      expect(hasAdminAccess(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(hasAdminAccess(undefined)).toBe(false);
    });
  });

  describe("ADMIN_ROLES", () => {
    it("should contain exactly gestor and diretor", () => {
      expect(ADMIN_ROLES).toEqual(["gestor", "diretor"]);
    });

    it("should treat every admin role as having admin access", () => {
      ADMIN_ROLES.forEach((role) => {
        expect(hasAdminAccess(role)).toBe(true);
      });
    });
  });
});
