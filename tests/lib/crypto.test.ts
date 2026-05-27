import { encrypt, decrypt } from "@/lib/crypto";

describe("crypto", () => {
	let key: string;

	beforeAll(() => {
		key = process.env.ENCRYPTION_KEY!;
	});

	it("encrypts and decrypts a string (roundtrip)", () => {
		const plaintext = "my-secret-database-password";
		const ciphertext = encrypt(plaintext, key);
		const decrypted = decrypt(ciphertext, key);
		expect(decrypted).toBe(plaintext);
	});

	it("produces different ciphertext for same plaintext (random IV)", () => {
		const plaintext = "same-plaintext";
		const ciphertext1 = encrypt(plaintext, key);
		const ciphertext2 = encrypt(plaintext, key);
		expect(ciphertext1).not.toBe(ciphertext2);
	});

	it("fails to decrypt with wrong key", () => {
		const plaintext = "sensitive-data";
		const ciphertext = encrypt(plaintext, key);
		const wrongKey = "abcdef0123456789abcdef0123456789";
		expect(() => decrypt(ciphertext, wrongKey)).toThrow();
	});

	it("outputs format iv:authTag:ciphertext (hex-encoded, colon-separated)", () => {
		const ciphertext = encrypt("test", key);
		const parts = ciphertext.split(":");
		expect(parts).toHaveLength(3);

		const [iv, authTag, encrypted] = parts;
		// IV is 12 bytes = 24 hex chars
		expect(iv).toMatch(/^[0-9a-f]{24}$/);
		// Auth tag is 16 bytes = 32 hex chars
		expect(authTag).toMatch(/^[0-9a-f]{32}$/);
		// Ciphertext is hex-encoded
		expect(encrypted).toMatch(/^[0-9a-f]+$/);
	});
});
