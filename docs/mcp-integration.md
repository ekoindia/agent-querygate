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

The MCP server exposes 5 tools:

### mysql_query

Execute a read-only SQL query (SELECT) against the MySQL database.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sql` | string | Yes | The SQL SELECT query to execute |
| `database_id` | string | No | Target database ID (optional if agent has access to only one database) |

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

### mysql_execute

Execute a write SQL statement (INSERT, UPDATE, DELETE) against the MySQL database.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sql` | string | Yes | The SQL write statement to execute |
| `database_id` | string | No | Target database ID (optional if agent has access to only one database) |

**Example response:**
```json
{
	"affected_rows": 1,
	"data_before": [{ "id": 5, "status": "pending" }],
	"data_after": [{ "id": 5, "status": "shipped" }]
}
```

### mysql_list_tables

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

### mysql_describe_table

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

### mysql_health

Check the health status of the MySQL agent connection.

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
				"AQG_API_KEY": "aqg_your-api-key-here"
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
				"AQG_API_KEY": "aqg_your-api-key-here"
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
				"AQG_API_KEY": "aqg_your-api-key-here"
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

## Troubleshooting

**"Invalid or inactive API key"** -- Verify the API key is correct and the agent is active in the admin panel.

**"No database access configured"** -- The agent has not been granted access to any database. Use the admin panel to link a database to the agent.

**"Policy denied"** -- The query was blocked by a policy rule. Check that the agent has a policy for the table and operation being attempted.

**"Multiple databases available -- specify database_id"** -- The agent has access to more than one database. Pass the `database_id` parameter to specify which one to use.

## Related Documentation

- [API Reference](api-reference.md) -- full REST API documentation
- [Admin Guide](admin-guide.md) -- setting up agents and policies
- [Security](security.md) -- how the policy engine protects your data
