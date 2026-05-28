# Security

This document describes the security architecture, authentication mechanisms, authorization model, encryption practices, and operational recommendations for the Agent QueryGate.

## Architecture Overview

```
+-------------------+       +------------------------+       +------------------+
|   AI Assistant    |       |   QueryGate        |       |   Target MySQL   |
|   (Claude, etc.)  |       |   Service              |       |   Databases      |
|                   |       |                        |       |                  |
|  X-API-Key -------+------>|  Policy Engine         |       |                  |
|                   |       |    |                   |       |                  |
+-------------------+       |    v                   |       |                  |
                            |  Blocked Keywords      |       |                  |
+-------------------+       |    |                   |       |                  |
|   Admin Users     |       |    v                   |       |                  |
|   (Browser)       |       |  SQL Parser            |       |                  |
|                   |       |    |                   |       |                  |
|  JWT Cookie ------+------>|    v                   |       |                  |
|                   |       |  Policy Evaluation ----+------>|  Query Execution |
+-------------------+       |    |                   |       |                  |
                            |    v                   |       |                  |
                            |  Audit Logger          |       |                  |
                            +------------------------+       +------------------+
```

The service acts as a security gateway between AI agents and your MySQL databases. Every query must pass through multiple validation layers before execution.

## Authentication

### JWT Authentication (Admin Users)

Admin users authenticate via the `/admin/api/auth/login` endpoint. On success:

- A JWT is signed with the configured `JWT_SECRET` using the `jsonwebtoken` library.
- The token is set as an **httpOnly** cookie with the following properties:
  - `httpOnly: true` -- not accessible via JavaScript (mitigates XSS)
  - `secure: true` in production (requires HTTPS)
  - `sameSite: "Lax"` -- CSRF protection for cross-origin requests
  - `path: "/"` -- available to all routes
  - `maxAge: 86400` (24 hours)
- The JWT payload contains: `userId`, `email`, `role`
- On each request, the `adminAuth` middleware extracts the cookie, verifies the JWT signature and expiry, and confirms the user is active in the database.

### API Key Authentication (Agents)

AI agents authenticate via the `X-API-Key` header. The key lifecycle:

1. **Generation:** `aqg_` prefix + 32 random bytes (base64url-encoded), producing a key like `aqg_AbCdEf...` (approximately 47 characters total).
2. **Storage:** Only the **SHA-256 hash** of the key is stored in the `agents.api_key_hash` column. The plaintext key is shown once at creation time and cannot be recovered.
3. **Verification:** On each request, the `agentAuth` middleware hashes the provided key with SHA-256 and looks it up in the database. Constant-time properties are achieved because both values being compared are fixed-length hex digests.
4. **Revocation:** Setting `isActive = false` on the agent immediately blocks all requests, even with a valid key.

## Authorization

### Role Hierarchy

```
superadmin > admin > user
```

- **superadmin** -- full system access, cannot be deleted or demoted
- **admin** -- can manage all users, databases, and agents
- **user** -- can only manage their own resources

### Resource Scoping (IDOR Protection)

Every CRUD endpoint applies ownership checks:

- Regular users (`user` role) can only access resources where `userId` matches their own.
- Admin/superadmin bypass ownership checks and see all resources.
- If a regular user attempts to access another user's resource, the response is `404 Not Found` (not `403 Forbidden`) to avoid information leakage.

### Agent Role Hierarchy

Agents have a separate role system from admin users:

```
executor -- can run queries and mutations (query, execute, tables, describe)
auditor  -- can read audit logs and create reviews (audit/logs, audit/reviews)
```

- **executor** agents are blocked from audit review endpoints (403).
- **auditor** agents are blocked from query execution endpoints (403).
- **auditor** agents cannot read their own audit trail -- a `ne(agentId)` filter is always applied. This prevents an agent from auditing itself.
- Both roles can access the health endpoint.

Role is set at agent creation and can be changed via the admin API.

### Admin-Only Endpoints

The user management endpoints (`/admin/api/users/*`) use an additional `adminOnlyAuth` middleware that rejects users with the `user` role entirely.

## Data Encryption

### Database Credentials (AES-256-GCM)

Target database passwords are encrypted before storage:

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key:** 32-byte key provided via the `ENCRYPTION_KEY` environment variable (hex-encoded, 64 hex characters)
- **IV:** 12 random bytes generated per encryption operation
- **Storage format:** `ivHex:authTagHex:ciphertextHex` (colon-separated)
- **Authentication tag:** 16 bytes, prevents tampering

