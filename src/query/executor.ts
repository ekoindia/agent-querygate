import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { ParsedQuery, QueryResult, SnapshotResult } from "@/lib/types.js";
import type { ColumnValidationRules } from "@/policy/value-validation.js";
import { validateValuePostExec } from "@/policy/value-validation.js";
import { Errors } from "@/lib/errors.js";
import { captureBeforeSnapshot, captureAfterSnapshot } from "./snapshot.js";

export interface WriteQueryOptions {
	columnValidationRules?: ColumnValidationRules;
}

/**
 * Executes a read-only (SELECT) query against the target database.
 * Returns the result rows, column names, and row count.
 */
export async function executeReadQuery(
	pool: Pool,
	query: ParsedQuery,
): Promise<QueryResult> {
	const [rows, fields] = await pool.query<RowDataPacket[]>(query.originalSql);
	const columns = fields.map((field) => field.name);

	return {
		rows: rows as Record<string, unknown>[],
		columns,
		rowCount: rows.length,
	};
}

/**
 * Executes a write (INSERT/UPDATE/DELETE) query inside a transaction,
 * capturing before and after snapshots for audit purposes.
 * Rolls back on any error.
 */
export async function executeWriteQuery(
	pool: Pool,
	query: ParsedQuery,
	options?: WriteQueryOptions,
): Promise<SnapshotResult> {
	const connection = await pool.getConnection();

	try {
		await connection.beginTransaction();

		const dataBefore = await captureBeforeSnapshot(pool, query);

		const [result] = await connection.query<ResultSetHeader>(query.originalSql);
		const affectedRows = result.affectedRows;

		const dataAfter = await captureAfterSnapshot(pool, query);

		if (options?.columnValidationRules && dataAfter.length > 0) {
			const postResult = validateValuePostExec(
				dataAfter,
				options.columnValidationRules,
			);
			if (!postResult.valid) {
				await connection.rollback();
				const first = postResult.violations[0]!;
				throw Errors.valueValidationFailed(
					`Post-execution validation failed for column '${first.column}': ${first.message}`,
					{
						violations: postResult.violations,
					},
				);
			}
		}

		await connection.commit();

		return {
			dataBefore: dataBefore.length > 0 ? dataBefore : null,
			dataAfter: dataAfter.length > 0 ? dataAfter : null,
			affectedRows,
		};
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

/**
 * Counts the number of rows that would be affected by a mutation query
 * by building a SELECT COUNT(*) with the same WHERE clause.
 */
export async function countAffectedRows(
	pool: Pool,
	query: ParsedQuery,
): Promise<number> {
	const table = query.tables[0];
	if (!table) {
		return 0;
	}

	const whereMatch = query.originalSql.match(
		/\bWHERE\b\s+([\s\S]+?)(?:\bORDER\b|\bLIMIT\b|\bGROUP\b|\bHAVING\b|;|$)/i,
	);
	const whereFragment = whereMatch ? `WHERE ${whereMatch[1].trim()}` : "";

	const countSql = `SELECT COUNT(*) AS cnt FROM \`${table}\` ${whereFragment}`;
	const [rows] = await pool.query<RowDataPacket[]>(countSql);
	const firstRow = rows[0] as { cnt: number } | undefined;

	return firstRow?.cnt ?? 0;
}
