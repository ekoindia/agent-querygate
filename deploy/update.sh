#!/bin/sh
# VM auto-updater: deploy whatever the `release` branch points at (CI
# fast-forwards it only after tests pass). Builds locally — no registry.
# Run from cron, e.g.:
#   */5 * * * * /opt/agent-querygate/deploy/update.sh >> /var/log/querygate-deploy.log 2>&1
# Requirements: checkout on the `release` branch with NO local tracked edits.
set -eu

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Single instance at a time (cron overlap guard). flock ships with util-linux
# (any Linux VM); absent elsewhere (macOS dev) the lock is skipped.
if command -v flock >/dev/null 2>&1; then
	exec 9>"/tmp/querygate-update.lock"
	if ! flock -n 9; then
		echo "Another update is already running — skipping." >&2
		exit 0
	fi
fi

# Image ID of the running app container (empty when not yet running).
app_image_id() {
	cid=$(docker compose ps -q app 2>/dev/null) || return 0
	[ -n "$cid" ] && docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || true
}

# FETCH_HEAD avoids depending on the remote's fetch refspec config.
git fetch -q origin release
current=$(git rev-parse HEAD)
target=$(git rev-parse FETCH_HEAD)

if [ "$current" = "$target" ]; then
	# Nothing new — still `up` so the stack recovers after a reboot.
	docker compose up -d
	echo "$(date -u +%FT%TZ) no change ($current)"
	exit 0
fi

# Fails loudly on local tracked edits or diverged history — fix the checkout
# rather than force it. A failed pull/build leaves the running stack untouched.
git pull --ff-only

before=$(app_image_id)
docker compose up -d --build
after=$(app_image_id)

echo "$(date -u +%FT%TZ) deployed $current -> $target (app image ${before:-none} -> $after)"

# Dangling (untagged) images only — superseded querygate:local layers.
# NOTE: host-wide; harmless garbage removal, but builds in progress on a
# shared host could be affected. Build cache grows separately — run
# `docker builder prune` manually if disk fills.
docker image prune -f >/dev/null
