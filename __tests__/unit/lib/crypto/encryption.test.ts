import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Store original env
const originalEnv = process.env;

describe("encryption utilities", () => {
  // Valid 32-byte (64 hex chars) encryption key for testing
  const TEST_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    // Reset modules before each test to ensure clean state
    vi.resetModules();
    process.env = { ...originalEnv, API_KEYS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("encryptApiKey", () => {
    it("should encrypt and return string in correct format (iv:authTag:encrypted)", async () => {
      const { encryptApiKey } = await import("@/lib/crypto/encryption");
      const plainKey = "sk_live_abc123xyz";

      const encrypted = encryptApiKey(plainKey);

      // Format should be iv:authTag:encrypted
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);

      // IV should be 32 hex chars (16 bytes)
      expect(parts[0]).toHaveLength(32);
      // Auth tag should be 32 hex chars (16 bytes)
      expect(parts[1]).toHaveLength(32);
      // Encrypted data should be non-empty hex
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it("should produce different ciphertext for same plaintext (random IV)", async () => {
      const { encryptApiKey } = await import("@/lib/crypto/encryption");
      const plainKey = "sk_live_abc123xyz";

      const encrypted1 = encryptApiKey(plainKey);
      const encrypted2 = encryptApiKey(plainKey);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should throw error for empty API key", async () => {
      const { encryptApiKey } = await import("@/lib/crypto/encryption");

      expect(() => encryptApiKey("")).toThrow("API key não pode estar vazia");
      expect(() => encryptApiKey("   ")).toThrow("API key não pode estar vazia");
    });

    it("should throw error when encryption key is not configured", async () => {
      process.env.API_KEYS_ENCRYPTION_KEY = "";
      vi.resetModules();
      const { encryptApiKey } = await import("@/lib/crypto/encryption");

      expect(() => encryptApiKey("test")).toThrow(
        "API_KEYS_ENCRYPTION_KEY não configurada"
      );
    });

    it("should throw error when encryption key is invalid length", async () => {
      process.env.API_KEYS_ENCRYPTION_KEY = "invalid-short-key";
      vi.resetModules();
      const { encryptApiKey } = await import("@/lib/crypto/encryption");

      expect(() => encryptApiKey("test")).toThrow(
        "API_KEYS_ENCRYPTION_KEY deve ter 32 bytes"
      );
    });
  });

  describe("decryptApiKey", () => {
    it("should decrypt encrypted API key correctly", async () => {
      const { encryptApiKey, decryptApiKey } = await import(
        "@/lib/crypto/encryption"
      );
      const plainKey = "sk_live_abc123xyz_secret";

      const encrypted = encryptApiKey(plainKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(plainKey);
    });

    it("should handle various API key formats", async () => {
      const { encryptApiKey, decryptApiKey } = await import(
        "@/lib/crypto/encryption"
      );

      const testKeys = [
        "simple-key",
        "key_with_underscores_123",
        "KEY-WITH-DASHES",
        "MixedCase123Key",
        "key with spaces",
        "特殊字符キー", // Unicode characters
        "a".repeat(500), // Long key
      ];

      for (const key of testKeys) {
        const encrypted = encryptApiKey(key);
        const decrypted = decryptApiKey(encrypted);
        expect(decrypted).toBe(key);
      }
    });

    it("should throw error for empty encrypted key", async () => {
      const { decryptApiKey } = await import("@/lib/crypto/encryption");

      expect(() => decryptApiKey("")).toThrow(
        "Chave criptografada não pode estar vazia"
      );
    });

    it("should throw error for invalid format (not 3 parts)", async () => {
      const { decryptApiKey } = await import("@/lib/crypto/encryption");

      expect(() => decryptApiKey("invalid")).toThrow(
        "Formato de chave criptografada inválido"
      );
      expect(() => decryptApiKey("part1:part2")).toThrow(
        "Formato de chave criptografada inválido"
      );
      expect(() => decryptApiKey("part1:part2:part3:part4")).toThrow(
        "Formato de chave criptografada inválido"
      );
    });

    it("should throw error for tampered ciphertext", async () => {
      const { encryptApiKey, decryptApiKey } = await import(
        "@/lib/crypto/encryption"
      );
      const encrypted = encryptApiKey("test-key");

      // Tamper with the encrypted data
      const parts = encrypted.split(":");
      parts[2] = "0".repeat(parts[2].length); // Replace encrypted data
      const tampered = parts.join(":");

      expect(() => decryptApiKey(tampered)).toThrow();
    });

    it("should throw error for tampered auth tag", async () => {
      const { encryptApiKey, decryptApiKey } = await import(
        "@/lib/crypto/encryption"
      );
      const encrypted = encryptApiKey("test-key");

      // Tamper with the auth tag
      const parts = encrypted.split(":");
      parts[1] = "0".repeat(32); // Replace auth tag
      const tampered = parts.join(":");

      expect(() => decryptApiKey(tampered)).toThrow();
    });
  });

  describe("maskApiKey", () => {
    it("should mask API key showing only last 4 characters", async () => {
      const { maskApiKey } = await import("@/lib/crypto/encryption");

      // "sk_live_abc123xyz" has 17 chars, last 4 are "3xyz"
      expect(maskApiKey("sk_live_abc123xyz")).toBe("••••••••3xyz");
    });

    it("should return generic mask for short keys", async () => {
      const { maskApiKey } = await import("@/lib/crypto/encryption");

      expect(maskApiKey("abc")).toBe("••••••••");
      expect(maskApiKey("")).toBe("••••••••");
    });

    it("should allow custom number of visible characters", async () => {
      const { maskApiKey } = await import("@/lib/crypto/encryption");

      // Last 6 chars of "sk_live_abc123xyz" are "123xyz"
      expect(maskApiKey("sk_live_abc123xyz", 6)).toBe("••••••••123xyz");
      expect(maskApiKey("sk_live_abc123xyz", 2)).toBe("••••••••yz");
    });

    it("should handle null/undefined gracefully", async () => {
      const { maskApiKey } = await import("@/lib/crypto/encryption");

      expect(maskApiKey(null as unknown as string)).toBe("••••••••");
      expect(maskApiKey(undefined as unknown as string)).toBe("••••••••");
    });
  });

  describe("encryption key security", () => {
    it("should use AES-256-GCM (authenticated encryption)", async () => {
      const { encryptApiKey, decryptApiKey } = await import(
        "@/lib/crypto/encryption"
      );

      // AES-256-GCM provides:
      // - 16 byte IV (random)
      // - 16 byte auth tag (integrity verification)
      // - Variable length ciphertext

      const encrypted = encryptApiKey("test");
      const parts = encrypted.split(":");

      // Verify IV length (16 bytes = 32 hex chars)
      expect(parts[0]).toHaveLength(32);

      // Verify auth tag length (16 bytes = 32 hex chars)
      expect(parts[1]).toHaveLength(32);

      // Verify we can decrypt (proves GCM mode works)
      expect(decryptApiKey(encrypted)).toBe("test");
    });
  });
});
