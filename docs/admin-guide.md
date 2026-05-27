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
4. Click **Create**.
5. **Copy the API key immediately** -- it is shown only once and stored as a SHA-256 hash.

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
- **Data Before** -- snapshot of affected rows before the mutation
- **Data After** -- snapshot of affected rows after the mutation

Before/after snapshots are captured for UPDATE and DELETE operations (up to 1000 rows).

### CSV Export

Click **Export CSV** to download the filtered audit logs. The export:
- Applies the same filters as the current view
- Escapes values to prevent CSV formula injection (prefixes cells starting with `=`, `+`, `-`, `@`, tab, or carriage return)
- Downloads as `audit-logs.csv`

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
