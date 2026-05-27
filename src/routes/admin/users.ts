import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema.js";
import { hashPassword } from "@/auth/password.js";
import { adminAuth, adminOnlyAuth } from "@/auth/middleware.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv } from "@/lib/types.js";

const userRoutes = new Hono<AppEnv>();

userRoutes.use("*", adminAuth, adminOnlyAuth);

// ── GET / ─────────────────────────────────────────────────────────
userRoutes.get("/", async (c) => {
	const db = c.get("db");

	const allUsers = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			role: users.role,
			isActive: users.isActive,
			createdAt: users.createdAt,
		})
		.from(users);

	return c.json({ users: allUsers });
});

// ── POST / ────────────────────────────────────────────────────────
const createUserSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
	role: z.enum(["admin", "user"]),
});

userRoutes.post("/", zValidator("json", createUserSchema), async (c) => {
	const body = c.req.valid("json");
	const db = c.get("db");
	const currentUser = c.get("user");

	// Check email uniqueness
	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, body.email))
		.limit(1);

	if (existing) {
		throw Errors.badRequest("Email already in use");
	}

	const id = uuidv4();
	const passwordHash = await hashPassword(body.password);

	await db.insert(users).values({
		id,
		email: body.email,
		name: body.name,
		passwordHash,
		role: body.role,
		createdBy: currentUser.userId,
	});

	return c.json(
		{
			user: {
				id,
				email: body.email,
				name: body.name,
				role: body.role,
			},
		},
		201,
	);
});

// ── PUT /:id ──────────────────────────────────────────────────────
const updateUserSchema = z.object({
	name: z.string().min(1).optional(),
	email: z.string().email().optional(),
	isActive: z.boolean().optional(),
});

userRoutes.put("/:id", zValidator("json", updateUserSchema), async (c) => {
	const userId = c.req.param("id");
	const body = c.req.valid("json");
	const db = c.get("db");

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) {
		throw Errors.notFound("User not found");
	}

	const updates: Record<string, unknown> = {};
	if (body.name !== undefined) updates.name = body.name;
	if (body.email !== undefined) updates.email = body.email;
	if (body.isActive !== undefined) updates.isActive = body.isActive;

	if (Object.keys(updates).length > 0) {
		await db.update(users).set(updates).where(eq(users.id, userId));
	}

	return c.json({ ok: true });
});

// ── PUT /:id/role ─────────────────────────────────────────────────
const updateRoleSchema = z.object({
	role: z.enum(["admin", "user"]),
});

userRoutes.put(
	"/:id/role",
	zValidator("json", updateRoleSchema),
	async (c) => {
		const userId = c.req.param("id");
		const body = c.req.valid("json");
		const db = c.get("db");
		const currentUser = c.get("user");

		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user) {
			throw Errors.notFound("User not found");
		}

		if (user.role === "superadmin") {
			throw Errors.forbidden("Cannot change superadmin role");
		}

		// The schema restricts body.role to "admin"|"user", so this check
		// is a safeguard for future changes to the schema.
		if (
			currentUser.role !== "superadmin" &&
			(body.role as string) === "superadmin"
		) {
			throw Errors.forbidden("Only superadmin can assign superadmin role");
		}

		await db
			.update(users)
			.set({ role: body.role })
			.where(eq(users.id, userId));

		return c.json({ ok: true });
	},
);

// ── DELETE /:id ───────────────────────────────────────────────────
userRoutes.delete("/:id", async (c) => {
	const userId = c.req.param("id");
	const db = c.get("db");

	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) {
		throw Errors.notFound("User not found");
	}

	if (user.role === "superadmin") {
		throw Errors.forbidden("Cannot delete superadmin");
	}

	await db.update(users).set({ isActive: false }).where(eq(users.id, userId));

	return c.json({ ok: true });
});

export default userRoutes;
