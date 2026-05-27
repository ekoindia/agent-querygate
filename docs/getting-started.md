# Getting Started

This guide walks you through installing, configuring, and running the Agent QueryGate from scratch.

## Prerequisites

- **Node.js** 20 or later
- **MySQL** 8.0 or later
- **npm** (included with Node.js)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-querygate

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

## Environment Variables

Copy the example file and edit it:

```bash
cp .env.example .env
```

| Variable | Description | Default | Required |
|---|---|---|---|
| `ADMIN_DB_HOST` | MySQL host for the admin database | `localhost` | No |
| `ADMIN_DB_PORT` | MySQL port for the admin database | `3306` | No |
| `ADMIN_DB_NAME` | Admin database name | `querygate_admin` | No |
| `ADMIN_DB_USER` | MySQL user for the admin database | `root` | No |
| `ADMIN_DB_PASSWORD` | MySQL password for the admin database | (empty) | No |
| `JWT_SECRET` | Secret for signing JWT tokens (min 16 chars) | -- | **Yes** |
| `ENCRYPTION_KEY` | Hex-encoded 32-byte key for AES-256-GCM encryption | -- | **Yes** |
| `PORT` | HTTP server port | `3000` | No |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` | No |

### Generating secure values

```bash
# Generate a JWT secret (64 random characters)
openssl rand -base64 48

# Generate an encryption key (32 bytes as hex = 64 hex characters)
openssl rand -hex 32
```

## Database Setup

1. Create the admin database in MySQL:

```sql
CREATE DATABASE querygate_admin;
```

2. Generate and run Drizzle migrations:

```bash
# Generate migration files from the schema
npm run db:generate

# Apply migrations to the database
npm run db:migrate
```

Migrations are stored in `./drizzle/migrations` and managed by Drizzle Kit.

## First-Run Walkthrough

### 1. Start the service

```bash
npm run dev
```

### 2. Open the admin UI

Navigate to `http://localhost:3000` in your browser. The app will detect that no users exist and redirect you to the setup page.

### 3. Create the superadmin account

Fill in your name, email, and password (minimum 8 characters). This creates the first user with the `superadmin` role and logs you in automatically.

### 4. Add a target database

Go to the **Databases** page and add a MySQL database you want agents to query. Provide the connection details (host, port, database name, username, password). Use **Test Connection** to verify connectivity.

### 5. Create an agent

Go to the **Agents** page and create a new agent. The API key is displayed once -- copy and store it securely. This key is used by AI agents (or the MCP server) to authenticate against the Agent API.

### 6. Grant database access and configure policies

Link the agent to the database, then define policies that control which tables and operations the agent can perform. See the [Admin Guide](admin-guide.md) for detailed instructions.

## Development Mode

Development requires two terminals: one for the backend and one for the frontend dev server with hot reload.

**Terminal 1 -- Backend:**

```bash
npm run dev
```

This runs `tsx watch src/index.ts`, which watches for file changes and restarts the server automatically. The backend serves on port 3000.

**Terminal 2 -- Frontend:**

```bash
npm run dev:frontend
```

This runs the Vite dev server (typically on port 5173) with a proxy that forwards `/api` and `/admin/api` requests to `http://localhost:3000`.

Open `http://localhost:5173` during development for hot module replacement.

## Production Deployment

### Build

```bash
npm run build
```

This command:
1. Builds the frontend (`cd frontend && npm run build`) -- output goes to `frontend/dist/`
2. Compiles TypeScript (`tsc`) -- output goes to `dist/`

### Start

```bash
NODE_ENV=production node dist/index.js
```

In production, the Hono server serves the compiled frontend SPA from `frontend/dist/` as static files, so no separate frontend server is needed.

### HTTPS and Reverse Proxy

The service does not handle TLS directly. In production, place it behind a reverse proxy such as Nginx or Caddy:

```nginx
server {
	listen 443 ssl;
	server_name your-domain.com;

	ssl_certificate /path/to/cert.pem;
	ssl_certificate_key /path/to/key.pem;

	location / {
		proxy_pass http://127.0.0.1:3000;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}
```

When `NODE_ENV=production`, the JWT cookie is set with `secure: true`, which requires HTTPS.

## Next Steps

- [API Reference](api-reference.md) -- full endpoint documentation
- [Admin Guide](admin-guide.md) -- managing users, databases, agents, and policies
- [MCP Integration](mcp-integration.md) -- connecting AI assistants via MCP
- [Security](security.md) -- security architecture and best practices
