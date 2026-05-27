import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq, and } from "drizzle-orm";
import { agents, agentDatabaseAccess, databases } from "@/db/schema.js";
import { generateApiKey, hashApiKey } from "@/auth/api-key.js";
import { adminAuth } from "@/auth/middleware.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv, AuthenticatedUser } from "@/lib/types.js";

const agentRoutes = new Hono<AppEnv>();

agentRoutes.use("*", adminAuth);

/**
 * Scope filter: regular users see only their own agents.
 */
function scopeFilter(user: AuthenticatedUser) {
	if (user.role === "admin" || user.role === "superadmin") {
		return undefined;
	}
	return eq(agents.userId, user.userId);
}

// ── GET / ─────────────────────────────────────────────────────────
agentRoutes.get("/", async (c) => {
	const db = c.get("db");
	const user = c.get("user");

	const filter = scopeFilter(user);

	const rows = await db
		.select({
			id: agents.id,
			userId: agents.userId,
			name: agents.name,
			isActive: agents.isActive,
			createdAt: agents.createdAt,
		})
		.from(agents)
		.where(filter);

	return c.json({ agents: rows });
});

// ── POST / ────────────────────────────────────────────────────────
const createAgentSchema = z.object({
	name: z.string().min(1),
});

agentRoutes.post("/", zValidator("json", createAgentSchema), async (c) => {
	const body = c.req.valid("json");
	const db = c.get("db");
	const user = c.get("user");

	const id = uuidv4();
	const apiKey = generateApiKey();
	const apiKeyHash = hashApiKey(apiKey);

	await db.insert(agents).values({
		id,
		userId: user.userId,
		name: body.name,
		apiKeyHash,
	});

	return c.json(
		{
			agent: { id, name: body.name, isActive: true },
			apiKey,
		},
		201,
	);
});

// ── PUT /:id ──────────────────────────────────────────────────────
const updateAgentSchema = z.object({
	name: z.string().min(1).optional(),
	isActive: z.boolean().optional(),
});

agentRoutes.put("/:id", zValidator("json", updateAgentSchema), async (c) => {
	const agentId = c.req.param("id");
	const body = c.req.valid("json");
	const db = c.get("db");
	const user = c.get("user");

	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);

	if (!agent) {
		throw Errors.notFound("Agent not found");
	}

	if (user.role === "user" && agent.userId !== user.userId) {
		throw Errors.notFound("Agent not found");
	}

	const updates: Record<string, unknown> = {};
	if (body.name !== undefined) updates.name = body.name;
	if (body.isActive !== undefined) updates.isActive = body.isActive;

	if (Object.keys(updates).length > 0) {
		await db.update(agents).set(updates).where(eq(agents.id, agentId));
	}

	return c.json({ ok: true });
});

// ── DELETE /:id ───────────────────────────────────────────────────
agentRoutes.delete("/:id", async (c) => {
	const agentId = c.req.param("id");
	const db = c.get("db");
	const user = c.get("user");

	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);

	if (!agent) {
		throw Errors.notFound("Agent not found");
	}

	if (user.role === "user" && agent.userId !== user.userId) {
		throw Errors.notFound("Agent not found");
	}

	await db.delete(agents).where(eq(agents.id, agentId));

	return c.json({ ok: true });
});

// ── POST /:id/regenerate-key ──────────────────────────────────────
agentRoutes.post("/:id/regenerate-key", async (c) => {
	const agentId = c.req.param("id");
	const db = c.get("db");
	const user = c.get("user");

	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);

	if (!agent) {
		throw Errors.notFound("Agent not found");
	}

	if (user.role === "user" && agent.userId !== user.userId) {
		throw Errors.notFound("Agent not found");
	}

	const apiKey = generateApiKey();
	const newHash = hashApiKey(apiKey);

	await db
		.update(agents)
		.set({ apiKeyHash: newHash })
		.where(eq(agents.id, agentId));

	return c.json({ apiKey });
});

// ── GET /:id/databases ────────────────────────────────────────────
agentRoutes.get("/:id/databases", async (c) => {
	const agentId = c.req.param("id");
	const db = c.get("db");
	const user = c.get("user");

	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);

	if (!agent) {
		throw Errors.notFound("Agent not found");
	}

	if (user.role === "user" && agent.userId !== user.userId) {
		throw Errors.notFound("Agent not found");
	}

	const rows = await db
		.select()
		.from(agentDatabaseAccess)
		.where(eq(agentDatabaseAccess.agentId, agentId));

	return c.json({ databases: rows });
});

// ── POST /:id/databases/:dbId ─────────────────────────────────────
agentRoutes.post("/:id/databases/:dbId", async (c) => {
	const agentId = c.req.param("id");
	const dbId = c.req.param("dbId");
	const db = c.get("db");
	const user = c.get("user");

	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);

	if (!agent) {
		throw Errors.notFound("Agent not found");
	}

	if (user.role === "user" && agent.userId !== user.userId) {
		throw Errors.notFound("Agent not found");
	}

	// Verify database ownership for non-admin users
	const [dbRecord] = await db
		.select()
		.from(databases)
		.where(eq(databases.id, dbId))
		.limit(1);

	if (!dbRecord) {
		throw Errors.notFound("Database not found");
	}

	if (user.role === "user" && dbRecord.userId !== user.userId) {
		throw Errors.notFound("Database not found");
	}

	// Check if access already exists
	const [existing] = await db
		.select()
		.from(agentDatabaseAccess)
		.where(
			and(
				eq(agentDatabaseAccess.agentId, agentId),
				eq(agentDatabaseAccess.databaseId, dbId),
			),
		)
		.limit(1);

	if (existing) {
		return c.json({ access: existing });
	}

	const id = uuidv4();
	await db.insert(agentDatabaseAccess).values({
		id,
		agentId,
		databaseId: dbId,
	});

	return c.json({ access: { id, agentId, databaseId: dbId } }, 201);
});

// ── DELETE /:id/databases/:dbId ───────────────────────────────────
agentRoutes.delete("/:id/databases/:dbId", async (c) => {
	const agentId = c.req.param("id");
	const dbId = c.req.param("dbId");
	const db = c.get("db");
	const user = c.get("user");

	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);

	if (!agent) {
		throw Errors.notFound("Agent not found");
	}

	if (user.role === "user" && agent.userId !== user.userId) {
		throw Errors.notFound("Agent not found");
	}

	// Verify database ownership for non-admin users
	if (user.role === "user") {
		const [dbRecord] = await db
			.select()
			.from(databases)
			.where(eq(databases.id, dbId))
			.limit(1);

		if (!dbRecord || dbRecord.userId !== user.userId) {
			throw Errors.notFound("Database not found");
		}
	}

	await db
		.delete(agentDatabaseAccess)
		.where(
			and(
				eq(agentDatabaseAccess.agentId, agentId),
				eq(agentDatabaseAccess.databaseId, dbId),
			),
		);

	return c.json({ ok: true });
});

export default agentRoutes;
