# Admin Guide

This guide covers day-to-day administration of the Agent QueryGate through the web-based admin panel.

## First-Time Setup

When you first access the admin panel at `http://localhost:3000`, the system detects that no users exist and presents the setup form. Fill in:

1. **Name** -- your display name
2. **Email** -- used for login
3. **Password** -- minimum 8 characters

This creates a `superadmin` account and logs you in immediately. The setup endpoint cannot be used again once a user exists.

## User Roles and Permissions

The system has three roles with a strict hierarchy:

| Action | Superadmin | Admin | User |
|---|:---:|:---:|:---:|
| See all users | Yes | Yes | No |
| Create users | Yes | Yes | No |
| Promote/demote users | Yes | Yes | No |
| Change superadmin role | No | No | No |
| Delete users | Yes | Yes | No |
| See all databases | Yes | Yes | Own only |
| Manage all databases | Yes | Yes | Own only |
| See all agents | Yes | Yes | Own only |
| Manage all agents | Yes | Yes | Own only |
| View all audit logs | Yes | Yes | Own only |
| Access dashboard | Yes | Yes | Yes (scoped) |

Key notes:
- The `superadmin` role cannot be changed or deleted by anyone, including itself.
- Admins can create users with `admin` or `user` roles.
- Regular users (`user` role) can only see and manage resources they own (databases, agents, audit logs).
- Dashboard statistics are scoped -- regular users see only their own metrics.

## Database Management

### Adding a Database

1. Navigate to **Databases** in the sidebar.
2. Click **Add Database**.
3. Fill in the connection details:
   - **Name** -- a friendly label (e.g., "Production Orders DB")
   - **Host** -- MySQL server hostname or IP
   - **Port** -- MySQL port (default 3306)
   - **Database Name** -- the MySQL database/schema name
   - **Username** -- MySQL user for the connection
   - **Password** -- MySQL password (encrypted at rest with AES-256-GCM)
4. Click **Save**.

### Testing Connectivity

After adding a database, use the **Test Connection** button. This creates a temporary connection, pings the server, and reports success or failure. It does not use the connection pool.

### Introspecting Schema

The **Introspect** feature connects to the database and retrieves all table names and their column definitions (via `SHOW TABLES` and `DESCRIBE`). This is useful when setting up policies -- you can see exactly what tables and columns are available.

### Editing and Deleting

- Edit a database to update connection details. Changing any field invalidates the cached connection pool.
- Deleting a database removes it from the system and closes any active connection pool.

## Agent Management

Agents represent AI assistants or automated systems that interact with your databases through the Agent API.

### Creating an Agent

1. Navigate to **Agents** in the sidebar.
2. Click **Create Agent**.
3. Enter a descriptive name (e.g., "Claude Desktop - Orders").
4. Select the **role**:
   - **Executor** (default) -- can run SQL queries and mutations against target databases.
   - **Auditor** -- can only read audit logs and create review/flags. Cannot execute any SQL.
5. Click **Create**.
6. **Copy the API key immediately** -- it is shown only once and stored as a SHA-256 hash.

### API Key Lifecycle

- **Generation:** A new key is created with the `aqg_` prefix followed by 32 random bytes (base64url-encoded).
- **Storage:** Only the SHA-256 hash is stored. The plaintext key cannot be recovered.
- **Rotation:** Use **Regenerate Key** to generate a new key. The old key is invalidated immediately.
- **Revocation:** Deactivate the agent (set `isActive` to false) to revoke all access without deleting the agent record.

### Granting Database Access

After creating an agent, link it to one or more databases:

1. Open the agent's detail page.
2. Click **Add Database Access**.
3. Select the target database from the list.

An agent can access multiple databases. When using the Agent API, the `database_id` parameter determines which database to query. If an agent has access to exactly one database, the parameter is optional.

### Deactivating an Agent

Toggle the **Active** status to disable an agent. Inactive agents cannot authenticate via API key.

## Policy Configuration

Policies define what an agent can do on each table within a specific database. Without a policy for a table, all queries to that table are denied (default-deny model).

