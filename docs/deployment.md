# Deployment

agent-querygate is a **long-lived stateful server**: it holds persistent
`mysql2` connection pools to the databases it guards and encrypts stored
credentials at rest. That rules out serverless platforms (Vercel/Netlify
functions) — pools don't survive between invocations, and a DB security
gateway should not sit behind public serverless egress reaching into your
databases. Run it as a **persistent container you control**.

This repo ships a Docker image + Compose stack that runs identically on a
laptop, any VPS, or a free cloud VM.

## Why `tsx` in production (not `node dist`)

`tsc` does **not** rewrite the `@/*` path aliases from `tsconfig.json`, so a
compiled `dist/index.js` keeps literal `import ... from "@/config.js"` that
Node cannot resolve. Rather than add a build-time alias rewriter, production
runs the TypeScript source directly with **`tsx`** (a runtime dependency, so
`npm ci --omit=dev` keeps it). `npm run typecheck` (`tsc --noEmit`) still
provides full type checking for CI; it just doesn't emit the runtime artifact.

## Quick start (Docker Compose)

Bundles the app + its admin/backing MySQL with a persistent volume. The
databases the gateway *queries* are configured later via the admin UI and live
wherever they already are — only the admin DB is bundled.

```sh
cp .env.docker.example .env
# edit .env — set MYSQL_ROOT_PASSWORD, DB_PASSWORD, and generate secrets:
#   openssl rand -base64 48   # JWT_SECRET
#   openssl rand -base64 32   # ENCRYPTION_KEY
docker compose up -d --build
```

On start the app container waits for MySQL, runs Drizzle migrations
(`src/db/migrate.ts`), then boots. Verify:

```sh
curl http://localhost:3000/api/v1/health   # -> 200
curl http://localhost:3000/                 # -> serves the SPA
docker compose logs -f app                  # -> "Server starting on port 3000"
```

Data persists in the `querygate-data` volume across `docker compose restart`.

## Free hosting target: Oracle Cloud Always Free

Best $0 option that fits a persistent process. **Subject to Oracle's Always
Free availability and terms** — Ampere A1 capacity can be scarce by region and
resources are governed by Oracle's account rules, so treat "free forever" as
best-effort, not a guarantee.

1. Create an **Ampere A1 (arm64)** compute instance (the image builds the same
   on arm64 — all deps are pure JS, no native toolchain).
2. Install Docker + the compose plugin.
3. Clone the repo, `cp .env.docker.example .env`, fill in secrets.
4. `docker compose up -d --build`.
5. Open the app to your ingress — but **do not expose `:3000` directly** (see
   TLS below).

Any other VPS (Fly.io, Hetzner, a Raspberry Pi, a box inside your org network)
uses the exact same Compose flow. For an internal DB gateway, **running inside
the org network is the strongest posture** — the gateway sits next to the DBs
and never touches the public internet.

## Auto-deploy from GitHub (intranet VM)

The gateway usually runs on a VM **inside the org network** (it must reach the
internal databases). GitHub cannot push into an intranet, so deploys are
**pull-based** — and registry-free: **only code lives on GitHub**, no images
or internal artifacts are published anywhere. The VM builds from source.

```
push to main → GitHub Actions (tests must pass) → fast-forward `release` branch
                                                        ↑ poll every 5 min
                 intranet VM: cron → deploy/update.sh (git pull + local build)
```

The `promote` job in `.github/workflows/ci.yml` runs only after the `test`
job passes and simply pushes the tested commit to the `release` branch —
broken code never reaches the VM. The branch is created by the first
successful run. **Do not add branch protection on `release`**, or the
`GITHUB_TOKEN` push will be rejected. If two pushes to `main` race, the older
run's non-fast-forward push fails — expected and harmless (the newer commit
is already promoted).

> **Why not a self-hosted runner?** On a public repo, fork PRs can execute
> code on your runner — i.e. inside your intranet. Pull-based deploy needs
> only *outbound* HTTPS from the VM and exposes nothing.

### One-time VM setup

1. Install Docker + the compose plugin.
2. Clone (anonymous — repo is public, no credentials on the VM) and track
   `release`:

   ```sh
   git clone <repo-url> /opt/agent-querygate && cd /opt/agent-querygate
   git switch release   # or: git switch --track origin/release
   ```

   `release` must already exist — merge to `main` once first so CI creates
   it. Keep the checkout clean: **no local edits to tracked files**, or
   `git pull --ff-only` in the updater fails (loudly, by design).
