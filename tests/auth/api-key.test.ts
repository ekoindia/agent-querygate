import { generateApiKey, hashApiKey, verifyApiKey } from "@/auth/api-key";

describe("api-key", () => {
	it("generates key with 'aqg_' prefix, length > 30", () => {
		const key = generateApiKey();
		expect(key.startsWith("aqg_")).toBe(true);
		expect(key.length).toBeGreaterThan(30);
	});

	it("hashes and verifies a key (roundtrip)", () => {
		const key = generateApiKey();
		const hash = hashApiKey(key);
		const isValid = verifyApiKey(key, hash);
		expect(isValid).toBe(true);
	});

	it("rejects wrong key", () => {
		const key = generateApiKey();
		const hash = hashApiKey(key);
		const isValid = verifyApiKey("aqg_wrong-key-here", hash);
		expect(isValid).toBe(false);
	});
});
