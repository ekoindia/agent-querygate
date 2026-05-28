import { evaluatePolicy, getPolicyRowLimit } from "@/policy/engine";
import type { ParsedQuery } from "@/lib/types";
import type { PolicyRecord } from "@/policy/engine";
import type { CustomRules } from "@/policy/value-validation";

const makePolicy = (overrides: Partial<PolicyRecord> = {}): PolicyRecord => ({
	id: "policy-1",
	tableName: "users",
	allowedOperations: ["SELECT", "UPDATE"],
	allowedColumns: null,
	rowLimit: null,
	whereClauseRequired: false,
	...overrides,
});

const makeQuery = (overrides: Partial<ParsedQuery> = {}): ParsedQuery => ({
	operation: "SELECT",
	tables: ["users"],
	columns: ["name"],
	hasWhere: true,
	originalSql: "SELECT name FROM users WHERE id = 1",
	...overrides,
});

describe("evaluatePolicy", () => {
	it("allows query matching policy", () => {
		const result = evaluatePolicy(makeQuery(), [makePolicy()]);
		expect(result.allowed).toBe(true);
		expect(result.policyId).toBe("policy-1");
		expect(result.denialReason).toBeUndefined();
	});

	it("denies when no policy for table", () => {
		const result = evaluatePolicy(
			makeQuery({ tables: ["orders"] }),
			[makePolicy()],
		);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toBe("No access policy for table 'orders'");
	});

	it("denies disallowed operation", () => {
		const result = evaluatePolicy(
			makeQuery({ operation: "DELETE" }),
			[makePolicy()],
		);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toBe("Operation DELETE not allowed on table 'users'");
	});

	it("denies disallowed column", () => {
		const result = evaluatePolicy(
			makeQuery({ columns: ["name", "secret"] }),
			[makePolicy({ allowedColumns: ["name", "email"] })],
		);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toBe("Column(s) not allowed on table 'users': secret");
	});

	it("allows when allowedColumns is null (all columns)", () => {
		const result = evaluatePolicy(
			makeQuery({ columns: ["name", "email", "secret"] }),
			[makePolicy({ allowedColumns: null })],
		);
		expect(result.allowed).toBe(true);
		expect(result.policyId).toBe("policy-1");
	});

	it("denies missing WHERE when required for UPDATE/DELETE", () => {
		const result = evaluatePolicy(
			makeQuery({ operation: "UPDATE", hasWhere: false, originalSql: "UPDATE users SET name = 'x'" }),
			[makePolicy({ whereClauseRequired: true })],
		);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toBe("WHERE clause required for UPDATE on table 'users'");
	});

	it("allows SELECT * when all columns permitted (allowedColumns: null)", () => {
		const result = evaluatePolicy(
			makeQuery({ columns: ["*"] }),
			[makePolicy({ allowedColumns: null })],
		);
		expect(result.allowed).toBe(true);
		expect(result.policyId).toBe("policy-1");
	});

	it("handles multi-table query — both tables need policies", () => {
		const query = makeQuery({
			tables: ["users", "orders"],
			originalSql: "SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id",
		});
		const policies = [
			makePolicy(),
			makePolicy({ id: "policy-2", tableName: "orders", allowedOperations: ["SELECT"] }),
		];
		const result = evaluatePolicy(query, policies);
		expect(result.allowed).toBe(true);
		expect(result.policyId).toBe("policy-1");
	});

	it("denies multi-table query when one table has no policy", () => {
		const query = makeQuery({
			tables: ["users", "orders"],
			originalSql: "SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id",
		});
		const result = evaluatePolicy(query, [makePolicy()]);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toBe("No access policy for table 'orders'");
	});

	describe("value validation via customRules", () => {
		const customRules: CustomRules = {
			columnValidation: {
				status: [{ type: "enum", values: ["active", "inactive", "suspended"] }],
				age: [{ type: "min", value: 0 }, { type: "max", value: 150 }],
			},
		};

		it("allows query when values conform to rules", () => {
			const result = evaluatePolicy(
				makeQuery({
					operation: "UPDATE",
					columns: ["status"],
					extractedValues: [
						{ column: "status", kind: "literal", value: "active" },
					],
				}),
				[makePolicy({ allowedOperations: ["UPDATE"], customRules })],
			);
			expect(result.allowed).toBe(true);
		});

		it("denies query when value violates enum rule", () => {
			const result = evaluatePolicy(
				makeQuery({
					operation: "UPDATE",
					columns: ["status"],
					extractedValues: [
						{ column: "status", kind: "literal", value: "superadmin" },
					],
				}),
				[makePolicy({ allowedOperations: ["UPDATE"], customRules })],
			);
			expect(result.allowed).toBe(false);
			expect(result.denialReason).toContain("Value validation failed");
			expect(result.valueViolations).toBeDefined();
			expect(result.valueViolations).toHaveLength(1);
			expect(result.valueViolations![0].column).toBe("status");
			expect(result.valueViolations![0].constraint).toEqual({
				values: ["active", "inactive", "suspended"],
			});
		});

		it("denies query when value violates numeric range", () => {
			const result = evaluatePolicy(
				makeQuery({
					operation: "UPDATE",
					columns: ["age"],
					extractedValues: [
						{ column: "age", kind: "literal", value: -5 },
					],
				}),
				[makePolicy({ allowedOperations: ["UPDATE"], customRules })],
			);
			expect(result.allowed).toBe(false);
			expect(result.valueViolations![0].rule).toBe("min");
		});

		it("reports unvalidatable columns without denying", () => {
			const result = evaluatePolicy(
				makeQuery({
					operation: "UPDATE",
					columns: ["status"],
					extractedValues: [
						{ column: "status", kind: "unvalidatable", rawType: "function" },
					],
				}),
				[makePolicy({ allowedOperations: ["UPDATE"], customRules })],
			);
			expect(result.allowed).toBe(true);
		});

		it("allows query when customRules is empty (backward compat)", () => {
			const result = evaluatePolicy(
				makeQuery({
					operation: "UPDATE",
					columns: ["status"],
					extractedValues: [
						{ column: "status", kind: "literal", value: "anything" },
					],
				}),
				[makePolicy({ allowedOperations: ["UPDATE"] })],
			);
			expect(result.allowed).toBe(true);
		});

		it("allows query when no extractedValues present", () => {
			const result = evaluatePolicy(
				makeQuery({ operation: "UPDATE", columns: ["status"] }),
				[makePolicy({ allowedOperations: ["UPDATE"], customRules })],
			);
			expect(result.allowed).toBe(true);
		});
	});
});

describe("getPolicyRowLimit", () => {
	it("returns rowLimit from the first table's policy", () => {
		const limit = getPolicyRowLimit(makeQuery(), [makePolicy({ rowLimit: 100 })]);
		expect(limit).toBe(100);
	});

	it("returns null when no rowLimit is set", () => {
		const limit = getPolicyRowLimit(makeQuery(), [makePolicy({ rowLimit: null })]);
		expect(limit).toBeNull();
	});

	it("returns null when no policy exists for the table", () => {
		const limit = getPolicyRowLimit(
			makeQuery({ tables: ["orders"] }),
			[makePolicy()],
		);
		expect(limit).toBeNull();
	});
});
