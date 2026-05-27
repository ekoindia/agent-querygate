# MySQL Agent Connector Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a security broker service between AI agents and MySQL databases with policy-based guardrails, audit logging, and an admin GUI.

**Architecture:** TypeScript monolith on Hono. REST API + MCP wrapper for agents, admin API + React SPA for humans. Drizzle ORM for admin DB. Policy engine parses SQL via node-sql-parser to enforce per-agent-per-table access rules. Audit logger captures query logs with before/after data diffs on writes.

**Tech Stack:** Hono, Drizzle ORM, node-sql-parser, React, Vite, shadcn/ui, Tailwind v4, @modelcontextprotocol/sdk, Zod, Vitest

**Implementation notes:**
- Use Context7 MCP tool to fetch latest docs for each library before using it
- Use Mobbin MCP tool before building UI pages for design research (dark theme, professional admin dashboards)

---

## File Structure

```
eko-mysql-agent-connector-service/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── .env.example
├── src/
│   ├── index.ts                    ← Hono server entry, mounts all routes, serves SPA
│   ├── config.ts                   ← env var loading + Zod validation
│   ├── db/
│   │   ├── schema.ts              ← Drizzle table definitions (users, databases, agents, policies, audit_logs, agent_database_access)
│   │   ├── connection.ts          ← admin DB drizzle instance
│   │   └── migrate.ts             ← run Drizzle migrations
│   ├── auth/
│   │   ├── jwt.ts                 ← sign/verify JWT, cookie helpers
│   │   ├── api-key.ts             ← generate, hash, verify API keys
│   │   ├── password.ts            ← bcrypt hash/verify
│   │   └── middleware.ts          ← adminAuth (JWT) + agentAuth (API key) middleware
│   ├── policy/
│   │   ├── engine.ts              ← policy evaluation: lookup + check chain
│   │   ├── sql-parser.ts          ← parse SQL → extract operation, tables, columns, WHERE
│   │   └── blocked-keywords.ts    ← DDL, LOAD DATA, multi-statement blocklist
│   ├── query/
│   │   ├── executor.ts            ← execute query against target DB (read + write paths)
│   │   ├── snapshot.ts            ← capture before/after row snapshots for writes
│   │   └── pool-manager.ts        ← per-target-DB connection pool cache
│   ├── audit/
│   │   └── logger.ts              ← write audit log entries to admin DB
│   ├── routes/
│   │   ├── agent/
│   │   │   ├── query.ts           ← POST /api/v1/query
│   │   │   ├── execute.ts         ← POST /api/v1/execute
│   │   │   ├── tables.ts          ← GET /api/v1/tables, GET /api/v1/tables/:name/schema
│   │   │   └── health.ts          ← GET /api/v1/health
│   │   └── admin/
│   │       ├── auth.ts            ← POST setup, login, logout
│   │       ├── users.ts           ← CRUD users (admin+)
│   │       ├── databases.ts       ← CRUD databases, test-connection, introspect
│   │       ├── agents.ts          ← CRUD agents, regenerate-key, database access
│   │       ├── policies.ts        ← CRUD policies
│   │       ├── audit.ts           ← GET audit logs, export CSV
│   │       └── dashboard.ts       ← GET dashboard stats
│   ├── mcp/
│   │   └── server.ts              ← MCP tool definitions, stdio + SSE transports
│   └── lib/
│       ├── crypto.ts              ← AES-256-GCM encrypt/decrypt for DB credentials
│       ├── errors.ts              ← AppError class, error codes
│       └── types.ts               ← shared types (ParsedQuery, PolicyCheckResult, etc.)
├── tests/
│   ├── setup.ts                   ← test DB setup/teardown helpers
│   ├── policy/
│   │   ├── sql-parser.test.ts
│   │   ├── engine.test.ts
│   │   └── blocked-keywords.test.ts
│   ├── auth/
│   │   ├── jwt.test.ts
│   │   ├── api-key.test.ts
│   │   └── password.test.ts
│   ├── query/
│   │   ├── executor.test.ts
│   │   └── snapshot.test.ts
│   ├── routes/
│   │   ├── agent/
│   │   │   ├── query.test.ts
│   │   │   └── execute.test.ts
│   │   └── admin/
│   │       ├── auth.test.ts
│   │       ├── users.test.ts
│   │       ├── databases.test.ts
│   │       ├── agents.test.ts
│   │       └── policies.test.ts
│   └── lib/
│       └── crypto.test.ts
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                ← React Router setup, auth context
│   │   ├── lib/
│   │   │   ├── api.ts            ← fetch wrapper with auth
│   │   │   └── utils.ts          ← cn() helper, formatters
│   │   ├── hooks/
│   │   │   ├── useAuth.ts        ← auth context hook
│   │   │   └── useApi.ts         ← data fetching hook
│   │   ├── components/
│   │   │   ├── ui/               ← shadcn/ui components
│   │   │   ├── Layout.tsx        ← sidebar nav + top bar
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── DataTable.tsx     ← reusable table component
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
│   │   └── types/
│   │       └── index.ts          ← frontend type definitions
│   └── tailwind.config.ts
└── drizzle/
    └── migrations/
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `src/config.ts`
- Create: `src/lib/errors.ts`
- Create: `src/lib/types.ts`

- [ ] **Step 1: Initialize package.json**

Use Context7 to check latest Hono, Drizzle, vitest versions before installing.

```bash
npm init -y
```

Then edit `package.json`:

```json
{
  "name": "eko-mysql-agent-connector-service",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [ ] **Step 2: Install dependencies**

Ask user for permission, then install:

```bash
npm install hono @hono/node-server drizzle-orm mysql2 zod bcryptjs jsonwebtoken node-sql-parser uuid
npm install -D typescript tsx vitest @types/node @types/bcryptjs @types/jsonwebtoken @types/uuid drizzle-kit
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "baseUrl": "."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "frontend", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["tests/setup.ts"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
```

- [ ] **Step 5: Create .env.example**

```
# Admin Database
ADMIN_DB_HOST=localhost
ADMIN_DB_PORT=3306
ADMIN_DB_NAME=eko_connector_admin
ADMIN_DB_USER=root
ADMIN_DB_PASSWORD=

# Security
JWT_SECRET=change-me-to-random-64-char-string
ENCRYPTION_KEY=change-me-to-32-byte-hex-string

# Server
PORT=3000
NODE_ENV=development
```

- [ ] **Step 6: Create src/config.ts**

```typescript
import { z } from "zod";

const configSchema = z.object({
	adminDb: z.object({
		host: z.string().default("localhost"),
		port: z.coerce.number().default(3306),
		name: z.string().default("eko_connector_admin"),
		user: z.string().default("root"),
		password: z.string().default(""),
	}),
	jwtSecret: z.string().min(16),
	encryptionKey: z.string().min(32),
	port: z.coerce.number().default(3000),
	nodeEnv: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
	return configSchema.parse({
		adminDb: {
			host: process.env.ADMIN_DB_HOST,
			port: process.env.ADMIN_DB_PORT,
			name: process.env.ADMIN_DB_NAME,
			user: process.env.ADMIN_DB_USER,
			password: process.env.ADMIN_DB_PASSWORD,
		},
		jwtSecret: process.env.JWT_SECRET,
		encryptionKey: process.env.ENCRYPTION_KEY,
		port: process.env.PORT,
		nodeEnv: process.env.NODE_ENV,
	});
}
```

- [ ] **Step 7: Create src/lib/errors.ts**

```typescript
export class AppError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		public code?: string,
	) {
		super(message);
		this.name = "AppError";
	}
}

export const Errors = {
	unauthorized: (msg = "Unauthorized") => new AppError(401, msg, "UNAUTHORIZED"),
	forbidden: (msg = "Forbidden") => new AppError(403, msg, "FORBIDDEN"),
	notFound: (msg = "Not found") => new AppError(404, msg, "NOT_FOUND"),
	badRequest: (msg: string) => new AppError(400, msg, "BAD_REQUEST"),
	policyDenied: (msg: string) => new AppError(403, msg, "POLICY_DENIED"),
} as const;
```

- [ ] **Step 8: Create src/lib/types.ts**

```typescript
export interface ParsedQuery {
	operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
	tables: string[];
	columns: string[];
	hasWhere: boolean;
	originalSql: string;
}

export interface PolicyCheckResult {
	allowed: boolean;
	policyId?: string;
	denialReason?: string;
}

export interface SnapshotResult {
	dataBefore: Record<string, unknown>[] | null;
	dataAfter: Record<string, unknown>[] | null;
	affectedRows: number;
}

export interface QueryResult {
	rows: Record<string, unknown>[];
	columns: string[];
	rowCount: number;
}

export type UserRole = "superadmin" | "admin" | "user";

export interface AuthenticatedAgent {
	agentId: string;
	userId: string;
	agentName: string;
}

export interface AuthenticatedUser {
	userId: string;
	email: string;
	role: UserRole;
}
```

- [ ] **Step 9: Create tests/setup.ts**

```typescript
import { beforeAll, afterAll } from "vitest";

beforeAll(() => {
	process.env.JWT_SECRET = "test-jwt-secret-that-is-long-enough";
	process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
	process.env.NODE_ENV = "test";
});

afterAll(() => {
	// cleanup if needed
});
```

- [ ] **Step 10: Verify setup compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with config, types, and error handling"
```

---

## Task 2: Database Schema & Migrations

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/connection.ts`
- Create: `src/db/migrate.ts`

- [ ] **Step 1: Create drizzle.config.ts**

Use Context7 to check latest Drizzle Kit config format.

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle/migrations",
	dialect: "mysql",
	dbCredentials: {
		host: process.env.ADMIN_DB_HOST || "localhost",
		port: Number(process.env.ADMIN_DB_PORT) || 3306,
		database: process.env.ADMIN_DB_NAME || "eko_connector_admin",
		user: process.env.ADMIN_DB_USER || "root",
		password: process.env.ADMIN_DB_PASSWORD || "",
	},
});
```

- [ ] **Step 2: Create src/db/schema.ts**

Use Context7 for latest Drizzle ORM MySQL schema syntax.

```typescript
import {
	mysqlTable,
	varchar,
	text,
	boolean,
	int,
	json,
	timestamp,
	mysqlEnum,
	uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
	id: varchar("id", { length: 36 }).primaryKey(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	name: varchar("name", { length: 255 }).notNull(),
	role: mysqlEnum("role", ["superadmin", "admin", "user"]).notNull().default("user"),
	createdBy: varchar("created_by", { length: 36 }),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const databases = mysqlTable("databases", {
	id: varchar("id", { length: 36 }).primaryKey(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	name: varchar("name", { length: 255 }).notNull(),
	host: varchar("host", { length: 255 }).notNull(),
	port: int("port").notNull().default(3306),
	dbName: varchar("db_name", { length: 255 }).notNull(),
	username: varchar("username", { length: 255 }).notNull(),
	passwordEncrypted: text("password_encrypted").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const agents = mysqlTable("agents", {
	id: varchar("id", { length: 36 }).primaryKey(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	name: varchar("name", { length: 255 }).notNull(),
	apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull(),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const agentDatabaseAccess = mysqlTable(
	"agent_database_access",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		agentId: varchar("agent_id", { length: 36 }).notNull(),
		databaseId: varchar("database_id", { length: 36 }).notNull(),
	},
	(table) => [uniqueIndex("agent_db_unique").on(table.agentId, table.databaseId)],
);

export const policies = mysqlTable("policies", {
	id: varchar("id", { length: 36 }).primaryKey(),
	agentDatabaseAccessId: varchar("agent_database_access_id", { length: 36 }).notNull(),
	tableName: varchar("table_name", { length: 255 }).notNull(),
	allowedOperations: json("allowed_operations").$type<string[]>().notNull(),
	allowedColumns: json("allowed_columns").$type<string[] | null>().default(null),
	rowLimit: int("row_limit"),
	whereClauseRequired: boolean("where_clause_required").notNull().default(false),
	customRules: json("custom_rules").$type<Record<string, unknown>>().default({}),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const auditLogs = mysqlTable("audit_logs", {
	id: varchar("id", { length: 36 }).primaryKey(),
	agentId: varchar("agent_id", { length: 36 }).notNull(),
	databaseId: varchar("database_id", { length: 36 }).notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	sqlQuery: text("sql_query").notNull(),
	operationType: mysqlEnum("operation_type", ["SELECT", "INSERT", "UPDATE", "DELETE"]).notNull(),
	status: mysqlEnum("status", ["allowed", "denied", "error"]).notNull(),
	affectedRows: int("affected_rows"),
	dataBefore: json("data_before").$type<Record<string, unknown>[] | null>().default(null),
	dataAfter: json("data_after").$type<Record<string, unknown>[] | null>().default(null),
	policyId: varchar("policy_id", { length: 36 }),
	denialReason: text("denial_reason"),
	executionTimeMs: int("execution_time_ms"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 3: Create src/db/connection.ts**

```typescript
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import type { Config } from "@/config";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let pool: mysql.Pool | null = null;

export function getDb(config: Config) {
	if (!db) {
		pool = mysql.createPool({
			host: config.adminDb.host,
			port: config.adminDb.port,
			database: config.adminDb.name,
			user: config.adminDb.user,
			password: config.adminDb.password,
			waitForConnections: true,
			connectionLimit: 10,
		});
		db = drizzle(pool, { schema, mode: "default" });
	}
	return db;
}

export async function closeDb() {
	if (pool) {
		await pool.end();
		pool = null;
		db = null;
	}
}
```

- [ ] **Step 4: Create src/db/migrate.ts**

```typescript
import { migrate } from "drizzle-orm/mysql2/migrator";
import { loadConfig } from "@/config";
import { getDb, closeDb } from "./connection";

async function runMigrations() {
	const config = loadConfig();
	const db = getDb(config);
	console.log("Running migrations...");
	await migrate(db, { migrationsFolder: "./drizzle/migrations" });
	console.log("Migrations complete.");
	await closeDb();
}

runMigrations().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
```

- [ ] **Step 5: Generate initial migration**

```bash
npx drizzle-kit generate
```

Expected: migration SQL files appear in `drizzle/migrations/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: database schema and migrations with Drizzle ORM"
```

---

## Task 3: Crypto & Auth Utilities

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `src/auth/password.ts`
- Create: `src/auth/jwt.ts`
- Create: `src/auth/api-key.ts`
- Create: `tests/lib/crypto.test.ts`
- Create: `tests/auth/jwt.test.ts`
- Create: `tests/auth/api-key.test.ts`
- Create: `tests/auth/password.test.ts`

- [ ] **Step 1: Write failing tests for crypto**

```typescript
// tests/lib/crypto.test.ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

describe("crypto", () => {
	const key = "0123456789abcdef0123456789abcdef";

	it("encrypts and decrypts a string", () => {
		const plaintext = "my-database-password";
		const encrypted = encrypt(plaintext, key);
		expect(encrypted).not.toBe(plaintext);
		expect(encrypted).toContain(":"); // iv:authTag:ciphertext format
		const decrypted = decrypt(encrypted, key);
		expect(decrypted).toBe(plaintext);
	});

	it("produces different ciphertext for same plaintext", () => {
		const plaintext = "same-password";
		const a = encrypt(plaintext, key);
		const b = encrypt(plaintext, key);
		expect(a).not.toBe(b);
	});

	it("fails to decrypt with wrong key", () => {
		const encrypted = encrypt("secret", key);
		const wrongKey = "abcdef0123456789abcdef0123456789";
		expect(() => decrypt(encrypted, wrongKey)).toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/crypto.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement src/lib/crypto.ts**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

export function encrypt(plaintext: string, key: string): string {
	const iv = randomBytes(16);
	const cipher = createCipheriv(ALGORITHM, Buffer.from(key, "hex"), iv);
	let encrypted = cipher.update(plaintext, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag().toString("hex");
	return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(ciphertext: string, key: string): string {
	const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
	const decipher = createDecipheriv(
		ALGORITHM,
		Buffer.from(key, "hex"),
		Buffer.from(ivHex, "hex"),
	);
	decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
	let decrypted = decipher.update(encryptedHex, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}
```

- [ ] **Step 4: Run crypto test to verify pass**

```bash
npx vitest run tests/lib/crypto.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing tests for password**

```typescript
// tests/auth/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/auth/password";

describe("password", () => {
	it("hashes and verifies a password", async () => {
		const hash = await hashPassword("my-password");
		expect(hash).not.toBe("my-password");
		expect(await verifyPassword("my-password", hash)).toBe(true);
	});

	it("rejects wrong password", async () => {
		const hash = await hashPassword("correct");
		expect(await verifyPassword("wrong", hash)).toBe(false);
	});
});
```

- [ ] **Step 6: Implement src/auth/password.ts**

```typescript
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}
```

- [ ] **Step 7: Run password test**

```bash
npx vitest run tests/auth/password.test.ts
```

Expected: PASS.

- [ ] **Step 8: Write failing tests for JWT**

```typescript
// tests/auth/jwt.test.ts
import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "@/auth/jwt";

const secret = "test-jwt-secret-that-is-long-enough";

describe("jwt", () => {
	it("signs and verifies a token", () => {
		const payload = { userId: "abc-123", email: "test@test.com", role: "user" as const };
		const token = signJwt(payload, secret);
		expect(typeof token).toBe("string");
		const decoded = verifyJwt(token, secret);
		expect(decoded.userId).toBe("abc-123");
		expect(decoded.email).toBe("test@test.com");
		expect(decoded.role).toBe("user");
	});

	it("rejects invalid token", () => {
		expect(() => verifyJwt("garbage", secret)).toThrow();
	});

	it("rejects expired token", () => {
		const payload = { userId: "abc", email: "t@t.com", role: "user" as const };
		const token = signJwt(payload, secret, "0s");
		expect(() => verifyJwt(token, secret)).toThrow();
	});
});
```

- [ ] **Step 9: Implement src/auth/jwt.ts**

```typescript
import jwt from "jsonwebtoken";
import type { UserRole } from "@/lib/types";

interface JwtPayload {
	userId: string;
	email: string;
	role: UserRole;
}

export function signJwt(payload: JwtPayload, secret: string, expiresIn: string = "24h"): string {
	return jwt.sign(payload, secret, { expiresIn });
}

export function verifyJwt(token: string, secret: string): JwtPayload {
	return jwt.verify(token, secret) as JwtPayload;
}
```

- [ ] **Step 10: Run JWT test**

```bash
npx vitest run tests/auth/jwt.test.ts
```

Expected: PASS.

- [ ] **Step 11: Write failing tests for API key**

```typescript
// tests/auth/api-key.test.ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, verifyApiKey } from "@/auth/api-key";

describe("api-key", () => {
	it("generates a key with prefix", () => {
		const key = generateApiKey();
		expect(key).toMatch(/^eko_/);
		expect(key.length).toBeGreaterThan(30);
	});

	it("hashes and verifies a key", () => {
		const key = generateApiKey();
		const hash = hashApiKey(key);
		expect(hash).not.toBe(key);
		expect(verifyApiKey(key, hash)).toBe(true);
	});

	it("rejects wrong key", () => {
		const hash = hashApiKey(generateApiKey());
		expect(verifyApiKey("eko_wrong-key", hash)).toBe(false);
	});
});
```

- [ ] **Step 12: Implement src/auth/api-key.ts**

```typescript
import { randomBytes, createHash } from "crypto";

const PREFIX = "eko_";

export function generateApiKey(): string {
	const bytes = randomBytes(32);
	return PREFIX + bytes.toString("base64url");
}

export function hashApiKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

export function verifyApiKey(key: string, hash: string): boolean {
	const computed = hashApiKey(key);
	return computed === hash;
}
```

- [ ] **Step 13: Run API key test**

```bash
npx vitest run tests/auth/api-key.test.ts
```

Expected: PASS.

- [ ] **Step 14: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: crypto, password, JWT, and API key utilities with tests"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `src/auth/middleware.ts`
- Modify: `src/db/schema.ts` (imports used by middleware)

- [ ] **Step 1: Implement admin auth middleware**

```typescript
// src/auth/middleware.ts
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { verifyJwt } from "./jwt";
import { hashApiKey } from "./api-key";
import { agents, users } from "@/db/schema";
import type { AuthenticatedUser, AuthenticatedAgent } from "@/lib/types";
import { Errors } from "@/lib/errors";

type AdminEnv = { Variables: { user: AuthenticatedUser } };
type AgentEnv = { Variables: { agent: AuthenticatedAgent } };

export const adminAuth = createMiddleware<AdminEnv>(async (c, next) => {
	const token = getCookie(c, "token");
	if (!token) throw Errors.unauthorized("No auth token");

	const config = c.get("config" as never);
	const payload = verifyJwt(token, config.jwtSecret);

	const db = c.get("db" as never);
	const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
	if (!user || !user.isActive) throw Errors.unauthorized("User inactive or not found");

	c.set("user", {
		userId: user.id,
		email: user.email,
		role: user.role,
	});
	await next();
});

export const adminOnlyAuth = createMiddleware<AdminEnv>(async (c, next) => {
	const user = c.get("user");
	if (user.role === "user") throw Errors.forbidden("Admin access required");
	await next();
});

export const agentAuth = createMiddleware<AgentEnv>(async (c, next) => {
	const apiKey = c.req.header("X-API-Key");
	if (!apiKey) throw Errors.unauthorized("No API key");

	const keyHash = hashApiKey(apiKey);
	const db = c.get("db" as never);
	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.apiKeyHash, keyHash))
		.limit(1);

	if (!agent || !agent.isActive) throw Errors.unauthorized("Invalid or inactive API key");

	c.set("agent", {
		agentId: agent.id,
		userId: agent.userId,
		agentName: agent.name,
	});
	await next();
});
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: admin and agent auth middleware"
```

---

## Task 5: SQL Parser & Blocked Keywords

**Files:**
- Create: `src/policy/sql-parser.ts`
- Create: `src/policy/blocked-keywords.ts`
- Create: `tests/policy/sql-parser.test.ts`
- Create: `tests/policy/blocked-keywords.test.ts`

- [ ] **Step 1: Write failing tests for blocked keywords**

```typescript
// tests/policy/blocked-keywords.test.ts
import { describe, it, expect } from "vitest";
import { checkBlockedKeywords } from "@/policy/blocked-keywords";

describe("blocked-keywords", () => {
	it("allows normal SELECT", () => {
		expect(checkBlockedKeywords("SELECT * FROM users")).toBeNull();
	});

	it("allows normal INSERT", () => {
		expect(checkBlockedKeywords("INSERT INTO users (name) VALUES ('Bob')")).toBeNull();
	});

	it("blocks DROP TABLE", () => {
		expect(checkBlockedKeywords("DROP TABLE users")).toBe("DDL operation DROP is not allowed");
	});

	it("blocks CREATE TABLE", () => {
		expect(checkBlockedKeywords("CREATE TABLE evil (id INT)")).toBe(
			"DDL operation CREATE is not allowed",
		);
	});

	it("blocks ALTER TABLE", () => {
		expect(checkBlockedKeywords("ALTER TABLE users ADD COLUMN evil INT")).toBe(
			"DDL operation ALTER is not allowed",
		);
	});

	it("blocks TRUNCATE", () => {
		expect(checkBlockedKeywords("TRUNCATE TABLE users")).toBe(
			"DDL operation TRUNCATE is not allowed",
		);
	});

	it("blocks LOAD DATA", () => {
		expect(checkBlockedKeywords("LOAD DATA INFILE '/tmp/data' INTO TABLE users")).toBe(
			"LOAD DATA is not allowed",
		);
	});

	it("blocks INTO OUTFILE", () => {
		expect(checkBlockedKeywords("SELECT * INTO OUTFILE '/tmp/out' FROM users")).toBe(
			"INTO OUTFILE is not allowed",
		);
	});

	it("blocks GRANT", () => {
		expect(checkBlockedKeywords("GRANT ALL ON *.* TO 'root'")).toBe(
			"GRANT/REVOKE is not allowed",
		);
	});

	it("blocks multi-statement (semicolons)", () => {
		expect(checkBlockedKeywords("SELECT 1; DROP TABLE users")).toBe(
			"Multi-statement queries are not allowed",
		);
	});

	it("case insensitive", () => {
		expect(checkBlockedKeywords("drop table users")).toBe("DDL operation DROP is not allowed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/policy/blocked-keywords.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement blocked-keywords.ts**

```typescript
// src/policy/blocked-keywords.ts

const DDL_PATTERN = /^\s*(DROP|CREATE|ALTER|TRUNCATE)\s/i;
const LOAD_DATA_PATTERN = /\bLOAD\s+DATA\b/i;
const INTO_OUTFILE_PATTERN = /\bINTO\s+OUTFILE\b/i;
const GRANT_REVOKE_PATTERN = /^\s*(GRANT|REVOKE)\s/i;
const MULTI_STATEMENT_PATTERN = /;[\s]*\S/;

export function checkBlockedKeywords(sql: string): string | null {
	const trimmed = sql.trim();

	const ddlMatch = trimmed.match(DDL_PATTERN);
	if (ddlMatch) return `DDL operation ${ddlMatch[1].toUpperCase()} is not allowed`;

	if (LOAD_DATA_PATTERN.test(trimmed)) return "LOAD DATA is not allowed";
	if (INTO_OUTFILE_PATTERN.test(trimmed)) return "INTO OUTFILE is not allowed";
	if (GRANT_REVOKE_PATTERN.test(trimmed)) return "GRANT/REVOKE is not allowed";
	if (MULTI_STATEMENT_PATTERN.test(trimmed)) return "Multi-statement queries are not allowed";

	return null;
}
```

- [ ] **Step 4: Run blocked keywords test**

```bash
npx vitest run tests/policy/blocked-keywords.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing tests for SQL parser**

```typescript
// tests/policy/sql-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseSql } from "@/policy/sql-parser";

describe("sql-parser", () => {
	it("parses simple SELECT", () => {
		const result = parseSql("SELECT name, email FROM users WHERE id = 1");
		expect(result.operation).toBe("SELECT");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toContain("name");
		expect(result.columns).toContain("email");
		expect(result.hasWhere).toBe(true);
	});

	it("parses SELECT *", () => {
		const result = parseSql("SELECT * FROM orders");
		expect(result.operation).toBe("SELECT");
		expect(result.tables).toEqual(["orders"]);
		expect(result.columns).toEqual(["*"]);
		expect(result.hasWhere).toBe(false);
	});

	it("parses INSERT", () => {
		const result = parseSql("INSERT INTO users (name, email) VALUES ('Bob', 'bob@test.com')");
		expect(result.operation).toBe("INSERT");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toContain("name");
		expect(result.columns).toContain("email");
	});

	it("parses UPDATE", () => {
		const result = parseSql("UPDATE users SET name = 'Alice' WHERE id = 5");
		expect(result.operation).toBe("UPDATE");
		expect(result.tables).toEqual(["users"]);
		expect(result.columns).toContain("name");
		expect(result.hasWhere).toBe(true);
	});

	it("parses UPDATE without WHERE", () => {
		const result = parseSql("UPDATE users SET status = 'inactive'");
		expect(result.hasWhere).toBe(false);
	});

	it("parses DELETE", () => {
		const result = parseSql("DELETE FROM users WHERE id = 5");
		expect(result.operation).toBe("DELETE");
		expect(result.tables).toEqual(["users"]);
		expect(result.hasWhere).toBe(true);
	});

	it("parses JOIN query", () => {
		const result = parseSql(
			"SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id",
		);
		expect(result.tables).toContain("users");
		expect(result.tables).toContain("orders");
	});

	it("throws on unparseable SQL", () => {
		expect(() => parseSql("NOT VALID SQL AT ALL ???")).toThrow();
	});

	it("preserves original SQL", () => {
		const sql = "SELECT id FROM users";
		const result = parseSql(sql);
		expect(result.originalSql).toBe(sql);
	});
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run tests/policy/sql-parser.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement sql-parser.ts**

Use Context7 to check node-sql-parser API.

```typescript
// src/policy/sql-parser.ts
import { Parser } from "node-sql-parser";
import type { ParsedQuery } from "@/lib/types";
import { Errors } from "@/lib/errors";

const parser = new Parser();

export function parseSql(sql: string): ParsedQuery {
	let ast;
	try {
		ast = parser.astify(sql, { database: "MySQL" });
	} catch {
		throw Errors.badRequest("Unable to parse SQL query");
	}

	if (Array.isArray(ast)) {
		throw Errors.badRequest("Multi-statement queries are not allowed");
	}

	const operation = ast.type?.toUpperCase();
	if (!["SELECT", "INSERT", "UPDATE", "DELETE"].includes(operation)) {
		throw Errors.badRequest(`Operation ${operation} is not allowed`);
	}

	const tables = extractTables(ast);
	const columns = extractColumns(ast, operation);
	const hasWhere = ast.where != null;

	return {
		operation: operation as ParsedQuery["operation"],
		tables,
		columns,
		hasWhere,
		originalSql: sql,
	};
}

function extractTables(ast: Record<string, unknown>): string[] {
	const tables: string[] = [];

	const from = ast.from as Array<{ table: string }> | undefined;
	if (from) {
		for (const item of from) {
			if (item.table) tables.push(item.table);
		}
	}

	const table = ast.table as Array<{ table: string }> | { table: string } | undefined;
	if (table) {
		const tableList = Array.isArray(table) ? table : [table];
		for (const item of tableList) {
			if (item.table && !tables.includes(item.table)) tables.push(item.table);
		}
	}

	return tables;
}

function extractColumns(ast: Record<string, unknown>, operation: string): string[] {
	const columns: string[] = [];

	if (operation === "SELECT") {
		const cols = ast.columns as Array<{ expr: { column: string; type: string } }> | string;
		if (cols === "*") return ["*"];
		if (Array.isArray(cols)) {
			for (const col of cols) {
				if (col.expr?.column) columns.push(col.expr.column);
			}
		}
	} else if (operation === "INSERT") {
		const insertCols = ast.columns as string[] | undefined;
		if (insertCols) columns.push(...insertCols);
	} else if (operation === "UPDATE") {
		const set = ast.set as Array<{ column: string }> | undefined;
		if (set) {
			for (const item of set) {
				if (item.column) columns.push(item.column);
			}
		}
	}

	return columns;
}
```

- [ ] **Step 8: Run SQL parser test**

```bash
npx vitest run tests/policy/sql-parser.test.ts
```

Expected: PASS (some tests may need tweaking based on node-sql-parser's exact AST shape — adjust extraction logic accordingly).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: SQL parser and blocked keyword checker with tests"
```

---

## Task 6: Policy Engine

**Files:**
- Create: `src/policy/engine.ts`
- Create: `tests/policy/engine.test.ts`

- [ ] **Step 1: Write failing tests for policy engine**

```typescript
// tests/policy/engine.test.ts
import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "@/policy/engine";
import type { ParsedQuery } from "@/lib/types";

const makePolicy = (overrides: Record<string, unknown> = {}) => ({
	id: "policy-1",
	tableName: "users",
	allowedOperations: ["SELECT", "UPDATE"],
	allowedColumns: null,
	rowLimit: null,
	whereClauseRequired: false,
	...overrides,
});

const makeQuery = (overrides: Partial<ParsedQuery> = {}): ParsedQuery => ({
	operation: "SELECT",
	tables: ["users"],
	columns: ["name"],
	hasWhere: true,
	originalSql: "SELECT name FROM users WHERE id = 1",
	...overrides,
});

describe("policy-engine", () => {
	it("allows query matching policy", () => {
		const result = evaluatePolicy(makeQuery(), [makePolicy()]);
		expect(result.allowed).toBe(true);
		expect(result.policyId).toBe("policy-1");
	});

	it("denies when no policy for table", () => {
		const result = evaluatePolicy(makeQuery({ tables: ["orders"] }), [makePolicy()]);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toContain("orders");
	});

	it("denies disallowed operation", () => {
		const result = evaluatePolicy(makeQuery({ operation: "DELETE" }), [makePolicy()]);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toContain("DELETE");
	});

	it("denies disallowed column", () => {
		const policy = makePolicy({ allowedColumns: ["id", "name"] });
		const result = evaluatePolicy(makeQuery({ columns: ["email"] }), [policy]);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toContain("email");
	});

	it("allows when allowedColumns is null (all columns)", () => {
		const policy = makePolicy({ allowedColumns: null });
		const result = evaluatePolicy(makeQuery({ columns: ["anything"] }), [policy]);
		expect(result.allowed).toBe(true);
	});

	it("denies missing WHERE when required", () => {
		const policy = makePolicy({ whereClauseRequired: true });
		const query = makeQuery({ operation: "UPDATE", hasWhere: false });
		const result = evaluatePolicy(query, [policy]);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toContain("WHERE");
	});

	it("allows SELECT * when all columns permitted", () => {
		const policy = makePolicy({ allowedColumns: null });
		const result = evaluatePolicy(makeQuery({ columns: ["*"] }), [policy]);
		expect(result.allowed).toBe(true);
	});

	it("handles multi-table query — both tables need policies", () => {
		const policies = [
			makePolicy({ tableName: "users" }),
			makePolicy({ id: "policy-2", tableName: "orders", allowedOperations: ["SELECT"] }),
		];
		const query = makeQuery({ tables: ["users", "orders"] });
		const result = evaluatePolicy(query, policies);
		expect(result.allowed).toBe(true);
	});

	it("denies multi-table query when one table has no policy", () => {
		const result = evaluatePolicy(makeQuery({ tables: ["users", "secrets"] }), [makePolicy()]);
		expect(result.allowed).toBe(false);
		expect(result.denialReason).toContain("secrets");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/policy/engine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement policy engine**

```typescript
// src/policy/engine.ts
import type { ParsedQuery, PolicyCheckResult } from "@/lib/types";

interface PolicyRecord {
	id: string;
	tableName: string;
	allowedOperations: string[];
	allowedColumns: string[] | null;
	rowLimit: number | null;
	whereClauseRequired: boolean;
}

export function evaluatePolicy(
	query: ParsedQuery,
	policies: PolicyRecord[],
): PolicyCheckResult {
	const policyMap = new Map(policies.map((p) => [p.tableName, p]));

	for (const table of query.tables) {
		const policy = policyMap.get(table);
		if (!policy) {
			return {
				allowed: false,
				denialReason: `No access policy for table '${table}'`,
			};
		}

		if (!policy.allowedOperations.includes(query.operation)) {
			return {
				allowed: false,
				policyId: policy.id,
				denialReason: `Operation ${query.operation} not allowed on table '${table}'`,
			};
		}

		if (policy.allowedColumns !== null && !query.columns.includes("*")) {
			const disallowed = query.columns.filter((c) => !policy.allowedColumns!.includes(c));
			if (disallowed.length > 0) {
				return {
					allowed: false,
					policyId: policy.id,
					denialReason: `Column(s) not allowed on table '${table}': ${disallowed.join(", ")}`,
				};
			}
		}

		if (
			policy.whereClauseRequired &&
			!query.hasWhere &&
			["UPDATE", "DELETE"].includes(query.operation)
		) {
			return {
				allowed: false,
				policyId: policy.id,
				denialReason: `WHERE clause required for ${query.operation} on table '${table}'`,
			};
		}
	}

	const primaryPolicy = policyMap.get(query.tables[0]);
	return {
		allowed: true,
		policyId: primaryPolicy?.id,
	};
}

export function getPolicyRowLimit(
	query: ParsedQuery,
	policies: PolicyRecord[],
): number | null {
	const policyMap = new Map(policies.map((p) => [p.tableName, p]));
	const primaryPolicy = policyMap.get(query.tables[0]);
	return primaryPolicy?.rowLimit ?? null;
}
```

- [ ] **Step 4: Run policy engine test**

```bash
npx vitest run tests/policy/engine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: policy evaluation engine with tests"
```

---

## Task 7: Connection Pool Manager

**Files:**
- Create: `src/query/pool-manager.ts`

- [ ] **Step 1: Implement pool manager**

```typescript
// src/query/pool-manager.ts
import mysql from "mysql2/promise";
import { decrypt } from "@/lib/crypto";

interface TargetDbConfig {
	host: string;
	port: number;
	dbName: string;
	username: string;
	passwordEncrypted: string;
}

const pools = new Map<string, mysql.Pool>();

export function getTargetPool(databaseId: string, config: TargetDbConfig, encryptionKey: string): mysql.Pool {
	const existing = pools.get(databaseId);
	if (existing) return existing;

	const password = decrypt(config.passwordEncrypted, encryptionKey);
	const pool = mysql.createPool({
		host: config.host,
		port: config.port,
		database: config.dbName,
		user: config.username,
		password,
		waitForConnections: true,
		connectionLimit: 5,
	});

	pools.set(databaseId, pool);
	return pool;
}

export async function testConnection(config: TargetDbConfig, encryptionKey: string): Promise<boolean> {
	const password = decrypt(config.passwordEncrypted, encryptionKey);
	const connection = await mysql.createConnection({
		host: config.host,
		port: config.port,
		database: config.dbName,
		user: config.username,
		password,
	});
	await connection.ping();
	await connection.end();
	return true;
}

export async function removePool(databaseId: string): Promise<void> {
	const pool = pools.get(databaseId);
	if (pool) {
		await pool.end();
		pools.delete(databaseId);
	}
}

export async function closeAllPools(): Promise<void> {
	for (const [id, pool] of pools) {
		await pool.end();
		pools.delete(id);
	}
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: target database connection pool manager"
```

---

## Task 8: Query Executor & Snapshot Capture

**Files:**
- Create: `src/query/snapshot.ts`
- Create: `src/query/executor.ts`

- [ ] **Step 1: Implement snapshot capture**

```typescript
// src/query/snapshot.ts
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { ParsedQuery } from "@/lib/types";

export async function captureBeforeSnapshot(
	pool: Pool,
	query: ParsedQuery,
): Promise<Record<string, unknown>[]> {
	if (query.operation === "INSERT") return [];

	const selectSql = buildSnapshotSelect(query);
	if (!selectSql) return [];

	const [rows] = await pool.query<RowDataPacket[]>(selectSql);
	return rows as Record<string, unknown>[];
}

export async function captureAfterSnapshot(
	pool: Pool,
	query: ParsedQuery,
): Promise<Record<string, unknown>[]> {
	if (query.operation === "DELETE") return [];

	const selectSql = buildSnapshotSelect(query);
	if (!selectSql) return [];

	const [rows] = await pool.query<RowDataPacket[]>(selectSql);
	return rows as Record<string, unknown>[];
}

function buildSnapshotSelect(query: ParsedQuery): string | null {
	const table = query.tables[0];
	if (!table) return null;

	const whereMatch = query.originalSql.match(/\bWHERE\b(.+?)(?:ORDER\s+BY|LIMIT|GROUP\s+BY|HAVING|$)/is);
	const whereClause = whereMatch ? `WHERE ${whereMatch[1].trim()}` : "";

	return `SELECT * FROM \`${table}\` ${whereClause} LIMIT 1000`;
}
```

- [ ] **Step 2: Implement query executor**

```typescript
// src/query/executor.ts
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { ParsedQuery, QueryResult, SnapshotResult } from "@/lib/types";
import { captureBeforeSnapshot, captureAfterSnapshot } from "./snapshot";

export async function executeReadQuery(
	pool: Pool,
	query: ParsedQuery,
): Promise<QueryResult> {
	const [rows, fields] = await pool.query<RowDataPacket[]>(query.originalSql);
	const columns = fields?.map((f) => f.name) ?? [];
	return {
		rows: rows as Record<string, unknown>[],
		columns,
		rowCount: rows.length,
	};
}

export async function executeWriteQuery(
	pool: Pool,
	query: ParsedQuery,
): Promise<SnapshotResult> {
	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();

		const dataBefore = await captureBeforeSnapshot(pool, query);

		const [result] = await connection.query<ResultSetHeader>(query.originalSql);
		const affectedRows = result.affectedRows;

		const dataAfter = await captureAfterSnapshot(pool, query);

		await connection.commit();

		return { dataBefore, dataAfter, affectedRows };
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

export async function countAffectedRows(
	pool: Pool,
	query: ParsedQuery,
): Promise<number> {
	const table = query.tables[0];
	if (!table) return 0;

	const whereMatch = query.originalSql.match(/\bWHERE\b(.+?)(?:ORDER\s+BY|LIMIT|GROUP\s+BY|HAVING|$)/is);
	const whereClause = whereMatch ? `WHERE ${whereMatch[1].trim()}` : "";

	const [rows] = await pool.query<RowDataPacket[]>(
		`SELECT COUNT(*) as cnt FROM \`${table}\` ${whereClause}`,
	);
	return (rows[0] as { cnt: number }).cnt;
}
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: query executor with before/after snapshot capture"
```

---

## Task 9: Audit Logger

**Files:**
- Create: `src/audit/logger.ts`

- [ ] **Step 1: Implement audit logger**

```typescript
// src/audit/logger.ts
import { v4 as uuidv4 } from "uuid";
import type { ParsedQuery, PolicyCheckResult, SnapshotResult } from "@/lib/types";
import { auditLogs } from "@/db/schema";

interface AuditEntry {
	agentId: string;
	databaseId: string;
	userId: string;
	query: ParsedQuery;
	policyResult: PolicyCheckResult;
	snapshot?: SnapshotResult;
	executionTimeMs?: number;
	error?: string;
}

export async function writeAuditLog(db: unknown, entry: AuditEntry): Promise<string> {
	const id = uuidv4();
	const status = entry.error ? "error" : entry.policyResult.allowed ? "allowed" : "denied";

	await (db as any).insert(auditLogs).values({
		id,
		agentId: entry.agentId,
		databaseId: entry.databaseId,
		userId: entry.userId,
		sqlQuery: entry.query.originalSql,
		operationType: entry.query.operation,
		status,
		affectedRows: entry.snapshot?.affectedRows ?? null,
		dataBefore: entry.snapshot?.dataBefore ?? null,
		dataAfter: entry.snapshot?.dataAfter ?? null,
		policyId: entry.policyResult.policyId ?? null,
		denialReason: entry.policyResult.denialReason ?? entry.error ?? null,
		executionTimeMs: entry.executionTimeMs ?? null,
	});

	return id;
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: audit log writer"
```

---

## Task 10: Hono Server Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create server entry point**

Use Context7 to check latest Hono + @hono/node-server setup.

```typescript
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadConfig } from "./config";
import { getDb } from "./db/connection";
import { AppError } from "./lib/errors";

const config = loadConfig();
const db = getDb(config);

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());
app.use("/admin/api/*", cors());

app.use("*", async (c, next) => {
	c.set("config" as never, config as never);
	c.set("db" as never, db as never);
	await next();
});

app.onError((err, c) => {
	if (err instanceof AppError) {
		return c.json({ error: err.message, code: err.code }, err.statusCode as any);
	}
	console.error("Unhandled error:", err);
	return c.json({ error: "Internal server error" }, 500);
});

// Placeholder: agent routes mounted at /api/v1
// Placeholder: admin routes mounted at /admin/api

// Serve frontend SPA
app.use("/*", serveStatic({ root: "./frontend/dist" }));
app.get("/*", serveStatic({ path: "./frontend/dist/index.html" }));

const port = config.port;
console.log(`Server starting on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
```

- [ ] **Step 2: Verify it starts**

```bash
npx tsx src/index.ts
```

Expected: "Server starting on port 3000" (will fail to connect to DB if not running — that's fine for now, just verify the import chain works).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: Hono server entry point with middleware and error handling"
```

---

## Task 11: Admin Auth Routes

**Files:**
- Create: `src/routes/admin/auth.ts`
- Create: `tests/routes/admin/auth.test.ts`

- [ ] **Step 1: Write failing test for setup endpoint**

```typescript
// tests/routes/admin/auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { adminAuthRoutes } from "@/routes/admin/auth";

// These tests verify route handler logic with mocked DB
// Integration tests with real DB come later

describe("admin auth routes", () => {
	it("setup route exists", async () => {
		const app = new Hono();
		app.route("/admin/api/auth", adminAuthRoutes);
		const res = await app.request("/admin/api/auth/setup", { method: "POST" });
		// Should not be 404 — route exists (will fail with other error since no DB)
		expect(res.status).not.toBe(404);
	});

	it("login route exists", async () => {
		const app = new Hono();
		app.route("/admin/api/auth", adminAuthRoutes);
		const res = await app.request("/admin/api/auth/login", { method: "POST" });
		expect(res.status).not.toBe(404);
	});
});
```

- [ ] **Step 2: Implement admin auth routes**

```typescript
// src/routes/admin/auth.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { setCookie, deleteCookie } from "hono/cookie";
import { v4 as uuidv4 } from "uuid";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/auth/password";
import { signJwt } from "@/auth/jwt";

export const adminAuthRoutes = new Hono();

const setupSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
});

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

adminAuthRoutes.post("/setup", zValidator("json", setupSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const body = c.req.valid("json");

	const [existing] = await db
		.select({ value: count() })
		.from(users);
	if (existing.value > 0) {
		return c.json({ error: "Setup already completed" }, 400);
	}

	const id = uuidv4();
	const passwordHash = await hashPassword(body.password);

	await db.insert(users).values({
		id,
		email: body.email,
		name: body.name,
		passwordHash,
		role: "superadmin",
		createdBy: null,
		isActive: true,
	});

	const token = signJwt(
		{ userId: id, email: body.email, role: "superadmin" },
		config.jwtSecret,
	);

	setCookie(c, "token", token, {
		httpOnly: true,
		secure: config.nodeEnv === "production",
		sameSite: "Lax",
		maxAge: 60 * 60 * 24,
		path: "/",
	});

	return c.json({ user: { id, email: body.email, name: body.name, role: "superadmin" } }, 201);
});

adminAuthRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const body = c.req.valid("json");

	const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
	if (!user || !user.isActive) {
		return c.json({ error: "Invalid credentials" }, 401);
	}

	const valid = await verifyPassword(body.password, user.passwordHash);
	if (!valid) {
		return c.json({ error: "Invalid credentials" }, 401);
	}

	const token = signJwt(
		{ userId: user.id, email: user.email, role: user.role },
		config.jwtSecret,
	);

	setCookie(c, "token", token, {
		httpOnly: true,
		secure: config.nodeEnv === "production",
		sameSite: "Lax",
		maxAge: 60 * 60 * 24,
		path: "/",
	});

	return c.json({
		user: { id: user.id, email: user.email, name: user.name, role: user.role },
	});
});

adminAuthRoutes.post("/logout", async (c) => {
	deleteCookie(c, "token", { path: "/" });
	return c.json({ ok: true });
});

adminAuthRoutes.get("/me", async (c) => {
	const db = c.get("db" as never) as any;
	const token = (await import("hono/cookie")).getCookie(c, "token");
	if (!token) return c.json({ user: null });

	try {
		const config = c.get("config" as never) as any;
		const { verifyJwt } = await import("@/auth/jwt");
		const payload = verifyJwt(token, config.jwtSecret);
		const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
		if (!user || !user.isActive) return c.json({ user: null });
		return c.json({
			user: { id: user.id, email: user.email, name: user.name, role: user.role },
		});
	} catch {
		return c.json({ user: null });
	}
});
```

- [ ] **Step 3: Install @hono/zod-validator**

Ask user for permission first.

```bash
npm install @hono/zod-validator
```

- [ ] **Step 4: Run auth route test**

```bash
npx vitest run tests/routes/admin/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: admin auth routes (setup, login, logout, me)"
```

---

## Task 12: Admin User Management Routes

**Files:**
- Create: `src/routes/admin/users.ts`

- [ ] **Step 1: Implement user management routes**

```typescript
// src/routes/admin/users.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { users } from "@/db/schema";
import { hashPassword } from "@/auth/password";
import { adminAuth, adminOnlyAuth } from "@/auth/middleware";
import { Errors } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/types";

export const adminUserRoutes = new Hono();

adminUserRoutes.use("*", adminAuth);
adminUserRoutes.use("*", adminOnlyAuth);

const createUserSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
	role: z.enum(["admin", "user"]).default("user"),
});

const updateUserSchema = z.object({
	name: z.string().min(1).optional(),
	email: z.string().email().optional(),
	isActive: z.boolean().optional(),
});

const updateRoleSchema = z.object({
	role: z.enum(["admin", "user"]),
});

adminUserRoutes.get("/", async (c) => {
	const db = c.get("db" as never) as any;
	const result = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			role: users.role,
			isActive: users.isActive,
			createdAt: users.createdAt,
		})
		.from(users);
	return c.json({ users: result });
});

adminUserRoutes.post("/", zValidator("json", createUserSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const currentUser = c.get("user") as AuthenticatedUser;
	const body = c.req.valid("json");

	const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
	if (existing) throw Errors.badRequest("Email already in use");

	const id = uuidv4();
	const passwordHash = await hashPassword(body.password);

	await db.insert(users).values({
		id,
		email: body.email,
		name: body.name,
		passwordHash,
		role: body.role,
		createdBy: currentUser.userId,
		isActive: true,
	});

	return c.json({ user: { id, email: body.email, name: body.name, role: body.role } }, 201);
});

adminUserRoutes.put("/:id", zValidator("json", updateUserSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const userId = c.req.param("id");
	const body = c.req.valid("json");

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) throw Errors.notFound("User not found");

	await db.update(users).set(body).where(eq(users.id, userId));

	return c.json({ ok: true });
});

adminUserRoutes.put("/:id/role", zValidator("json", updateRoleSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const currentUser = c.get("user") as AuthenticatedUser;
	const userId = c.req.param("id");
	const { role } = c.req.valid("json");

	if (currentUser.role !== "superadmin" && role === "superadmin") {
		throw Errors.forbidden("Only superadmin can assign superadmin role");
	}

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) throw Errors.notFound("User not found");
	if (user.role === "superadmin") {
		throw Errors.forbidden("Cannot change superadmin role");
	}

	await db.update(users).set({ role }).where(eq(users.id, userId));

	return c.json({ ok: true });
});

adminUserRoutes.delete("/:id", async (c) => {
	const db = c.get("db" as never) as any;
	const userId = c.req.param("id");

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) throw Errors.notFound("User not found");
	if (user.role === "superadmin") throw Errors.forbidden("Cannot delete superadmin");

	await db.update(users).set({ isActive: false }).where(eq(users.id, userId));

	return c.json({ ok: true });
});
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: admin user management routes (CRUD + role assignment)"
```

---

## Task 13: Admin Database Management Routes

**Files:**
- Create: `src/routes/admin/databases.ts`

- [ ] **Step 1: Implement database management routes**

```typescript
// src/routes/admin/databases.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { databases } from "@/db/schema";
import { adminAuth } from "@/auth/middleware";
import { encrypt } from "@/lib/crypto";
import { testConnection, removePool } from "@/query/pool-manager";
import { Errors } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/types";
import mysql from "mysql2/promise";

export const adminDatabaseRoutes = new Hono();

adminDatabaseRoutes.use("*", adminAuth);

const createDbSchema = z.object({
	name: z.string().min(1),
	host: z.string().min(1),
	port: z.number().default(3306),
	dbName: z.string().min(1),
	username: z.string().min(1),
	password: z.string().min(1),
});

const updateDbSchema = z.object({
	name: z.string().min(1).optional(),
	host: z.string().min(1).optional(),
	port: z.number().optional(),
	dbName: z.string().min(1).optional(),
	username: z.string().min(1).optional(),
	password: z.string().min(1).optional(),
});

function scopeCondition(user: AuthenticatedUser) {
	if (user.role === "superadmin" || user.role === "admin") return undefined;
	return eq(databases.userId, user.userId);
}

adminDatabaseRoutes.get("/", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const condition = scopeCondition(user);

	const result = condition
		? await db.select({
				id: databases.id,
				userId: databases.userId,
				name: databases.name,
				host: databases.host,
				port: databases.port,
				dbName: databases.dbName,
				username: databases.username,
				createdAt: databases.createdAt,
			}).from(databases).where(condition)
		: await db.select({
				id: databases.id,
				userId: databases.userId,
				name: databases.name,
				host: databases.host,
				port: databases.port,
				dbName: databases.dbName,
				username: databases.username,
				createdAt: databases.createdAt,
			}).from(databases);

	return c.json({ databases: result });
});

adminDatabaseRoutes.post("/", zValidator("json", createDbSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const body = c.req.valid("json");

	const id = uuidv4();
	const passwordEncrypted = encrypt(body.password, config.encryptionKey);

	await db.insert(databases).values({
		id,
		userId: user.userId,
		name: body.name,
		host: body.host,
		port: body.port,
		dbName: body.dbName,
		username: body.username,
		passwordEncrypted,
	});

	return c.json({
		database: { id, name: body.name, host: body.host, port: body.port, dbName: body.dbName },
	}, 201);
});

adminDatabaseRoutes.put("/:id", zValidator("json", updateDbSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const dbId = c.req.param("id");
	const body = c.req.valid("json");

	const [record] = await db.select().from(databases).where(eq(databases.id, dbId)).limit(1);
	if (!record) throw Errors.notFound("Database not found");
	if (user.role === "user" && record.userId !== user.userId) throw Errors.forbidden();

	const updateData: Record<string, unknown> = { ...body };
	if (body.password) {
		updateData.passwordEncrypted = encrypt(body.password, config.encryptionKey);
		delete updateData.password;
	}

	await db.update(databases).set(updateData).where(eq(databases.id, dbId));
	await removePool(dbId);

	return c.json({ ok: true });
});

adminDatabaseRoutes.delete("/:id", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const dbId = c.req.param("id");

	const [record] = await db.select().from(databases).where(eq(databases.id, dbId)).limit(1);
	if (!record) throw Errors.notFound("Database not found");
	if (user.role === "user" && record.userId !== user.userId) throw Errors.forbidden();

	await db.delete(databases).where(eq(databases.id, dbId));
	await removePool(dbId);

	return c.json({ ok: true });
});

adminDatabaseRoutes.post("/:id/test-connection", async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const dbId = c.req.param("id");

	const [record] = await db.select().from(databases).where(eq(databases.id, dbId)).limit(1);
	if (!record) throw Errors.notFound("Database not found");

	try {
		await testConnection(record, config.encryptionKey);
		return c.json({ connected: true });
	} catch (err: any) {
		return c.json({ connected: false, error: err.message }, 400);
	}
});

adminDatabaseRoutes.get("/:id/introspect", async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const dbId = c.req.param("id");

	const [record] = await db.select().from(databases).where(eq(databases.id, dbId)).limit(1);
	if (!record) throw Errors.notFound("Database not found");

	const { decrypt } = await import("@/lib/crypto");
	const password = decrypt(record.passwordEncrypted, config.encryptionKey);
	const conn = await mysql.createConnection({
		host: record.host,
		port: record.port,
		database: record.dbName,
		user: record.username,
		password,
	});

	try {
		const [tables] = await conn.query<mysql.RowDataPacket[]>("SHOW TABLES");
		const tableKey = Object.keys(tables[0] || {})[0];
		const tableNames = tables.map((t) => t[tableKey] as string);

		const schema: Record<string, unknown[]> = {};
		for (const tableName of tableNames) {
			const [columns] = await conn.query<mysql.RowDataPacket[]>(`DESCRIBE \`${tableName}\``);
			schema[tableName] = columns;
		}

		return c.json({ tables: tableNames, schema });
	} finally {
		await conn.end();
	}
});
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: admin database management routes (CRUD, test-connection, introspect)"
```

---

## Task 14: Admin Agent & Policy Routes

**Files:**
- Create: `src/routes/admin/agents.ts`
- Create: `src/routes/admin/policies.ts`

- [ ] **Step 1: Implement agent management routes**

```typescript
// src/routes/admin/agents.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { agents, agentDatabaseAccess } from "@/db/schema";
import { adminAuth } from "@/auth/middleware";
import { generateApiKey, hashApiKey } from "@/auth/api-key";
import { Errors } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/types";

export const adminAgentRoutes = new Hono();

adminAgentRoutes.use("*", adminAuth);

const createAgentSchema = z.object({
	name: z.string().min(1),
});

const updateAgentSchema = z.object({
	name: z.string().min(1).optional(),
	isActive: z.boolean().optional(),
});

adminAgentRoutes.get("/", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;

	const condition =
		user.role === "superadmin" || user.role === "admin"
			? undefined
			: eq(agents.userId, user.userId);

	const result = condition
		? await db.select({
				id: agents.id,
				userId: agents.userId,
				name: agents.name,
				isActive: agents.isActive,
				createdAt: agents.createdAt,
			}).from(agents).where(condition)
		: await db.select({
				id: agents.id,
				userId: agents.userId,
				name: agents.name,
				isActive: agents.isActive,
				createdAt: agents.createdAt,
			}).from(agents);

	return c.json({ agents: result });
});

adminAgentRoutes.post("/", zValidator("json", createAgentSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const body = c.req.valid("json");

	const id = uuidv4();
	const apiKey = generateApiKey();
	const apiKeyHash = hashApiKey(apiKey);

	await db.insert(agents).values({
		id,
		userId: user.userId,
		name: body.name,
		apiKeyHash,
		isActive: true,
	});

	return c.json({ agent: { id, name: body.name }, apiKey }, 201);
});

adminAgentRoutes.put("/:id", zValidator("json", updateAgentSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const agentId = c.req.param("id");
	const body = c.req.valid("json");

	const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
	if (!agent) throw Errors.notFound("Agent not found");
	if (user.role === "user" && agent.userId !== user.userId) throw Errors.forbidden();

	await db.update(agents).set(body).where(eq(agents.id, agentId));

	return c.json({ ok: true });
});

adminAgentRoutes.delete("/:id", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const agentId = c.req.param("id");

	const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
	if (!agent) throw Errors.notFound("Agent not found");
	if (user.role === "user" && agent.userId !== user.userId) throw Errors.forbidden();

	await db.delete(agents).where(eq(agents.id, agentId));

	return c.json({ ok: true });
});

adminAgentRoutes.post("/:id/regenerate-key", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const agentId = c.req.param("id");

	const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
	if (!agent) throw Errors.notFound("Agent not found");
	if (user.role === "user" && agent.userId !== user.userId) throw Errors.forbidden();

	const apiKey = generateApiKey();
	const apiKeyHash = hashApiKey(apiKey);

	await db.update(agents).set({ apiKeyHash }).where(eq(agents.id, agentId));

	return c.json({ apiKey });
});

adminAgentRoutes.get("/:id/databases", async (c) => {
	const db = c.get("db" as never) as any;
	const agentId = c.req.param("id");

	const result = await db
		.select()
		.from(agentDatabaseAccess)
		.where(eq(agentDatabaseAccess.agentId, agentId));

	return c.json({ access: result });
});

adminAgentRoutes.post("/:id/databases/:dbId", async (c) => {
	const db = c.get("db" as never) as any;
	const agentId = c.req.param("id");
	const dbId = c.req.param("dbId");

	const id = uuidv4();
	await db.insert(agentDatabaseAccess).values({
		id,
		agentId,
		databaseId: dbId,
	});

	return c.json({ id }, 201);
});

adminAgentRoutes.delete("/:id/databases/:dbId", async (c) => {
	const db = c.get("db" as never) as any;
	const agentId = c.req.param("id");
	const dbId = c.req.param("dbId");

	await db
		.delete(agentDatabaseAccess)
		.where(
			eq(agentDatabaseAccess.agentId, agentId),
		);

	return c.json({ ok: true });
});
```

- [ ] **Step 2: Implement policy routes**

```typescript
// src/routes/admin/policies.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { policies, agentDatabaseAccess } from "@/db/schema";
import { adminAuth } from "@/auth/middleware";
import { Errors } from "@/lib/errors";

export const adminPolicyRoutes = new Hono();

adminPolicyRoutes.use("*", adminAuth);

const createPolicySchema = z.object({
	tableName: z.string().min(1),
	allowedOperations: z.array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"])).min(1),
	allowedColumns: z.array(z.string()).nullable().default(null),
	rowLimit: z.number().positive().nullable().default(null),
	whereClauseRequired: z.boolean().default(false),
	customRules: z.record(z.unknown()).default({}),
});

const updatePolicySchema = createPolicySchema.partial();

adminPolicyRoutes.get("/agents/:agentId/databases/:dbId/policies", async (c) => {
	const db = c.get("db" as never) as any;
	const agentId = c.req.param("agentId");
	const dbId = c.req.param("dbId");

	const [access] = await db
		.select()
		.from(agentDatabaseAccess)
		.where(
			and(
				eq(agentDatabaseAccess.agentId, agentId),
				eq(agentDatabaseAccess.databaseId, dbId),
			),
		)
		.limit(1);

	if (!access) throw Errors.notFound("Agent-database access not found");

	const result = await db
		.select()
		.from(policies)
		.where(eq(policies.agentDatabaseAccessId, access.id));

	return c.json({ policies: result });
});

adminPolicyRoutes.post(
	"/agents/:agentId/databases/:dbId/policies",
	zValidator("json", createPolicySchema),
	async (c) => {
		const db = c.get("db" as never) as any;
		const agentId = c.req.param("agentId");
		const dbId = c.req.param("dbId");
		const body = c.req.valid("json");

		const [access] = await db
			.select()
			.from(agentDatabaseAccess)
			.where(
				and(
					eq(agentDatabaseAccess.agentId, agentId),
					eq(agentDatabaseAccess.databaseId, dbId),
				),
			)
			.limit(1);

		if (!access) throw Errors.notFound("Agent-database access not found");

		const id = uuidv4();
		await db.insert(policies).values({
			id,
			agentDatabaseAccessId: access.id,
			...body,
		});

		return c.json({ policy: { id, ...body } }, 201);
	},
);

adminPolicyRoutes.put(
	"/policies/:id",
	zValidator("json", updatePolicySchema),
	async (c) => {
		const db = c.get("db" as never) as any;
		const policyId = c.req.param("id");
		const body = c.req.valid("json");

		const [existing] = await db
			.select()
			.from(policies)
			.where(eq(policies.id, policyId))
			.limit(1);
		if (!existing) throw Errors.notFound("Policy not found");

		await db.update(policies).set(body).where(eq(policies.id, policyId));

		return c.json({ ok: true });
	},
);

adminPolicyRoutes.delete("/policies/:id", async (c) => {
	const db = c.get("db" as never) as any;
	const policyId = c.req.param("id");

	const [existing] = await db
		.select()
		.from(policies)
		.where(eq(policies.id, policyId))
		.limit(1);
	if (!existing) throw Errors.notFound("Policy not found");

	await db.delete(policies).where(eq(policies.id, policyId));

	return c.json({ ok: true });
});
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: admin agent management and policy CRUD routes"
```

---

## Task 15: Admin Audit & Dashboard Routes

**Files:**
- Create: `src/routes/admin/audit.ts`
- Create: `src/routes/admin/dashboard.ts`

- [ ] **Step 1: Implement audit routes**

```typescript
// src/routes/admin/audit.ts
import { Hono } from "hono";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { auditLogs } from "@/db/schema";
import { adminAuth } from "@/auth/middleware";
import type { AuthenticatedUser } from "@/lib/types";

export const adminAuditRoutes = new Hono();

adminAuditRoutes.use("*", adminAuth);

adminAuditRoutes.get("/", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const agentFilter = c.req.query("agent");
	const dbFilter = c.req.query("db");
	const fromFilter = c.req.query("from");
	const toFilter = c.req.query("to");
	const opFilter = c.req.query("op");
	const statusFilter = c.req.query("status");
	const page = parseInt(c.req.query("page") || "1", 10);
	const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100);
	const offset = (page - 1) * limit;

	const conditions = [];

	if (user.role === "user") {
		conditions.push(eq(auditLogs.userId, user.userId));
	}
	if (agentFilter) conditions.push(eq(auditLogs.agentId, agentFilter));
	if (dbFilter) conditions.push(eq(auditLogs.databaseId, dbFilter));
	if (opFilter) conditions.push(eq(auditLogs.operationType, opFilter as any));
	if (statusFilter) conditions.push(eq(auditLogs.status, statusFilter as any));
	if (fromFilter) conditions.push(gte(auditLogs.createdAt, new Date(fromFilter)));
	if (toFilter) conditions.push(lte(auditLogs.createdAt, new Date(toFilter)));

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const result = whereClause
		? await db.select().from(auditLogs).where(whereClause).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset)
		: await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);

	return c.json({ logs: result, page, limit });
});

