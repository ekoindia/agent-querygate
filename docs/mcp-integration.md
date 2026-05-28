# MCP Integration

The Agent QueryGate provides a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that exposes the Agent API as tools. This allows AI assistants like Claude to interact with MySQL databases using natural language, with all queries governed by the policy engine.

## How It Works

MCP is a standard protocol for connecting AI models to external tools and data sources. The QueryGate MCP server:

1. Runs as a stdio subprocess alongside the AI assistant
2. Receives tool calls from the assistant
3. Translates them into HTTP requests to the QueryGate REST API
4. Returns structured results back to the assistant

The MCP server itself is stateless -- it delegates all authentication, authorization, policy enforcement, and query execution to the main service.

## Tools

The MCP server registers different tools depending on the agent role. Executor agents get query/mutation tools; auditor agents get audit review tools. The `mysql_health` tool is available to both roles.

### Executor Tools

#### mysql_query

Execute a read-only SQL query (SELECT) against the MySQL database.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sql` | string | Yes | The SQL SELECT query to execute |
| `database_id` | string | No | Target database ID (optional if agent has access to only one database) |
| `reason` | string | No | Why you are running this query (stored in audit log) |

**Example response:**
```json
{
	"columns": ["id", "name", "email"],
	"rows": [
		{ "id": 1, "name": "Alice", "email": "alice@example.com" }
	],
	"rowCount": 1
}
```

#### mysql_execute

Execute a write SQL statement (INSERT, UPDATE, DELETE) against the MySQL database.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sql` | string | Yes | The SQL write statement to execute |
| `database_id` | string | No | Target database ID (optional if agent has access to only one database) |
| `reason` | string | No | Why you are making this change (stored in audit log) |

**Example response:**
```json
{
	"affected_rows": 1,
	"data_before": [{ "id": 5, "status": "pending" }],
	"data_after": [{ "id": 5, "status": "shipped" }]
}
```

#### mysql_list_tables

List all tables the agent has access to in the MySQL database.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `database_id` | string | No | Target database ID (optional if agent has access to only one database) |

**Example response:**
```json
{
	"tables": ["orders", "products", "customers"]
}
```

#### mysql_describe_table

Get the column schema for a specific table in the MySQL database.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `table` | string | Yes | The name of the table to describe |
| `database_id` | string | No | Target database ID (optional if agent has access to only one database) |

**Example response:**
```json
{
	"columns": [
		{ "Field": "id", "Type": "int", "Null": "NO", "Key": "PRI", "Default": null, "Extra": "auto_increment" },
		{ "Field": "name", "Type": "varchar(255)", "Null": "NO", "Key": "", "Default": null, "Extra": "" }
	]
}
```

### Auditor Tools

These tools are registered when `AQG_AGENT_ROLE=auditor`. They replace the executor tools (query/execute/tables/describe).

#### audit_list_logs

Search and list audit logs with filtering and pagination.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `page` | number | No | Page number (default 1) |
| `limit` | number | No | Results per page (default 50, max 100) |
| `agent` | string | No | Filter by agent ID |
| `db` | string | No | Filter by database ID |
| `op` | string | No | Filter by operation type (SELECT/INSERT/UPDATE/DELETE) |
| `status` | string | No | Filter by status (allowed/denied/error) |
| `from` | string | No | Start datetime (ISO 8601) |
| `to` | string | No | End datetime (ISO 8601) |

**Example response:**
```json
{
	"logs": [
		{
			"id": "uuid",
			"agentId": "uuid",
			"sqlQuery": "UPDATE orders SET status='shipped' WHERE id = 5",
			"operationType": "UPDATE",
			"status": "allowed",
			"reason": "Customer requested expedited shipping",
			"createdAt": "ISO datetime"
		}
	],
	"pagination": { "page": 1, "limit": 50, "total": 142, "totalPages": 3 }
}
```

#### audit_get_log

Get a single audit log entry with its reviews.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | The audit log ID |

#### audit_create_review

Flag an audit log entry with a review/finding.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `audit_log_id` | string | Yes | The audit log ID to flag |
| `flag_type` | string | Yes | One of: suspicious_pattern, policy_violation, data_anomaly, performance_concern, manual_review |
| `severity` | string | Yes | One of: low, medium, high, critical |
| `notes` | string | No | Optional review notes |

#### audit_list_reviews

List reviews/flags created by this auditor agent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `page` | number | No | Page number |
| `limit` | number | No | Results per page |

### Common Tools

#### mysql_health

Check the health status of the MySQL agent connection. Available to both executor and auditor roles.

| Parameter | Type | Required | Description |
|---|---|---|---|
| (none) | -- | -- | -- |

**Example response:**
```json
{
	"status": "ok",
	"agent": "Claude Agent"
}
```

