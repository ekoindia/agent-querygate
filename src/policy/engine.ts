import type { ParsedQuery, PolicyCheckResult } from "@/lib/types";

/** Represents a policy record governing access to a specific table. */
export interface PolicyRecord {
	id: string;
	tableName: string;
	allowedOperations: string[];
	allowedColumns: string[] | null;
	rowLimit: number | null;
	whereClauseRequired: boolean;
}

/** Operations that require a WHERE clause when whereClauseRequired is true. */
const WHERE_REQUIRED_OPERATIONS = new Set(["UPDATE", "DELETE"]);

/**
 * Builds a lookup map from table name to its PolicyRecord.
 */
function buildPolicyMap(policies: PolicyRecord[]): Map<string, PolicyRecord> {
	const map = new Map<string, PolicyRecord>();
	for (const policy of policies) {
		map.set(policy.tableName, policy);
	}
	return map;
}

/**
 * Evaluates a parsed query against a set of policy records.
 * Returns whether the query is allowed, and if not, the denial reason.
 */
export function evaluatePolicy(
	query: ParsedQuery,
	policies: PolicyRecord[],
): PolicyCheckResult {
	const policyMap = buildPolicyMap(policies);

	for (const table of query.tables) {
		const policy = policyMap.get(table);

		// No policy for table → DENY
		if (!policy) {
			return {
				allowed: false,
				denialReason: `No access policy for table '${table}'`,
			};
		}

		// Operation not in allowedOperations → DENY
		if (!policy.allowedOperations.includes(query.operation)) {
			return {
				allowed: false,
				denialReason: `Operation ${query.operation} not allowed on table '${table}'`,
			};
		}

		// Column check: only when allowedColumns is not null AND columns don't include "*"
		if (policy.allowedColumns !== null && !query.columns.includes("*")) {
			const allowedSet = new Set(policy.allowedColumns);
			const disallowed = query.columns.filter((col) => !allowedSet.has(col));
			if (disallowed.length > 0) {
				return {
					allowed: false,
					denialReason: `Column(s) not allowed on table '${table}': ${disallowed.join(", ")}`,
				};
			}
		}

		// WHERE clause required for UPDATE/DELETE → DENY if missing
		if (
			policy.whereClauseRequired &&
			!query.hasWhere &&
			WHERE_REQUIRED_OPERATIONS.has(query.operation)
		) {
			return {
				allowed: false,
				denialReason: `WHERE clause required for ${query.operation} on table '${table}'`,
			};
		}
	}

	// All checks passed — use first table's policy ID
	const firstPolicy = policyMap.get(query.tables[0]);
	return {
		allowed: true,
		policyId: firstPolicy?.id,
	};
}

/**
 * Returns the row limit from the policy for the first table in the query.
 * Returns null if no policy exists or no row limit is set.
 */
export function getPolicyRowLimit(
	query: ParsedQuery,
	policies: PolicyRecord[],
): number | null {
	const policyMap = buildPolicyMap(policies);
	const firstTable = query.tables[0];
	if (!firstTable) {
		return null;
	}
	const policy = policyMap.get(firstTable);
	return policy?.rowLimit ?? null;
}
