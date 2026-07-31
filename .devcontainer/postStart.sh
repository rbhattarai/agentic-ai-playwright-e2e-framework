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
# setsid (not just nohup/&) is required: the devcontainer CLI tears down the
# whole process group when this lifecycle hook exits, which kills a plain
# `nohup ... &` child too — setsid detaches it into its own session so it
# survives postStartCommand returning.
if ! pgrep -f "node .*https-bridge.js" > /dev/null; then
  setsid nohup node "$REPO_ROOT/.devcontainer/https-bridge.js" > /tmp/https-bridge.log 2>&1 < /dev/null &
fi
