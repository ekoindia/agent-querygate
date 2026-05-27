import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { verifyJwt } from "./jwt.js";
import { hashApiKey } from "./api-key.js";
import { agents, users } from "@/db/schema.js";
import type { AuthenticatedUser, AuthenticatedAgent } from "@/lib/types.js";
import { Errors } from "@/lib/errors.js";
import type { Config } from "@/config.js";

/**
 * Middleware that authenticates admin users via JWT stored in a "token" cookie.
 * On success, sets c.set("user") with the AuthenticatedUser identity.
 */
export const adminAuth = createMiddleware(async (c, next) => {
	const token = getCookie(c, "token");
	if (!token) {
		throw Errors.unauthorized("No auth token");
	}

	const config = c.get("config") as Config;
	const payload = verifyJwt(token, config.jwtSecret);

	const db = c.get("db") as ReturnType<typeof import("drizzle-orm/mysql2").drizzle>;
	const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);

	if (!user || !user.isActive) {
		throw Errors.unauthorized("User inactive or not found");
	}

	const authenticatedUser: AuthenticatedUser = {
		userId: user.id,
		email: user.email,
		role: user.role,
	};

	c.set("user", authenticatedUser);
	await next();
});

/**
 * Middleware that restricts access to admin and superadmin roles.
 * Must be used after adminAuth so that c.get("user") is populated.
 */
export const adminOnlyAuth = createMiddleware(async (c, next) => {
	const user = c.get("user") as AuthenticatedUser;

	if (user.role === "user") {
		throw Errors.forbidden("Admin access required");
	}

	await next();
});

/**
 * Middleware that authenticates agents via the X-API-Key header.
 * On success, sets c.set("agent") with the AuthenticatedAgent identity.
 */
export const agentAuth = createMiddleware(async (c, next) => {
	const apiKey = c.req.header("X-API-Key");
	if (!apiKey) {
		throw Errors.unauthorized("No API key");
	}

	const apiKeyHash = hashApiKey(apiKey);

	const db = c.get("db") as ReturnType<typeof import("drizzle-orm/mysql2").drizzle>;
	const [agent] = await db.select().from(agents).where(eq(agents.apiKeyHash, apiKeyHash)).limit(1);

	if (!agent || !agent.isActive) {
		throw Errors.unauthorized("Invalid or inactive API key");
	}

	const authenticatedAgent: AuthenticatedAgent = {
		agentId: agent.id,
		userId: agent.userId,
		agentName: agent.name,
	};

	c.set("agent", authenticatedAgent);
	await next();
});
