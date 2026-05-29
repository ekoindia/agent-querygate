import {
	buildSnapshotSelect,
	captureBeforeSnapshot,
	captureAfterSnapshot,
} from "@/query/snapshot";
import type { ParsedQuery } from "@/lib/types";
import type { Pool } from "mysql2/promise";

function updateQuery(sql: string, table = "users"): ParsedQuery {
	return {
		operation: "UPDATE",
		tables: [table],
		columns: [],
		hasWhere: true,
		originalSql: sql,
	};
}

/** Minimal Pool stub that records the SQL passed to query() and returns fixed rows. */
function mockPool(rows: Record<string, unknown>[]): {
	pool: Pool;
	calls: string[];
} {
	const calls: string[] = [];
	const pool = {
		query: async (sql: string) => {
			calls.push(sql);
			return [rows, []];
		},
	} as unknown as Pool;
	return { pool, calls };
}

describe("buildSnapshotSelect", () => {
	it("returns null when no table is present", () => {
		const query = { ...updateQuery("UPDATE users SET a = 1"), tables: [] };
		expect(buildSnapshotSelect(query)).toBeNull();
	});

	it("captures all columns when no allow-list is given", () => {
		const sql = "UPDATE users SET status = 'active' WHERE id = 1";
		const out = buildSnapshotSelect(updateQuery(sql));
		expect(out).toContain("SELECT *");
		expect(out).toContain("FROM `users`");
		expect(out).toContain("WHERE id = 1");
	});

	it("scopes the projection to allowed columns", () => {
		const sql = "UPDATE users SET status = 'active' WHERE id = 1";
		const out = buildSnapshotSelect(updateQuery(sql), ["id", "status"]);
		expect(out).toContain("SELECT `id`, `status`");
		expect(out).not.toContain("SELECT *");
	});

	it("falls back to * when the allow-list is empty", () => {
		const sql = "UPDATE users SET status = 'active' WHERE id = 1";
		const out = buildSnapshotSelect(updateQuery(sql), []);
		expect(out).toContain("SELECT *");
	});

	it("escapes embedded backticks in identifiers", () => {
		const sql = "UPDATE users SET status = 'active' WHERE id = 1";
		const out = buildSnapshotSelect(
			updateQuery(sql, "ev`il"),
			["co`l"],
		);
		expect(out).toContain("FROM `ev``il`");
		expect(out).toContain("SELECT `co``l`");
	});
});

describe("captureBeforeSnapshot", () => {
	it("returns empty array for INSERT without querying", async () => {
		const { pool, calls } = mockPool([{ id: 1 }]);
		const query: ParsedQuery = {
			operation: "INSERT",
			tables: ["users"],
			columns: [],
			hasWhere: false,
			originalSql: "INSERT INTO users (a) VALUES (1)",
		};
		const rows = await captureBeforeSnapshot(pool, query);
		expect(rows).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("returns empty array when table cannot be determined", async () => {
		const { pool, calls } = mockPool([{ id: 1 }]);
		const query = { ...updateQuery("UPDATE users SET a = 1"), tables: [] };
		const rows = await captureBeforeSnapshot(pool, query);
		expect(rows).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("queries the snapshot SQL and returns rows for UPDATE", async () => {
		const expected = [{ id: 1, status: "old" }];
		const { pool, calls } = mockPool(expected);
		const query = updateQuery("UPDATE users SET status = 'new' WHERE id = 1");
		const rows = await captureBeforeSnapshot(pool, query, ["id", "status"]);
		expect(rows).toEqual(expected);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain("SELECT `id`, `status`");
		expect(calls[0]).toContain("WHERE id = 1");
	});
});

describe("captureAfterSnapshot", () => {
	it("returns empty array for DELETE without querying", async () => {
		const { pool, calls } = mockPool([{ id: 1 }]);
		const query: ParsedQuery = {
			operation: "DELETE",
			tables: ["users"],
			columns: [],
			hasWhere: true,
			originalSql: "DELETE FROM users WHERE id = 1",
		};
		const rows = await captureAfterSnapshot(pool, query);
		expect(rows).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("returns empty array when table cannot be determined", async () => {
		const { pool, calls } = mockPool([{ id: 1 }]);
		const query = { ...updateQuery("UPDATE users SET a = 1"), tables: [] };
		const rows = await captureAfterSnapshot(pool, query);
		expect(rows).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("queries the snapshot SQL and returns rows for UPDATE", async () => {
		const expected = [{ id: 1, status: "new" }];
		const { pool, calls } = mockPool(expected);
		const query = updateQuery("UPDATE users SET status = 'new' WHERE id = 1");
		const rows = await captureAfterSnapshot(pool, query);
		expect(rows).toEqual(expected);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain("SELECT *");
	});
});
