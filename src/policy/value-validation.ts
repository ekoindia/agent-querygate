import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────────

export type EnumRule = {
	type: "enum";
	values: (string | number | boolean | null)[];
};
export type PatternRule = { type: "pattern"; regex: string; flags?: string };
export type MinRule = { type: "min"; value: number };
export type MaxRule = { type: "max"; value: number };
export type NotNullRule = { type: "notNull" };

export type ValidationRule =
	| EnumRule
	| PatternRule
	| MinRule
	| MaxRule
	| NotNullRule;

export type ColumnValidationRules = Record<string, ValidationRule[]>;

export interface CustomRules {
	columnValidation?: ColumnValidationRules;
}

export type ExtractedValueKind = "literal" | "unvalidatable";

export interface ExtractedValue {
	column: string;
	kind: ExtractedValueKind;
	value?: string | number | boolean | null;
	rawType?: string;
}

export interface ValueViolation {
	column: string;
	value: unknown;
	rule: string;
	constraint: Record<string, unknown>;
	message: string;
}

export interface UnvalidatableColumn {
	column: string;
	expression: string;
}

export interface ValueValidationResult {
	valid: boolean;
	violations: ValueViolation[];
	unvalidatable: UnvalidatableColumn[];
}

export interface PostExecValidationResult {
	valid: boolean;
	violations: ValueViolation[];
}

// ── AST Value Extraction ──────────────────────────────────────────

const LITERAL_AST_TYPES = new Set([
	"number",
	"string",
	"single_quote_string",
	"double_quote_string",
	"bool",
	"boolean",
	"null",
]);

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AstValueNode {
	type: string;
	value: any;
}

interface AstSetItem {
	column: string;
	value: AstValueNode;
	table: string | null;
}

interface AstExprList {
	type: string;
	value: AstValueNode[];
}