### Creating a Policy

1. Navigate to the agent's policies page (via **Agents** > select agent > **Policies**).
2. Select the database.
3. Click **Add Policy**.
4. Configure:
   - **Table Name** -- the exact MySQL table name this policy governs
   - **Allowed Operations** -- one or more of: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
   - **Allowed Columns** -- restrict which columns can be accessed (leave empty/null for all columns)
   - **Row Limit** -- maximum number of rows a write operation can affect (leave null for no limit)
   - **WHERE Clause Required** -- if enabled, `UPDATE` and `DELETE` must include a `WHERE` clause
   - **Custom Rules** -- JSON object for future extensibility
5. Click **Save**.

### Example Policy Configurations

**Read-only access to a table:**
- Table: `orders`
- Operations: `SELECT`
- Columns: null (all)
- Row Limit: null
- WHERE Required: false

**Restricted write access:**
- Table: `orders`
- Operations: `SELECT`, `UPDATE`
- Columns: `["id", "status"]`
- Row Limit: 10
- WHERE Required: true

This allows the agent to read any column and update only the `status` column, limited to 10 rows per query, and only with a WHERE clause.

### Value Validation

Value validation constrains **what values** agents can write to columns, not just **which columns** they can access. This prevents AI agents from writing semantically dangerous values (e.g., setting `role = 'superadmin'`) even when they have column-level access.

Configure value validation in the **Custom Rules** field of a policy, under the `columnValidation` key:

```json
{
	"columnValidation": {
		"status": [
			{ "type": "enum", "values": ["active", "inactive", "suspended"] }
		],
		"email": [
			{ "type": "notNull" },
			{ "type": "pattern", "regex": "^[^@]+@[^@]+\\.[^@]+$" }
		],
		"age": [
			{ "type": "min", "value": 0 },
			{ "type": "max", "value": 150 }
		]
	}
}
```

**Available rule types:**

| Rule | Purpose | Parameters |
|---|---|---|
| `enum` | Value must be one of the listed options | `values`: array of allowed strings, numbers, booleans, or null |
| `pattern` | Value must match the regex | `regex`: regex string (max 200 chars), optional `flags` |
| `min` | Numeric value must be >= threshold | `value`: minimum number |
| `max` | Numeric value must be <= threshold | `value`: maximum number |
| `notNull` | Value must not be null | -- |

Multiple rules can be applied to the same column. All rules must pass for a value to be accepted.

**How it works:**

1. **Pre-execution:** Literal values in the SQL (strings, numbers, booleans, null) are validated before the query runs. If a literal value violates a rule, the query is denied immediately.
2. **Post-execution:** After the query executes (but before the transaction commits), the actual database values are validated. If validation fails, the transaction is rolled back. This catches values from expressions, functions, and subqueries that couldn't be checked pre-execution.

**Self-correction:** When validation fails, the error response includes detailed violation information (which column failed, what value was rejected, what the rule expects). This enables AI agents to understand the constraint and retry with a corrected value.

**Example policy with value validation:**

- Table: `users`
- Operations: `SELECT`, `UPDATE`
- Columns: `["status", "email", "age"]`
- WHERE Required: true
- Custom Rules:
  ```json
  {
  	"columnValidation": {
  		"status": [{ "type": "enum", "values": ["active", "inactive", "suspended"] }],
  		"email": [{ "type": "notNull" }, { "type": "pattern", "regex": "^[^@]+@[^@]+\\.[^@]+$" }],
  		"age": [{ "type": "min", "value": 0 }, { "type": "max", "value": 150 }]
  	}
  }
  ```

This allows the agent to update only `status`, `email`, and `age` columns, with a WHERE clause, and the values must conform to the defined constraints.

**Edge cases to be aware of:**

- **Expression values** (e.g., `NOW()`, `price * 1.1`, subqueries): Cannot be validated pre-execution. They are validated post-execution before the transaction commits.
- **INSERT ... SELECT**: All values come from a subquery and are validated post-execution only.
- **Columns without rules**: Any value is allowed. Only columns with explicit rules are constrained.
- **Regex patterns**: Capped at 200 characters to prevent denial-of-service via complex patterns. Invalid regex patterns are skipped with a warning.
- **Empty customRules**: When `customRules` is `{}` or omitted, no value validation is performed (backward compatible).

