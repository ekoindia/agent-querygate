import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { databases } from "@/db/schema.js";
import { adminAuth } from "@/auth/middleware.js";
import { encrypt, decrypt } from "@/lib/crypto.js";
import { quoteIdent } from "@/lib/identifier.js";
import { Errors } from "@/lib/errors.js";
import { testConnection, removePool } from "@/query/pool-manager.js";
import type { AppEnv, AuthenticatedUser } from "@/lib/types.js";

const databaseRoutes = new Hono<AppEnv>();

databaseRoutes.use("*", adminAuth);

/**
 * Returns a scoping filter: regular users see only their own databases,
 * admin/superadmin see all.
 */
function scopeFilter(user: AuthenticatedUser) {
	if (user.role === "admin" || user.role === "superadmin") {
		return undefined;
	}
	return eq(databases.userId, user.userId);
}

// ── GET / ─────────────────────────────────────────────────────────
databaseRoutes.get("/", async (c) => {
	const db = c.get("db");
	const user = c.get("user");

	const filter = scopeFilter(user);

	const rows = await db
		.select({
			id: databases.id,
			userId: databases.userId,
			name: databases.name,
			host: databases.host,
			port: databases.port,
			dbName: databases.dbName,
			username: databases.username,
			createdAt: databases.createdAt,
			updatedAt: databases.updatedAt,
		})
		.from(databases)
		.where(filter);

	return c.json({ databases: rows });
});

// ── POST / ────────────────────────────────────────────────────────
const createDbSchema = z.object({
	name: z.string().min(1),
	host: z.string().min(1),
	port: z.number().int().positive().default(3306),
	dbName: z.string().min(1),
	username: z.string().min(1),
	password: z.string().min(1),
});

databaseRoutes.post("/", zValidator("json", createDbSchema), async (c) => {
	const body = c.req.valid("json");
	const db = c.get("db");
	const config = c.get("config");
	const user = c.get("user");

	const id = uuidv4();
	const passwordEncrypted = encrypt(body.password, config.encryptionKey);

	await db.insert(databases).values({
		id,
		userId: user.userId,
		name: body.name,
		host: body.host,
		port: body.port,
		dbName: body.dbName,
		username: body.username,
		passwordEncrypted,
	});

	return c.json(
		{
			database: {
				id,
				name: body.name,
				host: body.host,
				port: body.port,
				dbName: body.dbName,
				username: body.username,
			},
		},
		201,
	);
});

// ── PUT /:id ──────────────────────────────────────────────────────
const updateDbSchema = z.object({
	name: z.string().min(1).optional(),
	host: z.string().min(1).optional(),
	port: z.number().int().positive().optional(),
	dbName: z.string().min(1).optional(),
	username: z.string().min(1).optional(),
	password: z.string().min(1).optional(),
});

databaseRoutes.put("/:id", zValidator("json", updateDbSchema), async (c) => {
	const dbId = c.req.param("id");
	const body = c.req.valid("json");
	const db = c.get("db");
	const config = c.get("config");
	const user = c.get("user");

	const [record] = await db
		.select()
		.from(databases)
		.where(eq(databases.id, dbId))
		.limit(1);

	if (!record) {
		throw Errors.notFound("Database not found");
	}

	// Scope check for regular users
	if (user.role === "user" && record.userId !== user.userId) {
		throw Errors.notFound("Database not found");
	}

	const updates: Record<string, unknown> = {};
	if (body.name !== undefined) updates.name = body.name;
	if (body.host !== undefined) updates.host = body.host;
	if (body.port !== undefined) updates.port = body.port;
	if (body.dbName !== undefined) updates.dbName = body.dbName;
	if (body.username !== undefined) updates.username = body.username;
	if (body.password !== undefined) {
		updates.passwordEncrypted = encrypt(body.password, config.encryptionKey);
	}

	if (Object.keys(updates).length > 0) {
		await db.update(databases).set(updates).where(eq(databases.id, dbId));
		await removePool(dbId);
	}

	return c.json({ ok: true });
});

// ── DELETE /:id ───────────────────────────────────────────────────
databaseRoutes.delete("/:id", async (c) => {
	const dbId = c.req.param("id");
	const db = c.get("db");
	const user = c.get("user");

	const [record] = await db
		.select()
		.from(databases)
		.where(eq(databases.id, dbId))
		.limit(1);

	if (!record) {
		throw Errors.notFound("Database not found");
	}

	if (user.role === "user" && record.userId !== user.userId) {
		throw Errors.notFound("Database not found");
	}

	await db.delete(databases).where(eq(databases.id, dbId));
	await removePool(dbId);

	return c.json({ ok: true });
});

// ── POST /:id/test-connection ─────────────────────────────────────
databaseRoutes.post("/:id/test-connection", async (c) => {
	const dbId = c.req.param("id");
	const db = c.get("db");
	const config = c.get("config");
	const user = c.get("user");

	const [record] = await db
		.select()
		.from(databases)
		.where(eq(databases.id, dbId))
		.limit(1);

	if (!record) {
		throw Errors.notFound("Database not found");
	}

	if (user.role === "user" && record.userId !== user.userId) {
		throw Errors.notFound("Database not found");
	}

	const success = await testConnection(
		{
			host: record.host,
			port: record.port,
			dbName: record.dbName,
			username: record.username,
			passwordEncrypted: record.passwordEncrypted,
		},
		config.encryptionKey,
	);

	return c.json({ success });
});

// ── GET /:id/introspect ───────────────────────────────────────────
databaseRoutes.get("/:id/introspect", async (c) => {
	const dbId = c.req.param("id");
	const db = c.get("db");
	const config = c.get("config");
	const user = c.get("user");

	const [record] = await db
		.select()
		.from(databases)
		.where(eq(databases.id, dbId))
		.limit(1);

	if (!record) {
		throw Errors.notFound("Database not found");
	}

	if (user.role === "user" && record.userId !== user.userId) {
		throw Errors.notFound("Database not found");
	}

	const password = decrypt(record.passwordEncrypted, config.encryptionKey);
	let connection: mysql.Connection | null = null;

	try {
		connection = await mysql.createConnection({
			host: record.host,
			port: record.port,
			user: record.username,
			password,
			database: record.dbName,
		});

		const [tableRows] = await connection.query("SHOW TABLES");
		const tables = (tableRows as Record<string, string>[]).map(
			(row) => Object.values(row)[0],
		);

		const schema: Record<string, unknown[]> = {};
		for (const table of tables) {
			const [columns] = await connection.query(`DESCRIBE ${quoteIdent(table)}`);
			schema[table] = columns as unknown[];
		}

		return c.json({ schema });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Connection failed";
		throw Errors.badRequest(`Introspection failed: ${message}`);
	} finally {
		if (connection) {
			await connection.end().catch(() => {});
		}
	}
});

export default databaseRoutes;