adminAuditRoutes.get("/export", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;

	const condition = user.role === "user" ? eq(auditLogs.userId, user.userId) : undefined;
	const logs = condition
		? await db.select().from(auditLogs).where(condition).orderBy(desc(auditLogs.createdAt))
		: await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));

	const headers = [
		"id", "agent_id", "database_id", "user_id", "sql_query",
		"operation_type", "status", "affected_rows", "denial_reason",
		"execution_time_ms", "created_at",
	];

	const csvRows = [headers.join(",")];
	for (const log of logs) {
		const row = headers.map((h) => {
			const key = h.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
			const val = (log as any)[key];
			if (val == null) return "";
			const str = String(val);
			return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
		});
		csvRows.push(row.join(","));
	}

	c.header("Content-Type", "text/csv");
	c.header("Content-Disposition", "attachment; filename=audit-logs.csv");
	return c.body(csvRows.join("\n"));
});

adminAuditRoutes.get("/:id", async (c) => {
	const db = c.get("db" as never) as any;
	const logId = c.req.param("id");

	const [log] = await db.select().from(auditLogs).where(eq(auditLogs.id, logId)).limit(1);
	if (!log) return c.json({ error: "Not found" }, 404);

	return c.json({ log });
});
```

- [ ] **Step 2: Implement dashboard routes**

```typescript
// src/routes/admin/dashboard.ts
import { Hono } from "hono";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { auditLogs, agents, databases } from "@/db/schema";
import { adminAuth } from "@/auth/middleware";
import type { AuthenticatedUser } from "@/lib/types";