### Policy Evaluation Logic

When a query arrives:
1. The SQL is parsed to extract operation, tables, and columns.
2. For each table in the query, a matching policy must exist.
3. The operation must be in `allowedOperations`.
4. If `allowedColumns` is set, all queried columns must be in the list.
5. If `whereClauseRequired` is true and the operation is UPDATE/DELETE, a WHERE clause must be present.
6. If `rowLimit` is set, the system counts affected rows before executing the write.

If any check fails, the query is denied and logged in the audit trail.

## Audit Log

Every query that passes through the Agent API is logged, whether it was allowed, denied, or resulted in an error.

### Viewing Logs

Navigate to **Audit** in the sidebar. The log table shows:
- Timestamp
- Agent name
- Database
- SQL query
- Operation type (SELECT, INSERT, UPDATE, DELETE)
- Status (allowed, denied, error)
- Affected rows (for writes)
- Reason (agent-supplied reasoning for the operation, if provided)
- Execution time

### Filtering

Use the filter controls to narrow results:
- **Agent** -- show logs from a specific agent
- **Database** -- show logs for a specific database
- **Operation** -- filter by SQL operation type
- **Status** -- filter by allowed/denied/error
- **Date Range** -- from/to date filters

### Expanding Log Details

Click on a log entry to see full details, including:
- The complete SQL query
- Denial reason (if denied)
- Agent reasoning (why the agent performed the operation)
- **Data Before** -- snapshot of affected rows before the mutation
- **Data After** -- snapshot of affected rows after the mutation
- **Reviews** -- any flags/reviews attached to this log entry

Before/after snapshots are captured for UPDATE and DELETE operations (up to 1000 rows).

### CSV Export

Click **Export CSV** to download the filtered audit logs. The export:
- Applies the same filters as the current view
- Escapes values to prevent CSV formula injection (prefixes cells starting with `=`, `+`, `-`, `@`, tab, or carriage return)
- Downloads as `audit-logs.csv`

## Audit Reviews

Audit log entries can be flagged with reviews by both AI auditor agents and human administrators.

### Creating a Review

From the audit log detail view, click **Add Review** and fill in:
- **Flag Type** -- categorize the issue:
  - `suspicious_pattern` -- unusual query patterns
  - `policy_violation` -- potential policy circumvention
  - `data_anomaly` -- unexpected data changes
  - `performance_concern` -- slow or resource-heavy operations
  - `manual_review` -- general review or resolution note
- **Severity** -- `low`, `medium`, `high`, or `critical`
- **Notes** -- optional free-text explanation

### Review Workflow

Reviews are **append-only**. You cannot edit or delete a review once created. To resolve a flag or mark it as a false positive, create a new review with `flag_type: manual_review` and explanatory notes.

Reviews created from the admin panel have `reviewerType: human`. Reviews created by auditor agents have `reviewerType: ai`.

### Setting Up an Auditor Agent

To automate audit review:
1. Create an agent with **role: auditor**.
2. Configure its MCP server with `AQG_AGENT_ROLE=auditor`.
3. The auditor agent can search audit logs, inspect entries, and create reviews programmatically.
4. The auditor cannot read its own audit trail, ensuring separation of concerns.

---

## Dashboard

The dashboard provides an at-a-glance overview:

- **Queries Today** -- total queries processed since midnight
- **Denied Today** -- queries blocked by policy since midnight
- **Active Agents** -- number of currently active agents
- **Total Databases** -- number of registered databases

All values are scoped by the current user's role (regular users see only their own data).

## Related Documentation

- [Getting Started](getting-started.md) -- installation and initial setup
- [API Reference](api-reference.md) -- full endpoint documentation
- [Security](security.md) -- security architecture and best practices
- [MCP Integration](mcp-integration.md) -- connecting AI assistants
