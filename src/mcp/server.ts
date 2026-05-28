import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Builds the URL for a given API path, appending optional query parameters.
 */
function buildUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
	const url = new URL(path, baseUrl);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}
	}
	return url.toString();
}

/**
 * Executes a fetch request against the REST API and returns a formatted MCP tool result.
 */
async function callApi(
	baseUrl: string,
	apiKey: string,
	path: string,
	options: {
		method?: string;
		body?: unknown;
		params?: Record<string, string>;
	} = {},
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
	const { method = "GET", body, params } = options;
	const url = buildUrl(baseUrl, path, params);

	try {
		const response = await fetch(url, {
			method,
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": apiKey,
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});

		const data = await response.json();

		if (!response.ok) {
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
				isError: true,
			};
		}

		return {
			content: [{ type: "text", text: JSON.stringify(data) }],
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: "text", text: JSON.stringify({ error: message }) }],
			isError: true,
		};
	}
}

/**
 * Creates an MCP server that wraps the Eko MySQL Agent Connector REST API.
 * Each tool delegates to the corresponding REST endpoint via fetch().
 */
export interface McpServerOptions {
	role?: "executor" | "auditor";
}

export function createMcpServer(
	baseUrl: string,
	apiKey: string,
	options: McpServerOptions = {},
): McpServer {
	const { role = "executor" } = options;

	const server = new McpServer({
		name: "agent-querygate",
		version: "0.1.0",
	});

	if (role === "auditor") {
		registerAuditorTools(server, baseUrl, apiKey);
	} else {
		registerExecutorTools(server, baseUrl, apiKey);
	}

	// mysql_health — available to all roles
	server.registerTool(
		"mysql_health",
		{
			description: "Check the health status of the MySQL agent connection",
			inputSchema: {},
		},
		async () => {
			return callApi(baseUrl, apiKey, "/api/v1/health");
		},
	);

	return server;
}

function registerAuditorTools(server: McpServer, baseUrl: string, apiKey: string): void {
	server.registerTool(
		"audit_list_logs",
		{
			description: "Search and list audit logs with filtering and pagination",
			inputSchema: {
				page: z.number().int().positive().optional().describe("Page number (default 1)"),
				limit: z.number().int().min(1).max(100).optional().describe("Results per page (default 50)"),
				agent: z.string().optional().describe("Filter by agent ID"),
				db: z.string().optional().describe("Filter by database ID"),
				op: z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"]).optional().describe("Filter by operation type"),
				status: z.enum(["allowed", "denied", "error"]).optional().describe("Filter by status"),
				from: z.string().optional().describe("Start datetime (ISO 8601)"),
				to: z.string().optional().describe("End datetime (ISO 8601)"),
			},
		},
		async (params) => {
			const queryParams: Record<string, string> = {};
			if (params.page) queryParams.page = String(params.page);
			if (params.limit) queryParams.limit = String(params.limit);
			if (params.agent) queryParams.agent = params.agent;
			if (params.db) queryParams.db = params.db;
			if (params.op) queryParams.op = params.op;
			if (params.status) queryParams.status = params.status;
			if (params.from) queryParams.from = params.from;
			if (params.to) queryParams.to = params.to;

			return callApi(baseUrl, apiKey, "/api/v1/audit/logs", { params: queryParams });
		},
	);

	server.registerTool(
		"audit_get_log",
		{
			description: "Get a single audit log entry with its reviews",
			inputSchema: {
				id: z.string().describe("The audit log ID"),
			},
		},
		async ({ id }) => {
			return callApi(baseUrl, apiKey, `/api/v1/audit/logs/${encodeURIComponent(id)}`);
		},
	);

	server.registerTool(
		"audit_create_review",
		{
			description: "Flag an audit log entry with a review/finding",
			inputSchema: {
				audit_log_id: z.string().describe("The audit log ID to flag"),
				flag_type: z.enum(["suspicious_pattern", "policy_violation", "data_anomaly", "performance_concern", "manual_review"]).describe("Type of flag"),
				severity: z.enum(["low", "medium", "high", "critical"]).describe("Severity level"),
				notes: z.string().optional().describe("Optional review notes"),
			},
		},
		async (params) => {
			return callApi(baseUrl, apiKey, "/api/v1/audit/reviews", {
				method: "POST",
				body: {
					audit_log_id: params.audit_log_id,
					flag_type: params.flag_type,
					severity: params.severity,
					notes: params.notes,
				},
			});
		},
	);

	server.registerTool(
		"audit_list_reviews",
		{
			description: "List reviews/flags created by this auditor agent",
			inputSchema: {
				page: z.number().int().positive().optional().describe("Page number"),
				limit: z.number().int().min(1).max(100).optional().describe("Results per page"),
			},
		},
		async (params) => {
			const queryParams: Record<string, string> = {};
			if (params.page) queryParams.page = String(params.page);
			if (params.limit) queryParams.limit = String(params.limit);
			return callApi(baseUrl, apiKey, "/api/v1/audit/reviews", { params: queryParams });
		},
	);
}

