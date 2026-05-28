import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq, and, gte, lte, ne, desc, count } from "drizzle-orm";
import { agentAuth, auditorOnly } from "@/auth/middleware.js";
import { auditLogs, auditReviews } from "@/db/schema.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv, AuthenticatedAgent } from "@/lib/types.js";
import type { SQL } from "drizzle-orm";

const auditorRoutes = new Hono<AppEnv>();

function buildAuditorFilters(
	agent: AuthenticatedAgent,
	params: Record<string, string | undefined>,
): SQL[] {
	const conditions: SQL[] = [];

	// Scope: auditor sees sibling agents' logs, never its own
	conditions.push(eq(auditLogs.userId, agent.userId));
	conditions.push(ne(auditLogs.agentId, agent.agentId));

	if (params.agent) {
		conditions.push(eq(auditLogs.agentId, params.agent));
	}
	if (params.db) {
		conditions.push(eq(auditLogs.databaseId, params.db));
	}
	if (params.op) {
		conditions.push(
			eq(
				auditLogs.operationType,
				params.op as "SELECT" | "INSERT" | "UPDATE" | "DELETE",
			),
		);
	}
	if (params.status) {
		conditions.push(
			eq(
				auditLogs.status,
				params.status as "allowed" | "denied" | "error",
			),
		);
	}
	if (params.from) {
		conditions.push(gte(auditLogs.createdAt, new Date(params.from)));
	}
	if (params.to) {
		conditions.push(lte(auditLogs.createdAt, new Date(params.to)));
	}

	return conditions;
}

// ── GET /audit/logs ──────────────────────────────────────────────
auditorRoutes.get("/audit/logs", agentAuth, auditorOnly, async (c) => {
	const agent = c.get("agent") as AuthenticatedAgent;
	const db = c.get("db");

	const page = Math.max(1, Number(c.req.query("page") || "1"));
	const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));
	const offset = (page - 1) * limit;

	const conditions = buildAuditorFilters(agent, {
		agent: c.req.query("agent"),
		db: c.req.query("db"),
		op: c.req.query("op"),
		status: c.req.query("status"),
		from: c.req.query("from"),
		to: c.req.query("to"),
	});

	const whereClause = and(...conditions);

	const [totalResult] = await db
		.select({ total: count() })
		.from(auditLogs)
		.where(whereClause);

	const rows = await db
		.select()
		.from(auditLogs)
		.where(whereClause)
		.orderBy(desc(auditLogs.createdAt))
		.limit(limit)
		.offset(offset);

	return c.json({
		logs: rows,
		pagination: {
			page,
			limit,
			total: totalResult.total,
			totalPages: Math.ceil(totalResult.total / limit),
		},
	});
});

// ── GET /audit/logs/:id ──────────────────────────────────────────
auditorRoutes.get("/audit/logs/:id", agentAuth, auditorOnly, async (c) => {
	const agent = c.get("agent") as AuthenticatedAgent;
	const db = c.get("db");
	const logId = c.req.param("id");

	const [log] = await db
		.select()
		.from(auditLogs)
		.where(
			and(
				eq(auditLogs.id, logId),
				eq(auditLogs.userId, agent.userId),
				ne(auditLogs.agentId, agent.agentId),
			),
		)
		.limit(1);

	if (!log) {
		throw Errors.notFound("Audit log not found");
	}

	const reviews = await db
		.select()
		.from(auditReviews)
		.where(eq(auditReviews.auditLogId, logId))
		.orderBy(desc(auditReviews.createdAt));

	return c.json({ log, reviews });
});

// ── POST /audit/reviews ──────────────────────────────────────────
const createReviewSchema = z.object({
	audit_log_id: z.string().min(1),
	flag_type: z.enum(["suspicious_pattern", "policy_violation", "data_anomaly", "performance_concern", "manual_review"]),
	severity: z.enum(["low", "medium", "high", "critical"]),
	notes: z.string().max(5000).optional(),
});

auditorRoutes.post(
	"/audit/reviews",
	agentAuth,
	auditorOnly,
	zValidator("json", createReviewSchema),
	async (c) => {
		const agent = c.get("agent") as AuthenticatedAgent;
		const db = c.get("db");
		const body = c.req.valid("json");

		// Verify audit log exists and auditor can access it
		const [log] = await db
			.select()
			.from(auditLogs)
			.where(
				and(
					eq(auditLogs.id, body.audit_log_id),
					eq(auditLogs.userId, agent.userId),
					ne(auditLogs.agentId, agent.agentId),
				),
			)
			.limit(1);

		if (!log) {
			throw Errors.notFound("Audit log not found");
		}

		const id = uuidv4();
		await db.insert(auditReviews).values({
			id,
			auditLogId: body.audit_log_id,
			flagType: body.flag_type,
			severity: body.severity,
			reviewerType: "ai",
			reviewerId: agent.agentId,
			notes: body.notes ?? null,
		});

		return c.json(
			{
				review: {
					id,
					auditLogId: body.audit_log_id,
					flagType: body.flag_type,
					severity: body.severity,
				},
			},
			201,
		);
	},
);

// ── GET /audit/reviews ───────────────────────────────────────────
auditorRoutes.get("/audit/reviews", agentAuth, auditorOnly, async (c) => {
	const agent = c.get("agent") as AuthenticatedAgent;
	const db = c.get("db");

	const page = Math.max(1, Number(c.req.query("page") || "1"));
	const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));
	const offset = (page - 1) * limit;

	const whereClause = eq(auditReviews.reviewerId, agent.agentId);

	const [totalResult] = await db
		.select({ total: count() })
		.from(auditReviews)
		.where(whereClause);

	const rows = await db
		.select()
		.from(auditReviews)
		.where(whereClause)
		.orderBy(desc(auditReviews.createdAt))
		.limit(limit)
		.offset(offset);

	return c.json({
		reviews: rows,
		pagination: {
			page,
			limit,
			total: totalResult.total,
			totalPages: Math.ceil(totalResult.total / limit),
		},
	});
});

export default auditorRoutes;
