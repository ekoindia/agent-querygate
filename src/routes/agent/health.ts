import { Hono } from "hono";
import { agentAuth } from "@/auth/middleware.js";
import type { AppEnv, AuthenticatedAgent } from "@/lib/types.js";

const healthRoutes = new Hono<AppEnv>();

/**
 * GET /health
 * Returns basic health status for the authenticated agent.
 */
healthRoutes.get("/health", agentAuth, async (c) => {
	const agent = c.get("agent") as AuthenticatedAgent;

	return c.json({
		status: "ok",
		agent: agent.agentName,
	});
});

export default healthRoutes;