export const adminDashboardRoutes = new Hono();

adminDashboardRoutes.use("*", adminAuth);

adminDashboardRoutes.get("/stats", async (c) => {
	const db = c.get("db" as never) as any;
	const user = c.get("user") as AuthenticatedUser;
	const isAdmin = user.role === "superadmin" || user.role === "admin";

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const userCondition = isAdmin ? undefined : eq(auditLogs.userId, user.userId);
	const agentCondition = isAdmin ? undefined : eq(agents.userId, user.userId);
	const dbCondition = isAdmin ? undefined : eq(databases.userId, user.userId);

	const [totalQueriesToday] = userCondition
		? await db.select({ value: count() }).from(auditLogs).where(and(userCondition, gte(auditLogs.createdAt, today)))
		: await db.select({ value: count() }).from(auditLogs).where(gte(auditLogs.createdAt, today));

	const [deniedToday] = userCondition
		? await db.select({ value: count() }).from(auditLogs).where(and(userCondition, gte(auditLogs.createdAt, today), eq(auditLogs.status, "denied")))
		: await db.select({ value: count() }).from(auditLogs).where(and(gte(auditLogs.createdAt, today), eq(auditLogs.status, "denied")));

	const [activeAgents] = agentCondition
		? await db.select({ value: count() }).from(agents).where(and(agentCondition, eq(agents.isActive, true)))
		: await db.select({ value: count() }).from(agents).where(eq(agents.isActive, true));

	const [totalDatabases] = dbCondition
		? await db.select({ value: count() }).from(databases).where(dbCondition)
		: await db.select({ value: count() }).from(databases);

	return c.json({
		queriesToday: totalQueriesToday.value,
		deniedToday: deniedToday.value,
		activeAgents: activeAgents.value,
		totalDatabases: totalDatabases.value,
	});
});
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: admin audit log viewer with CSV export and dashboard stats"
```

---

## Task 16: Agent-Facing API Routes

**Files:**
- Create: `src/routes/agent/query.ts`
- Create: `src/routes/agent/execute.ts`
- Create: `src/routes/agent/tables.ts`
- Create: `src/routes/agent/health.ts`

- [ ] **Step 1: Implement agent query route**

```typescript
// src/routes/agent/query.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { agentAuth } from "@/auth/middleware";
import { checkBlockedKeywords } from "@/policy/blocked-keywords";
import { parseSql } from "@/policy/sql-parser";
import { evaluatePolicy } from "@/policy/engine";
import { executeReadQuery } from "@/query/executor";
import { getTargetPool } from "@/query/pool-manager";
import { writeAuditLog } from "@/audit/logger";
import { agentDatabaseAccess, policies, databases } from "@/db/schema";
import { Errors } from "@/lib/errors";
import type { AuthenticatedAgent } from "@/lib/types";

