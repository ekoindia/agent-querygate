# API Reference

All endpoints are served from a single Hono application. Admin routes are prefixed with `/admin/api` and agent routes with `/api/v1`.

## Authentication Methods

- **JWT Cookie** -- Admin endpoints use an `httpOnly` cookie named `token` containing a signed JWT. Obtained via login or setup.
- **API Key** -- Agent endpoints authenticate via the `X-API-Key` header containing an `aqg_`-prefixed key.
- **Public** -- A few endpoints require no authentication (setup status, setup, login).

## Error Response Format

All errors return a consistent JSON shape:

```json
{
	"error": "Human-readable error message",
	"code": "MACHINE_CODE"
}
```

Common error codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `POLICY_DENIED` (403).

---

## Auth Endpoints

### GET /admin/api/auth/setup-status

Check whether initial setup has been completed.

- **Auth:** Public
- **Response:**
```json
{ "needsSetup": true }
```

---

### POST /admin/api/auth/setup

Create the first superadmin user. Only works when zero users exist.

- **Auth:** Public
- **Request Body:**
```json
{
	"name": "string (required)",
	"email": "string, valid email (required)",
	"password": "string, min 8 chars (required)"
}
```
- **Response (200):**
```json
{
	"user": {
		"id": "uuid",
		"email": "admin@example.com",
		"name": "Admin",
		"role": "superadmin"
	}
}
```
- **Sets:** `token` httpOnly cookie
- **Errors:** 400 if setup already completed

```bash
curl -X POST http://localhost:3000/admin/api/auth/setup \
	-H "Content-Type: application/json" \
	-d '{"name":"Admin","email":"admin@example.com","password":"securepass123"}'
```

---

### POST /admin/api/auth/login

Authenticate an existing user.

- **Auth:** Public
- **Request Body:**
```json
{
	"email": "string, valid email (required)",
	"password": "string (required)"
}
```
- **Response (200):**
```json
{
	"user": {
		"id": "uuid",
		"email": "admin@example.com",
		"name": "Admin",
		"role": "superadmin"
	}
}
```
- **Sets:** `token` httpOnly cookie (24h expiry)
- **Errors:** 401 for invalid credentials or disabled account

```bash
curl -X POST http://localhost:3000/admin/api/auth/login \
	-H "Content-Type: application/json" \
	-c cookies.txt \
	-d '{"email":"admin@example.com","password":"securepass123"}'
```

---

### POST /admin/api/auth/logout

Clear the authentication cookie.

- **Auth:** Public (cookie cleared regardless)
- **Response:**
```json
{ "ok": true }
```

---

### GET /admin/api/auth/me

Get the current authenticated user's info.

- **Auth:** JWT Cookie (gracefully returns null if missing/invalid)
- **Response (200):**
```json
{
	"user": {
		"id": "uuid",
		"email": "admin@example.com",
		"name": "Admin",
		"role": "superadmin"
	}
}
```
- **Response (no valid session):**
```json
{ "user": null }
```

---

## User Management

All user endpoints require JWT Cookie auth with `admin` or `superadmin` role.

### GET /admin/api/users

List all users.

- **Auth:** JWT Cookie (admin/superadmin only)
- **Response:**
```json
{
	"users": [
		{
			"id": "uuid",
			"email": "string",
			"name": "string",
			"role": "superadmin | admin | user",
			"isActive": true,
			"createdAt": "2024-01-01T00:00:00.000Z"
		}
	]
}
```

---

### POST /admin/api/users

Create a new user.

- **Auth:** JWT Cookie (admin/superadmin only)
- **Request Body:**
```json
{
	"name": "string (required)",
	"email": "string, valid email (required)",
	"password": "string, min 8 chars (required)",
	"role": "admin | user (required)"
}
```
- **Response (201):**
```json
{
	"user": {
		"id": "uuid",
		"email": "string",
		"name": "string",
		"role": "admin | user"
	}
}
```
- **Errors:** 400 if email already in use

---

### PUT /admin/api/users/:id

Update a user's profile.

- **Auth:** JWT Cookie (admin/superadmin only)
- **Request Body:**
```json
{
	"name": "string (optional)",
	"email": "string, valid email (optional)",
	"isActive": "boolean (optional)"
}
```
- **Response:**
```json
{ "ok": true }
```
- **Errors:** 404 if user not found

---

### PUT /admin/api/users/:id/role

Change a user's role.

- **Auth:** JWT Cookie (admin/superadmin only)
- **Request Body:**
```json
{
	"role": "admin | user (required)"
}
```
- **Response:**
```json
{ "ok": true }
```
- **Errors:** 403 if attempting to change superadmin role; 404 if user not found

---

### DELETE /admin/api/users/:id

