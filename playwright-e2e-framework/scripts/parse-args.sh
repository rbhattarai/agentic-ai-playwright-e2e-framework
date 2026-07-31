#!/usr/bin/env bash
# ===========================================================
# PARSE COMMAND LINE ARGUMENTS
# ===========================================================
# This script parses command line arguments for run_test.sh
# Usage: source scripts/parse-args.sh "$@"

# Initialize variables
TAG="@SmokeTest"   # default tag
ENV=""
APPS=""            # Optional: If not provided, will use all apps from apps.config.json
WORKERS="1"       # Default to 1 worker for better stability in CI/CD

# Parse arguments
for arg in "$@"; do
  case $arg in
    -tags=*|--tags=*)
      TAG="${arg#*=}"
      ;;
    -env=*|--env=*|--environment=*)
      ENV="${arg#*=}"
      ;;
    -apps=*|--apps=*)
      APPS="${arg#*=}"
      ;;
    -workers=*|--workers=*)
      WORKERS="${arg#*=}"
      ;;
    -h|--help)
      echo ""
      echo "Usage: ./run_test.sh [OPTIONS]"
      echo ""
      echo "OPTIONS:"
      echo "  -apps=<app[:profile],...> Optional: Specific apps to test (default: all from apps.config.json)"
      echo "  -env=<environment>       Environment: dev, qa, uat, prod (default: dev)"
      echo "  -tags=<tags>             Test tags to run (default: @SmokeTest)"
      echo "  -workers=<number>        Number of parallel workers (default: 1)"
      echo "  -h, --help               Show this help message"
      echo ""
      echo "EXAMPLES:"
      echo ""
      echo "  Run all apps from apps.config.json:"
      echo "    ./run_test.sh -env=dev -tags=@MultiApp"
      echo ""
      echo "  Run specific apps only:"
      echo "    ./run_test.sh -apps=loan-app,cms-app -env=dev -tags=@LoanWorkflow"
      echo ""
      echo "  Run specific app profiles:"
      echo "    ./run_test.sh -apps=loan-app:admin,cms-app:user -env=dev -tags=@LoanWorkflow"
      echo ""
      echo "  Run with defaults (all apps, dev env, @SmokeTest tag):"
      echo "    ./run_test.sh"
      echo ""
      echo "NOTE: Apps and their certificate configuration are defined in apps.config.json"
      echo ""
      exit 0
      ;;
  esac
done

# Export parsed variables
export TAG
export ENV
export APPS
export WORKERS
echo "📋 Parsed arguments:"
echo "   ENV:  ${ENV:-dev (default)}"
echo "   TAGS: ${TAG}"
echo "   WORKERS: ${WORKERS}"
if [ -n "$APPS" ]; then
  echo "   APPS: ${APPS}"
else
  echo "   APPS: All apps from apps.config.json"
fi