export const agentQueryRoutes = new Hono();

agentQueryRoutes.use("*", agentAuth);

const querySchema = z.object({
	sql: z.string().min(1),
	database_id: z.string().optional(),
});

agentQueryRoutes.post("/query", zValidator("json", querySchema), async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const agent = c.get("agent") as AuthenticatedAgent;
	const body = c.req.valid("json");
	const startTime = Date.now();

	const blocked = checkBlockedKeywords(body.sql);
	if (blocked) {
		const parsed = { operation: "SELECT" as const, tables: [], columns: [], hasWhere: false, originalSql: body.sql };
		await writeAuditLog(db, {
			agentId: agent.agentId,
			databaseId: body.database_id || "",
			userId: agent.userId,
			query: parsed,
			policyResult: { allowed: false, denialReason: blocked },
		});
		throw Errors.policyDenied(blocked);
	}

	const parsed = parseSql(body.sql);
	if (parsed.operation !== "SELECT") {
		throw Errors.badRequest("Use /execute for write operations");
	}

	const { databaseId, dbRecord } = await resolveDatabase(db, agent, body.database_id);

	const accessRecords = await db
		.select()
		.from(agentDatabaseAccess)
		.where(
			and(
				eq(agentDatabaseAccess.agentId, agent.agentId),
				eq(agentDatabaseAccess.databaseId, databaseId),
			),
		);

	if (accessRecords.length === 0) throw Errors.forbidden("No access to this database");

	const policyRecords = await db
		.select()
		.from(policies)
		.where(eq(policies.agentDatabaseAccessId, accessRecords[0].id));

	const policyResult = evaluatePolicy(parsed, policyRecords);

	await writeAuditLog(db, {
		agentId: agent.agentId,
		databaseId,
		userId: agent.userId,
		query: parsed,
		policyResult,
		executionTimeMs: Date.now() - startTime,
	});

	if (!policyResult.allowed) {
		throw Errors.policyDenied(policyResult.denialReason || "Policy denied");
	}

	const pool = getTargetPool(databaseId, dbRecord, config.encryptionKey);
	const result = await executeReadQuery(pool, parsed);

	return c.json(result);
});