Soft-delete a user (sets `isActive` to false).

- **Auth:** JWT Cookie (admin/superadmin only)
- **Response:**
```json
{ "ok": true }
```
- **Errors:** 403 if attempting to delete superadmin; 404 if user not found

---

## Database Management

All database endpoints require JWT Cookie auth. Regular users see only their own databases; admin/superadmin see all.

### GET /admin/api/databases

List databases (scoped by user role).

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"databases": [
		{
			"id": "uuid",
			"userId": "uuid",
			"name": "string",
			"host": "string",
			"port": 3306,
			"dbName": "string",
			"username": "string",
			"createdAt": "ISO datetime",
			"updatedAt": "ISO datetime"
		}
	]
}
```

---

### POST /admin/api/databases

Register a new target database. The password is encrypted with AES-256-GCM before storage.

- **Auth:** JWT Cookie
- **Request Body:**
```json
{
	"name": "string (required)",
	"host": "string (required)",
	"port": 3306,
	"dbName": "string (required)",
	"username": "string (required)",
	"password": "string (required)"
}
```
- **Response (201):**
```json
{
	"database": {
		"id": "uuid",
		"name": "string",
		"host": "string",
		"port": 3306,
		"dbName": "string",
		"username": "string"
	}
}
```

```bash
curl -X POST http://localhost:3000/admin/api/databases \
	-b cookies.txt \
	-H "Content-Type: application/json" \
	-d '{"name":"Production","host":"db.example.com","port":3306,"dbName":"myapp","username":"readonly","password":"secret"}'
```

---

### PUT /admin/api/databases/:id

Update database connection details. Clears the cached connection pool on change.

- **Auth:** JWT Cookie
- **Request Body:**
```json
{
	"name": "string (optional)",
	"host": "string (optional)",
	"port": "number (optional)",
	"dbName": "string (optional)",
	"username": "string (optional)",
	"password": "string (optional)"
}
```
- **Response:**
```json
{ "ok": true }
```

---

### DELETE /admin/api/databases/:id

Delete a database registration and close its connection pool.

- **Auth:** JWT Cookie
- **Response:**
```json
{ "ok": true }
```

---

### POST /admin/api/databases/:id/test-connection

Test connectivity to the target database (ping).

- **Auth:** JWT Cookie
- **Response:**
```json
{ "success": true }
```

---

### GET /admin/api/databases/:id/introspect

Retrieve the full schema (all tables and their column definitions) from the target database.

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"schema": {
		"users": [
			{ "Field": "id", "Type": "int", "Null": "NO", "Key": "PRI", "Default": null, "Extra": "auto_increment" }
		],
		"orders": [...]
	}
}
```

---

## Agent Management

All agent endpoints require JWT Cookie auth. Regular users see only their own agents; admin/superadmin see all.

### GET /admin/api/agents

List agents (scoped by user role).

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"agents": [
		{
			"id": "uuid",
			"userId": "uuid",
			"name": "string",
			"isActive": true,
			"createdAt": "ISO datetime"
		}
	]
}
```

---

### POST /admin/api/agents

Create a new agent. Returns the API key -- this is the only time it is shown in plaintext.

- **Auth:** JWT Cookie
- **Request Body:**
```json
{
	"name": "string (required)"
}
```
- **Response (201):**
```json
{
	"agent": {
		"id": "uuid",
		"name": "string",
		"isActive": true
	},
	"apiKey": "aqg_base64url-encoded-random-key"
}
```

```bash
curl -X POST http://localhost:3000/admin/api/agents \
	-b cookies.txt \
	-H "Content-Type: application/json" \
	-d '{"name":"Claude Agent"}'
```

---

### PUT /admin/api/agents/:id

Update agent name or active status.

- **Auth:** JWT Cookie
- **Request Body:**
```json
{
	"name": "string (optional)",
	"isActive": "boolean (optional)"
}
```
- **Response:**
```json
{ "ok": true }
```

---

### DELETE /admin/api/agents/:id

Delete an agent and its access records.

- **Auth:** JWT Cookie
- **Response:**
```json
{ "ok": true }
```

---

### POST /admin/api/agents/:id/regenerate-key

Generate a new API key for an agent (invalidates the old key immediately).

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"apiKey": "aqg_new-base64url-encoded-random-key"
}
```

---

### GET /admin/api/agents/:id/databases

