#!/usr/bin/env bash
# Runs every time the Codespace (re)starts, not just on first creation —
# makes sure the demo apps are up after a stop/resume.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_APP_DIR="$REPO_ROOT/demo-loan-app"

if [ -d "$DEMO_APP_DIR" ]; then
  (cd "$DEMO_APP_DIR" && docker compose up -d)
fi

# Browser-facing HTTP->HTTPS bridge (see https-bridge.js), run as its own
# long-lived container rather than a backgrounded OS process. Verified live
# that neither `nohup ... &` nor `setsid` survive postStartCommand
# returning — the devcontainer CLI kills the whole cgroup the lifecycle
# hook ran in, which takes detached children with it regardless of session
# ID. A real `docker run -d` container is managed by dockerd itself, same
# as the demo-loan-app containers above, which do survive.
if ! docker ps --format '{{.Names}}' | grep -qx https-bridge; then
  docker rm -f https-bridge > /dev/null 2>&1 || true
  docker run -d --name https-bridge --network host --restart unless-stopped \
    -v "$REPO_ROOT/.devcontainer/https-bridge.js:/https-bridge.js:ro" \
    node:22-alpine node /https-bridge.js > /dev/null
fi