async function resolveDatabase(db: any, agent: AuthenticatedAgent, databaseId?: string) {
	if (databaseId) {
		const [dbRecord] = await db.select().from(databases).where(eq(databases.id, databaseId)).limit(1);
		if (!dbRecord) throw Errors.notFound("Database not found");
		return { databaseId, dbRecord };
	}

	const accessList = await db
		.select()
		.from(agentDatabaseAccess)
		.where(eq(agentDatabaseAccess.agentId, agent.agentId));

	if (accessList.length === 0) throw Errors.forbidden("No database access configured");
	if (accessList.length > 1) throw Errors.badRequest("Multiple databases available — specify database_id");

	const [dbRecord] = await db.select().from(databases).where(eq(databases.id, accessList[0].databaseId)).limit(1);
	return { databaseId: accessList[0].databaseId, dbRecord };
}

export { resolveDatabase };
```

- [ ] **Step 2: Implement agent execute route**

```typescript
// src/routes/agent/execute.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { agentAuth } from "@/auth/middleware";
import { checkBlockedKeywords } from "@/policy/blocked-keywords";
import { parseSql } from "@/policy/sql-parser";
import { evaluatePolicy, getPolicyRowLimit } from "@/policy/engine";
import { executeWriteQuery, countAffectedRows } from "@/query/executor";
import { getTargetPool } from "@/query/pool-manager";
import { writeAuditLog } from "@/audit/logger";
import { agentDatabaseAccess, policies, databases } from "@/db/schema";
import { Errors } from "@/lib/errors";
import type { AuthenticatedAgent } from "@/lib/types";
import { resolveDatabase } from "./query";

