import { buildSnapshotSelect } from "@/query/snapshot";
import type { ParsedQuery } from "@/lib/types";

function updateQuery(sql: string, table = "users"): ParsedQuery {
	return {
		operation: "UPDATE",
		tables: [table],
		columns: [],
		hasWhere: true,
		originalSql: sql,
	};
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
