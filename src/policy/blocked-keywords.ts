/**
 * Checks SQL for blocked keywords that should never be executed.
 * Returns null if the query is safe, or a denial reason string.
 */
export function checkBlockedKeywords(sql: string): string | null {
	const trimmed = sql.trim();

	// DDL operations at start of statement
	const ddlMatch = trimmed.match(/^\s*(DROP|CREATE|ALTER|TRUNCATE)\b/i);
	if (ddlMatch) {
		return `DDL operation ${ddlMatch[1].toUpperCase()} is not allowed`;
	}

	// GRANT / REVOKE at start of statement
	if (/^\s*(GRANT|REVOKE)\b/i.test(trimmed)) {
		return "GRANT/REVOKE is not allowed";
	}

	// Multi-statement detection: semicolon followed by non-whitespace content
	if (/;\s*\S/.test(trimmed)) {
		return "Multi-statement queries are not allowed";
	}

	// LOAD DATA anywhere in the query
	if (/LOAD\s+DATA/i.test(trimmed)) {
		return "LOAD DATA is not allowed";
	}

	// INTO OUTFILE anywhere in the query
	if (/INTO\s+OUTFILE/i.test(trimmed)) {
		return "INTO OUTFILE is not allowed";
	}

	return null;
}
