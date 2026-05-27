# Development

This guide covers the development workflow, project structure, testing, and conventions for contributing to the Eko MySQL Agent Connector Service.

## Dev Environment Setup

### Prerequisites

- Node.js 20+
- MySQL 8.0+
- npm (included with Node.js)

### Initial Setup

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Copy environment configuration
cp .env.example .env
# Edit .env with your local database credentials and secrets

# Create the admin database
mysql -u root -e "CREATE DATABASE IF NOT EXISTS eko_connector_admin;"

# Run migrations
npm run db:migrate
```

### Running in Development

Open two terminals:

```bash
# Terminal 1: Backend (auto-restarts on file changes)
npm run dev

# Terminal 2: Frontend (hot module replacement)
npm run dev:frontend
```

The backend runs on port 3000. The frontend dev server (Vite) runs on port 5173 and proxies API requests to the backend.

## Project Structure

```
eko-mysql-agent-connector-service/
+-- src/
|   +-- index.ts              # Application entry point, route mounting
|   +-- config.ts             # Environment variable loading and validation
|   +-- auth/
|   |   +-- jwt.ts            # JWT sign/verify
|   |   +-- api-key.ts        # API key generation, hashing, verification
|   |   +-- password.ts       # bcrypt hash/verify
|   |   +-- middleware.ts     # Hono auth middleware (adminAuth, agentAuth)
|   +-- db/
|   |   +-- schema.ts         # Drizzle ORM table definitions
|   |   +-- connection.ts     # Admin database singleton pool
|   |   +-- migrate.ts        # Migration runner script
|   +-- routes/
|   |   +-- admin/
|   |   |   +-- auth.ts       # Login, logout, setup, me
|   |   |   +-- users.ts      # User CRUD
|   |   |   +-- databases.ts  # Database CRUD, test, introspect
|   |   |   +-- agents.ts     # Agent CRUD, key rotation, DB access
|   |   |   +-- policies.ts   # Policy CRUD
|   |   |   +-- audit.ts      # Audit log list, export, detail
|   |   |   +-- dashboard.ts  # Dashboard statistics
|   |   +-- agent/
|   |       +-- query.ts      # POST /api/v1/query (SELECT)
|   |       +-- execute.ts    # POST /api/v1/execute (INSERT/UPDATE/DELETE)
|   |       +-- tables.ts     # GET /api/v1/tables, /tables/:name/schema
|   |       +-- health.ts     # GET /api/v1/health
|   +-- policy/
|   |   +-- engine.ts         # Policy evaluation logic
|   |   +-- blocked-keywords.ts # Dangerous SQL pattern detection
|   |   +-- sql-parser.ts     # SQL to ParsedQuery via node-sql-parser
|   +-- query/
|   |   +-- executor.ts       # Read/write query execution
|   |   +-- pool-manager.ts   # Per-database connection pool cache
|   |   +-- snapshot.ts       # Before/after data capture
|   +-- audit/
|   |   +-- logger.ts         # Audit log writer
|   +-- mcp/
|   |   +-- server.ts         # MCP server with 5 tools
|   +-- lib/
|       +-- types.ts          # Shared TypeScript interfaces
|       +-- errors.ts         # AppError class and factory functions
|       +-- crypto.ts         # AES-256-GCM encrypt/decrypt
+-- frontend/
|   +-- src/
|   |   +-- pages/            # React page components
|   |   +-- components/       # Reusable UI components (shadcn)
|   |   +-- lib/
|   |   |   +-- api.ts        # HTTP client (get, post, put, del)
|   |   |   +-- utils.ts      # Utility functions
|   |   +-- App.tsx           # Router and layout
|   +-- vite.config.ts        # Vite config with API proxy
|   +-- package.json
+-- tests/
|   +-- setup.ts              # Test environment setup
|   +-- auth/                 # Auth module tests
|   +-- lib/                  # Lib module tests
|   +-- policy/               # Policy engine tests
+-- drizzle/
|   +-- migrations/           # Generated SQL migration files
+-- drizzle.config.ts         # Drizzle Kit configuration
+-- package.json
+-- tsconfig.json
+-- .env.example
```

## Running Tests

The project uses [Vitest](https://vitest.dev/) as the test runner.

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run a specific test file
npx vitest run tests/policy/engine.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose -t "blocked keywords"
```

### Test Structure

Tests mirror the `src/` directory:

```
tests/
+-- auth/
|   +-- api-key.test.ts       # API key generation and hashing
|   +-- jwt.test.ts           # JWT sign/verify
|   +-- password.test.ts      # bcrypt hash/verify
+-- lib/
|   +-- crypto.test.ts        # AES-256-GCM encrypt/decrypt
+-- policy/
|   +-- blocked-keywords.test.ts  # Blocked keyword detection
|   +-- engine.test.ts            # Policy evaluation logic
|   +-- sql-parser.test.ts        # SQL parsing
+-- setup.ts                  # Test environment configuration
```

Tests are unit-focused and do not require a running database. They test the pure logic layers (policy engine, crypto, auth utilities).

## Adding New API Endpoints

Follow this pattern when adding a new endpoint:

### 1. Define the route file

Create a new file in `src/routes/admin/` or `src/routes/agent/`:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { adminAuth } from "@/auth/middleware.js";
import type { AppEnv } from "@/lib/types.js";

