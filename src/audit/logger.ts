import { v4 as uuidv4 } from "uuid";
import type { ParsedQuery, PolicyCheckResult, SnapshotResult } from "@/lib/types.js";
import { auditLogs } from "@/db/schema.js";
import type { Database } from "@/db/connection.js";

/** Input for creating an audit log entry. */
export interface AuditEntry {
	agentId: string;
	databaseId: string;
	userId: string;
	query: ParsedQuery;
	policyResult: PolicyCheckResult;
	snapshot?: SnapshotResult;
	executionTimeMs?: number;
	error?: string;
}

/**
 * Determines the audit status from the entry fields.
 */
function resolveStatus(entry: AuditEntry): "allowed" | "denied" | "error" {
	if (entry.error) {
		return "error";
	}
	return entry.policyResult.allowed ? "allowed" : "denied";
}

/**
 * Writes an audit log record to the admin database.
 * Returns the generated UUID for the new log entry.
 */
export async function writeAuditLog(
	db: Database,
	entry: AuditEntry,
): Promise<string> {
	const id = uuidv4();
	const status = resolveStatus(entry);

	await db.insert(auditLogs).values({
		id,
		agentId: entry.agentId,
		databaseId: entry.databaseId,
		userId: entry.userId,
		sqlQuery: entry.query.originalSql,
		operationType: entry.query.operation,
		status,
		affectedRows: entry.snapshot?.affectedRows ?? null,
		dataBefore: entry.snapshot?.dataBefore ?? null,
		dataAfter: entry.snapshot?.dataAfter ?? null,
		policyId: entry.policyResult.policyId ?? null,
		denialReason: entry.policyResult.denialReason ?? entry.error ?? null,
		executionTimeMs: entry.executionTimeMs ?? null,
	});

	return id;
}
