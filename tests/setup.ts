import { beforeAll, afterAll } from "vitest";

beforeAll(() => {
	process.env.JWT_SECRET = "test-jwt-secret-that-is-long-enough";
	process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
	process.env.NODE_ENV = "test";
});

afterAll(() => {
	// cleanup if needed
});
