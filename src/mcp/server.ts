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
export function createMcpServer(baseUrl: string, apiKey: string): McpServer {
	const server = new McpServer({
		name: "eko-mysql-agent-connector",
		version: "0.1.0",
	});

	// mysql_query — Execute read-only SQL
	server.registerTool(
		"mysql_query",
		{
			description: "Execute a read-only SQL query (SELECT) against the MySQL database",
			inputSchema: {
				sql: z.string().describe("The SQL SELECT query to execute"),
				database_id: z.string().optional().describe("Target database ID (optional if agent has access to only one database)"),
			},
		},
		async ({ sql, database_id }) => {
			return callApi(baseUrl, apiKey, "/api/v1/query", {
				method: "POST",
				body: { sql, database_id },
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
			},
		},
		async ({ sql, database_id }) => {
			return callApi(baseUrl, apiKey, "/api/v1/execute", {
				method: "POST",
				body: { sql, database_id },
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

	// mysql_health — Check connection
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

/**
 * Creates the MCP server and connects it via StdioServerTransport.
 * This is the entry point for running the MCP server as a standalone stdio process.
 */
export async function startMcpStdio(baseUrl: string, apiKey: string): Promise<void> {
	const server = createMcpServer(baseUrl, apiKey);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
