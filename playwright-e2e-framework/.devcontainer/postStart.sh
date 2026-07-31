#!/usr/bin/env bash
# Runs every time the Codespace (re)starts, not just on first creation —
# makes sure the demo apps are up after a stop/resume.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_APP_DIR="$REPO_ROOT/../demo-loan-app"

if [ -d "$DEMO_APP_DIR" ]; then
  (cd "$DEMO_APP_DIR" && docker compose up -d)
fi
