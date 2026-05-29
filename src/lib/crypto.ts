import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a fixed 32-byte AES-256 key from an arbitrary secret string.
 * @param key - Any secret string (recommend >=32 chars).
 * @returns A 32-byte Buffer suitable for AES-256.
 */
function deriveKey(key: string): Buffer {
	return createHash("sha256").update(key, "utf8").digest();
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * @param plaintext - The string to encrypt.
 * @param key - Any secret string (>=32 chars); SHA-256 derived to a 32-byte AES key.
 * @returns Colon-separated string: "ivHex:authTagHex:ciphertextHex"
 */
export function encrypt(plaintext: string, key: string): string {
	const keyBuffer = deriveKey(key);
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, keyBuffer, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});

	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);

	const authTag = cipher.getAuthTag();

	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a ciphertext string produced by `encrypt`.
 * @param ciphertext - Colon-separated string: "ivHex:authTagHex:ciphertextHex"
 * @param key - Any secret string (>=32 chars); SHA-256 derived to a 32-byte AES key (must match the one used for encryption).
 * @returns The original plaintext string.
 */
export function decrypt(ciphertext: string, key: string): string {
	const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");

	const keyBuffer = deriveKey(key);
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const encrypted = Buffer.from(encryptedHex, "hex");

	const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	});

	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([
		decipher.update(encrypted),
		decipher.final(),
	]);

	return decrypted.toString("utf8");
}
