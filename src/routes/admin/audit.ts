import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq, and, gte, lte, desc, count } from "drizzle-orm";
import { auditLogs, auditReviews } from "@/db/schema.js";
import { adminAuth } from "@/auth/middleware.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv, AuthenticatedUser } from "@/lib/types.js";
import type { SQL } from "drizzle-orm";

const auditRoutes = new Hono<AppEnv>();

auditRoutes.use("*", adminAuth);

/**
 * Builds filter conditions from query params and user scope.
 */
function buildFilters(
	user: AuthenticatedUser,
	params: Record<string, string | undefined>,
): SQL[] {
	const conditions: SQL[] = [];

	// Scope: regular users see only their own logs
	if (user.role === "user") {
		conditions.push(eq(auditLogs.userId, user.userId));
	}

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

// ── GET / ─────────────────────────────────────────────────────────
auditRoutes.get("/", async (c) => {
	const db = c.get("db");
	const user = c.get("user");

	const page = Math.max(1, Number(c.req.query("page") || "1"));
	const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));
	const offset = (page - 1) * limit;

	const conditions = buildFilters(user, {
		agent: c.req.query("agent"),
		db: c.req.query("db"),
		op: c.req.query("op"),
		status: c.req.query("status"),
		from: c.req.query("from"),
		to: c.req.query("to"),
	});

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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

// ── GET /export ───────────────────────────────────────────────────
auditRoutes.get("/export", async (c) => {
	const db = c.get("db");
	const user = c.get("user");

	const conditions = buildFilters(user, {
		agent: c.req.query("agent"),
		db: c.req.query("db"),
		op: c.req.query("op"),
		status: c.req.query("status"),
		from: c.req.query("from"),
		to: c.req.query("to"),
	});

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const rows = await db
		.select()
		.from(auditLogs)
		.where(whereClause)
		.orderBy(desc(auditLogs.createdAt));

	// Escape CSV fields to prevent formula injection
	function csvEscape(value: string): string {
		const needsPrefix = /^[=+\-@\t\r]/.test(value);
		const safe = needsPrefix ? `'${value}` : value;
		return `"${safe.replace(/"/g, '""')}"`;
	}

	// Build CSV
	const headers = [
		"id",
		"agentId",
		"databaseId",
		"userId",
		"sqlQuery",
		"operationType",
		"status",
		"affectedRows",
		"denialReason",
		"reason",
		"executionTimeMs",
		"createdAt",
	];

	const csvLines = [headers.join(",")];
	for (const row of rows) {
		const values = [
			row.id,
			row.agentId,
			row.databaseId,
			row.userId,
			csvEscape(row.sqlQuery),
			row.operationType,
			row.status,
			row.affectedRows ?? "",
			row.denialReason ? csvEscape(row.denialReason) : "",
			row.reason ? csvEscape(row.reason) : "",
			row.executionTimeMs ?? "",
			row.createdAt?.toISOString() ?? "",
		];
		csvLines.push(values.join(","));
	}

	c.header("Content-Type", "text/csv");
	c.header("Content-Disposition", "attachment; filename=audit-logs.csv");
	return c.body(csvLines.join("\n"));
});

// ── GET /:id ──────────────────────────────────────────────────────
auditRoutes.get("/:id", async (c) => {
	const logId = c.req.param("id");
	const db = c.get("db");
	const user = c.get("user");

	const [log] = await db
		.select()
		.from(auditLogs)
		.where(eq(auditLogs.id, logId))
		.limit(1);

	if (!log) {
		throw Errors.notFound("Audit log not found");
	}

	// Scope check
	if (user.role === "user" && log.userId !== user.userId) {
		throw Errors.notFound("Audit log not found");
	}

	return c.json({ log });
});

// ── GET /:id/reviews ─────────────────────────────────────────────
auditRoutes.get("/:id/reviews", async (c) => {
	const logId = c.req.param("id");
	const db = c.get("db");
	const user = c.get("user");

	// Verify log exists and user has access
	const [log] = await db
		.select()
		.from(auditLogs)
		.where(eq(auditLogs.id, logId))
		.limit(1);

	if (!log) {
		throw Errors.notFound("Audit log not found");
	}

	if (user.role === "user" && log.userId !== user.userId) {
		throw Errors.notFound("Audit log not found");
	}

	const reviews = await db
		.select()
		.from(auditReviews)
		.where(eq(auditReviews.auditLogId, logId))
		.orderBy(desc(auditReviews.createdAt));

	return c.json({ reviews });
});

// ── POST /:id/reviews ────────────────────────────────────────────
const adminReviewSchema = z.object({
	flag_type: z.enum(["suspicious_pattern", "policy_violation", "data_anomaly", "performance_concern", "manual_review"]),
	severity: z.enum(["low", "medium", "high", "critical"]),
	notes: z.string().max(5000).optional(),
});

auditRoutes.post(
	"/:id/reviews",
	zValidator("json", adminReviewSchema),
	async (c) => {
		const logId = c.req.param("id");
		const db = c.get("db");
		const user = c.get("user");
		const body = c.req.valid("json");

		// Verify log exists and user has access
		const [log] = await db
			.select()
			.from(auditLogs)
			.where(eq(auditLogs.id, logId))
			.limit(1);

		if (!log) {
			throw Errors.notFound("Audit log not found");
		}

		if (user.role === "user" && log.userId !== user.userId) {
			throw Errors.notFound("Audit log not found");
		}

		const id = uuidv4();
		await db.insert(auditReviews).values({
			id,
			auditLogId: logId,
			flagType: body.flag_type,
			severity: body.severity,
			reviewerType: "human",
			reviewerId: user.userId,
			notes: body.notes ?? null,
		});

		return c.json(
			{
				review: {
					id,
					auditLogId: logId,
					flagType: body.flag_type,
					severity: body.severity,
				},
			},
			201,
		);
	},
);

export default auditRoutes;
