# Architecture

This document describes the system architecture, request flows, data model, and component breakdown of the Agent QueryGate.

## System Architecture

```
+---------------------------+         +----------------------------------+
|     Clients               |         |     QueryGate Service        |
|                           |         |                                  |
|  +-------------------+    |  HTTP   |  +----------------------------+  |
|  | Admin Browser UI  +----+-------->|  | Hono HTTP Server           |  |
|  +-------------------+    |         |  |   - /admin/api/* (JWT)     |  |
|                           |         |  |   - /api/v1/* (API Key)    |  |
|  +-------------------+    |  HTTP   |  |   - /* (Static SPA)        |  |
|  | AI Agent (MCP)    +----+-------->|  +----------------------------+  |
|  +-------------------+    |         |            |                     |
|                           |         |            v                     |
|  +-------------------+    |  HTTP   |  +----------------------------+  |
|  | AI Agent (direct) +----+-------->|  | Auth Middleware            |  |
|  +-------------------+    |         |  |   - adminAuth (JWT)        |  |
+---------------------------+         |  |   - agentAuth (API Key)    |  |
                                      |  +----------------------------+  |
                                      |            |                     |
                                      |            v                     |
                                      |  +----------------------------+  |
                                      |  | Policy Engine              |  |
                                      |  |   - Blocked Keywords       |  |
                                      |  |   - SQL Parser             |  |
                                      |  |   - Policy Evaluator       |  |
                                      |  |   - Row Limit Check        |  |
                                      |  +----------------------------+  |
                                      |            |                     |
                                      |            v                     |
                                      |  +----------------------------+  |
                                      |  | Query Executor             |  |
                                      |  |   - Read Path (SELECT)     |  |
                                      |  |   - Write Path (txn +      |  |
                                      |  |     snapshots)             |  |
                                      |  +----------------------------+  |
                                      |            |                     |
                                      +------------|---------------------+
                                                   |
                              +--------------------+--------------------+
                              |                                         |
                              v                                         v
                    +-------------------+                    +-------------------+
                    | Admin Database    |                    | Target Database(s)|
                    | (querygate_   |                    | (user MySQL DBs)  |
                    |  admin)           |                    |                   |
                    | - users           |                    | Managed via       |
                    | - databases       |                    | connection pools  |
                    | - agents          |                    |                   |
                    | - policies        |                    +-------------------+
                    | - audit_logs      |
                    | - agent_database_ |
                    |   access          |
                    +-------------------+
```

## Request Flow: Agent Query

Step-by-step flow when an AI agent executes a SELECT query:

```
Agent                    Service                          Target DB
  |                        |                                 |
  |-- POST /api/v1/query ->|                                 |
  |   X-API-Key: aqg_...   |                                 |
  |   {sql, database_id}   |                                 |
  |                        |                                 |
  |                        |-- 1. agentAuth middleware        |
  |                        |   Hash API key (SHA-256)         |
  |                        |   Lookup in agents table         |
  |                        |   Verify isActive = true         |
  |                        |                                 |
  |                        |-- 2. checkBlockedKeywords()      |
  |                        |   Scan for DDL, GRANT, etc.      |
  |                        |                                 |
  |                        |-- 3. parseSql()                  |
  |                        |   Parse AST via node-sql-parser  |
  |                        |   Extract operation, tables,     |
  |                        |   columns, hasWhere              |
  |                        |                                 |
  |                        |-- 4. resolveDatabase()           |
  |                        |   Find target DB record          |
  |                        |   (auto-resolve if single)       |
  |                        |                                 |
  |                        |-- 5. Lookup access + policies    |
  |                        |   agent_database_access table    |
  |                        |   policies table                 |
  |                        |                                 |
  |                        |-- 6. evaluatePolicy()            |
  |                        |   Check table has policy         |
  |                        |   Check operation allowed        |
  |                        |   Check columns allowed          |
  |                        |   Check WHERE requirement        |
  |                        |                                 |
  |                        |-- 7. writeAuditLog()             |
  |                        |   Log query + policy result      |
  |                        |                                 |
  |                        |-- 8. getTargetPool()             |
  |                        |   Get/create connection pool     |
  |                        |   Decrypt password (AES-256-GCM) |
  |                        |                                 |
  |                        |-- 9. executeReadQuery() -------->|
  |                        |                                 |-- Execute SQL
  |                        |<-- rows, columns, rowCount ------|
  |                        |                                 |
  |<-- {columns, rows,     |                                 |
  |     rowCount}           |                                 |
```

## Request Flow: Admin Action

When an admin creates a database via the admin panel:

