import mysql from "mysql2/promise";
import { decrypt } from "@/lib/crypto.js";

/** Configuration for a target (tenant) database connection. */
export interface TargetDbConfig {
	host: string;
	port: number;
	dbName: string;
	username: string;
	passwordEncrypted: string;
}

/** In-memory cache mapping databaseId to its mysql2 connection pool. */
const pools = new Map<string, mysql.Pool>();

/**
 * Returns a cached connection pool for the given database, or creates a new one.
 * Decrypts the stored password using the provided encryption key.
 */
export function getTargetPool(
	databaseId: string,
	config: TargetDbConfig,
	encryptionKey: string,
): mysql.Pool {
	const existing = pools.get(databaseId);
	if (existing) {
		return existing;
	}

	const password = decrypt(config.passwordEncrypted, encryptionKey);

	const pool = mysql.createPool({
		host: config.host,
		port: config.port,
		user: config.username,
		password,
		database: config.dbName,
		waitForConnections: true,
		connectionLimit: 5,
		queueLimit: 0,
	});

	pools.set(databaseId, pool);
	return pool;
}

/**
 * Tests connectivity to a target database by creating a single connection,
 * pinging the server, and immediately closing it.
 * Returns true on success, false on failure.
 */
export async function testConnection(
	config: TargetDbConfig,
	encryptionKey: string,
): Promise<boolean> {
	let connection: mysql.Connection | null = null;
	try {
		const password = decrypt(config.passwordEncrypted, encryptionKey);
		connection = await mysql.createConnection({
			host: config.host,
			port: config.port,
			user: config.username,
			password,
			database: config.dbName,
		});
		await connection.ping();
		return true;
	} catch {
		return false;
	} finally {
		if (connection) {
			await connection.end().catch(() => {});
		}
	}
}

/**
 * Ends the connection pool for a specific database and removes it from the cache.
 */
export async function removePool(databaseId: string): Promise<void> {
	const pool = pools.get(databaseId);
	if (pool) {
		await pool.end();
		pools.delete(databaseId);
	}
}

/**
 * Ends all cached connection pools and clears the pool cache.
 * Call during graceful shutdown.
 */
export async function closeAllPools(): Promise<void> {
	const endPromises = Array.from(pools.values()).map((pool) => pool.end());
	await Promise.all(endPromises);
	pools.clear();
}
