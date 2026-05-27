/** Represents a parsed SQL query with extracted metadata. */
export interface ParsedQuery {
	operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
	tables: string[];
	columns: string[];
	hasWhere: boolean;
	originalSql: string;
}

/** Result of checking a query against agent policies. */
export interface PolicyCheckResult {
	allowed: boolean;
	policyId?: string;
	denialReason?: string;
}

/** Before/after data snapshots for mutation queries. */
export interface SnapshotResult {
	dataBefore: Record<string, unknown>[] | null;
	dataAfter: Record<string, unknown>[] | null;
	affectedRows: number;
}

/** Result of executing a query against a tenant database. */
export interface QueryResult {
	rows: Record<string, unknown>[];
	columns: string[];
	rowCount: number;
}

export type UserRole = "superadmin" | "admin" | "user";

/** Agent identity extracted from a valid agent API key. */
export interface AuthenticatedAgent {
	agentId: string;
	userId: string;
	agentName: string;
}

/** User identity extracted from a valid JWT. */
export interface AuthenticatedUser {
	userId: string;
	email: string;
	role: UserRole;
}

/** Hono environment type with context variable bindings used across routes. */
export interface AppEnv {
	Variables: {
		config: import("@/config.js").Config;
		db: import("@/db/connection.js").Database;
		user: AuthenticatedUser;
		agent: AuthenticatedAgent;
	};
}