export const agentExecuteRoutes = new Hono();

agentExecuteRoutes.use("*", agentAuth);

const executeSchema = z.object({
	sql: z.string().min(1),
	database_id: z.string().optional(),
});

agentExecuteRoutes.post("/execute", zValidator("json", executeSchema), async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const agent = c.get("agent") as AuthenticatedAgent;
	const body = c.req.valid("json");
	const startTime = Date.now();

	const blocked = checkBlockedKeywords(body.sql);
	if (blocked) {
		const parsed = { operation: "INSERT" as const, tables: [], columns: [], hasWhere: false, originalSql: body.sql };
		await writeAuditLog(db, {
			agentId: agent.agentId,
			databaseId: body.database_id || "",
			userId: agent.userId,
			query: parsed,
			policyResult: { allowed: false, denialReason: blocked },
		});
		throw Errors.policyDenied(blocked);
	}

	const parsed = parseSql(body.sql);
	if (parsed.operation === "SELECT") {
		throw Errors.badRequest("Use /query for read operations");
	}

	const { databaseId, dbRecord } = await resolveDatabase(db, agent, body.database_id);

	const accessRecords = await db
		.select()
		.from(agentDatabaseAccess)
		.where(
			and(
				eq(agentDatabaseAccess.agentId, agent.agentId),
				eq(agentDatabaseAccess.databaseId, databaseId),
			),
		);

	if (accessRecords.length === 0) throw Errors.forbidden("No access to this database");

	const policyRecords = await db
		.select()
		.from(policies)
		.where(eq(policies.agentDatabaseAccessId, accessRecords[0].id));

	const policyResult = evaluatePolicy(parsed, policyRecords);

	if (!policyResult.allowed) {
		await writeAuditLog(db, {
			agentId: agent.agentId,
			databaseId,
			userId: agent.userId,
			query: parsed,
			policyResult,
			executionTimeMs: Date.now() - startTime,
		});
		throw Errors.policyDenied(policyResult.denialReason || "Policy denied");
	}

	const pool = getTargetPool(databaseId, dbRecord, config.encryptionKey);

	const rowLimit = getPolicyRowLimit(parsed, policyRecords);
	if (rowLimit !== null) {
		const wouldAffect = await countAffectedRows(pool, parsed);
		if (wouldAffect > rowLimit) {
			const denialReason = `Would affect ${wouldAffect} rows, limit is ${rowLimit}`;
			await writeAuditLog(db, {
				agentId: agent.agentId,
				databaseId,
				userId: agent.userId,
				query: parsed,
				policyResult: { allowed: false, policyId: policyResult.policyId, denialReason },
				executionTimeMs: Date.now() - startTime,
			});
			throw Errors.policyDenied(denialReason);
		}
	}

	try {
		const snapshot = await executeWriteQuery(pool, parsed);
		const executionTimeMs = Date.now() - startTime;

		await writeAuditLog(db, {
			agentId: agent.agentId,
			databaseId,
			userId: agent.userId,
			query: parsed,
			policyResult,
			snapshot,
			executionTimeMs,
		});

		return c.json({
			affected_rows: snapshot.affectedRows,
			data_before: snapshot.dataBefore,
			data_after: snapshot.dataAfter,
		});
	} catch (error: any) {
		await writeAuditLog(db, {
			agentId: agent.agentId,
			databaseId,
			userId: agent.userId,
			query: parsed,
			policyResult,
			error: error.message,
			executionTimeMs: Date.now() - startTime,
		});
		throw error;
	}
});
```

- [ ] **Step 3: Implement tables + health routes**

```typescript
// src/routes/agent/tables.ts
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { agentAuth } from "@/auth/middleware";
import { agentDatabaseAccess, policies, databases } from "@/db/schema";
import { getTargetPool } from "@/query/pool-manager";
import type { AuthenticatedAgent } from "@/lib/types";
import { resolveDatabase } from "./query";
import mysql from "mysql2/promise";

