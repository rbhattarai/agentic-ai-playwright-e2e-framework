#!/usr/bin/env bash
# ===========================================================
# PLAYWRIGHT E2E TEST RUNNER
# ===========================================================
# Main test execution script
# Supports both multi-app and legacy single-app modes

set -euo pipefail

# ===========================================================
# PARSE ARGUMENTS
# ===========================================================
source scripts/parse-args.sh "$@"

# ===========================================================
# SETUP ENVIRONMENT
# ===========================================================
source scripts/setup-env.sh

# ===========================================================
# CONFIGURE APPS & CERTIFICATES
# ===========================================================
source scripts/multi-app-setup.sh

# Validate apps.config.json exists
if [ ! -f "apps.config.json" ]; then
  echo ""
  echo "❌ ERROR: apps.config.json not found!"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Please create apps.config.json with your app configurations."
  echo "See apps.config.json in the repository for examples."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  exit 1
fi

# Setup apps (will use all apps if -apps flag not provided)
setup_multi_app "$APPS"

# ===========================================================
# PREPARE REPORTS DIRECTORY
# ===========================================================
echo "📁 Preparing reports directory..."
rm -rf reports/* 2>/dev/null || true
rm -rf test-results/* 2>/dev/null || true
mkdir -p reports
mkdir -p reports/step-report

# ===========================================================
# RUN PLAYWRIGHT TESTS
# ===========================================================
echo ""
echo "🎭 RUNNING PLAYWRIGHT TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Environment: $ENV"
echo "   Tags:        $TAG"
echo "   Headless:    ${PLAYWRIGHT_HEADLESS:-false}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -n "$TAG" ]; then
  # Run tests matching the specified tag/grep pattern with controlled workers
  npx playwright test --grep "$TAG" --workers="${WORKERS}"
else
  # Run all tests by default
  npx playwright test --workers="${WORKERS}"
fi

# ===========================================================
# REPORTS & NOTIFICATIONS
# ===========================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 REPORTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f reports/results.json ]; then
  echo "✅ HTML Report:     reports/index.html"
  echo "✅ Step Report:     reports/step-report/index.html"
  echo "✅ Coverage Report: reports/coverage-report.html"
  echo "✅ JSON Results:    reports/results.json"
  echo "✅ JUnit XML:       reports/junit.xml"
else
  echo "⚠️  Reports not found - check test execution"
fi

# Optional: Upload results to XRay (only in CI/CD)
# echo ""
# echo "📤 Uploading results to Xray..."
# npm run xray:upload || echo "⚠️  Xray upload skipped or failed"

# Send email notification (local only)
if [ "$CI" = "false" ]; then
  echo ""
  echo "📧 Sending email notification..."
  # npm run send-report || echo "⚠️  Email notification skipped"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ TEST RUN COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
