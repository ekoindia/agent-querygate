import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ParsedQuery } from "@/lib/types.js";
import { quoteIdent } from "@/lib/identifier.js";

/** Maximum number of rows to include in a before/after snapshot. */
const SNAPSHOT_ROW_LIMIT = 1000;

/**
 * Extracts the WHERE clause from a SQL string via regex.
 * Returns the clause text (without the leading WHERE keyword) or null.
 */
function extractWhereClause(sql: string): string | null {
	const match = sql.match(/\bWHERE\b\s+([\s\S]+?)(?:\bORDER\b|\bLIMIT\b|\bGROUP\b|\bHAVING\b|;|$)/i);
	return match?.[1]?.trim() ?? null;
}

/**
 * Builds the projection list for a snapshot SELECT. When the policy restricts
 * columns, only those columns are captured so restricted data (e.g. password,
 * ssn) never lands in the audit log. A null/empty allow-list falls back to "*".
 */
function buildProjection(allowedColumns?: string[] | null): string {
	if (!allowedColumns || allowedColumns.length === 0) {
		return "*";
	}
	return allowedColumns.map(quoteIdent).join(", ");
}

/**
 * Builds a SELECT query to snapshot the rows affected by a mutation query.
 * Returns null if the table name cannot be determined. When allowedColumns is
 * provided, the snapshot is scoped to those columns instead of all columns.
 */
export function buildSnapshotSelect(
	query: ParsedQuery,
	allowedColumns?: string[] | null,
): string | null {
	const table = query.tables[0];
	if (!table) {
		return null;
	}

	const projection = buildProjection(allowedColumns);
	const whereClause = extractWhereClause(query.originalSql);
	const whereFragment = whereClause ? `WHERE ${whereClause}` : "";

	return `SELECT ${projection} FROM ${quoteIdent(table)} ${whereFragment} LIMIT ${SNAPSHOT_ROW_LIMIT}`;
}

/**
 * Captures a snapshot of rows before a mutation query executes.
 * Returns an empty array for INSERT operations (no pre-existing rows to capture).
 */
export async function captureBeforeSnapshot(
	pool: Pool,
	query: ParsedQuery,
	allowedColumns?: string[] | null,
): Promise<Record<string, unknown>[]> {
	if (query.operation === "INSERT") {
		return [];
	}

	const snapshotSql = buildSnapshotSelect(query, allowedColumns);
	if (!snapshotSql) {
		return [];
	}

	const [rows] = await pool.query<RowDataPacket[]>(snapshotSql);
	return rows as Record<string, unknown>[];
}

/**
 * Captures a snapshot of rows after a mutation query executes.
 * Returns an empty array for DELETE operations (rows no longer exist).
 */
export async function captureAfterSnapshot(
	pool: Pool,
	query: ParsedQuery,
	allowedColumns?: string[] | null,
): Promise<Record<string, unknown>[]> {
	if (query.operation === "DELETE") {
		return [];
	}

	const snapshotSql = buildSnapshotSelect(query, allowedColumns);
	if (!snapshotSql) {
		return [];
	}

	const [rows] = await pool.query<RowDataPacket[]>(snapshotSql);
	return rows as Record<string, unknown>[];
}
