import { hashPassword, verifyPassword } from "@/auth/password";

describe("password", () => {
	it("hashes and verifies a password (roundtrip)", async () => {
		const password = "my-secure-password-123!";
		const hash = await hashPassword(password);
		const isValid = await verifyPassword(password, hash);
		expect(isValid).toBe(true);
	});

	it("rejects wrong password", async () => {
		const password = "correct-password";
		const hash = await hashPassword(password);
		const isValid = await verifyPassword("wrong-password", hash);
		expect(isValid).toBe(false);
	});
});