function registerExecutorTools(server: McpServer, baseUrl: string, apiKey: string): void {
	// mysql_query — Execute read-only SQL
	server.registerTool(
		"mysql_query",
		{
			description: "Execute a read-only SQL query (SELECT) against the MySQL database",
			inputSchema: {
				sql: z.string().describe("The SQL SELECT query to execute"),
				database_id: z.string().optional().describe("Target database ID (optional if agent has access to only one database)"),
				reason: z.string().optional().describe("Why you are running this query"),
			},
		},
		async ({ sql, database_id, reason }) => {
			return callApi(baseUrl, apiKey, "/api/v1/query", {
				method: "POST",
				body: { sql, database_id, reason },
			});
		},
	);

	// mysql_execute — Execute write SQL (INSERT/UPDATE/DELETE)
	server.registerTool(
		"mysql_execute",
		{
			description: "Execute a write SQL statement (INSERT, UPDATE, DELETE) against the MySQL database",
			inputSchema: {
				sql: z.string().describe("The SQL write statement to execute"),
				database_id: z.string().optional().describe("Target database ID (optional if agent has access to only one database)"),
				reason: z.string().optional().describe("Why you are making this change — stored in the audit log"),
			},
		},
		async ({ sql, database_id, reason }) => {
			return callApi(baseUrl, apiKey, "/api/v1/execute", {
				method: "POST",
				body: { sql, database_id, reason },
			});
		},
	);

	// mysql_list_tables — List accessible tables
	server.registerTool(
		"mysql_list_tables",
		{
			description: "List all tables the agent has access to in the MySQL database",
			inputSchema: {
				database_id: z.string().optional().describe("Target database ID (optional if agent has access to only one database)"),
			},
		},
		async ({ database_id }) => {
			const params: Record<string, string> = {};
			if (database_id) {
				params.database_id = database_id;
			}
			return callApi(baseUrl, apiKey, "/api/v1/tables", { params });
		},
	);

	// mysql_describe_table — Get table schema
	server.registerTool(
		"mysql_describe_table",
		{
			description: "Get the column schema for a specific table in the MySQL database",
			inputSchema: {
				table: z.string().describe("The name of the table to describe"),
				database_id: z.string().optional().describe("Target database ID (optional if agent has access to only one database)"),
			},
		},
		async ({ table, database_id }) => {
			const params: Record<string, string> = {};
			if (database_id) {
				params.database_id = database_id;
			}
			return callApi(baseUrl, apiKey, `/api/v1/tables/${encodeURIComponent(table)}/schema`, { params });
		},
	);

}

/**
 * Creates the MCP server and connects it via StdioServerTransport.
 * This is the entry point for running the MCP server as a standalone stdio process.
 */
export async function startMcpStdio(
	baseUrl: string,
	apiKey: string,
	options?: McpServerOptions,
): Promise<void> {
	const server = createMcpServer(baseUrl, apiKey, options);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
