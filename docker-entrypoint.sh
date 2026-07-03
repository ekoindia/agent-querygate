#!/bin/sh
set -e

# Env vars are injected by the container runtime (compose env_file), so no
# --env-file here. Use the local tsx binary directly — never `npx` (which can
# trigger a network install if the package is missing).
TSX="./node_modules/.bin/tsx"

# Wait for the admin DB to accept connections, then run migrations before boot.
# ponytail: fixed retry loop, not a wait-for-it dependency. Bump attempts if a
# cold MySQL volume needs longer to initialise.
attempts=0
until "$TSX" src/db/migrate.ts; do
	attempts=$((attempts + 1))
	if [ "$attempts" -ge 30 ]; then
		echo "Migrations failed after $attempts attempts — giving up." >&2
		exit 1
	fi
	echo "DB not ready (attempt $attempts/30) — retrying in 2s..." >&2
	sleep 2
done

exec "$TSX" src/index.ts
