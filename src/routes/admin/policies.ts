import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq, and } from "drizzle-orm";
import { policies, agentDatabaseAccess, agents } from "@/db/schema.js";
import { adminAuth } from "@/auth/middleware.js";
import { Errors } from "@/lib/errors.js";
import { customRulesSchema } from "@/policy/value-validation.js";
import type { AppEnv, AuthenticatedUser } from "@/lib/types.js";

async function verifyAccessOwnership(
	db: any,
	user: AuthenticatedUser,
	agentId: string,
) {
	if (user.role === "admin" || user.role === "superadmin") return;
	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.id, agentId))
		.limit(1);
	if (!agent || agent.userId !== user.userId) {
		throw Errors.notFound("Agent not found");
	}
}

const policyRoutes = new Hono<AppEnv>();

policyRoutes.use("*", adminAuth);

// ── GET /agents/:agentId/databases/:dbId/policies ─────────────────
policyRoutes.get("/agents/:agentId/databases/:dbId/policies", async (c) => {
	const agentId = c.req.param("agentId");
	const dbId = c.req.param("dbId");
	const db = c.get("db");
	const user = c.get("user");

	await verifyAccessOwnership(db, user, agentId);

	const [access] = await db
		.select()
		.from(agentDatabaseAccess)
		.where(
			and(
				eq(agentDatabaseAccess.agentId, agentId),
				eq(agentDatabaseAccess.databaseId, dbId),
			),
		)
		.limit(1);

	if (!access) {
		throw Errors.notFound("Agent database access not found");
	}

	const rows = await db
		.select()
		.from(policies)
		.where(eq(policies.agentDatabaseAccessId, access.id));

	return c.json({ policies: rows });
});

// ── POST /agents/:agentId/databases/:dbId/policies ────────────────
const createPolicySchema = z.object({
	tableName: z.string().min(1),
	allowedOperations: z.array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"])),
	allowedColumns: z.array(z.string()).nullable().default(null),
	rowLimit: z.number().int().positive().nullable().default(null),
	whereClauseRequired: z.boolean().default(false),
	customRules: customRulesSchema,
});

policyRoutes.post(
	"/agents/:agentId/databases/:dbId/policies",
	zValidator("json", createPolicySchema),
	async (c) => {
		const agentId = c.req.param("agentId");
		const dbId = c.req.param("dbId");
		const body = c.req.valid("json");
		const db = c.get("db");
		const user = c.get("user");

		await verifyAccessOwnership(db, user, agentId);

		const [access] = await db
			.select()
			.from(agentDatabaseAccess)
			.where(
				and(
					eq(agentDatabaseAccess.agentId, agentId),
					eq(agentDatabaseAccess.databaseId, dbId),
				),
			)
			.limit(1);

		if (!access) {
			throw Errors.notFound("Agent database access not found");
		}

		const id = uuidv4();

		await db.insert(policies).values({
			id,
			agentDatabaseAccessId: access.id,
			tableName: body.tableName,
			allowedOperations: body.allowedOperations,
			allowedColumns: body.allowedColumns,
			rowLimit: body.rowLimit,
			whereClauseRequired: body.whereClauseRequired,
			customRules: body.customRules,
		});

		return c.json(
			{
				policy: {
					id,
					agentDatabaseAccessId: access.id,
					tableName: body.tableName,
					allowedOperations: body.allowedOperations,
					allowedColumns: body.allowedColumns,
					rowLimit: body.rowLimit,
					whereClauseRequired: body.whereClauseRequired,
					customRules: body.customRules,
				},
			},
			201,
		);
	},
);

// ── PUT /policies/:id ─────────────────────────────────────────────
const updatePolicySchema = z.object({
	tableName: z.string().min(1).optional(),
	allowedOperations: z
		.array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"]))
		.optional(),
	allowedColumns: z.array(z.string()).nullable().optional(),
	rowLimit: z.number().int().positive().nullable().optional(),
	whereClauseRequired: z.boolean().optional(),
	customRules: customRulesSchema.optional(),
});

policyRoutes.put(
	"/policies/:id",
	zValidator("json", updatePolicySchema),
	async (c) => {
		const policyId = c.req.param("id");
		const body = c.req.valid("json");
		const db = c.get("db");
		const user = c.get("user");

		const [policy] = await db
			.select()
			.from(policies)
			.where(eq(policies.id, policyId))
			.limit(1);

		if (!policy) {
			throw Errors.notFound("Policy not found");
		}

		// Verify ownership through access → agent chain
		const [access] = await db
			.select()
			.from(agentDatabaseAccess)
			.where(eq(agentDatabaseAccess.id, policy.agentDatabaseAccessId))
			.limit(1);
		if (access) {
			await verifyAccessOwnership(db, user, access.agentId);
		}

		const updates: Record<string, unknown> = {};
		if (body.tableName !== undefined) updates.tableName = body.tableName;
		if (body.allowedOperations !== undefined)
			updates.allowedOperations = body.allowedOperations;
		if (body.allowedColumns !== undefined)
			updates.allowedColumns = body.allowedColumns;
		if (body.rowLimit !== undefined) updates.rowLimit = body.rowLimit;
		if (body.whereClauseRequired !== undefined)
			updates.whereClauseRequired = body.whereClauseRequired;
		if (body.customRules !== undefined) updates.customRules = body.customRules;

		if (Object.keys(updates).length > 0) {
			await db
				.update(policies)
				.set(updates)
				.where(eq(policies.id, policyId));
		}

		return c.json({ ok: true });
	},
);

// ── DELETE /policies/:id ──────────────────────────────────────────
policyRoutes.delete("/policies/:id", async (c) => {
	const policyId = c.req.param("id");
	const db = c.get("db");
	const user = c.get("user");

	const [policy] = await db
		.select()
		.from(policies)
		.where(eq(policies.id, policyId))
		.limit(1);

	if (!policy) {
		throw Errors.notFound("Policy not found");
	}

	// Verify ownership through access → agent chain
	const [access] = await db
		.select()
		.from(agentDatabaseAccess)
		.where(eq(agentDatabaseAccess.id, policy.agentDatabaseAccessId))
		.limit(1);
	if (access) {
		await verifyAccessOwnership(db, user, access.agentId);
	}

	await db.delete(policies).where(eq(policies.id, policyId));

	return c.json({ ok: true });
});

export default policyRoutes;
