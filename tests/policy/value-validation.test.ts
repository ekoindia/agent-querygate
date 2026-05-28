import {
	extractValuesFromAst,
	validateValuePreExec,
	validateValuePostExec,
	parseCustomRules,
	columnValidationSchema,
} from "@/policy/value-validation";
import type {
	ColumnValidationRules,
	ExtractedValue,
	CustomRules,
} from "@/policy/value-validation";
import { Parser } from "node-sql-parser";

const parser = new Parser();

function getAst(sql: string): Record<string, unknown> {
	return parser.astify(sql, { database: "MySQL" }) as unknown as Record<
		string,
		unknown
	>;
}

// ── extractValuesFromAst ──────────────────────────────────────────

describe("extractValuesFromAst", () => {
	describe("UPDATE", () => {
		it("extracts literal string, number, and null values", () => {
			const ast = getAst(
				"UPDATE users SET status = 'active', age = 25, email = NULL WHERE id = 1",
			);
			const values = extractValuesFromAst(ast, "UPDATE");

			expect(values).toHaveLength(3);
			expect(values[0]).toMatchObject({
				column: "status",
				kind: "literal",
				value: "active",
			});
			expect(values[1]).toMatchObject({
				column: "age",
				kind: "literal",
				value: 25,
			});
			expect(values[2]).toMatchObject({
				column: "email",
				kind: "literal",
				value: null,
			});
		});

		it("extracts boolean values", () => {
			const ast = getAst("UPDATE users SET active = true WHERE id = 1");
			const values = extractValuesFromAst(ast, "UPDATE");

			expect(values).toHaveLength(1);
			expect(values[0]).toMatchObject({
				column: "active",
				kind: "literal",
				value: true,
			});
		});

		it("marks expressions as unvalidatable", () => {
			const ast = getAst(
				"UPDATE products SET price = price * 1.1, updated_at = NOW() WHERE id = 1",
			);
			const values = extractValuesFromAst(ast, "UPDATE");

			expect(values).toHaveLength(2);
			expect(values[0]).toMatchObject({
				column: "price",
				kind: "unvalidatable",
				rawType: "binary_expr",
			});
			expect(values[1]).toMatchObject({
				column: "updated_at",
				kind: "unvalidatable",
				rawType: "function",
			});
		});

		it("extracts ON DUPLICATE KEY UPDATE values", () => {
			const ast = getAst(
				"INSERT INTO users (name, age) VALUES ('John', 30) ON DUPLICATE KEY UPDATE age = 31",
			);
			const values = extractValuesFromAst(ast, "UPDATE");

			const onDupValues = values.filter((v) => v.column === "age");
			expect(onDupValues.length).toBeGreaterThanOrEqual(1);
			expect(onDupValues.some((v) => v.value === 31)).toBe(true);
		});
	});

	describe("INSERT", () => {
		it("extracts literal values from single-row INSERT", () => {
			const ast = getAst(
				"INSERT INTO users (name, age, status) VALUES ('John', 30, 'active')",
			);
			const values = extractValuesFromAst(ast, "INSERT");

			expect(values).toHaveLength(3);
			expect(values[0]).toMatchObject({
				column: "name",
				kind: "literal",
				value: "John",
			});
			expect(values[1]).toMatchObject({
				column: "age",
				kind: "literal",
				value: 30,
			});
			expect(values[2]).toMatchObject({
				column: "status",
				kind: "literal",
				value: "active",
			});
		});

		it("extracts values from multi-row INSERT", () => {
			const ast = getAst(
				"INSERT INTO users (name, age) VALUES ('John', 30), ('Jane', 25)",
			);
			const values = extractValuesFromAst(ast, "INSERT");

			expect(values).toHaveLength(4);
			expect(values[0]).toMatchObject({ column: "name", value: "John" });
			expect(values[1]).toMatchObject({ column: "age", value: 30 });
			expect(values[2]).toMatchObject({ column: "name", value: "Jane" });
			expect(values[3]).toMatchObject({ column: "age", value: 25 });
		});

		it("marks INSERT ... SELECT values as unvalidatable", () => {
			const ast = getAst(
				"INSERT INTO users (name) SELECT name FROM temp_users",
			);
			const values = extractValuesFromAst(ast, "INSERT");

			expect(values).toHaveLength(1);
			expect(values[0]).toMatchObject({
				column: "name",
				kind: "unvalidatable",
			});
		});
	});
});

