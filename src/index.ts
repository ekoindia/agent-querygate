import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadConfig } from "@/config.js";
import { getDatabase } from "@/db/connection.js";
import { AppError } from "@/lib/errors.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
		return c.json({ error: err.message, code: err.code }, err.statusCode as ContentfulStatusCode);
	}
	console.error("Unhandled error:", err);
	return c.json({ error: "Internal server error" }, 500);
});

// Route mounting placeholders (will be wired in Task 16):
// app.route("/admin/api/auth", adminAuthRoutes);
// app.route("/admin/api/users", adminUserRoutes);
// etc.

// Serve frontend SPA (static files)
app.use("/*", serveStatic({ root: "./frontend/dist" }));
app.get("/*", serveStatic({ path: "./frontend/dist/index.html" }));

const port = config.port;
console.log(`Server starting on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
export { config, db };
