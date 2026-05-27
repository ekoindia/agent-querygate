import { parseSql } from "@/policy/sql-parser";

describe("parseSql", () => {
	it("parses simple SELECT with columns and WHERE", () => {
		const result = parseSql("SELECT id, name FROM users WHERE id = 1");
		expect(result.operation).toBe("SELECT");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toEqual(["id", "name"]);
		expect(result.hasWhere).toBe(true);
	});

	it("parses SELECT *", () => {
		const result = parseSql("SELECT * FROM products");
		expect(result.operation).toBe("SELECT");
		expect(result.tables).toEqual(["products"]);
		expect(result.columns).toEqual(["*"]);
		expect(result.hasWhere).toBe(false);
	});

	it("parses INSERT with columns", () => {
		const result = parseSql("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");
		expect(result.operation).toBe("INSERT");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toEqual(["name", "email"]);
		expect(result.hasWhere).toBe(false);
	});

	it("parses UPDATE with SET columns and WHERE", () => {
		const result = parseSql("UPDATE users SET name = 'Bob', email = 'bob@example.com' WHERE id = 1");
		expect(result.operation).toBe("UPDATE");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toEqual(["name", "email"]);
		expect(result.hasWhere).toBe(true);
	});

	it("parses UPDATE without WHERE (hasWhere=false)", () => {
		const result = parseSql("UPDATE users SET active = 0");
		expect(result.operation).toBe("UPDATE");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toEqual(["active"]);
		expect(result.hasWhere).toBe(false);
	});

	it("parses DELETE with WHERE", () => {
		const result = parseSql("DELETE FROM users WHERE id = 99");
		expect(result.operation).toBe("DELETE");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toEqual([]);
		expect(result.hasWhere).toBe(true);
	});

	it("parses JOIN query (multiple tables)", () => {
		const result = parseSql("SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE o.total > 100");
		expect(result.operation).toBe("SELECT");
		expect(result.tables).toContain("users");
		expect(result.tables).toContain("orders");
		expect(result.tables).toHaveLength(2);
		expect(result.hasWhere).toBe(true);
	});

	it("throws on unparseable SQL", () => {
		expect(() => parseSql("THIS IS NOT SQL AT ALL")).toThrow();
	});

	it("preserves original SQL", () => {
		const sql = "SELECT id FROM users";
		const result = parseSql(sql);
		expect(result.originalSql).toBe(sql);
	});
});