interface AstValues {
	type: string;
	values: AstExprList[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function classifyAstValue(
	column: string,
	node: AstValueNode,
): ExtractedValue {
	if (node && LITERAL_AST_TYPES.has(node.type)) {
		return {
			column,
			kind: "literal",
			value: node.value as string | number | boolean | null,
			rawType: node.type,
		};
	}
	return {
		column,
		kind: "unvalidatable",
		rawType: node?.type ?? "unknown",
	};
}

export function extractValuesFromAst(
	ast: Record<string, unknown>,
	operation: "INSERT" | "UPDATE",
): ExtractedValue[] {
	const results: ExtractedValue[] = [];

	if (operation === "UPDATE") {
		const setItems = (ast.set as AstSetItem[] | null) ?? [];
		for (const item of setItems) {
			results.push(classifyAstValue(item.column, item.value));
		}

		const onDup = ast.on_duplicate_update as
			| { set: AstSetItem[] }
			| null
			| undefined;
		if (onDup?.set) {
			for (const item of onDup.set) {
				results.push(classifyAstValue(item.column, item.value));
			}
		}
	}

	if (operation === "INSERT") {
		const columns = (ast.columns as string[] | null) ?? [];
		const valuesNode = ast.values as AstValues | { type: string } | null;

		if (!valuesNode || valuesNode.type !== "values") {
			for (const col of columns) {
				results.push({
					column: col,
					kind: "unvalidatable",
					rawType: valuesNode?.type ?? "unknown",
				});
			}
			return results;
		}

		const rows = (valuesNode as AstValues).values ?? [];
		for (const row of rows) {
			const valueNodes = row.value ?? [];
			for (let i = 0; i < valueNodes.length; i++) {
				const column = columns[i] ?? `column_${i}`;
				results.push(classifyAstValue(column, valueNodes[i]));
			}
		}
	}

	return results;
}

// ── Pre-Execution Validation ──────────────────────────────────────

function buildViolation(
	column: string,
	value: unknown,
	rule: ValidationRule,
	message: string,
): ValueViolation {
	const constraint: Record<string, unknown> = {};
	switch (rule.type) {
		case "enum":
			constraint.values = rule.values;
			break;
		case "pattern":
			constraint.pattern = rule.regex;
			if (rule.flags) constraint.flags = rule.flags;
			break;
		case "min":
			constraint.min = rule.value;
			break;
		case "max":
			constraint.max = rule.value;
			break;
		case "notNull":
			constraint.notNull = true;
			break;
	}
	return { column, value, rule: rule.type, constraint, message };
}

function checkRule(
	value: string | number | boolean | null | undefined,
	rule: ValidationRule,
): string | null {
	switch (rule.type) {
		case "enum": {
			const match = rule.values.some((allowed) =>
				allowed === value ||
				(typeof allowed === "string" && String(value) === allowed),
			);
			if (!match) {
				return `value ${JSON.stringify(value)} not in allowed values: ${rule.values.map((v) => JSON.stringify(v)).join(", ")}`;
			}
			return null;
		}
		case "pattern": {
			if (value === null || value === undefined) return null;
			try {
				const re = new RegExp(rule.regex, rule.flags);
				if (!re.test(String(value))) {
					return `value ${JSON.stringify(value)} does not match pattern: ${rule.regex}`;
				}
			} catch {
				return null;
			}
			return null;
		}
		case "min": {
			if (value === null || value === undefined) return null;
			const num = typeof value === "number" ? value : Number(value);
			if (Number.isNaN(num)) return null;
			if (num < rule.value) {
				return `value ${num} is below minimum ${rule.value}`;
			}
			return null;
		}
		case "max": {
			if (value === null || value === undefined) return null;
			const num = typeof value === "number" ? value : Number(value);
			if (Number.isNaN(num)) return null;
			if (num > rule.value) {
				return `value ${num} exceeds maximum ${rule.value}`;
			}
			return null;
		}
		case "notNull": {
			if (value === null || value === undefined) {
				return "value must not be null";
			}
			return null;
		}
	}
}

export function validateValuePreExec(
	extractedValues: ExtractedValue[],
	rules: ColumnValidationRules,
): ValueValidationResult {
	const violations: ValueViolation[] = [];
	const unvalidatable: UnvalidatableColumn[] = [];

	for (const ev of extractedValues) {
		const columnRules = rules[ev.column];
		if (!columnRules || columnRules.length === 0) continue;

		if (ev.kind === "unvalidatable") {
			unvalidatable.push({
				column: ev.column,
				expression: ev.rawType ?? "unknown",
			});
			continue;
		}

		for (const rule of columnRules) {
			const error = checkRule(ev.value, rule);
			if (error) {
				violations.push(buildViolation(ev.column, ev.value, rule, error));
			}
		}
	}

	return { valid: violations.length === 0, violations, unvalidatable };
}

// ── Post-Execution Validation ─────────────────────────────────────

export function validateValuePostExec(
	dataAfter: Record<string, unknown>[],
	rules: ColumnValidationRules,
): PostExecValidationResult {
	const violations: ValueViolation[] = [];

	for (const row of dataAfter) {
		for (const [column, columnRules] of Object.entries(rules)) {
			if (!(column in row)) continue;

			const rawValue = row[column];
			const value =
				rawValue === null || rawValue === undefined
					? null
					: typeof rawValue === "string" ||
							typeof rawValue === "number" ||
							typeof rawValue === "boolean"
						? rawValue
						: String(rawValue);

			for (const rule of columnRules) {
				const error = checkRule(value, rule);
				if (error) {
					violations.push(buildViolation(column, rawValue, rule, error));
				}
			}
		}
	}

	return { valid: violations.length === 0, violations };
}

// ── Runtime Parser ────────────────────────────────────────────────

export function parseCustomRules(
	raw: CustomRules | Record<string, unknown> | null | undefined,
): CustomRules {
	if (!raw || typeof raw !== "object") return {};

	const result: CustomRules = {};

	if (
		"columnValidation" in raw &&
		raw.columnValidation &&
		typeof raw.columnValidation === "object"
	) {
		result.columnValidation = raw.columnValidation as ColumnValidationRules;
	}

	return result;
}

// ── Zod Schema ────────────────────────────────────────────────────

const MAX_REGEX_LENGTH = 200;

const validationRuleSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("enum"),
		values: z
			.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
			.min(1),
	}),
	z.object({
		type: z.literal("pattern"),
		regex: z.string().min(1).max(MAX_REGEX_LENGTH),
		flags: z.string().max(10).optional(),
	}),
	z.object({ type: z.literal("min"), value: z.number() }),
	z.object({ type: z.literal("max"), value: z.number() }),
	z.object({ type: z.literal("notNull") }),
]);

export const columnValidationSchema = z
	.record(z.string(), z.array(validationRuleSchema).min(1))
	.optional();

export const customRulesSchema = z
	.object({
		columnValidation: columnValidationSchema,
	})
	.passthrough()
	.default({});