The encryption key never leaves the server process. If compromised, all stored database passwords must be re-encrypted with a new key.

### User Passwords (bcrypt)

- **Algorithm:** bcrypt
- **Salt rounds:** 12
- **Library:** `bcryptjs`
- Passwords are never stored in plaintext or reversible form.

## Policy Engine Security

The policy engine implements a defense-in-depth approach with multiple layers:

### Layer 1: Blocked Keywords

Before any SQL parsing, the raw query text is checked for dangerous patterns:

| Pattern | Reason |
|---|---|
| `DROP`, `CREATE`, `ALTER`, `TRUNCATE` (at statement start) | DDL operations could destroy schema |
| `GRANT`, `REVOKE` (at statement start) | Privilege escalation |
| `;` followed by non-whitespace | Multi-statement injection |
| `LOAD DATA` (anywhere) | File system access |
| `INTO OUTFILE` (anywhere) | File system write |

### Layer 2: SQL Parsing

The query is parsed using `node-sql-parser` into a structured AST. This step:

- Rejects unparseable SQL
- Rejects multi-statement arrays
- Restricts operations to SELECT, INSERT, UPDATE, DELETE only
- Extracts tables, columns, and WHERE clause presence

> **Known limitation.** The query-safety guarantees rest on `node-sql-parser`'s
> dialect coverage plus the Layer 1 blocked-keyword regexes, applied to
> agent-supplied raw SQL. A parser/MySQL dialect mismatch is therefore part of
> the trust boundary: pair this service with a least-privilege database account
> (see *Database Access Principle of Least Privilege* below) so the database
> itself enforces a hard backstop. Do not treat the policy layer as the sole
> defense against a fully hostile agent.

### Layer 3: Policy Evaluation

For each table referenced in the query:

1. A policy record must exist (default-deny)
2. The operation must be in the policy's `allowedOperations`
3. If `allowedColumns` is set, all referenced columns must be in the list
4. If `whereClauseRequired` is true and operation is UPDATE/DELETE, a WHERE clause must be present

### Layer 4: Row Limit Enforcement

For write operations (INSERT/UPDATE/DELETE), if a `rowLimit` is configured:

1. A `SELECT COUNT(*)` with the same WHERE clause is executed first
2. If the affected row count exceeds the limit, the operation is denied
3. The denial is logged in the audit trail

### Layer 5: Value Validation

The policy engine validates not just which columns can be written, but what values are acceptable. This closes the gap where an agent with column-level access could write semantically dangerous values (e.g., `UPDATE users SET role = 'superadmin'`).

Value validation uses a **hybrid approach** with two phases:

**Phase 1: Pre-execution (literal values)**

Before any SQL executes, literal values in `UPDATE SET` and `INSERT VALUES` are extracted from the SQL AST and validated against rules defined in the policy's `customRules.columnValidation` field. Non-literal values (expressions like `NOW()`, `price * 1.1`, subqueries) are flagged as unvalidatable and deferred to Phase 2.

**Phase 2: Post-execution (before COMMIT)**

After the write query executes inside a transaction but before `COMMIT`, the actual data snapshot is validated against the same rules. If validation fails, the transaction is rolled back. This catches expression-based values that couldn't be validated pre-execution.

Supported rule types:

| Rule | Purpose | Example |
|---|---|---|
| `enum` | Whitelist of allowed values | `["active", "inactive", "suspended"]` |
| `pattern` | Regex match (max 200 chars to prevent ReDoS; compile-checked on policy save, fails closed at runtime) | `^[^@]+@[^@]+\.[^@]+$` |
| `min` | Minimum numeric value | `0` |
| `max` | Maximum numeric value | `150` |
| `notNull` | Prevents null values | -- |

When validation fails, the error response includes structured violation details (column, rejected value, rule type, and what the rule expects) so AI agents can self-correct and retry with valid values.

### Execution Isolation

- Read queries (`SELECT`) are executed directly against the connection pool.
- Write queries are wrapped in a transaction with before/after snapshots.
- Snapshots are scoped to the policy's `allowedColumns` when set, so columns the
  agent cannot write (e.g. `password`, `ssn`) are never copied into the audit log.
- If value validation rules exist, the post-execution snapshot is validated before commit.
- On any error or validation failure, the transaction is rolled back.