```
Browser                  Service                          Admin DB
  |                        |                                 |
  |-- POST /admin/api/     |                                 |
  |   databases            |                                 |
  |   Cookie: token=jwt... |                                 |
  |   {name, host, ...}    |                                 |
  |                        |                                 |
  |                        |-- 1. adminAuth middleware        |
  |                        |   Extract JWT from cookie        |
  |                        |   Verify signature + expiry      |
  |                        |   Lookup user, check isActive    |
  |                        |                                 |
  |                        |-- 2. Zod validation              |
  |                        |   Validate request body schema   |
  |                        |                                 |
  |                        |-- 3. encrypt(password)           |
  |                        |   AES-256-GCM encryption         |
  |                        |                                 |
  |                        |-- 4. INSERT into databases ----->|
  |                        |                                 |
  |<-- 201 {database}      |                                 |
```

## Data Model

### ER Diagram

```
+------------------+       +------------------+       +------------------+
|     users        |       |    databases     |       |     agents       |
+------------------+       +------------------+       +------------------+
| id (PK, UUID)   |<--+   | id (PK, UUID)   |   +-->| id (PK, UUID)   |
| email (unique)   |   |   | userId (FK) ----+---+   | userId (FK) ----+--->users.id
| passwordHash     |   |   | name             |   |   | name             |
| name             |   |   | host             |   |   | apiKeyHash       |
| role (enum)      |   |   | port             |   |   | isActive         |
| createdBy (FK)---+---+   | dbName           |   |   | createdAt        |
| isActive         |   |   | username         |   |   | updatedAt        |
| createdAt        |   |   | passwordEncrypted|   |   +--------+---------+
| updatedAt        |   |   | createdAt        |   |            |
+--------+---------+   |   | updatedAt        |   |            |
         |             |   +--------+---------+   |            |
         |             |            |              |            |
         |             |            |              |            |
         |             |            v              |            v
         |             |   +---------------------+ |   +---------------------+
         |             |   | agent_database_     | |   | agent_database_     |
         |             |   | access              | |   | access              |
         |             |   +---------------------+ |   +---------------------+
         |             |   | id (PK, UUID)       | |   | (same table)        |
         |             |   | agentId (FK) -------+-+   +----------+----------+
         |             |   | databaseId (FK) ----+                 |
         |             |   | (unique: agentId +  |                 |
         |             |   |  databaseId)        |                 |
         |             |   +----------+----------+                 |
         |             |              |                             |
         |             |              v                             |
         |             |   +---------------------+                 |
         |             |   |     policies        |                 |
         |             |   +---------------------+                 |
         |             |   | id (PK, UUID)       |                 |
         |             |   | agentDatabaseAccess |                 |
         |             |   |   Id (FK) ----------+-----------------+
         |             |   | tableName           |
         |             |   | allowedOperations   |
         |             |   |   (JSON array)      |
         |             |   | allowedColumns      |
         |             |   |   (JSON array|null) |
         |             |   | rowLimit (int|null) |
         |             |   | whereClauseRequired |
         |             |   | customRules (JSON)  |
         |             |   | createdAt           |
         |             |   | updatedAt           |
         |             |   +---------------------+
         |             |
         v             v
+---------------------------+
|       audit_logs          |
+---------------------------+
| id (PK, UUID)             |
| agentId (FK) --> agents   |
| databaseId (FK) --> dbs   |
| userId (FK) --> users     |
| sqlQuery (text)           |
| operationType (enum)      |
| status (enum)             |
| affectedRows (int|null)   |
| dataBefore (JSON|null)    |
| dataAfter (JSON|null)     |
| policyId (varchar|null)   |
| denialReason (text|null)  |
| executionTimeMs (int|null)|
| createdAt                 |
+---------------------------+
```

### Tables Summary

| Table | Purpose | Key Design Decision |
|---|---|---|
| `users` | Admin panel accounts | Soft-delete via `isActive` flag |
| `databases` | Target database connection configs | Password stored encrypted (AES-256-GCM) |
| `agents` | AI agent identities | API key stored as SHA-256 hash |
| `agent_database_access` | Many-to-many junction: agent <-> database | Unique index on (agentId, databaseId) |
| `policies` | Per-table access rules for an agent-database pair | JSON columns for flexible operations/columns lists |
| `audit_logs` | Immutable query log | JSON columns for before/after snapshots |

### Key Design Decisions

