# Eko MySQL Agent Connector Service — Design Spec

## Overview

Security broker between AI agents and MySQL databases. Provides policy-based guardrails, audit logging with data diffs, and an admin GUI for managing users, databases, agents, and policies.

## Architecture

Single TypeScript monolith on Hono serving:
- **Agent REST API** (`/api/v1/*`) — query/execute with policy enforcement
- **MCP wrapper** — thin layer exposing same capabilities as MCP tools (stdio + SSE transport)
- **Admin API** (`/admin/api/*`) — user/database/agent/policy/audit management
- **Admin GUI** — React SPA served as static files from same origin

```
┌──────────┐   ┌──────────┐   ┌──────────────┐
│ AI Agent │   │ AI Agent │   │  Admin User  │
│  (REST)  │   │  (MCP)   │   │  (Browser)   │
└────┬─────┘   └────┬─────┘   └──────┬───────┘
     │              │                │
     ▼              ▼                ▼
┌────────────────────────────────────────────┐
│              Hono Server                   │
│                                            │
│  Agent Routes ◄─► Policy Engine            │
│  Admin Routes ◄─► Admin Service            │
│  MCP Server   ◄─► (delegates to services)  │
│                                            │
│  Auth Middleware (API key │ JWT)            │
│  Audit Logger                              │
│  Query Executor + Snapshot Capture         │
│  Connection Pool Manager                   │
└──────────┬──────────────────┬──────────────┘
           │                  │
    ┌──────▼──────┐    ┌──────▼──────┐
    │ Target      │    │  Admin DB   │
    │ MySQL DBs   │    │             │
    └─────────────┘    └─────────────┘
```

## Tech Stack

| Concern | Choice |
|---------|--------|
| Server | Hono |
| ORM | Drizzle ORM |
| SQL parsing | node-sql-parser |
| Auth (admin) | JWT in httpOnly cookie |
| Auth (agent) | API key (SHA-256 hash) |
| DB credential encryption | AES-256-GCM |
| Frontend | React + Vite + shadcn/ui + Tailwind v4 |
| MCP SDK | @modelcontextprotocol/sdk |
| Validation | Zod |

## Data Model

### users

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| email | VARCHAR | unique |
| password_hash | VARCHAR | bcrypt |
| name | VARCHAR | |
| role | ENUM('superadmin','admin','user') | |
| created_by | UUID | FK → users, nullable (null for initial superadmin) |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### databases

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users (owner) |
| name | VARCHAR | display label |
| host | VARCHAR | |
| port | INT | default 3306 |
| db_name | VARCHAR | |
| username | VARCHAR | |
| password_encrypted | VARCHAR | AES-256-GCM |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### agents

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users (owner) |
| name | VARCHAR | |
| api_key_hash | VARCHAR | SHA-256, never stored plain |
| is_active | BOOLEAN | default true |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### agent_database_access

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| agent_id | UUID | FK → agents |
| database_id | UUID | FK → databases |
| | | unique(agent_id, database_id) |

### policies

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| agent_database_access_id | UUID | FK → agent_database_access |
| table_name | VARCHAR | |
| allowed_operations | JSON | e.g. ["SELECT","INSERT","UPDATE"] |
| allowed_columns | JSON | nullable — null means all columns |
| row_limit | INT | nullable — max rows affected per query |
| where_clause_required | BOOLEAN | default false |
| custom_rules | JSON | extensible rules for future use |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### audit_logs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| agent_id | UUID | FK → agents |
| database_id | UUID | FK → databases |
| user_id | UUID | FK → users (agent owner) |
| sql_query | TEXT | |
| operation_type | ENUM('SELECT','INSERT','UPDATE','DELETE') | |
| status | ENUM('allowed','denied','error') | |
| affected_rows | INT | nullable |
| data_before | JSON | nullable — writes only |
| data_after | JSON | nullable — writes only |
| policy_id | UUID | FK → policies, nullable (null if denied before policy match) |
| denial_reason | TEXT | nullable |
| execution_time_ms | INT | nullable |
| created_at | TIMESTAMP | |

## User Roles & Access Control

### Role Hierarchy

- **superadmin** — one initial user, created at first-run setup. Sees all users and their resources. Creates users. Promotes/demotes admins.
- **admin** — promoted by superadmin or another admin. Same visibility as superadmin. Can create users. Can view and manage any user's databases, agents, policies. Cannot assign superadmin role.
- **user** — regular user. Sees and manages ONLY own databases, agents, policies, and audit logs. No visibility into other users or their resources.

