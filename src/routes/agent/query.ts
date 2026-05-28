import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { agentAuth, executorOnly } from "@/auth/middleware.js";
import { checkBlockedKeywords } from "@/policy/blocked-keywords.js";
import { parseSql } from "@/policy/sql-parser.js";
import { evaluatePolicy } from "@/policy/engine.js";
import type { PolicyRecord } from "@/policy/engine.js";
import { getTargetPool } from "@/query/pool-manager.js";
import { executeReadQuery } from "@/query/executor.js";
import { writeAuditLog } from "@/audit/logger.js";
import { databases, agentDatabaseAccess, policies } from "@/db/schema.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv, AuthenticatedAgent } from "@/lib/types.js";
import type { Config } from "@/config.js";
import type { Database } from "@/db/connection.js";

/**
 * Resolves which database the agent should operate against.
 * If databaseId is provided, looks it up directly.
 * Otherwise auto-resolves when the agent has access to exactly one database.
 */
export async function resolveDatabase(
	db: Database,
	agent: AuthenticatedAgent,
	databaseId?: string,
): Promise<{ databaseId: string; dbRecord: typeof databases.$inferSelect }> {
	if (databaseId) {
		const [dbRecord] = await db
			.select()
			.from(databases)
			.where(eq(databases.id, databaseId))
			.limit(1);

		if (!dbRecord) {
			throw Errors.notFound("Database not found");
		}

		return { databaseId, dbRecord };
	}

	// Auto-resolve: find all database access records for the agent
	const accessRecords = await db
		.select({ databaseId: agentDatabaseAccess.databaseId })
		.from(agentDatabaseAccess)
		.where(eq(agentDatabaseAccess.agentId, agent.agentId));

	if (accessRecords.length === 0) {
		throw Errors.badRequest("No database access configured");
	}

	if (accessRecords.length > 1) {
		throw Errors.badRequest("Multiple databases available — specify database_id");
	}

	const resolvedId = accessRecords[0]!.databaseId;
	const [dbRecord] = await db
		.select()
		.from(databases)
		.where(eq(databases.id, resolvedId))
		.limit(1);

	if (!dbRecord) {
		throw Errors.notFound("Database not found");
	}

	return { databaseId: resolvedId, dbRecord };
}

const queryRoutes = new Hono<AppEnv>();

const queryBodySchema = z.object({
	sql: z.string().min(1),
	database_id: z.string().optional(),
	reason: z.string().max(2000).optional(),
});

/**
 * POST /query
 * Executes a read-only (SELECT) query against the target database
 * after validating against blocked keywords and agent policies.
 */
queryRoutes.post(
	"/query",
	agentAuth,
	executorOnly,
	zValidator("json", queryBodySchema),
	async (c) => {
		const agent = c.get("agent") as AuthenticatedAgent;
		const db = c.get("db");
		const config = c.get("config") as Config;
		const body = c.req.valid("json");

		// 1. Check blocked keywords
		const blockedReason = checkBlockedKeywords(body.sql);
		if (blockedReason) {
			throw Errors.policyDenied(blockedReason);
		}

		// 2. Parse SQL — must be SELECT
		const parsed = parseSql(body.sql);
		if (parsed.operation !== "SELECT") {
			throw Errors.badRequest("Use /execute for write operations");
		}

		// 3. Resolve database
		const { databaseId, dbRecord } = await resolveDatabase(db, agent, body.database_id);

		// 4. Lookup agent database access
		const [access] = await db
			.select()
			.from(agentDatabaseAccess)
			.where(
				and(
					eq(agentDatabaseAccess.agentId, agent.agentId),
					eq(agentDatabaseAccess.databaseId, databaseId),
				),
			)
			.limit(1);

		if (!access) {
			throw Errors.forbidden("No access to this database");
		}

		// 5. Lookup policies for this access record
		const policyRows = await db
			.select()
			.from(policies)
			.where(eq(policies.agentDatabaseAccessId, access.id));

		const policyRecords: PolicyRecord[] = policyRows.map((row) => ({
			id: row.id,
			tableName: row.tableName,
			allowedOperations: row.allowedOperations,
			allowedColumns: row.allowedColumns ?? null,
			rowLimit: row.rowLimit,
			whereClauseRequired: row.whereClauseRequired,
		}));

		// 6. Evaluate policy
		const policyResult = evaluatePolicy(parsed, policyRecords);

		await writeAuditLog(db, {
			agentId: agent.agentId,
			databaseId,
			userId: agent.userId,
			query: parsed,
			policyResult,
			reason: body.reason,
		});

		if (!policyResult.allowed) {
			throw Errors.policyDenied(policyResult.denialReason ?? "Policy denied");
		}

		// 8. Execute query
		const pool = getTargetPool(databaseId, {
			host: dbRecord.host,
			port: dbRecord.port,
			dbName: dbRecord.dbName,
			username: dbRecord.username,
			passwordEncrypted: dbRecord.passwordEncrypted,
		}, config.encryptionKey);

		const result = await executeReadQuery(pool, parsed);

		return c.json({
			columns: result.columns,
			rows: result.rows,
			rowCount: result.rowCount,
		});
	},
);

export default queryRoutes;
