import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { RowDataPacket } from "mysql2/promise";
import { agentAuth } from "@/auth/middleware.js";
import { getTargetPool } from "@/query/pool-manager.js";
import { agentDatabaseAccess, policies } from "@/db/schema.js";
import { Errors } from "@/lib/errors.js";
import type { AppEnv, AuthenticatedAgent } from "@/lib/types.js";
import type { Config } from "@/config.js";
import { resolveDatabase } from "./query.js";

const tableRoutes = new Hono<AppEnv>();

/**
 * GET /tables
 * Returns the list of tables the agent has policy access to.
 */
tableRoutes.get("/tables", agentAuth, async (c) => {
	const agent = c.get("agent") as AuthenticatedAgent;
	const db = c.get("db");
	const databaseIdParam = c.req.query("database_id");

	// Resolve database
	const { databaseId } = await resolveDatabase(db, agent, databaseIdParam);

	// Lookup agent database access
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

	// Lookup policies for this access record
	const policyRows = await db
		.select({ tableName: policies.tableName })
		.from(policies)
		.where(eq(policies.agentDatabaseAccessId, access.id));

	const tables = policyRows.map((row) => row.tableName);

	return c.json({ tables });
});

/**
 * GET /tables/:name/schema
 * Returns the column schema for a specific table using DESCRIBE.
 */
tableRoutes.get("/tables/:name/schema", agentAuth, async (c) => {
	const agent = c.get("agent") as AuthenticatedAgent;
	const db = c.get("db");
	const config = c.get("config") as Config;
	const tableName = c.req.param("name");
	const databaseIdParam = c.req.query("database_id");

	// Resolve database
	const { databaseId, dbRecord } = await resolveDatabase(db, agent, databaseIdParam);

	// Lookup agent database access
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

	// Verify the agent has a policy for this table
	const [tablePolicy] = await db
		.select()
		.from(policies)
		.where(
			and(
				eq(policies.agentDatabaseAccessId, access.id),
				eq(policies.tableName, tableName),
			),
		)
		.limit(1);

	if (!tablePolicy) {
		throw Errors.forbidden(`No access policy for table '${tableName}'`);
	}

	// Get the target pool and run DESCRIBE
	const pool = getTargetPool(databaseId, {
		host: dbRecord.host,
		port: dbRecord.port,
		dbName: dbRecord.dbName,
		username: dbRecord.username,
		passwordEncrypted: dbRecord.passwordEncrypted,
	}, config.encryptionKey);

	const [rows] = await pool.query<RowDataPacket[]>(`DESCRIBE \`${tableName}\``);

	return c.json({ columns: rows });
});

export default tableRoutes;
