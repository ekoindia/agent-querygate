import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { agentAuth, executorOnly } from "@/auth/middleware.js";
import { checkBlockedKeywords } from "@/policy/blocked-keywords.js";
import { parseSql } from "@/policy/sql-parser.js";
import { evaluatePolicy, getPolicyRowLimit } from "@/policy/engine.js";
import type { PolicyRecord } from "@/policy/engine.js";
import { parseCustomRules } from "@/policy/value-validation.js";
import { getTargetPool } from "@/query/pool-manager.js";
import { executeWriteQuery, countAffectedRows } from "@/query/executor.js";
import { writeAuditLog } from "@/audit/logger.js";
import { databases, agentDatabaseAccess, policies } from "@/db/schema.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv, AuthenticatedAgent } from "@/lib/types.js";
import type { Config } from "@/config.js";
import { resolveDatabase } from "./query.js";

const executeRoutes = new Hono<AppEnv>();

const executeBodySchema = z.object({
	sql: z.string().min(1),
	database_id: z.string().optional(),
	reason: z.string().max(2000).optional(),
});

/**
 * POST /execute
 * Executes a write (INSERT/UPDATE/DELETE) query against the target database
 * after validating against blocked keywords, agent policies, and row limits.
 */
executeRoutes.post(
	"/execute",
	agentAuth,
	executorOnly,
	zValidator("json", executeBodySchema),
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

		// 2. Parse SQL — must NOT be SELECT
		const parsed = parseSql(body.sql);
		if (parsed.operation === "SELECT") {
			throw Errors.badRequest("Use /query for read operations");
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
			customRules: parseCustomRules(row.customRules),
		}));

		// 6. Evaluate policy
		const policyResult = evaluatePolicy(parsed, policyRecords);

		if (!policyResult.allowed) {
			await writeAuditLog(db, {
				agentId: agent.agentId,
				databaseId,
				userId: agent.userId,
				query: parsed,
				policyResult,
				reason: body.reason,
			});

			if (policyResult.valueViolations?.length) {
				throw Errors.valueValidationFailed(
					policyResult.denialReason ?? "Value validation failed",
					{
						violations: policyResult.valueViolations,
						unvalidatable: policyResult.unvalidatableColumns ?? [],
					},
				);
			}
			throw Errors.policyDenied(policyResult.denialReason ?? "Policy denied");
		}

		// 7. Check row limit
		const pool = getTargetPool(databaseId, {
			host: dbRecord.host,
			port: dbRecord.port,
			dbName: dbRecord.dbName,
			username: dbRecord.username,
			passwordEncrypted: dbRecord.passwordEncrypted,
		}, config.encryptionKey);

		const rowLimit = getPolicyRowLimit(parsed, policyRecords);
		if (rowLimit !== null) {
			const affected = await countAffectedRows(pool, parsed);
			if (affected > rowLimit) {
				const deniedResult = {
					allowed: false as const,
					denialReason: `Row limit exceeded: query affects ${affected} rows, limit is ${rowLimit}`,
				};
				await writeAuditLog(db, {
					agentId: agent.agentId,
					databaseId,
					userId: agent.userId,
					query: parsed,
					policyResult: deniedResult,
					reason: body.reason,
				});
				throw Errors.policyDenied(deniedResult.denialReason);
			}
		}

		// 8. Execute write query
		const firstTablePolicy = policyRecords.find(
			(p) => p.tableName === parsed.tables[0],
		);
		const columnValidationRules =
			firstTablePolicy?.customRules?.columnValidation;

		const startTime = Date.now();
		const snapshot = await executeWriteQuery(pool, parsed, {
			columnValidationRules,
		});
		const executionTimeMs = Date.now() - startTime;

		await writeAuditLog(db, {
			agentId: agent.agentId,
			databaseId,
			userId: agent.userId,
			query: parsed,
			policyResult,
			snapshot,
			executionTimeMs,
			reason: body.reason,
		});

		return c.json({
			affected_rows: snapshot.affectedRows,
			data_before: snapshot.dataBefore,
			data_after: snapshot.dataAfter,
		});
	},
);

export default executeRoutes;