3. `cp .env.docker.example .env`, fill in secrets.
4. First start: `docker compose up -d --build`.
5. Add the cron line:

```sh
*/5 * * * * /opt/agent-querygate/deploy/update.sh >> /var/log/querygate-deploy.log 2>&1
```

`deploy/update.sh` is flock-guarded and idempotent: fetch `release` → if the
sha changed, `git pull --ff-only` and `docker compose up -d --build`;
otherwise a cheap `up -d` (recovers the stack after a VM reboot). It logs
old sha → new sha and the app image ID on every deploy, and prunes dangling
images left behind by superseded builds. A failed pull or build **leaves the
running stack untouched** — the old containers keep serving. Prefer systemd?
A timer unit calling the same script works identically (journal logging for
free).

Requirements: outbound HTTPS from the VM to `github.com`,
`registry.npmjs.org` (npm ci during the build), and Docker Hub (base
images); ~2 GB free RAM for the frontend build. Deploy lag ≤ the poll
interval (5 min above). Docker's build cache grows over time — run
`docker builder prune` manually if disk fills.

### Rollback

Preferred (it's a public FOSS repo — keep history honest): `git revert` the
bad commit on `main`, push; CI tests it, promotes it, and the VM deploys the
revert within the poll interval.

Emergency (skip CI): pin the VM to the last good sha, then return to the
branch when done — a detached checkout makes the updater's `git pull` fail
(loudly) until you switch back:

```sh
crontab -e                      # comment out the updater line
git switch --detach <good-sha>
docker compose up -d --build
# ...when fixed:
git switch release && crontab -e   # re-enable the updater
```

### Troubleshooting

- **promote job push rejected**: `release` has branch protection (remove
  it), or Settings → Actions → General → Workflow permissions doesn't allow
  write.
- **updater exits with git error**: local tracked edits, diverged history,
  or detached HEAD on the VM checkout; `git status`, then reset to a clean
  `release` (`git switch release && git reset --hard origin/release`).
- **build fails on the VM (npm/Docker Hub outage, OOM)**: old stack keeps
  running; the next cron run retries automatically.

## TLS / reverse proxy (recommended, not optional in production)

An admin/security gateway should **not** serve plain HTTP on a public port.
Front it with a reverse proxy that terminates TLS. Caddy is the least-effort
path — automatic HTTPS from a hostname:

```
# Caddyfile
gateway.example.org {
	reverse_proxy localhost:3000
}
```

Then bind the app to localhost only (drop the `3000:3000` publish, or use
`127.0.0.1:3000:3000`) so the proxy is the only public entrypoint, and set
`ALLOWED_ORIGINS=https://gateway.example.org` in `.env`. nginx works too;
Caddy just needs less config for automatic certs.

## Configuration reference

| Var | Set by | Notes |
|-----|--------|-------|
| `ADMIN_DB_HOST/PORT/NAME/USER/PASSWORD` | compose (`ADMIN_DB_PASSWORD` = `DB_PASSWORD` from `.env`) | Admin/backing DB. User is `querygate`, not root. |
| `MYSQL_ROOT_PASSWORD` | `.env` | MySQL 8 requires it; used only inside the DB container + healthcheck. |
| `JWT_SECRET` | `.env` | Session tokens. `openssl rand -base64 48`. |
| `ENCRYPTION_KEY` | `.env` | Encrypts stored target-DB credentials at rest. `>=32` chars. |
| `ALLOWED_ORIGINS` | `.env` | CORS allow-list. Must include every browser origin that calls the API. |
| `NODE_ENV` / `PORT` | compose | `production` / `3000`. |

## Why not Vercel / serverless

| | Vercel Pro | Oracle Always Free (or self-host) |
|---|---|---|
| Cost | $0 extra within existing $20 quota | $0 (subject to availability) |
| Persistent `mysql2` pools | ✗ recycled between invocations | ✓ long-lived process |
| Backing MySQL | external, extra service | bundled in Compose |
| DB-credential exposure | public egress into your DBs | in your control / org network |
| Code changes | rewrite entry + driver | none — runs unchanged |

Cost is a wash within the Pro plan; the deciding factors are **architecture
fit** and **keeping internal-DB credentials off public infrastructure**.
