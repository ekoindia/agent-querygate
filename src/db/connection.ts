import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import type { Config } from "@/config.js";
import * as schema from "./schema.js";

export type Database = MySql2Database<typeof schema>;

let dbInstance: Database | null = null;
let pool: mysql.Pool | null = null;

/**
 * Returns a singleton Drizzle ORM instance backed by a mysql2 connection pool.
 * Creates the pool on first call; subsequent calls return the cached instance.
 */
export function getDatabase(config: Config): Database {
	if (dbInstance) {
		return dbInstance;
	}

	pool = mysql.createPool({
		host: config.adminDb.host,
		port: config.adminDb.port,
		user: config.adminDb.user,
		password: config.adminDb.password,
		database: config.adminDb.name,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0,
	});

	dbInstance = drizzle({ client: pool, schema, mode: "default" });
	return dbInstance;
}

/**
 * Closes the underlying mysql2 connection pool and resets the singleton.
 * Useful for graceful shutdown and test teardown.
 */
export async function closeDatabase(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
		dbInstance = null;
	}
}
