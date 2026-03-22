import { randomBytes, createHash, timingSafeEqual } from "crypto";

const API_KEY_PREFIX = "sk-";
const API_KEY_BYTE_LENGTH = 36; // 36 bytes → 48-char base64url + 3-char prefix = 51 chars total

/**
 * Generate a new API key with its hash and display prefix.
 * The raw key is only returned once — store the hash, not the key.
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const rawBytes = randomBytes(API_KEY_BYTE_LENGTH);
  const key = API_KEY_PREFIX + rawBytes.toString("base64url");
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 8) + "...";

  return { key, hash, prefix };
}

/** SHA-256 hash of an API key for secure storage. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Constant-time comparison of a raw key against a stored hash. */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const candidateHash = hashApiKey(key);
  try {
    return timingSafeEqual(
      Buffer.from(candidateHash, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch {
    return false;
  }
}