### First-Run Setup

On first boot, if no users exist in the database, the service presents a setup screen to create the superadmin account (name, email, password). This endpoint (`POST /admin/api/auth/setup`) is disabled once a superadmin exists.

### No Self-Signup

Users are created exclusively by admins/superadmins. The only public auth endpoint is login.

## Agent-Facing API

### REST API (`/api/v1/`)

Auth: `X-API-Key` header on all requests.

**POST /api/v1/query** — read operations
```json
Request:  { "sql": "SELECT ...", "database_id": "optional-if-single-db" }
Response: { "rows": [...], "columns": [...], "row_count": 0 }
```

**POST /api/v1/execute** — write operations
```json
Request:  { "sql": "UPDATE ...", "database_id": "optional-if-single-db" }
Response: { "affected_rows": 0, "data_before": [...], "data_after": [...] }
```

**GET /api/v1/tables** — list permitted tables
```json
Response: { "tables": ["orders", "products"] }
```

**GET /api/v1/tables/:name/schema** — describe permitted table
```json
Response: { "columns": [{ "name": "id", "type": "INT", "key": "PRI" }, ...] }
```

**GET /api/v1/health** — connection status
```json
Response: { "status": "ok", "agent": "agent-name", "database": "db-name" }
```

### MCP Tools

| Tool | Input | Output | Delegates to |
|------|-------|--------|-------------|
| mysql_query | `{ sql }` | `{ rows, columns, row_count }` | POST /api/v1/query |
| mysql_execute | `{ sql }` | `{ affected_rows, data_before, data_after }` | POST /api/v1/execute |
| mysql_list_tables | `{}` | `{ tables }` | GET /api/v1/tables |
| mysql_describe_table | `{ table }` | `{ columns }` | GET /api/v1/tables/:name/schema |
| mysql_health | `{}` | `{ status, agent, database }` | GET /api/v1/health |

Transports: stdio (local agents) and SSE (remote agents).

If agent has access to multiple databases, `database_id` parameter is required on all query/execute/list/describe tools and REST endpoints.

## Admin API

### Auth
```
POST   /admin/api/auth/setup          ← first-run only, creates superadmin
POST   /admin/api/auth/login           → returns JWT in httpOnly cookie
POST   /admin/api/auth/logout
```

### Users (admin+ only)
```
GET    /admin/api/users
POST   /admin/api/users               ← creates user with role
PUT    /admin/api/users/:id
PUT    /admin/api/users/:id/role       ← superadmin only for superadmin role
DELETE /admin/api/users/:id
```

### Databases
```
GET    /admin/api/databases
POST   /admin/api/databases
PUT    /admin/api/databases/:id
DELETE /admin/api/databases/:id
POST   /admin/api/databases/:id/test-connection
GET    /admin/api/databases/:id/introspect    → returns tables + columns
```

### Agents
```
GET    /admin/api/agents
POST   /admin/api/agents               → returns API key (shown once)
PUT    /admin/api/agents/:id
DELETE /admin/api/agents/:id
POST   /admin/api/agents/:id/regenerate-key   → invalidates old, returns new
```

### Agent-Database Access
```
GET    /admin/api/agents/:id/databases
POST   /admin/api/agents/:id/databases/:dbId
DELETE /admin/api/agents/:id/databases/:dbId
```

### Policies
```
GET    /admin/api/agents/:id/databases/:dbId/policies
POST   /admin/api/agents/:id/databases/:dbId/policies
PUT    /admin/api/policies/:id
DELETE /admin/api/policies/:id
```

### Audit
```
GET    /admin/api/audit?agent=&db=&from=&to=&op=&status=
GET    /admin/api/audit/:id
GET    /admin/api/audit/export          → CSV download
```

### Dashboard
```
GET    /admin/api/dashboard/stats
```

Resource scoping: regular users see only own resources. Admins/superadmins see all.

## Policy Engine

### Evaluation Flow

1. Parse SQL via node-sql-parser — reject if unparseable
2. Extract: operation, table(s), column(s), WHERE presence
3. Multi-table queries (JOINs): check policy for each table
4. Subqueries: recursive check
5. Policy lookup by agent + database + table — no policy = DENY
6. Check operation is in allowed_operations — else DENY
7. Check columns against allowed_columns — else DENY
8. Check WHERE clause if where_clause_required — else DENY
9. Row limit check: run `SELECT COUNT(*)` with same WHERE — exceed = DENY