export const agentTableRoutes = new Hono();

agentTableRoutes.use("*", agentAuth);

agentTableRoutes.get("/tables", async (c) => {
	const db = c.get("db" as never) as any;
	const agent = c.get("agent") as AuthenticatedAgent;
	const databaseId = c.req.query("database_id");

	const { databaseId: resolvedDbId } = await resolveDatabase(db, agent, databaseId);

	const accessRecords = await db
		.select()
		.from(agentDatabaseAccess)
		.where(
			and(
				eq(agentDatabaseAccess.agentId, agent.agentId),
				eq(agentDatabaseAccess.databaseId, resolvedDbId),
			),
		);

	if (accessRecords.length === 0) return c.json({ tables: [] });

	const policyRecords = await db
		.select()
		.from(policies)
		.where(eq(policies.agentDatabaseAccessId, accessRecords[0].id));

	const tables = policyRecords.map((p: any) => p.tableName);

	return c.json({ tables });
});

agentTableRoutes.get("/tables/:name/schema", async (c) => {
	const db = c.get("db" as never) as any;
	const config = c.get("config" as never) as any;
	const agent = c.get("agent") as AuthenticatedAgent;
	const tableName = c.req.param("name");
	const databaseId = c.req.query("database_id");

	const { databaseId: resolvedDbId, dbRecord } = await resolveDatabase(db, agent, databaseId);

	const pool = getTargetPool(resolvedDbId, dbRecord, config.encryptionKey);
	const [columns] = await pool.query<mysql.RowDataPacket[]>(`DESCRIBE \`${tableName}\``);

	return c.json({ columns });
});
```

```typescript
// src/routes/agent/health.ts
import { Hono } from "hono";
import { agentAuth } from "@/auth/middleware";
import type { AuthenticatedAgent } from "@/lib/types";

export const agentHealthRoutes = new Hono();

agentHealthRoutes.use("*", agentAuth);

agentHealthRoutes.get("/health", async (c) => {
	const agent = c.get("agent") as AuthenticatedAgent;
	return c.json({
		status: "ok",
		agent: agent.agentName,
	});
});
```

- [ ] **Step 4: Wire all routes into src/index.ts**

Update `src/index.ts` to mount all route groups:

```typescript
// Add imports:
import { adminAuthRoutes } from "./routes/admin/auth";
import { adminUserRoutes } from "./routes/admin/users";
import { adminDatabaseRoutes } from "./routes/admin/databases";
import { adminAgentRoutes } from "./routes/admin/agents";
import { adminPolicyRoutes } from "./routes/admin/policies";
import { adminAuditRoutes } from "./routes/admin/audit";
import { adminDashboardRoutes } from "./routes/admin/dashboard";
import { agentQueryRoutes } from "./routes/agent/query";
import { agentExecuteRoutes } from "./routes/agent/execute";
import { agentTableRoutes } from "./routes/agent/tables";
import { agentHealthRoutes } from "./routes/agent/health";

// Mount routes (replace placeholders):
app.route("/admin/api/auth", adminAuthRoutes);
app.route("/admin/api/users", adminUserRoutes);
app.route("/admin/api/databases", adminDatabaseRoutes);
app.route("/admin/api/agents", adminAgentRoutes);
app.route("/admin/api", adminPolicyRoutes);
app.route("/admin/api/audit", adminAuditRoutes);
app.route("/admin/api/dashboard", adminDashboardRoutes);
app.route("/api/v1", agentQueryRoutes);
app.route("/api/v1", agentExecuteRoutes);
app.route("/api/v1", agentTableRoutes);
app.route("/api/v1", agentHealthRoutes);
```

- [ ] **Step 5: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: agent-facing REST API routes (query, execute, tables, health)"
```

---

## Task 17: MCP Server Wrapper

**Files:**
- Create: `src/mcp/server.ts`

- [ ] **Step 1: Install MCP SDK**

Ask user for permission.

```bash
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Implement MCP server**

Use Context7 to check latest MCP SDK TypeScript API.

```typescript
// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export function createMcpServer(baseUrl: string, apiKey: string) {
	const server = new McpServer({
		name: "eko-mysql-connector",
		version: "0.1.0",
	});

	const headers = {
		"Content-Type": "application/json",
		"X-API-Key": apiKey,
	};

	server.tool(
		"mysql_query",
		"Execute a read-only SQL query against the database",
		{
			sql: z.string().describe("SQL SELECT query to execute"),
			database_id: z.string().optional().describe("Database ID (required if agent has multiple DBs)"),
		},
		async ({ sql, database_id }) => {
			const res = await fetch(`${baseUrl}/api/v1/query`, {
				method: "POST",
				headers,
				body: JSON.stringify({ sql, database_id }),
			});
			const data = await res.json();
			if (!res.ok) return { content: [{ type: "text" as const, text: JSON.stringify(data) }], isError: true };
			return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
		},
	);

	server.tool(
		"mysql_execute",
		"Execute a write SQL query (INSERT, UPDATE, DELETE) against the database",
		{
			sql: z.string().describe("SQL write query to execute"),
			database_id: z.string().optional().describe("Database ID (required if agent has multiple DBs)"),
		},
		async ({ sql, database_id }) => {
			const res = await fetch(`${baseUrl}/api/v1/execute`, {
				method: "POST",
				headers,
				body: JSON.stringify({ sql, database_id }),
			});
			const data = await res.json();
			if (!res.ok) return { content: [{ type: "text" as const, text: JSON.stringify(data) }], isError: true };
			return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
		},
	);

	server.tool(
		"mysql_list_tables",
		"List all tables the agent has access to",
		{
			database_id: z.string().optional().describe("Database ID (required if agent has multiple DBs)"),
		},
		async ({ database_id }) => {
			const url = new URL(`${baseUrl}/api/v1/tables`);
			if (database_id) url.searchParams.set("database_id", database_id);
			const res = await fetch(url.toString(), { headers });
			const data = await res.json();
			return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
		},
	);

	server.tool(
		"mysql_describe_table",
		"Get the schema (columns, types) of a specific table",
		{
			table: z.string().describe("Table name"),
			database_id: z.string().optional().describe("Database ID (required if agent has multiple DBs)"),
		},
		async ({ table, database_id }) => {
			const url = new URL(`${baseUrl}/api/v1/tables/${table}/schema`);
			if (database_id) url.searchParams.set("database_id", database_id);
			const res = await fetch(url.toString(), { headers });
			const data = await res.json();
			return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
		},
	);

	server.tool(
		"mysql_health",
		"Check connection status and agent identity",
		{},
		async () => {
			const res = await fetch(`${baseUrl}/api/v1/health`, { headers });
			const data = await res.json();
			return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
		},
	);

	return server;
}

