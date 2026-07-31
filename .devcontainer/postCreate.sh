#!/usr/bin/env bash
# One-time Codespace setup: installs deps, brings up the demo-loan-app sample
# apps (already a sibling folder in this same repo checkout), and writes a
# working .dev.env — so a fresh Codespace goes straight to a runnable smoke
# test. The mTLS demo cert itself ships committed in playwright-e2e-framework/certs/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRAMEWORK_DIR="$REPO_ROOT/playwright-e2e-framework"
DEMO_APP_DIR="$REPO_ROOT/demo-loan-app"

echo "==> [1/5] Installing playwright-e2e-framework dependencies"
cd "$FRAMEWORK_DIR"
npm ci
npx playwright install --with-deps chromium

echo "==> [2/5] Installing Claude Code CLI"
npm install -g @anthropic-ai/claude-code

echo "==> [3/5] Starting demo-loan-app via Docker Compose"
(cd "$DEMO_APP_DIR" && docker compose up -d --build)

echo "==> Checking mTLS demo cert (tracked in git, matches apps.config.json's cn=aosqa.p* profile)"
if [ ! -f "$FRAMEWORK_DIR/certs/cn=aosqa.pfx" ]; then
  echo "   WARNING: certs/cn=aosqa.pfx not found — cert conversion in run_test.sh will fail."
  echo "   Make sure certs/ was committed and this Codespace has the latest clone."
fi

echo "==> [4/5] Writing workshop .dev.env (headless — no display in Codespaces)"
cd "$FRAMEWORK_DIR"
if [ ! -f .dev.env ]; then
  cat > .dev.env <<'EOF'
CI=false
ENV=dev
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT=30000
APP_NAME="Playwright E2E Framework"

LOAN_APP_URL=https://localhost:3000
LENDING_APP_URL=https://localhost:3001
LOAN_CERT_P12_BASE64=Y2hhbmdlbWUK
LENDING_CERT_P12_BASE64=Y2hhbmdlbWUK

APP_URL=https://localhost:3000/index
CERT_P12_BASE64=Y2hhbmdlbWUK
EOF
  echo "   wrote .dev.env"
else
  echo "   .dev.env already exists, leaving it alone"
fi

echo "==> [5/5] Waiting for sample apps to come up"
for url in https://localhost:3000 https://localhost:3001; do
  ok=""
  for _ in $(seq 1 30); do
    code="$(curl -sk -o /dev/null -w "%{http_code}" "$url" || true)"
    if [ "$code" = "200" ] || [ "$code" = "302" ]; then
      ok=1
      break
    fi
    sleep 2
  done
  if [ -n "$ok" ]; then
    echo "   $url is up"
  else
    echo "   WARNING: $url did not respond in time — check 'docker compose logs' in demo-loan-app/"
  fi
done

echo ""
echo "Setup complete. Try:"
echo "  cd playwright-e2e-framework"
echo "  npx playwright test --grep @SmokeTest"
echo "  npm run test:ui        # visual mode, view via the forwarded port 8080"
echo "  claude                 # log in / set ANTHROPIC_API_KEY, then drive the AI agents"
echo ""
echo "Browse the apps via the Ports panel — forwarded ports 3100 (loan-webapp) and"
echo "3101 (lending-webapp), NOT 3000/3001 directly (those are HTTPS-only; the"
echo "Codespaces forwarding proxy can't reach them — see .devcontainer/https-bridge.js)."