### Default-Deny Model

If no policy exists for a table, access is blocked. Agents can only access explicitly granted tables.

### Blocked Operations (parser level)

- DDL: CREATE, ALTER, DROP, TRUNCATE
- Multi-statement queries (semicolons)
- LOAD DATA, INTO OUTFILE
- GRANT, REVOKE

## Admin GUI

### Pages

| Route | Description | Access |
|-------|-------------|--------|
| `/login` | Email + password | Public |
| `/setup` | First-run superadmin creation | Public (once) |
| `/dashboard` | Stats overview: queries today, denials, active agents/DBs | All users |
| `/databases` | CRUD target databases, test connection | All users (own) |
| `/agents` | CRUD agents, API key management (show once + rotate) | All users (own) |
| `/agents/:id/policies` | Configure per-table policies with introspect helper | All users (own) |
| `/audit` | Query log viewer, filters, expand for diffs, CSV export | All users (own) |
| `/users` | User management, create users, role assignment | Admin+ only |
| `/settings` | Profile, change password | All users |

### Design Direction

- Dark theme (primary)
- Clean, professional, catchy aesthetic
- shadcn/ui components with Tailwind v4
- Use Mobbin for design research before implementation

### Key UX Details

- API key displayed once in modal on agent creation, with copy button
- Regenerate key button on agent detail page with confirmation dialog
- Introspect button on policy config fetches real schema from target DB
- Audit log rows expandable to show full SQL + before/after data diff
- Dashboard cards with counts and simple trend indicators

## Project Structure

```
eko-mysql-agent-connector-service/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── .env.example
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── migrate.ts
│   │   └── connection.ts
│   ├── auth/
│   │   ├── jwt.ts
│   │   ├── api-key.ts
│   │   └── middleware.ts
│   ├── policy/
│   │   ├── engine.ts
│   │   ├── sql-parser.ts
│   │   └── blocked-keywords.ts
│   ├── query/
│   │   ├── executor.ts
│   │   ├── snapshot.ts
│   │   └── pool-manager.ts
│   ├── audit/
│   │   └── logger.ts
│   ├── routes/
│   │   ├── agent/
│   │   │   ├── query.ts
│   │   │   ├── execute.ts
│   │   │   ├── tables.ts
│   │   │   └── health.ts
│   │   └── admin/
│   │       ├── auth.ts
│   │       ├── databases.ts
│   │       ├── agents.ts
│   │       ├── policies.ts
│   │       ├── audit.ts
│   │       ├── users.ts
│   │       └── dashboard.ts
│   ├── mcp/
│   │   └── server.ts
│   └── lib/
│       ├── crypto.ts
│       └── errors.ts
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Setup.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Databases.tsx
│   │   │   ├── Agents.tsx
│   │   │   ├── AgentPolicies.tsx
│   │   │   ├── Audit.tsx
│   │   │   ├── Users.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   └── api.ts
│   │   └── types/
│   │       └── index.ts
│   └── tailwind.config.ts
├── drizzle/
│   └── migrations/
└── docs/
```

## Scope

### v1 (MVP)

- User auth (login only, admin-created accounts, role hierarchy)
- First-run superadmin setup
- CRUD databases + test connection + introspect
- CRUD agents + API key management (show once + rotate)
- Policy configuration per agent+database+table
- Query + execute with full policy enforcement
- Audit log with before/after data diffs
- Audit viewer with filters + CSV export
- Dashboard stats
- MCP wrapper (stdio + SSE)
- Dark-themed admin GUI (shadcn/ui + Tailwind v4)

### Later

- OAuth/SSO for admin users
- Connection health monitoring
- Agent usage quotas / rate limiting
- Policy templates / presets
- Query result caching
- Audit retention policies
- Webhook notifications on denials
- Light theme toggle

## Implementation Notes

- Use Context7 tool during implementation to fetch latest docs for all dependencies
- Use Mobbin tool before UI implementation for design research (dark admin dashboards)
- Database credentials encrypted with AES-256-GCM, key from environment variable
- Agent API keys hashed with SHA-256, never stored in plain text
- Admin JWT stored in httpOnly secure cookie
- Connection pools per target database, created on first use, cached in memory
- Write operations wrapped in transactions for snapshot capture