List database access records for an agent.

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"databases": [
		{
			"id": "uuid",
			"agentId": "uuid",
			"databaseId": "uuid"
		}
	]
}
```

---

### POST /admin/api/agents/:id/databases/:dbId

Grant an agent access to a database. Idempotent -- returns existing record if already granted.

- **Auth:** JWT Cookie
- **Response (201):**
```json
{
	"access": {
		"id": "uuid",
		"agentId": "uuid",
		"databaseId": "uuid"
	}
}
```

---

### DELETE /admin/api/agents/:id/databases/:dbId

Revoke an agent's access to a database.

- **Auth:** JWT Cookie
- **Response:**
```json
{ "ok": true }
```

---

## Policy Management

Policies control what an agent can do on a specific table within a specific database. The route for listing/creating policies is nested under the agent-database relationship. The policy routes are mounted at `/admin/api` (not `/admin/api/policies`).

### GET /admin/api/agents/:agentId/databases/:dbId/policies

List all policies for an agent-database pair.

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"policies": [
		{
			"id": "uuid",
			"agentDatabaseAccessId": "uuid",
			"tableName": "orders",
			"allowedOperations": ["SELECT", "INSERT"],
			"allowedColumns": ["id", "status", "total"] | null,
			"rowLimit": 100 | null,
			"whereClauseRequired": false,
			"customRules": {},
			"createdAt": "ISO datetime",
			"updatedAt": "ISO datetime"
		}
	]
}
```

---

### POST /admin/api/agents/:agentId/databases/:dbId/policies

Create a new policy for an agent-database pair.

- **Auth:** JWT Cookie
- **Request Body:**
```json
{
	"tableName": "string (required)",
	"allowedOperations": ["SELECT", "INSERT", "UPDATE", "DELETE"],
	"allowedColumns": ["col1", "col2"] | null,
	"rowLimit": 100 | null,
	"whereClauseRequired": false,
	"customRules": {}
}
```
- **Response (201):**
```json
{
	"policy": {
		"id": "uuid",
		"agentDatabaseAccessId": "uuid",
		"tableName": "orders",
		"allowedOperations": ["SELECT"],
		"allowedColumns": null,
		"rowLimit": null,
		"whereClauseRequired": false,
		"customRules": {}
	}
}
```

```bash
curl -X POST http://localhost:3000/admin/api/agents/{agentId}/databases/{dbId}/policies \
	-b cookies.txt \
	-H "Content-Type: application/json" \
	-d '{"tableName":"orders","allowedOperations":["SELECT"],"rowLimit":1000,"whereClauseRequired":false}'
```

---

### PUT /admin/api/policies/:id

Update an existing policy.

- **Auth:** JWT Cookie
- **Request Body:**
```json
{
	"tableName": "string (optional)",
	"allowedOperations": ["SELECT", "UPDATE"] (optional),
	"allowedColumns": ["col1"] | null (optional),
	"rowLimit": 50 | null (optional),
	"whereClauseRequired": true (optional),
	"customRules": {} (optional)
}
```
- **Response:**
```json
{ "ok": true }
```

---

### DELETE /admin/api/policies/:id

Delete a policy.

- **Auth:** JWT Cookie
- **Response:**
```json
{ "ok": true }
```

---

## Audit

All audit endpoints require JWT Cookie auth. Regular users see only their own logs; admin/superadmin see all.

### GET /admin/api/audit

List audit logs with pagination and filtering.

