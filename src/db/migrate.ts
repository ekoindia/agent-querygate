import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { loadConfig } from "../config.js";

/**
 * Runs all pending Drizzle migrations against the admin database.
 * Uses a single client connection (recommended for DDL migrations).
 */
async function main(): Promise<void> {
	const config = loadConfig();

	const connection = await mysql.createConnection({
		host: config.adminDb.host,
		port: config.adminDb.port,
		user: config.adminDb.user,
		password: config.adminDb.password,
		database: config.adminDb.name,
	});

	const db = drizzle({ client: connection });

	console.log("Running migrations...");
	await migrate(db, { migrationsFolder: "./drizzle/migrations" });
	console.log("Migrations complete.");

	await connection.end();
	process.exit(0);
}

main().catch((error: unknown) => {
	console.error("Migration failed:", error);
	process.exit(1);
});
