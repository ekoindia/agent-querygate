import { signJwt, verifyJwt } from "@/auth/jwt";
import type { UserRole } from "@/lib/types";

describe("jwt", () => {
	let secret: string;
	const payload = {
		userId: "user-123",
		email: "test@example.com",
		role: "admin" as UserRole,
	};

	beforeAll(() => {
		secret = process.env.JWT_SECRET!;
	});

	it("signs and verifies a token with payload {userId, email, role}", () => {
		const token = signJwt(payload, secret);
		const decoded = verifyJwt(token, secret);
		expect(decoded.userId).toBe(payload.userId);
		expect(decoded.email).toBe(payload.email);
		expect(decoded.role).toBe(payload.role);
	});

	it("rejects invalid token", () => {
		expect(() => verifyJwt("invalid.token.here", secret)).toThrow();
	});

	it("rejects expired token", async () => {
		const token = signJwt(payload, secret, "0s");
		// Small delay to ensure expiration
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(() => verifyJwt(token, secret)).toThrow();
	});
});
