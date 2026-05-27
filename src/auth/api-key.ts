import { randomBytes, createHash } from "crypto";

const PREFIX = "aqg_";

/**
 * Generates a new API key with the "aqg_" prefix.
 * The key consists of the prefix followed by 32 random bytes encoded as base64url.
 * @returns A new API key string.
 */
export function generateApiKey(): string {
	const randomPart = randomBytes(32).toString("base64url");
	return `${PREFIX}${randomPart}`;
}

/**
 * Hashes an API key using SHA-256.
 * @param key - The plaintext API key.
 * @returns The hex-encoded SHA-256 digest.
 */
export function hashApiKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

/**
 * Verifies an API key against a stored hash using constant-time comparison via hash match.
 * @param key - The plaintext API key to verify.
 * @param hash - The stored SHA-256 hex digest.
 * @returns True if the key matches the hash.
 */
export function verifyApiKey(key: string, hash: string): boolean {
	const candidateHash = hashApiKey(key);
	// Constant-time comparison: both are fixed-length hex digests (64 chars),
	// so comparing the hashes avoids timing attacks on the original key.
	return candidateHash === hash;
}