- **Auth:** JWT Cookie
- **Query Parameters:**
  - `page` -- Page number (default: 1)
  - `limit` -- Results per page (default: 50, max: 100)
  - `agent` -- Filter by agent ID
  - `db` -- Filter by database ID
  - `op` -- Filter by operation type (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
  - `status` -- Filter by status (`allowed`, `denied`, `error`)
  - `from` -- Filter logs from this ISO datetime
  - `to` -- Filter logs until this ISO datetime
- **Response:**
```json
{
	"logs": [
		{
			"id": "uuid",
			"agentId": "uuid",
			"databaseId": "uuid",
			"userId": "uuid",
			"sqlQuery": "SELECT * FROM orders WHERE id = 1",
			"operationType": "SELECT",
			"status": "allowed",
			"affectedRows": null,
			"dataBefore": null,
			"dataAfter": null,
			"policyId": "uuid",
			"denialReason": null,
			"executionTimeMs": 12,
			"createdAt": "ISO datetime"
		}
	],
	"pagination": {
		"page": 1,
		"limit": 50,
		"total": 142,
		"totalPages": 3
	}
}
```

```bash
curl "http://localhost:3000/admin/api/audit?status=denied&limit=10" \
	-b cookies.txt
```

---

### GET /admin/api/audit/export

Export audit logs as CSV. Supports the same query filters as the list endpoint.

- **Auth:** JWT Cookie
- **Query Parameters:** Same as `GET /admin/api/audit` (except `page` and `limit`)
- **Response:** CSV file download (`Content-Type: text/csv`)
- **Note:** CSV values are escaped to prevent formula injection.

---

### GET /admin/api/audit/:id

Get a single audit log entry with full details (including `dataBefore` and `dataAfter` snapshots).

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"log": {
		"id": "uuid",
		"agentId": "uuid",
		"databaseId": "uuid",
		"userId": "uuid",
		"sqlQuery": "UPDATE orders SET status='shipped' WHERE id = 5",
		"operationType": "UPDATE",
		"status": "allowed",
		"affectedRows": 1,
		"dataBefore": [{ "id": 5, "status": "pending" }],
		"dataAfter": [{ "id": 5, "status": "shipped" }],
		"policyId": "uuid",
		"denialReason": null,
		"executionTimeMs": 45,
		"createdAt": "ISO datetime"
	}
}
```

---

## Dashboard

### GET /admin/api/dashboard/stats

Get aggregate statistics for the dashboard. Values are scoped by user role.

- **Auth:** JWT Cookie
- **Response:**
```json
{
	"stats": {
		"queriesToday": 142,
		"deniedToday": 3,
		"activeAgents": 5,
		"totalDatabases": 2
	}
}
```

---

## Agent API

These endpoints are used by AI agents (or the MCP server) to query and mutate data. All require the `X-API-Key` header.

### POST /api/v1/query

Execute a read-only SQL query (SELECT only).

- **Auth:** API Key (`X-API-Key` header)
- **Request Body:**
```json
{
	"sql": "SELECT * FROM orders WHERE status = 'pending' LIMIT 10",
	"database_id": "uuid (optional -- required if agent has access to multiple databases)"
}
```
- **Response:**
```json
{
	"columns": ["id", "status", "total", "created_at"],
	"rows": [
		{ "id": 1, "status": "pending", "total": 99.99, "created_at": "2024-01-15T10:00:00.000Z" }
	],
	"rowCount": 1
}
```
- **Errors:**
  - 400: SQL parse failure, non-SELECT query sent to this endpoint
  - 403: Policy denied (blocked keyword, no table policy, operation not allowed, column restriction, missing WHERE clause)

```bash
curl -X POST http://localhost:3000/api/v1/query \
	-H "Content-Type: application/json" \
	-H "X-API-Key: aqg_your-api-key-here" \
	-d '{"sql":"SELECT id, status FROM orders LIMIT 5"}'
```

---

### POST /api/v1/execute

Execute a write SQL statement (INSERT, UPDATE, DELETE). Returns before/after snapshots for audit.

- **Auth:** API Key (`X-API-Key` header)
- **Request Body:**
```json
{
	"sql": "UPDATE orders SET status = 'shipped' WHERE id = 5",
	"database_id": "uuid (optional)"
}
```
- **Response:**
```json
{
	"affected_rows": 1,
	"data_before": [{ "id": 5, "status": "pending", "total": 99.99 }],
	"data_after": [{ "id": 5, "status": "shipped", "total": 99.99 }]
}
```
- **Errors:**
  - 400: SQL parse failure, SELECT query sent to this endpoint
  - 403: Policy denied (same reasons as /query, plus row limit exceeded)

```bash
curl -X POST http://localhost:3000/api/v1/execute \
	-H "Content-Type: application/json" \
	-H "X-API-Key: aqg_your-api-key-here" \
	-d '{"sql":"INSERT INTO orders (status, total) VALUES ('"'"'pending'"'"', 42.00)"}'
```

---

### GET /api/v1/tables

List tables the agent has policy access to.

- **Auth:** API Key (`X-API-Key` header)
- **Query Parameters:**
  - `database_id` -- Target database (optional if agent has single database access)
- **Response:**
```json
{
	"tables": ["orders", "products", "customers"]
}
```

```bash
curl http://localhost:3000/api/v1/tables \
	-H "X-API-Key: aqg_your-api-key-here"
```

---

### GET /api/v1/tables/:name/schema

Get the column schema for a specific table (runs `DESCRIBE`).

- **Auth:** API Key (`X-API-Key` header)
- **Query Parameters:**
  - `database_id` -- Target database (optional if agent has single database access)
- **Response:**
```json
{
	"columns": [
		{ "Field": "id", "Type": "int", "Null": "NO", "Key": "PRI", "Default": null, "Extra": "auto_increment" },
		{ "Field": "status", "Type": "varchar(50)", "Null": "NO", "Key": "", "Default": "pending", "Extra": "" }
	]
}
```

```bash
curl http://localhost:3000/api/v1/tables/orders/schema \
	-H "X-API-Key: aqg_your-api-key-here"
```

---

### GET /api/v1/health

Health check for the authenticated agent.

- **Auth:** API Key (`X-API-Key` header)
- **Response:**
```json
{
	"status": "ok",
	"agent": "Claude Agent"
}
```

```bash
curl http://localhost:3000/api/v1/health \
	-H "X-API-Key: aqg_your-api-key-here"
```
