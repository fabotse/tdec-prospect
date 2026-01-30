/**
 * API Keys Encryption Utilities
 * Story: 2.2 - API Keys Storage & Encryption
 *
 * Uses AES-256-GCM for authenticated encryption.
 * CRITICAL: Never export decrypt function to client-side code.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * @throws Error if key is not configured or invalid
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.API_KEYS_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      "API_KEYS_ENCRYPTION_KEY não configurada. Execute: openssl rand -hex 32"
    );
  }

  if (keyHex.length !== 64) {
    throw new Error(
      "API_KEYS_ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hex)"
    );
  }

  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt an API key using AES-256-GCM
 *
 * @param plainKey - The plain text API key to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all hex)
 * @throws Error if encryption fails or key is not configured
 *
 * @example
 * const encrypted = encryptApiKey("sk_live_abc123");
 * // Returns: "a1b2c3...:d4e5f6...:g7h8i9..."
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey || plainKey.trim().length === 0) {
    throw new Error("API key não pode estar vazia");
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an API key using AES-256-GCM
 *
 * INTERNAL USE ONLY - This function should NEVER be called from client-side code.
 * Use only when making calls to external APIs that require the decrypted key.
 *
 * @param encryptedKey - The encrypted string in format: iv:authTag:encryptedData
 * @returns The original plain text API key
 * @throws Error if decryption fails, format is invalid, or auth tag verification fails
 *
 * @example
 * const plain = decryptApiKey("a1b2c3...:d4e5f6...:g7h8i9...");
 * // Returns: "sk_live_abc123"
 */
export function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey || encryptedKey.trim().length === 0) {
    throw new Error("Chave criptografada não pode estar vazia");
  }

  const parts = encryptedKey.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de chave criptografada inválido");
  }

  const [ivHex, authTagHex, encrypted] = parts;

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Componentes da chave criptografada ausentes");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error("IV inválido");
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Auth tag inválido");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Mask an API key for display purposes
 * Shows only the last 4 characters with bullet characters prefix
 *
 * @param key - The API key to mask (can be plain or encrypted)
 * @param last - Number of characters to show at end (default: 4)
 * @returns Masked string like "••••••••1234"
 *
 * @example
 * maskApiKey("sk_live_abc123xyz") // Returns "••••••••xyz"
 */
export function maskApiKey(key: string, last: number = 4): string {
  if (!key || key.length < last) {
    return "••••••••";
  }

  const visible = key.slice(-last);
  return `••••••••${visible}`;
}
