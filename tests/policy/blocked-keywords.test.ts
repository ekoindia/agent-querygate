import { checkBlockedKeywords } from "@/policy/blocked-keywords";

describe("checkBlockedKeywords", () => {
	it("allows a normal SELECT statement", () => {
		expect(checkBlockedKeywords("SELECT id, name FROM users WHERE id = 1")).toBeNull();
	});

	it("allows a normal INSERT statement", () => {
		expect(checkBlockedKeywords("INSERT INTO users (name, email) VALUES ('a', 'b')")).toBeNull();
	});

	it("blocks DROP TABLE", () => {
		const result = checkBlockedKeywords("DROP TABLE users");
		expect(result).toBe("DDL operation DROP is not allowed");
	});

	it("blocks CREATE TABLE", () => {
		const result = checkBlockedKeywords("CREATE TABLE foo (id INT)");
		expect(result).toBe("DDL operation CREATE is not allowed");
	});

	it("blocks ALTER TABLE", () => {
		const result = checkBlockedKeywords("ALTER TABLE users ADD COLUMN age INT");
		expect(result).toBe("DDL operation ALTER is not allowed");
	});

	it("blocks TRUNCATE", () => {
		const result = checkBlockedKeywords("TRUNCATE TABLE users");
		expect(result).toBe("DDL operation TRUNCATE is not allowed");
	});

	it("blocks LOAD DATA", () => {
		const result = checkBlockedKeywords("LOAD DATA INFILE '/tmp/data.csv' INTO TABLE users");
		expect(result).toBe("LOAD DATA is not allowed");
	});

	it("blocks INTO OUTFILE", () => {
		const result = checkBlockedKeywords("SELECT * FROM users INTO OUTFILE '/tmp/out.csv'");
		expect(result).toBe("INTO OUTFILE is not allowed");
	});

	it("blocks GRANT", () => {
		const result = checkBlockedKeywords("GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost'");
		expect(result).toBe("GRANT/REVOKE is not allowed");
	});

	it("blocks multi-statement queries (semicolon followed by non-whitespace)", () => {
		const result = checkBlockedKeywords("SELECT 1; DROP TABLE users");
		expect(result).toContain("not allowed");
	});

	it("is case insensitive", () => {
		expect(checkBlockedKeywords("drop table users")).toBe("DDL operation DROP is not allowed");
		expect(checkBlockedKeywords("Drop Table users")).toBe("DDL operation DROP is not allowed");
		expect(checkBlockedKeywords("GRANT all on *.* to root")).toBe("GRANT/REVOKE is not allowed");
	});
});
