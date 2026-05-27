import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq, count } from "drizzle-orm";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { users } from "@/db/schema.js";
import { hashPassword, verifyPassword } from "@/auth/password.js";
import { signJwt, verifyJwt } from "@/auth/jwt.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv } from "@/lib/types.js";

const authRoutes = new Hono<AppEnv>();

// ── POST /setup ───────────────────────────────────────────────────
const setupSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
});

authRoutes.post("/setup", zValidator("json", setupSchema), async (c) => {
	const body = c.req.valid("json");
	const db = c.get("db");
	const config = c.get("config");

	const [result] = await db.select({ total: count() }).from(users);
	if (result.total > 0) {
		throw Errors.badRequest("Setup already completed");
	}

	const id = uuidv4();
	const passwordHash = await hashPassword(body.password);

	await db.insert(users).values({
		id,
		email: body.email,
		name: body.name,
		passwordHash,
		role: "superadmin",
	});

	const token = signJwt(
		{ userId: id, email: body.email, role: "superadmin" },
		config.jwtSecret,
	);

	setCookie(c, "token", token, {
		httpOnly: true,
		secure: config.nodeEnv === "production",
		sameSite: "Lax",
		path: "/",
		maxAge: 60 * 60 * 24, // 24 hours
	});

	return c.json({
		user: { id, email: body.email, name: body.name, role: "superadmin" },
	});
});

// ── GET /setup-status ─────────────────────────────────────────────
authRoutes.get("/setup-status", async (c) => {
	const db = c.get("db");
	const [result] = await db.select({ total: count() }).from(users);
	return c.json({ needsSetup: result.total === 0 });
});

// ── POST /login ───────────────────────────────────────────────────
const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
	const body = c.req.valid("json");
	const db = c.get("db");
	const config = c.get("config");

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, body.email))
		.limit(1);

	if (!user) {
		throw Errors.unauthorized("Invalid credentials");
	}

	if (!user.isActive) {
		throw Errors.unauthorized("Account is disabled");
	}

	const valid = await verifyPassword(body.password, user.passwordHash);
	if (!valid) {
		throw Errors.unauthorized("Invalid credentials");
	}

	const token = signJwt(
		{ userId: user.id, email: user.email, role: user.role },
		config.jwtSecret,
	);

	setCookie(c, "token", token, {
		httpOnly: true,
		secure: config.nodeEnv === "production",
		sameSite: "Lax",
		path: "/",
		maxAge: 60 * 60 * 24,
	});

	return c.json({
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
		},
	});
});

// ── POST /logout ──────────────────────────────────────────────────
authRoutes.post("/logout", (c) => {
	deleteCookie(c, "token", { path: "/" });
	return c.json({ ok: true });
});

// ── GET /me ───────────────────────────────────────────────────────
authRoutes.get("/me", async (c) => {
	const db = c.get("db");
	const config = c.get("config");

	const token = getCookie(c, "token");
	if (!token) {
		return c.json({ user: null });
	}

	try {
		const payload = verifyJwt(token, config.jwtSecret);
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, payload.userId))
			.limit(1);

		if (!user || !user.isActive) {
			return c.json({ user: null });
		}

		return c.json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
			},
		});
	} catch {
		return c.json({ user: null });
	}
});

export default authRoutes;