const myRoutes = new Hono<AppEnv>();

// Apply auth middleware
myRoutes.use("*", adminAuth);

// Define request validation schema
const createSchema = z.object({
	name: z.string().min(1),
});

// Implement the handler
myRoutes.post("/", zValidator("json", createSchema), async (c) => {
	const body = c.req.valid("json");
	const db = c.get("db");
	const user = c.get("user");

	// ... implementation ...

	return c.json({ result: "..." }, 201);
});

export default myRoutes;
```

### 2. Mount in index.ts

```typescript
import myRoutes from "@/routes/admin/my-feature.js";

app.route("/admin/api/my-feature", myRoutes);
```

### 3. Key conventions

- Always use Zod for request body validation via `zValidator`.
- Access the database via `c.get("db")` and config via `c.get("config")`.
- Use `Errors.badRequest()`, `Errors.notFound()`, etc. from `@/lib/errors.js` for error responses.
- Apply `adminAuth` for admin routes or `agentAuth` for agent routes.
- Generate UUIDs with `v4()` from the `uuid` package.
- Apply resource scoping for regular users (return 404, not 403, to avoid information leakage).

## Database Migrations

Migrations are managed by Drizzle Kit.

### Workflow

1. **Modify the schema** -- edit `src/db/schema.ts`
2. **Generate migration** -- creates a SQL migration file:
```bash
npm run db:generate
```
3. **Apply migration** -- runs all pending migrations:
```bash
npm run db:migrate
```

Migration files are stored in `./drizzle/migrations/` and should be committed to version control.

### Drizzle Studio

For visual database inspection during development:

```bash
npm run db:studio
```

This opens the Drizzle Studio web interface for browsing tables and data.

## Frontend Development

The frontend is a React SPA built with Vite, Tailwind CSS 4, and shadcn/ui components.

### Adding shadcn Components

```bash
cd frontend
npx shadcn add button
npx shadcn add dialog
npx shadcn add table
```

Components are added to `frontend/src/components/ui/`.

### Adding New Pages

1. Create the page component in `frontend/src/pages/`:

```typescript
export default function MyPage() {
	return (
		<div>
			<h1>My Page</h1>
		</div>
	);
}
```

2. Add the route in `frontend/src/App.tsx`:

```typescript
import MyPage from "./pages/MyPage";

// Inside the router:
<Route path="/my-page" element={<MyPage />} />
```

### Making API Calls

Use the `api` helper from `frontend/src/lib/api.ts`:

```typescript
import { api } from "@/lib/api";

// GET request
const data = await api.get<{ items: Item[] }>("/items");

// POST request
const result = await api.post<{ item: Item }>("/items", { name: "New Item" });

// PUT request
await api.put<{ ok: boolean }>(`/items/${id}`, { name: "Updated" });

// DELETE request
await api.del<{ ok: boolean }>(`/items/${id}`);
```

The `api` helper:
- Prepends `/admin/api` to all paths
- Sends `credentials: "include"` for cookie auth
- Sets `Content-Type: application/json`
- Throws an `Error` with the server's error message on non-2xx responses

### Existing Pages

| Page | Path | Purpose |
|---|---|---|
| `Setup.tsx` | `/setup` | First-time superadmin creation |
| `Login.tsx` | `/login` | User authentication |
| `Dashboard.tsx` | `/dashboard` | Overview statistics |
| `Users.tsx` | `/users` | User management |
| `Databases.tsx` | `/databases` | Database management |
| `Agents.tsx` | `/agents` | Agent management |
| `AgentPolicies.tsx` | `/agents/:id/policies` | Policy management |
| `Audit.tsx` | `/audit` | Audit log viewer |
| `Settings.tsx` | `/settings` | User settings |

## Code Conventions

### Formatting

- **Tab indentation** (not spaces)
- TypeScript strict mode enabled
- No trailing semicolons are not enforced (project uses semicolons)

### TypeScript

- **Strict mode** enabled in `tsconfig.json`
- **Path aliases:** `@/*` maps to `src/*` (both backend and frontend)
- **Type hints** on all function parameters and return types
- **Interfaces** preferred over type aliases for object shapes

### Patterns

- **Functional patterns preferred** -- avoid classes where plain functions suffice
- **Zod validation** on all API inputs (request bodies, query params)
- **Error factories** -- use `Errors.badRequest()`, `Errors.notFound()` etc. rather than throwing raw errors
- **Scope filtering** -- use helper functions that return `undefined` (no filter) for admins or `eq()` for regular users

### Naming

- Files: `kebab-case.ts`
- Functions: `camelCase`
- Types/Interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for config-like values
- Database columns: `snake_case` (mapped to `camelCase` in Drizzle schema)

## Git Workflow

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user role management
fix: prevent SQL injection in snapshot query
docs: add API reference documentation
refactor: extract policy evaluation into separate module
test: add blocked keywords test cases
chore: update drizzle-orm dependency
```

### Branch Naming

- `feature/` -- new functionality
- `bugfix/` -- bug fixes
- `chore/` -- maintenance, dependency updates

## Related Documentation

- [Getting Started](getting-started.md) -- installation and first run
- [Architecture](architecture.md) -- system design and data model
- [API Reference](api-reference.md) -- endpoint documentation
- [Security](security.md) -- security considerations when developing
