#!/usr/bin/env bash
# Runs every time the Codespace (re)starts, not just on first creation —
# makes sure the demo apps are up after a stop/resume.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_APP_DIR="$REPO_ROOT/demo-loan-app"

if [ -d "$DEMO_APP_DIR" ]; then
  (cd "$DEMO_APP_DIR" && docker compose up -d)
fi

# Browser-facing HTTP->HTTPS bridge (see https-bridge.js) — restart on every
# boot since background processes don't survive a container stop/start.
if ! pgrep -f "node .*https-bridge.js" > /dev/null; then
  nohup node "$REPO_ROOT/.devcontainer/https-bridge.js" > /tmp/https-bridge.log 2>&1 &
fi