- **UUID Primary Keys:** All tables use UUID v4 strings (36 chars) for primary keys. This avoids auto-increment leakage and supports distributed generation.
- **JSON Columns:** `allowedOperations`, `allowedColumns`, `customRules`, `dataBefore`, `dataAfter` use MySQL JSON type for flexible, schema-less data within structured tables.
- **Junction Table:** `agent_database_access` decouples the many-to-many relationship between agents and databases, and serves as the foreign key for policies (allowing per-agent-per-database policy sets).
- **Soft Delete for Users:** Users are deactivated (`isActive = false`) rather than hard-deleted to preserve audit log referential integrity.

## Component Breakdown

### Policy Engine (`src/policy/`)

The policy engine is the core security component. It processes queries through a pipeline:

```
Raw SQL
  |
  v
checkBlockedKeywords() -- reject DDL, GRANT, multi-statement, LOAD DATA, INTO OUTFILE
  |
  v
parseSql() -- AST via node-sql-parser, extract operation/tables/columns/hasWhere
  |
  v
evaluatePolicy() -- check each table against policy records (default-deny)
  |
  v
getPolicyRowLimit() -- determine row limit for write operations
  |
  v
countAffectedRows() -- pre-flight count for row limit enforcement
```

Files:
- `blocked-keywords.ts` -- regex-based dangerous pattern detection
- `sql-parser.ts` -- SQL to structured `ParsedQuery` via `node-sql-parser`
- `engine.ts` -- policy evaluation logic and row limit extraction

### Query Executor (`src/query/`)

Handles actual SQL execution against target databases:

- **Read path:** Direct `pool.query()` returning rows and column metadata.
- **Write path:** Transaction with before/after snapshots:
  1. `BEGIN TRANSACTION`
  2. `captureBeforeSnapshot()` -- SELECT matching rows before mutation
  3. Execute the write query
  4. `captureAfterSnapshot()` -- SELECT matching rows after mutation
  5. `COMMIT` (or `ROLLBACK` on error)

Files:
- `executor.ts` -- `executeReadQuery()`, `executeWriteQuery()`, `countAffectedRows()`
- `pool-manager.ts` -- per-database connection pool cache
- `snapshot.ts` -- before/after data capture for audit

### Pool Manager (`src/query/pool-manager.ts`)

Manages an in-memory `Map<databaseId, mysql.Pool>`:

- Pools are created lazily on first access.
- Each pool has a connection limit of 5.
- Pools are removed when a database is deleted or its credentials are updated.
- `closeAllPools()` is available for graceful shutdown.
- Passwords are decrypted from storage at pool creation time only.

### Audit Logger (`src/audit/logger.ts`)

Writes structured audit log entries to the admin database:

- Called asynchronously (does not block the response in some paths).
- Captures: agent, database, user, query, policy result, snapshots, timing.
- Status is derived from the entry: `error` if an error field is present, `denied` if policy rejected, `allowed` otherwise.

### Auth Layer (`src/auth/`)

- `jwt.ts` -- sign and verify JWTs with `jsonwebtoken`
- `api-key.ts` -- generate (`aqg_` + 32 random bytes), hash (SHA-256), verify
- `password.ts` -- bcrypt hash (12 rounds) and verify
- `middleware.ts` -- Hono middleware: `adminAuth`, `adminOnlyAuth`, `agentAuth`

### MCP Server (`src/mcp/server.ts`)

A thin adapter layer that:
- Creates a `McpServer` instance with 5 registered tools
- Each tool maps to a REST API call via `fetch()`
- Runs via `StdioServerTransport` for use as a subprocess
- Stateless -- all logic is in the main service

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| HTTP Framework | Hono | Lightweight, fast, TypeScript-first, works with Node.js |
| Database ORM | Drizzle ORM | Type-safe, zero-overhead SQL generation, MySQL support |
| SQL Parser | node-sql-parser | Full MySQL AST parsing for policy enforcement |
| Auth (JWT) | jsonwebtoken | Industry-standard JWT implementation |
| Auth (passwords) | bcryptjs | Proven password hashing with configurable rounds |
| Encryption | Node.js crypto (AES-256-GCM) | Built-in, authenticated encryption |
| Validation | Zod | Runtime schema validation with TypeScript inference |
| MCP SDK | @modelcontextprotocol/sdk | Official MCP protocol implementation |
| MySQL Driver | mysql2 | Performant MySQL client with promise API |
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui | Modern SPA stack with component library |
| Testing | Vitest | Fast, Vite-native test runner |
| IDs | uuid (v4) | Distributed, non-sequential identifiers |

## Related Documentation

- [Getting Started](getting-started.md) -- setup and installation
- [Security](security.md) -- detailed security analysis
- [Development](development.md) -- contributing and extending the system
- [API Reference](api-reference.md) -- endpoint documentation
