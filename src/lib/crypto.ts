import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts plaintext using AES-256-GCM.
 * @param plaintext - The string to encrypt.
 * @param key - Hex-encoded 32-byte encryption key.
 * @returns Colon-separated string: "ivHex:authTagHex:ciphertextHex"
 */
export function encrypt(plaintext: string, key: string): string {
	const keyBuffer = Buffer.from(key, "hex");
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
 * @param key - Hex-encoded 32-byte encryption key (must match the one used for encryption).
 * @returns The original plaintext string.
 */
export function decrypt(ciphertext: string, key: string): string {
	const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");

	const keyBuffer = Buffer.from(key, "hex");
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