// ── validateValuePreExec ──────────────────────────────────────────

describe("validateValuePreExec", () => {
	describe("enum rule", () => {
		const rules: ColumnValidationRules = {
			status: [{ type: "enum", values: ["active", "inactive", "suspended"] }],
		};

		it("passes when value is in allowed list", () => {
			const values: ExtractedValue[] = [
				{ column: "status", kind: "literal", value: "active" },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(true);
			expect(result.violations).toHaveLength(0);
		});

		it("fails when value is not in allowed list", () => {
			const values: ExtractedValue[] = [
				{ column: "status", kind: "literal", value: "superadmin" },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(false);
			expect(result.violations).toHaveLength(1);
			expect(result.violations[0].column).toBe("status");
			expect(result.violations[0].rule).toBe("enum");
			expect(result.violations[0].constraint).toEqual({
				values: ["active", "inactive", "suspended"],
			});
		});

		it("supports null in enum values", () => {
			const rulesWithNull: ColumnValidationRules = {
				status: [{ type: "enum", values: ["active", null] }],
			};
			const values: ExtractedValue[] = [
				{ column: "status", kind: "literal", value: null },
			];
			const result = validateValuePreExec(values, rulesWithNull);
			expect(result.valid).toBe(true);
		});
	});

	describe("pattern rule", () => {
		const rules: ColumnValidationRules = {
			email: [{ type: "pattern", regex: "^[^@]+@[^@]+\\.[^@]+$" }],
		};

		it("passes when value matches pattern", () => {
			const values: ExtractedValue[] = [
				{ column: "email", kind: "literal", value: "user@example.com" },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(true);
		});

		it("fails when value does not match pattern", () => {
			const values: ExtractedValue[] = [
				{ column: "email", kind: "literal", value: "not-an-email" },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(false);
			expect(result.violations[0].rule).toBe("pattern");
			expect(result.violations[0].constraint).toMatchObject({
				pattern: "^[^@]+@[^@]+\\.[^@]+$",
			});
		});

		it("skips null values for pattern check", () => {
			const values: ExtractedValue[] = [
				{ column: "email", kind: "literal", value: null },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(true);
		});

		it("fails closed when the pattern regex is uncompilable", () => {
			const badRules: ColumnValidationRules = {
				email: [{ type: "pattern", regex: "[" }],
			};
			const values: ExtractedValue[] = [
				{ column: "email", kind: "literal", value: "anything" },
			];
			const result = validateValuePreExec(values, badRules);
			expect(result.valid).toBe(false);
			expect(result.violations[0].rule).toBe("pattern");
		});
	});

	describe("min/max rules", () => {
		const rules: ColumnValidationRules = {
			age: [
				{ type: "min", value: 0 },
				{ type: "max", value: 150 },
			],
		};

		it("passes when value is within range", () => {
			const values: ExtractedValue[] = [
				{ column: "age", kind: "literal", value: 25 },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(true);
		});

		it("fails when value is below minimum", () => {
			const values: ExtractedValue[] = [
				{ column: "age", kind: "literal", value: -1 },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(false);
			expect(result.violations[0].rule).toBe("min");
			expect(result.violations[0].constraint).toEqual({ min: 0 });
		});

		it("fails when value exceeds maximum", () => {
			const values: ExtractedValue[] = [
				{ column: "age", kind: "literal", value: 200 },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(false);
			expect(result.violations[0].rule).toBe("max");
			expect(result.violations[0].constraint).toEqual({ max: 150 });
		});

		it("skips null values for numeric checks", () => {
			const values: ExtractedValue[] = [
				{ column: "age", kind: "literal", value: null },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(true);
		});
	});

	describe("notNull rule", () => {
		const rules: ColumnValidationRules = {
			name: [{ type: "notNull" }],
		};

		it("passes when value is not null", () => {
			const values: ExtractedValue[] = [
				{ column: "name", kind: "literal", value: "Alice" },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(true);
		});

		it("fails when value is null", () => {
			const values: ExtractedValue[] = [
				{ column: "name", kind: "literal", value: null },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(false);
			expect(result.violations[0].rule).toBe("notNull");
			expect(result.violations[0].constraint).toEqual({ notNull: true });
		});
	});

	describe("unvalidatable values", () => {
		const rules: ColumnValidationRules = {
			price: [{ type: "min", value: 0 }],
		};

		it("reports unvalidatable columns without failing", () => {
			const values: ExtractedValue[] = [
				{
					column: "price",
					kind: "unvalidatable",
					rawType: "binary_expr",
				},
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(true);
			expect(result.unvalidatable).toHaveLength(1);
			expect(result.unvalidatable[0]).toEqual({
				column: "price",
				expression: "binary_expr",
			});
		});
	});

	describe("columns without rules", () => {
		it("allows any value when no rules exist for the column", () => {
			const values: ExtractedValue[] = [
				{ column: "unknown_col", kind: "literal", value: "anything" },
			];
			const result = validateValuePreExec(values, {});
			expect(result.valid).toBe(true);
		});
	});

	describe("multiple violations", () => {
		it("reports all violations across columns", () => {
			const rules: ColumnValidationRules = {
				status: [
					{ type: "enum", values: ["active", "inactive"] },
				],
				age: [{ type: "min", value: 0 }],
			};
			const values: ExtractedValue[] = [
				{ column: "status", kind: "literal", value: "bad" },
				{ column: "age", kind: "literal", value: -5 },
			];
			const result = validateValuePreExec(values, rules);
			expect(result.valid).toBe(false);
			expect(result.violations).toHaveLength(2);
		});
	});
});

// ── validateValuePostExec ─────────────────────────────────────────

describe("validateValuePostExec", () => {
	const rules: ColumnValidationRules = {
		status: [{ type: "enum", values: ["active", "inactive"] }],
		age: [
			{ type: "min", value: 0 },
			{ type: "max", value: 150 },
		],
	};

	it("passes when all values conform", () => {
		const dataAfter = [
			{ id: 1, status: "active", age: 25 },
			{ id: 2, status: "inactive", age: 30 },
		];
		const result = validateValuePostExec(dataAfter, rules);
		expect(result.valid).toBe(true);
	});

	it("fails when a row has invalid value", () => {
		const dataAfter = [
			{ id: 1, status: "active", age: 25 },
			{ id: 2, status: "deleted", age: 30 },
		];
		const result = validateValuePostExec(dataAfter, rules);
		expect(result.valid).toBe(false);
		expect(result.violations[0].column).toBe("status");
		expect(result.violations[0].value).toBe("deleted");
	});

	it("skips columns not present in the row", () => {
		const dataAfter = [{ id: 1, name: "Alice" }];
		const result = validateValuePostExec(dataAfter, rules);
		expect(result.valid).toBe(true);
	});

	it("validates numeric values from DB (may be strings)", () => {
		const dataAfter = [{ id: 1, status: "active", age: -5 }];
		const result = validateValuePostExec(dataAfter, rules);
		expect(result.valid).toBe(false);
		expect(result.violations[0].column).toBe("age");
	});
});

// ── parseCustomRules ──────────────────────────────────────────────

describe("parseCustomRules", () => {
	it("returns empty object for null input", () => {
		expect(parseCustomRules(null)).toEqual({});
	});

	it("returns empty object for undefined input", () => {
		expect(parseCustomRules(undefined)).toEqual({});
	});

	it("returns empty object for empty object", () => {
		expect(parseCustomRules({})).toEqual({});
	});

	it("extracts columnValidation when present", () => {
		const raw: CustomRules = {
			columnValidation: {
				status: [{ type: "enum", values: ["active"] }],
			},
		};
		const result = parseCustomRules(raw);
		expect(result.columnValidation).toBeDefined();
		expect(result.columnValidation!.status).toHaveLength(1);
	});

	it("ignores unknown keys", () => {
		const raw = { unknownKey: true, columnValidation: { age: [{ type: "min", value: 0 }] } };
		const result = parseCustomRules(raw as Record<string, unknown>);
		expect(result.columnValidation).toBeDefined();
		expect((result as Record<string, unknown>).unknownKey).toBeUndefined();
	});
});

// ── columnValidationSchema (policy write-path) ────────────────────

describe("columnValidationSchema", () => {
	it("accepts a valid pattern regex", () => {
		const result = columnValidationSchema.safeParse({
			email: [{ type: "pattern", regex: "^[^@]+@[^@]+\\.[^@]+$" }],
		});
		expect(result.success).toBe(true);
	});

	it("rejects an uncompilable pattern regex at save time", () => {
		const result = columnValidationSchema.safeParse({
			email: [{ type: "pattern", regex: "[" }],
		});
		expect(result.success).toBe(false);
	});
});