export async function startMcpStdio(baseUrl: string, apiKey: string) {
	const server = createMcpServer(baseUrl, apiKey);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: MCP server wrapper with all agent tools"
```

---

## Task 18: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/types/index.ts`

- [ ] **Step 1: Use Mobbin for design research**

Before building UI, use Mobbin tool to research:
- Dark-themed admin dashboards
- Data table designs with filter/search
- Policy configuration UIs
- Audit log viewers

Document findings and design direction.

- [ ] **Step 2: Initialize frontend**

Use Context7 to check latest Vite + React + Tailwind v4 + shadcn/ui setup.

```bash
cd frontend && npm create vite@latest . -- --template react-ts
```

Then install deps:

```bash
npm install react-router-dom
npx shadcn@latest init
```

Configure shadcn/ui for dark theme, Tailwind v4.

- [ ] **Step 3: Create frontend/src/lib/api.ts**

```typescript
const BASE_URL = "/admin/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...options.headers,
		},
		...options,
	});

	if (!res.ok) {
		const error = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error(error.error || `HTTP ${res.status}`);
	}

	return res.json();
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
	put: <T>(path: string, body?: unknown) =>
		request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
	del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
```

- [ ] **Step 4: Create frontend/src/hooks/useAuth.ts**

```typescript
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "../lib/api";

interface User {
	id: string;
	email: string;
	name: string;
	role: "superadmin" | "admin" | "user";
}

interface AuthContextType {
	user: User | null;
	loading: boolean;
	login: (email: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
	refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = async () => {
		try {
			const { user } = await api.get<{ user: User | null }>("/auth/me");
			setUser(user);
		} catch {
			setUser(null);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { refresh(); }, []);

	const login = async (email: string, password: string) => {
		const { user } = await api.post<{ user: User }>("/auth/login", { email, password });
		setUser(user);
	};

	const logout = async () => {
		await api.post("/auth/logout");
		setUser(null);
	};

	return (
		<AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}
```

- [ ] **Step 5: Create frontend/src/types/index.ts**

```typescript
export interface User {
	id: string;
	email: string;
	name: string;
	role: "superadmin" | "admin" | "user";
	isActive: boolean;
	createdAt: string;
}

export interface Database {
	id: string;
	userId: string;
	name: string;
	host: string;
	port: number;
	dbName: string;
	username: string;
	createdAt: string;
}

export interface Agent {
	id: string;
	userId: string;
	name: string;
	isActive: boolean;
	createdAt: string;
}

export interface Policy {
	id: string;
	agentDatabaseAccessId: string;
	tableName: string;
	allowedOperations: string[];
	allowedColumns: string[] | null;
	rowLimit: number | null;
	whereClauseRequired: boolean;
	customRules: Record<string, unknown>;
}

export interface AuditLog {
	id: string;
	agentId: string;
	databaseId: string;
	userId: string;
	sqlQuery: string;
	operationType: string;
	status: "allowed" | "denied" | "error";
	affectedRows: number | null;
	dataBefore: Record<string, unknown>[] | null;
	dataAfter: Record<string, unknown>[] | null;
	policyId: string | null;
	denialReason: string | null;
	executionTimeMs: number | null;
	createdAt: string;
}

export interface DashboardStats {
	queriesToday: number;
	deniedToday: number;
	activeAgents: number;
	totalDatabases: number;
}
```

- [ ] **Step 6: Create frontend/src/App.tsx with routing**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Setup } from "./pages/Setup";
import { Dashboard } from "./pages/Dashboard";
import { Databases } from "./pages/Databases";
import { Agents } from "./pages/Agents";
import { AgentPolicies } from "./pages/AgentPolicies";
import { Audit } from "./pages/Audit";
import { Users } from "./pages/Users";
import { Settings } from "./pages/Settings";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { user, loading } = useAuth();
	if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
	if (!user) return <Navigate to="/login" />;
	return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
	const { user } = useAuth();
	if (user?.role === "user") return <Navigate to="/dashboard" />;
	return <>{children}</>;
}

export default function App() {
	return (
		<BrowserRouter>
			<AuthProvider>
				<Routes>
					<Route path="/login" element={<Login />} />
					<Route path="/setup" element={<Setup />} />
					<Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
						<Route index element={<Navigate to="/dashboard" />} />
						<Route path="dashboard" element={<Dashboard />} />
						<Route path="databases" element={<Databases />} />
						<Route path="agents" element={<Agents />} />
						<Route path="agents/:agentId/databases/:dbId/policies" element={<AgentPolicies />} />
						<Route path="audit" element={<Audit />} />
						<Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
						<Route path="settings" element={<Settings />} />
					</Route>
				</Routes>
			</AuthProvider>
		</BrowserRouter>
	);
}
```

- [ ] **Step 7: Create stub pages and Layout component**

Create minimal stub files for each page (Login, Setup, Dashboard, Databases, Agents, AgentPolicies, Audit, Users, Settings) and Layout so the app compiles and routes work. Each stub is a single component returning a heading with the page name. Layout renders sidebar nav + `<Outlet />`.

- [ ] **Step 8: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: builds to `frontend/dist/`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: frontend scaffolding with React Router, auth, and stub pages"
```

---

## Task 19: Frontend — Login & Setup Pages

**Files:**
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/pages/Setup.tsx`

- [ ] **Step 1: Build Login page**

Dark theme card centered on screen. Email + password fields. Error display. Redirect to `/dashboard` on success. Link to `/setup` if first-time.

Use shadcn/ui `Card`, `Input`, `Button`, `Label` components.

- [ ] **Step 2: Build Setup page**

Similar layout. Name + email + password fields. Creates superadmin. Redirects to `/dashboard`. Disabled if setup already complete (show message + link to login).

- [ ] **Step 3: Verify in browser**

```bash
cd frontend && npm run dev
```

Open browser, verify login/setup pages render correctly with dark theme.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: login and setup pages with dark theme"
```

---

## Task 20: Frontend — Layout & Dashboard

**Files:**
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Build Layout with sidebar**

Dark sidebar with nav links: Dashboard, Databases, Agents, Audit, Users (admin+ only), Settings. Top bar with user name + logout. `<Outlet />` in main area.

Use shadcn/ui components. Clean, professional dark design.

- [ ] **Step 2: Build Dashboard page**

Four stat cards: Queries Today, Denied Today, Active Agents, Total Databases. Fetch from `/admin/api/dashboard/stats`.

- [ ] **Step 3: Verify in browser**

Navigate through sidebar links. Dashboard shows stats (will show zeros without data).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: layout sidebar and dashboard page"
```

---

## Task 21: Frontend — Databases Page

**Files:**
- Create: `frontend/src/pages/Databases.tsx`

- [ ] **Step 1: Build Databases page**

- Table listing databases (name, host, port, db_name, username)
- "Add Database" button → dialog with form fields
- Test Connection button per row
- Edit/Delete actions per row
- Use shadcn/ui `Dialog`, `Table`, `Button`, `Input`

- [ ] **Step 2: Verify in browser**

CRUD operations work. Test connection shows result.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: databases management page"
```

---

## Task 22: Frontend — Agents Page

**Files:**
- Create: `frontend/src/pages/Agents.tsx`

- [ ] **Step 1: Build Agents page**

- Table listing agents (name, status, created date)
- "Create Agent" button → dialog → shows API key in modal (with copy button) on success
- "Regenerate Key" button per row → confirmation dialog → shows new key
- Toggle active/inactive
- Assign databases to agent (multi-select or separate dialog)
- Link to policies per agent+database

- [ ] **Step 2: Verify in browser**

Agent creation shows API key. Regenerate works. Database assignment works.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: agents management page with API key display"
```

---

## Task 23: Frontend — Agent Policies Page

**Files:**
- Create: `frontend/src/pages/AgentPolicies.tsx`

- [ ] **Step 1: Build AgentPolicies page**

- URL: `/agents/:agentId/databases/:dbId/policies`
- "Introspect" button fetches tables+columns from target DB
- Table listing policies (table_name, operations, columns, row_limit, where_required)
- Add/Edit policy dialog with:
  - Table name (dropdown from introspected tables)
  - Operations checkboxes (SELECT, INSERT, UPDATE, DELETE)
  - Allowed columns multi-select (from introspected columns, or null=all)
  - Row limit number input
  - WHERE required toggle
- Delete policy

- [ ] **Step 2: Verify in browser**

Introspect fetches real schema. Policy CRUD works.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: agent policy configuration page with DB introspection"
```

---

## Task 24: Frontend — Audit & Users Pages

**Files:**
- Create: `frontend/src/pages/Audit.tsx`
- Create: `frontend/src/pages/Users.tsx`
- Create: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Build Audit page**

- Table with columns: time, agent, database, operation, SQL (truncated), status, rows affected
- Filters: agent dropdown, database dropdown, operation, status, date range
- Expandable rows showing full SQL, before/after data diff (JSON viewer)
- "Export CSV" button
- Pagination

- [ ] **Step 2: Build Users page (admin+ only)**

- Table: name, email, role, status, created date
- "Create User" button → dialog (name, email, password, role dropdown)
- Edit role (admin/user toggle)
- Activate/deactivate toggle

- [ ] **Step 3: Build Settings page**

- Change password form (current password + new password + confirm)
- Profile info display

- [ ] **Step 4: Verify all pages in browser**

Navigate through all pages. CRUD operations work.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: audit log viewer, user management, and settings pages"
```

---

## Task 25: Integration & End-to-End Verification

**Files:**
- Modify: `src/index.ts` (final wiring)
- Modify: `package.json` (build scripts)

- [ ] **Step 1: Set up Vite proxy for development**

In `frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			"/api": "http://localhost:3000",
			"/admin/api": "http://localhost:3000",
		},
	},
});
```

- [ ] **Step 2: Create local MySQL database**

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS eko_connector_admin;"
```

- [ ] **Step 3: Run migrations**

```bash
cp .env.example .env  # edit with real credentials
npx tsx src/db/migrate.ts
```

- [ ] **Step 4: Start backend + frontend**

Terminal 1:
```bash
npm run dev
```

Terminal 2:
```bash
cd frontend && npm run dev
```

- [ ] **Step 5: End-to-end test flow**

1. Open browser → `/setup` → create superadmin
2. Login as superadmin
3. Add a target MySQL database → test connection
4. Create an agent → copy API key
5. Assign database to agent
6. Add policies (e.g., SELECT + UPDATE on specific table)
7. Test via curl:
   ```bash
   curl -X POST http://localhost:3000/api/v1/query \
     -H "Content-Type: application/json" \
     -H "X-API-Key: <your-key>" \
     -d '{"sql": "SELECT * FROM <table>"}'
   ```
8. Verify audit log shows the query
9. Test denied query (wrong table, blocked operation)
10. Verify denial in audit log

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: integration wiring and dev environment setup"
```

---

## Task 26: Production Build & Final Polish

**Files:**
- Modify: `package.json`
- Create: `Dockerfile` (optional)

- [ ] **Step 1: Configure production build**

Update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "cd frontend && npm run build && tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  }
}
```

- [ ] **Step 2: Verify production build**

```bash
npm run build
npm run start
```

Expected: server starts, serves frontend at root, APIs work.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: production build configuration"
```
