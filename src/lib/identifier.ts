/**
 * Quotes a MySQL identifier (table or column name) by wrapping it in backticks
 * and doubling any embedded backticks, preventing identifier-injection when the
 * value must be interpolated into SQL that cannot use a bound parameter.
 */
export function quoteIdent(name: string): string {
	return `\`${name.replace(/`/g, "``")}\``;
}