## Audit Trail

### Comprehensive Logging

Every query that reaches the Agent API is logged, regardless of outcome:

| Status | Meaning |
|---|---|
| `allowed` | Query passed all checks and executed successfully |
| `denied` | Query was blocked by the policy engine |
| `error` | Query was allowed but execution failed |

### Log Contents

Each audit log entry records:
- Agent ID, database ID, user ID (the agent's owner)
- Full SQL query text
- Operation type (SELECT/INSERT/UPDATE/DELETE)
- Status (allowed/denied/error)
- Affected rows count (for writes)
- Before/after data snapshots (for writes, up to 1000 rows)
- Policy ID that governed the decision
- Denial reason (if denied)
- Agent-supplied reasoning (optional `reason` field -- the agent's explanation for the operation)
- Execution time in milliseconds

### Audit Reviews

Audit log entries can be flagged with reviews by both AI auditor agents and human admin users. Reviews are stored in a separate `audit_reviews` table to keep audit logs immutable.

Each review records:
- **Flag type:** `suspicious_pattern`, `policy_violation`, `data_anomaly`, `performance_concern`, or `manual_review`
- **Severity:** `low`, `medium`, `high`, or `critical`
- **Reviewer type:** `human` (admin panel) or `ai` (auditor agent)
- **Reviewer ID:** the agent or user who created the review
- **Notes:** free-text explanation

Reviews are append-only -- there is no update or delete. To resolve a flag, create a new `manual_review` entry with resolution notes.

### CSV Export Protection

The CSV export feature protects against formula injection attacks by prefixing cell values that start with `=`, `+`, `-`, `@`, tab, or carriage return with a single quote character.

## Best Practices

### Secrets Management

- **JWT_SECRET:** Use at least 64 characters of cryptographically random data. Generate with `openssl rand -base64 48`.
- **ENCRYPTION_KEY:** Must be exactly 32 bytes (64 hex characters). Generate with `openssl rand -hex 32`.
- Store secrets in environment variables or a secrets manager. Never commit them to version control.

### Network Security

- **Always enable HTTPS in production.** The JWT cookie has `secure: true` in production mode, which requires HTTPS.
- Place the service behind a reverse proxy (Nginx, Caddy) that handles TLS termination.
- Restrict network access to the admin panel to trusted IPs if possible.
- **Pin CORS origins.** Set `ALLOWED_ORIGINS` to your dashboard origin(s); it defaults to the local dev origin and must not be left open to `*` in production.

### Database Access Principle of Least Privilege

- Create a dedicated MySQL user for each target database connection with only the permissions needed.
- Avoid using `root` or users with `ALL PRIVILEGES`.
- If an agent only needs to read data, grant only `SELECT` at the MySQL level as an additional layer.
- **Override the admin DB defaults.** `ADMIN_DB_USER` defaults to `root` with an empty password for local dev convenience only — set a dedicated, password-protected account for any non-local deployment.

### API Key Management

- Treat API keys like passwords -- do not log them, share them in plaintext, or commit them to code.
- Rotate keys periodically using the **Regenerate Key** feature.
- Deactivate agents immediately if a key is suspected to be compromised.
- Use descriptive agent names to make audit logs meaningful.

### Auditor Agent Setup

- Create a separate agent with `role: "auditor"` to periodically review audit logs.
- Consider using a different AI model for the auditor than the executor to avoid systemic blind spots.
- The auditor agent cannot read its own audit trail, enforcing separation of concerns.
- Set up the auditor's MCP server with `AQG_AGENT_ROLE=auditor` to expose only audit tools.

### Monitoring and Alerting

- Regularly review audit logs for anomalies (unusual query patterns, high denial rates, unexpected tables).
- Monitor the `denied` status -- a spike may indicate a misconfigured agent or an attack attempt.
- Export audit logs periodically for long-term retention and analysis.

### Policy Design

- Start restrictive and loosen as needed.
- Always set `whereClauseRequired: true` for UPDATE and DELETE policies to prevent unbounded mutations.
- Use `rowLimit` to cap the blast radius of write operations.
- Use `allowedColumns` to prevent exposure of sensitive columns (passwords, tokens, PII).

## Related Documentation

- [Architecture](architecture.md) -- system design and component breakdown
- [API Reference](api-reference.md) -- endpoint authentication requirements
- [Admin Guide](admin-guide.md) -- managing policies and agents
