import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadConfig } from "@/config.js";
import { getDatabase } from "@/db/connection.js";
import { AppError } from "@/lib/errors.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Admin route imports
import authRoutes from "@/routes/admin/auth.js";
import userRoutes from "@/routes/admin/users.js";
import databaseRoutes from "@/routes/admin/databases.js";
import agentRoutes from "@/routes/admin/agents.js";
import policyRoutes from "@/routes/admin/policies.js";
import auditRoutes from "@/routes/admin/audit.js";
import dashboardRoutes from "@/routes/admin/dashboard.js";

// Agent route imports
import agentQueryRoutes from "@/routes/agent/query.js";
import agentExecuteRoutes from "@/routes/agent/execute.js";
import agentTableRoutes from "@/routes/agent/tables.js";
import agentHealthRoutes from "@/routes/agent/health.js";
import auditorAgentRoutes from "@/routes/agent/audit.js";

const config = loadConfig();
const db = getDatabase(config);

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("/api/*", cors());
app.use("/admin/api/*", cors());

// Inject config and db into context for all routes
app.use("*", async (c, next) => {
	c.set("config" as never, config as never);
	c.set("db" as never, db as never);
	await next();
});

// Global error handler
app.onError((err, c) => {
	if (err instanceof AppError) {
		return c.json(
			{ error: err.message, code: err.code, ...err.details },
			err.statusCode as ContentfulStatusCode,
		);
	}
	console.error("Unhandled error:", err);
	return c.json({ error: "Internal server error" }, 500);
});

// Admin routes
app.route("/admin/api/auth", authRoutes);
app.route("/admin/api/users", userRoutes);
app.route("/admin/api/databases", databaseRoutes);
app.route("/admin/api/agents", agentRoutes);
app.route("/admin/api", policyRoutes);
app.route("/admin/api/audit", auditRoutes);
app.route("/admin/api/dashboard", dashboardRoutes);

// Agent routes
app.route("/api/v1", agentQueryRoutes);
app.route("/api/v1", agentExecuteRoutes);
app.route("/api/v1", agentTableRoutes);
app.route("/api/v1", agentHealthRoutes);
app.route("/api/v1", auditorAgentRoutes);

// Serve frontend SPA (static files)
app.use("/*", serveStatic({ root: "./frontend/dist" }));
app.get("/*", serveStatic({ path: "./frontend/dist/index.html" }));

const port = config.port;
console.log(`Server starting on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
export { config, db };