## Claude Desktop Configuration

Add the following to your Claude Desktop MCP configuration file (`claude_desktop_config.json`):

```json
{
	"mcpServers": {
		"agent-querygate": {
			"command": "npx",
			"args": ["tsx", "src/mcp/server.ts"],
			"env": {
				"AQG_BASE_URL": "http://localhost:3000",
				"AQG_API_KEY": "aqg_your-api-key-here",
				"AQG_AGENT_ROLE": "executor"
			}
		}
	}
}
```

Replace the `AQG_API_KEY` value with the actual API key generated when you created the agent in the admin panel.

If the service is installed globally or you have it in a specific path, use the full path:

```json
{
	"mcpServers": {
		"agent-querygate": {
			"command": "npx",
			"args": ["tsx", "/path/to/agent-querygate/src/mcp/server.ts"],
			"env": {
				"AQG_BASE_URL": "http://localhost:3000",
				"AQG_API_KEY": "aqg_your-api-key-here",
				"AQG_AGENT_ROLE": "executor"
			}
		}
	}
}
```

## Claude Code MCP Configuration

For Claude Code, add the MCP server to your project's `.claude/settings.json` or global settings:

```json
{
	"mcpServers": {
		"agent-querygate": {
			"command": "npx",
			"args": ["tsx", "/path/to/agent-querygate/src/mcp/server.ts"],
			"env": {
				"AQG_BASE_URL": "http://localhost:3000",
				"AQG_API_KEY": "aqg_your-api-key-here",
				"AQG_AGENT_ROLE": "executor"
			}
		}
	}
}
```

## Multi-Database Usage

When an agent has access to multiple databases, the `database_id` parameter becomes required. Without it, the API returns an error:

```json
{
	"error": "Multiple databases available -- specify database_id"
}
```

To find available database IDs, check the admin panel under the agent's database access list.

When the agent has access to exactly one database, `database_id` is optional and the system auto-resolves to that single database.

## Example Conversation

Below is an example of how Claude might use the MCP tools in a conversation:

**User:** "What tables do I have access to?"

**Claude (calls `mysql_list_tables`):**
> You have access to these tables: `orders`, `products`, `customers`.

**User:** "What columns does the orders table have?"

**Claude (calls `mysql_describe_table` with `table: "orders"`):**
> The `orders` table has these columns:
> - `id` (int, primary key, auto_increment)
> - `customer_id` (int, foreign key)
> - `status` (varchar(50), default: 'pending')
> - `total` (decimal(10,2))
> - `created_at` (datetime)

**User:** "Show me the 5 most recent pending orders."

**Claude (calls `mysql_query` with `sql: "SELECT id, customer_id, total, created_at FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5"`):**
> Here are the 5 most recent pending orders:
>
> | id | customer_id | total | created_at |
> |----|-------------|-------|------------|
> | 42 | 7 | 149.99 | 2024-03-15 |
> | 41 | 3 | 89.50 | 2024-03-14 |
> | ... | ... | ... | ... |

**User:** "Mark order 42 as shipped."

**Claude (calls `mysql_execute` with `sql: "UPDATE orders SET status = 'shipped' WHERE id = 42"`):**
> Done. Order 42 has been updated from 'pending' to 'shipped'. The change affected 1 row.

### Auditor Example Conversation

**User:** "Review the last hour of database mutations for anything suspicious."

**Claude (calls `audit_list_logs` with `op: "UPDATE"`, `from: "2026-05-28T09:00:00Z"`):**
> I found 12 UPDATE operations in the last hour. Let me check the details.

**Claude (calls `audit_get_log` for a suspicious entry):**
> This entry updated 47 rows in the `customers` table with reason "batch cleanup" but it changed the `email` column, which is unusual.

**Claude (calls `audit_create_review` with `flag_type: "data_anomaly"`, `severity: "high"`, `notes: "Bulk email change affecting 47 rows with vague reasoning"`):**
> I've flagged this audit entry as a high-severity data anomaly. An admin should review the before/after data snapshots to confirm whether this was intentional.

---

## Troubleshooting

**"Invalid or inactive API key"** -- Verify the API key is correct and the agent is active in the admin panel.

**"No database access configured"** -- The agent has not been granted access to any database. Use the admin panel to link a database to the agent.

**"Policy denied"** -- The query was blocked by a policy rule. Check that the agent has a policy for the table and operation being attempted.

**"Multiple databases available -- specify database_id"** -- The agent has access to more than one database. Pass the `database_id` parameter to specify which one to use.

## Related Documentation

- [API Reference](api-reference.md) -- full REST API documentation
- [Admin Guide](admin-guide.md) -- setting up agents and policies
- [Security](security.md) -- how the policy engine protects your data
