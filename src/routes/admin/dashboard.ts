import { Hono } from "hono";
import { eq, and, gte, count } from "drizzle-orm";
import { auditLogs, agents, databases } from "@/db/schema.js";
import { adminAuth } from "@/auth/middleware.js";
import type { AppEnv } from "@/lib/types.js";
import type { SQL } from "drizzle-orm";

const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.use("*", adminAuth);

// ── GET /stats ────────────────────────────────────────────────────
dashboardRoutes.get("/stats", async (c) => {
	const db = c.get("db");
	const user = c.get("user");

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	// Build scoped conditions for audit logs
	const queryConditions: SQL[] = [gte(auditLogs.createdAt, todayStart)];
	const deniedConditions: SQL[] = [
		gte(auditLogs.createdAt, todayStart),
		eq(auditLogs.status, "denied"),
	];

	if (user.role === "user") {
		queryConditions.push(eq(auditLogs.userId, user.userId));
		deniedConditions.push(eq(auditLogs.userId, user.userId));
	}

	// Queries today
	const [queriesTodayResult] = await db
		.select({ total: count() })
		.from(auditLogs)
		.where(and(...queryConditions));

	// Denied today
	const [deniedTodayResult] = await db
		.select({ total: count() })
		.from(auditLogs)
		.where(and(...deniedConditions));

	// Active agents (scoped)
	const agentFilter =
		user.role === "user"
			? and(eq(agents.isActive, true), eq(agents.userId, user.userId))
			: eq(agents.isActive, true);

	const [activeAgentsResult] = await db
		.select({ total: count() })
		.from(agents)
		.where(agentFilter);

	// Total databases (scoped)
	const dbFilter =
		user.role === "user" ? eq(databases.userId, user.userId) : undefined;

	const [totalDatabasesResult] = await db
		.select({ total: count() })
		.from(databases)
		.where(dbFilter);

	return c.json({
		stats: {
			queriesToday: queriesTodayResult.total,
			deniedToday: deniedTodayResult.total,
			activeAgents: activeAgentsResult.total,
			totalDatabases: totalDatabasesResult.total,
		},
	});
});

export default dashboardRoutes;
