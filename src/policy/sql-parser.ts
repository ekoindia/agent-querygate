import { Parser } from "node-sql-parser";
import { Errors } from "@/lib/errors";
import type { ParsedQuery } from "@/lib/types";
import { extractValuesFromAst } from "./value-validation.js";

const parser = new Parser();

const ALLOWED_OPERATIONS = new Set(["select", "insert", "update", "delete"]);

/** AST node types used internally for extraction. */
interface TableRef {
	db: string | null;
	table: string;
	as: string | null;
}

interface ColumnRef {
	expr: { type: string; column: string; table: string | null };
	as: string | null;
}

interface SetItem {
	column: string;
	value: unknown;
	table: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ast = Record<string, any>;

/**
 * Parses a SQL string into a structured ParsedQuery object.
 * Throws Errors.badRequest if the SQL is unparseable or disallowed.
 */
export function parseSql(sql: string): ParsedQuery {
	let ast: Ast | Ast[];
	try {
		ast = parser.astify(sql, { database: "MySQL" });
	} catch {
		throw Errors.badRequest(`Failed to parse SQL: ${sql}`);
	}

	// Reject multi-statement (array result)
	if (Array.isArray(ast)) {
		throw Errors.badRequest("Multi-statement SQL is not allowed");
	}

	const operationType = (ast.type as string).toLowerCase();
	if (!ALLOWED_OPERATIONS.has(operationType)) {
		throw Errors.badRequest(`Operation '${ast.type}' is not allowed`);
	}

	const operation = operationType.toUpperCase() as ParsedQuery["operation"];
	const tables = extractTables(ast, operation);
	const columns = extractColumns(ast, operation);
	const hasWhere = ast.where != null;

	const result: ParsedQuery = {
		operation,
		tables,
		columns,
		hasWhere,
		originalSql: sql,
	};

	if (operation === "INSERT" || operation === "UPDATE") {
		result.extractedValues = extractValuesFromAst(ast, operation);
	}

	return result;
}

/** Extracts table names from the AST based on operation type. */
function extractTables(ast: Ast, operation: string): string[] {
	let tableRefs: TableRef[] = [];

	if (operation === "SELECT" || operation === "DELETE") {
		tableRefs = (ast.from as TableRef[] | null) ?? [];
	} else if (operation === "INSERT" || operation === "UPDATE") {
		tableRefs = (ast.table as TableRef[] | null) ?? [];
	}

	return tableRefs
		.filter((ref) => ref.table != null)
		.map((ref) => ref.table);
}

/** Extracts column names from the AST based on operation type. */
function extractColumns(ast: Ast, operation: string): string[] {
	if (operation === "SELECT") {
		const cols = ast.columns as ColumnRef[] | "*";
		if (cols === "*") {
			return ["*"];
		}
		return cols
			.filter((col) => col.expr?.type === "column_ref")
			.map((col) => col.expr.column);
	}

	if (operation === "INSERT") {
		// INSERT columns are already a plain string array
		return (ast.columns as string[] | null) ?? [];
	}

	if (operation === "UPDATE") {
		const setItems = (ast.set as SetItem[] | null) ?? [];
		return setItems.map((item) => item.column);
	}

	// DELETE has no meaningful column list
	return [];
}
