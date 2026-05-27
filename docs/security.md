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

### Execution Isolation

- Read queries (`SELECT`) are executed directly against the connection pool.
- Write queries are wrapped in a transaction with before/after snapshots.
- On any error, the transaction is rolled back.

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
- Execution time in milliseconds

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

### Database Access Principle of Least Privilege

- Create a dedicated MySQL user for each target database connection with only the permissions needed.
- Avoid using `root` or users with `ALL PRIVILEGES`.
- If an agent only needs to read data, grant only `SELECT` at the MySQL level as an additional layer.

### API Key Management

- Treat API keys like passwords -- do not log them, share them in plaintext, or commit them to code.
- Rotate keys periodically using the **Regenerate Key** feature.
- Deactivate agents immediately if a key is suspected to be compromised.
- Use descriptive agent names to make audit logs meaningful.

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
